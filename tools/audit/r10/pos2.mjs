// node pos2.mjs <study.pgn> <owner.pgn> <out.json>: White moves in the owner's chapter not in the study's (new nodes + moves in new/changed comment lines), with ChessDB top moves
import { readFileSync, writeFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
const L = await import('/home/user/repworks/src/core/repertoire/lines.ts');
const cache = JSON.parse(readFileSync('cache.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdb(fen) { const k = 'c|' + fen; if (cache[k]) return cache[k]; const r = await fetch('https://www.chessdb.cn/cdb.php?action=queryall&json=1&board=' + encodeURIComponent(fen)); const j = await r.json(); cache[k] = (j.moves || []).map((m) => ({ san: m.san, cp: m.score })); await sleep(400); return cache[k]; }
const name = 'Jobava simplified'; const norm = (t) => t.replace(/\s+/g, ' ').replace(/ ?\| ?\[%/g, ' [%').trim();
const [sf, of, out] = process.argv.slice(2);
const sm = new Map(); { const g = parsePgn(readFileSync(sf, 'utf8')).find((x) => x.headers.get('ChapterName') === name); const w = (n, p, path) => { for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); q.play(mv); const np = [...path, s]; sm.set(np.join(' '), norm((c.data.comments || []).join(' '))); w(c, q, np); } }; w(g.moves, startingPosition(g.headers).unwrap(), []); }
const dec = []; const seen = new Set();
const add = (path, san, src) => { const k = path.join(' ') + '|' + san; if (seen.has(k) || sm.has([...path, san].join(' '))) return; seen.add(k); dec.push({ path: [...path], own: san, src }); };
const g = parsePgn(readFileSync(of, 'utf8')).find((x) => x.headers.get('ChapterName') === name);
const w = (n, p, path) => { for (const c of n.children) { const prev = p.clone(); const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); if (q.turn === 'white') add(path, s, 'tree'); q.play(mv); const np = [...path, s];
    const com = (c.data.comments || []).join(' '); if (com && norm(com) !== sm.get(np.join(' '))) for (const pl of L.playedLines(com, q, prev)) {
      const q0 = q.clone(); const fromQ = !!parseSan(q0, pl.sans[0]); let r = (fromQ ? q : prev).clone(); let rp = fromQ ? [...np] : [...path];
      for (const x of pl.sans) { const m2 = parseSan(r, x); if (!m2) break; const s2 = makeSan(r, m2); if (r.turn === 'white') add(rp, s2, 'comment'); r.play(m2); rp.push(s2); } }
    w(c, q, np); } };
w(g.moves, startingPosition(g.headers).unwrap(), []);
const fmt = (sans) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ');
const res = [];
for (const d of dec) { const { Chess } = await import(B + 'chess.js'); const pos = Chess.default(); for (const s of d.path) pos.play(parseSan(pos, s));
  const c = await cdb(makeFen(pos.toSetup())); const cands = [d.own, ...c.slice(0, 3).map((x) => x.san)].filter((v, i, a) => a.indexOf(v) === i);
  res.push({ label: d.own, src: d.src, moves: fmt(d.path), candidates: cands, cdb: c.slice(0, 4) }); }
writeFileSync('cache.json', JSON.stringify(cache)); writeFileSync(out, JSON.stringify(res, null, 1));
for (const o of res) { const own = o.cdb.find((x) => x.san === o.label); const best = o.cdb[0]; console.log(`${o.src[0]} ${o.moves.slice(-70)} | ${o.label} ${own ? own.cp : '?'} | best ${best ? best.san + ' ' + best.cp : '-'}`); }
