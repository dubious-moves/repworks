#!/usr/bin/env node
// How strong are the practice opponents (Easy, Medium, Hard) on Lichess's scale (PLAN.md §5.202)?
// And which opponent plays most like a 2000 over whole games (§5.204)?
// Three measurements, each a report that writes nothing to the app or the data repo:
//
//   1. A match. The levels (Maia 3 at the preset's rating, sampled at its precision, as practice
//      plays them: the app's default model, the 23M, reading the seven positions before; `--model
//      first` for the other) play the Maia-1 networks that the CSSLab's Lichess bots maia1, maia5
//      and maia9 run (the likeliest move, `go nodes 1`), and each other, from balanced positions of
//      real games, both colours. The players' Elo is fitted to the results, and the levels are placed
//      on the bots' Lichess ratings (games mostly against people) by the line through the three
//      bots: how far apart the bots are here against how far apart they are on Lichess.
//   2. The same positions. Positions of real Lichess games in bands of the mover's rating; the
//      win% the person's move gave up (Stockfish), against what each level's move gives up on
//      average (its sampled policy over the moves scored). The rating where a level gives up as
//      much as people do is the rating its mistakes match: by the mean, and by the blunders.
//
//   3. Whole games (PLAN.md §5.204). Games between two people of a band (1900–2100) from the
//      dump, from ply 12; each candidate opponent plays itself from the same starts (the match
//      step with --openings humans.json and --pairs x:x); every position scored by Stockfish until
//      a side is decided; the moves' losses by phase, a lead kept, how soon games are decided. And
//      how well Maia 3 and dala's networks predict the people's moves of those games, by phase.
//
// The anchors include dala-2000 (hrschubert's Lc0 transformer trained on 2000-rated games, a draw
// from its soft policy head as fitted to its own Lichess games, §5.204), rated mostly against other
// bots, beside the Maia bots, rated mostly against people.
//
// Steps (each resumable: a file that exists is read and continued):
//
//   node scripts/opponent-strength.ts openings <dump.pgn.zst> --out openings.json
//       --count 60 --plies 10,16 --ratings 1600,2200 --max-cp 80 --depth 12
//   node scripts/opponent-strength.ts match --nets <dir> --openings openings.json --out games.json
//       --players easy,medium,hard,maia-1100,maia-1500,maia-1900 --concurrency 48 --engines 3
//       --check-depth 10 --threads 2 --seed 1 --model 23m|first [--all-pairs: the levels against each other too]
//       [--pairs a:b,c:d: those pairs only] [a player id=elo@precision: a level of its own, e.g. r2300=2300@0.85]
//       [--ort-node <folder with node_modules/onnxruntime-node> --net-threads 2: the networks on onnxruntime-node]
//   node scripts/opponent-strength.ts mistakes <dump.pgn.zst> --sample sample.json --out mistakes.json
//       --bands 1100,1300,…,2300 --per-band 500 --speeds rapid,classical --depth 14 --elos 1100,…,2500 --model 23m|first
//       [--sample-only: draw the sample and stop]
//   node scripts/opponent-strength.ts humans <dump.pgn.zst> --out humans.json --ratings 1900,2100
//       --speeds rapid,classical --start 12 --count 300 --max-cp 150 --depth 12
//   node scripts/opponent-strength.ts score --openings humans.json [--games selfplay.json] --out scored.json --depth 12
//   node scripts/opponent-strength.ts predict --openings humans.json --nets <dir> --net-ids dala-2000 --out predict.json
//   node scripts/opponent-strength.ts report --games games.json --mistakes mistakes.json --scored scored.json
//       --predict predict.json [--json] [--boot 1000]
//
// `--nets` is a folder with maia-1100.onnx, maia-1500.onnx and maia-1900.onnx, converted from the
// CSSLab's networks (github.com/CSSLab/maia-chess, maia_weights/maia-<r>.pb.gz) by
// `node scripts/lc0-onnx.mjs <net.pb.gz> <lc0 checkout or its src/neural/tables> <out.onnx>`, and
// dala-2000.onnx, converted with its soft policy head (`… dala-2000.onnx soft`) from
// github.com/hrschubert/dala-training's release Release-v1 (dala-2000-distill-00500000-fixed.pb.gz).
// The bots' Lichess ratings are read from lichess.org when the match starts and kept in its file.
// The dump: database.lichess.org's monthly file, or its first 250 MB (as scripts/maia-eval.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { positionKeyOf } from '../src/core/chess/positionKey.ts';
import { parseUciMove } from '../src/core/chess/uci.ts';
import { LC0_INPUT, lc0Planes, lc0Policy } from '../src/core/lc0/encode.ts';
import { createMaiaBatch, type MaiaBatch } from '../src/core/maia/batch.ts';
import { whiteShare } from '../src/core/engine/winning.ts';
import { winPct } from '../src/core/games/extract.ts';
import { guardCandidates, guardedChoice, guardNeedsBefore } from '../src/core/games/practice.ts';
import { candidatesFrom, dumpLines, gamesOf, MIDDLEGAME, pliesOf, replay, rng, speedOf, takeSample } from './maia-eval-lib.ts';
import type { EvalPosition } from './maia-eval-types.ts';
import {
  adjudicate,
  type Anchor,
  ANCHORS,
  boardEnd,
  botMove,
  type BotPlay,
  type BotRatings,
  type Condition,
  gameKey,
  type GameRecord,
  gameRng,
  type Level,
  LEVELS,
  levelMove,
  MAIA_ANCHORS,
  matchReport,
  type MistakePosition,
  mistakeReport,
  DECIDED,
  type Phase,
  phaseOf,
  type ScoredGame,
  wholeGameReport,
  levelSpec,
  parseLevel,
  movesToScore,
  moverWin,
  type Result,
  SPEEDS,
  whiteCp,
} from './opponent-strength-lib.ts';
import { startEngines, type Engines } from './storm/engine.ts';

const VENDOR = join(import.meta.dirname, '..', 'vendor', 'maia');
const say = (s: string) => process.stderr.write(s + '\n');

/* ------------------------------------------------------------------ options */

const [step, ...rest] = process.argv.slice(2);
const positional: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (a.startsWith('--')) {
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags.set(a.slice(2), 'true');
    else flags.set(a.slice(2), rest[++i]!);
  } else positional.push(a);
}
const flag = (name: string, fallback: string): string => flags.get(name) ?? fallback;
const num = (name: string, fallback: number): number => Number(flag(name, String(fallback)));
const nums = (name: string, fallback: string): number[] => flag(name, fallback).split(',').map(Number);
const need = (name: string): string => {
  const v = flags.get(name);
  if (!v) throw new Error(`--${name} is needed`);
  return v;
};
const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback);

/* ------------------------------------------------------------------ the models */

const fromFen = (fen: string): Position => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

/** Float32 inputs by name, each with its shape. */
type Feeds = Record<string, { data: Float32Array; dims: number[] }>;
interface Session {
  run(feeds: Feeds): Promise<Record<string, { data: unknown }>>;
}
/**
 * An ONNX model's session: onnxruntime-web by default; `--ort-node <folder>`: onnxruntime-node from
 * that folder's node_modules (not a dependency of this repository), several times faster for the
 * 23M Maia and dala's transformers (PLAN.md §5.204).
 */
function onnxSession(path: string, threads: number): Promise<Session> {
  const nodeDir = flags.get('ort-node');
  if (nodeDir) {
    const ortNode = createRequire(join(nodeDir, 'x.js'))('onnxruntime-node');
    return ortNode.InferenceSession.create(path, { intraOpNumThreads: threads }).then((sess: { run(f: Record<string, unknown>): Promise<Record<string, { data: unknown }>> }) => ({
      run: (f: Feeds) => sess.run(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, new ortNode.Tensor('float32', v.data, v.dims)]))),
    }));
  }
  ort.env.wasm.numThreads = threads;
  return ort.InferenceSession.create(readFileSync(path)).then((sess) => ({
    run: (f: Feeds) => sess.run(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, new ort.Tensor('float32', v.data, v.dims)]))),
  }));
}

function maia3(model: 'first' | '23m', threads: number): MaiaBatch {
  const session = onnxSession(join(VENDOR, model === '23m' ? 'maia3-23m.onnx' : 'maia3_simplified.onnx'), threads);
  return createMaiaBatch({
    history: model === '23m',
    memo: 200000,
    run: async (tokens, elos, n) => {
      const s = await session;
      const out = await s.run({
        tokens: { data: tokens, dims: [n, 64, model === '23m' ? 96 : 12] },
        elo_self: { data: elos, dims: [n] },
        elo_oppo: { data: Float32Array.from(elos), dims: [n] },
      });
      return { moves: out['logits_move']!.data as Float32Array, values: out['logits_value']!.data as Float32Array };
    },
    defer: (fn) => setImmediate(fn),
  });
}

/** An Lc0 network as its Lichess bot plays it (`play`: the likeliest move, or dala's draw), positions batched. */
function lc0Net(path: string, play: BotPlay): (history: readonly Position[], rand: () => number) => Promise<string> {
  const policies = lc0Policies(path, play.kind === 'sample' ? play.temperature : 1);
  return async (history, rand) => {
    const m = botMove(await policies(history), play, rand);
    if (!m) throw new Error('the network gave no move');
    return m.uci;
  };
}

type NetMove = { uci: string; prob: number };
/** An Lc0 network's policy at a softmax temperature (likeliest first, no floor), positions batched and remembered. */
function lc0Policies(path: string, temperature = 1): (history: readonly Position[]) => Promise<NetMove[]> {
  const session = onnxSession(path, num('net-threads', 2));
  let queue: { history: readonly Position[]; resolve(policy: NetMove[]): void; reject(e: unknown): void }[] = [];
  let scheduled = false;
  const memo = new Map<string, NetMove[]>();
  const run = async () => {
    scheduled = false;
    const jobs = queue.splice(0, 64);
    if (queue.length) schedule();
    try {
      const input = new Float32Array(jobs.length * LC0_INPUT);
      jobs.forEach((j, i) => lc0Planes(j.history, input, i * LC0_INPUT));
      const out = await (await session).run({ input: { data: input, dims: [jobs.length, 112, 8, 8] } });
      const logits = out['policy']!.data as Float32Array;
      jobs.forEach((j, i) => j.resolve(lc0Policy(j.history[j.history.length - 1]!, logits, i * 1858, temperature, 0).map((m) => ({ uci: m.uci, prob: m.prob }))));
    } catch (e) {
      for (const j of jobs) j.reject(e);
    }
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      setImmediate(() => void run());
    }
  };
  return async (history) => {
    // The planes read the last eight positions and the repetitions among them: the key is those.
    const key = history.slice(-9).map((p) => makeFen(p.toSetup())).join('/');
    let policy = memo.get(key);
    if (!policy) {
      policy = await new Promise<NetMove[]>((resolve, reject) => {
        queue.push({ history, resolve, reject });
        schedule();
      });
      if (memo.size > 200000) memo.clear();
      memo.set(key, policy);
    }
    return policy;
  };
}

/** The bots' ratings on Lichess now. */
async function botRatings(anchors: readonly Anchor[]): Promise<BotRatings> {
  const out: BotRatings = {};
  for (const a of anchors) {
    const res = await fetch(`https://lichess.org/api/user/${a.bot}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`lichess.org/api/user/${a.bot}: ${res.status}`);
    const perfs = ((await res.json()) as { perfs?: Record<string, { rating: number; rd: number; games: number }> }).perfs ?? {};
    out[a.bot] = Object.fromEntries(SPEEDS.filter((s) => perfs[s]).map((s) => [s, { rating: perfs[s]!.rating, rd: perfs[s]!.rd, games: perfs[s]!.games }]));
  }
  return out;
}

/** Stockfish's score of a position for White (null: none). */
async function scoreOf(engines: Engines, fen: string, depth: number): Promise<{ cp: number; mate?: undefined } | { mate: number; cp?: undefined } | null> {
  const a = await engines.analyse(fen, 1, depth, 3000 + depth * 300);
  return a?.lines[0]?.score ?? null;
}

/** Runs `jobs` at most `width` at a time. */
async function pool<T>(items: readonly T[], width: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await work(items[i]!, i);
      }
    }),
  );
}

/* ------------------------------------------------------------------ 1a. openings */

interface Opening {
  game: string;
  /** The moves from the start (UCI). */
  moves: string[];
  fen: string;
  /** Stockfish's score for White. */
  cp: number;
}

async function openings(): Promise<void> {
  const dump = positional[0];
  if (!dump) throw new Error('usage: openings <dump> --out openings.json');
  const out = need('out');
  const count = num('count', 60);
  const [p0, p1] = nums('plies', '10,16') as [number, number];
  const [r0, r1] = nums('ratings', '1600,2200') as [number, number];
  const maxCp = num('max-cp', 80);
  const depth = num('depth', 12);
  const rand = rng(num('seed', 1));
  const seen = new Set<string>();
  const candidates: Opening[] = [];
  for await (const g of gamesOf(dumpLines(dump))) {
    const h = g.headers;
    const speed = speedOf(h['Event'] ?? '');
    if (!speed || !['blitz', 'rapid', 'classical'].includes(speed)) continue;
    const wr = Number(h['WhiteElo']);
    const br = Number(h['BlackElo']);
    if (!(wr >= r0 && wr <= r1 && br >= r0 && br <= r1)) continue;
    const ply = p0 + Math.floor(rand() * (p1 - p0 + 1));
    const { fens, ucis } = replay(pliesOf(g.moves));
    if (ucis.length < ply + 20) continue;
    const key = positionKeyOf(fromFen(fens[ply]!));
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ game: /\/(\w+)$/.exec(h['Site'] ?? '')?.[1] ?? '', moves: ucis.slice(0, ply), fen: fens[ply]!, cp: 0 });
    if (candidates.length >= count * 4) break;
  }
  say(`${candidates.length} candidate openings; scoring at depth ${depth}`);
  const engines = startEngines(num('engines', availableParallelism()));
  const kept: Opening[] = [];
  await pool(candidates, engines.width * 2, async (c) => {
    const s = await scoreOf(engines, c.fen, depth);
    if (s && s.mate === undefined && Math.abs(s.cp) <= maxCp) kept.push({ ...c, cp: s.cp });
  });
  engines.quit();
  // In the dump's order, so that the same dump and seed give the same openings.
  const order = new Map(candidates.map((c, i) => [c.game + c.moves.length, i]));
  kept.sort((a, b) => order.get(a.game + a.moves.length)! - order.get(b.game + b.moves.length)!);
  writeFileSync(out, JSON.stringify(kept.slice(0, count), null, 1));
  say(`${Math.min(count, kept.length)} openings within ±${maxCp} written to ${out}`);
}

/* ------------------------------------------------------------------ 1b. the match */

interface MatchFile {
  ratings: BotRatings;
  ratingsAt: string;
  /** When each bot's rating was read, if not at `ratingsAt` (a bot added to a match later). */
  ratingsAtByBot?: Record<string, string>;
  /** The levels played, when not only the presets. */
  levels?: Level[];
  model: string;
  games: GameRecord[];
}

async function match(): Promise<void> {
  const out = need('out');
  const nets = need('nets');
  const opens = readJson<Opening[]>(need('openings'), []);
  if (!opens.length) throw new Error('no openings');
  const players = flag('players', [...LEVELS.map((l) => l.id), ...MAIA_ANCHORS.map((a) => a.id)].join(',')).split(',');
  const model = flag('model', '23m') as 'first' | '23m';
  const seed = num('seed', 1);
  const checkDepth = num('check-depth', 10);
  const file = readJson<MatchFile>(out, { ratings: {}, ratingsAt: '', model, games: [] });
  if (file.model !== model) throw new Error(`${out} was played with the ${file.model} model`);
  const anchors = ANCHORS.filter((a) => players.includes(a.id));
  const levels = new Map<string, Level>((file.levels ?? LEVELS).map((l) => [l.id, l]));
  for (const p of players.filter((id) => !anchors.some((a) => a.id === id))) {
    const l = parseLevel(p.includes('=') ? p : (levels.get(p) ? levelSpec(levels.get(p)!) : p));
    const was = levels.get(l.id);
    if (was && levelSpec(was) !== levelSpec(l)) throw new Error(`${out} played ${l.id} as ${levelSpec(was)}`);
    levels.set(l.id, l);
  }
  file.levels = [...levels.values()];
  const ids = players.map((p) => p.split('=')[0]!);
  if (!file.ratingsAt || flags.has('refresh-ratings')) {
    file.ratings = await botRatings(anchors);
    file.ratingsAt = new Date().toISOString();
    delete file.ratingsAtByBot;
  } else {
    const missing = anchors.filter((a) => !file.ratings[a.bot]);
    if (missing.length) {
      Object.assign(file.ratings, await botRatings(missing));
      const at = new Date().toISOString();
      file.ratingsAtByBot = { ...file.ratingsAtByBot, ...Object.fromEntries(missing.map((a) => [a.bot, at])) };
    }
  }
  const maia = maia3(model, num('threads', 2));
  const nets1 = new Map(anchors.map((a) => [a.id, lc0Net(join(nets, `${a.id}.onnx`), a.play)]));
  const engines = startEngines(num('engines', Math.max(1, availableParallelism() - 1)));
  say(`${engines.label} ×${engines.width}; Maia 3 (${model}); bots' ratings of ${file.ratingsAt.slice(0, 10)}`);

  /** A player's move in the game so far (positions from the start, the last the one to move in). */
  const moveOf = async (player: string, history: readonly Position[], rand: () => number): Promise<string> => {
    const net = nets1.get(player);
    if (net) return net(history, rand);
    const level = levels.get(player);
    if (!level) throw new Error(`no player ${player}`);
    const pos = history[history.length - 1]!;
    const before = history.slice(-8, -1).map((p) => makeFen(p.toSetup()));
    const answer = await maia.ask(pos, level.elo, before);
    const m = level.guard ? ((await guardMove(history, answer.policy, level.precision, rand)) ?? levelMove(answer.policy, level, rand)) : levelMove(answer.policy, level, rand);
    if (!m) throw new Error('Maia gave no move');
    return m.uci;
  };
  /**
   * The app's check (`guardChoice` in src/app/practice.ts): the best move's win% and each of Maia's
   * likely moves' (as the position after it, a ply less: this engine has no searchmoves), and the
   * position before the other side's move when one of them looks like a blunder.
   */
  const guardDepth = num('guard-depth', 14);
  const guardWp = async (p: Position, depth: number): Promise<number | undefined> => {
    if (p.isEnd()) return p.isCheckmate() ? 0 : 50;
    const s = await scoreOf(engines, makeFen(p.toSetup()), depth);
    return s ? winPct(p.turn === 'white' ? whiteCp(s) : -whiteCp(s)) : undefined;
  };
  const guardMove = async <M extends { uci: string; prob: number }>(history: readonly Position[], policy: readonly M[], precision: number, rand: () => number): Promise<M | undefined> => {
    const pos = history[history.length - 1]!;
    const cands = guardCandidates(policy);
    const [best, ...replies] = await Promise.all([
      guardWp(pos, guardDepth),
      ...cands.map((m) => {
        const after = pos.clone();
        after.play(parseUciMove(pos, m.uci)!);
        return guardWp(after, guardDepth - 1);
      }),
    ]);
    if (best === undefined || replies.some((r) => r === undefined)) return undefined;
    const scored = cands.map((m, i) => ({ ...m, wp: 100 - replies[i]! }));
    const bestWp = Math.max(best, ...scored.map((m) => m.wp));
    let before: number | undefined;
    if (history.length > 1 && guardNeedsBefore(bestWp, scored.map((m) => m.wp))) {
      const prev = await guardWp(history[history.length - 2]!, guardDepth);
      if (prev !== undefined) before = 100 - prev;
    }
    const c = guardedChoice(policy, scored, bestWp, before, precision, rand);
    guards.asked++;
    if (c?.wrong) guards.redrawn++;
    return c?.move;
  };
  const guards = { asked: 0, redrawn: 0 };

  const done = new Set(file.games.map((g) => gameKey(g.white, g.black, g.opening)));
  const jobs: { white: string; black: string; opening: number }[] = [];
  // `--pairs a:b,c:d`: those pairs only; otherwise every pair but two levels against each other.
  const pairs = flags.has('pairs')
    ? need('pairs').split(',').map((p) => p.split(':') as [string, string])
    : ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as [string, string])).filter(([a, b]) => flags.has('all-pairs') || !(levels.has(a) && levels.has(b)));
  for (const [a, b] of pairs) if (!ids.includes(a) || !ids.includes(b)) throw new Error(`the pair ${a}:${b} has a player not in --players`);
  for (let k = 0; k < opens.length; k++)
    for (const [a, b] of pairs)
      // A player against itself (`x:x`, self-play) once from each start.
      for (const [w, bl] of a === b ? ([[a, a]] as const) : ([[a, b], [b, a]] as const))
        if (!done.has(gameKey(w, bl, k))) jobs.push({ white: w, black: bl, opening: k });
  say(`${jobs.length} games to play (${file.games.length} already)`);
  const started = performance.now();
  let played = 0;
  let saved = performance.now();
  const save = () => writeFileSync(out, JSON.stringify(file));

  await pool(jobs, num('concurrency', 48), async (job) => {
    const o = opens[job.opening]!;
    const rand = gameRng(gameKey(job.white, job.black, job.opening), seed);
    let pos = Chess.default();
    const history: Position[] = [pos.clone()];
    const seen = new Map<string, number>([[positionKeyOf(pos), 1]]);
    const count = (p: Position) => seen.set(positionKeyOf(p), (seen.get(positionKeyOf(p)) ?? 0) + 1);
    for (const uci of o.moves) {
      pos = pos.clone();
      pos.play(parseUciMove(pos, uci)!);
      history.push(pos);
      count(pos);
    }
    const moves: string[] = [];
    const checks: number[] = [];
    let end: { result: Result; reason: GameRecord['reason'] } | undefined;
    while (!end) {
      const uci = await moveOf(pos.turn === 'white' ? job.white : job.black, history, rand);
      const move = parseUciMove(pos, uci);
      if (!move) throw new Error(`illegal ${uci} in ${makeFen(pos.toSetup())}`);
      pos = pos.clone();
      pos.play(move);
      history.push(pos);
      count(pos);
      moves.push(uci);
      end = boardEnd(pos, seen);
      if (!end && moves.length % 2 === 0) {
        const s = await scoreOf(engines, makeFen(pos.toSetup()), checkDepth);
        if (s) checks.push(whiteCp(s));
        end = adjudicate(checks, moves.length);
      }
    }
    file.games.push({ white: job.white, black: job.black, opening: job.opening, result: end.result, reason: end.reason, plies: moves.length, moves });
    played++;
    if (performance.now() - saved > 30000) {
      saved = performance.now();
      save();
      const rate = played / ((performance.now() - started) / 1000);
      say(`${file.games.length} games, ${rate.toFixed(2)} a second, about ${Math.round((jobs.length - played) / rate / 60)} min to go; ${guards.asked} moves checked, ${guards.redrawn} gone wrong`);
    }
  });
  save();
  engines.quit();
  say(`${file.games.length} games in ${out}`);
}

/* ------------------------------------------------------------------ 2. the same positions */

interface MistakesFile {
  model: string;
  depth: number;
  positions: MistakePosition[];
}

async function mistakes(): Promise<void> {
  const dump = positional[0];
  const out = need('out');
  const samplePath = need('sample');
  const bands = nums('bands', '1100,1300,1500,1700,1900,2100,2300');
  const seed = num('seed', 1);
  let sample = readJson<EvalPosition[]>(samplePath, []);
  if (!sample.length) {
    if (!dump) throw new Error('usage: mistakes <dump> --sample sample.json --out mistakes.json');
    const { all, read, used } = await candidatesFrom(gamesOf(dumpLines(dump)), {
      speeds: flag('speeds', 'rapid,classical').split(','),
      bands,
      width: num('width', 100),
      criteria: MIDDLEGAME,
      seed,
      ...(flags.has('max-games') ? { maxGames: num('max-games', 0) } : {}),
    });
    sample = takeSample(all, bands, num('per-band', 500), seed);
    writeFileSync(samplePath, JSON.stringify(sample));
    say(`${read} games read, ${used} used: ${sample.length} positions written to ${samplePath}`);
  }
  if (flags.has('sample-only')) return;
  const model = flag('model', '23m') as 'first' | '23m';
  const depth = num('depth', 14);
  const elos = [...new Set([...nums('elos', '1100,1300,1500,1700,1900,2100,2300,2500'), ...LEVELS.map((l) => l.elo)])].sort((a, b) => a - b);
  const minProb = num('min-prob', 0.01);
  const file = readJson<MistakesFile>(out, { model, depth, positions: [] });
  if (file.model !== model || file.depth !== depth) throw new Error(`${out} was measured with the ${file.model} model at depth ${file.depth}`);
  const done = new Set(file.positions.map((p) => `${p.game}|${p.fen}`));
  const todo = sample.filter((p) => !done.has(`${p.game}|${p.fen}`));
  const maia = maia3(model, num('threads', 2));
  const engines = startEngines(num('engines', Math.max(1, availableParallelism() - 1)));
  say(`${todo.length} positions to measure (${file.positions.length} already); ${engines.label} ×${engines.width} at depth ${depth}`);
  const started = performance.now();
  let measured = 0;
  let saved = performance.now();
  const save = () => writeFileSync(out, JSON.stringify(file));
  await pool(todo, engines.width * 3, async (p) => {
    const pos = fromFen(p.fen);
    const white = pos.turn === 'white';
    const answers = await Promise.all(elos.map((elo) => maia.ask(pos, elo, p.before)));
    const policies = Object.fromEntries(elos.map((elo, i) => [String(elo), answers[i]!.policy.map((m) => ({ uci: m.uci, prob: Math.round(m.prob * 1e5) / 1e5 }))]));
    const ucis = movesToScore(p.played, Object.values(policies), minProb);
    const after: Record<string, number> = {};
    const root = scoreOf(engines, p.fen, depth);
    await Promise.all(
      ucis.map(async (uci) => {
        const next = pos.clone();
        const move = parseUciMove(next, uci);
        if (!move) return;
        next.play(move);
        if (next.isCheckmate()) return void (after[uci] = 100);
        if (next.isStalemate() || next.isInsufficientMaterial()) return void (after[uci] = 50);
        const s = await scoreOf(engines, makeFen(next.toSetup()), depth - 1);
        if (s) after[uci] = moverWin(s, white);
      }),
    );
    const r = await root;
    if (!r || after[p.played] === undefined) return;
    file.positions.push({ game: p.game, band: p.band, elo: p.elo, fen: p.fen, played: p.played, best: moverWin(r, white), after, policies });
    measured++;
    if (performance.now() - saved > 30000) {
      saved = performance.now();
      save();
      const rate = measured / ((performance.now() - started) / 1000);
      say(`${file.positions.length} positions, ${rate.toFixed(1)} a second, about ${Math.round((todo.length - measured) / rate / 60)} min to go`);
    }
  });
  save();
  engines.quit();
  say(`${file.positions.length} positions in ${out}`);
}

/* ------------------------------------------------------------------ 3. whole games (§5.204) */

/** A human game from a start: the start as an opening the match can play from, and the rest as played. */
interface HumanGame extends Opening {
  /** The moves the people played from the start on (UCI). */
  rest: string[];
  result: string;
  termination: string;
  ratings: [number, number];
  speed: string;
}

/** Games between two people of a band, from the same ply, balanced there: the reference, and the starts for self-play. */
async function humans(): Promise<void> {
  const dump = positional[0];
  if (!dump) throw new Error('usage: humans <dump> --out humans.json');
  const out = need('out');
  const count = num('count', 300);
  const start = num('start', 12);
  const [r0, r1] = nums('ratings', '1900,2100') as [number, number];
  const speeds = flag('speeds', 'rapid,classical').split(',');
  const maxCp = num('max-cp', 150);
  const depth = num('depth', 12);
  const seen = new Set<string>();
  const candidates: HumanGame[] = [];
  for await (const g of gamesOf(dumpLines(dump))) {
    const h = g.headers;
    const speed = speedOf(h['Event'] ?? '');
    if (!speed || !speeds.includes(speed)) continue;
    const wr = Number(h['WhiteElo']);
    const br = Number(h['BlackElo']);
    if (!(wr >= r0 && wr <= r1 && br >= r0 && br <= r1)) continue;
    const { fens, ucis } = replay(pliesOf(g.moves));
    if (ucis.length < start + 20) continue;
    const key = positionKeyOf(fromFen(fens[start]!));
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ game: /\/(\w+)$/.exec(h['Site'] ?? '')?.[1] ?? '', moves: ucis.slice(0, start), fen: fens[start]!, cp: 0, rest: ucis.slice(start), result: h['Result'] ?? '*', termination: h['Termination'] ?? '', ratings: [wr, br], speed });
    if (candidates.length >= count * 2) break;
  }
  say(`${candidates.length} candidate games; scoring their starts at depth ${depth}`);
  const engines = startEngines(num('engines', availableParallelism()));
  const kept: HumanGame[] = [];
  await pool(candidates, engines.width * 2, async (c) => {
    const s = await scoreOf(engines, c.fen, depth);
    if (s && s.mate === undefined && Math.abs(s.cp) <= maxCp) kept.push({ ...c, cp: s.cp });
  });
  engines.quit();
  const order = new Map(candidates.map((c, i) => [c.game, i]));
  kept.sort((a, b) => order.get(a.game)! - order.get(b.game)!);
  writeFileSync(out, JSON.stringify(kept.slice(0, count)));
  say(`${Math.min(count, kept.length)} games within ±${maxCp} at ply ${start} written to ${out}`);
}

/** Every position of the humans' games and of the games played from their starts (self-play, or two players each counted on its side), scored by Stockfish until decided. */
async function score(): Promise<void> {
  const out = need('out');
  const starts = readJson<HumanGame[]>(need('openings'), []);
  const depth = num('depth', 12);
  const file = readJson<{ depth: number; games: ScoredGame[] }>(out, { depth, games: [] });
  if (file.depth !== depth) throw new Error(`${out} was scored at depth ${file.depth}`);
  const todo: { player: string; game: string; opening: number; moves: string[]; won: boolean; black?: string }[] = starts.map((h, i) => ({ player: 'human', game: `human|${i}`, opening: i, moves: h.rest, won: h.result === '1-0' || h.result === '0-1' }));
  const gamesPath = flags.get('games');
  if (gamesPath)
    for (const g of readJson<MatchFile>(gamesPath, { ratings: {}, ratingsAt: '', model: '', games: [] }).games) {
      // Self-play counts both sides for its player; a game between two players, each side for its own.
      if (g.white === g.black) todo.push({ player: g.white, game: `${g.white}|${g.opening}`, opening: g.opening, moves: g.moves, won: g.result !== 0.5 });
      else todo.push({ player: g.white, game: `${g.white}-${g.black}|${g.opening}`, opening: g.opening, moves: g.moves, won: g.result !== 0.5, black: g.black });
    }
  const done = new Set(file.games.map((g) => g.game));
  const jobs = todo.filter((t) => !done.has(t.game) && !done.has(`${t.game}|white`));
  const engines = startEngines(num('engines', availableParallelism()));
  say(`${jobs.length} games to score (${file.games.length} already), depth ${depth}, ${engines.label} ×${engines.width}`);
  let saved = performance.now();
  const save = () => writeFileSync(out, JSON.stringify(file));
  await pool(jobs, engines.width, async (t) => {
    let pos = fromFen(starts[t.opening]!.fen);
    const firstWhite = pos.turn === 'white';
    const win: (number | null)[] = [];
    const phase: Phase[] = [];
    for (let i = 0; i <= t.moves.length; i++) {
      const s = await scoreOf(engines, makeFen(pos.toSetup()), depth);
      const w = s ? whiteShare(s) : null;
      win.push(w === null ? null : Math.round(w * 10) / 10);
      phase.push(phaseOf(pos));
      if (w !== null && Math.max(w, 100 - w) >= DECIDED) break;
      if (i === t.moves.length) break;
      const m = parseUciMove(pos, t.moves[i]!);
      if (!m) throw new Error(`illegal ${t.moves[i]} in ${t.game}`);
      pos = pos.clone();
      pos.play(m);
    }
    // Scored to its last move without reaching DECIDED, and won: decided at its end.
    const last = win[win.length - 1];
    const reached = last != null && Math.max(last, 100 - last) >= DECIDED;
    const scored = { win, phase, firstWhite, ...(t.won && !reached && win.length === t.moves.length + 1 ? { decisiveEnd: true } : {}) };
    if (t.black === undefined) file.games.push({ player: t.player, game: t.game, ...scored });
    else file.games.push({ player: t.player, game: `${t.game}|white`, side: 'white', ...scored }, { player: t.black, game: `${t.game}|black`, side: 'black', ...scored });
    if (performance.now() - saved > 30000) {
      saved = performance.now();
      save();
      say(`${file.games.length} games scored`);
    }
  });
  save();
  engines.quit();
  say(`${file.games.length} games in ${out}`);
}

/** How well Maia 3 and the networks predict the people's moves of those games, by phase. */
interface Prediction {
  game: number;
  ply: number;
  phase: Phase;
  /** Each model's probability of the move played, and whether it was its likeliest. */
  models: Record<string, { p: number; top: boolean }>;
}
async function predict(): Promise<void> {
  const out = need('out');
  const starts = readJson<HumanGame[]>(need('openings'), []);
  const maxPlies = num('plies', 80);
  const nets = flags.get('nets');
  const netIds = flag('net-ids', '').split(',').filter(Boolean);
  const maia = maia3('23m', num('threads', 2));
  const policyOf = new Map(netIds.map((id) => [id, lc0Policies(join(nets ?? '.', `${id}.onnx`))]));
  const rows: Prediction[] = [];
  await pool(
    starts.map((h, i) => [h, i] as const),
    num('concurrency', 32),
    async ([h, gi]) => {
      let pos = Chess.default();
      const history: Position[] = [pos.clone()];
      const all = [...h.moves, ...h.rest];
      for (let i = 0; i < all.length && i < h.moves.length + maxPlies; i++) {
        const uci = all[i]!;
        if (i >= h.moves.length) {
          const before = history.slice(-8, -1).map((p) => makeFen(p.toSetup()));
          const elo = h.ratings[pos.turn === 'white' ? 0 : 1];
          const models: Prediction['models'] = {};
          const answer = await maia.ask(pos, Math.round(elo / 100) * 100, before);
          const pm = answer.policy.find((m) => m.uci === uci)?.prob ?? 0;
          models['maia3-23m'] = { p: pm, top: answer.policy[0]?.uci === uci };
          for (const [id, net] of policyOf) {
            const policy = await net(history);
            models[id] = { p: policy.find((m) => m.uci === uci)?.prob ?? 0, top: policy[0]?.uci === uci };
          }
          rows.push({ game: gi, ply: i, phase: phaseOf(pos), models });
        }
        const m = parseUciMove(pos, uci);
        if (!m) throw new Error(`illegal ${uci} in game ${gi}`);
        pos = pos.clone();
        pos.play(m);
        history.push(pos);
      }
      if (gi % 25 === 0) say(`${gi} games`);
    },
  );
  writeFileSync(out, JSON.stringify(rows));
  say(`${rows.length} moves in ${out}`);
}

/* ------------------------------------------------------------------ the report */

const fmt = (e: { value: number; lo: number; hi: number }, digits = 0) => `${e.value.toFixed(digits)} (${e.lo.toFixed(digits)}–${e.hi.toFixed(digits)})`;

function report(): void {
  const boot = num('boot', 1000);
  const seed = num('seed', 1);
  const json: Record<string, unknown> = {};
  const lines: string[] = [];
  const gamesPath = flags.get('games');
  if (gamesPath) {
    const file = readJson<MatchFile>(gamesPath, { ratings: {}, ratingsAt: '', model: '23m', games: [] });
    const levels = file.levels ?? [...LEVELS];
    const played = new Set(file.games.flatMap((g) => [g.white, g.black]));
    const anchorSets: [string, readonly Anchor[]][] = [['the Maia bots', MAIA_ANCHORS.filter((a) => played.has(a.id))]];
    const all = ANCHORS.filter((a) => played.has(a.id));
    if (all.length > anchorSets[0]![1].length) anchorSets.push(['every bot', all]);
    const reports = anchorSets.map(([name, anchors]) => [name, matchReport(file.games, file.ratings, { boot, seed, levels, anchors })] as const);
    const r = reports[reports.length - 1]![1];
    json['match'] = { ...r, byAnchors: Object.fromEntries(reports), ratings: file.ratings, ratingsAt: file.ratingsAt, ratingsAtByBot: file.ratingsAtByBot, model: file.model, levels };
    const reasons = new Map<string, number>();
    for (const g of file.games) reasons.set(g.reason, (reasons.get(g.reason) ?? 0) + 1);
    lines.push(`## 1. The match (${r.games} games; Maia 3 ${file.model}; bots' ratings of ${file.ratingsAt.slice(0, 10)}${file.ratingsAtByBot ? `, ${Object.entries(file.ratingsAtByBot).map(([b, at]) => `${b}'s of ${at.slice(0, 10)}`).join(', ')}` : ''})`, '');
    lines.push(`Ends: ${[...reasons].map(([k, v]) => `${k} ${v}`).join(', ')}`, '');
    lines.push(`Levels: ${levels.filter((l) => played.has(l.id)).map((l) => `${l.label} (Maia ${l.elo} at ${l.precision}${l.guard ? ', checked' : ''})`).join(', ')}`, '');
    lines.push(`| player | local Elo (${anchorSets[anchorSets.length - 1]![0]}' mean 0) |`, '| --- | --- |');
    for (const [p, e] of Object.entries(r.elo).sort((a, b) => a[1].value - b[1].value)) lines.push(`| ${p} | ${fmt(e)} |`);
    lines.push('', '| pair | games | first player\'s score |', '| --- | --- | --- |');
    for (const p of r.pairs) lines.push(`| ${p.a} – ${p.b} | ${p.games} | ${((100 * p.score) / p.games).toFixed(1)}% |`);
    const shown = levels.filter((l) => played.has(l.id));
    for (const [name, rr] of reports) {
      const anchors = anchorSets.find(([n]) => n === name)![1];
      lines.push('', `Placed on Lichess by the line through ${name} (${anchors.map((a) => a.bot).join(', ')}):`, '');
      const placed = Object.keys(Object.values(rr.speeds)[0]?.levels ?? {});
      const head = (id: string) => {
        const l = shown.find((x) => x.id === id);
        return l ? `${l.label} (${l.elo}@${l.precision}${l.guard ? ', checked' : ''})` : id;
      };
      lines.push('| speed | the bots on Lichess | slope | ' + placed.map(head).join(' | ') + ' |', '| --- | --- | --- | ' + placed.map(() => '---').join(' | ') + ' |');
      for (const [sp, m] of Object.entries(rr.speeds)) {
        const bots = anchors.map((a) => file.ratings[a.bot]?.[sp as (typeof SPEEDS)[number]]?.rating ?? '?').join(', ');
        lines.push(`| ${sp} | ${bots} | ${fmt(m.slope, 2)} | ` + placed.map((id) => (m.levels[id] ? `${fmt(m.levels[id]!.line)}; nearest bot ${Math.round(m.levels[id]!.nearest.value)}` : '')).join(' | ') + ' |');
      }
    }
    if (Object.values(r.leaveOneOut).some((x) => Object.keys(x ?? {}).length)) {
      lines.push('', 'Each bot placed by the line through the others, against its own rating (do the bots agree on one scale?):', '');
      const ids = Object.keys(Object.values(r.leaveOneOut)[0] ?? {});
      lines.push('| speed | ' + ids.join(' | ') + ' |', '| --- | ' + ids.map(() => '---').join(' | ') + ' |');
      for (const [sp, x] of Object.entries(r.leaveOneOut)) lines.push(`| ${sp} | ` + ids.map((id) => (x![id] ? `${x![id]!.rating} → ${Math.round(x![id]!.placed)}` : '')).join(' | ') + ' |');
    }
    lines.push('');
  }
  const mistakesPath = flags.get('mistakes');
  if (mistakesPath) {
    const file = readJson<MistakesFile>(mistakesPath, { model: '23m', depth: 0, positions: [] });
    const elos = Object.keys(file.positions[0]?.policies ?? {}).map(Number);
    const levels: Condition[] = LEVELS.map((l) => ({ id: l.id, policyKey: String(l.elo), precision: l.precision }));
    const grid: Condition[] = elos.flatMap((elo) => [...new Set([...LEVELS.map((l) => l.precision), 1])].map((precision) => ({ id: `${elo}@${precision}`, policyKey: String(elo), precision })));
    const r = mistakeReport(file.positions, [...levels, ...grid], { boot, seed });
    json['mistakes'] = { ...r, model: file.model, depth: file.depth };
    lines.push(`## 2. The same positions (${r.positions} positions; Stockfish depth ${file.depth}; Maia 3 ${file.model})`, '');
    lines.push('Win% given up a move (mean) and blunders (more than 15 points), people against each level on the same positions:', '');
    lines.push('| band | positions | people | ' + LEVELS.map((l) => l.label).join(' | ') + ' |', '| --- | --- | --- | ' + LEVELS.map(() => '---').join(' | ') + ' |');
    for (const s of r.stats)
      lines.push(`| ${s.band} | ${s.positions} | ${s.human.loss.toFixed(2)}, ${(100 * s.human.blunder).toFixed(1)}% | ` + LEVELS.map((l) => `${s.model[l.id]!.loss.toFixed(2)}, ${(100 * s.model[l.id]!.blunder).toFixed(1)}%`).join(' | ') + ' |');
    const cov = Math.min(...r.stats.flatMap((s) => LEVELS.map((l) => s.model[l.id]!.covered)));
    lines.push('', `The levels' moves scored cover at least ${(100 * cov).toFixed(1)}% of their probability in every band.`, '');
    const rate = (x?: { value: number; lo: number; hi: number; outside: boolean }) => (x ? `${fmt(x)}${x.outside ? ' (beyond the bands)' : ''}` : '–');
    lines.push('| level | Maia rating, precision | rating its mean loss matches | rating its blunders match |', '| --- | --- | --- | --- |');
    for (const l of LEVELS) lines.push(`| ${l.label} | ${l.elo}, ${l.precision} | ${rate(r.ratings[l.id]!.loss)} | ${rate(r.ratings[l.id]!.blunder)} |`);
    lines.push('', 'Every rating asked, at each precision (the rating its mean loss matches):', '');
    const precisions = [...new Set(grid.map((g) => g.precision))];
    lines.push('| Maia rating | ' + precisions.map((p) => `precision ${p}`).join(' | ') + ' |', '| --- | ' + precisions.map(() => '---').join(' | ') + ' |');
    for (const elo of elos) lines.push(`| ${elo} | ` + precisions.map((p) => rate(r.ratings[`${elo}@${p}`]!.loss)).join(' | ') + ' |');
  }
  const scoredPath = flags.get('scored');
  if (scoredPath) {
    const file = readJson<{ depth: number; games: ScoredGame[] }>(scoredPath, { depth: 0, games: [] });
    const r = wholeGameReport(file.games, { boot, seed });
    json['wholeGames'] = { ...r, depth: file.depth };
    const players = Object.keys(r).sort((a, b) => (a === 'human' ? -1 : b === 'human' ? 1 : a.localeCompare(b)));
    lines.push(`## 3. Whole games from the same starts (Stockfish depth ${file.depth}; the moves until a side reached ${DECIDED}%)`, '');
    lines.push('| | ' + players.join(' | ') + ' |', '| --- | ' + players.map(() => '---').join(' | ') + ' |');
    const row = (name: string, f: (x: (typeof r)[string]) => string) => lines.push(`| ${name} | ` + players.map((p) => f(r[p]!)).join(' | ') + ' |');
    row('games, moves', (x) => `${x.games}, ${x.moves}`);
    for (const ph of ['all', 'middlegame', 'endgame'] as const) {
      row(`win% given up a move (${ph})`, (x) => fmt(x.loss[ph], 2));
      row(`mistakes, % of moves (${ph})`, (x) => fmt(x.mistakes[ph], 1));
      row(`blunders, % of moves (${ph})`, (x) => fmt(x.blunders[ph], 1));
    }
    row('moves in the endgame, %', (x) => fmt(x.endgameShare, 0));
    row('a lead kept (of games where a side got to 75%), %', (x) => fmt(x.converted, 0));
    row('decided within 60 plies, %', (x) => fmt(x.decided60, 0));
    row('plies to the decision (median)', (x) => fmt(x.decidedMedian, 0));
    lines.push('');
  }
  const predictPath = flags.get('predict');
  if (predictPath) {
    const rows = readJson<{ phase: Phase; models: Record<string, { p: number; top: boolean }> }[]>(predictPath, []);
    const models = Object.keys(rows[0]?.models ?? {});
    lines.push(`## 4. The people's moves of those games predicted (${rows.length} moves): the likeliest move's share, and the mean −log p (p at least 0.001)`, '');
    lines.push('| phase | moves | ' + models.join(' | ') + ' |', '| --- | --- | ' + models.map(() => '---').join(' | ') + ' |');
    const stat = {} as Record<string, Record<string, { top: number; nll: number; n: number }>>;
    for (const ph of ['all', 'middlegame', 'endgame']) {
      const rs = rows.filter((x) => ph === 'all' || x.phase === ph);
      stat[ph] = Object.fromEntries(models.map((m) => [m, { n: rs.length, top: rs.filter((x) => x.models[m]!.top).length / rs.length, nll: rs.reduce((a, x) => a - Math.log(Math.max(x.models[m]!.p, 0.001)), 0) / rs.length }]));
      lines.push(`| ${ph} | ${rs.length} | ` + models.map((m) => `${(100 * stat[ph]![m]!.top).toFixed(1)}%, ${stat[ph]![m]!.nll.toFixed(3)}`).join(' | ') + ' |');
    }
    json['predict'] = stat;
    lines.push('');
  }
  if (flags.has('json')) process.stdout.write(JSON.stringify(json, null, 1) + '\n');
  else process.stdout.write(lines.join('\n') + '\n');
}

/* ------------------------------------------------------------------ */

if (step === 'openings') await openings();
else if (step === 'match') await match();
else if (step === 'mistakes') await mistakes();
else if (step === 'humans') await humans();
else if (step === 'score') await score();
else if (step === 'predict') await predict();
else if (step === 'report') report();
else say('usage: node scripts/opponent-strength.ts openings|match|mistakes|report … (see the head of the file)');
