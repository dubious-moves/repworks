// When to sync (PLAN.md §4.9) and the setup link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schedule } from '../../../../src/core/sync/schedule.ts';
import { parseSetupHash, setupLink } from '../../../../src/core/sync/setup.ts';

const S = 1000;
const MIN = 60 * S;

test('start pulls at once; then every 5 minutes while visible, never while hidden', () => {
  const s = new Schedule();
  s.note('start', 0);
  assert.deepEqual(s.next(0), { at: 0, push: false });
  s.ended('synced', 1 * S);
  assert.deepEqual(s.next(2 * S), { at: 1 * S + 5 * MIN, push: false });
  s.note('hidden', 3 * S);
  assert.equal(s.next(3 * S), undefined);
  s.note('visible', 10 * MIN);
  assert.deepEqual(s.next(10 * MIN), { at: 10 * MIN, push: false });
});

test('a change pushes 30 s after the last edit, at most once a minute', () => {
  const s = new Schedule();
  s.ended('synced', 0, { pushed: true });
  s.note('change', 10 * S);
  s.note('change', 20 * S);
  // 30 s after the last change (50 s) is earlier than a minute after the last push (60 s).
  assert.deepEqual(s.next(20 * S), { at: 60 * S, push: true });
  s.ended('synced', 60 * S, { pushed: true });
  s.setDirty(false);
  s.note('change', 61 * S);
  assert.deepEqual(s.next(61 * S), { at: 120 * S, push: true });
});

test('focus pulls at once without pushing an edit that is not due', () => {
  const s = new Schedule();
  s.ended('synced', 0, { pushed: true });
  s.note('change', 100 * S);
  s.note('focus', 101 * S);
  assert.deepEqual(s.next(101 * S), { at: 101 * S, push: false });
});

test('hiding the app pushes at once (best effort)', () => {
  const s = new Schedule();
  s.ended('synced', 0, { pushed: true });
  s.note('change', 5 * S);
  s.note('hidden', 6 * S);
  assert.deepEqual(s.next(6 * S), { at: 6 * S, push: true });
});

test('failures wait: retry-after for a rate limit, else a minute doubling up to 30', () => {
  const s = new Schedule();
  s.note('change', 0);
  s.ended('rate', 0, { retryAfterMs: 120 * S });
  assert.equal(s.next(0)!.at, 120 * S);
  const t = new Schedule();
  t.note('change', 0);
  const waits: number[] = [];
  let now = 0;
  for (let i = 0; i < 7; i++) {
    t.ended('offline', now);
    const at = t.next(now)!.at;
    waits.push((at - now) / MIN);
    now = at;
  }
  assert.deepEqual(waits, [1, 2, 4, 8, 16, 30, 30]);
  t.note('online', now + 1);
  assert.equal(t.next(now + 1)!.at, now + 1, 'the network coming back clears the wait');
});

test('a refused token stops syncing until setup or a sync by hand', () => {
  const s = new Schedule();
  s.note('change', 0);
  s.ended('auth', 0);
  assert.equal(s.next(10 * MIN), undefined);
  s.note('focus', 11 * MIN);
  assert.equal(s.next(11 * MIN), undefined);
  s.note('setup', 12 * MIN);
  assert.deepEqual(s.next(12 * MIN), { at: 12 * MIN, push: true });
});

test('offline: nothing is due until the network comes back', () => {
  const s = new Schedule();
  s.note('offline', 0);
  s.note('change', 0);
  assert.equal(s.next(5 * MIN), undefined);
  s.note('online', 6 * MIN);
  assert.deepEqual(s.next(6 * MIN), { at: 6 * MIN, push: true });
});

test('setup links: read, checked, and written back', () => {
  const token = 'test_token_for_a_fake_github_0123456789';
  assert.equal(parseSetupHash('#/study/abc'), undefined);
  assert.deepEqual(parseSetupHash(`#setup?repo=skAeglund/repworks-data&token=${token}&name=phone`), { ok: true, value: { repo: 'skAeglund/repworks-data', token, name: 'phone' } });
  assert.deepEqual(parseSetupHash(`#setup?repo=https://github.com/skAeglund/repworks-data/&token=${token}&write=rest`), { ok: true, value: { repo: 'skAeglund/repworks-data', token, write: 'rest' } });
  assert.equal(parseSetupHash(`#setup?repo=nope&token=${token}`)?.ok, false);
  assert.equal(parseSetupHash('#setup?repo=a/b&token=short')?.ok, false);
  const link = setupLink('https://dubious-moves.github.io/repworks/', { repo: 'skAeglund/repworks-data', token, name: 'my phone' });
  assert.equal(link, `https://dubious-moves.github.io/repworks/#setup?repo=skAeglund%2Frepworks-data&token=${token}&name=my%20phone`);
  assert.deepEqual(parseSetupHash(link.slice(link.indexOf('#'))), { ok: true, value: { repo: 'skAeglund/repworks-data', token, name: 'my phone' } });
});
