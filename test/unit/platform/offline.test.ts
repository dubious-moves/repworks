// Offline mode's guard on fetch (PLAN.md §5.203): while it is on, a request that leaves the site is
// refused at once with a TypeError, as fetch fails with no network; the site's own files go on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardFetch, leaves, networkUp, offlineMode, OfflineModeError, onOfflineMode, setOfflineMode } from '../../../src/platform/offline.ts';

test('leaves: another origin leaves, the site’s own paths and relative URLs don’t', () => {
  const origin = 'https://dubious-moves.github.io';
  assert.equal(leaves('https://api.github.com/graphql', origin), true);
  assert.equal(leaves(new URL('https://tablebase.lichess.ovh/standard?fen=x'), origin), true);
  assert.equal(leaves('http://localhost:9002/info', origin), true);
  assert.equal(leaves('https://dubious-moves.github.io/repworks/engines/sf.wasm', origin), false);
  assert.equal(leaves('engines/maia.onnx', origin), false);
  assert.equal(leaves('/repworks/index.html', origin), false);
});

test('the guard refuses a request leaving the site while offline mode is on, and lets it go once off', async () => {
  const seen: string[] = [];
  const original = globalThis.fetch;
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { origin: 'https://site.test' }, configurable: true });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response('ok');
  }) as typeof fetch;
  const heard: boolean[] = [];
  const stop = onOfflineMode((on) => heard.push(on));
  try {
    guardFetch();
    assert.equal(offlineMode(), false);
    await fetch('https://api.github.com/a');
    await setOfflineMode(true);
    assert.equal(offlineMode(), true);
    assert.equal(networkUp(), false);
    await assert.rejects(fetch('https://api.github.com/b'), (e: unknown) => e instanceof TypeError && e instanceof OfflineModeError);
    await assert.rejects(fetch(new Request('https://explorer.lichess.ovh/lichess')), OfflineModeError);
    await fetch('https://site.test/repworks/engines/x.wasm');
    await setOfflineMode(false);
    await fetch('https://api.github.com/c');
    assert.deepEqual(seen, ['https://api.github.com/a', 'https://site.test/repworks/engines/x.wasm', 'https://api.github.com/c']);
    assert.deepEqual(heard, [true, false]);
  } finally {
    stop();
    globalThis.fetch = original;
    if (location) Object.defineProperty(globalThis, 'location', location);
    else delete (globalThis as { location?: unknown }).location;
  }
});
