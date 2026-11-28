// A review list (PLAN.md §5.216): the file read strictly and written in one stable form, an
// item's answer from the log (the latest on any device, one taken back being none), the chapter
// moved on from an item, an item's state, and the list's place in the data repo and its log.
//
// Controls run on this file (2026-11-27):
// - `answerOf` taking the first answer → "the latest answer decides";
// - `movedOn` not comparing the first move at the position → "my move is another now";
// - `movedOn` ignoring a removed move that is back → "a removed part's first move is back";
// - an answer not winning over the chapter's state → "an answer wins over the chapter's change".
// Positions (§5.218), controls run 2026-11-28:
// - `byPosition` keyed by the move alone, not the chapter → "items at one move are one position";
// - `positionsOf` placing a position under the last list that has an item of it → "a position whose
//   items are in two lists";
// - `answerTargets` taking every item → "a position's answer goes to its items";
// - `sharedAnswer` taking the first item's answer → "a position's answer goes to its items".
// "Look first" (§5.220), controls run 2026-11-28:
// - `writeReviewList` leaving the mark out → "the mark is written and read back";
// - `positionsOf` not sorting → "marked positions come first in their list";
// - `okAllTargets` taking every waiting item → "OK all open leaves the marked positions waiting".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, reviewDir, reviewListPath } from '../../../../src/core/data/layout.ts';
import { validateDataRepo } from '../../../../src/core/data/validate.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { formatEvent, parseLog } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents } from '../../../../src/core/progress/replay.ts';
import { answerOf, answerTargets, byPosition, okAllTargets, itemId, itemState, movedOn, newestFirst, orderedByPosition, parseReviewList, positionHead, positionKey, positionsOf, positionState, reviewCard, REVIEW_CARD, sharedAnswer, writeReviewList, type Answer, type ItemState, type ReviewItem, type ReviewList } from '../../../../src/core/study/reviewList.ts';

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

// ---- Positions (§5.218) ----

// A reply taken out of the drilled moves and written as a line in the comment of my move before it:
// two items at 3. Bf4. In another chapter the same moves are another position.
const AT_BF4 = ['Nc3', 'd5', 'd4', 'g6', 'Bf4'];
const COMMENT: ReviewItem = { id: itemId('Ch1Jobav', 'comment', AT_BF4), cid: 'Ch1Jobav', kind: 'comment', at: AT_BF4, lead: '1. Nc3 d5 2. d4 g6', part: '3. Bf4', detail: ['added after the old text: (3... a6 4. e3)'] };
const ARROWS: ReviewItem = { id: itemId('Ch1Jobav', 'arrows', AT_BF4), cid: 'Ch1Jobav', kind: 'arrows', at: AT_BF4, lead: '1. Nc3 d5 2. d4 g6', part: '3. Bf4', detail: ['added Ge2e4'] };
const REMOVED_H6: ReviewItem = { id: itemId('Ch1Jobav', 'removed', [...AT_BF4, 'h6']), cid: 'Ch1Jobav', kind: 'removed', at: AT_BF4, lead: '1. Nc3 d5 2. d4 g6 3. Bf4', part: 'h6 4. e3', san: 'h6' };
const ELSEWHERE: ReviewItem = { ...COMMENT, id: itemId('Ch2Other', 'comment', AT_BF4), cid: 'Ch2Other' };

test('items at one move are one position: in the order their first item comes, a position\'s items by kind; another chapter\'s move is another', () => {
  const entries = [REMOVED, ADDED, ARROWS, ELSEWHERE, REMOVED_H6, COMMENT, QUESTION].map((item) => ({ item }));
  const groups = byPosition(entries).map((g) => g.map((e) => `${e.item.cid.slice(2, 3)}.${e.item.kind}${e.item.san ? ` ${e.item.san}` : ''}`));
  assert.deepEqual(groups, [['1.comment', '1.removed a6', '1.removed h6', '1.arrows'], ['1.added'], ['2.comment'], ['1.question']]);
  assert.equal(positionKey(REMOVED), positionKey(COMMENT));
  assert.notEqual(positionKey(COMMENT), positionKey(ELSEWHERE));
  // The list's file with a position's items next to each other: the same items, every one once.
  const ordered = orderedByPosition(entries.map((e) => e.item));
  assert.deepEqual(ordered.map((i) => i.id), [COMMENT, REMOVED, REMOVED_H6, ARROWS, ADDED, ELSEWHERE, QUESTION].map((i) => i.id));
  assert.deepEqual(orderedByPosition(ordered), ordered, 'ordered again it is the same');
});

test('a position\'s head: the move its items share, from an item about the move, else from a removed part\'s lead', () => {
  assert.deepEqual(positionHead([COMMENT, REMOVED]), { lead: '1. Nc3 d5 2. d4 g6', part: '3. Bf4' });
  assert.deepEqual(positionHead([REMOVED, REMOVED_H6]), { lead: '1. Nc3 d5 2. d4 g6', part: '3. Bf4' });
  // Black's move, the first move, and a part removed at the start.
  assert.deepEqual(positionHead([{ ...REMOVED, lead: '1. Nc3 d5 2. d4 g6' }]), { lead: '1. Nc3 d5 2. d4', part: 'g6' });
  assert.deepEqual(positionHead([{ ...REMOVED, lead: '1. Nc3' }]), { lead: '', part: '1. Nc3' });
  assert.deepEqual(positionHead([{ ...REMOVED, lead: '' }]), { lead: '', part: 'the start' });
  assert.deepEqual(positionHead([ADDED]), { lead: ADDED.lead, part: ADDED.part });
});

const said = (a: 'ok' | 'no' | 'open', note?: string): Answer => ({ a, ...(note ? { note } : {}), t: 0, device: 'Phone001' });

test('a position whose items are in two lists is one position, under the first list shown; counted once', () => {
  // A batch split by priority: the removed lines in one list, their comment in another.
  const low: ReviewList = { ...LIST, name: 'batch-4-low', created: '2026-11-27T18:00:00.000Z', items: [REMOVED, REMOVED_H6, QUESTION] };
  const high: ReviewList = { ...LIST, name: 'batch-4-high', created: '2026-11-27T18:00:01.000Z', items: [MOVE, COMMENT] };
  const lists = [low, high].sort(newestFirst);
  assert.deepEqual(lists.map((l) => l.name), ['batch-4-high', 'batch-4-low'], 'the newest first');
  assert.deepEqual([{ ...low, created: high.created }, high].sort(newestFirst).map((l) => l.name), ['batch-4-high', 'batch-4-low'], 'then by name');
  const states = new Map<string, { state: ItemState; answer?: Answer }>([[REMOVED_H6.id, { state: 'ok', answer: said('ok') }]]);
  const shown = positionsOf(lists, (_list, item) => states.get(item.id) ?? { state: 'open' });
  assert.deepEqual(
    shown.map((l) => [l.list.name, l.open, l.positions.map((p) => p.items.map((i) => `${i.list.name.slice(8)}.${i.item.kind}`).join(' + '))]),
    [
      ['batch-4-high', 2, ['high.move', 'high.comment + low.removed + low.removed']],
      ['batch-4-low', 1, ['low.question']],
    ],
  );
  const at = shown[0]!.positions[1]!;
  assert.deepEqual({ key: at.key, cid: at.cid, at: at.at, lead: at.lead, part: at.part, state: at.state, common: at.common, waiting: at.waiting }, { key: 'Ch1Jobav|Nc3,d5,d4,g6,Bf4', cid: 'Ch1Jobav', at: AT_BF4, lead: '1. Nc3 d5 2. d4 g6', part: '3. Bf4', state: 'open', common: undefined, waiting: true });
  // Every item is shown once, whatever the lists' order.
  const other = positionsOf([low, high], () => ({ state: 'ok' }));
  assert.deepEqual(other.map((l) => [l.list.name, l.open, l.positions.map((p) => p.items.length)]), [['batch-4-low', 0, [3, 1]], ['batch-4-high', 0, [1]]]);
  assert.equal(other[0]!.positions[0]!.common, 'ok');
});

test('a position\'s state: waiting while an item is open; for a report the first of No, a note, changed, open, OK', () => {
  assert.equal(positionState(['ok', 'ok']), 'ok');
  assert.equal(positionState(['ok', 'open']), 'open');
  assert.equal(positionState(['open', 'moved']), 'moved');
  assert.equal(positionState(['moved', 'noted', 'ok']), 'noted');
  assert.equal(positionState(['ok', 'no', 'open', 'noted']), 'no');
  const [l] = positionsOf([{ ...LIST, items: [COMMENT, REMOVED] }], (_l, item) => (item === REMOVED ? { state: 'moved' } : { state: 'open' }));
  assert.deepEqual([l!.positions[0]!.state, l!.positions[0]!.waiting, l!.open], ['moved', true, 1], 'an edit of one item leaves the other waiting');
  const [done] = positionsOf([{ ...LIST, items: [COMMENT, REMOVED] }], (_l, item) => (item === REMOVED ? { state: 'moved' } : { state: 'ok', answer: said('ok') }));
  assert.deepEqual([done!.positions[0]!.state, done!.positions[0]!.waiting, done!.open], ['moved', false, 0]);
});

test('a position\'s answer goes to its items, but not to one the chapter moved on from; the buttons show what they share', () => {
  type Entry = { item: ReviewItem; state: ItemState; answer?: Answer };
  const open: Entry = { item: COMMENT, state: 'open' };
  const moved: Entry = { item: REMOVED, state: 'moved' };
  const no = { item: REMOVED_H6, state: 'no' as ItemState, answer: said('no', 'keep it') };
  assert.deepEqual(answerTargets([open, moved, no]), [open, no], 'the edit stays the answer of its item');
  assert.deepEqual(answerTargets([moved]), [moved], 'all moved on: an answer can still be given');
  assert.deepEqual(sharedAnswer([open, no]), { a: 'open' });
  assert.deepEqual(sharedAnswer([no, { answer: said('no', 'keep it') }]), { a: 'no', note: 'keep it' });
  assert.deepEqual(sharedAnswer([{ answer: said('ok', 'fine') }, { answer: said('ok') }]), { a: 'ok' }, 'a note only one has is its own');
  assert.deepEqual(sharedAnswer([{ answer: said('ok') }, { answer: said('ok') }]), { a: 'ok' });
  assert.deepEqual(sharedAnswer([{ answer: said('open', 'later') }, { answer: said('open', 'later') }]), { a: 'open', note: 'later' });
  assert.deepEqual(sharedAnswer([]), { a: 'open' });
});

test('"look first": the mark is written and read back, and a file without it reads as before; anything but true or false is refused', () => {
  const marked: ReviewList = { ...LIST, items: [MOVE, { ...ADDED, first: true }, REMOVED, { ...QUESTION, first: true }] };
  const text = writeReviewList(marked);
  assert.equal((text.match(/"first":true/g) ?? []).length, 2);
  const read = parseReviewList(text);
  assert.ok(read.ok);
  assert.deepEqual(read.list, marked);
  assert.equal(writeReviewList(read.list), text);
  // No mark, no field: a list made before the mark existed is the same text.
  assert.ok(!writeReviewList(LIST).includes('first'));
  const with_ = (value: unknown) => {
    const o = JSON.parse(writeReviewList(LIST)) as { items: Record<string, unknown>[] };
    o.items[0]!['first'] = value;
    return parseReviewList(JSON.stringify(o));
  };
  const off = with_(false);
  assert.ok(off.ok && off.list.items[0]!.first === undefined, 'false is no mark');
  const bad = with_('yes');
  assert.ok(!bad.ok && /item 1: first must be true or false/.test(bad.error));
});

test('"look first": marked positions come first in their list, counted with those still waiting; a position is marked when an item of it is', () => {
  const list: ReviewList = { ...LIST, items: [MOVE, COMMENT, { ...REMOVED, first: true }, ADDED, { ...QUESTION, first: true }] };
  const [shown] = positionsOf([list], (_l, item) => (item.kind === 'question' ? { state: 'ok', answer: said('ok') } : { state: 'open' }));
  assert.deepEqual(shown!.positions.map((p) => [p.part, p.first, p.waiting]), [
    ['3. Bf4', true, true],
    ['Bxc3+', true, false],
    ['3. f3', false, true],
    [ADDED.part, false, true],
  ]);
  assert.deepEqual([shown!.open, shown!.first, shown!.firstOpen], [3, 2, 1]);
  // Unmarked, the file's order stands.
  const [plain] = positionsOf([{ ...LIST, items: [MOVE, COMMENT, REMOVED, ADDED, QUESTION] }], () => ({ state: 'open' }));
  assert.deepEqual(plain!.positions.map((p) => p.part), ['3. f3', '3. Bf4', ADDED.part, 'Bxc3+']);
  assert.deepEqual([plain!.first, plain!.firstOpen], [0, 0]);
});

test('"OK all open" leaves the marked positions waiting, their unmarked items too, and says how many stay', () => {
  const list: ReviewList = { ...LIST, items: [MOVE, COMMENT, { ...REMOVED, first: true }, ADDED, QUESTION] };
  const [shown] = positionsOf([list], (_l, item) => (item === ADDED ? { state: 'no', answer: said('no') } : { state: 'open' }));
  const all = okAllTargets(shown!.positions);
  assert.deepEqual(all.items.map((i) => i.item.kind), ['move', 'question']);
  assert.deepEqual([all.positions, all.kept], [2, 1]);
  const none = okAllTargets(positionsOf([{ ...LIST, items: [{ ...MOVE, first: true }] }], () => ({ state: 'open' }))[0]!.positions);
  assert.deepEqual([none.items.length, none.positions, none.kept], [0, 0, 1]);
});
