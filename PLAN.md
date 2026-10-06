# Repworks: plan

Status: plan of 2026-10-05, written in a planning session and updated the same day with the
owner's answers to its questions and with the organization they created (§8). The owner approved
it the same day. Phase 0 is built: §4.1 to §4.11 are on `main` (each part's "As built" notes say
where the build differed). What remains is live: the spike's re-run (§4.2), the real Qchess and
Lichess imports (§4.10), and the acceptance test (§4.11), on the owner's devices. Phase 1 starts
alongside them (the owner's decision of 2026-10-06), and is planned in depth in §5 (2026-10-06),
with the owner's answers (§5.13); it is built through §5.16, its acceptance test (§5.14) waiting
for the owner. Phase 2 is planned in depth in §5 too (§5.20–§5.28, 2026-10-06). Read with `DECISIONS.md`, which this plan updates (its
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

Phase 1 is planned in depth below, the way §4 plans Phase 0, and Phase 2 after it (§5.20–§5.28).
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
- Tabs: Lichess (named Local when a local explorer is set), Masters, ChessDB; ⚙ opens the
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

#### 5.27 The course tree (lichessable §24): the owner's choice first

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

Scope:
- **Stockfish 18** lite single-threaded first (mistake-lab's 7.3 MB build, no isolation
  needed). Threads later if wanted: the service worker can add COOP/COEP itself, and Lichess
  login already uses redirects.
- **Maia 3**: the GPL-3 model vendored with attribution, and onnxruntime-web vendored, not from
  a CDN. The encoding is ported from mistake-lab and checked against q_extension's
  `tools/repgen/maia.mjs`.
- **The analysis board**: MultiPV arrows, eval bar, Maia and database overlays. "Add as
  variation" into a study, which is trivial now that the site owns the studies.

Risks:
- memory and battery on the phone (Maia 46 MB plus ORT plus Stockfish);
- the model download over mobile data, which must be cached and persisted;
- COEP side effects if threads are turned on.

Checks:
- Maia's top-5 probabilities match q_extension's Node runner on 50 fixed positions, to 1e-4;
- speed measured on the phone;
- Stockfish's bestmove on fixed test positions.

### Phase 4: Intuition storm and puzzles

Scope:
- **The storm** on the repertoire's frontiers (lichessable §27): line ends, games from the
  explorer and `/game/export`, ChessDB walks, filters, three grading tiers, the position store,
  stats as progress events, sets.
- **Puzzles** from games that played the user's lines (§29): the anchor band, the two gather
  stages, the body archive, the disguise.

Risks:
- Porting a large body of measured rules (the 410 KB design). Mitigation: port the pure
  functions with lichessable's `dev/check-storm.js` assertions alongside.
- Whether `lichess.org/game/export` answers a web page (the extension used a host permission).
  If not, use the masters PGN fallback the design already has.
- The dataset site is 5 GB, five times GitHub Pages' documented 1 GB, so it is served at
  GitHub's discretion (puzzle-explorer's README documents an R2 fallback). Keep the base URL
  configurable.
- The archive's size on the phone.
- Never ChessDB `queue`/`store`.

Checks: the ported assertions; request budgets measured; live sessions on the phone.

### Phase 5: Mistake review, and migration from mistake-lab

Scope:
- Games from Lichess and chess.com.
- The analyzer's output. It is a desktop Node tool that lives in `mistake-lab/analyzer`, not in
  q_extension (D8 corrected). It writes to the Gist today; switch it to the data repo (one
  writer, devices only read) or read the Gist during the move.
- Mistake, tactic and advantage cards; continuation practice (opponent from the database, then
  Maia, then Stockfish); deviations from the repertoire in real games; the recidivism tracker;
  weak spots; the variation checklist; plan cards; game review history; voice input.

Migration (one-off, re-runnable as a dry run):
- Read the Gist with a token entered once.
- `positions[pid].srs` becomes one `snapshot` event per card (a kind added in this phase),
  re-keyed through `positionKey`:
  - `p_<key>` becomes `p|key`;
  - game items become `m|…`;
  - `r_<key>` repertoire states are left behind and counted in the report. By then the site's
    own repertoire cards have been in use since Phase 1, started fresh (D19), and a migrated
    state would overwrite them.
- Notes become a "Notes" reference study: one chapter per position, from its FEN, with the note
  as the root comment and its arrows as shapes.
- Plan-card enrolments, custom deviations and dismissals become events.
- A report lists unmapped and re-keyed entries.

Risks:
- mistake-lab's breadth (about 30,000 lines of features);
- the size of the game data on the phone.

Checks:
- for the same games, the same mistakes extracted as mistake-lab (per-game counts);
- the migration dry-run report;
- queue sizes before and after migration.

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
