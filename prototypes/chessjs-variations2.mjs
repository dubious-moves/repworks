import { Chess } from 'chess.js';
const tests = {
  'variations, single comments': `[Event "x"]\n\n{ root } 1. e4 c5 2. Nf3 { A comment } 2... d6 (2... Nc6 { old } 3. d4 (3. Bb5 g6!? 4. O-O $14) 3... cxd4) 3. d4!! cxd4?! 4. Nxd4 *`,
  'two comments on one move': `[Event "x"]\n\n1. e4 { a } { b } e5 *`,
  'shape comment alone': `[Event "x"]\n\n1. e4 { [%csl Gd4][%cal Gd2d4] } e5 *`,
};
for (const [n, pgn] of Object.entries(tests)) {
  const c = new Chess();
  try { c.loadPgn(pgn); console.log(`[${n}] ok; mainline: ${c.history().join(' ')}; comments: ${JSON.stringify(c.getComments())}\n   pgn(): ${c.pgn().split('\n').pop()}`); }
  catch (e) { console.log(`[${n}] threw: ${e.message}`); }
}
