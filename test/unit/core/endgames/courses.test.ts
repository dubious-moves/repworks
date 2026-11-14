// Endgames from the user's courses (PLAN.md §5.175): the chapters of a reference study that start
// from a position, their groups, the goal from Stockfish's score (a stub here), the weaker side's
// chapter played from the course's first move, the drills joined with their scores, and the
// course's own text along its main line. The study is a small synthetic one in the shape of a
// course export (a [FEN] set-up, one main line, prose in the comments), not a course's content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { positionOf } from '../../../../src/core/storm/walk.ts';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';
import { asCourseEndgame, candidatesOf, courseGoal, courseId, courseState, courseText, groupsOf, isCourseId, nameParts, readCourseScore, scoreCandidate, type Candidate, type CourseChapter, type CourseScore } from '../../../../src/core/endgames/courses.ts';
import { attemptsByEndgame, taskOf, wonAfter } from '../../../../src/core/endgames/endgames.ts';
import { REP } from '../../../../src/core/endgames/repertoire.ts';

const at = (fen: string) => positionOf(fen)!;
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

test('scoring: a win, a win on material to mate, a draw, no goal, and no answer', async () => {
  const s = scorer({ '5k2/8/8/8/3KP3/8/8/8 w': 620, '8/8/8/4k3/8/8/8/R2QK3 w': 4000, '4k3/8/8/4K3/4P3/8/8/8 b': -20, '8/pp6/8/8/8/8/PP6/K6k w': 210 });
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

test('the weaker side to move: the course’s first move is played for them and the other side is the user’s', async () => {
  const asked: string[] = [];
  // Black to move is lost at −640; after 1...Kf5 White, to move, is +640.
  const s = scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640, '8/8/8/5k2/8/3K4/4P3/8 w': 640 }, asked);
  const sc = (await scoreCandidate(cand(CH.worse), at(KP_WORSE), s, 1))!;
  assert.deepEqual(sc.drill, { fen: '8/8/8/5k2/8/3K4/4P3/8 w - - 1 2', side: 'white', goal: 'win', until: 'promote', cp: 640, flipped: 'Kf5' });
  assert.equal(sc.cp, -640, 'the chapter start’s own score is kept');
  assert.equal(asked.length, 2);
  // After the move, still no goal for the other side (a dead position): left out, with the reason.
  const none = (await scoreCandidate(cand(CH.worse), at(KP_WORSE), scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640, '8/8/8/5k2/8/3K4/4P3/8 w': 240 }), 1))!;
  assert.equal(none.drill, undefined);
  assert.match(none.why!, /still no goal after the course’s Kf5/);
  // No first move in the chapter: no flip.
  const moveless = candidatesOf([chapter('Part 3: Class D: Bare - 9', KP_WORSE, '')])[0]!;
  const bare = (await scoreCandidate(moveless, at(KP_WORSE), scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640 }), 1))!;
  assert.equal(bare.drill, undefined);
  assert.match(bare.why!, /no move to play/);
  // Stockfish silent on the second search: asked again later.
  assert.equal(await scoreCandidate(cand(CH.worse), at(KP_WORSE), scorer({ '8/8/8/4k3/8/3K4/4P3/8 b': -640 }), 1), undefined);
});

test('the drills joined with their scores: the ones with a goal, those without, those still to score, those removed', async () => {
  const cands = candidatesOf(ALL);
  const s = scorer({ '5k2/8/8/8/3KP3/8/8/8 w': 620, '8/8/8/4k3/8/8/8/R2QK3 w': 4000, '4k3/8/8/4K3/4P3/8/8/8 b': -20, '8/pp6/8/8/8/8/PP6/K6k w': 210 });
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
  assert.equal(wonAfter(asCourseEndgame(m), at('R2Q1K2/8/8/8/8/8/8/k7 b - - 0 1'), false), false);
});

test('the tries at a drill are the practice events at its start, found by the position', () => {
  const key = positionKey(KP_WIN);
  const results = [{ key, res: 'win' as const, preset: 'endgame', t: 1 }, { key, res: 'loss' as const, preset: 'blitz', t: 2 }];
  const m = attemptsByEndgame(results, (e) => positionKey(e.fen), [{ id: courseId(key), fen: KP_WIN }]);
  assert.equal(m.get(courseId(key))!.length, 1);
});

test('stored scores: read back, and refused when the drill does not match its side', async () => {
  const sc = (await scoreCandidate(cand(CH.win), at(KP_WIN), scorer({ '5k2/8/8/8/3KP3/8/8/8 w': 620 }), 3))!;
  assert.deepEqual(readCourseScore(JSON.parse(JSON.stringify(sc))), sc);
  assert.equal(readCourseScore({ ...sc, drill: { ...sc.drill!, side: 'black' } }), undefined);
  assert.equal(readCourseScore({ ...sc, v: 2 }), undefined);
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
