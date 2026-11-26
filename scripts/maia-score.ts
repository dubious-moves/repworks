#!/usr/bin/env node
// How accurate is Maia 3's "Maia score" (Ms: the value head's expected score, win + draw/2, PLAN.md
// §5.188)? Compared with what rating-matched people actually score from the same position:
//
//   node scripts/maia-score.ts sample <dump.pgn.zst> --out sample.json [--per 2500]
//   node scripts/maia-score.ts maia --sample sample.json --out maia.json [--before 7|0]
//   node scripts/maia-score.ts explorer --sample sample.json --out explorer.json --bucket 1400 [--n 150]
//   node scripts/maia-score.ts report --sample sample.json --maia maia.json --explorer explorer-*.json
//
// Two references, both from Lichess rapid and classical games:
//  - the explorer (explorer.lichess.org, LICHESS_TOKEN, the app's 16 requests a minute): the score
//    White got from that position among games whose players were in the rating bucket. Thousands of
//    games a position, so it is the sharp reference, but only for positions that recur.
//  - the games the position came from (the dump): one result per position, noisy, but any position,
//    so a calibration over many (Maia's score in bins against the score people got).
// Maia is asked as the app asks it (the 23M model with the seven positions before) at the game's real
// ratings (explorer positions: the bucket's middle).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { clampElo, expectedScore, maiaHistoryTokens } from '../src/core/maia/encode.ts';
import { explorerUrl } from '../src/core/explorer/providers.ts';
import { fenKey } from '../src/core/explorer/search.ts';
import { dumpLines, gamesOf, pliesOf, replay, rng, shuffle, speedOf } from './maia-eval-lib.ts';

const BUCKETS: Record<number, [number, number, number]> = { 1400: [1400, 1599, 1500], 1800: [1800, 1999, 1900], 2200: [2200, 2499, 2300] };
const SPEEDS = ['rapid', 'classical'];

export type Phase = 'opening' | 'middlegame' | 'endgame';
export interface Pos {
  id: string;
  game: string;
  bucket: number;
  phase: Phase;
  ply: number;
  fen: string;
  before: string[];
  pieces: number;
  white: number;
  black: number;
  /** White's score in the game: 1, 0.5, 0. */
  result: number;
  termination: string;
}

function opts(argv: string[]) {
  const o = new Map<string, string>();
  let path = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const nx = argv[i + 1];
      if (nx === undefined || nx.startsWith('--')) o.set(a.slice(2), '');
      else (o.set(a.slice(2), nx), i++);
    } else path = a;
  }
  return { path, o, rest: argv };
}

const phaseOf = (ply: number, pieces: number): Phase | null => {
  const full = (ply >> 1) + 1;
  if (full >= 5 && full <= 10 && pieces >= 26) return 'opening';
  if (full >= 14 && full <= 40 && pieces >= 14) return 'middlegame';
  if (full >= 25 && pieces <= 10) return 'endgame';
  return null;
};

async function sample(path: string, out: string, per: number): Promise<void> {
  const rand = rng(1);
  const pool = new Map<string, Pos[]>();
  let read = 0;
  for await (const g of gamesOf(dumpLines(path))) {
    read++;
    const h = g.headers;
    const speed = speedOf(h['Event'] ?? '');
    if (!speed || !SPEEDS.includes(speed) || h['Termination'] === 'Abandoned') continue;
    const wr = Number(h['WhiteElo']);
    const br = Number(h['BlackElo']);
    const res = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 }[h['Result'] ?? ''];
    if (res === undefined || !Number.isFinite(wr) || !Number.isFinite(br)) continue;
    const bucket = Object.keys(BUCKETS).map(Number).find((b) => wr >= BUCKETS[b]![0] && wr <= BUCKETS[b]![1] && br >= BUCKETS[b]![0] && br <= BUCKETS[b]![1]);
    if (!bucket) continue;
    const { fens } = replay(pliesOf(g.moves), { moves: [1, 999], pieces: [0, 32], minClock: -1 });
    const plies = fens.length;
    const id = /\/(\w+)$/.exec(h['Site'] ?? '')?.[1] ?? `g${read}`;
    for (const phase of ['opening', 'middlegame', 'endgame'] as const) {
      const cands: number[] = [];
      for (let p = 8; p < plies; p++) {
        const pieces = (fens[p]!.split(' ')[0]!.match(/[a-zA-Z]/g) ?? []).length;
        if (phaseOf(p, pieces) === phase) cands.push(p);
      }
      if (!cands.length) continue;
      const p = cands[Math.floor(rand() * cands.length)]!;
      const pieces = (fens[p]!.split(' ')[0]!.match(/[a-zA-Z]/g) ?? []).length;
      const key = `${bucket}/${phase}`;
      const list = pool.get(key) ?? [];
      pool.set(key, list);
      list.push({ id: `${id}:${p}`, game: id, bucket, phase, ply: p, fen: fens[p]!, before: fens.slice(Math.max(0, p - 7), p), pieces, white: wr, black: br, result: res, termination: h['Termination'] ?? '' });
    }
  }
  const all: Pos[] = [];
  for (const [key, list] of [...pool].sort()) {
    const take = shuffle(list, rand).slice(0, per);
    process.stderr.write(`${key}: ${list.length} candidates, ${take.length} kept\n`);
    all.push(...take);
  }
  process.stderr.write(`read ${read} games\n`);
  writeFileSync(out, JSON.stringify(all));
}

/** Maia's expected score for White, per position (and the likeliest move's share, for interest). */
async function maia(samplePath: string, out: string, before: number, mid: boolean, only?: Set<string>): Promise<void> {
  let sample = JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[];
  if (only) sample = sample.filter((p) => only.has(p.id));
  ort.env.wasm.numThreads = 4;
  const session = await ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', 'vendor', 'maia', 'maia3-23m.onnx')));
  const batch = 32;
  const res: Record<string, number> = {};
  const width = 64 * 96;
  const t = Date.now();
  for (let at = 0; at < sample.length; at += batch) {
    const chunk = sample.slice(at, at + batch);
    const tokens = new Float32Array(chunk.length * width);
    const self = new Float32Array(chunk.length);
    const oppo = new Float32Array(chunk.length);
    chunk.forEach((p, i) => {
      tokens.set(maiaHistoryTokens([...p.before.slice(p.before.length - Math.min(before, p.before.length)), p.fen]), i * width);
      const m = BUCKETS[p.bucket]![2];
      const stm = p.fen.split(' ')[1] === 'w';
      self[i] = clampElo(mid ? m : stm ? p.white : p.black);
      oppo[i] = clampElo(mid ? m : stm ? p.black : p.white);
    });
    const o = await session.run({
      tokens: new ort.Tensor('float32', tokens, [chunk.length, 64, 96]),
      elo_self: new ort.Tensor('float32', self, [chunk.length]),
      elo_oppo: new ort.Tensor('float32', oppo, [chunk.length]),
    });
    const v = o['logits_value']!.data as Float32Array;
    chunk.forEach((p, i) => {
      const s = expectedScore(v, i * 3);
      res[p.id] = p.fen.split(' ')[1] === 'w' ? s : 1 - s;
    });
    if ((at / batch) % 25 === 0) process.stderr.write(`maia ${Math.min(at + batch, sample.length)}/${sample.length} (${Math.round((Date.now() - t) / 1000)} s)\n`);
  }
  writeFileSync(out, JSON.stringify(res));
}

interface Ex {
  white: number;
  draws: number;
  black: number;
}
async function explorer(samplePath: string, out: string, bucket: number, n: number, token: string): Promise<void> {
  const sample = (JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[]).filter((p) => p.bucket === bucket);
  const rand = rng(bucket);
  // Positions that recur: the opening, the early middlegame (moves 14-18) and endgames with few pieces.
  const pick = (f: (p: Pos) => boolean, k: number) => shuffle(sample.filter(f), rand).slice(0, k);
  const todo = [
    ...pick((p) => p.phase === 'opening', n),
    ...pick((p) => p.phase === 'middlegame' && p.ply <= 35, n),
    ...pick((p) => p.phase === 'endgame' && p.pieces <= 7, n),
  ];
  const seen = new Set<string>();
  const res: Record<string, Ex> = {};
  let k = 0;
  for (const p of todo) {
    const key = fenKey(p.fen);
    if (seen.has(key)) continue;
    seen.add(key);
    const url = explorerUrl(p.fen, { db: 'lichess', speeds: SPEEDS, ratings: [bucket], games: 0 } as never);
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      if (r?.ok) {
        const j = (await r.json()) as Ex;
        res[p.id] = { white: j.white, draws: j.draws, black: j.black };
        break;
      }
      const wait = r?.status === 429 ? 61000 : 3000;
      process.stderr.write(`explorer ${r?.status}: waiting ${wait / 1000} s\n`);
      await new Promise((x) => setTimeout(x, wait));
    }
    if (++k % 20 === 0) {
      process.stderr.write(`explorer ${bucket}: ${k}/${todo.length}\n`);
      writeFileSync(out, JSON.stringify(res));
    }
    await new Promise((x) => setTimeout(x, 3750));
  }
  writeFileSync(out, JSON.stringify(res));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const f = (x: number, d = 3) => x.toFixed(d);

function calibration(rows: { p: number; y: number }[], bins = 10): string[] {
  const out = ['| Maia score | positions | Maia mean | people scored |', '| --- | --- | --- | --- |'];
  for (let b = 0; b < bins; b++) {
    const r = rows.filter((x) => x.p >= b / bins && (x.p < (b + 1) / bins || (b === bins - 1 && x.p <= 1)));
    if (r.length < 20) continue;
    out.push(`| ${b * 10}–${b * 10 + 10}% | ${r.length} | ${f(mean(r.map((x) => x.p)))} | ${f(mean(r.map((x) => x.y)))} |`);
  }
  return out;
}

function report(sample: Pos[], ms: Record<string, number>, exs: Record<string, Ex>, minGames: number): string {
  const out: string[] = [];
  const phases: Phase[] = ['opening', 'middlegame', 'endgame'];
  out.push('### Against the explorer (positions with at least ' + minGames + ' games in the bucket)\n');
  out.push('| bucket | phase | positions | median games | Maia mean | people mean | mean error (Maia − people) | MAE | RMSE | corr |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const corr = (a: number[], b: number[]) => {
    const ma = mean(a), mb = mean(b);
    const c = a.reduce((s, x, i) => s + (x - ma) * (b[i]! - mb), 0);
    return c / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0));
  };
  const exRows = (b?: number, ph?: Phase) =>
    sample
      .filter((p) => (b === undefined || p.bucket === b) && (ph === undefined || p.phase === ph) && exs[p.id] && ms[p.id] !== undefined)
      .map((p) => {
        const e = exs[p.id]!;
        const n = e.white + e.draws + e.black;
        return { p: ms[p.id]!, y: (e.white + e.draws / 2) / n, n, pos: p };
      })
      .filter((r) => r.n >= minGames);
  for (const b of [1400, 1800, 2200, undefined]) {
    for (const ph of [...phases, undefined]) {
      const r = exRows(b, ph);
      if (r.length < 5) continue;
      const d = r.map((x) => x.p - x.y);
      const ns = r.map((x) => x.n).sort((x, y) => x - y);
      out.push(`| ${b ?? 'all'} | ${ph ?? 'all'} | ${r.length} | ${ns[ns.length >> 1]} | ${f(mean(r.map((x) => x.p)))} | ${f(mean(r.map((x) => x.y)))} | ${f(mean(d), 3)} | ${f(mean(d.map(Math.abs)))} | ${f(Math.sqrt(mean(d.map((x) => x * x))))} | ${f(corr(r.map((x) => x.p), r.map((x) => x.y)), 2)} |`);
    }
  }
  const allR = exRows();
  if (allR.length) {
    out.push('\nCalibration against the explorer (all buckets, White\'s score):\n');
    out.push(...calibration(allR));
    // The same positions: a "knows nothing" guess (the bucket's mean) and the mover's rating edge as references.
    const base = mean(allR.map((x) => x.y));
    out.push(`\nExplorer positions: Maia's RMSE ${f(Math.sqrt(mean(allR.map((x) => (x.p - x.y) ** 2))))}; guessing the average (${f(base)}) every time: ${f(Math.sqrt(mean(allR.map((x) => (base - x.y) ** 2))))}; guessing 0.5: ${f(Math.sqrt(mean(allR.map((x) => (0.5 - x.y) ** 2))))}.`);
    const worst = [...allR].sort((a, b) => Math.abs(b.p - b.y) - Math.abs(a.p - a.y)).slice(0, 8);
    out.push('\nLargest gaps:\n');
    for (const w of worst) out.push(`- ${w.pos.phase} ${w.pos.bucket}, ${w.n} games: Maia ${f(w.p, 2)}, people ${f(w.y, 2)}  \`${w.pos.fen}\``);
  }
  out.push('\n### Against the game each position came from (one result per position, noisy)\n');
  out.push('| bucket | phase | positions | Maia mean | White scored | Brier (Maia) | Brier (mean guess) | Brier skill | log-loss (Maia) |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const gRows = (b?: number, ph?: Phase, noTime = false) =>
    sample.filter((p) => (b === undefined || p.bucket === b) && (ph === undefined || p.phase === ph) && ms[p.id] !== undefined && (!noTime || p.termination !== 'Time forfeit')).map((p) => ({ p: ms[p.id]!, y: p.result }));
  const brier = (r: { p: number; y: number }[]) => mean(r.map((x) => (x.p - x.y) ** 2));
  for (const b of [1400, 1800, 2200, undefined]) {
    for (const ph of [...phases, undefined]) {
      const r = gRows(b, ph);
      if (r.length < 30) continue;
      const base = mean(r.map((x) => x.y));
      const bm = brier(r);
      const bb = mean(r.map((x) => (base - x.y) ** 2));
      // Log loss over a draw-aware score: y in {0, .5, 1} as a soft label.
      const ll = mean(r.map((x) => -(x.y * Math.log(Math.max(1e-6, x.p)) + (1 - x.y) * Math.log(Math.max(1e-6, 1 - x.p)))));
      out.push(`| ${b ?? 'all'} | ${ph ?? 'all'} | ${r.length} | ${f(mean(r.map((x) => x.p)))} | ${f(base)} | ${f(bm)} | ${f(bb)} | ${f(1 - bm / bb, 3)} | ${f(ll)} |`);
    }
  }
  out.push('\nCalibration over all sampled positions:\n');
  out.push(...calibration(gRows()));
  for (const ph of phases) {
    out.push(`\nCalibration, ${ph}:\n`);
    out.push(...calibration(gRows(undefined, ph)));
  }
  const noTime = gRows(undefined, undefined, true);
  out.push(`\nWithout games lost on time: ${noTime.length} positions, Brier ${f(brier(noTime))} (all games ${f(brier(gRows()))}).`);
  return out.join('\n');
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { path, o } = opts(rest);
  if (cmd === 'sample') await sample(path, o.get('out')!, Number(o.get('per') ?? 2500));
  else if (cmd === 'maia') await maia(o.get('sample')!, o.get('out')!, Number(o.get('before') ?? 7), o.has('mid'));
  else if (cmd === 'explorer') await explorer(o.get('sample')!, o.get('out')!, Number(o.get('bucket')), Number(o.get('n') ?? 150), process.env[o.get('token-env') ?? 'LICHESS_TOKEN'] ?? '');
  else if (cmd === 'report') {
    const exs: Record<string, Ex> = {};
    for (const file of (o.get('explorer') ?? '').split(',').filter(Boolean)) Object.assign(exs, JSON.parse(readFileSync(file, 'utf8')));
    console.log(report(JSON.parse(readFileSync(o.get('sample')!, 'utf8')) as Pos[], JSON.parse(readFileSync(o.get('maia')!, 'utf8')) as Record<string, number>, exs, Number(o.get('min-games') ?? 200)));
  } else throw new Error('usage: sample | maia | explorer | report (see the file head)');
}

if (import.meta.main) await main();
