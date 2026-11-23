// Scores at equal ratings (PLAN.md §5.126, the owner's request after reading about "PETER"): a
// move's results with the rating gap between its players and their opponents taken out.
//
// Lichess's explorer files a game under the rating band of the players' midpoint, and gives each
// move the average rating of the players who made it (lila-openingexplorer's `Stats::new_single`
// takes the mover's rating; Masters does the same). So at the position after a move, its replies'
// ratings are the opponents' ratings in the games through that move (and through transpositions).
// Players who are stronger than their opponents pick some lines more than others; their results
// then flatter those lines. Measured on 2026-10-18 (blitz and rapid, 1800–2000): 1.e4 Nf6's
// players averaged 19 points above their opponents, so its 51.7%, the best of Black's replies,
// was 49.0% at equal ratings; 1.e4 c5 2.d3, played 30 points below, went from 48.2% to 52.5%.
//
// The gap's predicted score is Lichess's curve (`LICHESS_SLOPES`, measured 2026-11-23): Lichess's
// results follow a rating gap at 0.5 to 0.85 of Elo's slope, by rating; Elo's own formula took out
// 1.2 to 2 times too much. The curve is close to straight over the gaps found (tens of points), so
// the gap of the averages stands in for the average of each game's gap.
//
// Transpositions (2026-11-23): the explorer answers by position, so the replies after a move
// include every game reaching that position by another order. When those outnumber the move's own
// games, the replies' ratings are another population's: at 1. Nc3 d5 2. d4 c5 3. Bf4 Nc6, 4.e3's
// 48,682 games lead to a position with 136,261, mostly from the London's 1. d4 d5 2. Bf4 c5 3. e3
// Nc6 4. Nc3 (Black near 1980 there, against 4.e3's players' 1875). Then the opponents' rating is
// taken from the position itself: the players of the move that led here are the opponents of
// every move here, and a move's opponents follow its players' distance from the position's average
// by a slope (`followAt`): near 0.8 over a wide filter, where matchmaking pairs similar ratings,
// near 0 in one band, where the explorer's filing by the players' midpoint pairs a stronger mover
// with a weaker opponent. Fitted to the moves here whose opponents are known, pulled towards the
// filter's prior. Pure.
import type { CompactExplorer } from './providers.ts';
import type { Side, Split } from './search.ts';

/** Elo's expected score for a player `gap` points above the opponent. */
export function eloExpected(gap: number): number {
  return 1 / (1 + 10 ** (-gap / 400));
}

/**
 * Lichess's curve: a game's result follows its rating gap at this fraction of Elo's slope, by the
 * band of the two players' midpoint (the explorer's bands). Measured on 2026-11-23 with
 * `scripts/elo-curve.ts` over the first 1.2 million games of October 2026's dump, filtered as the
 * explorer's (finished, both rated, no bot, provisional ratings kept), gaps within 150 points: a
 * player 100 points above scores 8.9 points above an even game where Elo's curve says 13.9. Speeds
 * alike within about 0.05; each value ±0.02 (2500: ±0.04).
 */
export const LICHESS_SLOPES: readonly (readonly [band: number, slope: number])[] = [
  [0, 0.73],
  [1000, 0.53],
  [1200, 0.52],
  [1400, 0.49],
  [1600, 0.6],
  [1800, 0.66],
  [2000, 0.72],
  [2200, 0.76],
  [2500, 0.85],
];
/** The slope's error, in its fraction (the fits' standard error, with room for months that differ). */
export const LICHESS_SLOPE_SE = 0.03;
/** Elo's curve where it wasn't measured (the Masters tab's FIDE ratings, Chess.com's): its slope's error, as a guess. */
export const ELO_SLOPE_SE = 0.2;

/** Which curve turns a gap into a score: Lichess's, measured, or Elo's own. */
export type Curve = 'lichess' | 'elo';

/** The slope against Elo's at a midpoint of two ratings: the band's (1 on Elo's curve). */
export function slopeAt(midpoint: number, curve: Curve = 'lichess'): number {
  if (curve === 'elo') return 1;
  let k = LICHESS_SLOPES[0]![1];
  for (const [band, slope] of LICHESS_SLOPES) if (midpoint >= band) k = slope;
  return k;
}

/** The expected score of a player rated `rating` against `opponent`, on the curve. */
export function expectedOn(rating: number, opponent: number, curve: Curve = 'lichess'): number {
  return eloExpected(slopeAt((rating + opponent) / 2, curve) * (rating - opponent));
}

/** The average rating of the side to move at a position: its moves' ratings weighted by their games. */
export function moverRating(answer: CompactExplorer | undefined): { rating: number; games: number } | undefined {
  let sum = 0;
  let games = 0;
  for (const m of answer?.moves ?? []) {
    if (typeof m.rating !== 'number' || !(m.games > 0)) continue;
    sum += m.rating * m.games;
    games += m.games;
  }
  return games ? { rating: sum / games, games } : undefined;
}

/**
 * A split with `delta` of the mover's score moved from its wins to its losses (a negative `delta`
 * the other way), its draws kept. Clamped: wins and losses stay between 0 and what they had together.
 */
export function shiftSplit(split: Split, turn: Side, delta: number): Split {
  const win = turn === 'w' ? split.w : split.b;
  const loss = turn === 'w' ? split.b : split.w;
  const w2 = Math.min(win + loss, Math.max(0, win - delta));
  const l2 = Math.max(0, loss + (win - w2));
  return turn === 'w' ? { w: w2, d: split.d, b: l2 } : { w: l2, d: split.d, b: w2 };
}

/**
 * The position after a move may hold this many games per game of the move's own before its replies'
 * ratings stop standing for the move's opponents: over it, the estimate from the move that led here
 * is used when there is one (`opponentsBefore`).
 */
export const INFLOW = 1.1;
/** Without the move that led here, the replies after the move still serve up to this. */
export const INFLOW_MAX = 1.25;
/**
 * How far a move's opponents' rating follows its players' distance from the position's average,
 * before the moves here pull it: by the filter's number of Lichess rating bands. Measured on
 * 2026-11-23 (blitz, rapid and classical) on the moves whose position after had no other way in:
 * 0.82 over 1600–2200 (four bands, 27 positions, 72 moves), 0.68 over 2000–2200 (two bands, 18
 * moves), 0.05 over 2000 alone (20 moves).
 */
export const FOLLOW = 0.8;
export const followPrior = (bands: number): number => (bands <= 1 ? 0 : bands === 2 ? 0.7 : FOLLOW);
/** The prior's weight in the fit, in squared points: a known move 45 points from the average weighs as much. */
export const FOLLOW_WEIGHT = 2000;

/** The row's position and the move that led to it, as the answer before it gives that move. */
export interface EqualBefore {
  here: CompactExplorer;
  led: { san: string; games: number; rating?: number | undefined };
  /** The moves here whose opponents are known (no other way into the position after): their players' rating and their opponents'. */
  known?: readonly { rating: number; opponent: number }[] | undefined;
  /** The slope expected under the filter (`followPrior`). */
  prior: number;
}

export interface EqualScore {
  /** The average rating of the move's players, and of their opponents. */
  rating: number;
  opponent: number;
  /** `rating − opponent`. */
  gap: number;
  /** The mover's score in the games, 0 to 1, and what the gap predicts on the curve. */
  raw: number;
  expected: number;
  /** The curve, and its slope against Elo's at these ratings (`slopeAt`). */
  curve: Curve;
  slope: number;
  /** The mover's score with the gap taken out: `raw − (expected − ½)`. */
  score: number;
  /** The games' split with the gap taken out, draws kept: White, draws, Black. */
  split: Split;
  games: number;
  /**
   * Where the opponents' rating comes from: the replies after the move, or, when most games there
   * came by another order, the players of the move that led here (`led`), plus `follow` of the
   * players' distance from this position's average (`movers`), fitted to `fitted` known moves.
   */
  from: 'after' | 'before';
  /** The games at the position after the move per game of the move's own (1: no other way in). */
  inflow: number;
  led?: { san: string; rating: number };
  movers?: number;
  follow?: number;
  fitted?: number;
}

/**
 * Why a row has no score at equal ratings: no games or rating of its own, nothing rated after it,
 * or most games after it came by another order and the position before can't stand in
 * (`inflow`), or is still asked (`asking`).
 */
export type EqualMissing = 'unrated' | 'none' | 'inflow' | 'asking';

export const isEqual = (x: EqualScore | EqualMissing | undefined): x is EqualScore => typeof x === 'object';

/**
 * How far the opponents' rating follows the players' distance from the average here: the
 * least-squares slope through the position's averages over the known moves, with the prior as a
 * move of weight FOLLOW_WEIGHT; between 0 and 1.
 */
export function followAt(known: readonly { rating: number; opponent: number }[], movers: number, led: number, prior: number): number {
  let xy = FOLLOW_WEIGHT * prior;
  let xx = FOLLOW_WEIGHT;
  for (const k of known) {
    const x = k.rating - movers;
    xy += x * (k.opponent - led);
    xx += x * x;
  }
  return Math.min(1, Math.max(0, xy / xx));
}

/**
 * The opponents' rating from the position itself: the rating of the move that led here (its players
 * are the opponents in every game here), plus `followAt` of the move's players' distance from the
 * average of this position's movers. Undefined when the position has other ways in too, or a rating
 * is missing.
 */
export function opponentsBefore(rating: number, before: EqualBefore): { rating: number; movers: number; follow: number; fitted: number } | undefined {
  const { here, led } = before;
  const movers = moverRating(here);
  if (!movers || typeof led.rating !== 'number' || !(led.games > 0) || here.total > INFLOW * led.games) return undefined;
  const known = before.known ?? [];
  const follow = followAt(known, movers.rating, led.rating, before.prior);
  return { rating: led.rating + follow * (rating - movers.rating), movers: movers.rating, follow, fitted: known.length };
}

/**
 * A move's score at equal ratings: `row` the move's games (with its players' average rating), and
 * `child` the answer at the position after it, under the same filter. When the position after holds
 * over INFLOW times the move's games, `before` (the row's position and the move that led to it;
 * 'asking' while it is asked) gives the opponents instead; without it the replies still serve up to
 * INFLOW_MAX.
 */
export function equalScore(
  row: { white: number; draws: number; black: number; rating?: number | undefined },
  child: CompactExplorer | undefined,
  turn: Side,
  before?: EqualBefore | 'asking',
  curve: Curve = 'lichess',
): EqualScore | EqualMissing {
  const games = row.white + row.draws + row.black;
  if (!(games > 0) || typeof row.rating !== 'number') return 'unrated';
  const replies = moverRating(child);
  if (!child || !replies) return 'none';
  const inflow = Math.max(1, child.total / games);
  let opponent = replies.rating;
  let from: EqualScore['from'] = 'after';
  let via: Pick<EqualScore, 'led' | 'movers' | 'follow' | 'fitted'> | undefined;
  if (inflow > INFLOW) {
    const known = before === 'asking' ? undefined : before;
    const est = known && opponentsBefore(row.rating, known);
    if (known && est) {
      opponent = est.rating;
      from = 'before';
      via = { led: { san: known.led.san, rating: known.led.rating! }, movers: est.movers, follow: est.follow, fitted: est.fitted };
    } else if (before === 'asking') return 'asking';
    else if (inflow > INFLOW_MAX) return 'inflow';
  }
  const split = { w: row.white / games, d: row.draws / games, b: row.black / games };
  const raw = (turn === 'w' ? split.w : split.b) + split.d / 2;
  const gap = row.rating - opponent;
  const slope = slopeAt((row.rating + opponent) / 2, curve);
  const expected = eloExpected(slope * gap);
  const shifted = shiftSplit(split, turn, expected - 0.5);
  const score = (turn === 'w' ? shifted.w : shifted.b) + shifted.d / 2;
  return { rating: row.rating, opponent, gap, raw, expected, curve, slope, score, split: shifted, games, from, inflow, ...via };
}

/**
 * The prepared split (§5.24) at equal ratings: only its games' part, `1 − prior`, carries the gap;
 * the Practical value it rests on for the rest comes from engine evals. The row's gap stands in
 * for every leaf's: the leaves' games are the row's games, split by the replies.
 */
export function equalPrepared(prep: Split, prior: number, eq: EqualScore, side: Side): Split {
  return shiftSplit(prep, side, (eq.expected - 0.5) * (1 - Math.min(1, Math.max(0, prior))));
}

const pct = (f: number) => Math.round(f * 100);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** Where the opponents' rating came from, in a sentence. */
export function equalSource(eq: EqualScore): string {
  const through = pct(1 / eq.inflow);
  if (eq.from === 'before' && eq.led && eq.movers !== undefined && eq.follow !== undefined) {
    const off = Math.round(eq.rating - eq.movers);
    const fit = eq.fitted ? `fitted to ${eq.fitted} move${eq.fitted === 1 ? '' : 's'} here whose opponents are known, and the filter` : 'from the filter alone';
    return (
      `The opponents’ rating is estimated: only ${through}% of the games after this move came through it, the rest by another move order. ` +
      `Taken as ${eq.led.san}’s players’ rating here (${Math.round(eq.led.rating)}), plus ${pct(eq.follow)}% of these players’ ${signed(off)} against this position’s average (${Math.round(eq.movers)}): how far opponents follow their players here, ${fit}.`
    );
  }
  return through >= 98 ? 'The opponents’ rating: the replies after this move.' : `The opponents’ rating: the replies after this move (${through}% of the games there came through it).`;
}

/** Which curve turned the gap into a score, in a few words. */
export function curveNote(eq: Pick<EqualScore, 'curve' | 'slope'>): string {
  return eq.curve === 'elo' ? 'on Elo’s curve' : `on Lichess’s curve (${eq.slope.toFixed(2)} of Elo’s slope at these ratings)`;
}

/** A bar's details at equal ratings: the score, the games' own, the gap behind the difference, and where the opponents' rating came from. */
export function equalDetails(eq: EqualScore, turn: Side): string[] {
  const who = turn === 'w' ? 'White' : 'Black';
  const gap = Math.round(eq.gap);
  return [
    `At equal ratings: ${pct(eq.score)}% for ${who} (the games: ${pct(eq.raw)}%)`,
    `Its players averaged ${Math.round(eq.rating)}, their opponents ${Math.round(eq.opponent)} (${signed(gap)}), which predicts ${pct(eq.expected)}% ${curveNote(eq)}.`,
    equalSource(eq),
    `${pct(eq.split.w)} / ${pct(eq.split.d)} / ${pct(eq.split.b)} after taking that out of the wins and losses · ${eq.games.toLocaleString('en-US')} games`,
  ];
}

/** The line a prepared bar adds at equal ratings: the score before and after, the row's gap, and where the opponents' rating came from. */
export function equalPreparedLine(before: Split, after: Split, prior: number, eq: EqualScore, side: Side): string {
  const score = (s: Split) => pct((side === 'w' ? s.w : s.b) + s.d / 2);
  return `At equal ratings: ${score(after)}% (${score(before)}% before). The move’s players averaged ${Math.round(eq.rating)}, their opponents ${Math.round(eq.opponent)} (${signed(Math.round(eq.gap))}); ${pct(1 - prior)}% of it rests on games. ${equalSource(eq)}`;
}
