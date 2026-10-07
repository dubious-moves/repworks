// The set (PLAN.md §5.44; DESIGN-intuition-storm.md §17), ported from lichessable's shipped
// `stormSetClean`, `stormSetHeld`, `stormSetOutcome` and `stormSetTally`. No clock: a clean answer
// resolves a position; anything worse holds it until it is found (three tries) or shown. Pure.
import type { Band, StormConfig } from './config.ts';

export type SetOutcome = 'first' | 'retry' | 'shown' | 'missed' | 'unknown';

/** An answer that resolves a position (and, written out separately on purpose, retires it). */
export function setClean(verdict: Band, c: StormConfig): boolean {
  return c.setCleanOn.includes(verdict);
}

/** An answer that holds the position. `unknown` doesn't: there is nothing to correct (§17.4). */
export function setHeld(verdict: Band | undefined, c: StormConfig): boolean {
  if (!verdict || verdict === 'unknown') return false;
  return !setClean(verdict, c);
}

/** How a position ended: found at the first attempt, at a later one, shown, missed, or ungradeable. */
export function setOutcome(attempts: number, verdict: Band, revealed: boolean, c: StormConfig): SetOutcome {
  if (verdict === 'unknown') return 'unknown';
  if (revealed) return 'shown';
  if (setClean(verdict, c)) return attempts <= 1 ? 'first' : 'retry';
  return 'missed';
}

export interface SetEntry {
  outcome?: SetOutcome;
  /** The second pass's outcome, for a position not found first time. */
  secondOutcome?: SetOutcome;
}

export interface SetTally {
  asked: number;
  resolved: number;
  first: number;
  retry: number;
  shown: number;
  missed: number;
  unknown: number;
  /** Asked again in the second pass, and found there. */
  again: number;
  againClean: number;
}

/** The set's score: above all how many were found first time. */
export function setTally(set: readonly SetEntry[]): SetTally {
  const t: SetTally = { asked: 0, resolved: 0, first: 0, retry: 0, shown: 0, missed: 0, unknown: 0, again: 0, againClean: 0 };
  for (const e of set) {
    t.asked++;
    if (!e.outcome) continue;
    t.resolved++;
    t[e.outcome]++;
    if (e.secondOutcome) {
      t.again++;
      if (e.secondOutcome === 'first' || e.secondOutcome === 'retry') t.againClean++;
    }
  }
  return t;
}
