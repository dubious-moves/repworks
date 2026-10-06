// The repertoire index's build time (PLAN.md §5.1): 800 lines in under 100 ms in Node. Run alone,
// after the other tests, like every timing test here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Position } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { indexStudies } from '../../src/core/repertoire/index.ts';
import type { Chapter, MoveNode } from '../../src/core/study/model.ts';
import { mulberry32 } from '../support/random.ts';

/** A chapter of a little over `leaves` lines, 16 to 24 plies deep, branching at random. */
function bigChapter(id: string, side: 'white' | 'black', leaves: number, seed: number): Chapter {
  const random = mulberry32(seed);
  let left = leaves;
  const legal = (pos: Position): NormalMove[] => {
    const out: NormalMove[] = [];
    for (const [from, dests] of pos.allDests()) for (const to of dests) out.push({ from, to });
    return out;
  };
  const grow = (pos: Position, depth: number): MoveNode[] => {
    if (depth >= 16 + Math.floor(random() * 8) || pos.isEnd()) {
      left--;
      return [];
    }
    const moves = legal(pos);
    const want = left > 0 && random() < 0.25 ? 2 : 1;
    const children: MoveNode[] = [];
    const used = new Set<string>();
    for (let i = 0; i < want; i++) {
      const move = moves[Math.floor(random() * moves.length)]!;
      const san = makeSan(pos, move);
      if (used.has(san)) continue;
      used.add(san);
      const after = pos.clone();
      after.play(move);
      children.push({ san, comments: [], shapes: [], nags: [], startingComments: [], children: grow(after, depth + 1) });
    }
    return children;
  };
  const root = { comments: [], shapes: [], nags: [], startingComments: [], children: grow(Chess.default(), 0) };
  return { id, headers: [['Orientation', side]], root };
}

test('800 lines index in under 100 ms', () => {
  const chapters = Array.from({ length: 40 }, (_, i) => bigChapter(`Big${String(i).padStart(5, '0')}`, i % 2 ? 'black' : 'white', 20, i + 1));
  let best = Infinity;
  let lines = 0;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    lines = indexStudies([{ sid: 'Perf0001', kind: 'repertoire', chapters }]).lines.length;
    best = Math.min(best, performance.now() - start);
  }
  console.log(`index of ${lines} lines: ${best.toFixed(1)} ms (best of 3)`);
  assert.ok(lines >= 800, `only ${lines} lines`);
  assert.ok(best < 100, `${best.toFixed(1)} ms`);
});
