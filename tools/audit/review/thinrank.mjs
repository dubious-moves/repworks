// blend explorer games with Maia (2000/2200 averaged) at thin positions; uncovered mass vs a study (by position)
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { Chess } = await import(B + 'chess.js'); const { parseSan } = await import(B + 'san.js'); const { makeFen, parseFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const key = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const cont = new Set(); for (const g of parsePgn(readFileSync(process.argv[2], 'utf8'))) { const w = (n, p) => { if (n.children.length) cont.add(key(p)); for (const c of n.children) { const q = p.clone(); q.play(parseSan(q, c.data.san)); w(c, q); } }; w(g.moves, startingPosition(g.headers).unwrap()); }
const T = JSON.parse(readFileSync(D + 'thin_v10.json', 'utf8')); const out = [];
T.forEach((t, i) => { const f = D + 'thinmaia/' + i + '.txt'; if (!existsSync(f)) return;
  const maia = {}; for (const l of readFileSync(f, 'utf8').split('\n')) { const m = /^Maia (\d+).*?\): (.*)$/.exec(l); if (!m) continue; for (const part of m[2].split(', ')) { const [san, p] = part.split(' '); maia[san] = (maia[san] || 0) + parseFloat(p) / 200; } }
  const pos = Chess.fromSetup(parseFen(t.fen).unwrap()).unwrap(); const ex = Object.fromEntries(t.ex);
  const moves = new Set([...Object.keys(maia), ...Object.keys(ex)]); const n = t.n; const rows = [];
  for (const san of moves) { const g = ex[san] || 0, mp = maia[san] || 0; const share = n >= 10 ? (g + 20 * mp) / (n + 20) : mp;
    const q = pos.clone(); const mv = parseSan(q, san); if (!mv) continue; q.play(mv); rows.push({ san, share, games: g, maia: mp, covered: cont.has(key(q)) }); }
  rows.sort((a, b) => b.share - a.share);
  const cur = cont.has(key(pos)) || true; const unc = rows.filter((r) => !r.covered && r.share >= 0.05);
  out.push({ i, path: t.path, reach: t.reach, n, leaf: t.leaf, stillIn: true, unc, unMass: unc.reduce((a, r) => a + r.share, 0), rows: rows.slice(0, 6) }); });
// is the position still in the study? (positions removed by later rounds)
for (const o of out) { const p = Chess.default(); for (const s of o.path.split(' ')) p.play(parseSan(p, s)); o.stillIn = [...cont].length > 0 && (cont.has(key(p)) || o.leaf); }
out.sort((a, b) => b.reach * b.unMass - a.reach * a.unMass);
writeFileSync(D + 'thin_rank.json', JSON.stringify(out, null, 1));
const num = (p) => p.split(' ').map((m, i) => (i % 2 ? '' : (i / 2 + 1) + '.') + m).join(' ');
for (const o of out.slice(0, 45)) console.log(`${(100 * o.reach).toFixed(3)}% ${o.n}g ${o.leaf ? 'END ' : '    '}${num(o.path)} | missing: ${o.unc.map((r) => `${r.san} ${(100 * r.share).toFixed(0)}%`).join(', ') || '-'} | covered: ${o.rows.filter((r) => r.covered).map((r) => r.san).join(',')}`);
