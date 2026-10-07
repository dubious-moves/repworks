// The puzzle dataset and puzzles from the repertoire's games (PLAN.md §5.47, §5.48), on shards cut
// from the published set (test/fixtures/puzzles): lichessable's dev/check-puzzles.js (the key, the
// shard names, the filters and the missing-field rule, the themes) and dev/check-storm.js §29,
// §29b (the anchor band: its floor, the shallowest ply, a set-up chapter, both sides; a body
// replayed with the solver first, a malformed one refused).
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - `moves[0]` played as the opponent's set-up move → "a body replays, the solver first";
// - the anchor's ply taken per line instead of the shallowest anywhere → "the anchor band".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { bodiesFor, entriesFor, filterByColor, filterByPly, filterByRating, filterByStartPly, filterByTheme, groupByShard, readMeta, shardOf, themeCode, themeLabel, THEME_LIST, type IndexEntry } from '../../../../src/core/puzzles/dataset.ts';
import { anchors, pliesBefore, puzzlePlies, readyPuzzle, selectEntries, userPlies } from '../../../../src/core/puzzles/puzzles.ts';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { stormLines } from '../../../../src/core/storm/sources.ts';

const FIX = new URL('../../../fixtures/puzzles/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, FIX), 'utf8');

test('shards: SHA-1 of the key or the id, three hex; every key of a published shard hashes to it', () => {
  const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 3);
  for (const s of ['0bwf2', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -']) assert.equal(shardOf(s), sha(s));
  const index = JSON.parse(read('index-0a1.json')) as Record<string, unknown>;
  for (const key of Object.keys(index)) {
    assert.equal(shardOf(key), '0a1');
    // The published keys are the site's own (D10): fixed points of positionKey.
    assert.equal(positionKey(key + ' 0 1'), key);
  }
  for (const line of read('puzzles-0a1.ndjson').split('\n').filter(Boolean)) assert.equal(shardOf((JSON.parse(line) as { id: string }).id), '0a1');
  // After 1. e4 no black pawn can take on e3: the key carries "-".
  assert.equal(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
  assert.deepEqual(
    [...groupByShard(['0bwf2', '0h4UP', '0bwf2', 'zz'])].map(([s, ids]) => [s, ids]),
    [
      ['0a1', ['0bwf2', '0h4UP']],
      [sha('zz'), ['zz']],
    ],
  );
});

test('a shard read for the wanted keys and ids only; broken text gives nothing', () => {
  const index = read('index-0a1.json');
  const key = Object.keys(JSON.parse(index) as object)[0]!;
  const got = entriesFor(index, [key, 'absent']);
  assert.deepEqual([...got.keys()], [key]);
  assert.equal(got.get(key)!.length, 6);
  assert.equal(entriesFor('{ not json', [key]).size, 0);
  const bodies = bodiesFor(read('puzzles-0a1.ndjson') + 'not json\n', ['0h4UP', '16JA8', 'nope']);
  assert.deepEqual([...bodies.keys()], ['0h4UP', '16JA8']);
  const meta = readMeta(JSON.parse(read('meta.json')));
  assert.deepEqual(meta, { builtAt: '2026-05-23T07:21:25.458Z', shardHexLen: 3, maxEmissionPly: 22 });
  assert.equal(readMeta({}), undefined);
});

test('filters: a missing field passes; themes: undefined passes, [] does not', () => {
  const m: IndexEntry[] = [
    ['a', 1500, 'w', 10, 30, [23]],
    ['b', 2500, 'b', 14, 50, []],
    ['c'],
    ['d', 1100, 'w', 30, 60, [43, 23]],
  ];
  assert.deepEqual(filterByRating(m, 1200, 2000).map((e) => e[0]), ['a', 'c']);
  assert.deepEqual(filterByColor(m, 'w').map((e) => e[0]), ['a', 'c', 'd']);
  assert.deepEqual(filterByPly(m, 12, 24).map((e) => e[0]), ['b', 'c']);
  assert.deepEqual(filterByStartPly(m, 40, 70).map((e) => e[0]), ['b', 'c', 'd']);
  assert.deepEqual(filterByTheme(m, [themeCode('fork')]).map((e) => e[0]), ['a', 'c', 'd']);
  assert.deepEqual(filterByTheme(m, []).map((e) => e[0]), ['a', 'b', 'c', 'd']);
  assert.equal(THEME_LIST[23], 'fork');
  assert.equal(THEME_LIST.length, 60);
  assert.equal(themeLabel('discoveredAttack'), 'discovered attack');
});

test('a body replays, the solver first; a move that won’t replay refuses the puzzle', () => {
  const body = JSON.parse(read('puzzles-0a1.ndjson').split('\n')[0]!) as { id: string; fen: string; moves: string[] };
  const plies = puzzlePlies(body)!;
  assert.equal(plies.length, body.moves.length);
  assert.equal(plies[0]!.color, body.fen.split(' ')[1] === 'w' ? 'white' : 'black');
  assert.equal(plies[0]!.uci, body.moves[0]);
  assert.equal(userPlies(plies, plies[0]!.color), Math.ceil(body.moves.length / 2));
  assert.equal(puzzlePlies({ fen: body.fen, moves: ['a1a8'] }), null);
  assert.equal(puzzlePlies({ fen: body.fen, moves: [] }), null);
  const cand = { id: body.id, rating: 1900, color: 'w' as const, ply: 14, startPly: 30, anchor: 'k', chapter: 'S1/c1', name: 'Main' };
  const ready = readyPuzzle(body, cand)!;
  assert.deepEqual([ready.id, ready.solver, ready.gamePly, ready.chapter], [body.id, plies[0]!.color, 14, 'S1/c1']);
  assert.equal(readyPuzzle({ ...body, moves: [...body.moves.slice(0, 1), 'h1h8'] }, cand), null);
  assert.equal(readyPuzzle(body, { ...cand, id: 'other' }), null);
});

function lines(...chapters: [string, 'white' | 'black', string, string?][]) {
  return stormLines(
    chapters.map(([name, side, moves, fen], i) => {
      const headers = [`[Orientation "${side}"]`, `[ChapterName "${name}"]`, ...(fen ? ['[SetUp "1"]', `[FEN "${fen}"]`] : [])];
      const p = parseChapterFile(`${headers.join('\n')}\n\n${moves} *\n`, 'c' + i);
      if (!p.ok) throw new Error(p.reason);
      return { sid: 'S1', chapter: p.chapter };
    }),
  );
}

test('the anchor band: plies 12 to 24 by the shallowest ply anywhere, counted in the game; both sides kept', () => {
  const najdorf = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O 9. Be3 Be6 10. Qd2 Nbd7 11. a4 Rc8 12. a5 Qc7 13. Rfd1';
  const as = anchors(lines(['Najdorf', 'black', najdorf]), C);
  assert.ok(as.length > 0);
  assert.ok(as.every((a) => a.ply >= 12 && a.ply <= 24));
  assert.deepEqual(as[0]!.sides, ['black']);
  assert.ok(as[0]!.ply >= as[as.length - 1]!.ply, 'deepest first');
  // maxEmissionPly clamps the ceiling.
  assert.ok(anchors(lines(['Najdorf', 'black', najdorf]), C, 16).every((a) => a.ply <= 16));
  assert.equal(pliesBefore('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'), 1);
  // A position one line reaches at ply 10 is generic, however deep another line reaches it (here
  // at ply 14, after the knights go out and back): out of the band.
  const tenPlies = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6';
  const short = anchors(lines(['Short', 'black', tenPlies + ' 6. Be2 e5 7. Nb3']), C);
  const detour = anchors(lines(['Short', 'black', tenPlies + ' 6. Be2 e5 7. Nb3'], ['Detour', 'black', '1. Nf3 Nf6 2. Ng1 Ng8 3. e4 c5 4. Nf3 d6 5. d4 cxd4 6. Nxd4 Nf6 7. Nc3 a6']), C);
  assert.deepEqual(
    detour.map((x) => x.key),
    short.map((x) => x.key),
  );
  // A set-up chapter is counted from its FEN: a fragment starting at move 30 is past the band.
  assert.equal(anchors(lines(['Fragment', 'white', '30. Kg2 Kg7 31. Kf3 Kf6', '8/5pk1/8/8/8/8/5PK1/8 w - - 0 30']), C).length, 0);
  // Both sides' lines through one position keep both colours.
  const both = anchors(lines(['W', 'white', najdorf], ['B', 'black', najdorf]), C);
  assert.deepEqual(both[0]!.sides.sort(), ['black', 'white']);
});

test('entries kept for an anchor: its colour, the game’s ply in the band, the ratings, none held twice, at random', () => {
  const a = { key: 'k', fen: '', ply: 14, sides: ['black' as const], lines: [{ sid: 'S1', cid: 'c1', path: [] }], names: ['Main'] };
  const m: IndexEntry[] = [
    ['p1', 1500, 'b', 14],
    ['p2', 1500, 'w', 14],
    ['p3', 1500, 'b', 8],
    ['p4', 3000, 'b', 14],
    ['p5', 1600, 'b', 16],
    ['p1', 1500, 'b', 15],
    ['p6', 1700, 'b', 13],
  ];
  const kept = selectEntries(m, a, C, (id) => id === 'p6', () => 0.5);
  assert.deepEqual(kept.map((c) => c.id).sort(), ['p1', 'p5']);
  assert.deepEqual([kept[0]!.chapter, kept[0]!.name, kept[0]!.anchor], ['S1/c1', 'Main', 'k']);
  assert.equal(selectEntries(m, a, { ...C, puzzlesPerAnchor: 1 }, () => false, () => 0).length, 1);
});
