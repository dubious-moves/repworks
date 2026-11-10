// What another app shared, or a file opened (PLAN.md §5.159): a file first, a Lichess study link
// wherever it is, PGN as text, and nothing to import said why.
//
// Controls run on this file (2026-11-10), each failing exactly the named assertions:
// - the link looked for in the url only → "a study link in the text";
// - the trailing punctuation kept → "a study link in the text";
// - any text taken as PGN → "nothing to import".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readShared } from '../../../../src/core/import/shared.ts';

const PGN = '[Event "Scandi"]\n\n1. e4 d5 *';

test('a file first, whatever else came with it', () => {
  assert.deepEqual(readShared({ file: { name: 'scandi.pgn', text: PGN }, text: 'https://lichess.org/study/abcdEFGH' }), { kind: 'pgn', pgn: PGN, name: 'scandi.pgn' });
  // An empty file is not one.
  assert.deepEqual(readShared({ file: { name: 'x.pgn', text: '  ' }, url: 'https://lichess.org/study/abcdEFGH' }), { kind: 'lichess', id: 'abcdEFGH' });
});

test('a study link in the text', () => {
  assert.deepEqual(readShared({ url: 'https://lichess.org/study/abcdEFGH/ijklMNOP' }), { kind: 'lichess', id: 'abcdEFGH' });
  assert.deepEqual(readShared({ title: 'My Scandi', text: 'My Scandi https://lichess.org/study/abcdEFGH.' }), { kind: 'lichess', id: 'abcdEFGH' });
  assert.deepEqual(readShared({ text: 'see (https://lichess.org/study/abcdEFGH)' }), { kind: 'lichess', id: 'abcdEFGH' });
});

test('PGN as text, named by the title', () => {
  assert.deepEqual(readShared({ title: 'Scandi', text: PGN }), { kind: 'pgn', pgn: PGN, name: 'Scandi' });
  assert.deepEqual(readShared({ text: '1. e4 c5 2. Nf3' }), { kind: 'pgn', pgn: '1. e4 c5 2. Nf3', name: 'shared PGN' });
});

test('nothing to import', () => {
  const r = readShared({ text: 'https://lichess.org/abcdEFGH a game, not a study' });
  assert.equal(r.kind, 'none');
  assert.equal(readShared({ text: 'hello there' }).kind, 'none');
  assert.deepEqual(readShared({}), { kind: 'none', why: 'Nothing was shared.' });
});
