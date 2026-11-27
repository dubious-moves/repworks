// node owntag.mjs <inv.json> <prefix> <owner pgn>...: the inventory rows under prefix, each reply tagged C (common: 1 in 2,000+ and 10%+), O (reply node is in an owner file), S (single-move)
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const [invF, prefix, ...owners] = process.argv.slice(2);
const own = new Set(); const fmt = (sans) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
for (const f of owners) for (const g of parsePgn(readFileSync(f, 'utf8'))) { const w = (n, p, path) => { for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (!mv) continue; const s = makeSan(q, mv); q.play(mv); const np = [...path, s]; own.add(fmt(np)); w(c, q, np); } }; w(g.moves, startingPosition(g.headers).unwrap(), []); }
const one = (x) => x >= 1 ? '-' : x > 0 ? `1 in ${Math.round(1 / x).toLocaleString('en')}` : '0';
for (const r of JSON.parse(readFileSync(invF, 'utf8'))) { if (!r.path.startsWith(prefix)) continue; const out = [];
  for (const y of r.reps) { const C = (y.reachAll ?? y.reach) >= 1 / 2000 && y.share >= 0.1; const O = own.has(r.path + ' ' + y.san); out.push(`   ${C ? 'C' : ' '}${O ? 'O' : ' '}${y.single ? 'S' : ' '} ${y.san.padEnd(6)} ${(100 * y.share).toFixed(0).padStart(3)}% ${one(y.reachAll ?? y.reach).padStart(13)} -> ${y.our}${y.single ? '' : ' (W' + y.wBelow + ')'}`); }
  console.log(`${r.path} | ${one(r.reachAll ?? r.reach)}\n${out.join('\n')}`); }
