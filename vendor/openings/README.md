# Opening names (vendored)

`openings.tsv` is Lichess's list of chess opening names,
https://github.com/lichess-org/chess-openings, at commit
`3ba6b20d31b2e6125cb0e6a2e792f400717d9d39` (read 2026-11-15). The list is dedicated to the
public domain (CC0 1.0, its README); all credit to its contributors and to Lichess.

It is the list's five files `a.tsv` to `e.tsv` put together by `scripts/openings-build.mjs`:
one row a named line, `eco`, `name` and the line's moves in SAN without their numbers, tab
separated, in the list's order. The script plays every line with chessops and stops at a move
that isn't legal; none was.

| File | Bytes | sha256 |
| --- | --- | --- |
| `a.tsv` (upstream) | 67,257 | `3282e4c9155289a29224f9a85fba0decb46efa35c2fa5e39662d2ac48fb0f793` |
| `b.tsv` (upstream) | 78,137 | `2744a3890879bd9dce79093147fe5b6c3a9d9d42a3388af698e67b6829be1c48` |
| `c.tsv` (upstream) | 132,304 | `447bbd4b15d68067b150faf12bf66aa14b18582cf80d736aaa7c0081131806ef` |
| `d.tsv` (upstream) | 73,318 | `1cf4057a8aece94f27bb3f278ad410ee2844831a642364eeceaafa091dbcceda` |
| `e.tsv` (upstream) | 44,061 | `48c6f6645b031a5937c8386839debab0e2e48837251687ba1afb6369677f8546` |
| `openings.tsv` (this file, 3,865 rows) | 335,182 | `23f7c1520437dae990a4b40925cd37f7993f8918ecc8289600fdcb1da0ed2b2e` |

Reproduce (deterministic), or take a newer list:

    git clone https://github.com/lichess-org/chess-openings
    node scripts/openings-build.mjs chess-openings

The site reads it as a chunk of its own (`src/app/openings.ts`), part of the app's shell, when a
page first asks for a name; `src/core/openings/names.ts` makes the book (PLAN.md §5.181). A newer
list changes two counts in `test/unit/core/openings/names.test.ts`.
