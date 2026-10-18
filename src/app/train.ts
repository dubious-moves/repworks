// Training (PLAN.md §5.7): the repertoire index, the replayed card states and today's queue, read
// from the working view; and the session, which runs the trainer (src/core/train/trainer.ts)
// with the app's timers and records each answer at once, so a session can be stopped, reloaded
// or continued on the other device with nothing saved beyond the log.
import { signal } from '@preact/signals';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Mode } from '../core/app/fsm.ts';
import { chapterPath, classifyPath } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import type { CardId } from '../core/progress/cards.ts';
import { parseLog } from '../core/progress/events.ts';
import { readProgress } from '../core/progress/files.ts';
import { DEFAULT_PARAMS } from '../core/progress/fsrs.ts';
import { Replay, toDeviceEvents, type CardState, type DeviceEvent } from '../core/progress/replay.ts';
import { combineIndex, indexChapter, type ChapterIndexing, type Line, type RepertoireIndex } from '../core/repertoire/index.ts';
import { header, type Chapter, type StudyKind } from '../core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import { lineThrough, startPosition } from '../core/study/tree.ts';
import { cardLine, drillLines, retryLines, todaysMistakes, type Mistake } from '../core/train/mistakes.ts';
import { pinsOf, type PinState } from '../core/train/pins.ts';
import { alternativesOf } from '../core/train/alternatives.ts';
import { lineMarksOf, markLines } from '../core/train/paused.ts';
import { difficultPlan, findLine, learnPlan, pickedPlan } from '../core/train/browse.ts';
import { interactivePlan, planSession, withoutAnswered, type SessionPlan } from '../core/train/plan.ts';
import { ShowGrade, type Press, type ShowGradeEffect } from '../core/train/showGrade.ts';
import { todaysQueue, type DailyQueue, type Day } from '../core/train/queue.ts';
import { SETTINGS_FILE, trainSettings, type TrainSettings } from '../core/train/settings.ts';
import { quizLinesOf, type QuizLine } from '../core/train/commentQuiz.ts';
import { Trainer, type Note, type Summary, type TrainerCommand, type TrainerEffect, type TrainerOptions, type TrainerView } from '../core/train/trainer.ts';
import type { IdbStore } from '../platform/idbStore.ts';
import { say, stopSpeaking } from '../platform/speech.ts';
import { decidingNow } from './time.ts';
import { trainPrefs, type TrainPrefs } from './trainPrefs.ts';

/** The device's day: from its last local midnight to the next. */
export function dayOf(now: number): Day {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return { start, end, now };
}

export interface TrainData {
  index: RepertoireIndex;
  states: Map<string, CardState>;
  settings: TrainSettings;
  /** Repertoire chapters by `sid/cid`. */
  chapters: Map<string, Chapter>;
  studyNames: Map<string, string>;
  /** How long the index took to build, in ms (§5.1's live check reads it in the debug panel). */
  indexMs: number;
  /** Every event of a card, in replay order (mistakes and pins read them, §5.8). */
  eventsOf(card: string): readonly DeviceEvent[];
  /** Pinned mistakes, pinned or retired, by card. */
  pins: Map<string, PinState>;
  /** Moves saved as alternatives (§5.18). */
  alternatives: Set<CardId>;
  /** Line marks (§5.70) that cover no line any more: kept, and counted in the debug panel. */
  orphanMarks: string[];
}

/** Each chapter file's parse and index part, kept while its text is the same (§5.1). */
const parts = new Map<string, { text: string; chapter?: Chapter; part: ChapterIndexing }>();

export async function loadTraining(store: IdbStore): Promise<TrainData> {
  const files = await store.read((p) => p.startsWith('studies/') || p.startsWith('progress/') || p === SETTINGS_FILE);
  const settings = trainSettings(files.get(SETTINGS_FILE));

  const began = performance.now();
  const metas: { sid: string; name: string; kind: string; cids: string[] }[] = [];
  const present = new Map<string, string[]>();
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind === 'study') {
      const meta = parseStudyMeta(text, where.sid);
      if (meta.ok) metas.push({ sid: where.sid, name: meta.value.name, kind: meta.value.kind, cids: meta.value.chapters });
    } else if (where.kind === 'chapter') present.set(where.sid, [...(present.get(where.sid) ?? []), where.cid]);
  }
  // The study list's order (by name), chapters in their study's order: the index's order.
  metas.sort((a, b) => a.name.localeCompare(b.name) || (a.sid < b.sid ? -1 : 1));
  const chapters = new Map<string, Chapter>();
  const studyNames = new Map<string, string>();
  const indexing: ChapterIndexing[] = [];
  const seen = new Set<string>();
  for (const meta of metas) {
    studyNames.set(meta.sid, meta.name);
    if (meta.kind !== 'repertoire') continue;
    for (const cid of reconcileChapterOrder(meta.cids, present.get(meta.sid) ?? [])) {
      const path = chapterPath(meta.sid, cid);
      const text = files.get(path)!;
      seen.add(path);
      let cached = parts.get(path);
      if (cached?.text !== text) {
        const parsed = parseChapterFile(text, cid);
        cached = parsed.ok ? { text, chapter: parsed.chapter, part: indexChapter(meta.sid, parsed.chapter) } : { text, part: { ok: false, sid: meta.sid, cid, reason: parsed.reason } };
        parts.set(path, cached);
      }
      if (cached.chapter) chapters.set(`${meta.sid}/${cid}`, cached.chapter);
      indexing.push(cached.part);
    }
  }
  for (const path of parts.keys()) if (!seen.has(path)) parts.delete(path);
  const indexMs = performance.now() - began;

  const replay = new Replay({ ...DEFAULT_PARAMS, retention: settings.retention });
  replay.add(readProgress(files).events);
  const device = await store.device();
  if (device) replay.add(toDeviceEvents(device.id, parseLog((await store.unsentEvents()).map((e) => e.raw).join('\n')).lines));
  const eventsOf = (card: string) => replay.eventsOf(card);
  // Paused and must-learn lines (§5.70) are marked on the index the queue, the plan and the list read.
  const { index, orphans } = markLines(combineIndex(indexing), lineMarksOf(replay.states.keys(), eventsOf));
  return { index, states: replay.states, settings, chapters, studyNames, indexMs, eventsOf, pins: pinsOf(replay.states.keys(), eventsOf), alternatives: alternativesOf(replay.states.keys(), eventsOf), orphanMarks: orphans };
}

/** The training data of the working view, read again whenever it changes (home, chapter view, debug). */
export const trainData = signal<TrainData | undefined>(undefined);
let reading = 0;
export async function refreshTrainData(store: IdbStore): Promise<void> {
  const mine = ++reading;
  try {
    const data = await loadTraining(store);
    if (mine === reading) trainData.value = data;
  } catch {
    // The home card and the move panel go without; a session says why.
  }
}

export function mistakesOf(data: TrainData, now: number): Mistake[] {
  return todaysMistakes(data.index, data.eventsOf, dayOf(now));
}

/** Pinned cards still in the repertoire, and those due now. */
export function pinnedOf(data: TrainData, now: number): { pinned: CardId[]; due: CardId[] } {
  const pinned = [...data.pins].filter(([card, p]) => p.pinned && data.index.cards.has(card as CardId)).map(([card]) => card as CardId);
  return { pinned, due: pinned.filter((c) => data.pins.get(c)!.due <= now) };
}

/** Difficult lines (§5.124) at `now`: the plan, whose lines the home card counts. */
export function difficultOf(data: TrainData, now: number): SessionPlan {
  return difficultPlan(data.index, data.states, data.settings, dayOf(now));
}

export function queueOf(data: TrainData, now: number, scope?: string): DailyQueue {
  return todaysQueue(data.index, data.states, data.settings, dayOf(now), scope === undefined ? {} : { scope });
}

/** The pace of moves played for the user, per device (§5.2). */
export const PACES = { fast: 450, normal: 600, relaxed: 900 } as const;
export type Pace = keyof typeof PACES;
const PACE_KEY = 'repworks.pace';

function readPace(): Pace {
  try {
    const v = localStorage.getItem(PACE_KEY);
    if (v === 'fast' || v === 'normal' || v === 'relaxed') return v;
  } catch {
    // Storage blocked: the default.
  }
  return 'normal';
}
export const pace = signal<Pace>(readPace());
export function setPace(p: Pace): void {
  pace.value = p;
  trainer?.setPace(PACES[p]);
  try {
    localStorage.setItem(PACE_KEY, p);
  } catch {
    // Kept for this page only.
  }
}

/**
 * What a session walks: today's queue (everything, or one study), or the day's mistakes, retried
 * from their lines' start or drilled from the lead-in, or the pinned mistakes (due, or all).
 */
export type SessionKind =
  | { kind: 'queue'; scope?: string }
  | { kind: 'show'; scope?: string }
  | { kind: 'retry' }
  | { kind: 'drill' }
  | { kind: 'pinned'; all: boolean }
  /** A line picked from the list (§5.16): every own move asked; due ones graded, new ones taught. */
  | { kind: 'line'; sid: string; cid: string; at: string[] }
  /** A chapter's lines with new moves, learned past the daily limit (§5.16). */
  | { kind: 'learn'; sid: string; cid: string }
  /** Difficult lines (§5.124): the lines through difficult moves, asked due or not; only due moves graded. */
  | { kind: 'difficult' }
  /** The Interactive view (§5.10): a chapter's line through a move, every own move asked, nothing recorded. */
  | { kind: 'play'; sid: string; cid: string; at: string[]; from?: number };

export interface SessionView {
  of: SessionKind;
  scope?: string;
  /** Show and grade (§5.9): on for #/show, and toggled during any session (§5.16). */
  selfGrade: boolean;
  data: TrainData;
  plan: SessionPlan;
  /** The line on the board, and the chapter it is in. */
  line?: Line;
  chapter?: Chapter;
  side: 'white' | 'black';
  /** The moves on the board, and the position they reach. */
  path: string[];
  position?: Position;
  arrow?: string;
  note?: Note;
  phase: string;
  number: number;
  total: number;
  /** At a line's end: the line that comes next in the session (§5.17). */
  upcoming?: Line;
  /** Show sequence, while shown: the plies it spans. */
  sequence?: { from: number; to: number };
  /** A line walked again (repetitions), and the mistakes retried at a walk's end (§5.77). */
  pass?: { n: number; of: number };
  retry?: { left: number; streak: number; need: number };
  /** The lines from the comments offered on this walk, how many "Quiz lines" plays at its end, whether one can be quizzed now, the one on the board, and the session's count (§5.98). */
  comments?: TrainerView['comments'];
  endQuiz?: number;
  canQuiz?: true;
  aside?: TrainerView['aside'];
  asides?: TrainerView['asides'];
  /** After a wrong move, the move "Save as alternative" saves; an alternative just saved (§5.18). */
  wrongMove?: string;
  savedAlt?: string;
  /** Show and grade's Space (§5.114): the alternatives saved for the move asked or shown, drawn in blue until the board moves. */
  alts?: { uci: string; san: string }[];
  /** The planned asks and teaches not answered yet. */
  dueLeft: number;
  newLeft: number;
  /** The last card suspended, for its undo. */
  suspended?: { card: CardId; san: string };
  /** The last move answered wrong, or in retry and drill the mistake on the board, which can be pinned (§5.8). */
  missed?: CardId;
  /** Moves asked and answered, and how many right first time (retry and drill record no reviews). */
  answers: number;
  right: number;
  done?: Summary;
  /** Bumped on every effect, so the board is set again even when its position is the same. */
  tick: number;
}

export const session = signal<SessionView | undefined>(undefined);
/** Loading, or why a session couldn't start. */
export const sessionProblem = signal<string | undefined>(undefined);

let trainer: Trainer | undefined;
let shower: ShowGrade | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let recordEvent: ((event: Parameters<IdbStore['record']>[0]) => Promise<void>) | undefined;
/** The cards the session asked or taught and that were answered: they are not asked again in it. */
let answered = new Set<string>();
/** The cards pinned in this session: retry and drill don't offer them again (their lines come back). */
let pinnedNow = new Set<string>();

/** Starts a session: today's queue, the day's mistakes, or the pins. */
export async function startSession(store: IdbStore, record: (event: Parameters<IdbStore['record']>[0]) => Promise<void>, of: SessionKind): Promise<void> {
  away = undefined;
  stopTimer();
  trainer = undefined;
  shower = undefined;
  session.value = undefined;
  sessionProblem.value = undefined;
  readingAt.value = undefined;
  recordEvent = record;
  // Taken up again from the study (§5.15), or a new session: either way nothing is left waiting.
  const key = JSON.stringify(of);
  const resume = resuming === key ? left.peek() : undefined;
  resuming = undefined;
  setLeft(undefined);
  answered = new Set(resume?.answered);
  pinnedNow = new Set();
  let data: TrainData;
  try {
    data = await loadTraining(store);
  } catch (error) {
    sessionProblem.value = `The repertoire couldn't be read: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  // What is due is decided at the time travelled to (§5.17); the day's mistakes are the real day's records.
  const now = decidingNow();
  const scope = of.kind === 'queue' || of.kind === 'show' ? of.scope : undefined;
  let plan: SessionPlan;
  let index = data.index;
  let pausedPick = false;
  if (of.kind === 'play') {
    const played = await playPlan(store, of);
    if (typeof played === 'string') {
      sessionProblem.value = played;
      return;
    }
    ({ plan, index } = played);
    // The chapter may be a reference study's, which the training data leaves out.
    data = { ...data, chapters: new Map(data.chapters).set(`${of.sid}/${of.cid}`, played.chapter) };
  } else if (of.kind === 'queue' || of.kind === 'show') plan = planSession(data.index, queueOf(data, now, scope), data.states);
  else if (of.kind === 'line') {
    const line = findLine(data.index, of.sid, of.cid, of.at);
    if (!line) {
      sessionProblem.value = 'That line isn’t in the repertoire any more: pick another from the list.';
      return;
    }
    plan = pickedPlan(data.index, data.states, data.settings, dayOf(now), line);
    // A paused line is practised (§5.70): nothing graded or taught on record.
    if (line.paused) pausedPick = true;
  } else if (of.kind === 'learn') plan = learnPlan(data.index, data.states, of.sid, of.cid);
  else if (of.kind === 'difficult') plan = difficultOf(data, now);
  else if (of.kind === 'retry') plan = { lines: retryLines(mistakesOf(data, Date.now())) };
  else if (of.kind === 'drill') plan = { lines: drillLines(mistakesOf(data, Date.now())) };
  else {
    const { pinned, due } = pinnedOf(data, now);
    const cards = of.all ? pinned : due;
    plan = { lines: drillLines(cards.flatMap((card) => (cardLine(data.index, card) ? [{ card, ...cardLine(data.index, card)! }] : []))) };
  }
  if (resume && of.kind !== 'play') plan = withoutAnswered(plan, answered);
  // Retry and drill grade nothing: the card was graded Again today (§5.8, D16). The Interactive
  // view asks every own move of its line, whatever its card's state, and follows the line played.
  const grading = isGraded(of);
  const interactive = of.kind === 'play';
  const t = new Trainer({
    record: grading && !pausedPick,
    askOnly: !grading && !interactive,
    askAll: interactive,
    follow: interactive,
    // Retry, drill and the pins: a move missed again comes back until it is right (§5.77).
    repeatMissed: !grading && !interactive,
    selfGrade: of.kind === 'show',
    index,
    plan,
    states: interactive ? new Map() : data.states,
    startOf: (line) => {
      const c = data.chapters.get(`${line.sid}/${line.cid}`);
      return c ? startPosition(c) : undefined;
    },
    paceMs: PACES[pace.peek()],
    alternatives: data.alternatives,
    // In review, the lines from the comments along the line (§5.98): the queue's and a line picked.
    ...(of.kind === 'queue' || of.kind === 'line' || of.kind === 'difficult' ? { commentLines: commentLinesOf(data) } : {}),
    ...optionsFor(of, trainPrefs.peek()),
  });
  trainer = t;
  shower = of.kind === 'show' ? new ShowGrade(t, speech.peek() ? { speech: true } : {}) : undefined;
  const view: SessionView = { of, selfGrade: of.kind === 'show', data, plan, side: 'white', path: [], phase: 'ready', number: 0, total: plan.lines.length, dueLeft: 0, newLeft: 0, answers: 0, right: 0, tick: 0 };
  const listed = scope ?? (of.kind === 'line' || of.kind === 'learn' ? of.sid : undefined);
  if (listed !== undefined) view.scope = listed;
  session.value = view;
  send({ type: 'start', now });
}

/** The lines from the comments a line's walk can quiz (§5.98), read from its chapter once a session. */
function commentLinesOf(data: TrainData): (line: Line) => readonly QuizLine[] {
  const known = new Map<Line, QuizLine[]>();
  return (line) => {
    let lines = known.get(line);
    if (!lines) {
      const c = data.chapters.get(`${line.sid}/${line.cid}`);
      const side = c && header(c, 'Orientation') === 'black' ? 'black' : 'white';
      lines = c ? quizLinesOf(c, line.path, side, data.index) : [];
      known.set(line, lines);
    }
    return lines;
  };
}

/**
 * The per-device settings a session runs with (§5.17): the queue's and show and grade's lines start
 * and auto-play as `startQueue` and `autoPlayQueue` say (a line picked or learned: `startLearn` and
 * `autoPlayLearn`, §5.113), and wait at their end or go on after two paces; Learn's lines wait at
 * their end or go on after four paces. A line learned is walked `repetitions` times, and a walk's
 * mistakes are asked again at its end (§5.77).
 * Retry, drill, the pins and the Interactive view keep their own walk.
 */
export function optionsFor(of: SessionKind, prefs: TrainPrefs): TrainerOptions {
  const common: TrainerOptions = {
    tryNew: prefs.newMoves === 'try',
    sequence: prefs.newMoves === 'sequence' ? prefs.sequenceLength : 0,
    repetitions: prefs.repetitions,
    retryMistakes: prefs.mistakeRetries,
  };
  switch (of.kind) {
    case 'queue':
      return { ...common, autoPlay: prefs.autoPlayQueue, lineStart: prefs.startQueue, holdLineEnd: prefs.lineEnd === 'wait', comments: prefs.comments };
    case 'show':
      return { ...common, autoPlay: prefs.autoPlayQueue, lineStart: prefs.startQueue, holdLineEnd: prefs.lineEnd === 'wait' };
    // Difficult lines walk as the queue's: its difficult moves are asked whatever auto-play says.
    case 'difficult':
      return { ...common, autoPlay: prefs.autoPlayQueue, lineStart: prefs.startQueue, holdLineEnd: prefs.lineEnd === 'wait', comments: prefs.comments };
    case 'line':
      return { ...common, autoPlay: prefs.autoPlayLearn, lineStart: prefs.startLearn, comments: prefs.comments };
    case 'learn':
      return { ...common, autoPlay: prefs.autoPlayLearn, lineStart: prefs.startLearn, holdLineEnd: prefs.lineEnd === 'wait', lineEndPaces: 4 };
    default:
      return {};
  }
}

/** The settings changed during a session: from the next move met. */
export function configureSession(): void {
  const s = session.peek();
  if (trainer && s) trainer.configure(optionsFor(s.of, trainPrefs.peek()));
}

/** Sessions whose answers are graded and recorded: the queue's, lines picked from the list, and difficult lines' due moves. */
export function isGraded(of: SessionKind): boolean {
  return of.kind === 'queue' || of.kind === 'show' || of.kind === 'line' || of.kind === 'learn' || of.kind === 'difficult';
}

/**
 * Show and grade on or off in the middle of a session (§5.16), as Chessable allows: the same
 * trainer, now driven by the two keys, or by moves again. Not while a move shown waits for its grade.
 */
export function setSelfGrade(on: boolean): void {
  const t = trainer;
  const s = session.peek();
  // Not in a line from the comments either: it is played on the board, not shown and graded.
  if (!t || !s || s.done || s.selfGrade === on || t.awaitingGrade || t.inAside) return;
  t.setSelfGrade(on);
  shower = on ? new ShowGrade(t, speech.peek() ? { speech: true } : {}) : undefined;
  const { alts: _, ...rest } = s;
  session.value = { ...rest, selfGrade: on, tick: s.tick + 1 };
}

/** Whether the board waits for a show-and-grade verdict (the toggle waits for it). */
export function awaitingGrade(): boolean {
  return trainer?.awaitingGrade ?? false;
}

/** The Interactive view's chapter, its own index (it may be a reference study's) and plan. */
async function playPlan(store: IdbStore, of: Extract<SessionKind, { kind: 'play' }>): Promise<{ plan: SessionPlan; index: RepertoireIndex; chapter: Chapter } | string> {
  const path = chapterPath(of.sid, of.cid);
  const text = (await store.read((p) => p === path)).get(path);
  if (text === undefined) return 'That chapter isn’t on this device.';
  const parsed = parseChapterFile(text, of.cid);
  if (!parsed.ok) return `This chapter can't be read: ${parsed.reason}.`;
  const part = indexChapter(of.sid, parsed.chapter);
  if (!part.ok) return `This chapter can't be played: ${part.reason}.`;
  const index = combineIndex([part]);
  const line = lineThrough(parsed.chapter, of.at);
  const plan = line && interactivePlan(index.lines, line, Math.min(of.from ?? of.at.length, line.length));
  if (!plan) return 'That move isn’t in the chapter any more.';
  return { plan, index, chapter: parsed.chapter };
}

function stopTimer() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  held = undefined;
}

/**
 * Read within a session (the owner's request, 2026-10-09; the Read view's body, §5.10): the line on
 * the board read through from its start to its end, comments and arrows, at the ply shown. The
 * session waits meanwhile: a move due to be played is held until the reading ends.
 */
export const readingAt = signal<number | undefined>(undefined);
/** The tick that came while reading. */
let held: number | undefined;
export function readLine(ply: number | undefined): void {
  const s = session.peek();
  if (ply !== undefined && !s?.line) return;
  const was = readingAt.peek();
  readingAt.value = ply;
  if (ply === undefined && was !== undefined && held !== undefined) {
    const id = held;
    held = undefined;
    send({ type: 'tick', id, now: Date.now() });
  }
}

/** A command from the screen, with the time now. */
export function command(type: 'hint' | 'suspend' | 'skipLine' | 'stop' | 'next' | 'ready' | 'saveAlt' | 'unsaveAlt' | 'misclick' | 'skipComment'): void {
  send({ type, now: Date.now() });
}
/** A line from the comments met quizzed now, the walk resuming after it; without a key, at a line's end, the lines on (§5.98). */
export function quizComments(key?: string): void {
  send(key === undefined ? { type: 'quizComments', now: Date.now() } : { type: 'quizComments', key, now: Date.now() });
}
/** A line from the comments offered: in "Quiz lines" at the line's end, or not (§5.98). */
export function pickComment(key: string, on: boolean): void {
  const t = trainer;
  // Nothing to play: the screen reads the offer again.
  if (t) apply(t, t.send({ type: 'pickComment', key, on }), true);
}
/** Show sequence: the board at a ply of the sequence shown. */
export function seekSequence(ply: number): void {
  send({ type: 'seek', ply, now: Date.now() });
}
export function playMove(uci: string): void {
  send({ type: 'move', uci, now: Date.now() });
}

/** Undoes the last suspend: the card is asked again from its next due day. */
export function undoSuspend(): void {
  const s = session.peek();
  if (!s?.suspended) return;
  void recordEvent?.({ t: new Date().toISOString(), k: 'unsuspend', card: s.suspended.card });
  const { suspended: _, ...rest } = s;
  session.value = { ...rest, tick: s.tick + 1 };
}

function pinned(s: SessionView, card: CardId): boolean {
  return pinnedNow.has(card) || s.data.pins.get(card)?.pinned === true;
}

/** Pins the last move answered wrong, or the mistake retried or drilled; it comes due for a drill 30 minutes later. */
export function pinMissed(): void {
  const s = session.peek();
  if (!s?.missed) return;
  pinnedNow.add(s.missed);
  void recordEvent?.({ t: new Date().toISOString(), k: 'pin', card: s.missed });
  const { missed: _, ...rest } = s;
  session.value = { ...rest, tick: s.tick + 1 };
}

/**
 * Analyse (the owner's request, 2026-10-16): the analysis board at the position on the board, the
 * line's moves from its chapter's start. The session waits for the history entry it runs on
 * (`leaveSession`), so ← (or the browser's Back) takes it up where it was. A move being asked
 * counts as hinted (it is shown on return), as Hint would: the engine and the explorer give it away.
 */
export function analyseSession(): AnalysisBoard | undefined {
  const s = session.peek();
  if (!s?.position) return undefined;
  if (!s.selfGrade && (s.phase === 'ask' || s.phase === 'wrong')) command('hint');
  const now = session.peek() ?? s;
  const read = readingAt.peek();
  const side = now.side;
  // A line from the comments on the board (§5.98): its position alone. Read in the session: the
  // move read. Else the line from its chapter's start, at the move on the board.
  const start = now.chapter ? startPosition(now.chapter) : undefined;
  if (now.aside || !start || !now.chapter) return { fen: makeFen(now.position!.toSetup()), side };
  const line = read !== undefined && now.line ? now.line.path : now.path;
  const shown = read !== undefined ? Math.min(read, line.length) : now.path.length;
  return { fen: makeFen(start.toSetup()), ...(line.length ? { line: [...line], show: shown } : {}), side };
}

/** Where the analysis board opens: its start, its main line, the moves of it shown, its side. */
export interface AnalysisBoard {
  fen: string;
  line?: string[];
  show?: number;
  side: 'white' | 'black';
}

/** The session left for another page (the analysis board, say), and the entry it ran on. */
let away: { key: string; entry: string } | undefined;

/**
 * The training screen gone, from the history entry `entry`: the session waits, a move due held,
 * to be taken up again if that entry is come back to (by ←, or the browser's Back or Forward).
 */
export function leaveSession(entry: string): void {
  const s = session.peek();
  if (!s) return endSession();
  away = { key: JSON.stringify(s.of), entry };
}

/**
 * The training screen opened for `of` on the history entry `entry`: true when the session left
 * there is taken up where it was (a move due meanwhile played now). Else any session left is let go.
 */
export function resumeSession(of: SessionKind, entry: string): boolean {
  const was = away;
  away = undefined;
  const s = session.peek();
  if (!was || !s || was.key !== JSON.stringify(of) || was.key !== JSON.stringify(s.of) || was.entry !== entry) {
    if (was) endSession();
    return false;
  }
  if (held !== undefined && readingAt.peek() === undefined) {
    const id = held;
    held = undefined;
    send({ type: 'tick', id, now: Date.now() });
  }
  session.value = { ...s, tick: s.tick + 1 };
  return true;
}

/** Leaves the screen: the timer stops; everything answered is already recorded. */
export function endSession(): void {
  away = undefined;
  stopTimer();
  readingAt.value = undefined;
  trainer = undefined;
  shower = undefined;
  stopSpeaking();
  session.value = undefined;
}

function send(c: TrainerCommand): void {
  const t = trainer;
  if (!t) return;
  if (shower && (c.type === 'tick' || c.type === 'stop' || c.type === 'skipLine' || c.type === 'next')) {
    apply(t, c.type === 'tick' ? shower.tick(c.id, c.now) : shower.send(c));
    return;
  }
  apply(t, t.send(c));
}

/** A press of the show-and-grade keys (§5.9). */
export function press(p: Press): void {
  const t = trainer;
  if (!t || !shower) return;
  apply(t, shower.press(p, Date.now()));
}

/** Speech, per device: off by default (§5.2). */
const SPEECH_KEY = 'repworks.speech';
const readFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
};
export const speech = signal(readFlag(SPEECH_KEY));
export function setSpeech(on: boolean): void {
  speech.value = on;
  if (!on) stopSpeaking();
  try {
    localStorage.setItem(SPEECH_KEY, on ? 'on' : 'off');
  } catch {
    // Kept for this page only.
  }
}

function apply(t: Trainer, effects: readonly ShowGradeEffect[], always = false): void {
  const s = session.peek();
  if (!s || (effects.length === 0 && !always)) return;
  const next: SessionView = { ...s, tick: s.tick + 1 };
  let suspendedCard: CardId | undefined;
  let newLine = false;
  for (const e of effects) {
    switch (e.type) {
      case 'line': {
        next.line = e.line;
        const c = s.data.chapters.get(`${e.line.sid}/${e.line.cid}`);
        if (c) next.chapter = c;
        next.side = c && header(c, 'Orientation') === 'black' ? 'black' : 'white';
        delete next.arrow;
        delete next.alts;
        delete next.suspended;
        delete next.missed;
        newLine = true;
        break;
      }
      case 'play':
        delete next.arrow;
        delete next.alts;
        break;
      case 'alternatives':
        // A second press takes them away again.
        if (s.alts) delete next.alts;
        else next.alts = e.moves;
        break;
      case 'arrow':
        if (e.uci) next.arrow = e.uci;
        else delete next.arrow;
        break;
      case 'note':
        next.note = e.note;
        // The undo stays offered until the next line.
        if (e.note.kind === 'suspended' && suspendedCard) next.suspended = { card: suspendedCard, san: e.note.san };
        break;
      case 'record': {
        const ev = e.event;
        const now = new Date().toISOString();
        if (ev.k === 'alt') {
          void recordEvent?.({ t: now, ...ev });
          break;
        }
        answered.add(ev.card);
        if (ev.k === 'suspend') suspendedCard = ev.card;
        void recordEvent?.(ev.k === 'review' ? { t: now, ...ev } : { t: now, k: ev.k, card: ev.card });
        break;
      }
      case 'wait':
        stopTimer();
        timer = setTimeout(() => {
          timer = undefined;
          // While the line is read, or the board analysed, the session waits: the tick comes when
          // the reading ends, or the session is come back to.
          if (readingAt.peek() !== undefined || away) held = e.id;
          else send({ type: 'tick', id: e.id, now: Date.now() });
        }, e.ms);
        break;
      case 'answer':
        answered.add(e.card);
        // Asked again (a mistake retried, a line's later pass, a missed move again): counted once, and pinned or drilled once.
        if (e.repeat) break;
        next.answers++;
        if (e.ok) {
          next.right++;
          if (isGraded(s.of)) delete next.missed;
        } else if (isGraded(s.of) && !pinned(s, e.card)) next.missed = e.card;
        // A drill answer on a pinned card is recorded for the pin's steps; nothing else is.
        if ((s.of.kind === 'drill' || s.of.kind === 'pinned') && s.data.pins.get(e.card)?.pinned) {
          void recordEvent?.({ t: new Date().toISOString(), k: 'drill', card: e.card, ok: e.ok });
        }
        break;
      case 'done':
        stopTimer();
        next.done = e.summary;
        break;
      case 'say':
        if (speech.peek()) say(e.text);
        break;
      case 'takeback':
      case 'lineDone':
        break;
    }
  }
  const v = t.view;
  // Retry and drill: the mistake a line asks can be pinned from the line's start, as it is met.
  const asked = v.line?.ask[0];
  if (newLine && (s.of.kind === 'retry' || s.of.kind === 'drill') && asked && !pinned(s, asked)) next.missed = asked;
  next.phase = v.phase;
  // At the session's end the trainer's view stays on the last line's moves, so the board and "back
  // to the chapter" stay at them (§5.17).
  next.path = v.path;
  if (v.position) next.position = v.position;
  next.number = v.number;
  next.total = v.total;
  if (v.upcoming) next.upcoming = v.upcoming.line;
  else delete next.upcoming;
  if (v.sequence) next.sequence = v.sequence;
  else delete next.sequence;
  if (v.pass) next.pass = v.pass;
  else delete next.pass;
  if (v.retry) next.retry = v.retry;
  else delete next.retry;
  if (v.wrongMove) next.wrongMove = v.wrongMove.san;
  else delete next.wrongMove;
  if (v.savedAlt) next.savedAlt = v.savedAlt.san;
  else delete next.savedAlt;
  for (const k of ['comments', 'endQuiz', 'canQuiz', 'aside', 'asides'] as const) {
    if (v[k]) (next as unknown as Record<string, unknown>)[k] = v[k];
    else delete next[k];
  }
  next.dueLeft = s.plan.lines.flatMap((l) => l.ask).filter((c) => !answered.has(c)).length;
  next.newLeft = s.plan.lines.flatMap((l) => l.teach).filter((c) => !answered.has(c)).length;
  session.value = next;
}

// ---- train ↔ study (§5.15), as Qchess's switch between Move Trainer and Study mode ----------

/** A session left for the study, to take up again from there. Kept per tab, across reloads. */
export interface LeftSession {
  of: SessionKind;
  answered: string[];
  /** The line on the board when it was left: "Train" takes the session up only from it (§5.83). */
  line?: { sid: string; cid: string; path: string[] };
}
const LEFT_KEY = 'repworks.leftSession';
function readLeft(): LeftSession | undefined {
  try {
    const raw = sessionStorage.getItem(LEFT_KEY);
    return raw ? (JSON.parse(raw) as LeftSession) : undefined;
  } catch {
    return undefined;
  }
}
export const left = signal<LeftSession | undefined>(readLeft());
function setLeft(value: LeftSession | undefined): void {
  if (left.peek() === undefined && value === undefined) return;
  left.value = value;
  try {
    if (value) sessionStorage.setItem(LEFT_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(LEFT_KEY);
  } catch {
    // Kept for this page only.
  }
}
/** The session asked for by the switch: the next start of the same kind takes it up again. */
let resuming: string | undefined;

/** The screen a session kind runs on. */
export function sessionMode(of: SessionKind): Mode {
  switch (of.kind) {
    case 'queue':
      return of.scope === undefined ? { name: 'train' } : { name: 'train', sid: of.scope };
    case 'show':
      return of.scope === undefined ? { name: 'show' } : { name: 'show', sid: of.scope };
    case 'retry':
    case 'drill':
      return { name: 'practice', run: of.kind };
    case 'pinned':
      return { name: 'practice', run: of.all ? 'pins' : 'pinned' };
    case 'play':
      return { name: 'play', sid: of.sid, cid: of.cid, at: of.at, ...(of.from === undefined ? {} : { from: of.from }) };
    case 'line':
      return { name: 'train', sid: of.sid, cid: of.cid, at: of.at };
    case 'learn':
      return { name: 'learn', sid: of.sid, cid: of.cid };
    case 'difficult':
      return { name: 'difficult' };
  }
}

/**
 * "Study" on the training screen: the chapter of the line on the board, at the move on the board,
 * editable. The session is kept, to be taken up again by "Train"; undefined when no line is on
 * the board yet.
 */
export function leaveForStudy(): Mode | undefined {
  const s = session.peek();
  const line = s?.line;
  if (!s || !line) return undefined;
  setLeft({ of: s.of, answered: [...answered], line: { sid: line.sid, cid: line.cid, path: [...line.path] } });
  return { name: 'chapter', sid: line.sid, cid: line.cid, at: [...s.path] };
}

/**
 * "Train" in the chapter view. A session left for the study is taken up again while the move shown
 * is still on the line it left (or on that line as since extended): planned afresh from the
 * repertoire as it now is, less what it already answered. The Interactive view starts again from
 * the move shown. Otherwise a repertoire study's training opens with the line through the move
 * shown selected, waiting to be started (§5.83), and a reference study, which has no cards, is
 * played from the move shown.
 */
export function trainingFrom(here: { sid: string; cid: string; at: readonly string[]; kind: StudyKind }): Mode {
  const l = left.peek();
  if (l && l.of.kind !== 'play' && onLine(l, here)) {
    resuming = JSON.stringify(l.of);
    return sessionMode(l.of);
  }
  if (here.kind === 'repertoire' && l?.of.kind !== 'play') return { name: 'train', sid: here.sid, cid: here.cid, at: [...here.at], pick: true };
  return { name: 'play', sid: here.sid, cid: here.cid, at: [...here.at] };
}

/** Whether the move shown is on the line a session was left at: one path leads on to the other. */
function onLine(l: LeftSession, here: { sid: string; cid: string; at: readonly string[] }): boolean {
  if (!l.line) return true;
  if (l.line.sid !== here.sid || l.line.cid !== here.cid) return false;
  const n = Math.min(l.line.path.length, here.at.length);
  for (let i = 0; i < n; i++) if (l.line.path[i] !== here.at[i]) return false;
  return true;
}
