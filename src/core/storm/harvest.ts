// The storm's producer (PLAN.md §5.42), lichessable's `harvestFrontier` and `harvestUncovered`
// (DESIGN-intuition-storm.md §4, §14.5, §19, §26.4) with every request injected. Pure: the
// explorer, the game exports, ChessDB and Stockfish come in as `HarvestIo`.
//
//   askGames(frontier)
//    |- no games (or no login) -> the engine scores it: the band, then the invented line
//    |- games                  -> hybrid (ChessDB, the engine on a miss): the band, then the walks
//
// A frontier is rejected for one request when its eval is out of the band (§7, stage 0). A
// position is stored once (keyed), with every scored move kept (§14.11: the grade must find the
// user's move in the list).
import type { Color } from 'chessops/types';
import type { PositionKey } from '../chess/positionKey.ts';
import type { ChessdbAnswer } from '../explorer/search.ts';
import type { EngineLine } from '../engine/search.ts';
import type { StormConfig } from './config.ts';
import { moverCp, userEval, type ScoredList, type ScoredMove } from './grade.ts';
import { gamesFromPgn } from './games.ts';
import type { Coverage, DecisionPoint, ExplorerReply, Frontier, LineRef } from './sources.ts';
import { uncoveredMoves } from './sources.ts';
import { candidate, fenAfterUci, pickGames, positionOf, randomLine, walkGame, type Arrival, type Ask, type Candidate } from './walk.ts';
import { positionKeyOf } from '../chess/positionKey.ts';

/** ChessDB's answer as a scored list: its scored moves only, best first; null when it knows nothing. */
export function cdbList(a: ChessdbAnswer | null | undefined): ScoredList | null {
  if (!a || a.status !== 'ok' || !a.moves) return null;
  const moves: ScoredMove[] = a.moves.filter((m) => Number.isFinite(m.score)).map((m) => ({ uci: m.uci, san: m.san, score: m.score }));
  if (!moves.length) return null;
  moves.sort((x, y) => y.score - x.score);
  return Object.assign(moves, { source: 'cdb' as const });
}

/** The engine's MultiPV lines as a scored list from the mover's side, best first. */
export function engineList(lines: readonly EngineLine[], turn: Color, depth: number, c: StormConfig): ScoredList | null {
  const moves: ScoredMove[] = [];
  for (const l of lines) {
    const uci = l.pv[0];
    const score = moverCp(l.score, turn, c);
    if (!uci || score === null) continue;
    moves.push({ uci, score });
  }
  if (!moves.length) return null;
  moves.sort((x, y) => y.score - x.score);
  return Object.assign(moves, { source: 'sf' as const, depth });
}

export interface HarvestIo {
  /** The explorer at the storm's filter: its moves and the games it names; null without a login or on an error. */
  explorer(fen: string): Promise<{ total: number; moves: ExplorerReply[]; gameIds: string[] } | null>;
  /** Lichess games by id, as PGN text ('' when the export fails). */
  pgns(ids: string[]): Promise<string>;
  /** ChessDB: the list, `null` when it doesn't know the position, `'error'` when it didn't answer. */
  cdb(fen: string): Promise<ScoredList | null | 'error'>;
  /** Stockfish: MultiPV `lines` to `depth`, from the mover's side; null when it can't. */
  engine(fen: string, lines: number, depth: number): Promise<ScoredList | null>;
  rnd(): number;
}

export interface Harvest {
  candidates: Candidate[];
  /** Why each walk stopped, counted (lichessable's funnel, §14.17). */
  stops: Record<string, number>;
  /** The frontier's own refusal, if any. */
  refused?: string;
  /** The explorer's games at the frontier: how often the line is reached (§14.19). */
  games?: number;
}

/**
 * The walk's scorer (§26.2): ChessDB first, Stockfish on a miss, never on a transport failure
 * (that is the network, not the position). With `engineOnly`, Stockfish alone.
 */
export function scorer(io: HarvestIo, c: StormConfig, engineOnly: boolean): Ask {
  return async (fen) => {
    if (!engineOnly) {
      const l = await io.cdb(fen);
      if (l === 'error') return null;
      if (l) return l;
    }
    return io.engine(fen, c.walkMultipv, c.walkDepth);
  };
}

const bump = (stops: Record<string, number>, why: string) => (stops[why] = (stops[why] || 0) + 1);

/** A frontier's positions (§4 stages 0–3). `games`: how many to walk (2 in a session, 4 in a gather). */
export async function harvestFrontier(f: Frontier, cont: Coverage, io: HarvestIo, c: StormConfig, games: number): Promise<Harvest> {
  const out: Harvest = { candidates: [], stops: {} };
  const covered = cont[f.side];
  const found = await io.explorer(f.fen);
  if (found) out.games = found.total;
  const ids = found?.gameIds || [];
  const ask = scorer(io, c, ids.length === 0);
  // Stage 0: the band, one request for the whole line.
  const first = await ask(f.fen);
  const pos = positionOf(f.fen);
  if (!first || !first.length || !pos) {
    out.refused = 'nothing could score the line’s end';
    return out;
  }
  const ev = userEval(first[0]!.score, pos.turn, f.side);
  if (ev < c.userLoCp || ev > c.userHiCp) {
    out.refused = ev < c.userLoCp ? 'the line ends losing' : 'the line ends already winning';
    return out;
  }
  if (!ids.length) {
    const seed: Arrival = { san: f.lastSan, uci: f.lastUci, before: f.lastFen };
    const w = await randomLine(f.fen, f.side, ask, c, io.rnd, seed, covered);
    bump(out.stops, w.stop);
    out.candidates.push(...w.out);
    return out;
  }
  const picked = pickGames(ids, games, io.rnd);
  const text = await io.pgns(picked);
  for (const g of gamesFromPgn(text)) {
    const w = await walkGame(f.fen, f.side, g.sans, ask, c, covered);
    bump(out.stops, w.stop);
    out.candidates.push(...w.out);
  }
  return out;
}

/** The uncovered replies' positions at a decision point (§19): one explorer request, one score each. */
export async function harvestDecision(d: DecisionPoint, io: HarvestIo, c: StormConfig): Promise<Harvest & { replies: { san: string; share: number; games: number }[] }> {
  const out: Harvest & { replies: { san: string; share: number; games: number }[] } = { candidates: [], stops: {}, replies: [] };
  const found = await io.explorer(d.fen);
  if (!found) {
    out.refused = 'the explorer didn’t answer';
    return out;
  }
  const gaps = uncoveredMoves(d, found.moves, found.total, c);
  const ask = scorer(io, c, false);
  const pos = positionOf(d.fen);
  for (const g of gaps) {
    const fen = fenAfterUci(d.fen, g.uci);
    const after = fen && positionOf(fen);
    if (!fen || !after || !pos) continue;
    const scored = await ask(fen);
    if (!scored || !scored.length) {
      bump(out.stops, 'nothing could score this position');
      continue;
    }
    out.replies.push({ san: g.san, share: g.share, games: g.games });
    const cand = candidate({ fen, pos: after, scored, ply: 1, userSide: d.side, arrived: { san: g.san, uci: g.uci, before: d.fen } }, c);
    out.candidates.push(Object.assign(cand, { unc: { san: g.san, share: g.share, games: g.games } }));
  }
  return out;
}

/** A position as the store keeps it (§5.42): all a card and its grade need, no request again. */
export interface StoredPosition {
  /** `s|<positionKey>`. */
  card: string;
  key: PositionKey;
  fen: string;
  side: Color;
  /** Plies past the line's end. */
  ply: number;
  /** The lines it came from (the first few), and their names. */
  lines: LineRef[];
  names: string[];
  arrived: Arrival | null;
  /** Every scored move: uci, score (mover's), win rate when ChessDB gave one. */
  scored: { u: string; s: number; w?: number }[];
  src: 'cdb' | 'sf';
  depth: number;
  invented: boolean;
  /** The uncovered reply it came from (§19). */
  unc: { san: string; share: number; games: number } | null;
  /** How often the line is reached, in games (§14.19), when known. */
  games: number | null;
  /** When it was stored, ms. */
  at: number;
}

export function storedPosition(cand: Candidate & { unc?: StoredPosition['unc'] }, from: { lines: LineRef[]; names: string[]; games?: number | null }, at: number): StoredPosition | null {
  const pos = positionOf(cand.fen);
  if (!pos) return null;
  const key = positionKeyOf(pos);
  return {
    card: 's|' + key,
    key,
    fen: cand.fen,
    side: cand.userColor,
    ply: cand.ply,
    lines: from.lines.slice(0, 4),
    names: from.names.slice(0, 3),
    arrived: cand.arrived,
    scored: cand.scored.map((m) => (m.winrate !== undefined ? { u: m.uci, s: m.score, w: m.winrate } : { u: m.uci, s: m.score })),
    src: cand.scored.source === 'sf' ? 'sf' : 'cdb',
    depth: cand.scored.depth || 0,
    invented: cand.invented,
    unc: cand.unc || null,
    games: from.games ?? null,
    at,
  };
}

/** A stored position's list back as a scored list. */
export function storedList(p: StoredPosition): ScoredList {
  const moves: ScoredMove[] = p.scored.map((m) => (m.w !== undefined ? { uci: m.u, score: m.s, winrate: m.w } : { uci: m.u, score: m.s }));
  return Object.assign(moves, p.src === 'sf' ? { source: 'sf' as const, depth: p.depth } : { source: 'cdb' as const });
}

/** Whether a stored position still wants Stockfish's standard list (§23: MultiPV 12 at depth 20). */
export function needsDeepening(p: StoredPosition, c: StormConfig): boolean {
  return p.src !== 'sf' || p.depth < c.deepenDepth;
}

/**
 * The position with Stockfish's list in place of the one it was stored with, or null when the
 * search fell short of the standard (§23.7.2: a list below it counts as not done) or found fewer
 * than three moves.
 */
export function deepenedPosition(p: StoredPosition, list: ScoredList | null, c: StormConfig): StoredPosition | null {
  if (!list || list.source !== 'sf' || (list.depth ?? 0) < c.deepenDepth || list.length < Math.min(3, p.scored.length)) return null;
  return { ...p, scored: list.map((m) => ({ u: m.uci, s: m.score })), src: 'sf', depth: list.depth ?? 0 };
}
