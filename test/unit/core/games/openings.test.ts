// The games' own explorer (PLAN.md §6, item 4): the position → move index, the game → positions
// index and the opening name at a position, the same as mistake-lab's own `doBuildOpeningIndex` and
// `lookupOpeningName` on test/fixtures/games/openings.json (recorded by mistake-lab-openings.cjs at
// c525403: a transposition, a game from a position, one cut by an illegal move, an en passant, an
// empty game); the explorer's rows as `renderExplorerStats` counts them.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the last position left out of a game's positions → "the indexes, as mistake-lab's" (each game's
//   positions) and "the opening name …" (the Two Knights reached both ways);
// - a tie for the name going to the last met → "the opening name …".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { parseFen } from 'chessops/fen';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { explorerRows, openingIndex, openingNameAt, reaches, type IndexedGame } from '../../../../src/core/games/openings.ts';
import { replay } from '../../../../src/core/games/positions.ts';

const j = JSON.parse(readFileSync(new URL('../../../fixtures/games/openings.json', import.meta.url), 'utf8')) as {
  games: { id: string; color: 'white' | 'black'; result: 'win' | 'loss' | 'draw'; opening?: string; initialFen?: string; moves: string[] }[];
  lookups: { name: string; fen: string; moves: string[] }[];
  expected: {
    pmi: Record<string, Record<string, { uci: string; count: number; whiteWins: number; blackWins: number; draws: number; games: [string, string, string][] }>>;
    fens: Record<string, string[]>;
    names: Record<string, string>;
  };
};

const games: IndexedGame[] = j.games.map((g) => ({ id: g.id, color: g.color, result: g.result, opening: g.opening, played: replay({ ...(g.initialFen ? { initialFen: g.initialFen } : {}), moves: g.moves }) }));
const index = openingIndex(games);
const keyAfter = (fen: string, sans: string[]) => {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  for (const san of sans) pos.play(parseSan(pos, san)!);
  return positionKeyOf(pos);
};

test('the indexes, as mistake-lab’s', () => {
  const pmi: typeof j.expected.pmi = {};
  for (const [key, moves] of index.moves) {
    pmi[key] = {};
    for (const [san, e] of moves) pmi[key]![san] = { uci: e.uci, count: e.count, whiteWins: e.whiteWins, blackWins: e.blackWins, draws: e.draws, games: e.games.map((g) => [g.id, g.color, g.result]) };
  }
  assert.deepEqual(pmi, j.expected.pmi);
  const fens = Object.fromEntries([...index.fens].map(([id, set]) => [id, [...set].sort()]));
  assert.deepEqual(fens, j.expected.fens);
});

test('the opening name at a position, as mistake-lab’s', () => {
  for (const l of j.lookups) assert.equal(openingNameAt(index, keyAfter(l.fen, l.moves)), j.expected.names[l.name], l.name);
});

test('the explorer’s rows: most played first, results from White’s side, a colour’s games only', () => {
  const start = keyAfter(j.lookups[0]!.fen, []);
  const after3 = keyAfter(j.lookups[0]!.fen, ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.deepEqual(
    explorerRows(index, after3).map((r) => [r.san, r.count, r.whiteWins, r.draws, r.blackWins]),
    [
      ['Bc4', 3, 2, 1, 0],
      ['d4', 1, 0, 1, 0],
      ['Bb5', 1, 0, 0, 1],
    ],
  );
  assert.deepEqual(
    explorerRows(index, after3, 'black').map((r) => [r.san, r.count, r.games]),
    [['Bc4', 2, ['G2', 'G6']]],
  );
  assert.equal(explorerRows(index, start)[0]!.count, 7);
  assert.equal(reaches(index, 'G6', after3), true, 'a game from a position reaches it');
  assert.equal(reaches(index, 'G9', start), false, 'an empty game reaches nothing');
});
