"use strict";

/* =====================================================================
   LAYOVER LANE — Bus Rest-Stop Tycoon
   Tour buses run Hilltown (A) → Seaside (B) and pull into your layover.
   You run the diner and the toilets. Serve guests, build reputation,
   attract more buses, and become the region's most famous rest stop.
   ===================================================================== */

/* ----------------------------- Config ------------------------------ */
const W = 960, H = 540;
const SECONDS_PER_HOUR = 10;          // real seconds per in-game hour (at 1x)
const BAY_X = 340;                    // bus left edge when stopped in the bay
const LANE_Y = 418;                   // main road lane (feet line)
const BAY_Y = 372;                    // service road (feet line)
const GRASS = { top: 280, bot: 352 };
const SVC   = { top: 352, bot: 376 };
const ROAD  = { top: 376, bot: 500 };

const STALLS_R = [1, 2, 2, 3, 3];     // diner seats per level 1..5
const STALLS_T = [2, 3, 3, 4, 4];     // toilet stalls per level 1..5

const COST = {
  restaurant: [0, 0, 200, 500, 1200, 2500],  // index = level to reach
  toilet:     [0, 0, 150, 400, 1000, 2200],
  marketing:  [0, 150, 450, 900],            // index = level to reach (starts 0)
  ambiance:   [0, 100, 300, 700],
};
const MAXL = { restaurant: 5, toilet: 5, marketing: 3, ambiance: 3 };

const PRICE_MEAL  = L => 3 + 2 * L;         // diner level -> $
const PRICE_DRINK = L => 2 + 1.5 * L;
const PRICE_WC    = L => 1 + L;
const COGS_MEAL   = L => 1.5 + 0.6 * L;
const COGS_DRINK  = L => 0.8 + 0.35 * L;
const COGS_WC     = L => 0.5 + 0.25 * L;
const SVC_TIME_R  = L => Math.max(3, 9 - 1.2 * L);   // real seconds per served guest
const SVC_TIME_T  = L => Math.max(2.5, 6.5 - 0.8 * L);
const CLEAN_COST  = 8;
const FAME_GOAL   = 10000;

const DEST_A = "Hilltown", DEST_B = "Seaside";
const SAVE_KEY = "layover-lane-v1";

/* ---------------------------- Small utils --------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const lerp  = (a, b, t) => a + (b - a) * t;
const fmt$  = n => "$" + Math.round(n).toLocaleString("en-US");

// Deadlines (stopEnd, boardAt, nextBusAt...) may sit on the other side of
// the midnight 24->0 clock wrap. Cyclic-safe: true if target is now/past.
// (All targets are set < 12h ahead, so this is unambiguous.)
function reached(t) {
  const e = (S.time - t + 24) % 24;
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
let confetti = [];
let facilities = { R: { spots: [], queue: [] }, T: { spots: [], queue: [] } };
let paused = false;
let speed = 1;
let moneyShown = S.money;   // animated display value

function freshState() {
  return {
    money: 200,
    day: 1,
    time: 8,                 // hours, 0..24
    rep: 50,                 // 0..100
    levels: { restaurant: 1, toilet: 1, marketing: 0, ambiance: 0 },
    cleanliness: 100,        // toilets 0..100
    nextBusAt: 9.5,
    nextBusId: 1,
    fame: false,
    lastSave: 0,
    stats: freshDayStats(50),
  };
}
function freshDayStats(rep) {
  return {
    earned: 0, spent: 0, buses: 0, served: 0, satSum: 0, satN: 0,
    repStart: rep == null ? S.rep : rep,
  };
}

/* --------------------------- Save & load ---------------------------- */
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, S, buses }));
  } catch (e) { /* private mode etc. */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.v !== 1) return false;
    S = Object.assign(freshState(), data.S);
    S.levels = Object.assign({ restaurant: 1, toilet: 1, marketing: 0, ambiance: 0 }, data.S.levels);
    S.stats = Object.assign(freshDayStats(), data.S.stats);
    buses = data.buses || [];
    rebuildFacilities();
    return true;
  } catch (e) { return false; }
}
function rebuildFacilities() {
  facilities = { R: { spots: [], queue: [] }, T: { spots: [], queue: [] } };
  for (const b of buses) for (const p of b.pax) {
    if (p.state === "waitR") facilities.R.queue.push(p);
    else if (p.state === "serveR") facilities.R.spots.push({ pax: p, t: SVC_TIME_R(S.levels.restaurant) * 0.5 });
    else if (p.state === "waitT") facilities.T.queue.push(p);
    else if (p.state === "serveT") facilities.T.spots.push({ pax: p, t: SVC_TIME_T(S.levels.toilet) * 0.5 });
  }
}

/* ------------------------------- Buses ------------------------------ */
const BUS_KINDS = {
  small: { len: 170, pax: [8, 14] },
  mid:   { len: 210, pax: [16, 26] },
  big:   { len: 250, pax: [28, 44] },
};

function busInterval() {
  const mkt = S.levels.marketing;
  const repFactor = 0.6 + S.rep / 100;   // 0.6 .. 1.6
  return Math.max(1.2, (4.8 - 0.7 * mkt) / repFactor + rand(0, 1.5));
}

function spawnBus() {
  const mkt = S.levels.marketing;
  const roll = Math.random();
  const kind = roll < 0.68 - mkt * 0.1 ? "small" : roll < 0.9 - mkt * 0.08 ? "mid" : "big";
  const def = BUS_KINDS[kind];
  const n = Math.max(4, Math.round(rand(def.pax[0], def.pax[1]) * (0.55 + S.rep / 130)));
  const hue = pick([8, 28, 145, 200, 260, 330]);
  const pax = [];
  for (let i = 0; i < n; i++) pax.push(makePax());
  const b = {
    id: S.nextBusId++,
    kind, len: def.len, hue,
    from: DEST_A, to: DEST_B,
    x: -def.len - rand(20, 160),
    baseY: LANE_Y,
    state: "drive",
    minStopAt: S.time + 0.1,
    stopStart: 0, stopEnd: 0,
    stoppedOnce: false,
    pax,
  };
  buses.push(b);
  toast(`🚌 Tour bus from ${DEST_A} inbound — ${n} passengers`, "");
}

function makePax() {
  return {
    x: 0, y: 0, tx: 0, ty: 0,
    hue: randInt(0, 359),
    hunger: rand(30, 85), thirst: rand(35, 85), bladder: rand(20, 70),
    state: "bus",
    offAt: 0, boardAt: 0,
    want: null,
    patience: 0, waitReal: 0, idleT: 0,
    sat: null, refuseR: false, refuseT: false,
  };
}

function doorX(b) { return b.x + b.len - 38; }
function doorY(b) { return b.baseY + 6; }

/* ---------------------------- Passengers ---------------------------- */
function startStop(b) {
  b.state = "stop";
  b.stoppedOnce = true;
  b.stopStart = S.time;
  b.stopEnd = S.time + rand(2, 3.5);
  for (const p of b.pax) {
    p.offAt = b.stopStart + Math.random() * (b.stopEnd - b.stopStart) * 0.55;
    p.boardAt = b.stopEnd - rand(0.05, 0.15);
  }
}

function endStop(b) {
  b.state = "drive";
  for (const p of b.pax) {
    if (p.state === "serveR" || p.state === "serveT") continue; // let them finish, they'll board after
    if (p.state !== "bus") p.state = "board";
  }
  // reputation outcome
  let sum = 0;
  for (const p of b.pax) {
    const s = p.sat !== null ? p.sat
      : (p.state === "serveR" || p.state === "serveT") ? 60
      : 25;
    sum += s;
  }
  const avg = sum / b.pax.length;
  const delta = clamp((avg - 50) * 0.15 * (b.pax.length / 12), -6, 6);
  S.rep = clamp(S.rep + delta, 0, 100);
  S.stats.buses++;
  const stars = avg > 80 ? "★★★★★" : avg > 65 ? "★★★★☆" : avg > 45 ? "★★★☆☆" : avg > 25 ? "★★☆☆☆" : "★☆☆☆☆";
  toast(`🚌 Bus to ${DEST_B} departed · ${stars} (${Math.round(avg)} avg) · rep ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`, delta >= 0 ? "good" : "bad");
}

function evaluate(p, bus) {
  if (reached(p.boardAt)) { goDoor(p, bus); return; }
  if (!p.refuseT && p.bladder > 72) { p.want = "T"; tryJoin("T", p, bus); return; }
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
  const stalls = fac === "R" ? STALLS_R[S.levels.restaurant - 1] : STALLS_T[S.levels.toilet - 1];
  const svc = fac === "R" ? SVC_TIME_R(S.levels.restaurant) : SVC_TIME_T(S.levels.toilet);
  p.patience = (f.queue.length) * (svc / stalls) + 8;
  p.waitReal = 0;
}

function wander(p) {
  p.state = "walk";
  p.tx = rand(600, 930);
  p.ty = rand(GRASS.top + 18, GRASS.bot - 8);
  p.idleT = 0;
}

function goDoor(p, bus) {
  p.state = "board";
  p.tx = doorX(bus);
  p.ty = doorY(bus);
}

/* --------------------------- Facilities ----------------------------- */
function updateFacilities(dt) {
  const rL = S.levels.restaurant, tL = S.levels.toilet;
  stepFac("R", dt, STALLS_R[rL - 1], SVC_TIME_R(rL));
  stepFac("T", dt, STALLS_T[tL - 1], SVC_TIME_T(tL));
  // toilet cleanliness recovers slowly
  S.cleanliness = clamp(S.cleanliness + 6 * (dt / SECONDS_PER_HOUR) * (1 + tL * 0.4), 0, 100);
}

function stepFac(name, dt, stalls, svcTime) {
  const f = facilities[name];
  const drain = 1 * (1 - S.levels.ambiance * 0.12);
  // queue patience
  for (let i = f.queue.length - 1; i >= 0; i--) {
    const p = f.queue[i];
    p.waitReal += dt;
    p.patience -= dt * drain;
    if (reached(p.boardAt)) { f.queue.splice(i, 1); goDoor(p, findBusOf(p)); continue; }
    if (p.patience <= 0) {
      f.queue.splice(i, 1);
      if (name === "R") p.refuseR = true; else p.refuseT = true;
      p.state = "walk"; wander(p);
    }
  }
  // open spots pull from the queue
  while (f.spots.filter(s => s).length < stalls && f.queue.length) {
    const p = f.queue.shift();
    p.state = name === "R" ? "serveR" : "serveT";
    f.spots.push({ pax: p, t: svcTime });
  }
  // normalize spots array
  f.spots = f.spots.filter(s => s);
  while (f.spots.length < stalls) f.spots.push(null);
  // running services
  for (const s of f.spots) {
    if (!s) continue;
    s.t -= dt;
    if (s.t <= 0) { completeService(name, s.pax); s.pax = null; s.t = -1; }
  }
  f.spots = f.spots.filter(s => s && s.pax) ;
  while (f.spots.length < stalls) f.spots.push(null);
}

function findBusOf(p) {
  for (const b of buses) if (b.pax.includes(p)) return b;
  return null;
}

function completeService(name, p) {
  const rL = S.levels.restaurant, tL = S.levels.toilet;
  let sat, price, cogs;
  if (name === "R") {
    const food = p.hunger >= p.thirst;
    if (food) { price = PRICE_MEAL(rL); cogs = COGS_MEAL(rL); p.hunger = 10; }
    else      { price = PRICE_DRINK(rL); cogs = COGS_DRINK(rL); p.thirst = 10; }
    sat = 52 + (rL - 1) * 6 + S.levels.ambiance * 4;
  } else {
    price = PRICE_WC(tL); cogs = COGS_WC(tL);
    p.bladder = 10;
    S.cleanliness = clamp(S.cleanliness - rand(3, 6), 0, 100);
    sat = 52 + (tL - 1) * 6 + S.levels.ambiance * 4;
    if (S.cleanliness < 40) sat -= (40 - S.cleanliness) * 0.5;
  }
  sat -= Math.max(0, p.waitReal - 8) * 0.5;
  sat = clamp(sat + rand(-8, 8), 0, 100);

  const mult = 0.7 + (sat - 50) / 100 * 0.6;   // 0.7 .. 1.3
  const net = price * mult - cogs;
  S.money += net;
  S.stats.earned += price * mult;
  S.stats.spent += cogs;
  if (sat > 85) {
    const tip = Math.round(price * 0.4);
    S.money += tip;
    S.stats.earned += tip;
    if (sat > 89) toast(`💵 Happy guest tips ${fmt$(tip)}`, "good");
  }
  p.sat = sat;
  p.refuseR = p.refuseT = false;
  p.waitReal = 0;
  S.stats.served++;
  S.stats.satSum += sat;
  S.stats.satN++;
  S.rep = clamp(S.rep + (sat - 50) * 0.02, 0, 100);

  // where does the guest go next?
  const bus = findBusOf(p);
  if (bus && reached(p.boardAt)) {
    if (bus.state === "stop") { p.state = "walk"; goDoor(p, bus); }
    else p.state = "bus"; // bus already pulled out — consider it boarded
  }
  else if (bus && bus.state === "stop") {
    p.state = "free"; p.idleT = rand(1, 3);
    p.tx = p.x; p.ty = p.y;
  } else {
    p.state = "walk";
    if (bus) goDoor(p, bus); else wander(p);
  }
  checkFame();
}

function cleanToilets() {
  if (S.money < CLEAN_COST) { toast("Not enough cash to clean", "bad"); return; }
  S.money -= CLEAN_COST;
  S.stats.spent += CLEAN_COST;
  S.cleanliness = 100;
  toast("🧻 Toilets sparkling clean!", "good");
}

/* ------------------------------ Update ------------------------------ */
function update(dt) {
  // clock
  S.time += dt / SECONDS_PER_HOUR;
  if (S.time >= 24) { S.time -= 24; S.day++; showDaySummary(); }

  // bus spawning
  const bayBusy = buses.some(b => b.state === "stop" || (b.state === "drive" && b.x < BAY_X + 320));
  if (reached(S.nextBusAt) && !bayBusy && buses.length < 4) {
    spawnBus();
    S.nextBusAt = S.time + busInterval();
  }

  // buses
  for (let i = buses.length - 1; i >= 0; i--) {
    const b = buses[i];
    if (b.state === "drive") {
      b.x += 185 * dt;
      b.baseY = lerp(b.baseY, LANE_Y, Math.min(1, dt * 3));
      if (!b.stoppedOnce && b.x >= BAY_X && reached(b.minStopAt) && !buses.some(o => o !== b && o.state === "stop")) {
        startStop(b);
      }
      if (b.x - b.len > W + 60) buses.splice(i, 1);
    } else {
      b.baseY = lerp(b.baseY, BAY_Y, Math.min(1, dt * 3));
      if (reached(b.stopEnd)) endStop(b);
    }
    // passengers
    for (const p of b.pax) updatePax(p, b, dt);
  }

  updateFacilities(dt);
  updateCars(dt);
  updateConfetti(dt);

  // animated money
  moneyShown = lerp(moneyShown, S.money, Math.min(1, dt * 6));

  checkFame();

  if (S.time - S.lastSave > 8) { S.lastSave = S.time; save(); }
}

function updatePax(p, bus, dt) {
  if (p.state === "bus") {
    p.x = doorX(bus); p.y = doorY(bus);
    riseNeeds(p, dt);
    if (bus.state === "stop" && reached(p.offAt) && !reached(p.boardAt)) {
      p.state = "walk"; p.want = null;
      p.tx = doorX(bus); p.ty = doorY(bus) + 4;
    } else if (reached(p.boardAt)) {
      p.state = "board"; p.tx = doorX(bus); p.ty = doorY(bus);
    }
    return;
  }

  riseNeeds(p, dt);

  // disembarked: walk toward target
  if (p.state === "walk" || p.state === "board") {
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = 55 * dt;
    if (d <= step) {
      p.x = p.tx; p.y = p.ty;
      if (p.state === "board") { p.state = "bus"; }
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
    if (p.state === "waitR") { p.x = 676 - 16 * (i + 1); p.y = 350 - (i % 2) * 3; }
    else { p.x = Math.min(940, 866 + 16 * (i + 1)); p.y = 350 - (i % 2) * 3; }
    return;
  }

  if (p.state === "serveR") { p.x = 690; p.y = 351; return; }
  if (p.state === "serveT") { p.x = 852; p.y = 351; return; }
}

function riseNeeds(p, dt) {
  const h = dt / SECONDS_PER_HOUR;
  p.hunger = clamp(p.hunger + 38 * h, 0, 100);
  p.thirst = clamp(p.thirst + 45 * h, 0, 100);
  p.bladder = clamp(p.bladder + 55 * h, 0, 100);
}

/* ------------------------------- Cars ------------------------------- */
let carTimer = 3;
function updateCars(dt) {
  carTimer -= dt;
  if (carTimer <= 0) {
    carTimer = rand(4, 9);
    cars.push({ x: W + 40, y: 448, hue: randInt(0, 359), v: -rand(120, 190) });
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    cars[i].x += cars[i].v * dt;
    if (cars[i].x < -80) cars.splice(i, 1);
  }
}

/* ----------------------------- Day / fame --------------------------- */
function checkFame() {
  if (!S.fame && S.money >= FAME_GOAL) {
    S.fame = true;
    toast(`🏆 ${fmt$(FAME_GOAL)}! Layover Lane is the region's star rest stop!`, "good");
    burstConfetti();
  }
}

function burstConfetti() {
  for (let i = 0; i < 90; i++) {
    confetti.push({
      x: W / 2, y: 200,
      vx: rand(-160, 160), vy: rand(-220, -40),
      life: rand(1.5, 3),
      hue: randInt(0, 359),
    });
  }
}
function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.vy += 300 * dt;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.life -= dt;
    if (c.life <= 0 || c.y > H) confetti.splice(i, 1);
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

const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * 240, s: Math.random() * 1.6 + 0.4 }));
const trees = [ { x: 60, s: 1.1 }, { x: 150, s: 0.8 }, { x: 250, s: 1.2 }, { x: 930, s: 0.9 } ];

function drawScene() {
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
    const sx = lerp(60, W - 60, f), sy = 220 - Math.sin(f * Math.PI) * 160;
    ctx.fillStyle = "#ffd75e";
    ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill();
  } else {
    const f = clamp(((S.time + 24 - 19) % 24) / 11, 0, 1);
    const mx = lerp(60, W - 60, f), my = 200 - Math.sin(f * Math.PI) * 130;
    ctx.fillStyle = "#e8ecf5";
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, 7); ctx.fill();
    ctx.fillStyle = skyColors(S.time)[0];
    ctx.beginPath(); ctx.arc(mx + 7, my - 4, 13, 0, 7); ctx.fill();
  }

  // mountains
  ctx.fillStyle = mix("#3c6e58", "#141d33", nf * 0.8);
  ctx.beginPath();
  ctx.moveTo(0, GRASS.top);
  ctx.lineTo(0, 210); ctx.lineTo(140, 130); ctx.lineTo(300, 220); ctx.lineTo(430, 150);
  ctx.lineTo(590, 235); ctx.lineTo(740, 140); ctx.lineTo(900, 225); ctx.lineTo(W, 180); ctx.lineTo(W, GRASS.top);
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

  drawSign();
  drawRestStop();
  drawRoads();
  for (const c of cars) drawCar(c);
  for (const b of buses) drawBus(b);
  for (const b of buses) for (const p of b.pax) if (p.state !== "bus") drawPax(p);

  // night overlay + lights
  if (nf > 0.05) {
    ctx.fillStyle = `rgba(8, 12, 34, ${0.34 * nf})`;
    ctx.fillRect(0, 0, W, H);
    if (nf > 0.4) {
      // warm window glow
      ctx.fillStyle = `rgba(255, 190, 90, ${0.5 * nf})`;
      ctx.fillRect(630, 312, 26, 22); ctx.fillRect(700, 312, 26, 22); ctx.fillRect(750, 312, 26, 22);
      ctx.fillRect(826, 316, 20, 18); ctx.fillRect(858, 316, 20, 18);
      // headlight cones
      for (const b of buses) {
        const hg = ctx.createLinearGradient(b.x + b.len, 0, b.x + b.len + 90, 0);
        hg.addColorStop(0, `rgba(255,240,180,${0.35 * nf})`);
        hg.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(b.x + b.len - 4, b.baseY - 52);
        ctx.lineTo(b.x + b.len + 90, b.baseY - 30);
        ctx.lineTo(b.x + b.len + 90, b.baseY - 8);
        ctx.lineTo(b.x + b.len - 4, b.baseY - 30);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  for (const c of confetti) {
    ctx.fillStyle = `hsla(${c.hue}, 80%, 60%, ${clamp(c.life, 0, 1)})`;
    ctx.fillRect(c.x, c.y, 5, 5);
  }
}

function drawSign() {
  const x = 470, y = 208;
  ctx.fillStyle = "#8a6a3d";
  ctx.fillRect(x + 18, y + 44, 8, 100);
  ctx.fillRect(x + 96, y + 44, 8, 100);
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
  rr(ctx, 615, 292, 180, 60, 6); ctx.fill();
  // awning stripes
  const rL = S.levels.restaurant;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? "#f4ede0" : mix("#d94f3d", "#3a2430", nf * 0.7);
    ctx.fillRect(615 + i * 18, 306, 18, 12);
  }
  // level: extra awning tiers + color richness
  if (rL >= 3) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(615, 318, 180, 3); }
  // windows
  ctx.fillStyle = mix("#ffe9b8", "#5a4a30", nf * 0.5);
  ctx.fillRect(630, 322, 26, 22); ctx.fillRect(700, 322, 26, 22); ctx.fillRect(750, 322, 26, 22);
  // door (serving point)
  ctx.fillStyle = "#5e3b22";
  ctx.fillRect(683, 324, 14, 28);
  // roof sign
  ctx.fillStyle = "#2b2117";
  rr(ctx, 660, 272, 90, 22, 5); ctx.fill();
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`DINER ${"•".repeat(rL)}`, 705, 287);
  ctx.textAlign = "left";

  // --- toilets ---
  const tL = S.levels.toilet;
  ctx.fillStyle = mix("#8d99ae", "#2c3547", nf * 0.7);
  rr(ctx, 812, 300, 78, 52, 6); ctx.fill();
  ctx.fillStyle = mix("#ffe9b8", "#5a4a30", nf * 0.5);
  ctx.fillRect(826, 316, 20, 18); ctx.fillRect(858, 316, 20, 18);
  ctx.fillStyle = "#3f4a5c";
  ctx.fillRect(845, 322, 12, 30); // door
  ctx.fillStyle = "#1d2333";
  rr(ctx, 818, 282, 66, 20, 5); ctx.fill();
  ctx.fillStyle = "#9fe8ff";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`WC ${"•".repeat(tL)}`, 851, 296);
  ctx.textAlign = "left";
  // cleanliness bar
  const cw = 66;
  ctx.fillStyle = "#0d1120";
  ctx.fillRect(818, 272, cw, 6);
  const cfrac = S.cleanliness / 100;
  ctx.fillStyle = cfrac > 0.6 ? "#5ad07a" : cfrac > 0.3 ? "#ffd36b" : "#ff6b6b";
  ctx.fillRect(818, 272, cw * cfrac, 6);
  // stink cloud when dirty
  if (S.cleanliness < 40) {
    const a = (40 - S.cleanliness) / 40 * 0.7;
    ctx.fillStyle = `rgba(120, 160, 90, ${a * (0.6 + 0.4 * Math.sin(performance.now() / 300))})`;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(884 + i * 8, 268 - i * 8, 6 + i * 2, 0, 7);
      ctx.fill();
    }
  }
}

function drawRoads() {
  const nf = nightFactor();
  // service road
  ctx.fillStyle = mix("#4a5261", "#1d232e", nf * 0.7);
  ctx.fillRect(0, SVC.top, W, SVC.bot - SVC.top);
  // main road
  ctx.fillStyle = mix("#3a4150", "#181d27", nf * 0.7);
  ctx.fillRect(0, ROAD.top, W, ROAD.bot - ROAD.top);
  // grass strip below
  ctx.fillStyle = mix("#58b368", "#1c3a2a", nf * 0.85);
  ctx.fillRect(0, ROAD.bot, W, H - ROAD.bot);

  // lane markings
  ctx.strokeStyle = `rgba(240, 230, 180, ${0.8 - nf * 0.3})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath(); ctx.moveTo(0, 438); ctx.lineTo(W, 438); ctx.stroke();
  ctx.setLineDash([]);
  // road edges
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ROAD.top + 3); ctx.lineTo(W, ROAD.top + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, ROAD.bot - 3); ctx.lineTo(W, ROAD.bot - 3); ctx.stroke();

  // bay marking + label
  ctx.strokeStyle = "rgba(255, 205, 80, 0.85)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([14, 10]);
  ctx.strokeRect(BAY_X - 30, SVC.top + 4, 300, SVC.bot - SVC.top - 8);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255, 205, 80, 0.9)";
  ctx.font = "bold 11px system-ui";
  ctx.fillText("BUS BAY", BAY_X - 8, SVC.bot - 8);

  // destination markers on the horizon road
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "11px system-ui";
  ctx.fillText(`${DEST_A} →`, 8, ROAD.top + 16);
  const tw = ctx.measureText(`${DEST_B} →`).width;
  ctx.fillText(`${DEST_B} →`, W - tw - 8, ROAD.top + 16);
}

function drawBus(b) {
  const x = b.x, y = b.baseY, len = b.len;
  const body = `hsl(${b.hue}, 55%, ${58 - nightFactor() * 15}%)`;
  // body
  ctx.fillStyle = body;
  rr(ctx, x, y - 78, len, 66, 12); ctx.fill();
  // skirt
  ctx.fillStyle = `hsl(${b.hue}, 40%, 30%)`;
  ctx.fillRect(x + 4, y - 20, len - 8, 10);
  // roof sign
  ctx.fillStyle = "#1d2333";
  rr(ctx, x + len / 2 - 34, y - 88, 68, 12, 4); ctx.fill();
  ctx.fillStyle = "#ffd36b";
  ctx.font = "bold 9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("TOUR  A → B", x + len / 2, y - 79);
  ctx.textAlign = "left";
  // windows + passenger heads
  for (let i = 0; i < 6; i++) {
    const wx = x + 14 + i * (len - 70) / 6;
    ctx.fillStyle = mix("#cfe8ff", "#26364e", nightFactor() * 0.8);
    rr(ctx, wx, y - 70, (len - 70) / 6 - 8, 20, 4); ctx.fill();
    // show a few heads
    const n = b.pax.length;
    if (i < n && n > 0) {
      const idx = Math.min(n - 1, Math.floor(i * n / 6));
      const p = b.pax[idx];
      if (p && p.state === "bus") {
        ctx.fillStyle = "#e8b88e";
        ctx.beginPath(); ctx.arc(wx + 6, y - 52, 4, 0, 7); ctx.fill();
      }
    }
  }
  // windshield (front = right)
  ctx.fillStyle = mix("#cfe8ff", "#26364e", nightFactor() * 0.8);
  rr(ctx, x + len - 26, y - 72, 16, 26, 4); ctx.fill();
  // door
  ctx.fillStyle = `hsl(${b.hue}, 30%, 22%)`;
  ctx.fillRect(x + len - 46, y - 56, 14, 44);
  ctx.fillStyle = `hsl(${b.hue}, 30%, 35%)`;
  ctx.fillRect(x + len - 43, y - 52, 8, 36);
  // wheels
  ctx.fillStyle = "#141821";
  for (const wx of [x + 34, x + len - 44]) {
    ctx.beginPath(); ctx.arc(wx, y - 10, 12, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a4150";
    ctx.beginPath(); ctx.arc(wx, y - 10, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#141821";
  }
  // route text
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 11px system-ui";
  ctx.fillText(`${b.from} → ${b.to}`, x + 16, y - 32);
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

function drawPax(p) {
  const x = p.x, y = p.y;
  ctx.fillStyle = `hsl(${p.hue}, 55%, 55%)`;
  rr(ctx, x - 3.5, y - 11, 7, 8, 3); ctx.fill();   // torso
  ctx.fillStyle = "#e8b88e";
  ctx.beginPath(); ctx.arc(x, y - 14, 3.4, 0, 7); ctx.fill(); // head
  ctx.fillStyle = "#2c3444";
  ctx.fillRect(x - 3, y - 4, 2.4, 4); ctx.fillRect(x + 0.8, y - 4, 2.4, 4); // legs
  // little indicators
  if (p.state === "serveR") {
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath(); ctx.arc(x + 6, y - 8, 2.5, 0, 7); ctx.fill();
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
}

function buildShop() {
  const shop = $("shop");
  shop.innerHTML = "";
  const defs = [
    {
      key: "restaurant", icon: "🍔", name: "Restaurant",
      desc: () => { const L = S.levels.restaurant;
        return `Meals ${fmt$(PRICE_MEAL(L))} · drinks ${fmt$(PRICE_DRINK(L))}<br>${STALLS_R[L - 1]} seat${STALLS_R[L - 1] > 1 ? "s" : ""} · faster service per level`; },
    },
    {
      key: "toilet", icon: "🚻", name: "Toilets",
      desc: () => { const L = S.levels.toilet;
        return `Admission ${fmt$(PRICE_WC(L))}<br>${STALLS_T[L - 1]} stall${STALLS_T[L - 1] > 1 ? "s" : ""} · cleanliness decays with use`; },
      extra: "clean",
    },
    {
      key: "marketing", icon: "📣", name: "Marketing",
      desc: () => `Buses stop more often and run bigger coaches.<br>Current mix favours ${S.levels.marketing ? "bigger" : "smaller"} buses.`,
    },
    {
      key: "ambiance", icon: "🪑", name: "Ambiance",
      desc: () => "Seating & décor: guests wait more patiently<br>and rate every visit higher.",
    },
  ];
  for (const d of defs) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = "card-" + d.key;
    card.innerHTML = `
      <h3><span>${d.icon} ${d.name}</span><span class="pips" id="pips-${d.key}"></span></h3>
      <div class="desc" id="desc-${d.key}"></div>
      <div id="btnwrap-${d.key}"></div>`;
    shop.appendChild(card);
  }
  refreshShop();
}

function refreshShop() {
  for (const key of ["restaurant", "toilet", "marketing", "ambiance"]) {
    const L = S.levels[key];
    const max = MAXL[key];
    const pips = $("pips-" + key);
    pips.innerHTML = "";
    for (let i = 0; i < max; i++) {
      const s = document.createElement("span");
      s.className = "pip" + (i < L ? " on" : "");
      pips.appendChild(s);
    }
    $("desc-" + key).innerHTML = descFns[key]();
    const wrap = $("btnwrap-" + key);
    wrap.innerHTML = "";
    if (L >= max) {
      const m = document.createElement("div");
      m.className = "extra"; m.textContent = "★ MAX LEVEL";
      wrap.appendChild(m);
    } else {
      const cost = COST[key][L + 1];
      const btn = document.createElement("button");
      btn.className = "buy" + (S.money >= cost ? " afford" : "");
      btn.disabled = S.money < cost;
      btn.textContent = `Upgrade — ${fmt$(cost)}`;
      btn.onclick = () => buy(key);
      wrap.appendChild(btn);
      if (key === "toilet") {
        const c = document.createElement("button");
        c.className = "extra";
        c.textContent = `🧽 Deep clean — ${fmt$(CLEAN_COST)}`;
        c.disabled = S.money < CLEAN_COST || S.cleanliness > 99;
        c.onclick = cleanToilets;
        wrap.appendChild(c);
      }
    }
  }
}
const descFns = {
  restaurant: () => { const L = S.levels.restaurant;
    return `Meals ${fmt$(PRICE_MEAL(L))} · drinks ${fmt$(PRICE_DRINK(L))}<br>${STALLS_R[L - 1]} seat${STALLS_R[L - 1] > 1 ? "s" : ""} · faster service per level`; },
  toilet: () => { const L = S.levels.toilet;
    return `Admission ${fmt$(PRICE_WC(L))}<br>${STALLS_T[L - 1]} stall${STALLS_T[L - 1] > 1 ? "s" : ""} · cleanliness decays with use`; },
  marketing: () => `Buses stop more often and run bigger coaches.`,
  ambiance: () => `Seating & décor: guests wait more patiently<br>and rate every visit higher.`,
};

function buy(key) {
  const L = S.levels[key];
  if (L >= MAXL[key]) return;
  const cost = COST[key][L + 1];
  if (S.money < cost) { toast("Not enough cash", "bad"); return; }
  S.money -= cost;
  S.stats.spent += cost;
  S.levels[key]++;
  rebuildFacilities(); // keep spot counts consistent after level change
  toast(`⬆ ${key[0].toUpperCase() + key.slice(1)} upgraded to level ${S.levels[key]}!`, "good");
  refreshShop();
  save();
}

/* --------------------------- HUD & modals --------------------------- */
function updateHUD() {
  $("statMoney").textContent = "💰 " + fmt$(moneyShown);
  const hh = Math.floor(S.time), mm = Math.floor((S.time % 1) * 60);
  $("statClock").textContent = `Day ${S.day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  $("repFill").style.width = S.rep + "%";
  $("repNum").textContent = Math.round(S.rep);
  $("btnPause").textContent = paused ? "▶" : "⏸";
  $("btnSpeed").textContent = speed + "×";
}

function showDaySummary() {
  paused = true;
  const st = S.stats;
  const wages = 10 + 8 * S.levels.restaurant + 6 * S.levels.toilet + 4 * S.levels.ambiance;
  const rent = 5 + 2 * (S.levels.restaurant + S.levels.toilet);
  const net = wages + rent;
  S.money -= net;
  const repDelta = S.rep - st.repStart;
  const avgSat = st.satN ? Math.round(st.satSum / st.satN) : 0;
  $("modalTitle").textContent = `Day ${S.day - 1} complete`;
  $("modalBody").innerHTML = `
    <table>
      <tr><td>Revenue (incl. tips)</td><td class="pos">${fmt$(st.earned)}</td></tr>
      <tr><td>Staff wages</td><td class="neg">−${fmt$(wages)}</td></tr>
      <tr><td>Rent</td><td class="neg">−${fmt$(rent)}</td></tr>
      <tr><td>Buses served</td><td>${st.buses}</td></tr>
      <tr><td>Guests served</td><td>${st.served}</td></tr>
      <tr><td>Avg satisfaction</td><td>${st.satN ? avgSat + " / 100" : "—"}</td></tr>
      <tr><td>Reputation</td><td class="${repDelta >= 0 ? "pos" : "neg"}">${Math.round(st.repStart)} → ${Math.round(S.rep)} (${repDelta >= 0 ? "+" : ""}${repDelta.toFixed(1)})</td></tr>
    </table>
    <div class="big">Cash on hand: ${fmt$(S.money)}</div>`;
  $("modalBtn").textContent = `Start day ${S.day} →`;
  $("modalBtn").onclick = () => {
    S.stats = freshDayStats();
    hideModal();
  };
  showModal();
}

let modalOpen = false;
function showModal() { $("modal").classList.remove("hidden"); modalOpen = true; }
function hideModal() { $("modal").classList.add("hidden"); modalOpen = false; paused = false; save(); }

function showIntro(first) {
  $("modalTitle").textContent = first ? "👋 Welcome to Layover Lane" : "How to play";
  $("modalBody").innerHTML = `
    <div class="big">You run the layover every tour bus between <strong>${DEST_A}</strong> and <strong>${DEST_B}</strong> relies on.</div>
    <p>🚌 Buses pull into your bay for rest breaks. Passengers get hungry, thirsty, and desperate for the <strong>toilet</strong>.</p>
    <p>🍔 <strong>Upgrade your diner</strong> — more seats, better food, higher prices.</p>
    <p>🚻 <strong>Keep the toilets clean</strong> (deep clean button) and add stalls.</p>
    <p>★ Satisfied guests raise your <strong>reputation</strong> → more &amp; bigger buses stop.</p>
    <p>⏰ Each day ends at midnight: wages and rent come out automatically.</p>
    <p>🏆 Goal: ${fmt$(FAME_GOAL)} on hand. Space pauses · 1/2 changes speed.</p>`;
  $("modalBtn").textContent = first ? "Open for business!" : "Back to work";
  $("modalBtn").onclick = () => hideModal();
  showModal();
}

/* ------------------------------ Main loop --------------------------- */
let last = performance.now();
function frame(now) {
  const raw = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused && !modalOpen) {
    const dt = raw * speed;
    update(dt);
  }
  drawScene();
  updateHUD();
  requestAnimationFrame(frame);
}

/* ------------------------------- Init ------------------------------- */
function init() {
  const hadSave = load();
  moneyShown = S.money;
  rebuildFacilities();
  buildShop();
  setInterval(refreshShop, 400);

  $("btnPause").onclick = () => { paused = !paused; };
  $("btnSpeed").onclick = () => { speed = speed === 1 ? 2 : 1; };
  $("btnHelp").onclick = () => { paused = true; showIntro(false); };
  $("btnReset").onclick = () => {
    if (confirm("Reset the whole game? Your save will be deleted.")) {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  };
  window.addEventListener("keydown", e => {
    if (e.code === "Space") { e.preventDefault(); paused = !paused; }
    if (e.key === "1") speed = 1;
    if (e.key === "2") speed = 2;
  });
  window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

  if (!hadSave) { paused = true; showIntro(true); }
  else if (S.fame) toast("🏆 You reached fame! Keep the business running.", "good");

  requestAnimationFrame(frame);
}

init();
