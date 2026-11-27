// node alldec.mjs <study.pgn> <out.json>: every White decision in the study (chapter, path, fen, our move, reach from cache.json, no fetching)
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync } from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const cache = JSON.parse(readFileSync(D + 'cache.json', 'utf8'));
const [f, out] = process.argv.slice(2);
const res = [];
for (const g of parsePgn(readFileSync(f, 'utf8'))) {
  const ch = g.headers.get('ChapterName');
  const w = (n, p, path, reach) => {
    const fen = makeFen(p.toSetup());
    let ex = null; if (p.turn === 'black') ex = cache['x16|' + fen];
    if (p.turn === 'black' && n.children.length) res.push({ ch, path: path.join(' '), fen, black: true, n: ex ? ex.n : null, replies: ex ? ex.moves.slice(0, 12).map((m) => [m.san, m.n, +(100 * m.n / Math.max(1, ex.n)).toFixed(1), +(100 * m.w).toFixed(1)]) : null, ours: n.children.map((c) => makeSan(p, parseSan(p.clone(), c.data.san))), reach });
    if (p.turn === 'white' && n.children.length) res.push({ ch, path: path.join(' '), fen, moves: n.children.map((c) => makeSan(p, parseSan(p.clone(), c.data.san))), reach });
    for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const san = makeSan(q, mv);
      let r = reach; if (p.turn === 'black') { if (ex && r != null) { const m = ex.moves.find((x) => x.san === san); r = r * (m ? m.n / Math.max(1, ex.n) : 0); } else r = null; }
      q.play(mv); w(c, q, [...path, san], r); }
  };
  w(g.moves, startingPosition(g.headers).unwrap(), [], 1);
}
writeFileSync(out, JSON.stringify(res)); console.log(res.length, 'decisions;', res.filter((r) => r.reach == null).length, 'without reach');
