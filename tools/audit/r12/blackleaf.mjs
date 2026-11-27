import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const [f] = process.argv.slice(2); const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === 'Jobava simplified');
let n = 0; const w = (node, p, sans) => { for (const c of node.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); q.play(mv); const ns = [...sans, s];
  if (!c.children.length && ns.length % 2 === 0) { const cm = (c.data.comments || []).join(' '); if (!/transpos/i.test(cm)) { n++; console.log('BLACK LEAF', ns.join(' '), '|', cm.slice(0, 60)); } }
  w(c, q, ns); } };
w(g.moves, startingPosition(g.headers).unwrap(), []); console.log('black leaves without transposition note:', n);
