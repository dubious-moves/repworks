// node sub_inv.mjs <study> "<path>" <out.json>: every Black-to-move position below the path (Jobava simplified) with drilled replies:
// per reply: share, games, reach (from 1.Nc3, explorer shares), White moves below it, single-move branch?, our move; fetches missing explorer data
import { readFileSync, writeFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
const cache = JSON.parse(readFileSync('cache.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function explorer(fen) { const k = 'x16|' + fen; if (cache[k]) return cache[k];
  for (;;) { const r = await fetch(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=20&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { headers: { Authorization: 'Bearer ' + process.env.LICHESS_TOKEN } });
    if (r.status === 429) { await sleep(61000); continue; } const e = await r.json();
    cache[k] = { n: e.white + e.draws + e.black, moves: e.moves.map((m) => ({ san: m.san, n: m.white + m.draws + m.black, w: (m.white + m.draws / 2) / Math.max(1, m.white + m.draws + m.black), r: m.averageRating })) }; await sleep(1100); return cache[k]; } }
const [sf, path, out] = process.argv.slice(2);
const g = parsePgn(readFileSync(sf, 'utf8')).find((x) => x.headers.get('ChapterName') === 'Jobava simplified');
const want = path.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
const fmt = (sans) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
const wcount = (n, white) => n.children.reduce((a, c) => a + (white ? 1 : 0) + wcount(c, !white), 0);
const rows = [];
const keyOf = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const allReach = new Map();
async function pre(n, p, reach) { let ex = null; if (p.turn === 'black') { ex = await explorer(makeFen(p.toSetup())); const k = keyOf(p); allReach.set(k, (allReach.get(k) || 0) + reach); }
  for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (!mv) continue; const s = makeSan(q, mv); let r = reach;
    if (ex) { const m = ex.moves.find((x) => x.san === s); r = reach * (m ? m.n / Math.max(1, ex.n) : 0); } q.play(mv); await pre(c, q, r); } }
await pre(g.moves, startingPosition(g.headers).unwrap(), 1);
async function w(n, p, sans, reach) {
  const inSub = sans.length >= want.length && want.every((s, i) => s === sans[i]);
  const onPath = want.slice(0, sans.length).every((s, i) => s === sans[i]);
  if (!inSub && !onPath) return;
  let ex = null; if (p.turn === 'black') ex = await explorer(makeFen(p.toSetup()));
  if (p.turn === 'black' && inSub && n.children.length) {
    const reps = n.children.map((c) => { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); const m = ex.moves.find((x) => x.san === s); const share = m ? m.n / Math.max(1, ex.n) : 0;
      q.play(mv); const wm = c.children.map((cc) => makeSan(q, parseSan(q, cc.data.san)));
      return { san: s, share, games: m ? m.n : 0, reach: reach * share, reachAll: (allReach.get(keyOf(p)) || reach) * share, our: wm.join('/'), wBelow: wcount(c, true), single: c.children.length === 1 && c.children[0].children.length === 0, comment: (c.children[0]?.data.comments || []).join(' ').slice(0, 60) }; });
    const missing = ex.moves.filter((m) => !reps.find((r) => r.san === m.san)).map((m) => ({ san: m.san, share: m.n / Math.max(1, ex.n), games: m.n })).filter((m) => m.share >= 0.02);
    rows.push({ path: fmt(sans), games: ex.n, reach, reachAll: allReach.get(keyOf(p)) || reach, reps, missing, white: (n.data?.comments || []).join(' ').slice(0, 80) });
  }
  for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); const s = makeSan(q, mv); let r = reach;
    if (ex) { const m = ex.moves.find((x) => x.san === s); r = reach * (m ? m.n / Math.max(1, ex.n) : 0); }
    q.play(mv); await w(c, q, [...sans, s], r); }
}
await w(g.moves, startingPosition(g.headers).unwrap(), [], 1);
writeFileSync('cache.json', JSON.stringify(cache)); writeFileSync(out, JSON.stringify(rows, null, 1));
const one = (x) => x >= 1 ? '-' : x > 0 ? `1 in ${Math.round(1 / x).toLocaleString('en')}` : '0';
let ns = 0, nr = 0;
for (const r of rows) { console.log(`\n${r.path} | ${r.games} games | ${one(r.reach)}${r.reachAll > r.reach * 1.05 ? ' (all orders ' + one(r.reachAll) + ')' : ''}`); for (const x of r.reps) { nr++; if (x.single) ns++; console.log(`   ${x.san.padEnd(6)} ${(100 * x.share).toFixed(0).padStart(3)}% ${String(x.games).padStart(6)}g ${one(x.reachAll).padStart(14)}  -> ${x.our.padEnd(6)} ${x.single ? 'SINGLE' : 'W' + x.wBelow}`); }
  if (r.missing.length) console.log('   not covered: ' + r.missing.map((m) => `${m.san} ${(100 * m.share).toFixed(0)}% ${m.games}g`).join(', ')); }
console.log(`\npositions ${rows.length}, replies ${nr}, single-move ${ns}`);
