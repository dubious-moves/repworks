// Puzzles from the games that played the repertoire's lines (PLAN.md §5.47, §5.48;
// DESIGN-storm-puzzles.md), ported from lichessable's `stormAnchorAdd`, `stormPuzzleCand`,
// `stormPuzzleReady`, `stormPuzzlePlies` and `stormPuzzleUserPlies`. Pure.
//
// - An **anchor** is a position of the repertoire a puzzle may be looked up from: plies 12–24 by
//   default (§3: below the measured cliff a "match" only means the game shared an opening). Band
//   membership is the position's SHALLOWEST ply anywhere in the repertoire, counted in the game
//   (a set-up chapter's positions numbered from its FEN, so a mid-game fragment falls out by
//   itself). The side comes from the line: the colour that solves.
// - A **candidate** is an index entry kept for an anchor: the id, the rating, the game's ply. A
//   puzzle is **ready** once its body is held and replays.
import type { Color } from 'chessops/types';
import type { StormConfig } from '../storm/config.ts';
import type { LineRef, StormLine } from '../storm/sources.ts';
import { fenAfterUci, positionOf, uciToSan } from '../storm/walk.ts';
import { filterByColor, filterByPly, filterByRating, type IndexEntry, type PuzzleBody } from './dataset.ts';

/** A FEN's ply in its game, from its move number and side to move; null when it has none. */
export function pliesBefore(fen: string): number | null {
  const parts = fen.trim().split(/\s+/);
  const full = Number(parts[5]);
  if (!Number.isInteger(full) || full < 1 || (parts[1] !== 'w' && parts[1] !== 'b')) return null;
  return 2 * (full - 1) + (parts[1] === 'b' ? 1 : 0);
}

export interface Anchor {
  key: string;
  fen: string;
  /** The shallowest ply any line reaches it at. */
  ply: number;
  sides: Color[];
  lines: LineRef[];
  names: string[];
}

/** The anchors of the lines given, in the band `[lo, min(hi, maxEmissionPly)]`, deepest first. */
export function anchors(lines: readonly StormLine[], c: StormConfig, maxEmissionPly?: number): Anchor[] {
  const hi = maxEmissionPly === undefined ? c.puzzleAnchorMaxPly : Math.min(c.puzzleAnchorMaxPly, maxEmissionPly);
  const lo = c.puzzleAnchorMinPly;
  // The shallowest ply of every position anywhere, first: a position reached at ply 6 by one line
  // is generic however deep another line reaches it.
  const shallowest = new Map<string, number>();
  const seen = (key: string, fen: string) => {
    const p = pliesBefore(fen);
    if (p === null) return;
    const was = shallowest.get(key);
    if (was === undefined || p < was) shallowest.set(key, p);
  };
  for (const l of lines) {
    for (const p of l.plies) seen(p.key, p.before);
    seen(l.endKey, l.end);
  }
  const out = new Map<string, Anchor>();
  for (const l of lines) {
    const points: [string, string][] = [...l.plies.map((p): [string, string] => [p.key, p.before]), [l.endKey, l.end]];
    for (const [key, fen] of points) {
      const ply = shallowest.get(key);
      if (ply === undefined || ply < lo || ply > hi) continue;
      let a = out.get(key);
      if (!a) out.set(key, (a = { key, fen, ply, sides: [], lines: [], names: [] }));
      if (!a.sides.includes(l.side)) a.sides.push(l.side);
      if (a.lines.length < 4 && !a.lines.some((r) => r.sid === l.sid && r.cid === l.cid)) a.lines.push({ sid: l.sid, cid: l.cid, path: l.path });
      if (a.names.length < 3 && !a.names.includes(l.name)) a.names.push(l.name);
    }
  }
  return [...out.values()].sort((a, b) => b.ply - a.ply || (a.key < b.key ? -1 : 1));
}

/** A candidate: an index entry kept for an anchor. */
export interface PuzzleCandidate {
  id: string;
  rating: number | null;
  /** The colour that solves. */
  color: 'w' | 'b';
  /** The game's ply at the anchor, and the ply the puzzle starts at. */
  ply: number | null;
  startPly: number | null;
  /** The anchor's key and its first line's chapter (`<sid>/<cid>`) and name. */
  anchor: string;
  chapter: string;
  name: string;
}

/**
 * An anchor's entries to keep (§4): the colours its lines solve for, the game's ply in the band,
 * the rating band, none already held; then at random (never top-rated first: the set keeps the top
 * 2000 by rating at popular positions, a truncation, not a quality), at most `perAnchor`.
 */
export function selectEntries(entries: readonly IndexEntry[], a: Anchor, c: StormConfig, held: (id: string) => boolean, rnd: () => number, maxEmissionPly?: number): PuzzleCandidate[] {
  const hi = maxEmissionPly === undefined ? c.puzzleAnchorMaxPly : Math.min(c.puzzleAnchorMaxPly, maxEmissionPly);
  let pool: IndexEntry[] = [];
  for (const side of a.sides) pool.push(...filterByColor(entries, side === 'white' ? 'w' : 'b'));
  pool = filterByRating(filterByPly(pool, c.puzzleAnchorMinPly, hi), c.puzzleRatingMin, c.puzzleRatingMax);
  const seen = new Set<string>();
  const picked = pool.filter((e) => !seen.has(e[0]) && (seen.add(e[0]), !held(e[0])));
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  const first = a.lines[0];
  return picked.slice(0, c.puzzlesPerAnchor).map((e) => ({
    id: e[0],
    rating: typeof e[1] === 'number' ? e[1] : null,
    color: e[2] === 'b' ? 'b' : 'w',
    ply: typeof e[3] === 'number' ? e[3] : null,
    startPly: typeof e[4] === 'number' ? e[4] : null,
    anchor: a.key,
    chapter: first ? `${first.sid}/${first.cid}` : '',
    name: a.names[0] ?? '',
  }));
}

export interface PuzzlePly {
  san: string;
  uci: string;
  color: Color;
  /** The position after the move. */
  fen: string;
}

/**
 * A body's moves replayed from its FEN: the solver moves first (`moves[0]` is the solver's, never
 * the opponent's set-up move as in Lichess's raw CSV); null when any move doesn't replay.
 */
export function puzzlePlies(body: Pick<PuzzleBody, 'fen' | 'moves'>): PuzzlePly[] | null {
  if (!body.fen || !Array.isArray(body.moves) || !body.moves.length) return null;
  let fen = body.fen;
  const out: PuzzlePly[] = [];
  for (const uci of body.moves) {
    const pos = positionOf(fen);
    if (typeof uci !== 'string' || !pos) return null;
    const san = uciToSan(pos, uci);
    const after = san ? fenAfterUci(fen, uci) : undefined;
    if (!after) return null;
    out.push({ san, uci, color: pos.turn, fen: after });
    fen = after;
  }
  return out;
}

/** The moves the solver plays. */
export const userPlies = (plies: readonly PuzzlePly[], solver: Color): number => plies.filter((p) => p.color === solver).length;

/** A puzzle ready to deal: its body, replayed, and where it came from. */
export interface ReadyPuzzle {
  id: string;
  fen: string;
  plies: PuzzlePly[];
  solver: Color;
  rating: number | null;
  themes: string[];
  /** The opponent's move that made the position, and the position before it. */
  previousMove: string;
  previousFen: string;
  gameUrl: string;
  /** How deep the game went into the line, its chapter and name. */
  gamePly: number | null;
  chapter: string;
  name: string;
}

export function readyPuzzle(body: PuzzleBody, cand: PuzzleCandidate): ReadyPuzzle | null {
  if (!body || body.id !== cand.id) return null;
  const plies = puzzlePlies(body);
  const pos = positionOf(body.fen);
  if (!plies || !pos) return null;
  return {
    id: body.id,
    fen: body.fen,
    plies,
    solver: pos.turn,
    rating: typeof body.rating === 'number' ? body.rating : cand.rating,
    themes: Array.isArray(body.themes) ? body.themes.slice(0, 6) : [],
    previousMove: body.previousMove ?? '',
    previousFen: body.previousFen ?? '',
    gameUrl: body.gameUrl ?? '',
    gamePly: cand.ply,
    chapter: cand.chapter,
    name: cand.name,
  };
}
