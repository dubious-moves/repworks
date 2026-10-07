// Where storm positions come from (PLAN.md §5.40): lichessable's dev/check-storm.js section 5 (the
// frontier set, §14.18's line ends inside other lines) and section 13 (the uncovered-reply source,
// §19), ported from Chessable variations to repertoire chapters; then the scopes (§14.21, §28).
// Left behind: paused variations (Chessable's flag; the site has none) and colourless lines (a
// chapter without a side makes no lines at all, as in the repertoire index).
//
// Controls re-run on this port (2026-10-06), each failing exactly the named assertions:
// - the covered-end rule removed → "an end another line goes on from" fails;
// - `decisions` keeping the user's own moves → "decision points" fails;
// - `uncoveredMoves` reading the explorer's UCI instead of its SAN → "castling replies" fails (and
//   "uncovered replies", whose fixture gives no UCI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { decisions, frontiers, inScope, stormLines, uncoveredMoves } from '../../../../src/core/storm/sources.ts';
import { START_FEN } from '../../../../src/core/storm/walk.ts';

let n = 0;
function chapter(name: string, side: 'white' | 'black', moves: string, fen?: string): { sid: string; chapter: Chapter } {
  const headers = [`[Orientation "${side}"]`, `[ChapterName "${name}"]`];
  if (fen) headers.push('[SetUp "1"]', `[FEN "${fen}"]`);
  const parsed = parseChapterFile(`${headers.join('\n')}\n\n${moves} *\n`, 'c' + ++n);
  if (!parsed.ok) throw new Error(parsed.reason);
  return { sid: 'S1', chapter: parsed.chapter };
}

test('the frontier set: converging lines make one frontier, the side is the chapter’s', () => {
  const lines = stormLines([
    chapter('Ruy', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'),
    chapter('Ruy by transposition', 'white', '1. Nf3 Nc6 2. e4 e5 3. Bb5'),
    chapter('Puzzle', 'white', '1. Qh5 g6 2. Qxh8', 'rnbqkbnr/pppppp1p/8/6p1/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    chapter('Stub', 'black', '1. e4 c5'),
  ]);
  const { frontiers: fs } = frontiers(lines, C);
  assert.equal(fs.length, 1);
  assert.equal(fs[0]!.n, 2);
  assert.equal(fs[0]!.side, 'white');
  assert.equal(fs[0]!.fen.split(' ')[1], 'b');
  assert.deepEqual(fs[0]!.names, ['Ruy', 'Ruy by transposition']);
  assert.equal(fs[0]!.lines.length, 2);
  assert.equal(fs[0]!.lastSan, 'Bb5');
  assert.equal(positionKey(fs[0]!.lastFen), positionKey('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'));
});

test('a frontier lines of both sides end on is dropped', () => {
  const r = frontiers(stormLines([chapter('W', 'white', '1. e4 e5 2. Nf3 Nc6'), chapter('B', 'black', '1. e4 e5 2. Nf3 Nc6')]), C);
  assert.equal(r.frontiers.length, 0);
  assert.equal(r.ambiguous, 1);
});

test('an end another line goes on from is not a frontier (§14.18), on its own side only', () => {
  const stub = '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6';
  const deep = stub + ' 5. Nc3 Bg7 6. Be3 Nf6';
  const r = frontiers(stormLines([chapter('Overview stub', 'white', stub), chapter('The real line', 'white', deep)]), C);
  assert.deepEqual(
    r.frontiers.map((f) => f.names[0]),
    ['The real line'],
  );
  assert.equal(r.covered, 1);
  const cross = frontiers(stormLines([chapter('Overview stub', 'white', stub), chapter('Black meets it', 'black', deep)]), C);
  assert.ok(cross.frontiers.some((f) => f.names.includes('Overview stub')));
  // A set-up chapter whose start is the stub's end still answers it.
  const byFragment = frontiers(stormLines([chapter('Overview stub', 'white', stub), chapter('Improving', 'white', '5. Nc3 Bg7', 'r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5')]), C);
  assert.ok(!byFragment.frontiers.some((f) => f.names.includes('Overview stub')));
});

test('decision points: the opponent to move, the replies covered, the lines through', () => {
  const lines = stormLines([chapter('Italian', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bc4'), chapter('Ruy', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'), chapter('Scotch', 'white', '1. e4 e5 2. Nf3 Nf6 3. Nxe5')]);
  const { points, cont } = decisions(lines);
  const at = (fen: string) => points.find((d) => d.key === positionKey(fen));
  assert.equal(at(START_FEN), undefined);
  const afterE4 = at('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')!;
  assert.equal(afterE4.fen.split(' ')[1], 'b');
  assert.equal(afterE4.side, 'white');
  assert.deepEqual([...afterE4.covered].sort(), ['e7e5']);
  assert.equal(afterE4.n, 3);
  assert.ok(points.every((d) => (d.fen.split(' ')[1] === 'w') !== (d.side === 'white')));
  assert.equal(at('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 6 4'), undefined);
  assert.deepEqual([...at('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')!.covered].sort(), ['b8c6', 'g8f6']);
  assert.ok(cont.white.has(positionKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')));
  assert.equal(cont.black.size, 0);
  // A set-up chapter covers the reply it answers but is no source line.
  const q = decisions(stormLines([chapter('Live', 'white', '1. e4 e5 2. Nf3'), chapter('Fragment', 'white', '1... c5 2. Nf3', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')]));
  const qe4 = q.points.find((d) => d.key === positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'))!;
  assert.deepEqual([...qe4.covered].sort(), ['c7c5', 'e7e5']);
  assert.equal(qe4.n, 1);
});

test('uncovered replies: the floors, most played first, capped', () => {
  const point = { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', covered: new Set(['e7e5']) };
  const reply = (san: string, games: number) => ({ san, white: games, draws: 0, black: 0 });
  const gaps = uncoveredMoves(point, [reply('e5', 4000), reply('c5', 3000), reply('e6', 1200), reply('c6', 900), reply('d5', 400), reply('Nf6', 300), reply('g6', 60), reply('b6', 5)], 10000, C);
  assert.deepEqual(
    gaps.map((g) => g.san),
    ['c5', 'e6', 'c6', 'd5'],
  );
  assert.equal(Math.round(gaps[0]!.share), 30);
  assert.equal(gaps[0]!.games, 3000);
  assert.equal(uncoveredMoves(point, [reply('c5', 12), reply('e6', 8)], 40, C).length, 0);
  assert.equal(uncoveredMoves(point, [reply('c5', 30)], 100000, C).length, 0);
  assert.equal(uncoveredMoves(point, [reply('Qh5', 5000)], 10000, C).length, 0);
});

test('castling replies are read by their SAN', () => {
  const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 6 5';
  const moves = [
    { san: 'O-O', uci: 'e8h8', white: 5000, draws: 0, black: 0 },
    { san: 'd6', uci: 'd7d6', white: 2000, draws: 0, black: 0 },
  ];
  assert.deepEqual(
    uncoveredMoves({ fen, covered: new Set(['e8g8']) }, moves, 10000, C).map((g) => g.san),
    ['d6'],
  );
  assert.deepEqual(
    uncoveredMoves({ fen, covered: new Set(['d7d6']) }, moves.slice(0, 1), 10000, C).map((g) => g.uci),
    ['e8g8'],
  );
});

test('scopes: a study, a chapter, the lines through a position and what lies past it', () => {
  const a = chapter('Ruy', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const b = { ...chapter('Italian', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bc4'), sid: 'S2' };
  const c = chapter('QG', 'white', '1. d4 d5 2. c4 e6 3. Nc3');
  const lines = stormLines([a, b, c]);
  const { frontiers: fs } = frontiers(lines, C);
  assert.equal(fs.length, 3);
  assert.deepEqual(
    inScope(fs, lines, { kind: 'study', sid: 'S2' }).map((f) => f.names[0]),
    ['Italian'],
  );
  assert.deepEqual(
    inScope(fs, lines, { kind: 'chapter', sid: 'S1', cid: c.chapter.id }).map((f) => f.names[0]),
    ['QG'],
  );
  const afterE4 = positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  assert.deepEqual(
    inScope(fs, lines, { kind: 'position', key: afterE4 })
      .map((f) => f.names[0])
      .sort(),
    ['Italian', 'Ruy'],
  );
  const { points } = decisions(lines);
  const afterNf3 = positionKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  // From 2. Nf3 on: the decision point at it is kept, the one after 1. e4 (before it) isn't.
  const past = inScope(points, lines, { kind: 'position', key: afterNf3 });
  assert.ok(past.some((p) => p.key === afterNf3));
  assert.ok(!past.some((p) => p.key === afterE4));
  assert.deepEqual(inScope(fs, lines, { kind: 'all' }).length, 3);
});
