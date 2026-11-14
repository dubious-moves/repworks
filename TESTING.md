# Repworks: waiting for the owner's testing session

What has been built but not yet checked live on the owner's devices. Sessions add to it when they
push something only the owner can check, and remove an item once the owner reports it. Each
item names its `PLAN.md` section, which says what to check. Report findings to any session; it
fixes them and updates this file.

**How it is organised** (since 2026-11-10, PLAN.md §5.160): one walk through the app, a section
per screen, in this order:

1. Home and Today
2. Studies and the study page (the notation, the explorer, the engines, the analysis board)
3. Training (the day's queue, Learn, a line picked, the line list, mistakes)
4. Show and grade
5. The storm
6. Game cards and Games
7. Practice and the checklist
8. Endgames
9. Ideas (idea cards, opening-idea decks, model games)
10. Progress
11. Import and share
12. Settings and sync
13. The spike and installation (the installed app, the start, the frame around every page)
14. The Chessnut Move (when the board arrives: CHESSNUT.md)

Within a screen the newest items come first. Each item names its section and date. Its bullets
are what waits for the owner's devices; its last line, **Checked**, says what tests, headless
screenshots or runs in a cloud container already covered, so it isn't asked again. An item that
spans screens sits under the screen it is mostly about, and the others point to it. Items that a
later change replaced are folded into the later item; items already reported working are gone
(Phase 0's, and the parts of Phase 1 the owner reported on 2026-10-06 and 2026-10-07).

## 1. Home and Today

### A study's card: how far it is learned (§5.169, 2026-11-12)
- On the home, each repertoire study's card has a thin bar and "n of m moves started · k
  mature" under its counts. Do the numbers fit what you know of each study (the ones you have
  finished, the ones barely begun)? Reference studies and idea decks should have none.
- Is the bar worth its place on the card, on the phone too, or is the line of words enough?
- **Checked**: unit tests; Playwright on a desktop and an emulated phone; headless screenshots in
  Forest and Paper. Nothing on the real repertoire.

### Search (§5.166, 2026-11-11)
- **Search**, after Import on the home: one box over every study on the device.
  - A chapter by a word of its name, or one of its study's and one of its own ("najdorf bg5").
  - A comment by words remembered from it, in any order; the hit names its chapter and move, and
    opens the chapter there.
  - A position by its moves ("1.e4 c5 2.Nf3 d6", or "e4 c5 Nf3 d6", or another order that reaches
    it) or a pasted FEN: every chapter that reaches it, and a link to the analysis board at it.
  - ← from a hit comes back to the same words and hits.
- With your real repertoire: are the hits there as fast as you type, on the phone too? (Measured
  in Node only: 3 to 7 ms a search over 480 made-up chapters.) Are 40 chapters and 60 comments
  enough to show before "add a word to narrow them"?
- Should the hits' order be different (positions, studies, chapters, comments)? Should anything
  else be searched (the games, the storm's positions)?
- **Checked**: unit tests and Playwright (desktop and emulated phone); nothing live yet.

### Today, and the counts on Games and Storm (§5.158, 2026-11-10)
- The home's **Today** card, above the training card: a row for each kind of work with something
  to do (repertoire, ideas, game cards, endgames, the checklist's next line, storm), and **Next**
  opening the first. Is the order right? Should the checklist and the storm, which never run
  out, count for Next only when nothing else is due?
- The game cards' row and "Games · n due" appear once the Games screen has been opened on that
  device (the home reads the deck as the Games screen last saw it, not every game). Open Games
  once, then reload the home: the row stays. New games from a Refresh show after the next visit
  to Games.
- "Storm · n ready" on the home's Storm button and the storm's row: the same n as the storm's
  page shows for the whole repertoire with your focus.
- Opened straight after a reload, Game cards → Review now waits for the games to be read instead
  of saying "Nothing to review" (a bug the Today card's link found).
- **Checked**: unit tests and Playwright (desktop and emulated phone); nothing live yet.

### A quicker home (§5.156, 2026-11-07)
- The home after a reload, on the phone with your real history: the due counts should come
  sooner than before (they waited for the folded settings panel to replay the whole history).
  Settings and Debug (two panels since §5.159) still open with everything in them.
- **Checked**: the tests, and timings on an emulated phone with the CPU slowed 4× (1.8 s against
  3.2 s with 3,000 reviewed cards); nothing live yet.

### The home's layout (§5.88)
- Home, training, games, coverage, storm: the dropdowns and boxes in the theme's colours; home's
  buttons and the training buttons on the phone in even rows. Anything that now looks off?

### The study cards (§5.15, Phase 1)
- The study cards on the real repertoire (the counts, the side tags); a study made with no import,
  renamed, its chapters renamed, turned, moved and deleted through the ⚙ dialogs, and deleted from
  its card, then synced to the other device. (Reported working on 2026-10-06 on the owner's test
  studies; what stands is the real repertoire.)

## 2. Studies and the study page

### The repertoire's moves on the analysis board (§5.165, 2026-11-11)
- On the **analysis board** the explorer's third tab is **Repertoire** (it was "Study", and read
  "The study plays nothing here."): at the board's position, the moves your whole repertoire plays
  there, with their lines and their chapters, each chapter named with its study and one click
  away at the move.
  - Open it from a game card's or a storm card's Analyse, or paste a FEN: does it answer "what do
    I play here?" with the real repertoire, by other move orders too?
  - Where the repertoire has nothing: "Your repertoire plays nothing here."
- In a study the tab is still the study's own (§5.162).
- **Checked**: Playwright (desktop and emulated phone) on the test repertoire, and headless
  screenshots with three made-up studies; nothing live yet.

### The Study tab in the explorer (§5.162, 2026-11-10)
- On a study made of many chapters (a Chessable course imported as a reference study is the case
  it is for): the explorer's **Study** tab, beside Lichess and Masters. At each position, the moves
  the study plays there from all its chapters, by any move order, most lines first, with the
  explorer's Eval, Games and Score, then Lines and Chapters.
- Step through a line: do the counts match what you know of the course? A move in one chapter
  shows the chapter's name (one click opens it at the move); in several, "n chapters" opens the
  list. Is that the right amount of clicking on the phone?
- Your own repertoire study: does a move's line count help decide what to study or prune?
- The tab stays chosen on the device; Lichess or Masters brings the explorer's own rows back.
- **Checked**: unit tests and Playwright (desktop and emulated phone), a screenshot of each in
  headless Chromium; not on a device, not on a real course.

### Lc0 vs Maia from a move (§5.144, 2026-10-31)
- On the desktop, logged in to Lichess, right-click a move in a chapter → "Lc0 vs Maia
  continuation". Start (the first time, the download of Lc0's network and Maia). At 800 nodes a
  Lc0 move takes up to about a minute and a half (often less: "decided early"). Are the people's
  moves the ones you'd expect, and Lc0's the ones you'd want to learn? Is 800 worth the wait over
  400?
- A position deep in a line, where the database has few games: the moves marked as blended or
  Maia's. Is 100 games the right point to start blending Maia in?
- Add to the chapter: the line goes in after the move, and syncs.
- On the phone: the same, and how long a Lc0 move takes there (search there may be a few times
  slower; Stop keeps the moves decided so far).
- The analysis board: the same item on its moves.
- **Checked**: the search by unit tests (a fake network; the real one finding a move its policy
  misses, scored by Stockfish), the whole dialog by Playwright with the real Lc0 and Maia and a
  fake explorer (desktop and emulated phone), screenshots in headless Chromium. Not on your
  devices, not against Lc0 itself, and not against the real Lichess database.

### Lc0 on the study page (§5.143, 2026-10-31)
- On the desktop, open a chapter, switch **Lc0** on in the engine bar: a dialog asks for the
  one-time download (35.9 MB, or 21.7 MB if Maia is already downloaded). Then switch Stockfish on
  at a position where you hesitate between moves: beside each line, Lc0's share of its first move;
  where two or more lines are within 0.30, Lc0's pick is the one highlighted. Is the pick useful?
  Is 0.30 the right width for "close"?
- The row under the lines: Lc0's eval from White's side (as Stockfish's), its win / draw / loss
  for the side at the bottom of the board (a Black chapter: Black's), and its three likeliest moves.
  Step through a line with the arrows: it should follow within a fraction of a second.
- On the phone: the same, and how fast it answers there (about 80 ms a position under Node on the
  container's CPU; a phone may take a few times that).
- Grading: once you have used the pick a while, say whether Lc0 should weigh in on any move grade.
- **Checked**: the conversion and the encoding by unit tests under Node (Lc0's move table, mates
  found, mirrored colours, 78 positions against Stockfish); the page by Playwright with the real
  network and a scripted Stockfish (desktop and emulated phone). Not against Lc0 itself (it can't
  run in the container), and not on your devices.

### Several chapters at once (§5.140, 2026-10-31)
- Import (or add "From PGN") a file of several games into a study, so it makes a chapter per game.
  Open ☰ → "Manage chapters…" (also "Chapters…" in Study settings, "Several chapters…" in Chapter
  settings). On the desktop, click one box and shift-click another: every chapter between is
  ticked. "Merge into one": the first ticked chapter keeps its name and gets every line of the
  others, its main line still first; the others are gone. Train the study after: the merged lines'
  moves should keep their progress (cards are per position).
- Tick chapters for the wrong side and use "For White"/"For Black"; then delete a few at once
  (asked first). Sync, and check the phone shows the same chapters.
- **Checked**: unit tests and Playwright with the fake data repo (desktop and emulated phone); not
  on a device.

### ChessDB's evals: asked again until they settle, and the shallow ones marked (§5.138, §5.139, 2026-10-30)
- Open a position ChessDB hardly knows (deep in a sideline: one or two moves in the Eval column).
  Within a second the evals may change (the position after the best move was asked), and again
  about 15 s and 45 s in if you stay; a move may be added. Then play ChessDB's best move: the next
  position's best eval should be within about 0.1 of the one the move had. Step back: the earlier
  position shows its latest evals at once.
- In such a position (like the Scandi Gambit's 15.bxc3) its evals should turn light and italic
  within a second, and hovering one (desktop) should say "Shallow: ChessDB's best line here is
  only N plies deep…". Compare with a deep Stockfish search there: is a shallow eval where the two
  disagree?
- Open a main-line position: its evals stay bold; hovering the best says how deep ChessDB's line
  is. A sideline move in it that ChessDB hasn't looked at the replies to is italic alone.
- The threshold is 10 plies of ChessDB's best line (PLAN.md §5.139): say if it marks evals you'd
  trust, or leaves unmarked ones that turned out wrong.
- **Checked**: ChessDB's revisions, notes and `querypv` read live from the container, the worker's
  service run under Node against live ChessDB and the table built from live answers; the asks by
  unit tests with a fake ChessDB that revises; the rest by unit tests and Playwright with a fake
  ChessDB (desktop and emulated phone). Not in a browser against live ChessDB, and not on the
  owner's device.

### Flip board on the analysis board (§5.134, 2026-10-28)
- On the analysis board, ☰ → Flip board (first in the menu) should turn the board, the eval bar
  and the material with it; `F` on a keyboard does the same. Practise afterwards plays the side
  now at the bottom. Undo takes back moves without turning the board back.
- **Checked**: Playwright (desktop and emulated phone); not on a device.

### A dropdown lets go of the keys once an option is picked (2026-10-21)
- On your desktop browser and phone, pick a sort, a chapter and a setting in a dialog; the arrow
  keys should then move through the study (or do nothing in a dialog), never step the menu.
  Stepping a closed menu with the arrow keys itself still works and keeps its focus.
- **Checked**: an e2e test in headless Chromium (the explorer's Sort menu: after a pick it is not
  focused, → moves in the chapter and Home goes to the start, the pick unchanged). Not with the
  native pickers of a real device.

### The material by every board (§5.129, 2026-10-21)
- As on Lichess: above the board the top side's extra pieces, below it the bottom side's, in their
  own colour, and "+n" after the side that is up. Is it easy to read at a glance on your phone, and
  are black pieces clear enough on your theme? The boards fitted to the window's height are 44px
  smaller to make room: say if that's too much.
- **Checked**: the tests and screenshots in headless Chromium (desktop and an emulated phone, the
  Forest and Paper themes).

### Scores at equal ratings (§5.126, 2026-10-19)
- Explorer: click the Score header once: "Equal Elo", dashed bars. Hover one (the phone has no
  hover: say if you want its details on a tap, as the Practical cells have): its score, the games',
  both averages and the gap. Do the reorderings on lines you know make sense (e.g. 1.e4 Nf6 losing
  its lead, 1.e4 c5 2.d3 gaining)? Stepping through a line in this view asks Lichess for up to
  about ten more positions each time the first time: is the wait for the bars acceptable, and does
  the Practical column feel slower beside it?
- Click again: Prepared, now at equal ratings (Explorer settings → Practical column → "Prepared
  results at equal ratings"). The bar's title has an "At equal ratings" line. Untick it to compare
  with q_extension's prepared bars, which it should then match again.
- The Games page's "± Elo" column is under 6, Games.

### Copy branch as PGN (§5.111)
- In a study, right-click (long-press on the phone) a move with moves after it → Copy branch as
  PGN: "Branch copied" under the board. Paste it into Lichess's import (or a Qchess chapter): the
  moves to it, and every variation after it with their comments and arrows, should be there.

### Branches to clickable lines (§5.109)
- In a study, right-click (long-press on the phone) a move with two or more moves after it →
  Branches to clickable lines: the moves after it should go, and its comment should hold one blue
  line per branch end, each clickable and stepped with ← →. Undo should bring the branches back.

### Export PGN for a chapter (§5.108)
- In a study, ☰ → Export PGN: a file `<study> - <chapter>.pgn` should download, on the desktop and
  on the phone (on an iPhone Safari may show it first; Share → Save to Files keeps it). Import it
  into Lichess or Qchess: the moves, comments and arrows should all be there.

### Clickable lines: words, null moves, ↓ (§5.96)
- Write a comment like `( 12.Ng5 Ndf6 taking the e6-pawn under control 13.Nxe6 Bxe6)` and one like
  `(7.-- Bg7, 8.-- O-O, and 9.-- a5)`: the words in plain comment style, the moves clickable, and
  each → in the second showing one of Black's moves, the passes stepped over.
- On a move with such a comment, ↓ enters the line; ← → along it, ↓ ↑ between the comment's lines,
  ↑ on the first goes back. Is ↓ going to the line before the next variation right for you?

### The study page, option B (§5.94, §5.95), and the desktop layout (§5.92)
- The installed desktop app, a study at your usual board size: the engine and the explorer on the
  left, the notation on the right as running text. Is the notation easier to read, with comments
  and variations breaking the line? Does the explorer have enough rows and columns there?
- The head: the select picks the chapter, "2 / 5" and "+" beside it. After picking one, ← → step
  through its moves at once (§5.95).
- At your board size, the comment panel under the board (§5.95): the move's comment readable
  there, its lines clickable, ✎ to edit; gone when the board is dragged as tall as the window.
- The engine's lines on one row each, and ⏭ in the move bar (§5.95).
- Study ↔ Train, on a chapter and in a running session: the board shouldn't move at all, only the
  sides (on a narrower window it may shift a little). Is the board's place in the middle right,
  and is the line list (now as wide as the right panel) good at that width? (§5.92)
- The study on the desktop with the engine on: the wider eval bar left of the board, its number
  at the leading side's end (try a position where Black is better, and a turned board). (§5.92)
- The explorer: short counts (872M, 1.39B), Move narrower, columns hidden and shown again from
  ⚙ → Columns shown. With Maia on, does everything fit without the sideways scrollbar? (§5.92)

### The study on the phone, and its ☰ menu (§5.87, §5.88)
- Phone: no page with a board scrolls sideways any more, and the coordinates sit inside the
  edge squares. Are they readable on your board colours?
- Phone, a study: the head shows the chapter's full name; New chapter, Chapter settings and
  Study settings are in ☰. Desktop: the head reads Study › Chapter.
- Desktop and phone, in a study: the bar under the notation is ☰ ⏮ ◀ ▶ ⏭ (and ✎ ⋯ on the phone).
  ☰ opens Explorer, Undo, Redo and Copy FEN; is anything you reach for often now a tap too far?

### The board's size (§5.79)
- Desktop, then phone: drag the grip at the board's bottom-right corner on a study; the training
  and practice boards are the same size, and stay so after a reload. A double click on the grip
  gives back "as large as fits". On the phone: is the grip easy to catch, and does it get in the
  way of anything under the board?

### Copy FEN, the explorer without games, Maia's columns, Analyse's side, ← (§5.77)
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

### The move menu on the desktop, and Add alternative (§5.69)
- Desktop: the ✎ and ⋯ buttons are gone from the move buttons (right-click a move for its menu;
  right-drag on the board to draw). The phone still has both.
- "Add alternative…" in the menu of an own move in a repertoire chapter (§5.91; was a card panel):
  the board shows the position before the move, the move you play is saved as an alternative (and
  listed in that menu as "Remove alternative …"). On the phone, is tapping a piece and its square
  on that board as natural as in training?
- **Checked**: tests on a desktop and an emulated phone only.

### The branch picker, the move menu's views, the explorer's waits and columns (§5.67)
- The branch picker in the chapter view (Qchess's): → or ▶ on a move where the line branches opens
  the list of moves under it; ↑ ↓ choose, → ▶ or Enter go on, a tap on a move goes along it, ← or
  Escape close it. On the phone, does the list sit where you'd look (under the move, or above it
  when there's no room)?
- "Read from here" and "Play from here" (now "Quiz from here") are only in the move menu now
  (right-click, long-press, or ⋯): the panel has their room back.
- The explorer stuck on "Asking…": fixed where it was found (the panel's request shared with the
  Practical search of the move before, and dropped with it when the board moved on), and a request
  Lichess or ChessDB leaves unanswered for 30 s now ends with "didn't answer in 30 seconds" and
  Retry. If "Asking…" ever stays again, note the position and whether Prac was computing.
- Explorer: Eval right after the move (Move 56 px and Eval 48 px on the desktop, 52 and 46 on the
  phone); "⇅ Sort" no longer cut to "Sort l" with Maia on. (This replaces §5.38's "Eval column
  further right".)

### The coverage report (§5.26, Phase 2)
- A coverage report (desktop) of a real course (a reference study imported from the owner's
  Chessable export) against the real repertoire, from the course's ⚙ → Coverage…: the counts
  (present, missing, alternatives), whether the ranking's order matches the owner's sense of what
  is met most, the number of positions asked and the time, and one line added to a chapter and
  seen there (and on the phone after a sync).

### The explorer panel, its cache, the Practical column and the local explorer (§5.22–§5.25, §5.34, §5.38, Phase 2)
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
- §5.38: the explorer's bars lined up on real counts (up to 1,531,092,892); the Practical
  column's "+" on a row's hover (faint on the phone).
- §5.22: a reload answering from the cache (the panel fills at once on a position seen before).
- §5.24: the Practical column on the desktop beside q_extension's column (same positions, filter
  and token; the values within a point at the same depth, the prepared bars likewise); the
  request counts after ten minutes of use (Explorer settings shows this tab's); on
  the phone, a search's time and the battery over a session; a long-press on a cell leaving a
  move out.
- §5.34: the Practical column with Maia on (desktop): beside q_extension's column with its Maia on,
  at the same filter (values within a point at the same depth; q_extension's Maia rating is the
  filter's too), a thin position turning purple, the Prac title switching to Maia's values; on the
  phone, a search's time with Maia.
- §5.25: the local explorer on the desktop, once `explorerdb serve` has the change at the end of
  this file: the address in Explorer settings, Test (Chrome asks once for the local network: allow
  it) showing the index, then the Lichess tab named Local answering with no login, and the
  Practical column computing faster (no Lichess budget).

### The engine panel, Maia, the analysis board (§5.30–§5.35, Phase 3)
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
- §5.35: the analysis board (desktop and phone): a FEN pasted and analysed; "Analyse from here"
  on a chapter's move, a line played and added back (on the other device after a sync); the
  board as left after closing the app.
- Stockfish 19 and threads are under 12, Settings and sync.

### Transpositions and clickable lines on the real repertoire (§5.10–§5.12, Phase 1)
- §5.10: the Read and Interactive views on the phone and the desktop, from the chapter view and
  the move menu: reading a long line with comments (the text size, ← →), playing a line by tap
  and drag, and the walk following a variation's move.
- §5.11: the transposition badges on the real repertoire (how many moves carry `⇄` or `+k`,
  whether the marks crowd the notation on the phone, the time the chapter view takes to open a
  big chapter); copy continuation pasted where the owner uses it.
- §5.12: clickable lines in the owner's real comments (Qchess's and Chessable's notation): which
  groups become lines and which stay remarks, where each line starts, line jumping with → at a
  line's end; previews on the phone (tap a move, ◀ ▶ Back, tap the board) and during training.
- §5.16: the move's wider hitbox, the badge pills and the bold blue lines in the notation.

## 3. Training

### The wrong move shown (§5.158, 2026-11-10)
- **A wrong move in training**: its square goes red with a ✕ (the square it came from faintly)
  for about a second after it is taken back. Is it long enough, or too much?
- "?" on the desktop lists the screen's keys: see 13, The spike and installation. Sounds: see 12,
  Settings and sync.
- **Checked**: unit tests and Playwright (desktop and emulated phone); nothing live yet.

### On a phone, Next right under the board (§5.133, 2026-10-27)
- Portrait, training the queue or a line: at a line's end "Next line" (or "Finish") should sit
  beside "Line done · Next: …" under the board, reachable without a scroll, and Hint greyed out
  where it was. A line trained from the line list: "Next line" in the same place.
- Idea cards' buttons under the board are under 9, Ideas.
- **Checked**: Playwright on an emulated Pixel 7 (and the desktop unchanged); not on a device.

### The pace of auto-played moves (2026-10-22)
- Training settings ⚙ → "Pace of moves played for you": pick Fastest (250 ms) and run a session
  with auto-play on; moves should come quickly but still be followable. Try Custom at 100 ms.
- Custom with “Pause between lines” (say 3000): the next line should come after that long.
  Empty: two moves' time (four when a picked line goes on to the next by itself).
- The pause to look: after a wrong move, between a shown sequence's moves and before a comment
  line's first move. Empty: two moves' time.
- Changing the pace in ⋯ mid-session, or Save in the settings mid-session, applies from the next
  move. The Ideas player steps at twice the move time.
- **Checked**: unit tests only so far (the trainer's waits, the stored settings); not live.

### Difficult lines (§5.124, 2026-10-18)
- On the training card, "Difficult lines (n)" when any move has two lapses or FSRS difficulty 7 or
  more. Are the lines it walks the ones you find hard? Is the count sensible on your real history
  (too many, too few)? A move not due answered there must leave its "Due …" in the line list
  unchanged; a due one is graded as in the queue.

### A misclick taken back (§5.123, 2026-10-18)
- Train fast and slip: after a wrong move, "Misclick" (beside the note under the board on the
  phone; "Misclick: take … back" in the panel, or Backspace, on a desktop) should take it back,
  and the right move next should count as right first time. Is the button where your thumb is
  when it happens? Does a misclick followed straight away by the right move (too fast to press
  it) happen often enough that you'd want to take back an answer already recorded?

### A line in the queue starting where it branches from the last (§5.121)
- Training settings → In the day's queue → A line starts: "Where it branches from the last line".
  Then train a day with several due lines in one chapter: the chapter's first line starts at move 1;
  each next one starts after the last move it shares with the line before (the board doesn't jump
  back to move 1), and the moves from there are played or asked as Auto-play says. A line of
  another chapter starts at move 1.
- With Repetitions on and a new move on such a line, the second pass starts at the same place.
- Say whether starting right after the shared move (no replay of the move before it) reads well,
  or whether you'd rather see one move earlier.

### The buttons stay put on the phone (§5.7, 2026-10-17)
- On the phone, train a line and miss a move: through "Not in your repertoire", the line's end
  ("Your mistake again: each right 2 times in a row", "mistakes left 1") and the retry, Hint and
  the buttons beside it should not move. The space under the board is a little taller now (two
  lines kept for the feedback); say if it costs too much.

### Auto-play set apart for the queue and for Learn and a line picked (§5.113, with §5.106, §5.107 and §5.78)
- Training settings: Auto-play and "A line starts" twice, under "In the day's queue" and "When
  learning, or a line picked". Your stored settings carry over: the old one auto-play setting in
  both (so set the learn/pick one to Off), "From the start, played" as From the start, and
  "asked" as From the start with that context's auto-play Off.
- Queue on "Moves answered right this session", From the start: a move not answered yet in the
  session is asked, before the first due move too; answered right, it is played the next time.
- Learn and a line picked with auto-play Off: every move asked, on every pass, nothing played for
  you but moves set to "Always play this for me" (§5.78).
- §5.107: with Auto-play "Moves answered right this session", miss a move, then answer it right
  (in the retries at the line's end, or on a later line): the next line through it should play it
  for you.
- §5.106: in the day's queue a review line now goes on past its last due move to its end (or
  stops after your last move before a move you've never been taught). Every move you're asked for
  the first time in the session counts: a miss shows up in the session's numbers and the move
  comes back soon. Does a session feel too long now? If so, say so: the cut at the last due move
  can come back as a setting (§5.106, "Kept for later").
- §5.106: with "At its first new or due move" and auto-play on, the moves after the last due one
  are played for you at the pace: worth keeping, or would you rather the line stopped there?

### Analyse on every board (§5.112)
- Training (the queue, desktop then phone): with a move asked, press Analyse: the board should show
  the line to here, from your side. "← Back to training": the move shown with its arrow (it counts
  as hinted); play it and go on. Again at a line's end, coming back by the phone's Back gesture.
- A game (Games → a game, stepped to a move), the game cards, a practice game in play, and the
  Read view: Analyse, then back: each should be where it was left.
- The storm's Analyse is under 5, The storm.

### Pin while retrying, learning's mistakes, no arrow in auto-play (§5.110)
- Mistakes → Retry (or Drill) with a mistake not pinned: "Pin this mistake" should show from the
  line's start; pressed, it goes, and the mistake should be under Pinned.
- Learn a line with New moves "Try first" (or a sequence): play a wrong move or press Hint on a
  new move; at the line's end it should be asked again ("Mistakes retried"), before any repetition.
- Auto-play through moves learned today: no green arrow should flash before them.

### Lines from the comments quizzed in review (§5.98, §5.99)
- In the day's queue (or a line picked that teaches nothing), on a line whose comments hold lines
  starting with the opponent's move: the "Comment lines" chip appears in the counters' row when the
  board reaches where one starts. Hover it (tap on the phone): each line's start on a small board,
  its first move as an arrow; one marked `!` or `!!` in gold. Is the chip noticeable enough, and
  quiet enough?
- At the line's end the lines are played on the board: the opponent's moves played, yours asked. A
  line where one of your moves is marked `?`, `?!` or `??` never comes. Nothing is graded.
- Try the setting in the training settings (all / important / pick / off), and "At the end" on the chip.
- §5.99: at the line's end nothing starts by itself: "Next line" or "Quiz lines (n)". Open the chip
  mid-line and press "Quiz now" on a line: it is played from where it starts, then the move you were
  asked is asked again. Is "Quiz now" easy to reach on the phone (tap the chip)?
  On the desktop a click on the chip itself quizzes the line met last (its tooltip names it).
- On your real courses: do the lines quizzed stop where they should (a second branch written in the
  same parentheses, words, passes)? Any line you'd expect that never comes, or one that shouldn't?

### The training screen's comments and line list (§5.93)
- Train a line with comments: they shouldn't flash as the moves go by, only show after a wrong
  move, at a taught or shown move, and at the line's end. At the end, click a move in a comment's
  line and step with ← → (desktop); Escape goes back.
- Starting a session (desktop too) folds the line list; "Show lines" opens it.

### "Train" from the study selects the line shown (§5.83)
- Desktop and phone, in a repertoire study: browse to a move in a side variation and press Train.
  The training screen should name that line (highlighted in the list on desktop), show the board
  at that move, and start nothing until "Train this line". At a fork, the topmost line.
- Train a line, press Study, browse to another variation, press Train: that variation selected,
  not the old session resumed. Pressing Train without leaving the line resumes the session.

### The study's arrows at a line's end, and Read in a session (§5.78)
- At a line's end (Learn holding at "Next line", or a picked line's end): the study's arrows of the
  last move are on the board (the Benoni line's b5, h6, a5).
- "Read" during a session and at its end: the whole line, ← → and the move list, the comments;
  "Back to training" (or Escape) goes on where it was, a move due to be played coming only then.
  On the phone, is the Read button's place in the actions right?

### Repetitions, and mistakes asked again (§5.77)
- Phone, then desktop: learn a new line (the queue, Learn or a line picked): it is walked a second
  time ("The line again: 2 of 2", the moves taught asked with no arrow) before the next line. A
  mistake in a review comes back at the line's end, from the opponent's move, until right twice in
  a row ("Your mistake again: 1 of 2 right in a row"). Is the pace of the retries right, and is two
  a good number for both? (Training settings → This device: Repetitions, Mistakes retried.)
- Mistakes → Drill (or Retry, or the pins): a move missed again comes back after the others,
  until all are right.

### Prioritize a study, and paused lines (§5.70)
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

### Alternative moves (§5.18)
- Desktop and phone: a wrong move saved as an alternative from the training screen, taken back
  for free when played again on another line or another day (and on the other device after a
  sync), listed in the move's menu in the study and removed there (§5.91).

### The second and third testing notes (§5.17, §5.38)
- §5.17 (desktop and phone): whether the quieter feedback line is enough; "Let me try first" for
  new moves; "Go on to the next line" on a picked line and in Learn; the four auto-play modes
  against what lichessable does; time travel's banner (now in Debug, §5.159), +4 hours bringing
  the day's taught moves due, and "Back to now". Difficult moves are two lapses or FSRS
  difficulty 7: say if the `difficult` mode asks too much or too little. (§5.17's defaults
  themselves were replaced by §5.78 and §5.113, above.)
- §5.38 (desktop; the phone for the dialogs): the training settings and the other dialogs wider
  on the desktop, and closed by a click outside them; "Show a sequence" for new moves on a real
  learning session: whether the sequence's length should count new moves (as built) or all moves,
  whether twice the pace is right for watching, and whether Chessable shows the whole variation
  instead.

### A real day's training (§5.1, §5.5, §5.7, §5.8, §5.15, §5.16, Phase 1)
- §5.16: the line list on desktop and phone (a chapter opened, a line picked, due or not: its due
  moves graded, its new moves taught, the rest asked with nothing recorded; "Learn" on a
  chapter; "Next line"); the daily limit changed from ⚙ and the same on the other device after a
  sync; the "Nothing to train" screen; "Study" from it and from a line. (The line list itself,
  a chapter opened and a line picked, was reported working on 2026-10-07.)
- §5.1: the index build time on the phone, with the real repertoire. (The faster start, §5.156's
  idea 10, was declined on 2026-11-10; this number is still worth a look in Debug.)
- §5.5: the queue simulation on the real repertoire, to choose the default daily limit (needs
  the data repo, by `REPWORKS_FIXTURES`).
- §5.7: a real day's training session with the real repertoire (phone, then desktop): moving by
  tap and by drag at the pace, the feedback line, the screen staying on (wake lock), the time a
  session takes; the home screen's counts the same on both devices after a sync. The index
  build time is in the Debug panel (§5.1's target: under 300 ms on the phone).
- §5.8: a session's mistakes retried and drilled on the phone; a pin made on the phone appears
  on the desktop after a sync, and comes due 30 minutes after it was made.
- §5.15: train ↔ study during a real session (desktop and phone): "Study" from the training
  screen opens the line at the board's move, an edit there, and "Train" takes the session up
  again with the edit in it and nothing asked twice. Whether the chapter ⚙ by the phone's chapter
  menu is easy to find.

## 4. Show and grade

### Show and grade retries its mistakes (§5.127, 2026-10-19)
- Show and grade from the training card: miss a move with 4 (or the ring). At the line's end the
  board goes back to the move before it, the note reads "Not a new line: your mistake again" in
  the warning colour, then "Your mistake again: show it"; 2 shows it, 2 again (known) ends it. Is
  it clear enough that this is the mistake and not a new line? Learn in show and grade should not
  retry.

### Alternatives shown by Space (§5.114)
- Save an alternative somewhere in a line (a wrong move → "Save … as alternative", or the study's
  move menu → Add alternative…), then reach that move in show and grade and press Space on the
  ring: a blue arrow for each alternative, named under the board; Space again hides them. Also
  once the move is shown (2), before grading it. Where none is saved: "No alternatives saved here".
- Check that the ring's Space reaches the page as a key (not scrolling it or pressing a button).

### The ring, and switching a review to show and grade (§5.9, §5.16, Phase 1)
- §5.9: show and grade on the phone with the owner's ring: whether its buttons arrive as key
  events or through the Media Session API (and whether the silent loop keeps that routing), with
  the screen on and off; speech on Android.
- §5.16: "1" and the button switching a review to show and grade and back.
- The storm's show and grade is under 5, The storm.

## 5. The storm

### Maia's likely moves searched by the home's deepening, and kept (§5.161, 2026-11-10)
- On the PC, with Maia on and the positions rated: open the storm's home with "Stockfish re-scores
  the positions" on. Once every list is scored, "Scoring Maia's likely moves: n of m searched"
  should count up (open it for each engine's row), and the Stockfish line's "· n of Maia's likely
  moves to search" go down. How long does it take on your repertoire?
- Then, in a set or a storm (on the PC or, after a sync, on the phone): a natural-looking move
  outside the 12 that Maia gave 20% or more at your rating should be graded at once, even on the
  first card and after the app was closed.
- On the phone (deepening is off there by default): positions the PC or the cloud searched should
  grade such moves at once after a sync.
- **Checked**: unit tests and Playwright (desktop and emulated phone, a fake engine: the searches
  kept, and the move graded with no search after a reload); a previous build's reader run on a new
  line (it reads it, less the new field). Nothing live yet.

### Maia's likely moves searched while you think (§5.157, 2026-11-10)
- With Maia on the device and the positions rated: in a set, think for a few seconds, then play a
  natural-looking move that isn't among the 12 moves Show and grade would draw. If Maia gave it
  20% or more at your rating, the verdict should come at once instead of after a second or two
  (on the phone, up to 8 s before). Its source still reads "the position after it was searched to
  depth 20".
- The timed storm on the phone: does the extra searching while you think make the board feel
  slower or the phone warmer?
- **Checked**: unit tests and the storm's Playwright tests (desktop and emulated phone, a fake
  engine); nothing live yet.

### Empty states, and the count on the home (§5.158, 2026-11-10)
- The storm with nothing gathered says "Gather positions first" under Start (and, with positions
  but none for the focus, says so).
- "Storm · n ready" on the home: see 1, Home and Today.
- **Checked**: Playwright (desktop and emulated phone); nothing live yet.

### The storm's gather from a cloud session (§5.155, 2026-11-06)
- On each device, sync, then open the storm. The positions the cloud gathered come in "from other
  devices", and "Show and grade (n)" counts the ones it scored to depth 24.
  - Deal some. Do they read like the ones the PC gathers: the line names, the move that arrived,
    the verdicts?
- Clear on one device. The cloud's positions should go from that device only, and stay gone after
  the next sync.
- The cloud shows up in the data repo as `devices/<id>.json` named `cloud`, with commits named
  `cloud: n storm positions`. Is that the name you want?
- After a run with `--all-devices` (and `--study`/`--chapter`): on the device that gathered a
  position the cloud scored, sync, then open the storm on that chapter. Does "Show and grade (n)"
  count more positions at depth 24? A position the PC already deepened itself is scored again in
  the cloud (it can't see the PC's store), which costs time only.
- **Checked**: a live run in this cloud container pushed 386 positions to your data repo (device
  `cloud`, `y1ZUwuqC`, 2026-11-06), 114 of them scored to depth 24, and the repo validates. Also
  unit tests of the loop and the script's data side, and the storm's Playwright tests with the
  app's gather now through core (desktop and emulated phone). For `--all-devices`, `--study` and
  `--chapter`: unit tests, and runs on a scratch copy of your data repo ("Scandi Gambit" ›
  "Accepted - Main lines": 18 of the devices' positions scored into the cloud's files; 11
  gathered, all on that chapter's lines), nothing pushed. Not yet on your devices.

### After a storm verdict: refutation, line, Continue (§5.154, 2026-11-06)
- A Mistake or Blunder (a set, or a timed storm with Pause or `r` quickly): Show refutation. Is
  the line the real punishment, ten plies with the real engine? Step it with ← → (or ‹ › on the
  phone), past its end, and try a move of your own on the board. Escape or ← Back puts it away.
- A Great move or the top move: Show line, the same way. Would you rather see the best move's
  line here when yours was Great but not the top move? (Today it is your move's line.)
- A Good or Great move: Continue. With Maia downloaded the reply says "Maia <your rating>"; do its
  replies feel like your opponents' (too sharp, too random)? `STORM.replyPrecision` is 0.75, as
  practice's default. Without Maia, Stockfish replies: is that worth keeping, or should Continue
  wait for Maia?
- The continued card's verdict: how long it takes on the phone and the PC (the look-ahead searches
  it while you think; a quick move waits for two searches, up to about 16 s).
- Nothing of a continued card is counted: check the session's points, the set's tally and the
  record afterwards. Is that what you want, or should continued answers count somewhere?
- The timed storm: after a good move the next card comes in 1.2 s; is that long enough to press
  Continue (`c`), or should the buttons pause it?
- **Checked**: unit tests and Playwright with a fake engine (desktop and emulated phone), the
  Maia reply with the real Maia model in headless Chromium, screenshots of each state. Not on your
  devices, not with the real engine's lines.

### Show and grade in the storm (§5.152, 2026-11-06)
- Storm → "Show and grade (n)": n is the positions Stockfish has scored to depth 20 or more. Is it
  a useful number on your repertoire, or should the home deepen more before it's worth it?
- A card: think, press 2 (or Show the moves). Are the arrows readable on the real board, phone
  and PC: the best mint and widest, Great and Good green, Inaccuracy grey, Mistake amber, Blunder
  red and faint? With twelve arrows, is it too busy? (Options: leave out blunders, or show only
  Good and better until asked.)
- Found (2) goes straight on; Missed (4) keeps the card for a look, the next press goes on. Tap a
  row or play the move for an exact grade. Does the flow feel right, and with the ring (its media
  keys, screen on and off)?
- On the phone: the buttons right under the board, the moves below. In view without scrolling?
- Found is written as Good and Missed as a Mistake (no move): does the storm's record read right
  to you with them in it?
- **Checked**: unit tests and Playwright with a fake engine (desktop and emulated phone),
  screenshots in headless Chromium. Not on your devices, not with the real engine's lists.

### Try again always, and the best move celebrated (§5.135, §5.131, §5.85, §5.73, 2026-10-28)
- Storm (timed and a set) and the game cards: play the top move. The panel should read
  "★ Best move!" in mint with a gold star, and the board should burst on the square (glow, ring,
  sparks) with a ★ badge. Is it clear and satisfying, and not too much? On the phone too.
  (§5.131)
- In a set, play a good or the top move first time: Try again (`t`) should be beside Next
  position; another move after it reads "Counted: the first answer", and the summary counts the
  first answer only. (§5.135)
- In a set: miss a card, Try again, then a good move that isn't the best: Try again and Show the
  move stay, the best hidden; then the top move: Try again still there (beside Next position) and
  Show the move gone; Try again, another move, the first answer still "Counted". (§5.85, §5.131;
  since §5.135 Try again never goes.)
- §5.73 (desktop, then phone): a set with a wrong first move, then Try again with a good one: the
  card says "Counted: the first answer, … · Mistake"; the review keeps Mistake on that row, with
  "Then …: not counted" under the verdict, and "found" and the average given up count the first
  answers only. On the desktop the position list sits beside the board under Try again and
  Analyse, scrolling itself; "Show lines" puts each position's line under its row and is
  remembered.
- In a timed storm, press `t` (or Try again) on any verdict before the next card comes: the card
  stays, the clock stopped; play again, nothing scored; Next goes on with the clock running.
  (§5.135)
- **Checked**: Playwright (desktop and emulated phone); the look of the burst only in a headless
  screenshot, not on a device.

### Puzzles in a focused storm (§5.125, 2026-10-18)
- On the storm's page, pick a focus chip, tick "Puzzles too" under the chips, and start: puzzles
  should come among the focus's positions at your share of cards. Is the checkbox easy to find
  there, and is the mix right, or should a focus have its own share?

### A storm move graded over two depths (§5.120)
- On newly gathered or deepened positions (the change doesn't reach lists kept before), play sets
  and storms as usual: verdicts near a band's edge should flip less. Report any that still look
  wrong as before, with the analysis board beside it; the board shows one depth's score, the storm
  the mean of two, so their numbers differ a little.
- Nothing should be slower: the deepening's times in "Scoring" and the verdicts' waits as before.

### Level up, and too easy counting great moves (§5.118, §5.117)
- §5.118 (desktop and phone): under Hard for you, "Level up: Maia at 2200 finds a good move 25
  points more often than at 1800"; the Level up chip counts more positions than the old rule did.
  Changing a rating to one off the ladder (1900, say): "Maia: n of n rated" drops and climbs back as
  Maia rates them there; the count follows. Whether 25 points is a good default.
- §5.117 (desktop): the home says "Maia at n finds a great move 95%…", and "n too easy" is fewer
  than before (232 on 2026-10-17's Whole repertoire); a card may now say "finds a good move 96%"
  where that good move isn't great.

### Gathering balanced across chapters (§5.116)
- In a repertoire with many gathered positions, add a chapter (or pick one with few), then gather
  on "Whole repertoire": the first walks should name that chapter's lines, and other chapters
  join once it has about as many positions per line as they do. Overnight, the store should stay
  in proportion rather than fill from one chapter.

### Overnight gathering, shared positions, focused scoring (§5.102–§5.105)
- §5.105 (desktop): an overnight gather with Focused on: the status shows each pass's scoring
  running until "n of n scored" before the next pass walks. On the home, with Maia's ratings in,
  "n too easy, left out" in the count; a storm deals none whose card says Maia at your rating finds
  a good move 95% or more.
- §5.104 (desktop): with positions to score, open "Scoring: n of m searched": each engine's row
  counting up its depth and seconds, the last positions listed as they finish, the time left
  plausible after a few minutes; how many are stopped by the 600 s limit (it should be few or
  none) at depth 24 on this machine (focused on and off). The console's `[storm deepen]` lines.
- §5.103 (desktop): Storm → More settings → "Focused: n engines at once" ticked, with positions not
  yet scored: the status line reads "scoring, n at once…"; the system monitor shows the CPU near
  full (it was about half); how many positions an hour against the setting off (the home's count
  before and after ten minutes, each way); the page stays responsive; memory with n engines. Then a
  storm: it starts at once, and Task Manager shows the engines gone back to one.
- §5.102 (desktop overnight, then phone): on the desktop, Storm → whole repertoire → "Keep going
  until stopped" → Gather positions, the laptop on power, the page in front; in the morning the
  status line (which pass, how many stored, any failures waited out), whether the screen stayed
  on and the tab wasn't suspended or discarded, and "Stockfish: n of m scored". Then the phone:
  open Storm (or Sync now there): "n positions here came from your other devices" and the same
  count ready; a storm from them. In the data repo, `storm/<desktop id>/` holds the night's files
  and nothing from the phone. Clear on the phone, then a sync: still cleared there, still kept on
  the desktop. How long the phone's first pull of the positions takes.

### Kinds of storm position and the focus (§5.100)
- Desktop and phone: Gather again (Punish, Hold and Convert come only from new gathers), let
  Stockfish and Maia finish, open Focus. How many positions does each chip have? Any chip with
  almost none, or almost all, needs its number changed (`STORM` in `core/storm/config.ts`).
- Try a storm per chip, and a pair (Critical + Quiet): do the positions feel like the kind named?
  Only move: one good move? Punish: did the opponent just err? Don't take: was the capture
  tempting? The tags shown after each answer: right?
- The classic storm: does it feel easier or harder than before (easy positions now come last)?

### Stockfish alone judges a storm move, at depth 24 (22 on a phone) while you think (§5.84, with §5.45)
- Desktop (Stockfish 19, 4 threads) and phone: the storm's home with "Stockfish re-scores the
  positions" on: "scored to depth 24" (22 on the phone) rising, how long a position takes, and
  whether the phone gets hot. Whether the phone should do it at all (off there by default, §5.45).
- A set, thinking 15–20 s on each card: the verdict should come at once and say "by Stockfish
  d24" (d22 on the phone), or at least d20. Moving at once still works (two searches at d20).
- A timed storm on positions not yet deepened: how long the verdicts take, on each device, and
  whether that spoils the storm.

### Maia in the storm: difficulty and the unintuitive storm (§5.82)
- Desktop and phone: on the storm's page with Maia downloaded (or "Get Maia…" there), the
  "Maia: n of m rated" count should rise to m within a few minutes, and the page stay responsive
  meanwhile; on the phone, whether rating beside Stockfish's deepening is too hot or slow.
- An unintuitive storm: do the positions feel like ones where the natural move is wrong? Is the
  difficulty shown after each answer believable against how hard the position felt? Is "an
  inaccuracy or worse" the right bar, or should it be a mistake or worse?

### Saved as a mistake or a sequence (§5.74)
- Desktop, then phone: in the storm's review, "Save as a mistake" on a mistake and on a great
  answer, then both in Games → Review ("Find a better move than …" and "Find the best move").
  Analyse a storm card and "Save as a sequence…": the drill starts at your move. On the analysis
  board from the home screen, a few moves and "Save as a sequence…", then drilled.

### Clearing positions (§5.72)
- "Clear positions…" on the storm's home, for a chapter, then the whole repertoire: the count goes
  to 0 for that scope only, the record stays, and a new gather fills it again.

### The storm reworked, and Analyse in it (§5.71, §5.112)
- §5.71 (desktop then phone): a storm on the real repertoire after a fresh gather: the cards from
  many line ends (the line under the chapter name changes from card to card, and a second storm
  starts on other line ends); the gather stopped after a minute still covering many line ends
  ("from n line ends" on the home); the move staying on the board through the verdict, Pause and
  Next (Space); an arrow (right-drag, or ✎ on the phone) staying until the next card; Analyse from
  the review and from a held set card, then "← Back to the storm" and the browser's Back, the
  review at the same position; the analysis board from your side with the move that reached the
  card one step back. Whether 1.2 s after a good move is long enough.
- §5.112: the storm, timed: Analyse on a card before moving: back, the card says "Analysed — no
  answer given", the clock stopped; Next goes on with the clock running.

### Collect all, and Practise from here (§5.68)
- "Collect all" on the storm's Puzzles card on the desktop (a repertoire with more than 100 index
  files left): it runs through, Stop ends it, a reload keeps what was read, and it goes on while
  you look at another screen; "Practise from here" in a study's move menu starts a game as the
  chapter's side from that position.

### The storm's scope, and the gather's Stop (§5.67)
- Storm: Study and Chapter pickers on its home (the scope the storm deals from and gathers for);
  the record shown for the scope, with a table by study (whole repertoire) or by chapter (a
  study), each name opening its scope.
- Storm's gather: the request counts move as each request goes out, and Stop ends it at once (the
  walk under way is left out).

### Phase 4: gathering, the first storms, puzzles, the acceptance test (§5.41–§5.49)
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
- §5.47, §5.48: Collect puzzles on the desktop on the real repertoire (its estimate against what was
  downloaded, the time, how many puzzles), then on the phone over Wi-Fi; the dataset read
  cross-origin from the deployed site (D12); puzzles in a real storm and set at 25%: whether the
  disguise holds, whether the puzzles feel related to your lines, the share that feels right.
- §5.49: Phase 4's acceptance test (desktop and Android phone), then a week of daily storms.

## 6. Game cards and Games

### A game card's priority (§5.171, 2026-11-12)
- Games → a game: set a mistake's select to High priority; Review: is it asked first among the
  day's cards? On a card under review, press Low: the next session asks it after the Normal ones
  due. Does the row (Priority High · Normal · Low) sit well on the phone, before and after an
  answer?
- Make a sequence from a High mistake: does the dialog start at High, and the saved sequence keep it?
- Saving with a priority (§5.172): in a practice game's review, pick High beside "💾 Save as a
  mistake" and save; the select stays beside "✓ Saved". The same for a tactic found in a practice
  game, and for a storm card's "Save as a mistake". Is the saved card asked first in Review?
- After a sync, does the other device show the same priorities?
- **Checked**: unit tests and Playwright (desktop and emulated phone, fake data repo); not on your
  devices.

### The analyzer's games in the data repo (§5.163, 2026-11-10)
- After the analyzer's next run, on the PC with a checkout of your data repo:
  `node scripts/games-to-data.mjs <mistake-lab>/analyzer/analyzed_games.json <repworks-data> --dry-run`
  says how many games and months it would write. Then run it with `--commit` (or `--push`), or
  commit `games/` yourself. Is the size of `games/` reasonable (about 1 KB a game)?
- On each device after a sync, Games lists those games with nothing set up (the gist can stay or
  go). The game count and today's game cards should match what the Gist gave.
- Refresh says "Data repo: unchanged since the last read." until the converter writes again.
- If your chess.com or Lichess names aren't in the analyzer's `usernames`, add them with `--name`:
  is the side right in every game?
- **Checked**: unit tests (every fixture game read back the same, with the same items; the script
  on a scratch checkout) and Playwright (desktop and emulated phone, a fake data repo). Not on your
  real analyzer output (it isn't in the testing data repo), not on your devices.

### A game card's move judged without waiting (§5.151, 2026-11-04)
- Games → Review on the PC: play a wrong move, then Try again and other moves, quickly too (while
  the engine line is still showing, and after stepping it past its end). The judge no longer waits
  for the line's searches. How long is "Stockfish is judging…" now, and with which Stockfish
  version and threads (Engine settings on the study page)?
- After the storm's home has scored with Focused on, open Games → Review (or practice, or an
  endgame): the engine is now one again, on the threads chosen for the device.
- **Checked**: the order of the searches by Playwright with the fake engine (desktop and emulated
  phone), the engine back to one after focused scoring, the engines' times to depth 18 in headless
  Chromium on a 4-core container. Not on your devices.

### The best move celebrated on a game card (§5.131, 2026-10-26)
- Play the top move: "★ Best move!" and the burst, as in the storm (see 5, The storm).
- Find a mistake's move, then Try again and play another: the "Recorded" grade stays.
- **Checked**: Playwright (desktop and emulated phone); not on a device.

### The ± Elo column (§5.126, 2026-10-19)
- Games page → Explorer: the "± Elo" column on your real games. Do the moves it marks red feel like
  the ones that cost you? Its title has the performance.

### A note on a game card (§5.91)
- On the phone: answer a game card, "✎ Add a note", draw an arrow with ✎ and a colour, play a line
  on the dialog's board and "Add to the note", type words, Save. The note shows under the verdict;
  tap a move of its line (the board follows; ◀ ▶ Back under it), "The note's arrows".
- On the desktop: the same with a right-drag for the arrow (Shift red, Alt blue).
- Save a practice game's mistake and a storm position as a mistake, and write a note there; in a
  timed storm the verdict should wait while the dialog is open. Next day, the card shows the note
  only after it is answered, on both devices after a sync.

### What was left of mistake-lab: the engine's line, the games' explorer, time trouble (§6 items 1, 4, 5)
- §6 item 1 (desktop, then phone): in the game cards, a mistake answered wrong: the engine's line
  under the board at the opponent's reply, stepped with ‹ › (← → on the desktop), past its end (a
  wait while Stockfish extends it), a move of your own on the board (a branch in brackets), back
  before your move (Try again); after a right move, Show the engine's line. Whether the lines read as
  mistake-lab's and the waits on the phone are bearable.
- §6 item 4 (desktop, then phone): Games → Explorer on the real games beside mistake-lab's Opening
  explorer: the moves and results at a few positions, the list filtered, the opening names; how long
  the first opening takes on the phone; a practice game from there titled by the opening.
- §6 item 5 (desktop): Games → "Hide time trouble ⏱": the counts beside mistake-lab's with its own
  "Hide time trouble" on; the game cards' queue with it on.

### Phase 5: the games, the game cards, the repertoire check, the migration (§5.51–§5.65)
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
- §5.64 (desktop): Games → Set up → "Move mistake-lab's progress here": the gist, Dry run (a
  token only if the gist won't read without one; it isn't kept), and read the report: the cards'
  counts against mistake-lab, the re-made keys, what is left behind. If it looks right, Run, then
  sync. Best done once the rest of Phase 5 is built (the saved items and plan cards show in the
  session from §5.56 and §5.61), and only once: a second run is refused.
- §5.65: Phase 5's acceptance test (desktop and Android phone), once the items above look right:
  1. Desktop: the migration's dry run (Games → Set up → Move mistake-lab's progress here), its
     report read; the run; the game cards' queue beside mistake-lab's for the same day.
  2. Desktop: a day's game cards (mistakes, tactics, advantages, plan cards, saved sequences); a
     practice game and its review; the repertoire check (deviations, weak spots, a checklist) beside
     mistake-lab's Repertoire tab.
  3. Phone: the game cards after a sync; a practice game with voice; a plan card.
  4. A week with mistake-lab closed. Then mistake-lab retires (D20); its analyzer keeps running from
     its repo (D8), its output converted into the data repo (§5.163).

## 7. Practice and the checklist

### A line added to the checklist by hand (§5.142, 2026-10-31)
- In a repertoire study, go to a move deep in a line the checklist doesn't list (a second-choice
  move of yours, say), ☰ → "Add to the checklist". Also add a whole line from the training
  screen's line list (a line's ⋯). On the checklist page both are listed after the made lines,
  marked "added"; Make again and check they are still there, and that the number of other lines
  is the "Lines" asked for. Drill one at Easy.
- On the phone after a sync: the same added lines. ✕ on one there asks first and takes it out;
  back on the desktop after a sync it is gone.
- The deep line you added on 2026-10-31 that couldn't be found should now be at the end of its
  study's block, marked "added" (and "paused in training" if its lines are paused).
- Is the ☰ menu (the line to the move shown) the right place, and should an added line come first
  rather than last?
- **Checked**: unit tests and Playwright with the fake data repo and explorer (desktop and an
  emulated phone), and screenshots in headless Chromium; not on a device.

### Draws in practice: repetition, fifty moves, Offer draw (§5.137, 2026-10-30)
- In a checklist drill, shuffle a piece back and forth so that a position from the line's lead-up
  comes back: the game should end "Draw by threefold repetition." on its third time, the lead-up's
  occurrence counted, and the line's chip count it as a draw.
- In a game from a position, Offer draw early, or while one side is clearly better: "The opponent
  declines the draw.", and the button stays off until you move. In a level position from move 20,
  after five level moves: "Draw agreed."
- **Checked**: unit tests and Playwright with the fake explorer and engine (desktop and emulated
  phone); not on a device.

### A move told worse than good searched again in practice (§5.136, 2026-10-28)
- With Move feedback on, play a move the analysis board likes (a top line at depth 24) where the
  engine is close between moves, like the 14...Qh4 game. The label should not say Blunder or
  Mistake; at most Inaccuracy when the moves are close. A move that is a real blunder should
  still say Blunder, a few seconds later than before (the second search).
- **Checked**: the app's search and judge under Node (both engines); the built app in headless
  Chromium on SF18 one thread and SF19 four threads, the owner's game replayed; Playwright with
  the fake engine (desktop and emulated phone). Not on the owner's device.

### The repertoire check past a checklist line's end, at any ply (§5.132, 2026-10-26)
- Make a checklist with Plies cut short of where the study ends (say 4 or 6) and drill a line:
  once the game starts, play a move other than the study's at a position the study covers. It
  should be taken back with "… isn’t your repertoire: the study move is …", and the study move
  played then. Also in a game practised from a position past move 10, where the repertoire goes on.
- **Checked**: Playwright (desktop and emulated phone, the checklist drill); not live.

### Take back in practice games (2026-10-26)
- In a practice game against the database or Maia, Take back (beside Hint) removes your last move
  and the opponent's answer; pressed while the opponent thinks, its answer shouldn't appear.
- Not in advantage drills (graded).
- **Checked**: Playwright (desktop and emulated phone); not live.

### The variation checklist on its own page, synced (§5.130, 2026-10-26)
- Home → Repertoire's "Checklist" (or the line list's "Checklist…", or a chapter's ⋯): every
  repertoire study's checklist as a folded block, each side of a two-sided study on its own.
  Desktop, with the Lichess login: unfold a real study, Make; then on the phone after a sync the
  same lines, with no "Asking the explorer". Drill one at Easy there; back on the desktop after a
  sync, ✓ Easy and the block's progress bar.
- A list made before this build on a device is carried into the log once that device has synced;
  check it shows on the other device too.
- Pause a line (the line list's ⋯): the checklist hides it and says "1 paused line hidden",
  bringing in the next line where the list has a reserve; Make again leaves it out entirely.
- Hover the moves of a line on the desktop and tap them on the phone: does the small board follow
  well, and is it in the way of the line below? The opening name comes from your games when they
  are loaded (open Games once), else from the chapter the line ends in: are the names useful?
- Maia's rating per level (above the blocks): the drill says which it plays at. Does Easy at 1750
  feel right?
- §5.62's comparison with mistake-lab's list still stands (below).
- **Checked**: the tests and screenshots in headless Chromium (desktop and an emulated phone);
  nothing live yet.

### Practice: move feedback off by default, and the review reworked (§5.57, 2026-10-09 and 2026-10-07)
- A practice game from a position: no classification under the moves or in the feedback line while
  playing; tick "Move feedback" under the moves and they appear (the last move's word, the symbols),
  untick and they go; the setting is remembered on the device. The review at the end is unchanged.
- Desktop, then phone: a practice game's review (end one, or reopen one from Games' history). The
  eval bar beside the board, the classification badge on the move's square, ◀ ▶ (← →) through the
  whole game; a key move's card: Show best (arrows), Show line and Show refutation (each a line to
  step with ← → or ‹ ›, a move on the board branches it), ↺ Retry and its result card. Are the
  real Stockfish lines' waits acceptable on the phone, and is the layout what you wanted?
- **Checked**: the practice e2e (desktop and emulated phone), with a scripted engine for the
  review.

### Practice from a repertoire position, and tactics after a game (§6 items 2, 3)
- §6 item 2 (phone, then desktop): a practice game from an opening position of your repertoire
  ("Practise from here" on an early move): a move off the repertoire taken back (the study move
  named), the Hint, Ignore for this game; a premove while the opponent thinks; on the phone, switch to
  another app for a while and come back (or reload): "Game in progress", Resume; Stop & review: the
  corrected deviation in the key moves.
- §6 item 3 (desktop, then phone): a practice game with a tactic in it (an opponent's blunder you
  punish, or miss): after Stop & review, "Scanning for tactics…" then the list; Try, Save (then the
  tactic in the game cards), Discard. Whether it finds what mistake-lab's would, and how long the scan
  takes on the phone.

### Voice, the checklist beside mistake-lab's, a practice game (§5.57, §5.62, §5.63)
- §5.63 (phone): voice in a practice game (🎙 Voice under the moves; Chrome asks for the
  microphone once): moves said as mistake-lab taught them ("knight f3", "egg four", "castle"), the
  opponent's moves spoken, Confirm moves with yes and no; with a Bluetooth headset, whether it
  stays awake between moves; how often a move is misheard beside mistake-lab.
- §5.62 (desktop): Repertoire check → Variation checklist for a real study (with the Lichess login),
  beside mistake-lab's for the same study, lines and plies: the same lines in the same order (the
  explorer's numbers move a little with time), the time it takes; a line drilled at Easy (the
  lead-up, the game, Claim victory) and checked off, on the other device after a sync (the list is
  made on each device; the results and the lines taken out are synced).
- §5.57 (desktop, then phone): a practice game ("Practise from here" on a game's move, "Play on"
  after a mistake answered, "Practise" on the analysis board) with the Lichess login: the
  opponent's moves (the line under the board says DB, Maia or Stockfish) and whether they feel like
  mistake-lab's; Stop & review after five moves: the accuracy, the key moves, Retry, Show the line,
  Save as a mistake; the game in the Games list after a reload, and on the other device after a
  sync. An advantage card in the game cards: the drill, Claim victory at +10, and its grade. On the
  phone: the waits while each move is judged (Stockfish in the background).

## 8. Endgames

### From your courses (§5.175, 2026-11-14)
- Import the Silman PGN as a reference study (Import, kind "reference"), then Endgames → "From your
  courses" → "Score the course (326)": watch the progress ("Scoring: n of 326 chapters · m drills").
  How long does it take on the desktop, and on the phone? Stop it part way and press it again: it
  should take up where it left off. Roughly: 230 drills from the chapters as they are, about 25
  more as mates, some more where the course's first move is played for you, the rest "without a goal".
- Play a few from different parts: a Part 1 mate (win by mate), a king-and-pawn ending (a pawn
  queened), a Class C or D rook ending (hold, or win), and one whose chapter starts with the weaker
  side's move (the source line says "the course's first move, …, is played for you": do you have
  the stronger side, and is the position one worth playing?). Do the goals feel right: a win that
  ends too soon or never, a draw that is really lost, a position where the stronger side's goal is
  mate in 40 moves? Say which chapters, so the bands can be tuned.
- Part 8 (master-game fragments) and Part 9 (tactics): are they sensible as drills, or would you rather
  they were left out? (Remove takes one off; a study-level exclude isn't built.)
- Under the board, "The course's text": folded during the try, open when it is over. Is it the right
  text in the right order? The chapter's own link opens the study at the chapter.
- The groups: do the chips (Part n: …) read well, and is "Next due / Next new" within a group what you
  want?
- The informational variations: in the chapter view and the Read view, are the "(Or …)", "(Not …)"
  and "(The quicker …)" lines clickable now, and do they start from the right position? A remark that
  just names a move ("Black resigns after 5.Nf3") must stay text. Say where either goes wrong.
- A plan card (game cards): Show plan → the comment's lines clickable, the board previewing them.
- Playing through the course and deciding which are too easy: "Remove from the list" under the board
  (during the try or after it) takes the drill off and opens the next one, with an Undo note. Does
  it feel right to remove one mid-try (the try isn't counted), and is the next drill the one you
  expect? Back after a removal lands on the list.
- **Checked**: the rules, the scoring, the flipped chapter, the groups and the text by unit tests;
  the page and a drill by Playwright on desktop and the emulated phone, with a small synthetic
  course and the fake Stockfish. Not the real export, not Stockfish at depth 16/18 on real chapters,
  not Maia in these positions, not on your devices.

### A varied defence, and Maia alone (§5.174, 2026-11-14)
- Any endgame with Maia on the device (King in front of the pawn is quick): solve it, then Again:
  where Maia has a second likely reply (15% or more), the defence now tries the one you haven't met
  (King in front: 1.Kd5 Ke7 the first time, Ke8 the next). Over a few tries, do you meet new
  defences, and are they still moves a strong player would play?
- Miss one (a slip, a hint, or Restart): the next try plays the same defence again, so you can put
  it right. Is that what you want after a miss, or would you rather it varied then too?
- Endgames list → "Maia alone": the reply comes at once (no Stockfish search for it). Is the wait
  between moves now short enough on the phone? Does the defence ever let you off cheaply (a piece
  hung, a stalemate, the pawn given away)? Say where, with the position.
- **Checked**: the order, the memory and the board-only checks by unit tests; the page by
  Playwright on desktop and the emulated phone with the real Maia and a fake Stockfish (Ke7 again
  after Restart, Ke8 after an unfinished try, Maia alone with no search of its moves after a
  reload). Not on your devices.

### Premoves in every kind of practice (§5.173, 2026-11-13)
- Phone, then desktop: an endgame (Breakthrough is a good one): while Stockfish thinks, premove your
  next move (tap the piece, tap the square: both marked); tap an empty square and it is gone; set it
  again and it is played the moment the answer lands. One the answer makes illegal (a pawn it
  captures) just disappears. A pawn premoved to the last rank becomes a queen.
- The same in a practice game from a position, an advantage drill and a checklist drill (its lead-up
  too: premove your next prep move while the opponent's line move comes). Does a premove ever get
  lost or played when you didn't expect it?
- **Checked**: the endgame and checklist e2e (desktop and emulated phone), the practice e2e's premove.

### More endgames (§5.150, 2026-11-02)
- Home → Endgames: 23 positions in six groups, two of them new (Rook against a pawn or a minor
  piece; Minor pieces). On the phone the page is long now: is it still easy to find one, or would
  the groups be better folded, or with their own "Next"?
- Play the new ones (the square of the pawn, the rook's pawn, Vancura, rook against a pawn, knight
  and bishop against the rook, the wrong bishop, knight against a pawn, opposite bishops, queen
  against a rook's and a bishop's pawn): is the first move the decision the title promises, and
  does the method read right? Is any good move stopped as a slip? Say which, with the position.
- The two bishops' and the bishop and knight's mates are judged on their own line (+1.00 and
  +0.50, Stockfish scoring them about +2.4 and +1.6): a hung bishop or knight is stopped, a slow
  move isn't. The bishop and knight takes up to about 30 moves from this start; past 30 moves
  without a capture the fifty-move count shows. Does Maia defend them the way a person would
  (running for the wrong corner)?
- Rook against a pawn: won when the pawn falls, "The pawn has fallen: the rest is a rook mate."
- **Checked**: every start's first moves at depths 16 and 18 and play-outs with the app's judge
  and opponent under Node (Stockfish 18 lite, Maia 3; `scripts/endgame-check.ts`, PLAN.md §5.150),
  the pages by unit tests and Playwright with a fake engine (desktop and emulated phone), a
  screenshot of the list in headless Chromium. Not on your devices, not with the real engine in
  the browser.

### Repertoire endgames (§5.149, 2026-11-01)
- Endgames → From your repertoire → Gather from your repertoire (needs the Lichess login the
  storm's gather uses). It walks every line end's named games: how long does it take on the
  desktop and on the phone, and how many does it keep? Is the progress line clear?
- The list by category: are the categories the right ones, and are the positions ones worth
  drilling (an endgame you'd recognise from your openings, not a random late-game mess)? Say
  which are not, with the position: the condition (four pieces at most, a pawn, the first quiet
  moment with you to move) and the goal's bands (+3 a win, −1 to +1.5 a draw) can move.
- Play a few of each goal: a win ends when a pawn queens or you're 5 points up: is that the
  right moment to call it won? A draw is held for 15 moves: enough?
- Is the source under the board (chapter, line, players, moves after your line's end, the game's
  link) useful? Remove, the category chips, Next within the category.
- Gather more: older games (4 months back each time a gather finishes): does it keep finding new
  ones? On a second device the list is empty until it gathers too, but the tries made on the first
  show once it has the same positions.
- **Checked**: the condition, categories, walk and goal by unit tests and over 17 fixture games
  with Stockfish 18 lite under Node; the page by Playwright with a fake explorer, game export and
  engine (desktop and emulated phone). Not against the real explorer, not on your devices.

### Endgames defended by Maia, and a draw's attacker pushing on (§5.147, §5.148, 2026-11-01)
- Home → Endgames without Maia on the device: the list says "The opponent: Stockfish alone…" with
  Get Maia…. Download it there (about 60 MB, on Wi-Fi): the note says Maia 2600 defends now. Does
  the explanation read right?
- Play the ones where the test felt too easy (the king-and-pawn endings, Philidor, the rook mate):
  does the defence now put up the resistance a strong player would, the tricky moves included?
  Is any defending move silly (a piece hung, a stalemate that ends the drill)? Say which, with the
  position: Stockfish should have vetoed it.
- On the phone: is the answer still quick ("Maia is thinking…")? The first answer of a try may
  wait a moment for Maia to load.
- Philidor (§5.148): after five moves held, the pawn comes to e6 when it is safe; then the rook
  goes behind and checks. Does the drill now cover the whole method? "Hold with the opposition":
  the pawn walks on after four moves. Is a third of the drill the right moment, or should the push
  come earlier or later? Does the attacker still ever repeat moves until a threefold repetition?
- **Checked**: the measurement under Node (Stockfish 18 lite, Maia 3, Lc0; PLAN.md §5.147's
  table), the pick by unit tests, the page by Playwright on desktop and the emulated phone with
  the real Maia in Chromium and a fake Stockfish. Not on your devices, and not with the real
  Stockfish in the browser.

### Endgames (§5.145, §5.146, 2026-10-31)
- Home → Endgames: the list's small boards (§5.150 has the groups now). On the phone and the
  desktop: are the small boards readable?
- Play a few, including one you know well: does Stockfish defend (and, in Philidor and "Hold with
  the opposition", attack) the way you'd expect? Since §5.146 Stockfish answers at once and your
  moves are checked in the background: on the phone, is the answer quick now? At the end the game
  waits for the checks still out ("Checking your moves…"): is that wait short?
- Throw a win away and play on quickly (e.g. Kd2 in "Take the opposition", then another move
  before anything happens): the game stops back on Kd2 ("Found after you had played on…"), the
  later moves dimmed; Take back goes to before Kd2. Is it clear which move was the mistake? If a
  game finishes after a slip, the end names it ("the first slip was 1.Kd2 (1.Ke3 kept the win)").
- Throw a win away on purpose (e.g. Kd2 in "Take the opposition"): the game stops with "Kd2 lets
  the win slip", Take back, "Show a move that keeps it" (its arrow), Play on. Is any good move ever
  stopped as a slip? Say which, with the position: the line is +2 (a win) or −2 (a draw) on
  Stockfish's search, and the drills were played out against it here without a false stop.
- What counts: the first slip, a hint (H) or Restart counts the try as missed; reached cleanly,
  "Solved first time", back in 1, 3, 7, 14, 30, 60 days. Is that spacing right for endgames?
  After a sync, the other device's list shows the same standing.
- The rook mate is long: past 30 moves without a capture or a pawn move the fifty-move count
  shows; a win the rule would draw is stopped as a slip ("the fifty-move rule comes first").
- **Checked**: the positions and the judge by Stockfish 18 lite under Node (every first move, and
  each drill played out with the app's own judge), the pages by unit tests and Playwright with a
  fake engine (desktop and emulated phone), screenshots in headless Chromium. Not on your devices,
  and not with the real engine in the browser.

## 9. Ideas

### Model games: the plans and goals from a position (§5.141, 2026-10-31)
- Read the pilot summary (`plans-Scandi_gambit_accepted_-_Early_d3.md`, sent in the session): is it
  the right length and depth, are the sections the ones you want, and are the rules of thumb ones
  you would use at the board? Say what to add or drop; the skill's format follows.
- Give the skill another position's model games, ideally with Lc0 as White, and check that the
  report reads it (the side, the end of prep, the evals) without help.
- Do you want the plans trainable? The skill offers an idea deck from the games (cards at the
  turning points and the rare moves); say if that should be the default.
- **Checked**: unit tests (hand-made games in the generator's format) and a pilot on
  `modelgames_Scandi_gambit_accepted_-_Early_d3.pgn` (50 games) in the cloud container, with the
  vendored lite Stockfish and Maia under Node. Nothing in the app changes.

### On a phone, an idea card's buttons under the board (§5.133, 2026-10-27)
- Idea cards: on a card's back, Ask me, the four grades (on one row) and Next under the board's
  step buttons. Is the board still big enough above them?
- **Checked**: Playwright on an emulated Pixel 7; not on a device.

### Idea cards ask decisions: the remade decks (§5.128, 2026-10-24)
- Train any idea deck on the phone: while a card asks, its counter reads "6 of 34 · new" with no
  kind ("break", "placement"); the kind shows on the back.
- Deck 1 (Benoni gambit accepted) is remade under the new rules: 12 cards, 7 rules, in the
  testing data repo and sent as a file. Delete the old study first (or import beside it), import
  the file as a reference study, then ☰ → Make idea cards: 12 cards (the two "0." chapters are
  read, not trained). Train it in Train mode so no answer is shown first. Is each card a move you
  could really miss, and is "What do we play, and why?" enough of a question, or do some cards
  need a narrower one? Are 12 cards and 7 rules the right size? Cards 4b, 5, 6 and 7 sit at about
  3% of games: worth a card, or rules only?
- Deck 2 (Benko gambit) is remade the same way: 13 cards, 7 rules (27 cards before), in the
  testing data repo and sent as a file. Delete the old Benko ideas study first (or import beside
  it), import the file as a reference study, then ☰ → Make idea cards: 13 cards. Train it in Train
  mode. Is the 13th card (6., 9. Nf3 …Rb8 in the 5. b6 line, 3% of games) worth keeping over a
  rule? Are the move-order cards (2: 5. bxa6, 7b: 5. e3), where the other natural move is about
  as good, real lessons, or do they feel like guessing the author's choice? Does the rule "castle
  before taking on a6 once e4 is in" read clearly against card 3?
- Deck 4 (Anti-c3 deep) was trained on 2026-10-25 and its lesson taken into the skill (§5.128,
  "One card per stretch of a line"); decks 3 and 5 wait for your word.

### Opening ideas: the second deck (§5.128, 2026-10-20)
- The owner read the first deck and set three rules: the repertoire is right, Maia at 2000 or
  more, development first. The skill and its tools keep them now (the check against the
  repertoire, the development map). The second Scandinavian Gambit deck was sent in the chat
  (`scandi-gambit-ideas.pgn`, never in the repo): pieces and pawns only, 23 chapters.
- Import it as a study, then ☰ → Make idea cards: 21 cards (the two "0." chapters are read, not
  trained). Read chapter 0 first: is "where does this piece go, and when" clear for each piece,
  e.g. the f8-bishop's d6 / c5 / e7? Then train a few cards.
- Say whether a card's rule is wrong for the repertoire (it takes the repertoire's moves as right),
  and whether the two gaps should get cards: the 4.Bb5 e5 5.Bxc6+ bxc6 structure, and when we
  castle. About a third of the cards are at rare positions (under 1.5% of games): keep them or
  cut them?

### Idea cards (§5.128, 2026-10-20)
- With the pilot deck imported: open any of its chapters → ☰ → "Make idea cards". The home's
  study card should show "0 due · 5 new" (the daily limit, Training settings → New idea cards a
  day) and a Train button.
- Train. A new card opens on its answer: explanation, arrows, the line (▶ steps, ▶▶ plays it),
  and the other moves as clickable lines. Press "Ask me", then answer with a move:
  - the card's move or a `!` move beside it is right (Good);
  - a side line's move shows its comment (Again);
  - any other move is just not the answer.
  Or press Show and grade it yourself. Is the question clear without the chapter's name, which is
  hidden until the answer?
- Train (the switch beside the title, Read | Train): every card is asked at once, new ones too,
  with no answer shown first. Switch it on the first new card: it should be asked at once. The
  choice stays on the device. Is Read still the right default?
- A card missed comes back at the session's end, not graded. Is that welcome, or should it wait
  for another day?
- Is 5 new idea cards a day the right default? On the phone, is the answer screen too long
  (grades below the line and its side lines)?
- **Checked**: the tests only (desktop and an emulated phone), on a small test deck.

## 10. Progress

### The days trained over 26 weeks (§5.168, 2026-11-12)
- On Progress, under "Last 14 days": does the calendar show your real habit (the weeks you know
  you missed, the busy days darkest)? Are "days in a row" and "the longest run" what you'd count
  yourself? Before training on a day it should say "up to yesterday".
- On the phone: do the 26 columns fit with no sideways scroll, and is a square easy enough to
  tap (the day is then said under the calendar)? On a desktop, hover a square for the same.
- Is an empty day too faint or too strong in your theme, and can the three shades of a day
  trained be told apart?
- **Checked**: unit tests (the runs, the shades, local midnights and the days the clocks change);
  Playwright on a desktop and an emulated phone, at 360px too, and with the device in Stockholm;
  headless screenshots in Forest and Paper at four sizes. Nothing on a real device.

### Empty charts, and the weekday (§5.158, 2026-11-10)
- Progress's charts say "nothing due" or "no training" in a line instead of empty bars, and each
  day carries its weekday's letter.
- **Checked**: Playwright (desktop and emulated phone); nothing live yet.

### The progress page (§5.122, 2026-10-18)
- Open Progress from the training card (its line of links, before the mistakes). On your real
  history: does "right" sit near "the scheduler expected", and is the verdict believable? Are the
  weakest chapters and the moves missed again and again the ones you'd name yourself? Does the
  forecast's next few days match what the training card shows as each day comes?
- Say what you'd want on it that isn't there, or what you never look at. Opening it on the phone
  should feel instant; say if it doesn't.

## 11. Import and share

### Share to Repworks, and .pgn files opened with it (§5.159, 2026-11-10)
- **Share to Repworks**, on the Android phone with the app installed (it may need reinstalling,
  or a day, to pick up the new manifest):
  - In the Lichess app, open a study and Share → Repworks: Import opens and fetches it.
  - In a file manager, share a .pgn → Repworks: Import opens on its chapters.
  - Share a plain web page: Import says there is nothing to import in it.
- **.pgn files on the desktop**: with the app installed from Chrome or Edge, right-click a .pgn →
  Open with → Repworks (the first time, Chrome asks to allow it). Import opens on its chapters.
- **Checked**: unit tests, and Playwright (desktop and emulated phone; a share POSTed through the
  service worker as Android sends it); nothing live yet. Not a real share sheet, not a real file
  opened from the desktop.

### A new chapter from a FEN or from PGN (§5.76)
- Phone and desktop: in a study, + New chapter → From PGN → pick a `.pgn` file (one of the
  owner's exports with several games): a chapter per game, named as expected? Then paste a PGN,
  and From FEN with a position copied from Lichess. Does the file picker open the phone's files?

(The Qchess and Lichess imports were reported working on 2026-10-06 and 2026-10-07, Phase 0.
Export PGN and Copy branch are under 2, Studies.)

## 12. Settings and sync

### What a day's new moves will cost (§5.170, 2026-11-12)
- Training settings (⚙ on the training card): under "New moves a day" a line says the reviews a
  day in two weeks and the day the moves left are learned. Type other numbers: does it change as
  you type, and is the date the one you'd work out (moves left ÷ moves a day)?
- Is "about r reviews a day in two weeks" believable against what your days hold now? Note the
  figure, keep the limit for two weeks, and compare: it counts every answer as right, so the
  real days should run somewhat over it.
- **Checked**: unit tests on a made-up repertoire of sixty moves; Playwright on a desktop and an
  emulated phone; headless screenshots in Forest and Paper. Not against real training.

### Sounds, Settings apart from Debug, the dark themes (§5.159, 2026-11-10)
- **Sounds**: Settings → Sounds (off until ticked). Then:
  - a move and a capture each make a short knock, the capture lower;
  - a wrong move in training a low buzz, with a short vibration on the phone;
  - the best move found in the storm or the game cards two rising notes.

  Too loud, too quiet, or wrong on the phone? (iOS doesn't vibrate.)
- **Settings and Debug** are now two panels on the home. Is everything you use in Settings, and
  is Debug what you'd rather not see daily?
- **The dark themes**: the move shown (white on green in Forest), Slate's grey text and blue
  buttons, and the explorer's tab shown in Mist, Grove and Fjord are a shade darker or lighter.
  They now pass 4.5:1. Say if any looks off.
- **Checked**: unit tests (six text and background pairs at 4.5:1 in every theme), Playwright
  (desktop and emulated phone; the sounds counted from the oscillators started and the vibrations
  asked) and an accessibility scan of six pages in every theme; nothing live yet. Not sound out of
  a speaker.

### The light theme readable (§5.156, 2026-11-07)
- Settings → Theme → Paper, on the phone. Check these read clearly, dark on light:
  - the training screen's Show and grade, Read, Analyse and Stop;
  - the line list (Show lines), its chapters and its lines;
  - the Games filters (bullet, blitz…) and Hide;
  - an endgame's Hint and Restart.

  Turn the network off: the "offline" chip in the top bar is amber on a light pill. Back on
  Forest, the secondary buttons are a shade dimmer than before, the same as the Storm and Games
  buttons beside them: say if you'd rather have them brighter.
- **Checked**: the tests, screenshots in headless Chromium (desktop, an emulated Pixel 7 and a
  360-wide phone) and an accessibility scan of every theme; nothing live yet.

### Themes, and the themes side by side (§5.86)
- Phone and desktop: Settings → Theme. Each theme should be readable everywhere
  (study, training, storm, games, dialogs), with the phone's bar colour matching the top bar.
- "Compare the themes": the frames follow each other as you open screens and step through a
  line; on the phone the row scrolls sideways. Which themes, or which parts of them,
  are worth keeping or mixing?
- Mist, Grove and Fjord (added from the design canvas): on the phone, long sessions in study and
  training. Is the current move easy to find, the board's flat colours right with the pieces, and
  the phone's bar colour matching the top bar?

### The sync status in the footer (§5.92)
- The sync status in the footer's right: quiet while synced; offline (DevTools) it turns amber.
  Noticeable enough when something is wrong?

### Stockfish 19 as an option (§5.75)
- Phone, then desktop: Engine settings → Version → Stockfish 19, Save; the bar reads SF19 and the
  lines come. Is it stable on the phone over a few minutes (no restarts, no "failed"), and are its
  speed and lines comparable to 18's? With 2+ threads on the desktop: SF19 ×2.
- A storm, a practice game and its review with 19 chosen run as with 18.

### The sync after a long editing session (2026-10-07)
- The sync after a long editing session on the phone: GitHub's "Something went wrong while
  executing your query" (2026-10-07) should no longer show; the commit goes through REST instead.
  The chip's request counts (Debug) show REST writes when it happened.

### The engines' downloads, and threads (§5.29, §5.36, Phase 3)
- §5.29: the engines' downloads from the deployed site (desktop and phone): Settings → Engines on
  this device: Stockfish (7.3 MB) and Maia (59.9 MB, on Wi-Fi) downloaded, the time each took,
  then both still "stored" after a reload with the network off; Delete.
- §5.36: threads on the desktop (Engine settings → Threads 2 or 4, then the reload it offers):
  "SF18 ×4" and its speed against one thread at the same position; then, with threads on, the
  Lichess login (log out and in again), a sync, the explorer and Maia, all as before; the
  installed app on the phone with 2 threads (whether Android keeps it isolated after a reload).

## 13. The spike and installation

### A phone held sideways, long names, the page's title (§5.164, 2026-11-11)
- **Turn the phone on its side** on a study, the analysis board, training, show and grade, the
  storm (a card and its review), a game card, a practice game and its review, an endgame, a
  checklist's drill, an idea card and Read:
  - the board whole at the left, as tall as the screen; nothing under it;
  - beside it, in one column that scrolls: ←, Home, the page's name, the line that answers a move
    (a wrong move's "try again", the storm's verdict), the buttons, then the rest;
  - on a study the move buttons come first, then the engines, the notation and the explorer;
  - the sync status at the column's end (scroll down), not in a top bar;
  - **the notch's side**: is the board clear of the camera's cut-out with the phone turned either
    way? Does the page still fit when Chrome's bars show and hide (in the browser, not installed)?
  - the study's ☰ menu scrolls to Export PGN and Study settings;
  - turned upright again, the page is as it was.
- The home and the pages of lists keep their upright layout on their side. Should any of them
  change?
- A game card's **note** dialog is taller than the screen sideways (its board, the words and the
  buttons): it scrolls inside the dialog. Say if it should be laid out for it.
- The storm, practice and the engine panel **with the phone on its side** use the phone's depths
  and hash (they used the desktop's: the phone was taken for one by its width).
- **Long names**: on the phone, the storm's Study and Chapter dropdowns with your real course
  names, the storm's table of studies, a study's head: no page scrolls sideways.
- **The page's title**: the desktop's tabs and the installed app's window name the screen ("6. Bg5
  · Najdorf · Repworks", "Training · Najdorf · Repworks"); the browser's history (hold ←) reads as
  a list of places.
- **Checked**: Playwright on a desktop window and an emulated Pixel 7 at 915×412, 740×360 and
  640×330, with touch (the board's box, the controls beside it, a move by a tap, the menu, the
  engine's hash, the titles, long names); eleven of the other browser tests run at 915×412 and
  their screens read from the traces. Nothing on a real phone.

### Shortcuts on the icon, and "?" for the keys (§5.158, 2026-11-10)
- **Shortcuts on the installed app's icon**: long-press the Repworks icon on the phone (and
  right-click it in the desktop's taskbar or dock): Train, Storm, Games and Endgames. The app may
  need reinstalling, or a day, before the phone picks up the new manifest.
- **"?" on the desktop** lists the screen's keys (training, show and grade, the storm, game cards,
  a study, Read, idea cards, endgames, practice). Escape closes it without stopping a session.
- **Checked**: Playwright (desktop and emulated phone; the four shortcuts in the manifest Chrome
  reads); nothing live yet.

### The blank page after a reload (2026-10-10)
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

### The blank page on the phone (2026-10-07)
Reported by the owner on 2026-10-07 (build `60622b0`): after the update the page was empty on the
phone, in the browser and the installed app. Reproduced by an e2e test (`test/e2e/guard.spec.ts`)
with a card whose due time is past what a JavaScript Date holds (a migrated state with a huge
`sched`): the debug panel's card table threw while drawing, and Preact left the page blank. Not
confirmed that this is the phone's own cause: its data can't be read from here.

- The home screen on the phone again. If any part of a screen still fails, it now shows
  "… failed to show" with the error in its place (Details has the stack): report that text.
- The sync after a long editing session is under 12, Settings and sync.

### ← and Home on every page (§5.97)
- The installed desktop app: open a line that's gone from the repertoire (or any page): ← and the
  house beside it are in the head; the house goes to the start page. On the phone the house is at
  the top bar's right.

### The desktop's frame (§5.92)
- On the desktop, in a browser tab: the top bar's name, the ← and Study/Train, and the footer
  keep to one centred column. Does it feel better than the window's edges? Is 1600px the right
  width, or should it be narrower?
- The installed app on the desktop: no top bar, and the window's title bar in the page's dark
  colour, not green (with any theme, Settings → Theme). Is the content's distance from it right?

### The spike (§4.2, Phase 0)
Nothing waits. The spike's desktop run was reported on 2026-10-06 (all steps passed), and its run
from the installed app on the phone on 2026-10-07 (build `4ad54ce`: every step passed, `persist()`
granted), with the Lichess OAuth flow on the phone and Phase 0's acceptance test. Its link stays in
every page's footer for a re-run whenever the owner wants one.

## Appendix: the change to q_extension for §5.25 (Repworks sessions can't push there)

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

## 14. The Chessnut Move

Built before the board arrives (CHESSNUT.md, PLAN.md §5.153): nothing here can be checked until it
does. Start with the spike: its log decides what the later parts change (CHESSNUT.md §7).

### The Chessnut Move's spike page (CHESSNUT.md part (a), 2026-11-14)
- Nothing live yet; the simulated board only. When the board arrives: on the device that will drive
  it (Chrome, or Brave with brave://flags/#brave-web-bluetooth-api enabled), close Chessnut's app,
  open the footer's "board spike", and go through its steps 1–8. Copy the log and give it to any
  session: CHESSNUT.md §7 says what each answer changes.
- Worth noting as you go: whether Chrome on the phone asks for Location in the chooser; what the
  robot does with a hand on a piece in each Drive mode; where "Kings and pawns" puts the pieces it
  takes off; which ranks "Each code" lights, in what colour (the box under it goes into the log);
  and, with the page open, the link after the screen locks and after the board's own sleep.
- **Checked**: unit tests (the codec against Chessnut's byte vectors; the Bluetooth module against
  a simulated board in Node); Playwright on a desktop and an emulated phone with the simulated
  board (connect, a drive timed with a report on its way, the five setups, the lights' pattern, the
  pieces, a drop and Reconnect, Copy log; without Web Bluetooth, and Brave's flag). Nothing on a
  real board.

### The board's chip and dialog (CHESSNUT.md part (c), 2026-11-14)
- Connect from the ♞ chip (in the head on the phone, in the footer beside the sync status on a
  desktop); the battery; the dialog's small board follows the real board as you move pieces; Check
  the pieces. Turn the board off and on: "Reconnecting", then back.
- Worth noting as you go: whether the battery's percentage matches Chessnut's app; whether the
  small board shows the position at once on connecting (the board reports once when its reports
  start, then only on a change); Reset the pieces and Lights off; Disconnect, then Connect again
  without a reload; on a phone held sideways the board pages have no head, so the chip is in the
  footer there.
- **Checked**: unit tests (the link in the app against a fake board and clock: the mirror, the
  latest board mirrored winning, the review's delay, the lights, a drop and the reconnects, Reset
  the pieces, a stuck drive, a position the set can't make, Check the pieces, the settings);
  Playwright on a desktop and an emulated phone with the simulated board (the chip, the dialog, the
  settings kept after a reload, a drop and back, Disconnect, nothing picked, no chip without Web
  Bluetooth, Brave's flag). No screen uses the board yet. Nothing on a real board.

### Practice on the Chessnut Move (CHESSNUT.md part (d), 2026-11-14)
- Connect from the ♞ chip, then a practice game from a position, as White and as Black (the board
  turned to you): your moves by hand, the opponent's driven and lit blue; a move outside the
  repertoire put back and lit red; Take back; the hint's lights; Move feedback's colours. Does 0.6 s
  before a move is read feel right? Does 2 s before a wrong position is put back? (Both are in the
  dialog's settings.) Castle with the king first (moving the rook first says so once, under the
  game). An endgame and a checklist drill on the board too.
- Worth noting as you go: with "Say verdicts and the opponent's moves" on (the dialog) and voice
  input off, the opponent's moves are said, and the study move after one put back; a hand on the
  board during the opponent's turn is put back after 2 s; a capture made by hand (the captured piece
  off first, then yours on its square) is read as one move; a promotion with the spare queen; the
  board at the game's end stays as it is (Reset the pieces in the dialog sets up the start).
- **Checked**: unit tests (castling with the rook first told once a page load; what a game says);
  Playwright on a desktop and an emulated phone with the simulated board (a game as White: the
  start driven, moves read, the answers driven, lit and said, a blunder lit red, a hand put back,
  Take back; a game as Black: turned, a refused move put back within a second and the study move
  said, the hint's lights; a third queen the set can't make; an endgame driven and played). The
  checklist's lead-up has no browser test of its own on the board. Nothing on a real board.

### The storm's untimed sessions on the Chessnut Move (CHESSNUT.md part (e), 2026-11-14)
- Connect from the ♞ chip, then a Set of 6 with the board: how long each card takes to set up (the
  card says "Setting up the board…" until the board shows it; "Play on the screen" answers at
  once); the move that reached it lit blue; the verdict's colours (the top move bright green, Great
  green, Good dark green, Inaccuracy yellow, Mistake orange, Blunder red); a held card taken back by
  the robot after 2 s and tried again, or taken back by hand (Try again at once); Show the move's
  light (the move taken back, the best lit green); the next card by itself after a verdict (Pause,
  `P`, keeps it). A Show and grade: the top move lit once the moves are shown; a move played on the
  board graded. A puzzle: the reply played by the robot. Ten minutes with the screen untouched:
  still connected?
- Worth noting as you go: with "Say verdicts…" on, the verdict said after a move made on the board
  (the best move too, unless the card is held); castling by hand graded as castling; "A card set up
  one move early, then that move played" in the dialog: does it help, or only slow things down? A card the set can't make (a third queen) is never dealt while
  the board is connected.
- **Checked**: unit tests (the verdict's words; the link reading the same wrong move again after
  the robot set the position back); Playwright on a desktop and an emulated phone with the
  simulated board (a set: setup before each card, the arrival lit, the top move by hand graded, lit,
  said and written, the next card by itself; a held card taken back by the robot, by hand, and
  shown; show and grade's lights and a move named on the board; castling by hand graded and lit; a
  third queen not dealt; the arrival played; Play on the screen; a puzzle's reply driven). The
  timed storm and the review are part (f)'s, below. Nothing on a real board.

### The timed storm and the review on the Chessnut Move (CHESSNUT.md part (f), 2026-11-14)
- Connect from the ♞ chip, then a timed storm (Start storm): the clock stands still while the board
  sets up each card ("Setting up the board…", the clock greyed) and runs only once the card is
  asked; a puzzle's reply is set up the same way. Then the review after End: the board follows the
  row you stop on, a second after you stop (stepping quickly through the rows doesn't send the robot
  to and fro); the move you played lit red, the best green once shown (`B`). Try again (`T`) on a
  row: the move made on the board is graded, lit in its band's colour and said.
- Worth noting as you go: whether the second's wait in the review feels right; the lights go off
  while a row waits for the board, then come with its position; how long a whole timed storm takes
  on the board compared with the screen (setup never costs clock time, but it costs your time).
- **Checked**: unit tests (the review's stepping: no lights until the row stayed on is driven);
  Playwright on a desktop and an emulated phone with the simulated board (a timed storm: the clock
  unchanged through two 2 s setups and running between them; a puzzle not asked while its reply is
  driven; the review stepped quickly driving only the row stopped on, the played move lit red and
  the best green; a retry by hand graded, lit and said). Nothing on a real board.
