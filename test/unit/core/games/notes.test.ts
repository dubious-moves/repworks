// A game card's note (PLAN.md §5.91): written as one PGN comment, its shapes as commands after the
// words; read back from the card's events, the latest one winning and '' removing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents } from '../../../../src/core/progress/replay.ts';
import { noteComment, noteOf } from '../../../../src/core/games/notes.ts';
import { playedLines } from '../../../../src/core/repertoire/lines.ts';
import { positionOf } from '../../../../src/core/storm/walk.ts';

const card = 'm|g1_12';
const events = (...texts: string[]) =>
  toDeviceEvents('d1', parseLog(texts.map((text, i) => formatEvent({ v: 1, n: i + 1, t: `2026-10-11T10:0${i}:00.000Z`, k: 'note', card, text } as KnownEvent)).join('\n')).lines);

test('a note is written as one comment: the words tidied, then circles and arrows as Lichess writes them', () => {
  assert.equal(
    noteComment('  Bxf7+? fails {to} (5. Bxf7+ Kxf7)  ', [
      { brush: 'red', orig: 'c4', dest: 'f7' },
      { brush: 'green', orig: 'f7' },
    ]),
    'Bxf7+? fails to (5. Bxf7+ Kxf7) [%csl Gf7][%cal Rc4f7]',
  );
  // Commands typed in the words are shapes too, never written twice.
  assert.equal(noteComment('see [%cal Rc4f7] here', [{ brush: 'red', orig: 'c4', dest: 'f7' }]), 'see here [%cal Rc4f7]');
  assert.equal(noteComment('', [{ brush: 'blue', orig: 'e4', dest: 'e5' }]), '[%cal Be4e5]');
  assert.equal(noteComment('   ', []), '');
});

test('the latest note is the card’s, and an empty one removes it', () => {
  assert.equal(noteOf([]), undefined);
  assert.deepEqual(noteOf(events('first', 'Why not (5. Bxf7+) [%cal Rc4f7]')), { text: 'Why not (5. Bxf7+)', shapes: [{ brush: 'red', orig: 'c4', dest: 'f7' }] });
  assert.deepEqual(noteOf(events('[%csl Gf7]')), { text: '', shapes: [{ brush: 'green', orig: 'f7' }] });
  assert.equal(noteOf(events('first', '')), undefined);
});

test('a note’s line starts at the card’s position, as a comment’s does at its move', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  const after = positionOf(fen)!;
  const [line] = playedLines('3... Nd4? fails (3... Nd4 4. Nxe5 Qg5 5. Bxf7+)', after, undefined);
  assert.deepEqual(line!.sans, ['Nd4', 'Nxe5', 'Qg5', 'Bxf7+']);
});
