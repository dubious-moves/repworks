// Random histories of 2-3 devices editing, reviewing and syncing through the real sync step and
// a fake remote with git's semantics (PLAN.md §4.9): edits made during a sync, dropped
// connections, 502s, rate limits, and commits that land with their answer lost. Afterwards
// every device holds what the branch holds, every review is in the repo exactly once, and the
// repo is valid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDataRepo } from '../../src/core/data/validate.ts';
import { readProgress } from '../../src/core/progress/files.ts';
import { chapterFileText } from '../../src/core/pgn/write.ts';
import { newChapter } from '../../src/core/study/ops.ts';
import { chapterProblems } from '../../src/core/study/tree.ts';
import { parseStudyMeta, writeStudyMeta } from '../../src/core/study/studyMeta.ts';
import 'fake-indexeddb/auto';
import { chapterOf, World, type Kind, type SimDev } from '../support/syncWorld.ts';
import { mulberry32 } from '../support/random.ts';
import { randomChapter, pick, type Random } from '../support/randomTree.ts';
import { randomEdit } from '../support/randomEdit.ts';

const SID = 'SimStudy';
const META = `studies/${SID}/study.json`;

function seedRepo(random: Random): Map<string, string> {
  const chapters = ['SimChap1', 'SimChap2'].map((id) => randomChapter(random, id, { maxDepth: 4 }));
  const files = new Map<string, string>([
    ['README.md', '# data\n'],
    ['repworks.json', '{ "format": 1 }\n'],
    [META, writeStudyMeta({ format: 1, id: SID, name: 'Sim', kind: 'repertoire', chapters: chapters.map((c) => c.id) })],
  ]);
  for (const c of chapters) files.set(`studies/${SID}/${c.id}.pgn`, chapterFileText(c));
  return files;
}

function chapterPaths(view: ReadonlyMap<string, string>): string[] {
  return [...view.keys()].filter((p) => p.startsWith(`studies/${SID}/`) && /\/[A-Za-z0-9]{8}\.pgn$/.test(p)).sort();
}

/** One random edit on a device: mostly inside a chapter; sometimes a new chapter or a deleted one. */
async function edit(random: Random, dev: SimDev, ids: { next: number }): Promise<void> {
  const view = await dev.view();
  const metaText = view.get(META);
  const meta = metaText === undefined ? undefined : parseStudyMeta(metaText, SID);
  const paths = chapterPaths(view);
  const r = random();
  if (meta?.ok && (r < 0.08 || paths.length === 0)) {
    const id = `New${dev.id.slice(0, 2)}${String(ids.next++).padStart(3, '0')}`;
    const made = newChapter(id, 'Sim', `Chapter ${id}`, random() < 0.5 ? 'white' : 'black');
    if (!made.ok) throw new Error(made.error);
    await dev.edit(`studies/${SID}/${id}.pgn`, chapterFileText(made.value));
    await dev.edit(META, writeStudyMeta({ ...meta.value, chapters: [...meta.value.chapters, id] }));
    return;
  }
  if (meta?.ok && r < 0.12 && paths.length > 1) {
    const path = pick(random, paths);
    const cid = path.slice(path.lastIndexOf('/') + 1, -4);
    await dev.edit(path, null);
    await dev.edit(META, writeStudyMeta({ ...meta.value, chapters: meta.value.chapters.filter((c) => c !== cid) }));
    return;
  }
  if (paths.length === 0) return;
  const path = pick(random, paths);
  const chapter = chapterOf(view.get(path)!, path);
  await dev.edit(path, chapterFileText(randomEdit(random, chapter)));
}

interface Recorded {
  device: string;
  n: number;
  raw: string;
}

/** What the histories went through, so a test can check they exercised the hard cases. */
const exercised = { adopted: 0, conflicts: 0, offline: 0, rate: 0, busy: 0, compacted: 0, editsDuring: 0, pushes: 0 };

async function history(seed: number, devices: number, kind: Kind, storeKind: 'memory' | 'idb' = 'memory'): Promise<void> {
  const random = mulberry32(seed);
  const world = new World(kind, seedRepo(random));
  world.clock.t = Date.parse('2026-09-30T20:00:00.000Z');
  const fleet: SimDev[] = [];
  for (let i = 0; i < devices; i++) fleet.push(await world.simDevice(storeKind, `Sim${i}dev${String(seed % 100).padStart(2, '0')}`.slice(0, 8), `device${i}`, seed * 10 + i));
  const ids = { next: 1 };
  const recorded: Recorded[] = [];
  let adoptedHere = 0;
  world.faults.chaos = { rate: 0.06, random: mulberry32(seed + 7), kinds: [{ kind: 'network' }, { kind: 'lose' }, { kind: 'server' }, { kind: 'rate', retryAfterSec: 60 }] };

  for (let step = 0; step < 36; step++) {
    const dev = pick(random, fleet);
    const r = random();
    if (r < 0.45) await edit(random, dev, ids);
    else if (r < 0.62) {
      const e = await dev.record(new Date(world.clock.t).toISOString(), 'review', `r|k${Math.floor(random() * 4)}|e2e4`, pick(random, [1, 2, 3, 4] as const));
      recorded.push({ device: dev.id, n: e.n, raw: e.raw });
    } else {
      // Sometimes the owner keeps editing while the sync runs.
      let during = random() < 0.35 ? 1 + Math.floor(random() * 2) : 0;
      world.faults.during = async () => {
        if (during > 0 && random() < 0.5) {
          during--;
          exercised.editsDuring++;
          await edit(random, dev, ids);
        }
      };
      const out = await dev.sync(random() < 0.85);
      world.faults.during = undefined;
      if (out.kind === 'error' && out.cause) throw new Error(`seed ${seed}: ${out.message}${out.cause instanceof Error ? `\n${out.cause.stack}` : ''}`);
      adoptedHere += out.adopted;
      exercised.adopted += out.adopted;
      exercised.conflicts += out.conflicts.length;
      if (out.pushed) exercised.pushes++;
      if (out.kind === 'offline') exercised.offline++;
      else if (out.kind === 'rate') exercised.rate++;
      else if (out.kind === 'busy') exercised.busy++;
    }
    world.clock.t += Math.floor(random() * 40) * 60_000;
  }

  // Everyone syncs until nothing is left: the first round brings each device's work in, the
  // second takes the result back out.
  world.faults.chaos = undefined;
  for (let round = 0; round < 2; round++) {
    for (const dev of fleet) {
      const out = await dev.sync();
      assert.equal(out.kind, 'synced', `seed ${seed}: ${JSON.stringify(out)}`);
      adoptedHere += out.adopted;
    }
  }
  // Every commit that landed with its answer lost was found and adopted, not merged again.
  assert.equal(adoptedHere, world.faults.landedLost, `seed ${seed}: lost answers adopted`);
  const head = world.git.textsOf();
  if ([...head.keys()].some((p) => /^progress\/[^/]+\/\d{4}-\d{2}\.jsonl$/.test(p))) exercised.compacted++;
  for (const dev of fleet) {
    assert.deepEqual(await dev.view(), new Map([...head].sort(([a], [b]) => (a < b ? -1 : 1))), `seed ${seed}: ${dev.name} diverged`);
    assert.deepEqual(await dev.leftovers(), { overlay: 0, pending: 0, events: 0 }, `seed ${seed}: ${dev.name} has work left`);
  }
  // Every review, exactly once, byte for byte.
  const { events, problems } = readProgress(head);
  assert.deepEqual(problems, [], `seed ${seed}`);
  const seen = new Map<string, string>();
  for (const e of events) {
    const key = `${e.device}:${e.n}`;
    assert.ok(!seen.has(key), `seed ${seed}: ${key} twice`);
    seen.set(key, e.raw);
  }
  for (const r of recorded) assert.equal(seen.get(`${r.device}:${r.n}`), r.raw, `seed ${seed}: lost ${r.device}:${r.n}`);
  assert.equal(seen.size, recorded.length, `seed ${seed}: events nobody recorded`);
  // The repo is valid, and every chapter is a valid tree.
  const report = validateDataRepo(head);
  assert.deepEqual(report.errors, [], `seed ${seed}`);
  for (const [path, text] of head) {
    if (!/\.pgn$/.test(path)) continue;
    assert.deepEqual(chapterProblems(chapterOf(text, path)), [], `seed ${seed}: ${path}`);
  }
}

test('random two-device histories through the sync step converge, losing no review', async () => {
  for (let seed = 1; seed <= 250; seed++) await history(seed, 2, 'direct');
});

test('random three-device histories through the sync step converge', async () => {
  for (let seed = 1; seed <= 120; seed++) await history(5_000 + seed, 3, 'direct');
});

test('random histories through the REST and GraphQL adapters over the fake GitHub converge', async () => {
  for (let seed = 1; seed <= 25; seed++) {
    await history(9_000 + seed, 2, 'rest');
    await history(9_500 + seed, 2, 'graphql');
  }
});

test('random histories with the IndexedDB store (fake-indexeddb) converge', async () => {
  for (let seed = 1; seed <= 30; seed++) await history(20_000 + seed, seed % 3 === 0 ? 3 : 2, 'direct', 'idb');
});

test('the histories went through lost answers, conflicts, edits during syncs, compaction and failures', () => {
  const e = exercised;
  assert.ok(e.adopted >= 20, `adopted ${e.adopted}`);
  assert.ok(e.conflicts >= 50, `conflicts ${e.conflicts}`);
  assert.ok(e.editsDuring >= 100, `edits during a sync ${e.editsDuring}`);
  assert.ok(e.compacted >= 50, `compacted ${e.compacted}`);
  assert.ok(e.offline >= 50 && e.rate >= 10, `offline ${e.offline}, rate ${e.rate}`);
  console.log(JSON.stringify(e));
});
