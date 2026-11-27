// node coms.mjs <study.pgn> <owner.pgn> <out.json>: existing study nodes whose owner comment is new/changed (normalised), with the owner's merged comment
import { readFileSync, writeFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const name = 'Jobava simplified'; const [sf, of, out] = process.argv.slice(2);
const norm = (t) => t.replace(/\s+/g, ' ').replace(/\s*\(/g, ' (').replace(/ ?\| ?\[%/g, ' [%').replace(/\]\s*\[%/g, '][%').trim();
const load = (f) => { const m = new Map(); const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === name); const w = (n, p, path) => { for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); q.play(mv); const np = [...path, s]; m.set(np.join(' '), (c.data.comments || []).map((x) => x.trim()).filter(Boolean)); w(c, q, np); } }; w(g.moves, startingPosition(g.headers).unwrap(), []); return m; };
const A = load(sf), O = load(of); const res = [];
for (const [k, oc] of O) { if (!A.has(k)) continue; const a = norm(A.get(k).join(' ')), o = norm(oc.join(' ')); if (!o || a === o) continue; res.push({ path: k, study: A.get(k).join(' '), owner: oc.join(' ') }); }
writeFileSync(out, JSON.stringify(res, null, 1)); for (const r of res) console.log(r.path, '\n  S:', r.study.slice(0, 120).replace(/\n/g, ' '), '\n  O:', r.owner.slice(0, 120).replace(/\n/g, ' '));
