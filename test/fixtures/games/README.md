Games in mistake-lab's analyzer shape (`analyzed_games.json`, its `version: 2` object), for the
extraction's tests (PLAN.md §5.52):

- 16 public Lichess games of `DrNykterstein` (CC0, as Lichess publishes every game), fetched on
  2026-10-07 from `/api/games/user/DrNykterstein?analysed=true&evals=true&clocks=true&opening=true`
  with Lichess's own server analysis, `pgn` left out, then run through mistake-lab's analyzer
  (`c525403`, `node analyze.js --scan-tactics --username drnykterstein --tactic-depth 14`, with
  the vendored Stockfish 18 lite) so they carry its `_playerColor`, clocks in seconds
  (`_clocksStamped`) and its `tactics` (two games have one);
- `_test_clocks_6sS121tG`, mistake-lab's own test game (its `extractAllMistakes`), and five
  variations of it made for the advantage rules: `synthAdv1` (clocks at 600 s: no time trouble),
  `synthAdv2` (lost on time while behind), `synthAdv3` (won), `synthAdv4` (lost on time while
  ahead), `synthMate` (mate scores in its evals), `synthEdge15` (+300 from ply 15: one ply early) and
  `synthHeld` (the advantage held through a dip below +300).

`mistake-lab-items.json` is what mistake-lab's own code extracts from them: its
`extractMistakesForGame` and the advantage pass of `extractAllMistakes`, cut out of `index.html`
at `c525403` and run in Node with chess.js 0.10.3 by `mistake-lab-harness.cjs`
(`node mistake-lab-harness.cjs <mistake-lab>/index.html analyzed_games.json`, with `chess.js@0.10.3`
installed beside it), no repertoire and nothing invalidated.

`sequences.json` holds the sequence checks' cases (PLAN.md §5.56): each a tree of lines from one
Italian position and the engine's lines at its positions, its lines in mistake-lab's shape
(`mlLines`, made by the site's own `sequenceLines`), and `expected`: the warnings and unverified items
mistake-lab's own `validateSequenceLines` gives, cut out of `index.html` at `c525403` and run in Node
by `mistake-lab-sequences.cjs` (`node mistake-lab-sequences.cjs <mistake-lab>/index.html sequences.json`).

`practice.json` holds practice's cases (PLAN.md §5.57): explorer answers and draws, Maia's
probabilities at four precisions, advantage drills (scores and win% given up per move), two games to
review (with a repertoire's moves by position) and stopped games' scores; `expected` is what
mistake-lab's own `pickExplorerMove`, `maiaSampleMove`, `updateAdvantageTracking` with
`finishAdvantage`, `buildContLineReviewData` and `evalToResult` give, run at `c525403` by
`mistake-lab-practice.cjs` (the page's UI calls stubbed, `Math.random` the case's draw).

`repcheck.json` holds the repertoire checks' cases (PLAN.md §5.58–§5.60): 17 games made for the rules
(moves, colour, result, speed, whether analysed, with their positions as mistake-lab caches them),
a five-line repertoire and mistake-lab's trie of it, a dismissed position, drilled items, raw
mistakes, practice games and practice results; `expected` is what mistake-lab's own
`detectRepertoireDeviations`, `buildDrilledIndex` with `computeRecidivism`, and its position index
with `computeHumanWeakSpots` and `computeBotWeakSpots` give, run at `c525403` by
`mistake-lab-repcheck.cjs` (through `mistake-lab-sandbox.cjs`; chess.js 0.10.3 replays the practice
games: `node mistake-lab-repcheck.cjs <mistake-lab>/index.html repcheck.json <a folder with chess.js@0.10.3
installed>`).

`checklist.json` holds the checklist's cases (PLAN.md §5.62): an 11-line White study (its lines,
and mistake-lab's per-study trie of it: the first own move at each position), the explorer's games
at its opponent's positions, and six settings (slots, plies, an exclusion); `expected` is what
mistake-lab's own `generateTodoVariations` gives, run at `c525403` by `mistake-lab-checklist.cjs`
(its study fetch, PGN parser and explorer stubbed from the fixture; chess.js 0.10.3 walks the moves).
