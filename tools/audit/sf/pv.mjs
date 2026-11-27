// node pv.mjs "<SAN line>" <ms> [multipv]: Stockfish's principal variations from the position after the line, in SAN, White's view
import { spawn } from 'node:child_process';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { Chess } = await import(B + 'chess.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js'); const { parseUci } = await import(B + 'util.js');
const [, , line, ms = '8000', mpv = '2'] = process.argv;
const pos = Chess.default(); for (const t of line.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean)) pos.play(parseSan(pos, t));
const sf = spawn('/usr/games/stockfish'); let buf = ''; const lines = {}; let done;
const fin = new Promise((r) => (done = r));
sf.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1);
  const m = /multipv (\d+) .*score (cp|mate) (-?\d+).* pv (.+)$/.exec(l); if (m) lines[m[1]] = { t: m[2], v: +m[3], pv: m[4].split(' ') }; if (l.startsWith('bestmove')) done(); } });
const send = (s) => sf.stdin.write(s + '\n');
send('uci'); send('setoption name Threads value 4'); send('setoption name Hash value 512'); send(`setoption name MultiPV value ${mpv}`); send('position fen ' + makeFen(pos.toSetup())); send(`go movetime ${ms}`);
await fin; sf.kill();
const fromSf = (p, u) => { const m = { e1g1: 'e1h1', e1c1: 'e1a1', e8g8: 'e8h8', e8c8: 'e8a8' }; return parseUci(m[u] && p.board.get(parseUci(u).from)?.role === 'king' ? m[u] : u); };
for (const k of Object.keys(lines)) { const x = lines[k]; const p = pos.clone(); const sans = [];
  for (const u of x.pv.slice(0, 14)) { const mv = fromSf(p, u); const s = makeSan(p, mv); const n = p.fullmoves; sans.push(p.turn === 'white' ? `${n}.${s}` : (sans.length ? s : `${n}...${s}`)); p.play(mv); }
  const s = pos.turn === 'white' ? 1 : -1; console.log((x.t === 'mate' ? '#' + s * x.v : (s * x.v / 100).toFixed(2)) + '  ' + sans.join(' ')); }
