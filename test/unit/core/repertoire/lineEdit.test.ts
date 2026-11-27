// A comment's lines written from the board (PLAN.md §5.217): a move at a line's end, a branch in
// its middle, a line started, a move deleted with the rest of its line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { deleteFromLine, playInLine, startLine, type LineEdit } from '../../../../src/core/repertoire/lineEdit.ts';
import { playedLines, sansFromStart, type Cursor } from '../../../../src/core/repertoire/lines.ts';

function after(...sans: string[]): { after: Position; before: Position | undefined } {
  const pos = Chess.default();
  let before: Position | undefined;
  for (const san of sans) {
    before = pos.clone();
    pos.play(parseSan(pos, san)!);
  }
  return { after: pos, before };
}

// After 1. e4 e5 2. Nf3: Black to play move 2.
const at = after('e4', 'e5', 'Nf3');
const play = (text: string, cursor: Cursor, san: string) => playInLine(text, at.after, at.before, cursor, san);
const ok = (e: LineEdit) => {
  assert.ok(e.ok, e.ok ? '' : e.error);
  return e;
};
/** The moves from the outermost line's start to the cursor. */
const shown = (text: string, c: Cursor) => {
  const l = playedLines(text, at.after, at.before)[c.line]!;
  return [...(l.lead?.sans ?? []), ...l.sans.slice(0, c.ply)].join(' ');
};

test('a move on a line’s last move is written at its end, numbered as the line needs', () => {
  const a = ok(play('Main (2... Nc6)', { line: 0, ply: 1 }, 'Bb5'));
  assert.equal(a.text, 'Main (2... Nc6 3. Bb5)');
  assert.deepEqual(a.cursor, { line: 0, ply: 2 });
  // Black's move after White's: no number.
  const b = ok(play(a.text, a.cursor, 'a6'));
  assert.equal(b.text, 'Main (2... Nc6 3. Bb5 a6)');
  assert.deepEqual(b.cursor, { line: 0, ply: 3 });
  // After words, a glyph standing alone or a branch, Black's move carries its number: the line goes on there.
  assert.equal(ok(play('(2... Nc6 3. Bb5 the Spanish)', { line: 0, ply: 2 }, 'a6')).text, '(2... Nc6 3. Bb5 the Spanish 3... a6)');
  assert.equal(ok(play('(2... Nc6 3. Bb5! )', { line: 0, ply: 2 }, 'a6')).text, '(2... Nc6 3. Bb5! a6)');
  assert.equal(ok(play('(2... Nc6 3. Bb5 (3. Bc4 Bc5))', { line: 0, ply: 2 }, 'a6')).text, '(2... Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6)');
  // A check is written as the board plays it.
  assert.equal(ok(play('(2... Nc6 3. Bb5 d6)', { line: 0, ply: 3 }, 'Bxc6')).text, '(2... Nc6 3. Bb5 d6 4. Bxc6+)');
});

test('the line’s own next move is stepped to, and a branch that starts with the move is entered: nothing written', () => {
  const text = '(2... Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6 4. Ba4)';
  const step = ok(play(text, { line: 0, ply: 1 }, 'Bb5'));
  assert.deepEqual([step.written, step.text === text, step.cursor], [false, true, { line: 0, ply: 2 }]);
  const into = ok(play(text, { line: 0, ply: 1 }, 'Bc4'));
  assert.deepEqual([into.written, into.cursor], [false, { line: 1, ply: 1 }]);
  assert.equal(shown(text, into.cursor), 'Nc6 Bc4');
});

test('another move in the middle of a line is a new branch, after the move it replaces and the branches there', () => {
  const a = ok(play('(2... Nc6 3. Bb5 a6 4. Ba4)', { line: 0, ply: 1 }, 'Bc4'));
  // The line's next move carries its number after the branch.
  assert.equal(a.text, '(2... Nc6 3. Bb5 (3. Bc4) 3... a6 4. Ba4)');
  assert.deepEqual(a.cursor, { line: 1, ply: 1 });
  assert.equal(shown(a.text, a.cursor), 'Nc6 Bc4');
  // The branch goes on as a line does.
  const b = ok(play(a.text, a.cursor, 'Bc5'));
  assert.equal(b.text, '(2... Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6 4. Ba4)');
  // A second branch at the same move comes after the first; a glyph on the move stays on it.
  const c = ok(play('(2... Nc6 3. Bb5! (3. Bc4 Bc5) 3... a6)', { line: 0, ply: 1 }, 'd4'));
  assert.equal(c.text, '(2... Nc6 3. Bb5! (3. Bc4 Bc5) (3. d4) 3... a6)');
  assert.deepEqual(c.cursor, { line: 2, ply: 1 });
  // Black's branch, the line's next move White's and numbered already.
  const d = ok(play('(2... Nc6 3. Bb5 a6 4. Ba4)', { line: 0, ply: 2 }, 'Nf6'));
  assert.equal(d.text, '(2... Nc6 3. Bb5 a6 (3... Nf6) 4. Ba4)');
  assert.equal(shown(d.text, d.cursor), 'Nc6 Bb5 Nf6');
  // A branch of a branch.
  const e = ok(play('(2... Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) 3... a6)', { line: 1, ply: 1 }, 'Nf6'));
  assert.equal(e.text, '(2... Nc6 3. Bb5 (3. Bc4 Bc5 (3... Nf6) 4. c3) 3... a6)');
  assert.equal(shown(e.text, e.cursor), 'Nc6 Bc4 Nf6');
  // A branch at the line's last written move, which isn't legal: still a branch from the move shown.
  const f = ok(play('(2... Nc6 3. Qxh7)', { line: 0, ply: 1 }, 'Bb5'));
  assert.equal(f.text, '(2... Nc6 3. Qxh7 (3. Bb5))');
  assert.equal(shown(f.text, f.cursor), 'Nc6 Bb5');
  // Words after the replaced move: the branch stands right after the move.
  const g = ok(play('(2... Nc6 3. Bb5 the Spanish 3... a6)', { line: 0, ply: 1 }, 'Bc4'));
  assert.equal(g.text, '(2... Nc6 3. Bb5 (3. Bc4) the Spanish 3... a6)');
  assert.deepEqual(playedLines(g.text, at.after, at.before).map((l) => l.sans), [['Nc6', 'Bb5', 'a6'], ['Bc4']]);
});

test('a move that isn’t legal is refused, and so is a cursor that is nowhere', () => {
  assert.equal(play('(2... Nc6 3. Bb5)', { line: 0, ply: 2 }, 'Qxh7').ok, false);
  assert.equal(play('(2... Nc6 3. Bb5)', { line: 3, ply: 1 }, 'a6').ok, false);
  assert.equal(play('(2... Nc6 3. Bb5)', { line: 0, ply: 5 }, 'a6').ok, false);
});

test('a line started: a group at the comment’s end, numbered from the move’s position', () => {
  const a = startLine('', at.after, at.before, 'Nc6');
  assert.ok(a.ok);
  assert.deepEqual([a.text, a.cursor, a.written], ['(2... Nc6)', { line: 0, ply: 1 }, true]);
  const b = startLine('The main line. (2... d6 3. d4)', at.after, at.before, 'Nc6');
  assert.ok(b.ok);
  assert.deepEqual([b.text, b.cursor], ['The main line. (2... d6 3. d4) (2... Nc6)', { line: 1, ply: 1 }]);
  // A line of the comment that starts there with the move is entered; one that replaces the commented move is another line.
  const c = startLine('(2... d6 3. d4)', at.after, at.before, 'd6');
  assert.ok(c.ok);
  assert.deepEqual([c.text, c.cursor, c.written], ['(2... d6 3. d4)', { line: 0, ply: 1 }, false]);
  // White to move: after 1. e4 e5.
  const w = after('e4', 'e5');
  const d = startLine('Open game', w.after, w.before, 'Bc4');
  assert.ok(d.ok);
  assert.equal(d.text, 'Open game (2. Bc4)');
  assert.equal(startLine('', at.after, at.before, 'Ke2').ok, false);
});

test('moves played one after another build the line and its branches, read back as written', () => {
  // A line started and played out, then a step back and another move: a branch.
  let e = ok(startLine('Idea:', at.after, at.before, 'Nc6'));
  for (const san of ['Bb5', 'a6', 'Ba4']) e = ok(play(e.text, e.cursor, san));
  assert.equal(e.text, 'Idea: (2... Nc6 3. Bb5 a6 4. Ba4)');
  e = ok(play(e.text, { line: 0, ply: 2 }, 'Nf6'));
  e = ok(play(e.text, e.cursor, 'O-O'));
  assert.equal(e.text, 'Idea: (2... Nc6 3. Bb5 a6 (3... Nf6 4. O-O) 4. Ba4)');
  const lines = playedLines(e.text, at.after, at.before);
  assert.deepEqual(lines.map(sansFromStart), [['Nc6', 'Bb5', 'a6', 'Ba4'], ['Nc6', 'Bb5', 'Nf6', 'O-O']]);
  assert.deepEqual(lines[1]!.parent, { line: 0, ply: 2 });
  assert.equal(makeFen(lines[1]!.positions[0]!.toSetup()), makeFen(lines[0]!.positions[2]!.toSetup()));
});

test('delete from a move: it and the rest of its line go, the other choices to it stay', () => {
  const del = (text: string, cursor: Cursor) => {
    const out = deleteFromLine(text, at.after, at.before, cursor);
    assert.ok(out.ok);
    return out;
  };
  assert.deepEqual(del('(2... Nc6 3. Bb5 a6 4. Ba4)', { line: 0, ply: 3 }), { ok: true, text: '(2... Nc6 3. Bb5)', cursor: { line: 0, ply: 2 } });
  // A branch that replaces the deleted move stays; one from a later move goes with the line.
  const a = del('(2... Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6 (3... Nf6) 4. Ba4)', { line: 0, ply: 2 });
  assert.equal(a.text, '(2... Nc6 (3. Bc4 Bc5))');
  assert.deepEqual(playedLines(a.text, at.after, at.before).map(sansFromStart), [['Nc6'], ['Nc6', 'Bc4', 'Bc5']]);
  // From a line's first move the whole group goes; a branch's cursor is the move it left.
  assert.deepEqual(del('Text (2... Nc6 3. Bb5) more', { line: 0, ply: 1 }), { ok: true, text: 'Text more', cursor: undefined });
  assert.deepEqual(del('(2... Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6)', { line: 1, ply: 1 }), { ok: true, text: '(2... Nc6 3. Bb5 3... a6)', cursor: { line: 0, ply: 1 } });
  assert.deepEqual(del('(2... Nc6)', { line: 0, ply: 1 }), { ok: true, text: '', cursor: undefined });
  // Only a pass before it: nothing of the line is left to show.
  assert.equal(del('x (2... -- 3. d4 Nc6)', { line: 0, ply: 2 }).text, 'x');
  assert.equal(deleteFromLine('(2... Nc6)', at.after, at.before, { line: 0, ply: 3 }).ok, false);
});
