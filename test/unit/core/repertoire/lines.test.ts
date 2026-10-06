// Clickable lines in comments and line jumping (PLAN.md §5.12). The cases were first rebuilt from
// the plan; q_extension's own harness cases (`test/harness.js` at c26242f, "clickable lines in
// training comments") are ported below on the same line and comments, with real positions where
// the harness had stand-in FENs (§5.20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { cursorAt, firstCursor, lineStart, parseCommentLines, playedLines, playLine, stepCursor } from '../../../../src/core/repertoire/lines.ts';
import { makeFen } from 'chessops/fen';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { nodeAt, positionAt, startPosition } from '../../../../src/core/study/tree.ts';

function chapter(movetext: string, headers = ''): Chapter {
  const parsed = parseChapterFile(`[Event "Test"]\n${headers}\n${movetext} *\n`, 'Chapter1');
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

/** The lines of the first comment on the move at `path`, played. */
function linesAt(c: Chapter, path: string[]) {
  const text = nodeAt(c, path)!.comments[0]!;
  return playedLines(text, positionAt(c, path)!, path.length ? positionAt(c, path.slice(0, -1)) : undefined);
}

test('a line at the same ply starts after the commented move', () => {
  const c = chapter('1. e4 c5 2. Nf3 { Main: (2... d6 3. d4 cxd4) }');
  const [line] = linesAt(c, ['e4', 'c5', 'Nf3']);
  assert.deepEqual(line!.sans, ['d6', 'd4', 'cxd4']);
  assert.deepEqual(line!.ucis, ['d7d6', 'd2d4', 'c5d4']);
  assert.equal(line!.positions.length, 4);
});

test('a line before the move replaces it', () => {
  const c = chapter('1. e4 c5 2. Nf3 { Or (2. c3 Nf6 3. e5) }');
  const [line] = linesAt(c, ['e4', 'c5', 'Nf3']);
  assert.deepEqual(line!.sans, ['c3', 'Nf6', 'e5']);
  // Black's move commented, the line at White's next move: after it.
  const q = chapter('1. e4 c5 2. Nf3 d6 { (3. d4 cxd4) }');
  assert.deepEqual(linesAt(q, ['e4', 'c5', 'Nf3', 'd6'])[0]!.sans, ['d4', 'cxd4']);
});

test('where each move is written, and what a line is made of', () => {
  const text = 'Better (7.Bc4!? Qa5 $14 8. 0-0) than (see 5. Nf3), or (2...Nc6 3. Bb5+ a6!).';
  const lines = parseCommentLines(text);
  assert.equal(lines.length, 2);
  const [a, b] = lines;
  assert.deepEqual({ number: a!.number, turn: a!.turn }, { number: 7, turn: 'white' });
  assert.deepEqual(a!.moves.map((m) => m.san), ['Bc4', 'Qa5', 'O-O']);
  // The text of each move: no number, no glyph.
  assert.deepEqual(a!.moves.map((m) => text.slice(m.from, m.to)), ['Bc4', 'Qa5', '0-0']);
  assert.equal(text.slice(a!.from, a!.to), '(7.Bc4!? Qa5 $14 8. 0-0)');
  assert.deepEqual({ number: b!.number, turn: b!.turn }, { number: 2, turn: 'black' });
  assert.deepEqual(b!.moves.map((m) => text.slice(m.from, m.to)), ['Nc6', 'Bb5+', 'a6']);
  assert.deepEqual(b!.moves.map((m) => m.san), ['Nc6', 'Bb5', 'a6']);
});

test('remarks in parentheses stay text', () => {
  for (const text of ['(with braces typed as parens)', '(see 5. Nf3)', '(2)', '(10...)', '(1. e4 is best)', '()', 'no group 1. e4 at all', '(5. Nf3 (6. Nc3))']) {
    const lines = parseCommentLines(text);
    if (text === '(5. Nf3 (6. Nc3))') assert.deepEqual(lines.map((l) => l.moves.map((m) => m.san)), [['Nc3']], text);
    else assert.deepEqual(lines, [], text);
  }
});

test('a first move that is illegal: no move to show, and the lines skip it', () => {
  const c = chapter('1. e4 c5 2. Nf3 { (2... Qxh2) then (2... e6 3. d4) and (2... Nc6 3. Bxf7) }');
  const lines = linesAt(c, ['e4', 'c5', 'Nf3']);
  assert.deepEqual(lines.map((l) => l.sans), [[], ['e6', 'd4'], ['Nc6']]);
  assert.deepEqual(firstCursor(lines), { line: 1, ply: 1 });
  assert.equal(cursorAt(lines, 0, 0), undefined);
  // A move past the legal ones is clamped to the last legal one.
  assert.deepEqual(cursorAt(lines, 2, 1), { line: 2, ply: 1 });
});

test('a line is placed by its number and side alone; one that fits neither position is text', () => {
  // (2. d6 3. d4) is numbered for the position before 2. Nf3, so it starts there, where d6 isn't
  // legal: q_extension's clStartFen never looks at the moves. (5. e5) fits neither: text.
  const c = chapter('1. e4 c5 2. Nf3 { (2. d6 3. d4) and (5. e5) }');
  const lines = linesAt(c, ['e4', 'c5', 'Nf3']);
  assert.deepEqual(lines.map((l) => [l.placed, l.sans]), [[true, []], [false, []]]);
  assert.equal(firstCursor(lines), undefined);
  const q = chapter('1. e4 c5 2. Nf3 { (2. d4 cxd4) }');
  assert.deepEqual(linesAt(q, ['e4', 'c5', 'Nf3'])[0]!.sans, ['d4', 'cxd4']);
});

// q_extension's harness: the test study's line as its training walks it, with the comments of the
// live study plus the harness's own (a remark, a line that fits nowhere, illegal moves).
test('q_extension’s harness: the clickable lines of its training line', () => {
  const c = chapter(
    '1. Nf3 d5 { A remark (see the other chapter) and (4. e4 e5) that fits nowhere } 2. c4 d4 3. g3 c5 { Test of clickable line at the same ply: (3... Nc6 4. Bg2 e5 5. d3) } ' +
      '4. b4 cxb4 5. a3 { Test of clickable line before the move: (5... b6 6. Bg2 Bb7 7. axb4) } bxa3 { Illegal on: (6. Bg2 Qxh7 7. Nc3) } ' +
      '6. Bg2 { Either (6... Qa5 7. O-O), (6... Qxh7) or (6... Nc6 7. Qa4) }',
  );
  const line = ['Nf3', 'd5', 'c4', 'd4', 'g3', 'c5', 'b4', 'cxb4', 'a3', 'bxa3', 'Bg2'];
  const at = (n: number) => linesAt(c, line.slice(0, n + 1));
  const fenAfter = (l: ReturnType<typeof at>[number], ply: number) => makeFen(l.positions[ply]!.toSetup());
  // A remark in parentheses and a line that fits neither position stay plain.
  assert.deepEqual(parseCommentLines(nodeAt(c, line.slice(0, 2))!.comments[0]!).length, 1);
  assert.deepEqual(at(1).map((l) => l.placed), [false]);
  // Same ply: the line replaces the commented move (starts before 3... c5).
  const [same] = at(5);
  assert.deepEqual(same!.sans, ['Nc6', 'Bg2', 'e5', 'd3']);
  assert.equal(fenAfter(same!, 4), 'r1bqkbnr/ppp2ppp/2n5/4p3/2Pp4/3P1NP1/PP2PPBP/RNBQK2R b KQkq - 0 5');
  assert.deepEqual(same!.ucis.at(-1), 'd2d3');
  // Before the move: the line continues from the commented position.
  const [before] = at(8);
  assert.deepEqual(before!.sans, ['b6', 'Bg2', 'Bb7', 'axb4']);
  assert.equal(before!.positions[1]!.turn, 'white');
  assert.equal(before!.positions[1]!.fullmoves, 6);
  // Moves from the first illegal one on are not played (struck through in the comment).
  const [illegal] = at(9);
  assert.deepEqual([illegal!.placed, illegal!.sans], [true, ['Bg2']]);
  // On the last move: three lines, the middle one illegal from its first move. → runs on through
  // them, past the one that can't be played, and stays at the end; ← retraces it and leaves.
  const last = at(10);
  assert.deepEqual(last.map((l) => l.sans), [['Qa5', 'O-O'], [], ['Nc6', 'Qa4']]);
  const walk = [firstCursor(last)!];
  for (let i = 0; i < 4; i++) walk.push(stepCursor(last, walk.at(-1)!, 1)!);
  assert.deepEqual(walk, [
    { line: 0, ply: 1 },
    { line: 0, ply: 2 },
    { line: 2, ply: 1 },
    { line: 2, ply: 2 },
    { line: 2, ply: 2 },
  ]);
  const back = [walk[3]!];
  for (let i = 0; i < 3; i++) back.push(stepCursor(last, back.at(-1)!, -1)!);
  assert.deepEqual(back, [
    { line: 2, ply: 2 },
    { line: 2, ply: 1 },
    { line: 0, ply: 2 },
    { line: 0, ply: 1 },
  ]);
  assert.equal(stepCursor(last, { line: 0, ply: 1 }, -1), undefined);
  // A click into the second line also runs back into the first.
  assert.deepEqual(stepCursor(last, cursorAt(last, 2, 0)!, -1), { line: 0, ply: 2 });
});

test('a comment before the first move starts at the chapter’s start, a set-up position too', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const c = chapter('{ Try (1... e5 2. Nf3) } 1... c5', `[SetUp "1"]\n[FEN "${fen}"]`);
  const lines = playedLines(c.root.comments[0]!, startPosition(c)!, undefined);
  assert.deepEqual(lines[0]!.sans, ['e5', 'Nf3']);
  const line = parseCommentLines('(1... e5)')[0]!;
  assert.equal(makeFen(lineStart(line, startPosition(c)!, undefined)!.toSetup()), fen);
});

test('line jumping: end to end through a comment’s lines, and out before the first', () => {
  const c = chapter('1. e4 c5 2. Nf3 { (2... d6 3. d4) or (2... Qxh2) or (2... Nc6 3. d4 cxd4) }');
  const lines = linesAt(c, ['e4', 'c5', 'Nf3']);
  const walk = [firstCursor(lines)!];
  for (;;) {
    const next = stepCursor(lines, walk.at(-1)!, 1)!;
    if (next.line === walk.at(-1)!.line && next.ply === walk.at(-1)!.ply) break;
    walk.push(next);
  }
  assert.deepEqual(walk, [
    { line: 0, ply: 1 },
    { line: 0, ply: 2 },
    { line: 2, ply: 1 },
    { line: 2, ply: 2 },
    { line: 2, ply: 3 },
  ]);
  assert.deepEqual(stepCursor(lines, { line: 2, ply: 1 }, -1), { line: 0, ply: 2 });
  assert.equal(stepCursor(lines, { line: 0, ply: 1 }, -1), undefined);
});

test('the Qchess sample: the line in 6... Nbd7’s comment, and the remark before the first move', () => {
  const text = readFileSync(new URL('../../../fixtures/pgn/qchess-sample.pgn', import.meta.url), 'utf8');
  // The file holds several games: the first.
  const parsed = parseChapterFile(text.split(/\n\s*\n(?=\[)/)[0]!, 'Chapter1');
  assert.ok(parsed.ok);
  const c = parsed.chapter;
  assert.deepEqual(parseCommentLines(c.root.comments.join(' ')), []);
  const path = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'Nbd7'];
  const lines = linesAt(c, path);
  assert.deepEqual(lines.map((l) => l.sans), [['Bc4', 'Qa5']]);
});

test('playLine stops at the first illegal move', () => {
  const line = parseCommentLines('(1. e4 e5 2. Ke3 Nc6)')[0]!;
  const c = chapter('1. e4');
  assert.deepEqual(playLine(line, startPosition(c)!).sans, ['e4', 'e5']);
});
