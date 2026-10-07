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
// Phase 5's kinds (PLAN.md §5.53). Game cards are `m|<pid>` (mistake-lab's pid), plan cards
// `p|<positionKey>`; a dismissed position is `d|<key>`, a practice history entry `h|<id>`, a
// practice result's position `x|<key>`, a checklist line `c|<key>`.

/**
 * A card's FSRS state carried over from mistake-lab (D15): applied only to a card with no review
 * before it, so the site's own reviews win.
 */
export interface SnapshotEvent extends Base {
  k: 'snapshot';
  card: string;
  /** FSRS state: 0 new, 1 learning, 2 review, 3 relearning. */
  st: 0 | 1 | 2 | 3;
  stab: number;
  diff: number;
  reps: number;
  lapses: number;
  /** The interval set at the last review, in days. */
  sched: number;
  /** The last review's time. */
  last: string;
  /** The first review's time, when known (recidivism's transfer credit). */
  first?: string;
}
/** An item taken out of the deck (`on`), or back (`on: false`); with `line`, one tactic line (its UCI moves joined by commas). */
export interface DropEvent extends Base {
  k: 'drop';
  card: string;
  on: boolean;
  line?: string;
}
/** A drilled position missed again in a later game: an Again review at the game's time, once per card and game. */
export interface RelapseEvent extends Base {
  k: 'relapse';
  card: string;
  /** The game's id. */
  g: string;
  /** When the game was played. */
  at: string;
}
/** A plan card enrolled (`on`) or removed, with the side the board is turned to. */
export interface PlanEvent extends Base {
  k: 'plan';
  card: string;
  on: boolean;
  side: 'white' | 'black';
}
/** A position's repertoire deviations ignored (`on`), or shown again. */
export interface DismissEvent extends Base {
  k: 'dismiss';
  card: string;
  on: boolean;
}
/** A practice item made on the site (a sequence, a practice mistake): the item itself, since no game holds it. */
export interface SavedEvent extends Base {
  k: 'saved';
  card: string;
  item: Record<string, unknown>;
}
/** A finished practice game, slim (its start, moves and classifications): the history. */
export interface PlayedEvent extends Base {
  k: 'played';
  card: string;
  game: Record<string, unknown>;
}
/** A practice result at a position: the checklist's `preset` when a drill's. */
export interface PracticeEvent extends Base {
  k: 'practice';
  card: string;
  res: 'win' | 'draw' | 'loss';
  preset?: string;
  /** The final evaluation, White-relative centipawns. */
  cp?: number;
  /** The user's moves played. */
  mv?: number;
}
export type KnownEvent =
  | ReviewEvent
  | SuspendEvent
  | UnsuspendEvent
  | ForgetEvent
  | TaughtEvent
  | PinEvent
  | UnpinEvent
  | DrillEvent
  | AltEvent
  | StormEvent
  | SnapshotEvent
  | DropEvent
  | RelapseEvent
  | PlanEvent
  | DismissEvent
  | SavedEvent
  | PlayedEvent
  | PracticeEvent;
export const KNOWN_KINDS = ['review', 'suspend', 'unsuspend', 'forget', 'taught', 'pin', 'unpin', 'drill', 'alt', 'storm', 'snapshot', 'drop', 'relapse', 'plan', 'dismiss', 'saved', 'played', 'practice'] as const;

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
    case 'snapshot': {
      if (!/^[mp]\|.+$/.test(card)) return 'card must be a game card (m|…) or a plan card (p|…)';
      const st = o['st'];
      if (st !== 0 && st !== 1 && st !== 2 && st !== 3) return 'st must be an FSRS state from 0 to 3';
      const nums: Record<string, number> = {};
      for (const f of ['stab', 'diff', 'reps', 'lapses', 'sched']) {
        const x = o[f];
        if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return `${f} must be a non-negative number`;
        nums[f] = x;
      }
      const last = o['last'];
      if (typeof last !== 'string' || !ISO.test(last)) return 'last must be a UTC time';
      const event: SnapshotEvent = { ...base, k: 'snapshot', st, stab: nums['stab']!, diff: nums['diff']!, reps: nums['reps']!, lapses: nums['lapses']!, sched: nums['sched']!, last };
      const first = o['first'];
      if (first !== undefined) {
        if (typeof first !== 'string' || !ISO.test(first)) return 'first must be a UTC time';
        event.first = first;
      }
      return event;
    }
    case 'drop': {
      const on = o['on'];
      if (typeof on !== 'boolean') return 'on must be true or false';
      const event: DropEvent = { ...base, k: 'drop', on };
      const line = o['line'];
      if (line !== undefined) {
        if (typeof line !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?(,[a-h][1-8][a-h][1-8][qrbn]?)*$/.test(line)) return 'line must be UCI moves joined by commas';
        event.line = line;
      }
      return event;
    }
    case 'relapse': {
      if (!card.startsWith('m|')) return 'card must be a game card (m|…)';
      const g = o['g'];
      if (typeof g !== 'string' || g === '') return 'g must name the game';
      const at = o['at'];
      if (typeof at !== 'string' || !ISO.test(at)) return 'at must be a UTC time';
      return { ...base, k: 'relapse', g, at };
    }
    case 'plan': {
      if (!card.startsWith('p|') || card.length < 3) return 'card must be a plan card (p|<position>)';
      const on = o['on'];
      if (typeof on !== 'boolean') return 'on must be true or false';
      const side = o['side'];
      if (side !== 'white' && side !== 'black') return 'side must be white or black';
      return { ...base, k: 'plan', on, side };
    }
    case 'dismiss': {
      if (!card.startsWith('d|') || card.length < 3) return 'card must be a position (d|<position>)';
      const on = o['on'];
      if (typeof on !== 'boolean') return 'on must be true or false';
      return { ...base, k: 'dismiss', on };
    }
    case 'saved': {
      if (!card.startsWith('m|')) return 'card must be a game card (m|…)';
      const item = o['item'];
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return 'item must be an object';
      return { ...base, k: 'saved', item: item as Record<string, unknown> };
    }
    case 'played': {
      if (!card.startsWith('h|')) return 'card must be a history entry (h|…)';
      const game = o['game'];
      if (typeof game !== 'object' || game === null || Array.isArray(game)) return 'game must be an object';
      return { ...base, k: 'played', game: game as Record<string, unknown> };
    }
    case 'practice': {
      if (!card.startsWith('x|') || card.length < 3) return 'card must be a position (x|<position>)';
      const res = o['res'];
      if (res !== 'win' && res !== 'draw' && res !== 'loss') return 'res must be win, draw or loss';
      const event: PracticeEvent = { ...base, k: 'practice', res };
      const preset = o['preset'];
      if (preset !== undefined) {
        if (typeof preset !== 'string' || preset === '') return 'preset must name the preset';
        event.preset = preset;
      }
      for (const f of ['cp', 'mv'] as const) {
        const x = o[f];
        if (x === undefined) continue;
        if (!Number.isSafeInteger(x)) return `${f} must be an integer`;
        event[f] = x as number;
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
  if (event.k === 'snapshot') {
    Object.assign(o, { st: event.st, stab: event.stab, diff: event.diff, reps: event.reps, lapses: event.lapses, sched: event.sched, last: event.last });
    if (event.first !== undefined) o['first'] = event.first;
  }
  if (event.k === 'drop') {
    o['on'] = event.on;
    if (event.line !== undefined) o['line'] = event.line;
  }
  if (event.k === 'relapse') Object.assign(o, { g: event.g, at: event.at });
  if (event.k === 'plan') Object.assign(o, { on: event.on, side: event.side });
  if (event.k === 'dismiss') o['on'] = event.on;
  if (event.k === 'saved') o['item'] = event.item;
  if (event.k === 'played') o['game'] = event.game;
  if (event.k === 'practice') {
    o['res'] = event.res;
    if (event.preset !== undefined) o['preset'] = event.preset;
    if (event.cp !== undefined) o['cp'] = event.cp;
    if (event.mv !== undefined) o['mv'] = event.mv;
  }
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
