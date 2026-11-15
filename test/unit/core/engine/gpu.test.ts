// Maia and Lc0 on the graphics processor (PLAN.md §5.184): the gap between two backends'
// outputs, the choice once both have run, and the note's words.
//
// Controls run on this file (2026-11-15), each failing the named test:
// - a NaN in the graphics processor's output passed as no gap (`Math.max` over the gaps) →
//   "the largest gap";
// - the graphics processor kept when it is slower → "the choice";
// - answers that differ kept when it is faster (the tolerance not asked) → "the choice".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GPU_TOLERANCE, gpuNoteText, gpuVerdict, maxDiff } from '../../../../src/core/engine/gpu.ts';

test('the largest gap between two backends’ outputs; a shape that differs or a number that isn’t one is no match', () => {
  assert.equal(maxDiff([[1, 2, 3]], [[1, 2, 3]]), 0);
  assert.ok(Math.abs(maxDiff([[1, 2, 3], [0.5]], [[1, 2.25, 3], [0.4]]) - 0.25) < 1e-12);
  assert.equal(maxDiff([new Float32Array([1, 2])], [new Float32Array([1, 2])]), 0);
  assert.equal(maxDiff([[1, 2]], [[1, 2, 3]]), Infinity);
  assert.equal(maxDiff([[1], [2]], [[1]]), Infinity);
  assert.equal(maxDiff([[1, 2]], [[1, NaN]]), Infinity);
  assert.equal(maxDiff([[NaN, 2]], [[1, 2]]), Infinity);
  assert.equal(maxDiff([[1, 2]], [[Infinity, 2]]), Infinity);
  assert.equal(maxDiff([], []), 0);
});

test('the choice: the graphics processor when its answers are the processor’s and it is faster', () => {
  assert.deepEqual(gpuVerdict({ diff: 0.00003, cpuMs: 64, gpuMs: 9 }), { used: true, gpuMs: 9, cpuMs: 64, diff: 0.00003 });
  // No faster, or just as fast: the processor.
  assert.deepEqual(gpuVerdict({ diff: 0.00003, cpuMs: 64, gpuMs: 80 }), { used: false, reason: 'it is no faster here', gpuMs: 80, cpuMs: 64, diff: 0.00003 });
  assert.equal(gpuVerdict({ diff: 0, cpuMs: 64, gpuMs: 64 }).used, false);
  // The tests' software adapter is never faster: taken all the same when asked.
  assert.equal(gpuVerdict({ diff: 0.00003, cpuMs: 64, gpuMs: 1000 }, true).used, true);
  // Answers that differ are never taken, however fast.
  const off = gpuVerdict({ diff: 0.4, cpuMs: 64, gpuMs: 9 }, true);
  assert.equal(off.used, false);
  assert.equal(off.reason, 'its answers differ from the processor’s (by 0.40)');
  assert.equal(gpuVerdict({ diff: GPU_TOLERANCE, cpuMs: 64, gpuMs: 9 }).used, true);
  assert.equal(gpuVerdict({ diff: GPU_TOLERANCE * 1.01, cpuMs: 64, gpuMs: 9 }).used, false);
  const broken = gpuVerdict({ diff: Infinity, cpuMs: 64, gpuMs: 9 }, true);
  assert.deepEqual(broken, { used: false, reason: 'its answers aren’t numbers', gpuMs: 9, cpuMs: 64 });
  assert.equal(gpuVerdict({ diff: NaN, cpuMs: 64, gpuMs: 9 }).used, false);
});

test('the note in words, for the settings', () => {
  assert.equal(gpuNoteText('Lc0', undefined), 'Lc0: not started yet.');
  assert.equal(gpuNoteText('Lc0', { used: true, gpuMs: 9.26, cpuMs: 64.4, diff: 0 }), 'Lc0: on the graphics processor, 9.3 ms a run against 64 on the processor.');
  // A start taken on trust has no timings.
  assert.equal(gpuNoteText('Lc0', { used: true }), 'Lc0: on the graphics processor.');
  assert.equal(gpuNoteText('Maia', { used: false, reason: 'it is no faster here', gpuMs: 120, cpuMs: 80 }), 'Maia: on the processor (it is no faster here: 120 ms a run against 80 on the processor).');
  assert.equal(gpuNoteText('Maia', { used: false, reason: 'this browser has no WebGPU' }), 'Maia: on the processor (this browser has no WebGPU).');
  assert.equal(gpuNoteText('Maia', { used: false }), 'Maia: on the processor (the graphics processor wasn’t used).');
});
