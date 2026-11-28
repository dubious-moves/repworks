# Repworks: notes for Claude sessions

Read `PLAN.md` and `DECISIONS.md` before changing anything; `TESTING.md` lists what waits for
the owner's live testing. `DECISIONS.md` holds the binding
decisions, with a revision log; `PLAN.md` §4 is Phase 0 in build order. `CHESSNUT.md` is the plan
for a robotic board (the Chessnut Move), built only when the owner asks.

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
  pull request, whatever branch the session was started on. Ready means `npm run check` and
  `npm test` pass, and so do the e2e specs the change touches (`npm run build`, then
  `npx playwright test <spec files>`; a new feature brings its own). The full `npm run e2e` is
  CI's: it runs there on every push, in about five minutes, and only a green run deploys `main`
  to GitHub Pages.
- A push isn't done until CI is green on it. After pushing, wait for the CI run on that commit
  (GitHub tools: `actions_list`, then `get_job_logs` for a failed job) and read its result before
  the closing reply or the next session. Red: fix it first, ahead of anything else, and push
  again; never start the next session, or end the turn as done, on a red `main`. If `main` was
  already red when the session began, fixing it is the first task. Run the full `npm run e2e`
  locally only to reproduce a CI failure, or for a change wide enough to touch most pages
  (shared layout, the router, the store).
- Playwright runs a failed test once more and reports one that passes then as flaky, and CI stays
  green on it: read the e2e jobs' summaries for "flaky", not only the tick. A flaky test is a race
  to fix (in the test, or in the app if the app has it), not to leave.
- Working through the plan: when a task or phase is done and pushed, start the next cloud session
  (`create_session`, claude-code-remote tools) with a prompt naming the next part of `PLAN.md`
  and anything it needs that isn't in the repo, then end with a short reply: what was built, what
  the owner can test, and the new session's link. Keep going across phase boundaries: the owner
  wants as much built as possible, then one testing session over everything. A live check only
  the owner can do goes in `TESTING.md` and doesn't stop the chain; build on the best guess.
  Stop only when nothing useful can be built without the owner, and say exactly what is needed.
  No limit on the number of chained sessions.
- Choose the model and effort of every session you start (`create_session`'s `model` and
  `effort`) for its job (owner, 2026-11-24). A session that only runs scripts, waits on them
  and reports what they printed gets a smaller, cheaper model at low effort. The default model
  and effort are for building and reviewing. The container's hardware is the same whatever the
  model.
- puzzle-explorer, mistake-lab, q_extension and lichessable are read-only references.
- Qchess (qchess.net) is read live on the owner's test account, user `Testers`, whose password
  is in the environment variable `QCHESS_PASSWORD` (set in the cloud environment, never in this
  public repo). Anything may be done to that account and its studies; the test study is
  https://qchess.net/study/3411d48d-b0f1-43fb-a667-b49057243e1c, and new ones may be made.
  Headless: log in at `/login` (`#username`, `#password`, `#login-btn`), wait for
  `/api/auth/me`, then remove `[id^=tour]` and `.study-modal-overlay.active` on a study page
  before clicking.

- The review of the owner's opening repertoire (the "repertoire audit") is the skill
  `.claude/skills/repertoire-audit`: one batch from his answers to the push. The repertoire's own
  rules and state are in the data repo, `notes/<study id>/` (`rules.md`, `ledger.md`, `audit.json`,
  `corrections.md`, `batches/`): read them first. Only one session writes to a study at a time, and
  none while the owner is reviewing its lists. PLAN.md §5.219.

- A testing data repo, only for Claude sessions' live checks, is named in the environment
  variable `REPWORKS_TESTING_DATA` (owner/repo) with a fine-grained token in
  `REPWORKS_TESTING_PAT` (never in this repo). The Claude GitHub App has access to it (since
  2026-10-06), so `add_repo` attaches it and git can clone it. The site itself can't use it from
  a cloud container: the container's proxy drops the credentials of a web page's cross-site
  requests to `api.github.com` (those with `sec-fetch-site: cross-site`), so the app in headless
  Chromium gets 404 for a private repo whatever token it holds. Live checks of the app against
  GitHub stay with the owner's devices.

## Commands

```sh
npm test         # node --test over test/unit and test/sim, then test/perf alone (no build)
npm run check    # tsc for each project (app, core alone, service worker, tests) + boundary check
npm run e2e      # vite build, then Playwright (desktop and emulated phone)
```

In a cloud container whose preinstalled Chromium doesn't match the Playwright version, point the
tests at it: `REPWORKS_CHROMIUM=/opt/pw-browsers/chromium npm run e2e`.

The analyzer's games into a data repo checkout (PLAN.md §5.163): `node scripts/games-to-data.mjs
<analyzed_games.json> <data-repo checkout> [--dry-run] [--commit]`.

Whether FSRS fitted to the progress log would beat the default weights (PLAN.md §5.183), a report
that writes nothing: `node scripts/fsrs-fit.ts ../repworks-data --offset-minutes 60` (`--kinds r,m`
adds the game cards; `--json`).

How a game's result follows its rating gap on Lichess, against Elo's curve (PLAN.md §5.126, the slopes
`LICHESS_SLOPES` in `src/core/explorer/equal.ts`), a report that writes nothing: `node
scripts/elo-curve.ts <dump.pgn.zst>` (the dump's first 400 MB, `curl -r 0-400000000`, is 1.2 million
games, a minute; `--json`).

Whether a Maia model predicts human moves better, measured on a Lichess dump part (PLAN.md §5.190;
about 40 minutes for every condition on 4 threads; `--list`, `--conditions`, `--memo-stats`):
`node scripts/maia-eval.ts <dump.pgn.zst> --sample sample.json --out scores.json` (the dump is
`lichess_db_standard_rated_YYYY-MM.pgn.zst` or its first 250 MB from `curl -r 0-250000000`);
blitz as `--speeds blitz`.

How strong the practice opponents (Easy, Medium, Hard) are on Lichess's scale (PLAN.md §5.202), a
report that writes nothing; each step resumes from its file:
`node scripts/opponent-strength.ts openings <dump.pgn.zst> --out openings.json`, then `match --nets
<dir of maia-1100/1500/1900.onnx> --openings openings.json --out games.json` (about 50 minutes on 4
cores), `mistakes <dump.pgn.zst> --sample sample.json --out mistakes.json`, and `report --games
games.json --mistakes mistakes.json`. The Maia-1 networks are converted with `scripts/lc0-onnx.mjs`.
Which opponent plays most like a 2000 over whole games (§5.204): `humans <dump.pgn.zst> --out
humans.json` (2000-vs-2000 games from ply 12), self-play from their starts as a `match --openings
humans.json --pairs medium:medium,dala-2000:dala-2000 --out selfplay.json`, `score --openings
humans.json --games selfplay.json --out scored.json`, `predict --openings humans.json --nets <dir>
--net-ids dala-2000 --out predict.json`, and `report --scored scored.json --predict predict.json`.
A level's own settings with the check of §5.205: `--players m=2000@0.75+guard` (the presets carry it as the app does). dala-2000 is converted with its soft policy head (`node scripts/lc0-onnx.mjs <net.pb.gz> <lc0>
dala-2000.onnx soft`). dala's transformer (174M parameters) and the 23M Maia want `--ort-node <folder>`:
onnxruntime-node installed there with `npm i --ignore-scripts onnxruntime-node` (not a dependency of this repo).

The database past a line's end, where practice's opponent plays the explorer's games (PLAN.md
§5.206), a report that writes nothing; each step resumes from its file: `node scripts/db-handover.ts
walks --out walks.json --walks 40` (the explorer at the app's 16 requests a minute, a Lichess token in
`LICHESS_TOKEN`; about 75 minutes), `thin --walks walks.json` (the thin positions' older games and
named players; about 40 minutes), `score --walks walks.json` (`STOCKFISH=<native binary>` for speed:
`apt-get install stockfish` gives /usr/games/stockfish), and `report --walks walks.json`.

The explorer panel's Practical value and prepared score for chosen candidates (PLAN.md §5.211), a
report that writes nothing to the repo; the app's own search, filter, options and limiter, a Lichess
token in `LICHESS_TOKEN`, and a cache on disk outside the repo that later runs reuse:
`node scripts/practical.ts --moves "1.Nc3 c5 2.d4" --candidates "cxd4,e6" --cache
~/.cache/repworks-practical --out practical.json --depth 5` (`--positions positions.json` for many,
`[{ "moves": "...", "candidates": ["..."] }]`, no candidates for the app's own rows; `--depth 7`;
`--maia --ort-node <folder>` for Maia as the app's Practical has it once Maia is on; `--pick-last` makes my last move in a line a practical pick too, a measurement; `--compare-reach-min 3` compares my moves on lines reached 3% of the time or more (the app's 10 by default); `--replies` lists each row's replies with my move after each and how it was chosen (a practical pick or ChessDB's best); `--report
practical.json` prints the table again; the owner's settings as flags, listed in the script).

How well Maia 3's score (Ms) and its move likelihood (Ml) follow people on Lichess: against the explorer's
results and move shares for a rating bucket and against the games of a dump part (PLAN.md §5.213), a report
that writes nothing to the repo; each step reads the file the one before wrote, a Lichess token in
`LICHESS_TOKEN`: `node scripts/maia-score.ts sample <dump.pgn.zst> --out sample.json`, then `maia`, `explorer
--bucket 1400`, `report` (the win chance); `move-rows`, `after-moves`, `moves-report` (Ms between moves); `policy`,
`policy-report`, `popularity` (the likelihoods). Ask Maia at equal ratings (`maia --before 0 --mid`) to compare
with a bucket's results: Ms carries the rating gap.

What changed between two versions of a study's chapters (PLAN.md §5.214), a change list that writes
nothing: every line in full, and a link at each item that opens the app at that move when the new
side is a study in a data repo. Each side is a PGN file, a data repo checkout, or `<checkout>@<rev>`:
`node scripts/chapter-diff.ts ../repworks-data@<my last commit> ../repworks-data --study "1. Nc3 +
Jobava" --chapter "Jobava simplified"` (what the owner changed in the app since); `delivered.pgn
../repworks-data --study …` (a file against the study); `--old-study` (a review copy against the
study it came from), `--mark TEXT` (comments holding TEXT, as open questions), `--json`,
`--max-lines 0`, `--wraps`. The same changes as a list the owner answers on the study page (PLAN.md
§5.216, its Review panel): add `--review batch-4 --title "Jobava batch 4" [--notes notes.json]`
(`[{ "moves": "1. Nc3 d5 2. d4", "text": "…" }]`: your words on a changed move, or a question at any
move), which writes `review/<study id>/batch-4.json` into the checkout to commit with the study
(`node scripts/validate-data.ts ../repworks-data` first). The app shows the items at one move as one
position, answered once (PLAN.md §5.218), and a position whose items are in two lists under the
newer list: split a batch into lists by position, not by item, and make the list that should hold
a shared position last. His answers, after his device synced and you pulled, by position:
`node scripts/review-answers.ts ../repworks-data --study "1. Nc3 + Jobava"` (`--list batch-4`,
`--json`).

The storm's "Gather positions" from a cloud session, as a device named `cloud` (PLAN.md §5.155),
with the data repo checked out on `main`:
`node scripts/storm-gather.ts ../repworks-data --minutes 60 --score-minutes 40 --push`; only
Stockfish over the cloud's positions not yet scored: `--score-only --score-minutes 100 --push`;
every device's positions scored, not only the cloud's: `--all-devices`; one study or chapter,
walked and scored: `--study "Scandi Gambit" --chapter "Accepted - Main lines"`.

The repertoire audit's tools (PLAN.md §5.219; the skill says when each is used), on a study of a
data repo checkout: `node scripts/audit/audit.ts <command> ../repworks-data --study <id>`. `check`
(every check against the study's targets; `--deck --cache <dir>` for the idea deck's too), `ledger`
(the ledger's tables; `--check`), `base`, `practical --positions P.json --cache <dir> --out X.json`
(Practical with the study's own flags, all of them), `inventory --chapter C --line "<moves>" --cache <dir>`
(`--offline`), `screen`, `difficulty` (`--moves "<a full line>"` without a study), `judge`, `lines
--since <rev> --sf`, `apply --ops ops.json --base <rev>` (`--dry-run`), `lint`, `scan` (before every
push to the data repo), `rep`, `close-calls`, `add-chapters`. `--cache` is a `scripts/practical.ts`
cache folder. Stockfish runs at a fixed node count on one thread: for `screen` and `lines` the repo's
Stockfish 19 (`node_modules`), for `difficulty` the vendored Stockfish 18 lite its class limits were
set for (`--engine` asks another). `STOCKFISH` (`apt-get update` before `apt-get install -y
stockfish`) is for `scripts/ideas/cv.ts`, which the deck check runs.

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
- A page built around a board puts it in `.train-board` (the study's is `.cv-board`), as that
  element's direct child: the board's size and a phone held sideways (PLAN.md §5.164, the last
  block of `app.css`) hang on it.

## Constraints

- No tokens in any repo, ever. GitHub revokes a token pushed to a public repo.
- No Chessable course content in this public repo. The owner's real studies and course exports
  stay in the private data repo; tests read them from `REPWORKS_FIXTURES=<path>` when set. One
  exception, by his word (DECISIONS.md, 2026-11-28): lines of his own 1.Nc3 repertoire may be quoted
  here. Its files and a batch's material still live in the data repo.
- No code loaded from a CDN at runtime: everything is bundled and self-hosted.
