// The model-games skill's reading of the owner's model-game generator (PLAN.md §5.141,
// scripts/ideas/games.ts): the shared position, Lc0's evals and jumps, the plan's moves and
// pieces, where the games tip, the material won, the settled checkpoints, and the games read as a
// repertoire for the opening-ideas tools. Small hand-made games in the generator's format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFen } from 'chessops/fen';
import { asRepertoirePgn, branches, checkpoints, filterGames, gains, gamesText, gameText, mistakes, ourMoves, plan, readModelGames, representative, summary, surprise, tipOf } from '../../../scripts/ideas/games.ts';
import { readPosition } from '../../../scripts/ideas/cv.ts';
import { readRepertoire } from '../../../scripts/ideas/tree.ts';
import { positionKeyOf } from '../../../src/core/chess/positionKey.ts';

const game = (round: number, result: string, moves: string, extra = '') =>
  `[Event "Model games: test"]\n[Site "local"]\n[Round "${round}"]\n[White "Lc0"]\n[Black "Maia3-2400"]\n[Result "${result}"]\n[BlackElo "${2400 + round}"]\n${extra}\n${moves} ${result}\n`;

// Lc0 is White; the prep ends after 2... Nc6.
const WHITE = [
  game(1, '1-0', '1. e4 e5 2. Nf3 Nc6 { end of prep } 3. Bb5 a6 4. Ba4 Nf6 { eval +0.20 -> +1.80 } 5. O-O { +1.75 } Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3'),
  game(2, '1-0', '1. e4 e5 2. Nf3 Nc6 { end of prep } 3. Bb5 a6 4. Bxc6 dxc6 5. O-O { +0.40 } f6 { eval +0.40 -> +0.90 } 6. d4'),
  game(3, '1-0', '1. e4 e5 2. Nf3 Nc6 { end of prep } 3. Bc4 Nd4 4. Nxd4 exd4 5. c3 dxc3 6. Nxc3 Nf6 7. e5 { +0.50 } Ng4 { eval +0.50 -> +4.00 } 8. Qxg4 d5 9. Qe2', '[Termination "adjudication"]'),
].join('\n');

test('model games: the strong side, the shared position, the evals and the jumps', () => {
  const mg = readModelGames(WHITE);
  assert.equal(mg.us, 'white');
  assert.equal(mg.games.length, 3);
  assert.equal(mg.start, 4);
  assert.equal(mg.startFrom, 'marked');
  assert.deepEqual(mg.problems, []);
  const [g1, g2, g3] = mg.games;
  assert.equal(g1!.elo, 2401);
  // After 5. O-O (move index 8: nine moves played) Lc0 says +1.75; the jump sits on 4... Nf6 (index 7).
  assert.equal(g1!.evals.get(9), 175);
  assert.deepEqual(g1!.jumps, [{ move: 7, from: 20, to: 180 }]);
  assert.deepEqual(g2!.jumps, [{ move: 9, from: 40, to: 90 }]);
  assert.equal(g3!.termination, 'adjudication');
  const s = summary(mg);
  assert.equal(s.wins, 3);
  assert.deepEqual(s.plies, [13, 7, 13]);
  // The tree from the shared position: 3. Bb5 in two games, then 3... a6 in both.
  assert.deepEqual(branches(mg, 2, 1).map((b) => `${b.sans.join(' ')} ${b.games}`), ['Bb5 2', 'Bb5 a6 2', 'Bc4 1', 'Bc4 Nd4 1']);
  assert.match(gameText(mg, 3), /7\. e5 \{\+0\.50\} Ng4 \{\+0\.50 → \+4\.00\} 8\. Qxg4/);
});

test('model games: without marks, the shared position is where the games part', () => {
  const mg = readModelGames(WHITE.replace(/\{ end of prep \} /g, ''));
  assert.equal(mg.startFrom, 'common');
  assert.equal(mg.start, 4);
});

test('model games: the plan by move and by piece, and where each game tips', () => {
  const mg = readModelGames(WHITE);
  const g1 = mg.games[0]!;
  const ours = ourMoves(mg, g1, 3);
  assert.deepEqual(ours.map((m) => `${m.number} ${m.san} ${m.piece} ${m.to}`), ['3. Bb5 f1-bishop b5', '4. Ba4 f1-bishop a4', '5. O-O king g1']);
  // The game tips on 4... Nf6 (the jump to +1.80): Bb5 and Ba4 come before it, castling after.
  assert.equal(tipOf(mg, g1), 7);
  assert.equal(tipOf(mg, mg.games[1]!), mg.games[1]!.sans.length);
  const p = plan(mg, 0);
  const castle = p.moves.find((m) => m.group === 'O-O')!;
  assert.equal(castle.games, 2);
  assert.equal(castle.early, 1);
  assert.deepEqual(castle.at, [5, 5]);
  const bishop = p.pieces.find((x) => x.piece === 'f1-bishop')!;
  assert.deepEqual(bishop.first, [['b5', 2], ['c4', 1]]);
  assert.equal(bishop.taken, 1); // 4. Bxc6 dxc6
  // The castled rook keeps its name.
  assert.ok(p.pieces.find((x) => x.piece === 'h1-rook')!.first.some(([sq]) => sq === 'f1'));
  // e5 in game 3 hits the f6-knight: contact.
  assert.equal(p.moves.find((m) => m.group === 'e5')!.contact, 1);
});

test('model games: material won, mistakes and the settled checkpoints', () => {
  const mg = readModelGames(WHITE);
  const [one, three] = gains(mg, [1, 3]);
  assert.deepEqual(one!.hits.map((h) => [h.round, h.san, h.took]), [[3, '8. Qxg4', 'knight g4']]);
  assert.equal(three!.hits.length, 1);
  const ms = mistakes(mg, { min: 100 });
  assert.deepEqual(ms.map((m) => [m.round, `${m.number} ${m.san}`, m.from, m.to, m.turning, m.reply]), [
    [1, '4... Nf6', 20, 180, true, 'O-O'],
    [3, '7... Ng4', 50, 400, true, 'Qxg4'],
  ]);
  assert.equal(ms[1]!.fen, makeFen(readPosition('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxd4 exd4 5. c3 dxc3 6. Nxc3 Nf6 7. e5').toSetup()));
  // Four plies on, game 3 stands mid-exchange (4. Nxd4 exd4 5. c3: settled; 4. Nxd4 alone would read +3).
  const [c] = checkpoints(mg, [3]);
  assert.equal(c!.games, 3);
  assert.deepEqual(c!.material, [['as at the start', 3]]);
});

test('model games: Lc0 as Black reads the evals from its side', () => {
  const text = [
    `[White "Maia3-2500"]\n[Black "Lc0"]\n[Round "1"]\n[Result "0-1"]\n[WhiteElo "2500"]\n\n1. e4 d5 { end of prep } 2. exd5 Qxd5 3. Nc3 Qa5 4. Bc4 { eval -0.30 -> -2.00 } Nf6 5. d3 { -2.10 } Bg4 0-1`,
    `[White "Maia3-2450"]\n[Black "Lc0"]\n[Round "2"]\n[Result "0-1"]\n[WhiteElo "2450"]\n\n1. e4 d5 { end of prep } 2. e5 Bf5 3. d4 e6 0-1`,
  ].join('\n\n');
  const mg = readModelGames(text);
  assert.equal(mg.us, 'black');
  assert.equal(mg.games[0]!.elo, 2500);
  const ms = mistakes(mg, { min: 100 });
  assert.deepEqual(ms.map((m) => [m.number, m.san, m.from, m.to, m.turning]), [['4.', 'Bc4', 30, 200, true]]);
  assert.equal(filterGames(mg, { after: ['e5'], window: 10 }).games.length, 1);
  assert.equal(filterGames(mg, { with: '...Qa5', window: 10 }).games.length, 1);
  assert.equal(filterGames(mg, { with: 'Bf5', window: 10 }).games.length, 1);
  assert.match(gamesText(mg, { window: 10, depth: 2, min: 1, at: [2], jump: 100 }), /Results for Black: 2 won/);
});

test('model games as a repertoire: the weaker side moves with its share, ours are the moves to learn', () => {
  const mg = readModelGames(WHITE);
  const rep = readRepertoire(asRepertoirePgn(mg), mg.us, { ourShares: true });
  assert.equal(rep.side, 'white');
  const at = (moves: string) => rep.positions.get(positionKeyOf(readPosition(moves)))!;
  assert.ok(Math.abs(at('1. e4 e5 2. Nf3 Nc6 3. Bb5').reach - 2 / 3) < 1e-3);
  assert.deepEqual(at('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6').moves.map((m) => m.san).sort(), ['Ba4', 'Bxc6']);
  assert.ok(at('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6').ours);
  assert.ok(Math.abs(at('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4').reach - 1 / 3) < 1e-3);
  assert.ok(Math.abs(at('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4').reach - 1 / 3) < 1e-3);
  // Read as a plain repertoire (our shares ignored), each of our moves keeps all of its games.
  const plain = readRepertoire(asRepertoirePgn(mg), mg.us);
  assert.equal(plain.positions.get(positionKeyOf(readPosition('1. e4 e5 2. Nf3 Nc6 3. Bb5')))!.reach, 1);
});

test('model games: the typical games, and the moves Maia would rarely play', async () => {
  const mg = readModelGames(WHITE);
  const rep = representative(mg, 6);
  assert.equal(rep.quickest[0]!.round, 2);
  assert.equal(rep.typical.length, 3);
  // A fake Maia that always plays the first legal move it is asked about: here 3. Bb5 is 90%, everything else 0.
  const policy = async (pos: Parameters<Parameters<typeof surprise>[2]>[0]) => (makeFen(pos.toSetup()).startsWith('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2') ? [{ san: 'Bb5', uci: 'f1b5', prob: 0.9 }] : []);
  const rows = await surprise(mg, 3, policy);
  assert.equal(rows.find((r) => r.group === 'Bb5')!.prob, 0.9);
  assert.equal(rows.find((r) => r.group === 'Bc4')!.prob, 0);
});
