// The practice game kept on the device (PLAN.md §6, item 2): mistake-lab's CONTINUATION SESSION
// PERSISTENCE at c525403 (`loadContSession`: four hours; the banner from two moves), and the
// repertoire check while practising (`evaluateMove`'s check: before ply 20, a position the trie
// has, a move matching none of its entries by UCI or SAN; read from its code, which runs only inside
// that async function, so its rule is tested here case by case rather than in a sandbox).
//
// Controls re-run (2026-10-07), each failing exactly the named assertions:
// - the age compared with `>=` instead of `>` → "a saved game is offered for four hours";
// - the ply counted from the move number alone (no side to move) → "the repertoire check asks
//   before ply 20".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaved, resumable, RESUME } from '../../../../src/core/games/resume.ts';
import { plyOfFen, repertoireCheck } from '../../../../src/core/games/practice.ts';

const valid = (g: unknown): g is { moves: string[] } => typeof g === 'object' && g !== null && Array.isArray((g as { moves?: unknown }).moves);
const at = 1_790_000_000_000;
const raw = (savedAt: number, game: unknown = { moves: ['e2e4', 'e7e5'] }) => JSON.stringify({ savedAt, game });

test('a saved game is offered for four hours', () => {
  assert.deepEqual(readSaved(raw(at), at + RESUME.maxAgeMs, valid)?.game, { moves: ['e2e4', 'e7e5'] });
  assert.equal(readSaved(raw(at), at + RESUME.maxAgeMs + 1, valid), undefined);
  assert.equal(readSaved(raw(at + 3_600_000), at, valid), undefined, 'saved in the future');
});

test('nothing usable: no game, not JSON, a game its reader refuses', () => {
  assert.equal(readSaved(null, at, valid), undefined);
  assert.equal(readSaved('{', at, valid), undefined);
  assert.equal(readSaved(raw(at, { moves: 'e2e4' }), at, valid), undefined);
  assert.equal(readSaved(JSON.stringify({ game: { moves: [] } }), at, valid), undefined);
});

test('the banner from two moves played', () => {
  assert.equal(resumable(1), false);
  assert.equal(resumable(2), true);
});

const SICILIAN = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const entries = [{ uci: 'g1f3', san: 'Nf3' }, { uci: 'b1c3', san: 'Nc3' }];

test('the repertoire check asks before ply 20', () => {
  assert.equal(plyOfFen(SICILIAN), 2);
  assert.equal(plyOfFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 10'), 19);
  assert.equal(plyOfFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 11'), 20);
  const late = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 11';
  assert.equal(repertoireCheck(late, entries, { uci: 'd2d4', san: 'd4' }, false).refuse, false);
  const early = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 10';
  assert.equal(repertoireCheck(early, entries, { uci: 'd7d5', san: 'd5' }, false).refuse, true);
});

test('a move the repertoire has passes, by UCI or SAN; another is taken back with the main move', () => {
  assert.deepEqual(repertoireCheck(SICILIAN, entries, { uci: 'b1c3', san: 'Nc3' }, false), { refuse: false });
  assert.deepEqual(repertoireCheck(SICILIAN, [{ uci: 'e1h1', san: 'Nf3' }], { uci: 'g1f3', san: 'Nf3' }, false), { refuse: false });
  assert.deepEqual(repertoireCheck(SICILIAN, entries, { uci: 'd2d4', san: 'd4' }, false), { refuse: true, uci: 'g1f3', san: 'Nf3' });
  assert.deepEqual(repertoireCheck(SICILIAN, entries, { uci: 'd2d4', san: 'd4' }, true), { refuse: false }, 'ignored for this game');
  assert.deepEqual(repertoireCheck(SICILIAN, undefined, { uci: 'd2d4', san: 'd4' }, false), { refuse: false }, 'a position the repertoire lacks');
});
