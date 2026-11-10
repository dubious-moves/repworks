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
import type { DepthScores, EngineLine } from '../engine/search.ts';
import type { StormConfig } from './config.ts';
import { moverCp, settledCp, settledValue, userEval, type ScoredList, type ScoredMove } from './grade.ts';
import { gamesFromPgn } from './games.ts';
import type { Coverage, DecisionPoint, ExplorerReply, Frontier, LineRef } from './sources.ts';
import { lineRefKey, lineTail, uncoveredMoves } from './sources.ts';
import { candidate, fenAfterUci, pickGames, positionOf, randomLine, walkGame, type Arrival, type Ask, type Candidate, type StoredKind } from './walk.ts';
import { positionKeyOf } from '../chess/positionKey.ts';
import type { MaiaRating } from './maia.ts';

/** ChessDB's answer as a scored list: its scored moves only, best first; null when it knows nothing. */
export function cdbList(a: ChessdbAnswer | null | undefined): ScoredList | null {
  if (!a || a.status !== 'ok' || !a.moves) return null;
  const moves: ScoredMove[] = a.moves.filter((m) => Number.isFinite(m.score)).map((m) => ({ uci: m.uci, san: m.san, score: m.score }));
  if (!moves.length) return null;
  moves.sort((x, y) => y.score - x.score);
  return Object.assign(moves, { source: 'cdb' as const });
}

/**
 * The engine's MultiPV lines as a scored list from the mover's side, best first. Given the search's
 * scores by depth (§5.120), each move scores the mean of its last two depths that every line has
 * finished: lines stopped mid-iteration are compared at one depth, which is the list's depth.
 */
export function engineList(lines: readonly EngineLine[], turn: Color, depth: number, c: StormConfig, scores?: DepthScores): ScoredList | null {
  const at = scores && lines.length ? Math.min(...lines.map((l) => l.depth)) : depth;
  const moves: ScoredMove[] = [];
  for (const l of lines) {
    const uci = l.pv[0];
    const score = (uci && scores ? settledCp(scores.get(uci), at, turn, c) : null) ?? moverCp(l.score, turn, c);
    if (!uci || score === null) continue;
    moves.push({ uci, score });
  }
  if (!moves.length) return null;
  moves.sort((x, y) => y.score - x.score);
  return Object.assign(moves, { source: 'sf' as const, depth: Math.min(depth, at) });
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
  /** The games the explorer named there, and those walked this time. */
  gameIds?: string[];
  walked?: string[];
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

/**
 * A frontier's positions (§4 stages 0–3). `games`: how many to walk. `skip`: games walked before
 * (a gather's second pass, after one game at every line end): those are left out, and a frontier
 * with no game left, or none at all, is passed for no request beyond the explorer's.
 */
export async function harvestFrontier(f: Frontier, cont: Coverage, io: HarvestIo, c: StormConfig, games: number, skip?: ReadonlySet<string>): Promise<Harvest> {
  const out: Harvest = { candidates: [], stops: {} };
  const covered = cont[f.side];
  const found = await io.explorer(f.fen);
  if (found) out.games = found.total;
  const ids = found?.gameIds || [];
  out.gameIds = ids;
  const fresh = skip ? ids.filter((id) => !skip.has(id)) : ids;
  if (skip && !fresh.length) {
    out.refused = 'no game left to walk';
    return out;
  }
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
  const picked = pickGames(fresh, games, io.rnd);
  out.walked = picked;
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
    // A reply that leaves the user clearly better was a mistake to punish (§5.100).
    if (cand.kind === 'convert') cand.kind = 'punish';
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
  /** Maia's policy at the ratings it was rated at (§5.82), added in the background. */
  maia?: MaiaRating[];
  /** A kind beyond the classic storm's (§5.100); absent for a classic position. */
  kind?: StoredKind;
  /** The device whose shared file it came from (§5.102); absent for one gathered here. */
  from?: string;
  /**
   * The positions after moves the list leaves out, each searched as the grade searches one
   * (§5.157, §5.161: MultiPV 1 to the grade's depth): kept so a move among them is graded with no
   * search, on any device and after the page is gone. Absent when none was searched.
   */
  after?: AfterScore[];
}

/**
 * One search of the position after a move (§5.161): the move (UCI), the position after it scored
 * from the side to move there (the opponent), in the grade's centipawns (`moverCp` of the value
 * over its last two depths, §5.120), and the depth the search reached.
 */
export interface AfterScore {
  u: string;
  s: number;
  d: number;
}

/**
 * A search of the position after `uci` (MultiPV 1, the grade's, §5.157) as kept (§5.161): its best
 * line's value over the last two depths (§5.120), from the side to move there. Null with no line.
 */
export function afterOf(childFen: string, uci: string, a: { lines: readonly EngineLine[]; depth: number; scores: DepthScores } | null | undefined, c: StormConfig): AfterScore | null {
  const l = a?.lines[0];
  const pos = positionOf(childFen);
  if (!a || !l || !pos) return null;
  const s = moverCp(settledValue(l.score, l.depth, a.scores, pos.turn, c), pos.turn, c);
  return s === null ? null : { u: uci, s, d: a.depth };
}

/** The kept search of the position after `uci` that may grade it (`judgeDepth` or deeper), if any. */
export function afterScore(p: Pick<StoredPosition, 'after'>, uci: string, c: Pick<StormConfig, 'judgeDepth'>): AfterScore | undefined {
  const a = p.after?.find((x) => x.u === uci);
  return a && a.d >= c.judgeDepth ? a : undefined;
}

/**
 * The position with a search of the position after a move kept (§5.161), or null when it changes
 * nothing: a search short of `judgeDepth` (the grade would search again), or one no deeper than the
 * search already kept for that move.
 */
export function withAfter(p: StoredPosition, a: AfterScore, c: Pick<StormConfig, 'judgeDepth'>): StoredPosition | null {
  if (!Number.isFinite(a.s) || !(a.d >= c.judgeDepth)) return null;
  const old = p.after?.find((x) => x.u === a.u);
  if (old && old.d >= a.d) return null;
  return { ...p, after: [...(p.after ?? []).filter((x) => x.u !== a.u), { u: a.u, s: a.s, d: a.d }] };
}

/** Two sets of searches after moves as one: each move's deeper search, `ours` where they tie. */
export function unionAfter(ours: readonly AfterScore[] | undefined, theirs: readonly AfterScore[] | undefined): AfterScore[] | undefined {
  if (!theirs?.length) return ours ? [...ours] : undefined;
  const out = new Map((ours ?? []).map((a) => [a.u, a]));
  for (const a of theirs) {
    const o = out.get(a.u);
    if (!o || a.d > o.d) out.set(a.u, a);
  }
  return [...out.values()];
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
    ...(cand.kind ? { kind: cand.kind } : {}),
  };
}

/** The line a position is from (its first line), as the spread keys it (lichessable §30); '' for none. */
export function positionLineKey(p: Pick<StoredPosition, 'lines'>): string {
  const r = p.lines[0];
  return r ? lineRefKey(r) : '';
}

/** A FEN's ply from the start, by its move number and side; null when it has none. */
function plyOf(fen: string): number | null {
  const parts = fen.trim().split(/\s+/);
  const full = Number(parts[5]);
  if (!Number.isInteger(full) || full < 1 || (parts[1] !== 'w' && parts[1] !== 'b')) return null;
  return 2 * (full - 1) + (parts[1] === 'b' ? 1 : 0);
}

/**
 * Where on its line a card is, in moves: a line end's last moves ("…6. Be2 e5 7. Nb3"), or for an
 * uncovered reply (§19) the moves up to where it was played. A chapter holds many lines, so its
 * name alone can't tell two cards' line ends apart.
 */
export function positionLineLabel(p: Pick<StoredPosition, 'lines' | 'unc' | 'arrived'>): string {
  const r = p.lines[0];
  if (!r || !r.path.length) return '';
  if (p.unc && p.arrived) {
    const ply = plyOf(p.arrived.before);
    if (ply !== null && ply <= r.path.length) return ply ? lineTail(r.path, 4, ply) : 'the start';
  }
  return lineTail(r.path);
}

/**
 * The explorer's `until` (YYYY-MM, UTC) `months` before `now`: an overnight gather's later passes
 * ask for the games up to it (§5.102). Undefined for none back.
 */
export function explorerUntil(now: number, months: number): string | undefined {
  if (months <= 0) return undefined;
  const d = new Date(now);
  const m = d.getUTCFullYear() * 12 + d.getUTCMonth() - months;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
}

/** A stored position's list back as a scored list. */
export function storedList(p: StoredPosition): ScoredList {
  const moves: ScoredMove[] = p.scored.map((m) => (m.w !== undefined ? { uci: m.u, score: m.s, winrate: m.w } : { uci: m.u, score: m.s }));
  return Object.assign(moves, p.src === 'sf' ? { source: 'sf' as const, depth: p.depth } : { source: 'cdb' as const });
}

/** Whether a stored position's list may judge a move: Stockfish's at `judgeDepth` or deeper (§5.80, §5.84). */
export function judges(p: StoredPosition, c: StormConfig): boolean {
  return p.src === 'sf' && p.depth >= c.judgeDepth;
}

/**
 * Whether a stored position still wants Stockfish's standard list (§23: MultiPV 12 at the device's
 * `target` depth, §5.84). ChessDB's list always does: it never judges a move.
 */
export function needsDeepening(p: StoredPosition, target: number): boolean {
  return p.src !== 'sf' || p.depth < target;
}

/**
 * The position with Stockfish's list in place of the one it was stored with, or null when the
 * search fell short of a list that may judge (§23.7.2: a list below it counts as not done), is no
 * deeper than the Stockfish list already kept, or found fewer than three moves.
 */
export function deepenedPosition(p: StoredPosition, list: ScoredList | null, c: StormConfig): StoredPosition | null {
  const depth = list?.depth ?? 0;
  if (!list || list.source !== 'sf' || depth < c.judgeDepth || (p.src === 'sf' && depth <= p.depth) || list.length < Math.min(3, p.scored.length)) return null;
  return { ...p, scored: list.map((m) => ({ u: m.uci, s: m.score })), src: 'sf', depth };
}
