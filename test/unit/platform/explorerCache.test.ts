// The explorer's IndexedDB cache (PLAN.md §5.22) in Node through fake-indexeddb.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExplorerCache } from '../../../src/platform/explorerCache.ts';

let n = 0;
const fresh = () => `explorer-cache-test-${++n}`;

test('a record is kept, read back from another instance, and expires on read', async () => {
  let t = 1000;
  const name = fresh();
  const a = createExplorerCache(indexedDB, () => t, name);
  await a.put('explorer', 'k1', { total: 5 });
  assert.deepEqual(await a.get('explorer', 'k1', 100), { total: 5 });
  // Another instance (a reload) reads it from IndexedDB, not from memory.
  const b = createExplorerCache(indexedDB, () => t, name);
  assert.deepEqual(await b.get('explorer', 'k1', 100), { total: 5 });
  t += 100;
  assert.equal(await b.get('explorer', 'k1', 100), undefined);
  assert.equal(await a.get('explorer', 'k1', 100), undefined);
  // A longer TTL still finds it: expiry is the caller's.
  assert.deepEqual(await createExplorerCache(indexedDB, () => t, name).get('explorer', 'k1', 1000), { total: 5 });
});

test('the two stores are apart, and counted', async () => {
  const c = createExplorerCache(indexedDB, () => 0, fresh());
  await c.put('explorer', 'same', 1);
  await c.put('chessdb', 'same', 2);
  await c.put('chessdb', 'other', 3);
  assert.equal(await c.get('explorer', 'same', 10), 1);
  assert.equal(await c.get('chessdb', 'same', 10), 2);
  assert.deepEqual(await c.count!(), { explorer: 1, chessdb: 2 });
});

test('with no IndexedDB, memory only', async () => {
  const c = createExplorerCache(null, () => 0, fresh());
  await c.put('explorer', 'k', 'v');
  assert.equal(await c.get('explorer', 'k', 10), 'v');
  assert.deepEqual(await c.count!(), { explorer: 0, chessdb: 0 });
});
