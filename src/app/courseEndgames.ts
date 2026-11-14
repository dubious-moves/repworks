// Endgames from the user's courses (PLAN.md §5.175): the candidates are read live from the
// reference studies' chapters (`searchChapters`), scored by Stockfish on this device in the
// background (a button with progress and Stop, as the repertoire gather's). The scores and the
// drills taken off the list are synced: `cscore` and `cdrill` events in the device's progress log
// (cards `e|<chapter start's key>`), so a course scored on one device is a course on every device
// and a removal holds everywhere; where each stands is read from the practice results at its
// start as the other endgames' are (`practice` events with the preset `endgame`, synced as they
// are). The storm store's `meta` held them on the device alone before: read once, written to the
// log, and cleared (`migrateLegacy`).
import { computed, effect, signal } from '@preact/signals';
import { keyFen, type PositionKey } from '../core/chess/positionKey.ts';
import { candidatesOf, courseFromLog, courseId, courseState, readCourseScore, scoreCandidate, type CourseDrill, type CourseScore } from '../core/endgames/courses.ts';
import { attemptsByEndgame, standingOf, type Standing } from '../core/endgames/endgames.ts';
import { courseCard } from '../core/progress/cards.ts';
import { positionOf } from '../core/storm/walk.ts';
import { scoreOf } from './repertoireEndgames.ts';
import { practiceResults } from './repertoireCheck.ts';
import { searchChapters } from './search.ts';
import { recordEvents } from './state.ts';
import { stormStore } from './storm.ts';
import { trainData } from './train.ts';

const SCORES_KEY = 'courseScores';
const REMOVED_KEY = 'courseRemoved';

/** What the log says, once the training data is read. */
const logged = computed(() => {
  const data = trainData.value;
  return data ? courseFromLog(data.states.keys(), data.eventsOf) : undefined;
});
/**
 * Scores made on this device and removals made here, shown before the log has been read again; one
 * gives way as soon as the log has something as new for that chapter (another device's later change
 * must not be hidden by an older one made here).
 */
const madeHere = signal<Map<string, CourseScore>>(new Map());
const removedHere = signal<Map<string, { on: boolean; at: number }>>(new Map());

/** The scores (by the chapter start's key), every device's; undefined until the log is read. */
export const courseScores = computed<Map<string, CourseScore> | undefined>(() => {
  const l = logged.value;
  if (!l) return undefined;
  const out = new Map(l.scores);
  for (const [key, s] of madeHere.value) if (s.at > (out.get(key)?.at ?? -1)) out.set(key, s);
  return out;
});
/** The ids of the drills taken off the list. */
export const courseRemoved = computed<Set<string>>(() => {
  const l = logged.value;
  const keys = new Set(l?.removed ?? []);
  for (const [key, h] of removedHere.value) {
    if (h.at <= (l?.removedAt.get(key) ?? -1)) continue;
    if (h.on) keys.add(key);
    else keys.delete(key);
  }
  return new Set([...keys].map(courseId));
});

let loading: Promise<void> | undefined;
let legacy: { scores: CourseScore[]; removed: string[] } | undefined;
/** Reads what this device kept before the scores were synced, once (the list, the drill, the home's count). */
export function loadCourse(): Promise<void> {
  return (loading ??= Promise.all([stormStore().get<unknown[]>('meta', SCORES_KEY), stormStore().get<unknown[]>('meta', REMOVED_KEY)])
    .then(([scores, removed]) => {
      const kept = (Array.isArray(scores) ? scores : []).map(readCourseScore).filter((x): x is CourseScore => !!x);
      const gone = (Array.isArray(removed) ? removed : []).filter((x): x is string => typeof x === 'string');
      if (kept.length || gone.length) legacy = { scores: kept, removed: gone };
      return migrateLegacy();
    })
    .catch(() => undefined));
}

/**
 * Writes what this device kept before the sync (scores, removals) into the log, where the log has
 * no answer for a chapter yet, then clears it: once, as soon as the log is read.
 */
async function migrateLegacy(): Promise<void> {
  const data = trainData.peek();
  const l = legacy;
  if (!data || !l) return;
  legacy = undefined;
  const there = courseFromLog(data.states.keys(), data.eventsOf);
  const t = new Date().toISOString();
  const events = [
    ...l.scores.filter((s) => !there.scores.has(s.key)).map((s) => ({ t, k: 'cscore' as const, card: courseCard(s.key), sc: { ...s } as Record<string, unknown> })),
    ...l.removed.flatMap((id) => {
      const key = l.scores.find((s) => courseId(s.key) === id)?.key;
      return key && !there.removed.has(key) ? [{ t, k: 'cdrill' as const, card: courseCard(key), on: true }] : [];
    }),
  ];
  try {
    await recordEvents(events);
    await stormStore().put('meta', SCORES_KEY, []);
    await stormStore().put('meta', REMOVED_KEY, []);
  } catch {
    legacy = l;
  }
}
effect(() => {
  if (trainData.value) void migrateLegacy();
});

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

/** Scores waiting to be written to the log. */
let unwritten: CourseScore[] = [];
async function saveScores(): Promise<void> {
  const t = new Date().toISOString();
  const batch = unwritten;
  unwritten = [];
  try {
    await recordEvents(batch.map((s) => ({ t, k: 'cscore' as const, card: courseCard(s.key), sc: { ...s } as Record<string, unknown> })));
  } catch (e) {
    unwritten = [...batch, ...unwritten];
    throw e;
  }
}

/** A drill's chapter key, from its id. */
const keyOfId = (id: string): PositionKey | undefined => courseCandidates.peek().find((c) => c.id === id)?.key;

async function setRemoved(keys: readonly PositionKey[], on: boolean): Promise<void> {
  if (!keys.length) return;
  const now = Date.now();
  removedHere.value = new Map([...removedHere.peek(), ...keys.map((k) => [k, { on, at: now }] as const)]);
  const t = new Date(now).toISOString();
  await recordEvents(keys.map((key) => ({ t, k: 'cdrill' as const, card: courseCard(key), on })));
}

/** Takes a drill off the list (its tries stay in the log), on every device. */
export async function removeCourseDrill(id: string): Promise<void> {
  const key = keyOfId(id);
  if (key) await setRemoved([key], true);
}

/** The drill just taken off from inside its practice, for the Undo on the next one (cleared by Undo or the next removal). */
export const courseJustRemoved = signal<{ id: string; title: string } | undefined>(undefined);

/** Puts one removed drill back (the Undo after a removal from the practice). */
export async function restoreCourseDrill(id: string): Promise<void> {
  const key = keyOfId(id);
  if (key) await setRemoved([key], false);
}

/** Puts every removed drill back. */
export async function restoreCourseDrills(): Promise<void> {
  const gone = courseRemoved.peek();
  await setRemoved(courseCandidates.peek().filter((c) => gone.has(c.id)).map((c) => c.key), false);
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
  if (!courseScores.peek()) return;
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
      madeHere.value = new Map([...madeHere.peek(), [s.key, s]]);
      unwritten.push(s);
      g.done++;
      if (s.drill) g.kept++;
      if (unwritten.length >= 10) await saveScores();
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
