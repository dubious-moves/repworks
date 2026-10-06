// Training (PLAN.md §5.7): the repertoire index, the replayed card states and today's queue, read
// from the working view; and the session, which runs the trainer (src/core/train/trainer.ts)
// with the app's timers and records each answer at once, so a session can be stopped, reloaded
// or continued on the other device with nothing saved beyond the log.
import { signal } from '@preact/signals';
import type { Position } from 'chessops/chess';
import { chapterPath, classifyPath } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import type { CardId } from '../core/progress/cards.ts';
import { parseLog } from '../core/progress/events.ts';
import { readProgress } from '../core/progress/files.ts';
import { DEFAULT_PARAMS } from '../core/progress/fsrs.ts';
import { Replay, toDeviceEvents, type CardState } from '../core/progress/replay.ts';
import { combineIndex, indexChapter, type ChapterIndexing, type Line, type RepertoireIndex } from '../core/repertoire/index.ts';
import { header, type Chapter } from '../core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import { startPosition } from '../core/study/tree.ts';
import { planSession, type SessionPlan } from '../core/train/plan.ts';
import { todaysQueue, type DailyQueue, type Day } from '../core/train/queue.ts';
import { SETTINGS_FILE, trainSettings, type TrainSettings } from '../core/train/settings.ts';
import { Trainer, type Note, type Summary, type TrainerCommand, type TrainerEffect } from '../core/train/trainer.ts';
import type { IdbStore } from '../platform/idbStore.ts';

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
}

/** Each chapter file's parse and index part, kept while its text is the same (§5.1). */
const parts = new Map<string, { text: string; chapter?: Chapter; part: ChapterIndexing }>();

/** The last index build's time, for the debug panel. */
export const indexBuildMs = signal<number | undefined>(undefined);

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
  const index = combineIndex(indexing);
  const indexMs = performance.now() - began;
  indexBuildMs.value = indexMs;

  const replay = new Replay({ ...DEFAULT_PARAMS, retention: settings.retention });
  replay.add(readProgress(files).events);
  const device = await store.device();
  if (device) replay.add(toDeviceEvents(device.id, parseLog((await store.unsentEvents()).map((e) => e.raw).join('\n')).lines));
  return { index, states: replay.states, settings, chapters, studyNames, indexMs };
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

export interface SessionView {
  scope?: string;
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
  /** The planned asks and teaches not answered yet. */
  dueLeft: number;
  newLeft: number;
  /** The last card suspended, for its undo. */
  suspended?: { card: CardId; san: string };
  done?: Summary;
  /** Bumped on every effect, so the board is set again even when its position is the same. */
  tick: number;
}

export const session = signal<SessionView | undefined>(undefined);
/** Loading, or why a session couldn't start. */
export const sessionProblem = signal<string | undefined>(undefined);

let trainer: Trainer | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let recordEvent: ((event: Parameters<IdbStore['record']>[0]) => Promise<void>) | undefined;
let answered = new Set<string>();

/** Starts a session over today's queue, for the whole repertoire or one study. */
export async function startSession(store: IdbStore, record: (event: Parameters<IdbStore['record']>[0]) => Promise<void>, scope?: string): Promise<void> {
  stopTimer();
  trainer = undefined;
  session.value = undefined;
  sessionProblem.value = undefined;
  recordEvent = record;
  answered = new Set();
  let data: TrainData;
  try {
    data = await loadTraining(store);
  } catch (error) {
    sessionProblem.value = `The repertoire couldn't be read: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  const now = Date.now();
  const plan = planSession(data.index, queueOf(data, now, scope), data.states);
  const t = new Trainer({
    index: data.index,
    plan,
    states: data.states,
    startOf: (line) => {
      const c = data.chapters.get(`${line.sid}/${line.cid}`);
      return c ? startPosition(c) : undefined;
    },
    paceMs: PACES[pace.peek()],
  });
  trainer = t;
  const view: SessionView = { data, plan, side: 'white', path: [], phase: 'ready', number: 0, total: plan.lines.length, dueLeft: 0, newLeft: 0, tick: 0 };
  if (scope !== undefined) view.scope = scope;
  session.value = view;
  send({ type: 'start', now });
}

function stopTimer() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

/** A command from the screen, with the time now. */
export function command(type: 'hint' | 'suspend' | 'skipLine' | 'stop'): void {
  send({ type, now: Date.now() });
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

/** Leaves the screen: the timer stops; everything answered is already recorded. */
export function endSession(): void {
  stopTimer();
  trainer = undefined;
  session.value = undefined;
}

function send(c: TrainerCommand): void {
  const t = trainer;
  if (!t) return;
  apply(t, t.send(c));
}

function apply(t: Trainer, effects: TrainerEffect[]): void {
  const s = session.peek();
  if (!s || effects.length === 0) return;
  const next: SessionView = { ...s, tick: s.tick + 1 };
  let suspendedCard: CardId | undefined;
  for (const e of effects) {
    switch (e.type) {
      case 'line': {
        next.line = e.line;
        const c = s.data.chapters.get(`${e.line.sid}/${e.line.cid}`);
        if (c) next.chapter = c;
        next.side = c && header(c, 'Orientation') === 'black' ? 'black' : 'white';
        delete next.arrow;
        delete next.suspended;
        break;
      }
      case 'play':
        delete next.arrow;
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
        answered.add(ev.card);
        if (ev.k === 'suspend') suspendedCard = ev.card;
        const now = new Date().toISOString();
        void recordEvent?.(ev.k === 'review' ? { t: now, ...ev } : { t: now, k: ev.k, card: ev.card });
        break;
      }
      case 'wait':
        stopTimer();
        timer = setTimeout(() => {
          timer = undefined;
          send({ type: 'tick', id: e.id, now: Date.now() });
        }, e.ms);
        break;
      case 'done':
        stopTimer();
        next.done = e.summary;
        break;
      case 'takeback':
      case 'lineDone':
        break;
    }
  }
  const v = t.view;
  next.phase = v.phase;
  next.path = v.path;
  if (v.position) next.position = v.position;
  next.number = v.number;
  next.total = v.total;
  next.dueLeft = s.plan.lines.flatMap((l) => l.ask).filter((c) => !answered.has(c)).length;
  next.newLeft = s.plan.lines.flatMap((l) => l.teach).filter((c) => !answered.has(c)).length;
  session.value = next;
}
