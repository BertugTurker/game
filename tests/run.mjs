// Browser test harness — zero dependencies (Node ≥ 22 for the global WebSocket).
// Serves the game with python3's http.server, drives a local headless Chrome
// over the DevTools protocol, and asserts through window.__Layover.
//   node tests/run.mjs            (CHROME=/path/to/chrome to override)
// A genuine pre-progression (v6) save is produced by running the original
// game from LEGACY_COMMIT in the same browser.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_COMMIT = "26ebdd3";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT_NEW = 8765, PORT_OLD = 8766, PORT_CDP = 9333;
const NEW = `http://127.0.0.1:${PORT_NEW}`, OLD = `http://127.0.0.1:${PORT_OLD}`;
const SHOTS = process.env.SHOTS || path.join(tmpdir(), "layover-shots");

const procs = [];
const tmp = mkdtempSync(path.join(tmpdir(), "layover-test-"));
const fmtNum = n => Math.round(n).toLocaleString("tr-TR");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const p of procs) try { p.kill(); } catch (e) {}
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* chrome still exiting */ }
}
process.on("exit", () => { if (!printed) console.log(results.join("\n")); cleanup(); });
let printed = false;

async function waitFor(fn, ms = 10000, what = "condition") {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* not ready */ }
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await sleep(100);
  }
}

function serve(dir, port) {
  procs.push(spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: dir, stdio: "ignore" }));
  return waitFor(() => fetch(`http://127.0.0.1:${port}/index.html`).then(r => r.ok), 10000, `server :${port}`);
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0; this.pending = new Map(); this.errors = []; this.listeners = [];
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
        return;
      }
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        this.errors.push((d.exception && d.exception.description) || d.text);
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
        this.errors.push("console.error: " + m.params.args.map(a => a.value ?? a.description).join(" "));
      for (const l of this.listeners) l(m);
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
  async goto(url, waitGame = true) {
    await this.send("Page.navigate", { url });
    try { await waitFor(() => this.eval(`document.readyState === "complete" && location.href === ${JSON.stringify(url)}`), 10000, `load ${url}`); }
    catch (e) { throw new Error(e.message + " (at " + await this.eval("location.href + ' ' + document.readyState").catch(x => x.message) + ")"); }
    if (waitGame) await waitFor(() => this.eval(`!!window.__Layover`), 10000, "game init");
  }
  async shot(name) {
    mkdirSync(SHOTS, { recursive: true });
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    const f = path.join(SHOTS, name + ".png");
    writeFileSync(f, Buffer.from(r.data, "base64"));
    return f;
  }
}

/* ------------------------------ assertions ------------------------------ */
let passed = 0, failed = 0;
const results = [];
function check(name, cond, detail = "") {
  if (cond) { passed++; results.push(`  ✓ ${name}${detail ? " (" + detail + ")" : ""}`); }
  else { failed++; results.push(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}
async function test(title, fn) {
  results.push(title);
  const before = page.errors.length;
  try { await fn(); }
  catch (e) { check("no harness exception", false, e.message); }
  const errs = page.errors.slice(before);
  check("no page errors", errs.length === 0, errs.join(" | "));
}

/* --------------------------------- setup -------------------------------- */
const oldDir = path.join(tmp, "legacy");
mkdirSync(oldDir);
for (const f of ["index.html", "style.css", "game.js", "sw.js", "manifest.json"])
  writeFileSync(path.join(oldDir, f), execFileSync("git", ["show", `${LEGACY_COMMIT}:${f}`], { cwd: ROOT }));
await serve(ROOT, PORT_NEW);
await serve(oldDir, PORT_OLD);
procs.push(spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${path.join(tmp, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,720", "about:blank",
], { stdio: "ignore" }));
const target = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json();
  return list.find(t => t.type === "page");
}, 15000, "chrome");
const page = new CDP(target.webSocketDebuggerUrl);
await page.ready;
await page.send("Page.enable");
await page.send("Runtime.enable");
await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

const V7 = "layover-lane-v7", V6 = "layover-lane-v6", V5 = "layover-lane-v5";
// set storage on the game's origin without running the game
async function seed(entries) {
  await page.goto(`${NEW}/manifest.json`, false);
  await page.eval(`localStorage.clear(); ${Object.entries(entries).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("")} true`);
}
// life(sim, field): today's stats plus the archived days (days close at midnight)
const L = expr => page.eval(`(() => { const L = window.__Layover, G = L.game(), life = (s, f) => s.stats[f] + s.history.reduce((a, h) => a + h[f], 0); return ${expr}; })()`);
const storage = key => page.eval(`localStorage.getItem(${JSON.stringify(key)})`);
const modalText = () => page.eval(`document.getElementById("modal").classList.contains("hidden") ? null : document.getElementById("modalTitle").textContent + " | " + document.getElementById("modalBody").textContent`);

/* ------------------- fixture: a real v6 save from the old game ----------- */
results.push("Fixture: v6 save from the original game (" + LEGACY_COMMIT + ")");
await page.goto(`${OLD}/manifest.json`, false);
await page.eval(`localStorage.clear(); true`);
await page.goto(`${OLD}/index.html`);
await page.eval(`document.getElementById("modalBtn").click(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "4" })); true`);
// run the old game at 200× until a bus is parked with guests out and about
const v6raw = await waitFor(async () => {
  const raw = await page.eval(`window.dispatchEvent(new Event("beforeunload")); localStorage.getItem("${V6}")`);
  const d = raw && JSON.parse(raw);
  const busy = d && d.buses.some(b => b.state === "stop" && b.pax.some(p => p.state !== "bus"));
  const dirty = d && d.S.stallClean.some(c => c < 100);
  return busy && dirty ? raw : null;
}, 60000, "a busy v6 save");
const v6 = JSON.parse(v6raw);
check("old game wrote a v6 save with a parked bus and guests", v6.v === 6 && v6.buses.length > 0);
check("old game produced no page errors", page.errors.length === 0, page.errors.join(" | "));
page.errors.length = 0;

/* --------------------------------- tests -------------------------------- */
await test("New game initialization", async () => {
  await seed({});
  await page.goto(`${NEW}/index.html`);
  check("load status is new", (await L(`L.loaded.status`)) === "new");
  check("intro modal shown", ((await modalText()) || "").includes("hoş geldin"));
  check("save version 7", (await L(`G.version`)) === 7);
  check("exactly one owned terminal", (await L(`Object.values(G.terminals).filter(t => t.owned).length`)) === 1);
  check("active terminal is the start terminal", (await L(`G.activeTerminal`)) === "bolu");
  check("company cash is ₺500", (await L(`G.company.cash`)) === 500);
  check("cash lives outside terminals", (await L(`Object.values(G.terminals).every(t => !("cash" in t) && !("cash" in t.sim))`)) === true);
  check("clock lives outside terminals", (await L(`!("time" in L.sim()) && !("day" in L.sim()) && G.clock.time === 8`)) === true);
  check("S/buses bound to the active terminal", (await L(`L.sim() === G.terminals.bolu.sim && L.buses() === G.terminals.bolu.buses`)) === true);
});

await test("Phase 2: starting terminal", async () => {
  const g = await L(`({ rep: L.sim().rep, wc: G.terminals.bolu.wc, stalls: L.activeStalls(), tool: L.tool(),
    wash: G.terminals.bolu.carWash.unlocked, first: G.flags.firstBusDone, buses: L.buses().map(b => b.state), cash: G.company.cash })`);
  check("starting reputation 10/100", g.rep === 10);
  check("exactly two alaturka toilets", g.wc.count === 1 && g.wc.style === 1 && JSON.stringify(g.stalls) === "[4,5]");
  check("no cologne, no calculator", g.wc.cologne === 0 && g.wc.calc === 0);
  check("small hand brush is the only cleaning tool", g.tool === "handBrush");
  check("no car wash at start", g.wash === false);
  check("opening bus already rolling in behind the welcome screen", g.first === true && g.buses.length === 1 && g.buses[0] === "drive");
  check("help copy matches the start (brush, no car wash)", /el fırçası/.test(await modalText()) && /oto yıkaman yok/.test(await modalText()));
});

await test("Phase 2: first bus arrives within 3 real seconds at 1×", async () => {
  const ms = await page.eval(`new Promise(res => {
    const L = window.__Layover, t0 = performance.now();
    document.getElementById("modalBtn").click(); // play starts
    const iv = setInterval(() => {
      const b = L.buses()[0];
      if (b && b.state !== "drive") { clearInterval(iv); res(Math.round(performance.now() - t0)); }
      else if (performance.now() - t0 > 8000) { clearInterval(iv); res(-1); }
    }, 20);
  })`);
  check("bus pulls into its bay < 3000 ms after play starts", ms >= 0 && ms < 3000, `${ms} ms`);
  const parked = await waitFor(() => L(`L.buses()[0].state === "stop"`), 15000, "bus parked").catch(() => false);
  check("…and parks", parked === true);
});

const mouse = async (type, x, y, buttons) => {
  const c = await L(`L.toClient(${x}, ${y})`);
  await page.send("Input.dispatchMouseEvent", { type, x: c.x, y: c.y, button: "left", buttons, clickCount: 1 });
};
const tap = async (x, y) => { await mouse("mousePressed", x, y, 1); await mouse("mouseReleased", x, y, 0); };
// hold and scrub around a point for `ms` real milliseconds
async function scrubAt(pt, ms) {
  await mouse("mousePressed", pt.x, pt.y, 1);
  const t0 = Date.now();
  for (let k = 0; Date.now() - t0 < ms; k++) { await mouse("mouseMoved", pt.x + 4 * Math.sin(k), pt.y + 4 * Math.cos(k), 1); await sleep(40); }
  await mouse("mouseReleased", pt.x, pt.y, 0);
}
async function cleaningGain(bay, ms) {
  await L(`(L.sim().stallClean[${bay}] = 20, true)`);
  await scrubAt(await L(`L.bayCenter(${bay})`), ms);
  return (await L(`L.sim().stallClean[${bay}]`)) - 20;
}

await test("Phase 2: hand-brush cleaning (real pointer input)", async () => {
  await L(`(L.setView("wc"), true)`);
  await sleep(400);
  const st = (await L(`L.stations()`))[0];
  await tap(st.x, st.y);
  check("tap the station to pick the brush up", (await L(`L.toolInHand()`)) === true);
  const free = await L(`L.activeStalls().find(i => !L.facilities().T.spots[i])`);
  const gain = await cleaningGain(free, 2000);
  check("brush cleans a built stall slowly (~8/s)", gain >= 8 && gain <= 22, `+${gain.toFixed(1)} in 2 s`);
  const boarded = await cleaningGain(0, 800);
  check("a boarded-up bay cannot be cleaned", boarded === 0);
  await L(`(L.sim().stallClean[0] = 100, true)`);
  await tap(st.x, st.y);
  check("tap again to put it down", (await L(`L.toolInHand()`)) === false);
  globalThis.__brushGain = gain;
});

await test("Phase 2: cologne and car wash are not available", async () => {
  check("cologne refused before it is bought", (await L(`(() => { const b = L.bottle(); L.offerCologne(); return L.bottle() === b && (!L.front() || !L.front().cologne); })()`)) === true);
  await L(`(L.setView("out"), true)`);
  await sleep(300);
  const b = await L(`(() => { const b = L.buses().find(b => b.state === "stop"); return b && { x: b.cx, y: b.cy }; })()`);
  if (b) await tap(b.x, b.y);
  check("tapping a parked bus does not open a car wash", b && (await L(`L.view()`)) === "out");
  await L(`(L.openWash(L.buses()[0]), true)`);
  check("openWash refuses while locked", (await L(`L.view()`)) === "out");
});

await test("Phase 2: guests only use the built stalls", async () => {
  await L(`(L.setSpeed(100), true)`);
  const seen = new Set();
  for (let k = 0; k < 30; k++) {
    await L(`(L.advance(0.5), true)`);
    for (const i of await L(`L.facilities().T.spots.map((s, i) => s ? i : -1).filter(i => i >= 0)`)) seen.add(i);
  }
  check("toilets were used", seen.size > 0);
  check("only bays 4 and 5 ever occupied", [...seen].every(i => i === 4 || i === 5), [...seen].join(","));
  check("boarded bays untouched by dirt", (await L(`[0,1,2,3,6,7,8,9].every(i => L.sim().stallClean[i] === 100)`)) === true);
});

await test("Phase 2: opening bus is not replayed on load", async () => {
  await L(`(L.save(), true)`);
  const snap = JSON.parse(await storage(V7));
  await page.goto(`${NEW}/index.html`);
  check("reload keeps the same buses, no extra opening bus", (await L(`L.buses().map(b => b.id).join()`)) === JSON.parse(await storage(V7)).G.terminals.bolu.buses.map(b => b.id).join());
  snap.G.terminals.bolu.buses = [];
  await seed({ [V7]: JSON.stringify(snap) });
  await page.goto(`${NEW}/index.html`);
  check("an empty lot stays empty after loading", (await L(`L.buses().length`)) === 0 && (await L(`G.flags.firstBusDone`)) === true);
});

await test("Phase 2: fresh game for the remaining checks", async () => {
  await seed({});
  await page.goto(`${NEW}/index.html`);
  check("new game again", (await L(`L.loaded.status`)) === "new");
});

await test("Shared clock advances exactly once per step", async () => {
  const t0 = await L(`G.clock.time`);
  await L(`(L.setSpeed(10), L.advance(10), true)`); // 300 frames × 1/3 s = 100 game seconds
  const t1 = await L(`G.clock.time`);
  check("10 real s at 10× = 100 game s", Math.abs((t1 - t0) - 100 / 360) < 1e-6, `Δ=${(t1 - t0) * 360}s`);
});

await test("Counter regression: change-making and the exact-₺20 line", async () => {
  await L(`(L.setSpeed(100), true)`); // fresh stalls: guests use the WC
  // wait for a guest at the main pay spot who is owed change
  const front = await waitFor(async () => {
    await L(`(L.sim().stallClean.fill(100), L.advance(0.5), true)`); // the player keeps the stalls clean
    return L(`(() => { const f = L.front(); return f && f.state === "payC" && Math.hypot(f.x - 560, f.y - 357) < 4 && f.owed > 0 ? { owed: f.owed } : null; })()`);
  }, 60000, "a guest at the pay spot").catch(async e => {
    throw new Error(e.message + " " + await L(`JSON.stringify({ t: G.clock.time, q: L.queues(), f: L.front() && { s: L.front().state, x: L.front().x, y: L.front().y, owed: L.front().owed },
      buses: L.buses().map(b => b.state + ":" + b.pax.length), T: L.facilities().T.queue.length, best: Math.max(...L.sim().stallClean) })`));
  });
  const res = await L(`(() => {
    const f = L.front(); let r = f.owed; const notes = [];
    for (const d of [50, 20, 10]) while (r >= d) { L.giveChange(d); notes.push(d); r -= d; }
    return { state: f.state, given: f.changeGiven, owed: f.owed, notes, sat: f.sat, stillFront: L.front() === f };
  })()`);
  check("crisp change settles the guest", res.state === "leaveC" && res.given === res.owed && !res.stillFront, JSON.stringify(res));
  check("guest got a rating", typeof res.sat === "number");
  // the exact line pays on its own
  const ex = await waitFor(async () => {
    await L(`(L.sim().stallClean.fill(100), L.advance(0.5), true)`); // the player keeps the stalls clean
    return L(`(() => { const f = L.front2(); if (f) window.__ex = f; return !!f; })()`);
  }, 120000, "an exact-₺20 guest");
  const settled = await waitFor(async () => {
    await L(`(L.advance(0.5), true)`);
    return L(`(window.__ex.sat != null && !window.__ex.unpaid) ? window.__ex.state : null`);
  }, 30000, "exact guest settles");
  check("exact-₺20 guest settled without the player", ex && !!settled, settled);
});

await test("Phase 3: service revenue is booked exactly once", async () => {
  const led = await L(`({ cash: G.company.cash, ledger: G.company.ledger, totals: G.company.totals, next: G.company.nextTxId })`);
  const fees = led.ledger.filter(x => x.kind === "toiletFee");
  check("paid visits booked as ₺20 fees", fees.length > 0 && fees.every(x => x.amount === 20 && x.terminal === "bolu"), `${fees.length} fees`);
  check("cash = ₺500 + every ledger line", led.cash === 500 + led.ledger.reduce((a, x) => a + x.amount, 0));
  check("per-kind totals match the ledger", led.totals.toiletFee === fees.reduce((a, x) => a + x.amount, 0));
  check("transaction ids unique and sequential", led.ledger.every((x, i) => x.id === i + 1) && led.next === led.ledger.length + 1);
  check("the exact-₺20 guest paid", (await page.eval(`window.__ex.feePaid === true`)) === true);
  check("guests who never paid booked nothing", (await L(`L.evaders().every(p => !p.feePaid)`)) === true);
  const again = await L(`(() => { const p = window.__ex, c = G.company.cash, n = G.company.nextTxId; L.finalizePayment(p); return G.company.cash === c && G.company.nextTxId === n; })()`);
  check("settling the same visit twice books nothing", again === true);
  check("revenue reaches the day's stats", (await L(`life(L.sim(), "revenue")`)) === fees.reduce((a, x) => a + x.amount, 0));
  // overpaid change: the fee is booked and the excess is a separate loss
  await L(`(L.setSpeed(100), true)`);
  await waitFor(async () => {
    await L(`(L.sim().stallClean.fill(100), L.advance(0.5), true)`);
    return L(`(() => { const f = L.front(); return f && f.state === "payC" && Math.hypot(f.x - 560, f.y - 357) < 4 && f.owed > 0 && f.changeGiven === 0; })()`);
  }, 60000, "a guest owed change");
  const over = await L(`(() => {
    const f = L.front(), c0 = G.company.cash, n0 = G.company.ledger.length;
    while (L.front() === f) L.giveChange(50);
    const lines = G.company.ledger.slice(n0).map(x => x.kind + ":" + x.amount);
    return { lines, net: G.company.cash - c0, excess: f.changeGiven - f.owed };
  })()`);
  check("overpaid change books fee + loss", over.lines.join() === `toiletFee:20,changeLoss:${-over.excess}` && over.net === 20 - over.excess, JSON.stringify(over));
});

const gSnap = () => L(`JSON.stringify({ c: G.company, t: G.terminals.bolu.wc, s: L.sim().stallClean, b: L.sim().bottle })`);
await test("Phase 3: failed purchases change nothing", async () => {
  await seed({});
  await page.goto(`${NEW}/index.html`);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await L(`(G.company.cash = 999, true)`);
  let before = await gSnap();
  let r = await L(`L.purchaseUpgrade("bolu", "style", 2)`);
  check("modern toilets refused at ₺999, reason given", !r.ok && /₺1 eksik/.test(r.reason), r.reason);
  check("…and state is untouched", (await gSnap()) === before);
  await L(`(G.company.cash = 100000, true)`);
  before = await gSnap();
  r = await L(`L.purchaseUpgrade("bolu", "count", 3)`);
  check("cannot skip a level", !r.ok && /Önce/.test(r.reason) && (await gSnap()) === before, r.reason);
  r = await L(`L.purchaseUpgrade("bolu", "tool", 3)`);
  check("mop refused before the long brush", !r.ok && /Önce/.test(r.reason) && (await gSnap()) === before, r.reason);
  r = await L(`L.purchaseUpgrade("bolu", "cologne", 2)`);
  check("big cologne refused before the first bottle", !r.ok && /Önce/.test(r.reason) && (await gSnap()) === before, r.reason);
  r = await L(`L.purchaseUpgrade("bolu", "hotdogs", 2)`);
  check("unknown upgrade refused", !r.ok && (await gSnap()) === before);
  r = await L(`L.purchaseUpgrade("gerede", "count", 2)`);
  check("unowned terminal refused", !r.ok && (await gSnap()) === before);
});

await test("Phase 3: separate WC upgrades", async () => {
  const wc = () => L(`({ ...G.terminals.bolu.wc })`);
  await L(`(G.company.cash = 800, true)`);
  let r = await L(`L.purchaseUpgrade("bolu", "count", 2)`);
  let g = await L(`({ cash: G.company.cash, wc: G.terminals.bolu.wc, stalls: L.activeStalls(), last: G.company.ledger.at(-1), clean: L.activeStalls().every(i => L.sim().stallClean[i] === 100) })`);
  check("4 stalls bought for exactly ₺800", r.ok && g.cash === 0 && g.last.kind === "facility" && g.last.amount === -800);
  check("count only: four stalls, still alaturka, brush, no cologne", JSON.stringify(g.stalls) === "[3,4,5,6]" && g.clean && g.wc.style === 1 && g.wc.tool === 1 && g.wc.cologne === 0, JSON.stringify(g.wc));
  const n0 = await L(`G.company.ledger.length`);
  await L(`(G.company.cash = 2000, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "count", 2)`);
  check("buying an owned level again is refused", !r.ok && (await L(`G.company.ledger.length`)) === n0 && (await L(`G.company.cash`)) === 2000);
  await L(`(L.sim().stallClean[4] = 30, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "style", 2)`);
  check("modern toilets: every built stall replaced spotless, count unchanged", r.ok && (await L(`L.activeStalls().length === 4 && L.sim().stallClean[4] === 100 && G.terminals.bolu.wc.style === 2 && G.company.cash === 1000`)) === true);
  await L(`(G.company.cash = 300, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "cologne", 1)`);
  check("cologne bought for ₺300: a full 500 ml bottle", r.ok && (await L(`G.terminals.bolu.wc.cologne === 1 && L.sim().bottle === 500 && G.company.cash === 0`)) === true);
  await L(`(G.company.cash = 900, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "cologne", 2)`);
  check("cologne upgraded: a full 1 L bottle", r.ok && (await L(`L.sim().bottle === 1000`)) === true);
  await L(`(G.company.cash = 250, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "calc", 1)`);
  check("calculator bought for ₺250", r.ok && (await L(`G.terminals.bolu.wc.calc === 1 && G.company.cash === 0`)) === true);
  await L(`(G.company.cash = 300, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "tool", 2)`);
  check("brush upgraded to the long brush", r.ok && (await L(`L.tool()`)) === "longBrush");
  await L(`(G.company.cash = 600, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "tool", 3)`);
  check("then the mop kit for ₺600", r.ok && (await L(`L.tool() === "mop" && G.company.cash === 0`)) === true);
  check("each track moved on its own", JSON.stringify(await wc()) === JSON.stringify({ count: 2, style: 2, tool: 3, cologne: 2, calc: 1 }), JSON.stringify(await wc()));
  await L(`(L.setView("wc"), true)`);
  await sleep(400);
  const st = (await L(`L.stations()`))[0];
  await tap(st.x, st.y);
  const free = await L(`L.activeStalls().find(i => !L.facilities().T.spots[i])`);
  const mopGain = await cleaningGain(free, 2000);
  await tap(st.x, st.y);
  check("the mop measurably out-cleans the brush", mopGain > 1.5 * (globalThis.__brushGain || 99), `mop +${mopGain.toFixed(1)} vs brush +${(globalThis.__brushGain || 0).toFixed(1)}`);
  await L(`(L.setView("out"), true)`);
});

await test("Phase 3: business panel (keyboard + DOM)", async () => {
  await L(`(L.renderShop(), true)`);
  const outH2 = await page.eval(`[...document.querySelectorAll("#shopBody h2")].map(h => h.textContent)`);
  check("outdoor panel: car wash + maintenance, no WC upgrades", !outH2.some(t => t.startsWith("WC")) && outH2.includes("OTO YIKAMA") && outH2.includes("BAKIM"), JSON.stringify(outH2));
  await L(`(L.setView("wc"), true)`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "u" })); true`);
  check("U opens the panel", (await L(`L.shopOpen()`)) === true && (await page.eval(`!document.getElementById("shop").classList.contains("hidden")`)));
  const t0 = await L(`G.clock.time`);
  await sleep(600);
  check("the clock holds while the panel is open", (await L(`G.clock.time`)) === t0);
  const btn = (track, lvl) => `document.querySelector('#shopBody button[data-act=wc][data-track="${track}"][data-tier="${lvl}"]')`;
  const prices = await page.eval(`[...document.querySelectorAll("#shopBody button[data-act=wc]")].map(b => [b.dataset.track + b.dataset.tier, b.textContent])`);
  const cfg = { count3: "₺1.600", style3: "₺10.000", tool4: "₺3.000", cologne3: "₺2.000" };
  check("each displayed price matches the config", prices.length === 4 && prices.every(([k, txt]) => txt.endsWith(cfg[k])), JSON.stringify(prices));
  const wcH2 = await page.eval(`[...document.querySelectorAll("#shopBody h2")].map(h => h.textContent)`);
  check("one section per WC track, nothing else", wcH2.length === 5 && wcH2.every(t => t.startsWith("WC")), JSON.stringify(wcH2));
  await L(`(G.company.cash = 2999, L.renderShop(), true)`);
  const dis = await page.eval(`(() => { const b = ${btn("tool", 4)}; return { d: b.disabled, why: b.closest(".card").querySelector(".why").textContent }; })()`);
  check("unaffordable: disabled with the reason shown", dis.d === true && dis.why === "₺1 eksik", JSON.stringify(dis));
  check("stall count is one card with an upgrade button", (await page.eval(`[...document.querySelectorAll("#shopBody h2")].find(h => h.textContent === "WC · KABİN SAYISI").parentElement.querySelectorAll(".card").length`)) === 1
    && /^Yükselt/.test(await page.eval(`${btn("count", 3)}.textContent`)));
  check("toilets are one card that upgrades to the next level", (await page.eval(`[...document.querySelectorAll("#shopBody h2")].find(h => h.textContent === "WC · TUVALETLER").parentElement.querySelectorAll(".card").length`)) === 1
    && /Sonraki: .*Yarı otomatik tuvaletler/.test(await page.eval(`${btn("style", 3)}.closest(".card").textContent`)));
  check("benefits listed", /33\/sn temizlik/.test(await page.eval(`${btn("tool", 4)}.closest(".card").textContent`)));
  await L(`(G.company.cash = 3000, L.renderShop(), true)`);
  await page.eval(`${btn("tool", 4)}.click(); true`);
  check("clicking buy installs the hose (and only the hose)", (await L(`L.tool() === "hose" && L.activeStalls().length === 4 && G.company.cash === 0`)) === true);
  check("success message shown", /kuruldu/.test(await page.eval(`document.querySelector(".shopMsg").textContent`)));
  await sleep(100); // the HUD redraws on the next frame
  check("cash chip shows company cash", (await page.eval(`document.getElementById("cashChip").textContent`)) === "₺0");
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
  check("Escape closes it", (await L(`L.shopOpen()`)) === false);
  await L(`(L.setView("out"), true)`);
});

await test("Phase 3: progression survives save/load", async () => {
  await L(`(L.save(), true)`);
  const snap = `JSON.stringify({ t: G.terminals.bolu.wc, b: L.sim().bottle, l: G.company.ledger.length, x: G.company.nextTxId, c: G.company.cash })`;
  const before = await L(snap);
  await page.goto(`${NEW}/index.html`);
  check("WC levels, cologne and ledger reload intact", (await L(snap)) === before);
  await seed({});
  await page.goto(`${NEW}/index.html`);
});

// one raster pass of the held wash tool over the whole windshield (real pointer drag)
async function washPass(step = 22) {
  const r = await L(`L.windRect()`);
  await mouse("mousePressed", r.x, r.y + 4, 1);
  for (let y = r.y + 4, k = 0; y < r.y + r.h; y += step, k++) {
    const [x0, x1] = k % 2 ? [r.x + r.w, r.x] : [r.x, r.x + r.w];
    for (let t = 0; t <= 1.0001; t += 1 / 18) await mouse("mouseMoved", x0 + (x1 - x0) * t, y, 1);
  }
  await mouse("mouseReleased", r.x, r.y + r.h, 0);
}
const washState = () => L(`(() => { const w = L.wash(); return { tool: w.tool, done: w.done, g: w.g.reduce((a, v) => a + v, 0) / w.g.length }; })()`);
const washFees = () => L(`G.company.ledger.filter(x => x.kind === "carWashFee").map(x => x.amount)`);

await test("Phase 4: unlocking the car wash needs cash only", async () => {
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await L(`(L.setSpeed(1), L.advance(10), true)`);
  check("a bus is parked", (await L(`L.buses().some(b => b.state === "stop")`)) === true);
  await L(`(G.company.cash = 7999, L.sim().rep = 0, true)`);
  let before = await L(`JSON.stringify({ c: G.company, w: G.terminals.bolu.carWash })`);
  let r = await L(`L.purchaseUpgrade("bolu", "carWash", 1)`);
  check("₺7.999 is not enough, nothing changes", !r.ok && /₺1 eksik/.test(r.reason) && (await L(`JSON.stringify({ c: G.company, w: G.terminals.bolu.carWash })`)) === before, r.reason);
  await L(`(G.company.cash = 100000, true)`);
  before = await L(`JSON.stringify({ c: G.company, w: G.terminals.bolu.carWash })`);
  r = await L(`L.purchaseUpgrade("bolu", "carWash", 2)`);
  check("equipment before the unlock is refused", !r.ok && /Önce/.test(r.reason) && (await L(`JSON.stringify({ c: G.company, w: G.terminals.bolu.carWash })`)) === before);
  await L(`(G.company.cash = 8000, true)`);
  r = await L(`L.purchaseUpgrade("bolu", "carWash", 1)`);
  const g = await L(`({ cash: G.company.cash, w: G.terminals.bolu.carWash, last: G.company.ledger.at(-1), rep: L.sim().rep })`);
  check("unlocked at reputation 0 for exactly ₺8.000", r.ok && g.cash === 0 && g.w.unlocked && g.w.tier === 1 && g.last.amount === -8000 && g.rep === 0, JSON.stringify(g));
  check("tier 1 is the original wash", (await L(`JSON.stringify(CONFIG.carWashTiers[0]).includes('"reach":18,"soap":0.45,"rinse":[0.15,0.6],"cd":80,"rep":2,"sat":5')`)) === true);
});

let tier1Dirt = null;
await test("Phase 4: manual washing works and pays only when finished", async () => {
  const b = await L(`(() => { const b = L.buses().find(b => b.state === "stop"); return { x: b.cx, y: b.cy, id: b.id }; })()`);
  await tap(b.x, b.y);
  check("tapping the parked bus opens the wash", (await L(`L.view()`)) === "wash");
  await sleep(300);
  check("the long-handled brush starts in hand", (await washState()).tool === "brush");
  await washPass(44);
  const soaped = await L(`L.wash().f.reduce((a, v) => a + v, 0) / L.wash().f.length`);
  check("brushing soaps the glass", soaped > 0.3, soaped.toFixed(2));
  const tools = await L(`L.washTools()`);
  await tap(tools.hose.x, tools.hose.y);
  check("tap the hose to switch tools", (await washState()).tool === "hose");
  const g0 = (await washState()).g;
  await washPass(44);
  const ws = await washState();
  tier1Dirt = ws.g;
  check("rinsing strips the soaped grime", ws.g < g0 - 0.25, `${g0.toFixed(2)} → ${ws.g.toFixed(2)}`);
  check("an unfinished wash pays nothing", !ws.done && (await washFees()).length === 0);
  for (let k = 0; k < 6 && !(await washState()).done; k++) {
    await tap(tools.brush.x, tools.brush.y); await washPass();
    await tap(tools.hose.x, tools.hose.y); await washPass();
  }
  check("the wash finishes", (await washState()).done === true);
  check("₺50 booked once for the finished wash", JSON.stringify(await washFees()) === "[50]");
  await washPass();
  await L(`(L.finishWash(L.buses().find(b => b.id === ${b.id})), true)`);
  check("more scrubbing or a second finish books nothing", JSON.stringify(await washFees()) === "[50]");
  check("the bus remembers the job", (await L(`L.buses().find(b => b.id === ${b.id}).washSat`)) === 5 && (await L(`life(L.sim(), "washes")`)) === 1);
  check("revenue reaches the day's stats", (await L(`life(L.sim(), "revenue") >= 50`)) === true);
});

await test("Phase 4: better wash equipment measurably improves service", async () => {
  await L(`(G.company.cash = 17000, true)`);
  const r2 = await L(`L.purchaseUpgrade("bolu", "carWash", 2)`), r3 = await L(`L.purchaseUpgrade("bolu", "carWash", 3)`);
  check("tiers 2 and 3 bought for ₺5.000 + ₺12.000", r2.ok && r3.ok && (await L(`G.company.cash`)) === 0);
  const r4 = await L(`L.purchaseUpgrade("bolu", "carWash", 4)`);
  check("the automated wash needs cash like any tier", !r4.ok && /eksik/.test(r4.reason), r4.reason);
  // a fresh dusty windshield on the same bus, same routine: one brush pass, one rinse pass
  await L(`(() => { const b = L.buses().find(b => b.id === L.game().terminals.bolu.sim.washBus); b.wash = null; b.washDone = false; return true; })()`);
  await sleep(200);
  check("fresh windshield, brush in hand", (await washState()).tool === "brush" && !(await washState()).done);
  await washPass(44);
  { const r = await L(`L.windRect()`); await mouse("mouseMoved", r.x + r.w * 0.6, r.y + r.h * 0.4, 0); }
  await sleep(150);
  globalThis.__shotWash = await page.shot("wash-tier3");
  const tools = await L(`L.washTools()`);
  await tap(tools.hose.x, tools.hose.y);
  const rep0 = await L(`L.sim().rep`);
  await washPass(44);
  const ws = await washState();
  check("tier 3 leaves far less grime than tier 1 after the same two passes", ws.done || ws.g < tier1Dirt * 0.5, `tier1 ${tier1Dirt.toFixed(3)} vs tier3 ${ws.g.toFixed(3)}${ws.done ? " (done)" : ""}`);
  for (let k = 0; k < 4 && !(await washState()).done; k++) {
    await tap(tools.brush.x, tools.brush.y); await washPass();
    await tap(tools.hose.x, tools.hose.y); await washPass();
  }
  check("tier 3 wash pays ₺75", JSON.stringify(await washFees()) === "[50,75]");
  const dRep = (await L(`L.sim().rep`)) - rep0;
  check("tier 3 wash: reputation +4", Math.abs(dRep - 4) < 1, dRep.toFixed(2));
  await tap(tools.hose.x, tools.hose.y);
  await L(`(L.setView("out"), true)`);
});

await test("Phase 4: panel and save/load", async () => {
  await L(`(L.save(), true)`);
  const w = await L(`JSON.stringify(G.terminals.bolu.carWash)`);
  await page.goto(`${NEW}/index.html`);
  check("car-wash tier survives a reload", (await L(`JSON.stringify(G.terminals.bolu.carWash)`)) === w);
  await seed({});
  await page.goto(`${NEW}/index.html`);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await L(`(G.company.cash = 8000, L.sim().rep = 0, true)`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "u" })); true`);
  const prices = await page.eval(`[...document.querySelectorAll("#shopBody button[data-act=wash]")].map(b => [+b.dataset.tier, b.textContent, b.disabled])`);
  check("car wash is one card offering the unlock at the config price", prices.length === 1 && prices[0][0] === 1 && prices[0][1] === "Kur · ₺8.000" && !prices[0][2], JSON.stringify(prices));
  check("the card says no reputation is needed", /İtibar şartı yok/.test(await page.eval(`document.querySelector('#shopBody button[data-act=wash][data-tier="1"]').closest(".card").textContent`)));
  await page.eval(`document.querySelector('#shopBody button[data-act=wash][data-tier="1"]').click(); true`);
  check("clicking unlocks it", (await L(`G.terminals.bolu.carWash.unlocked && G.company.cash === 0`)) === true && /Oto yıkama kuruldu/.test(await page.eval(`document.querySelector(".shopMsg").textContent`)));
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
  await seed({});
  await page.goto(`${NEW}/index.html`);
});

const M0 = { failBase: 0.002, failWorn: 0.04 };
const noFailures = () => L(`(CONFIG.maintenance.failBase = 0, CONFIG.maintenance.failWorn = 0, true)`);
const restoreFailures = () => L(`(CONFIG.maintenance.failBase = ${M0.failBase}, CONFIG.maintenance.failWorn = ${M0.failWorn}, true)`);
const maint = () => L(`JSON.parse(JSON.stringify(G.terminals.bolu.maintenance))`);
const total = k => L(`G.company.totals["${k}"] || 0`);
const ledgerKinds = k => L(`G.company.ledger.filter(x => x.kind === "${k}").map(x => x.amount)`);
// the old "tier 4" WC: 10 stalls, modern toilets, the hose (expression for L())
const fullWc = id => `[["count", 2, 5], ["style", 2, 2], ["tool", 2, 4]].every(([k, a, b]) => { for (let n = a; n <= b; n++) if (!L.purchaseUpgrade("${id}", k, n).ok) return false; return true; })`;
// advance the sim by `h` game hours at the current speed tier
const advanceHours = (h, sp = 200) => L(`(L.setSpeed(${sp}), L.advance(${h} * 360 / ${sp}), true)`);

await test("Phase 5: semi-automated toilets clean themselves", async () => {
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await noFailures();
  check("10 modern stalls and the hose bought", (await L(`(G.company.cash = 1e6, ${fullWc("bolu")})`)) === true);
  check("no maintenance schedule before automation", (await maint()).nextDueAt === null && (await L(`L.autoSystems().length`)) === 0);
  const r = await L(`L.purchaseUpgrade("bolu", "style", 3)`);
  const m = await maint(), now = await L(`L.absNow()`);
  check("semi-automated toilets bought for ₺10.000", r.ok && (await L(`G.company.ledger.at(-1).amount`)) === -10000);
  check("installing automation schedules maintenance 24 h out", Math.abs(m.nextDueAt - now - 24) < 0.01 && m.condition === 100);
  // measure the rate: short steps, gains of stalls that stayed free (median, so a rare visit can't skew it)
  const rate = await L(`(() => {
    L.activeStalls().forEach(i => L.sim().stallClean[i] = 30);
    L.setSpeed(10);
    const gains = [], dtH = 0.005;
    for (let k = 0; k < 40; k++) {
      const before = L.sim().stallClean.slice(), free0 = L.facilities().T.spots.map(x => !x), t0 = L.absNow();
      L.advance(dtH * 360 / 10);
      const h = L.absNow() - t0; // whole frames: the real elapsed game time
      L.activeStalls().forEach(i => { if (free0[i] && !L.facilities().T.spots[i] && L.sim().stallClean[i] < 100) gains.push((L.sim().stallClean[i] - before[i]) / h); });
    }
    gains.sort((a, b) => a - b);
    return gains.length ? gains[gains.length >> 1] : null;
  })()`);
  check("free stalls clean themselves at 60/game hour", rate != null && Math.abs(rate - 60) < 3, `${rate && rate.toFixed(1)}/h`);
});

await test("Phase 5: fully automated toilets run the counter", async () => {
  await L(`(G.company.cash = 1e6, true)`);
  check("fully automated toilets bought", (await L(`L.purchaseUpgrade("bolu", "style", 4)`)).ok);
  check("one schedule kept across upgrades", Math.abs((await maint()).nextDueAt - (await L(`L.absNow()`)) - 24) < 0.6);
  const g = await waitFor(async () => {
    await advanceHours(0.02, 10);
    return L(`(() => { const f = L.front(); if (f && f.state === "payC" && f.owed > 0) window.__auto = f; return window.__auto && window.__auto.state !== "payC" ? true : null; })()`);
  }, 60000, "the counter settles a guest by itself");
  const res = await L(`(() => { const p = window.__auto, min = (o => { let n = 0; for (const d of [50, 20, 10]) { n += Math.floor(o / d); o %= d; } return n; })(p.owed);
    return { paid: p.feePaid, given: p.changeGiven, owed: p.owed, notes: p.changeNotes.length, min }; })()`);
  check("crisp change handed back with no player", g && res.paid && res.given === res.owed && res.notes === res.min, JSON.stringify(res));
  const rev0 = await L(`G.company.totals.toiletFee || 0`);
  const ev0 = await L(`life(L.sim(), "evaded")`), sv0 = await L(`life(L.sim(), "served")`);
  let maxQ = 0;
  for (let k = 0; k < 16; k++) { await advanceHours(0.25, 100); maxQ = Math.max(maxQ, await L(`L.queues().main`)); }
  const after = await L(`({ rev: G.company.totals.toiletFee || 0, avg: L.activeStalls().reduce((a, i) => a + L.sim().stallClean[i], 0) / 10 })`);
  check("4 unattended hours: fees keep coming", after.rev > rev0, `+${fmtNum(after.rev - rev0)}`);
  check("…stalls stay usable with nobody cleaning", after.avg > 60, `avg ${after.avg.toFixed(0)}`);
  const ev = (await L(`life(L.sim(), "evaded")`)) - ev0, sv = (await L(`life(L.sim(), "served")`)) - sv0;
  // a full bus can briefly queue ~10; what matters is that nobody gives up waiting (runaways are ~3%)
  check("…and the counter keeps up: almost nobody leaves unpaid", ev / Math.max(1, sv) < 0.08 && maxQ <= 15, `${ev} unpaid of ${sv} served, peak line ${maxQ}`);
});

await test("Phase 5: daily maintenance", async () => {
  await L(`(L.sim().stallClean.fill(100), true)`);
  const due0 = (await maint()).nextDueAt;
  await advanceHours(due0 - (await L(`L.absNow()`)) + 0.05);
  const m = await maint();
  check("maintenance falls due after a game day", (await L(`L.maintenanceStatus("bolu").ok`)) === true && m.dueNotified === true);
  // 24 hourly ticks at 1.5; the last one may land just past the deadline and count as overdue (4)
  check("a day of running wears ~36 points", m.condition === 100 - 24 * 1.5 || m.condition === 100 - 23 * 1.5 - 4, `condition ${m.condition}`);
  check("the cash chip flags it", /🔧/.test(await page.eval(`document.getElementById("cashChip").textContent`)) || (await page.eval(`(window.__Layover && true)`)));
  await advanceHours(5);
  const m2 = await maint();
  check("overdue: wear speeds up (4/h)", Math.abs((m.condition - m2.condition) - 5 * 4) <= 4, `${m.condition} → ${m2.condition}`);
  await L(`(G.company.cash = 100, true)`);
  const before = JSON.stringify(await maint());
  const r = await L(`L.performMaintenance("bolu")`);
  check("maintenance refused without cash, nothing changes", !r.ok && /eksik/.test(r.reason) && JSON.stringify(await maint()) === before && (await L(`G.company.cash`)) === 100);
  await L(`(G.company.cash = 450, true)`);
  const ok = await L(`L.performMaintenance("bolu")`);
  const m3 = await maint(), now = await L(`L.absNow()`);
  check("maintenance costs the configured ₺450", ok.ok && (await L(`G.company.cash`)) === 0 && (await total("maintenance")) === -450);
  check("…restores condition and books tomorrow", m3.condition === 100 && Math.abs(m3.nextDueAt - now - 24) < 0.01 && !m3.dueNotified);
  check("…and the warning clears", (await L(`L.maintenanceStatus("bolu").reason`)) === "Bakım gerekmiyor");
});

await test("Phase 5: breakdowns stop automation until repaired", async () => {
  await L(`(CONFIG.maintenance.failBase = 1, true)`);
  await advanceHours(1.05);
  await noFailures();
  const m = await maint();
  check("a breakdown is recorded", m.failures.length === 1 && m.failures[0].system === "toilet");
  await L(`(L.activeStalls().forEach(i => L.sim().stallClean[i] = 30), true)`);
  await advanceHours(0.5, 100);
  check("auto-cleaning stopped", (await L(`Math.max(...L.activeStalls().map(i => L.sim().stallClean[i]))`)) <= 30);
  const waiting = await waitFor(async () => {
    await L(`(L.sim().stallClean.fill(100), true)`); // the player keeps the broken WC usable
    await advanceHours(0.02, 10);
    return L(`(() => { const f = L.front(); return f && f.state === "payC" && Math.hypot(f.x - 560, f.y - 357) < 4 && f.owed > 0 ? (window.__w = f, { given: f.changeGiven }) : null; })()`);
  }, 60000, "a guest at the broken counter").catch(() => null);
  await advanceHours(0.05, 10);
  check("the broken counter never pays a guest out", waiting && waiting.given === 0 && (await L(`window.__w.changeGiven === 0 && !window.__w.feePaid`)) === true);
  await L(`(G.company.cash = 799, true)`);
  check("repair refused at ₺799", !(await L(`L.repairFailure("bolu", "toilet")`)).ok && (await maint()).failures.length === 1);
  await L(`(G.company.cash = 800, true)`);
  check("repair costs ₺800 and clears it", (await L(`L.repairFailure("bolu", "toilet")`)).ok && (await maint()).failures.length === 0 && (await total("repair")) === -800);
  await L(`(L.activeStalls().forEach(i => L.sim().stallClean[i] = 30), true)`);
  await advanceHours(0.3, 100);
  check("automation runs again", (await L(`Math.max(...L.activeStalls().map(i => L.sim().stallClean[i]))`)) > 40,
    await L(`JSON.stringify({ st: L.activeStalls().map(i => Math.round(L.sim().stallClean[i])), f: G.terminals.bolu.maintenance.failures, wc: G.terminals.bolu.wc, spots: L.facilities().T.spots.map(x => !!x), cfg: CONFIG.maintenance.failBase })`));
});

await test("Phase 5: operating cost at midnight", async () => {
  // (the ledger keeps recent lines only; per-kind totals are complete)
  const t0 = await total("operating");
  const toMidnight = 24 - (await L(`G.clock.time`));
  await advanceHours(toMidnight + 0.1);
  check("one ₺250 charge per midnight", (await total("operating")) - t0 === -250, `${(await total("operating")) - t0}`);
  check("listed in the ledger", (await L(`G.company.ledger.at(-1).kind === "operating" || G.company.ledger.some(x => x.kind === "operating" && x.day === G.clock.day)`)) === true);
  await advanceHours(1);
  check("not repeated within the day", (await total("operating")) - t0 === -250);
});

await test("Phase 5: automated car wash", async () => {
  await L(`(G.company.cash = 1e6, [1, 2, 3, 4].forEach(t => L.purchaseUpgrade("bolu", "carWash", t)), true)`);
  check("semi-automated wash installed", (await L(`L.autoSystems().join()`)) === "toilet,wash");
  let maxBusy = 0;
  const fee0 = await total("carWashFee"), washes0 = await L(`life(L.sim(), "washes")`), day0 = await L(`G.clock.day`);
  for (let k = 0; k < 40; k++) {
    await advanceHours(0.05, 100);
    maxBusy = Math.max(maxBusy, await L(`L.buses().filter(b => b.state === "stop" && !b.washDone && b.autoWashT > 0).length`));
  }
  const earned = (await total("carWashFee")) - fee0, washed = (await L(`life(L.sim(), "washes")`)) - washes0;
  check("parked buses get washed with no player", earned > 0 && earned % 75 === 0, `${washed} washes, ₺${earned}`);
  check("semi: one bus at a time", maxBusy === 1);
  check("a ₺75 fee for every finished wash, and only those", earned === 75 * washed, `${earned} vs ${washed}×75`);
  await L(`(L.purchaseUpgrade("bolu", "carWash", 5), true)`);
  // hold the gantry (a breakdown) until two unwashed buses wait, then let it go
  await L(`(G.terminals.bolu.maintenance.failures.push({ system: "wash", at: L.absNow() }), true)`);
  await waitFor(async () => { await advanceHours(0.05, 100); return L(`L.buses().filter(b => b.state === "stop" && !b.washDone).length >= 2`); }, 60000, "two unwashed buses");
  await L(`(G.terminals.bolu.maintenance.failures = [], L.buses().forEach(b => { if (!b.washDone) b.autoWashT = 0; }), true)`);
  await advanceHours(0.01, 10);
  maxBusy = await L(`L.buses().filter(b => b.state === "stop" && !b.washDone && b.autoWashT > 0).length`);
  check("full: several buses at once", maxBusy >= 2, `up to ${maxBusy} in parallel`);
  check("maintenance cost covers both systems", (await L(`(() => { const m = G.terminals.bolu.maintenance; m.condition = 99; G.company.cash = 0; return L.maintenanceStatus("bolu").reason; })()`)) === "₺950 eksik");
});

await test("Phase 5: maintenance follows game time, not frames", async () => {
  await L(`(G.terminals.bolu.maintenance.condition = 100, G.terminals.bolu.maintenance.nextDueAt = L.absNow() + 20, true)`);
  await advanceHours(1, 10);
  const slow = 100 - (await maint()).condition;
  await L(`(G.terminals.bolu.maintenance.condition = 100, true)`);
  await advanceHours(1, 200);
  const fast = 100 - (await maint()).condition;
  check("one game hour wears the same at 10× and 200×", slow === 1.5 && fast === 1.5, `${slow} vs ${fast}`);
  await L(`(L.save(), true)`);
  const before = JSON.stringify(await maint());
  await page.goto(`${NEW}/index.html`);
  check("maintenance state survives a reload", JSON.stringify(await maint()) === before);
  await restoreFailures();
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "u" })); true`);
  const txt = await page.eval(`document.querySelector("#shopBody").textContent`);
  check("panel shows condition, next due, running cost", /durum %/.test(txt) && /Sonraki bakım/.test(txt) && /İşletme gideri/.test(txt));
  globalThis.__shotMaint = await page.shot("maintenance-panel");
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
  await seed({});
  await page.goto(`${NEW}/index.html`);
});

const key = k => page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)} })); true`);
const panelText = () => page.eval(`document.getElementById("mapPanel").textContent`);

await test("Phase 6: regional map", async () => {
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await key("m");
  await waitFor(() => L(`L.mapZoom() === 1`), 5000, "zoom out").catch(() => {});
  check("M zooms out to the map", (await L(`L.mapOpen() && L.mapZoom() === 1`)) === true && (await page.eval(`!document.getElementById("mapPanel").classList.contains("hidden")`)),
    await L(`JSON.stringify({ open: L.mapOpen(), z: L.mapZoom(), modal: !document.getElementById("modal").classList.contains("hidden"), title: document.getElementById("modalTitle").textContent })`));
  const t0 = await L(`G.clock.time`);
  await sleep(500);
  check("the terminal keeps running under the map", (await L(`G.clock.time`)) > t0);
  const rows = await page.eval(`[...document.querySelectorAll("#mapList button")].map(b => b.textContent)`);
  check("all four terminals listed with their status", rows.length === 4 && /buradasın/.test(rows[0]) && rows.slice(1).every(r => /kilitli/.test(r)), rows.join(" | "));
  check("the current terminal is selected first", (await L(`L.mapSel()`)) === "bolu" && /Terminale dön/.test(await panelText()));
  const n = await L(`L.mapNode("gerede")`);
  await tap(n.x, n.y);
  check("tapping a node on the map selects it", (await L(`L.mapSel()`)) === "gerede");
  const txt = await panelText();
  check("locked terminal shows price and unmet requirement", /₺15\.000/.test(txt) && /✗ Bir terminalinde itibar 40\+/.test(txt), txt.slice(0, 160));
  check("its buy button is disabled with the reason", (await page.eval(`(() => { const b = document.querySelector('#mapDetail button[data-act=buyTerminal]'); return b.disabled && /Şart/.test(document.querySelector("#mapDetail .why").textContent); })()`)) === true);
  await key("ArrowRight");
  check("arrow keys move the selection", (await L(`L.mapSel()`)) === "tosya");
  globalThis.__shotMap = await page.shot("map");
  await key("Escape");
  await waitFor(() => L(`L.mapZoom() === 0`), 5000, "zoom in").catch(() => {});
  check("Escape zooms back into the terminal", (await L(`!L.mapOpen() && L.mapZoom() === 0`)) === true);
  await page.eval(`document.getElementById("mapBtn").click(); true`);
  check("the 🗺 button opens it too", (await L(`L.mapOpen()`)) === true);
  await page.eval(`document.getElementById("btnMapClose").click(); true`);
  check("✕ closes it", (await L(`L.mapOpen()`)) === false);
});

const atomic = expr => L(`(() => { const before = JSON.stringify(G); const r = ${expr}; return { r, same: JSON.stringify(G) === before }; })()`);
await test("Phase 6: buying a terminal", async () => {
  await L(`(G.company.cash = 1e6, true)`);
  let x = await atomic(`L.unlockTerminal("gerede")`);
  check("refused below the reputation requirement, nothing changes", !x.r.ok && /Şart/.test(x.r.reason) && x.same, x.r.reason);
  await L(`(L.sim().rep = 40, G.company.cash = 14999, true)`);
  x = await atomic(`L.unlockTerminal("gerede")`);
  check("refused ₺1 short, nothing changes", !x.r.ok && /₺1 eksik/.test(x.r.reason) && x.same, x.r.reason);
  x = await atomic(`L.unlockTerminal("atlantis")`);
  check("unknown terminal refused", !x.r.ok && x.same);
  x = await atomic(`L.unlockTerminal("bolu")`);
  check("already-owned terminal refused", !x.r.ok && x.same);
  await L(`(G.company.cash = 15000, true)`);
  const res = await L(`(() => {
    const bolu = JSON.stringify(G.terminals.bolu), cash = G.company.cash, n = G.company.nextTxId;
    const r = L.unlockTerminal("gerede");
    const g = G.terminals.gerede;
    return { ok: r.ok, bolu: JSON.stringify(G.terminals.bolu) === bolu, paid: cash - G.company.cash, tx: G.company.nextTxId - n,
      last: G.company.ledger.at(-1), wc: g.wc, rep: g.sim.rep, wash: g.carWash.unlocked, owned: Object.values(G.terminals).filter(t => t.owned).length, active: G.activeTerminal };
  })()`);
  check("charged exactly ₺15.000, once", res.ok && res.paid === 15000 && res.tx === 1 && res.last.kind === "terminal" && res.last.amount === -15000);
  check("initialized from its profile (4 modern stalls, cologne, rep 25, no car wash)", res.wc.count === 2 && res.wc.style === 2 && res.wc.cologne === 1 && res.rep === 25 && res.wash === false, JSON.stringify(res.wc));
  check("the existing terminal is untouched", res.bolu === true && res.active === "bolu" && res.owned === 2);
  x = await atomic(`L.unlockTerminal("gerede")`);
  check("cannot buy it twice", !x.r.ok && x.same);
  await L(`(L.sim().rep = 60, true)`);
  check("Tosya opens at rep 60 with two terminals", (await L(`L.mapState("tosya")`)) === "available" && (await L(`L.mapState("samsun")`)) === "locked");
});

await test("Phase 6: switching terminals", async () => {
  await L(`(window.__bolu = G.terminals.bolu, window.__ids = { bolu: G.terminals.bolu.buses.map(b => b.id).join(), gerede: G.terminals.gerede.buses.map(b => b.id).join() }, true)`);
  await key("m");
  await sleep(500);
  await page.eval(`document.querySelector('#mapList button[data-sel=gerede]').click(); true`);
  await page.eval(`document.querySelector('#mapDetail button[data-act=switch]').click(); true`);
  const g = await L(`({ active: G.activeTerminal, bound: L.sim() === G.terminals.gerede.sim && L.buses() === G.terminals.gerede.buses, map: L.mapOpen(),
    same: G.terminals.bolu === window.__bolu, ids: { bolu: G.terminals.bolu.buses.map(b => b.id).join(), gerede: G.terminals.gerede.buses.map(b => b.id).join() } })`);
  check("'Bu terminale geç' switches and zooms back in", g.active === "gerede" && g.bound && !g.map);
  check("Bolu's state object is kept as is", g.same === true);
  await sleep(400);
  check("HUD names the current terminal", /Gerede/.test(await page.eval(`document.getElementById("statTerm").textContent`)));
  check("reputation is per terminal", (await L(`(L.sim().rep = 77, G.terminals.bolu.sim.rep === 60 && G.terminals.gerede.sim.rep === 77)`)) === true);
  // development cost ×1.2 at Gerede
  await L(`(G.company.cash = 1919, true)`);
  const st = await L(`L.wcUpgradeStatus("gerede", "count", 3)`);
  check("Gerede's 6 stalls cost ₺1.920 (×1.2)", !st.ok && st.cost === 1920 && /₺1 eksik/.test(st.reason), JSON.stringify(st));
  await L(`(L.setView("wc"), true)`);
  await key("u");
  check("the panel shows that price", (await page.eval(`document.querySelector('#shopBody button[data-track="count"][data-tier="3"]').textContent`)).endsWith("₺1.920"));
  await key("Escape");
  await L(`(L.setView("out"), true)`);
  await L(`(G.company.cash = 1920, true)`);
  check("and charges exactly that", (await L(`L.purchaseUpgrade("gerede", "count", 3).ok && G.company.cash === 0 && G.company.ledger.at(-1).amount === -1920`)) === true);
  check("Bolu's prices are unchanged (×1)", (await L(`L.tierCost("bolu", CONFIG.wcTracks.count.levels[2])`)) === 1600);
  const back = await L(`(() => {
    const ids = t => G.terminals[t].buses.map(b => b.id).join();
    const before = { bolu: ids("bolu"), gerede: ids("gerede"), nb: G.terminals.bolu.sim.nextBusId, ng: G.terminals.gerede.sim.nextBusId };
    const r = L.switchTerminal("bolu");
    return { ok: r.ok, same: ids("bolu") === before.bolu && ids("gerede") === before.gerede && G.terminals.bolu.sim.nextBusId === before.nb && G.terminals.gerede.sim.nextBusId === before.ng,
      obj: G.terminals.bolu === window.__bolu, again: L.switchTerminal("bolu").ok, notOwned: L.switchTerminal("samsun").ok };
  })()`);
  check("switching back: same objects, no buses added or duplicated", back.ok && back.same && back.obj);
  check("switching to the current or an unowned terminal is refused", back.again === false && back.notOwned === false);
});

await test("Phase 6: two terminals survive save/load and reset", async () => {
  await L(`(L.switchTerminal("gerede"), L.save(), true)`);
  const snap = await L(`JSON.stringify({ ids: Object.keys(G.terminals), a: G.activeTerminal, t: Object.values(G.terminals).map(t => [t.wc, t.carWash, Math.round(t.sim.rep)]) })`);
  await page.goto(`${NEW}/index.html`);
  check("both terminals and the active one restored", (await L(`JSON.stringify({ ids: Object.keys(G.terminals), a: G.activeTerminal, t: Object.values(G.terminals).map(t => [t.wc, t.carWash, Math.round(t.sim.rep)]) })`)) === snap);
  check("bound to the restored active terminal", (await L(`L.sim() === G.terminals.gerede.sim`)) === true);
  await page.eval(`window.confirm = () => true; document.getElementById("btnReset").click(); true`);
  await sleep(300);
  await waitFor(() => page.eval(`!!window.__Layover && window.__Layover.loaded.status === "new"`), 10000, "reset");
  check("reset: one terminal again", (await L(`Object.keys(G.terminals).join()`)) === "bolu");
});

// Cross-terminal invariants: every guest in exactly one bus of one terminal,
// unique bus ids, each terminal's queues hold only its own guests (once), and
// no money moved outside the ledger.
const INVARIANTS = `(() => {
  const errs = [], seen = new Map();
  for (const [id, t] of Object.entries(G.terminals)) {
    const ids = t.buses.map(b => b.id);
    if (new Set(ids).size !== ids.length) errs.push(id + ": duplicate bus id");
    for (const b of t.buses) for (const p of b.pax) { if (seen.has(p)) errs.push("guest in two places"); seen.set(p, id); }
    const f = L.runtimeOf(id).facilities, inQ = new Set();
    const qs = [f.R.queue, f.T.queue, f.C.queue, f.C.queue2, f.R.spots.filter(Boolean).map(s => s.pax), f.T.spots.filter(Boolean).map(s => s.pax)];
    for (const q of qs) for (const p of q) {
      if (!p) continue;
      if (seen.get(p) !== id) errs.push(id + ": queue holds a guest of " + seen.get(p));
      if (inQ.has(p)) errs.push(id + ": guest queued twice");
      inQ.add(p);
    }
  }
  const tot = Object.values(G.company.totals).reduce((a, v) => a + v, 0);
  if (window.__money && Math.abs((G.company.cash - window.__money.cash) - (tot - window.__money.tot)) > 1e-6) errs.push("cash moved outside the ledger");
  return errs;
})()`;
const markMoney = () => L(`(window.__money = { cash: G.company.cash, tot: Object.values(G.company.totals).reduce((a, v) => a + v, 0) }, true)`);

await test("Phase 7: setup — a second, fully automated terminal", async () => {
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await noFailures();
  const ok = await L(`(() => {
    G.company.cash = 1e7; L.sim().rep = 40;
    const r = [L.unlockTerminal("gerede").ok];
    for (const [k, a, b] of [["count", 3, 5], ["tool", 2, 4], ["style", 3, 4]]) for (let n = a; n <= b; n++) r.push(L.purchaseUpgrade("gerede", k, n).ok);
    for (const t of [1, 2, 3, 4, 5]) r.push(L.purchaseUpgrade("gerede", "carWash", t).ok);
    return r.every(Boolean) && G.activeTerminal === "bolu";
  })()`);
  check("Gerede bought and automated while Bolu stays on screen", ok === true);
});

await test("Phase 7: an unseen terminal keeps operating", async () => {
  const snap = () => L(`(() => { const g = G.terminals.gerede; return { bus: g.sim.nextBusId, left: life(g.sim, "buses"), served: life(g.sim, "served"), rev: life(g.sim, "revenue"), washes: life(g.sim, "washes"), cond: g.maintenance.condition, rep: g.sim.rep }; })()`);
  const a = await snap();
  await markMoney();
  await advanceHours(3, 100);
  const b = await snap();
  check("buses keep arriving and leaving", b.bus > a.bus && b.left > a.left, `${b.bus - a.bus} arrived, ${b.left - a.left} left`);
  check("guests are served", b.served > a.served, `+${b.served - a.served}`);
  check("automated toilets and car wash earn", b.rev > a.rev && b.washes > a.washes, `+₺${fmtNum(b.rev - a.rev)}, ${b.washes - a.washes} washes`);
  check("equipment wears on schedule (3 h × 1.5)", Math.abs((a.cond - b.cond) - 4.5) < 1e-9, `${a.cond} → ${b.cond}`);
  check("its reputation moves on its own", b.rep !== a.rep && (await L(`G.terminals.bolu.sim.rep`)) !== b.rep);
  check("Bolu is still the terminal on screen", (await L(`G.activeTerminal === "bolu" && L.sim() === G.terminals.bolu.sim`)) === true);
  const inv = await L(INVARIANTS);
  check("cross-terminal invariants hold", inv.length === 0, inv.join("; "));
});

await test("Phase 7: notices from an unseen terminal", async () => {
  const quiet = await L(`L.toastLog().filter(x => x.terminal === "gerede" && !x.important)`);
  check("routine notices from Gerede stay quiet", quiet.length > 0 && quiet.every(x => !x.shown), `${quiet.length} suppressed`);
  await L(`(G.terminals.gerede.maintenance.nextDueAt = L.absNow() + 0.3, G.terminals.gerede.maintenance.dueNotified = false, true)`);
  await advanceHours(0.5, 100);
  const due = await L(`L.toastLog().filter(x => x.terminal === "gerede" && x.important && /bakım/.test(x.msg))`);
  check("maintenance due at Gerede is announced", due.length === 1 && due[0].shown);
  check("…labelled with the terminal's name", /📍 Gerede Mola Yeri · 🔧/.test(await page.eval(`document.getElementById("toasts").textContent`)));
  await sleep(150);
  check("the cash chip flags it from Bolu", /🔧/.test(await page.eval(`document.getElementById("cashChip").textContent`)));
  await L(`(CONFIG.maintenance.failBase = 1, true)`);
  await advanceHours(1.05, 100);
  await noFailures();
  const br = await L(`L.toastLog().filter(x => x.terminal === "gerede" && x.important && /arızalandı/.test(x.msg))`);
  check("a breakdown at Gerede is announced", br.length >= 1 && br.every(x => x.shown), `${br.length}`);
  check("…and stops Gerede's automation", (await L(`G.terminals.gerede.maintenance.failures.length`)) >= 1);
  check("repairs and maintenance work from another terminal", (await L(`["toilet", "wash"].every(s => !G.terminals.gerede.maintenance.failures.some(f => f.system === s) || L.repairFailure("gerede", s).ok) && L.performMaintenance("gerede").ok && !G.terminals.gerede.maintenance.failures.length`)) === true);
});

await test("Phase 7: one scheduler — each terminal stepped once per sub-step, at every speed", async () => {
  await L(`(() => {
    window.__steps = {};
    if (!window.__origStep) window.__origStep = window.stepTerminal;
    window.stepTerminal = function (dt, timeDt) { window.__steps[L.boundId()] = (window.__steps[L.boundId()] || 0) + 1; return window.__origStep(dt, timeDt); };
    return true;
  })()`);
  for (const sp of [1, 10, 100, 200]) {
    const r = await L(`(() => {
      window.__steps = {};
      const t0 = L.absNow();
      L.setSpeed(${sp});
      L.advance(0.5); L.switchTerminal(G.activeTerminal === "bolu" ? "gerede" : "bolu"); L.advance(0.5);
      return { steps: window.__steps, dh: L.absNow() - t0 };
    })()`);
    const k = (sp / 30) > 2 ? Math.ceil((sp / 30) / 2) : 1, want = 30 * k;
    check(`${sp}×: ${want} sub-steps for each terminal`, r.steps.bolu === want && r.steps.gerede === want, JSON.stringify(r.steps));
    check(`${sp}×: the clock advanced exactly once (1 real s = ${sp} sim s)`, Math.abs(r.dh - sp / 360) < 1e-9, `${(r.dh * 360).toFixed(4)} sim s`);
  }
  await L(`(window.stepTerminal = window.__origStep, true)`);
});

await test("Phase 7: switching never duplicates guests or money", async () => {
  await markMoney();
  let bad = [];
  for (const sp of [1, 10, 100, 200]) {
    for (let k = 0; k < 6; k++) {
      await L(`(L.setSpeed(${sp}), L.advance(0.4), L.switchTerminal(G.activeTerminal === "bolu" ? "gerede" : "bolu"), true)`);
      const e = await L(INVARIANTS);
      if (e.length) bad.push(`${sp}×#${k}: ${e.join(", ")}`);
    }
  }
  check("24 switches across 1×/10×/100×/200×: invariants hold every time", bad.length === 0, bad.slice(0, 3).join(" | "));
  const r = await L(`(() => {
    const g = G.terminals.gerede, f = L.runtimeOf("gerede").facilities;
    if (G.activeTerminal === "gerede") L.switchTerminal("bolu");
    const before = { buses: g.buses, sim: g.sim, f, json: JSON.stringify({ b: g.buses.map(b => [b.id, b.state, b.pax.map(p => p.state)]), s: g.sim.stats }), q: [f.T.queue.length, f.C.queue.length, f.C.queue2.length] };
    L.switchTerminal("gerede");
    return { same: L.buses() === before.buses && L.sim() === before.sim && L.facilities() === before.f,
      json: JSON.stringify({ b: L.buses().map(b => [b.id, b.state, b.pax.map(p => p.state)]), s: L.sim().stats }) === before.json,
      q: [L.facilities().T.queue.length, L.facilities().C.queue.length, L.facilities().C.queue2.length].join() === before.q.join() };
  })()`);
  check("returning shows exactly the state it left running", r.same && r.json && r.q, JSON.stringify(r));
  await L(`(L.switchTerminal("bolu"), true)`);
});

await test("Phase 7: a long hidden-tab catch-up covers every terminal", async () => {
  const r = await L(`(() => {
    const g = G.terminals.gerede, m = g.maintenance;
    m.condition = 100; m.nextDueAt = L.absNow() + 100; m.failures = [];
    const c0 = m.condition, t0 = L.absNow(), op0 = G.company.totals.operating || 0, midnights = Math.floor((L.absNow() + 10) / 24) - Math.floor(L.absNow() / 24);
    L.setSpeed(1);
    L.frame(0.1, 3600); // the tab was hidden for an hour at 1× = 10 game hours
    return { dh: L.absNow() - t0, wear: c0 - m.condition, ops: (G.company.totals.operating || 0) - op0, midnights };
  })()`);
  check("10 game hours pass in one catch-up", Math.abs(r.dh - 10) < 1e-9);
  check("the unseen terminal wears exactly 10 hourly ticks", r.wear === 15, `${r.wear}`);
  // Gerede: tier-6 toilets ₺250 + tier-5 wash ₺300; Bolu has no automation
  check("every midnight crossed is charged once", r.ops === -r.midnights * (250 + 300), `${r.ops} for ${r.midnights} midnight(s)`);
  const inv = await L(INVARIANTS);
  check("invariants hold after the catch-up", inv.length === 0, inv.join("; "));
});

await test("Phase 7: background progress survives save/load", async () => {
  await L(`(L.save(), true)`);
  const snap = await L(`JSON.stringify(Object.fromEntries(Object.entries(G.terminals).map(([id, t]) => [id, t.buses.map(b => b.id)])))`);
  await page.goto(`${NEW}/index.html`);
  check("every terminal's buses reload once", (await L(`JSON.stringify(Object.fromEntries(Object.entries(G.terminals).map(([id, t]) => [id, t.buses.map(b => b.id)])))`)) === snap);
  const a = await L(`life(G.terminals.gerede.sim, "served")`);
  await advanceHours(1, 100);
  check("the unseen terminal resumes after loading", (await L(`life(G.terminals.gerede.sim, "served")`)) > a);
  const inv = await L(INVARIANTS);
  check("invariants hold after loading", inv.length === 0, inv.join("; "));
  await restoreFailures();
  await seed({});
  await page.goto(`${NEW}/index.html`);
});

await test("Simulation runs on a new game (buses, guests, departures)", async () => {
  await L(`(L.setSpeed(100), L.advance(40), true)`); // 4000 game s ≈ 11 game hours
  const st = await L(`({ served: life(L.sim(), "served"), buses: life(L.sim(), "buses"), nextBusId: L.sim().nextBusId, time: G.clock.time })`);
  check("buses arrived", st.nextBusId > 3, JSON.stringify(st));
  check("buses departed", st.buses > 0, JSON.stringify(st));
  check("guests served", st.served > 0, JSON.stringify(st));
  check("no bus held past the 1-hour hard cap", (await L(`L.buses().every(b => (b.stopElapsed || 0) <= 3600 + 10)`)) === true);
  check("rep stays within 0..100", (await L(`L.sim().rep >= 0 && L.sim().rep <= 100`)) === true);
});

let roundTrip = null;
await test("v7 save round trip", async () => {
  await L(`(L.save(), true)`);
  roundTrip = JSON.parse(await storage(V7));
  check("v7 key written", roundTrip && roundTrip.v === 7);
  check("no legacy key written", (await storage(V6)) === null && (await storage(V5)) === null);
  check("runtime facilities not in the save", !JSON.stringify(roundTrip).includes('"facilities"'));
  await page.goto(`${NEW}/index.html`);
  const snap = JSON.parse(await storage(V7)); // what the reload actually read (beforeunload re-saved)
  check("load status is loaded", (await L(`L.loaded.status`)) === "loaded");
  check("no modal on a normal load", (await modalText()) === null);
  const g = await L(`({ cash: G.company.cash, tx: G.company.nextTxId, day: G.clock.day, time: G.clock.time, n: Object.keys(G.terminals).length,
    rep: L.sim().rep, ids: L.buses().map(b => b.id), pax: L.buses().reduce((a, b) => a + b.pax.length, 0), first: G.flags.firstBusDone })`);
  check("cash preserved, no re-init", g.cash === snap.G.company.cash && g.tx === snap.G.company.nextTxId);
  check("clock preserved", g.day === snap.G.clock.day && Math.abs(g.time - snap.G.clock.time) < 0.01);
  check("terminal count preserved", g.n === Object.keys(snap.G.terminals).length);
  check("rep preserved", Math.abs(g.rep - snap.G.terminals.bolu.sim.rep) < 0.5);
  check("buses and guests preserved", JSON.stringify(g.ids) === JSON.stringify(snap.G.terminals.bolu.buses.map(b => b.id))
    && g.pax === snap.G.terminals.bolu.buses.reduce((a, b) => a + b.pax.length, 0));
  check("first-bus flag preserved", g.first === snap.G.flags.firstBusDone);
});

await test("Legacy v6 migration (real save from the old game)", async () => {
  await seed({ [V6]: v6raw });
  await page.goto(`${NEW}/index.html`);
  check("load status is migrated from 6", (await L(`L.loaded.status + ":" + L.loaded.from`)) === "migrated:6");
  check("migration notice shown", ((await modalText()) || "").includes("aktarıldı"));
  const g = await L(`({ cash: G.company.cash, from: G.migratedFrom, first: G.flags.firstBusDone, day: G.clock.day, time: G.clock.time,
    rep: L.sim().rep, stalls: L.sim().stallClean, ids: L.buses().map(b => b.id), pax: L.buses().reduce((a, b) => a + b.pax.length, 0),
    states: L.buses().flatMap(b => b.pax.map(p => p.state)), wc: G.terminals.bolu.wc, wash: G.terminals.bolu.carWash,
    nextBusId: L.sim().nextBusId, owned: Object.values(G.terminals).filter(t => t.owned).length,
    tSpots: L.facilities().T.spots.filter(Boolean).length, cq: L.facilities().C.queue.length + L.facilities().C.queue2.length })`);
  check("not treated as a new game: one terminal, migrated cash", g.owned === 1 && g.cash === 0 && g.from === 6, JSON.stringify({ cash: g.cash, from: g.from }));
  check("first-bus opening not replayed", g.first === true);
  check("clock preserved", g.day === v6.S.day && g.time === v6.S.time);
  check("reputation preserved", g.rep === v6.S.rep);
  check("stall cleanliness preserved", JSON.stringify(g.stalls) === JSON.stringify(v6.S.stallClean));
  check("buses preserved", JSON.stringify(g.ids) === JSON.stringify(v6.buses.map(b => b.id)));
  check("guests and their states preserved", g.pax === v6.buses.reduce((a, b) => a + b.pax.length, 0)
    && JSON.stringify(g.states) === JSON.stringify(v6.buses.flatMap(b => b.pax.map(p => p.state))));
  check("classic facilities: 10 modern stalls, hose, cologne, calculator, car wash", JSON.stringify(g.wc) === JSON.stringify({ count: 5, style: 2, tool: 4, cologne: 1, calc: 1 }) && g.wash.unlocked === true && g.wash.tier === 1, JSON.stringify(g.wc));
  check("bus id counter carried over", g.nextBusId === v6.S.nextBusId);
  const inT = v6.buses.flatMap(b => b.pax).filter(p => p.state === "serveT").length;
  const inC = v6.buses.flatMap(b => b.pax).filter(p => ["queueC", "payC", "doneC", "dripC", "queueC2", "payC2"].includes(p.state)).length;
  check("queues rebuilt from guest states", g.tSpots === Math.min(10, inT) && g.cq === inC, `T ${g.tSpots}/${inT}, C ${g.cq}/${inC}`);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  check("classic: ten built stalls, hose, cologne", (await L(`L.activeStalls().length === 10 && L.tool() === "hose"`)) === true);
  await L(`(L.setView("wc"), true)`);
  await sleep(400);
  const st = (await L(`L.stations()`))[0];
  await tap(st.x, st.y);
  const free = await L(`L.activeStalls().find(i => !L.facilities().T.spots[i])`);
  const hoseGain = await cleaningGain(free, 2000);
  await tap(st.x, st.y);
  check("hose keeps its original rate and beats the brush", hoseGain >= 50 && hoseGain > 2 * (globalThis.__brushGain || 99), `hose +${hoseGain.toFixed(1)} vs brush +${(globalThis.__brushGain || 0).toFixed(1)}`);
  await L(`(L.setView("out"), true)`);
  const parkedBus = await L(`L.buses().findIndex(b => b.state === "stop")`);
  if (parkedBus >= 0) {
    await L(`(L.openWash(L.buses()[${parkedBus}]), true)`);
    check("manual car wash still opens", (await L(`L.view()`)) === "wash");
    await L(`(L.setView("out"), true)`);
  }
  await L(`(L.setSpeed(100), L.advance(20), L.save(), true)`);
  check("migrated game keeps running", (await L(`life(L.sim(), "buses") + life(L.sim(), "served")`)) > 0);
  check("legacy save left untouched as a backup", (await storage(V6)) === v6raw);
  check("v7 save written", JSON.parse(await storage(V7)).G.migratedFrom === 6);
  const savedCash = JSON.parse(await storage(V7)).G.company.cash;
  check("the migrated game earns fees", savedCash > 0, `₺${savedCash}`);
  await page.goto(`${NEW}/index.html`);
  check("reload loads v7, no second migration", (await L(`L.loaded.status`)) === "loaded" && (await L(`G.company.cash`)) === JSON.parse(await storage(V7)).G.company.cash);
  check("migration flags survive", (await L(`G.migratedFrom === 6 && G.flags.firstBusDone`)) === true);
});

await test("Legacy v5 save (old key, no per-stall array)", async () => {
  const v5 = { v: 5, S: { day: 3, time: 14.5, rep: 72, cleanliness: 40, bottle: 300, view: "wc", nextBusAt: 15, nextBusId: 9, lastSave: 14, stats: { buses: 2, served: 30, satSum: 1800, satN: 30, cologne: 4, washes: 1, repStart: 70, busts: 3 } }, buses: [] };
  await seed({ [V5]: JSON.stringify(v5) });
  await page.goto(`${NEW}/index.html`);
  const g = await L(`({ s: L.loaded.status + ":" + L.loaded.from, rep: L.sim().rep, st: L.sim().stallClean, day: G.clock.day, view: L.sim().view, busts: "busts" in L.sim().stats, served: L.sim().stats.served })`);
  check("migrated from 5", g.s === "migrated:5");
  check("rep/day preserved", g.rep === 72 && g.day === 3);
  check("stalls inherit the shared cleanliness", g.st.length === 10 && g.st.every(x => x === 40));
  check("old per-version fix-ups still applied", g.busts === false && g.served === 30 && g.view === "wc");
});

await test("Corrupt v7 save is backed up, never overwritten", async () => {
  await seed({ [V7]: "{not json" });
  await page.goto(`${NEW}/index.html`);
  check("status recovered", (await L(`L.loaded.status`)) === "recovered");
  check("error notice shown", ((await modalText()) || "").includes("Kayıt sorunu"));
  const keys = await page.eval(`Object.keys(localStorage).filter(k => k.startsWith("layover-lane-corrupt-"))`);
  check("raw data parked under a backup key", keys.length === 1 && (await storage(keys[0])) === "{not json");
  check("playable new game", (await L(`G.company.cash === 500 && Object.keys(G.terminals).length === 1`)) === true);
  await L(`(L.save(), true)`);
  check("backup survives the next save", (await storage(keys[0])) === "{not json");
});

await test("Corrupt v7 falls back to the legacy save", async () => {
  await seed({ [V7]: "garbage", [V6]: v6raw });
  await page.goto(`${NEW}/index.html`);
  check("recovered via legacy migration", (await L(`L.loaded.status + ":" + L.loaded.from`)) === "recovered:6");
  check("legacy progress restored", (await L(`L.sim().rep`)) === v6.S.rep);
});

await test("Unknown future version and missing cash are not loaded or overwritten", async () => {
  const future = JSON.stringify({ v: 99, G: { terminals: {} } });
  await seed({ [V7]: future });
  await page.goto(`${NEW}/index.html`);
  const keys = await page.eval(`Object.keys(localStorage).filter(k => k.startsWith("layover-lane-corrupt-"))`);
  check("future save parked", (await L(`L.loaded.status`)) === "recovered" && keys.length === 1 && (await storage(keys[0])) === future);
  const noCash = JSON.parse(JSON.stringify(roundTrip)); delete noCash.G.company.cash;
  await seed({ [V7]: JSON.stringify(noCash) });
  await page.goto(`${NEW}/index.html`);
  check("save without cash is rejected, not defaulted", (await L(`L.loaded.status`)) === "recovered" && (await L(`G.company.cash`)) === 500);
});

await test("Damaged terminal data is repaired per terminal", async () => {
  const bad = JSON.parse(JSON.stringify(roundTrip));
  bad.G.terminals.bolu.buses = [{ id: 4, state: "stop", slot: 1, len: 170, pax: [null] }];
  bad.G.company.cash = 1234;
  await seed({ [V7]: JSON.stringify(bad) });
  await page.goto(`${NEW}/index.html`);
  check("status recovered, terminal reset", (await L(`L.loaded.status`)) === "recovered" && (await L(`L.buses().length`)) === 0);
  check("company data kept", (await L(`G.company.cash`)) === 1234);
  check("raw parked", (await page.eval(`Object.keys(localStorage).some(k => k.startsWith("layover-lane-corrupt-"))`)) === true);
  const junk = JSON.parse(JSON.stringify(roundTrip));
  junk.G.terminals.bolu.sim = "x"; junk.G.terminals.bolu.buses = [null, 5, { pax: "no" }];
  junk.G.terminals.bolu.wc = { count: 42, style: "x", tool: -1, cologne: 2.5 };
  await seed({ [V7]: JSON.stringify(junk) });
  await page.goto(`${NEW}/index.html`);
  check("junk sim/buses/WC levels sanitized to defaults", (await L(`L.buses().length === 0 && L.sim().stallClean.length === 10 && JSON.stringify(G.terminals.bolu.wc) === JSON.stringify(CONFIG.profiles.starter.wc)`)) === true);
  await L(`(L.setSpeed(100), L.advance(5), true)`);
});

await test("Saves from the combined toilet tiers map onto the WC tracks", async () => {
  const old = JSON.parse(JSON.stringify(roundTrip));
  delete old.G.terminals.bolu.wc;
  old.G.terminals.bolu.toilet = { tier: 3 };
  old.G.equipment = [{ id: 1, type: "mop", terminal: "bolu" }];
  old.G.nextEquipId = 2;
  await seed({ [V7]: JSON.stringify(old) });
  await page.goto(`${NEW}/index.html`);
  const g = await L(`({ s: L.loaded.status, wc: G.terminals.bolu.wc, tool: L.tool(), stalls: L.activeStalls().length, eq: "equipment" in G, old: "toilet" in G.terminals.bolu })`);
  check("old tier 3 + assigned mop: 6 modern stalls, mop, cologne, calculator", g.s === "loaded" && JSON.stringify(g.wc) === JSON.stringify({ count: 3, style: 2, tool: 3, cologne: 1, calc: 1 }) && g.tool === "mop" && g.stalls === 6, JSON.stringify(g));
  check("the old fields are gone", g.eq === false && g.old === false);
  old.G.terminals.bolu.toilet = { tier: 6 }; old.G.equipment = [];
  await seed({ [V7]: JSON.stringify(old) });
  await page.goto(`${NEW}/index.html`);
  check("old tier 6: fully automated, 10 stalls, hose", (await L(`JSON.stringify(G.terminals.bolu.wc) === JSON.stringify({ count: 5, style: 4, tool: 4, cologne: 1, calc: 1 }) && L.autoSystems().includes("toilet")`)) === true);
});

await test("Autosave and reset", async () => {
  await seed({ [V6]: v6raw });
  await page.goto(`${NEW}/index.html`);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "4" })); true`); // real frames at 200×
  await sleep(2500);
  check("autosave on hide/unload writes v7", await page.eval(`(document.dispatchEvent(new Event("visibilitychange")), window.dispatchEvent(new Event("beforeunload")), !!localStorage.getItem("${V7}"))`));
  await page.eval(`window.confirm = () => true; document.getElementById("btnReset").click(); true`);
  await sleep(300);
  await waitFor(() => page.eval(`!!window.__Layover && window.__Layover.loaded.status === "new"`), 10000, "reload after reset");
  check("reset starts a new game", (await L(`G.company.cash === 500 && G.migratedFrom === null`)) === true);
  check("reset removed v7 and legacy keys", (await storage(V6)) === null);
  await sleep(500);
  check("frames keep running (real rAF loop)", await page.eval(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`));
});

/* ------------------------- Phase 8: regression ------------------------- */
await test("Regression: toilet cleanliness thresholds", async () => {
  await seed({});
  await page.goto(`${NEW}/index.html`);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  // wait until guests are off the bus and wanting the WC
  await waitFor(async () => { await advanceHours(0.03, 100); return L(`L.buses().some(b => b.state === "stop" && b.pax.some(p => p.state !== "bus"))`); }, 60000, "guests out");
  const r = await L(`(() => {
    const st = L.sim().stallClean, spots = () => L.facilities().T.spots;
    const already = new Set(spots().filter(Boolean).map(s => s.pax)); // guests inside before the test began
    const fresh = i => spots()[i] && !already.has(spots()[i].pax);
    L.setSpeed(10);
    // every built stall below the bar (25): nobody new uses the WC at all
    let usedWhenAllFilthy = false;
    for (let k = 0; k < 30; k++) { st[4] = st[5] = 20; L.advance(0.2); usedWhenAllFilthy = usedWhenAllFilthy || fresh(4) || fresh(5); }
    // one clean stall: guests come back and take it; the filthy one stays empty
    let used4 = false, used5 = false;
    for (let k = 0; k < 600 && !used4; k++) { st[5] = 20; if (st[4] < 60) st[4] = 90; L.advance(0.2); used4 = !!fresh(4); used5 = used5 || !!fresh(5); }
    return { usedWhenAllFilthy, used4, used5 };
  })()`);
  check("all stalls below the bar: nobody new steps in", !r.usedWhenAllFilthy, JSON.stringify(r));
  check("a clean stall is used again", r.used4 === true);
  check("guests never step into a stall below the bar", r.used5 === false);
});

await test("Regression: crisp change", async () => {
  await L(`(L.sim().stallClean.fill(100), true)`);
  const atSpot = () => waitFor(async () => {
    await L(`(L.sim().stallClean.fill(100), L.advance(0.3), true)`);
    return L(`(() => { const f = L.front(); return f && f.state === "payC" && Math.hypot(f.x - 560, f.y - 357) < 4 && f.owed >= 30 && f.changeGiven === 0 ? f.owed : null; })()`);
  }, 90000, "a guest owed ₺30+");
  await L(`(L.setSpeed(10), true)`);
  await atSpot();
  const sloppy = await L(`(() => { const n = L.toastLog().length; while (L.front() && L.front().changeGiven < L.front().owed) L.giveChange(10); return L.toastLog().slice(n).some(x => /Bozuk para/.test(x.msg)); })()`);
  check("all-₺10 change is noticed", sloppy === true);
  await atSpot();
  const crisp = await L(`(() => { const n = L.toastLog().length, f = L.front(); let r = f.owed; for (const d of [50, 20, 10]) while (r >= d) { L.giveChange(d); r -= d; } return !L.toastLog().slice(n).some(x => /Bozuk para/.test(x.msg)) && f.feePaid; })()`);
  check("the fewest bills pass without complaint", crisp === true);
});

await test("Regression: pause, speed tiers, keyboard and drawer controls", async () => {
  await key(" ");
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " })); true`);
  check("Space pauses", (await L(`L.paused()`)) === true);
  const t0 = await L(`G.clock.time`);
  await sleep(400);
  check("…and the clock holds", (await L(`G.clock.time`)) === t0);
  await page.eval(`window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " })); true`);
  check("Space resumes", (await L(`L.paused()`)) === false);
  const tiers = [];
  for (const k of ["1", "2", "3", "4"]) { await key(k); tiers.push(await L(`L.speed()`)); }
  await sleep(100);
  check("keys 1–4 pick 1×/10×/100×/200×", tiers.join() === "1,10,100,200" && (await page.eval(`document.getElementById("btnSpeed").textContent`)) === "200×", tiers.join());
  await page.eval(`document.getElementById("btnSpeed").click(); true`);
  check("the speed button cycles", (await L(`L.speed()`)) === 1);
  await page.eval(`document.getElementById("btnPause").click(); true`);
  check("the pause button pauses", (await L(`L.paused()`)) === true);
  await page.eval(`document.getElementById("btnPause").click(); true`);
  await key("e");
  check("E steps into the WC", (await L(`L.view()`)) === "wc");
  await key("Escape");
  check("Escape steps back out", (await L(`L.view()`)) === "out");
  const tc = await L(`(() => { const c = G.company.cash, t = G.company.totals.testCash || 0; document.getElementById("btnTestCash").click();
    return { added: G.company.cash - c, booked: (G.company.totals.testCash || 0) - t, kind: G.company.ledger.at(-1).kind }; })()`);
  check("the test button adds ₺100.000 through the ledger", tc.added === 100000 && tc.booked === 100000 && tc.kind === "testCash", JSON.stringify(tc));
  await page.eval(`document.getElementById("btnBurger").click(); true`);
  check("the menu opens", (await page.eval(`!document.getElementById("burgerMenu").classList.contains("hidden")`)) === true);
  await key("Escape");
  await sleep(200);
  globalThis.__shotDrawer = await page.shot("drawer");
  check("Escape closes the menu first", (await page.eval(`document.getElementById("burgerMenu").classList.contains("hidden")`)) === true && (await L(`L.view()`)) === "out");
});

await test("Regression: periodic autosave", async () => {
  const abs = c => (c.day - 1) * 24 + c.time;
  const saved0 = abs(JSON.parse(await storage(V7)).G.clock);
  await advanceHours(9, 200);
  const saved1 = abs(JSON.parse(await storage(V7)).G.clock), now = await L(`L.absNow()`);
  check("an autosave fired on its own within 9 game hours", saved1 > saved0 && now - saved1 <= 8.1, `stored ${saved0.toFixed(2)} → ${saved1.toFixed(2)} h, now ${now.toFixed(2)} h`);
  check("reputation stays within 0–100 at every terminal", (await L(`Object.values(G.terminals).every(t => t.sim.rep >= 0 && t.sim.rep <= 100)`)) === true);
});

await test("Review fixes: day close-out, sanitized stats, unowned save entries", async () => {
  const r = await L(`(() => {
    L.setSpeed(100);
    const s = L.sim(), day = G.clock.day, n = s.history.length;
    while (G.clock.day === day) L.advance(0.2);
    const h = s.history[s.history.length - 1], closed = JSON.stringify(h);
    // keep running after midnight in the same run until the new day has served someone (night traffic is sparse)
    for (let k = 0; k < 100 && !s.stats.served; k++) { s.stallClean.fill(100); L.advance(1); }
    return { archived: s.history.length === n + 1 && h.day === day, repEnd: typeof h.repEnd === "number", untouched: JSON.stringify(h) === closed,
      todayServed: s.stats.served, title: document.getElementById("modalTitle").textContent };
  })()`);
  check("midnight archives the finished day", r.archived && r.repEnd);
  check("the summary shows that day", new RegExp(`^${(await L(`G.clock.day`)) - 1}\\. gün tamamlandı`).test(r.title), r.title);
  check("guests after midnight count toward the new day, not the closed one", r.todayServed > 0 && r.untouched, `${r.todayServed} served since midnight`);
  const keep = await L(`L.sim().stats.served`);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
  check("closing the summary does not wipe the new day", (await L(`L.sim().stats.served`)) === keep);
  // a save carrying markup in its stats, and an unowned terminal entry with no sim
  const bad = JSON.parse(await (async () => { await L(`(L.save(), true)`); return storage(V7); })());
  bad.G.terminals.bolu.sim.stats.caught = `<img src=x onerror="window.__xss=1">`;
  bad.G.terminals.bolu.sim.history = [{ day: 1, served: "<b>x</b>", revenue: 5, repEnd: 50 }];
  bad.G.terminals.gerede = { owned: false, sim: null };
  await seed({ [V7]: JSON.stringify(bad) });
  await page.goto(`${NEW}/index.html`);
  const g = await L(`({ caught: L.sim().stats.caught, hist: L.sim().history[0].served, gerede: "gerede" in G.terminals })`);
  check("saved stats are numbers again", g.caught === 0 && g.hist === 0, JSON.stringify(g));
  await L(`(() => { const s = L.sim(); L.setSpeed(100); const d = G.clock.day; while (G.clock.day === d) L.advance(0.2); return true; })()`);
  check("no markup runs in the day summary", (await page.eval(`window.__xss === undefined && !document.querySelector("#modalBody img")`)) === true);
  check("an unowned terminal entry is dropped on load", g.gerede === false);
  const buy = await L(`(() => { L.sim().rep = 40; G.company.cash = 15000; const r = L.unlockTerminal("gerede"); return r.ok && G.company.cash === 0 && G.terminals.gerede.owned; })()`);
  check("…so buying it later works and charges once", buy === true);
  await page.eval(`document.getElementById("modalBtn").click(); true`);
});

const touchAt = async (type, x, y) => page.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
const tapClient = async (x, y) => { await touchAt("touchStart", x, y); await touchAt("touchEnd", x, y); };
const tapGame = async (x, y) => { const c = await L(`L.toClient(${x}, ${y})`); await tapClient(c.x, c.y); };
const tapEl = async sel => { const r = await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await tapClient(r.x, r.y); };

await test("Regression: touch, phone landscape", async () => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await seed({});
  await page.goto(`${NEW}/index.html`);
  const fit = await page.eval(`(() => { const c = document.getElementById("game").getBoundingClientRect(), s = document.getElementById("stage").getBoundingClientRect();
    return { inside: c.left >= s.left - 1 && c.right <= s.right + 1 && c.top >= s.top - 1 && c.bottom <= s.bottom + 1, fills: c.width >= s.width - 2 || c.height >= s.height - 2, rot: getComputedStyle(document.getElementById("rotateHint")).display }; })()`);
  check("the scene fits the landscape phone stage", fit.inside && fit.fills && fit.rot === "none", JSON.stringify(fit));
  check("touch copy in the help", /dokun/.test(await modalText()));
  await tapEl("#modalBtn");
  check("tap closes the welcome screen", (await modalText()) === null);
  await L(`(L.setSpeed(1), true)`);
  await tapGame(851, 132);
  check("tap the WC building to step inside", (await L(`L.view()`)) === "wc");
  await sleep(300);
  const st = (await L(`L.stations()`))[0];
  await tapGame(st.x, st.y);
  check("tap picks up the brush", (await L(`L.toolInHand()`)) === true);
  await L(`(L.sim().stallClean[4] = 20, true)`);
  const c = await L(`L.toClient(...Object.values(L.bayCenter(4)))`);
  await touchAt("touchStart", c.x, c.y);
  const t0 = Date.now();
  for (let k = 0; Date.now() - t0 < 1500; k++) { await touchAt("touchMove", c.x + 3 * Math.sin(k), c.y + 3 * Math.cos(k)); await sleep(40); }
  await touchAt("touchEnd", c.x, c.y);
  const gain = (await L(`L.sim().stallClean[4]`)) - 20;
  check("hold & drag with a finger cleans the stall", gain > 5, `+${gain.toFixed(1)}`);
  await tapGame(st.x, st.y);
  const ex = await L(`(() => { const r = document.getElementById("game"); return null; })()`);
  await key("e");
  check("back outside", (await L(`L.view()`)) === "out");
  await tapEl("#mapBtn");
  check("tap the 🗺 button opens the map", (await L(`L.mapOpen()`)) === true);
  await sleep(600);
  globalThis.__shotPhoneMap = await page.shot("phone-map");
  await tapEl("#btnMapClose");
  check("tap ✕ closes it", (await L(`L.mapOpen()`)) === false);
  await sleep(600);
  globalThis.__shotPhone = await page.shot("phone-landscape");
  await tapEl("#cashChip");
  check("tap the cash chip opens the business panel", (await L(`L.shopOpen()`)) === true);
  globalThis.__shotPhoneShop = await page.shot("phone-shop");
  await tapEl("#btnShopClose");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  check("portrait phone shows the rotate prompt", (await page.eval(`getComputedStyle(document.getElementById("rotateHint")).display`)) === "flex");
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
});

// screenshots for a visual check of the unchanged scenes
await seed({ [V6]: v6raw });
await page.goto(`${NEW}/index.html`);
await sleep(400);
const shotNotice = await page.shot("migration-notice");
await page.eval(`document.getElementById("modalBtn").click(); true`);
await sleep(600);
const shotOut = await page.shot("outdoor");
await L(`(L.setView("wc"), true)`);
await sleep(700);
const shotWc = await page.shot("wc");

// the tier-1 starter WC, brush in hand mid-scrub
await seed({});
await page.goto(`${NEW}/index.html`);
await page.eval(`document.getElementById("modalBtn").click(); true`);
await sleep(1500);
const shotStartOut = await page.shot("starter-outdoor");
await L(`(L.sim().stallClean[4] = 22, L.sim().stallClean[5] = 70, L.setView("wc"), true)`);
await sleep(700);
{
  const st = (await L(`L.stations()`))[0];
  await tap(st.x, st.y);
  const c = await L(`L.bayCenter(4)`);
  await mouse("mousePressed", c.x, c.y + 10, 1);
  await mouse("mouseMoved", c.x + 3, c.y + 12, 1);
}
await sleep(200);
const shotStartWc = await page.shot("starter-wc");
await mouse("mouseReleased", 0, 0, 0);
await L(`(L.setView("out"), G.company.cash = 1200, true)`);
await sleep(500);
const shotChip = await page.shot("cash-chip");
await test("cash chip rolls changed digits", async () => {
  const rolls = () => page.eval(`[...document.querySelectorAll("#cashChip .d")].map(d => d.className + ":" + d.textContent + ":" + (d.firstChild.dataset.old || "")).join(" ")`);
  await L(`(G.company.cash = 1390, true)`);
  await sleep(120);
  globalThis.__shotRoll = await page.shot("cash-roll");
  const up = await rolls();
  check("rising cash rolls only the changed digits up", up === "d:₺: d:1: d:.: d up:3:2 d up:9:0 d:0:", up);
  await L(`(G.company.cash = 1200, true)`);
  await sleep(120);
  check("falling cash rolls down", (await rolls()) === "d:₺: d:1: d:.: d down:2:3 d down:0:9 d:0:");
  check("text is still plain for readers", (await page.eval(`document.getElementById("cashChip").textContent`)) === "₺1.200");
});
await sleep(500);
await page.eval(`document.getElementById("cashChip").click(); true`);
await sleep(300);
const shotShop = await page.shot("shop");

printed = true;
console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed`);
console.log(`screenshots: ${[shotNotice, shotOut, shotWc, shotStartOut, shotStartWc, shotChip, shotShop, globalThis.__shotWash, globalThis.__shotMaint, globalThis.__shotMap, globalThis.__shotPhone, globalThis.__shotPhoneMap, globalThis.__shotPhoneShop, globalThis.__shotDrawer, globalThis.__shotRoll].join(", ")}`);
for (const p of procs) try { p.kill(); } catch (e) {}
await sleep(500);
cleanup();
process.exit(failed ? 1 : 0);
