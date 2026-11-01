// Endgames (PLAN.md §5.145): the positions as written, the goal move by move, the spacing of the
// tries read back from practice results, the next one to play, and the attacker's pressing move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import {
  attemptsByEndgame,
  ENDGAME_PRESET,
  ENDGAMES,
  endgameById,
  firstSlip,
  GOAL_CP,
  GROUPS,
  held,
  INTERVAL_DAYS,
  keepsGoal,
  materialFor,
  nextEndgame,
  pressingMove,
  sideOf,
  slips,
  solvedBy,
  standingOf,
  taskOf,
  wonAfter,
  type Standing,
} from '../../../../src/core/endgames/endgames.ts';
import { positionKey, type PositionKey } from '../../../../src/core/chess/positionKey.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const DAY = 86_400_000;

test('every endgame is a legal position with the user to move, a goal and its end, and a group', () => {
  const ids = new Set<string>();
  for (const e of ENDGAMES) {
    assert.ok(!ids.has(e.id), e.id);
    ids.add(e.id);
    // The address takes these (fsm.ts).
    assert.match(e.id, /^[a-z0-9-]{1,40}$/);
    const p = pos(e.fen);
    assert.equal(p.turn, sideOf(e), e.id);
    assert.ok(!p.isEnd(), e.id);
    assert.ok(GROUPS.some((g) => g.id === e.group), e.id);
    if (e.goal === 'win') assert.ok(e.until && e.hold === undefined, e.id);
    else assert.ok(e.hold && e.hold > 0 && e.until === undefined, e.id);
    assert.ok(e.idea.length > 80, e.id);
    assert.equal(endgameById(e.id), e);
  }
  assert.equal(endgameById('nope'), undefined);
  // Each group has at least one, so no panel is empty.
  for (const g of GROUPS) assert.ok(ENDGAMES.some((e) => e.group === g.id), g.id);
});

test('the task says the side, the goal and its end', () => {
  assert.equal(taskOf(endgameById('queen-mate')!), 'White to play and win (mate)');
  assert.equal(taskOf(endgameById('lucena')!), 'White to play and win (queen a pawn)');
  assert.equal(taskOf(endgameById('queen-vs-pawn')!), 'White to play and win (win the pawn)');
  assert.equal(taskOf(endgameById('philidor')!), 'Black to play and draw (hold 15 moves)');
});

test('the goal: kept at +2 (a win) or −2 (a draw); a slip is from kept to lost', () => {
  assert.equal(keepsGoal('win', GOAL_CP.win), true);
  assert.equal(keepsGoal('win', GOAL_CP.win - 1), false);
  assert.equal(keepsGoal('draw', GOAL_CP.draw), true);
  assert.equal(keepsGoal('draw', GOAL_CP.draw - 1), false);
  assert.equal(keepsGoal('win', 10000), true);
  // A slow win is no slip; a win let go is; a move in a position already lost is no new slip.
  assert.equal(slips('win', 10000, 450), false);
  assert.equal(slips('win', 615, 0), true);
  assert.equal(slips('win', 100, 0), false);
  assert.equal(slips('draw', -30, -60), false);
  assert.equal(slips('draw', -9, -417), true);
  assert.equal(slips('draw', -500, -900), false);
});

test('the first slip, among moves judged in the background: never one past a move still judged', () => {
  const ok = { isUser: true, bestCp: 900, afterCp: 850 };
  const slip = { isUser: true, bestCp: 900, afterCp: 0 };
  const reply = { isUser: false };
  const out = { isUser: true, judging: true };
  assert.equal(firstSlip('win', []), undefined);
  assert.equal(firstSlip('win', [ok, reply, ok, reply]), undefined);
  // Played on past it: the slip is the first, whatever the moves after it.
  assert.equal(firstSlip('win', [ok, reply, slip, reply, out, reply]), 2);
  assert.equal(firstSlip('win', [ok, reply, slip, reply, { isUser: true, bestCp: 0, afterCp: -900 }]), 2);
  // A later slip found first waits for the judge before it: that move may be the first.
  assert.equal(firstSlip('win', [ok, reply, out, reply, slip]), 'pending');
  assert.equal(firstSlip('win', [out]), 'pending');
  // From a move on (played on past a slip): the moves before it aren't looked at.
  assert.equal(firstSlip('win', [slip, reply, ok, reply, slip], 2), 4);
  assert.equal(firstSlip('win', [slip, reply, ok], 2), undefined);
  // A judge that gave nothing is passed over; a draw's slip as a draw's.
  assert.equal(firstSlip('win', [{ isUser: true }, reply, slip]), 2);
  assert.equal(firstSlip('draw', [{ isUser: true, bestCp: -9, afterCp: -60 }, reply, { isUser: true, bestCp: -9, afterCp: -417 }]), 2);
});

test('a win is reached by mate, by a promotion, or by a bare king, as each endgame says', () => {
  const lucena = endgameById('lucena')!;
  const qp = endgameById('queen-vs-pawn')!;
  const mate = endgameById('queen-mate')!;
  // A pawn promoted: Lucena's goal, not the queen mate's.
  const promoted = pos('1Q2k3/8/8/8/8/8/8/1K6 b - - 0 1');
  assert.equal(wonAfter(lucena, promoted, true), true);
  assert.equal(wonAfter(lucena, promoted, false), false);
  assert.equal(wonAfter(mate, promoted, true), false);
  // Mate ends any win.
  const m = pos('4k3/1Q6/4K3/8/8/8/8/8 w - - 0 1');
  m.play(parseUci('b7e7')!);
  assert.equal(m.isCheckmate(), true);
  assert.equal(wonAfter(mate, m, false), true);
  // The pawn taken: the defender has a bare king.
  const bare = pos('8/8/8/8/8/8/4k3/K2Q4 b - - 0 1');
  assert.equal(wonAfter(qp, bare, false), true);
  assert.equal(wonAfter(qp, pos(qp.fen.replace(' w ', ' b ')), false), false);
  // A draw's goal is held, never won.
  const philidor = endgameById('philidor')!;
  assert.equal(wonAfter(philidor, m, false), false);
  assert.equal(held(philidor, 14), false);
  assert.equal(held(philidor, 15), true);
  assert.equal(held(lucena, 99), false);
});

test('a result read as the goal: a win for a win; a draw or better for a draw', () => {
  assert.equal(solvedBy('win', 'win'), true);
  assert.equal(solvedBy('win', 'draw'), false);
  assert.equal(solvedBy('draw', 'draw'), true);
  assert.equal(solvedBy('draw', 'win'), true);
  assert.equal(solvedBy('draw', 'loss'), false);
});

test('where an endgame stands: new, due after a miss, then spaced by the solves in a row', () => {
  const t0 = Date.UTC(2026, 9, 1);
  assert.deepEqual(standingOf('win', [], t0), { state: 'new', tries: 0, solves: 0, streak: 0, last: [] });
  const missed = standingOf('win', [{ t: t0, res: 'draw' }], t0 + 1000);
  assert.equal(missed.state, 'due');
  assert.equal(missed.streak, 0);
  // One solve after the miss: back in a day; due once the day has passed.
  const once = [
    { t: t0 + 2000, res: 'win' as const },
    { t: t0, res: 'loss' as const },
  ];
  const s1 = standingOf('win', once, t0 + 3000);
  assert.equal(s1.state, 'later');
  assert.equal(s1.next, t0 + 2000 + INTERVAL_DAYS[0] * DAY);
  assert.deepEqual(s1.last, [false, true]);
  assert.equal(standingOf('win', once, t0 + 2000 + DAY).state, 'due');
  // Three in a row: 7 days; six and more: 60.
  const run = (n: number) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 100 * DAY, res: 'draw' as const }));
  const s3 = standingOf('draw', run(3), t0 + 200 * DAY + 1);
  assert.equal(s3.next, t0 + 200 * DAY + 7 * DAY);
  assert.equal(s3.streak, 3);
  const s8 = standingOf('draw', run(8), t0 + 700 * DAY + 1);
  assert.equal(s8.next, t0 + 700 * DAY + 60 * DAY);
  assert.equal(s8.last.length, 5);
  assert.equal(s8.tries, 8);
  assert.equal(s8.solves, 8);
});

test('tries are the endgame preset’s practice results at each start position', () => {
  const keyOf = (e: { fen: string }) => positionKey(e.fen);
  const lucena = keyOf(endgameById('lucena')!);
  const results = [
    { key: lucena, res: 'win' as const, preset: ENDGAME_PRESET, t: 5 },
    // Another preset at the same position (a practice game from it), and an unknown position: not tries.
    { key: lucena, res: 'loss' as const, preset: 'easy', t: 6 },
    { key: lucena, res: 'loss' as const, t: 7 },
    { key: 'x' as PositionKey, res: 'win' as const, preset: ENDGAME_PRESET, t: 8 },
  ];
  const by = attemptsByEndgame(results, keyOf);
  assert.deepEqual([...by.keys()], ['lucena']);
  assert.deepEqual(by.get('lucena'), [{ t: 5, res: 'win' }]);
});

test('the next endgame: the first due in order, else the first new; after one, the rest first', () => {
  const st = (state: Standing['state']): Standing => ({ state, tries: 0, solves: 0, streak: 0, last: [] });
  const all = (state: Standing['state']) => new Map(ENDGAMES.map((e) => [e.id, st(state)]));
  assert.equal(nextEndgame(new Map())?.id, ENDGAMES[0]!.id);
  const m = all('later');
  assert.equal(nextEndgame(m), undefined);
  m.set('philidor', st('new'));
  m.set('reti', st('due'));
  assert.equal(nextEndgame(m)?.id, 'reti');
  // After Réti itself: Philidor (new) rather than Réti again.
  assert.equal(nextEndgame(m, 'reti')?.id, 'philidor');
  // After an endgame, the due ones after it come before those before it.
  const n = all('later');
  n.set('queen-mate', st('due'));
  n.set('lucena', st('due'));
  assert.equal(nextEndgame(n, 'opposition')?.id, 'lucena');
  assert.equal(nextEndgame(n, 'lucena')?.id, 'queen-mate');
});

test('material for a side, and the attacker pressing rather than handing a drawn position over', () => {
  const start = '4k3/8/8/4K3/4P3/8/8/8 w - - 0 1';
  assert.equal(materialFor(pos(start), 'white'), 1);
  assert.equal(materialFor(pos(start), 'black'), -1);
  assert.equal(materialFor(pos(endgameById('lucena')!.fen), 'white'), 1);
  const material = (fen: string) => (pv: readonly string[]) => {
    const p = pos(fen);
    for (const uci of pv) {
      const m = parseUci(uci);
      if (!m || !p.isLegal(m)) return undefined;
      p.play(m);
    }
    return materialFor(p, pos(fen).turn);
  };
  // As in §5.145's simulation: e7 is Stockfish's first line at 0.00 and the king takes the pawn;
  // Kd5 keeps it, as good by the score: the attacker plays Kd5.
  const g2 = '3k4/8/4P3/4K3/8/8/8/8 w - - 0 1';
  assert.equal(pressingMove([{ cp: 0, pv: ['e6e7', 'd8e7'] }, { cp: 0, pv: ['e5d5', 'd8e7'] }], material(g2)), 'e5d5');
  // The first line that keeps material wins, and a line that can't be played is passed over.
  assert.equal(pressingMove([{ cp: 0, pv: ['e5f5', 'd8e7'] }, { cp: 0, pv: ['e5d5', 'd8e7'] }], material(g2)), 'e5f5');
  assert.equal(pressingMove([{ cp: 0, pv: ['a1a2'] }, { cp: 0, pv: ['e5d5'] }], material(g2)), 'e5d5');
  // Only lines within 30 cp count; with none keeping material, the best.
  assert.equal(pressingMove([{ cp: 0, pv: ['e6e7', 'd8e7'] }, { cp: -31, pv: ['e5d5', 'd8e7'] }], material(g2)), 'e6e7');
  assert.equal(pressingMove([], material(g2)), undefined);
});
