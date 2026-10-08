"use strict";

/* =====================================================================
   LAYOVER LANE — Bus Rest-Stop Simulator
   Tour buses run Hilltown (A) → Seaside (B) and pull into your layover.
   You run the diner and the toilets — and you are the WC counter.
   Click the WC building to step behind the counter: each stall's door
   closes while it's in use, and every stall carries its own dirt — take
   the ₺20 bill, splash Turkish cologne, make change, and keep the stalls
   clean with the hose by the stalls (hold & drag it over a free stall).
   The moment a guest is settled they head back out through the EXIT door.
   Click the EXIT door (or press E) to come back outside.
   Click a parked bus to step up to its front and wash the windshield:
   long-handled brush first (soap), then the fresh-water hose (rinse).
   No profit, no upgrades — money is just part of the ritual.
   ===================================================================== */

/* ----------------------------- Config ------------------------------ */
const W = 960, H = 540;
const SECONDS_PER_HOUR = 360;         // real seconds per in-game hour (at 1x) — 1 game hour = 6 real minutes
const LANE_Y = 520;                   // main road lane (feet line)
const LOT_NOSE = 182;                 // lot stalls: where a parked bus's nose points (building side)
const BAY_SLOTS = [                   // the parking lot: 4 stalls, one row — all parallel, nose-up facing the terminal
  { cx: 620 }, { cx: 704 }, { cx: 788 }, { cx: 872 },
];
const GRASS = { top: 88, bot: 170 };  // grass strip — the diner and WC stand on it
const LOT   = { top: 170, bot: 432 }; // bus parking lot (asphalt), in front of the diner + WC
const ROAD  = { top: 432, bot: 530 }; // main road (buses drive here — never park on it)

const DINER_SEATS = 3;                     // fixed — no upgrades in this game
const WC_STALLS   = 10;                    // 5 bays in two rows — one on the left, mirrored on the right
const SVC_TIME_R  = 5.4;                   // real seconds per diner guest served
const TOILET_STAY = [6, 60];               // a toilet visit lasts 1–10 in-game minutes (6 s of timeDt per game min)
const SVC_TIME_T  = (TOILET_STAY[0] + TOILET_STAY[1]) / 2; // mean visit length — queue patience & save restore
const SAT_BASE    = 60;                    // baseline satisfaction per service
const WC_PRICE    = 20;                    // price of a toilet visit, in Turkish lira
const WC_NEEDED   = 72;                    // bladder level at which a guest heads for the WC
const BLADDER_RISE = 85;                   // bladder fill per game hour — the most time-pressed need
const BOTTLE_MAX  = 500;                   // ml of cologne in the counter bottle
const BILL_POOL   = [20, 20, 50, 50, 50, 100, 100]; // bills guests hand over
// bill colors, like the real Turkish lira notes: 10 pink, 20 light green,
// 50 light brown, 100 blue-grey
const BILL_COLORS = { 10: "#c76b93", 20: "#71b67e", 50: "#b58a5c", 100: "#8494b8" };
// The counter lives INSIDE the WC building, drawn first person: you are behind
// the desk, so the counter surface fills the lower frame and the room (the
// stalls, the line, the glass) sits above it. All in the interior view's coords.
const IN = { ceil: 52, wall: 128, counter: 356, glass: 158 }; // interior bands
const COUNTER_IN = {
  // the open cash drawer — three bill trays; the change click targets are the
  // FULL drawn body of each tray (chipHit below), not just the inner rect
  chips: [
    { d: 10, x: 448, y: 384, w: 58, h: 64, color: BILL_COLORS[10], label: "₺10" },
    { d: 20, x: 511, y: 384, w: 58, h: 64, color: BILL_COLORS[20], label: "₺20" },
    { d: 50, x: 574, y: 384, w: 58, h: 64, color: BILL_COLORS[50], label: "₺50" },
  ],
  bottle: { x: 386, y: 416, w: 30, h: 68 },   // Turkish cologne on the counter
  desk:   { x: 0, y: 352, w: 960, h: 188 },   // the full-width wooden counter
  exit:   { x: 828, y: 56, w: 68, h: 72 },    // EXIT door on the far wall (click to go outside)
  hose:   { x: 4, y: 241, w: 60, h: 84 },     // wall faucet + coiled cleaning hose, next to the stall row on the left (click to grab)
};
// The whole VISIBLE body of a bill tray is the click target: the dark tray
// pocket (x-4, y-4, w+8, h+8) plus the bill note, which overhangs the pocket
// by 20px (drawn at c.h + 20). h+22 here makes the hit rect's bottom exactly
// meet the note's bottom (minus the hit pad's 2px, which covers the last sliver)
// without bleeding into the coin compartment below.
const chipHit = c => ({ x: c.x - 4, y: c.y - 4, w: c.w + 8, h: c.h + 22 });
const PAY_SPOT = { x: 560, y: 357 };           // where the front guest stands
const DOOR_IN  = { x: 862, y: 138 };           // just inside the EXIT door — guests enter & leave here
const WC_BUILDING = { x: 808, y: 92, w: 86, h: 80 }; // outdoor hit rect: click to enter
// Car wash view geometry — a close-up of the parked bus's front. The
// windshield is a cols×rows cell grid; each cell tracks its own dirt and soap.
const WASH = {
  body:  { x: 330, y: 110, w: 300, h: 350 },                    // the bus front slab (tall — a big glass front)
  wind:  { x: 354, y: 138, w: 252, h: 250, cols: 30, rows: 20 }, // 60% of the face is glass; 600 cells of 8.4×12.5
  brush: { x: 96,  y: 150, w: 150, h: 310 },                    // soap station panel (left)
  hose:  { x: 714, y: 150, w: 150, h: 310 },                    // fresh-water station panel (right)
  exit:  { x: 18,  y: 18,  w: 96,  h: 44 },                     // back to the lot (top-left)
};

const DEST_A = "Hilltown", DEST_B = "Seaside";
const SAVE_KEY = "layover-lane-v6";

/* ---------------------------- Small utils --------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const lerp  = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t * t * (3 - 2 * t);
const frac = v => v - Math.floor(v);

// Deadlines (stopEnd, boardAt, nextBusAt...) are stored as plain S.time + x,
// so they can sit on the other side of the midnight 24->0 wrap (e.g. 24.4).
// True if the target is now or in the past, cyclically.
// Double %24 normalizes the difference so a deadline just ahead of midnight
// (t >= 24) does NOT read as "reached" on the next day. (All targets are set
// < 12h ahead, so this is unambiguous.)
function reached(t) {
  const e = ((S.time - t) % 24 + 24) % 24;
  return e < 12;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------ State ------------------------------- */
let S = freshState();
let buses = [];
let cars = [];           // ambient traffic in the far lane
let facilities = { R: { spots: [], queue: [] }, T: { spots: [], queue: [] }, C: { queue: [] } };
let paused = false;
// Speed tiers: the whole simulation (game clock, guest needs, walks, animations)
// runs this many times faster. At 1x, 1 game hour = 6 real minutes (a game day
// is 2.4 real hours); at 10x a game day is ~14 min; at 200x it's ~43 seconds.
const SPEEDS = [1, 10, 100, 200];
let speed = 1;
let viewFade = 0;              // dark overlay for the view transition
let pointer = { x: W / 2, y: 200 }; // the mouse, in canvas coords (the wash tools follow it)
let pointerDown = false;
// The WC cleaning hose: in-hand flag plus per-stall spray pacing. Session aid,
// never saved — picking it up again costs the player, not their save file.
let hoseInHand = false;
let hoseCd = new Array(WC_STALLS).fill(0);      // last spray timestamp per stall (performance.now)
let hoseGleam = new Array(WC_STALLS).fill(0);   // per stall: when it last hit 100 (sparkle burst)
let lastHoseToast = 0;

function freshState() {
  return {
    day: 1,
    time: 8,                 // hours, 0..24
    rep: 50,                 // 0..100
    cleanliness: 100,        // DERIVED average of stallClean (outdoor HUD, 🚿 button, legacy fallbacks)
    stallClean: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], // per-stall cleanliness 0..100 — each toilet dirties on its own
    bottle: BOTTLE_MAX,      // ml of cologne left in the counter bottle
    view: "out",             // "out" = the layover, "wc" = inside the WC counter room, "wash" = the bus front
    washBus: null,           // id of the bus being washed (set while view is "wash")
    nextBusAt: 9.5,
    slotVacantSince: BAY_SLOTS.map(() => null), // per stall: game-hour it became vacant (null = filled or never used)
    nextBusId: 1,
    lastSave: 0,
    stats: freshDayStats(50),
  };
}
function freshDayStats(rep) {
  return {
    buses: 0, served: 0, satSum: 0, satN: 0, cologne: 0, washes: 0,
    repStart: rep == null ? S.rep : rep,
  };
}

/* --------------------------- Save & load ---------------------------- */
let resetting = false;   // while set, save() is a no-op (see btnReset)
function save() {
  if (resetting) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 6, S, buses }));
  } catch (e) { /* private mode etc. */ }
}
function load() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    let data = raw && JSON.parse(raw);
    if (!data || (data.v !== 3 && data.v !== 4 && data.v !== 5 && data.v !== 6)) {
      raw = localStorage.getItem("layover-lane-v5") || localStorage.getItem("layover-lane-v3");
      if (!raw) return false;
      data = JSON.parse(raw);
      if (data.v !== 3 && data.v !== 4 && data.v !== 5) return false;
    }
    S = Object.assign(freshState(), data.S);
    S.stats = Object.assign(freshDayStats(), data.S.stats);
    // v6 saves predate per-stall cleanliness, and older saves carry the old
    // 8-stall count — if the array is missing or the count no longer matches,
    // inherit the old shared value so an old game keeps its dirt instead of
    // skipping ahead to spotless
    // Check data.S (the save), not S: after Object.assign above, S.stallClean
    // always exists from freshState(), which would hide a genuinely missing key.
    if (!Array.isArray(data.S.stallClean) || data.S.stallClean.length !== WC_STALLS)
      S.stallClean = Array(WC_STALLS).fill(clamp(data.S.cleanliness == null ? 100 : data.S.cleanliness, 0, 100));
    else
      S.stallClean = data.S.stallClean.map(v => clamp(v, 0, 100));
    S.cleanliness = S.stallClean.reduce((a, v) => a + v, 0) / WC_STALLS; // re-derive the HUD average
    buses = data.buses || [];
    for (const b of buses) { if (b.state === "stop" && !BAY_SLOTS[b.slot]) b.slot = 0; migrateBus(b); }
    // older saves predate the man/woman/kid looks — give untyped guests one
    for (const b of buses) for (const p of b.pax) {
      if (!p.type) p.type = rollPaxType();
      if (!p.skin) p.skin = pick(SKIN_TONES);
      if (!p.hair) p.hair = pick(HAIR_TONES);
    }
    // stall de-dup: first claim wins, later claimants demoted to drive
    const taken = new Set();
    for (const b of buses) if ((b.state === "stop" || b.state === "enter") && b.slot != null) {
      if (taken.has(b.slot)) { b.slot = null; b.state = "drive"; b.stoppedOnce = true; } else taken.add(b.slot);
    }
    // v3 outdoor pax were placed in the old apron band — teleport to their bus door
    if (data.v === 3) for (const b of buses) for (const p of b.pax)
      if (p.state === "walk" || p.state === "free" || p.state === "board") {
        const d = doorPos(b); p.x = d.x; p.y = d.y; p.tx = d.x; p.ty = d.y;
        p.state = "free"; p.idleT = rand(0.5, 2);
      }
    rebuildFacilities();
    // the windshield grid changed shape across versions (v3/v4: 6×3, v5: 6×4,
    // v6: 30×20) — resample any saved wash onto the current grid, taking the
    // nearest old cell, so old saves keep their grime
    const wn = WASH.wind.cols * WASH.wind.rows;
    const oldGrid = { 18: [6, 3], 24: [6, 4] }; // saved array length -> [cols, rows]
    for (const b of buses) {
      if (!b.wash || (b.wash.g.length === wn && b.wash.f.length === wn)) continue;
      if (b.washDone || b.wash.done) {
        b.wash = { g: new Array(wn).fill(0), f: new Array(wn).fill(0), tool: b.wash.tool, done: true, cd: new Array(wn).fill(0) };
        continue;
      }
      const [oc, orw] = oldGrid[b.wash.g.length] || [6, 3];
      const og = b.wash.g, of = b.wash.f || [];
      const g = new Array(wn), f = new Array(wn);
      for (let r = 0; r < WASH.wind.rows; r++) for (let c = 0; c < WASH.wind.cols; c++) {
        const j = Math.min(og.length - 1,
          Math.min(orw - 1, Math.floor(r * orw / WASH.wind.rows)) * oc +
          Math.min(oc - 1, Math.floor(c * oc / WASH.wind.cols)));
        g[r * WASH.wind.cols + c] = og[j] == null ? 1 : og[j];
        f[r * WASH.wind.cols + c] = of[j] == null ? 0 : of[j];
      }
      b.wash = { g, f, tool: b.wash.tool, done: false, cd: new Array(wn).fill(0) };
    }
    // apply cooldowns are a per-session pacing aid, not state
    for (const b of buses) if (b.wash) b.wash.cd = new Array(b.wash.g.length).fill(0);
    // a saved mid-wash view needs a bus that is actually parked
    if (S.view === "wash") {
      const wb = buses.find(x => x.id === S.washBus);
      if (!wb || wb.state !== "stop") { S.view = "out"; S.washBus = null; }
    }
    return true;
  } catch (e) { return false; }
}
// Buses saved before v4 used a left-edge + baseY model (horizontal only).
// Convert to the center + angle model; a v3 bus could never be mid-turn.
function migrateBus(b) {
  if (b.cx == null) { b.cx = b.x + b.len / 2; b.cy = b.baseY - 45; b.ang = 0; }
  delete b.x; delete b.baseY;
  if (b.state === "stop") {
    const s = BAY_SLOTS[b.slot] || BAY_SLOTS[0];
    b.cx = s.cx; b.cy = LOT_NOSE + b.len / 2; b.ang = -Math.PI / 2;
  }
}
function rebuildFacilities() {
  facilities = { R: { spots: [], queue: [] }, T: { spots: [], queue: [] }, C: { queue: [] } };
  // In-visit guests occupy spots, not queue slots (live pull does queue.shift();
  // completeService never re-adds). Restore them to the free spots, in saved
  // order, capacity-capped — instead of ghosting them back into the queue.
  // Service timers restart in full: spot occupancy is not part of the save.
  const rStalls = DINER_SEATS, tStalls = WC_STALLS;
  const rSpots = Array(rStalls).fill(null), tSpots = Array(tStalls).fill(null);
  // prefer the stall/seat the guest was using (p.stall); if that slot went
  // away, take the first free one — capacity-capped either way.
  const nextFree = (arr, pref) => {
    if (pref >= 0 && pref < arr.length && !arr[pref]) return pref;
    for (let i = 0; i < arr.length; i++) if (!arr[i]) return i;
    return -1;
  };
  for (const p of buses.flatMap(b => b.pax)) {
    if (p.state === "serveR") { const s = nextFree(rSpots, p.stall); if (s >= 0) { rSpots[s] = { pax: p, t: SVC_TIME_R }; p.stall = s; } continue; }
    if (p.state === "serveT") { const s = nextFree(tSpots, p.stall); if (s >= 0) { tSpots[s] = { pax: p, t: rand(TOILET_STAY[0], TOILET_STAY[1]) }; p.stall = s; } continue; }
    const F = p.state === "waitR" ? facilities.R : p.state === "waitT" ? facilities.T
      : (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC") ? facilities.C
      : null;
    if (F) F.queue.push(p);
  }
  facilities.R.spots = rSpots;
  facilities.T.spots = tSpots;
  const cq = facilities.C.queue;
  const pi = cq.findIndex(p => p.state === "payC" || p.state === "doneC" || p.state === "dripC");
  if (pi > 0) cq.unshift(cq.splice(pi, 1)[0]);
}

/* ------------------------------- Buses ------------------------------ */
const BUS_KINDS = {
  small: { len: 170, pax: [8, 14] },
  mid:   { len: 210, pax: [16, 26] },
  big:   { len: 250, pax: [28, 44] },
};

// Every guest has a distinct look: women wear a skirt and long hair, men
// wear trousers and a short crop, kids are small with a backpack. Skin and
// hair tones vary so a full bus never reads as clones.
const PAX_TYPES = {
  m: { scale: 1.05 },  // man — slightly broader
  w: { scale: 1 },     // woman — skirt + long hair
  k: { scale: 0.62 },  // kid — small, backpack
};
const SKIN_TONES = ["#e8b88e", "#f0c9a4", "#d9a06b", "#c68b59", "#a06a42", "#8a5a38"];
const HAIR_TONES = ["#241a12", "#362718", "#54381f", "#6e4a26", "#20222e", "#8a6a45"];
// Tour buses are family mixes: ~37% men, ~37% women, ~26% kids.
function rollPaxType() {
  const r = Math.random();
  return r < 0.37 ? "m" : r < 0.74 ? "w" : "k";
}

// How long a stall may sit empty before the next bus is pulled in ahead of
// schedule (the backstop in update()). At rep 0 that's 2 h — the terminal may
// be quiet, but a bus still visits at least every other hour. At rep 100 it's
// 30 min: a busy terminal's stalls never sit empty for longer than that.
function maxGap() {
  return lerp(2, 0.5, S.rep / 100); // 2 h (rep 0) .. 30 min (rep 100)
}

function busInterval() {
  // Reputation sets bus traffic. At rep 0 the terminal is sparse: a visit
  // every 1.2–2 in-game hours (never more than 2 h apart). At rep 100, every
  // 9–15 minutes — far faster than the ~30-minute layover — so buses
  // accumulate and the whole lot stays moving, several at once. Mid rep
  // interpolates. Deliberately shorter than maxGap(): the 30-minute vacancy
  // backstop stays a safety net, not the heartbeat.
  return clamp(rand(0.6, 1) * lerp(2, 0.25, S.rep / 100), 0.1, 2);
}

function spawnBus(reserved = null) {
  const roll = Math.random();
  const kind = roll < 0.68 ? "small" : roll < 0.9 ? "mid" : "big";
  const def = BUS_KINDS[kind];
  const n = Math.max(4, Math.round(rand(def.pax[0], def.pax[1]) * (0.55 + S.rep / 130)));
  const hue = pick([8, 28, 145, 200, 260, 330]);
  const pax = [];
  for (let i = 0; i < n; i++) pax.push(makePax());
  const b = {
    id: S.nextBusId++,
    kind, len: def.len, hue,
    from: DEST_A, to: DEST_B,
    cx: -def.len / 2 - rand(20, 160),
    cy: LANE_Y - 45,
    ang: 0,
    state: "drive",
    stopStart: 0, stopEnd: 0, stopElapsed: 0,
    boardWait: rand(0.3, 0.6),  // extra real seconds to linger once every pax is aboard
    boardGrace: 0,
    stoppedOnce: false,
    slot: null,
    forcedSlot: reserved,  // bay the vacancy backstop promised this bus — it drives past earlier free bays to it
    wash: null,        // per-cell dirt/soap for the car wash view (built on demand)
    washDone: false,   // the windshield was washed — the bus rides off gleaming
    pax,
  };
  buses.push(b);
  toast(`🚌 Tour bus from ${DEST_A} inbound — ${n} passengers`, "");
}

function makePax() {
  return {
    x: 0, y: 0, tx: 0, ty: 0,
    type: rollPaxType(), skin: pick(SKIN_TONES), hair: pick(HAIR_TONES), // how this guest looks
    hue: randInt(0, 359),
    hunger: rand(30, 85), thirst: rand(35, 85), bladder: rand(20, 85), // hours on the tour bus: a fair share is nearly full
    state: "bus",
    __boarded: true, // aboard: the bus<->board door-flip is a one-shot per boarding cycle
    offAt: 0, boardAt: 0, leaveLineAt: null,
    want: null,
    stall: -1,               // WC stall slot pinned for the current serveT visit (-1 = none)
    patience: 0, waitReal: 0, idleT: 0,
    sat: null, refuseR: false, refuseT: false,
    bill: null, owed: 0, changeGiven: 0,  // the ₺20 payment ritual
    useSat: null, cologne: false, colognePrev: null,
    waitTotal: 0, payT: 0, doneT: 0, dripT: 0,
  };
}

// The boarding door, in world coords (rotates with the bus).
function doorPos(b) {
  const lx = b.len / 2 - 39, ly = 47;
  const c = Math.cos(b.ang), s = Math.sin(b.ang);
  return { x: b.cx + lx * c - ly * s, y: b.cy + lx * s + ly * c };
}

// True when every passenger is on board, or at the door about to step in.
// A returning guest spends its last frame or two as "board" a few px from
// the door before the arrival flip to "bus"; that counts as aboard, so the
// departure gate never waits on a guest who is literally stepping in.
function allAbroad(b) {
  if (!b.pax.length) return true;
  const d = doorPos(b);
  return b.pax.every(p =>
    p.state === "bus" ||
    (p.state === "board" && Math.hypot(p.x - d.x, p.y - d.y) < 8));
}

/* ---------------------------- Passengers ---------------------------- */
// Turn off the road into the stall: 1.4 s eased anim (cx/cy/ang).
function beginEnter(b, slot) {
  b.slot = slot;
  b.forcedSlot = null; // the reservation is spent
  if (S.slotVacantSince) S.slotVacantSince[slot] = null; // stall is spoken for — the vacancy backstop drops
  b.stoppedOnce = true;
  b.state = "enter";
  b.stopElapsed = 0; // terminal-dwell clock starts as the bus rolls in
  b.animT = 0;
  b.animFrom = { cx: b.cx, cy: b.cy, ang: b.ang };
  b.animTo = { cx: BAY_SLOTS[slot].cx, cy: LOT_NOSE + b.len / 2, ang: -Math.PI / 2 };
}

function finishEnter(b) {
  b.cx = b.animTo.cx; b.cy = b.animTo.cy; b.ang = b.animTo.ang;
  b.state = "stop";
  b.stopStart = S.time;
  if (S.slotVacantSince) S.slotVacantSince[b.slot] = null; // stall filled
  // Planned layover: ~31 min (25–36 in-game minutes) from the moment the bus
  // is fully in. Time runs 1:1 with the real world, so the whole terminal stay
  // (roll-in + layover + whatever tail) is budgeted against the 1-hour hard cap
  // in update(): a stop with no WC line averages ~33 min total, and even the
  // shared 5–10 min counter-line deadline plus the sprint home stays under the
  // hour — the cap is a backstop that only triggers on a very unlucky stop.
  b.stopEnd = S.time + rand(0.42, 0.60);
  for (const p of b.pax) {
    p.offAt = b.stopStart + Math.random() * (b.stopEnd - b.stopStart) * 0.55;
    // Start for the door 6–12 in-game min before stopEnd. In a 1:1 world the
    // layover is only ~30 min, so this must stay short: the free window
    // (landing → door call) is where the bladder can fill past WC_NEEDED and
    // the guest walks off to the toilet before the hurry.
    p.boardAt = b.stopEnd - rand(0.10, 0.20);
  }
  guaranteeWc(b);
}

// The headline promise: at least half of every bus uses the WC. A "wait and
// see" bladder (rising BLADDER_RISE/h from rand(20,85)) only crosses
// WC_NEEDED inside the free window for some guests, so a one-shot boost on
// the "short" ones is not a guarantee — and it was worse than useless: a
// boosted guest who disembarked, wandered, and made one diner visit had their
// bladder zeroed (completeService("R") sets bladder = 1) and never crossed
// again within a 25–36 min stop. So the guarantee is deterministic instead:
// tag the half of the bus whose bladders are worst-off at their door call, and
// for each of them (1) clear any stale refuse flag, (2) nudge the landing
// earlier if the free window (landing → door call) would be under 6 min, and
// (3) set the bladder so it crosses WC_NEEDED within seconds of landing. Their
// first evaluate then sends them straight for the T queue (T is checked before
// R, and the door call is a full 6 min away, so a diner visit can never zero
// the bladder first). Visits now last 1–10 game minutes (TOILET_STAY), so a
// packed line may outlive the free window: landings are spread across the
// layover and the 10-stall throughput keeps pace for all but the biggest
// buses, and anyone still queued at their boardAt abandons the line and
// sprints for the door (stepFac) — the guarantee is best-effort, and the rep
// formula grades the stragglers honestly. Untagged pax keep 100% organic
// behavior, so diner traffic is unchanged.
// (stopStart/stopEnd/offAt/boardAt are all set within minutes of each other,
// so the raw differences below are wrap-free.)
function guaranteeWc(b) {
  const n = b.pax.length;
  const need = Math.ceil(n / 2);
  if (!need) return;
  // Most at-risk first: how far below WC_NEEDED each guest's bladder sits at
  // their own door call, at the current fill rate.
  const slack = p => p.bladder + BLADDER_RISE * (p.boardAt - b.stopStart) - WC_NEEDED;
  const ranked = [...b.pax].sort((x, y) => slack(x) - slack(y));
  // Only guests who land before their door call can use the WC; if that pool
  // is short (very short stop), top up from the rest.
  let claim = ranked.filter(p => p.offAt < p.boardAt);
  if (claim.length < need) claim = claim.concat(ranked.filter(p => p.offAt >= p.boardAt));
  claim = claim.slice(0, need);
  const MARGIN = 0.1; // 6 in-game min between landing and the door call
  for (const p of claim) {
    p.refuseT = false; // refuseT otherwise persists until the next finishVisit
    let off = p.offAt - b.stopStart;
    const door = p.boardAt - b.stopStart; // = L − rand(0.10,0.20) ≥ 13 in-game min
    if (door - off < MARGIN) off = Math.max(door - MARGIN, 0);
    p.offAt = b.stopStart + off;
    // Full the instant they land: cross WC_NEEDED within 0–10 in-game sec of
    // the free window opening, so the first evaluate sends them for the T
    // queue and the 6 min to the door call is all queue cushion.
    const cross = off + rand(0, 0.003);
    p.bladder = Math.max(p.bladder, clamp(WC_NEEDED + rand(1, 5) - BLADDER_RISE * cross, 0, 100));
  }
}

function endStop(b) {
  if (b.slot != null && S.slotVacantSince) S.slotVacantSince[b.slot] = S.time; // stall vacant — backstop clock starts
  b.slot = null;
  b.state = "exit";
  b.animT = 0;
  b.animFrom = { cx: b.cx, cy: b.cy, ang: b.ang };
  b.animTo = { cx: b.cx + 260, cy: LANE_Y - 45, ang: 0 };
  for (const p of b.pax) {
    if (p.state === "serveR" || p.state === "serveT") continue; // let them finish, they'll board after
    if (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC") continue; // still at the counter — they'll finish & board after
    if (p.state === "leaveC") { p.x = 852; p.y = 169; goDoor(p, b); continue; } // at the exit door — out & sprint for the bus
    if (p.state !== "bus") p.state = "board";
  }
  // reputation outcome
  let sum = 0;
  for (const p of b.pax) {
    const s = p.sat !== null ? p.sat
      : p.useSat !== null ? p.useSat
      : (p.state === "serveR" || p.state === "serveT") ? 60
      : 25;
    sum += s;
  }
  const rawAvg = sum / b.pax.length;
  const avg = b.washDone ? clamp(rawAvg + 5, 0, 100) : rawAvg; // a sparkling bus rides off happier
  const delta = clamp((avg - 50) * 0.15 * (b.pax.length / 12), -6, 6);
  S.rep = clamp(S.rep + delta, 0, 100);
  S.stats.buses++;
  const stars = avg > 80 ? "★★★★★" : avg > 65 ? "★★★★☆" : avg > 45 ? "★★★☆☆" : avg > 25 ? "★★☆☆☆" : "★☆☆☆☆";
  toast(`🚌 Bus to ${DEST_B} departed · ${stars} (${Math.round(avg)} avg) · rep ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`, delta >= 0 ? "good" : "bad");
}

function finishExit(b) {
  b.cx = b.animTo.cx; b.cy = b.animTo.cy; b.ang = b.animTo.ang;
  b.state = "drive";
}

// First bay (in fill order) the bus has reached that no other parked bus holds.
// A bus reserved for a particular bay (forcedSlot — the vacancy backstop
// promised it the stall that went quiet longest) drives past earlier free
// bays to the one it was promised; if that bay fills first, it falls back to
// normal first-fit.
function baySlotFor(b) {
  const free = i => !buses.some(o => o !== b && (o.state === "stop" || o.state === "enter") && o.slot === i);
  for (let i = 0; i < BAY_SLOTS.length; i++) {
    if (b.forcedSlot != null && free(b.forcedSlot)) { // != null: plain schedule buses carry null, and null >= 0 is true in JS
      if (i === b.forcedSlot && b.cx >= BAY_SLOTS[i].cx - 60) return i; // reservation held, bay reached
      continue; // reservation held: skip every other bay
    }
    if (b.cx < BAY_SLOTS[i].cx - 60) continue;
    if (free(i)) return i;
  }
  return -1;
}

function evaluate(p, bus) {
  if (reached(p.boardAt)) { goDoor(p, bus); return; }
  if (!p.refuseT && p.bladder > WC_NEEDED) { p.want = "T"; tryJoin("T", p, bus); return; }
  if (!p.refuseR && p.hunger > 68)  { p.want = "R"; tryJoin("R", p, bus); return; }
  if (!p.refuseR && p.thirst > 68)  { p.want = "R"; tryJoin("R", p, bus); return; }
  wander(p);
}

function tryJoin(fac, p, bus) {
  const f = facilities[fac];
  if (f.spots.some(s => s && s.pax === p)) return;
  if (f.queue.includes(p)) return;
  f.queue.push(p);
  p.state = fac === "R" ? "waitR" : "waitT";
  const stalls = fac === "R" ? DINER_SEATS : WC_STALLS;
  const svc = fac === "R" ? SVC_TIME_R : SVC_TIME_T;
  p.patience = (f.queue.length) * (svc / stalls) + 8;
  p.waitReal = 0;
}

function wander(p) {
  p.state = "walk";
  p.tx = rand(560, 940);
  p.ty = rand(195, 330);
  p.idleT = 0;
}

function goDoor(p, bus) {
  p.state = "board";
  const d = doorPos(bus);
  p.tx = d.x; p.ty = d.y;
}

/* --------------------------- Facilities ----------------------------- */
function updateFacilities(dt, timeDt = dt) {
  stepFac("R", timeDt, DINER_SEATS, SVC_TIME_R);
  stepFac("T", timeDt, WC_STALLS, SVC_TIME_T);
  // each toilet recovers slowly on its own; S.cleanliness stays the derived
  // average (outdoor HUD, the 🚿 button, legacy code paths)
  for (let i = 0; i < WC_STALLS; i++)
    S.stallClean[i] = clamp(S.stallClean[i] + 6 * (timeDt / SECONDS_PER_HOUR), 0, 100);
  S.cleanliness = S.stallClean.reduce((a, v) => a + v, 0) / WC_STALLS;
}

function stepFac(name, timeDt, stalls, svcTime) {
  const f = facilities[name];
  const drain = 1;   // patience drain per real second in queue
  // queue patience
  for (let i = f.queue.length - 1; i >= 0; i--) {
    const p = f.queue[i];
    p.waitReal += timeDt;
    p.patience -= timeDt * drain;
    if (reached(p.boardAt)) { f.queue.splice(i, 1); goDoor(p, findBusOf(p)); continue; }
    if (p.patience <= 0) {
      f.queue.splice(i, 1);
      if (name === "R") p.refuseR = true; else p.refuseT = true;
      p.state = "walk"; wander(p);
    }
  }
  // free stalls pull from the queue (WC stalls are always open — no gate).
  // The spots array is fixed-size and NEVER reflows: the index IS the stall,
  // and each guest is pinned to the slot they claimed, so a guest using a
  // toilet keeps that exact toilet for the whole visit — they never switch
  // to another stall mid-use. A toilet guest takes any available stall (a
  // random one among the free); diner seats fill from the front.
  while (f.queue.length) {
    const free = [];
    for (let i = 0; i < stalls; i++) if (!f.spots[i]) free.push(i);
    if (!free.length) break;
    const p = f.queue.shift();
    const slot = name === "T" ? free[(Math.random() * free.length) | 0] : free[0];
    p.state = name === "R" ? "serveR" : "serveT";
    p.stall = slot; // the stall this visit uses — pinned until the guest leaves
    if (name === "T") {
      // Step in through the EXIT door, then walk off to their stall bay.
      // (Indoor pax are invisible in the outdoor view, so the snap reads as
      // a clean entry in the interior view.)
      p.x = DOOR_IN.x; p.y = DOOR_IN.y;
      p.enterT = null;
      p.inStall = false; // door stays ajar until they actually reach the bay
    }
    // A toilet visit runs 1–10 in-game minutes; a diner seat keeps the short
    // fixed service time.
    f.spots[slot] = { pax: p, t: name === "T" ? rand(TOILET_STAY[0], TOILET_STAY[1]) : svcTime };
  }
  // running services — a finished visit frees its own slot (no reflow)
  for (let i = 0; i < stalls; i++) {
    const s = f.spots[i];
    if (!s) continue;
    s.t -= timeDt;
    if (s.t <= 0) { completeService(name, s.pax); f.spots[i] = null; s.pax = null; s.t = -1; }
  }
}

function findBusOf(p) {
  for (const b of buses) if (b.pax.includes(p)) return b;
  return null;
}

function completeService(name, p) {
  if (name === "R") {
    if (p.hunger >= p.thirst) p.hunger = 10;
    else p.thirst = 10;
    p.bladder = 1;
    let sat = SAT_BASE;
    sat -= Math.max(0, p.waitReal - 8) * 0.5;
    sat = clamp(sat + rand(-8, 8), 0, 100);
    p.waitReal = 0;
    finishVisit(p, sat);
    return;
  }
  // toilets — the guest leaves the stall and joins the payment line.
  // Satisfaction is finalized at the counter (finalizePayment / stormOut).
  p.bladder = 10;
  // each toilet carries its own dirt — the stall they used sets the rating,
  // and their visit leaves that particular stall dirtier
  const si = p.stall;
  const sc = si >= 0 && si < WC_STALLS ? S.stallClean[si] : S.cleanliness;
  p.useSat = clamp(SAT_BASE - (sc < 40 ? (40 - sc) * 0.5 : 0), 0, 100);
  if (si >= 0 && sc > 15) S.stallClean[si] = Math.max(0, sc - rand(8, 16));
  p.waitTotal = p.waitReal; // their queue time, folded into the final rating
  p.waitReal = 0;
  p.sat = null;
  const bus = findBusOf(p);
  if (bus && bus.state === "stop") enterCounter(p);
  else finishVisit(p, p.useSat); // bus already pulled out — no time for the ritual
}

// The 🚿 button in the top bar: step inside (if you're outside) and pick up
// the cleaning hose. The old one-click instant deep clean is gone — cleaning
// is done by hand: hold the mouse and drag the hose over a stall to spray it.
function grabHose() {
  if (S.view !== "wc") setView("wc");
  if (S.cleanliness > 99) { toast("✨ The toilets are already spotless."); return; }
  if (hoseInHand) { toast("🚿 Hose already in hand — hold & drag it over a stall."); return; }
  hoseInHand = true;
  toast("🚿 Hose in hand — hold & drag it over an open stall to spray.");
}

/* ---------------------- WC stall cleaning (the hose) ---------------- */
// The ten stall bays, in the interior view's coords (drawWCInterior): five
// in the left row (x = 76 + i*64) and five mirrored in the right row
// (x = 576 + (i-5)*64) — matching the two stall containers drawWCInterior paints.
const stallBay = i => ({ x: i < WC_STALLS / 2 ? 76 + i * 64 : 576 + (i - WC_STALLS / 2) * 64, y: 214, w: 52, h: 138 });

// Which stall's bay does a point fall in? (the ~18 px reach of the spray fan)
function stallAt(x, y, R = 18) {
  for (let i = 0; i < WC_STALLS; i++) {
    const r = stallBay(i);
    if (x + R >= r.x && x - R <= r.x + r.w && y + R >= r.y && y - R <= r.y + r.h) return i;
  }
  return -1;
}

// Is this stall's door shut? Only once the occupant has actually stepped in
// (p.inStall) — while they're still walking off to their bay the leaf stays
// open, like a free stall, and the hose may still spray the bay.
function stallDoorClosed(i) {
  const s = facilities.T && facilities.T.spots[i];
  return !!(s && s.pax && s.pax.inStall);
}

// One spray application from the held hose: every stall the fan reaches takes
// a tick of cleaning, throttled by a short per-stall cooldown in REAL time
// (like the car-wash tools — the hose works the same at any speed tier).
// A stall whose door is closed (someone inside) can't be sprayed.
function hoseApply(x, y) {
  if (S.view !== "wc" || !hoseInHand) return;
  const R = 18;
  const now = performance.now();
  let touched = false;
  for (let i = 0; i < WC_STALLS; i++) {
    const r = stallBay(i);
    if (x + R < r.x || x - R > r.x + r.w || y + R < r.y || y - R > r.y + r.h) continue;
    if (stallDoorClosed(i)) continue; // door shut (occupant in) — the spray bounces
    if (hoseCd[i] > now) continue;
    hoseCd[i] = now + 150;
    touched = true;
    const before = S.stallClean[i];
    S.stallClean[i] = Math.min(100, before + 5);
    if (before < 100 && S.stallClean[i] >= 100) {
      hoseGleam[i] = now; // sparkle burst on hitting 100
      if (now - lastHoseToast > 1500) { lastHoseToast = now; toast("🚿 A stall is sparkling clean!", "good"); }
    }
  }
  if (touched) S.cleanliness = S.stallClean.reduce((a, v) => a + v, 0) / WC_STALLS;
}

/* ---------------------- Player actions (counter) -------------------- */
// Step between the layover, the WC counter room, and the car wash.
function setView(v) {
  if (v === S.view) return;
  const from = S.view;
  S.view = v;
  viewFade = 1;
  if (from === "wash") S.washBus = null; // we step back out; the bus keeps its washed state
  if (v !== "wc") hoseInHand = false;    // leaving the counter room — the hose goes back on its faucet
  save();
}

/* -------------------------- Car wash (bus front) --------------------- */
// The bus the current view focuses on: the one being washed (S.washBus is
// only ever set in the wash view), else the first bus in the scene.
function bus() {
  if (S.washBus != null) {
    const wb = buses.find(z => z.id === S.washBus);
    if (wb) return wb;
  }
  return buses[0] || null;
}

// The windshield as cols×rows cells. Each cell keeps its own dirt (g) and
// soap (f). Buses roll in dusty; the ritual is brush, then hose — a rinse
// strips far more grime from a soaped cell than from a dry one.
function ensureWash(b) {
  if (!b.wash) {
    const n = WASH.wind.cols * WASH.wind.rows;
    const g = [], f = [];
    for (let i = 0; i < n; i++) { g.push(rand(0.55, 1)); f.push(0); }
    b.wash = { g, f, tool: "brush", done: false, cd: new Array(n).fill(0) };
  }
  return b.wash;
}

// Step up to the front of a parked bus and open the car wash view.
function openWash(b) {
  ensureWash(b);
  S.washBus = b.id;
  setView("wash");
}

// Apply the active tool to every cell its pad / spray fan touches. Driven by
// mousedown + mousemove while the button is held — a scrub or a spray, not a click.
function washApply(x, y) {
  if (S.view !== "wash") return;
  const b = buses.find(z => z.id === S.washBus);
  if (!b) return;
  const w = ensureWash(b);
  if (w.done) return;
  if (w.tool !== "brush" && w.tool !== "hose") return; // no tool in hand
  const { x: wx, y: wy, w: ww, h: wh, cols, rows } = WASH.wind;
  // 600 cells of 8.4px would never all be reached one-cell-per-stroke — the
  // tool works every cell a 36px pad / spray fan around the pointer crosses
  const R = 18;
  if (x + R < wx || x - R > wx + ww || y + R < wy || y - R > wy + wh) return;
  const cww = ww / cols, rhh = wh / rows;
  const c0 = Math.max(0, Math.floor((x - R - wx) / cww));
  const c1 = Math.min(cols - 1, Math.floor((x + R - wx) / cww));
  const r0 = Math.max(0, Math.floor((y - R - wy) / rhh));
  const r1 = Math.min(rows - 1, Math.floor((y + R - wy) / rhh));
  // a short cooldown per cell, so washing takes a few deliberate strokes
  const now = performance.now();
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      if ((w.cd[i] || 0) > now) continue;
      w.cd[i] = now + 80;
      if (w.tool === "brush") {
        w.f[i] = Math.min(1, w.f[i] + 0.45); // suds up
      } else {
        const foam = w.f[i];                  // rinse: the suds do the real work
        w.f[i] *= 0.15;
        w.g[i] = Math.max(0, w.g[i] - (0.15 + 0.6 * foam));
      }
    }
  }
  if (w.g.every(v => v < 0.1)) finishWash(b);
}

function finishWash(b) {
  const w = ensureWash(b);
  if (w.done) return;
  w.done = true;
  w.f = w.f.map(() => 0); // spotless — no residual suds where the final rinse didn't reach
  b.washDone = true;
  S.stats.washes++;
  S.rep = clamp(S.rep + 2, 0, 100);
  toast("✨ Windshield sparkling clean — the driver will notice!", "good");
  save();
}

// The car wash view: a close-up of the parked bus's front. The windshield is
// the 30×20 cell grid from WASH.wind (600 cells, dirt + soap each), flanked by the two
// tool stations; the active tool follows the pointer, and holding the mouse
// scrub/sprays (see washApply). Everything is in-canvas, like the other views.
function drawWashView() {
  const b = bus();
  if (!b) { setView("out"); return; }
  const w = ensureWash(b);
  const nf = nightFactor();
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  const { body: B, wind: Wd, brush: Br, hose: Hs, exit: Ex } = WASH;

  // --- sky (the same palette as the layover — the view change feels like a dolly)
  const [top, bot] = skyColors(S.time);
  const sky = ctx.createLinearGradient(0, 0, 0, B.y + 40);
  sky.addColorStop(0, top); sky.addColorStop(1, bot);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (nf > 0.3) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.t + s.tw * performance.now() / 1000));
      ctx.fillRect(s.x, s.y * 0.35, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  // --- concrete wash pad
  ctx.fillStyle = mix("#565e6d", "#232833", nf * 0.7);
  ctx.fillRect(0, B.y + 40, W, H - B.y - 40);
  ctx.fillStyle = `rgba(20, 24, 34, ${0.25 + nf * 0.2})`;
  ctx.fillRect(0, B.y + 40, W, 4);

  // --- the bus front
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + nf * 0.15})`;
  ctx.beginPath(); ctx.ellipse(B.x + B.w / 2, B.y + B.h + 10, B.w * 0.62, 16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = `hsl(${b.hue}, 55%, ${56 - nf * 15}%)`;
  rr(ctx, B.x, B.y, B.w, B.h, 18); ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `hsl(${b.hue}, 55%, ${Math.max(10, 30 - nf * 12)}%)`;
  rr(ctx, B.x, B.y, B.w, B.h, 18); ctx.stroke();
  // route number on the roof (set explicitly — the removed sign used to set this)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = mix("#fff8e7", "#ffd98a", nf);
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.fillText(`${DEST_A} → ${DEST_B}`, B.x + B.w / 2, B.y + 11);
  // windshield frame + base glass
  ctx.fillStyle = `hsl(${b.hue}, 55%, ${Math.max(10, 24 - nf * 10)}%)`;
  rr(ctx, Wd.x - 8, Wd.y - 8, Wd.w + 16, Wd.h + 16, 10); ctx.fill();
  ctx.fillStyle = mix("#5a7ea6", "#22304a", nf * 0.7);
  rr(ctx, Wd.x, Wd.y, Wd.w, Wd.h, 4); ctx.fill();
  // dashboard + steering wheel under the glass
  ctx.fillStyle = `hsl(${b.hue}, 40%, ${18 - nf * 6}%)`;
  rr(ctx, Wd.x - 10, Wd.y + Wd.h + 12, Wd.w + 20, 22, 6); ctx.fill();
  ctx.fillStyle = `hsl(${b.hue}, 45%, ${34 - nf * 10}%)`;
  rr(ctx, Wd.x + Wd.w / 2 - 22, Wd.y + Wd.h + 18, 44, 14, 7); ctx.fill();
  // headlights (they glow at night)
  const ly = Wd.y + Wd.h + 40;
  for (const hx of [Wd.x + 10, Wd.x + Wd.w - 10]) {
    ctx.save();
    ctx.shadowColor = `rgba(255, 225, 140, ${0.8 * nf})`;
    ctx.shadowBlur = 14;
    ctx.fillStyle = nf > 0.5 ? "#ffefc0" : mix("#e8ecf2", "#39404d", nf);
    ctx.beginPath(); ctx.ellipse(hx, ly, 16, 9, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  // bumper + grille (the grille is inset into the full-width bumper)
  ctx.fillStyle = mix("#7b8494", "#333a46", nf);
  rr(ctx, B.x + 24, B.y + B.h - 16, B.w - 48, 16, 8); ctx.fill();
  const gy = B.y + B.h - 13; // pinned into the bumper — the face shrank its lower gap
  ctx.fillStyle = `hsl(${b.hue}, 45%, ${26 - nf * 8}%)`;
  rr(ctx, Wd.x + 60, gy, Wd.w - 120, 12, 4); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(Wd.x + 66, gy + k * 3);
    ctx.lineTo(Wd.x + Wd.w - 66, gy + k * 3);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // --- the windshield cells: dirt, suds, shine. 600 cells of 8.4×12.5 are
  // batched into one path per quantized shade, so the fine grid stays cheap
  const cw = Wd.w / Wd.cols, chh = Wd.h / Wd.rows;
  const q10 = v => Math.min(9, Math.max(0, Math.round(v * 10) - 1));
  const gR = new Array(10), gS = new Array(10), sR = new Array(10),
        sB = new Array(30), shine = [];
  for (let r = 0; r < Wd.rows; r++) {
    for (let c = 0; c < Wd.cols; c++) {
      const i = r * Wd.cols + c;
      const x0 = Wd.x + c * cw, y0 = Wd.y + r * chh;
      const g = w.g[i], f = w.f[i];
      if (g > 0.02) {
        const a = Math.min(1, 0.75 * g);
        (gR[q10(a)] || (gR[q10(a)] = [])).push(x0, y0);
        const as = Math.min(1, 0.55 * g);
        const sp = (gS[q10(as)] || (gS[q10(as)] = [])); // stable speckles — no per-frame flicker
        for (let k = 0; k < 3; k++) {
          const u = ((i * 13 + k * 37) % 11) / 11;
          const v = ((i * 7 + k * 53) % 13) / 13;
          sp.push(x0 + u * (cw - 4), y0 + v * (chh - 3));
        }
      }
      if (f > 0.02) {
        const a = Math.min(1, 0.85 * f);
        (sR[q10(a)] || (sR[q10(a)] = [])).push(x0, y0);
        const ab = Math.min(1, 0.9 * f);
        for (let k = 0; k < 3; k++) {
          const u = ((i * 17 + k * 29) % 11) / 11;
          const v = ((i * 11 + k * 41) % 13) / 13;
          const bub = (sB[q10(ab) * 3 + ((i + k) % 3)] || (sB[q10(ab) * 3 + ((i + k) % 3)] = []));
          bub.push(x0 + (0.25 + 0.5 * u) * cw, y0 + (0.25 + 0.5 * v) * chh);
        }
      }
      if (g < 0.1 && f < 0.1) // a clean shine streak on each sparkling cell
        shine.push(x0 + cw * 0.7, y0 + chh * 0.25, x0 + cw * 0.2, y0 + chh * 0.75);
    }
  }
  for (let s = 0; s < 10; s++) {
    if (gR[s]) {
      ctx.fillStyle = `rgba(112, 84, 44, ${(0.1 * (s + 1)).toFixed(2)})`;
      ctx.beginPath();
      for (let k = 0; k < gR[s].length; k += 2) ctx.rect(gR[s][k], gR[s][k + 1], cw, chh);
      ctx.fill();
    }
    if (gS[s]) {
      ctx.fillStyle = `rgba(70, 52, 30, ${(0.1 * (s + 1)).toFixed(2)})`;
      ctx.beginPath();
      for (let k = 0; k < gS[s].length; k += 2) ctx.rect(gS[s][k], gS[s][k + 1], 4, 3);
      ctx.fill();
    }
    if (sR[s]) {
      ctx.fillStyle = `rgba(245, 250, 255, ${(0.1 * (s + 1)).toFixed(2)})`;
      ctx.beginPath();
      for (let k = 0; k < sR[s].length; k += 2) ctx.rect(sR[s][k], sR[s][k + 1], cw, chh);
      ctx.fill();
    }
  }
  for (let s = 0; s < 30; s++) {
    if (!sB[s]) continue;
    const rad = 1.5 + (s % 3);
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.09 * (Math.floor(s / 3) + 1)).toFixed(2)})`;
    ctx.beginPath();
    for (let k = 0; k < sB[s].length; k += 2) {
      ctx.moveTo(sB[s][k] + rad, sB[s][k + 1]);
      ctx.arc(sB[s][k], sB[s][k + 1], rad, 0, 7);
    }
    ctx.fill();
  }
  if (shine.length) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < shine.length; k += 4) {
      ctx.moveTo(shine[k], shine[k + 1]);
      ctx.lineTo(shine[k + 2], shine[k + 3]);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < Wd.cols; c++) {
    const gx = Wd.x + c * cw;
    ctx.moveTo(gx, Wd.y); ctx.lineTo(gx, Wd.y + Wd.h);
  }
  for (let r = 1; r < Wd.rows; r++) {
    const gy2 = Wd.y + r * chh;
    ctx.moveTo(Wd.x, gy2); ctx.lineTo(Wd.x + Wd.w, gy2);
  }
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // --- the two tool stations
  const panel = (R, title, sel) => {
    ctx.save();
    if (sel) { ctx.shadowColor = "rgba(90, 200, 255, 0.9)"; ctx.shadowBlur = 18; }
    ctx.fillStyle = sel ? mix("#1f2c3c", "#131c28", nf) : mix("#151c26", "#0e141d", nf);
    rr(ctx, R.x, R.y, R.w, R.h, 12);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = sel ? `rgba(120, 225, 255, ${0.5 + 0.5 * pulse})` : "rgba(255,255,255,0.12)";
    rr(ctx, R.x, R.y, R.w, R.h, 12);
    ctx.stroke();
    ctx.fillStyle = sel ? "rgba(160,230,255,0.95)" : "rgba(226,235,248,0.75)";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, R.x + R.w / 2, R.y + 20);
    if (sel) {
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillStyle = `rgba(160, 230, 255, ${0.6 + 0.4 * pulse})`;
      ctx.fillText("IN HAND — hold & drag", R.x + R.w / 2, R.y + 35);
    }
    ctx.textAlign = "left";
  };

  // soap bucket + the long-handled brush, leaning on it
  panel(Br, "🧼 BRUSH — soap", w.tool === "brush");
  const bcx = Br.x + 44, bcy = Br.y + 177;
  ctx.fillStyle = "#2e5f8a";
  ctx.beginPath();
  ctx.moveTo(bcx - 24, bcy - 12); ctx.lineTo(bcx + 24, bcy - 12);
  ctx.lineTo(bcx + 19, bcy + 16); ctx.lineTo(bcx - 19, bcy + 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#8fe3f2";
  ctx.beginPath(); ctx.ellipse(bcx, bcy - 12, 24, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let k = 0; k < 4; k++) {
    ctx.beginPath(); ctx.arc(bcx - 12 + k * 8, bcy - 14, 3 + (k % 2), 0, 7); ctx.fill();
  }
  ctx.save();
  ctx.translate(bcx + 40, bcy + 26);
  ctx.rotate(-0.55);
  ctx.fillStyle = "#8a5a2b";
  rr(ctx, -5, -88, 10, 88, 4); ctx.fill();       // the long handle
  rr(ctx, -26, -104, 52, 18, 9); ctx.fill();     // the brush head
  ctx.fillStyle = "#f2f7ff";
  rr(ctx, -22, -98, 44, 9, 4); ctx.fill();       // suds on the pad
  ctx.restore();

  // faucet + coiled fresh-water hose
  panel(Hs, "💧 HOSE — rinse", w.tool === "hose");
  const fcx = Hs.x + 75, fcy = Hs.y + 87;
  ctx.fillStyle = mix("#9aa4b2", "#39414d", nf);
  rr(ctx, fcx - 6, fcy - 18, 12, 26, 3); ctx.fill();
  rr(ctx, fcx - 14, fcy + 4, 28, 10, 3); ctx.fill();
  ctx.fillStyle = "#3f7fd4";
  rr(ctx, fcx - 3, fcy + 14, 6, 7, 2); ctx.fill();
  ctx.strokeStyle = "#3f9c57";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(Hs.x + 75, Hs.y + 122 + k * 20, 44 - k * 4, 8, 0, 0, 7);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";

  // --- the active tool, following the pointer (nothing when none is in hand)
  const px = pointer.x, py = pointer.y;
  if (w.tool === "brush") {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.6);
    ctx.fillStyle = "#8a5a2b";
    rr(ctx, -5, -8, 10, 96, 4); ctx.fill();      // the handle trails off behind
    rr(ctx, -27, -26, 54, 20, 10); ctx.fill();   // the pad on the glass
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let k = 0; k < 5; k++) {
      ctx.beginPath(); ctx.arc(-18 + k * 9, -26, 3 + (k % 3), 0, 7); ctx.fill();
    }
    ctx.restore();
  } else if (w.tool === "hose") {
    // the hose drapes from the faucet to the nozzle at the pointer
    const ox = Hs.x + 75, oy = Hs.y + 101;
    ctx.strokeStyle = "#3f9c57";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo((ox + px) / 2 - 60, (oy + py) / 2 + 40, px - 6, py - 6);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.save();
    ctx.translate(px - 6, py - 6);
    ctx.rotate(0.6);
    ctx.fillStyle = "#22303f";
    rr(ctx, -8, -5, 22, 10, 3); ctx.fill();
    ctx.fillStyle = "#3f7fd4";
    rr(ctx, 14, -4, 5, 8, 2); ctx.fill();
    ctx.restore();
    if (pointerDown && !w.done) {
      ctx.fillStyle = "rgba(120, 210, 255, 0.75)";
      for (let k = 0; k < 8; k++) {
        ctx.beginPath();
        ctx.arc(px + 10 + 8 * k, py + 10 + 6 * k, 2.2, 0, 7);
        ctx.fill();
      }
    }
  }

  // --- status: how much grime and suds remain, and which step is up
  const n = w.g.length;
  const gAvg = w.g.reduce((a, v) => a + v, 0) / n;
  const fAvg = w.f.reduce((a, v) => a + v, 0) / n;
  const P = { x: 330, y: 18, w: 300, h: 84 }; // top center — where the old sign used to sit
  ctx.fillStyle = mix("#151c26", "#0e141d", nf);
  rr(ctx, P.x, P.y, P.w, P.h, 12); ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  rr(ctx, P.x, P.y, P.w, P.h, 12); ctx.stroke();
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(226,235,248,0.8)";
  ctx.fillText(`DIRT ${Math.round(gAvg * 100)}%`, P.x + 16, P.y + 24);
  ctx.fillStyle = `rgba(143, 227, 242, ${fAvg < 0.05 ? 0.35 : 1})`;
  ctx.fillText(`SOAP ${Math.round(fAvg * 100)}%`, P.x + 128, P.y + 24);
  const bar = { x: P.x + 16, y: P.y + 34, w: P.w - 32, h: 10 };
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  rr(ctx, bar.x, bar.y, bar.w, bar.h, 5); ctx.fill();
  if (gAvg < 1) {
    ctx.fillStyle = "#57e08a";
    rr(ctx, bar.x, bar.y, bar.w * (1 - gAvg), bar.h, 5); ctx.fill();
  }
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = w.done ? "#8fe3f2" : fAvg < 0.5 ? "rgba(255,220,150,0.95)" : "rgba(226,235,248,0.85)";
  ctx.fillText(
    w.done ? "✨ Sparkling clean — the driver will notice"
      : fAvg < 0.5 ? "1 · soap up the windshield (brush)"
      : "2 · rinse the soap off (hose)",
    P.x + 16, P.y + 66);

  // sparkles over a finished windshield
  if (w.done) {
    ctx.fillStyle = "#fff";
    for (let k = 0; k < 8; k++) {
      const u = ((k * 53) % 10) / 10, v = ((k * 29) % 10) / 10;
      ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(performance.now() / 300 + k * 1.7));
      ctx.font = "11px system-ui";
      ctx.fillText("✦", Wd.x + 8 + u * (Wd.w - 16), Wd.y + 6 + v * (Wd.h - 12));
    }
    ctx.globalAlpha = 1;
  }

  // --- exit back to the layover
  ctx.fillStyle = mix("#20303f", "#111925", nf);
  rr(ctx, Ex.x, Ex.y, Ex.w, Ex.h, 10); ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(120, 225, 255, ${0.35 + 0.3 * pulse})`;
  rr(ctx, Ex.x, Ex.y, Ex.w, Ex.h, 10); ctx.stroke();
  ctx.fillStyle = "rgba(226,235,248,0.9)";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚪 EXIT (E)", Ex.x + Ex.w / 2, Ex.y + Ex.h / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// A guest leaves the stall and joins the payment line.
function enterCounter(p) {
  p.bill = pick(BILL_POOL);
  p.owed = p.bill - WC_PRICE;
  p.changeGiven = 0;
  p.cologne = false;
  p.colognePrev = null;
  p.payT = 0; p.doneT = 0; p.dripT = 0;
  p.patience = 12 + 5 * facilities.C.queue.length; // further back = more patience
  p.state = "queueC";
  facilities.C.queue.push(p);
}

function stepCounter(timeDt) {
  const f = facilities.C;
  // patience: the line loses 1/s; at the counter, dripC (and any restored
  // doneC) lose 0.5/s.
  // A guest mid-transaction (payC) has handed over their bill — they hang around
  // until they've got their change back, so patience is frozen in payC.
  for (let i = f.queue.length - 1; i >= 0; i--) {
    const p = f.queue[i];
    if (p.state === "queueC") p.waitTotal += timeDt;
    if (p.state !== "payC") p.patience -= (p.state === "queueC" ? 1 : 0.5) * timeDt;
    if (p.patience <= 0) { f.queue.splice(i, 1); stormOut(p); continue; }
    // Line grace: 5–10 in-game minutes to settle the payment, then out the
    // door. Set here when the guest's bus has started boarding (boardAt)
    // while they're still in the line — this keeps the counter line moving
    // mid-stop (abandoners head for the door and can't rejoin). When the bus
    // is ready to depart (stopEnd) its __hurry pass switches the bus to a
    // single SHARED 5–10 min deadline (__lineDeadline) that every counter
    // guest of that bus obeys; a late line entrant joins that same deadline
    // rather than drawing a fresh window of their own, so the bus never waits
    // longer than one 5–10 min window after it is ready. Expiry below then
    // lets paid guests off or sends unpaid ones to board.
    const bus = findBusOf(p);
    if (bus && bus.state === "stop" && reached(p.boardAt) && p.leaveLineAt == null)
      p.leaveLineAt = (bus.__hurry && bus.__lineDeadline != null)
        ? bus.__lineDeadline
        : S.time + rand(5 / 60, 10 / 60);
    if (p.leaveLineAt != null && reached(p.leaveLineAt)) {
      f.queue.splice(i, 1);
      if (p.changeGiven >= p.owed) finalizePayment(p); // already paid — let them off
      else giveUpLine(p);
    }
  }
  // the front of the line steps up to the pay spot
  const front = f.queue[0];
  if (!front) return;
  if (front.state === "queueC") {
    front.state = "payC";
    front.payT = 0;
    front.patience = 12;
    if (front.owed <= 0) finalizePayment(front); // exact bill — nothing to do, out the door
  }
  if (front.state === "dripC") {
    front.dripT -= timeDt;
    if (front.dripT <= 0) { front.state = front.colognePrev || "payC"; front.colognePrev = null; }
  }
  // Backstop only: live guests finalize the instant they're settled, so doneC
  // never rests. This clears a doneC guest restored from an old mid-wait save.
  if (front.state === "doneC") finalizePayment(front);
}

// The final rating, settled when the payment is done.
function finalSat(p) {
  let sat = p.useSat != null ? p.useSat : SAT_BASE;
  sat -= Math.max(0, p.waitTotal - 12) * 0.5;
  if (p.changeGiven === p.owed) sat += 10; // perfect change
  else if (p.changeGiven > p.owed) sat -= 6; // overpaid — the guest noticed
  if (p.cologne) sat += 8;
  return clamp(sat + rand(-8, 8), 0, 100);
}

function finalizePayment(p) {
  const i = facilities.C.queue.indexOf(p);
  if (i >= 0) facilities.C.queue.splice(i, 1);
  finishVisit(p, finalSat(p), true); // change in hand — walk out through the EXIT door
}

function stormOut(p) {
  toast("💢 A guest stormed out of the counter — no payment!", "bad");
  finishVisit(p, clamp((p.useSat != null ? p.useSat : 60) - 20, 15, 60));
}

// Their bus is leaving and the line still isn't clear: the guest abandons
// the payment and walks straight to the boarding door.
function giveUpLine(p) {
  toast("💢 A guest left the WC line without paying to catch the bus", "bad");
  finishVisit(p, clamp((p.useSat != null ? p.useSat : 60) - 15, 15, 60));
  // Belt-and-braces: finishVisit only sprints when boardAt is reached; if the
  // guest is left walking or idling, send them for the door at full sprint.
  if (p.state === "walk" || p.state === "free") {
    const bus = findBusOf(p);
    if (bus && bus.state === "stop") goDoor(p, bus);
  }
}

// You hand back change from the till (called on chip clicks).
function giveChange(d) {
  const front = facilities.C.queue[0];
  if (!front || front.state !== "payC") return;
  front.changeGiven += d;
  // The moment the owed change is handed back the guest is done — no loiter:
  // they leave immediately so the line never waits on a settled guest.
  if (front.changeGiven >= front.owed) finalizePayment(front);
}

// You splash cologne on the guest at the counter (called on bottle clicks).
function offerCologne() {
  const front = facilities.C.queue[0];
  if (S.bottle <= 0) { toast("🧴 The cologne bottle is empty — it refills at midnight", ""); return; }
  if (!front || (front.state !== "payC" && front.state !== "doneC") || front.cologne) return;
  front.cologne = true;
  front.colognePrev = front.state;
  front.state = "dripC";
  front.dripT = 0.8;
  S.bottle = Math.max(0, S.bottle - rand(8, 14));
  S.stats.cologne++;
}

// The tail of a visit: stats, reputation, and where the guest goes next.
// viaDoor: the guest is still INSIDE the WC — no snap out; they take the
// long way home, strolling to the EXIT door (the "leaveC" state below).
function finishVisit(p, sat, viaDoor = false) {
  if (!viaDoor && isIndoorPax(p)) { p.x = 852; p.y = 169; } // back on the outdoor side of the door
  sat = clamp(sat, 0, 100);
  p.sat = sat;
  p.refuseR = p.refuseT = false;
  p.waitReal = 0;
  p.useSat = null;
  S.stats.served++;
  S.stats.satSum += sat;
  S.stats.satN++;
  S.rep = clamp(S.rep + (sat - 50) * 0.02, 0, 100);

  if (viaDoor) {
    // Settled at the counter — stroll to the EXIT door, then out (updatePax).
    p.state = "leaveC";
    p.tx = DOOR_IN.x; p.ty = DOOR_IN.y; // keep targets valid if a hard cap flips us to board
    return;
  }

  const bus = findBusOf(p);
  if (bus && reached(p.boardAt)) {
    if (bus.state === "stop") { p.state = "walk"; goDoor(p, bus); }
    else { p.state = "bus"; p.__boarded = true; } // bus already pulled out — consider it boarded
  }
  else if (bus && bus.state === "stop") {
    p.state = "free"; p.idleT = rand(1, 3);
    p.tx = p.x; p.ty = p.y;
  } else {
    p.state = "walk";
    if (bus) goDoor(p, bus); else wander(p);
  }
}

// The bus's planned stop is over (stopEnd) and this guest is still mid-visit.
// The bus can't wait for the service to play out: it is finished early, with a
// satisfaction penalty, and the guest heads straight for the boarding door.
// (finishVisit snaps indoor guests back out the door and sends them for it,
// since their boardAt is already past.)
function interruptService(p, bus) {
  if (p.state === "serveR") {
    const i = facilities.R.spots.findIndex(s => s && s.pax === p);
    if (i >= 0) facilities.R.spots[i] = null;
    const sat = clamp(SAT_BASE - 15 - Math.max(0, p.waitReal - 8) * 0.5, 15, 100);
    finishVisit(p, sat);
  } else { // serveT — the visit counts, but the bus can't hold
    const i = facilities.T.spots.findIndex(s => s && s.pax === p);
    if (i >= 0) facilities.T.spots[i] = null;
    p.bladder = 10;
    // the visit was interrupted mid-use — their stall still gets the dirt
    const si = p.stall;
    const sc = si >= 0 && si < WC_STALLS ? S.stallClean[si] : S.cleanliness;
    if (si >= 0 && sc > 15) S.stallClean[si] = Math.max(0, sc - rand(8, 16));
    const sat = clamp((p.useSat != null ? p.useSat : SAT_BASE) - 15, 15, 100);
    finishVisit(p, sat);
  }
}

/* ------------------------------ Update ------------------------------ */
function update(dt, timeDt = dt) {
  // Sub-step coarse frames. Every timer in this sim integrates per second —
  // queue patience (8–30 s), stall service (4–6 s), stop clocks — so one step
  // of a few seconds (a 100x/200x frame on a busy tab: dt up to 10–20 s)
  // would zero a queue's patience before its stall is even checked, or fling a
  // bus off the scene. Sub-steps keep each piece of state integrated at
  // ≤2 s resolution regardless of frame rate; the cap keeps a very long
  // hidden-tab catch-up responsive (its far end stays coarse, as before).
  if (timeDt > 2) {
    const k = Math.min(60, Math.ceil(timeDt / 2));
    for (let i = 0; i < k; i++) update(dt / k, timeDt / k);
    return;
  }
  // the bus we're washing must still be parked, or we step back out
  if (S.view === "wash") {
    const wb = buses.find(x => x.id === S.washBus);
    if (!wb || wb.state !== "stop") setView("out");
  }
  // clock — driven by real elapsed time, so 1 game hour = 6 real minutes (at 1x)
  S.time += timeDt / SECONDS_PER_HOUR;
  // while-loop: a catch-up after a long hidden tab may cross several midnights
  while (S.time >= 24) {
    S.time -= 24; S.day++; S.bottle = BOTTLE_MAX; showDaySummary();
    S.lastSave = S.time; // time wrapped — otherwise the >8h autosave never re-arms this day
  }

  // bus spawning — max 4 parked, at most one inbound bus at a time.
  // Total scene buses is capped at BAY_SLOTS (not +1): a departing bus still
  // holds its spot until it drives off-screen, so a new bus may only spawn
  // while <= 3 exist — otherwise 3 parked + 1 just-departed admits a 5th.
  const parked = buses.filter(b => b.state === "stop" || b.state === "enter").length;
  const inbound = buses.some(b => b.state === "drive" && !b.stoppedOnce && b.cx < 700);
  // Two triggers: the rep-scaled schedule, and a vacancy backstop — a stall
  // that has sat empty longer than maxGap() pulls the next bus in right now.
  // At rep 100 that's 30 min (a busy terminal's stalls stay filled); at rep 0
  // the 2 h window stays looser than the 1.2–2 h schedule, so a quiet
  // terminal keeps breathing (visits at least every other hour).
  let vacantTooLong = -1; // stall that has been vacant longest, past its maxGap() deadline
  if (S.slotVacantSince) for (let i = 0; i < BAY_SLOTS.length; i++) {
    const v = S.slotVacantSince[i];
    if (v == null || !reached(v + maxGap())) continue;
    // (S.time - v) wraps midnight safely: a stall can't sit vacant >12 h (the
    // backstop fires at <= 2 h), so the +24 modulo is the true elapsed time.
    if (vacantTooLong < 0 ||
        (S.time - v + 24) % 24 < (S.time - S.slotVacantSince[vacantTooLong] + 24) % 24) vacantTooLong = i;
  }
  const scheduleDue = reached(S.nextBusAt);
  if ((scheduleDue || vacantTooLong >= 0) && parked < BAY_SLOTS.length && !inbound && buses.length < BAY_SLOTS.length) {
    // A backstop bus is promised the stall that went quiet longest, so the
    // 30-minute guarantee lands on the right stall (baySlotFor honors
    // forcedSlot); a plain schedule bus takes the first free stall it reaches.
    spawnBus(vacantTooLong >= 0 ? vacantTooLong : null);
    S.nextBusAt = S.time + busInterval();
  }

  // buses
  for (let i = buses.length - 1; i >= 0; i--) {
    const b = buses[i];
    if (b.state === "drive") {
      b.cx += 185 * dt;
      b.cy = lerp(b.cy, LANE_Y - 45, Math.min(1, dt * 3));
      b.ang = lerp(b.ang, 0, Math.min(1, dt * 5));
      // Entry is purely geometric (baySlotFor: the bus must have passed a free
      // slot) — no time gate, so entry works at any time scale.
      if (!b.stoppedOnce) {
        const si = baySlotFor(b);
        if (si >= 0) beginEnter(b, si);
      }
      // Only cull buses still driving: a coarse step (a 100x/200x frame on a
      // busy tab moves a bus 185·10 = 1850px) can carry an inbound bus past
      // every bay threshold AND the removal line in the same step — the
      // beginEnter above already switched its state, so without this guard the
      // just-parked bus would be spliced off the scene.
      if (b.state === "drive" && b.cx - b.len / 2 > W + 60) buses.splice(i, 1);
    } else if (b.state === "stop") {
      // The bus holds its spot past stopEnd until every passenger has actually
      // made it aboard, then lingers a little (boardGrace) before pulling out.
      b.stopElapsed = (b.stopElapsed || 0) + timeDt; // real dwell time (1:1 world)
      if (!b.__hurry && reached(b.stopEnd)) {
        // The planned layover is over: everyone still outside hurries for the
        // boarding door. Guests still in the WC payment line get ONE shared
        // 5–10 in-game minute deadline — the bus itself waits a single window
        // from the ready moment, and every counter guest of this bus obeys the
        // same leaveLineAt (re-anchored here; any earlier per-guest grace is
        // overwritten, and any late line entrant joins that same deadline —
        // see stepCounter). When it expires, stepCounter releases paid guests
        // and sends the still-unpaid ones out to board, so the line can hold
        // the bus up by at most that one 5–10 min window. The 1-hour hard cap
        // below stays as the backstop.
        b.__hurry = true;
        let lineDeadline = null;
        for (const p of b.pax) {
          if (p.state === "bus" || p.state === "board") continue; // aboard / already walking
          if (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC") {
            if (lineDeadline == null)
              lineDeadline = S.time + rand(5 / 60, 10 / 60); // one grace draw per bus, from the ready moment
            p.leaveLineAt = lineDeadline; // shared by all counter pax — any earlier per-guest grace is overwritten
            continue;
          }
          if (p.state === "free" || p.state === "walk") { goDoor(p, b); continue; }
          if (p.state === "waitR" || p.state === "waitT") {
            const q = facilities[p.state === "waitR" ? "R" : "T"].queue;
            const qi = q.indexOf(p);
            if (qi >= 0) q.splice(qi, 1);
            goDoor(p, b);
            continue;
          }
          if (p.state === "serveR" || p.state === "serveT") {
            interruptService(p, b);
            p.state = "board"; // sprint the last stretch, not a stroll
          }
        }
        b.__lineDeadline = lineDeadline; // the shared window (null if nobody was in the line)
      }
      if (reached(b.stopEnd) && allAbroad(b)) {
        b.boardGrace = (b.boardGrace || 0) + dt;
        if (b.boardGrace >= (b.boardWait != null ? b.boardWait : 2)) endStop(b);
      } else if (b.stopElapsed >= SECONDS_PER_HOUR) {
        // Hard cap: a full in-game hour in the terminal. The bus leaves no
        // matter what — anyone still in the WC payment line gives up on the
        // payment and walks for the boarding door.
        for (const p of b.pax) {
          const qi = facilities.C.queue.indexOf(p);
          if (qi >= 0) { facilities.C.queue.splice(qi, 1); giveUpLine(p); }
        }
        toast("⏱ An hour in the terminal — the bus pulls out no matter what", "bad");
        endStop(b);
      }
    } else { // "enter" | "exit" — the 1.4 s eased turn
      b.animT = Math.min(1, b.animT + dt / 1.4);
      if (b.state === "enter") b.stopElapsed = (b.stopElapsed || 0) + timeDt; // dwell clock keeps running
      const t = easeInOut(b.animT);
      b.cx = lerp(b.animFrom.cx, b.animTo.cx, t);
      b.cy = lerp(b.animFrom.cy, b.animTo.cy, t);
      b.ang = lerp(b.animFrom.ang, b.animTo.ang, t);
      if (b.animT >= 1) (b.state === "enter" ? finishEnter : finishExit)(b);
    }
    // passengers
    for (const p of b.pax) updatePax(p, b, dt, timeDt);
  }

  updateFacilities(dt, timeDt);
  stepCounter(timeDt);
  updateCars(dt);

  if (S.time - S.lastSave > 8) { S.lastSave = S.time; save(); }
}

function updatePax(p, bus, dt, timeDt = dt) {
  if (p.state === "bus") {
    const d = doorPos(bus);
    p.x = d.x; p.y = d.y;
    riseNeeds(p, timeDt);
    if (bus.state === "stop" && reached(p.offAt) && !reached(p.boardAt)) {
      p.state = "walk"; p.want = null;
      p.__boarded = false; // off the bus for this cycle
      p.tx = d.x; p.ty = d.y + 4;
    } else if (bus.stoppedOnce && reached(p.boardAt) && !p.__boarded) {
      // One-shot per boarding cycle. Guests who stayed aboard keep their
      // heads in the windows (the flag stays true); only a guest who never
      // re-boarded after a visit would flip to the door here, and exactly once.
      p.state = "board"; p.tx = d.x; p.ty = d.y;
    }
    return;
  }

  riseNeeds(p, timeDt);

  // disembarked: walk toward target
  if (p.state === "walk" || p.state === "board") {
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = (p.state === "board" ? 150 : 55) * dt; // sprinting to catch the bus
    if (d <= step) {
      p.x = p.tx; p.y = p.ty;
      if (p.state === "board") { p.state = "bus"; p.__boarded = true; } // aboard again for this cycle
      else { p.state = "free"; p.idleT = rand(1, 3.5); p.tx = p.x; p.ty = p.y; evaluate(p, bus); }
    } else {
      p.x += dx / d * step;
      p.y += dy / d * step;
    }
    return;
  }

  if (p.state === "free") {
    p.idleT -= dt;
    if (p.idleT <= 0) evaluate(p, bus);
    return;
  }

  if (p.state === "waitR" || p.state === "waitT") {
    // stand in queue slot
    const f = facilities[p.state === "waitR" ? "R" : "T"];
    const i = f.queue.indexOf(p);
    if (i === -1) { p.state = "free"; p.idleT = rand(0.5, 2); return; }
    if (p.state === "waitR") { p.x = 676 - 16 * (i + 1); p.y = 168 - (i % 2) * 3; }
    else { p.x = Math.min(940, 866 + 16 * (i + 1)); p.y = 168 - (i % 2) * 3; }
    return;
  }

  if (p.state === "serveR") { p.x = 690; p.y = 169; return; }
  if (p.state === "serveT") {
    // indoors: fresh pulls spawn at the EXIT door (stepFac); enterT only
    // matters for saves loaded mid-entry. Then walk to your stall bay — the
    // slot is fixed for the whole visit (stepFac pins p.stall), so the guest
    // stays on that toilet and never drifts onto another one mid-use.
    let ti = p.stall;
    if (!(ti >= 0 && ti < WC_STALLS && facilities.T.spots[ti] && facilities.T.spots[ti].pax === p))
      ti = facilities.T.spots.findIndex(s => s && s.pax === p);
    if (ti === -1) { p.state = "free"; p.idleT = rand(0.5, 2); return; }
    if (p.enterT) {
      moveToward(p, p.enterT.x, p.enterT.y, 100 * dt);
      if (Math.hypot(p.x - p.enterT.x, p.y - p.enterT.y) < 8) p.enterT = null;
      return;
    }
    moveToward(p, stallBay(ti).x + 26, 330, 100 * dt);
    // the door shuts only once the guest has stepped in — before that the
    // leaf stays ajar and the guest is visible walking off to their bay
    if (Math.hypot(p.x - (stallBay(ti).x + 26), p.y - 330) < 8) p.inStall = true;
    return;
  }
  const cqi = facilities.C.queue.indexOf(p);
  if (p.state === "queueC") {
    if (cqi === -1) { p.state = "free"; p.idleT = rand(0.5, 2); return; }
    const s = queueSlot(cqi);
    moveToward(p, s.x, s.y, 100 * dt);
    return;
  }
  if (p.state === "payC" || p.state === "doneC" || p.state === "dripC") {
    moveToward(p, PAY_SPOT.x, PAY_SPOT.y, 100 * dt);
    return;
  }
  if (p.state === "leaveC") {
    // Paid, change in hand: stroll to the EXIT door, then out to the lot.
    const bus = findBusOf(p);
    if (bus && bus.state === "stop" && reached(p.boardAt)) {
      p.x = 852; p.y = 169;   // their bus is boarding — out the door and sprint
      goDoor(p, bus);          // sets state to "board"
      return;
    }
    moveToward(p, DOOR_IN.x, DOOR_IN.y, 100 * dt);
    if (Math.hypot(p.x - DOOR_IN.x, p.y - DOOR_IN.y) < 8) {
      p.x = 852; p.y = 169;    // step out onto the outdoor side
      if (bus && reached(p.boardAt)) {
        if (bus.state === "stop") goDoor(p, bus); // sprint the rest of the way
        else { p.state = "bus"; p.__boarded = true; }  // bus already pulled out — count as boarded
      } else {
        p.state = "free"; p.idleT = rand(1, 3);
        p.tx = p.x; p.ty = p.y;
      }
    }
    return;
  }
}

function moveToward(p, tx, ty, step) {
  const dx = tx - p.x, dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= step) { p.x = tx; p.y = ty; return; }
  p.x += dx / d * step;
  p.y += dy / d * step;
}
function isIndoorPax(p) {
  return p.state === "serveT" || p.state === "leaveC" || p.state === "queueC" ||
         p.state === "payC" || p.state === "doneC" || p.state === "dripC";
}
function queueSlot(i) {
  // a single line walking up toward the counter, just behind the glass
  const y = Math.max(236, 332 - i * 20);
  const x = 560 + (i === 0 ? 0 : i % 2 ? -28 : 28);
  return { x, y };
}

function riseNeeds(p, timeDt) {
  const h = timeDt / SECONDS_PER_HOUR; // real seconds → game hours
  p.hunger = clamp(p.hunger + 38 * h, 0, 100);
  p.thirst = clamp(p.thirst + 45 * h, 0, 100);
  p.bladder = clamp(p.bladder + BLADDER_RISE * h, 0, 100);
}

/* ------------------------------- Cars ------------------------------- */
let carTimer = 3;
function updateCars(dt) {
  carTimer -= dt;
  if (carTimer <= 0) {
    carTimer = rand(4, 9);
    cars.push({ x: W + 40, y: 462, hue: randInt(0, 359), v: -rand(120, 190) });
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    cars[i].x += cars[i].v * dt;
    if (cars[i].x < -80) cars.splice(i, 1);
  }
}

/* ------------------------------ Rendering --------------------------- */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function skyColors(t) {
  // returns [top, bottom]
  if (t < 5 || t >= 21.5) return ["#0b1026", "#1a2140"];
  if (t < 7) { const f = (t - 5) / 2; return [mix("#0b1026", "#7ec8f7", f), mix("#33254a", "#b8e2fa", f)]; }
  if (t < 18) return ["#5fb2ef", "#b8e2fa"];
  if (t < 21.5) { const f = (t - 18) / 3.5; return [mix("#5fb2ef", "#0b1026", f), mix("#b8e2fa", "#33254a", f)]; }
  return ["#0b1026", "#1a2140"];
}
function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
}
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

function nightFactor() {
  const t = S.time;
  if (t < 5 || t >= 21) return 1;
  if (t < 7) return 1 - (t - 5) / 2;
  if (t < 19) return 0;
  return (t - 19) / 2;
}

const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * 80, s: Math.random() * 1.6 + 0.4 }));
const trees = [ { x: 60, s: 1.1 }, { x: 150, s: 0.8 }, { x: 250, s: 1.2 }, { x: 930, s: 0.9 } ];

function drawScene() {
  if (S.view === "wc") drawWCInterior();
  else if (S.view === "wash") drawWashView();
  else drawOutdoor();
  if (viewFade > 0.001) {
    ctx.fillStyle = `rgba(6, 9, 18, ${viewFade})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawOutdoor() {
  // sky
  const [top, bot] = skyColors(S.time);
  const g = ctx.createLinearGradient(0, 0, 0, GRASS.top);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GRASS.top);

  const nf = nightFactor();
  if (nf > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (nf - 0.3)})`;
    for (const s of stars) { ctx.globalAlpha = (nf - 0.3); ctx.fillRect(s.x, s.y, s.s, s.s); }
    ctx.globalAlpha = 1;
  }

  // sun / moon
  const dayT = (S.time - 6) / 12;           // sun arc 6..18
  if (S.time >= 5 && S.time <= 19) {
    const f = clamp(dayT, 0, 1);
    const sx = lerp(60, W - 60, f), sy = 70 - Math.sin(f * Math.PI) * 45;
    ctx.fillStyle = "#ffd75e";
    ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill();
  } else {
    const f = clamp(((S.time + 24 - 19) % 24) / 11, 0, 1);
    const mx = lerp(60, W - 60, f), my = 66 - Math.sin(f * Math.PI) * 40;
    ctx.fillStyle = "#e8ecf5";
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, 7); ctx.fill();
    ctx.fillStyle = skyColors(S.time)[0];
    ctx.beginPath(); ctx.arc(mx + 7, my - 4, 13, 0, 7); ctx.fill();
  }

  // mountains
  ctx.fillStyle = mix("#3c6e58", "#141d33", nf * 0.8);
  ctx.beginPath();
  ctx.moveTo(0, GRASS.top);
  ctx.lineTo(0, 60); ctx.lineTo(140, 28); ctx.lineTo(300, 64); ctx.lineTo(430, 36);
  ctx.lineTo(590, 56); ctx.lineTo(740, 32); ctx.lineTo(900, 64); ctx.lineTo(W, 48); ctx.lineTo(W, GRASS.top);
  ctx.closePath(); ctx.fill();

  // grass
  ctx.fillStyle = mix("#58b368", "#1c3a2a", nf * 0.85);
  ctx.fillRect(0, GRASS.top, W, GRASS.bot - GRASS.top);

  // trees
  for (const tr of trees) {
    const s = tr.s, bx = tr.x, by = GRASS.bot - 24;
    ctx.fillStyle = mix("#6b4a2b", "#232c33", nf * 0.7);
    ctx.fillRect(bx - 4 * s, by - 18 * s, 8 * s, 20 * s);
    ctx.fillStyle = mix("#2e8b57", "#16324a", nf * 0.75);
    ctx.beginPath();
    ctx.moveTo(bx, by - 62 * s);
    ctx.lineTo(bx - 22 * s, by - 16 * s);
    ctx.lineTo(bx + 22 * s, by - 16 * s);
    ctx.closePath(); ctx.fill();
  }

  drawLot();
  drawSign();
  drawRestStop();
  drawRoads();
  for (const c of cars) drawCar(c);
  for (const b of buses) drawBus(b);
  for (const b of buses) for (const p of b.pax) if (p.state !== "bus" && !isIndoorPax(p)) drawPax(p);

  // night overlay + lights
  if (nf > 0.05) {
    ctx.fillStyle = `rgba(8, 12, 34, ${0.34 * nf})`;
    ctx.fillRect(0, 0, W, H);
    if (nf > 0.4) {
      // warm window glow
      ctx.fillStyle = `rgba(255, 190, 90, ${0.5 * nf})`;
      ctx.fillRect(630, 130, 26, 22); ctx.fillRect(700, 130, 26, 22); ctx.fillRect(750, 130, 26, 22);
      ctx.fillRect(826, 134, 20, 18); ctx.fillRect(858, 134, 20, 18);
    }
  }

  drawWcPrompt(); // after the overlay — the nudge stays bright at night
  drawWashHint(); // ditto — a dusty parked bus hints at the wash
}

function drawLot() {
  const nf = nightFactor();
  // asphalt band
  ctx.fillStyle = mix("#4a5261", "#1d232e", nf * 0.7);
  ctx.fillRect(0, LOT.top, W, LOT.bot - LOT.top);
  // dashed outline per stall
  ctx.strokeStyle = "rgba(255,205,80,0.55)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([14, 10]);
  for (const s of BAY_SLOTS) {
    ctx.strokeRect(s.cx - 36, LOT_NOSE, 72, LOT.bot - LOT_NOSE);
  }
  ctx.setLineDash([]);
  // label
  ctx.fillStyle = "rgba(255,205,80,0.5)";
  ctx.font = "bold 12px system-ui";
  ctx.fillText("BUS PARKING", 240, 250);
}

function drawSign() {
  const x = 470, y = 124;
  ctx.fillStyle = "#8a6a3d";
  ctx.fillRect(x + 18, y + 52, 8, 14);
  ctx.fillRect(x + 96, y + 52, 8, 14);
  ctx.fillStyle = "#173a5e";
  rr(ctx, x, y, 122, 52, 8); ctx.fill();
  ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 2;
  rr(ctx, x, y, 122, 52, 8); ctx.stroke();
  ctx.fillStyle = "#ffb347";
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("LAYOVER LANE", x + 61, y + 22);
  ctx.fillStyle = "#cfe0ff";
  ctx.font = "10px system-ui";
  ctx.fillText("FOOD • TOILETS", x + 61, y + 38);
  // rep stars
  const stars = Math.round(S.rep / 20);
  ctx.fillStyle = "#ffd36b";
  ctx.font = "11px system-ui";
  let ss = "";
  for (let i = 0; i < 5; i++) ss += i < stars ? "★" : "☆";
  ctx.fillText(ss, x + 61, y + 50);
  ctx.textAlign = "left";
}

function drawRestStop() {
  const nf = nightFactor();
  // --- diner ---
  ctx.fillStyle = mix("#d94f3d", "#3a2430", nf * 0.7);
  rr(ctx, 615, 110, 180, 60, 6); ctx.fill();
  // awning stripes
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? "#f4ede0" : mix("#d94f3d", "#3a2430", nf * 0.7);
    ctx.fillRect(615 + i * 18, 124, 18, 12);
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(615, 136, 180, 3);
  // windows
  ctx.fillStyle = mix("#ffe9b8", "#5a4a30", nf * 0.5);
  ctx.fillRect(630, 140, 26, 22); ctx.fillRect(700, 140, 26, 22); ctx.fillRect(750, 140, 26, 22);
  // door (serving point)
  ctx.fillStyle = "#5e3b22";
  ctx.fillRect(683, 142, 14, 28);
  // roof sign
  ctx.fillStyle = "#2b2117";
  rr(ctx, 660, 90, 90, 22, 5); ctx.fill();
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("DINER", 705, 105);
  ctx.textAlign = "left";

  // --- toilets ---
  ctx.fillStyle = mix("#8d99ae", "#2c3547", nf * 0.7);
  rr(ctx, 812, 118, 78, 52, 6); ctx.fill();
  ctx.fillStyle = mix("#ffe9b8", "#5a4a30", nf * 0.5);
  ctx.fillRect(826, 134, 20, 18); ctx.fillRect(858, 134, 20, 18);
  ctx.fillStyle = "#1d2333";
  ctx.fillRect(845, 140, 12, 30); // open doorway — the WC has no door
  ctx.fillStyle = "#1d2333";
  rr(ctx, 818, 100, 66, 20, 5); ctx.fill();
  ctx.fillStyle = "#9fe8ff";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("WC · ₺20", 851, 114);
  ctx.textAlign = "left";
  // cleanliness bar
  const cw = 66;
  ctx.fillStyle = "#0d1120";
  ctx.fillRect(818, 90, cw, 6);
  const cfrac = S.cleanliness / 100;
  ctx.fillStyle = cfrac > 0.6 ? "#5ad07a" : cfrac > 0.3 ? "#ffd36b" : "#ff6b6b";
  ctx.fillRect(818, 90, cw * cfrac, 6);
  // stink cloud when dirty
  if (S.cleanliness < 40) {
    const a = (40 - S.cleanliness) / 40 * 0.7;
    ctx.fillStyle = `rgba(120, 160, 90, ${a * (0.6 + 0.4 * Math.sin(performance.now() / 300))})`;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(884 + i * 8, 86 - i * 8, 6 + i * 2, 0, 7);
      ctx.fill();
    }
  }
}

/* ------------------ Counter room (you, behind the counter) ----------- */
function drawCounterIn() {
  const d = COUNTER_IN.desk;
  // the full-width wooden teller counter
  ctx.fillStyle = "#8a6a3d";
  rr(ctx, d.x, d.y, d.w, 68, 3); ctx.fill();                        // front panels
  ctx.fillStyle = "#7d5f36";
  rr(ctx, d.x, d.y - 1, d.w, 3, 2); ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1;
  for (let x = d.x + 30; x < d.x + d.w - 8; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, d.y + 6); ctx.lineTo(x, d.y + 62); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 226, 160, 0.10)";
  ctx.beginPath();
  for (let x = d.x + 15; x < d.x + d.w - 8; x += 30) {
    ctx.moveTo(x, d.y + 34); ctx.lineTo(x + 10, d.y + 30);
  }
  ctx.stroke();                                                     // wood grain
  ctx.fillStyle = "#a9854f";
  rr(ctx, d.x - 8, d.y - 8, d.w + 16, 10, 3); ctx.fill();           // counter top
  ctx.fillStyle = "rgba(255, 240, 200, 0.35)";
  ctx.fillRect(d.x - 8, d.y - 8, d.w + 16, 3);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(d.x - 8, d.y + 2, d.w + 16, 3);
  // the open cash drawer
  function drawDrawer() {
    ctx.fillStyle = "#3a4150";
    rr(ctx, 434, 372, 212, 152, 4); ctx.fill();                    // open drawer
    ctx.fillStyle = "#12151d";
    ctx.fillRect(440, 378, 200, 90);
    for (const c of COUNTER_IN.chips) {                             // the three bill trays
      ctx.fillStyle = "#0e1118";
      rr(ctx, c.x - 4, c.y - 4, c.w + 8, c.h + 8, 3); ctx.fill();
      ctx.fillStyle = c.color;
      rr(ctx, c.x, c.y, c.w, c.h + 20, 3); ctx.fill();
      ctx.fillStyle = "rgba(15, 30, 20, 0.65)";
      ctx.fillRect(c.x + 2, c.y + c.h / 2 - 3, c.w - 4, 16);
      ctx.fillStyle = "#eaf5e6";
      ctx.font = "bold 7px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2 + 7.5);
    }
    ctx.fillStyle = "#0e1118";                                      // coin compartment
    rr(ctx, 440, 468, 200, 44, 3); ctx.fill();
    ctx.fillStyle = "#2a3040";
    for (let i = 1; i < 5; i++) ctx.fillRect(440 + i * 40, 470, 1.5, 16);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = "#d9a94e";
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.arc(448 + i * 40 + k * 9, 478, 3.5, 0, 7); ctx.fill();
      }
    }
    // ctx.fillStyle = "#3a4150";                                      // front face + handle
    // ctx.fillRect(436, 478, 208, 8);
    ctx.fillStyle = "#cfd6e4";
    rr(ctx, 526, 513, 28, 5, 2); ctx.fill();
    ctx.textAlign = "left";
  }
  drawDrawer();
  // calculator, cologne
  function drawCounterItems() {
    ctx.strokeStyle = "#173a5e";                                    // pen
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(158, 446); ctx.lineTo(198, 430); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#222835";                                      // calculator
    rr(ctx, 300, 404, 52, 54, 4); ctx.fill();
    ctx.fillStyle = "#9fe8c8";
    ctx.fillRect(306, 410, 40, 12);
    ctx.fillStyle = "#1e3a2c";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "right";
    // the change still owed to the guest at the counter (000 when nobody's).
    // While the front guest is settling (doneC) it previews the NEXT guest in
    // line, the same way the old desk card did.
    const f = facilities.C.queue[0];
    const inC = p => p && (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC");
    const g = (f && f.state === "doneC" && inC(facilities.C.queue[1])) ? facilities.C.queue[1] : f;
    ctx.fillText(String(inC(g) ? Math.max(0, g.owed - g.changeGiven) : 0).padStart(3, "0"), 342, 420);
    ctx.textAlign = "left";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      ctx.fillStyle = (r + c) % 2 ? "#39404f" : "#4a5261";
      ctx.fillRect(306 + c * 14, 428 + r * 9, 11, 6);
    }
    drawBottle();
  }
  drawCounterItems();
}

function drawBottle() {
  const b = COUNTER_IN.bottle;
  const f = S.bottle / BOTTLE_MAX;
  // the 500 ml Turkish cologne: glass body, liquid level, neck, red cap
  if (f > 0.02) {
    const fillH = 30 * f;
    ctx.fillStyle = `rgba(190, 120, 40, ${0.3 + 0.6 * f})`;
    ctx.fillRect(b.x + 2, b.y + 40 - fillH - 1, 20, fillH);
  }
  ctx.fillStyle = "rgba(210, 230, 240, 0.22)";
  ctx.fillRect(b.x, b.y + 8, 24, 32);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(b.x, b.y + 8, 24, 32);          // glass
  ctx.strokeRect(b.x + 7, b.y, 10, 9);           // neck
  ctx.fillStyle = "#c0392b";
  rr(ctx, b.x + 6, b.y - 5, 12, 6, 2); ctx.fill(); // cap
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "6px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("500 ml", b.x + 12, b.y + 48);
  ctx.textAlign = "left";
}

function drawCounterInPrompts() {
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  ctx.textAlign = "center";
  const front = facilities.C.queue[0];
  if (front) {
    if (!front.cologne && S.bottle > 0 && (front.state === "payC" || front.state === "doneC")) {
      const b = COUNTER_IN.bottle;
      ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("drop!", b.x + 12, b.y - 10);
    }
    if (front.state === "payC" && front.changeGiven < front.owed) {
      const c = COUNTER_IN.chips[0];
      ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("change!", c.x + 32, c.y - 8);
    }
  }
  // the hose station asks to be used while stalls need it
  const st = COUNTER_IN.hose;
  if (!hoseInHand && S.stallClean.some(v => v < 60)) {
    ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("grab the hose", st.x + 2, st.y - 8);
  } else if (hoseInHand && S.stallClean.some(v => v < 100)) {
    ctx.fillStyle = `rgba(160, 230, 255, ${pulse})`;
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("hold & drag over a free stall", st.x + 2, st.y - 8);
  }
  ctx.textAlign = "left";
}

/* Wall-mounted queue counter beside the stall row — an LED display that
 * reads like the counter calculator's screen: dark body, pale-green LCD,
 * right-aligned zero-padded digits. Shows the payment line (queueC guests) —
 * the line that actually needs the player. (It used to count the outdoor
 * toilet line — with visits now lasting 1–10 game minutes that queue moves
 * on its own, so the LED tracks the line that waits on you.) */
function drawQueueLed() {
  const x = 368, y = 58, w = 132, h = 72;
  ctx.fillStyle = "#222835";                                    // dark body, like the calculator
  rr(ctx, x, y, w, h, 5); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  rr(ctx, x, y, w, 3, 2); ctx.fill();                          // top edge highlight
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "bold 8px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("WC QUEUE", x + 8, y + 13);
  ctx.fillStyle = "#9fe8c8";                                   // the LCD, like the calculator display
  rr(ctx, x + 8, y + 20, w - 16, 26, 2); ctx.fill();
  const label = String(facilities.C.queue.length).padStart(3, "0");
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(30,58,44,0.18)";                      // unlit ghost segments
  ctx.fillText("888", x + w - 12, y + 41);
  ctx.fillStyle = "#1e3a2c";
  ctx.fillText(label, x + w - 12, y + 41);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "8px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("people waiting", x + w / 2, y + 62);
  ctx.textAlign = "left";
}

/* --------------------- WC interior (behind the counter) ------------- */
/* The cleaning-hose station: a wall faucet with a coiled hose beside the stall row,
 * on the left of the screen, closest to the stalls. Click it (or the 🚿 button in
 * the top bar) to pick the hose up; hold the mouse and drag it over a stall
 * to spray (hoseApply). It pulses amber while any stall needs cleaning. */
function drawHoseStation() {
  const st = COUNTER_IN.hose;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  const needsClean = S.stallClean.some(v => v < 60);
  ctx.save();
  if (hoseInHand) { ctx.shadowColor = "rgba(90, 200, 255, 0.9)"; ctx.shadowBlur = 14; }
  ctx.fillStyle = hoseInHand ? "#1f2c3c" : "#151c26";
  rr(ctx, st.x, st.y, st.w, st.h, 8); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hoseInHand ? `rgba(120, 225, 255, ${0.5 + 0.5 * pulse})`
    : needsClean ? `rgba(255, 211, 107, ${0.4 + 0.5 * pulse})`
    : "rgba(255,255,255,0.12)";
  rr(ctx, st.x, st.y, st.w, st.h, 8); ctx.stroke();
  ctx.lineWidth = 1;
  const fcx = st.x + st.w / 2; // the faucet
  ctx.fillStyle = "#9aa4b2";
  rr(ctx, fcx - 5, st.y + 16, 10, 16, 3); ctx.fill();   // riser
  rr(ctx, fcx - 11, st.y + 30, 22, 8, 3); ctx.fill();  // spout bar
  ctx.fillStyle = "#3f7fd4";
  rr(ctx, fcx - 2.5, st.y + 38, 5, 6, 2); ctx.fill();  // tip
  // the hose coil — full on its station, a stub when it's in your hand
  ctx.strokeStyle = "#3f9c57";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  const coils = hoseInHand ? 1 : 3;
  for (let k = 0; k < coils; k++) {
    ctx.beginPath();
    ctx.ellipse(fcx, st.y + 50 + k * 10, 26 - k * 3, 6, 0, 0, 7);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.fillStyle = "rgba(226,235,248,0.8)";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(hoseInHand ? "IN HAND" : "HOSE — clean", fcx, st.y + st.h - 5);
  ctx.textAlign = "left";
}

// The drawn body box of an indoor pax at the close-up scale (feet anchor at
// p.x, p.y) — a touch looser than the sprite so grazing counts as in front.
function paxBox(p) {
  const s = 5 * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale);
  return { x: p.x - 5.5 * s, y: p.y - 19 * s, w: 11 * s, h: 19.5 * s };
}

// Does this pax stand in front of any CLOSED stall door? (Passers-by draw over
// the leaf; the occupant behind their own door does not.)
function paxInFrontOfClosedDoor(p) {
  const b = paxBox(p);
  for (let i = 0; i < WC_STALLS; i++) {
    if (!stallDoorClosed(i)) continue;
    if (facilities.T.spots[i].pax === p) continue; // the occupant stays hidden
    const bx = stallBay(i).x; // the closed leaf rect is (bx+1, 212, 50, 132) — ends at the counter top
    if (b.x < bx + 51 && b.x + b.w > bx + 1 && b.y < 344 && b.y + b.h > 212) return true;
  }
  return false;
}

function drawWCInterior() {
  // ceiling band + a row of bright fluorescent fixtures
  ctx.fillStyle = "#333a4d";
  ctx.fillRect(0, 0, W, 52);
  ctx.fillStyle = "#2a3040";
  ctx.fillRect(0, 49, W, 3);
  for (const fx of [150, 430, 710]) {
    const lg = ctx.createLinearGradient(0, 31, 0, 128);
    lg.addColorStop(0, "rgba(255, 244, 200, 0.26)");
    lg.addColorStop(1, "rgba(255, 244, 200, 0)");
    ctx.fillStyle = lg;
    ctx.fillRect(fx - 90, 52, 180, 76);                       // light pool on the wall
    ctx.fillStyle = "#141a26";
    ctx.fillRect(fx - 90, 18, 180, 13);
    ctx.fillStyle = "rgba(255, 246, 210, 0.95)";
    ctx.fillRect(fx - 86, 21, 172, 7);
  }
  // warm back wall
  ctx.fillStyle = "#5d584c";
  ctx.fillRect(0, 52, W, 100);
  ctx.fillStyle = "#494438";
  ctx.fillRect(0, 146, W, 6); // baseboard
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 92); ctx.lineTo(W, 92);
  ctx.stroke();
  // floor
  ctx.fillStyle = "#262b36";
  ctx.fillRect(0, 152, W, H - 152);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 152); ctx.lineTo(x, H); }
  for (let y = 152; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // the two stall rows — five bays on the left, five mirrored on the right
  ctx.fillStyle = "#3d465e";
  rr(ctx, 68, 190, 324, 162, 6); ctx.fill();
  rr(ctx, 568, 190, 324, 162, 6); ctx.fill();
  for (let i = 0; i < WC_STALLS; i++) {
    const bx = stallBay(i).x;
    const s = facilities.T.spots[i];
    const dirty = 1 - S.stallClean[i] / 100;
    ctx.fillStyle = "#171c28";
    ctx.fillRect(bx, 214, 52, 138); // dark opening
    // this stall's cleanliness bar — pinned to the top of each toilet
    ctx.fillStyle = "#0d1120";
    rr(ctx, bx + 6, 200, 40, 8, 2); ctx.fill();
    const f = S.stallClean[i] / 100;
    if (f > 0.01) {
      ctx.fillStyle = f > 0.6 ? "#5ad07a" : f > 0.3 ? "#ffd36b" : "#ff6b6b";
      rr(ctx, bx + 6, 200, 40 * f, 8, 2); ctx.fill();
    }
    ctx.fillStyle = "#e8e6e0";
    rr(ctx, bx + 10, 268, 32, 24, 4); ctx.fill(); // tank
    ctx.beginPath(); ctx.ellipse(bx + 26, 314, 15, 8, 0, 0, 7); ctx.fill(); // bowl
    ctx.fillRect(bx + 21, 314, 10, 12);
    // grime builds up on the fixtures and the floor as this stall gets dirty
    if (dirty > 0.1) {
      ctx.fillStyle = `rgba(96, 72, 36, ${Math.min(0.5, dirty * 0.5)})`;
      ctx.beginPath(); ctx.ellipse(bx + 26, 315, 11 + dirty * 7, 6, 0, 0, 7); ctx.fill(); // ring on the bowl
      ctx.fillRect(bx + 8, 336, 8 + dirty * 10, 9);   // floor stain
      ctx.fillRect(bx + 30, 340, 6 + dirty * 6, 5);
      ctx.fillRect(bx + 13, 289, 5 + dirty * 5, 5);   // drip on the tank
    }
    if (stallDoorClosed(i)) {
      ctx.fillStyle = `hsl(${s.pax.hue}, 55%, 55%)`;
      ctx.fillRect(bx + 16, 228, 20, 26); // someone's in there (the closed door hides them below)
    } else {
      // free or walk-in — the door leaf swings open against the wall
      ctx.fillStyle = "#2c3345";
      ctx.fillRect(bx + 44, 214, 8, 138);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(bx + 44, 214, 2, 138); // its edge
    }
  }
  // LED queue counter on the wall beside the stalls (guests draw later, so they pass in front)
  drawQueueLed();
  // the counter (first-person view); the hose station stands beside the stall row
  drawCounterIn();
  drawHoseStation();
  // EXIT door (bottom-right)
  const ex = COUNTER_IN.exit;
  ctx.fillStyle = "#141824";
  rr(ctx, ex.x, ex.y, ex.w, ex.h, 6); ctx.fill(); // doorway
  ctx.fillStyle = "#5e3b22";
  rr(ctx, ex.x + 8, ex.y + 8, ex.w - 16, ex.h - 16, 5); ctx.fill(); // door panel
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EXIT", ex.x + ex.w / 2, ex.y + ex.h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "9px system-ui, sans-serif";
  ctx.fillText("→ outside", ex.x + ex.w / 2, ex.y + ex.h / 2 + 14);
  ctx.textAlign = "left";
  // the guests (drawn 5x — the room is a close-up)
  for (const b of buses) for (const p of b.pax) if (isIndoorPax(p)) drawPax(p, 5);
  drawCounterInPrompts();
  // the stall doors close while someone is inside — drawn AFTER the guests so
  // the closed leaf hides the person (and the grime) from the counter side
  for (let i = 0; i < WC_STALLS; i++) {
    if (!stallDoorClosed(i)) continue; // free + walk-in stalls show their ajar leaf above
    const bx = stallBay(i).x;
    ctx.fillStyle = "#46506b";
    // The leaf is painted AFTER the counter (so it hides the occupant), so its
    // bottom must stop at the counter-top line (y=344) — not the floor (y=352)
    // — or those 8px would be drawn over the counter and read as floating on it.
    rr(ctx, bx + 1, 212, 50, 132, 3); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    rr(ctx, bx + 1, 212, 50, 132, 3); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#cfd6e4";
    ctx.beginPath(); ctx.arc(bx + 9, 284, 2.5, 0, 7); ctx.fill(); // handle
    ctx.fillStyle = "#ff6b6b";                                    // "in use" lamp
    ctx.beginPath(); ctx.arc(bx + 26, 224, 3, 0, 7); ctx.fill();
  }
  // guests passing IN FRONT of a closed door draw above the leaf — the stall's
  // own occupant is excluded, so they stay hidden behind their door
  for (const b of buses) for (const p of b.pax)
    if (isIndoorPax(p) && paxInFrontOfClosedDoor(p)) drawPax(p, 5);
  // stink puffs rise only from the stalls that are actually dirty
  for (let i = 0; i < WC_STALLS; i++) {
    const sc = S.stallClean[i];
    if (sc >= 40) continue;
    const a = (40 - sc) / 40 * 0.7;
    ctx.fillStyle = `rgba(120, 160, 90, ${a * (0.6 + 0.4 * Math.sin(performance.now() / 300))})`;
    ctx.beginPath();
    ctx.arc(stallBay(i).x + 42, 184, 8, 0, 7);
    ctx.fill();
  }
  // the cleaning hose in hand: drapes from its faucet to the pointer; holding
  // the mouse sprays the stall under it (hoseApply throttles the actual work)
  if (hoseInHand) {
    const st = COUNTER_IN.hose;
    const ox = st.x + st.w / 2, oy = st.y + 34; // the faucet spout
    ctx.strokeStyle = "#3f9c57";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo((ox + pointer.x) / 2 - 60, (oy + pointer.y) / 2 + 40, pointer.x - 6, pointer.y - 6);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    // the nozzle, tilted down-right
    ctx.save();
    ctx.translate(pointer.x - 6, pointer.y - 6);
    ctx.rotate(0.6);
    ctx.fillStyle = "#22303f";
    rr(ctx, -8, -5, 22, 10, 3); ctx.fill();
    ctx.fillStyle = "#3f7fd4";
    rr(ctx, 14, -4, 5, 8, 2); ctx.fill();
    ctx.restore();
    if (pointerDown) {
      const si = stallAt(pointer.x, pointer.y);
      if (si >= 0) {
        const closed = stallDoorClosed(si);
        if (closed) {
          // the door is shut — the spray bounces off
          ctx.fillStyle = "rgba(255, 120, 120, 0.9)";
          ctx.font = "bold 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("door closed", pointer.x, pointer.y - 14);
          ctx.textAlign = "left";
        } else {
          // the spray fan + falling droplets
          ctx.fillStyle = "rgba(120, 210, 255, 0.75)";
          for (let k = 0; k < 8; k++) {
            ctx.beginPath();
            ctx.arc(pointer.x + 10 + 8 * k, pointer.y + 10 + 6 * k, 2.2, 0, 7);
            ctx.fill();
          }
        }
      }
    }
  }
  // a sparkle burst where a stall just hit 100
  const gnow = performance.now();
  for (let i = 0; i < WC_STALLS; i++) {
    const age = gnow - hoseGleam[i];
    if (hoseGleam[i] === 0 || age > 1200) continue;
    ctx.fillStyle = `rgba(160, 235, 255, ${1 - age / 1200})`;
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✨", stallBay(i).x + 26, 197);
    ctx.textAlign = "left";
  }
}

// Outdoor nudge for the WC building: red badge + pulsing hint.
// Triggered only by guests WAITING AT THE COUNTER for the player (C.queue):
// people using the stalls need nothing from you, and while the player is
// outside the indoor pax are invisible — so this badge is their only signal.
// Rendered after the night overlay so it stays bright day or night.
function drawWcPrompt() {
  const n = facilities.C.queue.length;
  if (n === 0) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  // Badge pinned to the WC building's facade (inside the building body).
  const cx = 851, cy = 131;
  const label = String(n); // exact count — no "9+" cap
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const H = 18;
  const Pw = Math.max(20, ctx.measureText(label).width + 10);
  // pulsing halo — the nudge itself
  const pad = 3 + 7 * pulse;
  ctx.fillStyle = `rgba(255, 80, 80, ${0.28 * pulse})`;
  rr(ctx, cx - (Pw + 2 * pad) / 2, cy - (H + 2 * pad) / 2, Pw + 2 * pad, H + 2 * pad, (H + 2 * pad) / 2);
  ctx.fill();
  // red badge with the waiting count
  ctx.fillStyle = "#e33";
  rr(ctx, cx - Pw / 2, cy - H / 2, Pw, H, H / 2); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  rr(ctx, cx - Pw / 2, cy - H / 2, Pw, H, H / 2); ctx.stroke();
  // the number
  ctx.fillStyle = "#fff";
  ctx.fillText(label, cx, cy + 0.5);
  // pulsing hint pointing at the building (the click target)
  ctx.fillStyle = `rgba(255, 179, 71, ${pulse})`;
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.fillText("click to enter ↓", 851, 84);
  // restore text state for the rest of the scene
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// Outdoor nudge for the car wash: a pulsing 🚿 above any parked bus whose
// windshield hasn't been washed yet. Washed buses read clean — no nudge.
function drawWashHint() {
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(140, 220, 255, ${0.4 + 0.6 * pulse})`;
  for (const b of buses) {
    if (b.state !== "stop" || b.washDone) continue;
    ctx.fillText("🚿 wash", b.cx, LOT_NOSE - 6);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawRoads() {
  const nf = nightFactor();
  ctx.fillStyle = mix("#3a4150", "#181d27", nf * 0.7);
  ctx.fillRect(0, ROAD.top, W, ROAD.bot - ROAD.top);        // main road
  ctx.fillStyle = mix("#58b368", "#1c3a2a", nf * 0.85);
  ctx.fillRect(0, ROAD.bot, W, H - ROAD.bot);              // grass strip below
  ctx.strokeStyle = `rgba(240, 230, 180, ${0.8 - nf * 0.3})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath(); ctx.moveTo(0, 486); ctx.lineTo(W, 486); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ROAD.top + 3); ctx.lineTo(560, ROAD.top + 3); ctx.stroke();
  ctx.setLineDash([18, 14]);   // dashed = where buses turn onto the lot
  ctx.beginPath(); ctx.moveTo(560, ROAD.top + 3); ctx.lineTo(W, ROAD.top + 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(0, ROAD.bot - 3); ctx.lineTo(W, ROAD.bot - 3); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "11px system-ui";
  ctx.fillText(`${DEST_A} →`, 8, ROAD.top + 16);
  const tw = ctx.measureText(`${DEST_B} →`).width;
  ctx.fillText(`${DEST_B} →`, W - tw - 8, ROAD.top + 16);
}

function drawBus(b) {
  // While horizontal (on the road) the bus reads side-on. As it rotates
  // nose-up into the lot — and back out — it faces away from us, so the
  // sprite crossfades to a rear + top view. |sin(ang)| is 0 when level and
  // 1 when nose-up, and the enter/exit turns animate the angle itself.
  const v = Math.abs(Math.sin(b.ang));
  if (v >= 0.99) { drawBusRearTop(b, 1); return; }
  if (v <= 0.01) { drawBusSide(b, 1); return; }
  drawBusSide(b, 1 - v);
  drawBusRearTop(b, v);
}

// Side view — what the bus looks like while driving on the road.
function drawBusSide(b, alpha) {
  const len = b.len, nf = nightFactor();
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.ang);
  ctx.globalAlpha = alpha;
  // headlight cone from the nose (night only)
  if (nf > 0.4) {
    const hg = ctx.createLinearGradient(len / 2, 0, len / 2 + 90, 0);
    hg.addColorStop(0, `rgba(255,240,180,${0.35 * nf})`);
    hg.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(len / 2 - 4, -7);
    ctx.lineTo(len / 2 + 90, 15);
    ctx.lineTo(len / 2 + 90, 37);
    ctx.lineTo(len / 2 - 4, 15);
    ctx.closePath(); ctx.fill();
  }
  // body (centered; +x = nose)
  ctx.fillStyle = `hsl(${b.hue}, 55%, ${58 - nf * 15}%)`;
  rr(ctx, -len / 2, -33, len, 66, 12); ctx.fill();
  // skirt
  ctx.fillStyle = `hsl(${b.hue}, 40%, 30%)`;
  ctx.fillRect(-len / 2 + 4, 25, len - 8, 10);
  // roof sign
  ctx.fillStyle = "#1d2333";
  rr(ctx, -34, -43, 68, 12, 4); ctx.fill();
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("TOUR  A → B", 0, -34);
  ctx.textAlign = "left";
  // windows + passenger heads
  const winN = Math.max(1, Math.floor((len - 44) / 21));
  for (let i = 0; i < winN; i++) {
    const wx = -len / 2 + 18 + i * 21;
    ctx.fillStyle = mix("#cfe8ff", "#26364e", nf * 0.8);
    rr(ctx, wx, -8, 14, 16, 4); ctx.fill();
    // show a few heads
    const n = b.pax.length;
    if (i < n && n > 0) {
      const idx = Math.min(n - 1, Math.floor(i * n / winN));
      const p = b.pax[idx];
      if (p && p.state === "bus") {
        const sc = Math.min(1, (PAX_TYPES[p.type] || PAX_TYPES.m).scale); // kids' heads are smaller + lower
        const hy = 12 + (1 - sc) * 5;
        ctx.fillStyle = p.skin || "#e8b88e";
        ctx.beginPath(); ctx.arc(wx + 7, hy, 4 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = p.hair || "#362718";
        ctx.beginPath(); ctx.arc(wx + 7, hy, 4 * sc, Math.PI, Math.PI * 2); ctx.fill(); // hair cap
      }
    }
  }
  // windshield (front = +x) — darkens with grime, gleams once washed
  const dirt = b.washDone ? 0 : (b.wash ? b.wash.g.reduce((a, v) => a + v, 0) / b.wash.g.length : 0.7);
  ctx.fillStyle = mix(mix("#cfe8ff", "#26364e", nf * 0.8), "#70542c", dirt * 0.8);
  rr(ctx, len / 2 - 24, -8, 16, 16, 4); ctx.fill();
  // door (side of the nose)
  ctx.fillStyle = `hsl(${b.hue}, 30%, 22%)`;
  ctx.fillRect(len / 2 - 46, -11, 14, 44);
  ctx.fillStyle = `hsl(${b.hue}, 30%, 35%)`;
  ctx.fillRect(len / 2 - 43, -7, 8, 36);
  // wheels
  ctx.fillStyle = "#141821";
  for (const wx of [-len / 2 + 34, len / 2 - 44]) {
    ctx.beginPath(); ctx.arc(wx, 35, 12, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a4150";
    ctx.beginPath(); ctx.arc(wx, 35, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#141821";
  }
  // route text (only when roughly horizontal)
  if (Math.abs(b.ang) < 0.6) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 11px system-ui";
    ctx.fillText(`${b.from} → ${b.to}`, -len / 2 + 16, 13);
  }
  ctx.restore();
}

// Rear + top view — a parked bus, nose pointing away from us. We see the
// roof (lighter panel, AC units, windshield at the far end) and the back of
// the bus (rear window, route display, tail lights) at the near end.
function drawBusRearTop(b, alpha) {
  const len = b.len, nf = nightFactor();
  const cx = b.cx, top = b.cy - len / 2, bot = b.cy + len / 2;
  const r = Math.min(12, len / 4);
  const slant = 6; // slight perspective taper: the far (top) end reads narrower
  const tl = cx - 27, tr = cx + 27;   // front end, 54 wide
  const bl = cx - 33, br = cx + 33;   // rear end, 66 wide
  ctx.save();
  ctx.globalAlpha = alpha;
  // wheels peeking past the body on both axles
  ctx.fillStyle = "#141821";
  for (const wy of [top + 24, bot - 26]) {
    const f = (wy - top) / len;
    const xl = tl + (bl - tl) * f;
    const xr = tr + (br - tr) * f;
    ctx.fillRect(xl - 7, wy - 10, 9, 20);
    ctx.fillRect(xr - 2, wy - 10, 9, 20);
  }
  // body — a tapered, rounded slab (66 wide at the rear, 54 at the front)
  ctx.fillStyle = `hsl(${b.hue}, 52%, ${52 - nf * 15}%)`;
  ctx.beginPath();
  ctx.moveTo(tl + r, top);
  ctx.lineTo(tr - r, top);
  ctx.quadraticCurveTo(tr, top, tr + slant * r / len, top + r);
  ctx.lineTo(br + slant * (bot - r - top) / len, bot - r);
  ctx.quadraticCurveTo(br, bot, br - r, bot);
  ctx.lineTo(bl + r, bot);
  ctx.quadraticCurveTo(bl, bot, bl, bot - r);
  ctx.lineTo(tl - slant * (bot - r - top) / len, top + r);
  ctx.quadraticCurveTo(tl, top, tl + r, top);
  ctx.closePath(); ctx.fill();
  // windshield at the far (front) end — darkens with grime, gleams once washed
  const dirt = b.washDone ? 0 : (b.wash ? b.wash.g.reduce((a, v) => a + v, 0) / b.wash.g.length : 0.7);
  ctx.fillStyle = mix(mix("#cfe8ff", "#26364e", nf * 0.8), "#70542c", dirt * 0.8);
  rr(ctx, cx - 24, top + 8, 48, 15, 5); ctx.fill();
  // the roof — a lighter panel, this is the "top of the bus"
  ctx.fillStyle = `hsl(${b.hue}, 44%, ${64 - nf * 16}%)`;
  rr(ctx, cx - 24, top + 27, 48, len - 72, 8); ctx.fill();
  // AC units along the roof
  ctx.fillStyle = `hsl(${b.hue}, 30%, ${34 - nf * 10}%)`;
  for (let ay = top + 40; ay < bot - 64; ay += 46) {
    rr(ctx, cx - 16, ay, 32, 16, 3); ctx.fill();
  }
  // boarding door, right side near the front (matches the side-view door)
  ctx.fillStyle = `hsl(${b.hue}, 30%, ${30 - nf * 10}%)`;
  ctx.fillRect(cx + 26, top + 32, 6, 40);
  // rear window, just below the roof
  ctx.fillStyle = mix("#cfe8ff", "#26364e", nf * 0.8);
  rr(ctx, cx - 20, bot - 42, 40, 8, 3); ctx.fill();
  // rear route display
  ctx.fillStyle = "#1d2333";
  rr(ctx, cx - 22, bot - 32, 44, 11, 3); ctx.fill();
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 8px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${b.from[0]} → ${b.to[0]}`, cx, bot - 23.5);
  ctx.textAlign = "left";
  // rear bumper + tail lights
  ctx.fillStyle = `hsl(${b.hue}, 40%, ${30 - nf * 12}%)`;
  ctx.fillRect(bl + 3, bot - 13, 60, 9);
  if (nf > 0.4) {
    ctx.fillStyle = `rgba(255, 80, 60, ${0.45 * nf})`; // soft glow
    rr(ctx, cx - 30, bot - 15, 20, 13, 5); ctx.fill();
    rr(ctx, cx + 10, bot - 15, 20, 13, 5); ctx.fill();
  }
  ctx.fillStyle = nf > 0.4 ? "#ff6355" : "#c9352f";
  ctx.fillRect(cx - 26, bot - 11, 10, 5);
  ctx.fillRect(cx + 16, bot - 11, 10, 5);
  ctx.restore();
}

function drawCar(c) {
  ctx.fillStyle = `hsl(${c.hue}, 45%, 50%)`;
  rr(ctx, c.x, c.y - 22, 52, 16, 6); ctx.fill();
  ctx.fillStyle = `hsl(${c.hue}, 45%, 62%)`;
  rr(ctx, c.x + 10, c.y - 30, 30, 10, 5); ctx.fill();
  ctx.fillStyle = "#141821";
  ctx.beginPath(); ctx.arc(c.x + 12, c.y - 4, 5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 40, c.y - 4, 5, 0, 7); ctx.fill();
}

function drawPax(p, k = 1) {
  const x = p.x, y = p.y;
  const s = k * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale); // body size — kids are small
  const cloth = `hsl(${p.hue}, 55%, 55%)`;
  const skin = p.skin || "#e8b88e", hair = p.hair || "#362718";
  if (p.type === "w") {
    ctx.fillStyle = skin; // legs peek out below the skirt
    ctx.fillRect(x - 3 * s, y - 2.5 * s, 2.2 * s, 2.8 * s);
    ctx.fillRect(x + 0.8 * s, y - 2.5 * s, 2.2 * s, 2.8 * s);
    ctx.fillStyle = cloth;
    ctx.beginPath(); // skirt — flares from the waist
    ctx.moveTo(x - 3.2 * s, y - 6 * s);
    ctx.lineTo(x + 3.2 * s, y - 6 * s);
    ctx.lineTo(x + 5 * s, y - 1.5 * s);
    ctx.lineTo(x - 5 * s, y - 1.5 * s);
    ctx.closePath(); ctx.fill();
    rr(ctx, x - 3.4 * s, y - 11.5 * s, 6.8 * s, 5.6 * s, 3 * s); ctx.fill(); // top
  } else {
    ctx.fillStyle = "#2c3444"; // trousers
    ctx.fillRect(x - 3.1 * s, y - 4 * s, 2.5 * s, 4.2 * s);
    ctx.fillRect(x + 0.6 * s, y - 4 * s, 2.5 * s, 4.2 * s);
    ctx.fillStyle = cloth;
    rr(ctx, x - 3.8 * s, y - 11.5 * s, 7.6 * s, 8 * s, 3 * s); ctx.fill(); // torso
    if (p.type === "k") {
      ctx.fillStyle = `hsl(${p.hue}, 45%, 38%)`; // little backpack
      rr(ctx, x - 2.4 * s, y - 10.8 * s, 4.8 * s, 4.2 * s, 1.8 * s); ctx.fill();
    }
  }
  // head + hair cap
  const hy = y - 14.5 * s, hr = (p.type === "w" ? 3.3 : 3.4) * s;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x, hy, hr, 0, 7); ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.arc(x, hy, hr + 0.5 * s, Math.PI, Math.PI * 2); ctx.fill();
  if (p.type === "w") { // long hair down the sides
    rr(ctx, x - hr - 1 * s, hy - 1 * s, 1.6 * s, 6 * s, 1 * s); ctx.fill();
    rr(ctx, x + hr - 0.6 * s, hy - 1 * s, 1.6 * s, 6 * s, 1 * s); ctx.fill();
  }
  // little indicators
  if (p.state === "serveR") {
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath(); ctx.arc(x + 6 * s, y - 8 * s, 2.5 * s, 0, 7); ctx.fill();
  }
  if (p.state === "payC" || p.state === "doneC") {
    ctx.fillStyle = BILL_COLORS[p.bill] || "#f5f0e0"; // handing the bill (colored like the real note)
    ctx.fillRect(x + 3 * s, y - 9 * s, 6 * s, 5 * s);
  }
  if (p.state === "dripC") {
    ctx.fillStyle = "rgba(235, 195, 140, 0.9)";
    ctx.fillRect(x + 2.6 * s, y - 15 * s, 2 * s, 5 * s); // raised hand
    const f = clamp(1 - p.dripT / 0.8, 0, 1);
    ctx.fillStyle = "rgba(200, 130, 40, 0.9)";
    ctx.fillRect(x + 2.9 * s, y - 11 * s + f * 13 * s, 1.6 * s, 2.6 * s); // falling drop
    ctx.fillStyle = "rgba(255, 230, 180, 0.7)";
    ctx.fillRect(x + 0.5 * s, y - 9 * s, 1.5 * s, 1.5 * s);
    ctx.fillRect(x + 5.5 * s, y - 12 * s, 1.5 * s, 1.5 * s); // sparkles
  }
}

/* ------------------------------ UI (DOM) ---------------------------- */
const $ = id => document.getElementById(id);

function toast(msg, cls) {
  const box = $("toasts");
  const el = document.createElement("div");
  el.className = "toast " + (cls || "");
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { el.classList.add("fading"); setTimeout(() => el.remove(), 500); }, 3200);
  return el;
}

/* --------------------------- HUD & modals --------------------------- */
function updateHUD() {
  $("statServed").textContent = "👥 " + S.stats.served;
  $("btnClean").disabled = S.cleanliness > 99;
  const hh = Math.floor(S.time), mm = Math.floor((S.time % 1) * 60);
  $("statClock").textContent = `Day ${S.day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  $("repFill").style.width = S.rep + "%";
  $("repNum").textContent = Math.round(S.rep);
  $("statCologne").textContent = "🧴 " + Math.round(S.bottle) + " ml";
  $("btnWc").textContent = S.view === "wc" ? "🚪" : S.view === "wash" ? "🚪" : "🚻";
  $("btnWc").title = S.view === "wash" ? "Back outside" : S.view === "wc" ? "Go back outside" : "Step inside the WC counter";
  $("btnPause").textContent = paused ? "▶" : "⏸";
  $("btnSpeed").textContent = speed + "×";
}

function showDaySummary() {
  paused = true;
  const st = S.stats;
  const repDelta = S.rep - st.repStart;
  const avgSat = st.satN ? Math.round(st.satSum / st.satN) : 0;
  $("modalTitle").textContent = `Day ${S.day - 1} complete`;
  $("modalBody").innerHTML = `
    <table>
      <tr><td>Buses served</td><td>${st.buses}</td></tr>
      <tr><td>Guests served</td><td>${st.served}</td></tr>
      <tr><td>Cologne served</td><td>${st.cologne}</td></tr>
      <tr><td>Windshields washed</td><td>${st.washes}</td></tr>
      <tr><td>Avg satisfaction</td><td>${st.satN ? avgSat + " / 100" : "—"}</td></tr>
      <tr><td>Reputation</td><td class="${repDelta >= 0 ? "pos" : "neg"}">${Math.round(st.repStart)} → ${Math.round(S.rep)} (${repDelta >= 0 ? "+" : ""}${repDelta.toFixed(1)})</td></tr>
    </table>
    <div class="big">${repDelta >= 3 ? "Word is spreading — expect bigger buses tomorrow."
      : repDelta <= -3 ? "Tough day. Keep those toilets clean."
      : "A steady day on Layover Lane."}</div>`;
  $("modalBtn").textContent = `Start day ${S.day} →`;
  $("modalBtn").onclick = () => {
    S.stats = freshDayStats();
    hideModal();
  };
  showModal();
}

let modalOpen = false;
function showModal() { $("modal").classList.remove("hidden"); modalOpen = true; }
function hideModal() { $("modal").classList.add("hidden"); $("modalBox").classList.remove("tall"); modalOpen = false; paused = false; save(); }

function showIntro(first) {
  $("modalTitle").textContent = first ? "👋 Welcome to Layover Lane" : "How to play";
  $("modalBox").classList.add("tall"); // both intro screens are scrollable
  $("modalBody").innerHTML = `
    <div class="big">You run the layover every tour bus between <strong>${DEST_A}</strong> and <strong>${DEST_B}</strong> relies on.</div>
    <p>🚌 Buses pull into your parking lot for rest breaks. Passengers get hungry, thirsty, and desperate for the <strong>toilet</strong>.</p>
    <p>🍔 Diner food and drinks are <strong>free</strong> — guests eat, drink, and wander around while the bus waits.</p>
    <p>⏱ Buses lay over for about <strong>30 minutes</strong> — a full hour in the terminal is the hard outside limit. When it's time to roll, guests still in the <strong>WC payment line</strong> get <strong>5–10 minutes</strong> to finish paying; if the line is still there, they <strong>abandon it without paying</strong> and board, and the bus leaves.</p>
    <p>🕐 Time is <strong>compressed</strong> — one game hour takes 6 real minutes at 1×, so a game day takes about 2.4 real hours. Buses, meals and queues all keep their in-world pacing.</p>
    <p>🚻 Toilets cost <strong>₺20</strong>, paid at the counter <em>after</em> the visit — and <strong>you</strong> are the counter. <strong>Click the WC building to step inside</strong>: each stall's <strong>door closes while someone's in it</strong> (a visit lasts 1–10 in-game minutes), and <strong>each stall has its own cleanliness</strong> — a dirty one gets the visit rated down.</p>
    <p>💳 Inside, each guest who finishes joins the line at the counter and hands you a bill. <strong>Click the trays in the open cash drawer</strong> (₺10 / ₺20 / ₺50) to give the right change. Exact bill? They're straight out through the EXIT door. Short or missing change makes guests unhappy.</p>
    <p>💨 A 500 ml bottle of <strong>Turkish cologne</strong> sits on the counter. <strong>Click it</strong> to drop some onto the hands of the front guest — while they pay. They start for the EXIT door the moment the change is back in their hands (an exact bill means they're on their way at once), so splash early. The bottle refills at midnight.</p>
    <p>🚪 Click the <strong>EXIT door</strong> — or press <strong>E</strong> — to step back outside. The 🚻 / 🚪 button in the top bar does the same.</p>
    <p>🧻 <strong>Each stall gets dirtier with every use</strong> (watch the bar atop each stall). The old instant deep clean is gone: <strong>grab the hose</strong> next to the stalls (or the 🚿 button in the top bar) and <strong>hold the mouse, dragging it over a stall</strong> to spray it clean — but a stall with a <strong>closed door</strong> (someone inside) can't be sprayed.</p>
    <p>🚿 Buses roll in dusty. <strong>Click a parked bus</strong> to step up to its front: <strong>pick up the long-handled brush and drag it across the windshield</strong> to soap it up, then <strong>grab the fresh-water hose and rinse the soap off</strong>. Click a tool again to <strong>put it down</strong>. A sparkling windshield wins the driver's gratitude.</p>
    <p>💢 Ignored guests <strong>storm out</strong> without paying, and ★ satisfied guests raise your <strong>reputation</strong> → buses stop much more often &amp; arrive bigger. A busy high-rep terminal runs several buses at once — and a freed stall is refilled within 30 minutes, never left standing empty.</p>
    <p><b style="color:var(--good)">No profit, no upgrades</b> — the money is just part of the ritual. Space pauses · keys 1–4 pick the speed tier (1×, 10×, 100×, 200×).</p>`;
  $("modalBody").scrollTop = 0;
  $("modalBtn").textContent = first ? "Open for business!" : "Back to work";
  $("modalBtn").onclick = () => hideModal();
  showModal();
}

/* ------------------------------ Main loop --------------------------- */
let last = performance.now();
function frame(now) {
  const elapsed = (now - last) / 1000;
  last = now;
  // Physics/animation uses a per-frame-capped dt (a stall must never teleport
  // the scene), but the game clock tracks the wall clock: rAF doesn't run while
  // the tab is hidden, so a long gap catches time up to actual elapsed time
  // (capped at one day). At 1x, 1 game hour = 6 real minutes; the speed tier
  // (1x/10x/100x/200x) scales both dt and timeDt, so the whole scene fast-forwards.
  const raw = Math.min(0.1, elapsed);
  const timeDt = Math.min(86400, elapsed) * speed;
  if (viewFade > 0) viewFade = Math.max(0, viewFade - raw * 3); // transition flash fades even while paused
  if (!paused && !modalOpen) {
    const dt = raw * speed;
    update(dt, timeDt);
  }
  drawScene();
  updateHUD();
  requestAnimationFrame(frame);
}

/* ------------------------------- Init ------------------------------- */
function init() {
  const hadSave = load();
  rebuildFacilities();

  $("btnClean").onclick = () => grabHose();
  $("btnWc").onclick = () => setView(S.view === "out" ? "wc" : "out"); // from the wash view the button also steps back out
  $("btnPause").onclick = () => { paused = !paused; };
  $("btnSpeed").onclick = () => {
    const i = SPEEDS.indexOf(speed);
    speed = i >= 0 ? SPEEDS[(i + 1) % SPEEDS.length] : 1;
  };
  $("btnHelp").onclick = () => { paused = true; showIntro(false); };
  $("btnReset").onclick = () => {
    if (confirm("Reset the whole game? Your save will be deleted.")) {
      // Stop saving FIRST: location.reload() fires beforeunload, which calls
      // save() and would write the current state back after the delete.
      resetting = true;
      // Delete every key load() might read, including the v3 migration
      // fallback — otherwise a stale v3 save silently survives the reset.
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem("layover-lane-v5");
      localStorage.removeItem("layover-lane-v3");
      location.reload();
    }
  };
  // ---- canvas clicks: routed per view ----
  canvas.addEventListener("click", (e) => {
    if (paused || modalOpen) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    const hit = (r, pad = 2) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
    if (S.view === "out") {
      // outdoor scene: walk into the WC building, or step up to a parked bus
      if (hit(WC_BUILDING)) { setView("wc"); return; }
      const b = buses.find(z => z.state === "stop" && !z.washDone
        && x >= z.cx - 36 - 2 && x <= z.cx + 36 + 2 && y >= LOT_NOSE - 2 && y <= z.cy + z.len / 2 + 2);
      if (b) openWash(b);
      return;
    }
    if (S.view === "wash") {
      // at the bus front: the only click targets are the two tool stations
      // and the exit — the windshield is worked by holding and dragging
      // (mousedown/mousemove → washApply), so a plain click there does nothing.
      if (hit(WASH.exit)) { setView("out"); return; }
      const b = bus();
      if (!b) return;
      // click picks a tool up; clicking the one already in hand puts it down
      const w = ensureWash(b);
      if (hit(WASH.brush)) { w.tool = w.tool === "brush" ? "none" : "brush"; return; }
      if (hit(WASH.hose)) { w.tool = w.tool === "hose" ? "none" : "hose"; return; }
      return;
    }
    // inside the counter room: the hose station, till chips, cologne bottle, EXIT door
    if (hit(COUNTER_IN.hose)) { hoseInHand = !hoseInHand; return; } // click picks up / puts down the hose
    const chip = COUNTER_IN.chips.find(c => hit(chipHit(c)));
    if (chip) { giveChange(chip.d); save(); return; }
    if (hit(COUNTER_IN.bottle)) { offerCologne(); save(); return; }
    if (hit(COUNTER_IN.exit)) { setView("out"); }
  });
  canvas.addEventListener("mousedown", (e) => {
    if (paused || modalOpen) return;
    if (S.view === "wash" && e.button === 0) {
      pointerDown = true;
      const rect = canvas.getBoundingClientRect();
      washApply((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height));
    }
    // holding the mouse with the cleaning hose sprays the stall under the pointer
    if (S.view === "wc" && e.button === 0 && hoseInHand) {
      pointerDown = true;
      const rect = canvas.getBoundingClientRect();
      hoseApply((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height));
    }
  });
  const releasePointer = () => { pointerDown = false; };
  window.addEventListener("mouseup", releasePointer);
  window.addEventListener("blur", releasePointer);
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    const hit = (r, pad = 2) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
    pointer.x = x; pointer.y = y;
    // a held scrub/spray — the per-cell cooldown inside washApply throttles it
    if (S.view === "wash" && pointerDown) washApply(x, y);
    if (S.view === "wc" && pointerDown && hoseInHand) hoseApply(x, y);
    let hot;
    if (S.view === "out") {
      hot = hit(WC_BUILDING) || buses.some(z => z.state === "stop" && !z.washDone
        && x >= z.cx - 36 - 2 && x <= z.cx + 36 + 2 && y >= LOT_NOSE - 2 && y <= z.cy + z.len / 2 + 2);
    } else if (S.view === "wash") {
      hot = hit(WASH.brush) || hit(WASH.hose) || hit(WASH.exit);
      canvas.style.cursor = hot ? "pointer" : (hit(WASH.wind) ? "crosshair" : "default");
      return;
    } else {
      hot = COUNTER_IN.chips.some(c => hit(chipHit(c))) || hit(COUNTER_IN.bottle) || hit(COUNTER_IN.exit) || hit(COUNTER_IN.hose);
    }
    canvas.style.cursor = hot ? "pointer" : (S.view === "wc" && hoseInHand && stallAt(x, y) >= 0 ? "crosshair" : "default");
  });
  // test/automation hook (used by the node harness; safe to ignore)
  window.__Layover = {
    front: () => facilities.C.queue[0] || null,
    bottle: () => S.bottle,
    giveChange, offerCologne,
    setView, view: () => S.view,
    openWash, washApply,
    wash: () => { const b = bus(); return b ? b.wash : null; },
    hose: () => ({ inHand: hoseInHand, apply: hoseApply, stallClean: S.stallClean, bay: stallBay, at: stallAt }),
  };
  window.addEventListener("keydown", e => {
    if (e.code === "Space") { e.preventDefault(); paused = !paused; }
    // keys 1-4 pick the speed tier (1x / 10x / 100x / 200x)
    const tier = "1234".indexOf(e.key);
    if (tier >= 0) speed = SPEEDS[tier];
    if ((e.key === "e" || e.key === "E" || e.key === "Escape") && !modalOpen) {
      // any interior view (counter room, car wash) steps back outside; from
      // outside the key keeps its original counter-room shortcut
      setView(S.view === "out" ? "wc" : "out");
    }
  });
  window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

  if (!hadSave) { paused = true; showIntro(true); }

  requestAnimationFrame(frame);
}

init();
