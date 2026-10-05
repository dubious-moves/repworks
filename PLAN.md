# Repworks: plan

Status: plan of 2026-10-05, written in a planning session and updated the same day with the
owner's answers to its questions and with the organization they created (§8). The owner approved
it the same day; Phase 0 is next and nothing is built yet. Read with `DECISIONS.md`, which this
plan updates (its revision log lists every change and why).

Contents:
1. Summary
2. What was checked, and how
3. Architecture in one page
4. Phase 0 in depth
5. Later phases (outline)
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
| One-call commit | GraphQL `createCommitOnBranch`: additions and deletions on a branch, refused unless `expectedHeadOid` is the current head. Fine-grained tokens work with GraphQL. | github/docs `src/graphql/data/fpt/schema-commits.json`, `forming-calls-with-graphql.md`. **Not exercised live** (§4.2). |
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
  head: Phase 0 spike, §4.2.
- Lichess's API answering a web page (study export, `/api/token`): checked live from the
  build session's container on 2026-10-05, once lichess.org was reachable. `GET
  /api/study/by/<user>` answers `Access-Control-Allow-Origin: *`, and the preflights of a
  `POST /api/token` and of a study export with `Authorization` both answer 204 with any origin
  and `Authorization` allowed. The spike still runs the OAuth round trip and a private export.
- GitHub Pages sending `Access-Control-Allow-Origin: *`, which puzzle-explorer-data's fetches
  need now that the site has its own origin (D17). github.io is still unreachable from here, so
  the spike checks it (§4.2).
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
    puzzle-explorer's numbers exactly on 509 recorded review steps at retention 0.9 and 0.93.

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
interface Remote {
  head(etag?): Promise<{ commit: string; tree: string; etag: string } | 'not-modified'>;
  tree(sha): Promise<Map<string, string>>;      // path → blob sha (recursive)
  blob(sha): Promise<string>;                   // raw
  commit(expectedHead, message, add: Map<string, string>, remove: string[]):
    Promise<{ ok: true; commit: string } | { ok: false; reason: 'stale' | 'auth' | 'rate' | 'network' }>;
  commitsSince(head, base): Promise<{ sha: string; message: string }[]>;   // for lost acknowledgements
}
```

Two implementations: `github-graphql.ts` (writes through `createCommitOnBranch`, reads
through REST) and `github-rest.ts` (everything through REST). Both are tested through the
same suite against the fake.

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

Live:
- desktop: export each Qchess repertoire study with the script and import it. Check the chapter
  count, each chapter's side, and a sample of comments and arrows against Qchess's own view;
- desktop: import a private Lichess study through OAuth, and check the chapter count, comments
  and arrows against Lichess's own view;
- phone: the study appears after one sync; the OAuth flow from the installed PWA.

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

**Notation.** Lichess-style: the main line, with variations inline, and the current move
highlighted through a signal so navigation redraws two nodes, not the tree. Keys: ← → ↑ ↓,
Home, End. Clicking a move goes there.

**Edits.** Play a move to extend or branch. Per-node menu: delete from here, promote, make main
line, copy the line as PGN. A comment box (sanitized, with a 4,000-character warning). Glyph
buttons. Undo/redo for the session.

**Layout** follows mistake-lab's mobile conventions as a spec: board first, a drawer, 44 px
tap targets, feedback below the board, `touch-action: none` on the board, and no
`orientation` in the manifest.

Tests:
- operations and state machine in Node;
- Playwright smoke tests against `vite preview` with GitHub mocked through request
  interception, on a desktop viewport and an emulated phone: open a chapter, add a variation,
  comment, add a glyph, draw an arrow in draw mode, and check the PGN written to the mocked
  repo.

Live (desktop and phone): every editor action above by hand, including draw mode by finger,
and offline editing with the PWA killed and reopened.

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
   - all four reviews are in the log, and replay gives identical card states on both;
   - the data repo shows one commit per sync, named by device.
7. Resolve both conflicts on the phone. After a sync the desktop shows none.

**Phase 0 exit**: unit, simulation and e2e tests green; the round-trip suite green on the
owner's real exports; the acceptance test passed live.

---

## 5. Later phases (outline)

Each phase lists its scope, what it reuses, its main risks and the checks that would prove it.

### Phase 1: Train and review (SRS)

Scope:
- **Cards.** One card per repertoire move of the chapter's side: `r|positionKey|uci`. Two
  chapters reaching one position share its card.
- **Daily queue**: due cards plus a limit on new ones. Grades follow mistake-lab's repertoire
  rule (under 3 s Easy, under 15 s Good, slower Hard, wrong or hint Again), adjustable.
- **New cards.** Every card starts new (D19). They are introduced line by line in chapter
  order, up to a daily limit of new moves (a setting), so a day's new material is whole lines
  rather than scattered moves.
- **The line trainer.** It walks a line through due cards and quizzes those. A move whose card
  isn't due (or was answered earlier in the session) is played by the trainer at a readable
  pace, which is what lichessable's auto-play did. Its lessons carry over as spec: pacing (no
  less than ~450 ms per move), stopping at the first unproven move, never auto-playing a move
  never answered.
- **Suspend** a card = "always played for me". This replaces Chessable's key moves. FSRS
  difficulty and lapses replace "difficult moves".
- **Conflicting moves** (D3): both repertoire moves are accepted, and training follows the
  line played. The other move's card stays due, and positions with such conflicts are listed.
- **Read and Interactive views** of a line (Qchess's training). Clickable lines in comments
  (q_extension's `clParse`/`clStartFen`, ported, which work out where a line starts from the
  move numbers). Line jumping.
- Transposition badges and "copy continuation" in the study view.
- **Mistakes**: the session's mistake log, retry and drill (lichessable §16–20 without
  Chessable), and pinned mistakes as progress events.
- **Show and grade**: two keys, media keys from a ring, optional speech.

Risks:
- The switch brings thousands of cards at once, all new (D19). The daily limit decides how
  many weeks the whole repertoire takes to come in; the queue simulation below picks its
  default.
- Two cards in one position: the unplayed one could stay due for ever if one line is always
  preferred. The trainer then routes through that line.
- Pace and input speed on the phone.

Checks:
- a 90-day replay simulation of queue sizes on the owner's real repertoire, from all-new cards;
- the trainer's state machine in Node;
- a Playwright review session;
- a week of daily use on the phone before Chessable reviewing stops.

### Phase 2: Explorer, ChessDB and the Practical panel

Scope:
- **Lichess explorer** with `src/pe`'s limiter (copied with a provenance header) and an
  IndexedDB cache. Repertoire badges on the move rows.
- **ChessDB evals** (`queryall`; CORS checked live).
- **The Practical column, prepared score and risk** from `src/pe/search.js` and `rounds.js`
  in a Web Worker, with `provider.child` on chessops. `provider.analyse`, which calls ChessDB's
  `queue`/`store`, stays off unless explicitly enabled (D9).
- **Local explorer** on the desktop: q_extension's `explorerdb serve` must add
  `Access-Control-Allow-Origin` for the site's origin. That's a small change in q_extension,
  made by the owner's session when no long run depends on the checkout. Chrome asks once for
  `loopback-network`.
- **Repertoire coverage** and the **course tree** (lichessable §21, §24), comparing a reference
  study with a repertoire.

Risks:
- The explorer bucket (~23, refilling ~19 a minute) is per token, possibly per account
  (q_extension couldn't tell which). Every device using the token shares it, and so may
  mistake-lab, lichessable and Qchess on the same account.
- Worker CPU on the phone.
- Two copies of `src/pe` drifting apart.

Checks:
- q_extension's `test/pe.js` checks ported to `node --test`;
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
- **`explorerdb serve` CORS**, in q_extension, at the start of Phase 2.

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
