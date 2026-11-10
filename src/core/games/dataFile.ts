// The analyzer's games in the data repo (PLAN.md §5.66, §5.163): `games/<YYYY-MM>.jsonl`, the games
// played that UTC month, one compact game a line, oldest first. Written only by the converter
// (`scripts/games-to-data.mjs`, run after mistake-lab's analyzer on its `analyzed_games.json`),
// never by a device; read by every device beside the Gist. A line is the game as the site keeps it
// (`GameRecord`, §5.50) in fewer bytes:
//
//   { "v": 1, "id", "platform", "t" (ms), "speed", "rated", "color" (the user's side),
//     "white": [name, id, rating?], "black": [...], "winner"?, "status", "opening"?, "fen"? (a start
//     that isn't the standard one), "moves": "e4 c5 Nf3 …" (SAN), "evals"?: [cp | "#n" | null, …]
//     (White's side, a ply each), "clocks"?: [seconds | null, …], "tactics"?: [the analyzer's, as
//     the site keeps them] }
//
// About 1 KB a game. A reader skips a line it can't read (and counts it); a month file with such
// a line is never rewritten. Pure.
import type { Color, Eval, GamePlayer, GameRecord, Platform, Tactic, TacticMove } from './record.ts';

export const GAMES_LINE_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** The UTC month a game was played in, YYYY-MM. */
export function gameMonth(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 7);
}

const playerOut = (p: GamePlayer): (string | number)[] => (p.rating === undefined ? [p.name, p.id] : [p.name, p.id, p.rating]);
const evalOut = (e: Eval | null): number | string | null => (!e ? null : 'cp' in e ? e.cp : `#${e.mate}`);

/** A game as a line of its month's file. */
export function gameLine(g: GameRecord): string {
  const o: Record<string, unknown> = {
    v: GAMES_LINE_VERSION,
    id: g.id,
    platform: g.platform,
    t: g.createdAt,
    speed: g.speed,
    rated: g.rated,
    color: g.color,
    white: playerOut(g.white),
    black: playerOut(g.black),
  };
  if (g.winner) o['winner'] = g.winner;
  o['status'] = g.status;
  if (g.opening !== undefined) o['opening'] = g.opening;
  if (g.initialFen !== undefined) o['fen'] = g.initialFen;
  o['moves'] = g.moves.join(' ');
  if (g.evals) o['evals'] = g.evals.map(evalOut);
  if (g.clocks) o['clocks'] = g.clocks;
  if (g.tactics) o['tactics'] = g.tactics;
  return JSON.stringify(o);
}

function playerIn(v: unknown): GamePlayer | null {
  if (!Array.isArray(v) || !isStr(v[0]) || !isStr(v[1]) || v.length > 3 || (v.length === 3 && !isNum(v[2]))) return null;
  const p: GamePlayer = { name: v[0], id: v[1] };
  if (v.length === 3) p.rating = v[2] as number;
  return p;
}

function evalIn(v: unknown): Eval | null | undefined {
  if (v === null) return null;
  if (isNum(v)) return { cp: v };
  if (isStr(v) && /^#-?\d+$/.test(v)) return { mate: Number(v.slice(1)) };
  return undefined;
}

const COLORS = new Set(['white', 'black']);

function tacticMoveIn(v: unknown): TacticMove | null {
  if (!isObj(v) || !isStr(v['uci']) || !isStr(v['san']) || typeof v['user'] !== 'boolean') return null;
  const m: TacticMove = { uci: v['uci'], san: v['san'], user: v['user'] };
  if (v['source'] === 'maia') m.source = 'maia';
  else if (v['source'] !== undefined) return null;
  return m;
}

function tacticIn(v: unknown): Tactic | null {
  if (!isObj(v) || !isNum(v['startPly']) || !isStr(v['fenBefore']) || !COLORS.has(v['color'] as string) || !Array.isArray(v['lines']) || !isNum(v['wpSwing']) || typeof v['found'] !== 'boolean') return null;
  const lines: TacticMove[][] = [];
  for (const l of v['lines']) {
    if (!Array.isArray(l)) return null;
    const moves = l.map(tacticMoveIn);
    if (moves.some((m) => !m)) return null;
    lines.push(moves as TacticMove[]);
  }
  const t: Tactic = { startPly: v['startPly'], fenBefore: v['fenBefore'], color: v['color'] as Color, lines, wpSwing: v['wpSwing'], found: v['found'] };
  for (const k of ['evalBefore', 'evalAfter'] as const) {
    if (v[k] === undefined) continue;
    const e = v[k];
    if (isObj(e) && isNum(e['cp']) && Object.keys(e).length === 1) t[k] = { cp: e['cp'] };
    else if (isObj(e) && isNum(e['mate']) && Object.keys(e).length === 1) t[k] = { mate: e['mate'] };
    else return null;
  }
  return t;
}

/** A line back as a game, or null when it isn't one this version reads. */
export function parseGameLine(line: string): GameRecord | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(o) || o['v'] !== GAMES_LINE_VERSION || !isStr(o['id']) || !o['id']) return null;
  const platform = o['platform'];
  if (platform !== 'lichess' && platform !== 'chesscom') return null;
  if (!isNum(o['t']) || !isStr(o['speed']) || typeof o['rated'] !== 'boolean' || !COLORS.has(o['color'] as string) || !isStr(o['status']) || !isStr(o['moves'])) return null;
  const white = playerIn(o['white']);
  const black = playerIn(o['black']);
  if (!white || !black) return null;
  const g: GameRecord = {
    id: o['id'],
    platform: platform as Platform,
    createdAt: o['t'],
    speed: o['speed'],
    rated: o['rated'],
    color: o['color'] as Color,
    white,
    black,
    status: o['status'],
    moves: o['moves'].split(' ').filter(Boolean),
  };
  if (o['winner'] !== undefined) {
    if (!COLORS.has(o['winner'] as string)) return null;
    g.winner = o['winner'] as Color;
  }
  if (o['opening'] !== undefined) {
    if (!isStr(o['opening'])) return null;
    g.opening = o['opening'];
  }
  if (o['fen'] !== undefined) {
    if (!isStr(o['fen'])) return null;
    g.initialFen = o['fen'];
  }
  if (o['evals'] !== undefined) {
    if (!Array.isArray(o['evals'])) return null;
    const evals = o['evals'].map(evalIn);
    if (evals.some((e) => e === undefined)) return null;
    g.evals = evals as (Eval | null)[];
  }
  if (o['clocks'] !== undefined) {
    if (!Array.isArray(o['clocks']) || !o['clocks'].every((c) => c === null || isNum(c))) return null;
    g.clocks = o['clocks'] as (number | null)[];
  }
  if (o['tactics'] !== undefined) {
    if (!Array.isArray(o['tactics'])) return null;
    const tactics = o['tactics'].map(tacticIn);
    if (tactics.some((t) => !t)) return null;
    g.tactics = tactics as Tactic[];
  }
  return g;
}

/** A month file's games, and how many of its lines this version couldn't read. */
export function parseGamesFile(text: string): { games: GameRecord[]; unread: number } {
  const games: GameRecord[] = [];
  let unread = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const g = parseGameLine(line);
    if (g) games.push(g);
    else unread++;
  }
  return { games, unread };
}

/** A month's file: its games oldest first (by time, then id), one a line. */
export function gamesFileText(games: readonly GameRecord[]): string {
  const sorted = [...games].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.map(gameLine).join('\n') + '\n';
}

export interface GamesFilesPlan {
  /** The month files to write, path → text: those whose games changed. */
  write: Map<string, string>;
  /** Month files left as they are because a line in them can't be read here. */
  unreadable: string[];
  /** Games new to the repo, and games already there whose record changed. */
  added: number;
  changed: number;
}

/**
 * The month files after `incoming` is merged into what the checkout holds (`files`, path → text, the
 * `games/` files at least): a game already kept is replaced by the incoming one with its id, every
 * other game kept, nothing removed (an analyzer file that keeps fewer months loses none). A month is
 * written only when its text changes, and never when it holds a line this version can't read.
 * `pathOf` is the layout's path for a month.
 */
export function planGamesFiles(files: ReadonlyMap<string, string>, incoming: readonly GameRecord[], pathOf: (month: string) => string): GamesFilesPlan {
  const byMonth = new Map<string, GameRecord[]>();
  for (const g of incoming) {
    const m = gameMonth(g.createdAt);
    let list = byMonth.get(m);
    if (!list) byMonth.set(m, (list = []));
    list.push(g);
  }
  const plan: GamesFilesPlan = { write: new Map(), unreadable: [], added: 0, changed: 0 };
  for (const [month, list] of [...byMonth].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const path = pathOf(month);
    const old = files.get(path);
    const kept = new Map<string, GameRecord>();
    if (old !== undefined) {
      const read = parseGamesFile(old);
      if (read.unread) {
        plan.unreadable.push(path);
        continue;
      }
      for (const g of read.games) kept.set(g.id, g);
    }
    let added = 0;
    let changed = 0;
    for (const g of list) {
      const before = kept.get(g.id);
      if (!before) added++;
      else if (gameLine(before) !== gameLine(g)) changed++;
      kept.set(g.id, g);
    }
    const text = gamesFileText([...kept.values()]);
    if (text === old) continue;
    plan.write.set(path, text);
    plan.added += added;
    plan.changed += changed;
  }
  return plan;
}
