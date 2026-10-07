// Grading a storm answer (PLAN.md §5.39), ported from lichessable's shipped functions
// (`stormWinPct`, `stormWpLoss`, `stormGrade`, `stormPoints`, `stormMoverCp`, `stormMoveLoss`,
// `stormUserEval`). Pure.
//
// Three perspective rules, each silent when wrong (dev/check-storm.js's header):
// - ChessDB's scores are the MOVER's. Whether to negate one for the repertoire's side depends on
//   whose move it is in the position, never on the line's side (`userEval`).
// - A move missing from the position's list is worth MINUS the best score of the position after
//   it (the child is the opponent's), so its loss is `best + childBest` (`moveLoss`).
// - Stockfish's scores here are from White's side (core/engine/uci.ts), the other way round, so
//   `moverCp` turns them to the mover's.
import type { Color } from 'chessops/types';
import type { Score } from '../engine/uci.ts';
import type { Band, StormConfig } from './config.ts';

/** A scored move, from the mover's side, as ChessDB's `queryall` gives it (or the engine). */
export interface ScoredMove {
  /** Standard UCI. */
  uci: string;
  san?: string;
  score: number;
  /** ChessDB's win rate for the mover, in percent, when it gave one. */
  winrate?: number;
}

/** A position's scored moves, best first, and where they came from. */
export interface ScoredList extends ReadonlyArray<ScoredMove> {
  /** `cdb` for ChessDB, `sf` for Stockfish; absent is ChessDB's. */
  source?: 'cdb' | 'sf';
  /** The search depth of an engine list. */
  depth?: number;
}

/** The repertoire's eval of a position whose mover's best scores `best`. */
export function userEval(best: number, toMove: Color, user: Color): number {
  return toMove === user ? best : -best;
}

/** Lichess's winning chances in percent, from centipawns; mates clamp to the curve's end (§16.1). */
export function winPct(cp: number | null | undefined, c: StormConfig): number | null {
  if (typeof cp !== 'number' || !Number.isFinite(cp)) return null;
  const x = Math.max(-c.wpClampCp, Math.min(c.wpClampCp, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-c.wpK * x)) - 1);
}

/** The winning chance given up against the best, never below 0. */
export function wpLoss(bestCp: number, playedCp: number, c: StormConfig): number | null {
  const a = winPct(bestCp, c);
  const b = winPct(playedCp, c);
  if (a === null || b === null) return null;
  return Math.max(0, a - b);
}

/** The band of a win% loss: each threshold falls in the band below it. */
export function grade(wp: number | null | undefined, c: StormConfig): Band {
  if (typeof wp !== 'number' || !Number.isFinite(wp)) return 'unknown';
  if (wp < c.greatWp) return 'great';
  if (wp < c.goodWp) return 'good';
  if (wp < c.okWp) return 'ok';
  if (wp < c.badWp) return 'bad';
  return 'blunder';
}

/**
 * Points for an answer at a streak: a reward multiplied by the streak (one more every
 * `streakStep`, up to `streakMax`), a penalty flat (§8.1: never multiplied, or a lapse after a
 * long run costs more than the same lapse after none). `ok`, `unknown` and an unanswered card
 * score nothing.
 */
export function points(verdict: Band | 'unanswered', streak: number, c: StormConfig): number {
  const base =
    verdict === 'great' ? c.greatPoints : verdict === 'good' ? c.goodPoints : verdict === 'bad' ? c.badPoints : verdict === 'blunder' ? c.blunderPoints : 0;
  if (!base) return 0;
  if (base < 0) return base;
  const mult = Math.min(c.streakMax, 1 + Math.floor(Math.max(0, streak) / c.streakStep));
  return base * mult;
}

/** The streak after an answer worth `pts`: a score extends it, a cost ends it, nothing holds it (§16.3). */
export function nextStreak(streak: number, pts: number): number {
  return pts > 0 ? streak + 1 : pts < 0 ? 0 : streak;
}

/** An engine score from White's side, as centipawns for `mover`; a mate as ±engineMateCp less its distance. */
export function moverCp(score: Partial<Score> | null | undefined, mover: Color, c: StormConfig): number | null {
  if (!score) return null;
  const sign = mover === 'white' ? 1 : -1;
  if (typeof score.mate === 'number') {
    const m = sign * score.mate;
    return m > 0 ? c.engineMateCp - m : -c.engineMateCp - m;
  }
  return typeof score.cp === 'number' ? sign * score.cp : null;
}

/** How a move was graded: by the position's list, by the position after it, or by two searches. */
export type GradeSource = 'list' | 'child' | 'engine';

export interface MoveLoss {
  /** Centipawns behind the best, never below 0. */
  loss: number;
  /** Win% given up. */
  wp: number | null;
  /** 1-based in the list, null when the child scored it. */
  rank: number | null;
  score: number;
  san: string;
  winrate: number | undefined;
  bestScore: number;
  source: GradeSource;
}

/**
 * A move's loss against the list's best: from the list when the move is in it, else from the
 * best score of the position after it (`childBest`, the opponent's), negated; null when neither
 * answers. A child score of 0 is a real score.
 */
export function moveLoss(scored: readonly ScoredMove[], uci: string, childBest: number | null | undefined, c: StormConfig): MoveLoss | null {
  if (!scored.length) return null;
  const best = scored[0]!.score;
  const i = scored.findIndex((m) => m.uci === uci);
  if (i >= 0) {
    const m = scored[i]!;
    return { loss: Math.max(0, best - m.score), wp: wpLoss(best, m.score, c), rank: i + 1, score: m.score, san: m.san || '', winrate: m.winrate, bestScore: best, source: 'list' };
  }
  if (typeof childBest !== 'number' || !Number.isFinite(childBest)) return null;
  const value = -childBest;
  return { loss: Math.max(0, best - value), wp: wpLoss(best, value, c), rank: null, score: value, san: '', winrate: undefined, bestScore: best, source: 'child' };
}

/**
 * The engine tier (§14.8): both numbers from one evaluator, or no answer. `best` is the position's
 * best line and `played` the position after the move, both from White's side.
 */
export function engineLoss(best: Score, afterMove: Score, mover: Color, c: StormConfig): { loss: number; wp: number | null; score: number; bestScore: number } | null {
  const b = moverCp(best, mover, c);
  const p = moverCp(afterMove, mover, c);
  if (b === null || p === null) return null;
  return { loss: Math.max(0, b - p), wp: wpLoss(b, p, c), score: p, bestScore: b };
}
