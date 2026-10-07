// The storm's store on this device (PLAN.md §5.42), in Node through fake-indexeddb.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoredPosition } from '../../../src/core/storm/harvest.ts';
import type { PositionKey } from '../../../src/core/chess/positionKey.ts';
import { openStormStore } from '../../../src/platform/stormStore.ts';

let n = 0;
const fresh = () => `storm-store-test-${++n}`;
const pos = (k: string, at: number): StoredPosition => ({ card: 's|' + k, key: k as PositionKey, fen: k + ' 0 1', side: 'white', ply: 2, lines: [], names: [], arrived: null, scored: [{ u: 'e2e4', s: 10 }], src: 'cdb', depth: 0, invented: false, unc: null, games: null, at });

test('positions: stored once by card, the oldest out past the cap, removed, cleared', async () => {
  const s = openStormStore(indexedDB, fresh());
  assert.equal(await s.addPositions([pos('a', 1), pos('b', 2), pos('a', 3)], 3), 2);
  assert.equal(await s.addPositions([pos('b', 4), pos('c', 5), pos('d', 6)], 3), 2);
  assert.deepEqual((await s.positions()).map((p) => p.card).sort(), ['s|b', 's|c', 's|d']);
  await s.removePositions(['s|c']);
  assert.deepEqual((await s.positions()).map((p) => p.card).sort(), ['s|b', 's|d']);
  await s.putPosition({ ...pos('b', 2), depth: 20, src: 'sf' });
  assert.equal((await s.positions()).find((p) => p.card === 's|b')!.depth, 20);
  // Another instance reads the same database.
  const again = openStormStore(indexedDB, `storm-store-test-${n}`);
  assert.equal((await again.positions()).length, 2);
  await s.clearPositions();
  assert.equal((await s.positions()).length, 0);
});

test('the other stores: put, get, all, remove, clear', async () => {
  const s = openStormStore(indexedDB, fresh());
  await s.put('meta', 'builtAt', '2026-05-23');
  assert.equal(await s.get('meta', 'builtAt'), '2026-05-23');
  await s.put('puzzleBodies', 'AbC12', { id: 'AbC12' });
  assert.deepEqual(await s.all('puzzleBodies'), [{ id: 'AbC12' }]);
  await s.remove('puzzleBodies', ['AbC12']);
  assert.deepEqual(await s.all('puzzleBodies'), []);
  await s.clear('meta');
  assert.equal(await s.get('meta', 'builtAt'), undefined);
});
