#!/usr/bin/env node
// How strong are the practice opponents (Easy, Medium, Hard) on Lichess's scale (PLAN.md §5.202)?
// Two measurements, each a report that writes nothing to the app or the data repo:
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
// Steps (each resumable: a file that exists is read and continued):
//
//   node scripts/opponent-strength.ts openings <dump.pgn.zst> --out openings.json
//       --count 60 --plies 10,16 --ratings 1600,2200 --max-cp 80 --depth 12
//   node scripts/opponent-strength.ts match --nets <dir> --openings openings.json --out games.json
//       --players easy,medium,hard,maia-1100,maia-1500,maia-1900 --concurrency 48 --engines 3
//       --check-depth 10 --threads 2 --seed 1 --model 23m|first [--all-pairs: the levels against each other too]
//   node scripts/opponent-strength.ts mistakes <dump.pgn.zst> --sample sample.json --out mistakes.json
//       --bands 1100,1300,…,2300 --per-band 500 --speeds rapid,classical --depth 14 --elos 1100,…,2500 --model 23m|first
//       [--sample-only: draw the sample and stop]
//   node scripts/opponent-strength.ts report --games games.json --mistakes mistakes.json [--json] [--boot 1000]
//
// `--nets` is a folder with maia-1100.onnx, maia-1500.onnx and maia-1900.onnx, converted from the
// CSSLab's networks (github.com/CSSLab/maia-chess, maia_weights/maia-<r>.pb.gz) by
// `node scripts/lc0-onnx.mjs <net.pb.gz> <lc0 checkout or its src/neural/tables> <out.onnx>`.
// The bots' Lichess ratings are read from lichess.org when the match starts and kept in its file.
// The dump: database.lichess.org's monthly file, or its first 250 MB (as scripts/maia-eval.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { positionKeyOf } from '../src/core/chess/positionKey.ts';
import { parseUciMove } from '../src/core/chess/uci.ts';
import { LC0_INPUT, lc0Planes, lc0Policy } from '../src/core/lc0/encode.ts';
import { createMaiaBatch, type MaiaBatch } from '../src/core/maia/batch.ts';
import { candidatesFrom, dumpLines, gamesOf, MIDDLEGAME, pliesOf, replay, rng, speedOf, takeSample } from './maia-eval-lib.ts';
import type { EvalPosition } from './maia-eval-types.ts';
import {
  adjudicate,
  ANCHORS,
  boardEnd,
  type BotRatings,
  type Condition,
  gameKey,
  type GameRecord,
  gameRng,
  LEVELS,
  levelMove,
  matchReport,
  type MistakePosition,
  mistakeReport,
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

function maia3(model: 'first' | '23m', threads: number): MaiaBatch {
  ort.env.wasm.numThreads = threads;
  const session = ort.InferenceSession.create(readFileSync(join(VENDOR, model === '23m' ? 'maia3-23m.onnx' : 'maia3_simplified.onnx')));
  return createMaiaBatch({
    history: model === '23m',
    memo: 200000,
    run: async (tokens, elos, n) => {
      const s = await session;
      const out = await s.run({
        tokens: new ort.Tensor('float32', tokens, [n, 64, model === '23m' ? 96 : 12]),
        elo_self: new ort.Tensor('float32', elos, [n]),
        elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
      });
      return { moves: out['logits_move']!.data as Float32Array, values: out['logits_value']!.data as Float32Array };
    },
    defer: (fn) => setImmediate(fn),
  });
}

/** A Maia-1 network as its Lichess bot plays it: the policy's likeliest move, positions batched. */
function maia1(path: string): (history: readonly Position[]) => Promise<string> {
  const session = ort.InferenceSession.create(readFileSync(path));
  let queue: { history: readonly Position[]; resolve(uci: string): void; reject(e: unknown): void }[] = [];
  let scheduled = false;
  const memo = new Map<string, string>();
  const run = async () => {
    scheduled = false;
    const jobs = queue.splice(0, 64);
    if (queue.length) schedule();
    try {
      const input = new Float32Array(jobs.length * LC0_INPUT);
      jobs.forEach((j, i) => lc0Planes(j.history, input, i * LC0_INPUT));
      const out = await (await session).run({ input: new ort.Tensor('float32', input, [jobs.length, 112, 8, 8]) });
      const logits = out['policy']!.data as Float32Array;
      jobs.forEach((j, i) => j.resolve(lc0Policy(j.history[j.history.length - 1]!, logits, i * 1858, 1, 0)[0]!.uci));
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
    const hit = memo.get(key);
    if (hit) return hit;
    const uci = await new Promise<string>((resolve, reject) => {
      queue.push({ history, resolve, reject });
      schedule();
    });
    if (memo.size > 500000) memo.clear();
    memo.set(key, uci);
    return uci;
  };
}

/** The bots' ratings on Lichess now. */
async function botRatings(): Promise<BotRatings> {
  const out: BotRatings = {};
  for (const a of ANCHORS) {
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
  model: string;
  games: GameRecord[];
}

async function match(): Promise<void> {
  const out = need('out');
  const nets = need('nets');
  const opens = readJson<Opening[]>(need('openings'), []);
  if (!opens.length) throw new Error('no openings');
  const players = flag('players', [...LEVELS.map((l) => l.id), ...ANCHORS.map((a) => a.id)].join(',')).split(',');
  const model = flag('model', '23m') as 'first' | '23m';
  const seed = num('seed', 1);
  const checkDepth = num('check-depth', 10);
  const file = readJson<MatchFile>(out, { ratings: {}, ratingsAt: '', model, games: [] });
  if (file.model !== model) throw new Error(`${out} was played with the ${file.model} model`);
  if (!file.ratingsAt || flags.has('refresh-ratings')) {
    file.ratings = await botRatings();
    file.ratingsAt = new Date().toISOString();
  }
  const maia = maia3(model, num('threads', 2));
  const nets1 = new Map(ANCHORS.filter((a) => players.includes(a.id)).map((a) => [a.id, maia1(join(nets, `${a.id}.onnx`))]));
  const engines = startEngines(num('engines', Math.max(1, availableParallelism() - 1)));
  say(`${engines.label} ×${engines.width}; Maia 3 (${model}); bots' ratings of ${file.ratingsAt.slice(0, 10)}`);

  /** A player's move in the game so far (positions from the start, the last the one to move in). */
  const moveOf = async (player: string, history: readonly Position[], rand: () => number): Promise<string> => {
    const net = nets1.get(player);
    if (net) return net(history);
    const level = LEVELS.find((l) => l.id === player);
    if (!level) throw new Error(`no player ${player}`);
    const pos = history[history.length - 1]!;
    const before = history.slice(-8, -1).map((p) => makeFen(p.toSetup()));
    const answer = await maia.ask(pos, level.elo, before);
    const m = levelMove(answer.policy, level, rand);
    if (!m) throw new Error('Maia gave no move');
    return m.uci;
  };

  const done = new Set(file.games.map((g) => gameKey(g.white, g.black, g.opening)));
  const jobs: { white: string; black: string; opening: number }[] = [];
  for (let k = 0; k < opens.length; k++)
    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++) {
        const levels = [players[i]!, players[j]!].filter((p) => LEVELS.some((l) => l.id === p)).length;
        // Two levels against each other: Maia 3 on both sides, the slowest games, and not needed for the mapping.
        if (levels === 2 && !flags.has('all-pairs')) continue;
        for (const [w, b] of [
          [players[i]!, players[j]!],
          [players[j]!, players[i]!],
        ] as const)
          if (!done.has(gameKey(w, b, k))) jobs.push({ white: w, black: b, opening: k });
      }
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
      say(`${file.games.length} games, ${rate.toFixed(2)} a second, about ${Math.round((jobs.length - played) / rate / 60)} min to go`);
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
    const r = matchReport(file.games, file.ratings, { boot, seed });
    json['match'] = { ...r, ratings: file.ratings, ratingsAt: file.ratingsAt, model: file.model };
    const reasons = new Map<string, number>();
    for (const g of file.games) reasons.set(g.reason, (reasons.get(g.reason) ?? 0) + 1);
    lines.push(`## 1. The match (${r.games} games; Maia 3 ${file.model}; bots' ratings of ${file.ratingsAt.slice(0, 10)})`, '');
    lines.push(`Ends: ${[...reasons].map(([k, v]) => `${k} ${v}`).join(', ')}`, '');
    lines.push('| player | local Elo (the bots\' mean 0) |', '| --- | --- |');
    for (const [p, e] of Object.entries(r.elo).sort((a, b) => a[1].value - b[1].value)) lines.push(`| ${p} | ${fmt(e)} |`);
    lines.push('', '| pair | games | first player\'s score |', '| --- | --- | --- |');
    for (const p of r.pairs) lines.push(`| ${p.a} – ${p.b} | ${p.games} | ${((100 * p.score) / p.games).toFixed(1)}% |`);
    lines.push('', '| speed | bots on Lichess (maia1, maia5, maia9) | slope | ' + LEVELS.map((l) => `${l.label} (${l.elo})`).join(' | ') + ' |', '| --- | --- | --- | ' + LEVELS.map(() => '---').join(' | ') + ' |');
    for (const [s, m] of Object.entries(r.speeds)) {
      const bots = ANCHORS.map((a) => file.ratings[a.bot]?.[s as (typeof SPEEDS)[number]]?.rating ?? '?').join(', ');
      lines.push(`| ${s} | ${bots} | ${fmt(m.slope, 2)} | ` + LEVELS.map((l) => (m.levels[l.id] ? `${fmt(m.levels[l.id]!.line)}; nearest bot ${Math.round(m.levels[l.id]!.nearest.value)}` : '')).join(' | ') + ' |');
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
  if (flags.has('json')) process.stdout.write(JSON.stringify(json, null, 1) + '\n');
  else process.stdout.write(lines.join('\n') + '\n');
}

/* ------------------------------------------------------------------ */

if (step === 'openings') await openings();
else if (step === 'match') await match();
else if (step === 'mistakes') await mistakes();
else if (step === 'report') report();
else say('usage: node scripts/opponent-strength.ts openings|match|mistakes|report … (see the head of the file)');
