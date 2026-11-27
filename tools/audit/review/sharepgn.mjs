// node sharepgn.mjs <study.pgn> <chapter> <out.pgn> [--fetch]: the chapter with moves only, Black's moves carrying {NN%} share comments (explorer 1600-2500)
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition, makePgn } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const cacheFile = D + 'cache.json'; const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
const save = () => writeFileSync(cacheFile, JSON.stringify(cache));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, hdr) { for (let i = 0; ; i++) { const r = await fetch(url, { headers: hdr }); if (r.status === 429) { await sleep(61000); continue; } if (!r.ok) { if (i < 3) { await sleep(5000); continue; } throw new Error(url + ' ' + r.status); } return r.json(); } }
async function explorer(fen) { const k = 'x16|' + fen; if (cache[k]) return cache[k];
  const e = await get(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=20&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { Authorization: 'Bearer ' + process.env.LICHESS_TOKEN });
  cache[k] = { n: e.white + e.draws + e.black, moves: e.moves.map((m) => ({ san: m.san, n: m.white + m.draws + m.black, w: (m.white + m.draws / 2) / Math.max(1, m.white + m.draws + m.black), r: m.averageRating })) };
  if (Object.keys(cache).length % 20 === 0) save(); await sleep(1100); return cache[k]; }
const [f, chapter, out, fetchFlag] = process.argv.slice(2);
const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === chapter);
let need = 0, have = 0;
let dropped = 0; const isJoin = (c) => !c.children.length && /transposes to|continues in/.test((c.data.comments || []).join(' '));
const w = async (n, p) => { const before = n.children.length; n.children = n.children.filter((c) => !isJoin(c)); dropped += before - n.children.length; const black = p.turn === 'black'; const fen = makeFen(p.toSetup());
  if (black && n.children.length) { const k = 'x16|' + fen; if (cache[k]) have++; else need++;
    const ex = cache[k] || (fetchFlag ? await explorer(fen) : null);
    for (const c of n.children) { const san = makeSan(p, parseSan(p.clone(), c.data.san)); const m = ex && ex.moves.find((x) => x.san === san);
      c.data.comments = ex ? [`${(100 * (m ? m.n : 0) / Math.max(1, ex.n)).toFixed(1)}%`] : []; } }
  else for (const c of n.children) c.data.comments = [];
  for (const c of n.children) { c.data.startingComments = []; c.data.nags = []; const q = p.clone(); q.play(parseSan(q, c.data.san)); await w(c, q); } };
await w(g.moves, startingPosition(g.headers).unwrap());
if (fetchFlag) save();
g.headers = new Map([['Event', `1. Nc3: ${chapter}`], ['White', 'Repertoire'], ['Black', '?'], ['Result', '*']]);
writeFileSync(out, makePgn(g));
console.log('black positions cached', have, 'missing', need, 'join ends dropped', dropped);
