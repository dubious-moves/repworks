// The Study tab's data (PLAN.md §5.162): every chapter of the open study, indexed by the position
// each move is played from (`chapterMoves`). The open chapter is the editor's, edits included;
// the others are read from this device's copy of the data repo, parsed once per text. Read when
// the tab is shown, again when the study, the open chapter or the data changes.
import { computed, signal } from '@preact/signals';
import { chapterPath, classifyPath, studyMetaPath } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { header, type Chapter } from '../core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import { chapterMoves, type ChapterMoves } from '../core/study/studyMoves.ts';
import { localStore } from './state.ts';
import { trainData } from './train.ts';

export interface StudyChapterMoves {
  cid: string;
  name: string;
  moves: ChapterMoves;
}

/** The open study's chapters as indexed, for the study `sid`; undefined until read. */
export const studyIndex = signal<{ sid: string; chapters: StudyChapterMoves[] } | undefined>(undefined);

/** Each file's parse and index, kept while its text is the same. */
const byText = new Map<string, { text: string; read: { name: string; moves: ChapterMoves } | null }>();
/** The open chapter's index, kept while it is the same object (an edit makes a new one). */
const byChapter = new WeakMap<Chapter, ChapterMoves>();
let reading = 0;

/**
 * Reads and indexes study `sid`'s chapters, the open chapter `open` (its id `openCid`) as the
 * editor has it. A later call wins over one still reading.
 */
export async function readStudyIndex(sid: string, openCid: string | undefined, open: Chapter | undefined): Promise<void> {
  const store = localStore();
  if (!store) return;
  const ticket = ++reading;
  const files = await store.read((p) => p.startsWith(`studies/${sid}/`));
  if (ticket !== reading) return;
  const metaText = files.get(studyMetaPath(sid));
  const meta = metaText === undefined ? undefined : parseStudyMeta(metaText, sid);
  const present: string[] = [];
  for (const path of files.keys()) {
    const where = classifyPath(path);
    if (where.kind === 'chapter') present.push(where.cid);
  }
  const order = reconcileChapterOrder(meta?.ok ? meta.value.chapters : [], present);
  // The analysis board's chapter (§5.35) has no file in the repo: the open chapter is always in.
  if (openCid && open && !order.includes(openCid)) order.unshift(openCid);
  const chapters: StudyChapterMoves[] = [];
  for (const cid of order) {
    if (cid === openCid && open) {
      let moves = byChapter.get(open);
      if (!moves) byChapter.set(open, (moves = chapterMoves(open)));
      chapters.push({ cid, name: header(open, 'ChapterName') ?? cid, moves });
      continue;
    }
    const path = chapterPath(sid, cid);
    const text = files.get(path)!;
    let kept = byText.get(path);
    if (!kept || kept.text !== text) {
      const parsed = parseChapterFile(text, cid);
      kept = { text, read: parsed.ok ? { name: header(parsed.chapter, 'ChapterName') ?? cid, moves: chapterMoves(parsed.chapter) } : null };
      byText.set(path, kept);
    }
    // A chapter this version can't read is left out; the app never rewrites it.
    if (kept.read) chapters.push({ cid, ...kept.read });
  }
  studyIndex.value = { sid, chapters };
}

/**
 * The whole repertoire's chapters as indexed (PLAN.md §5.165): the analysis board's tab, where no
 * study is open. Each is named by its study and chapter and keyed `sid/cid`; in the repertoire's
 * order (its studies by name, each one's chapters in its own). The chapters are the ones training
 * has read, each indexed once while its text is the same. Undefined until the repertoire is read.
 */
export const repertoireMoves = computed<StudyChapterMoves[] | undefined>(() => {
  const data = trainData.value;
  if (!data) return undefined;
  const out: StudyChapterMoves[] = [];
  for (const [key, c] of data.chapters) {
    const sid = key.slice(0, key.indexOf('/'));
    let moves = byChapter.get(c);
    if (!moves) byChapter.set(c, (moves = chapterMoves(c)));
    out.push({ cid: key, name: `${data.studyNames.get(sid) ?? sid} · ${header(c, 'ChapterName') ?? c.id}`, moves });
  }
  return out;
});

