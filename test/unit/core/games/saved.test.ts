// Saved items (PLAN.md §5.56): the items read back from `saved` events, a sequence's lines from the
// analysis board's tree, their check against the engine's lines (the same warnings as mistake-lab's
// own `validateSequenceLines` on every case of test/fixtures/games/sequences.json, which
// mistake-lab-sequences.cjs recorded from its code at c525403), the dedup rules, and the items.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the 5-point threshold at 2 → "the same warnings as mistake-lab’s" (first at the case "uncovered");
// - a position with one engine line not listed → "the same warnings as mistake-lab’s" ("one line only").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addLine, newChapter } from '../../../../src/core/study/ops.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { parseLog } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { practiceMistakeItem, practiceMistakeSaved, readSavedItem, savedItems, sequenceItem, sequenceLines, sequenceSaved, validateSequence } from '../../../../src/core/games/saved.ts';
import { deckOf } from '../../../../src/core/games/deck.ts';

interface Case {
  name: string;
  startFen: string;
  lines: string[][];
  pvs: Record<string, { move: string; cp: number }[]>;
  mlLines: { uci: string; san: string; isUser: boolean; _parentFen: string }[][];
  expected: { warnings: { kind: string; san: string }[]; unverified: { kind: string; san?: string }[] };
}
const cases = JSON.parse(readFileSync(new URL('../../../fixtures/games/sequences.json', import.meta.url), 'utf8')) as Case[];

function chapterOf(startFen: string, lines: string[][]): Chapter {
  const made = newChapter('x', 'Analysis board', 'Analysis board', 'white', startFen);
  assert.ok(made.ok);
  let c = made.value;
  for (const l of lines) {
    const r = addLine(c, [], l);
    assert.ok(r.ok);
    c = r.value.chapter;
  }
  return c;
}

test('a sequence’s lines: the main line first, every root-to-leaf path, the user’s moves marked', () => {
  for (const c of cases) {
    const lines = sequenceLines(c.startFen, chapterOf(c.startFen, c.lines).root, 'white');
    assert.deepEqual(
      lines.map((l) => l.map((m) => ({ uci: m.uci, san: m.san, isUser: m.user, _parentFen: m.before }))),
      c.mlLines.map((l) => l.map((m) => ({ uci: m.uci, san: m.san, isUser: m.isUser, _parentFen: m._parentFen }))),
      c.name,
    );
  }
  // Castling is standard UCI, and the paths name the tree's nodes.
  const F = cases[0]!.startFen;
  const lines = sequenceLines(F, chapterOf(F, [['O-O', 'Nf6', 'd3']]).root, 'white');
  assert.equal(lines[0]![0]!.uci, 'e1g1');
  assert.deepEqual(lines[0]![2]!.path, ['O-O', 'Nf6', 'd3']);
  assert.deepEqual(sequenceLines(F, chapterOf(F, []).root, 'white'), []);
});

test('the same warnings as mistake-lab’s', () => {
  for (const c of cases) {
    const lines = sequenceLines(c.startFen, chapterOf(c.startFen, c.lines).root, 'white');
    const { warnings, unverified } = validateSequence(lines, (fen) => c.pvs[fen]);
    assert.deepEqual(
      warnings.map((w) => ({ kind: w.kind, san: w.san })),
      c.expected.warnings,
      c.name,
    );
    assert.deepEqual(
      unverified.map((u) => (u.kind === 'single' ? { kind: u.kind } : { kind: u.kind, san: u.san })),
      c.expected.unverified,
      c.name,
    );
  }
  // A warning's path: after the flagged move, or the position for an uncovered one.
  const c = cases.find((x) => x.name === 'loses, and unchecked')!;
  const { warnings } = validateSequence(sequenceLines(c.startFen, chapterOf(c.startFen, c.lines).root, 'white'), (fen) => c.pvs[fen]);
  assert.deepEqual(
    warnings.map((w) => w.path),
    [['c3'], []],
  );
});

const F = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

test('a sequence’s item, its dedup, and reading it back', () => {
  const lines = sequenceLines(F, chapterOf(F, [['c3', 'Nf6', 'd4'], ['c3', 'd6', 'd4']]).root, 'white');
  assert.equal(sequenceItem({ startFen: F, color: 'black', lines: lines.map((l) => l.map((m) => ({ ...m, user: !m.user }))), wpDrop: 12, now: 1, rand: 'x' }), undefined, 'must start with the user’s move');
  const item = sequenceItem({ startFen: F, color: 'white', lines, wpDrop: -12.5, now: 1790000000000, rand: 'ab12c', from: 'abc_7' })!;
  assert.equal(item.pid, '_practice_tactic_1790000000000_ab12c_t6');
  assert.equal(item.ply, 7);
  assert.equal(item.wpDrop, 12.5);
  assert.equal(item.sequence, true);
  assert.deepEqual(item.lines[1], [
    { uci: 'c2c3', san: 'c3', user: true },
    { uci: 'd7d6', san: 'd6', user: false },
    { uci: 'd2d4', san: 'd4', user: true },
  ]);
  const back = readSavedItem(JSON.parse(JSON.stringify(item)));
  assert.deepEqual(back, item);
  assert.equal(sequenceSaved([item], F, lines[0]!), true);
  assert.equal(sequenceSaved([item], F, lines[0]!.slice(0, 1)), false);
});

test('a practice mistake: past 2 points only, deduplicated by position and move', () => {
  const move = { fenBefore: F, san: 'd3', uci: 'd2d3', wpDrop: 2, cpLoss: 30, bestCp: 50 };
  assert.equal(practiceMistakeItem({ move, color: 'white', now: 5 }), undefined);
  const item = practiceMistakeItem({ move: { ...move, wpDrop: 6.4, cpLoss: 90 }, color: 'white', now: 5 })!;
  assert.equal(item.pid, '_practice_5_6');
  assert.equal(item.cpAfter, -40);
  assert.equal(practiceMistakeSaved([item], F, 'd3'), true);
  assert.equal(practiceMistakeSaved([item], F, 'c3'), false);
});

let n = 0;
const ev = (e: Record<string, unknown>, t = '2026-10-07T10:00:00.000Z'): DeviceEvent => {
  const { lines, problems } = parseLog(JSON.stringify({ v: 1, n: ++n, t, ...e }));
  assert.deepEqual(problems, []);
  return toDeviceEvents('d', lines)[0]!;
};

test('saved items from the events: the latest per card, its own card only, unreadable ones left out; in the deck unless dropped', () => {
  const m = practiceMistakeItem({ move: { fenBefore: F, san: 'd3', uci: 'd2d3', wpDrop: 6, cpLoss: 90, bestCp: 50 }, color: 'white', now: 5 })!;
  const events = new Map<string, DeviceEvent[]>([
    ['m|_practice_5_6', [ev({ k: 'saved', card: 'm|_practice_5_6', item: { ...m, wpDrop: 1 } }), ev({ k: 'saved', card: 'm|_practice_5_6', item: m }, '2026-10-07T11:00:00.000Z')]],
    ['m|other_1', [ev({ k: 'saved', card: 'm|other_1', item: m })]],
    ['m|bad_1', [ev({ k: 'saved', card: 'm|bad_1', item: { kind: 'mistake', pid: 'bad_1', gameId: 'bad', ply: 1, fenBefore: 'not a fen', color: 'white', san: 'e4', uci: 'e2e4' } })]],
    ['m|_practice_9_6', [ev({ k: 'saved', card: 'm|_practice_9_6', item: { ...m, pid: '_practice_9_6', gameId: '_practice_9' } }), ev({ k: 'drop', card: 'm|_practice_9_6', on: true })]],
  ]);
  const eventsOf = (c: string) => events.get(c) ?? [];
  const saved = savedItems(events.keys(), eventsOf);
  assert.deepEqual(
    saved.map((s) => [s.pid, s.wpDrop]),
    [
      ['_practice_9_6', 6],
      ['_practice_5_6', 6],
    ],
  );
  const deck = deckOf([], saved, eventsOf);
  assert.deepEqual(
    deck.map((d) => d.card),
    ['m|_practice_5_6'],
  );
  // Not a sequence move a drill can ask: the first move the opponent's.
  assert.equal(readSavedItem({ kind: 'tactic', pid: 'p_t1', gameId: 'p', ply: 1, fenBefore: F, color: 'white', lines: [[{ uci: 'c2c3', san: 'c3', user: false }]] }), undefined);
});
