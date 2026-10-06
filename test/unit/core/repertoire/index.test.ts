import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { positionKey, positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { combineIndex, conflicts, indexChapter, indexStudies } from '../../../../src/core/repertoire/index.ts';
import { repertoireCard } from '../../../../src/core/progress/cards.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

function chapter(cid: string, pgn: string): Chapter {
  const parsed = parseChapterFile(pgn, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

/** Whether some line runs through the node at `path`. */
const onSomeLine = (lines: readonly { path: readonly string[] }[], path: readonly string[]) => lines.some((l) => path.every((san, i) => l.path[i] === san));

const pgn = (side: string, moves: string, extra = '') => `[Orientation "${side}"]\n${extra}\n${moves} *\n`;

/** The key of the position after the moves, from the standard start. */
function keyAfter(sans: string): string {
  const pos = Chess.default();
  for (const san of sans.split(' ').filter(Boolean)) pos.play(parseSan(pos, san)!);
  return positionKeyOf(pos);
}

test('a transposition in two chapters makes one card, played in both', () => {
  const a = chapter('ChapterA', pgn('white', '1. d4 Nf6 2. c4 e6 3. Nf3'));
  const b = chapter('ChapterB', pgn('white', '1. c4 Nf6 2. d4 e6 3. Nf3'));
  const index = combineIndex([indexChapter('Study001', a), indexChapter('Study001', b)]);
  const card = repertoireCard(keyAfter('d4 Nf6 c4 e6') as never, 'g1f3');
  assert.deepEqual(
    index.cards.get(card)?.map((o) => [o.cid, o.path.join(' ')]),
    [
      ['ChapterA', 'd4 Nf6 c4 e6 Nf3'],
      ['ChapterB', 'c4 Nf6 d4 e6 Nf3'],
    ],
  );
  // d4, c4 (twice each, in different positions) and Nf3: five cards.
  assert.equal(index.cards.size, 5);
});

test("a Black chapter's cards are Black's moves; White's are the opponent's", () => {
  const text = readFileSync(new URL('../../../fixtures/data-repo/studies/Rep0Najd/Ch1Najdf.pgn', import.meta.url), 'utf8');
  const result = indexChapter('Rep0Najd', chapter('Ch1Najdf', text));
  assert.ok(result.ok);
  const own = result.index.moves.filter((m) => m.card).map((m) => m.at.san);
  const theirs = result.index.moves.filter((m) => !m.card).map((m) => m.at.san);
  assert.deepEqual(own, ['c5', 'd6', 'cxd4', 'Nc6']);
  assert.deepEqual(theirs, ['e4', 'Nf3', 'd4', 'd4']);
  assert.equal(result.index.side, 'black');
});

test('a start position with Black to move makes cards from it', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const result = indexChapter('Study001', chapter('Ch1Fen01', pgn('black', '1... c5 2. Nf3 d6', `[SetUp "1"]\n[FEN "${fen}"]`)));
  assert.ok(result.ok);
  const first = result.index.moves[0]!;
  assert.equal(first.at.san, 'c5');
  assert.equal(first.card, repertoireCard(positionKey(fen), 'c7c5'));
  assert.deepEqual(result.index.lines.map((l) => l.cards.length), [2]);
});

test('castling cards use the king’s two-square step', () => {
  const result = indexChapter('Study001', chapter('Castles1', pgn('white', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O')));
  assert.ok(result.ok);
  const castle = result.index.moves.at(-1)!;
  assert.equal(castle.uci, 'e1g1');
  assert.equal(castle.card, repertoireCard(keyAfter('e4 e5 Nf3 Nc6 Bc4 Bc5') as never, 'e1g1'));
});

test('two own moves in one position are a conflict; an opponent’s choice is not', () => {
  const a = chapter('ChapterA', pgn('white', '1. e4 e5 (1... c5) 2. Nf3'));
  const b = chapter('ChapterB', pgn('white', '1. d4 d5'));
  const index = combineIndex([indexChapter('Study001', a), indexChapter('Study001', b)]);
  const start = makeFen(Chess.default().toSetup()).split(' ').slice(0, 4).join(' ');
  assert.deepEqual(conflicts(index), [{ key: start, ucis: ['e2e4', 'd2d4'] }]);
});

test("a move that is one chapter's own and another's opponent move is still one card", () => {
  const white = chapter('ChapterW', pgn('white', '1. e4 c5 2. Nf3'));
  const black = chapter('ChapterB', pgn('black', '1. e4 c5 2. Nf3 d6'));
  const index = combineIndex([indexChapter('Study001', white), indexChapter('Study002', black)]);
  const card = repertoireCard(keyAfter('e4 c5') as never, 'g1f3');
  assert.deepEqual(index.cards.get(card)?.map((o) => o.cid), ['ChapterW']);
  const here = index.positions.get(keyAfter('e4 c5') as never)!;
  assert.deepEqual([...here.own.keys()], ['g1f3']);
  assert.deepEqual([...here.opponent.keys()], ['g1f3']);
});

test('lines come in tree order, and every own move lies on a line', () => {
  const c = chapter('Lines001', pgn('white', '1. e4 e5 (1... c5 2. Nf3 (2. c3)) 2. Nf3 Nc6 (2... d6 3. d4) 3. Bb5'));
  const result = indexChapter('Study001', c);
  assert.ok(result.ok);
  assert.deepEqual(
    result.index.lines.map((l) => l.path.join(' ')),
    ['e4 e5 Nf3 Nc6 Bb5', 'e4 e5 Nf3 d6 d4', 'e4 c5 Nf3', 'e4 c5 c3'],
  );
  for (const m of result.index.moves) assert.ok(onSomeLine(result.index.lines, m.at.path), m.at.san);
  assert.deepEqual(result.index.lines[1]!.cards.length, 3);
  // Each card's ply on its line: White's moves, at even plies.
  assert.deepEqual(result.index.lines.map((l) => l.plies), [[0, 2, 4], [0, 2, 4], [0, 2], [0, 2]]);
  for (const line of result.index.lines) {
    line.plies.forEach((ply, i) => {
      const m = result.index.moves.find((x) => x.at.path.join(' ') === line.path.slice(0, ply + 1).join(' '))!;
      assert.equal(m.card, line.cards[i]);
    });
  }
});

test('a chapter marked known says so on its lines', () => {
  const known = indexChapter('Study001', chapter('Known001', pgn('white', '1. e4 e5 2. Nf3', '[RepworksKnown "true"]')));
  const fresh = indexChapter('Study001', chapter('Fresh001', pgn('white', '1. e4 e5 2. Nf3')));
  const other = indexChapter('Study001', chapter('Other001', pgn('white', '1. e4 e5 2. Nf3', '[RepworksKnown "false"]')));
  assert.ok(known.ok && fresh.ok && other.ok);
  assert.deepEqual([known.index.lines[0]!.known, fresh.index.lines[0]!.known, other.index.lines[0]!.known], [true, false, false]);
});

test('a chapter without a side is skipped with its reason; reference studies make no cards', () => {
  const noSide = chapter('NoSide01', '[Event "x"]\n\n1. e4 e5 *\n');
  const index = indexStudies([
    { sid: 'Study001', kind: 'repertoire', chapters: [noSide, chapter('Rep00001', pgn('white', '1. e4 e5 2. Nf3'))] },
    { sid: 'Study002', kind: 'reference', chapters: [chapter('Ref00001', pgn('white', '1. d4 d5 2. c4'))] },
  ]);
  assert.deepEqual(index.skipped, [{ sid: 'Study001', cid: 'NoSide01', reason: 'the chapter has no side (Orientation)' }]);
  assert.deepEqual([...index.cards.values()].map((o) => o.map((x) => x.cid)), [['Rep00001'], ['Rep00001']]);
  assert.equal(index.lines.length, 1);
});

test('an empty chapter makes no line and no card', () => {
  const result = indexChapter('Study001', chapter('Empty001', pgn('white', '')));
  assert.ok(result.ok);
  assert.deepEqual([result.index.moves.length, result.index.lines.length], [0, 0]);
});

test('the public fixtures index without a skipped chapter', () => {
  const dir = new URL('../../../fixtures/data-repo/studies/Rep0Najd/', import.meta.url);
  const chapters = ['Ch1Najdf', 'Ch2Alapn'].map((cid) => chapter(cid, readFileSync(new URL(`${cid}.pgn`, dir), 'utf8')));
  const index = indexStudies([{ sid: 'Rep0Najd', kind: 'repertoire', chapters }]);
  assert.deepEqual(index.skipped, []);
  // Both chapters answer 1. e4 with c5: one card, played in both.
  assert.equal(index.cards.get(repertoireCard(keyAfter('e4') as never, 'c7c5'))?.length, 2);
  assert.equal(index.lines.length, 3);
});

test('random chapters: every own move is on a line, every line ends at a leaf, and the index is deterministic', async () => {
  const { randomChapter } = await import('../../../support/randomTree.ts');
  const { mulberry32 } = await import('../../../support/random.ts');
  const { nodeAt } = await import('../../../../src/core/study/tree.ts');
  for (let seed = 1; seed <= 200; seed++) {
    const c = randomChapter(mulberry32(seed), 'Rand0001', { maxDepth: 12, maxChildren: 3 });
    const once = indexChapter('Study001', c);
    const again = indexChapter('Study001', c);
    assert.ok(once.ok && again.ok, `seed ${seed}`);
    assert.deepEqual(once, again);
    for (const m of once.index.moves) assert.ok(onSomeLine(once.index.lines, m.at.path), `seed ${seed}: ${m.at.path.join(' ')}`);
    // One line per leaf, and every line ends at one.
    let leaves = 0;
    const count = (n: { children: { children: unknown[] }[] }, depth: number): void => {
      if (depth > 0 && n.children.length === 0) leaves++;
      for (const ch of n.children) count(ch as never, depth + 1);
    };
    count(c.root as never, 0);
    assert.equal(once.index.lines.length, leaves, `seed ${seed}`);
    for (const line of once.index.lines) assert.equal(nodeAt(c, line.path)?.children.length, 0, `seed ${seed}`);
    // Own moves alternate with the opponent's: on each line, every other move is a card.
    for (const line of once.index.lines) assert.ok(Math.abs(line.cards.length * 2 - line.path.length) <= 1, `seed ${seed}`);
  }
});

test('one own move played in two chapters is not a conflict; the opponent moves are listed by where they are played', () => {
  const a = chapter('ChapterA', pgn('white', '1. e4 e5 2. Nf3'));
  const b = chapter('ChapterB', pgn('white', '1. e4 c5 2. Nf3'));
  const index = combineIndex([indexChapter('Study001', a), indexChapter('Study001', b)]);
  assert.deepEqual(conflicts(index), []);
  const afterE4 = index.positions.get(keyAfter('e4') as never)!;
  assert.deepEqual([...afterE4.opponent].map(([uci, at]) => [uci, at.map((o) => `${o.cid} ${o.san}`)]), [
    ['e7e5', ['ChapterA e5']],
    ['c7c5', ['ChapterB c5']],
  ]);
});

test('lines follow the order of the studies and of their chapters', () => {
  const ch = (cid: string, moves: string) => chapter(cid, pgn('white', moves));
  const index = indexStudies([
    { sid: 'Study002', kind: 'repertoire', chapters: [ch('Second02', '1. d4'), ch('First002', '1. c4')] },
    { sid: 'Study001', kind: 'repertoire', chapters: [ch('Only0001', '1. e4')] },
  ]);
  assert.deepEqual(index.lines.map((l) => `${l.sid}/${l.cid}`), ['Study002/Second02', 'Study002/First002', 'Study001/Only0001']);
});

test('a start position that is not legal is skipped with its reason', () => {
  const bad: Chapter = { id: 'BadFen01', headers: [['Orientation', 'white'], ['FEN', '8/8/8/8/8/8/8/8 w - - 0 1'], ['SetUp', '1']], root: { comments: [], shapes: [], nags: [], startingComments: [], children: [] } };
  assert.deepEqual(indexChapter('Study001', bad), { ok: false, sid: 'Study001', cid: 'BadFen01', reason: 'the start position is not legal' });
});

test('a move whose continuation was cut still ends a line, so its own moves are on one', () => {
  const c = chapter('Cut00001', pgn('white', '1. e4 e5 2. Nf3'));
  // A child that isn't a legal move here, as a hand-edited tree could hold.
  const e5 = c.root.children[0]!.children[0]!;
  e5.children = [{ ...e5.children[0]!, san: 'Ke3', children: [] }];
  const result = indexChapter('Study001', c);
  assert.ok(result.ok);
  assert.deepEqual(result.index.lines.map((l) => l.path.join(' ')), ['e4 e5']);
  assert.equal(result.index.lines[0]!.cards.length, 1);
});

test('the PGN fixtures index, each with the side the import would give it', async () => {
  const { parseGames } = await import('../../../../src/core/pgn/parse.ts');
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../../../fixtures/pgn/', import.meta.url);
  let n = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.pgn'))) {
    for (const parsed of parseGames(readFileSync(new URL(file, dir), 'utf8'), () => `Fix${String(n++).padStart(5, '0')}`)) {
      if (!parsed.ok) continue;
      const c = parsed.chapter;
      if (!c.headers.some(([k]) => k === 'Orientation')) c.headers.push(['Orientation', 'white']);
      const result = indexChapter('Fixtures', c);
      assert.ok(result.ok, file);
      for (const m of result.index.moves) assert.ok(onSomeLine(result.index.lines, m.at.path), `${file}: ${m.at.path.join(' ')}`);
    }
  }
  assert.ok(n > 5);
});
