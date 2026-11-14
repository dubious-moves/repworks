// Endgames from the user's courses (PLAN.md §5.175): the candidates are read live from the
// reference studies' chapters (`searchChapters`), scored by Stockfish on this device in the
// background (a button with progress and Stop, as the repertoire gather's), and kept in the storm
// store's `meta` (D5's cache tier); where each stands is read from the practice results at its
// start as the other endgames' are (`practice` events with the preset `endgame`: nothing new is
// written or synced). A drill taken off the list is remembered here too.
import { computed, signal } from '@preact/signals';
import { keyFen } from '../core/chess/positionKey.ts';
import { candidatesOf, courseState, readCourseScore, scoreCandidate, type CourseDrill, type CourseScore } from '../core/endgames/courses.ts';
import { attemptsByEndgame, standingOf, type Standing } from '../core/endgames/endgames.ts';
import { positionOf } from '../core/storm/walk.ts';
import { scoreOf } from './repertoireEndgames.ts';
import { practiceResults } from './repertoireCheck.ts';
import { searchChapters } from './search.ts';
import { stormStore } from './storm.ts';

const SCORES_KEY = 'courseScores';
const REMOVED_KEY = 'courseRemoved';

/** The scores kept (by the chapter start's key); undefined until read. */
export const courseScores = signal<Map<string, CourseScore> | undefined>(undefined);
export const courseRemoved = signal<Set<string>>(new Set());

let loading: Promise<void> | undefined;
/** Reads the scores and the removed drills once (the list, the drill, the home's count). */
export function loadCourse(): Promise<void> {
  return (loading ??= Promise.all([stormStore().get<unknown[]>('meta', SCORES_KEY), stormStore().get<unknown[]>('meta', REMOVED_KEY)])
    .then(([scores, removed]) => {
      courseScores.value = new Map((Array.isArray(scores) ? scores : []).map(readCourseScore).filter((s): s is CourseScore => !!s).map((s) => [s.key, s]));
      courseRemoved.value = new Set((Array.isArray(removed) ? removed : []).filter((x): x is string => typeof x === 'string'));
    })
    .catch(() => {
      courseScores.value = new Map();
    }));
}

/** The candidates of the reference studies' chapters, as read. */
export const courseCandidates = computed(() => candidatesOf(searchChapters.value ?? []));

/** The course's state: drills, chapters with no goal, chapters still to score, drills removed. */
export const courseNow = computed(() => courseState(courseCandidates.value, courseScores.value ?? new Map(), courseRemoved.value));

export const courseById = (id: string): CourseDrill | undefined => courseNow.value.drills.find((d) => d.id === id);

/** Each drill's tries, from every device's log. */
const courseAttempts = computed(() =>
  attemptsByEndgame(
    practiceResults.value,
    (e) => keyFen(e.fen)?.key,
    courseNow.value.drills.map((d) => ({ id: d.id, fen: d.fen })),
  ),
);

/** Where each drill stands at `now`. */
export function courseStandings(now: number): Map<string, Standing> {
  const attempts = courseAttempts.value;
  return new Map(courseNow.value.drills.map((d) => [d.id, standingOf(d.goal, attempts.get(d.id) ?? [], now)]));
}

async function saveScores(): Promise<void> {
  await stormStore().put('meta', SCORES_KEY, [...(courseScores.peek()?.values() ?? [])]);
}

/** Takes a drill off the list (its tries stay in the log). */
export async function removeCourseDrill(id: string): Promise<void> {
  courseRemoved.value = new Set([...courseRemoved.value, id]);
  await stormStore().put('meta', REMOVED_KEY, [...courseRemoved.value]);
}

/** The drill just taken off from inside its practice, for the Undo on the next one (cleared by Undo or the next removal). */
export const courseJustRemoved = signal<{ id: string; title: string } | undefined>(undefined);

/** Puts one removed drill back (the Undo after a removal from the practice). */
export async function restoreCourseDrill(id: string): Promise<void> {
  courseRemoved.value = new Set([...courseRemoved.value].filter((x) => x !== id));
  await stormStore().put('meta', REMOVED_KEY, [...courseRemoved.value]);
}

/** Puts every removed drill back. */
export async function restoreCourseDrills(): Promise<void> {
  courseRemoved.value = new Set();
  await stormStore().put('meta', REMOVED_KEY, []);
}

/* ------------------------------------------------------------------ the scoring */

export interface CourseScoring {
  running: boolean;
  /** Chapters scored this time, of how many to score. */
  done: number;
  of: number;
  /** Drills made this time. */
  kept: number;
  note: string;
}

export const courseScoring = signal<CourseScoring | undefined>(undefined);
let stopAsked = false;

/**
 * Scores every candidate not scored yet, in the course's order, on this device: Stockfish at the
 * judges' depth for the side to move, and, where that side is the worse one, for the other side
 * after the course's first move (`scoreCandidate`). Kept as it goes, so a stopped scoring is
 * resumed by the next.
 */
export async function scoreCourse(): Promise<void> {
  if (courseScoring.value?.running) return;
  stopAsked = false;
  await loadCourse();
  const todo = courseNow.peek().todo;
  const g: CourseScoring = { running: true, done: 0, of: todo.length, kept: 0, note: '' };
  const show = () => (courseScoring.value = { ...g });
  show();
  let silent = 0;
  try {
    for (const c of todo) {
      if (stopAsked) break;
      const start = positionOf(c.fen);
      if (!start) continue;
      const s = await scoreCandidate(c, start, scoreOf, Date.now());
      if (stopAsked && !s) break;
      if (!s) {
        // Stockfish gave no answer: asked again next time; three in a row is a reason to stop.
        if (++silent >= 3) {
          g.note = 'Stockfish isn’t answering: scoring stopped. It picks up where it left off.';
          break;
        }
        continue;
      }
      silent = 0;
      courseScores.value = new Map([...(courseScores.peek() ?? []), [s.key, s]]);
      g.done++;
      if (s.drill) g.kept++;
      if (g.done % 5 === 0) await saveScores();
      show();
    }
    await saveScores();
    if (!g.note) g.note = stopAsked ? `Stopped: ${g.kept} drills from ${g.done} chapters scored.` : `Every chapter scored: ${g.kept} drills from ${g.done}.`;
  } catch (e) {
    await saveScores().catch(() => undefined);
    g.note = `Scoring stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    g.running = false;
    show();
  }
}

export function stopCourseScoring(): void {
  stopAsked = true;
}
