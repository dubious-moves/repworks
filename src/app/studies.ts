// Studies made and managed on the site (PLAN.md §5.15): a new study with no import, and a study
// renamed, turned into the other kind or deleted, from its card or from the chapter view. Each is
// one change to the working copies, written after the open chapter's edits (afterEdits).
import { chapterPath, classifyPath, studyMetaPath } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { chapterFileText } from '../core/pgn/write.ts';
import { freshId } from '../core/study/ids.ts';
import { createStudy, deleteStudy } from '../core/study/manage.ts';
import type { Chapter, StudyKind } from '../core/study/model.ts';
import { renameStudy, setKind } from '../core/study/ops.ts';
import { parseStudyMeta, reconcileChapterOrder, writeStudyMeta } from '../core/study/studyMeta.ts';
import { cryptoRandom } from '../platform/browser.ts';
import { afterEdits } from './editor.ts';
import { localStore, saveFiles } from './state.ts';

export type Done<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** Makes a study with one empty chapter; its IDs, for opening it. */
export async function newStudy(s: { name: string; kind: StudyKind; chapterName: string; side: 'white' | 'black' }): Promise<Done<{ sid: string; cid: string }>> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  const taken = new Set<string>();
  for (const path of await store.paths()) {
    const where = classifyPath(path);
    if (where.kind === 'study' || where.kind === 'chapter') taken.add(where.sid);
  }
  const sid = freshId(cryptoRandom, taken);
  const cid = freshId(cryptoRandom, new Set());
  const made = createStudy({ sid, cid, ...s });
  if (!made.ok) return made;
  await afterEdits(() => saveFiles(made.value));
  return { ok: true, value: { sid, cid } };
}

/** Deletes a study: study.json and every chapter, in one change. */
export async function removeStudy(sid: string): Promise<void> {
  const store = localStore();
  if (!store) return;
  await afterEdits(async () => saveFiles(deleteStudy(sid, await store.paths())));
}

/**
 * Renames a study and sets its kind: study.json and, for a new name, every chapter's StudyName,
 * in one change. A chapter that can't be read keeps its old StudyName: the app never rewrites it.
 */
export async function changeStudy(sid: string, to: { name: string; kind: StudyKind }): Promise<Done> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  return afterEdits(async () => {
    const files = await store.read((p) => p.startsWith(`studies/${sid}/`));
    const metaText = files.get(studyMetaPath(sid));
    const meta = metaText === undefined ? undefined : parseStudyMeta(metaText, sid);
    if (!meta?.ok) return { ok: false, error: 'this study’s study.json can’t be read' } as const;
    const out = new Map<string, string | null>();
    let next = meta.value;
    if (to.name.trim() !== meta.value.name) {
      const present: string[] = [];
      for (const path of files.keys()) {
        const where = classifyPath(path);
        if (where.kind === 'chapter') present.push(where.cid);
      }
      const chapters: Chapter[] = [];
      for (const cid of reconcileChapterOrder(meta.value.chapters, present)) {
        const parsed = parseChapterFile(files.get(chapterPath(sid, cid))!, cid);
        if (parsed.ok && !parsed.notes.some((n) => n.kind === 'illegal')) chapters.push(parsed.chapter);
      }
      const renamed = renameStudy(meta.value, chapters, to.name);
      if (!renamed.ok) return renamed;
      next = renamed.value.meta;
      for (const c of renamed.value.chapters) out.set(chapterPath(sid, c.id), chapterFileText(c));
    }
    if (to.kind !== next.kind) next = setKind(next, to.kind);
    if (next !== meta.value) out.set(studyMetaPath(sid), writeStudyMeta(next));
    await saveFiles(out);
    return { ok: true, value: undefined } as const;
  });
}
