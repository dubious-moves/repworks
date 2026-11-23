// Lichess's curve, as a report (PLAN.md §5.126, scripts/elo-curve.ts): the fit finds a slope it
// was given in simulated games, and files games as the explorer does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandOf, fitSlope, speedOf } from '../../../scripts/elo-curve.ts';

/** A seeded generator (mulberry32), so the simulated games are the same each run. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Games whose expected score follows `k` of Elo's slope, White 2 points up, a tenth drawn (wins p − 0.05, losses the rest). */
function simulate(k: number, n: number, seed: number) {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const gap = Math.round((r() - 0.5) * 300);
    const p = 1 / (1 + 10 ** (-(k * gap + 14) / 400));
    const u = r();
    return { gap, score: u < 0.1 ? 0.5 : u < 0.1 + (p - 0.05) ? 1 : 0 };
  });
}

test('the fit finds the slope the games were made with, and its error', () => {
  for (const k of [1, 0.6]) {
    const fit = fitSlope(simulate(k, 60000, 7));
    assert.ok(Math.abs(fit.k - k) < 3 * fit.se, `k ${fit.k.toFixed(3)} ± ${fit.se.toFixed(3)} for ${k}`);
    assert.ok(fit.se > 0.005 && fit.se < 0.05);
    assert.equal(fit.games, 60000);
  }
  // Only gaps within 150 points count.
  assert.equal(fitSlope([...simulate(1, 1000, 3), { gap: 400, score: 1 }]).games, 1000);
});

test('games filed as the explorer files them: speed by base + 40 × increment, band by the midpoint', () => {
  assert.deepEqual(['15+0', '60+0', '180+0', '180+2', '300+3', '600+0', '900+10', '1800+0', '-'].map(speedOf), [
    'ultraBullet', 'bullet', 'blitz', 'blitz', 'blitz', 'rapid', 'rapid', 'classical', undefined,
  ]);
  assert.deepEqual([600, 999, 1000, 1799, 1800, 2499, 2500, 3000].map(bandOf), [400, 400, 1000, 1600, 1800, 2200, 2500, 2500]);
});
