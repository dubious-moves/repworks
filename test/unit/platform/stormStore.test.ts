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

test('a position changed from what is stored: two writers of different fields both kept', async () => {
  const s = openStormStore(indexedDB, fresh());
  await s.addPositions([pos('a', 1)], 10);
  const [deepened, rated] = await Promise.all([
    s.updatePosition('s|a', (p) => ({ ...p, src: 'sf', depth: 20 })),
    s.updatePosition('s|a', (p) => ({ ...p, maia: [{ elo: 1800, moves: [['e2e4', 0.5]] }] })),
  ]);
  assert.equal(deepened!.depth, 20);
  assert.equal(rated!.depth, 20);
  const [p] = await s.positions();
  assert.equal(p!.depth, 20);
  assert.deepEqual(p!.maia, [{ elo: 1800, moves: [['e2e4', 0.5]] }]);
  assert.equal(await s.updatePosition('s|gone', (x) => x), undefined);
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

test('the cap: the cards spared (done) go first, then the oldest', async () => {
  const s = openStormStore(indexedDB, fresh());
  await s.addPositions([pos('a', 1), pos('b', 2), pos('c', 3)], 3);
  await s.addPositions([pos('d', 4)], 3, new Set(['s|c']));
  assert.deepEqual((await s.positions()).map((p) => p.card).sort(), ['s|a', 's|b', 's|d']);
});

test("other devices' positions merged in (§5.102): new ones marked, kept ones bettered, cleared ones kept out until gathered again", async () => {
  const s = openStormStore(indexedDB, fresh());
  await s.addPositions([pos('a', 10), pos('b', 10)], 10);
  await s.removePositions(['s|b']);
  await s.noteCleared(['s|b'], 20);
  const theirs = [pos('a', 5), pos('b', 15), pos('c', 30)].map((p) => ({ ...p, src: 'sf' as const, depth: 22 }));
  assert.deepEqual(await s.mergePositions([{ dev: 'Desk0001', positions: theirs }], 10), { added: 1, updated: 1 });
  const byCard = new Map((await s.positions()).map((p) => [p.card, p]));
  assert.deepEqual([...byCard.keys()].sort(), ['s|a', 's|c']);
  assert.deepEqual([byCard.get('s|a')!.from, byCard.get('s|a')!.depth, byCard.get('s|a')!.at], [undefined, 22, 10]);
  assert.equal(byCard.get('s|c')!.from, 'Desk0001');
  // Gathered there after it was cleared here: it comes in.
  assert.deepEqual(await s.mergePositions([{ dev: 'Desk0001', positions: [{ ...pos('b', 25), src: 'sf', depth: 22 }] }], 10), { added: 1, updated: 0 });
  // Merged again: no change. And past the cap, what was kept goes before what came in.
  assert.deepEqual(await s.mergePositions([{ dev: 'Desk0001', positions: theirs }], 10), { added: 0, updated: 0 });
  await s.mergePositions([{ dev: 'Desk0001', positions: [pos('d', 1), pos('e', 1)] }], 3);
  assert.deepEqual((await s.positions()).map((p) => p.card).sort(), ['s|c', 's|d', 's|e']);
});
