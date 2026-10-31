// Studies made and deleted on the site (PLAN.md §5.15): each is one change to the working copies,
// a map from path to new text (null deletes), which the sync sends like any edit.
import type { Color } from 'chessops/types';
import { chapterPath, classifyPath, studyMetaPath } from '../data/layout.ts';
import { parseChapterFile } from '../pgn/parse.ts';
import { chapterFileText } from '../pgn/write.ts';
import { combineChapters } from './combine.ts';
import { header, type Chapter, type StudyKind, type StudyMeta } from './model.ts';
import { newChapter, removeChapterFromStudy, setOrientation, type Edit } from './ops.ts';
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

// ---- several chapters at once (§5.140) ---------------------------------------------------------
// `meta.chapters` is the study's order as shown (reconciled with the files present); `texts` the
// chapter files by chapter ID.

/** Deleting chapters: their files, and study.json without them, in one change. */
export function deleteChapters(meta: StudyMeta, cids: Iterable<string>): FileChange {
  const gone = new Set(cids);
  const out: FileChange = new Map();
  for (const cid of gone) out.set(chapterPath(meta.id, cid), null);
  out.set(studyMetaPath(meta.id), writeStudyMeta({ ...meta, chapters: meta.chapters.filter((c) => !gone.has(c)) }));
  return out;
}

type Read = { ok: true; chapter: Chapter } | { ok: false; name: string };

/** A chapter the app may rewrite: read, and with no illegal move the reading would cut. */
function readChapter(texts: ReadonlyMap<string, string>, cid: string): Read {
  const text = texts.get(cid);
  const parsed = text === undefined ? undefined : parseChapterFile(text, cid);
  if (parsed?.ok && !parsed.notes.some((n) => n.kind === 'illegal')) return { ok: true, chapter: parsed.chapter };
  const name = parsed?.ok ? header(parsed.chapter, 'ChapterName') : parsed?.headers.find(([k]) => k === 'ChapterName')?.[1];
  return { ok: false, name: name ?? cid };
}

/**
 * Chapters given a side ([Orientation]), in one change. A chapter already for that side isn't
 * written; one that can't be read is left as it is (the app never rewrites it) and named.
 */
export function setChaptersSide(meta: StudyMeta, texts: ReadonlyMap<string, string>, cids: Iterable<string>, side: Color): { change: FileChange; unreadable: string[] } {
  const change: FileChange = new Map();
  const unreadable: string[] = [];
  for (const cid of cids) {
    const read = readChapter(texts, cid);
    if (!read.ok) {
      unreadable.push(read.name);
      continue;
    }
    if (header(read.chapter, 'Orientation') === side) continue;
    const turned = setOrientation(read.chapter, side);
    if (turned.ok) change.set(chapterPath(meta.id, cid), chapterFileText(turned.value));
  }
  return { change, unreadable };
}

/**
 * Chapters merged into the first of them in the study's order (`combineChapters`): its file
 * rewritten with every line, the others' files deleted and study.json without them, in one
 * change. Refused, with nothing written, when one can't be read or the trees don't fit together.
 */
export function mergeChapters(meta: StudyMeta, texts: ReadonlyMap<string, string>, cids: Iterable<string>): Edit<{ change: FileChange; into: string }> {
  const chosen = new Set(cids);
  const order = meta.chapters.filter((c) => chosen.has(c));
  const chapters: Chapter[] = [];
  for (const cid of order) {
    const read = readChapter(texts, cid);
    if (!read.ok) return { ok: false, error: `“${read.name}” can’t be read, so it is left as it is` };
    chapters.push(read.chapter);
  }
  const merged = combineChapters(chapters);
  if (!merged.ok) return merged;
  const [into, ...gone] = order;
  const change = deleteChapters(meta, gone);
  change.set(chapterPath(meta.id, into!), chapterFileText(merged.value));
  return { ok: true, value: { change, into: into! } };
}
