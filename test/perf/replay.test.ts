// Timing tests, run by `npm test` after the others and alone, so no other test file shares the
// machine with them: beside the merge and sync simulations a run here took 222 ms against 139
// ms alone (a 4-core container, 2026-10-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Replay } from '../../src/core/progress/replay.ts';
import { asDevice, randomHistory, reviewEvent } from '../support/reviewHistory.ts';

test('100,000 events replay in under 200 ms', () => {
  const history = randomHistory(4, 100_000, 3000);
  const events = asDevice('Desktop1', history.map((h, i) => reviewEvent(i + 1, h.t, h.card, h.g)));
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    new Replay().add(events);
    best = Math.min(best, performance.now() - start);
  }
  console.log(`replay of 100,000 events: ${best.toFixed(1)} ms (best of 3)`);
  assert.ok(best < 200, `${best.toFixed(1)} ms`);
});
