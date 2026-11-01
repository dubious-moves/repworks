// The endgames' opponent, measured (PLAN.md §5.147): which engine's move sets the user the
// hardest task. For positions reached along played-out games of each endgame, with the opponent
// to move, every opponent move is scored by the user's ways to keep the goal after it: the number
// of the user's replies whose score (Stockfish, every move searched) keeps it (`keepsGoal`). The
// fewer, the harder; one is an only move. Then each engine's pick in the same position is read
// against that: Stockfish's (as the app played it, §5.145), Maia 3's at 2200 and 2600, Lc0's
// policy and Lc0's search (100 nodes, LC0_NODES; SKIP_LC0=1 leaves Lc0 out), and the app's own
// (`opponentPick`: Maia's likeliest move that Stockfish finds sound).
//
//   node scripts/endgame-defence.ts [endgame ids…]   (STOCKFISH=/path/to/native for speed;
//   FOLLOW=repworks plays the games on along the app's pick instead of Stockfish's)
//
// Writes one JSON line per position to stdout, a summary to stderr.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { ENDGAMES, keepsGoal, MAIA_ELO, MAIA_TOP, materialFor, opponentPick, pressingMove, sideOf, type Endgame } from '../src/core/endgames/endgames.ts';
import { lc0Planes, lc0Policy, wdlFrom } from '../src/core/lc0/encode.ts';
import { lc0Search, type Net } from '../src/core/lc0/search.ts';
import { clampElo, maiaTokens, policyFrom } from '../src/core/maia/encode.ts';
import { cpOf, Engine, positionOf } from './ideas/engine.ts';

const ROOT = join(import.meta.dirname, '..');
const DEPTH_WAYS = Number(process.env['WAYS_DEPTH'] ?? 14);
const DEPTH_PLAY = 16;
const GAMES = Number(process.env['GAMES'] ?? 2);
const PLIES = Number(process.env['PLIES'] ?? 24);
const LC0_NODES = Number(process.env['LC0_NODES'] ?? 100);

ort.env.wasm.numThreads = 1;
const maiaS = await ort.InferenceSession.create(readFileSync(join(ROOT, 'vendor/maia/maia3_simplified.onnx')));
const lc0S = await ort.InferenceSession.create(readFileSync(join(ROOT, 'vendor/lc0/791556.onnx')));
const sf = new Engine();

const play = (pos: Position, uci: string): Position => {
  const p = pos.clone();
  p.play(parseUci(uci)!);
  return p;
};
const legal = (pos: Position): string[] => {
  const out: string[] = [];
  for (const [from, tos] of pos.allDests()) {
    for (const to of tos) {
      const promo = pos.board.pawn.has(from) && (to >> 3 === 0 || to >> 3 === 7);
      for (const r of promo ? ['q', 'r', 'b', 'n'] : ['']) out.push(`${sqName(from)}${sqName(to)}${r}`);
    }
  }
  return out;
};
const sqName = (s: number) => 'abcdefgh'[s & 7]! + String((s >> 3) + 1);
/** A score from White's side for `side`, a mate as ±(10000 − n). */
const forSide = (cpWhite: number, side: 'white' | 'black') => (side === 'white' ? cpWhite : -cpWhite);

async function maiaTop(pos: Position, elo: number): Promise<string> {
  return (await maiaMoves(pos, elo))[0]!.uci;
}

async function maiaMoves(pos: Position, elo: number) {
  const e = clampElo(elo);
  const out = await maiaS.run({
    tokens: new ort.Tensor('float32', maiaTokens(makeFen(pos.toSetup())), [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([e]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([e]), [1]),
  });
  return policyFrom(pos, out['logits_move']!.data as Float32Array);
}

const net: Net = async (h) => {
  const r = await lc0S.run({ input: new ort.Tensor('float32', lc0Planes(h), [1, 112, 8, 8]) });
  return { policy: lc0Policy(h[h.length - 1]!, r['policy']!.data as Float32Array, 0, undefined, 0), wdl: wdlFrom(r['wdl']!.data as Float32Array) };
};

/** The user's replies after the opponent's move that keep the goal, and how many replies there are. */
async function ways(e: Endgame, pos: Position): Promise<{ keep: number; of: number }> {
  const moves = legal(pos);
  if (!moves.length) return { keep: 0, of: 0 };
  const s = await sf.search(makeFen(pos.toSetup()), { depth: DEPTH_WAYS, lines: moves.length });
  const user = sideOf(e);
  let keep = 0;
  for (const l of s.lines) if (keepsGoal(e.goal, forSide(cpOf(l.score), user))) keep++;
  return { keep, of: moves.length };
}

/** Stockfish's move as the app's opponent played it (§5.145): the best, or the pressing move against a draw. */
async function stockfishPick(e: Endgame, pos: Position): Promise<string> {
  const s = await sf.search(makeFen(pos.toSetup()), { depth: DEPTH_PLAY, lines: e.goal === 'draw' ? 3 : 1 });
  const lines = s.lines.map((l) => ({ cp: forSide(cpOf(l.score), pos.turn), pv: l.pv }));
  if (e.goal !== 'draw') return lines[0]!.pv[0]!;
  return pressingMove(lines, (pv) => {
    let p = pos;
    for (const u of pv) p = play(p, u);
    return materialFor(p, pos.turn);
  })!;
}

/** The app's opponent since §5.147 (`opponentPick`): Maia's likeliest move that Stockfish finds sound. */
async function repworksPick(e: Endgame, pos: Position): Promise<string> {
  const fen = makeFen(pos.toSetup());
  const scored = (s: Awaited<ReturnType<typeof sf.search>>) => s.lines.map((l) => ({ cp: forSide(cpOf(l.score), pos.turn), pv: l.pv }));
  const best = scored(await sf.search(fen, { depth: DEPTH_PLAY, lines: e.goal === 'draw' ? 3 : 1 }));
  const maia = (await maiaMoves(pos, MAIA_ELO)).slice(0, MAIA_TOP);
  const rest = maia.map((m) => m.uci).filter((u) => !best.some((l) => l.pv[0] === u));
  const more = rest.length ? scored(await sf.search(fen, { depth: DEPTH_PLAY, lines: rest.length, moves: rest })) : [];
  const lineOf = (uci: string) => [...best, ...more].find((l) => l.pv[0] === uci);
  const material = (pv: readonly string[]) => {
    let p = pos;
    for (const u of pv) p = play(p, u);
    return materialFor(p, pos.turn);
  };
  return opponentPick(e.goal, best, maia, lineOf, material, (uci) => play(pos, uci).isEnd())!.uci;
}

/** The user's move in the played-out games: Stockfish's best, or now and then its second when that keeps the goal. */
async function userMove(e: Endgame, pos: Position, rnd: () => number): Promise<string> {
  const s = await sf.search(makeFen(pos.toSetup()), { depth: DEPTH_PLAY, lines: 3 });
  const ok = s.lines.filter((l) => keepsGoal(e.goal, forSide(cpOf(l.score), pos.turn)));
  const pick = ok.length > 1 && rnd() < 0.3 ? ok[1 + Math.floor(rnd() * (ok.length - 1))]! : (ok[0] ?? s.lines[0]!);
  return pick.pv[0]!;
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PICKERS = ['stockfish', 'maia2200', 'maia2600', 'lc0policy', 'lc0search', 'repworks'] as const;
type Picker = (typeof PICKERS)[number];
interface Row {
  id: string;
  fen: string;
  options: { uci: string; san: string; keep: number; of: number }[];
  picks: Record<Picker, string>;
}

const ids = process.argv.slice(2);
const rows: Row[] = [];
for (const e of ENDGAMES.filter((x) => !ids.length || ids.includes(x.id))) {
  for (let g = 0; g < GAMES; g++) {
    const rnd = mulberry(1000 * g + e.id.length);
    let pos = positionOf(e.fen);
    const history: Position[] = [pos];
    for (let ply = 0; ply < PLIES && !pos.isEnd(); ply++) {
      const userTurn = pos.turn === sideOf(e);
      if (userTurn) {
        pos = play(pos, await userMove(e, pos, rnd));
        history.push(pos);
        continue;
      }
      const options: Row['options'] = [];
      for (const uci of legal(pos)) {
        const after = play(pos, uci);
        options.push({ uci, san: makeSan(pos, parseUci(uci)!), ...(await ways(e, after)) });
      }
      const skipLc0 = !!process.env['SKIP_LC0'];
      const lc0 = skipLc0 ? undefined : await net(history);
      const searched = skipLc0 ? undefined : await lc0Search({ history, nodes: LC0_NODES, net });
      const picks: Record<Picker, string> = {
        stockfish: await stockfishPick(e, pos),
        maia2200: await maiaTop(pos, 2200),
        maia2600: await maiaTop(pos, 2600),
        lc0policy: lc0?.policy[0]!.uci ?? '',
        lc0search: searched?.uci ?? '',
        repworks: await repworksPick(e, pos),
      };
      const row: Row = { id: e.id, fen: makeFen(pos.toSetup()), options, picks };
      rows.push(row);
      process.stdout.write(`${JSON.stringify(row)}\n`);
      // The game goes on along Stockfish's move, as the app played it (§5.145), or FOLLOW's.
      pos = play(pos, picks[(process.env['FOLLOW'] as Picker | undefined) ?? 'stockfish'] || picks.stockfish);
      history.push(pos);
    }
  }
}
sf.quit();

// The summary: for each picker, the positions where the opponent had a real choice (the ways to
// keep the goal differ between its moves), the mean ways left, how often its pick left the fewest,
// and how often it left an only move.
const real = rows.filter((r) => new Set(r.options.filter((o) => o.of).map((o) => o.keep)).size > 1);
process.stderr.write(`${rows.length} positions, ${real.length} with a real choice\n`);
for (const p of PICKERS) {
  if (!real.some((r) => r.picks[p])) continue;
  let sum = 0;
  let fewest = 0;
  let only = 0;
  let gave = 0;
  for (const r of real) {
    const o = r.options.find((x) => x.uci === r.picks[p])!;
    const min = Math.min(...r.options.filter((x) => x.of).map((x) => x.keep).filter((k) => k > 0));
    sum += o.keep;
    if (o.keep === min) fewest++;
    if (o.keep === 1) only++;
    if (o.keep === 0) gave++;
  }
  process.stderr.write(`${p.padEnd(10)} mean ways ${(sum / real.length).toFixed(2)}, fewest ${fewest}/${real.length}, only move ${only}, goal gone (opponent's own slip) ${gave}\n`);
}
