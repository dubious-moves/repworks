// Studies made and deleted on the site (PLAN.md §5.15): each is one change to the working copies,
// a map from path to new text (null deletes), which the sync sends like any edit.
import type { Color } from 'chessops/types';
import { chapterPath, classifyPath, studyMetaPath } from '../data/layout.ts';
import { chapterFileText } from '../pgn/write.ts';
import type { StudyKind, StudyMeta } from './model.ts';
import { newChapter, removeChapterFromStudy, type Edit } from './ops.ts';
import { writeStudyMeta } from './studyMeta.ts';

export type FileChange = Map<string, string | null>;

export interface NewStudy {
  sid: string;
  /** The first chapter's ID. */
  cid: string;
  name: string;
  kind: StudyKind;
  chapterName: string;
  side: Color;
}

/** A new study with one empty chapter: its study.json and the chapter's file. */
export function createStudy(s: NewStudy): Edit<FileChange> {
  const name = s.name.trim();
  if (!name) return { ok: false, error: 'a study needs a name' };
  const chapter = newChapter(s.cid, name, s.chapterName.trim() || 'Chapter 1', s.side);
  if (!chapter.ok) return chapter;
  const meta: StudyMeta = { format: 1, id: s.sid, name, kind: s.kind, chapters: [s.cid] };
  return {
    ok: true,
    value: new Map([
      [studyMetaPath(s.sid), writeStudyMeta(meta)],
      [chapterPath(s.sid, s.cid), chapterFileText(chapter.value)],
    ]),
  };
}

/**
 * Deleting a study: every file under its folder (study.json, its chapters, any conflict copies),
 * in one change. A device that edited it meanwhile gets it back by the merge (§4.7).
 */
export function deleteStudy(sid: string, paths: Iterable<string>): FileChange {
  const out: FileChange = new Map();
  for (const path of paths) {
    const where = classifyPath(path);
    if ((where.kind === 'study' || where.kind === 'chapter' || where.kind === 'conflict-copy') && where.sid === sid) out.set(path, null);
  }
  return out;
}

/** Deleting a chapter: its file, and study.json without it. */
export function deleteChapter(meta: StudyMeta, cid: string): FileChange {
  return new Map([
    [chapterPath(meta.id, cid), null],
    [studyMetaPath(meta.id), writeStudyMeta(removeChapterFromStudy(meta, cid))],
  ]);
}
