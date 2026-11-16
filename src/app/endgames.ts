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
import { cleanSideChoice, type SideChoice } from '../core/chess/sideChoice.ts';

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

/**
 * Focus on mistakes (§5.180): the page and its Next hold to the endgames missed in one of their
 * last five tries, due or not. Kept on the device, as "Course only" is.
 */
const MISTAKES_KEY = 'repworks-endgames-mistakes';
function readMistakes(): boolean {
  try {
    return localStorage.getItem(MISTAKES_KEY) === '1';
  } catch {
    return false;
  }
}
export const mistakesOnly = signal(readMistakes());
export function setMistakesOnly(on: boolean): void {
  mistakesOnly.value = on;
  try {
    if (on) localStorage.setItem(MISTAKES_KEY, '1');
    else localStorage.removeItem(MISTAKES_KEY);
  } catch {
    // Not kept: the choice is a convenience.
  }
}

/**
 * The colour played (§5.195): the endgames the user plays as White or Black alone, on the page, its
 * Next and what's due on the home. Kept on the device; both by default.
 */
const SIDE_KEY = 'repworks-endgames-side';
function readSide(): SideChoice {
  try {
    return cleanSideChoice(localStorage.getItem(SIDE_KEY));
  } catch {
    return 'both';
  }
}
export const endgameSide = signal<SideChoice>(readSide());
export function setEndgameSide(c: SideChoice): void {
  endgameSide.value = c;
  try {
    if (c === 'both') localStorage.removeItem(SIDE_KEY);
    else localStorage.setItem(SIDE_KEY, c);
  } catch {
    // Not kept: the choice is a convenience.
  }
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
