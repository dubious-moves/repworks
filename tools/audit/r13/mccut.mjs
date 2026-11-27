// node mccut.mjs <study> <inv.json>...: positions in the before-inventories whose most common drilled reply is no longer in the study
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js');
const [f, ...invs] = process.argv.slice(2);
const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === 'Jobava simplified');
const find = (path) => { let n = g.moves; for (const s of path.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/)) { n = n.children.find((c) => c.data.san === s); if (!n) return null; } return n; };
let tot = 0;
for (const inv of invs) { const rows = JSON.parse(readFileSync(inv, 'utf8')); let k = 0;
  for (const r of rows) { const top = [...r.reps].sort((a, b) => b.share - a.share)[0]; if (!top) continue;
    const n = find(r.path); if (!n) continue; // the position itself was cut further up
    if (!n.children.find((c) => c.data.san === top.san)) { k++; console.log(`${r.path} | ${top.san} ${(100 * top.share).toFixed(0)}% 1 in ${Math.round(1 / (top.reachAll ?? top.reach)).toLocaleString('en')} | drilled now: ${n.children.map((c) => c.data.san).join(',') || '-'}`); } }
  console.log(`== ${inv}: ${k}`); tot += k; }
console.log('total', tot);
