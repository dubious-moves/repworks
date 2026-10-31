// Endgames (PLAN.md §5.145): where each stands, read from the practice results at its start
// position, and a try started as a practice game of kind `endgame` (Stockfish's defence, each move
// judged for the goal: src/app/practice.ts).
import { computed } from '@preact/signals';
import { keyFen } from '../core/chess/positionKey.ts';
import { attemptsByEndgame, ENDGAMES, sideOf, standingOf, type Endgame, type Standing } from '../core/endgames/endgames.ts';
import { DEFAULT_OPPONENT, startPractice } from './practice.ts';
import { practiceResults } from './repertoireCheck.ts';

/** Each endgame's tries, from every device's log. */
export const endgameAttempts = computed(() => attemptsByEndgame(practiceResults.value, (e) => keyFen(e.fen)?.key));

/** Where each endgame stands at `now`. */
export function endgameStandings(now: number): Map<string, Standing> {
  const attempts = endgameAttempts.value;
  return new Map(ENDGAMES.map((e) => [e.id, standingOf(e.goal, attempts.get(e.id) ?? [], now)]));
}

/** A try at an endgame, from its start. */
export function startEndgame(e: Endgame): void {
  startPractice({ kind: 'endgame', fen: e.fen, color: sideOf(e), silent: true, title: e.title, opponent: DEFAULT_OPPONENT, endgame: e });
}
