// The storm's positions shared through the data repo (PLAN.md §5.102): a position as a line and
// back, the device's files by day and part, a merge into what is kept, and the overnight gather's
// explorer window.
//
// Controls run on this code (2026-10-12), each failing exactly the named assertions:
// - `sharedFiles` keeping the positions marked `from` → "the device's files";
// - `mergeShared` taking any Stockfish list over the kept one (no depth compared) → "a merge";
// - `explorerUntil` counting months from 1 (`% 12` without the + 1) → "the explorer's window".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';
import { classifyPath } from '../../../../src/core/data/layout.ts';
import { explorerUntil, type StoredPosition } from '../../../../src/core/storm/harvest.ts';
import { mergeShared, parsePositionLine, parseSharedFile, positionLine, SHARE_PER_FILE, sharedFiles } from '../../../../src/core/storm/shared.ts';

const FEN = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
const FEN2 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 11, 22, 0);

function pos(fen: string, at: number, extra: Partial<StoredPosition> = {}): StoredPosition {
  const key = positionKey(fen);
  return {
    card: 's|' + key,
    key,
    fen,
    side: 'black',
    ply: 3,
    lines: [{ sid: 'S1234567', cid: 'c1234567', path: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }],
    names: ['Ruy'],
    arrived: { san: 'Bb5', uci: 'f1b5', before: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' },
    scored: [
      { u: 'a7a6', s: -20, w: 48 },
      { u: 'g8f6', s: -25 },
    ],
    src: 'cdb',
    depth: 0,
    invented: false,
    unc: null,
    games: 1200,
    at,
    ...extra,
  };
}

test('a position as a line and back: everything but where it came from; a line this version can’t read is counted, not guessed', () => {
  const p = pos(FEN, T0, { maia: [{ elo: 1500, moves: [['a7a6', 0.41]] }], kind: 'hold', unc: { san: 'c3', share: 4, games: 30 } });
  const line = positionLine({ ...p, from: 'AbCd1234' });
  assert.ok(!line.includes('AbCd1234'));
  assert.ok(!line.includes('"card"'));
  assert.deepEqual(parsePositionLine(line), p);
  // The key comes from the FEN, never from the line.
  assert.equal(parsePositionLine(line.replace('"v":1', '"v":1,"key":"x"'))!.key, p.key);
  const { positions, unread } = parseSharedFile([line, '', '{"v":2,"fen":"x"}', 'not json', line.replace('"src":"cdb"', '"src":"lc0"')].join('\n'));
  assert.equal(positions.length, 1);
  assert.equal(unread, 3);
  assert.equal(parsePositionLine(line.replace(FEN, '8/8/8/8/8/8/8/8 w - - 0 1')), null);
});

test("the device's files: its own positions only, by the UTC day each was gathered, in order, a part to every SHARE_PER_FILE", () => {
  const many = Array.from({ length: SHARE_PER_FILE + 1 }, (_, i) => pos(FEN, T0 + DAY + i));
  const files = sharedFiles([pos(FEN2, T0 + 1000), pos(FEN, T0 + 10), pos(FEN, T0 + 20, { from: 'Other123' }), ...many], 'Dev12345');
  assert.deepEqual([...files.keys()], ['storm/Dev12345/2026-10-11.1.jsonl', 'storm/Dev12345/2026-10-12.1.jsonl', 'storm/Dev12345/2026-10-12.2.jsonl']);
  const first = parseSharedFile(files.get('storm/Dev12345/2026-10-11.1.jsonl')!).positions;
  assert.deepEqual(
    first.map((p) => p.at),
    [T0 + 10, T0 + 1000],
  );
  assert.equal(parseSharedFile(files.get('storm/Dev12345/2026-10-12.1.jsonl')!).positions.length, SHARE_PER_FILE);
  assert.equal(parseSharedFile(files.get('storm/Dev12345/2026-10-12.2.jsonl')!).positions.length, 1);
  for (const path of files.keys()) assert.deepEqual(classifyPath(path).kind, 'storm');
  // The same positions, the same text: nothing to push when nothing changed.
  assert.deepEqual(sharedFiles([pos(FEN, T0 + 10), pos(FEN2, T0 + 1000)], 'Dev12345').get('storm/Dev12345/2026-10-11.1.jsonl'), files.get('storm/Dev12345/2026-10-11.1.jsonl'));
});

test('a merge: one not kept comes in marked; one kept takes a better list and the Maia ratings it lacks, and stays its own', () => {
  const theirs = pos(FEN, T0, { src: 'sf', depth: 24, scored: [{ u: 'g8f6', s: -10 }], maia: [{ elo: 1100, moves: [['a7a6', 0.5]] }] });
  assert.equal(mergeShared(undefined, theirs, 'Other123')!.from, 'Other123');
  const mine = pos(FEN, T0 - 5, { maia: [{ elo: 1500, moves: [['g8f6', 0.3]] }] });
  const m = mergeShared(mine, theirs, 'Other123')!;
  assert.equal(m.from, undefined);
  assert.equal(m.at, T0 - 5);
  assert.deepEqual([m.src, m.depth, m.scored], ['sf', 24, [{ u: 'g8f6', s: -10 }]]);
  assert.deepEqual(
    m.maia!.map((r) => r.elo),
    [1100, 1500],
  );
  // Nothing better and nothing new: no change.
  assert.equal(mergeShared(m, theirs, 'Other123'), null);
  // A shallower Stockfish list, or ChessDB's, never replaces a deeper one.
  const deeper = pos(FEN, T0, { src: 'sf', depth: 26, maia: theirs.maia! });
  assert.equal(mergeShared(deeper, theirs, 'Other123'), null);
  assert.equal(mergeShared(theirs, pos(FEN, T0), 'Other123'), null);
});

test("the explorer's window: months back from now, across a year's turn; none for none back", () => {
  assert.equal(explorerUntil(Date.UTC(2026, 9, 12), 0), undefined);
  assert.equal(explorerUntil(Date.UTC(2026, 9, 12), 4), '2026-06');
  assert.equal(explorerUntil(Date.UTC(2026, 1, 1), 4), '2025-10');
  assert.equal(explorerUntil(Date.UTC(2026, 11, 31), 11), '2026-01');
  assert.equal(explorerUntil(Date.UTC(2026, 9, 12), 48), '2022-10');
});
