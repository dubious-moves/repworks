// node sfscreen.mjs <study> "<prefix>" <ms> > out: for every White move under the prefix, Stockfish's top 3 and our move's eval (White's view)
import { readFileSync } from 'node:fs'; import { spawn } from 'node:child_process';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js'); const { Chess } = await import(B + 'chess.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const { makeFen } = await import(B + 'fen.js'); const { parseUci, makeUci } = await import(B + 'util.js');
const [f, pre, ms = '2500'] = process.argv.slice(2);
const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === 'Jobava simplified');
const want = pre.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/); let n = g.moves; const pos = Chess.default();
for (const s of want) { n = n.children.find((c) => c.data.san === s); pos.play(parseSan(pos, s)); }
const jobs = [];
const walk = (n, p, path) => { for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (p.turn === 'white') jobs.push({ path: [...path], pos: p.clone(), ours: c.data.san, uci: makeUci(mv) }); q.play(mv); walk(c, q, [...path, c.data.san]); } };
// n is the node of the prefix's last move; its children are the next moves
walk(n, pos, want);
const sf = spawn('/usr/games/stockfish'); let buf = ''; let on = null;
sf.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); on && on(l); } });
const send = (s) => sf.stdin.write(s + '\n');
const go = (fen, ms, mpv, sm) => new Promise((res) => { const L = {}; on = (l) => { const m = /multipv (\d+) .*score (cp|mate) (-?\d+).* pv (\S+)/.exec(l); if (m) L[m[1]] = { cp: m[2] === 'mate' ? Math.sign(+m[3]) * 10000 : +m[3], u: m[4] }; if (l.startsWith('bestmove')) res(L); };
  send(`setoption name MultiPV value ${mpv}`); send('position fen ' + fen); send(`go movetime ${ms}${sm ? ' searchmoves ' + sm : ''}`); });
send('uci'); send('setoption name Threads value 4'); send('setoption name Hash value 256');
const num = (i, s) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s);
for (const j of jobs) { const fen = makeFen(j.pos.toSetup()); const L = await go(fen, +ms, 3);
  const top = Object.values(L).map((x) => ({ san: makeSan(j.pos, parseUci(x.u)), cp: x.cp }));
  let o = top.find((x) => x.san === j.ours); if (!o) { const M = await go(fen, Math.round(+ms / 2), 1, j.uci); o = { san: j.ours, cp: M['1']?.cp }; }
  const d = top[0].cp - o.cp; const line = [...j.path, j.ours].map((s, i) => num(i, s)).join(' ');
  console.log(`${d >= 50 ? 'FLAG' : '    '} ${(d / 100).toFixed(2).padStart(5)} | ${line} | ours ${(o.cp / 100).toFixed(2)} | ${top.map((x) => x.san + ' ' + (x.cp / 100).toFixed(2)).join(', ')}`); }
sf.kill();
