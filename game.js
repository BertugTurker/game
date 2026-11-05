"use strict";

/* =====================================================================
   LAYOVER LANE — Bus Rest-Stop Simulator
   Tour buses run İstanbul (A) → Trabzon (B) and pull into your layover.
   The Lokanta is closed by default; you run the toilets and the WC counter.
   Click the WC building to step behind the counter: each stall's door
   closes while it's in use, and every stall carries its own dirt — take
   the ₺20 bill, splash Turkish cologne, make change, and keep the stalls
   clean with the tool by the stalls (hold & drag it over a free stall).
   Guests paying an exact ₺20 (no change due) need nothing from you: they
   queue in their own second line, pay on their own, and walk back out.
   Cleanliness is the whole business: the cleaner the stall a guest used,
   the happier they are, and that rating feeds reputation. Guests always
   take the CLEANEST free stall, and none will step into a stall below the
   filth bar — if every free stall is filthy, the line just stands (and
   loses patience) until a clean stall frees up or the hose brings one
   back; if the whole row is filthy beyond the point of no return, no
   guest will use it at all.
   The moment a guest is settled they head out through a side passage.
   Press E (or the 🚪 button) to come back outside.
   Click a parked bus to step up to its front and wash the windshield:
   long-handled brush first (soap), then the fresh-water hose (rinse).
   Progression: every paid service goes into one company cash balance
   (applyTransaction is the only place it changes). A new company starts
   with two alaturka toilets and a hand brush — no cologne, no calculator.
   CONFIG.wcTracks holds the WC's separate upgrade tracks (stall count,
   toilet style up to full automation, cleaning tool, cologne, calculator);
   CONFIG also holds the car-wash tiers, maintenance and the terminal network. G is the one authoritative state; bindTerminal points
   S / buses / facilities at a terminal, and advanceSimulation steps every
   owned terminal on the shared clock, seen or not.
   ===================================================================== */

/* ----------------------------- Config ------------------------------ */
const W = 960, H = 540;
const LOT_MIN_W = 1120; // minimum logical width: with the core centred, the visible right edge is (Wdyn + W) / 2 = 1040 — past bay 10
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
const PARKING_SLOT_COUNT = 10;
const BAY_SLOTS = Array.from({ length: PARKING_SLOT_COUNT }, (_, i) => ({ cx: 170 + i * 84 })); // 10 parallel bus bays across the lot, 84px apart (a bus is 66px wide)
const GRASS = { top: 88, bot: 170 };  // grass strip — the diner and WC stand on it
const BUILD_DX = -225; // shifts the diner (drawn centred on x 705) to the centre of the view; the WC keeps its place beside it
const BUILD_LIFT = 28; // the diner and WC stand this far back from the lot: the strip in front of them is a walkway for guests
const WALK_TOP = 170 - BUILD_LIFT; // the walkway starts at the diner and WC front wall
const LOT   = { top: 170, bot: 432 }; // bus parking lot (asphalt), in front of the diner + WC
const ROAD  = { top: 432, bot: 530 }; // main road (buses drive here — never park on it)

const DINER_SEATS = 3;                     // fixed — no upgrades in this game
const LOKANTA_OPEN = false;                // the diner is closed; guests cannot enter or receive service
const WC_STALLS   = 10;                    // 5 bays in two rows — one on the left, mirrored on the right
const SVC_TIME_R  = 5.4;                   // real seconds per diner guest served
const TOILET_STAY = [6, 60];               // a toilet visit lasts 1–10 in-game minutes (6 s of timeDt per game min)
const TUT_TOILET_STAY = 2.5;                // the first-ever WC guest's stay (timeDt s — 2.5 real s at 1×)
const SVC_TIME_T  = (TOILET_STAY[0] + TOILET_STAY[1]) / 2; // mean visit length — queue patience & save restore
const SAT_BASE    = 60;                    // baseline satisfaction per service
const WC_EVADE    = 0.03;                  // share of finished toilet visits that skip the fee and run for the exit (~3 in 100 — everyone else queues)
const EVADE_WALK  = 132;                   // a runaway's dash, in px per REAL second — catchable at any speed tier
const SCRUB_TIME  = 5;                     // real seconds a caught runaway spends scrubbing every toilet
const WC_NEEDED   = 72;                    // bladder level at which a guest heads for the WC
const WC_TOO_DIRTY  = 25;                   // a stall below this is too filthy to use: guests take the cleanest free stall, and if every FREE stall sits below it the T line stands and waits
const BLADDER_RISE = 85;                   // bladder fill per game hour — the most time-pressed need
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
    { d: 10, x: 360, y: 384, w: 76, h: 98, color: BILL_COLORS[10], label: "10₺" },
    { d: 20, x: 442, y: 384, w: 76, h: 98, color: BILL_COLORS[20], label: "20₺" },
    { d: 50, x: 524, y: 384, w: 76, h: 98, color: BILL_COLORS[50], label: "50₺" },
  ],
  bottle: { x: 318, y: 288, w: 26, h: 52 },   // Turkish cologne standing on the countertop
  desk:   { x: 96, y: 352, w: 768, h: 188 },  // the wooden counter — 10% of the view stays open on each side (the entrances)
  intercom: { x: 790, y: 394, w: 44, h: 62 }, // tea intercom at the right end of the counter (click to order a fresh tea)
  hose:   { x: 18, y: 238, w: 60, h: 96 },   // faucet + coiled hose left of the stall row (x/y track the view — see resize)
  bucket: { x: 18, y: 340, w: 60, h: 96 },   // bucket + brush on the floor left of the stall row (x/y track the view — see resize)
};
// The open passages either side of the counter, 10% of the visible width each.
const SIDE_GAP = 0.1;
const sideGapX = right => right ? -offX + Wdyn * (1 - SIDE_GAP / 2) : -offX + Wdyn * SIDE_GAP / 2;
const SIDE_IN_Y = 320;                   // just behind the counter line, at the top of a side passage
const sideOutY = () => H + offY + 100;   // below the frame — fully out of view
// The whole VISIBLE body of a bill tray is the click target: the dark tray
// pocket (x-4, y-4, w+8, h+8) plus the bill note, which overhangs the pocket
// by 20px (drawn at c.h + 20). h+22 here makes the hit rect's bottom exactly
// meet the note's bottom (minus the hit pad's 2px, which covers the last sliver).
const chipHit = c => ({ x: c.x - 4, y: c.y - 4, w: c.w + 8, h: c.h + 22 });
// Ultra-wide stages: a taller, narrower counter with its items drawn 1.5x,
// packed closer together (per-item x shifts, in base coords) and centered.
const ULTRA_ASPECT = 2.0;
const DESK_SHIFT = { calc: 25, bottle: 0, drawer: 0, tea: -25, coins: -43, intercom: -60 };
const DESK_ULTRA_K = 1.3;
const DESK_ULTRA = { L: 226.5, R: 790.5 }; // the counter's ends around the scaled items, in base coords
const DRAWER_BOT = 530;                  // drawer body + shadow bottom, base coords — pinned just inside the frame
let deskK = 1;                           // DESK_ULTRA_K on ultra-wide (set in resize)
const COUNTER_TOP_HEIGHT = 34;
const COUNTER_BILL_U = 5; // enlarged portrait notes on the countertop
const COUNTER_BILL_OFFSET = 72;
const COUNTER_CHANGE_OFFSET = 116; // the first change note lies right beside the customer's bill (a note is 40px wide, 4px gap)
const COUNTER_CHANGE_STEP = 14;    // each further note lands a little to the right of the previous one
const changeNoteX = (guestX, index) => guestX + COUNTER_CHANGE_OFFSET + index * COUNTER_CHANGE_STEP;
// [scale, tx, ty] for an item: x' = tx + x*scale, y' = ty + y*scale
function deskXf(item) {
  if (deskK === 1) return [1, 0, 0];
  return [deskK, 480 + ((DESK_SHIFT[item] || 0) - 508.5) * deskK, H - 4 - DRAWER_BOT * deskK];
}
function counterBounds() {
  const gap = Wdyn * SIDE_GAP * 0.75; // widen the visible counter while preserving guest passage space
  let L = -offX + gap, R = -offX + Wdyn - gap;
  if (deskK > 1) {
    L = Math.max(L, 480 + (DESK_ULTRA.L - 508.5) * deskK);
    R = Math.min(R, 480 + (DESK_ULTRA.R - 508.5) * deskK);
  }
  return { L, R };
}

function counterTopBackEdgeY() {
  const [, , dty] = deskXf();
  return dty + COUNTER_IN.desk.y * deskK - 11 - COUNTER_TOP_HEIGHT * deskK;
}
function counterFrontDepthY() {
  const [, , dty] = deskXf();
  return dty + (COUNTER_IN.desk.y + 5) * deskK;
}
function counterGuestStandY() {
  return counterFrontDepthY(); // guests stand at the counter's front edge; the ledge hides their lower bodies
}
function counterTopBillY() {
  return counterTopBackEdgeY() + COUNTER_TOP_HEIGHT * deskK / 2;
}
function counterExactBillX() {
  const tray = COUNTER_IN.chips.find(c => c.d === 20);
  return deskRect({ x: tray.x + tray.w / 2, y: tray.y, w: 0, h: 0 }, "drawer").x;
}

// Broad countertop surface behind the front-facing cash drawer fascia.
function drawCounterTopArea() {
  const [, , dty] = deskXf();
  const dY = dty + COUNTER_IN.desk.y * deskK;
  const { L, R } = counterBounds(), h = COUNTER_TOP_HEIGHT * deskK;
  const y = dY - 11 - h; // overlap the ledge edge slightly so the top and front stay joined
  // Match the same warm timber used on the counter face, with only a gentle
  // highlight on the back edge so the worktop reads as part of one counter.
  const wood = ctx.createLinearGradient(0, y, 0, y + h);
  wood.addColorStop(0, "#8f6b3c");
  wood.addColorStop(0.55, "#7a5a32");
  wood.addColorStop(1, "#8a6838");
  ctx.fillStyle = wood;
  ctx.fillRect(L, y, R - L, h);
  ctx.fillStyle = "rgba(255, 232, 184, 0.2)";
  ctx.fillRect(L, y, R - L, 1.5 * deskK);
  ctx.fillStyle = "rgba(66, 43, 22, 0.14)";
  ctx.fillRect(L, y + h * 0.55, R - L, deskK);
}

function deskRect(r, item) {
  const [s, tx, ty] = deskXf(item);
  return { x: tx + r.x * s, y: ty + r.y * s, w: r.w * s, h: r.h * s };
}
function withDesk(item, fn) {
  const [s, tx, ty] = deskXf(item);
  ctx.save(); ctx.translate(tx, ty); ctx.scale(s, s); fn(); ctx.restore();
}
const PAY_SPOT = { x: 560, y: counterGuestStandY() }; // customer line stays behind the far countertop edge
const PAY_SPOT2 = { x: 462, y: counterGuestStandY() }; // exact-₺20 line
const WC_BUILDING = { x: 808 + BUILD_DX, y: 92 - BUILD_LIFT, w: 86, h: 80 }; // outdoor hit rect: click to enter
// Car wash view geometry — a close-up of the parked bus's front. The
// windshield is a cols×rows cell grid; each cell tracks its own dirt and soap.
const WASH = {
  body:  { x: 330, y: 110, w: 300, h: 350 },                    // the bus front slab (tall — a big glass front)
  wind:  { x: 354, y: 138, w: 252, h: 186, cols: 30, rows: 20 }, // glass + frame ≈ 2/3 of the face, painted nose ≈ 1/3; 600 cells of 8.4×9.3
  brush: { x: 96,  y: 280, w: 150, h: 130 },                    // soap bucket + brush on the floor (left)
  hose:  { x: 714, y: 280, w: 150, h: 130 },                    // floor tap + coiled hose (right)
  // the bus (body + wind) is drawn scaled by s about its base (cx, y0), which lands at screen y1:
  // antenna tip ≈17px under the top edge, tyres ≈6px above the floor edge
  zoom:  { s: 1.36, cx: 480, y0: 460, y1: 512 },
};
const washZoomXf = () => {
  const Z = WASH.zoom;
  ctx.translate(Z.cx, Z.y1); ctx.scale(Z.s, Z.s); ctx.translate(-Z.cx, -Z.y0);
};
const washToBus = (x, y) => {
  const Z = WASH.zoom;
  return { x: Z.cx + (x - Z.cx) / Z.s, y: Z.y0 + (y - Z.y1) / Z.s };
};

const DEST_A = "İstanbul", DEST_B = "Trabzon";

// Every balance value of the progression game lives here — prices, tiers,
// starting values, save keys. Provisional numbers: tune here, nowhere else.
const CONFIG = {
  save: {
    key: "layover-lane-v7",
    version: 7,
    // read (oldest last) to migrate a pre-progression game; never written or
    // deleted by migration, so they double as a backup of the old save
    legacyKeys: ["layover-lane-v6", "layover-lane-v5", "layover-lane-v3"],
    corruptPrefix: "layover-lane-corrupt-", // + timestamp: unreadable data is parked here before anything can overwrite it
  },
  economy: {
    startCash: 500,     // a brand-new company
    migratedCash: 0,    // pre-progression saves had no money at all
    ledgerMax: 200,     // recent transactions kept in the save (totals are kept forever)
    toiletFee: 20,      // what a toilet visit costs the guest
    teaPrice: 20,       // what a glass of tea ordered on the intercom costs you
  },
  parkingLots: [
    { spaces: 2, minBuses: 0, cost: 0 },
    { spaces: 4, minBuses: 20, cost: 1000 },
    { spaces: 6, minBuses: 50, cost: 2500 },
    { spaces: 8, minBuses: 100, cost: 5000 },
    { spaces: 10, minBuses: 200, cost: 10000 },
  ],
  // The profile a terminal starts from. "classic" is the pre-progression game
  // (10 stalls, hose, cologne, calculator, manual car wash) — legacy saves
  // migrate onto it. wc: the starting level of every WC upgrade track.
  profiles: {
    classic: { rep: 50, wc: { count: 5, style: 2, tool: 4, cologne: 1, calc: 1, tea: 1 }, carWash: { unlocked: true, tier: 1 } },
    starter: { rep: 10, wc: { count: 1, style: 1, tool: 1, cologne: 0, calc: 0, tea: 0 }, carWash: { unlocked: false, tier: 1 } },
    gerede:  { rep: 25, wc: { count: 2, style: 2, tool: 1, cologne: 1, calc: 1, tea: 0 }, carWash: { unlocked: false, tier: 1 } },
    tosya:   { rep: 30, wc: { count: 3, style: 2, tool: 3, cologne: 1, calc: 1, tea: 0 }, carWash: { unlocked: true,  tier: 1 } },
    samsun:  { rep: 35, wc: { count: 5, style: 2, tool: 4, cologne: 2, calc: 1, tea: 1 }, carWash: { unlocked: true,  tier: 2 } },
  },
  newGameProfile: "starter",
  firstBusLead: 120,  // px before its bay's turn-in where the opening bus appears: it is pulling in ~1 real s after play starts
  // The WC's independent upgrade tracks, each bought one level at a time per
  // terminal. Level 0 (cologne, calc) means "not owned yet".
  //   count:   stalls — how many of the ten bays are built (the rest boarded up)
  //   style:   the fixture — dirtUse: grime one visit leaves (min, max);
  //            satBonus: added to every toilet rating; auto*: see below
  //   tool:    what hangs at the cleaning stations (CONFIG.cleaningTools)
  //   cologne: ml — the counter bottle (refilled at midnight); sat: rating bonus per splash
  //   calc:    the counter calculator that shows the change still owed
  wcTracks: {
    count: { title: "KABİN SAYISI", levels: [
      { level: 1, name: "2 kabin", icon: "🚪",  cost: 0,    stalls: 2, minServed: 0 },
      { level: 2, name: "4 kabin", icon: "🚪",  cost: 800,  stalls: 4, minServed: 50 },
      { level: 3, name: "6 kabin", icon: "🚪",  cost: 1600, stalls: 6, minServed: 150 },
      { level: 4, name: "8 kabin", icon: "🚪",  cost: 3000, stalls: 8, minServed: 300 },
      { level: 5, name: "10 kabin", icon: "🚪", cost: 5000, stalls: 10, minServed: 500 },
    ] },
    style: { title: "TUVALETLER", levels: [
      { level: 1, name: "İlkel alaturka tuvaletler", icon: "🕳️", cost: 0,     style: "alaturka", dirtUse: [10, 20], satBonus: -6, minServed: 0 },
      { level: 2, name: "Modern klozetler", icon: "🚽",          cost: 1000,  style: "modern",   dirtUse: [8, 16],  satBonus: 0, minServed: 75 },
      { level: 3, name: "Yarı otomatik tuvaletler", icon: "⚙️",  cost: 10000, style: "modern",   dirtUse: [8, 16],  satBonus: 0, auto: "semi", autoCleanPerHour: 60, autoCleanPerVisit: 8, upkeep: 300, opCost: 150, minServed: 250 },
      { level: 4, name: "Tam otomatik tuvaletler", icon: "🤖",   cost: 25000, style: "modern",   dirtUse: [8, 16],  satBonus: 0, auto: "full", autoCleanPerHour: 120, autoCleanPerVisit: 14, autoChangeSec: 3, upkeep: 450, opCost: 250, minServed: 500 },
    ] },
    tool: { title: "TEMİZLİK EKİPMANI", levels: [
      { level: 1, name: "Küçük el fırçası", icon: "🪥",  cost: 0,    tool: "handBrush" },
      { level: 2, name: "Uzun saplı fırça", icon: "🧹", cost: 300,  tool: "longBrush" },
      { level: 3, name: "Paspas seti", icon: "🪣",       cost: 600,  tool: "mop" },
      { level: 4, name: "Hortum", icon: "🚿",            cost: 3000, tool: "hose" },
    ] },
    cologne: { title: "KOLONYA", levels: [
      { level: 0, name: "Kolonya yok", icon: "🚫",           cost: 0,    ml: 0,    sat: 0 },
      { level: 1, name: "Limon kolonyası", icon: "🍋",       cost: 300,  ml: 500,  sat: 8 },
      { level: 2, name: "Büyük şişe kolonya", icon: "🧴",    cost: 900,  ml: 1000, sat: 8 },
      { level: 3, name: "Lüks lavanta kolonyası", icon: "🪻", cost: 2000, ml: 1000, sat: 12 },
    ] },
    calc: { title: "HESAP MAKİNESİ", levels: [
      { level: 0, name: "Hesap makinesi yok", icon: "🧠", cost: 0 },
      { level: 1, name: "Hesap makinesi", icon: "🧮",     cost: 250 },
    ] },
    tea: { title: "ÇAY", levels: [
      { level: 0, name: "Çay yok", icon: "🚫", cost: 0 },
      { level: 1, name: "Çay saati", icon: "🍵", cost: 1000 },
    ] },
  },
  // Hand cleaning, held & dragged over a free stall. perSec: cleanliness per
  // REAL second of scrubbing (any speed tier); reach: px around the pointer.
  // The hose's 33.3/s is the original +5 per 150 ms.
  cleaningTools: {
    handBrush: { name: "Küçük el fırçası", label: "FIRÇA",  perSec: 8,       reach: 8 },
    longBrush: { name: "Uzun saplı fırça", label: "FIRÇA",  perSec: 12,      reach: 11 },
    mop:       { name: "Paspas seti",      label: "PASPAS", perSec: 16,      reach: 14 },
    hose:      { name: "Hortum",           label: "HORTUM", perSec: 100 / 3, reach: 18 },
  },
  // Automated tiers (toilet auto / car-wash auto above) add: autoCleanPerHour —
  // cleanliness a free built stall regains per game hour; autoCleanPerVisit —
  // the self-clean cycle after every visit (vs dirtUse); autoChangeSec — the
  // counter hands back crisp change on its own after this long (sim seconds);
  // autoWashSec — sim seconds for the gantry to wash a parked bus (semi: one
  // bus at a time, full: every parked bus); upkeep — the daily maintenance
  // bill; opCost — running cost charged at every midnight.
  // (Sim seconds: 360 per game hour, as SECONDS_PER_HOUR.)
  maintenance: {
    intervalHours: 24,      // routine maintenance is due once per simulated day
    wearPerHour: 1.5,       // condition lost per game hour while automation runs
    overdueWearPerHour: 4,  // …and once maintenance is overdue
    failBase: 0.002,        // breakdown chance per system per game hour at full condition
    failWorn: 0.04,         // added at condition 0 (scales with wear²)
    overdueFailMult: 3,     // neglect multiplies the risk
    failRep: 2,             // reputation lost when a system breaks down
    repairCost: { toilet: 800, wash: 1000 },
    warnCondition: 40,
  },
  // Car wash. tier 1 is the unlock itself — cash only, no reputation gate —
  // and plays exactly like the original wash. fee: paid by the bus line when a
  // windshield is finished. reach: tool radius (px); soap: suds per brush pass;
  // rinse: grime removed per hose pass = rinse[0] + rinse[1] × suds; cd: ms
  // before the same cell can be worked again; rep / sat: reputation and the
  // bus's satisfaction bonus for a finished wash.
  carWashTiers: [
    { tier: 1, name: "Elle yıkama", icon: "🧽",              cost: 8000,  fee: 50, reach: 18, soap: 0.45, rinse: [0.15, 0.6], cd: 80, rep: 2, sat: 5 },
    { tier: 2, name: "Gelişmiş yıkama ekipmanı", icon: "🫧", cost: 5000,  fee: 60, reach: 26, soap: 0.6,  rinse: [0.2, 0.7],  cd: 70, rep: 3, sat: 7 },
    { tier: 3, name: "İleri yıkama ekipmanı", icon: "💦",    cost: 12000, fee: 75, reach: 36, soap: 0.8,  rinse: [0.3, 0.8],  cd: 60, rep: 4, sat: 9, combo: true },
    { tier: 4, name: "Yarı otomatik yıkama", icon: "⚙️",     cost: 20000, fee: 75, reach: 36, soap: 0.8,  rinse: [0.3, 0.8],  cd: 60, rep: 4, sat: 9, auto: "semi", autoWashSec: 60, upkeep: 300, opCost: 150, combo: true },
    { tier: 5, name: "Tam otomatik yıkama", icon: "🤖",      cost: 40000, fee: 75, reach: 36, soap: 0.8,  rinse: [0.3, 0.8],  cd: 60, rep: 4, sat: 9, auto: "full", autoWashSec: 30, upkeep: 500, opCost: 300 },
  ],
  // The road network. price: acquisition cost; profile: the facilities it
  // comes with; devCost: multiplier on its toilet / car-wash upgrade prices;
  // map: real lon/lat (label: which side of the node its text goes); requires: every
  // condition must hold — minRep (some owned terminal at least this
  // reputation), minOwned (terminals owned), minToiletStyle (some owned
  // terminal's toilets at least this style level).
  terminals: [
    { id: "bolu",   name: "Bolu Dağı Mola Yeri", short: "BOLU DAĞI", price: 0, start: true, profile: "starter", devCost: 1,    km: { a: 265, b: 800 }, map: { lon: 31.4, lat: 40.78, label: "down" } },
    { id: "gerede", name: "Gerede Mola Yeri", short: "GEREDE", price: 15000, profile: "gerede", devCost: 1.2,  km: { a: 310, b: 755 }, map: { lon: 32.2, lat: 40.81, label: "up" }, requires: { minRep: 40 } },
    { id: "tosya",  name: "Tosya Dinlenme Tesisi", short: "TOSYA", price: 40000, profile: "tosya", devCost: 1.4, km: { a: 480, b: 585 }, map: { lon: 34.03, lat: 41.02, label: "down" }, requires: { minRep: 60, minOwned: 2 } },
    { id: "samsun", name: "Samsun Sahil Tesisi", short: "SAMSUN", price: 90000, profile: "samsun", devCost: 1.6,  km: { a: 735, b: 330 }, map: { lon: 36.3, lat: 41.27, label: "up" }, requires: { minRep: 75, minOwned: 3, minToiletStyle: 3 } },
  ],
  mapEnds: { from: { lon: 28.95, lat: 41.03 }, to: { lon: 39.72, lat: 41.0 } }, // İstanbul and Trabzon
  // The D100 / D010 road east: [lon, lat] waypoints; a string is a terminal id.
  mapRoute: [[29.43, 40.8], [29.92, 40.76], [30.4, 40.75], [31.16, 40.84], "bolu", "gerede", [32.88, 40.81], [33.63, 40.92], "tosya",
    [34.8, 40.97], [35.47, 40.87], [35.66, 40.97], "samsun", [36.85, 41.2], [37.28, 41.1], [37.88, 40.96], [38.39, 40.9], [38.82, 40.98], [39.3, 41.0]],
};
const SAVE_KEY = CONFIG.save.key;

/* ---------------------------- Small utils --------------------------- */
const fmtTL = n => Math.round(n).toLocaleString(gameLanguage === "en" ? "en-US" : "tr-TR") + "₺";
const fmtCashChip = fmtTL;
const LANGUAGE_KEY = "mola-yeri-language";
let gameLanguage = "tr";
try { gameLanguage = localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "tr"; } catch (e) { /* storage may be disabled */ }
const ENGLISH = [
  ["Bölge haritası", "Regional map"], ["Harita panelini kapat", "Close map"], ["Menüyü Aç/Kapat", "Open/close menu"], ["Menü", "Menu"],
  ["Şirket kasası — İşletme paneli (U)", "Company cash — Business panel (U)"], ["Şirket kasası, işletme panelini aç", "Company cash; open business panel"],
  ["Bugün hizmet verilen misafir", "Guests served today"], ["Bulunduğun terminal", "Current terminal"], ["Gün ve saat", "Day and time"],
  ["DURUM", "STATUS"], ["KONTROLLER", "CONTROLS"], ["⚙️ Otomasyon yok", "⚙️ No automation installed"], ["Kur ·", "Install ·"], ["İtibar — itibar yükseldikçe daha çok otobüs uğrar", "Reputation — higher reputation brings more buses"],
  ["Oyun hızı (1/10/100/200)", "Game speed (1/10/100/200)"], ["Oyunu sıfırla", "Reset game"], ["Nasıl oynanır", "How to play"],
  ["Test için: kasaya 100.000₺ ekle", "Test: add 100,000₺ to cash"], ["Cihazı yatay çevir", "Rotate your device"], ["Mola Yeri geniş ekran için tasarlandı", "Layover Lane is designed for a wide screen"],
  ["Kapat", "Close"], ["Kapat (Esc)", "Close (Esc)"], ["Oyunun dilini değiştir", "Change game language"], ["Yükseltmeler ve ekipman (U)", "Upgrades and equipment (U)"],
  ["Oyunu duraklat", "Pause game"], ["İşletme", "Business"], ["Geliştirmeler", "Upgrades"], ["Yükselt", "Upgrade"], ["Yükseltme", "Upgrade"],
  ["Satın al", "Buy"], ["Kuruldu", "Installed"], ["Yükseltildi", "Upgraded"], ["Kur", "Build"], ["şu an", "current"], ["en yüksek", "max level"], ["Sonraki:", "Next:"],
  ["OTO YIKAMA", "CAR WASH"], ["BAKIM", "MAINTENANCE"], ["Otopark", "Parking lot"], ["Alanı genişlet", "Expand parking"],
  ["park yeri", "parking space"], ["park yeri açık", "parking spaces open"], ["Toplam hizmet verilen otobüs:", "Total buses served:"],
  ["Günlük bakım", "Routine maintenance"], ["Bakım yap", "Maintain"], ["Onar", "Repair"], ["Onarılana kadar bu iş elle yapılır", "This system must be operated manually until repaired"],
  ["Sistemler:", "Systems:"], ["Sonraki bakım:", "Next maintenance:"], ["İşletme gideri:", "Operating cost:"], ["gece yarısı", "at midnight"],
  ["Otomasyon yok", "No automation"], ["Bakım yalnızca otomatik sistemler için gerekir", "Maintenance is only required for automated systems"],
  ["₺ eksik", "₺ short"], ["Bakım gerekmiyor", "Maintenance not needed"], ["arızalı", "broken"], ["kuruldu", "installed"], ["onarılana kadar", "until repaired"],
  ["Çay", "Tea"], ["çay", "tea"], ["Kolonya", "Cologne"], ["kolonya", "cologne"], ["Tuvalet", "Toilet"], ["tuvalet", "toilet"],
  ["Tuvaletler", "Toilets"], ["Misafir", "Guest"], ["misafir", "guest"], ["misafirler", "guests"], ["Otobüs", "Bus"], ["otobüs", "bus"], ["otobüsler", "buses"],
  ["Kabin", "Stall"], ["kabin", "stall"], ["kabinler", "stalls"], ["para üstü", "change"], ["Oto yıkama", "Car wash"], ["oto yıkama", "car wash"],
  ["KAPALI", "CLOSED"], ["LOKANTA", "DINER"], ["TURİSTİK", "TOURIST"], ["LİMON KOLONYASI", "LEMON COLOGNE"], ["ELİNDE", "IN HAND"],
  ["ELİNDE — basılı tut & sürükle", "IN HAND — hold & drag"], ["KİR ", "GRIME "], ["KÖPÜK ", "FOAM "], ["ÇIKIŞ", "EXIT"],
  ["para üstü!", "change!"], ["kolonya!", "cologne!"], ["kapı kapalı", "door closed"], ["girmek için dokun", "tap to enter"], ["girmek için tıkla", "click to enter"],
  ["🗺 BÖLGE HARİTASI", "🗺 REGIONAL MAP"], ["— bir terminale dokun", "— tap a terminal"], ["— bir terminale tıkla", "— click a terminal"],
  ["🚪 ÇIKIŞ (E)", "🚪 EXIT (E)"], ["Dışarı çık (E)", "Go outside (E)"], ["Dışarı çık", "Go outside"], ["WC binası", "Restroom"], ["İlk otobüsün geliyor!", "Your first bus is arriving!"],
  ["Yolcular tuvalet için buraya gelir.", "Passengers come here to use the restroom."], ["Otobüsler terminalinde mola verir.", "Buses stop at your terminal."], ["Yolculara hizmet için hazır ol.", "Get ready to serve passengers."],
  ["Anladım", "Got it"], ["Park etmiş otobüse dokun:", "Tap a parked bus:"], ["uzun saplı fırçayla köpükle,", "soap it with the long brush,"], ["hortumla durula", "then rinse with the hose"], ["Terminallerini ve yolu buradan takip et.", "Follow your terminals and the route from here."], ["Yeni terminal de buradan satın alınır.", "New terminals are also bought from here."], ["Her terminalin yükseltmeleri burada.", "Upgrades for each terminal are here."], ["Tuvalet ve oto yıkama için ayrı ayrı yükselt.", "Upgrade toilets and car wash separately."], ["Devam", "Continue"], ["İşe dön", "Back to work"], ["Dükkânı aç!", "Open the shop!"],
  ["🎉 ", "🎉 "], [" artık senin", " is now yours"], ["arızalandı — onarılana kadar elle çalış", "has broken down — operate it manually until repaired"],
  ["⚠️ Kayıt sorunu", "⚠️ Save problem"], ["💾 Kaydın aktarıldı", "💾 Save migrated"], ["Kayıt okunamadı", "Save could not be read"],
  ["✨ Ön cam pırıl pırıl!", "✨ The windshield is sparkling clean!"], ["😖 Tuvalet pis, misafir gitti", "😖 The restroom is dirty; the guest left"],
  ["🏃 Misafir ödemeden kaçıyor!", "🏃 A guest is leaving without paying!"], ["😠 Misafir ödemeden gitti", "😠 A guest left without paying"],
  ["⏱ Süre doldu, otobüs kalkıyor", "⏱ Time is up; the bus is leaving"], ["🤏 Bozuk para fark edildi", "🤏 Incorrect change noticed"],
  ["🧴 Kolonya bitti — gece dolar", "🧴 Cologne is empty — refills overnight"], ["🍵 Taze çay geldi!", "🍵 Fresh tea is ready!"], ["🍵 Çayın zaten yolda", "🍵 Your tea is already on its way"], ["🍵 Çay geliyor!", "🍵 Tea is on its way!"],
  ["WC açılması için ilk otobüsün gelmesi gerekiyor", "The first bus must arrive before the restroom opens"],
  ["şirket kasası", "company cash"], ["Terminale dön", "Return to terminal"], ["Bu terminale geç", "Switch to this terminal"], ["Satın al ·", "Buy ·"],
  ["KABİN SAYISI", "STALL COUNT"], ["2 kabin", "2 stalls"], ["4 kabin", "4 stalls"], ["6 kabin", "6 stalls"], ["8 kabin", "8 stalls"], ["10 kabin", "10 stalls"],
  ["TUVALETLER", "TOILETS"], ["İlkel alaturka tuvaletler", "Basic squat toilets"], ["Modern klozetler", "Modern toilets"], ["Yarı otomatik tuvaletler", "Semi-automatic toilets"], ["Tam otomatik tuvaletler", "Fully automatic toilets"],
  ["TEMİZLİK EKİPMANI", "CLEANING EQUIPMENT"], ["FIRÇA", "BRUSH"], ["Köpük kendiliğinden durulanıyor", "Suds rinse off automatically"], ["1 · ön camı köpükle (fırça)", "1 · soap the windshield (brush)"], ["2 · köpüğü durula (hortum)", "2 · rinse the suds (hose)"], ["💧 HORTUM — durula", "💧 HOSE — rinse"], ["✨ Pırıl pırıl — şoför bunu fark edecek", "✨ Sparkling — the driver will notice"], ["PASPAS", "MOP"], ["HORTUM", "HOSE"], ["🧼 FIRÇA — köpük", "🧼 BRUSH — foam"],["Küçük el fırçası", "Small hand brush"], ["Uzun saplı fırça", "Long-handled brush"], ["Paspas seti", "Mop kit"], ["Hortum", "Hose"],
  ["KOLONYA", "COLOGNE"], ["Kolonya yok", "No cologne"], ["Limon kolonyası", "Lemon cologne"], ["Büyük şişe kolonya", "Large cologne bottle"], ["Lüks lavanta kolonyası", "Luxury lavender cologne"],
  ["HESAP MAKİNESİ", "CALCULATOR"], ["Hesap makinesi yok", "No calculator"], ["Hesap makinesi", "Calculator"], ["Çay yok", "No tea"], ["Çay saati", "Tea service"],
  ["Elle yıkama", "Manual wash"], ["Gelişmiş yıkama ekipmanı", "Advanced wash equipment"], ["İleri yıkama ekipmanı", "Professional wash equipment"], ["Yarı otomatik yıkama", "Semi-automatic wash"], ["Tam otomatik yıkama", "Fully automatic wash"],
  ["Bolu Dağı Mola Yeri", "Bolu Mountain Rest Stop"], ["Gerede Mola Yeri", "Gerede Rest Stop"], ["Tosya Dinlenme Tesisi", "Tosya Rest Area"], ["Samsun Sahil Tesisi", "Samsun Coastal Rest Stop"],
  ["Mola Yeri — Otobüs Mola Tesisi Simülatörü", "Layover Lane — Bus Rest Stop Simulator"], ["MOLA YERİ", "LAYOVER LANE"], ["Mola Yeri", "Layover Lane"],
  ["Yükseltince ", "Upgrade to "] , ["yeni kabinler tertemiz açılır", "new stalls open spotless"], ["park yeri açık", "parking spaces open"],
  ["gün", "day"], ["Dünya", "World"], ["girmek", "enter"], ["itibar", "reputation"], ["daha iyisi", "or better"], ["En az", "At least"], ["şimdi:", "current:"], ["Bir terminalinde", "At one terminal:"],
  ["Bütün oyun sıfırlansın mı? Kayıtlı oyunun silinecek.", "Reset the entire game? Your saved progress will be deleted."],
  ["Gün ", "Day "], ["gün tamamlandı", "day complete"], ["günlük", "daily"], ["gün sonra", "days later"], ["alaturka", "squat"], ["Yere gömülü alaturka taşlar", "Basic squat toilets"],
  ["Modern klozetler — alaturkanın yerine, hepsi tertemiz", "Modern toilets replace the squat toilets; all start spotless"], ["Her tuvalet puanı", "Satisfaction per restroom visit"],
  ["Daha dayanıklı: daha az kirlenir, misafir memnuniyeti artar", "More durable: gets dirty less, guest satisfaction rises"], ["Ziyaret başına kir", "Dirt per visit"], ["Daha dayanıklı: ziyaret başına kir", "More durable: dirt per visit"], ["Rutin temizlik kendiliğinden — arızalar ve bakım sende", "Routine cleaning is automatic — breakdowns and maintenance are your responsibility"],
  ["Temizlik ve gişe kendiliğinden — periyodik bakım sende", "Cleaning and checkout are automatic — periodic maintenance is your responsibility"],
  ["Daha geniş temizlik alanı", "Wider cleaning area"], ["Gişede kolonya yok", "No cologne at the counter"], ["Gişede ", "At the counter: "], [" ml'lik şişe (gece yarısı dolar)", " ml bottle (refills at midnight)"],
  ["Dökülen her kolonya misafir puanına +", "Each cologne application adds +"], ["Gişedeki ekranda verilecek para üstü yazar", "The counter display shows the change due"], ["Para üstünü kafandan hesaplarsın", "Calculate the change yourself"],
  ["Gişede çay yapabilirsin — molaları daha keyifli hale getirir", "Serve tea at the counter to make breaks more pleasant"], ["Çay yapma olanaği yok", "Tea service is unavailable"],
  ["Park etmiş otobüse dokun: uzun saplı fırçayla köpükle, hortumla durula", "Tap a parked bus: soap the windshield with the long brush, then rinse with the hose"],
  ["Biten her yıkama", "Each completed wash earns"], [" kazandırır", ""], ["İtibar şartı yok — sadece kasa", "No reputation requirement — cash only"],
  ["Yıkama ücreti", "Wash fee"], ["Daha geniş fırça ve hortum", "Wider brush and hose"], ["Kabinleri elle temizler", "Cleans stalls by hand"], ["Daha hızlı temizlik", "Cleans faster"], ["Daha fazla memnuniyet", "More satisfaction"], ["Daha güçlü köpük ve durulama — daha az geçiş", "Stronger soap and rinse — fewer passes"],
  ["İtibar +", "Reputation +"], ["otobüs memnuniyeti +", "bus satisfaction +"], ["Yıkamanın bir kısmı kendiliğinden — arızalar ve bakım sende", "Some washing is automatic — breakdowns and maintenance are your responsibility"],
  ["Otobüsler kendiliğinden yıkanır — periyodik bakım sende", "Buses are washed automatically — periodic maintenance is your responsibility"],
  ["sahip", "owned"], ["satılık", "for sale"], ["kilitli", "locked"], ["İstanbul", "Istanbul"], ["İzmir", "Izmir"], ["Diyarbakır", "Diyarbakir"], ["Otomatik tuvaletler", "Automated toilets"], ["Otomatik yıkama", "Automated wash"],
  ["ÇAY", "TEA"], ["K A R A D E N İ Z", "B L A C K  S E A"], ["A K D E N İ Z", "M E D I T E R R A N E A N"], ["E G E", "A E G E A N"],
  ["Günlük bakım zamanı", "Routine maintenance is due"], ["GECİKTİ", "OVERDUE"], ["durum %", "condition %"], ["Önceki:", "Previous:"], ["Daha geniş", "Wider"],
  ["yeni kabinler tertemiz açılır", "new stalls open spotless"], ["park yeri açık", "parking spaces open"],
  ["Bugün:", "Today:"], ["Yükseltme maliyeti", "Upgrade cost"], ["Başlangıç itibarı", "Starting reputation"], ["yükseltmeler", "upgrades"],
  ["Şartlar:", "Requirements:"], ["Fiyat:", "Price:"], [": yok", ": unavailable"], ["/sn temizlik", "/s cleaning"], ["(önceki:", "(previous:"],
  ["Misafirler", "Guests"], ["misafirler", "guests"],
  ["Hizmet verilen otobüs", "Buses served"], ["Hizmet verilen misafir", "Guests served"], ["Gelir", "Revenue"], ["Gider", "Expenses"], ["Bütün terminaller: gelir / gider", "All terminals: revenue / expenses"], ["Dökülen kolonya", "Cologne used"], ["Yıkanan ön cam", "Windshields washed"], ["Kaçırılan ", "Missed "], ["ücret", "fee"], ["Yakalanan kaçak", "Runaways caught"], ["Ort. memnuniyet", "Avg. satisfaction"], ["İtibar", "Reputation"], ["Ünün yayılıyor — yarın daha büyük otobüsler bekle.", "Your reputation is spreading — expect bigger buses tomorrow."], ["Zor bir gündü. Tuvaletleri temiz tut.", "A tough day. Keep the restrooms clean."], ["Mola Yeri'nde sakin bir gün.", "A quiet day at Layover Lane."], ["güne devam", "continue the day"],
  
  ["Gişe", "Counter"], ["Kirli tuvalet", "Dirty toilet"], ["Fırçayı tuvaletin üzerinde sürükle", "Drag the brush over the toilet"],
  ["🧽 YAKALANDI — bütün tuvaletleri ovuyor", "🧽 CAUGHT — scrubbing every restroom"], ["✨ BÜTÜN TUVALETLER PIRIL PIRIL ✨", "✨ ALL RESTROOMS SPOTLESS ✨"],
  ["🧽 Yakalandın! Tuvalet senin!", "🧽 Caught! The restroom is yours!"], ["✨ Tuvaletler pırıl pırıl!", "✨ The restrooms are sparkling clean!"],
  ["Kabin pırıl pırıl!", "The stall is sparkling clean!"], ["Çayın zaten yolda", "Your tea is already on its way"], ["Çay geliyor!", "Tea is on its way!"], ["Çay için kasada", "Not enough cash for tea:"],
  ["Oto yıkama yok", "No car wash"], ["ile kurulabilir", "to build it"], [" test parası", " test cash"], ["test parası", "test cash"],
];
ENGLISH.sort((a, b) => b[0].length - a[0].length);
const ENGLISH_EXACT = new Map(ENGLISH);
const ENGLISH_ASCII = ENGLISH.filter(([tr]) => !/[çğıöşüÇĞİÖŞÜİ]/.test(tr));
function translateText(value) {
  let text = String(value);
  if (gameLanguage !== "en") return text;
  if (ENGLISH_EXACT.has(text)) return ENGLISH_EXACT.get(text);
  if (/^[-+]?\d[\d.,]*₺ eksik$/.test(text)) return text.replace(" eksik", " short");
  if (!/[çğıöşüÇĞİÖŞÜİ]/.test(text)) {
    if (!/[A-Za-z]/.test(text)) return text;
    for (const [tr, en] of ENGLISH_ASCII) text = text.replaceAll(tr, en);
    return text;
  }
  for (const [tr, en] of ENGLISH) text = text.replaceAll(tr, en);
  return text;
}
function applyLanguageToShell() {
  if (gameLanguage !== "en") return;
  document.documentElement.lang = "en";
  document.title = translateText(document.title);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) walker.currentNode.nodeValue = translateText(walker.currentNode.nodeValue);
  for (const el of document.body.querySelectorAll("*")) for (const attr of el.attributes)
    if (["title", "aria-label", "placeholder"].includes(attr.name)) attr.value = translateText(attr.value);
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = translateText(description.content);
}
function startLanguageObserver() {
  if (gameLanguage !== "en") return;
  const translateNode = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const next = translateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ["title", "aria-label", "placeholder"]) {
      const value = node.getAttribute(attr);
      if (value != null) {
        const next = translateText(value);
        if (next !== value) node.setAttribute(attr, next);
      }
    }
    for (const child of node.childNodes) translateNode(child);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") translateNode(record.target);
      else if (record.type === "attributes") translateNode(record.target);
      else for (const node of record.addedNodes) translateNode(node);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder"] });
}
const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
let artPainting = false; // true while a shop card picture is drawn: pictures carry no text
CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
  if (artPainting) return;
  return nativeFillText.call(this, translateText(text), ...args);
};
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

// Deadlines (stopEnd, boardAt, nextBusAt...) are stored as plain G.clock.time + x,
// so they can sit on the other side of the midnight 24->0 wrap (e.g. 24.4).
// True if the target is now or in the past, cyclically.
// Double %24 normalizes the difference so a deadline just ahead of midnight
// (t >= 24) does NOT read as "reached" on the next day. (All targets are set
// < 12h ahead, so this is unambiguous.)
function reached(t) {
  const e = ((G.clock.time - t) % 24 + 24) % 24;
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
// G is the one authoritative game state (and the save): the shared clock, the
// company (one cash balance for every terminal), and the terminals, each owning
// its own reputation, facilities, buses and guests. The sim and render code
// work on S / buses / facilities, which bindTerminal points at one terminal.
let G = null;
let S = null;            // bound: G.terminals[id].sim
let buses = [];          // bound: G.terminals[id].buses
let facilities = emptyFacilities(); // bound: runtime[id].facilities
let runtime = {};        // per terminal, never saved: { facilities } (rebuilt from guest states on load)
let boundId = null;
let cars = [];           // ambient traffic in the far lane
let paused = false;
let arrivalInfoOpen = false;
let arrivalInfoBusId = null;
let arrivalInfoKind = "arrival";
let arrivalInfoDelayUntil = 0;
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
let toolInHand = null; // the hose station (COUNTER_IN.hose) whose hose is in hand
// Picking up a cleaning tool zooms the WC camera in on the stall row, so the
// toilets fill the screen while you work them. wcZoom eases 0 → 1 (rest → in).
const WC_ZOOM_S = 1.7;
let wcZoom = 0;
let hoseCd = new Array(WC_STALLS).fill(0);      // last spray timestamp per stall (performance.now)
let hoseGleam = new Array(WC_STALLS).fill(0);   // per stall: when it last hit 100 (sparkle burst)
let lastHoseToast = 0;
let changeBillFlights = [];  // bills handed from the drawer to the customer
const CHANGE_BILL_FLIGHT_DURATION = 650, CHANGE_BILL_STAGGER = 180;
const changePaymentFlights = new WeakMap(); // final change bill arrival times
const receiptFlightEnds = new WeakMap(); // keep paid guests at the counter until their bill reaches the drawer
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
let mapOpen = false, mapPanelOpen = false, mapZoom = 0, mapSel = null, mapMsg = null;

function emptyFacilities() {
  return { R: { spots: [], queue: [] }, T: { spots: [], queue: [] }, C: { queue: [], queue2: [] } };
}

function freshGame(profile = CONFIG.newGameProfile) {
  const start = CONFIG.terminals.find(t => t.start);
  const g = {
    version: CONFIG.save.version,
    clock: { day: 1, time: 8, lastSave: 0 }, // time in game hours, 0..24
    company: { cash: CONFIG.economy.startCash, nextTxId: 1, ledger: [], totals: {} },
    activeTerminal: start.id,
    terminals: {},
    flags: { firstBusDone: false, firstBusParked: false, wcLockedToastSeen: false, arrivalInfoSeen: false, wcInfoSeen: false, wcIntroStep: 0, toolbarIntro: 0, wcDirtied: false, brushTutDone: false, changeTutDone: false },
    migratedFrom: null,      // save version this game was migrated from (null = born on v7)
  };
  g.terminals[start.id] = freshTerminal(start.id, profile);
  return g;
}

function freshTerminal(id, profileName) {
  const prof = CONFIG.profiles[profileName];
  return {
    id,
    owned: true,
    wc: Object.assign({}, prof.wc),
    carWash: { unlocked: prof.carWash.unlocked, tier: prof.carWash.tier },
    maintenance: { condition: 100, lastAt: null, nextDueAt: null, failures: [], tickAt: null, dueNotified: false },
    sim: Object.assign(freshSim(prof.rep), { bottle: wcLevel("cologne", prof.wc.cologne).ml }),
    buses: [],
  };
}

const ownedTerminals = () => Object.values(G.terminals).filter(t => t.owned);

function bindTerminal(id) {
  const t = G.terminals[id];
  if (!runtime[id]) runtime[id] = { facilities: emptyFacilities() };
  boundId = id;
  S = t.sim;
  buses = t.buses;
  facilities = runtime[id].facilities;
}

// What the bound terminal has built. Bays come into service from the aisle
// outward (4,5 first), so a small WC sits centered under the stall lights.
const STALL_ORDER = [4, 5, 3, 6, 2, 7, 1, 8, 0, 9];
const STALL_RANK = STALL_ORDER.reduce((r, bay, k) => { r[bay] = k; return r; }, []);
const term = () => G.terminals[boundId];
const wcLevel = (track, level) => CONFIG.wcTracks[track].levels.find(x => x.level === level);
// The installed level of a WC track at terminal t (the bound one by default).
const wcDef = (track, t = term()) => wcLevel(track, t.wc[track]);
const toiletDef = () => wcDef("style");
const stallCount = () => wcDef("count").stalls;
const parkingSpaces = (sim = S) => clamp(Math.floor(finiteOr(sim && sim.parkingSpaces, 2)), 2, PARKING_SLOT_COUNT);
const parkingSlotStart = (count = parkingSpaces()) => Math.floor((PARKING_SLOT_COUNT - count + 1) / 2);
const activeParkingSlots = (count = parkingSpaces()) => Array.from({ length: count }, (_, i) => parkingSlotStart(count) + i);
const stallActive = i => STALL_RANK[i] < stallCount();
const activeStalls = () => STALL_ORDER.slice(0, stallCount()).sort((a, b) => a - b);
const cleaningTool = () => CONFIG.cleaningTools[wcDef("tool").tool];
const hasCologne = () => term().wc.cologne > 0;
const hasCalc = () => term().wc.calc > 0;
const hasTea = () => term().wc.tea > 0;
const bottleMax = () => wcDef("cologne").ml;
const carWashOpen = () => term().carWash.unlocked;
const washDef = () => CONFIG.carWashTiers.find(x => x.tier === term().carWash.tier);
const avgClean = () => activeStalls().reduce((a, i) => a + S.stallClean[i], 0) / stallCount();

function freshSim(rep = 50) {
  return {
    rep,                     // 0..100 — this terminal's own reputation
    cleanliness: 100,        // DERIVED average of stallClean (outdoor HUD, legacy fallbacks)
    stallClean: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], // per-stall cleanliness 0..100 — each toilet dirties on its own
    bottle: 0,              // ml of cologne left in the counter bottle (filled to its track level)
    tea: 1,                  // tea left in your glass, 0..1 (1 = full)
    teaOrder: null,          // game hours until the tea ordered on the intercom arrives (null = none ordered)
    view: "out",             // "out" = the layover, "wc" = inside the WC counter room, "wash" = the bus front
    washBus: null,           // id of the bus being washed (set while view is "wash")
    nextBusAt: 9.5,
    parkingSpaces: 2,          // built bus bays (upgrades: 2 → 4 → 6 → 8 → 10)
    busesServed: 0,             // lifetime completed bus stops; does not reset with daily stats
    slotVacantSince: BAY_SLOTS.map(() => null), // per bay: game-hour it became vacant (null = filled or never used)
    nextBusId: 1,
    stats: freshDayStats(rep),
    history: [],             // the last HISTORY_DAYS finished days: stats + { day, repEnd }
  };
}
const HISTORY_DAYS = 7; // finished days kept per terminal

// Saved stats are numbers only (they end up in the day summary's HTML).
function sanitizeStats(raw, rep) {
  const out = freshDayStats(rep);
  if (raw && typeof raw === "object") for (const k of Object.keys(out)) out[k] = finiteOr(raw[k], out[k]);
  return out;
}

function freshDayStats(rep) {
  return {
    buses: 0, served: 0, satSum: 0, satN: 0, cologne: 0, washes: 0,
    revenue: 0, expenses: 0, // ₺ booked to this terminal today (see applyTransaction)
    evaded: 0, caught: 0,    // toilet fees: never paid (ran, left the queue, or cut short by the bus) / runaways caught (they scrubbed every toilet)
    repStart: rep == null ? S.rep : rep,
  };
}

/* --------------------------- Save & load ---------------------------- */
let resetting = false;   // while set, save() is a no-op (see btnReset)
let saveBlocked = null;  // reason string: unreadable data could not be backed up, so never overwrite it
function save() {
  if (resetting || saveBlocked || !G) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: CONFIG.save.version, G }));
  } catch (e) { /* private mode etc. */ }
}

// The deliberate new game. Stop saving FIRST: location.reload() fires
// beforeunload, which calls save() and would write the state back. Every key
// load() reads goes — a surviving legacy key would be migrated straight back.
function resetGame() {
  resetting = true;
  for (const key of [SAVE_KEY, ...CONFIG.save.legacyKeys]) {
    try { localStorage.removeItem(key); } catch (e) { /* private mode etc. */ }
  }
  location.reload();
}

// Reads the save into G. Never throws, and always leaves a playable game.
// status: "new" (nothing saved), "loaded", "migrated" (a pre-v7 game was
// carried over), or "recovered" (unreadable data was parked under a backup
// key — notes say what happened).
function load() {
  const notes = [];
  const read = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  const raw = read(SAVE_KEY);
  if (raw != null) {
    try {
      const terminalNotes = adoptGame(restoreGame(JSON.parse(raw)), CONFIG.save.version);
      if (!terminalNotes.length) return { status: "loaded", notes };
      notes.push(...terminalNotes, parkCorrupt(raw));
      return { status: "recovered", notes };
    } catch (e) {
      G = null;
      notes.push(`Kayıt okunamadı (${e.message}).`, parkCorrupt(raw));
    }
  }
  for (const key of CONFIG.save.legacyKeys) {
    const lraw = read(key);
    if (lraw == null) continue;
    try {
      const data = JSON.parse(lraw);
      const terminalNotes = adoptGame(migrateLegacy(data), data.v);
      notes.push(...terminalNotes);
      return { status: notes.length ? "recovered" : "migrated", from: data.v, notes };
    } catch (e) {
      G = null;
      notes.push(`Eski kayıt (${key}) aktarılamadı (${e.message}); dokunulmadan bırakıldı.`);
    }
  }
  adoptGame(freshGame());
  return { status: notes.length ? "recovered" : "new", notes };
}

// Copies unreadable save data aside before anything can overwrite it. If even
// that fails, saving is switched off for the session rather than lose it.
function parkCorrupt(raw) {
  const key = CONFIG.save.corruptPrefix + Date.now();
  try {
    localStorage.setItem(key, raw);
    return `Bozuk veri "${key}" anahtarına yedeklendi.`;
  } catch (e) {
    saveBlocked = "backup failed";
    return "Bozuk veri yedeklenemedi — üzerine yazılmasın diye bu oturumda kayıt kapalı.";
  }
}

const finiteOr = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function sanitizeClock(c) {
  c = c && typeof c === "object" ? c : {};
  const time = finiteOr(c.time, 8);
  return {
    day: Math.max(1, Math.floor(finiteOr(c.day, 1))),
    time: time >= 0 && time < 24 ? time : 8,
    lastSave: finiteOr(c.lastSave, 0),
  };
}

// The old combined toilet tiers (1–6) as WC track levels. Those games all had
// the calculator, so they keep it.
const OLD_TOILET_TIERS = {
  1: { count: 1, style: 1, tool: 1, cologne: 0, calc: 1 },
  2: { count: 2, style: 2, tool: 1, cologne: 1, calc: 1 },
  3: { count: 3, style: 2, tool: 1, cologne: 1, calc: 1 },
  4: { count: 5, style: 2, tool: 4, cologne: 1, calc: 1 },
  5: { count: 5, style: 3, tool: 4, cologne: 1, calc: 1 },
  6: { count: 5, style: 4, tool: 4, cologne: 1, calc: 1 },
};

// A terminal's progression fields, defaulted from its profile when missing or invalid.
function sanitizeTerminalMeta(t, src, profileName) {
  const prof = CONFIG.profiles[profileName];
  const tierIn = (v, table, d) => (Number.isInteger(v) && table.some(x => x.tier === v) ? v : d);
  src = src && typeof src === "object" ? src : {};
  t.owned = src.owned !== false;
  // saves from before the separate WC tracks stored one combined toilet tier
  const oldTier = src.toilet && OLD_TOILET_TIERS[src.toilet.tier];
  const wc = src.wc && typeof src.wc === "object" ? src.wc : oldTier || prof.wc;
  t.wc = {};
  for (const [track, def] of Object.entries(CONFIG.wcTracks))
    t.wc[track] = Number.isInteger(wc[track]) && def.levels.some(x => x.level === wc[track]) ? wc[track] : prof.wc[track];
  const cw = src.carWash && typeof src.carWash === "object" ? src.carWash : prof.carWash;
  t.carWash = { unlocked: !!cw.unlocked, tier: tierIn(cw.tier, CONFIG.carWashTiers, prof.carWash.tier) };
  const m = src.maintenance && typeof src.maintenance === "object" ? src.maintenance : {};
  t.maintenance = {
    condition: clamp(finiteOr(m.condition, 100), 0, 100),
    lastAt: m.lastAt == null ? null : finiteOr(m.lastAt, null),
    nextDueAt: m.nextDueAt == null ? null : finiteOr(m.nextDueAt, null),
    failures: Array.isArray(m.failures) ? m.failures.filter(f => f && (f.system === "toilet" || f.system === "wash")).map(f => ({ system: f.system, at: finiteOr(f.at, 0) })) : [],
    tickAt: m.tickAt == null ? null : finiteOr(m.tickAt, null),
    dueNotified: !!m.dueNotified,
  };
  t.sim = src.sim;     // raw — merged and repaired by fixupTerminal
  t.buses = src.buses;
}

// v7 save -> G (data level only; adoptGame repairs each terminal's sim).
function restoreGame(data) {
  if (!data || typeof data !== "object") throw new Error("geçersiz biçim");
  if (data.v !== CONFIG.save.version) throw new Error(`bilinmeyen kayıt sürümü ${data.v}`);
  const src = data.G;
  if (!src || typeof src !== "object" || !src.terminals || typeof src.terminals !== "object") throw new Error("terminal verisi yok");
  const co = src.company;
  if (!co || typeof co !== "object" || !Number.isFinite(co.cash)) throw new Error("şirket kasası okunamadı");
  const g = freshGame();
  g.clock = sanitizeClock(src.clock);
  const ledger = Array.isArray(co.ledger) ? co.ledger.filter(x => x && Number.isFinite(x.amount) && Number.isInteger(x.id)) : [];
  const totals = {};
  if (co.totals && typeof co.totals === "object") for (const [k, v] of Object.entries(co.totals)) if (Number.isFinite(v)) totals[k] = v;
  g.company = {
    cash: co.cash,
    ledger,
    totals,
    // never reuse a transaction id, even if the stored counter went missing
    nextTxId: Math.max(Number.isInteger(co.nextTxId) ? co.nextTxId : 1, ...ledger.map(x => x.id + 1)),
  };
  g.flags = Object.assign(g.flags, src.flags && typeof src.flags === "object" ? src.flags : {});
  g.flags.arrivalInfoSeen = !!g.flags.arrivalInfoSeen;
  g.flags.wcInfoSeen = !!g.flags.wcInfoSeen;
  g.flags.wcLockedToastSeen = !!g.flags.wcLockedToastSeen;
  g.flags.wcIntroStep = Number.isInteger(g.flags.wcIntroStep) ? clamp(g.flags.wcIntroStep, 0, 4) : 0;
  // brush tutorial: saves from before it existed have already used the WC — skip it
  const hasTut = !!src.flags && Object.prototype.hasOwnProperty.call(src.flags, "brushTutDone");
  g.flags.brushTutDone = hasTut ? !!g.flags.brushTutDone : g.flags.wcIntroStep >= 4;
  g.flags.wcDirtied = hasTut ? !!g.flags.wcDirtied : g.flags.brushTutDone;
  const hasChangeTut = !!src.flags && Object.prototype.hasOwnProperty.call(src.flags, "changeTutDone");
  g.flags.changeTutDone = hasChangeTut ? !!g.flags.changeTutDone : g.flags.brushTutDone;
  // 0 = map tip not shown yet, 2 = map tip done, 3 = shop tip done, 4 = car wash tip done
  g.flags.toolbarIntro = Number.isInteger(g.flags.toolbarIntro) ? clamp(g.flags.toolbarIntro, 0, 4) : 0;
  const hasParkedFlag = !!src.flags && Object.prototype.hasOwnProperty.call(src.flags, "firstBusParked");
  g.flags.firstBusParked = hasParkedFlag
    ? !!g.flags.firstBusParked
    : Object.values(src.terminals).some(t => t && (
      Array.isArray(t.buses) && t.buses.some(b => b && b.stoppedOnce) ||
      t.sim && t.sim.stats && t.sim.stats.buses > 0
    ));
  g.migratedFrom = Number.isInteger(src.migratedFrom) ? src.migratedFrom : null;
  g.terminals = {};
  for (const def of CONFIG.terminals) { // ids no longer in CONFIG are dropped
    const st = src.terminals[def.id];
    if (!st || typeof st !== "object" || st.owned === false) continue; // only owned terminals are ever stored
    const t = { id: def.id };
    sanitizeTerminalMeta(t, st, def.profile || CONFIG.newGameProfile);
    g.terminals[def.id] = t;
  }
  const owned = Object.values(g.terminals).filter(t => t.owned);
  if (!owned.length) throw new Error("sahip olunan terminal yok");
  g.activeTerminal = g.terminals[src.activeTerminal] && g.terminals[src.activeTerminal].owned ? src.activeTerminal : owned[0].id;
  // the old company store's mop kits become the mop level of the cleaning
  // track — where one was assigned, or at the active terminal if it sat in the store
  const mop = CONFIG.wcTracks.tool.levels.find(x => x.tool === "mop").level;
  for (const e of Array.isArray(src.equipment) ? src.equipment : []) {
    if (!e || e.type !== "mop") continue;
    const t = g.terminals[e.terminal] || g.terminals[g.activeTerminal];
    t.wc.tool = Math.max(t.wc.tool, mop);
  }
  return g;
}

// A pre-progression save ({v:3..6, S, buses}) becomes one owned terminal on
// the classic profile, which matches what that game had: 10 stalls, hose,
// cologne, manual car wash. Rep, clock, buses and guests carry over as they are.
function migrateLegacy(data) {
  if (!data || ![3, 4, 5, 6].includes(data.v) || !data.S || typeof data.S !== "object") throw new Error("eski kayıt biçimi değil");
  const g = freshGame("classic");
  g.company.cash = CONFIG.economy.migratedCash;
  g.migratedFrom = data.v;
  g.flags.firstBusDone = true; // an old game already had its buses — no new-game opening
  g.flags.firstBusParked = true; // the old game has already been through the first stop
  g.flags.wcIntroStep = 4; // old saves have already used the WC
  g.flags.wcDirtied = g.flags.brushTutDone = g.flags.changeTutDone = true;
  g.clock = sanitizeClock({ day: data.S.day, time: data.S.time, lastSave: data.S.lastSave });
  const t = g.terminals[g.activeTerminal];
  t.sim = data.S;
  t.buses = data.buses;
  return g;
}

// Make g the live game. With v (the version the data came from), every owned
// terminal's raw sim is repaired first; a terminal whose data cannot be
// repaired restarts empty (progression kept) and is reported in the notes.
function adoptGame(g, v = null) {
  G = g;
  runtime = {};
  const notes = [];
  for (const t of ownedTerminals()) {
    if (v == null) { bindTerminal(t.id); rebuildFacilities(); continue; }
    try { fixupTerminal(t, v); }
    catch (e) {
      t.sim = Object.assign(freshSim(finiteOr(t.sim && t.sim.rep, CONFIG.profiles.classic.rep)), { bottle: wcDef("cologne", t).ml });
      t.buses = [];
      bindTerminal(t.id);
      rebuildFacilities();
      notes.push(`${terminalName(t.id)} durumu okunamadı ve sıfırlandı (${e.message}).`);
    }
    if (t.id !== g.activeTerminal) { t.sim.view = "out"; t.sim.washBus = null; }
  }
  bindTerminal(G.activeTerminal);
  return notes;
}

const terminalName = id => (CONFIG.terminals.find(d => d.id === id) || { name: id }).name;

// Repairs one terminal's saved sim + buses in place (bound while it runs).
// v is the save version the data came from; the per-version fix-ups below
// are the pre-v7 loader's, unchanged.
function fixupTerminal(t, v) {
  const raw = t.sim && typeof t.sim === "object" ? t.sim : {};
  t.sim = Object.assign(freshSim(), raw);
  delete t.sim.time; delete t.sim.day; delete t.sim.lastSave; // the clock is G.clock
  t.sim.rep = clamp(finiteOr(raw.rep, 50), 0, 100);
  t.sim.stats = sanitizeStats(raw.stats, t.sim.rep);
  t.sim.history = (Array.isArray(raw.history) ? raw.history : []).filter(h => h && typeof h === "object")
    .slice(-HISTORY_DAYS).map(h => Object.assign(sanitizeStats(h, 50), { day: Math.max(1, Math.floor(finiteOr(h.day, 1))), repEnd: clamp(finiteOr(h.repEnd, 50), 0, 100) }));
  const hadParkingUpgradeData = CONFIG.parkingLots.some(x => x.spaces === raw.parkingSpaces);
  t.sim.parkingSpaces = hadParkingUpgradeData ? raw.parkingSpaces : 4; // earlier saves had four built spaces
  t.sim.busesServed = Math.max(0, Math.floor(finiteOr(raw.busesServed,
    t.sim.history.reduce((n, h) => n + h.buses, t.sim.stats.buses))));
  if (!Array.isArray(raw.slotVacantSince) || raw.slotVacantSince.length !== BAY_SLOTS.length) {
    const old = Array.isArray(raw.slotVacantSince) ? raw.slotVacantSince : [];
    t.sim.slotVacantSince = BAY_SLOTS.map(() => null);
    const start = parkingSlotStart(t.sim.parkingSpaces);
    old.slice(0, t.sim.parkingSpaces).forEach((v, i) => { t.sim.slotVacantSince[start + i] = v == null ? null : finiteOr(v, null); });
  }
  t.sim.nextBusAt = finiteOr(raw.nextBusAt, G.clock.time + 0.25);
  { const ml = wcLevel("cologne", t.wc.cologne).ml; t.sim.bottle = clamp(finiteOr(raw.bottle, ml), 0, ml); }
  t.sim.tea = clamp(finiteOr(raw.tea, 1), 0, 1);
  t.buses = Array.isArray(t.buses) ? t.buses.filter(b => b && typeof b === "object" && Array.isArray(b.pax)) : [];
  if (!hadParkingUpgradeData) {
    const start = parkingSlotStart(t.sim.parkingSpaces);
    for (const b of t.buses) {
      if (Number.isInteger(b.slot) && b.slot >= 0 && b.slot < 4) b.slot += start;
      if (Number.isInteger(b.forcedSlot) && b.forcedSlot >= 0 && b.forcedSlot < 4) b.forcedSlot += start;
    }
  }
  // bus ids are per terminal: the next one must not collide with a saved bus
  t.sim.nextBusId = Math.max(Number.isInteger(raw.nextBusId) ? raw.nextBusId : 1, ...t.buses.map(b => (Number.isInteger(b.id) ? b.id : 0) + 1));
  bindTerminal(t.id);
  // v6 saves predate per-stall cleanliness, and older saves carry the old
  // 8-stall count — if the array is missing or the count no longer matches,
  // inherit the old shared value so an old game keeps its dirt instead of
  // skipping ahead to spotless
  // Check raw (the save), not S: after Object.assign above, S.stallClean
  // always exists from freshSim(), which would hide a genuinely missing key.
  if (!Array.isArray(raw.stallClean) || raw.stallClean.length !== WC_STALLS)
    S.stallClean = Array(WC_STALLS).fill(clamp(finiteOr(raw.cleanliness, 100), 0, 100));
  else
    S.stallClean = raw.stallClean.map(x => clamp(finiteOr(x, 100), 0, 100));
  S.cleanliness = avgClean(); // re-derive the HUD average
  const activeSlots = new Set(activeParkingSlots());
  for (const b of buses) {
    if ((b.state === "stop" || b.state === "enter") && !activeSlots.has(b.slot)) b.slot = activeParkingSlots()[0];
    migrateBus(b);
  }
  // older saves predate the man/woman/kid looks — give untyped guests one
  for (const b of buses) for (const p of b.pax) {
    if (!p.type) p.type = rollPaxType();
    if (!p.skin) p.skin = pick(SKIN_TONES);
    if (!p.hair) p.hair = pick(HAIR_TONES);
    // saves from the bastinado era: a `fled` guest still walking to the exit
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
  if (scrubbers.length) {
    if (t.id === G.activeTerminal) { startScrub(scrubbers[0]); S.view = "wc"; }
    else { scrubbers[0].state = "leaveC"; scrubbers[0].runaway = false; } // the scrub is a foreground show
  }
  // stall de-dup: first claim wins, later claimants demoted to drive
  const taken = new Set();
  for (const b of buses) if ((b.state === "stop" || b.state === "enter") && b.slot != null) {
    if (taken.has(b.slot)) { b.slot = null; b.state = "drive"; b.stoppedOnce = true; } else taken.add(b.slot);
  }
  for (const b of buses) syncPhase(b);
  // v3 outdoor pax were placed in the old apron band — teleport to their bus door
  if (v === 3) for (const b of buses) for (const p of b.pax)
    if (p.state === "walk" || p.state === "free" || p.state === "board") {
      const d = doorPos(b); p.x = d.x; p.y = d.y; p.tx = d.x; p.ty = d.y;
      p.state = "free"; p.idleT = rand(0.5, 2);
    }
  // Older saves have no visitor-selection flags. Preserve passengers already
  // outside and plan staggered remaining visits with the current WC guarantee.
  for (const b of buses) if (b.state === "stop" && b.pax.some(p => typeof p.disembark !== "boolean"))
    planStopVisitors(b, true);
  rebuildFacilities();
  // the windshield grid changed shape across versions (v3/v4: 6×3, v5: 6×4,
  // v6: 30×20) — resample any saved wash onto the current grid, taking the
  // nearest old cell, so old saves keep their grime
  const wn = WASH.wind.cols * WASH.wind.rows;
  const oldGrid = { 18: [6, 3], 24: [6, 4] }; // saved array length -> [cols, rows]
  for (const b of buses) {
    if (b.wash && (!Array.isArray(b.wash.g) || !Array.isArray(b.wash.f))) b.wash = null; // unreadable — rebuilt dusty on demand
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
}
/* ----------------------------- Economy ------------------------------ */
// The only place company cash changes. amount > 0 is income, < 0 an expense.
// An expense the company can't cover is refused (null) unless mandatory — a
// loss that already happened in the world, like change handed back by mistake.
// Each applied transaction gets a unique id, a ledger line, a per-kind total
// and its terminal's daily revenue / expenses.
function applyTransaction(kind, amount, terminalId = null, note = "", mandatory = false) {
  if (!Number.isFinite(amount) || amount === 0) return null;
  const co = G.company;
  if (amount < 0 && co.cash + amount < 0 && !mandatory) return null;
  const tx = { id: co.nextTxId++, kind, amount, terminal: terminalId, day: G.clock.day, time: G.clock.time, note };
  co.cash += amount;
  co.totals[kind] = (co.totals[kind] || 0) + amount;
  co.ledger.push(tx);
  if (co.ledger.length > CONFIG.economy.ledgerMax) co.ledger.splice(0, co.ledger.length - CONFIG.economy.ledgerMax);
  const t = terminalId && G.terminals[terminalId];
  if (t) { if (amount > 0) t.sim.stats.revenue += amount; else t.sim.stats.expenses -= amount; }
  return tx;
}

// A completed, paid toilet visit: the fee is booked once per visit (feePaid is
// reset when the guest joins a payment line). Change handed back beyond what
// was owed is booked as a loss.
function collectPayment(p) {
  if (p.feePaid) return;
  p.feePaid = true;
  applyTransaction("toiletFee", CONFIG.economy.toiletFee, boundId, "WC");
  const over = (p.changeGiven || 0) - Math.max(0, p.owed || 0);
  if (over > 0) applyTransaction("changeLoss", -over, boundId, "fazla para üstü", true);
}

const fail = reason => ({ ok: false, reason });
const termDef = id => CONFIG.terminals.find(d => d.id === id);
// A tier's price at a given terminal: the base cost × the terminal's development cost.
const tierCost = (id, def) => Math.round(def.cost * ((termDef(id) || {}).devCost || 1) / 10) * 10;
const ownedTerminal = id => (G.terminals[id] && G.terminals[id].owned ? G.terminals[id] : null);

// Can terminal `id` buy level `level` of WC track `track` right now? { ok, reason, def }
function wcUpgradeStatus(id, track, level) {
  const t = ownedTerminal(id);
  if (!t) return fail("Bu terminal senin değil");
  if (!CONFIG.wcTracks[track]) return fail("Bilinmeyen yükseltme");
  const def = wcLevel(track, level);
  if (!def) return fail("Böyle bir seviye yok");
  if (level <= t.wc[track]) return { ok: false, reason: "Sahipsin", def, owned: true };
  if (level !== t.wc[track] + 1) return { ok: false, reason: `Önce: ${wcLevel(track, level - 1).name}`, def };
  const minServed = def.minServed || 0;
  if (S.stats.served < minServed) {
    const remaining = minServed - S.stats.served;
    return { ok: false, reason: gameLanguage === "en" ? `Serve ${remaining} more guests` : `${remaining} misafir daha hizmet gerek`, def };
  }
  const cost = tierCost(id, def);
  if (G.company.cash < cost) return { ok: false, reason: `${fmtTL(cost - G.company.cash)} eksik`, def, cost };
  return { ok: true, def, cost };
}

// Can terminal `id` expand to the next parking-lot size? Progress is per terminal
// and counts completed bus stops across days.
function parkingUpgradeStatus(id, spaces) {
  const t = ownedTerminal(id);
  if (!t) return fail("Bu terminal senin değil");
  const current = parkingSpaces(t.sim);
  const next = CONFIG.parkingLots.find(x => x.spaces === spaces);
  if (!next) return fail("Böyle bir otopark seviyesi yok");
  if (spaces <= current) return { ok: false, reason: "Sahipsin", def: next, owned: true };
  const expected = CONFIG.parkingLots.find(x => x.spaces > current);
  if (next !== expected) return fail(`Önce ${expected.spaces} park yeri açılmalı`);
  if ((t.sim.busesServed || 0) < next.minBuses) {
    const remaining = next.minBuses - (t.sim.busesServed || 0);
    return { ok: false, reason: gameLanguage === "en" ? `Serve ${remaining} more buses` : `${remaining} otobüse daha hizmet ver`, def: next };
  }
  const cost = tierCost(id, next);
  if (G.company.cash < cost) return { ok: false, reason: `${fmtTL(cost - G.company.cash)} eksik`, def: next, cost };
  return { ok: true, def: next, cost };
}

function upgradeParkingLot(id, spaces) {
  const st = parkingUpgradeStatus(id, spaces);
  if (!st.ok) return st;
  const sim = G.terminals[id].sim, old = parkingSpaces(sim);
  const tx = applyTransaction("facility", -st.cost, id, `${st.def.spaces} otobüs park yeri`);
  if (!tx) return fail("Yetersiz kasa");
  sim.parkingSpaces = st.def.spaces;
  for (const i of activeParkingSlots(st.def.spaces))
    if (!activeParkingSlots(old).includes(i) && sim.slotVacantSince[i] == null) sim.slotVacantSince[i] = G.clock.time;
  save();
  return { ok: true, def: st.def, tx };
}

// Can terminal `id` buy car-wash tier `tier`? Tier 1 is the unlock: it needs
// cash and nothing else — reputation is deliberately not a requirement.
function carWashStatus(id, tier) {
  const t = ownedTerminal(id);
  if (!t) return fail("Bu terminal senin değil");
  const def = CONFIG.carWashTiers.find(x => x.tier === tier);
  if (!def) return fail("Böyle bir seviye yok");
  const have = t.carWash.unlocked ? t.carWash.tier : 0;
  if (tier <= have) return { ok: false, reason: "Sahipsin", def, owned: true };
  if (tier !== have + 1) return { ok: false, reason: `Önce: ${CONFIG.carWashTiers.find(x => x.tier === tier - 1).name}`, def };
  const cost = tierCost(id, def);
  if (G.company.cash < cost) return { ok: false, reason: `${fmtTL(cost - G.company.cash)} eksik`, def, cost };
  return { ok: true, def, cost };
}

// Buy the next level of a track (a CONFIG.wcTracks key or "carWash"):
// validated first, then charged and applied together.
function purchaseUpgrade(id, track, tier) {
  if (track === "carWash") {
    const st = carWashStatus(id, tier);
    if (!st.ok) return st;
    const tx = applyTransaction("facility", -st.cost, id, st.def.name);
    if (!tx) return fail("Yetersiz kasa");
    G.terminals[id].carWash = { unlocked: true, tier: st.def.tier };
    scheduleMaintenance(G.terminals[id]);
    save();
    return { ok: true, tx };
  }
  const st = wcUpgradeStatus(id, track, tier);
  if (!st.ok) return st;
  const tx = applyTransaction("facility", -st.cost, id, st.def.name);
  if (!tx) return fail("Yetersiz kasa");
  const t = G.terminals[id], from = wcDef(track, t);
  const built = STALL_ORDER.slice(0, wcDef("count", t).stalls);
  t.wc[track] = st.def.level;
  // new bays open spotless; a new fixture replaces (and cleans) every built one
  if (track === "count") for (const i of STALL_ORDER.slice(from.stalls, st.def.stalls)) t.sim.stallClean[i] = 100;
  if (track === "style") for (const i of built) t.sim.stallClean[i] = 100;
  if (track === "cologne") t.sim.bottle = st.def.ml; // the new bottle arrives full
  if (track === "tea") t.sim.tea = 1; // the new glass arrives full
  if (track === "tool" && id === G.activeTerminal) toolInHand = null; // the stations get their new tool
  const now = STALL_ORDER.slice(0, wcDef("count", t).stalls);
  t.sim.cleanliness = now.reduce((a, i) => a + t.sim.stallClean[i], 0) / now.length;
  scheduleMaintenance(t);
  save();
  return { ok: true, tx };
}

/* -------------------------- Terminal network -------------------------- */
// Each requirement of a terminal, and whether the company meets it now.
function terminalRequirements(id) {
  const r = (termDef(id) || {}).requires || {}, own = ownedTerminals(), out = [];
  if (r.minRep != null) {
    const best = Math.max(0, ...own.map(t => t.sim.rep));
    out.push({ text: gameLanguage === "en"
      ? `Reputation ${r.minRep}+ at one terminal (best: ${Math.round(best)})`
      : `Bir terminalinde itibar ${r.minRep}+ (en iyisi: ${Math.round(best)})`, met: best >= r.minRep });
  }
  if (r.minOwned != null) out.push({ text: gameLanguage === "en"
    ? `At least ${r.minOwned} ${r.minOwned === 1 ? "terminal" : "terminals"} (current: ${own.length})`
    : `En az ${r.minOwned} terminal (şimdi: ${own.length})`, met: own.length >= r.minOwned });
  if (r.minToiletStyle != null) {
    const best = Math.max(...own.map(t => t.wc.style));
    const styleName = wcLevel("style", r.minToiletStyle).name;
    out.push({ text: gameLanguage === "en"
      ? `At one terminal: ${translateText(styleName)} or better`
      : `Bir terminalde ${styleName} ya da daha iyisi`, met: best >= r.minToiletStyle });
  }
  return out;
}

// Can the company buy terminal `id` now? { ok, reason, def, reqs }
function terminalStatus(id) {
  const def = termDef(id);
  if (!def) return fail("Böyle bir terminal yok");
  if (ownedTerminal(id)) return { ok: false, reason: "Sahipsin", def, owned: true, reqs: [] };
  const reqs = terminalRequirements(id), unmet = reqs.find(x => !x.met);
  if (unmet) return { ok: false, reason: gameLanguage === "en" ? `Requirement: ${unmet.text}` : `Şart: ${unmet.text}`, def, reqs };
  if (G.company.cash < def.price) return { ok: false, reason: `${fmtTL(def.price - G.company.cash)} eksik`, def, reqs };
  return { ok: true, def, reqs };
}

// Buy a terminal: validated first; then charged once and initialized from its
// profile. Every other terminal is left exactly as it was.
function unlockTerminal(id) {
  const st = terminalStatus(id);
  if (!st.ok) return st;
  const tx = applyTransaction("terminal", -st.def.price, id, st.def.name);
  if (!tx) return fail("Yetersiz kasa");
  const t = freshTerminal(id, st.def.profile);
  t.sim.nextBusAt = G.clock.time + 0.1; // its first bus is already on the way
  G.terminals[id] = t;
  const prev = boundId;
  bindTerminal(id);
  rebuildFacilities();
  scheduleMaintenance(t);
  bindTerminal(prev);
  toast(`🎉 ${st.def.name} artık senin`, "good");
  save();
  return { ok: true, tx };
}

// Show another owned terminal. Only the binding changes — every terminal keeps
// running in the shared scheduler, so nothing is paused, replayed or duplicated.
function switchTerminal(id) {
  if (!ownedTerminal(id)) return fail("Bu terminal senin değil");
  if (id === G.activeTerminal) return fail("Zaten buradasın");
  if (scrub) finishScrub();     // the caught runaway's show ends with the visit
  setView("out");               // tools go back on their stations
  S.view = "out"; S.washBus = null;
  G.activeTerminal = id;
  bindTerminal(id);
  S.view = "out"; S.washBus = null;
  viewFade = 1;
  save();
  return { ok: true };
}

/* -------------------- Automation & maintenance -------------------- */
// Absolute game hours since day 1, 00:00 — maintenance deadlines never wrap.
const absNow = () => (G.clock.day - 1) * 24 + G.clock.time;
const tierOfToilet = t => wcDef("style", t);
// "2 kabin · İlkel alaturka tuvaletler · Küçük el fırçası" for a wc levels object
const wcSummary = wc => ["count", "style", "tool", "cologne", "calc"]
  .filter(k => wc[k] > 0).map(k => wcLevel(k, wc[k]).name).join(" · ");
const tierOfWash = t => (t.carWash.unlocked ? CONFIG.carWashTiers.find(x => x.tier === t.carWash.tier) : null);
const SYSTEM_NAMES = { toilet: "Otomatik tuvaletler", wash: "Otomatik yıkama" };

// The automated systems a terminal has installed (working or not).
function autoSystems(t) {
  const out = [];
  if (tierOfToilet(t).auto) out.push("toilet");
  const w = tierOfWash(t);
  if (w && w.auto) out.push("wash");
  return out;
}
const systemFailed = (t, sys) => t.maintenance.failures.some(f => f.system === sys);
const autoRunning = sys => autoSystems(term()).includes(sys) && !systemFailed(term(), sys);
const maintenanceCost = t => (tierOfToilet(t).upkeep || 0) + ((tierOfWash(t) || {}).upkeep || 0);
const operatingCost = t => (tierOfToilet(t).opCost || 0) + ((tierOfWash(t) || {}).opCost || 0);
const maintenanceDue = t => t.maintenance.nextDueAt != null && absNow() >= t.maintenance.nextDueAt;
const needsAttention = t => autoSystems(t).length > 0 && (maintenanceDue(t) || t.maintenance.failures.length > 0);

// The first automated system starts the maintenance schedule; later
// upgrades keep the running one.
function scheduleMaintenance(t) {
  const m = t.maintenance;
  if (!autoSystems(t).length || m.nextDueAt != null) return;
  m.condition = 100;
  m.lastAt = absNow();
  m.nextDueAt = absNow() + CONFIG.maintenance.intervalHours;
  m.tickAt = Math.floor(absNow()) + 1;
  m.dueNotified = false;
}

function breakDown(t, sys) {
  t.maintenance.failures.push({ system: sys, at: absNow() });
  t.sim.rep = clamp(t.sim.rep - CONFIG.maintenance.failRep, 0, 100);
  toast(`⚠️ ${SYSTEM_NAMES[sys]} arızalandı — onarılana kadar elle çalış`, "bad", true);
}

// Hourly, on the game clock (so every speed tier and a hidden-tab catch-up
// see the same schedule): wear, the breakdown roll, the due notice.
function maintenanceTick() {
  const t = term(), m = t.maintenance, sys = autoSystems(t), M = CONFIG.maintenance;
  if (!sys.length) return;
  if (m.tickAt == null) m.tickAt = Math.floor(absNow()) + 1;
  while (absNow() >= m.tickAt) {
    const overdue = m.nextDueAt != null && m.tickAt >= m.nextDueAt;
    m.condition = clamp(m.condition - (overdue ? M.overdueWearPerHour : M.wearPerHour), 0, 100);
    for (const s of sys) {
      if (systemFailed(t, s)) continue;
      const p = (M.failBase + M.failWorn * ((100 - m.condition) / 100) ** 2) * (overdue ? M.overdueFailMult : 1);
      if (Math.random() < p) breakDown(t, s);
    }
    m.tickAt += 1;
  }
  if (maintenanceDue(t) && !m.dueNotified) {
    m.dueNotified = true;
    toast(`🔧 Günlük bakım zamanı (${fmtTL(maintenanceCost(t))})`, "bad", true);
  }
}

function maintenanceStatus(id) {
  const t = ownedTerminal(id);
  if (!t) return fail("Bu terminal senin değil");
  if (!autoSystems(t).length) return fail("Bakım gerektiren otomasyon yok");
  if (!maintenanceDue(t) && t.maintenance.condition >= 100) return fail("Bakım gerekmiyor");
  const cost = maintenanceCost(t);
  if (G.company.cash < cost) return { ok: false, reason: `${fmtTL(cost - G.company.cash)} eksik`, cost };
  return { ok: true, cost };
}

// Routine maintenance: restores condition and books the next deadline.
function performMaintenance(id) {
  const st = maintenanceStatus(id);
  if (!st.ok) return st;
  if (!applyTransaction("maintenance", -st.cost, id, "günlük bakım")) return fail("Yetersiz kasa");
  const m = G.terminals[id].maintenance;
  m.condition = 100;
  m.lastAt = absNow();
  m.nextDueAt = absNow() + CONFIG.maintenance.intervalHours;
  m.dueNotified = false;
  save();
  return { ok: true };
}

function repairStatus(id, sys) {
  const t = ownedTerminal(id);
  if (!t) return fail("Bu terminal senin değil");
  if (!systemFailed(t, sys)) return fail("Arıza yok");
  const cost = CONFIG.maintenance.repairCost[sys];
  if (G.company.cash < cost) return { ok: false, reason: `${fmtTL(cost - G.company.cash)} eksik`, cost };
  return { ok: true, cost };
}

// Clears a breakdown; the system runs again at its current condition.
function repairFailure(id, sys) {
  const st = repairStatus(id, sys);
  if (!st.ok) return st;
  if (!applyTransaction("repair", -st.cost, id, SYSTEM_NAMES[sys])) return fail("Yetersiz kasa");
  const m = G.terminals[id].maintenance;
  m.failures = m.failures.filter(f => f.system !== sys);
  save();
  return { ok: true };
}

// Buses saved before v4 used a left-edge + baseY model (horizontal only).
// Convert to the center + angle model; a v3 bus could never be mid-turn.
function migrateBus(b) {
  if (b.cx == null) { b.cx = b.x + b.len / 2; b.cy = b.baseY - 45; b.ang = 0; }
  delete b.x; delete b.baseY;
  b.from = DEST_A; b.to = DEST_B;
  if (b.animFrom) { // saved mid-turn under the old tweened turn: restart the move on the new paths
    if (b.state === "enter") { if (!activeParkingSlots().includes(b.slot)) b.slot = activeParkingSlots()[0]; b.mv = { s: 0 }; Object.assign(b, enterPose(enterGeom(b, b.slot), 0)); }
    if (b.state === "exit") { b.mv = { s: 0, sx: b.animFrom.cx, sy: b.animFrom.cy }; Object.assign(b, exitPose(exitGeom(b), 0)); }
    b.v = 0;
    delete b.animFrom; delete b.animTo; delete b.animT;
  }
  if (b.state === "stop") {
    const s = BAY_SLOTS[b.slot] || BAY_SLOTS[activeParkingSlots()[0]];
    b.cx = s.cx; b.cy = LOT_NOSE + b.len / 2; b.ang = -busDir(b) * Math.PI / 2;
  }
}
function rebuildFacilities() {
  facilities = runtime[boundId].facilities = emptyFacilities();
  // In-visit guests occupy spots, not queue slots (live pull does queue.shift();
  // completeService never re-adds). Restore them to the free spots, in saved
  // order, capacity-capped — instead of ghosting them back into the queue.
  // Service timers restart in full: spot occupancy is not part of the save.
  const rStalls = DINER_SEATS, tStalls = WC_STALLS;
  const rSpots = Array(rStalls).fill(null), tSpots = Array(tStalls).fill(null);
  // prefer the stall/seat the guest was using (p.stall); if that slot went
  // away, take the first free one — capacity-capped either way.
  const nextFree = (arr, pref, ok = () => true) => {
    if (pref >= 0 && pref < arr.length && !arr[pref] && ok(pref)) return pref;
    for (let i = 0; i < arr.length; i++) if (!arr[i] && ok(i)) return i;
    return -1;
  };
  for (const p of buses.flatMap(b => b.pax)) {
    // Saves from older versions may contain guests inside or queued for the
    // diner. Release them outside; a closed Lokanta never resumes service.
    if (!LOKANTA_OPEN && (p.state === "serveR" || p.state === "waitR" || p.want === "R")) {
      p.refuseR = true;
      wander(p);
      continue;
    }
    if (p.state === "serveR") { const s = nextFree(rSpots, p.stall); if (s >= 0) { rSpots[s] = { pax: p, t: SVC_TIME_R }; p.stall = s; } continue; }
    if (p.state === "serveT") { const s = nextFree(tSpots, p.stall, stallActive); if (s >= 0) { tSpots[s] = { pax: p, t: rand(TOILET_STAY[0], TOILET_STAY[1]) }; p.stall = s; } continue; }
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

// How long a bay may sit empty before the vacancy backstop dispatches a bus.
// Dispatch at 8 minutes to leave time for the incoming bus to reach the lot,
// keeping the actual empty stretch safely below the 10-minute limit.
function maxGap() {
  return 8 / 60; // game hours
}

function busInterval() {
  // Keep arrivals frequent at every reputation: about 5–8 game minutes at
  // rep 0, falling to about 2–5 minutes at rep 100. The vacancy backstop is
  // still there in case a scheduled arrival is delayed or blocked.
  return lerp(rand(0.08, 0.13), rand(0.04, 0.09), S.rep / 100);
}

// opening: the new game's first bus appears on the lane just short of the
// first bay's turn-in instead of off-screen, so it pulls in ~1 real second
// after play starts.
// Buses that drive straight through the stop without pulling in. Each direction has its own lane.
let throughTimer = 25;
let autoTraffic = true; // random cars, through buses and scheduled arrivals (the traffic tests switch it off)
function throughTick(dt) {
  if (!autoTraffic) return;
  throughTimer -= dt;
  if (throughTimer > 0) return;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const len = BUS_KINDS.small.len;
  const cx = dir > 0 ? -offX - len / 2 - 20 : Wdyn - offX + len / 2 + 20;
  if (!laneEntryFree(dir, cx - len / 2, cx + len / 2, BUS_V)) { throughTimer = 0.5; return; } // its lane is backed up to the edge
  throughTimer = rand(25, 55);
  buses.push({
    id: S.nextBusId++, kind: "small", len, hue: pick([8, 28, 145, 200, 260, 330]),
    from: DEST_A, to: DEST_B,
    cx,
    cy: THROUGH_LANE[dir], ang: 0, dir, through: true,
    state: "drive", stopStart: 0, stopEnd: 0, stopElapsed: 0,
    boardWait: 0, boardGrace: 0, stoppedOnce: true, slot: null, forcedSlot: null,
    pax: [], v: BUS_V * rand(0.85, 1.1),
  });
}

function spawnBus(reserved = null, opening = false) {
  const dirIn = opening || Math.random() < 0.5 ? 1 : -1; // buses come in from either side
  const roll = Math.random();
  const kind = roll < 0.68 ? "small" : roll < 0.9 ? "mid" : "big";
  const def = BUS_KINDS[kind];
  const n = Math.max(20, Math.round(rand(def.pax[0], def.pax[1]) * (0.55 + S.rep / 130)));
  const hue = pick([8, 28, 145, 200, 260, 330]);
  const cx = opening ? enterGeom({ len: def.len }, activeParkingSlots()[0]).x0 - CONFIG.firstBusLead
    : dirIn > 0 ? -offX - def.len / 2 - rand(20, 160) // off the canvas edge, not the core edge
    : Wdyn - offX + def.len / 2 + rand(20, 160);
  if (!opening && !laneEntryFree(dirIn, cx - def.len / 2, cx + def.len / 2, BUS_V)) return false; // try again next step
  const pax = [];
  for (let i = 0; i < n; i++) pax.push(makePax());
  const b = {
    id: S.nextBusId++,
    kind, len: def.len, hue,
    from: DEST_A, to: DEST_B,
    cx,
    cy: THROUGH_LANE[dirIn],
    ang: 0,
    dir: dirIn,
    state: "drive",
    phase: PHASE.APPROACHING, // traffic phase (see the traffic controller)
    reqSeq: null,             // its place in line for the maneuver reservation
    parkSlot: null,           // the bay it holds the parking reservation for
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
  toast(gameLanguage === "en" ? `🚌 ${DEST_A} · ${n} passengers` : `🚌 ${DEST_A}'dan ${n} yolcu`, "");
  return true;
}

// A brand-new company's opening bus, once — the flag is saved, so a reload never replays it.
function openingBus() {
  if (G.flags.firstBusDone || boundId !== G.activeTerminal || buses.length) return;
  G.flags.firstBusDone = true;
  spawnBus(null, true);
  S.nextBusAt = G.clock.time + busInterval();
  save();
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
    bill: null, owed: 0, changeGiven: 0, changeNotes: [], receivedChangeNotes: [],  // change bills handed back and the ones that have arrived
    unpaid: false,   // used the WC and never paid the ₺20 (any reason)
    runaway: false,  // skipped the counter and is running for the exit — catchable
                     // only while still inside the WC (state "leaveC")
    useSat: null, cologne: false, colognePrev: null,
    waitTotal: 0, payT: 0, doneT: 0, dripT: 0,
  };
}

// The boarding door, in world coords (rotates with the bus). It is always on
// the bus's right-hand side: +y for a bus heading right, -y for one heading left.
function doorPos(b) {
  const lx = busDir(b) * (b.len / 2 - 19), ly = 47 * busDir(b); // the front door, under the windshield
  const c = Math.cos(b.ang), s = Math.sin(b.ang);
  return { x: b.cx + lx * c - ly * s, y: b.cy + lx * s + ly * c };
}

// True only when every passenger is actually aboard (state "bus"). The bus
// never pulls out while a guest is still walking for the door.
function allAbroad(b) {
  return b.pax.every(p => p.state === "bus");
}

/* ---------------------------- Passengers ---------------------------- */
// Bus driving: px/s and px/s². Turns follow true circular arcs; the heading
// is always the path tangent, so the body never slides sideways.
const BUS_V = 185, BUS_TURN_V = 62, BUS_ACC = 55, BUS_BRAKE = 85, BUS_REV_V = 38;
const LANE_CY = LANE_Y - 45;

// Pull-in: a left quarter-circle off the lane, then a short straight into the stall.
function enterGeom(b, slot) {
  const sg = busDir(b), tx = BAY_SLOTS[slot].cx, ty = LOT_NOSE + b.len / 2, D = 28;
  const R = laneCy(b) - ty - D;
  return { x0: tx - sg * R, R, D, tx, ty, L: R * Math.PI / 2 + D, sg, laneY: laneCy(b) };
}
function enterPose(g, s) {
  const arc = g.R * Math.PI / 2;
  if (s <= arc) {
    const th = s / g.R;
    return { cx: g.x0 + g.sg * g.R * Math.sin(th), cy: g.laneY - g.R + g.R * Math.cos(th), ang: -g.sg * th };
  }
  return { cx: g.tx, cy: g.ty + g.D - (s - arc), ang: -g.sg * Math.PI / 2 };
}
// Back-out: reverse straight a little, then reverse through a quarter-circle
// (tail swinging west) so the bus ends on the lane facing east.
// (sx, sy): the parked pose it backs out from — defaults to the one recorded when it started.
function exitGeom(b, sx = b.mv.sx, sy = b.mv.sy) {
  const d = 24, R = laneCy(b) - sy - d;
  return { sx, sy, d, R, L: d + R * Math.PI / 2, sg: busDir(b), laneY: laneCy(b) };
}
function exitPose(g, s) {
  if (s <= g.d) return { cx: g.sx, cy: g.sy + s, ang: -g.sg * Math.PI / 2 };
  const ph = (s - g.d) / g.R;
  return { cx: g.sx - g.sg * (g.R - g.R * Math.cos(ph)), cy: g.sy + g.d + g.R * Math.sin(ph), ang: -g.sg * (Math.PI / 2 - ph) };
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

// Buses never drive over a guest on foot. Guests aboard are inside the bus
// and don't count; neither do indoor guests (the WC walls keep them clear).
const PAX_CLEAR = 8; // px of clearance the bus body keeps around a guest
function walkingPax() {
  return buses.flatMap(o => o.pax).filter(p => p.state !== "bus" && !isIndoorPax(p));
}
// The first guest a bus body with this pose would cover, or null.
function paxUnderPose(walkers, b, cx, cy, ang) {
  if (!walkers.length) return null;
  const c = Math.cos(ang), s = Math.sin(ang), hl = b.len / 2 + PAX_CLEAR, hw = 33 + PAX_CLEAR;
  return walkers.find(p => {
    const x = p.x - cx, y = p.y - cy;
    return Math.abs(x * c + y * s) < hl && Math.abs(-x * s + y * c) < hw;
  }) || null;
}
// A guest who has held a bus for a while (stuck on a route, or standing still in
// the bus's path) steps sideways out of the bus's body, so the bus is never
// stuck behind them for long — and still never drives over them.
const PAX_SHOVE_AFTER = 1; // real seconds a bus may be held by one guest before they step aside
function shoveOutOfBus(p) {
  // nearest spot clear of every bus (including this one) — the guest may have been
  // walled in between parked buses, where their route out is closed
  const q = outsideBuses({ x: p.x, y: p.y }, outdoorBusObstacles());
  p.x = q.x; p.y = q.y;
}
// Walks a bus from s0 to s1 in small steps (poseAt maps a position to its pose)
// and returns how far it gets before its body would cover a guest.
function sweepClear(b, walkers, s0, s1, poseAt) {
  if (!walkers.length) return { s: s1, blocked: false, hit: null };
  const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 3));
  for (let i = 1; i <= n; i++) {
    const s = i === n ? s1 : s0 + (s1 - s0) * i / n;
    const q = poseAt(s);
    const hit = paxUnderPose(walkers, b, q.cx, q.cy, q.ang);
    if (hit) return { s: s0 + (s1 - s0) * (i - 1) / n, blocked: true, hit }; // stop short of the guest
  }
  return { s: s1, blocked: false, hit: null };
}

// Outdoor walkers use bus-sized obstacles with a little personal-space padding.
// A visibility graph around the bus corners routes paths without letting guests
// cut through parked or moving buses, including on the way back to their door.
const PAX_BUS_GAP = 3; // kept small: two buses in neighbouring bays leave an 18px gap, and a wider pad would wall guests off from their door
function outdoorBusObstacles() {
  return buses.map(b => ({
    b, hl: b.len / 2 + PAX_BUS_GAP, hw: 33 + PAX_BUS_GAP,
    c: Math.cos(b.ang), s: Math.sin(b.ang),
  }));
}
function busLocalPoint(p, o) {
  const x = p.x - o.b.cx, y = p.y - o.b.cy;
  return { x: x * o.c + y * o.s, y: -x * o.s + y * o.c };
}
function busWorldPoint(p, o) {
  return { x: o.b.cx + p.x * o.c - p.y * o.s, y: o.b.cy + p.x * o.s + p.y * o.c };
}
function outsideBuses(p, obstacles) {
  let q = { x: p.x, y: p.y };
  for (let n = 0; n < obstacles.length * 2 + 1; n++) {
    let moved = false;
    for (const o of obstacles) {
      const l = busLocalPoint(q, o);
      if (Math.abs(l.x) >= o.hl || Math.abs(l.y) >= o.hw) continue;
      {
        const dx = o.hl - Math.abs(l.x), dy = o.hw - Math.abs(l.y);
        if (dx < dy) l.x = (l.x < 0 ? -1 : 1) * (o.hl + 1);
        else l.y = (l.y < 0 ? -1 : 1) * (o.hw + 1);
        q = busWorldPoint(l, o);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return q;
}
function segmentHitsBus(a, z, o) {
  const p = busLocalPoint(a, o), q = busLocalPoint(z, o);
  const dx = q.x - p.x, dy = q.y - p.y;
  let lo = 0, hi = 1;
  for (const [start, delta, half] of [[p.x, dx, o.hl], [p.y, dy, o.hw]]) {
    if (Math.abs(delta) < 1e-9) {
      if (start <= -half || start >= half) return false;
      continue;
    }
    let a0 = (-half - start) / delta, a1 = (half - start) / delta;
    if (a0 > a1) [a0, a1] = [a1, a0];
    lo = Math.max(lo, a0); hi = Math.min(hi, a1);
    if (lo >= hi) return false;
  }
  return hi > 1e-6 && lo < 1 - 1e-6;
}
function nextOutdoorWaypoint(start, goal, obstacles) {
  if (!obstacles.some(o => segmentHitsBus(start, goal, o))) return { point: goal, final: true };
  const nodes = [start, goal];
  for (const o of obstacles) for (const x of [-1, 1]) for (const y of [-1, 1]) {
    nodes.push(busWorldPoint({ x: x * (o.hl + 4), y: y * (o.hw + 4) }, o));
  }
  const dist = Array(nodes.length).fill(Infinity), prev = Array(nodes.length).fill(-1), done = Array(nodes.length).fill(false);
  dist[0] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || !Number.isFinite(dist[u]) || u === 1) break;
    done[u] = true;
    for (let v = 1; v < nodes.length; v++) {
      if (done[v] || v === u || obstacles.some(o => segmentHitsBus(nodes[u], nodes[v], o))) continue;
      const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (prev[1] < 0) return { point: start, final: false };
  let first = 1;
  while (prev[first] !== 0 && prev[first] >= 0) first = prev[first];
  return { point: nodes[first], final: first === 1 };
}
function moveOutdoorPax(p, tx, ty, step) {
  const obstacles = outdoorBusObstacles();
  const start = outsideBuses({ x: p.x, y: p.y }, obstacles);
  const goal = outsideBuses({ x: tx, y: ty }, obstacles);
  p.x = start.x; p.y = start.y;
  const { point, final } = nextOutdoorWaypoint(start, goal, obstacles);
  const dx = point.x - p.x, dy = point.y - p.y, d = Math.hypot(dx, dy);
  if (d <= step) { p.x = point.x; p.y = point.y; return final; }
  if (d > 0) { p.x += dx / d * step; p.y += dy / d * step; }
  return false;
}

function beginEnter(b, slot) {
  b.slot = slot;
  b.forcedSlot = null; // the reservation is spent
  if (S.slotVacantSince) S.slotVacantSince[slot] = null; // stall is spoken for — the vacancy backstop drops
  b.stoppedOnce = true;
  b.state = "enter";
  b.phase = PHASE.PARKING; // keeps the parking reservation until finishEnter
  b.parkSlot = null;       // the reservation now lives in b.slot
  b.stopElapsed = 0; // terminal-dwell clock starts as the bus rolls in
  b.mv = { s: 0 };
  b.blink = true;
  Object.assign(b, enterPose(enterGeom(b, slot), 0)); // snaps the few px a coarse step may have overshot
}

function planStopVisitors(b, resuming = false) {
  const candidates = b.pax.filter(p => p.state === "bus");
  for (const p of b.pax) { p.disembark = false; p.forceToilet = false; }
  // Half the passengers step off as soon as the bus parks. Randomize their
  // order and leave 0.5–3 real seconds between each passenger.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = randInt(0, i); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const count = Math.min(candidates.length, Math.ceil(b.pax.length * 0.5));
  const now = resuming ? G.clock.time : b.stopStart;
  let offAt = now;
  candidates.slice(0, count).forEach(p => {
    p.disembark = true;
    p.forceToilet = true;
    offAt += rand(0.5, 3) / SECONDS_PER_HOUR;
    p.offAt = offAt;
  });
}

function finishEnter(b) {
  const g = enterGeom(b, b.slot);
  b.cx = g.tx; b.cy = g.ty; b.ang = -busDir(b) * Math.PI / 2;
  b.v = 0; b.brake = false; b.blink = false; b.mv = null;
  b.state = "stop";
  b.phase = PHASE.PARKED; // fully stationary in the bay: the parking reservation is released
  b.reqSeq = null;
  b.stopStart = G.clock.time;
  if (S.slotVacantSince) S.slotVacantSince[b.slot] = null; // stall filled
  // Planned layover: ~31 min (25–36 in-game minutes) from the moment the bus
  // is fully in. Time runs 1:1 with the real world, so the whole terminal stay
  // (roll-in + layover + whatever tail) is budgeted against the 1-hour hard cap
  // in stepTerminal(): a stop with no WC line averages ~33 min total, and even the
  // shared 5–10 min counter-line deadline plus the sprint home stays under the
  // hour — the cap is a backstop that only triggers on a very unlucky stop.
  b.stopEnd = G.clock.time + rand(0.42, 0.60);
  for (const p of b.pax) {
    p.boardAt = b.stopEnd - rand(0.10, 0.20);
  }
  planStopVisitors(b);
  guaranteeWc(b);
  if (!G.flags.firstBusParked) {
    // the very first bus: the first guest off walks straight to the WC building,
    // so the player sees right away where guests go
    const first = b.pax.filter(p => p.disembark && p.forceToilet).sort((u, v) => u.offAt - v.offAt)[0];
    if (first) first.directWc = true;
    G.flags.firstBusParked = true; save();
  }
}

// At each stop, half the passengers disembark in a quick staggered sequence
// and are directed to the WC.
function guaranteeWc(b) {
  const claim = b.pax.filter(p => p.disembark && p.forceToilet);
  if (!claim.length) return;
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

// Called by the traffic controller once the bus holds the departure reservation
// and its reversing path is clear: the bus starts backing out.
function endStop(b) {
  if (b.slot != null && S.slotVacantSince) S.slotVacantSince[b.slot] = G.clock.time; // stall vacant — backstop clock starts
  b.exitSlot = b.slot; // the bay stays reserved while this bus backs out of it
  b.slot = null;
  b.state = "exit";
  b.phase = PHASE.REVERSING;
  b.mv = { s: 0, sx: b.cx, sy: b.cy };
  b.v = 0; b.rev = true;
  for (const p of b.pax) {
    if (p.state === "serveR" || p.state === "serveT" || p.state === "scrubC" || p.state === "selfDripC") continue; // let them finish, they'll board after
    if (p.state === "queueC" || p.state === "payC" || p.state === "doneC" || p.state === "dripC" ||
        p.state === "queueC2" || p.state === "payC2") continue; // still at the counter — they'll finish & board after
    if (p.state === "leaveC") { p.x = 852 + BUILD_DX; p.y = 169 - BUILD_LIFT; p.runaway = false; goDoor(p, b); continue; } // at the exit door — out & sprint for the bus
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
  const avg = b.washDone ? clamp(rawAvg + (b.washSat != null ? b.washSat : 5), 0, 100) : rawAvg; // a sparkling bus rides off happier
  const delta = clamp((avg - 50) * 0.15 * (b.pax.length / 12), -6, 6);
  S.rep = clamp(S.rep + delta, 0, 100);
  S.stats.buses++;
  S.busesServed = (S.busesServed || 0) + 1;
  toast(`🚌 ${DEST_B} · ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`, delta >= 0 ? "good" : "bad");
}

function finishExit(b) {
  b.cy = laneCy(b); b.ang = 0;
  b.mv = null; b.rev = false;
  b.state = "drive";
  b.phase = PHASE.DEPARTING; // clear of the bay and on its lane: the departure reservation is released
  b.reqSeq = null;
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
function baySlotFor(b, slack, cx = b.cx) {
  // a bay is taken by a bus parked or pulling in there, by a bus still backing out of it (until it is on
  // the road), or by the bus holding the parking reservation for it
  const free = i => !buses.some(o => o !== b && (((o.state === "stop" || o.state === "enter") && o.slot === i)
    || (o.state === "exit" && o.exitSlot === i && o.cy < ROAD.top)
    || (o.phase === PHASE.WAIT_PARK_CLEAR && o.parkSlot === i)));
  const ok = i => free(i) && busDir(b) * (cx - enterGeom(b, i).x0) <= slack;
  if (b.forcedSlot != null && ok(b.forcedSlot)) return b.forcedSlot; // != null: plain schedule buses carry null, and null >= 0 is true in JS
  const order = busDir(b) > 0 ? activeParkingSlots() : [...activeParkingSlots()].reverse();
  for (const i of order) if (ok(i)) return i;
  return -1;
}

// The bay a bus on the road is heading for: the one it holds the parking
// reservation for, else the first free one ahead (-1: none, or not visiting).
function targetSlot(b, slack = 0, cx = b.cx) {
  if (b.through || b.stoppedOnce || b.state !== "drive") return -1;
  if (b.phase === PHASE.WAIT_PARK_CLEAR) return b.parkSlot;
  return baySlotFor(b, slack, cx);
}

// Cruise speed for a bus on the lane: slow for the upcoming turn-in (and come
// to a smooth stop short of it while it may not turn yet), and keep a gap
// behind whatever is ahead on its lane.
function driveTarget(b) {
  let vT = BUS_V;
  b.blink = false;
  const si = targetSlot(b);
  if (si >= 0) {
    const dist = busDir(b) * (enterGeom(b, si).x0 - b.cx);
    const go = b.phase === PHASE.WAIT_PARK_CLEAR && (dist > PARK_GATE_DIST || maneuverClear(b));
    const vEnd = go ? BUS_TURN_V : 0; // rolls straight into the turn, or stops at the waiting position
    vT = Math.min(vT, Math.sqrt(vEnd * vEnd + 2 * BUS_BRAKE * Math.max(0, dist - 1)));
    b.blink = dist < PARK_REQUEST_DIST; // signalling the turn-in
  }
  const room = laneRoom(b);
  if (room < Infinity) vT = Math.min(vT, Math.max(0, room * 1.4));
  return vT;
}

// Pass-through buses use their own lanes: right-to-left in the upper lane, left-to-right in the lower one.
const THROUGH_LANE = { 1: 476, "-1": 432 };
const laneCy = b => THROUGH_LANE[busDir(b)]; // bus centre; its wheels sit ~30px lower, level with the cars in the same direction (left-going y 462, right-going y 514) // left-to-right: lower lane; right-to-left: upper lane, both kept on the asphalt
const busDir = b => (b.dir || 1);

/* --------------------------- Traffic controller --------------------------- */
// One two-way road: lane +1 (rightbound, lower: cars y 514, buses cy 476) and
// lane -1 (leftbound, upper: cars y 462, buses cy 432). Every car and bus on
// the road keeps to its lane and to its order on it — nothing ever passes
// anything going its way. Everything that crosses lanes is decided here:
//  • the maneuver reservation: ONE bus parks or ONE bus reverses out at a time.
//    Parking and departure have separate owners (a bus in WAIT_PARK_CLEAR /
//    PARKING, or in WAIT_DEPART_CLEAR / REVERSING) and they exclude each other.
//    Requests are served first come, first served (b.reqSeq); a bus is passed
//    over only while a later one stands in its way (see trafficControl), so no
//    bus starves and the road can't deadlock. Parked buses hold nothing.
//  • reserved zones: the stretch of each lane that the owner's body will sweep
//    over for the rest of its maneuver (sampled from its real path). No vehicle
//    enters a zone; one already inside (or too close to stop) drives out, and
//    the maneuver starts only once the zones are empty. A lane the path never
//    touches is never stopped, and a zone shrinks as the bus moves along.
//  • the stop line every car and bus drives to: the vehicle ahead on its lane,
//    or the near edge of a reserved zone (laneLimit).
// The owners are derived from the buses' phases, so they survive a save/load
// and each terminal has its own.
const PHASE = {
  APPROACHING: "APPROACHING",
  WAIT_PARK_PERMIT: "WAITING_FOR_PARKING_PERMISSION",
  WAIT_PARK_CLEAR: "WAITING_FOR_PARKING_CLEARANCE",
  PARKING: "PARKING",
  PARKED: "PARKED",
  WAIT_DEPART_PERMIT: "WAITING_FOR_DEPARTURE_PERMISSION",
  WAIT_DEPART_CLEAR: "WAITING_FOR_DEPARTURE_CLEARANCE",
  REVERSING: "REVERSING",
  DEPARTING: "DEPARTING",
};
// The phases each movement state allows (b.state drives the motion and the guests; b.phase the traffic).
const PHASES_OF_STATE = {
  drive: [PHASE.APPROACHING, PHASE.WAIT_PARK_PERMIT, PHASE.WAIT_PARK_CLEAR, PHASE.DEPARTING],
  enter: [PHASE.PARKING],
  stop: [PHASE.PARKED, PHASE.WAIT_DEPART_PERMIT, PHASE.WAIT_DEPART_CLEAR],
  exit: [PHASE.REVERSING],
};
const PARK_REQUEST_DIST = 260; // a bus signals and asks for the parking reservation this far before its turn-in point
const PARK_GATE_DIST = 60;     // the owner closes its turning area to traffic this close to the turn-in point
const LANE_BAND = { 1: [482, 510], "-1": [430, 458] }; // y-extent of each lane's traffic: a turning bus whose body reaches into it occupies that lane
const ZONE_PAD = 10;   // px kept clear around a maneuvering bus's swept path
const BUS_GAP = 24;    // px a bus keeps behind whatever is ahead on its lane
const MOVING = 5;      // px/s — slower than this, a vehicle counts as standing
const CAR_ACC = 140, CAR_BRAKE = 240, CAR_HARD_BRAKE = 600, CAR_HEADWAY = 0.3; // px/s², s
const BUS_HARD_BRAKE = 3 * BUS_BRAKE; // what driveTarget brakes at
const vehGap = o => (o.car ? ROAD_CAR_GAP : BUS_GAP);
const brakeDist = o => o.v * o.v / (2 * (o.car ? CAR_HARD_BRAKE : BUS_HARD_BRAKE));

const isParkOwner = b => b.phase === PHASE.WAIT_PARK_CLEAR || b.phase === PHASE.PARKING;
const isDepartOwner = b => b.phase === PHASE.WAIT_DEPART_CLEAR || b.phase === PHASE.REVERSING;
const isPermitWaiter = b => b.phase === PHASE.WAIT_PARK_PERMIT || b.phase === PHASE.WAIT_DEPART_PERMIT;
function trafficOwners() {
  return { park: buses.find(isParkOwner) || null, depart: buses.find(isDepartOwner) || null };
}

// Every vehicle on the road as { ref, car|bus, dir, l, r, v }: its lane, x-extent and speed (px/s, ≥ 0).
// The ambient cars drive past the terminal on screen; a terminal stepped in the background has none.
function laneVehicles() {
  const out = [];
  if (boundId === G.activeTerminal) for (const c of cars)
    out.push({ ref: c, car: true, dir: c.v > 0 ? 1 : -1, l: c.x, r: c.x + ROAD_CAR_LENGTH, v: c.spd != null ? c.spd : Math.abs(c.v) });
  for (const b of buses) if (b.state === "drive")
    out.push({ ref: b, bus: true, dir: busDir(b), l: b.cx - b.len / 2, r: b.cx + b.len / 2, v: b.v || 0 });
  return out;
}

// The x-extent of the part of a bus body (pose q) that lies inside the y-band [y0, y1], or null.
// A level bus reads side-on and stays in its own lane (its depth is ~24 px); a turned one
// is a 66 px-wide slab — the body is that rectangle, clipped to the band.
function bodyBandSpan(q, len, y0, y1) {
  const c = Math.cos(q.ang), s = Math.sin(q.ang), hl = len / 2, w = 12 + 21 * Math.abs(s);
  let poly = [[hl, w], [hl, -w], [-hl, -w], [-hl, w]].map(([u, v]) => [q.cx + u * c - v * s, q.cy + u * s + v * c]);
  for (const [lim, keep] of [[y0, y => y >= y0], [y1, y => y <= y1]]) { // clip against each band edge
    const out = [];
    poly.forEach((p, i) => {
      const n = poly[(i + 1) % poly.length];
      if (keep(p[1])) out.push(p);
      if (keep(p[1]) !== keep(n[1])) out.push([p[0] + (n[0] - p[0]) * (lim - p[1]) / (n[1] - p[1]), lim]);
    });
    poly = out;
    if (!poly.length) return null;
  }
  return { l: Math.min(...poly.map(p => p[0])), r: Math.max(...poly.map(p => p[0])) };
}
// The lane stretches a bus's body covers while it follows poseAt(s) for s0..s1
// (plus its current pose when withBody), as zones { owner, dir, l, r }.
function sweepZones(b, poseAt, s0, s1, withBody) {
  const span = {};
  const add = q => {
    for (const d of [1, -1]) {
      const hit = bodyBandSpan(q, b.len, ...LANE_BAND[d]);
      if (!hit) continue;
      const z = span[d] || (span[d] = { l: Infinity, r: -Infinity });
      z.l = Math.min(z.l, hit.l); z.r = Math.max(z.r, hit.r);
    }
  };
  if (withBody) add(b);
  const n = Math.max(1, Math.ceil((s1 - s0) / 6));
  for (let i = 0; i <= n; i++) add(poseAt(s0 + (s1 - s0) * i / n));
  return Object.keys(span).map(d => ({ owner: b, dir: +d, l: span[d].l - ZONE_PAD, r: span[d].r + ZONE_PAD }));
}

// The road b's maneuver needs from here on. A bus that only waits for permission
// reserves nothing; `prospective` asks what it WOULD need (for clearance and grant checks).
function maneuverZones(b, prospective = false) {
  if (b.state === "enter") { const g = enterGeom(b, b.slot); return sweepZones(b, s => enterPose(g, s), b.mv.s, g.L, true); }
  if (b.state === "exit") { const g = exitGeom(b); return sweepZones(b, s => exitPose(g, s), b.mv.s || 0, g.L, true); }
  if (b.state === "stop" && (prospective || b.phase === PHASE.WAIT_DEPART_CLEAR)) {
    const g = exitGeom(b, b.cx, b.cy); // the whole back-out, down to the bus standing on its lane
    return sweepZones(b, s => exitPose(g, s), 0, g.L, false);
  }
  if (b.state === "drive" && (prospective || b.phase === PHASE.WAIT_PARK_CLEAR)) {
    const si = targetSlot(b);
    if (si == null || si < 0) return [];
    const g = enterGeom(b, si);
    // the owner closes its turning area only once it is about to reach the turn-in point:
    // oncoming traffic keeps flowing while it is still on its way
    if (!prospective && busDir(b) * (g.x0 - b.cx) > PARK_GATE_DIST) return [];
    return sweepZones(b, s => enterPose(g, s), 0, g.L, !prospective);
  }
  return [];
}
// Who was already too close to stop when each owner's zone on a lane closed:
// owner bus → { [dir]: Set of vehicle refs }. Decided once, at the moment the
// zone appears — from then on every other vehicle stops short of it, however
// late it brakes. (Runtime only: after a load the owners queue up afresh.)
const zoneCommits = new WeakMap();
const cannotStopShort = (o, z) => {
  const d = o.dir > 0 ? z.l - o.r : o.l - z.r;
  return d >= 0 && o.v >= MOVING && d - vehGap(o) < brakeDist(o);
};
// The zones the maneuver owners hold right now (each carrying its committed set).
function reservedZones() {
  const zones = [];
  let vehicles = null;
  for (const b of buses) {
    if (!isParkOwner(b) && !isDepartOwner(b)) continue;
    let commits = zoneCommits.get(b);
    if (!commits) zoneCommits.set(b, commits = {});
    for (const z of maneuverZones(b)) {
      if (!commits[z.dir]) { // this lane closes now
        vehicles = vehicles || laneVehicles();
        commits[z.dir] = new Set(vehicles.filter(o => o.dir === z.dir && o.ref !== b && cannotStopShort(o, z)).map(o => o.ref));
      }
      z.committed = commits[z.dir];
      zones.push(z);
    }
  }
  return zones;
}

// How vehicle o relates to zone z: "inside" it, "committed" (on its way in and too
// close to stop short — it drives on through), "ahead" (it must stop short of it), or null.
// A zone that is only being planned (no committed set yet) judges by stopping distance.
function zoneRelation(o, z) {
  if (o.dir !== z.dir || o.ref === z.owner) return null;
  if (o.r > z.l && o.l < z.r) return "inside";
  const d = o.dir > 0 ? z.l - o.r : o.l - z.r;
  if (d < 0) return null; // already past it
  if (!z.committed) return cannotStopShort(o, z) ? "committed" : "ahead";
  if (z.committed.has(o.ref)) {
    if (o.v >= MOVING) return "committed";
    z.committed.delete(o.ref); // it stopped short after all: now it waits like everyone else
  }
  return "ahead";
}

// How far vehicle `me` may still move along its lane: up to the vehicle ahead
// (minus the gap) or the near edge of a reserved zone it has not entered.
// leadV: the speed of what limits it; blocker: that vehicle or zone.
function laneLimit(me, vehicles, zones) {
  const dir = me.dir, front = dir > 0 ? me.r : me.l, mid = (me.l + me.r) / 2, gap = vehGap(me);
  let room = Infinity, leadV = 0, blocker = null;
  for (const o of vehicles) {
    if (o === me || o.dir !== dir || dir * ((o.l + o.r) / 2 - mid) <= 0) continue; // other lane, or behind
    const d = dir * ((dir > 0 ? o.l : o.r) - front) - gap;
    if (d < room) { room = d; leadV = o.v; blocker = o; }
  }
  for (const z of zones) {
    if (zoneRelation(me, z) !== "ahead") continue;
    const d = dir * ((dir > 0 ? z.l : z.r) - front) - gap;
    if (d < room) { room = d; leadV = 0; blocker = z; }
  }
  return { room, leadV, blocker };
}
// How far bus b (on the road) may still drive before closing on what is ahead of it.
function laneRoom(b) {
  const vehicles = laneVehicles(), me = vehicles.find(o => o.ref === b);
  return me ? laneLimit(me, vehicles, reservedZones()).room : Infinity;
}

// The vehicles keeping b from starting its maneuver: inside the road it needs, or too close to stop short of it.
function maneuverBlockers(b, vehicles = laneVehicles()) {
  const held = reservedZones().filter(z => z.owner === b);
  const zones = held.length ? held : maneuverZones(b, true);
  return vehicles.filter(o => o.ref !== b && zones.some(z => {
    const rel = zoneRelation(o, z);
    return rel === "inside" || rel === "committed";
  }));
}
const maneuverClear = b => maneuverBlockers(b).length === 0;

// The permission-waiting bus at the head of the standing queue that vehicle o is part of (or null).
function queueHeadWaiter(o, vehicles, zones, seen = new Set()) {
  if (o.bus && o.ref.phase === PHASE.WAIT_PARK_PERMIT) return o.ref;
  if (o.v >= MOVING || seen.has(o)) return null;
  seen.add(o);
  const lim = laneLimit(o, vehicles, zones);
  return lim.blocker && !lim.blocker.owner && lim.room < 12 ? queueHeadWaiter(lim.blocker, vehicles, zones, seen) : null;
}
// A bus waiting for permission whose queue stands in the road b needs: b can't
// get clear before that bus has gone, so that bus goes first (no deadlock).
function blockingWaiter(b, vehicles, zones) {
  for (const o of maneuverBlockers(b, vehicles)) {
    const w = queueHeadWaiter(o, vehicles, zones);
    if (w && w !== b) return w;
  }
  return null;
}

// A bus asks for the parking or departure reservation (keeping its place in line if it already has one).
function requestManeuver(b, phase) {
  b.phase = phase;
  if (b.reqSeq == null) b.reqSeq = S.trafficSeq = (S.trafficSeq || 0) + 1;
  trafficControl(); // granted at once if the terminal is free
}
function grantManeuver(b) {
  if (b.phase === PHASE.WAIT_DEPART_PERMIT) { b.phase = PHASE.WAIT_DEPART_CLEAR; return true; }
  const si = targetSlot(b);
  if (si < 0) return false; // no free bay ahead any more — its approach drops the request
  b.parkSlot = si; // the bay is reserved for it from now on
  b.phase = PHASE.WAIT_PARK_CLEAR;
  return true;
}
// Test hook: when an array, every grant and hand-back is recorded with its reason.
let trafficTrace = null;
// Once per terminal step: hand the maneuver reservation to the next eligible bus.
function trafficControl() {
  const vehicles = laneVehicles();
  let zones = reservedZones();
  let { park, depart } = trafficOwners();
  for (const b of buses) if (b !== park && b !== depart) zoneCommits.delete(b); // no longer an owner
  // An owner still waiting for clearance whose road is filled by a queue standing
  // behind a bus that waits for permission hands the reservation back (keeping
  // its place in line), so that bus goes first and the queue can drain.
  for (const o of [park, depart]) {
    if (!o || (o.phase !== PHASE.WAIT_PARK_CLEAR && o.phase !== PHASE.WAIT_DEPART_CLEAR)) continue;
    const w = blockingWaiter(o, vehicles, zones);
    if (!w || blockingWaiter(w, vehicles, zones)) continue; // a true standoff: keep it, traffic will move
    o.phase = o.phase === PHASE.WAIT_PARK_CLEAR ? PHASE.WAIT_PARK_PERMIT : PHASE.WAIT_DEPART_PERMIT;
    if (trafficTrace) trafficTrace.push({ handback: o.id, to: w.id });
    o.parkSlot = null;
    zoneCommits.delete(o);
    if (o === park) park = null; else depart = null;
    zones = reservedZones();
  }
  if (park || depart) return; // one maneuver at a time — parking and departure exclude each other
  const waiting = buses.filter(isPermitWaiter).sort((a, b) => a.reqSeq - b.reqSeq);
  // first come, first served — skipping a bus whose road is held up behind a later one
  const blockedBy = new Map(waiting.map(b => [b, blockingWaiter(b, vehicles, zones)]));
  const order = [...waiting.filter(b => !blockedBy.get(b)), ...waiting];
  const tried = new Set();
  for (const b of order) {
    if (tried.has(b)) continue;
    tried.add(b);
    if (!grantManeuver(b)) continue;
    if (trafficTrace) trafficTrace.push({ granted: b.id, skipped: waiting.filter(w => w.reqSeq < b.reqSeq).map(w => ({
      id: w.id, why: blockedBy.get(w) ? "blocked by " + blockedBy.get(w).id : tried.has(w) ? "no free bay" : null,
    })) });
    return;
  }
}

// The terminal approach of a visiting bus on the road, given the step it is
// about to drive: signal and ask for the parking reservation, wait short of the
// turn-in point until it holds it and the turning area is clear, then turn in.
// Returns the step it may drive, or null once it has turned in.
function parkingApproach(b, step) {
  const sg = busDir(b);
  const si = targetSlot(b, step + 2, b.cx + step * sg);
  if (si < 0) { // no free bay ahead: it drives on through
    if (b.phase === PHASE.WAIT_PARK_PERMIT) { b.phase = PHASE.APPROACHING; b.reqSeq = null; }
    return step;
  }
  const dist = sg * (enterGeom(b, si).x0 - b.cx);
  if (b.phase === PHASE.APPROACHING && dist <= PARK_REQUEST_DIST) requestManeuver(b, PHASE.WAIT_PARK_PERMIT);
  if (step < dist) return step; // not at the turn-in point yet
  if (b.phase === PHASE.WAIT_PARK_CLEAR && b.parkSlot === si && maneuverClear(b)) {
    b.cx += step * sg;
    beginEnter(b, si); // snaps onto the start of the turn
    return null;
  }
  // the waiting position: just short of the turn-in point, outside the turning area
  b.v = 0; b.brake = true;
  return Math.max(0, dist - 1);
}

// The traffic phase a loaded bus is in. An owner still waiting for clearance
// goes back in line (keeping its turn): the controller re-grants on the next step.
function syncPhase(b) {
  if (b.through) { b.phase = null; return; }
  const allowed = PHASES_OF_STATE[b.state] || [];
  if (!allowed.includes(b.phase))
    b.phase = b.state === "drive" ? (b.stoppedOnce ? PHASE.DEPARTING : PHASE.APPROACHING) : allowed[0];
  if (b.phase === PHASE.WAIT_PARK_CLEAR) b.phase = PHASE.WAIT_PARK_PERMIT;
  if (b.phase === PHASE.WAIT_DEPART_CLEAR) b.phase = PHASE.WAIT_DEPART_PERMIT;
  if (isPermitWaiter(b) && b.reqSeq == null) b.reqSeq = S.trafficSeq = (S.trafficSeq || 0) + 1;
  b.parkSlot = null;
}

// The cleanest built stall, occupied or not — the bar that makes a guest
// give up on the WC entirely (every single stall below it).
const bestStallClean = () => Math.max(...activeStalls().map(i => S.stallClean[i]));
const hasFreeStall = () => activeStalls().some(i => !facilities.T.spots[i]);

// The cleanest stall that is actually FREE right now, -1 when the row is
// fully occupied. Guests hold their LINE to this: an occupied clean stall
// they cannot reach is no excuse to step into muck, so the line just
// stands until a clean stall frees up (or the hose fixes a filthy one).
function bestFreeStallClean() {
  let best = -1;
  for (const i of activeStalls())
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
      if (onScreen() && performance.now() - lastDirtyToast > 2500) {
        lastDirtyToast = performance.now();
        toast("😖 Tuvalet pis, misafir gitti", "bad");
      }
      wander(p);
      return;
    }
    p.want = "T"; headToFacility("T", p, bus); return;
  }
  if (LOKANTA_OPEN && !p.refuseR && p.hunger > 68)  { headToFacility("R", p, bus); return; }
  if (LOKANTA_OPEN && !p.refuseR && p.thirst > 68)  { headToFacility("R", p, bus); return; }
  wander(p);
}

function tryJoin(fac, p, bus) {
  if (fac === "R" && !LOKANTA_OPEN) { p.refuseR = true; wander(p); return; }
  const f = facilities[fac];
  if (f.spots.some(s => s && s.pax === p)) return;
  if (f.queue.includes(p)) return;
  if (fac === "T" && !G.flags.wcDirtied) {
    // the first-ever WC guest reaches the door: the left toilet is left at 80% for
    // the brush tutorial, and this guest walks the player through the counter
    // afterwards (a short stay, a ₺50 bill)
    S.stallClean[brushTutStall()] = 80;
    S.cleanliness = avgClean();
    G.flags.wcDirtied = true;
    p.tutGuest = true;
    save();
  }
  if (p.tutGuest && fac === "T" && S.view !== "wc") { wander(p); return; } // the tutorial guest only joins the line once the player is inside the WC
  f.queue.push(p);
  p.state = fac === "R" ? "waitR" : "waitT";
  const stalls = fac === "R" ? DINER_SEATS : stallCount();
  const svc = fac === "R" ? SVC_TIME_R : SVC_TIME_T;
  p.patience = (f.queue.length) * (svc / stalls) + 8;
  p.waitReal = 0;
}

function headToFacility(fac, p, bus) {
  if (fac === "R" && !LOKANTA_OPEN) { p.refuseR = true; wander(p); return; }
  const entrance = fac === "T" ? { x: 851 + BUILD_DX, y: 184 - BUILD_LIFT } : { x: 690 + BUILD_DX, y: 184 - BUILD_LIFT };
  p.want = fac;
  p.state = "walk";
  p.tx = entrance.x; p.ty = entrance.y;
  p.idleT = 0;
  if (Math.hypot(p.tx - p.x, p.ty - p.y) < 8) tryJoin(fac, p, bus);
}

function wander(p) {
  p.state = "walk";
  p.want = null;
  p.idleT = 0;
  p.walkT = 0;
  // pick a random spot that is not inside a parked bus (an unreachable goal
  // leaves the guest standing forever)
  const obstacles = outdoorBusObstacles();
  for (let n = 0; n < 12; n++) {
    const x = rand(560 + BUILD_DX, 940 + BUILD_DX), y = rand(WALK_TOP + 6, 330);
    const inBus = obstacles.some(o => {
      const l = busLocalPoint({ x, y }, o);
      return Math.abs(l.x) < o.hl && Math.abs(l.y) < o.hw;
    });
    if (!inBus) { p.tx = x; p.ty = y; return; }
  }
  // nowhere clear right now: stand for a moment and try again
  p.state = "free"; p.idleT = rand(1, 3); p.tx = p.x; p.ty = p.y;
}

function goDoor(p, bus) {
  p.state = "board";
  p.want = null;
  const d = doorPos(bus);
  p.tx = d.x; p.ty = d.y;
}

/* --------------------------- Facilities ----------------------------- */
function updateFacilities(dt, timeDt = dt) {
  if (LOKANTA_OPEN) stepFac("R", timeDt, DINER_SEATS, SVC_TIME_R);
  stepFac("T", timeDt, WC_STALLS, SVC_TIME_T);
  // toilets do NOT recover on their own — grime only leaves via the hose (or a
  // caught runaway's scrub); S.cleanliness stays the derived average
  // (outdoor HUD, legacy code paths)
  S.cleanliness = avgClean();
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
    if (name === "T" && hasFreeStall() && bestFreeStallClean() < WC_TOO_DIRTY)
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
    // the left toilet is held back for the first-ever WC guest (who is the one it was cleaned for)
    const tutNext = !!f.queue[0] && !!f.queue[0].tutGuest;
    for (let i = 0; i < stalls; i++)
      if (!f.spots[i] && (name !== "T" || stallActive(i) && (tutNext || !(brushTutPending() && i === brushTutStall())))) free.push(i);
    if (!free.length) break;
    // No guest steps into a toilet that filthy: if every OPEN stall is below
    // the bar, the whole line stands (and loses patience) until the hose
    // brings one back above it or a clean in-use stall frees up.
    if (name === "T" && bestFreeStallClean() < WC_TOO_DIRTY) break;
    // A visit needs at least the minimum stay (1 game minute) before the bus leaves;
    // otherwise the guest waits for the bus rather than being cut off after seconds.
    if (name === "T") {
      const hb = findBusOf(f.queue[0]);
      if (hb && hb.state === "stop" && (hb.stopEnd - G.clock.time) * 60 < 1) break;
    }
    const p = f.queue.shift();
    let slot;
    if (name === "T") {
      // Guests sniff the row and head for the least grimy free door.
      slot = free[0];
      for (const i of free) if (S.stallClean[i] > S.stallClean[slot]) slot = i;
      if (p.tutGuest && free.includes(brushTutStall())) slot = brushTutStall(); // the toilet the player just cleaned
    } else slot = free[0];
    p.state = name === "R" ? "serveR" : "serveT";
    p.stall = slot; // the stall this visit uses — pinned until the guest leaves
    if (name === "T") {
      // Walk in up the side passage nearest the stall, then over to the bay.
      const gx = sideGapX(stallCx(slot) > W / 2);
      p.x = gx; p.y = sideOutY();
      p.enterT = { x: gx, y: SIDE_IN_Y };
      p.inStall = false; // door stays ajar until they actually reach the bay
      p.useSat = null;   // a fresh visit clears any stale rating from a previous (evaded) one
    }
    // A toilet visit runs 1–10 in-game minutes; a diner seat keeps the short
    // fixed service time.
    f.spots[slot] = { pax: p, t: name === "T" ? (p.tutGuest ? TUT_TOILET_STAY : rand(TOILET_STAY[0], TOILET_STAY[1])) : svcTime };
  }
  // running services — a finished visit frees its own slot (no reflow)
  for (let i = 0; i < stalls; i++) {
    const s = f.spots[i];
    if (!s) continue;
    if (s.pax && s.pax.tutGuest && !s.pax.inStall) continue; // the tutorial guest's 2.5 s start once they are inside the toilet
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
    if (!LOKANTA_OPEN) { p.refuseR = true; wander(p); return; }
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
  p.useSat = clamp(SAT_BASE + (sc - 50) * 0.5 + toiletDef().satBonus, 0, 100);
  p.wcUsed = true; // a toilet rating — finishVisit weighs it 2× in reputation
  if (si >= 0 && sc > 15) S.stallClean[si] = Math.max(0, sc - rand(...toiletDef().dirtUse));
  autoCleanAfterVisit(si);
  p.waitTotal = p.waitReal; // their queue time, folded into the final rating
  p.waitReal = 0;
  p.sat = null;
  const bus = findBusOf(p);
  if (bus && bus.state === "stop") {
    // the one roll per visit: a few guests try to run off without paying
    if (!p.tutGuest && Math.random() < WC_EVADE) fleeCounter(p); // the tutorial guest always pays
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
// line, dashes for the exit (EVADE_WALK, in real time — see updatePax).
// The visit is settled here (satisfaction + reputation, like any other
// departure — the theft knocks a little off the rating). `runaway` makes them
// clickable (catchRunaway) until they cross the exit, where it is cleared.
// (Guests who abandon a payment line never come here — see stormOut.)
function fleeCounter(p) {
  p.unpaid = true;
  p.runaway = true;
  if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
  const now = performance.now();
  if (onScreen() && now - lastEvadeToast > 2000) {
    lastEvadeToast = now;
    toast("🏃 Misafir ödemeden kaçıyor!", "bad");
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
// The ten stalls stand across the top of the room in two blocks of five with
// an aisle between. Their art is drawn in "stall space" (bay i at stallLx(i),
// opening y 108–246, row box 0..STALL_ROW_W × 84..246) and mapped to the screen
// by stallOx/stallKx and STALL_K/stallOy.
// The row sits at the far wall, so it is drawn at half scale (perspective):
// half the visible width, centered, and half the old 1.36 vertical scale.
const STALL_K = 0.78, STALL_MARGIN = 6;
const STALL_AISLE = 80, STALL_ROW_W = 644 + STALL_AISLE;
const stallOy = () => -offY - 84 * STALL_K; // row top flush with the top of the view
const stallKx = () => Math.min((W - 2 * STALL_MARGIN) / 644 / 2, (Wdyn - 2 * STALL_MARGIN) / 644 / 2);
const stallOx = () => -offX + (Wdyn - STALL_ROW_W * stallKx()) / 2;
const stallLx = i => 8 + i * 64 + (i >= WC_STALLS / 2 ? STALL_AISLE : 0);
const stallSx = lx => stallOx() + stallKx() * lx;
const stallSy = ly => stallOy() + STALL_K * ly;
function stallSpace() { ctx.save(); ctx.translate(stallOx(), stallOy()); ctx.scale(stallKx(), STALL_K); }
// Each bay's art is authored 52 wide but stretched about its center to 60.
const STALL_WX = 60 / 52;
const stallEdge = (i, u) => stallLx(i) + 26 + (u - 26) * STALL_WX; // art x (0..52) → stall-space x
function stallWiden(i) { const c = stallLx(i) + 26; ctx.save(); ctx.translate(c, 0); ctx.scale(STALL_WX, 1); ctx.translate(-c, 0); }
const stallBay = i => ({ x: stallSx(stallEdge(i, 0)), y: stallSy(108), w: 60 * stallKx(), h: 138 * STALL_K });
const stallCx = i => stallSx(stallLx(i) + 26);

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

// One application of the cleaning tool in hand (hand brush, mop or hose):
// every built stall its reach touches takes a tick of cleaning, throttled by
// a short per-stall cooldown in REAL time (like the car-wash tools — cleaning
// works the same at any speed tier). A stall whose door is closed (someone
// inside) can't be cleaned.
function cleanApply(x, y) {
  if (S.view !== "wc" || !toolInHand) return;
  const tool = cleaningTool();
  const R = tool.reach;
  const now = performance.now();
  let touched = false;
  for (let i = 0; i < WC_STALLS; i++) {
    if (!stallActive(i)) continue;
    const r = stallBay(i);
    if (x + R < r.x || x - R > r.x + r.w || y + R < r.y || y - R > r.y + r.h) continue;
    if (stallDoorClosed(i)) continue; // door shut (occupant in) — the spray bounces
    if (hoseCd[i] > now) continue;
    hoseCd[i] = now + 150;
    touched = true;
    const before = S.stallClean[i];
    S.stallClean[i] = Math.min(100, before + tool.perSec * 0.15);
    if (before < 100 && S.stallClean[i] >= 100) {
      hoseGleam[i] = now; // sparkle burst on hitting 100
      if (now - lastHoseToast > 1500) { lastHoseToast = now; toast(`${tool === CONFIG.cleaningTools.hose ? "🚿" : "🧽"} Kabin pırıl pırıl!`, "good"); }
    }
  }
  if (touched) S.cleanliness = avgClean();
  if (brushTutCleaning() && S.stallClean[brushTutStall()] >= 100) {
    toolInHand = null; // as if the player put the brush down: wcZoom eases back out
    G.flags.brushTutDone = true;
    // the strolling tutorial guest now heads for the clean toilet
    for (const b of buses) for (const p of b.pax)
      if (p.tutGuest && (p.state === "walk" || p.state === "free")) headToFacility("T", p, b);
    save();
  }
}

// --- Brush tutorial (first WC visit): tap cue on the bucket, then clean the left toilet to 100% ---
let wcEnteredAt = 0; // performance.now() when the player last stepped into the WC
const BRUSH_CUE_DELAY = 2000; // real ms after stepping into the WC before the brush hand shows and the clock stops
const brushTutStall = () => Math.min(...activeStalls());          // the toilet on the left
const brushTutPending = () => G.flags.wcDirtied && !G.flags.brushTutDone;
// zoomed in with the brush: the player stays here until the left toilet is spotless
const brushTutCleaning = () => brushTutPending() && S.view === "wc" && !!toolInHand;
// the clock holds from the moment the brush hand appears (2 real s after stepping in) until the toilet is clean
const brushTutHold = () => brushTutPending() && S.view === "wc" && (!!toolInHand || performance.now() - wcEnteredAt >= BRUSH_CUE_DELAY);
// Change tutorial: the first WC guest stands at the counter with ₺50 — the
// player hands back ₺10, then ₺20. Returns the bill to tap next (or null).
function changeTutNext() {
  if (G.flags.changeTutDone || S.view !== "wc" || brushTutPending()) return null;
  const f = facilities.C.queue[0];
  if (!f || !f.tutGuest || f.state !== "payC" || !atPaySpot(f)) return null;
  return f.changeGiven === 0 ? 10 : f.changeGiven === 10 ? 20 : null;
}
const wcTutHold = () => brushTutHold() || changeTutNext() != null;
// Stepping into the WC while the brush tutorial waits: the first guest, still
// strolling on the street, joins the line now — so they walk up the side passage
// in view until the brush hand appears (the clock holds from then on).
function tutGuestEnterWc() {
  if (!brushTutPending()) return;
  for (const b of buses) for (const p of b.pax)
    if (p.tutGuest && (p.state === "walk" || p.state === "free")) tryJoin("T", p, b);
}

/* ---------------------- Player actions (counter) -------------------- */
// Step between the layover, the WC counter room, and the car wash.
function setView(v) {
  if (v === "wc" && !G.flags.firstBusParked) {
    if (!G.flags.wcLockedToastSeen) {
      G.flags.wcLockedToastSeen = true;
      toast("WC açılması için ilk otobüsün gelmesi gerekiyor", "");
      save();
    }
    return;
  }
  if (v === S.view) return;
  if (scrub && S.view === "wc") return; // stay and watch the caught runaway finish scrubbing (5 s)
  if (brushTutCleaning() || changeTutNext() != null) return; // finish the WC tutorial step first
  const from = S.view;
  S.view = v;
  if (from !== "wc" && v === "wc") { markWcVisited(); wcEnteredAt = performance.now(); tutGuestEnterWc(); }
  viewFade = 1;
  if (from === "wash") S.washBus = null; // we step back out; the bus keeps its washed state
  if (v !== "wc") { toolInHand = null; wcZoom = 0; } // leaving the counter room — the hose goes back on its faucet, the camera resets
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

// The combo brush's bubbles: once their delay has passed, the attached hose rinses
// each cell automatically (the same rinse the separate hose does).
function rinseSuds(b, w) {
  if (!w.pend || w.done) return;
  const now = performance.now(), wd = washDef();
  let any = false;
  for (let i = 0; i < w.pend.length; i++) {
    if (!w.pend[i] || w.pend[i] > now) continue;
    w.pend[i] = 0;
    any = true;
    const foam = w.f[i];
    w.f[i] *= 0.15;
    w.g[i] = Math.max(0, w.g[i] - (wd.rinse[0] + wd.rinse[1] * foam));
  }
  if (any && w.g.every(v => v < 0.1)) finishWash(b);
}

// Step up to the front of a parked bus and open the car wash view.
function openWash(b) {
  if (!carWashOpen()) return;
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
  ({ x, y } = washToBus(x, y));
  // 600 cells of 8.4px would never all be reached one-cell-per-stroke — the
  // tool works every cell a 36px pad / spray fan around the pointer crosses
  const wd = washDef();
  const R = wd.reach / WASH.zoom.s;
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
      w.cd[i] = now + wd.cd;
      if (w.tool === "brush") {
        w.f[i] = Math.min(1, w.f[i] + wd.soap); // suds up
        if (wd.combo) { // the built-in hose rinses these bubbles off a moment later
          if (!w.pend) w.pend = new Array(w.g.length).fill(0);
          w.pend[i] = Math.max(w.pend[i], now + 900);
        }
      } else {
        const foam = w.f[i];                  // rinse: the suds do the real work
        w.f[i] *= 0.15;
        w.g[i] = Math.max(0, w.g[i] - (wd.rinse[0] + wd.rinse[1] * foam));
      }
    }
  }
  if (w.g.every(v => v < 0.1)) finishWash(b);
}

// The windshield is spotless: the bus line pays the wash fee — once per bus
// (w.done guards it) — and the driver remembers how good the job was.
function finishWash(b, persist = true) {
  const w = ensureWash(b);
  if (w.done) return;
  const wd = washDef();
  w.done = true;
  w.f = w.f.map(() => 0); // spotless — no residual suds where the final rinse didn't reach
  b.washDone = true;
  b.washSat = wd.sat;
  S.stats.washes++;
  S.rep = clamp(S.rep + wd.rep, 0, 100);
  applyTransaction("carWashFee", wd.fee, boundId, wd.name);
  if (persist) { toast("✨ Ön cam pırıl pırıl!", "good"); save(); } // the gantry works quietly; the regular autosave keeps it
}

/* ------------------- Runaways & the caught-guest scrub --------------- */
// A runaway (fleeCounter) can be clicked while they are still inside the WC,
// running for the exit. Caught, they stop dead and scrub every toilet for
// SCRUB_TIME real seconds — a dash along both stall rows, a quick scrub at
// each bowl — and when the sequence ends every stall is reset to spotless,
// exactly once. Then they walk out like any other guest.
function catchRunaway(p) {
  if (scrub || !p || !p.runaway || p.state !== "leaveC") return false; // one sequence at a time; only a live runaway
  p.runaway = false; // caught once — never catchable again this visit
  p.state = "scrubC";
  if (S.stats) S.stats.caught = (S.stats.caught || 0) + 1;
  toast("🧽 Yakalandın! Tuvalet senin!", "good");
  startScrub(p);
  return true;
}

// The scrub route: from where they were caught, stall 0 → 9 along the front
// of both rows. 40% of the time is spent running between bowls (split by
// distance), the rest scrubbing — an equal dwell at every stall.
function startScrub(p) {
  const bays = activeStalls();
  const pts = bays.map(i => ({ x: stallCx(i), y: stallSy(230) }));
  let prev = { x: p.x, y: p.y }, total = 0;
  const dist = pts.map(q => { const d = Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; total += d; return d; });
  const travel = SCRUB_TIME * 0.4, dwell = SCRUB_TIME * 0.6 / bays.length;
  let t = 0;
  prev = { x: p.x, y: p.y };
  const legs = pts.map((q, i) => {
    const leg = { a: prev, b: q, stall: bays[i], t0: t, t1: t + travel * dist[i] / (total || 1) };
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
  for (let i = 0; i < WC_STALLS; i++) {
    S.stallClean[i] = 100;
    hoseGleam[i] = stallActive(i) ? now : 0; // only the stalls this restroom actually has get the sparkle
  }
  S.cleanliness = 100;
  scrubDoneAt = now;
  toast("✨ Tuvaletler pırıl pırıl!", "good");
  // their work is done — they walk out (no longer a runaway, no rush)
  p.state = "leaveC";
  save();
}

// The car wash view: a close-up of the parked bus's front. The windshield is
// the 30×20 cell grid from WASH.wind (600 cells, dirt + soap each), flanked by the two
// tool stations; the active tool follows the pointer, and holding the mouse
// scrub/sprays (see washApply). Everything is in-canvas, like the other views.
// preview: draw the wash view for a given bus instead of the one being washed
function drawWashView(preview = null) {
  const b = preview || bus();
  if (!b) { setView("out"); return; }
  const w = ensureWash(b);
  if (!preview) rinseSuds(b, w); // a combo brush's bubbles rinse off on their own
  const nf = nightFactor();
  const now = performance.now();
  const pulse = 0.55 + 0.45 * Math.sin(now / 200);
  const { body: B, wind: Wd, brush: Br, hose: Hs } = WASH;
  const hz = B.y + 40;               // horizon: where the wash pad meets the sky
  const floorB = H + offY;           // bottom of the visible canvas
  const hue = b.hue;
  const hsl = (s, l, a = 1) => `hsla(${hue}, ${s}%, ${Math.max(4, l)}%, ${a})`;
  const hsh = n => frac(Math.sin(n * 127.1 + 11.3) * 43758.5453); // stable per-index noise

  // --- sky (the same palette as the layover — the view change feels like a dolly)
  const [top, bot] = skyColors(G.clock.time);
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
  const dgx = B.x + B.w / 2, dgy = WASH.zoom.y1 + 18;
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
  ctx.save();
  washZoomXf();
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
  ctx.restore();
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
  if (!washDef().combo) { // the separate soap bucket + brush (the combo tier has only the hose brush)
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
  }
  // combo: the hose brush rests on the right, its hose running from the faucet, until it is picked up
  if (washDef().combo && w.tool !== "brush") {
    const pkx = Hs.x + 132, pky = Hs.y + Hs.h - 22;
    drawHoseLine(Hs.x + 118, Hs.y + Hs.h - 14 - 62 + 20, pkx, pky);
    ctx.save();
    ctx.translate(pkx, pky);
    ctx.rotate(-0.55);
    drawBrush(-88, 88, -98, 5);
    ctx.restore();
  }

  // a tap on a standpipe out of the pad, the hose coiled on the floor beside it
  if (!washDef().combo) station(Hs, "💧 HORTUM — durula", w.tool === "hose"); // combo: the hose is part of the brush
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

  // --- the active tool, following the pointer (nothing when none is in hand; a preview never shows one)
  const px = pointer.x, py = pointer.y;
  const toolK = washDef().reach / CONFIG.carWashTiers[0].reach; // bigger equipment, bigger tool
  if (preview) { /* static picture: no tool follows the mouse */ }
  else if (w.tool === "brush") {
    if (washDef().combo) drawHoseLine(fcx, fcy + 20, px, py); // the brush's own hose
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.6);
    ctx.scale(toolK, toolK);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    rr(ctx, -24, -14, 54, 18, 9); ctx.fill();      // soft contact shadow on the glass
    drawBrush(-8, 96, -22, 6);
    ctx.restore();
  } else if (w.tool === "hose") {
    // the hose drapes from the faucet to the nozzle at the pointer
    drawHoseLine(fcx, fcy + 20, px, py);
    if (pointerDown && !w.done) {
      ctx.save(); ctx.translate(px, py); ctx.scale(toolK, toolK); ctx.translate(-px, -py);
      drawHoseSpray(px, py, now);
      ctx.restore();
    }
    drawHoseNozzle(px, py);
  }

  // --- status: how much grime and suds remain, and which step is up
  const n = w.g.length;
  const gAvg = w.g.reduce((a, v) => a + v, 0) / n;
  const fAvg = w.f.reduce((a, v) => a + v, 0) / n;
  const P = { x: -offX + 18, y: -offY + 18, w: 220, h: 100 }; // pinned to the visible top-left corner
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
      : washDef().combo ? "Köpük kendiliğinden durulanıyor"
      : "2 · köpüğü durula (hortum)",
    P.x + 16, P.y + 66, P.w - 32);
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 211, 107, 0.9)";
  ctx.fillText(`${washDef().name} · ücret ${fmtTL(washDef().fee)}`, P.x + 16, P.y + 88, P.w - 32);

  // sparkles over a finished windshield
  if (w.done) {
    ctx.save();
    washZoomXf();
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
    ctx.restore();
  }
}

// A guest leaves the stall and joins the payment line.
function enterCounter(p) {
  // Belt & braces: a guest joins a payment line once per visit — if one is
  // somehow already in a line, the second join would strand a stale entry
  // (finalizePayment releases from the first queue only, then breaks).
  if (facilities.C.queue.includes(p) || facilities.C.queue2.includes(p)) return;
  p.bill = p.tutGuest ? 50 : pick(BILL_POOL); // the tutorial guest pays ₺50: ₺30 change = 10 + 20
  p.owed = p.bill - CONFIG.economy.toiletFee;
  p.changeGiven = 0;
  p.changeNotes = [];
  p.receivedChangeNotes = [];
  p.cologne = false;
  p.colognePrev = null;
  p.payT = 0; p.doneT = 0; p.dripT = 0;
  p.feePaid = false; // this visit's fee is booked once, in finalizePayment
  // An exact 20₺ bill needs no change or player input. Eligible guests may
  // choose to splash themselves with cologne after they finish paying.
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

// Someone leaves the counter line (paid or not): everyone still behind them gets
// +5 patience, since the line just moved forward.
function leaveCounterLine(q, i) {
  q.splice(i, 1);
  for (let j = i; j < q.length; j++) q[j].patience += 5;
}

// One payment line at the counter. `auto` is the separate exact-₺20 line:
// it needs no player at all: there is no change to hand back, eligible guests may
// use cologne themselves, and the front guest settles at their own spot. updatePax
// counts payT there and finalizes. Every other rule is shared: the line
// loses 1/s of patience (0.5/s once settled at the counter), so a front guest who
// waits too long for their change leaves without paying (stormOut: not a runaway).
function stepCQueue(f, q, auto, timeDt) {
  const qState = auto ? "queueC2" : "queueC";
  const pState = auto ? "payC2" : "payC";
  for (let i = q.length - 1; i >= 0; i--) {
    const p = q[i];
    if (p.state !== qState && p.state !== pState) continue; // stale entry (an old save)
    if (p.state === qState) p.waitTotal += timeDt;
    if (!p.tutGuest) p.patience -= (p.state === qState ? 1 : 0.5) * timeDt; // the front guest settling at the counter is on the clock too (the tutorial guest waits for you)
    if (p.patience <= 0) { leaveCounterLine(q, i); stormOut(p); continue; }
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
        : G.clock.time + rand(5 / 60, 10 / 60);
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
      leaveCounterLine(q, i);
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
    autoCounter(front, timeDt);
    if (front.state === "dripC") {
      front.dripT -= timeDt;
      if (front.dripT <= 0) { front.state = front.colognePrev || "payC"; front.colognePrev = null; }
    }
    // Backstop only: live guests finalize once the last change note reaches them.
    if (front.state === "doneC") finalizePayment(front);
    if (front.state === "payC" && front.owed > 0 && front.changeGiven >= front.owed) {
      const flightEnd = changePaymentFlights.get(front);
      if (flightEnd == null || performance.now() >= flightEnd) {
        changePaymentFlights.delete(front);
        finalizePayment(front);
      }
    }
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
  if (p.cologne) sat += wcDef("cologne").sat;
  return clamp(sat + rand(-8, 8), 0, 100);
}

function finalizePayment(p) {
  const pendingFlight = receiptFlightEnds.get(p);
  if (pendingFlight != null) {
    if (performance.now() < pendingFlight) return;
    receiptFlightEnds.delete(p);
  } else {
    const flightEnd = animateReceivedBill(p);
    if (flightEnd != null && performance.now() < flightEnd) {
      receiptFlightEnds.set(p, flightEnd);
      return;
    }
  }
  for (const q of [facilities.C.queue, facilities.C.queue2]) {
    const i = q.indexOf(p);
    if (i >= 0) { leaveCounterLine(q, i); break; }
  }
  collectPayment(p);
  if (p.auto && hasCologne() && S.bottle > 0 && Math.random() < 0.6) {
    p.cologne = true;
    p.state = "selfDripC";
    p.dripT = 0.8;
    S.bottle = Math.max(0, S.bottle - rand(8, 14));
    S.stats.cologne++;
    return; // self-splash after payment, then head out
  }
  // extra bills still cost satisfaction (see finalSat) — no toast for it
  finishVisit(p, finalSat(p), true); // change in hand — walk out through the exit
}

function stormOut(p) {
  // Left the payment queue without paying: notification only. Not a runaway
  // — no red badge, never catchable — they simply walk out and board.
  p.unpaid = true; // used the toilet, paid nothing (the fee is lost)
  if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
  toast("😠 Misafir ödemeden gitti", "bad");
  // still inside the WC: walk out through the side passage instead of vanishing
  finishVisit(p, clamp((p.useSat != null ? p.useSat : 60) - 20, 15, 60), isIndoorPax(p));
}

// Their bus is leaving and the line still isn't clear: the guest abandons
// the payment and walks straight to the boarding door.
function giveUpLine(p) {
  // The bus is rolling and the guest abandons the payment queue without
  // paying: notification only. Not a runaway — no badge, never catchable —
  // they sprint for the boarding door.
  p.unpaid = true; // used the toilet, paid nothing (the fee is lost)
  if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
  toast("😠 Misafir ödemeden gitti", "bad");
  finishVisit(p, clamp((p.useSat != null ? p.useSat : 60) - 15, 15, 60), isIndoorPax(p));
  // Belt-and-braces: finishVisit only sprints when boardAt is reached; if the
  // guest is left walking or idling, send them for the door at full sprint.
  if (p.state === "walk" || p.state === "free") {
    const bus = findBusOf(p);
    if (bus && bus.state === "stop") goDoor(p, bus);
  }
}

// The front guest has walked all the way up to the counter (not still approaching it).
function atPaySpot(p) {
  return !!p && Math.hypot(p.x - PAY_SPOT.x, p.y - PAY_SPOT.y) < 4;
}
// the bill only comes out once the guest stands at their pay spot, not on the walk up
const holdsBill = p => p.state === "payC2"
  ? Math.hypot(p.x - PAY_SPOT2.x, p.y - PAY_SPOT2.y) < 4
  : (p.state === "payC" || p.state === "doneC") && atPaySpot(p);

function animateChangeBill(d, guest) {
  const tray = COUNTER_IN.chips.find(c => c.d === d);
  if (!tray) return;
  const source = deskRect({ x: tray.x + tray.w / 2, y: tray.y + (tray.h + 20) / 2, w: 0, h: 0 }, "drawer");
  const from = { x: changeNoteX(guest.x, (guest.changeNotes || []).length), y: counterTopBillY() };
  const now = performance.now(), previous = changeBillFlights[changeBillFlights.length - 1];
  const t0 = Math.max(now, previous ? previous.t0 + CHANGE_BILL_STAGGER : now);
  changeBillFlights.push({ d, guest, from: { x: source.x, y: source.y }, to: from, fromU: 4.2, toU: COUNTER_BILL_U, angleFrom: Math.PI / 2, angleTo: Math.PI / 2, t0 });
  return t0 + CHANGE_BILL_FLIGHT_DURATION;
}

function animateReceivedBill(guest) {
  if (guest.bill == null) return null;
  const tray = COUNTER_IN.chips.find(c => c.d === guest.bill) || COUNTER_IN.chips[COUNTER_IN.chips.length - 1];
  const from = { x: guest.auto ? counterExactBillX() : guest.x + COUNTER_BILL_OFFSET, y: counterTopBillY() };
  const to = deskRect({ x: tray.x + tray.w / 2, y: tray.y + (tray.h + 20) / 2, w: 0, h: 0 }, "drawer");
  const now = performance.now(), previous = changeBillFlights[changeBillFlights.length - 1];
  const t0 = Math.max(now, previous ? previous.t0 + CHANGE_BILL_STAGGER : now);
  changeBillFlights.push({ d: guest.bill, from, to: { x: to.x, y: to.y }, fromU: COUNTER_BILL_U, toU: 4.2, angleFrom: Math.PI / 2, angleTo: Math.PI / 2, t0 });
  return t0 + CHANGE_BILL_FLIGHT_DURATION;
}

// You hand back change from the till (called on chip clicks).
function giveChange(d) {
  const front = facilities.C.queue[0];
  if (!front || front.state !== "payC" || !atPaySpot(front) || front.changeGiven >= front.owed) return;
  const flightEnd = animateChangeBill(d, front);
  if (!Array.isArray(front.changeNotes)) front.changeNotes = []; // saves from before note tracking
  front.changeNotes.push(d);
  front.changeGiven += d;
  // Keep the customer at the counter until the final bill reaches them.
  if (front.changeGiven >= front.owed) {
    if (performance.now() >= flightEnd) finalizePayment(front);
    else changePaymentFlights.set(front, flightEnd);
  }
}

// You splash cologne on the guest at the counter (called on bottle clicks).
function offerCologne() {
  if (!hasCologne()) return; // no bottle on the counter yet
  const front = facilities.C.queue[0];
  if (S.bottle <= 0) { toast("🧴 Kolonya bitti — gece dolar", ""); return; }
  if (!front || (front.state !== "payC" && front.state !== "doneC") || front.cologne || !atPaySpot(front)) return;
  front.cologne = true;
  front.colognePrev = front.state;
  front.state = "dripC";
  front.dripT = 0.8;
  S.bottle = Math.max(0, S.bottle - rand(8, 14));
  S.stats.cologne++;
}

// The tail of a visit: stats, reputation, and where the guest goes next.
// viaDoor: the guest is still INSIDE the WC — no snap out; they take the
// long way home, strolling to the exit (the "leaveC" state below).
function finishVisit(p, sat, viaDoor = false) {
  if (!viaDoor && isIndoorPax(p)) { p.x = 852 + BUILD_DX; p.y = 169 - BUILD_LIFT; } // back on the outdoor side of the door
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
    // Settled at the counter — stroll out through a side passage (updatePax).
    p.state = "leaveC";
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
    if (si >= 0 && sc > 15) S.stallClean[si] = Math.max(0, sc - rand(...toiletDef().dirtUse));
    autoCleanAfterVisit(si);
    const sat = clamp((p.useSat != null ? p.useSat : SAT_BASE) - 15, 15, 100);
    p.wcUsed = true;
    p.unpaid = true; // the visit was interrupted — the fee is never collected
    if (S.stats) S.stats.evaded = (S.stats.evaded || 0) + 1;
    finishVisit(p, sat);
  }
}

/* ------------------------------ Update ------------------------------ */
// The one scheduler: the shared clock advances once per sub-step, then every
// owned terminal is stepped against it — the visible one and the unseen ones
// alike, so switching terminals only changes what is drawn.
function advanceSimulation(dt, timeDt = dt) {
  // Sub-step coarse frames. Every timer in this sim integrates per second —
  // queue patience (8–30 s), stall service (4–6 s), stop clocks — so one step
  // of a few seconds (a 100x/200x frame on a busy tab: dt up to 10–20 s)
  // would zero a queue's patience before its stall is even checked, or fling a
  // bus off the scene. Sub-steps keep each piece of state integrated at
  // ≤2 s resolution regardless of frame rate; the cap keeps a very long
  // hidden-tab catch-up responsive (its far end stays coarse, as before).
  if (timeDt > 2) {
    const k = Math.min(60, Math.ceil(timeDt / 2));
    for (let i = 0; i < k; i++) advanceSimulation(dt / k, timeDt / k);
    return;
  }
  // clock — driven by real elapsed time, so 1 game hour = 6 real minutes (at 1x)
  G.clock.time += timeDt / SECONDS_PER_HOUR;
  // while-loop: a catch-up after a long hidden tab may cross several midnights
  while (G.clock.time >= 24) {
    G.clock.time -= 24; G.clock.day++;
    for (const t of ownedTerminals()) {
      t.sim.bottle = wcDef("cologne", t).ml;
      // automation's daily running cost — owed whether or not cash covers it
      const op = operatingCost(t);
      if (op) applyTransaction("operating", -op, t.id, "günlük işletme", true);
      // close the day here and now: the next fee already belongs to the new day
      t.sim.history.push(Object.assign({}, t.sim.stats, { day: G.clock.day - 1, repEnd: t.sim.rep }));
      if (t.sim.history.length > HISTORY_DAYS) t.sim.history.splice(0, t.sim.history.length - HISTORY_DAYS);
      t.sim.stats = freshDayStats(t.sim.rep);
    }
    showDaySummary();
    G.clock.lastSave = G.clock.time; // time wrapped — otherwise the >8h autosave never re-arms this day
  }
  for (const t of ownedTerminals()) { bindTerminal(t.id); stepTerminal(dt, timeDt); }
  bindTerminal(G.activeTerminal);
  updateCars(dt);

  if (G.clock.time - G.clock.lastSave > 8) { G.clock.lastSave = G.clock.time; save(); }
}

// One step of the bound terminal (S / buses / facilities).
function stepTerminal(dt, timeDt) {
  throughTick(dt); // buses driving straight through, both ways
  // the bus we're washing must still be parked, or we step back out
  if (S.view === "wash") {
    const wb = buses.find(x => x.id === S.washBus);
    if (!wb || wb.state !== "stop") setView("out");
  }
  // your tea on the counter: sipped down over TEA_HOURS; a fresh glass comes
  // only when you order one on the intercom (only if tea upgrade is purchased)
  if (hasTea()) {
    S.tea = Math.max(0, S.tea - timeDt / SECONDS_PER_HOUR / TEA_HOURS);
    if (S.teaOrder != null) {
      S.teaOrder -= timeDt / SECONDS_PER_HOUR;
      if (S.teaOrder <= 0) { S.teaOrder = null; S.tea = 1; toast("🍵 Taze çay geldi!", "good"); }
    }
  } else {
    S.tea = 1;
  }

  // The built parking spaces limit buses on the scene, including a bus that
  // is leaving and still physically occupies the lot.
  const capacity = parkingSpaces();
  const parked = buses.filter(b => b.state === "stop" || b.state === "enter").length;
  const inbound = buses.some(b => b.state === "drive" && !b.stoppedOnce && b.cx < 700);
  // A vacant bay dispatches a replacement after 8 game minutes at the latest,
  // leaving time for it to arrive before the 10-minute empty-lot cap.
  let vacantTooLong = -1; // bay that has been vacant longest, past its backstop
  if (S.slotVacantSince) for (const i of activeParkingSlots()) {
    const v = S.slotVacantSince[i];
    if (v == null || !reached(v + maxGap())) continue;
    // (G.clock.time - v) wraps midnight safely: a bay can't sit vacant >12 h
    // (the backstop fires at 8 minutes), so the +24 modulo is the true elapsed time.
    if (vacantTooLong < 0 ||
        (G.clock.time - v + 24) % 24 < (G.clock.time - S.slotVacantSince[vacantTooLong] + 24) % 24) vacantTooLong = i;
  }
  openingBus();
  const scheduleDue = reached(S.nextBusAt);
  if (autoTraffic && (scheduleDue || vacantTooLong >= 0) && parked < capacity && !inbound && buses.filter(b => !b.through).length < capacity) {
    // The 8-minute backstop reserves the bay that went quiet longest (baySlotFor
    // honors forcedSlot); a scheduled bus takes the first free stall it reaches.
    // (it waits while its lane is backed up to the edge — it never appears inside a vehicle or a reserved zone)
    if (spawnBus(vacantTooLong >= 0 ? vacantTooLong : null)) S.nextBusAt = G.clock.time + busInterval();
  }

  // buses — the traffic controller first hands out the maneuver reservation
  trafficControl();
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
      let step = b.v * dt;
      // hard limit: never drive into the gap the vehicle ahead needs, nor into a reserved zone (no overtaking)
      const room = laneRoom(b);
      if (step > room) { step = Math.max(0, room); b.v = 0; b.brake = true; }
      const sg = busDir(b);
      const onLane = sweepClear(b, walkingPax(), b.cx, b.cx + step * sg, x => ({ cx: x, cy: laneCy(b), ang: 0 }));
      if (onLane.blocked) { step = Math.abs(onLane.s - b.cx); b.v = 0; b.brake = true; b.paxHit = onLane.hit; }
      // a visiting bus asks for the parking reservation, waits short of its turn-in point, then turns in
      const lane = !b.stoppedOnce && !b.through ? parkingApproach(b, step) : step;
      if (lane != null) {
        b.cx += lane * sg;
        b.cy = lerp(b.cy, laneCy(b), Math.min(1, dt * 3));
        b.ang = lerp(b.ang, 0, Math.min(1, dt * 5));
      }
      // Only cull buses still driving: a coarse step (a 100x/200x frame on a
      // busy tab moves a bus 185·10 = 1850px) can carry an inbound bus past
      // every bay threshold AND the removal line in the same step — the
      // beginEnter above already switched its state, so without this guard the
      // just-parked bus would be spliced off the scene.
      const gone = busDir(b) > 0 ? b.cx - b.len / 2 > Wdyn - offX + 60 : b.cx + b.len / 2 < -offX - 60;
      if (b.state === "drive" && gone) buses.splice(i, 1);
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
                lineDeadline = G.clock.time + rand(5 / 60, 10 / 60); // one grace draw per bus, from the ready moment
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
      // Departure: once the layover is over and every guest is aboard, the bus
      // asks for the departure reservation. The controller lets one bus park or
      // leave at a time; this bus starts backing out (endStop) once it holds the
      // reservation and its whole reversing path is clear of traffic.
      if (b.phase === PHASE.PARKED) {
        if (reached(b.stopEnd) && allAbroad(b)) {
          b.boardGrace = (b.boardGrace || 0) + dt;
          if (b.boardGrace >= (b.boardWait != null ? b.boardWait : 2)) requestManeuver(b, PHASE.WAIT_DEPART_PERMIT);
        } else if (b.stopElapsed >= SECONDS_PER_HOUR) {
          // Hard cap: a full in-game hour in the terminal. Anyone still in the WC
          // payment line gives up on the payment and walks for the boarding door;
          // the bus leaves as soon as they are all aboard.
          for (const p of b.pax) {
            for (const q of [facilities.C.queue, facilities.C.queue2]) {
              const qi = q.indexOf(p);
              if (qi >= 0) { q.splice(qi, 1); giveUpLine(p); }
            }
          }
          if (!b.__capped) { b.__capped = true; toast("⏱ Süre doldu, otobüs kalkıyor", "bad"); }
        }
      }
      if (b.phase === PHASE.WAIT_DEPART_CLEAR && maneuverClear(b)) endStop(b);
    } else if (b.state === "enter") {
      b.stopElapsed = (b.stopElapsed || 0) + timeDt; // dwell clock keeps running
      const g = enterGeom(b, b.slot);
      const s0 = b.mv.s;
      let done = moveAlong(b, dt, g.L, BUS_TURN_V, BUS_ACC, BUS_BRAKE * 0.6);
      const clear = sweepClear(b, walkingPax(), s0, b.mv.s, s => enterPose(g, s));
      if (clear.blocked) { b.mv.s = clear.s; b.v = 0; b.brake = true; done = false; b.paxHit = clear.hit; } // a guest is in the way: hold
      Object.assign(b, enterPose(g, b.mv.s));
      if (done) finishEnter(b);
    } else { // "exit" — REVERSING out of the stall onto the lane. The road it
      // sweeps was clear when it started and stays reserved (no vehicle enters it).
      const g = exitGeom(b);
      const s0 = b.mv.s || 0;
      let done = moveAlong(b, dt, g.L, BUS_REV_V, 30, 45);
      const clear = sweepClear(b, walkingPax(), s0, b.mv.s, s => exitPose(g, s));
      if (clear.blocked) { b.mv.s = clear.s; b.v = 0; b.brake = true; done = false; b.paxHit = clear.hit; } // a guest is in the way: hold
      Object.assign(b, exitPose(g, b.mv.s));
      if (done) finishExit(b);
    }
    // a guest holding the bus too long steps out of its way
    b.paxHoldT = b.paxHit ? (b.paxHoldT || 0) + dt : 0;
    if (b.paxHoldT > PAX_SHOVE_AFTER && b.paxHit) shoveOutOfBus(b.paxHit);
    b.paxHit = null;
    // passengers
    for (const p of b.pax) updatePax(p, b, dt, timeDt);
  }

  updateFacilities(dt, timeDt);
  stepCounter(timeDt);
  stepAutomation(timeDt);
  maintenanceTick();
}

// The automated systems' routine work, on game time (sim seconds).
function stepAutomation(timeDt) {
  const td = toiletDef();
  if (td.auto && autoRunning("toilet")) {
    const add = td.autoCleanPerHour * timeDt / SECONDS_PER_HOUR;
    for (const i of activeStalls()) if (!facilities.T.spots[i]) S.stallClean[i] = Math.min(100, S.stallClean[i] + add);
  }
  const wd = carWashOpen() ? washDef() : null;
  if (wd && wd.auto && autoRunning("wash")) {
    // the bus the player is washing by hand is left to the player
    const ready = buses.filter(b => b.state === "stop" && !b.washDone && !(S.view === "wash" && S.washBus === b.id));
    const started = ready.filter(b => b.autoWashT > 0);
    const work = wd.auto === "full" ? ready : (started.length ? started : ready).slice(0, 1);
    for (const b of work) {
      b.autoWashT = (b.autoWashT || 0) + timeDt;
      if (b.autoWashT >= wd.autoWashSec) {
        const w = ensureWash(b);
        w.g.fill(0);
        finishWash(b, false);
      }
    }
  }
}

// The self-clean cycle an automated stall runs as the guest leaves.
function autoCleanAfterVisit(i) {
  const td = toiletDef();
  if (i >= 0 && td.autoCleanPerVisit && autoRunning("toilet")) S.stallClean[i] = Math.min(100, S.stallClean[i] + td.autoCleanPerVisit);
}

// Fully automated counter: the guest at the pay spot gets crisp change on
// its own after autoChangeSec — the player may still serve them first.
function autoCounter(front, timeDt) {
  const td = toiletDef();
  if (!td.autoChangeSec || !autoRunning("toilet") || front.state !== "payC" || !atPaySpot(front)) return;
  front.autoPayT = (front.autoPayT || 0) + timeDt;
  if (front.autoPayT < td.autoChangeSec) return;
  if (!Array.isArray(front.changeNotes)) front.changeNotes = [];
  let r = front.owed - front.changeGiven;
  for (const d of [50, 20, 10]) while (r >= d) { front.changeNotes.push(d); front.changeGiven += d; r -= d; }
  finalizePayment(front);
}

function updatePax(p, bus, dt, timeDt = dt) {
  if (p.state === "bus") {
    const d = doorPos(bus);
    p.x = d.x; p.y = d.y;
    riseNeeds(p, timeDt);
    if (bus.state === "stop" && p.disembark && reached(p.offAt) && !reached(p.boardAt)) {
      p.disembark = false; // each guest leaves only once per stop
      p.__boarded = false; // off the bus for this cycle
      if (p.directWc) { p.directWc = false; p.refuseT = false; headToFacility("T", p, bus); } // first-ever bus: straight to the WC
      else wander(p); // spread out to a random spot instead of queuing at the door
    } else if (bus.stoppedOnce && reached(p.boardAt) && !p.__boarded) {
      // One-shot per boarding cycle. Guests who stayed aboard keep their
      // heads in the windows (the flag stays true); only a guest who never
      // re-boarded after a visit would leave again here, and exactly once.
      p.state = "board"; p.tx = d.x; p.ty = d.y;
    }
    return;
  }

  riseNeeds(p, timeDt);

  // disembarked: walk toward target
  if (p.state === "walk" || p.state === "board") {
    const step = (p.state === "board" ? 150 : 55) * dt; // sprinting to catch the bus
    if (p.state === "board") {
      // a guest who cannot find a way to the door (walled in between parked buses)
      // gives up on the walk and gets on at the door after a few seconds
      p.boardT = (p.boardT || 0) + dt;
      if (p.boardT > 4) {
        p.x = p.tx; p.y = p.ty; p.boardT = 0;
        p.state = "bus"; p.__boarded = true;
        return;
      }
    } else p.boardT = 0;
    if (p.state === "walk") {
      // a random stroll that never gets there (blocked route) gives up after a while
      p.walkT = (p.walkT || 0) + dt;
      if (!p.want && p.walkT > 20) { wander(p); return; }
    }
    if (moveOutdoorPax(p, p.tx, p.ty, step)) {
      if (p.state === "board") { p.state = "bus"; p.__boarded = true; } // aboard again for this cycle
      else if (p.want === "R" || p.want === "T") tryJoin(p.want, p, bus);
      else { p.state = "free"; p.idleT = p.tutGuest && brushTutPending() ? rand(0.2, 0.5) : rand(2, 5); p.tx = p.x; p.ty = p.y; p.walkT = 0; } // stand a while, then wander on (free branch) — the tutorial guest keeps moving
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
    if (p.state === "waitR") { p.x = 676 + BUILD_DX - 16 * (i + 1); p.y = 168 - BUILD_LIFT - (i % 2) * 3; }
    else { p.x = Math.min(940, 866 + BUILD_DX + 16 * (i + 1)); p.y = 168 - BUILD_LIFT - (i % 2) * 3; }
    return;
  }

  if (p.state === "serveR") { p.x = 690 + BUILD_DX; p.y = 169 - BUILD_LIFT; return; }
  if (p.state === "serveT") {
    // indoors: fresh pulls spawn below a side passage (stepFac) and walk up
    // it (enterT). Then walk to your stall bay — the
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
    const sx = stallCx(ti), sy = stallSy(224);
    moveToward(p, sx, sy, 100 * dt);
    // the door shuts only once the guest has stepped in — before that the
    // leaf stays ajar and the guest is visible walking off to their bay
    if (Math.hypot(p.x - sx, p.y - sy) < 8) p.inStall = true;
    return;
  }
  if (p.state === "selfDripC") {
    p.dripT -= timeDt;
    if (p.dripT <= 0) finishVisit(p, finalSat(p), true);
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
    // Paid, change in hand: over to the nearer side passage, down it, and out to the lot.
    // (A runaway reuses this state too — they never paid, so they dash at
    // EVADE_WALK per REAL second, so the chase stays fair at any speed tier.
    // Unpaid queue-leavers reach it too: they stroll out the same way, just without the change.)
    // Everyone walks the whole way, even if their bus is already boarding —
    // the bus waits for them (allAbroad), and a runaway stays catchable.
    const bus = findBusOf(p);
    const gx = sideGapX(p.x > W / 2), oy = sideOutY();
    const step = p.runaway ? EVADE_WALK * dt / speed : 100 * dt;
    if (p.x !== gx) moveToward(p, gx, SIDE_IN_Y, step);
    else moveToward(p, gx, oy, step);
    if (p.x === gx && Math.abs(p.y - oy) < 8) {
      p.x = 852 + BUILD_DX; p.y = 169 - BUILD_LIFT;    // step out onto the outdoor side
      p.runaway = false;       // crossed the exit — the escape succeeded
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
  // walking up toward the counter
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
const ROAD_CAR_LENGTH = 52, ROAD_CAR_GAP = 18;
// Is the stretch [l, r] of lane `dir` free for a vehicle to appear in at speed v
// (no vehicle or reserved zone there, nor within its stopping distance)?
function laneEntryFree(dir, l, r, v) {
  const pad = ROAD_CAR_GAP + v * v / (2 * CAR_BRAKE);
  return !laneVehicles().some(o => o.dir === dir && o.r > l - pad && o.l < r + pad)
    && !reservedZones().some(z => z.dir === dir && z.r > l - pad && z.l < r + pad);
}

// Cars drive their lane at their own cruising speed (|c.v|, signed by direction;
// c.spd is the current speed). Each car brakes smoothly for its stop line from
// laneLimit — the vehicle ahead (keeping a short time gap) or a reserved zone —
// and never moves past it, so the order on a lane never changes.
function updateCars(dt) {
  carTimer -= dt;
  const vehicles = laneVehicles(), zones = reservedZones();
  if (carTimer <= 0 && autoTraffic) {
    // traffic runs both ways: right-to-left in the upper lane, left-to-right in the lower lane
    const fromRight = Math.random() < 0.5, dir = fromRight ? -1 : 1;
    const spawnX = fromRight ? Wdyn - offX + 40 : -offX - ROAD_CAR_LENGTH - 40;
    const vmax = rand(120, 190);
    // the entry stretch must be free (a queue backed up to the edge, or a bus passing it): try again shortly
    if (!laneEntryFree(dir, spawnX, spawnX + ROAD_CAR_LENGTH, vmax)) carTimer = 0.2;
    else {
      carTimer = rand(4, 9);
      const c = { x: spawnX, y: fromRight ? 462 : 514, hue: randInt(0, 359), v: dir * vmax, spd: vmax }; // left-to-right: the lane nearer the bottom edge
      cars.push(c);
      vehicles.push({ ref: c, car: true, dir, l: c.x, r: c.x + ROAD_CAR_LENGTH, v: vmax });
    }
  }
  for (const dir of [-1, 1]) {
    // lead car first, so every follower sees where the car ahead has just moved to
    const lane = vehicles.filter(o => o.car && o.dir === dir).sort((a, b) => dir * (b.l - a.l));
    for (const o of lane) {
      const c = o.ref, vmax = Math.abs(c.v);
      const { room, leadV } = laneLimit(o, vehicles, zones);
      let spd = c.spd != null ? c.spd : vmax;
      const free = Math.max(0, room - CAR_HEADWAY * spd);
      const target = Math.min(vmax, Math.sqrt(leadV * leadV + 2 * CAR_BRAKE * free));
      spd = spd < target ? Math.min(target, spd + CAR_ACC * dt) : Math.max(target, spd - CAR_HARD_BRAKE * dt);
      let move = spd * dt;
      if (move > Math.max(0, room)) { move = Math.max(0, room); spd = Math.min(spd, leadV); } // never past the stop line — and never backwards
      c.x += dir * move; c.spd = spd;
      o.l = c.x; o.r = c.x + ROAD_CAR_LENGTH; o.v = spd;
      c.heldT = move < 0.05 ? (c.heldT || 0) + dt : 0; // how long this car has been standing (debug overlay)
    }
  }
  // a car leaves once it is past the edge it drives toward (rightbound cars appear beyond the left edge, so
  // culling on both edges deleted every one of them the frame it appeared)
  cars = cars.filter(c => (c.v > 0 ? c.x < Wdyn - offX + 80 : c.x + ROAD_CAR_LENGTH > -offX - 80));
}

/* ------------------------------ Rendering --------------------------- */
const canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");  // swapped only by paintArt() to draw shop card art

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
  // Never narrower than LOT_MIN_W: bay 10 ends near x≈968 and the lot must still show past it on
  // windows narrower than 2:1 (they used to clip at 960). Wider windows keep the exact H×aspect width.
  Wdyn = Math.max(H * a, LOT_MIN_W);
  Hdyn = Wdyn / a;
  offX = (Wdyn - W) / 2;
  offY = (Hdyn - H) / 2;
  // centered in the gap between the left view edge and the stall row, at the top
  COUNTER_IN.hose.x = -offX + (stallOx() + offX - COUNTER_IN.hose.w) / 2;
  COUNTER_IN.hose.y = -offY + 6;
  COUNTER_IN.bucket.x = -offX + (stallOx() + offX - COUNTER_IN.bucket.w) / 2;
  COUNTER_IN.bucket.y = -offY + 48;
  deskK = a > ULTRA_ASPECT ? DESK_ULTRA_K : 1;
  PAY_SPOT.y = counterGuestStandY();
  PAY_SPOT2.y = PAY_SPOT.y;
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
  if (mapPanelOpen) positionMapPanel();
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
// "#rrggbb" or "rgb(r,g,b)" (what mix returns, so mixes can be nested) → [r, g, b]
function hex(h) {
  if (h[0] !== "#") return h.match(/[\d.]+/g).slice(0, 3).map(Number);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function nightFactor() {
  const t = G.clock.time;
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
const LAMPS = [175, 980];

/* ---------------------------- Regional map ---------------------------- */
// A view, not a pause: every terminal keeps running while the map is open.
// mapZoom eases 0 (terminal) ↔ 1 (map); in between, the terminal scene shrinks
// into its node as the map fades in.
// The map's drawing area: the visible canvas minus the side panel on the right.
function mapArea() {
  const r = canvas.getBoundingClientRect(), panel = $("mapPanel");
  const panelPx = (panel.parentElement?.clientWidth || r.width) * 0.4;
  const pw = r.width > 0 ? (panelPx + 24) * Wdyn / r.width : 0;
  return { x: -offX + 40 + pw / 2, y: -offY + 70, w: Wdyn - 80 - pw, h: Hdyn - 140 };
}
// Simplified real geography, [lon, lat]. Coasts run so the polygons share edges.
const GEO = (() => {
  const blackSea = [[29.08,41.23],[29.6,41.18],[30.25,41.2],[30.65,41.12],[31.12,41.1],[31.42,41.28],[31.78,41.45],[32.38,41.75],[33,41.9],[33.76,41.98],[34.5,42],[34.95,42.1],[35.15,42.02],[35.2,41.8],[35.6,41.65],[35.95,41.73],[36.1,41.6],[36.33,41.3],[36.65,41.38],[36.95,41.35],[37.28,41.13],[37.6,41.05],[37.88,41],[38.39,40.93],[38.82,41.02],[39.3,41.03],[39.72,41.01],[40.27,40.95],[40.52,41.04],[40.9,41.18],[41.42,41.4],[41.55,41.52]];
  const border = [[41.55,41.52],[42,41.5],[42.5,41.45],[42.85,41.58],[43.45,41.15],[43.47,40.98],[43.75,40.7],[43.6,40.45],[43.9,40.15],[44.35,40],[44.78,39.7],[44.5,39.45],[44.05,39.38],[44.2,38.9],[44.45,38.35],[44.25,37.95],[44.6,37.45],[44.79,37.15],[44.3,37],[43.9,37.25],[43.4,37.3],[42.75,37.37],[42.36,37.11],[41.5,37.08],[40.8,37.12],[40.2,36.9],[39.2,36.68],[38.4,36.9],[37.8,36.75],[37,36.65],[36.68,36.83],[36.6,36.4],[36.3,36.2],[36.2,35.9],[35.92,35.92]];
  const south = [[35.92,35.92],[35.97,36.1],[35.85,36.35],[36,36.5],[36.17,36.6],[36.22,36.85],[35.95,36.85],[35.78,36.77],[35.55,36.6],[35.38,36.56],[34.95,36.72],[34.63,36.8],[34.3,36.6],[34.05,36.4],[33.9,36.3],[33.55,36.15],[32.8,36.03],[32.5,36.12],[32.3,36.27],[32,36.54],[31.43,36.78],[31,36.85],[30.7,36.88],[30.57,36.6],[30.45,36.25],[30,36.25],[29.64,36.2],[29.4,36.26],[29.1,36.65],[28.8,36.68],[28.4,36.8],[28,36.6],[27.4,36.68],[27.9,36.78],[28.3,37.03],[27.7,37],[27.43,37.03],[27.25,37],[27.3,37.15],[27.6,37.25],[27.25,37.38],[27.25,37.65],[27.25,37.86],[26.95,38.05],[26.85,38.2],[26.5,38.18],[26.3,38.3],[26.4,38.45],[26.5,38.65],[26.75,38.42],[27.1,38.42],[26.85,38.6],[26.75,38.7],[26.95,38.8],[26.9,38.98],[26.75,39.1],[26.68,39.32],[26.95,39.5],[27,39.58],[26.6,39.55],[26.07,39.48],[26.15,39.75],[26.15,39.95],[26.35,40.08],[26.4,40.15],[26.68,40.35],[27.2,40.45],[27.5,40.32],[27.8,40.33],[27.75,40.53],[28,40.4],[28.4,40.4],[28.88,40.38],[29.1,40.43],[28.85,40.52],[28.95,40.62],[29.27,40.66],[29.6,40.73],[29.92,40.76],[29.6,40.78],[29.35,40.8],[29.3,40.82],[29.15,40.9],[29.03,40.98],[29.05,41.1]];
  const thrace = [[28.03,41.98],[28.3,41.7],[28.6,41.45],[28.68,41.35],[29,41.25],[29.05,41.2],[29,41.02],[28.6,41],[28.25,41.07],[27.95,41],[27.5,40.97],[27.25,40.7],[27.1,40.6],[26.7,40.42],[26.4,40.2],[26.18,40.05],[26.2,40.3],[26.65,40.55],[26.75,40.65],[26.3,40.6],[26.05,40.72],[26.35,41.25],[26.6,41.35],[26.55,41.65],[26.35,41.75],[26.6,41.95],[27,42.05],[27.6,41.95]];
  return {
    turkey: [blackSea.concat(border.slice(1), south.slice(1)), thrace, [[25.65,40.2],[25.95,40.25],[25.95,40.12],[25.7,40.1]]],
    neighbors: [
      [[28.03,41.98],[27.95,42.3],[27.47,42.5],[27.9,42.85],[27.9,43.2],[28.6,43.8],[28.8,44.5],[29.7,45.2],[30.7,46.5],[31.5,46.6],[33,46],[32.5,45.4],[33.6,44.5],[35,45],[36.5,45.3],[37.5,47],[39,47.2],[38.3,46],[37.5,44.7],[39,44],[39.7,43.6],[41,42.9],[41.67,42.15],[41.63,41.65],[41.55,41.52],
       [60,41],[60,52],[15,52],[15,38],[20,38],[21.5,36.8],[22.5,36.4],[23.2,36.5],[23,37.5],[24,37.7],[24,38.2],[23.2,38.7],[22.9,39.4],[23.3,39.15],[22.8,40],[22.9,40.6],[23.4,40.25],[23.9,40],[24.3,40.1],[23.8,40.4],[24.4,40.9],[25,40.95],[25.88,40.85],...thrace.slice(20)],
      [...border, [35.78,35.52],[35.88,34.9],[35.5,33.9],[35,32.8],[34.5,31.5],[34,31.2],[30,31.3],[25,31.8],[25,28],[60,28],[60,41]],
      [[32.27,35.1],[32.9,34.65],[33.6,34.9],[34,34.98],[34.6,35.7],[33.9,35.25],[33,35.35],[32.9,35.18]],
      [[27.7,36.15],[28.2,36.45],[28.25,36.35],[27.75,35.9]], [[25.85,39.25],[26.2,39.38],[26.6,39.05],[26.15,39]],
      [[25.9,38.6],[26.15,38.55],[26.1,38.2],[25.85,38.25]], [[26.6,37.8],[27.05,37.7],[26.95,37.65],[26.6,37.65]],
      [[23.5,35.5],[24.3,35.6],[25.5,35.35],[26.3,35.25],[25,35],[23.6,35.2]],
    ],
    lakes: [[[42.3,38.6],[42.9,38.95],[43.35,38.8],[43.6,38.45],[43.1,38.35],[42.6,38.4]], [[33.25,38.95],[33.5,39.05],[33.6,38.7],[33.4,38.6],[33.25,38.75]]],
    cities: [["Ankara", 32.85, 39.93, true], ["İzmir", 27.14, 38.42], ["Bursa", 29.06, 40.19], ["Antalya", 30.71, 36.9], ["Konya", 32.49, 37.87], ["Adana", 35.32, 37], ["Kayseri", 35.48, 38.72], ["Sivas", 37.02, 39.75], ["Erzurum", 41.27, 39.9], ["Diyarbakır", 40.23, 37.91], ["Van", 43.38, 38.5]],
    seas: [["K A R A D E N İ Z", 34.6, 42.45], ["A K D E N İ Z", 31.9, 36.1], ["E G E", 26.05, 37.35]],
  };
})();
const MAP_VIEW = { lon0: 28.1, lon1: 40.4, lat0: 36, lat1: 42.6, k: Math.cos(39.3 * Math.PI / 180) };
// Equirectangular, the whole view fitted (and centred) inside the map area.
function mapProj(A) {
  const V = MAP_VIEW, w = (V.lon1 - V.lon0) * V.k, h = V.lat1 - V.lat0, s = Math.min(A.w / w, A.h / h) * 1.15;
  const ox = A.x + (A.w - w * s) / 2, oy = A.y + (A.h - h * s) / 2;
  return (lon, lat) => ({ x: ox + (lon - V.lon0) * V.k * s, y: oy + (V.lat1 - lat) * s });
}
const mapPos = (pt, A = mapArea()) => mapProj(A)(pt.lon, pt.lat);
function mapNodeAt(x, y, pad = 0) {
  const A = mapArea();
  let best = null, bd = 22 + pad;
  for (const d of CONFIG.terminals) { const p = mapPos(d.map, A), dd = Math.hypot(x - p.x, y - p.y); if (dd <= bd) { best = d.id; bd = dd; } }
  return best;
}
// owned | available (every requirement met — cash may still be short) | locked
function mapState(id) {
  if (ownedTerminal(id)) return "owned";
  return terminalRequirements(id).every(r => r.met) ? "available" : "locked";
}

function drawMap(alpha) {
  const A = mapArea(), now = performance.now(), pulse = 0.5 + 0.5 * Math.sin(now / 260);
  ctx.save();
  ctx.globalAlpha = alpha;
  const P = mapProj(A);
  const poly = pts => { ctx.beginPath(); pts.forEach(([lon, lat], i) => { const q = P(lon, lat); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath(); };
  ctx.fillStyle = "#1c3f63";
  ctx.fillRect(-offX, -offY, Wdyn, Hdyn);
  ctx.lineJoin = "round";
  ctx.fillStyle = "#333d37";
  for (const pts of GEO.neighbors) { poly(pts); ctx.fill(); }
  const land = ctx.createLinearGradient(0, -offY, 0, Hdyn - offY);
  land.addColorStop(0, "#35543f"); land.addColorStop(1, "#1e3326");
  ctx.fillStyle = land; ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.5;
  for (const pts of GEO.turkey) { poly(pts); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = "#1c3f63"; ctx.lineWidth = 1;
  for (const pts of GEO.lakes) { poly(pts); ctx.fill(); ctx.stroke(); }
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(190, 220, 255, 0.35)";
  ctx.font = "italic bold 14px system-ui, sans-serif";
  for (const [name, lon, lat] of GEO.seas) { const q = P(lon, lat); ctx.fillText(name, q.x, q.y); }
  // reference cities
  ctx.textAlign = "left";
  for (const [name, lon, lat, capital] of GEO.cities) {
    const q = P(lon, lat);
    ctx.fillStyle = "rgba(220, 228, 240, 0.55)";
    ctx.beginPath(); ctx.arc(q.x, q.y, capital ? 3.5 : 2.5, 0, 7); ctx.fill();
    ctx.font = `${capital ? "bold 12px" : "11px"} system-ui, sans-serif`;
    ctx.fillText(name, q.x + 6, q.y + 4);
  }
  ctx.textAlign = "center";
  // the road: İstanbul → every terminal (west to east) → Trabzon
  const stops = [CONFIG.mapEnds.from, ...CONFIG.mapRoute.map(w => typeof w === "string" ? termDef(w).map : { lon: w[0], lat: w[1] }), CONFIG.mapEnds.to].map(p => mapPos(p, A));
  const road = () => { ctx.beginPath(); stops.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); };
  ctx.lineCap = "round";
  ctx.strokeStyle = "#151a22"; ctx.lineWidth = 9; road(); ctx.stroke();
  ctx.strokeStyle = "#4b515d"; ctx.lineWidth = 6; road(); ctx.stroke();
  ctx.strokeStyle = "rgba(240, 214, 120, 0.8)"; ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]); road(); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineCap = "butt";
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 4;
  for (const [pt, name] of [[stops[0], DEST_A], [stops[stops.length - 1], DEST_B]]) {
    ctx.fillStyle = "#e8ecf5";
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, 7); ctx.fill();
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(name, pt.x, pt.y + 22);
  }
  // terminals
  for (const d of CONFIG.terminals) {
    const p = mapPos(d.map, A), st = mapState(d.id), t = ownedTerminal(d.id);
    const active = d.id === G.activeTerminal, sel = d.id === mapSel;
    if (active) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + 0.5 * pulse})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 22 + 3 * pulse, 0, 7); ctx.stroke();
    }
    if (sel && mapPanelOpen) {
      const panelRect = $("mapPanel").getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect();
      const panelLeft = (panelRect.left - canvasRect.left) * Wdyn / canvasRect.width - offX;
      const radius = 27, transition = Math.min(12, radius * 0.45);
      ctx.strokeStyle = "#8fd3ff"; ctx.lineWidth = 2.5 * Wdyn / canvasRect.width; ctx.lineCap = "round";
      // One open-sided, rounded bulge joins the panel's masked left edge to
      // the location marker; the right half of the circle is deliberately absent.
      ctx.beginPath();
      ctx.moveTo(panelLeft, p.y - radius);
      ctx.bezierCurveTo(panelLeft, p.y - radius + transition, p.x + transition, p.y - radius, p.x, p.y - radius);
      ctx.arc(p.x, p.y, radius, -Math.PI / 2, Math.PI / 2, true);
      ctx.bezierCurveTo(p.x + transition, p.y + radius, panelLeft, p.y + radius - transition, panelLeft, p.y + radius);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else if (sel) {
      ctx.strokeStyle = "#8fd3ff"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 27, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = st === "owned" ? "#3cc878" : st === "available" ? "#e3a43a" : "#5b6475";
    ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#10141f";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(st === "owned" ? "★" : st === "available" ? "₺" : "🔒", p.x, p.y + 1);
    ctx.textBaseline = "alphabetic";
    // name, status, "you are here" — stacked away from the node on its label side
    // (Bolu Dağı and Gerede sit ~40 km apart, so their text goes opposite ways; the panel has full names)
    const lines = [["bold 13px", "#ffffff", d.short]];
    if (t) {
      lines.push(["12px", "#c9f5d6", `★ ${Math.round(t.sim.rep)} · bugün +${fmtTL(t.sim.stats.revenue || 0)}${needsAttention(t) ? " · 🔧" : ""}`]);
      if (active) lines.push(["bold 10px", "#ffd36b", "BURADASIN"]);
    } else lines.push(["12px", st === "available" ? "#ffd36b" : "#aab3c5", `${st === "locked" ? "🔒 " : ""}${fmtTL(d.price)}`]);
    const up = d.map.label === "up";
    lines.forEach(([font, col, text], i) => {
      ctx.font = `${font} system-ui, sans-serif`; ctx.fillStyle = col;
      ctx.fillText(text, p.x, up ? p.y - 26 - (lines.length - 1 - i) * 15 : p.y + 32 + i * 15);
    });
  }
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  // title + legend, top-left over the sea (the bottom-left belongs to the toasts)
  const lx = -offX + 20, ly = -offY + 30;
  ctx.fillStyle = "rgba(16, 20, 31, 0.7)";
  ctx.beginPath(); ctx.roundRect(lx - 10, ly - 22, 380, 52, 10); ctx.fill();
  ctx.fillStyle = "#e8ecf5";
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.fillText("🗺 BÖLGE HARİTASI", lx, ly);
  ctx.font = "12px system-ui, sans-serif";
  let x = lx;
  for (const [col, label] of [["#3cc878", "sahip"], ["#e3a43a", "satılık"], ["#5b6475", "kilitli"]]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + 5, ly + 16, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#c8d0de";
    ctx.fillText(label, x + 14, ly + 20);
    x += 24 + ctx.measureText(label).width;
  }
  ctx.fillText(`— bir terminale ${coarseQ ? "dokun" : "tıkla"}`, x, ly + 20);
  ctx.restore();
}

function renderMapPanel() {
  const d = termDef(mapSel), t = ownedTerminal(mapSel);
  if (!d) return;
  $("mapTitle").textContent = d.name;
  let html = "", actions = "";
  if (t) {
    const wash = tierOfWash(t);
    html = `<ul><li>★ İtibar ${Math.round(t.sim.rep)} / 100</li>
        <li>WC: ${escHtml(wcSummary(t.wc))}</li>
        <li>Oto yıkama: ${wash ? escHtml(wash.name) : "yok"}</li>
        <li>Bugün: +${fmtTL(t.sim.stats.revenue || 0)} / −${fmtTL(t.sim.stats.expenses || 0)}</li>
        ${needsAttention(t) ? `<li class="no">🔧 Bakım ya da onarım gerekiyor</li>` : ""}
        <li>Yükseltme maliyeti ×${d.devCost}</li></ul>`;
    actions = d.id === G.activeTerminal
      ? `<button data-act="back">Terminale dön</button>`
      : `<button class="buy" data-act="switch" data-id="${d.id}">Bu terminale geç</button>`;
  } else {
    const st = terminalStatus(d.id), prof = CONFIG.profiles[d.profile];
    html = `<ul><li>Fiyat: ${fmtTL(d.price)}</li>
        <li>WC: ${escHtml(wcSummary(prof.wc))}</li>
        <li>Oto yıkama: ${prof.carWash.unlocked ? escHtml(CONFIG.carWashTiers.find(x => x.tier === prof.carWash.tier).name) : "yok"}</li>
        <li>Başlangıç itibarı ${prof.rep} · yükseltmeler ×${d.devCost}</li></ul>
      <div>Şartlar:</div>
      <ul>${st.reqs.length ? st.reqs.map(r => `<li class="${r.met ? "ok" : "no"}">${r.met ? "✓" : "✗"} ${escHtml(r.text)}</li>`).join("") : `<li class="ok">✓ Şart yok</li>`}</ul>`;
    actions = `<button class="buy" data-act="buyTerminal" data-id="${d.id}" ${st.ok ? "" : `disabled title="${escHtml(st.reason)}"`}>Satın al · ${fmtTL(d.price)}</button>
      ${st.ok ? "" : `<div class="why">${escHtml(st.reason)}</div>`}`;
  }
  if (mapMsg) actions += `<div class="msg ${mapMsg.ok ? "good" : "bad"}" role="status">${escHtml(mapMsg.text)}</div>`;
  $("mapDetail").innerHTML = html;
  $("mapActions").innerHTML = actions;
  if (mapPanelOpen) positionMapPanel();
}

function positionMapPanel() {
  if (!mapPanelOpen || !mapSel) return;
  const panel = $("mapPanel"), stage = panel.parentElement.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect(), node = mapPos(termDef(mapSel).map);
  const x = canvasRect.left - stage.left + (node.x + offX) * canvasRect.width / Wdyn;
  const y = canvasRect.top - stage.top + (node.y + offY) * canvasRect.height / Hdyn;
  const ringRadius = 27 * canvasRect.width / Wdyn;
  const pad = 8, left = Math.max(pad, x + ringRadius);
  const requestedWidth = stage.width * 0.4;
  const availableWidth = stage.width - left - 60;
  const panelWidth = Math.max(120, Math.min(requestedWidth, availableWidth));
  panel.style.width = `${panelWidth}px`;
  const w = panel.offsetWidth, h = panel.offsetHeight;
  const top = clamp(y - h / 2, 60, Math.max(60, stage.height - h - pad));
  const ringHeight = ringRadius * 2;
  const notchTop = clamp(y - top - ringRadius, 14, Math.max(14, h - ringHeight - 14));
  panel.style.left = `${left}px`;
  panel.style.right = "auto";
  panel.style.top = "auto";
  panel.style.bottom = `${Math.max(pad, stage.height - top - h)}px`;
  panel.style.setProperty("--map-notch-top", `${notchTop}px`);
  panel.style.setProperty("--map-notch-height", `${ringHeight}px`);
}

function setMapPanelOpen(on) {
  mapPanelOpen = !!on && mapOpen;
  $("mapPanel").classList.toggle("hidden", !mapPanelOpen);
  if (mapPanelOpen) renderMapPanel();
}

function setMapOpen(on) {
  if (on === mapOpen) return;
  if (on) {
    setView("out");       // tools back on their stations; the terminal is seen from outside as it shrinks away
    viewFade = 0;
    mapSel = null;        // open on the bare map: no terminal picked, so no details yet
    mapMsg = null;
  }
  mapOpen = on;
  mapPanelOpen = on && !!mapSel;
  $("mapPanel").classList.toggle("hidden", !mapPanelOpen);
  $("mapBtn").classList.toggle("on", on);
  if (on) renderMapPanel();
}

function mapSelect(id) {
  mapSel = id; mapMsg = null;
  if (!mapPanelOpen) setMapPanelOpen(true);
  else renderMapPanel();
}

function mapAction(btn) {
  if (btn.dataset.sel) { mapSelect(btn.dataset.sel); return; }
  const a = btn.dataset.act;
  if (a === "back") { setMapOpen(false); return; }
  if (a === "switch") {
    const r = switchTerminal(btn.dataset.id);
    if (r.ok) { setMapOpen(false); return; } // zoom into the new terminal
    mapMsg = { ok: false, text: "✗ " + r.reason };
  } else if (a === "buyTerminal") {
    const r = unlockTerminal(btn.dataset.id);
    mapMsg = r.ok ? { ok: true, text: `✓ Satın alındı (−${fmtTL(-r.tx.amount)}) — "Bu terminale geç" ile git` } : { ok: false, text: "✗ " + r.reason };
  } else return;
  renderMapPanel();
}

function drawTerminalScene() {
  if (S.view === "wc") drawWCInterior();
  else if (S.view === "wash") drawWashView();
  else { drawOutdoor(); if (roadDebug) drawRoadDebug(); }
}

// Traffic debug overlay (press T): each bus and car shows what it is doing and what it is waiting on.
let roadDebug = false;
function drawRoadDebug() {
  const f = v => (v === Infinity || v === -Infinity ? "∞" : Math.round(v));
  ctx.save();
  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  // reserved zones: the lane stretches a maneuvering bus has closed to traffic
  for (const z of reservedZones()) {
    const [y0, y1] = LANE_BAND[z.dir];
    ctx.fillStyle = "rgba(255,60,60,0.22)"; ctx.fillRect(z.l, y0, z.r - z.l, y1 - y0);
    ctx.strokeStyle = "rgba(255,60,60,0.8)"; ctx.strokeRect(z.l, y0, z.r - z.l, y1 - y0);
  }
  for (const b of buses) {
    const lines = [
      `#${b.id} ${b.state} dir${busDir(b)}${b.through ? " thru" : ""}`,
      `${b.phase || "-"}${b.reqSeq != null ? " #" + b.reqSeq : ""}`,
      `v${(b.v || 0).toFixed(1)} room${b.state === "drive" ? f(laneRoom(b)) : "-"} cx${f(b.cx)} cy${f(b.cy)}`,
    ];
    const x = b.cx - 60, y = b.cy - 56;
    lines.forEach((t, i) => { ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(x - 2, y + i * 12 - 9, 150, 12); ctx.fillStyle = "#ffe27a"; ctx.fillText(t, x, y + i * 12); });
  }
  for (const c of cars) {
    if (!c.heldT || c.heldT < 0.5) continue;
    ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(c.x - 2, c.y - 26, 80, 12);
    ctx.fillStyle = "#ff9a9a"; ctx.fillText(`held ${c.heldT.toFixed(1)}s`, c.x, c.y - 17);
  }
  ctx.restore();
}

function drawScene() {
  if (mapZoom >= 1) drawMap(1);
  else if (mapZoom > 0) {
    // the terminal shrinks into its map node while the map fades in over it
    const e = easeInOut(mapZoom), node = mapPos(termDef(G.activeTerminal).map);
    const k = lerp(1, 0.05, e);
    ctx.save();
    ctx.translate(lerp(W / 2, node.x, e), lerp(H / 2, node.y, e));
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    drawTerminalScene();
    ctx.restore();
    drawMap(e);
  } else drawTerminalScene();
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
  drawWalkway(nf);
  for (const tr of trees) drawTree(tr, nf);

  drawLot();
  drawSign();
  drawRestStop();
  drawRoads();
  for (const c of cars) {
    if (c.v > 0) { // rightward cars: the same drawing, mirrored
      ctx.save(); ctx.translate(c.x + 26, c.y); ctx.scale(-1, 1); ctx.translate(-(c.x + 26), -c.y);
      drawCar(c);
      ctx.restore();
    } else drawCar(c);
  }
  // Depth-sort buses and walking passengers together: people behind a bus are
  // occluded by it, while people in front naturally draw over it.
  const lotActors = [];
  for (const b of buses) lotActors.push({ y: b.cy - Math.sin(b.ang) * b.len / 2, draw: () => drawBusDir(b) });
  for (const b of buses) for (const p of b.pax)
    if (p.state !== "bus" && !isIndoorPax(p)) lotActors.push({ y: p.y, draw: () => drawPax(p) });
  lotActors.sort((a, b) => a.y - b.y);
  for (const actor of lotActors) actor.draw();

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
  const [top, bot] = skyColors(G.clock.time);
  const g = ctx.createLinearGradient(0, -offY, 0, GRASS.top);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(-offX, -offY, Wdyn, GRASS.top + offY);

  const dusk = Math.min(1, duskGlow(G.clock.time));
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
  if (G.clock.time >= 5 && G.clock.time <= 19) {
    const f = clamp((G.clock.time - 6) / 12, 0, 1), h = Math.sin(f * Math.PI);
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
    const f = clamp(((G.clock.time + 24 - 19) % 24) / 11, 0, 1);
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

  // Painted bus bays: the built spaces are bright, while future bays remain dim.
  const active = new Set(activeParkingSlots()), paint = `rgba(255, 214, 90, ${0.78 - nf * 0.2})`;
  ctx.textAlign = "center";
  ctx.font = "bold 16px system-ui";
  ctx.lineJoin = "round";
  BAY_SLOTS.forEach((s, i) => {
    const isOpen = active.has(i), l = s.cx - 36, r = s.cx + 36;
    ctx.strokeStyle = isOpen ? paint : `rgba(155, 165, 180, ${0.24 - nf * 0.08})`;
    ctx.lineWidth = isOpen ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(l, LOT.bot - 8); ctx.lineTo(l, LOT_NOSE); ctx.lineTo(r, LOT_NOSE); ctx.lineTo(r, LOT.bot - 8);
    ctx.stroke();
    ctx.fillStyle = mix("#c9ced6", "#40464f", nf * 0.7);
    rr(ctx, s.cx - 22, LOT_NOSE + 8, 44, 6, 2); ctx.fill();
    ctx.fillStyle = isOpen ? paint : `rgba(180, 188, 200, ${0.3 - nf * 0.1})`;
    ctx.fillText(isOpen ? String(activeParkingSlots().indexOf(i) + 1) : "·", s.cx, LOT.bot - 18);
  });
  ctx.lineJoin = "miter";

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
  ctx.fillText(termDef(G.activeTerminal).short || "DİNLENME TESİSİ", cx, by + 45);
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
// flank the centered doorway (frame x 841..861) with clear wall on both sides
const WC_WINDOWS = [[819, 137, 16, 15], [867, 137, 16, 15]];

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

// Walkway: pavement between the buildings' front walls and the bus lot. Drawn
// before the sign, lamps and lot so they stand on top of it.
function drawWalkway(nf) {
  ctx.fillStyle = mix("#cdc6b4", "#3b3e4a", nf * 0.7);
  ctx.fillRect(-offX, WALK_TOP, Wdyn, LOT.top - WALK_TOP);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(-offX, LOT.top - 2, Wdyn, 2);
}

function drawRestStop() {
  const nf = nightFactor(), now = performance.now();
  // the buildings are drawn in their own (higher) frame
  ctx.save();
  ctx.translate(BUILD_DX, -BUILD_LIFT);
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
  if (!LOKANTA_OPEN) {
    // Closed shutter: the diner is visible, but guests cannot enter it.
    ctx.fillStyle = "#765334";
    ctx.fillRect(681, 140, 18, 30);
    ctx.fillStyle = "#4c3524";
    for (let y = 143; y < 169; y += 5) ctx.fillRect(682, y, 16, 2);
    ctx.fillStyle = "#d92332";
    rr(ctx, 678, 146, 24, 9, 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 6px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("KAPALI", 690, 152.5);
  }
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
  ctx.fillStyle = mix("#d3d9e2", "#3a4250", nf * 0.6); // trim
  ctx.fillRect(842, 136, 18, 34);
  ctx.fillStyle = mix("#3a4458", "#161b26", nf * 0.6); // lintel
  rr(ctx, 840, 133, 22, 4, 1.5); ctx.fill();
  const dg = ctx.createLinearGradient(0, 138, 0, 170);
  dg.addColorStop(0, "#121725"); dg.addColorStop(1, "#2a3247");
  ctx.fillStyle = dg;
  ctx.fillRect(845, 138, 12, 32);
  ctx.fillStyle = "rgba(255,240,200,0.10)"; // faint light from inside
  ctx.fillRect(845, 160, 12, 10);
  ctx.fillStyle = mix("#b8c0cc", "#30384a", nf * 0.6); // step
  ctx.fillRect(840, 168, 22, 2);
  ctx.fillStyle = "#1d2333";
  rr(ctx, 818, 100, 66, 20, 5); ctx.fill();
  ctx.strokeStyle = "rgba(159,232,255,0.4)"; ctx.lineWidth = 1.5;
  rr(ctx, 818, 100, 66, 20, 5); ctx.stroke();
  ctx.fillStyle = "#9fe8ff";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("WC", 851, 114);
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
  ctx.restore();
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
    ctx.translate(sx + BUILD_DX, 170 - BUILD_LIFT);
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
  for (const [x, y, w, h] of [...DINER_WINDOWS, ...WC_WINDOWS]) ctx.fillRect(x + BUILD_DX, y - BUILD_LIFT, w, h);

  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowBlur = 10 * a;
  ctx.font = "bold 12px system-ui";
  ctx.shadowColor = "#ffb02e";
  ctx.fillStyle = "#ffd36b";
  ctx.fillText("LOKANTA", 705 + BUILD_DX, 105 - BUILD_LIFT);
  ctx.shadowColor = "#4fd8ff";
  ctx.fillStyle = "#b6f0ff";
  ctx.fillText("WC", 851 + BUILD_DX, 114 - BUILD_LIFT);
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
function drawHeldBill(cx, cy, u, color, d, rotation = 0) {
  const w = 16 * u, h = 8 * u, x = -w / 2, y = -h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
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
  ctx.font = `bold ${(3 * u).toFixed(1)}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(d, x + w - 1 * u, y + 3 * u);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawCounterIn() {
  const [dk, , dty] = deskXf();
  const d = { y: dty + COUNTER_IN.desk.y * dk };
  // the wooden teller counter: a raised guest-side ledge (guests stand behind
  // it) and your desktop running down to the bottom of the view, stopping
  // short of both side passages
  const { L, R } = counterBounds();
  const CW = R - L, B = H + offY;
  const top = d.y + 8;                                              // desktop starts under the ledge face
  const wood = ctx.createLinearGradient(0, top, 0, B);
  wood.addColorStop(0, "#7a5a32");
  wood.addColorStop(0.25, "#8f6b3c");
  wood.addColorStop(1, "#5e4426");
  ctx.fillStyle = wood;
  ctx.fillRect(L, top, CW, B - top);
  ctx.lineWidth = 1;
  for (let y = top + 22, k = 0; y < B; y += 34, k++) {              // plank seams + grain
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(L, y, CW, 1.5);
    ctx.fillStyle = "rgba(255, 228, 170, 0.07)";
    ctx.fillRect(L, y + 1.5, CW, 1);
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
  ctx.fillRect(L, top, CW, B - top);
  const ls = ctx.createLinearGradient(0, top, 0, top + 18);         // the ledge's shadow on the desk
  ls.addColorStop(0, "rgba(0, 0, 0, 0.45)");
  ls.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ls;
  ctx.fillRect(L, top, CW, 18);
  // the raised ledge: its top surface, then the face turned toward you
  ctx.fillStyle = "#b48d55";
  ctx.fillRect(L, d.y - 12, CW, 9);                               // ledge top
  ctx.fillStyle = "rgba(255, 240, 200, 0.4)";
  ctx.fillRect(L, d.y - 12, CW, 2);
  const face = ctx.createLinearGradient(0, d.y - 3, 0, top);
  face.addColorStop(0, "#8a6838");
  face.addColorStop(1, "#6c4f2b");
  ctx.fillStyle = face;
  ctx.fillRect(L, d.y - 3, CW, top - d.y + 3);                    // ledge face
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(L, d.y - 3, CW, 1);
  ctx.fillRect(L, top - 1, CW, 1);
  drawCounterTopArea(); // foreground occlusion keeps guests behind the counter edge
  const counterBackY = d.y - 11 - COUNTER_TOP_HEIGHT * deskK;
  for (const [x, dir] of [[L, 1], [R, -1]]) {                      // continuous cut ends from tabletop to front
    const eg = ctx.createLinearGradient(x, 0, x + dir * 10, 0);
    eg.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    eg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = eg;
    ctx.fillRect(Math.min(x, x + dir * 10), counterBackY, 10, B - counterBackY);
  }
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
  function drawDrawer() {
    softShadow(348, 372, 264, 152, 4, 14, 6);
    const mg = ctx.createLinearGradient(348, 0, 612, 0);            // brushed-metal till body
    mg.addColorStop(0, "#2f3542");
    mg.addColorStop(0.5, "#454d5e");
    mg.addColorStop(1, "#2c323e");
    ctx.fillStyle = mg;
    rr(ctx, 348, 372, 264, 152, 4); ctx.fill();                    // open drawer
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    rr(ctx, 348.5, 372.5, 263, 151, 4); ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(350, 373, 260, 2);
    ctx.fillStyle = "#12151d";
    ctx.fillRect(354, 378, 252, 134);
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
    ctx.fillStyle = "#cfd6e4";                                      // drawer pull
    rr(ctx, 466, 513, 28, 5, 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(468, 513.5, 24, 1);
    ctx.textAlign = "left";
  }
  withDesk("drawer", drawDrawer);
  withDesk("coins", drawCounterCoins); // loose change is always on the counter, independent of tea service
  // calculator, cologne
  if (hasCalc()) withDesk("calc", drawCalculator);
  if (hasCologne()) withDesk("bottle", drawBottle);
  if (hasTea()) {
    withDesk("tea", drawTea);
    withDesk("intercom", drawIntercom);
  }
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
function drawCalculator() {
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
  // the change still owed to the guest at the counter (000 until one is standing there)
  const g = facilities.C.queue[0];
  const atDesk = atPaySpot(g) && (g.state === "payC" || g.state === "doneC" || g.state === "dripC");
  ctx.fillText(String(atDesk ? Math.max(0, g.owed - g.changeGiven) : 0).padStart(3, "0"), 273, 416);
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
}

function drawBottle() {
  const b = COUNTER_IN.bottle;
  const f = S.bottle / bottleMax();
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
// Turkish coins: 1₺ bimetallic (silver center, brass ring), 50/25 kuruş silver, 10/5 kuruş brass
const COIN_1TL = { rx: 10, rim: "#c9a24a", face: "#c6ccd4" };
const COIN_SILVER = r => ({ rx: r, rim: "#b9bfc8", face: "#cfd4dc" });
const COIN_BRASS = r => ({ rx: r, rim: "#b48a3c", face: "#d2ad5c" });
function drawCoinStack(x, by, coins) {
  const t = 2.4;                                   // coin thickness
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath(); ctx.ellipse(x + 2, by + 1.5, coins[0].rx + 3, 4.5, 0, 0, 7); ctx.fill();
  coins.forEach((c, i) => {
    const y = by - i * t - t, ry = c.rx * 0.38;
    const jx = x;                                      // coins stack straight, without an uneven offset
    ctx.fillStyle = shade(c.rim, -0.4);            // milled edge
    ctx.beginPath(); ctx.ellipse(jx, y + t, c.rx, ry, 0, 0, Math.PI); ctx.fill();
    ctx.fillRect(jx - c.rx, y, c.rx * 2, t);
    ctx.fillStyle = shade(c.rim, -0.1);
    ctx.fillRect(jx - c.rx, y + 0.6, c.rx * 2, 0.7);
    ctx.fillStyle = c.rim;                         // face
    ctx.beginPath(); ctx.ellipse(jx, y, c.rx, ry, 0, 0, 7); ctx.fill();
    if (i === coins.length - 1) {
      ctx.fillStyle = c.face;
      ctx.beginPath(); ctx.ellipse(jx, y, c.rx * 0.7, ry * 0.7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)"; // sheen
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(jx, y, c.rx - 1.2, ry - 0.6, 0, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    }
  });
}

function drawCounterCoins() {
  // Loose change sits in its own spot, separate from the tea glass and intercom.
  drawCoinStack(733, 331, [COIN_SILVER(9.5), COIN_BRASS(9), COIN_SILVER(9), COIN_1TL]);
  drawCoinStack(750, 336, [COIN_SILVER(9.5), COIN_SILVER(9), COIN_BRASS(8.5), COIN_SILVER(9), COIN_BRASS(9), COIN_1TL]);
  drawCoinStack(767, 332, [COIN_BRASS(8), COIN_BRASS(7.5)]);
}

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
  const price = CONFIG.economy.teaPrice;
  if (!applyTransaction("tea", -price, boundId, "çay")) { toast(`🍵 Çay için kasada ${fmtTL(price)} yok`, "bad"); return; }
  S.teaOrder = rand(TEA_DELIVERY[0], TEA_DELIVERY[1]);
  toast(`🍵 Çay geliyor! (${fmtTL(price)})`, "");
}

function drawCounterInPrompts() {
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";                         // legible on the wooden desk
  ctx.shadowBlur = 3;
  ctx.textAlign = "center";
  const front = facilities.C.queue[0];
  if (atPaySpot(front)) {
    if (hasCologne() && !front.cologne && S.bottle > 0 && (front.state === "payC" || front.state === "doneC")) {
      const b = deskRect(COUNTER_IN.bottle, "bottle");
      ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("kolonya!", b.x + b.w / 2, b.y - 6);
    }
    if (front.state === "payC" && front.changeGiven < front.owed) {
      const c = deskRect(COUNTER_IN.chips[0], "drawer");
      ctx.fillStyle = `rgba(255, 211, 107, ${pulse})`;
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("para üstü!", c.x + c.w / 2, c.y - 8);
    }
  }
  ctx.restore();
  ctx.textAlign = "left";
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
function drawHoseLine(ox, oy, px, py, bend = -60) {
  hoseStroke(o => {
    ctx.beginPath();
    ctx.moveTo(ox, oy + o);
    ctx.quadraticCurveTo((ox + px) / 2 + bend, (oy + py) / 2 + 40 + o, px - 6, py - 6 + o);
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
    ctx.beginPath(); ctx.arc(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad, (1.4 + (1 - t) * 1.4) * SPRAY_RADIUS_K, 0, 7); ctx.fill();
  }
  for (let k = 0; k < 3; k++) {
    const t = (now / 650 + k / 3) % 1;
    ctx.fillStyle = `rgba(160, 220, 255, ${(0.6 * (1 - t)).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(px - 11 + k * 11, py + 14 + t * 34, 1.6 * SPRAY_RADIUS_K, (3 + t * 2) * SPRAY_RADIUS_K, 0, 0, 7); ctx.fill();
  }
}

/* --------------------- WC interior (behind the counter) ------------- */
/* A cleaning-hose station: a wall faucet with a coiled hose at one end of the
 * stall row (left, or mirrored on the right). Click it to pick that hose up;
 * hold the mouse and drag it over a stall
 * to spray (cleanApply). It pulses amber while any stall needs cleaning. */
function drawHoseStation(st) {
  const held = toolInHand === st, m = st.right ? -1 : 1; // the right station is drawn mirrored
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  const needsClean = activeStalls().some(i => S.stallClean[i] < 60);
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
  if (!held) { // the coil hangs off the tap until you pick it up
    hoseStroke(o => { ctx.beginPath(); ctx.moveTo(fcx, fcy + 19 + o); ctx.quadraticCurveTo(fcx + 14 * m, base - 14 + o, fcx + 16 * m, base - 16 + o); });
    for (let k = 0; k < 3; k++) { // flat loops piled on the floor, bottom one first
      const cy = base - k * 6, rx = 22 - k * 3;
      hoseStroke(o => { ctx.beginPath(); ctx.ellipse(fcx, cy + o, rx, 7 - k, 0, 0, 7); });
    }
  } else { // a slow drip from the open tap
    const t = (now / 900) % 1;
    ctx.fillStyle = `rgba(140, 210, 255, ${0.85 * (1 - t * 0.6)})`;
    ctx.beginPath(); ctx.ellipse(fcx, fcy + 22 + t * 22, 1.8, 2.6, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = held ? `rgba(120, 225, 255, ${0.6 + 0.4 * pulse})`
    : needsClean ? `rgba(255, 211, 107, ${0.5 + 0.5 * pulse})`
    : "rgba(226,235,248,0.8)";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(held ? "ELİNDE" : cleaningTool().label, fcx, st.y + 8);
  ctx.textAlign = "left";
}

// The drawn body box of a pax at a given draw scale k (the counter room's 5x
// close-up, or the lot's 1x) with feet anchored at p.x, p.y — a touch looser
// than the sprite so grazing counts as in front.
// Depth scale in the WC room: half size at the stall row's floor, full 5x at the counter.
// The guest right at the counter (either pay spot) looms much larger — eased
// in over the last FRONT_R px of their walk so nobody pops in size.
const FRONT_BOOST = 0.6, FRONT_R = 25;
function wcPaxK(y, x) {
  const y0 = stallSy(224), frontY = counterFrontDepthY();
  const t = (y - y0) / (frontY - y0);
  const k = clamp(2.5 + 2.5 * t, 2.5, 6);
  if (x == null) return k;
  const d = Math.min(Math.hypot(x - PAY_SPOT.x, y - frontY), Math.hypot(x - PAY_SPOT2.x, y - frontY));
  return k * (1 + FRONT_BOOST * Math.max(0, 1 - d / FRONT_R));
}

function paxBox(p, k = wcPaxK(p.y, p.x)) {
  const s = k * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale);
  return { x: p.x - 5.5 * s, y: p.y - 19 * s, w: 11 * s, h: 19.5 * s };
}

// The nearest catchable runaway whose drawn body (depth-scaled, see wcPaxK,
// with pad) contains the point: still inside the WC, running for
// the exit (leaveC). Paying, queued, paid and already-outside guests are never
// targets — and nobody is while a caught guest is still scrubbing.
function runawayAt(x, y, pad = 2) {
  if (scrub) return null;
  let best = null, bd = Infinity;
  for (const b of buses) for (const p of b.pax) {
    if (!p.runaway || p.state !== "leaveC") continue;
    const r = paxBox(p);
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
    // the closed leaf is art x 1..51, y 106..246 in stall space — ends at the stall floor
    if (b.x < stallSx(stallEdge(i, 51)) && b.x + b.w > stallSx(stallEdge(i, 1)) && b.y < stallSy(246) && b.y + b.h > stallSy(106)) return true;
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
    const dk = wcPaxK(pose.y), s = dk * ((PAX_TYPES[p.type] || PAX_TYPES.m).scale);
    // suds left on every bowl already scrubbed
    stallSpace();
    for (const leg of scrub.legs) {
      if (t < leg.t1) continue;
      const i = leg.stall, bx = stallLx(i);
      stallWiden(i);
      for (let k = 0; k < 7; k++) {
        const u = ((i * 7 + k * 13) % 10) / 10;
        ctx.fillStyle = `rgba(245, 252, 255, ${0.6 + 0.3 * (k % 2)})`;
        ctx.beginPath();
        ctx.arc(bx + 12 + u * 28, 206 - (k % 3) * 5 + Math.sin(t * 6 + k + i) * 1.5, 2.5 + (k % 3), 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
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
    drawPax({ ...p, x, y }, dk);
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
    const B = { x: 340, y: 124, w: 280, h: 44 }; // roomy: padding around the text and the progress bar
    ctx.fillStyle = "rgba(13, 17, 32, 0.88)";
    rr(ctx, B.x, B.y, B.w, B.h, 8); ctx.fill();
    ctx.strokeStyle = "rgba(120, 225, 255, 0.6)"; ctx.lineWidth = 1.5;
    rr(ctx, B.x, B.y, B.w, B.h, 8); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#cfefff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🧽 YAKALANDI — bütün tuvaletleri ovuyor", B.x + B.w / 2, B.y + 16);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, B.x + 16, B.y + 30, B.w - 32, 6, 3); ctx.fill();
    ctx.fillStyle = "#57e08a";
    rr(ctx, B.x + 16, B.y + 30, (B.w - 32) * (t / SCRUB_TIME), 6, 3); ctx.fill();
    return;
  }
  // the sequence just finished: every toilet is spotless
  const age = performance.now() - scrubDoneAt;
  if (scrubDoneAt && age < 2000) {
    ctx.globalAlpha = 1 - age / 2000;
    const B = { x: 340, y: 124, w: 280, h: 44 }; // roomy: padding around the text and the progress bar
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

// An unbuilt bay (stall space, inside stallWiden): planked over until the WC is upgraded.
function drawBoardedBay(i, bx) {
  ctx.fillStyle = "#23283a";
  ctx.fillRect(bx, 108, 52, 138);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx + 2, 110, 48, 134); ctx.clip();
  for (let k = 0; k < 6; k++) {
    const y = 116 + k * 22;
    ctx.fillStyle = k % 2 ? "#6e5638" : "#7b6040";
    ctx.save();
    ctx.translate(bx + 26, y + 8);
    ctx.rotate((grimeRnd(i, k) - 0.5) * 0.12);
    ctx.fillRect(-28, -8, 56, 15);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-28, 6, 56, 1.5);
    ctx.fillStyle = "#3b4048";
    ctx.beginPath(); ctx.arc(-21, -1, 1.4, 0, 7); ctx.arc(21, -1, 1.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = "rgba(255, 211, 107, 0.85)";
  ctx.font = "bold 8px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("KAPALI", bx + 26, 180);
  ctx.textAlign = "left";
}

// The primitive alaturka (squat) toilet, in stall space inside stallWiden: a
// floor pan with ribbed footrests, a high pull-chain cistern, a wall tap and
// the plastic jug. Grime layers fade in with dirt like drawStallGrime's.
function drawAlaturka(i, bx, dirty) {
  const cx = bx + 22; // the open door leaf covers bx+44..52
  const ramp = (from, to) => clamp((dirty - from) / (to - from), 0, 1);
  const r = k => grimeRnd(i, k);
  const porcelain = ctx.createLinearGradient(cx - 18, 0, cx + 18, 0);
  porcelain.addColorStop(0, "#c3c7cc"); porcelain.addColorStop(0.4, "#f3f3ef"); porcelain.addColorStop(1, "#b3b7bd");
  // high cistern, its chain and the down pipe
  ctx.fillStyle = "#9aa4b2";
  ctx.fillRect(bx + 13, 126, 2, 104);
  ctx.fillStyle = porcelain;
  rr(ctx, bx + 9, 116, 24, 11, 2); ctx.fill();
  ctx.strokeStyle = "#8d96a6"; ctx.setLineDash([1.5, 1.5]);
  ctx.beginPath(); ctx.moveTo(bx + 29, 127); ctx.lineTo(bx + 29, 158); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#cfd6e2";
  rr(ctx, bx + 27, 158, 4, 6, 1.5); ctx.fill();
  // wall tap and the jug beneath it
  ctx.fillStyle = "#c9d0da";
  rr(ctx, bx + 34, 196, 7, 3, 1); ctx.fill();
  ctx.fillRect(bx + 39, 199, 2, 4);
  ctx.fillStyle = "#d2473c";
  rr(ctx, bx + 33, 222, 9, 13, 2); ctx.fill();
  ctx.strokeStyle = "#a8342b"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(bx + 42, 228, 3, -1.2, 1.2); ctx.stroke();
  ctx.lineWidth = 1;
  // the squat pan, as in a real one: a raised white ceramic body with a shallow basin,
  // a dark drain hole, and ribbed foot pads on either side
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(cx, 240.5, 22, 4.5, 0, 0, 7); ctx.fill();
  const body = ctx.createLinearGradient(0, 226, 0, 241);
  body.addColorStop(0, "#fbfbf9"); body.addColorStop(1, "#c9cdd2");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx - 14, 226); ctx.lineTo(cx + 14, 226);
  ctx.quadraticCurveTo(cx + 19, 226, cx + 20, 232);
  ctx.lineTo(cx + 20, 238); ctx.quadraticCurveTo(cx + 20, 241, cx + 17, 241);
  ctx.lineTo(cx - 17, 241); ctx.quadraticCurveTo(cx - 20, 241, cx - 20, 238);
  ctx.lineTo(cx - 20, 232); ctx.quadraticCurveTo(cx - 19, 226, cx - 14, 226);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;   // rim highlight
  ctx.beginPath(); ctx.moveTo(cx - 13, 227); ctx.lineTo(cx + 13, 227); ctx.stroke();
  // the basin: a shallow dish with a dark drain hole towards the back
  const basin = ctx.createRadialGradient(cx, 231, 1, cx, 231, 10);
  basin.addColorStop(0, "#e2e6e9"); basin.addColorStop(1, "#cfd5da");
  ctx.fillStyle = basin;
  ctx.beginPath(); ctx.ellipse(cx, 231, 10, 3.8, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(cx, 231, 10, 3.8, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = "#23272e";
  ctx.beginPath(); ctx.ellipse(cx, 230.6, 3, 1.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath(); ctx.ellipse(cx, 229.8, 3.4, 0.6, 0, 0, 7); ctx.fill();
  // ribbed foot pads either side, with the grooves running across as on the real pan
  for (const fx of [cx - 19, cx + 11]) {
    ctx.fillStyle = "#f2f4f3";
    rr(ctx, fx, 232, 8, 8, 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let k = 0; k < 4; k++) ctx.fillRect(fx + 1, 233 + k * 1.8, 6, 0.7);
  }
  if (dirty <= 0.08) return;
  // brown stain ring in the basin
  let a = ramp(0.1, 0.6);
  ctx.strokeStyle = `rgba(110, 78, 34, ${a * 0.85})`; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(cx, 236.5, 7.5, 2.7, 0, 0, 7); ctx.stroke();
  ctx.lineWidth = 1;
  // a spreading puddle around the pan
  a = ramp(0.25, 0.75);
  if (a > 0) {
    ctx.fillStyle = `rgba(175, 150, 60, ${a * 0.4})`;
    ctx.beginPath(); ctx.ellipse(cx + (r(70) - 0.5) * 8, 242, 10 + dirty * 10, 2.6, 0, 0, 7); ctx.fill();
  }
  // splashes on the footrests and smudges on the wall
  a = ramp(0.4, 0.9);
  if (a > 0) {
    ctx.fillStyle = `rgba(150, 110, 40, ${a * 0.75})`;
    for (let j = 0; j < 3 + Math.round(dirty * 4); j++)
      { ctx.beginPath(); ctx.ellipse(cx - 16 + r(60 + j) * 32, 233 + r(65 + j) * 6, 1.5, 0.9, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = `rgba(70, 55, 30, ${a * 0.45})`;
    ctx.beginPath(); ctx.ellipse(bx + 8 + r(80) * 8, 150 + r(81) * 40, 3.5, 6, 0, 0, 7); ctx.fill();
  }
  // used paper on the floor
  if (dirty > 0.5) {
    ctx.fillStyle = "#e6e1d2";
    for (let j = 0; j < (dirty > 0.75 ? 3 : 1); j++)
      { ctx.beginPath(); ctx.ellipse(bx + 4 + r(100 + j) * 36, 241 + r(105 + j) * 3, 3, 2, 0, 0, 7); ctx.fill(); }
  }
  // flies over the pan
  if (dirty > 0.6) {
    const t = performance.now() / 1000;
    ctx.fillStyle = "#15171c";
    for (let j = 0; j < (dirty > 0.85 ? 3 : dirty > 0.72 ? 2 : 1); j++) {
      const sp = 2 + r(120 + j) * 2, ph = r(125 + j) * 7;
      ctx.beginPath(); ctx.arc(cx + Math.sin(t * sp + ph) * 12, 222 + Math.cos(t * sp * 1.3 + ph) * 7, 1.1, 0, 7); ctx.fill();
    }
  }
}

function toolStations() {
  return cleaningTool() === CONFIG.cleaningTools.hose ? [COUNTER_IN.hose] : [COUNTER_IN.bucket];
}

// A bucket cleaning station (hand brush or mop) at one end of the stall row —
// the hose's counterpart before the WC has running-water equipment.
function drawBucketStation(st) {
  const tool = cleaningTool(), held = toolInHand === st;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  const needsClean = activeStalls().some(i => S.stallClean[i] < 60);
  const cx = st.x + st.w / 2, base = st.y + st.h - 6;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(cx, base + 2, 24, 5, 0, 0, 7); ctx.fill();
  if (!held) { // the tool rests in its bucket until you pick it up
    if (tool === CONFIG.cleaningTools.mop) {
      ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx + 4, base - 30); ctx.lineTo(cx + 14, st.y + 14); ctx.stroke();
      ctx.lineCap = "butt"; ctx.lineWidth = 1;
    } else {
      if (tool === CONFIG.cleaningTools.longBrush) {
        ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(cx + 10, base - 44); ctx.lineTo(cx + 16, st.y + 14); ctx.stroke();
        ctx.lineCap = "butt"; ctx.lineWidth = 1;
      }
      ctx.fillStyle = "#8a5a2b";
      rr(ctx, cx + 2, base - 44, 16, 7, 3); ctx.fill();
      ctx.fillStyle = "#e7d27a";
      ctx.fillRect(cx + 4, base - 37, 12, 6);
    }
  }
  const bk = ctx.createLinearGradient(cx - 18, 0, cx + 18, 0);
  bk.addColorStop(0, "#2a5a86"); bk.addColorStop(0.5, "#3c7bb5"); bk.addColorStop(1, "#2a5a86");
  ctx.fillStyle = bk;
  ctx.beginPath();
  ctx.moveTo(cx - 18, base - 30); ctx.lineTo(cx + 18, base - 30); ctx.lineTo(cx + 14, base); ctx.lineTo(cx - 14, base);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#cfefff";
  ctx.beginPath(); ctx.ellipse(cx, base - 30, 18, 4, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = "#9aa4b2"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, base - 30, 16, Math.PI, 0); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = held ? `rgba(120, 225, 255, ${0.6 + 0.4 * pulse})`
    : needsClean ? `rgba(255, 211, 107, ${0.5 + 0.5 * pulse})`
    : "rgba(226,235,248,0.8)";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(held ? "ELİNDE" : tool.label, cx, st.y + 8);
  ctx.textAlign = "left";
}

// The hand brush / mop at the pointer; suds where it scrubs a free stall.
// Visual only: suds and spray droplets are drawn this much bigger; the reach that
// actually cleans (CONFIG.cleaningTools) is unchanged.
const SUDS_RADIUS_K = 3.5, SPRAY_RADIUS_K = 3.5;
// The suds are drawn at (fx, fy) — the toilet being cleaned — not on the tool.
function drawHandTool(px, py, scrubbing, now, fx = px, fy = py) {
  if (scrubbing) {
    for (let k = 0; k < 7; k++) {
      const f = frac(now / 700 + k / 7);
      ctx.fillStyle = `rgba(250, 253, 255, ${0.85 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(fx + Math.sin(k * 2.1 + f * 5) * 10, fy - f * 22, (1.8 + (k % 3)) * SUDS_RADIUS_K, 0, 7); ctx.fill();
    }
  }
  const wob = scrubbing ? Math.sin(now / 45) * 3 : 0;
  ctx.save();
  ctx.translate(px + wob, py);
  ctx.rotate(-0.5);
  if (cleaningTool() === CONFIG.cleaningTools.mop) {
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -60); ctx.stroke();
    ctx.strokeStyle = "#dfe6ee"; ctx.lineWidth = 3;
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 2, -6); ctx.lineTo(k * 3.5, 4); ctx.stroke(); }
    ctx.lineCap = "butt"; ctx.lineWidth = 1;
  } else {
    if (cleaningTool() === CONFIG.cleaningTools.longBrush) {
      ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -56); ctx.stroke();
      ctx.lineCap = "butt"; ctx.lineWidth = 1;
    }
    ctx.fillStyle = "#8a5a2b";
    rr(ctx, -9, -10, 18, 8, 3); ctx.fill();
    ctx.fillStyle = "#e7d27a";
    ctx.fillRect(-8, -2, 16, 6);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let k = 0; k < 5; k++) ctx.fillRect(-7 + k * 3.4, -2, 0.8, 6);
  }
  ctx.restore();
}

function drawModernToilet(i, bx, dirty) {
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

}

// The WC camera: a zoom about the stall row's middle (bay mid-height), eased by
// wcZoom. Everything in the interior is drawn in base coords and mapped through
// this, so wcCameraToBase() is its exact inverse for pointer input.
function wcCamera() {
  const e = easeInOut(wcZoom), k = 1 + (WC_ZOOM_S - 1) * e;
  const fx = -offX + Wdyn / 2, fy = stallSy(177);   // focus: the stall row's centre
  // the focus eases toward the screen centre, but never far enough to pull the
  // scene's top edge (base y = -offY) below the screen top: the canvas isn't
  // cleared each frame, so an unpainted band would show stale pixels
  const ty = Math.min(e * (H / 2 - k * fy), (k - 1) * offY);
  return { k, tx: e * (fx - k * fx), ty };
}
function wcCameraToBase(x, y) {
  const c = wcCamera();
  return { x: (x - c.tx) / c.k, y: (y - c.ty) / c.k };
}

function drawWCInterior() {
  if (wcZoom <= 0) { drawWCScene(); drawBrushTutorial(); return; }
  const c = wcCamera();
  ctx.save();
  ctx.translate(c.tx, c.ty);
  ctx.scale(c.k, c.k);
  drawWCScene();
  drawBrushTutorial();
  ctx.restore();
}

// The brush tutorial, drawn in WC scene coords (inside the zoom camera):
// 2 real s after stepping in, a tap cue on the brush bucket; once the brush is in
// hand and the camera has zoomed in, a bubble on the left toilet with its
// cleanliness until it reaches 100%.
// Dims the room like the arrival popup, but with a soft spotlight: the dim ramps
// up over FEATHER px around the lit rect instead of stopping at a hard edge.
// Built from non-overlapping annuli (no ctx.filter, which some browsers lack).
// Built on an offscreen layer: the dim fills the whole canvas, then the lit rect is
// erased with a Gaussian-blurred shadow, so the edge falls off smoothly with no seams.
let spotLayer = null;
function spotlightDim(x, y, w, h, pad = 6, feather = 40) {
  const DIM = 0.76;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!spotLayer) spotLayer = document.createElement("canvas");
  if (spotLayer.width !== W || spotLayer.height !== H) { spotLayer.width = W; spotLayer.height = H; }
  const g = spotLayer.getContext("2d");
  // map scene coords to device pixels with the current transform (scale only, as drawn here)
  const m = ctx.getTransform();
  const dx = (px) => m.a * px + m.e, dy = (py) => m.d * py + m.f;
  const k = Math.hypot(m.a, m.b);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.shadowColor = "transparent";
  g.clearRect(0, 0, W, H);
  g.fillStyle = `rgba(5, 8, 16, ${DIM})`;
  g.fillRect(0, 0, W, H);
  // erase only the blurred shadow of the lit rect: the shape itself is drawn off-canvas,
  // so there is no hard inner edge — brightness falls off across the box's border
  const rx = dx(x - pad), ry = dy(y - pad), rw = (w + 2 * pad) * m.a, rh = (h + 2 * pad) * m.d;
  const OFF = W * 2;
  g.globalCompositeOperation = "destination-out";
  g.shadowColor = "rgba(0, 0, 0, 1)";
  g.shadowBlur = feather * k;
  g.shadowOffsetX = OFF; g.shadowOffsetY = 0;
  g.fillStyle = "#000";
  g.fillRect(rx - OFF, ry, rw, rh);
  g.shadowOffsetX = 0;
  g.shadowColor = "transparent";
  g.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(spotLayer, 0, 0);
  ctx.restore();
}

function drawBrushTutorial() {
  if (arrivalInfoOpen || modalOpen) return;
  const tutBill = changeTutNext();
  if (tutBill != null) { // change tutorial: the hand taps the bill to hand back next
    const r = deskRect(chipHit(COUNTER_IN.chips.find(c => c.d === tutBill)), "drawer");
    // same dim as the brush cue: the room darkens with the tapped bill left bright
    spotlightDim(r.x, r.y, r.w, r.h);
    drawTapCue(r.x + r.w / 2, r.y + r.h * 0.4);
    return;
  }
  if (!brushTutPending()) return;
  if (!toolInHand) {
    if (wcZoom > 0 || performance.now() - wcEnteredAt < BRUSH_CUE_DELAY) return;
    const st = toolStations()[0];
    // while the hand asks for the brush the room dims like the arrival popup,
    // with the brush bucket left bright; once it is in hand the dim goes away
    spotlightDim(st.x, st.y, st.w, st.h);
    drawTapCue(st.x + st.w / 2, st.y + st.h - 8); // fingertip near the foot of the bucket: the hand hangs below, leaving the brush and cup visible
    return;
  }
  if (wcZoom < 0.95) return; // wait for the zoom to settle
  const i = brushTutStall(), bay = stallBay(i), clean = S.stallClean[i];
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
  ctx.save();
  // soft pulsing frame around the toilet
  ctx.strokeStyle = `rgba(255, 211, 107, ${0.55 + 0.4 * pulse})`;
  ctx.lineWidth = 1.5;
  rr(ctx, bay.x - 3, bay.y - 3, bay.w + 6, bay.h + 6, 5); ctx.stroke();
  // the bubble, just below the toilet, pointing up at it
  const w = 156, h = 50, tail = 6;
  const cx = bay.x + bay.w / 2;
  const x = clamp(cx - w / 2, -offX + 4, Wdyn - offX - w - 4), y = bay.y + bay.h + 8 + tail;
  ctx.fillStyle = "rgba(16, 22, 35, 0.96)";
  ctx.beginPath();
  ctx.moveTo(cx - tail, y + 0.5); ctx.lineTo(cx, y - tail); ctx.lineTo(cx + tail, y + 0.5);
  ctx.fill();
  rr(ctx, x, y, w, h, 7); ctx.fill();
  ctx.strokeStyle = "#f2c66d"; ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 7); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd36b"; ctx.font = "bold 10px system-ui";
  ctx.fillText("Kirli tuvalet", x + w / 2, y + 10);
  ctx.fillStyle = "#f4f6fb"; ctx.font = "8px system-ui";
  ctx.fillText("Fırçayı tuvaletin üzerinde sürükle", x + w / 2, y + 23);
  // cleanliness bar
  const bx = x + 10, by = y + 34, bw = w - 44, bh = 6;
  ctx.fillStyle = "#0d1120"; rr(ctx, bx, by, bw, bh, 3); ctx.fill();
  ctx.fillStyle = clean > 95 ? "#5ad07a" : "#ffd36b";
  rr(ctx, bx, by, Math.max(bh, bw * clean / 100), bh, 3); ctx.fill();
  ctx.fillStyle = "#f4f6fb"; ctx.font = "bold 8px system-ui"; ctx.textAlign = "right";
  ctx.fillText(gameLanguage === "en" ? `${Math.floor(clean)}%` : `%${Math.floor(clean)}`, x + w - 8, by + bh / 2 + 0.5);
  ctx.restore();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawWCScene() {
  // floor
  ctx.fillStyle = "#262b36";
  ctx.fillRect(-offX, -offY, Wdyn, H + 2 * offY);
  const yWall = stallSy(246); // where the back wall meets the floor
  // back wall: flat at one depth, so its tiles are uniform
  ctx.fillStyle = "#454d60";
  ctx.fillRect(-offX, -offY, Wdyn, yWall + offY);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = yWall; y >= -offY; y -= 14) { ctx.moveTo(-offX, y); ctx.lineTo(Wdyn - offX, y); }
  for (let x = Wdyn / 2 - offX - Math.ceil(Wdyn / 28) * 14; x <= Wdyn - offX; x += 14) { ctx.moveTo(x, -offY); ctx.lineTo(x, yWall); }
  ctx.stroke();
  ctx.fillStyle = "#1c202a"; // skirting where wall meets floor
  ctx.fillRect(-offX, yWall - 3, Wdyn, 3);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  // tiles share the guests' depth scale (wcPaxK): 48 px at the counter, shrinking
  // linearly toward a horizon above the stall row where the scale would hit 0
  {
    const TILE = 48, y0 = stallSy(224), yRef = counterFrontDepthY();
    const yh = 2 * y0 - yRef, dRef = yRef - yh, vx = Wdyn / 2 - offX;
    const yTop = yWall, yBot = H + offY, r = 1 + TILE / dRef;
    ctx.beginPath();
    for (let d = dRef; yh + d <= yBot; d *= r) { ctx.moveTo(-offX, yh + d); ctx.lineTo(Wdyn - offX, yh + d); }
    for (let d = dRef / r; yh + d >= yTop; d /= r) { ctx.moveTo(-offX, yh + d); ctx.lineTo(Wdyn - offX, yh + d); }
    const sTop = (yTop - yh) / dRef, sBot = (yBot - yh) / dRef;
    const n = Math.ceil(Wdyn / 2 / (TILE * sTop)) + 1;
    for (let i = -n; i <= n; i++) {
      const u = (i + 0.5) * TILE;
      ctx.moveTo(vx + u * sTop, yTop); ctx.lineTo(vx + u * sBot, yBot);
    }
    ctx.stroke();
  }
  // the stall row across the top of the room (drawn in stall space)
  stallSpace();
  ctx.fillStyle = "#3d465e";
  rr(ctx, 0, 84, 324, 162, 6); ctx.fill();
  rr(ctx, 320 + STALL_AISLE, 84, 324, 162, 6); ctx.fill();
  // A small fee sign hangs in the central aisle between the two rows of toilets.
  ctx.fillStyle = "#3b2020";
  rr(ctx, 327, 119, 74, 48, 3); ctx.fill();
  ctx.fillStyle = "#d92332";
  rr(ctx, 330, 122, 68, 42, 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("WC", 364, 133.5);
  ctx.fillText("20₺", 364, 152.5);
  for (let i = 0; i < WC_STALLS; i++) {
    const bx = stallLx(i);
    const s = facilities.T.spots[i];
    const dirty = 1 - S.stallClean[i] / 100;
    stallWiden(i);
    if (!stallActive(i)) { drawBoardedBay(i, bx); ctx.restore(); continue; }
    // inside the cubicle: its own tiled back wall in shadow, then a strip of floor
    ctx.fillStyle = "#2c3343";
    ctx.fillRect(bx, 108, 52, 120);
    ctx.fillStyle = "#1d212b";
    ctx.fillRect(bx, 228, 52, 18);
    ctx.fillStyle = "#14171f";
    ctx.fillRect(bx, 226, 52, 2);
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 118; y < 226; y += 12) { ctx.moveTo(bx, y); ctx.lineTo(bx + 52, y); }
    for (let x = bx + 6.5; x < bx + 52; x += 13) { ctx.moveTo(x, 108); ctx.lineTo(x, 226); }
    ctx.moveTo(bx, 237); ctx.lineTo(bx + 52, 237);
    ctx.stroke();
    // this stall's cleanliness bar — pinned to the top of each toilet
    ctx.fillStyle = "#0d1120";
    rr(ctx, bx + 6, 94, 40, 8, 2); ctx.fill();
    const f = S.stallClean[i] / 100;
    if (f > 0.01) {
      ctx.fillStyle = f > 0.6 ? "#5ad07a" : f > 0.3 ? "#ffd36b" : "#ff6b6b";
      rr(ctx, bx + 6, 94, 40 * f, 8, 2); ctx.fill();
    }
    if (toiletDef().style === "alaturka") drawAlaturka(i, bx, dirty);
    else drawModernToilet(i, bx, dirty);
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
    ctx.restore();
  }
  ctx.restore();
  const drawStation = cleaningTool() === CONFIG.cleaningTools.hose ? drawHoseStation : drawBucketStation;
  for (const st of toolStations()) drawStation(st);
  if (toiletDef().auto) { // what the automation is doing, under the left station
    const st = COUNTER_IN.hose, broken = systemFailed(term(), "toilet");
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = broken ? "#ff6b6b" : "#7dffa8";
    ctx.fillText(broken ? "⚠ OTOMASYON ARIZALI" : toiletDef().autoChangeSec ? "🤖 OTO TEMİZLİK + GİŞE" : "🤖 OTO TEMİZLİK", st.x + st.w / 2, st.y + st.h + 14);
    ctx.textAlign = "left";
  }
  // the guests — scaled by depth (wcPaxK)
  // (whoever's turn it is at the counter is held back and drawn on top of everyone)
  const atCounter = p => p.state === "payC" || p.state === "doneC" || p.state === "dripC" || p.state === "selfDripC" || p.state === "payC2";
  for (const b of buses) for (const p of b.pax)
    if (isIndoorPax(p) && p.state !== "scrubC" && !atCounter(p)) drawPax(p, wcPaxK(p.y, p.x));
  // the stall doors close while someone is inside — drawn AFTER the guests so
  // the closed leaf hides the person (and the grime) from the counter side
  // Drawn in screen space (not the stretched stall space) so corners, the
  // handle and the lamp keep their shape however wide the cabin gets.
  for (let i = 0; i < WC_STALLS; i++) {
    if (!stallDoorClosed(i)) continue; // free + walk-in stalls show their ajar leaf above
    const x0 = stallSx(stallEdge(i, 1)), x1 = stallSx(stallEdge(i, 51));
    const y0 = stallSy(106), y1 = stallSy(246);
    const w = x1 - x0, h = y1 - y0, k = STALL_K;
    const leaf = ctx.createLinearGradient(x0, 0, x1, 0);
    leaf.addColorStop(0, "#505b78"); leaf.addColorStop(1, "#3f4862");
    ctx.fillStyle = leaf;
    rr(ctx, x0, y0, w, h, 4); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    rr(ctx, x0, y0, w, h, 4); ctx.stroke();
    // two recessed panels
    const px = x0 + 8 * k, pw = w - 16 * k;
    for (const [py, ph] of [[y0 + 18 * k, 50 * k], [y0 + 76 * k, 54 * k]]) {
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      rr(ctx, px, py, pw, ph, 3); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      rr(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, 3); ctx.stroke();
    }
    // hinges on the right, a lever handle on the left
    ctx.fillStyle = "#8d96a6";
    ctx.fillRect(x1 - 4, y0 + 14 * k, 3, 10 * k);
    ctx.fillRect(x1 - 4, y1 - 24 * k, 3, 10 * k);
    ctx.fillStyle = "#cfd6e4";
    ctx.beginPath(); ctx.arc(x0 + 7 * k, y0 + 72 * k, 3.2, 0, 7); ctx.fill();
    rr(ctx, x0 + 7 * k - 1.5, y0 + 72 * k - 1.5, 12, 3, 1.5); ctx.fill();
    // "in use" lamp
    ctx.fillStyle = "rgba(255,107,107,0.25)";
    ctx.beginPath(); ctx.arc((x0 + x1) / 2, y0 + 9 * k, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath(); ctx.arc((x0 + x1) / 2, y0 + 9 * k, 4, 0, 7); ctx.fill();
  }
  // guests passing IN FRONT of a closed door draw above the leaf — the stall's
  // own occupant is excluded, so they stay hidden behind their door
  for (const b of buses) for (const p of b.pax)
    if (isIndoorPax(p) && p.state !== "scrubC" && !atCounter(p) && paxInFrontOfClosedDoor(p)) drawPax(p, wcPaxK(p.y, p.x));
  for (const b of buses) for (const p of b.pax) if (atCounter(p)) drawPax(p, wcPaxK(p.y, p.x));
  // the counter (first-person view) is painted over the guests, so whoever
  // stands at the pay spot is seen behind its ledge, not on top of it
  drawCounterIn();
  drawCounterInPrompts();
  // draw bills on top of the counter
  for (const b of buses) for (const p of b.pax) {
    if (atCounter(p) && !receiptFlightEnds.has(p)) {
      const x = p.x;
      if (holdsBill(p) || p.state === "dripC")
        drawHeldBill(p.auto ? counterExactBillX() : x + COUNTER_BILL_OFFSET, counterTopBillY(), COUNTER_BILL_U, BILL_COLORS[p.bill] || "#c9c2a8", p.bill, Math.PI / 2);
      // Returned change is stacked on the counter top beside the guest's bill.
      if (["payC", "doneC", "dripC"].includes(p.state)) {
        (p.receivedChangeNotes || []).forEach((d, i) =>
          drawHeldBill(changeNoteX(x, i), counterTopBillY(), COUNTER_BILL_U, BILL_COLORS[d] || "#c9c2a8", d, Math.PI / 2));
      }
    }
  }
  drawChangeBillFlights();
  // the caught runaway scrubs in front of everything (drawn from the sequence
  // itself, so they stay visible even if their bus has already pulled out)
  drawScrub();
  // wavy stink lines rise only from the stalls that are actually dirty
  const stinkT = performance.now() / 1000;
  stallSpace();
  ctx.lineCap = "round";
  for (const i of activeStalls()) {
    const sc = S.stallClean[i];
    if (sc >= 45) continue;
    const k = (45 - sc) / 45;
    const bx = stallLx(i);
    const n = 1 + Math.round(k * 2);
    ctx.lineWidth = 2;
    for (let w = 0; w < n; w++) {
      const ph = ((stinkT * 0.45 + w / n + i * 0.37) % 1);
      const x0 = bx + 14 + w * 12;
      const y0 = 190 - ph * 30;
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
  ctx.restore();
  ctx.lineCap = "butt";
  ctx.lineWidth = 1;
  // the cleaning hose in hand: drapes from its faucet to the pointer; holding
  // the mouse sprays the stall under it (cleanApply throttles the actual work)
  if (toolInHand && cleaningTool() !== CONFIG.cleaningTools.hose) {
    const si = pointerDown ? stallAt(pointer.x, pointer.y) : -1;
    const closed = si >= 0 && stallDoorClosed(si);
    if (closed) {
      ctx.fillStyle = "rgba(255, 120, 120, 0.9)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("kapı kapalı", pointer.x, pointer.y - 14);
      ctx.textAlign = "left";
    }
    drawHandTool(pointer.x, pointer.y, si >= 0 && stallActive(si) && !closed, performance.now(), si >= 0 ? stallCx(si) : pointer.x, si >= 0 ? stallSy(200) : pointer.y);
  } else if (toolInHand) {
    const st = toolInHand;
    drawHoseLine(st.x + st.w / 2, st.y + 49, pointer.x, pointer.y, st.right ? 60 : -60); // from the faucet spout
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
          drawHoseSpray(pointer.x, pointer.y, performance.now()); // the spray comes out of the nozzle tip
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
    ctx.fillText("✨", stallCx(i), stallSy(100));
    ctx.textAlign = "left";
  }
}

// "+₺20" / "−₺1.000" rising from (x, y) for each recent booking at this terminal.
function drawChangeBillFlights() {
  const now = performance.now(), duration = CHANGE_BILL_FLIGHT_DURATION;
  for (const f of changeBillFlights) {
    if (f.landed || now - f.t0 < duration) continue;
    f.landed = true;
    if (f.guest) {
      if (!Array.isArray(f.guest.receivedChangeNotes)) f.guest.receivedChangeNotes = [];
      f.guest.receivedChangeNotes.push(f.d);
    }
  }
  changeBillFlights = changeBillFlights.filter(f => now - f.t0 < duration);
  for (const f of changeBillFlights) {
    const age = now - f.t0;
    if (age < 0) continue;
    const t = clamp(age / duration, 0, 1), ease = t * t * (3 - 2 * t);
    const x = lerp(f.from.x, f.to.x, ease);
    const y = lerp(f.from.y, f.to.y, ease) - Math.sin(Math.PI * t) * 52;
    const u = lerp(f.fromU, f.toU, ease), alpha = t > 0.82 ? (1 - t) / 0.18 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(lerp(f.angleFrom, f.angleTo, ease));
    drawHeldBill(0, 0, u, BILL_COLORS[f.d] || "#c9c2a8", f.d);
    ctx.restore();
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
  const cx = 851 + BUILD_DX, cy = 131 - BUILD_LIFT;
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
  ctx.fillText((coarseQ ? "girmek için dokun" : "girmek için tıkla") + " ↓", cx, 84 - BUILD_LIFT);
  // restore text state for the rest of the scene
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// Outdoor nudge for the car wash: a pulsing 🚿 above any parked bus whose
// windshield hasn't been washed yet. Washed buses read clean — no nudge.
function drawWashHint() {
  if (!carWashOpen()) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(140, 220, 255, ${0.4 + 0.6 * pulse})`;
  const wd = washDef();
  for (const b of buses) {
    if (b.state !== "stop" || b.washDone) continue;
    if (wd.autoWashSec && b.autoWashT > 0) { // the gantry is on it
      const f = clamp(b.autoWashT / wd.autoWashSec, 0, 1);
      ctx.fillStyle = "rgba(13, 17, 32, 0.85)";
      rr(ctx, b.cx - 26, LOT_NOSE - 12, 52, 6, 3); ctx.fill();
      ctx.fillStyle = "#8fe3f2";
      rr(ctx, b.cx - 26, LOT_NOSE - 12, 52 * f, 6, 3); ctx.fill();
      ctx.fillText("🤖", b.cx, LOT_NOSE - 22);
      ctx.fillStyle = `rgba(140, 220, 255, ${0.4 + 0.6 * pulse})`;
      continue;
    }
    ctx.fillText("🚿 yıka", b.cx, LOT_NOSE - 6);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawRoadSign(x, y, name, km, alignRight) {
  ctx.font = "bold 12px system-ui";
  const num = String(km);
  const w = ctx.measureText(name).width + ctx.measureText(num).width + 34;
  const h = 20;
  const sx = alignRight ? x - w : x;
  ctx.fillStyle = "#0a3fd8";
  rr(ctx, sx, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
  rr(ctx, sx + 2.5, y + 2.5, w - 5, h - 5, 2.5); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(name, sx + 8, y + 14.5);
  ctx.textAlign = "right";
  ctx.fillText(num, sx + w - 8, y + 14.5);
  ctx.textAlign = "left";
  // support legs
  ctx.fillStyle = "#8b8680";
  const legX1 = sx + 6, legX2 = sx + w - 6;
  ctx.fillRect(legX1 - 2, y + h, 4, 12);
  ctx.fillRect(legX2 - 2, y + h, 4, 12);
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
  const km = termDef(G.activeTerminal).km;                         // road km from here to each end
  drawRoadSign(-offX + 8, ROAD.top - 30, DEST_A, km.a, false);
  drawRoadSign(Wdyn - offX - 8, ROAD.bot - 25, DEST_B, km.b, true);
}

// Buses running right-to-left are the same sprite, mirrored inside drawBusSide / drawBusRearTop.
function drawBusDir(b) {
  drawBus(b);
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

// Side view — what the bus looks like while driving on the road: a flat-style
// touring coach (+x = nose) in the bus's own colour (b.hue). Three roof pods, a
// tall black window band with glare stripes that sweeps down into the windshield,
// a darker accent line following that sweep, luggage panels, a rear vent grille,
// the front door under the windshield, and grey-hub wheels in dark arches.
function drawBusSide(b, alpha) {
  const L = b.len, h = L / 2, nf = nightFactor();
  const paint = (l, s = 62) => `hsl(${b.hue}, ${s}%, ${l - nf * 15}%)`;
  const glass = mix("#121418", "#05070a", nf);
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.ang);
  if (busDir(b) < 0) ctx.scale(-1, 1); // right-to-left: the same side view, mirrored
  ctx.globalAlpha = alpha;
  // headlight cone from the nose (night only)
  if (nf > 0.4) {
    const hg = ctx.createLinearGradient(h, 0, h + 90, 0);
    hg.addColorStop(0, `rgba(255,240,180,${0.35 * nf})`);
    hg.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(h - 4, 14); ctx.lineTo(h + 90, 22); ctx.lineTo(h + 90, 42); ctx.lineTo(h - 4, 24);
    ctx.closePath(); ctx.fill();
  }
  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, 45, h - 2, 6, 0, 0, 7); ctx.fill();

  // roof pods: a short one at each end, a long low one in the middle
  ctx.fillStyle = paint(42);
  rr(ctx, -h + 18, -36, 26, 5, 2); ctx.fill();
  rr(ctx, -h * 0.12, -37.5, h * 0.72, 6, 3); ctx.fill();
  rr(ctx, h - 56, -36, 24, 5, 2); ctx.fill();

  // body: flat colour, square rounded tail, nose curving back at the top
  ctx.fillStyle = paint(56);
  ctx.beginPath();
  ctx.moveTo(-h + 2, 31);
  ctx.lineTo(-h, -26);
  ctx.quadraticCurveTo(-h, -33, -h + 8, -33);
  ctx.lineTo(h - 22, -33);
  ctx.quadraticCurveTo(h - 3, -33, h - 1, -14);
  ctx.lineTo(h, 26);
  ctx.quadraticCurveTo(h, 31, h - 5, 31);
  ctx.closePath(); ctx.fill();

  // the window band: straight along the side, sweeping down into the windshield
  const band = () => {
    ctx.beginPath();
    ctx.moveTo(-h + 8, -29);
    ctx.lineTo(h - 24, -29);
    ctx.quadraticCurveTo(h - 7, -29, h - 4, -14);
    ctx.lineTo(h - 3, 10);
    ctx.lineTo(h - 30, 10);
    ctx.quadraticCurveTo(h - 36, -6, h - 58, -6);
    ctx.lineTo(-h + 8, -6);
    ctx.closePath();
  };
  ctx.fillStyle = glass; band(); ctx.fill();
  ctx.save();
  band(); ctx.clip();
  const wl = -h + 8, wr = h - 34;
  ctx.globalAlpha = alpha;
  // windshield: darkens with grime, clears once washed
  const dirt = b.washDone ? 0 : (b.wash ? b.wash.g.reduce((a, v) => a + v, 0) / b.wash.g.length : 0.7);
  ctx.fillStyle = mix(mix("#1a1e24", "#06080b", nf), "#70542c", dirt * 0.7);
  ctx.fillRect(h - 30, -30, 30, 42);
  // window pillars (barely there) and diagonal glare stripes
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  const winN = Math.max(3, Math.round((wr - wl) / 30));
  for (let i = 1; i < winN; i++) ctx.fillRect(wl + (wr - wl) * i / winN, -29, 1.2, 23);
  ctx.fillStyle = `rgba(255,255,255,${(b.washDone ? 0.26 : 0.17) - nf * 0.1})`;
  for (let x = -h + 26, k = 0; x < h + 10; x += 34, k++) {
    const w = k % 3 === 1 ? 4 : 8; // a thin stripe now and then
    ctx.beginPath();
    ctx.moveTo(x, -29); ctx.lineTo(x + w, -29); ctx.lineTo(x + w - 16, 10); ctx.lineTo(x - 16, 10);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // accent line under the windows, following the sweep down to the nose
  ctx.fillStyle = paint(40);
  ctx.beginPath();
  ctx.moveTo(-h + 1, -6); ctx.lineTo(h - 58, -6);
  ctx.quadraticCurveTo(h - 36, -6, h - 30, 10);
  ctx.lineTo(h - 2, 10); ctx.lineTo(h - 2, 13.5);
  ctx.lineTo(h - 32, 13.5);
  ctx.quadraticCurveTo(h - 38, -2.5, h - 58, -2.5);
  ctx.lineTo(-h + 1, -2.5);
  ctx.closePath(); ctx.fill();

  // wheel positions: a longer rear overhang (room for the grille), front axle just behind the door
  const rearW = -h + Math.max(40, L * 0.22), frontW = h - 50, dx = h - 26; // dx: front door's rear edge (doorPos sits at h - 19)
  // luggage panels between the axles: seams and small orange handles
  ctx.strokeStyle = paint(42); ctx.lineWidth = 1;
  const bayL = rearW + 16, bayR = frontW - 16;
  const bays = Math.max(1, Math.round((bayR - bayL) / 26));
  for (let i = 0; i <= bays; i++) {
    const x = bayL + (bayR - bayL) * i / bays;
    ctx.beginPath(); ctx.moveTo(x, -2.5); ctx.lineTo(x, 31); ctx.stroke();
    if (i < bays) {
      ctx.fillStyle = "#e08a1e";
      ctx.fillRect(x + (bayR - bayL) / bays / 2 - 2, 25, 4, 2.5);
    }
  }
  // rear vent grille
  ctx.fillStyle = paint(44);
  const gl = -h + 7, gr = Math.min(rearW - 18, -h + 30);
  for (let y = 4; y <= 26; y += 3) ctx.fillRect(gl, y, gr - gl, 1.4);
  // front door under the windshield: its outline, a handle and two orange markers
  ctx.strokeStyle = paint(38);
  ctx.beginPath(); ctx.moveTo(dx, 13.5); ctx.lineTo(dx, 31); ctx.moveTo(dx + 15, 13.5); ctx.lineTo(dx + 15, 31); ctx.stroke();
  ctx.fillStyle = paint(36);
  ctx.fillRect(dx + 2, 19, 3, 1.5);
  ctx.fillStyle = "#f0a020";
  ctx.fillRect(dx - 7, 16, 4, 2.5);
  ctx.fillRect(dx - 7, 22, 4, 2.5);

  // tail lights: a red stack with a white lamp (brighter on the brakes, white lamp on in reverse)
  ctx.fillStyle = b.brake ? "#ff3b2e" : nf > 0.4 ? "#e0473a" : "#c8342c";
  ctx.fillRect(-h, 2, 4, 9);
  ctx.fillStyle = b.rev ? "#ffffff" : "#e8e4dc";
  ctx.fillRect(-h, 11, 4, 3);
  ctx.fillStyle = b.brake ? "#ff3b2e" : "#c8342c";
  ctx.fillRect(-h, 14, 4, 3);
  if (b.brake) {
    ctx.fillStyle = "rgba(255,60,40,0.35)";
    ctx.beginPath(); ctx.arc(-h, 9, 12, 0, 7); ctx.fill();
  }
  // small marker lamps up the tail
  ctx.fillStyle = paint(72, 40);
  for (let y = -25; y <= -13; y += 4) ctx.fillRect(-h + 1, y, 2.5, 2);
  // headlight / nose lamp
  ctx.fillStyle = nf > 0.4 ? "#fff6d0" : "#f2f2ee";
  ctx.fillRect(h - 3, 17, 3, 4);
  ctx.fillStyle = "#c8342c";
  ctx.fillRect(h - 3, 21, 3, 2);
  if (b.blink && blinkOn()) {
    ctx.fillStyle = "#ffb52e";
    ctx.fillRect(-h, -2, 4, 4);
    ctx.fillRect(h - 4, 24, 4, 4);
  }
  // mirror on an arm curving forward off the roof
  ctx.strokeStyle = paint(52); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(h - 8, -31); ctx.quadraticCurveTo(h + 7, -32, h + 7, -24); ctx.stroke();
  ctx.fillStyle = "#14171c";
  rr(ctx, h + 4, -24, 5, 10, 1.5); ctx.fill();

  // wheel arches and wheels
  for (const wx of [rearW, frontW]) {
    ctx.fillStyle = mix("#2a2d33", "#0b0d10", nf);
    ctx.beginPath(); ctx.arc(wx, 32, 14.5, Math.PI, 0); ctx.lineTo(wx + 14.5, 31); ctx.lineTo(wx - 14.5, 31); ctx.fill();
    ctx.fillStyle = mix("#4a4d53", "#17191d", nf);
    ctx.beginPath(); ctx.arc(wx, 34, 12, 0, 7); ctx.fill();
    ctx.fillStyle = mix("#b9bcc1", "#45484e", nf);
    ctx.beginPath(); ctx.arc(wx, 34, 7, 0, 7); ctx.fill();
    ctx.fillStyle = mix("#80848b", "#2e3136", nf);
    for (let k = 0; k < 8; k++) { // stud ring
      const a = k * Math.PI / 4;
      ctx.beginPath(); ctx.arc(wx + Math.cos(a) * 4.4, 34 + Math.sin(a) * 4.4, 1, 0, 7); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(wx, 34, 1.8, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// High overhead view of a parked bus, nose pointing away from us, with a
// shallow rear-facing panel visible along the near edge. Wheels and front face stay hidden.
function drawBusRearTop(b, alpha) {
  const len = b.len, nf = nightFactor();
  const cx = 0, top = -len / 2, bot = len / 2; // local frame: nose up, rotated to the heading below
  const r = Math.min(12, len / 4);
  const tl = cx - 33, tr = cx + 33; // constant 66 px body width from nose to rear
  const bl = tl, br = tr;
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.ang + busDir(b) * Math.PI / 2); // nose up for either direction
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(cx + 5, 6, 37, len / 2 - 2, 0, 0, 7); ctx.fill();
  // The tires stay fully beneath the body in this overhead view.
  // body — a rectangular slab with a sunlit roof edge and shaded flanks
  const bodyG = ctx.createLinearGradient(-35, 0, 35, 0);
  bodyG.addColorStop(0, `hsl(${b.hue}, 44%, ${38 - nf * 12}%)`);
  bodyG.addColorStop(0.2, `hsl(${b.hue}, 52%, ${55 - nf * 15}%)`);
  bodyG.addColorStop(0.52, `hsl(${b.hue}, 58%, ${61 - nf * 16}%)`);
  bodyG.addColorStop(0.82, `hsl(${b.hue}, 48%, ${50 - nf * 14}%)`);
  bodyG.addColorStop(1, `hsl(${b.hue}, 42%, ${35 - nf * 10}%)`);
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.moveTo(tl + r, top);
  ctx.lineTo(tr - r, top);
  ctx.quadraticCurveTo(tr, top, tr, top + r);
  ctx.lineTo(br, bot - r);
  ctx.quadraticCurveTo(br, bot, br - r, bot);
  ctx.lineTo(bl + r, bot);
  ctx.quadraticCurveTo(bl, bot, bl, bot - r);
  ctx.lineTo(tl, top + r);
  ctx.quadraticCurveTo(tl, top, tl + r, top);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(16, 22, 34, 0.52)"; ctx.lineWidth = 1.5; ctx.stroke();
  // narrow roof-edge highlights make the taper and side shoulders read clearly
  ctx.strokeStyle = "rgba(255,255,255,0.36)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tl + 3, top + 12); ctx.lineTo(bl + 2, bot - 13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tr - 3, top + 12); ctx.lineTo(br - 2, bot - 13); ctx.stroke();
  // Keep the nose end as a plain roof surface in overhead view: no front face
  // or windshield is visible from this camera angle.
  // the roof: enamel panel and trim seams; no windshield or side windows from overhead
  ctx.fillStyle = `hsl(${b.hue}, 44%, ${64 - nf * 16}%)`;
  rr(ctx, cx - 24, top + 27, 48, len - 72, 8); ctx.fill();
  ctx.strokeStyle = "rgba(27, 39, 52, 0.38)"; ctx.lineWidth = 1;
  rr(ctx, cx - 24, top + 27, 48, len - 72, 8); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  rr(ctx, cx - 21, top + 30, 7, len - 78, 4); ctx.fill();
  // panel seams and a long center rib on the roof
  ctx.strokeStyle = "rgba(48, 62, 73, 0.28)"; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx, top + 29); ctx.lineTo(cx, bot - 48); ctx.stroke();
  for (const sy of [top + 33, bot - 52]) {
    ctx.beginPath(); ctx.moveTo(cx - 22, sy); ctx.lineTo(cx + 22, sy); ctx.stroke();
  }
  // twin roof air-conditioning pods with intake grilles
  for (let ay = top + 40; ay < bot - 64; ay += 46) {
    const pod = ctx.createLinearGradient(0, ay, 0, ay + 17);
    pod.addColorStop(0, `hsl(${b.hue}, 26%, ${43 - nf * 10}%)`);
    pod.addColorStop(1, `hsl(${b.hue}, 24%, ${28 - nf * 7}%)`);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; rr(ctx, cx - 17, ay + 2, 34, 17, 4); ctx.fill();
    ctx.fillStyle = pod; rr(ctx, cx - 16, ay, 32, 15, 4); ctx.fill();
    ctx.strokeStyle = "rgba(235,242,245,0.3)"; ctx.lineWidth = 0.8;
    rr(ctx, cx - 16, ay, 32, 15, 4); ctx.stroke();
    ctx.fillStyle = "rgba(18, 27, 38, 0.75)";
    for (let vy = ay + 3; vy < ay + 13; vy += 3) {
      ctx.fillRect(cx - 13, vy, 7, 1); ctx.fillRect(cx + 6, vy, 7, 1);
    }
  }
  // rear-facing band: a small amount of rear fascia is visible beneath the roof
  const rearFaceY = bot - 28;
  const rearG = ctx.createLinearGradient(0, rearFaceY, 0, bot);
  rearG.addColorStop(0, `hsl(${b.hue}, 38%, ${36 - nf * 12}%)`);
  rearG.addColorStop(1, `hsl(${b.hue}, 34%, ${23 - nf * 7}%)`);
  ctx.fillStyle = rearG;
  ctx.fillRect(cx - 32, rearFaceY, 64, 28);
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 31, rearFaceY + 1); ctx.lineTo(cx + 31, rearFaceY + 1); ctx.stroke();
  // rear window set into the visible back panel
  ctx.fillStyle = "rgba(12, 20, 32, 0.92)";
  rr(ctx, cx - 18, rearFaceY + 3, 36, 8, 2); ctx.fill();
  ctx.fillStyle = "rgba(190, 220, 235, 0.35)";
  ctx.fillRect(cx - 14, rearFaceY + 4, 18, 1.5);
  // small tail lamps and a bumper, confined to the rear face
  ctx.fillStyle = nf > 0.4 ? "#ff6258" : "#c9352f";
  rr(ctx, cx - 29, bot - 9, 7, 6, 2); ctx.fill();
  rr(ctx, cx + 22, bot - 9, 7, 6, 2); ctx.fill();
  ctx.fillStyle = `hsl(${b.hue}, 25%, ${24 - nf * 7}%)`;
  ctx.fillRect(cx - 32, bot - 3, 64, 3);
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
const PAX_FACE_STATES = new Set(["serveR", "payC", "doneC", "payC2", "dripC", "selfDripC"]);
// queued guests turn to face you once they've stopped walking to their slot
const PAX_LINE_STATES = new Set(["queueC", "queueC2", "waitT", "waitR"]);
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
  const faceOn = PAX_FACE_STATES.has(p.state) || (PAX_LINE_STATES.has(p.state) && g.hold <= 0);
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
  else if (holdsBill(p)) reach = { x: x + 4.6 * s, y: y - 7.2 * s };
  else if (p.state === "dripC" || p.state === "selfDripC") reach = { x: x + 3.8 * s, y: y - 15 * s };
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
  if (p.state === "dripC" || p.state === "selfDripC") {
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

// Is the bound terminal the one on screen? (The scheduler binds every owned
// terminal in turn.)
const onScreen = () => !G || boundId === G.activeTerminal;
let toastLog = [];   // recent notices, shown or not: { msg, terminal, shown } (test hook)

// Notices from the terminal on screen are shown as they are. From an unseen
// terminal only the important ones (breakdowns, maintenance due) get through,
// prefixed with the terminal's name — routine chatter (a bus arrived, a stall
// is spotless) stays quiet.
function toast(msg, cls, important = false) {
  const away = !onScreen();
  toastLog.push({ msg, terminal: boundId, shown: !away || important, important });
  if (toastLog.length > 200) toastLog.splice(0, toastLog.length - 200);
  if (away && !important) return null;
  if (away) msg = `📍 ${terminalName(boundId)} · ${msg}`;
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
// Runs every frame: rewriting unchanged text replaces the text node, and WebKit
// drops a click whose mousedown target node was detached before mouseup.
function setText(id, text) {
  const el = $(id);
  text = String(text);
  if (el.textContent !== text) el.textContent = text;
}

// Odometer-style: each changed digit rolls in (up when cash rises, down when it falls).
function setCashChip(text, value) {
  const el = $("cashChip");
  if (el.dataset.text === text) return;
  const prev = Array.from(el.dataset.text || ""), next = Array.from(text);
  const dir = value >= +(el.dataset.val || 0) ? "up" : "down";
  el.dataset.text = text;
  el.dataset.val = value;
  el.replaceChildren(...next.map((c, i) => {
    const d = document.createElement("span"), inner = document.createElement("i");
    d.className = "d";
    inner.textContent = c;
    d.append(inner);
    const o = prev[prev.length - next.length + i];
    if (prev.length && o !== c && /\d/.test(c + (o || ""))) {
      d.classList.add(dir);
      inner.dataset.old = o || "";
    }
    return d;
  }));
}

function updateHUD() {
  setText("statServed", "👥 " + S.stats.served);
  const hh = Math.floor(G.clock.time), mm = Math.floor((G.clock.time % 1) * 60);
  setText("statClock", `Gün ${G.clock.day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  $("repFill").style.width = S.rep + "%";
  setText("repNum", Math.round(S.rep));
  const attention = ownedTerminals().some(needsAttention);
  setCashChip((attention ? "🔧 " : "") + fmtCashChip(G.company.cash), G.company.cash);
  $("cashChip").classList.toggle("warn", attention);
  const waiting = facilities.T.queue.length;
  $("btnExit").classList.toggle("hidden", S.view !== "wc" && S.view !== "wash");
  $("mapBtn").classList.toggle("hidden", S.view === "wc" || S.view === "wash");
  $("exitBadge").classList.toggle("hidden", S.view !== "wc" || waiting === 0);
  setText("exitBadge", waiting);
  $("cashChip").classList.toggle("neg", G.company.cash < 0);
  setText("statCash", "💰 " + fmtTL(G.company.cash));
  setText("statTerm", "📍 " + terminalName(G.activeTerminal));
  setText("btnPause", paused ? "▶" : "⏸");
  setText("btnSpeed", speed + "×");
}

// The day that just ended (archived at midnight). A long catch-up can cross
// several midnights while the summary is up: it then shows the latest and
// says how many days went by.
let summaryFromDay = null;
function showDaySummary() {
  paused = true;
  const st = S.history[S.history.length - 1];
  if (!st) return;
  if (summaryFromDay == null) summaryFromDay = st.day;
  const skipped = st.day - summaryFromDay;
  const repDelta = st.repEnd - st.repStart;
  const avgSat = st.satN ? Math.round(st.satSum / st.satN) : 0;
  const sameDay = t => t.sim.history.find(h => h.day === st.day) || { revenue: 0, expenses: 0 };
  $("modalTitle").textContent = `${st.day}. gün tamamlandı · ${terminalName(G.activeTerminal)}${skipped ? ` (+${skipped} gün daha geçti)` : ""}`;
  $("modalBody").innerHTML = `
    <table>
      <tr><td>Hizmet verilen otobüs</td><td>${st.buses}</td></tr>
      <tr><td>Hizmet verilen misafir</td><td>${st.served}</td></tr>
      <tr><td>Gelir</td><td class="pos">${fmtTL(st.revenue)}</td></tr>
      <tr><td>Gider</td><td class="neg">${fmtTL(st.expenses)}</td></tr>
      ${ownedTerminals().length > 1 ? `<tr><td>Bütün terminaller: gelir / gider</td><td>${fmtTL(ownedTerminals().reduce((a, t) => a + sameDay(t).revenue, 0))} / ${fmtTL(ownedTerminals().reduce((a, t) => a + sameDay(t).expenses, 0))}</td></tr>` : ""}
      <tr><td>Şirket kasası</td><td>${fmtTL(G.company.cash)}</td></tr>
      <tr><td>Dökülen kolonya</td><td>${st.cologne}</td></tr>
      <tr><td>Yıkanan ön cam</td><td>${st.washes}</td></tr>
      <tr><td>Kaçırılan ${fmtTL(CONFIG.economy.toiletFee)} ücret</td><td>${st.evaded}</td></tr>
      <tr><td>Yakalanan kaçak</td><td>${st.caught}</td></tr>
      <tr><td>Ort. memnuniyet</td><td>${st.satN ? avgSat + " / 100" : "—"}</td></tr>
      <tr><td>İtibar</td><td class="${repDelta >= 0 ? "pos" : "neg"}">${Math.round(st.repStart)} → ${Math.round(st.repEnd)} (${repDelta >= 0 ? "+" : ""}${repDelta.toFixed(1)})</td></tr>
    </table>
    <div class="big">${repDelta >= 3 ? "Ünün yayılıyor — yarın daha büyük otobüsler bekle."
      : repDelta <= -3 ? "Zor bir gündü. Tuvaletleri temiz tut."
      : "Mola Yeri'nde sakin bir gün."}</div>`;
  $("modalBtn").textContent = `${G.clock.day}. güne devam →`;
  $("modalBtn").onclick = () => { summaryFromDay = null; hideModal(); };
  showModal();
}

/* ------------------------ Business panel (upgrades) ------------------------ */
// DOM only: every button calls one of the validated economy functions and the
// panel re-renders from G. Prices and benefits come straight from CONFIG.
let shopOpen = false;
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// What a WC track level gives (over the level before it).
function wcBenefits(track, def) {
  const prev = wcLevel(track, def.level - 1), out = [];
  if (track === "count") {
    out.push(prev ? `${def.stalls} kabin (önceki: ${prev.stalls}) — yeni kabinler tertemiz açılır` : `${def.stalls} kabin`);
  } else if (track === "style") {
    if (!prev) return ["Yere gömülü alaturka taşlar"];
    if (def.style !== prev.style) out.push("Modern klozetler — alaturkanın yerine, hepsi tertemiz");
    if (def.satBonus !== prev.satBonus || def.dirtUse.join() !== prev.dirtUse.join()) out.push("Daha dayanıklı: daha az kirlenir, misafir memnuniyeti artar");
    if (def.auto) out.push(def.auto === "semi" ? "Rutin temizlik kendiliğinden — arızalar ve bakım sende" : "Temizlik ve gişe kendiliğinden — periyodik bakım sende");
  } else if (track === "tool") {
    const nt = CONFIG.cleaningTools[def.tool], pt = prev && CONFIG.cleaningTools[prev.tool];
    if (!pt) out.push("Kabinleri elle temizler");
    else if (nt.perSec > pt.perSec) out.push("Daha hızlı temizlik");
    if (pt && nt.reach > pt.reach) out.push("Daha geniş temizlik alanı");
  } else if (track === "cologne") {
    if (!def.ml) return ["Gişede kolonya yok"];
    if (!prev || prev.ml !== def.ml) out.push(`Gişede ${def.ml} ml'lik şişe (gece yarısı dolar)`);
    if (!prev || prev.sat !== def.sat) out.push(`Dökülen her kolonya misafir puanına +${def.sat}`);
  } else if (track === "calc") {
    out.push(def.level ? "Gişedeki ekranda verilecek para üstü yazar" : "Para üstünü kafandan hesaplarsın");
  } else if (track === "tea") {
    out.push(def.level ? "Gişede çay yapabilirsin — molaları daha keyifli hale getirir" : "Çay yapma olanaği yok");
  }
  return out;
}

// What a car-wash tier gives (over the one before it).
function washBenefits(def) {
  const prev = CONFIG.carWashTiers.find(x => x.tier === def.tier - 1);
  if (!prev) return ["Park etmiş otobüse dokun: uzun saplı fırçayla köpükle, hortumla durula",
    `Biten her yıkama ${fmtTL(def.fee)} kazandırır`, "Daha fazla memnuniyet", "İtibar şartı yok — sadece kasa"];
  const out = [];
  if (def.fee !== prev.fee) out.push(`Yıkama ücreti ${fmtTL(prev.fee)} → ${fmtTL(def.fee)}`);
  if (def.reach !== prev.reach) out.push("Daha geniş fırça ve hortum");
  if (def.soap !== prev.soap || def.rinse.join() !== prev.rinse.join()) out.push("Daha güçlü köpük ve durulama — daha az geçiş");
  if (def.rep !== prev.rep || def.sat !== prev.sat) out.push("Daha fazla memnuniyet");
  if (def.auto) out.push(def.auto === "semi" ? "Yıkamanın bir kısmı kendiliğinden — arızalar ve bakım sende" : "Otobüsler kendiliğinden yıkanır — periyodik bakım sende");
  return out;
}

// Shop card art: the game's own drawings, painted into a small canvas. The drawing
// code draws on the global `ctx` at scene coordinates, so the small canvas gets a
// transform that maps the scene window `win` onto the whole canvas.
let shopArts = [];
function paintArt(cv, art) {
  const g = cv.getContext("2d");
  const { x, y, w, h } = typeof art.win === "function" ? art.win() : art.win;
  const s = Math.min(cv.width / w, cv.height / h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(s, 0, 0, s, (cv.width - w * s) / 2 - x * s, (cv.height - h * s) / 2 - y * s);
  const main = ctx;
  ctx = g;
  artPainting = true;
  try { art.draw(); } finally { ctx = main; artPainting = false; g.setTransform(1, 0, 0, 1, 0, 0); }
}
const ALATURKA_ART = { win: { x: -2, y: 88, w: 60, h: 152 }, draw: () => drawAlaturka(0, 4, 0) };
const TEA_ART = { win: { x: 646, y: 404, w: 88, h: 84 }, draw: () => drawTea() };
const MODERN_ART = { win: { x: -2, y: 150, w: 60, h: 92 }, draw: () => drawModernToilet(0, 4, 0) };
const CALC_ART = { win: { x: 208, y: 386, w: 86, h: 88 }, draw: () => drawCalculator() };
// the hose station (lazy window: its scene position moves with the view)
const HOSE_ART = { win: () => { const h = COUNTER_IN.hose; return { x: h.x - 16, y: h.y - 10, w: h.w + 32, h: h.h + 24 }; }, draw: () => drawHoseStation(COUNTER_IN.hose) };
const bottleArt = () => { const b = COUNTER_IN.bottle; return { win: { x: b.x - 22, y: b.y - 22, w: b.w + 44, h: b.h + 44 }, draw: () => drawBottle() }; };
// the image a shop tile shows for a WC level: the game's drawing if it has one, else the emoji icon
function wcArt(track, def) {
  if (!def) return null;
  const alaturka = (wcLevel("style", term().wc.style) || {}).style === "alaturka";
  if (track === "count") return alaturka ? ALATURKA_ART : MODERN_ART;
  if (track === "style") return def.style === "alaturka" ? ALATURKA_ART : MODERN_ART;
  if (track === "tool" && def.tool === "hose") return HOSE_ART;
  if (track === "calc" && def.level) return CALC_ART;
  if (track === "cologne" && def.ml) return bottleArt();
  if (track === "tea" && def.level) return TEA_ART;
  return null;
}

function renderShop() {
  const t = term();
  shopArts = [];
  // one tile: a big icon "image" on top, then the name, details and the button pinned to the bottom
  const tile = (cls, icon, name, lines, why, btn) => `
    <div class="card ${cls}">
      ${typeof icon === "object" && icon ? `<canvas class="art" data-art="${shopArts.push(icon) - 1}" width="240" height="150" aria-hidden="true"></canvas>` : `<div class="art" aria-hidden="true">${icon}</div>`}
      <div class="info">
        <div class="name">${escHtml(name)}</div>
        <div class="details">
          ${lines.length ? `<ul>${lines.map(l => `<li>${escHtml(l)}</li>`).join("")}</ul>` : ""}
        </div>
        ${why ? `<div class="why">${escHtml(why)}</div>` : ""}
      </div>${btn || ""}
    </div>`;
  const buyBtn = (attrs, price, st, label = "Satın al") =>
    `<button class="buy" ${attrs} ${st.ok ? "" : `disabled title="${escHtml(st.reason)}"`}>${label} · ${fmtTL(price)}</button>`;
  // Each upgrade tile shows the NEXT thing you would get, never the current one.
  // a maxed-out track keeps showing the item you own, with its details, and a "max level" badge
  const upgradeCard = (next, up, st, attrs, price, label, done) => next
    ? tile("", up.icon, up.name, up.lines, st.ok ? "" : st.reason, buyBtn(attrs, price, st, label))
    : tile("owned", done.icon, done.name, done.lines, "", `<div class="done">${done.text}</div>`);

  let wcCards = "";
  for (const track of Object.keys(CONFIG.wcTracks)) {
    const cur = wcLevel(track, t.wc[track]), next = wcLevel(track, t.wc[track] + 1);
    const lines = !next ? [] : track === "count" ? [`Yükseltince ${next.stalls} kabin — yeni kabinler tertemiz açılır`]
      : wcBenefits(track, next);
    wcCards += upgradeCard(next, { icon: next && (wcArt(track, next) || next.icon), name: next && next.name, lines }, next && wcUpgradeStatus(t.id, track, next.level),
      next && `data-act="wc" data-track="${track}" data-tier="${next.level}"`, next && tierCost(t.id, next), "Yükselt",
      { icon: wcArt(track, cur) || cur.icon, name: cur.name, lines: wcBenefits(track, cur), text: ["tool", "cologne", "calc", "tea"].includes(track) ? "Kuruldu" : "Yükseltildi" });
  }

  const haveWash = t.carWash.unlocked ? t.carWash.tier : 0;
  const nextWash = CONFIG.carWashTiers.find(x => x.tier === haveWash + 1);
  const curWash = CONFIG.carWashTiers.find(x => x.tier === haveWash);
  const washCards = upgradeCard(nextWash, { icon: nextWash && nextWash.icon, name: nextWash && nextWash.name, lines: nextWash ? washBenefits(nextWash) : [] },
    nextWash && carWashStatus(t.id, nextWash.tier), nextWash && `data-act="wash" data-tier="${nextWash.tier}"`, nextWash && tierCost(t.id, nextWash),
    haveWash ? "Yükselt" : "Kur",
    { icon: curWash ? curWash.icon : "🚫", name: curWash ? curWash.name : "Oto yıkama yok", lines: curWash ? washBenefits(curWash) : [], text: "Yükseltildi" });

  const currentSpaces = parkingSpaces(t.sim);
  const nextLot = CONFIG.parkingLots.find(x => x.spaces > currentSpaces);
  let parkingCard = "";
  if (S.view === "out") {
    const lotStatus = nextLot && parkingUpgradeStatus(t.id, nextLot.spaces);
    parkingCard = upgradeCard(nextLot, { icon: "🚌", name: nextLot && `Otopark · ${nextLot.spaces} yer`, lines: nextLot ? [`${nextLot.minBuses} otobüs gerekir`] : [] },
      lotStatus, nextLot && `data-act="parking" data-spaces="${nextLot.spaces}"`, nextLot && tierCost(t.id, nextLot), "Yükselt",
      { icon: "🚌", name: `Otopark · ${currentSpaces} yer`, lines: [`${currentSpaces} / ${PARKING_SLOT_COUNT} park yeri açık`], text: "Yükseltildi" });
  }

  let maint = "";
  const sys = autoSystems(t);
  if (!sys.length) maint = tile("locked", "⚙️", "Otomasyon yok", ["Bakım yalnızca otomatik sistemler için gerekir (yarı otomatik tuvaletler, yıkama 4+)"], "", "");
  else {
    const m = t.maintenance, due = maintenanceDue(t), left = m.nextDueAt - absNow(), st = maintenanceStatus(t.id);
    const hm = h => `${Math.floor(h)} sa ${Math.floor((h % 1) * 60)} dk`;
    maint = tile(due ? "warn" : "", "🔧", "Günlük bakım",
      [`Durum: %${Math.round(m.condition)}`, `Sistemler: ${sys.map(x => SYSTEM_NAMES[x]).join(", ")}`,
       due ? `GECİKTİ — ${hm(-left)}: aşınma ve arıza riski artıyor` : `Sonraki bakım: ${hm(left)} sonra`,
       `İşletme gideri: ${fmtTL(operatingCost(t))} / gün (gece yarısı)`],
      st.ok ? "" : (st.reason === "Bakım gerekmiyor" ? "" : st.reason),
      `<button class="buy" data-act="maint" ${st.ok ? "" : `disabled title="${escHtml(st.reason)}"`}>Bakım yap · ${fmtTL(maintenanceCost(t))}</button>`);
    for (const f of t.maintenance.failures) {
      const rs = repairStatus(t.id, f.system);
      maint += tile("warn", "⚠️", `${SYSTEM_NAMES[f.system]} arızalı`, ["Onarılana kadar bu iş elle yapılır"], rs.ok ? "" : rs.reason,
        `<button class="buy" data-act="repair" data-sys="${f.system}" ${rs.ok ? "" : "disabled"}>Onar · ${fmtTL(CONFIG.maintenance.repairCost[f.system])}</button>`);
    }
  }

  const body = S.view === "wc" ? wcCards : S.view === "wash" ? washCards
    : S.view === "out" ? parkingCard + washCards + maint : washCards + (sys.length ? maint : "");
  $("shopBody").innerHTML = body;
  $("shopBody").querySelectorAll("canvas[data-art]").forEach(cv => paintArt(cv, shopArts[+cv.dataset.art]));
}

function shopAction(btn) {
  const a = btn.dataset.act;
  let res;
  if (a === "parking") {
    const spaces = +btn.dataset.spaces;
    res = upgradeParkingLot(G.activeTerminal, spaces);
    if (res.ok) res.text = `✓ Otopark ${spaces} yere genişletildi (−${fmtTL(-res.tx.amount)})`;
  } else if (a === "wc") {
    const def = wcLevel(btn.dataset.track, +btn.dataset.tier);
    res = purchaseUpgrade(G.activeTerminal, btn.dataset.track, +btn.dataset.tier);
    if (res.ok) res.text = `✓ ${def.name} kuruldu (−${fmtTL(-res.tx.amount)})`;
  } else if (a === "wash") {
    const def = CONFIG.carWashTiers.find(x => x.tier === +btn.dataset.tier);
    res = purchaseUpgrade(G.activeTerminal, "carWash", +btn.dataset.tier);
    if (res.ok) res.text = `✓ ${def.tier === 1 ? "Oto yıkama kuruldu" : def.name + " kuruldu"} (−${fmtTL(-res.tx.amount)})`;
  } else if (a === "maint") {
    res = performMaintenance(G.activeTerminal);
    if (res.ok) res.text = "✓ Bakım yapıldı — sistemler %100";
  } else if (a === "repair") {
    res = repairFailure(G.activeTerminal, btn.dataset.sys);
    if (res.ok) res.text = `✓ ${SYSTEM_NAMES[btn.dataset.sys]} onarıldı`;
  } else return;
  toast(res.ok ? res.text : "✗ " + res.reason, res.ok ? "good" : "bad");
  renderShop();
}

// Save migration / recovery report, shown once on load.
function showLoadNotice(res) {
  paused = true;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const migrated = res.status === "migrated" || res.from != null;
  $("modalTitle").textContent = res.status === "recovered" ? "⚠️ Kayıt sorunu" : "💾 Kaydın aktarıldı";
  $("modalBody").innerHTML =
    (migrated ? `<p>Eski kayıt (sürüm ${esc(res.from)}) yeni sürüme aktarıldı: itibarın, saat, otobüsler, misafirler ve kabinler olduğu gibi duruyor. Eski kayıt yedek olarak tarayıcıda kalıyor.</p>` : "") +
    res.notes.map(n => `<p>${esc(n)}</p>`).join("");
  $("modalBtn").textContent = "Devam";
  $("modalBtn").onclick = () => hideModal();
  showModal();
}

let modalOpen = false;
function showModal() { $("modal").classList.remove("hidden"); modalOpen = true; }
function hideModal() { $("modal").classList.add("hidden"); $("modalBox").classList.remove("tall"); modalOpen = false; paused = false; save(); }

function showIntro(first) {
  const touch = coarseQ; // phones & tablets — say "tap" where the desktop says "click"
  const act = touch ? "dokun" : "tıkla";
  const tool = cleaningTool();
  if (gameLanguage === "en") {
    $("modalTitle").textContent = first ? "👋 Welcome to Layover Lane" : "How to play";
    $("modalBox").classList.add("tall");
    const action = touch ? "tap" : "click";
    $("modalBody").innerHTML = `
      <div class="big">You run a rest stop trusted by tour buses traveling between <strong>${DEST_A}</strong> and <strong>${DEST_B}</strong>.</div>
      <p>🚌 Buses pull into your lot for a break. Passengers get hungry, thirsty, and need the restroom. They stay for about <strong>30 game minutes</strong> (up to one game hour).</p>
      <p>🅿️ You start with <strong>2 parking spaces</strong>. Expand the lot to 4, 6, 8, then 10 spaces from the business panel. The first expansion unlocks after serving 20 buses.</p>
      <p>🚻 Enter the restroom: ${action} its building. Each occupied stall closes its door and gets dirtier with every use. Guests choose the cleanest available stall; very dirty stalls are avoided. Clean stalls by dragging your <strong>${translateText(tool.name).toLowerCase()}</strong> over them.</p>
      <p>💳 After using the restroom, guests join the counter queue and hand you a bill. ${touch ? "Tap" : "Click"} the cash drawer's 10₺, 20₺, or 50₺ trays to give the correct change. Fewer bills earn a better rating. Exact 20₺ guests use the separate queue and pay automatically.</p>
      <p>💨 Offer lemon cologne to the guest at the counter for a satisfaction bonus. It refills at midnight. Tea can be ordered from the intercom at the far end of the counter.</p>
      <p>🧽 Every visit dirties a stall. Upgrades in the business panel improve your toilets, cleaning equipment, cologne, calculator, and car wash. The game pauses while the panel is open.</p>
      <p>🚌 Reputation affects bus traffic and passenger counts. Keep guests happy to attract more buses. A vacant parking bay dispatches a replacement bus within 8 game minutes; the lot should refill before 10 minutes.</p>
      <p>⏱ Game time is compressed: at 1×, one game hour takes 6 real minutes. Use the pause and speed controls to manage the pace. Press <strong>E</strong> to leave an interior, or ${action} the exit button.</p>
      <p>💰 Guest fees go into shared company cash. Spend it on upgrades, maintenance, and new terminals. Automated systems need daily maintenance and incur operating costs.</p>`;
    $("modalBody").scrollTop = 0;
    $("modalBtn").textContent = first ? "Open the shop!" : "Back to work";
    $("modalBtn").onclick = () => hideModal();
    showModal();
    return;
  }
  $("modalTitle").textContent = first ? "👋 Mola Yeri'ne hoş geldin" : "Nasıl oynanır";
  $("modalBox").classList.add("tall"); // both intro screens are scrollable
  $("modalBody").innerHTML = `
    <div class="big"><strong>${DEST_A}</strong> ile <strong>${DEST_B}</strong> arasındaki her tur otobüsünün güvendiği mola yerini sen işletiyorsun.</div>
    <p>🚌 Otobüsler mola vermek için otoparkına girer. Yolcular acıkır, susar ve <strong>tuvalet</strong> için can atar.</p>
    <p>🅿️ Oyun <strong>2 otobüs park yeriyle</strong> başlar. İşletme panelinden otoparkı 4, 6, 8 ve en fazla 10 yere genişletebilirsin; ilk genişleme terminalin <strong>20 otobüse hizmet vermesinden</strong> sonra açılır.</p>
    <p>🍔 Lokanta başlangıçta <strong>kapalıdır</strong>; misafirler içeri giremez ve yemek ya da içecek servisi alamaz.</p>
    <p>⏱ Otobüsler yaklaşık <strong>30 dakika</strong> mola verir — terminalde en fazla bir saat kalabilirler. Kalkış vakti gelince <strong>WC ödeme sırasındaki</strong> misafirlere ödemeyi bitirmeleri için <strong>5–10 dakika</strong> tanınır; sıra hâlâ duruyorsa <strong>ödemeden sırayı terk edip</strong> otobüse binerler ve otobüs kalkar.</p>
    <p>🕐 Zaman <strong>sıkıştırılmıştır</strong> — 1× hızda bir oyun saati gerçekte 6 dakika sürer, yani bir oyun günü yaklaşık 2,4 gerçek saattir. Otobüsler, tuvaletler ve sıralar oyun içi temposunu korur.</p>
    <p>🚻 Tuvalet <strong>${fmtTL(CONFIG.economy.toiletFee)}</strong>; ücret ziyaretten <em>sonra</em> gişede ödenir — ve gişe <strong>sensin</strong>. <strong>İçeri girmek için WC binasına ${act}</strong>: içinde biri varken <strong>her kabinin kapısı kapanır</strong> (bir ziyaret oyun içinde 1–10 dakika sürer) ve <strong>her kabinin kendi temizliği vardır</strong> — kirli kabin ziyaretin puanını düşürür, misafirler hep <strong>en temiz boş kabini</strong> seçer (çok pis olanı kimse kullanmaz).</p>
    <p>💳 İçeride işini bitiren her misafir gişedeki sıraya girer ve sana bir banknot uzatır. Doğru para üstünü vermek için <strong>açık kasa çekmecesindeki gözlere ${act}</strong> (10₺ / 20₺ / 50₺) — ve <strong>misafirler banknotları sayar</strong>: aynı tutarı daha az banknotla vermek daha iyi puan alır (30₺'u 10+20 olarak vermek şıktır, 10+10+10 bir avuç kâğıttır; 80₺ için 10+20+50, 10×8'den iyidir). <strong>Tam ${fmtTL(CONFIG.economy.toiletFee)}</strong> veren misafirlerin sana ihtiyacı yok: <strong>kendi ikinci sıralarında</strong> durur, kendileri öder ve yan geçitten çıkarlar — para üstü yok, kolonya yok, tıklama yok. Eksik ya da hiç verilmeyen para üstü diğer misafirleri mutsuz eder. ${hasCalc() ? "Gişedeki <strong>hesap makinesi</strong> verilecek para üstünü gösterir." : "Henüz <strong>hesap makinen yok</strong> — para üstünü kafandan hesapla (20₺ düş)."}</p>
    ${hasCologne() ? `<p>💨 Gişede ${bottleMax()} ml'lik bir şişe <strong>limon kolonyası</strong> durur. Öndeki misafir öderken ellerine biraz dökmek için <strong>şişeye ${act}</strong>. Para üstü eline geçer geçmez yan geçitten çıkar (tam 20₺ sırası kendi kendine öder — kolonya ana sıranın öndeki misafiri içindir), o yüzden erken dök. Şişe gece yarısı dolar.</p>` : ""}
    <p>🍵 <strong>Çayın</strong> gişede durur ve yaklaşık 30 oyun dakikasında biter. Taze bir bardak istemek için gişenin sağ ucundaki <strong>interkoma ${act}</strong> — bardağı ${fmtTL(CONFIG.economy.teaPrice)}, 2 oyun dakikası içinde gelir.</p>
    <p>🚪 Dışarı çıkmak için üst çubuktaki <strong>🚪</strong> düğmesine ${act}${touch ? "" : " — ya da <strong>E</strong> tuşuna bas"}. Misafirler gişenin iki yanındaki geçitlerden girip çıkar.</p>
    <p>🧻 <strong>Her kabin her kullanımda biraz daha kirlenir</strong> (her kabinin üstündeki çubuğu izle). Kabinlerin iki yanındaki istasyondan <strong>${tool.name.toLocaleLowerCase("tr-TR")}</strong> aletini al ve <strong>${touch ? "parmağını basılı tutup" : "fareyi basılı tutup"} bir kabinin üzerinde sürükle</strong>, temizle — ama <strong>kapısı kapalı</strong> (içinde biri olan) bir kabin temizlenemez.${stallCount() < WC_STALLS ? ` Şimdilik <strong>${stallCount()} ${toiletDef().style === "alaturka" ? "alaturka " : ""}tuvaletin</strong> var; kalan bölmeler tahtayla kapalı. Kabin sayısı, tuvaletler, temizlik ekipmanı, kolonya ve hesap makinesi İşletme panelinden ayrı ayrı yükseltilir.` : ""}</p>
    ${carWashOpen() ? `<p>🚿 Otobüsler tozlu gelir. Önüne geçmek için <strong>park etmiş bir otobüse ${act}</strong>: <strong>uzun saplı fırçayı al ve ön camın üzerinde sürükle</strong>, köpükle; sonra <strong>temiz su hortumunu al ve köpüğü durula</strong>. <strong>Bırakmak</strong> için alete yeniden ${act}. Pırıl pırıl bir ön cam şoförün minnetini kazanır — ve otobüs firması yıkama başına <strong>${fmtTL(washDef().fee)}</strong> öder.</p>` : `<p>🔒 Henüz <strong>oto yıkaman yok</strong> — otobüsler tozlu gelip tozlu gider. Oto yıkama ileride ${fmtTL(tierCost(G.activeTerminal, CONFIG.carWashTiers[0]))} ile kurulabilir.</p>`}
    <p>💢 İlgilenilmeyen misafirler ödemeden <strong>öfkeyle çıkıp gider</strong>, ★ memnun misafirler ise <strong>itibarını</strong> yükseltir → otobüsler çok daha sık uğrar ve daha kalabalık gelir. Yoğun ve itibarı yüksek bir terminalde aynı anda birkaç otobüs olur — boşalan bir park yeri 30 dakika içinde dolar, asla boş kalmaz.</p>
    <p>🚨 Her misafir <strong>${fmtTL(CONFIG.economy.toiletFee)}</strong> ücreti ödemez. <strong>Ödeme sırasını terk eden</strong> misafirler (sabırları tükendiği ya da otobüsleri kalktığı için) sadece bir <strong>bildirim</strong> olarak görünür — onlara tıklanamaz. Ama bazı misafirler (yaklaşık 100'de 3) <strong>kabinde işini bitirip ödemeden yan geçide koşar</strong>; bunlar <strong>kırmızı rozetle</strong> işaretlenir. Yakalamak için <strong>binadan çıkmadan onlara ${act}</strong>: bir paspas kapıp 3 saniye boyunca <strong>bütün tuvaletleri ovarlar</strong> — ve her kabin <strong>pırıl pırıl</strong> olur. Kaçak binadan çıktıysa gitmiştir.</p>
    ${autoSystems(term()).length ? `<p>🤖 <strong>Otomasyon</strong> rutin işi kendisi yapar, ama <strong>her gün bakım</strong> ister: İşletme panelindeki <strong>Bakım yap</strong>. Geciken bakım aşınmayı ve arıza riskini artırır; arızalanan sistem <strong>onarılana kadar</strong> durur ve o işi yine elle yaparsın. Otomasyonun günlük işletme gideri gece yarısı kasadan düşer.</p>` : ""}
    <p>💰 Ödenen her ücret <strong>şirket kasasına</strong> girer (sağ üstte). Kasayla <strong>🏗 İşletme</strong> panelinden (kasaya ${act}${touch ? "" : " ya da <strong>U</strong>"}) daha iyi tuvaletler ve ekipman alırsın — fiyatlar, koşullar ve ne kazandırdıkları orada yazar. Panel açıkken saat durur. ${touch ? "⏸ düğmesi oyunu duraklatır · 1× düğmesi hız kademesini değiştirir (1×, 10×, 100×, 200×)." : "Boşluk tuşu duraklatır · 1–4 tuşları hız kademesini seçer (1×, 10×, 100×, 200×)."}</p>`;
  $("modalBody").scrollTop = 0;
  $("modalBtn").textContent = first ? "Dükkânı aç!" : "İşe dön";
  $("modalBtn").onclick = () => hideModal();
  showModal();
}

// The WC has no tutorial popups: the first visit just marks it as seen, which
// lets the outdoor toolbar tips (map, business, car wash) follow.
function markWcVisited() {
  if (G.flags.wcIntroStep >= 4) return;
  G.flags.wcIntroStep = 4;
  save();
}

function maybeShowArrivalInfo() {
  if (arrivalInfoOpen || modalOpen || paused || shopOpen || mapOpen) return;
  if (S.view !== "out") return; // no tips indoors
  if (!G.flags.arrivalInfoSeen) {
    if (performance.now() < arrivalInfoDelayUntil) return;
    const bus = buses.find(b => b.state === "drive" && b.cx + b.len / 2 >= -offX && b.cx - b.len / 2 <= Wdyn - offX);
    if (!bus) return;
    arrivalInfoKind = "arrival";
    arrivalInfoBusId = bus.id;
    arrivalInfoOpen = true;
  } else if (!G.flags.wcInfoSeen && buses.some(b => b.pax.some(p => p.tutGuest || isIndoorPax(p) || p.state === "waitT"))) {
    // only once a guest has reached the WC (at its door or inside) — the tip then explains where they went
    arrivalInfoKind = "wc";
    arrivalInfoBusId = null;
    arrivalInfoOpen = true;
  } else if (G.flags.wcInfoSeen && G.flags.wcIntroStep >= 4 && G.flags.toolbarIntro < 4) {
    // first time after the WC tutorial: point at the map button, then the business button, then car wash
    arrivalInfoKind = G.flags.toolbarIntro === 0 ? "intro-map" : G.flags.toolbarIntro === 2 ? "intro-shop" : "intro-wash";
    arrivalInfoBusId = null;
    arrivalInfoOpen = true;
  }
}

// Canvas-space rect of a header/side button, so the tutorial can highlight it.
function toolbarTargetRect(id) {
  const el = $(id), cr = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
  const k = Wdyn / cr.width, kh = Hdyn / cr.height;
  return {
    x: (r.left - cr.left) * k - offX - 6, y: (r.top - cr.top) * kh - offY - 6,
    w: r.width * k + 12, h: r.height * kh + 12,
  };
}

function dismissArrivalInfo() {
  if (!arrivalInfoOpen) return;
  if (arrivalInfoKind.startsWith("intro-")) {
    if (arrivalInfoKind === "intro-map") { G.flags.toolbarIntro = 2; arrivalInfoKind = "intro-shop"; }
    else if (arrivalInfoKind === "intro-shop") { G.flags.toolbarIntro = 3; arrivalInfoKind = "intro-wash"; }
    else { G.flags.toolbarIntro = 4; arrivalInfoOpen = false; }
    save();
    return;
  }
  arrivalInfoOpen = false;
  if (arrivalInfoKind === "wc") G.flags.wcInfoSeen = true;
  else G.flags.arrivalInfoSeen = true;
  arrivalInfoBusId = null;
  save();
}

function arrivalInfoLayout() {
  if (arrivalInfoKind === "intro-wash") {
    // a tall column popup, placed on the side of the bus that is clear of other parked buses
    const w = 240, h = 340, side = 22, hgt = side * Math.sqrt(3) / 2;
    const parked = buses.filter(b => b.state === "stop");
    const bus = parked.length ? parked.reduce((a, b) => (b.cx > a.cx ? b : a)) : null;
    if (!bus) {
      const x = -offX + 12, y = -offY + 8;
      return { washTip: true, x, y, w, h, tail: null, button: { x: x + w / 2 - 62, y: y + h - 48, w: 124, h: 32 } };
    }
    const left = -offX + 8, right = Wdyn - offX - w - 8;
    const bodyHit = (x, y) => parked.some(o => x < o.cx + 33 && x + w > o.cx - 33 && y < o.cy + o.len / 2 && y + h > o.cy - o.len / 2);
    const y = clamp(bus.cy - h / 2, -offY + 8, H + offY - h - 8);
    const leftX = bus.cx - 36 - hgt - w, rightX = bus.cx + 36 + hgt;
    const leftFree = leftX >= left && !bodyHit(leftX, y);
    const rightFree = rightX <= right && !bodyHit(rightX, y);
    const onLeft = leftFree || (!rightFree && leftX >= left);
    const x = onLeft ? leftX : clamp(rightX, left, right);
    const tipX = onLeft ? bus.cx - 36 : bus.cx + 36;
    const bx = onLeft ? x + w : x;
    return { washTip: true, x, y, w, h, tail: { x: tipX, y: bus.cy, bx, by: bus.cy, side },
      button: { x: x + w / 2 - 62, y: y + h - 48, w: 124, h: 32 } };
  }
  const isIntro = arrivalInfoKind.startsWith("intro-");
  if (isIntro) {
    const w = 430, h = 132, left = -offX + 8, right = Wdyn - offX - w - 8;
    const target = toolbarTargetRect(arrivalInfoKind === "intro-map" ? "mapBtn" : "cashChip");
    let x = target.x - w - 12; // the box sits to the left of the highlighted button, level with it
    // but never up under the header bar's buttons: start below the header's bottom edge
    const header = toolbarTargetRect("headerBar");
    let y = Math.max(target.y + target.h / 2 - h / 2, header.y + header.h + 8);
    x = clamp(x, left, right);
    y = clamp(y, -offY + 8, H + offY - h - 8);
    return { isIntro, target, x, y, w, h, button: { x: x + w / 2 - 62, y: y + 90, w: 124, h: 32 } };
  }
  const isWc = arrivalInfoKind === "wc";
  const bus = isWc ? null : buses.find(b => b.id === arrivalInfoBusId);
  // the WC tip has no button, so it is just a title and one line — a narrower, shorter box
  const w = isWc ? 360 : 430, h = isWc ? 84 : 132, tail = 14;
  if (isWc) {
    const targetY = WC_BUILDING.y + WC_BUILDING.h / 2;
    const x = WC_BUILDING.x - w - tail - 8;
    const y = clamp(targetY - h / 2, -offY + 8, H + offY - h - tail - 8);
    return { bus, isWc, x, y, w, h, tail, tipX: WC_BUILDING.x - 8, tipY: targetY, button: { x: x + w / 2 - 62, y: y + 90, w: 124, h: 32 } };
  }
  const left = -offX + 8, right = Wdyn - offX - w - 8;
  const centerX = bus ? bus.cx : Wdyn / 2;
  const x = clamp(centerX - w / 2, left, right);
  const busTop = bus
    ? bus.cy - (Math.abs(Math.sin(bus.ang)) * bus.len / 2 + Math.abs(Math.cos(bus.ang)) * 33)
    : H / 2;
  const y = clamp(busTop - h - tail - 8, -offY + 8, H + offY - h - tail - 8);
  return { bus, isWc, x, y, w, h, tail, tipX: clamp(centerX, x + 24, x + w - 24), tipY: y + h + tail, button: { x: x + w / 2 - 62, y: y + 90, w: 124, h: 32 } };
}

// the bus the car wash tip previews (its own wash state, never a real bus)
const WASH_PREVIEW_BUS = { hue: 205, wash: null };
function drawWashTip(x, y, w, h, button, tail) {
  ctx.save();
  ctx.fillStyle = "rgba(16, 22, 35, 0.96)";
  rr(ctx, x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = "#f2c66d"; ctx.lineWidth = 2;
  rr(ctx, x, y, w, h, 14); ctx.stroke();
  if (tail) { // an equilateral pointer with the same border: base on the popup's edge, tip on the bus
    const half = tail.side / 2, bx = tail.bx, by = tail.by;
    ctx.beginPath();
    ctx.moveTo(bx, by - half); ctx.lineTo(tail.x, tail.y); ctx.lineTo(bx, by + half); ctx.closePath();
    ctx.fillStyle = "#101623"; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx, by - half); ctx.lineTo(tail.x, tail.y); ctx.lineTo(bx, by + half);
    ctx.stroke();
    // the popup's own border is open where the pointer joins it
    ctx.fillStyle = "#101623";
    ctx.fillRect(bx - 2, by - half + 1, 4, tail.side - 2);
  }
  // one column: title, the car wash view, the instructions, the button
  const ix = x + 12, iy = y + 40, iw = w - 24, ih = 150;
  const k = iw / Wdyn;
  ctx.save();
  ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  ctx.translate(ix + offX * k, iy + offY * k + (ih - Hdyn * k) / 2); // scene centred in the picture
  ctx.scale(k, k);
  drawWashView(WASH_PREVIEW_BUS);
  ctx.restore();
  ctx.strokeStyle = "rgba(242, 198, 109, 0.6)"; ctx.lineWidth = 1;
  rr(ctx, ix, iy, iw, ih, 8); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd36b"; ctx.font = "bold 20px system-ui";
  ctx.fillText("Oto yıkama", x + w / 2, y + 20);
  ctx.fillStyle = "#f4f6fb"; ctx.font = "14px system-ui";
  ctx.fillText("Park etmiş otobüse dokun:", x + w / 2, y + 212);
  ctx.fillText("uzun saplı fırçayla köpükle,", x + w / 2, y + 232);
  ctx.fillText("hortumla durula", x + w / 2, y + 252);
  ctx.fillStyle = "#d92332"; rr(ctx, button.x, button.y, button.w, button.h, 8); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 15px system-ui";
  ctx.fillText("Anladım", button.x + button.w / 2, button.y + button.h / 2);
  ctx.restore();
}

function drawArrivalInfo() {
  if (!arrivalInfoOpen) return;
  const layout = arrivalInfoLayout();
  if (layout.washTip) { drawWashTip(layout.x, layout.y, layout.w, layout.h, layout.button, layout.tail); return; }
  const { isIntro, target, bus, isWc, x, y, w, h, tail, tipX, tipY, button } = arrivalInfoLayout();
  ctx.save();
  if (isIntro) {
    // Even-odd fill leaves the current tutorial target bright beneath the dim overlay.
    ctx.beginPath();
    ctx.rect(-offX, -offY, Wdyn, Hdyn + offY);
    ctx.rect(target.x, target.y, target.w, target.h);
    ctx.fillStyle = "rgba(5, 8, 16, 0.76)";
    ctx.fill("evenodd");
    ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 2;
    rr(ctx, target.x, target.y, target.w, target.h, 8); ctx.stroke();

    const copy = arrivalInfoKind === "intro-map"
      ? ["Bölge haritası", "Terminallerini ve yolu buradan takip et.", "Yeni terminal de buradan satın alınır."]
      : ["İşletme", "Her terminalin yükseltmeleri burada.", "Tuvalet ve oto yıkama için ayrı ayrı yükselt."];
    ctx.fillStyle = "rgba(16, 22, 35, 0.98)";
    rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = "#f2c66d"; ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 14); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd36b"; ctx.font = "bold 21px system-ui";
    ctx.fillText(copy[0], x + w / 2, y + 25);
    ctx.fillStyle = "#f4f6fb"; ctx.font = "15px system-ui";
    ctx.fillText(copy[1], x + w / 2, y + 53);
    ctx.fillText(copy[2], x + w / 2, y + 72);
    ctx.fillStyle = "#d92332"; rr(ctx, button.x, button.y, button.w, button.h, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 15px system-ui";
    ctx.fillText("Anladım", button.x + button.w / 2, button.y + button.h / 2);
    ctx.restore();
    return;
  }
  // Outdoor tutorial bubbles continue below.
  ctx.fillStyle = "rgba(5, 8, 16, 0.76)";
  ctx.fillRect(-offX, -offY, Wdyn, Hdyn + offY);
  if (bus) drawBus(bus);
  if (isWc) {
    ctx.save();
    ctx.beginPath(); ctx.rect(WC_BUILDING.x - 8, WC_BUILDING.y - 10, WC_BUILDING.w + 16, WC_BUILDING.h + 18); ctx.clip();
    drawRestStop();
    ctx.restore();
  }

  // Speech bubble: the bus tip points down; the WC tip points toward the building.
  ctx.beginPath();
  if (isWc) {
    const cy = tipY - y;
    ctx.moveTo(x + 14, y);
    ctx.lineTo(x + w - 14, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 14);
    ctx.lineTo(x + w, y + h - 14);
    ctx.quadraticCurveTo(x + w, y + h, x + w - 14, y + h);
    ctx.lineTo(x + 14, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - 14);
    ctx.lineTo(x, y + 14);
    ctx.quadraticCurveTo(x, y, x + 14, y);
    ctx.closePath();
    // Side tail is drawn separately so it can point at the WC facade.
    ctx.fillStyle = "rgba(16, 22, 35, 0.98)";
    ctx.fill();
    ctx.strokeStyle = "#f2c66d"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w - 2, y + cy - 11); ctx.lineTo(tipX, tipY); ctx.lineTo(x + w - 2, y + cy + 11); ctx.closePath();
    ctx.fillStyle = "rgba(16, 22, 35, 0.98)"; ctx.fill();
    // stroke only the two slanted sides, then open the popup border where the pointer joins it
    ctx.beginPath();
    ctx.moveTo(x + w - 2, y + cy - 11); ctx.lineTo(tipX, tipY); ctx.lineTo(x + w - 2, y + cy + 11);
    ctx.strokeStyle = "#f2c66d"; ctx.stroke();
    ctx.fillStyle = "#101623";
    ctx.fillRect(x + w - 3, y + cy - 10, 4, 20);
  } else {
    ctx.moveTo(x + 14, y);
    ctx.lineTo(x + w - 14, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 14);
    ctx.lineTo(x + w, y + h - 14);
    ctx.quadraticCurveTo(x + w, y + h, x + w - 14, y + h);
    ctx.lineTo(tipX + 11, y + h);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX - 11, y + h);
    ctx.lineTo(x + 14, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - 14);
    ctx.lineTo(x, y + 14);
    ctx.quadraticCurveTo(x, y, x + 14, y);
    ctx.closePath();
    ctx.fillStyle = "rgba(16, 22, 35, 0.98)"; ctx.fill();
    ctx.strokeStyle = "#f2c66d"; ctx.lineWidth = 2; ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 21px system-ui";
  ctx.fillText(isWc ? "WC binası" : "İlk otobüsün geliyor!", x + w / 2, y + 25);
  ctx.fillStyle = "#f4f6fb";
  ctx.font = "15px system-ui";
  if (isWc) {
    ctx.fillText("Yolcular tuvalet için buraya gelir.", x + w / 2, y + 53);
  } else {
    ctx.fillText("Otobüsler terminalinde mola verir.", x + w / 2, y + 53);
    ctx.fillText("Yolculara hizmet için hazır ol.", x + w / 2, y + 72);
  }
  if (isWc) {
    drawWcTapCue(); // no button: the building itself is the way forward
  } else {
    ctx.fillStyle = "#d92332";
    rr(ctx, button.x, button.y, button.w, button.h, 8); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px system-ui";
    ctx.fillText("Anladım", button.x + button.w / 2, button.y + button.h / 2);
  }
  ctx.restore();
}

// Tap cue on the WC building: a pointer hand glides up to the building's middle,
// presses gently, and a single soft ripple spreads from the fingertip
function drawWcTapCue() {
  drawTapCue(WC_BUILDING.x + WC_BUILDING.w / 2, WC_BUILDING.y + WC_BUILDING.h / 2);
}
function drawTapCue(cx, cy) {
  const CYCLE = 2400, TRAVEL = 16;                  // ms per tap; px the hand glides
  const t = (performance.now() % CYCLE) / CYCLE;
  const TAU = Math.PI * 2;
  // continuous cosine glide: farthest at t = 0, touching at t = 0.5 — no stops, no jerks
  const reach = 0.5 - 0.5 * Math.cos(TAU * t);      // 0 = away, 1 = touching
  const press = Math.pow(Math.max(0, (reach - 0.8) / 0.2), 2); // eases in only right at the touch
  const since = (t + 0.5) % 1;                      // cycle fraction since the last touch
  ctx.save();
  // one soft ripple per touch
  const p = since / 0.7;
  if (p < 1) {
    const e = 1 - Math.pow(1 - p, 2);
    ctx.globalAlpha = 0.55 * (1 - p) * (1 - p);
    ctx.strokeStyle = "#ffd36b";
    ctx.lineWidth = 2.5 - 1.5 * p;
    ctx.beginPath(); ctx.arc(cx, cy, 8 + e * 26, 0, TAU); ctx.stroke();
  }
  // the touch point: a soft glow that breathes with the hand
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14 + 4 * press);
  glow.addColorStop(0, `rgba(255, 211, 107, ${0.55 + 0.3 * press})`);
  glow.addColorStop(1, "rgba(255, 211, 107, 0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, 18 + 4 * press, 0, TAU); ctx.fill();
  // the hand glides up until its fingertip meets the glow; it dips slightly on the press
  drawClickHand(cx, cy + (1 - reach) * TRAVEL, 1.2 * (1 - 0.06 * press));
  ctx.restore();
}

// The pointer-cursor hand, pointing north: index finger up, three folded fingers
// with their tips in a row, the thumb out on the left. White with a black outline;
// the index fingertip sits at (cx, cy).
function drawClickHand(cx, cy, k = 1.3) {
  const box = (x, y, w, h, r) => {                        // rr() without beginPath: parts add up into one path
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const capsule = (x, y, w, h) => box(x, y, w, h, w / 2);
  // the silhouette, part by part (local units ≈ px, fingertip at the origin)
  const parts = () => {
    ctx.beginPath();
    capsule(-4, 0, 8, 30);                                // index finger
    capsule(4, 11, 7, 19);                                // folded fingers
    capsule(11, 12.5, 7, 17.5);
    capsule(18, 14.5, 6.5, 15.5);
    box(-4, 22, 28.5, 19, 5);                             // palm
    ctx.save(); ctx.translate(-2, 33); ctx.rotate(-0.7);  // thumb, out to the left
    capsule(-3.5, -14, 7, 16); ctx.restore();
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);                                      // a slight natural tilt
  ctx.scale(k, k);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // soft drop shadow, then outline (thick), then the fill on top: the parts merge into one shape
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  parts(); ctx.strokeStyle = "#1d2333"; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  const g = ctx.createLinearGradient(0, 0, 0, 41);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e3e8f0");
  parts(); ctx.fillStyle = g; ctx.fill();
  // the gaps between the fingers
  ctx.strokeStyle = "rgba(29, 35, 51, 0.6)"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(4, 15); ctx.lineTo(4, 25);
  ctx.moveTo(11, 16); ctx.lineTo(11, 25);
  ctx.moveTo(18, 18); ctx.lineTo(18, 25);
  ctx.stroke();
  ctx.restore();
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
  mapZoom = clamp(mapZoom + (mapOpen ? 1 : -1) * raw * 2.5, 0, 1); // ~0.4 s zoom, also while paused
  wcZoom = clamp(wcZoom + (toolInHand ? 1 : -1) * raw * 3, 0, 1);  // ~0.3 s camera zoom onto the toilets while a tool is in hand
  // panels, one-time tips and the WC tutorials (brush: from the brush hand appearing until the left toilet is spotless;
  // change: while the hand points at a bill) hold the clock
  if (!paused && !modalOpen && !shopOpen && !arrivalInfoOpen && !wcTutHold()) {
    const dt = raw * speed;
    advanceSimulation(dt, timeDt);
    stepScrub(Math.min(0.25, elapsed)); // real seconds — the scrub ignores the speed tier
  }
  maybeShowArrivalInfo();
  drawScene();
  drawArrivalInfo();
  updateHUD();
  requestAnimationFrame(frame);
}

/* ------------------------------- Init ------------------------------- */
function init() {
  applyLanguageToShell();
  startLanguageObserver();
  const loaded = load();
  arrivalInfoDelayUntil = performance.now() + 1000;
  openingBus(); // the first bus starts rolling in as play begins

  const burgerMenu = $("burgerMenu");
  const burgerBackdrop = $("burgerBackdrop");
  const openBurger = () => {
    burgerMenu.classList.remove("hidden");
    burgerBackdrop.classList.remove("hidden");
  };
  const closeBurger = () => {
    burgerMenu.classList.add("hidden");
    burgerBackdrop.classList.add("hidden");
  };
  $("btnBurger").onclick = () => {
    if (burgerMenu.classList.contains("hidden")) openBurger();
    else closeBurger();
  };
  $("btnBurgerClose").onclick = closeBurger;
  burgerBackdrop.onclick = closeBurger;
  $("btnLanguage").textContent = gameLanguage === "en" ? "🌐 Türkçe" : "🌐 English";
  $("btnLanguage").onclick = () => {
    const next = gameLanguage === "en" ? "tr" : "en";
    const question = gameLanguage === "en"
      ? "Switch the game language to Turkish? The game will reload."
      : "Oyunun dili İngilizceye çevrilsin mi? Oyun yeniden yüklenecek.";
    if (!confirm(question)) return;
    save();
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch (e) { /* still switch for this reload */ }
    location.reload();
  };

  $("btnExit").onclick = () => setView("out");
  $("btnPause").onclick = () => {
    paused = !paused;
    updateHUD();
  };
  $("btnSpeed").onclick = () => {
    const i = SPEEDS.indexOf(speed);
    speed = i >= 0 ? SPEEDS[(i + 1) % SPEEDS.length] : 1;
    updateHUD();
  };
  const openShop = () => {
    if (modalOpen) return;
    closeBurger();
    shopOpen = true;
    renderShop();
    $("shop").classList.remove("hidden");
    $("btnShopClose").focus();
  };
  const closeShop = () => {
    shopOpen = false;
    $("shop").classList.add("hidden");
    save();
  };
  // testing aid: booked like any other money, so the ledger and totals stay consistent
  $("btnTestCash").onclick = () => {
    applyTransaction("testCash", 100000, null, "test");
    toast(`🧪 +${fmtTL(100000)} test parası`, "good");
    if (shopOpen) renderShop();
    save();
  };
  $("mapBtn").onclick = () => setMapOpen(!mapOpen);
  $("btnMapClose").onclick = () => setMapPanelOpen(false);
  document.addEventListener("pointerdown", e => {
    // canvas presses are routed by routePress (it toggles the panel itself)
    if (mapPanelOpen && e.target !== canvas && !$("mapPanel").contains(e.target)) setMapPanelOpen(false);
  }, true);
  $("mapPanel").addEventListener("click", e => {
    const btn = e.target.closest("button[data-sel], button[data-act]");
    if (btn && !btn.disabled) mapAction(btn);
  });
  $("cashChip").onclick = openShop;
  $("btnShopClose").onclick = closeShop;
  $("shop").addEventListener("click", e => {
    if (e.target === $("shop")) { closeShop(); return; } // the backdrop
    const btn = e.target.closest("button[data-act]");
    if (btn && !btn.disabled) shopAction(btn);
  });
  $("btnHelp").onclick = () => {
    closeBurger();
    paused = true;
    showIntro(false);
  };
  $("btnReset").onclick = () => {
    if (confirm(translateText("Bütün oyun sıfırlansın mı? Kayıtlı oyunun silinecek."))) resetGame();
  };
  // ---- canvas input: pointer events (one code path for mouse + touch) ----
  // toGame maps a pointer event into logical scene coordinates: the 960×540
  // core plus any widescreen extension, minus the centering offset. The
  // canvas is CSS-scaled, so the same math works on a 1280px desktop and a
  // phone.
  const toGame = (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = {
      x: (e.clientX - rect.left) * (Wdyn / rect.width) - offX,
      y: (e.clientY - rect.top) * (Hdyn / rect.height) - offY,
    };
    // the WC interior is drawn through its zoom camera: map the screen point back to the scene
    return S.view === "wc" ? wcCameraToBase(p.x, p.y) : p;
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
    if (arrivalInfoOpen) return; // the tutorial allows only its Anladım button
    // a press in the wash view starts a scrub/spray; holding the cleaning hose
    // sprays the stall under the pointer (per-cell cooldowns throttle the work)
    if (mapOpen) return; // the map only takes taps
    if (S.view === "wash") { pointerDown = true; washApply(x, y); }
    if (S.view === "wc" && toolInHand) { pointerDown = true; cleanApply(x, y); }
  });

  canvas.addEventListener("pointermove", (e) => {
    // a touch only tracks while its finger is down; the mouse always hovers
    if (e.pointerType !== "mouse" && activePointer !== e.pointerId) return;
    const { x, y } = toGame(e);
    pointer.x = x; pointer.y = y;
    if (arrivalInfoOpen) {
      if (e.pointerType === "mouse") canvas.style.cursor = arrivalInfoKind === "wc" && x >= WC_BUILDING.x && x <= WC_BUILDING.x + WC_BUILDING.w
        && y >= WC_BUILDING.y && y <= WC_BUILDING.y + WC_BUILDING.h ? "pointer" : "default";
      return;
    }
    if (activePointer === e.pointerId) {
      // a held scrub/spray — the per-cell cooldown inside washApply throttles it
      if (S.view === "wash" && pointerDown) washApply(x, y);
      if (S.view === "wc" && pointerDown && toolInHand) cleanApply(x, y);
    }
    if (e.pointerType !== "mouse") return; // no hover cursor for touch
    if (mapOpen) { canvas.style.cursor = mapNodeAt(x, y) ? "pointer" : "default"; return; }
    const hit = (r, pad = 2) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
    let hot;
    if (S.view === "out") {
      hot = (G.flags.wcInfoSeen && hit(WC_BUILDING)) || carWashOpen() && buses.some(z => z.state === "stop" && !z.washDone
        && x >= z.cx - 36 - 2 && x <= z.cx + 36 + 2 && y >= LOT_NOSE - 2 && y <= z.cy + z.len / 2 + 2);
    } else if (S.view === "wash") {
      hot = hit(WASH.brush) || hit(WASH.hose);
      const bp = washToBus(x, y), Wn = WASH.wind;
      const onGlass = bp.x >= Wn.x && bp.x <= Wn.x + Wn.w && bp.y >= Wn.y && bp.y <= Wn.y + Wn.h;
      canvas.style.cursor = hot ? "pointer" : (onGlass ? "crosshair" : "default");
      return;
    } else if (toolInHand) {
      hot = toolStations().some(st => hit(st));
    } else {
      hot = COUNTER_IN.chips.some(c => hit(deskRect(chipHit(c), "drawer")))
        || (hasCologne() && hit(deskRect(COUNTER_IN.bottle, "bottle"))) || hit(deskRect(COUNTER_IN.intercom, "intercom")) || toolStations().some(st => hit(st))
        || !!runawayAt(x, y, 2);
    }
    canvas.style.cursor = hot ? "pointer" : (S.view === "wc" && toolInHand && stallAt(x, y) >= 0 ? "crosshair" : "default");
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
  canvas.addEventListener("dblclick", (e) => e.preventDefault());
  let lastTap = 0;
  canvas.addEventListener("touchend", (e) => {
    const now = performance.now();
    if (now - lastTap < 350) {
      e.preventDefault();
    }
    lastTap = now;
  }, { passive: false });

  // One settled press: routed per view (the former click handler). Fingers are
  // imprecise, so on touch the hit padding grows with the render scale until
  // every target is at least ~10 CSS px per side.
  function routePress(x, y, isMouse) {
    const scale = canvas.getBoundingClientRect().width / Wdyn; // CSS px per logical px
    const padMin = isMouse ? 0 : clamp(10 / scale, 4, 16);
    if (arrivalInfoOpen) {
      const { button } = arrivalInfoLayout();
      const onButton = arrivalInfoKind !== "wc" && x >= button.x - padMin && x <= button.x + button.w + padMin &&
        y >= button.y - padMin && y <= button.y + button.h + padMin;
      if (onButton) dismissArrivalInfo();
      // the WC tip points at the restroom: clicking that building accepts it and walks in
      else if (arrivalInfoKind === "wc" && x >= WC_BUILDING.x - 2 - padMin && x <= WC_BUILDING.x + WC_BUILDING.w + 2 + padMin
        && y >= WC_BUILDING.y - 2 - padMin && y <= WC_BUILDING.y + WC_BUILDING.h + 2 + padMin) { dismissArrivalInfo(); setView("wc"); }
      return; // other clicks elsewhere can't activate scene items
    }
    if (mapOpen) {
      const id = mapNodeAt(x, y, padMin);
      if (!id) { if (mapPanelOpen) setMapPanelOpen(false); return; }     // empty map: close the panel
      if (mapPanelOpen && mapSel === id) setMapPanelOpen(false);           // the open terminal again: close
      else mapSelect(id);                                                  // another terminal (or none open): show it
      return;
    }
    const hit = (r, pad = 2) => {
      const p = Math.max(pad, padMin);
      return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p;
    };
    if (S.view === "out") {
      // outdoor scene: walk into the WC building, or step up to a parked bus
      // the WC opens with its info popup: before that the building ignores clicks
      // (before the first bus, setView still shows the "WC opens with the first bus" toast)
      if (hit(WC_BUILDING)) { if (G.flags.wcInfoSeen || !G.flags.firstBusParked) setView("wc"); return; }
      const b = buses.find(z => z.state === "stop" && !z.washDone
        && x >= z.cx - 36 - 2 - padMin && x <= z.cx + 36 + 2 + padMin && y >= LOT_NOSE - 2 - padMin && y <= z.cy + z.len / 2 + 2 + padMin);
      if (b && !carWashOpen()) toast(`🔒 Oto yıkama yok — ${fmtTL(tierCost(G.activeTerminal, CONFIG.carWashTiers[0]))} ile kurulabilir`, "");
      else if (b) openWash(b);
      return;
    }
    if (S.view === "wash") {
      // at the bus front: the only tap targets are the two tool stations (exit is the HTML #btnExit) — the windshield is worked by holding and dragging
      // (pointerdown/pointermove → washApply), so a plain tap there does nothing.
      const b = bus();
      if (!b) return;
      // a tap picks a tool up; tapping the one already in hand puts it down
      const w = ensureWash(b);
      if (hit(washDef().combo ? WASH.hose : WASH.brush)) { w.tool = w.tool === "brush" ? "none" : "brush"; return; }
      if (!washDef().combo && hit(WASH.hose)) { w.tool = w.tool === "hose" ? "none" : "hose"; return; }
      return;
    }
    // change tutorial: only the bill the hand points at responds
    const tutBill = changeTutNext();
    if (tutBill != null) {
      if (hit(deskRect(chipHit(COUNTER_IN.chips.find(c => c.d === tutBill)), "drawer"))) {
        giveChange(tutBill);
        if (tutBill === 20) G.flags.changeTutDone = true;
        save();
      }
      return;
    }
    // inside the counter room: the hose station, till chips, cologne bottle, tea intercom (exit is the HTML #btnExit)
    for (const st of toolStations()) // tap picks up / puts down that station's hose
      if (hit(st)) { if (!brushTutCleaning()) toolInHand = toolInHand === st ? null : st; return; }
    if (toolInHand) { // holding a tool: a tap off the stalls puts it back (the zoomed-in view hides the stations)
      if (S.view === "wc" && stallAt(x, y, 0) < 0 && !brushTutCleaning()) toolInHand = null;
      return; // other desk/counter interactions and runaway catching are blocked while holding
    }
    const chip = COUNTER_IN.chips.find(c => hit(deskRect(chipHit(c), "drawer")));
    if (chip) { giveChange(chip.d); save(); return; }
    if (hasCologne() && hit(deskRect(COUNTER_IN.bottle, "bottle"))) { offerCologne(); save(); return; }
    if (hit(deskRect(COUNTER_IN.intercom, "intercom"))) { orderTea(); save(); return; }
    const p = runawayAt(x, y, isMouse ? 2 : 8);
    if (p && catchRunaway(p)) return; // a runaway bound for the side passage — catch them
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
    hose: () => ({ inHand: !!toolInHand, apply: cleanApply, stallClean: S.stallClean, bay: stallBay, at: stallAt }),
    scrub: () => scrub,
    catchRunaway, fleeCounter, stormOut, giveUpLine, runawayAt,
    evaders: () => buses.flatMap(b => b.pax).filter(p => p.unpaid),   // every guest who used the WC and never paid
    runaways: () => buses.flatMap(b => b.pax).filter(p => p.runaway), // running for the exit right now: the catchable ones
    game: () => G, loaded, save, shopOpen: () => shopOpen, renderShop,
    parkingSpaces, activeParkingSlots, parkingUpgradeStatus, upgradeParkingLot,
    toastLog: () => toastLog, runtimeOf: id => runtime[id], boundId: () => boundId,
    mapOpen: () => mapOpen, mapPanelOpen: () => mapPanelOpen, mapZoom: () => mapZoom, mapSel: () => mapSel, setMapOpen, setMapPanelOpen,
    mapNode: id => mapPos(termDef(id).map), mapState,
    sim: () => S, buses: () => buses, facilities: () => facilities,
    // traffic controller (tests): live cars, owners, zones, and switches for the random traffic
    cars: () => cars, setCars: list => { cars = list; }, setAutoTraffic: v => { autoTraffic = !!v; },
    PHASE, trafficOwners, reservedZones, laneVehicles, maneuverZones, maneuverClear, maneuverBlockers, trafficControl,
    traceTraffic: on => { trafficTrace = on ? [] : null; }, trafficTrace: () => trafficTrace,
    spawnBus, finishEnter, rebuildFacilities, enterGeom, exitGeom, laneCy, BAY_SLOTS, LANE_BAND, ROAD_CAR_LENGTH, ROAD_CAR_GAP,
    offX: () => offX, Wdyn: () => Wdyn,
    // drive the scheduler directly: `sec` real seconds at the current speed tier, in 1/30 s frames
    advance: sec => { for (let i = Math.round(sec * 30); i > 0; i--) advanceSimulation(speed / 30, speed / 30); },
    setSpeed: v => { speed = v; }, speed: () => speed, paused: () => paused,
    frame: (dt, timeDt) => advanceSimulation(dt, timeDt), // one raw frame, e.g. a hidden-tab catch-up
    activeStalls, tool: () => Object.keys(CONFIG.cleaningTools).find(k => CONFIG.cleaningTools[k] === cleaningTool()), toolInHand: () => !!toolInHand,
    unlockTerminal, switchTerminal, terminalStatus, tierCost,
    performMaintenance, repairFailure, maintenanceStatus, autoSystems: () => autoSystems(term()), absNow,
    applyTransaction, purchaseUpgrade, carWashStatus, finishWash, wcUpgradeStatus, finalizePayment,
    // logical scene point -> CSS client point, for synthesizing real pointer input
    toClient: (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + (x + offX) * r.width / Wdyn, y: r.top + (y + offY) * r.height / Hdyn }; },
    stations: () => toolStations().map(st => ({ x: st.x + st.w / 2, y: st.y + st.h / 2 })),
    windRect: () => { const Z = WASH.zoom, Wn = WASH.wind; return { x: Z.cx + (Wn.x - Z.cx) * Z.s, y: Z.y1 + (Wn.y - Z.y0) * Z.s, w: Wn.w * Z.s, h: Wn.h * Z.s }; },
    washTools: () => ({ brush: { x: WASH.brush.x + WASH.brush.w / 2, y: WASH.brush.y + WASH.brush.h / 2 }, hose: { x: WASH.hose.x + WASH.hose.w / 2, y: WASH.hose.y + WASH.hose.h / 2 } }),
    bayCenter: i => { const r = stallBay(i); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; },
  };
  window.addEventListener("keydown", e => {
    if (e.key === "t" || e.key === "T") { roadDebug = !roadDebug; return; } // traffic debug overlay
    if (arrivalInfoOpen) return; // the tip closes only from its on-screen button
    // the panel owns the keyboard while open (Tab / Enter / Space work its buttons)
    if (shopOpen) { if (e.key === "Escape" || e.key === "u" || e.key === "U") closeShop(); return; }
    if ((e.key === "u" || e.key === "U") && !modalOpen && !mapOpen) { openShop(); return; }
    if ((e.key === "m" || e.key === "M") && !modalOpen) { setMapOpen(!mapOpen); return; }
    if (mapOpen) {
      if (e.key === "Escape") { setMapOpen(false); return; }
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step) {
        e.preventDefault();
        const ids = CONFIG.terminals.map(d => d.id);
        mapSelect(ids[(ids.indexOf(mapSel) + step + ids.length) % ids.length]);
        return;
      }
    }
    if (e.code === "Space") { e.preventDefault(); paused = !paused; }
    // keys 1-4 pick the speed tier (1x / 10x / 100x / 200x)
    const tier = "1234".indexOf(e.key);
    if (tier >= 0) speed = SPEEDS[tier];
    if ((e.key === "e" || e.key === "E" || e.key === "Escape") && !modalOpen) {
      if (e.key === "Escape" && !burgerMenu.classList.contains("hidden")) {
        closeBurger();
        return;
      }
      // any interior view (counter room, car wash) steps back outside; from
      // outside the key keeps its original counter-room shortcut
      if (!mapOpen) setView(S.view === "out" ? "wc" : "out");
    }
  });
  window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { releasePointer(); save(); } });

  if (S.view === "wc") { markWcVisited(); wcEnteredAt = performance.now(); } // a save made mid-way through the old WC tutorial
  if (loaded.status !== "new" && loaded.status !== "loaded") showLoadNotice(loaded);

  requestAnimationFrame(frame);
}

init();
