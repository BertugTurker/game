# 🚌 Layover Lane — Bus Rest-Stop Simulator

A browser game where you run the layover every tour bus on the **Hilltown → Seaside** route relies on. Buses pull into your bay for rest breaks, and passengers get hungry, thirsty, and *desperate* for the toilet. Your job: keep them satisfied.

Toilets cost ₺20, paid at the counter after the visit — and **you** work that counter from **inside** the WC building: take the bill, splash Turkish cologne, make change, clean the stalls with the hose. A settled guest heads straight back out through the EXIT door. But there's no profit and no upgrades — the money is just part of the ritual.

## How it works

- 🚌 Buses arrive and stop in your bay for a layover of about **30 minutes** (a full hour in the terminal is the hard cap), let passengers off, then drive away. **How often buses arrive scales with your reputation**: every ~1.2–2 hours at rep 0, every 9–15 minutes at rep 100 — far faster than a layover, so a high-rep terminal runs several buses at once and the whole lot stays moving, and a freed stall is never left empty for more than 30 minutes when the terminal is busy.
- 🕐 **Clock** — one in-game hour takes 6 real minutes at 1× (a full game day is 2.4 real hours; 10× runs it in about 14 min, 200× in under a minute). The simulation keeps counting while the tab is in the background, so come back to the clock where the real world left it.
- 🍔 **Restaurant** — guests eat and drink for free at the diner (3 seats).
- 🚻 **Toilets (₺20)** — the high-demand service. Click the WC building to step inside and work the counter: take the bill, splash Turkish cologne from the 500 ml bottle (refills at midnight — only while the guest is still paying), make change from the open cash drawer (₺10 / ₺20 / ₺50 trays) — then head back out through the EXIT door. Guests enter through the EXIT door and use one of the 10 stalls — a visit lasts **1–10 in-game minutes** — then queue at the counter to pay ₺20. A guest starts for the EXIT door the instant they're settled: an exact bill is done the moment they step up, and anyone whose change is complete walks straight out, so the line never waits on a settled guest. An LED queue counter on the wall beside the stalls (calculator-style green display) shows how many people are in the payment line, and the counter's own calculator displays the change you still owe the guest at the counter (000 when it's empty). Each stall carries its **own cleanliness** — it decays with every use, and the door closes once the guest has stepped in. **Grab the hose** on the counter (or the **🚿** button in the top bar) and hold & drag it over a free stall to spray it clean; a stall with a closed door can't be sprayed. Guests rate you on wait, change, and cleanliness. When a bus is ready to roll, guests in the payment line get 5–10 minutes to pay — anyone still in line then leaves **without paying** and boards, so the bus is never held hostage by the queue.
- 🚿 **Car wash** — buses roll in dusty. Click a parked bus (it pulses a 🚿 hint) to step up to its front: pick up the **long-handled brush** and drag it across the windshield to soap it up, then grab the **fresh-water hose** and rinse the soap off. The driver notices — a sparkling windshield earns reputation and a happier rating.
- ★ **Reputation (0–100)** — every guest rates their visit, and so does each departing bus. Higher reputation means buses stop **much more often** *and* arrive bigger — at full rep the lot stays nearly full.
- ⏰ At midnight the day ends and you get a summary: buses served, guests served, cologne served, windshields washed, average satisfaction, and how your reputation moved.

Neglect the toilets and reputation will show it — guests rate dirty visits badly, and word spreads.

## Controls

| Input | Action |
| --- | --- |
| `Space` | Pause / resume |
| `1` – `4` | Speed tier: 1× / 10× / 100× / 200× (top-bar button cycles) |
| `🚿` (top bar) | Grab the hose — step inside and clean the stalls |
| Click the **WC building** | Step inside — you're behind the counter now |
| Click a **parked bus** | Step up to its front — the car wash |
| Click **brush** / **hose** (wash view) | Pick up the long-handled brush, or the fresh-water hose (click again to put it down) |
| Hold & drag on the **windshield** | Scrub it, then rinse it — soap first, fresh water after |
| Click **EXIT** (wash view) | Step back outside |
| Click the **hose station** (inside) | Pick up / put down the cleaning hose (the 🚿 top-bar button does the same) |
| Hold & drag on a **stall** (inside) | Spray it clean — a stall with a closed door (someone inside) can't be sprayed |
| Click the **cash trays** (inside) | Give ₺10 / ₺20 / ₺50 change to the guest at the counter |
| Click the **cologne bottle** (inside) | Splash Turkish cologne on the front guest (while they pay — they leave the moment they're settled) |
| **Stall doors** (inside) | Close once the guest steps in — passers-by walk in front of a closed door; spray only the open stalls |
| Click the **EXIT door** (inside) | Step back outside |
| `E` / `Escape` | Toggle in/out |
| `🚻` / `🚪` (top bar) | Toggle in/out |
| `?` (top bar) | How to play |
| `↺` (top bar) | Reset the game |

The game **autosaves** to your browser (`localStorage`) — close the tab and pick up where you left off.

## Run it locally

There is no build step. Just open `index.html` in any modern browser:

```sh
# Option 1 — open the file directly
open index.html          # macOS
xdg-open index.html      # Linux

# Option 2 — serve it locally (either works fine)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

Vanilla HTML, CSS, and JavaScript — one `<canvas>` scene, one DOM UI layer, zero dependencies, zero build tools. The whole game lives in:

- `index.html` — page shell (HUD, canvas, modal)
- `style.css` — dark theme
- `game.js` — simulation, rendering, UI

## Publish on GitHub Pages

Since there's no build step, hosting is trivial — GitHub Pages serves the files as-is.

1. Create a new (empty) repository on GitHub, e.g. `layover-lane`.
2. From this folder:

   ```sh
   git remote add origin https://github.com/<YOUR-USERNAME>/layover-lane.git
   git push -u origin main
   ```

3. On GitHub, go to **Settings → Pages**.
4. Under *Build and deployment*, set **Source** to *Deploy from a branch*, pick the `main` branch and the `/` (root) folder, then **Save**.
5. After a minute or two, your game is live at `https://<YOUR-USERNAME>.github.io/layover-lane/`.

## License

[MIT](LICENSE) — do whatever you like; attribution appreciated.
