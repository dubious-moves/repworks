// Lines from the comments quizzed in review (the owner's request, 2026-10-12): which comment lines
// along a repertoire line are quizzed, and how far.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { quizLinesOf } from '../../../../src/core/train/commentQuiz.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

function chapter(cid: string, side: string, moves: string): Chapter {
  const parsed = parseChapterFile(`[Orientation "${side}"]\n\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

/** The quizzed lines of the chapter's first line, as `ply: moves`, with `*` for important ones. */
function quizzed(moves: string, side = 'black', ...others: Chapter[]) {
  const c = chapter('Chapter1', side, moves);
  const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [c, ...others] }]);
  const line = ix.lines.find((l) => l.cid === 'Chapter1')!;
  return quizLinesOf(c, line.path, side as 'white' | 'black', ix).map((q) => `${q.important ? '*' : ''}${q.ply}: ${q.sans.join(' ')}`);
}

test('a line starting with the opponent\'s move is quizzed; one starting with an own move is not', () => {
  // On 2. Nf3: the opponent's other try at move 2 (it replaces 2. Nf3), and Black's own other move.
  assert.deepEqual(quizzed('1. e4 c5 2. Nf3 { (2. c3 Nf6 3. e5 Nd5) (2... Nc6 3. d4) } 2... d6 3. d4 cxd4'), ['2: c3 Nf6 e5 Nd5']);
  // On 2... d6: the opponent's move after it (a continuation), and at the line's end.
  assert.deepEqual(quizzed('1. e4 c5 2. Nf3 d6 { (3. Bb5+ Bd7) } 3. d4 cxd4 { (4. Qxd4 Nc6) }'), ['4: Bb5+ Bd7', '6: Qxd4 Nc6']);
  // A White repertoire: Black's moves are the opponent's.
  assert.deepEqual(quizzed('1. e4 { (1... e5 2. Nf3) (2. d4) } c5 2. Nf3', 'white'), ['1: e5 Nf3']);
});

test('an own move marked ?, ?? or ?! leaves the line out; !? and an opponent\'s ? keep it', () => {
  const at = (comment: string) => quizzed(`1. e4 c5 2. Nf3 { ${comment} } 2... d6`);
  assert.deepEqual(at('(2. c3 Nf6? 3. e5)'), []);
  assert.deepEqual(at('(2. c3 Nf6 3. e5 Nd5?? 4. d4)'), []);
  assert.deepEqual(at('(2. c3 Nf6 3. e5 Nd5 $6)'), []);
  assert.deepEqual(at('(2. c3 Nf6!? 3. e5 Nd5)'), ['2: c3 Nf6 e5 Nd5']);
  assert.deepEqual(at('(2. c3? Nf6 3. e5?! Nd5)'), ['2: c3 Nf6 e5 Nd5']);
  // A move marked in a branch the quiz stops before still says the line shows what not to play.
  assert.deepEqual(at('(2. c3 Nf6 3. e5 Nd5 3... Ne4?)'), []);
});

test('a first move marked ! or !! is important; !? is not', () => {
  const at = (comment: string) => quizzed(`1. e4 c5 2. Nf3 { ${comment} } 2... d6`);
  assert.deepEqual(at('(2. c3! Nf6)'), ['*2: c3 Nf6']);
  assert.deepEqual(at('(2. c3!! Nf6)'), ['*2: c3 Nf6']);
  assert.deepEqual(at('(2. c3 $1 Nf6)'), ['*2: c3 Nf6']);
  assert.deepEqual(at('(2. c3!? Nf6)'), ['2: c3 Nf6']);
  assert.deepEqual(at('(2. c3 Nf6!)'), ['2: c3 Nf6']);
});

test('the quiz stops at a pass, a number that isn\'t the position\'s, an illegal move, or an own move the repertoire answers differently', () => {
  const at = (comment: string, ...others: Chapter[]) => quizzed(`1. e4 c5 2. Nf3 { ${comment} } 2... d6`, 'black', ...others);
  assert.deepEqual(at('(2. c3 Nf6 3. -- d5)'), ['2: c3 Nf6']);
  // `alt. 3...d5`: another branch at move 3, written after the first.
  assert.deepEqual(at('(2. c3 Nf6 3. e5 Nd5 alt. 3... Ng4)'), ['2: c3 Nf6 e5 Nd5']);
  assert.deepEqual(at('(2. c3 Nf6 3. e5 Qxh2)'), ['2: c3 Nf6 e5']);
  // The repertoire plays 2... Nf6 against 2. c3: a line with 2... d5 has nothing left to ask.
  assert.deepEqual(at('(2. c3 d5 3. exd5 Qxd5)', chapter('Chapter2', 'black', '1. e4 c5 2. c3 Nf6')), []);
  // …and one going on from 2... Nf6 is quizzed, past the repertoire's end.
  assert.deepEqual(at('(2. c3 Nf6 3. e5 Nd5)', chapter('Chapter2', 'black', '1. e4 c5 2. c3 Nf6')), ['2: c3 Nf6 e5 Nd5']);
});

test('a line the repertoire holds already is left out; a line written twice is quizzed once; a pass first is not quizzed', () => {
  assert.deepEqual(quizzed('1. e4 c5 2. Nf3 { (2. c3 Nf6) } 2... d6', 'black', chapter('Chapter2', 'black', '1. e4 c5 2. c3 Nf6')), []);
  assert.deepEqual(quizzed('1. e4 c5 2. Nf3 { (2. c3 Nf6 3. e5) } { Again: (2. c3 Nf6 3. e5) } 2... d6 { (2. c3 Nf6 3. e5) }'), ['2: c3 Nf6 e5']);
  assert.deepEqual(quizzed('1. e4 c5 2. Nf3 d6 { (3. -- Nf6) }'), []);
  // A line that fits neither position stays text.
  assert.deepEqual(quizzed('1. e4 c5 2. Nf3 d6 { (7. Bb5+ Bd7) }'), []);
});

test('a comment before the first move, and the order lines are met in: by where they start, then as written', () => {
  assert.deepEqual(quizzed('{ (1. d4 Nf6 2. c4 e6) } 1. e4 c5 2. Nf3 d6 { (3. Bb5+ Nd7) } 3. d4 { (3. c3 Nf6) }'), ['0: d4 Nf6 c4 e6', '4: Bb5+ Nd7', '4: c3 Nf6']);
});

test('the first move as written labels the line, numbered', () => {
  const c = chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 { (2. c3!? Nf6) } 2... d6 { (3. Bb5+ Nd7) }');
  const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [c] }]);
  const lines = quizLinesOf(c, ix.lines[0]!.path, 'black', ix);
  assert.deepEqual(lines.map((q) => q.label), ['2. c3!?', '3. Bb5+']);
  assert.deepEqual(lines.map((q) => q.own), [[false, true], [false, true]]);
  assert.deepEqual(lines[0]!.ucis, ['c2c3', 'g8f6']);
});
