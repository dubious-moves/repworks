// node gaps2.mjs <study.pgn> <owner.pgn>: in the owner's chapter, Black-to-move positions on new owner nodes (not in the study chapter) with children: explorer replies, reach; flags A (2%+, 50+ games) / B (20%+, position 10+ games) uncovered, reach >= 1/10000
import { readFileSync, writeFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
const cache = JSON.parse(readFileSync('cache.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function explorer(fen) { const k = 'x16|' + fen; if (cache[k]) return cache[k];
  for (;;) { const r = await fetch(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=20&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { headers: { Authorization: 'Bearer ' + process.env.LICHESS_TOKEN } });
    if (r.status === 429) { await sleep(61000); continue; } const e = await r.json();
    cache[k] = { n: e.white + e.draws + e.black, moves: e.moves.map((m) => ({ san: m.san, n: m.white + m.draws + m.black, w: (m.white + m.draws / 2) / Math.max(1, m.white + m.draws + m.black), r: m.averageRating })) }; await sleep(1100); return cache[k]; } }
const name = 'Jobava simplified'; const [sf, of] = process.argv.slice(2);
const sset = new Set(); { const g = parsePgn(readFileSync(sf, 'utf8')).find((x) => x.headers.get('ChapterName') === name); const w = (n, p, path) => { for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); q.play(mv); const np = [...path, s]; sset.add(np.join(' ')); w(c, q, np); } }; w(g.moves, startingPosition(g.headers).unwrap(), []); }
const g = parsePgn(readFileSync(of, 'utf8')).find((x) => x.headers.get('ChapterName') === name);
const fmt = (sans) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
const out = [];
async function w(n, p, path, reach, isNew) {
  if (p.turn === 'black' && isNew && n.children.length) {
    const ex = await explorer(makeFen(p.toSetup())); const kids = n.children.map((c) => { const q = p.clone(); return makeSan(q, parseSan(q, c.data.san)); });
    const miss = ex.moves.filter((m) => !kids.includes(m.san)).map((m) => ({ san: m.san, share: m.n / Math.max(1, ex.n), n: m.n }))
      .filter((m) => reach >= 1e-4 && ((m.share >= 0.02 && m.n >= 50) || (m.share >= 0.2 && ex.n >= 10)));
    out.push({ path: fmt(path), games: ex.n, reach, miss });
    if (miss.length) console.log(`GAP ${fmt(path)} | ${ex.n} games, reach 1 in ${Math.round(1 / reach)} | ` + miss.map((m) => `${m.san} ${(100 * m.share).toFixed(0)}% (${m.n})`).join(', '));
  }
  let ex = null; if (p.turn === 'black') ex = await explorer(makeFen(p.toSetup()));
  for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); let r = reach;
    if (ex) { const m = ex.moves.find((x) => x.san === s); r = reach * (m ? m.n / Math.max(1, ex.n) : 0); }
    q.play(mv); const np = [...path, s]; await w(c, q, np, r, isNew || !sset.has(np.join(' '))); }
}
await w(g.moves, startingPosition(g.headers).unwrap(), [], 1, false);
writeFileSync('cache.json', JSON.stringify(cache)); console.log('positions checked', out.length);
