// How far a score bar can be trusted (PLAN.md §5.126, "Which differences are real"): the 95% margin
// of each bar's score, and the rows the best one can't be told from.
//
// A score over n games is a mean of n results (1, ½, 0), so its error is the results' spread over
// √n: about ±3 points at 1,000 games, ±1 at 10,000. At equal ratings the correction adds its own:
// the curve's slope is known to ±0.03 (Lichess's, measured) or guessed (Elo's, where not measured),
// and the opponents' rating, when estimated from the move that led here, to about ±3 points (the
// estimate's misses, measured 2026-11-23: 2 on average). A prepared split rests on games only in
// its `1 − prior` part, over its leaves' games; its Practical part's error (engine evals, Maia) is
// of another kind and isn't counted. Pure.
import { ELO_SLOPE_SE, LICHESS_SLOPE_SE, type EqualScore } from './equal.ts';
import type { Side, Split } from './search.ts';

/** The 95% normal quantile. */
export const Z95 = 1.96;
/** The estimated opponents' rating's error, in rating points (one standard deviation). */
export const ESTIMATE_SE = 3;
/** A row whose margin is wider than this can't be ranked against the others: too few games. */
export const RANKED = 0.1;

const scoreOf = (split: Split, side: Side) => (side === 'w' ? split.w : split.b) + split.d / 2;

/** One game's result's variance for the side, from a split's shares (draws ½). */
export function resultVariance(split: Split, side: Side): number {
  const n = split.w + split.d + split.b;
  if (!(n > 0)) return 0.25;
  const win = (side === 'w' ? split.w : split.b) / n;
  const s = scoreOf(split, side) / n;
  return Math.max(0, win + split.d / n / 4 - s * s);
}

/** The 95% margin of the side's score over `games` games with this split; Infinity with none. */
export function gamesMargin(split: Split, side: Side, games: number): number {
  if (!(games > 0)) return Infinity;
  return Z95 * Math.sqrt(resultVariance(split, side) / games);
}

/** The correction's own standard error at equal ratings, in score: the slope's, and the estimated opponents' rating's. */
export function correctionSe(eq: EqualScore): number {
  const k = Math.LN10 / 400;
  const e = eq.expected;
  const perPoint = eq.slope * k * e * (1 - e);
  const perSlope = eq.gap * k * e * (1 - e);
  const slopeSe = eq.curve === 'elo' ? ELO_SLOPE_SE : LICHESS_SLOPE_SE;
  const ratingSe = eq.from === 'before' ? ESTIMATE_SE : 0;
  return Math.sqrt((perPoint * ratingSe) ** 2 + (perSlope * slopeSe) ** 2);
}

/** The 95% margin of a score at equal ratings: the games' chance and the correction's. */
export function equalMargin(eq: EqualScore, side: Side): number {
  const games = gamesMargin(eq.split, side, eq.games) / Z95;
  return Z95 * Math.sqrt(games ** 2 + correctionSe(eq) ** 2);
}

/**
 * The 95% margin of a prepared split's score: its games' part, `1 − prior` of it, over its leaves'
 * games (and the correction's, at equal ratings). The Practical part's error isn't counted.
 */
export function preparedMargin(prep: Split, prior: number, leafGames: number, side: Side, eq?: EqualScore): number {
  const part = 1 - Math.min(1, Math.max(0, prior));
  if (!(part > 0)) return 0;
  const games = gamesMargin(prep, side, leafGames) / Z95;
  const corr = eq ? correctionSe(eq) : 0;
  return Z95 * part * Math.sqrt(games ** 2 + corr ** 2);
}

export interface Scored {
  key: string;
  /** The side's score, 0 to 1, and its 95% margin. */
  score: number;
  margin: number;
}

export interface Top {
  /** The ranked row with the best score, when two or more can be ranked. */
  best?: Scored;
  /** The best and the ranked rows it can't be told from: their difference within chance. */
  tied: Set<string>;
  /** The rows narrow enough to rank (margin at most RANKED). */
  ranked: Set<string>;
}

/**
 * The rows the best can't be told from. Two scores differ by more than chance at 95% when their
 * difference is over √(m₁² + m₂²), each margin already 1.96 standard errors. Only rows whose own
 * margin is at most RANKED take part: a row of 30 games is "within chance" of anything.
 */
export function topOf(rows: readonly Scored[]): Top {
  const ranked = rows.filter((r) => Number.isFinite(r.score) && r.margin <= RANKED);
  const out: Top = { tied: new Set(), ranked: new Set(ranked.map((r) => r.key)) };
  if (ranked.length < 2) return out;
  const best = ranked.reduce((a, b) => (b.score > a.score ? b : a));
  out.best = best;
  for (const r of ranked) if (best.score - r.score <= Math.hypot(best.margin, r.margin)) out.tied.add(r.key);
  return out;
}

const pts = (f: number) => Math.max(1, Math.round(f * 100));

/** The margin as the bars' titles write it: `±3 points (95%)`; under one point, `±1`. */
export const marginText = (m: number): string => (Number.isFinite(m) ? `±${pts(m)} points (95%)` : 'no margin: no games');

/** A row's line on where it stands against the best, for its bar's title; undefined when nothing can be said. */
export function topLine(key: string, top: Top, label = (k: string) => k): string | undefined {
  if (!top.best) return undefined;
  const best = top.best;
  const at = `${label(best.key)}, ${Math.round(best.score * 100)}%`;
  if (!top.ranked.has(key)) return `Too few games to rank against the others (its margin is over ±${Math.round(RANKED * 100)}).`;
  if (key === best.key) return top.tied.size > 1 ? `Green: the best score here, but ${top.tied.size - 1} other move${top.tied.size === 2 ? '' : 's'} can’t be told from it.` : 'Green: the best score here, by more than chance.';
  if (top.tied.has(key)) return `Green: can’t be told from the best here (${at}): the difference is within chance.`;
  return `Below the best here (${at}) by more than chance.`;
}
