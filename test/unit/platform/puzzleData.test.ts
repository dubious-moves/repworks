// The puzzle dataset over the network (PLAN.md §5.47), over a fake fetch: the base URL normalized
// or refused, meta.json read once and checked, shard paths built from shard names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBase, puzzleData } from '../../../src/platform/puzzleData.ts';

const META = readFileSync(new URL('../../fixtures/puzzles/meta.json', import.meta.url), 'utf8');

function fake(answers: Record<string, string | number>) {
  const urls: string[] = [];
  const get = (url: string) => {
    urls.push(url);
    const a = answers[url];
    return Promise.resolve(typeof a === 'number' ? { ok: false, status: a, text: () => Promise.resolve('') } : a === undefined ? { ok: false, status: 404, text: () => Promise.resolve('') } : { ok: true, status: 200, text: () => Promise.resolve(a) });
  };
  return { urls, get };
}

test('the base: a trailing slash added, anything but a web address refused', () => {
  assert.equal(normalizeBase(' https://example.org/data '), 'https://example.org/data/');
  assert.equal(normalizeBase('https://example.org/data/'), 'https://example.org/data/');
  assert.equal(normalizeBase('example.org'), '');
  assert.equal(normalizeBase('javascript:alert(1)'), '');
});

test('meta.json read once, its stamp and ceiling; a broken one is an error, asked again later', async () => {
  const f = fake({ 'https://x.test/d/meta.json': META, 'https://x.test/d/index/0a1.json': '{}', 'https://x.test/d/puzzles/0a1.ndjson': '' });
  const d = puzzleData('https://x.test/d', f.get);
  assert.deepEqual(await d.meta(), { builtAt: '2026-05-23T07:21:25.458Z', shardHexLen: 3, maxEmissionPly: 22 });
  await d.meta();
  assert.equal(f.urls.length, 1);
  assert.equal(await d.index('0a1'), '{}');
  await d.bodies('0a1');
  assert.deepEqual(f.urls.slice(1), ['https://x.test/d/index/0a1.json', 'https://x.test/d/puzzles/0a1.ndjson']);
  await assert.rejects(() => d.index('../x'), /not a shard name/);
  const bad = fake({ 'https://y.test/meta.json': '{"source":"x"}' });
  await assert.rejects(() => puzzleData('https://y.test/', bad.get).meta(), /no build stamp/);
  const gone = fake({ 'https://z.test/meta.json': 503 });
  const g = puzzleData('https://z.test/', gone.get);
  await assert.rejects(() => g.meta(), /HTTP 503/);
  await assert.rejects(() => g.meta(), /HTTP 503/);
  assert.equal(gone.urls.length, 2);
  await assert.rejects(() => puzzleData('nope', gone.get).meta(), /isn’t a web address/);
});
