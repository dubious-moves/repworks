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
//
// §5.130: a list kept as its event and read back the same; what a kept list shows (exclusions and
// paused lines filled from the reserve, a line the study left behind kept in its place); the walk
// over a study's active lines only. Controls (2026-10-26), each failing exactly the named test:
// - a reply the study knows on a paused line counted as a gap → "the walk over active lines only";
// - paused lines shown as active → "what a kept list shows".
//
// §5.142: lines added by hand: which the study has (a second own move, a line ending on a reply it
// only reaches), the picks read from their events, and how they join a kept list. Controls
// (2026-10-31), each failing exactly that test: the last reply needing the study's answer; a pick
// the list has shown twice; a pick of a paused list line counted twice; `reaches` over paused lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apportionSlots, completedPresets, excludeVariation, gapsOf, generateChecklist, linesOf, picksOf, presetOpen, presetStats, recordOf, shownLines, studyHasLine, studyMovesOf, studyPlays, withPicks, type StudyMoves } from '../../../../src/core/games/checklist.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { lineCard } from '../../../../src/core/progress/cards.ts';
import { markLines } from '../../../../src/core/train/paused.ts';
import { addLine, newChapter } from '../../../../src/core/study/ops.ts';
import type { PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';

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

test('a list kept as its event (§5.130): its lines, reserve and gaps read back as made', async () => {
  const list = await generateChecklist('white', study, probs, { targetPly: 0, maxVariations: 3 });
  const kept = JSON.parse(JSON.stringify(recordOf(list))) as ReturnType<typeof recordOf>;
  assert.deepEqual(linesOf(kept.lines), list.variations);
  assert.deepEqual(linesOf(kept.reserve), list.reserve);
  assert.deepEqual(gapsOf(kept.gaps), list.gaps);
  // A line with a move that isn't legal is left out, not fatal.
  assert.deepEqual(linesOf([{ m: 'e2e4 e2e4', p: 0.5 }]), []);
});

test('what a kept list shows (§5.130): exclusions and paused lines filled from the reserve, a line the study left behind in its place', async () => {
  const sides = () => 'white' as const;
  const all = studyMovesOf(index, 'Rep00001', 'white', sides, false);
  const list = await generateChecklist('white', all, probs, { targetPly: 0, maxVariations: 3 });
  const shown = (excluded: Set<string>, active: StudyMoves, everything: StudyMoves = all) => shownLines({ ...list, count: 3 }, 'white', excluded, { all: everything, active });
  const names = (r: ReturnType<typeof shown>) => r.lines.map((l) => (l.gone ? '-' : '') + l.v.lineSan.join(' '));
  const base = shown(new Set(), all);
  assert.deepEqual(names(base), list.variations.map((v) => v.lineSan.join(' ')));
  assert.equal(base.paused, 0);
  // Excluded: as `excludeVariation`.
  const out = list.variations[0]!.leafKey;
  assert.deepEqual(names(shown(new Set([out]), all)), excludeVariation(list, out, new Set([out])).map((v) => v.lineSan.join(' ')));
  // The first line's chapter paused: hidden and counted, the reserve's next line in.
  const first = list.variations[0]!;
  const ix = markLines(index, new Map(index.lines.filter((l) => first.lineSan.every((s, i) => l.path[i] === s)).map((l) => [lineCard(l.sid, l.cid, l.path), 'paused' as const]))).index;
  const active = studyMovesOf(ix, 'Rep00001', 'white', sides, true);
  assert.equal(studyPlays(active, 'white', first.lineUci), false);
  assert.equal(studyPlays(all, 'white', first.lineUci), true);
  const paused = shown(new Set(), active);
  assert.equal(paused.paused, 1);
  assert.deepEqual(names(paused), [...list.variations.slice(1), list.reserve[0]!].map((v) => v.lineSan.join(' ')));
  // A study that no longer plays the line (the same move taken out everywhere): kept, struck through.
  const gone = shown(new Set(), active, active);
  assert.deepEqual(names(gone), [`-${first.lineSan.join(' ')}`, ...list.variations.slice(1).map((v) => v.lineSan.join(' '))]);
});

test('the walk over active lines only (§5.130): a paused branch is neither a line nor an uncovered reply, its slots its sibling’s', async () => {
  const sides = () => 'white' as const;
  const all = studyMovesOf(index, 'Rep00001', 'white', sides, false);
  // The same walk as the fixture's study.
  assert.deepEqual(await generateChecklist('white', all, probs, { targetPly: 0, maxVariations: 3 }), await generateChecklist('white', study, probs, { targetPly: 0, maxVariations: 3 }));
  const list = await generateChecklist('white', all, probs, { targetPly: 0, maxVariations: 30 });
  const first = list.variations[0]!;
  const ix = markLines(index, new Map(index.lines.filter((l) => first.lineSan.every((s, i) => l.path[i] === s)).map((l) => [lineCard(l.sid, l.cid, l.path), 'paused' as const]))).index;
  const active = studyMovesOf(ix, 'Rep00001', 'white', sides, true);
  const again = await generateChecklist('white', active, probs, { targetPly: 0, maxVariations: 30 });
  assert.ok(!again.variations.some((v) => v.leafKey === first.leafKey));
  assert.ok(!again.gaps.some((g) => first.lineUci.join(' ').startsWith(g.lineUci.join(' '))));
  assert.equal(again.variations.length, list.variations.length - 1);
  // Another study, or the other side, has none of these moves.
  const none = studyMovesOf(index, 'Rep00002', 'white', sides, false);
  assert.equal(none.covers(first.leafKey), false);
  assert.equal(studyMovesOf(index, 'Rep00001', 'black', sides, false).moveAt(list.variations[0]!.leafKey), undefined);
});


/** UCI moves from the start, for SAN moves. */
function ucis(sans: string): string[] {
  const pos = Chess.default();
  return sans.split(' ').map((san) => {
    const m = parseSan(pos, san) as NormalMove;
    const uci = standardUci(pos, m);
    pos.play(m);
    return uci;
  });
}

test('lines added by hand (§5.142): which the study has, the picks from their events, and how they join a kept list', async () => {
  const sides = () => 'white' as const;
  // The fixture's study, and a chapter ending on Black's move after a second White move (4.Bc4, where the walk takes 4.Bb5).
  const extra = newChapter('Bc4xxxxx', 'Rep', 'Bc4', 'white');
  assert.ok(extra.ok);
  const bc4 = addLine(extra.value, [], 'e4 e5 Nf3 Nc6 Bc4 Bc5'.split(' '));
  assert.ok(bc4.ok);
  // And one ending on 4...Nge7, a reply only it meets.
  const extra2 = newChapter('Nge7xxxx', 'Rep', 'Nge7', 'white');
  assert.ok(extra2.ok);
  const nge7 = addLine(extra2.value, [], 'e4 e5 Nf3 Nc6 Bb5 Nge7'.split(' '));
  assert.ok(nge7.ok);
  const ix = indexStudies([{ sid: 'Rep00001', kind: 'repertoire', chapters: [...chapters, bc4.value.chapter, nge7.value.chapter] }]);
  const all = studyMovesOf(ix, 'Rep00001', 'white', sides, false);
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O')), true);
  // Ending on a reply the study answers, or one it only reaches (the chapter's end).
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 Nf3 Nc6 Bb5 a6')), true);
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 Nf3 Nc6 Bc4 Bc5')), true);
  // Not the walk's line: 4.Bc4 is the study's second move there.
  assert.equal(studyPlays(all, 'white', ucis('e4 e5 Nf3 Nc6 Bc4')), true);
  assert.equal(studyMovesOf(ix, 'Rep00001', 'white', sides, false).moveAt(linesOf([{ m: ucis('e4 e5 Nf3 Nc6').join(' '), p: 0 }])[0]!.leafKey), ucis('e4 e5 Nf3 Nc6 Bb5')[4]);
  // A move the study doesn't play, a reply it never meets, nothing, the other side.
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 d4')), false);
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 Nf3 a6')), false);
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 Nf3 Nc6 Bc4 Nf6')), false);
  assert.equal(studyHasLine(all, 'white', []), false);
  assert.equal(studyHasLine(studyMovesOf(ix, 'Rep00001', 'black', sides, false), 'black', ucis('e4 e5 Nf3 Nc6 Bc4 Bc5')), false);

  // The picks: per side, the latest event per line deciding, the most recently added last.
  const a = 'e2e4 e7e5';
  const b = 'e2e4 c7c5';
  assert.deepEqual(
    picksOf(
      [
        { color: 'white', m: a, on: true },
        { color: 'white', m: b, on: true },
        { color: 'black', m: 'd2d4', on: true },
        { color: 'white', m: a, on: false },
        { color: 'white', m: a, on: true },
        { color: 'white', m: 'g1f3', on: false },
      ],
      'white',
    ),
    [b, a],
  );

  // Joining a kept list: one it has is marked there; the others follow, gone or paused as the study says.
  const list = await generateChecklist('white', all, probs, { targetPly: 0, maxVariations: 3 });
  const kept = shownLines({ ...list, count: 3 }, 'white', new Set(), { all, active: all });
  const own = linesOf([{ m: ucis('e4 e5 Nf3 Nc6 Bc4 Bc5').join(' '), p: 0 }])[0]!;
  const off = linesOf([{ m: ucis('e4 e5 d4').join(' '), p: 0 }])[0]!;
  const joined = withPicks(kept, [list.variations[1]!, own, off, list.variations[1]!], 'white', { all, active: all });
  assert.deepEqual(
    joined.lines.map((l) => [l.v.lineSan.join(' '), l.added ?? '', l.gone]),
    [
      [list.variations[0]!.lineSan.join(' '), '', false],
      [list.variations[1]!.lineSan.join(' '), 'too', false],
      [list.variations[2]!.lineSan.join(' '), '', false],
      ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'only', false],
      ['e4 e5 d4', 'only', true],
    ],
  );
  assert.equal(joined.paused, 0);
  // Exclusions don't hide a pick; the list's line excluded, the pick shows on its own.
  const out = shownLines({ ...list, count: 3 }, 'white', new Set([list.variations[1]!.leafKey]), { all, active: all });
  const picked = withPicks(out, [list.variations[1]!], 'white', { all, active: all });
  assert.deepEqual(picked.lines.at(-1), { v: list.variations[1]!, gone: false, added: 'only' });
  // The Bc4 chapter paused: its pick hidden and counted; a pick of a list line hidden as paused counted once.
  const pausedIx = markLines(ix, new Map(ix.lines.filter((l) => l.cid === 'Bc4xxxxx' || l.cid === 'Nge7xxxx' || list.variations[0]!.lineSan.every((s, i) => l.path[i] === s)).map((l) => [lineCard(l.sid, l.cid, l.path), 'paused' as const]))).index;
  const active = studyMovesOf(pausedIx, 'Rep00001', 'white', sides, true);
  const half = shownLines({ ...list, count: 3 }, 'white', new Set(), { all, active });
  assert.equal(half.paused, 1);
  const hidden = withPicks(half, [own, list.variations[0]!], 'white', { all, active });
  assert.equal(hidden.paused, 2);
  // A reply met only on a paused line: the line up to it active, the line paused.
  assert.equal(studyHasLine(all, 'white', ucis('e4 e5 Nf3 Nc6 Bb5 Nge7')), true);
  assert.equal(studyHasLine(active, 'white', ucis('e4 e5 Nf3 Nc6 Bb5 Nge7')), false);
  assert.ok(!hidden.lines.some((l) => l.v.leafKey === own.leafKey || l.v.leafKey === list.variations[0]!.leafKey));
});
