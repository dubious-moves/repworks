// The open study's review lists (PLAN.md §5.216): a reviewing session's files for it
// (`review/<sid>/<name>.json`, which only the session writes), each item with the owner's answer
// from the log and whether the chapter has moved on from it. Read when the study opens and when
// the data changes (a sync brought a list, or took one away); the open chapter is the editor's,
// edits included, so an item whose move was just changed says so at once.
import { computed, effect, signal } from '@preact/signals';
import { chapterPath, classifyPath, reviewDir } from '../core/data/layout.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import type { Chapter } from '../core/study/model.ts';
import { answerOf, itemState, parseReviewList, reviewCard, type Answer, type ItemState, type ReviewItem, type ReviewList } from '../core/study/reviewList.ts';
import { chapter, SCRATCH, study } from './editor.ts';
import { localStore, recordEvent } from './state.ts';
import { dataVersion } from './sync.ts';
import { trainData } from './train.ts';

export interface ShownItem {
  item: ReviewItem;
  state: ItemState;
  answer?: Answer;
}
export interface ShownGroup {
  cid: string;
  /** The chapter's name now, or as the list has it when the chapter is gone. */
  name: string;
  items: ShownItem[];
}
export interface ShownList {
  list: ReviewList;
  groups: ShownGroup[];
  /** Items still waiting for the owner: no answer, and the chapter as the item says. */
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
  lists.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : a.name < b.name ? -1 : 1));
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

/** The open study's lists, the newest first, each item with its answer and state. */
export const reviewLists = computed<ShownList[]>(() => {
  const s = study.value;
  const r = read.value;
  if (!s || !r || r.sid !== s.sid) return [];
  const data = trainData.value;
  const open = chapter.value;
  const names = new Map(s.chapters.map((c) => [c.id, c.name] as const));
  return r.lists.map((list) => {
    const groups: ShownGroup[] = [];
    let waiting = 0;
    for (const item of list.items) {
      const answer = data ? answerOf(data.eventsOf(reviewCard(list.sid, list.name, item.id))) : undefined;
      const state = itemState(item, answer, item.cid === s.cid && open ? open : r.chapters.get(item.cid));
      if (state === 'open') waiting++;
      let group = groups.find((g) => g.cid === item.cid);
      if (!group) groups.push((group = { cid: item.cid, name: names.get(item.cid) ?? list.chapters[item.cid] ?? item.cid, items: [] }));
      group.items.push({ item, state, ...(answer ? { answer } : {}) });
    }
    return { list, groups, open: waiting, total: list.items.length };
  });
});

/** The owner's answer to an item, logged; `open` with no note takes an answer back. */
export function answerItem(list: ReviewList, item: ReviewItem, a: 'ok' | 'no' | 'open', note?: string): void {
  const text = note?.trim();
  void recordEvent({ t: new Date().toISOString(), k: 'answer', card: reviewCard(list.sid, list.name, item.id), a, ...(text ? { note: text } : {}) });
}
