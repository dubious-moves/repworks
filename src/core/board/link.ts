// The link (CHESSNUT.md §4.4): what to do with each report from the board, each position the site
// wants shown and each tick of the clock. A reducer: the state and an event in, the next state and
// what to do out. Pure: the time comes in the events.
import { differences, missingPieces, onlyLifted, readMove, squaresOfFen, turned } from './read.ts';
import type { Squares } from './chessnut.ts';

export interface LinkSettings {
  /** A move is read once the board has held it this long (ms). */
  settleMs: number;
  /** A wrong position held this long is put back by the robot (ms). */
  putBackMs: number;
  /** A drive not reached in this long is stuck (ms). */
  driveMs: number;
  /** A move handed to the site that leaves its position as it was (refused) is put back after this (ms). */
  refusedMs: number;
}
export const LINK_DEFAULTS: LinkSettings = { settleMs: 600, putBackMs: 2000, driveMs: 20000, refusedMs: 500 };

/** What the site shows on the board mirrored (one at a time). */
export interface Want {
  /** The position, a full FEN. */
  fen: string;
  /** The user may move now (the screen's board takes a move). */
  movable: boolean;
  /** Set up turned half round (the user plays Black from the near edge). */
  turned: boolean;
  /** The position a move taken back by hand returns to (a storm card's Try again), if any. */
  undoFen?: string;
}

export type Phase = 'idle' | 'driving' | 'synced' | 'stuck' | 'unmakeable';

export interface LinkState {
  want?: Want;
  /** What the board must show for `want` (turned when asked). */
  target?: Squares;
  phase: Phase;
  /** When the drive under way was sent. */
  sentAt?: number;
  /** The board's last report, and when it last changed. */
  seen?: Squares;
  seenAt?: number;
  /** A move handed to the site, and when; cleared when the site's position changes. */
  handed?: { uci: string; at: number };
  /** The report a put-back or a move was last acted on, so one report is acted on once. */
  actedOn?: Squares;
}

export type Action =
  | { t: 'drive'; squares: Squares }
  | { t: 'move'; uci: string }
  | { t: 'undo' }
  | { t: 'phase'; phase: Phase; missing?: string[] };

export type Event =
  | { t: 'want'; want: Want | undefined; now: number }
  | { t: 'report'; squares: Squares; now: number }
  | { t: 'tick'; now: number }
  /** The link came back, or Send again: drive to the position wanted if the board differs. */
  | { t: 'resend'; now: number };

const same = (a: Squares | undefined, b: Squares | undefined): boolean => !!a && !!b && a.every((c, s) => c === b[s]);
const physical = (fen: string, turn: boolean): Squares | undefined => {
  const s = squaresOfFen(fen);
  return s && (turn ? turned(s) : s);
};

export const initialLink = (): LinkState => ({ phase: 'idle' });

export function step(state: LinkState, e: Event, o: LinkSettings = LINK_DEFAULTS): [LinkState, Action[]] {
  const out: Action[] = [];
  let s: LinkState = { ...state };
  const setPhase = (phase: Phase, missing?: string[]) => {
    if (s.phase !== phase) out.push(missing ? { t: 'phase', phase, missing } : { t: 'phase', phase });
    s.phase = phase;
  };
  const drive = (now: number) => {
    out.push({ t: 'drive', squares: s.target! });
    s.sentAt = now;
    s.actedOn = s.seen;
    setPhase('driving');
  };

  if (e.t === 'want') {
    const was = s.want;
    s.want = e.want;
    if (!e.want) {
      const { target: _t, handed: _h, sentAt: _a, ...rest } = s;
      s = { ...rest, want: undefined };
      setPhase('idle');
      return [s, out];
    }
    const target = physical(e.want.fen, e.want.turned);
    if (!target) return [s, out];
    const moved = !same(target, s.target);
    s.target = target;
    if (moved || !was) {
      delete s.handed;
      const missing = missingPieces(target);
      if (missing.length) {
        setPhase('unmakeable', missing);
        return [s, out];
      }
      if (same(s.seen, target)) {
        // The board shows it already: whatever was acted on before is gone from it.
        delete s.actedOn;
        setPhase('synced');
      } else drive(e.now);
    }
    return [s, out];
  }

  if (e.t === 'resend') {
    if (s.target && s.phase !== 'unmakeable' && !same(s.seen, s.target)) drive(e.now);
    return [s, out];
  }

  if (e.t === 'report') {
    if (!same(e.squares, s.seen)) {
      s.seen = e.squares;
      s.seenAt = e.now;
    }
    // A drive is done when the board shows its position; reports on the way are only watched. Once
    // it shows it, the report acted on before is history: the same move made again is new (a held
    // storm card's wrong move played again after the robot took it back).
    if (same(s.seen, s.target)) {
      delete s.actedOn;
      if (s.phase === 'driving' || s.phase === 'stuck') setPhase('synced');
    }
    return [s, out];
  }

  // A tick.
  const now = e.now;
  if (s.phase === 'driving') {
    if (s.sentAt !== undefined && now - s.sentAt >= o.driveMs) setPhase('stuck');
    return [s, out];
  }
  if (s.phase !== 'synced' || !s.want || !s.target || !s.seen || s.seenAt === undefined) return [s, out];
  if (same(s.seen, s.target)) return [s, out];
  // A move handed over that the site turned down (its position unchanged): put back at once.
  if (s.handed && now - s.handed.at >= o.refusedMs && same(s.seen, s.actedOn)) {
    delete s.handed;
    drive(now);
    return [s, out];
  }
  if (s.handed || same(s.seen, s.actedOn)) {
    // Acted on already: wait for the site, or for the hand to change something.
    if (!s.handed && now - s.seenAt >= o.putBackMs && !onlyLifted(s.target, s.seen)) drive(now);
    return [s, out];
  }
  const held = now - s.seenAt;
  if (held < o.settleMs) return [s, out];
  const logical = s.want.turned ? turned(s.seen) : s.seen;
  if (s.want.movable) {
    const uci = readMove(s.want.fen, logical);
    if (uci) {
      s.handed = { uci, at: now };
      s.actedOn = s.seen;
      out.push({ t: 'move', uci });
      return [s, out];
    }
  }
  if (s.want.undoFen) {
    const back = squaresOfFen(s.want.undoFen);
    if (back && same(back, logical)) {
      s.actedOn = s.seen;
      out.push({ t: 'undo' });
      return [s, out];
    }
  }
  // Something put down wrong (not just lifted), held: the robot sets the position again.
  if (held >= o.putBackMs && !onlyLifted(s.target, s.seen)) drive(now);
  return [s, out];
}

export { differences };
