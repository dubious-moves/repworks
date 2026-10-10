// Maia on the storm's positions (PLAN.md §5.82, the owner's request of 2026-10-10): how hard a
// position is, as the rating at which Maia finds a good move half the time, and whether it is
// unintuitive, Maia's most likely move at the user's rating not being a good one. Maia's policy is
// asked once per position and rating, in the background, and kept with the position; everything
// here is worked out from it and the position's list, so a deepened list re-judges it for free.
// Pure.
import type { Band, StormConfig } from './config.ts';
import { grade, wpLoss, type ScoredList } from './grade.ts';

/** The ratings a position is rated at; the user's own is asked besides when it isn't one of them. */
export const MAIA_LADDER: readonly number[] = [1000, 1400, 1800, 2200, 2600];
/** Moves Maia gives less than this are not kept. */
const KEEP_PROB = 0.005;
/** A share needs this much of Maia's likelihood on moves the list can judge. */
const JUDGED_MIN = 0.6;

/** Maia's policy at one rating, as kept: standard UCI and likelihood, the most likely first. */
export interface MaiaRating {
  elo: number;
  moves: [string, number][];
}

/** A policy as kept with a position: the likely moves only, to three decimals. */
export function keptPolicy(elo: number, policy: readonly { uci: string; prob: number }[]): MaiaRating {
  const moves = policy
    .filter((m) => m.prob >= KEEP_PROB)
    .map((m): [string, number] => [m.uci, Math.round(m.prob * 1000) / 1000])
    .sort((a, b) => b[1] - a[1]);
  return { elo, moves };
}

/** The ratings a position still wants: the ladder's and the user's, those it has left out. */
export function missingRatings(have: readonly MaiaRating[] | undefined, userElo: number): number[] {
  const want = MAIA_LADDER.includes(userElo) ? MAIA_LADDER : [...MAIA_LADDER, userElo];
  return want.filter((e) => !have?.some((r) => r.elo === e));
}

/** Whether a list can judge a move (§5.80, §5.84): Stockfish's at `judgeDepth` or deeper, never ChessDB's. */
export function listJudges(list: ScoredList, c: StormConfig): boolean {
  return list.length > 0 && list.source === 'sf' && (list.depth ?? 0) >= c.judgeDepth;
}

export interface MoveJudged {
  /** Great or good: found, as the storm counts it. Null when the list can't tell. */
  clean: boolean | null;
  /** The move's band when the list has it. */
  band?: Band;
}

/**
 * A move judged by the position's list alone, a Stockfish list deep enough to judge (§5.84). A move
 * outside it is no better than its last line, so it is not clean when that line isn't.
 */
export function judgeMove(list: ScoredList, uci: string, c: StormConfig): MoveJudged {
  if (!listJudges(list, c)) return { clean: null };
  const best = list[0]!.score;
  const m = list.find((x) => x.uci === uci);
  if (m) {
    const band = grade(wpLoss(best, m.score, c), c);
    return band === 'unknown' ? { clean: null } : { clean: c.storeDropOn.includes(band), band };
  }
  const last = grade(wpLoss(best, list[list.length - 1]!.score, c), c);
  return { clean: last === 'unknown' || c.storeDropOn.includes(last) ? null : false };
}

/**
 * How often Maia at one rating plays a good move here: its likelihood on clean moves over its
 * likelihood on moves the list can judge. Null when too little of it can be judged.
 */
export function foundShare(r: MaiaRating, list: ScoredList, c: StormConfig): number | null {
  let clean = 0;
  let judged = 0;
  for (const [uci, p] of r.moves) {
    const j = judgeMove(list, uci, c);
    if (j.clean === null) continue;
    judged += p;
    if (j.clean) clean += p;
  }
  return judged >= JUDGED_MIN ? clean / judged : null;
}

export interface Difficulty {
  /** The rating at which Maia finds a good move half the time, to the nearest 50. */
  elo: number;
  /** Found half the time already at the ladder's lowest rating, or not yet at its highest. */
  edge?: 'below' | 'above';
}

/**
 * A position's difficulty: where Maia's share of good moves crosses one half, going up the ladder
 * (straight between two ratings). Null without a list that judges, or with fewer than two ratings
 * it can judge.
 */
export function difficulty(ratings: readonly MaiaRating[] | undefined, list: ScoredList, c: StormConfig): Difficulty | null {
  if (!ratings || !listJudges(list, c)) return null;
  const points = ratings
    .filter((r) => MAIA_LADDER.includes(r.elo))
    .map((r) => ({ elo: r.elo, share: foundShare(r, list, c) }))
    .filter((x): x is { elo: number; share: number } => x.share !== null)
    .sort((a, b) => a.elo - b.elo);
  if (points.length < 2) return null;
  if (points[0]!.share >= 0.5) return { elo: points[0]!.elo, edge: 'below' };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.share < 0.5) continue;
    const elo = a.elo + ((0.5 - a.share) / (b.share - a.share)) * (b.elo - a.elo);
    return { elo: Math.round(elo / 50) * 50 };
  }
  return { elo: points[points.length - 1]!.elo, edge: 'above' };
}

/** Maia's most likely move at `elo`, with its likelihood; none when the position wasn't rated there. */
export function maiaChoice(ratings: readonly MaiaRating[] | undefined, elo: number): { uci: string; prob: number } | null {
  const top = ratings?.find((r) => r.elo === elo)?.moves[0];
  return top ? { uci: top[0], prob: top[1] } : null;
}

/** Unintuitive at `elo`: Maia's most likely move there is judged, and isn't a good move. */
export function unintuitive(ratings: readonly MaiaRating[] | undefined, elo: number, list: ScoredList, c: StormConfig): boolean {
  const top = maiaChoice(ratings, elo);
  return !!top && judgeMove(list, top.uci, c).clean === false;
}

const MOVE_WORD: Record<string, string> = { great: 'a great move', good: 'a good move', ok: 'an inaccuracy', bad: 'a mistake', blunder: 'a blunder' };
const percent = (p: number) => `${Math.round(p * 100)}%`;

/** A difficulty in a few words: "≈1850", "1000 or less", "over 2600". */
export function difficultyWords(d: Difficulty): string {
  return d.edge === 'below' ? `${d.elo} or less` : d.edge === 'above' ? `over ${d.elo}` : `≈${d.elo}`;
}

/**
 * What Maia says of a position once it is answered: its difficulty, how often Maia at the user's
 * rating finds a good move, and its likeliest move with the list's word for it ("Difficulty ≈1850.
 * Maia at 1500 finds a good move 38% of the time; its likeliest, Nf3 (41%), is a mistake."). `san`
 * names a move. Empty when Maia hasn't rated it, or the list can't judge.
 */
export function maiaLine(ratings: readonly MaiaRating[] | undefined, elo: number, list: ScoredList, san: (uci: string) => string, c: StormConfig): string {
  if (!ratings || !listJudges(list, c)) return '';
  const out: string[] = [];
  const d = difficulty(ratings, list, c);
  if (d) out.push(`Difficulty ${difficultyWords(d)}.`);
  const at = ratings.find((r) => r.elo === elo);
  const share = at ? foundShare(at, list, c) : null;
  const top = maiaChoice(ratings, elo);
  const bits: string[] = [];
  if (share !== null) bits.push(`finds a good move ${percent(share)} of the time`);
  if (top) {
    const j = judgeMove(list, top.uci, c);
    const word = j.band ? MOVE_WORD[j.band] : j.clean === false ? 'not a good move' : '';
    if (word) bits.push(`its likeliest, ${san(top.uci) || top.uci} (${percent(top.prob)}), is ${word}`);
  }
  if (bits.length) out.push(`Maia at ${elo} ${bits.join('; ')}.`);
  return out.join(' ');
}
