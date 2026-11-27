// node shares.mjs <in.pgn> <out.pgn>: every Black move gets its explorer share (1600-2500, blitz/rapid/classical) as a leading "{ NN% }" comment
// (an existing leading percentage is replaced); explorer answers from review/cache.json, missing ones fetched (LICHESS_TOKEN) and cached
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, makePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync } from 'node:fs';
const CF = new URL('../review/cache.json', import.meta.url).pathname; const cache = JSON.parse(readFileSync(CF, 'utf8')); let fetched = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function explorer(fen) { const k = 'x16|' + fen; if (cache[k]) return cache[k];
  for (;;) { const r = await fetch(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=30&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { headers: { Authorization: 'Bearer ' + process.env.LICHESS_TOKEN } });
    if (r.status === 429) { await sleep(61000); continue; } const e = await r.json();
    cache[k] = { n: e.white + e.draws + e.black, moves: e.moves.map((m) => ({ san: m.san, n: m.white + m.draws + m.black, w: (m.white + m.draws / 2) / Math.max(1, m.white + m.draws + m.black), r: m.averageRating })) }; fetched++; await sleep(3800); return cache[k]; } }
const [inF, outF] = process.argv.slice(2); const gs = parsePgn(readFileSync(inF, 'utf8')); let set = 0, zero = 0;
for (const g of gs) { const w = async (n, p) => { const ex = p.turn === "black" && n.children.length && p.fullmoves > 1 ? await explorer(makeFen(p.toSetup())) : null;
    for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san);
      if (ex) { const san = makeSan(p, mv); const m = ex.moves.find((x) => x.san === san); const pct = ex.n ? 100 * (m ? m.n : 0) / ex.n : 0;
        const lab = pct >= 10 ? pct.toFixed(0) : pct >= 1 ? pct.toFixed(1) : pct.toFixed(2); const cs = (c.data.comments || []).filter((t) => !/^\s*[\d.]+%\s*$/.test(t));
        // keep owner text after a leading percentage, e.g. "46% - Most common move"
        const cs2 = cs.map((t) => t.replace(/^\s*[\d.]+%\s*-\s*/, ''));
        c.data.comments = [`${lab}%`, ...cs2]; set++; if (!m) zero++; }
      q.play(mv); await w(c, q); } };
  await w(g.moves, startingPosition(g.headers).unwrap()); }
writeFileSync(outF, gs.map((g) => makePgn(g)).join('\n')); if (fetched) writeFileSync(CF, JSON.stringify(cache));
console.log('shares set', set, 'not in explorer', zero, 'fetched', fetched);
