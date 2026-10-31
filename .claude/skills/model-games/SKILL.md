---
name: model-games
description: Analyze model games - Lc0 against Maia from one shared position (the end of the owner's prep), made by the owner's model-game generator (model_games_app.py, files named modelgames_<position>.pgn) - and summarize the strong side's plans and goals from that position - what it plays again and again, where each piece goes, its pawn breaks, what it is after (material back, a weakness, the king), how the weaker side goes wrong and how it is punished, the moves a human would not find, the rules of thumb and the games worth studying. Every number is counted from the games, every chess claim checked with Stockfish, Maia and the position's computed facts. Use when the owner gives model games or asks for the plans, goals, typical middlegame or "how to play this position" from them. PLAN.md section 5.141.
---

# Model games: the plans and goals from a position

The owner makes model games to see how a stronger player punishes a weaker one in a position
they reach from their prep: Lc0 (the strong side) against Maia 3 (human-like, about 2200–2600),
30–50 games from the same position. This skill reads them with tools and writes what a player
should take away: the plan, its goals, how the opponent goes wrong, and how to punish it.

## What the games are (read before trusting a number)

The generator (`model_games_app.py`, the owner's) writes one PGN per position:

- `[White "Lc0"]` or `[Black "Lc0"]` names the strong side; the other is `Maia3-<elo>` with its
  `WhiteElo`/`BlackElo`, `MaiaOppoElo`, `MaiaTemperature` and `MaiaTopP`.
- `{ end of prep }` on the prep's last move: the shared position stands after it.
- Lc0's eval after every fifth of its moves, `{ -0.57 }`, **from White's side**, `+M`/`-M` a mate.
- `{ eval -0.94 -> -3.42 }` on the weaker side's move where Lc0's eval moved 1.00 or more between
  its move before and its move after: in the strong side's favour, that move is a mistake.
- Games end by mate, or are **adjudicated** once Lc0 sees ±6.00 for four of its moves running
  (`[Termination "adjudication"]`), or at a ply cap. So the games show the plan and the
  punishment, not the technique of winning a won position.

Three things follow:

1. **The first two moves of the weaker side are deliberately random** (the generator plays them at
   temperature 1, top-p 1, to spread the games). The branch shares there say how the games were
   spread, not what people play. For that, read `maia` at the shared position (and Lichess where
   the repertoire has shares).
2. **Lc0's evals are Lc0's**, at about 1000 nodes, on its own scale: quote them as "Lc0 thinks
   Black is winning", not as Stockfish numbers. Stockfish numbers come from `engine` and `grade`.
3. **Lc0 plays well, not perfectly**, and Maia's mistakes are ones a strong human makes. The skill
   teaches what the strong side did, as the opening-ideas skill teaches the repertoire: it doesn't
   hunt for Lc0's improvements. A move is called good or best only on `grade`'s word.

## The rule that matters most

As in the opening-ideas skill: Claude knows chess and explains well but misreads boards. **Every
concrete claim rests on a tool output**: how often something happens (from `games`), that a
move works or loses (`grade`/`engine`, depth 18 or more; 20 for a claim in the summary), what a
move attacks or defends, a pin, a weak square (`look`), a line (played through `line`). A general
claim ("Black plays ...f5 once White's knight leaves f3") is checked in the games (`--with`,
`--after`) and on two or more boards. Cite the evidence as command → output in the working notes
and briefly in the summary's evidence section.

## What the owner values (from the idea decks, 2026-10-25)

1. **The common patterns**: the moves, squares and breaks that recur across the games.
2. **When a pattern breaks**: the games or branches where the strong side does something else, and
   what on the board makes it.
3. **Unintuitive decisions**: the strong side's moves a human would not find (`games --maia`).

And from the idea decks, development first: say where each piece goes, and when, before the
middlegame plans.

## Tools (`scripts/ideas/cv.ts`, run from the repository root)

The opening-ideas tools (`look`, `line`, `engine`, `grade`, `threat`, `squares`, `maia`,
`playout`, …; see that skill's table) plus:

| Command | What it gives |
| --- | --- |
| `games <pgn> [--window 12] [--maia 2000,2200]` | the report: the shared position, results, the games' tree from it (`--depth 4`, `--min 2`), the strong side's moves by what they do in its first `--window` moves (games, how many before the game tips, the move number, contact: a capture or a pawn move that hits), where each piece goes (first squares, routes, kept or traded), the weaker side's moves, checkpoints (`--at 10,20,30,40` plies: material against the start settled after exchanges, pieces left, queens, kings, pawn faults, skeletons, Lc0's eval), Lc0's eval after its 5th…30th move and when it first reaches +1.50 and +3.00, the material won against the start (+1, +2, +3, +5, and −2: a sacrifice) with the capture behind it, the weaker side's mistakes (jumps of `--jump 100` or more) and where each game tipped (the first jump to +1.50 or more) with the FEN, the punishment and its line, and the games that show the common plan best and the quickest wins. With `--maia`, also Maia's chance (playing the strong side) of each of Lc0's moves, rarest first, and of each punishing reply. About 2½ minutes for 50 games with `--maia` (window 12); a second without |
| `games <pgn> --after "10. Re1 Rad8"` / `--with f5` | the same, for the games through those moves after the shared position, or those where the strong side plays that move (by what it does: `f5`, `Nd4`, `O-O`) within the window |
| `games <pgn> --game 17` | one game from the shared position, with Lc0's evals for the strong side and the jumps, and the FEN before each jump and at the end |
| `tree`, `develop`, `profile`, `decisions` with `--games` | the opening-ideas tools on the games read as one repertoire: the strong side's moves are the moves to learn, every move weighted by its share of the games. `develop --games` gives each piece's squares with the setups that go with them ("with"/"without"), counted from the game's start, so a piece that moved in the prep shows its prep square: read its squares after the shared position from `games`, and `develop` for the conditions of the pawns and pieces that first move after it; `decisions --games --min 6` ranks the strong side's moves by reach × Maia's miss × the miss's cost (slow: about 1.5 s a position) |
| `check <deck> --games <pgn>` | the idea deck's check, against the games: Lc0's moves are the answers |

Moves after the shared position are the games' own SAN; `--after` takes movetext or bare SAN.

## Procedure

1. **Inputs.** The model games PGN. The opening's or position's name (the file's
   `modelgames_<name>`), the owner's prep if given (the repertoire the position comes from), and
   the owner's level (default: club player). Work in the scratchpad. Never commit the games or the
   summary to this public repository.
2. **Read the games.** Save to files: `games <pgn> --window 12 --maia 2000,2200`, `develop
   --games` and `tree --games --min 6`. Then, for each of the weaker side's replies at the shared
   position (and at the next branching) in 15% of the games or more, `games --after "<moves>"`.
   Read `--game <n>` for the typical games and the quickest wins the report names.
3. **Read the shared position:** `look`, `engine --depth 20 --lines 4`, `threat`, and `maia` (what
   people play here for the weaker side, against the report's random first moves; and what a
   human of the strong side would play, against Lc0's).
4. **Find the plan through six lenses**, in this order:
   - **Where the pieces go** (development first): each piece's first squares and routes, with the
     share of games and the move number; `develop --games` for the setup that goes with each
     square; the pieces that stay, and those traded early (and for what).
   - **Pawn moves and the structure:** the strong side's pawn moves with their timing and contact
     (a break hits a pawn), the structure at +10 and +20 plies, the faults it creates (doubled,
     isolated, backward pawns) on either side. For a break, `look` at the position before it: what
     it hits, what it opens, what it gives up.
   - **The goals:** what the plan gets, by when, in how many games. Material against the start
     (in a gambit: the pawn back, then more), the opponent's king (where it stands, the checks and
     mates, the pieces that come near it), a weakness won or fixed, the bishop pair, a passed
     pawn. Name a goal only when the games show it (the share and the move number) and the board
     shows why (`look`).
   - **How the weaker side goes wrong:** the turning points (the report's "where the game tipped")
     grouped by kind, not by move: the same idea at several boards (a natural developing move
     that drops a pawn, a pawn grab that opens the king, an exchange that hands over a square). For
     each kind, one or two positions: `grade` the mistake (it must be `bad` or worse) and the
     punishment (`great` or `good`), `look` at what the punishment hits, and say how often Maia
     as the strong side finds it (the report's `--maia` number). Lc0's jump is not Stockfish's: a
     "mistake" that grades `good` or `ok` at depth 20 means the position was already going wrong
     (or Lc0 saw late). Then `grade` the weaker side's moves a move or two earlier to find where
     it went wrong, and teach the punishing move as the plan's threat there (what the weaker side
     had to meet, and the one move that meets it). In the pilot, 15. h3 (three games, Lc0 +0.34 →
     +1.55) graded `good`: after 14…f5 Black threatened …f4 against the g3-bishop, Stockfish's
     best was 15. Qd2, and 15. Nd2 was a blunder.
   - **The moves a human wouldn't find:** the report's rarest strong-side moves played in 8% of
     the games or more. Explain each with `squares` or `grade` (what the natural move allows
     there) and `look`. These are the lessons the owner values most after the patterns.
   - **Their main tries:** for each reply in 15% of the games or more, what changes in the plan
     (`--after`): another square for a piece, another break, another goal. A pattern broken here
     says what on the board breaks it.
5. **Verify as a skeptic.** Every share and move number is the report's (quote it). Every move
   sequence is played through `line`. Every "why" has a tool output. Each rule of thumb is tested
   against the games (`--with`, `--after`: how many games keep it, which break it) and narrowed to
   the condition that makes it true. Lc0's eval is never the evidence that a move works: `grade` is.
6. **Write the summary** (format below), about 1500 words before the evidence section, plain
   words for a club player, no engine numbers in the prose (they go in the evidence section).
7. **Review as a critic.** Spot-check 6 or more claims with the tools; read every rule of thumb
   literally against the games (a rule with exceptions names them or gets narrower); check that
   the pieces come first, that every reply with 15% or more is covered, and that no claim rests on
   Lc0's evals alone or on the random first moves' shares. Fix and check again.
8. **Deliver** the summary as a file (`SendUserFile`). Say what was counted, what was checked with
   the engine at what depth, and what rests on judgement. Offer the next step: an idea deck to
   train it (the opening-ideas skill, reading the games with `--games`: cards at the shared
   position's decisions, the turning points and the rare moves; `check <deck> --games <pgn>`),
   or more games for a branch with few.

## The summary's format

```markdown
# Plans: <position name> (<side>)

<the moves to the shared position> — <side to move>; FEN `<fen>`. Material: <…>.
Stockfish (depth 20): <eval, one line>. <N> model games, Lc0 as <side> against Maia
<min>–<max>: <results>; median <n> plies after the position; <how they end>.

## The plan in one paragraph
<what the strong side does, in the order it does it, and what it is for>

## Where the pieces go
| Piece | Usually | When | Why / against what |
<one row per piece that moves in 15% of games or more; the stays and early trades below>

## Pawn breaks and the structure
<the breaks with timing and what they hit; the structure the games reach; the faults>

## Goals
1. <goal> — <in how many games, by which move>; <how: the typical sequence>; see game <n>.
…

## Against their main tries
- **<reply> (<share> of the games)**: <what changes>

## How they go wrong, and the punishment
1. **<the kind of mistake>** (<k> games, e.g. game <n>, <move>): <what it allows>; punished by
   <move>, which <what it wins or hits>. Maia (as us) finds it <p>% of the time. `FEN <fen>`
…

## Moves a human wouldn't find
- **<move>** (<share> of the games, Maia <p>%): <why it is right there, and what the natural
  move allows>

## Rules of thumb
1. <about 100 characters, one condition a player can see on the board>
… (at most 8)

## Games to study
- Game <n> (<plies> plies): <why: the common plan / a main try / a typical punishment>

## Evidence
<the commands behind each section, with the key output; what rests on judgement>
```
