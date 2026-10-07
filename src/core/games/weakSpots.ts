// Weak spots (PLAN.md §5.60), a port of mistake-lab's weak-spots dashboard (`c525403`,
// `WEAKSPOT_CFG`, `weakSpotScore`, `computeHumanWeakSpots`, `computeBotWeakSpots`). The unit is a
// move edge: at a position, an opponent's reply, with the user's score in the games that went
// that way, (W + ½D) / N, weak below 50% over 5 games at least. The human lens reads the real games
// (every visit counts, as mistake-lab's position index does; an edge played in more than half the
// games, once there are 20, is a whole opening and left out; the user's own moves left out); the
// bot lens reads practice results (`practice` events) by position and preset. Worst first, 15 at
// most. Pure.
import type { PositionKey } from '../chess/positionKey.ts';
import type { Ply } from './positions.ts';
import type { Color } from './record.ts';

export const WEAKSPOT = { minGames: 5, maxShare: 0.5, shareGuard: 20, scoreThresh: 0.5, maxRows: 15 } as const;

export const weakSpotScore = (w: number, l: number, d: number) => {
  const n = w + l + d;
  return n ? (w + 0.5 * d) / n : 0;
};

export interface ScoredGame {
  id: string;
  color: Color;
  result: 'win' | 'loss' | 'draw';
  plies: readonly Ply[];
}

export interface HumanSpot {
  key: PositionKey;
  /** A position's FEN with the move (for the board). */
  fen: string;
  san: string;
  uci: string;
  w: number;
  l: number;
  d: number;
  total: number;
  score: number;
  userColor: Color;
}

/** `computeHumanWeakSpots` over the games. */
export function humanWeakSpots(games: readonly ScoredGame[]): HumanSpot[] {
  const edges = new Map<PositionKey, Map<string, { san: string; uci: string; fen: string; w: number; l: number; d: number; white: number; black: number }>>();
  for (const g of games) {
    for (const p of g.plies) {
      let at = edges.get(p.keyBefore);
      if (!at) edges.set(p.keyBefore, (at = new Map()));
      let e = at.get(p.san);
      if (!e) at.set(p.san, (e = { san: p.san, uci: p.uci, fen: p.fenBefore, w: 0, l: 0, d: 0, white: 0, black: 0 }));
      if (g.result === 'win') e.w++;
      else if (g.result === 'loss') e.l++;
      else e.d++;
      if (g.color === 'black') e.black++;
      else e.white++;
    }
  }
  const applyShare = games.length >= WEAKSPOT.shareGuard;
  const shareCap = Math.floor(games.length * WEAKSPOT.maxShare);
  const rows: HumanSpot[] = [];
  for (const [key, moves] of edges) {
    const toMove: Color = key.split(' ')[1] === 'b' ? 'black' : 'white';
    for (const e of moves.values()) {
      const total = e.w + e.l + e.d;
      if (total < WEAKSPOT.minGames) continue;
      if (applyShare && total > shareCap) continue;
      const score = weakSpotScore(e.w, e.l, e.d);
      if (score >= WEAKSPOT.scoreThresh) continue;
      const userColor: Color = e.black > e.white ? 'black' : 'white';
      if (toMove === userColor) continue;
      rows.push({ key, fen: e.fen, san: e.san, uci: e.uci, w: e.w, l: e.l, d: e.d, total, score, userColor });
    }
  }
  rows.sort((a, b) => a.score - b.score || b.total - a.total);
  return rows.slice(0, WEAKSPOT.maxRows);
}

export interface PracticeResult {
  key: PositionKey;
  res: 'win' | 'draw' | 'loss';
  preset?: string;
}

export interface BotSpot {
  key: PositionKey;
  /** The checklist's preset, or `practice`. */
  preset: string;
  w: number;
  l: number;
  d: number;
  total: number;
  score: number;
}

/** `computeBotWeakSpots` over the practice results; `presets` are the checklist's names. */
export function botWeakSpots(results: readonly PracticeResult[], presets: readonly string[]): BotSpot[] {
  const buckets = new Map<string, { key: PositionKey; preset: string; w: number; l: number; d: number }>();
  for (const r of results) {
    const preset = r.preset && presets.includes(r.preset) ? r.preset : 'practice';
    const id = `${r.key}|${preset}`;
    let b = buckets.get(id);
    if (!b) buckets.set(id, (b = { key: r.key, preset, w: 0, l: 0, d: 0 }));
    if (r.res === 'win') b.w++;
    else if (r.res === 'loss') b.l++;
    else b.d++;
  }
  const rows: BotSpot[] = [];
  for (const b of buckets.values()) {
    const total = b.w + b.l + b.d;
    if (total < WEAKSPOT.minGames) continue;
    const score = weakSpotScore(b.w, b.l, b.d);
    if (score >= WEAKSPOT.scoreThresh) continue;
    rows.push({ ...b, total, score });
  }
  rows.sort((a, b) => a.score - b.score || b.total - a.total);
  return rows.slice(0, WEAKSPOT.maxRows);
}
