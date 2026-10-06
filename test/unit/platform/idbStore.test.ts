// The IndexedDB store (PLAN.md §4.9) in Node through fake-indexeddb: what the sync step relies on
// (one transaction per call, the edit counter's check, blobs kept while referenced), and what
// the app relies on (numbering, the working view, surviving a reopen).
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha } from '../../../src/core/sync/gitHash.ts';
import { IdbStore } from '../../../src/platform/idbStore.ts';

let counter = 0;
async function fresh(): Promise<{ store: IdbStore; name: string }> {
  const name = `idb-test-${++counter}`;
  const store = await IdbStore.open(undefined, name);
  await store.setUp({ repo: 'owner/data', branch: 'main', token: 'test-token', write: 'graphql' }, { id: 'DeskTest', name: 'desktop', created: '2026-10-05T12:00:00.000Z' });
  return { store, name };
}

const sha = (text: string) => gitBlobSha(text);

test('setup keeps an existing device and counters; a second setup only changes the remote', async () => {
  const { store } = await fresh();
  await store.record({ t: '2026-10-05T12:00:00.000Z', k: 'review', card: 'r|a|e2e4', g: 3 });
  const again = await store.setUp({ repo: 'owner/data', branch: 'main', token: 'new-token', write: 'rest' }, { id: 'Other123', name: 'x', created: '2026-10-06T00:00:00.000Z' });
  assert.equal(again.id, 'DeskTest');
  assert.equal((await store.remote())?.token, 'new-token');
  assert.equal((await store.unsentEvents()).length, 1);
});

test('events are numbered from 1 per device and written as their upload lines', async () => {
  const { store } = await fresh();
  const a = await store.record({ t: '2026-10-05T12:00:00.000Z', k: 'review', card: 'r|a|e2e4', g: 3, ms: 1200 });
  const b = await store.record({ t: '2026-10-05T12:00:05.000Z', k: 'suspend', card: 'r|a|e2e4' });
  assert.deepEqual([a.n, b.n], [1, 2]);
  assert.equal(a.raw, '{"v":1,"n":1,"t":"2026-10-05T12:00:00.000Z","k":"review","card":"r|a|e2e4","g":3,"ms":1200}');
  assert.deepEqual((await store.snapshot()).events.map((e) => e.n), [1, 2]);
});

test('the working view is the base with the working copies over it', async () => {
  const { store } = await fresh();
  const files = new Map([
    ['a.txt', sha('a\n')],
    ['b.txt', sha('b\n')],
  ]);
  await store.putBlobs(new Map([[sha('a\n'), 'a\n'], [sha('b\n'), 'b\n']]));
  assert.ok(await store.finish({ base: { commit: 'c1', tree: 't1', files }, etag: 'W/"1"', overlay: new Map(), expectRev: 0, clearPending: false }));
  await store.edit('b.txt', null);
  await store.edit('c.txt', 'c\n');
  assert.deepEqual(await store.read(), new Map([['a.txt', 'a\n'], ['c.txt', 'c\n']]));
  assert.deepEqual(await store.waiting(), { files: 2, events: 0 });
});

test('finish writes nothing if a working copy was edited since; then succeeds against the new counter', async () => {
  const { store } = await fresh();
  await store.edit('x.txt', 'one\n');
  const snap = await store.snapshot();
  await store.edit('x.txt', 'two\n');
  const update = { base: { commit: 'c1', tree: 't1', files: new Map<string, string>() }, etag: undefined, overlay: new Map(), clearPending: false };
  assert.equal(await store.finish({ ...update, expectRev: snap.rev }), false);
  assert.equal((await store.state()).base, undefined);
  const now = await store.snapshot();
  assert.ok(await store.finish({ ...update, overlay: now.overlay, expectRev: now.rev }));
  assert.equal((await store.state()).base?.commit, 'c1');
  assert.deepEqual(await store.read(), new Map([['x.txt', 'two\n']]));
});

test('finish raises the uploaded mark, drops those events, records the old base, and sweeps unreferenced blobs', async () => {
  const { store } = await fresh();
  for (let i = 0; i < 3; i++) await store.record({ t: '2026-10-05T12:00:00.000Z', k: 'review', card: 'r|a|e2e4', g: 3 });
  await store.putBlobs(new Map([[sha('old\n'), 'old\n']]));
  await store.finish({ base: { commit: 'c1', tree: 't1', files: new Map([['f', sha('old\n')]]) }, etag: undefined, overlay: new Map(), expectRev: 0, clearPending: false });
  // Downloaded for the next base, written for a pending commit, and one nobody refers to.
  await store.putBlobs(new Map([[sha('new\n'), 'new\n'], [sha('pending\n'), 'pending\n'], [sha('stray\n'), 'stray\n']]));
  await store.addPending({ seq: 1, parent: 'c1', files: new Map([['f', sha('pending\n')]]), snapshot: new Map(), snapshotRev: 0, uploadedThrough: 2 });
  assert.equal((await store.state()).seq, 2);
  await store.finish({ base: { commit: 'c2', tree: 't2', files: new Map([['f', sha('new\n')]]) }, etag: 'W/"2"', overlay: new Map(), expectRev: 0, uploadedThrough: 2, clearPending: false });
  const state = await store.state();
  assert.deepEqual(state.recent, ['c1']);
  assert.equal(state.uploadedThrough, 2);
  assert.deepEqual((await store.unsentEvents()).map((e) => e.n), [3]);
  assert.deepEqual([...(await store.blobs([sha('old\n'), sha('new\n'), sha('pending\n'), sha('stray\n')])).values()], ['new\n', 'pending\n']);
  await store.dropPending(1);
  assert.deepEqual(await store.missing([sha('pending\n'), sha('new\n')]), [sha('pending\n')]);
});

test('everything survives closing and reopening the database', async () => {
  const { store, name } = await fresh();
  await store.edit('kept.txt', 'kept\n');
  await store.record({ t: '2026-10-05T12:00:00.000Z', k: 'forget', card: 'r|a|e2e4' });
  const reopened = await IdbStore.open(undefined, name);
  assert.equal((await reopened.device())?.id, 'DeskTest');
  assert.deepEqual(await reopened.read(), new Map([['kept.txt', 'kept\n']]));
  assert.equal((await reopened.unsentEvents()).length, 1);
});
