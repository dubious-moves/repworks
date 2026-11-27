// How hard each of our moves is to find, and what missing it costs (rules.md §3: drill what is hard to find and costly to miss).
// node --experimental-strip-types difficulty.ts <pgn> --line "<SAN line>" | --prefix "<SAN path>" [--chapter NAME] [--elo 2000,2200] [--ms 1500] [--side white]
//   --line: our moves along one line; --prefix: every our-move under the prefix in the chapter (one row each, then one row per Black reply: the hardest of our next 3 moves).
// Per move: pFind = Maia's chance (averaged over the Elos, 23M model with the moves before) that a player picks our move; the natural moves
// (Maia's, up to 90% of its mass or 6 moves) each rated by Stockfish (searchmoves, MultiPV) in win% for us; loss = how much each natural move
// gives up against ours; expLoss = sum of P(move) x loss over the natural moves that aren't ours: what playing by feel costs on average.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
process.env['MAIA_MODEL'] ??= '23m';
const R = '/home/user/repworks/';
const { maia } = await import(R + 'scripts/ideas/maia.ts');
const { parsePgn, startingPosition } = await import(R + 'node_modules/chessops/dist/esm/pgn.js');
const { Chess } = await import(R + 'node_modules/chessops/dist/esm/chess.js');
const { parseSan, makeSan } = await import(R + 'node_modules/chessops/dist/esm/san.js');
const { makeFen } = await import(R + 'node_modules/chessops/dist/esm/fen.js');
const { makeUci, parseUci } = await import(R + 'node_modules/chessops/dist/esm/util.js');
const args = process.argv.slice(2); const file = args[0]!;
const flag = (k: string, d?: string) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const elos = (flag('elo', '2000,2200') as string).split(',').map(Number); const ms = +(flag('ms', '1500') as string);
const side = flag('side', 'white');
const sans = (s: string) => s.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
const num = (i: number, s: string) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s);
// Stockfish
const sf = spawn('/usr/games/stockfish'); let buf = ''; let on: ((l: string) => void) | null = null;
sf.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); on && on(l); } });
const send = (s: string) => sf.stdin.write(s + '\n');
send('uci'); send('setoption name Threads value 4'); send('setoption name Hash value 256');
const win = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
function evals(fen: string, ucis: string[]): Promise<Map<string, number>> {
  return new Promise((res) => { const L = new Map<string, { cp: number; depth: number }>();
    on = (l) => { const m = /depth (\d+) .*multipv \d+ .*score (cp|mate) (-?\d+).* pv (\S+)/.exec(l); if (m) { const cp = m[2] === 'mate' ? Math.sign(+m[3]) * 100000 : +m[3]; L.set(m[4]!, { cp, depth: +m[1] }); }
      if (l.startsWith('bestmove')) res(new Map([...L].map(([u, v]) => [u, win(v.cp)]))); };
    send(`setoption name MultiPV value ${ucis.length}`); send('position fen ' + fen); send(`go movetime ${ms} searchmoves ${ucis.join(' ')}`); });
}
async function rate(pos: any, before: string[], ours: string) {
  const fen = makeFen(pos.toSetup()); const sum = new Map<string, number>();
  for (const e of elos) for (const m of (await maia(pos, e, before)).moves) sum.set(m.san, (sum.get(m.san) ?? 0) + m.prob / elos.length);
  const policy = [...sum].sort((a, b) => b[1] - a[1]);
  const natural: [string, number][] = []; let mass = 0;
  for (const [s, p] of policy) { if (natural.length >= 6 || mass >= 0.9) break; natural.push([s, p]); mass += p; }
  if (!natural.some(([s]) => s === ours)) natural.push([ours, sum.get(ours) ?? 0]);
  const uci = (s: string) => makeUci(parseSan(pos, s));
  const W = await evals(fen, natural.map(([s]) => uci(s)));
  const w = (s: string) => W.get(uci(s)) ?? NaN; const wo = w(ours);
  let exp = 0; const alts = natural.filter(([s]) => s !== ours).map(([s, p]) => { const loss = Math.max(0, wo - w(s)); exp += p * loss; return { s, p, loss }; });
  const best = Math.max(...natural.map(([s]) => w(s)));
  return { pFind: sum.get(ours) ?? 0, alts, exp, wo, behind: best - wo };
}
const fmt = (r: any) => `pFind ${(100 * r.pFind).toFixed(0).padStart(3)}% | expLoss ${r.exp.toFixed(1).padStart(5)} | ours ${r.wo.toFixed(0)}%${r.behind > 3 ? ` (best is ${r.behind.toFixed(0)} better)` : ''} | natural: ${r.alts.slice(0, 3).map((a: any) => `${a.s} ${(100 * a.p).toFixed(0)}% -${a.loss.toFixed(0)}`).join(', ')}`;
const ourTurn = (ply: number) => (side === 'white' ? ply % 2 === 0 : ply % 2 === 1);
if (flag('line')) {
  const pos = Chess.default(); const before: string[] = []; const L = sans(flag('line')!);
  for (let i = 0; i < L.length; i++) { if (ourTurn(i)) console.log(`${L.slice(0, i + 1).map((s, k) => num(k, s)).join(' ')}\n   ${fmt(await rate(pos.clone(), [...before], L[i]!))}`); before.push(makeFen(pos.toSetup())); pos.play(parseSan(pos, L[i]!)); }
} else {
  const name = flag('chapter', 'Jobava simplified'); const games = parsePgn(readFileSync(file, 'utf8'));
  const g = games.length === 1 ? games[0] : games.find((x: any) => x.headers.get('ChapterName') === name);
  const pre = sans(flag('prefix')!); let n = g.moves; const pos = startingPosition(g.headers).unwrap(); const before: string[] = [];
  for (const s of pre) { n = n.children.find((c: any) => c.data.san === s); before.push(makeFen(pos.toSetup())); pos.play(parseSan(pos, s)); }
  const rows: { path: string[]; r: any }[] = [];
  const walk = async (n: any, p: any, path: string[], bef: string[]) => { for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san);
    if (ourTurn(path.length)) { const r = await rate(p.clone(), bef, c.data.san); rows.push({ path: [...path, c.data.san], r }); console.log(`${[...path, c.data.san].map((s, k) => num(k, s)).join(' ')}\n   ${fmt(r)}`); }
    q.play(mv); await walk(c, q, [...path, c.data.san], [...bef, makeFen(p.toSetup())]); } };
  await walk(n, pos, pre, before);
  console.log('\n== per Black reply: the hardest of our next 3 moves');
  const seen = new Set<string>();
  for (const { path } of rows) { for (let k = pre.length; k < path.length; k++) { if (ourTurn(k)) continue; const key = path.slice(0, k + 1).join(' '); if (seen.has(key)) continue; seen.add(key);
    const mine = rows.filter((x) => x.path.join(' ').startsWith(key + ' ') && x.path.length <= k + 1 + 6);
    if (!mine.length) continue; const worst = mine.reduce((a, b) => (b.r.exp > a.r.exp ? b : a));
    console.log(`${path.slice(0, k + 1).map((s, i) => num(i, s)).join(' ')} | hardest: ${num(worst.path.length - 1, worst.path.at(-1)!)} expLoss ${worst.r.exp.toFixed(1)}, pFind ${(100 * worst.r.pFind).toFixed(0)}%`); } }
}
sf.kill();
