// node lineeval.mjs "<SAN line from the start>" <startPly> <ms>: Stockfish at each position from startPly:
// best 3 moves with evals (White's view), and the played move's eval.
import { spawn } from 'node:child_process';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { Chess } = await import(B + 'chess.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const { makeFen } = await import(B + 'fen.js'); const { makeUci, parseUci } = await import(B + 'util.js');
const [, , line, start = '0', ms = '2500'] = process.argv;
const sans = line.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
const sf = spawn('/usr/games/stockfish'); let buf = ''; const waiters = [];
sf.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); for (const w of waiters) w(l); } });
const send = (s) => sf.stdin.write(s + '\n');
const until = (pred) => new Promise((res) => { const f = (l) => { if (pred(l)) { waiters.splice(waiters.indexOf(f), 1); res(l); } }; waiters.push(f); });
send('uci'); await until((l) => l === 'uciok'); send('setoption name Threads value 2'); send('setoption name Hash value 256'); send('isready'); await until((l) => l === 'readyok');
async function analyse(fen, mpv, extra = '') {
  send(`setoption name MultiPV value ${mpv}`); send('position fen ' + fen);
  const lines = {}; const f = (l) => { const m = /multipv (\d+) .*score (cp|mate) (-?\d+).* pv (\S+)/.exec(l); if (m) lines[m[1]] = { t: m[2], v: +m[3], mv: m[4] }; };
  waiters.push(f); send(`go movetime ${ms}${extra}`); await until((l) => l.startsWith('bestmove')); waiters.splice(waiters.indexOf(f), 1);
  return Object.values(lines); }
const pos = Chess.default();
// UCI castling for Stockfish is the king's two-square move; chessops writes king-takes-rook.
const toSf = (u) => ({ e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' })[u] || u;
const fromSf = (p, u) => parseUci(({ e1g1: 'e1h1', e1c1: 'e1a1', e8g8: 'e8h8', e8c8: 'e8a8' })[u] && p.board.get(parseUci(u).from)?.role === 'king' ? ({ e1g1: 'e1h1', e1c1: 'e1a1', e8g8: 'e8h8', e8c8: 'e8a8' })[u] : u);
const fmt = (x, white) => { const s = white ? 1 : -1; return x.t === 'mate' ? `#${s * x.v}` : ((s * x.v) / 100).toFixed(2); };
for (let i = 0; i < sans.length; i++) {
  const mv = parseSan(pos, sans[i]); if (!mv) { console.log('illegal', sans[i]); break; }
  if (i >= +start) {
    const fen = makeFen(pos.toSetup()); const white = pos.turn === 'white';
    const top = await analyse(fen, 3);
    const tops = top.map((x) => `${makeSan(pos, fromSf(pos, x.mv))} ${fmt(x, white)}`).join(', ');
    const played = await analyse(fen, 1, ' searchmoves ' + toSf(makeUci(mv)));
    console.log(`${Math.floor(i / 2) + 1}${white ? '.' : '...'}${sans[i]}  played ${fmt(played[0], white)}  | best: ${tops}`);
  }
  pos.play(mv);
}
const end = await analyse(makeFen(pos.toSetup()), 4);
console.log('final:', end.map((x) => `${makeSan(pos, fromSf(pos, x.mv))} ${fmt(x, pos.turn === 'white')}`).join(', '));
sf.kill();
