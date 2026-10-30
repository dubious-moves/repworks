# Repworks: waiting for the owner's testing session

What has been built but not yet checked live on the owner's devices. Sessions add to it when they
push something only the owner can check, and remove an item once the owner reports it. Each
item names its `PLAN.md` section, which says what to check. Report findings to any session; it
fixes them and updates this file.

## The variation checklist on its own page, synced (§5.130, 2026-10-26)
- Checked by the tests and by screenshots in headless Chromium (desktop and an emulated phone);
  nothing live yet. Home → Repertoire's "Checklist" (or the line list's "Checklist…", or a
  chapter's ⋯): every repertoire study's checklist as a folded block, each side of a two-sided
  study on its own. Desktop, with the Lichess login: unfold a real study, Make; then on the phone
  after a sync the same lines, with no "Asking the explorer". Drill one at Easy there; back on the
  desktop after a sync, ✓ Easy and the block's progress bar.
- A list made before this build on a device is carried into the log once that device has synced;
  check it shows on the other device too.
- Pause a line (the line list's ⋯): the checklist hides it and says "1 paused line hidden",
  bringing in the next line where the list has a reserve; Make again leaves it out entirely.
- Hover the moves of a line on the desktop and tap them on the phone: does the small board follow
  well, and is it in the way of the line below? The opening name comes from your games when they
  are loaded (open Games once), else from the chapter the line ends in: are the names useful?
- Maia's rating per level (above the blocks): the drill says which it plays at. Does Easy at 1750
  feel right?
- §5.62's comparison with mistake-lab's list still stands (TESTING.md's Phase 5 list).

## A dropdown lets go of the keys once an option is picked (2026-10-21)
- Checked by an e2e test in headless Chromium (the explorer's Sort menu: after a pick it is not
  focused, → moves in the chapter and Home goes to the start, the pick unchanged). Not checked
  with the native pickers of a real device: on your desktop browser and phone, pick a sort, a
  chapter and a setting in a dialog; the arrow keys should then move through the study (or do
  nothing in a dialog), never step the menu. Stepping a closed menu with the arrow keys itself
  still works and keeps its focus.

## The material by every board (§5.129, 2026-10-21)
- Checked by the tests and by screenshots in headless Chromium (desktop and an emulated phone,
  the Forest and Paper themes). As on Lichess: above the board the top side's extra pieces, below
  it the bottom side's, in their own colour, and "+n" after the side that is up. Is it easy to
  read at a glance on your phone, and are black pieces clear enough on your theme? The boards
  fitted to the window's height are 44px smaller to make room: say if that's too much.

## Idea cards (§5.128, 2026-10-20)
- Checked by the tests only (desktop and an emulated phone), on a small test deck. With the pilot
  deck imported: open any of its chapters → ☰ → "Make idea cards". The home's study card should
  show "0 due · 5 new" (the daily limit, Training settings → New idea cards a day) and a Train
  button.
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

## Opening ideas: the second deck (§5.128, 2026-10-20)
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
- The repertoire notes are dropped: the skill no longer reviews the repertoire.

## Idea cards ask decisions (§5.128, 2026-10-24)
- Train any idea deck on the phone: while a card asks, its counter reads "6 of 34 · new" with no
  kind ("break", "placement"); the kind shows on the back.
- Deck 1 (Benoni gambit accepted) is remade under the new rules: 12 cards, 7 rules, in the
  testing data repo and sent as a file. Delete the old study first (or import beside it), import
  the file as a reference study, then ☰ → Make idea cards: 12 cards (the two "0." chapters are
  read, not trained). Train it in Train mode so no answer is shown first. Is each card a move you
  could really miss, and is "What do we play, and why?" enough of a question, or do some cards
  need a narrower one? Are 12 cards and 7 rules the right size? Cards 4b, 5, 6 and 7 sit at about
  3% of games: worth a card, or rules only? Decks 2 and 4 wait for your word.
- Deck 4 (Anti-c3 deep, 1. d4 c5 2. c3 Nf6) is remade the same way: 12 cards, 7 rules, against
  42 cards before. Re-import it as above and train it in Train mode. Its first six cards are the
  early choices (3. Nf3, 3. e3, 4. dxc5, 3. Bf4, 4. cxd4, 5. e3), where several moves are about
  as good and the card asks for the repertoire's: do they feel like decisions, or like guessing
  the builder's preference? Cards 4, 5 and 7 are traps Maia falls into (…Bf5 at 7. Nf3, …Nxe4
  at 14. Nf3, …Qa5 at 9. Nf3), each at about 4% of games: is that the kind of card you want?
  Decks 3 and 5 wait for your word.
- Deck 2 (Benko gambit) is remade the same way: 13 cards, 7 rules (27 cards before), in the
  testing data repo and sent as a file. Delete the old Benko ideas study first (or import beside
  it), import the file as a reference study, then ☰ → Make idea cards: 13 cards. Train it in Train
  mode. Is the 13th card (6., 9. Nf3 …Rb8 in the 5. b6 line, 3% of games) worth keeping over a
  rule? Are the move-order cards (2: 5. bxa6, 7b: 5. e3), where the other natural move is about
  as good, real lessons, or do they feel like guessing the author's choice? Does the rule "castle
  before taking on a6 once e4 is in" read clearly against card 3?


- Show and grade from the training card: miss a move with 4 (or the ring). At the line's end the
  board goes back to the move before it, the note reads "Not a new line: your mistake again" in
  the warning colour, then "Your mistake again: show it"; 2 shows it, 2 again (known) ends it. Is
  it clear enough that this is the mistake and not a new line? Learn in show and grade should not
  retry.

## Scores at equal ratings (§5.126, 2026-10-19)
- Explorer: click the Score header once: "Equal Elo", dashed bars. Hover one (the phone has no
  hover: say if you want its details on a tap, as the Practical cells have): its score, the games',
  both averages and the gap. Do the reorderings on lines you know make sense (e.g. 1.e4 Nf6 losing
  its lead, 1.e4 c5 2.d3 gaining)? Stepping through a line in this view asks Lichess for up to
  about ten more positions each time the first time: is the wait for the bars acceptable, and does
  the Practical column feel slower beside it?
- Click again: Prepared, now at equal ratings (Explorer settings → Practical column → "Prepared
  results at equal ratings"). The bar's title has an "At equal ratings" line. Untick it to compare
  with q_extension's prepared bars, which it should then match again.
- Games page → Explorer: the "± Elo" column on your real games. Do the moves it marks red feel like
  the ones that cost you? Its title has the performance.

## Puzzles in a focused storm (§5.125, 2026-10-18)
- On the storm's page, pick a focus chip, tick "Puzzles too" under the chips, and start: puzzles
  should come among the focus's positions at your share of cards. Is the checkbox easy to find
  there, and is the mix right, or should a focus have its own share?

## Difficult lines (§5.124, 2026-10-18)
- On the training card, "Difficult lines (n)" when any move has two lapses or FSRS difficulty 7 or
  more. Are the lines it walks the ones you find hard? Is the count sensible on your real history
  (too many, too few)? A move not due answered there must leave its "Due …" in the line list
  unchanged; a due one is graded as in the queue.

## A misclick taken back (§5.123, 2026-10-18)
- Train fast and slip: after a wrong move, "Misclick" (beside the note under the board on the
  phone; "Misclick: take … back" in the panel, or Backspace, on a desktop) should take it back,
  and the right move next should count as right first time. Is the button where your thumb is
  when it happens? Does a misclick followed straight away by the right move (too fast to press
  it) happen often enough that you'd want to take back an answer already recorded?

## The progress page (§5.122, 2026-10-18)
- Open Progress from the training card (its line of links, before the mistakes). On your real
  history: does "right" sit near "the scheduler expected", and is the verdict believable? Are the
  weakest chapters and the moves missed again and again the ones you'd name yourself? Does the
  forecast's next few days match what the training card shows as each day comes?
- Say what you'd want on it that isn't there, or what you never look at. Opening it on the phone
  should feel instant; say if it doesn't.

## A line in the queue starting where it branches from the last (§5.121)
- Training settings → In the day's queue → A line starts: "Where it branches from the last line".
  Then train a day with several due lines in one chapter: the chapter's first line starts at move 1;
  each next one starts after the last move it shares with the line before (the board doesn't jump
  back to move 1), and the moves from there are played or asked as Auto-play says. A line of
  another chapter starts at move 1.
- With Repetitions on and a new move on such a line, the second pass starts at the same place.
- Say whether starting right after the shared move (no replay of the move before it) reads well,
  or whether you'd rather see one move earlier.

## The buttons stay put on the phone (§5.7, 2026-10-17)
- On the phone, train a line and miss a move: through "Not in your repertoire", the line's end
  ("Your mistake again: each right 2 times in a row", "mistakes left 1") and the retry, Hint and
  the buttons beside it should not move. The space under the board is a little taller now (two
  lines kept for the feedback); say if it costs too much.

## A storm move graded over two depths (§5.120)
- On newly gathered or deepened positions (the change doesn't reach lists kept before), play sets
  and storms as usual: verdicts near a band's edge should flip less. Report any that still look
  wrong as before, with the analysis board beside it; the board shows one depth's score, the storm
  the mean of two, so their numbers differ a little.
- Nothing should be slower: the deepening's times in "Scoring" and the verdicts' waits as before.

## Gathering balanced across chapters (§5.116)
- In a repertoire with many gathered positions, add a chapter (or pick one with few), then gather
  on "Whole repertoire": the first walks should name that chapter's lines, and other chapters
  join once it has about as many positions per line as they do. Overnight, the store should stay
  in proportion rather than fill from one chapter.

## Alternatives shown by Space in show and grade (§5.114)
- Save an alternative somewhere in a line (a wrong move → "Save … as alternative", or the study's
  move menu → Add alternative…), then reach that move in show and grade and press Space on the
  ring: a blue arrow for each alternative, named under the board; Space again hides them. Also
  once the move is shown (2), before grading it. Where none is saved: "No alternatives saved here".
- Check that the ring's Space reaches the page as a key (not scrolling it or pressing a button).

## Auto-play set apart for the queue and for Learn and a line picked (§5.113)
- Training settings: Auto-play and "A line starts" twice, under "In the day's queue" and "When
  learning, or a line picked". Your stored settings carry over: the old one auto-play setting in
  both (so set the learn/pick one to Off), "From the start, played" as From the start, and
  "asked" as From the start with that context's auto-play Off.
- Queue on "Moves answered right this session", From the start: a move not answered yet in the
  session is asked, before the first due move too; answered right, it is played the next time.
- Learn and a line picked with auto-play Off: every move asked, on every pass.

## Analyse on every board (§5.112)
- Training (the queue, desktop then phone): with a move asked, press Analyse: the board should show
  the line to here, from your side. "← Back to training": the move shown with its arrow (it counts
  as hinted); play it and go on. Again at a line's end, coming back by the phone's Back gesture.
- The storm, timed: Analyse on a card before moving: back, the card says "Analysed — no answer
  given", the clock stopped; Next goes on with the clock running.
- A game (Games → a game, stepped to a move), the game cards, a practice game in play, and the
  Read view: Analyse, then back: each should be where it was left.

## Copy branch as PGN (§5.111)
- In a study, right-click (long-press on the phone) a move with moves after it → Copy branch as
  PGN: "Branch copied" under the board. Paste it into Lichess's import (or a Qchess chapter): the
  moves to it, and every variation after it with their comments and arrows, should be there.

## Pin while retrying, learning's mistakes, no arrow in auto-play (§5.110)
- Mistakes → Retry (or Drill) with a mistake not pinned: "Pin this mistake" should show from the
  line's start; pressed, it goes, and the mistake should be under Pinned.
- Learn a line with New moves "Try first" (or a sequence): play a wrong move or press Hint on a
  new move; at the line's end it should be asked again ("Mistakes retried"), before any repetition.
- Auto-play through moves learned today: no green arrow should flash before them.

## Branches to clickable lines (§5.109)
- In a study, right-click (long-press on the phone) a move with two or more moves after it →
  Branches to clickable lines: the moves after it should go, and its comment should hold one blue
  line per branch end, each clickable and stepped with ← →. Undo should bring the branches back.

## Export PGN for a chapter (§5.108)
- In a study, ☰ → Export PGN: a file `<study> - <chapter>.pgn` should download, on the desktop and
  on the phone (on an iPhone Safari may show it first; Share → Save to Files keeps it). Import it
  into Lichess or Qchess: the moves, comments and arrows should all be there.

## Auto-play: the latest answer counts (§5.107)
- With Auto-play "Moves answered right this session", miss a move, then answer it right (in the
  retries at the line's end, or on a later line): the next line through it should play it for
  you. Note that a line set to start "From the start, asked" asks every move whatever auto-play
  says (your choice of 2026-10-09); "From the start, played" or "At its first new or due move"
  shows auto-play at work.

## Review lines to their end; every first answer graded (§5.106)
- In the day's queue with "From the start, asked": a review line now goes on past its last due
  move to its end (or stops after your last move before a move you've never been taught). Every
  move you're asked for the first time in the session counts: a miss shows up in the session's
  numbers and the move comes back soon. Does a session feel too long now? If so, say so: the cut
  at the last due move can come back as a setting (§5.106, "Kept for later").
- With "At its first new or due move" and auto-play on, the moves after the last due one are
  played for you at the pace: worth keeping, or would you rather the line stopped there?

## Lines from the comments quizzed in review (§5.98)
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

## ← and Home on every page (§5.97)
- The installed desktop app: open a line that's gone from the repertoire (or any page): ← and the
  house beside it are in the head; the house goes to the start page. On the phone the house is at
  the top bar's right.

## Clickable lines: words, null moves, ↓ (§5.96)
- Write a comment like `( 12.Ng5 Ndf6 taking the e6-pawn under control 13.Nxe6 Bxe6)` and one like
  `(7.-- Bg7, 8.-- O-O, and 9.-- a5)`: the words in plain comment style, the moves clickable, and
  each → in the second showing one of Black's moves, the passes stepped over.
- On a move with such a comment, ↓ enters the line; ← → along it, ↓ ↑ between the comment's lines,
  ↑ on the first goes back. Is ↓ going to the line before the next variation right for you?

## The study page, option B (§5.94, §5.95)
- The installed desktop app, a study at your usual board size: the engine and the explorer on the
  left, the notation on the right as running text. Is the notation easier to read, with comments
  and variations breaking the line? Does the explorer have enough rows and columns there?
- The head: the select picks the chapter, "2 / 5" and "+" beside it. After picking one, ← → step
  through its moves at once (§5.95).
- At your board size, the comment panel under the board (§5.95): the move's comment readable
  there, its lines clickable, ✎ to edit; gone when the board is dragged as tall as the window.
- The engine's lines on one row each, and ⏭ in the move bar (§5.95).
- Study ↔ Train: the board should still not move (on a narrower window it may shift a little).

## The training screen's comments and line list (§5.93)
- Train a line with comments: they shouldn't flash as the moves go by, only show after a wrong
  move, at a taught or shown move, and at the line's end. At the end, click a move in a comment's
  line and step with ← → (desktop); Escape goes back.
- Starting a session (desktop too) folds the line list; "Show lines" opens it.

## A desktop layout trial (§5.92)
- On the desktop, in a browser tab: the top bar's name, the ← and Study/Train, and the footer
  keep to one centred column. Does it feel better than the window's edges? Is 1600px the right
  width, or should it be narrower?
- Study ↔ Train, on a chapter and in a running session: the board shouldn't move at all, only the
  sides. Is the board's place in the middle right, and is the line list (now as wide as the right
  panel) good at that width?
- The installed app on the desktop: no top bar, and the window's title bar in the page's dark
  colour, not green (with any theme, Settings → look). Is the content's distance from it right?
- The study on the desktop with the engine on: the wider eval bar left of the board, its number
  at the leading side's end (try a position where Black is better, and a turned board).
- The explorer: short counts (872M, 1.39B), Move narrower, columns hidden and shown again from
  ⚙ → Columns shown. With Maia on, does everything fit without the sideways scrollbar?
- The sync status in the footer's right: quiet while synced; offline (DevTools) it turns amber.
  Noticeable enough when something is wrong?

## A note on a game card (§5.91)
- On the phone: answer a game card, "✎ Add a note", draw an arrow with ✎ and a colour, play a line
  on the dialog's board and "Add to the note", type words, Save. The note shows under the verdict;
  tap a move of its line (the board follows; ◀ ▶ Back under it), "The note's arrows".
- On the desktop: the same with a right-drag for the arrow (Shift red, Alt blue).
- Save a practice game's mistake and a storm position as a mistake, and write a note there; in a
  timed storm the verdict should wait while the dialog is open. Next day, the card shows the note
  only after it is answered, on both devices after a sync.

## Every page looked over for layout (§5.88)

- Phone: no page with a board scrolls sideways any more, and the coordinates sit inside the
  edge squares. Are they readable on your board colours?
- Phone, a study: the head shows the chapter's full name; New chapter, Chapter settings and
  Study settings are in ☰. Desktop: the head reads Study › Chapter.
- Home, training, games, coverage, storm: the dropdowns and boxes in the theme's colours; home's
  buttons and the training buttons on the phone in even rows. Anything that now looks off?

## The study's ☰ menu (§5.87)

- Desktop and phone, in a study: the bar under the notation is ☰ ⏮ ◀ ▶ ⏭ (and ✎ ⋯ on the phone).
  ☰ opens Explorer, Undo, Redo and Copy FEN; is anything you reach for often now a tap too far?

## Themes, and the themes side by side (§5.86)

- Phone and desktop: Settings and debug → Theme. Each theme should be readable everywhere
  (study, training, storm, games, dialogs), with the phone's bar colour matching the top bar.
- "Compare the themes": the frames follow each other as you open screens and step through a
  line; on the phone the row scrolls sideways. Which themes, or which parts of them,
  are worth keeping or mixing?
- Mist, Grove and Fjord (added from the design canvas): on the phone, long sessions in study and
  training. Is the current move easy to find, the board's flat colours right with the pieces, and
  the phone's bar colour matching the top bar?

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

## Kinds of storm position and the focus (§5.100)

- Desktop and phone: Gather again (Punish, Hold and Convert come only from new gathers), let
  Stockfish and Maia finish, open Focus. How many positions does each chip have? Any chip with
  almost none, or almost all, needs its number changed (`STORM` in `core/storm/config.ts`).
- Try a storm per chip, and a pair (Critical + Quiet): do the positions feel like the kind named?
  Only move: one good move? Punish: did the opponent just err? Don't take: was the capture
  tempting? The tags shown after each answer: right?
- The classic storm: does it feel easier or harder than before (easy positions now come last)?

## Stockfish alone judges a storm move, at depth 24 (22 on a phone) while you think (§5.84)

- Desktop (Stockfish 19, 4 threads) and phone: the storm's home with "Stockfish re-scores the
  positions" on: "scored to depth 24" (22 on the phone) rising, how long a position takes, and
  whether the phone gets hot.
- A set, thinking 15–20 s on each card: the verdict should come at once and say "by Stockfish
  d24" (d22 on the phone), or at least d20. Moving at once still works (two searches at d20).
- A timed storm on positions not yet deepened: how long the verdicts take, on each device, and
  whether that spoils the storm.

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
- "Add alternative…" in the menu of an own move in a repertoire chapter (§5.91; was a card panel):
  the board shows the position before the move, the move you play is saved as an alternative (and
  listed in that menu as "Remove alternative …"). Checked by tests on a desktop and an emulated phone only. On the phone, is tapping a
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
  the other device after a sync), listed in the move's menu in the study and removed there (§5.91).

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
- §5.85 (desktop, then phone): a set with a wrong first move, Try again, then a good move that
  isn't the best: Try again and Show the move stay, the best hidden; Try again again until the best
  move, then Try again goes. The row still counts the first answer.
- §5.102 (desktop overnight, then phone): on the desktop, Storm → whole repertoire → "Keep going
  until stopped" → Gather positions, the laptop on power, the page in front; in the morning the
  status line (which pass, how many stored, any failures waited out), whether the screen stayed
  on and the tab wasn't suspended or discarded, and "Stockfish: n of m scored". Then the phone:
  open Storm (or Sync now there): "n positions here came from your other devices" and the same
  count ready; a storm from them. In the data repo, `storm/<desktop id>/` holds the night's files
  and nothing from the phone. Clear on the phone, then a sync: still cleared there, still kept on
  the desktop. How long the phone's first pull of the positions takes.
- §5.103 (desktop): Storm → More settings → "Focused: n engines at once" ticked, with positions not
  yet scored: the status line reads "scoring, n at once…"; the system monitor shows the CPU near
  full (it was about half); how many positions an hour against the setting off (the home's count
  before and after ten minutes, each way); the page stays responsive; memory with n engines. Then a
  storm: it starts at once, and Task Manager shows the engines gone back to one.
- §5.104 (desktop): with positions to score, open "Scoring: n of m searched": each engine's row
  counting up its depth and seconds, the last positions listed as they finish, the time left
  plausible after a few minutes; how many are stopped by the 600 s limit (it should be few or none) at depth 24 on this
  machine (focused on and off). The console's `[storm deepen]` lines.
- §5.105 (desktop): an overnight gather with Focused on: the status shows each pass's scoring
  running until "n of n scored" before the next pass walks. On the home, with Maia's ratings in,
  "n too easy, left out" in the count; a storm deals none whose card says Maia at your rating finds
  a good move 95% or more.
- §5.117 (desktop): the home says "Maia at n finds a great move 95%…", and "n too easy" is fewer
  than before (232 on 2026-10-17's Whole repertoire); a card may now say "finds a good move 96%"
  where that good move isn't great.
- §5.118 (desktop and phone): under Hard for you, "Level up: Maia at 2200 finds a good move 25
  points more often than at 1800"; the Level up chip counts more positions than the old rule did.
  Changing a rating to one off the ladder (1900, say): "Maia: n of n rated" drops and climbs back as
  Maia rates them there; the count follows. Whether 25 points is a good default.

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

## The pace of auto-played moves (2026-10-22)
- Training settings ⚙ → "Pace of moves played for you": pick Fastest (250 ms) and run a session
  with auto-play on; moves should come quickly but still be followable. Try Custom at 100 ms.
- Custom with “Pause between lines” (say 3000): the next line should come after that long.
  Empty: two moves' time (four when a picked line goes on to the next by itself).
- The pause to look: after a wrong move, between a shown sequence's moves and before a comment
  line's first move. Empty: two moves' time.
- Changing the pace in ⋯ mid-session, or Save in the settings mid-session, applies from the next
  move. The Ideas player steps at twice the move time.
- Checked by unit tests only so far (the trainer's waits, the stored settings); not live.

## Take back in practice games (2026-10-26)

- In a practice game against the database or Maia, Take back (beside Hint) removes your last move
  and the opponent's answer; pressed while the opponent thinks, its answer shouldn't appear.
- Not in advantage drills (graded). Checked by Playwright (desktop and emulated phone); not live.

## The best move celebrated, and Try again after it (2026-10-26)

- Storm (timed and a set) and the game cards: play the top move. The panel should read
  "★ Best move!" in mint with a gold star, and the board should burst on the square (glow, ring,
  sparks) with a ★ badge. Is it clear and satisfying, and not too much? On the phone too.
- In a set: miss a card, Try again, then play the top move: Try again should still be there
  (beside Next position) and Show the move gone; Try again, another move, the first answer still
  "Counted".
- Game cards: find a mistake's move, then Try again and play another: the "Recorded" grade stays.
- Checked by Playwright (desktop and emulated phone); the look of the burst only in a headless
  screenshot, not on a device.

## The repertoire check past a checklist line's end, at any ply (2026-10-26)

- Make a checklist with Plies cut short of where the study ends (say 4 or 6) and drill a line:
  once the game starts, play a move other than the study's at a position the study covers. It
  should be taken back with "… isn’t your repertoire: the study move is …", and the study move
  played then. Also in a game practised from a position past move 10, where the repertoire goes on.
- Checked by Playwright (desktop and emulated phone, the checklist drill); not live.

## On a phone, Next right under the board (2026-10-27)

- Portrait, training the queue or a line: at a line's end "Next line" (or "Finish") should sit
  beside "Line done · Next: …" under the board, reachable without a scroll, and Hint greyed out
  where it was. A line trained from the line list: "Next line" in the same place.
- Idea cards: on a card's back, Ask me, the four grades (on one row) and Next under the board's
  step buttons. Is the board still big enough above them?
- Checked by Playwright on an emulated Pixel 7 (and the desktop unchanged); not on a device.

## Flip board on the analysis board (2026-10-28)

- On the analysis board, ☰ → Flip board (first in the menu) should turn the board, the eval bar
  and the material with it; `F` on a keyboard does the same. Practise afterwards plays the side
  now at the bottom. Undo takes back moves without turning the board back.
- Checked by Playwright (desktop and emulated phone); not on a device.

## Try again always in the storm (2026-10-28)

- In a set, play a good or the top move first time: Try again (`t`) should be beside Next
  position; another move after it reads "Counted: the first answer", and the summary counts the
  first answer only.
- In a timed storm, press `t` (or Try again) on any verdict before the next card comes: the card
  stays, the clock stopped; play again, nothing scored; Next goes on with the clock running.
- Checked by Playwright (desktop and emulated phone); not on a device.

## A move told worse than good searched again in practice (2026-10-28)

- With Move feedback on, play a move the analysis board likes (a top line at depth 24) where the
  engine is close between moves, like the 14...Qh4 game. The label should not say Blunder or
  Mistake; at most Inaccuracy when the moves are close. A move that is a real blunder should
  still say Blunder, a few seconds later than before (the second search).
- Checked: the app's search and judge under Node (both engines); the built app in headless
  Chromium on SF18 one thread and SF19 four threads, the owner's game replayed; Playwright with
  the fake engine (desktop and emulated phone). Not on the owner's device.

## Draws in practice: repetition, fifty moves, Offer draw (2026-10-30)

- In a checklist drill, shuffle a piece back and forth so that a position from the line's lead-up
  comes back: the game should end "Draw by threefold repetition." on its third time, the lead-up's
  occurrence counted, and the line's chip count it as a draw.
- In a game from a position, Offer draw early, or while one side is clearly better: "The opponent
  declines the draw.", and the button stays off until you move. In a level position from move 20,
  after five level moves: "Draw agreed."
- Checked by unit tests and Playwright with the fake explorer and engine (desktop and emulated
  phone); not on a device.

## ChessDB's evals asked again until they settle (2026-10-30)

- Open a position ChessDB hardly knows (deep in a sideline: one or two moves in the Eval column).
  Within a second the evals may change (the position after the best move was asked), and again
  about 15 s and 45 s in if you stay; a move may be added. Then play ChessDB's best move: the next
  position's best eval should be within about 0.1 of the one the move had. Step back: the earlier
  position shows its latest evals at once.
- Checked: ChessDB's revisions measured live from the container, and the worker's service run
  under Node against live ChessDB (PLAN.md §5.138); the asks by unit tests with a fake ChessDB
  that revises; Playwright for the panel as before. Not in a browser against live ChessDB, and
  not on the owner's device.

