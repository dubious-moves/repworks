# Repworks: plan

Status: plan of 2026-10-05, written in a planning session and updated the same day with the
owner's answers to its questions and with the organization they created (§8). The owner approved
it the same day. Phase 0 is built: §4.1 to §4.11 are on `main` (each part's "As built" notes say
where the build differed). What remains is live: the spike's re-run (§4.2), the real Qchess and
Lichess imports (§4.10), and the acceptance test (§4.11), on the owner's devices. Phase 1 starts
alongside them (the owner's decision of 2026-10-06), and is planned in depth in §5 (2026-10-06),
with the owner's answers (§5.13); it is built through §5.17 (the owner's second notes), its acceptance test (§5.14) waiting
for the owner. Phase 2 is planned in depth in §5 too (§5.20–§5.28, 2026-10-06), and built through §5.26; §5.18 (alternative moves) is built, §5.27 (the course tree) waits for the owner's answer, §5.28 for the owner's devices. The owner's third notes are built (§5.38). Phase 3 is planned in depth (§5.29–§5.37, 2026-10-06) and built through §5.36 (threads opt-in); its acceptance test (§5.37) waits for the owner's devices. Phase 4 (the storm and puzzles) is planned in depth (§5.39–§5.49, 2026-10-06) and built through §5.48 (2026-10-07); its acceptance test (§5.49) waits for the owner's devices. Phase 5 (mistake review and the migration from mistake-lab) is planned in depth (§5.50–§5.66, 2026-10-07) and built through §5.55, with the migration (§5.64) built ahead; where the analyzer's output lives waits for the owner's answer (§5.66). Read with `DECISIONS.md`, which this plan updates (its
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
- **Shapes change only by drawing.** chessground clears a move's arrows on a left click (Lichess
  does the same); here that would delete them from the study whenever a piece is moved, so the
  board ignores clears that don't come from a drawing gesture. Right-drag and the phone's draw
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
  cut, is shown without editing. A promotion asks for the piece.
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
- The rest is per device, in localStorage: the auto-play pace (fast 450 ms, normal 600 ms,
  relaxed 900 ms per move; lichessable's floor of ~450 ms), speech on or off, and the
  show-and-grade keys.

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
- a card taught and still in its learning step is played for the user, with its arrow shown
  first, so a line can pass through it before its first review.

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
pace delays never under 450 ms; every effect sequence is deterministic for a given input.

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
- The pace is clamped to 450 ms; the pause at a line's end is two paces.
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
  Stop; the pace (fast, normal, relaxed; per device, changeable mid-session). Space is Hint,
  Escape stops. The screen's wake lock is held while a session runs and taken again when the
  page comes back into view. The end shows the session's numbers, "Train again" and "Home".
- `src/ui/TrainCard.tsx`: the home screen's "Train: 1 due · 3 new", the moves whose learning
  step ends later today ("2 more today from 14:00"), the known pool, and orphaned cards. The
  study list has a Train link per repertoire study.
- `src/ui/CardPanel.tsx`: in the chapter view, for an own move of a repertoire chapter: new,
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
  comments, and the training screen's comments (which stay hidden while a move is asked). In
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
   current move, editable. From the chapter view, training resumes or starts from the move shown.
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
  moves); `ask`: at the chapter's start, every own move of the prefix asked as practice unless
  the mode plays it as answered this session. After the prefix, the mode decides. Unset (retry,
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
  after its end, "Next: Line 2 · Stop" meanwhile; Stop or Escape stays. The queue goes on after
  two paces, as before.
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
  each removed by its ✕. Adding one from the study isn't built: the training screen's button is
  the one way in, where the wrong move is in hand.
- Not built: an import of Chessable's own alternatives from a course export (to check against an
  export in the data repo first).

#### 5.38 The owner's third testing notes (built 2026-10-06)

Taken in a session beside Phase 3's build, so as not to interrupt it.
- **Explorer: the bars line up** (Qchess's). The games' count was an `auto` column, sized by each
  row's own grid, so a longer count pushed its bar right. It now has one width for the header and
  every row, from the longest count shown (a digit about 0.48 rem, a comma half that).
- **Explorer: Eval further right** on the desktop (Move 62 px, Eval 60 px, from 58 and 50); the
  phone keeps the old widths, where the row has no room to give.
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
  coming back asks again).
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
  a move of the repertoire here (from the index, §5.1: any repertoire chapter, transpositions
  included) carries a mark with its count of chapters, whose list opens as the transposition
  list does (§5.11) and leads to each chapter at that move. "Only show repertoire moves" is in
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
  keeps its nine buttons on one row at every width.
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
  notation): the engine's switch, "SF18", "Depth 18 · 650 kn/s" (the speed while it computes),
  "+" to go deeper once a search is done, the threat button (Qchess's W: the position with the
  other side to move, its best move as a red arrow), ⚙ (`EngineSettings.tsx`: depth 20/30/40,
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
- `src/ui/Engine.tsx`: the bar (a switch, "SF18", "Depth 18 · 650 kn/s" or the download's
  progress, Retry after a failure, "+" once a search is done, the threat ⌖, ⚙) at the panel's
  top on a wide screen and after the move buttons on the phone; one row per line (the eval in
  Qchess's format, then up to 16 moves numbered from the position, cut with an ellipsis); the
  eval bar (`EvalBar`: a 9 px column in the gap right of the board on a wide screen, a 6 px
  strip under it on the phone, White's share growing from White's side); the arrows
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
  `gather` (line ends and replies in turn, each pass's positions stored, the requests counted:
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
  the child (ChessDB for a ChessDB list), then Stockfish on both positions (depth 18, 8 s) when
  neither answers, the board held shut meanwhile; `unknown` scores nothing and holds the streak.
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
Not built yet: the engine's line after a wrong move (Show the move gives the best line in SAN).

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
the events synced; an advantage card's collapse graded Again). Not built: the corrected-deviation
banner during practice ("Ignore for this game?") and resuming a game after a reload.

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

#### 5.63 Voice input

- `voice.ts`, a port of the lexicon and matcher (homophones, phrasings per legal move, the edit
  distance); `platform/voice.ts` over the Web Speech API (five alternatives); in practice games, a
  move heard is confirmed or played, the opponent's move spoken (§5.9's speech).

Tests: unit (the lexicon's cases, ambiguity refused); Playwright: a faked recognizer playing a move.

Live: (phone) voice in a practice game, with and without Bluetooth.

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
