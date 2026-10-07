// Progress events: one JSON object per line (PLAN.md §4.4). Each device appends to its own
// files only. `n` counts up per device, so (device, n) is unique; `t` is the device's clock.
// Readers skip kinds they don't know, and compaction keeps those lines byte for byte.

/** FSRS grades: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

interface Base {
  v: 1;
  n: number;
  t: string;
}
export interface ReviewEvent extends Base {
  k: 'review';
  card: string;
  g: Grade;
  /** Time to answer, in milliseconds. */
  ms?: number;
  /** The wrong moves tried first, in standard UCI (PLAN.md §5.2). */
  w?: string[];
  /** 1 when a hint was shown. */
  h?: 1;
}
export interface SuspendEvent extends Base {
  k: 'suspend';
  card: string;
}
export interface UnsuspendEvent extends Base {
  k: 'unsuspend';
  card: string;
}
export interface ForgetEvent extends Base {
  k: 'forget';
  card: string;
}
/** A new move shown and played (§5.2): its learning step starts, and the daily limit counts it. */
export interface TaughtEvent extends Base {
  k: 'taught';
  card: string;
}
/** A mistake pinned for drilling (§5.8); pins never touch a card's FSRS state. */
export interface PinEvent extends Base {
  k: 'pin';
  card: string;
}
export interface UnpinEvent extends Base {
  k: 'unpin';
  card: string;
}
/** A drill answer on a pinned card: `ok` when right first time. */
export interface DrillEvent extends Base {
  k: 'drill';
  card: string;
  ok: boolean;
}
/**
 * An alternative move (§5.18, Chessable's): `card` names the move and its position, as a
 * repertoire card does; `on` saves it, `false` removes it. Played where the repertoire's own
 * move is asked, it is taken back for free. It never touches a card's schedule.
 */
export interface AltEvent extends Base {
  k: 'alt';
  card: string;
  on: boolean;
}
/** A storm or set answer's band (§5.41): `unknown` when nothing could grade the move. */
export type StormBand = 'great' | 'good' | 'ok' | 'bad' | 'blunder' | 'unknown';
export const STORM_BANDS: readonly StormBand[] = ['great', 'good', 'ok', 'bad', 'blunder', 'unknown'];
/**
 * A storm answer (§5.41): `card` names the position (`s|<positionKey>`) or the puzzle
 * (`z|<puzzleId>`). Answered well, it is done on every device for 60 days; the record is replayed
 * from these. It never touches a repertoire card.
 */
export interface StormEvent extends Base {
  k: 'storm';
  card: string;
  b: StormBand;
  /** The move played, standard UCI. */
  u?: string;
  /** The win% given up, in tenths. */
  wp?: number;
  /** `set` for a set's first answer (an unhurried one, §21). */
  m?: 'set';
  /** The line's chapter: `<sid>/<cid>`. */
  c?: string;
}
export type KnownEvent = ReviewEvent | SuspendEvent | UnsuspendEvent | ForgetEvent | TaughtEvent | PinEvent | UnpinEvent | DrillEvent | AltEvent | StormEvent;
export const KNOWN_KINDS = ['review', 'suspend', 'unsuspend', 'forget', 'taught', 'pin', 'unpin', 'drill', 'alt', 'storm'] as const;

/** A line as read. `event` is set for the kinds this code knows; `raw` is always the line itself. */
export interface LogLine {
  n: number;
  t: string;
  k: string;
  event?: KnownEvent;
  raw: string;
}

export interface LineProblem {
  /** 1-based line number in the file. */
  line: number;
  text: string;
  reason: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Reads a progress file. A line that won't parse is reported and skipped, never fatal. */
export function parseLog(text: string): { lines: LogLine[]; problems: LineProblem[] } {
  const lines: LogLine[] = [];
  const problems: LineProblem[] = [];
  text.split('\n').forEach((raw, index) => {
    if (raw.trim() === '') return;
    const problem = (reason: string) => problems.push({ line: index + 1, text: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw, reason });
    let o: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return problem('not a JSON object');
      o = value as Record<string, unknown>;
    } catch {
      return problem('not JSON');
    }
    const { n, t, k, v } = o;
    if (!Number.isSafeInteger(n) || (n as number) < 1) return problem('n must be a positive integer');
    if (typeof t !== 'string' || !ISO.test(t)) return problem('t must be a UTC time like 2026-10-05T14:03:12.345Z');
    if (typeof k !== 'string' || k === '') return problem('k must name the kind');
    const line: LogLine = { n: n as number, t, k, raw };
    if (v === 1 && (KNOWN_KINDS as readonly string[]).includes(k)) {
      const event = knownEvent(o);
      if (typeof event === 'string') return problem(event);
      line.event = event;
    }
    lines.push(line);
  });
  return { lines, problems };
}

function knownEvent(o: Record<string, unknown>): KnownEvent | string {
  const card = o['card'];
  if (typeof card !== 'string' || card === '') return 'card must be a card ID';
  const base = { v: 1 as const, n: o['n'] as number, t: o['t'] as string, card };
  switch (o['k']) {
    case 'review': {
      const g = o['g'];
      if (g !== 1 && g !== 2 && g !== 3 && g !== 4) return 'g must be a grade from 1 to 4';
      const ms = o['ms'];
      if (ms !== undefined && (typeof ms !== 'number' || !(ms >= 0))) return 'ms must be a non-negative number';
      const w = o['w'];
      if (w !== undefined && (!Array.isArray(w) || !w.every((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)))) return 'w must be a list of moves in UCI';
      const h = o['h'];
      if (h !== undefined && h !== 1) return 'h must be 1 when present';
      const event: ReviewEvent = { ...base, k: 'review', g };
      if (ms !== undefined) event.ms = ms as number;
      if (w !== undefined) event.w = w as string[];
      if (h !== undefined) event.h = 1;
      return event;
    }
    case 'suspend':
      return { ...base, k: 'suspend' };
    case 'unsuspend':
      return { ...base, k: 'unsuspend' };
    case 'taught':
      return { ...base, k: 'taught' };
    case 'pin':
      return { ...base, k: 'pin' };
    case 'unpin':
      return { ...base, k: 'unpin' };
    case 'drill': {
      const ok = o['ok'];
      if (typeof ok !== 'boolean') return 'ok must be true or false';
      return { ...base, k: 'drill', ok };
    }
    case 'alt': {
      const on = o['on'];
      if (typeof on !== 'boolean') return 'on must be true or false';
      if (!/^r\|[^|]+\|[a-h][1-8][a-h][1-8][qrbn]?$/.test(card)) return 'card must be a move: r|<position>|<uci>';
      return { ...base, k: 'alt', on };
    }
    case 'storm': {
      if (!/^(s\|[^|]+|z\|[A-Za-z0-9]+)$/.test(card)) return 'card must be a storm position (s|<position>) or a puzzle (z|<id>)';
      const b = o['b'];
      if (typeof b !== 'string' || !(STORM_BANDS as readonly string[]).includes(b)) return 'b must be a band: ' + STORM_BANDS.join(', ');
      const event: StormEvent = { ...base, k: 'storm', b: b as StormBand };
      const u = o['u'];
      if (u !== undefined) {
        if (typeof u !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return 'u must be a move in UCI';
        event.u = u;
      }
      const wp = o['wp'];
      if (wp !== undefined) {
        if (!Number.isSafeInteger(wp) || (wp as number) < 0 || (wp as number) > 1000) return 'wp must be tenths of a per cent, 0 to 1000';
        event.wp = wp as number;
      }
      const m = o['m'];
      if (m !== undefined) {
        if (m !== 'set') return 'm must be "set" when present';
        event.m = 'set';
      }
      const c = o['c'];
      if (c !== undefined) {
        if (typeof c !== 'string' || !/^[^/]+\/[^/]+$/.test(c)) return 'c must be <sid>/<cid>';
        event.c = c;
      }
      return event;
    }
    default:
      return { ...base, k: 'forget' };
  }
}

/** One event as a line, keys in a fixed order. */
export function formatEvent(event: KnownEvent): string {
  const o: Record<string, unknown> = { v: 1, n: event.n, t: event.t, k: event.k, card: event.card };
  if (event.k === 'review') {
    o['g'] = event.g;
    if (event.ms !== undefined) o['ms'] = event.ms;
    if (event.w !== undefined) o['w'] = event.w;
    if (event.h !== undefined) o['h'] = event.h;
  }
  if (event.k === 'drill') o['ok'] = event.ok;
  if (event.k === 'alt') o['on'] = event.on;
  if (event.k === 'storm') {
    o['b'] = event.b;
    if (event.u !== undefined) o['u'] = event.u;
    if (event.wp !== undefined) o['wp'] = event.wp;
    if (event.m !== undefined) o['m'] = event.m;
    if (event.c !== undefined) o['c'] = event.c;
  }
  return JSON.stringify(o);
}

/** A file from lines, in the order given, each kept exactly as it was read. */
export function writeLog(lines: readonly { raw: string }[]): string {
  return lines.map((l) => `${l.raw}\n`).join('');
}
