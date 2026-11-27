// node diff.mjs <study.pgn> <owner.pgn> [chapter]: path diff of one chapter (owner vs study): changed White moves, added/removed branches, comment changes
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const [a, b, name = 'Jobava simplified'] = process.argv.slice(2);
const norm = (t) => t.replace(/\s+/g, ' ').trim();
function load(f) { const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === name); const m = new Map();
  const w = (n, p, path) => { const kids = []; for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (!mv) { console.log('ILLEGAL in', f, path.join(' '), c.data.san); continue; } const san = makeSan(q, mv); q.play(mv); kids.push(san); const np = [...path, san];
      m.set(np.join(' '), { com: norm((c.data.comments || []).join(' | ')), white: p.turn === 'white', kids: null }); w(c, q, np); }
    const k = path.join(' '); if (m.has(k)) m.get(k).kids = kids; else m.set(k, { kids, com: '', white: false, root: true }); };
  w(g.moves, startingPosition(g.headers).unwrap(), []); return m; }
const A = load(a), O = load(b);
const fmt = (path) => { const s = path.split(' ').filter(Boolean); return s.map((x, i) => (i % 2 === 0 ? `${i / 2 + 1}.${x}` : x)).join(' '); };
const leaves = (M, k) => { const out = []; const go = (p) => { const n = M.get(p); if (!n.kids || !n.kids.length) out.push(p); else for (const c of n.kids) go(p ? p + ' ' + c : c); }; go(k); return out; };
console.log('nodes study', A.size - 1, 'owner', O.size - 1);
console.log('\n## White moves changed (position where study and owner have different White moves)');
const changed = new Set();
for (const [k, n] of O) { const s = A.get(k); if (!s || !n.kids || !s.kids) continue; const ply = k ? k.split(' ').length : 0; if (ply % 2 !== 0) continue;
  const add = n.kids.filter((x) => !s.kids.includes(x)), rem = s.kids.filter((x) => !n.kids.includes(x)); if (add.length && rem.length) { changed.add(k); console.log(`- ${fmt(k)}: study ${rem.join('/')} -> owner ${add.join('/')}`); } else if (add.length && s.kids.length) console.log(`- ${fmt(k)}: owner ADDS a second White move ${add.join('/')} beside ${s.kids.join('/')}`); }
console.log('\n## Added branches (first new node; leaves below)');
for (const [k, n] of O) { if (A.has(k)) continue; const par = k.split(' ').slice(0, -1).join(' '); if (!A.has(par)) continue; if (changed.has(par)) continue;
  const lv = leaves(O, k); console.log(`- from ${fmt(k)} (${lv.length} line${lv.length > 1 ? 's' : ''}):`); for (const l of lv) console.log('    ' + fmt(l)); }
console.log('\n## Under changed White moves (owner lines)');
for (const k of changed) { for (const c of O.get(k).kids.filter((x) => !A.get(k).kids.includes(x))) { const kk = k + ' ' + c; for (const l of leaves(O, kk)) console.log('    ' + fmt(l)); } }
console.log('\n## Removed branches (in study, not in owner)');
for (const [k, n] of A) { if (!k || O.has(k)) continue; const par = k.split(' ').slice(0, -1).join(' '); if (!O.has(par)) continue; if (changed.has(par)) { continue; }
  const lv = leaves(A, k); console.log(`- ${fmt(k)} (${lv.length} line${lv.length > 1 ? 's' : ''} lost)`); }
console.log('\n## Comment changes on shared nodes');
for (const [k, n] of O) { const s = A.get(k); if (!s || !k) continue; if (s.com !== n.com) console.log(`- ${fmt(k)}\n    study: ${s.com.slice(0, 300)}\n    owner: ${n.com.slice(0, 300)}`); }
console.log('\n## Comments on added nodes');
for (const [k, n] of O) { if (A.has(k) || !n.com) continue; console.log(`- ${fmt(k)}: ${n.com.slice(0, 400)}`); }
