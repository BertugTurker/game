# 🚌 Layover Lane — Bus Rest-Stop Tycoon

A browser game where you run the rest stop every tour bus on the **Hilltown → Seaside** route relies on. Buses pull into your bay for rest breaks, and passengers get hungry, thirsty, and *desperate* for the toilet. Your job: keep them satisfied.

![layover lane](index.html)

## How it works

- 🚌 Buses arrive, stop in your bay, let passengers off, then drive away.
- 🍔 **Restaurant** — sell meals and drinks; upgrade for more seats, better prices, faster service.
- 🚻 **Toilets** — the high-demand service. Cleanliness decays with every use; hit **Deep Clean** (costs a little cash) and add stalls to keep queues short.
- ★ **Reputation (0–100)** — every guest rates their visit. Higher reputation means buses stop more often *and* arrive bigger, so revenue climbs.
- 📣 **Marketing** — attracts more and larger coaches.
- 🪑 **Ambiance** — guests wait more patiently and rate visits higher.
- ⏰ At midnight the day ends: wages and rent come out automatically, and you get a day summary.
- 🏆 **Goal:** get **$10,000** on hand. When you do, confetti.

Early on the math is tight — wages plus rent eat most of what you earn, so every upgrade decision matters. Neglect the toilets and reputation (and your day) will show it.

## Controls

| Input | Action |
| --- | --- |
| `Space` | Pause / resume |
| `1` / `2` | Game speed 1× / 2× |
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

- `index.html` — page shell (HUD, canvas, shop, modal)
- `style.css` — dark theme, responsive shop
- `game.js` — simulation, rendering, UI

## Publish on GitHub Pages

Since there's no build step, hosting is trivial — GitHub Pages serves the files as-is.

1. Create a new (empty) repository on GitHub, e.g. `layover-lane`.
2. From this folder:

   ```sh
   git init -b main
   git add .
   git commit -m "Layover Lane: bus rest-stop tycoon"
   git remote add origin https://github.com/<YOUR-USERNAME>/layover-lane.git
   git push -u origin main
   ```

3. On GitHub, go to **Settings → Pages**.
4. Under *Build and deployment*, set **Source** to *Deploy from a branch*, pick the `main` branch and the `/` (root) folder, then **Save**.
5. After a minute or two, your game is live at `https://<YOUR-USERNAME>.github.io/layover-lane/`.

(If you're already in a cloned repo, skip `git init` and just commit + push.)

## License

[MIT](LICENSE) — do whatever you like; attribution appreciated.
