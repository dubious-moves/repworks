# Planning prototypes

Scratch code from the planning session of 2026-10-05. It produced the findings in `PLAN.md` §2,
and it's kept so they can be re-run and so Phase 0 can start from it. It isn't part of the
build: nothing imports it, `npm test`'s globs (§4.1) don't reach it, and the type check should
leave it out too. Delete the folder once Phase 0 has replaced what it covers (§4.3, §4.5, §4.7).

Run `npm install` here, then `node <file>`. The TypeScript test runs with
`node --test position-key/key.test.ts` (Node ≥22.18). The dependency versions are the ones the
findings were produced with. Three probes read sibling checkouts at the cloud session's paths
(`/home/user/<repo>`), as noted below.

| File | What it shows | Feeds |
| --- | --- | --- |
| `merge/merge.mjs` | Three-way merge of move trees keyed by SAN path, with D4's rules: clashing text kept between git-style markers, an edit beats a delete, glyphs and shapes merged as sets. | §4.7 |
| `merge/prop.mjs` | 20,000 random pairs of concurrent edits: nothing added or written is lost, untouched deletions hold, and the identity laws hold. | §4.7's tests |
| `merge/sim.mjs` | 3,000 random two-device histories converge. Re-merging one's own landed change nests the markers, which is why sync carries commit IDs. | §4.7, §4.9 |
| `position-key/key.ts`, `key.test.ts` | `positionKey` from chessops's canonical FEN: en passant only when legal, impossible castling rights dropped. | §4.3 |
| `position-key/ep-test.mjs` | The en passant rule of puzzle-explorer's dataset, of chessops and of mistake-lab, compared on pinned-pawn positions. Reads puzzle-explorer's `lib/posKey.js`. | §4.3 |
| `position-key/dataset-ep-scan.mjs` | 256 of the dataset's 4,096 index shards: every key is a fixed point of the chessops key and hashes to its shard. Reads `puzzle-explorer-data/index/`. | §4.3 |
| `lichess-dialect.mjs` | A ~60-line writer for Lichess's PGN dialect, reproducing two fixtures byte for byte after chessops parses them. The fixtures are hand-built, not real exports; §4.5 (a) gets those. | §4.5 |
| `qchess-dialect.mjs` | chessops reads PGN as Qchess writes it: shapes come out of the shared comment block, `$n` glyphs are kept, and a start FEN with Black to move works. | §4.5 (c), §4.10 |
| `repgen-parse.mjs` | chessops parses three of q_extension's repgen files with no illegal moves. Reads `q_extension/repertoires/`. | §4.5 (c) |
| `overdis.mjs` | chessops accepts Chessable's over-disambiguated `Ndb5` and writes it as `Nb5`. | §4.5 |
| `uci.mjs` | chessops writes castling internally as king takes rook (`e1h1`), so card IDs need the standard `e1g1` (D3); also what it hands chessground. | §4.4, §4.11 |
| `chessjs-variations.mjs`, `chessjs-variations2.mjs` | Why chess.js is out (D6): 1.4.0 drops variations and glyphs, and throws on two comments after one move. | D6 |
