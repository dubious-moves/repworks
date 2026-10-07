// The engine line after a game card's move (PLAN.md §6, item 1): built, stepped, extended and
// branched with the same states as mistake-lab's own code after every step, on each case of
// test/fixtures/games/engineline.json (`buildEngineLine`, `lineStep`, `goToMainLineMove`,
// `goToAltLineMove`, `handleEngineLineBranch`, `extendEngineLine`, recorded by
// mistake-lab-engineline.cjs at c525403 with a stand-in engine whose answers are in the fixture).
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - stepping back into an alternative's shared start returning to the main line (as the
//   reference's summary says, not as its code does) → "mistake-lab’s states after every step"
//   (the branches case, its third step);
// - a branch inside an alternative added as a new alternative instead of replacing the rest of it
//   → "mistake-lab’s states after every step" (the branches case, its ninth step) and "a branch
//   inside an alternative replaces its rest; a branch elsewhere adds one".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addBranch, branch, buildEngineLine, endFen, extend, goToAlt, goToMain, lineFen, lineScore, step, type EngineLine } from '../../../../src/core/games/engineLine.ts';
import { positionOf } from '../../../../src/core/storm/walk.ts';

interface Snap {
  idx: number;
  alt: number;
  fen: string;
  main: string[];
  alts: { branchIdx: number; sans: string[]; cpWhite: number | null }[];
  cpWhite: number | null;
  retried: number;
}
const j = JSON.parse(readFileSync(new URL('../../../fixtures/games/engineline.json', import.meta.url), 'utf8')) as {
  cases: { name: string; baseFen: string; user: string; cont?: string; wrongMove?: boolean; startIdx?: number; expected: { cont: string; cpWhite: number; ops: (string | number)[][]; steps: (Snap | null)[] } }[];
  engine: Record<string, { moves: string; cp: number }>;
};

const keyOf = (fen: string) => fen.split(' ').slice(0, 3).join(' ');
/** The stand-in engine's answer at `fen`: its line and its score for White. */
function engine(fen: string): { pv: string[]; cpWhite: number } {
  const a = j.engine[keyOf(fen)];
  assert.ok(a, `the engine was asked at ${fen}`);
  const white = positionOf(fen)!.turn === 'white';
  return { pv: a.moves.split(' ').filter(Boolean), cpWhite: white ? a.cp : -a.cp };
}
const snap = (l: EngineLine | undefined, retried: number): Snap | null =>
  l
    ? {
        idx: l.currentIdx,
        alt: l.activeAlt,
        fen: keyOf(lineFen(l)),
        main: l.moves.map((m) => m.san),
        alts: l.alternatives.map((a) => ({ branchIdx: a.branchIdx, sans: a.moves.map((m) => m.san), cpWhite: a.cpWhite })),
        cpWhite: l.cpWhite,
        retried,
      }
    : null;

test('mistake-lab’s states after every step', () => {
  for (const c of j.cases) {
    const e = c.expected;
    let line = buildEngineLine(c.baseFen, c.user, e.cont.split(' ').filter(Boolean), e.cpWhite, { wrongMove: !!c.wrongMove, ...(c.startIdx != null ? { startIdx: c.startIdx } : {}) });
    let retried = 0;
    assert.deepEqual(snap(line, retried), e.steps[0], `${c.name}: built`);
    e.ops.forEach((op, i) => {
      if (!line) return;
      if (op[0] === 'step') {
        const s = step(line, op[1] as number);
        if (s.kind === 'go') line = s.line;
        else if (s.kind === 'retry') retried++;
        else if (s.kind === 'extend') {
          const at = endFen(line);
          if (at) {
            const a = engine(at);
            line = extend(line, at, a.pv, a.cpWhite);
          }
        }
      } else if (op[0] === 'main') line = goToMain(line, op[1] as number);
      else if (op[0] === 'alt') line = goToAlt(line, op[1] as number, op[2] as number);
      else {
        const b = branch(line, op[1] as string);
        if (b.kind === 'follow') line = b.reply !== undefined ? { ...b.line, currentIdx: b.reply } : b.line;
        else if (b.kind === 'new') {
          const a = engine(b.fen);
          line = addBranch(line, b, a.pv, a.cpWhite);
        }
      }
      assert.deepEqual(snap(line, retried), e.steps[i + 1], `${c.name}: step ${i + 1} ${JSON.stringify(op)}`);
    });
  }
});

const ITALIAN = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

test('a branch inside an alternative replaces its rest; a branch elsewhere adds one', () => {
  let line = buildEngineLine(ITALIAN, 'f3e5', ['d4f5', 'd2d3', 'f5d6', 'c4a6', 'g8h6'], 180, { wrongMove: true })!;
  const b = branch(line, 'a2a3');
  assert.equal(b.kind, 'new');
  line = addBranch(line, b as Extract<typeof b, { kind: 'new' }>, ['c7c5', 'd1e2'], 50);
  assert.equal(line.alternatives.length, 1);
  assert.deepEqual([line.activeAlt, line.currentIdx, lineScore(line)], [0, 3, 50]);
  const inner = branch(line, 'd2d3');
  line = addBranch(line, inner as Extract<typeof inner, { kind: 'new' }>, ['a7a5'], -20);
  assert.equal(line.alternatives.length, 1);
  assert.deepEqual(line.alternatives[0]!.moves.map((m) => m.san), ['a3', 'c5', 'd3', 'a5']);
  // The user stepped away while the engine searched: the branch is kept, the board stays.
  const away = branch(goToMain(line, 0), 'c7c5');
  assert.equal(away.kind, 'new');
  const moved = addBranch(goToMain(line, 2), away as Extract<typeof away, { kind: 'new' }>, ['d2d3'], 0);
  assert.deepEqual([moved.alternatives.length, moved.activeAlt, moved.currentIdx], [2, -1, 2]);
});

test('castling is kept as standard UCI; an illegal move is refused', () => {
  const line = buildEngineLine('r3k2r/1P6/8/8/8/8/p7/1R2K2R w Kkq - 0 1', 'e1h1', ['a2a1q', 'b1a1'], 0)!;
  assert.deepEqual(line.moves.map((m) => m.uci), ['e1g1', 'a2a1q', 'b1a1']);
  assert.equal(branch(line, 'e2e4').kind, 'illegal');
  assert.equal(buildEngineLine(ITALIAN, 'e1e8', ['d4f5'], 0), undefined);
});
