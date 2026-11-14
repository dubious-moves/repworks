// The Chessnut Move over Web Bluetooth (src/platform/chessnut.ts, CHESSNUT.md §4.5), against the
// simulated Move (test/e2e/chessnut.ts) in Node: the start order, the reports, a drive with a
// report on its way, the lights, the battery and pieces asked, the write queue's gap, a drop and
// the reconnect with no chooser.
//
// Controls (each run once, 2026-11-14, and each failed this test): `GAP_MS` at 0 (the writes'
// gap); `onReport` not subscribed before START_REPORTS (the first report lost); the reconnect
// without `connect()` (the drive after it refused); `onReport` without the latest report handed to
// a late subscriber (the start report not seen; part (c), 2026-11-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeMove } from '../../e2e/chessnut.ts';
import { boardFenOf, LIGHT, squaresOf, type Squares } from '../../../src/core/board/chessnut.ts';
import { bluetoothMissing, pickBoard, type WriteKind } from '../../../src/platform/chessnut.ts';

type Fake = { hand(f: string): void; position(): string; lights(): number[]; writes(): string[]; drives(): string[]; drop(): void };
const fake = () => (globalThis as unknown as { __move: Fake }).__move;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

test('the platform module against the simulated board', async () => {
  installFakeMove({ driveMs: 200 });
  assert.equal(await bluetoothMissing(), undefined);
  const frames: string[] = [];
  const writes: { bytes: number; kind: WriteKind }[] = [];
  const board = await pickBoard({
    onFrame: (kind, b) => frames.push(`${kind} ${b[0]!.toString(16)} ${b.length}`),
    onWrite: (b, kind) => writes.push({ bytes: b.length, kind }),
  });
  assert.equal(board.name, 'Chessnut Move');
  const seen: string[] = [];
  let gone = 0;
  board.onReport((s: Squares) => seen.push(boardFenOf(s)));
  board.onGone(() => gone++);
  // Reports started (with response), and the board's first report, raw. (Its 0x23 answer comes
  // before the answers are subscribed, in the SDK's order, so it isn't seen.)
  assert.equal(fake().writes()[0], '21 01 00');
  assert.deepEqual(writes[0], { bytes: 3, kind: 'with response' });
  assert.equal(frames[0], 'report 1 38');
  // That first report, sent before anyone subscribed, handed to the subscriber at once: the board
  // reports only on a change, so the app's link (subscribed after the chooser) would not see it.
  assert.equal(seen[0], START);
  // A hand: read at once.
  fake().hand('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  assert.equal(seen.at(-1), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  // A drive: a report on the way, then the position; the 35 bytes written without response.
  assert.equal(await board.drive(squaresOf('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR')!), true);
  assert.deepEqual(writes.at(-1), { bytes: 35, kind: 'without response' });
  await wait(300);
  assert.equal(seen.at(-1), 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
  assert.ok(seen.length >= 3);
  assert.deepEqual(fake().drives(), ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR']);
  // Lights, battery, pieces.
  const l = new Array(64).fill(0);
  l[12] = LIGHT.green; // e2
  await board.lights(l);
  assert.equal(fake().lights()[12], LIGHT.green);
  assert.deepEqual(await board.battery(), { charging: false, percent: 87 });
  const pieces = (await board.pieces())!;
  assert.equal(pieces.length, 34);
  assert.equal(pieces[3]!.battery, 12);
  assert.equal(pieces[16]!.piece, 'K');
  // Writes one at a time, 100 ms apart at least: three sent at once take 200 ms or more.
  const t0 = Date.now();
  await Promise.all([board.stopDrive(), board.stopDrive(), board.stopDrive()]);
  assert.ok(Date.now() - t0 >= 195, `three writes in ${Date.now() - t0} ms`);
  // Gone, then back with no chooser.
  fake().drop();
  assert.equal(gone, 1);
  assert.equal(await board.drive(squaresOf('8/8/8/8/8/8/8/K6k')!), false);
  assert.equal(writes.at(-1)!.kind, 'failed');
  assert.equal(await board.reconnect(), true);
  assert.equal(await board.drive(squaresOf('8/8/8/8/8/8/8/K6k')!), true);
  // Closed by the site: not reported as gone.
  board.close();
  assert.equal(gone, 1);
});

test('no Web Bluetooth, and a chooser closed with nothing picked', async () => {
  const nav = globalThis.navigator as Navigator & { bluetooth?: unknown };
  Object.defineProperty(nav, 'bluetooth', { value: undefined, configurable: true });
  assert.equal(await bluetoothMissing(), 'api');
  await assert.rejects(pickBoard(), /No Web Bluetooth/);
  installFakeMove({ none: true, start: START });
  await assert.rejects(pickBoard(), (e: DOMException) => e.name === 'NotFoundError');
});
