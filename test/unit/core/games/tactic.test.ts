// A tactic played through (PLAN.md §5.55): the main line with its replies, a wrong move, a switch
// to another line's move, the next line from where the opponent's reply differs, and a line left
// at the user's own move left out (mistake-lab's optional lines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expected, nextLine, playReply, playUser, repliesDue, startTactic } from '../../../../src/core/games/tactic.ts';
import type { TacticMove } from '../../../../src/core/games/record.ts';

const L = (...m: string[]): TacticMove[] => m.map((uci, i) => ({ uci, san: uci, user: i % 2 === 0 }));
// mistake-lab's own test tactic: Bxf7+ Kf8 Ng5, and Bxf7+ Kxf7 Ng5+ Ke8 Ne6 / Kf6 Qf3#.
const main = L('c4f7', 'e8f8', 'f3g5');
const alt1 = L('c4f7', 'e8f7', 'f3g5', 'f7e8', 'g5e6');
const alt2 = L('c4f7', 'e8f7', 'f3g5', 'f7f6', 'd1f3');

test('the main line: the user’s moves, the replies, a wrong move refused', () => {
  let run = startTactic([main, alt1, alt2]);
  assert.deepEqual(repliesDue(run), []);
  assert.equal(expected(run)!.uci, 'c4f7');
  assert.equal(playUser(run, 'd1h5').ok, false);
  const a = playUser(run, 'c4f7');
  assert.ok(a.ok && !a.lineDone);
  run = a.run;
  assert.deepEqual(repliesDue(run), ['e8f8']);
  run = playReply(run, 'e8f8');
  const b = playUser(run, 'f3g5');
  assert.ok(b.ok && b.lineDone);
});

test('the next lines start where the opponent’s reply differs; then none is left', () => {
  let run = startTactic([main, alt1, alt2]);
  for (const [u, r] of [['c4f7', 'e8f8']] as const) run = playReply((playUser(run, u) as { run: typeof run }).run, r);
  run = (playUser(run, 'f3g5') as { run: typeof run }).run;
  const n1 = nextLine(run)!;
  assert.deepEqual(n1.prefix, ['c4f7', 'e8f7']);
  assert.equal(expected(n1.run)!.uci, 'f3g5');
  run = n1.run;
  run = playReply((playUser(run, 'f3g5') as { run: typeof run }).run, 'f7e8');
  const done = playUser(run, 'g5e6');
  assert.ok(done.ok && done.lineDone);
  const n2 = nextLine(done.run)!;
  assert.deepEqual(n2.prefix, ['c4f7', 'e8f7', 'f3g5', 'f7f6']);
  const last = playUser(n2.run, 'd1f3');
  assert.ok(last.ok && last.lineDone);
  assert.equal(nextLine(last.run), undefined);
});

test('a move of another unsolved line with the same start switches to it', () => {
  const lineA = L('a2a3', 'h7h6', 'b2b3');
  const lineB = L('a2a3', 'h7h6', 'c2c3');
  let run = playReply((playUser(startTactic([lineA, lineB]), 'a2a3') as { run: ReturnType<typeof startTactic> }).run, 'h7h6');
  const a = playUser(run, 'c2c3');
  assert.ok(a.ok && a.lineDone);
  run = a.run;
  assert.equal(run.active, 1);
  // The other line leaves the solved one at the user's own move: optional, not asked.
  assert.equal(nextLine(run), undefined);
});
