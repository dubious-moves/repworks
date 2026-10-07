// The puzzle-explorer-data set (PLAN.md §5.47; D12), as lichessable's `content/puzzles.js` reads
// it, which mirrors puzzle-explorer's `lib/posKey.js` and `lib/themes.js`. Pure.
//
//   FEN → positionKey (D10) → SHA-1 → first 3 hex → index/<shard>.json
//       → shard[key] → [[id, rating, colour, ply, startPly, themes], …]
//       → SHA-1(id) first 3 hex → puzzles/<shard>.ndjson → the puzzle's body
//
// Three things are shared with the published set and can't change on this side alone: the key
// (D10's, which the published keys were checked against), the theme list (append-only: a theme's
// code is its index, stamped into every shard) and the shard name's length (3).
// A missing tuple field passes every filter: older shards emit shorter tuples. Themes are the one
// exception (`filterByTheme`).
import { sha1Hex, utf8 } from '../sync/gitHash.ts';

export const SHARD_HEX_LEN = 3;

/** The shard of a position key or a puzzle id. */
export const shardOf = (s: string): string => sha1Hex(utf8(s)).slice(0, SHARD_HEX_LEN);

/** An index entry: id, rating, the colour that solves, the game's ply at the position, the puzzle's start ply, theme codes. */
export type IndexEntry = [string, number?, ('w' | 'b')?, number?, number?, number[]?];

/** A puzzle's body as the set publishes it. `fen` is the solver's position; `moves[0]` is the solver's. */
export interface PuzzleBody {
  id: string;
  fen: string;
  moves: string[];
  previousFen?: string;
  previousMove?: string;
  rating?: number;
  themes?: string[];
  gameUrl?: string;
  opening?: string;
}

const within = (v: unknown, lo: number | undefined, hi: number | undefined) => typeof v !== 'number' || !Number.isFinite(v) || ((lo === undefined || v >= lo) && (hi === undefined || v <= hi));

export const filterByRating = (m: readonly IndexEntry[], lo?: number, hi?: number) => m.filter((e) => within(e[1], lo, hi));
/** The game's ply at the searched position (m[3]): "did the game really play the line" (DESIGN-storm-puzzles.md §3). */
export const filterByPly = (m: readonly IndexEntry[], lo?: number, hi?: number) => m.filter((e) => within(e[3], lo, hi));
/** The ply the puzzle begins at (m[4]). */
export const filterByStartPly = (m: readonly IndexEntry[], lo?: number, hi?: number) => m.filter((e) => within(e[4], lo, hi));
/** Entries the given colour solves; a missing colour passes. */
export const filterByColor = (m: readonly IndexEntry[], color: 'w' | 'b') => m.filter((e) => e[2] === undefined || e[2] === color);

/**
 * OR over theme codes; an empty selection keeps everything. The one place a missing field and an
 * empty one differ: `undefined` (a shard from before themes were stamped) passes, `[]` (stamped,
 * no curated theme) doesn't.
 */
export function filterByTheme(m: readonly IndexEntry[], codes: readonly number[]): IndexEntry[] {
  if (!codes.length) return m.slice();
  const sel = new Set(codes);
  return m.filter((e) => !Array.isArray(e[5]) || e[5].some((c) => sel.has(c)));
}

/** APPEND-ONLY: a theme's code is its index here, as in every published shard. */
export const THEME_LIST = [
  'advancedPawn', 'advantage', 'anastasiaMate', 'arabianMate', 'attackingF2F7',
  'attraction', 'backRankMate', 'bishopEndgame', 'bodenMate', 'capturingDefender',
  'castling', 'clearance', 'crushing', 'defensiveMove', 'deflection',
  'discoveredAttack', 'doubleBishopMate', 'doubleCheck', 'dovetailMate', 'endgame',
  'enPassant', 'equality', 'exposedKing', 'fork', 'hangingPiece',
  'hookMate', 'interference', 'intermezzo', 'kingsideAttack', 'knightEndgame',
  'long', 'master', 'masterVsMaster', 'mate', 'mateIn1',
  'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'middlegame',
  'oneMove', 'opening', 'pawnEndgame', 'pin', 'promotion',
  'queenEndgame', 'queenRookEndgame', 'queensideAttack', 'quietMove', 'rookEndgame',
  'sacrifice', 'short', 'skewer', 'smotheredMate', 'superGM',
  'trappedPiece', 'underPromotion', 'veryLong', 'xRayAttack', 'zugzwang',
] as const;

export const themeCode = (key: string): number => (THEME_LIST as readonly string[]).indexOf(key);
/** A theme for display: `discoveredAttack` → `discovered attack`. */
export const themeLabel = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

/** Ids grouped by the body shard each lives in, so a shard is fetched once (puzzle-explorer's `groupByShard`). */
export function groupByShard(ids: Iterable<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const id of ids) {
    const s = shardOf(id);
    const list = out.get(s);
    if (!list) out.set(s, [id]);
    else if (!list.includes(id)) list.push(id);
  }
  return out;
}

/** An index shard's text, only the wanted keys' entries kept; a shard that won't parse gives nothing. */
export function entriesFor(shardText: string, keys: readonly string[]): Map<string, IndexEntry[]> {
  const out = new Map<string, IndexEntry[]>();
  let json: unknown;
  try {
    json = JSON.parse(shardText);
  } catch {
    return out;
  }
  if (!json || typeof json !== 'object') return out;
  const shard = json as Record<string, unknown>;
  for (const k of keys) {
    const v = shard[k];
    if (Array.isArray(v)) out.set(k, v.filter((e): e is IndexEntry => Array.isArray(e) && typeof e[0] === 'string'));
  }
  return out;
}

/** A body shard's text (ndjson), only the wanted ids' bodies kept; a line that won't parse is skipped. */
export function bodiesFor(shardText: string, ids: readonly string[]): Map<string, PuzzleBody> {
  const want = new Set(ids);
  const out = new Map<string, PuzzleBody>();
  for (const line of shardText.split('\n')) {
    if (!line.trim()) continue;
    // The id comes first in every line: skip the parse of the other ~900.
    const id = /^\{"id":"([^"]+)"/.exec(line)?.[1];
    if (id !== undefined && !want.has(id)) continue;
    try {
      const b = JSON.parse(line) as PuzzleBody;
      if (b && typeof b.id === 'string' && want.has(b.id)) out.set(b.id, b);
    } catch {
      // a broken line costs one puzzle, not the shard
    }
  }
  return out;
}

/** What `meta.json` says that the client needs: the build stamp and the deepest ply indexed. */
export interface DatasetMeta {
  builtAt: string;
  maxEmissionPly: number | undefined;
  shardHexLen: number;
}

export function readMeta(json: unknown): DatasetMeta | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const m = json as { builtAt?: unknown; filteredAt?: unknown; shardHexLen?: unknown; filterStats?: { maxEmissionPly?: unknown } };
  const builtAt = typeof m.filteredAt === 'string' ? m.filteredAt : typeof m.builtAt === 'string' ? m.builtAt : undefined;
  if (!builtAt) return undefined;
  const shardHexLen = typeof m.shardHexLen === 'number' ? m.shardHexLen : SHARD_HEX_LEN;
  const max = m.filterStats?.maxEmissionPly;
  return { builtAt, shardHexLen, maxEmissionPly: typeof max === 'number' ? max : undefined };
}
