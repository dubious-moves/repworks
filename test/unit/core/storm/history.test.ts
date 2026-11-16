// The positions that led to a storm position (PLAN.md §5.190), for the 23M Maia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { storedBefore } from '../../../../src/core/storm/history.ts';

const SANS = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6'.split(' ');
const chapter = (() => {
  const r = parseChapterFile('[Event "Ruy"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *\n', 'Chap0001');
  if (!r.ok) throw new Error(r.reason);
  return r.chapter;
})();
const get = (sid: string, cid: string) => (sid === 'Study001' && cid === 'Chap0001' ? chapter : undefined);
function fens(sans: readonly string[]): string[] {
  const pos = Chess.default();
  const out = [makeFen(pos.toSetup())];
  for (const san of sans) {
    pos.play(parseSan(pos, san)!);
    out.push(makeFen(pos.toSetup()));
  }
  return out;
}
const F = fens(SANS);
const ref = { sid: 'Study001', cid: 'Chap0001', path: SANS.slice(0, 4) };

test('a position one reply past a line\'s end has the line\'s positions before it', () => {
  // The line 1. e4 e5 2. Nf3 Nc6, then the explorer's reply 3. Bb5 (ply 1).
  const before = storedBefore({ fen: F[5]!, ply: 1, lines: [ref], arrived: { san: 'Bb5', uci: 'f1b5', before: F[4]! } }, get);
  assert.deepEqual(before, F.slice(0, 5));
});

test('the line\'s end itself (ply 0) has the positions before it; a long line keeps the last seven', () => {
  const long = { ...ref, path: SANS };
  assert.deepEqual(storedBefore({ fen: F[8]!, ply: 0, lines: [long], arrived: null }, get), F.slice(1, 8));
  assert.deepEqual(storedBefore({ fen: F[4]!, ply: 0, lines: [ref], arrived: null }, get), F.slice(0, 4));
});

test('further past the line\'s end only the position arrived from is known; a continued card keeps its own', () => {
  assert.deepEqual(storedBefore({ fen: F[7]!, ply: 3, lines: [ref], arrived: { san: 'a6', uci: 'a7a6', before: F[6]! } }, get), [F[6]]);
  assert.deepEqual(storedBefore({ fen: F[7]!, ply: 3, lines: [ref], arrived: { san: 'a6', uci: 'a7a6', before: F[6]! }, lead: F.slice(0, 7) }, get), F.slice(0, 7));
  assert.deepEqual(storedBefore({ fen: F[7]!, ply: 3, lines: [ref], arrived: null }, get), []);
});

test('a study deleted, or a chapter edited so its line ends elsewhere, leaves the arrival alone', () => {
  const lost = { fen: F[5]!, ply: 1, lines: [{ ...ref, sid: 'Gone0001' }], arrived: { san: 'Bb5', uci: 'f1b5', before: F[4]! } };
  assert.deepEqual(storedBefore(lost, get), [F[4]]);
  const moved = { fen: F[5]!, ply: 1, lines: [ref], arrived: { san: 'Bb5', uci: 'f1b5', before: F[3]! } };
  assert.deepEqual(storedBefore(moved, get), [F[3]]);
});
