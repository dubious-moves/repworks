// A review list (PLAN.md §5.216): the file read strictly and written in one stable form, an
// item's answer from the log (the latest on any device, one taken back being none), the chapter
// moved on from an item, an item's state, and the list's place in the data repo and its log.
//
// Controls run on this file (2026-11-27):
// - `answerOf` taking the first answer → "the latest answer decides";
// - `movedOn` not comparing the first move at the position → "my move is another now";
// - `movedOn` ignoring a removed move that is back → "a removed part's first move is back";
// - an answer not winning over the chapter's state → "an answer wins over the chapter's change".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, reviewDir, reviewListPath } from '../../../../src/core/data/layout.ts';
import { validateDataRepo } from '../../../../src/core/data/validate.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { formatEvent, parseLog } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents } from '../../../../src/core/progress/replay.ts';
import { answerOf, itemId, itemState, movedOn, parseReviewList, reviewCard, REVIEW_CARD, writeReviewList, type ReviewItem, type ReviewList } from '../../../../src/core/study/reviewList.ts';

function chapter(movetext: string) {
  const parsed = parseChapterFile(`[Event "Test"]\n[ChapterName "Jobava"]\n[Orientation "white"]\n\n${movetext} *\n`, 'Ch1Jobav');
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

const MOVE: ReviewItem = { id: itemId('Ch1Jobav', 'move', ['Nc3', 'd5', 'd4', 'Bf5', 'f3']), cid: 'Ch1Jobav', kind: 'move', at: ['Nc3', 'd5', 'd4', 'Bf5', 'f3'], lead: '1. Nc3 d5 2. d4 Bf5', part: '3. f3', detail: ['was: 1. Nc3 d5 2. d4 Bf5 3. e3', 'now: 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4'], san: 'f3' };
const ADDED: ReviewItem = { id: itemId('Ch1Jobav', 'added', ['Nc3', 'd5', 'd4', 'Bf5', 'f3', 'e6']), cid: 'Ch1Jobav', kind: 'added', at: ['Nc3', 'd5', 'd4', 'Bf5', 'f3', 'e6'], lead: '1. Nc3 d5 2. d4 Bf5 3. f3', part: 'e6 4. e4', text: 'The system move against an early ...Bf5.' };
const REMOVED: ReviewItem = { id: itemId('Ch1Jobav', 'removed', ['Nc3', 'd5', 'd4', 'g6', 'Bf4', 'a6']), cid: 'Ch1Jobav', kind: 'removed', at: ['Nc3', 'd5', 'd4', 'g6', 'Bf4'], lead: '1. Nc3 d5 2. d4 g6 3. Bf4', part: 'a6 4. e3', san: 'a6' };
const CHECK = ['Nc3', 'd5', 'd4', 'Bf5', 'f3', 'e6', 'e4', 'Bb4', 'exf5', 'Bxc3+'];
const QUESTION: ReviewItem = { id: itemId('Ch1Jobav', 'question', CHECK), cid: 'Ch1Jobav', kind: 'question', at: CHECK, lead: '1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bb4 5. exf5', part: 'Bxc3+', text: 'Drill this, or a line in the comment?' };
const LIST: ReviewList = { v: 1, sid: 'Rep0Najd', name: 'batch-4', title: 'Jobava batch 4', created: '2026-11-27T18:00:00.000Z', from: 'data@4f2a91c', to: 'data@9b0c11d', chapters: { Ch1Jobav: 'Jobava' }, items: [MOVE, ADDED, REMOVED, QUESTION] };

test('a list written and read again is the same, an item a line; made again it is the same text', () => {
  const text = writeReviewList(LIST);
  const read = parseReviewList(text);
  assert.ok(read.ok);
  assert.deepEqual(read.list, LIST);
  assert.equal(writeReviewList(read.list), text);
  assert.equal(text.split('\n').length, LIST.items.length + 3, 'a head line, an item a line, the closing line');
  const empty = parseReviewList(writeReviewList({ ...LIST, items: [] }));
  assert.ok(empty.ok && empty.list.items.length === 0);
});

test('a list the app can\'t read in full is not read in part: each reason', () => {
  const broken = (change: (o: Record<string, unknown>) => void) => {
    const o = JSON.parse(writeReviewList(LIST)) as Record<string, unknown>;
    change(o);
    const r = parseReviewList(JSON.stringify(o));
    return r.ok ? 'read' : r.error;
  };
  const item = (o: Record<string, unknown>) => (o['items'] as Record<string, unknown>[])[0]!;
  assert.equal(parseReviewList('not json').ok, false);
  assert.match(broken((o) => (o['v'] = 2)), /^v must be 1, found 2$/);
  assert.match(broken((o) => (o['name'] = 'Batch 4')), /name must be lower-case/);
  assert.match(broken((o) => delete o['title']), /title must be a non-empty string/);
  assert.match(broken((o) => (item(o)['kind'] = 'todo')), /item 1: kind must be one of/);
  assert.match(broken((o) => (item(o)['at'] = ['Nc3', 'd5 d4'])), /item 1: at must be a list of moves/);
  assert.match(broken((o) => (item(o)['id'] = 'a|b')), /item 1: id must be/);
  assert.match(broken((o) => ((o['items'] as unknown[])[1] = item(o))), /item 2: id .* twice/);
  // What a later version adds is read past.
  assert.equal(broken((o) => ((o['later'] = 1), (item(o)['later'] = 2))), 'read');
});

test('the list\'s place in the data repo, and what validation says of one it can\'t show', () => {
  assert.equal(reviewListPath('Rep0Najd', 'batch-4'), 'review/Rep0Najd/batch-4.json');
  assert.deepEqual(classifyPath('review/Rep0Najd/batch-4.json'), { kind: 'review', sid: 'Rep0Najd', name: 'batch-4' });
  assert.ok('review/Rep0Najd/batch-4.json'.startsWith(reviewDir('Rep0Najd')));
  for (const other of ['review/Rep0Najd/Batch 4.json', 'review/Rep0Najd/batch-4.txt', 'review/short/batch-4.json', 'review/batch-4.json']) assert.deepEqual(classifyPath(other), { kind: 'other' });
  const files = new Map([['repworks.json', '{ "format": 1 }\n'], ['review/Rep0Najd/batch-4.json', writeReviewList(LIST)]]);
  assert.deepEqual(validateDataRepo(files), { errors: [], warnings: [] });
  files.set('review/Rep0Najd/batch-5.json', writeReviewList(LIST));
  files.set('review/Rep0Najd/batch-6.json', '{}');
  assert.deepEqual(validateDataRepo(files).warnings.map((w) => `${w.path}: ${w.message}`), [
    "review/Rep0Najd/batch-5.json: says it is Rep0Najd/batch-4: the app doesn't show it",
    "review/Rep0Najd/batch-6.json: this version can't read it as a review list (v must be 1, found undefined): the app doesn't show it",
  ]);
});

const card = reviewCard(LIST.sid, LIST.name, MOVE.id);
const log = (device: string, lines: string[]) => toDeviceEvents(device, parseLog(lines.join('\n') + '\n').lines);
const answer = (n: number, t: string, a: string, note?: string) => JSON.stringify({ v: 1, n, t, k: 'answer', card, a, ...(note ? { note } : {}) });

test('an answer in the log: its card, written and read back, a bad one left unread', () => {
  assert.equal(card, 'v|Rep0Najd|batch-4|Ch1Jobav.move.Nc3,d5,d4,Bf5,f3');
  assert.match(card, REVIEW_CARD);
  assert.match(reviewCard(LIST.sid, LIST.name, QUESTION.id), REVIEW_CARD, 'a check mark in the item');
  const [line] = parseLog(answer(1, '2026-11-27T19:00:00.000Z', 'no', 'I play e3 here') + '\n').lines;
  assert.deepEqual(line!.event, { v: 1, n: 1, t: '2026-11-27T19:00:00.000Z', k: 'answer', card, a: 'no', note: 'I play e3 here' });
  assert.equal(formatEvent(line!.event!), line!.raw);
  const bad = parseLog([answer(1, '2026-11-27T19:00:00.000Z', 'maybe'), JSON.stringify({ v: 1, n: 2, t: '2026-11-27T19:00:00.000Z', k: 'answer', card: 'm|g1_12', a: 'ok' })].join('\n') + '\n');
  assert.deepEqual(bad.lines, []);
  assert.deepEqual(bad.problems.map((p) => p.reason), ['a must be ok, no or open', 'card must be a review item (v|<sid>|<list>|<item>)']);
});

test('the latest answer decides, on any device; one taken back is none, a note alone is one', () => {
  const phone = log('Phone001', [answer(1, '2026-11-27T19:00:00.000Z', 'ok'), answer(2, '2026-11-27T19:05:00.000Z', 'no', 'I play e3 here')]);
  assert.deepEqual(answerOf(phone), { a: 'no', note: 'I play e3 here', t: Date.parse('2026-11-27T19:05:00.000Z'), device: 'Phone001' });
  assert.equal(answerOf([...phone, ...log('Desktop1', [answer(1, '2026-11-27T19:10:00.000Z', 'open')])]), undefined);
  assert.equal(answerOf([...phone, ...log('Desktop1', [answer(1, '2026-11-27T19:10:00.000Z', 'open', 'ask me again')])])?.a, 'open');
  assert.equal(answerOf([]), undefined);
});

test('the chapter moved on from an item: its move gone, my move another now, a removed part back', () => {
  const now = chapter('1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. f3 e6 4. e4 Bb4 5. exf5 Bxc3+');
  for (const item of [MOVE, ADDED, REMOVED, QUESTION]) assert.equal(movedOn(item, now), false, item.kind);
  // my move is another now: 3. e3 put first again, 3. f3 kept as a side line.
  const swapped = chapter('1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. e3 (3. f3 e6 4. e4)');
  assert.equal(movedOn(MOVE, swapped), true);
  assert.equal(movedOn(ADDED, swapped), false, 'the added line is still there');
  // the move gone.
  const cut = chapter('1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. e3');
  assert.deepEqual([MOVE, ADDED, REMOVED, QUESTION].map((i) => movedOn(i, cut)), [true, true, false, true]);
  // a removed part's first move is back.
  assert.equal(movedOn(REMOVED, chapter('1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4 a6) 3. f3 e6 4. e4')), true);
  // The chapter itself gone (or one the app can't read).
  assert.equal(movedOn(ADDED, undefined), true);
});

test('an item\'s state: open, answered, a note alone; an answer wins over the chapter\'s change', () => {
  const now = chapter('1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4');
  const cut = chapter('1. Nc3 d5 2. d4 Bf5 3. e3');
  const said = (a: 'ok' | 'no' | 'open', note?: string) => ({ a, ...(note ? { note } : {}), t: 0, device: 'Phone001' });
  assert.equal(itemState(ADDED, undefined, now), 'open');
  assert.equal(itemState(ADDED, said('ok'), now), 'ok');
  assert.equal(itemState(ADDED, said('no', 'too sharp'), now), 'no');
  assert.equal(itemState(ADDED, said('open', 'later'), now), 'noted');
  assert.equal(itemState(ADDED, undefined, cut), 'moved');
  assert.equal(itemState(ADDED, said('no'), cut), 'no');
});
