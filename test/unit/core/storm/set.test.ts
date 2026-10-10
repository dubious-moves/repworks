// The set (PLAN.md §5.44): lichessable's dev/check-storm.js section 11's set rules (§17), ported.
//
// Control re-run on this port (2026-10-06): `setHeld` written as `!setClean` → "unknown holds
// nothing" fails, and only it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { setClean, setHeld, setOutcome, setTally, type SetEntry } from '../../../../src/core/storm/set.ts';

test('clean is the two bands that score', () => {
  assert.equal(setClean('great', C), true);
  assert.equal(setClean('good', C), true);
  assert.equal(setClean('ok', C), false);
  assert.equal(setClean('bad', C), false);
  assert.equal(setClean('blunder', C), false);
  assert.equal(setClean('unknown', C), false);
});

test('held: an inaccuracy, a mistake, a blunder', () => {
  assert.equal(setHeld('ok', C), true);
  assert.equal(setHeld('bad', C), true);
  assert.equal(setHeld('blunder', C), true);
  assert.equal(setHeld('good', C), false);
  assert.equal(setHeld('great', C), false);
});

test('unknown holds nothing', () => {
  assert.equal(setHeld('unknown', C), false);
  assert.equal(setHeld(undefined, C), false);
});

test('outcomes', () => {
  assert.equal(setOutcome(1, 'great', false, C), 'first');
  assert.equal(setOutcome(1, 'good', false, C), 'first');
  assert.equal(setOutcome(2, 'good', false, C), 'retry');
  assert.equal(setOutcome(3, 'great', false, C), 'retry');
  assert.equal(setOutcome(1, 'great', true, C), 'shown');
  assert.equal(setOutcome(3, 'good', true, C), 'shown');
  assert.equal(setOutcome(1, 'unknown', true, C), 'unknown');
  assert.equal(setOutcome(2, 'blunder', false, C), 'missed');
});

test('the tally, the second pass kept apart', () => {
  const mk = (outcome: SetEntry['outcome'] | undefined, secondOutcome?: SetEntry['outcome']): SetEntry => {
    const e: SetEntry = {};
    if (outcome) e.outcome = outcome;
    if (secondOutcome) e.secondOutcome = secondOutcome;
    return e;
  };
  const t = setTally([mk('first'), mk('first'), mk('retry'), mk('shown', 'first'), mk('shown', 'missed'), mk('unknown'), mk(undefined)]);
  assert.equal(t.asked, 7);
  assert.equal(t.resolved, 6);
  assert.equal(t.first, 2);
  assert.equal(t.retry, 1);
  assert.equal(t.shown, 2);
  assert.equal(t.unknown, 1);
  assert.equal(t.again, 2);
  assert.equal(t.againClean, 1);
});

test('the thresholds hold their meaning', () => {
  assert.equal(C.setCleanOn.join(','), 'great,good');
  assert.equal(C.setCleanOn.join(','), C.storeDropOn.join(','));
  assert.equal(C.puzzleDropOn.join(','), C.storeDropOn.join(','));
  assert.ok(C.setRetryMax >= 2 && C.setRetryMax <= 5);
  assert.ok(C.setSize >= 4 && C.setSize <= 12);
  assert.ok(C.verdictFastMs < C.verdictMs);
  assert.ok(C.walkDepth < C.judgeDepth && C.judgeDepth <= C.deepenDepth.mobile && C.deepenDepth.mobile <= C.deepenDepth.desktop);
  assert.ok(C.engineDepth.mobile >= C.judgeDepth && C.engineDepth.desktop >= C.judgeDepth);
  assert.ok(C.walkMultipv >= C.minScored);
  assert.ok(C.puzzleAnchorMinPly >= 10);
});
