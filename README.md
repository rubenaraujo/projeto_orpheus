# Orpheus

Learn guitar songs from YouTube lessons. Load a video, split it into sections, loop the part you are stuck on and slow it down.

## Run

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py          # http://localhost:8765
```

Open the page over `http://`; the YouTube player does not work from `file://`.
Options: a port number (`server.py 9000`), and `--lan` (or `ORPHEUS_LAN=1`) to reach it from other devices. There is no authentication, so use `--lan` only on a trusted network.

## Features

- Paste a YouTube link, or search for lessons (ranked by chapters, resolution, tabs in the description, …).
- A/B loop, speed 0.25–2×, ±5 s jumps, captions toggle, volume.
- Saved sections with name, notes, colour, mastery status (to do / working / mastered), drag-to-reorder, merge and split.
- Auto-split: uses the video's chapters, then timestamps in the description, then audio analysis.
- Timeline with zoom (Ctrl/⌘ + wheel), hover preview, and a minimap.
- Fullscreen player with its own controls; practice mode hides everything but the player and sections.
- Library of videos with progress, search and sorting; share/export/import of sections.
- Video description panel, EN/PT interface (default EN), installable as a PWA.

Press `?` in the app for the keyboard shortcuts.

## Where data lives

Everything is stored in the browser's `localStorage` (keys start with `looper:`, the app's former name). When the server is running, the data is also synced to `data.json` next to `server.py` so it survives clearing the browser. `data.json` is not committed.

## Layout

| File | Purpose |
|---|---|
| `index.html` | Markup |
| `styles.css` | Styles |
| `js/*.js` | Client logic, loaded in order as plain scripts sharing one scope: `core` (helpers, API), `i18n`, `state`, `sync`, `player`, `timeline`, `sections`, `library`, `playback`, `share`, `search`, `main` (event wiring, shortcuts) |
| `tests/e2e.js` | Browser smoke tests |
| `server.py` | Static files, `/analyze`, `/search`, `/info`, `/store`, `/health` |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | PWA shell (network first, offline fallback) |

The server only serves the files listed in `STATIC` in `server.py`, plus `js/*.js`. A new client file must be added to `index.html` and to `SHELL` in `sw.js`.

## Tests

```sh
npm install
npm test      # server must be running; set CHROME=/path/to/chrome if Playwright's Chrome is not installed
```

The tests stub `/store`, so they never touch `data.json`.

## Limits

- The server needs `yt-dlp`, which breaks now and then when YouTube changes; update it with `pip install -U yt-dlp`.
- Audio-based section detection is a rough guess; chapters or description timestamps are better when present.
- The hover preview uses YouTube's coarse storyboard (about one frame every 10 s) and is not shown in fullscreen.
- "More videos" at the end of a paused video comes from YouTube and cannot be disabled.
