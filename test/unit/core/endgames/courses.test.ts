// Endgames from the user's courses (PLAN.md §5.175): the chapters of a reference study that start
// from a position, their groups, the goal from Stockfish's score (a stub here), the weaker side's
// chapter played from the course's first move, the drills joined with their scores, and the
// course's own text along its main line. The study is a small synthetic one in the shape of a
// course export (a [FEN] set-up, one main line, prose in the comments), not a course's content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSquare } from 'chessops/util';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { positionOf } from '../../../../src/core/storm/walk.ts';
import { positionKey, positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { asCourseEndgame, authorReplies, candidatesOf, courseGoal, courseId, courseState, courseText, groupsOf, isCourseId, nameParts, readCourseScore, scoreCandidate, type Candidate, type CourseChapter, type CourseScore } from '../../../../src/core/endgames/courses.ts';
import { attemptsByEndgame, taskOf, wonAfter } from '../../../../src/core/endgames/endgames.ts';
import { REP } from '../../../../src/core/endgames/repertoire.ts';
import { courseFromLog } from '../../../../src/core/endgames/courses.ts';
import { courseCard } from '../../../../src/core/progress/cards.ts';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { Replay, toDeviceEvents } from '../../../../src/core/progress/replay.ts';

const at = (fen: string) => positionOf(fen)!;
const sq = (name: string) => parseSquare(name)!;
const QR = '8/8/8/4k3/8/8/8/R2QK3 w - - 0 1';
const KP_WIN = '5k2/8/8/8/3KP3/8/8/8 w - - 0 1';
const KP_DRAW = '4k3/8/8/4K3/4P3/8/8/8 b - - 0 1';
const KP_WORSE = '8/8/8/4k3/8/3K4/4P3/8 b - - 0 1';
const DEAD = '8/pp6/8/8/8/8/PP6/K6k w - - 0 1';

let n = 0;
function chapter(name: string, fen: string | undefined, movetext: string, kind: 'reference' | 'repertoire' = 'reference', study = 'Silman’s Complete Endgame Course'): CourseChapter {
  const headers = `[Event "Course"]\n[ChapterName "${name}"]\n${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}\n`;
  const parsed = parseChapterFile(`${headers}${movetext} *\n`, `Chap${String(++n).padStart(4, '0')}`);
  assert.ok(parsed.ok);
  return { sid: 'Course001', study, kind, cid: parsed.chapter.id, name, chapter: parsed.chapter };
}

const CH = {
  mate: chapter('Part 1: Endgames for Beginners (Unrated-999): The Staircase - 1', QR, '{ Mate with the heavy pieces. } 1. Ra8+ { (Or 1.Qd5+ Kf4) } Kf6 2. Qd6+ Kf7 3. Qe7#'),
  win: chapter('Part 3: Endgames for Class D (1000-1199): King and Pawn - 2', KP_WIN, '{ Method. } { Method. } 1. Kd5 { Take the key square. } { Take the key square. } Ke8 { (Not 1...Kg7 2.e5 Kf7 3.e6+ Kf8) since the pawn runs. } 2. Ke6 Kd8 3. e5'),
  draw: chapter('Part 3: Endgames for Class D (1000-1199): Hold the Opposition - 3', KP_DRAW, '4... Ke7 5. Kd5 Kd7'),
  worse: chapter('Part 3: Endgames for Class D (1000-1199): Why it Loses - 4', KP_WORSE, '1... Kf5 { Black steps aside; the king and pawn wins. } 2. Kd4'),
  test1: chapter('Part 3: Endgames for Class D (1000-1199): Test 1', KP_WIN, ''),
  dead: chapter('Part 4: Endgames for Class C (1400-1599): Locked - 1', DEAD, '1. Kb1 { A text. } *'.replace(' *', '')),
  textOnly: chapter('Part 4: Endgames for Class C (1400-1599): Just Words - 2', undefined, '{ Nothing to play: only words. }'),
  again: chapter('Part 4: Endgames for Class C (1400-1599): The Staircase again - 3', QR, '1. Ra8+'),
  mine: chapter('Najdorf: Main line', KP_WIN, '1. Kd5', 'repertoire', 'My repertoire'),
};
const ALL = Object.values(CH);

test('a chapter name is cut into its group and title', () => {
  assert.deepEqual(nameParts('Part 1: Endgames for Beginners (Unrated-999): The Staircase - 3', 'X'), { group: 'Part 1: Endgames for Beginners (Unrated-999)', title: 'The Staircase - 3' });
  assert.deepEqual(nameParts('Part 9: Pure Pleasure: Hard: Tactics 4', 'X'), { group: 'Part 9: Pure Pleasure', title: 'Hard: Tactics 4' });
  assert.deepEqual(nameParts('Lucena: the bridge', 'X'), { group: 'Lucena', title: 'the bridge' });
  assert.deepEqual(nameParts('A loose chapter', 'The Study'), { group: 'The Study', title: 'A loose chapter' });
  assert.deepEqual(nameParts('', 'The Study'), { group: 'The Study', title: 'The Study' });
});

test('the candidates: reference chapters that start from a position, the first of each position', () => {
  const c = candidatesOf(ALL);
  assert.deepEqual(
    c.map((x) => x.title),
    ['The Staircase - 1', 'King and Pawn - 2', 'Hold the Opposition - 3', 'Why it Loses - 4', 'Locked - 1'],
    'the Test chapter repeats King and Pawn’s position and is left out; a text-only chapter, a repertoire chapter and a repeated position are not candidates',
  );
  const win = c.find((x) => x.title === 'King and Pawn - 2')!;
  assert.equal(win.id, courseId(positionKey(KP_WIN)));
  assert.ok(isCourseId(win.id) && !isCourseId('r-0123abcd') && !isCourseId('queen-mate'));
  assert.equal(win.group, 'Part 3: Endgames for Class D (1000-1199)');
  assert.equal(win.first, 'Kd5');
  // A chapter with no moves has no first move.
  assert.equal(candidatesOf([chapter('Part 2: Class E: Test 2', DEAD.replace('K6k', '1K5k'), '')])[0]!.first, undefined);
});

test('the goal from the score: the repertoire endgames’ bands, a win already ahead on material played to mate', () => {
  assert.deepEqual(courseGoal(500, 1), { goal: 'win', until: 'convert' });
  assert.deepEqual(courseGoal(2000, 14), { goal: 'win', until: 'mate' });
  assert.deepEqual(courseGoal(0, 0), { goal: 'draw' });
  assert.deepEqual(courseGoal(-100, 0), { goal: 'draw' });
  assert.equal(courseGoal(-101, 0), 'you are worse');
  // Against a bare king the win is a pawn queened (pawns alone) or mate (a piece): at the start the bare king is there already.
  assert.deepEqual(courseGoal(620, 1, at(KP_WIN), 'white'), { goal: 'win', until: 'promote' });
  assert.deepEqual(courseGoal(620, 1, at('5k2/8/8/8/3KP3/8/8/R7 w - - 0 1'), 'white'), { goal: 'win', until: 'mate' });
  assert.deepEqual(courseGoal(500, 1, at('5k2/p7/8/8/3KP3/8/8/8 w - - 0 1'), 'white'), { goal: 'win', until: 'convert' });
  assert.deepEqual(courseGoal(-20, 0, at(KP_DRAW), 'black'), { goal: 'draw' });
  assert.equal(courseGoal(220, 0), 'better, but not clearly winning');
});

/** Stockfish's scores for the side to move, by the first four fields of the FEN. */
function scorer(table: Record<string, number>, asked: string[] = []) {
  return async (fen: string) => {
    asked.push(fen);
    const cp = table[fen.split(' ').slice(0, 2).join(' ')];
    return cp === undefined ? undefined : { cp, depth: 14 };
  };
}
const cand = (c: CourseChapter): Candidate => candidatesOf([c])[0]!;
/** The plain chapters' starts and the positions after their first move (the other side's score is the mirror: no swing). */
const PLAIN: Record<string, number> = {
  '5k2/8/8/8/3KP3/8/8/8 w': 620,
  '5k2/8/8/3K4/4P3/8/8/8 b': -620,
  '8/8/8/4k3/8/8/8/R2QK3 w': 4000,
  'R7/8/8/4k3/8/8/8/3QK3 b': -4000,
  '4k3/8/8/4K3/4P3/8/8/8 b': -20,
  '8/4k3/8/4K3/4P3/8/8/8 w': 20,
  '8/pp6/8/8/8/8/PP6/K6k w': 210,
  '8/pp6/8/8/8/8/PP6/1K5k b': -210,
};

test('scoring: a win, a win on material to mate, a draw, no goal, and no answer', async () => {
  const s = scorer(PLAIN);
  const win = (await scoreCandidate(cand(CH.win), at(KP_WIN), s, 7))!;
  assert.deepEqual(win.drill, { fen: KP_WIN, side: 'white', goal: 'win', until: 'promote', cp: 620 });
  assert.equal(win.depth, 14);
  assert.equal(win.at, 7);
  assert.deepEqual((await scoreCandidate(cand(CH.mate), at(QR), s, 7))!.drill, { fen: QR, side: 'white', goal: 'win', until: 'mate', cp: 4000 });
  assert.deepEqual((await scoreCandidate(cand(CH.draw), at(KP_DRAW), s, 7))!.drill, { fen: KP_DRAW, side: 'black', goal: 'draw', cp: -20 });
  const dead = (await scoreCandidate(cand(CH.dead), at(DEAD), s, 7))!;
  assert.equal(dead.drill, undefined);
  assert.equal(dead.why, 'better, but not clearly winning');
  // Stockfish gave no answer: nothing to keep.
  assert.equal(await scoreCandidate(cand(CH.worse), at(KP_WORSE), scorer({}), 7), undefined);
});

test('a line that ends on the other side’s move: the course’s first move is played for the opponent and the side that ends it is the user’s', async () => {
  const asked: string[] = [];
  // Black to move is lost at −640; after 1...Kf5 White, to move, is +640.
  const s = scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640, '8/8/8/5k2/8/3K4/4P3/8 w': 640 }, asked);
  const sc = (await scoreCandidate(cand(CH.worse), at(KP_WORSE), s, 1))!;
  assert.deepEqual(sc.drill, { fen: '8/8/8/5k2/8/3K4/4P3/8 w - - 1 2', side: 'white', goal: 'win', until: 'promote', cp: 640, flipped: 'Kf5', by: 'last' });
  assert.equal(sc.cp, -640, 'the chapter start’s own score is kept');
  assert.equal(asked.length, 2, 'the start, then the position after the first move');
  // After the move, still no goal for the other side (a dead position): left out, with the reason.
  const none = (await scoreCandidate(cand(CH.worse), at(KP_WORSE), scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640, '8/8/8/5k2/8/3K4/4P3/8 w': 240 }), 1))!;
  assert.equal(none.drill, undefined);
  assert.match(none.why!, /the course ends on White’s move, so it teaches White, and still no goal after the course’s Kf5/);
  // No first move in the chapter: nothing to flip, the side to move is the user's (and has no goal here).
  const moveless = candidatesOf([chapter('Part 3: Class D: Bare - 9', KP_WORSE, '')])[0]!;
  const bare = (await scoreCandidate(moveless, at(KP_WORSE), scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640 }), 1))!;
  assert.equal(bare.drill, undefined);
  assert.equal(bare.why, 'you are worse');
  // Stockfish silent on the second search: asked again later.
  assert.equal(await scoreCandidate(cand(CH.worse), at(KP_WORSE), scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640 }), 1), undefined);
});

test('a first move the author marks as a mistake is the opponent’s: the user punishes it from the other side (the score is no part of it)', async () => {
  // White, to move, holds a draw; 1.Kf7?? is the blunder the chapter is about. The user is Black.
  const START = '7k/8/5K2/8/8/8/7P/8 w - - 0 1';
  const AFTER = '7k/5K2/8/8/8/8/7P/8 b - - 1 1';
  const blunder = chapter('Part 3: Endgames for Class D (1200-1399): The Deep - 5', START, '{ Though Black has a passed pawn the game is drawn. However, disaster struck: } 1. Kf7?? { Suddenly the win is Black’s. } Kh7 2. Kf6');
  const plain = chapter('Part 3: Endgames for Class D (1200-1399): The Deep - 6', START.replace('7P', '6P1'), '1. Kf7 Kh7 2. Kf6');
  const marked = cand(blunder);
  assert.equal(marked.first, 'Kf7');
  assert.equal(marked.mark, '??');
  assert.equal(candidatesOf([chapter('Part 3: Class D: Mark - 7', START, '1. Kf7? Kh7')])[0]!.mark, '?');
  assert.equal(cand(plain).mark, undefined);

  const start = { '7k/8/5K2/8/8/8/7P/8 w': 0 };
  // Marked, and Stockfish agrees (+800 for Black after it): the drill is Black's, from the position after it.
  const sc = (await scoreCandidate(marked, at(START), scorer({ ...start, '7k/5K2/8/8/8/8/7P/8 b': 800 }), 1))!;
  assert.deepEqual(sc.drill, { fen: AFTER, side: 'black', goal: 'win', until: 'convert', cp: 800, flipped: 'Kf7??', by: 'marked' });
  assert.equal(sc.cp, 0, 'the chapter start’s own score is kept');
  assert.equal(readCourseScore(JSON.parse(JSON.stringify(sc)))!.drill!.by, 'marked');
  // The author's mark decides, not the score: the move that costs nothing by Stockfish is still the opponent's.
  const kept = (await scoreCandidate(marked, at(START), scorer({ ...start, '7k/5K2/8/8/8/8/7P/8 b': 0 }), 1))!;
  assert.deepEqual([kept.drill!.side, kept.drill!.goal, kept.drill!.by], ['black', 'draw', 'marked']);
  // Not marked, and Stockfish scores the move as a blunder (8 points swing), but the line ends on White's move: Stockfish
  // is no part of it, the side to move is the side taught.
  const fen6 = plain.chapter.headers.find(([k]) => k === 'FEN')![1];
  const asked: string[] = [];
  const fine = (await scoreCandidate(cand(plain), at(fen6), scorer({ '7k/8/5K2/8/8/8/6P1/8 w': 0, '7k/5K2/8/8/8/8/6P1/8 b': 800 }, asked), 1))!;
  assert.deepEqual(fine.drill, { fen: '7k/8/5K2/8/8/8/6P1/8 w - - 0 1', side: 'white', goal: 'draw', cp: 0 });
  assert.equal(asked.length, 1, 'no second search when nothing is flipped');
  // Marked, but the position after it has no goal for the other side: left out, with the reason: never the wrong side.
  const none = (await scoreCandidate(marked, at(START), scorer({ ...start, '7k/5K2/8/8/8/8/7P/8 b': 220 }), 1))!;
  assert.equal(none.drill, undefined);
  assert.match(none.why!, /the course’s first move is a mistake, and still no goal after the course’s Kf7\?\?/);
  // The first move is the first thing asked after the start: Stockfish silent on it, asked again later.
  assert.equal(await scoreCandidate(marked, at(START), scorer(start), 1), undefined);
});

test('who ends the line: the side the author teaches, unless the first move is marked', async () => {
  // Bishop and wrong rook-pawn: White starts, Black ends (1.Bf5 Kg8 2.h7+ Kh8): Black holds the draw, so the user is Black,
  // from the position after 1.Bf5, whatever Stockfish thinks of the side to move.
  const WRONG = '7k/8/6KP/8/4B3/8/8/8 w - - 0 1';
  const wrong = cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 3', WRONG, '1. Bf5 Kg8 2. h7+ Kh8'));
  assert.equal(wrong.last, 'black');
  const dl = (await scoreCandidate(wrong, at(WRONG), scorer({ '7k/8/6KP/8/4B3/8/8/8 w': 90, '7k/8/6KP/5B2/8/8/8/8 b': -90 }), 1))!;
  assert.deepEqual(dl.drill, { fen: '7k/8/6KP/5B2/8/8/8/8 b - - 1 1', side: 'black', goal: 'draw', cp: -90, flipped: 'Bf5', by: 'last' });
  // The same chapter ending on White's move: White's, from the start.
  const white = cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 4', WRONG, '1. Bf5 Kg8 2. h7+'));
  assert.equal(white.last, 'white');
  assert.deepEqual((await scoreCandidate(white, at(WRONG), scorer({ '7k/8/6KP/8/4B3/8/8/8 w': 0 }), 1))!.drill, { fen: WRONG, side: 'white', goal: 'draw', cp: 0 });
  // The author calls the first move good: the teacher's, whoever ends the line (a stalemate, a draw agreed).
  const praised = cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 5', WRONG, '1. Bf5! Kg8'));
  assert.equal(praised.praised, true);
  assert.equal(praised.last, 'black');
  assert.equal((await scoreCandidate(praised, at(WRONG), scorer({ '7k/8/6KP/8/4B3/8/8/8 w': 0 }), 1))!.drill!.side, 'white');
  // `!!` too, and `?!` / `!?` say nothing.
  assert.equal(cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 6', WRONG, '1. Bf5!! Kg8')).praised, true);
  assert.equal(cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 7', WRONG, '1. Bf5?! Kg8')).praised, undefined);
  // Marked a mistake, the first move is the opponent's even when its side ends the line.
  const blunder = cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 8', WRONG, '1. Bf5?? Kg8 2. h7+'));
  assert.deepEqual([blunder.mark, blunder.praised, blunder.last], ['??', undefined, 'white']);
  const db = (await scoreCandidate(blunder, at(WRONG), scorer({ '7k/8/6KP/8/4B3/8/8/8 w': 0, '7k/8/6KP/5B2/8/8/8/8 b': 0 }), 1))!;
  assert.deepEqual([db.drill!.side, db.drill!.by], ['black', 'marked']);
  // No moves, or a move that isn't legal: nobody is known to end it, so the side to move keeps the position.
  assert.equal(cand(chapter('Part 4: Class C: Wrong Rook-Pawn - 9', WRONG, '')).last, undefined);
  const broken = chapter('Part 4: Class C: Wrong Rook-Pawn - 10', WRONG, '1. Bf5 Kg8 2. h7+');
  (broken.chapter.root.children[0]!.children[0]!.children[0] as { san: string }).san = 'Qh7';
  assert.equal(candidatesOf([broken])[0]!.last, undefined, 'a line with a move that isn’t legal says nothing about who ends it');
  // The side that ends the line has no goal (here, worse): left out, never the other side.
  const lost = (await scoreCandidate(wrong, at(WRONG), scorer({ '7k/8/6KP/8/4B3/8/8/8 w': 900, '7k/8/6KP/5B2/8/8/8/8 b': -900 }), 1))!;
  assert.equal(lost.drill, undefined);
  assert.match(lost.why!, /the course ends on Black’s move, so it teaches Black, and still no goal after the course’s Bf5: you are worse/);
});

test('the drills joined with their scores: the ones with a goal, those without, those still to score, those removed', async () => {
  const cands = candidatesOf(ALL);
  const s = scorer(PLAIN);
  const scores = new Map<string, CourseScore>();
  for (const c of cands.slice(0, 3)) {
    const r = await scoreCandidate(c, at(c.fen), s, 1);
    if (r) scores.set(c.key, r);
  }
  const state = courseState(cands, scores, new Set());
  assert.deepEqual(state.drills.map((d) => d.cand.title), ['The Staircase - 1', 'King and Pawn - 2', 'Hold the Opposition - 3']);
  assert.equal(state.todo.length, 2);
  assert.equal(state.left, 0);
  const w = state.drills.find((d) => d.cand.title === 'King and Pawn - 2')!;
  assert.equal(w.id, courseId(positionKey(KP_WIN)));
  const removed = courseState(cands, scores, new Set([w.id]));
  assert.deepEqual([removed.drills.length, removed.removed], [2, 1]);
  // The drill as the endgame drill plays it.
  assert.deepEqual(asCourseEndgame(w), { id: w.id, group: 'course', title: 'King and Pawn - 2', fen: KP_WIN, goal: 'win', until: 'promote', idea: '' });
  const d = state.drills.find((x) => x.goal === 'draw')!;
  assert.deepEqual([asCourseEndgame(d).hold, asCourseEndgame(d).until], [REP.hold, undefined]);
  const m = state.drills.find((x) => x.until === 'mate')!;
  assert.equal(taskOf(asCourseEndgame(m)), 'White to play and win (mate)');
  assert.deepEqual(groupsOf(state.drills), [
    { group: 'Part 1: Endgames for Beginners (Unrated-999)', n: 1 },
    { group: 'Part 3: Endgames for Class D (1000-1199)', n: 2 },
  ]);
  // A mate's win is home at mate, not at a lead.
  assert.equal(wonAfter(asCourseEndgame(m), at('R2Q1K2/8/8/8/8/8/8/k7 b - - 0 1')), false);
});

test('the tries at a drill are the practice events at its start, found by the position', () => {
  const key = positionKey(KP_WIN);
  const results = [{ key, res: 'win' as const, preset: 'endgame', t: 1 }, { key, res: 'loss' as const, preset: 'blitz', t: 2 }];
  const m = attemptsByEndgame(results, (e) => positionKey(e.fen), [{ id: courseId(key), fen: KP_WIN }]);
  assert.equal(m.get(courseId(key))!.length, 1);
});

test('stored scores: read back, and refused when the drill does not match its side', async () => {
  const sc = (await scoreCandidate(cand(CH.win), at(KP_WIN), scorer(PLAIN), 3))!;
  assert.deepEqual(readCourseScore(JSON.parse(JSON.stringify(sc))), sc);
  assert.equal(readCourseScore({ ...sc, drill: { ...sc.drill!, side: 'black' } }), undefined);
  assert.equal(readCourseScore({ ...sc, v: 1 }), undefined, 'a score from before the first move was read as the author’s is scored again');
  assert.equal(readCourseScore({ ...sc, v: 2 }), undefined, 'a score from before the last move decided the side is scored again');
  assert.equal(readCourseScore({ ...sc, v: 4 }), undefined);
  assert.equal(readCourseScore(null), undefined);
});

test('the course’s text: the comments along the main line with their moves, a repeated comment once', () => {
  const t = courseText(CH.win.chapter);
  assert.deepEqual(
    t.map((x) => [x.label, x.path.join(' '), x.texts]),
    [
      ['Start', '', ['Method.']],
      ['1.Kd5', 'Kd5', ['Take the key square.']],
      ['1…Ke8', 'Kd5 Ke8', ['(Not 1...Kg7 2.e5 Kf7 3.e6+ Kf8) since the pawn runs.']],
    ],
  );
  // A chapter with no comment says nothing; a chapter from a set-up position keeps its move numbers.
  assert.deepEqual(courseText(CH.test1.chapter), []);
  assert.deepEqual(courseText(CH.worse.chapter).map((x) => x.label), ['1…Kf5']);
});

test('scores and removals in the progress log (§5.175, synced): written, read back, the latest of each card deciding, across devices', () => {
  const key = positionKeyOf(at(KP_WIN));
  const score = (cp: number, at: number): CourseScore => ({ v: 3, key, cp, depth: 18, drill: { fen: KP_WIN, side: 'white', goal: 'win', until: 'convert', cp }, at });
  const ev = (n: number, t: string, rest: Record<string, unknown>): KnownEvent => ({ v: 1, n, t, card: courseCard(key), ...rest }) as unknown as KnownEvent;
  const first = ev(1, '2026-11-14T10:00:00.000Z', { k: 'cscore', sc: score(900, 1) });
  assert.equal(formatEvent(first), `{"v":1,"n":1,"t":"2026-11-14T10:00:00.000Z","k":"cscore","card":"e|${key}","sc":${JSON.stringify(score(900, 1))}}`);
  const lines = (...events: KnownEvent[]) => events.map(formatEvent).join('\n');
  // Device A scores, removes it, and puts it back later; device B scores again, later.
  const a = parseLog(lines(first, ev(2, '2026-11-14T10:01:00.000Z', { k: 'cdrill', on: true }), ev(3, '2026-11-14T10:05:00.000Z', { k: 'cdrill', on: false })));
  const b = parseLog(lines(ev(1, '2026-11-14T10:02:00.000Z', { k: 'cscore', sc: score(950, 2) }), ev(2, '2026-11-14T10:03:00.000Z', { k: 'cdrill', on: true })));
  assert.deepEqual(a.problems, []);
  assert.deepEqual(b.problems, []);
  const replay = new Replay();
  replay.add([...toDeviceEvents('devA0001', a.lines), ...toDeviceEvents('devB0001', b.lines)]);
  const { scores, removed } = courseFromLog(replay.states.keys(), (c) => replay.eventsOf(c));
  assert.equal(scores.get(key)?.cp, 950, 'the later score decides');
  assert.equal(removed.has(key), false, 'A put it back after B removed it');
  // Refused: a score whose key isn't its card's, a card of another kind, a flag that isn't one.
  const bad = [
    `{"v":1,"n":4,"t":"2026-11-14T10:00:00.000Z","k":"cscore","card":"e|${key}","sc":{"v":2,"key":"other"}}`,
    `{"v":1,"n":5,"t":"2026-11-14T10:00:00.000Z","k":"cdrill","card":"x|${key}","on":true}`,
    `{"v":1,"n":6,"t":"2026-11-14T10:00:00.000Z","k":"cdrill","card":"e|${key}","on":1}`,
  ];
  assert.deepEqual(parseLog(bad.join('\n')).problems.map((p) => p.reason), ['sc.key must be the card’s position', 'card must be a course endgame (e|<position>)', 'on must be true or false']);
  // A score this version can't read is skipped, not fatal.
  const odd = parseLog(`{"v":1,"n":1,"t":"2026-11-14T10:00:00.000Z","k":"cscore","card":"e|${key}","sc":{"v":1,"key":"${key}"}}`);
  const r2 = new Replay();
  r2.add(toDeviceEvents('devA0001', odd.lines));
  assert.equal(courseFromLog(r2.states.keys(), (c) => r2.eventsOf(c)).scores.size, 0);
});

test('the course author’s replies for the opponent (the owner’s request of 2026-11-15): the main line’s, then a variation’s own, never the user’s side', () => {
  const c = chapter('Part 3: Endgames for Class D (1000-1199): King and Pawn - 9', KP_WIN, '1. Kd5 Ke8 (1... Kg7 2. Ke6 Kg6) 2. Ke6 Kd8 3. e5');
  const keyAfter = (...ucis: string[]) => {
    const p = at(KP_WIN);
    for (const u of ucis) p.play({ from: sq(u.slice(0, 2)), to: sq(u.slice(2, 4)) });
    return positionKeyOf(p);
  };
  const r = authorReplies(c.chapter, 'black');
  // After 1.Kd5 the main line's 1…Ke8, not the variation's Kg7; the variation's own reply after its 2.Ke6.
  assert.deepEqual(r, { [keyAfter('d4d5')]: 'f8e8', [keyAfter('d4d5', 'f8e8', 'd5e6')]: 'e8d8', [keyAfter('d4d5', 'f8g7', 'd5e6')]: 'g7g6' });
  assert.deepEqual(Object.values(authorReplies(c.chapter, 'white')).sort(), ['d4d5', 'd5e6', 'd5e6', 'e4e5'].sort());
  // The drill carries them when its chapter is given, for the side against the user.
  const d = { id: 'c-00000000', cand: { title: 'King and Pawn - 9' }, fen: KP_WIN, side: 'white', goal: 'win', until: 'promote' } as unknown as Parameters<typeof asCourseEndgame>[0];
  assert.deepEqual(asCourseEndgame(d, c.chapter).author, r);
  assert.equal(asCourseEndgame(d).author, undefined);
  // A flipped drill starts after the course's first move: that move is not one of the opponent's replies.
  const w = chapter('Part 3: Endgames for Class D (1000-1199): Why it Loses - 9', KP_WORSE, '1... Kf5 2. Kd4 Kf4 3. Kd5');
  const after = at(KP_WORSE);
  after.play({ from: sq('e5'), to: sq('f5') });
  assert.deepEqual(Object.values(authorReplies(w.chapter, 'black', positionKeyOf(after))), ['f5f4']);
  assert.deepEqual(Object.values(authorReplies(w.chapter, 'black')).sort(), ['e5f5', 'f5f4']);
});
