---
name: opening-ideas
description: Turn an opening repertoire (a PGN from repworks, Qchess, Lichess or the owner's repertoire builder) into an idea deck of key ideas and rules of thumb, as PGN flashcards repworks imports and trains as idea cards - one chapter per idea, a position with arrows, a question and an explanation, development first (where each piece goes, and when), the repertoire's moves taken as right, every claim checked with Stockfish, Maia and the position's computed facts. Use when the owner wants to learn an opening's ideas, plans, typical moves, pawn breaks, traps or rules of thumb before drilling its lines, or asks for idea cards, concept cards or a key-ideas deck. PLAN.md section 5.128.
---

# Opening ideas: a verified idea deck from a repertoire

The owner learns an opening's ideas before its moves. This skill reads a repertoire, finds its
key ideas and rules of thumb, checks every claim with tools, and writes a deck in the format the
owner approved (PLAN.md §5.128): one PGN chapter per idea, imported into repworks as a reference
study, and trained there as idea cards.

## The owner's three rules (2026-10-20)

1. **The repertoire is right.** This skill teaches the repertoire; it doesn't review it or look
   for better moves. The owner's builder chose each move for a reason: practical eval, ease of
   learning, transpositions and moves that recur across lines. So at a position of the
   repertoire, the card's answer and the main line's move are the repertoire's move, whatever
   the engine says. A deck never calls that move a mistake, never shows a better one, and never
   says "best" unless `grade` says `great`. Use the engine to explain the move (what it does,
   why the other squares are worse there) and beyond the repertoire's line ends. Gaps and
   improvements are not reported.
2. **Maia at 2000 or more.** Maia plays weaker than its number. The tools refuse a lower rating.
   The repertoire's own move shares (Lichess) come first; Maia is for positions without them.
3. **Development first** (revised 2026-10-24). The first ideas say where each piece develops and
   when, pawn moves included. For example: when the f8-bishop goes to e7, d6 or c5, and why. A
   piece's squares are taught by its rule of thumb and by the contrast in its cards'
   explanations, but a square gets a card only where it is a real decision (below). A square the
   piece goes to because it is the only sensible one, or the natural one (a recapture, the gambit
   pawn taken back), is a clause of the rule, not a card.

## A card is a decision (the owner, 2026-10-24)

The first decks (Benoni, Benko, Anti-c3: 35, 27 and 42 cards) asked "where does the f8-bishop
go?" where it had one sensible square, and the question gave the answer away. In four cards in
ten, the piece named had one sensible move. In six in ten, once the piece was named, Maia 2000
found the answer 85% of the time or more. So:

- **Cards come from `decisions`.** It ranks the repertoire's positions by what missing our move
  costs: reach × how often Maia 2000/2200 misses it × what Maia's likeliest other move gives up.
  Its last list (natural: Maia finds it 80% of the time or more; forced: one sensible move) is
  rules of thumb, not cards.
- **About 12 cards a deck, never more than 15, and at most 8 rules.** Cut the cards worth least
  before adding any.
- **The question is neutral; let the board ask.** It may say what the opponent has just played:
  "White has just played 7. Bg5. What do we play, and why?" It never names the square our answer
  goes to or takes on, and never lists our candidates ("d6 or d5?"). It names the piece that moves
  only when that piece still has a real choice. The app hides the chapter's name and the card's
  kind while it asks.
- **The check enforces it** with Stockfish and Maia. It refuses a card in any of these cases:
  - its answer is the only sensible move (unless Maia misses it: then it is the one move that
    saves us);
  - its question names the answer's square;
  - its question names the moving piece, and that leaves one sensible move or Maia then finds the
    answer 85% of the time or more.

  It warns on a card Maia finds 80% of the time unprompted, and on one under 2% reach.

## The rule that matters most

Claude knows a lot of chess and explains well, but misreads boards: squares, what attacks what,
whether a tactic works. So **every concrete claim rests on a tool output**: a move is good or bad,
a piece is loose, a square is weak, a tactic works, a line is legal, how often something happens.
Knowledge decides what to look for and how to say it; it is never the evidence.

- Run `look` on a position before saying anything about it.
- `grade` or `engine` a move at depth 18 or more before saying it works (20 for a claim in the deck).
- Never write a move sequence that hasn't been played through `line`.
- A general rule ("in this structure…", "whenever White plays…") is tested in two or more
  repertoire positions. If it fails in one, narrow its wording to the condition that makes it true.
- Cite the evidence as command → output in the working notes, and briefly in `IdeaSource`.
- `look`'s exchange values are static. A capturing piece pinned to a queen or rook is named, but
  discovered attacks are not counted, so back any "wins material" claim with `grade`. Win% bands
  flatten once a position is decided: in a lost position, even losing a queen may grade only
  `ok`, so read the centipawns there too.

## Tools (`scripts/ideas/cv.ts`, run from the repository root)

`<pos>` is a FEN, `startpos`, or movetext from the start in quotes (`"1. e4 d5 2. exd5 c6"`).

| Command | What it gives |
| --- | --- |
| `look <pos> [--side black]` | board, material, pawns (islands, chains, isolated, doubled, backward, passed), files, centre, development, king cover, each piece's mobility, attackers and defenders, what an exchange loses, pins, both sides' breaks, pawn pushes that hit a piece and outposts, the side to move's checks, captures (exchange value) and double attacks, and the other side's threats |
| `line <pos> <moves…> [--full]` | plays moves; refuses an illegal one and lists the legal moves; prints the FEN |
| `engine <pos> [--side black] [--depth 18] [--lines 4]` | Stockfish's lines |
| `grade <pos> <moves…> [--depth 18]` | each move against the best, banded great/good/ok/bad/blunder by win% lost (<3, <6, <10, <20, ≥20: the storm's scale) |
| `threat <pos>` | what the side not to move would play if it could move twice |
| `squares <pos> <square> [--depth 18]` | every move of the piece on that square, graded: why the repertoire's square and not the others |
| `maia <pos> [--elo 2000,2200] [--grade 14]` | what people at those ratings play (2000 or more); with `--grade`, each likely move's band (a natural move that loses is a trap) |
| `tree <pgn> [--side] [--min 1] [--ours] [--leaves]` | every position with its reach (share of games), from the opponent's move shares (`{ 45% }` comments) read at the merged position; a move without a share takes an even part of what the others leave |
| `profile <pgn> [--engine 18 --top 20]` | what we play, where our pieces stand at the line ends, structures, material, kings, and the engine's eval of the most reached line ends |
| `develop <pgn> [--piece f8-bishop]` | the development map: each of our pieces and pawns, in the order they come out, with its first squares by reach, the positions where it goes there, what stands on the board there and not at its other squares ("with"/"without"), and its routes to the line ends; `--piece` lists every position with its FEN and setup |
| `playout <pos> --n 6 --plies 20 --white maia:2000 --black sf:12:25` | short games from a position, with what each side played: model games where none exist |
| `decisions <pgn> [--min 2] [--depth 14] [--top 40] [--no-engine]` | our positions at 2% reach or more, past the trunk, ranked by value (reach × Maia's miss × the miss's cost): each with its FEN, how often Maia 2000/2200 finds our move (or the same exchange in another order), Maia's likeliest other move and what it gives up, our sensible moves; then the natural or forced ones. About 2.5 minutes on the lite Stockfish for 90 positions |
| `check <deck.pgn> --rep <repertoire.pgn> [--depth 18] [--cards 12] [--no-engine] [--no-maia] [--verbose]` | the deck's check (below); `--verbose` prints each card's sensible moves and how often Maia finds its answer |

Stockfish is the vendored lite build, single-threaded (depth 18 with 4 lines takes about 10 s).
On a machine with a native Stockfish, set `STOCKFISH=/path/to/stockfish` (and
`STOCKFISH_THREADS`). Searches are cached in `IDEAS_CACHE` (a temp folder by default), shared
between agents.

## Procedure

1. **Inputs.** The repertoire PGN and its side (`Orientation`, or ask). Optional: a games PGN,
   the opening's name, the owner's rating band (default: club player, opponents read with Maia
   at 2000–2200). Work in the scratchpad. Never commit a repertoire or a deck to this public
   repository.
2. **Read the repertoire.** Save `tree --min 0.5`, `profile --engine 18 --top 20`, `develop`
   and `decisions --min 2 --top 40` to files. They show where the games go, what we play, where
   each piece goes and when, what the line ends look like, how good they are, and which of our
   moves a player misses.
3. **Find ideas through five lenses**, development first, each position a decision from
   `decisions` (or, beyond the repertoire, a position Maia misses):
   - **Development (pieces):** for each knight and bishop (and the queen when it comes out
     early), every first square with 3% or more reach. Find its condition: start from
     `develop`'s "with" and "without" features, then confirm it on the board with `look`. Find
     the reason with `squares` at the decision position: what each other square allows or loses
     there. Note its usual route afterwards (`develop`'s routes), and a recurring move as a
     recurring move.
   - **Development (pawns, king, rooks):** the pawn moves we make and when (breaks included),
     when we castle and to which side, and where the rooks go.
   - **Structure, material, centre:** what we get for what we give, the structures, both
     sides' breaks, what trades mean.
   - **Tactics, traps and attack:** recurring motifs. Run `maia --grade` where the opponent
     moves: their natural mistakes are traps. Run it where we move: our pitfalls. Check when an
     attack on the king works.
   - **Move orders and the opponent's choices:** how to meet each move with 5% or more reach,
     the transpositions the repertoire notes, the move-order trap behind a note.

   When the owner has opted into workflows (ultracode, or asked for one), run steps 3–7 as the
   saved workflow `opening-ideas-deck` (`.claude/workflows/opening-ideas-deck.js`). Pass these
   `args`:
   - `work`: the folder with `repertoire.pgn`, `tree.txt`, `profile.txt` and `develop.txt`
   - `deck`: the output path
   - `opening`
   - `side`
   - `start`: the opening's FEN, for the rules of thumb
   - `event`
   - `about`: what the repertoire is and what its comments mean
   - `level`
   - `hints`: optionally, what to look at per lens
   - `lenses`: optionally, which lenses to run, e.g. `["pieces", "pawns"]` for the development
     ideas alone
   - `lean`: optionally `true`: no analysts, curator or skeptics; the writer chooses from
     `decisions.txt`, verifies and writes, and the critic fixes what it finds. That is 2 agents,
     against about 14 for the full run, which takes over a million tokens. The owner settled on
     lean runs for now (2026-10-20; since 2026-10-24 lean runs no lenses: `decisions` finds the
     positions they looked for).
   - `cards`: optionally the deck's size (default 12).

   Otherwise do the lenses in turn yourself. Use `tree --min 0` to find the reach of a position
   below the saved cutoff.
4. **Curate** about 12 cards, grouped into at most 8 ideas, each with one rule of thumb (rule n
   sums up idea n). Take the cards from `decisions` by value:
   - **Development first,** in the order the pieces come out (`develop`'s order). A piece
     whose first square depends on the setup is one idea, with a card for each square that is a
     real decision; a square that is natural or forced there is a clause of its rule. Pieces
     and pawn moves with one square each can share an idea: the setup.
   - Then what the pawn or the opening buys, the middlegame plans, tactics and attacks, in the
     order they come up in a game.
   - Merge duplicates. Settle contradictions with the tools. Every opponent setup with 5% or
     more reach is covered by an idea or a rule.
   - A rule is short (about 100 characters) and states one condition a player can see on the
     board; sub-cases go on the cards. A development rule names the piece and each square
     with its condition ("f8-bishop: d6 against Bb5 with Nf3; c5 against Bc4; e7 against
     Be2").
5. **Verify each idea as a skeptic:**
   - Play its moves and match the FEN.
   - Each answer at a repertoire position must be the repertoire's move. Beyond the line ends,
     grade it at depth 20: it must be `great`. A "fails" move must grade `bad` or worse.
   - Engine the end of its line.
   - Check each arrow starts on a piece of the right colour.
   - Confirm every factual phrase, above all the "why": run `squares` for a development card.
   - Test the rule in two more positions.
   - Then keep the idea, fix it, or drop it.
6. **Write the deck** (format below). Then run `check --rep <repertoire> --depth 18` and fix
   until it reports 0 errors. When a move grades worse than its mark, the content is wrong:
   fix the content, not the glyph, unless the glyph is what's wrong.
7. **Review as a critic.**
   - Spot-check 8 or more claims with the tools.
   - Check that each card is a real decision, asked neutrally (`check --verbose` prints its
     sensible moves and how often Maia finds the answer), and has one answer on the board.
   - Check the size: about 12 cards and at most 8 rules.
   - Read each rule's condition literally against every card: no card may contradict a rule,
     and every clause of a rule needs a card.
   - Check that the development ideas come first and that every first square with 3% or more
     reach is in a rule (with a card where it is a real decision).
   - Check that no card offers a move better than the repertoire's.
   - Check coverage and clarity.
   - Fix what you find and check again.

   In the pilot the critic found three rules wrong or too broad after the skeptics had passed
   them: this step is not optional.
8. **Deliver** the deck as a file (`SendUserFile`). To import it in repworks: Home → Import →
   PGN file → pick the file → "Reference (read only, never trained)". Then, in the study, ☰ →
   "Make idea cards" trains it. Say what was checked with the engine and at what depth, and
   what rests on judgement.

## The deck format (approved by the owner, 2026-10-19)

One game per chapter, Lichess dialect. The headers come in this order, with no double quotes
inside a value:

```
[Event "Ideas: <opening>"]
[ChapterName "3. Pin and jump: ...Bg4 and ...Nd4"]
[Orientation "black"]
[FEN "<the card's position>"]
[SetUp "1"]
[IdeaKind "placement"]
[IdeaQuestion "White has just played d3. Where does your light-squared bishop go, and why now?"]
[IdeaSource "repertoire 6.4% (...9. d3); grade d20: Bg4 great; Maia 2000: 30% play d3 here"]

{ Explanation in 1-3 plain sentences. [%csl Yd4][%cal Gc8g4,Gc6d4] } 9... Bg4 { Why this move. }
10. h3 Bh5 ( 10... Bxf3? { Too early: … } ) *
```

- `IdeaKind` is one of: `overview`, `structure`, `break`, `placement`, `maneuver`, `king`,
  `exchange`, `tactic`, `trap`, `move-order`, `endgame`. Only the rules of thumb are `overview`:
  repworks makes no card of one.
- **The rules of thumb** are two `overview` chapters at the opening's starting position, with
  the rules numbered in their comments and no moves. "0. Rules of thumb: where the pieces go"
  holds the development rules. "0b. Rules of thumb: plans and tactics" holds the rest, its
  numbers going on from the first. Each stays under 1500 characters. They make no cards.
- **More positions of the same idea** are their own chapters, named "3b. … (another position)".
  "Where it fails" is a side line with a move marked `?` (or `??`), or its own chapter, named
  "3d. … (where it fails)". Two chapters never start at the same position: merge them into one
  card with both side lines.
- **A side line left unmarked** is a playable move, but not the answer: the card asks for its
  first move or a first move marked `!` beside it (repworks' idea cards answer it with the side
  line's comment). Mark a move `!` only beyond the repertoire, and only when it is as good as
  the main move (`great`); say so in its comment.
- **At a repertoire position** the card's answer is the repertoire's move. Another move of ours
  beside it is a side line showing why that square is worse there: marked `?` when it grades
  `bad` or worse, otherwise unmarked or `?!`, with a comment saying what it gives up. It never
  grades better than the repertoire's move.
- **Colours:**
  - green (G): our plan
  - red (R): their threat, or what we prevent
  - blue (B): a second option
  - yellow (Y) circles: key squares

  Every arrow starts on a piece, or where another arrow of the same comment ends (a route).
- **The question** is neutral (see "A card is a decision"): what the opponent has just played,
  then "What do we play, and why?". No square of our answer, no list of candidates, and the piece
  named only where it still has a real choice.
- **Explanations** are for a club player: plain words, no engine numbers (those go in
  `IdeaSource`), and no claim the evidence doesn't back.
- **What the checker enforces** (with `--rep`, against the repertoire):
  - at a repertoire position: the answer and the main line's move are the repertoire's, which
    is never marked `?`; a side line that grades better than it is a warning
  - the headers and the kinds
  - an explanation and an arrow or circle at the start
  - arrows that start on pieces
  - legal moves
  - every move of the deck's side graded at least `ok` unless marked `?`
  - a `?` that grades `bad` or worse
  - a `??` that grades as a blunder
  - an opponent's blunder flagged unless marked
  - a chapter that comes back unchanged from the site's PGN writer
  - beyond the repertoire, a card's answer that isn't `great` (a warning)
  - no two cards at the same position (a warning)
  - an `overview` chapter with a question or moves (a warning: it would make no card)
  - a card whose answer another capture of ours reaches by taking the same exchange in another
    order (a warning: the card would call that move wrong; `decisions` counts it as found)
  - a card that is no decision: its answer the only sensible move (unless Maia misses it), its
    question naming the answer's square, or naming the moving piece when that leaves one
    sensible move or Maia then finds it 85% of the time (errors); Maia finding it 80% of the
    time unprompted, or a position under 2% reach (warnings)
  - more cards than `--cards` (a warning), or more than 15 (an error)
