// node thinscan.mjs <study.pgn> <out.json> [minNodeReach]: Black-to-move positions in the Jobava chapters (incl. line ends) reached >= minNodeReach
// (explorer shares from 1.Nc3, our moves always played) whose explorer game count is under 100: the "likely but few games" positions.
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync } from 'node:fs';
const CF = new URL('./cache.json', import.meta.url).pathname; const cache = JSON.parse(readFileSync(CF, 'utf8')); let fetched = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function explorer(fen) { const k = 'x16|' + fen; if (cache[k]) return cache[k];
  for (;;) { const r = await fetch(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=30&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { headers: { Authorization: 'Bearer ' + process.env.LICHESS_TOKEN } });
    if (r.status === 429) { await sleep(61000); continue; } const e = await r.json();
    cache[k] = { n: e.white + e.draws + e.black, moves: e.moves.map((m) => ({ san: m.san, n: m.white + m.draws + m.black, w: (m.white + m.draws / 2) / Math.max(1, m.white + m.draws + m.black), r: m.averageRating })) }; fetched++; await sleep(3800); return cache[k]; } }
const key = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const [inF, outF, minR] = process.argv.slice(2); const MIN = +(minR || 0.00005); const gs = parsePgn(readFileSync(inF, 'utf8'));
const cont = new Set(); for (const g of gs) { const w = (n, p) => { if (n.children.length) cont.add(key(p)); for (const c of n.children) { const q = p.clone(); q.play(parseSan(q, c.data.san)); w(c, q); } }; w(g.moves, startingPosition(g.headers).unwrap()); }
const best = new Map();
for (const g of gs) { const ch = g.headers.get('ChapterName'); if (!ch.startsWith('Jobava')) continue;
  const w = async (n, p, path, reach) => {
    let ex = null; if (p.turn === 'black' || path.length < 2) ex = await explorer(makeFen(p.toSetup()));
    if (p.turn === 'black' && path.length >= 3 && reach >= MIN && ex.n < 100) { const k = key(p);
      const covered = ex.moves.filter((m) => { const q = p.clone(); const mv = parseSan(q, m.san); if (!mv) return false; q.play(mv); return cont.has(key(q)); }).map((m) => m.san);
      const kids = n.children.map((c) => c.data.san);
      const rec = { ch, path: path.join(' '), fen: makeFen(p.toSetup()), reach, n: ex.n, leaf: !n.children.length, kids, covered, ex: ex.moves.slice(0, 8).map((m) => [m.san, m.n]) };
      if (!best.has(k) || best.get(k).reach < reach) best.set(k, rec); }
    if (!n.children.length) return;
    for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const san = makeSan(p, mv); let r = reach;
      if (p.turn === 'black' && ex) { const m = ex.moves.find((x) => x.san === san); r = reach * (m ? m.n / Math.max(1, ex.n) : 0); }
      q.play(mv); await w(c, q, path.concat(san), r); } };
  await w(g.moves, startingPosition(g.headers).unwrap(), [], 1); }
const res = [...best.values()].sort((a, b) => b.reach - a.reach);
writeFileSync(outF, JSON.stringify(res, null, 1)); if (fetched) writeFileSync(CF, JSON.stringify(cache));
console.log('thin positions', res.length, 'leaves', res.filter((r) => r.leaf).length, 'fetched', fetched);
