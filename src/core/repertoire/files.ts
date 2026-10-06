// The studies of a data repo's files, in the study list's order (by name, as the app lists
// them), each with its chapters in the study's order (§4.4): what `indexStudies` takes.
// A study whose study.json won't parse, and a chapter file that won't, are listed rather than
// guessed at.
import { chapterPath, classifyPath } from '../data/layout.ts';
import { parseChapterFile } from '../pgn/parse.ts';
import type { Chapter, StudyKind } from '../study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../study/studyMeta.ts';

export interface StudyChapters {
  sid: string;
  name: string;
  kind: StudyKind;
  chapters: Chapter[];
}

export function studiesFromFiles(files: ReadonlyMap<string, string>): { studies: StudyChapters[]; unreadable: { path: string; reason: string }[] } {
  const metas = new Map<string, { name: string; kind: StudyKind; listed: string[] }>();
  const present = new Map<string, string[]>();
  const unreadable: { path: string; reason: string }[] = [];
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind === 'study') {
      const meta = parseStudyMeta(text, where.sid);
      if (meta.ok) metas.set(where.sid, { name: meta.value.name, kind: meta.value.kind, listed: meta.value.chapters });
      else unreadable.push({ path, reason: meta.errors.join('; ') });
    } else if (where.kind === 'chapter') present.set(where.sid, [...(present.get(where.sid) ?? []), where.cid]);
  }
  for (const [sid, cids] of present) if (!metas.has(sid)) for (const cid of cids) unreadable.push({ path: chapterPath(sid, cid), reason: 'its study has no readable study.json' });
  const studies: StudyChapters[] = [];
  for (const [sid, meta] of metas) {
    const chapters: Chapter[] = [];
    for (const cid of reconcileChapterOrder(meta.listed, present.get(sid) ?? [])) {
      const path = chapterPath(sid, cid);
      const parsed = parseChapterFile(files.get(path)!, cid);
      if (parsed.ok) chapters.push(parsed.chapter);
      else unreadable.push({ path, reason: parsed.reason });
    }
    studies.push({ sid, name: meta.name, kind: meta.kind, chapters });
  }
  studies.sort((a, b) => a.name.localeCompare(b.name) || (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0));
  unreadable.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { studies, unreadable };
}
