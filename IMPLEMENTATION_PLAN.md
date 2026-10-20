# Layover Lane — Progression Implementation Plan

Goal: manual labor → better equipment → better facilities → automation → multi-terminal management,
without replacing the working simulation in `game.js`.

## Audit findings (pre-Phase 1)

- **Files**: `index.html` (shell, burger drawer HUD, modal), `style.css`, `game.js` (~5.5k lines: sim + canvas render + input), `sw.js` (pass-through), `manifest.json`.
- **State**: one global `S` (clock `time/day/lastSave`, `rep`, `stallClean[10]`, `bottle`, `tea`, `view`, `washBus`, `nextBusAt`, `slotVacantSince`, `nextBusId`, `stats`). Module globals `buses` (saved) and `facilities` (R/T/C queues + spots — rebuilt from pax states on load, never saved).
- **Clock**: `frame()` → `update(dt, timeDt)`; `timeDt` follows the wall clock × speed (hidden-tab catch-up, capped 1 day), sub-stepped to ≤2 s. Deadlines are absolute game hours compared with the wrap-safe `reached()`.
- **Money**: none. The ₺20 fee and change are a ritual only; no cash balance exists anywhere.
- **Reputation**: single `S.rep`; moved by `finishVisit`, `endStop`, `finishWash`. Drives `busInterval`, `maxGap`, bus passenger counts.
- **Save**: `localStorage["layover-lane-v6"]` = `{v:6,S,buses}`; load accepts v3–v6 plus legacy keys `-v5`/`-v3`, with per-version fix-ups (stall arrays, wash grid resample, bus pose model, scrub restart, slot de-dup). A parse failure silently returns "no save" and the next autosave overwrites the broken data.
- **Rendering** reads `S`/`buses`/`facilities` directly; drawing never awards money. `drawWashView` may call `setView("out")` (view-only).
- **Input**: pointer events (mouse+touch) → `routePress` per view; keys Space / 1–4 / E / Escape; burger drawer buttons.
- **Tests**: none in the repo (a `window.__Layover` hook exists for a harness that is not checked in).

## Architecture decisions

1. **One authoritative state `G`**: `{ version, clock, company, activeTerminal, terminals{id: T}, flags, migratedFrom }`. Shared cash lives in `G.company`, never inside a terminal.
2. **Terminal object `T`**: `{ id, owned, toilet{tier}, carWash{unlocked,tier}, equipment{}, maintenance{…}, sim, buses }`. `sim` is the former `S` minus the clock — each terminal owns its rep, stalls, stats, bus schedule.
3. **Binding instead of rewriting**: `bindTerminal(id)` points the existing globals `S`, `buses`, `facilities` at a terminal. The whole existing sim/render code keeps working unchanged. Runtime-only data (`facilities`) lives in a non-saved `runtime[id]` map.
4. **One scheduler**: `advanceSimulation(dt, timeDt)` keeps the existing sub-stepping, advances the shared clock **once** per sub-step, then steps every owned terminal (bind → `stepTerminal`). Background terminals therefore share the exact same clock and rules; switching terminals only changes the binding, so nothing can be duplicated.
5. **Centralized `CONFIG`**: save keys/version, economy, new-game values, toilet & car-wash tier tables, terminal definitions, maintenance values. No balance literals elsewhere.
6. **Ledger**: every money movement goes through one function (`applyTransaction`) that validates, applies once, records `{id, day, time, terminal, kind, amount}`, and updates per-kind totals. Optional purchases validate first and mutate nothing on failure.
7. **Save v7** under a **new key** `layover-lane-v7`; legacy keys are read for migration but never written or deleted (they stay as a backup). Unreadable/unknown-version data is copied to `layover-lane-corrupt-<ts>` before anything can overwrite it, and the player is told.
8. **Legacy saves** (v3–v6) migrate to one owned terminal on the "classic" profile — toilet tier 4 (10 stalls, hose, cologne), car wash unlocked at manual tier — so no existing mechanic or progress is lost. Rep, clock, buses, guests, stalls are preserved. Legacy had no money, so cash starts at `CONFIG.economy.migratedCash`. `flags.firstBusDone = true` so the 3-second first bus is never replayed.
9. **Stall count per tier**: the 10-bay art stays; unbuilt bays render boarded-up. Tiers grow the active stall count (2 → 4 → 6 → 10), so the existing 10-stall row is reached at tier 4 alongside the hose.

## Toilet tiers (CONFIG.toiletTiers, provisional)

| Tier | Cost | Stalls | Cleaning | Other |
|---|---|---|---|---|
| 1 Primitive alaturka | start | 2 | small hand brush (slow, manual) | no hose / cologne / automation |
| 2 Improved toilets | ₺1,000 | 4 | hand brush | slower dirtying, +satisfaction, cologne bottle |
| 3 Better cleaning tools | ₺2,000 | 6 | unlocks the mop kit (₺600 equipment, bought then assigned): 16/s vs 8/s | — |
| 4 Advanced equipment | ₺5,000 | 10 | hose (existing mechanic) | — |
| 5 Semi-automated | ₺10,000 | 10 | free stalls self-clean 60/h + 8 after each visit | maintenance + failures |
| 6 Fully automated | ₺25,000 | 10 | 120/h + 14 per visit, counter makes crisp change itself | maintenance + failures |

Car wash: locked → unlock ₺8,000 (cash only) → improved ₺5,000 → advanced ₺12,000 → semi-auto ₺20,000 → full auto ₺40,000. Revenue only on completed paid washes.

## Phases

- [x] **Phase 1 — Audit & foundation**: CONFIG, `G` state, terminal binding, single scheduler, save v7, legacy migration, corrupt-save backup + message, reset clears every readable key. New games still play exactly as before (classic profile) until Phase 2.
- [x] **Phase 2 — New-game progression**: new-game profile (₺500, rep 10, tier 1: 2 alaturka stalls + hand brush, no car wash), brush cleaning, boarded-up bays, first bus ≤3 s real time (one-shot flag).
- [x] **Phase 3 — Economy & upgrades**: `applyTransaction`, fee revenue in `finalizePayment`, cash HUD, upgrade panel (price, prerequisite, benefit, disabled reason), atomic `purchaseUpgrade` / `purchaseEquipment`.
- [x] **Phase 4 — Car wash progression**: locked lot hint, unlock for cash only, paid washes, equipment tiers (bigger brush/hose reach, faster rinse).
- [x] **Phase 5 — Automation & maintenance**: auto-cleaning, auto-pay, auto wash; per-terminal condition/wear, daily maintenance deadline, breakdowns, repairs, notifications.
- [x] **Phase 6 — Terminal network**: regional map view (canvas), terminal panel, `unlockTerminal`, switching.
- [x] **Phase 7 — Background simulation**: verify unselected terminals run on the shared scheduler; suppress/prefix their toasts; test switching at every speed tier.
- [x] **Phase 8 — Integration & regression**: full test run, browser check, README + plan update.

## Testing

`tests/run.mjs` — zero-dependency harness: starts `python3 -m http.server`, launches the locally installed headless Chrome, drives it over the DevTools protocol (Node's built-in `WebSocket`), seeds `localStorage` fixtures, and asserts through `window.__Layover`. The legacy fixture is generated by running the **original** game (git `HEAD`) in the browser, so migration is tested against a real v6 save.

## Phase log

### Phase 1 — done (2026-10-19)

- `game.js`: `CONFIG` (save keys/version, economy, profiles, toilet + car-wash tier tables, terminal defs); `G` state (`freshGame`, `freshTerminal`, `freshSim`); `bindTerminal` / `adoptGame`; clock moved from `S` to `G.clock` (27 refs); `update()` split into `advanceSimulation` (sub-stepping, clock, midnight, autosave, loops owned terminals) + `stepTerminal`; save v7 with `restoreGame` / `migrateLegacy` / `fixupTerminal` (old per-version fix-ups kept verbatim) / `parkCorrupt`; `resetGame` clears v7 + all legacy keys; `showLoadNotice`; day-summary resets every terminal's stats; `__Layover` gains `game/loaded/save/sim/buses/facilities/advance/setSpeed`.
- `tests/run.mjs`: 81 checks, all passing — new-game state, clock advances once per step, counter change-making + exact-₺20 line, unattended run (arrivals, departures, 1-hour cap, rep bounds), v7 round trip, real v6 migration, v5 migration, corrupt / future-version / missing-cash / damaged-terminal saves, autosave, reset. Screenshots of the notice, outdoor and WC scenes checked by eye.
- Not yet changed on purpose: new games still use the classic profile (rep 50, 10 stalls); no money flows; tier/maintenance fields are stored but have no effect until Phases 2–5.
- Known: `index.html` / help copy still say "no profit, no upgrades" (update with Phase 3); toasts from background terminals will need a terminal prefix (Phase 7).

### Phase 2 — done (2026-10-19)

- `CONFIG`: `profiles.starter` (rep 10, tier 1, car wash locked) is now `newGameProfile`; toilet tiers carry `stalls`, `tool`, `cologne`, `dirtUse`, `satBonus`, `style`; `cleaningTools` (hand brush 8/s, mop 16/s, hose 33.3/s = the original +5 per 150 ms); `firstBusLead`.
- Sim: bays are built from the aisle outward (`STALL_ORDER`); stall choice, queue patience, "all filthy" checks, averages, save restore and the runaway scrub only consider built stalls. Visit dirt and rating use the tier's `dirtUse` / `satBonus` (tier 4 values equal the original game's, so migrated saves play unchanged).
- Cleaning: `hoseApply` → `cleanApply`, rate and reach from the tier's tool; stations draw a bucket + brush/mop below tier 4, the original hose from tier 4.
- Gates: cologne (logic, hit target, prompt, drawing) needs a tier with `cologne`; car wash (`openWash`, bus tap → "locked" toast with the unlock price, hover, hint) needs `carWash.unlocked`.
- Opening bus: `openingBus()` runs at init and in `stepTerminal`; it spawns once just short of bay 1 (`G.flags.firstBusDone`, saved), so it pulls in ~1–1.5 s after play starts and is never replayed by a load.
- Rendering: boarded-up bays, the alaturka pan with its own grime layers.
- Help copy: cleaning tool, alaturka note, cologne and car-wash paragraphs follow what the terminal has.
- Tests: 112 checks pass (31 new): starting terminal, first bus < 3 s real time at 1× on the live rAF loop, brush vs hose rates via synthesized pointer input, boarded bays uncleanable, gates, built-stalls-only occupancy, no opening-bus replay, plus all Phase 1 checks (classic/migrated games keep 10 stalls, hose rate, manual car wash).
- Known: tier 3's mop is currently implied by the tier — Phase 3 makes it a purchasable, assignable equipment item. Tiers 2–6 are reachable only through Phase 3 purchases.

### Phase 3 — done (2026-10-19)

- Economy: `applyTransaction(kind, amount, terminal, note, mandatory)` is the only place cash changes (validated, unique id, capped ledger, per-kind totals, per-terminal daily revenue/expenses, "+₺20" floats). `collectPayment` books the fee once per visit from `finalizePayment` (`p.feePaid`, reset in `enterCounter`); overpaid change is a separate `changeLoss`. Unpaid, interrupted or abandoned visits book nothing. `WC_PRICE` removed — `CONFIG.economy.toiletFee` drives the charge, the WC sign, help text and day summary.
- Purchases: `toiletUpgradeStatus` / `purchaseUpgrade` (sequential tiers, automation tiers refused until Phase 5 via `CONFIG.automationReady`), `equipmentStatus` / `purchaseEquipment` (into the company store, `G.equipment`), `assignEquipment` (to a terminal meeting `minTier`, or back to the store). All validate first and change nothing on failure. A tier purchase opens new bays spotless; a style change (alaturka → modern) replaces every fixture.
- Tools: `cleaningTool()` = best of the tier's fixture and equipment assigned here; tier 3 no longer implies the mop.
- UI: cash chip under the menu button (opens the panel), cash + terminal in the drawer, "🏗 İşletme" panel (U / chip / drawer; Esc closes; clock holds while open): summary, toilet tiers with benefits generated from CONFIG, price buttons, disabled reasons, equipment buy/assign, car-wash status, last 8 transactions. Day summary adds revenue, expenses, company cash. Help and page description updated.
- State: `terminal.equipment` replaced by company-level `G.equipment` + `G.nextEquipId` (sanitized on load; items at a missing terminal return to the store).
- Tests: 153 checks pass (41 new): fees exactly once incl. exact line and double-finalize, overpaid change, unpaid guests, cash = start + ledger, failed purchases leave state byte-identical (insufficient cash, tier skip, unmet requirement, unknown track, unowned terminal), tier 2/3 effects, mop buy → store → assign → measurably faster cleaning, panel via keyboard + DOM clicks with price/disabled checks, save/load of tiers, equipment and ledger; the migrated game now earns fees.
- Known: car-wash purchase and wash revenue are Phase 4; tiers 5–6 are listed but unavailable until Phase 5.

### Phase 4 — done (2026-10-19)

- `CONFIG.carWashTiers` now carries each tier's `fee`, `reach`, `soap`, `rinse`, `cd`, `rep`, `sat` (tier 1 = the original wash's exact constants; fees ₺50 / ₺60 / ₺75; tiers 4–5 marked `auto`, not for sale until Phase 5).
- `washApply` / `finishWash` / `endStop` read the terminal's tier (`washDef()`). A finished windshield books `carWashFee` once (guarded by `w.done`), adds the tier's reputation, and the bus keeps `washSat` for its departure rating. Unfinished washes book nothing.
- `carWashStatus` + `purchaseUpgrade(id, "carWash", tier)`: tier 1 is the unlock — cash only, no reputation check — then one tier at a time; validated first, no side effects on failure.
- UI: panel "OTO YIKAMA" section (unlock + tiers, generated benefits, prices, disabled reasons, "İtibar şartı yok"); wash view shows tier name and fee, scales the in-hand brush and spray with the tier's reach, pops the fee; help text names the fee.
- Tests: 184 checks pass (31 new), washing with real pointer drags: cash-only unlock at rep 0, refusals leave state unchanged, tap a bus → wash view, brush soaps / hose rinses, fee only on completion and only once, tier 3 vs tier 1 with identical sparse passes (32% grime left vs finished), ₺75 fee and +4 rep at tier 3, panel prices = config, DOM unlock, save/load.

### Phase 5 — done (2026-10-19)

- Automation (`stepAutomation`, `autoCounter`, `autoCleanAfterVisit`, all on sim time inside `stepTerminal`, so every owned terminal runs it): tier 5 toilets self-clean free stalls (60/h) and run a cleaning cycle after each visit (+8); tier 6 does 120/h, +14 per visit, and the counter hands back crisp change after 3 sim s (the player can still serve first). Car wash tier 4 gantry washes one parked bus at a time (10 game min), tier 5 every parked bus (5 game min); the bus being hand-washed is left to the player. Fees only on completion, through the same `finishWash`.
- Maintenance (`CONFIG.maintenance`, per-tier `upkeep` / `opCost`): installing the first automated system starts a 24 h schedule. `maintenanceTick` runs once per elapsed game hour (absolute hours, `absNow()`): wear 1.5/h, 4/h when overdue; breakdown roll per system (risk grows with wear², ×3 when overdue); due notice once. A breakdown stops that system (manual work still possible), costs 2 reputation, and needs `repairFailure` (₺800 / ₺1,000). `performMaintenance` costs the summed upkeep, restores condition, books the next deadline. Midnight books each terminal's automation running cost (`operating`, mandatory).
- `CONFIG.automationReady` removed; automated tiers are for sale.
- UI: panel "BAKIM" section (systems, condition, time to deadline / overdue, running cost, "Bakım yap" and "Onar" buttons with disabled reasons); cash chip shows 🔧 and pulses red when any terminal needs maintenance or repair; progress bar + 🤖 over buses on the gantry; WC tag "OTO TEMİZLİK (+ GİŞE)" / "OTOMASYON ARIZALI"; help paragraph when automation is installed.
- Finding fixed during testing: with free-time cleaning only, a busy tier-6 WC still went filthy (avg 22 after 4 unattended hours) because stalls are rarely free — added the per-visit cleaning cycle (now stays clean unattended).
- Tests: 227 checks (43 new), 3 consecutive clean runs. Self-clean rate measured at exactly 60/h, crisp auto-change, 4 unattended hours (fees, clean stalls, empty line), due after a day, overdue wear 4/h, maintenance refused without cash / charged ₺450 / resets, forced breakdown stops cleaning and the counter, repair refused at ₺799 / charged ₺800, one ₺250 operating charge per midnight, semi vs full gantry, ₺75 per finished auto wash only, identical wear at 10× and 200×, maintenance state survives reload.
- Known: background terminals' toasts are not yet labelled/suppressed (Phase 7). The ledger keeps the latest 200 lines; per-kind totals are complete.

### Phase 6 — done (2026-10-19)

- `CONFIG.terminals`: Bolu Dağı (start), Gerede ₺15,000 (rep 40+), Tosya ₺40,000 (rep 60+, 2 terminals), Samsun ₺90,000 (rep 75+, 3 terminals, toilet tier 5 somewhere) — each with a starting `profile` (facilities + rep), `devCost` multiplier on its upgrade prices, map position, pylon name. `CONFIG.mapEnds` places İstanbul / Trabzon.
- `terminalRequirements` / `terminalStatus` / `unlockTerminal` (validated, one `terminal` transaction, new terminal built from its profile and bound only long enough to rebuild its queues; others untouched) / `switchTerminal` (ends a running scrub, steps outside, rebinds — the scheduler already steps every owned terminal). `tierCost` applies `devCost` to validation, charge and display alike.
- Regional map (`drawMap`, `mapArea`, `mapNodeAt`, zoom transition in `drawScene`, `mapZoom` eased per real frame): sea, road through every terminal, owned / available / locked nodes with price or "★ rep · today's revenue · 🔧", current terminal ring, selection ring, legend. The sim keeps running under it.
- Map panel (DOM): terminal list (status), details (facilities, rep, today's revenue/expenses, devCost, requirements with ✓/✗, price button with disabled reason, "Bu terminale geç" / "Terminale dön"), result messages. Open with M, the 🗺 button under the cash chip, or the drawer; Esc / ✕ close; arrow keys move the selection; canvas taps select nodes.
- Day summary names the terminal and adds company-wide revenue/expenses when there are several; load defaults use each terminal's own profile.
- Tests: 264 checks (37 new), 3 consecutive clean runs.
- Known: background terminals' toasts are unlabelled (Phase 7); terminals share the same scene art (intentional, per scope).

### Phase 7 — done (2026-10-19)

- The background simulation itself was already structural (Phase 1: `advanceSimulation` steps every owned terminal per sub-step; all automation/maintenance on game time). This phase verified it and closed the gaps:
- Notices: `toast(msg, cls, important)` + `onScreen()`. From an unseen terminal, routine notices (bus arrivals, departures, "spotless", guests leaving unpaid…) are suppressed; important ones (breakdown, maintenance due) are shown prefixed "📍 <terminal> ·". The throttled "too dirty" / "runaway" toasts no longer let an unseen terminal use up the visible one's throttle window. `toastLog` keeps the recent notices (shown or not) for the tests.
- Test hooks: `toastLog`, `runtimeOf`, `boundId`, `frame(dt, timeDt)` (one raw frame, e.g. a hidden-tab catch-up).
- Tests: 303 checks (39 new), 3 consecutive clean runs. An unseen, fully automated Gerede keeps receiving and sending off buses, serving guests, earning from toilets and washes, wearing exactly 1.5/h, and moving its own reputation while Bolu stays on screen. Its notices are quiet except maintenance-due and breakdown (labelled); the cash chip flags it from Bolu; repair and maintenance work remotely. Instrumented scheduler: each terminal stepped exactly once per sub-step at 1×/10×/100×/200× with a switch mid-run, and the clock advanced exactly once. 24 switches across all speeds: every guest in exactly one bus of one terminal, unique bus ids, each terminal's queues hold only its own guests once, no money outside the ledger. Returning to a terminal gives back the same objects and state it left running. A 10-hour hidden-tab catch-up wears the unseen terminal exactly 10 ticks and charges each midnight once. Background progress survives save/load and resumes.
- Known: as before Phase 7, a very long hidden-tab catch-up is capped at one real day × the speed tier and integrates in at most 60 sub-steps per frame, so its far end is coarse (pre-existing design).

### Phase 8 — done (2026-10-19)

- Regression tests added for the remaining acceptance criteria: filth bar (all built stalls below 25 → nobody new steps in; a clean stall is used again; a stall below the bar never is), crisp-change signal, Space / 1–4 / E / Escape and the drawer's pause / speed / menu buttons, the 8-game-hour autosave, reputation within 0–100 at every terminal, and a touch-emulated 844×390 phone (scene fits the stage, help in touch wording, tap to enter the WC, tap to pick up the brush, finger-drag cleaning, map / panel by tap) plus the portrait rotate prompt.
- Independent code review of the whole diff; all findings verified and fixed:
  1. Saved day stats were copied as-is and rendered with `innerHTML` (markup injection from a tampered save). → `sanitizeStats` keeps known numeric fields only (stats and history).
  2. Day stats reset only on the summary button, so fees just after midnight were counted to the shown day and then wiped, and a long catch-up merged several days. → Each day closes at midnight: archived to `sim.history` (7 days), stats reset, the summary shows the archived day (and "+N days" when a catch-up crossed several); the button only closes the modal.
  3. A save with an `owned: false` terminal entry could make `unlockTerminal` charge and then fail. → Unowned entries are dropped on load (only owned terminals are ever stored).
  4. `adoptGame` was defined twice (dead first copy from Phase 1). → Removed.
- Panel: the maintenance section moves to the top only once there is automation to maintain.
- Docs: `README.md` rewritten for the implemented game (progression, tiers and prices, car wash, automation & maintenance, terminals & map, economy, controls, saving & migration, tests). `game.js` header comment updated.
- Final: **345 checks, 3 consecutive clean runs** (`node tests/run.mjs`, ~2 min).

## Remaining issues / not done

- **Browsers**: automated tests run in Chrome only (desktop + touch-emulated phone). Safari (where the drawer click fix matters) and Firefox were not tested.
- **Balance** values are the provisional ones from the brief, plus my own choices where it was silent: wash fees ₺50/60/75, mop ₺600, maintenance and repair costs, terminal prices and requirements. Tier-5 toilets can slowly slip on very busy days by design; tier 6 holds.
- **Migrated saves** start at ₺0 (`CONFIG.economy.migratedCash`), because the old game had no money.
- **Unseen manual terminals** lose most counter fees, because nobody makes change there. Exact-₺20 guests and automation still pay. This is intended (automate before you expand), but worth knowing.
- **Long hidden-tab catch-up** is capped at one real day × the speed tier, and its far end is integrated coarsely (pre-existing).
- **Display limits**: the ledger keeps the latest 200 lines (totals are complete); the day summary details the terminal on screen plus company-wide totals.
- **Art**: all terminals share the same scene art (only the pylon name differs).
- **Version label**: `index.html` still says v0.005 — bump it when you release.

### Separate WC upgrade tracks — done (2026-10-19)

- The combined `toiletTiers` ladder and the mop equipment store are replaced by `CONFIG.wcTracks`: stall count (2→10), toilet style (alaturka → modern → semi-auto → full-auto), cleaning tool (hand brush → long brush → mop → hose), cologne (none → 500 ml → 1 L → luxury), calculator (none → bought). Per terminal `t.wc = { count, style, tool, cologne, calc }`; `wcUpgradeStatus` / `purchaseUpgrade(id, track, level)`.
- New games start with 2 alaturka toilets and a hand brush, and no cologne or calculator. The calculator and the bottle are drawn only once they are bought. Bottle size comes from the cologne level.
- Old v7 saves (`toilet.tier`) are mapped by `OLD_TOILET_TIERS` and keep the calculator. Assigned or stored mop kits become tool level 3. Samsun requires `minToiletStyle: 3`.
- Tests: 357 checks pass.
