# Repworks: notes for Claude sessions

Read `PLAN.md` and `DECISIONS.md` before changing anything; `TESTING.md` lists what waits for
the owner's live testing. `DECISIONS.md` holds the binding
decisions, with a revision log; `PLAN.md` §4 is Phase 0 in build order.

## How we work

- Technical calls are Claude's, and so are a feature's details: decide, build, and say what was
  decided; the owner tests and asks for changes. Ask first, with a recommendation, only where a
  wrong guess would be wasteful to undo: the shape of the plan, a data format the owner's real
  data will be written in, anything the owner gives up, cost, and naming.
- A finding that changes the shape of the plan goes to the owner before anything is built on it.
  When the plan is wrong in a detail, fix `PLAN.md`; a changed decision also goes in
  `DECISIONS.md`'s revision log, with the reason.
- Say plainly what was checked live (and on which device), what by tests, and what was taken
  from documentation.
- Work that is ready goes straight to `main`: commit and push there, not to a feature branch or a
  pull request, whatever branch the session was started on. Ready means `npm run check`,
  `npm test` and `npm run e2e` pass; never push to `main` otherwise. CI deploys `main` to GitHub
  Pages.
- Working through the plan: when a task or phase is done and pushed, start the next cloud session
  (`create_session`, claude-code-remote tools) with a prompt naming the next part of `PLAN.md`
  and anything it needs that isn't in the repo, then end with a short reply: what was built, what
  the owner can test, and the new session's link. Keep going across phase boundaries: the owner
  wants as much built as possible, then one testing session over everything. A live check only
  the owner can do goes in `TESTING.md` and doesn't stop the chain; build on the best guess.
  Stop only when nothing useful can be built without the owner, and say exactly what is needed.
  No limit on the number of chained sessions.
- puzzle-explorer, mistake-lab, q_extension and lichessable are read-only references.
- Qchess (qchess.net) is read live on the owner's test account, user `Testers`, whose password
  is in the environment variable `QCHESS_PASSWORD` (set in the cloud environment, never in this
  public repo). Anything may be done to that account and its studies; the test study is
  https://qchess.net/study/3411d48d-b0f1-43fb-a667-b49057243e1c, and new ones may be made.
  Headless: log in at `/login` (`#username`, `#password`, `#login-btn`), wait for
  `/api/auth/me`, then remove `[id^=tour]` and `.study-modal-overlay.active` on a study page
  before clicking.

- A testing data repo, only for Claude sessions' live checks, is named in the environment
  variable `REPWORKS_TESTING_DATA` (owner/repo) with a fine-grained token in
  `REPWORKS_TESTING_PAT` (never in this repo). On 2026-10-06 it couldn't be reached from the cloud
  container: `api.github.com` goes through the session's GitHub proxy, which refuses a repo the
  Claude GitHub App can't access (`add_repo` was refused). Live checks against it need the owner
  to give the Claude GitHub App access to that repo first.

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
