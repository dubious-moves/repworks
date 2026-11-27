import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
const key = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
function fens(file) { const s = new Set(); for (const g of parsePgn(readFileSync(file, 'utf8'))) { const w = (n, p) => { s.add(key(p)); for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (!mv) continue; q.play(mv); w(c, q); } }; w(g.moves, startingPosition(g.headers).unwrap()); } return s; }
const [deck, a, b] = process.argv.slice(2); const A = fens(a), Bs = fens(b);
for (const g of parsePgn(readFileSync(deck, 'utf8'))) { const p = startingPosition(g.headers).unwrap(); const k = key(p); if (A.has(k) && !Bs.has(k)) console.log('LOST:', g.headers.get('ChapterName') || g.headers.get('Event'), '|', g.headers.get('FEN')); }
