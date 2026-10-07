// Plan cards (PLAN.md §5.61): the enrolments (the latest `plan` event of each card), the content
// read from every chapter's comments at the position (two chapters, a transposition, a chapter's
// start, shapes kept once), and the deck: a card with no content left out and counted.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the chapter's start not read → "the notes: every node reaching the position" (the Notes study's chapter);
// - a card without content kept → "the deck".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { parseLog } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { planDeck, planEnrolments, planNotes } from '../../../../src/core/games/plans.ts';
import type { PositionKey } from '../../../../src/core/chess/positionKey.ts';

const chapter = (id: string, text: string) => {
  const r = parseChapterFile(text, id);
  assert.ok(r.ok);
  return r.chapter;
};
// After 1.e4 c5 2.Nf3 d6 (Black's plan), reached by 2.Nf3 d6 and by 1.Nf3 c5 2.e4 d6.
const KEY = 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -' as PositionKey;
const A = chapter('ChapterA', '[Orientation "black"]\n\n1. e4 c5 2. Nf3 d6 { Play ...Nf6 and ...g6: the Dragon. } { [%cal Gg7g6] } 3. d4 *');
const B = chapter('ChapterB', '[Orientation "black"]\n\n1. Nf3 c5 2. e4 d6 { Same plan by transposition. } { [%cal Gg7g6] } *');
const C = chapter('ChapterC', '[Orientation "black"]\n\n1. e4 c5 2. Nf3 d6 3. d4 *');
const NOTES = chapter('ChapterN', `[FEN "${KEY} 0 3"]\n[SetUp "1"]\n\n{ A note kept in the Notes study. } *`);
const OTHER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -' as PositionKey;

test('the notes: every node reaching the position, a chapter’s start included, each shape once', () => {
  const notes = planNotes(
    [
      { sid: 'StudyAAA', cid: 'ChapterA', chapter: A },
      { sid: 'StudyAAA', cid: 'ChapterB', chapter: B },
      { sid: 'StudyAAA', cid: 'ChapterC', chapter: C },
      { sid: 'NotesAAA', cid: 'ChapterN', chapter: NOTES },
    ],
    new Set([KEY, OTHER]),
  );
  const n = notes.get(KEY)!;
  assert.deepEqual(n.comments, ['Play ...Nf6 and ...g6: the Dragon.', 'Same plan by transposition.', 'A note kept in the Notes study.']);
  assert.equal(n.shapes.length, 1);
  assert.deepEqual(
    n.places.map((p) => `${p.cid} ${p.path.join(' ')}`),
    ['ChapterA e4 c5 Nf3 d6', 'ChapterB Nf3 c5 e4 d6', 'ChapterC e4 c5 Nf3 d6', 'ChapterN '],
  );
  assert.equal(n.fen, `${KEY} 0 3`);
  assert.deepEqual(notes.get(OTHER)!.comments, []);
});

let k = 0;
const ev = (e: Record<string, unknown>, t: string): DeviceEvent => {
  const { lines, problems } = parseLog(JSON.stringify({ v: 1, n: ++k, t, ...e }));
  assert.deepEqual(problems, []);
  return toDeviceEvents('d', lines)[0]!;
};

test('the enrolments, and the deck: a position without content left out and counted', () => {
  const events = new Map<string, DeviceEvent[]>([
    [`p|${KEY}`, [ev({ k: 'plan', card: `p|${KEY}`, on: true, side: 'black' }, '2026-10-07T10:00:00.000Z')]],
    [`p|${OTHER}`, [ev({ k: 'plan', card: `p|${OTHER}`, on: true, side: 'white' }, '2026-10-07T10:00:00.000Z')]],
    ['p|gone', [ev({ k: 'plan', card: 'p|gone', on: true, side: 'white' }, '2026-10-07T10:00:00.000Z'), ev({ k: 'plan', card: 'p|gone', on: false, side: 'white' }, '2026-10-07T11:00:00.000Z')]],
  ]);
  const enrolled = planEnrolments(events.keys(), (c) => events.get(c) ?? []);
  assert.deepEqual([...enrolled], [
    [KEY, 'black'],
    [OTHER, 'white'],
  ]);
  const notes = planNotes([{ sid: 'StudyAAA', cid: 'ChapterA', chapter: A }], new Set(enrolled.keys()));
  const deck = planDeck(enrolled, notes);
  assert.deepEqual(
    deck.cards.map((c) => c.card),
    [`p|${KEY}`],
  );
  assert.equal(deck.needContent, 1);
  assert.equal(deck.cards[0]!.item.color, 'black');
  assert.equal(deck.cards[0]!.item.ply, 5);
});
