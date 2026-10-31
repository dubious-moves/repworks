// Lc0 vs Maia from a position (PLAN.md §5.144): people's move from the database, blended with
// Maia under BLEND_GAMES games, and the line played out with fake Lc0, database and Maia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { BLEND_GAMES, dbWeight, modelContinuation, opponentPick, type DbMoves } from '../../../../src/core/lc0/continuation.ts';
import type { SearchResult } from '../../../../src/core/lc0/search.ts';
import { parseUciMove } from '../../../../src/core/chess/uci.ts';

const pos = (fen: string): Position => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const START = Chess.default();
const db = (total: number, moves: [string, string, number][]): DbMoves => ({ total, moves: moves.map(([uci, san, games]) => ({ uci, san, games })) });

test('from BLEND_GAMES games, the database’s most played move alone', () => {
  const p = opponentPick(START, db(BLEND_GAMES, [['e2e4', 'e4', 40], ['d2d4', 'd4', 45], ['g1f3', 'Nf3', 15]]), [{ uci: 'e2e4', san: 'e4', prob: 0.9 }]);
  assert.equal(p?.san, 'd4');
  assert.equal(p?.source, 'db');
  assert.equal(p?.weight, 1);
  assert.equal(p?.share, 0.45);
  assert.equal(p?.games, BLEND_GAMES);
});

test('under it, the shares weigh games / BLEND_GAMES and Maia the rest; none, Maia alone', () => {
  const maia = [
    { uci: 'e2e4', san: 'e4', prob: 0.6 },
    { uci: 'd2d4', san: 'd4', prob: 0.3 },
  ];
  // 50 games: half each. d4 0.5·0.8 + 0.5·0.3 = 0.55 against e4 0.5·0.2 + 0.5·0.6 = 0.40.
  const half = opponentPick(START, db(50, [['d2d4', 'd4', 40], ['e2e4', 'e4', 10]]), maia)!;
  assert.equal(half.san, 'd4');
  assert.equal(half.source, 'blend');
  assert.ok(Math.abs(half.prob - 0.55) < 1e-9);
  assert.equal(half.maia, 0.3);
  // 20 games: Maia weighs 0.8, and its e4 wins (0.2·0.2 + 0.8·0.6 = 0.52 against 0.2·0.8 + 0.8·0.3 = 0.40).
  assert.equal(opponentPick(START, db(20, [['d2d4', 'd4', 16], ['e2e4', 'e4', 4]]), maia)!.san, 'e4');
  const none = opponentPick(START, db(0, []), maia)!;
  assert.equal(none.san, 'e4');
  assert.equal(none.source, 'maia');
  assert.equal(opponentPick(START, undefined, maia)!.source, 'maia');
  assert.equal(dbWeight(250), 1);
  assert.equal(dbWeight(25), 0.25);
});

test('without Maia, the database however thin; neither, nothing; castling in either spelling', () => {
  assert.equal(opponentPick(START, db(3, [['g1f3', 'Nf3', 3]]), undefined)?.source, 'db');
  assert.equal(opponentPick(START, db(0, []), undefined), undefined);
  assert.equal(opponentPick(START, undefined, undefined), undefined);
  const castle = pos('r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 4 8');
  // The explorer writes e1h1; Maia e1g1: the same move.
  const p = opponentPick(castle, db(40, [['e1h1', 'O-O', 30], ['e1a1', 'O-O-O', 10]]), [{ uci: 'e1g1', san: 'O-O', prob: 0.5 }, { uci: 'h2h3', san: 'h3', prob: 0.5 }])!;
  assert.equal(p.uci, 'e1g1');
  assert.equal(p.san, 'O-O');
  assert.ok(Math.abs(p.prob - (0.4 * 0.75 + 0.6 * 0.5)) < 1e-9);
  // A move the database names that isn't legal here is left out.
  assert.equal(opponentPick(START, db(200, [['e2e5', 'e5', 150], ['c2c4', 'c4', 50]]), undefined)?.san, 'c4');
});

const lc0Fake = (asked: string[]) => async (line: readonly Position[]): Promise<SearchResult> => {
  const p = line[line.length - 1]!;
  asked.push(makeFen(p.toSetup()));
  // Lc0 always plays the first of a few natural moves that are legal.
  const uci = ['g1f3', 'b1c3', 'f1c4', 'e1g1', 'g8f6', 'b8c6', 'f8c5', 'e8g8'].find((u) => parseUciMove(p, u))!;
  return { uci, san: uci, nodes: 400, evals: 300, q: 0.1, cp: 12, moves: [{ uci, san: uci, visits: 250, prior: 0.5, q: 0.1 }], pv: [uci] };
};

test('the line: Lc0 on its side, people on the other, each source kept', async () => {
  const asked: string[] = [];
  const maiaAsked: string[] = [];
  const history = [START.clone()];
  const e4 = START.clone();
  e4.play(parseSan(e4, 'e4')!);
  history.push(e4);
  const seen: number[] = [];
  const out = await modelContinuation({
    history,
    plies: 4,
    lc0: 'white',
    ports: {
      lc0: lc0Fake(asked),
      // Thousands of games after 1. e4, few after 1...e5 2. Nf3.
      db: async (fen) => (fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3') ? db(5000, [['c7c5', 'c5', 2000], ['e7e5', 'e5', 2500]]) : db(10, [['b8c6', 'Nc6', 9], ['d7d6', 'd6', 1]])),
      maia: async (fen) => (maiaAsked.push(fen), [{ uci: 'd7d6', san: 'd6', prob: 0.7 }, { uci: 'b8c6', san: 'Nc6', prob: 0.2 }]),
    },
    onPly: (_, i) => seen.push(i),
  });
  assert.deepEqual(out.plies.map((p) => p.san), ['e5', 'Nf3', 'd6', 'Nc3']);
  assert.deepEqual(out.plies.map((p) => p.by), ['people', 'lc0', 'people', 'lc0']);
  assert.equal(out.plies[0]!.people!.source, 'db');
  // 10 games: 0.1·0.9 + 0.9·0.2 = 0.27 for Nc6 against 0.1·0.1 + 0.9·0.7 = 0.64 for d6.
  assert.equal(out.plies[2]!.people!.source, 'blend');
  assert.equal(out.plies[1]!.lc0!.nodes, 400);
  assert.equal(out.ended, undefined);
  assert.deepEqual(seen, [0, 1, 2, 3]);
  // Lc0 was asked at its own moves only, Maia only where the games were few.
  assert.equal(asked.length, 2);
  assert.equal(maiaAsked.length, 1);
  assert.equal(out.plies[3]!.fen, makeFen(pos(out.plies[3]!.fen).toSetup()));
});

test('the database failing: Maia alone, the reason kept; the game over; stopped', async () => {
  const out = await modelContinuation({
    history: [START],
    plies: 2,
    lc0: 'black',
    ports: { lc0: lc0Fake([]), db: async () => ({ error: 'log in' }), maia: async () => [{ uci: 'd2d4', san: 'd4', prob: 1 }] },
  });
  assert.equal(out.plies[0]!.san, 'd4');
  assert.equal(out.plies[0]!.people!.source, 'maia');
  assert.equal(out.plies[0]!.dbError, 'log in');
  assert.equal(out.plies[1]!.by, 'lc0');
  // Fool's mate played: nothing after it.
  const mated = [START];
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) {
    const p = mated[mated.length - 1]!.clone();
    p.play(parseSan(p, san)!);
    mated.push(p);
  }
  const over = await modelContinuation({ history: mated, plies: 6, lc0: 'white', ports: { lc0: lc0Fake([]), db: async () => db(0, []), maia: async () => undefined } });
  assert.equal(over.ended, 'game over');
  assert.equal(over.plies.length, 0);
  const none = await modelContinuation({ history: [START], plies: 2, lc0: 'black', ports: { lc0: lc0Fake([]), db: async () => db(0, []), maia: async () => undefined } });
  assert.equal(none.ended, 'no move');
  let n = 0;
  const stopped = await modelContinuation({ history: [START], plies: 6, lc0: 'white', stopped: () => n++ >= 2, ports: { lc0: lc0Fake([]), db: async () => db(0, []), maia: async () => undefined } });
  assert.equal(stopped.ended, 'stopped');
  assert.equal(stopped.plies.length, 1);
});
