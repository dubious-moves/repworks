# Repworks: waiting for the owner's testing session

What has been built but not yet checked live on the owner's devices. Sessions add to it when they
push something only the owner can check, and remove an item once the owner reports it. Each
item names its `PLAN.md` section, which says what to check. Report findings to any session; it
fixes them and updates this file.

## Phase 0

Reported by the owner on 2026-10-06: the spike's desktop run (all steps passed, §4.2), the
Qchess and Lichess imports on the desktop (§4.10), and the study editor on desktop and phone
("the current version is good"; their requests became §5.15).

- §4.2: the spike from the installed app (S2's second half, and `persist()` there).
- §4.5 (a): the owner's Lichess test study run through the round-trip suite (its export in the
  data repo, by `REPWORKS_FIXTURES`), and our output imported back into Lichess and compared.
- §4.10: the Lichess OAuth flow from the installed app on the phone.
- §4.11: Phase 0's acceptance test (desktop and Android phone).

## Phase 1

Reported by the owner on 2026-10-06 (build `95b0b76`): the study cards, making and managing a
study (synced to the phone), the chapter ⚙ on the phone, the transposition badges and the
clickable lines work (§5.11, §5.12, §5.15 in part). Their requests became §5.16; training itself
couldn't be tested then (the day's limit was used up), so the training items below still stand.

- §5.16: the line list on desktop and phone (a chapter opened, a line picked, due or not: its due
  moves graded, its new moves taught, the rest asked with nothing recorded; "Learn" on a
  chapter; "Next line"); the daily limit changed from ⚙ and the same on the other device after a
  sync; the "Nothing to train" screen; "Study" from it and from a line; "1" and the button
  switching a review to show and grade and back; the move's wider hitbox, the badge pills and
  the bold blue lines in the notation.

- §5.1: the index build time on the phone, with the real repertoire.
- §5.5: the queue simulation on the real repertoire, to choose the default daily limit (needs
  the data repo, by `REPWORKS_FIXTURES`).
- §5.7: a real day's training session with the real repertoire (phone, then desktop): moving by
  tap and by drag at the pace, the feedback line, the screen staying on (wake lock), the time a
  session takes; the home screen's counts the same on both devices after a sync. The index
  build time is in the debug panel (§5.1's target: under 300 ms on the phone).
- §5.8: a session's mistakes retried and drilled on the phone; a pin made on the phone appears
  on the desktop after a sync, and comes due 30 minutes after it was made.
- §5.9: show and grade on the phone with the owner's ring: whether its buttons arrive as key
  events or through the Media Session API (and whether the silent loop keeps that routing), with
  the screen on and off; speech on Android.
- §5.10: the Read and Interactive views on the phone and the desktop, from the chapter view and
  the move menu: reading a long line with comments (the text size, ← →), playing a line by tap
  and drag, and the walk following a variation's move.
- §5.11: the transposition badges on the real repertoire (how many moves carry `⇄` or `+k`,
  whether the marks crowd the notation on the phone, the time the chapter view takes to open a
  big chapter); copy continuation pasted where the owner uses it.
- §5.12: clickable lines in the owner's real comments (Qchess's and Chessable's notation): which
  groups become lines and which stay remarks, where each line starts, line jumping with → at a
  line's end; previews on the phone (tap a move, ◀ ▶ Back, tap the board) and during training.
- §5.15: the study cards on the real repertoire (the counts, the side tags); a study made with
  no import, renamed, its chapters renamed, turned, moved and deleted through the ⚙ dialogs, and
  deleted from its card, then synced to the other device; train ↔ study during a real session
  (desktop and phone): "Study" from the training screen opens the line at the board's move, an
  edit there, and "Train" takes the session up again with the edit in it and nothing asked
  twice. Whether the chapter ⚙ by the phone's chapter menu is easy to find.

- §5.17: the second testing notes, built (desktop and phone): the new settings' defaults in a real
  session (auto-play `due`, the queue's lines starting at the first due move, a picked line and
  Learn auto-played from the start, Learn waiting at each line's end); whether the quieter
  feedback line is enough; "Let me try first" for new moves; "Go on to the next line" on a picked
  line and in Learn; the four auto-play modes against what lichessable does (and whether
  `session` should be the default); time travel's banner, +4 hours bringing the day's taught
  moves due, and "Back to now". Difficult moves are two lapses or FSRS difficulty 7: say if the
  `difficult` mode asks too much or too little.

- §5.38: the third testing notes, built (desktop; the phone for the dialogs and the "+"): the
  explorer's bars lined up on real counts (up to 1,531,092,892) and the Eval column further right;
  the Practical column's "+" on a row's hover (faint on the phone); the training settings and the
  other dialogs wider on the desktop, and closed by a click outside them; "Show a sequence" for
  new moves on a real learning session: whether the sequence's length should count new moves (as
  built) or all moves, whether twice the pace is right for watching, and whether Chessable shows
  the whole variation instead.

- §5.18: alternative moves (desktop and phone): a wrong move saved as an alternative from the
  training screen, taken back for free when played again on another line or another day (and on
  the other device after a sync), listed in the study's card panel and removed there.

## Phase 2

- §5.23: the explorer panel with the owner's Lichess login, on desktop and phone: on 1. e4 c5
  2. Nf3 the Lichess tab beside Qchess's Lichess tab with the same filter (moves, shares, counts,
  bars) and the Eval column beside Qchess's; Masters; a row tapped playing its move;
  the ⛁ button turning the panel off and on (and remembered); the settings' filter; the phone's
  layout (the panel after the notation, rows readable and tappable). If the login was made before
  this build, the explorer uses the same token: no new login is needed.
- §5.23, the owner's notes of 2026-10-06: the panel keeping one height while stepping through
  moves (desktop and phone); dragging its top edge's handle (mouse, and a finger on the phone),
  the height kept after a reload, a double-click back to the default; Eval, Prac and Games
  sorting on a click on their titles; no ChessDB tab.
- §5.22: a reload answering from the cache (the panel fills at once on a position seen before).
- §5.24: the Practical column on the desktop beside q_extension's column (same positions, filter
  and token; the values within a point at the same depth, the prepared bars likewise); the
  request counts after ten minutes of use (Explorer settings shows this tab's); on
  the phone, a search's time and the battery over a session; a long-press on a cell leaving a
  move out.
- §5.25: the local explorer on the desktop, once `explorerdb serve` has the change below: the
  address in Explorer settings, Test (Chrome asks once for the local network: allow it) showing
  the index, then the Lichess tab named Local answering with no login, and the Practical
  column computing faster (no Lichess budget).

- §5.26: a coverage report (desktop) of a real course (a reference study imported from the
  owner's Chessable export) against the real repertoire, from the course's ⚙ → Coverage…: the
  counts (present, missing, alternatives), whether the ranking's order matches the owner's
  sense of what is met most, the number of positions asked and the time, and one line added
  to a chapter and seen there (and on the phone after a sync).

## Phase 3

- §5.29: the engines' downloads from the deployed site (desktop and phone): Settings and debug
  → Engines on this device: Stockfish (7.3 MB) and Maia (59.9 MB, on Wi-Fi) downloaded, the time
  each took, then both still "stored" after a reload with the network off; Delete.
- §5.30, §5.31: the engine panel (desktop and phone): the switch on at 1. e4 c5 2. Nf3 and two
  other positions beside Qchess's SF18 (the same best move, evals within about 0.2 at depth
  20); the lines, the eval bar and the arrows readable; a line's move previewed, Add putting it
  in the chapter, and the line on the other device after a sync; the threat (W on the desktop);
  "+" going deeper; the depth reached in 8 s on the phone, and its heat over ten minutes; the
  engine stopping when the app is hidden, and in a second tab stopping the first.
- §5.32, §5.33: Maia (desktop, then the phone on Wi-Fi): the switch, the dialog and its download,
  then Ml and Ms in the explorer beside Qchess's Maia3 at the same rating on three positions
  (the same top four, likelihoods and scores within a point; Qchess's rating defaults to 2600,
  Repworks' to the filter's); Maia's own rows where the games are few; a position's time on the
  phone, and whether Android reloads the page after ten minutes with Maia on (memory); Maia
  still there offline after a reload.
- §5.34: the Practical column with Maia on (desktop): beside q_extension's column with its Maia on,
  at the same filter (values within a point at the same depth; q_extension's Maia rating is the
  filter's too), a thin position turning purple, the Prac title switching to Maia's values; on the
  phone, a search's time with Maia.
- §5.35: the analysis board (desktop and phone): a FEN pasted and analysed; "Analyse from here"
  on a chapter's move, a line played and added back (on the other device after a sync); the
  board as left after closing the app.
- §5.36: threads on the desktop (Engine settings → Threads 2 or 4, then the reload it offers):
  "SF18 ×4" and its speed against one thread at the same position; then, with threads on, the
  Lichess login (log out and in again), a sync, the explorer and Maia, all as before; the
  installed app on the phone with 2 threads (whether Android keeps it isolated after a reload).

## Phase 4

- §5.42: a gather on the real repertoire (Storm on the home screen → Gather positions), desktop
  then phone: positions stored per minute, the requests per position (the line under the buttons),
  how many line ends had no games, and on the phone how long it takes (Stockfish scores what
  ChessDB doesn't know). Whether the game exports ever fail (lichess.org) and what the page says.
- §5.43: a three-minute storm on each device: whether the positions are worth answering (real
  middlegames a few moves past your lines, not one-move tactics or flat positions), whether the
  verdicts feel right against your own judgement or Qchess's Intuition Storm, the waits while a
  move is graded, the review (Best move, Try again, Analyse). A storm from a chapter's move
  ("Storm from here") and from a study's settings.
- §5.41, §5.43: a position answered well on the phone not dealt on the desktop after a sync, and the
  record the same on both.
- §5.44: a set of six on the phone: a held position, Try again, Show the move, the second pass.
- §5.45: Stockfish re-scoring the kept positions on the desktop (the home's "Stockfish: n of m
  scored to depth 20"): how long a position takes; whether the phone should do it at all (off there
  by default).
- §5.47, §5.48: Collect puzzles on the desktop on the real repertoire (its estimate against what was
  downloaded, the time, how many puzzles), then on the phone over Wi-Fi; the dataset read
  cross-origin from the deployed site (D12); puzzles in a real storm and set at 25%: whether the
  disguise holds, whether the puzzles feel related to your lines, the share that feels right.
- §5.49: Phase 4's acceptance test (desktop and Android phone), then a week of daily storms.

## Phase 5

- §5.51 (once built): chess.com's archives from the page (`api.chess.com`), which this container
  can't reach: Games → the chess.com name, Refresh; the page says whether chess.com answered. If it
  is refused, chess.com games keep coming through the analyzer.
- §5.51–§5.55 (desktop, then phone): Games → Set up: mistake-lab's gist (its ID or address), your
  Lichess name; Refresh: the games read (the count against mistake-lab's), the time it took. A
  game's graph and items against mistake-lab's Games tab for the same game (the same mistakes,
  tactics and advantages). Review: a real day's game cards (mistakes judged by Stockfish: the waits
  on the phone; whether the words match mistake-lab's), a tactic with its other lines, Drop and Put
  back, and the cards on the other device after a sync. Whether 10 new game cards a day is right.
- §5.56 (desktop): a sequence from a real mistake: a game card's "Make a sequence", the refutation
  and its branches built on the analysis board, "Save as a sequence…": whether Stockfish's warnings
  are the ones mistake-lab would give, the time the check takes; then the sequence drilled from the
  game cards, and the mistake gone from them (on the other device after a sync).
- §5.57 (desktop, then phone): a practice game ("Practise from here" on a game's move, "Play on"
  after a mistake answered, "Practise" on the analysis board) with the Lichess login: the
  opponent's moves (the line under the board says DB, Maia or Stockfish) and whether they feel like
  mistake-lab's; Stop & review after five moves: the accuracy, the key moves, Retry, Show the line,
  Save as a mistake; the game in the Games list after a reload, and on the other device after a
  sync. An advantage card in the game cards: the drill, Claim victory at +10, and its grade. On the
  phone: the waits while each move is judged (Stockfish in the background).
- §5.64 (desktop): Games → Set up → "Move mistake-lab's progress here": the gist, Dry run (a
  token only if the gist won't read without one; it isn't kept), and read the report: the cards'
  counts against mistake-lab, the re-made keys, what is left behind. If it looks right, Run, then
  sync. Best done once the rest of Phase 5 is built (the saved items and plan cards show in the
  session from §5.56 and §5.61), and only once: a second run is refused.
- §5.66: the owner's answer on where the analyzer's output lives (PLAN.md, Phase 5, "The owner's
  choice"): (a) the data repo through a converter, recommended, or (b) the Gist, read-only.

### The change to q_extension for §5.25 (Repworks sessions can't push there)

`explorerdb serve` answers the extension, whose requests carry no page origin; a web page's need
CORS. This patch against q_extension `c26242f` makes the answers carry
`Access-Control-Allow-Origin` for `https://dubious-moves.github.io` (and any origin added through
`createServer`'s `o.origins`) and answers a preflight with 204 (with
`Access-Control-Allow-Private-Network`, for Chrome's older Private Network Access checks). Other
origins get the answers as before, without the header, so the browser keeps them from the page.
Checked by a Repworks session on a copy of q_extension: it applies with `git apply`,
q_extension's `node test/explorerdb.js` passes with it, and the patched server answered `/info`
and a preflight with the headers for that origin and without them for another. Apply it in
q_extension (or give it to a session with q_extension attached), then run
`node tools/explorerdb.mjs serve <index> --port 9337` and use `localhost:9337` in Repworks.

```diff
--- a/tools/explorerdb/server.mjs
+++ b/tools/explorerdb/server.mjs
@@ -13,11 +13,19 @@
  * (/info has the index's), and the popup's Test button shows it.
  *
  * Listens on 127.0.0.1 unless told otherwise, and answers GET only.
+ *
+ * Repworks (https://dubious-moves.github.io/repworks/) asks it from a web page, which needs
+ * CORS: an answer to an allowed origin carries Access-Control-Allow-Origin, and a preflight
+ * (OPTIONS, which Chrome's Private Network Access may send) is answered 204. The extension's
+ * own requests carry no page origin and need none of this.
  */
 
 import http from 'node:http';
 import { explorerAnswer } from './store.mjs';
 
+// The web pages allowed to read its answers; `o.origins` adds more (e.g. a local build).
+export var ORIGINS = ['https://dubious-moves.github.io'];
+
 // What /info says. `id` changes with every import, so caches can tell indexes apart.
 export function indexInfo(db) {
   var m = db.meta;
@@ -75,7 +83,19 @@
   var log = o.log || function () {};
   var seen = new Set();
   var served = 0;
+  var origins = ORIGINS.concat(o.origins || []);
   return http.createServer(function (req, res) {
+    var origin = req.headers.origin;
+    var cors = origin && origins.indexOf(origin) >= 0 ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
+    if (req.method === 'OPTIONS' && cors['Access-Control-Allow-Origin']) {
+      res.writeHead(204, Object.assign({
+        'Access-Control-Allow-Methods': 'GET',
+        'Access-Control-Allow-Private-Network': 'true',
+        'Access-Control-Max-Age': '600'
+      }, cors));
+      res.end();
+      return;
+    }
     var r;
     if (req.method !== 'GET') r = { status: 405, body: { error: 'GET only' } };
     else {
@@ -85,7 +105,7 @@
     }
     served++;
     if (o.onServed) o.onServed(served);
-    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
+    res.writeHead(r.status, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors));
     res.end(JSON.stringify(r.body));
   });
 }
```

