// The storm's walks (PLAN.md §5.39), ported from lichessable's shipped `stormCandidate`,
// `stormPickReject`, `stormAdvance`, `stormReentered`, `stormWalkGame`, `stormRandomLine`,
// `stormPickGames`, `stormDrawFrontier` and `stormCard` (DESIGN-intuition-storm.md §4, §5,
// §14.10, §14.18.4). Pure: the scores come from an injected `ask`, the dice from `rnd`.
//
// A walk starts at a frontier (a position one of the repertoire's lines ends on), goes forward
// through a real game's moves (or moves it invents among the best), asks for every position's
// scored moves, and offers the positions where the user is to move. The stop rules end a walk;
// the pick rules refuse a position (the first failing rule is its reason).
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan, makeSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import type { StormConfig } from './config.ts';
import { userEval, type ScoredList, type ScoredMove } from './grade.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The move that reached a position, and the position it was played from (§20: a FEN can't be un-played). */
export interface Arrival {
  san: string;
  uci: string;
  before: string;
}

export interface Candidate {
  fen: string;
  /** Plies past the line's end (1 is the position right after it). */
  ply: number;
  /** The repertoire's eval, centipawns. */
  evalUser: number;
  nScored: number;
  /** best − 2nd and best − 5th, centipawns. */
  spread2: number;
  spread5: number;
  inCheck: boolean;
  recapture: boolean;
  scored: ScoredList;
  /** The engine list's depth, 0 for ChessDB's. */
  listDepth: number;
  userColor: Color;
  arrived: Arrival | null;
  /** Reached by a line the walk made up rather than a real game (§14.10). */
  invented: boolean;
  /** The first pick rule it fails, or null when it is offered. */
  reject: string | null;
  /** The uncovered reply it came from (§19). */
  unc?: { san: string; share: number; games: number } | null;
}

/** Scored moves at a position, best first, or null when nothing could score it. */
export type Ask = (fen: string) => Promise<ScoredList | null>;

export function positionOf(fen: string): Position | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : undefined;
}

export const fenOf = (pos: Position): string => makeFen(pos.toSetup());

/** A SAN of `pos` as standard UCI, or undefined when it isn't legal there. */
export function sanToUci(pos: Position, san: string): string | undefined {
  const move = parseSan(pos, san);
  return move && 'from' in move ? standardUci(pos, move) : undefined;
}

/** The FEN after a UCI move (either castling spelling), or undefined. */
export function fenAfterUci(fen: string, uci: string): string | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  pos.play(move);
  return fenOf(pos);
}

/** A UCI move's SAN in `pos`, or ''. */
export function uciToSan(pos: Position, uci: string): string {
  const move = parseUciMove(pos, uci);
  return move ? makeSan(pos, move) : '';
}

/** The first pick rule a candidate fails, in §5.2's order, or null. */
export function pickReject(c: Pick<Candidate, 'evalUser' | 'nScored' | 'inCheck' | 'recapture' | 'spread2' | 'spread5'>, cfg: StormConfig): string | null {
  if (c.evalUser < cfg.userLoCp) return 'you are losing';
  if (c.evalUser > cfg.userHiCp) return 'you are already winning';
  if (c.nScored < cfg.minScored) return 'too few moves scored to rank an answer';
  if (c.inCheck) return 'in check — the choice is narrow';
  if (c.recapture) return 'forced recapture';
  if (c.spread5 < cfg.spreadMinCp) return 'flat — nothing to get wrong';
  if (c.spread2 > cfg.spreadMaxCp) return 'one move only — a tactic, not intuition';
  return null;
}

export interface CandidateContext {
  fen: string;
  pos: Position;
  scored: ScoredList;
  ply: number;
  userSide: Color;
  arrived?: Arrival | null;
  /** The square the previous move captured on, or null. */
  prevCapSq?: string | null;
  invented?: boolean;
}

/** The one candidate builder both walks use. */
export function candidate(ctx: CandidateContext, cfg: StormConfig): Candidate {
  const s = ctx.scored;
  const best = s[0]!.score;
  const second = s.length > 1 ? s[1]!.score : best;
  const fifth = s[Math.min(4, s.length - 1)]!.score;
  const c: Candidate = {
    fen: ctx.fen,
    ply: ctx.ply,
    evalUser: userEval(best, ctx.pos.turn, ctx.userSide),
    nScored: s.length,
    spread2: best - second,
    spread5: best - fifth,
    inCheck: ctx.pos.isCheck(),
    recapture: ctx.prevCapSq != null && s[0]!.uci.slice(2, 4) === ctx.prevCapSq,
    scored: s,
    listDepth: typeof s.depth === 'number' && s.depth > 0 ? s.depth : 0,
    userColor: ctx.userSide,
    arrived: ctx.arrived || null,
    invented: Boolean(ctx.invented),
    reject: null,
  };
  c.reject = pickReject(c, cfg);
  return c;
}

/** One move forward: the position after it, the square it captured on, and how it arrived. */
export function advance(fen: string, pos: Position, uci: string): { fen: string; prevCapSq: string | null; arrived: Arrival } | null {
  const move = parseUciMove(pos, uci);
  if (!move) return null;
  const san = makeSan(pos, move);
  const capture = pos.board.has(move.to) || (pos.board.get(move.from)?.role === 'pawn' && move.to === pos.epSquare);
  const after = pos.clone();
  after.play(move);
  return { fen: fenOf(after), prevCapSq: capture ? uci.slice(2, 4) : null, arrived: { san, uci: standardUci(pos, move), before: fen } };
}

/**
 * Whether a walk has come back into the repertoire (§14.18.4): the user to move in a position
 * their own lines stand on. `covered` holds every position the user's side's lines pass through.
 */
export function reentered(covered: ReadonlySet<PositionKey> | null | undefined, pos: Position, user: Color): boolean {
  if (!covered || pos.turn !== user) return false;
  return covered.has(positionKeyOf(pos));
}

export interface WalkResult {
  /** Whether the game reached the frontier at all. */
  found: boolean;
  out: Candidate[];
  /** Why the walk stopped, in words. */
  stop: string;
  invented?: boolean;
}

/**
 * A real game walked from the frontier (§4 stage 2): the game's moves from the start to the
 * frontier, then on for at most `maxPly` plies, each position scored by `ask`.
 */
export async function walkGame(frontierFen: string, userSide: Color, sans: readonly string[], ask: Ask, cfg: StormConfig, covered?: ReadonlySet<PositionKey> | null): Promise<WalkResult> {
  const startPos = positionOf(frontierFen);
  if (!startPos) return { found: false, out: [], stop: 'unparseable position' };
  const target = positionKeyOf(startPos);
  let pos = positionOf(START_FEN)!;
  let fen = START_FEN;
  let i = 0;
  let arrived: Arrival | null = null;
  while (i < sans.length && positionKeyOf(pos) !== target) {
    const uci = sanToUci(pos, sans[i]!);
    const step = uci && advance(fen, pos, uci);
    if (!step) return { found: false, out: [], stop: 'the game left the board' };
    arrived = step.arrived;
    fen = step.fen;
    pos = positionOf(fen)!;
    i++;
  }
  if (positionKeyOf(pos) !== target) return { found: false, out: [], stop: 'never reached the frontier' };

  const out: Candidate[] = [];
  let prevCapSq: string | null = null;
  let stop = 'the walk reached its ply limit';
  for (let k = 0; k < cfg.maxPly && i + k < sans.length; k++) {
    if (reentered(covered, pos, userSide)) {
      stop = 'your own lines answer this position';
      break;
    }
    const scored = await ask(fen);
    if (!scored || !scored.length) {
      stop = 'nothing could score this position';
      break;
    }
    const best = scored[0]!.score;
    if (Math.abs(best) > cfg.decidedCp) {
      stop = 'the position is already decided';
      break;
    }
    if (pos.turn === userSide && k + 1 >= cfg.minPly) out.push(candidate({ fen, pos, scored, ply: k + 1, userSide, arrived, prevCapSq }, cfg));
    const san = sans[i + k]!;
    const uci = sanToUci(pos, san);
    if (!uci) {
      stop = 'a move of the game did not resolve';
      break;
    }
    const played = scored.find((m) => m.uci === uci);
    if (played && best - played.score >= cfg.blunderCp) {
      stop = pos.turn === userSide ? 'you would have erred here' : 'the opponent erred here';
      break;
    }
    const step = advance(fen, pos, uci);
    if (!step) {
      stop = 'illegal in sequence';
      break;
    }
    prevCapSq = step.prevCapSq;
    arrived = step.arrived;
    fen = step.fen;
    pos = positionOf(fen)!;
    if (i + k + 1 >= sans.length) stop = 'the game ended';
  }
  return { found: true, out, stop };
}

/**
 * The invented line (§14.10): the same walk with its moves chosen at random among the position's
 * top `randomTopN` within `randomTopCp` of the best, for a frontier with no games. Its length is
 * drawn between `randomMinPlies` and `maxPly`. Every candidate is marked invented.
 */
export async function randomLine(frontierFen: string, userSide: Color, ask: Ask, cfg: StormConfig, rnd: () => number, seed: Arrival | null, covered?: ReadonlySet<PositionKey> | null): Promise<WalkResult> {
  const out: Candidate[] = [];
  let fen = frontierFen;
  let pos = positionOf(fen);
  if (!pos) return { found: false, out, stop: 'unparseable position', invented: true };
  let prevCapSq: string | null = null;
  let arrived = seed;
  let stop = 'the walk reached its ply limit';
  const span = Math.max(0, cfg.maxPly - cfg.randomMinPlies);
  const len = Math.min(cfg.maxPly, cfg.randomMinPlies + Math.floor(rnd() * (span + 1)));
  for (let k = 0; k < len; k++) {
    if (reentered(covered, pos, userSide)) {
      stop = 'your own lines answer this position';
      break;
    }
    const scored = await ask(fen);
    if (!scored || !scored.length) {
      stop = 'nothing could score this position';
      break;
    }
    const best = scored[0]!.score;
    if (Math.abs(best) > cfg.decidedCp) {
      stop = 'the position is already decided';
      break;
    }
    if (pos.turn === userSide && k + 1 >= cfg.minPly) out.push(candidate({ fen, pos, scored, ply: k + 1, userSide, arrived, prevCapSq, invented: true }, cfg));
    const pool = scored.slice(0, cfg.randomTopN).filter((m) => best - m.score <= cfg.randomTopCp);
    const pick: ScoredMove = (pool.length ? pool : [scored[0]!])[Math.floor(rnd() * (pool.length || 1))]!;
    const step = advance(fen, pos, pick.uci);
    if (!step) {
      stop = 'a chosen move did not resolve';
      break;
    }
    prevCapSq = step.prevCapSq;
    arrived = step.arrived;
    fen = step.fen;
    pos = positionOf(fen)!;
  }
  return { found: true, out, stop, invented: true };
}

/** `n` games picked at random from a list, none twice. */
export function pickGames<T>(games: readonly T[] | null | undefined, n: number, rnd: () => number): T[] {
  const pool = (games || []).slice();
  const take = Math.max(0, Math.min(n, pool.length));
  for (let i = 0; i < take; i++) {
    const j = Math.min(pool.length - 1, i + Math.floor(rnd() * (pool.length - i)));
    const t = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = t;
  }
  return pool.slice(0, take);
}

/** A frontier drawn from the pool (and removed from it), weighted by the lines ending there. */
export function drawFrontier<T extends { n: number }>(pool: T[], rnd: () => number): T | null {
  if (!pool.length) return null;
  let total = 0;
  for (const f of pool) total += Math.max(1, f.n);
  let r = rnd() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= Math.max(1, pool[i]!.n);
    if (r <= 0) return pool.splice(i, 1)[0]!;
  }
  return pool.pop()!;
}

/** A card's best move: its standard UCI, its SAN by our own generator, the position after; null when it won't resolve. */
export function bestMove(c: Candidate): { uci: string; san: string; fenAfter: string; score: number; winrate?: number } | null {
  const best = c.scored[0];
  const pos = positionOf(c.fen);
  const move = best && pos && parseUciMove(pos, best.uci);
  if (!best || !pos || !move) return null;
  const san = makeSan(pos, move);
  const uci = standardUci(pos, move);
  pos.play(move);
  const out: { uci: string; san: string; fenAfter: string; score: number; winrate?: number } = { uci, san, fenAfter: fenOf(pos), score: best.score };
  if (best.winrate !== undefined) out.winrate = best.winrate;
  return out;
}
