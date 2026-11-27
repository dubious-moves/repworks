// node ownercheck.mjs <owner.pgn> <ext.pgn> <ChapterName>: owner's moves and comments present in the extension?
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js');
import { readFileSync } from 'node:fs';
const [o, x, name] = process.argv.slice(2);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const og = parsePgn(readFileSync(o, 'utf8'))[0], xg = parsePgn(readFileSync(x, 'utf8')).find((g) => g.headers.get('ChapterName') === name);
let moves = 0, miss = 0, com = 0, cmiss = 0, extraMoves = 0;
const walk = (a, b, path) => { for (const c of a.children) { moves++; const m = b && b.children.find((y) => y.data.san === c.data.san);
  if (!m) { miss++; console.log('missing move', path.concat(c.data.san).join(' ')); walk(c, null, path.concat(c.data.san)); continue; }
  for (const t of c.data.comments || []) { com++; if (!(m.data.comments || []).some((u) => norm(u).includes(norm(t)))) { cmiss++; console.log('missing comment at', path.concat(c.data.san).join(' '), '|', norm(t).slice(0, 80)); } }
  walk(c, m, path.concat(c.data.san)); } };
walk(og.moves, xg.moves, []);
const count = (n) => n.children.reduce((s, c) => s + 1 + count(c), 0);
console.log(`${name}: owner moves ${moves}, missing ${miss}; owner comments ${com}, missing ${cmiss}; extension nodes ${count(xg.moves)} vs owner ${count(og.moves)}`);
