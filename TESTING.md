# Repworks: waiting for the owner's testing session

What has been built but not yet checked live on the owner's devices. Sessions add to it when they
push something only the owner can check, and remove an item once the owner reports it. Each
item names its `PLAN.md` section, which says what to check. Report findings to any session; it
fixes them and updates this file.

## "Train" from the study selects the line shown (§5.83)

- Desktop and phone, in a repertoire study: browse to a move in a side variation and press Train.
  The training screen should name that line (highlighted in the list on desktop), show the board
  at that move, and start nothing until "Train this line". At a fork, the topmost line.
- Train a line, press Study, browse to another variation, press Train: that variation selected,
  not the old session resumed. Pressing Train without leaving the line resumes the session.

## Maia in the storm: difficulty and the unintuitive storm (§5.82)

- Desktop and phone: on the storm's page with Maia downloaded (or "Get Maia…" there), the
  "Maia: n of m rated" count should rise to m within a few minutes, and the page stay responsive
  meanwhile; on the phone, whether rating beside Stockfish's deepening is too hot or slow.
- An unintuitive storm: do the positions feel like ones where the natural move is wrong? Is the
  difficulty shown after each answer believable against how hard the position felt? Is "an
  inaccuracy or worse" the right bar, or should it be a mistake or worse?

## A set's cards deepened while you think (§5.81)

- A set of 6 with cards gathered by Stockfish and not yet deepened: think a while on each card
  before moving. The verdict should come at once and say "by Stockfish d20"; the home's
  "scored to depth 20" count goes up after the set. Moving at once still works (two searches).

## A storm move judged at depth 20 (§5.80)

- Phone: a storm card gathered by Stockfish and not yet deepened (the home's "Stockfish: n of m
  scored to depth 20" below m): after a move, how long the verdict takes, and whether it says
  "by Stockfish d20" or stops short at the 8 s limit.

## The board's size (§5.79)

- Desktop, then phone: drag the grip at the board's bottom-right corner on a study; the training
  and practice boards are the same size, and stay so after a reload. A double click on the grip
  gives back "as large as fits". On the phone: is the grip easy to catch, and does it get in the
  way of anything under the board?

## The owner's notes of 2026-10-09 on training (§5.78)

- Training settings → "A line starts, when learning or picked": From the start, asked. Learn a new
  line: every own move is asked on both passes, nothing played for you but moves set to "Always
  play this for me".
- At a line's end (Learn holding at "Next line", or a picked line's end): the study's arrows of the
  last move are on the board (the Benoni line's b5, h6, a5).
- "Read" during a session and at its end: the whole line, ← → and the move list, the comments;
  "Back to training" (or Escape) goes on where it was, a move due to be played coming only then.
  On the phone, is the Read button's place in the actions right?

## The owner's notes of 2026-10-08 (§5.77)

- Phone, then desktop: learn a new line (the queue, Learn or a line picked): it is walked a second
  time ("The line again: 2 of 2", the moves taught asked with no arrow) before the next line. A
  mistake in a review comes back at the line's end, from the opponent's move, until right twice in
  a row ("Your mistake again: 1 of 2 right in a row"). Is the pace of the retries right, and is two
  a good number for both? (Training settings → This device: Repetitions, Mistakes retried.)
- Mistakes → Drill (or Retry, or the pins): a move missed again comes back after the others,
  until all are right.
- The study: the FEN row under the board and its Copy FEN (paste it into Lichess); the analysis
  board's Copy FEN; Copy FEN in a move's menu. On the phone, is the row under the board worth its
  room?
- The explorer deep in a line where Lichess has no games: ChessDB's moves (and Maia's, with Maia
  on) as rows, under "No games here: …".
- Maia on in a study, then a few minutes on one position (or away from the study page): are its
  columns still there, and do they fill in again on the next move without switching Maia off and on?
- Analyse from here in a Black chapter at a move where White is to move: the board stays Black's;
  the same from a game, a game card and a practice game's review.
- ←, everywhere: back where the page was opened from (a study's other chapters skipped; training's
  lines skipped), and nothing lost on the way back: the storm's review or held card after Analyse →
  Practise → ← ←, a practice game's review after Analyse → ←, the game cards after Analyse → ←. Does
  the filled ← stand out enough on the phone?

## A new chapter from a FEN or from PGN (§5.76)

- Phone and desktop: in a study, + New chapter → From PGN → pick a `.pgn` file (one of the
  owner's exports with several games): a chapter per game, named as expected? Then paste a PGN,
  and From FEN with a position copied from Lichess. Does the file picker open the phone's files?

## Stockfish 19 as an option (§5.75)

- Phone, then desktop: Engine settings → Version → Stockfish 19, Save; the bar reads SF19 and the
  lines come. Is it stable on the phone over a few minutes (no restarts, no "failed"), and are its
  speed and lines comparable to 18's? With 2+ threads on the desktop: SF19 ×2.
- A storm, a practice game and its review with 19 chosen run as with 18.

## Prioritize a study, and paused lines (§5.70)

- Desktop, with the Lichess login: on the training screen of a real study, the line list's
  Prioritize…, then Rank. Is the order sensible? Compare it with `prioritize_repertoire.py` for the
  same study and filters (the order differs on purpose where moves are natural: untick "Natural
  moves count less" to rank by likelihood alone). How long did a first run take, and a second (from
  the cache)?
- Apply with the number you want; then on the phone after a sync: the ⏸ lines, the home card's
  "· N paused", and today's new moves only from active lines.
- A paused line picked from the list: practised, nothing recorded; Unpause from there.
- "Add the next 10" once the active lines are learned; and a line's ⋯ (right-click on the desktop)
  with Pause and Must learn.

## Practice: move feedback off by default (§5.57, 2026-10-09)

- A practice game from a position: no classification under the moves or in the feedback line while
  playing; tick "Move feedback" under the moves and they appear (the last move's word, the symbols),
  untick and they go; the setting is remembered on the device. The review at the end is unchanged.
  Checked by the practice e2e (desktop and emulated phone).

## The practice game's review reworked (§5.57, 2026-10-07)

- Desktop, then phone: a practice game's review (end one, or reopen one from Games' history). The
  eval bar beside the board, the classification badge on the move's square, ◀ ▶ (← →) through the
  whole game; a key move's card: Show best (arrows), Show line and Show refutation (each a line to
  step with ← → or ‹ ›, a move on the board branches it), ↺ Retry and its result card. Checked by
  tests with a scripted engine on a desktop and an emulated phone only: are the real Stockfish
  lines' waits acceptable on the phone, and is the layout what you wanted?

## The owner's last notes of 2026-10-07 (§5.69)

- Desktop: the ✎ and ⋯ buttons are gone from the move buttons (right-click a move for its menu;
  right-drag on the board to draw). The phone still has both.
- "Add alternative…" in the card panel of an own move in a repertoire chapter: the board shows the
  position before the move, the move you play is saved as an alternative (and listed there; ✕
  removes it). Checked by tests on a desktop and an emulated phone only. On the phone, is tapping a
  piece and its square on that board as natural as in training?

## The owner's notes of 2026-10-07 (§5.67)

- The branch picker in the chapter view (Qchess's): → or ▶ on a move where the line branches opens
  the list of moves under it; ↑ ↓ choose, → ▶ or Enter go on, a tap on a move goes along it, ← or
  Escape close it. On the phone, does the list sit where you'd look (under the move, or above it
  when there's no room)?
- "Read from here" and "Play from here" (now "Quiz from here") are only in the move menu now (right-click, long-press, or
  ⋯): the panel has their room back.
- The explorer stuck on "Asking…": fixed where it was found (the panel's request shared with the
  Practical search of the move before, and dropped with it when the board moved on), and a request
  Lichess or ChessDB leaves unanswered for 30 s now ends with "didn't answer in 30 seconds" and
  Retry. If "Asking…" ever stays again, note the position and whether Prac was computing.
- Explorer: Eval right after the move (Move 56 px and Eval 48 px on the desktop, 52 and 46 on the
  phone); "⇅ Sort" no longer cut to "Sort l" with Maia on.
- Storm: Study and Chapter pickers on its home (the scope the storm deals from and gathers for);
  the record shown for the scope, with a table by study (whole repertoire) or by chapter (a
  study), each name opening its scope.
- Storm's gather: the request counts move as each request goes out, and Stop ends it at once (the
  walk under way is left out).

## The blank page on the phone (2026-10-07)

Reported by the owner on 2026-10-07 (build `60622b0`): after the update the page was empty on the
phone, in the browser and the installed app. Reproduced by an e2e test (`test/e2e/guard.spec.ts`)
with a card whose due time is past what a JavaScript Date holds (a migrated state with a huge
`sched`): the debug panel's card table threw while drawing, and Preact left the page blank. Not
confirmed that this is the phone's own cause: its data can't be read from here.

- The home screen on the phone again. If any part of a screen still fails, it now shows
  "… failed to show" with the error in its place (Details has the stack): report that text.
- The sync after a long editing session on the phone: GitHub's "Something went wrong while
  executing your query" (2026-10-07) should no longer show; the commit goes through REST instead.
  The chip's request counts (Settings and debug) show REST writes when it happened.

## The blank page after a reload (2026-10-10)

Reported by the owner on 2026-10-10 (build `57ed03b`, phone): sometimes after a reload the page
stays empty below the top bar, and seemed to need a reinstall. Read from the screenshot: no error
banner, no sync chip, so the start never got past the local database (opened, then the device
read): the screen waits for it and drew nothing meanwhile. Not reproduced here; a guess is that
the browser still held the database for the page before the reload.

- When it happens again, after 4 s the page now says "Still starting: waiting for <step> (N s)"
  with Reload; report the step and whether it ever goes on by itself. An error in the start now
  shows as a banner instead of a blank page: report its text.
- Instead of reinstalling, try closing the app fully (swipe it away from the recent apps) and
  opening it again; report whether that's enough.

## Phase 0

Reported by the owner on 2026-10-06: the spike's desktop run (all steps passed, §4.2), the
Qchess and Lichess imports on the desktop (§4.10), and the study editor on desktop and phone
("the current version is good"; their requests became §5.15).

Reported on 2026-10-07: the spike from the installed app on the phone (build `4ad54ce`: every step
of that run passed, `persist()` granted, S2 reading the browser tab's markers; the failed steps in
the same report were earlier runs: the data repo still empty on 10-05, `persist()` refused in a
browser tab on 10-06), the round trip of the Lichess test study and back into Lichess, the Lichess
OAuth flow on the phone, and Phase 0's acceptance test. Nothing of Phase 0 waits now.

## Phase 1

Reported by the owner on 2026-10-06 (build `95b0b76`): the study cards, making and managing a
study (synced to the phone), the chapter ⚙ on the phone, the transposition badges and the
clickable lines work (§5.11, §5.12, §5.15 in part). Their requests became §5.16; training itself
couldn't be tested then (the day's limit was used up), so the training items below still stand.
On 2026-10-07 the owner reported the line list (a chapter opened, a line picked) working, and the
explorer's Eval column too far from the move (§5.67).

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
  Learn auto-played from the start, Learn and the day's queue waiting at each line's end); whether the quieter
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
- §5.68: "Collect all" on the storm's Puzzles card on the desktop (a repertoire with more than 100
  index files left): it runs through, Stop ends it, a reload keeps what was read, and it goes on
  while you look at another screen; "Practise from here" in a study's move menu starts a game as the
  chapter's side from that position.
- §5.49: Phase 4's acceptance test (desktop and Android phone), then a week of daily storms.
- §5.71 (the storm reworked, desktop then phone): a storm on the real repertoire after a fresh
  gather: the cards from many line ends (the line under the chapter name changes from card to card,
  and a second storm starts on other line ends); the gather stopped after a minute still covering
  many line ends ("from n line ends" on the home); the move staying on the board through the
  verdict, Pause and Next (Space); an arrow (right-drag, or ✎ on the phone) staying until the next
  card; Analyse from the review and from a held set card, then "← Back to the storm" and the
  browser's Back, the review at the same position; the analysis board from your side with the move
  that reached the card one step back. Whether 1.2 s after a good move is long enough.
- §5.72: "Clear positions…" on the storm's home, for a chapter, then the whole repertoire: the
  count goes to 0 for that scope only, the record stays, and a new gather fills it again.
- §5.73 (desktop, then phone): a set with a wrong first move, then Try again with a good one: the
  card says "Counted: the first answer, … · Mistake"; the review keeps Mistake on that row, with
  "Then …: not counted" under the verdict, and "found" and the average given up count the first
  answers only. On the desktop the position list sits beside the board under Try again and
  Analyse, scrolling itself; "Show lines" puts each position's line under its row and is
  remembered.
- §5.74 (desktop, then phone): in the storm's review, "Save as a mistake" on a mistake and on a
  great answer, then both in Games → Review ("Find a better move than …" and "Find the best
  move"). Analyse a storm card and "Save as a sequence…": the drill starts at your move. On the
  analysis board from the home screen, a few moves and "Save as a sequence…", then drilled.

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
- §5.58–§5.60 (desktop): Games → Repertoire check on the real games and repertoire, beside
  mistake-lab's Repertoire tab: the deviations (expect more here: every game is walked, where
  mistake-lab walks only the games that gave it a mistake), the gaps, a chapter opened from one and
  a move added there, Dismiss (and on the other device after a sync); the weak spots in both lenses;
  the "↻ Transfer" line on the Games screen beside mistake-lab's, and whether the reschedules on
  relapse look right (the cards it makes due).
- §5.61 (phone): a plan card made from a commented move (the move menu: Make a plan card), then
  reviewed with the game cards on the phone after a sync: the board, Show plan, the grade; whether
  the comments read well as a plan's back, and whether plan cards should count against the daily
  limit of new game cards (they do now).
- §5.62 (desktop): Repertoire check → Variation checklist for a real study (with the Lichess login),
  beside mistake-lab's for the same study, lines and plies: the same lines in the same order (the
  explorer's numbers move a little with time), the time it takes; a line drilled at Easy (the
  lead-up, the game, Claim victory) and checked off, on the other device after a sync (the list is
  made on each device; the results and the lines taken out are synced).
- §5.63 (phone): voice in a practice game (🎙 Voice under the moves; Chrome asks for the
  microphone once): moves said as mistake-lab taught them ("knight f3", "egg four", "castle"), the
  opponent's moves spoken, Confirm moves with yes and no; with a Bluetooth headset, whether it
  stays awake between moves; how often a move is misheard beside mistake-lab.
- §5.64 (desktop): Games → Set up → "Move mistake-lab's progress here": the gist, Dry run (a
  token only if the gist won't read without one; it isn't kept), and read the report: the cards'
  counts against mistake-lab, the re-made keys, what is left behind. If it looks right, Run, then
  sync. Best done once the rest of Phase 5 is built (the saved items and plan cards show in the
  session from §5.56 and §5.61), and only once: a second run is refused.
- §6 item 1 (desktop, then phone): in the game cards, a mistake answered wrong: the engine's line
  under the board at the opponent's reply, stepped with ‹ › (← → on the desktop), past its end (a
  wait while Stockfish extends it), a move of your own on the board (a branch in brackets), back
  before your move (Try again); after a right move, Show the engine's line. Whether the lines read as
  mistake-lab's and the waits on the phone are bearable.
- §6 item 2 (phone, then desktop): a practice game from an opening position of your repertoire
  ("Practise from here" on an early move): a move off the repertoire taken back (the study move
  named), the Hint, Ignore for this game; a premove while the opponent thinks; on the phone, switch to
  another app for a while and come back (or reload): "Game in progress", Resume; Stop & review: the
  corrected deviation in the key moves.
- §6 item 3 (desktop, then phone): a practice game with a tactic in it (an opponent's blunder you
  punish, or miss): after Stop & review, "Scanning for tactics…" then the list; Try, Save (then the
  tactic in the game cards), Discard. Whether it finds what mistake-lab's would, and how long the scan
  takes on the phone.
- §6 item 4 (desktop, then phone): Games → Explorer on the real games beside mistake-lab's Opening
  explorer: the moves and results at a few positions, the list filtered, the opening names; how long
  the first opening takes on the phone; a practice game from there titled by the opening.
- §6 item 5 (desktop): Games → "Hide time trouble ⏱": the counts beside mistake-lab's with its own
  "Hide time trouble" on; the game cards' queue with it on.
- §5.66: the owner's answer on where the analyzer's output lives (PLAN.md, Phase 5, "The owner's
  choice"): (a) the data repo through a converter, recommended, or (b) the Gist, read-only.

- §5.65: Phase 5's acceptance test (desktop and Android phone), once the items above look right:
  1. Desktop: the migration's dry run (Games → Set up → Move mistake-lab's progress here), its
     report read; the run; the game cards' queue beside mistake-lab's for the same day.
  2. Desktop: a day's game cards (mistakes, tactics, advantages, plan cards, saved sequences); a
     practice game and its review; the repertoire check (deviations, weak spots, a checklist) beside
     mistake-lab's Repertoire tab.
  3. Phone: the game cards after a sync; a practice game with voice; a plan card.
  4. A week with mistake-lab closed. Then mistake-lab retires (D20); its analyzer keeps running from
     its repo (D8) until §5.66's answer.

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

