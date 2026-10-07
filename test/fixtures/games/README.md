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
