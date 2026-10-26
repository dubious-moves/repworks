// The eval graphs' geometry (src/ui/evalGraph.ts): the user's side at the bottom, rising as the
// user's game gets better; White's light area closing on the user's edge when White, on the top
// when Black, so the colour always says who is ahead, as on chess.com and the eval bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphLabel, graphY, whiteEdge } from '../../../src/ui/evalGraph.ts';

test('the curve: level at the middle, higher (smaller y) as the user does better, a mate near the edge', () => {
  assert.equal(graphY(0, 100), 50);
  assert.ok(graphY(300, 100) < 50);
  assert.ok(graphY(-300, 100) > 50);
  assert.ok(graphY(10000, 100) < graphY(1000, 100) + 1);
  assert.ok(graphY(10000, 100) > 0 && graphY(-10000, 100) < 100);
  assert.equal(graphY(250, 100), 100 - graphY(-250, 100));
});

test('White’s area: from the bottom for White, hanging from the top for Black', () => {
  assert.equal(whiteEdge('white', 100), 100);
  assert.equal(whiteEdge('black', 100), 0);
  // Black ahead, the user Black: the curve high, White's area above it small.
  const y = graphY(400, 100);
  assert.ok(Math.abs(y - whiteEdge('black', 100)) < 30);
  assert.match(graphLabel('black'), /Black \(you\) at the bottom/);
});
