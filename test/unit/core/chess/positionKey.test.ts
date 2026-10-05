// The position key (PLAN.md §4.3, D10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess, type Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';
import type { NormalMove } from 'chessops/types';
import { keyFen, positionKey, positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { mulberry32 } from '../../../support/random.ts';

// The five positions run during planning (prototypes/position-key/ep-test.mjs), each as the
// FEN that chess.js 1.4.0, chessops and chess.js 0.10.3 wrote after the last move. Lichess
// (scalachess) writes an en passant square only when the capture is legal, as chessops does.
const cases = [
  {
    name: 'no neighbouring pawn: 1.e4',
    fens: [
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    ],
    key: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
  },
  {
    name: 'capturable: 1.e4 Nf6 2.e5 d5',
    fens: ['rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'],
    key: 'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6',
  },
  {
    name: 'horizontal pin: K a5, P e5, r h5, then ...d7-d5',
    fens: ['4k3/8/8/K2pP2r/8/8/8/8 w - - 0 2', '4k3/8/8/K2pP2r/8/8/8/8 w - d6 0 2'],
    key: '4k3/8/8/K2pP2r/8/8/8/8 w - -',
  },
  {
    name: 'diagonal pin: K g7, P e5, b c3, then ...d7-d5',
    fens: ['8/6K1/8/3pP3/8/2b5/8/k7 w - - 0 2', '8/6K1/8/3pP3/8/2b5/8/k7 w - d6 0 2'],
    key: '8/6K1/8/3pP3/8/2b5/8/k7 w - -',
  },
  {
    name: 'two neighbours, one pinned',
    fens: ['8/6K1/8/2PpP3/8/2b5/8/k7 w - d6 0 2'],
    key: '8/6K1/8/2PpP3/8/2b5/8/k7 w - d6',
  },
];

for (const c of cases) {
  test(`en passant: ${c.name}`, () => {
    for (const fen of c.fens) assert.equal(positionKey(fen), c.key, fen);
    // The key is a fixed point.
    assert.equal(positionKey(`${c.key} 0 1`), c.key);
  });
}

test('castling rights without their king and rook are dropped; clocks are dropped', () => {
  assert.equal(positionKey('4k3/8/8/8/8/8/8/4K3 w KQ - 0 1'), '4k3/8/8/8/8/8/8/4K3 w - -');
  assert.equal(positionKey('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 17 42'), 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
  assert.equal(positionKey('r3k3/8/8/8/8/8/8/R3K2R b KQkq - 0 1'), 'r3k3/8/8/8/8/8/8/R3K2R b KQq -');
});

test('a FEN chessops refuses falls back to the pseudo-legal rule, flagged', () => {
  // Both kings in check: not a position play can reach.
  assert.deepEqual(keyFen('4k3/4R3/8/3pP3/8/8/4r3/4K3 w - d6 0 1'), { key: '4k3/4R3/8/3pP3/8/8/4r3/4K3 w - d6', legal: false });
  assert.equal(keyFen('not a fen'), undefined);
  assert.throws(() => positionKey('not a fen'));
});

// About 2,000 keys published in puzzle-explorer-data's index (scripts/make-key-fixture.mjs),
// every en passant key of 16 shards among them.
test('every published dataset key in the fixture is a fixed point and hashes to its shard', () => {
  const fixture = JSON.parse(readFileSync(join(import.meta.dirname, '../../../fixtures/position-keys/dataset-keys.json'), 'utf8')) as { keys: [string, string][]; enPassantKeys: number };
  assert.equal(fixture.keys.length, 2000);
  let withEp = 0;
  for (const [shard, key] of fixture.keys) {
    const keyed = keyFen(`${key} 0 1`);
    assert.ok(keyed?.legal, key);
    assert.equal(keyed.key, key);
    assert.equal(createHash('sha1').update(key).digest('hex').slice(0, 3), shard, key);
    if (key.split(' ')[3] !== '-') withEp++;
  }
  assert.equal(withEp, fixture.enPassantKeys);
  assert.ok(withEp > 200);
});

// mistake-lab's key, copied from its index.html (fenPositionKey, isEnPassantPseudoLegal) by the
// planning prototype: the en passant square stays when a side-to-move pawn stands beside it.
function mistakeLabKey(fen: string): string {
  const p = fen.split(' ');
  const [board, turn, ep] = [p[0]!, p[1]!, p[3]!];
  if (ep !== '-') {
    const file = ep.charCodeAt(0) - 97;
    const rank = Number(ep[1]);
    const pawn = turn === 'w' ? 'P' : 'p';
    const pawnRank = turn === 'w' ? 5 : 4;
    const ok = (turn === 'w' && rank === 6) || (turn === 'b' && rank === 3);
    const row = board.split('/')[8 - pawnRank]!;
    const files: string[] = [];
    for (const ch of row) {
      if (/[1-8]/.test(ch)) for (let i = 0; i < Number(ch); i++) files.push('');
      else files.push(ch);
    }
    if (!(ok && (files[file - 1] === pawn || files[file + 1] === pawn))) p[3] = '-';
  }
  return p.slice(0, 4).join(' ');
}

/** The FEN chess.js 0.10.3 writes: an en passant square after every double push. */
function fenLikeChessJs0103(before: Position, move: NormalMove, after: Position): string {
  const setup = after.toSetup();
  const piece = before.board.get(move.from);
  if (piece?.role === 'pawn' && Math.abs(move.to - move.from) === 16) setup.epSquare = (move.from + move.to) / 2;
  else setup.epSquare = undefined;
  return makeFen(setup);
}

test("mistake-lab's key agrees on random games, except exactly where the en passant capture is illegal", () => {
  const random = mulberry32(20261005);
  let positions = 0;
  let differ = 0;
  for (let game = 0; game < 400; game++) {
    const pos = Chess.default();
    for (let ply = 0; ply < 160 && !pos.isEnd(); ply++) {
      const moves: NormalMove[] = [];
      for (const [from, dests] of pos.allDests()) for (const to of dests) moves.push({ from, to });
      // Favour pawn moves a little, so double pushes beside enemy pawns come up often.
      const pawnMoves = moves.filter((m) => pos.board.get(m.from)?.role === 'pawn');
      const pool = pawnMoves.length && random() < 0.4 ? pawnMoves : moves;
      const move = pool[Math.floor(random() * pool.length)]!;
      const before = pos.clone();
      pos.play(move);
      const fen0103 = fenLikeChessJs0103(before, move, pos);
      const ours = positionKey(fen0103);
      assert.equal(ours, positionKeyOf(pos));
      const theirs = mistakeLabKey(fen0103);
      positions++;
      if (ours !== theirs) {
        differ++;
        // The only difference allowed: mistake-lab keeps a square whose capture is illegal.
        assert.equal(ours.split(' ')[3], '-');
        assert.equal(theirs.split(' ').slice(0, 3).join(' '), ours.split(' ').slice(0, 3).join(' '));
        const ep = theirs.split(' ')[3]!;
        const legalCaptures = [...pos.allDests()].filter(([, dests]) => [...dests].some((to) => makeSquare(to) === ep));
        assert.equal(legalCaptures.length, 0, `${fen0103}: a legal capture onto ${ep} exists`);
      }
    }
  }
  assert.ok(positions > 30_000);
  // The planning positions show the difference is real; random play only rarely pins the pawn.
  for (const c of cases) for (const fen of c.fens) if (mistakeLabKey(fen) !== positionKey(fen)) differ++;
  assert.ok(differ >= 2);
});
