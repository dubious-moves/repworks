---
name: opening-ideas
description: Turn an opening repertoire (a PGN from repworks, Qchess, Lichess or the owner's repertoire builder) into an idea deck of key ideas and rules of thumb, as PGN flashcards repworks imports - one chapter per idea, a position with arrows, a question and an explanation, every claim checked with Stockfish, Maia and the position's computed facts. Use when the owner wants to learn an opening's ideas, plans, typical moves, pawn breaks, traps or rules of thumb before drilling its lines, or asks for idea cards, concept cards or a key-ideas deck. PLAN.md section 5.128.
---

# Opening ideas: a verified idea deck from a repertoire

The owner learns an opening's ideas before its moves. This skill reads a repertoire, finds its
key ideas and rules of thumb, checks every claim with tools, and writes a deck in the format the
owner approved (PLAN.md §5.128): one PGN chapter per idea, imported into repworks as a reference
study.

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
| `look <pos> [--side black]` | board, material, pawns (islands, chains, isolated, doubled, backward, passed), files, centre, development, king cover, each piece's mobility, attackers and defenders, what an exchange loses, pins, both sides' breaks and outposts, the side to move's checks, captures (exchange value) and double attacks, and the other side's threats |
| `line <pos> <moves…> [--full]` | plays moves; refuses an illegal one and lists the legal moves; prints the FEN |
| `engine <pos> [--side black] [--depth 18] [--lines 4]` | Stockfish's lines |
| `grade <pos> <moves…> [--depth 18]` | each move against the best, banded great/good/ok/bad/blunder by win% lost (<3, <6, <10, <20, ≥20: the storm's scale) |
| `threat <pos>` | what the side not to move would play if it could move twice |
| `maia <pos> [--elo 1100,1500,1900] [--grade 14]` | what people at those ratings play; with `--grade`, each likely move's band (a natural move that loses is a trap) |
| `tree <pgn> [--side] [--min 1] [--ours] [--leaves]` | every position with its reach (share of games), from the opponent's move shares (`{ 45% }` comments) |
| `profile <pgn> [--engine 18 --top 20]` | what we play, where our pieces stand at the line ends, structures, material, kings, and the engine's eval of the most reached line ends |
| `playout <pos> --n 6 --plies 20 --white maia:1500 --black sf:12:25` | short games from a position, with what each side played: model games where none exist |
| `check <deck.pgn> [--depth 18] [--no-engine] [--verbose]` | the deck's check (below) |

Stockfish is the vendored lite build, single-threaded (depth 18 with 4 lines takes about 10 s).
On a machine with a native Stockfish, set `STOCKFISH=/path/to/stockfish` (and
`STOCKFISH_THREADS`). Searches are cached in `IDEAS_CACHE` (a temp folder by default), shared
between agents.

## Procedure

1. **Inputs.** The repertoire PGN and its side (`Orientation`, or ask). Optional: a games PGN,
   the opening's name, the owner's rating band (default: club player, opponents 1500–1900).
   Work in the scratchpad. Never commit a repertoire or a deck to this public repository.
2. **Read the repertoire.** Save `tree --min 0.5` and `profile --engine 18 --top 20` to files.
   They show where the games go, what we play, what the line ends look like, and how good they
   are.
3. **Find ideas through four lenses**, each proposing 4–8 ideas with 1–3 positions:
   - **Structure, material, centre:** what we get for what we give, the structures, both
     sides' breaks, what trades mean.
   - **Where the pieces go:** each piece's squares against each setup, with the condition, and
     typical manoeuvres.
   - **Tactics, traps and attack:** recurring motifs. Run `maia --grade` where the opponent
     moves: their natural mistakes are traps. Run it where we move: our pitfalls. Check when an
     attack on the king works.
   - **Move orders and the opponent's choices:** how to meet each move with 5% or more reach,
     transpositions, the move-order trap behind a note.

   When the owner has opted into workflows (ultracode, or asked for one), run steps 3–7 as the
   saved workflow `opening-ideas-deck` (`.claude/workflows/opening-ideas-deck.js`). Pass these
   `args`:
   - `work`: the folder with `repertoire.pgn`, `tree.txt` and `profile.txt`
   - `deck`: the output path
   - `opening`
   - `side`
   - `start`: the opening's FEN, for chapter 0
   - `event`
   - `about`: what the repertoire is and what its comments mean
   - `level`
   - `hints`: optionally, what to look at per lens

   Otherwise do the lenses in turn yourself. Use `tree --min 0` to find the reach of a position
   below the saved cutoff.
4. **Curate:** 10–14 ideas, each with one rule of thumb: rule n sums up idea n. Merge
   duplicates and settle contradictions with the tools. Every opponent setup with 5% or more
   reach is covered by an idea. Order the ideas by when they come up in a game: what the opening
   is for first, then the early moves, then the middlegame plans, tactics and attacks. A rule is
   short (chapter 0 must stay under 1500 characters: about 100 a rule) and states one condition
   a player can see on the board; sub-cases go on the cards.
5. **Verify each idea as a skeptic:** play its moves and match the FEN; grade the answer at
   depth 20 (it must be at least `ok`; a "fails" move must be `bad` or worse); engine the end of
   its line; check each arrow starts on a piece of the right colour; confirm every factual
   phrase; test the rule in two more positions. Then keep it, fix it, or drop it.
6. **Write the deck** (format below). Then run `check --depth 18` and fix until it reports
   0 errors. When a move grades worse than its mark, the content is wrong: fix the content, not
   the glyph, unless the glyph is what's wrong.
7. **Review as a critic:** spot-check 8 or more claims with the tools, then check that each
   question has one answer on the board, that no card contradicts a rule (read each rule's
   condition literally against every card), that every clause of a rule has a card, that
   coverage is complete, and that the text is clear. Fix what you find and check again.
   In the pilot the critic found three rules wrong or too broad after the skeptics had passed
   them: this step is not optional.
8. **Repertoire notes.** These are not part of the deck. The lenses meet them on the way:
   - **gaps:** an opponent move Maia plays 5% or more at a position the tree doesn't cover, with
     our best answer and the reach
   - **improvements:** a repertoire move that grades `ok` or worse, or `good` where another move
     is `great`, with the better move
   - **the owner's own notes,** checked

   Report them to the owner separately. The repertoire builder can take them.
9. **Deliver** the deck as a file (`SendUserFile`). To import it in repworks: Home → Import → PGN file →
   pick the file → "Reference (read only, never trained)". Or use New chapter → From PGN in an
   ideas study. Say what was checked
   with the engine and at what depth, and what rests on judgement.

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
[IdeaSource "repertoire 6.4% (...9. d3); grade d20: Bg4 great; Maia 1500: 30% play d3 here"]

{ Explanation in 1-3 plain sentences. [%csl Yd4][%cal Gc8g4,Gc6d4] } 9... Bg4 { Why this move. }
10. h3 Bh5 ( 10... Bxf3? { Too early: … } ) *
```

- `IdeaKind` is one of: `overview`, `structure`, `break`, `placement`, `maneuver`, `king`,
  `exchange`, `tactic`, `trap`, `move-order`, `endgame`.
- **Chapter 0** is "0. Rules of thumb": `overview`, at the opening's starting position, with the
  rules numbered in its comment and no moves.
- **More positions of the same idea** are their own chapters, named "3b. … (another position)".
  "Where it fails" is a side line with a move marked `?` (or `??`), or its own chapter, named
  "3d. … (where it fails)". Two chapters never start at the same position: merge them into one
  card with both side lines.
- **A side line left unmarked** is a playable move, but not the answer: the card asks for its
  first move or a first move marked `!` beside it (repworks' idea cards answer it with the side
  line's comment). Mark a move `!` only when it is as good as the main move (`great`), and say so
  in its comment.
- **Colours:**
  - green (G): our plan
  - red (R): their threat, or what we prevent
  - blue (B): a second option
  - yellow (Y) circles: key squares

  Every arrow starts on a piece, or where another arrow of the same comment ends (a route).
- **Explanations** are for a club player: plain words, no engine numbers (those go in
  `IdeaSource`), and no claim the evidence doesn't back.
- **What the checker enforces:**
  - the headers and the kinds
  - an explanation and an arrow or circle at the start
  - arrows that start on pieces
  - legal moves
  - every move of the deck's side graded at least `ok` unless marked `?`
  - a `?` that grades `bad` or worse
  - a `??` that grades as a blunder
  - an opponent's blunder flagged unless marked
  - a chapter that comes back unchanged from the site's PGN writer
  - no two chapters at the same position (a warning)
