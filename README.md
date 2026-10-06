# Repworks

A personal chess site: studies edited in the browser, repertoire training on spaced repetition,
and (in later phases) an explorer with practical evals, analysis, the intuition storm and game
mistake review. One user, several devices (desktop and an Android phone), offline-first.

It is served at **https://dubious-moves.github.io/repworks/** and installs as a PWA.

Status: Phase 0 (the foundation) is being built. [`PLAN.md`](PLAN.md) is the plan and
[`DECISIONS.md`](DECISIONS.md) holds the decisions it builds on.

## How it works

- The site is static, with no backend. Each device keeps its own copy of everything in
  IndexedDB and works offline.
- The truth is a separate **private** GitHub repository holding one PGN file per chapter (in
  Lichess's dialect) and per-device progress logs. Devices sync to it with a fine-grained token
  limited to that repository; edits made on two devices at once are merged three-way.
- Nothing personal lives in this repository: no studies, no progress, no tokens.

## Development

Node 22.18 or later (CI uses 24).

```sh
npm ci
npm run dev      # Vite dev server at http://localhost:5173/repworks/
npm test         # unit and simulation tests, run by Node with no build
npm run check    # type checks and the core boundary check
npm run e2e      # build, then the Playwright browser tests
npm run build    # production build in dist/
```

A push to `main` that passes CI deploys to GitHub Pages.

## Layout

- `src/core`: pure logic (chess, PGN, studies, merge, progress, sync), with no DOM, storage,
  network or clock. Its tests run directly under `node --test`.
- `src/platform`: browser adapters (IndexedDB, GitHub, Lichess, service worker registration).
- `src/app`: the composition root and app state. `src/ui`: Preact components.
- `src/sw`: the service worker.
- `test/unit`, `test/sim`: Node tests; `test/perf`: timing tests, run alone after them. `test/e2e`: Playwright tests.

## Licence and credits

Repworks is free software under the GNU General Public License, version 3 or (at your option)
any later version; see [`LICENSE`](LICENSE).

It builds on [chessground](https://github.com/lichess-org/chessground) and
[chessops](https://github.com/niklasf/chessops) by the Lichess developers (GPL-3.0-or-later),
the cburnett pieces by Colin M.L. Burnett (GPLv2+, embedded in chessground), and
[Preact](https://preactjs.com) (MIT).
