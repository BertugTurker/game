# 🚌 Layover Lane — Bus Rest-Stop Simulator

A browser game where you run the layover every tour bus on the **Hilltown → Seaside** route relies on. Buses pull into your bay for rest breaks, and passengers get hungry, thirsty, and *desperate* for the toilet. Your job: keep them satisfied.

There's no money and no upgrades — just you, a diner, a toilet block, and a road full of buses.

## How it works

- 🚌 Buses arrive, stop in your bay, let passengers off, then drive away.
- 🍔 **Restaurant** — guests eat and drink at the diner (3 seats).
- 🚻 **Toilets** — the high-demand service. Cleanliness decays with every use; hit **Deep Clean** (free) to reset it before it hurts satisfaction.
- ★ **Reputation (0–100)** — every guest rates their visit, and so does each departing bus. Higher reputation means buses stop more often *and* arrive bigger.
- ⏰ At midnight the day ends and you get a summary: buses served, guests served, average satisfaction, and how your reputation moved.

Neglect the toilets and reputation will show it — guests rate dirty visits badly, and word spreads.

## Controls

| Input | Action |
| --- | --- |
| `Space` | Pause / resume |
| `1` / `2` | Game speed 1× / 2× |
| `🧽` (top bar) | Deep clean the toilets (free) |
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
