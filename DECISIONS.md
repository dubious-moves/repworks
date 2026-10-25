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

## Revision of 2026-10-06 (the owner's third testing notes)
`PLAN.md` §5.38, built in a session beside Phase 3's. The calls, each with its reason:
- **§5.18's storage is answered: events in the progress log** (the owner: "fine as long as it
  works as expected"), and built: `k:"alt"` with the move in `card` (`r|<positionKey>|<uci>`)
  and `on`, the last event of a move deciding. The move in `card`, rather than separate `key`
  and `uci` fields, keeps every known event's shape (replay groups by `card`).
- **New moves gain a third way, "Show a sequence"** (Chessable's), per device like the other two,
  with its length (default 5) counting new own moves, so that "x moves" means the moves to learn
  whatever the opponent's replies between them. A sequence stops before a due move, which it
  would otherwise show, and isn't used in show and grade, whose keys already show each move.
- **A dialog closes on a click on its backdrop, through its `cancel` event**, so every dialog
  keeps one way of closing (Escape's) and one that must stay open can refuse.
- **The explorer's count column has one width per table**, from its longest count: a grid per
  row can't share an `auto` width, and a fixed width would be too narrow for Lichess's totals or
  too wide for the masters'.
- **Sessions the owner starts from the desktop app run at its effort setting**, not the repo's
  `.claude/settings.json` (`effortLevel: high`): the app passes `CLAUDE_EFFORT` to the session,
  which wins. Sessions chained by `create_session` do run at high. The owner sets High in the
  app's picker before starting a session.

## Revision of 2026-10-06 (Phase 3 built through §5.36)
`PLAN.md` §5.29–§5.36 are built. Calls made while building, each with its reason:
- **D17: cross-origin isolation is opt-in, on only while more than one engine thread is chosen
  (Threads defaults to 1).** It checked out in the container's Chromium (the threaded engine runs,
  GitHub, Lichess and ChessDB still answer), but it changes how every page loads, and the
  installed app on Android and the Lichess login under COOP can only be checked on the owner's
  devices; with it always on, the offline-start tests saw "synced" where "offline" was due (a
  Playwright emulation artefact, most likely, but not provably).
- **onnxruntime-web's non-bundled build** (`ort.wasm.min.mjs`, its 24 KB glue as an engine file):
  the default build points at its wasm in a way Vite copies into `assets/`, which the shell would
  have precached (14 MB with every deploy).
- **§5.32 and §5.33 were built together**: Maia's switch and columns are how its worker is used.
- **The explorer gives up the engine section's height** on a wide screen, so its own height still
  stays constant between moves (the owner's notes on §5.23).
- **Maia in the Practical column: the Prac title sorts first and switches to Maia's values on a
  second click**, q_extension's rule kept beside the owner's sorting titles.

## Revision of 2026-10-06 (Phase 4 planned)
Phase 4 is planned in depth in `PLAN.md` §5.39–§5.49, from lichessable (`b435906`: its storm and
puzzle designs, `content/puzzles.js`, `dev/check-storm.js` with its 1,043 assertions and the
shipped functions they execute), puzzle-explorer (`a732ead`), the dataset (`8a7ba97`, sparsely)
and Qchess's Intuition Storm lobby. The outline's open questions, settled with evidence:
- **`lichess.org/game/export` answers a web page, for simple requests only**: `GET` gets
  `Access-Control-Allow-Origin: *`, but its preflight answers 404, so no token or custom header
  may go with it. `POST /api/games/export/_ids` (text/plain, up to 300 ids) answers the same way,
  so a gather pass fetches all its games in one request with no token. The masters PGN stays as
  the fallback; the explorer that names the games needs the Lichess login (it answers 401
  without), and without one the walk invents its lines.
- **The archive's size on the phone is small; the downloads are not.** Measured on public
  repertoire studies of 537–1,092 positions in lichessable's anchor band: 489–950 index shards
  (~140–280 MB to scan), about 16,000 puzzles for the largest, whose bodies would take nearly all
  4,096 body shards (~350 MB), while the bodies kept weigh ~6 MB. So a collect scans at most 100
  shards a press, says the size first, keeps candidates only, and fetches bodies for a working set.
- **D12: the dataset's base URL is a setting**, checked by reading its `meta.json`; bodies are
  kept across rebuilds.

The technical calls, each with its reason:
- **The storm's answers are progress events (`k:"storm"`, cards `s|<positionKey>` and
  `z|<puzzleId>`), as the outline said; the gathered positions and collected puzzles stay on
  each device** (D5's cache tier). They are third parties' answers and rebuild anywhere; the
  events carry what must cross devices (done, missed, the record), and no new file kind enters
  the data repo. A per-device store file is the step after, if gathering on the phone is too slow.
- **lichessable's rules and numbers are ported as shipped** (five win% bands, flat penalties,
  the streak, the pick and stop rules, the draw order, the set, the anchor band), with
  `check-storm.js`'s assertions and controls; its Chessable plumbing (cards, wire, host
  permissions) is replaced by the repertoire index and the progress log.
- **ChessDB scores the walk with Stockfish on a miss; stored positions are re-scored by Stockfish
  (MultiPV 12, depth 20) when idle**, because ChessDB's best move measured optimistic
  (lichessable §23.1). Never `queue` or `store` (D9).
- **The storm is its own screen** (`#/storm`), with the repertoire, a study, a chapter or a
  position as its scope; no engine or explorer while a card is up.

## Revision of 2026-10-07 (Phase 4 built through §5.41)
`PLAN.md` §5.39–§5.41 are built: the storm's rules in core with `check-storm.js`'s assertions,
the sources over the repertoire's chapters, and the answers as progress events. Calls made while
building, each with its reason:
- **Misses go to the back of the deal** (lichessable §14.15), not to the front as the plan's first
  draft said: hardest-first opened every session with the same handful of failures and starved the
  positions never seen. The plan is corrected.
- **The frontier and re-entry use the site's position key** (D10), where lichessable used the FEN's
  first three fields: the same positions, with en passant only when it is legal.
- **The controls are re-run on the port**, each mutation failing exactly the assertions its test
  file's header names: a port that only passes proves less than one whose tests are seen to fail.
- **`storm` stops being the tests' example of an unknown kind** (`future` instead, in the fixture
  data repo too), since the log now knows it.

## Revision of 2026-10-07 (the storm and puzzles built, §5.42–§5.48)
Calls made while building, each with its reason:
- **One game export per line end, not one per gather pass.** A line end's games are walked as soon
  as they arrive, so a gather stopped early has kept what it found; the export is still one
  request for all of a line end's games, sent with no token. Batching a whole pass would hold every
  position back until the last explorer answer (minutes, at the explorer's rate).
- **"Storm from here" names a chapter's move** (`#/storm/<sid>/<cid>?at=…`) rather than a FEN: the
  lines through it are then the chapter index's, found with no search.
- **The storm has its own Stockfish client** over the same worker build and search lifecycle: its
  screen shows no engine panel, and it asks one position at a time and waits for the answer.
- **Stockfish's re-scoring is on by default on a wide screen, off on a narrow one** (a minute per
  position at depth 20 is the desktop's job; the phone's grade then keeps ChessDB's one-request
  child tier).
- **An answer's chapter is its position's first line's**, for the record by chapter: a position past
  converging lines belongs to several chapters, and one is enough to place it.
- **Puzzles: Collect asks twice and says the size on the first press** (lichessable §12.7's two
  presses): it is the one control that can spend hundreds of megabytes. The share defaults to 25%
  once puzzles are ready (lichessable's 0 was a guess, and a feature collected on purpose is meant
  to be met); nothing is asked of the dataset before Collect.
- **A puzzle accepts any mate as well as the solution's move** (Lichess's own rule for puzzles
  ending in mate), and its opponent's replies are played after 0.4 s with the clock stopped.

## Revision of 2026-10-07 (Phase 5 planned)
Phase 5 is planned in depth in `PLAN.md` §5.50–§5.66, from mistake-lab (`c525403`: its
architecture reference in full, `index.html`'s game loading, extraction, SRS and Gist code, and
`analyzer/analyze.js`). Settled with evidence:
- **Lichess's game export answers a web page**, with or without the login (`200`,
  `Access-Control-Allow-Origin: *`; preflight `204` allowing `Authorization`), checked live.
  **chess.com's could not be checked** (this container's proxy refuses it; third-party reports say
  it doesn't answer other origins), so chess.com games come through the analyzer; the owner's
  browser settles it (TESTING.md).
- **The game data's size on the phone is small**: 4.3 KB a game in the analyzer's shape (about
  5 MB for 1,000 games), 0.9 KB in the compact form kept on the device, measured on 200 of the
  owner's public Lichess games.
- **Reading a gist needs no token permission** (github/docs `8794b3c`: the fine-grained Gists
  permission covers writes only), so the Gist is read with the gist's ID; mistake-lab's own page
  reads its raw files cross-origin every day.

Asked of the owner (D5's open point, a format the owner's data would be written in): **where the
analyzer's output lives once mistake-lab retires**, (a) the data repo, `games/<YYYY-MM>.jsonl`
written by a converter run after the analyzer (recommended), or (b) the Gist, read-only. Until the
answer the site reads the Gist, which the migration needs anyway (§5.66 waits).

The technical calls, each with its reason:
- **D5: games are derived data on each device**, rebuilt from their source; only what is done with
  them is synced, as progress events.
- **Game cards are `m|<pid>`, with mistake-lab's pid verbatim; plan cards `p|<key>`** re-keyed
  through `positionKey` (D10): the migration maps game cards one to one.
- **mistake-lab's grades, thresholds and numbers are ported as they are** (the 10-point mistake,
  the advantage rules, the grade bands, the recidivism gates, weak spots' 50% over 5 games, the
  checklist's presets), with its per-game counts as the extraction's test.
- **New event kinds**: `snapshot`, `drop`, `relapse`, `plan`, `dismiss`, `saved`, `played`,
  `practice`. A snapshot is applied only to a card with no review before it, so the site's own
  reviews win over a migrated state.
- **D15 changed in one detail: custom deviations become a repertoire study** ("From mistake-lab",
  a chapter per position), not events: a move to play is repertoire content and the site owns the
  studies (D3); its cards start new (D19). Dismissals and plan enrolments stay events.
- **A daily limit of new game cards** (10 by default): mistake-lab's queue had none, and its whole
  backlog would arrive on the first day.

## Revision of 2026-10-07 (Phase 5 built through §5.55)
`PLAN.md` §5.50–§5.55 are built. Calls made while building, each with its reason:
- **The extraction is tested against mistake-lab's own code**, not a reading of it: its
  `extractMistakesForGame` and advantage pass, cut out of `index.html` and run in Node, produced
  the expected items for the fixture games, and the port matches them item for item.
- **Items are extracted in memory per game, not stored**, and the repertoire's moves are left out
  afterwards (mistake-lab's own post-filter when its trie loads late): a sync that changes the
  repertoire then costs no re-extraction. 1,000 games extract in 0.8 s in Node.
- **The Gist is read without a token** (a secret gist's ID is enough, and a fine-grained token's
  Gists permission is for writes only), so Games needs no new token; the migration (§5.64) asks for
  one once, as D15 says.
- **A tactic's optional lines are not asked** (those leaving a solved line at the user's own move:
  mistake-lab's "Find a stronger move", outside its grade).
- **Advantage cards wait for practice (§5.57)**: they are counted on the session's last screen and
  left out of it, rather than shown as a card that can't be played yet.
- **The timing tests take the best of nine runs, not three.** In a fresh container the same code's
  replay took 197–244 ms from run to run, and the commit before Phase 5 failed the 200 ms limit as
  often as this one; the least of more runs is what the code costs. The limits are unchanged, and
  Phase 5's replay kinds are folded out of the loop's line so it is as small as before.


## Revision of 2026-10-07 (Phase 5 built through §5.63)
`PLAN.md` §5.56–§5.63 are built (§5.66 waits for the owner's answer; §5.65's acceptance test is in
`TESTING.md`). Calls made while building, each with its reason:
- **mistake-lab's own code is each part's test**: its functions are cut out of `index.html` and run
  in Node in a sandbox that turns its UI into no-ops (`test/fixtures/games/mistake-lab-sandbox.cjs`),
  on cases made for each rule; their answers are recorded in the fixtures and the port must give the
  same (the sequence check, the opponent's picks, the advantage drill, the review, deviations, gaps,
  recidivism, weak spots, the checklist's generator, the voice matcher). A reading of 30,000 lines
  misses details a run doesn't.
- **Deviations and weak spots walk every game**, where mistake-lab walks only the games that gave it
  an item (its games list drops the rest first): a game played without a mistake is still a game
  played. The counts beside mistake-lab's differ by those games (TESTING.md says so).
- **Practice judges each move at the game trainer's depth** (18, 16 on a narrow screen), not
  mistake-lab's silent depth 22: one search a move, in the background, so the phone isn't kept
  busy; an advantage drill waits for each judge, as mistake-lab's does, so a collapse ends it.
- **Plan cards are new cards like the others**: the daily limit of new game cards counts them
  (mistake-lab had no limit at all); their content is every study's comments at the position,
  so the migration's Notes study is read too.
- **Checklists are kept on the device that made them**, as regenerable definitions (mistake-lab's
  are too); the exclusions (`drop` on `c|<leafKey>`) and the results (`practice` with the preset)
  are synced, so a checklist made again on the other device shows the same progress. A checklist
  drill stopped counts nothing.
- **Two small fixes over mistake-lab, on purpose**: a castle that gives check is matched and spoken
  as a castle by voice input; the game trainer's board sends castling as standard UCI, as the
  analyzer's lines and Stockfish write it.
- **What is left of mistake-lab** (an audit of its reference against what was built) is in `PLAN.md`
  §6, built before it retires: none of it needs the owner.

## Revision of 2026-10-07 (the engine line after a move, PLAN.md §6 item 1)
- **mistake-lab's engine line is ported from its code, not its reference**: run in Node on ten cases,
  its states after every step are the port's test. Where the two disagree the code wins: stepping
  back into an alternative's shared start stays in the alternative (the reference says it returns to
  the main line).
- **The line uses the trainer's depth (18, 16 on a narrow screen)** for branches and extensions, not
  mistake-lab's adaptive 16–22 and its depth-22 prepared extension: one engine client, the phone not
  kept searching.
- **Left out**: starting a line by moving an opponent's piece (mistake-lab's own issue #23 is open on
  it) and Copy as PGN; promotions in a branch are the user's choice, where mistake-lab always queens.

## Revision of 2026-10-07 (practice: resume, premoves, the repertoire check, the hint; §6 item 2)
- **The repertoire check runs in every game practised from a position** (from a game's move, after a
  mistake card, from the analysis board), not only mistake-lab's filter practice: the site has one kind
  of practice game, and the check only asks before ply 20 where the repertoire has a move.
- **A move taken back is kept with the game, not added to the Repertoire check**: mistake-lab saves it
  as a custom deviation, which the migration turns into repertoire content (D15's revision); a move
  the user got wrong while practising isn't repertoire content. The review and the history entry show
  it ("corrected: you first tried e6").
- **The game in play is kept in this device's storage** (`repworks-practice-game`), not synced: it is
  a game in progress on one device, as mistake-lab's is; four hours, two moves, as mistake-lab's.

## Revision of 2026-10-07 (tactics detected after a practice game; §6 item 3)
- **The scan runs after every practice game**, not only after mistake-lab's silent ones: every move
  here is judged in the background already, which is what mistake-lab's detection rides on.
- **The scan uses mistake-lab's depth (20, one less on a phone) with five seconds a search at most**,
  on the same Stockfish client as the judges, one search at a time; a tactic walk is a few dozen
  searches, so a phone gives it a minute or two in the background while the review is read.
- **Detected tactics live with the game just ended**, as mistake-lab's do (its candidates are on the
  live line, not in the history); a saved one is a `saved` event, drilled in the game cards.

## Revision of 2026-10-07 (the games' own explorer; §6 item 4)
- **The opening index is built when first needed** (the explorer opened, or a practice game titled),
  from the games in the date filter, and kept until they change; mistake-lab builds it in timed batches
  in the background. A thousand games replay in well under a second on a desktop; the phone pays it
  once a session, only if the explorer is used.
- **The explorer filters the Games list** while it is off the start, practice games included (they are
  in the list too); the colour filter is the list's.

## Revision of 2026-10-07 (Hide time trouble; §6 built)
- **"Hide time trouble" leaves the mistakes out of the game cards too**, not only the list's counts, as
  mistake-lab's filter does (its queue is its filtered list); the cards come back when it is off.
- **§6's list of what was left of mistake-lab is built**: mistake-lab can retire once the owner's
  checks pass (§5.65), its analyzer staying until §5.66's answer (D8).


## Revision of 2026-10-07 (GitHub's GraphQL failure)
- **A GraphQL request GitHub fails on is made again through REST at once** (D4): its untyped
  "Something went wrong while executing your query" (the owner's phone, after a while of editing a
  study) is most often its GraphQL time limit, which the same large commit meets again on every
  retry. The commit goes through REST's tree, commit and fast-forward-only ref update from the same
  parent, so a GraphQL commit that landed after all refuses it as stale and the next pull adopts
  the first; a blob query that failed is read through REST. GraphQL stays the default write.

## Revision of 2026-10-07 (Quiz from here, Practise from here, Collect all)
- **"Play from here" is "Quiz from here"** (the owner's naming): "Play" read as a game against the
  database or an engine; the view asks the line's moves. "Practise from here" is the game.
- **Collect has an all-at-once button.** The 100-shard bound was a phone-driven default, not a
  desktop limit; both buttons are on both devices, the plain one still the cautious default.

## Revision of 2026-10-07 (prioritize a study and paused lines, planned)
- **A line is paused, not a move or a position** (the owner's answer): the unit the owner sees in
  the line list. The mark is a `line` event in the progress log (the owner's answer), naming the
  line's path. It also covers the line's later extensions, so editing a paused line doesn't revive
  it.
- **A card is held back only when every line through it is paused**, in every study. Cards are
  per position and move (D3), so a move shared with an active line has to stay trained. Pausing
  is not suspending: a suspended move is played for the user, while a paused line is not trained.
- **"Critical" is how hard the moves are to find, plus the owner's must-learn mark.** The owner's
  own games are left out, since the owner learns a repertoire before playing it.
- **The ranking is greedy by marginal value, not the script's d'Hondt slots.** A line's value is
  its reach times the chance of leaving the repertoire along it, counting only moves not covered
  by a line taken before it. Unlike d'Hondt, this accounts for moves already known and how hard a
  move is, and it gives "the next N" directly. The checklist (§5.62) keeps d'Hondt.
- **Prioritizing keeps lines already learned, and further lines come in by hand** (the owner's
  answers): a ranking never stops reviews the owner didn't give up, and nothing is unpaused
  without a press.

## Revision of 2026-10-07 (prioritize a study and paused lines, built)
- **Maia fills a thin explorer for the reach as well as for natural moves**: deep in a line the
  explorer has a handful of games, and Maia's guess is better than shares from noise.
- **Gaps only where the study answers some reply**: at a line's end every reply is uncovered by
  design, so listing them would bury the real holes.
- **A paused line picked from the list shows its never-learned moves as new moves** (nothing
  recorded), rather than asking moves the owner has never seen.

## Revision of 2026-10-08 (the storm after the owner's first test, PLAN.md §5.71)
- **The deal is spread over line ends, as lichessable's is (§30, §30b)**: the port had left the
  spread out and sorted on the raw reach, which dealt one line end's positions in a row. The reach
  is a bucket again, and the recent window is kept per device (localStorage), not synced: which
  lines this device dealt last is neither expensive nor useful to another device (lichessable kept
  it local for the same reason).
- **The gather walks one game at every line end before the rest** (a departure from lichessable,
  whose gather walked four games at a time): what a gather costs is the same, and one stopped early
  covers the repertoire rather than a corner of it.
- **Analyse goes to the analysis board with the session kept**, rather than a board inside the
  storm as lichessable's: repworks' analysis board already has the engine, the explorer, Add to a
  chapter and practice, and a second board would drift from it. The session is let go as soon as
  the page goes anywhere but the storm and that board.
- **A storm's verdict can be paused** (not in lichessable): the clock is stopped between cards
  anyway, so a position looked at for longer costs nothing.

## Revision of 2026-10-08 (a left click clears drawn arrows)
- **A left click clears drawn arrows wherever arrows are drawn** (the owner's request), reversing
  PLAN.md §4.11's "shapes change only by drawing". chessground's own rule decides what clears: a
  press that neither picks up a piece that can move nor plays the selected one, so moving a piece
  never clears. In the editor the cleared arrows leave the study as an edit, undone by Ctrl+Z, as
  on Lichess; a storm card's sketch is cleared; on boards whose arrows aren't edited (Read, the
  trainer, a game's review, practice) it clears what was drawn over them, while the study's arrows
  and the engine's stay, being content rather than drawing. Where no move can be made, a press on
  any piece clears too. Draw mode on a touch screen
  keeps a tap for circles.

## Revision of 2026-10-08 (Stockfish 19 as an option, PLAN.md §5.75)
- **Stockfish 19 (npm `stockfish@19.0.0`, lite) is an option beside 18, chosen per device in the
  engine settings; 18 stays the default** (the owner's request). 2026-10-06 kept 18 alone because
  it was proven on the owner's phone in mistake-lab; that still holds for 18, and 19 is not yet
  checked there, so it is offered rather than swapped in. The choice is a device setting, as the
  threads are, and the other engine client (the storm, practice, reviews) follows it.

## Revision of 2026-10-08 (the queue waits at a line's end too)
- **"At a line's end: wait" holds the day's queue and show and grade too,** not only Learn (the
  owner's report: set to wait, review still went on by itself). Reversing §5.17's "the queue goes
  on by itself": with "go on" the queue goes on after two paces as before; with "wait" (the
  default) its lines end with "Line done · Next: …" and "Next line" (2 in show and grade). A line
  picked from the list is unchanged.

## Revision of 2026-10-08 (the owner's notes: repetitions, mistakes asked again, ←, PLAN.md §5.77)
- **A line learned is walked twice, and a mistake is asked again at the line's end until right
  twice in a row, by default** (the owner's numbers), both per-device settings beside §5.17's.
  Neither grades anything again: a card is still graded once a session (§5.6), so the later passes
  and the retries are practice and FSRS sees one answer, as Chessable's repetitions don't count
  either. Show and grade does neither: a move shown can't be found again.
- **A drill's misses come back until right** (retry, drill, the pins); a pin's `drill` event still
  records the first answer only, so its steps (§5.8) are unchanged.
- **← goes back to where the page was opened from**, reversing each screen's fixed parent (the
  studies, the games, the chapter): the browser's own history, stamped per entry, skipping the
  page's own entries (a study's chapters, training's lines, the storm's scopes), so one press
  leaves the page. A page opened from outside the app keeps its parent. Within the storm, ← still
  ends a live session first: it is the storm's way out, and its review is the session's end.
- **The storm's session is kept on any page while its clock is stopped**, for the entry it was
  started on (revising §5.71's "let go as soon as the page goes anywhere but the storm and that
  board", which lost it on Practise from the board, say). A storm opened anew starts afresh, as
  before. The practice game and the game cards' session are kept the same way.
- **The analysis board takes the side it was opened from** wherever a page opens it, and Practise
  from it plays that side; a FEN set up on the board still turns it to the side to move.
- **Maia's worker ended for being unused is `idle`, not `off`**: its columns stay and the next ask
  starts it again (the owner's report: the columns vanished until Maia was switched off and on).

## Revision of 2026-10-09 (ChessDB's answers on the panel kept fresh)
- **The panel asks ChessDB again for a cached answer over an hour old**, after showing the cached
  one at once (revising D5's ChessDB TTL for the panel only). The owner's report: a position
  showed Nd5 alone as ChessDB's move from a cached answer, while ChessDB itself had since added
  Qh5+ and Bc4 at 0.00. ChessDB keeps learning, and one request per position looked at is cheap;
  the searches keep the 7 days, since they ask hundreds of positions. A failed refresh keeps the
  cached answer up.

## Revision of 2026-10-09 (training: every move asked, the arrows at the end, Read in a session, PLAN.md §5.78)
- **"From the start, asked" asks every own move of the line, on every pass**, whatever the
  auto-play mode (revising §5.17's `ask`, which asked the prefix only and let the mode decide after
  it). The owner's report: with it on, a line's repetition was almost all played for them. Only a
  suspended move is still played: suspending is the owner's own "always play this for me".
  Grading is unchanged (a card graded once a session, only when due).
- **The study's arrows show at a line's end**, not before: before the end an arrow could give a
  move away, as comments could.
- **Read is available within a session**, in its place on the screen; the session waits (a move
  due to be played is held) and goes on where it was.

## Revision of 2026-10-09 (the board's size, PLAN.md §5.79)
- **The board's size is the owner's, dragged from its corner, and one for every page** (study,
  training, practice and the rest of the training layout), kept per device. The default is as
  large as fits on every page: training and practice lose their 640 px cap and fit the window's
  height as the chapter view does, so the boards match before anything is dragged. Per device,
  not synced, because the right size depends on the screen.

## Revision of 2026-10-10 (a storm move judged at depth 20, PLAN.md §5.80)
- **A storm move is judged by Stockfish at depth 20 or by ChessDB, never by the walk's depth-14
  list** (the owner: depth 14 is not good enough to judge a move). A card whose stored list is
  below depth 20 is graded by two fresh searches at depth 20 (the phone too, was 18), 8 s each at
  most. The walk keeps depth 14 for finding positions, so gathering is no slower.

## Revision of 2026-10-10 (a set's look-ahead, PLAN.md §5.81)
- **A set deepens its own cards while the user thinks** (the owner's request): the card on the
  board, then the rest of the six, to MultiPV 12 at depth 20, stored as the home's deepening
  stores them. A move pre-empts it, so the grade is never slower for it.

## Revision of 2026-10-10 (Maia in the storm, PLAN.md §5.82)
- **Maia rates the storm's positions in the background, never during a card** (the owner asked
  for a difficulty per position and an unintuitive storm without slowing the storm): about a
  second a position at six ratings, while the storm's home is open, kept with the position on the
  device. A session deals at once from what is kept.
- **The difficulty is a rating**: where Maia finds a good move (great or good) half the time,
  between 1000 and 2600. **Unintuitive** means Maia's likeliest move at the user's Maia rating is
  an inaccuracy or worse (it would not count as found), judged only by a list that may judge a
  move (§5.80).
- **No new field in the progress log**: an unintuitive storm's answers are ordinary `storm`
  events.

## Revision of 2026-10-10 ("Train" from the study, PLAN.md §5.83)
- **"Train" in a repertoire study selects the line shown and waits** (the owner: it should land on
  the variation browsed, the topmost at a fork, and not start a review by itself). Was: the
  study's queue started at once, from its first chapter's lines. A session left for the study is
  taken up again only while the move shown is still on its line.

## Revision of 2026-10-10 (Stockfish alone judges a storm move, PLAN.md §5.84)
- **A storm move is judged by Stockfish only, never by ChessDB** (the owner, as in lichessable).
  Was (§5.80): ChessDB's list, or Stockfish's at depth 20. Why: ChessDB gives no depth, and the
  moves outside its analysed book are computed on the spot, so a shallow score can't be told from
  a deep one. ChessDB still finds positions in the gather. Maia's difficulty and the unintuitive
  storm follow: they need a Stockfish list of depth 20 or more.
- **The deepened standard is depth 24 on a desktop, 22 on a phone** (MultiPV 12; was 20), searched
  while the user thinks, in a timed storm as in a set; a search stopped by the move is kept if it
  reached 20. A list of 20 or more still judges a move.
- **The storm's Stockfish runs on the device's chosen threads**, as the study page's does (it ran
  on one).

## Revision of 2026-10-11 (the card panel into the move's menu, PLAN.md §5.90)
- **An own move's training card lives in its move menu, not a panel** (the owner: the panel was
  tiny and not resizable). Was (§5.7, §5.18): a panel under the notation with the card's state,
  the suspend toggle, "Add alternative…" and the alternatives' ✕.
- **The move menu loses Copy FEN and Read from here; Analyse, Storm, Practise and the plan card
  move to the study's ☰ menu**, acting on the move shown (the owner's request, to make room).

## Revision of 2026-10-11 (a note on a game card, PLAN.md §5.91)
- **D4: a new event kind `note`** on a game card (`m|<pid>`): `text`, the card's note as one PGN
  comment (words, `(…)` lines, `[%csl …][%cal …]`), the latest winning and '' removing it. Why an
  event and not a field of the saved item: a game's own mistakes have no `saved` event, a note is
  edited after saving, and older builds skip a kind they don't know. Shown only after the card is
  answered (the owner's choice).

## Revision of 2026-10-11 (a desktop layout trial, PLAN.md §5.92)
- **D21 on a wide screen: the board in the page's middle, between two sides of one width,** and
  the study and the training screen sharing that frame, so the board keeps its place on
  Study ↔ Train (the owner's request). Was: the chapter list 220px and the panel a third of the
  width, the training screen its own grid. The board pages keep to a centred 1600px column, the
  installed desktop app has no top bar, and the sync status moved to the footer, quiet unless
  something is wrong. A trial, for the owner to judge.
- **Second round, the same day:** the eval bar left of the board, Chess.com's width with its
  number, the chapter list filling the rest of its side but only as tall as its chapters (a
  280px list with empty room before the board was tried first and dropped); the explorer's counts short (k, M, B), its columns
  each hideable (a per-device setting), Move and Eval narrower.

## Revision of 2026-10-11 (the study page, option B, PLAN.md §5.94)
- **D21 from 1150px: the engine and the explorer left of the board, the notation alone on its
  right as running text, and the chapter picked in the head with ‹ ›** (the owner's choice of two
  designs). Was (§5.92): the chapter list on the left, the engine, notation and explorer stacked on
  the right in three scrolling boxes, and Qchess's two-column move table. Why: the list left most
  of its side empty while the notation, the page's main work, had the least room. Under 1150px
  nothing changed. The board stays resizable.

## Revision of 2026-10-11 (the owner's notes on option B, PLAN.md §5.95)
- **⏭ is back in the study's move bar** (the owner's request), reversing §5.89's removal.
- **The move shown's comment gets a panel under the board on the stage, where the board leaves
  room**, for reading; the notation still shows it in place. "+" New chapter returns to the
  stage's head (§5.88 had it in ☰ only); the phone's stays in ☰.

## Revision of 2026-10-12 (clickable lines: words, null moves, ↓, PLAN.md §5.96)
- **D21 / §5.12: a line may hold words.** A group starting with a move number and a move is a line;
  words after a move are text, and the line goes on at the next move number. Was: any word made
  the group a remark (q_extension's rule). Why: the owner writes explanations inside a line, and
  resuming only at a number keeps squares and moves named in the words from being played.
- **`--` is a null move in a comment's line**, played as a pass and never out of check, so a plan
  shows one side's moves in a row. Stepping through the line passes over the passes (the owner's
  note), so each → shows a move of the plan.
- **↓ on a move whose comment has a line enters it**, ahead of ↓'s next variation, and ↑ ↓ move
  between the comment's lines; ↑ on the first leaves. The owner asked for "like selecting a
  branch"; the variation stays one ← → away.

## Revision of 2026-10-12 (lines from the comments quizzed in review, PLAN.md §5.98)
- **D16 / §5.12: the clickable lines in comments are quizzed in review**, on the main board at a
  review walk's end, as the walk's mistakes are retried: only lines starting with the opponent's
  move, none where an own move is marked `?`, `?!` or `??`, a first move marked `!` or `!!`
  important (the owner's rules). Practice only: no grade, no event, so the progress log's format is
  unchanged and the lines come back with the moves around them. Why the main board: one board to
  play on, with the trainer's pace, keys and arrows. Why a chip rather than a popup: the owner
  found popups coming and going annoying; the chip only appears and grows, and shows the small
  boards when asked. Grading the lines as cards of their own is left to the owner (a data format).

## Revision of 2026-10-12 (lines from the comments: "Quiz now", "Quiz lines", PLAN.md §5.99)
- **§5.98's quiz at a walk's end no longer starts by itself**: the line's end waits for "Next
  line" or "Quiz lines" whenever lines from the comments are left to quiz, and each line can be
  quizzed at its comment by "Quiz now" on the chip's card, the walk resuming where it was. Why:
  the owner's request; the quiz is practice, so the user decides when it is worth the time. The
  walk's move asked keeps its wrong moves and time across the quiz, so its grade is unchanged.

## Revision of 2026-10-12 (kinds of storm position and the focus, PLAN.md §5.100)
- **The storm gains a focus over tags, not a storm per idea**: the unintuitive storm (§5.82)
  becomes one of twelve chips in three groups (hard for you, the move, the situation), any chip of
  a group matching and every group chosen having to. Why: the owner asked for important decisions,
  only moves and positional decisions; as tags they combine ("Critical + Quiet"), and each is
  worked out from the list and Maia's policies already kept, so it costs no request.
- **The gather keeps positions the classic storm refuses**, with a `kind` on the stored position
  (only, punish, hold, convert), and one more request after an opponent's error. The classic storm
  and set never deal them, so they stay as they were. The kind is on-device cache data (D5's
  cache tier), not in the data repo; answers are ordinary `storm` events.
- **The classic storm deals last the positions Maia at the user's rating finds easily** (85% of the
  time). Why: they are mostly wasted cards; kept rather than dropped, since they feed the streak.
- **Questions other than "find a move"** (two moves, who's better, what's the threat) are planned
  in §5.101 for the next session.

## Revision of 2026-10-12 (storm positions shared, and an overnight gather, PLAN.md §5.102)
- **The gathered positions are shared through the data repo, revising the revision of 2026-10-07**
  ("stay on each device", D5's cache tier): each device writes those it gathered to
  `storm/<dev>/<YYYY-MM-DD>.<k>.jsonl` (a new file kind in format 1, written only by `<dev>`, one
  JSON position a line), and merges the other devices' files into its store. Why: the owner wants
  to gather overnight on one device and play the storm on another; that revision named a
  per-device file as the step after. Through the ordinary sync rather than a separate upload
  because the sync already handles offline, stale heads and lost answers; a device's own folder
  needs no merge since only it writes there. Files by the day gathered so a night's positions
  leave earlier files as they were (the repo's history grows by what changed). The format number
  stays 1: an older app classifies the files as `other` and leaves them alone.
- **A cleared position stays cleared on that device** (a tombstone with the time) unless another
  device gathers it again; other devices keep their copies. Why: Clear is per device, and a
  position that came back at the next sync would make it look broken.
- **`storeMax` 4,000** (was lichessable's 900), the done positions out first. Why: a night over the
  whole repertoire gathers more than 900, and evicting unseen positions oldest-first would throw
  away the start of the night.
- **An overnight gather walks older games through the explorer's `until`**, four months back a
  pass, 13 passes. Why: the explorer names at most four top and four recent games per position, so
  a second pass with the same filter finds nothing new; an older window names other games.

## Revision of 2026-10-12 (focused scoring, PLAN.md §5.103)
- **The storm's deepening may run an engine a core** ("Focused", per device, off by default):
  `hardwareConcurrency − 1` single-threaded workers, at most 16, each on a position of its own,
  64 MB of hash each. Was (§5.84): one worker on the study page's threads, 32 MB. Why: the owner
  saw the computer at half its CPU while positions waited; independent positions in parallel scale
  with the cores better than one search on many threads, and need no isolated page. Sessions keep
  the one engine. MultiPV stays 12.

## Revision of 2026-10-12 (the deepening's progress, PLAN.md §5.104)
- **A deepening search runs up to 120 s** (was 60 s), the look-ahead's too. Why: the owner asked;
  at MultiPV 12 a position takes about 19 s a thread at depth 20 and more at 24, so a minute cut
  slow devices short of the target.
- **The storm's home shows the deepening's progress** (the run, each engine, the last positions)
  and the console logs it. Why: the owner wants to see what the re-scoring is doing.
- **300 s, not 120 s** (the owner, the same day): 120 s still left positions short of the target
  depth, and they would rather the deepening be slow than the depths uneven.
- **600 s, not 300 s** (the owner, the same day): 300 s still left some short.

## Revision of 2026-10-12 (overnight scoring, too easy, PLAN.md §5.105)
- **With Focused on, an overnight gather scores every position before its next pass.** Was
  (§5.102): scoring between passes for as long as the pass took. Why: the owner prefers every
  position scored to more passes. Without Focused the time share stays (one engine would rarely
  finish).
- **A position Maia at the user's rating solves 95% of the time or more is never dealt** (kept in
  the store). Why: the owner's call, 95% their suggestion; 85% stays "easy, dealt last".

## Revision of 2026-10-13 (review lines to their end, every first answer graded, PLAN.md §5.106)
- **A move reviewed before is graded the first time it is asked in a session, due or not.** Was
  (§5.78, 2026-10-09): asked moves not due were practice, ungraded. Why: a miss on such a move is
  evidence of forgetting and was lost; Chessable's Overstudy counts it too. The owner chose that
  right answers count as well (option B over A), so a line's moves come due together. A move in
  its learning step is still graded only when due.
- **Review lines go past their last due move to their end** (short of a move never answered).
  Was (§5.4): a review line ended at its last due move. The owner sees value in the cut (a hard
  move at ply 12 can make the rest obvious); noted in §5.106 for later, not built.

## Revision of 2026-10-13 (auto-play `session`: the latest answer counts, PLAN.md §5.107)
- **A miss answered right later in the session is played again in `session` mode, a mistake
  retried included.** Was (§5.77): a mistake retried stayed a mistake for auto-play, so the move
  was asked on every line for the rest of the session. Why: the owner's request; a right answer
  after the miss shows the move is known again. `difficult` keeps a missed move asked.

## Revision of 2026-10-15 (pin while retrying, learning's mistakes, no arrow, PLAN.md §5.110)
- **A move played for the user never shows an arrow first.** Was (§5.6): a move in its learning
  step got its arrow before being played. Why: the owner's request; it read as a green arrow
  flashing during auto-play.
- **A new move played after a wrong move or Hint is a mistake retried at the walk's end** (§5.77
  applies to learning too). Was: a taught move always counted as right. Why: the owner's request.

## Revision of 2026-10-16 (Analyse on every board, PLAN.md §5.112)
- **A timed storm card can be analysed: it is passed** (no points, the streak ends, the clock
  stops). Was (§5.71): Analyse only in a set, or between a storm's cards. Why: the owner's request,
  Analyse wherever a board is shown, "even when they are being quizzed on storm positions".
- **The analysis board goes back to any page it was opened from**, not only the storm, and a
  training session waits for its history entry whenever it is left, as the storm's did. Was: a
  training session ended as soon as its screen went. Why: the same request, "make sure going back
  and forth is working".

## Revision of 2026-10-16 (auto-play set apart for the queue and for Learn and a line picked, PLAN.md §5.113)
- **D16: two auto-play settings, the queue's and Learn's and a line picked's; the latter `off` by
  default.** Was (§5.17): one mode for every session, `due` by default. Why: the owner's request,
  auto-play on in review and off when learning or picking a line, at once.
- **D16: "A line starts" says only where the board starts** (first new or due move, or the start);
  the auto-play mode decides every move from there. Was (§5.17): from the start, the moves before
  the first need were all played ("played") or all asked ("asked"), whatever the mode. Why: the
  owner's report, a move never answered auto-played with "answered right this session".
- **D16: a line picked has no rule of its own** for moves not answered (§5.16's `practice` goes):
  its auto-play setting decides. Why: with its own setting, the rule only overrode it.

## Revision of 2026-10-16 (review chapters weakest first, PLAN.md §5.115)
- **The planner orders review lines by chapter, the chapter whose weakest due card has the lowest
  predicted recall first; within a chapter, tree order as before.** Was (§5.4): all review lines in
  the index's order (studies by name, chapters in study order). Why: the owner's request to order
  chapters by their due lines, settled with them on recall instead: a session stopped early then
  leaves the safest moves for later. New and known lines keep the index's order.

## Revision of 2026-10-17 (too easy counts great moves only, PLAN.md §5.117)
- **Too easy: Maia at the user's rating finds a great move (under 3% win given up) 95% of the time
  or more.** Was (§5.105): a great or good move (under 6%). Why: the owner's request, stricter, so
  fewer positions are left out. Easy (85%) and the card's share still count great and good.

## Revision of 2026-10-17 (level up compares two Maia ratings, PLAN.md §5.118)
- **Level up: Maia at a stronger rating finds a good move at least a gap more often than at a
  weaker one, 1800 against 2200 by 25 points by default, all three set per device on the storm's
  home; a rating off the ladder is asked of Maia besides.** Was (§5.100): less than half the time
  at the user's rating and 30 points more at a ladder rating above it. Why: the owner's request; at
  2150 the old rule left few positions.

## Revision of 2026-10-17 (a sequence's alternative moves are a choice, PLAN.md §5.119)
- **A tactic's or sequence's line that branches at the user's own move, the first move included, is
  never asked once another is solved.** Was (§5.55, mistake-lab's rule): optional from the second
  move on, but every alternative first move asked in turn. Why: the owner's report; alternatives
  are there so either move is right, not to review them all.

## Revision of 2026-10-17 (a storm move graded over two depths, PLAN.md §5.120)
- **A storm list's move scores, and the grade's position values, are the mean of the search's last
  two finished depths.** Was (§5.39, §5.84): the last depth's score alone. Why: the owner's report
  of two verdicts they judged wrong; measured, one depth's score swings by more than a band is
  wide, and the two-depth mean matched a deeper search more often (PLAN.md §5.120). The bands, the
  curve and the depths are unchanged; the stored format too (`scored[].s` holds the mean), and lists
  already kept are not scored again.

## Revision of 2026-10-18 (a line in the queue starting where it branches, PLAN.md §5.121)
- **D16: "A line starts" in the day's queue has a third choice, where the line branches from the
  line walked before it** (from the start for a chapter's first line; later passes from the same
  place). Learn and a line picked keep the two. Why: the owner's request; the queue's review lines
  of a chapter follow each other in tree order, so the board need not go back to move 1.

## Revision of 2026-10-18 (difficult lines, overstudy, PLAN.md §5.124)
- **A session over the lines through difficult moves, which grades only due moves**: everything
  else it asks is practice, with no event. Every other recording session keeps §5.106's rule (any
  reviewed move's first answer graded). Why: the owner's request; overstudy ahead of time should
  change no schedule, and a due move answered there counts as it would in the queue.

## Revision of 2026-10-18 (puzzles in a focused storm, PLAN.md §5.125)
- **A focus may deal puzzles**, revising §5.100's "a focus deals no puzzles": a per-device
  "Puzzles too" in the focus's panel, off by default, deals them at the share of cards. Why: the
  owner asked for it. Puzzles aren't filtered by the focus, since the tags need a list and Maia's
  policies a puzzle doesn't have.

## Revision of 2026-10-19 (scores at equal ratings, PLAN.md §5.126)
- **The explorer's Score header switches between three views**: the games' own results, the results
  at equal ratings (the rating gap between each move's players and their opponents taken out, the
  opponents' ratings read at the position after the move), and the prepared split. Was (§5.24):
  Score and Prepared, and without the Practical column the header sorted by score (now in ⇅ only).
  Why: the owner asked for it after the "PETER" question; measured, the gap between a position's
  moves moves their scores as much as the differences the bars show.
- **The prepared split is shown at equal ratings by default** (a setting turns it off), its games'
  part moved by the row's gap. The search, q_extension's port, is unchanged: the correction is the
  panel's, so the Practical values still match q_extension's and the prepared bars no longer do
  while the setting is on.
- **The games' own explorer shows each move's score against the ratings' prediction** ("± Elo").

## Revision of 2026-10-19 (show and grade retries its mistakes, PLAN.md §5.127)
- **Show and grade retries a walk's failed moves at its end, each until known once,** in review
  (the queue, a line picked, difficult lines), not in Learn. Was (§5.77): "Show and grade does
  neither: a move shown can't be found again." Why: the owner's request; one known show is enough
  there. Still graded once a session; repetitions stay out of show and grade; *Mistakes retried*
  at 0 turns it off too.

## Revision of 2026-10-19 (opening ideas, PLAN.md §5.128)
- **An idea deck is a PGN file of chapters, one idea each, with `IdeaKind`, `IdeaQuestion` and
  `IdeaSource` headers.** The comment before the first move is the explanation with its arrows,
  the main line plays the idea out, and a side line marked `?` shows where it fails. Chapter 0
  holds the rules of thumb. It is a data format the owner's real data will be written in, so the
  owner approved it first (2026-10-19, with the plan's shape: a pilot, the skill and its tools,
  then idea cards in the app). It needs no change to the site: headers are kept as imported
  (§4.4), and a deck imports today as a reference study. Decided after the pilot, within that
  format: rule n of chapter 0 sums up idea n, and a card's answers are its first move and any
  first move marked `!` beside it, an unmarked side line being playable but not the answer. Why:
  the pilot's rules were numbered apart from its ideas, and its unmarked second-best moves would
  otherwise count as right.
- **Claude's claims about positions rest on tools, never on picturing the board.** The skill
  (`.claude/skills/opening-ideas`) and its tools (`scripts/ideas`) compute a position's facts, run
  Stockfish and Maia under Node, read a repertoire's reach from its move shares, and check a deck.
  They reuse core's parser, writer, Maia encoding and the storm's grading scale, so a deck reads
  and grades as the site would. Why: the owner asked for accuracy and consistency, and Claude's
  weak point in chess is seeing the board, not knowing ideas.
- **Idea cards will be keyed by chapter (`i|<sid>|<cid>`), not by position.** Was: plan cards
  (§5.61), keyed by position, which gather every comment at that position from every study. Why:
  a deck's card should show what the deck says, not the repertoire's notes mixed in.

## Revision of 2026-10-20 (opening ideas: the owner's three rules, PLAN.md §5.128)
- **The repertoire is right: an idea deck teaches it and never reviews it.** At a repertoire
  position, the card's answer and its main line's move are the repertoire's move. It is never
  marked `?`, and no side line beside it grades better (`check --rep`). Was: the skill graded
  every move and reported gaps and improvements. In the pilot, card 12b taught 6...Qb6 where the
  repertoire plays 6...Bc5. Why: the owner, 2026-10-20: the builder chose each move for a
  reason (practical eval, ease of learning, transpositions, recurring moves); the feature isn't
  for finding better moves.
- **Maia is read at 2000 or more.** Was: 1100, 1500 and 1900 by default. Why: the owner: Maia
  plays a little below its number.
- **An idea deck starts with development: where each piece goes, and when.** There is one card
  per square, the condition taken from the development map and confirmed on the board. Was:
  ideas in the order they come up, starting with what the gambit buys. Why: the owner asked for
  it ("define when the f8 bishop should develop to e7, d6, c5 and why"). Decided within it: the
  rules of thumb are split into two overview chapters (where the pieces go; plans and tactics),
  each under 1500 characters, and the duplicate-position warning counts cards only.

## Revision of 2026-10-24 (opening ideas: a card is a decision, PLAN.md §5.128)
- **An idea card is a decision a player could get wrong, asked neutrally.** Was: rule 3 as written
  on 2026-10-20, one card for each square a piece goes to, each asking "where does this piece
  go here, and why?". Now:
  - Development still comes first. A square gets a card only where it is a real decision; a
    natural or forced square is a clause of the piece's rule.
  - The question may say what the opponent just played. It never names the answer's square or
    lists our candidates, and names the moving piece only while that piece still has a real
    choice.
  - The deck check refuses the rest, with Stockfish and Maia 2000/2200.

  Why: the owner, after training the first three decks: the questions were wrong or gave the
  answer away. Measured on those decks: in 43 of 104 cards the named piece had one sensible
  move, and in 66 Maia found the answer 85% of the time or more once the piece was named.
- **A deck has about 12 cards (never more than 15) and at most 8 rules, taken by value from
  `cv.ts decisions`.** Was: 12–18 ideas with no cap on a piece's cards, and no cap at all in the
  lean run (the decks had 27–42 cards). Value is reach × how often Maia misses our move × what its
  likeliest other move gives up. Why: the owner: 30+ cards is too many for a small chapter; the
  owner left the size to Claude (2026-10-24). Decided within it:
  - lean runs the writer and the critic only, `decisions` doing the lenses' search;
  - the card's kind is hidden while it asks, since "break" names the answer's kind.
  - The thresholds: a sensible move is within 10% win of the best (the storm's `ok`). A
    question gives the answer away at 85% once the piece is named. A card is free at 80% found
    unprompted, and rare under 2% reach.


- **No eval bar on the phone (under 900px); the move buttons sit close under the board.** Was: a
  6px strip under the board, and the buttons below an empty feedback line. Why: the owner: the
  number beside the top line reads more clearly. The feedback line takes no room while empty
  (it still shows its message when there is one), so the buttons start 28px under the board's
  foot, with 4px of padding at their sides.

## Revision of 2026-10-25 (opening ideas: one card per stretch of a line, PLAN.md §5.128)
- **A card never asks the very next move of another card's line; one card teaches both, its
  explanation saying the follow-up.** Was: any decision from `decisions` could be a card, so
  deck 4 asked 3. Bf4 …cxd4 and then 4. cxd4 …Qb6. The check refuses a card at the position after
  another card's answer and the opponent's reply (the card's main line's, or the repertoire's
  reply for half the games or more), and warns on one further down another card's main line. A
  reply fewer than half the games take is the opponent's choice, and may have its own card. Why:
  the owner, 2026-10-25: "not efficient, and the knowledge in the second card should be made
  clear in the first card".
- **A deck's cards go to where the repertoire breaks its patterns and to unintuitive moves; the
  patterns are its rules.** What the owner values most: the common patterns, ideas and
  development squares; when we break them (if at all); unintuitive decisions. Decided within it:
  a card that breaks a pattern quotes the rule it breaks and says why.

## Revision of 2026-10-25 (the variation checklist synced, PLAN.md §5.130)
- **A checklist is synced, as a `checklist` event on `t|<sid>`** (its lines, reserve and gaps as
  UCI moves from the start, with their shares; the latest wins). Was: kept on the device that made
  it (the revision of 2026-10-07), so another device had to ask the explorer again and could pick
  other lines as the explorer's numbers moved. Why: the owner's choice, 2026-10-25. The shown list
  is derived from the event, the exclusions and the pauses, so ✕ still writes only its `drop`.
- **The checklist leaves paused lines out.** Was: §5.70 counted paused lines everywhere but
  training, the checklist included. Why: the owner's choice, 2026-10-25: the checklist drills what
  is trained.
- **The checklist keeps mistake-lab's ranking** (d'Hondt over the explorer's shares, cut at a
  ply), not §5.70's greedy order. Why: the owner's choice, 2026-10-25; the port stays checked
  against mistake-lab's code.

## Revision of 2026-10-22 (the pace of auto-played moves)
- **A faster pace, and the speed and the pauses of auto-played moves are settings.** Was: three
  paces (fast 450 ms, normal 600 ms, relaxed 900 ms), a floor of 450 ms (lichessable's), and the
  pauses fixed at two paces. Now: "fastest" (250 ms) joins them, the floor is 100 ms, and the
  training settings (this device) take a custom number of milliseconds a move, a pause at a
  line's end and a pause to look at a position (after a mistake, between a shown sequence's
  moves, before a comment line's first move); a pause left empty follows the speed as before.
  Why: the owner asked for an even faster pace and for the speed and intervals as a setting.
  Decided within it: a pause of 100–10000 ms; one pause for the line's end, whether the next
  line opens by itself or the trainer goes on; the presets stay in the session's ⋯ menu, with
  "custom" at the speed set in the settings.
