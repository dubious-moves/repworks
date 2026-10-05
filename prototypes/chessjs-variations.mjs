import { Chess } from 'chess.js';
const pgn = `[Event "x"]

{ root } 1. e4 c5 2. Nf3 { A comment } { [%csl Gd4] } 2... d6 (2... Nc6 { old } 3. d4 (3. Bb5 g6!? 4. O-O $14) 3... cxd4) 3. d4!! cxd4?! 4. Nxd4 *`;
const c = new Chess();
try {
  c.loadPgn(pgn);
  console.log('loadPgn ok. history:', c.history().join(' '));
  console.log('comments:', JSON.stringify(c.getComments()));
  console.log('pgn():', c.pgn());
} catch (e) { console.log('loadPgn threw:', e.message); }
