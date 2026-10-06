// Winning chances, the eval bar and the engine's arrows (PLAN.md §5.31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whiteShare, winningChances } from '../../../../src/core/engine/winning.ts';
import { engineArrows } from '../../../../src/core/engine/shapes.ts';
import type { EngineLine } from '../../../../src/core/engine/search.ts';

const close = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('winning chances: even at 0, Qchess’s bar at +1 (about 59%), symmetric, capped, mates near the ends', () => {
  assert.equal(winningChances({ cp: 0 }), 0);
  // Qchess's calculateWinningPercentage(100) = 50 + 50 * (2 / (1 + exp(-0.368208)) - 1).
  close(whiteShare({ cp: 100 }), 50 + 50 * (2 / (1 + Math.exp(-0.368208)) - 1));
  close(winningChances({ cp: -250 }), -winningChances({ cp: 250 }));
  assert.equal(winningChances({ cp: 5000 }), winningChances({ cp: 1000 }));
  assert.ok(winningChances({ mate: 1 }) > winningChances({ mate: 5 }));
  assert.ok(winningChances({ mate: 5 }) > winningChances({ cp: 1000 }));
  assert.ok(winningChances({ mate: -2 }) < -0.99);
  assert.equal(whiteShare({ mate: 0 }), 50);
});

const line = (multipv: number, cp: number, uci: string): EngineLine => ({ multipv, depth: 20, score: { cp }, pv: [uci] });

test('arrows: the best in blue, the others in grey by how far behind, none 20% behind', () => {
  const lines = [line(1, 40, 'e2e4'), line(2, 30, 'd2d4'), line(3, -300, 'a2a4')];
  const arrows = engineArrows(lines, 'white');
  assert.deepEqual(arrows.map((a) => [a.orig, a.dest, a.brush]), [
    ['e2', 'e4', 'paleBlue'],
    ['d2', 'd4', 'paleGrey'],
  ]);
  assert.equal(arrows[0]!.lineWidth, 15);
  assert.ok(arrows[1]!.lineWidth <= 12 && arrows[1]!.lineWidth >= 11);
});

test('arrows with Black to move compare from Black’s side; the threat is one red arrow', () => {
  // Scores are White's: -50 is Black's best, -20 a bit worse for Black.
  const lines = [line(1, -50, 'e7e5'), line(2, -20, 'c7c5'), line(3, 200, 'g8h6')];
  const arrows = engineArrows(lines, 'black');
  assert.deepEqual(arrows.map((a) => a.dest), ['e5', 'c5']);
  assert.ok(arrows[1]!.lineWidth < 12);
  assert.deepEqual(engineArrows(lines, 'black', true), [{ orig: 'e7', dest: 'e5', brush: 'paleRed', lineWidth: 15 }]);
  assert.deepEqual(engineArrows([], 'white'), []);
});
