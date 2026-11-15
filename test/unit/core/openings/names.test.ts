// Opening names (PLAN.md §5.181): the bundled list read into a book, a line named by its last
// named position, names found by their words; and the vendored file itself, whole.
//
// Controls run on this file (2026-11-15), each failing the named test (and the vendored list's,
// which asks the same of the real file):
// - a line named by the position it ends at alone (no walk back along its moves) → "a line of
//   play is named by the last named position on it";
// - the book keyed by the row's moves, not the position reached → "a position is named whatever
//   the move order";
// - a name's rows all kept (no shortest line for a name) → "names by their words".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { openingLabel, openingOfLine, openingsNamed, parseOpenings } from '../../../../src/core/openings/names.ts';

const ROWS = [
  'A04\tZukertort Opening\tNf3',
  'B20\tSicilian Defense\te4 c5',
  'B27\tSicilian Defense\te4 c5 Nf3',
  'B50\tSicilian Defense: Modern Variations\te4 c5 Nf3 d6',
  'B90\tSicilian Defense: Najdorf Variation\te4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
  'C00\tFrench Defense\te4 e6',
  'D06\tQueen’s Gambit\td4 d5 c4',
  'D85\tGrünfeld Defense: Exchange Variation\td4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5',
];
const BOOK = parseOpenings(ROWS.join('\n') + '\n');
const line = (moves: string) => (moves ? moves.split(' ') : []);
const nameOf = (moves: string) => {
  const found = openingOfLine(BOOK, Chess.default(), line(moves));
  return found ? `${openingLabel(found.opening)} @ ${found.ply}` : undefined;
};

test('the list is read: every row a line, a row that can’t be played left out', () => {
  assert.equal(BOOK.list.length, ROWS.length);
  assert.equal(BOOK.longest, 10);
  assert.deepEqual(BOOK.list[4], {
    eco: 'B90',
    name: 'Sicilian Defense: Najdorf Variation',
    sans: line('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'),
    key: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -',
    folded: 'sicilian defense: najdorf variation',
  });
  const broken = parseOpenings('A00\tGood\te4\nA00\tAn illegal move\te4 e5 Ke3\nA00\tNot three fields\nA00\tAfter them\td4\n\n');
  assert.deepEqual(broken.list.map((o) => o.name), ['Good', 'After them']);
  assert.deepEqual(parseOpenings('').list, []);
});

test('a line of play is named by the last named position on it', () => {
  assert.equal(nameOf(''), undefined);
  assert.equal(nameOf('e4'), undefined);
  assert.equal(nameOf('e4 c5'), 'B20 · Sicilian Defense @ 2');
  // Past the list's last name the line keeps it.
  assert.equal(nameOf('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7'), 'B90 · Sicilian Defense: Najdorf Variation @ 10');
  // Between two names: the one behind.
  assert.equal(nameOf('e4 c5 Nf3 d6 d4 cxd4'), 'B50 · Sicilian Defense: Modern Variations @ 4');
  // A move that isn't legal ends the walk where it stands.
  assert.equal(nameOf('e4 c5 Ke3 d6'), 'B20 · Sicilian Defense @ 2');
  assert.equal(openingOfLine(BOOK, undefined, line('e4 c5')), undefined);
});

test('a position is named whatever the move order, and from a board set up at it', () => {
  // 1. Nf3 c5 2. e4 is 1. e4 c5 2. Nf3; before it the line was a Zukertort.
  assert.equal(nameOf('Nf3 c5'), 'A04 · Zukertort Opening @ 1');
  assert.equal(nameOf('Nf3 c5 e4'), 'B27 · Sicilian Defense @ 3');
  assert.equal(nameOf('c4 d5 d4'), 'D06 · Queen’s Gambit @ 3');
  // A board started from a FEN: the start itself is named (ply 0), and the moves after it.
  const start = Chess.fromSetup(parseFen('rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2').unwrap()).unwrap();
  assert.equal(openingOfLine(BOOK, start, [])?.ply, 0);
  assert.equal(openingOfLine(BOOK, start, [])?.opening.eco, 'B27');
  assert.equal(openingOfLine(BOOK, start, ['d6'])?.opening.name, 'Sicilian Defense: Modern Variations');
  // The same squares with the other side to move are another position.
  const other = Chess.fromSetup(parseFen('rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 2').unwrap()).unwrap();
  assert.equal(openingOfLine(BOOK, other, []), undefined);
});

test('names by their words: every word, accents folded, one row a name, the shortest lines first', () => {
  const named = (q: string) => openingsNamed(BOOK, q.split(' ')).map((o) => `${o.eco} ${o.name}`);
  assert.deepEqual(named('sicilian'), ['B20 Sicilian Defense', 'B50 Sicilian Defense: Modern Variations', 'B90 Sicilian Defense: Najdorf Variation']);
  assert.deepEqual(named('najdorf sicilian'), ['B90 Sicilian Defense: Najdorf Variation']);
  assert.deepEqual(named('grunfeld'), ['D85 Grünfeld Defense: Exchange Variation']);
  assert.deepEqual(named('defense variation'), ['B50 Sicilian Defense: Modern Variations', 'D85 Grünfeld Defense: Exchange Variation', 'B90 Sicilian Defense: Najdorf Variation']);
  assert.deepEqual(named('benoni'), []);
  assert.deepEqual(openingsNamed(BOOK, []), []);
});

test('the vendored list: every row read, each at a position of its own, the names where Lichess has them', () => {
  const text = readFileSync(new URL('../../../../vendor/openings/openings.tsv', import.meta.url), 'utf8');
  const rows = text.split('\n').filter(Boolean);
  const book = parseOpenings(text);
  // Nothing left out: every row's moves are legal.
  assert.equal(book.list.length, rows.length);
  assert.equal(book.list.length, 3865);
  // The list has one row a position (its names repeat, for other move orders).
  assert.equal(book.byKey.size, book.list.length);
  assert.equal(book.longest, 36);
  for (const o of book.list) assert.match(o.eco, /^[A-E]\d\d$/);
  const at = (moves: string) => openingOfLine(book, Chess.default(), line(moves))?.opening;
  assert.equal(openingLabel(at('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6')!), 'B90 · Sicilian Defense: Najdorf Variation');
  assert.equal(at('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3')!.name, 'Sicilian Defense: Najdorf Variation, Opocensky Variation');
  assert.equal(at('d4 Nf6 c4 g6 Nc3 d5')!.name, 'Grünfeld Defense');
  assert.equal(at('e4 e5 Nf3 Nc6 Bb5')!.name, 'Ruy Lopez');
  assert.equal(at('e4'), book.byKey.get(at('e4')!.key));
  assert.equal(openingsNamed(book, ['najdorf']).length, 24);
});
