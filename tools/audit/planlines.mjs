// node --experimental-strip-types planlines.mjs <pgn>: every comment's clickable lines, played as repworks plays them
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan } = await import(B + 'san.js');
const L = await import('/home/user/repworks/src/core/repertoire/lines.ts');
import { readFileSync } from 'node:fs';
let comments = 0, withLines = 0, lines = 0, full = 0, partial = 0, dead = 0, plies = 0; const bad = [];
for (const g of parsePgn(readFileSync(process.argv[2], 'utf8'))) {
  const walk = (n, pos, path) => { for (const c of n.children) { const q = pos.clone(); const mv = parseSan(q, c.data.san); q.play(mv);
    for (const t of c.data.comments || []) { comments++; const parsed = L.parseCommentLines(t); if (!parsed.length) continue; withLines++;
      const pl = L.playedLines(t, q, pos);
      pl.forEach((p, i) => { lines++; const want = parsed[i].moves.length, got = p.ucis.length; plies += got;
        if (got === want) full++; else if (got > 0) partial++; else dead++;
        if (got < want && bad.length < 6) bad.push(`${path.concat(c.data.san).join(' ')} | ${t.slice(0, 120)} | played ${got}/${want}`); }); }
    walk(c, q, path.concat(c.data.san)); } };
  walk(g.moves, startingPosition(g.headers).unwrap(), []);
}
console.log(`comments ${comments}, with clickable lines ${withLines}; lines ${lines}: fully playable ${full}, partly ${partial}, not at all ${dead}; avg plies ${(plies / lines).toFixed(1)}`);
bad.forEach((b) => console.log('  ' + b));
