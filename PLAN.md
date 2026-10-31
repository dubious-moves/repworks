# Repworks: plan

Status: plan of 2026-10-05, written in a planning session and updated the same day with the
owner's answers to its questions and with the organization they created (§8). The owner approved
it the same day. Phase 0 is built: §4.1 to §4.11 are on `main` (each part's "As built" notes say
where the build differed). What remains is live: the spike's re-run (§4.2), the real Qchess and
Lichess imports (§4.10), and the acceptance test (§4.11), on the owner's devices. Phase 1 starts
alongside them (the owner's decision of 2026-10-06), and is planned in depth in §5 (2026-10-06),
with the owner's answers (§5.13); it is built through §5.17 (the owner's second notes), its acceptance test (§5.14) waiting
for the owner. Phase 2 is planned in depth in §5 too (§5.20–§5.28, 2026-10-06), and built through §5.26; §5.18 (alternative moves) is built, §5.27 (the course tree) waits for the owner's answer, §5.28 for the owner's devices. The owner's third notes are built (§5.38). Phase 3 is planned in depth (§5.29–§5.37, 2026-10-06) and built through §5.36 (threads opt-in); its acceptance test (§5.37) waits for the owner's devices. Phase 4 (the storm and puzzles) is planned in depth (§5.39–§5.49, 2026-10-06) and built through §5.48 (2026-10-07); its acceptance test (§5.49) waits for the owner's devices. Phase 5 (mistake review and the migration from mistake-lab) is planned in depth (§5.50–§5.66, 2026-10-07) and built through §5.64; where the analyzer's output lives waits for the owner's answer (§5.66), its acceptance test (§5.65) for the owner's devices. What was left of mistake-lab after it (§6's list of five) is built too (2026-10-07). Prioritizing a study and paused lines (§5.70, the owner's request) are built (2026-10-07); the live check waits for the owner's devices. The storm reworked after the owner's first test (§5.71, 2026-10-08): the deal spread over line ends, the move and arrows kept on the board, Analyse keeping the session, new screens. Clearing the gathered positions (§5.72) is built. A set's first answer kept through Try again, and the review's list beside the board (§5.73), are built, and so are saving a sequence from any analysis board and a storm position as a mistake (§5.74). Stockfish 19 is an option beside 18 (§5.75, the owner's request). A new chapter from a FEN or PGN (§5.76) is built. The owner's notes of 2026-10-08 (§5.77) are built: repetitions, mistakes asked again at a line's end and in drills, Copy FEN, the explorer without games, Maia's columns kept, the analysis board's side, and ← back to where a page was opened from. The owner's notes of 2026-10-09 on training (§5.78) are built: "From the start, asked" asks every own move on every pass, the study's arrows at a line's end, and Read within a session. A storm move is judged by Stockfish alone, the deepening at depth 24 (22 on a phone) while the user thinks (§5.84). The study page's option B (§5.94, the owner's choice) and the owner's notes on it (§5.95) are built (2026-10-11). Storm positions shared between devices through the data repo, and an overnight gather (§5.102), are built (2026-10-12). Lc0 on the study page, its pick among close moves (§5.143), is built (2026-10-31). Read with `DECISIONS.md`, which this plan updates (its
revision log lists every change and why).

Contents:
1. Summary
2. What was checked, and how
3. Architecture in one page
4. Phase 0 in depth
5. Phase 1 in depth, and later phases (outline)
6. Phase order and retirement
7. Risks
8. The owner's answers, and setup

---

## 1. Summary

Phase 0 builds the foundation every later feature stands on: the study store, PGN in
Lichess's dialect, the position key, the three-way merge, the progress log, GitHub sync,
import, and a study editor on chessground. Its acceptance test is live: edit on the
desktop and the phone while both are offline, sync, and lose nothing.

Right after the repo skeleton, Phase 0 runs a one-day spike against the real GitHub API from
the browser (§4.2), because four of the sync design's facts could only be read from
documentation here.

What changed from DECISIONS.md, in short (details in its revision log):

- **Position key (D10).** The published puzzle dataset follows the *legal* en passant rule,
  not the pseudo-legal rule its `posKey.js` implements. The keys were computed from
  chess.js 1.4.0 FENs, which only carry a legal en passant square. The site's key is
  therefore "the first four fields of chessops's canonical FEN". I scanned 1.76 M published
  keys and all of them match it.
- **Writes (D4).** One GraphQL `createCommitOnBranch` call per sync, guarded by
  `expectedHeadOid`, instead of three REST calls. GitHub allows 500 content-creating requests
  an hour per account, across all devices, so a third of the cost matters. REST Git Data
  stays as the fallback behind the same interface. The spike decides which one is used.
- **Lichess dialect (D3).** Lichess never exports a `}` in a comment: it deletes `{` and `}`
  when a comment is saved. chessops parses the dialect fine, but its writer doesn't produce
  it, so the site gets its own ~60-line writer. A prototype reproduces Lichess-format
  movetext byte for byte.
- **Conflicts live in the PGN.** Clashing text and "kept after delete" are written into
  comments as git-style markers, so there is no separate conflict store.
- **Progress files** are daily per device, with monthly compaction, so a sync uploads one
  day's events rather than the whole month.
- **UI framework (D7):** Preact with signals.
- **Hosting (D17):** the site is served at `https://dubious-moves.github.io/repworks/`, the
  Pages site of a free GitHub organization the owner created for it, so it doesn't share
  `skaeglund.github.io`. mistake-lab and puzzle-explorer live there, and both of their service
  workers delete every cache that isn't their own. The owner chose this (§8).
- **Auto-play** mostly stops being a separate feature. With one card per position and move,
  a shared prefix is one card, so the trainer simply plays the moves that aren't due.
- **Qchess first (D18):** the owner's newest repertoire is in Qchess studies, so Phase 0's
  import starts there. A short console script on the Qchess study page downloads every
  chapter together with the side it is for, and the site imports that file (§4.10).
- **A fresh start for cards (D19):** every repertoire card starts new. Nothing is seeded from
  Chessable, nor later from mistake-lab's repertoire reviews. New cards come in line by line,
  within a daily limit.

Retirement: lichessable can go after Phase 1, since the owner's own script already exports the
Chessable courses. The storm will be daily use eventually but isn't needed early, so it stays in
Phase 4. mistake-lab goes after Phase 5.

---

## 2. What was checked, and how

The container could reach npm, ChessDB, the Lichess explorer, qchess.net and public GitHub
repositories through git. It could not reach docs.github.com, lichess.org, github.io or
developer.chrome.com.
(The Phase 0 build session's container reaches lichess.org as well; github.io, docs.github.com
and developer.chrome.com are still refused by its network policy, so checks of the deployed
site stay with the owner.)
GitHub's documentation was read from its source repository (`github/docs` at `86c19ef`,
2026-10-05). Lichess behaviour was read from `lichess-org/lila` (`ba0725c`) and
`lichess-org/scalachess` (`2ab0a40`), both cloned the same day. The scratch code behind the
findings below was kept in `prototypes/` until Phase 0 replaced it with tested code (§4.3, §4.5,
§4.7); it is in the repo's history at `469d081`.

| Claim in DECISIONS.md | Finding | How it was checked |
| --- | --- | --- |
| GitHub rate limits | Personal token: 5,000 requests/hour. Secondary limits: ≤100 concurrent; ≤900 points/minute on REST (GET 1, write 5); ≤80 content-creating requests/minute and ≤500/hour, per account. An authorized conditional GET answered 304 doesn't count against the primary limit. | github/docs: `data/reusables/rest-api/*.md`, `best-practices-for-using-the-rest-api.md` |
| Git Data API commits atomically, refuses stale writes | Yes. Create tree (with `base_tree`; entries may carry `content` directly, and `sha: null` deletes) → create commit → update ref with `force: false` (422 if not a fast-forward). That's three write calls, since blobs can be inlined. A fine-grained token with Contents read/write covers all of it. A ref can't be created in an empty repo, so the data repo needs a first commit. | github/docs `src/rest/data/fpt-2026-03-10/git.json` |
| One-call commit | GraphQL `createCommitOnBranch`: additions and deletions on a branch, refused unless `expectedHeadOid` is the current head. Fine-grained tokens work with GraphQL. | github/docs `src/graphql/data/fpt/schema-commits.json`, `forming-calls-with-graphql.md`. Exercised live from the phone on 2026-10-06 (spike G8–G12, §4.2): it commits, and refuses a stale head with `STALE_DATA`. |
| File and read limits | Blob read ≤100 MB, with a raw media type available. Recursive tree ≤100,000 entries / 7 MB. Git warns above 50 MiB and refuses above 100 MiB. Pages site ≤1 GB, soft 100 GB/month. | `git.json`, `data/variables/large_files.yml`, `github-pages-limits.md` |
| Token expiry | A personal account may create fine-grained tokens with no expiry. A token unused for a year is revoked. A token pushed to a public repo or gist is revoked automatically. | `managing-your-personal-access-tokens.md`, `token-expiration-and-revocation.md` |
| CORS on the GitHub API | REST answers any origin, allows `Authorization` and `If-None-Match`, and exposes `ETag` and the rate-limit headers. | `using-cors-and-jsonp-to-make-cross-origin-requests.md` |
| chessops has a full PGN tree | Yes: variations, `startingComments`, several comments per move, NAGs, comments before the first move, and parsing of `[%csl]`, `[%cal]`, `[%clk]`, `[%emt]`, `[%eval]`. It accepts Chessable's over-disambiguated `Ndb5` and `makeSan` normalizes it to `Nb5`. Its `makePgn` is not Lichess's dialect: NAGs come out as `$n`, the rules for Black's move numbers differ, and `}` is deleted from comments. Its parser accepts three real repgen files with no illegal moves. | chessops 0.15.1 from npm, tested in a scratch project |
| Lichess's export dialect | Text comments first, then shapes in a separate `{ [%csl …][%cal …] }`. Glyphs 1–6 are a SAN suffix (`e4!?`), others ` $n`. `1. e4`, with `1... e5` only after a comment or a variation. The movetext is one line. `[Orientation]` appears only with `?orientation=true`. Comments by other authors get a `[%anno "Name", id]` prefix. On save Lichess deletes `{` and `}`, normalizes whitespace and caps a comment at 4,000 characters. On import, several comments by one author on a move are merged with a newline. Added by the build session: a chapter with server analysis has `{ [%eval …] }` before its text comments; tags are written with the seven-tag roster first; each chapter of a study export ends with three newlines; and the export then replaces every `] } { [` with `] [`, which merges a block ending in `]` with the next one starting with `[` (`Annotator.toPgnString`). | lila `PgnDump.scala`, `tree.scala` (`sanitize`), `StudyPgnImport.scala`, `Annotator.scala` (`1dc9cb2`); scalachess `Pgn.scala`, `PgnNodeEncoder.scala`, `Tag.scala`; scalalib `StringOps.softCleanUp` |
| "A round trip loses nothing" | Feasible: chessops's parser (with `emptyHeaders`) plus a ~60-line writer reproduced two fixtures byte for byte. The fixtures were hand-built in the dialect: a custom FEN with Black to move, nested variations, a multi-line comment, all glyph kinds, shapes, `[%anno]`. Build session: the Phase 0 writer rewrote **448 of 449 chapters of 24 public Lichess studies byte for byte** (FEN starts with either side to move, Black orientation, shapes, `[%anno]`, `[%eval]`, glyphs of every group, nested variations, multi-line and root comments, empty chapters, results). The 449th holds a move Lichess stored although it is illegal (an annotated broadcast game); the parser cuts it and reports it, as designed. The owner's own test study is still needed (§4.5 (a)). | scratch prototype; live exports fetched from lichess.org on 2026-10-05, kept out of the repo |
| chess.js 1.x drops variations | Confirmed, and worse: 1.4.0 silently drops variations *and* NAGs, and **throws** on two comments after one move, which is how Lichess writes a comment plus arrows. | scratch tests against chess.js 1.4.0 |
| Puzzle-explorer's en passant rule | `posKey.js` keeps the en passant square when a side-to-move pawn stands beside it on the right rank (pseudo-legal). But `build-index.js` keys the FENs from chess.js 1.4.0's `history({verbose: true})`, and those only carry a *legal* en passant square. The published keys therefore follow the legal rule. 1,763,576 keys from 256 of the 4,096 index shards (every 16th): all are fixed points of a chessops canonical key, 3,810 carry an en passant square, and every key hashes to its shard. | read `lib/posKey.js`, `analyzer/build-index.js`; chess.js 1.4.0, chessops and chess.js 0.10.3 on pinned-pawn positions; scan of the dataset checkout |
| mistake-lab's key | Same pseudo-legal rule as `posKey.js`. It differs from the dataset only when the neighbouring pawn can't legally capture (pinned, or the horizontal discovered check). | `index.html` `fenPositionKey`, `isEnPassantPseudoLegal`; the same tests |
| Maia's 45.7 MB on GitHub Pages | Fits: 45,683,686 bytes = 43.6 MiB, under git's 50 MiB warning. mistake-lab already serves this exact file from its Pages site. It exceeds Cloudflare Pages' 25 MiB per-file limit. | file size and git blob hash; Cloudflare limit from search results only |
| Maia's licence | GPL-3.0: the root `LICENSE` of CSSLab/maia-platform-frontend, which has no separate model licence. mistake-lab's ONNX file and both move tables are byte-identical to CSSLab's (same git blob hashes). | sparse clone at `a6e52f5` |
| An HTTPS site calling `http://localhost` | Allowed with the user's permission. Chrome 142 (2025-10-28) shipped Local Network Access: a prompt (`loopback-network`, formerly `local-network-access`), no preflight, and `http://localhost` exempt from mixed-content blocking. Normal CORS still applies. `explorerdb serve` sends no `Access-Control-Allow-Origin` and answers `OPTIONS` with 405, so it needs a small change in q_extension. | WICG/local-network-access at `067168a`; release date from search results; read `tools/explorerdb/server.mjs` |
| ChessDB and the explorer from a web page | ChessDB echoes the page's origin in `Access-Control-Allow-Origin`. The explorer answers 401 without a token, allows any origin, and its preflight allows `Authorization`. | live requests from this container |
| Node runs the logic tests with no build | Node ≥22.18 strips types by default. `node --test` on a `.ts` file importing chessops passes on Node 22.22. | scratch test |
| chessground and pieces | GPL-3.0-or-later. Its npm package embeds the 12 cburnett pieces in `assets/chessground.cburnett.css`. cburnett is GPLv2+ according to lila's COPYING.md. Arrows start only on right-click or Shift, so the phone needs a draw mode. The unscoped `chessground` package is deprecated on npm; Lichess now publishes `@lichess-org/chessground`, which Phase 0 uses (10.4.2): same licence, same embedded pieces, same draw trigger. | chessground 9.2.1 from npm; lila `COPYING.md`; the build session read `@lichess-org/chessground` 10.4.2's package and source (`draw.ts`, `events.ts`) |
| The merge rules hold together | A ~90-line prototype of D4's tree merge passed 20,000 random concurrent edits: nothing added or written was lost, untouched deletions held, and the identity laws held. 3,000 random two-device runs converged. Re-merging one's own landed commit nests conflict markers, which is why sync needs commit IDs (§4.9). | scratch prototype and simulation |
| A Qchess study can be exported with each chapter's side (added after the owner's answers) | Qchess's "Download study PGN" writes every chapter's stored PGN to one file, regenerating the open chapter first. It leaves out each chapter's side (`perspective`), its folder and its "exclude from MoveTrainer" flag. Qchess's writer puts one comment block on a move with `[%csl]`/`[%cal]` before the text, turns `{ }` typed in a comment into `( )`, writes glyphs as `$n` from Lichess's set (`$146` included), and numbers Black's moves only at the start of a line or a variation. Its study API (`/api/studies/<uuid>`, with the login token from Qchess's localStorage) answers any origin and allows `Authorization`. `studyData`, `saveCurrentChapterPgn`, `_introPgnIsDefault` and the folder helpers are top-level in the page's script, so a console script can use them. chessops parses a sample written to these rules with no errors: shapes come out of the shared block, and the glyphs and a start FEN with Black to move are kept. | the study page's source, fetched without login (1.0 MB): `generatePGN`, `buildPGNMoves`, `buildNodePGNComment`, the download handler and the study loader; an API call without login (403 "This study is private", with the CORS headers); an acorn parse of the page's script; chessops 0.15.1 on a synthetic sample |
| Pages from a free organization (added with the organization) | GitHub Free for organizations publishes Pages from public repositories only; a private repo needs Pro, Team or Enterprise. So the code repo must be public, as §3 has it. This session can't see the repo's visibility, so §8 asks the owner to check it. | github/docs `data/reusables/gated-features/pages.md` |
| The old address after the transfer (added with the organization) | `git push` to `skAeglund/repworks` lands in `dubious-moves/repworks`, and the remote prints the new location; the GitHub tools used by Claude sessions also answer for the old name. The redirect is deleted for good if a new repo or fork is ever created at the old address. The repo was empty, so the first branch pushed became its default. | this plan's own push and a branch listing, 2026-10-05; github/docs `transferring-a-repository.md` |

Not verified, and where each gets verified:
- Real Lichess exports round-tripping byte for byte: checked on 24 public studies (above); the
  owner's own test study (§4.5 (a)) still runs through the suite.
- The Qchess export script on the owner's real studies, and their import: Phase 0, §4.10 and
  §4.5 (b).
- GraphQL commits with a fine-grained token from a browser, and the exact error for a stale
  head: checked live on the phone and on the desktop on 2026-10-06 (spike, §4.2). Still to run:
  the spike from the installed app.
- Lichess's API answering a web page (study export, `/api/token`): checked live from the
  build session's container on 2026-10-05, once lichess.org was reachable. `GET
  /api/study/by/<user>` answers `Access-Control-Allow-Origin: *`, and the preflights of a
  `POST /api/token` and of a study export with `Authorization` both answer 204 with any origin
  and `Authorization` allowed. The spike still runs the OAuth round trip and a private export.
- GitHub Pages sending `Access-Control-Allow-Origin: *`, which puzzle-explorer-data's fetches
  need now that the site has its own origin (D17): checked live on the phone on 2026-10-06
  (spike P1: `meta.json` read cross-origin, §4.2).
- How durable IndexedDB is on the phone, and the Lichess OAuth redirect inside an installed
  PWA: Phase 0 live checks on the phone.

Found along the way (outside this project): mistake-lab's `sw.js` (`activate`) and
puzzle-explorer's `sw.js` (`activate`) each delete every Cache Storage cache whose name isn't
their own. They share the `skaeglund.github.io` origin, so each update of one wipes the
other's caches. That may explain puzzle-explorer's note in `lib/offlineFs.js` about its
app-shell cache vanishing on Android. Fix: delete only caches carrying your own prefix.

---

## 3. Architecture in one page

```
 code repo (public, GPL-3)              data repo (private)
 dubious-moves/repworks                 skAeglund/repworks-data
 ├── src/core      pure logic           ├── repworks.json            format version
 ├── src/platform  browser adapters     ├── studies/<sid>/study.json name, kind, chapter order
 ├── src/app       wiring, sync loop    ├── studies/<sid>/<cid>.pgn  one chapter, Lichess dialect
 ├── src/ui        Preact components    ├── progress/<dev>/<day>.jsonl   own device only
 ├── src/sw        service worker       ├── progress/<dev>/<month>.jsonl compacted
 └── test          node --test + sim    └── devices/<dev>.json       name, created
          │                                        ▲
          ▼  dubious-moves.github.io/repworks/     │ GraphQL createCommitOnBranch (write)
   PWA on desktop and phone ── IndexedDB ──────────┘ REST trees/blobs, ETag (read)
          │
          ├── Qchess: a study exported to a file    import only
          ├── Lichess: OAuth (PKCE), study export, explorer
          ├── ChessDB: queryall / querypv only
          ├── puzzle-explorer-data (Pages)          later phases
          └── localhost explorerdb (desktop only)   later phases
```

- **Truth** is the data repo. Each device keeps working copies of the files, the base version
  they came from, and its own unsent progress events in IndexedDB.
- **Authored files** (studies) merge three-way. **Progress files** are written only by the
  device that owns them, so they never merge.
- **Everything derived** (SRS state, the repertoire index, parsed trees) is rebuilt from the
  files and cached locally under the file's blob SHA.
- **No code from CDNs at runtime.** Everything is self-hosted: the site works offline, and
  the GitHub token never shares a page with someone else's script.

---

## 4. Phase 0 in depth

The order below is the build order. Each part lists its tasks, the tests that prove it, and
what only a live check can show, on which device.

### 4.1 Repo skeleton and module boundaries

Layout of the code repo:

```
repworks/
├── LICENSE (GPL-3.0)  README.md  CLAUDE.md  PLAN.md  DECISIONS.md
├── package.json  tsconfig.json  vite.config.ts  index.html
├── public/                 manifest.webmanifest, icons
├── src/
│   ├── core/               PURE. No DOM, fetch, storage or clock; time is passed in.
│   │   ├── chess/          positionKey, standard UCI, FEN helpers (chessops)
│   │   ├── pgn/            parse (chessops → model), write (Lichess dialect), comments, sanitize
│   │   ├── study/          model types, edit operations, paths, position index
│   │   ├── merge/          tree merge, attribute rules, study.json merge, markers
│   │   ├── progress/       event types, JSONL codec, replay, FSRS
│   │   ├── sync/           the sync step as a pure function; port interfaces
│   │   └── app/            mode state machine, commands
│   ├── platform/           ports implemented: idb, github-graphql, github-rest, lichess, locks
│   ├── app/                composition root, sync scheduler, signals store
│   ├── ui/                 Preact components (.tsx): Board, Notation, CommentEditor, …
│   └── sw/                 service worker
├── test/
│   ├── unit/**/*.test.ts   core only, `node --test`
│   ├── sim/**/*.test.ts    devices against an in-memory GitHub (git semantics)
│   ├── fixtures/           public fixtures only (see §4.5)
│   └── e2e/                Playwright smoke tests against `vite preview`, GitHub mocked
├── scripts/
│   ├── check-boundaries.mjs   core imports nothing outside core and chessops, and uses no DOM
│   └── validate-data.ts       checks a data-repo checkout before a Claude session pushes
└── .github/workflows/      ci.yml (check, test, build, e2e; then main deploys to Pages)
```

Rules:
- `src/core` must run under `node --test` with no build. TypeScript is limited to erasable
  syntax (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`,
  `noEmit`), and relative imports carry their `.ts` extension. Node ≥22.18; CI uses 24.
- JSX lives only in `src/ui` (`.tsx`, compiled by Vite).
- Ports (`Remote`, `LocalStore`, `Clock`, `Locks`, `Lichess`) are interfaces in `core`,
  implemented in `platform`, and faked in `test`.
- The service worker names its caches `repworks-*` and deletes only those.
- Routes live in the hash (`#/study/<sid>/<cid>`), because GitHub Pages has no SPA fallback.
- The site is served at `https://dubious-moves.github.io/repworks/` (D17). The organization
  publishes nothing else on Pages, since a second site there would share the origin again.

Tasks:
1. Scaffold: package.json (vite, typescript, preact, @preact/signals, chessops,
   @lichess-org/chessground; dev: @playwright/test), tsconfig, vite config with the base path
   `/repworks/`, GPL-3 LICENSE, README, CLAUDE.md.
2. `npm test` = `node --test "test/unit/**/*.test.ts" "test/sim/**/*.test.ts"`; `npm run
   check` = `tsc` on each project (the app; core alone, with no DOM or Node types, so a DOM
   global in core fails to compile; the service worker against the WebWorker library; the
   tests and scripts) and `node scripts/check-boundaries.mjs`.
3. The boundary check. Control: a deliberate `import … from '../platform/…'` in core fails it.
4. CI on push; Pages deploy from main through GitHub Actions, with the built-in
   `GITHUB_TOKEN` and no stored secret. The deploy is a second job of the same workflow, so
   main deploys only after its checks and tests pass.
5. PWA shell: manifest without an `orientation` key (mistake-lab's lesson), icons, a service
   worker precaching the built assets, and an offline start.

Tests: CI green. The boundary control fails as it should.
Live (desktop Chrome, Android Chrome): the deployed URL installs as a PWA, and opens in
airplane mode after one online visit.

### 4.2 Remote spike (gate for §4.9)

A throwaway page on the site's own origin, `dubious-moves.github.io` (D17), run on both devices
with the real fine-grained token against the real data repo. It records:
1. GET ref, conditional GET (304), recursive tree, raw blob, all from the browser (CORS).
2. `createCommitOnBranch` adding two files and deleting one, then the same call with a stale
   `expectedHeadOid`: the exact error shape.
3. The REST path (tree with inline content → commit → ref `force: false`), stale and fresh.
4. Lichess: a study export with `orientation=true` and the token endpoint, from the page.
5. Whether the token works from the installed PWA after being entered in a normal Chrome tab
   on the phone. The two should share storage; the spike confirms it.
6. A fetch of puzzle-explorer-data's `meta.json`: from this origin it is cross-origin, so it
   needs GitHub Pages' `Access-Control-Allow-Origin: *` (D12).

Exit: the write path is chosen (GraphQL if 2 behaves, else REST), and the real error shapes
are copied into the fake remote used by `test/sim`.

The owner's first run (2026-10-05, desktop, Brave on Windows, build `e92b3d2`):
- G1 (the repo, the token's permissions, `ETag` and the rate-limit headers readable from the
  page; core and GraphQL limits 5,000) and G1c (`X-GitHub-Api-Version` allowed by CORS) passed.
- G2–G4 and G17 got 409 "Git Repository is empty.": the data repo had been created without a
  README. G5 then failed, because the spike carried on.
- G1 reported the data repo as **public**; it has to be private (§3, §8).

Since then the spike stops on an empty repo and says what to do. It also gained G6b (the tree
read by its commit's SHA, as the app reads it) and G7b (blobs read through GraphQL, as the app
reads them). The rest waits for the owner's re-run: the GraphQL and REST writes, Lichess, the
phone and the installed PWA. Until then the adapters' error shapes follow GitHub's
documentation and community reports (`test/support/fakeGithub.ts` says which).

The owner's runs on the phone (Brave 154 on Android 10, in a browser tab): one on 2026-10-05 with
an earlier build, and one on 2026-10-06 with `f857b73`:
- G1, G1b and G1c passed from the phone too: the repo, `/rate_limit` (core and GraphQL limits
  5,000) and the `X-GitHub-Api-Version` header all answer the page.
- G2 still got 409 "Git Repository is empty.", and the 2026-10-06 run stopped there, as it now
  should (the earlier build carried on into G3–G5 and G17).
- G1 still reports the data repo as **public**.

So the data repo needed a first commit and its visibility set to private before the spike could
go further (the owner's steps, as §8 lists them).

The owner then did both, and ran the spike again on the phone (2026-10-06, build `069d93a`, the
same browser). Everything up to the Lichess steps ran:
- **Writes.** GraphQL `createCommitOnBranch` committed (G8, G9), and the PGN read back byte for
  byte (G8b). A stale `expectedHeadOid` gives HTTP 200 with `errors[0].type` `STALE_DATA` and
  `Expected branch to point to "<the expectedHeadOid sent>" but it did not.  Pull and try again.`
  (two spaces) (G10). The REST path works too (G13), and its stale ref is 422 "Update is not a
  fast forward" (G14). A bad token is 401 "Bad credentials" on both (G12b, G14b). Each commit was
  readable at once (first read after it). **GraphQL stays the default write path**, REST behind
  `&write=rest`.
- **Two answers the app must not trip on.** Deleting a path that isn't there is refused with
  `NOT_FOUND` (G11); the sync never asks for it, since it deletes only what the head it commits on
  has. A commit with no changes is made, as an empty commit (G12); the sync never sends one.
- **Reads.** A 304 is free (G4: the remaining count didn't move), and an old ETag after the ref
  moved gets the new head (G15). Blobs read raw and through GraphQL match their SHAs (G7, G7b),
  and the comparison gives the commit messages lost acknowledgements need (G16).
- **G6b failed, and found a bug.** The tree read by the commit's SHA lists the files, but the
  `sha` in GitHub's answer is not the commit's tree. The app kept that value as the base tree, and
  the REST write path built its next commit on it (GraphQL writes don't use it, so the default
  path was unaffected). Fixed on 2026-10-06: a REST commit now takes its parent's tree from GitHub
  (the parent commit, read once, or its own last commit), and a tree read by commit SHA reports no
  tree. The fake GitHub now answers the same way, which made 18 REST tests fail until the fix. G6b
  now checks that the files listed are G6's, and records which SHA GitHub returns.
- **Storage.** `persist()` was refused in the browser tab (S1, Brave: quota 2 GB). The installed
  app may differ; the live check stays. Web Locks and BroadcastChannel are there (S3).
- **P1**: puzzle-explorer-data's `meta.json` reads cross-origin from the site (D12).

The owner's desktop run (2026-10-06, build `0b4d91a`, Brave 154 on Windows, in a browser tab,
the data repo now private) passed every step:
- **G1–G17 all passed, G6b included**: the tree read by the commit's SHA lists G6's files, and
  GitHub's `sha` in that answer is the commit's own SHA, which confirms the fix above.
- The same answers as on the phone: `STALE_DATA` (G10), `NOT_FOUND` for a missing path (G11), an
  empty commit made (G12), 422 "Update is not a fast forward" (G14), 401 "Bad credentials"
  (G12b, G14b). A 304 is free again (G4: 4,992 remaining before it and after it). Each write
  was readable on the first read (G8 after 718 ms, G13 after 620 ms).
- **S1: `persist()` was granted** on the desktop (Brave, quota 2 GB), where the phone's tab was
  refused. S3 and P1 as on the phone.
- **L1–L4 passed** (PKCE round trip and token exchange, `/api/account`, the owner's studies
  listed, a study exported with `orientation=true`). These come from the owner's list of results:
  the JSON file the owner attached ends at P1.

The real error shapes are in `test/support/fakeGithub.ts` and the spike's e2e mock. Still to run:
the installed app (S2's second half, and `persist()` there); L1–L4 from the phone is optional,
since imports are done on the desktop. The token needs only what §8 says: access to that
one repo, with Contents read and write; GitHub adds Metadata read by itself. G1's
`"permissions": {"admin": true, …}` is the owner's role on the repo, not the token's.

### 4.3 Position key

`positionKey(fen)` = the first four fields of chessops's canonical FEN (`parseFen` →
`Chess.fromSetup` → `makeFen(pos.toSetup())`). That gives:
- en passant only when the capture is legal (the dataset's effective rule);
- castling rights normalized (a right without its king and rook is dropped);
- clocks dropped.

A FEN chessops refuses as a position (`fromSetup` error) falls back to the pseudo-legal
rule and is logged. That shouldn't happen for positions reached by play.

`standardUci(pos, move)`: chessops spells castling king-takes-rook (`e1h1`); card IDs use
`e1g1`/`e1c1`. The explorer's `e1h1` and ChessDB's `e1g1` both get normalized at the edge.

Tests:
- en passant: no neighbouring pawn (1.e4); capturable (1.e4 Nf6 2.e5 d5); horizontal pin
  (K a5, P e5, r h5, …d7-d5); diagonal pin (K g7, P e5, b c3); two neighbours, one pinned. These are
  the positions run during planning, with their expected keys.
- The same position as written by chess.js 0.10.3 (always `e3` after 1.e4), chess.js 1.4,
  chessops and Lichess gives the same key.
- Dataset agreement: a committed fixture of about 2,000 published index keys (CC0), including
  every en passant key from 16 shards. Each must be a fixed point, and must hash to its
  shard name (SHA-1, first three hex digits).
- mistake-lab agreement: on random legal games, the key equals mistake-lab's
  `fenPositionKey` except exactly when the en passant capture is illegal.
- Castling: `standardUci` on all four castles, and a parsed explorer `e1h1` maps to `e1g1`.

Live: none. Phase 5's migration reports every mistake-lab key that changes (expected: almost
none).

### 4.4 Study and progress data models

Data repo files (format 1):

```
repworks.json                      { "format": 1 }
studies/<sid>/study.json           { "format": 1, "id", "name", "kind": "repertoire" | "reference",
                                     "chapters": ["<cid>", …],
                                     "source"?: { "kind": "qchess" | "lichess" | "file", "id"?, "name"?, "imported" } }
studies/<sid>/<cid>.pgn            exactly one game: one chapter
progress/<dev>/<YYYY-MM-DD>.jsonl  events of that UTC day, written only by <dev>
progress/<dev>/<YYYY-MM>.jsonl     a closed month, compacted by <dev>
devices/<dev>.json                 { "name": "phone", "created": "…" }, written once by <dev>
```

- IDs (studies, chapters and devices): 8 random characters `[A-Za-z0-9]`, like Lichess's.
  Provenance goes in `source`, so re-importing a study never clashes with an old one.
- Chapter-level facts live in the chapter's PGN headers (`ChapterName`, `Orientation`,
  `FEN`/`SetUp`, any other tags, kept in order). Study-level facts live in `study.json`, which
  is the truth for the study's name.
- Chapter files keep every header as imported, `StudyName` included, so a stored chapter *is*
  its Lichess export. Renaming a study also rewrites `StudyName` in its chapters, in the same
  commit.
- Chapter order comes from `study.json`, reconciled with the files present. A chapter file
  missing from the list is appended, so a Claude session that forgets the list loses nothing.

In memory (`src/core/study/model.ts`):

```ts
type Brush = 'green' | 'red' | 'blue' | 'yellow';
interface Shape { brush: Brush; orig: Square; dest?: Square }      // no dest: a circle
interface NodeData {
  comments: string[];          // text comments in order; [%anno …] stays in the text
  shapes: Shape[];             // from every [%csl]/[%cal] on the node, order kept, no duplicates
  nags: number[];
  startingComments: string[];  // only from non-Lichess PGN (a comment before a variation's first move)
  clock?: string; emt?: string; eval?: string;   // kept verbatim when present
}
interface MoveNode extends NodeData { san: string; children: MoveNode[] }   // children[0] is the main line
interface Chapter { id: string; headers: [string, string][]; root: NodeData & { children: MoveNode[] } }
```

- A node's identity is its path of canonical SANs (chessops `makeSan`). Import canonicalizes,
  so "siblings never share a SAN" holds even for Chessable's `Ndb5`.
- FENs, position keys, UCIs and plies are derived when a chapter is walked, never stored.

Progress events, one JSON object per line:

```json
{"v":1,"n":4211,"t":"2026-10-05T14:03:12.345Z","k":"review","card":"r|<positionKey>|e2e4","g":3,"ms":4210}
```

- `n` counts up per device, and (device, `n`) is unique. `t` is the device clock. `k` is the
  kind.
- Phase 0 kinds: `review`, `suspend`, `unsuspend`, `forget`. Later phases add their own kinds
  (`snapshot`, a migrated FSRS state, in Phase 5; `mistake`, `pin`, `storm`, `puzzle`, …).
  Every card starts new (D19), so nothing before Phase 5 needs a snapshot.
- Readers skip kinds they don't know, and a device's compaction keeps them verbatim.
- Card IDs carry a kind letter: `r|key|uci` is a repertoire move. Later: `p|key` plan recall,
  `m|…` game mistake, `z|id` puzzle.

Derived (local only, rebuilt from files):
- parsed chapters, cached by blob SHA;
- the repertoire index `positionKey → [{uci, san, studyId, chapterId, path, side}]`;
- card states from replay.

Tests:
- `validate-data` accepts a fixture data repo and rejects one with a chapter missing from
  disk, a malformed `study.json`, or a progress line that won't parse. A bad line is a
  warning, not a crash.

### 4.5 PGN tree and the Lichess round-trip suite

Tasks:
1. **Parse** (`core/pgn/parse.ts`): chessops `parsePgn(text, emptyHeaders)`, so that only the
   given headers are kept, in order. Then:
   - `startingPosition(headers)` must succeed, or the chapter is refused with a reason.
   - Replay every move with `parseSan`. An illegal move cuts its subtree and reports the path.
   - SAN is rewritten to `makeSan`. Siblings that become identical are merged (as lila does
     on import) and reported.
2. **Comments** (`core/pgn/comment.ts`): pull `[%csl]` and `[%cal]` out into shapes, using
   lila's more permissive patterns (`CommentParser.scala`). Keep `[%clk]`, `[%emt]` and
   `[%eval]` verbatim, and leave anything else (`[%anno]`) in the text. Unlike chessops's
   `parseComment`, don't rewrite whitespace inside the text.
3. **Write** (`core/pgn/write.ts`), following scalachess's `PgnNodeEncoder` and
   `Move.appendSanStr`:
   - headers in order, a blank line, root comments as `{ a } { b }` plus a newline;
   - `N. ` before White's moves, `N... ` before Black's only at a line start or after a
     comment or variation;
   - glyphs 1–6 as a suffix, others as ` $n` (and never two suffixes in a row, which would
     read back as one);
   - ` { [%eval …] }` when the node has one, each text comment as ` { text }`, then shapes as
     ` { [%csl …][%cal …] }`, then ` { [%clk …] }`;
   - variations as ` (…)`, all on one line, then ` <Result>` when there is a Result header;
   - last, every `] } { [` becomes `] [`, as lila's export does. The parser joins two text
     comments the same way, so a write then a read changes nothing.
   A chapter file is that text plus one newline; a study export is the chapters each followed by
   three newlines.
4. **Sanitize** on edit, Lichess's rules (`tree.scala` `Comment.sanitize`, after scalalib's
   `softCleanUp`: NFKC, invisible and control characters out): delete `{` and `}`, CRLF→LF,
   strip line-leading and trailing spaces, collapse runs of blank lines, and then drop blank
   lines altogether as the export does. Warn above 4,000 characters, which Lichess would cut.
   Imported text is kept as parsed.
5. **Fixtures.**
   - (a) A Lichess test study the owner creates for this, exported with
     `?clocks=false&orientation=true`. It needs: chapters for both perspectives; a custom FEN
     with Black to move; a comment before the first move; text plus arrows and circles on one
     move; nested variations; all six move glyphs and some position glyphs; a multi-line
     comment; a comment typed with `{ }` (it should arrive stripped); castling both ways, en
     passant and a promotion; one long chapter.
   - (b) The owner's real studies: two or three Lichess exports, the Qchess export of each
     repertoire study (§4.10), and a sample of the owner's Chessable export script's output.
     The owner may not want their repertoire in a public repo, and course content must not go
     there, so these stay in the private data repo and run locally through
     `REPWORKS_FIXTURES=<path>`.
   - (c) PGN from other writers. Qchess comes first, as the home of the owner's newest
     repertoire: a synthetic sample written to the rules of its `generatePGN` (§2). Then
     repgen, deeprep and ChessBase. Synthetic samples go in the public repo.

Tests:
- (a), and the Lichess exports in (b): `write(parse(F)) === F` byte for byte, per chapter. A
  Lichess export is rewritten exactly.
- (c), and the other files in (b): `parse(write(parse(F)))` equals `parse(F)` in the model, and
  `write` is stable (writing twice gives the same text).
- Qchess: its single `{[%csl …][%cal …] text}` block becomes text plus shapes, written back as
  Lichess's two blocks; every glyph Qchess offers lands in the right group (move, position,
  observation); a Black move with no number after a comment parses.
- Property: random legal trees with random comments, shapes and NAGs survive write → parse.
- The parser cuts an illegal move and reports it. `Ndb5` becomes `Nb5`. Two siblings that are
  both `Nb5` after canonicalizing are merged.

Live (desktop, once per writer change): import our own output into a new Lichess study, export
it again and compare. The only differences allowed are headers Lichess assigns itself
(`Event`, `Site`, `ChapterURL`, `Annotator`, dates, `ECO`, `Opening`).

### 4.6 Tree edits

Pure operations in `core/study/ops.ts`, each returning a new chapter:
- `addMove(path, san)`: navigates if the child exists, otherwise appends a variation;
- `deletePath(path)`: deletes the node and everything after it;
- `promote(path)`: one step up among siblings; `makeMainline(path)`;
- `setComment(path, text)`: only the owner's comment, the first one without `[%anno]`;
- `setNags(path, nags)`: one move glyph and one position glyph at a time, as Lichess allows;
- `setShapes(path, shapes)`;
- `setHeader(name, value)`.

Chapter and study level: create, rename, delete, reorder, set `kind`, set `Orientation`.

Tests: each operation against a hand-written expected tree; the result is always valid
(every move legal from the start FEN, no duplicate siblings); `promote` then the reverse
gives back the original.

### 4.7 Three-way merge

`mergeChapter(base, ours, theirs) → { chapter, conflicts }`. `base` is the version both sides
last agreed on (the device's base commit), `ours` is local, and `theirs` is the remote head.
Nodes are matched by path.

Presence:

| in base | ours | theirs | result |
| --- | --- | --- | --- |
| no | yes | no | keep (added by ours) |
| yes | yes | yes | keep |
| yes | no | yes | delete, **unless theirs edited inside that subtree**: then keep each edited node and the path to it, and mark the highest kept node "kept after delete" |
| yes | no | no | delete |

Mirror cases are symmetric. "Edited" means a node that is new, or whose comments, NAGs or
shapes differ from base.

Attributes of a kept node:
- **Comments** (the list as a unit). If only one side changed them, that side wins. If both
  changed them differently, both versions are kept in one comment with git-style markers:

  ```
  <<<<<<< phone 2026-10-04
  the phone's text
  =======
  the desktop's text
  >>>>>>> desktop 2026-10-05
  ```

- **Shapes**: a set merge. An arrow added on either side stays, and one removed on either
  side goes. This needs no flag.
- **NAGs**: the move glyph and the position glyph are each single-valued; observation glyphs
  merge as a set.
- **Child order**: if ours changed the order of the children both sides have, ours wins;
  otherwise theirs. New children go in after the sibling they followed on their own side.
- **Headers**: per key.

"Last writer wins" (DECISIONS D4) is defined as **the side that syncs later wins**, i.e. ours,
since the merging device is the one pushing. Per-attribute edit times would cost a lot for
clashes that are rare and harmless.

A changed start FEN: if only one side changed it, that side's tree wins. The other side's edits
since base are kept as a "(conflict copy)" chapter. If both changed it, both chapters are kept.

`mergeStudy(base, ours, theirs)`:
- `name` and `kind` per field;
- chapter order as for child order;
- a chapter file deleted on one side and edited on the other is kept, with a "kept after
  delete" marker in its root comment;
- a study deleted on one side and edited on the other is restored the same way.

A file that won't parse is never rewritten. If both sides changed it, theirs is kept and ours
is saved beside it as `<cid>.conflict-<dev>.pgn`.

Markers are plain text in PGN comments. They survive Lichess's sanitizer, which only deletes
braces and tidies whitespace. As built:
- the caller passes the two labels (device name and date), so the merge stays pure;
- when both sides changed a comment list, what they share at its start and end stays outside
  the markers (so another author's unchanged comment isn't duplicated), and only the differing
  middle goes between them;
- a list changed on one side only (glyphs, shapes, headers) is taken from that side exactly, so
  the identity laws hold to the byte;
- when both sides add moves or chapters after the same neighbour, ours come first;
- a move that becomes its parent's first child carries a "before the move" comment into its
  comments, since PGN can't hold one before a main-line move;
- a restored study keeps the chapters the restoring side edited (each marked) and its
  study.json; chapters nobody edited stay deleted. The **conflicts view** lists every comment containing `<<<<<<<`.
Resolving a conflict is an edit: pick one side, edit the text, or, for "kept after delete",
delete the line now or keep it. So any device sees the same open conflicts, and nothing
outside the PGN needs syncing.

Tests (`test/unit/merge`, `test/sim`):
- Each table row and attribute rule, written by hand.
- Laws: `merge(B, B, T) = T`, `merge(B, O, B) = O`, `merge(B, O, O) = O`.
- Property, over random trees with up to 6 random edits on each side (add, delete, comment,
  NAG, shape, reorder):
  - no added node is lost;
  - every comment text written on either side appears in the result;
  - a deletion whose subtree the other side didn't touch holds;
  - an edit inside a deleted subtree survives with its path and a marker;
  - the result is a valid chess tree;
  - the result is deterministic.
  (The planning prototype passed this on 20,000 cases.)
- Simulation: random two- and three-device histories converge (3,000 runs in the prototype).
  Built: 2,500 property runs in CI (20,000 checked once with `REPWORKS_MERGE_RUNS`), 1,500
  two-device and 600 three-device histories.

### 4.8 Progress log and replay

- **Writing.** A review appends an event to the local log (IndexedDB) at once; sync uploads it
  later. The device's file for a day holds that UTC day's events. A sync rewrites only the
  days that changed, normally just today's (≤ ~30 KB at 200 reviews).
- **Compaction.** Once a month is over and fully synced, the owning device replaces its day
  files for that month with one month file, in a single commit. Readers accept both forms.
- **Replay** (`core/progress/replay.ts`):
  - collect every device's events, drop duplicate (device, `n`), and sort by
    (`t`, device, `n`);
  - fold per card: `review` applies FSRS at `t`, `suspend` and `unsuspend` flag the card,
    `forget` resets it;
  - a negative gap between reviews (clock skew between devices) counts as zero, as
    mistake-lab's `fsrs_review` does;
  - replay is per card, so new events replay only the cards they touch.
- **FSRS**: port puzzle-explorer's `lib/fsrs.js` to TypeScript. It is the modular, tested
  extraction of mistake-lab's FSRS-5 (same weights, long-term scheduler; its 70 checks
  pass when run from a scratch copy).
  - Retention becomes a setting: 0.9 in mistake-lab, 0.93 in puzzle-explorer.
  - No fuzz, so replay is deterministic.
  - The weights are stored with the parameters, so changing them simply re-replays.
  - As built: a card's `due` is an instant (the last review plus the interval), not
    puzzle-explorer's local-date string, so every device computes the same state whatever its
    time zone; "due today" is asked with the device's own calendar, in the app. The port gives
    puzzle-explorer's numbers on 509 recorded review steps at retention 0.9 and 0.93: to the
    last bit on Node 22, where they were recorded. On Node 24 one step's stability differs in
    the last bit, because `Math.pow` and `Math.exp` may round differently from one JavaScript
    engine to another, so the test compares real numbers to 1e-12 (scheduled days exactly).
    The same holds between two browsers: card states agree to within rounding, and due dates
    agree unless an interval falls within rounding of half a day. The acceptance test
    compares due dates and rounded numbers, not raw floats.

Tests:
- Shuffled input gives the same state.
- puzzle-explorer's `fsrs-test.js` cases, ported, pass.
- Two devices interleaved by time give the same result as one device doing all the reviews.
- A duplicate line is applied once. An unknown kind is skipped and survives compaction. A
  corrupt line is reported and skipped.
- 100,000 events replay in under 200 ms on the desktop in Node, measured in CI.

Live: the phone's replay time with a year of synthetic events (the target is under 1 s). The
acceptance test (§4.11) checks that both devices compute the same card states.

### 4.9 GitHub sync

**Ports.**

```ts
interface Remote {                                   // as built: src/core/sync/ports.ts
  head(etag?): Promise<{ commit: string; etag: string } | 'not-modified'>;
  files(commit): Promise<{ commit: string; tree: string; files: Map<string, string> }>; // path → blob sha
  blobs(shas): Promise<Map<string, string>>;         // sha → text
  commit({ parent: { commit, tree }, message, add: Map<path, text>, remove: path[] }):
    Promise<{ ok: true; commit: string; tree: string } | { ok: false; reason: 'stale' }>;
  commitsSince(head, base): Promise<{ sha: string; message: string }[]>;   // for lost acknowledgements
}
// Other failures throw RemoteError: auth (401), rate (403/429, with GitHub's wait), network (no
// answer: a commit's outcome is unknown), server (5xx: unknown too), setup (404; 409, an empty
// repo; 403 without a rate limit).
```

Two implementations, `src/platform/githubGraphql.ts` (commits through `createCommitOnBranch`,
blobs through GraphQL in batches) and `src/platform/githubRest.ts` (everything through REST).
Both are tested through the same suite against the fake.

**Local store** (IndexedDB `repworks`):
- `meta`: device ID and name, base commit and tree, schema version.
- `blobs`: content by SHA.
- `files`: working copies, each with the SHA of its base version.
- `log`: own events, each with whether it has been uploaded.
- `parsed`: chapter models cached by SHA.

**The sync step** (in `core/sync`, pure, given the ports). It runs under a Web Lock, so two
tabs never sync at once, and a BroadcastChannel tells other tabs what changed.
1. Snapshot the local changes S: the authored files changed since base, and the own-device
   day files with new events.
2. `head()`. If the head is the base commit, commit S with `expectedHead = base`.
3. Otherwise: fetch the head's tree and the blobs whose SHA changed, then:
   - merge each authored file three-way (§4.7);
   - take other devices' progress files as they are;
   - own-device files are ours alone. If the remote copy differs (it shouldn't), take the
     union of the lines by `n` and report it.
   - Commit the result with `expectedHead = head`.
4. Stale → back to 2, with backoff, at most 5 times.
5. Success → base = the new commit. Working files = the merged result, plus any edits made
   during the sync, re-applied by the same merge with the snapshot as base.

**Lost acknowledgements.** The commit message carries `repworks-sync: <device>:<seq>`. When a
commit's outcome is unknown (timeout, app killed), the next sync looks for that ID between
base and head. If it's there, the device adopts that commit instead of merging again.
Merging again would nest conflict markers; the planning prototype showed it does.

**When to sync**:
- pull on start, on focus, when the network comes back, and every 5 minutes while visible.
  These pulls are conditional GETs, and a 304 costs nothing against the primary limit;
- push 30 s after the last change, at most once a minute per device;
- push when the app is hidden, best effort.

That stays far under 500 commits an hour even with two devices editing at once.

**Errors**:
- 401 → "token expired or revoked", local work kept, with a link to the setup screen;
- 403/429 → back off on `retry-after`, else for a minute, doubling;
- network errors → retry later.

The status shows synced / N changes waiting / offline / error, with the time of the last
successful sync.

**Setup** (§8 lists the owner's steps in order):
- The owner creates the data repo (private, with a README, because GitHub can't create a
  branch in an empty repo) and a fine-grained token: that repo only, Contents read/write.
- A device is set up by opening `…/#setup?repo=<owner/name>&token=<token>`, typed, pasted or
  scanned from a QR code on the desktop. The app stores it in IndexedDB and removes it from
  the address bar at once (`history.replaceState`).
- The app asks for persistent storage (`navigator.storage.persist()`).

Tests (`test/sim`, a fake remote with real git semantics: content-addressed blobs, trees and
commits, and a branch head checked against `expectedHead`; error shapes copied from §4.2):
- push and pull;
- both devices push, one is stale, merges and wins on retry;
- a random interleaving of edits, reviews and syncs across 2–3 devices, including edits during
  a sync, dropped connections, and a commit that lands but whose answer is lost: devices
  converge, and §4.7's properties hold over the whole history;
- 401 keeps local work; 429 backs off; compaction is atomic and loses no line.

Live: the acceptance test (§4.11); the request counts of a day's normal use, read from the
debug panel, against the limits above.

**As built** (where the build settled details the plan left open, or changed them):
- **Pull, then push.** A pull whose head moved merges the working view (base plus working
  copies) with the head three-way and makes the head the new base at once; whatever of ours the
  head lacks stays as working copies. The push commits those, and the device's new events, on
  the base. Stale → pull again and retry after 1, 2, 4, 8 s (with jitter), at most 5 commits.
  This is steps 1-5 above, with the merge kept locally between the two halves.
- **Reads.** The tree is read by the commit's SHA, one request fewer than commit then tree
  (through the commit if GitHub ever refuses that; spike G6b checks it). Blobs come through
  GraphQL, 100 to a request, each checked against its SHA, with REST for any that doesn't
  match. A first clone of 1,000 files would otherwise be 1,000 REST requests, over GitHub's 900
  points a minute. The REST remote paces blob reads at 10 a second.
- **Local store** (`src/platform/idbStore.ts`). `files` holds the working copies laid over the
  base, each with the edit counter's value when written. A sync finishes in one transaction
  that writes only if nothing was edited since it computed its result; otherwise it computes
  again. So an edit made during a sync is merged onto the result (the snapshot as base), never
  lost. The same transaction deletes blobs that neither the base nor a pending commit refers
  to. `parsed` (chapter models cached by SHA) comes with the editor (§4.11).
- **Pending commits** are recorded before they are sent, with their snapshot and their files,
  and kept until found on the branch (adopted) or unable to land (the branch moved past their
  parent).
- **A lagging replica.** A head read that returns an earlier base is read again after 1 s and
  2 s before it is believed, so a device never steps back to before its own last commit.
- **The data format.** The app writes nothing to a repo whose `repworks.json` declares a format
  other than 1, or can't be read. The first sync adds `repworks.json` if the repo lacks it, and
  the device's `devices/<dev>.json`.
- **This device's progress file changed by someone else**: every line of every side is kept
  (a union by `n`), and the sync reports it.
- **Commit messages**: `phone: 2 study files, 14 events`, then `repworks-sync: <device>:<seq>`.
  Conflict markers name the devices from the headlines of the commits since the base.
- **When to sync** (`src/core/sync/schedule.ts`): as above. Also: hiding the app pushes at
  once; a refused token stops syncing until setup or a sync asked for by hand; the network
  coming back clears any wait.
- **Setup**: the link also takes `&name=` (the device's name; else phone or desktop from the
  browser) and `&write=rest` (REST commits). The setup screen has a form for the same, and
  Settings shows the setup link of the next device as a QR code, on request, since it holds the
  token. A public data repo is warned about at setup and on every start.
- **Tests**: the step's suite (17 cases) runs three times: through the plain fake, and through
  the REST and GraphQL adapters over a fake GitHub (`test/support/fakeGithub.ts`). 420 random
  histories of 2-3 devices through the fake converge, plus 50 through the adapters and 30
  through the IndexedDB store, which runs in Node on `fake-indexeddb`. Between them they hold
  about 2,000 edits made during a sync, 50 commits that landed with their answer lost (each
  adopted, none merged twice), 500 dropped connections and 220 rate limits. In the browser
  (Playwright, desktop and phone): setup from a link, the first sync, a pushed review, a pull,
  a refused token and the REST path, against the same fake GitHub.

### 4.10 Import

Every import makes a new study and records its source (D3). The owner chooses *repertoire* or
*reference*.

- **Qchess study** (D18), first because the owner's newest repertoire is there.
  - `scripts/qchess-export.js` is pasted into DevTools on the Qchess study page. It calls
    Qchess's own `saveCurrentChapterPgn()`, so the open chapter's latest edits are included,
    and downloads one file with every chapter's stored PGN, adding:
    - `[Orientation]` from the chapter's `perspective`;
    - `[QchessFolder "<name>"]` for a chapter in a folder;
    - `[QchessTrain "false"]` for a chapter, or a folder, excluded from Qchess's MoveTrainer.

    The intro chapter is skipped while it still holds Qchess's default text
    (`_introPgnIsDefault`). The script changes nothing on Qchess.
  - Its core, `qchessStudyToPgn(studyData)`, is a pure function; the page part only calls
    Qchess and saves the file.
  - Qchess's own "Download study PGN" also imports. It lacks those headers, so the import asks
    the side once for the study, changeable per chapter, and folders and exclusions are lost.
  - In the site the file is an ordinary PGN file import (below). Chapters marked
    `[QchessTrain "false"]` go into a companion reference study, `<name> (reference)`, because a
    study is repertoire or reference as a whole (D3).
  - Until Phase 1 is in daily use the owner keeps editing in Qchess, so earlier imports are
    trial copies. At the switch each study is imported a last time and the trial copies are
    deleted.
- **Lichess study.**
  - Paste a URL or ID (puzzle-explorer's `extractStudyId`, ported), or pick from
    `/api/study/by/<user>`.
  - Fetch `/api/study/<id>.pgn?clocks=false&orientation=true`, with the token for private
    studies, and split it into chapters.
  - A chapter without `[Orientation]` asks for its perspective.
- **Lichess OAuth**: PKCE with a redirect, scope `study:read`, ported from puzzle-explorer's
  `lib/lichessAuth.js`, with one change: the verifier goes in localStorage, not
  sessionStorage. On Android the redirect may come back in a Chrome Custom Tab rather than the
  PWA window, and only origin storage is shared between them; the spike checks this. The token
  is stored per device (never in a repo). The explorer reuses it in Phase 2.
- **PGN file or paste**: the Qchess export; the output of the owner's Chessable export script
  (D14: bought courses become reference studies, in the private data repo only); repgen,
  deeprep, ChessBase. Several games become chapters. A chapter's side comes from
  `[Orientation]`, else Qchess's own `[ChapterPerspective]`, else the import asks.
- **Import report**: illegal moves cut (with their paths), siblings merged, comments over
  4,000 characters, headers kept.

Tests:
- the fixtures of §4.5 import with the expected report;
- a study whose IDs already exist still imports as a new study;
- `qchessStudyToPgn` on a hand-built `studyData` (a Black chapter, a folder, an excluded
  folder, a default intro, a chapter stored without headers, a folder name with a quote) gives
  the expected headers, and the result imports with the right sides and the right companion
  reference study.

**As built** (where the build settled details the plan left open, or changed them):
- **The export script** (`scripts/qchess-export.js`) was written against the study page's source
  as fetched again on 2026-10-06 (without login): `studyData.chapters[]` (`name`, `pgn`,
  `perspective`, `is_intro`, `chapter_uuid`, `exclude_from_movetrainer`, `fen`) and
  `studyData.folders[]` (`name`, `chapter_uuids`, `exclude_from_movetrainer`). Besides the three
  headers above it adds `[StudyName]`, so the import knows the study's name. Qchess writes header
  values without escaping and its reader stops at the first quote, so a chapter name with a quote
  breaks Qchess's own header block; the script reads each header line up to its last quote and
  writes the values escaped. An empty chapter made from a FEN gets `[SetUp]`/`[FEN]` from the
  chapter's `fen`. The file is saved as `<study>.qchess.pgn`.
- **One file, two uses.** Off a Qchess page the script hands back its pure part,
  `qchessStudyToPgn(studyData, isDefaultIntro)`, which the Node tests run through `vm`. The site
  bundles the same file (Vite `?raw`), so the import screen copies it to the clipboard, or shows
  it, with the steps to run it.
- **Stored chapters** keep every header as read, plus: `ChapterName` when missing (from `Event`,
  else the players, else the number), the chosen side in `Orientation`, and the study's name in
  `StudyName` (rewritten as a study rename rewrites it, Lichess-style `Event` included). So a
  Lichess chapter imported under its own study name is stored byte for byte as exported.
- **The source** is `lichess` (with the Lichess study ID), `qchess` (a file with Qchess's
  headers, or named `*.qchess.pgn`), else `file`, with the file name.
- **The review** before an import: the name (from `[StudyName]`, else the file name), repertoire
  or reference, each chapter's side (one button sets every chapter still without one), the
  chapters left out as unreadable, and the report (parser notes with the moves written out, and
  the headers kept with how many chapters carry each). A reference import keeps Qchess's untrained
  chapters in the one study.
- **Lichess**: `src/platform/lichess.ts` holds the client and the login; the client ID is
  `repworks` and the redirect is the site's own address. The redirect's `?code=…&state=…` leaves
  the address bar before anything else runs, like a setup link, and the import screen opens
  again. The token is kept in localStorage (`repworks-lichess`), with its expiry, and logging out
  revokes it. The study list asks Lichess for a username's studies, filled in with the logged-in
  user's.
- **Routes** start here: `#/` (studies) and `#/import` (`src/core/app/route.ts`).
- **Tests**: `test/unit/core/import` (reading, sides, companion study, new IDs over taken ones,
  the report), `test/unit/scripts/qchessExport.test.ts` (the hand-built `studyData` above, then
  its import), `test/unit/platform/lichess.test.ts` (requests, errors, and the PKCE round trip
  against a fake Lichess), and Playwright on desktop and phone (`test/e2e/import.spec.ts`): a
  Qchess file, pasted PGN needing sides, a public Lichess study, the login then a private study,
  and copying the script. All against mocks: none of it has met the real Qchess or Lichess yet.

Live:
- desktop: export each Qchess repertoire study with the script and import it. Check the chapter
  count, each chapter's side, and a sample of comments and arrows against Qchess's own view;
- desktop: import a private Lichess study through OAuth, and check the chapter count, comments
  and arrows against Lichess's own view;
- phone: the study appears after one sync; the OAuth flow from the installed PWA.

Checked by the owner on 2026-10-06, on the desktop: a Qchess export ("Download study PGN") and a
Lichess study both imported as expected, comments and arrows included. The owner's Lichess test
study (§4.5 (a)) was one of the imports. Still to run: OAuth from the installed PWA on the phone;
the test study's export through the round-trip suite (`REPWORKS_FIXTURES`); and our output
imported back into Lichess and compared (§4.5, Live).

### 4.11 Study editor on chessground, and the Phase 0 acceptance test

**Screens.** Phase 0 modes are a small state machine in `core/app/fsm.ts`, tested in Node:
- study list (repertoire and reference marked);
- chapter view: board, notation, comment and glyph panel;
- conflicts;
- settings and device setup;
- a debug panel.

**Board.** A Preact wrapper around chessground:
- legal moves from chessops (`chessgroundDests`);
- orientation from the chapter's perspective, last move, check;
- cburnett pieces from chessground's own CSS;
- arrows: right-drag on the desktop (chessground's own, with its modifier colours). On the
  phone, a draw-mode button turns a drag into an arrow and a tap into a circle, through
  `setShapes`, since chessground starts drawing only on right-click or Shift.

**Notation.** As Qchess's study page lays it out (D21, which replaced the first plan of
Lichess-style variations inline in brackets): the main line in rows of two moves, broken by
comments and variations on rows of their own; a variation inline, each continuation of a fork on
its own indented branch. The current move is highlighted through a signal so navigation redraws
two nodes, not the tree. Keys: ← → ↑ ↓, Home, End. Clicking a move goes there.

**Edits.** Play a move to extend or branch. Per-node menu: delete from here, promote, make main
line, copy the line as PGN. A comment box (sanitized, with a 4,000-character warning). Glyph
buttons. Undo/redo for the session. (As built: the menu opens on a right-click or long-press of
the move, and the comment and glyphs are in a dialog, as in Qchess.)

**Layout** follows mistake-lab's mobile conventions as a spec: board first, a drawer, 44 px
tap targets, feedback below the board, `touch-action: none` on the board, and no
`orientation` in the manifest. On a wide screen it is Qchess's study page (D21): the chapters on
the left, the board, and a panel with the notation, the tools and the move buttons.

Tests:
- operations and state machine in Node;
- Playwright smoke tests against `vite preview` with GitHub mocked through request
  interception, on a desktop viewport and an emulated phone: open a chapter, add a variation,
  comment, add a glyph, draw an arrow in draw mode, and check the PGN written to the mocked
  repo.

Live (desktop and phone): every editor action above by hand, including draw mode by finger,
and offline editing with the PWA killed and reopened.

**As built** (where the build settled details the plan left open, or changed them):
- **Modes** (`src/core/app/fsm.ts`): the study list, import, conflicts, and a chapter, each with
  its address: `#/study/<sid>/<cid>?at=e4,c5`. The move shown is kept in the address (replaced,
  not pushed, so stepping through a line doesn't fill the browser's history), so a reload or a
  link from the conflicts view opens at that move. Settings and setup stay in the list's debug
  panel.
- **Keys**: ← → along the line, ↑ ↓ to the previous or next variation at this move, Home and End
  to the start and the end of the line; Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) undo and redo.
- **The notation** is laid out in core (`src/core/study/notation.ts`) with the PGN writer's
  numbering rules, tested against the writer on every fixture and 200 random trees. Each move
  reads its own "current" signal, so moving redraws two moves.
- **A left click clears the arrows, as on Lichess** (revised 2026-10-08, the owner's request; the
  board first ignored every clear). chessground clears on a press that doesn't pick up a piece of
  the side to move and isn't the move of a selected piece, so moving a piece never clears; in the
  editor the move's arrows go from the study (Ctrl+Z brings them back), on a storm's card the
  sketch goes, and on a board whose arrows aren't edited (Read, the trainer) what was drawn over it
  goes and the shown arrows stay. Where no move can be made, a press on any piece clears too. Right-drag and the phone's draw
  mode toggle a shape as chessground does (same shape off, another colour replaces it). Draw mode
  catches touches and clicks before chessground sees them, since `viewOnly` can't change after
  the board starts.
- **Edits** are core's operations; each new chapter is written at once as the device's working
  copy, in order. When a sync or another tab changes the open chapter's file, it is read again,
  the move shown is kept where it still exists, and undo starts over (it would otherwise undo
  someone else's work). A read that an edit overtook is made again, or the edit would look like
  someone else's change and be lost (the Playwright tests found this under load). Likewise the move
  asked for in the address stays pending until a read shows it: a sync finishing while a chapter
  opened started a newer read, which opened the chapter at its start (found on 2026-10-06, in two
  of three full e2e runs). A chapter whose file can't be read, or holds illegal moves an edit would
  cut, is shown without editing. A promotion asks for the piece as Lichess does, on every board
  that takes moves: the four pieces in a column from the promotion square over a dimmed board,
  the pawn waiting there; Escape or a click elsewhere takes the move back.
- **Conflicts** are resolved where they stand (`src/core/merge/resolve.ts`): for clashing text,
  either side, both, or a text written by hand; for a line kept after a delete, keep it (the
  marker goes) or delete it. The conflicts view also lists conflict copies of unmergeable files.
- **Chapters and the study** (a drawer under the notation): the chapter's side, rename, move up
  or down, delete, add a chapter; the study's name (rewriting every readable chapter's
  `StudyName`) and kind. (Moved by §5.15 into Qchess's places: the ⚙ by the study and by each
  chapter, and "+ New chapter".)
- **The debug panel** shows the card states from replaying every device's log plus this
  device's unsent events: reviews, due time, stability and difficulty to four places, for step 6
  of the acceptance test.
- **The layout as Qchess's** (D21, 2026-10-06, after the owner's first import). The notation's
  rows come from core (`src/core/study/notation.ts`): pairs of main-line moves with a gap ("…")
  where a comment or a variation breaks the row, comment rows, and variations whose forks become
  branches, the first continuation first. A White move is always numbered, a Black move only at
  the start of a line or a branch (Qchess's rule, not the PGN writer's). The view fills the
  window from 900 px wide: the board's side is the height left, or what the width leaves after
  the panel (a CSS size container); the chapter list joins on the left from 1150 px and replaces
  the chapter menu. The move list scrolls itself, never the page, to keep the current move in
  view. The phone keeps one column: board, move buttons, notation (at most 55% of the screen),
  tools. Copied from Qchess's page, read live on the owner's test account at 1900×920 and on a
  412 px phone viewport: the row grid (40 px, then two equal columns), the variation's shaded
  block, the branch's left rule and tick, italics for later branches, bolder heads at shallow
  depth, comment and highlight colours. Not copied: Qchess's engine toggles, FEN box and
  buttons, which belong to Phase 3 or aren't needed; the explorer comes with Phase 2, under the
  notation. Tests: `test/unit/core/study/notation.test.ts` (a hand-built deep chapter laid out
  row by row, a start with Black to move, branch numbering and depth, and every move shown once
  with the right number on the fixtures and 200 random trees); in Playwright, the editor tests
  read the new rows, and a wide-screen test checks the chapter list and that board and panel
  fit the window. Live: not yet seen on the owner's devices.
- **The move menu and the comment dialog, as Qchess's** (D21, 2026-10-06, the owner's ask: the
  glyphs, comment box and line actions under the notation left the notation little room on the
  desktop). A right-click on a move opens its menu at the pointer, and shows that move: Comment,
  Promote (not on a first continuation), Make main line (not on the main line), Delete from here,
  Copy line as PGN; on the start, Comment alone. A right-click on a comment opens its move's
  menu. The phone opens it by a long-press (Chrome fires `contextmenu`; the moves can't be
  selected as text) and both open the shown move's menu from a ⋯ button at the end of the move
  buttons, which on the phone now share one row. Comment opens a modal dialog: the text, then
  Qchess's three rows of glyphs (move, observation, position; one grid of seven columns on a
  phone), Clear glyphs, Save and Cancel. As in Qchess, a glyph applies at once and Cancel drops
  only the text; Escape cancels, Ctrl+Enter saves, and the chapter's keys don't act behind it.
  The text field takes the focus only with a mouse, so the phone's keyboard doesn't cover the
  glyphs. The panel keeps the notation, a conflict box when the move shown has one, the drawer
  and the move buttons. Read live on Qchess's study page with the owner's test account
  (2026-10-06, 1600×900): the menu's items, colours and box, the dialog's layout, that glyphs
  apply before Save, that Escape closes it. Tests: the editor and acceptance tests drive every
  edit through the menu (by right-click and by ⋯) and the dialog, on desktop and the emulated
  phone; a new test covers Escape, Ctrl+Enter, Clear glyphs, the menu's items on each kind of
  move, and the start's comment. Live: not yet seen on the owner's devices; the long-press is
  untested (Playwright's phone emulation sends a right-click, not a long touch).
- **Not built yet**: the `parsed` cache of chapter models by blob SHA (§4.9). A chapter is parsed
  when it is opened, which is quick at repertoire sizes; the cache comes if the phone shows a
  need.
- **Tests**: modes, history, navigation, notation, resolution and `toggleShape` in Node.
  Playwright on desktop and phone: open a chapter and move through it, a variation played on
  the board, a comment, a glyph, an arrow and a circle in draw mode, undo and redo, line actions,
  chapters added, renamed, turned and deleted, the conflicts view and both resolutions, an
  unreadable chapter left alone; each checked in the PGN that reaches the fake repo. And a
  **rehearsal of the acceptance test** (`test/e2e/acceptance.spec.ts`): a desktop page and an
  emulated Pixel 7 against one fake GitHub, both offline, the edits of steps 3 and 4 (the phone
  reloaded offline with its edits kept), synced in step 5's order. It checks step 6's result
  byte for byte in the merged PGN, on both devices' screens, two conflicts listed on each, the
  same card states on both after four reviews, one commit per sync named by device; and step 7.
  The live test on the owner's devices against the real GitHub is still to do.

**Acceptance test (live, desktop + Android phone).**
1. Both devices synced, with the same repertoire study open: an imported copy of one of the
   owner's Qchess studies.
2. Both offline: airplane mode on the phone, offline in DevTools on the desktop.
3. Desktop: add a variation in chapter A; rewrite the comment on node N; delete the subtree S;
   draw an arrow on node P; record two test reviews in the debug panel.
4. Phone: write a different comment on N; add a move inside S; change the glyph on node Q;
   add a new chapter; record two test reviews; kill the PWA and reopen it offline (the edits
   are still there).
5. Desktop online, sync. Then the phone online, sync. Then the desktop pulls.
6. Expected, identical on both devices:
   - N carries both comments inside markers;
   - S is kept as far as the phone's move, with a "kept after delete" marker;
   - the variation, the arrow, the glyph and the new chapter are all present;
   - the conflicts view lists two items;
   - all four reviews are in the log, and replay gives the same card states on both (due
     dates, and stability and difficulty rounded: §4.8);
   - the data repo shows one commit per sync, named by device.
7. Resolve both conflicts on the phone. After a sync the desktop shows none.

**Phase 0 exit**: unit, simulation and e2e tests green; the round-trip suite green on the
owner's real exports; the acceptance test passed live.

Phase 1 starts before this exit (the owner's decision, 2026-10-06): Phase 0's code is on `main`,
and its live checks (the spike's re-run, the real imports, the acceptance test) run alongside
Phase 1. Whatever they find is fixed in Phase 0's code as it comes. Phase 1 isn't put into
daily use, and editing in Qchess doesn't stop (D18), until the acceptance test has passed.

---

## 5. Phase 1 in depth, and later phases (outline)

Phase 1 is planned in depth below, the way §4 plans Phase 0, then Phase 2 (§5.20–§5.28) and Phase 3
(§5.29–§5.37).
The later phases stay in outline: each lists its scope, what it reuses, its main risks and the
checks that would prove it.

### Phase 1: Train and review (SRS)

Planned on 2026-10-06, while Phase 0's live checks are still to run (§4.11). The parts below are
in build order. Each lists its tasks, the tests that prove it, and what only a live check can
show, on which device. The owner's answers to its questions are in §5.13.

**Scope**, from the outline the owner approved:
- **Cards.** One card per repertoire move of the chapter's side: `r|positionKey|uci` (§4.4).
  Two chapters reaching one position share its card.
- **The daily queue**: due cards, plus new cards up to a daily limit of new moves. Every card
  starts new (D19); new cards come in line by line, in chapter order, so a day's new material
  is whole lines rather than scattered moves.
- **The line trainer.** It walks a line, quizzes the due moves and plays the rest itself at a
  readable pace: lichessable's auto-play, recast (D16). Grades follow mistake-lab's repertoire
  rule, adjustable.
- **Suspend** a card = "always played for me" (Chessable's key moves). FSRS difficulty and lapses
  replace "difficult moves".
- **Conflicting moves** (D3): both repertoire moves are accepted, and training follows the line
  played. Positions with such conflicts are listed.
- **Read and Interactive views** of a line (Qchess's training); **clickable lines** in comments
  (q_extension's `clParse`/`clStartFen`) and **line jumping**.
- **Transposition badges** and **copy continuation** in the study view.
- **Mistakes**: the day's mistake log, retry and drill (lichessable §16–20 without Chessable), and
  pinned mistakes as progress events.
- **Show and grade**: two keys, media keys from a ring, optional speech.
- **Studies as Qchess's** (§5.15, the owner's request after testing Phase 0): the study list as
  cards, studies made and managed here without an import, and Qchess's switch between training a
  line and editing it.
- **The owner's first testing round** (§5.16): the training screen's line list (any line
  trained, due or not, as in Qchess's Move Trainer), the daily limit changed from the site, show
  and grade switched mid-session, and fixes to the notation.

What it builds on: `src/core/progress` (events, replay, FSRS with retention as a parameter),
`src/core/progress/cards.ts`, `src/core/chess` (`positionKeyOf`, `standardUci`), the study tree
(`src/core/study`), the modes (`src/core/app/fsm.ts`), the board (`src/ui/Board.tsx`), the app
state and sync (`src/app`), and the card states of the debug panel (`src/app/overview.ts`).

Where the new code goes:

```
src/core/repertoire/   index.ts (positions, cards, lines), lines.ts (clickable lines in comments)
src/core/train/        settings.ts, grade.ts, queue.ts, plan.ts, trainer.ts, showGrade.ts, pins.ts
src/core/progress/     events.ts and replay.ts gain the new fields and kinds (§5.2, §5.8)
src/app/               train.ts (the session: index, replay, queue, trainer, timers, wake lock)
src/ui/                Train.tsx, ShowGrade.tsx, Mistakes.tsx, CommentText.tsx, badges in Notation.tsx
scripts/               queue-sim.ts (§5.5)
```

#### 5.1 The repertoire index

`buildIndex(studies)` in `core/repertoire/index.ts`, from every readable chapter of every
repertoire study (D3: reference studies make no cards):
- Walk each chapter's tree with chessops, keying each position with `positionKeyOf`. A move made
  by the chapter's side (`Orientation`) is an **own move**, with the card
  `r|<key before>|<standardUci>`; any other move is an **opponent move**.
- `positions: Map<PositionKey, { own: Map<uci, Occurrence[]>, opponent: Map<uci, Occurrence[]> }>`,
  where an occurrence is `{ sid, cid, path, san }`. A position can hold several own moves: those
  are the repertoire conflicts (D3), listed by `conflicts(index)`.
- `lines`: every path from a chapter's start to a leaf, in tree order (the main line first, then
  each variation where it branches, depth first), with its own moves' cards in order, and
  whether its chapter is marked known (§5.3). Studies go in the order of the study list,
  chapters in their study's order.
- A chapter with illegal moves contributes the part that parses (§4.5); an unreadable chapter
  contributes nothing and is listed. A card with events but no move in the index any more (the
  move was deleted) stays in the log, is left out of the queue, and is counted in the debug
  panel. If the move comes back, so does its history, since the card is keyed by position and
  move, not by node.
- Built per chapter and cached by the chapter file's blob SHA (the `parsed` cache §4.11 left
  for later), so an edit or a sync rebuilds only the chapters that changed.

Tests (`test/unit/core/repertoire`):
- hand-built chapters: a transposition in two chapters gives one card with two occurrences; a
  Black chapter's cards are Black's moves; a start FEN with Black to move; castling cards use
  `e1g1`; two own moves in one position are listed as a conflict; a move that is White's own in
  a White chapter and the opponent's move in a Black chapter is still one card;
- lines come in tree order, and every own node lies on at least one line;
- the public fixtures (`test/fixtures/data-repo`, `test/fixtures/pgn`) index without problems;
- a generated repertoire of 800 lines indexes in under 100 ms in Node (measured in CI, like the
  replay benchmark of §4.8).

Live: the index build time on the phone with the owner's real repertoire, read from the debug
panel (target under 300 ms).

**As built** (2026-10-06):
- `src/core/repertoire/index.ts`: `indexChapter(sid, chapter)` gives one chapter's moves (each with
  its position key, standard UCI, SAN, the card for an own move, and its node) and lines;
  `combineIndex(parts)` joins the parts in the order given; `indexStudies(studies)` does both for
  the repertoire studies, leaving reference studies out; `conflicts(index)` lists positions with
  more than one own move. A chapter's side is its `Orientation` header (`white` or `black`); a
  chapter without one makes nothing and is listed in `skipped`, as is one whose start isn't legal.
- The known mark is read from `[RepworksKnown "true"]` and carried on each line.
- A chapter without `Orientation` makes no cards: its side would be a guess, and the import
  always writes one (§4.10). The editor shows such a chapter from White's side.
- A line ends where the walk stops: at a leaf, or before a move that isn't legal there, so every
  indexed move lies on a line.
- Known limit: in a Chess960 start (which the parser accepts), castling and a king move to the
  same square would share a card. Repertoire chapters are standard chess, so this is left as is.
- Reviewed after the push (an adversarial review, 2026-10-06): the leaf rule above was a bug, the
  occurrence lacked its SAN, and the tests gained the PGN fixtures, the order of studies and
  chapters, an illegal start, conflicts counted by move, a check by node rather than by card, and
  a timing repertoire whose promotions are legal.
- Not built yet: the cache by blob SHA, which belongs to the app (§5.7). The per-chapter parts are
  what it will keep.
- Tests: `test/unit/core/repertoire/index.test.ts` (the cases above, the fixtures, an empty chapter,
  and 200 random chapters: every move on a line, one line per leaf, the index is deterministic)
  and `test/perf/repertoireIndex.test.ts`: about 836 lines in 52–66 ms in this container (best of
  three runs), under the 100 ms target.

#### 5.2 Grades, training settings, and the review event

**Grades** (`core/train/grade.ts`): right or wrong, as Chessable grades (the owner's choice,
§5.13), and FSRS spaces each move by its own record:

| Answer | Grade |
| --- | --- |
| right first time | Good (3) |
| a wrong move first, or a hint | Again (1) |

- Time doesn't grade. It is still recorded (`ms`), for the debug panel's averages and §5.5.
- A move played into another repertoire move of the same position is right (§5.6).
- **Learning step.** A taught move isn't asked again at once: it comes due 4 hours after it was
  taught (`learnStepHours`, a synced setting), for its first review, as Chessable brings a new
  line back the same day. Right then gives Good (3 days at retention 0.9, FSRS-5's first Good
  stability), wrong gives Again (1 day). A move taught late in the evening is simply due the next
  day.
- Show and grade (§5.9): a card the owner knew is Good, a failed one Again.

**Training settings** (`core/train/settings.ts`). Some must be the same on every device, or two
devices would replay the same events into different card states, which the acceptance test
forbids (§4.11 step 6). Those are synced, in a new data-repo file:

```
settings.json   { "format": 1, "train": { "newPerDay": 20, "retention": 0.9, "learnStepHours": 4 } }
```

- Merged three-way per field, like `study.json`'s name and kind (§4.7); a field changed on both
  sides takes ours. A missing file or field means the default. `validate-data` checks it.
- Changing the retention re-replays every card (as §4.8 planned), so due dates move at once,
  the same way on every device.
- The rest is per device, in localStorage: the auto-play pace (fastest 250 ms, fast 450 ms,
  normal 600 ms, relaxed 900 ms per move, or a custom number of milliseconds; the floor is
  100 ms), the pauses (at a line's end, default two paces, four going on to a picked line's
  next; and a look at a position, default two paces), speech on or off, and the show-and-grade
  keys. The pace is in the training settings and, as the presets, in the session's ⋯ menu.

**A new event kind, `taught`** (`{"k":"taught","card":…}`), is recorded when a new move has been
shown and played. It starts the learning step, and it is what the daily limit counts, from every
device's log. A card taught and never reviewed is in learning: replay gives it no FSRS state yet.

**The review event** gains two optional fields, so that the day's mistakes can be read back from
the log on any device and after a reload, with nothing else stored:

```json
{"v":1,"n":4212,"t":"…","k":"review","card":"r|<key>|g1f3","g":1,"ms":5210,"w":["b1c3"],"h":1}
```

`w` is the wrong moves tried, in standard UCI; `h` is 1 when a hint was shown. Phase 0's reader
drops unknown fields from the parsed event and keeps the line as written, so builds from before
this change replay these events unchanged.

Tests: the grade table (right, wrong then right, a hint, a conflict move); time never changes a
grade; `settings.json` parses, rejects bad values
(a retention outside 0.7–0.99, a negative limit) and merges per field; the new fields round-trip
through `formatEvent`/`parseLog`, and a Phase 0 parse of the new line gives the same replay.

**As built** (2026-10-06):
- `src/core/train/grade.ts`: `grade({ wrong, hint })` and `selfGrade(knew)`.
- `src/core/train/settings.ts`: `settings.json` read strictly (out-of-range values are refused, and
  a bad or missing file gives the defaults), written in one stable form, fields this code doesn't
  know kept in place, and merged per field both in the file merge (§4.7) and in the sync's tree
  merge, which reads all three versions when both sides changed it. `validate-data` checks it.
- Events: the review's `w` (UCI moves) and `h` (1) are checked on reading; `taught` folds into the
  card's `taught` time (the first one; `forget` clears it).
- Tests: `test/unit/core/train/settings.test.ts`.

#### 5.3 The daily queue

`todaysQueue(index, states, settings, day)` in `core/train/queue.ts`. Core has no clock, so the
app passes in `day = { start, end, now }`: the device's local midnight and the next one, in ms (as
§4.8 has it, "due today" is asked with the device's own calendar), and the time now, which the
learning step is measured against.
- **Due**: cards in the index, not suspended, reviewed at least once, with `due < day.end`; and
  cards taught but not yet reviewed whose learning step has passed (§5.2). The earliest first.
- **New today**: cards taught in the day, from every device's log, so the phone and the desktop
  share one limit. Room for new moves = `newPerDay` minus that.
- **New lines**: lines of chapters not marked known, in the index's order, that still hold a card
  never taught or reviewed and not suspended. A line is taken while there is room, and a line
  once taken is taken whole, even past the limit, so the day's new material is whole lines. A new
  card already taken by an earlier line today (a shared prefix) isn't counted twice.
- **Known lines** (the owner's answer, §5.13): a chapter marked known (a `[RepworksKnown "true"]`
  header, set in the import review or the chapter drawer, with a button for the whole study) holds
  lines learned before, in Chessable or Qchess. Their cards never reviewed skip teaching and the
  limit. They form a pool of their own, in the index's order, offered after the day's due moves
  and new lines, for as long as the owner trains ("Known lines: 1,240 moves not yet reviewed").
  The first answer is an ordinary review: right is Good, wrong teaches the move and is Again. No
  state is imported (D19): each card earns its schedule here.
- **Scope**: the whole repertoire, or one study (the study list gets a Train button per
  repertoire study).
- The home screen shows "Train: 23 due · 18 new".

Tests: with a fake clock and a time zone given as day bounds, a card due at 23:59 local counts
today and one due at 00:01 doesn't; a card taught yesterday doesn't use today's room; a taught
card comes due after its step; the whole-line rule; known chapters' lines go to the pool, never
use the limit, and are never taught first; suspended and orphaned cards are left out; reviews from two devices share the
limit; the result doesn't depend on the order of the events.

**As built** (2026-10-06):
- `src/core/train/queue.ts`: `todaysQueue(index, states, settings, day, { scope })` gives `due`
  (reviewed cards due before the day's end, and taught cards whose step has passed by `now`, the
  earliest first), `later` (taught cards whose step ends later today, for "3 more at 14:20"),
  `taughtToday` and `room`, `newLines` and `newCards`, `knownLines` and `knownCards`, and
  `orphaned` (cards with events whose move is gone). The home screen's "23 due · 18 new" is
  `due.length` and `newCards.length`.
- A card's status comes from its replayed state (`statusOf`): reviewed if it has a due time,
  learning if taught and not reviewed since, else never answered. A `forget` makes a card new
  again, as before.
- **A card met on a known chapter's line is known wherever else it is met** (`knownCardsOf`):
  the owner learned the move in that position, and cards are per position (D3). So a new line
  that shares a known chapter's prefix teaches only the moves after it, and a line whose only
  unanswered moves are known isn't a new line.
- A known move's wrong first answer is a review graded Again; the move is shown, as any wrong
  answer shows it, but no `taught` event is recorded, so the daily limit, which counts `taught`
  events, never counts a known move. §5.6 keeps to this.
- The limit and `taughtToday` count every device and every study; a study scope narrows the
  due cards (those played in that study) and the lines only.
- `Line` gained `plies` (each card's index in the line's path) in the index (§5.1), for the
  planner.
- `src/core/repertoire/files.ts`: `studiesFromFiles(files)` gives the studies of a data repo's
  files in the study list's order (by name, as the app lists them), chapters in their study's
  order, and the files it couldn't read; the simulation uses it, and the app can (§5.7).
- Tests: `test/unit/core/train/queue.test.ts` (each case above, with the day in a time zone two
  hours ahead of UTC, two devices' events shuffled and added in batches, a forgotten card, and a
  study scope) and `test/unit/core/repertoire/files.test.ts`.

#### 5.4 The line planner

`planSession(index, queue, states)` in `core/train/plan.ts` chooses the lines to walk:
- **Review lines**: every due card lies on at least one line (a transposition on several). Going
  through the lines in the index's order, take each line that holds a due card not yet covered,
  so consecutive lines share prefixes and the board's positions follow on from each other. A
  review line ends at its last due card: nothing after it would be asked.
- **New lines**: today's new lines (§5.3), after the review lines; then the known pool, line by
  line, until the owner stops.
- A plan is data: the lines, each with the cards it asks. The trainer (§5.6) may still change
  course when a conflict move is played.

Tests: every due card is covered exactly once by the plan's asks; the plan is deterministic; on
hand-built trees it takes the expected lines; a property test over random repertoires (built
with `test/support/randomTree.ts`) checks coverage and that no line is taken that asks nothing.

**As built** (2026-10-06):
- `src/core/train/plan.ts`: a plan is a list of `{ kind, line, end, ask, teach }`: `kind` is
  `review`, `new` or `known`; the walk is `line.path.slice(0, end)`; `ask` holds the cards graded
  there, `teach` the cards shown first. It takes the states too, to tell a move never answered
  from one played for the user.
- On any line, a card never answered is taught where it is first met, or asked if it is known
  (§5.3); each card is asked or taught once in a plan. So a move added in the middle of a
  reviewed line is taught on the review line that passes it (§5.6), and a new line whose moves
  were all met earlier is dropped.
- Review lines and known lines end at their last ask; new lines are walked to their leaf.
- Review lines come chapter by chapter, the chapter with the weakest due card (lowest recall)
  first, its lines in the index's order (§5.115, 2026-10-16).
- Suspended cards and cards still in their learning step are played for the user: never asked
  or taught.
- Tests: `test/unit/core/train/plan.test.ts`: hand-built cases (lines in order, each ending at
  its last due card; a transposition asked once; a move never answered taught on a review line
  and not again; reviews, then new lines, then the known pool; an empty plan) and 150 random
  repertoires with random states (every due card asked once on a review line, every new card
  taught, nothing asked or taught twice, every ask on the walked part, no line asking nothing,
  review and known lines ending at an ask, the same plan twice).

#### 5.5 The queue simulation, and the default limit

`scripts/queue-sim.ts` answers the outline's first risk: how many weeks the repertoire takes to
come in, and what that costs per day.
- It reads a data-repo checkout (`REPWORKS_FIXTURES=<path>`), builds the index, and simulates 90
  days from all-new cards for several daily limits and both retentions, through the real queue,
  planner and FSRS.
- A review succeeds with FSRS's own retrievability at that moment, and is Good; a miss is Again.
  The first answer after the learning step succeeds 90% of the time; a known line's first answer
  succeeds at an assumed rate (varied), and the known pool is taken at a few assumed paces (100,
  300 moves a day, or all in a week), to show the wave of reviews it brings days later.
- It prints, per setting: cards and lines in the repertoire, the day the last new line comes in,
  reviews a day at days 30, 60 and 90 and the peak, and an estimate of minutes a day (asked moves
  at 8 s, auto-played moves at the pace, new moves at 20 s). These are assumptions until a week
  of real use gives measured averages, which the debug panel will show from the log's `ms`.
- Only aggregate numbers from it enter this repo (PLAN.md); nothing of the repertoire itself.

A first run on synthetic cards (this session, with the repo's FSRS: a fixed number of cards, new
ones each day up to the limit, recall drawn from retrievability) gives the shape before the real
run:

| Cards | Retention | New a day | All in by day | Reviews a day, day 30 / 60 / 90 |
| --- | --- | --- | --- | --- |
| 2,000 | 0.9 | 20 | 100 | 45 / 67 / 75 |
| 2,000 | 0.93 | 20 | 100 | 58 / 76 / 87 |
| 4,000 | 0.9 | 20 | 200 | 45 / 67 / 75 |
| 4,000 | 0.9 | 30 | 134 | 68 / 101 / 106 |
| 4,000 | 0.93 | 30 | 134 | 88 / 118 / 135 |

While new cards still come in, reviews a day settle at three to four times the daily limit; at 0.93 they run
15–20% above 0.9. The real repertoire's card count, which only the real run gives, decides how
long the intake lasts.

Tests: the script runs on the public fixture data repo in a unit test (small numbers, checked for
consistency: every card introduced once, reviews never before their due day).

Live: run on the owner's repertoire (desktop, by a Claude session with `REPWORKS_FIXTURES`, or by
the owner), and its numbers recorded here; then the owner picks the default (§5.13 question 1).

**As built** (2026-10-06):
- `scripts/simulate-queue.ts` (the simulation, a library) and `scripts/queue-sim.ts` (its command
  line: `node scripts/queue-sim.ts [<checkout>] [--days 90] [--known asis|all|none]`, the checkout
  defaulting to `$REPWORKS_FIXTURES`). `--known all` simulates every chapter as marked known, for
  the case where most of the repertoire was learned in Chessable or Qchess; `asis` reads the
  chapters' own marks.
- Each simulated day has a morning session (the due cards, the day's new lines, the known pool up
  to its pace) and an evening one (the moves taught that morning, once their step has passed).
  Recall is drawn from FSRS's retrievability at the moment of the review, with the retention's
  own replay; a first answer after the step is right 90% of the time, a known move's at the rate
  in the row. Times: 8 s an asked move, 20 s a new move, 600 ms a move played at the pace.
- It prints the repertoire's size and one row per setting: daily limits 10, 20, 30, 40 at
  retentions 0.9 and 0.93, and, when chapters are marked known, the known pool at 100 and 300
  moves a day and all in a week, with first answers right 70% and 90% of the time. Each row: the
  day the last new move and the last known move came in, moves asked (and minutes) at days 30,
  60 and 90, and the peak.
- A run on a generated repertoire (the index benchmark's: 836 lines, 2,535 cards; this session,
  through the real queue and planner), as the shape to expect before the real run:

  | New a day | Retention | Known chapters | All in by day | Asked a day (minutes), day 30 / 60 / 90 | Peak asked (day) |
  | --- | --- | --- | --- | --- | --- |
  | 20 | 0.9 | none | not by 90 (545 left) | 82 (27) / 103 (29) / 126 (35) | 132 (89) |
  | 30 | 0.9 | none | 80 | 129 (40) / 157 (43) / 81 (17) | 182 (74) |
  | 20 | 0.93 | none | not by 90 (545 left) | 107 (31) / 138 (35) / 151 (38) | 154 (63) |
  | 20 | 0.9 | 3 in 4 (1,942 cards), 300 a day | new 26, known 7 | 83 (20) / 85 (20) / 16 (4) | 743 (6) |

  Asked moves include each day's first reviews after the learning step. A known pool taken at
  300 a day brings a wave about three days later, when its first Good answers come due together:
  743 moves on day 6 here. A slower pace flattens it.
- Tests: `test/unit/scripts/queueSim.test.ts`: the command line on the public fixture (with and
  without `--known all`), and the library on 12 random repertoires with known chapters: every
  card taught or first answered exactly once, no review before the queue offers it, everything in
  by day 60, and the same result twice.

#### 5.6 The trainer

A pure state machine in `core/train/trainer.ts`, driven by the app with the time passed in, so it
is tested in Node like the modes (§4.11).

States:
- `opponent`: the line's opponent move is played after the pace delay.
- `auto`: an own move the session doesn't ask is played after the pace delay.
- `ask`: the user's move is asked (a due card); the clock for the grade starts.
- `teach`: a new card is shown (arrow and SAN, "New move"); the user plays it; its comments show
  after it. A `taught` event is recorded; the first review comes after the learning step (§5.2).
- `wrong`: the move played isn't in the repertoire here; the board takes it back and asks again.
  A second wrong move, or Hint, shows the move with an arrow and the user plays it.
- `lineDone`, then the next line; `sessionDone` with the day's numbers.

Which own moves are asked:
- a due card not answered yet today is asked;
- a card reviewed at least once and not due, or suspended, is played for the user (D16);
- a card never taught or reviewed is never auto-played (lichessable's rule). On a new line it is
  taught. Met on a review line (a move added in the middle of a known line), it is taught there
  and counts towards today's new moves; in a chapter marked known, it is asked instead;
- a card taught and still in its learning step is played for the user, so a line can pass
  through it before its first review; with no arrow before it (§5.110: it was, at first).

Conflicting moves (D3), at a position with more than one own move:
- the line's own move is the expected one, and every other own move there is accepted too;
- the move played is graded on its own card. If the line's card is due as well, the trainer then
  says "Your repertoire also plays Nc6 here" and asks that move in the same position, graded on
  its own. So the move not played can't stay due for ever (the outline's second risk) without
  breaking "both are accepted";
- the session then follows the line played when it still has asks ahead, else returns to the
  planned line.

Opponent moves always come from the line being walked: the repertoire decides which reply to
meet, never a guess.

Effects returned to the app: play a move on the board, record a review (§5.2's event), show a
note or an arrow, wait a given time. The app turns them into board calls, `store.record` and
timers.

Tests (`test/unit/core/train/trainer.test.ts`): a line with nothing due auto-plays to its end and
asks nothing; a due card is asked and graded by time; a wrong move then the right one records
Again with `w`; Hint records Again with `h`; a never-reviewed card on a review line is taught; a
suspended card is played; the conflict rule (the other move accepted, the due one asked after);
a promotion asks for the piece; teaching records one `taught` event per new card and no review;
pace delays never under the floor (MIN_PACE_MS, 100 ms); every effect sequence is deterministic for a given input.

**As built** (2026-10-06):
- `src/core/train/trainer.ts`: `new Trainer({ index, plan, states, startOf, paceMs, record?,
  askAll? })` and `send(command) → effects`. Commands: `start`, `tick` (a timer's id), `move`
  (UCI, either castling spelling), `hint`, `suspend`, `skipLine`, `stop`, each with the time.
  Effects: `line` (a line starts, at the position after `path`), `play` (by the opponent, for
  the user, or the user's move confirmed), `takeback`, `arrow`, `note` (the feedback line's
  meaning, worded by the UI), `record` (`review`, `taught` or `suspend`), `wait` (with an id; a
  tick with an older id is ignored, so a skipped line's timer can't play into the next),
  `lineDone`, `done` (the session's numbers). `view` gives the phase, the line, the board's path
  and position, and the move shown.
- Which own moves are asked is decided where the move is met, from the plan's asks and teaches
  and the states: a move answered (asked, taught or suspended) earlier in the session is played
  for the user; a move never answered is still taught or asked if a skipped line left it, so
  auto-play never plays it. A planned line whose asks and teaches were all answered on earlier
  lines (a conflict move answered out of turn) is passed over.
- A line that shares its first moves with the board starts there, up to its first ask or teach,
  rather than replaying them: the planner orders lines so that this is most of each line.
- The pace is clamped to the floor (450 ms at first, 100 ms since 2026-10-22); the pause at a line's end is two paces unless set.
- Conflicting moves: the other own move is accepted and graded on its own card when that card
  is asked today (due, or known and never answered), else accepted with no record. The note then
  says the repertoire has another move here, without naming it (naming it would be a hint), and
  the line's move is asked on its own card; the other move played again then counts as wrong.
  "The session then follows the line played" never arises: the user moves only where the line's
  own move is asked, and the other move's later asks come on their own planned lines.
- A promotion without its piece is not an answer (the board asks for the piece); a wrong piece
  is a wrong move.
- A suspend is recorded even with recording off (it is the owner's choice about the card, not a
  grade), and the move is played for the user.
- `record: false` and `askAll` are there for the Interactive view, retry and drill (§5.8, §5.10).
- Tests: `test/unit/core/train/trainer.test.ts`: each case of the list above, castling as king
  takes rook, a stale tick, skip and stop, recording off with every move asked, and 120 random
  repertoires answered at random (right, hint, any legal move): every planned ask graded once,
  every teach taught once, nothing reviewed or taught twice, no wait under 450 ms, and the same
  effects twice.

#### 5.7 The training screen

- Routes `#/train` and `#/train/<sid>`, as modes in `fsm.ts`.
- The board first; under it one feedback line ("Your move", "Correct", "Not in your repertoire:
  try again", "New move: play Nf3"), the line's name (chapter name and the moves so far), and
  the comments of the node reached, with clickable lines (§5.12).
- Buttons, one primary action per state (lichessable's UI inventory): Hint; Skip line; Stop;
  "Always play this for me" (suspend, with undo); Pin (§5.9). Counters: due left, new left.
  Since 2026-10-11 (the owner's request): the buttons under the board stay the same through a line
  (Hint greyed out while nothing is asked, "Next line" in its place at a line's end; a moment's
  extras, such as an undo or Pin, in a row after them), the comments come after them, "Always
  play this for me", Skip line and the pace are in a small ⋯ menu by the counters, and a phone
  shows the line's name without its moves. Since 2026-10-17 a phone also keeps two lines' room for
  the feedback line and the counters, and the line's name on one line: a longer note ("Your
  mistake again: each right 2 times in a row") or "mistakes left 1" wrapped and moved the buttons
  by up to 37 px (measured on an emulated Pixel 7; `train.spec.ts` checks Hint's place).
- The device's screen stays on during a session (Screen Wake Lock, D7's spec), and is released
  when the session stops or the app is hidden.
- Keys: Space for Hint, Escape to stop.
- The chapter view gains each own move's card state in the move panel (due date, reviews,
  suspended) and the suspend toggle; the list of positions with conflicting moves sits in the
  debug panel.
- Reviews are recorded at once (`store.record`) and pushed by the sync as before, so a session
  can be stopped, reloaded or continued on the other device: nothing about a session needs saving
  beyond the log.

Tests: modes and routes in Node. Playwright, desktop and emulated phone, with the fake GitHub
seeded with a repertoire and progress files dated in the past (Playwright's clock set to a fixed
day): the home screen's counts; a session that auto-plays, asks a due move, takes a wrong move
back, accepts the right one; a new line taught and recalled; a move suspended; the review events
reaching the fake repo with the expected grades and fields; a reload in the middle of a session
continuing where it was. Repeated under load (`--repeat-each=8 --workers=4`) before pushing.

Live (phone, then desktop): a real day's session with the owner's repertoire. Moving by tap and
by drag at the pace, reading the feedback, the wake lock, the time a session takes.

**As built** (2026-10-06):
- `src/app/train.ts`: `loadTraining(store)` reads the working view (studies, progress, and
  `settings.json`), builds the index from per-chapter parts kept while a chapter file's text is
  unchanged (the cache §5.1 left to the app: keyed by the text rather than the blob SHA, which
  the working view doesn't carry for edited files), and replays every device's log plus this
  device's unsent events at the synced retention. `trainData` holds the result, read again on
  every data change, for the home card, the chapter view and the debug panel. The session runs
  the trainer with `setTimeout` for its waits and records each `record` effect at once through
  `store.record`, so nothing about a session is saved beyond the log: a reload rebuilds the
  queue and the plan, and carries on.
- `src/core/app/fsm.ts`: modes `train` (`#/train`) and `train` with a study (`#/train/<sid>`).
- `src/ui/Train.tsx`: the board, the feedback line, the counters (due and new left, line n of
  m), the chapter's name and the moves so far, the comments of the move reached (hidden while a
  move is asked, as they could give it away; shown while a move is taught), and the buttons:
  Hint, "Always play this for me" (with "Undo: ask Nc6 again" until the next line), Skip line,
  Stop; the pace (fastest, fast, normal, relaxed, custom; per device, changeable mid-session). Space is Hint,
  Escape stops. The screen's wake lock is held while a session runs and taken again when the
  page comes back into view. The end shows the session's numbers, "Train again" and "Home".
- `src/ui/TrainCard.tsx`: the home screen's "Train: 1 due · 3 new", the moves whose learning
  step ends later today ("2 more today from 14:00"), the known pool, and orphaned cards. The
  study list has a Train link per repertoire study.
- `src/ui/CardPanel.tsx` (since §5.90 `MoveCard.tsx`, in the move's menu): in the chapter view, for an own move of a repertoire chapter: new,
  learning (with its first review's time), or its due date and reviews; whether it is played
  for the user; how many other places reach the same card; and the suspend toggle.
- The debug panel gains the repertoire's size, the index build time (§5.1's live check), the
  chapters left out, and the positions with more than one repertoire move, each a link to it.
- Pin (§5.8) and show and grade (§5.9) are not on the screen yet.
- Tests: `test/unit/core/app/fsm.test.ts` (the routes) and `test/e2e/train.spec.ts` on desktop and
  the emulated phone, with Playwright's clock at 2026-12-01: the home counts; a session that
  auto-plays 1. e4, takes 1... e5 back, accepts 1... c5 (Again, with `w`), plays the suspended
  2... d6 for the user, teaches 3... cxd4; a reload that carries on with 2... Nc6, suspended from
  the screen; 2... Nf6 taught on the Alapin; the four events reaching the fake repo in order;
  the taught moves due again 4 hours later and asked. A study's session from the study list,
  Hint by Space and Stop by Escape (desktop) or the buttons (phone). The card panel and its
  toggle, and the debug panel's conflict list. 48 runs under `--repeat-each=8 --workers=4`
  passed before pushing.

#### 5.8 Mistakes: the log, retry, drill and pins

- **The day's mistakes** are the day's reviews graded Again, read from the log (§5.2), so they
  are the same on both devices and survive a reload. Each shows its position, the move asked, the
  moves tried and the line it was met on. Route `#/mistakes`.
- **Retry**: walk each mistake's line from the start, auto-playing up to the failed move whatever
  is due, and ask it.
- **Drill**: one card at a time: the position before the opponent's last move, that move played
  (lichessable's lead-in), then the move asked.
- Neither touches FSRS: the card was already graded Again today, and a second review the same day
  would count the retry as recall (mistake-lab guards the same way with `srsRecorded`).
- **Pins** (lichessable's pinned mistakes, as progress events): `pin` and `unpin` events, and a
  `drill` event (`{"k":"drill","card":…,"ok":true}`) for each drill answer on a pinned card.
  Replay derives each pin's streak with lichessable's steps: due 30 minutes after pinning, then 4
  hours, then 24 hours after each clean answer; a miss sends it back to the first step; three
  clean answers in a row retire it. "Drill pinned (N)" appears when a pin is due; a pin not due
  can still be drilled on request, with no credit. Phase 0's builds skip the new kinds, and
  compaction keeps them (§4.4).

Tests: mistakes read from the log (the right card, moves and line); retry and drill effects
through the trainer with grading off; pin replay: on time, early (no credit), a miss, three clean
answers, two devices' drill events interleaved; `drill` events never change a card's FSRS state.
Playwright: fail a move in a session, see it in the mistakes, drill it, pin it, see the pin come
due after 30 minutes on Playwright's clock.

Live (phone): a session's mistakes retried and drilled; a pin made on the phone appears on the
desktop after a sync.

**As built** (2026-10-06):
- Events: `pin`, `unpin` and `drill` (`ok` true or false) in `src/core/progress/events.ts`; replay
  folds them into nothing, so a card's FSRS state never sees them.
- `src/core/train/pins.ts`: `pinOf(events)` and `pinsOf(cards, eventsOf)`, with the steps above. A
  pin made while the card is already pinned changes nothing; a pin after a retire or an unpin
  starts again. A miss resets the streak whenever it comes, early or not.
- `src/core/train/mistakes.ts`: `todaysMistakes(index, eventsOf, day)`: the day's Again reviews
  from every device, one per card (its latest), each with the moves tried, the hint, and a line
  through the card's first occurrence in the index (cards are per position, so the log doesn't
  name the line it was met on); `retryLines` and `drillLines` make the plans. A planned line may
  now start further on (`from`), for drill's lead-in.
- The trainer gained `askOnly` (ask the plan's asks and play everything else, new moves included,
  for retry and drill) and an `answer` effect (a move asked, right first time or not), given with
  recording on or off.
- The app (`src/app/train.ts`): a session is today's queue, the day's mistakes retried or
  drilled, or the pins (due, or all). Retry and drill record no reviews; a drill answer on a
  pinned card records a `drill` event, so a pin drilled early from "Drill all" gets no credit,
  by replay. Routes `#/mistakes`, `#/mistakes/retry`, `#/mistakes/drill`, `#/pinned`,
  `#/pinned/all`.
- `src/ui/Mistakes.tsx`: today's mistakes (chapter, the moves up to the move, the moves tried in
  SAN, the hint), with Retry, Drill, Pin or Unpin, and a link to the move in its study; the pins
  with their next drill and clean answers so far, "Drill pinned (N)" when some are due, and "Drill
  all". The training screen offers "Pin this mistake" after a move answered wrong, until the next
  line or a right answer; the session's end links to the mistakes; the home card shows the day's
  mistakes, the pins, and "Drill pinned (N)".
- A screen with nothing to train starts again when new data arrives, so a session opened while
  the first sync is still landing doesn't stay empty.
- Tests: `test/unit/core/train/mistakes.test.ts` (the events' round trip and refusal; pins and
  drills leave FSRS states as they were; the pin steps on time, early, after a miss, retired and
  pinned again, unpinned; two devices' drills in any order; the day's mistakes; retry and drill
  through the trainer with nothing recorded, the drill starting at its lead-in) and
  `test/e2e/train.spec.ts` (fail 1... c5, pin it, see it in the mistakes with "tried e5", retry it,
  the pin due 30 minutes later on Playwright's clock, drilled, and the events `review`, `pin`,
  `drill` in the fake repo, then "1 of 3 clean").

#### 5.9 Show and grade

A mode of the trainer (`core/train/showGrade.ts`) after lichessable's design
(`DESIGN-show-and-grade.md` §2, §6, §10): the user never moves a piece.
- Two keys, and every press shows a move. `next` (2): first press plays the user's move on the
  board with its arrow; second press plays the opponent's reply and grades the card known.
  `wrong` (4): plays the user's move and marks the card failed; the next press grades it Again.
- Presses that come while the board is busy are queued (`next` only, three seconds at most, one
  at a time); `wrong` clears the queue. Key repeats are never presses.
- Keys: `2`, `4`, and the media keys (previous track, next track) for a Bluetooth ring; `1`
  repeats the spoken move. Swallowed only while the mode runs, never in a text field.
- Speech, optional and off by default: the move spoken through the Web Speech API.
- Not auto-playing is the same as in the trainer; auto-played moves play at the pace.

A web page receives media keys only through the Media Session API, which Chrome on Android routes
to the page playing media. So the mode listens for the keys as key events and also registers
Media Session handlers, kept alive by silent audio while the mode runs. Which of the two the
owner's ring reaches is a live question.

Tests: the two-key table of lichessable's §2 in Node; the queue's rules; key mapping. Playwright:
a session run with `2` and `4` only, its review events checked.

Live (phone, with the owner's ring): the ring's buttons reach the page (key events or Media
Session), with the screen on and off; speech on Android.

**As built** (2026-10-06):
- The trainer gained `selfGrade`, with two commands: `show` (the move asked is played, with its
  arrow, and its grade waits) and `tell(knew)` (the card is graded `selfGrade(knew)`, or a new
  move is recorded taught, and the opponent's reply is played with the press; what follows comes
  at the pace). Everything else — which moves are asked, auto-play, the plan — is the trainer's.
- `src/core/train/showGrade.ts`: `ShowGrade` turns presses into those commands. `next` shows the
  move, then grades it known; `wrong` shows it and marks it failed, and marks a move already
  shown failed there and then; the next press grades Again. A new move takes two presses and is
  never graded. A press while the board is playing waits for it: `next` only, one at a time, and
  dropped after three seconds; `wrong` clears what was waiting. `pressOf(key)` maps `2` and
  `MediaTrackNext` to `next`, `4` and `MediaTrackPrevious` to `wrong`, `1` to `repeat`; a held
  key is one press (the screen drops `repeat` events). `spokenMove(san)` reads a move aloud
  ("knight takes e5, check"), for the Web Speech API.
- `src/platform/speech.ts` (speech, off by default, per device) and `src/platform/mediaKeys.ts`
  (Media Session handlers kept alive by a second of silence on loop, built in code as a WAV blob:
  a zero-length clip on loop crashed the browser under the repeated e2e runs). Pause and play are
  handled as nothing, so the ring can't stop the loop and with it the routing.
- The screen is the training screen in another mode (`#/show`, `#/show/<sid>`; "Show and grade"
  on the home card), with two large buttons for the keys, "Say again" when speech is on, and the
  speech toggle. The board takes no moves. A separate `ShowGrade.tsx` wasn't needed: the board,
  the feedback line, the counters and the session's end are the same.
- Tests: `test/unit/core/train/showGrade.test.ts` (the two-key table, a new move, the queue's
  three seconds and `wrong` clearing it, the key mapping, speech and the spoken moves) and
  `test/e2e/train.spec.ts` (a session run with `2` and `4` only: a move missed and graded Again
  with no `w`, three new moves taught, and the four events in the fake repo). 80 runs of the
  training specs under `--repeat-each=8 --workers=4` passed before pushing.

#### 5.10 Read and Interactive views

Qchess's two training views, started from the chapter view at the move shown ("Read from here",
"Play from here"):
- **Read**: the line from the start to the end of the main line below that move, step by step
  with ← →, with the board, the move and its comments in large text, clickable lines included.
  No editing controls.
- **Interactive**: the trainer with grading off, asking every own move of the line; wrong moves
  are taken back; the line follows the user's move among repertoire alternatives. It records no
  events.

Tests: the trainer in its interactive setting in Node (asks every own move, records nothing);
Playwright: read a line through, play a line through with one wrong move.

**As built** (2026-10-06):
- Routes `#/read/<sid>/<cid>?at=…` and `#/play/<sid>/<cid>?at=…`, modes `read` and `play` in
  `fsm.ts`. `at` names the line (the move's path, then the main line below it: `lineThrough` in
  `core/study/tree.ts`); an optional `&from=n` starts the view after the line's first n moves
  (default: at the move), so Read's "Play from here" after stepping back stays on the same line
  rather than the main line below the earlier move. The address doesn't follow Read's steps: a
  reload comes back to the move it was opened at.
- Opened from the chapter view by "Read from here" and "Play from here" under the notation (phone
  and desktop) and from the move menu. Both read the chapter from the working copy, so they work
  on reference studies too.
- **Read** (`src/ui/Read.tsx`): the board with the study's arrows and circles, the move numbered
  as in a book with its glyphs and "n / m", the comments in large text, the line's moves as
  buttons, ⏮ ◀ ▶ ⏭ and ← → Home End; Escape or "Edit" goes back to the chapter at the move
  shown, "Play from here" plays the same line from it. Clickable lines in its comments come with
  §5.12.
- **Interactive**: the training screen with a session kind `play`. The trainer gains `follow`:
  a move the user plays that another line of the chapter plays after the board's moves is right,
  and the walk continues along that line (`followLine`); without it the conflict rule (§5.6)
  applies. The session builds an index of that chapter alone, runs with no card states (so
  suspended and known moves are asked as well), `askAll`, `record: false`, and starts at the
  move (`interactivePlan` in `core/train/plan.ts`; from the start when opened at the line's
  last move). It records no events at all, pins and drills included. Hint and Stop as in
  training, no Skip line; the end offers "Play again", "Read the line" and "Back to the
  chapter" (at the line's last move); ← goes back to the chapter at the move on the board.
- The drill event (§5.8) is now recorded only in the drill and pin sessions, by name: the old
  test (every session but the queue and retry) would also have credited a pin from show and
  grade, and from the Interactive view.
- Tests: `test/unit/core/train/trainer.test.ts` (every own move asked with nothing recorded, a
  wrong move, the other line's move followed, the conflict rule without `follow`; the walk from a
  move, from a variation's move, and from the start at a line's end), `test/unit/core/app/
  fsm.test.ts` (the routes), and `test/e2e/views.spec.ts` on desktop and the emulated phone: a
  line read through (keys on desktop, buttons on the phone), its comment, a move picked from the
  list, back to the chapter at it, a variation's line; a line played with a wrong move, the
  suspended 2... d6 asked, 2... Nc6 followed to 3. d4, and nothing in the fake repo; Play from
  the move menu with a hint, then "Read the line". 128 runs of the training and views specs
  under `--repeat-each=8 --workers=4` passed before pushing; the first load runs caught Read's
  Escape leaving at the move before a quick step (the key handler now reads the latest step
  through a ref).

#### 5.11 Transposition badges and copy continuation

- **Badges** (q_extension's): a move whose resulting position is reached by another path in the
  same chapter gets `⇄n`; clicking it lists the other move orders, each a link to that node. A
  smaller mark counts the other repertoire chapters that reach the position, from the index.
- **Copy continuation** (q_extension's): in the move menu, the moves from the branch's first move
  (the nearest ancestor-or-self with a sibling) to the end of the line, following first children,
  as bare moves numbered from the position (`4... c5 5. d4 cxd4`). `linePgn` (§4.11) already
  numbers a line from the start; this numbers from any move.

Tests: transpositions found within a chapter (hand-built, and q_extension's harness cases ported
where they apply); the continuation of a main-line move, a variation's move and a nested one;
numbering from a Black move. Playwright: click a badge and land on the other line; copy a
continuation.

**As built** (2026-10-06):
- `src/core/study/transpositions.ts`: `transpositions(chapter)` keys the position each move
  reaches (D10's key: clocks ignored, an en passant square only when the capture is legal) and
  keeps the positions reached by more than one move; `otherOrders(t, path)` lists the others.
  Worked out from the open chapter on every edit, so a new move order shows its badge at once.
- The index (§5.1) gains `reached`: every position a move reaches, with the moves reaching it,
  across the repertoire. Each position is now keyed once while walking (before, a position was
  keyed again for each of its moves), so this costs no extra key per move.
- The notation (`Notation.tsx`, `Transpositions.tsx`): after a move, `⇄n` (n other move orders in
  the chapter) and a smaller `+k` (k other repertoire chapters reaching the position, from the
  training data's index, so as last saved). Either opens a list, placed like the move menu and
  driven by the same keys: "Other move orders here" (each `1. e4 c5 2. Nf3`, going to that move)
  and "Other chapters" (`Study · Chapter: moves`, opening that chapter at that move). Reference
  studies get `⇄` from their own moves; `+k` counts repertoire chapters only.
- Copy continuation: "Copy continuation" in the move menu, after "Copy line as PGN";
  `continuation(chapter, path)` in `core/study/ops.ts`, sharing its numbering with `linePgn`.
  On a main line with no fork above the move, it is the whole line from the start.
- q_extension wasn't checked out in this session's container, so its harness cases weren't
  ported; the tests are hand-built from this section's description. Ported in §5.20: the same
  3 positions and 8 moves.
- Tests: `test/unit/core/study/transpositions.test.ts` (move orders both ways, a three-move
  order, clocks ignored, the en passant rule both ways, the continuation of a main-line move, a
  move after a fork, a variation's move and a nested one, from a set-up position with Black to
  move, and the index's `reached` across two chapters) and `test/e2e/views.spec.ts` (the `+1` on
  1. e4, a new order 1. Nf3 c5 2. e4 played on the board giving `⇄1` both ways, the list leading
  to the other order, `+1` on 1... c5 opening the Alapin at it; a continuation copied from a
  variation and from the main line past the fork). 200 runs of the views and editor specs under
  `--repeat-each=8 --workers=4` passed before pushing.

#### 5.12 Clickable lines and line jumping

- `core/repertoire/lines.ts`: `parseCommentLines(text)`, a port of q_extension's `clParse`
  (`main-world.js`): every `(N. move …)` or `(N... move …)` in a comment, with each move's place in
  the text; a group holding anything else is a remark, not a line.
- `lineStart(line, node, parent)`, the port of `clStartFen`: the line starts at the commented
  move's position if its first move number and side are that position's, else at the position
  before the move (the line replaces it). Moves are played with chessops, so as far as they are
  legal, synchronously: no worker is needed.
- The comment renderer (`CommentText.tsx`) makes each move clickable. A click previews the
  position on the board and changes nothing else; ← → step through the line, Escape or a board
  click goes back.
- **Line jumping** (q_extension v1.13.1): → on a line's last move enters the first line of that
  move's comment; ← → run through a comment's lines end to end, skipping lines whose first move
  is illegal, never into another comment.
- Used in the chapter view, the Read view and the trainer's comments.

Tests: the two harness comments of q_extension (`test/harness.js`, "clickable lines": a line at
the same ply and a line before the move) and their edge cases (a remark in parentheses, `0-0`,
glyphs on a move, a first move that is illegal) in Node; Playwright: preview a line from a
comment and step back out.

**As built** (2026-10-06):
- **q_extension's source wasn't available.** This container had only this repo, so `clParse`,
  `clStartFen` and the harness's two "clickable lines" cases were rebuilt from this section's
  description and the comment grammar the repo's own PGN fixtures show (`qchess-sample.pgn`'s
  `{(7. Bc4 Qa5)}` on 6... Nbd7, and its remark in parentheses). What was implemented instead:
  - `src/core/repertoire/lines.ts`: `parseCommentLines(text)` takes every innermost `( … )`
    group that starts with a move number (`7.`, `7...` or `7…`, with or without a space) and
    holds only SAN moves, move numbers and glyphs (`!?`, `$14`, a move's own `!` or `+`);
    anything else makes the group a remark. `0-0`/`0-0-0` read as castling. Each move keeps its
    place in the text, glyphs left out.
  - `lineStart(line, after, before)`: the commented move's position when the line's first number
    and side are its own, else the position before the move; and when the first move is legal
    only in the other of the two, the other (a guess at how loose numbering is handled, as in
    a FEN-headed chapter). A comment before the first move starts at the chapter's start.
  - `playLine` plays as far as the moves are legal; a line whose first move is illegal shows
    nothing and is skipped.
  A later session with q_extension at hand should port its harness cases into
  `test/unit/core/repertoire/lines.test.ts` and compare. Done in §5.20, which brought the rules
  in line with q_extension's: a line is placed by its number alone, and one fitting neither
  position stays text.
- **The preview** (`src/app/preview.ts`, `src/ui/CommentText.tsx`): a click on a move of a line
  shows that position on the board (no other change: the move shown in the notation stays the
  commented one, no edit, no arrows of the study), with the moves so far and ◀ ▶ Back in a bar
  under the board for the phone. ← → step, Escape, Back, a press on the board, another move shown
  or another screen end it. One preview at a time, owned by the chapter view, Read or training.
- **Line jumping**: ← → run through one comment's lines end to end, skipping lines with no legal
  move, never into another comment; ← before the first move leaves the preview. → on a line's
  last move (a move with no continuation in the chapter view; the line's end in Read) enters
  the first line of that move's comments.
- Used in the chapter view's notation (comments in conflict stay a warning), the Read view's
  comments, and the training screen's comments (shown only at a move taught or shown, after a
  wrong move and at a line's end, §5.93). In
  training, the session goes on underneath a preview; the board takes no move until it ends.
- Tests: `test/unit/core/repertoire/lines.test.ts` (a line at the same ply, a line before the
  move, the text places, glyphs and `0-0`, remarks, an illegal first move, the other-position
  fallback, a root comment in a set-up position, the cursor end to end and out, the Qchess
  sample) and `test/e2e/views.spec.ts` (a comment written with a line replacing 2... d6, a
  remark and a line after it: previewed, stepped across lines with keys on desktop and the bar
  on the phone, left by Escape/Back and by a board click; line jumping by → in the chapter view
  and the Read view, desktop). The training screen's comments use the same component and were
  not driven by e2e. 304 runs of the views, training and editor specs under `--repeat-each=8
  --workers=4` passed before pushing.

#### 5.13 The owner's answers

Asked on 2026-10-06; the owner answered the same day, then the two follow-ups:

1. **The daily limit of new moves** holds back new material only. Lines learned before (in
   Chessable or Qchess) are marked known per chapter, and their moves come in without the limit
   (§5.3). The default limit still comes from §5.5 on the real repertoire (20 meanwhile).
2. **Grading like Chessable's: option A.** Right first time is Good, a wrong move or a hint is
   Again, time doesn't count, and FSRS spaces each move; a taught line comes back once 4 hours
   later (§5.2). Not chosen: Chessable's fixed ladder of intervals.
3. **FSRS retention: 0.9.**
4. **Daily use once §5.1–§5.8 are built** and the Phase 0 acceptance test has passed. The rest
   follows within Phase 1; lichessable retires once show and grade is in use.

Still open: running §5.5 on the real repertoire, by the owner or by a Claude session cloning
`skAeglund/repworks-data` outside this repo (only totals recorded here).

#### 5.15 Studies as Qchess's: the cards, studies made here, train ↔ study

The owner asked for these on 2026-10-06, after testing Phase 0 on the desktop and the phone
("the current version is good"); D22. They come next after §5.12, before §5.14's acceptance
test and Phase 2. As with D21, Qchess is read live first on the test account (CLAUDE.md), and its
behaviour is copied, then improved later. The owner's words:

> - It should be possible to create a study within this site without importing a pgn
> - It should be possible to edit study name, chapter name and remove study or chapter (etc).
> - I prefer how train <-> study works in Qchess. The user can review a variation (inside
>   "MoveTrainer" mode) and at any time switch to "Study mode" where the trained variation is
>   opened and editable.
> - Look for Qchess as a base on how the study and train features should work.
> - I also prefer the Qchess way of visualizing the different studies with cards
>   (https://qchess.net/studies)

1. **The study cards.** The study list (`#/`) becomes a grid of cards like Qchess's
   `/studies`: what a card shows and how it opens comes from Qchess, plus what Repworks
   already knows (repertoire or reference, and the study's due and new counts from the index,
   §5.1).
2. **A study made here.** "New study" on the list: a name, its kind, and a first chapter with its
   side, with no import. It is an ordinary edit (`study.json` and a chapter file, from
   `newChapter` and `addChapterToStudy`), synced like any other.
3. **Managing studies and chapters where Qchess has it.** Rename, delete and the rest (reorder,
   side, kind) already exist for chapters and for the study, but in a drawer under the notation
   (§4.11), where the owner didn't find them, and a study can't be deleted. They go where
   Qchess puts them: the card's menu for a study, the chapter list's menu for a chapter.
   Deleting asks first. Deleting a study removes `study.json` and its chapter files in one
   change, and §4.7 already restores a study deleted on one device and edited on another.
4. **Train ↔ study as Qchess's MoveTrainer.** While a line is trained (§5.7, and the Interactive
   view, §5.10), one control opens the study view on that chapter with the trained line at the
   current move, editable. From the chapter view, training resumes or starts from the move shown (in a repertoire study, the line shown selected and waiting, §5.83).
   Qchess decides how the session continues (where it was, or that line again). Repworks also
   has to decide what an edit made mid-session does to the session plan, since the index and
   the line can change. That is a technical call for the build session, and §5.6's trainer is
   pure, so re-planning from the edited tree is the likely answer.

Tests: Node, for a new study, deleting a study and a chapter (the files written), and the merge
of a study deleted on one side and edited on the other; Playwright, for making a study with no
import, renaming the study and a chapter, deleting a chapter and then the study, the cards, and
going from training to the study and back.

Live (desktop and phone): the cards, making and managing a study, and train ↔ study during a
real session.

**As built** (2026-10-06):
- **Read live on Qchess first** (the owner's test account, 1600×900; the pages' scripts read for
  the handlers): `/studies` is a grid of cards, each a link to its study with a visibility badge
  (Private), a favourite star, the name, "n chapters · Updated date · size", the colour and type
  tags, and in its corner a tag button and a delete button; deleting asks `Delete study "X"?
  This cannot be undone.` (the browser's own question). "+ New Study" opens a dialog (name,
  visibility; Enter creates) and goes to the new study. On a study page the sidebar has the
  study's name with a ⚙ (Study Settings: name, visibility, Save/Cancel), Qchess's "Study Mode |
  Move Trainer" switch, the chapters each with a ⚙ (a right-click opens it too: Chapter
  Settings: name, "For Color" White/Black, Move Trainer exclusion, colouring, and Delete
  Chapter, which asks `Delete this chapter?`), drag to reorder, and "+ New" at the foot. Its
  switch: "Study Mode" during training stops the session and opens the trained chapter at the
  trained line's last move; "Move Trainer" saves the chapter and starts again at the first line
  still to learn or due, which is the line that was interrupted, from its start.
- **The cards** (`src/ui/App.tsx`): Qchess's grid, with the kind where Qchess has the
  visibility, the name (the card's link: anywhere on the card opens the study), the chapters,
  the side as Qchess's colour tag (White, Black, Both, from the chapters' `Orientation`), today's
  "n due · n new" for a repertoire study, and its Train button; ⚙ (study settings) and 🗑 in the
  corner. Not copied: favourites, tags, the update date and size, which Repworks doesn't keep.
- **A study made here**: "+ New study" next to Import: name, kind, the first chapter's name and
  side; Enter creates, and the new chapter opens. `createStudy` in `src/core/study/manage.ts`
  gives study.json and the chapter file, one change; `src/app/studies.ts` writes it.
- **Managing**, where Qchess has it, the drawer under the notation gone: the study's ⚙ (by its
  name at the top of the chapter list on a wide screen, by the title in the head on the phone,
  and on its card) opens Study settings: name (every chapter's StudyName with it, one change),
  kind, Save, and "Delete study". A chapter's ⚙ (beside it in the list, or a right-click; on the
  phone beside the chapter menu, for the open chapter) opens that chapter and its Chapter
  settings: name and side (saved together, undoable as before), "Move up"/"Move down" (Qchess
  drags; buttons work on the phone), and "Delete chapter". "+ New chapter" at the list's foot
  (`+` by the chapter menu on the phone): name and side. Deleting asks first, as Qchess does
  ("Delete the study “X” and its 2 chapters?"). `deleteStudy` removes every file of the study's
  folder (study.json, chapters, conflict copies) in one change; the merge restores it, the
  edited chapters marked, when another device edited it meanwhile (§4.7, tested again from
  `deleteStudy`'s own change).
- **Train ↔ study**: the switch "Study | Train" sits in the head of the training screen (every
  session kind) and of the chapter view. "Study" opens the line's chapter at the move on the
  board (not at the line's end as Qchess does: that is where the user is, and the rest of the
  line is under it in the notation), editable, and keeps the session (its kind and the cards it
  answered, per tab in sessionStorage). "Train" in the chapter view, with a session kept, takes
  it up again: planned afresh from the repertoire as it now is (after the chapter's pending
  edits are written), less the cards it already answered (`withoutAnswered` in
  `core/train/plan.ts`), so the interrupted line comes back from its start, as in Qchess, with
  the edit in it and nothing asked twice (a move answered wrong, due again a minute later, isn't
  asked again in the same session). An Interactive view kept this way is played again from the
  move shown. With no session kept, "Train" trains the study (Qchess's Move Trainer trains the
  study), and a reference study, which has no cards, is played from the move shown. "Play from
  here" and "Read from here" stay as they were.
- Tests: `test/unit/core/study/manage.test.ts` (the files of a new study, a nameless one refused,
  a study's and a chapter's deletion, the merge of a study deleted here and edited elsewhere),
  `test/unit/core/train/plan.test.ts` (a plan without the answered cards, shortened and emptied
  lines, a new line still walked whole), and `test/e2e/studies.spec.ts` on desktop and the
  emulated phone (the cards; a study made with no import, renamed and made a repertoire, its
  chapter renamed and turned, a chapter added and deleted, the study deleted from its card after
  a refusal, each checked in the fake repo; renamed from its card and deleted from the chapter
  view; a session left for the study at 3. d4, the line extended there by 4. Nxd4 Nf6, and the
  session taken up again teaching cxd4 then the new Nf6, with one event per card; the switch
  from the chapter view, and from the Interactive view and back). The editor and acceptance
  specs now add, rename, turn, move and delete chapters through the dialogs. 96 runs of the new
  and changed specs and 96 of the training, views and acceptance specs under `--repeat-each`
  passed before pushing.

#### 5.16 The owner's first Phase 1 testing round

The owner tested the build of 2026-10-06 (`95b0b76`) on the desktop and the phone and reported
(the same day): the study cards, making and managing studies (synced to the phone), the chapter
⚙ on the phone, the transposition badges and clickable lines work. Training couldn't be tested:
the day's limit of new moves was used up, "Train again" did nothing, and nothing changed it. The
requests, in the owner's words where they set a detail:

1. "Study" on the training screen did nothing (with nothing on the board).
2. No way to change or turn off the daily limit; "Train again" did nothing.
3. "The training page should not only be about the due reviews. Like in Qchess, the user should
   be able to browse all variations and learn or repeat variations even if they're not due",
   and from training, the study at the exact position (the line's end is acceptable).
4. Clicking a move in the study: its hitbox can extend to the right of the move.
5. Show and grade: a button to switch to it during a normal review, and "1" to enter it.
6. The transposition badge could stand out more.
7. Clickable lines: not green; a bold blue font, the brackets included.

Qchess's Move Trainer was read live first (its study page's script, on the test account): the
sidebar lists each chapter with "Learn k/n" (lines learned of all) while it has unlearned lines,
or "Review n"; a chapter opens to "Line 1…n", each with a state dot, "Due now" / "Due in n
days" and a tooltip of its moves; a click on any line trains it at once. A line trained in
review mode while not due is not saved (`saveLineProgressAfterTraining` returns `not-due`), and
a learned line trained again in learn mode changes nothing.

**As built** (2026-10-06):
- **The line list** (`src/core/train/browse.ts`, `src/ui/LineList.tsx`): on the training screen
  of the whole repertoire, of a study, of a picked line and of a chapter's learning, beside the
  board on a wide screen (≥1150 px), folded under the session on a narrower one (opened by "Show
  lines", and opened by itself when there is nothing to train). Each chapter: "n due" (lines with
  a due move), "Learn k/n" while it has new lines (else "n/n"), and its lines when opened (the
  line on the board's chapter opens by itself): "Line n", a dot (new, due, learning, learned),
  the line's own moves from where it leaves the line before it (Qchess shows these only in a
  tooltip; the whole line is the tooltip here), and "New · 3", "Due now", "Due 14:00" or "Due in
  3 days". With the whole repertoire, chapters are grouped under their study's name.
- **A line picked from the list** (`#/train/<sid>/<cid>?at=…`, the line's moves): walked whole.
  Its due moves (and a known chapter's moves never answered) are asked and graded as in the
  queue; its moves never answered are taught, whatever the daily limit says (the limit paces
  the queue; a line the owner picks is learned); every other own move is asked with no grade
  and no event (the trainer's `practice`), as Qchess saves nothing for a line trained before
  it is due. Suspended moves are still played for the user. The end offers "Next line" (the
  list's next), "Again" and "Today's queue". `pickedPlan`, and the trainer's `practice` option.
- **Learn on a chapter** (`#/learn/<sid>/<cid>`): the chapter's lines with moves never answered,
  in order, each walked whole, past the limit (`learnPlan`). A known chapter has nothing to
  learn: its lines show as due.
- **Nothing to train** now says why (no move due until when; the day's new moves learned, with
  the limit) and offers "Learn the next line" (the list's first line with new moves, picked as
  above), "Daily limit…", Mistakes and Home, with the list open beside it. "Train again" stays
  only after a session that trained something.
- **Training settings** (`src/ui/TrainSettings.tsx`, `src/app/trainSettings.ts`): ⚙ on the home
  screen's training card and in the training screen's head opens New moves a day (0 turns new
  moves off), Retention and the learning step, written to `settings.json` (§5.2; only the fields
  changed, so the per-field merge keeps a change made on the other device). A `settings.json`
  that can't be read is not rewritten. The home card says when the day's new moves are learned.
- **"Study"** on the training screen always works: with a line on the board, its chapter at the
  move on the board (as before: the exact position); with none, the picked line's or learned
  chapter's chapter, the study trained, or the repertoire's first chapter.
- **Show and grade, switched mid-session**: "Show and grade (1)" on the training screen, and the
  key `1`, switch any session to the two keys at the move asked, the same trainer going on (its
  `setSelfGrade`); "Play the moves" switches back (not while a shown move waits for its
  verdict). A move already tried wrong, or hinted, before the switch is graded Again whatever is
  told. `#/show` still starts a session that way.
- **The notation**: a main-line move's whole cell takes the click, the space to its right
  included; `⇄n` is a gold pill and `+k` a slate one; a comment's line is bold blue, brackets
  included (`.comment-line`), each move still its own link.
- Tests: `test/unit/core/train/browse.test.ts` (line states, numbers and forks; a picked line's
  grades, teaches, practice with nothing recorded and a suspended move played; Learn past the
  limit; show and grade switched on after a wrong move), `test/unit/core/app/fsm.test.ts` (the
  two routes), and `test/e2e/lines.spec.ts` on desktop and the emulated phone (the list, a
  line picked: c5 graded and Nc6 taught, then practised with a wrong move and nothing recorded;
  the limit set to 0 from the home card and written to `settings.json`, a value out of range
  refused, nothing to train, "Learn the next line", "Study" with nothing on the board; "1"
  mid-session after a wrong move, Again recorded, and back to moves). Two existing specs now
  click a move's text rather than its middle, which the larger `+1` pill covers.
- Not checked live: everything above was checked against the fake GitHub only. Once the owner
  gave the Claude GitHub App access to the testing data repo, the built app was run against it
  in headless Chromium, but the container's proxy drops a web page's credentials to
  `api.github.com` (CLAUDE.md), so the app got 404 and couldn't sync from there.

#### 5.17 The owner's second testing notes: learning, feedback, auto-play, time travel

The owner's notes of 2026-10-06, sent to a side session while the chain built Phase 2. They are
Phase 1 follow-ups, **built next**, before the chain goes on with Phase 2's next part. The
owner's words where they set a detail, then what is to be built.

How auto-play stood when the notes came (`trainer.ts`, `kindOf`): always on, no setting. In the
queue an own move is played for the user when it was answered earlier in the session (right or
wrong), is suspended, or was reviewed and isn't due. In a picked line and Learn (`practice`),
a reviewed move that isn't due is asked, ungraded. A move never answered is never auto-played.

1. **Learn without the arrow.** "There should be an option to try to learn without hints." A
   per-device training setting, *New moves: show the move (arrow and SAN, as now) / let me try
   first*. With "try first" a new move is asked like a due one, with "New move" and no arrow; a
   wrong move or Hint shows the arrow, as the `wrong` state already does. Either way it records
   one `taught` and no review (a new card has no grade to lose); the note says whether it was
   found unaided ("New move found: Nf3").
2. **The line's end keeps the board.** "After learning a variation, there's no need to hide the
   board." A picked line's or Learn's end leaves the board at the line's last position, with the
   comments of its last move; the numbers and the buttons ("Next line", "Again", "Today's
   queue") sit where the feedback line and the buttons were, so nothing jumps. The session's
   end (the queue's) keeps its summary, also under the board.
3. **Auto-advance.** "An option to automatically move on to the next variation." A per-device
   setting, *At a line's end: wait / go on*. With "go on", a picked line moves to the list's next
   line (Learn: the chapter's next line with new moves) after a pause of four paces, with
   "Next: Line 7 · Stop" shown during the pause; Escape or Stop cancels it. The queue already
   goes on by itself.
4. **Quieter feedback.** "The constant swapping between 'Your move' and 'Correct' gets
   annoying." The notes `yourMove` and `correct` show nothing. The feedback line keeps its height
   (so the board never moves) and shows only what asks something of the user: "Not in your
   repertoire: try again", the new move, the conflict's "find it", a suspend's undo, and later
   the alternative's note (§5.18). Speech says nothing for them either.
5. **Where a learned line starts.** "Instead of skipping right to the first key move, the
   option to auto-play the moves to get there." A per-device setting, *A line starts*:
   - **at its first new or due move** (as now: a line sharing its start with the board starts
     there, else the board jumps to the position before the first ask or teach);
   - **auto-played from the start**: the board goes to the chapter's start and the line's moves
     up to the first ask or teach are played at the pace, own moves included, before asking;
   - **from the start, asked**: as Chessable with auto-play off: from move 1 every own move is
     asked (ungraded unless due, as `practice`), opponent moves played at the pace.
   Default: auto-played from the start for Learn and a picked line, first new or due move for
   the queue (the queue's lines mostly share their start with the board already). The setting
   is one for each, in the training settings.
6. **Auto-play as lichessable's.** "I want the auto-play feature as it works in lichessable. We
   should at least have the mode where any move that has been answered correctly in the current
   session is auto-played (if auto-play setting is enabled)." The build session reads
   lichessable's auto-play design and code first (read-only reference: its `DESIGN-autoplay.md`
   and the trainer it describes) and ports its modes as a per-device setting, *Auto-play*, with
   at least:
   - **off**: every own move of a line is asked, wherever met; graded only when the card is due
     today (or new and taught), else asked with no event, as `practice`. Suspended moves are
     still played (they are the owner's "always play this").
   - **moves answered right this session** (the owner's minimum): a move answered right first
     time earlier in the session is played for the user; a move answered wrong is asked again
     when met on a later line, with no second grade (a card is graded once a session), so the
     owner meets the miss again.
   - lichessable's other modes as its design gives them (proven moves across sessions, if it has
     that; the current "not due is played" behaviour of the queue is one of them).
   Today's behaviour (answered right or wrong → played; reviewed and not due → played in the
   queue) maps to whichever mode matches it, and that mode is the default until the owner says
   otherwise. The rule stays in `kindOf`, one function, with the mode an option of `Trainer`.
7. **Time travel.** "A way to fast-forward time. It's useful for the user, but also for testing
   purposes." In the training settings (and the debug panel): *Time: now / +1 hour / +4 hours /
   +1 day / +1 week / custom*, with a banner on every screen while it is on ("Time +1 day ·
   Back to now"). Kept per tab (`sessionStorage`), so a reload keeps it and a new tab starts at
   now. While it is on, everything that reads the clock to *decide* uses the shifted time: the
   day's bounds, what is due, the learning step, the queue, the line list's "Due …", the pins.
   **Events are still recorded at the real time.** A shifted timestamp would be synced into the
   real log for good, leaving cards scheduled from a future that never happened; recorded at the
   real time, a move answered ahead is an early review, which FSRS models (a short elapsed time
   raises stability less). So the user can train tomorrow's reviews today, and a test can bring
   the learning step's reviews due at once. What follows, said in the banner's help: new moves
   taught while shifted count to the real day's limit when back at now. The `Clock` port gains
   the offset (`src/platform`), and core keeps taking time as an input.

Tests: the trainer's options in `trainer.test.ts` (try first: no arrow until wrong or Hint, one
`taught`; each auto-play mode on a session with a move answered right and one answered wrong,
met again on a later line; each line start; the 120 random repertoires re-run under every mode:
every planned ask graded once, every teach taught once); the clock's offset in Node (queue,
day bounds and learning step shifted, events at the real time). Playwright, desktop and phone:
a picked line ending with the board still shown and going on by itself to the next; "Your move"
and "Correct" never shown; a learned line auto-played from the start; time travel +4 hours
bringing a just-taught move due, its review event carrying the real time, and the banner's
"Back to now".

Live (owner, phone and desktop): the new settings' defaults in a real session; whether the
quieter feedback line is enough; auto-play's modes against what the owner knows from
lichessable.

**As built** (2026-10-06):
- **Read first**: lichessable's `DESIGN-autoplay.md` (§1–§12) and `DESIGN-difficult-moves.md`
  (§1–§5), cloned read-only at its `main`. lichessable has two things a Repworks mode can be:
  auto-play proper (a move answered right this session is played the next time a line passes
  its position; the first meeting is always by hand; a failed move never auto-plays; the line,
  not the record, chooses the move) and "difficult moves only" (an easy move is played though
  the session never saw it, a difficult one is asked even when proven). Chessable's own "not due"
  doesn't exist there: its review session asks whole due variations.
- **Auto-play** (`AutoPlay` in `core/train/trainer.ts`, a `Trainer` option, changeable mid-session
  by `configure`). The rule is in two functions now: `needs(card)` (the plan grades or teaches
  it: due today, known and never answered, or never answered at all; mode-independent, so a
  move never answered is still never played) and `plays(card)` (for every other own move, by the
  mode). Suspended moves are always played.

  | Mode | Answered right this session | Answered wrong this session | Not answered, not needed |
  | --- | --- | --- | --- |
  | `off` | asked | asked | asked |
  | `session` (lichessable's auto-play) | played | asked | asked |
  | `due` (default: the trainer as it was) | played | played | queue: played; a line picked: asked |
  | `difficult` (lichessable's "difficult moves only") | played unless difficult | asked | queue: played unless difficult; a line picked: asked |

  "Asked" for a move the plan doesn't need is practice: no event. A card is graded once a
  session (`graded` now also checks it wasn't answered, which before was never reached). A move
  taught with its arrow isn't "answered right"; one found with no arrow, wrong move or hint is
  (`session` then plays it). **Difficult** (`isDifficult`): a reviewed card with two lapses or
  more, or FSRS difficulty from 7 (an Again pushes a card there; Goods bring it down slowly).
  The default is `due`, today's behaviour, until the owner says otherwise.
- **Learn without the arrow** (`tryNew`): a new move is asked (phase `ask`, note `newTry`, "New
  move: find it", no arrow, comments hidden as for any ask); a first wrong move is taken back,
  a second or Hint shows the arrow; either way one `taught`, no review. The note after it says
  "New move found: Nf3" when found unaided.
- **Where a line starts** (`lineStart`): the line's **prefix** is its moves before the first move
  the plan needs (or, on a line with none, before the first own move the mode asks). `first`:
  the walk starts at the prefix's end, one move before it so the opponent's move is seen, or
  where the board already is when that is further on; `auto`: at the chapter's start, the prefix
  played at the pace, own moves included (even when the board already shares the line's
  moves); `ask`: at the chapter's start, every own move of the line asked (practice unless the
  plan grades it), on every pass, whatever the auto-play mode (revised 2026-10-09, §5.78: before,
  only the prefix was asked, and the mode decided after it). Unset (retry,
  drill, the pins, the Interactive view): the walk as before. Defaults: `first` for the queue
  and show and grade, `auto` for a line picked and Learn.
- **A line's end**: the board stays. The trainer now ends the session at the last line's end
  at once (no pause before `done`), its view still on that line, so the training screen keeps
  the board at the last position with the comments of its last move, and the session's numbers
  and buttons take the action buttons' place (`Done` inline). Only a session that walked nothing
  (or was stopped before its first line) shows the card. The board's `data-phase` attribute
  names the phase, for tests and styling.
- **Auto-advance** (per device: wait / go on): Learn's lines **hold** at each end (`holdLineEnd`;
  "Line done · Next: Line 2" and "Next line"; the trainer's `next` command, and in show and
  grade the `next` press, go on) or go on after four paces (`lineEndPaces`), with Stop and
  Escape ending the session. A line picked, set to go on, opens the list's next line four paces
  after its end, "Next: Line 2 · Stop" meanwhile; Stop or Escape stays. The queue and show and
  grade hold as Learn does when set to wait, and go on after two paces otherwise (revised
  2026-10-08: the owner's queue went on while set to wait).
- **Quieter feedback**: "Your move" and "Correct" show nothing (the trainer still emits them; the
  UI words them as empty), and the line keeps its height. Speech never said them.
- **The settings**: the training settings dialog gains "This device": New moves (show / try
  first), Auto-play (the four modes), A line starts in the day's queue, A line starts when
  learning or picked, At a line's end; saved with the dialog to localStorage
  (`repworks.trainPrefs`, `src/app/trainPrefs.ts`, each field checked on reading) and applied
  to a running session at once.
- **Time travel** (`src/app/time.ts`, `shiftedClock` in `src/platform/browser.ts`): Now, +1 hour,
  +4 hours, +1 day, +1 week or a number of hours, in the training settings and the debug panel,
  per tab (sessionStorage), with a banner on every screen ("Time +1 day · Back to now", the help
  in its title). `decidingNow()` replaces the real clock where the app decides: the queue and
  the day's bounds (home card, study cards, the session's plan, "Nothing to train"), the line
  list's states and "Due …", the card panel, the pins due (home card, Mistakes, "Drill pinned").
  The day's mistakes are read at the real day (they are records), so a mistake made while
  shifted is listed. Events keep the real time (`new Date()` in `apply`); the sync's clock is the
  real one. A screen with nothing to train looks again when the offset changes.
- Tests: `trainer.test.ts` (each mode on two lines sharing a move answered right and one answered
  wrong; `difficult` asking a lapsed move not due; `session` asking a move taught with its arrow
  and playing one found; try first; each line start, and `auto` going back to the start; the
  held end, `next`, and the session ending at once; the pause in paces; 120 random repertoires
  under every mode, line start, try first, hold and practice: every planned ask graded once,
  every teach taught once, nothing graded twice, no wait under the floor), `showGrade.test.ts`
  (`next` at a held end), `test/unit/app/timeTravel.test.ts` (the shifted clock, the banner's
  words, a move taught now due at +4 hours with the day's limit the real day's, its review at
  the real time scheduled from it; the stored settings; each session kind's options), and
  `test/e2e/autoplay.spec.ts` on desktop and the emulated phone (a picked line's end with the
  board kept, "Next: Line 2", the next line opening by itself and starting from 1. e4, Escape
  staying, and "Your move"/"Correct" never shown; a new move tried first with no arrow, then due
  at +4 hours, its review at the real time, "Back to now"; Learn holding with "Next line"). The
  existing specs wait on `data-phase` where they waited on "Your move"; two of them now follow
  the new defaults (a picked line starting auto-played, the board kept at the end). 360 runs of
  the training, line, studies, views and §5.17 specs under `--repeat-each=8 --workers=4` passed
  before pushing.

#### 5.18 Alternative moves (Chessable's), planned for later

"We need to plan to implement the 'alternative moves' as used in Chessable, including an easy
way to add/save them. An alternative move is a 'soft fail' which gets a free retry (doesn't count
for grading)." Not built until the owner answers the storage question below; build it after
§5.17, or later in the chain if the answer comes later.

- **In training**: a move played where an own move is asked, which isn't the repertoire's but is
  saved as an alternative for that position, takes the move back with "Good alternative, but
  your repertoire plays something else: try again", and doesn't count: not in the review's `w`,
  no Again, no Hint. The same alternative played twice in one ask is still free; any other
  wrong move counts as now.
- **Saving one**: after a wrong move, the "try again" line offers **"Save as alternative"**
  (one tap; undo until the next move). It saves the move just played for that position and
  removes it from the ask's wrong moves, so the grade is as if it was never played. Also in the
  study view's move menu on an own-side position ("Alternatives here: Nc3 ✕ · Add…"), and listed
  in the card panel (§5.7).
- **Keyed by position**, like cards (`positionKeyOf`), so an alternative saved once holds in
  every chapter and transposition reaching that position, for that side.
- **Storage: the owner's choice** (a data format their real data is written in). Recommended:
  **events in the progress log**, `{"k":"alt","key":"<positionKey>","uci":"g1f3","on":true}`
  (and `on:false` to remove), replayed into a set like pins: append-only, merged and synced by
  what exists, and the study PGN (Qchess's and Lichess's round-trips) untouched. The other
  choice: a sideline own move in the study itself, marked (a comment tag); visible in the PGN and
  in Qchess, but it changes the studies' text, risks being read as a repertoire move by anything
  that doesn't know the mark, and isn't position-keyed.
- **Chessable's own alternatives**: if the owner's course exports carry them, an import of
  them as `alt` events (to check against an export in the data repo).

Tests: the trainer (an alternative is free, twice; another wrong move after it counts; saving
one mid-ask removes it from `w` and the grade is Good when right next); replay of `alt` events
(add, remove, both devices); Playwright: a wrong move saved as an alternative, then played on a
later line and taken back for free.

**The owner's answer (2026-10-06, third notes):** events in the progress log, as recommended,
"as long as it works as expected".

**As built (2026-10-06):**
- The event is `{"v":1,"n":…,"t":…,"k":"alt","card":"r|<positionKey>|<uci>","on":true}` (`on:false`
  removes it): the move and its position in a `card` field, as every known event has, rather than
  the `key` and `uci` sketched above, so replay groups it with the other events of that move and
  an older reader skips it as a kind it doesn't know. The last event of a move decides
  (`core/train/alternatives.ts`). It never touches a schedule, and a move only ever saved as an
  alternative isn't counted as "no longer in the repertoire".
- Training: an alternative played where an own move is asked is taken back with "e5: a good
  alternative, but your repertoire plays something else: try again", for free, however often.
  After a wrong move, **"Save e5 as alternative"** saves it and takes it out of the ask's wrong
  moves (shown by a second wrong move, the arrow goes and the ask goes on with the first);
  **"Undo"** puts it back, until the next move. Saved in every kind of session, graded or not.
- The study: the card panel of an own move lists **"Alternatives here: e5 ✕"** for its position,
  each removed by its ✕. Adding one from the study is built in §5.69 (the training screen's
  button is the other way in, where the wrong move is in hand).
- Not built: an import of Chessable's own alternatives from a course export (to check against an
  export in the data repo first).

#### 5.38 The owner's third testing notes (built 2026-10-06)

Taken in a session beside Phase 3's build, so as not to interrupt it.
- **Explorer: the bars line up** (Qchess's). The games' count was an `auto` column, sized by each
  row's own grid, so a longer count pushed its bar right. It now has one width for the header and
  every row, from the longest count shown (a digit about 0.48 rem, a comma half that).
- **Explorer: Eval further right** on the desktop (Move 62 px, Eval 60 px, from 58 and 50); the
  phone keeps the old widths, where the row has no room to give. (Too far: back left in §5.67.)
- **Practical: a "+" on hover** for a cell not computed (Qchess's), in place of the dashed box;
  faint and always shown where there is no hover (the phone).
- **Dialogs wider on the desktop** (600 px from 420; the comment dialog 560 from 460), and **closed
  by a click on their backdrop**, as by Escape: the dialog gets its `cancel` event, so one that
  refuses (Maia's while downloading) stays. A press that starts inside the dialog doesn't count.
- **New moves: "Show a sequence, then let me play it"** (Chessable's way), with **"New moves in a
  sequence"** (default 5) shown once it is chosen. At a new move the trainer plays the line's next
  moves up to the n-th new own move, at twice the pace, with no arrows; it stops before an own
  move asked (a due move would be given away) and at the line's end. The user steps within the
  sequence (◀ ▶ ⏮ ⏭, or ← → Home End) and presses **"Play it"** (Enter): the board goes back to the
  sequence's start, each new move is asked with no arrow (a wrong move, then Hint, shows it, as
  "Let me try first"), and the moves played for the user in it are played as before. The next new
  move after the sequence starts the next one. Show and grade keeps its own walk (no sequence).
  The count is of new own moves, not plies: "x moves" read as the moves to learn.

Tests: the trainer (a sequence of two from 1. e4, its ticks at twice the pace, `seek` held within
it, `ready` back at its start with no arrow, the next sequence after it; a due move ends a
sequence before it); the settings' parsing and options; the random-session check with sequences
on; Playwright, desktop and phone: a sequence watched, stepped, played; a dialog closed by its
backdrop and not by a click inside it; the explorer's bars at one x.

#### 5.67 The owner's fourth testing notes (built 2026-10-07)

From the owner's first pass over the test sheet and three screenshots, with Claude in Chrome's
desktop checks beside it.
- **The branch picker** (Qchess's): → or ▶ on a move where the line branches no longer takes the
  main line at once; it opens a list of the moves that go on (`2...d6`, `2...Nc6`), the main line's
  chosen, under the move in the notation (above it where there's no room). ↑ ↓ choose, → ▶ or
  Enter go along the one chosen, a click or tap goes along it too, ← or Escape close the list
  where it stands; any other move (a click in the notation, ⏮ ⏭) closes it. Where nothing
  branches → steps as before, and at a line's end it still enters the comment's line (§5.12).
  `src/ui/BranchPicker.tsx`.
- **"Read from here" and "Play from here"** leave the chapter view's panel: both are in the move
  menu (right-click, long-press, ⋯), which the e2e tests now use.
- **The explorer stuck on "Asking…"** (a screenshot on a deep Benoni line): the panel's request
  for a position joined one already queued for it (the explorer and ChessDB share identical
  requests), and when that one was the Practical search's for the position before, stepping on
  swept it as stale and the panel's lookup was cancelled with it, silently. A shared request now
  keeps each asker's staleness and is dropped only when every asker is stale, and an asker joining
  raises it to its own priority (the panel's request no longer waits behind the search's). Also:
  the worker gives up an explorer or ChessDB request after 30 s (`AbortSignal.timeout`), since one
  that never settled held the explorer's single lane for good; the panel says "Lichess didn't
  answer in 30 seconds" with Retry. Game exports have no limit. Tests:
  `test/unit/core/explorer/service.test.ts` (the panel answered after the search moved on, and its
  request moved up to the panel's priority; both failed before the fix).
- **Explorer columns**: Eval right after the move (desktop Move 56 px, Eval 48 px; phone 52 and
  46), as Qchess's. **"⇅ Sort"** as Qchess's: a fixed label with the select over it, so Maia's two
  columns no longer cut it to "Sort l".
- **Storm: the scope picked on its page** (the owner's note, not in the plan before): Study (whole
  repertoire or one) and Chapter (all, or one) at the top of the storm's home; they open the same
  routes as "Storm from here" and the study's settings (`#/storm/<sid>/<cid>`), so the storm,
  the set and the gather all follow them. The record is the scope's (`recordOver` in
  `src/core/storm/record.ts`: the chapters' rows added up; answers naming no chapter count in the
  whole record only), with a table **by study** on the whole repertoire and **by chapter** in a
  study (every chapter, answered or not), each name opening its scope. Tests: `store.test.ts`
  (a study's and a chapter's record), `storm.spec.ts` (the tables, a study and a chapter picked,
  back to the whole repertoire).
- **The gather's counts and Stop** (Claude in Chrome's note): the request counts are shown as each
  request goes out (at most four times a second), not when a walk ends, and Stop ends the gather
  at once: the request under way is given up and Stockfish's search for it stopped; the walk it
  belonged to is left out. Test: `storm.spec.ts` (the counts while an export hangs, Stop within 2 s).
- Not changed: "New move found: Nd5" replaced at once by the next prompt (Claude in Chrome's note):
  the quieter feedback line (§5.17) shows only what asks something of the user.

#### 5.68 The owner's notes of 2026-10-07 (later): Quiz from here, Practise from here, Collect all

- **"Play from here" is now "Quiz from here"** (the move menu and Read): it opens the Interactive
  view, which asks the line's own moves and plays against nothing; "Play" suggested a game.
- **"Practise from here" in the study's move menu**: a practice game (§5.57) from the position after
  the move, as the chapter's side (its Orientation), against the database, then Maia, then
  Stockfish, with the repertoire check and the review. Reference studies have it too.
- **Collect all** beside "Collect: about n MB" on the storm's Puzzles card, when more index files are
  left than one press reads (100): reads every one left, deepest anchors first, saved shard by shard,
  Stop ends it, and it keeps going while the app is open on another screen (the card no longer
  stops a collect when it is left). The 100-shard bound stays on the plain button, for the phone.
  A page closed ends it; it can't run without the page. Tests: the move menu's items in
  `editor.spec.ts`, `views.spec.ts` (Quiz); Collect all itself isn't driven (the fake dataset's
  anchors fall in fewer than 100 shards): TESTING.md.

#### 5.69 The owner's notes of 2026-10-07 (last): ✎ and ⋯ on touch only, alternatives added from the study

- **The ✎ (draw mode) and ⋯ (move menu) buttons are hidden where there is a mouse** (`hover: hover`
  and `pointer: fine`, any width): a right-click on a move opens its menu and a right-drag or
  Shift-drag on the board draws (chessground's own; Shift red, Alt blue), so the buttons only
  took room from the move buttons. The phone keeps both. The e2e helpers (`openMoveMenu`,
  `drawInDrawMode`) use the buttons where they are shown and the mouse gestures where not.
- **"Add alternative…" in the study** (completes §5.18, whose "As built" left adding to the
  training screen): the card panel of an own move gets the button. It shows the position *before*
  that move on the board (the notation stays on the move, nothing is written to the chapter), and
  the move played there is saved as an `alt` event for that position, as training's "Save as
  alternative" does, with the card panel's list showing it. The repertoire's own move and one
  saved already are refused with the reason; Cancel, Escape or moving to another move ends it
  with nothing saved. One alternative per press. Test: `alternatives.spec.ts` (both viewports).

#### 5.70 Prioritize a study, and paused lines (planned and built 2026-10-07)

The owner's request: a study's lines (or one chapter's) ranked by how likely the owner is to face
them and how much knowing them matters. Lines outside the chosen set are **paused**: kept in the
study and visible, but left out of learning and review. Until now the owner did this with a
script (`prioritize_repertoire.py`, a port of mistake-lab's checklist generator, the same
algorithm as §5.62) that wrote a smaller PGN to import. The owner's answers (2026-10-07): a whole
line is paused, not a move, from the training screen's line list, with a pause symbol in place of
the state dot. Pauses go in the progress log. "Critical" means hard-to-find moves plus a
must-learn mark of the owner's own, and not their games, since they learn a repertoire before
playing it. Further lines come in by hand ("Add the next 10"), and prioritizing keeps lines
already learned. A paused line is not a suspended card (§5.2): a suspended move is played for the
user, while a paused line is not trained at all.

Build order: (a), then (b), (c) and (d); each part is pushed when its tests pass.

**(a) Paused lines** (`src/core/train/paused.ts`, events, queue, plan, the line list)
- **A line's mark** is a progress event,
  `{"k":"line","card":"l|<sid>|<cid>|<SANs joined by spaces>","mark":"paused"|"must"|"none"}`. The
  last event by replay order wins, as with every toggle in the log. The path is the line's leaf
  path when it was marked. **The mark covers every line of that chapter whose path starts with
  it**, so a line extended later stays paused, as do branches added after its old end. A branch
  added earlier along the line is a new line and is active. A mark that matches no line is kept,
  counted in the debug panel and otherwise ignored, like an orphaned card. A re-imported study
  has a new sid, so it starts unpaused.
- **A card is held back only when every line it lies on, in every study, is paused.** Shared
  prefixes and transpositions into an active line keep a card active. The queue (§5.3) leaves
  held cards out of `due`, `later`, the new lines and the known pool. A wholly paused line is
  never a new or known line. The planner (§5.4) picks review lines among active lines only, and
  every due card lies on one, since a held card is never due. `DailyQueue` gains `pausedLines`.
- A reviewed card that is held keeps its FSRS state. Its reviews stop, and when its line is
  unpaused it comes back due (overdue), as any late review does.
- **Paused lines still count everywhere except training**: the study views, the editor, Read,
  Quiz from here, the deviations (a move of a paused line is still the repertoire), coverage and
  the checklist (which leaves them out since §5.130, the owner's choice). The storm's repertoire sources (§5.40) leave paused lines out, as untrained
  material.
- **The line list** (§5.16): ⏸ in place of the state dot, labelled "Paused"; ★ beside a
  must-learn line. Each row's menu (⋯, or a right-click) has Pause or Unpause, and Must learn or
  Not must-learn. The chapter header gets Pause all and Unpause all, and its "Learn k/n" counts
  active lines only. Clicking a paused line opens it as practice (nothing recorded, like the
  Interactive view), with "Paused: practice only · Unpause" above the board. The home screen
  reads "Train: 23 due · 18 new · 140 paused".

**(b) The ranking** (`src/core/repertoire/priority.ts`, pure: the explorer and Maia come in as
functions, as the checklist's `Probs` does)
- **Scope**: a study's lines for one side (a study holding both sides is ranked per side) or one
  chapter's lines. A variation is a whole line of the index (§5.1), the unit the owner pauses.
  The script's depth cut (`--ply`) is dropped.
- **Reach**: walk each line from its chapter's start. At an opponent's move, take that move's
  share among the replies the scope covers at that position. Coverage is gathered by position
  key across the scope's chapters, so a transposition gets the same shares wherever it is
  reached. The shares come from the explorer at the chosen ratings and speeds; the defaults are
  the checklist's (1600–2500, blitz to correspondence). A covered reply the explorer doesn't know
  gets the script's floor, 0.0002. An own move passes the reach on unchanged; two own moves in
  one position (a conflict, D3) each keep the full reach. A chapter starting from a FEN hangs
  where another line of the scope reaches its start, and otherwise starts at reach 1, shown as
  its own group.
- **How hard each own move is to find**: `p`, the share of explorer games at those ratings in
  which the side to move played the repertoire move. This needs the explorer at own positions
  too, so a first run makes about twice the script's calls, through the same cache. Where the
  explorer has fewer than 20 games there, Maia's probability at the rating is used if Maia is
  downloaded (§5.32). Otherwise `p` is unknown and counted as 0 ("wouldn't find it"), so with no
  data the ranking falls back to likelihood alone.
- **The order** is greedy by marginal value. A line's value is its reach × the chance of leaving
  the repertoire somewhere along it without having studied it:
  `1 − Π p` over its own moves not already covered by a line taken earlier or learned already.
  The line with the highest value is taken next; ties go to the index's order. A line with
  nothing left to learn has value 0 and goes last. Must-learn lines are taken first. One setting,
  "Natural moves count less" (on by default), switches the `Π p` term off for a ranking by
  likelihood alone.
- **Learned moves count as covered only while learned lines are kept outside the number**
  (fixed 2026-10-09 after the owner's test). With Keep lines already learned off, a learned line
  is ranked on its reach and moves like any other: counted as free, the lines learned first (the
  best ones) went last, and keeping the top half kept 18% of the games and paused the lines
  already learned. The lookups (`scoreLines`) and the order (`orderLines`) are apart, so both
  checkboxes re-order the table at once, without scoring again.
- **Why not the script's d'Hondt slots**: d'Hondt hands out a fixed number of slots down the
  tree in proportion to the shares, but it knows nothing of moves already covered or how hard a
  move is. The greedy order gives "the next N" directly, which (d) needs. On likelihood alone it
  takes the most likely lines first, as the script does. The checklist (§5.62) keeps d'Hondt
  unchanged.
- **Gaps**: replies the scope doesn't cover, played at least 8% of the time at a position the
  scope reaches (the checklist's rule), ordered by reach. Each one opens the chapter at the
  position, so a reply can be added.

**(c) The Prioritize panel** (`src/app/priority.ts`, `src/ui/Priority.tsx`), opened by a
"Prioritize…" button on the line list for the study or the chapter in view.
- **Settings**: ratings and speeds (from the explorer settings); the number of lines to keep (a
  slider, with the share of the scope's covered games that the kept lines reach, live: "25 lines
  · 82% of your games here"); Keep lines already learned (on; lines with every move taught or
  reviewed stay active and don't use the number); Natural moves count less (on).
- **The table**: the rank, the line (its name and its moves from where it branches, as in the
  line list), its reach, its hard moves (own moves with `p` < 0.3), its state, and whether
  Apply pauses it. Below the table come the gaps.
- **Scoring**: the explorer goes through the worker, its limiter and its IndexedDB cache
  (§5.22), with a count and an estimate ("Scoring: 214/380 positions, about 4 min") and Stop. A
  second run comes from the cache. Without the Lichess login the panel says the explorer needs
  it.
- **Apply** writes one `line` event per line whose mark changes, and nothing for the rest. About
  400 lines of the owner's size make about 50 KB, once, in the day's file. "Unpause all" on the
  line list undoes it.

**(d) Add the next N**
- Shown on the line list of a scope that has paused lines: "Add the next 10 by priority". It
  re-ranks from the cache, with the active lines counted as taken, and unpauses the top N paused
  lines. The ranking is computed again each time rather than stored, so a study edited since
  ranks as it is now.
- When a scope's active lines have no new move left and some lines are paused, the home screen
  and the line list say so: "No new lines · 140 paused · Add the next 10".

Tests:
- `test/unit/core/train/paused.test.ts`: a mark covers its line and the line's later extension
  but not a branch added earlier along it; a card shared with an active line (another chapter, a
  transposition, another study) stays active; with marks from two devices interleaved, the last
  wins; orphaned marks are counted. Queue and plan: a paused line gives no new or known line; a
  held card is never due and comes back overdue when unpaused. Over 150 random repertoires with
  random marks, no held card is asked or taught and every due card is still asked once.
- `test/unit/core/repertoire/priority.test.ts` on hand-built chapters and a fake explorer: reach
  products renormalized over the covered replies; the floor; one position's shares the same
  through a transposition; a conflict; a FEN chapter; the greedy order, with shared prefixes
  counted once; the discount for natural moves, and Maia filling a thin explorer; must-learn
  first; learned lines kept; the gaps; the same ranking twice.
- `test/e2e/priority.spec.ts` (desktop and phone): pausing from the line list (the symbol, the
  counts, a paused line practised with nothing recorded); Prioritize with the fake explorer; the
  table; Apply; Add the next 10; the marks synced.

Live (TESTING.md): (desktop) Prioritize on a real study with the Lichess login, the order read
beside `prioritize_repertoire.py`'s for the same study; (phone) the paused lines and the queue's
counts after a sync.

Not planned, and why: the owner's own games as a signal (they learn a repertoire before playing
it; the games are read for §5.58 already, so this can be a weight later); engine sharpness (a
Stockfish search per position); a chapter imported with Qchess's `[QchessTrain "false"]` arriving
paused instead of in a reference study (a possible follow-up, which would change §4.10).

**As built, (a)** (2026-10-07): `lineCard`/`parseLineCard` (`src/core/progress/cards.ts`), the
`line` event (`mark`: `paused`, `must` or `none`), and `src/core/train/paused.ts`: `lineMarksOf`
(the last mark of each line card, `none` kept), `markLines` (new line objects carrying `paused` or
`must`, the longest covering mark deciding, so a `none` on one extension beats a shorter paused
mark; the marks covering no line returned as orphans) and `heldCards`. The app marks the index
as it loads the training data (`src/app/train.ts`), so the queue (`pausedLines`, held cards
left out), the planner (paused lines never walked), the line list (`paused` rows outside the
chapter's count, Learn skipping them) and the storm (`scopeData` leaves paused lines out, and the
stored positions of the whole repertoire are filtered by their lines once any line is paused) all
read the flag. A paused line picked from the list is practised with `record` off: its moves
are asked, and a move never learned is shown first, as a new move is (nothing is recorded,
`taught` included). "Next line" after a picked line skips paused lines. The line list: ⏸ (two bars)
for the dot, "Paused", ★ for must-learn, a ⋯ button per line (and a right-click) with Pause or
Unpause and Must learn or Not must-learn, and a ⋯ per chapter with Pause all lines (must-learn
lines kept) and Unpause all lines. `IdbStore.recordMany` and `recordEvents` write a batch in one
transaction with one refresh. The home card reads "Train: 1 due · 1 new · 2 paused"; the debug
panel counts paused lines and orphaned marks. Tests: `test/unit/core/train/paused.test.ts` (the
event, a mark covering the extended line but not an earlier branch, the longest mark deciding,
orphans, the last event across two devices, a card shared with another study's active line,
queue, plan and list, and 150 random repertoires with random marks: no held card asked or
taught, every due card asked once) and `test/e2e/priority.spec.ts` (desktop and phone: a line
paused, practised with nothing recorded, unpaused; a chapter paused and unpaused; the home's
count).

**As built, (b)–(d)** (2026-10-07): `src/core/repertoire/priority.ts` (`rankLines`, `keptLines`,
`coverageOf`). Every position of the scope's lines is looked up once (its first FEN; the explorer
ignores the move counters), with progress. Two choices made in the build: **Maia fills a thin
explorer for the reach too**, not only for natural moves (deep in a line the explorer has a handful
of games, and Maia's guess beats a split by noise); and **gaps are reported only where the scope
answers some reply**, since at a line's end every reply is uncovered by design (the script reports
those when its depth cut stops a line). A covered reply nobody knows gets the floor, so with no data
at all the covered replies share equally. The greedy order recomputes a value only when its stale
upper bound could still win (values only fall as moves are taken). `src/app/priority.ts`: the
explorer through the worker's `practiceGames` (its limiter and cache), at the panel's ratings and
speeds (this device's, the checklist's by default), Maia's policy where the explorer has under 20
games and Maia is on, a stop that ends the run at the next lookup, Apply (`applyChanges`: kept lines
unpaused, the rest paused, must-learn lines left alone, only changed marks recorded) and `addNext`
(each side of the study ranked with the active lines taken first, the paused lines merged by value,
the best ten unpaused). `src/ui/Priority.tsx`: the panel (scope: the whole study or the chapter;
the side when the study has both; the filters; Natural moves count less; Rank, with progress, an
estimate and Stop; the slider with the coverage; Keep lines already learned; Apply: pause n,
unpause m; the table, each line opening its training; the replies not answered, each opening the
chapter at the position). The line list has a bar on a study's list (Prioritize…, and while lines
are paused their count, "No new lines" when the active ones have nothing new, and Add the next 10)
and Prioritize… in each chapter's menu; the home card says "No new lines · N paused" when that is
why nothing new comes. Tests: `test/unit/core/repertoire/priority.test.ts` (reach renormalized, the
floor and no data, natural moves reordering lines, learned and shared moves, lines taken first, kept
lines and coverage, a transposition's shares and its gap, a conflict, FEN chapters hung or on their
own, Maia filling in, one lookup per position, the same ranking twice) and
`test/e2e/priority.spec.ts` (desktop and phone: ranked from the fake explorer, the gap, two lines
kept at 82%, Apply pausing the third, Add the next 10 unpausing it, the events synced).

#### 5.71 The storm reworked after the owner's first test (2026-10-08)

The owner's report, measured against lichessable (`b435906`): every position of a storm seemed to
come from one game or one line end; a move played was taken back at once; an arrow drawn went at
release; Analyse lost the storm; the screens felt low effort. What was found, and built:

- **One line end dealt in a row** had two causes. `drawOrder` sorted on the raw game count, and
  every position of one walk shares its frontier's exact count, so the most-played line end's
  positions all came first; lichessable sorts on a bucket (`stormReachBucket`, §14.19: an order of
  magnitude, unknown at the top), so the random term mixes line ends of the same order. And the
  port had none of lichessable's spread (§30, §30a, §30b). Now `reachBucket` and `takeSpread`
  (`core/storm/store.ts`): a card is taken from a line end neither dealt this session nor among
  the last 24 dealt (`recentLines`, kept per device in `repworks-storm-recent`), else from one not
  dealt this session, else the head; never withheld, an empty key never blocking. A set's six are
  picked the same way. A position's line is its first line (`positionLineKey`, `sid/cid/path`); a
  puzzle's is its anchor (`ReadyPuzzle.anchor`, kept from now on). The deepening pass takes the
  kept positions at random, since deepened ones are dealt first among equals (§23.8).
- **The gather is breadth-first**: one game at every line end first, then each line end's other
  games (`harvestFrontier`'s `skip`), so a gather stopped early has positions from every line end
  it reached rather than four games' worth from a few. The home says how many line ends the ready
  positions come from, and asks for more gathering when they are few.
- **The move stays on the board** through the grade and the verdict (`StormItem.played`); a held
  set card keeps it until Try again. The verdict waits 1.2 s after a scoring move and 2.6 s after
  any other (§18.1), with a bar for it; Next (Space) goes on at once, Pause (P) keeps the position
  for as long as wanted (the clock is stopped then anyway).
- **Arrows drawn on a card stay** until the next card or a left click: the board keeps them itself (`Board`'s
  `sketchKey`), since the clock's re-render every 200 ms set them back to none. On a touch screen
  ✎ draws, as in the study.
- **Analyse keeps the storm.** It opens the analysis board (engine, explorer, Add to a chapter)
  with the session kept (`suspendStorm`): from the position before the move that reached the card,
  that move and the one played as its line, shown at the card, from the user's side (`#/analysis`
  gains `line`, `show`, `side` and `back`). "← Back to the storm" (or the browser's Back) returns to
  the review at the same position, or to the set where it was; anywhere else ends the session. From
  a held set card it shows the move first (lichessable §18.4: it counts as shown). During a timed
  card it passes the card (§5.112; was: not during one).
- **The screens**: a card has a head (clock, points, the streak's bar to its next multiplier), a
  mark per answer so far, where the card is (the chapter and the line's last moves, "…6. Be2 e5
  7. Nb3", since a chapter holds many lines), and one status block (the band's word in its colour,
  the points, the verdict line, the best line). On a narrow screen the head sits above the board.
  The review opens on the session's result (points or the set's tally, found, the average given
  up, the bands), steps through the positions with ‹ › (and ← → ↑ ↓), shows the position before
  the move with the best (green) and the played (red) arrows, and lists every position with its
  line. The home puts the count and Start first, then Positions (Gather, its progress, the settings
  folded), then Puzzles and the record. Keys are shown where there is a keyboard.

Tests: `store.test.ts` (the bucket; the spread's three tiers, an empty key, the head; the window),
`harvest.test.ts` (line keys and labels; the second pass), `fsm.test.ts` (the analysis address),
`storm.spec.ts` (desktop and phone: an arrow kept through the clock's ticks and gone at the next
card, the move on the board through the verdict, Pause, three cards from three line ends, Analyse
and back by the button and by Back, a held set card analysed and back, two exports a line end).
Controls: each named in the test files' headers; the two e2e ones (the board set back to the
card's position; the sketch removed) fail the storm test.

Live: TESTING.md.

#### 5.72 Clear the gathered positions (the owner's request, 2026-10-08)

The storm home's Positions card has "Clear positions…" once any are kept in the scope picked.
The first press says what goes (all of them for the whole repertoire, else the study's or the
chapter's: the positions whose lines are in the scope, `storedInScope`) and what stays: the
answers, which are progress events, and so the record and "done for now" when the same positions
are gathered again. The second press ("Clear n positions") removes them from `repworks-storm`
(`clearGathered`, `app/storm.ts`), stops Stockfish's re-scoring, and forgets the last gather's
status. Disabled while a gather runs. Puzzles are untouched.

Tests: `storm.spec.ts` (desktop and phone: Cancel keeps them; Clear empties the home, Start
disabled, still empty after a reload).

Live: TESTING.md.

#### 5.73 Only the first answer counts; the review's list beside the board (the owner's request, 2026-10-08)

A set card tried again (held, then Try again) or answered again in the second pass wrote its new
answer over the first in the session's history, so the review showed the last try's grade and its
"n of m found" and average given up counted it, though the tally, the record and the progress
events already took the first answer only. Now `settle` keeps the first answer as the history
entry's `answer` and puts later ones in `later` (`showMove` keeps it too); the card says which
answer counts once it is tried again, and the review shows the later ones under the verdict, "not
counted". The review's own Try again was already apart (`retry`, nothing scored).

The review's list of positions moved from under the board into the panel beside it, after the
actions: one compact row per position (number, move, band, share of the game given up, best),
filling the board's height and scrolling itself (`contain: size`), so it is in view without
scrolling the page. The chapter and line are behind "Show lines" (remembered on the device in
`repworks-storm-review-lines`) and in each row's tooltip; the position picked shows its line above
the verdict anyway. On a narrow screen it follows the actions under the board.

Tests: `storm.spec.ts` (desktop and phone: the counted answer shown after Try again; the first
answer kept on the row after a Great in the second pass, the later ones not counted, 5 of 6 found;
the lines toggle; on the desktop the list beside the board).

Live: TESTING.md.

#### 5.74 Save as a sequence anywhere; save a storm position as a mistake (the owner's request, 2026-10-08)

- **Save as a sequence** is on every analysis board now, not only one opened by "Make a sequence"
  (disabled while the board has no moves). The drill starts where the board's side (its
  Orientation) is to move; a board that starts one move earlier, as the storm's does (the move
  that led to the position), starts after that move when it is the only one, else the dialog
  says the sequence must start with the user's move. The Stockfish check and the dedup are
  §5.56's; a sequence not made from a mistake card drops nothing, and its dialog closes back to
  the board ("Close") or goes to the games.
- **Save as a mistake** in the storm, on a card's verdict (and a set's held card) and on every
  position of the review, answered well, badly or not at all: a game card (`saved` event,
  `stormMistakeItem` in `src/core/games/saved.ts`, `_storm_<ms>` its game id, `from` the storm
  card) at the position, drilled like a practice mistake. The move played goes with it when it
  gave up more than 2 points (the practice rule); otherwise it has none (`san` and `uci` ''), and
  the drill asks "Find the best move". A puzzle saves its starting position, with no move.
  Deduplicated by the position and the move (or none). Nothing in the storm is scored by it.

Tests: `saved.test.ts` (the item, with and without its move, read back through JSON);
`analysis.spec.ts` (a sequence from a plain board, then "already saved"); `storm.spec.ts` (the
sequence from the storm's board starting at the user's move; the mistake and the great answer
saved, in the log).

#### 5.75 Stockfish 19 as an option (the owner's request, 2026-10-08)

§5.29 kept Stockfish 18 (proven on the owner's phone in mistake-lab) and noted npm
`stockfish@19.0.0` as a possible swap. The owner asked for 19 as an additional option, so 18 stays
the default and 19 is chosen per device:
- `vendor/stockfish/stockfish-19-lite-single.{js,wasm}` and `stockfish-19-lite.{js,wasm}` (the
  threaded build), from npm `stockfish@19.0.0` unchanged (sha256 in the README). Its lite builds
  carry the small net `nn-61e7af4bb97d` (1.8 MB single, 1.6 MB threaded, against 18's 7.3 MB); the
  worker finds its wasm from the hash of its URL as 18's does (the same loader code).
- Engine settings: a **Version** choice (Stockfish 18 / Stockfish 19), stored with the device's
  other engine settings (`version` in `repworks-engine`; anything else read as 18). A change ends
  the worker; the next position starts the chosen build, downloaded on first use like the others.
  It applies with the threads too (SF19 ×2 on an isolated page). The bar reads SF18 or SF19.
- The other engine client (`app/stormEngine.ts`: the storm, practice games, the game reviews and
  sequences) starts with the device's version; one already running keeps its build until it ends.
- The debug panel and the engine settings' file list have "Stockfish 19" and "Stockfish 19
  threads", with Download and Delete.

Checked in this container: the build under Node (`uci`, `stop` ends `go infinite` and the next
search runs, mate in one at once).

Tests: `stockfish.test.ts` runs every case on both versions under Node; `stockfish.spec.ts`
checks both built workers in Chromium (mate in one, `stop`, the next search); `version.spec.ts`
(desktop and phone: 19 chosen, only its build downloaded, searching, kept after a reload);
`threads.spec.ts` (19 with two threads on the isolated page).

Live: TESTING.md.

#### 5.76 A new chapter from a FEN or from PGN (the owner's request, 2026-10-08)

The New chapter dialog (§5.15) has a **Start** choice: Empty (as before), From FEN, From PGN.
- **From FEN**: a FEN box; the chapter starts there (`[FEN]`, `[SetUp "1"]`; the start position
  is written as an empty chapter). A FEN that isn't a legal position is refused in the dialog,
  which stays open.
- **From PGN**: a file picker, which reads the file into a PGN box, and the box itself to paste
  into or edit. Each game becomes a chapter, as Lichess's dialog makes them, in the order of the
  text, and the first opens. With one game the typed name wins; otherwise each is named as the
  import names it (`ChapterName`, `Event`, the players), and a game with none takes the study's
  next "Chapter N". Every chapter is for the side chosen in the dialog. The game's headers are
  kept, with `StudyName` set and, where missing, the `Event` and `Result` an empty chapter has. A
  game that can't be read (another variant, a bad start position) refuses the whole text, so
  nothing is left out unseen; the parser's notes (an illegal move cut, a merged duplicate) show
  in the feedback line under the board.
- Core: `chaptersFromPgn` in `core/import/plan.ts`, sharing the import's reading and `prepare`;
  `addChapter(name, side, start)` in `app/editor.ts` writes every new chapter and study.json in
  one change.

Tests: `plan.test.ts` (one game, bare movetext, several games, a start FEN with an illegal move,
an unreadable game, the headers written); `studies.spec.ts` (desktop and phone: a bad FEN
refused then a good one, two pasted games, a file with the typed name, each checked in the fake
data repo).

Live: TESTING.md.

#### 5.77 The owner's notes of 2026-10-08: repetitions, mistakes asked again, Copy FEN, the explorer without games, Maia's columns, the analysis board's side, ←

Nine requests, each built as asked; the owner's words where they set a detail.

**Training** (the trainer's options, `core/train/trainer.ts`; the settings per device, in the
training settings' "This device"):
- **Repetitions** ("the user has to go through the variation twice before they move onto the
  next one"): a line on which a move was taught is walked again, `repetitions` times in all
  (default 2, 1 to 5), before the next line. The later passes start as a line does (§5.17's "A line
  starts", with the first move taught in place of the first move needed, so the moves before it
  go as they went), and ask the moves taught on it with no arrow (`askAgain`); nothing is graded or taught
  twice (a card is graded once a session), so their answers are practice, sent as `answer` with
  `repeat`. The counters say "2 of 2 times", the feedback line "The line again: 2 of 2". Not in show
  and grade (a move shown can't be found again), nor in retry, drill, the pins or the Interactive
  view.
- **Mistakes asked again at the line's end** ("each mistake should be answered correctly twice in
  a row before you can move on"): at the end of a walk (a pass), every own move asked on it and
  not answered right first time (a wrong move or Hint; an alternative is free) is asked again,
  from the opponent's move before it, until right `retryMistakes` times in a row (default 2, 0 to
  5; 0: not asked again); the mistakes take turns, and a miss starts a mistake's streak again. Then
  the board goes back to the line's end, and the line's next pass or the next line follows. Graded
  once, as before: the retries are practice. Moves taught are not mistakes (repetitions bring them
  back). The feedback line: "Your 2 mistakes again: each right 2 times in a row", then at each
  "Your mistake again: 1 of 2 right in a row"; the counters "mistakes left 1". Not in show and
  grade, retry, drill, the pins or the Interactive view.
- **A drill's misses come back** ("the failed mistakes should be repeated until you get everything
  correct"): in retry, drill and the pins (`repeatMissed`), a move answered wrong has its line
  walked again after the others ("Missed earlier: once more"), as often as it is missed. The
  session's numbers and a pin's `drill` event count the first answer only.
- Existing e2e specs about other things set Repetitions 1 and no retries (`test/e2e/prefs.ts`
  `walkOnce`), so their walks stay as written.

**Study and analysis**:
- **Copy FEN**: under the study's board, a row with the FEN of the position shown (read-only,
  selected on a tap) and "Copy FEN" (since §5.87, "Copy FEN" in the ☰ menu instead); on the analysis board, "Copy FEN" beside Set up and New (the
  position shown, not the board's start); and "Copy FEN" in every move's menu (the start's too).
- **No games here**: the table already had ChessDB's moves (novelties) and Maia's top four as
  rows where Lichess has no games; "No games here." showed when neither had answered yet, when
  ChessDB doesn't know the position, or when Maia's columns had gone (below). Now the note says
  which: "No games here: ChessDB's and Maia's moves." above their rows, "No games here: asking
  ChessDB and Maia…" while they are asked, "No games here, and ChessDB doesn't know this position."
  when nothing has any (Checkmate or Stalemate where it is one).
- **Maia's columns disappearing**: Maia's worker ends after 90 s unused (its memory freed, §5.32),
  and its state then went to `off`, so the explorer hid the columns, and as it asks Maia only while
  they show, nothing ever started it again: switching Maia off and on was the only way back. The
  state is `idle` now: the columns stay (with what Maia said kept for the session), and the next
  position's ask starts the worker again. The switch carries `data-state`.
- **The analysis board keeps the side it was opened from**: Analyse from here (the chapter's
  side), the games' and the game cards' Analyse and Make a sequence (the player's), the practice
  review's (the side played), the repertoire check's (yours), as the storm's already did. Practise
  from the analysis board plays the side it is seen from. A FEN set up, and New, still turn the
  board to the side to move (a pasted FEN has no side).
- **←** ("always lead back to where you came from"): each history entry is stamped with its place
  among the tab's entries of the app and a key of its own, and the tab keeps the page each place
  shows (`pageOf` in `core/app/fsm.ts`: a study's chapters are one page, and so are training's
  sessions and lines, the storm's scopes, the analysis board's positions). The ← on every screen
  (`ui/Back.tsx`) goes back past the page's own entries to the page it was opened from, as the
  browser's back does; a page opened from outside the app (a link, a bookmark, a new tab) goes up
  to its parent as before. In a live storm ← still ends the session, and in its review goes to the
  storm's page, first. Work under way is kept for the entry it was started on, so ← back finds it:
  the storm's session (kept for any page now, not only the analysis board, while its clock is
  stopped; its verdict waits), a practice game (over: its review as it was; in play: played on,
  the opponent's move asked again) and the game cards' session (← on its own screen still ends it).
  The ← is a filled button now.

Tests: `trainer.test.ts` (repetitions: two passes, the moves asked with no arrow and nothing
recorded twice, the pass starting at its first move; once by default, three, not on a line with
nothing taught, not in show and grade; mistakes: asked again from the opponent's move until right
twice in a row, a miss starting the streak again, taking turns, a hint, a practice ask, off, show
and grade; after a second pass; a drill's misses asked again until right; the random repertoires
under repetitions and retries), `timeTravel.test.ts` (the settings and each session kind's
options), `fsm.test.ts` (`pageOf`); Playwright, desktop and phone: `repetitions.spec.ts` (a mistake
asked again until right twice, a miss starting it again, a new line walked twice, the events
recorded once; a drill's miss asked again; Repetitions 1), `views.spec.ts` and `editor.spec.ts`
(Copy FEN), `explorer.spec.ts` (no games: ChessDB's rows and the notes), `maia.spec.ts` (the
columns kept when the worker ends, Maia started again by the next position, its four moves the
rows where there are no games; the test fails on the old code), `analysis.spec.ts` (the chapter's
side kept, Practise as it), `back.spec.ts` (back past a study's chapters, past training's lines, up
to the parent from outside the app; the button filled), `practice.spec.ts` (Analyse from the review
and back to it), `storm.spec.ts` (analysis board, practice, ← twice, the session still there).

Live: TESTING.md.

#### 5.78 The owner's notes of 2026-10-09 on training: every move asked, the arrows at the end, Read in a session

Three requests, built as asked.

- **"From the start, asked" asks every own move, on every pass** ("all moves should have to be
  played (no auto-play). Even on the repetitions"). Before, `ask` asked only the line's prefix;
  after the first move needed the auto-play mode decided, and on a later pass the moves answered
  on the first were played for the user, so a repetition could be almost all auto-played. Now
  with `lineStart: 'ask'` every own move of the line is asked, on every pass, whatever the
  auto-play mode (`kindOf`); only a suspended move ("Always play this for me") is still played.
  Grading is unchanged: only due moves are graded, once a session; the rest is practice. It holds
  for the queue's setting too ("A line starts in the day's queue"), where `ask` means the same.
- **The study's arrows at a line's end.** When a line is done (`lineDone`, or the session's end
  with the board kept), the board draws the last move's arrows and circles from the study (its
  `%cal`/`%csl`) beside the trainer's own arrow. Not before the end: an arrow on a move's node
  could give the next move away, as its comments could while asked.
- **Read in a session.** "Read" in the training screen's actions (and beside "Again" at a session's
  end) opens the Read view's body (`LineReader`, shared with `ReadView`, §5.10) in place of the
  session: the line on the board, its whole length, from the move on the board; ← → Home End and
  the move list step through it, with each move's comments, glyphs and arrows, and a comment's
  line on the board as in the Read view. The session waits meanwhile: a move due to be played for
  the user is held (`readingAt`, the tick kept until the reading ends) and the board takes no
  moves. "Back to training" or Escape takes the session up where it was.

Tests: `trainer.test.ts` (from the start, asked: every own move asked on both passes under each
auto-play mode, only the taught move recorded; the earlier `ask` case unchanged); Playwright,
desktop and phone: `repetitions.spec.ts` (a picked line with "From the start, asked" and two
passes: every own move asked on the second pass, the suspended move still played; the study's
arrow of the last move absent while asked and drawn at the end; Read mid-session and at the end,
stepped by keys and buttons, a comment shown, Escape and "Back to training" back to the session).

Live: TESTING.md.

#### 5.79 The board's size, adjustable and the same on every page (the owner's request, 2026-10-09)

"Let's make the size of the board adjustable. Make this size consistent between all pages
(study/train/practice)." Built as asked.

- **Dragged from the board's corner**, as on Lichess: a grip just outside its bottom-right corner
  (a bigger one on a touch screen). Once focused, the arrow keys grow or shrink it by 20 px; a
  double click gives back the default. The grip is on the boards a page is built around: the
  chapter view's (and the analysis board's), and every board in the training layout
  (`.train-grid`: training, Read, practice and its review, game cards, the storm, the checklist).
- **One size for all of them**: a side in CSS pixels (`src/app/boardSize.ts`), set on the
  document's root as `--board-size`; each of those boards is as large as its page fits, up to it.
  What is stored at a drag's end is the side shown, so a drag past the room a page has doesn't
  grow the board on a roomier page. Kept per device in localStorage (`repworks-board-size`), not
  synced: a phone's and a desktop's want different sizes.
- **The default is the same on every page too: as large as fits.** Before, the chapter view
  filled the window's height while training and practice stopped at 640 px and fitted a little
  differently (`100dvh − 200px`); now the training layout fits as the chapter view does
  (`100dvh − 240px`, and its width less the panel's least and the line list's). On a 1440×900
  window that is 660 px everywhere (the study's was 661, training's 640); on 1920×1080, 840.

#### 5.80 A storm move judged at depth 20 (the owner's request, 2026-10-10)

The owner: depth 14 is not enough to judge a move. The walk still scores its positions at depth 14
(MultiPV 6) on a ChessDB miss, since it searches every ply it walks and only picks positions; the
deepening (§23: MultiPV 12, depth 20) replaces those lists in the background. What changed is the
grade: a stored Stockfish list below depth 20 grades nothing, neither from the list nor as one
search against its score; the move goes to the two searches (the card's position and the one
after the move, MultiPV 1), each to depth 20 on every device (the phone was 18), at most 8 s
each, the verdict showing the depth reached. Tests: none new (the grade lives in `src/app`);
the phone's time to depth 20 is for the owner's live test.

#### 5.81 A set's cards deepened while the user thinks (the owner's request, 2026-10-10)

A set knows its six cards when it starts, so the storm's Stockfish deepens those still below the
standard (MultiPV 12 at depth 20, §23) while a move is awaited: the card on the board first, then
those still to come, then the second pass's; each is stored as deepened, as the home's deepening
would, and takes the dealt card's place in the session. A move on a deepened card is graded at
once from its list (§5.80); a move stops the look-ahead's search, so the grade's searches never
wait behind it, and it starts again with the verdict and with each deal (the card stopped
mid-search is tried again). Each card is tried once a session; the storm (timed) is not looked
ahead, its next card being drawn only when dealt. Cards in a session now match by their id, not
the object, since a deepened card replaces the one dealt. Tests: none new (`src/app`, a real
engine); the live check is the owner's.
#### 5.82 Maia in the storm: a difficulty for each position, and the unintuitive storm (the owner's request, 2026-10-10)

The owner: Maia could estimate a difficulty for each position, and a storm could deal only the
positions where Maia's most likely move is a mistake, without slowing the storm down.

- **Measured** (onnxruntime-web under Node in a cloud container, the vendored model, 20 fixture
  positions): one position at one rating ~170 ms; batching ratings barely helps there (5 ratings
  ~1.0 s, 11 ~1.7 s). In headless Chromium in the same container, 14 gathered positions at six
  ratings took 16 s including the model's load. Stockfish's deepening takes up to a minute a
  position, so Maia is cheap beside it, but not cheap enough to run while a card waits.
- **So Maia never runs during a card.** While the storm's home is open (beside a gather and the
  deepening: Maia's worker is a thread of its own), Maia's policy is asked for each kept position
  not done, at 1000, 1400, 1800, 2200 and 2600 and at the user's Maia rating (the engine settings'
  rating, or the explorer filter's), in one batch, and kept with the position (`maia`: the moves
  of 0.5% and up, to three decimals). A session start stops it. Only once Maia's files are on the
  device; the explorer's Maia switch can stay off. Without them, the home offers "Get Maia…" (the
  existing dialog). A setting turns it off ("Maia rates the positions' difficulty while this page
  is open").
- **Everything else is worked out from the kept policy and the position's list**
  (`core/storm/maia.ts`), so a list deepened later re-judges it with no new Maia run. A move is
  judged as the grade would (the list's best against it, the five bands), by a list that may
  judge (§5.80: ChessDB's, or Stockfish's at depth 20; the walk's depth-14 list judges nothing).
  A move outside Stockfish's list is no better than its last line; outside ChessDB's, unknown.
- **The difficulty** is the rating at which Maia finds a good move (great or good: what the storm
  counts as found) half the time: Maia's likelihood on good moves over its likelihood on the moves
  the list can judge (at least 60% of it, or no share), at each ladder rating, crossing one half
  going up, straight between two ratings, to the nearest 50; "1000 or less" and "over 2600" at the
  ends. Shown once a card is answered (with the best move: never before the move, and in a set's
  held card only once the move is shown), with how often Maia at the user's rating finds a good
  move and its likeliest move with the list's word for it; in the review with the best move, and
  in each row's title.
- **The unintuitive storm**: a timed storm of the positions whose likeliest move for Maia at the
  user's rating is judged and isn't a good one (an inaccuracy or worse: it would not count as
  found), no puzzles. "Unintuitive storm" beside Start storm and Set of 6 once Maia is here, with
  the count beside the positions ready. Its answers are ordinary `storm` events (no new field, so
  the record is unchanged and old devices read them).

Tests: `test/unit/core/storm/maia.test.ts` (a move judged, the lower bound, nothing below depth
20; Maia's share; the difficulty and its ends; unintuitive; the policy as kept; the ratings
wanted; a deepened list keeping Maia's; the verdict's line), with three controls in its header;
`stormStore.test.ts` (two writers of different fields of a position both kept); `storm.spec.ts`
(desktop and phone, the real model: Get Maia from the storm's page with the switch off, every
kept position rated at the six ratings, the unintuitive count checked against the test's own
reading of Maia and the fake ChessDB, the unintuitive storm dealing one of them, Maia's move
graded below good with Maia's line, the review's rows and its line behind Best move).

#### 5.83 "Train" from the study selects the line shown (the owner's request, 2026-10-10)

> I've noticed that going from a specific variation/position in Study page to Train page doesn't
> land on the correct variation. Most often, it starts the review queue of the first chapter. If
> possible, I want the variation I was browsing to be selected when entering train page. It
> shouldn't start a review automatically by clicking "Train". If there are multiple branches, the
> topmost branch can be selected.

Replaces §5.15's "from the chapter view, training starts" for a repertoire study:
- **"Train" in a repertoire study's chapter view opens the training screen with the line through
  the move shown selected**, waiting (`#/train/<sid>/<cid>?at=…&pick`): the line highlighted in
  the list, the board at the move shown, the line named, and "Train this line" (the line picked as
  from the list, §5.16) or "Today's queue" (the study's). Nothing starts by itself. At a fork the
  topmost line through the move (the list's order, main line first); at the chapter's start, its
  first line; a move on no line (cut where an illegal move stood), the line sharing most of it.
- **A session left for the study is taken up again only while the move shown is on the line it
  left** (or on that line as since extended in the study, §5.15's edit-and-return): one path leads
  on to the other. Browsed elsewhere, "Train" selects the line shown instead; the left session is
  dropped when the next session starts.
- A reference study's "Train" and a session left from the Interactive view still play from the
  move shown (§5.10).

Tests: `browse.test.ts` (the line through a move: before a fork, at the start, on a branch, on no
line), `fsm.test.ts` (the pick address), `studies.spec.ts` (desktop and phone: both branches of a
fork selected from the study, nothing asked until "Train this line", a left session not taken up
from another line).

#### 5.84 Stockfish alone judges a storm move, deeper, while the user thinks (the owner's request, 2026-10-10)

The owner asked whether ChessDB's evaluations were used only where it had analysed the position
well. They were not: a move in ChessDB's list was graded from it whatever its quality, and a move
outside it from one more ChessDB lookup. ChessDB's `queryall` gives no depth (checked live: each
move has `score`, `rank`, `note`, `winrate`; the note's `!`/`*`/`?` follows the rank, so 1…Nf6
against 1.e4 is a `?`), so a shallow ChessDB score can't be told from a deep one. The owner chose
Stockfish alone (lichessable came to the same conclusion), and asked for the deep search to run
while the user thinks, deeper than 20, since a position takes 15–20 s or more:

- **A move is graded by Stockfish only.** The stored list grades it when it is Stockfish's at
  `judgeDepth` (20) or deeper; a move outside such a list, by one search of the position after
  it against the list's best (§23); otherwise, two searches at depth 20 (MultiPV 1, 8 s each at
  most), as §5.80's fallback. ChessDB's list never grades, and the child lookup is gone; the
  verdict's provenance names Stockfish's tiers only (the italic "estimate" style went with them).
  ChessDB still finds and pre-scores positions in the gather, where the walk only picks them.
- **The deepened standard is MultiPV 12 at depth 24 on a desktop, 22 on a phone**
  (`deepenDepth`), up from 20. The home's deepening aims for it, those whose list can't judge
  yet (ChessDB's, the walk's) first; a list of 20 or more is kept even when the search stops
  short of the target (time, a move), and only a deeper list replaces a Stockfish one. The home
  counts the positions at the device's target ("scored to depth 24").
- **The look-ahead runs in every session, the timed storm too**: the card on the board first
  (whatever its list: ChessDB's now counts as not deepened), then the cards still to come. A move
  stops it; if its search of that card has reached depth 20 (its shallowest line's), that list is
  kept and grades the move at once, else the grade's own searches run.
- **The storm's Stockfish uses the device's threads** (§5.36) as well as its version (§5.75); it
  ran on one thread before.

A timed storm on a card no search has reached costs the two searches (about a second or two on a
desktop at depth 20; longer on a phone, at most 8 s each). The owner's live check is how often
that happens and how it feels. Tests: `harvest.test.ts` (ChessDB never judges; the target per
device; only a deeper list replaces), `maia.test.ts` (ChessDB's list judges nothing, with a
control), `verdict.test.ts` (Stockfish's tiers only), `set.test.ts` (the depths' order);
`storm.spec.ts` (desktop and phone) with a fake engine that scores positions as the fake ChessDB
does and the position after a move as that move's rung: the deepening at 24/22 then a move
graded with no search, the look-ahead searching the card on the board and its list grading the
move, and the Maia storm over deepened lists.

#### 5.85 A set's Try again stays until the top move (the owner's request, 2026-10-10)

A held set card tried again and found with a good move (Great or Good, but not the top move)
ended the tries: the verdict, the best shown, Next. Now a card found on a retry, or in the second
pass, with anything but the top move keeps Try again (`t`, secondary beside Next) and Show the move
(`s`), the best hidden until shown, with no limit on the tries. The top move is the list's first
(rank 1), the engine's best SAN, or no loss at all; a puzzle's is solving it. Those further tries
are practice: the outcome (found on a retry) and the counted first answer stay, each try kept in
`later`; a worse one says so and keeps Try again and Next. Show the move there only shows it.
The first answer of a set's first pass is as before (a clean one resolves, no Try again), and the
timed storm has no Try again.

Tests: `storm.spec.ts` (desktop and phone: a Mistake, Try again, the second-ranked move graded
Great with Try again and no best; a Mistake as practice keeping it; the top move ending it, the
best shown, the Mistake still counted).

Live: TESTING.md.

#### 5.86 Themes, and the themes side by side (the owner's request, 2026-10-10)

To try other looks for the app quickly. As built:
- **Tokens** (`src/ui/themes.css`): app.css takes every colour, its fonts and its two radii from
  variables. The only colours it still writes are marked `/* fixed */`: the chess sides (side
  tags, result and eval bars), the arrows' brushes, Lichess's promotion squares, the QR code,
  the storm's bands and the games' eval graph. Overlays and borders are `rgb(var(--ink) / n%)`,
  so a light theme flips them with one value. `test/unit/ui/themes.test.ts` fails on a new
  colour written in app.css, a variable read and never declared, or a theme setting a token
  Forest doesn't have.
- **Themes**: Forest (the look until now, unchanged but for two near-identical text greys merged),
  Slate (Lichess-like neutral dark, blue), Walnut (warm browns, amber), Midnight (black, high
  contrast, flat blue-grey board) and Paper (light, flat green board). A theme is one block of
  variables; Forest's are the fallback for any it leaves out (the light theme sets them all).
- **Mist, Grove, Fjord** (the owner's picks from a design canvas of directions, 2026-10-10): Mist
  (soft slate, a sage accent, grey-green board), Grove (Forest tuned: a leaf-green current move
  with dark text, since Forest's white on #319a28 is about 3.6:1, and the green tournament
  board) and Fjord (dark petrol teal, a sand current move, sea-grey board). Each sets every
  token, all text pairs at WCAG AA or better; all three draw the flat board, and the unit test
  fails on a theme with board colours missing from the flat-board rule.
- **The choice** is per device, in localStorage (`repworks-theme`), from "Settings and debug";
  `index.html` sets it before the first paint, and the phone's bar colour and `color-scheme`
  follow it.
- **Side by side**: `styles.html` (linked from the settings) shows the real app in a frame per
  theme, at a phone's size or a desktop's scaled to fit, with screen buttons above. The frames
  follow each other: a screen opened or a move stepped to in one is shown in all (the frames'
  addresses are polled, since stepping through a line uses `replaceState`). A frame is the app
  with `?theme=<id>&preview`: shown in that theme, not kept, and never syncing (its edits are the
  device's and sync from the app). "Use this one" makes a theme the app's.

Tests: `themes.spec.ts` (desktop and phone: a theme chosen is on `<html>`, light, and kept over
a reload; the gallery's eight frames, each in its theme, following a screen picked above and one
opened in a frame, a theme left out, "Use this one", and no GitHub request from a frame).

Live: TESTING.md.

#### 5.87 The owner's notes of 2026-10-10: the study's ☰ menu

From the design canvas of themes, whose study screen had a ☰ button and only the move buttons
beside it; the owner marked on a screenshot what to take out of the live page.
- **The move-button bar** is ☰, ⏮ ◀ ▶ ⏭, and ✎ ⋯ where there is no mouse (§5.69): five buttons
  on a desktop, seven on the phone (nine and eleven before). ⏭ and ⋯ went in §5.89.
- **☰ opens a menu** (`StudyMenu.tsx`) with what left the bar and the board: Explorer (a
  checkbox: the panel on or off, as the ⛁ button did), Undo and Redo (greyed when there is
  nothing to undo or redo; Ctrl+Z / Ctrl+Y still work, shown beside them where there is a
  keyboard) and Copy FEN (the position shown). The FEN row under the board is gone; the move
  menu keeps its Copy FEN, and the analysis board its FEN field.
- The move menu and the ☰ menu share `FloatingMenu` (placed inside the window, ↑ ↓ between
  items, closed by a press outside, a resize, Escape anywhere or Tab); ☰ again closes its menu.

Tests: `views.spec.ts` (the bar's buttons on desktop and phone, no FEN row, the menu's items,
Undo and Redo greyed then working on a move played, ☰ and Escape closing it; Copy FEN from
it), and the explorer, editor and engine specs through the menu (`studyMenu` in `board.ts`).

Live: TESTING.md.

#### 5.88 Every page looked over for layout (the owner's request, 2026-10-11)

Each page screenshotted on a desktop (1440 wide) and an emulated phone, with three studies; what
was found and changed:
- **The phone scrolled sideways** on every page with a board: chessground's file letters sat 24px
  right of their squares, the h past the board's edge. The coordinates are now inside the edge
  squares, Lichess's way (files bottom right, ranks top left, each in the other square colour,
  11px bold instead of 9px), and the resize corner keeps inside the page's 12px gutter on a
  touch screen.
- **Fields** (selects, text and number boxes) were the browser's own on most pages: small and
  light on the dark themes. All take the theme's colours and 44px now, as the forms had;
  checkboxes the switch colour, a checkbox and its words one row (the games' sources had the box
  above its words, the speed chips off its line).
- **The study's head:** with a chapter open, its study ⚙, chapter ⚙ and + went into the ☰ menu
  (New chapter…, Chapter settings…, Study settings…, under a rule), so the phone's chapter
  picker shows the chapter's name (it was cut to "Giuoco Piar"). A study with no chapter keeps
  them in the head. On a wide screen the head reads Study › **Chapter** (the design canvas's
  crumb), and the chapter list's head counts the chapters.
- **A page's title** (Training · …, Read · …, Games, Mistakes…) is the page's name in the text
  colour, not a muted aside; Import and Conflicts have the ← and title the other pages have
  (they had a "← Studies" link).
- **Text pages** (home, games, mistakes, coverage, import…) keep to a centred 1100px column on a
  wide screen; the board pages take the width.
- **Home:** the training card's counts in the line list's colours (due red, new blue, only when
  not 0), Train in the primary colour, and on a phone its buttons a row sharing the width. The
  studies card: + New study by its title, Storm, Games, Analysis board and Import a row under it
  (two by two on a phone, not squeezed beside the title); a study card's Train beside its counts.
  Forest's `--due` went from #e05050 to #e66464: 4.5:1 on its surface (it was 4.0), for Slate,
  Walnut and Midnight too, which take it.
- **Training on a phone:** the buttons under the board two to a row, of one width.
- **The analysis board:** its FEN box ran past the frame over the footer on a wide screen; the
  board now keeps room for it, and takes the chapter list's empty column. Its Copy FEN went to
  ☰ (the study's), the box keeps Set up and New.

Not changed, for the owner to say: the shortcut keys' "(1) (2) (4)" on the training buttons show
on a phone too; the explorer's columns (the canvas had a Maia column).

Tests: `views.spec.ts` (the ☰ menu's study items opening their dialogs, no ⚙ or + in the head,
the crumb on a desktop and the picker on a phone; Copy FEN on the analysis board from ☰), and the
study, promotion and chapter helpers through ☰ (`newChapter`, `chapterSettings`, `studyMenu`).

Live: TESTING.md.

#### 5.14 Phase 1 acceptance test, and exit

**Acceptance test (live, desktop + Android phone)**, after Phase 0's (§4.11) and once §5.15 is
built, on the owner's real
repertoire imported a last time from Qchess (D18):
1. Both devices synced. The home screen shows the same "due · new" counts on both.
2. Desktop: train part of the day's queue: learn one new line, answer one due move wrong, suspend
   one move, pin the mistake; mark one chapter known and answer two of its moves.
3. Phone, offline: train the rest of the queue; the desktop's new line isn't offered again, and
   the day's new limit counts the desktop's moves.
4. Both online, synced. Then on both: the same card states (debug panel, rounded as in §4.8), the
   same mistakes list, the pin due 30 minutes after it was made, nothing due today.
5. Phone: a show-and-grade session with the ring the next day.

**Phase 1 exit**: unit, simulation and e2e tests green; the queue simulation run on the real
repertoire and the default chosen; the acceptance test passed live; a week of daily use on the
phone before Chessable reviewing stops (the outline's check).

Risks:
- The switch brings thousands of new cards at once (D19). The daily limit decides how many weeks
  the repertoire takes to come in; §5.5 shows it before the owner chooses.
- The ring may reach a web page differently from the extension (§5.9). If neither key events nor
  Media Session work, show and grade runs on the phone's screen until a fix is found.
- Pace and input speed on the phone (§5.7, live).
- Lines differ in length: the first line of a big chapter can bring 30 new moves in one go, past
  the limit, because lines are taken whole. If that proves too much, a line can be split at its
  limit instead; the rule lives in one function (§5.3).

### Phase 2: Explorer, ChessDB and the Practical panel

Planned on 2026-10-06, after Phase 1's build (§5.16) and while its live checks wait for the owner
(TESTING.md). The parts below are in build order; each lists its tasks, the tests that prove it,
and what only a live check can show, on which device. Numbering goes on from Phase 1's.
The owner's second testing notes (§5.17, Phase 1 follow-ups) are built before the next part of
Phase 2 that isn't started yet; §5.18 (alternative moves) waits for the owner's answer on its
storage.

**Scope**, from the outline the owner approved:
- **Lichess explorer** with `src/pe`'s limiter and an IndexedDB cache; repertoire marks on the
  move rows.
- **ChessDB evals** (`queryall`).
- **The Practical column, prepared score and risk**, from `src/pe/search.js` and `rounds.js`, in a
  Web Worker, with `provider.child` on chessops. `provider.analyse` (ChessDB's `queue`/`store`)
  stays off unless switched on (D9).
- **Where it sits** (D21): in the study page's panel under the notation, laid out as Qchess's
  explorer, turned on and off by a button by the move buttons.
- **The local explorer** on the desktop (`explorerdb serve`, q_extension).
- **Repertoire coverage** and the **course tree** (lichessable §21, §24).

**Sources, read for this plan** (2026-10-06):
- q_extension at `c26242f` (cloned outside this repo): `src/pe/search.js` (637 lines), `rounds.js`
  (296), `providers.js` (588), `cache.js` (110); `src/background.js` (the service worker that runs
  the search: providers, budget, token, Maia over the port); `src/main-world.js`'s Practical part
  (row picking, the cell, the tooltip, the prepared bars) and its `clParse`/`clStartFen`;
  `test/pe.js` (1,572 lines, 17 sections) and `test/harness.js`'s "clickable lines" and
  same-chapter detection cases; its CLAUDE.md (the explorer panel's page contract) and README.
- Qchess's explorer, read live on the test account (desktop 1600×900 and phone 390×844, headless)
  and in the study page's source: `displayStatistics`, `createNoveltyElement`, the sort menu, the
  Lichess settings panel. What it is:
  - The panel sits under the notation (`#opening-tree`), its toggle (`#toggle-tree`, a database
    icon) leftmost in the move-button bar. On the phone: the move buttons, the notation, then the
    explorer.
  - Tabs, one per database (Elite, CORR, 2024+, TT, Lichess; the chosen one highlighted), and for
    Lichess a ⚙ opening its filter: player, time controls (Bullet, Blitz, Rapid, Classical;
    default the last three), average ratings (400 … 2500; default 1600–2500), "Only stats from
    past 6 months".
  - A header row: Move, Eval, Games (share and count), Score, and a "⇅ Sort" menu: popularity,
    eval (the default), score, White's moves by eval and Black's by popularity, the reverse,
    "Your moves by eval, opp's by popularity", and "Only show repertoire moves".
  - A row per move, 20 px high: the SAN; the eval in pawns from White's side to two decimals
    (green above 0, red below, grey at 0; ChessDB's where it knows the position); the share of
    games; the count; a bar of three parts (white, grey, black) with the percentage written in a
    part of 15% or more. A row's title gives the average ratings. A click plays the move.
  - A move the chapter already has at that position is drawn on a lighter band
    (`chapter-covered`); in its repertoire mode the row also carries chips naming the chapters.
  - Moves ChessDB knows and the games don't are "novelty" rows (orange name, "novelty" in place
    of the bar), sorted in with the rest when sorting by eval.
  - A last row, Σ, sums the games and their results.
  - Without a Lichess login, the Lichess tab says "Lichess account required … No permissions are
    granted, we only verify you have a Lichess account" and offers to connect: the explorer wants
    a token of any scope. Checked from this container: `explorer.lichess.org/lichess` and
    `/masters` answer 401 without a token, and their preflight allows `Authorization` from any
    origin.
  - Elite also lists top games under the rows; not part of this phase.
- lichessable's `DESIGN-repertoire-coverage.md` and `DESIGN-course-tree.md` (§1–§3, §12–§17's
  headings and conclusions).

**What carries over, and what doesn't:**
- Qchess's own databases (Elite, CORR, 2024+, TT) are its server's, behind its login: not used.
  Repworks' tabs are **Lichess** (the filter's games), **Masters** (Lichess's masters database,
  the nearest to Elite), **ChessDB** (its moves and evals, no games) and, where one is set,
  **Local** (`explorerdb serve`).
- The Practical column always runs on the Lichess filter's data (or the local explorer's), as in
  q_extension, whatever tab is shown; its header says so on other tabs.
- Maia (q_extension's thin-position fill-in and preview) waits for Phase 3, which brings the
  model. The port keeps `provider.maia` and the preview search, tested, and switched off.
- The player filter (Lichess's `/player` endpoint) and the top games: not in this phase.

Where the new code goes:

```
src/core/explorer/   search.ts, rounds.ts, limiter.ts, providers.ts (ports of src/pe),
                     table.ts (the panel's rows), rows.ts (which rows Practical computes),
                     coverage.ts, filter.ts
src/platform/        explorerCache.ts (IndexedDB), explorerWorker.ts (the worker), explorerHttp.ts
src/app/             explorer.ts (signals, the worker's client, the panel's state)
src/ui/              Explorer.tsx, ExplorerSettings.tsx, Coverage.tsx
```

#### 5.20 q_extension's harness cases (clickable lines, transpositions)

§5.11 and §5.12 were built without q_extension's source; with it at hand:
- Port the "clickable lines in training comments" cases of `test/harness.js` into
  `test/unit/core/repertoire/lines.test.ts`, on the same line and comments with real positions.
- Port its same-chapter detection case (the live test study's 19 paths: 3 transposing positions,
  8 marked moves, one move untouched) into `transpositions.test.ts`.
- Compare `lines.ts` with `clParse`/`clStartFen` and fix what differs.

**As built** (2026-10-06):
- `clStartFen` places a line by its number and side alone: the commented move's position, or the
  position before it, else nothing, and **a line that fits neither stays text**. §5.12's guess (a
  line goes to whichever position its first move is legal in) is gone; `lineStart` returns
  undefined and `PlayedLine.placed` says whether a line has a start. The comment renderer plays a
  comment's lines once (only for a comment with a group) to know this.
- q_extension strikes a line's moves through from the first illegal one, and a click on one does
  nothing; here a click on such a move used to show the last legal one. Now as q_extension
  (`.line-move.bad`).
- Kept as a deliberate difference: glyphs standing alone in a group (`!?`, `$14`) don't make it a
  remark here, as they do in q_extension; Lichess's dialect can carry `$n` in a comment typed so.
- Transpositions: the harness's study gives the same 3 positions and 8 moves with the site's key
  (D10), so nothing differed.
- Tests: `lines.test.ts` (q_extension's harness case: the remark and the line fitting nowhere left
  as text; the same-ply line replacing 3... c5 and its position; the before-the-move line from
  5. a3; moves struck from `Qxh7` on; on the last move, → through three lines skipping the
  illegal one and stopping at the end, ← back and out, a click into the second line running back
  into the first; and a line placed by its number where its first move is illegal),
  `transpositions.test.ts` (the 19 paths, built move by move: the three groups and the untouched
  `7. d3`).

#### 5.21 The Practical search in core (a port of `src/pe`)

`src/core/explorer/`, each file with a provenance header naming q_extension, the file and
`c26242f`, under the repo's GPL-3.0-or-later:
- `search.ts` from `search.js`: `evaluateRow`, `PE_DEFAULTS`, `winFromCp`, `riskMean`, `leafSplit`,
  the counts and splits, unchanged in behaviour. TypeScript types for the provider, the node and
  the result; erasable syntax only.
- `rounds.ts` from `rounds.js`: `createRootSearch` and `createPreviewedSearch` (the second unused
  until Maia, Phase 3).
- `limiter.ts` from `providers.js`: `createRateLimiter` (the token bucket, one in flight, the 429
  pause, snapshot and restore) and `createLimiter` (n in flight, priorities). The clock and
  `sleep` are inputs (core reads no clock).
- `providers.ts` from `providers.js` (`createProviders`): the explorer and ChessDB clients over an
  `Http` port (`(url, init) → { status, ok, json(), headers }`), a cache port (`get(store, key,
  ttl)`, `put`), the clock, `sleep` and the token. TTLs, the budget, the retries, the
  in-flight sharing, `analyse` and the local explorer as in q_extension. The explorer's URL takes
  the database (`lichess` or `masters`; Masters takes no speed or rating filter).
- `fenKey` is q_extension's (the first four FEN fields, as given); the FENs the site sends come
  from chessops's `makeFen`, so en passant is already the legal rule (D10).

Tests: `test/pe.js` ported to `test/unit/core/explorer/*.test.ts` with `node:test`, case for case
(the worked example, perspective, mates, tails, deepening, rounds, the preview, Maia, fewer
requests, risk aversion, the prepared score's five sections, the rate limiter), and
`test/explorerdb.js`'s cases for `providers.js`'s local path. A one-off differential check, kept
out of the repo: the port and the original, side by side on the same random positions and fake
providers, give equal results (recorded in "as built").

Live: none (pure code).

**As built** (2026-10-06):
- `src/core/explorer/search.ts`, `rounds.ts`, `limiter.ts`, `providers.ts`: the port, each naming
  its source file and `c26242f`. Behaviour unchanged; TypeScript types for the provider, the
  answers, the nodes and the row result. The clock, `sleep` and HTTP have no defaults (core reads
  no clock and does no fetch). Two additions: `explorerUrl` takes `db: 'masters'` (its own URL,
  no filter, its own cache key; Lichess's keys stay q_extension's), and `compactExplorer` keeps a
  move's `averageRating` as `rating` for the panel's row title. `burstFor` is kept for its tests;
  the site's token is its own, so `OWN_BURST`.
- `test/unit/core/explorer/pe.test.ts` is q_extension's `test/pe.js` line for line (so it diffs
  against its source), its 142 checks as `node:test` subtests, with a loader mapping its module
  paths onto the port and `fetch` passed on as `http`. It is the one test file with
  `@ts-nocheck`: typing it would cost the diff. 149 subtests pass.
- `providersLocal.test.ts`: `test/explorerdb.js`'s cases for `providers.js`'s local path, against a
  stand-in server on a free port (no token, no cache, no budget, a hit for the rounds; the address
  cleared going back to Lichess; addresses spelled one way; a server that isn't one, or isn't
  running), and Masters' URL and key.
- **The differential check** (a scratch script, not in the repo): q_extension's `search.js` and
  `rounds.js` beside the port on random trees (up to 6 plies, 1–4 moves a position, missing or
  inconsistent counts, unknown and mated positions, mate scores) with random options (risk
  aversion, Maia, Maia alone, the prepared split, a free explorer, the floors), `evaluateRow` at
  depths 1, 3 and 5 and the rounds' every published result in order: equal on 4,400 comparisons
  over three seeds.

#### 5.22 The explorer worker and its cache

- `src/platform/explorerCache.ts`: q_extension's `cache.js` on IndexedDB, database
  `repworks-explorer` (stores `explorer`, `chessdb`), apart from the study store, so it can be
  cleared alone. A memory LRU in front. A broken IndexedDB degrades to memory only.
- `src/platform/explorerWorker.ts`, a module worker: it owns every explorer and ChessDB request of
  its tab (the panel's and the search's), so one limiter governs the token's bucket. Messages in:
  `token` (the Lichess token, or none), `settings` (the filter, the Practical options, the local
  explorer's address, analysis on or off), `lookup {id, db, fen}` (the panel: the database's
  moves and ChessDB's evals for a position, at the top priority), `search {gen, rootFen, rows,
  remove}` (q_extension's `startRoot`: a new `gen` sweeps the old root's queue), `stats`. Out:
  `lookup` answers, `update {gen, root, san, result}` per row, `stats`. `provider.child` plays SAN
  with chessops; ChessDB's spelling of castling (`e1g1`) comes from `standardUci` (§4.3).
- Rate: q_extension's measured bucket (about 23, refilling about 18.5 to 19 a minute); the site's
  token is its own, so a burst of 20 (q_extension's `OWN_BURST`) and 16 a minute. The bucket is
  saved to `sessionStorage` through the page (a worker has none), so a reload doesn't start full.
- Budget per root position 60, as q_extension's default; analysis requests at most 30 per root
  position, and only when switched on.
- `src/app/explorer.ts`: starts the worker on first use, passes the token from the Lichess login
  (§4.10), and answers the panel and the column.

Tests (Node, the worker's message handling over a fake `Http`, a fake clock and a memory cache):
a lookup answered once and then from the cache; a 429 pausing every queued request for 60 s and
emptying the bucket; a new root sweeping the old root's queued requests; no token: the Lichess
lookup refused with a clear reason, ChessDB still answering; Masters asked without the filter.
`explorerCache` against fake-indexeddb (expiry on read, the LRU).

Live (desktop, then phone): the panel's first answers with the owner's Lichess login; a reload
answering from the cache; the request counts after ten minutes of browsing (the debug panel).

**As built** (2026-10-06):
- The worker's logic is core's, `src/core/explorer/service.ts` (`createExplorerService`), so Node
  tests drive it; `src/platform/explorerWorker.ts` only wires it to `fetch`, the cache, the clock
  and `postMessage`. Lookups go out at priority 1000 (the search's are at most about 11), so the
  panel never waits behind a search. A lookup answers in two messages, `games` then `evals`, as
  Qchess's panel draws twice. A 429 from the explorer is told to the page (`paused`); the
  providers wait it out and ask again. With no token, the Practical rows answer at once with the
  reason rather than failing request by request.
- Masters is Lichess's even with a local explorer set (the local index is Lichess games).
- `src/app/explorer.ts`: the device's explorer settings (localStorage `repworks-explorer`), the
  worker started on first use with the Lichess token (`lichessToken()`, re-sent on a login or
  logout), the bucket kept in `sessionStorage`, and the panel's lookups: asked 280 ms after a
  position is shown, the previous one dropped, answers kept for the session (errors aren't, so
  coming back asks again; nor is a ChessDB answer that hasn't settled, §5.138).
- Tests: `test/unit/core/explorer/service.test.ts` (a lookup asked once then from the cache,
  move counters aside; Masters with no filter and ChessDB's tab asking ChessDB alone; no login:
  the games refused with a login offered, ChessDB answering, the Practical rows saying why; a 429
  told, waited out and answered; a dropped lookup's queued request gone; a search's rows by
  depth 1 then 3, final; a new root sweeping the old one's queue; a row taken out reported as
  excluded), `test/unit/platform/explorerCache.test.ts` (a record read back by another instance,
  expiry on read, the two stores, memory only without IndexedDB).

#### 5.23 The explorer panel (D21)

`src/ui/Explorer.tsx` under the notation in the chapter view's panel (on the phone, after the
notation):
- **Toggle**: a database button first in the move-button bar, as Qchess's; on or off per device
  (localStorage), on by default. Off, nothing is asked.
- **Tabs**: Lichess, Masters, ChessDB, and Local when an address is set; the chosen one per
  device. A ⚙ by the tabs opens the settings (§5.24's dialog): the Lichess filter (speeds;
  average ratings; past 6 months only), as Qchess's panel.
- **The table** (`core/explorer/table.ts`, pure: the database's moves and ChessDB's evals in, rows
  out): Qchess's header and rows, a Σ row, novelty rows (ChessDB's moves the games don't have;
  shown on the Lichess and Masters tabs), the eval in pawns from White's side, coloured as
  Qchess's; sorted by the menu's choice (Qchess's options, Maia's left out until Phase 3), saved
  per device, "Your moves by eval, opp's by popularity" taking the side from the chapter's
  orientation.
- **Rows**: a click plays the move, as a move on the board does (it extends the line or goes to
  the move the chapter has). A move the chapter has at this position is on Qchess's lighter band;
  so is a move the chapter doesn't play here whose position it reaches by another order (the
  owner, 2026-10-12), edged in the transposition colour and marked ⇄, whose list (§5.11's) leads
  to those move orders. A move whose position other repertoire chapters reach (from the index,
  §5.1: played here or by transposition) carries a mark with its count of chapters, whose list
  opens as the transposition list does (§5.11) and leads to each chapter at that move. "Only show repertoire moves" is in
  the sort menu, as in Qchess.
- **Asking**: after 280 ms on a position (Qchess's debounce), the shown tab's lookup only; a
  position left before its answer drops its queued request. The ChessDB tab and the Eval column
  ask `queryall` alone.
- **No login**: the Lichess and Masters tabs say a Lichess login is needed, as Qchess's does, and
  offer the login (§4.10), coming back to this chapter.
- **Errors**: the reason in the panel (no token, 401, 429 with the pause left, network), and a
  retry.

Tests: `table.test.ts` (rows from a fixture answer: shares, Σ, the bar's parts and their labels at
15%, novelties, each sort, the eval colours from White's side with Black to move, the repertoire
mark and the chapter's band); Playwright with a fake explorer and ChessDB (routes in the e2e
server): the panel toggled and remembered; the tabs; a row clicked adding the move; the
repertoire mark's list opening the other chapter; no login; a 429 shown with its pause; the
phone's layout (the panel after the notation, nothing wider than the screen).

Live (desktop and phone): the panel beside Qchess's on the same positions (moves, shares,
counts and bars equal for the same filter); the phone's layout and scrolling; the toggle.

**As built** (2026-10-06):
- `src/ui/Explorer.tsx`, under the notation's Read/Play buttons and the move's card in the
  chapter view's panel; on a wide screen it takes up to half the panel and scrolls, on the phone
  it follows the notation. The database button (`⛁`) is first in the move-button bar, which now
  keeps its nine buttons on one row at every width. (Since §5.87 the panel is switched in the ☰
  menu, and the bar keeps the move buttons.)
- Tabs: Lichess (named Local when a local explorer is set), Masters, ChessDB (removed since, by
  the owner's notes below); ⚙ opens the
  explorer's settings (`ExplorerSettings.tsx`: the Lichess login, Qchess's time controls and
  rating buttons, the past 6 months, and §5.24's Practical options and §5.25's address, already
  there). The sort is a `<select>` in the header (Qchess's menu items), saved per device; the
  default is Qchess's, by eval.
- Rows (`core/explorer/table.ts`): SAN, eval (ChessDB's, in pawns from White's side, green, red
  or grey; mates as `#n`), share, count, the three-part bar with labels from 15%, a row's title
  its average rating (Lichess's answer has it); novelty rows in orange; Σ. Moves are matched
  across the chapter, Lichess and ChessDB without check marks. A move other repertoire chapters
  play here (the index's positions, own and opponent moves alike) carries their count; it opens
  the transposition list's "Other chapters", which goes to that chapter at the move.
- Without a login the games tabs say Lichess's explorer needs one and offer it, coming back to
  the chapter; ChessDB's tab works. Errors have a Retry. While Lichess has asked to slow down,
  the panel says it waits.
- Every e2e page that has studies routes the explorer and ChessDB to a fake (`test/e2e/explorer.ts`,
  through `serveGithub`), so no test reaches the network; requests from the worker are
  intercepted like the page's.
- Tests: `test/unit/core/explorer/table.test.ts` (rows, shares, ratings, evals from White's side
  with Black to move, novelties, Σ; Qchess's formats; every sort; ChessDB's tab; check marks) and
  `test/e2e/explorer.spec.ts` on desktop and the emulated phone (the rows by eval and by
  popularity, the chapter's band, the Alapin's mark on 1. e4, the token and filter in the
  request; a row clicked playing its move; the panel turned off and still off after a reload; the
  Masters URL with no filter and ChessDB's tab; the repertoire mark leading to the Alapin at
  2. c3; no login; a 429; the filter changed in the settings reaching the request; nothing in the
  panel wider than the phone).
- Not checked live: the real explorer needs a Lichess token, which this container doesn't have;
  ChessDB was reached from the container (§2). Both wait for the owner (TESTING.md).

**The owner's testing notes** (2026-10-06), built the same day:
- **A constant size, as Qchess's**: Qchess's `#opening-tree` is `flex: 0 0 auto` at a set height
  (50% of its column by default) with a resize handle on its top edge, its rows scrolling inside
  (read live, desktop 1600×900). Repworks' panel had taken its content's height, shrinking to
  "Asking…" on each move and to what the notation left. Now: a fixed height, half the panel on a
  wide screen (at most the panel less 240 px, for the notation and the buttons) and 360 px on the
  phone; the last position's rows stay, faded and inert, until the next answer.
- **Adjustable**: a handle on the panel's top edge (drag, a finger on the phone, ↑/↓ keys;
  double-click for the default), the height saved per device (`height` in the explorer prefs).
- **Sorting by the column titles**: Eval (by eval), Prac (a new order, `prac`: the Practical
  values highest first, then by eval), Games (by popularity), and Score when the Practical
  column is off (by score; with it on, Score stays the prepared switch). The menu stays, and
  shows the order chosen either way.
- **No ChessDB tab**: its evals are already the games tabs' Eval column and novelty rows. A
  device that had it chosen opens on Lichess. Without a Lichess login, ChessDB's moves show under
  the login's note (what the ChessDB tab was for there).

#### 5.24 The Practical column and the prepared score

- **The column** (`Prac`), after Eval, on the Lichess, Masters and Local tabs, computed on the
  chapter's side's moves only (q_extension's "your moves"): the rows q_extension picks
  (`peAutoRows`, in `core/explorer/rows.ts`: up to 3 moves within 5 win% of ChessDB's best, then
  moves played in 2% of games or more, 8 at most), a click on an empty cell computing that row,
  and a right-click (long-press on the phone) leaving a move out at that position for the
  session, as q_extension does (its search stops, its share of the budget goes to the others).
- **Cells** as q_extension's: `54%`, a small `d3` while deepening, green on the best among rows at
  one depth (`peBestOf`), `–` with too few games or no eval, `?` on an error (click to retry),
  `×` when left out. The details (q_extension's tooltip: the value, mean and engine, the games
  and filter, the main replies with their values and the Practical choice after each, the
  switches, the depth and why it stopped) are the cell's title on the desktop and, on a tap, a
  box under the table on the phone.
- **Rows' values are kept per position** for the session (q_extension's `pe.results`): coming
  back is instant, and a row left before it finished resumes.
- **The prepared score**: a click on the Score header switches the bars between the games'
  results and the prepared split (q_extension's `prepPaint`): outlined, the best in green, faded
  when it rests mostly on the Practical value, and the details in the title.
- **Settings** (`ExplorerSettings.tsx`, per device): the Lichess filter; Practical on or off; risk
  aversion (0.05); the request budget per position (60); under Advanced q_extension's options
  (reply threshold 3%, minimum games 50, reach floor 2%, depth limit 6, own margin 5, own
  candidates 3, prepared prior 50 games); "Ask ChessDB to analyse unknown positions" (off, D9);
  the local explorer's address with a Test button (§5.25); the request counts (q_extension's
  popup stats).

Tests: `rows.test.ts` (q_extension's row picking: eval margin, ties broken by games, the share
floor, exclusions, the cap); the worker's search messages (a root's rows answered by depth, a
row excluded mid-round, a new root sweeping the old); Playwright with fake data whose values are
worked out by hand (the worked example's 65.3%): the column filled by rounds, the green, a click
computing a row, a long-press excluding one, the prepared bars switched.

Live (desktop): q_extension's Practical column and Repworks' side by side on the same positions
with the same filter and token (the outline's check); the request rate seen over ten minutes;
(phone) a search's time and the battery over a session.

**As built** (2026-10-06):
- `core/explorer/rows.ts` (`autoRows`, `bestOf`: q_extension's `peAutoRows` and `peBestOf`, over
  the table's rows), `core/explorer/details.ts` (its tooltips as lines of text: the value with
  its mean and engine, games and filter, the main replies with the Practical choice after each,
  the tail, the switches, the depth and why it stopped; the prepared split against the same
  games), `src/app/practical.ts` (`peRequest`'s rules: a new position a new `gen`, the old one's
  queue swept; values kept per position and move for the session; a row left unfinished
  resumes; a click computes a row; a right-click or long-press leaves a move out for the
  session; values found under another filter or other options are dropped).
- The column (`Prac`) sits after Eval on the Lichess (or Local) and Masters tabs, computed on the
  chapter's side's moves only, and always on Lichess's data (its header says so on Masters). A
  tap on a value opens its details in a box under the header (the desktop also has them as the
  cell's title); `d3` is a small marker while a row deepens.
- The Score header becomes a switch when the column is on: "Prepared" draws the prepared split
  in the bars (outlined blue, the best green, faded when it rests mostly on the Practical value;
  rows with no split keep the games' bar, faded), and the details in each bar's title. Saved per
  device.
- Explorer settings shows this tab's request counts (q_extension's popup counters: Lichess
  requests and 429s, ChessDB lookups and analysis requests, local requests, the cache's size,
  a pause left).
- Not built: q_extension's ChessDB re-check of a finished row whose positions were sent for
  analysis (`peRecheck`): analysis is off by default (D9), and with it on a revisit after the
  session's values are dropped asks again anyway.
- Tests: `rows.test.ts` (the eval margin and candidates, the share floor, Black to move, the cap
  of 8, ties to the more played move, an exclusion letting the next in; green at one depth with
  complete rows always in), `details.test.ts`, and in `explorer.spec.ts` (desktop and phone) the
  column after 1. e4 in the Black chapter: nothing on White's move, c5 and e5 valued and one
  green, b6 (not picked) computed by a click without playing it, a value's details on a tap, e5
  left out by a right-click and brought back, the prepared bars switched on.

#### 5.25 The local explorer (desktop)

- The address (e.g. `http://localhost:9337`) in the settings, tested with `/info` (q_extension's
  `localInfo`). Set, the Lichess tab becomes Local's games, asked with no token, no limiter and
  no budget, and the search treats the explorer as free (`explorerFree`), as q_extension does.
- Chrome asks once for `loopback-network` (Local Network Access, §2).
- `explorerdb serve` must answer the site's origin: `Access-Control-Allow-Origin:
  https://dubious-moves.github.io` on its answers, and 204 to `OPTIONS`. That change is
  q_extension's (`tools/explorerdb/server.mjs`), which a Repworks session can't push to; the
  patch is written out in TESTING.md for the owner or a session with q_extension attached.

Tests: the provider's local path (§5.21's ported cases) and a Playwright run against a fake local
server on another port (the address tested, the tab answered without a token).

Live (desktop, owner): the patched `explorerdb serve` answering the site, after Chrome's prompt.

**As built** (2026-10-06):
- What §5.21–§5.24 had already built: the address in Explorer settings (per device), the
  provider's local path (no token, no limiter, no budget, `explorerFree` for the search, Masters
  still Lichess's), the tab named Local, and `localInfo`. Added here: **Test** beside the
  address (`testLocalExplorer` in `src/app/explorer.ts`, from the page, so Chrome's prompt comes
  with it), which shows what the index is (source, date, its fixed filter, positions and
  games) or why nothing answers; and a line saying what the address changes.
- **The q_extension change** is written out in TESTING.md as a patch against `c26242f`, checked
  on a copy (it applies, q_extension's `test/explorerdb.js` passes, and the patched server sends
  `Access-Control-Allow-Origin` only to the allowed origin and answers a preflight 204). Requests
  from the site are plain GETs with no custom header, so no preflight is needed by CORS itself;
  the 204 is for Chrome's Private Network Access, which may send one.
- Tests: `test/e2e/explorer.spec.ts` (desktop and phone) against a stand-in `explorerdb serve` on
  another port, a real HTTP server with the patched CORS (`serveLocalExplorer`): with no Lichess
  login, a dead address's Test failing, the real one's showing its index, then the tab named
  Local answering with no Authorization and no request to Lichess, and Masters still asking for
  the login.

#### 5.26 Repertoire coverage (lichessable §21)

What lichessable's design asks, on studies instead of Chessable courses: which lines of a
reference study (a course) the repertoire doesn't have, ranked by how likely they are to be met.
- `core/explorer/coverage.ts` (pure): each line of the reference study (each chapter's every
  root-to-leaf path) walked against the repertoire's index (§5.1, position-keyed, so
  transpositions and copies under other names count) to its first divergence: a **hole** (the
  repertoire has no move of its own there), **line ends** (an opponent's move where the
  repertoire has nothing after it), an **alternative** (a different own move: a choice, not a
  gap), an **unmet option** (an opponent's move the repertoire doesn't branch on), or present. A
  study for the other side is flagged, as lichessable does.
- **Ranking**: `P` is the product of the opponent's moves' shares from the course's root to the
  divergence (explorer answers, through the worker and its cache, with the panel's filter), shown
  conditional on reaching the course's root and unconditionally; a position under 50 games ends
  the product, marked truncated; `score = P × exp(−d / 16)` with `d` the divergence ply (a
  setting). A line whose start the repertoire never reaches can't be ranked and says so.
- **Where**: "Coverage…" in a reference study's settings, or a repertoire's: choose the other
  study (and the side); the report lists the gaps grouped by their divergence (five lines behind
  one unanswered move are one thing to fix), each opening the chapter at the divergence.
- **Adding**: a gap's line copied into a chosen repertoire chapter of the same side, from the
  divergence (an ordinary edit, undoable, synced).
- The repertoire's own gaps (opponent moves with no answer, ranked the same way against the
  explorer alone) are lichessable's "general form"; built here as "Gaps" with no reference study,
  if the walk makes it cheap.

Tests: `coverage.test.ts` (each of the four divergences, a transposition counted as present, a
copy under another chapter, a study for the other side, the ranking with a fake explorer: P, the
floor, the depth discount, the conditional figure); Playwright: a report on the fixture
repertoire and a reference study, a line added to a chapter.

Live (desktop): a real course (a reference study imported from the owner's Chessable export)
against the real repertoire: the report's counts, the request count, the time.

**As built** (2026-10-06):
- **Read first**: lichessable's `DESIGN-repertoire-coverage.md` and its section 21 in
  `content/lichessable.js` (`indexRepertoire`, `firstDivergence`, `rootPlyOf`, `riskPlies`,
  `rankGaps`, `sortGaps`), whose rules are ported as they are: the four divergences plus
  "unreachable", the divergence move counted in P only for an unmet option, the floor of 50
  games ending the product (marked ~), and `score = P_cond × exp(−d/16)`.
- `src/core/explorer/coverage.ts` (pure): `repertoireTree` (every move the chosen repertoire
  chapters play at each position, own and opponent moves alike, and where each position is
  reached), `courseLines` (a chapter's root-to-leaf lines, as far as legal), `firstDivergence`,
  `coverage` (the report: lines, present, the gaps grouped by divergence position and move,
  lines of chapters for the other side counted, unreadable chapters listed, the root ply),
  `positionsToRank` (the distinct positions the ranking needs), `rank` and `sortGaps` (by score,
  depth or kind). A position not answered (not asked yet, or refused) leaves its gap unranked
  rather than truncated, so a report with no login shows "P —", never a fake 100%.
- The repertoire is compared **by side**: the chapters of the chosen side (default: the side
  most of the course's chapters are for), of every repertoire study or one. Comparing against
  both sides' chapters would let a Black chapter's White moves "cover" a White course.
- **The explorer's answers** come through the explorer worker (a `counts` message: the Lichess
  tab's games at the panel's filter, or the local explorer's, at priority 500, under the panel's
  1000 and over the search's), so the same limiter, cache and token apply; answers are kept for
  the session, so the report run again (after an add) asks nothing.
- **Where**: "Coverage…" in a study's settings opens `#/coverage/<sid>`: from a reference study,
  its lines against the whole repertoire; from a repertoire study, the first reference study
  against it; both changeable (the course, the repertoire or one study, the side). The report:
  "3 lines · 0 present · 2 missing in 2 places · 1 where you play another move", the other-side
  warning, the ranking's progress ("Asking Lichess… 2/3 positions") or the login it needs, then
  one row per gap: its kind, the moves to it numbered with the divergence move bold (a link
  opening the course there), its lines, P from the root, P of all games, the ply and the score;
  the alternatives folded apart (a choice, not a gap). Sort and D are on the report.
- **Adding**: each gap with a repertoire chapter reaching its position offers "Add the line" (or
  "the 3 lines"), into the first such chapter or one chosen: every line behind the gap is copied
  from the divergence on (`addLine` in `core/study/ops.ts`), one change, synced. The added list
  above the gaps keeps "Open" and "Undo" (the chapter put back, unless it changed since), since
  the gap itself leaves the report once covered. Alternatives and unreachable lines have no Add.
- **Not built: "Gaps"** (the repertoire's own unanswered opponent moves against the explorer
  alone): every position of the repertoire with the opponent to move would need an explorer
  request, hundreds for a real repertoire against a bucket of about 20 a minute, so the walk
  doesn't make it cheap (§5.26's condition). The core functions don't stand in its way.
- Tests: `test/unit/core/explorer/coverage.test.ts` (each divergence; a line present under
  another chapter and by a transposition; a course line by another move order reported at its
  first move; unreachable; another side counted; grouping and the root ply; the ranking's P,
  P from the root, the floor, the depth discount and the sorts on a hand-worked example; no
  answers leaving gaps unranked; a gap's lines added and then present),
  `service.test.ts` (the `counts` message: games only, the filter, the cache, no login),
  `fsm.test.ts` (the route), and `test/e2e/coverage.spec.ts` on desktop and the emulated phone
  (a reference study beside the fixture repertoire: the summary, the gaps ranked with a fake
  explorer and their figures, three requests with the token, the alternative; 2. Nc3 added to the
  Main line, the report updated, the chapter synced, nothing asked again, then undone; without a
  login the gaps unranked with the login offered, a gap opening the course at it, and nothing
  wider than the phone).

#### 5.27 The course tree (lichessable §24): the owner's choice first

**Asked again (2026-10-06, the owner's third notes: "What course tree?").** Put plainly to the
owner: lichessable has a screen that takes a Chessable course, which is a flat list of separate
variations, and rebuilds it as one move tree you browse column by column. Repworks studies are
already trees, so the question is only whether a study made of many single-variation chapters
(as a Chessable export may be) needs a merged view; the recommendation is a small "Study" tab in
the explorer, or nothing. Waits for the owner's yes or no.

lichessable's course tree exists because a Chessable course is a flat list of variations: it
rebuilds the tree, position-keyed, and browses it as Miller columns. On this site a study already
is a tree and opens as one (D21), and the explorer panel (§5.23) already shows, at any position,
the moves the repertoire plays there with their chapters. What is left of §24's value is a
study whose chapters are single variations (as a Chessable export may be): the moves of all its
chapters at a position, merged.

Proposed (to the owner, before it is built): a **"Study" tab in the explorer panel**: the moves
the open study plays at the board's position, across all its chapters and their transpositions,
each with its chapters (one click to open), its count of lines, and the explorer's columns beside
it. Not built: the Miller columns, the folding of forced runs, the Lichess scan of a column.
Recommended, because it answers §24's question ("standing here, what did the author cover")
inside the page the owner already uses, for a fraction of the code. This part waits for the
owner's answer; the parts before it don't depend on it.

#### 5.28 Phase 2 acceptance test, and exit

**Acceptance test (live, desktop + Android phone)**, on the owner's repertoire and Lichess login:
1. Desktop: the explorer on 1. e4 c5 2. Nf3 shows the same moves, shares and bars as Qchess's
   Lichess tab with the same filter; the Eval column as Qchess's (ChessDB).
2. Desktop: the Practical column's values on three positions match q_extension's column (same
   filter, same depth) within a point; the prepared bars likewise.
3. Phone: the panel on and off; the rows readable; a row tapped plays the move; a Practical cell's
   details on a tap.
4. Desktop: the local explorer (if patched) answers the Local tab.
5. A coverage report of one course against the repertoire, and one line added from it.

**Phase 2 exit**: unit and e2e tests green; the acceptance test passed live; a week of use with
q_extension's column kept as the reference.

Risks:
- The explorer bucket (~23, refilling ~19 a minute) is per token, possibly per account
  (q_extension couldn't tell which). Every device using the token shares it, and so may Qchess's
  Lichess connection, q_extension and lichessable on the same account. Each tab has its own
  worker and bucket; two tabs searching at once can draw a 429, which pauses that tab a minute.
- Two copies of `src/pe` drifting apart: the port names its source commit, and the differential
  check can be re-run against a newer q_extension.
- Worker CPU and battery on the phone (the search mostly waits on the network; to be measured).
- The explorer under attack again (Qchess's message mentions a DDoS): errors are shown, never
  cached.

Checks:
- `test/pe.js` ported to `node --test`, and the differential check;
- on the desktop, values for the same positions match q_extension's column side by side.

### Phase 3: Analysis with Stockfish and Maia

Planned on 2026-10-06, after Phase 2's build (through §5.26) and while its live checks wait for
the owner (TESTING.md). The parts below are in build order; each lists its tasks, the tests that
prove it, and what only a live check can show, on which device. Numbering goes on from Phase 2's.

**Scope**, from the outline the owner approved:
- **Stockfish 18**, the lite single-threaded build first (mistake-lab's 7.3 MB build, no
  isolation needed); threads later if wanted (§5.36).
- **Maia 3**: the GPL-3 model vendored with attribution (D11), and onnxruntime-web vendored, not
  from a CDN. The encoding ported and checked against q_extension's `tools/repgen/maia.mjs`.
- **The analysis board**: MultiPV arrows, an eval bar, Maia and database overlays, and "add as
  variation" into a study.

**Sources, read for this plan** (2026-10-06):
- mistake-lab (`skAeglund/mistake-lab`, `main` cloned outside this repo): `docs/architecture-
  reference.md` first (its engine, eval bar, eval cache, analysis mode, Maia init phases and
  overlays), then `index.html`'s `initStockfish`, `handleSfCrash`, `sfAnalyzeAdaptive`,
  `startAnalysisSearch`, the eval worker, and the Maia section (`prefetchMaia`, `compileMaia`,
  `maiaMirrorFEN`, `maiaEncodeBoard`, `maiaPolicyTopMoves`); `engine/` and `maia/`.
- q_extension at `c26242f`: `tools/repgen/maia.mjs` (the encoding, the policy, the batching
  queue, the pinned model and its sha256), `src/background.js`'s Maia over the port and the
  preview search, `src/main-world.js`'s Maia view of the Practical column (`peMaiaElo`, the
  `Prac`/`Maia` header switch, the purple cells), its CLAUDE.md's notes on Qchess's Maia.
- Qchess, read live on the test account (desktop 1600×900, phone 412×915, headless) and in its
  source: the study page's engine bar (`#engine`: the engine switch, "SF18 Small", "Depth: 20"
  with the nodes per second while it computes, "+" to go deeper, the threat button (W), the
  settings ⚙), the PV lines under it (`#pv1_display`…: the eval from White's side in pawns, then
  the moves in SAN), the eval bar on the board's right edge (Lichess's win% formula), the engine
  settings (Depth 20/30/40, Lines 1–5, Threads 1/3/7, Max time 5/8/30 s), its search lifecycle
  (one `go` at a time: a new position sends `stop`, waits for `bestmove`, then starts; info lines
  of a stopped search are ignored; the shown depth never goes down; evals cached per FEN; one
  tab at a time runs the engine); `/Frontend/engineLoader.js` (SF18 full, lite and a basic
  build, chosen by what the device can run); and `/Frontend/maia/maia-integration.js` with
  `maia-worker.js`: a "Maia3" switch beside the engine's, a one-time "Download (44 MB)" dialog
  with progress, the model kept in IndexedDB, a rating (600–2600, default 2600), and in the
  explorer two columns before the bars, **Ml** (Maia's likelihood of the move at that rating) and
  **Ms** (Maia's expected score for the side to move after it, from the model's value head on
  the position after the move), Maia's top four moves the table lacks added as rows, and a sort
  by Ml. Qchess runs cross-origin isolated (`crossOriginIsolated` is true there), hence its
  threads; Maia is off in its Move Trainer.

**Checked for this plan** (scratch code outside the repo, 2026-10-06):
- mistake-lab's `stockfish-18-lite-single.{js,wasm}` are byte-identical to npm `stockfish@18.0.0`
  (sha256 `2278005…` and `a8fbc05…`). The build runs under Node (it has a command-line mode), and
  there **`stop` ends a search** (`go infinite`, `stop` after 2 s: `bestmove` at once, and the next
  search runs). mistake-lab never sends `stop` ("WASM crashes"), Qchess does; the browser worker
  is checked in §5.30. npm also has `stockfish@19.0.0`, whose lite single build is 1.8 MB with
  another small net; 18 stays (proven in mistake-lab on the owner's phone), 19 noted as a
  possible swap.
- **One Maia model everywhere**: mistake-lab's `maia3_simplified.onnx`, q_extension's pin
  (CSSLab `a6e52f5`) and Qchess's newer pin (`0013cc8`) are the same file (sha256 `405bf76c…`,
  45,683,686 bytes). Its weights are float16 (168 of 210 initializers), cast to float32 in the
  graph (opset 17, 1,359 nodes).
- mistake-lab's move table (`all_moves_maia3.json`) is q_extension's `moveIndex` formula, all
  4,352 entries, so no table needs shipping.
- **onnxruntime-web 1.30.0 under Node** runs the model (session 1.2 s; 140 ms a position, single
  thread, this container) with q_extension's encoding. Against q_extension's own runner
  (onnxruntime-node 1.30.0) on 50 fixed positions: the same top five in the same order, the
  probabilities within **0.0043**; the logits differ by up to 0.09 between runtimes, and by 0.08
  between web's own optimization levels, while node's levels agree exactly. So the outline's
  "to 1e-4" can't hold across runtimes (fp16 weights, different kernels); the check becomes
  exact equality of the encoding and the policy, and the runtimes within 0.01 (§5.32).
- onnxruntime-web's wasm (`ort-wasm-simd-threaded.wasm`) is 14.2 MB: Maia costs about 60 MB to
  download, Stockfish 7.3 MB.

**Decisions** (technical calls, each with its reason; in DECISIONS.md's revision log):
- **Engines and the model are downloaded when first used, not precached.** The service worker
  precaches the shell anew on every deploy; 60 MB with it would be downloaded again each time.
  They go in a cache of their own, by content-hashed name, kept across deploys.
- **Maia asks first** (Qchess's one-time dialog, with the size and progress), Stockfish doesn't
  (7.3 MB, said while it loads).
- **The study page is the analysis board** (Lichess's study, Qchess's study page): the engine
  panel sits there. A PV is a clickable line (§5.12's preview): stepping through it on the board
  edits nothing, and "Add" puts it in the chapter as a variation. A scratch board for positions
  in no study comes after (§5.35).
- **Maia in the explorer as Qchess's** (D21): Ml and Ms columns, Maia's moves as rows, a sort by
  Ml. Its rating follows the Lichess filter by default (q_extension's `maiaEloFor`: the players
  whose games stand beside it), or a fixed rating.
- **Never during training**: neither engine runs in training, Read or Play (Qchess turns Maia
  off in its Move Trainer; an eval would give the answer away).

Where the new code goes:

```
vendor/stockfish/    stockfish-18-lite-single.{js,wasm} (npm stockfish@18.0.0), Copying.txt, README.md
vendor/maia/         maia3_simplified.onnx (CSSLab a6e52f5), README.md (attribution, GPL-3)
src/core/engine/     uci.ts (info lines, scores, PVs in SAN), search.ts (the search lifecycle),
                     winning.ts (win%, the eval bar), shapes.ts (the arrows)
src/core/maia/       encode.ts (tokens, move index, policy, value), batch.ts (q_extension's queue)
src/platform/        stockfish.ts (the worker and its watchdog), maiaWorker.ts (onnxruntime-web),
                     blobs.ts (the engines' cache: download with progress, size, delete)
src/app/             engine.ts, maia.ts (signals, settings, the workers' clients)
src/ui/              Engine.tsx (the bar, the lines, the eval bar), EngineSettings.tsx, MaiaDialog.tsx
```

#### 5.29 Engines and the model on the site

- `vendor/stockfish/`: npm `stockfish@18.0.0`'s `stockfish-18-lite-single.js` and `.wasm`
  (GPL-3, its `Copying.txt`), with a README giving their source and sha256. `vendor/maia/`:
  `maia3_simplified.onnx` (CSSLab/maia-platform-frontend at `a6e52f5`, GPL-3, no separate model
  licence: D11), with a README crediting CSSLab and the Maia papers, and the sha256.
  onnxruntime-web 1.30.0 (MIT) is an npm dependency; its `ort-wasm-simd-threaded.{mjs,wasm}`
  are bundled, never fetched from a CDN (`env.wasm.wasmPaths` set to the built files).
- The build emits them under content-hashed names. The service worker leaves them out of the
  shell's precache and serves them from a cache of their own (`repworks-engines`): cache first,
  else fetched and kept; on activation it deletes only the entries no kept version names.
- `src/platform/blobs.ts`: whether a file is stored, its download with progress (a streamed
  `fetch` through the worker, so the cache fills as it goes), the stored size, delete. The
  storage is persistent already (`persist()`, §4.9).

Tests: the build's listing (the binaries out of `__PRECACHE__`, in the engines' list, hashed);
Playwright on the built site: the engine file fetched once, then served from the cache with the
network cut; a deploy with another shell keeping the engines' cache; nothing requested from a
CDN (any request off the site's origin, Lichess, ChessDB and GitHub fails the test).

Live (desktop and phone): the first download's time; offline after a reload.

**As built** (2026-10-06):
- `vendor/stockfish/` (npm `stockfish@18.0.0`'s two files, its `Copying.txt` and `AUTHORS`, a
  README with the sha256) and `vendor/maia/` (the model and a README crediting CSSLab);
  `onnxruntime-web` 1.30.0 pinned in `package.json`.
- `vite.config.ts`: the `engines` plugin emits the four files (Stockfish's js and wasm, the
  model, onnxruntime-web's `ort-wasm-simd-threaded.wasm`) as `engines/<name>.<sha256:10>.<ext>`
  and exposes their URLs and sizes as `virtual:repworks-engines` (in dev, Vite's `/@fs/` path).
  The service worker's build lists them in `__ENGINES__`, out of `__PRECACHE__`.
- `src/sw/sw.ts`: `engines/` is served from `repworks-engines` when stored, else from the
  network untouched; on activation the entries this version doesn't name are deleted. The app
  stores the files itself (`src/platform/blobs.ts`: `stored`, `storedBytes`, `ensure` with
  progress counted against the build's sizes, a file stored only once it arrived whole,
  `remove`), so one module owns the downloads.
- The debug panel lists both groups (Stockfish 18, 7.3 MB; Maia 3, 59.9 MB), stored or not,
  with Download and Delete (`src/ui/Engines.tsx`); §5.31 and §5.32 download through the same
  module when the engine or Maia is first switched on.
- Tests: `test/e2e/engines.spec.ts` (desktop and phone): no engine file requested or precached
  with the shell; Stockfish downloaded from the debug panel, stored under its hashed names,
  and answered from the cache with the site gone; Maia downloaded, a deploy deleting a stored
  engine it doesn't name and keeping Maia's, Delete; no request off the site and the faked
  services.

#### 5.30 Stockfish in a worker

- `core/engine/uci.ts` (pure): an `info` line to `{depth, seldepth, multipv, score (cp or mate,
  from White's side), nodes, nps, time, pv (UCI)}`; a PV to SAN with chessops (castling as UCI
  `e1g1` from the engine); `bestmove`.
- `core/engine/search.ts` (pure, the clock passed in): Qchess's lifecycle as a state machine:
  one `go` at a time; a new position sends `stop` and starts once `bestmove` arrives; info of a
  stopped search is dropped; the lines shown never go to a lower depth; `go depth D movetime T`,
  and "+" goes deeper (`go infinite` until stopped); the result kept per position key and
  MultiPV (an LRU of 300, mistake-lab's), so coming back shows it at once and only deepens.
- `src/platform/stockfish.ts`: a classic worker on the vendored build, the wasm's URL in its hash
  (the build reads it there); `uci`, `isready`, `Hash 16` (32 on the desktop); a crash or no
  `bestmove` within 3 s of a `stop` terminates it and starts a new one (mistake-lab's guard);
  three failures in a row and it gives up with a message.
- Off while the page is hidden; one tab at a time (a `BroadcastChannel`: a tab starting the
  engine stops it in the others, as Qchess's `qchessSfOwner`).

Tests: `uci.test.ts` (cp and mate from White's side with Black to move, lower and upper bounds,
MultiPV, a PV with castling and a promotion in SAN); `search.test.ts` over a fake engine (a new
position while one runs: `stop`, then the new `go` only after `bestmove`; the stopped search's
lines dropped; no shallower lines shown; the cache answering and deepening; "+"); and
`stockfish.test.ts` running the real build under Node (a copy as `.cjs` with its wasm, as a
child process): `bestmove` on fixed positions (mate in one and in two, a hanging queen, a
stalemate-avoiding move), MultiPV 3, `stop` mid-search followed by another search.
Playwright (desktop, the container's Chromium): the worker from the build gives mate in one,
and a position changed mid-search answers the new position (the browser's `stop`).

Live: (phone) the depth reached in 8 s and the heat over ten minutes.

**As built** (2026-10-06):
- `src/core/engine/uci.ts` (`parseInfo`: the score turned to White's side, bounds marked, info
  strings and PV-less lines left out; `parseBestmove`; `pvToSan`, cut at the first illegal
  move; `formatScore` as Qchess writes it) and `src/core/engine/search.ts` (`createSearch`:
  the lifecycle above; a request carries the position's legal moves, so a position with fewer
  moves than lines asked is done with what it has; bound lines aren't shown; a time limit
  reached counts as done; `bestmove (none)` marks mate or stalemate; `reset` after a restart).
- `src/platform/stockfish.ts` (the worker from the hashed URLs, the wasm's URL in its hash;
  mistake-lab's handshake with 10 s timeouts; commands queued until `readyok`) and
  `src/app/engine.ts` (the device's settings in localStorage `repworks-engine`; the files
  ensured through `blobs.ts` with progress, then the worker; the lines shown at most every
  100 ms; the 3 s watchdog after a `stop` and three failures in a row before giving up; hash 32
  MB, 16 on a narrow screen; stopped while hidden; one tab at a time over a `BroadcastChannel`;
  the threat as the position with the other side to move, its en passant square cleared, never
  when either side is in check). The panel (§5.31) is its first user.
- **`stop` works in the browser too**: in the container's Chromium the built worker answered a
  `stop` 1.5 s into `go infinite` within a second and searched the next position (the
  watchdog stays as the fallback mistake-lab's note asks for).
- Tests: `test/unit/core/engine/uci.test.ts`, `search.test.ts` (over a scripted engine: the
  first `go`, a new position's `stop` and later `go`, the stopped lines dropped, several
  positions in a row, no shallower line, bounds, the cache, more lines asked, the time limit,
  fewer moves than lines, no move, stop and reset), `test/unit/engine/stockfish.test.ts` (the
  vendored build under Node through the core search: its name, mate in one for each side
  scored from White's side, mate in two, the hanging queen with three lines best first, a
  position changed mid-search), and `test/e2e/stockfish.spec.ts` (desktop: the built worker's
  mate in one, `stop`, the next search).

#### 5.31 The engine panel on the study page (Qchess's engine bar)

- **The bar**, at the top of the panel (on the phone, under the move buttons, above the
  notation): the engine's switch, "SF18", "Depth 18" (no speed since 2026-10-11), "+" to go
  deeper once a search is done, the threat on W with no button since 2026-10-11 (Qchess's W: the
  position with the other side to move, its best move as a red arrow), ⚙ (`EngineSettings.tsx`: depth 20/30/40,
  lines 1–5, max time 5/8/30 s, arrows on or off; Qchess's defaults, lines 3 for the outline's
  MultiPV arrows). On or off per device, off by default; the settings per device.
- **The lines**: one row per PV: the eval from White's side (`+0.38`, `#3`, `-#2`), then the
  moves in SAN with move numbers, cut to the row on the phone. A move is a clickable line
  (§5.12's preview): the board shows the position after it, ◀ ▶ step, Back returns, and the
  preview bar's **Add** puts the PV up to the move shown into the chapter at the board's move
  (an ordinary edit: it follows moves already there and adds the rest as a variation; undo).
- **The eval bar** on the board's right edge (Qchess's place), White's win% (Lichess's formula,
  `core/engine/winning.ts`), turned with the board; a mate fills it.
- **Arrows** (chessground's auto shapes, never saved): the first move of each line, the best
  one darkest and thickest, the others fainter as their eval falls behind (mistake-lab's
  rule); the threat in red. They give way to the chapter's own arrows while a comment line is
  previewed.
- Never in training, Read or Play; the explorer and the engine are independent.

Tests: `winning.test.ts`, `shapes.test.ts` (the arrows' order and opacity by the eval gap,
mates); Playwright with a fake engine worker (scripted UCI, routed in the e2e server): the bar
switched on and remembered, the lines with evals from White's side after a Black move, the
eval bar's share, a PV move previewed and stepped, Add putting the line into the chapter and
undo taking it back, the threat arrow, a new move mid-search showing only the new position's
lines, the panel on the phone (nothing wider than the screen), nothing running in training.

Live (desktop and phone): beside Qchess's SF18 on the same positions (the best move the same,
evals close at the same depth); the arrows' readability; a line added and synced.

**As built** (2026-10-06):
- `src/ui/Engine.tsx`: the bar (a switch, "SF18", "Depth 18" or the download's
  progress, Retry after a failure, "+" once a search is done, ⚙; the threat ⌖ was dropped for W
  alone on 2026-10-11) at the panel's
  top on a wide screen and after the move buttons on the phone; one row per line (the eval in
  Qchess's format, then up to 16 moves numbered from the position, cut with an ellipsis); the
  eval bar (`EvalBar`: a 9 px column in the gap right of the board on a wide screen, a 6 px
  strip under it on the phone until 2026-10-21, when it was dropped there: the number beside the top line reads better; White's share growing from White's side); the arrows
  (`useEngineArrows`, chessground auto shapes; none while a line is previewed or in draw mode).
  `src/ui/EngineSettings.tsx`: depth, lines, max time, arrows, and the engine files' list.
  W toggles the threat on the desktop.
- **A line's move** opens the comment-line preview (`app/preview.ts` gained a `source:
  'engine'`): the bar reads "Engine: d4 d5", ◀ ▶ step, and **Add** plays the moves shown from
  the board's move (`playLine` in `app/editor.ts`, core's `addLine`: existing moves followed,
  the rest a variation), one edit with its undo. The threat's line isn't previewed (its
  position is not on the board).
- `core/engine/winning.ts` (Lichess's winning chances and the bar's share; a mate as 2100 less
  100 a move, at least 1100 centipawns) and `core/engine/shapes.ts` (Lichess's arrows: the best
  pale blue at 15, the others pale grey at 12 less 50 × half the gap in chances, none at a gap
  of 0.2 or more; the threat pale red).
- **The explorer gives up the engine's height**: on a wide screen its default height is half
  the panel less the engine section's (measured, `--engine-h`), and its largest height leaves it
  out too, so the notation, the card and the conflicts keep their room and the explorer's
  height stays constant between moves (§5.23's notes). On the tests' 1280×720 screen that is
  about 220 px instead of 257.
- Checked in the container's Chromium with the real engine: depth 20 at 1. e4 c5 2. Nf3 within a
  few seconds, desktop and emulated phone (screenshots looked at).
- Tests: `test/unit/core/engine/winning.test.ts` (chances, Qchess's bar at +1, mates, arrows
  from either side, the threat) and `test/e2e/engine.spec.ts` (desktop and phone, with
  `test/e2e/engine.ts`'s scripted engine served in Stockfish's place, padded to its size, its
  commands logged to the test server): off by default; on, the handshake, MultiPV 3 and `go
  depth 20 movetime 8000`; three lines with evals from White's side, the bar at 52.8% for
  +0.30, two arrows (the third line three pawns behind); a line's move previewed, stepped and
  added, then undone; the switch kept after a reload; Black to move scored from White's side;
  a finished position answered again from the cache with nothing sent; the threat (the start
  with Black to move, one red arrow, no eval bar); a position changed mid-search: `stop`, then
  the new `position`; nothing sent in training; nothing wider than the phone.

#### 5.32 Maia in a worker

- `core/maia/encode.ts` (pure), q_extension's encoding on chessops: `tokens(fen)` (64×12, from
  the side to move's view, flipped with the colours swapped when Black moves), `moveIndex`,
  `policy(fen, logits)` (softmax over the legal moves, the tail under 0.1% dropped, SAN from the
  real position), and `expectedScore(fen, valueLogits)` (Qchess's Ms: loss/draw/win to the
  mover's score, `w + d/2`).
- `core/maia/batch.ts`: q_extension's `createMaia` (one run at a time; requests made meanwhile
  share the next batch, up to 32; memo by position key and rating; in-flight sharing), the
  `run` and `defer` passed in.
- `src/platform/maiaWorker.ts`, a module worker: onnxruntime-web, wasm, one thread; the model
  from the engines' cache; messages `init` (→ `ready` or `missing`), `download` (→ `progress`,
  then `ready`), `policy {id, fen, elo}`, `scores {id, fen, sans, elo}` (the positions after the
  moves, in one batch), and a port for the explorer worker (§5.34). The page ends it after 90 s
  unused and when Maia is switched off (an ORT session holds hundreds of MB; Qchess and
  q_extension do the same).
- `src/app/maia.ts`: Maia's state (off, missing, downloading n%, loading, ready, error), the
  rating (per device: "as the explorer's filter" by default, or 600–2600 by 100), and
  `MaiaDialog.tsx`, Qchess's dialog: what Maia is, the one-time download of about 60 MB (a
  mobile-data warning on the phone), credit to CSSLab and maiachess.com, Download/Cancel, then
  the progress; Delete in the settings.

Tests: `encode.test.ts` (tokens of a position and its colour-flipped twin; indices of a
promotion and castling; the policy over given logits; the expected score from both sides) and
`maia.test.ts`, running onnxruntime-web under Node on the vendored model against
`test/fixtures/maia/reference.json`: 50 fixed positions (12 chosen: openings, en passant,
promotions with and without capture, castling both ways, endgames; 38 from seeded random games;
22 with Black to move) at five ratings, whose top five and value logits were computed by
q_extension's `maia.mjs` (`c26242f`) on onnxruntime-node 1.30.0 (`scripts/maia-reference.mjs`,
run once with both at hand). Checked: the same moves in the same order wherever the reference's
neighbours differ by more than 0.01, probabilities within 0.01, the expected score within 0.01;
and the onnxruntime-web values themselves stored, to 1e-6, so a change of runtime shows.
`batch.test.ts` (q_extension's: requests in one turn share a run, the memo, a failed run
rejecting its batch only). Playwright (desktop): the dialog, a download from the built site
with progress, the worker's top five on three fixture positions equal to Node's onnxruntime-web
(the same wasm, to 1e-6), Delete.

Live: (phone) the download on Wi-Fi, a position's time, the memory (the page not reloaded by
Android after ten minutes with Maia on).

**As built** (2026-10-06, with §5.33 in one push: the switch and the columns are how the worker
is reached):
- `src/core/maia/encode.ts` (`maiaTokens`, `moveIndex`, `legalMoves` in standard UCI, castling
  through `standardUci`; `policyFrom` on a chessops position; `expectedScore`; `maiaEloFor`,
  with this site's 400 group read as Lichess's 0), `src/core/maia/batch.ts`
  (`createMaiaBatch`: q_extension's queue, answering the policy and the value together, memo
  by position key and rating) and `src/core/maia/protocol.ts` (the worker's messages).
- `src/platform/maiaWorker.ts`: onnxruntime-web 1.30.0's **non-bundled** build
  (`ort.wasm.min.mjs`, aliased in `vite.config.ts`), its wasm and its 24 KB glue
  (`ort-wasm-simd-threaded.mjs`, a fourth engine file) from the engines' cache through
  `env.wasm.wasmPaths`: the default build points at its wasm with `new URL(…, import.meta.url)`,
  which the build copied into `assets/` (14 MB the shell would have precached). Batches run
  through the batch queue; `scores` gives Qchess's Ms (checkmate 100%, a drawn end 50%, else one
  less the score of the side then to move). The worker build gets the engines plugin too.
- `src/app/maia.ts`: settings in localStorage `repworks-maia` (on, the rating: 0 for the
  explorer's filter's); the worker started by the switch (and at start when left on), ended
  when switched off or after 90 s unused and started again by the next ask; "missing" opens
  `MaiaDialog.tsx` (Qchess's text, credit to the CSSLab, the size, a Wi-Fi note on a narrow
  screen, the progress), Download stores the three files through `blobs.ts`; the policy and
  the scores kept per position and rating for the session.
- Checked: **in the container's Chromium the worker's top five on three fixture positions equal
  onnxruntime-web's under Node to 1e-6** (the same wasm), and the explorer's Ml values at the
  start (1100) are the fixture's.
- Tests: `test/unit/core/maia/encode.test.ts` (tokens and the turned board, indices, castling
  and promotions, the policy over set logits from either side and from a batch's row, the
  expected score, the filter's rating), `batch.test.ts` (a turn's requests in one run up to the
  batch size, the memo and in-flight sharing, a failed run), `test/unit/engine/maia.test.ts`
  (the model's names; the 50 fixture positions: q_extension's order where clear, within 0.01,
  the score within 0.01, and onnxruntime-web's own values to 1e-6; the largest difference
  0.0043), `test/fixtures/maia/reference.json` from `scripts/maia-reference.mjs`, and
  `test/e2e/maia.spec.ts` (below).

#### 5.33 Maia in the explorer panel (Qchess's Ml and Ms)

- A **Maia switch** in the engine bar, as Qchess's "Maia3"; on, the explorer gains two columns
  before the bars: **Ml**, the move's likelihood at the rating (`9.5%`, `31%`), and **Ms**,
  Maia's expected score for the side to move after the move, for the first four rows (Qchess's
  `TOP_N`), `…` while asked. Maia's top four moves the table lacks are added as rows (purple
  names, "Maia" in place of the bar), placed as Qchess's novelties are. **Sort by Ml** (Qchess's
  `maia` order) in the menu and on the Ml title.
- Maia's answers kept per position and rating for the session; asked after the panel's 280 ms,
  the position left dropping its request. On the phone the two columns take the place the bar's
  labels leave (checked for overflow).

Tests: `table.test.ts` (Maia's rows added and placed, the Ml sort, rows the games and Maia
share); Playwright with a fake Maia worker: the switch, the columns' values and titles, Maia's
added row, the sort, nothing wider than the phone, Maia off in training.

Live (desktop): Ml and Ms beside Qchess's Maia3 at the same rating on three positions (the same
top four, likelihoods and scores within a point: both run onnxruntime-web).

**As built** (2026-10-06):
- The **Maia3** switch is first in the engine bar (Qchess's place); on, it opens the explorer.
  The rating is in the engine's settings ("As the explorer's filter (2150)", or 600–2600).
- `core/explorer/table.ts`: a row's `maia` (likelihood) and `maiaOnly` (Maia's top-four move
  the games and ChessDB lack, after the novelties, by likelihood), and the `maia` order (by
  likelihood, the rest by games); without Maia the order falls back to popularity, as Qchess's.
- `src/ui/Explorer.tsx`: Ml and Ms after the counts (Qchess puts them before the bars), Ml in
  blue as `9.5%`/`31%` (Qchess's `fmtProb`), Ms in gold for the first four rows, `…` while asked;
  Maia's rows purple with "Maia" in the bar's place; Ml's title sorts. The policy is asked
  120 ms after a position is shown. On a screen 480 px wide or less, with Maia on, the games'
  count gives way to the two columns (the share stays), and the Score/Prepared switch with it.
- Tests: `table.test.ts` (Maia's rows, likelihoods and order, and none without Maia) and
  `test/e2e/maia.spec.ts` on desktop and the emulated phone, with the real model: the dialog
  (its size and credit), Cancel leaving Maia off with nothing downloaded, Download, the columns,
  e4 and d4 from the games with Nf3 and c4 as Maia's rows, Ml as the fixture's, Ms filled, the
  Ml sort, nothing wider than the screen, Maia back after a reload with no download and no
  dialog, off again; and (desktop) the worker's numbers to 1e-6.

#### 5.34 Maia in the Practical column (q_extension's fill-in and preview)

- The explorer worker's `provider.maia` asks the Maia worker over a `MessageChannel` the page
  sets up, batched (`core/maia/batch.ts`); `service.ts` stops forcing `maia: false`. With Maia
  ready, q_extension's defaults apply: under 100 games Maia's policy is blended in as pseudo-
  games, under 10 Maia alone decides (`maiaUntil`, `maiaOnlyBelow`, `maiaWeight`), at the
  filter's rating (`maiaEloFor`).
- **The preview** (`createPreviewedSearch`, ported and switched off in §5.21): the same rows with
  Maia's predictions in place of games, fast because only ChessDB and Maia are asked. The Prac
  header switches the column between the Lichess values and Maia's (purple italics, q_extension's
  `qx-maia`); a value resting mostly on Maia is purple; the details say Maia's share.
- Settings: "Maia in the Practical column" (on once Maia is on) and the preview (on), under the
  explorer's settings.

Tests: `service.test.ts` (Maia asked for a thin position, the blend's weight, Maia missing
leaving the node a leaf, the preview's rows asking no explorer), the ported `pe.test.ts` Maia
sections now through the service; Playwright with fake Maia and explorer: a purple value, the
header switch, the details' Maia line.

Live (desktop): beside q_extension's column with Maia on (values within a point at the same
depth); (phone) a search's time with Maia.

**As built** (2026-10-06):
- `core/explorer/service.ts` (q_extension's `startRoot` with Maia): an injected `maia(fen, elo)`;
  with `options.maia` and Maia wired, `provider.maia` asks it (null once a row is stale, or on any
  failure, so a node goes on as without Maia and the result says `maiaMissing`); with
  `maiaPreview`, `createPreviewedSearch`'s preview runs beside, its providers asking no explorer
  and ChessDB at the lower priority, its updates marked `pass: 'maia'`, after the search has
  settled with a local explorer (`previewAfter`).
- The wiring: `app/maia.ts` hands `app/explorer.ts` a link while Maia is ready (its rating, and a
  `MessageChannel` whose one end goes to Maia's worker, the other to the explorer worker as
  `maiaPort`); the config then carries `maia`, `maiaElo` and `maiaPreview`. The explorer worker
  asks over the port with q_extension's 30 s timeout; Maia's worker tells the page it is busy
  (at most every 10 s), so the idle timer doesn't end it under a search. Values found with
  other Maia settings, or without Maia, are dropped when Maia comes, goes or changes rating.
- `app/practical.ts`: the preview's values kept apart; `practicalView` (q_extension's `peView`).
  The column: a value resting mostly on Maia (half or more) is purple; **the first click on Prac
  sorts by it, a click when sorted by it switches to Maia's values** (q_extension's rule,
  kept with the owner's sorting titles): "Maia" in purple italics, the cells in italics, the best
  green underlined purple, their details q_extension's `pePreviewTooltip`. The details gained
  q_extension's Maia lines ("Maia: 62% of this value (rating 2150)…", Maia unavailable, the
  preview's value). Settings: "With Maia on: its predictions fill in…" and "Maia's preview
  beside it", both on.
- Tests: `service.test.ts` (Maia off never asked; on: asked at the rating, its share of a thin
  value; unreachable: `maiaMissing`; the preview's values with Maia alone, its updates marked,
  no more explorer requests than without it) and `maia.spec.ts` (desktop and phone, the real
  model, a fake explorer with thin positions and a ChessDB knowing every position: values
  purple with Maia's share in their details, Prac sorted, then Maia's view and back, nothing
  wider than the screen).

#### 5.35 The analysis board (a scratch chapter) and "add to a chapter"

- `#/analysis/<fen>`: the study page's view over a chapter kept on the device only (never
  synced), with the engine, Maia and the explorer; a FEN pasted or the start position; from the
  home screen ("Analysis board") and from a move's menu ("Analyse from here").
- **Add to a chapter**: the scratch line from where it began into a chosen chapter whose tree
  reaches that position (the one it came from first), as a variation, synced like any edit.

Tests: `fsm.test.ts` (the route), Playwright: a FEN pasted and analysed with the fake engine,
the line added to the chapter it came from, nothing synced from the scratch board.

Live: one session on each device.

**As built** (2026-10-06):
- Route `#/analysis[?fen=…][&from=<sid>/<cid>&at=…]` (`core/app/fsm.ts`). The editor
  (`app/editor.ts`) opens the board as a chapter of a study that isn't one (`SCRATCH`): from the
  FEN, or the board as last left (localStorage `repworks-analysis`), else the start, turned to
  the side to move; its edits go to localStorage, never to the working copies, so nothing syncs.
- The chapter view in that form (`.scratch`): no chapter list, study settings, training switch,
  Read/Play or card; its head (`src/ui/Analysis.tsx`) has the title, a FEN box with Set up (the
  placeholder shows the board's start FEN, so it doubles as a copy of it), New, and **Add to a
  chapter…**: the line from the start to the move shown, into the chapter it came from (first,
  checked) or a repertoire chapter reaching the start (the index), by `app/analysis.ts`
  (`addLine` on that chapter's file, saved and synced), then that chapter opens at the line's
  end. The engine, Maia and the explorer work as on a study page.
- Entry points: "Analysis board" on the home screen, "Analyse from here" in a move's menu.
- Tests: `fsm.test.ts` (the routes) and `test/e2e/analysis.spec.ts` (desktop and phone: moves
  kept after a reload and nothing synced; no chapter list or training; a FEN set up turning the
  board; a bad FEN refused; the fake engine on the board; from a chapter's move, 2... e6 3. d4
  added back and synced as `(2... e6 3. d4)`). The move menu's tests list the new item.

#### 5.36 Threads (cross-origin isolation through the service worker)

Built if its check passes in the container's Chromium; else written up for the owner.
- The service worker adds `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` to the pages it serves, so the page is
  `crossOriginIsolated` from its second load (the first, before the worker controls it, runs
  one thread). Every cross-origin request the site makes is CORS (GitHub, Lichess, ChessDB, the
  local explorer), which COEP allows; Lichess's login is a redirect, which COOP allows (D17).
- When isolated, the multi-threaded lite build (`stockfish-18-lite.{js,wasm}`, npm 18.0.0) and a
  Threads setting (Qchess's 1/3/7; default half the cores, at most 4, on the desktop, and 1 on
  the phone).

Tests: Playwright on the built site: isolated after a reload, the GitHub, Lichess and ChessDB
fakes still answered, the threaded engine's `bestmove`, more nodes per second than one thread.

Live (desktop and phone): isolation, the login and the sync unaffected, the speed.

**As built** (2026-10-06): its check passed in the container's Chromium, so it is built, **as an
opt-in** rather than with the default planned above:
- With isolation always on, the whole e2e suite passed but for the offline starts: after an
  offline reload the page read "synced" where it reads "offline" (Playwright's offline emulation
  seems to reach the new process COOP opens only late; the page itself reported
  `navigator.onLine` false once asked). Harmless or not, it showed that isolation changes how
  every page loads, and the installed app on Android and the Lichess login under COOP can only
  be checked on the owner's devices. So isolation is on only while more than one thread is
  chosen: **Threads defaults to 1** (Qchess's 1/3/7 became 1, 2, 4, 8 as far as the cores go).
- `src/sw/sw.ts`: when the flag `isolate` is in Cache Storage `repworks-flags`
  (`src/platform/isolation.ts` writes it and tells the worker), every response it serves gets
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` and
  `Cross-Origin-Resource-Policy: same-origin`; the page is isolated from its next load.
- `vendor/stockfish/stockfish-18-lite.{js,wasm}`: npm `stockfish@18.0.0`'s threaded lite build
  (sha256 in the README), engine files like the others ("Stockfish 18 threads" in the list).
  `app/engine.ts` runs it, with `setoption name Threads value N`, when the page is isolated and
  more than one thread is chosen, else the single-threaded build; a change of threads ends the
  worker and the next position starts the right one. The bar reads "SF18 ×2"; the settings say
  a reload is needed and offer it.
- Tests: `test/e2e/threads.spec.ts` (desktop, the real threaded engine): not isolated by default;
  two threads chosen and the page reloaded: isolated, the threaded build downloaded and running
  at depth 16 or more as "SF18 ×2", an edit synced as before; back to one thread, not isolated
  after the next load.

#### 5.37 Phase 3 acceptance test, and exit

**Acceptance test (live, desktop + Android phone)**, on the owner's repertoire:
1. Desktop: the engine on at 1. e4 c5 2. Nf3 and two other positions beside Qchess's SF18 (the
   same best move, evals within 0.2 at depth 20); the lines, arrows and eval bar.
2. Phone: the engine on for a session: the depth in 8 s, the heat, off when the page is hidden.
3. Maia downloaded on both (the phone on Wi-Fi); Ml and Ms beside Qchess's Maia3 at one rating;
   still there offline after a reload.
4. A PV line previewed and added to a chapter on the phone, seen on the desktop after a sync.
5. The Practical column with Maia on a thin position, and the Maia preview.
6. The analysis board: a FEN pasted, analysed, its line added to a chapter.
7. If built: threads on the desktop.

**Phase 3 exit**: unit and e2e tests green; the acceptance test passed live; a week of use.

Risks:
- Memory and battery on the phone (Maia's session, onnxruntime-web and Stockfish): Maia's worker
  ends when unused, the engine stops when the page is hidden.
- The 60 MB download over mobile data: asked first, kept for good in the engines' cache.
- `stop` in the browser's worker (mistake-lab avoids it): a watchdog restarts the worker.
- onnxruntime-web's numbers differ from onnxruntime-node's by up to 0.0043 in probability:
  compared within 0.01; Qchess also runs onnxruntime-web (1.26), so it is the closer reference.
- COEP side effects if threads are turned on (§5.36).

Checks:
- Maia's top five against q_extension's Node runner on 50 fixed positions (the moves in order,
  within 0.01; the encoding exact);
- Stockfish's `bestmove` on fixed positions, under Node and in the browser;
- speed measured on the phone (TESTING.md).

### Phase 4: Intuition storm and puzzles

Planned on 2026-10-06, after Phase 3's build (through §5.36) and while its live checks wait for
the owner (TESTING.md). The parts below are in build order; each lists its tasks, the tests that
prove it, and what only a live check can show, on which device. Numbering goes on from §5.38.

**Scope**, from the outline the owner approved:
- **The storm** on the repertoire's frontiers (lichessable §27): positions from real games that
  went on past the end of one of the repertoire's lines (and, as lichessable's second source,
  past an opponent's reply the repertoire doesn't answer), the user to move, graded by how much
  winning chance the move gives up; a timed storm and an untimed set; the gathered positions kept
  so a session starts at once; the answers as progress events, so the record and what is done
  follow the owner across devices.
- **Puzzles** from games that played the repertoire's lines (lichessable §29): Lichess puzzles
  whose game passed through one of the repertoire's positions, from the published
  puzzle-explorer-data set, dealt among the storm's cards and answered, not graded.

**Sources, read for this plan** (2026-10-06, clones outside this repo):
- lichessable at `b435906`: `CLAUDE.md` (its section 27 notes), `DESIGN-intuition-storm.md`'s
  section map, then §1–§11 (the wire, the findings, the pipeline, the rules, the verdict, the
  clock, the producer), §14 (what shipped: the permission, the one-ply card, the producer, the
  ply range, the review, the invented line, the store, the tombstones, the line-end rule), §16
  (win probability), §17 (the set), §19 (uncovered replies), §23 and §26 (Stockfish at gather
  time, the walk's scorer), with the rest by headings; `DESIGN-storm-puzzles.md` in full;
  `content/puzzles.js`; `dev/check-storm.js` (its harness, its slice list and its section
  banners: 1,043 assertions, all passing at `b435906` under Node 22) and the shipped functions it
  executes (`stormFrontiers`, `stormDecisions`, `stormUncoveredMoves`, `stormUserEval`,
  `stormWinPct`, `stormWpLoss`, `stormPickReject`, `stormMoveLoss`, `stormMoverCp`, `stormGrade`,
  `stormPoints`, `stormCandidate`, `stormAdvance`, `stormReentered`, `stormWalkGame`,
  `stormRandomLine`, `stormCard`, `stormPickGames`, `stormDrawFrontier`, `stormRetain`,
  `stormDone`, `stormStoreDraw`, the set's four, `stormAnchorAdd` and the puzzle rules), and
  `CONFIG.storm`'s numbers; `DESIGN-ui-inventory.md`'s rules (one primary per state, one meaning
  per colour).
- puzzle-explorer at `a732ead`: `README.md`, `lib/offline.js` (`groupByShard`), `lib/cache.js`
  (the build stamp, shards as text), `lib/posKey.js`, and `index.html`'s data client
  (`DATA_BASE_URL`, `meta.json` once per load, `index/<hex>.json`, `puzzles/<hex>.ndjson`).
- puzzle-explorer-data at `8a7ba97`, sparsely: `meta.json` and 42 index shards and two body
  shards (below).
- Qchess's Intuition Storm lobby (`/intuitionstormlobby`), lichessable's model: three minutes, one
  move per position from real games, good within 0.3 of the best (+2), "alrightish" within 0.7
  (+1), worse −2, and afterwards every position of the run with an analysis board.

**Checked for this plan** (live from this container, and scratch code outside the repo, 2026-10-06):
- **`lichess.org/game/export/<id>` answers a web page, for a simple request only.** A `GET` with
  an `Origin` gets `200`, `application/x-chess-pgn` and `Access-Control-Allow-Origin: *`, but its
  preflight answers **404**, so a request carrying `Authorization` or any non-safelisted header
  fails in a browser. **`POST /api/games/export/_ids`** (up to 300 ids, `Content-Type:
  text/plain`, a simple request) answers the same way with both games of a two-id test, and its
  preflight answers 204; so one request fetches every game a gather pass picked, with no token.
  `explorer.lichess.org/masters/pgn/<id>` answers `*` too (the masters fallback lichessable kept).
  The explorer itself (`/lichess` and `/masters`) answers 401 without a token, so the storm's
  games need the Lichess login the site already has (D9); without one, the walk invents lines
  (lichessable §14.10).
- **ChessDB's `queryall` defaults to `learn=1`** (32 moves listed and 32 scored at 1. e4 e5
  2. Nf3 Nc6 3. d4, against 1 scored with `learn=0`), which is what the site's provider already
  sends: lichessable §3.3's only usable mode, with no change.
- **The dataset**: `meta.json` (built 2026-05-23): 4,096 index and 4,096 body shards, 3,697,478
  puzzles, `maxEmissionPly` 22, rating floor 1000, entries `[id, rating, colour, ply, startPly,
  themes]`, a puzzle's `fen` is the solver's position and `moves[0]` the solver's first move.
  An index shard is 0.9 MB (290 KB gzipped), a body shard 350 KB (86 KB gzipped, ~920 bodies,
  383 bytes each). github.io is refused by this container's proxy (as in §2); the phone read
  `meta.json` cross-origin in the spike (P1, §4.2).
- **The archive's size, measured on public repertoire studies** (Lichess studies `QrC8ydO1`, a
  Caro-Kann tree of 1,736 positions, `27vWwNxV` and `2gxtnutR`, keyed with the site's
  `positionKey` and hashed as the dataset does): positions at plies 12–24 (lichessable's anchor
  band) number 1,092, 660 and 537, in **950, 617 and 489 distinct index shards**, so scanning a
  whole repertoire downloads **~140–280 MB**. 40 of `QrC8ydO1`'s shards fetched from the dataset
  repo: 31 of 43 anchors have puzzles; filtered as lichessable does (the side that solves, the
  game's ply in the band) **664 puzzles, 663 distinct, in 617 distinct body shards** (median
  rating 1551): about 16,000 for the whole study, whose bodies alone would cost nearly every body
  shard (**~350 MB**). Kept, they are small: 383 bytes a body, ~50 a candidate (6 MB and 1 MB
  for all of them). So the archive's size on the phone is not the problem; the downloads are, and
  the design bounds them (§5.47).
- `src/core/sync/gitHash.ts`'s `sha1Hex` gives the dataset's shard names in core (no Web Crypto
  needed there); `positionKey` is the dataset's key already (D10).

**Decisions** (technical calls, each with its reason; in DECISIONS.md's revision log):
- **The answers are progress events (`k:"storm"`), and nothing else storm-related is synced.**
  The outline's "stats as progress events": an answer names its position (`s|<key>`) or puzzle
  (`z|<id>`), its band, and its chapter; the record, the positions done (answered well within 60
  days, lichessable's tombstone window) and the ones missed are replayed from the log on every
  device. Old devices skip the kind (the log's rule).
- **The gathered positions and the puzzles collected stay on the device** (IndexedDB, the cache
  tier of D5): they are third parties' answers (the explorer, ChessDB, Stockfish, the dataset),
  rebuilt anywhere. lichessable carried its store between devices because its devices each paid
  a Chessable wire; here the events already carry what matters (what is done, what was missed),
  and no new file kind goes into the data repo. If the phone's gather proves too slow (a live
  check), a per-device store file, one writer like progress, is the later step.
- **lichessable's rules are ported as they shipped**, numbers included (`CONFIG.storm`, below):
  the five win-probability bands (§16), the flat penalty, the streak, the pick and stop rules,
  the store's draw order, the set, the anchor band. Its Chessable plumbing is not (cards, the
  wire, the course page, host permissions): the repertoire index (§5.1) is the course tree, and
  the progress log is the wire.
- **Games through the explorer worker, in one batch per gather pass**: the explorer's
  `topGames`/`recentGames` (lichessable's relaxed filter: every speed, ratings 1000–2500, beside
  the panel's own requests and the same limiter), then the picked ids in one `_ids` export with
  no token; the masters PGN when lichess.org fails.
- **ChessDB scores the walk, Stockfish where ChessDB has nothing** (lichessable §26's `hybrid`),
  and **a stored position is re-scored by Stockfish when the device is idle on the storm's
  screen** (§23's standard: MultiPV 12 at depth 20; deepened positions dealt first), because
  ChessDB's best move is measured optimistic (a winner's curse, §23.1). Never `queue` or `store`
  (D9).
- **The storm is its own screen** (`#/storm`), from the home screen and a study's menu, with the
  repertoire, a study, a chapter or a position as its scope (lichessable §14.21, §28). Neither
  the engine panel nor the explorer is shown while a card is up; both are a press away in the
  review (§5.35's analysis board).
- **Puzzles: the index scan is bounded per press and the bodies are fetched as needed.** A
  collect scans at most 100 index shards (≈30 MB; the deepest anchors first, the rest on the next
  press), says the size first, and keeps candidates only; bodies come in grouped by shard for a
  working set of about 60, and stay (the archive). The base URL is a setting (D12), checked by
  reading its `meta.json`.

`CONFIG.storm`'s numbers, carried as they are (`src/core/storm/config.ts`): frontier lines of 4
plies at least; the user's eval at the frontier and the card within −100…+200 cp; offered from
ply 2 to 16 past the line's end (choices 1–8 and 4–24); walks stop at a 150 cp error by either
side or |eval| > 250; at least 6 moves scored; best − 5th ≥ 60 cp and best − 2nd ≤ 300; not in
check, not a forced recapture; win% by Lichess's `k` 0.00368208, evals clamped at ±1000; bands
under 3, 6, 10 and 20 points of win% (great +2, good +1, inaccuracy 0, mistake −1, blunder −2,
penalties flat, the streak multiplying up to ×4 every 4); three minutes, the clock running only
while a card waits for a move, the verdict up 2.6 s; a set of 6, three tries, clean on great or
good; two games a frontier (four when gathering), the invented line among the top 4 moves within
40 cp; replies of 3% and 20 games at least, four per position; the store at most 900, drawn by
misses (fewest first: misses go to the back, §14.15), then deepened, then reach, then at random; puzzles from anchors at plies 12–24 (clamped to
`maxEmissionPly`), ratings 1200–2600, a solved puzzle retired like a position.

Where the new code goes:

```
src/core/storm/    config.ts, grade.ts (win%, bands, points, the three tiers' loss), walk.ts
                   (candidate, pick rules, the game walk, the invented line), sources.ts (line
                   ends and decision points from the index, scopes), store.ts (draw, retirement
                   from events), set.ts, record.ts (events → the record), verdict.ts (the lines)
src/core/puzzles/  dataset.ts (shards, tuples, filters, themes), anchors.ts, puzzles.ts (candidates,
                   bodies, plies, draw)
src/core/progress/ events.ts gains `storm`; cards.ts gains `s|` and `z|`
src/platform/      stormStore.ts (IndexedDB: positions, candidates, bodies), puzzleData.ts (meta,
                   shards, grouped bodies)
src/app/           storm.ts (the session), gather.ts (the producer), puzzles.ts (collect, deal)
src/ui/            Storm.tsx (home, card, clock, verdict), StormReview.tsx, StormSettings.tsx
```

#### 5.39 The storm's rules in core, with `check-storm.js`'s assertions

- `src/core/storm/` (pure, the random source and the clock passed in), ported from the shipped
  functions: `winPct`, `wpLoss`, `grade` (five bands and `unknown`), `points` (the sign rule: a
  penalty flat, never multiplied), `moverCp` (Stockfish's White-relative score to the mover's,
  mates as 10,000 less their distance), `moveLoss` (the list tier, the child tier with its
  negation), `userEval` (flipped on the side to move in the position, never the line's side),
  `candidate` and `pickReject`, `advance`, `reentered`, `walkGame` (from the start through the
  game's moves to the frontier, then up to `maxPly` with the stop rules, the scores asked of an
  injected `ask`), `randomLine` (the invented walk), `pickGames`, `drawFrontier` (weighted by the
  lines ending there), the set's `clean`, `held`, `outcome` and `tally`, the verdict lines
  (`verdictLine`, `bestLine`: signed points, win% to one decimal under ten, "level with the best",
  the same move never named twice).
- On chessops: SAN, UCI and FENs through the site's own helpers (`standardUci`, `positionKey`), so
  castling is standard UCI, as ChessDB and Lichess's games write it.

Tests: `test/unit/core/storm/*.test.ts`, the assertions of `check-storm.js` sections 1–13 and
the pure parts of 14–17 (the perspective flip, the grader and the child negation, the bands
solved at equality against 30 and 70 cp within 5, the clamp and the mate cases, the flat penalty
on a long streak, every pick rule, the frontier set, the walk over a scripted ChessDB reaching
each stop, the card, the verdict lines with their wordings, the engine tier's flip as a
relation, the ply range, the invented line, the uncovered source's rules), translated from
Chessable variations to chapters; each file's header lists the assertions carried and those left
behind with why (the Chessable wire, cards, course pages, `chrome.*`). Each control lichessable
recorded is re-run once on the port (the change made, the named assertions failing, the change
undone) and listed in the file's header.

Live: none (pure).

**As built** (2026-10-07):
- `src/core/storm/config.ts` (`STORM`: `CONFIG.storm`'s numbers; `withPlyRange` folding the
  user's range in), `grade.ts` (`winPct`, `wpLoss`, `grade`, `points`, `nextStreak`, `moverCp`
  from core/engine's White-relative `Score`, `moveLoss`, `engineLoss`, `userEval`), `walk.ts`
  (`pickReject`, `candidate`, `advance`, `reentered`, `walkGame`, `randomLine`, `pickGames`,
  `drawFrontier`, `bestMove`; chessops positions, standard UCI, the site's `positionKey` for the
  frontier and re-entry where lichessable used three FEN fields), `set.ts`, `verdict.ts` (the two
  lines, the source labels and sentences, the uncovered note; "ChessDB cannot score it" became
  "nothing could score it", since Stockfish is asked too) and `games.ts` (`gamesFromPgn`: a batch
  export to ids and SAN moves, chessops's PGN parser in place of `stormPgnMoves`).
- Tests: `test/unit/core/storm/grade.test.ts`, `walk.test.ts`, `verdict.test.ts`, `set.test.ts`:
  sections 1–4, 6–13 and the set's and the random factor's assertions, each file's header listing
  what was carried, what was left behind (lichessable's slicing artefacts, its funnel counters,
  Chessable's paused flag and its wire) and the controls re-run on the port: ten mutations
  (the perspective flip, the engine flip, the child negation, a multiplied penalty, the spread
  rule, re-entry's side, the blunder stop's sides, the same-move guard, the points' sign,
  `unknown` held), each failing exactly the assertions its header names.

#### 5.40 Sources and scopes from the repertoire

- `core/storm/sources.ts` over the index (§5.1): **line ends**: each line's last position, keyed,
  with its side (the chapter's), the lines ending there (`n`), its names and chapters; lines
  shorter than 4 plies and chapters from a set-up FEN left out; an end both sides reach left out;
  an end where another line of the same side goes on left out (§14.18), and a walk stopping when
  it re-enters a position the side's lines answer (§14.18.4). **Decision points** (§19): every
  position where the opponent is to move that a line passes, with the replies the repertoire
  covers there; `uncoveredMoves` from the explorer's answer (3% and 20 games, four at most, by
  games).
- **Scopes**: the whole repertoire, a study, a chapter, or a position (§28: the lines through it,
  and their ends past it); a scope that leaves nothing says so (§14.21.3).

Tests: `sources.test.ts` on built chapters: the ends and their sides, the ambiguous end, the end
another line continues, a set-up FEN, the short line, a transposition into an answered position
stopping the walk, decision points and their covered replies (castling given in standard UCI by
the explorer and in SAN by the chapter), the scopes.

Live: none.

**As built** (2026-10-07): `src/core/storm/sources.ts`: `stormLines` (each repertoire chapter's
root-to-leaf lines with their positions, keys and movers; a set-up chapter marked), `coverage`,
`frontiers` (ends, converging lines, the ambiguous and the covered counted), `decisions`,
`uncoveredMoves` (by SAN), and the scopes (`lineInScope`, `inScope`; coverage stays the whole
repertoire's). Tests: `sources.test.ts` (sections 5 and 13 on chapters, and the scopes), with three
controls (the covered-end rule, the user's own moves as decision points, the explorer's UCI read
for its SAN).

#### 5.41 Answers in the progress log, and the record

- `core/progress/events.ts`: `k:"storm"` with `card` (`s|<positionKey>` or `z|<puzzleId>`), `b`
  (great, good, ok, bad, blunder, unknown), and optional `u` (the move, UCI), `wp` (the win% lost,
  in tenths), `m` (`"set"` for a set's first answer), `c` (`<sid>/<cid>`, the line's chapter).
  An unanswered card writes nothing.
- `core/storm/store.ts` and `record.ts`, replayed from the log: a position or puzzle is **done**
  once its latest answer is great or good, for 60 days; its **misses** are its answers since that
  weren't; the **record** per chapter and source (positions, replies, puzzles kept apart):
  answered, found (great and good), the average win% lost, the bands, the storm's and the set's
  answers told apart (§21).

Tests: `events.test.ts` (the kind read and written, bad fields refused, an old reader skipping
it), `store.test.ts` (done by any device's answer, the window's edge near the epoch, misses
counted, `unknown` neither), `record.test.ts` (the denominators: unknown out of both, the bands
summed, a set's answers marked).

Live: none.

**As built** (2026-10-07):
- `core/progress/events.ts`: `k:"storm"` as above (`b` one of the six bands, `wp` an integer of
  tenths up to 1000, `c` as `<sid>/<cid>`); `cards.ts`: `stormCard`, `puzzleCard`; replay folds
  the kind into nothing (the cards' FSRS states untouched).
- `core/storm/store.ts`: `stormHistory` (done: the latest graded answer clean and within 60 days;
  misses since it, `unknown` aside), `stormHistories`, `drawOrder` (done left out; then **misses
  fewest first**, lichessable §14.15's "misses go to the back", which the plan's first draft had
  reversed; then deepened, reach, random), `stormAnswer` (an answer's event). `record.ts`:
  `stormRecord` (positions and puzzles apart, by chapter, sets counted), `foundShare`, `averageWp`.
- The tests' example of an unknown kind was `storm`; it is `future` now (in the fixture data repo
  too), since `storm` is known.
- Tests: `test/unit/core/storm/store.test.ts` (the kind read and written, every bad field, a later
  version skipped; done and its window, a miss bringing a position back, the epoch; misses; the
  deal order; the record's denominators), with two controls (the draw hardest first, `unknown`
  counted as graded).

#### 5.42 The gather: positions found and kept

- **The explorer worker** gains `stormGames` (a position's `topGames` and `recentGames` at the
  relaxed filter, beside the panel's requests, through the same limiter and cache, priority under
  the panel's) and `pgns` (ids → one `POST /api/games/export/_ids`, text/plain, no token, one at
  a time, a 429 pausing it a minute; the masters PGN for a masters id or when Lichess refuses);
  and `scores` (ChessDB `queryall` through the existing provider, its cache keeping misses too).
- `src/platform/stormStore.ts`: positions by key (the FEN, the side, the ply past the end, the
  line's chapter and names, the move that arrived, the scored list with its source and depth,
  the reach in games, invented or not, when), at most 900, oldest out.
- `src/app/gather.ts` (lichessable's `harvestFrontier`): frontiers drawn by `n`; each scored once
  (the eval band at stage 0, one request a line); with games: two picked (four in a gather), the
  walk scored by ChessDB, Stockfish (MultiPV 6, depth 14) on a miss; with none, or no login: the
  invented line, by Stockfish. Survivors stored, a position twice never. **Gather** on the storm's
  home runs it with a count, the requests spent (explorer, games, ChessDB, searches) and Stop; the
  screen kept on (§5.7's wake lock); while a session runs, the producer keeps 3 cards ready from
  the store, and gathers only when it runs dry.

Tests: `gather.test.ts` with fake explorer, games and ChessDB and a scripted engine: a frontier's
positions stored with their list; no games → the invented line; no login → invented only; the
batch export asked once for a pass's games; ChessDB unknown → the engine's list; the caps; a
stored position not stored twice. `service.test.ts`: the new messages (the export's body and no
`Authorization`, a 429's pause, the masters fallback). Playwright (desktop): Gather on the fixture
repertoire with fake services: the count, the requests, Stop.

Live (desktop and phone): a gather on the real repertoire: positions per minute, requests per
position, the phone's time with the engine's share.

**As built** (2026-10-07, with §5.43 and §5.44 in one push: the storm's home hosts the gather):
- The explorer worker (`core/explorer/service.ts`): `stormGames` (the relaxed filter, four top and
  four recent games, Lichess's explorer even with a local one, priority 300), `gamePgns` (one
  `POST /api/games/export/_ids`, `text/plain`, no token, one at a time, a 429 pausing a minute and
  trying once more; masters games one by one from `/masters/pgn/<id>`), `scores` (ChessDB at
  priority 1). `providers.ts` gained `games`, `mastersGame`, the `games` filter field (its own cache
  key) and `gameIds` in the compact answer.
- `core/storm/harvest.ts` (pure, I/O injected): `harvestFrontier` (§26.4's branch: the explorer
  first; games → the hybrid walk, ChessDB with Stockfish on a miss and nothing on a transport
  failure; none or no login → Stockfish's invented line seeded with the line's last move; the band
  at stage 0 for one request), `harvestDecision` (§19: one explorer request, one score per reply),
  `cdbList`, `engineList`, `storedPosition`/`storedList` (every scored move kept).
- `src/platform/stormStore.ts`: IndexedDB `repworks-storm` (positions; puzzle candidates, bodies
  and meta for §5.47), positions by card, at most 900, the oldest out. `src/app/stormEngine.ts`:
  the storm's own Stockfish client (one position at a time over core's search, a search out of time
  taken at the depth it reached), ended when the screen is left.
- `src/app/storm.ts`: the scope's lines, ends and decision points from the repertoire chapters;
  `gather` (line ends and replies in turn, each from the chapter furthest behind its share (§5.116),
  each pass's positions stored, the requests counted:
  explorer, game exports, ChessDB, Stockfish); Stop. The screen is kept on while it runs.
- Tests: `harvest.test.ts` (games: one export, ChessDB's walk; ChessDB unknown → Stockfish 6PV
  d14; a ChessDB failure scoring nothing; no games → the invented line with no ChessDB; the band's
  refusal for one request; replies; the lists; a stored position's round trip),
  `explorer/stormService.test.ts` (the filter and the names, the export's POST with no token, the
  429 and its retry, the masters path, the scores), `platform/stormStore.test.ts`, and
  `test/e2e/storm.spec.ts` (below).

#### 5.43 The storm (timed)

- `#/storm[/<sid>[/<cid>]][?fen=…]`; "Storm" on the home screen, "Storm from here" in a move's
  menu, "Storm" in a study's settings. The home: the scope, the store's count (and how many are
  done), Gather, Start; the settings (ply range, source: line ends, replies or both).
- **A card**: the board turned to the side to move, the move that led there tinted, the line's
  name; one move. **The verdict**: the band's word and colour (green, dim green, neutral, amber,
  red: one ramp), the move's rank and win% lost, the best move; points, the streak; the clock
  (3:00, amber under 30 s) runs only while a card waits for a move. Grading: the stored list, then
  the child (ChessDB for a ChessDB list), then Stockfish on both positions (depth 20, 8 s) when
  neither answers; a Stockfish list below depth 20 (the walk's, not yet deepened) grades nothing,
  the move going straight to the two searches (§5.80), the board held shut meanwhile; `unknown` scores nothing and holds the streak.
- **The review** when the clock ends or on End (the card left on the board kept, unanswered):
  every position with the move played, its band and loss; the best move hidden until asked (`b`);
  Try again (`t`, scored nothing); Analyse (the analysis board, §5.35, with the engine and the
  explorer).
- Answers written as `storm` events; a done position leaves the store (great or good), a missed
  one stays, queued behind the positions not yet seen (§14.15).

Tests: Playwright (desktop and phone) with a store seeded through the page and fake ChessDB and
engine: a card, a great and a blunder with their points, the streak's multiplier, the clock
paused while grading, the review with the best hidden, Try again scoring nothing, the events
written and synced, the done position not dealt again, nothing wider than the phone, the engine
panel and explorer absent during a card.

Live (desktop and phone): a real three-minute storm on the repertoire: the cards' quality, the
verdicts against Qchess's feel, the waits.

**As built** (2026-10-07):
- Route `#/storm[/<sid>[/<cid>[?at=…]]]` (`core/app/fsm.ts`): "Storm" on the home screen, "Storm…"
  in a repertoire study's settings, "Storm from here" in a repertoire chapter's move menu (the
  lines through that move: a chapter's path rather than the `?fen=` first planned, so the lines are
  found without a search).
- `src/ui/Storm.tsx`: the home (the scope's ends and decision points, positions ready and done for
  now, Start storm, Set of 6, Gather/Stop with its progress and requests, the ply range and the
  source); a card (the board turned to the user, the arriving move tinted, the clock running only
  while a move is asked, points and streak, the band's word and colour on a five-step ramp, the
  verdict line, the best line with its source in its title; the next card after 1.2 s on a clean
  answer, 2.6 s otherwise; End); the review (every position, the one left on the board as "Not
  answered", the best move behind "Best move" (b) on the board, the panel and the list, Try again
  (t) scoring nothing, Analyse on the analysis board).
- The grade (`gradeMove`): the stored list; else ChessDB on the position after the move (a ChessDB
  list) or one Stockfish search of it (an engine list, §23); else two Stockfish searches (depth 20,
  18 on a narrow screen, 8 s each); `unknown` otherwise. Every answer a `storm` event with the
  chapter of the position's first line.
- Tests: `test/e2e/storm.spec.ts` (desktop and phone, a fake explorer naming games, a fake export
  and a ChessDB scoring every legal move): the home's counts, Gather (three exports, each a POST
  with no token), the clock, no engine panel or explorer, a great move (+2), a mistake (−1, the
  streak reset), the third card left unanswered, the review's hidden best move, the counts after
  (one done for now), two events synced, the record, nothing wider than the phone.

#### 5.44 The set (untimed)

- Six positions, no clock: great or good resolves; inaccuracy, mistake and blunder **hold** the
  card with Try again (three at most, the best move still hidden) and Show the move; then Next and
  Analyse. A second pass over those not found first time. The score is how many were found first
  time (`set.ts`'s tally). Only the first answer of the first pass is written (`m:"set"`).

Tests: Playwright: a held card, three tries, the move shown, the second pass, the tally, one event
per position.

Live: (phone) a set on the real repertoire.

**As built** (2026-10-07): in `src/app/storm.ts` and `Storm.tsx` as planned: six positions, a
held card's Try again (three in all, the best move hidden) and Show the move, Next position and
Analyse after a verdict, the second pass over the positions not found first time, the tally
("5 of 6 found first time · 1 of 1 in the second pass"), only the first pass's first answers
written (`m:"set"`). Tested in `storm.spec.ts` (desktop and phone).

#### 5.45 Stockfish's standard for the store

- On the storm's home with nothing else running (and never during a card), stored positions
  scored by ChessDB are re-scored by Stockfish: MultiPV 12 at depth 20 (§23's standard; a list
  below it doesn't count), deepened positions dealt first; the engine shared with the study page's
  through the one-tab rule (§5.30). A setting turns it off on the phone.

Tests: `gather.test.ts` (the deepen order, a list cut short not stored as deepened, the draw
preferring deepened); Playwright with the scripted engine (the count of deepened positions rising
on the home, stopping when a session starts).

Live: (desktop and phone) the time per position; whether the phone should deepen at all.

**As built** (2026-10-07): `core/storm/harvest.ts` (`needsDeepening`; `deepenedPosition`: an
engine list below depth 20, or of fewer than three moves, is not stored as deepened, §23.7.2) and
`app/storm.ts` (`deepen`: while the storm's home is open and no gather or session runs, the scope's
kept positions not done, MultiPV 12 at depth 20 with a minute each; it yields at once to a gather
or a session, cancelling the search in flight). On by default on a wide screen, off on a narrow
one; "Stockfish re-scores the positions while this page is open" in the home's settings. The home
says "Stockfish: 4 of 13 scored to depth 20 · scoring…". Tests: `harvest.test.ts` (the standard)
and `storm.spec.ts` (with the fake engine: `MultiPV 12`, `go depth 20`, and no search while a card
is up).

#### 5.46 The record

- On the storm's home: per chapter (and for the whole scope) the answers, the share found, the
  average win% lost, a five-colour bar of the bands; positions, replies and puzzles apart; the
  storm's and the set's answers told apart. From the events, so the same on every device after a
  sync.

Tests: Playwright: the record after a seeded log, and after a session.

Live: the record the same on both devices after a sync.

**As built** (2026-10-07): on the storm's home, the positions' record (answered, found, the
average win% given up, the sets' share, a five-colour bar), the puzzles' apart once there are
any, and a table by chapter (`study · chapter`, answered, found, given up, the bar; the bar left
out on a narrow screen), all from the events. Tested in `storm.spec.ts`.

#### 5.47 The puzzle dataset

- `core/puzzles/dataset.ts` (pure): the shard of a key or an id (`sha1Hex`, three hex), the tuple
  accessors and filters (colour, the game's ply, the puzzle's start ply, rating, themes: a
  missing field passes, a missing theme list passes but an empty one doesn't), the append-only
  theme list and its labels, `groupByShard`; `puzzles.ts`: a candidate from a tuple and its
  anchor, a ready puzzle from a body (refused if a move doesn't replay), its plies (the solver
  moves first: `moves[0]` is never the opponent's), the user's plies, the draw (misses, then at
  random).
- `src/platform/puzzleData.ts`: the base URL (a setting, default
  `https://skaeglund.github.io/puzzle-explorer-data/`), `meta.json` read once per load (its build
  stamp and `maxEmissionPly`), an index shard fetched and only the wanted keys' entries kept, body
  shards fetched for a group of ids; nothing sent but the `GET`s.
- The store gains candidates (by id: rating, colour, the game's ply, the start ply, the anchor's
  key and chapter) and bodies (the archive: kept across dataset rebuilds, a candidate whose body is
  gone fetched again).

Tests: `dataset.test.ts` (lichessable's `check-puzzles.js` cases: keys after a double push both
ways, shard names checked against Node's SHA-1, the filters and the missing-field rule, the theme
codes), `puzzles.test.ts` (`check-storm.js` §29, §29b, §29d: replay, the solver's plies, the
malformed body, the draw, retirement); a Playwright test with a fake dataset served by the e2e
server (two index and two body shards from fixtures cut out of the real ones, CC0).

Live: (phone and desktop) the base URL read cross-origin.

**As built** (2026-10-07):
- `src/core/puzzles/dataset.ts`: `shardOf` (core's `sha1Hex`), the tuple filters with the
  missing-field rule and the theme exception, the append-only theme list, `groupByShard`,
  `entriesFor` (an index shard's text, only the wanted keys parsed out), `bodiesFor` (a body shard,
  only the wanted ids' lines parsed), `readMeta`. `puzzles.ts`: `pliesBefore`, `anchors`,
  `selectEntries`, `puzzlePlies` (the solver first), `userPlies`, `readyPuzzle`.
- `src/platform/puzzleData.ts`: the base URL (normalized; anything but http(s) refused),
  `meta.json` once per page (asked again after a failure; a 3-character shard layout required),
  index and body shards by shard name only. Plain GETs, no token.
- The store holds candidates (by id), the ready bodies (the archive) and the scan record (the
  anchors read, the build stamp, `maxEmissionPly`); no shard is kept.
- Tests: `test/unit/core/puzzles/puzzles.test.ts` (on `test/fixtures/puzzles`, cut from the set at
  `8a7ba97`, CC0: every published key of a shard hashes to it and is a fixed point of
  `positionKey`; the filters; the readers; a body replayed with the solver first and refused when a
  move won't replay; the band by the shallowest ply, a set-up fragment out, both sides kept; the
  entries kept for an anchor), with two controls (`moves[0]` as the opponent's; the ply per line),
  and `test/unit/platform/puzzleData.test.ts`.

#### 5.48 Puzzles in the storm and the set

- **Anchors** (`core/puzzles/anchors.ts`): every position the scope's lines reach at plies 12–24
  (the shallowest ply any line reaches it at decides, plies counted in the game, a set-up chapter
  falling out), with the chapters' sides.
- **Collect** (the storm's home, beside Gather): says the size first ("about 30 MB: 100 of 950
  positions; on Wi-Fi"), then scans up to 100 shards, the deepest anchors first, keeping at most
  200 candidates an anchor, filtered by side, the game's ply and rating; the next press goes on
  where it stopped; "Collected: 950 of 950 positions, 16,000 puzzles" when done. Bodies for a
  working set of 60 fetched grouped by shard, in the background while the home is open.
- **Dealt** in the storm and the set at a share (a setting: 0, 10, 25 (the default once
  collected), 50, 75, 100): the board in the solver's position after the opponent's move
  (animated in a set, tinted in the storm); the solution walked as a training line, the
  opponent's replies played; the first wrong move ends it (blunder) or holds it in a set; solved
  is great. **The disguise** (§13): before the first move, a puzzle card and a position card read
  the same (the line's name only; no rating, depth or themes, "Find a good move" on both). The
  review prints all of it, the solution behind Show.
- Answers as `storm` events on `z|<id>`; solved puzzles retired for 60 days on every device.

Tests: `anchors.test.ts` (the band, the shallowest ply, a set-up chapter, both sides); Playwright
with the fake dataset: the size asked first, a collect, a puzzle dealt among positions, solved,
missed, the disguise's text before a move, the review.

Live (desktop, then phone on Wi-Fi): a collect on the real repertoire (its size and time against
the estimate); puzzles in a real session; the share that feels right.

**As built** (2026-10-07):
- `src/app/puzzles.ts`: the base URL and the share (0–100%, 25 by default) per device; `collect`
  (the scope's anchors not read yet, deepest first, at most 100 index shards a press, the entries
  kept, saved as it goes; a new build stamp starts the scan again and keeps the bodies), then
  `fillBodies` (the working set of 60, grouped by body shard, a body that won't replay dropping its
  candidate), also run in the background when the home opens and candidates wait.
- The storm's home: a Puzzles card ("3 ready · 3 found · 11 of 13 positions read"), Collect on two
  presses (the first says "Collect: about 30 MB", how many index files and that Wi-Fi is best),
  Stop, the share, the dataset's address. Start works with puzzles alone.
- The session: a puzzle rides as a card (`z|<id>`, its solver's position, the opponent's move that
  made it tinted); the solution's move or any mate goes on, the reply played 0.4 s later; solved is
  great, a wrong move blunder (held in a set; Try again starts it over; Show the move reveals the
  solution). **The disguise**: with puzzles in play, every card reads "Find a good move" and the
  line's name only (no "plies past the line", no rating, depth or themes) until a move; after it, a
  puzzle shows its solution, rating, how deep its game went into the line and its themes, as the
  review does. In a set the share is decided once, spread among the six.
- Tests: `test/e2e/puzzles.spec.ts` (desktop and phone, a fake dataset from the fixture bodies over
  a 26-ply White chapter): nothing asked of the dataset before Collect, the size on the first
  press, the collect (GETs only, no token), "Collected", the disguise, one solved through the
  opponent's replies (+2), one missed (−2), the review, the `z|` events synced, nothing wider than
  the phone.

#### 5.49 Phase 4 acceptance test, and exit

**Acceptance test (live, desktop + Android phone)**, on the owner's repertoire:
1. Desktop: Gather on the whole repertoire; the positions, the requests, the time.
2. Desktop: a storm and a set; the verdicts beside an engine's view of a few positions in the
   review; Analyse from the review.
3. Phone: a storm from a chapter and from a position; the answers on the desktop's record after a
   sync, and a position done on the phone not dealt on the desktop.
4. Collect puzzles on the desktop, and on the phone over Wi-Fi; puzzles dealt in both modes.
5. A week of daily storms.

**Phase 4 exit**: unit and e2e tests green; the acceptance test passed live; lichessable's storm
no longer used.

Risks:
- Porting a large body of measured rules: ported function by function with `check-storm.js`'s
  assertions and its controls re-run (§5.39).
- Gathering on the phone (the engine): ChessDB first, the engine only on a miss; the deepen pass
  can be turned off there; the store syncing is the fallback (decisions above).
- The dataset's 5 GB beyond Pages' documented 1 GB (D12): the base URL is a setting; R2 is
  puzzle-explorer's documented fallback.
- The puzzle downloads (~140–280 MB to scan a repertoire, more to hold every body): bounded per
  press and said first; bodies only for a working set.
- `/game/export` refusing pages one day (its preflight already 404s): the masters PGN and the
  invented line keep the storm going.
- Never ChessDB `queue`/`store` (D9).

Checks: the ported assertions and their controls; requests per position measured on the real
repertoire (TESTING.md); live sessions on the phone.

### Phase 5: Mistake review, and migration from mistake-lab

Planned on 2026-10-07, after Phase 4's build (through §5.48) and while the earlier phases' live
checks wait for the owner (TESTING.md). The parts below are in build order; each lists its tasks,
the tests that prove it, and what only a live check can show, on which device. Numbering goes on
from §5.49.

**Scope**, from the outline the owner approved (D8, D15, D5):
- **Games** from Lichess and chess.com, analysed offline by mistake-lab's analyzer (D8), and the
  mistakes, tactics and lost advantages found in them, as cards (`m|…`) on the site's own SRS.
- **Practice** from those positions: the mistake retried, the tactic played out, the advantage
  converted, and any position played on against a human-like opponent (the explorer's games,
  then Maia, then Stockfish), with a review of the game at the end, kept as history.
- **What the games say about the repertoire**: deviations from it in real games, whether drilled
  positions are answered better later (recidivism), the opponent replies that score badly (weak
  spots), and the variation checklist.
- **Plan cards** (`p|key`): recall of a position's idea, its content the position's comments.
- **Voice input** for moves while playing on.
- **The migration** of mistake-lab's progress (D15), dry run first, after which mistake-lab
  retires (D20).

**Sources, read for this plan** (2026-10-07, clones outside this repo):
- mistake-lab at `c525403`: `docs/architecture-reference.md` in full (item types and IDs,
  extraction and caches, the SRS grades, recidivism, sequence conversion, continuation practice and
  its persistence, game review history, advantage and tactic modes, detected tactics, the
  repertoire check, the variation checklist, weak spots, filter practice, plan cards, notes, the
  Gist's files and merge, voice, mobile); in `index.html`: `fetchGames` (the Gist path and the
  standalone Lichess path), `extractMistakesForGame` and `extractAllMistakes` (thresholds,
  advantage peaks and their exclusions, tactics from the analyzer), `posId`, `fsrs_review`,
  `recordReview`, `getCardForPosition`, `isDue`, `addCustomDeviation`, `gistRead`; `analyzer/analyze.js`
  in full by sections (its flags, the Lichess and chess.com fetchers, `normalizeChesscomGame`,
  clocks, `analyzeGame`, the tactic scanner and its thresholds, the Gist's games file and its
  `version: 2` object, the local `analyzed_games.json`).
- github/docs at `8794b3c` (`src/github-apps/data/fpt-2026-03-10`): the fine-grained token's
  Gists permission covers writes only (create, update, delete); reading a gist needs none.

**Checked for this plan** (live from this container, and scratch code outside the repo, 2026-10-07):
- **Lichess's game export answers a web page, with or without a token.**
  `GET /api/games/user/<name>` (`Accept: application/x-ndjson`, `evals`, `clocks`, `opening`,
  `pgnInJson`) answers `200` with `Access-Control-Allow-Origin: *`; its preflight answers `204`
  allowing `Authorization`, so the site's Lichess login can go with it (a faster stream). Without a
  browser `User-Agent` it answers 404 (curl's default), which a browser never meets.
- **chess.com's API could not be checked**: this container's proxy refuses `api.chess.com`
  (CONNECT 403), and so does `www.chess.com`. Third-party reports (a chess.com forum thread on
  "CORS errors on monthly game archives", an in-browser analyzer that proxies it) say the archives
  don't answer other origins. So chess.com games come through the analyzer, which runs in Node
  (no CORS), and the page's own chess.com fetch is tried once and says so when refused; the
  owner's browser settles it (TESTING.md).
- **The size of the game data**: 200 of the owner's public Lichess games (62 plies on average):
  3.6 KB a game as Lichess exports it, **4.3 KB in mistake-lab's analyzer shape** (plus its
  tactics' lines, a FEN on every move, ~1–2 KB where a game has one), so a Gist games file of
  1,000 games is about 5 MB. Kept on the phone in a compact form (the moves, the evals as
  integers, the clocks in seconds, the players, the result, the opening; tactics as UCI lines
  without FENs), **0.9 KB a game**: about 1 MB for 1,000 games, 5 MB for 5,000. The size on the
  phone is no problem; what matters is not re-reading a 5 MB file on every change (below).
- **The Gist from a page**: `api.github.com` answers any origin (§2); a gist file over 1 MB comes
  back truncated and is read from its `raw_url` (`gist.githubusercontent.com`), which mistake-lab
  already does from its own page every day. This container can reach neither (the proxy binds the
  GitHub API to the session's repositories and refuses the raw host), so the Gist is read live
  only on the owner's devices; the dry run is built against a fixture in the documented shape.
- **Mistake-lab's progress shape**, for the migration's fixture: `positions[pid].{srs, lastSeen,
  completed, invalidated, invalidatedLines, firstReview, recidGraded}` with `srs` as `fsrs_review`
  writes it (`state, stability, difficulty, reps, lapses, elapsedDays, scheduledDays`, `lastReview`
  an ISO time, `due` a local `YYYY-MM-DD`); `notes[key].{text, arrows, circles, drawInterval,
  updated, source}`; `planCards[]`; `repertoire.{studies, deletedStudies, customDeviations,
  dismissed, todoLists}`; `practiceScoreboard`, `practiceMistakes`, `practiceTactics`; the review
  history (`mistakelab_reviews.json`) and the eval cache (`mistakelab_evals.json`) in files of
  their own. pids: `<gameId>_<ply>` (mistake), `<gameId>_t<ply>` (tactic), `<gameId>_a<ply>`
  (advantage), `r_<key>` and `p_<key>`.

**The owner's choice** (asked, not yet answered; nothing waits on it but §5.66):
- **Where the analyzer's output lives once mistake-lab retires.** (a) **The data repo**, with the
  analyzer as its only writer: `games/<YYYY-MM>.jsonl`, one compact game a line, read by every
  device through the sync it already has (no second token, a month's file downloaded only when it
  changes, history in git). It needs the analyzer to write there: a small converter in this repo
  (`scripts/games-to-data.mjs`, run after the analyzer on its `analyzed_games.json` into a checkout
  of the data repo, then committed) or a patch to the analyzer (it is in mistake-lab, which
  Repworks sessions don't push to; a patch goes in TESTING.md as q_extension's did). (b) **The
  Gist, read-only**, as mistake-lab reads it: the analyzer unchanged, the gist's ID entered once
  per device, the whole file read again whenever the analyzer writes. **Recommended: (a), through
  the converter**, because the games then live with everything else and cost one small download a
  month; (b) is what the site does until the answer, since the migration reads the Gist anyway
  (§5.51), so nothing built now is wasted either way.

**Decisions** (technical calls, each with its reason; in DECISIONS.md's revision log):
- **Games are derived data on each device** (D5's derived tier): a compact record per game in
  IndexedDB (`repworks-games`), rebuilt from its source; only what the owner does with them is
  synced, as progress events. Two devices reading the same source compute the same items, and
  their pids are mistake-lab's, so a card means the same game move everywhere.
- **Game cards are `m|<pid>`, with mistake-lab's pid kept verbatim** (`m|abc123XY_17`,
  `m|abc123XY_t23`, `m|abc123XY_a31`, `m|_practice_…`): the migration then maps game cards one to
  one, and a game analysed before and after it is the same card. **Plan cards are `p|<key>`**, the
  key re-made through `positionKey` (D10). Their reviews are ordinary `review` events, folded by the
  same FSRS replay as the repertoire's.
- **Grades follow mistake-lab's rules** (its SRS section): a mistake by the win% the answer gives
  up (best or within 2 → Easy, 5 → Good, 10 → Hard, more or a hint → Again; a first wrong try
  recorded at once), a tactic by its line (perfect Easy, a hint Hard, a wrong move Again), a plan
  by the owner's own grade. Stockfish grades a mistake's answer on the device (§5.30's worker), as
  mistake-lab's pre-analysis does; the analyzer's evals are the game's, not the answer's.
- **New event kinds** (each skipped by older readers, the log's rule): `snapshot` (the migration's
  FSRS state of one card, D15), `drop` (an item, or one of a tactic's lines, taken out of the deck,
  and back with `on: false`), `relapse` (a drilled position met again in a later game and missed:
  an Again review at the game's time, once per card and game), `plan` (a plan card enrolled or
  removed), `dismiss` (a position's deviations ignored), `saved` (a practice item made on the site:
  a position and its line, the item itself in the event, since it comes from no game), `played` (a
  finished practice game, slim: its start, moves and classifications, for the history and
  recidivism), `practice` (a practice result at a position: win, draw or loss, with the checklist's
  preset).
- **A snapshot is applied only to a card with no review before it**: the site's own reviews win
  over a migrated state (as D19 has it for the repertoire), and the report counts the snapshots
  skipped that way.
- **Custom deviations become a repertoire study** ("From mistake-lab", one chapter per position from
  its FEN, with the move), not events as D15 first said: a move to play at a position is repertoire
  content, the site owns the studies (D3), and the trainer and every repertoire tool then know it;
  its cards start new (D19). Dismissals and plan enrolments stay events.
- **Lichess's export from the page** fills in games the analyzer hasn't seen yet: deviations and
  weak spots need only moves, and Lichess's own server analysis (where the owner asked for one)
  gives their mistakes. The analyzer's record of a game replaces the page's.
- **The opponent in practice is mistake-lab's chain**: the explorer's games at the practice filter,
  a move drawn weighted by games (not the top move); then Maia (§5.32) at its rating; then
  Stockfish. Practice is never graded into a card except where mistake-lab grades it (advantage
  items, through the drill's end).
- **Recidivism is derived**, as mistake-lab's: from the games, the cards' first reviews (replay) and
  the `relapse` events already written; the auto-reschedule writes one `relapse` event per card and
  game, so two devices that both find it fold it once.
- **The screens**: `#/games` (the games, their filters, a game's review), `#/games/review` (the
  game cards due, as a session), `#/games/<id>` (one game), `#/practice?fen=…` (playing on from a
  position), `#/repertoire-check` (deviations, weak spots, the checklist), with "Games" on the home
  screen beside Storm. Plan cards are reviewed in the game cards' session and enrolled from a
  chapter's move menu.

Where the new code goes:

```
src/core/games/    record.ts (the compact game, from mistake-lab's shape, Lichess's and chess.com's),
                   positions.ts (keys, moves and evals per ply), extract.ts (mistakes, tactics,
                   advantages), items.ts (pids, cards, saved items, drops), grade.ts, queue.ts,
                   deviations.ts, recidivism.ts, weakSpots.ts, checklist.ts, practice.ts (the
                   opponent's pick, the game's review), voice.ts, migrate.ts (the dry run's report
                   and the events)
src/core/progress/ events.ts gains the kinds above; cards.ts `gameCard`, `planCard`; replay.ts
                   folds `snapshot`, `relapse`
src/platform/      gamesStore.ts (IndexedDB `repworks-games`), gist.ts (a gist's files),
                   lichessGames.ts (the user's export as a stream), voice.ts (Web Speech)
src/app/           games.ts (sources, extraction, the deck), gameTrainer.ts, practice.ts,
                   repertoireCheck.ts, migrate.ts
src/ui/            Games.tsx, GameReview.tsx, GameTrainer.tsx, Practice.tsx, RepertoireCheck.tsx,
                   Migrate.tsx
scripts/           games-to-data.mjs (if the owner chooses (a))
```

#### 5.50 Games in core

- `core/games/record.ts`: the compact game (`GameRecord`: id, platform, time, speed, rated, the
  user's colour, the opponent and both ratings, the result and how it ended, the opening's name, a
  start FEN when not the standard one, SAN moves, evals per ply as White-relative centipawns or
  mates, clocks in seconds, the analyzer's tactics as UCI lines, the source, and whether the
  analysis is the analyzer's or Lichess's). Readers: mistake-lab's analyzer game (Lichess's JSON
  plus `analysis`, `clocks` already in seconds once `_clocksStamped`, `tactics`, `_playerColor`,
  `_source`), Lichess's export (`clocks` in centiseconds, `analysis` with `best` and `judgment`
  kept as evals only), and chess.com's archive game as the analyzer normalizes it. The user's
  colour by mistake-lab's rule (`usernames`, the name or the id, then `_playerColor`).
- `positions.ts`: a game replayed once with chessops (moves that won't replay end it there, as
  mistake-lab's `break`), giving each ply's position key, SAN and standard UCI.

Tests: `record.test.ts` on fixture games (public Lichess games, CC0, cut to a few): each shape read,
the colour rule, clocks in both units, a chess.com game, a start FEN, a game with an illegal move
cut and reported; `positions.test.ts` (keys against `positionKey`, castling as standard UCI).

Live: none.

**As built** (2026-10-07): `src/core/games/record.ts` (`readGame`, `readGamesFile`, `userColor`,
`resultFor`; evals as `{cp}` or `{mate}`; chess.com's result, ratings and time loss read from the
PGN, as mistake-lab's `getGameResultInfo` and its advantage rule read them; a missing `rated` read
as rated, as mistake-lab does), `positions.ts` (`replay`: one FEN a ply, the key its first four
fields, the game's own SAN kept), and `chesscom.ts` (`readChesscomGame`, the analyzer's
`normalizeChesscomGame` on chessops's PGN parser, clocks from `%clk`). Tests:
`test/unit/core/games/extract.test.ts` (with §5.52's) on `test/fixtures/games` (its README says how
they were made: 16 public Lichess games run through mistake-lab's analyzer's tactic scan with the
vendored Stockfish, and mistake-lab's own test game with seven variations).

#### 5.51 Where the games come from

- `platform/gist.ts`: a gist's files by ID (`GET /gists/<id>`, a truncated file read again from
  its `raw_url`), with the data repo's token when it is a GitHub token (reading a gist needs no
  permission) and none otherwise; ETag kept, so an unchanged gist is a 304.
- `platform/lichessGames.ts`: the user's games since the newest kept one, streamed as NDJSON
  (`/api/games/user/<name>`, `evals`, `clocks`, `opening`, `since`), with the Lichess login when
  there is one.
- `platform/gamesStore.ts`: IndexedDB `repworks-games`: games by id, the source's stamp (the gist's
  ETag, the newest Lichess game), and the items extracted per game with the extraction's version.
- `app/games.ts`: settings on this device (the gist's ID, the Lichess and chess.com names, a date
  limit as mistake-lab's: all, 3, 6, 12 or 24 months), a refresh on opening Games and from its
  button, the counts ("1,214 games · 980 analysed · read from the Gist 2 minutes ago").

Tests: `gist.test.ts` and `lichessGames.test.ts` with fake fetches (the truncated file, the 304,
the stream cut mid-line, a 429), `gamesStore.test.ts` (fake-indexeddb); Playwright: Games set up
with a fake gist and a fake Lichess, the counts, a refresh adding one game.

Live (desktop, then phone): the real Gist read; the time and the size; Lichess's stream with the
login; chess.com from the page (expected to be refused; the page says so).

**As built** (2026-10-07): `src/platform/gist.ts` (`gistId`, `readGist`: no token unless given, the
raw URL without one, the ETag), `lichessGames.ts` (`userGames`, 300 a refresh, `since` the newest
Lichess game kept), `gamesStore.ts` (IndexedDB `repworks-games`: games and meta; an analyzer's
record never replaced by a page's export), `src/app/games.ts` (the settings on this device:
the gist, the Lichess and chess.com names, the date filter, new cards a day; Refresh, with a line
per source; chess.com's archives tried from the page, the last two months, and said to come through
the analyzer when refused). The items are not stored: each game's are extracted when first read and
kept in memory for its record (0.8 s for 1,000 games in Node; the repertoire filter applied after,
below). Tests: `test/unit/platform/games.test.ts`, and `test/e2e/games.spec.ts` (below).

#### 5.52 Mistakes, tactics and advantages found

- `extract.ts`, a port of `extractMistakesForGame` and the advantage pass of `extractAllMistakes`:
  a mistake where the user's move gives up more than 10 points of win%, with its clock (time
  trouble: under 45 s left and under 10 s spent); repertoire moves left out (the repertoire index's
  moves for that side, §5.1, where mistake-lab used its trie); tactics from the analyzer's (three
  plies and two user moves at least); advantages: from ply 16, the user at +300 for two moves
  running, the highest such position not inside a tactic, dropped when the user won, lost on time
  while still ahead, or collapsed in time trouble, and replacing the mistakes from its ply on.
- The extraction's version and its parameters (10, 300, 2) kept with each game's items, so a change
  re-extracts.

Tests: `extract.test.ts` on the fixture games, with **the same per-game counts as mistake-lab's own
`extractMistakesForGame`**, run once in Node on those games by a scratch harness (its expected
counts, ids and win% drops recorded in the fixture with that provenance), and each rule in
isolation (the threshold's edge, the clock rule, the repertoire move left out, a tactic too short,
each advantage exclusion, the replacement).

Live: (desktop) the counts on the owner's real games beside mistake-lab's Review tab.

**As built** (2026-10-07): `src/core/games/extract.ts` (`extractGame`, `shownItems`; an advantage
keeps the mistakes it replaces, so dropping it gives them back, as mistake-lab's invalidated
advantage does). **The same items as mistake-lab on all 24 fixture games** (83 items: mistakes with
their win% drops, cp and time trouble, two analyzer tactics, the advantages and each exclusion),
against `mistake-lab-items.json`, which mistake-lab's own `extractMistakesForGame` and advantage
pass produced (cut out of `index.html` at `c525403` and run in Node with chess.js 0.10.3). Three
controls re-run (the advantage from ply 15, `heldAdvantage` reset, the clock rule's previous ply),
each failing the assertions its test's header names; two of them failed nothing on the real games
at first, so `synthEdge15` and `synthHeld` were added to the fixture. The repertoire's moves are
left out after extraction (the app's cache, §5.51), which is mistake-lab's own post-filter.

#### 5.53 Game cards, their events, and the deck

- `progress/events.ts`: `drop`, `relapse`, `plan`, `dismiss`, `saved`, `played`, `practice` and
  `snapshot`, each with its fields checked and an older reader skipping it; `cards.ts`: `gameCard`
  (`m|<pid>`), `planCard` (`p|<key>`); `replay.ts`: `snapshot` and `relapse` folded (above), the
  others into nothing.
- `items.ts` and `queue.ts`: the deck (every item not dropped, saved items from `saved` events,
  dropped tactic lines left out, a tactic with none left out with it), the day's game cards due and
  new (a daily limit of new game cards, a setting, 10 by default; mistake-lab had none, but its
  queue was its whole backlog), ordered as mistake-lab's (due first, then new by the size of the
  drop).

Tests: `events.test.ts` additions (each kind read, written, refused when malformed, skipped by an
old reader), `replay.test.ts` (a snapshot taken, a snapshot after a review ignored, a relapse once
per game, a relapse older than the last review ignored), `queue.test.ts` (the deck, drops, the
limit, the order).

Live: none.

**As built** (2026-10-07): the eight kinds in `core/progress/events.ts`; `cards.ts`: `gameCard`,
`planCard`, `dismissCard`, `historyCard`, `practiceCard`, `checklistCard`; `replay.ts` folds
`snapshot` (its due the last review plus its interval) and `relapse` in helpers kept out of the
fold's loop (inline, they slowed the 100,000-event replay past its 200 ms budget); `core/games/deck.ts`
(`dropsOf`, `deckOf`, `gameQueue`: the limit counts cards first reviewed today, a snapshot's not)
and `grade.ts` (§5.55's rules). Tests: `test/unit/core/games/deck.test.ts`, one control (a snapshot
after a review); a relapse applied twice fails nothing, since the guard on the last review already
holds it, and the test's header says so.

#### 5.54 The Games screen

- `#/games`: the games, newest first, each with its opponent, result, speed, opening and its counts
  of mistakes, tactics and advantages; filters as mistake-lab's (colour, speed, rated, platform,
  hide time trouble), kept on the device; the day's game cards ("12 due · 5 new", Review); the
  sources and Refresh.
- `#/games/<id>`: the game on the board, stepped with ← → and its notation, the eval graph from its
  evals, its items marked on the graph and in the notation; "Practise from here" at any move.

Tests: Playwright (desktop and phone) with the fixture games: the list, a filter, a game's graph and
items, nothing wider than the phone.

Live: (phone) the list's speed on the real games.

**As built** (2026-10-07): `src/ui/Games.tsx` (`#/games`: the game cards' counts and Review, the
sources, the filters (colour, rated, platform, speeds), the list fifty at a time; `#/games/<id>`:
the board stepped with the buttons and ← →, the evaluation graph from the user's side with the
items marked (a click moves to the ply), the moves with the items coloured, each item with Drop or
Put back, Analyse this position, On Lichess). "Games" on the home screen beside Storm. "Practise
from here" comes with §5.57. Hide time trouble is kept in the settings, not yet in the list.

#### 5.55 The mistake trainer

- `#/games/review`: the deck's cards in turn. A mistake: the board at the position before it,
  turned to the user, the game's move hidden; the user's move graded by Stockfish (the position's
  best line at depth 16–22, mistake-lab's adaptive depth, then the position after the move), the
  verdict in mistake-lab's six words and colours (best, excellent, good, inaccuracy, mistake,
  blunder; great and miss by its context rules), the grade recorded on the first try; a wrong move
  shows the engine's line and Try again (three tries, then the best move), Hint (the piece, then
  the arrow) grades Again; Skip grades Again. Then: Play on (§5.57), Show the engine's line, View
  the game, Drop this item.
- A tactic: its line played, the opponent's replies after 0.4 s, alternative lines in turn, a line
  dropped by the owner; graded as above.
- A plan card (§5.61) and an advantage (§5.57) open their own boards from the same session.

Tests: Playwright (desktop and phone) with the scripted engine: a mistake answered with the best
move (Easy) and with a worse one (Again, Try again, the best move shown), a hint, Skip, a tactic
through its reply and an alternative line, a dropped item gone from the deck after a sync, the
events written.

Live: (desktop and phone) a real day's game cards; the engine's waits on the phone.

**As built** (2026-10-07): `src/app/gameTrainer.ts` and the session in `Games.tsx`. A mistake: the
position's three lines searched as the card opens (the storm's Stockfish client, depth 18, 16 on a
narrow screen, 8 s), the move judged from them or from one search after it (a mate +10,000, a
stalemate 0), mistake-lab's word and colour, the first try's grade recorded at once; Try again up
to three tries, Show the move, Hint (the piece, then the arrow: Again); Skip (Again), Next, View
the game, Analyse, Drop. A tactic: its live lines through `core/games/tactic.ts` (the replies after
0.4 s, a move of another line switching to it, the next line from where the opponent's reply
differs; a line leaving a solved one at the user's own move is mistake-lab's optional kind and not
asked), Drop this line. Advantages are left out of the session until §5.57 and counted. Tests:
`test/unit/core/games/tactic.test.ts`; `test/e2e/games.spec.ts` (desktop and phone: the Gist and
Lichess read, a game opened and stepped to its mistake, a mistake answered best (Easy), one with a
blunder then Try again (Again), the tactic with a wrong move then both lines, three reviews synced,
nothing wider than the phone; it waits on the moves played, `data-step`, never on the phase alone).
The engine's line after a move came with §6's first item (below).

#### 5.56 Saved items: sequences and practice mistakes

- A mistake made into a sequence (mistake-lab's sequence conversion): from the analysis board
  (§5.35) opened on the position, the lines built there saved as a tactic (`saved` event) with the
  5-win% validation; a mistake made while practising saved as a practice mistake.

Tests: unit (the validation, the dedup by position and line); Playwright: a sequence saved and
drilled.

Live: (desktop) a sequence made from a real mistake.

**As built** (2026-10-07): `src/core/games/saved.ts` (`readSavedItem`, `savedItems`: a card's latest
`saved` event, naming its own card; `sequenceLines`, mistake-lab's tree walk; `validateSequence`,
its `validateSequenceLines`; `sequenceItem`, `practiceMistakeItem` and their dedup rules), the deck
reading them (`savedDeck` in `src/app/games.ts`), `src/app/sequence.ts` and the analysis board's
"Save as a sequence…" (`#/analysis?fen=…&seq=<pid>`, opened by "Make a sequence" on a mistake card
or a game's mistake; `seq=*` for one from a practice game's review, §5.57): Stockfish checks each
position where the user moves (three lines, the trainer's depth, twelve positions at most, the rest
listed as not checked), the warnings link to their move on the board, and a sequence made from a
mistake card drops that card. Practice mistakes are saved from the practice game's review (§5.57).
Tests: `test/unit/core/games/saved.test.ts`, with **the same warnings as mistake-lab's own
`validateSequenceLines`** on eight cases (`test/fixtures/games/sequences.json`, recorded by
`mistake-lab-sequences.cjs` from its code at `c525403`; two controls); `test/e2e/games.spec.ts`
(desktop and phone: a sequence built from a game's mistake, its warning, saved, the mistake gone
from the deck, the sequence drilled and synced). Also fixed: the game trainer's board now sends
castling as standard UCI (e1g1), as the analyzer's lines and Stockfish write it.

#### 5.57 Practice: playing on, advantages, and the game review

- `practice.ts`: the opponent's move (the explorer at the practice filter, weighted by games, with
  minimum games and share; Maia at its rating and precision when the explorer has nothing; then
  Stockfish), silent or with feedback per move; the end (mate, draw, a claim of victory at +1000
  three times, Stop); the review: every user move classified by Stockfish in the background
  (depth 22), the accuracy, the eval graph, the key moves with Retry and Show the line.
- The eval graphs (the games' and the practice review's) as chess.com draws its game-review
  graph: White's area light and Black's dark, so the colour says who is ahead, and the user's side
  at the bottom as on the board and the eval bar beside it, so the curve rises as the user's game
  gets better; for a Black game White's area hangs from the top. Heights are Lichess's winning
  chances, as the eval bar's. (Lichess keeps White at the bottom whatever the side; until
  2026-10-26 the user's side was drawn light, which read as White ahead in a Black win.)
- Advantage cards: the drill from the peak, silent, ended as mistake-lab ends it (600 cp is good
  enough), graded by its outcome.
- A finished practice game of at least five user moves becomes a `played` event (the history:
  reopened from Games, merged into its list as mistake-lab's review history).

Tests: unit (the opponent's pick with a seeded random, the ends, the accuracy); Playwright with
the fake explorer and engine: a practice game to Stop, its review, the history entry after a
reload and on the other device after a sync.

Live: (desktop and phone) a practice game; the opponent's feel against mistake-lab's.

**As built** (2026-10-07): `src/core/games/practice.ts` (`pickExplorerMove`, `maiaPick`,
`trackAdvantage`, `advantageGrade`, `resultOf`, `reviewOf`, `historyEntry`, `readHistoryEntry`,
`historyOf`: mistake-lab's defaults, 5 games and 5% of the position's, Maia at 2000 and precision
0.75, the explorer at 1600–2000 blitz to classical), `src/app/practice.ts` (the game: the explorer
worker's `practiceGames` at the practice filter with the Lichess login, Maia's policy when Maia is
on, then Stockfish; each user move judged by the game trainer's Stockfish client in the
background, at its depth (18, 16 on a narrow screen) rather than mistake-lab's silent depth 22, so
the phone isn't kept searching; an advantage drill waits for each judge, as mistake-lab's does,
so a collapse ends it before the opponent answers, and has no hint, as mistake-lab hides it there;
Claim victory after three moves at +10; the result as a `practice` event at the start's position, the
grade of an advantage card, the history entry once the judges are in) and `src/ui/Practice.tsx`
(`#/practice?fen=…[&side=…]`, from a game's move ("Practise from here"), a mistake answered ("Play
on"), and the analysis board ("Practise"); the review: the result, the accuracy, the graph, the moves
with their marks, the key moves with Retry, Show the line, Save as a mistake (§5.56) and Make a
sequence; the opponent's settings kept on the device; `#/games/history/<id>` reopening a review).
Advantage cards are in the game cards' session now. The history is merged into the games list by
date (colour and speed filters, the correspondence bucket, as mistake-lab's). Tests:
`test/unit/core/games/practice.test.ts`, **the same answers as mistake-lab's own code** on every case
of `test/fixtures/games/practice.json` (`mistake-lab-practice.cjs` runs its functions at `c525403` in
a sandbox; two controls), and `test/e2e/practice.spec.ts` (desktop and phone: a game against the fake
explorer stopped after five moves, its review, a practice mistake saved, the history after a reload,
the events synced; an advantage card's collapse graded Again). The corrected-deviation banner and
resuming a game after a reload came with §6's second item (below).

**Move feedback off by default** (2026-10-09, the owner's request): a game from a position no longer
shows each move's classification while it is played (the feedback line's word, the move list's
symbols) unless "Move feedback" under the moves is ticked; the setting is kept on the device
(`repworks-practice-feedback`) and can be changed mid-game. The review at the end is unchanged; the
drills (advantage, checklist) stay silent; the opponent's source is still shown. Tests: the practice
e2e checks it off, on, and off again.

**Take back** (2026-10-26, the owner's request: "in case of a misclick" against Maia or the
database): a game from a position and a checklist's drill have Take back beside Hint while the game
is in play and the user has a move on the board: the user's last move goes, with the opponent's
answer when it has come, and the user is to move again. Taken back while the opponent thinks, its
answer never lands (the game goes on under a new `gen`, as a resume does). The moves kept keep their
judges (those still out asked again), the Claim Victory count is counted again over them, and a move
that corrected the repertoire check keeps its "you first tried" note when taken back and played
again. An advantage drill has none: it is graded. Takebacks aren't counted or shown in the review.
Tests: the practice e2e takes back after an answer and while the opponent thinks (desktop and
phone).

**The review reworked** (2026-10-07, the owner's note: "more like mistake-lab", whose Game Review
was read at its current `main`: `showReviewKeyMoveInfo`, `showReviewBestArrow`,
`showReviewBestLine`, `showReviewRefutation`, `handleReviewRetryResult`): the board with an eval bar
beside it (the judges' scores, `positionEvals`: before and after each user move, an opponent's move
by the next user move's; a position no judge scored searched once; a line's own score while it is
shown) and the move's classification as a badge on its square's corner; ⏮ ◀ ▶ ⏭, ← → Home End
through the whole game, opened on its last move; the summary (the result, the accuracy, the tally
in mistake-lab's colours, the graph with the key moves as dots, the key moves); the move's card
(its word and colour, the loss, the repertoire's note, ↺ Retry, Show best (the board before the
move, the best move's arrow green and the move played red, the best move named), Show line (the
best move and Stockfish's line after it, ten plies), Show refutation (the move and the opponent's
best answer, opened on the answer; more than 5 points given up, mistake-lab's rule), Save as a
mistake, Make a sequence, ◀ ▶ between the key moves); a retry's result as mistake-lab's card (★
Best move!, better than the original, its own Show best, Show line and Show refutation, Try again,
Next key move); the lines are the game cards' engine line (`core/games/engineLine.ts`, a `plies`
option): stepped, extended past their end, branched by a move on the board (`src/app/reviewLine.ts`,
the panel shared as `src/ui/EngineLinePanel.tsx`); the move list in two columns. On a phone the
move's card comes first under the board. Tests: `positionEvals` and the longer line (unit); the
practice game's e2e (desktop and phone) steps the game, checks the badge and the eval, opens Show
best, Show line (stepped) and Show refutation, retries the best move. Real games' view
(`#/games/<id>`) is unchanged.

#### 5.58 Deviations from the repertoire in real games

- `deviations.ts`: each game walked against the repertoire index for the user's colour; the first
  position where the user left the repertoire (a deviation: the move played, the repertoire's move,
  the games) and where the opponent played a reply the repertoire doesn't cover (a gap), grouped
  by position across games, both filtered by colour and speed; dismissed positions left out
  (`dismiss` events).
- On `#/repertoire-check`: the deviations and gaps, newest first, each opening its chapter at the
  position (to add the move there) or the line's training (§5.16), with Dismiss; a deviation also
  pins the repertoire move (§5.8) at a press.

Tests: unit on built chapters and fixture games (a deviation, a gap, a transposition into the
repertoire, the user's colour, a dismissal); Playwright: the list and a chapter opened from it.

Live: (desktop) the deviations of the real games against the real repertoire, beside
mistake-lab's Repertoire tab.

**As built** (2026-10-07, with §5.59 and §5.60): `src/core/games/deviations.ts` (`findDeviations`:
mistake-lab's walk, its trie the index's own moves by position; after a deviation the walk goes
on, as mistake-lab's does, so the opponent's next reply is a gap too; `deviationPasses`), and
`#/repertoire-check` (`src/ui/RepertoireCheck.tsx`, from the Games screen): the weak spots, the
deviations (colour and speed filters; Open the chapter at the position, Train the line, Pin the
repertoire's move, the game, Dismiss; the dismissed listed and restored) and the gaps (Open the
chapter where the position is reached, Practise from the reply). **One difference from mistake-lab,
on purpose**: it walks only the games that gave it an item (its games list drops the rest before the
walk, and its weak spots read the same list); here every game in the date filter is walked, since
a game played without a mistake is still a game played. The counts beside mistake-lab's will differ
by those games.

#### 5.59 Recidivism

- `recidivism.ts`, a port of `computeRecidivism`: drilled items (reviewed at least once, not
  dropped; mistakes and tactics, not plans or advantages) met again in a later game with the user
  to move: fixed, relapsed (any new mistake there), the same move again; in-app encounters from
  `played` events shown dimmed, never graded. The summary ("↻ Transfer: 9 fixed · 3 relapsed") on
  the Games screen and a badge per card; Reschedule on relapse (a setting, on) writes the `relapse`
  events.

Tests: unit (each verdict, the gates: analysed games only, the side to move, the source game, the
first review's time, one encounter per game; the reschedule's guards).

Live: (desktop) the summary on the real games beside mistake-lab's.

**As built** (2026-10-07): `src/core/games/recidivism.ts` (`drilledIndex`, `recidivism`,
`relapsesToWrite`, `badgeOf`; no eval cache here, so a mistake's "exact best" bonus flag is never
set, as mistake-lab's without a cached search) and `src/app/repertoireCheck.ts` (the drilled items
from the games and the saved items, the raw extraction's mistakes as the relapse signal, the
history's practice games replayed; Reschedule on relapse in Games → Set up, on by default, writes
each real game's relapse once per card and game). The summary is on the Games screen, the badge in
the game cards' session.

#### 5.60 Weak spots

- `weakSpots.ts`, a port of the dashboard: the human lens (opponent replies at recurring positions
  scoring under 50% over 5 games at least, the near-universal ones left out) from the games, and
  the bot lens from `practice` events; on `#/repertoire-check`, worst first, each opening the
  position on the analysis board or its checklist drill.

Tests: unit (the score, the gates, the order).

Live: (desktop) the real weak spots beside mistake-lab's.

**As built** (2026-10-07): `src/core/games/weakSpots.ts` (`humanWeakSpots`, `botWeakSpots`,
`WEAKSPOT`), shown first on `#/repertoire-check` with the two lenses (Your games, Practice), each row
opening the position on the analysis board or practising from it (the checklist's drill comes with
§5.62). Tests for §5.58–§5.60: `test/unit/core/games/repcheck.test.ts`, **the same answers as
mistake-lab's own code** (`detectRepertoireDeviations`, `computeRecidivism`, its position index with
`computeHumanWeakSpots` and `computeBotWeakSpots`) on `test/fixtures/games/repcheck.json` (17 games
made for these rules, recorded by `mistake-lab-repcheck.cjs`; three controls), and
`test/e2e/repcheck.spec.ts` (desktop and phone: the deviations, a gap, a dismissal synced, a relapse
rescheduled once and synced, a chapter opened from a deviation).

#### 5.61 Plan cards

- Enrolled from a chapter's move menu ("Make a plan card") at a position with a comment; the card
  reads the comments on every node reaching the position (notes are comments, D3) with their
  shapes, live; reviewed in the game cards' session: the board, "Recall the plan", Show plan, then
  Again/Hard/Good/Easy; removed from the same menu (`plan` events, `on: false`).

Tests: unit (the content from several chapters, a card with no content left out and counted);
Playwright: enrol, review, remove.

Live: (phone) a plan card reviewed.

**As built** (2026-10-07): `src/core/games/plans.ts` (`planEnrolments`, `planNotes`: the comments and
shapes of every node of every study that reaches the position, a chapter's start included, so the
migration's "Notes" study counts; `planDeck`), `src/app/plans.ts` (the notes read from the working
copies whenever the data or the enrolments change), the move menu's "Make a plan card" (on a move
or start with a comment or a shape) and "Remove the plan card", and the card in the game cards'
session: the board turned to the card's side, Show plan (the comments, the shapes on the board),
then Again/Hard/Good/Easy; Skip is Again, as mistake-lab's; Open the chapter; Remove the card. The
comments are shown as text (their lines not clickable here). Plan cards are new cards like the
others, so the daily limit of new game cards counts them; mistake-lab had no limit for them. "N plan
cards need content" on the Games screen counts those whose position has no comment. Tests:
`test/unit/core/games/plans.test.ts` (two controls), `test/e2e/plans.spec.ts` (desktop and phone:
enrol, review, remove, synced).

#### 5.62 The variation checklist

- `checklist.ts`, a port of `generateTodoVariations`: the repertoire study's covered tree scored by
  the explorer (ratings 1600–2500, blitz to correspondence), slots apportioned by d'Hondt over it,
  the reserve, exclusions (`drop` events on `c|<leafKey>`); drilled per preset (easy, medium, hard:
  the explorer's ratings and Maia's rating for the opponent) through §5.57's practice after the
  lead-up, a win checking it off (`practice` events with the preset); the win rate per preset.

Tests: unit (the apportionment's nesting, the reserve's order, exclusions, completion from events)
on a fake explorer.

Live: (desktop) a checklist for a real study beside mistake-lab's.

**As built** (2026-10-07): `src/core/games/checklist.ts` (`generateChecklist`: mistake-lab's
covered-tree walk, its study's first move at each of the study's positions, every covered reply at
the opponent's, the explorer's shares by UCI and by SAN, a covered reply the explorer lacks at
0.0002, gaps from 8%; `apportionSlots`, the selection, the reserve by stepping the quota, the
dedup; `excludeVariation`, `completedPresets`, `presetStats`, `presetOpen`, `PRESETS`),
`src/app/checklist.ts` (the explorer asked through the worker's `practiceGames` at 1600–2500, blitz
to correspondence; the lists kept on this device, made again at will, as mistake-lab's are
regenerable definitions; exclusions as `drop` events on `c|<leafKey>`, synced, a line refilled from
the reserve at once; Restore all), the checklist on `#/repertoire-check` (a study, the number of
lines, the plies, Make; each line's Easy/Medium/Hard chips with the last five attempts' score, a
draw half, coloured as mistake-lab's, ✓ when won, opened in order; ✕; the uncovered replies with
Practise) and `#/checklist/<sid>/<n>?preset=…` (the drill: the lead-up from the start, the
opponent's moves played, a move off the prep refused; then §5.57's game from the line's end, silent,
the preset's opponent, never collapsing, won by mate or Claim victory: a `practice` event at the
leaf with the preset; stopped, nothing is counted). The weak spots' practice lens opens a
checklist line's drill at that difficulty. Maia's rating per preset is the preset's (mistake-lab's
adjustable one isn't built). Tests: `test/unit/core/games/checklist.test.ts`, **the same
variations, reserve and gaps as mistake-lab's own `generateTodoVariations`** on six cases of
`test/fixtures/games/checklist.json` (`mistake-lab-checklist.cjs`; two controls), the apportionment,
an exclusion, completion; `test/e2e/checklist.spec.ts` (desktop and phone: a checklist made from
the fake explorer, a lead-up with a refused move, the game won by Claim victory, the line checked
off at Easy and synced).

#### 5.63 Voice input

- `voice.ts`, a port of the lexicon and matcher (homophones, phrasings per legal move, the edit
  distance); `platform/voice.ts` over the Web Speech API (five alternatives); in practice games, a
  move heard is confirmed or played, the opponent's move spoken (§5.9's speech).

Tests: unit (the lexicon's cases, ambiguity refused); Playwright: a faked recognizer playing a move.

Live: (phone) voice in a practice game, with and without Bluetooth.

**As built** (2026-10-07): `src/core/games/voice.ts` (mistake-lab's `VOICE_LEX` as it is,
`heardToValues`, `movePhrasings`, `tokenDistance`, `matchMove`, `moveToSpeech`, the phrase hints;
one difference on purpose: a castle that gives check is found and said as a castle, where
mistake-lab compares the SAN without its `+`), `src/platform/voice.ts` (the Web Speech recognizer:
continuous, final results, five alternatives, en-US, the hints where the browser takes them,
restarted when the browser ends a session; the silent tone that keeps a Bluetooth headset awake),
`speak` in `src/platform/speech.ts`, and `src/app/voice.ts` with the 🎙 button in every practice
game (§5.57's, the advantage drill's, the checklist's): the first alternative that names something
wins, a move is played or, with "Confirm moves", asked ("Knight f, 3?") and played on yes; an
ambiguous one is read out; the opponent's moves are spoken; nothing is heard while the app speaks;
Space turns voice on and off, 1 repeats the opponent's move, 2/Enter and 4/Backspace answer a
pending move; off at every start and when the game ends, as mistake-lab's. Tests:
`test/unit/core/games/voice.test.ts`, **the same tokens and moves as mistake-lab's own matcher** on
42 cases of `test/fixtures/games/voice.json` (`mistake-lab-voice.cjs`; two controls), and
`test/e2e/practice.spec.ts`'s voice test (desktop and phone, a faked recognizer and speech: a move
said and played, the opponent's spoken, a move confirmed by yes).

#### 5.64 The migration (dry run, then the run)

- `migrate.ts` (pure): mistake-lab's progress, games and review history in, a report and the events
  out. Per card: `positions[pid].srs` → a `snapshot` (game items as `m|<pid>`, plan cards as
  `p|<key>` re-keyed through `positionKey`, every key that changes listed), `r_` states counted and
  left behind (D15, D19); `invalidated` → `drop`, `invalidatedLines` → `drop` with the line;
  `recidGraded` → `relapse` stand-ins (so a relapse is never applied twice); `planCards` →
  `plan`; `dismissed` → `dismiss`; `practiceMistakes`, `practiceTactics` → `saved`;
  `practiceScoreboard` → `practice`; the review history → `played`; notes → a "Notes" reference
  study (one chapter per position, from its FEN, the note as the root comment, its arrows and
  circles as shapes; study comments auto-imported from Lichess left out, as they are in the studies
  already); custom deviations → the "From mistake-lab" repertoire study. Left behind and counted:
  the eval cache, the checklist definitions (regenerated), `completed` and `lastSeen`.
- `#/migrate` (from Settings): the gist's ID and a token entered once, never stored; Dry run shows
  the report (cards by kind, re-keyed keys, items whose game is missing, each thing left behind);
  Run writes the events and the studies in one sync, and refuses a second run (it finds its own
  marker event).

Tests: `migrate.test.ts` on a fixture in the documented shape (every field above, a pid of each
kind, a legacy pseudo-legal en passant key, a corrupt card, an `r_` card, a deleted plan card, a
tombstoned note): the report's numbers, the events, the studies; replay after the run giving the
cards' FSRS states as mistake-lab had them (due dates within a day: mistake-lab's are local dates);
the queue sizes before and after (the outline's check).

Live: (desktop) the dry run on the real Gist, its report read by the owner, then the run (TESTING.md).

**As built** (2026-10-07, ahead of §5.56–§5.63, whose events it writes already): `src/core/games/migrate.ts`
(`migrate`, pure: every mapping above; a corrupt card, one never reviewed and an unrecognised pid
counted and left out; a relapse stand-in at its game's time, or the last review's when the game
isn't read; practice results oldest first; notes sanitized as Lichess would and written with their
`[%csl]`/`[%cal]`; a custom deviation's move written from its FEN's own move number), `src/app/migrate.ts`
and `src/ui/Migrate.tsx` (`#/migrate`, from Games → Set up: the gist and an optional token typed
on the page and never kept; Dry run reads the progress, games and review files and shows the report;
Run records the events and imports the two studies through the ordinary import; a second Run is
refused once the data holds snapshots). The report counts mistake-lab's cards due today, which the
test checks against the replayed cards. Until §5.56 and §5.61 are built, the saved items and the
plan cards are in the log but not yet in the session. Tests: `test/unit/core/games/migrate.test.ts`
on `test/fixtures/mistake-lab` (two controls: keys not re-made, `r_` migrated), and
`test/e2e/migrate.spec.ts` (desktop and phone: the token sent once and not stored, the report, the
run synced with its six snapshots and both studies, the second run refused).

#### 5.65 Phase 5 acceptance test, and exit

**Acceptance test (live, desktop + Android phone)**, on the owner's games and progress:
1. Desktop: the dry run's report; the run; the game cards' queue beside mistake-lab's for the same
   day.
2. Desktop: a day's game cards; a practice game and its review; the deviations, weak spots and
   checklist beside mistake-lab's.
3. Phone: the game cards after a sync; a practice game with voice; a plan card.
4. A week with mistake-lab closed.

**Phase 5 exit**: unit and e2e tests green; the acceptance test passed live; mistake-lab no longer
used (D20); its analyzer still runs from its repo until the tools move (D8).

#### 5.66 The analyzer's output in the data repo (the owner's choice first)

Built only if the owner chooses (a) above: `scripts/games-to-data.mjs` (the analyzer's
`analyzed_games.json` → `games/<YYYY-MM>.jsonl` in a data repo checkout, compact records, a month
rewritten only when its games changed), `layout.ts`'s `games/` path kind (never written by a
device, never merged), and the site reading it as a source beside the Gist.

Risks:
- mistake-lab's breadth (about 30,000 lines): ported part by part, its rules as spec, the parts in
  order of daily use, each with mistake-lab's numbers.
- The engine on the phone for grading (mistake-lab grades the same way on the same phone).
- chess.com from a page (unverified): the analyzer stays its path.
- The Gist's read limits and size: ETag, read only on Games' refresh, the raw URL for big files.
- The migration on real data: a dry run first, a fixture in the documented shape, the run refusing
  to repeat.

Checks: the same per-game counts as mistake-lab (§5.52); the migration's dry-run report and the
queue sizes before and after (§5.64); the live comparisons beside mistake-lab (TESTING.md).

**Phase 5 built** (2026-10-07, §5.50–§5.64 but §5.66): each part's "As built" says what was built
and how it differs. Every rule ported is tested against mistake-lab's own code run in Node
(`test/fixtures/games/*.cjs`, `mistake-lab-sandbox.cjs`), with the cases and answers recorded in
fixtures. What is left of mistake-lab is listed in §6; §5.65's acceptance test is in TESTING.md.

---

## 6. Phase order and retirement

| Order | Phase | Retires |
| --- | --- | --- |
| 0 | Foundation | |
| 1 | Train and review | **lichessable** (D20): training moves here, and the owner's own script exports the Chessable courses. **Editing in Qchess** ends here too: its studies are imported a last time when Phase 1 goes into daily use (D18) |
| 2 | Explorer, ChessDB, Practical | |
| 3 | Analysis, Stockfish, Maia | |
| 4 | Storm and puzzles | lichessable's storm, if it was still used on Chessable courses until then |
| 5 | Mistake review and migration | **mistake-lab** (the PWA; its analyzer keeps running from its repo until the tools move) |

**Left of mistake-lab after Phase 5's build** (an audit of its architecture reference against
what was built, 2026-10-07; built in this order before it retires, none needing the owner):
1. The game trainer's engine line after a wrong move (§5.55's "not built yet"): mistake-lab shows the
   refutation and lets the line be stepped through (its ENGINE LINES, BAD MOVE BEHAVIOR).
2. Practice: a game resumed after a reload or a switch of app within 4 hours (its CONTINUATION
   SESSION PERSISTENCE); premoves during the opponent's turn (PREMOVE); the repertoire check
   while practising from a position ("Ignore for this game?" on a move off the repertoire before
   ply 20, the corrected deviation kept with the move and shown in the review, FILTER PRACTICE and
   GAME REVIEW HISTORY); the hint in a practice game from a position (the repertoire's move, else
   Stockfish's: HINT SYSTEM).
3. Detected tactics after a practice game (DETECTED TACTICS: the candidates from each judged user
   move, the tactic tree walked in the background, Try / Save / Discard, saved as a practice tactic
   with `saved`), which needs a port of the tactic tree walk (`walkTacticTree`, the analyzer's
   scanner) on the device's Stockfish.
4. The games' own explorer (OPENING EXPLORER): the games filtered to those reaching a position on a
   board, each move's results from the user's games there, the opening name a position is most
   often reached in (used to title practice games and saved items, `lookupOpeningName`).
5. "Hide time trouble" in the games list and the game cards (TIME TROUBLE: the setting exists).

**As built, item 1** (2026-10-07): `src/core/games/engineLine.ts` (`buildEngineLine`, `continuation`,
`step`, `goTo`, `goToMain`, `goToAlt`, `branch` with `addBranch`, `extend`: mistake-lab's six plies,
opened at the opponent's reply, the next six from a search at the end, a branch searched and added as
an alternative, a branch inside one replacing its rest; stepping back into an alternative's shared
start stays in it, as its code does), and in the game cards' session: after a mistake card's wrong move
(not the third, where the best move is shown on the card's position) the refutation from the
position's own line or the search after the move; after a tactic's wrong move the search after it; after
a right move "Show the engine's line" (and Hide). The line under the board, its moves as PGN with the
alternatives in brackets, each a click away; ‹ › and ← → step it; a move on the board goes along the
line or branches it; back before a wrong move is Try again. The search at the line's end starts ahead
(mistake-lab's prepared extension), on the trainer's depth. Not ported: starting a line by moving an
opponent's piece (its issue #23 open) and Copy as PGN. Also fixed: the best move shown after three
tries or Show the move is drawn on the card's position, not on the board after the wrong move. Tests:
`test/unit/core/games/engineLine.test.ts`, **the same states as mistake-lab's own code after every
step** on ten cases of `test/fixtures/games/engineline.json` (`mistake-lab-engineline.cjs`, a stand-in
engine whose answers are recorded; two controls), and `test/e2e/games.spec.ts` (desktop and phone: the
line after a right move shown and hidden; after a blunder, stepped, extended, branched, and back to Try
again).

**As built, item 2** (2026-10-07): in `src/app/practice.ts` and `src/ui/Practice.tsx`, for a game
practised from a position (Practise from here, Play on, the analysis board's Practise): **the
repertoire check** (`repertoireCheck` in `src/core/games/practice.ts`: before ply 20 (any ply since §5.132), at a position
where the repertoire has a move of the user's side, a move it doesn't have, by UCI or SAN, is taken
back with "e6 isn't your repertoire: the study move is d6" and Ignore for this game; the first move
tried there is kept with the move then played, `repTried`, in the game and its history entry; the
review marks it "corrected: you first tried e6", `repertoireVerdict`, mistake-lab's
`_repDeviation` with `corrected`); **the hint** (the repertoire's move at the position, else
Stockfish's best, the piece then the arrow; H); **premoves** (chessground's, set while the opponent
thinks, played after its move when legal, a pawn to the last rank a queen, dropped otherwise); and
**the game kept on the device** (`src/core/games/resume.ts`: saved at every change, offered within
four hours from two moves played, on the practice screen after a reload and on the Games screen;
cleared when the game ends or is left; every kind, an advantage drill resumed on the practice screen
records its grade itself). With voice on, a move taken back is said ("Repertoire deviation. Study
move is d6"). Not as mistake-lab: a move taken back isn't added to the Repertoire check's
deviations (mistake-lab saves it as a custom deviation; here the review and the history keep it),
and the check runs in every game practised from a position, where mistake-lab's runs in its filter
practice only. Tests: `test/unit/core/games/practice.test.ts` (**the corrected deviation as
mistake-lab's own `buildContLineReviewData`** on two new cases of `practice.json`, one control),
`test/unit/core/games/resume.test.ts` (the four hours, two moves, the ply-20 window, the check's
matching; two controls), `test/e2e/practice.spec.ts` (desktop and phone: e6 taken back, the hint,
d6, a premove played after a slow opponent, a reload and Resume, the review's corrected deviation).

**As built, item 3** (2026-10-07): `src/core/games/detect.ts` (`tacticCandidates`: mistake-lab's
`detectTacticCandidate` with the opponent's loss read back as `applySilentEvalToMove` does,
`opponentLoss`; `buildChain`, `uniqueness`, `dedupeLines`, `maiaLine`, `scanCandidate`, `covered`:
its `tacticWalkTree`, `tacticBuildBestChain`, `tacticDedupeAltLines`, `tacticGenerateMaiaLine` and the
scan's loop; `practiceTacticItem` and `tacticSaved`: `savePracticeTactic`'s record and `_chainSig`
dedup), and in practice: each user move's judge keeps its position's lines; when a game ends and the
judges are in, the scan walks each candidate on the device's Stockfish (depth 20, 19 on a phone as
mistake-lab's offset, five seconds a search at most), Maia's line added when Maia is on; the review
lists what it found ("⚡ 4. Bxf7+ ✓ Found · 1 line", or "Scanning for tactics… 1/3", or none found)
with Try (the lines played on the board, ungraded), Save (a `saved` event: the tactic in the game
cards) and Discard (and Undo). Not as mistake-lab: the scan runs after every practice game, where
mistake-lab's runs only after its silent games (its detection rides its silent evaluation queue); the
opponent's loss is read from the judged score after the user's previous move (mistake-lab's from the
live one), and the two moves left are counted on the finished game. Tests:
`test/unit/core/games/detect.test.ts`, **the same candidates, opponent losses, walked lines,
deduplicated lines and Maia lines as mistake-lab's own code** on four games of
`test/fixtures/games/tactics.json` (`mistake-lab-tactics.cjs`, a stand-in Stockfish and Maia whose
answers are recorded; two controls), and `test/e2e/practice.spec.ts` (desktop and phone: 4.Bxf7+ Kxf7
5.Ng5+ played, found by the scan on the fake engine, tried with a wrong move first, discarded and
back, saved and synced).

**As built, item 4** (2026-10-07): `src/core/games/openings.ts` (`openingIndex`: mistake-lab's
`doBuildOpeningIndex`, each game's positions before its moves and the last, each position's moves
with their games and results; `explorerRows`: `renderExplorerStats`'s rows, a colour's games only,
most played first; `reaches`: the opening filter, transpositions included; `openingNameAt`:
`lookupOpeningName`, the name most games reaching the position carry, the first met on a tie), the
index in `src/app/games.ts` (built from the games in the date filter when first read), and on the
Games screen an Explorer card: a board, each move's games and results there (White · draw · Black),
the opening name, Back, Start, Practise from here; while it is off the start the games list (and the
practice games in it) shows only those reaching its position. A practice game from a position is
titled by the opening name there (so its history entry is), and a saved item's card in the game
cards names it. Not as mistake-lab: the index is built when the explorer is first opened or a name
is first asked, in one go rather than in timed batches; ties for a name go to the newest game.
Tests: `test/unit/core/games/openings.test.ts`, **the same indexes and names as mistake-lab's own
code** on `test/fixtures/games/openings.json` (`mistake-lab-openings.cjs`; nine games: a
transposition, a game from a position, one cut by an illegal move, an en passant, an empty one; two
controls), and `test/e2e/games.spec.ts` (desktop and phone: the rows, the list filtered, Back, the
name, a practice game titled by it).

**As built, item 5** (2026-10-07): "Hide time trouble ⏱" in the Games filters (the setting already
kept on the device): on, the mistakes made in time trouble (under 45 s left and under 10 s spent,
§5.52) are left out of the games' counts and of the game cards (`withoutTimeTrouble` in
`src/core/games/deck.ts`, mistake-lab's `applyFilters` rule: mistakes only, tactics and advantages
kept); the mark ⏱ on such a mistake in a game's items and on its card in the session. Tests:
`test/unit/core/games/deck.test.ts` (on the fixture games; one control), `test/e2e/games.spec.ts`
(desktop and phone: the mark, the counts and the queue with it on and off, kept on the device).

**§6's list is built** (2026-10-07): with it, nothing of mistake-lab is left that doesn't wait for
the owner (§5.65's acceptance test, §5.66's answer). Left out on purpose and said in each item: the
engine line started by moving an opponent's piece and its Copy as PGN (item 1), practice deviations
added to the Repertoire check (item 2).

Side tasks, outside this repo:
- **Chessable courses**: the owner's own export script (D14). Its PGN imports like any other
  file; bought courses become reference studies, in the private data repo only. It doesn't
  depend on lichessable, so retiring lichessable sets it no deadline.
- **`explorerdb serve` CORS**, in q_extension, for Phase 2's local explorer (§5.25; the patch is
  in TESTING.md).

Phase 4 stays after Phases 2 and 3: the storm will be daily use eventually, but the owner
doesn't need it early (§8). Nothing in Phases 2 and 3 depends on it, so it can still move up.

---

## 7. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| A second site published from the organization | It would share the origin again: caches, quota, token | The organization publishes Repworks only (D17); caches are named `repworks-*` anyway |
| Qchess changes its page | The export script stops working | It is needed only until the switch; Qchess's own download still imports, with the side asked once per study |
| Android clears site storage before a sync | Unsynced edits or reviews lost | Short push delay; push on hide; a visible "N changes waiting"; `persist()`; the risk named in settings |
| GitHub secondary limits | Writes refused for a while | One commit per sync; at most one push a minute; backoff; nothing lost locally |
| A Lichess dialect change | The byte round trip breaks | Fixtures re-exported when it happens; the semantic suite still holds |
| The GraphQL write behaves differently live | The spike fails | The REST path is already behind the same port |
| Merge surprises on real data | Confusing markers | Markers are text: visible, editable and in git history; the simulation suite keeps growing |
| Scope of mistake-lab and the storm | Late retirement | Ordered by daily value; each phase is used before the next starts |

---

## 8. The owner's answers, and setup

The first draft asked four questions. The owner answered them on 2026-10-05:

1. **Hosting origin**: a free GitHub organization's Pages site, as recommended (D17).
2. **The storm**: it will be daily use eventually, but isn't needed early. Phase 4 stays where
   it is, and lichessable can go after Phase 1 (D20).
3. **Chessable export**: the owner already has a script, so nothing is built in lichessable
   (D14). The owner's newest repertoire is in Qchess studies, so import starts there (D18,
   §4.10).
4. **Starting state of cards**: a fresh start. Every card starts new (D19). For the same reason,
   mistake-lab's repertoire reviews aren't migrated in Phase 5 (D15).

No question is open. Two items stay open in DECISIONS.md because nothing depends on them yet:
the repo layout once the tools move, and the name.

Done on 2026-10-05:
- The owner created the organization `dubious-moves` and transferred the repo into it, so the
  site's address is `https://dubious-moves.github.io/repworks/`.
- The repo is public, as a free organization's Pages site requires (§2), and Pages' source is
  GitHub Actions; the owner confirmed both.
- Claude sessions can push to it. This plan went up to `claude/ecstatic-tesla-8txo26` through
  the old address, which GitHub redirects (§2), and `main` was pushed from that branch with the
  owner's permission. The plan branch is the default only because it was the first push into
  the empty repo.
- Build sessions start with `dubious-moves/repworks` as the source, not the old name: one session
  can't hold both names (both check out to the same directory), and the redirect ends if anything
  is ever created at the old address.

Still to do, in this order (actions, no decisions):
1. Make `main` the default branch (Settings → General → Default branch). Phase 0 deploys from
   `main` (§4.1), and this setting is out of a Claude session's reach.
2. Look at Settings → Environments → `github-pages`, if it exists yet. If its deployment branches
   name `claude/ecstatic-tesla-8txo26` (the default branch when the Pages source was set), change
   that to `main`, or the first deploy is refused.
3. When Phase 0 reaches §4.2: create the private data repo under your own account
   (`skAeglund/repworks-data`, created with a README) and a fine-grained token for that repo
   only, with Contents read/write. Expiry is up to you: none is allowed; I'd take a year with a
   reminder.
4. When Phase 0 reaches §4.5: the Lichess test study (§4.5 (a)), plus a Qchess export of each
   repertoire study and a sample of your Chessable script's output, all kept in the data repo.

#### 5.89 The owner's notes of 2026-10-11: a shorter bar, the head in line

From a phone screenshot of a study.
- **⏭ and ⋯ left the move-button bar:** it is ☰ ⏮ ◀ ▶, and ✎ where there is no mouse. The End
  key still goes to the line's end; a move's menu opens by a long-press (or right-click) on the
  move in the notation.
- **The phone's head:** the chapter picker sits under the study's name, so it stood lower than ←
  and Study | Train. Below 1150px wide the head's items share their bottom edge, all 44px high.

Tests: `views.spec.ts` (the bar's buttons; the picker's, ←'s and the switch's bottom edges on a
phone).

#### 5.90 The owner's notes of 2026-10-11: the card panel into the move's menu

The panel beside the notation holding "Always play this for me" and "Add alternative" was tiny
and could not be resized.
- **The panel is gone; an own move's card is in its menu** (right-click or long-press the move in
  a repertoire chapter): a muted line on where the card stands (new, learning, due, reviews,
  played for you, met elsewhere), then "Always play this for me" (or "Ask me this move again"),
  "Add alternative…", and "Remove alternative <move>" for each saved alternative there.
- **Picking an alternative** shows, under the board, "Play the alternative on the board." with
  Cancel (Escape, or another move shown, cancels too).
- **Out of the move's menu:** "Copy FEN" (in ☰ already) and "Read from here" (training's Read
  button still opens Read). **Into ☰**, between Copy FEN and the study's own, for the move shown:
  "Analyse from here", "Storm from here" (repertoire chapters), "Practise from here", and "Make a
  plan card" / "Remove the plan card" (where the position has comments or arrows). The move's
  menu keeps Comment, the line edits, the copies and "Quiz from here".
- The tools area under the notation now holds only the conflicts at the move shown, and is
  hidden when there are none.

Tests: `editor.spec.ts` (the menu's items), `train.spec.ts` (the card and suspend from the menu),
`alternatives.spec.ts` (add, cancel, remove from the menu), `views.spec.ts` (the ☰ menu's items,
Copy FEN), `plans.spec.ts`, `analysis.spec.ts` and `back.spec.ts` (from ☰).

#### 5.91 A note on a game card: words, arrows and lines (the owner's request, 2026-10-11)

The owner: when saving a mistake, a comment on its position, with arrows and clickable lines, to
show why certain moves don't work. Shown after the card is answered (the owner's choice: before,
it would give the move away).
- **Stored as a PGN comment, in a `note` event** on the game card (`m|<pid>`, any kind: a game's
  mistake or tactic, a practice or storm mistake, a sequence): `text` is the comment, the words
  with `(12. Bxf7+ Kxf7)` groups for lines, then `[%csl …][%cal …]` as Lichess writes them (D3:
  notes are PGN comments). The latest note is the card's; '' removes it. Older builds skip the
  kind. Mistakes themselves stay JSON items (`saved` events, the analyzer's games), not PGN.
- **Written in a dialog** on the card's position: arrows and circles drawn on its board
  (right-drag with Lichess's modifiers; ✎ and the four colours on a touch screen); moves played on
  it make a line, which "Add to the note" writes into the words with its move numbers; the words
  tidied as a study comment is (`sanitizeComment`). "✎ Add a note" / "✎ Edit the note" is on the
  trainer's card once answered, and beside "Saved" when a practice game's mistake or a storm
  position is saved (opening it holds a timed storm's verdict). "Delete the note" removes it.
- **Shown in the trainer** once the card is answered (found, shown, or not judged): the words
  under the verdict, each line clickable (the comment lines of §5.12, starting at the card's
  position; ← → step, Escape or a click on the board ends it); "The note's arrows" turns the board
  back to the card's position with them, and back.
- Core: `core/games/notes.ts` (`noteOf`, `noteComment`), the `note` kind in `events.ts`; app:
  `app/notes.ts`; UI: `ui/CardNote.tsx`.

Tests: `events.test.ts` (the kind formatted, read, refused off a game card), `notes.test.ts` (the
comment written, the latest note read, a line from the card's position); `games.spec.ts` (desktop
and phone: not before the answer, a line played and added, an arrow drawn, shown, its line
stepped on the board, the arrows, synced as one comment, edited and deleted); `storm.spec.ts` (a
note written as a storm position is saved, synced).

Live: TESTING.md.

#### 5.92 A desktop layout trial: a centred page, one stage for study and training (the owner's notes, 2026-10-11)

The owner, on a 1920 px desktop: the head's and the top bar's ends anchored to the window's sides
felt far apart; the board moved a little on Study ↔ Train; the installed app's top bar was thick
under the window's own title bar; the sync chip drew the eye while all was well. A trial, to be
judged live:
- **One page column.** The top bar's, the banners', the content's and the footer's edges keep to
  a centred column: 1100px on the pages of text and forms (as the content already did), 1600px on
  the board pages (`--page-max`, `--gutter` on `.shell`).
- **One stage from 1150px** (`.cv-grid` and `.train-frame > .train-body`, the same rule): the
  board as large as the frame fits (its height less the feedback line's 34px) up to the size
  chosen; on its left the chapters (study) or the lines (training), on its right the notation and
  explorer (study) or the session's panel (training). The two sides take one width when the right
  one gets at least its least, `clamp(320px, 33cqw, 400px)` (the explorer's Maia columns need
  about 400px), so the board is in the page's middle from about 1600px wide; on a narrower desktop
  the left side gives way (down to 200px) and the board sits a little left of it. The training
  screen is as tall as the window, as the study is, its panel and line list scrolling on their
  own; a session's end with no board takes the board's and the panel's place. Screens without a
  line list (Play, the pins, retry) keep the left side empty, so the board is where it is
  everywhere; so does the analysis board. Under 1150px nothing changed.
- **The installed app on a desktop** (`display-mode: standalone` with a fine pointer, ≥900px)
  has no top bar: the window's title bar shows the icon and the name. The title bar takes the
  page's background rather than the accent (`--theme-color: var(--bg)` there, which `theme.ts`
  puts in the `theme-color` meta; the owner found the green band over the dark page strange), and
  the content starts 24px under it. The manifest's `theme_color` is unchanged, so the bar may show
  the green for a moment as the app starts.
- **The sync status** sits in the footer's right on a desktop (≥900px), as muted as the build line
  on its left, and in the top bar on the phone, without its outline. Offline, a refused token, a
  sync error or GitHub's limit turn it into the amber chip. It still syncs on a click.

**Second round (the owner's notes, 2026-10-11, on the deployed trial):**
- **The eval bar on the board's left** from 1150px, as wide as Chess.com's (24px) with its
  number: the leader's lead to one decimal (`0.2`) or `M3`, at the leader's end, inside its colour
  (`barScore`); 10px from the board and from the chapter list, which fills the rest of its side
  (a narrower list with empty room before the board was tried and dropped the same day). From
  900 to 1149px it stays the thin strip right of the board. The chapter list is only as tall as
  its chapters, "+ New chapter" at its foot. The stage's board is a multiple of 8px, as
  chessground draws its squares, so the bar is exactly as tall as they are.
- **The explorer:** counts short, three figures and k, M or B (`formatCount`: 900k, 2.51M,
  1.52B); **each column can be hidden** in the explorer's settings ("Columns shown": Eval, Share,
  Games, Score, Ml, Ms; Move always shows, Prac is the Practical column's own switch), kept per
  device as `hidden`; the rows' grid is built from the columns shown (`--ex-cols`), so every
  combination lines up; Move 46px and Eval 40px (from 56 and 48); the header's Games title spans
  the share and the count, Score (or Prepared) heads the bar's own column with the sort as ⇅ at
  its right. On a phone with Maia on, the count still gives way.

Tests: `boardsize.spec.ts` (desktop, 1600×900: the board in the page's middle, the same box on the
study, the picked line, a running session and back; the status in the footer); the rest of the
suite on desktop and phone unchanged.

Live: TESTING.md.

#### 5.93 The owner's notes of 2026-10-11: the training screen's comments and line list

- **A comment's line at a session's end steps by ← →** (and Escape ends it), as it did while the
  session ran: the training screen's key listener stays while the screen is open, the session's
  own keys only while it runs. Escape that ends the preview leaves "Next: Line n" going on.
- **The comments of the move reached show only where they are read:** a move taught (`teach`) or
  shown (`shown`, after Hint or a second wrong move, and Show in show and grade), after a first
  wrong move (`wrong`), and at the line's end (`lineDone`, the session's end). While the opponent's
  and the auto-played moves go by, in a sequence watched, and while a move is asked, they are
  hidden: they came and went with each move. Was: hidden only while a move was asked. The study's
  arrows still show only at the line's end.
- **A session that starts folds the line list** ("Show lines" opens it), on a wide screen too; a
  new session (another line picked, "Next line", "Again") folds it again. A picked line waiting to
  start, and a screen with nothing to train, keep it open.

Tests: `train.spec.ts` (desktop and phone: the list folded at the start, a comment hidden while
asked and shown after a wrong move, a line in the last move's comment stepped by ← → and left by
Escape at the session's end).

Live: TESTING.md.

#### 5.94 The study page, option B (the owner's choice, 2026-10-11)

The owner asked what could be better on the installed desktop app's study page (a 1920 px
screenshot, board about 672px) and picked option B of the design canvas's two. From 1150px (the
stage of §5.92), and nowhere else:
- **The chapter is picked in the head**: the study's name, `/`, then ‹, the chapter select, ›
  and its place ("2 / 5"); ‹ › are off at the first and last chapter. The chapter list beside the
  board is gone; its ⚙s and "+ New chapter" were already in the ☰ menu (§5.88), and the crumb
  that named the chapter goes with it. The phone's and the narrow desktop's head are unchanged.
- **The engine and the explorer on the left of the board**, the engine's lines wrapping once
  rather than cut after four moves, the explorer filling the rest of the side (no height handle
  there; under 1150px the handle stays). The left keeps the explorer's least width and the right
  gives way on a narrower desktop, the reverse of training's sides; the board is the same size in
  both, and from about a 1600px column the sides are of one width, so the board does not move on
  Study ↔ Train there.
- **The notation alone on the right, as running text**: the main line's pairs flow on, broken
  only by a comment or a variation, as a book prints them; a "…" stays where Black's move starts a
  run. Qchess's two-column table stays under 1150px. The move buttons stay under it.
- **The board stays resizable from its corner** (D21, §5.79), at the size the owner keeps.

Not taken from the canvas: the sync status next to Study/Train and the build line's removal
(§5.92 put them in the footer on purpose), the board filling the height by default, a ⏭ button
(§5.89 took it out), and narrowing the explorer's columns (they are hideable since §5.92).

Tests: `editor.spec.ts` (1400×800: the engine and explorer left of the board, the notation right,
running text, the chapter's ‹ › and place), `explorer.spec.ts` (the handle at 1100px, none on the
stage), `views.spec.ts` (the head's picker on both).

Live: TESTING.md.

#### 5.95 The owner's notes on option B (2026-10-11)

- **The engine's lines cut to one row again**: the owner reads the first one to three moves
  (§5.94 wrapped each line once).
- **The move shown's comment under the board, on the stage, where there's room** (`CommentPanel`
  in `Notation.tsx`): the board's column is a flex column, the panel taking what the board and the
  feedback line leave, scrolling inside; under 72px of room it is hidden (`visibility`), so a board
  as tall as the frame has none. Its text is larger and upright, comment lines clickable as in the
  notation; "No comment on this move." when there is none, and ✎ opens the comment dialog. The
  notation keeps its comments too.
- **⏭ back in the move bar** ("End of the line", the End key's move), on the phone too; §5.89 had
  taken it out.
- **No ‹ › beside the chapter select**; its place ("2 / 5") stays. A chapter picked lets go of
  the select (it blurs), so ← → step through the new chapter's moves rather than the options.
- **"+" (New chapter) in the stage's head**, beside the select, with a chapter open; the phone
  keeps it in ☰ (§5.88).

Tests: `editor.spec.ts` (1400×800: no panel at the default size, the comment and "No comment" at
480px, ✎, the select blurred and → stepping the new chapter, "+"), `views.spec.ts` (⏭ in the bar,
"+" in the desktop head only).

Live: TESTING.md.

#### 5.96 Clickable lines: words, null moves, ↓ into a line (the owner's request, 2026-10-12)

- **Words in a line** (`lines.ts`): `( 12.Ng5 Ndf6 taking the e6-pawn under control 13.Nxe6 Bxe6
  14.dxe6 d5!)` is one line of six moves. A group is a line when it starts with a move number and
  a move; after a move, a word that isn't one is text, and the line goes on only at the next move
  number, so a square or a move named in the words (`as a5 would`) is never played. A comma,
  colon or semicolon after a move is text. The words are drawn as the comment around them, not in
  the line's bold blue. `(1. e4 is best)` was a remark and is now a line of one move.
- **Null moves**: `--` passes, `(7.-- Bg7, 8.-- O-O, and 9.-- a5)` shows Black's plan move after
  move. Played as a pass (the side to move changes, no en passant), never out of check: the line
  stops there, as at an illegal move. Stepping a line passes over its passes (the owner's note,
  the same day): → from the start shows `Nf6` after `--`, each → the next move of the plan, ←
  back the same way, and a click on `--` shows the move after it. A pass at a line's end is shown
  (with no last move on the board). The bar under the board keeps the `--`s.
- **↓ enters a move's lines**, in the chapter view and the Read view, as it would choose a branch:
  the first line of the move's comments, at its first move, wherever the move is (→ still enters
  them only at a line's end). In the chapter view it goes before the next variation (`move('down')`),
  which ↓ still reaches on a move with no line in its comments. In a line: ← → along it and on
  through the comment's lines as before; ↓ ↑ to the next or previous line's first move; ↑ on the
  first line leaves, as ← before its first move and Escape do. The training screen keeps ← → only.

Tests: `lines.test.ts` (the owner's two examples, a5 in the words, `(1. is best)` a remark, a pass
in check, passes stepped over both ways and when clicked, ↓ ↑ between lines), `views.spec.ts` (a comment with words and passes on 2... d6, which has
a variation: ↓ enters its line, no last move for a pass, ↓ ↑ between lines, ↑ out; ↓ ↑ in the Read
view).

Live: TESTING.md.

#### 5.97 ← on every page, and Home (the owner's request, 2026-10-12)

A page that can't be shown (a line gone from the repertoire, a study or checklist line not on this
device, a chapter that won't open) said why and nothing else: in the installed app on a desktop,
which has no top bar and no browser back button, a dead end. It now keeps the head's ← (to the
page's parent when opened from outside) and Home (`Stuck` in `ui/Back.tsx`). Home, to the start
page, is on every page but the start page: next to ← on a screen 900px wide or more, in the top bar's
right on a narrower one, where the head has no room to spare. The installed app on a desktop hides
the top bar but is wide, so it gets the head's.

#### 5.98 Lines from the comments quizzed in review (the owner's request, 2026-10-12)

The owner: quiz the clickable lines in review (not when learning); a small notice that a line is
there, with a miniature board on hover, rather than popups coming and going; only lines starting
with the opponent's move; none where an own move is marked `?`, `?!` or `??`; a first move marked
`!` or `!!` stands out as important. "You decide, then we'll iterate." lichessable's §18 (its
`DESIGN-continuation-review.md`, read for this) is the reference: its heads-up, its rules, and what
an extension couldn't do. Decided:

- **Which lines** (`core/train/commentQuiz.ts`, `quizLinesOf`): a comment's line (§5.12, placed as
  there) on a move of the line walked, or before its first move, starting with the opponent's move.
  Dropped when any own move as written is marked `?`, `??` or `?!` (its first character is `?`;
  `!?` is kept, and an opponent's `?` is the premise of the line). The moves quizzed go as far as
  the line is one line: up to a pass (a plan, not moves), a move whose printed number isn't the
  position's (`… alt. 16... Rfe8`: another branch), an illegal move, or an own move where the
  repertoire plays another (the quiz never drills against the repertoire). At least one own move
  must be left, and the line is left out when every own move of it is a card already (the
  repertoire trains it). Important: the first move marked `!` or `!!` (`$1`, `$3`). The parser
  (`lines.ts`) now keeps each move's glyph (written on it or standing after it) and its printed
  number.
- **When**: on a walk of the day's queue or of a line picked that teaches nothing (a walk that
  teaches is learning). Lines starting where the user is first asked (the opponent's move before
  it) to the walk's end are met as the walk reaches them; from the start, asked, from the walk's
  start. At the walk's end, after its mistakes, the lines on are played on the main board (§5.99: when the user picks "Quiz lines" over "Next line", or one at a time by "Quiz now"), one
  after another, then the line is done as before. Each line once a session. Not in Learn, show and
  grade, retry, drill, the pins or the Interactive view.
- **The quiz takes over the board**, as the mistakes retried at a walk's end do: the board goes
  back to where the line starts, the opponent's first move comes after two paces, the rest at the
  pace; the user finds their moves. A wrong move is taken back ("Not the comment's move"), a second
  or Hint shows it with an arrow; a move another quizzed line or the repertoire plays there isn't
  wrong. Nothing is graded or recorded: the lines come back whenever the moves around them are
  reviewed, so they follow their line's schedule. "Skip this line" moves on.
- **The notice** (`ui/CommentOffer.tsx`): a chip in the counters' row ("Comment lines 2", "Lines 2"
  on a phone), in the comment lines' blue, gold with a `!` when one is important. It appears when
  the walk reaches a line's start and only grows; nothing else moves. Hovering it, a tap or the
  keyboard opens a card under the row: each line's start on a small board with its first move as
  an arrow, the move as written (`2. Nc3!`), "Important" in gold, how many moves are to find, and
  "Quiz it". Lines not yet reached are never shown (they would give the line's own moves away).
- **No spoilers in a comment shown mid-walk** (after a wrong move): a line still to be quizzed is
  shown as `(…)`.
- **Setting** (this device, training settings): quiz each one (default) / quiz the important ones,
  offer the rest / offer them, quiz the ones I pick / off.
- **Feedback**: "Next, 2 lines from the comments", then "Line from the comments · 1 of 2" (gold:
  "Important line …"); the line's moves so far after the line's name, in parentheses; the
  session's end counts them ("2 lines from the comments, 3 of 4 moves found first time").

Better than lichessable's, because the trainer is the site's own: one board (no overlay), no
second reader to agree with the first, no network check for lines in the course (the index
answers), a notice that never covers anything, and the quiz runs where the line is reviewed rather
than on request.

Not done, for the owner to say: grading the lines (cards of their own, which would be a new
progress event and a decision on the data format); combining a line written in shorthand from a
fork (`(15. Nxd4 cxd4 16. b3 Qf5 alt. 16...Rfe8)`: the quiz takes the first branch); quizzing a
plan written with passes.

Tests: `test/unit/core/train/commentQuiz.test.ts` (each rule), `lines.test.ts` (glyphs and printed
numbers), `trainer.test.ts` ("comment lines": offered as reached and not before, quizzed at the
walk's end with nothing recorded, the board's path, off / important / pick, none on a walk that
teaches, where the walk meets them, wrong / shown / Hint / another line's move, once a session,
Skip), `timeTravel.test.ts` (the setting), `test/e2e/commentLines.spec.ts` on desktop and the
emulated phone (the chip and its board, `(…)` in a comment shown, both lines quizzed, only the
review pushed, picked off, Skip, the setting).

Live: TESTING.md.

#### 5.99 Lines from the comments: "Quiz now", and "Next line" or "Quiz lines" at a line's end (the owner's request, 2026-10-12)

The owner, on §5.98: quiz a line at the point of its comment, from the panel; and the quiz at the
end optional, not started by itself: the user picks "Next line" or "Quiz lines". Decided:

- **"Quiz now"** on each line in the chip's card (`ui/CommentOffer.tsx`; `quizComments` with the
  line's key in `core/train/trainer.ts`): the line takes the board from where it starts, as at the
  end (the opponent's first move after two paces, the user's moves found), then the walk resumes
  exactly where it was: the move asked still asked, a wrong move already made still counting
  (its grade is as without the quiz), the time taken before it kept; a move played for the user
  or the opponent's played at the pace. Offered wherever the walk is playing or asking (and at
  the line's end), not during show and grade, a sequence shown, a mistake retried or another line
  from the comments. A line quizzed reads "Quizzed" with "Quiz again"; it leaves "Quiz lines".
- **At the line's end** (after its mistakes and passes) nothing starts by itself. When lines from
  the comments are left to quiz (on by the setting or a pick, not quizzed yet), the line waits
  whatever "At a line's end" says, with "Next line" (or "Finish" at the session's last line, which
  now waits for it too) and "Quiz lines (n)". "Quiz lines" plays them one after another and comes
  back to the line's end, which then goes on as set. "Next line" leaves them: the lines met on a
  walk are offered once a session, as before. The pause and its note "Next, 2 lines from the
  comments" are gone.
- **On a desktop** (a pointer that hovers: the card already shows on hover), a click on the chip
  is "Quiz now" on the line met last that isn't quizzed yet (the one nearest the board; all
  quizzed, the last again), named in the chip's tooltip. A tap (the phone) or the keyboard still
  opens the card. (The owner's request, 2026-10-12.)
- **The checkbox** in the card is now "At the end" (in "Quiz lines" or not); the setting's words
  follow: each one / the important ones / the ones I pick in "Quiz lines" / off.
- `(…)` in a comment shown: a line still to be quizzed at the end (on, not quizzed); once quizzed,
  now or at the end, its comment shows it.

Tests: `trainer.test.ts` ("comment lines": "Quiz lines" at the end, "Next line" leaving them and
the end waiting even with `holdLineEnd` off at the last line, show and grade at the end, "Quiz now"
mid-walk resuming at the move asked, after a wrong move keeping its grade, at the end with the
rest left to "Quiz lines"); `test/e2e/commentLines.spec.ts` on desktop and the emulated phone.

#### 5.100 Kinds of storm position, and the focus that deals them (the owner's request, 2026-10-12)

The owner: beside the unintuitive storm, positions that are important decisions, only moves and
positional decisions; more conditions on the storm's selection, or new storms. Built as one focus
over tags (`core/storm/kinds.ts`) rather than a storm per idea, so they combine:

- **Tags worked out from what a stored position keeps** (its list, Maia's policies, a gathered
  kind), so a deepened list or a new rating re-tags it with no request. Three groups; within a
  group any chip chosen matches, across groups all must:
  - **Hard for you** (Maia at the user's rating; shown once Maia is here): *Unintuitive* (§5.82),
    *Critical* (Maia's moves there give up 8% or more on average, a move outside the list counted
    as its last line), *Level up* (Maia finds a good move less than half the time at the user's
    rating and 30 points more often at some ladder rating above it; now §5.118), *Your level* (the difficulty
    from 100 below to 300 above the rating).
  - **The move**, read from the moves a list that may judge (§5.84) counts as good (great or
    good), only when the list names them all (its last line isn't good): *Only move* (one good
    move), *Quiet* (every good move without a capture, check or promotion), *Retreat* (every good
    move a piece, not a pawn or the king, moved towards its own side), *Pawn break* (every good
    move a pawn push into diagonal contact with an enemy pawn), *Don't take* (no good move
    captures, and a capture tempts: Maia at the rating gives captures 25%, or, unrated, one is in
    the list's top three).
  - **The situation**, kept by the gather as the position's `kind`: *Punish* (the position an
    opponent's error of 150 cp or more left in a real game, or an uncovered reply that leaves the
    user clearly better; from losing 1 to +6), *Hold* (the user worse, −1 to −3), *Convert* (the
    user better, +2 to +6). Each needs a move in the top five that gives up 10% (something to get
    wrong) and is never a forced recapture.
- **The gather keeps more.** Where the pick rules refuse a position the classic storm doesn't want,
  it is kept with a kind: a hard only move (a gap of more than 300 cp to the second, or in check
  with the second a mistake), a hold or a convert (outside the −1…+2 band, including the position
  where the walk stops as decided), and one more request after an opponent's error for the
  position it left (punish; the walk still stops there). The classic storm and set deal none of
  them; a focus does, the situations only when one of them is chosen.
- **The classic storm deals easy positions last**: those where Maia at the user's rating finds a
  good move 85% of the time or more.
- **The home**: "Focus" under the count, folded until a chip is on; each chip with how many ready
  positions have its tag; the count and the start buttons follow the focus ("Quiet storm",
  "14 positions ready for Quiet"); the focus is kept per device. "Unintuitive storm" is now the
  Unintuitive chip. A focus deals no puzzles (unless asked, since §5.125). A position's tags show with Maia's line once
  answered, and in the review with the best move ("Only move · Quiet").
- Answers are ordinary `storm` events: the record and the progress log are unchanged. Positions
  gathered before this have no kind and are classic; Punish, Hold and Convert come from gathers
  made since.

Numbers in `STORM` (`holdLoCp`, `convertHiCp`, `criticalWp`, `levelRise`, `levelBelow`,
`levelAbove`, `takeShare`, `easyShare`), first guesses until the owner's positions show how many
each leaves.

Tests: `test/unit/core/storm/kinds.test.ts` (a move's facts; the good moves; each tag; Maia's
expected loss; the focus's groups; easy; the gather's kinds by `specialKind` and the candidate
builder; the walk keeping a punish and a convert), with three controls in its header;
`storm.spec.ts` (desktop and phone: the Quiet chip's count checked against the test's own reading
of the kept lists, the choice kept, only its positions dealt, the card naming it once answered;
the unintuitive storm now through its chip).

#### 5.101 Questions other than "find a move" (planned 2026-10-12, with §5.100)

From the same request; for positional decisions, where calculation matters less than judgement.
Each a mode of the storm's session over the same kept positions and focus, its answers `storm`
events with the band they earned (so the record stays one), dealt from the home beside Start storm
and Set:

- **Two moves**: the best move and Maia's likeliest at the user's rating when that isn't good
  (else the list's best move that is a mistake or worse), as two arrows in random colours; the
  user picks one (click the arrow's destination or a button). Right is `great`, wrong the other
  move's band. Positions without such a pair are not dealt.
- **Who's better**: the position before a move, the user picks −, = or + (the user's eval worse
  than −0.7, within, or better than +0.7, from the list's best); right is `great`, one step off
  `bad`, two `blunder`.
- **What's the threat**: the opponent's best move if it were their turn (a search of the position
  with the side to move swapped, when legal, run in the deepening and kept as `threat`); the user
  plays it on the board as the opponent's move. Only positions whose threat gives up 10% or more
  for the user (it matters).

Tests in core for the pair, the eval steps and the threat's position; e2e for each mode on desktop
and phone.

#### 5.102 Storm positions shared between devices, and an overnight gather (the owner's request, 2026-10-12)

The owner: gather positions across the whole repertoire during the night, and have them on every
device. The positions had stayed on the device that gathered them (D5's cache tier, revision of
2026-10-07), which said a per-device store file was the step after if gathering on the phone was
too slow; and a gather ended after one pass over the line ends (at most four games each). Built:

- **Each device writes the positions it gathered to the data repo**:
  `storm/<dev>/<YYYY-MM-DD>.<k>.jsonl`, the UTC day each was gathered, one position a line in the
  stored shape (`v: 1`; no card or key, which the FEN gives), at most 400 to a file
  (`core/storm/shared.ts`, `classifyPath`'s `storm` kind). Only that device writes its folder,
  as with progress files: the tree merge keeps a device's own files as ours and another's as
  theirs, never read. They are working copies that the ordinary sync pushes, so offline, a stale
  head and a lost answer are handled as for any file. A night's positions land in that night's
  files, so the earlier days' stay as they were and history grows by what changed. The device
  writes them at the end of a gather (and after each overnight pass), on Clear, on leaving the
  storm's page, and ten minutes after the deepening or Maia's ratings change one
  (`app/stormShare.ts`). Validation warns on lines the app can't read, and such a file is never
  rewritten.
- **Other devices' files come down with the ordinary pull** and are merged into the storm's store
  when its page opens and after every sync that changes the data, a file read again only when
  its blob changed. A position not kept comes in marked with the device it came from (`from`); one
  kept takes a better list (Stockfish over ChessDB, then deeper) and the Maia ratings it lacks.
  The home says how many came from other devices, with "Sync now".
- **Clear removes the positions from this device and from its files**; other devices keep their
  copies. A cleared position from another device isn't merged back in unless that device
  gathers it again later (a tombstone per card, with the time).
- **The store keeps 4,000 positions** (was 900), the done ones out first, then the oldest: a night
  over the whole repertoire gathers more than 900.
- **Overnight**: "Keep going until stopped" under the Positions card. After the usual pass, each
  pass walks every line end again over older games (the explorer's `until`, four months further
  back each pass, 13 passes: four years), only games not walked yet; between passes Stockfish
  scores what came in (whatever the deepening setting) for as long as the pass took, and the
  positions are written out; at the end it scores the rest. A failure is waited out (1 minute,
  then 2, 4, 8, up to 15 in a row) instead of ending the gather. It stops at Stop, after the last
  pass, or when the store holds 4,000 positions not answered well. The screen is kept on (the wake
  lock already held while gathering); the page must stay open and in front, since a browser
  suspends a hidden tab and a phone a locked screen's.

Tests: `test/unit/core/storm/shared.test.ts` (a line and back, unread lines counted; the files by
day and part, own positions only; the merge; the explorer's window), with three controls in its
header; `layout.test.ts`, `validate.test.ts`, `core/sync/trees.test.ts` (own storm files ours,
another's theirs, nothing read), `service.test.ts` (`until` asked and cached apart),
`stormStore.test.ts` (the cap sparing done cards; the merge, the tombstone); `storm.spec.ts`
(desktop and phone: an overnight gather through all 13 windows, the older window's game walked
once, every position scored, the wake lock asked, and the files pushed holding every position;
a failure waited out and the gather going on, then Stop; a gather on one device dealt on a second
after its sync, which writes nothing of its own, then cleared there and staying cleared after a
reload, the first device's files untouched).

Live: TESTING.md.

#### 5.103 Focused scoring: every core for the deepening (the owner's request, 2026-10-12)
The owner saw the deepening take long with the computer at about half its CPU and memory. The
storm's Stockfish was one worker on the threads chosen for the study page (1, 2, 4 or 8; one when
the page isn't isolated), with a 32 MB hash. Measured in Node over the vendored Stockfish 19 lite
(one thread, depth 20, six opening positions): MultiPV 1 1.7 s a position, 6 8.3 s, 8 11.7 s, 12
18.8 s; the time goes with the lines, about 1.5 s a line. MultiPV stays 12 for now (8 offered
to the owner: about 1.6 times faster). Six positions at MultiPV 12 on a 4-core container: one worker
103.6 s, three at once 35.1 s (2.95 times); one worker with a 128 MB hash 96.7 s (7% faster).

- **"Focused" under the storm's settings** (per device, off by default; shown where the device
  has three cores or more): the deepening runs `hardwareConcurrency − 1` single-threaded workers
  (at most 16), each searching a position of its own, each with a 64 MB hash. Why: the positions
  are independent, so several searches at once scale with the cores almost fully, where one
  search on many threads (Lazy SMP, in wasm) scales worse; single-threaded workers also need no
  isolated page. One core is left for the page. Memory is not what limits the search: a bigger
  hash helps a little at these depths, and each worker is its own wasm instance (its net and hash).
- **It applies to the home's deepening and an overnight gather's scoring.** A session goes back to
  the one engine on the device's threads (its look-ahead is one position at a time, the card on
  the board first), and the home starts the focused workers again when it deepens. Ticked while a
  deepening runs, it starts again with the engines that now apply; a gather's scoring takes the
  setting at its next pass.
- The status line names them: "scoring, n at once…".

Tests: `storm.spec.ts` (desktop and phone, `hardwareConcurrency` 4: three workers, each with a
64 MB hash and no Threads option, every position searched once at the device's depth; a session
starts no focused worker). Live: TESTING.md.


#### 5.104 The deepening's progress, and two minutes a position (the owner's request, 2026-10-12)
- **A deepening search runs up to 600 s** (`deepenMs`; was 60 s, then 120 s and 300 s, which the
  owner found not enough: they would rather it be slow than the depths uneven), the look-ahead's too; one that
  runs out is taken at the depth it reached, as before (§14.23). An overnight pass scores for at
  least that long.
- **"Scoring: n of m searched" under the Stockfish line**, a fold that opens on: how many kept,
  how many stopped by the limit short of the target depth, how many with no answer; the engines;
  the time so far, the pace a position and the time left; each engine's position (its line's name
  and plies on), depth so far of the target, seconds and nodes a second, redrawn every second;
  and the last 12 positions searched (depth reached, seconds, kept or not). After the run it
  stays as "Last scoring" until the next starts.
- **A list not kept says why**: below depth 20, no deeper than the list the position has, or too
  few moves.
- **An overnight pass's scoring that runs out of its time keeps the searches under way**: no new
  one starts, but one that finishes is stored (it was thrown away, up to a whole search an engine).
- **The console logs each run and each position** (`[storm deepen]`: depth, seconds, result,
  FEN), for debugging on a device.

Tests: `storm.spec.ts` (desktop and phone: `go depth … movetime 600000`; the focused test reads
the fold: every position searched and kept, three engines, the last one at the target depth).
Live: TESTING.md.

#### 5.105 Overnight: everything scored before the next pass when focused; too easy left out (the owner's request, 2026-10-12)
- **An overnight gather with Focused on scores every position before the next pass** (no time
  share); without Focused, scoring between passes lasts as long as the pass took, as before
  (§5.102), and the rest is scored after the last pass. Why: the owner would rather have every
  position at the standard than more passes; focused, scoring keeps up.
- **Too easy: never dealt** (`tooEasyShare` 0.95): a position where Maia at the user's rating
  finds a good move 95% of the time or more (the share `easyAt` measures, over the moves the list
  can judge; a great move since §5.117) is left out of every storm and set, whatever the focus; it stays stored, so a higher
  rating can bring it back. 85–95% stays easy: dealt last in the classic storm (§5.100). Unrated
  positions are dealt. The home's count says how many were left out ("n too easy, left out").
  Why: the owner saw "Maia at 2150 finds a good move 100% of the time" on a card; such a position
  teaches nothing.

Tests: `kinds.test.ts` (90% easy, not too easy; 96% both). Live: TESTING.md.
#### 5.106 Review lines walked to their end; every first answer graded (the owner's choice, 2026-10-13)
The owner's report: a review line in today's queue stopped at 10...a5, its last due move, though
the line goes on six plies. With "From the start, asked", each later move then brings the line's
start back on its own day, and a miss on a move asked but not due was lost: nothing recorded it.
- **Other platforms** (from search summaries of their help pages; their sites can't be opened
  from the cloud container): Chessable's "whole variation" review plays the moves leading to the
  due ones and asks them as Overstudy: a right answer changes nothing, a **wrong one resets the
  move's timer**. Its "randomized" review asks each due move alone, in its position. ChessTempo
  doesn't ask moves it judges well learned by default (an option asks all). Chessbook (FSRS, one
  card a move, as here) schedules moves, not lines, and varies the move order to a position.
  Listudy resets a move's card on a wrong answer.
- Two options were put to the owner: A, misses count and right answers don't (Chessable's
  Overstudy); B, every first answer in a session counts, and review lines go to their end. **The
  owner chose B.**
- **Graded**: a move reviewed before, asked for the first time in a session, is graded, due or
  not, in every session that records (the queue, show and grade, a line picked, Learn). FSRS takes
  the time since the last review (`fsrs.ts`), so an early Good raises stability little and a miss
  is an ordinary lapse; the moves of a line drift towards falling due together, so a line's start
  is walked about once a cycle rather than once a move. Later asks in the session (passes,
  retries, a shared prefix met again) stay ungraded. A move in its learning step is graded only
  when due (a review that early would cut the step short); a miss on it still counts for the
  session (auto-play, mistakes retried).
- **Review lines** are walked past their last due move to their end, or to their last own move
  before a move never answered (that move is new material, taught on its own day within the
  daily limit). Whether the moves after are asked or played follows the auto-play mode and the
  line start, as before. Known lines still end at their last ask; a session taken up again (§5.15)
  keeps a review line's end.
- **Kept for later** (the owner, 2026-10-13): stopping at the last due move has value too. A hard
  move at ply 12 may make the moves after it obvious, and walking them costs time for little. If
  sessions grow too long, a setting (or a rule: stop when every move after the last due one has
  been answered right N times running) could bring the cut back. Not built.

Tests: `plan.test.ts` (a review line to its end; short of a move never answered; random plans),
`trainer.test.ts` and `browse.test.ts` (reviewed moves graded on first ask; learning ones not).
Live: TESTING.md.

#### 5.107 Auto-play "answered right this session": the latest answer counts (the owner's request, 2026-10-13)

The owner asked whether only a move's first attempt counts for auto-play's `session` mode, and
asked that a later right answer correct a miss. As built (§5.17), auto-play is per move, not per
line: a miss on one move never stops the others being played. A missed move met again on a later
line was already asked and, answered right, played after that; but a mistake retried at the line's
end (§5.77) "stayed a mistake", so with retries on, the move was asked on every line all session.
- **The latest answer counts** for `session`, retries included (`answer` in
  `core/train/trainer.ts`). A miss still grades Again once; nothing about grading changes.
- **`difficult` is unchanged**: a move missed this session stays asked there, which is that mode's
  point.
- **"From the start, asked" overrides auto-play** (§5.78, the owner's request): every own move is
  asked whatever the mode. The settings' help under Auto-play now says so, and no longer says
  "graded only when due", which §5.106 made untrue.

Tests: `trainer.test.ts` (a miss answered right on a later line, then played; a miss answered
right when retried, played on the next line, graded once). Live: TESTING.md.

#### 5.108 Export PGN for a chapter (the owner's request, 2026-10-14)

The study's ☰ menu has **Export PGN** in its chapter group, after Chapter settings. It downloads
the open chapter as a `.pgn` file holding exactly what its file in the data repo holds
(`chapterFileText`: Lichess's dialect, its headers, conflict markers if any), the edits made here
included even before they sync. The file is named `<study> - <chapter>.pgn`, with characters a
file system refuses turned into spaces (`chapterExportName` in `core/pgn/write.ts`). The analysis
board has no Export PGN (it is not a chapter); the move menu's Copy line stays for a single line.

Tests: `exportName.test.ts`; `views.spec.ts` (the download equals the stored file, and holds a
move just played). Live: TESTING.md.

#### 5.109 Branches to clickable lines (the owner's request, 2026-10-14)

The owner: turn a move's branches into clickable lines in its comment, from the move's
right-click menu (two screenshots: 16... Bd3 with 17. f3 and 17. b3 after it, then Bd3 with
`(17. f3 b5 … Kd7)(17. b3 b5 18. e4 e6)` in its comment and no moves after it). Decided:
- **The menu item** "Branches to clickable lines" is on a move with more than one move after it, in
  an editable chapter, after Make main line. (Not "…comment lines": a menu item named with
  "comment" would also match the tests' search for Comment.) It converts **every** move after it, the first one
  (the line it continues) included, as the screenshots show; on a main-line move that cuts the
  main line there. Undo brings everything back.
- **One line per end** (`branchesToComment` in `core/study/ops.ts`): a branch with variations of
  its own gives one line for each, each written from the move's position, since a comment line is
  placed by its first move number and side (§5.12, §5.20) and nested groups are not lines. The
  first child's lines come first, then the others in order. Numbered as Copy continuation numbers
  (`17. f3 b5 18. e4`, `17... e5` for a black first move), with each move's glyph (`!`, `?`, `!!`,
  `??`, `!?`, `?!`) written on it. Lines are separated by a space, and come after the move's own
  comment, a space between.
- **Not kept**: comments, arrows and circles, and glyphs other than those six on the converted
  moves. The note under the board counts the moves that had any (undo brings them back). Writing
  a move's comment into the line as words (§5.96) was left out: its own parentheses or a number in
  it would break the line.
- Over Lichess's 4,000 characters for the comment, nothing changes and the note under the board
  says why.

Tests: `ops.test.ts` (four ends from two levels of branches, glyphs, a comment dropped and counted,
read back by `playedLines` from the move's position; a black first move after an own comment; a
move with nothing after it refused),
`editor.spec.ts` (the menu item on 2. Nf3, the two lines clickable in the notation, the synced
file, undo, no item on a move with one continuation). Live: TESTING.md.

#### 5.110 Pin while retrying, learning's mistakes retried, no arrow in auto-play (the owner's requests, 2026-10-15)

- **Pin while retrying**: in Retry and Drill (the day's mistakes), "Pin this mistake" is offered
  from the start of each mistake's line, for a mistake not pinned yet, and stays until pinned or
  the next line (a right answer doesn't take it away). Pinned there, it isn't offered again when
  its line comes back. The drill pinned already pins everything, so offers nothing.
- **Mistakes retried when learning**: a new move counts as a mistake when a wrong move or Hint
  came before it was played (tried first with no arrow, in a sequence replayed, or against the
  arrow), and is retried at the walk's end like a due move's (§5.77). It was always counted right,
  so a line learned retried only its later passes' misses. Still recorded once, as `taught`.
- **No arrow in auto-play**: a move played for the user is never shown with an arrow first. Was
  (§5.6): a move in its learning step got its arrow for a pace before it was played, which the
  owner saw as a green arrow flashing during auto-play.

Tests: `trainer.test.ts` (learning's mistakes retried, nothing recorded twice; no arrow before a
move in its learning step); `train.spec.ts` (a mistake pinned from Retry). Live: TESTING.md.

#### 5.111 Copy branch as PGN (the owner's request, 2026-10-16)

The move menu has **Copy branch as PGN**, after Copy line as PGN, on a move with moves after it
(in any chapter, editable or not). It copies the line from the start to the move and every move
after it, variations included, as PGN (`branchPgn` in `core/study/ops.ts`, written by
`writeChapter`, so in Lichess's dialect). Decided:
- **Kept**: the comments, glyphs, arrows and circles of every move written, the moves leading to
  it included, and the chapter's opening comment. Variations before the move are left out.
- **Headers**: only FEN and SetUp, for a chapter with its own start (without them the text can't
  be read back); none otherwise, and no result. The note under the board says "Branch copied".

Tests: `ops.test.ts` (variations after the move kept and before it left out, a comment and a
glyph kept, a path not in the chapter, a FEN chapter); `editor.spec.ts` (the item in the menu);
`views.spec.ts` (the copied text). Live: TESTING.md.

#### 5.112 Analyse on every board (the owner's request, 2026-10-16)

**Analyse** opens the analysis board at the position shown, from every screen with a board, quizzed
or not; the study keeps its ☰ "Analyse from here" (the owner: enough there). The board's head has
"← Back to …" naming the page it came from (training, the storm, the line, the game, the game
cards, the review, the checklist), and the address carries it (`#/analysis?…&back=<hash>`, any
page but the board itself; a line up to 300 moves). That button, the app's ←, and the browser's
Back and Forward all come back to the page as it was left. Decided:
- **Where**: training (every kind: the queue, show and grade, a line, Learn, the Interactive view,
  Retry, Drill, the pins), with the other buttons under the board, always there; its Read and its
  end; the line selected (§5.83); the Read view; the storm, timed or a set; a game; the game
  cards (plan cards too); a practice game in play and its review; the checklist's lead-up.
- **What the board holds**: the line from its start where there is one (training's line from its
  chapter's start, a game's moves, a practice game's, the line read), shown at the move on the
  board; else the position. A line from a comment on the training board: its position.
- **Quizzed**: a training move being asked counts as hinted (shown on return, graded Again), as
  Hint would: the engine and the explorer give it away. A set's card counts as shown, as a held
  one did (§5.71). A **timed storm card** is passed: no points, the streak ends, the clock stops,
  and the card waits with "Analysed — no answer given" for Next. Was (§5.71): not during a
  timed card. The game cards and practice games keep what they had (their hint is separate).
- **Kept for the entry**: the training session waits for the history entry it ran on whenever its
  screen is left (a move due held), and is taken up if that entry is come back to; opened anew,
  training starts afresh. The Read view's move and a game's ply are written into the address as
  they change (replaced, as a chapter's move is). A practice game in play is kept from memory (it
  had needed two moves to be saved on the device); a review comes back at its move; the checklist
  keeps its lead-up's move or its game.

Tests: `fsm.test.ts` (any page as `back`, none the board or unreadable); `train.spec.ts` (asked,
analysed, back as hinted; at the line's end by Back and Forward); `storm.spec.ts` (a timed card
analysed: passed, the clock stopped, back by the button and by Back, Next); `views.spec.ts` (the
Read view's move kept); `games.spec.ts` (a game's ply kept, a game card back as it was);
`practice.spec.ts` (a game in play analysed and played on). Live: TESTING.md.

#### 5.113 Auto-play set apart for the queue and for Learn and a line picked (the owner's request, 2026-10-16)

The owner's report: with Auto-play "Moves answered right this session" and a line starting "From
the start, played", the moves before the line's first due move were played though none had been
answered; with "From the start, asked", nothing was played whatever auto-play said. They expected
auto-play to decide every move, and asked to "have auto-play enabled on review/queue and disabled
on learn/pick simultaneously". (A session, for `session`, is one run of the trainer, from Train,
Learn or a line picked to leaving the screen: no clock is involved, and an app started anew starts
a new one.) Decided:
- **Two auto-play settings**: *In the day's queue* (show and grade too) and *When learning, or a
  line picked*, each with the four modes of §5.17, beside that context's *A line starts*. Default:
  `due` for the queue, as before; **`off` for Learn and a line picked**, the owner's wish.
- **A line starts** is only where the board starts: *At its first new or due move* (the moves
  before it skipped, as before) or *From the start*, each move from move 1 played or asked as the
  mode says, on every pass. "From the start, played" and "From the start, asked" go; asked is
  From the start with auto-play off, and settings stored with them are read that way (`asked`:
  that context's auto-play off).
- **A line picked follows its mode like any other.** Was (§5.16, `practice`): a move not answered
  in the session was never played on a line picked, whatever the mode. With its own setting the
  rule isn't needed: `off` or `session` practise the line; `due` plays its moves not due.
- The due moves, the known moves never answered and the new moves are asked or taught whatever
  the mode, as before.

Tests: `trainer.test.ts` (each start with `due`, `off` and `session`: the owner's case asks every
move; repetitions with `off` and `session`); `timeTravel.test.ts` (each kind's settings; the old
settings read); `browse.test.ts`; `autoplay.spec.ts` (the two settings in the dialog; a line picked
with `session` asks a move not due), and the e2e specs of picked lines and Learn updated to the
new default. Live: TESTING.md.

#### 5.114 Alternatives shown by Space in show and grade (the owner's request, 2026-10-16)

"When using Show and grade, we need a way to show alternative moves with a key bind. My main
bluetooth ring has '1' and 'space' available, either works for me. When pressed, we should show the
alternative moves with blue arrows (if there are any)." Decided:
- **Space**, since `1` already repeats the spoken move in show and grade (§5.9). Outside show and
  grade Space stays Hint, and `1` still switches to show and grade.
- A press draws the alternatives saved (§5.18) for the move asked as blue arrows, and names them in
  the feedback line ("Alternatives: e5", or "No alternatives saved here"). With the move shown and
  waiting for its grade, they are those of the position it was asked in. A second press takes them
  away, and so does the board moving. It grades nothing and changes nothing; while the board plays
  the opponent's moves it does nothing. With speech on, they are spoken too ("alternatives: knight
  f3", or "no alternatives"), for the ring with the screen off.
- A button beside the two keys' ("Alternatives (Space)"), always there in show and grade so no
  button moves; greyed out when no move is asked or shown.
- Only the moves saved as alternatives: another repertoire move at the position is played and
  graded as its own card (D3), not shown here.

Built in `Trainer.alternativesHere` and `ShowGrade`'s `alternatives` press (`pressOf(' ')`). Tests:
`showGrade.test.ts` (the alternatives of the move asked, then shown, then the next move's; none;
spoken; the grades untouched); `alternatives.spec.ts` (Space in show and grade: the arrow in blue,
away at a second press and when the move is shown, back for the move shown). Live: TESTING.md.

#### 5.115 Review chapters weakest first (the owner's request, 2026-10-16)

The owner asked for the queue's chapters sorted by how many lines are due; asked about it, they
agreed to order them by recall instead. Decided:
- **The review lines come chapter by chapter, the chapter whose weakest due move has the lowest
  predicted recall first** (FSRS retrievability now). Was (§5.4): every review line in the index's
  order, so studies by name and chapters in study order. Why: if a session stops early, what is
  left should be what is safest to leave; a count says nothing about that, and a count of lines
  overstates a chapter whose due move sits near the root of many.
- A move taught and not yet reviewed (in its learning step) counts as recall 0: the weakest of all.
- Within a chapter nothing changes: its lines in tree order, sibling variations one after another,
  each due move asked once. Ties between chapters keep the index's order. A move shared by two
  chapters counts for both and is asked in the first one walked.
- New lines and the known pool keep the index's order: new material comes in the course's order.

Built in `todaysQueue` (each due card's `recall`, `recallAt`) and `planSession` (`byRecall`).
Tests: `plan.test.ts` (weakest chapter first across studies, a chapter kept as one block, a
learning card first, ties in index order).

#### 5.116 Gathering balanced across chapters (the owner's request, 2026-10-16)

The owner adds new chapters to a repertoire that already has many gathered positions, and a
"Whole repertoire" gather should fill them up rather than spread over the whole tree as before;
gathering the new chapter alone overnight would skew the store the other way. Bigger chapters
keeping more positions is fine. Decided:
- **Each walk goes to the chapter furthest behind its share:** the fewest stored positions per
  line, counting the positions not yet answered well (those are what storms draw from), re-read
  from the store before every walk. A chapter's share is in proportion to its lines, so once
  caught up the chapters advance together. A position counts for every chapter among its lines;
  a line end or reply shared by chapters goes with the one furthest behind.
- Within that chapter nothing changes: line ends drawn weighted by the lines ending there, replies
  most lines first, a line end's second pass (the rest of its games) once the chapter's first is
  done. Line ends and replies still take turns. Was: line ends weighted over the whole scope, the
  second pass after every first, replies by lines over the whole scope.
- Every scope and every overnight pass works this way; a chapter scope is unchanged by it.

Built in `chapterShare`, `behind` and `drawBalanced` (`src/core/storm/sources.ts`) and `gather`.
Tests: `sources.test.ts` (the share per line, the chapter furthest behind first, a shared item,
the old chapter behind once it has fewer positions per line).

#### 5.117 Too easy counts great moves only (the owner's request, 2026-10-17)
- **Too easy (§5.105) is Maia at the user's rating finding a great move 95% of the time or more**:
  a move giving up under 3% win against the best (`tooEasyOn: ['great']`). Was: great or good
  (under 6%), the same share as "easy" and the card's "finds a good move". Why: the owner's
  request, stricter; a position where Maia mostly plays a good but not great move is dealt.
- Unchanged: "easy" (85%, dealt last in the classic storm), the tags and the card's difficulty
  words still count great and good. A move outside the list counts as not great when the list's
  last line isn't great, and isn't judged otherwise, as before for good.

Built in `foundShare` and `judgeMove` (`src/core/storm/maia.ts`, the bands that count passed in)
and `tooEasyAt`. Tests: `maia.test.ts` (the share over great moves), `kinds.test.ts` (96% on a
good move: easy, not too easy).

#### 5.118 Level up compares two Maia ratings, set on the home (the owner's request, 2026-10-17)
- **Level up is Maia at a stronger rating finding a good move (great or good) at least a gap more
  often than at a weaker one: 1800 against 2200, 25 points, by default.** Was (§5.100): Maia at the
  user's rating finding one less than half the time, and some ladder rating above it 30 points
  more often; at the owner's 2150 that left only 2200 and 2600 to compare with, and few positions.
  The user's rating plays no part now: the tag is "what stronger players find", not "hard for you".
- **The three numbers are set per device** on the home, under the Hard for you chips ("Level up:
  Maia at 2200 finds a good move 25 points more often than at 1800"): either rating from 1000 to
  2600 by 100, the stronger above the weaker; the gap 10–50. Kept in the storm's settings
  (`levelUp`, read back by `cleanLevelUp`). Shown whenever the Maia group is, so a pair that tags
  nothing can be changed without its chip on.
- **A rating off the ladder is asked of Maia too**: the positions want the ladder's, the user's and
  level up's two (`missingRatings`'s `extra`); changing them restarts the background rating, and
  the home's "rated" count waits for them. The difficulty still reads the ladder only.
- Both ratings must be judged (`foundShare` not null: a list that may judge, 60% of Maia's
  likelihood on moves it can judge); a rating not rated yet tags nothing.

Built in `levelUp`, `withLevelUp` and `cleanLevelUp` (`src/core/storm/kinds.ts`), `tagConfig` and
`setLevelUp` (`src/app/storm.ts`), `LevelUpPicker` (`src/ui/Storm.tsx`). The gap's 25 is a first
guess: the owner's positions will show how many it leaves. Tests: `kinds.test.ts` ("level up":
the default pair whatever the user's rating does, an unrated rating, a list that can't judge,
another pair and gap, the read-back), `maia.test.ts` (level up's ratings wanted once each),
`storm.spec.ts` (the Maia test: the weaker rating set to 1900 and the gap to 10, every kept
position then rated at 1900, the chip's words and the setting kept).

#### 5.119 A sequence's alternative moves are a choice (the owner's report, 2026-10-17)
- **A line that leaves another at the user's own move is an alternative: either move is right, and
  the drill doesn't ask the other one afterwards.** That held from the second move on (§5.55,
  mistake-lab's optional lines), but at a sequence's first move every alternative was asked in
  turn after the main line, as mistake-lab did; the owner meant alternatives as a free choice.
- **A line that leaves at the opponent's move is still asked** ("Another line: the opponent answers
  differently"), under whichever move the user chose; the replies to a move not chosen are not.

Built in `nextLine` (`src/core/games/tactic.ts`), which serves the game cards' drill and the
practice review's. Tests: `tactic.test.ts` (either first move solves the card; an opponent's other
reply under the alternative chosen still asked).

#### 5.120 A storm move graded over the search's last two depths (the owner's report, 2026-10-17)

The owner reported two verdicts they judged wrong: 9...Nb4 an Inaccuracy (7.2%) where the analysis
board had it best at depth 24, and 18...Bxh4 an Inaccuracy (6.7%) at −4.21 against 18...e4's −4.93
(3.5% by those numbers: Good). Measured with the vendored Stockfish 19 lite run in Node, not on the
owner's devices:
- **Both verdicts are inside the engine's own wobble.** Nb4: the best move from depth 17 to 24 on
  one thread; on four threads (the desktop storm's engine), the best in two runs of three and 2.2%
  behind in the third. Bxh4: 3.2–8.0% behind e4 at depths 20–26 across MultiPV 12 and 3, a
  head-to-head search and three repeated four-thread runs (6.1, 5.0 and 4.6% at depth 24), so on
  either side of the 6% line.
- **Over 51 middlegame positions** (the games fixture's distinct positions at plies 18, 24 and
  30), MultiPV 12 to depth 22 on one thread: the best move changed between depth 21 and 22 in 8 of
  them, 14% of the moves within 20% of the best changed band, and 17 of the 80 graded Inaccuracy
  at 22 were Great or Good at 21.
- **Against a deeper, independent reference** (each move and the best searched alone to depth 25)
  over the 348 distinct moves the depth-22 list put between 1% and 15%: the list's band matched
  74–78% of them. Each move's score averaged over depths 21 and 22 put 19–21 of them right for
  7–9 it put wrong, under each of three references (depth 24, depth 25, the mean of 23–25); three
  depths did about as well against two references and no better than one depth against the third,
  four did worse against all three. A head-to-head search of the move against the best
  (`go … searchmoves best move`), taken when the list said Inaccuracy or worse, turned wrong
  Inaccuracies into wrong Goods without matching more bands, at a few seconds a miss, so it is not
  built. MultiPV 12 showed no sizeable bias against its lower lines (the list's loss minus the
  head-to-head's at the same depth: within half a point at the median).

What changed:
- **The engine's search keeps each root move's exact score at every depth** (`Analysis.scores`,
  the last at each depth, by move rather than by line); bounds and a stopped search's lines are not
  kept.
- **A storm list scores each move as the mean of its last two depths that every line finished**
  (`engineList` given the scores, `settledCp`): lines stopped mid-iteration (the look-ahead's search
  kept on a move, a search that ran out of time) are compared at one depth, which is the list's
  depth. A mate is never averaged; a move new to the list at the last depth keeps that depth's score.
- **A position's value from the grade's searches** (one search after the move, or two) is its best
  line's averaged with the best any move scored one depth before (`settledValue`).
- Every list the storm makes goes this way: the walk's, the deepening's, the look-ahead's and the
  grade's; Maia's tags and the focus read the same lists. Lists kept before stay as they are (a
  position is scored again only to a greater depth), so the change reaches positions gathered or
  deepened from now on. The stored format is unchanged (`scored[].s` holds the mean).
- Unchanged: the bands (3, 6, 10 and 20% of win given up), Lichess's curve, the depths.

Found, left to the owner (no change): the Bxh4 position is +4.6 to +4.9 for the user at depth 24,
outside the classic storm's band (−1 to +2, `userLoCp`/`userHiCp`), which the gather checks only
against its first, shallow list; a deepened list is never checked against it again.

Tests: `search.test.ts` (scores by move and depth; bounds and a stopped search's lines left out),
`harvest.test.ts` (the list over two depths: one depth for every line, a mate and a new move as
they are; no scores, as before), `grade.test.ts` (`settledCp`, `settledValue` for either side),
`storm.spec.ts` (desktop and phone: the fake engine gives the depth before the target with its
second line 30 higher, and a deepened card grades that move "#2 of 12 · level with the best").
Controls, each failing its test: bounds kept (`search.test.ts`); no averaging (`grade.test.ts`,
`harvest.test.ts`); each line read at its own depth (`harvest.test.ts`); the deepening's list made
without the scores (`storm.spec.ts`).

#### 5.121 A line in the queue starting where it branches from the last (the owner's request, 2026-10-18)

"I want to add a new setting for 'A line starts' (today's queue). It should take branches into
account. The first time, it should start from the beginning. After that it should start from the
latest shared branching point from the previous line. This assumes branches are queued together."
The details, proposed to the owner and accepted as defaults:
- **A third choice for *A line starts* in the day's queue** (and show and grade, which shares its
  settings): *Where it branches from the last line* (`branch`). Not offered for Learn and a line
  picked; a stored `branch` there reads as the default.
- **Where:** the position after the last move the line shares with the line walked before it, so
  the first thing that happens is the move where they part (the opponent's, played; or the user's,
  played or asked as auto-play says). From there on, as *From the start*: each move as auto-play
  says. No move before the split is replayed.
- **From the start** when there is no line before it in the session, or the line before is of
  another chapter (two lines of one chapter always share at least its start).
- **The line before** counts as far as its walk went (the trainer's `reached`): a line skipped
  midway shares only what was walked. Never past a move still to be asked or taught (then one
  move before it, as at the first due move); with the planner's lines that doesn't happen.
- **Later passes** (Repetitions) start where the first did, not at move 1.
- **The queue's order** is unchanged: review lines go chapter by chapter in tree order (§5.4,
  §5.115), so branches follow each other; new and known lines keep the index's order, so they
  start from move 1 more often. Ordering them by the tree too is left for a later request.

Tests: `trainer.test.ts` (the second line starts after the shared moves, with auto-play `due` and
`off`, against *At its first due move*; another chapter's line from the start; a later pass; a line
skipped short of the split; the random repertoires under every line start);
`timeTravel.test.ts` (the setting stored, refused for Learn); `autoplay.spec.ts` (the queue's
three choices in the dialog, stored). Live: TESTING.md.

#### 5.122 The progress page (the owner's choice, 2026-10-18)

From the review of 2026-10-17 (proposal 3 of ten, the owner's pick to build first): nothing showed
whether training works. The log holds it all, so a page reads it (`#/progress`, linked from the
training card's line of links; `core/train/stats.ts`, `ui/Progress.tsx`). Nothing new is stored.
- **Recall, last 30 days**: the share of reviews answered right beside the share FSRS expected:
  each review's predicted recall (its retrievability at that moment, from the card's state
  before) summed, so early reviews (§5.106: a line walked to its end grades moves not yet due)
  count at their own higher prediction rather than against the 0.9 target. A move's first answer
  (after teaching, or in a known chapter) has no prediction and is shown apart. A verdict line:
  in line when the gap is within two standard errors of the expected share; "you remember more"
  (intervals shorter than needed) or "less" otherwise; under 50 reviews, too few to judge. All
  time, by predicted recall in four bands (under 70%, 70–85, 85–95, 95 and over): reviews,
  expected, right. This is what fitting FSRS's weights to the owner's answers (proposal 5) would
  start from.
- **Moves**: mature (stability of 21 days or more, Anki's line), young, taught and not yet
  reviewed, not started; suspended and paused-only moves counted apart.
- **Reviews ahead**: the reviews due on each of the next 14 days, today taking the overdue ones,
  each move answered right on its day and counted again if it comes back within the fortnight.
  Misses and new moves are left out (said under the chart): the live forecast beside "New moves a
  day" (proposal 4) is where those belong.
- **Last 14 days**: minutes trained each day, from the gaps between answers and moves taught (a gap
  over five minutes is a break), with the reviews and new moves. The time before a session's first
  answer (its first auto-played moves) isn't counted.
- **Chapters, weakest first**: each started chapter's mean predicted recall now over its reviewed
  moves, its answers right in 30 days, moves started of all; eight shown, "Show all" for the rest.
  A move played in two chapters counts in both.
- **Missed again and again**: moves answered wrong twice or more in 30 days, the most misses
  first (then the higher share, then the latest), each with its line, the move, the moves last
  tried, Pin (§5.8) and Study; twenty shown.

Measured (headless, not on the owner's devices): on the 293-move test repertoire with three weeks
of simulated history the page opens in under 200 ms on an emulated Pixel 7; the counting alone
takes 130–300 ms in Node for 2,535 moves and 30,000 reviews (it runs once per opening, and again
only when the data changes).

Tests: `stats.test.ts` (an answer's prediction, first answers and a forget; the window, the bands,
the stages, chapters weakest first, a move missed twice, the forecast day by day, the minutes and a
break; paused moves), `fsm.test.ts` (the address), `progress.spec.ts` (desktop and phone: opened
from the training card, every section on the fixture with two misses added, the move pinned and
opened in its chapter).

#### 5.123 A misclick taken back (the owner's request, 2026-10-18)

"Let's implement a way to counter misclicks (or missed drags), they happen regularly if you're
trying to go fast. In case of a mistake, show a button that resets the mistake." Decided:
- **Misclick**, shown after a wrong move while the move asked is still to be played (where *Save …
  as alternative* shows, §5.18): the last wrong move is taken out of the ask's wrong moves, as if
  never played. Nothing is recorded or saved: the move stays wrong the next time. Shown by that
  move alone (a second wrong move), the arrow goes and the move is asked again; after a Hint, it
  stays shown (the Hint still makes it Again). Right next, the move is Good, and not a mistake
  retried at the walk's end.
- **Where:** on a desktop, in the panel beside *Save … as alternative* ("Misclick: take e5 back"),
  and by **Backspace**; on a phone, beside the note under the board ("Misclick"), since the
  panel's buttons are below the fold there. The feedback row keeps its height (§5.7).
- **Only until the move asked is played**: its answer is recorded then. A misclick followed at
  once by the right move stays Again; taking an answer back after it is recorded is left for a
  later request if wanted.
- Lines from the comments (§5.98) keep their own wrong moves: not graded, so no Misclick there.

Tests: `alternatives.test.ts` (nothing recorded, Good next, wrong again next time; after a second
wrong move and after a Hint; not retried), `alternatives.spec.ts` (desktop and phone: the button,
then Backspace, then right first time; still wrong in the Interactive view). Live: TESTING.md.

#### 5.124 Difficult lines: overstudy, graded only where due (the owner's request, 2026-10-18)

"If it doesn't exist already: Add a way to review/overstudy difficult lines. In case the line is
not due, it shouldn't be graded. In case it's due, it can be graded." It didn't exist: "difficult"
was only an auto-play mode (§5.17), which asks difficult moves when the queue meets them; nothing
started a session over them. Decided:
- **A session, Difficult lines** (`#/difficult`, `difficultPlan` in `core/train/browse.ts`), linked
  from the training card's line of links as "Difficult lines (n)" while there are any. A move is
  difficult as auto-play's mode says (`isDifficult`: two lapses or more, or FSRS difficulty from 7);
  suspended moves and paused lines are left out.
- **Which lines**: in the index's order, each line through a difficult move not yet covered, walked
  to its end, or to its last own move before a move never answered (new material stays with the
  queue and Learn). Every difficult move on the walked part is asked, whatever auto-play says,
  once in the session; so is every due move there. The other own moves follow the queue's
  auto-play mode and line start, as do the line's end (wait or go on), repetitions, mistakes
  retried and the lines from the comments.
- **Graded only where due** (`SessionPlan.gradeOnly`, checked in the trainer's `graded`): a due
  move's first answer is graded as in the queue; every other answer is practice with no event,
  a move reviewed and not due included. This is narrower than §5.106 (the queue, a line picked
  and Learn grade every first answer of a reviewed move): overstudy ahead of time changes no
  schedule. A line holding a due move is therefore graded on that move only.
- **The end**: lines walked, moves asked and right first time, how many due moves were graded;
  "Again", "Today's queue", Mistakes and Home. With no difficult move: "No difficult moves",
  with why a move counts as one.

Tests: `browse.test.ts` (the lines and asks, the cut before a move never answered, `gradeOnly`; run
under auto-play `due` and `off`: a difficult move missed and a reviewed move asked, not due, record
nothing, the due ones are graded; nothing without a difficult move or in another study),
`fsm.test.ts` (the address), `difficult.spec.ts` (desktop and phone: the fixture's c5 made difficult
by two misses, opened from the training card, asked and graded while due; "Again", now not due,
missed with nothing recorded). Live: TESTING.md.

#### 5.125 Puzzles in a focused storm (the owner's request, 2026-10-18)

"Currently in storm when you have a focus selected, puzzles are automatically disabled. Add a way
to include puzzles in a focused storm." Decided:
- **"Puzzles too"**, a checkbox in the focus's panel once a chip is on (per device, off by default,
  so a focus stays as it was): the session deals the focus's positions and puzzles at the share of
  cards set under Puzzles, the same way the classic storm and set do (§5.48). With the share at
  0% it says to set one there.
- **Puzzles aren't filtered by the focus**: the tags are worked out from a Stockfish list and
  Maia's policies that a puzzle doesn't have. A focus with no ready position can still start when
  puzzles are on and ready (only puzzles, then).
- The count's line ("· 3 puzzles at 25%") and the storm's note follow the setting.

Tests: `puzzles.spec.ts` (desktop and phone: a Quiet focus with no position ready can't start;
with Puzzles too it does, at 100%, and deals a puzzle). Live: TESTING.md.

#### 5.126 Scores at equal ratings (the owner's request, 2026-10-19)

The owner asked whether "PETER" ("Performance Evaluation Tracking Elo Rating": lines that "tend to
result in the highest rating gains", accounting for rating differences in the online databases)
was relevant here. No published description of it was found; as quoted it is a move's score with
the rating gap between its players and their opponents taken out, which is what a performance
rating does (ChessBase's Perf; Lichess's player explorer computes one per move). Found, and asked
for in all three parts below ("build all three"):

- **The data is there.** lila-openingexplorer (read at its HEAD, 2026-10-18) files a Lichess game
  under the band of the two ratings' midpoint and records each move's `averageRating` as the
  rating of the player who made it (`Stats::new_single(outcome, mover_rating)`; Masters likewise).
  So the replies' ratings at the position after a move are its players' opponents'. The local
  explorer (q_extension's explorerdb) records no ratings.
- **It matters.** Measured live from a cloud container against explorer.lichess.org with a token
  (blitz and rapid, five positions, bands 1800–2000 and 1400–1600): a position's moves differ by
  10–30 points in their players' gap, which moves the score by 1.5–4.5 points, as much as the
  differences the Score bars show. 1.e4 Nf6 at 1800–2000: 51.7%, the best of Black's ten replies,
  is 49.0% at equal ratings (its players +19); 1.e4 c5 2.d3: 48.2% (8th of 9) is 52.5% (3rd,
  −30). At 1400–1600, 1.d4 Nf6 2.c4 c5 / e5 / g6 score 53.1 / 51.5 / 50.3 and all 49.8 at equal
  ratings. The first moves' spread, 51.2–54.0, is 51.6–52.4.
- **The arithmetic** (`core/explorer/equal.ts`): the opponents' average is the replies' ratings
  weighted by games; the gap gives Elo's expected score `1 / (1 + 10^(−gap/400))`; the score at
  equal ratings is `raw − (expected − ½)`, taken from the mover's wins and given to its losses
  (draws kept, clamped). The gap of the averages stands in for the average of each game's gap:
  the curve is close to straight over tens of points. Limits, said in the titles and here: only
  the measured gap comes out (strength a rating misses stays in); the position after a move also
  counts games reaching it by another order.

**(1) The explorer's Equal Elo view.** The Score header is now a switch of three on every games
tab: Score (the games' own results) → Equal Elo → Prepared (with the Practical column on) →
Score; `scoreView` per device replaces `prepared` (a saved `prepared: true` reads as Prepared).
Sort by score stays in ⇅; at equal ratings it sorts by the adjusted scores (rows without one by
their own). The bars of Equal Elo are dashed, each titled with its score, the games', both
averages and the gap, the split and the games. The games after a move come from a new worker
request, `childGames` (the tab's database alone, no ChessDB, priority 600: under the panel's
lookup and practice, above coverage and the search, which asks the same positions for its rows
and then finds them cached), asked by the panel (`askChildren`) for the rows over 2% of the games
(8 at most) and the chapter's own moves, and dropped when the panel moves on. Each costs one
request of Lichess's 16 a minute the first time; the explorer cache keeps them 30 days. A row not
asked, still asked, failed, with nothing rated after it, or on a database without ratings keeps
the games' bar, faded, with the reason in its title.

**(2) The prepared split at equal ratings** (a setting, "Prepared results at equal ratings", on by
default). Only the split's games' part, `1 − prior`, carries the gap (its Practical part comes from
engine evals), so it moves by `(expected − ½)(1 − prior)`, with the row's gap standing in for every
leaf's: the leaves' games are the row's games split by the replies. Done in the panel, not in the
search: q_extension's port (§5.21) stays as it was, so its Practical values still match
q_extension's; the prepared bars don't while the setting is on. The row's position is the search's
own first node, so its games come from the cache. On the Masters tab it is left alone (the split is
Lichess's, the ratings Masters'), and the bar's title says so. The green best follows the corrected
splits.

**(3) The games' own explorer** (§6, item 4) gets a "± Elo" column: the user's score in the games
through each move against what each game's two ratings predicted, in points (`expectedOf`,
`expectedCell`, `expectedTitle` in `core/games/openings.ts`), green above, red below, faded under
10 games. Its title adds the performance: the opponents' average plus `400·log10(s/(1−s))`, ±800 at
0 and 100%. Games missing a rating are left out of it; with none, "–".

Tests: `equal.test.ts` (Elo's curve, the opponents' average, the shift and its clamp, 1.e4 Nf6 as
measured, a weaker side's score going up, nothing without games, a rating or rated replies, the
prepared split's games' part, the details), `service.test.ts` (the games after a move: the tab's
database alone, cached, nothing after a drop), `table.test.ts` (the score order at equal ratings),
`openings.test.ts` (the column over rated games, the performance and its ends, the cell and title),
`explorer.spec.ts` (desktop and phone: Equal Elo's bars and titles worked out by hand, the faded
row, the positions asked with the token, the sort, kept after a reload, the switch's order; the
prepared bar corrected and the one with nothing rated after it), `games.spec.ts` (the column and
its title). Live: TESTING.md.

#### 5.127 Show and grade retries its mistakes (the owner's request, 2026-10-19)

"When using show and grade (review/queue, not learn) - we should let the user "retry" their
mistakes at the end of the variation. No need for "two correct in a row", one is fine. It needs to
be clear that we're showing a mistake, not starting a new variation."

- **The trainer** (`retryShown`, a session option): in show and grade, at a walk's end, each move
  failed on it (4, or shown after a wrong move or Hint) is shown again from the opponent's move
  before it, the mistakes taking turns, until known once (2, 2). A miss starts it again. Nothing
  is graded or recorded: the card was graded on the walk (§5.77's rule). With *Mistakes retried*
  at 0 nothing is retried, as elsewhere; the setting's number is not used here, one is enough.
  Repetitions stay out of show and grade.
- **Where**: the queue's show and grade, show and grade switched on in the queue, a line picked or
  difficult lines (§5.16). Not in Learn, which keeps §5.77's walk as it was in show and grade
  (nothing retried) and its own retries when moves are played.
- **Said on the screen**: the pause at the walk's end reads "Not a new line: your mistake again"
  (or "your 2 mistakes"), the ask "Your mistake again: show it", the move shown "Your mistake
  again: c5"; the feedback line is in the warning colour throughout the retries, and the counters
  keep the line's number with "mistakes left n". No new line is announced (no `line` effect), and
  the board goes back on the same line's moves.

Tests: `trainer.test.ts` (show and grade with `retryShown`: the failed move shown again from the
move before, a miss and then known once, graded once, no new line; nothing without `retryShown` or
with retries off), `timeTravel.test.ts` (each session kind's options: not Learn), `train.spec.ts`
(desktop and phone: c5 missed by 4, shown again at the line's end with the notes, the colour and
the counters, known once, the four events unchanged). Live: TESTING.md.

#### 5.128 Opening ideas: a verified idea deck from a repertoire (the owner's request, 2026-10-19)

The owner: start learning a new opening with its key ideas and rules of thumb, as PGN flashcards
repworks imports: a position, arrows, and a description of the idea. A skill should make the
accuracy consistent. This is mainly for openings the owner hasn't annotated: repertoires that the
owner's own builder (deeprep) generates from the Lichess database by practical eval, prepared score
and recurring themes. Their comments carry move shares and transpositions, and there are often
few model games. "We can put much effort into making skills or in any way improve Claude's chess
vision/wisdom." The owner approved the shape and the deck format the same day: a pilot, then the
skill and its tools, then idea cards in the app.

- **The owner's three rules** (2026-10-20, after reading the pilot deck):
  1. **The repertoire is right.** "The purpose of this feature isn't to find better moves. Even if
     you find a 'better move', the original move was chosen for a reason": practical eval, ease
     of learning, transpositions and moves that recur. So at a repertoire position, the card's
     answer and its main line's move are the repertoire's move, never marked `?`. No card offers
     a better move, and the skill reports no gaps or improvements. The engine explains the
     repertoire's moves (why the other squares are worse there) and judges moves beyond its
     line ends.
  2. **Maia at 2000 or more**, since Maia plays a little below its number. The tools refuse a
     lower rating, and read 2000 and 2200 by default.
  3. **Development first.** The first ideas say where each piece develops and when, with pawn
     moves: "define when the f8 bishop should develop to e7, d6, c5 and why". Was: one card for
     each square, all asking where the piece goes there and why. Since 2026-10-24 (below): a
     square gets a card only where it is a real decision, with a neutral question; a natural or
     forced square is a clause of the piece's rule, and the contrast is taught by the rule and
     the cards' explanations.
- **Why tools.** Claude knows a lot of chess and explains it well, but misreads boards. So the
  skill's rule is that every concrete claim rests on a tool output: a move good or bad, a piece
  loose, a square weak, a tactic that works, a legal line, a frequency. Knowledge decides what
  to look for and how to say it.
- **The tools** (`scripts/ideas/`, run as `node scripts/ideas/cv.ts <command>`). They use
  core's parser, Maia encoding, UCI reading and the storm's grading scale, so a deck reads and
  grades as the site would.
  - `vision.ts` (pure) is the position's facts:
    - material, pawns (islands, chains, isolated, doubled, backward, passed), files, centre
    - development and king cover
    - each piece's attackers and defenders, and a static exchange with x-rays (a capture by a
      piece pinned to a queen or rook says so)
    - pins, both sides' breaks and outposts
    - the side to move's checks, captures and double attacks, and the other side's threats
      (read with the turn passed)
  - `engine.ts` runs Stockfish under Node: the vendored lite build, or a native binary named by
    `STOCKFISH`. Searches are cached on disk, shared between agents.
  - `maia.ts` runs Maia 3 on onnxruntime-web, at 2000 or more.
  - `tree.ts` builds the repertoire's positions merged across transpositions, with each one's
    reach (the opponent's `{ 45% }` shares multiplied along the way). It also gives the profile:
    our moves, our pieces at the line ends, structures, material and kings, all weighted by
    reach. And it gives the development map (`develop`), which follows each of our pieces and
    pawns, named by its home square, through every line:
    - its first squares by reach, in the order the pieces come out
    - the positions where it goes to each square
    - the setup features that stand there more than at its other squares, a player's words for
      the condition (the f8-bishop in the pilot: d6 "with White Bb5", 86% there and 0% at its
      other squares; c5 with Nc3; e7 with Be2)
    - its routes to the line ends

    `squares` grades every move of one piece at a position: why the repertoire's square and not
    another.
  - `playout.ts` plays seeded short games, Maia or Stockfish on each side.
  - `check.ts` is the deck's check.
  - `cv.ts` is the command line. A move that is illegal or ambiguous is refused, and the legal
    moves are listed.
- **The deck format** (approved by the owner): one chapter per idea, with these headers:
  - `ChapterName`
  - `Orientation`
  - `FEN`/`SetUp` (the card's position)
  - `IdeaKind`: one of overview, structure, break, placement, maneuver, king, exchange, tactic,
    trap, move-order, endgame
  - `IdeaQuestion`
  - `IdeaSource`

  The comment before the first move is the explanation, with its arrows (green: our plan; red:
  their threat; blue: a second option; yellow circles: key squares). The main line plays the idea
  out. A side line marked `?` shows where it fails. The rules of thumb are overview chapters at
  the opening's start, rule n summing up idea n: "0. Rules of thumb: where the pieces go" and
  "0b. Rules of thumb: plans and tactics", each under 1500 characters (two since 2026-10-20: the
  development rules would have made one too long to read). More positions of the same idea are
  their own chapters ("3b. …", "3d. … (where it fails)"). A card's answers are its first move and
  any first move marked `!` beside it; an unmarked side line at the start is a playable move that
  isn't the answer. At a repertoire position, the answer is the repertoire's move. A side line of
  ours beside it shows why another square is worse there, and never grades better. The
  site keeps the headers as imported, so no format changes: a deck imports today as a reference
  study (§4.10, §5.76).
- **The check** (`check <deck> --rep <repertoire>`) fails the run on any of these:
  - at a repertoire position: a card's answer, or a main line's move, that isn't the
    repertoire's move, or the repertoire's move marked `?`
  - a missing header or an unknown kind
  - no explanation
  - an illegal move
  - a comment over Lichess's limit
  - a chapter that doesn't come back unchanged from the site's writer
  - a move of the deck's side beyond the repertoire that Stockfish grades `bad` or worse, unless
    marked `?` (the repertoire's own moves aren't graded)
  - a `?` that isn't `bad` or worse, a `??` that isn't a blunder, a `!` that isn't `great`

  It warns on:
  - an arrow that starts on an empty square, unless it continues a route
  - an opponent's blunder that isn't marked
  - beyond the repertoire, a card's own move that isn't `great`
  - at a repertoire position, a side line of ours that grades better than the repertoire's move
  - a `?!` that is `great` or `good`
  - two cards at the same position (the overview chapters make no cards)
  - an overview chapter with a question or moves: it would make no card (the first pilot's
    idea 1 was two such chapters)
- **The skill** (`.claude/skills/opening-ideas/SKILL.md`):
  1. Read the repertoire (`tree`, `profile` with the engine on the most reached line ends,
     `develop`).
  2. Find ideas through five lenses, development first:
     - development of the pieces: each first square with 3% or more reach, its condition from
       `develop` confirmed on the board, and its reason from `squares` (a card only where it is
       a real decision in `decisions`, since 2026-10-24)
     - development of the pawns, the king and the rooks
     - structure and material
     - tactics, traps and attack (`maia --grade`: the opponent's natural moves that lose)
     - move orders and the opponent's choices
  3. Curate about 12 cards from `decisions` by value, in at most 8 ideas with one rule each
     (12–18 ideas, one card per square, until 2026-10-24): the development ideas first, in the
     order the pieces come out, then the rest in the order they come up in a game. Cover every
     opponent setup with 5% or more reach.
  4. Verify each idea as a skeptic.
  5. Write the deck, and check it against the repertoire to zero errors.
  6. Review as a critic, fix, and check again.
  7. Deliver the deck as a file. Decks and repertoires never go in this public repository.

  With workflows opted into, steps 2–6 run as the saved workflow `opening-ideas-deck`
  (`.claude/workflows/opening-ideas-deck.js`).
- **The pilot** (2026-10-19/20): the owner's Scandinavian Gambit repertoire for Black (1.e4 d5
  2.exd5 c6 3.dxc6 Nxc6; 320 positions, 34 line ends; Black a pawn down at 85% of them, about
  −0.15 to −0.5 at the most reached). The lenses proposed 32 ideas. The curator kept 14 and the
  skeptics fixed all 14, finding 13 faults in the rules, most of them too broad. For example,
  "...Qb6 against Bg5" holds only while both kings are in the centre or an e7-bishop can take
  back on f6. The critic then found three rules still wrong, two duplicate cards and the rules
  numbered apart from the ideas. Those lessons are in the skill now: one rule per idea, ordered
  by the game, each rule read literally against every card, and the duplicate-position warning.
  The deck has 47 chapters, and its check reports 0 errors and 0 warnings at depth 18. It took
  11 agents and about 1.3 million tokens, on the single-threaded lite Stockfish. It also gave
  repertoire notes for the owner: gaps, a few improvements, and the owner's 8...h6 note checked.
  The owner read it (2026-10-20) and set the three rules above. Checked against the repertoire,
  it had one card answering with a better move than the repertoire's: 12b, 6...Qb6 for the
  repertoire's 6...Bc5.
- **The second pilot** (2026-10-20): the same repertoire through the updated workflow, with the
  three rules. The full run (five lenses, about 14 agents) cost more than the owner wanted, so on
  the owner's word it ran lean: the pieces and pawns lenses only, then one writer that also
  verifies and one critic that fixes (`lenses`, `lean`). That took 4 agents, about 0.54 million
  tokens and 21 minutes. The deck has 23 chapters: "0. Rules of thumb: where the pieces go"
  (seven rules, one per piece: the e-pawn, g8-knight, f8-bishop, queen, c8-bishop, h-pawn and
  a8-rook, each with its squares and when), "0b. Rules of thumb: plans and tactics" (the e-pawn
  against d4), and 21 cards in the order the pieces come out. Its check against the repertoire
  reports 0 errors and 0 warnings at depth 18, and 21 cards start at a repertoire position.
  Headless (desktop Chromium), the app made 21 idea cards from it and every card's answer was
  taken as right. The critic corrected six claims, each with the tool output behind it (a pin
  that wasn't one, a break rule keyed to the wrong condition, a Maia claim the numbers didn't
  bear out). It left two gaps, to save tokens: no card for the 4.Bb5 e5 5.Bxc6+ bxc6 structure
  (about 7% of games, more by transposition) or for when we castle; and about a third of the
  cards sit at positions under 1.5% of games.
- **A card is a decision** (the owner, 2026-10-24, after training the first three decks made from
  the "Against d4" repertoires: "in many cases we're asking the wrong question, or the question
  itself reveals the answer", and 30+ cards are too many for a small chapter).
  - **What was measured.** The three decks (Benoni gambit accepted 35 cards for 47 line ends,
    Benko 27 for 79, Anti-c3 42 for 46) were run through Stockfish (lite, depth 14) and Maia
    2000:
    - In 43 of the 104 cards, the piece the question named had one sensible move (within 10%
      win of the best). Examples: "where does the f8-bishop go?" where Bxb4+ was its one square
      and the question said "his other pawn stands on b4"; Bxd6 where Be7 loses to dxe7; "what
      does our e-pawn do?" with one legal move.
    - In 66, once the question named the piece, Maia found the answer 85% of the time or more.
      Where the move was a real lesson (…Nf6, Maia 3% unprompted, bxc5 81%), naming the knight
      made it 100%.
    - In 30, Maia played the answer 60% of the time or more unprompted: recaptures and natural
      moves (Bxc5 94%, bxc6 93%, fxe6 97%).
    - The card's kind on the counter ("break") told which kind of move was the answer.
    - Why: rule 3 as written (one card per square, the question naming the piece), and the lean
      workflow's writer, told to keep every development idea, had no cap (the 12–18 lived in the
      curator, which lean skips). The deck check checked accuracy only, and the critic's "one
      clear answer" favoured forced moves. The Benoni critic called the rules "a lookup table"
      and passed the deck.
  - **Built:**
    - **`cv.ts decisions <rep>`** (`scripts/ideas/decide.ts`): our positions at 2% reach or more,
      past the trunk, each with how often Maia 2000/2200 (averaged) finds the repertoire's move,
      Maia's likeliest other move, what it gives up against ours (Stockfish depth 14), and our
      sensible moves. Ranked by value = reach × (1 − found) × (½ + cost/40, at most 1): a miss
      that costs nothing counts half. The natural (found 80% or more) and forced (one sensible
      move, found half the time or more) are listed apart, as rules of thumb, not cards. On the
      Benoni (91 positions, 2.5 minutes) its top includes the deck's good cards (…d5, …Nf6,
      Qa5+, …Bb4, …Qe7) and two it lacked (…Re8, …Nxe4+); Bxc5, Bxd6 and bxc6 are in the last
      list.
    - **The check** (`check`, Maia on by default, `--no-maia` to skip) refuses:
      - a card whose answer is the only sensible move, unless Maia misses it (under half the
        time): then it is the one move that saves us. One sensible move that isn't the answer
        is a decision still: the repertoire is right where Stockfish disagrees;
      - a question that names the square an answer goes to. Moves it quotes ("5. Bg2", "cxd6",
        "…a5") and pieces named by a square ("the c5-bishop") don't count;
      - a question that names the moving piece (`namedMovers`: "the f8-bishop" is the bishop
        of that colour, "which pawn" every pawn, "his knight" theirs) when that piece then has
        one sensible move or Maia finds the answer 85% of its moves or more.

      It warns on:
      - a card Maia finds 80% of the time unprompted;
      - a card under 2% reach;
      - more cards than `--cards` (default 12).

      It refuses more than 15 cards. The current Benoni deck now fails with 25 errors, among
      them all three of the owner's examples.
    - **The skill and the workflow:**
      - Cards are taken from `decisions` by value: about 12 (the workflow's `cards`), never
        more than 15, in at most 8 ideas, at most 8 rules.
      - The question is neutral ("White has just played 7. Bg5. What do we play, and why?"),
        with no answer square, no list of candidates, and the piece named only where it still
        has a real choice.
      - The critic checks that each card is a real decision and the size.
      - Lean runs two agents (writer and critic, no lenses): `decisions` finds the positions
        the lenses looked for.
    - **The app:** the card's kind is hidden while it asks, as its chapter's name is, and shown
      on the back.
  - The three decks are not remade yet (the owner, 2026-10-24: later). Decks 3 and 5 wait for the
    new process too. Decks 1, 2 and 4 are remade (below).
  - Tests (`test/unit/scripts/ideas.test.ts`):
    - the pieces and squares a question names;
    - the decisions on a small repertoire, with Maia faked;
    - the square named, the deck's size and a rare card;
    - with Stockfish at depth 8 and Maia faked:
      - the one sensible move found, an error;
      - the same move missed, no error;
      - the bishop named and then found, an error;
      - the same card asked neutrally, only the warning that Maia finds it unprompted.
  - **Deck 1 remade** (Benoni gambit accepted, 2026-10-24, the first under these rules; lean, the
    writer's and critic's steps done in one session, as no workflow tool was available): 12 cards
    in 7 rules (14 chapters), against 35 cards before. Every card at a repertoire position, its
    question "White has just played …. What do we play, and why?". Its check against the
    repertoire (Maia on, depth 18): 0 errors, 0 warnings. The deck is in the testing data repo.
    The run found two flaws in the tools, both fixed:
    - **Reach across transpositions.** `tree` carried reach down each move order separately, so
      a move order that gave one reply only (with no share) passed all of its games to it, though
      the merged position's other order gave the replies' shares. Here 3. e4 Bxc5 4. Nf3 Nc6 gave
      only 5. Bb5 (no share), and 3. Nf3 Nc6 4. e4 Bxc5, the same position, gave 5. Bc4 38% and
      5. Nc3 26%: 5. Bb5 got 11% of games and 5. Bc4 2.7%. Now the reach flows down the merged
      positions, parents first: a move without a share beside moves with one takes an even part
      of what they leave (5. Bb5 6.5%, 5. Bc4 6.8%), and moves none of which has a share split
      the games evenly (before, each kept all of them). The profile and the development map weigh
      the same way. `decisions` then lists 58 positions at 2% or more, not 91; the 5. Be3 sideline
      of 3. b4 (given without a share beside 5. cxb6 56% and 5. Qd5 14%) went from 12% to 3.5%.
    - **A pinned capturer.** `look`'s static exchange counted a capture by a piece pinned to its
      king: after 7. Nxe5 Qa5+ 8. Nc3 Nxe4 it called our e4-knight "lost to an exchange (+3)", the
      only capturer being the c3-knight that Qa5 pins. The exchange now leaves out a piece pinned
      to its king, unless it takes the pinner.
    - Tests: a move order with one reply and no share passes on that reply's part only (and the
      development map weighs its line ends so); a piece pinned to its king takes the pinner but
      nothing else, and after 8. Nc3 Nxe4 the e4-knight isn't lost.
  - **Deck 4 remade** (Anti-c3 deep, 1. d4 c5 2. c3 Nf6, 2026-10-24; lean, writer and critic in
    one session again): 12 cards in 7 rules (14 chapters), against 42 cards before. The cards are
    the top of `decisions` (118 positions at 2% or more) by value, with duplicates merged
    (3. dxc5 e6 into 4. dxc5 e6, 3. Bg5 Ne4 into 4. Bg5 Ne4, the castling after …Bc5 into its
    card) and two of the 3.Bf4 line's equal-split 3.8% positions kept for what Maia's miss costs
    there (…Bc5, where Maia takes on e4 59% of the time, and …g5, where it plays …Qa5 42%).
    Every card at a repertoire position. Its check against the repertoire (Maia on, depth 18):
    0 errors, 0 warnings. The critic, reading each rule literally against the repertoire,
    narrowed three: the queen rule (after 3. Bg5 Ne4 4. Bf4 cxd4 5. cxd4 the repertoire plays
    …e5, not …Qb6), the e-pawn rule (…e5 backed by knights too) and the f8-bishop rule (…Bc5 to
    take back, then b4, then d6); and dropped a side line (9. Bg3 Be7) where …Bb4+ was a check
    the rule would have called for. The deck is in the testing data repo. The run found one gap
    in the tools, fixed:
    - **A pawn push that hits a piece.** `look` listed a side's pawn breaks only where the push
      hits a pawn, so it never said that …g5 hits the f4-bishop or …h6 the g5-bishop, and after
      3. Bg5 Ne4 4. Bf4 cxd4 5. cxd4 it gave …e5 as hitting d4 alone. Such claims had to be read
      off the position after the move. `breaks` now also lists the kicks (pushes that attack an
      enemy piece other than the king, with whether the pawn is safe there), printed after the
      breaks as "pushes that hit a piece: g5 (hits Bf4, loses the pawn)". Test: …g5 in the
      deck's card 7 position, and …e5 and …g5 after 5. cxd4 above.
  - **Deck 2 remade** (Benko gambit, 2026-10-24; lean, writer's and critic's steps in one session
    again): 13 cards in 7 rules (15 chapters), against 27 cards before. Every card at a repertoire
    position and asked "White has just played …. What do we play, and why?". Its check against
    the repertoire (Maia on, depth 18): 0 errors, 1 warning, the 13th card, kept so that every
    first square with 3% or more reach has its rule (the a8-rook's b8, at 3%, is a real decision:
    Maia 2000 plays …Qxb6 61%, which 10. Ne5 punishes). Maia finds the answer 5–68% of the time
    (…Bb7 against 4. e3: 5%). The deck is in the testing data repo. The run found one flaw in the
    tools, fixed:
    - **An exchange taken in another order.** `decisions` ranked 6… Nxd5 (5. b6 e6 6. Nc3) as a
      card that Maia misses 73% of the time, its "miss" 6… exd5 33%; but 6… exd5 7. Nxd5 Nxd5
      8. Qxd5 is the repertoire's 6… Nxd5 7. Nxd5 exd5 8. Qxd5, and the card would have called a
      right move wrong. Now `transposingMoves` finds our other captures that take the same
      exchange on one square in another order (their captures kept) and reach the exchange's end;
      `decisions` counts them as found (6… Nxd5: found 60%, value 1.7 from 2.8) and prints the
      order, and the check warns on a card that has one. Only exchanges on one square: a looser
      swap (our move, their reply, our other move) counted moves White would not answer the same
      way (6… Ne4 7. Nc3 for 6… Qa5+ 7. Nc3), and was dropped.
    - Tests: the Benko exchange found, with its order; no swap at a check or a non-capture; the
      decision's found counting it; the card warned. Control: without the check's part, it fails.
- **One card per stretch of a line, and what the owner values most** (the owner, 2026-10-25,
  after training deck 4, for future decks; the decks made so far are not remade): its card 2
  asked 3. Bf4 …cxd4 and the next card 2b asked 4. cxd4 …Qb6, the very next move of the same
  line. "This is not efficient, and the knowledge in the second card should be made clear in the
  first card." What the owner values most in an idea deck:
  1. the common patterns, ideas and development squares;
  2. when we break these patterns (if at all);
  3. unintuitive decisions.

  - **Built:**
    - `decide.ts` `nextDecisions`: our next positions in the same line, after our move and the
      opponent's reply that half the games or more take there. `decisions` marks such a
      position "right after …" (the decision before it): one card for both.
    - **The check** refuses a card at the position after another card's answer and the
      opponent's reply (its main line's, or the repertoire's for half the games or more), and
      warns on a card further down another card's main line, which already plays its answer.
      On the three remade decks (no engine): deck 4's card 2b (the owner's example), deck 1's 2b
      and 3b, and deck 2's 5, 5b and 5c are refused; 3 more warned.
    - **The skill and the workflow:** the owner's three values above. The rules of thumb carry
      the patterns, and every card hangs on one; cards go to where the repertoire breaks a
      pattern (quoting the rule it breaks and why) and to moves a player would miss. A card's
      explanation says what follows its move (the plan). The critic checks both.
  - Tests: the owner's case on a small repertoire, in either order, with the repertoire and
    through the card's main line alone; a reply 10% of games take is a card of its own; a card
    further down the main line is a warning; `decisions` marks the next move. The earlier test
    deck now reports its card at 4. Nf3 …e5 then 5. Bb5 (the repertoire's main reply), the
    position of its first card.
- **Idea cards in the app** (built 2026-10-20, as built below):
  - **The card:** one chapter is one card (`i|<sid>|<cid>`), enrolled for a whole study at once
    from its ☰ menu, by `idea` events as plan cards' `plan` events (§5.61). The overview chapter
    makes no card. A chapter-keyed card keeps the deck as written: a plan card gathers every
    comment at its position from every study, which would mix the repertoire's notes in.
  - **A review:**
    1. The card's position is shown, turned to its `Orientation`, with the `IdeaQuestion`.
    2. The user plays a move or presses Show. A move is right when it is the card's first move
       or a first move marked `!` (or `!!`) beside it. Another move from the card's side lines
       shows its comment; a move the card doesn't have is just not the answer.
    3. Then the explanation and its arrows, and the main line stepped or played at the pace with
       its comments and arrows. A side line can be opened as a comment line (§5.12).
    4. A move is graded by itself (right the first time: Good; wrong: Again). Show, a card with
       the other side to move, or a chapter with no moves is self-graded: Again, Hard, Good or
       Easy.
  - **A new card** is shown first, then asked, as Learn does.
  - **Where:** the ideas study's Train button, and the home's due counts, within a daily limit of
    new idea cards.

  **As built** (2026-10-20):
  - **Core.** `src/core/ideas/cards.ts`: a chapter makes a card when it has an `IdeaKind` other
    than `overview` (unknown kinds too: the deck's check rejects those). The card is read live
    from the chapter: its question (`IdeaQuestion`; "What is the idea here?" when missing), its
    side (`Orientation`, else the side to move), the explanation (the comments before the first
    move) and its shapes. Its answers are the first move unless that is marked `?` or `??`, and
    the first moves marked `!` or `!!` beside it. It is self-graded when its side isn't to move
    or no move answers it. A move played is right, one of the card's side lines, or a move the
    card doesn't have, compared by SAN. A side line becomes a comment's line,
    `(7... Nxd4?? 8. Nxd4 Qxd4? 9. Bb5+)` then its comments, so the §5.12 code previews it on
    the board. It follows the line's main moves; lines nested in a side line are left out.
    Today's queue is the game cards' (`gameQueue`): due first, then new cards in the deck's
    order (studies by name, chapters in order), within the daily limit.
  - **The session** (`src/core/ideas/session.ts`, pure):
    - Due cards first, then new ones; a new card opens on its back ("Ask me" then asks it).
    - **Read or Train** (asked for 2026-10-20): a switch in the screen's head, kept per device
      (`localStorage`, like the pace), default Read. Read is the above; Train asks every card at
      once, new ones too, so the answer isn't seen first. Switching changes the card in front
      only while nothing is answered on it (a new card shown is asked; a new card asked untouched
      is shown first), then every card after. A retry is asked in both.
    - A move right the first time records Good. The first wrong move records Again at once, with
      the move in `w`, so leaving doesn't lose it. The board is set back, and the user tries
      again or presses Show.
    - Show records nothing until the owner's grade, unless a wrong move already graded Again.
    - A card graded Again comes back at the session's end, not graded: asked until a move
      answers it, or shown once when self-graded. FSRS never brings an Again back the same day
      (§4.8), so this is the session's own retry, as show and grade's (§5.127).
    - **Train again** (the owner's request, 2026-10-21; it used to rebuild today's queue, empty
      by then, so it did nothing): every card of the deck (or the study), in its order, due or
      not. A card in today's queue is recorded as ever; any other card is practice: asked and
      graded the same way, retried after Again, but nothing is recorded ("practice, not
      recorded" on the counter), so it keeps its schedule, as the line trainer's practice does.
      The done card shows it only when the deck has cards.
  - **The `idea` event**: `{ "k": "idea", "card": "i|<sid>|<cid>", "on": true }`. The latest
    event of each card decides, as with `plan`. Removing a card keeps its reviews; made again,
    it goes on from them.
  - **The daily limit** is `newIdeasPerDay` in `settings.json`'s `train` (default 5, 0–100),
    shared by the devices like the limit of new moves, and set in Training settings. A missing
    field means the default, so older files read as before. Cards first reviewed today count.
  - **The ☰ menu**, in a study whose open chapter has an `IdeaKind` or which has cards:
    - "Make idea cards" enrols every chapter that makes one, read from all the study's files.
    - With cards: "Idea cards for new chapters" enrols the chapters added since, and "Remove
      the idea cards (n)" removes them all.
  - **The screen**: `#/ideas` (every deck) and `#/ideas/<sid>` (one study), `src/ui/Ideas.tsx`.
    - Asking: the board at the card's position turned to its side, a counter (n of m, the kind,
      new, or "again, not graded"), the question in large text, Show (Space). The chapter's name
      is hidden while asking: it often names the answer.
    - A wrong move: "b6 isn't the answer (Again)", and for a side line its moves (clickable on
      the board) and comments.
    - The back and a new card's first showing: the Read view's `LineReader`. It shows the
      explanation and arrows at the start, the main line stepped with ← → or played with ▶▶
      at twice the training pace (`playMs`). The other moves at each position are comment lines
      under the comments (`sideLines`). Above them: the chapter's name, the question, and what
      happened ("c5: right, after b6. Recorded: Again.", "Shown. The answer: Bd7.").
    - After a right move (the owner's request, 2026-10-21: the board popping back to the start
      was jarring), the back opens at that move, so the board stays where it was; the line goes
      through the move played (a `!` move beside the main one too, the main line then one of the
      other moves at the start), and ← goes back to the explanation. When the move has no
      arrows or circles of its own, the start's stay on (`carryShapes`, the first move only).
      The back is turned to the card's side (`orientation`), as the question was.
    - Below: Again/Hard/Good/Easy (1–4) when the owner grades, else Next (Space or Enter).
      Also Open the chapter, Analyse (from the back; ← comes back to the session) and Remove
      the card. The end shows the grades and Train again.
  - **The home**: a study with idea cards shows their due and new counts and a Train button to
    `#/ideas/<sid>`, as a repertoire study's. The training card adds "Ideas: n due · m new ·
    Train ideas", and with no repertoire it shows only that line.

Tests: `test/unit/core/ideas/cards.test.ts` (a French Advance deck written for the tests from
public opening knowledge, `test/fixtures/ideas/french-advance.pgn`, checked at depth 18 with 0
errors and 0 warnings). It covers the cards, the answers and a `??` first move, the judged moves,
a side line's text, self-graded cards, the `idea` event and the enrolments, the queue and its
limit, and the session's grades, retries and removal. Controls: an unmarked side line counted
as an answer fails the cards' and the moves' tests; no retry fails both session tests.
`test/e2e/ideas.spec.ts` (desktop and phone) imports the deck as a reference study, makes the
cards from the ☰ menu, trains from the home's Train button (a side line's move, the answer, a
`!` move, Show and Hard, the retry), checks the synced events, and removes the cards.

Tests of the skill's tools: `test/unit/scripts/ideas.test.ts`. It covers:
- exchange values on a gambit position worked out by hand, and a capture by a pinned piece
- a pin, a mate in one, a knight fork, a threat read with the turn passed, no pass when in check
- islands, isolated, doubled and passed pawns, chains, the French's breaks, a Najdorf's d5 outpost
- the look as text from Black's side
- an ambiguous move refused with the legal moves named
- the reach multiplied and merged across a transposition, a guess marked
- the deck's static check, with two chapters at one position
- the development map on a small repertoire: the f8-bishop's three squares each with its setup,
  the order the pieces come out, castling's king and rook routes, the trunk left out
- Maia refused below 2000
- the deck against a repertoire: its move answers, a side line beside it, another move as the
  answer, its move marked `?`, a main line leaving it, two overview chapters at one position, an
  overview chapter that asks a question
- grades and the deck's check with Stockfish at depth 8: the marks, a card's own move, a `!`; and
  against a repertoire, its blunder not graded and a better move beside it warned

Live: TESTING.md (the owner reads the pilot deck, then trains it as idea cards).

#### 5.129 The material under every board (the owner's request, 2026-10-21)

The owner: on every board, a small view of the material, pieces and pawns, and +1.

How others show it: Lichess (its source, `ui/lib/src/game/view/material.ts`) shows only the
difference: each side's pieces left over once the other side's of the same kind cancel them,
the same kind overlapping and a gap between kinds, queen first and pawns last, then "+n" after
the side that is up (queen 9, rook 5, bishop and knight 3, pawn 1), above the board for the side
at the top and below it for the side at the foot, by its player. Chess.com shows every piece
captured, in the taken side's colour, by the taker's name, with the same "+n".

Built (Lichess's, the owner's choice after a first try with one row under the board):
- **Core** (`src/core/chess/material.ts`): `material(fen)` gives each side's surplus by role and
  White's points less Black's, from the placement alone.
- **The board** (`Board.tsx`): a row above the board for the side at its top and one below it for
  the side at its foot, as wide as the board, on every `Board` (study, analysis, training, idea
  cards, Read, practice and its review, games, the storm, a card's note): that side's surplus, in
  its own colour (the board's cburnett set), then "+n" if it is up. With nothing left over a row is
  empty; a bishop for a knight shows each in its row, with no "+n". The comment previews' mini
  boards don't have it: they are thumbnails. The first try (2026-10-21) put both sides in one row
  under the board, each in its colour; the owner asked for Lichess's place.
- **Their room** (`--material-h`, 22px each) is kept even when empty, so the page never moves as
  pieces are taken and retaken. The boards whose side is fitted to the window's height take both
  off their side, so nothing around them moves: on such a page the board is 44px smaller. What sits
  by the board's edges keeps to the board, not the rows: the eval bar beside it, the practice
  review's eval bar, the storm review's panel.
- Black pieces get a rim of the page's ink, which is light on a dark theme, where they would be
  lost; on a light theme it is dark and barely shows.
- The rows are not a `.cg-wrap` (that class is the board, to the code and the tests), so the board
  loads chessground's piece images once with their selectors widened to the rows.

Tests: `material.test.ts` (the start level; a pawn up; the exchange, each side's surplus and the
points netted; Black ahead; bishop for knight level; a placement alone), `analysis.spec.ts`
(desktop and phone: level after e4 e5 with no pieces; a FEN a pawn up, the board turned: the white
pawn, its image and "+1" above the board, nothing below), `storm.spec.ts` (the review's list ends
at the board's foot). Live: TESTING.md.

#### 5.130 The variation checklist on the study, synced (the owner's request, 2026-10-25)

The owner asked how mistake-lab's "Repertoire checklist" works and how it should be in Repworks.
Its generator, drill and completion are already here (§5.62, the same lines, reserve and gaps as
mistake-lab's code). This part covers what the port left out or does differently, with the
owner's answers of 2026-10-25: **the list is synced**, **the ranking stays mistake-lab's** (d'Hondt
over the explorer's shares, cut at a ply, not §5.70's order), and **paused lines are left out**.

How mistake-lab's works (read at `c525403`: `generateTodoVariations`, `startTodoVariation`,
`finishTodoDrill`, `renderTodoStudyBlock`, `todoPresetStats`, `excludeTodoVariation`, and its
reference's VARIATION-CHECKLIST section): the study's covered tree from the start, its move at
the user's positions and every covered reply at the opponent's, scored by the explorer (1600–2500,
blitz to correspondence); N slots split down the tree by d'Hondt, capped by each subtree's leaves;
10 reserve lines in the order they would join; the uncovered replies played 8% of the time. A
drill replays the prep from move 1 (a move off it refused), then plays on from the line's end
against the explorer and Maia at Easy, Medium or Hard; a win checks the line off at that level,
the next level opening after it; the chips show the last five tries, a draw ½. ✕ takes a line
out and the reserve fills its slot. Every study is a folded block with a progress bar, the most
recently drilled first; hovering a line shows a mini board that follows the moves; Maia's
rating per level is a setting; the lists sync through its Gist. What Repworks lacks of it: the
place (it is only under Games → Repertoire check, one study at a time), the sync, the blocks and
their order, the preview, the opening names and the Maia setting.

Build order: (a), (b), (c); each pushed when its tests pass.

**(a) A synced list**
- **A `checklist` event** on `t|<sid>` (a new card kind, `checklistListCard`), written by Make:
  `{"k":"checklist","card":"t|<sid>","color":"white","ply":10,"n":10,"lines":["e2e4 e7e5 …",…],
  "reserve":[…],"gaps":[{"line":"e2e4 c7c6","p":0.12},…]}`, each line its UCI moves from the start
  and its share (`"lines":[{"m":"e2e4 e7e5 …","p":0.31},…]`). About 3 KB at 10 lines. The latest
  by replay order is the study's list. Older readers skip it (the log's rule).
- **Everything else is derived** from the event: each line's FENs, SANs and leaf key by replaying
  its moves; the lines shown are the event's lines less the excluded and paused ones, filled from
  its reserve in order up to `n`. So ✕ keeps writing only its `drop` on `c|<leafKey>`, and every
  device shows the same list after a sync, with no second round of explorer calls.
- **A list the study has left behind**: a line whose moves the study no longer plays (edited, or a
  move taken out) is shown struck through with "no longer in the study · Make again", and
  doesn't count in the progress bar. Make again keeps the exclusions, as now.
- **Lists made before this** (`repworks-checklists` in localStorage): on the first load, each one
  with no `checklist` event for its study is written as one, then the local key is removed.
- The drill's address names its line by its moves (`#/checklist/<sid>?line=<uci,…>&preset=…`),
  not its place in the list, so a list re-made on the other device doesn't change what an open
  drill (or a reload of one) plays.

**(b) Paused lines left out** (a change to §5.70, which counted them in the checklist)
- The walk's study moves (`studyMoves`) come from the study's **active** lines only: a position
  counts as covered, and its move as the study's, only on a line that isn't paused. A wholly
  paused branch is then like an uncovered one, and its slots go to its siblings.
- On a synced list, a line that became wholly paused since Make is hidden like an excluded one
  and its slot filled from the reserve, with "n paused lines hidden" under the list. Unpausing
  brings it back.
- A paused branch is not listed among the uncovered replies (it is covered, just not trained).

**(c) The checklist's own page, and what mistake-lab shows**
- **`#/checklist`**: every repertoire study (each side of a two-sided study on its own) as a
  folded block: the name, the side, a progress bar (wins over lines × 3 levels, coloured by
  `winRateColor`) or "not made". The most recently drilled first (the newest `practice` event with
  a preset at one of its leaves, or a drill opened in this session), then by name. Unfolded: lines,
  plies, Make or Make again with its progress and Stop, the lines, the hidden counts, the
  uncovered replies. `#/checklist?sid=…` opens with that study unfolded.
- **Where it is opened**: "Checklist…" beside Prioritize… on a study's line list (opening its
  block) and in each chapter's menu; "Checklist" on Home's repertoire panel; Repertoire check
  keeps a link to it in place of the section.
- **Each line**: its opening name (`openingNameAt` from the games index if it has the leaf, else the
  chapter's name the line ends in, as `[ChapterName]`), its moves, its share, the chips as now, ✕
  (asked once: "Take this line out? The next line takes its place.").
- **The preview**: hovering a move of a line (desktop) shows the position after it on a small board
  beside the row, the board following the cursor move by move; on a phone, a tap on a move shows
  it and a tap elsewhere hides it. The same for the uncovered replies.
- **Uncovered replies**: Open the chapter at the position (to add a move, as Prioritize's list
  does) beside Practise.
- **Maia's rating per level**: Easy, Medium and Hard each a number (1100–2600, step 25, the
  practice settings' range), defaults mistake-lab's (1750, 2000, 2150), kept on this device
  (`repworks-checklist-maia`); the precision stays the level's.

Tests:
- `test/unit/core/games/checklist.test.ts`: the event read and written (lines, reserve, gaps); the
  shown list derived from an event, exclusions and paused lines (filled from the reserve, in
  order); a line the study left behind; the walk over active lines only (a paused branch's slots
  going to its sibling, not listed as uncovered). §5.62's cases against mistake-lab's code stay as
  they are (no paused lines there).
- `test/e2e/checklist.spec.ts` (desktop and phone): the page from the line list and from Home; a
  list made on one device, synced, shown on the other with no explorer call; ✕ asked and synced; a
  line paused and hidden, unpaused and back; the preview on hover and on a tap; the drill opened by
  its moves and reloaded; Maia's rating used by the drill's opponent; an old local list carried
  into an event.

Live (TESTING.md): (desktop) a list made for a real study, then (phone) the same list after a sync,
drilled at Easy; the order of the blocks after drilling; the preview's feel on both.

**As built** (2026-10-26, (a)–(c) together): `src/core/progress/events.ts` (the `checklist` event:
`color`, `ply`, `count` (the lines asked for; `n` is the log's own counter), `lines`, `reserve` and
`gaps` as `{m, p}`, `calls`, `cut`; anything else refused), `checklistListCard` (`t|<sid>`);
`src/core/games/checklist.ts` (`studyMovesOf`: a study side's own moves from the index, every
chapter's or the active lines' only, and `knows`, so a reply on a paused line is never a gap;
`studyPlays`; `recordOf`, `linesOf`, `gapsOf`; `shownLines`: the excluded and paused lines out, filled
from the reserve, a line the study no longer plays kept in its place as `gone`);
`src/app/checklist.ts` (`checklistViews`: each study side's latest list, its shown lines, the lines
taken out, its progress and when it was last drilled; Make as a `checklist` event, Stop at the next
lookup; Maia's rating per level, `repworks-checklist-maia`; the lists kept on a device before carried
into the log once the page has synced, unless that side has one, then `repworks-checklists`
removed); `src/ui/Checklist.tsx` (`#/checklist`: the blocks, folded per tab (sessionStorage), the
one named by `?sid=` unfolded; each line its opening name (the games' when loaded, else its
chapter's), its moves (hovered or tapped: the position on a small board over what follows), its
share, the chips, ✕ asked every time; Restore all brings the lines back at once, since the list
keeps them; the uncovered replies with Open the chapter (where the study reaches the position before
the reply) and Practise; the drill by its moves, `#/checklist/<sid>?side=…&line=…&preset=…`, its
opponent's Maia rating shown); `Checklist` on Home's Repertoire panel, `Checklist…` on the line
list's bar and in each chapter's ⋯; a link on Repertoire check in place of the section; the weak
spots' Drill finds the line in the synced lists. A drill's old address opens the study's list.
Tests: `test/unit/core/progress/events.test.ts` (the event read and written, seven refusals),
`test/unit/core/games/checklist.test.ts` (a list kept and read back the same; exclusions, paused and
gone lines; the walk over active lines, a paused branch neither a line nor a gap; two controls:
the gap check without `knows`, and paused lines shown, each failing exactly its test),
`test/unit/core/app/fsm.test.ts` (the addresses, the old one), `test/e2e/checklist.spec.ts` (desktop
and phone: the page from Home, Make, the names, the preview, Maia at 1600 in the drill, the line won
at Easy, 17%, the list and the win synced and shown on a second device with no explorer call; a
list kept on the device carried into the log after the sync; ✕ asked, dismissed and accepted,
synced, Restore all; the Alapin line paused on another device hidden after a sync, then Make again
leaving it out of the lines and the replies; the old drill address). Live: TESTING.md.

#### 5.131 The best move said and celebrated, and Try again after it (the owner's request, 2026-10-26)

"When playing the best move in storm or mistake retry, we should try to make it more clear that
it's the best move. Also let's try to make it more satisfying for the user when they play the best
move. And let's make 'try again' available after retry -> best move too. Sometimes you want to
check other alternatives even though you guessed correctly."

- **Said**: a storm position answered with the top move (§5.85's: rank 1, the engine's best SAN, or
  level with it), timed or a set, is titled **"★ Best move!"** (was "Great move", the title of any
  move within the band), its status lit in the best move's colour (grade.ts's `best`, mint) with a
  gold star; the session's strip marks it with a gold dot. A game card's mistake found with the
  best move reads "★ Best move!" (was "Best move"). A practice review's retry keeps its "★ Best
  move!". Puzzles keep "Solved".
- **Celebrated**: the board bursts on the move's square (a glow, a ring going out, eight sparks;
  under a second, so a timed storm's next card isn't held), and the ★ badge stays on the square
  while the verdict is read; the words pop in. With reduced motion, only the glow, fading. The
  same burst in the storm, the game cards and the practice review's retry (`celebrate` on the
  board).
- **Try again after the best move**: a set card found on a retry (or in the second pass) keeps Try
  again (`t`, secondary beside Next) when the top move is played too, with "Try again to look at
  other moves, or go on."; Show the move goes (the best is shown). Was (§5.85): the top move ended
  the tries. The first answer of a set's first pass is as before, and the timed storm has no Try
  again. A game card's mistake, once found (with any good-enough move), offers Try again: the
  grade recorded on the first try stays, the further tries have no limit and never reveal the
  move by themselves, and a worse one keeps Try again and Next. Tactics are as before.

Tests: `storm.spec.ts` (desktop and phone: the timed storm's top move titled and burst; a set's
retry found with the top move keeping Try again, the best shown, no Show the move, then a
practice try with the first answer still counted; a move level with the best titled Best move);
`games.spec.ts` (the best move titled, burst and badged; Try again after it, another move, the
grade kept, Try again still there). Live: TESTING.md.

#### 5.132 The repertoire check in a checklist's drill, at any ply (the owner's request, 2026-10-26)

"When playing against Maia/DB, if the user deviates from their repertoire with a move, they should
be notified during the game and be able to retry. Currently when playing a checklist variation, it
only stops if the deviation is in the beginning."

- A checklist's drill checked only its lead-up (a move off the line refused, §5.62); the game from
  the line's end had no repertoire check, so where the study goes on past the list's cut (Plies)
  a move off it was played. Now the drill's game runs §5.57 item 2's check as a game practised
  from a position does: the move taken back, "e5 isn't your repertoire: the study move is cxd4",
  Ignore for this game, said with voice on, the first move tried kept for the review. An
  advantage drill stays unchecked (graded as played).
- The check's window (before ply 20, mistake-lab's) is gone: it asks at every position where the
  repertoire has a move of the user's side (`repertoireCheck` no longer takes the position).

**As built** (2026-10-26): `src/core/games/practice.ts` (`repertoireCheck` without its ply,
`REP_CHECK_PLIES` and `plyOfFen` removed), `src/app/practice.ts` (the check in every kind but the
advantage drill). Tests: `test/unit/core/games/resume.test.ts` (the window's test removed; the
check's cases kept), `test/e2e/checklist.spec.ts` (desktop and phone: a list cut at four plies,
its line drilled, 3...e5 after the explorer's 3.d4 taken back with cxd4 named, cxd4 played, then
a move past the study's end played; control: the check limited to practice games again fails it
on both). Live: TESTING.md.


#### 5.133 On a phone, the button that goes on right under the board (the owner's request, 2026-10-27)

"After reviewing/training a variation or idea card on mobile (portrait), the 'Next' button needs
to be close to the board so that the user don't have to scroll down every time."

- **A line's end** (the queue, Learn, show and grade, difficult lines, waiting for "Next line" or
  "Finish", §5.17): on a phone (up to 599 px wide) the button is beside the "Line done · Next: …"
  note under the board, where Misclick goes (§5.123). In the panel Hint keeps its place, greyed
  out, so no button there moves; "Quiz lines" stays in the panel. On a Pixel 7 the button was at
  the screen's foot (its top at 795 of 839 px, the setup notice shown); now at 651.
- **A line trained from the line list or the chapter** (its "Line done" summary in the panel):
  "Next line" goes to the same place on a phone; the summary keeps Again and the rest. It was
  below the fold (871 of 839).
- **An idea card's back**: Ask me, the grades and Next go under the board's step buttons on a
  phone, the four grades on one row of one width; Open the chapter, Analyse and Remove the card
  stay in the panel. They were at 683–1070 of 839, under the explanation, the comments and the
  side lines; now at 688, whatever the card's text.
- A desktop is as it was. One button each time, never a copy hidden by the stylesheet: the place
  is chosen by `phone` (`src/ui/phone.ts`, the same 599 px media query).

**As built** (2026-10-27): `src/ui/phone.ts`, `src/ui/Train.tsx` (the feedback row's
`train-next-near`, `Done`'s `nextNear`), `src/ui/Read.tsx` (`LineReader`'s `primary`: under the
board on a phone, first in the panel's actions on a desktop), `src/ui/Ideas.tsx`, `app.css`.
Tests: `train.spec.ts` (phone: "Next line" beside the note, in the viewport, the only one, Hint
greyed out at the same height), `lines.spec.ts` (the line's "Next line" in the viewport, under
the board on a phone), `ideas.spec.ts` (Next and the grades in the viewport; under the board on a
phone). Live: TESTING.md.

#### 5.134 Flip board on the analysis board (the owner's request, 2026-10-28)

"There doesn't seem to be a way to actually flip the board in analysis. … It's good enough to
have it in the hamburger menu."

- **Flip board** is the first item of the analysis board's ☰ menu, and `F` does the same (as on
  Lichess). The board was turned only by the side it was opened with (the chapter's, or the side
  to move of a FEN set up), with no way to turn it after.
- It turns the board's chapter's `Orientation`, so what goes by the side the board is seen from
  follows: the eval bar, the material, Practise and a sequence saved from the board. It is kept
  with the board on the device (a reload keeps it) but is not an edit: every step of the undo
  history is turned with it, so undo never turns the board back.
- Not in a study's menu: a chapter's side is what it trains, set in Chapter settings.

**As built** (2026-10-28): `flipBoard` in `src/app/editor.ts`, `src/ui/StudyMenu.tsx`, the key in
`src/ui/ChapterView.tsx`. Tests: `analysis.spec.ts` (flipped from the menu, undo and redo leave
it, kept after a reload, `F` both ways, Practise takes the side, none in a study's menu). Live:
TESTING.md.

#### 5.135 Try again always in the storm (the owner's request, 2026-10-28)

"During storm, you should always be able to retry a move, even if you play a good/great/best move."

- **Every verdict offers Try again** (`t`): a set's first answer, clean or not, top move or not;
  a card shown; and the timed storm's verdicts. Was (§5.85, §5.131): only a held card, or one
  found on a retry or in the second pass; a set's clean first answer and the timed storm had none.
- **The answer that counted stays**: once it is scored (the timed storm) or resolved (a set's
  outcome), the tries are practice (`practice` on the session): nothing scored or recorded, the
  outcome and the streak as they were, each try kept in the review's "not counted" (`later`), the
  panel's "Counted: the first answer" in view. A held card's tries are as before (three, then
  shown).
- **The timed storm**: Try again stops the next card from coming by itself and keeps the clock
  stopped through the practice tries; Next goes on, the clock running again. Analyse from a
  practice try leaves it waiting for a move (it isn't passed).
- **What the panel shows** is as before: after a clean first answer the best is shown, Try again
  secondary beside Next; a set's tries after it go on with the best hidden until Show the move or
  the top move (§5.85's rule, now also for a practice try after a first-time find). A card tried
  again after Show the move starts without the best's arrow.

**As built** (2026-10-28): `canTryAgain`, `triesGoOn`, `tryAgain` and `settle`'s practice branch
in `src/app/storm.ts`, `src/ui/Storm.tsx`. Tests: `storm.spec.ts` (desktop and phone: a set's top
move and a second-ranked move first time each keeping Try again, a practice try with the first
answer counted, the summary unchanged; the timed storm's Mistake tried again with `t`, the next
card held, no points, the clock stopped, Next going on with the clock running). Live: TESTING.md.

#### 5.136 A move told worse than good searched again in practice (the owner's report, 2026-10-28)

"What depth is "move feedback" during practice? I played the best move at 24 depth and it got
classified as a blunder."

- **What it was**: each of the user's moves is judged by the storm's Stockfish client at depth 18
  (16 on a phone), eight seconds at most, three lines, on the engine version and threads set on
  the device (§5.36, §5.75), not the analysis board's depth. A move among the three lines takes
  that line's score; one that isn't takes the score of a search of its own of the position after.
  The owner's 14...Qh4 (Black, +2.5 at depth 24 on the analysis board, its first line) was told
  "Blunder · −17.5%".
- **Why**: not a sign or a mix-up of positions (the app's own search and judge, run under Node
  on both vendored engines, say Good, −2.5% and −3.8%; the built app in Chromium on one thread
  says Good, −2.1%). It is the shallow search's noise, which the win-% curve
  (`100 / (1 + 10^(−cp/400))`, mistake-lab's, steep at +2) turns into bands: SF19 on four threads
  at depth 18, twelve fresh searches, gave Ba6 +1.88 to +2.36 and Qh4 +1.37 to +1.83 (a single
  run in the built app: Inaccuracy, −6.1%); a warm hash, a busy device, or Qh4 falling out of the
  three lines (its score then from another search) widens it further.
- **Now**: a move judged worse than good (more than 5% given up, not the best) is searched again
  before it is told, deeper (depth 22, 20 on a phone, fifteen seconds at most) and with the moves
  compared in one search: the first search's three moves and the move played (`searchmoves`),
  that many lines. That search judges it, the best line and the scores with it; when it has no
  line for the move played the first judgement stands. A move that mates or stalemates is not
  searched again. The advantage drill, which waits for each judge, waits for this one too.
- The same search, six times on SF19 and four threads in the container (depth 20 to 22 in the
  fifteen seconds): Qh4 17 to 73 cp behind Ba6 (Excellent to Inaccuracy, never worse). At these depths the engine prefers Ba6 a little; the analysis board's
  depth 24 put Qh4 first by 0.19.
- Not changed: the game cards' and the review line's judges (`gameTrainer.ts`, `reviewLine.ts`)
  keep their one search.

**As built** (2026-10-28): `RECHECK`, `needsRecheck`, `recheckMoves` and `rejudge` in
`src/core/games/grade.ts`; `judge` in `src/app/practice.ts`; `moves` (UCI `searchmoves`) on the
search request (`src/core/engine/search.ts`) and on `analyseForStorm` (`src/app/stormEngine.ts`,
kept under its own key). The fake engine answers `searchmoves`. Tests: `deck.test.ts` (the owner's
Qh4 told a blunder, then best from the deeper search), `search.test.ts`, `practice.spec.ts`
(desktop and phone: a blunder by the first search told Excellent by the second, 3.d4 confirmed a
blunder, the `go … searchmoves` sent). Live: TESTING.md.

#### 5.137 Draws in practice: repetition, fifty moves, and Offer draw (the owner's request, 2026-10-30)

"Is threefold repetition (draw) implemented in practice? (including start from checklist)" — it
wasn't: a game ended only on what chessops's `isEnd` sees in one position (mate, stalemate,
insufficient material), so repeated moves went on for ever, and the fifty-move rule wasn't kept
either. Then: "add it, including the line before the checklist leaf", and a draw offer ("accepted
if the conditions are true. Otherwise we would give away information that the position is a
draw, while the player might think he's winning/losing").

- **Repetition**: a game from a position, a checklist's drill and an advantage drill end as a
  draw when a position (its key: placement, side to move, castling, a legal en passant) stands
  for the third time, after either side's move. A checklist's drill counts its lead-up from the
  start too (`PracticeSetup.before`, kept with the game for a resume): after 1.e4 c5 2.c3 Nf6,
  3.Na3 Ng8 4.Nb1 Nf6 5.Na3 Ng8 6.Nb1 is the third time of the position after 2.c3. A game from
  any other position counts from that position (its URL carries no moves before it).
- **Fifty moves**: a draw at the position's halfmove clock 100, played automatically as Lichess
  does (not on claim). Mate on that move comes first.
- **Offer draw**, beside Hint and Take back, in a game from a position and a checklist's drill
  (not in an advantage drill, which is graded): the opponent waits for the judges still out and
  searches the position on the board, then accepts when the game is at move 20 or later (ply 40
  by the board's move number, a checklist's lead-up counted) and the user's last five moves and
  the position now are all scored within ±0.50 for the user. Otherwise "The opponent declines the
  draw.", nothing more, and no second offer at that position (a move, or a takeback, lets the
  user offer again). Accepted: "Draw agreed.", a draw.
- A draw of any of these counts as a draw: the `practice` event's `res` (a checklist's line half a
  win, as before), the history entry's outcome, an advantage drill graded Again.
- Not changed: the judges search a position alone, so a move that repeats into the draw is
  classified by the engine's score of the position, not as 0.00.

**As built** (2026-10-30): `ruleDraw`, `plyOf`, `drawAccepted` and `PRACTICE`'s `drawOfferPly`,
`drawishCp`, `drawishRuns` in `src/core/games/practice.ts`; `endOf`, `offerDraw`, `canOfferDraw`
in `src/app/practice.ts`; the button, its note and the end words in `src/ui/Practice.tsx`; the
lead-up's keys from `ChecklistDrill` (`src/ui/Checklist.tsx`). Tests: `practice.test.ts`
(repetition with and without the lead-up, fifty moves, the offer's rule), `checklist.spec.ts`
(desktop and phone: the Alapin drill drawn by repetition at 6.Nb1, which fails with the lead-up
left out), `draws.spec.ts` (desktop and phone: an offer declined after one move, the button off
at that position, accepted after five level moves). Live: TESTING.md.

#### 5.138 ChessDB's evals asked again until they settle (the owner's report, 2026-10-30)

"I noticed some problem with outdated/wrong chessdb evaluation in repworks. Going from +0.75 to
-0.46 after the best move."

- **What it was**: in the Scandi Gambit study's "Accepted - Main lines", White to move at move 15
  (`r2q1rk1/pp3ppp/8/4p3/2B3b1/2bP1N2/PPP2PK1/R2Q1R2 w`), the panel had ChessDB's one move,
  15.bxc3 +0.75; after it, ChessDB's best, 15...b5, said −0.46. ChessDB's own page, a minute
  later, gave bxc3 −0.44, with four more moves scored.
- **Why**: ChessDB learns from being asked (`queryall`'s `learn=1`, the default, Phase 4's
  checks): a position it has hardly analysed answers with what it has, a move or two, and revises
  it seconds later: the move's score backed up from the position after it, more moves scored.
  Measured 2026-10-30 from the container, asking every 5 s: 15.bxc3 Rc8 answered a lone 16.Re1
  +0.56, then +1.12 with two more moves at 21 s, a fourth at 53 s; 15.bxc3 Re8's Re1 went +3.06,
  +2.96, +3.27 at 13 and 18 s, and its parent's Re8 followed; 15.bxc3's b5 drifted 41 to 46 cp
  between asks. The panel showed the first answer and kept it: the page for the whole session (a
  position seen once was never asked again while the page stayed open), the worker's cache for an
  hour, and an answer the Practical search or the storm had fetched was shown as it was, up to an
  hour old. No sign or position mix-up: the panel asks ChessDB for the FEN shown, scores from the
  side to move.
- **Now**: an answer is *settled* when an ask at least 15 s (`TTL.settle`) after the one before
  agrees with it: the same scored moves, each within 10 cp (`sameEvals`). The panel shows what it
  has at once; then, unless that has settled:
  - it asks the position after ChessDB's best move (`deeper`: from the cache if ChessDB answered it
    within 15 s, or settled within the hour), and where that position's best reply is more than
    10 cp from the move's score, asks this position again at once and shows that. For the owner's
    position: bxc3 +0.75, then 15...b5 asked (+0.44 for Black), then bxc3 −0.44. Each best move
    once a visit, three at most (`DEEPER_MAX`); the position after is then in the cache when the
    move is played;
  - while the panel stays, it asks again 15 s after the answer before, then 30 s, then 60 s
    (`PANEL_RECHECKS`), each new answer shown as it comes, until one settles; then not until the
    panel comes back.
- A settled answer holds for the hour, as before (asked again after it, and settled at once if
  ChessDB still says the same). The page asks again on coming back to a position whose answer
  hasn't settled or is over the hour old. A failed ask leaves the answer up. Cost: for a position
  the panel shows, the position after its best move and one more ask here when the panel stays
  15 s; up to three more while ChessDB keeps revising it; only `queryall` (D9).
- Live in the container (2026-10-30), the worker's service under Node with real fetch and timers:
  16...Bh3+ (15.bxc3 Qc8 16.Qe2, which ChessDB had scored at −2.74 alone) answered −2.25 with four
  more moves; the position after Bh3+ was asked at once and agreed; 15 s on, ChessDB had revised
  Bh3+ to −2.67 and the panel showed it; 30 s later the same, settled.
- Not changed: the Practical search, the storm and the gather read ChessDB as before (a week's
  cache); a position they asked is asked again when the panel comes to it, and their next lookups
  read the panel's newer answers from the cache.

**As built** (2026-10-30): `TTL.settle`, `SAME_CP`, `sameEvals` and `settled` on the answer
(`src/core/explorer/providers.ts`, `search.ts`); `PANEL_RECHECKS`, `DEEPER_MAX`, `bestMove`, and
the panel's `show`, `deeper` and `recheck` in `lookup` (`src/core/explorer/service.ts`);
`complete` in `src/app/explorer.ts`. Tests: `service.test.ts` (the owner's 15.bxc3: +0.75, the
position after it asked, −0.44 at once, settled 15 s on, and neither asked again within the hour;
ChessDB revising on its own: +0.56, +1.12, settled; an answer the search fetched asked again when
the panel comes; a position ChessDB keeps revising asked three times a visit; a dropped lookup
stops asking; an ask too soon after the one before never settles it; `sameEvals`). Live:
TESTING.md.

#### 5.139 Shallow ChessDB evals marked (the owner's request, 2026-10-30)

"Could we add some kind of warning/identification of shallow chessdb evaluations? In these cases,
high depth stockfish should be trusted more than chessdb, but it's not currently clear when a
chessdb evaluation is shallow."

- **What ChessDB says about depth** (its source, github.com/noobpwnftw/chessdb, `getMoves` in
  `web/chessdb.php`, and live from the container, 2026-10-30): `queryall` gives no depth (§5.84),
  but each move's note `! (05-01)` holds two counts for the position after the move: the replies
  ChessDB has scored there, and how many of those are good. 0 replies means the move's score is
  one engine estimate, never backed up from the replies. The count of replies doesn't tell
  shallow from deep, though: ChessDB's first pass at a position scores about five moves, so the
  positions 15 to 20 moves deep along the Berlin endgame's main line also had 5 to 7 known, with
  lines of 19 to 40 plies under them. `querypv`'s `depth` does tell them apart: its best line's
  length in plies, which the best move's score is backed up from. It was 5 at the owner's
  15.bxc3 position (§5.138), whose score went +0.75, −0.44 and −0.15 within the hour; 19 to 75
  along the Berlin line, 39 after 1.e4 and 58 at the start.
- **Now**: the panel asks `querypv` for its position with each answer it shows (D9 allows it:
  "only `queryall` and `querypv`"), unless asked within `TTL.settle`, or within `TTL.panel` for a
  settled answer; cached with the answers (`chessdbLine`, key `pv|<fen>`). Only the panel: the
  Practical search, the storm and the gather ask as before. A move's eval is **shallow** when its
  score isn't a mate and either ChessDB's best line here is under `SHALLOW_PLIES` (10) plies, or
  it has looked at none of the replies to the move. A shallow eval is light, italic and dotted
  underlined in the Eval column; its title says why and to trust a deep Stockfish search over it.
  Every eval's title says what it rests on: the best line's depth for its first move, the replies
  known for another. The explorer's settings say what the italics mean (no hover on a phone).
- Cost: one `querypv` per position the panel shows, and one more with each of §5.138's asks
  again that comes more than 15 s after the one before; a failed ask leaves the evals unmarked by
  depth.
- 10 plies is a first guess between the two kinds measured; the owner's use will say whether it
  marks too much or too little (TESTING.md).

**As built** (2026-10-30): `ChessdbMove.replies` and `ChessdbLine` (`src/core/explorer/search.ts`);
`compactChessdb` reading the note, `compactChessdbLine`, `chessdbLine` and `cdbAsk` (the lane,
joining and retries the two asks share) in `providers.ts`; the panel's `line` in `lookup` and the
`line` message (`service.ts`, `src/app/explorer.ts`); `SHALLOW_PLIES`, `Eval`'s `replies`, `line`,
`best` and `shallow`, and `evalNote` (`table.ts`); `EvalCell` in `Explorer.tsx`, the note in
`ExplorerSettings.tsx`. Tests: `table.test.ts` (the note read, a tablebase note aside; the owner's
position with a 5-ply line, every eval shallow, and with a 24-ply line, only the move with no
replies looked at; no line yet; a mate never shallow; `querypv` read), `service.test.ts` (the line
asked once with the answers a visit shows, posted with each, from the cache, again after the
hour, never for the search's lookups; refused, nothing said), `explorer.spec.ts` on desktop and
the emulated phone (the move with no replies looked at shallow, its title; a 4-ply line making
every eval shallow; the settings' note). Live: ChessDB's notes and `querypv` read from the
container, and the table built from live answers under Node; not in a browser.

#### 5.140 Several chapters at once (the owner's request, 2026-10-31)

"When importing a pgn, it can result in many chapters instead of a merged chapter, which is a pain
to delete currently. Implement a way to delete/edit multiple chapters in a study at once."

- **Where**: "Manage chapters…" in the chapter view's ☰ menu, "Chapters…" in Study settings (so
  from a study's card too), and "Several chapters…" in Chapter settings, where a single chapter is
  deleted. A dialog lists the study's chapters in order, each with a box and its side; a box at the
  top ticks or clears them all ("3 of 40 chapters chosen"); a shift-click ticks or clears the run
  from the box clicked before (the hint for it shown only with a mouse).
- **What, for the chosen chapters**, each one change to the working copies, after the open
  chapter's edits, as the study's settings are:
  - **For White / For Black**: their `[Orientation]`; a chapter already for that side isn't
    written, and one that can't be read is left as it is and named.
  - **Merge into one** (two or more): into the first chosen in the study's order, which keeps its
    ID, name and headers; every line of the others is added to it (the union of the trees, by
    path, with the parser's rules for a move written twice: comments, shapes and glyphs joined,
    none twice, the first's move and position glyph kept; its children first, so its main line
    stays the main line). The others' files go and study.json drops them. Refused, nothing
    written, when one can't be read, starts from another position, or is for the other side ("give
    them the same side first", which the same dialog does). Asked first. In the study, the merged
    chapter opens.
  - **Delete n chapters**: their files and study.json without them; asked first ("Delete all 12
    chapters? The study stays, with none." when every one is ticked). The open chapter, if it
    goes, gives way to the study's first one left.
- The dialog stays open after each, its list read again (and on a sync), so chapters can be
  turned, then merged, then the rest deleted.
- Progress: repertoire cards are per position and move, so a merged line keeps its cards. A
  paused-line mark (§5.70, `l|sid|cid|…`) names its chapter, so one on a chapter merged away no
  longer applies; the line is trained again until paused in the merged chapter.

**As built** (2026-10-31): `combineChapters` (`src/core/study/combine.ts`); `deleteChapters`,
`setChaptersSide`, `mergeChapters` (`src/core/study/manage.ts`); `chapterRows`, `removeChapters`,
`turnChapters`, `joinChapters` (`src/app/chapters.ts`); `ManageChapters` and its entry points in
`src/ui/StudyDialogs.tsx`, the ☰ item in `StudyMenu.tsx`. Tests: `combine.test.ts` (the union,
main line first; comments, shapes and glyphs joined once and read back the same; refused for one
chapter, another start, another side; the files deleting, turning and merging write; an unreadable
chapter left and named, or refusing the merge), `studies.spec.ts` on desktop and the emulated phone
(three games from PGN shift-ticked, turned for White, merged with the lines and comment in the
merged file, a delete refused then done from Study settings, each checked in the fake repo). Live:
TESTING.md.

#### 5.141 Model games: the plans and goals from a position (the owner's request, 2026-10-31)

The owner: develop a skill (or several) that helps analyse model games and summarize the plan and
goals from a position. The model games share one starting point; they are Lc0 against Maia,
"to showcase how a stronger player would punish a weaker player in a specific position", made
with the owner's generator, `model_games_app.py` (not in this repo). The example input:
`modelgames_Scandi_gambit_accepted_-_Early_d3.pgn`, 50 games.

- **The generator's PGN** (read from its source):
  - `[White "Lc0"]` or `[Black "Lc0"]`, the other side `Maia3-<elo>`, with `WhiteElo`/`BlackElo`,
    `MaiaOppoElo`, `MaiaTemperature`, `MaiaTopP`; `Termination` when not a normal end.
  - `{ end of prep }` on the prep's last move.
  - Lc0's eval after every fifth of its moves, from White's side (`{ -0.57 }`, `+M`/`-M`).
  - `{ eval a -> b }` on the weaker side's move, when Lc0's eval moved 1.00 or more between its
    moves before and after.
  - Adjudication at ±6.00 for four of Lc0's moves.
  - The weaker side's first two moves at temperature 1 and top-p 1, to spread the games: the
    branch shares there are the generator's, not people's.
- **Decided** (Claude's call: the format of a report, not of the owner's data):
  - One skill, `.claude/skills/model-games/SKILL.md`, on the opening-ideas tools.
  - Its output is a plan summary in Markdown, delivered as a file. For training, the skill offers
    an idea deck made with the opening-ideas skill, in the format the owner approved: cards at
    the shared position's decisions, the turning points and the rare moves, checked against the
    games (`check --games`).
  - The rules of the idea decks carry over:
    - every claim rests on a tool output;
    - Maia at 2000 or more;
    - development first;
    - the owner's three values (patterns, where a pattern breaks, unintuitive moves);
    - the strong side's moves taught, not reviewed.
- **The tools** (`scripts/ideas/games.ts`, pure; `cv.ts games`):
  - The shared position: the `end of prep` marks when all agree, else where the games part.
  - Lc0's side, from the player names.
  - The evals and the jumps, from the strong side (Lc0's eval scale, quoted as Lc0's).
  - The report:
    - results, and the games' tree from the shared position;
    - the strong side's moves by what they do within its first `--window` moves: games, move
      number, contact, and how many come before the game **tips** (the first eval of +1.50 or
      more; a jump's move when a jump takes it there). Moves before the tip are the plan, after
      it the punishment;
    - each piece's first squares and routes (castling's rook too), and kept or traded;
    - the weaker side's moves;
    - checkpoints at fixed plies, each read where an exchange in progress has settled (of the
      ply and the two after, the first at their median material);
    - Lc0's eval curve, and the first move at +1.50 and +3.00;
    - material won against the shared position (kept two plies), with the capture behind it;
    - the mistakes and the turning point of each game (grouped where games share the position),
      with the FEN and the punishing line;
    - the games that cover the common plan best, and the quickest wins;
    - with `--maia`, Maia's chance (playing the strong side) of each of Lc0's moves, rarest
      first, and of each punishing reply.
  - `--after` and `--with` filter the games by their moves after the shared position, or by a
    strong-side move; `--game` prints one game.
  - **The games as a repertoire** (`asRepertoirePgn`, and `--games` on `tree`, `profile`,
    `develop`, `decisions` and `check`): one tree of every game, every move with its share of
    the games. `readRepertoire`'s new `ourShares` reads our moves' shares too, so where Lc0
    varies each move takes its own part of the games. Without it (every repertoire) our moves
    keep all of their games, as before: shares on our moves are ignored.
- **The skill's procedure**:
  1. Read the games: the report with `--maia`, `develop --games`, `tree --games`, and the report
     again per main reply (15% or more).
  2. Read the shared position: `look`, `engine`, `threat`, and `maia` for what people play there
     (the games' first moves are random on purpose).
  3. Six lenses: where the pieces go, the pawn moves and the structure, the goals, how the weaker
     side goes wrong, the moves a human wouldn't find, their main tries.
  4. Verify as a skeptic. Lc0's eval is never the evidence that a move works; `grade` is. A "mistake"
     Stockfish rates `good` means the position was already going wrong: find where, and teach the
     punishing move as the plan's threat.
  5. Write the summary: about 1500 words before its evidence section, in a fixed set of sections
     (the plan, the pieces' table, breaks, goals, their main tries, mistakes and punishments, rare
     moves, at most 8 rules of thumb, games to study, evidence).
  6. Review as a critic, then deliver the file.
- **The pilot** (2026-10-31, the owner's example: 50 games, Lc0 as Black, all won). The report
  takes 1 s, or 2¼ minutes with Maia (window 12). Stockfish (lite, depth 20) checked about 25 positions
  in about 15 minutes.
  - **What the summary found:**
    - ...Rad8 at once (47 of 50 games; Stockfish's best after 10. Re1; Maia 26%);
    - ...h6, then against Bh4 ...g5 and ...Nh5xg3 (10 of the 20 games with h6 and Bh4), leaving
      White with doubled g-pawns;
    - ...f5 once the f6-knight has moved (35 of 35), then ...f4, ...e4 or ...g4;
    - ...Qb6 against Re1 and Bf1;
    - after Bxf6 Bxf6, ...Be7 back (9 of 10; Stockfish's best, and ...Rad8 a mistake there);
    - the gambit pawn back in 46 of 50 games by move 21;
    - five kinds of punishment, each checked at depth 20.
  - **Checking found that Lc0's jumps and Stockfish disagree.** The three games' "15. h3?" grades
    `good`: after 14...f5, ...f4 against the g3-bishop was already the threat (Stockfish's best
    reply is Qd2; Nd2 is a blunder). Likewise 16. Bf1 in three more games. The skill now says so.
  - The summary is the owner's to read (TESTING.md). It isn't in this public repo, as the idea
    decks aren't.

**As built** (2026-10-31): `scripts/ideas/games.ts` (`readModelGames`, `filterGames`, `ourMoves`,
`summary`, `branches`, `plan`, `tipOf`, `checkpoints`, `gains`, `mistakes`, `firstAt`, `evalCurve`,
`representative`, `surprise`, `replyFound`, `asRepertoirePgn`, `gamesText`, `gameText`); `cv.ts
games` and `--games`; `tree.ts`: `readRepertoire`'s `ourShares`, `weightOf` reading our moves'
shares, `names` exported, the profile and the development map weighing our moves by their shares.
`.claude/skills/model-games/SKILL.md`; the opening-ideas skill names model games as an input.
Tests (`test/unit/scripts/games.test.ts`, hand-made games in the generator's format):
- the shared position (marked, and where the games part when unmarked);
- the evals and jumps, the weaker side's rating, the tree;
- the strong side's moves by piece, with castling's rook, contact, and the tip;
- the material won and the capture behind it;
- the mistakes and turning points, and a checkpoint read once an exchange has settled;
- Lc0 as Black, read from its side, and the filters;
- the games as a repertoire, with our shares and without;
- the typical games, and the rare moves with a fake Maia.

#### 5.142 A line of the study added to its checklist by hand (the owner's request, 2026-10-31)

"Implement the option to add a specific variation from a study to its checklist (that stays even
after remake)."

- **Where**: in a repertoire chapter played from the starting position, the study's ☰ menu has
  "Add to the checklist" with the move shown (the line from move 1 to it, so any depth, ending on
  either side's move), and a line's ⋯ in the training screen's line list has it for the whole line.
  Once added, both say so ("In the checklist (take out)", "Out of the checklist") and take it off.
- **Kept as a `pick` event on the study's `t|<sid>`**:
  `{"k":"pick","card":"t|<sid>","color":"black","m":"e2e4 c7c5 g1f3 b8c6 d2d4","on":true}`, the
  latest per side and moves deciding, so it syncs and Make (a new `checklist` event) never touches
  it. Older readers skip the kind (the log's rule).
- **Shown** after the made list's lines, in the order added, marked "added", with no share (the
  explorer wasn't asked); before any Make too ("2 lines added by you"). A picked line the made list
  has as well is shown once, in the list's place, marked added. They count in the progress bar and
  are drilled as any line (the drill's address is its moves).
- **Make leaves the picked leaves out of the walk** (as an exclusion does), so "Lines 10" is ten
  lines besides the added ones and the slots go to the next lines.
- **The study must play the line**: its own moves at its side's positions (any of them, so a second
  move the walk never takes can be added), a position it covers after each reply but the last,
  which it need only reach (a line may end on the opponent's move). A line the study no longer
  plays is struck through with "No longer in the study · Take it out"; one wholly paused since is
  hidden and counted with the paused lines, as §5.130's are.
- **✕ on an added line** asks "Take this line out of the checklist?" and writes `on: false`; where
  the made list has it too it is also taken out of that (a `drop`, the reserve filling its slot).
  An exclusion never hides a picked line: picking a line is asking for it.

**As built** (2026-10-31): `src/core/progress/events.ts` (the `pick` event, five refusals);
`src/core/games/checklist.ts` (`StudyMoves.reaches`, `studyHasLine`, `picksOf`, `withPicks`,
`ShownLine.added` as `too` or `only`, `shownLines`' `pausedLeaves` so a picked list line paused
is counted once); `src/app/checklist.ts` (`ChecklistView.lines`, `paused` and `picked`, the made
list's meta in `list`; `chapterLine`, `isPicked`, `pickLine`, `unpickLine`; Make excluding the
picked leaves); `src/ui/Checklist.tsx` (the lines with or without a made list, the "added" tag,
✕ and "Take it out"); the ☰ item in `src/ui/StudyMenu.tsx`; the ⋯ item and its message in
`src/ui/LineList.tsx`. Tests: `events.test.ts` (the event read and written, five refusals),
`checklist.test.ts` (which lines the study has: a second own move, a line ending on a reply it
only reaches, a reply met only on a paused line; the picks from their events; joining a kept list:
marked there, appended, gone, paused and counted once, not hidden by an exclusion; four controls,
each failing exactly that test), `checklist.spec.ts` on desktop and the emulated phone (2...Nc6 3.d4
added from the ☰ menu and the Alapin from the line list; shown before any Make; Make and Make again
keep both, the Alapin out of the made list's lines; the events in the fake repo; an added line's
drill by its moves; ✕ asked and taken out, synced), `views.spec.ts` (the ☰ menu's items). Live:
TESTING.md.

#### 5.143 Lc0 on the study page: its pick among close moves (the owner's request, 2026-10-31)

The owner: "I'm mainly interested in the study / analysis page (not practice). When I'm unsure
which move to pick between multiple close-to-equal choices, having the Lc0's pick available would
be nice. Maybe it could also be used to balance out Stockfish evaluation in some move grading, but
I'm not sure."

- **Measured and found** (2026-10-31, cloud container):
  - Lc0's source builds can't run in a cloud container (the auto-mode check refuses running
    downloaded code), and lczero.org is outside its network policy. Lc0's GitHub release packages
    are reachable, and every one (v0.31.2, v0.32.1; CPU, CUDA, ONNX builds) bundles one network,
    `791556`: 15 blocks of 192 filters with squeeze-and-excitation, Mish, the classical 112 input
    planes, an attention policy and a W/D/L value head. Its weights are about 10 M, close to Maia
    3's size.
  - Lichess's `zerofish` (npm, AGPL) is Lc0 compiled to wasm on the CPU with tiny networks only
    (its README: "only low block/filter sizes"): too weak for a pick among a strong player's
    candidates, so not used.
  - So the network is converted with a port of Lc0's `leela2onnx` (`scripts/lc0-onnx.mjs`, Node,
    no new tools) and run on onnxruntime-web, as Maia is. ONNX's checker accepts it. Under Node,
    one thread: about 80 ms a position (the session 0.75 s), a batch of 8 no cheaper per position.
  - With no Lc0 to compare against, the port is checked by what only a correct one gets right:
    the 1858 moves equal Lc0's table (sha256 over it); mates in one, a free queen and promotions
    found; mirrored colours give mirrored moves; the openings' moves are book (e4/d4/Nf3; h3/d4 in
    the closed Ruy Lopez; f3/Be3 against the Najdorf). Against Stockfish 18 at depth 12 on 78
    positions of the fixture games, Lc0's first move was Stockfish's best in 44, within 0.30 in 65,
    15 cp lost on average (Maia at 2200: 35, 21 cp).
- **Decided** (Claude's calls):
  - **No search: Lc0's network alone** (its policy and W/D/L, one run per position). Its policy is
    what Lc0 plays at once, and that is its pick. A search (MCTS) is the step after, if the owner
    finds the pick worth more: on wasm a position costs about 80 ms on a desktop, so a few hundred
    nodes take a minute.
  - **An "Lc0" switch** beside Maia's in the engine bar, off by default; the first switch-on asks,
    as Maia's dialog does, for the one-time download: the network (21.7 MB) and onnxruntime-web's
    wasm unless Maia brought it (35.9 MB in all). The worker ends after 90 s unused, as Maia's.
    Never in training or practice.
  - **Beside each of Stockfish's lines**, Lc0's policy share of its first move; **its pick**: where
    two or more lines are within **0.30** (`CLOSE_CP`, the mover's side) of the best, the close
    line whose first move Lc0 likes most, its share marked. Fewer than two close lines, no mark
    (nothing to choose). Not for the threat's lines.
  - **Its own row** under the lines (shown with Stockfish off too): its eval (Lc0's
    `90·tan(1.5637541897·Q)`) from White's side, as Stockfish's lines; win / draw / loss **for the
    side at the bottom of the board**; its three likeliest moves. (Built first with both from
    White's side; the owner, 2026-10-31: the percentages "in the perspective of the board", the
    eval staying White's.)
  - **Its history**: the line from the chapter's start to the board (its last 30 positions), as
    Lc0 reads 8 positions back and repetitions; a FEN-started chapter's start is repeated as Lc0's
    `HistoryFill=fen_only` does. Shares at Lc0's policy temperature, 1.359 (its "P").
  - **Grading** (the owner's "maybe"): not built. Lc0's W/D/L after each candidate is one run a
    move and could stand beside Stockfish's win % in a grade; wait for the owner's view once the
    pick has been used.

**As built** (2026-10-31): `vendor/lc0/791556.onnx` and its README (source, sha256, how to
reproduce); `scripts/lc0-onnx.mjs` (the converter) and `scripts/lc0-reference.mjs` (the
fixture); `src/core/lc0/encode.ts` (`LC0_MOVES`, `lc0Index`, `lc0Planes`, `lc0Policy`, `wdlFrom`,
`lc0Centipawns`), `pick.ts` (`lc0Pick`, `shareOf`, `CLOSE_CP`), `protocol.ts`;
`src/platform/lc0Worker.ts`; `src/app/lc0.ts` (the switch, the worker, `lc0Position`, one ask at a
time for the position the board stops at); `src/ui/Engine.tsx` (the switch, the shares, the pick,
the row), `Lc0Dialog.tsx`, the debug panel's "Lc0 791556" files; the engines' list in
`vite.config.ts`. Tests: `test/unit/core/lc0/encode.test.ts` (the moves against Lc0's table, an
index from either side with castling and promotions, the planes: pieces, history from Black's
view, a FEN's filled history and its en passant pawn put back, repetitions, the 50-move count; the
policy at temperature; the eval), `pick.test.ts` (close lines, Black's side, mates, nothing to
choose), `test/unit/engine/lc0.test.ts` (the network on onnxruntime-web under Node: its inputs and
outputs, 16 lines against the fixture to 1e-5, mates in one, mirrored colours, the history read);
`test/e2e/lc0.spec.ts` (desktop and phone, the real network beside a scripted Stockfish: Cancel
downloads nothing, the download, the row as the fixture turned to the board's side (Black's), the shares and the pick, the next
position, remembered without a second download, off). Live: TESTING.md.
