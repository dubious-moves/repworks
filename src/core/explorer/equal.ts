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
// Elo's curve is close to straight over the gaps found (tens of points), so the gap of the
// averages stands in for the average of each game's gap. Pure.
import type { CompactExplorer } from './providers.ts';
import type { Side, Split } from './search.ts';

/** Elo's expected score for a player `gap` points above the opponent. */
export function eloExpected(gap: number): number {
  return 1 / (1 + 10 ** (-gap / 400));
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

export interface EqualScore {
  /** The average rating of the move's players, and of their opponents. */
  rating: number;
  opponent: number;
  /** `rating − opponent`. */
  gap: number;
  /** The mover's score in the games, 0 to 1, and what the gap predicts. */
  raw: number;
  expected: number;
  /** The mover's score with the gap taken out: `raw − (expected − ½)`. */
  score: number;
  /** The games' split with the gap taken out, draws kept: White, draws, Black. */
  split: Split;
  games: number;
}

/**
 * A move's score at equal ratings: `row` the move's games (with its players' average rating), and
 * `child` the answer at the position after it, under the same filter. Undefined without games, a
 * rating, or rated replies after it.
 */
export function equalScore(row: { white: number; draws: number; black: number; rating?: number | undefined }, child: CompactExplorer | undefined, turn: Side): EqualScore | undefined {
  const games = row.white + row.draws + row.black;
  if (!(games > 0) || typeof row.rating !== 'number') return undefined;
  const opp = moverRating(child);
  if (!opp) return undefined;
  const split = { w: row.white / games, d: row.draws / games, b: row.black / games };
  const raw = (turn === 'w' ? split.w : split.b) + split.d / 2;
  const gap = row.rating - opp.rating;
  const expected = eloExpected(gap);
  const shifted = shiftSplit(split, turn, expected - 0.5);
  const score = (turn === 'w' ? shifted.w : shifted.b) + shifted.d / 2;
  return { rating: row.rating, opponent: opp.rating, gap, raw, expected, score, split: shifted, games };
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

/** A bar's details at equal ratings: the score, the games' own, and the gap behind the difference. */
export function equalDetails(eq: EqualScore, turn: Side): string[] {
  const who = turn === 'w' ? 'White' : 'Black';
  const gap = Math.round(eq.gap);
  return [
    `At equal ratings: ${pct(eq.score)}% for ${who} (the games: ${pct(eq.raw)}%)`,
    `Its players averaged ${Math.round(eq.rating)}, their opponents ${Math.round(eq.opponent)} (${signed(gap)}), which predicts ${pct(eq.expected)}%.`,
    `${pct(eq.split.w)} / ${pct(eq.split.d)} / ${pct(eq.split.b)} after taking that out of the wins and losses · ${eq.games.toLocaleString('en-US')} games`,
  ];
}

/** The line a prepared bar adds at equal ratings: the score before and after, and the row's gap. */
export function equalPreparedLine(before: Split, after: Split, prior: number, eq: EqualScore, side: Side): string {
  const score = (s: Split) => pct((side === 'w' ? s.w : s.b) + s.d / 2);
  return `At equal ratings: ${score(after)}% (${score(before)}% before). The move’s players averaged ${Math.round(eq.rating)}, their opponents ${Math.round(eq.opponent)} (${signed(Math.round(eq.gap))}); ${pct(1 - prior)}% of it rests on games.`;
}
