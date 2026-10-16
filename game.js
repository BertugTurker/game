"use strict";

/* =====================================================================
   LAYOVER LANE — Bus Rest-Stop Simulator
   Tour buses run İstanbul (A) → Trabzon (B) and pull into your layover.
   You run the diner and the toilets — and you are the WC counter.
   Click the WC building to step behind the counter: each stall's door
   closes while it's in use, and every stall carries its own dirt — take
   the ₺20 bill, splash Turkish cologne, make change, and keep the stalls
   clean with the hose by the stalls (hold & drag it over a free stall).
   Guests paying an exact ₺20 (no change due) need nothing from you: they
   queue in their own second line, pay on their own, and walk back out.
   Cleanliness is the whole business: the cleaner the stall a guest used,
   the happier they are, and that rating feeds reputation. Guests always
   take the CLEANEST free stall, and none will step into a stall below the
   filth bar — if every free stall is filthy, the line just stands (and
   loses patience) until a clean stall frees up or the hose brings one
   back; if the whole row is filthy beyond the point of no return, no
   guest will use it at all.
   The moment a guest is settled they head back out through the EXIT door.
   Click the EXIT door (or press E) to come back outside.
   Click a parked bus to step up to its front and wash the windshield:
   long-handled brush first (soap), then the fresh-water hose (rinse).
   No profit, no upgrades — money is just part of the ritual.
   ===================================================================== */

/* ----------------------------- Config ------------------------------ */
const W = 960, H = 540;
// Widescreen: the logical canvas may extend beyond the 960×540 gameplay core.
// Background layers (sky, ground, road, walls) fill the extra space; all
// interactive content stays in the core, centered via offX/offY.
let Wdyn = W, Hdyn = H;
let offX = 0, offY = 0;
let scaleK = 1;
let lastWdyn = 0, lastHdyn = 0;
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
const WC_EVADE    = 0.03;                  // share of finished toilet visits that skip the fee and run for the EXIT (~3 in 100 — everyone else queues)
const EVADE_WALK  = 132;                   // a runaway's dash, in px per REAL second — catchable at any speed tier
const SCRUB_TIME  = 3;                     // real seconds a caught runaway spends scrubbing every toilet
const WC_NEEDED   = 72;                    // bladder level at which a guest heads for the WC
const WC_TOO_DIRTY  = 25;                   // a stall below this is too filthy to use: guests take the cleanest free stall, and if every FREE stall sits below it the T line stands and waits
const BLADDER_RISE = 85;                   // bladder fill per game hour — the most time-pressed need
const BOTTLE_MAX  = 500;                   // ml of cologne in the counter bottle
const TEA_HOURS   = 0.5;                   // game hours to sip a glass of tea down to empty (~30 game minutes)
const TEA_DELIVERY = [1 / 60, 2 / 60];     // game hours for a tea ordered on the intercom to arrive (1–2 game minutes)
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
    { d: 10, x: 388, y: 384, w: 58, h: 64, color: BILL_COLORS[10], label: "₺10" },
    { d: 20, x: 451, y: 384, w: 58, h: 64, color: BILL_COLORS[20], label: "₺20" },
    { d: 50, x: 514, y: 384, w: 58, h: 64, color: BILL_COLORS[50], label: "₺50" },
  ],
  bottle: { x: 318, y: 310, w: 26, h: 52 },   // Turkish cologne on the counter
  desk:   { x: 0, y: 352, w: 960, h: 188 },   // the full-width wooden counter
  exit:   { x: 446, y: 0, w: 68, h: 72 },     // EXIT door, top center of the far wall (click to go outside)
  intercom: { x: 884, y: 394, w: 44, h: 62 }, // tea intercom at the right end of the counter (click to order a fresh tea)
  hose:   { x: 4, y: 150, w: 60, h: 96 },    // wall faucet + coiled cleaning hose, next to the stall row on the left (click to grab)
};
// The whole VISIBLE body of a bill tray is the click target: the dark tray
// pocket (x-4, y-4, w+8, h+8) plus the bill note, which overhangs the pocket
// by 20px (drawn at c.h + 20). h+22 here makes the hit rect's bottom exactly
// meet the note's bottom (minus the hit pad's 2px, which covers the last sliver)
// without bleeding into the coin compartment below.
const chipHit = c => ({ x: c.x - 4, y: c.y - 4, w: c.w + 8, h: c.h + 22 });
const PAY_SPOT = { x: 560, y: 357 };           // where the front guest stands
const PAY_SPOT2 = { x: 462, y: 357 };          // the exact-₺20 line's own spot, left of the main one
const DOOR_IN  = { x: 480, y: 64 };            // just inside the EXIT door (top center) — guests enter & leave here
const WC_BUILDING = { x: 808, y: 92, w: 86, h: 80 }; // outdoor hit rect: click to enter
// Car wash view geometry — a close-up of the parked bus's front. The
// windshield is a cols×rows cell grid; each cell tracks its own dirt and soap.
const WASH = {
  body:  { x: 330, y: 110, w: 300, h: 350 },                    // the bus front slab (tall — a big glass front)
  wind:  { x: 354, y: 138, w: 252, h: 186, cols: 30, rows: 20 }, // glass + frame ≈ 2/3 of the face, painted nose ≈ 1/3; 600 cells of 8.4×9.3
  brush: { x: 96,  y: 280, w: 150, h: 130 },                    // soap bucket + brush on the floor (left)
  hose:  { x: 714, y: 280, w: 150, h: 130 },                    // floor tap + coiled hose (right)
  exit:  { x: 123, y: 18,  w: 96,  h: 44 },                     // back to the lot (top-left, centred over the brush station)
};

const DEST_A = "İstanbul", DEST_B = "Trabzon";
const SAVE_KEY = "layover-lane-v6";

/* ---------------------------- Small utils --------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const lerp  = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t * t * (3 - 2 * t);
const frac = v => v - Math.floor(v);
// Touch devices (phones, tablets): hit-target padding, tap/drag thresholds and
// the help copy all adapt. Mouse/keyboard desktops keep the original feel.
const coarseQ = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

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
let facilities = { R: { spots: [], queue: [] }, T: { spots: [], queue: [] }, C: { queue: [], queue2: [] } };
let paused = false;
// Speed tiers: the whole simulation (game clock, guest needs, walks, animations)
// runs this many times faster. At 1x, 1 game hour = 6 real minutes (a game day
// is 2.4 real hours); at 10x a game day is ~14 min; at 200x it's ~43 seconds.
const SPEEDS = [1, 10, 100, 200];
let speed = 1;
let viewFade = 0;              // dark overlay for the view transition
let pointer = { x: W / 2, y: 200 }; // last pointer position in canvas coords — mouse hover, or a touch's press (the wash tools + the WC hose follow it)
let pointerDown = false;
// The WC cleaning hose: in-hand flag plus per-stall spray pacing. Session aid,
// never saved — picking it up again costs the player, not their save file.
let hoseInHand = false;
let hoseCd = new Array(WC_STALLS).fill(0);      // last spray timestamp per stall (performance.now)
let hoseGleam = new Array(WC_STALLS).fill(0);   // per stall: when it last hit 100 (sparkle burst)
let lastHoseToast = 0;
let lastDirtyToast = 0;      // throttle for the "too filthy to use" toasts
let lastEvadeToast = 0;      // throttle for the "trying to escape" toasts
// The caught runaway's cleaning sequence: { pax, t, from, foam } — t counts
// REAL seconds (paused with the game, untouched by the speed tier), from is
// where they were caught, foam[i] is when they reached stall i (the suds
// it keeps). One at a time; never saved — a guest saved mid-scrub (state
// "scrubC") restarts the sequence on load.
let scrub = null;
let scrubDoneAt = 0;         // performance.now when the last sequence finished (the "all clean" flash)
let downClient = null;       // where the press started (CSS px) — the tap-vs-drag threshold
let activePointer = null;    // the pointerId driving a press (pointer capture) — one at a time

function freshState() {
  return {
    day: 1,
    time: 8,                 // hours, 0..24
    rep: 50,                 // 0..100
    cleanliness: 100,        // DERIVED average of stallClean (outdoor HUD, legacy fallbacks)
    stallClean: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], // per-stall cleanliness 0..100 — each toilet dirties on its own
    bottle: BOTTLE_MAX,      // ml of cologne left in the counter bottle
    tea: 1,                  // tea left in your glass, 0..1 (1 = full)
    teaOrder: null,          // game hours until the tea ordered on the intercom arrives (null = none ordered)
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
    evaded: 0, caught: 0,    // toilet fees: never paid (ran, left the queue, or cut short by the bus) / runaways caught (they scrubbed every toilet)
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
      // saves from the bastinado era: a `fled` guest still walking to the EXIT
      // is a runaway; anyone else is just an unpaid guest
      if (p.runaway == null) p.runaway = !!p.fled && p.state === "leaveC";
      delete p.fled; delete p.punishRed;
    }
    delete S.stats.busts;
    if (S.view !== "out" && S.view !== "wc" && S.view !== "wash") S.view = "out";
    // a guest saved mid-scrub restarts the cleaning sequence (inside the WC,
    // so it plays where it can be seen); a second one can't exist — demote it
    const scrubbers = buses.flatMap(b => b.pax).filter(p => p.state === "scrubC");
    scrubbers.forEach((p, i) => { if (i) { p.state = "leaveC"; p.runaway = false; } });
    if (scrubbers.length) { startScrub(scrubbers[0]); S.view = "wc"; }
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
  b.from = DEST_A; b.to = DEST_B;
  if (b.animFrom) { // saved mid-turn under the old tweened turn: restart the move on the new paths
    if (b.state === "enter") { if (!BAY_SLOTS[b.slot]) b.slot = 0; b.mv = { s: 0 }; Object.assign(b, enterPose(enterGeom(b, b.slot), 0)); }
    if (b.state === "exit") { b.mv = { s: 0, sx: b.animFrom.cx, sy: b.animFrom.cy }; Object.assign(b, exitPose(exitGeom(b), 0)); }
    b.v = 0;
    delete b.animFrom; delete b.animTo; delete b.animT;
  }
  if (b.state === "stop") {
    const s = BAY_SLOTS[b.slot] || BAY_SLOTS[0];
    b.cx = s.cx; b.cy = LOT_NOSE + b.len / 2; b.ang = -Math.PI / 2;
  }
}
function rebuildFacilities() {
  facilities = { R: { spots: [], queue: [] }, T: { spots: [], queue: [] }, C: { queue: [], queue2: [] } };
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
    const inC2 = p.state === "queueC2" || p.state === "payC2";
    const F = p.state === "waitR" ? facilities.R : p.state === "waitT" ? facilities.T
      : (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC" || inC2) ? facilities.C
      : null;
    if (F === facilities.C) (inC2 ? F.queue2 : F.queue).push(p);
    else if (F) F.queue.push(p);
  }
  facilities.R.spots = rSpots;
  facilities.T.spots = tSpots;
  const cq = facilities.C.queue;
  const pi = cq.findIndex(p => p.state === "payC" || p.state === "doneC" || p.state === "dripC");
  if (pi > 0) cq.unshift(cq.splice(pi, 1)[0]);
  const cq2 = facilities.C.queue2;
  const pi2 = cq2.findIndex(p => p.state === "payC2");
  if (pi2 > 0) cq2.unshift(cq2.splice(pi2, 1)[0]); // same: the paying guest is the front
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
    cx: -offX - def.len / 2 - rand(20, 160), // off the canvas edge, not the core edge
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
  toast(`🚌 ${DEST_A} çıkışlı tur otobüsü geliyor — ${n} yolcu`, "");
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
    sat: null, refuseR: false, refuseT: false, wcUsed: false, // this visit was a toilet visit (rep weighs it 2×)
    bill: null, owed: 0, changeGiven: 0, changeNotes: [],  // the ₺20 payment ritual (changeNotes = each bill handed back)
    unpaid: false,   // used the WC and never paid the ₺20 (any reason)
    runaway: false,  // skipped the counter and is running for the EXIT — catchable
                     // only while still inside the WC (state "leaveC")
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
// Bus driving: px/s and px/s². Turns follow true circular arcs; the heading
// is always the path tangent, so the body never slides sideways.
const BUS_V = 185, BUS_TURN_V = 62, BUS_ACC = 55, BUS_BRAKE = 85, BUS_REV_V = 38;
const LANE_CY = LANE_Y - 45;

// Pull-in: a left quarter-circle off the lane, then a short straight into the stall.
function enterGeom(b, slot) {
  const tx = BAY_SLOTS[slot].cx, ty = LOT_NOSE + b.len / 2, D = 28;
  const R = LANE_CY - ty - D;
  return { x0: tx - R, R, D, tx, ty, L: R * Math.PI / 2 + D };
}
function enterPose(g, s) {
  const arc = g.R * Math.PI / 2;
  if (s <= arc) {
    const th = s / g.R;
    return { cx: g.x0 + g.R * Math.sin(th), cy: LANE_CY - g.R + g.R * Math.cos(th), ang: -th };
  }
  return { cx: g.tx, cy: g.ty + g.D - (s - arc), ang: -Math.PI / 2 };
}
// Back-out: reverse straight a little, then reverse through a quarter-circle
// (tail swinging west) so the bus ends on the lane facing east.
function exitGeom(b) {
  const d = 24, R = LANE_CY - b.mv.sy - d;
  return { sx: b.mv.sx, sy: b.mv.sy, d, R, L: d + R * Math.PI / 2 };
}
function exitPose(g, s) {
  if (s <= g.d) return { cx: g.sx, cy: g.sy + s, ang: -Math.PI / 2 };
  const ph = (s - g.d) / g.R;
  return { cx: g.sx - g.R + g.R * Math.cos(ph), cy: g.sy + g.d + g.R * Math.sin(ph), ang: -Math.PI / 2 + ph };
}
// Advance b.mv.s along a path of length L, braking to a stop exactly at the end.
function moveAlong(b, dt, L, vmax, acc, brake) {
  const rem = Math.max(0, L - b.mv.s);
  const target = Math.min(vmax, Math.sqrt(2 * brake * rem));
  b.brake = b.v > target + 0.2;
  b.v = b.v < target ? Math.min(target, b.v + acc * dt) : Math.max(target, b.v - 2 * brake * dt);
  b.v = Math.max(b.v, 4); // creep the last pixels instead of stalling asymptotically
  b.mv.s = Math.min(L, b.mv.s + b.v * dt);
  return b.mv.s >= L - 0.01;
}

function beginEnter(b, slot) {
  b.slot = slot;
  b.forcedSlot = null; // the reservation is spent
  if (S.slotVacantSince) S.slotVacantSince[slot] = null; // stall is spoken for — the vacancy backstop drops
  b.stoppedOnce = true;
  b.state = "enter";
  b.stopElapsed = 0; // terminal-dwell clock starts as the bus rolls in
  b.mv = { s: 0 };
  b.blink = true;
  Object.assign(b, enterPose(enterGeom(b, slot), 0)); // snaps the few px a coarse step may have overshot
}

function finishEnter(b) {
  const g = enterGeom(b, b.slot);
  b.cx = g.tx; b.cy = g.ty; b.ang = -Math.PI / 2;
  b.v = 0; b.brake = false; b.blink = false; b.mv = null;
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
  b.mv = { s: 0, sx: b.cx, sy: b.cy };
  b.v = 0; b.rev = true;
  for (const p of b.pax) {
    if (p.state === "serveR" || p.state === "serveT" || p.state === "scrubC") continue; // let them finish, they'll board after
    if (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC" ||
        p.state === "queueC2" || p.state === "payC2") continue; // still at the counter — they'll finish & board after
    if (p.state === "leaveC") { p.x = 852; p.y = 169; p.runaway = false; goDoor(p, b); continue; } // at the exit door — out & sprint for the bus
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
  toast(`🚌 ${DEST_B} otobüsü yola çıktı · ${stars} (ort. ${Math.round(avg)}) · itibar ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`, delta >= 0 ? "good" : "bad");
}

function finishExit(b) {
  b.cy = LANE_CY; b.ang = 0;
  b.mv = null; b.rev = false;
  b.state = "drive";
  b.v = 0;
  b.holdT = 0.7; // brake held, shift from reverse into drive, then pull away
}

// The bay this bus is heading for: the first free one (in fill order) whose
// turn-in point it hasn't already driven past. A bus reserved for a
// particular bay (forcedSlot — the vacancy backstop promised it the stall
// that went quiet longest) drives past earlier free bays to the one it was
// promised; if that bay fills first, it falls back to normal first-fit.
// `slack` is how far past a turn-in point still counts (a coarse step at a
// high speed tier can jump far past it in one go).
function baySlotFor(b, slack) {
  const free = i => !buses.some(o => o !== b && (o.state === "stop" || o.state === "enter") && o.slot === i);
  const ok = i => free(i) && b.cx <= enterGeom(b, i).x0 + slack;
  if (b.forcedSlot != null && ok(b.forcedSlot)) return b.forcedSlot; // != null: plain schedule buses carry null, and null >= 0 is true in JS
  for (let i = 0; i < BAY_SLOTS.length; i++) if (ok(i)) return i;
  return -1;
}

// Cruise speed for a bus on the lane: slow for the upcoming turn-in, and
// keep a gap behind whatever is ahead (including a bus backing out of a stall).
function driveTarget(b) {
  let vT = BUS_V;
  b.blink = false;
  if (!b.stoppedOnce) {
    const si = baySlotFor(b, 0);
    if (si >= 0) {
      const dist = enterGeom(b, si).x0 - b.cx;
      vT = Math.min(vT, Math.sqrt(BUS_TURN_V * BUS_TURN_V + 2 * BUS_BRAKE * Math.max(0, dist)));
      b.blink = dist < 260;
    }
  }
  const front = b.cx + b.len / 2;
  for (const o of buses) {
    if (o === b || o.state === "stop") continue;
    const c = Math.cos(o.ang), s = Math.sin(o.ang);
    const ry = o.cy - s * o.len / 2;          // tail end of the other bus
    if (ry < ROAD.top + 4) continue;          // still entirely up in the lot
    const rearX = Math.min(o.cx, o.cx - c * o.len / 2) - 33 * Math.abs(s);
    if (rearX <= b.cx) continue;              // beside or behind us
    vT = Math.min(vT, Math.max(0, (rearX - front - 24) * 1.4));
  }
  return vT;
}

// The cleanest stall in the whole row, occupied or not — the bar that
// makes a guest give up on the WC entirely (every single stall below it).
const bestStallClean = () => Math.max(...S.stallClean);

// The cleanest stall that is actually FREE right now, -1 when the row is
// fully occupied. Guests hold their LINE to this: an occupied clean stall
// they cannot reach is no excuse to step into muck, so the line just
// stands until a clean stall frees up (or the hose fixes a filthy one).
function bestFreeStallClean() {
  let best = -1;
  for (let i = 0; i < WC_STALLS; i++)
    if (!facilities.T.spots[i]) best = Math.max(best, S.stallClean[i]);
  return best;
}

function evaluate(p, bus) {
  if (reached(p.boardAt)) { goDoor(p, bus); return; }
  if (!p.refuseT && p.bladder > WC_NEEDED) {
    if (bestStallClean() < WC_TOO_DIRTY) {
      // The whole row is too filthy — the guest gives up instead of queuing.
      // Not refused for good: every evaluate rechecks, so once the hose has
      // done its work the same guest (still full) heads for the clean WC.
      p.want = null;
      if (performance.now() - lastDirtyToast > 2500) {
        lastDirtyToast = performance.now();
        toast("😖 Bir misafir pis tuvaletleri görünce vazgeçti", "bad");
      }
      wander(p);
      return;
    }
    p.want = "T"; tryJoin("T", p, bus); return;
  }
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
  // toilets do NOT recover on their own — grime only leaves via the hose (or a
  // caught runaway's scrub); S.cleanliness stays the derived average
  // (outdoor HUD, legacy code paths)
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
    // A line that has free toilets to claim but not a single one clean
    // loses patience twice as fast — nobody enjoys waiting for a toilet
    // that smells. (A fully occupied row is just a busy row: normal drain.)
    if (name === "T" && facilities.T.spots.some(s => !s) && bestFreeStallClean() < WC_TOO_DIRTY)
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
  // to another stall mid-use. A toilet guest takes the CLEANEST available
  // stall; diner seats fill from the front.
  while (f.queue.length) {
    const free = [];
    for (let i = 0; i < stalls; i++) if (!f.spots[i]) free.push(i);
    if (!free.length) break;
    // No guest steps into a toilet that filthy: if every OPEN stall is below
    // the bar, the whole line stands (and loses patience) until the hose
    // brings one back above it or a clean in-use stall frees up.
    if (name === "T" && bestFreeStallClean() < WC_TOO_DIRTY) break;
    const p = f.queue.shift();
    let slot;
    if (name === "T") {
      // Guests sniff the row and head for the least grimy free door.
      slot = free[0];
      for (const i of free) if (S.stallClean[i] > S.stallClean[slot]) slot = i;
    } else slot = free[0];
    p.state = name === "R" ? "serveR" : "serveT";
    p.stall = slot; // the stall this visit uses — pinned until the guest leaves
    if (name === "T") {
      // Step in through the EXIT door, then walk off to their stall bay.
      // (Indoor pax are invisible in the outdoor view, so the snap reads as
      // a clean entry in the interior view.)
      p.x = DOOR_IN.x; p.y = DOOR_IN.y;
      p.enterT = null;
      p.inStall = false; // door stays ajar until they actually reach the bay
      p.useSat = null;   // a fresh visit clears any stale rating from a previous (evaded) one
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
  // The whole cleanliness range counts, in both directions: a spotless stall
  // delights (up to +25 over baseline) and every notch of dirt drags the
  // rating down — that satisfaction feeds reputation in finishVisit.
  p.useSat = clamp(SAT_BASE + (sc - 50) * 0.5, 0, 100);
  p.wcUsed = true; // a toilet rating — finishVisit weighs it 2× in reputation
  if (si >= 0 && sc > 15) S.stallClean[si] = Math.max(0, sc - rand(8, 16));
  p.waitTotal = p.waitReal; // their queue time, folded into the final rating
  p.waitReal = 0;
  p.sat = null;
  const bus = findBusOf(p);
  if (bus && bus.state === "stop") {
    // the one roll per visit: a few guests try to run off without paying
    if (Math.random() < WC_EVADE) fleeCounter(p);
    else enterCounter(p);
  } else {
    p.unpaid = true; // bus already pulled out — no counter, no time for the ritual
    if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
    const rating = p.useSat;
    finishVisit(p, p.useSat);
    p.useSat = rating; // same contract as the evade branch: the rating stays readable
  }
}

// A runaway: the guest finished in the stall and, instead of joining a payment
// line, dashes for the EXIT door (EVADE_WALK, in real time — see updatePax).
// The visit is settled here (satisfaction + reputation, like any other
// departure — the theft knocks a little off the rating). `runaway` makes them
// clickable (catchRunaway) until they cross the EXIT, where it is cleared.
// (Guests who abandon a payment line never come here — see stormOut.)
function fleeCounter(p) {
  p.unpaid = true;
  p.runaway = true;
  if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
  const now = performance.now();
  if (now - lastEvadeToast > 2000) {
    lastEvadeToast = now;
    toast("🏃 Bir misafir ödemeden kaçmaya çalışıyor!", "bad");
  }
  const rating = p.useSat;
  finishVisit(p, clamp((p.useSat != null ? p.useSat : SAT_BASE) - 15, 10, 100), true);
  // finishVisit consumed the rating (p.sat is set, useSat nulled) — put useSat
  // back so the visit's cleanliness rating stays readable on the guest (the
  // contract completeService's callers, and the sat-curve probes, rely on).
  // A stale value can never double-count: a settled guest always has p.sat set,
  // and a new serveT visit clears useSat on entry (stepFac).
  p.useSat = rating;
}

/* ---------------------- WC stall cleaning (the hose) ---------------- */
// The ten stall bays, in the interior view's coords (drawWCInterior): five
// in the left row (x = 76 + i*64) and five mirrored in the right row
// (x = 576 + (i-5)*64) — matching the two stall containers drawWCInterior paints.
const stallBay = i => ({ x: i < WC_STALLS / 2 ? 76 + i * 64 : 576 + (i - WC_STALLS / 2) * 64, y: 108, w: 52, h: 138 });

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
      if (now - lastHoseToast > 1500) { lastHoseToast = now; toast("🚿 Bir kabin pırıl pırıl oldu!", "good"); }
    }
  }
  if (touched) S.cleanliness = S.stallClean.reduce((a, v) => a + v, 0) / WC_STALLS;
}

/* ---------------------- Player actions (counter) -------------------- */
// Step between the layover, the WC counter room, and the car wash.
function setView(v) {
  if (v === S.view) return;
  if (scrub && S.view === "wc") return; // stay and watch the caught runaway finish scrubbing (3 s)
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
// pointerdown + pointermove while the button/finger is held — a scrub or a
// spray, not a click/tap.
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
  toast("✨ Ön cam pırıl pırıl — şoför bunu fark edecek!", "good");
  save();
}

/* ------------------- Runaways & the caught-guest scrub --------------- */
// A runaway (fleeCounter) can be clicked while they are still inside the WC,
// running for the EXIT. Caught, they stop dead and scrub every toilet for
// SCRUB_TIME real seconds — a dash along both stall rows, a quick scrub at
// each bowl — and when the sequence ends every stall is reset to spotless,
// exactly once. Then they walk out like any other guest.
function catchRunaway(p) {
  if (scrub || !p || !p.runaway || p.state !== "leaveC") return false; // one sequence at a time; only a live runaway
  p.runaway = false; // caught once — never catchable again this visit
  p.state = "scrubC";
  if (S.stats) S.stats.caught = (S.stats.caught || 0) + 1;
  toast("🧽 Yakalandın! Bütün tuvaletleri sen temizliyorsun!", "good");
  startScrub(p);
  return true;
}

// The scrub route: from where they were caught, stall 0 → 9 along the front
// of both rows. 40% of the time is spent running between bowls (split by
// distance), the rest scrubbing — an equal dwell at every stall.
function startScrub(p) {
  const pts = [];
  for (let i = 0; i < WC_STALLS; i++) pts.push({ x: stallBay(i).x + 26, y: 230 });
  let prev = { x: p.x, y: p.y }, total = 0;
  const dist = pts.map(q => { const d = Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; total += d; return d; });
  const travel = SCRUB_TIME * 0.4, dwell = SCRUB_TIME * 0.6 / WC_STALLS;
  let t = 0;
  prev = { x: p.x, y: p.y };
  const legs = pts.map((q, i) => {
    const leg = { a: prev, b: q, t0: t, t1: t + travel * dist[i] / (total || 1) };
    leg.t2 = t = leg.t1 + dwell;
    prev = q;
    return leg;
  });
  scrub = { pax: p, t: 0, legs };
}

// Where the scrubber is at the sequence's current time, and which stall (if
// any) they are scrubbing.
function scrubPose() {
  const { t, legs } = scrub;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (t < L.t1) {
      const u = easeInOut(clamp((t - L.t0) / Math.max(1e-6, L.t1 - L.t0), 0, 1));
      return { x: lerp(L.a.x, L.b.x, u), y: lerp(L.a.y, L.b.y, u), stall: -1, dir: Math.sign(L.b.x - L.a.x) || 1 };
    }
    if (t < L.t2 || i === legs.length - 1) return { x: L.b.x, y: L.b.y, stall: i, dir: 1 };
  }
}

// Advance the sequence by REAL seconds (called from frame() only while the
// game runs, so pause and the day-summary modal freeze it too).
function stepScrub(realDt) {
  if (!scrub) return;
  const p = scrub.pax;
  if (p.state !== "scrubC") { scrub = null; return; } // something else took the guest — drop the sequence
  scrub.t = Math.min(SCRUB_TIME, scrub.t + realDt);
  const pose = scrubPose();
  p.x = pose.x; p.y = pose.y;
  if (scrub.t >= SCRUB_TIME) finishScrub();
}

function finishScrub() {
  const p = scrub.pax;
  scrub = null;
  const now = performance.now();
  for (let i = 0; i < WC_STALLS; i++) { S.stallClean[i] = 100; hoseGleam[i] = now; }
  S.cleanliness = 100;
  scrubDoneAt = now;
  toast("✨ Bütün tuvaletler yine pırıl pırıl!", "good");
  // their work is done — they walk out (no longer a runaway, no rush)
  p.state = "leaveC";
  p.tx = DOOR_IN.x; p.ty = DOOR_IN.y;
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
  const now = performance.now();
  const pulse = 0.55 + 0.45 * Math.sin(now / 200);
  const { body: B, wind: Wd, brush: Br, hose: Hs, exit: Ex } = WASH;
  const hz = B.y + 40;               // horizon: where the wash pad meets the sky
  const floorB = H + offY;           // bottom of the visible canvas
  const hue = b.hue;
  const hsl = (s, l, a = 1) => `hsla(${hue}, ${s}%, ${Math.max(4, l)}%, ${a})`;
  const hsh = n => frac(Math.sin(n * 127.1 + 11.3) * 43758.5453); // stable per-index noise

  // --- sky (the same palette as the layover — the view change feels like a dolly)
  const [top, bot] = skyColors(S.time);
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, top); sky.addColorStop(1, bot);
  ctx.fillStyle = sky;
  ctx.fillRect(-offX, -offY, Wdyn, Hdyn + offY);
  if (nf > 0.3) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.t + s.tw * now / 1000));
      ctx.fillRect(s.x, s.y * 0.35, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  // --- the countryside on the horizon: snow-capped mountains, green hills,
  // a tree line, and now and then a lone farmhouse
  const sx0 = Math.floor(-offX / 8) * 8, sx1 = -offX + Wdyn + 8;
  const ridge = (x, base, amp, s) => hz - base - amp * (0.5 + 0.3 * Math.sin(x / 97 + s) + 0.15 * Math.sin(x / 41 + s * 2.3) + 0.05 * Math.sin(x / 17 + s * 5.1));
  const range = (base, amp, s) => {
    ctx.beginPath();
    ctx.moveTo(sx0, hz);
    for (let x = sx0; x <= sx1; x += 8) ctx.lineTo(x, ridge(x, base, amp, s));
    ctx.lineTo(sx1, hz);
    ctx.closePath();
  };
  range(22, 92, 1.7);
  const mtn = ctx.createLinearGradient(0, hz - 115, 0, hz);
  mtn.addColorStop(0, mix("#8ea5c0", "#1b2339", nf));
  mtn.addColorStop(1, mix("#b4c6d8", "#232c44", nf));
  ctx.fillStyle = mtn;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = `rgba(250, 252, 255, ${0.9 - nf * 0.6})`;
  ctx.beginPath();
  ctx.moveTo(sx0, 0);
  for (let x = sx0; x <= sx1; x += 8) ctx.lineTo(x, hz - 84 + 5 * Math.sin(x / 9) + 4 * Math.sin(x / 23));
  ctx.lineTo(sx1, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  range(6, 44, 4.2);
  const hill = ctx.createLinearGradient(0, hz - 50, 0, hz);
  hill.addColorStop(0, mix("#7aa77f", "#1a2c22", nf));
  hill.addColorStop(1, mix("#5c8a62", "#132119", nf));
  ctx.fillStyle = hill;
  ctx.fill();
  // two rows of pines: a paler, smaller one up the hill, a dark one at its foot
  const pines = (step, y0, hMin, hVar, col, seed) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let x = Math.floor(-offX / step) * step; x < sx1; x += step) {
      if (hsh(x * 0.71 + seed) < 0.22) continue;
      const tx = x + hsh(x * 1.3 + seed) * step * 0.6;
      const th = hMin + hVar * hsh(x * 2.9 + seed), tw = th * 0.36;
      const ty = y0 + 3 * hsh(x * 4.1 + seed);
      ctx.moveTo(tx, ty - th); ctx.lineTo(tx + tw, ty); ctx.lineTo(tx - tw, ty); ctx.closePath();
      ctx.moveTo(tx, ty - th * 1.18); ctx.lineTo(tx + tw * 0.7, ty - th * 0.45); ctx.lineTo(tx - tw * 0.7, ty - th * 0.45); ctx.closePath();
    }
    ctx.fill();
  };
  pines(10, hz - 16, 8, 10, mix("#4f7d58", "#14231b", nf), 3.3);
  pines(13, hz + 2, 14, 20, mix("#2d5838", "#0d1812", nf), 7.9);
  if (b.id % 3 === 0) {
    const hx = b.id % 2 ? 182 : 782, hb = hz + 1;
    ctx.fillStyle = mix("#7a4a3a", "#2a1a16", nf);
    ctx.fillRect(hx + 7, hb - 30, 5, 10);                    // chimney
    ctx.fillStyle = mix("#ece0c8", "#3b3730", nf);
    ctx.fillRect(hx - 16, hb - 17, 32, 17);                  // walls
    ctx.fillStyle = mix("#b4513a", "#3a1f1a", nf);
    ctx.beginPath(); ctx.moveTo(hx - 20, hb - 16); ctx.lineTo(hx, hb - 30); ctx.lineTo(hx + 20, hb - 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mix("#6b4a2e", "#221811", nf);
    ctx.fillRect(hx - 3, hb - 10, 6, 10);                    // door
    ctx.fillStyle = nf > 0.4 ? "#ffd27a" : "#5d7488";
    ctx.fillRect(hx - 13, hb - 13, 6, 5); ctx.fillRect(hx + 7, hb - 13, 6, 5);
    for (let k = 0; k < 3; k++) {                            // a wisp of chimney smoke
      const t = (now / 3000 + k / 3) % 1;
      ctx.fillStyle = `rgba(235, 238, 242, ${(0.45 * (1 - t) * (1 - nf * 0.6)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(hx + 9.5 + t * 10 + Math.sin(t * 6 + k) * 2, hb - 33 - t * 22, 2.5 + t * 4, 0, 7); ctx.fill();
    }
  }

  // --- concrete wash pad: wet, tiled, darker toward the viewer
  const fg = ctx.createLinearGradient(0, hz, 0, floorB);
  fg.addColorStop(0, mix("#6f7887", "#2a303c", nf * 0.7));
  fg.addColorStop(1, mix("#454c59", "#171b23", nf * 0.7));
  ctx.fillStyle = fg;
  ctx.fillRect(-offX, hz, Wdyn, H + 2 * offY - hz);
  ctx.fillStyle = `rgba(20, 24, 34, ${0.25 + nf * 0.2})`;
  ctx.fillRect(-offX, hz, Wdyn, 4);
  // tile seams converging on a far vanishing point
  const vpx = W / 2, vpy = hz - 260;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.13)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -16; k <= 16; k++) {
    const xb = vpx + k * 110;
    const xt = vpx + (xb - vpx) * (hz - vpy) / (floorB - vpy);
    ctx.moveTo(xt, hz + 4); ctx.lineTo(xb, floorB);
  }
  for (let i = 1; i <= 9; i++) {
    const y = hz + 4 + (floorB - hz) * Math.pow(i / 9, 1.9);
    ctx.moveTo(-offX, y); ctx.lineTo(-offX + Wdyn, y);
  }
  ctx.stroke();
  // floor drain in front of the bumper
  const dgx = B.x + B.w / 2, dgy = B.y + B.h + 44;
  ctx.fillStyle = "rgba(10, 12, 18, 0.55)";
  rr(ctx, dgx - 70, dgy - 7, 140, 14, 4); ctx.fill();
  ctx.fillStyle = mix("#7d8696", "#3a414d", nf);
  for (let k = 0; k < 12; k++) { rr(ctx, dgx - 64 + k * 11, dgy - 4, 6, 8, 2); ctx.fill(); }
  // puddles — they catch the sky
  const shimmer = 0.5 + 0.5 * Math.sin(now / 900);
  for (const [px0, py0, rx, ry] of [[170, 505, 74, 10], [790, 498, 62, 9], [dgx + 120, dgy + 22, 46, 7], [dgx - 150, dgy + 14, 38, 6]]) {
    ctx.fillStyle = mix("#8fb3d6", "#2b3a58", nf * 0.8);
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.ellipse(px0, py0, rx, ry, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.25 + 0.25 * shimmer;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(px0 - rx * 0.15, py0 - ry * 0.25, rx * 0.55, ry * 0.4, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // --- the bus front
  const L = 56 - nf * 15; // body lightness
  // wet reflection of the bus on the pad
  const refl = ctx.createLinearGradient(0, B.y + B.h, 0, B.y + B.h + 70);
  refl.addColorStop(0, hsl(55, L - 10, 0.2));
  refl.addColorStop(1, hsl(55, L - 10, 0));
  ctx.fillStyle = refl;
  ctx.beginPath();
  ctx.moveTo(B.x + 14, B.y + B.h); ctx.lineTo(B.x + B.w - 14, B.y + B.h);
  ctx.lineTo(B.x + B.w - 50, B.y + B.h + 70); ctx.lineTo(B.x + 50, B.y + B.h + 70);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + nf * 0.15})`;
  ctx.beginPath(); ctx.ellipse(B.x + B.w / 2, B.y + B.h + 10, B.w * 0.62, 16, 0, 0, 7); ctx.fill();
  // headlight pools on the wet floor after dark
  if (nf > 0.05) {
    for (const hx of [B.x + 40, B.x + B.w - 40]) {
      const pg = ctx.createRadialGradient(hx, B.y + B.h + 34, 4, hx, B.y + B.h + 34, 110);
      pg.addColorStop(0, `rgba(255, 228, 150, ${0.3 * nf})`);
      pg.addColorStop(1, "rgba(255, 228, 150, 0)");
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.ellipse(hx, B.y + B.h + 34, 110, 34, 0, 0, 7); ctx.fill();
    }
  }
  // tyres peeking out under the skirt
  for (const tx of [B.x + 22, B.x + B.w - 72]) {
    ctx.fillStyle = "#15171b";
    rr(ctx, tx, B.y + B.h - 24, 50, 40, 9); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { ctx.moveTo(tx + 8 + k * 11, B.y + B.h); ctx.lineTo(tx + 8 + k * 11, B.y + B.h + 13); }
    ctx.stroke();
  }
  // the coach silhouette: arched roof, softly rounded shoulders, near-vertical flanks
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(B.x + 40, B.y);
    ctx.quadraticCurveTo(B.x + B.w / 2, B.y - 7, B.x + B.w - 40, B.y);
    ctx.quadraticCurveTo(B.x + B.w - 5, B.y + 3, B.x + B.w - 3, B.y + 42);
    ctx.lineTo(B.x + B.w, B.y + B.h - 18);
    ctx.quadraticCurveTo(B.x + B.w, B.y + B.h, B.x + B.w - 18, B.y + B.h);
    ctx.lineTo(B.x + 18, B.y + B.h);
    ctx.quadraticCurveTo(B.x, B.y + B.h, B.x, B.y + B.h - 18);
    ctx.lineTo(B.x + 3, B.y + 42);
    ctx.quadraticCurveTo(B.x + 5, B.y + 3, B.x + 40, B.y);
    ctx.closePath();
  };
  // rabbit-ear mirrors: dark arms off the roof corners, body-coloured heads
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(B.x + B.w / 2, 0);
    ctx.scale(s, 1);
    const ex = -B.w / 2;
    ctx.strokeStyle = mix("#1d2027", "#0e1014", nf);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex + 16, B.y + 8);
    ctx.quadraticCurveTo(ex - 20, B.y - 2, ex - 30, B.y + 26);
    ctx.stroke();
    ctx.lineCap = "butt";
    const mh = ctx.createLinearGradient(ex - 48, 0, ex - 22, 0);
    mh.addColorStop(0, hsl(55, L - 18));
    mh.addColorStop(0.45, hsl(60, L + 6));
    mh.addColorStop(1, hsl(55, L - 8));
    ctx.fillStyle = mh;
    rr(ctx, ex - 48, B.y + 24, 26, 70, 11); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.5;
    rr(ctx, ex - 48, B.y + 24, 26, 70, 11); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    rr(ctx, ex - 44, B.y + 30, 5, 50, 2.5); ctx.fill();
    ctx.restore();
  }
  // glossy body: side-to-side shading, a bright roof edge, darker skirt
  const bodyG = ctx.createLinearGradient(B.x, 0, B.x + B.w, 0);
  bodyG.addColorStop(0, hsl(60, L - 16));
  bodyG.addColorStop(0.08, hsl(62, L + 2));
  bodyG.addColorStop(0.5, hsl(60, L + 4));
  bodyG.addColorStop(0.92, hsl(60, L - 2));
  bodyG.addColorStop(1, hsl(60, L - 18));
  ctx.fillStyle = bodyG;
  bodyPath(); ctx.fill();
  ctx.save();
  bodyPath(); ctx.clip();
  const sheen = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
  sheen.addColorStop(0, "rgba(255,255,255,0.28)");
  sheen.addColorStop(0.06, "rgba(255,255,255,0.05)");
  sheen.addColorStop(0.75, "rgba(255,255,255,0.08)");
  sheen.addColorStop(0.86, "rgba(0,0,0,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = sheen;
  ctx.fillRect(B.x, B.y - 8, B.w, B.h + 8);
  ctx.fillStyle = "rgba(0,0,0,0.18)";            // the lower bumper lip
  ctx.fillRect(B.x, B.y + B.h - 9, B.w, 9);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = hsl(55, Math.max(10, 28 - nf * 12));
  bodyPath(); ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // roof antenna + two small marker lights
  ctx.strokeStyle = "#1a1d22";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(B.x + B.w / 2, B.y - 4); ctx.lineTo(B.x + B.w / 2, B.y - 14); ctx.stroke();
  ctx.save();
  ctx.shadowColor = "rgba(255, 170, 60, 0.9)";
  ctx.shadowBlur = 4 + 6 * nf;
  ctx.fillStyle = "#ffb13b";
  for (const mx of [B.x + 30, B.x + B.w - 30]) { ctx.beginPath(); ctx.ellipse(mx, B.y + 6, 4, 2.5, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  // windshield: a black frame that follows the roofline, with a deep black
  // band under the glass where the wipers park
  ctx.fillStyle = "#0c0d10";
  ctx.beginPath();
  ctx.moveTo(Wd.x - 9, Wd.y + 18);
  ctx.quadraticCurveTo(Wd.x - 8, Wd.y - 11, Wd.x + 26, Wd.y - 12);
  ctx.quadraticCurveTo(Wd.x + Wd.w / 2, Wd.y - 17, Wd.x + Wd.w - 26, Wd.y - 12);
  ctx.quadraticCurveTo(Wd.x + Wd.w + 8, Wd.y - 11, Wd.x + Wd.w + 9, Wd.y + 18);
  ctx.lineTo(Wd.x + Wd.w + 10, Wd.y + Wd.h + 18);
  ctx.quadraticCurveTo(Wd.x + Wd.w + 10, Wd.y + Wd.h + 24, Wd.x + Wd.w + 2, Wd.y + Wd.h + 24);
  ctx.lineTo(Wd.x - 2, Wd.y + Wd.h + 24);
  ctx.quadraticCurveTo(Wd.x - 10, Wd.y + Wd.h + 24, Wd.x - 10, Wd.y + Wd.h + 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  const glass = ctx.createLinearGradient(0, Wd.y, 0, Wd.y + Wd.h);
  glass.addColorStop(0, mix("#8fbbe3", "#2b3b5a", nf * 0.75));
  glass.addColorStop(0.55, mix("#5a7ea6", "#1f2b44", nf * 0.75));
  glass.addColorStop(1, mix("#3f6187", "#151d30", nf * 0.75));
  ctx.fillStyle = glass;
  rr(ctx, Wd.x, Wd.y, Wd.w, Wd.h, 4); ctx.fill();
  // the coach interior seen through the glass: a bright cream cabin in
  // one-point perspective — twin LED strips down the ceiling, dark luggage
  // racks with teal accents, rows of leather seats, the driver's seat, dash
  ctx.save();
  rr(ctx, Wd.x, Wd.y, Wd.w, Wd.h, 4); ctx.clip();
  const BK = { x0: Wd.x + Wd.w / 2 - 28, x1: Wd.x + Wd.w / 2 + 28, y0: Wd.y + Wd.h * 0.37, y1: Wd.y + Wd.h * 0.59 }; // the back wall
  const IX = (u, z) => lerp(lerp(BK.x0, BK.x1, u), lerp(Wd.x, Wd.x + Wd.w, u), z);
  // the passenger deck sits high, level with the dash top; the driver sits lower, in front of it
  const IY = (v, z) => lerp(lerp(BK.y0, BK.y1, v), lerp(Wd.y - 6, Wd.y + Wd.h - 26, v), z);
  const poly = pts => {
    ctx.beginPath();
    pts.forEach(([u, v, z], k) => k ? ctx.lineTo(IX(u, z), IY(v, z)) : ctx.moveTo(IX(u, z), IY(v, z)));
    ctx.closePath();
  };
  const lit = (d, n2) => mix(d, n2, nf);
  ctx.fillStyle = lit("#b9b0a0", "#d2c7b4");
  ctx.fillRect(Wd.x, Wd.y, Wd.w, Wd.h);
  // ceiling: pale panels, a recessed centre channel between the two LED strips
  const ceil = ctx.createLinearGradient(0, Wd.y, 0, BK.y0);
  ceil.addColorStop(0, lit("#c9c2b5", "#ddd4c3"));
  ceil.addColorStop(1, lit("#b6ad9d", "#cfc4b0"));
  ctx.fillStyle = ceil;
  poly([[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]]); ctx.fill();
  ctx.fillStyle = lit("#aea596", "#c2b8a5");
  poly([[0.4, 0, 1], [0.6, 0, 1], [0.6, 0, 0], [0.4, 0, 0]]); ctx.fill();
  // floor: pale aisle between darker carpet
  ctx.fillStyle = lit("#6f6a62", "#857e72");
  poly([[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]); ctx.fill();
  ctx.fillStyle = lit("#cfc6b6", "#e2d8c6");
  poly([[0.42, 1, 1], [0.58, 1, 1], [0.58, 1, 0], [0.42, 1, 0]]); ctx.fill();
  for (const side of [0, 1]) {
    const U = u => side ? 1 - u : u;
    // side wall
    ctx.fillStyle = lit("#a89f90", "#c3b8a5");
    poly([[U(0), 0, 1], [U(0), 0, 0], [U(0), 1, 0], [U(0), 1, 1]]); ctx.fill();
    // tinted side windows with teal curtains at each pillar
    ctx.fillStyle = mix("#557a94", "#0c1522", nf);
    poly([[U(0), 0.18, 1], [U(0), 0.18, 0.03], [U(0), 0.62, 0.03], [U(0), 0.62, 1]]); ctx.fill();
    ctx.fillStyle = lit("#1f7f8c", "#2aa3b3");
    for (let k = 1; k < 8; k++) {
      const z0 = 1 / (1 + k * 0.5), z1 = 1 / (1 + (k + 0.18) * 0.5);
      poly([[U(0), 0.18, z0], [U(0), 0.18, z1], [U(0), 0.62, z1], [U(0), 0.62, z0]]); ctx.fill();
    }
    // charcoal luggage rack, its lip trimmed in teal
    ctx.fillStyle = lit("#2b2f35", "#363b42");
    poly([[U(0), 0.03, 1], [U(0), 0.03, 0], [U(0.17), 0.13, 0], [U(0.17), 0.13, 1]]); ctx.fill();
    ctx.fillStyle = lit("#1c1f24", "#24282e");
    poly([[U(0.17), 0.13, 1], [U(0.17), 0.13, 0], [U(0.17), 0.16, 0], [U(0.17), 0.16, 1]]); ctx.fill();
    ctx.fillStyle = lit("#2a9fb0", "#45d0e0");
    poly([[U(0.17), 0.157, 1], [U(0.17), 0.157, 0], [U(0.17), 0.165, 0], [U(0.17), 0.165, 1]]); ctx.fill();
  }
  // back wall: cream, a dark rear door
  ctx.fillStyle = lit("#c8bfae", "#ddd2be");
  ctx.fillRect(BK.x0, BK.y0, BK.x1 - BK.x0, BK.y1 - BK.y0);
  ctx.fillStyle = lit("#3a3e44", "#2a2e34");
  ctx.fillRect(BK.x0 + 18, BK.y0 + 8, BK.x1 - BK.x0 - 36, BK.y1 - BK.y0 - 8);
  // twin LED light strips running the length of the ceiling
  ctx.save();
  ctx.shadowColor = `rgba(255, 250, 235, ${0.7 + 0.3 * nf})`;
  ctx.shadowBlur = 10 + 8 * nf;
  ctx.fillStyle = "#fffdf6";
  poly([[0.355, 0, 1], [0.4, 0, 1], [0.4, 0, 0.02], [0.355, 0, 0.02]]); ctx.fill();
  poly([[0.6, 0, 1], [0.645, 0, 1], [0.645, 0, 0.02], [0.6, 0, 0.02]]); ctx.fill();
  // reading lights under the racks
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const z = 1 / (1 + k * 0.45);
    for (const u of [0.12, 0.88]) { ctx.moveTo(IX(u, z) + 1.5 * z, IY(0.135, z)); ctx.arc(IX(u, z), IY(0.135, z), 1.5 * z, 0, 7); }
  }
  ctx.fill();
  ctx.restore();
  // rows of tall cream leather seats on pedestal legs, back to front (each
  // row overlaps the one behind); headrests reach up into the window band
  const seat = (u0, u1, z, top, tone, fv = 1) => {
    const x0 = IX(u0, z), x1 = IX(u1, z), yT = IY(top, z), yF = IY(fv, z), sw = x1 - x0, th = yF - yT;
    const yC = yT + th * 0.66, yE = yT + th * 0.8;   // cushion top / front edge
    ctx.fillStyle = "rgba(0,0,0,0.25)";                // shadow on the floor
    ctx.beginPath(); ctx.ellipse(x0 + sw / 2, yF, sw * 0.45, Math.max(1, th * 0.03), 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#26282c";                         // pedestal leg
    ctx.fillRect(x0 + sw * 0.42, yE, sw * 0.16, yF - yE);
    ctx.fillRect(x0 + sw * 0.3, yF - th * 0.03, sw * 0.4, th * 0.03);
    const sg = ctx.createLinearGradient(x0, yT, x1, yC);
    sg.addColorStop(0, lit(tone[0], tone[1]));
    sg.addColorStop(1, lit(tone[2], tone[3]));
    ctx.fillStyle = sg;                                // backrest
    rr(ctx, x0 + sw * 0.04, yT + th * 0.08, sw * 0.92, yC - yT - th * 0.06, 7 * z); ctx.fill();
    ctx.fillStyle = lit(tone[0], tone[1]);             // headrest
    rr(ctx, x0 + sw * 0.16, yT, sw * 0.68, th * 0.15, 5 * z); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    rr(ctx, x0 + sw * 0.22, yT + th * 0.02, sw * 0.56, th * 0.05, 3 * z); ctx.fill();
    ctx.fillStyle = lit(tone[2], tone[3]);             // seat cushion, jutting forward
    rr(ctx, x0, yC - th * 0.02, sw, yE - yC + th * 0.02, 5 * z); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x0 + sw * 0.06, yC, sw * 0.88, Math.max(0.8, th * 0.025));
    ctx.strokeStyle = "rgba(90, 76, 58, 0.35)";        // stitched panels
    ctx.lineWidth = Math.max(0.6, 1.2 * z);
    ctx.beginPath();
    ctx.moveTo(x0 + sw * 0.14, yT + th * 0.3); ctx.lineTo(x1 - sw * 0.14, yT + th * 0.3);
    ctx.moveTo(x0 + sw * 0.5, yT + th * 0.3); ctx.lineTo(x0 + sw * 0.5, yC - th * 0.03);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.12)";                // shaded outer edge
    rr(ctx, x0 + sw * 0.04, yT + th * 0.08, sw * 0.12, yC - yT - th * 0.06, 7 * z); ctx.fill();
  };
  const CREAM = ["#efe7d8", "#fbf3e2", "#bfb19a", "#d2c3a8"];
  for (let k = 8; k >= 1; k--) {
    const z = 0.78 / (1 + k * 0.45);
    for (const [u0, u1] of [[0.05, 0.2], [0.215, 0.365], [0.635, 0.785], [0.8, 0.95]]) seat(u0, u1, z, 0.3, CREAM);
  }
  seat(0.05, 0.2, 0.78, 0.3, CREAM);   // front passenger row (left)
  seat(0.215, 0.365, 0.78, 0.3, CREAM);
  seat(0.62, 0.92, 0.95, 0.42, ["#d8d0c2", "#e8dfcf", "#8f8573", "#a39885"], 1.12); // the driver's seat, down in its well (right)
  // the cabin glows after dark
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(Wd.x + Wd.w / 2, Wd.y + 50, 10, Wd.x + Wd.w / 2, Wd.y + 50, 200);
  glow.addColorStop(0, `rgba(255, 244, 222, ${0.06 + 0.16 * nf})`);
  glow.addColorStop(1, "rgba(255, 244, 222, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(Wd.x, Wd.y, Wd.w, Wd.h);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(8, 10, 16, ${0.45 - 0.03 * nf})`; // tinted glass: the cabin reads dim from outside
  ctx.fillRect(Wd.x, Wd.y, Wd.w, Wd.h);
  // steering wheel on its column, tipped back toward the driver; the dash top hides its lower rim
  const swx = Wd.x + Wd.w - 62, swy = Wd.y + Wd.h - 36, srx = 29, sry = 12;
  ctx.fillStyle = "#1b1c20";
  ctx.beginPath();
  ctx.moveTo(swx - 5, swy); ctx.lineTo(swx + 5, swy);
  ctx.lineTo(swx + 8, Wd.y + Wd.h); ctx.lineTo(swx - 8, Wd.y + Wd.h);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#202226";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(swx, swy); ctx.lineTo(swx - srx + 2, swy + 1);
  ctx.moveTo(swx, swy); ctx.lineTo(swx + srx - 2, swy + 1);
  ctx.moveTo(swx, swy); ctx.lineTo(swx, swy + sry - 1);
  ctx.stroke();
  ctx.fillStyle = "#26282d";
  ctx.beginPath(); ctx.ellipse(swx, swy, 7, 3.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(220, 225, 235, 0.35)";
  ctx.beginPath(); ctx.ellipse(swx, swy - 0.5, 2.2, 1.1, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = "#141518";
  ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.ellipse(swx, swy, srx, sry, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = "rgba(255, 245, 225, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(swx, swy - 1.2, srx, sry, 0, Math.PI + 0.45, Math.PI * 2 - 0.45); ctx.stroke();
  // dashboard; the rearview mirror seen from behind (housing only, its glass faces the driver)
  const dash = ctx.createLinearGradient(0, Wd.y + Wd.h - 30, 0, Wd.y + Wd.h);
  dash.addColorStop(0, "#2b2d31"); dash.addColorStop(1, "#121316");
  ctx.fillStyle = dash;
  ctx.fillRect(Wd.x, Wd.y + Wd.h - 28, Wd.w, 28);
  ctx.fillStyle = "rgba(255, 245, 225, 0.22)";
  ctx.fillRect(Wd.x, Wd.y + Wd.h - 28, Wd.w, 1.5);
  ctx.fillStyle = "#141518";
  rr(ctx, Wd.x + Wd.w / 2 - 2, Wd.y, 4, 14, 2); ctx.fill();
  rr(ctx, Wd.x + Wd.w / 2 - 24, Wd.y + 12, 48, 13, 3); ctx.fill();
  // the glass itself tints what's behind it — more so by day, when it reflects the sky
  ctx.globalAlpha = 0.08 + 0.12 * (1 - nf);
  ctx.fillStyle = glass;
  ctx.fillRect(Wd.x, Wd.y, Wd.w, Wd.h);
  ctx.globalAlpha = 1;
  // red LED destination sign on the dash, bottom-left behind the glass (grime covers it too)
  const led = { x: Wd.x + 8, y: Wd.y + Wd.h - 25, w: 72, h: 21 };
  ctx.fillStyle = "#0b0907";
  rr(ctx, led.x, led.y, led.w, led.h, 3); ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(led.x + 2, led.y, led.w - 4, led.h);
  ctx.clip();
  ctx.shadowColor = "rgba(255, 50, 35, 0.9)";
  ctx.shadowBlur = 5 + 5 * nf;
  ctx.fillStyle = "#ff3b2f";
  ctx.font = "bold 14px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const msg = `${DEST_A.toUpperCase()} → ${DEST_B.toUpperCase()}     `;
  const span = ctx.measureText(msg).width;
  const off = ((now / 1000) * 22) % span; // 22 px/s marquee
  for (let tx = led.x + 2 - off; tx < led.x + led.w; tx += span) ctx.fillText(msg, tx, led.y + led.h / 2 + 0.5);
  ctx.restore();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = led.x + 2; x < led.x + led.w; x += 2) { ctx.moveTo(x, led.y + 2); ctx.lineTo(x, led.y + led.h - 2); }
  ctx.stroke();
  ctx.restore();

  // --- the lower face: swept headlights, a wide chrome grille with a round
  // emblem, the model badge, plate and fog lamps
  const ny = Wd.y + Wd.h + 24; // top of the painted lower face: the brand band sits here
  const fy = ny + 40;          // the headlight + grille row below it
  const chromeV = (y0, y1) => {
    const g2 = ctx.createLinearGradient(0, y0, 0, y1);
    g2.addColorStop(0, mix("#f4f7fb", "#6a7280", nf));
    g2.addColorStop(0.5, mix("#9aa3b1", "#3a414c", nf));
    g2.addColorStop(1, mix("#dfe4eb", "#555d69", nf));
    return g2;
  };
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(B.x + B.w / 2, 0);
    ctx.scale(s, 1);
    const ox = -B.w / 2; // outer edge of this side
    // housing: a slim wedge sweeping up toward the outer corner
    ctx.fillStyle = "#14161a";
    ctx.beginPath();
    ctx.moveTo(ox + 8, fy + 2);
    ctx.lineTo(ox + 74, fy + 12);
    ctx.quadraticCurveTo(ox + 80, fy + 14, ox + 76, fy + 22);
    ctx.lineTo(ox + 20, fy + 26);
    ctx.quadraticCurveTo(ox + 8, fy + 26, ox + 7, fy + 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = chromeV(fy, fy + 26);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // LED daytime running strip along the top edge
    ctx.save();
    ctx.shadowColor = `rgba(220, 240, 255, ${0.6 + 0.4 * nf})`;
    ctx.shadowBlur = 6 + 8 * nf;
    ctx.strokeStyle = "#f2f8ff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox + 12, fy + 5); ctx.lineTo(ox + 70, fy + 14); ctx.stroke();
    ctx.lineCap = "butt";
    // twin projector lenses (they glow at night)
    ctx.shadowColor = `rgba(255, 236, 180, ${0.9 * nf})`;
    ctx.shadowBlur = 16;
    for (const [lx, lr] of [[ox + 28, 6.5], [ox + 48, 5.5]]) {
      const lens = ctx.createRadialGradient(lx - 2, fy + 17, 0.5, lx, fy + 18, lr);
      if (nf > 0.5) { lens.addColorStop(0, "#fffbe8"); lens.addColorStop(1, "#ffd97a"); }
      else { lens.addColorStop(0, "#ffffff"); lens.addColorStop(1, mix("#9aa6b6", "#4a5260", nf)); }
      ctx.fillStyle = lens;
      ctx.beginPath(); ctx.arc(lx, fy + 18, lr, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#f5a524";                                  // indicator
    rr(ctx, ox + 60, fy + 15, 10, 4, 2); ctx.fill();
    // fog lamp low on the bumper corner
    ctx.fillStyle = "#14161a";
    ctx.beginPath(); ctx.arc(ox + 26, B.y + B.h - 14, 6, 0, 7); ctx.fill();
    ctx.fillStyle = nf > 0.5 ? "#fff1c4" : mix("#d9dee6", "#4a5260", nf);
    ctx.beginPath(); ctx.arc(ox + 26, B.y + B.h - 14, 3.8, 0, 7); ctx.fill();
    ctx.restore();
  }
  // wide chrome grille: frame, dark mesh, three bright slats
  const GR = { x: B.x + 88, y: fy + 4, w: B.w - 176, h: 28 };
  ctx.fillStyle = chromeV(GR.y, GR.y + GR.h);
  rr(ctx, GR.x - 3, GR.y - 3, GR.w + 6, GR.h + 6, 10); ctx.fill();
  ctx.fillStyle = "#121418";
  rr(ctx, GR.x, GR.y, GR.w, GR.h, 8); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const sy = GR.y + 4 + k * 8;
    ctx.fillStyle = chromeV(sy, sy + 4);
    rr(ctx, GR.x + 4, sy, GR.w - 8, 4, 2); ctx.fill();
  }
  // round emblem: chrome ring on a dark disc with the line's monogram
  const emX = B.x + B.w / 2, emY = GR.y + GR.h / 2;
  ctx.fillStyle = "#121418";
  ctx.beginPath(); ctx.arc(emX, emY, 13, 0, 7); ctx.fill();
  ctx.strokeStyle = chromeV(emY - 12, emY + 12);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(emX, emY, 11, 0, 7); ctx.stroke();
  ctx.fillStyle = mix("#eef2f7", "#8a929e", nf);
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.fillText("MY", emX, emY + 0.5);
  // licence plate under the grille
  const plY = B.y + B.h - 17;
  ctx.fillStyle = mix("#f4f6fa", "#8a909b", nf * 0.8);
  rr(ctx, B.x + B.w / 2 - 30, plY, 60, 13, 2); ctx.fill();
  ctx.fillStyle = mix("#2d6fd1", "#1d3a6a", nf);
  rr(ctx, B.x + B.w / 2 - 30, plY, 7, 13, 2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1;
  rr(ctx, B.x + B.w / 2 - 30, plY, 60, 13, 2); ctx.stroke();
  ctx.fillStyle = "#1b1e24";
  ctx.font = "bold 8px ui-monospace, Menlo, monospace";
  ctx.fillText(`34 MY ${String(b.id % 1000).padStart(3, "0")}`, B.x + B.w / 2 + 3, plY + 7);
  ctx.lineWidth = 1;

  // --- the windshield cells: dirt, suds, shine. 600 cells of 8.4×12.5 are
  // batched into one path per quantized shade, so the fine grid stays cheap
  const cw = Wd.w / Wd.cols, chh = Wd.h / Wd.rows;
  const q10 = v => Math.min(9, Math.max(0, Math.round(v * 10) - 1));
  const gV = new Array(10), gR = new Array(10), gS = new Array(10), sR = new Array(10),
        sB = new Array(30), shine = [];
  for (let r = 0; r < Wd.rows; r++) {
    for (let c = 0; c < Wd.cols; c++) {
      const i = r * Wd.cols + c;
      const x0 = Wd.x + c * cw, y0 = Wd.y + r * chh;
      const g = w.g[i], f = w.f[i];
      if (g > 0.02) {
        const av = Math.min(1, 0.92 * g); // grime clouds the glass — the cabin fades out behind it
        (gV[q10(av)] || (gV[q10(av)] = [])).push(x0, y0);
        // mottled grime: each cell's own stable thickness, heavier toward the bottom edge
        const a = Math.min(1, 0.75 * g * (0.72 + 0.4 * hsh(i) + 0.12 * r / Wd.rows));
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
      if (g < 0.1 && f < 0.1 && hsh(i * 3.7) > 0.985) // a scattered glint on sparkling glass
        shine.push(x0 + cw * 0.85, y0 + chh * 0.1, x0 + cw * 0.1, y0 + chh * 0.9);
    }
  }
  ctx.fillStyle = mix("#5a7ea6", "#1f2b44", nf * 0.75);
  for (let s = 0; s < 10; s++) {
    if (!gV[s]) continue;
    ctx.globalAlpha = 0.1 * (s + 1);
    ctx.beginPath();
    for (let k = 0; k < gV[s].length; k += 2) ctx.rect(gV[s][k], gV[s][k + 1], cw, chh);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
    if (s >= 15) { // the fuller bubbles get a soft rim, so suds read as foam, not paint
      ctx.strokeStyle = `rgba(150, 190, 220, ${(0.04 * (Math.floor(s / 3) + 1)).toFixed(2)})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
  if (shine.length) {
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < shine.length; k += 4) {
      ctx.moveTo(shine[k], shine[k + 1]);
      ctx.lineTo(shine[k + 2], shine[k + 3]);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // glass reflections over everything on the windshield
  ctx.save();
  rr(ctx, Wd.x, Wd.y, Wd.w, Wd.h, 4); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(Wd.x + 30, Wd.y); ctx.lineTo(Wd.x + 110, Wd.y);
  ctx.lineTo(Wd.x + 10, Wd.y + Wd.h); ctx.lineTo(Wd.x - 70, Wd.y + Wd.h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.moveTo(Wd.x + 130, Wd.y); ctx.lineTo(Wd.x + 152, Wd.y);
  ctx.lineTo(Wd.x + 52, Wd.y + Wd.h); ctx.lineTo(Wd.x + 30, Wd.y + Wd.h);
  ctx.closePath(); ctx.fill();
  if (w.done) { // a glint sweeps across the finished glass
    const t = (now % 2600) / 2600;
    const gx = Wd.x - 120 + t * (Wd.w + 240);
    const gl = ctx.createLinearGradient(gx - 40, 0, gx + 40, 0);
    gl.addColorStop(0, "rgba(255,255,255,0)");
    gl.addColorStop(0.5, "rgba(255,255,255,0.14)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.moveTo(gx - 10, Wd.y); ctx.lineTo(gx + 50, Wd.y);
    ctx.lineTo(gx - 10, Wd.y + Wd.h); ctx.lineTo(gx - 70, Wd.y + Wd.h);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // parked wipers resting along the bottom of the glass
  for (const [wx0, len] of [[Wd.x + 34, 104], [Wd.x + Wd.w / 2 + 22, 104]]) {
    const wy0 = Wd.y + Wd.h + 13;
    ctx.strokeStyle = "#16181d";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(wx0, wy0); ctx.lineTo(wx0 + len, wy0 - 9); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(wx0 + 14, wy0 - 3); ctx.lineTo(wx0 + len + 4, wy0 - 11); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = mix("#3a3f48", "#1b1e24", nf);
    ctx.beginPath(); ctx.arc(wx0, wy0, 4, 0, 7); ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // --- the two tool stations
  // no stand or box: the tools sit straight on the wet pad, a label below
  // them, and a pulsing floor ring under the one in hand
  const station = (R, title, sel) => {
    if (sel) {
      ctx.strokeStyle = `rgba(120, 225, 255, ${0.35 + 0.45 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(R.x + R.w / 2, R.y + R.h - 12, R.w * 0.52, 14, 0, 0, 7); ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = sel ? "rgba(160,230,255,0.95)" : "rgba(236,242,250,0.85)";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, R.x + R.w / 2, R.y + R.h + 20);
    if (sel) {
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillStyle = `rgba(160, 230, 255, ${0.6 + 0.4 * pulse})`;
      ctx.fillText("ELİNDE — basılı tut & sürükle", R.x + R.w / 2, R.y + R.h + 34);
    }
    ctx.restore();
  };
  // a long-handled brush: wood handle, block, bristles, a crown of suds
  const drawBrush = (hy0, hLen, headY, sudsN) => {
    const hg = ctx.createLinearGradient(-5, 0, 5, 0);
    hg.addColorStop(0, "#6e4520"); hg.addColorStop(0.5, "#a8743f"); hg.addColorStop(1, "#6e4520");
    ctx.fillStyle = hg;
    rr(ctx, -5, hy0, 10, hLen, 4); ctx.fill();
    ctx.fillStyle = "#e9c25a";
    rr(ctx, -25, headY - 6, 50, 9, 3); ctx.fill();
    ctx.strokeStyle = "rgba(120, 84, 20, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -21; k <= 21; k += 4) { ctx.moveTo(k, headY - 5); ctx.lineTo(k, headY + 2); }
    ctx.stroke();
    const bg = ctx.createLinearGradient(0, headY + 2, 0, headY + 16);
    bg.addColorStop(0, "#9a6533"); bg.addColorStop(1, "#6b421d");
    ctx.fillStyle = bg;
    rr(ctx, -27, headY + 2, 54, 14, 6); ctx.fill();
    for (let k = 0; k < sudsN; k++) {
      const r = 3 + (k % 3);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath(); ctx.arc(-20 + k * (40 / (sudsN - 1)), headY - 6 - (k % 2) * 2, r, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(170, 215, 240, 0.5)";
      ctx.beginPath(); ctx.arc(-20 + k * (40 / (sudsN - 1)) + r * 0.3, headY - 6 - (k % 2) * 2 + r * 0.35, r * 0.45, 0, 7); ctx.fill();
    }
  };

  // soap bucket + the long-handled brush, leaning on it
  station(Br, "🧼 FIRÇA — köpük", w.tool === "brush");
  const bcx = Br.x + 52, bcy = Br.y + Br.h - 34;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(bcx + 6, bcy + 18, 34, 6, 0, 0, 7); ctx.fill();
  const bk = ctx.createLinearGradient(bcx - 24, 0, bcx + 24, 0);
  bk.addColorStop(0, "#1f4669"); bk.addColorStop(0.35, "#3f7fb6"); bk.addColorStop(1, "#1b3d5c");
  ctx.fillStyle = bk;
  ctx.beginPath();
  ctx.moveTo(bcx - 24, bcy - 12); ctx.lineTo(bcx + 24, bcy - 12);
  ctx.lineTo(bcx + 19, bcy + 16); ctx.lineTo(bcx - 19, bcy + 16);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bcx - 22, bcy - 2); ctx.lineTo(bcx + 22, bcy - 2);
  ctx.moveTo(bcx - 20.5, bcy + 9); ctx.lineTo(bcx + 20.5, bcy + 9);
  ctx.stroke();
  ctx.strokeStyle = "#a9b2bf";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(bcx, bcy - 10, 23, 16, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  ctx.fillStyle = "#5c93c6";
  ctx.beginPath(); ctx.ellipse(bcx, bcy - 12, 25, 5.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#8fe3f2";
  ctx.beginPath(); ctx.ellipse(bcx, bcy - 12, 21, 4, 0, 0, 7); ctx.fill();
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath(); ctx.arc(bcx - 15 + k * 6, bcy - 14 - (k % 2) * 2, 2.5 + (k % 3), 0, 7); ctx.fill();
  }
  for (let k = 0; k < 3; k++) { // bubbles drifting up off the bucket
    const t = (now / 1800 + k / 3) % 1;
    ctx.strokeStyle = `rgba(220, 245, 255, ${0.7 * (1 - t)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bcx - 8 + k * 9 + Math.sin(now / 400 + k) * 3, bcy - 20 - t * 46, 2 + 2 * t, 0, 7); ctx.stroke();
  }
  ctx.save();
  ctx.translate(bcx + 40, bcy + 26);
  ctx.rotate(-0.55);
  drawBrush(-88, 88, -98, 5);
  ctx.restore();

  // a tap on a standpipe out of the pad, the hose coiled on the floor beside it
  station(Hs, "💧 HORTUM — durula", w.tool === "hose");
  const base = Hs.y + Hs.h - 14;                // where the pipe meets the floor
  const fcx = Hs.x + 118, fcy = base - 62;
  const ccx = Hs.x + 58;                        // coil centre
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(ccx, base - 2, 54, 12, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(fcx + 3, base + 1, 16, 4, 0, 0, 7); ctx.fill();
  const chrome = ctx.createLinearGradient(fcx - 14, 0, fcx + 14, 0);
  chrome.addColorStop(0, mix("#7c8696", "#2c333e", nf));
  chrome.addColorStop(0.4, mix("#e6ebf2", "#5a6370", nf));
  chrome.addColorStop(1, mix("#7c8696", "#2c333e", nf));
  ctx.fillStyle = mix("#2a313c", "#161b22", nf);
  ctx.beginPath(); ctx.ellipse(fcx, base, 11, 3.5, 0, 0, 7); ctx.fill();   // floor flange
  ctx.fillStyle = chrome;
  rr(ctx, fcx - 4, fcy - 10, 8, base - fcy + 10, 3); ctx.fill();          // standpipe
  ctx.fillStyle = chrome;
  rr(ctx, fcx - 6, fcy - 18, 12, 26, 3); ctx.fill();
  rr(ctx, fcx - 14, fcy + 4, 28, 10, 3); ctx.fill();
  ctx.fillStyle = "#3f7fd4";
  rr(ctx, fcx - 3, fcy + 14, 6, 7, 2); ctx.fill();
  ctx.fillStyle = "#2f6fc4";
  rr(ctx, fcx - 13, fcy - 23, 26, 6, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(fcx, fcy - 20, 4, 0, 7); ctx.fill();
  if (w.tool !== "hose") { // the coil is connected to the tap while it hangs here
    hoseStroke(o => { ctx.beginPath(); ctx.moveTo(fcx, fcy + 20 + o); ctx.quadraticCurveTo(fcx - 6, base - 16 + o, ccx + 40, base - 20 + o); });
  } else { // a slow drip from the open tap
    const t = (now / 900) % 1;
    ctx.fillStyle = `rgba(140, 210, 255, ${0.85 * (1 - t * 0.6)})`;
    ctx.beginPath(); ctx.ellipse(fcx, fcy + 23 + t * 22, 1.8, 2.6, 0, 0, 7); ctx.fill();
  }
  for (let k = 0; k < 4; k++) { // flat loops piled on the floor, bottom one first
    const cy = base - 6 - k * 5, rx = 46 - k * 5;
    hoseStroke(o => { ctx.beginPath(); ctx.ellipse(ccx, cy + o, rx, 12 - k, 0, 0, 7); });
  }

  // --- the active tool, following the pointer (nothing when none is in hand)
  const px = pointer.x, py = pointer.y;
  if (w.tool === "brush") {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.6);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    rr(ctx, -24, -14, 54, 18, 9); ctx.fill();      // soft contact shadow on the glass
    drawBrush(-8, 96, -22, 6);
    ctx.restore();
  } else if (w.tool === "hose") {
    // the hose drapes from the faucet to the nozzle at the pointer
    drawHoseLine(fcx, fcy + 20, px, py);
    if (pointerDown && !w.done) drawHoseSpray(px, py, now);
    drawHoseNozzle(px, py);
  }

  // --- status: how much grime and suds remain, and which step is up
  const n = w.g.length;
  const gAvg = w.g.reduce((a, v) => a + v, 0) / n;
  const fAvg = w.f.reduce((a, v) => a + v, 0) / n;
  const P = { x: 679, y: 18, w: 220, h: 84 }; // top right, centred over the hose station
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  const sg = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
  sg.addColorStop(0, mix("#1d2734", "#121924", nf));
  sg.addColorStop(1, mix("#121821", "#0b1018", nf));
  ctx.fillStyle = sg;
  rr(ctx, P.x, P.y, P.w, P.h, 12); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = w.done ? `rgba(143, 227, 242, ${0.35 + 0.25 * pulse})` : "rgba(255,255,255,0.12)";
  rr(ctx, P.x, P.y, P.w, P.h, 12); ctx.stroke();
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(226,235,248,0.8)";
  ctx.fillText(`KİR ${Math.round(gAvg * 100)}%`, P.x + 16, P.y + 24);
  ctx.fillStyle = `rgba(143, 227, 242, ${fAvg < 0.05 ? 0.35 : 1})`;
  ctx.fillText(`KÖPÜK ${Math.round(fAvg * 100)}%`, P.x + 112, P.y + 24);
  const bar = { x: P.x + 16, y: P.y + 34, w: P.w - 32, h: 10 };
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  rr(ctx, bar.x, bar.y, bar.w, bar.h, 5); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  rr(ctx, bar.x, bar.y, bar.w, bar.h, 5); ctx.stroke();
  if (gAvg < 1) {
    const fw = bar.w * (1 - gAvg);
    const bg2 = ctx.createLinearGradient(bar.x, 0, bar.x + bar.w, 0);
    bg2.addColorStop(0, "#3cc878"); bg2.addColorStop(1, "#8ff0b4");
    ctx.fillStyle = bg2;
    rr(ctx, bar.x, bar.y, fw, bar.h, 5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    rr(ctx, bar.x + 2, bar.y + 1.5, Math.max(0, fw - 4), 3, 1.5); ctx.fill();
  }
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = w.done ? "#8fe3f2" : fAvg < 0.5 ? "rgba(255,220,150,0.95)" : "rgba(226,235,248,0.85)";
  ctx.fillText(
    w.done ? "✨ Pırıl pırıl — şoför bunu fark edecek"
      : fAvg < 0.5 ? "1 · ön camı köpükle (fırça)"
      : "2 · köpüğü durula (hortum)",
    P.x + 16, P.y + 66, P.w - 32);

  // sparkles over a finished windshield
  if (w.done) {
    ctx.fillStyle = "#fff";
    for (let k = 0; k < 5; k++) {
      const u = ((k * 53) % 10) / 10, v = ((k * 29) % 10) / 10;
      const tw = Math.abs(Math.sin(now / 300 + k * 1.7));
      const sx = Wd.x + 8 + u * (Wd.w - 16), sy = Wd.y + 2 + v * (Wd.h - 12), r = 1.5 + 3 * tw;
      ctx.globalAlpha = 0.15 + 0.45 * tw;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r);
      ctx.quadraticCurveTo(sx, sy, sx + r, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + r);
      ctx.quadraticCurveTo(sx, sy, sx - r, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- exit back to the layover
  const eg = ctx.createLinearGradient(0, Ex.y, 0, Ex.y + Ex.h);
  eg.addColorStop(0, mix("#26394b", "#152030", nf));
  eg.addColorStop(1, mix("#1a2836", "#0e1621", nf));
  ctx.fillStyle = eg;
  rr(ctx, Ex.x, Ex.y, Ex.w, Ex.h, 10); ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(120, 225, 255, ${0.35 + 0.3 * pulse})`;
  rr(ctx, Ex.x, Ex.y, Ex.w, Ex.h, 10); ctx.stroke();
  ctx.fillStyle = "rgba(226,235,248,0.9)";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚪 ÇIKIŞ (E)", Ex.x + Ex.w / 2, Ex.y + Ex.h / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// A guest leaves the stall and joins the payment line.
function enterCounter(p) {
  // Belt & braces: a guest joins a payment line once per visit — if one is
  // somehow already in a line, the second join would strand a stale entry
  // (finalizePayment releases from the first queue only, then breaks).
  if (facilities.C.queue.includes(p) || facilities.C.queue2.includes(p)) return;
  p.bill = pick(BILL_POOL);
  p.owed = p.bill - WC_PRICE;
  p.changeGiven = 0;
  p.changeNotes = [];
  p.cologne = false;
  p.colognePrev = null;
  p.payT = 0; p.doneT = 0; p.dripT = 0;
  // An exact ₺20 bill needs no change, no cologne, no clicks: this guest
  // joins the separate exact-pay line (queue2) and settles on their own.
  p.auto = p.owed <= 0;
  const q = p.auto ? facilities.C.queue2 : facilities.C.queue;
  p.patience = 12 + 5 * q.length; // further back = more patience
  p.state = p.auto ? "queueC2" : "queueC";
  q.push(p);
}

function stepCounter(timeDt) {
  const f = facilities.C;
  stepCQueue(f, f.queue, false, timeDt);   // the line you work: change + cologne
  stepCQueue(f, f.queue2, true, timeDt);   // exact-₺20 guests: they pay themselves
}

// One payment line at the counter. `auto` is the separate exact-₺20 line:
// it needs no player at all — no change to hand back, no cologne to offer,
// and the front guest settles on their own at their own spot (updatePax
// counts payT there and finalizes). Every other rule is shared: the line
// loses 1/s of patience (0.5/s once settled at the counter), and a guest
// mid-transaction (payC / payC2) has handed over their bill, so patience is
// frozen while they settle.
function stepCQueue(f, q, auto, timeDt) {
  const qState = auto ? "queueC2" : "queueC";
  const pState = auto ? "payC2" : "payC";
  for (let i = q.length - 1; i >= 0; i--) {
    const p = q[i];
    if (p.state !== qState && p.state !== pState) continue; // stale entry (an old save)
    if (p.state === qState) p.waitTotal += timeDt;
    if (p.state !== pState) p.patience -= (p.state === qState ? 1 : 0.5) * timeDt;
    if (p.patience <= 0) { q.splice(i, 1); stormOut(p); continue; }
    // Line grace: 5–10 in-game minutes to settle the payment, then out the
    // door. Set here when the guest's bus has started boarding (boardAt)
    // while they're still in the line — this keeps the counter line moving
    // mid-stop (abandoners head for the door and can't rejoin). When the bus
    // is ready to depart (stopEnd) its __hurry pass switches the bus to a
    // single SHARED 5–10 min deadline (__lineDeadline) that every counter
    // guest of that bus obeys; a late line entrant joins that same deadline
    // rather than drawing a fresh window of their own, so the bus never waits
    // longer than one 5–10 min window after it is ready. Expiry below then
    // lets paid guests off or sends unpaid ones to board — except the FRONT
    // guest mid-transaction, who keeps the same protection as their frozen
    // patience (see the exemption in the expiry check below). The AUTO line
    // is exempt from the whole grace window: it needs no player action, so
    // it always drains on its own — sweeping it would let exact guests board
    // without ever paying, which the exact line must never do.
    const bus = findBusOf(p);
    if (bus && bus.state === "stop" && reached(p.boardAt) && p.leaveLineAt == null && !auto)
      p.leaveLineAt = (bus.__hurry && bus.__lineDeadline != null)
        ? bus.__lineDeadline
        : S.time + rand(5 / 60, 10 / 60);
    if (p.leaveLineAt != null && reached(p.leaveLineAt)) {
      if (auto) continue; // self-serving line — it keeps draining, never abandoned
      // Mid-transaction exemption: a guest at the pay spot has handed over
      // their bill, so an expired deadline must not yank them off mid-change.
      // (Without it, making the same ₺30 change as 10+10+10 instead of
      // 10+20 costs one extra click and could lose the deadline race — the guest
      // storms out at -15 sat, drags reputation down, and the in-flight chip
      // click lands on the replacement guest as overpaid change. The bus
      // waits only for this one open transaction; the line behind is still
      // swept, and the 1-hour hard cap is the ultimate backstop.)
      if (i === 0 && (p.state === "payC" || p.state === "dripC")) continue;
      q.splice(i, 1);
      if (p.changeGiven >= p.owed) finalizePayment(p); // already paid — let them off
      else giveUpLine(p);
    }
  }
  // the front of the line steps up to the pay spot
  const front = q[0];
  if (!front) return;
  if (front.state === qState) {
    front.state = pState;
    front.payT = 0;
    front.patience = 12;
    if (!auto && front.owed <= 0) finalizePayment(front); // exact bill — nothing to do, out the door
    // auto front: pays by itself once it's at its spot — updatePax counts
    // payT there and finalizes, so this line never blocks on the player.
  }
  if (!auto) {
    if (front.state === "dripC") {
      front.dripT -= timeDt;
      if (front.dripT <= 0) { front.state = front.colognePrev || "payC"; front.colognePrev = null; }
    }
    // Backstop only: live guests finalize the instant they're settled, so
    // doneC never rests. This clears a doneC guest restored from an old save.
    if (front.state === "doneC") finalizePayment(front);
  }
}

// The fewest ₺10/₺20/₺50 bills that make a given change — greedy is optimal
// for these denominations: ₺30 → 2 bills (10+20), ₺80 → 3 bills (10+20+50).
function minNotes(owed) {
  let n = 0, r = Math.max(0, owed);
  for (const d of [50, 20, 10]) { const k = Math.floor(r / d); n += k; r -= k * d; }
  return n;
}

// The final rating, settled when the payment is done.
function finalSat(p) {
  let sat = p.useSat != null ? p.useSat : SAT_BASE;
  sat -= Math.max(0, p.waitTotal - 12) * 0.5;
  // The guest counts the bills they get back: same TOTAL, different rating.
  // Crisp change (the fewest bills, 10+20) earns the full bonus; every extra
  // bill beyond that (10+10+10) dents it, and a fistful of tiny bills
  // (10×8 for ₺80) drags the rating below baseline for real.
  const extra = Math.max(0, (p.changeNotes || []).length - minNotes(p.owed));
  if (p.changeGiven === p.owed) sat += Math.max(-15, 10 - 6 * extra);
  else if (p.changeGiven > p.owed) sat -= 6 + 2 * extra; // overpaid — and sloppy
  if (p.cologne) sat += 8;
  return clamp(sat + rand(-8, 8), 0, 100);
}

function finalizePayment(p) {
  for (const q of [facilities.C.queue, facilities.C.queue2]) {
    const i = q.indexOf(p);
    if (i >= 0) { q.splice(i, 1); break; }
  }
  // Teach the crisp-change rule: the same total in more bills rates worse.
  if (p.owed > 0 && p.changeGiven === p.owed &&
      (p.changeNotes || []).length > minNotes(p.owed))
    toast("🤏 Para üstü verildi ama bir avuç bozuk banknotla — misafir fark etti", "bad");
  finishVisit(p, finalSat(p), true); // change in hand — walk out through the EXIT door
}

function stormOut(p) {
  // Left the payment queue without paying: notification only. Not a runaway
  // — no red badge, never catchable — they simply walk out and board.
  p.unpaid = true; // used the toilet, paid nothing (the fee is lost)
  if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
  toast("Bir misafir öfkeyle gişeden çıktı — ödeme yok", "bad");
  finishVisit(p, clamp((p.useSat != null ? p.useSat : 60) - 20, 15, 60));
}

// Their bus is leaving and the line still isn't clear: the guest abandons
// the payment and walks straight to the boarding door.
function giveUpLine(p) {
  // The bus is rolling and the guest abandons the payment queue without
  // paying: notification only. Not a runaway — no badge, never catchable —
  // they sprint for the boarding door.
  p.unpaid = true; // used the toilet, paid nothing (the fee is lost)
  if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
  toast("Bir misafir öfkeyle gişeden çıktı — ödeme yok", "bad");
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
  if (!Array.isArray(front.changeNotes)) front.changeNotes = []; // saves from before note tracking
  front.changeNotes.push(d);
  front.changeGiven += d;
  // The moment the owed change is handed back the guest is done — no loiter:
  // they leave immediately so the line never waits on a settled guest.
  if (front.changeGiven >= front.owed) finalizePayment(front);
}

// You splash cologne on the guest at the counter (called on bottle clicks).
function offerCologne() {
  const front = facilities.C.queue[0];
  if (S.bottle <= 0) { toast("🧴 Kolonya şişesi boş — gece yarısı dolacak", ""); return; }
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
  // Toilet visits move reputation twice as hard as diner visits — guests
  // remember a filthy WC far longer than a lukewarm coffee.
  S.rep = clamp(S.rep + (sat - 50) * (p.wcUsed ? 0.04 : 0.02), 0, 100);
  p.wcUsed = false;

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
    p.wcUsed = true;
    p.unpaid = true; // the visit was interrupted — the fee is never collected
    if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
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
  // your tea on the counter: sipped down over TEA_HOURS; a fresh glass comes
  // only when you order one on the intercom
  S.tea = Math.max(0, S.tea - timeDt / SECONDS_PER_HOUR / TEA_HOURS);
  if (S.teaOrder != null) {
    S.teaOrder -= timeDt / SECONDS_PER_HOUR;
    if (S.teaOrder <= 0) { S.teaOrder = null; S.tea = 1; toast("🍵 Taze çay geldi!", "good"); }
  }
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
      if (b.v == null) b.v = BUS_V;
      if (b.holdT > 0) {
        b.holdT -= dt; b.v = 0; b.brake = true;
      } else {
        const vT = driveTarget(b);
        b.brake = b.v > vT + 0.2;
        b.v = b.v < vT ? Math.min(vT, b.v + BUS_ACC * dt) : Math.max(vT, b.v - 3 * BUS_BRAKE * dt);
      }
      const step = b.v * dt;
      b.cx += step;
      b.cy = lerp(b.cy, LANE_CY, Math.min(1, dt * 3));
      b.ang = lerp(b.ang, 0, Math.min(1, dt * 5));
      // Entry is purely geometric (baySlotFor: the bus has reached a free
      // bay's turn-in point) — no time gate, so entry works at any time scale.
      if (!b.stoppedOnce) {
        const si = baySlotFor(b, step + 2);
        if (si >= 0 && b.cx >= enterGeom(b, si).x0) beginEnter(b, si);
      }
      // Only cull buses still driving: a coarse step (a 100x/200x frame on a
      // busy tab moves a bus 185·10 = 1850px) can carry an inbound bus past
      // every bay threshold AND the removal line in the same step — the
      // beginEnter above already switched its state, so without this guard the
      // just-parked bus would be spliced off the scene.
      if (b.state === "drive" && b.cx - b.len / 2 > Wdyn - offX + 60) buses.splice(i, 1);
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
        // the bus up by at most that one 5–10 min window — plus whatever it
        // takes to finish the single open transaction at the counter.
        // The 1-hour hard cap below stays as the backstop.
        b.__hurry = true;
        let lineDeadline = null;
        for (const p of b.pax) {
          if (p.state === "bus" || p.state === "board") continue; // aboard / already walking
          const cAuto = p.state === "queueC2" || p.state === "payC2"; // exact-₺20 line — pays itself
          if (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC" || cAuto) {
            if (!cAuto) {
              if (lineDeadline == null)
                lineDeadline = S.time + rand(5 / 60, 10 / 60); // one grace draw per bus, from the ready moment
              p.leaveLineAt = lineDeadline; // shared by all manual counter pax — any earlier per-guest grace is overwritten
            }
            continue; // cAuto: the exact line drains on its own — no deadline needed
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
          for (const q of [facilities.C.queue, facilities.C.queue2]) {
            const qi = q.indexOf(p);
            if (qi >= 0) { q.splice(qi, 1); giveUpLine(p); }
          }
        }
        toast("⏱ Terminalde bir saat oldu — otobüs ne olursa olsun kalkıyor", "bad");
        endStop(b);
      }
    } else if (b.state === "enter") {
      b.stopElapsed = (b.stopElapsed || 0) + timeDt; // dwell clock keeps running
      const g = enterGeom(b, b.slot);
      const done = moveAlong(b, dt, g.L, BUS_TURN_V, BUS_ACC, BUS_BRAKE * 0.6);
      Object.assign(b, enterPose(g, b.mv.s));
      if (done) finishEnter(b);
    } else { // "exit" — backing out of the stall onto the lane
      const g = exitGeom(b);
      const done = moveAlong(b, dt, g.L, BUS_REV_V, 30, 45);
      Object.assign(b, exitPose(g, b.mv.s));
      if (done) finishExit(b);
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
    moveToward(p, stallBay(ti).x + 26, 224, 100 * dt);
    // the door shuts only once the guest has stepped in — before that the
    // leaf stays ajar and the guest is visible walking off to their bay
    if (Math.hypot(p.x - (stallBay(ti).x + 26), p.y - 224) < 8) p.inStall = true;
    return;
  }
  if (p.state === "queueC2" || p.state === "payC2") {
    // The exact-₺20 line — the player never touches it: its own queue slots,
    // its own pay spot, its own payment (see enterCounter / stepCQueue).
    const cqi2 = facilities.C.queue2.indexOf(p);
    if (p.state === "queueC2") {
      if (cqi2 === -1) { p.state = "free"; p.idleT = rand(0.5, 2); return; }
      const s = queueSlot2(cqi2);
      moveToward(p, s.x, s.y, 100 * dt);
      return;
    }
    moveToward(p, PAY_SPOT2.x, PAY_SPOT2.y, 100 * dt);
    if (Math.hypot(p.x - PAY_SPOT2.x, p.y - PAY_SPOT2.y) < 4) {
      p.payT += timeDt; // at their spot: the bill is handed in, the till takes it…
      if (p.payT >= 1) finalizePayment(p); // …the exact payment settles on its own, out the door
    }
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
  if (p.state === "scrubC") return; // caught — stepScrub drives them (real time)
  if (p.state === "leaveC") {
    // Paid, change in hand: stroll to the EXIT door, then out to the lot.
    // (A runaway reuses this state too — they never paid, so they dash at
    // EVADE_WALK per REAL second, so the chase stays fair at any speed tier.
    // Queue-leavers never reach this state: finishVisit snaps them outside.)
    // Everyone walks the whole way, even if their bus is already boarding —
    // the bus waits for them (allAbroad), and a runaway stays catchable.
    const bus = findBusOf(p);
    moveToward(p, DOOR_IN.x, DOOR_IN.y, p.runaway ? EVADE_WALK * dt / speed : 100 * dt);
    if (Math.hypot(p.x - DOOR_IN.x, p.y - DOOR_IN.y) < 8) {
      p.x = 852; p.y = 169;    // step out onto the outdoor side
      p.runaway = false;       // crossed the EXIT — the escape succeeded
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
  return p.state === "serveT" || p.state === "leaveC" || p.state === "scrubC" || p.state === "queueC" ||
         p.state === "payC" || p.state === "doneC" || p.state === "dripC" ||
         p.state === "queueC2" || p.state === "payC2";
}
function queueSlot(i) {
  // a single line walking up toward the counter, just behind the glass
  const y = Math.max(236, 332 - i * 20);
  const x = 560 + (i === 0 ? 0 : i % 2 ? -28 : 28);
  return { x, y };
}
function queueSlot2(i) {
  // the second line (exact-₺20 guests) — open floor left of the main line,
  // walking up toward the counter and the EXIT door above it
  const y = Math.max(236, 332 - i * 20);
  const x = 462 + (i === 0 ? 0 : i % 2 ? -22 : 22);
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
    cars.push({ x: Wdyn - offX + 40, y: 462, hue: randInt(0, 359), v: -rand(120, 190) });
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    cars[i].x += cars[i].v * dt;
    if (cars[i].x < -offX - 80) cars.splice(i, 1);
  }
}

/* ------------------------------ Rendering --------------------------- */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const stars = [];
// Stars spread across the current logical width (denser the wider the view
// is); t/tw drive the wash view's twinkle.
function seedStars() {
  stars.length = 0;
  const n = Math.round(60 * Wdyn / W);
  for (let i = 0; i < n; i++)
    stars.push({ x: -offX + Math.random() * Wdyn, y: Math.random() * 80, s: Math.random() * 1.6 + 0.4, t: Math.random() * 7, tw: Math.random() * 2 + 0.5 });
}

function resize() {
  // Size the backing buffer from the *stage* box, not the canvas box: the
  // stage is sized by the grid (style.css) and never by the canvas, so this
  // can't feed back into layout — that feedback loop used to shrink the scene
  // on phones. It also applies the same 16:9 fit the CSS does, so the buffer
  // matches the display box exactly.
  const box = (canvas.parentElement || canvas).getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // The logical canvas takes the stage's aspect ratio, at least as big as the
  // 960×540 core: wide windows get extra logical width (more sky/lot/road),
  // tall windows extra height (more sky/grass). The core stays centered, so
  // the scene fills the stage instead of letterboxing.
  const a = box.width / box.height;
  if (a > W / H)      { Wdyn = H * a; Hdyn = H; }
  else if (a < W / H) { Wdyn = W; Hdyn = W / a; }
  else                { Wdyn = W; Hdyn = H; }
  offX = (Wdyn - W) / 2;
  offY = (Hdyn - H) / 2;
  if (Math.abs(Wdyn - lastWdyn) + Math.abs(Hdyn - lastHdyn) > 2) {
    seedStars();
    lastWdyn = Wdyn; lastHdyn = Hdyn;
  }
  // Sharp, window-sized buffer (device px): 1:1 with the stage, capped at
  // 2× the logical size so huge displays don't blow the memory budget.
  scaleK = Math.min(2, (box.width * dpr) / Wdyn);
  canvas.width = Math.max(1, Math.round(Wdyn * scaleK));
  canvas.height = Math.max(1, Math.round(Hdyn * scaleK));
  // Explicit CSS size: fills the stage when possible; centered (stage grid)
  // with the black frame around it when the cap bites.
  canvas.style.width = (Wdyn * scaleK / dpr) + "px";
  canvas.style.height = (Hdyn * scaleK / dpr) + "px";
  // Draw the core centered inside the logical canvas.
  ctx.setTransform(scaleK, 0, 0, scaleK, offX * scaleK, offY * scaleK);
}
window.addEventListener("resize", resize);
// iOS reports stale metrics mid-rotation; re-measure once the turn settles.
window.addEventListener("orientationchange", () => setTimeout(resize, 150));
// The display box can also change without a window event (CSS container-query
// sizing settles after load, dynamic-viewport URL-bar changes); keep the
// buffer matched to whatever the canvas actually renders at.
if ("ResizeObserver" in window) {
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  ro.observe(canvas.parentElement); // #stage: its size drives the buffer fit
}
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

const trees = [
  { x: 60, s: 1.1 }, { x: 150, s: 0.8 }, { x: 250, s: 1.2 }, { x: 930, s: 0.9 },
  { x: -60, s: 1.0 }, { x: -140, s: 0.85 }, { x: 1010, s: 1.15 }, { x: 1095, s: 0.8 }, // only seen on wide screens
];
const clouds = [ { x: 80, y: 30, s: 1 }, { x: 340, y: 16, s: 0.7 }, { x: 560, y: 38, s: 1.2 }, { x: 820, y: 22, s: 0.85 }, { x: 1100, y: 34, s: 1 } ];
const LAMPS = [200, 410, 902];

function drawScene() {
  if (S.view === "wc") drawWCInterior();
  else if (S.view === "wash") drawWashView();
  else drawOutdoor();
  if (viewFade > 0.001) {
    ctx.fillStyle = `rgba(6, 9, 18, ${viewFade})`;
    ctx.fillRect(-offX, -offY, Wdyn, Hdyn + offY);
  }
}

function drawOutdoor() {
  const nf = nightFactor(), now = performance.now();
  drawSky(nf, now);
  drawHills(nf);
  drawGrassBand(GRASS.top, GRASS.bot, nf, 3);
  for (const tr of trees) drawTree(tr, nf);

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
    ctx.fillRect(-offX, -offY, Wdyn, Hdyn + offY);
    drawNightLights(nf, now);
  }

  drawWcPrompt(); // after the overlay — the nudge stays bright at night
  drawWashHint(); // ditto — a dusty parked bus hints at the wash
}

const duskGlow = t => Math.max(0, 1 - Math.abs(t - 6.3) / 1.5) + Math.max(0, 1 - Math.abs(t - 19.2) / 1.8);

function drawSky(nf, now) {
  const [top, bot] = skyColors(S.time);
  const g = ctx.createLinearGradient(0, -offY, 0, GRASS.top);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(-offX, -offY, Wdyn, GRASS.top + offY);

  const dusk = Math.min(1, duskGlow(S.time));
  if (dusk > 0) {
    const hg = ctx.createLinearGradient(0, 0, 0, GRASS.top);
    hg.addColorStop(0, "rgba(255,150,90,0)");
    hg.addColorStop(1, `rgba(255,135,80,${0.55 * dusk})`);
    ctx.fillStyle = hg;
    ctx.fillRect(-offX, 0, Wdyn, GRASS.top);
  }

  if (nf > 0.3) {
    ctx.fillStyle = "#fff";
    for (const s of stars) {
      ctx.globalAlpha = 0.85 * (nf - 0.3) * (0.6 + 0.4 * Math.sin(now / 1000 * s.tw + s.t));
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  // sun / moon
  if (S.time >= 5 && S.time <= 19) {
    const f = clamp((S.time - 6) / 12, 0, 1), h = Math.sin(f * Math.PI);
    const sx = lerp(offX + 60, Wdyn - offX - 60, f), sy = 70 - h * 45;
    const halo = ctx.createRadialGradient(sx, sy, 12, sx, sy, 90);
    halo.addColorStop(0, "rgba(255,226,140,0.55)");
    halo.addColorStop(1, "rgba(255,226,140,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sx, sy, 90, 0, 7); ctx.fill();
    const disk = ctx.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 22);
    disk.addColorStop(0, "#fffbe0");
    disk.addColorStop(1, mix("#ffd75e", "#ff9248", (1 - h) * 0.85));
    ctx.fillStyle = disk;
    ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill();
  } else {
    const f = clamp(((S.time + 24 - 19) % 24) / 11, 0, 1);
    const mx = lerp(offX + 60, Wdyn - offX - 60, f), my = 66 - Math.sin(f * Math.PI) * 40;
    const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 60);
    halo.addColorStop(0, "rgba(200,215,255,0.28)");
    halo.addColorStop(1, "rgba(200,215,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(mx, my, 60, 0, 7); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, 7); ctx.clip();
    ctx.beginPath(); ctx.rect(mx - 17, my - 17, 34, 34); ctx.arc(mx + 7, my - 4, 13, 0, 7);
    ctx.fillStyle = "#eef1f8"; ctx.fill("evenodd");
    ctx.fillStyle = "rgba(150,160,190,0.45)";
    for (const [cx, cy, r] of [[-9, 3, 2.6], [-4, 10, 1.8], [-11, -5, 1.6]]) {
      ctx.beginPath(); ctx.arc(mx + cx, my + cy, r, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // drifting clouds — tinted peach at dawn/dusk, slate at night
  const cA = hex("#ffffff"), cB = hex("#ffcfb3"), cN = hex("#2a3352");
  const col = [0, 1, 2].map(i => Math.round(lerp(lerp(cA[i], cB[i], dusk), cN[i], nf)));
  const span = Wdyn + 280, drift = now * 0.004;
  ctx.globalAlpha = 0.9 - nf * 0.35;
  for (const c of clouds) {
    const x = -offX - 140 + (((c.x + offX + 140 + drift * c.s) % span) + span) % span;
    drawCloud(x, c.y, c.s, col);
  }
  ctx.globalAlpha = 1;
}

function drawCloud(x, y, s, col) {
  ctx.fillStyle = `rgb(${col})`;
  ctx.beginPath();
  ctx.arc(x, y, 13 * s, 0, 7);
  ctx.arc(x + 16 * s, y - 7 * s, 17 * s, 0, 7);
  ctx.arc(x + 36 * s, y - 2 * s, 14 * s, 0, 7);
  ctx.arc(x + 52 * s, y + 2 * s, 10 * s, 0, 7);
  ctx.fill();
  ctx.fillRect(x, y, 52 * s, 12 * s);
  ctx.fillStyle = "rgba(40,60,100,0.08)";
  ctx.fillRect(x - 6 * s, y + 7 * s, 66 * s, 5 * s);
}

function drawHills(nf) {
  // Ridges stretch with the view (smooth silhouettes hide the stretch), so the
  // ranges always meet the horizon edges.
  const ms = Wdyn / W, M = x => -offX + x * ms;
  const ridge = (pts) => {
    ctx.beginPath();
    ctx.moveTo(M(0), GRASS.top);
    for (const [x, y] of pts) ctx.lineTo(M(x), y);
    ctx.lineTo(M(W), GRASS.top);
    ctx.closePath(); ctx.fill();
  };
  // far, hazy range
  ctx.fillStyle = mix("#93b7c6", "#1b2440", nf * 0.85);
  ridge([[0, 50], [90, 34], [210, 52], [340, 24], [470, 48], [610, 30], [700, 44], [840, 20], [W, 42]]);

  // main range
  const main = [[0, 60], [140, 28], [300, 64], [430, 36], [590, 56], [740, 32], [900, 64], [W, 48]];
  const mg = ctx.createLinearGradient(0, 28, 0, GRASS.top);
  mg.addColorStop(0, mix("#4f8169", "#182238", nf * 0.8));
  mg.addColorStop(1, mix("#2f5a47", "#111a2c", nf * 0.8));
  ctx.fillStyle = mg;
  ridge(main);
  // shaded east faces + snow caps on the tall peaks
  for (let i = 1; i < main.length - 1; i++) {
    const [px, py] = main[i], [lx, ly] = main[i - 1], [rx, ry] = main[i + 1];
    if (py > ly || py > ry) continue;
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.beginPath();
    ctx.moveTo(M(px), py); ctx.lineTo(M(rx), ry); ctx.lineTo(M(rx), GRASS.top); ctx.lineTo(M(px + (rx - px) * 0.2), GRASS.top);
    ctx.closePath(); ctx.fill();
    if (py > 40) continue;
    const k = 0.26;
    const ax = px + (lx - px) * k, ay = py + (ly - py) * k;
    const bx = px + (rx - px) * k, by = py + (ry - py) * k;
    ctx.fillStyle = mix("#f3f7fb", "#4a5470", nf * 0.8);
    ctx.beginPath();
    ctx.moveTo(M(px), py); ctx.lineTo(M(bx), by);
    ctx.lineTo(M(lerp(bx, ax, 0.3)), by - 3);
    ctx.lineTo(M(lerp(bx, ax, 0.5)), (ay + by) / 2 + 3);
    ctx.lineTo(M(lerp(bx, ax, 0.72)), ay - 3);
    ctx.lineTo(M(ax), ay);
    ctx.closePath(); ctx.fill();
  }

  // near, rolling foothills
  ctx.fillStyle = mix("#4c9a5e", "#173022", nf * 0.85);
  ctx.beginPath();
  ctx.moveTo(M(0), GRASS.top); ctx.lineTo(M(0), 80);
  for (let i = 0; i < 6; i++) {
    const x0 = i * 160;
    ctx.quadraticCurveTo(M(x0 + 80), i % 2 ? 64 : 70, M(x0 + 160), 80 - (i % 3) * 3);
  }
  ctx.lineTo(M(W), GRASS.top);
  ctx.closePath(); ctx.fill();
}

function drawGrassBand(y0, y1, nf, seed) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, mix("#64bf72", "#1d3b2b", nf * 0.85));
  g.addColorStop(1, mix("#4da05d", "#163022", nf * 0.85));
  ctx.fillStyle = g;
  ctx.fillRect(-offX, y0, Wdyn, y1 - y0);
  const n = Math.min(700, Math.round((y1 - y0) * Wdyn / 700));
  ctx.strokeStyle = mix("#3c8a4c", "#122719", nf * 0.85);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = -offX + grimeRnd(i, seed) * Wdyn, y = y0 + 6 + grimeRnd(i, seed + 1) * (y1 - y0 - 8);
    ctx.moveTo(x - 2, y); ctx.lineTo(x - 3.5, y - 4);
    ctx.moveTo(x, y); ctx.lineTo(x, y - 5);
    ctx.moveTo(x + 2, y); ctx.lineTo(x + 3.5, y - 4);
  }
  ctx.stroke();
  if (nf < 0.8) { // wildflowers by day
    ctx.globalAlpha = 1 - nf;
    for (let i = 0; i < n / 5; i++) {
      ctx.fillStyle = i % 3 ? "#fff6d8" : "#ffd54f";
      ctx.fillRect(-offX + grimeRnd(i, seed + 7) * Wdyn, y0 + 5 + grimeRnd(i, seed + 8) * (y1 - y0 - 8), 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

function drawTree(tr, nf) {
  const s = tr.s, bx = tr.x, by = GRASS.bot - 24;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(bx + 5 * s, by + 2, 22 * s, 4 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = mix("#6b4a2b", "#232c33", nf * 0.7);
  ctx.fillRect(bx - 3.5 * s, by - 18 * s, 7 * s, 20 * s);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(bx, by - 18 * s, 3.5 * s, 20 * s);
  const light = mix("#38a064", "#1a3a52", nf * 0.75), dark = mix("#226e45", "#10263a", nf * 0.75);
  for (const [yb, hw, h] of [[by - 12 * s, 24 * s, 26 * s], [by - 26 * s, 19 * s, 24 * s], [by - 40 * s, 13 * s, 22 * s]]) {
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.moveTo(bx, yb - h); ctx.lineTo(bx - hw, yb); ctx.lineTo(bx + hw, yb); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(bx, yb - h); ctx.lineTo(bx + hw * 0.15, yb); ctx.lineTo(bx + hw, yb); ctx.closePath(); ctx.fill();
  }
}

// Fixed pseudo-random asphalt grain, spread over the current view width.
function drawSpeckle(y0, y1, seed) {
  const n = Math.min(900, Math.round((y1 - y0) * Wdyn / 260));
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < n; i += 2)
    ctx.fillRect(-offX + grimeRnd(i, seed) * Wdyn, y0 + grimeRnd(i, seed + 1) * (y1 - y0), 1.5, 1.5);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let i = 1; i < n; i += 2)
    ctx.fillRect(-offX + grimeRnd(i, seed) * Wdyn, y0 + grimeRnd(i, seed + 1) * (y1 - y0), 2, 2);
}

function drawLampPost(x, y, nf) {
  ctx.fillStyle = mix("#3a4252", "#1a1f2a", nf * 0.6);
  rr(ctx, x - 5, y - 4, 10, 6, 2); ctx.fill();
  ctx.fillRect(x - 1.5, y - 58, 3, 56);
  ctx.fillRect(x - 1.5, y - 60, 15, 3);
  rr(ctx, x + 6, y - 61, 15, 6, 3); ctx.fill();
  ctx.fillStyle = mix("#d7dde6", "#ffe3a0", nf);
  ctx.fillRect(x + 8, y - 56, 11, 2);
}

function drawLot() {
  const nf = nightFactor();
  const g = ctx.createLinearGradient(0, LOT.top, 0, LOT.bot);
  g.addColorStop(0, mix("#545c6b", "#1f2530", nf * 0.7));
  g.addColorStop(1, mix("#464e5c", "#1a1f29", nf * 0.7));
  ctx.fillStyle = g;
  ctx.fillRect(-offX, LOT.top, Wdyn, LOT.bot - LOT.top);
  drawSpeckle(LOT.top, LOT.bot, 11);
  // oil stains where buses idle
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (const s of BAY_SLOTS) {
    ctx.beginPath(); ctx.ellipse(s.cx - 3, 236, 9, 6, 0.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s.cx + 4, 244, 5, 3.5, -0.4, 0, 7); ctx.fill();
  }
  // curb along the building edge
  ctx.fillStyle = mix("#bcc2cb", "#3d434e", nf * 0.7);
  ctx.fillRect(-offX, LOT.top, Wdyn, 5);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(-offX, LOT.top + 5, Wdyn, 2);

  // painted stalls, open toward the road
  const paint = `rgba(255, 214, 90, ${0.78 - nf * 0.2})`;
  ctx.strokeStyle = paint;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const s of BAY_SLOTS) {
    const l = s.cx - 36, r = s.cx + 36;
    ctx.moveTo(l, LOT.bot - 8); ctx.lineTo(l, LOT_NOSE); ctx.lineTo(r, LOT_NOSE); ctx.lineTo(r, LOT.bot - 8);
  }
  ctx.stroke();
  ctx.lineJoin = "miter";
  ctx.textAlign = "center";
  ctx.font = "bold 16px system-ui";
  BAY_SLOTS.forEach((s, i) => {
    ctx.fillStyle = mix("#c9ced6", "#40464f", nf * 0.7);
    rr(ctx, s.cx - 22, LOT_NOSE + 8, 44, 6, 2); ctx.fill();
    ctx.fillStyle = paint;
    ctx.fillText(String(i + 1), s.cx, LOT.bot - 18);
  });

  // painted label + arrow toward the stalls
  ctx.textAlign = "left";
  ctx.fillStyle = `rgba(255, 214, 90, ${0.42 - nf * 0.12})`;
  ctx.font = "900 20px system-ui";
  ctx.fillText("OTOBÜS PARKI", 240, 250);
  ctx.beginPath();
  ctx.moveTo(250, 272); ctx.lineTo(340, 272); ctx.lineTo(340, 264); ctx.lineTo(360, 278);
  ctx.lineTo(340, 292); ctx.lineTo(340, 284); ctx.lineTo(250, 284);
  ctx.closePath(); ctx.fill();

  for (const lx of LAMPS) drawLampPost(lx, LOT.top + 3, nf);
}

// Highway pylon sign: tall black pole planted at the curb, white lightbox on top.
const PYLON = { x: 110, base: LOT.bot - 2, top: 26, pw: 22, bw: 136, bh: 70 };

function drawPylonFace() {
  const P = PYLON, cx = P.x, bx = cx - P.bw / 2, by = P.top;
  ctx.fillStyle = "#f7f9fc";
  ctx.fillRect(bx + 4, by + 4, P.bw - 8, P.bh - 8);
  ctx.font = "900 22px system-ui";
  const word = "MOLA YERİ";
  let tx = cx - ctx.measureText(word).width / 2;
  ctx.textAlign = "left";
  for (const ch of word) {
    ctx.fillStyle = ch === "A" ? "#e0262b" : "#1d3f8f"; // red A, like the real pylon's lettering
    ctx.fillText(ch, tx, by + 29);
    tx += ctx.measureText(ch).width;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#1d3f8f";
  ctx.font = "800 11px system-ui";
  ctx.fillText("DİNLENME TESİSİ", cx, by + 45);
  ctx.fillStyle = "#e0262b";
  ctx.fillRect(bx + 14, by + 51, P.bw - 28, 1.5);
  const stars = Math.round(S.rep / 20);
  let ss = "";
  for (let i = 0; i < 5; i++) ss += i < stars ? "★" : "☆";
  ctx.fillStyle = "#e8a317";
  ctx.font = "11px system-ui";
  ctx.fillText(ss, cx, by + 63);
  ctx.textAlign = "left";
}

function drawSign() {
  const nf = nightFactor(), P = PYLON, cx = P.x;
  const bx = cx - P.bw / 2, by = P.top, poleTop = by + P.bh;
  // footing on the curb, right by the road
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(cx + 10, P.base, 34, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = mix("#c9c3b4", "#4a4740", nf * 0.7);
  ctx.fillRect(cx - 20, P.base - 6, 40, 7);
  ctx.fillStyle = mix("#a39d8f", "#3a3833", nf * 0.7);
  ctx.fillRect(cx - 20, P.base - 1, 40, 2);
  ctx.fillStyle = "#1b1e23";
  ctx.fillRect(cx - P.pw / 2, poleTop, P.pw, P.base - 6 - poleTop);
  ctx.fillRect(bx, by, P.bw, P.bh);
  drawPylonFace();
}

const DINER_WINDOWS = [[630, 140, 26, 22], [700, 140, 26, 22], [750, 140, 26, 22]];
const WC_WINDOWS = [[826, 134, 20, 18], [858, 134, 20, 18]];

function drawWindow(x, y, w, h, top, bot, frame) {
  ctx.fillStyle = frame;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.beginPath();
  ctx.moveTo(x + 3, y + h); ctx.lineTo(x + 8, y + h); ctx.lineTo(x + 16, y); ctx.lineTo(x + 11, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = frame;
  ctx.fillRect(x + w / 2 - 0.75, y, 1.5, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x - 3, y + h + 2, w + 6, 2);
}

function drawRestStop() {
  const nf = nightFactor(), now = performance.now();
  // --- diner ---
  const red = mix("#d94f3d", "#3a2430", nf * 0.7);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(613, 170, 184, 4);
  const bg = ctx.createLinearGradient(0, 110, 0, 170);
  bg.addColorStop(0, mix("#e05a46", "#3a2430", nf * 0.7));
  bg.addColorStop(1, mix("#b8402f", "#2a1a24", nf * 0.7));
  ctx.fillStyle = bg;
  rr(ctx, 615, 110, 180, 60, 6); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let yy = 115; yy < 124; yy += 4) ctx.fillRect(615, yy, 180, 1);
  ctx.fillStyle = mix("#7d2c22", "#22141b", nf * 0.7);
  rr(ctx, 611, 106, 188, 7, 3); ctx.fill();
  // chrome kickplate
  const kp = ctx.createLinearGradient(0, 162, 0, 170);
  kp.addColorStop(0, mix("#eef2f6", "#4a505a", nf * 0.7));
  kp.addColorStop(1, mix("#98a1ac", "#2a2e36", nf * 0.7));
  ctx.fillStyle = kp;
  ctx.fillRect(615, 162, 180, 8);
  // scalloped awning
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? mix("#f6efe2", "#4a4450", nf * 0.6) : red;
    ctx.fillRect(615 + i * 18, 124, 18, 12);
    ctx.beginPath(); ctx.ellipse(615 + i * 18 + 9, 136, 9, 4, 0, 0, Math.PI); ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(615, 124, 180, 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(615, 140, 180, 3);
  // windows
  for (const [x, y, w, h] of DINER_WINDOWS)
    drawWindow(x, y, w, h, mix("#fff4d6", "#6a5634", nf * 0.5), mix("#ffd98f", "#4a3a24", nf * 0.5), "#4a2c22");
  // door (serving point)
  ctx.fillStyle = "#3b2414";
  ctx.fillRect(681, 140, 18, 30);
  ctx.fillStyle = "#5e3b22";
  ctx.fillRect(683, 142, 14, 28);
  ctx.fillStyle = mix("#ffe9b8", "#5a4a30", nf * 0.5);
  ctx.fillRect(685, 145, 10, 10);
  ctx.fillStyle = "#e8c26a";
  ctx.fillRect(693, 157, 2, 5);
  // roof sign with chasing marquee bulbs
  ctx.fillStyle = "#2b2117";
  rr(ctx, 660, 90, 90, 22, 5); ctx.fill();
  ctx.strokeStyle = "rgba(255,211,107,0.45)"; ctx.lineWidth = 1.5;
  rr(ctx, 660, 90, 90, 22, 5); ctx.stroke();
  const chase = Math.floor(now / 260);
  for (let i = 0; i < 11; i++) {
    const on = (i + chase) % 3 === 0;
    ctx.fillStyle = on ? "#fff3b0" : "rgba(255,211,107,0.45)";
    ctx.beginPath(); ctx.arc(666 + i * 7.8, 93, 1.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(666 + i * 7.8, 109, 1.3, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("LOKANTA", 705, 105);
  ctx.textAlign = "left";
  // shrubs flanking the diner
  for (const [sx, sr] of [[604, 10], [806, 7]]) {
    ctx.fillStyle = mix("#2f8a4c", "#12281c", nf * 0.8);
    for (const [ox, oy, k] of [[-0.55, 0.45, 0.65], [0.5, 0.45, 0.6], [0, 0.8, 0.75]]) {
      ctx.beginPath(); ctx.arc(sx + sr * ox, 169 - sr * oy, sr * k, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.arc(sx - sr * 0.3, 168 - sr, sr * 0.4, 0, 7); ctx.fill();
  }

  // --- toilets ---
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(810, 170, 82, 4);
  const wg = ctx.createLinearGradient(0, 118, 0, 170);
  wg.addColorStop(0, mix("#a3aec0", "#2c3547", nf * 0.7));
  wg.addColorStop(1, mix("#7f8ca2", "#222a3a", nf * 0.7));
  ctx.fillStyle = wg;
  rr(ctx, 812, 118, 78, 52, 6); ctx.fill();
  // tiled facade
  ctx.save();
  rr(ctx, 812, 118, 78, 52, 6); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  for (let yy = 132; yy < 170; yy += 6) ctx.fillRect(812, yy, 78, 1);
  for (let row = 0, yy = 132; yy < 170; yy += 6, row++)
    for (let xx = 812 + (row % 2) * 4; xx < 890; xx += 8) ctx.fillRect(xx, yy, 1, 6);
  ctx.restore();
  ctx.fillStyle = mix("#3f86c2", "#1b2c44", nf * 0.7);
  ctx.fillRect(812, 124, 78, 5);
  ctx.fillStyle = mix("#3a4458", "#161b26", nf * 0.6);
  rr(ctx, 808, 114, 86, 6, 3); ctx.fill();
  for (const [x, y, w, h] of WC_WINDOWS)
    drawWindow(x, y, w, h, mix("#fff2d0", "#5a4a30", nf * 0.5), mix("#f3d9a0", "#40342a", nf * 0.5), "#2a3142");
  // open doorway — the WC has no door
  ctx.fillStyle = mix("#d3d9e2", "#3a4250", nf * 0.6);
  ctx.fillRect(843, 138, 16, 32);
  const dg = ctx.createLinearGradient(0, 140, 0, 170);
  dg.addColorStop(0, "#121725"); dg.addColorStop(1, "#262d40");
  ctx.fillStyle = dg;
  ctx.fillRect(845, 140, 12, 30);
  ctx.fillStyle = "#1d2333";
  rr(ctx, 818, 100, 66, 20, 5); ctx.fill();
  ctx.strokeStyle = "rgba(159,232,255,0.4)"; ctx.lineWidth = 1.5;
  rr(ctx, 818, 100, 66, 20, 5); ctx.stroke();
  ctx.fillStyle = "#9fe8ff";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("WC · ₺20", 851, 114);
  ctx.textAlign = "left";
  // cleanliness bar
  const cw = 66;
  ctx.fillStyle = "#0d1120";
  rr(ctx, 817, 89, cw + 2, 8, 4); ctx.fill();
  const cfrac = S.cleanliness / 100;
  if (cfrac > 0) {
    ctx.fillStyle = cfrac > 0.6 ? "#5ad07a" : cfrac > 0.3 ? "#ffd36b" : "#ff6b6b";
    rr(ctx, 818, 90, Math.max(6, cw * cfrac), 6, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(820, 91, Math.max(2, cw * cfrac - 4), 1.5);
  }
  // stink cloud when dirty
  if (S.cleanliness < 40) {
    const a = (40 - S.cleanliness) / 40 * 0.7;
    ctx.fillStyle = `rgba(120, 160, 90, ${a * (0.6 + 0.4 * Math.sin(now / 300))})`;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(884 + i * 8, 86 - i * 8, 6 + i * 2, 0, 7);
      ctx.fill();
    }
  }
}

// Drawn over the night overlay: lamp pools, lit windows, glowing signs.
function drawNightLights(nf, now) {
  if (nf <= 0.3) return;
  const a = (nf - 0.3) / 0.7;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const lx of LAMPS) {
    const hx = lx + 13, hy = LOT.top - 54;
    ctx.save();
    ctx.translate(hx, LOT.top + 34);
    ctx.scale(1, 0.45);
    const pg = ctx.createRadialGradient(0, 0, 4, 0, 0, 95);
    pg.addColorStop(0, `rgba(255,196,110,${0.24 * a})`);
    pg.addColorStop(1, "rgba(255,196,110,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(-95, -95, 190, 190);
    ctx.restore();
    const cone = ctx.createLinearGradient(0, hy, 0, LOT.top + 40);
    cone.addColorStop(0, `rgba(255,214,140,${0.16 * a})`);
    cone.addColorStop(1, "rgba(255,214,140,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy); ctx.lineTo(hx + 6, hy); ctx.lineTo(hx + 40, LOT.top + 40); ctx.lineTo(hx - 40, LOT.top + 40);
    ctx.closePath(); ctx.fill();
    const bg = ctx.createRadialGradient(hx, hy, 1, hx, hy, 16);
    bg.addColorStop(0, `rgba(255,236,180,${0.8 * a})`);
    bg.addColorStop(1, "rgba(255,236,180,0)");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(hx, hy, 16, 0, 7); ctx.fill();
  }
  // window light spilling onto the curb
  for (const [sx, rx] of [[705, 100], [851, 46]]) {
    ctx.save();
    ctx.translate(sx, 170);
    ctx.scale(1, 0.28);
    const sg = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
    sg.addColorStop(0, `rgba(255,190,100,${0.2 * a})`);
    sg.addColorStop(1, "rgba(255,190,100,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(-rx, 0, rx * 2, rx);
    ctx.restore();
  }
  ctx.restore();

  ctx.fillStyle = `rgba(255, 196, 100, ${0.5 * nf})`;
  for (const [x, y, w, h] of [...DINER_WINDOWS, ...WC_WINDOWS]) ctx.fillRect(x, y, w, h);

  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowBlur = 10 * a;
  ctx.font = "bold 12px system-ui";
  ctx.shadowColor = "#ffb02e";
  ctx.fillStyle = "#ffd36b";
  ctx.fillText("LOKANTA", 705, 105);
  ctx.shadowColor = "#4fd8ff";
  ctx.fillStyle = "#b6f0ff";
  ctx.fillText("WC · ₺20", 851, 114);
  ctx.restore();
  // backlit pylon face cuts through the night overlay
  ctx.save();
  ctx.globalAlpha = Math.min(1, a);
  ctx.shadowColor = "rgba(230, 240, 255, 0.9)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#f7f9fc";
  ctx.fillRect(PYLON.x - PYLON.bw / 2 + 4, PYLON.top + 4, PYLON.bw - 8, PYLON.bh - 8);
  ctx.shadowBlur = 0;
  drawPylonFace();
  ctx.restore();
}

/* ------------------ Counter room (you, behind the counter) ----------- */
function shade(hex, f) {                                            // f<0 darkens, f>0 lightens
  const n = parseInt(hex.slice(1), 16);
  const ch = s => {
    const v = (n >> s) & 255;
    return Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// A landscape banknote held in a guest's hand, centered on (cx, cy) and u px
// per unit (the note is 16u x 8u) — a mini of the drawer's drawNote look.
function drawHeldBill(cx, cy, u, color, d) {
  const w = 16 * u, h = 8 * u, x = -w / 2, y = -h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  rr(ctx, x + 0.4 * u, y + 0.5 * u, w, h, 0.5 * u); ctx.fill();
  ctx.fillStyle = shade(color, 0.4);                                // paper + pale margin
  rr(ctx, x, y, w, h, 0.5 * u); ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, x + 0.7 * u, y + 0.7 * u, w - 1.4 * u, h - 1.4 * u, 0.4 * u); ctx.fill();
  ctx.strokeStyle = shade(color, -0.3);                             // guilloche waves
  ctx.lineWidth = Math.max(0.5, 0.18 * u);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const yy = y + 2 * u + k * 2 * u;
    ctx.moveTo(x + 0.9 * u, yy);
    for (let xx = 0.9; xx <= 15.1; xx += 0.6) ctx.lineTo(x + xx * u, yy + Math.sin(xx * 1.6 + k) * 0.35 * u);
  }
  ctx.stroke();
  ctx.fillStyle = shade(color, 0.55);                               // watermark window
  ctx.beginPath(); ctx.ellipse(x + 12 * u, y + 4 * u, 1.9 * u, 2.4 * u, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shade(color, -0.38);                              // portrait
  ctx.beginPath(); ctx.arc(x + 4 * u, y + 3.3 * u, 1.2 * u, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4 * u, y + 6.3 * u, 2.1 * u, 1.6 * u, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "rgba(170, 175, 185, 0.85)";                      // security thread
  ctx.fillRect(x + 9 * u, y + 0.7 * u, 0.35 * u, h - 1.4 * u);
  ctx.fillStyle = shade(color, -0.55);                              // denomination
  ctx.font = `bold ${(2.4 * u).toFixed(1)}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(d, x + w - 1 * u, y + 2.7 * u);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawCounterIn() {
  const d = COUNTER_IN.desk;
  // the full-width wooden teller counter: a raised guest-side ledge (guests
  // stand behind it) and your desktop running down to the bottom of the view
  const L = -offX, R = L + Wdyn, B = H + offY;
  const top = d.y + 8;                                              // desktop starts under the ledge face
  const wood = ctx.createLinearGradient(0, top, 0, B);
  wood.addColorStop(0, "#7a5a32");
  wood.addColorStop(0.25, "#8f6b3c");
  wood.addColorStop(1, "#5e4426");
  ctx.fillStyle = wood;
  ctx.fillRect(L, top, Wdyn, B - top);
  ctx.lineWidth = 1;
  for (let y = top + 22, k = 0; y < B; y += 34, k++) {              // plank seams + grain
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(L, y, Wdyn, 1.5);
    ctx.fillStyle = "rgba(255, 228, 170, 0.07)";
    ctx.fillRect(L, y + 1.5, Wdyn, 1);
    ctx.strokeStyle = "rgba(60, 38, 16, 0.18)";
    ctx.beginPath();
    for (let g = 0; g < 3; g++) {
      const gy = y + 8 + g * 8;
      ctx.moveTo(L, gy);
      for (let x = L; x <= R; x += 24) ctx.lineTo(x, gy + Math.sin(x * 0.013 + k * 1.7 + g) * 2.2);
    }
    ctx.stroke();
  }
  const sheen = ctx.createRadialGradient(480, top + 60, 20, 480, top + 60, 520);
  sheen.addColorStop(0, "rgba(255, 236, 190, 0.10)");
  sheen.addColorStop(1, "rgba(255, 236, 190, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(L, top, Wdyn, B - top);
  const ls = ctx.createLinearGradient(0, top, 0, top + 18);         // the ledge's shadow on the desk
  ls.addColorStop(0, "rgba(0, 0, 0, 0.45)");
  ls.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ls;
  ctx.fillRect(L, top, Wdyn, 18);
  // the raised ledge: its top surface, then the face turned toward you
  ctx.fillStyle = "#b48d55";
  ctx.fillRect(L, d.y - 12, Wdyn, 9);                               // ledge top
  ctx.fillStyle = "rgba(255, 240, 200, 0.4)";
  ctx.fillRect(L, d.y - 12, Wdyn, 2);
  const face = ctx.createLinearGradient(0, d.y - 3, 0, top);
  face.addColorStop(0, "#8a6838");
  face.addColorStop(1, "#6c4f2b");
  ctx.fillStyle = face;
  ctx.fillRect(L, d.y - 3, Wdyn, top - d.y + 3);                    // ledge face
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(L, d.y - 3, Wdyn, 1);
  ctx.fillRect(L, top - 1, Wdyn, 1);
  // the open cash drawer
  function drawNote(x, y, w, h, color, d) {
    ctx.fillStyle = shade(color, 0.35);                             // paper + pale margin
    rr(ctx, x, y, w, h, 2); ctx.fill();
    ctx.fillStyle = color;
    rr(ctx, x + 3, y + 3, w - 6, h - 6, 2); ctx.fill();
    ctx.strokeStyle = shade(color, -0.3);
    ctx.lineWidth = 0.6;
    ctx.beginPath();                                                // guilloche waves
    for (let k = 0; k < 5; k++) {
      const yy = y + 10 + k * ((h - 20) / 4);
      ctx.moveTo(x + 4, yy);
      for (let xx = x + 4; xx <= x + w - 4; xx += 3) {
        ctx.lineTo(xx, yy + Math.sin((xx - x) * 0.45 + k) * 1.6);
      }
    }
    ctx.stroke();
    ctx.fillStyle = shade(color, 0.5);                              // watermark window
    ctx.beginPath(); ctx.ellipse(x + w - 19, y + h - 20, 8, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(color, -0.35);                            // portrait
    ctx.beginPath(); ctx.arc(x + 17, y + h - 26, 6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 17, y + h - 12, 10, 6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "rgba(170, 175, 185, 0.85)";                    // security thread
    ctx.fillRect(x + w - 8, y + 3, 1.5, h - 6);
    ctx.fillStyle = shade(color, -0.5);                             // corner numerals
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(d, x + 5, y + 12);
    ctx.textAlign = "right";
    ctx.fillText(d, x + w - 5, y + h - 5);
  }
  // Turkish coins: 1₺ bimetallic, 50/25 kuruş silver, 10/5 kuruş brass
  const COINS = [
    { r: 7,   rim: "#c9ced6", core: "#d8b25a" },
    { r: 6.4, rim: "#c3c8d0", core: "#c3c8d0" },
    { r: 5.8, rim: "#bfc4cc", core: "#bfc4cc" },
    { r: 5.2, rim: "#cfa64e", core: "#cfa64e" },
    { r: 4.6, rim: "#c99d47", core: "#c99d47" },
  ];
  const PILE = [[-8, 6], [6, 8], [-2, -2], [9, -3], [-9, -6], [2, 12], [0, -9]];
  function drawCoin(x, y, c) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath(); ctx.arc(x + 1, y + 1.5, c.r, 0, 7); ctx.fill();
    ctx.fillStyle = shade(c.rim, -0.35);                            // milled edge
    ctx.beginPath(); ctx.arc(x, y, c.r, 0, 7); ctx.fill();
    ctx.fillStyle = c.rim;
    ctx.beginPath(); ctx.arc(x, y, c.r - 0.8, 0, 7); ctx.fill();
    ctx.fillStyle = c.core;
    ctx.beginPath(); ctx.arc(x, y, c.r * 0.62, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(c.core, -0.25);
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(x, y, c.r * 0.62, 0, 7); ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";                  // sheen
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, c.r - 1.6, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
  }
  function softShadow(x, y, w, h, r, blur = 10, oy = 4) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = oy;
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.restore();
  }
  function drawDrawer() {
    softShadow(374, 372, 212, 152, 4, 14, 6);
    const mg = ctx.createLinearGradient(374, 0, 586, 0);            // brushed-metal till body
    mg.addColorStop(0, "#2f3542");
    mg.addColorStop(0.5, "#454d5e");
    mg.addColorStop(1, "#2c323e");
    ctx.fillStyle = mg;
    rr(ctx, 374, 372, 212, 152, 4); ctx.fill();                    // open drawer
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    rr(ctx, 374.5, 372.5, 211, 151, 4); ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(376, 373, 208, 2);
    ctx.fillStyle = "#12151d";
    ctx.fillRect(380, 378, 200, 90);
    for (const c of COUNTER_IN.chips) {                             // the three bill trays
      ctx.fillStyle = "#0e1118";
      rr(ctx, c.x - 4, c.y - 4, c.w + 8, c.h + 8, 3); ctx.fill();
      const nh = c.h + 20;
      for (let k = 3; k >= 1; k--) {                                // the stack under the top note
        ctx.fillStyle = shade(c.color, -0.15 - k * 0.08);
        rr(ctx, c.x + (k % 2 ? 1 : -1), c.y + k * 1.5, c.w, nh, 2); ctx.fill();
        ctx.fillStyle = shade(c.color, 0.3);
        ctx.fillRect(c.x + 2, c.y + nh + k * 1.5 - 1, c.w - 4, 0.8);
      }
      drawNote(c.x, c.y, c.w, nh, c.color, c.d);
      ctx.fillStyle = "#8d96a6";                                    // spring clip arm
      rr(ctx, c.x + c.w / 2 - 3, c.y - 6, 6, 22, 2); ctx.fill();
      ctx.fillStyle = "#dfe4ec";
      ctx.fillRect(c.x + c.w / 2 - 1.5, c.y - 5, 1.5, 19);
      ctx.fillStyle = "#5d6574";
      rr(ctx, c.x + c.w / 2 - 6, c.y + 14, 12, 5, 2); ctx.fill();
      ctx.fillStyle = "rgba(15, 30, 20, 0.62)";                      // readable label band
      rr(ctx, c.x + 4, c.y + c.h / 2 - 6, c.w - 8, 20, 3); ctx.fill();
      ctx.fillStyle = "#f4f8f0";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2 + 9);
    }
    ctx.fillStyle = "#0e1118";                                      // coin compartment
    rr(ctx, 380, 468, 200, 44, 3); ctx.fill();
    const cg = ctx.createLinearGradient(0, 468, 0, 512);
    cg.addColorStop(0, "rgba(0, 0, 0, 0.5)");
    cg.addColorStop(0.35, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cg;
    ctx.fillRect(380, 468, 200, 44);
    for (let i = 1; i < 5; i++) {                                   // cup dividers
      ctx.fillStyle = "#2a3040";
      ctx.fillRect(380 + i * 40 - 1, 470, 2.5, 40);
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(380 + i * 40 - 1, 470, 0.8, 40);
    }
    for (let i = 0; i < 5; i++) {
      const cx = 400 + i * 40, cy = 490;
      const n = 7 - i % 3;
      for (let k = 0; k < n; k++) drawCoin(cx + PILE[k][0] * 0.95, cy + PILE[k][1] * 0.95, COINS[i]);
    }
    ctx.fillStyle = "#cfd6e4";                                      // drawer pull
    rr(ctx, 466, 513, 28, 5, 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(468, 513.5, 24, 1);
    ctx.textAlign = "left";
  }
  drawDrawer();
  // calculator, cologne
  function drawCounterItems() {
    softShadow(218, 396, 66, 68, 6, 8, 4);                          // calculator
    const cb = ctx.createLinearGradient(0, 396, 0, 464);
    cb.addColorStop(0, "#343b4b");
    cb.addColorStop(1, "#1b202b");
    ctx.fillStyle = cb;
    rr(ctx, 218, 396, 66, 68, 6); ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    rr(ctx, 218.5, 396.5, 65, 67, 6); ctx.stroke();
    ctx.fillStyle = "#11151d";                                      // screen bezel
    rr(ctx, 223, 401, 56, 20, 3); ctx.fill();
    const lcd = ctx.createLinearGradient(0, 403, 0, 419);
    lcd.addColorStop(0, "#b4f0d4");
    lcd.addColorStop(1, "#86d6b0");
    ctx.fillStyle = lcd;
    ctx.fillRect(225, 403, 52, 16);
    ctx.fillStyle = "#1e3a2c";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "right";
    // the change still owed to the guest at the counter (000 when nobody's).
    // While the front guest is settling (doneC) it previews the NEXT guest in
    // line, the same way the old desk card did.
    const f = facilities.C.queue[0];
    const inC = p => p && (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC");
    const g = (f && f.state === "doneC" && inC(facilities.C.queue[1])) ? facilities.C.queue[1] : f;
    ctx.fillText(String(inC(g) ? Math.max(0, g.owed - g.changeGiven) : 0).padStart(3, "0"), 273, 416);
    ctx.textAlign = "left";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {      // keys: dark cap with a lit top edge
      const kx = 225 + c * 18, ky = 426 + r * 12;
      const op = c === 2 && r === 2;
      ctx.fillStyle = "#0f1219";
      rr(ctx, kx, ky + 1, 15, 8, 2); ctx.fill();
      ctx.fillStyle = op ? "#d9823b" : (r + c) % 2 ? "#454c5c" : "#565e70";
      rr(ctx, kx, ky, 15, 8, 2); ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      ctx.fillRect(kx + 2, ky + 0.5, 11, 1);
    }
    drawBottle();
    drawTea();
    drawIntercom();
  }
  drawCounterItems();
}

function drawBottle() {
  const b = COUNTER_IN.bottle;
  const f = S.bottle / BOTTLE_MAX;
  // a Pereja-style lemon cologne: ribbed pale-yellow plastic body, white
  // screw cap, cream label with brown bands and the PE·RE·JA hexagons
  // drawn at a fixed 54×108 design size, scaled down into the hit rect
  const x = 0, w = 54, cx = w / 2;
  const capH = 15, top = capH, bot = 108, bodyH = bot - top;
  const lblY = top + 26, lblH = 36;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(b.w / w, b.h / bot);

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";                            // shadow on the counter
  ctx.beginPath(); ctx.ellipse(cx + 3, bot, w / 2 + 3, 5, 0, 0, 7); ctx.fill();

  rr(ctx, x, top, w, bodyH, 9);                                     // body (empty plastic)
  ctx.fillStyle = "#f7f3d2";
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (f > 0.02) {                                                    // cologne level
    const fillH = (bodyH - 4) * f;
    ctx.fillStyle = "#ece17f";
    ctx.fillRect(x, bot - fillH, w, fillH);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(x, bot - fillH, w, 1.2);
  }
  ctx.lineWidth = 1;                                                 // vertical ribs
  for (let rx = x + 4; rx < x + w - 2; rx += 4.5) {
    ctx.strokeStyle = "rgba(150, 140, 60, 0.18)";
    ctx.beginPath(); ctx.moveTo(rx, top + 6); ctx.lineTo(rx, bot - 12); ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath(); ctx.moveTo(rx + 1.2, top + 6); ctx.lineTo(rx + 1.2, bot - 12); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150, 140, 60, 0.3)";                       // base groove
  ctx.beginPath(); ctx.moveTo(x, bot - 10); ctx.lineTo(x + w, bot - 10); ctx.stroke();
  const sh = ctx.createLinearGradient(x, 0, x + w, 0);              // round-body shading
  sh.addColorStop(0, "rgba(120, 110, 40, 0.25)");
  sh.addColorStop(0.18, "rgba(255, 255, 255, 0.45)");
  sh.addColorStop(0.32, "rgba(255, 255, 255, 0)");
  sh.addColorStop(0.8, "rgba(120, 110, 40, 0.08)");
  sh.addColorStop(1, "rgba(100, 90, 30, 0.35)");
  ctx.fillStyle = sh;
  ctx.fillRect(x, top, w, bodyH);

  // label: cream band, brown rules, a taller central plaque
  ctx.fillStyle = "#f6efd8";
  ctx.fillRect(x, lblY, w, lblH);
  rr(ctx, x + 9, lblY - 4, w - 18, lblH + 8, 7); ctx.fill();
  ctx.strokeStyle = "#7d6b45";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, lblY + 1.5); ctx.lineTo(x + 9, lblY + 1.5);
  ctx.moveTo(x + w - 9, lblY + 1.5); ctx.lineTo(x + w, lblY + 1.5);
  ctx.moveTo(x, lblY + lblH - 1.5); ctx.lineTo(x + 9, lblY + lblH - 1.5);
  ctx.moveTo(x + w - 9, lblY + lblH - 1.5); ctx.lineTo(x + w, lblY + lblH - 1.5);
  ctx.stroke();
  rr(ctx, x + 10, lblY - 2.5, w - 20, lblH + 5, 6); ctx.stroke();
  ctx.fillStyle = "#5a4a2e";                                         // side medallions
  for (const mx of [x + 3.5, x + w - 3.5]) {
    ctx.beginPath(); ctx.arc(mx, lblY + lblH / 2, 3, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#c0392b";
  for (const mx of [x + 3.5, x + w - 3.5]) {
    ctx.beginPath(); ctx.arc(mx, lblY + lblH / 2, 1.2, 0, 7); ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#3a2f1e";
  ctx.font = "4px system-ui, sans-serif";
  ctx.fillText("80°", cx, lblY + 1.5);
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 5px system-ui, sans-serif";
  ctx.fillText("TURİSTİK", cx, lblY + 7);
  const hexR = 5;                                                    // PE · RE · JA hexagons
  ["PE", "RE", "JA"].forEach((t, i) => {
    const hx = cx + (i - 1) * (hexR * 1.8), hy = lblY + 15.5;
    ctx.fillStyle = "#8a7850";
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + k * Math.PI / 3;
      ctx[k ? "lineTo" : "moveTo"](hx + hexR * Math.cos(a), hy + hexR * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 4.5px system-ui, sans-serif";
    ctx.fillText(t, hx, hy + 0.3);
  });
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 3.2px system-ui, sans-serif";
  ctx.fillText("LİMON KOLONYASI", cx, lblY + 24);
  ctx.fillStyle = "#1e1a14";
  ctx.font = "bold 5px system-ui, sans-serif";
  ctx.fillText("500 ml", cx, lblY + 30.5);
  ctx.textBaseline = "alphabetic";

  ctx.restore();                                                     // end body clip
  ctx.strokeStyle = "rgba(140, 130, 60, 0.45)";
  ctx.lineWidth = 1;
  rr(ctx, x, top, w, bodyH, 9); ctx.stroke();

  // white screw cap
  const capX = x + 9, capW = w - 18;
  const cg = ctx.createLinearGradient(capX, 0, capX + capW, 0);
  cg.addColorStop(0, "#c9ced6");
  cg.addColorStop(0.25, "#ffffff");
  cg.addColorStop(0.7, "#e6e9ee");
  cg.addColorStop(1, "#aab0ba");
  ctx.fillStyle = cg;
  rr(ctx, capX, 0, capW, capH + 2, 4); ctx.fill();
  ctx.strokeStyle = "rgba(90, 100, 115, 0.5)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillRect(capX + 3, 2, capW - 6, 1.5);

  ctx.restore();
  ctx.textAlign = "left";
}

/* Your glass of Turkish tea: a tulip glass on a white saucer with red dots,
 * a spoon leaning in. The level drops as S.tea runs from 1 to 0. */
function drawTea() {
  const cx = 690, by = 470;                      // glass center x, glass bottom y
  const f = clamp(S.tea, 0, 1);
  // saucer
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath(); ctx.ellipse(cx, by + 4, 30, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#f4f1ea";
  ctx.beginPath(); ctx.ellipse(cx, by, 30, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#c0392b";
  for (const a of [0.35, 1.4, 2.6, 3.6, 4.7, 5.8]) {
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 24, by + Math.sin(a) * 6, 4, 1.6, 0, 0, 7); ctx.fill();
  }
  // the tulip glass outline: wide rim, pinched waist, round belly
  const glass = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 13, by - 44);
    ctx.quadraticCurveTo(cx - 7, by - 30, cx - 9, by - 20);
    ctx.quadraticCurveTo(cx - 14, by - 6, cx - 9, by - 1);
    ctx.lineTo(cx + 9, by - 1);
    ctx.quadraticCurveTo(cx + 14, by - 6, cx + 9, by - 20);
    ctx.quadraticCurveTo(cx + 7, by - 30, cx + 13, by - 44);
    ctx.closePath();
  };
  // the tea, clipped to the glass — deep red at the bottom, amber at the top
  if (f > 0.01) {
    const top = by - 1 - 39 * f;
    ctx.save();
    glass(); ctx.clip();
    const g = ctx.createLinearGradient(0, top, 0, by);
    g.addColorStop(0, "#d9541e");
    g.addColorStop(1, "#8e1608");
    ctx.fillStyle = g;
    ctx.fillRect(cx - 16, top, 32, by - top);
    ctx.fillStyle = "rgba(255, 190, 110, 0.55)";
    ctx.fillRect(cx - 16, top, 32, 1.5);         // the bright surface line
    ctx.restore();
  }
  glass();
  ctx.fillStyle = "rgba(210, 230, 240, 0.15)"; ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(cx - 9, by - 38, 1.5, 14);        // glint
  // the spoon leaning in
  ctx.strokeStyle = "#c9ced6";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx + 4, by - 6); ctx.lineTo(cx - 12, by - 56); ctx.stroke();
  ctx.lineWidth = 1;
  // a wisp of steam while it's still hot
  if (f > 0.4) {
    const t = performance.now() / 600;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 * (f - 0.4) / 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 3, by - 48);
    ctx.bezierCurveTo(cx + 9 + Math.sin(t) * 3, by - 56, cx - 3 + Math.sin(t + 1) * 3, by - 64, cx + 4, by - 72);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

/* The wall-box intercom (white case, speaker grille, red call button) — click
 * it to call for tea; orderTea brings a fresh glass within TEA_DELIVERY. */
function drawIntercom() {
  const b = COUNTER_IN.intercom;
  ctx.save();                                                   // soft shadow on the desk
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  rr(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#eceae4";
  rr(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();                   // case
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = 1;
  rr(ctx, b.x, b.y, b.w, b.h, 6); ctx.stroke();
  // the speaker grille: slots, longest through the middle
  ctx.fillStyle = "#4a4a4a";
  for (let k = 0; k < 7; k++) {
    const w = (b.w - 12) * (0.45 + 0.55 * Math.sin((k + 0.5) / 7 * Math.PI));
    ctx.fillRect(b.x + b.w / 2 - w / 2, b.y + 6 + k * 5, w, 1.6);
  }
  // the red-framed label plate with the call button
  ctx.strokeStyle = "#c0392b";
  rr(ctx, b.x + 4, b.y + 44, b.w - 8, 14, 2); ctx.stroke();
  const ordered = S.teaOrder != null;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  ctx.fillStyle = ordered ? `rgba(255, 90, 90, ${pulse})` : "#e8505b";
  rr(ctx, b.x + b.w / 2 - 6, b.y + 46, 12, 10, 2); ctx.fill();  // button (blinks while tea is on the way)
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 5px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ÇAY", b.x + 10, b.y + 53);
  ctx.textAlign = "left";
}

// Intercom click: call for a fresh glass of tea.
function orderTea() {
  if (S.teaOrder != null) { toast("🍵 Çayın zaten yolda", ""); return; }
  S.teaOrder = rand(TEA_DELIVERY[0], TEA_DELIVERY[1]);
  toast("🍵 Çay geliyor!", "");
}

function drawCounterInPrompts() {
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";                         // legible on the wooden desk
  ctx.shadowBlur = 3;
  ctx.textAlign = "center";
  const front = facilities.C.queue[0];
  if (front) {
    if (!front.cologne && S.bottle > 0 && (front.state === "payC" || front.state === "doneC")) {
      const b = COUNTER_IN.bottle;
      ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("kolonya!", b.x + b.w / 2, b.y - 6);
    }
    if (front.state === "payC" && front.changeGiven < front.owed) {
      const c = COUNTER_IN.chips[0];
      ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("para üstü!", c.x + 32, c.y - 8);
    }
  }
  ctx.restore();
  ctx.textAlign = "left";
}

/* Red badge pinned just ABOVE the "EXIT" text inside the exit door — how many guests are
 * standing OUTSIDE the WC building, waiting for a toilet (the T line).
 * The line moves on its own (visits last 1–10 game minutes), so the badge
 * is the at-a-glance "the door is busy" signal for you behind the counter.
 * (Above, not over: a badge on the text would swallow it.) */
function drawExitQueueBadge() {
  const n = facilities.T.queue.length;
  if (n === 0) return;
  const ex = COUNTER_IN.exit;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  const exTop = -offY; // the doorway runs to the top of the frame (same as the door draw)
  const cx = ex.x + ex.w / 2; // horizontally over the "EXIT" text
  const cy = (exTop + ex.y + ex.h) / 2 - 24; // just above the text — the badge must not cover it
  const label = String(n);           // exact count — no "9+" cap
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
  ctx.lineWidth = 1;
  ctx.fillStyle = "#fff";
  ctx.fillText(label, cx, cy + 0.5);
  // restore text state for the rest of the scene
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/* --------------------- shared garden-hose drawing ------------------- */
// a garden hose stroke: dark outline, green tube, a thin highlight on top
function hoseStroke(path) {
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1c5230"; ctx.lineWidth = 8; path(0); ctx.stroke();
  ctx.strokeStyle = "#3f9c57"; ctx.lineWidth = 6; path(0); ctx.stroke();
  ctx.strokeStyle = "rgba(170, 240, 190, 0.55)"; ctx.lineWidth = 1.5; path(-1.5); ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineWidth = 1;
}

// the hose draped from its tap (ox, oy) to the nozzle at the pointer
function drawHoseLine(ox, oy, px, py) {
  hoseStroke(o => {
    ctx.beginPath();
    ctx.moveTo(ox, oy + o);
    ctx.quadraticCurveTo((ox + px) / 2 - 60, (oy + py) / 2 + 40 + o, px - 6, py - 6 + o);
  });
}

// the trigger nozzle held at the pointer, tilted down-right
function drawHoseNozzle(px, py) {
  ctx.save();
  ctx.translate(px - 6, py - 6);
  ctx.rotate(0.6);
  const nz = ctx.createLinearGradient(0, -5, 0, 5);
  nz.addColorStop(0, "#3a4b5f"); nz.addColorStop(1, "#18222e");
  ctx.fillStyle = nz;
  rr(ctx, -8, -5, 22, 10, 3); ctx.fill();
  ctx.fillStyle = "#e0a63a";
  rr(ctx, -2, 4, 6, 7, 2); ctx.fill();          // trigger
  ctx.fillStyle = "#3f7fd4";
  rr(ctx, 14, -4, 5, 8, 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  rr(ctx, -6, -4, 18, 2.5, 1); ctx.fill();
  ctx.restore();
}

// mist where the jet hits, droplets bursting outward, runs trickling down
function drawHoseSpray(px, py, now) {
  const hsh = n => frac(Math.sin(n * 127.1 + 11.3) * 43758.5453);
  const mist = ctx.createRadialGradient(px, py, 2, px, py, 28);
  mist.addColorStop(0, "rgba(215, 242, 255, 0.6)");
  mist.addColorStop(1, "rgba(160, 220, 255, 0)");
  ctx.fillStyle = mist;
  ctx.beginPath(); ctx.arc(px, py, 28, 0, 7); ctx.fill();
  for (let k = 0; k < 16; k++) {
    const t = (now / 380 + hsh(k)) % 1;
    const ang = k * 2.39996 + Math.floor(now / 380 + hsh(k)) * 0.9;
    const rad = 6 + t * 24;
    ctx.fillStyle = `rgba(150, 215, 255, ${(0.9 * (1 - t)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad, 1.4 + (1 - t) * 1.4, 0, 7); ctx.fill();
  }
  for (let k = 0; k < 3; k++) {
    const t = (now / 650 + k / 3) % 1;
    ctx.fillStyle = `rgba(160, 220, 255, ${(0.6 * (1 - t)).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(px - 11 + k * 11, py + 14 + t * 34, 1.6, 3 + t * 2, 0, 0, 7); ctx.fill();
  }
}

/* --------------------- WC interior (behind the counter) ------------- */
/* The cleaning-hose station: a wall faucet with a coiled hose beside the stall row,
 * on the left of the screen, closest to the stalls. Click it to pick the hose up;
 * hold the mouse and drag it over a stall
 * to spray (hoseApply). It pulses amber while any stall needs cleaning. */
function drawHoseStation() {
  const st = COUNTER_IN.hose;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  const needsClean = S.stallClean.some(v => v < 60);
  const fcx = st.x + st.w / 2, fcy = st.y + 30; // the wall faucet; the coil sits on the stalls' floor line
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(fcx, st.y + st.h - 4, 26, 5, 0, 0, 7); ctx.fill();
  const chrome = ctx.createLinearGradient(fcx - 11, 0, fcx + 11, 0);
  chrome.addColorStop(0, "#7c8696"); chrome.addColorStop(0.4, "#e6ebf2"); chrome.addColorStop(1, "#7c8696");
  ctx.fillStyle = chrome;
  rr(ctx, fcx - 5, fcy - 8, 10, 16, 3); ctx.fill();    // riser
  rr(ctx, fcx - 11, fcy + 6, 22, 8, 3); ctx.fill();    // spout bar
  ctx.fillStyle = "#3f7fd4";
  rr(ctx, fcx - 2.5, fcy + 14, 5, 6, 2); ctx.fill();   // tip
  ctx.fillStyle = "#2f6fc4";
  rr(ctx, fcx - 10, fcy - 12, 20, 5, 2.5); ctx.fill(); // handle
  const now = performance.now();
  const base = st.y + st.h - 9;
  if (!hoseInHand) { // the coil hangs off the tap until you pick it up
    hoseStroke(o => { ctx.beginPath(); ctx.moveTo(fcx, fcy + 19 + o); ctx.quadraticCurveTo(fcx + 14, base - 14 + o, fcx + 16, base - 16 + o); });
    for (let k = 0; k < 3; k++) { // flat loops piled on the floor, bottom one first
      const cy = base - k * 6, rx = 22 - k * 3;
      hoseStroke(o => { ctx.beginPath(); ctx.ellipse(fcx, cy + o, rx, 7 - k, 0, 0, 7); });
    }
  } else { // a slow drip from the open tap
    const t = (now / 900) % 1;
    ctx.fillStyle = `rgba(140, 210, 255, ${0.85 * (1 - t * 0.6)})`;
    ctx.beginPath(); ctx.ellipse(fcx, fcy + 22 + t * 22, 1.8, 2.6, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = hoseInHand ? `rgba(120, 225, 255, ${0.6 + 0.4 * pulse})`
    : needsClean ? `rgba(255, 211, 107, ${0.5 + 0.5 * pulse})`
    : "rgba(226,235,248,0.8)";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(hoseInHand ? "ELİNDE" : "HORTUM", fcx, st.y + 8);
  ctx.textAlign = "left";
}

// The drawn body box of a pax at a given draw scale k (the counter room's 5x
// close-up, or the lot's 1x) with feet anchored at p.x, p.y — a touch looser
// than the sprite so grazing counts as in front.
function paxBox(p, k = 5) {
  const s = k * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale);
  return { x: p.x - 5.5 * s, y: p.y - 19 * s, w: 11 * s, h: 19.5 * s };
}

// The nearest catchable runaway whose drawn body (the counter room's 5x
// close-up, with pad) contains the point: still inside the WC, running for
// the EXIT (leaveC). Paying, queued, paid and already-outside guests are never
// targets — and nobody is while a caught guest is still scrubbing.
function runawayAt(x, y, pad = 2) {
  if (scrub) return null;
  let best = null, bd = Infinity;
  for (const b of buses) for (const p of b.pax) {
    if (!p.runaway || p.state !== "leaveC") continue;
    const r = paxBox(p, 5);
    if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Does this pax stand in front of any CLOSED stall door? (Passers-by draw over
// the leaf; the occupant behind their own door does not.)
function paxInFrontOfClosedDoor(p) {
  const b = paxBox(p);
  for (let i = 0; i < WC_STALLS; i++) {
    if (!stallDoorClosed(i)) continue;
    if (facilities.T.spots[i].pax === p) continue; // the occupant stays hidden
    const bx = stallBay(i).x; // the closed leaf rect is (bx+1, 106, 50, 140) — ends at the stall floor
    if (b.x < bx + 51 && b.x + b.w > bx + 1 && b.y < 246 && b.y + b.h > 106) return true;
  }
  return false;
}

// The caught runaway at work: they dash along both stall rows with a mop and
// a bucket, scrubbing hard at every bowl (bubbles rise off the mop, suds stay
// on each bowl they've done, water splashes behind their feet on the run),
// under a progress banner. Every wiggle is driven by the sequence's own clock
// (scrub.t), so pausing the game freezes the whole animation. After the
// sequence, a short "all clean" banner joins the per-stall sparkle bursts.
function drawScrub() {
  if (scrub) {
    const p = scrub.pax, t = scrub.t, pose = scrubPose();
    const working = pose.stall >= 0;
    const s = 5 * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale);
    // suds left on every bowl already scrubbed
    for (let i = 0; i < WC_STALLS; i++) {
      if (t < scrub.legs[i].t1) continue;
      const bx = stallBay(i).x;
      for (let k = 0; k < 7; k++) {
        const u = ((i * 7 + k * 13) % 10) / 10;
        ctx.fillStyle = `rgba(245, 252, 255, ${0.6 + 0.3 * (k % 2)})`;
        ctx.beginPath();
        ctx.arc(bx + 12 + u * 28, 206 - (k % 3) * 5 + Math.sin(t * 6 + k + i) * 1.5, 2.5 + (k % 3), 0, 7);
        ctx.fill();
      }
    }
    // the guest: a fast scrubbing shimmy at a bowl, a bobbing run between them
    const wob = working ? Math.sin(t * 42) : 0;
    const bob = working ? 0 : Math.abs(Math.sin(t * 26)) * 6;
    const x = pose.x + wob * 3, y = pose.y - bob, dir = pose.dir;
    // water splashes behind the running feet
    if (!working) {
      ctx.fillStyle = "rgba(120, 210, 255, 0.75)";
      for (let k = 0; k < 5; k++) {
        const f = frac(t * 3 + k / 5);
        ctx.beginPath();
        ctx.arc(pose.x - dir * (8 + f * 26), pose.y - 4 - Math.sin(f * Math.PI) * 14, 2.4 * (1 - f) + 0.8, 0, 7);
        ctx.fill();
      }
    }
    // the bucket trails at their side
    const kx = x - dir * 8 * s, ky = pose.y;
    ctx.fillStyle = "#2e5f8a";
    ctx.beginPath();
    ctx.moveTo(kx - 12, ky - 22); ctx.lineTo(kx + 12, ky - 22);
    ctx.lineTo(kx + 9, ky); ctx.lineTo(kx - 9, ky);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8fe3f2";
    ctx.beginPath(); ctx.ellipse(kx, ky - 22, 12, 3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#9aa4b2"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(kx, ky - 22, 11, Math.PI, 0); ctx.stroke();
    drawPax({ ...p, x, y }, 5);
    // the mop: handle from the hand down to a head swishing over the floor
    const hx = x + dir * 3.8 * s, hy = y - 7 * s;
    const mx = x + dir * 9 * s + wob * 14, my = pose.y - 2;
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(mx, my - 6); ctx.stroke();
    ctx.strokeStyle = "#dfe6ee"; ctx.lineWidth = 3;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath(); ctx.moveTo(mx + k * 2, my - 6); ctx.lineTo(mx + k * 4 + wob * 3, my + 3); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.lineCap = "butt";
    // bubbles off the mop while scrubbing
    if (working) {
      for (let k = 0; k < 8; k++) {
        const f = frac(t * 1.6 + k / 8);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - f)})`;
        ctx.beginPath();
        ctx.arc(mx + Math.sin(k * 2.3 + f * 6) * 14, my - 8 - f * 56, 2 + (k % 3), 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(160, 235, 255, ${0.5 + 0.5 * Math.sin(t * 20)})`;
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✦", mx + 16, my - 30);
      ctx.textAlign = "left";
    }
    // progress banner between the two stall rows
    const B = { x: 365, y: 124, w: 230, h: 30 };
    ctx.fillStyle = "rgba(13, 17, 32, 0.88)";
    rr(ctx, B.x, B.y, B.w, B.h, 8); ctx.fill();
    ctx.strokeStyle = "rgba(120, 225, 255, 0.6)"; ctx.lineWidth = 1.5;
    rr(ctx, B.x, B.y, B.w, B.h, 8); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#cfefff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🧽 YAKALANDI — bütün tuvaletleri ovuyor", B.x + B.w / 2, B.y + 14);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, B.x + 10, B.y + 20, B.w - 20, 5, 2.5); ctx.fill();
    ctx.fillStyle = "#57e08a";
    rr(ctx, B.x + 10, B.y + 20, (B.w - 20) * (t / SCRUB_TIME), 5, 2.5); ctx.fill();
    return;
  }
  // the sequence just finished: every toilet is spotless
  const age = performance.now() - scrubDoneAt;
  if (scrubDoneAt && age < 2000) {
    ctx.globalAlpha = 1 - age / 2000;
    const B = { x: 365, y: 124, w: 230, h: 30 };
    ctx.fillStyle = "rgba(13, 40, 24, 0.9)";
    rr(ctx, B.x, B.y, B.w, B.h, 8); ctx.fill();
    ctx.fillStyle = "#7dffa8";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✨ BÜTÜN TUVALETLER PIRIL PIRIL ✨", B.x + B.w / 2, B.y + B.h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
  }
}

// stable per-stall pseudo-random 0..1, so stains keep their spot frame to frame
const grimeRnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

// Layered grime for one stall; each layer fades in past its own dirt threshold.
function drawStallGrime(i, bx, cx, dirty) {
  const ramp = (from, to) => clamp((dirty - from) / (to - from), 0, 1);
  const r = k => grimeRnd(i, k);
  const blob = (x, y, rx, ry, n, k) => {
    ctx.beginPath();
    for (let j = 0; j < n; j++) {
      const ox = (r(k + j) - 0.5) * rx * 1.4, oy = (r(k + j + 9) - 0.5) * ry * 1.2;
      const s = 0.45 + r(k + j + 17) * 0.55;
      ctx.moveTo(x + ox + rx * s, y + oy);
      ctx.ellipse(x + ox, y + oy, rx * s, ry * s, 0, 0, 7);
    }
    ctx.fill();
  };

  // yellowed, murky water
  let a = ramp(0.08, 0.6);
  ctx.fillStyle = `rgba(190, 160, 50, ${a * 0.55})`;
  ctx.beginPath(); ctx.ellipse(cx, 199, 10.5, 3.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(120, 90, 30, ${a * 0.45})`;
  ctx.beginPath(); ctx.ellipse(cx, 200, 7.5, 2.4, 0, 0, 7); ctx.fill();

  // limescale ring hugging the inside of the bowl
  a = ramp(0.2, 0.7);
  if (a > 0) {
    ctx.strokeStyle = `rgba(110, 78, 34, ${a * 0.85})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cx, 199.3, 10, 3.3, 0, 0, 7); ctx.stroke();
    ctx.lineWidth = 1;
  }

  // brown drip streaks down the bowl front and under the tank lid
  a = ramp(0.3, 0.8);
  if (a > 0) {
    ctx.fillStyle = `rgba(105, 72, 30, ${a * 0.6})`;
    const drips = 2 + Math.round(dirty * 3);
    for (let j = 0; j < drips; j++) {
      const x = bx + 15 + r(30 + j) * 22, len = 4 + r(40 + j) * 10 * dirty;
      rr(ctx, x, 204, 1.6, len, 0.8); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 0.8, 204 + len, 1.3, 0, 7); ctx.fill();
    }
    for (let j = 0; j < 2; j++) {
      const x = bx + 16 + r(50 + j) * 20;
      rr(ctx, x, 164, 1.4, 3 + r(55 + j) * 8 * dirty, 0.7); ctx.fill();
    }
  }

  // splash spots on the seat
  a = ramp(0.35, 0.85);
  if (a > 0) {
    ctx.fillStyle = `rgba(170, 140, 40, ${a * 0.75})`;
    for (let j = 0; j < 3 + Math.round(dirty * 4); j++) {
      const ang = r(60 + j) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(ang) * 13, 199 + Math.sin(ang) * 4.8, 1.6, 1, 0, 0, 7);
      ctx.fill();
    }
  }

  // floor puddle with a wet sheen
  a = ramp(0.25, 0.75);
  if (a > 0) {
    const pw = 6 + dirty * 9;
    ctx.fillStyle = `rgba(175, 150, 60, ${a * 0.4})`;
    blob(cx - 2 + (r(70) - 0.5) * 6, 239, pw, 3.5, 4, 71);
    ctx.fillStyle = `rgba(255, 255, 230, ${a * 0.25})`;
    ctx.beginPath(); ctx.ellipse(cx - pw * 0.4, 238, pw * 0.3, 0.8, 0, 0, 7); ctx.fill();
  }

  // grimy smudges on the side walls
  a = ramp(0.45, 1);
  if (a > 0) {
    ctx.fillStyle = `rgba(70, 55, 30, ${a * 0.45})`;
    blob(bx + 8 + r(80) * 6, 140 + r(81) * 30, 4, 6, 3, 82);
    blob(bx + 40 + r(90) * 4, 130 + r(91) * 40, 3, 5, 3, 92);
  }

  // used paper dropped on the floor, and the roll unspooled down the wall
  a = ramp(0.5, 0.75);
  if (a > 0) {
    ctx.globalAlpha = a;
    const wads = dirty > 0.75 ? 3 : dirty > 0.6 ? 2 : 1;
    for (let j = 0; j < wads; j++) {
      const x = bx + 6 + r(100 + j) * 36, y = 238 + r(105 + j) * 5;
      ctx.fillStyle = "#e6e1d2";
      blob(x, y, 3, 2.2, 3, 110 + j * 5);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x - 2, y + 0.5, 4, 0.8);
    }
    if (dirty > 0.65) {
      ctx.strokeStyle = "#ece8dc"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + 8.5, 214);
      ctx.bezierCurveTo(bx + 11, 225, bx + 6, 232, bx + 12, 243);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;
  }

  // flies circling the bowl once it gets really bad
  if (dirty > 0.6) {
    const t = performance.now() / 1000;
    const flies = dirty > 0.85 ? 3 : dirty > 0.72 ? 2 : 1;
    ctx.fillStyle = "#15171c";
    for (let j = 0; j < flies; j++) {
      const sp = 2 + r(120 + j) * 2, ph = r(125 + j) * 7;
      const fx = cx + Math.sin(t * sp + ph) * 11 + Math.sin(t * 7.3 + j) * 2;
      const fy = 186 + Math.cos(t * sp * 1.3 + ph) * 7 + Math.sin(t * 9 + j) * 1.5;
      ctx.beginPath(); ctx.arc(fx, fy, 1.1, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(220, 230, 255, ${0.35 + 0.35 * Math.sin(t * 60 + j)})`;
      ctx.beginPath();
      ctx.ellipse(fx - 1.3, fy - 1, 1.3, 0.7, -0.5, 0, 7);
      ctx.ellipse(fx + 1.3, fy - 1, 1.3, 0.7, 0.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#15171c";
    }
  }
}

function drawWCInterior() {
  // warm back wall — spans the full view (a wider room in wide windows); it
  // ends where the EXIT door ends, so the floor starts right at its base
  ctx.fillStyle = "#5d584c";
  ctx.fillRect(-offX, -offY, Wdyn, 72 + offY);
  ctx.fillStyle = "#494438";
  ctx.fillRect(-offX, 66, Wdyn, 6); // baseboard
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-offX, 60); ctx.lineTo(Wdyn, 60);
  ctx.stroke();
  // floor
  ctx.fillStyle = "#262b36";
  ctx.fillRect(-offX, 72, Wdyn, H + 2 * offY - 72);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -offX; x <= Wdyn; x += 48) { ctx.moveTo(x, 72); ctx.lineTo(x, H + 2 * offY); }
  for (let y = 72; y <= H + 2 * offY; y += 48) { ctx.moveTo(-offX, y); ctx.lineTo(Wdyn, y); }
  ctx.stroke();
  // the two stall rows — five bays on the left, five mirrored on the right
  ctx.fillStyle = "#3d465e";
  rr(ctx, 68, 84, 324, 162, 6); ctx.fill();
  rr(ctx, 568, 84, 324, 162, 6); ctx.fill();
  for (let i = 0; i < WC_STALLS; i++) {
    const bx = stallBay(i).x;
    const s = facilities.T.spots[i];
    const dirty = 1 - S.stallClean[i] / 100;
    ctx.fillStyle = "#171c28";
    ctx.fillRect(bx, 108, 52, 138); // dark opening
    // this stall's cleanliness bar — pinned to the top of each toilet
    ctx.fillStyle = "#0d1120";
    rr(ctx, bx + 6, 94, 40, 8, 2); ctx.fill();
    const f = S.stallClean[i] / 100;
    if (f > 0.01) {
      ctx.fillStyle = f > 0.6 ? "#5ad07a" : f > 0.3 ? "#ffd36b" : "#ff6b6b";
      rr(ctx, bx + 6, 94, 40 * f, 8, 2); ctx.fill();
    }
    const cx = bx + 26;
    const porcelain = ctx.createLinearGradient(bx + 10, 0, bx + 42, 0);
    porcelain.addColorStop(0, "#c9ccd0");
    porcelain.addColorStop(0.35, "#f6f6f3");
    porcelain.addColorStop(1, "#b9bcc2");
    // toilet-paper roll on the side wall
    ctx.fillStyle = "#8d96a6";
    ctx.fillRect(bx + 1, 205, 7, 2);
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath(); ctx.arc(bx + 4.5, 211, 3.5, 0, 7); ctx.fill();
    ctx.fillRect(bx + 1, 211, 3.5, 8);
    ctx.fillStyle = "#b8b3a6";
    ctx.beginPath(); ctx.arc(bx + 4.5, 211, 1.2, 0, 7); ctx.fill();
    // the open door leaf covers bx+44..52, so center the toilet on the visible bx..bx+44
    ctx.save();
    ctx.translate(-4, 0);
    // water supply pipe + shut-off valve
    ctx.strokeStyle = "#a9b2bf"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + 15, 186); ctx.lineTo(bx + 15, 196); ctx.lineTo(bx + 10, 196); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#cfd6e2";
    ctx.fillRect(bx + 8, 194, 3, 4);
    // tank, lid and chrome flush lever
    ctx.fillStyle = porcelain;
    rr(ctx, bx + 11, 162, 30, 24, 3); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(bx + 11, 182, 30, 4);
    ctx.fillStyle = "#fbfbf9";
    rr(ctx, bx + 9, 158, 34, 6, 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(bx + 10, 163, 32, 1);
    ctx.fillStyle = "#dfe4ec";
    rr(ctx, bx + 13, 167, 7, 3, 1.5); ctx.fill();
    ctx.fillStyle = "#9aa4b2";
    ctx.beginPath(); ctx.arc(bx + 20, 168.5, 1.8, 0, 7); ctx.fill();
    // neck joining tank to bowl
    ctx.fillStyle = porcelain;
    ctx.fillRect(bx + 19, 186, 14, 8);
    // bowl: rounded front tapering into the pedestal
    ctx.beginPath();
    ctx.moveTo(bx + 11, 199);
    ctx.bezierCurveTo(bx + 11, 214, bx + 18, 220, bx + 20, 226);
    ctx.lineTo(bx + 19, 234);
    ctx.lineTo(bx + 33, 234);
    ctx.lineTo(bx + 32, 226);
    ctx.bezierCurveTo(bx + 34, 220, bx + 41, 214, bx + 41, 199);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.moveTo(bx + 33, 204);
    ctx.bezierCurveTo(bx + 37, 210, bx + 34, 220, bx + 32, 226);
    ctx.lineTo(bx + 33, 234); ctx.lineTo(bx + 29, 234);
    ctx.bezierCurveTo(bx + 31, 222, bx + 34, 212, bx + 33, 204);
    ctx.fill();
    // foot + floor shadow, with the bolt caps
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(cx, 236, 13, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e9eaea";
    rr(ctx, bx + 16, 231, 20, 4, 2); ctx.fill();
    ctx.fillStyle = "#cfd3d8";
    ctx.beginPath(); ctx.arc(bx + 18, 232.5, 1.3, 0, 7); ctx.arc(bx + 34, 232.5, 1.3, 0, 7); ctx.fill();
    // seat ring, hinges and the water in the bowl
    ctx.fillStyle = "#f4f4f1";
    ctx.beginPath(); ctx.ellipse(cx, 199, 15.5, 6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.ellipse(cx, 199.5, 15.5, 6, 0, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = "#aab2bc";
    ctx.fillRect(bx + 18, 192, 4, 2); ctx.fillRect(bx + 30, 192, 4, 2);
    ctx.fillStyle = "#8fa3b0";
    ctx.beginPath(); ctx.ellipse(cx, 199, 10.5, 3.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#bfe3ef";
    ctx.beginPath(); ctx.ellipse(cx, 200, 7.5, 2.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(bx + 14, 166, 2, 14);
    ctx.fillRect(bx + 15, 205, 2, 9);
    if (dirty > 0.08) drawStallGrime(i, bx, cx, dirty);
    ctx.restore();
    if (stallDoorClosed(i)) {
      ctx.fillStyle = `hsl(${s.pax.hue}, 55%, 55%)`;
      ctx.fillRect(bx + 16, 122, 20, 26); // someone's in there (the closed door hides them below)
    } else {
      // free or walk-in — the door leaf swings open against the wall
      ctx.fillStyle = "#2c3345";
      ctx.fillRect(bx + 44, 108, 8, 138);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(bx + 44, 108, 2, 138); // its edge
    }
  }
  drawHoseStation(); // beside the stall row
  // EXIT door (top center of the back wall)
  const ex = COUNTER_IN.exit;
  const exTop = -offY; // the frame runs to the top of the wall — no gap above the door
  const exMidY = (exTop + ex.y + ex.h) / 2;
  const exBot = ex.y + ex.h;
  const exCx = ex.x + ex.w / 2;
  // brushed-steel frame
  const frame = ctx.createLinearGradient(ex.x, 0, ex.x + ex.w, 0);
  frame.addColorStop(0, "#6f7682");
  frame.addColorStop(0.5, "#a9b0bb");
  frame.addColorStop(1, "#5d636e");
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(ex.x - 3, exTop, ex.w + 6, exBot - exTop); // shadow on the wall
  ctx.fillStyle = frame;
  ctx.fillRect(ex.x, exTop, ex.w, exBot - exTop);
  // door leaf
  const lx = ex.x + 5, lw = ex.w - 10, ly = exTop + 4, lh = exBot - 2 - ly;
  const leaf = ctx.createLinearGradient(lx, 0, lx + lw, 0);
  leaf.addColorStop(0, "#6b4428");
  leaf.addColorStop(0.45, "#7d5232");
  leaf.addColorStop(1, "#553420");
  ctx.fillStyle = leaf;
  ctx.fillRect(lx, ly, lw, lh);
  // recessed panels
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(lx + 5.5, ly + 5.5, lw - 11, lh * 0.42);
  ctx.strokeRect(lx + 5.5, ly + lh * 0.42 + 9.5, lw - 11, lh * 0.58 - 15);
  ctx.strokeStyle = "rgba(255,220,180,0.12)";
  ctx.strokeRect(lx + 6.5, ly + 6.5, lw - 11, lh * 0.42);
  ctx.strokeRect(lx + 6.5, ly + lh * 0.42 + 10.5, lw - 11, lh * 0.58 - 15);
  // illuminated green exit sign on the leaf
  ctx.font = "bold 12px system-ui, sans-serif";
  const sw = ctx.measureText("ÇIKIŞ").width + 14, sh = 17;
  ctx.save();
  ctx.shadowColor = "rgba(80, 255, 140, 0.7)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#1e9e4f";
  rr(ctx, exCx - sw / 2, exMidY - sh / 2, sw, sh, 3); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  rr(ctx, exCx - sw / 2, exMidY - sh / 2, sw, sh, 3); ctx.stroke();
  ctx.fillStyle = "#f2fff5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle"; // dead-center of the door (exMidY) — not baseline-dependent
  ctx.fillText("ÇIKIŞ", exCx, exMidY + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic"; // restore for the rest of the scene
  // the guests (drawn 5x — the room is a close-up)
  for (const b of buses) for (const p of b.pax) if (isIndoorPax(p) && p.state !== "scrubC") drawPax(p, 5);
  // the stall doors close while someone is inside — drawn AFTER the guests so
  // the closed leaf hides the person (and the grime) from the counter side
  for (let i = 0; i < WC_STALLS; i++) {
    if (!stallDoorClosed(i)) continue; // free + walk-in stalls show their ajar leaf above
    const bx = stallBay(i).x;
    ctx.fillStyle = "#46506b";
    // The leaf is painted AFTER the counter (so it hides the occupant); it
    // spans the full opening (y 106–246), which ends well above the counter top.
    rr(ctx, bx + 1, 106, 50, 140, 3); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    rr(ctx, bx + 1, 106, 50, 140, 3); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#cfd6e4";
    ctx.beginPath(); ctx.arc(bx + 9, 178, 2.5, 0, 7); ctx.fill(); // handle
    ctx.fillStyle = "#ff6b6b";                                    // "in use" lamp
    ctx.beginPath(); ctx.arc(bx + 26, 118, 3, 0, 7); ctx.fill();
  }
  // guests passing IN FRONT of a closed door draw above the leaf — the stall's
  // own occupant is excluded, so they stay hidden behind their door
  for (const b of buses) for (const p of b.pax)
    if (isIndoorPax(p) && p.state !== "scrubC" && paxInFrontOfClosedDoor(p)) drawPax(p, 5);
  // the counter (first-person view) is painted over the guests, so whoever
  // stands at the pay spot is seen behind its ledge, not on top of it
  drawCounterIn();
  drawCounterInPrompts();
  // the caught runaway scrubs in front of everything (drawn from the sequence
  // itself, so they stay visible even if their bus has already pulled out)
  drawScrub();
  // wavy stink lines rise only from the stalls that are actually dirty
  const stinkT = performance.now() / 1000;
  ctx.lineCap = "round";
  for (let i = 0; i < WC_STALLS; i++) {
    const sc = S.stallClean[i];
    if (sc >= 45) continue;
    const k = (45 - sc) / 45;
    const bx = stallBay(i).x;
    const n = 1 + Math.round(k * 2);
    ctx.lineWidth = 2;
    for (let w = 0; w < n; w++) {
      const ph = ((stinkT * 0.45 + w / n + i * 0.37) % 1);
      const x0 = bx + 14 + w * 12;
      const y0 = 90 - ph * 30;
      ctx.strokeStyle = `rgba(150, 190, 90, ${k * 0.8 * Math.sin(ph * Math.PI)})`;
      ctx.beginPath();
      for (let s2 = 0; s2 <= 10; s2++) {
        const yy = y0 - s2 * 2.2;
        const xx = x0 + Math.sin(s2 * 0.8 + stinkT * 3 + w * 2) * 3;
        s2 ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  ctx.lineWidth = 1;
  // the cleaning hose in hand: drapes from its faucet to the pointer; holding
  // the mouse sprays the stall under it (hoseApply throttles the actual work)
  if (hoseInHand) {
    const st = COUNTER_IN.hose;
    drawHoseLine(st.x + st.w / 2, st.y + 49, pointer.x, pointer.y); // from the faucet spout
    if (pointerDown) {
      const si = stallAt(pointer.x, pointer.y);
      if (si >= 0) {
        const closed = stallDoorClosed(si);
        if (closed) {
          // the door is shut — the spray bounces off
          ctx.fillStyle = "rgba(255, 120, 120, 0.9)";
          ctx.font = "bold 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("kapı kapalı", pointer.x, pointer.y - 14);
          ctx.textAlign = "left";
        } else {
          drawHoseSpray(pointer.x, pointer.y, performance.now());
        }
      }
    }
    drawHoseNozzle(pointer.x, pointer.y);
  }
  // a sparkle burst where a stall just hit 100
  const gnow = performance.now();
  for (let i = 0; i < WC_STALLS; i++) {
    const age = gnow - hoseGleam[i];
    if (hoseGleam[i] === 0 || age > 1200) continue;
    ctx.fillStyle = `rgba(160, 235, 255, ${1 - age / 1200})`;
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✨", stallBay(i).x + 26, 91);
    ctx.textAlign = "left";
  }
  // the waiting-for-a-toilet badge — drawn last so guests and stall doors never cover it
  drawExitQueueBadge();
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
  ctx.fillText((coarseQ ? "girmek için dokun" : "girmek için tıkla") + " ↓", 851, 84);
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
    ctx.fillText("🚿 yıka", b.cx, LOT_NOSE - 6);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawRoadSign(x, y, label, alignRight) {
  ctx.font = "bold 11px system-ui";
  const w = ctx.measureText(label).width + 14;
  const sx = alignRight ? x - w : x;
  ctx.fillStyle = "#1f6b45";
  rr(ctx, sx, y, w, 16, 3); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1;
  rr(ctx, sx + 1.5, y + 1.5, w - 3, 13, 2); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText(label, sx + 7, y + 12);
}

function drawRoads() {
  const nf = nightFactor();
  const g = ctx.createLinearGradient(0, ROAD.top, 0, ROAD.bot);
  g.addColorStop(0, mix("#3f4655", "#191e28", nf * 0.7));
  g.addColorStop(1, mix("#353b48", "#151921", nf * 0.7));
  ctx.fillStyle = g;
  ctx.fillRect(-offX, ROAD.top, Wdyn, ROAD.bot - ROAD.top);        // main road
  drawSpeckle(ROAD.top, ROAD.bot, 21);
  ctx.fillStyle = "rgba(0,0,0,0.09)";                               // worn tire tracks
  for (const y of [448, 470, 500, 516]) ctx.fillRect(-offX, y, Wdyn, 6);
  drawGrassBand(ROAD.bot, H + offY, nf, 31);                        // grass strip below
  ctx.fillStyle = mix("#bcc2cb", "#3d434e", nf * 0.7);
  ctx.fillRect(-offX, ROAD.bot, Wdyn, 4);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(-offX, ROAD.bot + 4, Wdyn, 2);
  ctx.strokeStyle = `rgba(240, 230, 180, ${0.85 - nf * 0.3})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath(); ctx.moveTo(-offX, 486); ctx.lineTo(Wdyn, 486); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-offX, ROAD.top + 3); ctx.lineTo(560, ROAD.top + 3); ctx.stroke();
  ctx.setLineDash([18, 14]);   // dashed = where buses turn onto the lot
  ctx.beginPath(); ctx.moveTo(560, ROAD.top + 3); ctx.lineTo(Wdyn, ROAD.top + 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(-offX, ROAD.bot - 3); ctx.lineTo(Wdyn, ROAD.bot - 3); ctx.stroke();
  drawRoadSign(-offX + 8, ROAD.top + 5, `${DEST_A} →`, false);
  drawRoadSign(Wdyn - offX - 8, ROAD.top + 5, `${DEST_B} →`, true);
}

function drawBus(b) {
  // While horizontal (on the road) the bus reads side-on. As it rotates
  // nose-up into the lot — and back out — it faces away from us, so the
  // sprite crossfades to a rear + top view. |sin(ang)| is 0 when level and
  // 1 when nose-up, and the enter/exit turns animate the angle itself.
  const t = clamp((Math.abs(Math.sin(b.ang)) - 0.3) / 0.45, 0, 1);
  const v = t * t * (3 - 2 * t); // short crossfade mid-turn, so the two views rarely ghost
  if (v >= 0.99) { drawBusRearTop(b, 1); return; }
  if (v <= 0.01) { drawBusSide(b, 1); return; }
  drawBusSide(b, 1 - v);
  drawBusRearTop(b, v);
}

const blinkOn = () => Math.floor(performance.now() / 380) % 2 === 0;

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
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, 46, len / 2 - 2, 6, 0, 0, 7); ctx.fill();
  // body (centered; +x = nose)
  ctx.fillStyle = `hsl(${b.hue}, 55%, ${58 - nf * 15}%)`;
  rr(ctx, -len / 2, -33, len, 66, 12); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  rr(ctx, -len / 2 + 8, -31, len - 16, 4, 2); ctx.fill();
  ctx.fillStyle = `hsl(${b.hue}, 60%, ${38 - nf * 10}%)`;
  ctx.fillRect(-len / 2 + 2, 17, len - 4, 4);
  // skirt
  ctx.fillStyle = `hsl(${b.hue}, 40%, 30%)`;
  ctx.fillRect(-len / 2 + 4, 25, len - 8, 10);
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
        const hy = 2 + (1 - sc) * 3;
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
  // tail light (brighter on the brakes), reverse lamp, left indicator
  ctx.fillStyle = b.brake ? "#ff3b2e" : nf > 0.4 ? "#e0473a" : "#9c2a24";
  ctx.fillRect(-len / 2, 2, 4, 12);
  if (b.brake) {
    ctx.fillStyle = "rgba(255,60,40,0.35)";
    ctx.beginPath(); ctx.arc(-len / 2, 8, 12, 0, 7); ctx.fill();
  }
  if (b.rev) { ctx.fillStyle = "#f4f7ff"; ctx.fillRect(-len / 2, 15, 4, 5); }
  if (b.blink && blinkOn()) {
    ctx.fillStyle = "#ffb52e";
    ctx.fillRect(-len / 2, -4, 4, 5);
    ctx.fillRect(len / 2 - 4, 14, 4, 6);
  }
  // wheels
  ctx.fillStyle = "#141821";
  for (const wx of [-len / 2 + 34, len / 2 - 44]) {
    ctx.beginPath(); ctx.arc(wx, 35, 12, 0, 7); ctx.fill();
    ctx.fillStyle = "#7d8696";
    ctx.beginPath(); ctx.arc(wx, 35, 6.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a4150";
    ctx.beginPath(); ctx.arc(wx, 35, 3, 0, 7); ctx.fill();
    ctx.fillStyle = "#141821";
  }
  ctx.restore();
}

// Rear + top view — a parked bus, nose pointing away from us. We see the
// roof (lighter panel, AC units, windshield at the far end) and the back of
// the bus (rear window, route display, tail lights) at the near end.
function drawBusRearTop(b, alpha) {
  const len = b.len, nf = nightFactor();
  const cx = 0, top = -len / 2, bot = len / 2; // local frame: nose up, rotated to the heading below
  const r = Math.min(12, len / 4);
  const slant = 6; // slight perspective taper: the far (top) end reads narrower
  const tl = cx - 27, tr = cx + 27;   // front end, 54 wide
  const bl = cx - 33, br = cx + 33;   // rear end, 66 wide
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.ang + Math.PI / 2);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  rr(ctx, bl + 4, top + 6, br - bl, len, r); ctx.fill();
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
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  rr(ctx, cx - 22, top + 29, 10, len - 76, 5); ctx.fill();
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
  if (nf > 0.4 || b.brake) {
    ctx.fillStyle = `rgba(255, 80, 60, ${b.brake ? 0.6 : 0.45 * nf})`; // soft glow
    rr(ctx, cx - 30, bot - 15, 20, 13, 5); ctx.fill();
    rr(ctx, cx + 10, bot - 15, 20, 13, 5); ctx.fill();
  }
  ctx.fillStyle = b.brake ? "#ff3b2e" : nf > 0.4 ? "#ff6355" : "#c9352f";
  ctx.fillRect(cx - 26, bot - 11, 10, 5);
  ctx.fillRect(cx + 16, bot - 11, 10, 5);
  if (b.rev) { // reverse lamps
    ctx.fillStyle = "#f4f7ff";
    ctx.fillRect(cx - 14, bot - 11, 6, 5);
    ctx.fillRect(cx + 8, bot - 11, 6, 5);
  }
  if (b.blink && blinkOn()) { // left indicator, front and rear corners
    ctx.fillStyle = "#ffb52e";
    ctx.fillRect(bl + 1, bot - 12, 5, 7);
    ctx.fillRect(tl, top + 4, 5, 6);
  }
  ctx.restore();
}

function drawCar(c) {
  const x = c.x, y = c.y, nf = nightFactor();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(x + 26, y, 29, 4, 0, 0, 7); ctx.fill();
  if (nf > 0.4) { // headlight beam — cars drive left
    const hg = ctx.createLinearGradient(x, 0, x - 80, 0);
    hg.addColorStop(0, `rgba(255,240,180,${0.35 * nf})`);
    hg.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 18); ctx.lineTo(x - 80, y - 24); ctx.lineTo(x - 80, y - 2); ctx.lineTo(x + 2, y - 12);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = `hsl(${c.hue}, 50%, ${50 - nf * 12}%)`;
  rr(ctx, x, y - 22, 52, 16, 6); ctx.fill();
  ctx.fillStyle = `hsl(${c.hue}, 45%, ${60 - nf * 14}%)`;
  rr(ctx, x + 10, y - 30, 30, 10, 5); ctx.fill();
  ctx.fillStyle = mix("#cfe8ff", "#26364e", nf * 0.8);
  rr(ctx, x + 13, y - 28, 11, 7, 2); ctx.fill();
  rr(ctx, x + 26, y - 28, 11, 7, 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 5, y - 20, 42, 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x + 25, y - 21, 1, 13);
  ctx.fillRect(x + 3, y - 10, 46, 3);
  ctx.fillStyle = nf > 0.4 ? "#fff6d0" : "#f2ead0";
  ctx.fillRect(x, y - 18, 3, 4);
  ctx.fillStyle = nf > 0.4 ? "#ff4a3a" : "#b8322a";
  ctx.fillRect(x + 49, y - 18, 3, 4);
  for (const wx of [x + 12, x + 40]) {
    ctx.fillStyle = "#141821";
    ctx.beginPath(); ctx.arc(wx, y - 4, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#8a93a3";
    ctx.beginPath(); ctx.arc(wx, y - 4, 2.2, 0, 7); ctx.fill();
  }
}

// Per-guest walk-cycle state, keyed by the live pax object so it never lands in saves.
const paxAnim = new WeakMap();
// states where the guest is dealing with you face to face, whatever way they last walked
const PAX_FACE_STATES = new Set(["serveR", "payC", "doneC", "payC2", "dripC"]);
function paxGait(p) {
  const now = performance.now();
  let a = paxAnim.get(p);
  if (!a) { a = { x: p.x, y: p.y, t: now, ph: Math.random() * 6.3, amp: 0, hold: 0, dir: 1, hx: 0, back: false, side: false }; paxAnim.set(p, a); return a; }
  const dt = Math.min(0.1, (now - a.t) / 1000);
  a.t = now;
  if (paused || dt <= 0) return a;
  const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
  a.x = p.x; a.y = p.y;
  if (d > 0.02 && d < 200) { // big jumps are teleports (e.g. stepping off the bus), not steps
    a.hold = 0.15;
    if (Math.abs(dx) > 0.01) a.dir = dx > 0 ? 1 : -1;
    if (Math.abs(dy) > 0.01 && Math.abs(dy) > Math.abs(dx) * 0.35) a.back = dy < 0; // heading up-screen = walking away
    a.hx += (Math.abs(dx) / d - a.hx) * Math.min(1, dt * 8);
    a.ph += clamp(d / dt / 9, 7, p.runaway ? 16 : 11) * dt;
  } else a.hold -= dt;
  if (a.hx > 0.6) a.side = true; else if (a.hx < 0.4) a.side = false; // hysteresis: no flicker on diagonals
  const target = a.hold > 0 ? 1 : 0;
  a.amp += (target - a.amp) * Math.min(1, dt * 10);
  if (a.amp < 0.02 && !target) a.amp = 0;
  return a;
}

function drawPax(p, k = 1) {
  const x = p.x, y = p.y;
  const s = k * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale); // body size — kids are small
  const g = paxGait(p);
  const faceOn = PAX_FACE_STATES.has(p.state);
  // side-on travel draws a profile, mirrored so it always faces +x locally
  const side = g.side && !faceOn;
  const amp = g.amp, dir = side ? 1 : g.dir, sw = Math.sin(g.ph);
  const stride = amp * (0.45 + 0.55 * g.hx); // side-on walks scissor more than walks toward/away
  // facing direction on screen: x for side-on travel, y (depth, foreshortened) for toward/away
  const fwdX = dir * g.hx, fwdY = (g.back ? -1 : 1) * (1 - g.hx) * 0.45;
  const bob = -Math.abs(Math.cos(g.ph)) * 0.7 * s * amp;
  const cloth = `hsl(${p.hue}, 55%, 55%)`;
  const clothDk = `hsl(${p.hue}, 50%, 42%)`;
  const clothLt = `hsl(${p.hue}, 60%, 66%)`;
  const pants = `hsl(${(p.hue * 7 + 200) % 360}, 18%, 24%)`;
  const shoe = "#1d1f26";
  const skin = p.skin || "#e8b88e", hair = p.hair || "#362718";
  const isW = p.type === "w";
  const back = g.back && !faceOn && !side;

  ctx.save();
  if (side && g.dir < 0) { ctx.translate(2 * x, 0); ctx.scale(-1, 1); }
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.beginPath(); ctx.ellipse(x, y + 0.4 * s, (4.6 + Math.abs(sw) * stride * 1.2) * s, 1.3 * s, 0, 0, 7); ctx.fill();

  const hipY = y - 5.6 * s + bob;
  const legs = [-1, 1].map(i => {
    const ls = i < 0 ? sw : -sw; // legs swing in opposite phase
    const lift = Math.max(0, i < 0 ? Math.cos(g.ph) : -Math.cos(g.ph)) * 1.3 * s * amp;
    return {
      hx: x + i * (side ? 0.5 : 1.5) * s, hy: hipY,
      fx: x + i * (side ? 0.5 : 1.6) * s + ls * 2.4 * s * stride * fwdX,
      fy: y - 0.6 * s - lift + ls * 2.4 * s * stride * fwdY,
    };
  });
  // front: the leg stepping back is drawn first so the leading leg overlaps it;
  // back: the left leg always sits on top of the right
  if (back) legs.reverse();
  else if (!side) legs.sort((a, b) => b.fy - a.fy);
  for (const L of legs) {
    const legW = (isW ? 1.9 : 2.5) * s;
    if (back) { // only the heel shows, tucked under the leg
      ctx.fillStyle = shoe;
      rr(ctx, L.fx - legW * 0.45, L.fy, legW * 0.9, legW * 0.5 + 0.7 * s, 0.4 * s); ctx.fill(); // peeks out past the leg's round cap
    }
    ctx.strokeStyle = isW ? skin : pants;
    ctx.lineWidth = legW;
    ctx.beginPath(); ctx.moveTo(L.hx, L.hy); ctx.lineTo(L.fx, L.fy); ctx.stroke();
    if (side) { // toe points forward
      ctx.fillStyle = shoe;
      rr(ctx, L.fx - 1 * s, L.fy - 0.4 * s, 2.9 * s, 1.3 * s, 0.6 * s); ctx.fill();
    } else if (!back) {
      ctx.fillStyle = shoe;
      rr(ctx, L.fx - 1.3 * s + dir * 0.4 * s, L.fy - 0.4 * s, 2.6 * s, 1.3 * s, 0.6 * s); ctx.fill();
    }
  }

  // arms: swing against the legs; some states pose the right hand
  const shY = y - 10.6 * s + bob;
  let reach = null;
  if (p.state === "serveR") reach = { x: x + 5.2 * s, y: y - 8 * s };
  else if (p.state === "payC" || p.state === "doneC" || p.state === "payC2") reach = { x: x + 4.6 * s, y: y - 7.2 * s };
  else if (p.state === "dripC") reach = { x: x + 3.8 * s, y: y - 15 * s };
  const armW = (isW ? 1.6 : 1.9) * s;
  const arm = (i, back) => {
    const ax = x + (side ? -0.3 : i * 3.3) * s, ay = shY;
    let hx, hy, ex, ey;
    if (i > 0 && reach) {
      hx = reach.x; hy = reach.y;
      // a posed arm's elbow drops below the shoulder→hand line, never kinks up
      const vx = hx - ax, vy = hy - ay, vl = Math.hypot(vx, vy) || 1;
      let px = -vy / vl, py = vx / vl;
      if (py < 0) { px = -px; py = -py; }
      ex = (ax + hx) / 2 + px * 1.1 * s; ey = (ay + hy) / 2 + py * 1.1 * s;
    } else {
      const as = (i < 0 ? -sw : sw) * stride;
      hx = x + (side ? 0.2 : i * 3.9) * s + as * 2.2 * s * fwdX;
      hy = y - 5.6 * s + bob - Math.abs(as) * 0.5 * s + as * 2.2 * s * fwdY;
      // elbows only fold one way: they point behind the walker (more so as the arm swings forward)
      const bend = (0.35 + 0.5 * Math.max(0, as)) * s;
      ex = (ax + hx) / 2 + i * 0.5 * s * (1 - g.hx) - fwdX * bend;
      ey = (ay + hy) / 2 - fwdY * bend;
    }
    ctx.strokeStyle = back ? clothDk : cloth;
    ctx.lineWidth = armW;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(hx, hy, armW * 0.55, 0, 7); ctx.fill();
  };
  // the arm on the far side of the walking direction sits behind the torso
  arm(-dir, true);

  if (side) {
    // profile: a narrower body, shaded along the back
    if (isW) {
      const sway = sw * stride * 0.4 * s;
      ctx.fillStyle = cloth;
      ctx.beginPath();
      ctx.moveTo(x - 2.4 * s, y - 6.4 * s + bob);
      ctx.lineTo(x + 2.4 * s, y - 6.4 * s + bob);
      ctx.lineTo(x + 3.7 * s + sway, y - 2.4 * s + bob * 0.5);
      ctx.lineTo(x - 3.5 * s + sway, y - 2.4 * s + bob * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = clothDk;
      ctx.fillRect(x - 3.4 * s + sway, y - 3.1 * s + bob * 0.5, 7 * s, 0.7 * s); // hem
      ctx.fillStyle = cloth;
      rr(ctx, x - 2.4 * s, y - 11.6 * s + bob, 4.9 * s, 5.8 * s, 2.3 * s); ctx.fill(); // top
      ctx.fillStyle = clothDk;
      rr(ctx, x - 2.4 * s, y - 11 * s + bob, 1.4 * s, 4.8 * s, 0.7 * s); ctx.fill(); // back shade
    } else {
      ctx.fillStyle = pants;
      rr(ctx, x - 2.4 * s, y - 6.6 * s + bob, 4.8 * s, 2 * s, 0.8 * s); ctx.fill(); // hips
      ctx.fillStyle = cloth;
      rr(ctx, x - 2.6 * s, y - 11.8 * s + bob, 5.4 * s, 6.9 * s, 2.4 * s); ctx.fill(); // torso
      ctx.fillStyle = clothDk;
      rr(ctx, x - 2.6 * s, y - 11.2 * s + bob, 1.5 * s, 6 * s, 0.8 * s); ctx.fill(); // back shade
      ctx.fillRect(x - 2.5 * s, y - 5.8 * s + bob, 5.2 * s, 0.8 * s); // belt line
    }
    ctx.fillStyle = clothLt; // shoulder highlight
    rr(ctx, x - 0.8 * s, y - 11.6 * s + bob, 2.6 * s, 1.1 * s, 0.5 * s); ctx.fill();
    if (p.type === "k") {
      ctx.fillStyle = `hsl(${(p.hue + 150) % 360}, 50%, 45%)`;
      rr(ctx, x - 4.6 * s, y - 11.2 * s + bob * 1.2, 2.6 * s, 5.2 * s, 1 * s); ctx.fill(); // backpack on the back
      ctx.fillRect(x - 0.2 * s, y - 11.6 * s + bob, 0.9 * s, 5 * s); // strap
    }
  } else if (isW) {
    const sway = sw * stride * 0.5 * s * fwdX;
    ctx.fillStyle = cloth;
    ctx.beginPath(); // skirt — flares from the waist, swishing with the stride
    ctx.moveTo(x - 3.2 * s, y - 6.4 * s + bob);
    ctx.lineTo(x + 3.2 * s, y - 6.4 * s + bob);
    ctx.lineTo(x + 4.9 * s + sway, y - 2.4 * s + bob * 0.5);
    ctx.lineTo(x - 4.9 * s + sway, y - 2.4 * s + bob * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = clothDk;
    ctx.fillRect(x - 4.6 * s + sway, y - 3.1 * s + bob * 0.5, 9.2 * s, 0.7 * s); // hem
    ctx.fillStyle = cloth;
    rr(ctx, x - 3.3 * s, y - 11.6 * s + bob, 6.6 * s, 5.8 * s, 2.6 * s); ctx.fill(); // top
    ctx.fillStyle = clothDk;
    rr(ctx, x + 1.4 * s, y - 11 * s + bob, 1.9 * s, 4.8 * s, 1 * s); ctx.fill(); // side shade
  } else {
    ctx.fillStyle = pants;
    rr(ctx, x - 3.2 * s, y - 6.6 * s + bob, 6.4 * s, 2 * s, 0.8 * s); ctx.fill(); // hips
    ctx.fillStyle = cloth;
    rr(ctx, x - 3.7 * s, y - 11.8 * s + bob, 7.4 * s, 6.9 * s, 2.6 * s); ctx.fill(); // torso
    ctx.fillStyle = clothDk;
    rr(ctx, x + 1.6 * s, y - 11.2 * s + bob, 2.1 * s, 6 * s, 1 * s); ctx.fill(); // side shade
    ctx.fillRect(x - 3.5 * s, y - 5.8 * s + bob, 7 * s, 0.8 * s); // hem / belt line
    if (back) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)"; // back seam
      ctx.fillRect(x - 0.3 * s, y - 11 * s + bob, 0.6 * s, 5 * s);
    }
  }
  if (!side) {
    ctx.fillStyle = clothLt; // shoulder highlight
    rr(ctx, x - 2.6 * s, y - 11.6 * s + bob, 3 * s, 1.1 * s, 0.5 * s); ctx.fill();
  }
  if (p.type === "k" && !side) {
    const pack = `hsl(${(p.hue + 150) % 360}, 50%, 45%)`;
    ctx.fillStyle = pack;
    if (back) { // the whole backpack, bouncing a touch behind the step
      rr(ctx, x - 2.7 * s, y - 11.2 * s + bob * 1.2, 5.4 * s, 5.2 * s, 1.6 * s); ctx.fill();
      ctx.fillStyle = `hsl(${(p.hue + 150) % 360}, 45%, 35%)`;
      rr(ctx, x - 1.9 * s, y - 8.4 * s + bob * 1.2, 3.8 * s, 2 * s, 0.8 * s); ctx.fill(); // pocket
    } else { // straps over the shoulders
      ctx.fillRect(x - 2.6 * s, y - 11.6 * s + bob, 0.9 * s, 5 * s);
      ctx.fillRect(x + 1.7 * s, y - 11.6 * s + bob, 0.9 * s, 5 * s);
    }
  }

  arm(dir, false);

  // neck + head (no face) + hair
  const hy = y - 14.6 * s + bob, hr = (isW ? 3.2 : 3.3) * s;
  ctx.fillStyle = skin;
  ctx.fillRect(x - 0.9 * s, hy + hr - 1 * s, 1.8 * s, 1.8 * s);
  ctx.beginPath(); ctx.arc(x, hy, hr, 0, 7); ctx.fill();
  const hb = -bob * 0.4; // long hair lags the bob a little
  if (side) {
    ctx.beginPath(); ctx.arc(x + hr - 0.1 * s, hy + 0.5 * s, 0.75 * s, 0, 7); ctx.fill(); // nose
    ctx.fillStyle = hair;
    if (isW) rr(ctx, x - hr - 0.6 * s, hy - 1.2 * s, 2.8 * s, 7 * s + hb, 1.2 * s), ctx.fill(); // long hair down the back
    ctx.beginPath(); ctx.moveTo(x - 0.2 * s, hy - 0.3 * s);
    ctx.arc(x - 0.2 * s, hy - 0.3 * s, hr + 0.4 * s, Math.PI * 0.7, Math.PI * 1.9); ctx.fill(); // crown + back of the head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(x - 0.4 * s, hy + 0.5 * s, 0.75 * s, 1.1 * s, 0, 0, 7); ctx.fill(); // ear
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.beginPath(); ctx.ellipse(x - 0.4 * s, hy + 0.6 * s, 0.4 * s, 0.7 * s, 0, 0, 7); ctx.fill();
  } else if (back) {
    ctx.beginPath(); // ears peeking out at the sides
    ctx.ellipse(x - hr, hy + 0.4 * s, 0.7 * s, 1.1 * s, 0, 0, 7);
    ctx.ellipse(x + hr, hy + 0.4 * s, 0.7 * s, 1.1 * s, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.save(); // the back of the head is all hair, down to the nape
    ctx.beginPath(); ctx.rect(x - hr * 2, hy - hr * 2, hr * 4, hr * 2 + hr * 0.62); ctx.clip();
    ctx.beginPath(); ctx.arc(x, hy - 0.1 * s, hr + 0.4 * s, 0, 7); ctx.fill();
    ctx.restore();
    if (isW) rr(ctx, x - hr - 0.5 * s, hy - 0.5 * s, 2 * hr + 1 * s, 7.6 * s + hb, 1.8 * s), ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.beginPath(); ctx.arc(x + 0.8 * s, hy, hr * 0.85, -1.2, 1.6); ctx.fill(); // side shade
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.beginPath(); ctx.arc(x + 0.9 * s, hy + 0.5 * s, hr * 0.8, -0.9, 1.9); ctx.fill(); // cheek shade
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(x, hy - 0.3 * s, hr + 0.4 * s, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, hy - 0.9 * s, hr + 0.35 * s, hr * 0.55, 0, Math.PI, Math.PI * 2); ctx.fill();
    if (isW) { // long hair framing the sides
      rr(ctx, x - hr - 0.9 * s, hy - 1.2 * s, 1.8 * s, 6.4 * s + hb, 0.9 * s); ctx.fill();
      rr(ctx, x + hr - 0.9 * s, hy - 1.2 * s, 1.8 * s, 6.4 * s + hb, 0.9 * s); ctx.fill();
    }
  }
  if (p.type === "k") {
    ctx.fillStyle = `hsl(${(p.hue + 150) % 360}, 55%, 50%)`; // ball cap
    ctx.beginPath(); ctx.arc(x, hy - 0.4 * s, hr + 0.3 * s, Math.PI, Math.PI * 2); ctx.fill();
    if (!back) ctx.fillRect(x - (dir < 0 ? hr + 1.6 * s : -0.2 * s), hy - 0.9 * s, hr + 1.8 * s, 0.9 * s); // brim
  }
  ctx.restore();

  // little indicators
  if (p.state === "serveR") {
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath(); ctx.arc(x + 6 * s, y - 8 * s, 2.5 * s, 0, 7); ctx.fill();
  }
  if (p.state === "payC" || p.state === "doneC" || p.state === "payC2") {
    drawHeldBill(x + 5 * s, y - 6.5 * s, 0.3 * s, BILL_COLORS[p.bill] || "#c9c2a8", p.bill); // handing the bill
  }
  if (p.state === "dripC") {
    const f = clamp(1 - p.dripT / 0.8, 0, 1);
    ctx.fillStyle = "rgba(200, 130, 40, 0.9)";
    ctx.fillRect(x + 2.9 * s, y - 11 * s + f * 13 * s, 1.6 * s, 2.6 * s); // falling drop
    ctx.fillStyle = "rgba(255, 230, 180, 0.7)";
    ctx.fillRect(x + 0.5 * s, y - 9 * s, 1.5 * s, 1.5 * s);
    ctx.fillRect(x + 5.5 * s, y - 12 * s, 1.5 * s, 1.5 * s); // sparkles
  }
  // a red badge over the head of a runaway still inside the WC — the "click
  // to catch" signal (hidden while a scrub runs — nobody is catchable then).
  // Queue-leavers get no badge: they are never catchable.
  if (p.runaway && p.state === "leaveC" && !scrub) {
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
    const bx = x + 8 * s, by = y - 21 * s;
    ctx.fillStyle = `rgba(255, 80, 80, ${0.3 * pulse})`;
    ctx.beginPath(); ctx.arc(bx, by, 8 * s, 0, 7); ctx.fill(); // pulsing halo
    ctx.fillStyle = "#e33";
    ctx.beginPath(); ctx.arc(bx, by, 6 * s, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${7 * s}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", bx, by + s);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
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
  const hh = Math.floor(S.time), mm = Math.floor((S.time % 1) * 60);
  $("statClock").textContent = `Gün ${S.day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  $("repFill").style.width = S.rep + "%";
  $("repNum").textContent = Math.round(S.rep);
  $("btnWc").textContent = S.view === "out" ? "🚻" : "🚪";
  $("btnWc").title = S.view === "wc" ? "Dışarı çık" : S.view === "wash" ? "Dışarı dön" : "WC gişesine gir";
  $("btnPause").textContent = paused ? "▶" : "⏸";
  $("btnSpeed").textContent = speed + "×";
}

function showDaySummary() {
  paused = true;
  const st = S.stats;
  const repDelta = S.rep - st.repStart;
  const avgSat = st.satN ? Math.round(st.satSum / st.satN) : 0;
  $("modalTitle").textContent = `${S.day - 1}. gün tamamlandı`;
  $("modalBody").innerHTML = `
    <table>
      <tr><td>Hizmet verilen otobüs</td><td>${st.buses}</td></tr>
      <tr><td>Hizmet verilen misafir</td><td>${st.served}</td></tr>
      <tr><td>Dökülen kolonya</td><td>${st.cologne}</td></tr>
      <tr><td>Yıkanan ön cam</td><td>${st.washes}</td></tr>
      <tr><td>Kaçırılan ₺20 ücret</td><td>${st.evaded || 0}</td></tr>
      <tr><td>Yakalanan kaçak</td><td>${st.caught || 0}</td></tr>
      <tr><td>Ort. memnuniyet</td><td>${st.satN ? avgSat + " / 100" : "—"}</td></tr>
      <tr><td>İtibar</td><td class="${repDelta >= 0 ? "pos" : "neg"}">${Math.round(st.repStart)} → ${Math.round(S.rep)} (${repDelta >= 0 ? "+" : ""}${repDelta.toFixed(1)})</td></tr>
    </table>
    <div class="big">${repDelta >= 3 ? "Ünün yayılıyor — yarın daha büyük otobüsler bekle."
      : repDelta <= -3 ? "Zor bir gündü. Tuvaletleri temiz tut."
      : "Mola Yeri'nde sakin bir gün."}</div>`;
  $("modalBtn").textContent = `${S.day}. güne başla →`;
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
  const touch = coarseQ; // phones & tablets — say "tap" where the desktop says "click"
  const act = touch ? "dokun" : "tıkla";
  $("modalTitle").textContent = first ? "👋 Mola Yeri'ne hoş geldin" : "Nasıl oynanır";
  $("modalBox").classList.add("tall"); // both intro screens are scrollable
  $("modalBody").innerHTML = `
    <div class="big"><strong>${DEST_A}</strong> ile <strong>${DEST_B}</strong> arasındaki her tur otobüsünün güvendiği mola yerini sen işletiyorsun.</div>
    <p>🚌 Otobüsler mola vermek için otoparkına girer. Yolcular acıkır, susar ve <strong>tuvalet</strong> için can atar.</p>
    <p>🍔 Lokantadaki yemek ve içecekler <strong>bedava</strong> — otobüs beklerken misafirler yer, içer ve etrafta dolaşır.</p>
    <p>⏱ Otobüsler yaklaşık <strong>30 dakika</strong> mola verir — terminalde en fazla bir saat kalabilirler. Kalkış vakti gelince <strong>WC ödeme sırasındaki</strong> misafirlere ödemeyi bitirmeleri için <strong>5–10 dakika</strong> tanınır; sıra hâlâ duruyorsa <strong>ödemeden sırayı terk edip</strong> otobüse binerler ve otobüs kalkar.</p>
    <p>🕐 Zaman <strong>sıkıştırılmıştır</strong> — 1× hızda bir oyun saati gerçekte 6 dakika sürer, yani bir oyun günü yaklaşık 2,4 gerçek saattir. Otobüsler, yemekler ve sıralar oyun içi temposunu korur.</p>
    <p>🚻 Tuvalet <strong>₺20</strong>; ücret ziyaretten <em>sonra</em> gişede ödenir — ve gişe <strong>sensin</strong>. <strong>İçeri girmek için WC binasına ${act}</strong>: içinde biri varken <strong>her kabinin kapısı kapanır</strong> (bir ziyaret oyun içinde 1–10 dakika sürer) ve <strong>her kabinin kendi temizliği vardır</strong> — kirli kabin ziyaretin puanını düşürür, misafirler hep <strong>en temiz boş kabini</strong> seçer (çok pis olanı kimse kullanmaz).</p>
    <p>💳 İçeride işini bitiren her misafir gişedeki sıraya girer ve sana bir banknot uzatır. Doğru para üstünü vermek için <strong>açık kasa çekmecesindeki gözlere ${act}</strong> (₺10 / ₺20 / ₺50) — ve <strong>misafirler banknotları sayar</strong>: aynı tutarı daha az banknotla vermek daha iyi puan alır (₺30'u 10+20 olarak vermek şıktır, 10+10+10 bir avuç kâğıttır; ₺80 için 10+20+50, 10×8'den iyidir). <strong>Tam ₺20</strong> veren misafirlerin sana ihtiyacı yok: <strong>kendi ikinci sıralarında</strong> durur, kendileri öder ve ÇIKIŞ kapısına yönelirler — para üstü yok, kolonya yok, tıklama yok. Eksik ya da hiç verilmeyen para üstü diğer misafirleri mutsuz eder.</p>
    <p>💨 Gişede 500 ml'lik bir şişe <strong>limon kolonyası</strong> durur. Öndeki misafir öderken ellerine biraz dökmek için <strong>şişeye ${act}</strong>. Para üstü eline geçer geçmez ÇIKIŞ kapısına yönelir (tam ₺20 sırası kendi kendine öder — kolonya ana sıranın öndeki misafiri içindir), o yüzden erken dök. Şişe gece yarısı dolar.</p>
    <p>🍵 <strong>Çayın</strong> gişede durur ve yaklaşık 30 oyun dakikasında biter. Taze bir bardak istemek için gişenin sağ ucundaki <strong>interkoma ${act}</strong> — 2 oyun dakikası içinde gelir.</p>
    <p>🚪 Dışarı çıkmak için <strong>ÇIKIŞ kapısına</strong> ${act}${touch ? "" : " — ya da <strong>E</strong> tuşuna bas"}. Üst çubuktaki 🚻 / 🚪 düğmesi de aynı işi yapar.</p>
    <p>🧻 <strong>Her kabin her kullanımda biraz daha kirlenir</strong> (her kabinin üstündeki çubuğu izle). Eski anında temizlik artık yok: kabinlerin yanındaki <strong>hortumu al</strong> ve <strong>${touch ? "parmağını basılı tutup" : "fareyi basılı tutup"} bir kabinin üzerinde sürükle</strong>, su sıkıp temizle — ama <strong>kapısı kapalı</strong> (içinde biri olan) bir kabine su sıkılamaz.</p>
    <p>🚿 Otobüsler tozlu gelir. Önüne geçmek için <strong>park etmiş bir otobüse ${act}</strong>: <strong>uzun saplı fırçayı al ve ön camın üzerinde sürükle</strong>, köpükle; sonra <strong>temiz su hortumunu al ve köpüğü durula</strong>. <strong>Bırakmak</strong> için alete yeniden ${act}. Pırıl pırıl bir ön cam şoförün minnetini kazanır.</p>
    <p>💢 İlgilenilmeyen misafirler ödemeden <strong>öfkeyle çıkıp gider</strong>, ★ memnun misafirler ise <strong>itibarını</strong> yükseltir → otobüsler çok daha sık uğrar ve daha kalabalık gelir. Yoğun ve itibarı yüksek bir terminalde aynı anda birkaç otobüs olur — boşalan bir park yeri 30 dakika içinde dolar, asla boş kalmaz.</p>
    <p>🚨 Her misafir <strong>₺20</strong>'yi ödemez. <strong>Ödeme sırasını terk eden</strong> misafirler (sabırları tükendiği ya da otobüsleri kalktığı için) sadece bir <strong>bildirim</strong> olarak görünür — onlara tıklanamaz. Ama bazı misafirler (yaklaşık 100'de 3) <strong>kabinde işini bitirip ödemeden ÇIKIŞ'a koşar</strong>; bunlar <strong>kırmızı rozetle</strong> işaretlenir. Yakalamak için <strong>ÇIKIŞ kapısına varmadan onlara ${act}</strong>: bir paspas kapıp 3 saniye boyunca <strong>bütün tuvaletleri ovarlar</strong> — ve her kabin <strong>pırıl pırıl</strong> olur. Kaçak kapıdan çıktıysa gitmiştir.</p>
    <p><b style="color:var(--good)">Kâr yok, geliştirme yok</b> — para sadece ritüelin bir parçası. ${touch ? "⏸ düğmesi oyunu duraklatır · 1× düğmesi hız kademesini değiştirir (1×, 10×, 100×, 200×)." : "Boşluk tuşu duraklatır · 1–4 tuşları hız kademesini seçer (1×, 10×, 100×, 200×)."}</p>`;
  $("modalBody").scrollTop = 0;
  $("modalBtn").textContent = first ? "Dükkânı aç!" : "İşe dön";
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
    stepScrub(Math.min(0.25, elapsed)); // real seconds — the scrub ignores the speed tier
  }
  drawScene();
  updateHUD();
  requestAnimationFrame(frame);
}

/* ------------------------------- Init ------------------------------- */
function init() {
  const hadSave = load();
  rebuildFacilities();

  $("btnWc").onclick = () => {
    setView(S.view === "out" ? "wc" : "out"); // from the wash view the button also steps back out
  };
  $("btnPause").onclick = () => { paused = !paused; };
  $("btnSpeed").onclick = () => {
    const i = SPEEDS.indexOf(speed);
    speed = i >= 0 ? SPEEDS[(i + 1) % SPEEDS.length] : 1;
  };
  $("btnHelp").onclick = () => { paused = true; showIntro(false); };
  $("btnReset").onclick = () => {
    if (confirm("Bütün oyun sıfırlansın mı? Kayıtlı oyunun silinecek.")) {
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
  // ---- canvas input: pointer events (one code path for mouse + touch) ----
  // toGame maps a pointer event into logical scene coordinates: the 960×540
  // core plus any widescreen extension, minus the centering offset. The
  // canvas is CSS-scaled, so the same math works on a 1280px desktop and a
  // phone.
  const toGame = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (Wdyn / rect.width) - offX,
      y: (e.clientY - rect.top) * (Hdyn / rect.height) - offY,
    };
  };
  const releasePointer = () => { pointerDown = false; activePointer = null; };

  canvas.addEventListener("pointerdown", (e) => {
    if (paused || modalOpen) return;
    if (activePointer !== null) return; // one pointer at a time — no two-finger gestures
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType !== "mouse") e.preventDefault(); // suppress the synthetic click/mouse events
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer released mid-press */ }
    activePointer = e.pointerId;
    const { x, y } = toGame(e);
    // A still touch tap fires no pointermove, so sync the pointer on press too:
    // a tool grabbed by the tap must appear where it was touched, and a held
    // scrub/spray must start from the tap, not wherever the pointer last moved.
    pointer.x = x; pointer.y = y;
    downClient = { x: e.clientX, y: e.clientY };
    // a press in the wash view starts a scrub/spray; holding the cleaning hose
    // sprays the stall under the pointer (per-cell cooldowns throttle the work)
    if (S.view === "wash") { pointerDown = true; washApply(x, y); }
    if (S.view === "wc" && hoseInHand) { pointerDown = true; hoseApply(x, y); }
  });

  canvas.addEventListener("pointermove", (e) => {
    // a touch only tracks while its finger is down; the mouse always hovers
    if (e.pointerType !== "mouse" && activePointer !== e.pointerId) return;
    const { x, y } = toGame(e);
    pointer.x = x; pointer.y = y;
    if (activePointer === e.pointerId) {
      // a held scrub/spray — the per-cell cooldown inside washApply throttles it
      if (S.view === "wash" && pointerDown) washApply(x, y);
      if (S.view === "wc" && pointerDown && hoseInHand) hoseApply(x, y);
    }
    if (e.pointerType !== "mouse") return; // no hover cursor for touch
    const hit = (r, pad = 2) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
    let hot;
    if (S.view === "out") {
      hot = hit(WC_BUILDING) || buses.some(z => z.state === "stop" && !z.washDone
        && x >= z.cx - 36 - 2 && x <= z.cx + 36 + 2 && y >= LOT_NOSE - 2 && y <= z.cy + z.len / 2 + 2);
    } else if (S.view === "wash") {
      hot = hit(WASH.brush) || hit(WASH.hose) || hit(WASH.exit);
      canvas.style.cursor = hot ? "pointer" : (hit(WASH.wind) ? "crosshair" : "default");
      return;
    } else {
      hot = COUNTER_IN.chips.some(c => hit(chipHit(c))) || hit(COUNTER_IN.bottle) || hit(COUNTER_IN.intercom) || hit(COUNTER_IN.exit) || hit(COUNTER_IN.hose)
        || !!runawayAt(x, y, 2);
    }
    canvas.style.cursor = hot ? "pointer" : (S.view === "wc" && hoseInHand && stallAt(x, y) >= 0 ? "crosshair" : "default");
  });

  canvas.addEventListener("pointerup", (e) => {
    const wasActive = activePointer === e.pointerId;
    releasePointer();
    if (!wasActive || paused || modalOpen) return;
    const { x, y } = toGame(e);
    // a press that moved this far was a drag (a hose spray, a scrub) — not a
    // tap. The threshold is in CSS px: a finger jitters more than a mouse, so
    // touch gets a wider tap band (wider still in the "out" view, where there
    // is no drag gesture to protect).
    const moved = downClient ? Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y) : 0;
    const isMouse = e.pointerType === "mouse";
    downClient = null;
    if (moved > (isMouse ? 10 : S.view === "out" ? 24 : 12)) return;
    routePress(x, y, isMouse);
  });
  canvas.addEventListener("pointercancel", releasePointer);
  window.addEventListener("blur", releasePointer);

  // One settled press: routed per view (the former click handler). Fingers are
  // imprecise, so on touch the hit padding grows with the render scale until
  // every target is at least ~10 CSS px per side.
  function routePress(x, y, isMouse) {
    const scale = canvas.getBoundingClientRect().width / Wdyn; // CSS px per logical px
    const padMin = isMouse ? 0 : clamp(10 / scale, 4, 16);
    const hit = (r, pad = 2) => {
      const p = Math.max(pad, padMin);
      return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p;
    };
    if (S.view === "out") {
      // outdoor scene: walk into the WC building, or step up to a parked bus
      if (hit(WC_BUILDING)) { setView("wc"); return; }
      const b = buses.find(z => z.state === "stop" && !z.washDone
        && x >= z.cx - 36 - 2 - padMin && x <= z.cx + 36 + 2 + padMin && y >= LOT_NOSE - 2 - padMin && y <= z.cy + z.len / 2 + 2 + padMin);
      if (b) openWash(b);
      return;
    }
    if (S.view === "wash") {
      // at the bus front: the only tap targets are the two tool stations and
      // the exit — the windshield is worked by holding and dragging
      // (pointerdown/pointermove → washApply), so a plain tap there does nothing.
      if (hit(WASH.exit)) { setView("out"); return; }
      const b = bus();
      if (!b) return;
      // a tap picks a tool up; tapping the one already in hand puts it down
      const w = ensureWash(b);
      if (hit(WASH.brush)) { w.tool = w.tool === "brush" ? "none" : "brush"; return; }
      if (hit(WASH.hose)) { w.tool = w.tool === "hose" ? "none" : "hose"; return; }
      return;
    }
    // inside the counter room: the hose station, till chips, cologne bottle, tea intercom, EXIT door
    if (hit(COUNTER_IN.hose)) { hoseInHand = !hoseInHand; return; } // tap picks up / puts down the hose
    const chip = COUNTER_IN.chips.find(c => hit(chipHit(c)));
    if (chip) { giveChange(chip.d); save(); return; }
    if (hit(COUNTER_IN.bottle)) { offerCologne(); save(); return; }
    if (hit(COUNTER_IN.intercom)) { orderTea(); save(); return; }
    const p = runawayAt(x, y, isMouse ? 2 : 8);
    if (p && catchRunaway(p)) return; // a runaway bound for the EXIT — catch them
    if (hit(COUNTER_IN.exit)) { setView("out"); }
  }
  // test/automation hook (used by the node harness; safe to ignore)
  window.__Layover = {
    front: () => facilities.C.queue[0] || null,
    front2: () => facilities.C.queue2[0] || null,
    queues: () => ({ main: facilities.C.queue.length, exact: facilities.C.queue2.length }),
    bottle: () => S.bottle,
    giveChange, offerCologne,
    setView, view: () => S.view,
    openWash, washApply,
    wash: () => { const b = bus(); return b ? b.wash : null; },
    hose: () => ({ inHand: hoseInHand, apply: hoseApply, stallClean: S.stallClean, bay: stallBay, at: stallAt }),
    scrub: () => scrub,
    catchRunaway, fleeCounter, stormOut, giveUpLine, runawayAt,
    evaders: () => buses.flatMap(b => b.pax).filter(p => p.unpaid),   // every guest who used the WC and never paid
    runaways: () => buses.flatMap(b => b.pax).filter(p => p.runaway), // running for the EXIT right now: the catchable ones
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
  document.addEventListener("visibilitychange", () => { if (document.hidden) { releasePointer(); save(); } });

  if (!hadSave) { paused = true; showIntro(true); }

  requestAnimationFrame(frame);
}

init();
