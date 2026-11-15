// Endgames (PLAN.md §5.145): where each stands, read from the practice results at its start
// position, and a try started as a practice game of kind `endgame` (Maia's defence checked by
// Stockfish, §5.147, each move judged for the goal: src/app/practice.ts).
import { computed, signal } from '@preact/signals';
import { keyFen } from '../core/chess/positionKey.ts';
import { attemptsByEndgame, ENDGAME_PRESET, ENDGAMES, sideOf, standingOf, type Attempt, type Endgame, type Standing } from '../core/endgames/endgames.ts';
import { warmEndgameLc0 } from './endgameLc0.ts';
import { endgameMaiaAlone } from './endgameVariety.ts';
import { maiaState, maiaStored } from './maia.ts';
import { DEFAULT_OPPONENT, endgameMaia, startPractice } from './practice.ts';
import { practiceResults } from './repertoireCheck.ts';

/** Each endgame's tries, from every device's log. */
export const endgameAttempts = computed(() => attemptsByEndgame(practiceResults.value, (e) => keyFen(e.fen)?.key));

/** Every try at an endgame from `fen` (theoretical, the repertoire's or a course's), oldest first: for a grade's next time (§5.178). */
export function attemptsAt(fen: string): Attempt[] {
  const key = keyFen(fen)?.key;
  return practiceResults.value.filter((r) => r.preset === ENDGAME_PRESET && r.key === key).map((r) => ({ t: r.t, res: r.res, ...(r.g ? { g: r.g } : {}) }));
}

/** Where each endgame stands at `now`. */
export function endgameStandings(now: number): Map<string, Standing> {
  const attempts = endgameAttempts.value;
  return new Map(ENDGAMES.map((e) => [e.id, standingOf(e.goal, attempts.get(e.id) ?? [], now)]));
}

/** Whether Maia's files are on this device, so Maia defends (§5.147); undefined until known. */
export const endgameMaiaHere = signal<boolean | undefined>(undefined);

/** Looks again (on the list and a try's start, and after Maia's download). */
export function checkEndgameMaia(): void {
  void maiaStored()
    .catch(() => false)
    .then((here) => (endgameMaiaHere.value = here));
}

/** A try at an endgame, from its start: Maia started meanwhile when it is here, so its first answer doesn't wait on its loading. */
export function startEndgame(e: Endgame): void {
  checkEndgameMaia();
  void endgameMaia(e.fen);
  if (endgameMaiaAlone.peek()) warmEndgameLc0();
  startPractice({ kind: 'endgame', fen: e.fen, color: sideOf(e), silent: true, title: e.title, opponent: DEFAULT_OPPONENT, endgame: e });
}

// Maia downloaded (its dialog opened from the endgames): the next answer is Maia's.
let lastKind = maiaState.peek().kind;
maiaState.subscribe((s) => {
  if (s.kind === 'ready' && lastKind !== 'ready') checkEndgameMaia();
  lastKind = s.kind;
});
