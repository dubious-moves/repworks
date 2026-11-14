// The Chessnut Move in the app (CHESSNUT.md §4, §6 part (c)): the connection, the link's reducer
// (src/core/board/link.ts) fed with the board's reports, the screen's position and a 100 ms tick,
// the mirror (the one board on the screen the robot follows), the lights, and reconnecting after a
// drop. Made by `createBoardLink` with its clock, its timers and the chooser passed in, so the unit
// tests drive it with a fake board; the app uses `boardLink`, made with the browser's.
import { signal, type ReadonlySignal } from '@preact/signals';
import { boardFenOf, LIGHT, type Battery, type Light, type PieceState, type Squares } from '../core/board/chessnut.ts';
import { differences, missingPieces, onlyLifted, rookMovedFirst, squaresOfFen, turned } from '../core/board/read.ts';
import { lightsFor, type Marks } from '../core/board/lights.ts';
import { initialLink, step, type Action, type Event, type LinkState, type Phase, type Want } from '../core/board/link.ts';
import type { PhysicalBoard } from '../core/board/port.ts';
import { bluetooth, pickBoard } from '../platform/chessnut.ts';
import { boardPrefs, type BoardPrefs } from './boardPrefs.ts';

export type BoardStatus =
  | { state: 'off'; error?: string }
  | { state: 'connecting' }
  /** `castle`: a rook moved first when castling was legal was read as a rook move (said once a page load, until the next move read). */
  | { state: 'on'; name: string; battery?: Battery; phase: Phase; missing?: string[]; wrong?: string[]; castle?: true }
  /** The link dropped: `trying` while the reconnects after 1, 2, 4, 8 and 16 s are under way. */
  | { state: 'lost'; name: string; trying: boolean };

/** What a screen's board hands the link (CHESSNUT.md §4.2): its position and how it is drawn. */
export interface MirrorSpec {
  /** The position shown, a full FEN. */
  fen: string;
  /** The screen's board takes a move now. */
  movable: boolean;
  orientation: 'white' | 'black';
  marks: Marks;
  /** A move read on the board, standard UCI (castling as the king's two squares). */
  onMove(uci: string): void;
  /** A held storm card: the position a take-back by hand returns to, and what it does. */
  undo?: { fen: string; run(): void } | undefined;
  /** Wait this long before driving a new position (the review's stepping). */
  delayMs?: number | undefined;
}

export interface BoardLinkDeps {
  /** The chooser, then the board opened. Throws when nothing is picked or it fails. */
  pick(): Promise<PhysicalBoard>;
  /** Whether this browser has Web Bluetooth at all, and whether it is Brave. */
  hasBluetooth(): boolean;
  isBrave(): boolean;
  now(): number;
  every(ms: number, f: () => void): () => void;
  after(ms: number, f: () => void): () => void;
  /** Calls `f` each time the page becomes visible again; returns the unsubscribe. */
  onVisible(f: () => void): () => void;
  prefs(): BoardPrefs;
}

/** How long a drive may take before the link calls it stuck (ms). */
export const DRIVE_MS = 20_000;
/** A move handed over and refused (the site's position unchanged) is put back after this (ms). */
export const REFUSED_MS = 500;
/** The reconnects after a drop, from the drop (CHESSNUT.md §4.9). */
export const RECONNECT_AFTER_MS = [1000, 2000, 4000, 8000, 16000] as const;
const TICK_MS = 100;
/** A piece's battery under this is named by Check the pieces. */
export const LOW_PIECE_BATTERY = 20;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const BRAVE_FLAG_WORDS = 'Turn on Web Bluetooth: open brave://flags/#brave-web-bluetooth-api, set it to Enabled and relaunch Brave (or use Chrome).';
export const NO_BLUETOOTH_WORDS = 'This browser has no Web Bluetooth: use Chrome or Edge.';
export const BLUETOOTH_OFF_WORDS = 'Turn Bluetooth on (on Android 10, Location too), then Connect again.';

/** A failed connect in plain words (CHESSNUT.md §5.1); undefined when nothing was picked (silent). */
export function connectError(e: unknown, brave: boolean): string | undefined {
  const message = e instanceof Error ? e.message : String(e);
  if (/cancel/i.test(message)) return undefined;
  if (/globally disabled/i.test(message) || (brave && /no web bluetooth/i.test(message))) return BRAVE_FLAG_WORDS;
  if (/no web bluetooth/i.test(message)) return NO_BLUETOOTH_WORDS;
  if (/adapter not available|bluetooth adapter|adapter is off/i.test(message)) return BLUETOOTH_OFF_WORDS;
  return `The board didn't answer: is Chessnut's app still connected to it? (${message})`;
}

/** The pieces worth naming: a low battery, or not on the board. */
export interface PieceCheck {
  low: PieceState[];
  off: PieceState[];
  all: PieceState[];
}

export interface BoardLink {
  readonly status: ReadonlySignal<BoardStatus>;
  /** The board's last report as a board FEN (the dialog's small board). */
  readonly seen: ReadonlySignal<string | undefined>;
  /** Whether a screen's board is mirrored now. */
  readonly mirrored: ReadonlySignal<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Tries to reconnect now (the chip and the dialog while the link is lost). */
  reconnectNow(): Promise<void>;
  /** Called by the mirror hook on every render of a board that opted in (undefined: it stopped). */
  setMirror(owner: object, spec: MirrorSpec | undefined): void;
  /** Set up again: the position wanted driven once more if the board differs. */
  resend(): void;
  /** The start position driven; a screen mirrored waits until its position changes. */
  resetPieces(): void;
  lightsOff(): void;
  battery(): Promise<Battery | undefined>;
  checkPieces(): Promise<PieceCheck | undefined>;
  /** Resolves true when the board shows `fen` (logical), false when it can't (unmakeable, off). */
  reached(fen: string): Promise<boolean>;
  /** The settings changed: the mirror's turn and the lights recomputed. */
  refresh(): void;
  /** Whether the board is linked and in use now (the storm's setup asks). */
  linked(): boolean;
}

export function createBoardLink(deps: BoardLinkDeps): BoardLink {
  const status = signal<BoardStatus>({ state: 'off' });
  const seen = signal<string | undefined>(undefined);
  const mirrored = signal(false);

  let board: PhysicalBoard | undefined;
  let link: LinkState = initialLink();
  /** The boards that opted in, in the order they did: the last one is mirrored. */
  const mirrors = new Map<object, MirrorSpec>();
  /** The spec last applied, and its owner. */
  let applied: { owner: object; spec: MirrorSpec } | undefined;
  /** Reset the pieces: the mirror waits until its position changes. */
  let parkedAt: string | undefined;
  let lastLights = '';
  let stopTicker: (() => void) | undefined;
  let stopVisible: (() => void) | undefined;
  let cancelDelay: (() => void) | undefined;
  let cancelRetry: (() => void) | undefined;
  /** Bumped by each connect and disconnect: a reconnect from an earlier board gives up. */
  let generation = 0;
  let reconnecting = false;
  /** After a reconnect, the first report sends the position again (the board may have changed while off). */
  let resendOnReport = false;
  const waiters = new Set<() => void>();
  /** "Castle with the king first": said once a page load (CHESSNUT.md §4.3), shown until the next move read. */
  let castleSaid = false;
  let castleShown = false;

  const current = (): { owner: object; spec: MirrorSpec } | undefined => {
    let last: { owner: object; spec: MirrorSpec } | undefined;
    for (const [owner, spec] of mirrors) last = { owner, spec };
    return last;
  };
  const turnedFor = (spec: MirrorSpec | undefined): boolean => !!spec && spec.orientation === 'black' && deps.prefs().turnForBlack;
  const wantOf = (spec: MirrorSpec): Want => ({ fen: spec.fen, movable: spec.movable, turned: turnedFor(spec), ...(spec.undo ? { undoFen: spec.undo.fen } : {}) });

  function setStatus(next: BoardStatus): void {
    status.value = next;
    checkWaiters();
  }

  function run(e: Event): void {
    const p = deps.prefs();
    const [next, actions] = step(link, e, { settleMs: p.settleMs, putBackMs: p.putBackMs, driveMs: DRIVE_MS, refusedMs: REFUSED_MS });
    link = next;
    for (const a of actions) act(a);
    showState();
    showLights();
    checkWaiters();
  }

  function act(a: Action): void {
    if (a.t === 'drive') void board?.drive(a.squares);
    else if (a.t === 'move') {
      const spec = applied?.spec;
      castleShown = !castleSaid && !!spec && rookMovedFirst(spec.fen, a.uci);
      if (castleShown) castleSaid = true;
      spec?.onMove(a.uci);
    }
    else if (a.t === 'undo') applied?.spec.undo?.run();
  }

  /** The squares to put right, logical (as the screen names them): a stuck drive's, or a wrong position held. */
  function wrongSquares(): string[] {
    if (!link.target || !link.seen || !link.want) return [];
    const now = deps.now();
    const held = link.seenAt === undefined ? 0 : now - link.seenAt;
    const stuck = link.phase === 'stuck';
    const differing = link.phase === 'synced' && !link.handed && held >= deps.prefs().settleMs && !onlyLifted(link.target, link.seen);
    if (!stuck && !differing) return [];
    const turn = link.want.turned;
    return differences(turn ? turned(link.target) : link.target, turn ? turned(link.seen) : link.seen).map((d) => d.square);
  }

  /** The status's phase, what's missing and the squares to put right, set only when they change. */
  function showState(): void {
    const s = status.peek();
    if (s.state !== 'on') return;
    const missing = link.phase === 'unmakeable' && link.target ? missingPieces(link.target) : undefined;
    const wrong = wrongSquares();
    const next: BoardStatus = { state: 'on', name: s.name, ...(s.battery ? { battery: s.battery } : {}), phase: link.phase, ...(missing ? { missing } : {}), ...(wrong.length ? { wrong } : {}), ...(castleShown ? { castle: true as const } : {}) };
    if (JSON.stringify(next) !== JSON.stringify(s)) status.value = next;
  }

  function showLights(force = false): void {
    if (!board || status.peek().state !== 'on') return;
    const p = deps.prefs();
    const spec = applied && !parkedAt ? applied.spec : undefined;
    const turn = turnedFor(spec);
    const l: Light[] = !p.lights || !spec ? new Array<Light>(64).fill(LIGHT.off) : lightsFor({ ...spec.marks, wrong: wrongSquares() }, { turned: turn, basicOnly: p.basicColours });
    const key = l.join('');
    if (key === lastLights && !force) return;
    lastLights = key;
    void board.lights(l);
  }

  function checkWaiters(): void {
    for (const w of [...waiters]) w();
  }

  /**
   * The mirror's position as the link wants it, after the spec's delay if it has one. `force`:
   * applied even if unchanged (another board mirrored now); `now`: with no delay (a connect, the
   * settings changed, Set up again).
   */
  function apply(force: boolean, now = false): void {
    const next = current();
    const before = applied;
    applied = next;
    mirrored.value = !!next;
    if (!next) {
      cancelDelay?.();
      cancelDelay = undefined;
      parkedAt = undefined;
      if (before) run({ t: 'want', want: undefined, now: deps.now() });
      return;
    }
    const spec = next.spec;
    const was = before?.owner === next.owner ? before.spec : undefined;
    const changed = force || !was || was.fen !== spec.fen || was.movable !== spec.movable || was.orientation !== spec.orientation || was.undo?.fen !== spec.undo?.fen;
    if (parkedAt !== undefined) {
      if (spec.fen === parkedAt && !force) return;
      parkedAt = undefined;
    }
    if (!changed) return showLights();
    cancelDelay?.();
    cancelDelay = undefined;
    const want = wantOf(spec);
    // The review's stepping: only a position stayed on for `delayMs` is driven. Compared by its FEN,
    // as the spec is a new object on every render (the storm renders every 200 ms).
    if (spec.delayMs && !now) {
      const owner = next.owner;
      cancelDelay = deps.after(spec.delayMs, () => {
        cancelDelay = undefined;
        if (applied?.owner === owner && applied.spec.fen === spec.fen) run({ t: 'want', want: wantOf(applied.spec), now: deps.now() });
      });
      showLights();
    } else run({ t: 'want', want, now: deps.now() });
  }

  function onReport(squares: Squares): void {
    seen.value = boardFenOf(squares);
    run({ t: 'report', squares, now: deps.now() });
    if (resendOnReport) {
      resendOnReport = false;
      run({ t: 'resend', now: deps.now() });
    }
  }

  function attach(b: PhysicalBoard): void {
    board = b;
    link = initialLink();
    lastLights = '';
    b.onReport((s) => board === b && onReport(s));
    b.onGone(() => board === b && lost());
    stopTicker?.();
    stopTicker = deps.every(TICK_MS, () => run({ t: 'tick', now: deps.now() }));
    stopVisible?.();
    stopVisible = deps.onVisible(() => {
      if (status.peek().state === 'lost') void reconnectNow();
    });
    setStatus({ state: 'on', name: b.name, phase: link.phase });
    void readBattery();
    // The screen's position, if a board is mirrored already (the latest report came with onReport).
    if (applied) apply(true, true);
    else showLights(true);
  }

  async function readBattery(): Promise<Battery | undefined> {
    const b = board;
    const battery = await b?.battery();
    const s = status.peek();
    if (battery && board === b && s.state === 'on') setStatus({ ...s, battery });
    return battery;
  }

  function lost(): void {
    const s = status.peek();
    const name = s.state === 'on' || s.state === 'lost' ? s.name : (board?.name ?? 'Chessnut Move');
    setStatus({ state: 'lost', name, trying: true });
    const g = generation;
    let i = 0;
    const next = () => {
      cancelRetry?.();
      if (i >= RECONNECT_AFTER_MS.length) {
        const st = status.peek();
        if (st.state === 'lost' && g === generation) setStatus({ ...st, trying: false });
        return;
      }
      const wait = RECONNECT_AFTER_MS[i]! - (i ? RECONNECT_AFTER_MS[i - 1]! : 0);
      i++;
      cancelRetry = deps.after(wait, () => {
        cancelRetry = undefined;
        if (g !== generation || status.peek().state !== 'lost') return;
        void tryReconnect().then((ok) => !ok && g === generation && status.peek().state === 'lost' && next());
      });
    };
    next();
  }

  async function tryReconnect(): Promise<boolean> {
    const b = board;
    if (!b || reconnecting) return false;
    reconnecting = true;
    const g = generation;
    let ok = false;
    try {
      ok = await b.reconnect();
    } finally {
      reconnecting = false;
    }
    if (!ok || g !== generation || board !== b) return false;
    cancelRetry?.();
    cancelRetry = undefined;
    const s = status.peek();
    setStatus({ state: 'on', name: s.state === 'lost' ? s.name : b.name, phase: link.phase });
    lastLights = '';
    // The board may have changed while it was off: the next report sets the position again.
    resendOnReport = true;
    run({ t: 'resend', now: deps.now() });
    showLights(true);
    void readBattery();
    return true;
  }

  async function reconnectNow(): Promise<void> {
    const s = status.peek();
    if (s.state !== 'lost') return;
    setStatus({ ...s, trying: true });
    const ok = await tryReconnect();
    const after = status.peek();
    if (!ok && after.state === 'lost' && !cancelRetry) setStatus({ ...after, trying: false });
  }

  async function connect(): Promise<void> {
    const s = status.peek();
    if (s.state === 'connecting' || s.state === 'on') return;
    if (!deps.hasBluetooth()) {
      setStatus({ state: 'off', error: deps.isBrave() ? BRAVE_FLAG_WORDS : NO_BLUETOOTH_WORDS });
      return;
    }
    const g = ++generation;
    cancelRetry?.();
    cancelRetry = undefined;
    if (board) {
      const old = board;
      board = undefined;
      old.close();
    }
    setStatus({ state: 'connecting' });
    let b: PhysicalBoard;
    try {
      b = await deps.pick();
    } catch (e) {
      if (g !== generation) return;
      const error = connectError(e, deps.isBrave());
      setStatus(error ? { state: 'off', error } : { state: 'off' });
      return;
    }
    if (g !== generation) return b.close();
    attach(b);
  }

  async function disconnect(): Promise<void> {
    generation++;
    cancelRetry?.();
    cancelRetry = undefined;
    stopTicker?.();
    stopTicker = undefined;
    stopVisible?.();
    stopVisible = undefined;
    const b = board;
    board = undefined;
    link = initialLink();
    castleShown = false;
    seen.value = undefined;
    setStatus({ state: 'off' });
    if (b) {
      // Lights off and no drive left running, then the link closed (the queue writes in order).
      void b.lights(new Array<Light>(64).fill(LIGHT.off));
      await b.stopDrive();
      b.close();
    }
  }

  function setMirror(owner: object, spec: MirrorSpec | undefined): void {
    if (!spec) {
      if (!mirrors.delete(owner)) return;
      if (applied?.owner === owner) apply(true);
      return;
    }
    mirrors.set(owner, spec);
    const top = current();
    if (top?.owner !== owner) return;
    apply(applied?.owner !== owner);
  }

  function resend(): void {
    if (parkedAt !== undefined) {
      parkedAt = undefined;
      if (applied) return apply(true, true);
    }
    run({ t: 'resend', now: deps.now() });
  }

  function resetPieces(): void {
    const start = squaresOfFen(START_FEN)!;
    if (applied) {
      // The screen's position waits: driven again once it changes (the next game), or by Set up again.
      parkedAt = applied.spec.fen;
      cancelDelay?.();
      cancelDelay = undefined;
      run({ t: 'want', want: undefined, now: deps.now() });
    }
    void board?.drive(start);
  }

  function lightsOff(): void {
    if (!board) return;
    lastLights = new Array<Light>(64).fill(LIGHT.off).join('');
    void board.lights(new Array<Light>(64).fill(LIGHT.off));
  }

  async function checkPieces(): Promise<PieceCheck | undefined> {
    const all = await board?.pieces();
    if (!all) return undefined;
    return { all, low: all.filter((p) => p.battery < LOW_PIECE_BATTERY), off: all.filter((p) => !p.onBoard) };
  }

  function reached(fen: string): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        const done = (v: boolean) => {
          waiters.delete(check);
          resolve(v);
        };
        if (status.peek().state !== 'on' || link.phase === 'unmakeable') return done(false);
        if (link.phase === 'synced' && link.want?.fen === fen && !!link.seen && !!link.target && link.seen.every((c, s) => c === link.target![s])) done(true);
      };
      waiters.add(check);
      check();
    });
  }

  return {
    status,
    seen,
    mirrored,
    connect,
    disconnect,
    reconnectNow,
    setMirror,
    resend,
    resetPieces,
    lightsOff,
    battery: readBattery,
    checkPieces,
    reached,
    refresh: () => (applied ? apply(true, true) : showLights()),
    linked: () => status.peek().state === 'on',
  };
}

const browserDeps: BoardLinkDeps = {
  pick: () => pickBoard(),
  hasBluetooth: () => !!bluetooth(),
  isBrave: () => typeof navigator !== 'undefined' && 'brave' in navigator,
  now: () => Date.now(),
  every: (ms, f) => {
    const t = setInterval(f, ms);
    return () => clearInterval(t);
  },
  after: (ms, f) => {
    const t = setTimeout(f, ms);
    return () => clearTimeout(t);
  },
  onVisible: (f) => {
    if (typeof document === 'undefined') return () => undefined;
    const on = () => document.visibilityState === 'visible' && f();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  },
  prefs: () => boardPrefs.peek(),
};

/** The app's one link. */
export const boardLink: BoardLink = createBoardLink(browserDeps);
boardPrefs.subscribe(() => boardLink.refresh());

/** Whether the board's chip is offered here: Web Bluetooth, or Brave (to say how to turn it on). */
export const boardOffered = (): boolean => browserDeps.hasBluetooth() || browserDeps.isBrave();
/** Whether the board is linked now (the storm's setup, part (e)). */
export const boardLinked = (): boolean => boardLink.linked();
