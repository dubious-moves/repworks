// The cloud gather's data and engines (PLAN.md §5.155, scripts/storm): the repertoire and what is
// done read from a data repo's checkout as the app reads them, the cloud's device found or made,
// every device's storm files read and merged, the store's cap, the cloud's own files written back
// (never one it can't read), Maia's ratings taken from the devices', and Stockfish's lanes under
// Node answering as the app's storm engine does.
//
// Controls (each assertion was seen to fail with the code changed, then the change undone):
// - `readShared` taking another device's position as the cloud's own (no `from`): "the other
//   devices' positions come in marked" fails;
// - `ownFileChanges` rewriting a file with an unreadable line: "a file this version can't read" fails;
// - `cloudDevice` ignoring the device named cloud: "the cloud's device is found again" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { STORM } from '../../../src/core/storm/config.ts';
import type { StoredPosition } from '../../../src/core/storm/harvest.ts';
import { positionLine } from '../../../src/core/storm/shared.ts';
import { parsePositionLine } from '../../../src/core/storm/shared.ts';
import { readTree } from '../../../scripts/read-tree.ts';
import { addPositions, cloudDevice, maiaElos, ownFileChanges, readRepertoire, readShared, wholeRepertoire } from '../../../scripts/storm/data.ts';
import { startEngines } from '../../../scripts/storm/engine.ts';

const FIXTURE = join(import.meta.dirname, '..', '..', 'fixtures', 'data-repo');
const DAY = Date.UTC(2026, 10, 6, 12);

/** A stored position at `fen`, gathered at `at`, its list from `src` at `depth`. */
function pos(fen: string, at: number, o: Partial<Pick<StoredPosition, 'src' | 'depth' | 'maia'>> = {}): StoredPosition {
  const line = JSON.stringify({
    v: 1,
    fen,
    side: 'white',
    ply: 2,
    lines: [{ sid: 'Rep0Najd', cid: 'Ch1Najdf', path: ['e4', 'c5'] }],
    names: ['Najdorf'],
    arrived: null,
    scored: [
      { u: 'g1f3', s: 30 },
      { u: 'b1c3', s: 10 },
    ],
    src: o.src ?? 'cdb',
    depth: o.depth ?? 0,
    invented: false,
    unc: null,
    games: 120,
    at,
    ...(o.maia ? { maia: o.maia } : {}),
  });
  return parsePositionLine(line)!;
}
const A = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const B = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const C = 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';

test('the repertoire as the app reads it: the chapters, their lines and line ends; what was answered well is done', () => {
  const files = readTree(FIXTURE);
  const none = readRepertoire(files, DAY, STORM);
  assert.equal(none.chapters.length, 2);
  assert.ok(none.lines.length > 0);
  assert.equal(none.paused, 0);
  assert.equal(none.done.size, 0);
  const scope = wholeRepertoire(none.lines, STORM);
  assert.ok(scope.frontiers.length > 0 && scope.decisions.length > 0);
  // A storm answer, great, from a device's log: done for 60 days.
  const card = `s|${A.split(' ').slice(0, 4).join(' ')}`;
  const more = new Map(files);
  more.set('progress/Phone001/2026-11-06.jsonl', `{"v":1,"n":100,"t":"2026-11-06T10:00:00.000Z","k":"storm","card":"${card}","b":"great","u":"g1f3","wp":0}\n`);
  assert.deepEqual([...readRepertoire(more, DAY, STORM).done], [card]);
  assert.equal(readRepertoire(more, DAY + 61 * 86_400_000, STORM).done.size, 0);
});

test('the cloud’s device is found again by its name, the earliest if several; else made, with an id no device has', () => {
  const files = readTree(FIXTURE);
  const made = cloudDevice(files, () => 0.5, '2026-11-06T12:00:00.000Z');
  assert.match(made.id, /^[A-Za-z0-9]{8}$/);
  assert.ok(!['Phone001', 'Desktop1'].includes(made.id));
  assert.deepEqual(made.file, [`devices/${made.id}.json`, '{ "name": "cloud", "created": "2026-11-06T12:00:00.000Z" }\n']);
  const both = new Map(files);
  both.set('devices/Cloud002.json', '{ "name": "cloud", "created": "2026-11-07T00:00:00.000Z" }\n');
  both.set('devices/Cloud001.json', '{ "name": "cloud", "created": "2026-11-06T00:00:00.000Z" }\n');
  assert.deepEqual(cloudDevice(both, () => 0.5, 'x'), { id: 'Cloud001' });
  // An id taken by a device's files alone is not given again.
  const taken = new Map([['storm/AAAAAAAA/2026-11-06.1.jsonl', '']]);
  let r = 0;
  assert.notEqual(cloudDevice(taken, () => (r++ < 8 ? 0 : 0.5), 'x').id, 'AAAAAAAA');
});

test('the other devices’ positions come in marked with their device; one the cloud has takes the better list and the ratings it lacks', () => {
  const files = new Map<string, string>([
    ['storm/Cloud001/2026-11-05.1.jsonl', positionLine(pos(A, DAY - 86_400_000)) + '\n'],
    ['storm/Desktop1/2026-11-04.1.jsonl', [pos(A, DAY - 2 * 86_400_000, { src: 'sf', depth: 24, maia: [{ elo: 2150, moves: [['g1f3', 0.6]] }] }), pos(B, DAY - 2 * 86_400_000)].map(positionLine).join('\n') + '\n{"v":2}\n'],
  ]);
  const s = readShared(files, 'Cloud001');
  assert.equal(s.positions.size, 2);
  assert.equal(s.theirs, 1);
  const a = s.positions.get(pos(A, 0).card)!;
  assert.equal(a.from, undefined);
  assert.equal(a.src, 'sf');
  assert.equal(a.depth, 24);
  assert.deepEqual(a.maia?.map((r) => r.elo), [2150]);
  assert.equal(s.positions.get(pos(B, 0).card)!.from, 'Desktop1');
  assert.deepEqual([...s.unread], [['storm/Desktop1/2026-11-04.1.jsonl', 1]]);
});

test('the store’s cap: a position kept once; the done first to make room, then the oldest', () => {
  const store = new Map<string, StoredPosition>();
  const a = pos(A, 1);
  const b = pos(B, 2);
  assert.equal(addPositions(store, [a, b, a], 10), 2);
  assert.equal(addPositions(store, [a], 10), 0);
  assert.equal(addPositions(store, [pos(C, 3)], 2, new Set([b.card])), 1);
  assert.deepEqual([...store.keys()].sort(), [a.card, pos(C, 0).card].sort());
  addPositions(store, [b], 2);
  assert.ok(!store.has(a.card), 'the oldest goes');
});

test('the cloud’s own files written back: by day, those changed only, another device’s never; a file this version can’t read is left as it is', () => {
  const own = [pos(A, DAY), pos(B, DAY + 1000)];
  const fresh = ownFileChanges(new Map(), own, 'Cloud001');
  assert.deepEqual([...fresh.keys()], ['storm/Cloud001/2026-11-06.1.jsonl']);
  const theirs = { ...pos(C, DAY), from: 'Desktop1' };
  const files = new Map<string, string>([...fresh].map(([p, t]) => [p, t!]));
  assert.equal(ownFileChanges(files, [...own, theirs], 'Cloud001').size, 0);
  // A file from an earlier day no position is in any more is removed; one with an unknown line stays.
  files.set('storm/Cloud001/2026-11-01.1.jsonl', positionLine(pos(C, DAY - 5 * 86_400_000)) + '\n');
  files.set('storm/Cloud001/2026-11-02.1.jsonl', '{"v":2,"fen":"later"}\n');
  const changes = ownFileChanges(files, own, 'Cloud001');
  assert.deepEqual([...changes], [['storm/Cloud001/2026-11-01.1.jsonl', null]]);
});

test('Maia’s ratings: the ladder, and the ratings beyond it the devices’ positions carry most often; or those given', () => {
  const rated = (elos: number[]) => ({ ...pos(A, 0, { maia: elos.map((elo) => ({ elo, moves: [['g1f3', 1] as [string, number]] })) }), from: 'Desktop1' });
  const ps = [rated([1000, 1400, 1800, 2150, 2200, 2600]), rated([1000, 1400, 1800, 2150, 2200, 2600]), rated([1000, 1400, 1800, 1900, 2200, 2600])];
  assert.deepEqual(maiaElos(ps), [1000, 1400, 1800, 2150, 2200, 2600]);
  assert.deepEqual(maiaElos([]), [1000, 1400, 1800, 2200, 2600]);
  assert.deepEqual(maiaElos(ps, [2000]), [1000, 1400, 1800, 2000, 2200, 2600]);
});

test('Stockfish’s lanes under Node: MultiPV lines to the depth, every root move’s score by depth, two positions at once', async () => {
  const engines = startEngines(2, {});
  try {
    assert.equal(engines.width, 2);
    const [x, y] = await Promise.all([engines.analyse(A, 3, 8, 20_000), engines.analyse(B, 2, 8, 20_000)]);
    assert.ok(x && y);
    assert.equal(x.lines.length, 3);
    assert.equal(y.lines.length, 2);
    assert.ok(x.depth >= 8 && y.depth >= 8);
    const first = x.lines[0]!.pv[0]!;
    assert.ok(x.scores.get(first)?.get(8), 'the best move scored at depth 8');
    // Mate on the board: no search, no answer.
    assert.equal(await engines.analyse('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 1, 8, 5000), null);
  } finally {
    engines.quit();
  }
});
