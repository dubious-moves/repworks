// The search page's data (PLAN.md §5.166): every chapter of every study on this device, read and
// parsed once per file text, in the home's order (the repertoire's studies by name, then the
// reference ones; each study's chapters in its own order). Read when the page opens and again
// when the data changes. A chapter this version can't read is left out (and never rewritten).
import { signal } from '@preact/signals';
import type { PositionKey } from '../core/chess/positionKey.ts';
import { chapterPath, classifyPath } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { header, type Chapter } from '../core/study/model.ts';
import type { ReachOf, SearchChapter } from '../core/study/search.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import { transpositions } from '../core/study/transpositions.ts';
import type { Path } from '../core/study/tree.ts';
import { localStore } from './state.ts';

/** The chapters to search; undefined until read. */
export const searchChapters = signal<SearchChapter[] | undefined>(undefined);

/** Each file's parse, kept while its text is the same. */
const byText = new Map<string, { text: string; chapter: Chapter | null }>();
let reading = 0;

export async function readSearchChapters(): Promise<void> {
  const store = localStore();
  if (!store) return;
  const ticket = ++reading;
  const files = await store.read((p) => p.startsWith('studies/'));
  if (ticket !== reading) return;
  const metas: { sid: string; name: string; kind: 'repertoire' | 'reference'; cids: string[] }[] = [];
  const present = new Map<string, string[]>();
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind === 'study') {
      const meta = parseStudyMeta(text, where.sid);
      if (meta.ok) metas.push({ sid: where.sid, name: meta.value.name, kind: meta.value.kind, cids: meta.value.chapters });
    } else if (where.kind === 'chapter') present.set(where.sid, [...(present.get(where.sid) ?? []), where.cid]);
  }
  metas.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) || (a.sid < b.sid ? -1 : 1) : a.kind === 'repertoire' ? -1 : 1));
  const out: SearchChapter[] = [];
  for (const meta of metas) {
    for (const cid of reconcileChapterOrder(meta.cids, present.get(meta.sid) ?? [])) {
      const path = chapterPath(meta.sid, cid);
      const text = files.get(path)!;
      let kept = byText.get(path);
      if (!kept || kept.text !== text) {
        const parsed = parseChapterFile(text, cid);
        byText.set(path, (kept = { text, chapter: parsed.ok ? parsed.chapter : null }));
      }
      if (kept.chapter) out.push({ sid: meta.sid, study: meta.name, kind: meta.kind, cid, name: header(kept.chapter, 'ChapterName') ?? cid, chapter: kept.chapter });
    }
  }
  searchChapters.value = out;
}

/** Each chapter's positions, walked once while the chapter is the same. */
const reached = new WeakMap<Chapter, ReadonlyMap<PositionKey, readonly Path[]>>();
export const reachOf: ReachOf = (chapter) => {
  let r = reached.get(chapter);
  if (!r) reached.set(chapter, (r = transpositions(chapter).reach));
  return r;
};
