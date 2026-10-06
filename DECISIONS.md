# Repworks: decisions for combining mistake-lab, lichessable and q_extension

Status: draft of 2026-10-05, written before planning started, revised the same day after a
review, then by the planning session, then with the owner's answers to the planning session's
questions, then with the organization the owner created. Each revision is described at the end.
Everything marked **Decided** was agreed in discussion, answered by the owner, or settled as a
technical call in planning; **Open** items are for the owner. `PLAN.md` is the plan built on
this file; the owner approved it, and nothing is built yet.

Working name for the new project: **Repworks** ("rep" is both repertoire and a gym repetition;
chosen 2026-10-05 as a working name and open to change). Code repo: `dubious-moves/repworks`
(created by the owner as `skAeglund/repworks` and transferred into the organization
`dubious-moves`, D17; it holds the plan and nothing built). Data repo, suggested:
`skAeglund/repworks-data` (private, not yet created).

## Purpose

One personal site that replaces three tools: study editing (the part of Qchess that matters),
repertoire review and training, a practical-eval explorer, game-mistake review, and the
lichessable training features (auto-play of proven moves, intuition storm, puzzles, key and
difficult moves, show and grade, mistake drills). Single user, several devices (desktop, Android
phone), used daily.

The owner will stop reviewing on Chessable. Every lichessable feature that still makes sense
without Chessable comes over, working on the site's own studies instead of Chessable courses.

## Source projects

| Project | Repo | What it is | What it contributes |
| --- | --- | --- | --- |
| mistake-lab | github.com/skAeglund/mistake-lab | Single-file PWA (`index.html`, ~30k lines, vanilla JS, chess.js 0.10.3, chessboard.js) plus a Node analyzer (`analyzer/`) | SRS (FSRS-5), repertoire trie and deviations, drills, plan cards, notes, analysis mode, Maia in the browser, Gist sync. Read `docs/architecture-reference.md` first |
| q_extension | github.com/skAeglund/q_extension | Chrome extension for qchess.net plus offline Node tools | `src/pe/*.js` (Practical search, rounds, providers, limiter; free of `chrome.*`), repgen, deeprep, explorerdb, pgnclean, cdbexplore. The extension itself is glued to Qchess's internals |
| lichessable | github.com/skAeglund/lichessable | Chrome extension for Chessable (`content/lichessable.js` ~51k lines) | Training features, specified in `CLAUDE.md` and the `DESIGN-*.md` files. Bound to Chessable's DOM and MoveTrainer |
| puzzle-explorer | github.com/skAeglund/puzzle-explorer | A puzzle-training app (web and Capacitor Android) with a modular, tested `lib/` (FSRS, Lichess OAuth and study import, Gist sync, offline caching) | The build that publishes the dataset, and modules worth extracting (see "What carries over") |
| puzzle-explorer-data | github.com/skAeglund/puzzle-explorer-data | The published dataset (4,096 index shards and 4,096 body shards, ~5 GB), served from GitHub Pages | Data for "puzzles from games that played your lines" (`DESIGN-storm-puzzles.md`) |

Reading status: the planning session read DECISIONS.md, mistake-lab's architecture doc in full
and its FSRS, position key, OAuth, sync and service worker code; q_extension's CLAUDE.md,
`src/pe/*.js`, `tools/repgen/pgntree.mjs`, `tools/explorerdb/server.mjs` and the clickable-line
code in `main-world.js`; lichessable's CLAUDE.md, README, `DESIGN-ui-inventory.md`,
`DESIGN-autoplay.md`, `DESIGN-storm-puzzles.md`, the section map and pipeline of
`DESIGN-intuition-storm.md`, the introductions of the other design docs, and
`content/puzzles.js`; puzzle-explorer's `lib/` headers, `posKey.js`, `fsrs.js` (tests run),
`build-index.js` and `sw.js`. It also read lila's and scalachess's PGN export and import code,
GitHub's documentation source, and the Local Network Access spec. After the owner's answers it
also read Qchess's study page source: its PGN writer, the study download, folders and the study
API. `PLAN.md` §2 lists each claim and how it was checked.

## Decisions

### D1. New repository; extract, don't rewrite (Decided)
Start a new repo. Use mistake-lab, q_extension and puzzle-explorer as sources to extract
modules from, not as a base. Reasons: mistake-lab's eight interacting mode flags and manual DOM
rebuilds would get worse with study, train, storm and auto-play added; the projects use three
chess.js versions; none has a module structure. puzzle-explorer's `lib/` is the exception: its
modules are pure and tested, so they are the preferred copy source where they overlap
mistake-lab (FSRS, Lichess OAuth, study ID parsing). mistake-lab stays in use until its features
have moved over. Existing progress carries across through a one-time conversion (D15), not by
keeping mistake-lab's formats.

### D2. Single user, no accounts, no backend (Decided)
Static site. No server to run or secure. Revisit only if other people are ever to use it.

### D3. The site owns the studies (Decided)
- The site's own study store is the source of truth. Qchess and Lichess are import sources only.
- Import is manual, one study or PGN at a time: a Qchess study through its export script (D18),
  a Lichess study's PGN via OAuth, the owner's Chessable export (D14), repgen/deeprep PGN, or any
  PGN file. After import, edit only in the new site. Nothing syncs back to Qchess or Lichess. An
  import always creates a new study, with its source recorded.
- A study is chapters; each chapter is a tree of nodes with comments, NAGs, board annotations
  (`[%cal]`, `[%csl]`) and a perspective (which side the repertoire is for).
- **PGN is the canonical format, in Lichess's dialect**, as lila and scalachess write it (read
  from their source, 2026-10-05):
  - headers: `[Orientation]` for the perspective (exported only when `orientation=true` is
    requested, so imports request it), `[FEN]`/`[SetUp]` for custom starts, `[StudyName]`,
    `[ChapterName]`;
  - comments as ` { text }`, then the node's shapes in a separate ` { [%csl …][%cal …] }`;
  - comments by other authors carry `[%anno "Name", id]`;
  - glyphs 1–6 as a SAN suffix, others as ` $n`;
  - `1. e4`, with `1... e5` only after a comment or a variation;
  - the movetext on one line.

  Lichess deletes `{` and `}` from comments when they are saved, normalizes whitespace and caps
  a comment at 4,000 characters. On import it merges several comments by one author on a move
  into one, joined with a newline.
- **Reading and writing**: chessops parses (with `emptyHeaders`, so headers are kept exactly);
  the site's own writer writes the dialect, because chessops's `makePgn` doesn't (it writes
  NAGs as `$n`, numbers Black's moves differently, and drops `}`). A planning prototype of that
  writer reproduces Lichess-format movetext byte for byte.
- **Node identity** is its path of canonical SANs (chessops `makeSan`). Import canonicalizes, so
  siblings never share a SAN, even when the source writes Chessable's over-disambiguated
  `Ndb5`. No node IDs are needed.
- "A round-trip loses nothing" is a test, not an assumption. The suite is built from real
  Lichess exports of a test study the owner creates, and also from the owner's real studies,
  which are kept in the private data repo. It covers:
  - custom start FENs;
  - a comment before the first move;
  - several comments on one move (text plus shapes, and other authors);
  - chapters with Black's perspective.

  A `}` inside comment text cannot occur in a Lichess export, so that case becomes "text typed
  with braces is sanitized as Lichess would". Exports must come back byte-identical; other
  writers' PGN (repgen, deeprep, Qchess) must reach a fixed point after one write.
- Keep comment text raw; parse clickable lines at render time (as q_extension does).
- **Cards** attach to position key plus move, not to a node, so transpositions share a card. A
  repertoire move's card ID is `r|<positionKey>|<uci>`, with standard UCI (`e1g1`; chessops
  spells castling `e1h1`, so it is normalized). The position key is defined once (D10).
  mistake-lab's `r_<positionKey>` keys a position, not a move; those states are not migrated
  (D15, D19).
- **Notes are PGN comments.** A position's notes are the comments on every node that reaches
  it, shown together. No separate note store. mistake-lab's standalone position notes become a
  "Notes" reference study, one chapter per position (D15).
- **Conflicting moves.** If two chapters for the same side play different moves in the same
  position, the user may play into either line: both moves are accepted there, and training
  follows whichever line was played (lichessable's auto-play already keeps a set of proven moves
  per position). Each move keeps its own card. If that proves infeasible in some mode, the site
  flags the position as a repertoire conflict instead of guessing.
- **Repertoire studies and reference studies.** Every study is marked as one or the other.
  - Repertoires are the owner's own lines, combining their own ideas with ideas from several
    courses. Only repertoires create SRS cards, take part in drills, auto-play and storm, and
    raise move conflicts.
  - A reference study holds a bought course (or any other source) kept for comparing ideas. It
    is read and browsed, never trained.
  - Repertoire coverage (lichessable §21) and the course tree compare a reference study with a
    repertoire.
  - Importing a reference study is the same manual one-at-a-time import.
- Size: about 400-800 repertoire variations in total, both colours. Small: a few hundred KB of
  PGN. Reference studies add to that and may be larger.

### D4. Storage and sync (Decided)
- Truth: a **private GitHub repo** holding one PGN file per chapter, a `study.json` per study
  (name, kind, chapter order), and the progress logs (below). Every sync is a commit, batching
  the edits made since the last one, which gives history and undo.
  - Layout: `studies/<sid>/study.json`, `studies/<sid>/<cid>.pgn`,
    `progress/<device>/<YYYY-MM-DD>.jsonl`, `devices/<device>.json`.
  - IDs are 8 random characters.
  - A chapter file keeps every header as imported, `StudyName` included, so a stored chapter
    is its Lichess export. `study.json` is the truth for the study's name, and a rename
    rewrites `StudyName` in its chapters in the same commit.
  - `PLAN.md` §4.4 has the details.
- The data repo must be created non-empty (with a README): GitHub cannot create a branch in an
  empty repository.
- Each device keeps a local copy in IndexedDB and works offline. The local copy is a cache; the
  repo is the truth. The app requests persistent storage and syncs on open.
- **Writes** are commits that name the version they are based on; a stale write is refused, so
  the app pulls, merges and retries. Two ways to commit several files atomically, both checked
  in GitHub's documentation:
  - GraphQL `createCommitOnBranch` with `expectedHeadOid`: **one** content-creating request per
    sync;
  - the REST Git Data API: a tree with inline file contents, a commit, then a ref update with
    `force: false`, which is refused unless it is a fast-forward. That is **three** requests.

  GitHub allows 500 content-creating requests an hour per account, across all devices, so the
  default is GraphQL, with REST behind the same interface as the fallback. Phase 0's first step
  (a live spike from the browser) confirms the GraphQL path with a fine-grained token, and the
  exact error for a stale head, before sync is built on it.
- **Reads**: REST ref (conditional, with `ETag`; a 304 doesn't count against the rate limit),
  then the recursive tree, then raw blobs. Content is cached by blob SHA, so a file is
  downloaded once per version.
- **When**: push 30 s after the last change, at most once a minute per device, and when the app
  is hidden; pull on start, on focus, on reconnect and every 5 minutes while visible.
- **Studies merge** three-way by move path (base = the version both sides last agreed on), in a
  pure, heavily tested function:
  - Comment text edited on both sides keeps both versions, joined with a visible conflict
    marker, so no text is lost.
  - Other same-node clashes (NAGs, sibling order, headers): last writer wins, where **"last
    writer" means the device that syncs later**. Per-attribute edit times would cost a lot for
    rare, harmless clashes.
  - Shapes merge as a set: an arrow added on either side stays, one removed on either side
    goes, and there is no clash.
  - Edit beats delete: if one side deletes a subtree and the other edited inside it, the edited
    nodes and the path to them are kept and flagged.
  - Replacing a move in the middle of a line is a delete plus an add, so the rule above applies
    to anything edited under the old path on the other device.
  - A chapter or study deleted on one side and edited on the other is kept and flagged.
  - A changed start FEN: the changing side's tree wins, and the other side's edits are kept as a
    conflict copy of the chapter.
  - A file the app cannot parse is never rewritten.
  - **Flags are git-style markers in PGN comments** (`<<<<<<<` … `=======` … `>>>>>>>`, and
    `<<<<<<< kept: …` for edit beats delete). The conflicts list is every comment carrying a
    marker; resolving one is an ordinary edit. So any device sees the same conflicts, and
    nothing outside the PGN needs syncing.
  - A planning prototype passed these rules on 20,000 random concurrent edits, and converged on
    3,000 random two-device runs.
- **Progress is an append-only log, not a merged state.** Each device appends review events to
  its own files and never writes another device's. SRS state (FSRS) is computed by replaying all
  devices' logs in time order. Two devices never write the same progress file, so progress needs
  no merge, no tombstones and no last-writer-wins, and a review done offline on one device can't
  be lost to another. Rules that mistake-lab's merge spells out by hand (earliest
  `firstReview`, union of `recidGraded`) fall out of the replay. Notes are authored content and
  merge with the studies, not here.
  - **Files**: one per device per UTC day (`progress/<device>/<YYYY-MM-DD>.jsonl`), so a sync
    uploads one day's events, not a month's. The owning device compacts a closed month into
    `<YYYY-MM>.jsonl` in one commit.
  - **Events**: one JSON object per line, `{v, n, t, k, …}`, where `n` counts up per device and
    (device, `n`) is unique. Unknown kinds are skipped by readers and kept by compaction.
  - **Tabs**: two tabs of one browser share a device ID, so sync runs under a Web Lock.
  - **Lost answers**: commit messages carry `repworks-sync: <device>:<seq>`. A commit whose
    answer was lost is found and adopted rather than merged twice, which the prototype showed
    would nest conflict markers.
  - **Lost storage**: a device that has lost its local storage gets a new device ID; its old
    files stay as they are.
  - Rough size: 200 reviews a day is a few MB a year. A periodic snapshot can be added if replay
    gets slow; it is per card, so it should not.
- Auth: a fine-grained personal access token limited to that one repo (Contents read/write).
  - First-time setup on a device: open the site with `#setup?repo=…&token=…` (typed, pasted or
    from a QR code). The app removes it from the address bar at once.
  - GitHub allows no expiry for a personal account's fine-grained token. It revokes a token
    unused for a year, and any token pushed to a public repo or gist.
  - The app shows a clear prompt on 401 and keeps local work.
- Phone: Android with Chrome, installed as a PWA.
- A cloud Claude session can write PGN (e.g. repgen output) into the same repo; the merge handles
  two writers. The data repo carries a README describing the format, and the code repo a
  `validate-data` script to run before pushing.
- Alternatives considered: Cloudflare Worker + D1 (more infrastructure; only if GitHub's write
  latency bothers), Dropbox app folder (no history or Claude access), Gists (all-gist token
  scope, whole-file rewrites). Not chosen.
- Verified limits (GitHub's documentation source, 2026-10-05):
  - 5,000 requests/hour;
  - ≤100 concurrent requests;
  - ≤900 REST points/minute (GET 1, write 5);
  - ≤80 content-creating requests/minute and ≤500/hour;
  - blob reads up to 100 MB; recursive tree ≤100,000 entries / 7 MB;
  - git warns above 50 MiB and refuses above 100 MiB.

### D5. Data tiers (Decided)
| Tier | Examples | Where |
| --- | --- | --- |
| Authored | studies (comments are the notes) | IndexedDB + synced repo (merged) |
| Progress | SRS reviews, mistake log, pins, storm and puzzle results | IndexedDB + synced repo (per-device append-only logs) |
| Derived | SRS state, repertoire index, parsed chapters, analyzed games, eval cache, puzzle index | local, cached by source blob SHA, with export; not in the small synced files |
| Cache | explorer and ChessDB answers, puzzle shards | local only |

Where the analyzer's game output lives (the data repo with the analyzer as its only writer, or
the Gist during the move) is settled in Phase 5.

### D6. Board and rules library (Decided)
- Board: **chessground** (Lichess's board; GPL-3.0-or-later). It replaces mistake-lab's
  hand-built overlay layers (arrows, circles, ghost arrows, last move, premove, touch handling)
  and lichessable's static board layer. It starts arrows only on right-click or Shift, so the
  phone gets a draw-mode button.
- Licence: the site's code is **GPL-3 and public**. The private study data lives in a separate
  repo. Owner confirmed GPL-3 is fine.
- Pieces: cburnett, self-hosted. chessground's npm package already embeds them in
  `assets/chessground.cburnett.css`; their licence is GPLv2+ (lila's COPYING.md), compatible with
  GPL-3.
- Rules in the app: **chessops** (Lichess's library, GPL-3.0-or-later, same author as
  chessground). Its PGN tree has variations, comments before moves and variations, several
  comments per move, NAGs and `[%cal]`/`[%csl]` parsing, and it gives chessground its legal
  destinations directly. Tested 0.15.1.
- chess.js 1.x is unsuitable for studies: 1.4.0 silently drops variations and NAGs, and throws
  on two comments after one move, which is how Lichess writes a comment plus arrows. That is why
  q_extension wrote its own `repgen/pgntree.mjs`.
- Rules in the tools: **chess.js 1.x** stays (`src/vendor/chess.js`, 1.4.0). explorerdb and
  deeprep rely on its internals (`_makeMove`, `_hash`) for speed.
- The two libraries meet only through the shared position key (D10), which is tested against
  both.

### D7. UI (Decided)
Keep mistake-lab's UX as a spec, not its code: board-first mobile layout, drawer, 44 px tap
targets, wake lock during drills, feedback below the board, `touch-action` handling, and no
`orientation` in the manifest. Build with Vite and TypeScript, **Preact with
`@preact/signals`**, and an explicit state machine for the app's modes instead of boolean
flags.

Why Preact:
- the largest body of familiar patterns for the sessions that will write the code;
- 4 KB;
- JSX checked by the same `tsc`;
- signals redraw only the two notation nodes that change on each move.

Svelte 5's runes and Solid's reactivity rules are both easy to get subtly wrong. chessground is
imperative and fits any of them.

TypeScript is limited to syntax Node can strip without a build (`erasableSyntaxOnly`: no enums,
no namespaces, no parameter properties; relative imports carry `.ts`), so the pure-logic tests
run directly with `node --test` in the no-build harness style, as in q_extension. Checked: Node
22.22 runs a `.ts` test importing chessops with no build (type stripping is on by default from
Node 22.18; the owner has 24.14.1). JSX stays in `src/ui`. UI smoke tests use Playwright.

### D8. Heavy work stays offline; the tools wait (Decided)
The analyzer (native Stockfish over games), repgen, deeprep, explorerdb and cdbexplore stay
desktop Node tools. They emit PGN or JSON that the site imports. The game-mistake features load
lazily, so the study and training views never wait on them. The 11.8 GB explorer index cannot
live in a browser.

The tools stay where they are for now: repgen, deeprep, explorerdb and cdbexplore in
q_extension, and the analyzer in mistake-lab (`analyzer/analyze.js`, not in q_extension as this
file first said). Retiring mistake-lab's PWA does not remove its analyzer. q_extension's notes
already record that a long `explorerdb all` run must not have its checkout changed under it. The
new repo copies `src/pe/*.js` at the start; moving the tools across comes last, once nothing
long-running depends on their current location.

### D9. Lichess access (Decided)
- Lichess OAuth (PKCE, redirect flow, no server) for the explorer token and study import, as
  mistake-lab and puzzle-explorer do. The token lives on each device, never in a repo.
- The PKCE verifier goes in localStorage, not sessionStorage. On Android the redirect may land
  in a Custom Tab rather than the PWA window, and only origin storage is shared between them (to
  confirm live in Phase 0).
- The explorer limit was measured in q_extension: a token bucket of about 23, refilling at about
  18.5-19 a minute, per token or account. Carry over `src/pe`'s limiter. The explorer answers a
  web page (checked live: 401 without a token, any origin allowed, `Authorization` allowed in
  preflight).
- ChessDB: the client only ever asks `queryall` and `querypv`; `queue` and `store` spend a
  volunteer network's compute and are an explicit choice, never a default. Note that
  `src/pe/providers.js` *does* call `queue`/`store` (the search's `provider.analyse`), so the
  site's provider leaves `analyse` out unless the owner switches it on. ChessDB answers a web
  page (checked live: it echoes the page's origin in `Access-Control-Allow-Origin`).

**Local explorer (optional).** `explorerdb serve` exists on one desktop only. Where it is
configured and reachable, the site uses it instead of Lichess's explorer (no token, no limiter),
as q_extension's `providers.js` does; everywhere else, Lichess's explorer as usual. Checked:
- Chrome 142 and later lets an HTTPS page call `http://localhost` after a one-time permission
  prompt (Local Network Access: the `loopback-network` permission). There is no preflight, and
  `http://localhost` is exempt from mixed-content blocking.
- Ordinary CORS still applies, and `explorerdb serve` sends no `Access-Control-Allow-Origin` and
  refuses `OPTIONS`. It needs that header for the site's origin: a small change in q_extension,
  made in Phase 2 when no long run depends on its checkout.

### D10. One position key (Decided, rule corrected)
Cards, notes, transpositions, the opening index and the puzzle dataset all key on the first four
FEN fields, and the sources disagree on the en passant field:
- mistake-lab's `fenPositionKey` keeps it when the capture is pseudo-legal (a side-to-move pawn
  beside the target square, on the right rank);
- puzzle-explorer's `posKey.js` (mirrored in lichessable's `content/puzzles.js`) implements the
  same pseudo-legal rule;
- chess.js 1.x `fen()`, chessops's `makeFen` and Lichess keep it only when the capture is legal.
  They differ from the pseudo-legal rule when the neighbouring pawn is pinned, or when the
  capture would expose the king along the rank.

The puzzle dataset is published and can't change, so the site takes **its** rule. That rule is
the legal one: `build-index.js` keys FENs from chess.js 1.4.0, which carry only legal en passant
squares, so the pseudo-legal check never removes anything. Checked: 1,763,576 published keys,
from every 16th shard, are all unchanged by chessops canonicalization (3,810 of them carry an en
passant square), and each hashes to its shard.

**`positionKey(fen)` = the first four fields of chessops's canonical FEN** (`parseFen` →
`Chess.fromSetup` → `makeFen(pos.toSetup())`). That gives legal en passant only, castling rights
normalized and clocks dropped. It applies to every FEN, whichever library produced it.

Its tests cover:
- a pinned neighbouring pawn (diagonal and horizontal);
- capturable and non-capturable double pushes;
- two neighbours with one pinned;
- the same position as written by four libraries;
- about 2,000 published keys (CC0) as fixed points;
- agreement with mistake-lab's key everywhere except illegal captures.

Migration (D15) re-keys mistake-lab's data through the same function and reports every key that
changes; almost none should.

### D11. Maia (Decided; was open question 3)
- The model mistake-lab ships (`maia3_simplified.onnx`, 45,683,686 bytes, plus the two move
  tables) is byte-identical to CSSLab/maia-platform-frontend's, whose repository is GPL-3.0 with
  no separate model licence.
- Repworks vendors it under GPL-3 with attribution, along with onnxruntime-web, not from a CDN.
- At 43.6 MiB it fits GitHub Pages (git warns from 50 MiB); mistake-lab already serves it there.
  Cloudflare Pages' 25 MiB file limit would need it split.

### D12. Puzzle data (Decided; was open question 7)
- Served from the existing puzzle-explorer-data GitHub Pages site, read as lichessable reads it
  today, with the base URL a setting.
- The published site is ~5 GB, above Pages' documented 1 GB, so it is served at GitHub's
  discretion; puzzle-explorer's README documents an R2 fallback.
- Repworks has its own origin (D17), so the fetches are cross-origin and rely on GitHub Pages
  sending `Access-Control-Allow-Origin: *`. Phase 0's spike checks it (`PLAN.md` §4.2), since
  github.io is unreachable from the planning container.

### D13. The Practical column runs in the browser (Decided; was open question 5)
- `src/pe/search.js` and `rounds.js` are pure and take their providers injected, which is how
  the extension already ran them. The site runs them in a Web Worker, with chessops as
  `provider.child`, against Lichess's explorer and ChessDB, or the local explorer where there is
  one.
- What the tools precompute (repgen, deeprep) arrives as PGN through import, comments included.
- There is no separate precomputed store.

### D14. Chessable courses become PGN through the owner's own script (Decided by the owner, 2026-10-05; `PLAN.md` §8, question 3)
- The owner already has a script that exports Chessable courses to PGN, so nothing is built in
  lichessable for it.
- Its output imports like any other PGN file (D3). Bought courses become reference studies, kept
  only in the private data repo (Constraints).
- A sample of its output joins the private round-trip fixtures (`PLAN.md` §4.5 (b)).
- It doesn't depend on lichessable, so retiring lichessable sets it no deadline.

### D15. Migration of mistake-lab's progress (Decided in approach; was open question 6)
A one-off conversion, run first as a dry run with a report:
- Read the Gist with a token entered once.
- `positions[pid].srs` becomes one `snapshot` event per card at the start of the log, re-keyed
  through D10:
  - `p_<key>` becomes `p|key`;
  - game items become `m|…`;
  - `r_<key>` repertoire states are left behind and counted in the report. The site's own
    repertoire cards start new in Phase 1, months before this migration (D19), and a migrated
    state would overwrite them.
- The `snapshot` event kind arrives with this migration; nothing earlier needs it.
- Notes become a "Notes" reference study.
- Plan-card enrolments, custom deviations and dismissals become events.

Studies need no migration: they are imported manually (D3). Details in `PLAN.md` Phase 5.

### D16. Auto-play, key moves and difficult moves on the site's own SRS (Decided)
Chessable schedules per variation move, so its shared prefixes are drilled again in every line;
lichessable's auto-play exists to stop that. With one card per position and move, a shared
prefix is one card. So:
- **Auto-play** becomes the trainer's normal behaviour: a move whose card isn't due is played
  for you, at a readable pace, and only due moves are asked. lichessable's design carries over
  as spec for pace and hand-back.
- **Key moves** become suspended cards ("always played for me").
- **Difficult moves** are FSRS difficulty and lapses.

lichessable §25's range juggling is not needed.

### D17. The site's own origin, through a GitHub organization (Decided by the owner, 2026-10-05; `PLAN.md` §8, question 1)
- A free GitHub organization, `dubious-moves`, holds the code repo, transferred from
  `skAeglund/repworks` on 2026-10-05. Its Pages site serves Repworks at
  `https://dubious-moves.github.io/repworks/`, an origin of its own. A free organization
  publishes Pages only from a public repo, so the code repo stays public.
- Why not `skaeglund.github.io`: mistake-lab's and puzzle-explorer's service workers each delete
  every Cache Storage cache that isn't their own (checked in their `sw.js`), so they would wipe
  the site's offline cache. That origin also shares a storage quota with them, and their pages
  could read the site's GitHub token.
- The organization publishes Repworks only, since a second Pages site there would share the
  origin again.
- Deploys use GitHub Actions with the built-in `GITHUB_TOKEN`; no secret is stored anywhere.
- The data repo stays private under the owner's own account (D4), so the fine-grained token
  belongs to the person, and no organization token policy applies to it.
- The owner named the organization `dubious-moves`. That name is part of the origin, so
  changing it would mean setting up each device again, since a browser keeps local data per
  origin; the data repo would be unaffected. The project's name appears only in the path
  (`/repworks/`, the repo's name). GitHub doesn't redirect a project site after a rename, so
  renaming the repo would mean installing the app again from the new address, but every
  device's local data would stay, the origin being the same.
- Multi-threaded Stockfish needs COOP/COEP. On Pages the site's own service worker can add them.
  Login already uses the redirect flow, and the explorer, ChessDB and the GitHub API all answer
  with CORS, so isolation stays possible. It isn't needed until Phase 3, if at all.

### D18. Qchess studies are the first import (Decided: the source by the owner, the method as a technical call, 2026-10-05)
The owner's newest repertoire is in Qchess studies. Qchess's own "Download study PGN" writes every
chapter, but leaves out what the site needs to know about each one: the side it is for
(`perspective`), its folder, and whether it is excluded from Qchess's MoveTrainer. So:
- A console script in the code repo, `scripts/qchess-export.js`, runs on the Qchess study page.
  It calls Qchess's `saveCurrentChapterPgn()`, so the open chapter's edits are included, then
  downloads one PGN file with every chapter, adding `[Orientation]` from `perspective`, plus
  `[QchessFolder]` and `[QchessTrain "false"]` where they apply. It changes nothing on Qchess.
  Its core is a pure function, tested in Node.
- The site imports that file like any PGN (D3). Chapters not to be trained go into a companion
  reference study, since a study is repertoire or reference as a whole.
- Qchess's own download still works as a fallback. The import then asks the side once per study,
  changeable per chapter.
- Not chosen: calling Qchess's study API from the site. It answers any origin, but it needs the
  Qchess login token stored on the device, and it is undocumented, for what is a one-off move.
- Qchess writes its own dialect: one comment block per move with shapes first, `$n` glyphs from
  Lichess's set, and `{ }` typed in text turned into `( )`. chessops reads it, and the import
  rewrites it in Lichess's dialect, so its round trip is the semantic one (D3).
- Until Phase 1 is in daily use the owner keeps editing in Qchess, so earlier imports are trial
  copies. At the switch each study is imported a last time.

### D19. Every repertoire card starts new (Decided by the owner, 2026-10-05; `PLAN.md` §8, question 4)
- No card is seeded as known from Chessable progress.
- mistake-lab's repertoire states (`r_<key>`) aren't migrated either (D15). By Phase 5 the site's
  own repertoire cards will have been in use for months, and a migrated state would overwrite
  them.
- New cards come in line by line, in chapter order, up to a daily limit of new moves (a
  setting). Phase 1's queue simulation on the real repertoire picks the default.

### D20. Phase order and retirement (Decided with the owner, 2026-10-05; `PLAN.md` §8, question 2)
- The order stays as `PLAN.md` §6 has it: foundation; train and review; explorer and Practical;
  analysis; storm and puzzles; mistake review and migration.
- The storm will be daily use eventually, but it isn't needed early, so Phase 4 stays after
  Phases 2 and 3.
- lichessable can be retired after Phase 1: training moves to the site, and the Chessable export
  is the owner's own script (D14). Its storm can still be used on Chessable courses until Phase 4.
- Editing in Qchess ends when Phase 1 goes into daily use (D18).
- mistake-lab is retired after Phase 5. Its analyzer keeps running from its repo until the tools
  move (D8).

### D21. The study page is laid out as Qchess's (Decided by the owner, 2026-10-06)
The owner found the Lichess-style notation (variations inline in brackets, `PLAN.md` §4.11)
unreadable on a deep repertoire chapter and asked for Qchess's study page instead, replicated
first and improved later:
- On a wide screen: the chapters on the left, the board, and a panel on the right with the
  notation on top and the move buttons at its foot. On the phone: board, move buttons,
  notation, then the tools.
- The notation as Qchess lays it out: the main line in rows of two moves under the move number,
  broken by comments and variations, each on rows of their own; a variation runs inline, and
  where it forks every continuation goes on its own indented branch line.
- The explorer (Lichess database, ChessDB, the Practical column: Phase 2 in `PLAN.md`) goes in
  the panel under the notation, laid out like Qchess's, and can be turned on and off.
- Comments, including the percentages repgen writes, show as ordinary comments for now.
- A move's edits are in Qchess's right-click menu (long-press on the phone, or a ⋯ button),
  and its comment and glyphs in Qchess's comment dialog, not in tools under the notation
  (asked by the owner, 2026-10-06).

### D22. Studies and training work as Qchess's (Decided by the owner, 2026-10-06)
After testing Phase 0 on the desktop and the phone, the owner asked for Qchess as the model of
how studies and training work, as D21 made it the model of the study page:
- the study list as cards, like `qchess.net/studies`;
- a study made on the site with no PGN imported, and studies and chapters renamed and deleted
  where Qchess does it;
- Qchess's MoveTrainer ↔ Study mode: while a line is trained, switch at any time to the study
  with that line open and editable.
`PLAN.md` §5.15 plans it, after §5.12 and before Phase 1's acceptance test. Qchess is read live
first; its details are copied, then improved later.

## What carries over (checked against the code)

| From | As code | As spec only | Dropped |
| --- | --- | --- | --- |
| mistake-lab | Maia board encoding and phased init (`maiaEncodeBoard`, `maiaMirrorFEN`, `prefetchMaia`/`compileMaia`), checked against q_extension's `maia.mjs`; Stockfish 18 lite-single build | SRS grade rules and FSRS-5 (taken as code from puzzle-explorer, which extracted it); repertoire trie (rebuilt from the PGN tree: a multi-valued position → moves index); analysis mode; plan cards (a card kind); notes (become PGN comments); mobile UX conventions; recidivism, weak spots, checklist, continuation practice, game review history (Phase 5) | its merge rules (tombstones, newer wins), replaced by D4; its PGN parser, replaced by chessops; Gist sync; single-file structure; chess.js 0.10.3; chessboard.js and the overlay layers (chessground); CDN loading |
| q_extension | `src/pe/*.js` (pure; `provider.analyse` off by default, D9); the clickable-line parser (`clParse`, `clStartFen`); the tools later (D8) | study ↔ train (Read/Interactive), clickable-line preview, line jumping, copy continuation, transposition badges, variation side bars, Practical column, risk and prepared score | `main-world.js`, page contract, bridge, popup, everything bound to Qchess |
| lichessable | the storm's pure rules (grading, win%, filters) where they are pure, with `dev/check-storm.js`'s assertions; `content/puzzles.js`'s filters and append-only theme list (its key is replaced by D10, which matches the dataset more exactly) | auto-play's pacing and hand-back (D16); intuition storm; puzzles from games; show and grade and the media-key ring; repertoire coverage; course tree; mistake retry/drill/pins; ChessDB eval column; the UI inventory's rules (one primary action per state, one meaning per colour) | Chessable DOM and MoveTrainer access, quick-edit through Chessable, Chessable sync, key-range juggling (§25, D16), offscreen engine hub, pack scripts, `san.js` (chessops) |
| puzzle-explorer | `lib/fsrs.js` (FSRS-5, 70 tests pass); `lib/lichessAuth.js` (PKCE); `extractStudyId` and chapter splitting from `lib/lichessStudy.js` | `lib/cache.js` (best-effort shard cache, build-stamp invalidation); `offline.js` (body-shard grouping); `keyboardMode.js` (ring input) | Gist sync; Capacitor and OTA updates; chess.js 0.10.3 |

## Constraints
- No Chessable course content in the public code repo (lichessable's `.gitignore` already treats
  it as not ours to redistribute). Bought courses may be imported into the private data repo as
  reference studies (D3), for the owner's own use only. The same goes for the owner's real
  studies used as test fixtures.
- No tokens in git, ever. No model weights or Stockfish builds over GitHub's file limit
  (lichessable's full Stockfish 18 build is 108 MB; use the lite build or Lichess's builds with a
  separate NNUE file).
- No code loaded from a CDN at runtime: everything is self-hosted, for offline use and so the
  token never shares a page with third-party script.
- The app never rewrites a data file it cannot parse.
- The service worker's caches are named `repworks-*`, and it deletes only those.
- Keep q_extension's habit of a no-build test harness for pure logic; the merge function, PGN
  tree, position key, progress-log replay and SRS are the first things to cover this way.

## Open questions
Neither blocks Phase 0.
1. Repo layout: an eventual monorepo (`app/`, `tools/`, `shared/`) is likely. The tools join last
   (D8), so this only needs settling when they move.
2. Whether "Repworks" stays as the name (checked only against GitHub repo names; domain and
   trademark not checked). Less pressing now: the organization's name fixes the origin, and the
   project's name appears only as the repo's name and the address's path, so a rename would keep
   every device's local data (D17).

## Guidance for the build sessions
- `PLAN.md` is the plan; §4 is Phase 0 in build order, starting with the live remote spike
  (§4.2).
- Say plainly what was checked against code or live sources and what was taken from
  documentation, as `PLAN.md` §2 does.
- Treat the source repos as read-only references. Don't change q_extension's checkout while a
  long tool run depends on it.

## Revision of 2026-10-05
Changed after a review of the first draft, agreed with the owner:
- Progress is a per-device, append-only review log replayed into SRS state, replacing per-card
  last writer wins with tombstones (D4, D5).
- Study merge: clashing comment text keeps both versions, edit beats delete, conflicts are
  flagged for review (D4).
- Git Data API for atomic multi-file commits (D4).
- One position key, using the puzzle dataset's en passant rule (D10).
- chessops in the app and chess.js 1.x in the tools (D6).
- PGN follows Lichess's dialect, proven by a round-trip suite of real exports (D3).
- Conflicting moves at one position: both lines are playable, or the position is flagged (D3).
- All relevant lichessable features come over; Chessable is no longer used for reviewing
  (Purpose, carry-over table, open question 9).
- The local explorer is optional and desktop-only (D9).
- Study import is manual, one at a time, with no sync back to Lichess (D3, open question 6).
- The tools stay in q_extension for now (D8, open question 4).
- TypeScript limited to erasable syntax for the no-build harness (D7). Hosting leans to GitHub
  Pages (open question 2).
- Studies are either repertoires (trained) or reference studies (bought courses kept for comparing
  ideas, never trained); bought courses may live in the private data repo (D3, Constraints, open
  question 9).

## Revision of 2026-10-05 (planning session)
Changed by the planning session. Technical calls were made there; owner's calls are left open.
Each item gives the reason.
- **D10's rule corrected to the legal en passant rule.** The dataset's keys were built from
  chess.js 1.4.0 FENs, which carry only legal en passant squares. 1.76 M published keys all match
  chessops's canonical FEN, which `posKey.js`'s pseudo-legal rule would not guarantee in pinned
  positions. The key is defined as chessops's canonical FEN, which also normalizes castling
  rights.
- **D4 writes: GraphQL `createCommitOnBranch` by default, REST Git Data as fallback.** One
  content-creating request per sync instead of three, against a limit of 500 an hour across
  devices. The same stale-write guarantee (`expectedHeadOid`). It is gated on a live spike,
  because it could only be read from documentation here.
- **D4 reads: conditional ref GET, recursive tree, raw blobs, cached by SHA.** Polling costs
  nothing when unchanged, and each file version downloads once.
- **D4: the data repo must not be empty.** GitHub can't create a branch in an empty repo
  (documentation).
- **D4: "last writer wins" defined as "the device that syncs later wins".** The original wording
  had no definition, and per-attribute edit times would cost more than these rare clashes are
  worth.
- **D4: shapes merge as a set.** Arrows added on both sides should both survive, and a set merge
  has no clash to resolve.
- **D4: conflict flags are git-style markers in PGN comments.** No second store to sync. The
  markers survive Lichess's sanitizer and are visible anywhere the PGN goes.
- **D4: files the app cannot parse are never rewritten.** So a half-written file from another
  writer can't be destroyed.
- **D4: progress files are per device per UTC day, compacted monthly.** A monthly file would be
  re-uploaded whole on every sync, up to a megabyte by month's end.
- **D4: sync IDs in commit messages, and a Web Lock for sync.** The planning prototype showed
  that re-merging one's own landed commit nests conflict markers. Two tabs share one device ID.
- **D4 "To verify" replaced by the limits read from GitHub's documentation source.**
- **D3: the dialect pinned down from lila's and scalachess's source.** This includes
  `orientation=true` being required, and `[%anno]`. The round-trip case "a `}` inside comment
  text" became "braces typed in the editor are sanitized as Lichess would": Lichess deletes
  braces on save, so an export can't contain one. Own writer, chessops parser, canonical SAN.
- **D3: notes are PGN comments.** mistake-lab's standalone notes become a reference study. One
  fewer data type to merge and sync, and the notes stay Lichess-compatible.
- **D6: confirmed against the npm packages.** chess.js 1.4.0 also drops NAGs and throws on two
  comments after one move. chessground already embeds the cburnett pieces (GPLv2+).
- **D7: framework decided: Preact with signals.** It was open; the reasons are in D7. Node's type
  stripping was checked to run the tests with no build.
- **D8 corrected: the analyzer lives in mistake-lab, not q_extension.** That is where it is.
- **D9 extended.** Local Network Access findings; `explorerdb serve` needs a CORS header;
  `src/pe` calls ChessDB `queue`/`store`, so that path is off by default; the PKCE verifier goes
  in localStorage for Android.
- **D11 (new, was open question 3): Maia vendored under GPL-3.** The model is byte-identical to
  CSSLab's GPL-3 repository's, and fits Pages.
- **D12 (new, was open question 7): puzzle data stays on the puzzle-explorer-data Pages site.**
  It works today. The site's size exceeds Pages' documented limit, so the base URL is a setting.
- **D13 (new, was open question 5): the Practical column runs in the browser.** `src/pe` was
  built to; tool output arrives as PGN.
- **D14 (new, was open question 9): Chessable export inside lichessable.** It already has the
  course reader and the login.
- **D15 (new, was open question 6): migration approach.** It now covers every card type, notes
  and enrolments, and reports what cannot be mapped.
- **D16 (new): auto-play, key moves and difficult moves recast.** One card per position and move
  removes the problem auto-play solved on Chessable.
- **Carry-over table checked against the code.**
  - mistake-lab's FSRS comes via puzzle-explorer's tested extraction.
  - The trie, analysis mode, notes and plan cards are spec, not code.
  - Maia's encoding is code.
  - A puzzle-explorer row was added.
  - lichessable's storm rules and puzzle filters are partly code.
- **Source projects: puzzle-explorer described as the app it is.** Its `lib/` holds tested
  modules worth extracting.
- **Open question 2 (hosting) narrowed to the origin.** The other apps on `skaeglund.github.io`
  delete foreign caches, share the quota, and can read the site's token.
- **Open questions 4 and 5 added.** They change phase order and the first weeks of daily use,
  which are the owner's to decide.
- **Constraints added: no runtime CDN code, never rewrite unparseable data, own-prefix caches.**
  These are the lessons from the source projects that a new codebase should start with.

## Revision of 2026-10-05 (owner's answers)
The owner answered the planning session's four questions (`PLAN.md` §8, numbered as there).
Each change, with its reason:
- **D17 (new; question 1): the site gets its own origin through a free GitHub
  organization.** The owner took the recommendation. The code repo moves into the organization,
  which publishes nothing else. The data repo stays under the owner's account, so the token
  belongs to the person and no organization policy applies to it.
- **D20 (new; question 2): the phase order stays, and lichessable can go after Phase
  1.** The storm will be daily use eventually, but isn't needed early.
- **D14 rewritten (question 3): the owner's own script exports Chessable courses.** It already
  exists, so the planned lichessable feature is dropped, and with it the deadline that feature
  set on retiring lichessable.
- **D18 (new): Qchess studies are the first import, through a console export script.** The
  owner's newest repertoire is in Qchess. Qchess's own download loses each chapter's side, folder
  and training flag; the script keeps them. Checked against the study page's source and with
  chessops (`PLAN.md` §2). The study API was not chosen: it needs the Qchess login token on the
  device and is undocumented, for a one-off move.
- **D3: import sources reordered, Qchess first; nothing syncs back to Qchess either.**
- **D19 (new; question 4): every repertoire card starts new.** The owner chose a fresh
  start.
- **D15: mistake-lab's `r_` repertoire states are no longer migrated.** This follows from D19 and
  the phase order: by Phase 5 the site's own repertoire cards would be months old, and a migrated
  state would overwrite them. The `snapshot` event kind moves from Phase 0 to Phase 5, the only
  phase that needs it.
- **D12: the cross-origin check of puzzle-explorer-data moves into Phase 0's spike.** With D17 the
  fetches are cross-origin from the start.
- **Open questions reduced to two (repo layout, the name) and renumbered.** The rest were
  answered. The note on COOP/COEP moved from the hosting question into D17.
- **Reading status: Qchess's study page source added.**

## Revision of 2026-10-05 (organization created)
The owner created the organization `dubious-moves` and transferred the code repo into it. Each
change, with its reason:
- **D17: the organization is `dubious-moves`, so the address is
  `https://dubious-moves.github.io/repworks/`.** Recorded now that the name exists; it replaces
  the `<org>` placeholder throughout `PLAN.md`.
- **D17: a free organization publishes Pages only from a public repo,** so the code repo must stay
  public. The plan always had it public; the rule is from GitHub's docs, and the owner checks the
  setting, which this session can't see (`PLAN.md` §8).
- **D17: what a rename would cost, now that the two names differ.** The organization's name is
  part of the origin, the project's name only of the path. Renaming the repo would keep each
  device's local data and cost a reinstall of the app, since GitHub doesn't redirect project
  sites after a rename (from GitHub's docs).
- **Open question 2 eased accordingly.** "Best settled before the organization is created" no
  longer applies.
- **Status and the code repo's name updated.** The plan was pushed to
  `claude/ecstatic-tesla-8txo26` through the old address, which GitHub redirects; being the first
  push into the empty repo, that branch became its default.
- **`PLAN.md` §8's setup: the first three steps are done.** Added: check that the repo is public,
  create `main` as the default branch, and start build sessions with the new name. §2 gains two
  rows: Pages on a free organization, and the old address after the transfer.

## Revision of 2026-10-05 (setup finished, plan approved)
- **The owner approved the plan; Phase 0 starts in a new session** started from
  `dubious-moves/repworks`, so it has the repo under its new name and a fresh context.
- **`PLAN.md` §8's setup brought up to date.** The owner confirmed that the repo is public and set
  Pages' source to GitHub Actions, and `main` was pushed from the plan branch with the owner's
  permission. Left for the owner: making `main` the default branch, and the `github-pages`
  environment's branch rule if it names the plan branch, which would refuse deploys from `main`.
- **`prototypes/` added: the planning session's scratch code behind `PLAN.md` §2,** kept so its
  findings can be re-run and Phase 0 can start from it, rather than being lost with the planning
  session's container. Re-run from the repo with the pinned versions, it gives the same results.
  It goes once Phase 0 has replaced it.

## Revision of 2026-10-05 (Phase 0 build)
Changes made while building Phase 0, each with its reason:
- **D6: chessground comes from the npm package `@lichess-org/chessground`.** The unscoped
  `chessground` package is marked deprecated on npm; Lichess publishes the board under its
  organization's scope now (10.4.2 at the start of Phase 0). Same library, same licence, same
  embedded cburnett pieces, and arrows still start only on right-click or Shift (read in its
  source), so the phone's draw mode stays.
- **`prototypes/` removed.** Phase 0 replaced each part with tested code: the position key
  (§4.3), the Lichess-dialect writer (§4.5) and the merge (§4.7). It is in the history at
  `469d081`.
- **D4 reads: blobs through GraphQL, in batches.** D4 has every read go through REST (ref,
  tree, raw blobs). As built, the GraphQL remote reads blobs 100 to a request, each checked
  against its SHA, and the tree is read by the commit's SHA. Reason: a device's first sync of
  a data repo with 1,000 files would be 1,000 REST requests, over GitHub's 900 points a minute
  (D4's verified limits), and minutes long. The ref stays a conditional REST read, so an idle
  sync is still one free 304. The REST remote, D4's fallback, still reads raw blobs, paced at
  10 a second. PLAN.md §4.9 (as built).

## Revision of 2026-10-06 (Phase 0 built)
- **D20: Phase 1 starts before Phase 0's live exit.** Decided by the owner, on a recommendation
  from the build session. Phase 0's code is on `main` with its tests green; what remains is live
  (the spike's re-run, the real Qchess and Lichess imports, the acceptance test on two devices).
  Phase 1 builds on the parts those tests already cover, and anything the live checks find is
  fixed in the same code either way. Phase 1 goes into daily use only after the acceptance test
  has passed. `PLAN.md` §4.11.

## Revision of 2026-10-06 (Phase 1 planned)
Phase 1 is planned in depth in `PLAN.md` §5. The technical calls made there that touch these
decisions, each with its reason (the owner's four questions are in `PLAN.md` §5.13, still open):
- **D4: a synced `settings.json` at the data repo's root,** for the training settings that change
  replayed card states (the retention) or a shared count (the daily limit of new moves, which
  both devices draw from), and the grade thresholds. Merged per field, like `study.json`. Two
  devices must replay the same events into the same states (`PLAN.md` §4.11, step 6); a per-device
  retention would break that. Per-device preferences (pace, speech, keys) stay on the device.
- **D4: the review event gains optional `w` (wrong moves tried) and `h` (hint used).** The day's
  mistakes are then read from the log on any device and after a reload, with no second store.
  Phase 0's reader keeps the line and ignores the fields, so its replay is unchanged.
- **D4: new event kinds `pin`, `unpin` and `drill`** for pinned mistakes, as the outline asked
  ("pinned mistakes as progress events"). The steps (30 minutes, 4 hours, 24 hours; three clean
  answers retire a pin) are lichessable's (`DESIGN-pinned-mistakes.md`). Older builds skip the
  kinds, and compaction keeps them.
- **D16: retry and drill don't touch FSRS.** The card was graded Again the same day; a second
  review then would count a retry as recall. mistake-lab guards the same way (`srsRecorded`).
- **D16: a never-reviewed card is taught, then recalled.** A new line is shown move by move, then
  walked again from its start with its new moves asked; that answer is the card's first review. A
  new card met on a review line is taught where it stands. Auto-play never plays a move never
  answered (lichessable's rule).
- **D3: conflicting moves in the trainer.** Both own moves are accepted. When the move the line
  expected is due and the other one was played, the trainer asks the expected one too, in the same
  position, so a preferred line can't keep its sibling due for ever (the outline's risk).

## Revision of 2026-10-06 (the owner's answers on Phase 1)
The owner answered `PLAN.md` §5.13's four questions:
- **FSRS retention 0.9**, as recommended (a synced setting, `PLAN.md` §5.2).
- **Daily use starts once `PLAN.md` §5.1–§5.8 are built** and Phase 0's acceptance test has passed;
  lichessable retires (D20) once show and grade is in use. As recommended.
- **The daily limit of new moves shouldn't hold back lines learned before.** This changes D19's
  intake ("new cards come in line by line, up to a daily limit"), so a proposal went back to the
  owner (`PLAN.md` §5.13, 1a: a "known" mark on chapters, whose moves skip teaching and the limit)
  and nothing is built on it until they answer.
- **Repertoire review should grade like Chessable's, not like mistake-lab's time-based rule.** A
  proposal went back too (§5.13, 2a: FSRS with right/wrong grades only, and a same-day learning
  step).

Phase 0's spike, run on the phone on 2026-10-05 and 2026-10-06 (`PLAN.md` §4.2): reads from the
page work from Android too; the data repo is still empty and still public, so the writes wait for
the owner to add a first commit and make it private.

## Revision of 2026-10-06 (Phase 1's follow-ups answered; the spike on the phone)
The owner answered the two follow-ups (`PLAN.md` §5.13):
- **D19's intake: lines learned before are marked known, per chapter,** and their moves come in
  without the daily limit, in a pool of their own after the day's due moves and new lines. Their
  first answer is an ordinary review, so no state is imported: D19's fresh start holds. The limit
  holds back new material only. Technical calls: the mark is a chapter header,
  `[RepworksKnown "true"]`, since chapter-level facts live in the PGN headers (`PLAN.md` §4.4);
  a whole study can be marked with one button.
- **Grades: right or wrong, as Chessable grades.** Right first time is Good, a wrong move or a
  hint is Again, and time doesn't count; FSRS still spaces each move by its own record (option A).
  A taught move comes back for its first review after a 4-hour learning step, as Chessable brings a
  new line back the same day. Technical calls: a `taught` event kind starts the step and is what
  the daily limit counts, on every device; the step is a synced setting (`learnStepHours`).
  Mistake-lab's time-based rule stays mistake-lab's, for mistakes and missed tactics (Phase 5).
- **The replay benchmark runs alone,** after the other tests (`test/perf`), as the owner agreed: it
  measures wall-clock time, and beside the simulations it lost its margin in a 4-core container.

The spike ran through on the phone (`PLAN.md` §4.2):
- **D4's write path: GraphQL, as planned,** now exercised live: it commits, and refuses a stale
  head with `STALE_DATA`. REST works too and stays the fallback. The real error shapes are in the
  fake GitHub.
- **D4's reads: a tree read by a commit's SHA doesn't give the commit's tree SHA.** The REST write
  path built on that value; it now takes the parent's tree from GitHub itself.
- **D12: puzzle-explorer-data answers the site cross-origin.**

## Revision of 2026-10-06 (the study page, as Qchess's)
- **D21 (new): the study page is laid out as Qchess's study page.** The owner's first import
  showed the Lichess-style notation of §4.11 as a wall of text on a deep chapter. The owner asked
  for Qchess's layout, replicated first and improved later, and for the explorer of Phase 2 to
  sit under the notation like Qchess's, toggleable. Qchess's page was read live on the owner's
  test account (its move list's markup and CSS, on desktop and phone sizes) to copy the rules.
  One technical call: Qchess shows its untrained lines (the repertoire side's alternatives) in
  italics; here every own move is trained (D3 lists them as conflicts), so the italics mark only
  that a branch isn't the first continuation. `PLAN.md` §4.11 (the notation and the layout).

## Revision of 2026-10-06 (the daily queue, the planner, the simulation)
Technical calls made while building `PLAN.md` §5.3–§5.5, each with its reason:
- **D19's intake: a move met on a known chapter's line is known wherever it is met.** Cards are
  per position and move (D3), and the owner learned that move in that position, so a new line
  sharing a known chapter's prefix teaches only what comes after it, and never spends the limit
  on a known move.
- **A known move's wrong first answer records a review (Again) and no `taught` event.** The daily
  limit counts `taught` events, and the owner's answer was that known lines never use it. The
  move is still shown, as after any wrong answer.
- **The queue takes the time now as well as the day's bounds.** A reviewed card is due for the
  whole of its due day, but a learning step ends at its own time: without `now`, a move taught at
  10:00 would be asked again at once rather than from 14:00.

## Revision of 2026-10-06 (the move menu and the comment dialog)
- **D21 extended: a move's edits move into a menu and a dialog, as in Qchess.** The owner found
  the editing tools under the notation too cramped on the desktop and asked for Qchess's
  right-click menu and comment popup, so the panel's room goes to the notation. Read live on
  Qchess with the owner's test account. Technical calls: the menu also opens from a ⋯ button
  (keyboard, and a phone whose long-press doesn't reach the page); glyphs apply at once and
  Cancel drops only the text, as Qchess does; the conflict boxes stay in the panel, since they
  appear only at a conflicted move and need room. `PLAN.md` §4.11 (as built).

## Revision of 2026-10-06 (the trainer and the training screen)
Technical calls made while building `PLAN.md` §5.6–§5.7, each with its reason:
- **D3: after a conflict move, the note doesn't name the other move.** The plan's wording
  ("Your repertoire also plays Nc6 here") would show the answer before it is asked; the trainer
  says the repertoire has another move here and asks it. The conflict move played again then
  counts as a wrong try.
- **D3: the session always follows the planned line.** The user only moves where the line's own
  move is asked, so after a conflict move the line's move is asked and played; the other move's
  later asks come on their own planned lines. "Follow the line played" never arises.
- **D16: a move never answered is never auto-played, even after a skipped line.** The trainer
  decides where each move is met, so a move a skipped line would have taught is taught (or, if
  known, asked) on the next line that passes it.
- **D16: a line sharing its first moves with the board starts there,** up to its first ask or
  teach, rather than replaying them at the pace: the planner orders lines so that consecutive
  ones share prefixes.
- **D16: comments are hidden while a move is asked,** since a comment on the opponent's move
  often names the reply; they show while a move is taught and after it is played.
- **D4: a suspend made during training is recorded even when grading is off** (Interactive
  view, retry, drill): it is the owner's choice about the card, not a grade.
- **D16: retry and drill ask only the mistake, and play everything else for the user,** new
  moves included: they practise one move, and teaching on the way would spend the daily limit
  outside the queue.
- **D4: a drill of the day's mistakes records `drill` events for the pinned ones,** as a drill of
  the pins does: a pin's steps count every drill answer, wherever it was drilled from.
- **D4: a mistake's line is a line through the card's first occurrence.** The review event names
  the card, not the line it was met on, and cards are per position (D3); any line through the
  move leads to it.

## Revision of 2026-10-06 (show and grade)
- **D16: show and grade is a mode of the trainer, not a second one.** `selfGrade` adds two
  commands (`show`, `tell`); the plan, auto-play and the learning step are shared, so a session
  can be run either way on the same queue. Its screen is the training screen in another mode.
- **D7: the media keys need a sound playing.** Chrome on Android routes them only to a page
  playing media, so the mode loops a second of silence built in code. A zero-length clip looped
  crashed the browser under the repeated e2e runs, which is why the clip has real samples.
- **D16: a wrong press on a move already shown grades it Again at once.** The plan had the next
  press do it; one press is what the owner means, and the two-key table keeps `next`, `next` for
  Good and anything with a `wrong` for Again.

## Revision of 2026-10-06 (the Read and Interactive views)
Technical calls made while building `PLAN.md` §5.10, each with its reason:
- **D16: the Interactive view asks every own move, suspended and known ones included,** and
  records nothing: it is practice of a line as written, apart from the schedule. It runs the
  trainer with no card states rather than a second walker.
- **D3: in the Interactive view the walk follows the user's move among the chapter's lines.**
  Training keeps the conflict rule (the line's move is asked after the other); the view has no
  schedule to protect, so the move played picks the line, as the plan asked.
- **D4: a drill event is recorded only by the drill and pin sessions.** Before, any session but
  the queue and retry recorded one for a pinned card, which would have credited a pin from show
  and grade or from the Interactive view.
- **The Read and Interactive views take a start (`from`) as well as the move naming the line,**
  so stepping back in Read and playing from there stays on the line being read.

## Revision of 2026-10-06 (the owner's testing of Phase 0)
- **D4's write path, confirmed on the desktop.** The spike ran through on the desktop (`PLAN.md`
  §4.2): the same error shapes as on the phone, G6b passing with the fix, and `persist()` granted
  in the desktop browser. Lichess's OAuth and export work from the page (D9).
- **D18: the real imports work.** A Qchess export and a Lichess study imported as expected on
  the desktop, comments and arrows included (`PLAN.md` §4.10).
- **D22 (new): studies and training as Qchess's.** The owner found Phase 0 good on both devices
  and asked for Qchess's study cards, studies made and managed on the site, and Qchess's switch
  between training a line and editing it. This adds §5.15 to Phase 1, before its acceptance
  test. Renaming and the rest already existed in a drawer under the notation, but the owner
  didn't find them, so they move where Qchess has them.

## Revision of 2026-10-06 (transposition badges and copy continuation)
Technical calls made while building `PLAN.md` §5.11, each with its reason:
- **D10: transpositions use the site's position key,** so two move orders meet whatever their
  move counters, and differ only when an en passant capture is really possible: the same rule
  cards use, so a badge never disagrees with a shared card.
- **The badge counts other move orders (`⇄1` for two paths in all),** and the chapter mark the
  other chapters; the chapter's own badge comes from the open chapter (live), the other
  chapters' from the index (as last saved), which is enough for a count.
- **Copy continuation on a main line with no fork above the move copies from the start,** the
  plan's rule read literally (no ancestor with a sibling: the branch is the whole line).

## Revision of 2026-10-06 (clickable lines and line jumping)
Technical calls made while building `PLAN.md` §5.12, each with its reason:
- **q_extension's `clParse`/`clStartFen` were rebuilt from the plan, not ported:** its source
  wasn't in the build container. The rules are the plan's, plus one fallback (a first move legal
  only from the other position starts there), recorded in §5.12 so a session with the source can
  check them against it.
- **A line preview changes nothing but the board** (the notation keeps the commented move, and
  the study's arrows are hidden): it is a look, not a navigation, so leaving it returns exactly
  where the user was.
- **In training, a preview doesn't pause the session;** the board takes no move until it ends.
  Pausing the trainer would need a new command for a rare action.

## Revision of 2026-10-06 (studies as Qchess's)
Technical calls made while building `PLAN.md` §5.15 (D22), each with its reason:
- **Qchess was read live first** on the owner's test account (its `/studies` page, a study's
  sidebar, its dialogs and the Study Mode ↔ Move Trainer handlers), and copied where Repworks has
  the same things: the cards, the study's and the chapters' ⚙ dialogs, "+ New", the browser's
  own question before deleting.
- **The drawer under the notation is gone**, since the owner didn't find it; everything in it
  is in the dialogs.
- **"Study" opens the chapter at the move on the board,** not at the trained line's end as
  Qchess does: that is where the user is, and the rest of the line is in the notation below it.
- **A session taken up after an edit is planned again from the edited repertoire,** less the
  cards it already answered. The trainer is pure and a session is rebuilt from the log anyway,
  so this is "start again" plus one filter; it gives Qchess's behaviour (the interrupted line
  again, from its start) with the edit included, and never asks a card twice in one session.
  The kept session lives per tab (sessionStorage), so a reload in the study keeps it.
- **"Train" with no session kept trains the study** (Qchess's Move Trainer trains the study);
  a reference study, which has no cards, is played from the move shown.
- **Reordering chapters is "Move up / Move down" in the chapter's dialog,** not Qchess's drag:
  it works the same on the phone.


## Revision of 2026-10-06 (the owner's first testing of Phase 1)
The owner's requests and the technical calls made building them (`PLAN.md` §5.16), each with its
reason:
- **D22 extended: training lists every line, as Qchess's Move Trainer.** The owner asked to
  browse all variations and learn or repeat any of them, due or not. Read live on Qchess first.
- **D16: a line picked from the list asks every own move, and grades only what is due.** Its new
  moves are taught and its due moves graded as in the queue; the rest are asked with no event,
  as Qchess saves nothing for a line trained before it is due. Practising ahead must not move a
  schedule, or a line repeated for fun would push its moves weeks out.
- **D19: the daily limit paces the queue, not the owner.** A picked line, "Learn" on a chapter
  and "Learn the next line" teach past it; the limit itself is now set from the site (0 turns
  new moves off), written to `settings.json`, only the fields changed, so the per-field merge
  keeps the other device's change.
- **D16: show and grade is switched in the middle of a session** (a button, and `1`, as asked),
  on the same trainer; a move tried wrong or hinted before the switch stays failed, so the keys
  can't turn a miss into Good.
- **"Study" with nothing on the board opens the study the screen is about,** rather than doing
  nothing.
- **D21: the notation's details as the owner asked:** a main-line move's cell takes the whole
  click, transposition badges are pills, and a comment's lines are bold blue with their brackets.

## Revision of 2026-10-06 (Phase 2 planned)
Phase 2 is planned in depth in `PLAN.md` §5.20–§5.28, from q_extension's source (`c26242f`),
Qchess's explorer read live on the test account, and lichessable's coverage and course-tree
designs. The technical calls, each with its reason:
- **D21: the explorer's tabs are Lichess, Masters, ChessDB and (where set) Local.** Qchess's own
  databases (Elite, CORR, 2024+, TT) are its server's, behind its login. Masters is Lichess's
  nearest to Elite; ChessDB alone shows its moves and evals where there are no games.
- **D13: the Practical column runs on the Lichess filter's data, whatever tab is shown,** as in
  q_extension; Maia's fill-in and preview are ported and stay off until Phase 3 brings the model.
- **D9: one module worker per tab owns every explorer and ChessDB request** (the panel's and the
  search's), so one limiter governs the token's bucket; burst 20 and 16 a minute (q_extension's
  own-token figures), the bucket kept in `sessionStorage` across reloads.
- **D5: the explorer cache is its own IndexedDB database, `repworks-explorer`,** with
  q_extension's TTLs (explorer 30 days, ChessDB 7, unknown positions 1), so it can be cleared
  without touching the studies.
- **`src/pe` is ported to TypeScript in `src/core/explorer`,** behaviour unchanged, with a
  provenance header naming the source commit; `test/pe.js` is ported case for case, and a
  differential check runs the port and the original on the same random inputs. The clock, `sleep`
  and HTTP are inputs, so core stays pure.
- **Clickable lines (§5.12) now follow q_extension's `clStartFen` exactly:** a line is placed by
  its number and side alone, one fitting neither position stays text, and the moves from the
  first illegal one are struck through. §5.12's fallback (whichever position the first move is
  legal in) was a guess made without the source. Kept as a difference: glyphs standing alone in
  a group don't make it a remark.
- **The local explorer's CORS change is q_extension's,** which Repworks sessions can't push to; the
  patch is written out for the owner (TESTING.md).
- **For the owner (`PLAN.md` §5.27): the course tree as a "Study" tab of the explorer panel**
  rather than lichessable's Miller columns, since a study here is already a tree. Not built until
  the owner answers.

## Revision of 2026-10-06 (the owner's second testing notes)
The owner's notes on training, planned in `PLAN.md` §5.17 (built next, before Phase 2 goes on)
and §5.18 (alternative moves, waiting for the owner's choice of storage). The calls, each with
its reason:
- **D16: auto-play becomes a setting with lichessable's modes,** at least "off" and "moves
  answered right this session" (the owner's minimum). A move answered wrong is then asked again
  on a later line, with no second grade, since a card is graded once a session.
- **Time travel shifts what the clock decides, not what it records.** Events keep the real time:
  a shifted timestamp would be synced into the real log for good, while a review made ahead is an
  early review, which FSRS models.
- **The feedback line says only what asks something of the user;** "Your move" and "Correct"
  go, at the owner's request, and the line keeps its height so the board doesn't move.
- **New per-device settings** (localStorage, like the pace): new moves shown or tried first, a
  line's end waiting or going on, where a line starts (first new or due move, auto-played from
  the start, or asked from the start), and auto-play's mode. None changes card states, so none
  needs syncing.
- **Open for the owner (§5.18): where alternative moves are stored.** Recommended: events in the
  progress log, keyed by position, leaving the studies' PGN untouched.

## Revision of 2026-10-06 (the second testing notes built)
`PLAN.md` §5.17 is built. The calls, each with its reason:
- **D16: four auto-play modes**, after lichessable's two features: `off`, `session` (lichessable's
  auto-play: a move answered right this session is played), `due` (the trainer as it was:
  answered this session, or not due in the queue) and `difficult` (lichessable's "difficult
  moves only": as `due`, but a difficult move is always asked). **`due` stays the default**
  until the owner says otherwise, as §5.17 asked. Chessable's review asks whole due variations,
  so lichessable has no "not due" rule; `due` is Repworks' own, from D16.
- **What the plan needs is decided apart from the mode**: a due move, a known move never
  answered and a move never answered are graded or taught whatever the mode says, so no mode
  can skip a due move or auto-play one never learned; every other move asked is practice, with
  no event, and a card is graded once a session.
- **Difficult = two lapses, or FSRS difficulty 7 or more** (D16's "difficult moves are FSRS
  difficulty and lapses"), or answered wrong in the session. A threshold, to be tuned from use.
- **A line starting "at its first new or due move" jumps there with one move of lead-in** (the
  opponent's move is seen), or starts where the board already is when that is further; before,
  a line not sharing the board was played from the chapter's start at the pace, which is now
  the `auto` choice. Defaults: the queue `first` (review is fast), a line picked or learned
  `auto` (the owner asked for the moves to get there).
- **The session ends at the last line's end at once, its view kept on that line,** so the board
  stays and the summary takes the buttons' place; before, two paces later with the board gone.
- **Learn holds at each line's end by default** ("At a line's end: wait"), since the owner asked
  for going on to be an option; the queue goes on by itself as before.
- **The day's mistakes are read at the real day under time travel,** since they are records of
  answers made at the real time; due moves, the learning step, the queue, the line list and the
  pins use the shifted time.

## Revision of 2026-10-06 (the local explorer's test, and repertoire coverage)
`PLAN.md` §5.25 and §5.26 are built. The calls, each with its reason:
- **The local explorer is tested from the page** (Explorer settings' Test), so Chrome's
  local-network prompt comes when the owner asks for it, not in the middle of a search. The
  `explorerdb serve` change stays q_extension's: a patch in TESTING.md, checked on a copy.
- **Coverage compares a course with the repertoire's chapters of one side** (chosen, defaulting
  to the course's), not the whole index: a Black chapter's White moves would otherwise cover a
  White course's positions.
- **lichessable's section 21 rules are kept as they are** (four divergences and unreachable, P
  over the opponent's moves, the 50-game floor, the gentle depth discount with D = 16), with one
  change: a position the explorer didn't answer leaves the gap unranked instead of truncated, so
  a report without a login never shows a probability it doesn't have.
- **Coverage's explorer requests go through the explorer worker** at a priority between the
  panel's and the Practical search's, with the panel's filter, so one limiter governs the
  token's bucket (D9).
- **Adding copies every line behind a gap from its divergence into one repertoire chapter that
  reaches the position,** as one change with an undo on the report; alternatives (a choice, not
  a gap) and unreachable lines are never added.
- **"Gaps" without a reference study is not built:** it would need an explorer request for every
  position of the repertoire where the opponent moves.


## Revision of 2026-10-06 (Phase 3 planned)
Phase 3 is planned in depth in `PLAN.md` §5.29–§5.37, from mistake-lab (its architecture
reference, engine, analysis mode and Maia code), q_extension's `tools/repgen/maia.mjs` and Maia
provider (`c26242f`), and Qchess's engine bar and Maia integration, read live on the test
account. The technical calls, each with its reason:
- **D11: the model and both engines are downloaded when first used, into a cache of their own
  (`repworks-engines`), not precached with the shell.** The shell is precached anew on every
  deploy; Maia's 60 MB (the model and onnxruntime-web's wasm) would come with each one. Maia
  asks first, as Qchess does; Stockfish (7.3 MB) doesn't.
- **Stockfish 18 lite single from npm `stockfish@18.0.0`**, byte-identical to mistake-lab's
  build, vendored with its licence. `stockfish@19.0.0` exists (a 1.8 MB lite build, another
  small net); 18 stays because it is proven on the owner's phone in mistake-lab.
- **`stop`, as Qchess and Lichess do, with mistake-lab's restart as the fallback.** mistake-lab
  never sends `stop` ("WASM crashes"); under Node the same build ends its search on `stop` and
  runs the next one. A worker that gives no `bestmove` within 3 s of a `stop` is restarted.
- **The Maia check is "the same top five, within 0.01", not "to 1e-4".** The model's weights are
  float16; onnxruntime-web and onnxruntime-node give logits up to 0.09 apart (web's own
  optimization levels differ by 0.08), the probabilities up to 0.0043 on 50 positions. The
  encoding and the policy are checked exactly, the runtimes within 0.01, and the web runtime's
  own values to 1e-6 (Node and the browser run the same wasm).
- **No move tables shipped:** mistake-lab's `all_moves_maia3.json` is q_extension's index
  formula, all 4,352 entries.
- **D21: Maia in the explorer as Qchess's** (Ml and Ms columns, Maia's moves as rows, a sort by
  Ml), its rating following the Lichess filter (q_extension's `maiaEloFor`) unless one is chosen.
- **The study page is the analysis board**; a PV is previewed as a clickable line and added to the
  chapter only by its Add. A scratch board for positions in no study comes later in the phase.
- **Neither engine runs in training, Read or Play.**
- **Threads (§5.36) through cross-origin isolation added by the service worker**, built only if
  it checks out in the container's Chromium (every cross-origin request the site makes is CORS,
  and the login is a redirect).
