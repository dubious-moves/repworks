// Grades (PLAN.md §5.2): right or wrong, as Chessable grades, the owner's choice (§5.13). Time
// doesn't grade; FSRS spaces each move by its own record. Mistake-lab's time-based rule stays
// with its mistakes and missed tactics (Phase 5).
import type { Grade } from '../progress/events.ts';

export interface Answer {
  /** Moves tried before the right one: not in the repertoire here. */
  wrong: number;
  /** Whether the move was shown before it was played. */
  hint: boolean;
}

/** Good when right first time, else Again. */
export const grade = (answer: Answer): Grade => (answer.wrong === 0 && !answer.hint ? 3 : 1);

/** Show and grade (§5.9): the owner says whether they knew the move. */
export const selfGrade = (knew: boolean): Grade => (knew ? 3 : 1);
