# Repworks: notes for Claude sessions

Read `PLAN.md` and `DECISIONS.md` before changing anything. `DECISIONS.md` holds the binding
decisions, with a revision log; `PLAN.md` §4 is Phase 0 in build order.

## How we work

- Technical calls are Claude's. Features, anything the owner gives up, cost and naming are the
  owner's: ask, with a recommendation.
- A finding that changes the shape of the plan goes to the owner before anything is built on it.
  When the plan is wrong in a detail, fix `PLAN.md`; a changed decision also goes in
  `DECISIONS.md`'s revision log, with the reason.
- Say plainly what was checked live (and on which device), what by tests, and what was taken
  from documentation.
- Push to `main` only when `npm run check`, `npm test` and `npm run e2e` pass. CI deploys `main`
  to GitHub Pages.
- puzzle-explorer, mistake-lab, q_extension and lichessable are read-only references.

## Commands

```sh
npm test         # node --test over test/unit and test/sim, then test/perf alone (no build)
npm run check    # tsc for each project (app, core alone, service worker, tests) + boundary check
npm run e2e      # vite build, then Playwright (desktop and emulated phone)
```

In a cloud container whose preinstalled Chromium doesn't match the Playwright version, point the
tests at it: `REPWORKS_CHROMIUM=/opt/pw-browsers/chromium npm run e2e`.

## Rules the code keeps

- `src/core` is pure: no DOM, fetch, storage, clock or randomness. Time and random sources are
  passed in. It imports only from `src/core` and `chessops`. `scripts/check-boundaries.mjs` and
  `tsc -p src/core` (no DOM, no Node types) enforce this.
- TypeScript is limited to erasable syntax (no enums, namespaces or parameter properties), and
  relative imports carry their `.ts`/`.tsx` extension, so Node runs core and its tests with no
  build.
- JSX lives only in `src/ui` (`.tsx`).
- Ports (`Remote`, `LocalStore`, `Clock`, `Locks`, `Lichess`) are interfaces in core,
  implemented in `src/platform`, faked in tests.
- Routes live in the hash (`#/study/<sid>/<cid>`): GitHub Pages has no SPA fallback.
- The service worker names its caches `repworks-*` and deletes only those.
- The app never rewrites a data file it cannot parse.

## Constraints

- No tokens in any repo, ever. GitHub revokes a token pushed to a public repo.
- No Chessable course content in this public repo. The owner's real studies and course exports
  stay in the private data repo; tests read them from `REPWORKS_FIXTURES=<path>` when set.
- No code loaded from a CDN at runtime: everything is bundled and self-hosted.
