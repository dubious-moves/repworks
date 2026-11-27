// A review list (PLAN.md §5.216): what a reviewing session changed in a study's chapters and what
// it asks, as items the study page shows, each at a move. The session writes the list as one file
// of the data repo, `review/<sid>/<name>.json`, which no device ever writes; the owner's answers
// are `answer` events in his device's log (core/progress/events.ts), the latest per item deciding.
// So no file has two writers and nothing is merged. Pure: the file's text, the log's events.
import type { DeviceEvent } from '../progress/replay.ts';
import type { Chapter } from './model.ts';
import { nodeAt } from './tree.ts';

export const REVIEW_FORMAT = 1;

/**
 * What an item is about: `move` my move at a position changed, `reply` the opponent's main reply
 * did, `added` and `removed` a part that came or went, `comment`, `arrows`, `glyphs`, `order` (side
 * lines in another order) a move's own, `question` something the session asks at a move.
 */
export const ITEM_KINDS = ['move', 'reply', 'added', 'removed', 'comment', 'arrows', 'glyphs', 'order', 'question'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface ReviewItem {
  /** Its name within the list: letters, digits and `.,+#=-`, so a card ID can carry it. */
  id: string;
  /** The chapter. */
  cid: string;
  kind: ItemKind;
  /** The move the app opens at: the item's own, or for a removed part the last move still there. */
  at: string[];
  /** The line as text, in two parts: up to the change, and the change itself ("8. h4"). */
  lead: string;
  part: string;
  /** More to read under it: the old line, a part's other lines, a comment's texts. */
  detail?: string[];
  /** The session's own words on it. */
  text?: string;
  /** For `move` and `reply` the move now first at the position; for `removed` the move taken away. */
  san?: string;
}

export interface ReviewList {
  v: typeof REVIEW_FORMAT;
  sid: string;
  /** The file's name without `.json`: lower-case letters, digits and dashes. */
  name: string;
  /** What the panel calls it: "Jobava batch 4". */
  title: string;
  /** When it was made (ISO 8601). */
  created: string;
  /** What was compared, for the reader of the file: "repworks-data@4f2a91c", "repworks-data@9b0c11d". */
  from?: string;
  to?: string;
  /** The chapters' names when it was made, by id. */
  chapters: Record<string, string>;
  items: ReviewItem[];
}

export const LIST_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ITEM_ID = /^[A-Za-z0-9.,+#=-]{1,400}$/;
const SAN = /^[A-Za-z0-9+#=-]{2,8}$/;

export type ReadList = { ok: true; list: ReviewList } | { ok: false; error: string };

const isText = (x: unknown): x is string => typeof x === 'string';

/** A list file read strictly: one it can't read in full is not shown in part (and is never rewritten: no device writes these). */
export function parseReviewList(text: string): ReadList {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'not a JSON object' };
  const o = raw as Record<string, unknown>;
  if (o['v'] !== REVIEW_FORMAT) return { ok: false, error: `v must be ${REVIEW_FORMAT}, found ${JSON.stringify(o['v'])}` };
  for (const f of ['sid', 'name', 'title', 'created']) if (!isText(o[f]) || !o[f]) return { ok: false, error: `${f} must be a non-empty string` };
  if (!LIST_NAME.test(o['name'] as string)) return { ok: false, error: 'name must be lower-case letters, digits and dashes' };
  const chapters = o['chapters'];
  if (typeof chapters !== 'object' || chapters === null || Array.isArray(chapters) || !Object.values(chapters).every(isText)) return { ok: false, error: 'chapters must map chapter ids to names' };
  if (!Array.isArray(o['items'])) return { ok: false, error: 'items must be a list' };
  const items: ReviewItem[] = [];
  const seen = new Set<string>();
  for (const [i, x] of (o['items'] as unknown[]).entries()) {
    const where = `item ${i + 1}`;
    if (typeof x !== 'object' || x === null) return { ok: false, error: `${where} is not an object` };
    const it = x as Record<string, unknown>;
    if (!isText(it['id']) || !ITEM_ID.test(it['id'])) return { ok: false, error: `${where}: id must be letters, digits and .,+#=-` };
    if (seen.has(it['id'])) return { ok: false, error: `${where}: id ${it['id']} twice` };
    seen.add(it['id']);
    if (!isText(it['cid']) || !it['cid']) return { ok: false, error: `${where}: cid must be a chapter id` };
    if (!ITEM_KINDS.includes(it['kind'] as ItemKind)) return { ok: false, error: `${where}: kind must be one of ${ITEM_KINDS.join(', ')}` };
    if (!Array.isArray(it['at']) || !it['at'].every((s) => isText(s) && SAN.test(s))) return { ok: false, error: `${where}: at must be a list of moves` };
    if (!isText(it['lead']) || !isText(it['part'])) return { ok: false, error: `${where}: lead and part must be strings` };
    const item: ReviewItem = { id: it['id'], cid: it['cid'], kind: it['kind'] as ItemKind, at: it['at'] as string[], lead: it['lead'], part: it['part'] };
    if (it['detail'] !== undefined) {
      if (!Array.isArray(it['detail']) || !it['detail'].every(isText)) return { ok: false, error: `${where}: detail must be a list of strings` };
      item.detail = it['detail'] as string[];
    }
    if (it['text'] !== undefined) {
      if (!isText(it['text'])) return { ok: false, error: `${where}: text must be a string` };
      item.text = it['text'];
    }
    if (it['san'] !== undefined) {
      if (!isText(it['san']) || !SAN.test(it['san'])) return { ok: false, error: `${where}: san must be a move` };
      item.san = it['san'];
    }
    items.push(item);
  }
  const list: ReviewList = { v: REVIEW_FORMAT, sid: o['sid'] as string, name: o['name'] as string, title: o['title'] as string, created: o['created'] as string, chapters: chapters as Record<string, string>, items };
  if (isText(o['from'])) list.from = o['from'];
  if (isText(o['to'])) list.to = o['to'];
  return { ok: true, list };
}

/** The file's text: one stable form, an item a line, so a list made again differs only where it changed. */
export function writeReviewList(list: ReviewList): string {
  const head = { v: list.v, sid: list.sid, name: list.name, title: list.title, created: list.created, ...(list.from !== undefined ? { from: list.from } : {}), ...(list.to !== undefined ? { to: list.to } : {}), chapters: list.chapters };
  const items = list.items.map((i) => `  ${JSON.stringify({ id: i.id, cid: i.cid, kind: i.kind, at: i.at, lead: i.lead, part: i.part, ...(i.detail?.length ? { detail: i.detail } : {}), ...(i.text ? { text: i.text } : {}), ...(i.san ? { san: i.san } : {}) })}`);
  return `${JSON.stringify(head).slice(0, -1)},"items":[\n${items.join(',\n')}${items.length ? '\n' : ''}]}\n`;
}

/** An item's id from what it is: the same change is the same item when a list is made again. */
export const itemId = (cid: string, kind: ItemKind, path: readonly string[]) => `${cid}.${kind}.${path.join(',')}`;

/** The card an item's answers are logged under: `v|<sid>|<list>|<item>`. */
export const reviewCard = (sid: string, name: string, id: string) => `v|${sid}|${name}|${id}`;
export const REVIEW_CARD = /^v\|[^|]+\|[a-z0-9][a-z0-9-]{0,39}\|[A-Za-z0-9.,+#=-]{1,400}$/;

/** The owner's word on an item: accepted, not accepted, and anything he wrote. */
export interface Answer {
  a: 'ok' | 'no' | 'open';
  note?: string;
  /** When, and on which device. */
  t: number;
  device: string;
}

/**
 * An item's answer: the latest `answer` event of its card, on any device. `open` with no note is no
 * answer (one taken back).
 */
export function answerOf(events: readonly DeviceEvent[]): Answer | undefined {
  let last: Answer | undefined;
  for (const e of events) {
    if (e.event?.k !== 'answer') continue;
    last = { a: e.event.a, ...(e.event.note ? { note: e.event.note } : {}), t: e.t, device: e.device };
  }
  return last && (last.a !== 'open' || last.note) ? last : undefined;
}

/**
 * Whether the chapter has moved on from what an item says, so the item no longer describes it:
 * the move it is at is gone; my move there (or the main reply) is another now; a removed part's
 * first move is back. `chapter` undefined (the chapter is gone, or not read): gone too.
 */
export function movedOn(item: ReviewItem, chapter: Chapter | undefined): boolean {
  const node = chapter && nodeAt(chapter, item.at);
  if (!node) return true;
  if (item.kind === 'removed') return item.san !== undefined && node.children.some((c) => c.san === item.san);
  if (item.kind === 'move' || item.kind === 'reply') {
    if (!item.at.length) return false;
    const parent = nodeAt(chapter, item.at.slice(0, -1));
    return parent?.children[0]?.san !== item.at[item.at.length - 1];
  }
  return false;
}

export type ItemState = 'open' | 'ok' | 'no' | 'noted' | 'moved';

/** Where an item stands: answered (the answer wins), else moved on from, else open. */
export function itemState(item: ReviewItem, answer: Answer | undefined, chapter: Chapter | undefined): ItemState {
  if (answer) return answer.a === 'open' ? 'noted' : answer.a;
  return movedOn(item, chapter) ? 'moved' : 'open';
}
