// What a storm answer says (PLAN.md §5.39, §5.43), ported from lichessable's shipped
// `stormCp`, `stormWp`, `stormVerdictLine`, `stormBestLine`, `stormSourceLabel`,
// `stormSourceTitle`, `stormEstimated` and `stormGapNote`. The first line says how the move did
// (read in about a second with the clock running); the second names the best move and where the
// numbers came from. Pure.
import type { Band } from './config.ts';

/**
 * How a move was graded, by Stockfish only (§5.84): the stored list (`sflist`), or searches now
 * (`engine`).
 */
export type VerdictSource = 'sflist' | 'engine';

export interface Verdict {
  verdict: Band | 'unanswered';
  /** The user's move, SAN. */
  userSan?: string;
  userUci?: string;
  /** 1-based in the scored list; null when the child or the engine scored it. */
  rank?: number | null;
  /** Win% given up. */
  wp?: number | null;
  /** Centipawns behind the best. */
  loss?: number | null;
  points?: number;
  userScore?: number;
  userWinrate?: number | undefined;
  source?: VerdictSource;
  /** The engine's depth, for `engine` and `sflist`. */
  depth?: number;
  /** The engine tier's best move and score (both halves from one evaluator, §14.8). */
  bestSan?: string;
  bestScore?: number;
  /** One search after a stored engine list rather than two (§23). */
  oneSearch?: boolean;
  passed?: boolean;
  unanswered?: boolean;
  puzzle?: boolean;
}

/** The card's side of the line: its best move, score and win rate, and how many moves were scored. */
export interface CardFacts {
  bestSan: string;
  bestScore: number;
  bestWinrate?: number | undefined;
  nScored: number;
  /** The uncovered reply the card is about (§19), if any. */
  unc?: { san: string; share: number } | null;
}

/** Centipawns as pawns with two decimals and a sign; '' for none. */
export function formatCp(cp: number | null | undefined): string {
  if (typeof cp !== 'number' || !Number.isFinite(cp)) return '';
  const r = (cp / 100).toFixed(2);
  return Math.abs(Number(r)) < 0.005 ? '0.00' : Number(r) > 0 ? '+' + r : r;
}

/** Win% given up: one decimal under ten, none above. */
export function formatWp(wp: number | null | undefined): string {
  if (typeof wp !== 'number' || !Number.isFinite(wp)) return '';
  return (wp < 10 ? wp.toFixed(1) : String(Math.round(wp))) + '%';
}

export function formatShare(share: number | null | undefined): string {
  if (typeof share !== 'number' || !Number.isFinite(share)) return '';
  return (share < 10 ? share.toFixed(1) : String(Math.round(share))) + '%';
}

/** The first line: the move, its place, the game it gave up, the points (signed). */
export function verdictLine(v: Verdict, s: CardFacts): string {
  if (v.unanswered) return v.userSan ? v.userSan + ' — the storm ended before it was graded' : 'Not answered — the storm ended on this position';
  if (v.passed) return 'Passed — no answer given';
  if (v.verdict === 'unknown') return (v.userSan || 'that move') + ' — nothing could score it here';
  const bits = [v.userSan || 'your move'];
  if (v.rank === 1) bits.push('the top move');
  else if (v.rank) bits.push('#' + v.rank + ' of ' + s.nScored);
  if (typeof v.wp === 'number') bits.push(v.wp < 0.05 ? 'level with the best' : formatWp(v.wp) + ' of the game');
  if (v.points) bits.push((v.points > 0 ? '+' : '') + v.points);
  return bits.join(' · ');
}

const fromEngine = (v: Verdict) => !!v.source && typeof v.bestScore === 'number';

/** Where the numbers came from, in a few words; '' for a puzzle or no source. */
export function sourceLabel(v: Verdict): string {
  if (v.puzzle) return '';
  return v.source ? 'by Stockfish' + (v.depth ? ' d' + v.depth : '') : '';
}

/** The second line: the best move (the engine's when the engine graded), the user's when it differs, the source. */
export function bestLine(v: Verdict, s: CardFacts): string {
  const pct = (w: number | undefined) => (typeof w === 'number' ? Math.round(w) + '%' : '');
  const eng = fromEngine(v);
  const bestSan = eng ? v.bestSan || '?' : s.bestSan || '?';
  const bestScore = eng ? v.bestScore : s.bestScore;
  const bw = eng ? '' : pct(s.bestWinrate);
  const parts = ['best ' + bestSan + ' ' + formatCp(bestScore) + (bw ? ' · ' + bw : '')];
  const same = v.rank === 1 || (v.userSan && v.userSan === bestSan);
  if (!same && v.userSan && typeof v.userScore === 'number') {
    const yw = eng ? '' : pct(v.userWinrate);
    parts.push(v.userSan + ' ' + formatCp(v.userScore) + (yw ? ' · ' + yw : ''));
  }
  const src = sourceLabel(v);
  if (src) parts.push('· ' + src);
  return parts.join('   ');
}

/** The sentence behind the source's label, one per source. */
export function sourceTitle(v: Verdict | null | undefined): string {
  if (!v) return '';
  if (v.puzzle) return 'A Lichess puzzle: the solution is published with it, so nothing was evaluated here — the move was either the solution or it was not.';
  const depth = v.depth ? ' to depth ' + v.depth : '';
  if (v.source === 'sflist') return 'This position was scored by Stockfish' + depth + ' before you moved, and your move is in that list: the best move and yours come from one search of one position.';
  if (v.source === 'engine') {
    if (v.oneSearch) return 'Your move is not in the list Stockfish stored for this position, so the position after it was searched now' + depth + ' and compared with the stored score: one engine.';
    return 'Stockfish had not yet scored this position deeply enough to judge, so two searches' + depth + ' graded your move: the position and the position after it, from one engine.';
  }
  return '';
}

/** The uncovered reply a card is about (§19), or ''. */
export function gapNote(s: CardFacts): string {
  const u = s.unc;
  if (!u) return '';
  const share = formatShare(u.share);
  return 'after ' + (u.san || 'that reply') + ', which your repertoire doesn’t answer' + (share ? ' · ' + share + ' of games here' : '');
}
