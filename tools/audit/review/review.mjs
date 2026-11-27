// node review.mjs <study.pgn> <chapter> <out.json>: every White move of a chapter against the explorer (2000-2499) and ChessDB,
// Black's 2%+ replies the study doesn't cover, and line ends by reach. Explorer and ChessDB answers are cached in review/cache.json.
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const [studyFile, chapter, outFile] = process.argv.slice(2);
const cacheFile = D + 'cache.json'; const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
const save = () => writeFileSync(cacheFile, JSON.stringify(cache));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, hdr) { for (let i = 0; ; i++) { const r = await fetch(url, { headers: hdr }); if (r.status === 429) { await sleep(61000); continue; } if (!r.ok) { if (i < 3) { await sleep(5000); continue; } throw new Error(url + ' ' + r.status); } return r.json(); } }
async function explorer(fen) { const k = 'x16|' + fen; if (cache[k]) return cache[k];
  const e = await get(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=20&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { Authorization: 'Bearer ' + process.env.LICHESS_TOKEN });
  cache[k] = { n: e.white + e.draws + e.black, moves: e.moves.map((m) => ({ san: m.san, n: m.white + m.draws + m.black, w: (m.white + m.draws / 2) / Math.max(1, m.white + m.draws + m.black), r: m.averageRating })) };
  save(); await sleep(1100); return cache[k]; }
async function chessdb(fen) { const k = 'c|' + fen; if (cache[k]) return cache[k];
  let c = {}; try { c = await get(`https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(fen)}&json=1`, {}); } catch {}
  cache[k] = (c.moves || []).map((m) => ({ san: m.san, cp: m.score })); save(); await sleep(300); return cache[k]; }
const winp = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const key = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const games = parsePgn(readFileSync(studyFile, 'utf8'));
const studyPos = new Set(); // positions (any side to move) where the study continues
for (const g of games) { const w = (n, p) => { if (n.children.length) studyPos.add(key(p)); for (const c of n.children) { const q = p.clone(); q.play(parseSan(q, c.data.san)); w(c, q); } }; w(g.moves, startingPosition(g.headers).unwrap()); }
const g = games.find((x) => x.headers.get('ChapterName') === chapter);
const res = { white: [], uncovered: [], ends: [] };
const rootEx = await explorer(makeFen(startingPosition(g.headers).unwrap().toSetup()).replace(/ w /, ' w ')); // start position (for the 1.Nc3 share base)
async function walk(n, p, path, reach) {
  if (!n.children.length) { res.ends.push({ path: path.join(' '), ply: path.length, reach, note: (n.data.comments || []).some((t) => /transposes|continues/.test(t)) }); return; }
  const fen = makeFen(p.toSetup()); const ex = await explorer(fen);
  if (p.turn === 'white') {
    const cdb = await chessdb(fen); const cd = new Map(cdb.map((m) => [m.san, m.cp]));
    for (const c of n.children) {
      const q = p.clone(); const mv = parseSan(q, c.data.san); const san = makeSan(p, mv); const m = ex.moves.find((x) => x.san === san) || { n: 0, w: null, r: null };
      const alts = ex.moves.filter((x) => x.san !== san && x.n >= Math.max(30, 0.02 * ex.n)).map((x) => ({ san: x.san, n: x.n, share: x.n / ex.n, w: x.w, r: x.r, cp: cd.get(x.san) ?? null }));
      res.white.push({ path: path.join(' '), move: san, n: m.n, share: ex.n ? m.n / ex.n : 0, w: m.w, r: m.r, cp: cd.get(san) ?? null, best: cdb[0] || null, alts, reach, total: ex.n });
      q.play(mv); await walk(c, q, path.concat(san), reach);
    }
  } else {
    const kids = new Set(n.children.map((c) => { const q = p.clone(); return makeSan(p, parseSan(q, c.data.san)); }));
    for (const m of ex.moves) { const share = m.n / Math.max(1, ex.n); if (share < 0.02 || kids.has(m.san)) continue;
      const q = p.clone(); const mv = parseSan(q, m.san); if (!mv) continue; q.play(mv);
      res.uncovered.push({ path: path.concat(m.san).join(' '), share, n: m.n, reach: reach * share, transposes: studyPos.has(key(q)) }); }
    for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const san = makeSan(p, mv); const m = ex.moves.find((x) => x.san === san);
      const share = m ? m.n / Math.max(1, ex.n) : 0; q.play(mv); await walk(c, q, path.concat(san), reach * share); }
  }
}
// reach is relative to 1.Nc3 games at 2000-2499: start from the position after 1.Nc3
const start = startingPosition(g.headers).unwrap(); const first = g.moves.children[0]; const p1 = start.clone(); p1.play(parseSan(p1, first.data.san));
await walk(first, p1, [first.data.san], 1);
writeFileSync(outFile, JSON.stringify(res, null, 1));
console.log('white moves', res.white.length, 'uncovered', res.uncovered.length, 'ends', res.ends.length);
