// Several chapters of a study at once (PLAN.md §5.140): the list the "Manage chapters" dialog
// shows, and deleting, turning and merging the chosen ones, each one change to the working
// copies, written after the open chapter's edits (afterEdits) like the study's own settings.
import { classifyPath, studyMetaPath } from '../core/data/layout.ts';
import { deleteChapters, mergeChapters, setChaptersSide, type FileChange } from '../core/study/manage.ts';
import type { StudyMeta } from '../core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import { afterEdits } from './editor.ts';
import { dispatch, mode } from './mode.ts';
import type { Done } from './studies.ts';
import { localStore, saveFiles } from './state.ts';

export interface ChapterRow {
  id: string;
  name: string;
  /** From [Orientation]; undefined when it has none. */
  side: 'white' | 'black' | undefined;
}

interface StudyFiles {
  /** Its chapters in the study's order, as shown. */
  meta: StudyMeta;
  texts: Map<string, string>;
}

async function readStudy(sid: string): Promise<Done<StudyFiles>> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  const files = await store.read((p) => p.startsWith(`studies/${sid}/`));
  const metaText = files.get(studyMetaPath(sid));
  const meta = metaText === undefined ? undefined : parseStudyMeta(metaText, sid);
  if (!meta?.ok) return { ok: false, error: metaText === undefined ? 'that study isn’t on this device' : 'this study’s study.json can’t be read' };
  const texts = new Map<string, string>();
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind === 'chapter') texts.set(where.cid, text);
  }
  return { ok: true, value: { meta: { ...meta.value, chapters: reconcileChapterOrder(meta.value.chapters, texts.keys()) }, texts } };
}

const headerOf = (text: string, name: string): string | undefined => {
  const m = new RegExp(`^\\[${name} "((?:[^"\\\\]|\\\\.)*)"\\]$`, 'm').exec(text);
  return m ? m[1]!.replace(/\\(.)/g, '$1') : undefined;
};

/** The study's chapters, in its order, with their names and sides. */
export async function chapterRows(sid: string): Promise<Done<ChapterRow[]>> {
  const read = await readStudy(sid);
  if (!read.ok) return read;
  const { meta, texts } = read.value;
  return {
    ok: true,
    value: meta.chapters.map((id) => {
      const text = texts.get(id)!;
      const side = headerOf(text, 'Orientation')?.toLowerCase();
      return { id, name: headerOf(text, 'ChapterName') ?? id, side: side === 'white' || side === 'black' ? side : undefined };
    }),
  };
}

/** Reads the study after the open chapter's edits, and writes what `change` makes of it. */
function changeStudy<T>(sid: string, change: (s: StudyFiles) => Done<{ files: FileChange; value: T }>): Promise<Done<T>> {
  return afterEdits(async () => {
    const read = await readStudy(sid);
    if (!read.ok) return read;
    const made = change(read.value);
    if (!made.ok) return made;
    await saveFiles(made.value.files);
    return { ok: true, value: made.value.value } as const;
  });
}

/** The open chapter, when it is one of `cids` and goes, gives way to the study's first one left. */
function leaveDeleted(sid: string, left: readonly string[]): void {
  const m = mode.peek();
  if (m.name === 'chapter' && m.sid === sid) dispatch({ type: 'missing', chapters: left });
}

/** Deletes the chapters, in one change. */
export async function removeChapters(sid: string, cids: readonly string[]): Promise<Done> {
  const done = await changeStudy(sid, ({ meta }) => {
    const gone = new Set(cids);
    return { ok: true, value: { files: deleteChapters(meta, cids), value: meta.chapters.filter((c) => !gone.has(c)) } };
  });
  if (!done.ok) return done;
  leaveDeleted(sid, done.value);
  return { ok: true, value: undefined };
}

/** Gives the chapters a side, in one change; the names of those that can't be read, left as they are. */
export function turnChapters(sid: string, cids: readonly string[], side: 'white' | 'black'): Promise<Done<string[]>> {
  return changeStudy(sid, ({ meta, texts }) => {
    const { change, unreadable } = setChaptersSide(meta, texts, cids, side);
    return { ok: true, value: { files: change, value: unreadable } };
  });
}

/** Merges the chapters into the first of them (in the study's order), in one change; its ID. */
export async function joinChapters(sid: string, cids: readonly string[]): Promise<Done<string>> {
  const done = await changeStudy(sid, ({ meta, texts }) => {
    const merged = mergeChapters(meta, texts, cids);
    if (!merged.ok) return merged;
    const gone = new Set(cids);
    gone.delete(merged.value.into);
    return { ok: true, value: { files: merged.value.change, value: { into: merged.value.into, left: meta.chapters.filter((c) => !gone.has(c)) } } };
  });
  if (!done.ok) return done;
  leaveDeleted(sid, [done.value.into, ...done.value.left.filter((c) => c !== done.value.into)]);
  return { ok: true, value: done.value.into };
}
