// The practice game kept on the device (PLAN.md §6, item 2): mistake-lab's CONTINUATION SESSION
// PERSISTENCE at c525403 (`loadContSession`: four hours; the banner from two moves), and the
// repertoire check while practising (`evaluateMove`'s check: a position the trie has, a move
// matching none of its entries by UCI or SAN; read from its code, which runs only inside that async
// function, so its rule is tested here case by case rather than in a sandbox). Its window, before
// ply 20, is gone (the owner's request, 2026-10-26): the check asks at any ply.
//
// Control re-run (2026-10-07), failing exactly the named assertion:
// - the age compared with `>=` instead of `>` → "a saved game is offered for four hours".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaved, resumable, RESUME } from '../../../../src/core/games/resume.ts';
import { repertoireCheck } from '../../../../src/core/games/practice.ts';

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

const entries = [{ uci: 'g1f3', san: 'Nf3' }, { uci: 'b1c3', san: 'Nc3' }];

test('a move the repertoire has passes, by UCI or SAN; another is taken back with the main move', () => {
  assert.deepEqual(repertoireCheck(entries, { uci: 'b1c3', san: 'Nc3' }, false), { refuse: false });
  assert.deepEqual(repertoireCheck([{ uci: 'e1h1', san: 'Nf3' }], { uci: 'g1f3', san: 'Nf3' }, false), { refuse: false });
  assert.deepEqual(repertoireCheck(entries, { uci: 'd2d4', san: 'd4' }, false), { refuse: true, uci: 'g1f3', san: 'Nf3' });
  assert.deepEqual(repertoireCheck(entries, { uci: 'd2d4', san: 'd4' }, true), { refuse: false }, 'ignored for this game');
  assert.deepEqual(repertoireCheck(undefined, { uci: 'd2d4', san: 'd4' }, false), { refuse: false }, 'a position the repertoire lacks');
});
