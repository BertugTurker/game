# 🚌 Layover Lane — Bus Rest-Stop Simulator

A browser game about building a roadside rest-stop business on the **İstanbul → Trabzon** bus route. You start with two primitive squat toilets, a small hand brush and ₺500. You serve guests by hand, earn every lira at the counter, and reinvest it: better toilets, better tools, a car wash, then automation, and finally a network of terminals that run while you look elsewhere.

**Manual labor → better equipment → better facilities → automation → multi-terminal management.**

The in-game text is Turkish.

## How it works

### Buses, guests, clock
- 🚌 Buses stop for a layover of about **30 minutes** (a full hour in the terminal is the hard cap). **Each terminal's own reputation** sets how often buses come (every ~1.2–2 h at rep 0, every 9–15 min at rep 100) and how full they are, so a busy terminal runs several buses at once.
- 🕐 One in-game hour takes **6 real minutes at 1×**. Speed tiers are 1× / 10× / 100× / 200×. The simulation keeps counting while the tab is in the background.
- 🍔 Guests eat for free at the diner (3 seats) and wander the lot.
- ★ **Reputation (0–100, per terminal)** comes from guest and bus ratings: cleanliness, waiting, change, cologne, washes. Breakdowns cost 2 reputation.

### The toilets
- Guests use a stall (1–10 game minutes), then queue at the counter to pay **₺20**. You take the bill and hand back change from the ₺10 / ₺20 / ₺50 trays. Guests count the bills: the same total in the fewest bills rates best (₺30 as 10+20 beats 10+10+10).
- Guests with an exact ₺20 use their own **second line** and pay on their own.
- When a bus is ready to leave, guests still in line get 5–10 minutes; after that they leave **without paying**. About 3 in 100 guests run for the exit instead. Tap one before they get out and they scrub every toilet.
- **Each stall has its own cleanliness**, which drops with every visit. Guests take the cleanest free stall and never step into one below the filth bar. If every stall is that filthy, nobody uses the WC until you clean.
- **Clean by hand**: pick up the tool at a station beside the stalls, then hold and drag over a free stall. A closed door means someone is inside.

### WC upgrades (🏗 İşletme panel)

The WC has five **separate** upgrade tracks. Each is bought one level at a time, per terminal, independently of the others. A new company starts with 2 alaturka toilets and a small hand brush, and **no cologne and no calculator**.

| Track | Levels (price) |
|---|---|
| Stall count | 2 (start) → 4 (₺800) → 6 (₺1,600) → 8 (₺3,000) → 10 (₺5,000). New stalls open spotless; unbuilt bays are boarded up |
| Toilets | primitive alaturka (start: ratings −6, dirtier visits) → modern toilets (₺1,000) → semi-automated (₺10,000: free stalls self-clean 60/h, +8 after each visit) → fully automated (₺25,000: 120/h, +14 per visit, the counter makes crisp change itself). A new style replaces every built fixture, spotless |
| Cleaning equipment | small hand brush (start, 8/s) → long-handled brush (₺300, 12/s) → mop kit (₺600, 16/s) → hose (₺3,000, 33/s, the original game's rate) |
| Cologne | none (start) → lemon cologne 500 ml (₺300, +8 rating) → large 1 L bottle (₺900) → luxury lavender (₺2,000, +12 rating). The bottle refills at midnight |
| Calculator | none (start: work out the change yourself) → calculator (₺250: shows the change still owed) |

### Car wash
- **Locked at the start. Unlocking costs ₺8,000 and nothing else** (no reputation requirement).
- Manual wash: tap a parked bus, soap the windshield with the long-handled brush, then rinse with the hose. A finished windshield pays its fee once.

| Tier | Price | Fee | What changes |
|---|---|---|---|
| 1 Manual wash | ₺8,000 | ₺50 | the original brush + hose wash |
| 2 Improved equipment | ₺5,000 | ₺60 | wider tools, stronger soap/rinse, rep +3 |
| 3 Advanced equipment | ₺12,000 | ₺75 | wider still, rep +4 |
| 4 Semi-automated wash | ₺20,000 | ₺75 | a gantry washes one parked bus at a time (10 game min) |
| 5 Fully automated wash | ₺40,000 | ₺75 | every parked bus at once (5 game min) |

A wash only pays if it finishes while the bus is still parked.

### Automation and maintenance
- Installing the first automated system starts a **daily maintenance** schedule (every 24 game hours). The panel shows condition, time left, and a "Bakım yap" (do maintenance) button that costs the systems' upkeep: ₺300 / ₺450 for toilets, ₺300 / ₺500 for the wash.
- Equipment wears 1.5 points per game hour, or 4 per hour once maintenance is overdue. Breakdown risk grows with wear and triples when overdue.
- A **breakdown stops that system** until you repair it (₺800 toilets, ₺1,000 wash). Meanwhile you can still do the job by hand.
- Automated systems charge a **daily running cost at midnight**.
- 🔧 on the cash chip (pulsing red) means some terminal needs maintenance or a repair.

### Terminals and the regional map
- Press **M** or the 🗺 button to zoom out to the regional map. It shows owned terminals (green, with reputation, today's income and 🔧), terminals you can buy (amber) and locked ones (grey), all with prices. The side panel lists requirements (✓/✗), the buy button, and "Bu terminale geç" (switch to this terminal).

| Terminal | Price | Requirements | Comes with | Upgrade prices |
|---|---|---|---|---|
| Bolu Dağı | owned | — | 2 alaturka toilets, rep 10 | ×1 |
| Gerede | ₺15,000 | a terminal at rep 40+ | 4 modern stalls, brush, cologne, calculator, rep 25 | ×1.2 |
| Tosya | ₺40,000 | rep 60+, 2 terminals | 6 modern stalls, mop, cologne, calculator, manual car wash, rep 30 | ×1.4 |
| Samsun | ₺90,000 | rep 75+, 3 terminals, semi-automated toilets somewhere | 10 modern stalls, hose, 1 L cologne, calculator, wash tier 2, rep 35 | ×1.6 |

- **Every owned terminal keeps running** when you aren't looking at it: buses, guests, automated service, revenue, wear, deadlines and breakdowns. From unseen terminals only maintenance-due and breakdown notices are shown, labelled with the terminal's name.
- All terminals share **one company cash balance**. Each has its own reputation, facilities, buses and maintenance.

### Money
- Revenue comes only from **completed, paid** services: toilet fees and finished washes. Change handed back beyond what was owed is booked as a loss.
- Expenses: upgrades, terminals, maintenance, repairs and automation running costs.
- Every transaction is booked exactly once in a ledger (the panel shows the latest). A purchase you can't afford, or whose requirements aren't met, is refused and changes nothing.
- ⏰ At midnight each terminal's day closes and you get a summary: buses, guests, income, spending, company cash, washes, missed fees, average satisfaction, reputation change.

## Controls

| Input | Action |
| --- | --- |
| `Space` | Pause / resume |
| `1` – `4` | Speed tier: 1× / 10× / 100× / 200× |
| `E` / `Escape` | Step into the WC / back outside (Escape closes an open menu, map or panel first) |
| `U` / tap the **cash chip** | Business panel (WC upgrades, car wash, maintenance, transactions); the clock holds while it's open |
| `M` / 🗺 button | Regional map; arrow keys move the selection |
| Click the **WC building** | Step behind the counter |
| Click a **parked bus** | The car wash (once unlocked) |
| Click a **tool station** (inside) | Pick up / put down the brush, mop or hose |
| Hold & drag on a **stall** (inside) | Clean it (doors closed = someone inside) |
| Click the **cash trays** (inside) | Hand back ₺10 / ₺20 / ₺50 |
| Click the **cologne bottle** (inside, once bought) | Splash cologne on the guest at the counter |
| Click a **runaway** (inside) | Catch them — they scrub every toilet |
| Click **brush** / **hose**, hold & drag on the windshield | Soap, then rinse |
| ☰ menu | Status, pause, speed, help, reset, İşletme, Harita |

Everything works by touch: taps for clicks, hold-and-drag for cleaning and washing.

## Saving

- The game **autosaves** to `localStorage` (key `layover-lane-v7`): every 8 game hours, when the tab is hidden, and when the page closes.
- **Old saves are migrated, not reset.** A pre-progression save (`layover-lane-v6` / `-v5` / `-v3`) becomes one terminal on the classic setup it had: 10 stalls, hose, cologne, calculator, manual car wash. Reputation, clock, buses, guests and stall dirt are kept, and cash starts at ₺0, because the old game had no money. The old key is left untouched as a backup.
- v7 saves from the old combined toilet tiers (1–6) are mapped onto the WC tracks they amounted to, and keep the calculator they already had. A mop kit from the old equipment store becomes the mop level of the cleaning track.
- An unreadable or unknown-version save is **copied to `layover-lane-corrupt-<timestamp>`** before anything can overwrite it, and the game tells you.
- **↺ Reset** (menu) asks first, then deletes the current save and the legacy keys and starts a new company.

## Run locally

No build step. Open `index.html` in a modern browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Tests

```sh
node tests/run.mjs   # Node ≥ 22; uses your installed Google Chrome (CHROME=/path/to/chrome to override)
```

The test runner has no dependencies. It serves the game with `python3 -m http.server`, drives headless Chrome over the DevTools protocol, and checks the game through `window.__Layover`. It also generates a real v6 save by running the original game from commit `26ebdd3`, so migration is tested against genuine data.

It covers about 345 checks across 16 areas:
- new game setup and the opening bus;
- migration and corrupt-save handling;
- the counter rules;
- cleaning tools and car washing, using real mouse and touch input;
- purchases and that failed ones change nothing;
- automation, maintenance and breakdowns;
- the map and terminals;
- background simulation at every speed, with checks that switching never duplicates guests or money;
- keyboard, touch and phone layout;
- autosave.

Screenshots go to `$TMPDIR/layover-shots`.

## Tech

Vanilla HTML, CSS and JavaScript. One `<canvas>` scene plus a small DOM UI layer, with no dependencies and no build tools.

- `index.html`: page shell (menu drawer, cash chip, map panel, business panel, modal)
- `style.css`: dark theme
- `game.js`: `CONFIG` (all prices and balance values), the authoritative state `G`, the simulation, rendering and input
- `tests/run.mjs`: the browser test harness
- `IMPLEMENTATION_PLAN.md`: how the progression was built, phase by phase

## On your phone

Open the page in your phone's browser. The game wants **landscape**: a portrait phone shows a rotate prompt, and the scene fits landscape screens of any size. On wide screens the sky, lot and road stretch to fill the window while the terminal stays centred. Hit targets grow on touch screens and the help text switches to touch wording.

## Publish on GitHub Pages

There's no build step, so GitHub Pages serves the files as they are: push to a repository, then go to **Settings → Pages**, choose *Deploy from a branch*, pick `main` and `/` (root), and save.

## License

[MIT](LICENSE). Do whatever you like; attribution appreciated.
