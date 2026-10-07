// The sync step (PLAN.md §4.9) against a fake remote with git's semantics: every test runs
// three times, through the fake remote alone and through the REST and GraphQL adapters over a
// fake GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLog } from '../../../../src/core/progress/events.ts';
import { setComment } from '../../../../src/core/study/ops.ts';
import { nodeAt } from '../../../../src/core/study/tree.ts';
import { chapterOf, CH1, CH2, editChapter, expectSynced, KINDS, World, type Dev } from '../../../support/syncWorld.ts';

const NF3 = ['e4', 'c5', 'Nf3'];
const commentAt = (text: string, path: string[]) => nodeAt(chapterOf(text, CH1), path)!.comments;

async function setUp(kind: (typeof KINDS)[number]) {
  const world = new World(kind);
  const a = world.device('DeskTest', 'desktop', 1);
  const b = world.device('LapTest1', 'laptop', 2);
  expectSynced(await a.sync());
  expectSynced(await b.sync());
  expectSynced(await a.sync());
  return { world, a, b };
}

const converged = (world: World, ...devs: Dev[]) => {
  for (const d of devs) {
    assert.deepEqual(d.store.view(), world.git.textsOf(), `${d.name} matches the head`);
    assert.equal(d.store.overlay.size, 0, `${d.name} has nothing left to push`);
    assert.equal(d.store.base?.commit, world.git.head, `${d.name} is based on the head`);
  }
};

for (const kind of KINDS) {
  test(`${kind}: the first sync clones the repo and adds the device's file`, async () => {
    const world = new World(kind);
    const before = world.git.textsOf();
    const a = world.device('DeskTest', 'desktop');
    const out = expectSynced(await a.sync());
    assert.ok(out.pulled && out.pushed);
    const after = world.git.textsOf();
    assert.deepEqual([...after.keys()].filter((p) => !before.has(p)), ['devices/DeskTest.json']);
    assert.equal(after.get('devices/DeskTest.json'), '{ "name": "desktop", "created": "2026-10-05T12:00:00.000Z" }\n');
    assert.equal(world.git.commits.get(world.git.head)!.message, 'desktop: 1 other file\n\nrepworks-sync: DeskTest:1');
    converged(world, a);
  });

  test(`${kind}: an idle sync is one conditional request, answered 304`, async () => {
    const { world, a } = await setUp(kind);
    const log = world.github.log.length;
    const remote = a.remote as { calls?: { head: number; notModified: number } };
    const heads = remote.calls?.head ?? 0;
    expectSynced(await a.sync());
    if (kind === 'direct') {
      assert.equal(remote.calls!.head - heads, 1);
      assert.equal(remote.calls!.notModified, 1);
    } else assert.deepEqual(world.github.log.slice(log).map((l) => l.status), [304]);
  });

  test(`${kind}: an edit and a review push from one device and pull into the other`, async () => {
    const { world, a, b } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Pushed from the desktop'));
    a.store.record('2026-10-05T12:30:00.000Z', 'review', 'r|x|e2e4', 4);
    const pushed = expectSynced(await a.sync());
    assert.ok(pushed.pushed);
    assert.match(world.git.commits.get(world.git.head)!.message, /^desktop: 1 study file, 1 event\n\nrepworks-sync: DeskTest:\d+$/);
    assert.equal(a.store.events.length, 0, 'uploaded events leave the local log');
    const pulled = expectSynced(await b.sync());
    assert.ok(pulled.pulled && !pulled.pushed);
    assert.deepEqual(commentAt(b.store.view().get(CH1)!, NF3), ['Pushed from the desktop']);
    const day = b.store.view().get('progress/DeskTest/2026-10-05.jsonl')!;
    assert.deepEqual(parseLog(day).lines.map((l) => l.n), [1]);
    converged(world, a, b);
  });

  test(`${kind}: both push; the stale one merges and wins on retry`, async () => {
    const { world, a, b } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'From the desktop'));
    editChapter(b, CH2, (c) => setComment(c, ['e4', 'c5', 'c3'], 'From the laptop'));
    b.store.record('2026-10-05T12:31:00.000Z', 'review', 'r|y|c7c5', 3);
    expectSynced(await a.sync());
    const out = expectSynced(await b.sync());
    assert.ok(out.pulled && out.pushed);
    expectSynced(await a.sync());
    converged(world, a, b);
    assert.deepEqual(commentAt(world.git.textsOf().get(CH1)!, NF3), ['From the desktop']);
    assert.deepEqual(nodeAt(chapterOf(world.git.textsOf().get(CH2)!, CH2), ['e4', 'c5', 'c3'])!.comments, ['From the laptop']);
  });

  test(`${kind}: a comment both devices changed keeps both, between markers named by device`, async () => {
    const { world, a, b } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Desktop text'));
    editChapter(b, CH1, (c) => setComment(c, NF3, 'Laptop text'));
    expectSynced(await a.sync());
    const out = expectSynced(await b.sync());
    assert.deepEqual(out.conflicts, [{ path: CH1, kind: 'text' }]);
    expectSynced(await a.sync());
    converged(world, a, b);
    assert.deepEqual(commentAt(world.git.textsOf().get(CH1)!, NF3), ['<<<<<<< laptop 2026-10-05\nLaptop text\n=======\nDesktop text\n>>>>>>> desktop 2026-10-05']);
  });

  test(`${kind}: edits made during a pull and during a push are kept`, async () => {
    const { world, a, b } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'From the desktop'));
    expectSynced(await a.sync());
    // B edits chapter 2 while its pull fetches the new tree, then chapter 1 while it pushes.
    let step = 0;
    world.faults.during = (op) => {
      if (op === 'files' && step === 0) {
        step++;
        editChapter(b, CH2, (c) => setComment(c, ['e4'], 'Typed during the pull'));
      }
    };
    expectSynced(await b.sync(false));
    assert.deepEqual(commentAt(b.store.view().get(CH1)!, NF3), ['From the desktop']);
    assert.deepEqual(nodeAt(chapterOf(b.store.view().get(CH2)!, CH2), ['e4'])!.comments, ['Typed during the pull']);
    assert.deepEqual([...b.store.overlay.keys()], [CH2]);
    world.faults.during = (op) => {
      if (op === 'commit' && step === 1) {
        step++;
        editChapter(b, CH1, (c) => setComment(c, ['e4'], 'Typed during the push'));
      }
    };
    expectSynced(await b.sync());
    assert.deepEqual([...b.store.overlay.keys()], [CH1], 'the edit made during the push waits for the next one');
    world.faults.during = undefined;
    expectSynced(await b.sync());
    expectSynced(await a.sync());
    converged(world, a, b);
    assert.deepEqual(nodeAt(chapterOf(world.git.textsOf().get(CH1)!, CH1), ['e4'])!.comments, ['Typed during the push']);
  });

  test(`${kind}: a commit whose answer is lost is adopted, not merged again`, async () => {
    const { world, a, b } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Desktop text'));
    editChapter(b, CH1, (c) => setComment(c, NF3, 'Laptop text'));
    b.store.record('2026-10-05T12:40:00.000Z', 'review', 'r|z|d7d6', 2);
    expectSynced(await a.sync());
    // B merges A's commit in (a conflict), commits, and the answer is lost.
    world.faults.on('commit', { kind: 'lose' });
    const lost = await b.sync();
    assert.equal(lost.kind, 'offline');
    assert.equal(b.store.pending.length, 1);
    const landed = world.git.head;
    assert.match(world.git.commits.get(landed)!.message, /repworks-sync: LapTest1:/);
    // B edits again before it hears anything.
    editChapter(b, CH2, (c) => setComment(c, ['e4'], 'After the lost answer'));
    const out = expectSynced(await b.sync());
    assert.equal(out.adopted, 1);
    assert.equal(world.git.commits.get(world.git.head)!.parent, landed, 'the next commit sits on the adopted one');
    expectSynced(await a.sync());
    converged(world, a, b);
    const comment = commentAt(world.git.textsOf().get(CH1)!, NF3)[0]!;
    assert.equal(comment.split('<<<<<<<').length - 1, 1, 'one marker, not nested ones');
    const day = parseLog(world.git.textsOf().get('progress/LapTest1/2026-10-05.jsonl')!).lines;
    assert.deepEqual(day.map((l) => l.n), [1], 'the review is uploaded once');
    assert.equal(b.store.pending.length, 0);
  });

  test(`${kind}: a commit that never landed is sent again`, async () => {
    const { world, a } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Sent twice'));
    const head = world.git.head;
    world.faults.on('commit', { kind: 'network' });
    assert.equal((await a.sync()).kind, 'offline');
    assert.equal(world.git.head, head);
    assert.equal(a.store.pending.length, 1, 'kept until the branch shows what happened');
    expectSynced(await a.sync());
    assert.equal(world.git.commits.get(world.git.head)!.parent, head);
    assert.equal(a.store.pending.length, 0);
    converged(world, a);
  });

  test(`${kind}: 401 keeps local work, and the next sync after a new token pushes it`, async () => {
    const { world, a } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Kept through a 401'));
    a.store.record('2026-10-05T12:50:00.000Z', 'review', 'r|x|e2e4', 1);
    world.faults.set('commit', { kind: 'auth' });
    const out = await a.sync();
    assert.equal(out.kind, 'auth');
    assert.equal(a.store.overlay.size, 1);
    assert.equal(a.store.events.length, 1);
    assert.equal(a.store.pending.length, 0, 'a refused commit is forgotten');
    world.faults.set('commit', undefined).on('head', { kind: 'auth' });
    assert.equal((await a.sync()).kind, 'auth');
    expectSynced(await a.sync());
    converged(world, a);
  });

  test(`${kind}: a rate limit stops the sync with the wait GitHub asks for`, async () => {
    const { world, a } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Waiting for the limit'));
    world.faults.on('commit', { kind: 'rate', retryAfterSec: 120 });
    const out = await a.sync();
    assert.deepEqual(out.kind === 'rate' && out.retryAfterMs, 120_000);
    assert.equal(a.store.overlay.size, 1);
    if (kind !== 'direct') {
      world.faults.on('head', { kind: 'rate', primary: true, retryAfterSec: 600 });
      const primary = await a.sync();
      assert.ok(primary.kind === 'rate' && primary.retryAfterMs! > 590_000 && primary.retryAfterMs! <= 600_000, JSON.stringify(primary));
    }
    expectSynced(await a.sync());
    converged(world, a);
  });

  test(`${kind}: a branch that moves under every commit gives up after five tries, keeping everything`, async () => {
    const { world, a } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Patient'));
    let writes = 0;
    world.faults.during = (op) => {
      if (op === 'commit') world.write(`busy ${++writes}`, new Map([['notes.txt', `${writes}\n`]]));
    };
    const out = await a.sync();
    assert.equal(out.kind, 'busy');
    assert.equal(writes, 5);
    assert.equal(a.store.overlay.size, 1);
    world.faults.during = undefined;
    expectSynced(await a.sync());
    converged(world, a);
  });

  test(`${kind}: a lagging replica's old head is asked again, not merged`, async () => {
    const { world, a } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Just pushed'));
    expectSynced(await a.sync());
    const head = world.git.head;
    world.faults.lagReads = 1;
    const out = expectSynced(await a.sync());
    assert.ok(!out.pulled && !out.pushed);
    assert.equal(world.git.head, head);
    converged(world, a);
  });

  test(`${kind}: a closed month's day files become one month file in one commit, losing no line`, async () => {
    const files = new Map([
      ['repworks.json', '{ "format": 1 }\n'],
      ['devices/DeskTest.json', '{ "name": "desktop", "created": "2026-09-01T00:00:00.000Z" }\n'],
      ['progress/DeskTest/2026-09-29.jsonl', '{"v":1,"n":1,"t":"2026-09-29T10:00:00.000Z","k":"review","card":"r|a|e2e4","g":3}\n{"v":1,"n":2,"t":"2026-09-29T10:01:00.000Z","k":"future","stats":{"solved":2}}\n'],
      ['progress/DeskTest/2026-09-30.jsonl', '{"v":1,"n":3,"t":"2026-09-30T23:59:00.000Z","k":"review","card":"r|a|e2e4","g":4}\n'],
      ['progress/DeskTest/2026-10-01.jsonl', '{"v":1,"n":4,"t":"2026-10-01T08:00:00.000Z","k":"review","card":"r|a|e2e4","g":3}\n'],
    ]);
    const world = new World(kind, files);
    const a = world.device('DeskTest', 'desktop');
    a.store.nextN = 5;
    a.store.record('2026-09-30T23:59:30.000Z', 'review', 'r|b|d7d5', 2); // made offline before midnight
    a.store.record('2026-10-05T12:00:00.000Z', 'review', 'r|b|d7d5', 3);
    const commits = world.git.log().length;
    expectSynced(await a.sync());
    assert.equal(world.git.log().length, commits + 1, 'one commit');
    const after = world.git.textsOf();
    assert.ok(!after.has('progress/DeskTest/2026-09-29.jsonl') && !after.has('progress/DeskTest/2026-09-30.jsonl'));
    const month = parseLog(after.get('progress/DeskTest/2026-09.jsonl')!).lines;
    assert.deepEqual(month.map((l) => l.n), [1, 2, 3, 5]);
    assert.equal(month[1]!.raw, '{"v":1,"n":2,"t":"2026-09-29T10:01:00.000Z","k":"future","stats":{"solved":2}}', 'an unknown kind survives byte for byte');
    assert.deepEqual(parseLog(after.get('progress/DeskTest/2026-10-05.jsonl')!).lines.map((l) => l.n), [6]);
    assert.ok(after.has('progress/DeskTest/2026-10-01.jsonl'), 'the current month stays in day files');
    converged(world, a);
  });

  test(`${kind}: this device's file changed by someone else: every line kept, and reported`, async () => {
    const { world, a } = await setUp(kind);
    a.store.record('2026-10-05T13:00:00.000Z', 'review', 'r|c|g8f6', 3);
    a.store.record('2026-10-05T13:01:00.000Z', 'review', 'r|c|g8f6', 3);
    expectSynced(await a.sync());
    const path = 'progress/DeskTest/2026-10-05.jsonl';
    const [first] = world.git.textsOf().get(path)!.split('\n');
    world.write('someone trimmed it', new Map([[path, `${first}\n{"v":1,"n":9,"t":"2026-10-05T13:05:00.000Z","k":"review","card":"r|c|g8f6","g":1}\n`]]));
    const out = expectSynced(await a.sync());
    assert.deepEqual(out.ownFilesChanged, [path]);
    assert.deepEqual(parseLog(world.git.textsOf().get(path)!).lines.map((l) => l.n), [1, 2, 9]);
    converged(world, a);
  });

  test(`${kind}: a newer data format stops the sync before anything is written`, async () => {
    const { world, a } = await setUp(kind);
    editChapter(a, CH1, (c) => setComment(c, NF3, 'Not written'));
    world.write('format 2', new Map([['repworks.json', '{ "format": 2 }\n']]));
    const head = world.git.head;
    const out = await a.sync();
    assert.equal(out.kind, 'error');
    assert.match(out.kind === 'error' ? out.message : '', /format 2/);
    assert.equal(world.git.head, head);
    assert.equal(a.store.overlay.size, 1);
  });

  test(`${kind}: an empty data repo is a setup error that says what to do`, async () => {
    const world = new World(kind, null);
    const a = world.device('DeskTest', 'desktop');
    const out = await a.sync();
    assert.equal(out.kind, 'error');
    assert.match(out.kind === 'error' ? out.message : '', /empty/);
    if (kind !== 'direct') assert.match(out.kind === 'error' ? out.message : '', /empty: add a README/);
  });

  test(`${kind}: a chapter deleted on one device and edited on the other is kept, marked`, async () => {
    const { world, a, b } = await setUp(kind);
    a.store.edit(CH2, null);
    const meta = JSON.parse(a.store.view().get('studies/Rep0Najd/study.json')!) as { chapters: string[] };
    meta.chapters = meta.chapters.filter((c) => c !== 'Ch2Alapn');
    a.store.edit('studies/Rep0Najd/study.json', `${JSON.stringify(meta, null, 2)}\n`);
    editChapter(b, CH2, (c) => setComment(c, ['e4', 'c5', 'c3'], 'Still needed'));
    expectSynced(await a.sync());
    const out = expectSynced(await b.sync());
    assert.deepEqual(out.conflicts.map((c) => c.kind), ['kept']);
    expectSynced(await a.sync());
    converged(world, a, b);
    const kept = chapterOf(world.git.textsOf().get(CH2)!, CH2);
    assert.ok(kept.root.comments.some((c) => c.startsWith('<<<<<<< kept: deleted on desktop')));
    assert.ok((JSON.parse(world.git.textsOf().get('studies/Rep0Najd/study.json')!) as { chapters: string[] }).chapters.includes('Ch2Alapn'));
  });
}
