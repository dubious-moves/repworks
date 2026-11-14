// The Chessnut Move in the app (src/app/boardLink.ts, CHESSNUT.md §6 part (c)): the connection, the
// mirror, the lights, a drop and the reconnects, Set up again and Reset the pieces, driven with a
// fake board and a clock the test moves. The browser tests (test/e2e/chessnut.spec.ts) drive the
// chip and the dialog against the simulated Move; no screen mirrors a board yet in this part, so
// the mirror is tested here.
//
// Controls (each run once, 2026-11-14, and each failed the named tests):
// - `attach` not applying a mirror set before the connect (`if (applied) apply(true)` gone): "a
//   board mirrored before the connect is set up once linked";
// - the first board mirrored taken, not the last (`current()` keeping its first): "the latest
//   board mirrored wins …";
// - a pending delay neither cancelled by the next position nor checked against the position shown
//   when it ends: "the review's stepping: only the position stayed on is driven";
// - `resendOnReport` never set: "a drop: reconnecting …, the position set again if the board
//   changed while off";
// - `parkedAt` never set by Reset the pieces: "Reset the pieces: the start driven, the screen's
//   position waits …".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardFenOf, LIGHT, squaresOf, type Battery, type Light, type PieceState, type Squares } from '../../../src/core/board/chessnut.ts';
import type { PhysicalBoard } from '../../../src/core/board/port.ts';
import { BLUETOOTH_OFF_WORDS, BRAVE_FLAG_WORDS, createBoardLink, NO_BLUETOOTH_WORDS, type BoardLink, type MirrorSpec } from '../../../src/app/boardLink.ts';
import { DEFAULT_BOARD_PREFS, parseBoardPrefs, type BoardPrefs } from '../../../src/app/boardPrefs.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR';
const E4E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';
const D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR';
const full = (board: string, turn: 'w' | 'b') => `${board} ${turn} KQkq - 0 1`;
const flip = (board: string) => boardFenOf([...squaresOf(board)!].reverse());

class FakeBoard implements PhysicalBoard {
  readonly name = 'Chessnut Move';
  squares: Squares;
  drives: string[] = [];
  lit: Light[][] = [];
  stops = 0;
  closed = false;
  reconnects: boolean[] = [];
  battery_: Battery = { charging: false, percent: 87 };
  pieces_: PieceState[] = [];
  private reportFns: ((s: Squares) => void)[] = [];
  private goneFns: (() => void)[] = [];
  constructor(board = START) {
    this.squares = squaresOf(board)!;
  }
  onReport(f: (s: Squares) => void) {
    this.reportFns.push(f);
    f(this.squares);
  }
  onGone(f: () => void) {
    this.goneFns.push(f);
  }
  /** A hand, or the robot arriving: the board reports `board`. */
  report(board: string) {
    this.squares = squaresOf(board)!;
    for (const f of this.reportFns) f(this.squares);
  }
  /** The robot reaches the last position driven. */
  arrive() {
    this.report(this.drives.at(-1)!);
  }
  drop() {
    for (const f of this.goneFns) f();
  }
  async reconnect() {
    return this.reconnects.shift() ?? true;
  }
  async drive(s: Squares) {
    this.drives.push(boardFenOf(s));
    return true;
  }
  async stopDrive() {
    this.stops++;
    return true;
  }
  async lights(l: readonly Light[]) {
    this.lit.push([...l]);
    return true;
  }
  async battery() {
    return this.battery_;
  }
  async pieces() {
    return this.pieces_;
  }
  close() {
    this.closed = true;
  }
}

/** A clock the test moves, with the timers it runs in order. */
function fakeTime() {
  let now = 1_000_000;
  let id = 0;
  const timers = new Map<number, { at: number; f: () => void; every?: number }>();
  const add = (ms: number, f: () => void, every?: number) => {
    const n = ++id;
    timers.set(n, { at: now + ms, f, ...(every ? { every } : {}) });
    return () => void timers.delete(n);
  };
  return {
    now: () => now,
    every: (ms: number, f: () => void) => add(ms, f, ms),
    after: (ms: number, f: () => void) => add(ms, f),
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let next: [number, { at: number; f: () => void; every?: number }] | undefined;
        for (const t of timers) if (t[1].at <= end && (!next || t[1].at < next[1].at)) next = t;
        if (!next) break;
        now = next[1].at;
        if (next[1].every) next[1].at += next[1].every;
        else timers.delete(next[0]);
        next[1].f();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
const flush = () => new Promise<void>((r) => setImmediate(r));

function setUp(o: { board?: FakeBoard; pick?: () => Promise<PhysicalBoard>; bluetooth?: boolean; brave?: boolean; prefs?: Partial<BoardPrefs> } = {}) {
  const time = fakeTime();
  const board = o.board ?? new FakeBoard();
  const prefs: BoardPrefs = { ...DEFAULT_BOARD_PREFS, ...o.prefs };
  const visible: (() => void)[] = [];
  const link: BoardLink = createBoardLink({
    pick: o.pick ?? (async () => board),
    hasBluetooth: () => o.bluetooth ?? true,
    isBrave: () => o.brave ?? false,
    now: time.now,
    every: time.every,
    after: time.after,
    onVisible: (f) => {
      visible.push(f);
      return () => visible.splice(visible.indexOf(f), 1);
    },
    prefs: () => prefs,
  });
  return { time, board, prefs, link, visible };
}

const spec = (fen: string, o: Partial<MirrorSpec> = {}): MirrorSpec & { moves: string[] } => {
  const moves: string[] = [];
  return { fen, movable: true, orientation: 'white', marks: {}, onMove: (uci) => moves.push(uci), moves, ...o };
};
const phase = (link: BoardLink) => {
  const s = link.status.peek();
  return s.state === 'on' ? s.phase : s.state;
};

test('connect: the board named, its battery, its position as reported, its lights cleared', async () => {
  const { link, board } = setUp();
  assert.equal(link.status.peek().state, 'off');
  await link.connect();
  await flush();
  assert.deepEqual(link.status.peek(), { state: 'on', name: 'Chessnut Move', battery: { charging: false, percent: 87 }, phase: 'idle' });
  assert.equal(link.seen.peek(), START);
  assert.deepEqual(board.lit, [new Array(64).fill(LIGHT.off)]);
  assert.equal(link.linked(), true);
});

test('a failed connect in plain words; nothing picked says nothing', async () => {
  const fails = async (message: string, brave = false) => {
    const { link } = setUp({ brave, pick: () => Promise.reject(new Error(message)) });
    await link.connect();
    return link.status.peek();
  };
  assert.deepEqual(await fails('User cancelled the requestDevice() chooser.'), { state: 'off' });
  assert.deepEqual(await fails('Bluetooth adapter not available.'), { state: 'off', error: BLUETOOTH_OFF_WORDS });
  assert.deepEqual(await fails('Web Bluetooth API globally disabled.', true), { state: 'off', error: BRAVE_FLAG_WORDS });
  const other = await fails('GATT operation failed for unknown reason.');
  assert.ok(other.state === 'off' && /^The board didn’t answer|^The board didn't answer/.test(other.error ?? ''), JSON.stringify(other));
  // No Web Bluetooth at all: Chrome or Edge, or in Brave the flag; the chooser never asked.
  let picked = 0;
  const none = setUp({ bluetooth: false, pick: async () => (picked++, new FakeBoard()) });
  await none.link.connect();
  assert.deepEqual(none.link.status.peek(), { state: 'off', error: NO_BLUETOOTH_WORDS });
  const brave = setUp({ bluetooth: false, brave: true, pick: async () => (picked++, new FakeBoard()) });
  await brave.link.connect();
  assert.deepEqual(brave.link.status.peek(), { state: 'off', error: BRAVE_FLAG_WORDS });
  assert.equal(picked, 0);
});

test('a mirrored board: in step at once when the board shows it; a move by hand read after the window, once; the last move lit blue', async () => {
  const { link, board, time } = setUp();
  await link.connect();
  const owner = {};
  const s = spec(full(START, 'w'));
  link.setMirror(owner, s);
  assert.equal(phase(link), 'synced');
  assert.deepEqual(board.drives, []);
  assert.equal(await link.reached(full(START, 'w')), true);
  board.report(E4);
  await time.advance(500);
  assert.deepEqual(s.moves, []);
  await time.advance(200);
  assert.deepEqual(s.moves, ['e2e4']);
  // The screen's new position, as the move played there gives: the board shows it already,
  // nothing driven; its last move lit.
  link.setMirror(owner, spec(full(E4, 'b'), { movable: false, marks: { lastUci: 'e2e4' } }));
  await time.advance(3000);
  assert.deepEqual(s.moves, ['e2e4']);
  assert.equal(phase(link), 'synced');
  assert.deepEqual(board.drives, []);
  const lit = board.lit.at(-1)!;
  assert.equal(lit[12], LIGHT.blue);
  assert.equal(lit[28], LIGHT.blue);
  assert.equal(lit.filter((l) => l !== LIGHT.off).length, 2);
  // The same position rendered again (the storm renders every 200 ms): nothing sent.
  const sent = board.lit.length;
  link.setMirror(owner, spec(full(E4, 'b'), { movable: false, marks: { lastUci: 'e2e4' } }));
  await time.advance(300);
  assert.equal(board.lit.length, sent);
  assert.deepEqual(board.drives, []);
});

test('a position the board does not show is driven: amber while it goes, in step when the board reports it', async () => {
  const { link, board, time } = setUp();
  await link.connect();
  link.setMirror({}, spec(full(E4E5, 'w')));
  assert.deepEqual(board.drives, [E4E5]);
  assert.equal(phase(link), 'driving');
  let reached: boolean | undefined;
  void link.reached(full(E4E5, 'w')).then((v) => (reached = v));
  // A report on the way is only watched.
  board.report(E4);
  await time.advance(800);
  assert.equal(phase(link), 'driving');
  assert.equal(reached, undefined);
  board.arrive();
  await flush();
  assert.equal(phase(link), 'synced');
  assert.equal(reached, true);
});

test('a board mirrored before the connect is set up once linked', async () => {
  const { link, board } = setUp();
  link.setMirror({}, spec(full(D4, 'b')));
  assert.deepEqual(board.drives, []);
  await link.connect();
  assert.deepEqual(board.drives, [D4]);
});

test('a Black player: the position driven turned, a move read turned back; Black at the far side when asked', async () => {
  const { link, board, time, prefs } = setUp();
  await link.connect();
  const s = spec(full(E4, 'b'), { orientation: 'black' });
  link.setMirror({}, s);
  assert.deepEqual(board.drives, [flip(E4)]);
  board.arrive();
  board.report(flip(E4E5));
  await time.advance(700);
  assert.deepEqual(s.moves, ['e7e5']);
  // The setting off, then the link refreshed (the dialog's change): driven as it is.
  prefs.turnForBlack = false;
  link.refresh();
  assert.deepEqual(board.drives.at(-1), E4);
});

test('the latest board mirrored wins; when it goes, the one before is driven again', async () => {
  const { link, board } = setUp();
  await link.connect();
  const a = {};
  const b = {};
  link.setMirror(a, spec(full(E4, 'b')));
  link.setMirror(b, spec(full(D4, 'b')));
  assert.deepEqual(board.drives, [E4, D4]);
  // The first board's renders change nothing while the second is mirrored.
  link.setMirror(a, spec(full(E4E5, 'w')));
  assert.deepEqual(board.drives, [E4, D4]);
  link.setMirror(b, undefined);
  assert.deepEqual(board.drives, [E4, D4, E4E5]);
  link.setMirror(a, undefined);
  assert.equal(phase(link), 'idle');
  assert.equal(link.mirrored.peek(), false);
});

test("the review's stepping: only the position stayed on is driven", async () => {
  const { link, board, time } = setUp();
  await link.connect();
  const o = {};
  // The first position too: a review opened and stepped at once never sends the robot to and fro.
  link.setMirror(o, spec(full(E4, 'b'), { movable: false, delayMs: 1000 }));
  await time.advance(400);
  link.setMirror(o, spec(full(E4E5, 'w'), { movable: false, delayMs: 1000 }));
  await time.advance(400);
  link.setMirror(o, spec(full(D4, 'b'), { movable: false, delayMs: 1000 }));
  await time.advance(900);
  assert.deepEqual(board.drives, []);
  await time.advance(200);
  assert.deepEqual(board.drives, [D4]);
});

test('a drop: reconnecting after 1, 2, 4 … s, the position set again if the board changed while off', async () => {
  const { link, board, time } = setUp();
  await link.connect();
  link.setMirror({}, spec(full(START, 'w'), { movable: false }));
  board.reconnects = [false, true];
  board.drop();
  assert.deepEqual(link.status.peek(), { state: 'lost', name: 'Chessnut Move', trying: true });
  await time.advance(1000);
  assert.equal(link.status.peek().state, 'lost');
  await time.advance(1000);
  assert.equal(link.status.peek().state, 'on');
  // Its reset button pressed while it was off: the first report after sets the position again.
  board.report(E4);
  await flush();
  assert.deepEqual(board.drives, [START]);
});

test('a drop the board never answers: the tries stop after 16 s; the page shown again, or Reconnect now, tries again', async () => {
  const { link, board, time, visible } = setUp();
  await link.connect();
  board.reconnects = [false, false, false, false, false, false, true];
  board.drop();
  await time.advance(16_000);
  assert.deepEqual(link.status.peek(), { state: 'lost', name: 'Chessnut Move', trying: false });
  assert.equal(board.reconnects.length, 2);
  visible.forEach((f) => f());
  await flush();
  assert.equal(link.status.peek().state, 'lost');
  await link.reconnectNow();
  assert.equal(link.status.peek().state, 'on');
});

test('Disconnect: lights off, no drive left running, the link closed; a drop after it is not a loss', async () => {
  const { link, board, time } = setUp();
  await link.connect();
  link.setMirror({}, spec(full(E4, 'b'), { marks: { lastUci: 'e2e4' } }));
  await link.disconnect();
  assert.deepEqual(board.lit.at(-1), new Array(64).fill(LIGHT.off));
  assert.equal(board.stops, 1);
  assert.equal(board.closed, true);
  assert.deepEqual(link.status.peek(), { state: 'off' });
  assert.equal(link.seen.peek(), undefined);
  board.drop();
  const drives = board.drives.length;
  await time.advance(20_000);
  assert.deepEqual(link.status.peek(), { state: 'off' });
  assert.equal(board.drives.length, drives);
});

test("Reset the pieces: the start driven, the screen's position waits until it changes or Set up again", async () => {
  const { link, board, time } = setUp({ board: new FakeBoard(E4E5) });
  await link.connect();
  const o = {};
  link.setMirror(o, spec(full(E4E5, 'w'), { movable: false }));
  assert.deepEqual(board.drives, []);
  link.resetPieces();
  assert.deepEqual(board.drives, [START]);
  board.arrive();
  await time.advance(5000);
  assert.deepEqual(board.drives, [START]);
  link.setMirror(o, spec(full(E4E5, 'w'), { movable: false }));
  assert.deepEqual(board.drives, [START]);
  link.resend();
  assert.deepEqual(board.drives, [START, E4E5]);
  board.arrive();
  link.resetPieces();
  board.arrive();
  // The next game's position: driven.
  link.setMirror(o, spec(full(D4, 'b'), { movable: false }));
  assert.deepEqual(board.drives, [START, E4E5, START, D4]);
});

test('a drive that never arrives is stuck after 20 s, its squares named and lit red', async () => {
  const { link, board, time } = setUp();
  await link.connect();
  link.setMirror({}, spec(full(E4, 'b'), { movable: false }));
  await time.advance(20_100);
  const s = link.status.peek();
  assert.ok(s.state === 'on');
  assert.equal(s.phase, 'stuck');
  assert.deepEqual(s.wrong, ['e2', 'e4']);
  const lit = board.lit.at(-1)!;
  assert.equal(lit[12], LIGHT.red);
  assert.equal(lit[28], LIGHT.red);
  // Put right by hand: in step.
  board.report(E4);
  await flush();
  assert.equal(phase(link), 'synced');
  assert.equal((link.status.peek() as { wrong?: string[] }).wrong, undefined);
});

test("a position the set can't make: unmakeable, the pieces named, never waited on", async () => {
  const { link, board } = setUp();
  await link.connect();
  const three = 'QQQ1k3/8/8/8/8/8/8/4K3 w - - 0 1';
  link.setMirror({}, spec(three, { movable: false }));
  const s = link.status.peek();
  assert.ok(s.state === 'on');
  assert.equal(s.phase, 'unmakeable');
  assert.deepEqual(s.missing, ['Q']);
  assert.deepEqual(board.drives, []);
  assert.equal(await link.reached(three), false);
});

test('the lights off, or only the basic colours, as set', async () => {
  const { link, board, prefs } = setUp();
  await link.connect();
  link.setMirror({}, spec(full(E4, 'b'), { movable: false, marks: { lastUci: 'e2e4', played: { uci: 'e2e4', brush: 'bandBad' } } }));
  board.arrive();
  assert.equal(board.lit.at(-1)![12], LIGHT.orange);
  prefs.basicColours = true;
  link.refresh();
  assert.equal(board.lit.at(-1)![12], LIGHT.red);
  prefs.lights = false;
  link.refresh();
  assert.deepEqual(board.lit.at(-1), new Array(64).fill(LIGHT.off));
});

test('Check the pieces: those under 20% and those off the board', async () => {
  const board = new FakeBoard();
  board.pieces_ = [
    { piece: 'P', x: 10, y: 10, battery: 12, onBoard: true },
    { piece: 'q', x: 0, y: 0, battery: 90, onBoard: false },
    { piece: 'K', x: 50, y: 10, battery: 70, onBoard: true },
  ];
  const { link } = setUp({ board });
  await link.connect();
  const c = (await link.checkPieces())!;
  assert.deepEqual(
    c.low.map((p) => p.piece),
    ['P'],
  );
  assert.deepEqual(
    c.off.map((p) => p.piece),
    ['q'],
  );
});

test('the settings: kept as stored, each checked; an unknown or out-of-range value is the default', () => {
  assert.deepEqual(parseBoardPrefs(null), DEFAULT_BOARD_PREFS);
  assert.deepEqual(parseBoardPrefs('not json'), DEFAULT_BOARD_PREFS);
  assert.deepEqual(parseBoardPrefs('[1]'), DEFAULT_BOARD_PREFS);
  const p = parseBoardPrefs(JSON.stringify({ lights: false, settleMs: 900, putBackMs: 9000, speak: 'yes', turnForBlack: false }));
  assert.equal(p.lights, false);
  assert.equal(p.settleMs, 900);
  assert.equal(p.putBackMs, DEFAULT_BOARD_PREFS.putBackMs);
  assert.equal(p.speak, false);
  assert.equal(p.turnForBlack, false);
  assert.equal(parseBoardPrefs(JSON.stringify({ settleMs: 200 })).settleMs, 600);
});
