// Devices editing one chapter concurrently and syncing through a remote converge (PLAN.md §4.7;
// the planning prototype ran 3,000 two-device histories). The remote here is a version counter
// and a chapter; §4.9's simulation runs the same through the real sync step and a fake GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChapter } from '../../src/core/merge/chapter.ts';
import type { Chapter } from '../../src/core/study/model.ts';
import { chapterProblems } from '../../src/core/study/tree.ts';
import { mulberry32 } from '../support/random.ts';
import { randomChapter } from '../support/randomTree.ts';
import { randomEdit } from '../support/randomEdit.ts';
import { isDeepStrictEqual } from 'node:util';

interface Device {
  name: string;
  base: { version: number; chapter: Chapter };
  local: Chapter;
}

function history(seed: number, devices: number): { converged: boolean; valid: boolean } {
  const random = mulberry32(seed);
  let remote = { version: 0, chapter: randomChapter(random, 'Chapter1', { maxDepth: 5 }) };
  const fleet: Device[] = Array.from({ length: devices }, (_, i) => ({ name: `device${i}`, base: { ...remote }, local: remote.chapter }));
  const sync = (d: Device) => {
    const next =
      d.base.version === remote.version
        ? d.local
        : mergeChapter(d.base.chapter, d.local, remote.chapter, { ours: `${d.name} ${remote.version}`, theirs: `remote ${remote.version}` }).chapter;
    remote = { version: remote.version + 1, chapter: next };
    d.base = { ...remote };
    d.local = next;
  };
  for (let step = 0; step < 30; step++) {
    const d = fleet[Math.floor(random() * fleet.length)]!;
    if (random() < 0.7) d.local = randomEdit(random, d.local);
    else sync(d);
  }
  // Everyone syncs twice: the first round brings each device's edits in, the second takes the
  // result back out.
  for (let round = 0; round < 2; round++) for (const d of fleet) sync(d);
  const converged = fleet.every((d) => isDeepStrictEqual(d.local, remote.chapter));
  return { converged, valid: chapterProblems(remote.chapter).length === 0 };
}

test('random two-device histories converge to a valid chapter', () => {
  for (let seed = 1; seed <= 1500; seed++) {
    const { converged, valid } = history(seed, 2);
    assert.ok(converged, `seed ${seed} diverged`);
    assert.ok(valid, `seed ${seed} invalid`);
  }
});

test('random three-device histories converge to a valid chapter', () => {
  for (let seed = 1; seed <= 600; seed++) {
    const { converged, valid } = history(10_000 + seed, 3);
    assert.ok(converged, `seed ${seed} diverged`);
    assert.ok(valid, `seed ${seed} invalid`);
  }
});

test('re-merging a change that already landed nests the markers: why sync carries commit IDs', () => {
  const base = randomChapter(mulberry32(3), 'Chapter1', { maxDepth: 3 });
  const withComment = (c: Chapter, text: string): Chapter => ({ ...c, root: { ...c.root, comments: [text] } });
  const mine = withComment(base, 'mine');
  const remote = mergeChapter(base, mine, withComment(base, 'other'), { ours: 'a', theirs: 'b' }).chapter;
  // The device's own commit landed but it never heard back, so it merges again from the old base.
  const again = mergeChapter(base, mine, remote, { ours: 'a', theirs: 'b' }).chapter;
  assert.notEqual(again.root.comments[0], remote.root.comments[0]);
  assert.equal((again.root.comments[0]!.match(/<<<<<<</g) ?? []).length, 2);
});
