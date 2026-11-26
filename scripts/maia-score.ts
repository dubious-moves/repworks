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
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import * as ort from 'onnxruntime-web';
import { clampElo, expectedScore, legalLogits, MAIA_MOVES, maiaHistoryTokens } from '../src/core/maia/encode.ts';
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
  /** The move played in the game from this position (UCI). */
  played?: string;
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
    const { fens, ucis } = replay(pliesOf(g.moves), { moves: [1, 999], pieces: [0, 32], minClock: -1 });
    const plies = ucis.length;
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
      list.push({ id: `${id}:${p}`, game: id, bucket, phase, ply: p, fen: fens[p]!, before: fens.slice(Math.max(0, p - 7), p), pieces, white: wr, black: br, result: res, termination: h['Termination'] ?? '', played: ucis[p]! });
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

/* ------------------------------------------------------------ between moves */

interface MoveRow {
  san: string;
  white: number;
  draws: number;
  black: number;
}

/** The explorer's rows for each move at the positions that had `minGames` games, one request each. */
async function moveRows(samplePath: string, totalsFiles: string[], out: string, bucket: number, minGames: number, token: string): Promise<void> {
  const totals: Record<string, Ex> = {};
  for (const f of totalsFiles) Object.assign(totals, JSON.parse(readFileSync(f, 'utf8')));
  const sample = (JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[]).filter((p) => p.bucket === bucket && totals[p.id] && totals[p.id]!.white + totals[p.id]!.draws + totals[p.id]!.black >= minGames);
  const res: Record<string, MoveRow[]> = {};
  const seen = new Set<string>();
  for (const p of sample) {
    const key = fenKey(p.fen);
    if (seen.has(key)) continue;
    seen.add(key);
    const url = explorerUrl(p.fen, { db: 'lichess', speeds: SPEEDS, ratings: [bucket], games: 0 } as never);
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      if (r?.ok) {
        const j = (await r.json()) as { moves: MoveRow[] };
        res[p.id] = j.moves.map((m) => ({ san: m.san, white: m.white, draws: m.draws, black: m.black }));
        break;
      }
      await new Promise((x) => setTimeout(x, r?.status === 429 ? 61000 : 3000));
    }
    await new Promise((x) => setTimeout(x, 3750));
  }
  writeFileSync(out, JSON.stringify(res));
}

/** Maia's score for the mover after each move: the position after it, asked as the control (no history, the bucket's middle rating for both). */
async function afterMoves(samplePath: string, rowFiles: string[], out: string): Promise<void> {
  const sample = new Map((JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[]).map((p) => [p.id, p]));
  const rows: Record<string, MoveRow[]> = {};
  for (const f of rowFiles) Object.assign(rows, JSON.parse(readFileSync(f, 'utf8')));
  const asks: { id: string; san: string; fen: string; elo: number; white: boolean }[] = [];
  for (const [id, ms] of Object.entries(rows)) {
    const p = sample.get(id)!;
    for (const m of ms) {
      const pos = Chess.fromSetup(parseFen(p.fen).unwrap()).unwrap();
      const mv = parseSan(pos, m.san);
      if (!mv) continue;
      const white = pos.turn === 'white';
      pos.play(mv);
      asks.push({ id, san: m.san, fen: makeFen(pos.toSetup()), elo: BUCKETS[p.bucket]![2], white });
    }
  }
  ort.env.wasm.numThreads = 4;
  const session = await ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', 'vendor', 'maia', 'maia3-23m.onnx')));
  const res: Record<string, Record<string, number>> = {};
  for (let at = 0; at < asks.length; at += 32) {
    const chunk = asks.slice(at, at + 32);
    const tokens = new Float32Array(chunk.length * 64 * 96);
    chunk.forEach((a, i) => tokens.set(maiaHistoryTokens([a.fen]), i * 64 * 96));
    const elo = Float32Array.from(chunk.map((a) => clampElo(a.elo)));
    const o = await session.run({ tokens: new ort.Tensor('float32', tokens, [chunk.length, 64, 96]), elo_self: new ort.Tensor('float32', elo, [chunk.length]), elo_oppo: new ort.Tensor('float32', elo, [chunk.length]) });
    const v = o['logits_value']!.data as Float32Array;
    chunk.forEach((a, i) => {
      // The value is the side to move's, after the move: the other side, the mover's opponent.
      (res[a.id] ??= {})[a.san] = 1 - expectedScore(v, i * 3);
    });
  }
  writeFileSync(out, JSON.stringify(res));
}

function spearman(a: number[], b: number[]): number {
  const rank = (x: number[]) => x.map((v) => x.filter((w) => w < v).length + (x.filter((w) => w === v).length - 1) / 2);
  const ra = rank(a), rb = rank(b);
  const ma = mean(ra), mb = mean(rb);
  const c = ra.reduce((s, x, i) => s + (x - ma) * (rb[i]! - mb), 0);
  const d = Math.sqrt(ra.reduce((s, x) => s + (x - ma) ** 2, 0) * rb.reduce((s, x) => s + (x - mb) ** 2, 0));
  return d ? c / d : NaN;
}

function movesReport(samplePath: string, rowFiles: string[], maiaFile: string, minMove: number): string {
  const sample = new Map((JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[]).map((p) => [p.id, p]));
  const rows: Record<string, MoveRow[]> = {};
  for (const f of rowFiles) Object.assign(rows, JSON.parse(readFileSync(f, 'utf8')));
  const ms = JSON.parse(readFileSync(maiaFile, 'utf8')) as Record<string, Record<string, number>>;
  const out: string[] = [];
  interface M { people: number; maia: number; n: number }
  const positions: { bucket: number; moves: M[] }[] = [];
  for (const [id, list] of Object.entries(rows)) {
    const p = sample.get(id)!;
    const white = p.fen.split(' ')[1] === 'w';
    const moves = list
      .filter((m) => m.white + m.draws + m.black >= minMove && ms[id]?.[m.san] !== undefined)
      .map((m) => {
        const n = m.white + m.draws + m.black;
        return { people: ((white ? m.white : m.black) + m.draws / 2) / n, maia: ms[id]![m.san]!, n };
      });
    if (moves.length >= 2) positions.push({ bucket: p.bucket, moves });
  }
  out.push(`Moves with at least ${minMove} games in the bucket; positions with two or more such moves: ${positions.length}.\n`);
  out.push('| bucket | positions | move pairs | people\'s gap in a pair (mean abs) | Maia\'s same-direction share | Maia gap ÷ people gap (slope) | Spearman per position (mean) | people\'s best move is Maia\'s best |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const bins: [number, number][] = [[0, 0.02], [0.02, 0.05], [0.05, 0.1], [0.1, 1]];
  const binRows: Record<string, { agree: number; n: number; sx: number; sy: number }> = {};
  for (const b of [1400, 1800, 2200, 0]) {
    const ps = positions.filter((p) => b === 0 || p.bucket === b);
    if (!ps.length) continue;
    let pairs = 0, agree = 0, gap = 0, sxy = 0, sxx = 0;
    const sp: number[] = [];
    let topHit = 0;
    for (const p of ps) {
      for (let i = 0; i < p.moves.length; i++)
        for (let j = i + 1; j < p.moves.length; j++) {
          const dp = p.moves[i]!.people - p.moves[j]!.people;
          const dm = p.moves[i]!.maia - p.moves[j]!.maia;
          pairs++;
          gap += Math.abs(dp);
          if (Math.sign(dp) === Math.sign(dm)) agree++;
          sxy += dp * dm;
          sxx += dp * dp;
          if (b === 0) {
            const k = bins.findIndex(([lo, hi]) => Math.abs(dp) >= lo && Math.abs(dp) < hi);
            const r = (binRows[k] ??= { agree: 0, n: 0, sx: 0, sy: 0 });
            r.n++;
            if (Math.sign(dp) === Math.sign(dm)) r.agree++;
            r.sx += Math.abs(dp);
            r.sy += Math.abs(dm);
          }
        }
      const s = spearman(p.moves.map((m) => m.people), p.moves.map((m) => m.maia));
      if (Number.isFinite(s)) sp.push(s);
      const best = (k: 'people' | 'maia') => p.moves.reduce((x, y) => (y[k] > x[k] ? y : x));
      if (best('people') === best('maia')) topHit++;
    }
    out.push(`| ${b || 'all'} | ${ps.length} | ${pairs} | ${f(gap / pairs * 100, 1)} pts | ${f(agree / pairs * 100, 1)}% | ${f(sxy / sxx, 2)} | ${f(mean(sp), 2)} | ${f(topHit / ps.length * 100, 0)}% (chance ${f(mean(ps.map((p) => 1 / p.moves.length)) * 100, 0)}%) |`);
  }
  out.push('\nBy the size of people\'s gap between the two moves (all buckets):\n');
  out.push('| people\'s gap | pairs | Maia same direction | people\'s mean gap | Maia\'s mean gap |');
  out.push('| --- | --- | --- | --- | --- |');
  bins.forEach(([lo, hi], k) => {
    const r = binRows[k];
    if (r) out.push(`| ${lo * 100}–${hi >= 1 ? '' : hi * 100}${hi >= 1 ? '+' : ''} pts | ${r.n} | ${f(r.agree / r.n * 100, 1)}% | ${f(r.sx / r.n * 100, 1)} | ${f(r.sy / r.n * 100, 1)} |`);
  });
  return out.join('\n');
}

/* ------------------------------------------------------- likelihood and popularity */

const EDGES = [0, 0.001, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0001];
const binOf = (p: number) => EDGES.findIndex((e, i) => p >= e && p < EDGES[i + 1]!);
const softmax = (xs: number[]) => {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
};

/** Every legal move's likelihood for each sampled position, scored against the move the game's player chose. A summary by phase and bucket, calibrated in bins of Ml. */
async function policyCalibration(samplePath: string, out: string): Promise<void> {
  const sample = (JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[]).filter((p) => p.played);
  ort.env.wasm.numThreads = 4;
  const session = await ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', 'vendor', 'maia', 'maia3-23m.onnx')));
  interface Acc { n: number; top1: number; top3: number; nll: number; topProb: number; bins: { n: number; sumP: number; hit: number }[] }
  const acc: Record<string, Acc> = {};
  const fresh = (): Acc => ({ n: 0, top1: 0, top3: 0, nll: 0, topProb: 0, bins: EDGES.slice(0, -1).map(() => ({ n: 0, sumP: 0, hit: 0 })) });
  const t = Date.now();
  for (let at = 0; at < sample.length; at += 32) {
    const chunk = sample.slice(at, at + 32);
    const tokens = new Float32Array(chunk.length * 64 * 96);
    const self = new Float32Array(chunk.length);
    const oppo = new Float32Array(chunk.length);
    chunk.forEach((p, i) => {
      tokens.set(maiaHistoryTokens([...p.before, p.fen]), i * 64 * 96);
      const stm = p.fen.split(' ')[1] === 'w';
      self[i] = clampElo(stm ? p.white : p.black);
      oppo[i] = clampElo(stm ? p.black : p.white);
    });
    const o = await session.run({ tokens: new ort.Tensor('float32', tokens, [chunk.length, 64, 96]), elo_self: new ort.Tensor('float32', self, [chunk.length]), elo_oppo: new ort.Tensor('float32', oppo, [chunk.length]) });
    const lg = o['logits_move']!.data as Float32Array;
    chunk.forEach((p, i) => {
      const pos = Chess.fromSetup(parseFen(p.fen).unwrap()).unwrap();
      const moves = legalLogits(pos, lg, i * MAIA_MOVES);
      const probs = softmax(moves.map((m) => m.logit));
      const k = moves.findIndex((m) => m.uci === p.played);
      if (k < 0) return;
      const rank = probs.filter((x) => x > probs[k]!).length;
      for (const key of [`${p.phase}`, `${p.phase}/${p.bucket}`, 'all']) {
        const a = (acc[key] ??= fresh());
        a.n++;
        a.top1 += rank === 0 ? 1 : 0;
        a.top3 += rank < 3 ? 1 : 0;
        a.nll += -Math.log(Math.max(probs[k]!, 1e-12));
        a.topProb += Math.max(...probs);
        probs.forEach((q, j) => {
          const b = a.bins[binOf(q)]!;
          b.n++;
          b.sumP += q;
          if (j === k) b.hit++;
        });
      }
    });
    if ((at / 32) % 50 === 0) process.stderr.write(`policy ${Math.min(at + 32, sample.length)}/${sample.length} (${Math.round((Date.now() - t) / 1000)} s)\n`);
  }
  writeFileSync(out, JSON.stringify(acc));
}

function policyReport(file: string): string {
  const acc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { n: number; top1: number; top3: number; nll: number; topProb: number; bins: { n: number; sumP: number; hit: number }[] }>;
  const out: string[] = ['| group | positions | played = Maia\'s likeliest | in Maia\'s top 3 | mean Maia top prob | mean NLL of the played move |', '| --- | --- | --- | --- | --- | --- |'];
  for (const k of Object.keys(acc).sort()) {
    const a = acc[k]!;
    out.push(`| ${k} | ${a.n} | ${f(a.top1 / a.n * 100, 1)}% | ${f(a.top3 / a.n * 100, 1)}% | ${f(a.topProb / a.n * 100, 1)}% | ${f(a.nll / a.n)} |`);
  }
  for (const k of ['all', 'opening', 'middlegame', 'endgame']) {
    const a = acc[k];
    if (!a) continue;
    out.push(`\nCalibration of Ml, ${k} (every legal move of every position; how often the move was the one played):\n`);
    out.push('| Maia says | moves | mean Ml | played in |');
    out.push('| --- | --- | --- | --- |');
    a.bins.forEach((b, i) => {
      if (b.n) out.push(`| ${(EDGES[i]! * 100).toFixed(1)}–${Math.min(100, EDGES[i + 1]! * 100).toFixed(1)}% | ${b.n} | ${f(b.sumP / b.n * 100, 2)}% | ${f(b.hit / b.n * 100, 2)}% |`);
    });
  }
  return out.join('\n');
}

/** Maia's likelihood against the explorer's share of games for each move (openings, the bucket's middle rating, no history). */
async function popularity(samplePath: string, rowFiles: string[]): Promise<string> {
  const sample = new Map((JSON.parse(readFileSync(samplePath, 'utf8')) as Pos[]).map((p) => [p.id, p]));
  const rows: Record<string, MoveRow[]> = {};
  for (const f of rowFiles) Object.assign(rows, JSON.parse(readFileSync(f, 'utf8')));
  ort.env.wasm.numThreads = 4;
  const session = await ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', 'vendor', 'maia', 'maia3-23m.onnx')));
  const ids = Object.keys(rows);
  interface P { bucket: number; share: number[]; ml: number[]; unseenMl: number; topMatch: boolean; top3: number; tv: number; kl: number; spearman: number; popularMissed: number; popular: number; maiaLikelyUnplayed: number; maiaLikely: number }
  const ps: P[] = [];
  const bins = EDGES.slice(0, -1).map(() => ({ n: 0, sumMl: 0, sumShare: 0 }));
  for (let at = 0; at < ids.length; at += 32) {
    const chunk = ids.slice(at, at + 32);
    const tokens = new Float32Array(chunk.length * 64 * 96);
    const elo = Float32Array.from(chunk.map((id) => clampElo(BUCKETS[sample.get(id)!.bucket]![2])));
    chunk.forEach((id, i) => tokens.set(maiaHistoryTokens([sample.get(id)!.fen]), i * 64 * 96));
    const o = await session.run({ tokens: new ort.Tensor('float32', tokens, [chunk.length, 64, 96]), elo_self: new ort.Tensor('float32', elo, [chunk.length]), elo_oppo: new ort.Tensor('float32', elo, [chunk.length]) });
    const lg = o['logits_move']!.data as Float32Array;
    chunk.forEach((id, i) => {
      const p = sample.get(id)!;
      const pos = Chess.fromSetup(parseFen(p.fen).unwrap()).unwrap();
      const moves = legalLogits(pos, lg, i * MAIA_MOVES);
      const probs = softmax(moves.map((m) => m.logit));
      const total = rows[id]!.reduce((a, r) => a + r.white + r.draws + r.black, 0);
      const share = moves.map((m) => {
        const r = rows[id]!.find((x) => x.san === m.san);
        return r ? (r.white + r.draws + r.black) / total : 0;
      });
      probs.forEach((q, j) => {
        const b = bins[binOf(q)]!;
        b.n++;
        b.sumMl += q;
        b.sumShare += share[j]!;
      });
      const idx = moves.map((_, j) => j);
      const byShare = [...idx].sort((a, b) => share[b]! - share[a]!);
      const byMl = [...idx].sort((a, b) => probs[b]! - probs[a]!);
      const seen = idx.filter((j) => share[j]! > 0);
      const kl = share.reduce((a, s, j) => (s > 0 ? a + s * Math.log(s / Math.max(probs[j]!, 1e-9)) : a), 0);
      ps.push({
        bucket: p.bucket,
        share,
        ml: probs,
        unseenMl: idx.filter((j) => share[j] === 0).reduce((a, j) => a + probs[j]!, 0),
        topMatch: byShare[0] === byMl[0],
        top3: byShare.slice(0, 3).filter((j) => byMl.slice(0, 3).includes(j)).length,
        tv: 0.5 * idx.reduce((a, j) => a + Math.abs(share[j]! - probs[j]!), 0),
        kl,
        spearman: spearman(seen.map((j) => share[j]!), seen.map((j) => probs[j]!)),
        popular: idx.filter((j) => share[j]! >= 0.1).length,
        popularMissed: idx.filter((j) => share[j]! >= 0.1 && probs[j]! < 0.02).length,
        maiaLikely: idx.filter((j) => probs[j]! >= 0.2).length,
        maiaLikelyUnplayed: idx.filter((j) => probs[j]! >= 0.2 && share[j]! < 0.02).length,
      });
    });
  }
  const out: string[] = [`${ps.length} opening positions with at least 200 games in the bucket (explorer move shares over all its moves).\n`];
  out.push('| bucket | positions | Maia\'s likeliest = the most played | the 3 most played: how many in Maia\'s top 3 | total variation distance | KL(people ‖ Maia), nats | Spearman over played moves | Maia mass on moves nobody played |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of [1400, 1800, 2200, 0]) {
    const g = ps.filter((x) => b === 0 || x.bucket === b);
    if (!g.length) continue;
    const sp = g.map((x) => x.spearman).filter(Number.isFinite);
    out.push(`| ${b || 'all'} | ${g.length} | ${f(mean(g.map((x) => (x.topMatch ? 1 : 0))) * 100, 0)}% | ${f(mean(g.map((x) => x.top3)), 2)} of 3 | ${f(mean(g.map((x) => x.tv)), 3)} | ${f(mean(g.map((x) => x.kl)), 3)} | ${f(mean(sp), 2)} | ${f(mean(g.map((x) => x.unseenMl)) * 100, 1)}% |`);
  }
  const pop = ps.reduce((a, x) => a + x.popular, 0);
  const missed = ps.reduce((a, x) => a + x.popularMissed, 0);
  const lik = ps.reduce((a, x) => a + x.maiaLikely, 0);
  const unp = ps.reduce((a, x) => a + x.maiaLikelyUnplayed, 0);
  out.push(`\nMoves people play 10% or more of the time: ${pop}; of those Maia gives under 2%: ${missed}. Moves Maia gives 20% or more: ${lik}; of those people play under 2% of the time: ${unp}.\n`);
  out.push('Calibration, over every legal move of the positions: Maia\'s Ml in bins against the share of games that played it.\n');
  out.push('| Maia says | moves | mean Ml | people play it |');
  out.push('| --- | --- | --- | --- |');
  bins.forEach((b, i) => {
    if (b.n) out.push(`| ${(EDGES[i]! * 100).toFixed(1)}–${Math.min(100, EDGES[i + 1]! * 100).toFixed(1)}% | ${b.n} | ${f(b.sumMl / b.n * 100, 2)}% | ${f(b.sumShare / b.n * 100, 2)}% |`);
  });
  return out.join('\n');
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { path, o } = opts(rest);
  if (cmd === 'sample') await sample(path, o.get('out')!, Number(o.get('per') ?? 2500));
  else if (cmd === 'maia') {
    const only = new Set<string>();
    for (const file of (o.get('only') ?? '').split(',').filter(Boolean)) for (const id of Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object)) only.add(id);
    await maia(o.get('sample')!, o.get('out')!, Number(o.get('before') ?? 7), o.has('mid'), only.size ? only : undefined);
  }
  else if (cmd === 'explorer') await explorer(o.get('sample')!, o.get('out')!, Number(o.get('bucket')), Number(o.get('n') ?? 150), process.env[o.get('token-env') ?? 'LICHESS_TOKEN'] ?? '');
  else if (cmd === 'policy') await policyCalibration(o.get('sample')!, o.get('out')!);
  else if (cmd === 'policy-report') console.log(policyReport(o.get('summary')!));
  else if (cmd === 'popularity') console.log(await popularity(o.get('sample')!, (o.get('rows') ?? '').split(',')));
  else if (cmd === 'move-rows') await moveRows(o.get('sample')!, (o.get('totals') ?? '').split(','), o.get('out')!, Number(o.get('bucket')), Number(o.get('min-games') ?? 200), process.env[o.get('token-env') ?? 'LICHESS_TOKEN'] ?? '');
  else if (cmd === 'after-moves') await afterMoves(o.get('sample')!, (o.get('rows') ?? '').split(','), o.get('out')!);
  else if (cmd === 'moves-report') console.log(movesReport(o.get('sample')!, (o.get('rows') ?? '').split(','), o.get('maia')!, Number(o.get('min-move-games') ?? 200)));
  else if (cmd === 'report') {
    const exs: Record<string, Ex> = {};
    for (const file of (o.get('explorer') ?? '').split(',').filter(Boolean)) Object.assign(exs, JSON.parse(readFileSync(file, 'utf8')));
    console.log(report(JSON.parse(readFileSync(o.get('sample')!, 'utf8')) as Pos[], JSON.parse(readFileSync(o.get('maia')!, 'utf8')) as Record<string, number>, exs, Number(o.get('min-games') ?? 200)));
  } else throw new Error('usage: sample | maia | explorer | report (see the file head)');
}

if (import.meta.main) await main();
