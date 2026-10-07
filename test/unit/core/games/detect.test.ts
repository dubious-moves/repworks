// Tactics detected after a practice game (PLAN.md §6, item 3): the opponent's loss read back, the
// candidates, the tactic tree walked, its lines deduplicated and Maia's line, with the same answers
// as mistake-lab's own code on every game of test/fixtures/games/tactics.json
// (`applySilentEvalToMove` with `detectTacticCandidate`, `tacticBuildBestChain`,
// `tacticDedupeAltLines`, `tacticGenerateMaiaLine`, recorded by mistake-lab-tactics.cjs at c525403
// with a stand-in Stockfish and Maia whose answers are in the fixture).
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the ply counted as elsewhere ((move − 1) × 2, + 1 for Black) instead of the detection's own
//   (move × 2, − 1 for White) → "the ply's edge …" (no fixture game sits on the edge);
// - the opponent's alternatives taken without the 15-point cap → "the walk, the lines and Maia's
//   line, …" and "a detected tactic saved …" (its lines).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChain, dedupeLines, maiaLine, opponentLoss, practiceTacticItem, scanCandidate, tacticCandidates, tacticSaved, type JudgedPlay, type Pv } from '../../../../src/core/games/detect.ts';
import { positionOf, fenOf } from '../../../../src/core/storm/walk.ts';
import { parseUciMove } from '../../../../src/core/chess/uci.ts';
import { readSavedItem } from '../../../../src/core/games/saved.ts';

interface Line {
  uci: string;
  san: string;
  user: boolean;
  source?: 'maia';
}
const j = JSON.parse(readFileSync(new URL('../../../fixtures/games/tactics.json', import.meta.url), 'utf8')) as {
  games: {
    name: string;
    baseFen: string;
    color: 'white' | 'black';
    moves: { uci: string; user: boolean; pvs?: [number, string][]; cpLoss?: number }[];
    expected: {
      opponent: [number, number, number, string][];
      candidates: { moveIdx: number; gapWp: number; oppCpLoss: number | null; bestMoveUci: string; primary: Line[]; raw: Line[][]; deduped?: Line[][]; maia?: Line[] | null; lines?: Line[][]; userFound?: boolean }[];
    };
  }[];
  engine: Record<string, [number, string][]>;
  maia: Record<string, string | null>;
};

// Board, side and castling: chess.js writes an en passant square after every double step, chessops only a capturable one.
const keyOf = (fen: string) => fen.split(' ').slice(0, 3).join(' ');
const analyse = async (fen: string, lines: number): Promise<Pv[] | null> => {
  const a = j.engine[keyOf(fen)];
  assert.ok(a, `the engine was asked at ${fen}`);
  return a.length ? a.slice(0, lines).map(([cp, firstMove]) => ({ cp, firstMove })) : null;
};
const maia = async (fen: string) => {
  assert.ok(keyOf(fen) in j.maia, `Maia was asked at ${fen}`);
  return j.maia[keyOf(fen)]!;
};
const slim = (l: readonly { uci: string; san: string; isUser: boolean; source?: 'maia' }[]): Line[] => l.map((m) => ({ uci: m.uci, san: m.san, user: m.isUser, ...(m.source ? { source: m.source } : {}) }));

/** A fixture game as the practice game's judged moves: the lines before each user move, and the score after it. */
function played(g: (typeof j.games)[number]): JudgedPlay[] {
  const pos = positionOf(g.baseFen)!;
  return g.moves.map((m) => {
    const fenBefore = fenOf(pos);
    pos.play(parseUciMove(pos, m.uci)!);
    const pvs = m.pvs?.map(([cp, firstMove]) => ({ cp, firstMove }));
    return { uci: m.uci, isUser: m.user, fenBefore, ...(pvs ? { pvs, afterCp: pvs[0]!.cp - (m.cpLoss ?? 0) } : {}) };
  });
}

test('the candidates and the opponent’s losses, as mistake-lab’s', () => {
  for (const g of j.games) {
    const moves = played(g);
    const cands = tacticCandidates(moves, g.color);
    assert.deepEqual(
      cands.map((c) => ({ moveIdx: c.moveIdx, gapWp: c.gapWp, oppCpLoss: c.oppCpLoss, bestMoveUci: c.bestMoveUci })),
      g.expected.candidates.map((c) => ({ moveIdx: c.moveIdx, gapWp: c.gapWp, oppCpLoss: c.oppCpLoss, bestMoveUci: c.bestMoveUci })),
      g.name,
    );
    // The opponent's moves judged from the user's scores around them.
    const opp = moves.flatMap((m, i) => {
      const prevUser = moves[i - 1];
      const next = moves[i + 1];
      if (m.isUser || !prevUser?.isUser || prevUser.afterCp === undefined || !next?.pvs) return [];
      const l = opponentLoss(prevUser.afterCp, next.pvs[0]!.cp);
      return [[i, l.cpLoss, l.wpDrop, l.classification]];
    });
    assert.deepEqual(opp, g.expected.opponent, `${g.name}: the opponent's moves`);
  }
});

test('the walk, the lines and Maia’s line, as mistake-lab’s', async () => {
  for (const g of j.games) {
    const moves = played(g);
    for (const [k, cand] of tacticCandidates(moves, g.color).entries()) {
      const e = g.expected.candidates[k]!;
      const r = await buildChain(analyse, cand);
      assert.deepEqual(slim(r.moves), e.primary, `${g.name} @${cand.moveIdx}: the main line`);
      assert.deepEqual(r.alternativeLines.map(slim), e.raw, `${g.name} @${cand.moveIdx}: the alternatives`);
      if (!e.lines) {
        assert.equal(await scanCandidate(analyse, maia, cand, moves[cand.moveIdx]!.uci), null, `${g.name} @${cand.moveIdx}: too short`);
        continue;
      }
      assert.deepEqual(dedupeLines(r.moves, r.alternativeLines).map(slim), e.deduped, `${g.name} @${cand.moveIdx}: deduplicated`);
      const m = await maiaLine(analyse, maia, cand.preFen, r.moves);
      assert.deepEqual(m ? slim(m) : null, e.maia, `${g.name} @${cand.moveIdx}: Maia's line`);
      const t = (await scanCandidate(analyse, maia, cand, moves[cand.moveIdx]!.uci))!;
      assert.deepEqual(t.lines.slice(1).map(slim), e.lines, `${g.name} @${cand.moveIdx}: the lines kept`);
      assert.equal(t.found, e.userFound, `${g.name} @${cand.moveIdx}: found`);
    }
  }
});

test('the ply’s edge is the detection’s own count (move × 2, less one for White)', () => {
  const pvs = [{ cp: 600, firstMove: 'g8f6' }, { cp: 0, firstMove: 'd7d6' }];
  const at = (fen: string, uci: string): JudgedPlay[] => [{ uci, isUser: true, fenBefore: fen, pvs: [{ ...pvs[0]!, firstMove: uci }, pvs[1]!], afterCp: 600 }, { uci: 'a7a6', isUser: false, fenBefore: fen }];
  // Black at move 3: 3 × 2 = 6, asked (5 by the usual count).
  assert.equal(tacticCandidates(at('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3', 'g8f6'), 'black').length, 1);
  // White at move 3: 3 × 2 − 1 = 5, too early.
  assert.equal(tacticCandidates(at('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'f1c4'), 'white').length, 0);
});

test('a detected tactic saved as an item, read back, and known as saved', async () => {
  const g = j.games[0]!;
  const moves = played(g);
  const cand = tacticCandidates(moves, g.color)[0]!;
  const t = (await scanCandidate(analyse, maia, cand, moves[cand.moveIdx]!.uci))!;
  const item = practiceTacticItem(t, { now: 1_790_000_000_000, rand: 'abcde', from: 'h|rev_1' })!;
  assert.equal(item.pid, '_practice_tactic_1790000000000_abcde_t6');
  assert.equal(item.ply, 7);
  assert.equal(item.found, true);
  assert.equal(item.lines.length, t.lines.length);
  assert.deepEqual(readSavedItem(JSON.parse(JSON.stringify(item))), item);
  assert.equal(tacticSaved([item], t), true);
  assert.equal(tacticSaved([{ ...item, fenBefore: moves[2]!.fenBefore }], t), false);
});
