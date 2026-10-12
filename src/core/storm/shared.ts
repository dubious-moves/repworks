// The gathered positions shared through the data repo (PLAN.md §5.102): each device writes the
// positions it gathered itself to `storm/<dev>/<YYYY-MM-DD>.<k>.jsonl` (the UTC day each was
// gathered, at most `SHARE_PER_FILE` to a file), and reads the other devices' files into its own
// store. A position merged into one already kept takes the better Stockfish list and the Maia
// ratings it lacks. Pure.
import { positionKeyOf } from '../chess/positionKey.ts';
import { stormFilePath } from '../data/layout.ts';
import type { StoredPosition } from './harvest.ts';
import type { MaiaRating } from './maia.ts';
import { positionOf } from './walk.ts';

/** Positions to a file: about 1.5 KB each, so a file stays under a megabyte. */
export const SHARE_PER_FILE = 400;

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDayOf = (ms: number) => new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);

/** One position as a line of its file: everything kept but the card and key (the FEN gives both) and where it came from. */
export function positionLine(p: StoredPosition): string {
  const o: Record<string, unknown> = {
    v: 1,
    fen: p.fen,
    side: p.side,
    ply: p.ply,
    lines: p.lines.map((r) => ({ sid: r.sid, cid: r.cid, path: [...r.path] })),
    names: p.names,
    arrived: p.arrived,
    scored: p.scored,
    src: p.src,
    depth: p.depth,
    invented: p.invented,
    unc: p.unc,
    games: p.games,
    at: p.at,
  };
  if (p.maia?.length) o['maia'] = p.maia;
  if (p.kind) o['kind'] = p.kind;
  return JSON.stringify(o);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const KINDS = new Set(['only', 'punish', 'hold', 'convert']);

/** A line back as a position, or null when it isn't one this version reads. */
export function parsePositionLine(line: string): StoredPosition | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(o) || o['v'] !== 1 || !isStr(o['fen'])) return null;
  const pos = positionOf(o['fen']);
  if (!pos) return null;
  const side = o['side'];
  if (side !== 'white' && side !== 'black') return null;
  const lines = o['lines'];
  if (!Array.isArray(lines) || !lines.every((r) => isObj(r) && isStr(r['sid']) && isStr(r['cid']) && Array.isArray(r['path']) && r['path'].every(isStr))) return null;
  const names = o['names'];
  if (!Array.isArray(names) || !names.every(isStr)) return null;
  const scored = o['scored'];
  if (!Array.isArray(scored) || !scored.every((m) => isObj(m) && isStr(m['u']) && isNum(m['s']) && (m['w'] === undefined || isNum(m['w'])))) return null;
  const src = o['src'];
  if (src !== 'cdb' && src !== 'sf') return null;
  if (!isNum(o['ply']) || !isNum(o['depth']) || !isNum(o['at']) || typeof o['invented'] !== 'boolean') return null;
  const arrived = o['arrived'];
  if (arrived !== null && !(isObj(arrived) && isStr(arrived['san']) && isStr(arrived['uci']) && isStr(arrived['before']))) return null;
  const unc = o['unc'];
  if (unc !== null && !(isObj(unc) && isStr(unc['san']) && isNum(unc['share']) && isNum(unc['games']))) return null;
  const games = o['games'];
  if (games !== null && !isNum(games)) return null;
  const maia = o['maia'];
  if (maia !== undefined && !(Array.isArray(maia) && maia.every((r) => isObj(r) && isNum(r['elo']) && Array.isArray(r['moves']) && r['moves'].every((m) => Array.isArray(m) && isStr(m[0]) && isNum(m[1]))))) return null;
  const kind = o['kind'];
  if (kind !== undefined && !(isStr(kind) && KINDS.has(kind))) return null;
  const key = positionKeyOf(pos);
  const out: StoredPosition = {
    card: 's|' + key,
    key,
    fen: o['fen'],
    side,
    ply: o['ply'],
    lines: (lines as { sid: string; cid: string; path: string[] }[]).map((r) => ({ sid: r.sid, cid: r.cid, path: r.path })),
    names: names as string[],
    arrived: arrived === null ? null : { san: arrived['san'] as string, uci: arrived['uci'] as string, before: arrived['before'] as string },
    scored: (scored as Record<string, unknown>[]).map((m) => (m['w'] === undefined ? { u: m['u'] as string, s: m['s'] as number } : { u: m['u'] as string, s: m['s'] as number, w: m['w'] as number })),
    src,
    depth: o['depth'],
    invented: o['invented'],
    unc: unc === null ? null : { san: unc['san'] as string, share: unc['share'] as number, games: unc['games'] as number },
    games,
    at: o['at'],
  };
  if (maia !== undefined) out.maia = (maia as { elo: number; moves: [string, number][] }[]).map((r) => ({ elo: r.elo, moves: r.moves.map((m): [string, number] => [m[0], m[1]]) }));
  if (kind !== undefined) out.kind = kind as NonNullable<StoredPosition['kind']>;
  return out;
}

/** A file's positions, and how many of its lines this version couldn't read. */
export function parseSharedFile(text: string): { positions: StoredPosition[]; unread: number } {
  const positions: StoredPosition[] = [];
  let unread = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const p = parsePositionLine(line);
    if (p) positions.push(p);
    else unread++;
  }
  return { positions, unread };
}

/**
 * The device's files for the positions it gathered itself (those with no `from`): by the UTC day
 * each was stored, in the order they were, `SHARE_PER_FILE` to a file. A position stays in its
 * file as later ones come, so a night's gather leaves the earlier days' files as they were.
 */
export function sharedFiles(positions: readonly StoredPosition[], dev: string): Map<string, string> {
  const days = new Map<string, StoredPosition[]>();
  for (const p of positions) {
    if (p.from) continue;
    const day = utcDayOf(p.at);
    let list = days.get(day);
    if (!list) days.set(day, (list = []));
    list.push(p);
  }
  const out = new Map<string, string>();
  for (const [day, list] of [...days].sort(([a], [b]) => (a < b ? -1 : 1))) {
    list.sort((a, b) => a.at - b.at || (a.card < b.card ? -1 : a.card > b.card ? 1 : 0));
    for (let i = 0; i < list.length; i += SHARE_PER_FILE) {
      out.set(stormFilePath(dev, day, i / SHARE_PER_FILE + 1), list.slice(i, i + SHARE_PER_FILE).map(positionLine).join('\n') + '\n');
    }
  }
  return out;
}

/** Whether list `a` judges better than `b`: Stockfish over ChessDB, then the deeper. */
function betterList(a: Pick<StoredPosition, 'src' | 'depth'>, b: Pick<StoredPosition, 'src' | 'depth'>): boolean {
  if (a.src !== b.src) return a.src === 'sf';
  return a.src === 'sf' && a.depth > b.depth;
}

/** Maia's ratings of both, by rating; `ours` where both have one. */
function unionMaia(ours: readonly MaiaRating[] | undefined, theirs: readonly MaiaRating[] | undefined): MaiaRating[] | undefined {
  if (!theirs?.length) return ours ? [...ours] : undefined;
  const have = new Set((ours ?? []).map((r) => r.elo));
  const extra = theirs.filter((r) => !have.has(r.elo));
  if (!extra.length) return ours ? [...ours] : undefined;
  return [...(ours ?? []), ...extra].sort((a, b) => a.elo - b.elo);
}

/**
 * A position from device `dev`'s file merged into what this device keeps (`local`, or nothing):
 * the position to keep, or null when nothing changes. One not kept here comes in marked `from`;
 * one kept here stays as it is (its `from`, lines and time) but for a better list and the Maia
 * ratings it lacks.
 */
export function mergeShared(local: StoredPosition | undefined, incoming: StoredPosition, dev: string): StoredPosition | null {
  if (!local) return { ...incoming, from: dev };
  let out: StoredPosition | null = null;
  if (betterList(incoming, local)) out = { ...local, scored: incoming.scored, src: incoming.src, depth: incoming.depth };
  const maia = unionMaia(local.maia, incoming.maia);
  if (maia && maia.length !== (local.maia?.length ?? 0)) out = { ...(out ?? local), maia };
  return out;
}
