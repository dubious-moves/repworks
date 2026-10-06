// Repertoire coverage (PLAN.md §5.26), after lichessable's section 21.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { positionKeyOf, type PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { coverage, courseLines, positionsToRank, rank, repertoireTree, rootPlyOf, sortGaps, type Gap } from '../../../../src/core/explorer/coverage.ts';
import type { CompactExplorer } from '../../../../src/core/explorer/providers.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { addLine } from '../../../../src/core/study/ops.ts';
import { lineThrough } from '../../../../src/core/study/tree.ts';

function chapter(cid: string, side: string, moves: string, fen?: string): Chapter {
  const headers = [`[Orientation "${side}"]`, `[ChapterName "${cid}"]`];
  if (fen) headers.push('[SetUp "1"]', `[FEN "${fen}"]`);
  const parsed = parseChapterFile(`${headers.join('\n')}\n\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}
const rep = (...chapters: Chapter[]) => repertoireTree(chapters.map((chapter) => ({ sid: 'RepStudy', chapter })));

/** The key of the position after `sans` from the start. */
function keyAfter(sans: string): PositionKey {
  const pos = Chess.default();
  for (const san of sans.split(' ').filter(Boolean)) pos.play(parseSan(pos, san)!);
  return positionKeyOf(pos);
}
const severities = (gaps: readonly Gap[]) => gaps.map((g) => `${g.severity}:${g.path.join(' ')}|${g.san}`);

// The repertoire, for Black: the Najdorf against 1. e4 c5 2. Nf3, nothing against 2. c3, and a
// line that stops after 2... d6 3. d4.
const najdorf = chapter('Najdorf', 'black', '1. e4 c5 2. Nf3 d6 3. d4 (3. Bb5+ Bd7) cxd4 4. Nxd4 Nf6 5. Nc3 a6');

test('each divergence: a hole, a line that ends, an unmet option, an alternative; a line present', () => {
  const course = chapter('Course', 'black', '1. e4 c5 2. Nf3 (2. c3 d5) d6 (2... Nc6 3. d4) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 (5... g6) 6. Be3 (6. Bg5 e6) e5');
  const report = coverage([course], rep(najdorf), 'black');
  assert.equal(report.lines, 5);
  assert.equal(report.present, 0);
  assert.deepEqual(severities(report.gaps), [
    // After 6. Be3 the repertoire has nothing at all: its line ends where the opponent moves.
    'ends:e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6|Be3',
    'ends:e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6|Bg5',
    // 5... g6 where the repertoire plays 5... a6: a choice, not a gap.
    'alternative:e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3|g6',
    'alternative:e4 c5 Nf3|Nc6',
    // 2. c3: the repertoire answers 2. Nf3 here and not this one.
    'unmet:e4 c5|c3',
  ]);

  // A hole: our move where the repertoire has nothing. The repertoire stops after 3. d4 here.
  const short = chapter('Short', 'black', '1. e4 c5 2. Nf3 d6 3. d4');
  const hole = coverage([chapter('Course', 'black', '1. e4 c5 2. Nf3 d6 3. d4 cxd4')], rep(short), 'black');
  assert.deepEqual(severities(hole.gaps), ['hole:e4 c5 Nf3 d6 d4|cxd4']);
});

test('a line already in the repertoire under another chapter, or reached by another move order, is present', () => {
  // Chapter B reaches the French's position after 2... d5 by 1. d4 e6 2. e4 d5 and goes on with 3. Nc3.
  const a = chapter('A', 'black', '1. e4 e6 2. d4 d5');
  const b = chapter('B', 'black', '1. d4 e6 2. e4 d5 3. Nc3 Nf6');
  const course = chapter('Course', 'black', '1. e4 e6 2. d4 d5 3. Nc3 Nf6');
  assert.equal(coverage([course], rep(a, b), 'black').present, 1);
  // The same line as a copy in another chapter.
  assert.equal(coverage([chapter('Copy', 'black', '1. e4 c5 2. Nf3 d6 3. Bb5+ Bd7')], rep(najdorf), 'black').present, 1);
  // A course line by another move order is reported at the first move the repertoire doesn't have.
  const other = coverage([chapter('Course', 'black', '1. d4 e6 2. e4 d5 3. Nc3')], rep(a), 'black');
  assert.deepEqual(severities(other.gaps), ['unmet:|d4']);
});

test('a line whose start the repertoire never reaches is unreachable; a study for the other side is counted', () => {
  // A set-up position the repertoire never reaches (1. e4 c5 2. Nf3 with h3 played too).
  const set = coverage([chapter('Set', 'black', '2... e6 3. d4', 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N1P/PPPP1PP1/RNBQKB1R b KQkq - 0 2')], rep(najdorf), 'black');
  assert.deepEqual(set.gaps.map((g) => g.severity), ['unreachable']);
  // A White course against the Black repertoire: compared, and flagged.
  const white = coverage([chapter('White', 'white', '1. e4 c5 2. c3')], rep(najdorf), 'black');
  assert.equal(white.otherSide, 1);
  assert.deepEqual(severities(white.gaps), ['unmet:e4 c5|c3']);
});

test('lines behind one divergence are one gap; the root ply is what every line shares', () => {
  const course = chapter('Course', 'black', '1. e4 c5 2. c3 d5 (2... Nf6 3. e5) 3. exd5');
  const report = coverage([course], rep(najdorf), 'black');
  assert.equal(report.gaps.length, 1);
  assert.equal(report.gaps[0]!.lines.length, 2);
  assert.equal(rootPlyOf(courseLines([course]).lines), 3);
  assert.equal(report.rootPly, 3);
});

/** An explorer answer with `total` games and these moves' game counts. */
const answer = (total: number, moves: Record<string, number>): CompactExplorer => ({
  total,
  white: total,
  draws: 0,
  black: 0,
  moves: Object.entries(moves).map(([san, games]) => ({ uci: san, san, white: games, draws: 0, black: 0, games })),
});

test('ranking: P multiplies the opponent\'s shares to the divergence, from the root and from the start; the floor truncates; depth discounts', () => {
  // The course's root is 1. e4 c5 (ply 2): every line starts so.
  const course = chapter('Course', 'black', '1. e4 c5 2. c3 (2. Nc3 Nc6 3. g3) (2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3)');
  const report = coverage([course], rep(najdorf), 'black');
  assert.equal(report.rootPly, 2);
  const need = positionsToRank(report);
  // 2. c3 and 2. Nc3 need the start and the position after 1... c5; 6. Be3 (the line ends) needs
  // every opponent move up to 5. Nc3, not 6. Be3 itself.
  assert.ok(need.has(keyAfter('')) && need.has(keyAfter('e4 c5')) && need.has(keyAfter('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6')));
  assert.ok(!need.has(keyAfter('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6')));
  const answers = new Map<PositionKey, CompactExplorer>([
    [keyAfter(''), answer(1000, { e4: 500, d4: 400 })],
    [keyAfter('e4 c5'), answer(400, { Nf3: 300, c3: 40, Nc3: 60 })],
    [keyAfter('e4 c5 Nf3 d6'), answer(200, { d4: 180 })],
    [keyAfter('e4 c5 Nf3 d6 d4 cxd4'), answer(170, { Nxd4: 170 })],
    [keyAfter('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6'), answer(40, { Nc3: 35 })],
  ]);
  rank(report, answers, { minGames: 50, depth: 16 });
  const by = (san: string) => report.gaps.find((g) => g.san === san)!;
  // 2. c3: an unmet option at ply 2. From the start, 1. e4 (0.5) and 2. c3 (0.1); from the root, 0.1.
  assert.ok(Math.abs(by('c3').p! - 0.05) < 1e-9);
  assert.ok(Math.abs(by('c3').pCond! - 0.1) < 1e-9);
  assert.equal(by('c3').truncated, false);
  assert.ok(Math.abs(by('c3').score! - 0.1 * Math.exp(-2 / 16)) < 1e-9);
  assert.ok(Math.abs(by('Nc3').pCond! - 0.15) < 1e-9);
  // 6. Be3: 5. Nc3's position has 40 games, under the floor: truncated there.
  assert.equal(by('Be3').truncated, true);
  assert.ok(Math.abs(by('Be3').pCond! - 0.75 * 0.9 * 1) < 1e-9);
  // By score: 6. Be3, likely though deep (its truncated product is the larger), then 2. Nc3 and 2. c3.
  assert.ok(Math.abs(by('Be3').score! - 0.675 * Math.exp(-10 / 16)) < 1e-9);
  assert.deepEqual(sortGaps(report.gaps).map((g) => g.san), ['Be3', 'Nc3', 'c3']);
  // By depth: the two at ply 2 first, the likelier of them first.
  assert.deepEqual(sortGaps(report.gaps, 'depth').map((g) => g.san), ['Nc3', 'c3', 'Be3']);
  // With no answers (not asked, or refused), every gap is unranked; a position answered with
  // nothing at all (an empty answer) is under the floor.
  const bare = coverage([course], rep(najdorf), 'black');
  rank(bare, new Map());
  assert.ok(bare.gaps.every((g) => g.score === undefined && g.p === undefined));
  rank(bare, new Map([[keyAfter(''), undefined]]));
  assert.ok(bare.gaps.every((g) => g.truncated && g.p === 1));
});

test('a gap\'s lines copied into a repertoire chapter that reaches its position, from the divergence', () => {
  const course = chapter('Course', 'black', '1. e4 c5 2. c3 d5 (2... Nf6 3. e5 Nd5) 3. exd5 Qxd5');
  const tree = rep(najdorf);
  const report = coverage([course], tree, 'black');
  const gap = report.gaps[0]!;
  const place = tree.places.get(gap.before)![0]!;
  assert.deepEqual(place, { sid: 'RepStudy', cid: 'Najdorf', path: ['e4', 'c5'] });
  let c = najdorf;
  for (const { line } of gap.lines) {
    const at = line.plies.findIndex((p) => `${p.before}|${p.uci}` === gap.key);
    const added = addLine(c, place.path, line.path.slice(at));
    assert.ok(added.ok);
    c = added.value.chapter;
  }
  assert.deepEqual(lineThrough(c, ['e4', 'c5', 'c3', 'd5']), ['e4', 'c5', 'c3', 'd5', 'exd5', 'Qxd5']);
  assert.deepEqual(lineThrough(c, ['e4', 'c5', 'c3', 'Nf6']), ['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5']);
  // Now present.
  assert.equal(coverage([course], rep(c), 'black').present, 2);
});
