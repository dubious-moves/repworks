// node compare.mjs <difficulty --prefix output> <current chapter file> <inv.json>: each Black reply's hardest next move vs drilled now or not
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js');
const [out, chap, invf] = process.argv.slice(2);
const g = parsePgn(readFileSync(chap, 'utf8'))[0];
const sans = (s) => s.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
const has = (path) => { let n = g.moves; for (const s of path) { n = n.children.find((c) => c.data.san === s); if (!n) return false; } return true; };
const inv = {}; for (const r of JSON.parse(readFileSync(invf, 'utf8'))) { const p = sans(r.path).join(' '); for (const y of r.reps) inv[p + ' ' + y.san] = y; }
const rows = [];
for (const l of readFileSync(out, 'utf8').split('\n')) { const m = /^(.*) \| hardest: (\S+) expLoss ([\d.]+), pFind (\d+)%/.exec(l); if (!m) continue;
  const path = sans(m[1]); const y = inv[path.join(' ')]; const drilled = has(path);
  const common = y && (y.reachAll ?? y.reach) >= 1 / 2000 && y.share >= 0.1;
  rows.push({ line: m[1], move: m[2], h: +m[3], p: +m[4], drilled, common, share: y ? Math.round(100 * y.share) : null, reach: y ? Math.round(1 / (y.reachAll ?? y.reach)) : null }); }
const tag = (r) => r.h >= 4 ? 'HARD' : r.h >= 2.5 ? 'mid ' : 'easy';
for (const r of rows.sort((a, b) => b.h - a.h)) console.log(`${tag(r)} ${r.h.toFixed(1).padStart(5)} ${r.drilled ? 'DRILLED  ' : 'clickable'} ${r.common ? 'common' : '      '} ${String(r.share ?? '?').padStart(3)}% 1/${r.reach ?? '?'} | ${r.line.replace('1.Nc3 d5 2.d4 Nf6 3.Bf4 ', '')} | hardest ${r.move} (found ${r.p}%)`);
