// Traffic, bus parking & departure scenarios — zero dependencies (Node ≥ 22).
// Serves the game, drives headless Chrome over the DevTools protocol, and steps
// the simulation frame by frame through window.__Layover, auditing the traffic
// invariants after EVERY frame:
//   • at most one bus owns a maneuver reservation (parking and departure exclude each other)
//   • at most one bus is physically turning in or reversing out
//   • no two vehicles on a lane overlap, and nobody changes order on a lane
//   • no vehicle moves backwards, or into a reserved zone it was stopping for
//   • no vehicle ever overlaps a maneuvering bus's body
//   node tests/traffic.mjs            (CHROME=/path/to/chrome to override)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 8775, PORT_CDP = 9343, URL = `http://127.0.0.1:${PORT}/index.html`;
const procs = [], tmp = mkdtempSync(path.join(tmpdir(), "layover-traffic-"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.on("exit", () => {
  for (const p of procs) try { p.kill(); } catch (e) {}
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) {}
});
async function waitFor(fn, ms = 10000, what = "condition") {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* not ready */ }
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await sleep(100);
  }
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0; this.pending = new Map(); this.errors = [];
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        this.errors.push((d.exception && d.exception.description) || d.text);
      }
    };
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("page eval failed: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  }
}

let passed = 0, failed = 0;
const out = [];
function check(name, cond, detail = "") {
  if (cond) { passed++; out.push(`  ✓ ${name}${detail ? " (" + detail + ")" : ""}`); }
  else { failed++; out.push(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}
const ONLY = process.env.ONLY; // run only the scenarios whose title contains this
async function test(title, fn) {
  if (ONLY && !title.includes(ONLY)) return;
  out.push(title);
  const before = page.errors.length;
  await page.eval(`T.reset(); true`);
  try { await fn(); } catch (e) { check("no harness exception", false, e.message); }
  const v = await page.eval(`T.violations.slice(0, 6)`);
  check("traffic invariants hold every frame", v.length === 0, v.join(" | "));
  const errs = page.errors.slice(before);
  check("no page errors", errs.length === 0, errs.join(" | "));
}

/* ----------------------------- in-page test kit ----------------------------- */
// Everything here runs in the page. Positions use the game's own geometry:
// a small bus is 170 px long; bay i is centred at x = 170 + 84 i.
const KIT = String.raw`
window.T = (() => {
  const L = window.__Layover, P = L.PHASE;
  const kit = { violations: [], log: [], frames: 0 };
  let carId = 0, prev = new Map(), prevOrder = { 1: [], "-1": [] }, prevRel = new Map(), lastPhase = new Map();
  const vid = o => (o.car ? "c" + (o.ref.__id ??= ++carId) : "b" + o.ref.id);
  const fail = msg => { if (kit.violations.length < 50) kit.violations.push("f" + kit.frames + ": " + msg); };
  kit.reset = (spaces = 10) => {
    for (const k of Object.keys(kit)) if (!BUILTIN.has(k)) delete kit[k]; // per-test scratch values
    L.setAutoTraffic(false);
    L.buses().length = 0; L.setCars([]);
    L.rebuildFacilities(); // drop queued guests of the buses just removed
    L.sim().parkingSpaces = spaces;
    L.sim().slotVacantSince = null;
    kit.violations = []; kit.log = []; kit.frames = 0;
    prev = new Map(); prevOrder = { 1: [], "-1": [] }; prevRel = new Map(); lastPhase = new Map();
  };
  const KINDS = { small: 170, mid: 210, big: 250 };
  const setKind = (b, kind) => { b.kind = kind; b.len = KINDS[kind]; };
  // a bus on the road, heading 'dir', centred at cx (visiting unless through)
  kit.roadBus = (dir, cx, o = {}) => {
    L.spawnBus(null, true); // the opening-bus path: placed without a lane check (moved below)
    const b = L.buses()[L.buses().length - 1];
    setKind(b, o.kind || "small");
    b.dir = dir; b.cx = cx; b.cy = L.laneCy(b); b.ang = 0; b.v = o.v ?? 185;
    if (o.forcedSlot != null) b.forcedSlot = o.forcedSlot;
    if (o.through) { b.through = true; b.stoppedOnce = true; b.phase = null; }
    return b.id;
  };
  // a visiting bus standing still just short of its turn-in point for bay 'slot'
  kit.waitingBus = (dir, slot, kind = "small") => {
    const id = kit.roadBus(dir, 0, { kind, forcedSlot: slot, v: 0 });
    const b = kit.bus(id);
    b.cx = L.enterGeom(b, slot).x0 - dir * 1;
    return id;
  };
  // a bus parked in bay 'slot', every guest aboard, not yet due to leave
  kit.parked = (slot, dir, kind = "small") => {
    L.spawnBus(null, true); // the opening-bus path: placed without a lane check (moved below)
    const b = L.buses()[L.buses().length - 1];
    setKind(b, kind); b.dir = dir; b.slot = slot; b.stoppedOnce = true; b.forcedSlot = null;
    L.finishEnter(b);
    for (const p of b.pax) { p.disembark = false; p.forceToilet = false; }
    b.stopEnd = L.game().clock.time + 6; // hours away
    return b.id;
  };
  kit.ready = id => { const b = kit.bus(id); b.stopEnd = L.game().clock.time - 0.001; b.boardGrace = 99; };
  kit.car = (dir, x, v = 150, spd = v) => { // v: cruising speed, spd: current speed
    const c = { x, y: dir < 0 ? 462 : 514, hue: 0, v: dir * v, spd, __id: ++carId };
    L.cars().push(c);
    return c.__id;
  };
  kit.bus = id => L.buses().find(b => b.id === id);
  kit.carById = id => L.cars().find(c => c.__id === id);
  kit.x0 = (dir, slot, kind = "small") => L.enterGeom({ dir, len: KINDS[kind] }, slot).x0;
  kit.tx = slot => L.BAY_SLOTS[slot].cx;
  kit.zones = () => L.reservedZones().map(z => ({ owner: z.owner.id, dir: z.dir, l: z.l, r: z.r }));
  kit.prospective = id => L.maneuverZones(kit.bus(id), true).map(z => ({ dir: z.dir, l: z.l, r: z.r }));
  kit.phase = id => { const b = kit.bus(id); return b ? b.phase : "GONE"; };
  kit.owners = () => { const o = L.trafficOwners(); return { park: o.park && o.park.id, depart: o.depart && o.depart.id }; };

  // the lane stretch a maneuvering bus's body covers right now (no padding): its body
  // rectangle (24 px deep when level, 66 px wide when turned) sampled densely inside each lane band
  function bodySpans(b) {
    const c = Math.cos(b.ang), s = Math.sin(b.ang), hl = b.len / 2, w = 12 + 21 * Math.abs(s), spans = [];
    for (const d of [1, -1]) {
      const [y0, y1] = L.LANE_BAND[d];
      let l = Infinity, r = -Infinity;
      for (let i = 0; i <= 40; i++) for (let j = 0; j <= 8; j++) {
        const u = -hl + 2 * hl * i / 40, v = -w + 2 * w * j / 8;
        const x = b.cx + u * c - v * s, y = b.cy + u * s + v * c;
        if (y >= y0 && y <= y1) { l = Math.min(l, x); r = Math.max(r, x); }
      }
      if (l < r) spans.push({ dir: d, l, r });
    }
    return spans;
  }
  function audit() {
    const buses = L.buses(), vehicles = L.laneVehicles();
    // 1. the maneuver reservation
    const owners = buses.filter(b => [P.WAIT_PARK_CLEAR, P.PARKING, P.WAIT_DEPART_CLEAR, P.REVERSING].includes(b.phase));
    if (owners.length > 1) fail("two reservation owners: " + owners.map(b => b.id + ":" + b.phase).join(", "));
    const moving = buses.filter(b => b.state === "enter" || b.state === "exit");
    if (moving.length > 1) fail("two buses maneuvering: " + moving.map(b => b.id + ":" + b.state).join(", "));
    for (const b of buses) {
      if (b.phase === P.PARKING && b.state !== "enter") fail("bus " + b.id + " PARKING in state " + b.state);
      if (b.phase === P.REVERSING && b.state !== "exit") fail("bus " + b.id + " REVERSING in state " + b.state);
      const was = lastPhase.get(b.id);
      if (was !== b.phase) { kit.log.push({ f: kit.frames, id: b.id, from: was || null, to: b.phase }); lastPhase.set(b.id, b.phase); }
    }
    // 2. lanes: no overlap, order kept, nobody backwards
    for (const d of [1, -1]) {
      const lane = vehicles.filter(o => o.dir === d).sort((a, b) => d * (b.l - a.l)); // lead first
      for (let i = 1; i < lane.length; i++) {
        const a = lane[i - 1], b = lane[i];
        const overlap = d > 0 ? b.r - a.l : a.r - b.l;
        const desc = o => vid(o) + (o.bus ? "[" + o.ref.state + "/" + o.ref.phase + (o.ref.through ? "/thru" : "") + "]" : "") + "@" + Math.round(o.l) + ".." + Math.round(o.r);
        if (overlap > 0.5) fail("overlap on lane " + d + ": " + desc(a) + " / " + desc(b) + " by " + overlap.toFixed(1));
      }
      const ids = lane.map(vid), seen = new Set(ids);
      const before = prevOrder[d].filter(id => seen.has(id)), now = ids.filter(id => prevOrder[d].includes(id));
      if (before.join() !== now.join()) fail("order changed on lane " + d + ": " + before.join(">") + " → " + now.join(">"));
      prevOrder[d] = ids;
    }
    const now = new Map(); // compared with the last frame only: a bus that parked and came back out starts afresh
    for (const o of vehicles) {
      const id = vid(o), x = (o.l + o.r) / 2, p = prev.get(id);
      if (p != null && o.dir * (x - p) < -0.01) fail(id + " moved backwards by " + Math.abs(p - x).toFixed(2));
      now.set(id, x);
    }
    prev = now;
    // 3. reserved zones: nobody drives into one it was stopping for; nobody touches a maneuvering body
    const zones = L.reservedZones(), rel = new Map();
    for (const z of zones) for (const o of vehicles) {
      if (o.dir !== z.dir || o.ref === z.owner) continue;
      const inside = o.r > z.l && o.l < z.r;
      const d = o.dir > 0 ? z.l - o.r : o.l - z.r;
      const key = vid(o) + "@" + z.owner.id + ":" + z.dir;
      const r = inside ? "inside" : d < 0 ? "past" : "out";
      rel.set(key, { r, d, v: o.v });
      const was = prevRel.get(key);
      // it entered although last frame it could still have stopped short (more room than its stopping distance)
      if (r === "inside" && was && was.r === "out" && was.d - (o.car ? 18 : 24) >= was.v * was.v / (2 * (o.car ? 600 : 255)) + 0.5)
        fail(vid(o) + " entered the zone of bus " + z.owner.id);
    }
    prevRel = rel;
    for (const b of moving) for (const s of bodySpans(b)) for (const o of vehicles)
      if (o.ref !== b && o.dir === s.dir && o.r > s.l + 0.5 && o.l < s.r - 0.5)
        fail(vid(o) + (o.bus ? "[" + o.ref.phase + (o.ref.through ? "/thru" : "") + " v" + Math.round(o.v) + "]" : "") + "@" + Math.round(o.l) + ".." + Math.round(o.r)
          + " overlaps maneuvering bus " + b.id + "[" + b.state + " dir" + b.dir + " " + b.kind + " s" + Math.round(b.mv.s) + " span " + Math.round(s.l) + ".." + Math.round(s.r) + "]");
  }
  // step the simulation 'sec' seconds in 1/30 s frames, auditing each; stop early when until() holds
  kit.run = (sec, until = null, watch = null) => {
    const n = Math.round(sec * 30);
    for (let i = 0; i < n; i++) {
      L.frame(1 / 30, 1 / 30); kit.frames++;
      audit();
      if (watch) watch();
      if (until && until()) return { ok: true, t: (i + 1) / 30 };
    }
    return { ok: !until, t: sec };
  };
  // the order buses asked for the reservation in (reqSeq is cleared once they are through)
  kit.seqWatch = () => { kit.seqs ??= {}; for (const b of L.buses()) if (b.reqSeq != null) kit.seqs[b.id] ??= b.reqSeq; };
  kit.byRequest = ids => [...ids].sort((a, b) => kit.seqs[a] - kit.seqs[b]);
  const BUILTIN = new Set(Object.keys(kit));
  return kit;
})();
true`;

/* --------------------------------- setup -------------------------------- */
procs.push(spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" }));
await waitFor(() => fetch(URL).then(r => r.ok), 10000, "server");
procs.push(spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${path.join(tmp, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,720", "about:blank"], { stdio: "ignore" }));
const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json()).find(t => t.type === "page"), 15000, "chrome");
const page = new CDP(target.webSocketDebuggerUrl);
await page.ready;
await page.send("Page.enable"); await page.send("Runtime.enable");
await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await page.send("Page.navigate", { url: URL });
await waitFor(() => page.eval(`!!window.__Layover && document.readyState === "complete"`), 15000, "game");
// the welcome modal stays open, so the page's own frame loop never steps the sim: only T.run does
await page.eval(`localStorage.clear(); window.addEventListener("beforeunload", e => e.stopImmediatePropagation(), true); true`);
await page.eval(KIT);
const E = expr => page.eval(`(() => { const L = window.__Layover, P = L.PHASE; return ${expr}; })()`);

/* ------------------------------- scenarios ------------------------------ */
// bay 5 (x 590): rightbound turn-in at x 409, leftbound at x 727 (small bus)
await test("1 + 15. Rightbound bus parks with five rightbound cars behind it; they keep their order and resume", async () => {
  // bay 6: the turn-in point is at x 493; the bus starts 200 px before it, the cars close behind it
  await E(`(() => { const cx = T.x0(1, 6) - 200; T.a = T.roadBus(1, cx, { forcedSlot: 6 });
    T.cs = [0, 1, 2, 3, 4].map(i => T.car(1, cx - 85 - 18 - 52 - i * 72, 150)); return true; })()`);
  const r = await E(`T.run(40, () => T.phase(T.a) === P.PARKED, () => { if (T.phase(T.a) === P.PARKING) for (const id of T.cs) T.minQ = Math.min(T.minQ ?? 999, T.carById(id).spd); })`);
  check("bus parks in its bay", r.ok && (await E(`T.bus(T.a).slot`)) === 6, `${r.t.toFixed(1)} s`);
  const q = await E(`T.cs.map(id => T.carById(id).spd)`);
  check("the cars behind slowed and queued while it turned in", (await E(`T.minQ`)) < 20, `min speed ${await E(`T.minQ`)}`);
  const res = await E(`T.run(20, () => T.cs.every(id => !T.carById(id) || T.carById(id).x > T.tx(6) + 120))`);
  check("all five cars drive on past the bay", res.ok, `${res.t.toFixed(1)} s after parking`);
  check("…at cruising speed again", await E(`T.cs.map(T.carById).filter(Boolean).every(c => c.spd > 140)`), JSON.stringify(q.map(Math.round)));
});

await test("2. Rightbound bus waits for oncoming (leftbound) traffic before turning", async () => {
  await E(`(() => { T.a = T.waitingBus(1, 5);
    const z = T.prospective(T.a).find(z => z.dir === -1);
    T.zl = z; T.slow = T.car(-1, (z.l + z.r) / 2, 30);      // crawling through the turning path
    T.away = T.car(-1, z.l - 260, 160);                     // past the turn, driving away
    T.far = T.car(-1, z.r + 700, 160);                      // still far off
    return true; })()`);
  let minAway = 999;
  const r = await E(`T.run(30, () => T.bus(T.a).state === "enter", () => { const c = T.carById(T.away); if (c) T.minAway = Math.min(T.minAway ?? 999, c.spd); })`);
  minAway = await E(`T.minAway`);
  check("bus turns in", r.ok, `${r.t.toFixed(1)} s`);
  check("…only once the oncoming car is out of the turning path", await E(`(() => { const c = T.carById(T.slow); return !c || c.x + 52 <= T.zl.l; })()`));
  check("…and it waited for it (≥ 2 s)", r.t > 2, `${r.t.toFixed(1)} s`);
  check("a leftbound car that has passed the turn is never slowed", minAway >= 159.9, `min speed ${minAway}`);
  const done = await E(`T.run(30, () => T.phase(T.a) === P.PARKED)`);
  check("bus parks", done.ok);
  const far = await E(`T.run(15, () => { const c = T.carById(T.far); return !c || c.x < T.zl.l - 100; })`);
  check("the far oncoming car gets past once the bus is in", far.ok);
});

await test("3 + 13. Leftbound bus parks without touching rightbound traffic", async () => {
  await E(`(() => { T.a = T.roadBus(-1, T.x0(-1, 5) + 300, { forcedSlot: 5 });
    T.cs = [0, 1, 2, 3].map(i => T.car(1, -window.__Layover.offX() - 60 + i * 160, 170)); return true; })()`);
  const r = await E(`T.run(40, () => T.phase(T.a) === P.PARKED, () => { for (const c of window.__Layover.cars()) if (c.v > 0) T.minR = Math.min(T.minR ?? 999, c.spd); if (T.zones().some(z => z.dir === 1)) T.rZone = true; })`);
  check("bus parks", r.ok, `${r.t.toFixed(1)} s`);
  check("its maneuver never reserved the rightbound lane", !(await E(`T.rZone`)));
  check("rightbound cars never slowed", (await E(`T.minR`)) >= 169.9, `min ${await E(`T.minR`)}`);
});

await test("4 + 17. Two buses request parking simultaneously: one at a time, first come first served", async () => {
  await E(`(() => { T.a = T.waitingBus(1, 3); T.b = T.waitingBus(-1, 7); return true; })()`);
  const r = await E(`T.run(60, () => T.phase(T.a) === P.PARKED && T.phase(T.b) === P.PARKED, T.seqWatch)`);
  check("both park", r.ok, `${r.t.toFixed(1)} s`);
  const order = await E(`T.log.filter(e => e.to === P.PARKING).map(e => e.id)`);
  const seq = await E(`T.byRequest([T.a, T.b])`);
  check("the first to ask parks first", JSON.stringify(order) === JSON.stringify(seq), JSON.stringify(order));
  check("the second waited for permission meanwhile", await E(`T.log.some(e => e.id === ${seq[1]} && e.to === P.WAIT_PARK_PERMIT)`));
});

await test("5. A bus asks to park while another is parking", async () => {
  await E(`(() => { T.a = T.waitingBus(-1, 6); return true; })()`);
  await E(`T.run(10, () => T.phase(T.a) === P.PARKING)`);
  await E(`(() => { T.b = T.roadBus(1, T.x0(1, 2) - 200); return true; })()`);
  const r = await E(`T.run(60, () => T.phase(T.b) === P.PARKED, () => { if (T.phase(T.b) === P.PARKING && T.phase(T.a) !== P.PARKED) T.bad = true; })`);
  check("the second bus parks", r.ok, `${r.t.toFixed(1)} s`);
  check("…only after the first is parked", !(await E(`T.bad`)));
  check("…waiting for permission at its turn-in point", await E(`T.log.some(e => e.id === T.b && e.to === P.WAIT_PARK_PERMIT)`));
});

await test("6. A bus asks to depart while another is parking", async () => {
  await E(`(() => { T.p = T.parked(2, 1); T.a = T.waitingBus(-1, 6); return true; })()`);
  await E(`T.run(5, () => T.phase(T.a) === P.PARKING)`);
  await E(`T.ready(T.p)`);
  const r = await E(`T.run(60, () => T.phase(T.p) === P.DEPARTING || T.phase(T.p) === "GONE", () => { if (T.phase(T.p) === P.REVERSING && T.phase(T.a) === P.PARKING) T.bad = true; })`);
  check("the parked bus leaves", r.ok, `${r.t.toFixed(1)} s`);
  check("…never while the other is turning in", !(await E(`T.bad`)));
  check("…after waiting for departure permission", await E(`T.log.some(e => e.id === T.p && e.to === P.WAIT_DEPART_PERMIT)`));
});

await test("7. Two buses request departure simultaneously", async () => {
  await E(`(() => { T.p = T.parked(3, 1); T.q = T.parked(7, -1); T.ready(T.p); T.ready(T.q); return true; })()`);
  const r = await E(`T.run(80, () => [T.p, T.q].every(id => [P.DEPARTING, "GONE"].includes(T.phase(id))), T.seqWatch)`);
  check("both leave", r.ok, `${r.t.toFixed(1)} s`);
  const order = await E(`T.log.filter(e => e.to === P.REVERSING).map(e => e.id)`);
  check("one reverses after the other, in request order", JSON.stringify(order) === JSON.stringify(await E(`T.byRequest([T.p, T.q])`)), JSON.stringify(order));
});

await test("8. A bus asks to park while another is reversing out", async () => {
  await E(`(() => { T.p = T.parked(5, -1); T.ready(T.p); return true; })()`);
  await E(`T.run(5, () => T.phase(T.p) === P.REVERSING)`);
  await E(`(() => { T.a = T.roadBus(1, T.x0(1, 2) - 150); return true; })()`);
  const r = await E(`T.run(60, () => T.phase(T.a) === P.PARKED, () => { if (T.phase(T.a) === P.PARKING && T.phase(T.p) === P.REVERSING) T.bad = true; })`);
  check("the arriving bus parks", r.ok, `${r.t.toFixed(1)} s`);
  check("…never while the other is reversing", !(await E(`T.bad`)));
});

await test("9. Rightbound bus waits for enough reversing space", async () => {
  await E(`(() => { T.p = T.parked(6, 1);
    const z = T.prospective(T.p).find(z => z.dir === 1); T.z = z;
    T.slow = T.car(1, z.l + 40, 25);   // crawling through the stretch it must reverse into
    T.ready(T.p); return true; })()`);
  const r = await E(`T.run(40, () => T.phase(T.p) === P.REVERSING)`);
  check("it waits with the departure reservation", await E(`T.log.some(e => e.id === T.p && e.to === P.WAIT_DEPART_CLEAR)`));
  check("starts reversing only once the lane stretch is empty", r.ok && (await E(`(() => { const c = T.carById(T.slow); return !c || c.x >= T.z.r; })()`)), `${r.t.toFixed(1)} s`);
  check("and that took a while (the car was in the way)", r.t > 3, `${r.t.toFixed(1)} s`);
  check("it leaves rightbound", (await E(`T.run(40, () => T.phase(T.p) === P.DEPARTING)`)).ok && (await E(`T.bus(T.p).dir`)) === 1);
});

await test("10. Leftbound bus waits for enough reversing space", async () => {
  await E(`(() => { T.p = T.parked(4, -1);
    const z = T.prospective(T.p).find(z => z.dir === -1); T.z = z;
    T.slow = T.car(-1, z.r - 90, 25);
    T.ready(T.p); return true; })()`);
  const r = await E(`T.run(40, () => T.phase(T.p) === P.REVERSING)`);
  check("starts reversing only once the lane stretch is empty", r.ok && (await E(`(() => { const c = T.carById(T.slow); return !c || c.x + 52 <= T.z.l; })()`)), `${r.t.toFixed(1)} s`);
  check("it leaves leftbound", (await E(`T.run(40, () => T.phase(T.p) === P.DEPARTING)`)).ok && (await E(`T.bus(T.p).dir`)) === -1);
});

await test("11 + 12 + 16. Vehicles arriving while a bus reverses queue behind it in order, then resume", async () => {
  await E(`(() => { T.p = T.parked(6, 1); T.ready(T.p); return true; })()`);
  await E(`T.run(5, () => T.phase(T.p) === P.REVERSING)`);
  // five rightbound cars arrive from behind, one leftbound car from ahead, one leftbound car far from the bay
  await E(`(() => { const off = window.__Layover.offX();
    T.cs = [0, 1, 2, 3, 4].map(i => T.car(1, -off - 60 - i * 70, 180));
    T.oncoming = T.car(-1, T.tx(6) + 420, 160);
    T.elsewhere = T.car(-1, T.tx(6) - 250, 160); return true; })()`);
  const r = await E(`T.run(40, () => T.phase(T.p) === P.DEPARTING, () => {
    const c = T.carById(T.elsewhere); if (c) T.minElse = Math.min(T.minElse ?? 999, c.spd);
    if (T.cs.some(id => T.carById(id) && T.carById(id).spd < 1)) T.queued = true; })`);
  check("the bus finishes reversing", r.ok, `${r.t.toFixed(1)} s`);
  check("the arriving rightbound cars stopped behind it", await E(`T.queued`));
  check("a leftbound car clear of the exit is never slowed", (await E(`T.minElse`)) >= 159.9, `min ${await E(`T.minElse`)}`);
  const res = await E(`T.run(40, () => T.cs.every(id => !T.carById(id) || T.carById(id).x > T.tx(6) + 200) && (!T.carById(T.oncoming) || T.carById(T.oncoming).x < T.tx(6) - 200))`);
  check("all waiting traffic resumes and gets past", res.ok, `${res.t.toFixed(1)} s`);
});

await test("14. The bay a bus is waiting for is taken first: it parks in the next free one", async () => {
  // A takes bay 5 first; B drives in from the right, also heading for bay 5
  await E(`(() => { T.reset(2); T.a = T.waitingBus(1, 5); T.run(1 / 30); T.b = T.roadBus(-1, T.x0(-1, 5) + 300, { forcedSlot: 5 }); return true; })()`);
  const r = await E(`T.run(60, () => T.phase(T.a) === P.PARKED && T.phase(T.b) === P.PARKED)`);
  check("both park", r.ok, `${r.t.toFixed(1)} s` + (r.ok ? "" : " " + JSON.stringify(await E(`T.log`))));
  const slots = await E(`[T.bus(T.a)?.slot, T.bus(T.b)?.slot]`);
  check("first bus got bay 5, the second moved on to bay 4", slots[0] === 5 && slots[1] === 4, JSON.stringify(slots));
});

await test("Deadlock guard: a departure whose exit is filled by a queue behind a waiting bus lets that bus go first", async () => {
  // bus X turns in (holds the reservation); P in bay 3 gets ready; A then waits for bay 7 with cars queued behind it over P's exit
  await E(`(() => { T.x = T.waitingBus(-1, 8); T.p = T.parked(3, 1); return true; })()`);
  await E(`T.run(3, () => T.phase(T.x) === P.PARKING)`);
  await E(`(() => { T.ready(T.p); T.run(0.2);
    T.a = T.waitingBus(1, 7);
    const ra = T.bus(T.a).cx - 85;
    T.cs = [0, 1, 2, 3, 4].map(i => T.car(1, ra - 18 - 52 - i * 70, 150, 0)); return true; })()`);
  const r = await E(`T.run(90, () => T.phase(T.p) === P.DEPARTING && T.phase(T.a) === P.PARKED)`);
  check("everyone gets through (no deadlock)", r.ok, `${r.t.toFixed(1)} s`);
  const order = await E(`T.log.filter(e => e.to === P.PARKING || e.to === P.REVERSING).map(e => e.id)`);
  check("the waiting bus parked before the departure", JSON.stringify(order) === JSON.stringify(await E(`[T.x, T.a, T.p]`)), JSON.stringify(order));
});

await test("17 + 18. Soak: busy random traffic, ten bays, ten minutes", async () => {
  await E(`(() => { const L = window.__Layover; L.setAutoTraffic(true);
    L.sim().nextBusAt = L.game().clock.time; T.maxOwners = 0; T.cycles = {};
    for (const s of [0, 2, 4, 6, 8]) { const id = T.parked(s, s % 4 ? 1 : -1); T.bus(id).stopEnd = L.game().clock.time + 0.05 + s * 0.02; }
    return true; })()`);
  await E(`(() => { T.carsSeen = new Set(); window.__Layover.traceTraffic(true); return true; })()`);
  await E(`T.run(600, null, () => { for (const b of window.__Layover.buses()) if (b.phase) (T.cycles[b.id] ??= new Set()).add(b.phase);
    for (const c of window.__Layover.cars()) T.carsSeen.add(c);
    T.waitF ??= {}; T.maxWait ??= 0;
    const all = window.__Layover.buses();
    for (const b of all) {
      T.waitF[b.id] = [P.WAIT_PARK_PERMIT, P.WAIT_DEPART_PERMIT].includes(b.phase) ? (T.waitF[b.id] || 0) + 1 : 0;
      T.maxWait = Math.max(T.maxWait, T.waitF[b.id] / 30);
    } })`);
  const stats = await E(`(() => { const all = Object.values(T.cycles);
    return { buses: all.length, parked: all.filter(s => s.has(P.PARKING)).length, departed: all.filter(s => s.has(P.REVERSING)).length,
      maxWait: Math.round(T.maxWait),
      ...(() => { // every bus the controller passed over, and why
        const tr = window.__Layover.trafficTrace(), skips = tr.filter(e => e.granted).flatMap(e => e.skipped), per = {};
        for (const k of skips) per[k.id] = (per[k.id] || 0) + 1;
        return { grants: tr.filter(e => e.granted).length, handbacks: tr.filter(e => e.handback).length,
          maxBypass: Math.max(0, ...Object.values(per)), unjust: skips.filter(k => !k.why).length };
      })(),
      carsSeen: T.carsSeen.size }; })()`);
  check("buses kept parking and leaving", stats.parked >= 4 && stats.departed >= 5, JSON.stringify(stats));
  check("cars kept flowing", stats.carsSeen > 40, JSON.stringify(stats));
  const stuck = stats.maxWait > 300 ? await E(`(() => { const L = window.__Layover, seq = L.sim().trafficSeq, own = L.trafficOwners();
    const d = b => b && { id: b.id, phase: b.phase, state: b.state, seq: b.reqSeq, dir: b.dir, kind: b.kind, slot: b.slot, park: b.parkSlot, cx: Math.round(b.cx), v: Math.round(b.v || 0),
      blockers: L.maneuverBlockers(b).map(o => (o.car ? "car" : "bus" + o.ref.id + ":" + o.ref.phase) + "@" + Math.round(o.l) + "/v" + Math.round(o.v)) };
    return { seq, owners: [d(own.park), d(own.depart)], waiting: L.buses().filter(b => b.reqSeq != null).map(d) }; })()`) : null;
  check("first come, first served: a bus is only passed over while a later one stands in its way", stats.unjust === 0, JSON.stringify(stats));
  check("every waiting bus gets its turn within 5 minutes (incl. waits for guests in the bus's path)", stats.maxWait <= 300, JSON.stringify(stats) + (stuck ? " " + JSON.stringify(stuck) : ""));
  await E(`(() => { window.__Layover.setAutoTraffic(false); window.__Layover.traceTraffic(false); return true; })()`);
});

console.log(out.join("\n"));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
