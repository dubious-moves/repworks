// Idea cards (PLAN.md §5.128) over a small French Advance deck written for the tests from public
// opening knowledge (test/fixtures/ideas/french-advance.pgn, checked with `cv.ts check --depth 18`:
// 0 errors, 0 warnings): the cards read from the chapters (the overview none), the answers (the
// first move, a `!` beside it, never a `??`), a move judged, a side line as a comment's line, the
// enrolments and the `idea` event, today's queue within the limit, and the session: a new card
// shown first in Read and asked at once in Train (and the switch between them), a move right first time Good, a wrong one Again at once and retried ungraded at the
// end, Show and the owner's grade, a card whose side isn't to move answered only by Show, and
// Train again's pass over every card, the ones not due practice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { readImport } from '../../../../src/core/import/plan.ts';
import { ideaDeck, ideaEnrolments, ideaQueue, judgeIdeaMove, readIdea, sideLineText, type Idea } from '../../../../src/core/ideas/cards.ts';
import { askIdea, gradeIdea, leaveIdea, needsGrade, nextIdea, playIdea, practiseIdeas, setIdeaMode, showIdea, startIdeas } from '../../../../src/core/ideas/session.ts';
import { ideaCard, parseIdeaCard } from '../../../../src/core/progress/cards.ts';
import { formatEvent, parseLog } from '../../../../src/core/progress/events.ts';
import { Replay, toDeviceEvents } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

const SID = 'IdeasFra';
const DECK = readFileSync(new URL('../../../fixtures/ideas/french-advance.pgn', import.meta.url), 'utf8');
const CHAPTERS: Chapter[] = readImport(DECK).chapters.map((c, i) => ({ ...c.chapter, id: `Chapter${i}` }));
const ideas = () => CHAPTERS.map((c) => readIdea(SID, c));

const positionOf = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const moveOf = (fen: string, san: string) => {
  const pos = positionOf(fen);
  return { pos, move: parseSan(pos, san) as NormalMove };
};
const judge = (idea: Idea, san: string) => {
  const { pos, move } = moveOf(idea.fen, san);
  return judgeIdeaMove(idea, pos, move);
};

test('the cards: one per chapter but the overview, its question, side and answers', () => {
  const [overview, chain, queen, trap] = ideas();
  assert.equal(CHAPTERS.length, 4);
  assert.equal(overview, undefined, 'the rules of thumb make no card');
  assert.equal(chain!.card, `i|${SID}|Chapter1`);
  assert.equal(chain!.kind, 'break');
  assert.equal(chain!.side, 'black');
  assert.match(chain!.question, /^White's pawns on d4 and e5/);
  assert.deepEqual(chain!.explanation, ['A pawn chain is weakest at its base: d4 holds e5 up. ...c5 hits it at once.']);
  assert.deepEqual(
    chain!.shapes.map((s) => `${s.brush} ${s.orig}${s.dest ?? ''}`),
    ['yellow d4', 'green c7c5'],
  );
  // An unmarked side line is playable, but not the answer; a `!` beside the first move is one.
  assert.deepEqual(chain!.answers, ['c5']);
  assert.deepEqual(queen!.answers, ['Qb6', 'Bd7']);
  assert.deepEqual(trap!.answers, ['Bd7']);
  assert.ok(ideas().every((i) => !i || !i.selfGraded));
});

test('a move judged: the answer, a side line with its comment, a move the card hasn’t', () => {
  const [, chain, queen, trap] = ideas() as Idea[];
  assert.deepEqual(judge(chain!, 'c5'), { kind: 'right', san: 'c5' });
  assert.deepEqual(judge(queen!, 'Bd7'), { kind: 'right', san: 'Bd7' });
  const b6 = judge(chain!, 'b6');
  assert.equal(b6.kind, 'side');
  assert.deepEqual(judge(chain!, 'Nc6'), { kind: 'none', san: 'Nc6' });
  const grab = judge(trap!, 'Nxd4');
  assert.equal(grab.kind, 'side');
  // The side line as a comment's line (§5.12), from the card's position, glyphs kept, then its comments.
  assert.equal(sideLineText(positionOf(trap!.fen), (grab as { node: Chapter['root']['children'][0] }).node), '(7... Nxd4?? 8. Nxd4 Qxd4? 9. Bb5+) The king moves, and Qxd4 takes the queen.');
  assert.equal(sideLineText(positionOf(chain!.fen), (b6 as { node: Chapter['root']['children'][0] }).node), '(3... b6) Playable, to trade the bad bishop with ...Ba6, but slow: the chain stands.');
});

test('self-graded: the side not to move, or no move, and a first move marked ?? is no answer', () => {
  const parse = (text: string) => {
    const r = parseChapterFile(text, 'ChapterX');
    assert.ok(r.ok);
    return r.chapter;
  };
  const head = (fen: string) => `[Orientation "black"]\n[FEN "${fen}"]\n[SetUp "1"]\n[IdeaKind "tactic"]\n[IdeaQuestion "Q"]\n[IdeaSource "test"]\n\n`;
  const white = 'r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2P5/PP3PPP/RNBQKBNR w KQkq - 1 5';
  assert.equal(readIdea(SID, parse(`${head(white)}{ White's threat. [%cal Gg1f3] } 5. Nf3 *`))!.selfGraded, true);
  assert.equal(readIdea(SID, parse(`${head(CHAPTERS[1]!.headers.find(([k]) => k === 'FEN')![1])}{ Nothing to play. } *`))!.selfGraded, true);
  const fails = readIdea(SID, parse(`${head(CHAPTERS[3]!.headers.find(([k]) => k === 'FEN')![1])}{ Where it fails. } 7... Nxd4?? 8. Nxd4 *`))!;
  assert.deepEqual(fails.answers, []);
  assert.equal(fails.selfGraded, true);
});

test('the enrolments, the `idea` event, and today’s queue within the limit of new cards', () => {
  const ev = (n: number, t: string, card: string, on: boolean) => formatEvent({ v: 1, n, t, k: 'idea', card, on });
  const text = [ev(1, '2026-10-20T08:00:00.000Z', ideaCard(SID, 'Chapter1'), true), ev(2, '2026-10-20T08:00:00.000Z', ideaCard(SID, 'Chapter2'), true), ev(3, '2026-10-20T08:00:00.000Z', ideaCard(SID, 'Chapter3'), true), ev(4, '2026-10-20T09:00:00.000Z', ideaCard(SID, 'Chapter3'), false), ev(5, '2026-10-20T08:00:00.000Z', ideaCard(SID, 'Chapter0'), true)].join('\n');
  assert.equal(JSON.parse(text.split('\n')[0]!).on, true);
  const { lines, problems } = parseLog(`${text}\n{"v":1,"n":9,"t":"2026-10-20T08:00:00.000Z","k":"idea","card":"p|x","on":true}`);
  assert.equal(problems.length, 1, 'an idea event names an idea card');
  const replay = new Replay();
  replay.add(toDeviceEvents('Desktop1', lines));
  const enrolled = ideaEnrolments(replay.states.keys(), (c) => replay.eventsOf(c));
  assert.deepEqual([...enrolled].sort(), [ideaCard(SID, 'Chapter0'), ideaCard(SID, 'Chapter1'), ideaCard(SID, 'Chapter2')]);
  assert.deepEqual(parseIdeaCard(ideaCard(SID, 'Chapter2')), { sid: SID, cid: 'Chapter2' });
  // The overview enrolled makes no card; a removed card is left out.
  const deck = ideaDeck(enrolled, [{ sid: SID, chapters: CHAPTERS }]);
  assert.deepEqual(deck.map((i) => i.cid), ['Chapter1', 'Chapter2']);

  const day = { start: Date.parse('2026-10-20T00:00:00Z'), end: Date.parse('2026-10-21T00:00:00Z') };
  assert.deepEqual(ideaQueue(deck, replay.states, day, 1).fresh.map((i) => i.cid), ['Chapter1'], 'new cards in the deck’s order');
  // A review today: the card is started today and counts against the limit; Again is due tomorrow.
  replay.add(toDeviceEvents('Desktop1', parseLog('{"v":1,"n":6,"t":"2026-10-20T10:00:00.000Z","k":"review","card":"i|IdeasFra|Chapter1","g":1}').lines));
  const q = ideaQueue(deck, replay.states, day, 1);
  assert.equal(q.startedToday, 1);
  assert.deepEqual([q.due.length, q.fresh.length, q.waiting], [0, 0, 1]);
  const tomorrow = { start: day.end, end: day.end + 86_400_000 };
  assert.deepEqual(ideaQueue(deck, replay.states, tomorrow, 1).due.map((i) => i.cid), ['Chapter1']);
});

test('the session: shown first when new, graded by a move, retried ungraded at the end', () => {
  const [, chain, queen] = ideas() as Idea[];
  let s = startIdeas({ due: [queen!], fresh: [chain!] }, 0);
  assert.deepEqual(
    s.steps.map((x) => [x.idea.cid, x.isNew]),
    [
      ['Chapter2', false],
      ['Chapter1', true],
    ],
  );
  assert.equal(s.run!.phase, 'asking', 'a due card is asked at once');
  // A wrong move: Again, recorded at once with the move tried, and asked again.
  const wrong = playIdea(s, judge(queen!, 'Nge7'), 'g8e7', 4000);
  assert.deepEqual(wrong.review, { card: queen!.card, g: 1, ms: 4000, w: ['g8e7'] });
  s = wrong.session;
  assert.equal(s.run!.phase, 'asking');
  const right = playIdea(s, judge(queen!, 'Qb6'), 'd8b6', 6000);
  assert.equal(right.review, undefined, 'graded once');
  s = right.session;
  assert.equal(s.run!.phase, 'back');
  assert.equal(needsGrade(s.run), false);
  s = nextIdea(s, 7000);
  // The new card: shown, then asked; right the first time is Good.
  assert.equal(s.run!.phase, 'learn');
  assert.equal(playIdea(s, judge(chain!, 'c5'), 'c7c5', 7500).review, undefined, 'not asked yet');
  s = askIdea(s, 8000);
  const good = playIdea(s, judge(chain!, 'c5'), 'c7c5', 9000);
  assert.deepEqual(good.review, { card: chain!.card, g: 3, ms: 1000 });
  s = nextIdea(good.session, 9500);
  // The card missed comes back, ungraded, until a move answers it.
  assert.deepEqual([s.index, s.run!.step.idea.cid, s.run!.step.retry, s.run!.phase], [2, 'Chapter2', true, 'asking']);
  const again = playIdea(s, judge(queen!, 'a6'), 'a7a6', 10_000);
  assert.equal(again.review, undefined);
  s = nextIdea(playIdea(again.session, judge(queen!, 'Bd7'), 'c8d7', 11_000).session, 11_500);
  assert.equal(s.run!.step.idea.cid, 'Chapter2', 'missed again: once more');
  s = nextIdea(playIdea(s, judge(queen!, 'Qb6'), 'd8b6', 12_000).session, 12_500);
  assert.equal(s.run, undefined);
  assert.deepEqual([...s.results], [
    [queen!.card, 1],
    [chain!.card, 3],
  ]);
});

test('Show and the owner’s grade; a self-graded card takes no move; a card removed goes with its retries', () => {
  const [, chain, queen] = ideas() as Idea[];
  let s = startIdeas({ due: [chain!, queen!], fresh: [] }, 0);
  s = showIdea(s);
  assert.ok(needsGrade(s.run));
  assert.deepEqual(nextIdea(s, 1).index, 0, 'no next card before the grade');
  const graded = gradeIdea(s, 2, 3000);
  assert.deepEqual(graded.review, { card: chain!.card, g: 2, ms: 3000 });
  s = graded.session;
  assert.equal(s.run!.step.idea.cid, 'Chapter2');
  // Again by a move, then the card removed: its retry goes too.
  s = playIdea(s, judge(queen!, 'a6'), 'a7a6', 4000).session;
  s = leaveIdea(s, 5000, true);
  assert.deepEqual([s.steps.length, s.run], [2, undefined]);

  const selfGraded: Idea = { ...chain!, selfGraded: true };
  s = startIdeas({ due: [selfGraded], fresh: [] }, 0);
  assert.equal(playIdea(s, judge(chain!, 'c5'), 'c7c5', 1000).session, s, 'no move is taken');
  s = gradeIdea(showIdea(s), 1, 2000).session;
  // Self-graded Again: shown once more at the end, ungraded.
  assert.deepEqual([s.run!.step.retry, needsGrade(s.run)], [true, false]);
  s = nextIdea(showIdea(s), 3000);
  assert.equal(s.run, undefined);
});

test('Train asks a new card at once; switching changes the card in front only while nothing is answered', () => {
  const [, chain, queen] = ideas() as Idea[];
  let s = startIdeas({ due: [], fresh: [chain!, queen!] }, 0, 'train');
  assert.equal(s.run!.phase, 'asking', 'new, asked at once');
  assert.deepEqual(playIdea(s, judge(chain!, 'c5'), 'c7c5', 2000).review, { card: chain!.card, g: 3, ms: 2000 });
  // To Read: the untouched new card is shown first; to Train again: asked, timed from then.
  s = setIdeaMode(s, 'read', 3000);
  assert.deepEqual([s.mode, s.run!.phase], ['read', 'learn']);
  s = setIdeaMode(s, 'train', 4000);
  assert.deepEqual([s.run!.phase, s.run!.askedAt], ['asking', 4000]);
  // A move tried: the card stays asked; the next new card follows the mode.
  s = playIdea(s, judge(chain!, 'b6'), 'b7b6', 5000).session;
  s = setIdeaMode(s, 'read', 6000);
  assert.equal(s.run!.phase, 'asking');
  s = nextIdea(showIdea(s), 7000);
  assert.deepEqual([s.run!.step.idea.cid, s.run!.phase], ['Chapter2', 'learn']);
  s = setIdeaMode(s, 'train', 8000);
  assert.equal(s.run!.phase, 'asking');
  s = gradeIdea(showIdea(s), 3, 9000).session;
  // The retry of the card missed: asked in either mode.
  assert.deepEqual([s.run!.step.retry, s.run!.phase], [true, 'asking']);
  assert.equal(setIdeaMode(s, 'read', 9500).run!.phase, 'asking');
});

test('Train again: every card in the deck’s order, due or not; the ones not due graded but not recorded', () => {
  const [, chain, queen, trap] = ideas() as Idea[];
  const reviewed = new Set([chain!.card, queen!.card]);
  let s = practiseIdeas([chain!, queen!, trap!], { due: [queen!], fresh: [] }, (c) => reviewed.has(c), 0, 'read');
  assert.deepEqual(
    s.steps.map((x) => [x.idea.cid, x.isNew, !!x.practice]),
    [
      ['Chapter1', false, true],
      ['Chapter2', false, false],
      ['Chapter3', true, true],
    ],
  );
  // Not due: Again by a move, nothing recorded, and still asked again at the end, as practice.
  const wrong = playIdea(s, judge(chain!, 'b6'), 'b7b6', 1000);
  assert.equal(wrong.review, undefined);
  s = nextIdea(playIdea(wrong.session, judge(chain!, 'c5'), 'c7c5', 2000).session, 2500);
  assert.deepEqual(s.steps.at(-1)!.practice, true);
  // Due: recorded as ever.
  assert.deepEqual(playIdea(s, judge(queen!, 'Qb6'), 'd8b6', 3000).review, { card: queen!.card, g: 3, ms: 500 });
  assert.deepEqual(s.results.get(chain!.card), 1);
  assert.equal(practiseIdeas([], { due: [], fresh: [] }, () => false, 0).run, undefined);
});
