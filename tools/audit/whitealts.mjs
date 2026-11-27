// node whitealts.mjs <pgn>...: positions where White has more than one move, by move path; also illegal moves
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js');
const { parseSan, makeSan } = await import(B + 'san.js');
const { makeFen } = await import(B + 'fen.js');
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const seen = new Map(); let bad = 0;
  for (const g of parsePgn(readFileSync(f, 'utf8'))) {
    const walk = (node, pos, path) => {
      const kids = node.children;
      for (const c of kids) {
        const q = pos.clone(); const mv = parseSan(q, c.data.san);
        if (!mv) { bad++; console.log('  ILLEGAL', path.join(' '), c.data.san); continue; }
        if (pos.turn === 'white') {
          const k = makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ');
          if (!seen.has(k)) seen.set(k, { path: path.join(' '), moves: new Set() });
          seen.get(k).moves.add(makeSan(pos, mv));
        }
        q.play(mv); walk(c, q, path.concat(c.data.san));
      }
    };
    walk(g.moves, startingPosition(g.headers).unwrap(), []);
  }
  const alts = [...seen.values()].filter((v) => v.moves.size > 1);
  console.log(`${f.split('/').pop()}: ${seen.size} White positions, ${alts.length} with more than one White move, ${bad} illegal`);
  for (const a of alts) console.log(`  after ${a.path || '(start)'}: ${[...a.moves].join(' / ')}`);
}
