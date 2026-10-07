// How a game card's answer is judged (PLAN.md §5.55), mistake-lab's rules (`c525403`):
// `classifyWpDrop`, `classifyWithContext`, the SRS grades of its mistakes and tactics, and the
// move's loss from the engine's lines (its silent evaluation: the best line's score less the
// move's, read from the lines when the move is one of them, else from the position after it, a
// mate delivered counting +10,000 and a stalemate 0). Pure.
import type { Grade } from '../progress/events.ts';
import type { Color } from './record.ts';
import { winPct } from './extract.ts';

export type Classification = 'great' | 'best' | 'excellent' | 'good' | 'book' | 'miss' | 'inaccuracy' | 'mistake' | 'blunder';

/** mistake-lab's six words, with its symbols and colours. */
export const CLASSIFICATION: Record<Classification, { word: string; symbol: string; colour: string }> = {
  great: { word: 'Great move', symbol: '!', colour: '#5b9bd5' },
  best: { word: 'Best move', symbol: '★', colour: '#62cf8e' },
  excellent: { word: 'Excellent', symbol: '!', colour: '#96c84a' },
  good: { word: 'Good', symbol: '✓', colour: '#96bc4b' },
  book: { word: 'Book', symbol: '📖', colour: '#8b7dd8' },
  miss: { word: 'Miss', symbol: '✕', colour: '#e04040' },
  inaccuracy: { word: 'Inaccuracy', symbol: '?!', colour: '#e8a62d' },
  mistake: { word: 'Mistake', symbol: '?', colour: '#e07a3a' },
  blunder: { word: 'Blunder', symbol: '??', colour: '#ef5f5f' },
};

export function classifyWpDrop(wpDrop: number, exactBest: boolean): Classification {
  if (exactBest || wpDrop < 0.5) return 'best';
  if (wpDrop <= 2) return 'excellent';
  if (wpDrop <= 5) return 'good';
  if (wpDrop <= 10) return 'inaccuracy';
  if (wpDrop <= 15) return 'mistake';
  return 'blunder';
}

/** Great: the only good move (the second line 15 points worse), not already won; miss: an inaccuracy that let a clear win go. */
export function classifyWithContext(base: Classification, bestCp: number, pv2Cp: number | null, wpDrop: number): Classification {
  if (pv2Cp === null) return base;
  const gap = winPct(bestCp) - winPct(pv2Cp);
  if ((base === 'best' || base === 'excellent') && gap >= 15 && bestCp < 1000) return 'great';
  if (base === 'inaccuracy' && bestCp >= 300 && gap >= 10 && wpDrop <= 10) return 'miss';
  return base;
}

/** An engine line's first move and its score for the side to move, in centipawns (a mate as ±10,000, mistake-lab's). */
export interface MoverLine {
  move: string;
  cp: number;
}

/** A White-relative engine score as centipawns for `mover`, a mate as ±10,000 (mistake-lab's `evalToCp`). */
export function moverScore(score: { cp?: number; mate?: number }, mover: Color): number {
  const cp = typeof score.mate === 'number' ? (score.mate > 0 ? 10000 : -10000) : (score.cp ?? 0);
  return mover === 'white' ? cp : -cp;
}

export interface Judged {
  cpLoss: number;
  wpDrop: number;
  exactBest: boolean;
  classification: Classification;
  bestMove: string | undefined;
  bestCp: number;
}

/**
 * A move judged from the position's lines (the best first, for the side to move) and, when the
 * move isn't among them, the score after it for the same side (`afterCp`; for a position with no
 * move left, +10,000 when the move mates and 0 otherwise).
 */
export function judgeMove(lines: readonly MoverLine[], uci: string, afterCp: number | undefined): Judged | undefined {
  const best = lines[0];
  if (!best) return undefined;
  const matched = lines.find((l) => l.move === uci);
  let cpLoss: number;
  if (matched) cpLoss = best.cp - matched.cp;
  else if (afterCp !== undefined) cpLoss = best.cp - afterCp;
  else return undefined;
  // A move at least as good as the best (a mate the lines missed) is the best.
  cpLoss = Math.max(0, cpLoss);
  const wpDrop = winPct(best.cp) - winPct(best.cp - cpLoss);
  const exactBest = best.move === uci || wpDrop < 0.5;
  const base = classifyWpDrop(wpDrop, exactBest);
  const classification = classifyWithContext(base, best.cp, lines[1]?.cp ?? null, wpDrop);
  return { cpLoss: Math.round(cpLoss), wpDrop: Math.round(wpDrop * 10) / 10, exactBest, classification, bestMove: best.move, bestCp: best.cp };
}

/**
 * A mistake card's grade, mistake-lab's: a hint, or a first try that failed, is Again; else by the
 * win% given up: best or within 2 Easy, 5 Good, 10 Hard, more Again.
 */
export function mistakeGrade(a: { wpDrop: number; exactBest: boolean; hint?: boolean; failedBefore?: boolean }): Grade {
  if (a.hint || a.failedBefore) return 1;
  if (a.exactBest || a.wpDrop <= 2) return 4;
  if (a.wpDrop <= 5) return 3;
  if (a.wpDrop <= 10) return 2;
  return 1;
}

/** A tactic's: any wrong move Again, a hint alone Hard, perfect Easy. */
export function tacticGrade(a: { wrong: number; hint: boolean }): Grade {
  if (a.wrong > 0) return 1;
  return a.hint ? 2 : 4;
}

/** Whether an answer counts as found (a retry is offered otherwise): mistake-lab's "good enough", within 5 points. */
export const goodEnough = (wpDrop: number, exactBest: boolean) => exactBest || wpDrop <= 5;
