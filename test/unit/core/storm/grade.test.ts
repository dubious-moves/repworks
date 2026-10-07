// The storm's grading (PLAN.md §5.39): lichessable's dev/check-storm.js sections 1 (the
// perspective flip), 2 (the grader), 3 (the bands and the score) and 10 (the engine tier's flip),
// ported assertion by assertion. Carried as they are; left behind: section 0 (a slicing artefact
// of lichessable's single file) and the `.clo-cdb--est` class (its predicate is `estimated`, in
// verdict.test.ts).
//
// Controls re-run on this port (2026-10-06), each failing exactly the named assertions:
// - `userEval` returning `best` unflipped → "the perspective flip" fails;
// - `moverCp` with its sign pinned to 1 → "the engine tier's flip" and "the engine tier" fail;
// - `moveLoss`'s fallback as `best - childBest` → "the child-negation fallback" fails, not "a
//   child score of 0", which is the type check;
// - `points` multiplying a penalty → "the flat penalty" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { engineLoss, grade, moveLoss, moverCp, nextStreak, points, userEval, winPct, wpLoss, type ScoredMove } from '../../../../src/core/storm/grade.ts';

test('the perspective flip: ChessDB’s mover score read for the repertoire by the side to move', () => {
  assert.equal(userEval(180, 'black', 'white'), -180);
  assert.equal(userEval(180, 'white', 'white'), 180);
  assert.equal(userEval(180, 'white', 'black'), -180);
  assert.equal(userEval(180, 'black', 'black'), 180);
  assert.equal(userEval(116, 'black', 'white'), -userEval(116, 'black', 'black'));
});

const scored: ScoredMove[] = [
  { uci: 'g1f3', san: 'Nf3', score: 32, winrate: 54 },
  { uci: 'f1b5', san: 'Bb5', score: 20, winrate: 53 },
  { uci: 'd2d4', san: 'd4', score: -5, winrate: 49 },
  { uci: 'b1c3', san: 'Nc3', score: -48, winrate: 47 },
  { uci: 'h2h3', san: 'h3', score: -120, winrate: 43 },
];

test('the grader: from the list, rank and loss and win rate', () => {
  assert.equal(moveLoss(scored, 'g1f3', undefined, C)!.loss, 0);
  assert.equal(moveLoss(scored, 'g1f3', undefined, C)!.rank, 1);
  assert.equal(moveLoss(scored, 'f1b5', undefined, C)!.loss, 12);
  assert.equal(moveLoss(scored, 'b1c3', undefined, C)!.loss, 80);
  assert.equal(moveLoss(scored, 'd2d4', undefined, C)!.source, 'list');
  assert.equal(moveLoss(scored, 'd2d4', undefined, C)!.winrate, 49);
  assert.ok(Math.abs(moveLoss(scored, 'f1b5', undefined, C)!.wp! - wpLoss(32, 20, C)!) < 1e-9);
  assert.equal(moveLoss(scored, 'g1f3', undefined, C)!.wp, 0);
  assert.equal(moveLoss(scored, 'f1b5', undefined, C)!.bestScore, 32);
});

test('the child-negation fallback: the position after the move is the opponent’s', () => {
  const viaChild = moveLoss(scored, 'a2a3', -10, C)!;
  assert.equal(viaChild.loss, 22);
  assert.equal(viaChild.source, 'child');
  assert.equal(viaChild.rank, null);
  assert.equal(moveLoss(scored, 'a2a3', 150, C)!.loss, 182);
  assert.equal(moveLoss(scored, 'a2a3', -400, C)!.loss, 0);
  assert.equal(moveLoss(scored, 'a2a3', undefined, C), null);
  assert.equal(moveLoss([], 'g1f3', 0, C), null);
});

test('a child score of 0 is a real answer', () => {
  assert.equal(moveLoss(scored, 'a2a3', 0, C)!.loss, 32);
});

test('win probability: Lichess’s curve, clamped, floored at no loss', () => {
  assert.equal(Math.round(winPct(0, C)!), 50);
  assert.equal(Math.round(winPct(300, C)! + winPct(-300, C)!), 100);
  assert.ok(winPct(500, C)! < 90);
  assert.ok(winPct(1000, C)! > 97);
  assert.equal(winPct(30000, C), winPct(C.wpClampCp, C));
  assert.equal(winPct(-30000, C), winPct(-C.wpClampCp, C));
  assert.equal(winPct(null, C), null);
  assert.equal(wpLoss(0, 0, C), 0);
  assert.equal(wpLoss(0, 50, C), 0);
  assert.ok(wpLoss(0, -100, C)! > 8);
  assert.ok(wpLoss(0, -100, C)! > 1.5 * wpLoss(500, 400, C)!);
  assert.ok(wpLoss(500, 400, C)! > wpLoss(600, 500, C)!);
});

test('calibration: at equality the bands are the old 30 and 70 cp, wider at +200', () => {
  const cpAt = (band: number, base: number) => {
    let lo = base - 2000;
    let hi = base;
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (wpLoss(base, m, C)! > band) lo = m;
      else hi = m;
    }
    return Math.round(base - (lo + hi) / 2);
  };
  const greatCp = cpAt(C.greatWp, 0);
  assert.ok(Math.abs(greatCp - 30) <= 5, `great at ${greatCp}`);
  assert.ok(Math.abs(cpAt(C.goodWp, 0) - 70) <= 5);
  assert.ok(cpAt(C.greatWp, C.userHiCp) > greatCp);
});

test('the bands: a threshold falls in the band below it; no number is no verdict', () => {
  assert.equal(grade(0, C), 'great');
  assert.equal(grade(C.greatWp - 0.01, C), 'great');
  assert.equal(grade(C.greatWp, C), 'good');
  assert.equal(grade(C.goodWp, C), 'ok');
  assert.equal(grade(C.okWp, C), 'bad');
  assert.equal(grade(C.badWp, C), 'blunder');
  assert.equal(grade(60, C), 'blunder');
  assert.equal(grade(null, C), 'unknown');
  assert.equal(grade(NaN, C), 'unknown');
  assert.ok(C.greatWp < C.goodWp && C.goodWp < C.okWp && C.okWp < C.badWp);
});

test('the score: rewards ride the streak, the middle band is nothing', () => {
  assert.equal(points('great', 0, C), C.greatPoints);
  assert.equal(points('good', 0, C), C.goodPoints);
  assert.equal(points('ok', 0, C), 0);
  assert.equal(points('ok', C.streakStep * 50, C), 0);
  assert.equal(points('bad', 0, C), C.badPoints);
  assert.equal(points('blunder', 0, C), C.blunderPoints);
  assert.equal(points('unknown', 99, C), 0);
  assert.equal(points('unanswered', 99, C), 0);
  assert.equal(points('great', C.streakStep, C), C.greatPoints * 2);
  assert.equal(points('great', C.streakStep * 50, C), C.greatPoints * C.streakMax);
  assert.equal(points('good', C.streakStep, C), C.goodPoints * 2);
});

test('the flat penalty: a lapse costs the same after a long streak', () => {
  assert.equal(points('blunder', C.streakStep * 50, C), C.blunderPoints);
  assert.equal(points('bad', C.streakStep * 50, C), C.badPoints);
  assert.equal(points('blunder', C.streakStep, C), C.blunderPoints);
});

test('the streak follows the sign of the points (§16.3)', () => {
  assert.equal(nextStreak(3, 2), 4);
  assert.equal(nextStreak(3, -1), 0);
  assert.equal(nextStreak(3, 0), 3);
});

test('the engine tier’s flip: White’s score turned to the mover’s, mates near the ends', () => {
  assert.equal(moverCp({ cp: 120 }, 'white', C), 120);
  assert.equal(moverCp({ cp: 120 }, 'black', C), -120);
  assert.equal(moverCp({ cp: -120 }, 'black', C), 120);
  assert.equal(moverCp({ cp: 77 }, 'white', C), -moverCp({ cp: 77 }, 'black', C)!);
  assert.equal(moverCp({ mate: 3 }, 'white', C), C.engineMateCp - 3);
  assert.equal(moverCp({ mate: -3 }, 'black', C), C.engineMateCp - 3);
  assert.equal(moverCp({ mate: -3 }, 'white', C), -C.engineMateCp + 3);
  assert.ok(moverCp({ mate: 3 }, 'white', C)! > moverCp({ mate: 5 }, 'white', C)!);
  assert.equal(wpLoss(moverCp({ mate: 3 }, 'white', C)!, moverCp({ mate: 5 }, 'white', C)!, C), 0);
  assert.equal(grade(wpLoss(moverCp({ mate: 3 }, 'white', C)!, 300, C), C), 'blunder');
  assert.equal(moverCp({ cp: 0 }, 'black', C), -0);
  assert.equal(moverCp({}, 'white', C), null);
  assert.equal(moverCp(null, 'white', C), null);
});

test('the engine tier: both numbers from one evaluator, from the mover’s side', () => {
  // Black to move; the position is +0.40 for White (−40 for Black), after the move +1.20.
  const r = engineLoss({ cp: 40 }, { cp: 120 }, 'black', C)!;
  assert.equal(r.bestScore, -40);
  assert.equal(r.score, -120);
  assert.equal(r.loss, 80);
  assert.equal(engineLoss({ cp: 40 }, {} as never, 'black', C), null);
});
