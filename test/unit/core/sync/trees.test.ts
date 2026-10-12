// The tree merge's rule for the storm's shared files (PLAN.md §5.102): a device's own files are
// ours when both sides changed them, another device's are theirs, and none is ever read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha } from '../../../../src/core/sync/gitHash.ts';
import { mergeNeeds, mergeTrees } from '../../../../src/core/sync/trees.ts';

test("storm files changed on both sides: this device's own are ours, another's theirs, with nothing read", () => {
  const sha = (t: string) => gitBlobSha(t);
  const mine = 'storm/Phone001/2026-10-12.1.jsonl';
  const other = 'storm/Desk0001/2026-10-12.1.jsonl';
  const sides = {
    base: new Map([
      [mine, sha('b1')],
      [other, sha('b2')],
    ]),
    ours: new Map([
      [mine, sha('o1')],
      [other, sha('o2')],
    ]),
    theirs: new Map([
      [mine, sha('t1')],
      [other, sha('t2')],
    ]),
  };
  assert.equal(mergeNeeds(sides, 'Phone001').shas.size, 0);
  const merged = mergeTrees(
    sides,
    () => {
      throw new Error('read');
    },
    { labels: { ours: 'phone', theirs: 'desktop' }, device: 'Phone001', newId: () => 'NewId001' },
  );
  assert.equal(merged.files.get(mine), sha('o1'));
  assert.equal(merged.files.get(other), sha('t2'));
  assert.deepEqual(merged.conflicts, []);
});
