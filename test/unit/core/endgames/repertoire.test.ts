// Repertoire endgames (PLAN.md §5.149): what counts as an endgame, its category and title, the
// game walked from a line's end to its first quiet endgame position with the user to move, the
// goal from Stockfish's score, the kept record and the drill made of it, and the list's merge.
// The game is a legal one made for the test (a random walk preferring captures from the fixture
// repertoire's 3...cxd4), not a real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { CONVERT_LEAD, taskOf, wonAfter } from '../../../../src/core/endgames/endgames.ts';
import {
  addEndgames,
  asEndgame,
  CATEGORIES,
  categoryOf,
  endgameInGame,
  goalFor,
  inListOrder,
  isEndgame,
  isRepertoireId,
  oppositeBishops,
  readRepertoireEndgame,
  REP,
  repertoireEndgame,
  repertoireId,
  titleOf,
  type RepertoireEndgame,
} from '../../../../src/core/endgames/repertoire.ts';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

/** The fixture repertoire's line end 1. e4 c5 2. Nf3 d6 3. d4 cxd4 (Black's), White to move. */
const FRONTIER = 'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4';
const GAME = 'e4 c5 Nf3 d6 d4 cxd4 Qxd4 Na6 Bxa6 bxa6 O-O Qb6 Qxd6 exd6 Ne5 Qxb2 Nxf7 Bd7 Bxb2 Kxf7 Bxg7 Kxg7 Rd1 Bh3 Rxd6 Bxg2 Rxa6 Bxe4 Rxa7+ Rxa7 h4 Bxc2 Nc3 Rxa2 Rxa2 Bf5 Kg2 Ba3 Rxa3 Ne7 Kf3 Be4+ Kxe4 Ra8 Ra5 Nf5 Ne2'.split(' ');
/** After 43.Kxe4 (a capture, Black to move: skipped), 44.Ra8 and Ra5: Black's first quiet moment. */
const FOUND = 'r7/4n1kp/8/R7/4K2P/2N5/5P2/8 b - - 2 23';

test('an endgame: at most two pieces a side and four in all, worth 20 at most, with a pawn', () => {
  assert.equal(isEndgame(pos('8/5pk1/6p1/8/8/6P1/r4PK1/R7 w - - 0 1')), true, 'a rook ending');
  assert.equal(isEndgame(pos('8/5pk1/8/8/8/8/5PK1/8 w - - 0 1')), true, 'a pawn ending');
  assert.equal(isEndgame(pos('2r1r1k1/5ppp/8/8/8/8/5PPP/2R1R1K1 w - - 0 1')), true, 'two rooks each: 20');
  assert.equal(isEndgame(pos('2r1rbk1/5ppp/8/8/8/8/5PPP/2R1RBK1 w - - 0 1')), false, 'three pieces a side');
  assert.equal(isEndgame(pos('3qr1k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1')), false, 'queen and rook each: 28');
  assert.equal(isEndgame(pos('3q2k1/8/8/8/8/8/8/3Q2K1 w - - 0 1')), false, 'no pawn: a theoretical ending');
  assert.equal(isEndgame(pos('rr4k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1')), true, 'two rooks against pawns');
});

test('the category by the pieces each side has', () => {
  assert.equal(categoryOf(pos('8/5pk1/8/8/8/8/5PK1/8 w - - 0 1')), 'pawn');
  assert.equal(categoryOf(pos('8/5pk1/6p1/8/8/6P1/r4PK1/R7 w - - 0 1')), 'rook');
  assert.equal(categoryOf(pos('8/5pk1/5np1/8/8/4B1P1/5PK1/8 w - - 0 1')), 'minor', 'bishop against knight');
  assert.equal(categoryOf(pos('8/5pk1/5np1/8/8/4B1P1/r4PK1/R7 w - - 0 1')), 'rook-minor');
  assert.equal(categoryOf(pos('3q2k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1')), 'heavy', 'queens');
  assert.equal(categoryOf(pos('2r1r1k1/5ppp/8/8/8/8/5PPP/2R1R1K1 w - - 0 1')), 'heavy', 'two rooks each');
  assert.equal(categoryOf(pos('8/5pk1/5np1/8/8/6P1/5PK1/R7 w - - 0 1')), 'imbalance', 'a rook against a knight');
  assert.equal(categoryOf(pos('8/5pk1/6p1/8/8/6P1/5PK1/R7 w - - 0 1')), 'imbalance', 'a rook against pawns');
  assert.equal(categoryOf(pos('8/5pk1/5bp1/8/8/4BNP1/5PK1/8 w - - 0 1')), 'imbalance', 'two minor pieces against one');
  assert.deepEqual(new Set(CATEGORIES.map((c) => c.id)).size, 6);
  for (const c of CATEGORIES) assert.ok(c.idea.length > 120, c.id);
});

test('the title from the user’s side, bishops on opposite colours named', () => {
  const p = pos('8/5pk1/5bp1/8/8/4B1P1/r4PK1/R7 w - - 0 1');
  // e3 is dark, f6 is dark: same colour.
  assert.equal(oppositeBishops(p), false);
  assert.equal(titleOf(p, 'white'), 'R+B vs R+B · pawns 2 v 2');
  const o = pos('8/5pk1/4b1p1/8/8/4B1P1/r4PK1/R7 w - - 0 1');
  assert.equal(oppositeBishops(o), true);
  assert.equal(titleOf(o, 'black'), 'R+B vs R+B · pawns 2 v 2 · opposite bishops');
  assert.equal(titleOf(pos('8/5pk1/8/8/8/8/4PPK1/8 b - - 0 1'), 'black'), 'Pawns 1 v 2');
  assert.equal(titleOf(pos('8/5pk1/6p1/8/8/6P1/5PK1/R7 w - - 0 1'), 'black'), 'K vs R · pawns 2 v 2');
});

test('a game walked from the line’s end to its first quiet endgame position with the user to move', () => {
  const f = endgameInGame(FRONTIER, 'black', GAME);
  assert.ok(typeof f !== 'string', String(f));
  assert.equal(f.fen, FOUND);
  // 45 plies played, 6 of them to the line's end.
  assert.equal(f.ply, 39);
  assert.equal(f.move, 23);
  assert.equal(f.arrived?.san, 'Ra5');
  // The endgame began after 43.Kxe4, a capture with Black to move: two plies to the quiet moment.
  assert.equal(endgameInGame(FRONTIER, 'black', GAME, 1), 'no quiet moment early in the endgame');
  assert.ok(typeof endgameInGame(FRONTIER, 'black', GAME, 2) !== 'string');
  // White's first: after 44.Ra8, White to move.
  const w = endgameInGame(FRONTIER, 'white', GAME);
  assert.ok(typeof w !== 'string');
  assert.equal(w.fen, 'r7/4n1kp/8/8/4K2P/R1N5/5P2/8 w - - 1 23');
  // The game cut before the endgame, a line end it never reaches, the endgame left in its first moves.
  assert.equal(endgameInGame(FRONTIER, 'black', GAME.slice(0, 40)), 'no endgame in the game');
  assert.equal(endgameInGame(FRONTIER, 'black', GAME.slice(0, 43)), 'the game ended in the endgame’s first moves');
  assert.equal(endgameInGame('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1', 'black', GAME), 'never reached the line’s end');
  // Reached by another move order (2. d4 cxd4 3. Nf3 d6): the same walk.
  const other = ['e4', 'c5', 'd4', 'cxd4', 'Nf3', 'd6', ...GAME.slice(6)];
  const t = endgameInGame(FRONTIER, 'black', other);
  assert.ok(typeof t !== 'string');
  assert.equal(t.fen, FOUND);
});

test('the goal from Stockfish’s score: +3 a win, −1 to +1.5 a draw, between and below none', () => {
  assert.equal(goalFor(300, 0), 'win');
  assert.equal(goalFor(2500, 2), 'win');
  assert.equal(goalFor(400, CONVERT_LEAD), 'already won on material');
  assert.equal(goalFor(150, 1), 'draw');
  assert.equal(goalFor(-100, -1), 'draw');
  assert.equal(goalFor(0, 0), 'draw');
  assert.equal(goalFor(151, 0), 'better, but not clearly winning');
  assert.equal(goalFor(299, 0), 'better, but not clearly winning');
  assert.equal(goalFor(-101, 0), 'you are worse');
  // Clear of the judge's lines (±2) by a pawn or more.
  assert.ok(REP.winFromCp - 200 >= 100 && REP.drawLoCp + 200 >= 100);
});

const from = { lines: [{ sid: 's1', cid: 'c1', path: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'] }], names: ['Najdorf'], game: { id: 'GameAAAA', white: 'A', black: 'B' } };

test('the kept endgame, its id, and the drill made of it', () => {
  const f = endgameInGame(FRONTIER, 'black', GAME);
  assert.ok(typeof f !== 'string');
  const r = repertoireEndgame(f, 'black', { cp: -40, depth: 18 }, from, 1000);
  assert.ok(typeof r !== 'string', String(r));
  assert.equal(r.goal, 'draw');
  assert.equal(r.category, 'rook-minor');
  assert.equal(r.title, 'R+N vs R+N · pawns 1 v 2');
  assert.equal(r.key, positionKey(FOUND));
  assert.equal(r.id, repertoireId(r.key));
  assert.ok(isRepertoireId(r.id) && /^[a-z0-9-]{1,40}$/.test(r.id));
  assert.notEqual(repertoireId('a'), repertoireId('b'));
  assert.deepEqual(r.game, { id: 'GameAAAA', white: 'A', black: 'B', ply: 39, move: 23 });
  assert.equal(r.san, 'Ra5');
  assert.deepEqual(readRepertoireEndgame(JSON.parse(JSON.stringify(r))), r);
  assert.equal(readRepertoireEndgame({ ...r, v: 2 }), undefined);
  assert.equal(readRepertoireEndgame({ ...r, category: 'odd' }), undefined);
  assert.equal(readRepertoireEndgame(null), undefined);

  const d = asEndgame(r);
  assert.deepEqual([d.id, d.fen, d.goal, d.hold, d.until, d.group], [r.id, r.fen, 'draw', REP.hold, undefined, 'rook-minor']);
  assert.equal(taskOf(d), `Black to play and draw (hold ${REP.hold} moves)`);
  const win = repertoireEndgame(f, 'black', { cp: 350, depth: 18 }, from, 1000);
  assert.ok(typeof win !== 'string');
  const w = asEndgame(win);
  assert.deepEqual([w.goal, w.until, w.hold], ['win', 'convert', undefined]);
  assert.equal(taskOf(w), `Black to play and win (queen a pawn or go ${CONVERT_LEAD} points up)`);
  assert.equal(repertoireEndgame(f, 'black', { cp: 200, depth: 18 }, from, 1000), 'better, but not clearly winning');
});

test('a converted win: a promotion, a bare king, or the lead', () => {
  const e = { id: 'r-1', group: 'rook' as const, title: '', fen: '', goal: 'win' as const, until: 'convert' as const, idea: '' };
  // Black has just moved (White to move): Black's lead counts.
  assert.equal(wonAfter(e, pos('8/5pk1/6p1/8/8/6P1/r4PK1/8 w - - 0 1'), false), true, 'a rook up: 5');
  assert.equal(wonAfter(e, pos('8/5pk1/6p1/8/8/6P1/r4PK1/R7 w - - 0 1'), false), false, 'level');
  assert.equal(wonAfter(e, pos('8/5pk1/6p1/8/8/6P1/r4PK1/R7 w - - 0 1'), true), true, 'promoted');
  assert.equal(wonAfter(e, pos('8/5pk1/8/8/8/8/6K1/8 w - - 0 1'), false), true, 'a bare king');
});

test('the list: new ones added once, the oldest out past the cap, by category', () => {
  const f = endgameInGame(FRONTIER, 'black', GAME);
  assert.ok(typeof f !== 'string');
  const make = (fen: string, at: number) => {
    const r = repertoireEndgame({ ...f, fen }, 'black', { cp: 0, depth: 18 }, from, at);
    assert.ok(typeof r !== 'string');
    return r;
  };
  const a = make(FOUND, 1);
  const b = make('8/5pk1/8/8/8/8/5PK1/8 b - - 0 1', 2);
  const c = make('8/5pk1/6p1/8/8/6P1/r4PK1/R7 b - - 0 1', 3);
  let { list, added } = addEndgames([], [a, b, a]);
  assert.equal(added, 2);
  ({ list, added } = addEndgames(list, [b, c], 2));
  assert.equal(added, 1);
  assert.deepEqual(
    list.map((r: RepertoireEndgame) => r.at),
    [2, 3],
  );
  // Rook endings first, then pawn endings.
  assert.deepEqual(
    inListOrder([a, b, c]).map((r) => r.category),
    ['rook', 'pawn', 'rook-minor'],
  );
});
