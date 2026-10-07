// The variation checklist (PLAN.md §5.62): the same variations, reserve and gaps as mistake-lab's
// own `generateTodoVariations` on every case of test/fixtures/games/checklist.json (an 11-line
// White study, the explorer's answers at its opponent's positions; recorded by
// mistake-lab-checklist.cjs at c525403), the d'Hondt apportionment's nesting, an exclusion refilled
// from the reserve, and the completion rules.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the apportionment's cap left out → "mistake-lab’s variations" (first at "three slots: reserve");
// - the covered replies' shares not renormalised among themselves → "mistake-lab’s variations".
// (The reserve's dedup against the list needs a transposed leaf, which this study has none of.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apportionSlots, completedPresets, excludeVariation, generateChecklist, presetOpen, presetStats, type StudyMoves } from '../../../../src/core/games/checklist.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { addLine, newChapter } from '../../../../src/core/study/ops.ts';
import type { PositionKey } from '../../../../src/core/chess/positionKey.ts';

interface Fixture {
  color: 'white';
  lines: string[];
  explorer: Record<string, { uci: string; san: string; white: number; draws: number; black: number }[]>;
  cases: { name: string; targetPly: number; maxVariations: number; exclude: string[]; expected: { variations: [string, string, number][]; reserve: [string, string, number][]; gaps: [string, number][] } }[];
}
const fx = JSON.parse(readFileSync(new URL('../../../fixtures/games/checklist.json', import.meta.url), 'utf8')) as Fixture;

const chapters = fx.lines.map((l, i) => {
  const made = newChapter(`Ch${String(i).padStart(2, '0')}xxxx`.slice(0, 8), 'Rep', `L${i}`, 'white');
  assert.ok(made.ok);
  const added = addLine(made.value, [], l.split(' '));
  assert.ok(added.ok);
  return added.value.chapter;
});
const index = indexStudies([{ sid: 'Rep00001', kind: 'repertoire', chapters }]);
const study: StudyMoves = {
  moveAt: (key) => index.positions.get(key)?.own.keys().next().value,
  covers: (key) => (index.positions.get(key)?.own.size ?? 0) > 0,
};
const probs = async (fen: string) => {
  const moves = fx.explorer[fen.split(' ').slice(0, 4).join(' ')] ?? [];
  const total = moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
  const out = new Map<string, number>();
  for (const m of moves) {
    const p = (m.white + m.draws + m.black) / total;
    out.set(m.uci, p);
    out.set(`s:${m.san.replace(/[+#]/g, '')}`, p);
  }
  return out;
};
const row = (v: { leafKey: string; lineSan: string[]; cumProb: number }) => [v.leafKey, v.lineSan.join(' '), Number(v.cumProb.toFixed(10))];

test('mistake-lab’s variations, reserve and gaps', async () => {
  for (const c of fx.cases) {
    const r = await generateChecklist('white', study, probs, { targetPly: c.targetPly, maxVariations: c.maxVariations, exclude: new Set(c.exclude) });
    assert.deepEqual(r.variations.map(row), c.expected.variations, `${c.name}: variations`);
    assert.deepEqual(r.reserve.map(row), c.expected.reserve, `${c.name}: reserve`);
    assert.deepEqual(
      r.gaps.map((g) => [g.lineSan.join(' '), Number(g.reachProb.toFixed(10))]),
      c.expected.gaps,
      `${c.name}: gaps`,
    );
  }
});

test('the apportionment: d’Hondt, capped, its selections nested as the quota grows', () => {
  // Ties go to the earlier child (a strict comparison, as mistake-lab's).
  assert.deepEqual(apportionSlots(5, [{ share: 0.6, cap: 10 }, { share: 0.3, cap: 10 }, { share: 0.1, cap: 10 }]), [4, 1, 0]);
  assert.deepEqual(apportionSlots(5, [{ share: 0.6, cap: 1 }, { share: 0.3, cap: 10 }, { share: 0.1, cap: 10 }]), [1, 3, 1]);
  assert.deepEqual(apportionSlots(9, [{ share: 0.5, cap: 2 }, { share: 0.5, cap: 2 }]), [2, 2]);
  for (let q = 1; q < 12; q++) {
    const a = apportionSlots(q, [{ share: 0.5, cap: 4 }, { share: 0.3, cap: 5 }, { share: 0.2, cap: 3 }]);
    const b = apportionSlots(q + 1, [{ share: 0.5, cap: 4 }, { share: 0.3, cap: 5 }, { share: 0.2, cap: 3 }]);
    assert.ok(a.every((x, i) => x <= b[i]!), `nested at ${q}`);
  }
});

test('an exclusion refilled from the reserve, in its order', async () => {
  const list = await generateChecklist('white', study, probs, { targetPly: 0, maxVariations: 3 });
  const out = list.variations[0]!.leafKey;
  const next = excludeVariation(list, out, new Set([out]));
  assert.deepEqual(
    next.map((v) => v.lineSan.join(' ')),
    [...list.variations.slice(1).map((v) => v.lineSan.join(' ')), list.reserve[0]!.lineSan.join(' ')],
  );
  // Regenerated with the exclusion, the leaf is gone and its slot goes elsewhere.
  const again = await generateChecklist('white', study, probs, { targetPly: 0, maxVariations: 3, exclude: new Set([out]) });
  assert.ok(!again.variations.some((v) => v.leafKey === (out as PositionKey)));
  assert.equal(again.variations.length, 3);
});

test('completion: a win per preset; the chips’ last five, a draw half; a preset opens once the one before is done', () => {
  const results = [
    { res: 'loss', preset: 'easy' },
    { res: 'win', preset: 'easy' },
    { res: 'draw', preset: 'medium' },
    { res: 'win' },
    { res: 'win', preset: 'bogus' },
    ...Array.from({ length: 6 }, (_, i) => ({ res: i < 5 ? 'loss' : 'draw', preset: 'hard' })),
  ];
  const done = completedPresets(results);
  assert.deepEqual([...done], ['easy']);
  const st = presetStats(results);
  assert.deepEqual(st.easy, { n: 2, wins: 1, rate: 0.5 });
  assert.deepEqual(st.medium, { n: 1, wins: 0.5, rate: 0.5 });
  assert.deepEqual(st.hard, { n: 5, wins: 0.5, rate: 0.1 });
  assert.equal(presetOpen('easy', new Set()), true);
  assert.equal(presetOpen('medium', new Set()), false);
  assert.equal(presetOpen('medium', done), true);
  assert.equal(presetOpen('hard', done), false);
});
