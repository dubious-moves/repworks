// node sfcand.mjs <positions.json> <seconds> <threads>: Stockfish's eval of each candidate (MultiPV over searchmoves = the candidates), White's view in pawns
import { spawn } from 'node:child_process'; import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { Chess } = await import(B + 'chess.js'); const { parseSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js'); const { makeUci } = await import(B + 'util.js');
const [file, secs = '90', threads = '2'] = process.argv.slice(2);
const sf = spawn('/usr/games/stockfish'); let buf = ''; const waiters = [];
sf.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiters.forEach((w) => w(l)); } });
const send = (s) => sf.stdin.write(s + '\n');
const until = (pred) => new Promise((res) => { const w = (l) => { if (pred(l)) { waiters.splice(waiters.indexOf(w), 1); res(l); } }; waiters.push(w); });
send('uci'); await until((l) => l === 'uciok'); send(`setoption name Threads value ${threads}`); send('setoption name Hash value 512');
for (const it of JSON.parse(readFileSync(file, 'utf8'))) {
  const pos = Chess.default(); for (const t of it.moves.split(/\s+/)) { const san = t.replace(/^\d+\.+/, ''); if (san) pos.play(parseSan(pos, san)); }
  const fixC = (u) => ({ e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' })[u] && pos.board.get(u.startsWith('e1') ? 4 : 60)?.role === 'king' ? ({ e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' })[u] : u;
  const ucis = it.candidates.map((s) => fixC(makeUci(parseSan(pos, s)))); const byUci = Object.fromEntries(ucis.map((u, i) => [u, it.candidates[i]]));
  send(`setoption name MultiPV value ${ucis.length}`); send('ucinewgame'); send(`position fen ${makeFen(pos.toSetup())}`); send('isready'); await until((l) => l === 'readyok');
  const last = {}; const w = (l) => { const m = /depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/.exec(l); if (m) last[m[5]] = { depth: +m[1], cp: m[3] === 'cp' ? +m[4] : (m[4] > 0 ? 10000 : -10000) }; }; waiters.push(w);
  send(`go movetime ${secs * 1000} searchmoves ${ucis.join(' ')}`); await until((l) => l.startsWith('bestmove')); waiters.splice(waiters.indexOf(w), 1);
  const sign = pos.turn === 'white' ? 1 : -1;
  console.log(`${it.label || ''} ${it.moves} | ` + ucis.map((u) => last[u] ? `${byUci[u]} ${(sign * last[u].cp / 100).toFixed(2)} (d${last[u].depth})` : `${byUci[u]} ?`).join(', '));
}
send('quit');
