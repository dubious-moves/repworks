// walk every node (mainline + variations), check legality and comment lines
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const L = await import('/home/user/repworks/src/core/repertoire/lines.ts');
function walk(node, pos, path) {
  for (const c of node.children) {
    const m = parseSan(pos, c.data.san); if (!m) { console.log('ILLEGAL', path.join(' '), c.data.san); continue; }
    const prev = pos.clone(); const p = pos.clone(); p.play(m); const np = [...path, c.data.san];
    for (const t of c.data.comments || []) { const pl = L.playedLines(t, p, prev); if (pl.length || /\(/.test(t)) console.log('at', np.join(' '), '\n   lines:', pl.map((x) => x.sans.join(' ') + ' [' + x.ucis.length + '/' + x.line.moves.length + ']').join(' | ') || 'NONE'); }
    walk(c, p, np);
  }
}
for (const g of parsePgn(readFileSync(process.argv[2], 'utf8'))) { console.log('==', g.headers.get('Event')); walk(g.moves, startingPosition(g.headers).unwrap(), []); }
