// The chapter being edited (PLAN.md §4.11): its study, its tree with undo and redo for the
// session, and the move shown. Every edit is one of core's pure operations; the new chapter is
// written at once as this device's working copy, which the sync pushes later. When a sync or
// another tab changes the open chapter's file, the chapter is read again (and the undo history,
// which would now undo someone else's work, starts over).
import { computed, effect, signal } from '@preact/signals';
import { record, redo, startHistory, undo, type History } from '../core/app/history.ts';
import { chapterPath, classifyPath, studyMetaPath } from '../core/data/layout.ts';
import { openConflicts, type OpenConflict } from '../core/merge/markers.ts';
import { resolveConflict, type Resolution } from '../core/merge/resolve.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { chapterFileText } from '../core/pgn/write.ts';
import { freshId } from '../core/study/ids.ts';
import { header, type Chapter, type StudyMeta } from '../core/study/model.ts';
import { nearest, step, type Step } from '../core/study/navigate.ts';
import { deleteChapter } from '../core/study/manage.ts';
import { addChapterToStudy, addLine, addMove, linePgn, newChapter, renameChapter, reorderChapters, setOrientation, type Edit } from '../core/study/ops.ts';
import { parseStudyMeta, reconcileChapterOrder, writeStudyMeta } from '../core/study/studyMeta.ts';
import type { Path } from '../core/study/tree.ts';
import { cryptoRandom } from '../platform/browser.ts';
import { dispatch, mode } from './mode.ts';
import { localStore, ready, saveFiles } from './state.ts';
import { dataVersion } from './sync.ts';

export interface ChapterEntry {
  id: string;
  name: string;
}

export interface OpenStudy {
  sid: string;
  cid: string;
  meta: StudyMeta;
  /** In the study's order. */
  chapters: ChapterEntry[];
}

/** The open study and chapter; undefined while loading or when there is none. */
export const study = signal<OpenStudy | undefined>(undefined);
/** The open chapter with its undo history; undefined when it can't be edited. */
export const doc = signal<History<Chapter> | undefined>(undefined);
/** Why the open chapter is shown without editing, or why nothing is shown. */
export const problem = signal<string | undefined>(undefined);
/** The move shown, as its path; [] is the start. */
export const at = signal<Path>([]);
/** The last edit that was refused, for the feedback line under the board. */
export const feedback = signal<string | undefined>(undefined);

export const chapter = computed(() => doc.value?.present);

/** The chapter file as last read or written here: a different text means someone else changed it. */
let fileText: string | undefined;
let loading = 0;
/** Raised by every write from here: a read that began before one is stale. */
let written = 0;
let writing: Promise<void> = Promise.resolve();

const chapterKey = computed(() => {
  const m = mode.value;
  return m.name === 'chapter' ? `${m.sid}/${m.cid ?? ''}` : '';
});

let openedKey = '';
/**
 * The move asked for when the chapter was opened, until a read shows it: a sync finishing while
 * the first read is under way starts a newer read, which abandons the first, and without this
 * the chapter would open at its start instead of at the address's move.
 */
let wanted: string[] | undefined;

effect(() => {
  const key = chapterKey.value;
  void dataVersion.value;
  if (!ready.value || !key) {
    openedKey = '';
    return;
  }
  const m = mode.peek();
  if (m.name !== 'chapter') return;
  // Opened (or opened again): at the address's move. Read again after a change: where it was.
  if (key !== openedKey) wanted = m.at ?? [];
  openedKey = key;
  void load(m.sid, m.cid, wanted);
});

/* ------------------------------------------------------------------ the analysis board (§5.35) */

/** The analysis board's study and chapter id: no study's (ids are 8 characters). */
export const SCRATCH = 'analysis';
const SCRATCH_KEY = 'repworks-analysis';
const SCRATCH_META: StudyMeta = { format: 1, id: SCRATCH, name: 'Analysis board', kind: 'reference', chapters: [] };

/** A chapter for the board from `fen` (the start when none), or the board as last left. */
function scratchChapter(fen: string | undefined, side?: 'white' | 'black'): { chapter: Chapter } | { error: string } {
  if (!fen) {
    try {
      const saved = localStorage.getItem(SCRATCH_KEY);
      const parsed = saved ? parseChapterFile(saved, SCRATCH) : undefined;
      if (parsed?.ok) return { chapter: parsed.chapter };
    } catch {
      // a new board, then
    }
  }
  const turn = side ?? (fen?.split(/\s+/)[1] === 'b' ? 'black' : 'white');
  const made = newChapter(SCRATCH, 'Analysis board', 'Analysis board', turn, fen && fen.trim() !== START_FEN ? fen.trim() : undefined);
  return made.ok ? { chapter: made.value } : { error: made.error };
}
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let scratchKey = '';
effect(() => {
  const m = mode.value;
  if (m.name !== 'analysis') {
    scratchKey = '';
    return;
  }
  const key = `${m.fen ?? ''}|${m.from ? `${m.from.sid}/${m.from.cid}` : ''}|${(m.line ?? []).join(',')}`;
  if (key === scratchKey) return;
  scratchKey = key;
  openScratch(m.fen, m.line, m.show, m.side);
});

/**
 * Opens the analysis board from `fen` (the board as last left when none); `line`, when given, is
 * its main line from there (moves that don't play are left off), shown after `show` moves (all).
 */
export function openScratch(fen: string | undefined, line?: readonly string[], show?: number, side?: 'white' | 'black'): boolean {
  const made = scratchChapter(fen, side);
  if ('error' in made) {
    feedback.value = made.error;
    return false;
  }
  let chapter = made.chapter;
  let path: string[] = [];
  for (const san of line ?? []) {
    const added = addLine(chapter, path, [san]);
    if (!added.ok) break;
    chapter = added.value.chapter;
    path = [...added.value.path];
  }
  fileText = undefined;
  study.value = { sid: SCRATCH, cid: SCRATCH, meta: SCRATCH_META, chapters: [] };
  doc.value = startHistory(chapter);
  problem.value = undefined;
  feedback.value = undefined;
  at.value = show === undefined ? path : path.slice(0, show);
  persist(chapter);
  return true;
}

effect(() => {
  // The address follows the move shown, so a reload comes back to it.
  const path = at.value;
  if (doc.value && mode.peek().name === 'chapter') dispatch({ type: 'at', path });
});

const nameOf = (text: string, cid: string): string => {
  const m = /^\[ChapterName "((?:[^"\\]|\\.)*)"\]$/m.exec(text);
  return m ? m[1]!.replace(/\\(.)/g, '$1') : cid;
};

/** Reads the chapter; `wantAt` is the move to show, or undefined to stay where the reader is. */
async function load(sid: string, cid: string | undefined, wantAt: string[] | undefined): Promise<void> {
  const store = localStore();
  if (!store) return;
  const ticket = ++loading;
  // An edit being written would read back as someone else's change; so would one made while
  // this read is under way, so then the read is made again.
  await writing;
  const before = written;
  const files = await store.read((p) => p.startsWith(`studies/${sid}/`));
  if (ticket !== loading) return;
  if (written !== before) return load(sid, cid, wantAt);
  const metaText = files.get(studyMetaPath(sid));
  const meta = metaText === undefined ? undefined : parseStudyMeta(metaText, sid);
  if (!meta?.ok) {
    study.value = undefined;
    doc.value = undefined;
    problem.value = metaText === undefined ? 'That study isn’t on this device.' : `This study's study.json can't be read, so it is left as it is: ${meta!.ok ? '' : meta!.errors.join('; ')}.`;
    return;
  }
  const present: string[] = [];
  for (const path of files.keys()) {
    const where = classifyPath(path);
    if (where.kind === 'chapter') present.push(where.cid);
  }
  const order = reconcileChapterOrder(meta.value.chapters, present);
  if (cid === undefined || !order.includes(cid)) {
    if (order.length === 0) {
      study.value = { sid, cid: '', meta: meta.value, chapters: [] };
      doc.value = undefined;
      problem.value = 'This study has no chapters yet.';
      return;
    }
    dispatch({ type: 'missing', chapters: order });
    return;
  }
  const chapters = order.map((id) => ({ id, name: nameOf(files.get(chapterPath(sid, id))!, id) }));
  const text = files.get(chapterPath(sid, cid))!;
  const sameChapter = study.peek()?.sid === sid && study.peek()?.cid === cid;
  const same = sameChapter && text === fileText && doc.peek() !== undefined;
  study.value = { sid, cid, meta: meta.value, chapters };
  wanted = undefined;
  if (same) {
    if (wantAt) at.value = nearest(doc.peek()!.present, wantAt);
    return;
  }
  fileText = text;
  const parsed = parseChapterFile(text, cid);
  if (!parsed.ok) {
    doc.value = undefined;
    problem.value = `This chapter can't be read, so the app never rewrites it: ${parsed.reason}.`;
    return;
  }
  const illegal = parsed.notes.filter((n) => n.kind === 'illegal');
  problem.value = illegal.length ? `This chapter holds ${illegal.length} illegal move(s), which an edit would cut: it is shown without editing.` : undefined;
  doc.value = illegal.length ? undefined : startHistory(parsed.chapter);
  const shown = doc.value ? parsed.chapter : undefined;
  at.value = shown ? nearest(shown, wantAt ?? (sameChapter ? at.peek() : [])) : [];
}

/** Writes the open chapter (and any other files of the same change) after the edits before it. */
function persist(next: Chapter, more: ReadonlyMap<string, string | null> = new Map()): void {
  const s = study.peek();
  if (!s) return;
  const text = chapterFileText(next);
  // The analysis board's chapter stays on this device (§5.35).
  if (s.sid === SCRATCH) {
    try {
      localStorage.setItem(SCRATCH_KEY, text);
    } catch {
      // kept for this page only
    }
    return;
  }
  fileText = text;
  written++;
  const files = new Map<string, string | null>([[chapterPath(s.sid, s.cid), text], ...more]);
  writing = writing.then(() => saveFiles(files)).catch((error: unknown) => void (feedback.value = `Not saved: ${error instanceof Error ? error.message : String(error)}`));
}

/** Applies an edit to the open chapter; the move shown becomes `then`, or the nearest that remains. */
export function edit(fn: (c: Chapter) => Edit, then?: Path): boolean {
  const d = doc.peek();
  if (!d) return false;
  const result = fn(d.present);
  if (!result.ok) {
    feedback.value = result.error;
    return false;
  }
  feedback.value = undefined;
  if (result.value === d.present) return true;
  doc.value = record(d, result.value);
  at.value = nearest(result.value, then ?? at.peek());
  persist(result.value);
  return true;
}

/** Plays a move from the move shown: into the line if it's there, else as a new variation. */
export function play(san: string): void {
  const d = doc.peek();
  if (!d) return;
  const result = addMove(d.present, at.peek(), san);
  if (!result.ok) {
    feedback.value = result.error;
    return;
  }
  feedback.value = undefined;
  if (result.value.chapter !== d.present) {
    doc.value = record(d, result.value.chapter);
    persist(result.value.chapter);
  }
  at.value = result.value.path;
}

/** Plays `sans` from the move shown (an engine's line, §5.31): into the lines there, else as a variation. */
export function playLine(sans: readonly string[]): void {
  const d = doc.peek();
  if (!d) return;
  const result = addLine(d.present, at.peek(), sans);
  if (!result.ok) {
    feedback.value = result.error;
    return;
  }
  feedback.value = undefined;
  if (result.value.chapter !== d.present) {
    doc.value = record(d, result.value.chapter);
    persist(result.value.chapter);
  }
  at.value = result.value.path;
}

function travel(move: (h: History<Chapter>) => History<Chapter>): void {
  const d = doc.peek();
  if (!d) return;
  const next = move(d);
  if (next === d) return;
  doc.value = next;
  at.value = nearest(next.present, at.peek());
  persist(next.present);
}

export const undoEdit = () => travel(undo);
export const redoEdit = () => travel(redo);

export function goTo(path: Path): void {
  const c = chapter.peek();
  if (c) at.value = nearest(c, path);
}

export function move(how: Step): void {
  const c = chapter.peek();
  if (c) at.value = step(c, at.peek(), how);
}

export const currentLinePgn = () => {
  const c = chapter.peek();
  return c ? linePgn(c, at.peek()) : '';
};

export function resolve(conflict: OpenConflict, resolution: Resolution): void {
  edit((c) => resolveConflict(c, conflict, resolution));
}

export const conflictsHere = computed(() => (chapter.value ? openConflicts(chapter.value) : []));

// ---- chapter and study level ------------------------------------------------------------------

export const setSide = (side: 'white' | 'black') => edit((c) => setOrientation(c, side));

export function renameOpenChapter(name: string): void {
  const s = study.peek();
  if (s) edit((c) => renameChapter(c, s.meta.name, name));
}

export async function addChapter(name: string, side: 'white' | 'black'): Promise<string | undefined> {
  const s = study.peek();
  if (!s) return undefined;
  const cid = freshId(cryptoRandom, new Set(s.chapters.map((c) => c.id)));
  const made = newChapter(cid, s.meta.name, name.trim() || `Chapter ${s.chapters.length + 1}`, side);
  if (!made.ok) {
    feedback.value = made.error;
    return undefined;
  }
  const meta = addChapterToStudy({ ...s.meta, chapters: s.chapters.map((c) => c.id) }, cid);
  await afterEdits(() => saveFiles(new Map([[chapterPath(s.sid, cid), chapterFileText(made.value)], [studyMetaPath(s.sid), writeStudyMeta(meta)]])));
  dispatch({ type: 'open', mode: { name: 'chapter', sid: s.sid, cid } });
  return cid;
}

export async function deleteOpenChapter(): Promise<void> {
  const s = study.peek();
  if (!s) return;
  const change = deleteChapter({ ...s.meta, chapters: s.chapters.map((c) => c.id) }, s.cid);
  await afterEdits(() => saveFiles(change));
  dispatch({ type: 'missing', chapters: s.chapters.map((c) => c.id).filter((c) => c !== s.cid) });
}

export async function moveOpenChapter(by: -1 | 1): Promise<void> {
  const s = study.peek();
  if (!s) return;
  const order = s.chapters.map((c) => c.id);
  const i = order.indexOf(s.cid);
  const j = i + by;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j]!, order[i]!];
  const meta = reorderChapters({ ...s.meta, chapters: s.chapters.map((c) => c.id) }, order);
  if (!meta.ok) return;
  await afterEdits(() => saveFiles(new Map([[studyMetaPath(s.sid), writeStudyMeta(meta.value)]])));
}

/**
 * Runs a change to study files after the open chapter's edits have been written, and marks it as
 * this tab's own, so a read under way is made again rather than taken for someone else's work. A
 * change that rewrites the open chapter's file (a study renamed) reads it again afterwards, and
 * its undo starts over.
 */
export function afterEdits<T>(fn: () => Promise<T>): Promise<T> {
  written++;
  const run = writing.then(fn);
  writing = run.then(
    () => undefined,
    (error: unknown) => void (feedback.value = `Not saved: ${error instanceof Error ? error.message : String(error)}`),
  );
  return run;
}

/** The side the open chapter is for, from its Orientation (white when it has none). */
export const side = computed<'white' | 'black'>(() => (chapter.value && header(chapter.value, 'Orientation') === 'black' ? 'black' : 'white'));
