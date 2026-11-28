// The open study's review lists (PLAN.md §5.216): a reviewing session's files for it
// (`review/<sid>/<name>.json`, which only the session writes), each item with the owner's answer
// from the log and whether the chapter has moved on from it. Read when the study opens and when
// the data changes (a sync brought a list, or took one away); the open chapter is the editor's,
// edits included, so an item whose move was just changed says so at once. Items at one move are a
// position (§5.218): shown under one head, counted once, answered once.
import { computed, effect, signal } from '@preact/signals';
import { chapterPath, classifyPath, reviewDir } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import type { Chapter } from '../core/study/model.ts';
import { answerOf, itemState, newestFirst, parseReviewList, positionsOf, reviewCard, type Placed, type ReviewPosition, type ReviewList } from '../core/study/reviewList.ts';
import { chapter, SCRATCH, study } from './editor.ts';
import { localStore, recordEvents } from './state.ts';
import { dataVersion } from './sync.ts';
import { trainData } from './train.ts';

export interface ShownChapter {
  cid: string;
  /** The chapter's name now, or as the list has it when the chapter is gone. */
  name: string;
  positions: ReviewPosition[];
}
export interface ShownList {
  list: ReviewList;
  /** The positions shown under this list (one whose items are in several lists is under the first), by chapter. */
  chapters: ShownChapter[];
  /** Positions still waiting for the owner: an item with no answer, and the chapter as the item says. */
  open: number;
  total: number;
}

/** The lists as read, with the study's other chapters (those the lists name) parsed. */
const read = signal<{ sid: string; lists: ReviewList[]; chapters: Map<string, Chapter> } | undefined>(undefined);
/** Each chapter file's parse, kept while its text is the same. */
const byText = new Map<string, { text: string; chapter: Chapter | undefined }>();
let reading = 0;

async function load(sid: string): Promise<void> {
  const store = localStore();
  if (!store) return;
  const ticket = ++reading;
  const files = await store.read((p) => p.startsWith(reviewDir(sid)));
  const lists: ReviewList[] = [];
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind !== 'review') continue;
    const r = parseReviewList(text);
    // A list this version can't read, or one filed under another study or name, isn't shown.
    if (r.ok && r.list.sid === sid && r.list.name === where.name) lists.push(r.list);
  }
  lists.sort(newestFirst);
  const wanted = new Set(lists.flatMap((l) => l.items.map((i) => chapterPath(sid, i.cid))));
  const texts = wanted.size ? await store.read((p) => wanted.has(p)) : new Map<string, string>();
  if (ticket !== reading) return;
  const chapters = new Map<string, Chapter>();
  for (const [path, text] of texts) {
    const where = classifyPath(path);
    if (where.kind !== 'chapter') continue;
    let kept = byText.get(path);
    if (!kept || kept.text !== text) {
      const parsed = parseChapterFile(text, where.cid);
      byText.set(path, (kept = { text, chapter: parsed.ok ? parsed.chapter : undefined }));
    }
    if (kept.chapter) chapters.set(where.cid, kept.chapter);
  }
  read.value = { sid, lists, chapters };
}

effect(() => {
  void dataVersion.value;
  const sid = study.value?.sid;
  if (!sid || sid === SCRATCH) return;
  void load(sid);
});

/** The open study's lists, the newest first, as positions: each item with its answer and state. */
export const reviewLists = computed<ShownList[]>(() => {
  const s = study.value;
  const r = read.value;
  if (!s || !r || r.sid !== s.sid) return [];
  const data = trainData.value;
  const open = chapter.value;
  const names = new Map(s.chapters.map((c) => [c.id, c.name] as const));
  const shown = positionsOf(r.lists, (list, item) => {
    const answer = data ? answerOf(data.eventsOf(reviewCard(list.sid, list.name, item.id))) : undefined;
    return { state: itemState(item, answer, item.cid === s.cid && open ? open : r.chapters.get(item.cid)), ...(answer ? { answer } : {}) };
  });
  return shown.map(({ list, positions, open: waiting }) => {
    const chapters: ShownChapter[] = [];
    for (const p of positions) {
      let of = chapters.find((c) => c.cid === p.cid);
      if (!of) chapters.push((of = { cid: p.cid, name: names.get(p.cid) ?? p.items.map((i) => i.list.chapters[p.cid]).find(Boolean) ?? p.cid, positions: [] }));
      of.positions.push(p);
    }
    return { list, chapters, open: waiting, total: positions.length };
  });
});

/**
 * The owner's answer to items, logged, an event per item under its own list's card; `open` with no
 * note takes an answer back. A position's answer and "OK all open" are several items at once.
 */
export function answerItems(items: readonly Placed[], to: (item: Placed) => { a: 'ok' | 'no' | 'open'; note?: string | undefined }): void {
  const t = new Date().toISOString();
  void recordEvents(
    items.map((i) => {
      const { a, note } = to(i);
      const text = note?.trim();
      return { t, k: 'answer' as const, card: reviewCard(i.list.sid, i.list.name, i.item.id), a, ...(text ? { note: text } : {}) };
    }),
  );
}
