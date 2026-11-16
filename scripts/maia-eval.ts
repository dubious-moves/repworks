#!/usr/bin/env node
// Does a Maia model predict human moves better, and how much does the history do (PLAN.md §5.188,
// §5.190)? A reusable measurement on a Lichess dump:
//
//   node scripts/maia-eval.ts <dump.pgn.zst | dump.pgn | -> [options]
//
// The dump: database.lichess.org/standard/lichess_db_standard_rated_<YYYY-MM>.pgn.zst, or a
// part of it (`curl -r 0-250000000 -o part.pgn.zst <url>` is about 87k rapid and classical games;
// a part cut off mid-frame is fine). It is decoded here with Node's zstd after dropping its
// leading skippable frame; if that doesn't work on a Node, decode with Python and pipe it in:
//   python -I -c "import sys,zstandard as z; r=z.ZstdDecompressor().stream_reader(open(sys.argv[1],'rb'),read_across_frames=True); [sys.stdout.buffer.write(c) for c in iter(lambda: r.read(1<<20), b'')]" part.pgn.zst | node scripts/maia-eval.ts -
//
// The sample: positions of the middlegame (moves 11-35, 14-28 pieces, the mover's clock at least
// 30 s as the position arises) from games of the chosen speeds, one position per game side, in
// four bands of the mover's rating (1100, 1500, 1900, 2300, each +-100). The score of a model on
// a position: the probability it gives the move actually played over all legal moves (negative log
// likelihood, top-1, top-3), with the mover's and the opponent's real ratings as the model's
// inputs, unless a condition fixes the rating. Differences between conditions come with a 95%
// interval from a paired bootstrap that resamples whole games.
//
// Options:
//   --speeds rapid,classical   the games' speeds (blitz for a second time control)
//   --per-band 1969            positions a band takes (7,876 in all by default)
//   --bands 1100,1500,1900,2300  --width 100  --seed 1  --max-games N
//   --moves 11,35  --pieces 14,28  --min-clock 30   the sample's criteria (the defaults are the middlegame's; `--pieces 4,12 --moves 25,90` samples endings)
//   --conditions a,b,...       which to run (default: all; `--list` names them)
//   --threads 4  --batch 32    onnxruntime-web's threads and batch size
//   --sample file.json         the sample, read if it exists (else drawn and written there)
//   --out file.json            every position's score by condition; kept conditions are not run again
//   --boot 2000                bootstrap resamples
//   --against first,m23-0,…    the conditions the differences are against (those that were run; default first, m23-0, m23-0-fixed)
//   --memo-stats [plies]       no model: how much the history grows Maia's memo over the first plies of the dump's games (default 20; --max-games, default 100000)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { MAIA_MIN, MAIA_TOP } from '../src/core/endgames/endgames.ts';
import { clampElo, legalLogits, MAIA_MOVES, maiaHistoryTokens, maiaTokens } from '../src/core/maia/encode.ts';
import { candidatesFrom, type Criteria, dumpLines, gamesOf, memoStats, MIDDLEGAME, pairedBootstrap, scoreMoves, takeSample, type Interval, type Scored } from './maia-eval-lib.ts';
import type { EvalPosition } from './maia-eval-types.ts';

const VENDOR = join(import.meta.dirname, '..', 'vendor', 'maia');

/** One way to ask a model: which one, how many positions before the asked one it reads, at which rating. */
interface Condition {
  id: string;
  label: string;
  model: 'first' | '23m';
  /** Positions before the asked one that are sent (0: the position alone, repeated). */
  before: number;
  /** The rating asked at: the mover's real one, or a fixed one for both inputs. */
  elo: 'real' | number;
}

export const CONDITIONS: Condition[] = [
  { id: 'first', label: 'first model, position alone (the app\'s default)', model: 'first', before: 0, elo: 'real' },
  { id: 'm23-0', label: '23M, position alone (what the app sent before §5.190)', model: '23m', before: 0, elo: 'real' },
  { id: 'm23-1', label: '23M, 1 position before', model: '23m', before: 1, elo: 'real' },
  { id: 'm23-2', label: '23M, 2 positions before (the opponent\'s last move and one of the mover\'s own)', model: '23m', before: 2, elo: 'real' },
  { id: 'm23-3', label: '23M, 3 positions before', model: '23m', before: 3, elo: 'real' },
  { id: 'm23-7', label: '23M, 7 positions before', model: '23m', before: 7, elo: 'real' },
  { id: 'first-fixed', label: 'first model, position alone, fixed rating 1500', model: 'first', before: 0, elo: 1500 },
  { id: 'm23-0-fixed', label: '23M, position alone, fixed rating 1500', model: '23m', before: 0, elo: 1500 },
  { id: 'm23-7-fixed', label: '23M, 7 positions before, fixed rating 1500', model: '23m', before: 7, elo: 1500 },
];

/** What one condition scored on each position of the sample, as parallel arrays. */
export interface Column {
  nll: number[];
  top1: number[];
  top3: number[];
  topProb: number[];
  entropy: number[];
  p: number[];
  /** The endgames' defence's candidates: of the likeliest `MAIA_TOP` moves, those of `MAIA_MIN` or more. Absent in older results. */
  cands?: number[];
}

export interface Results {
  /** The sample's size and what it was drawn from, for the record. */
  n: number;
  columns: Record<string, Column>;
}

function args(argv: string[]): { path: string; opt: Map<string, string> } {
  const opt = new Map<string, string>();
  let path = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt.set(a.slice(2), '');
      else (opt.set(a.slice(2), next), i++);
    } else path = a;
  }
  return { path, opt };
}

async function sessionOf(file: string): Promise<ort.InferenceSession> {
  return ort.InferenceSession.create(readFileSync(join(VENDOR, file)));
}

/** Runs one condition over the sample, in batches; each position's score. */
async function runCondition(c: Condition, session: ort.InferenceSession, sample: readonly EvalPosition[], positions: readonly Chess[], batch: number, started: number): Promise<Column> {
  const col: Column = { nll: [], top1: [], top3: [], topProb: [], entropy: [], p: [], cands: [] };
  const width = c.model === '23m' ? 64 * 96 : 64 * 12;
  const shape = c.model === '23m' ? [0, 64, 96] : [0, 64, 12];
  for (let at = 0; at < sample.length; at += batch) {
    const chunk = sample.slice(at, at + batch);
    const tokens = new Float32Array(chunk.length * width);
    const self = new Float32Array(chunk.length);
    const oppo = new Float32Array(chunk.length);
    chunk.forEach((p, i) => {
      tokens.set(c.model === '23m' ? maiaHistoryTokens([...p.before.slice(p.before.length - Math.min(c.before, p.before.length)), p.fen]) : maiaTokens(p.fen), i * width);
      self[i] = c.elo === 'real' ? clampElo(p.elo) : c.elo;
      oppo[i] = c.elo === 'real' ? clampElo(p.oppo) : c.elo;
    });
    const out = await session.run({
      tokens: new ort.Tensor('float32', tokens, [chunk.length, shape[1]!, shape[2]!]),
      elo_self: new ort.Tensor('float32', self, [chunk.length]),
      elo_oppo: new ort.Tensor('float32', oppo, [chunk.length]),
    });
    const logits = out['logits_move']!.data as Float32Array;
    chunk.forEach((p, i) => {
      const s = scoreMoves(legalLogits(positions[at + i]!, logits, i * MAIA_MOVES), p.played, MAIA_TOP, MAIA_MIN);
      if (!s) throw new Error(`the move played isn't legal in ${p.fen}: ${p.played} (${p.game})`);
      col.nll.push(s.nll);
      col.top1.push(s.top1 ? 1 : 0);
      col.top3.push(s.top3 ? 1 : 0);
      col.topProb.push(s.topProb);
      col.entropy.push(s.entropy);
      col.p.push(s.p);
      col.cands!.push(s.cands);
    });
    if ((at / batch) % 20 === 0) process.stderr.write(`  ${c.id}: ${Math.min(at + batch, sample.length)}/${sample.length} (${Math.round((Date.now() - started) / 1000)} s)\n`);
  }
  return col;
}

const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const sign = (x: number, d = 3) => (x > 0 ? '+' : '') + f(x, d);
const ci = (i: Interval, d = 3, scale = 1) => `${sign(i.mean * scale, d)} (${sign(i.lo * scale, d)}..${sign(i.hi * scale, d)})`;

/** The report: levels by band, then paired differences against two references. */
export function report(sample: readonly EvalPosition[], results: Results, ids: readonly string[], boot: number, bands: readonly number[], references: readonly string[] = ['first', 'm23-0', 'm23-0-fixed']): string {
  const groups = new Map<string, number>();
  const gid = sample.map((p) => groups.get(p.game) ?? (groups.set(p.game, groups.size), groups.size - 1));
  const all = sample.map((_, i) => i);
  const rows = (band?: number) => (band === undefined ? all : all.filter((i) => sample[i]!.band === band));
  const mean = (xs: readonly number[], idx: readonly number[]) => idx.reduce((a, i) => a + xs[i]!, 0) / idx.length;
  const label = (id: string) => CONDITIONS.find((c) => c.id === id)?.label ?? id;
  const out: string[] = [];
  const bandLabel = (b?: number) => (b === undefined ? 'all' : String(b));
  out.push(`${sample.length} positions, ${new Set(sample.map((p) => p.game)).size} games; per band: ${bands.map((b) => `${b}: ${rows(b).length}`).join(', ')}\n`);
  out.push('### Levels (negative log likelihood of the move played; top-1 and top-3 hit rates)\n');
  out.push(`| condition | band | NLL | top-1 | top-3 | mean top prob | mean entropy | mean candidates (of the top ${MAIA_TOP}, ${MAIA_MIN * 100}% or more) |`);
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const id of ids) {
    const c = results.columns[id]!;
    for (const b of [undefined, ...bands]) {
      const idx = rows(b);
      out.push(`| ${label(id)} | ${bandLabel(b)} | ${f(mean(c.nll, idx))} | ${f(mean(c.top1, idx) * 100, 1)}% | ${f(mean(c.top3, idx) * 100, 1)}% | ${f(mean(c.topProb, idx))} | ${f(mean(c.entropy, idx))} | ${c.cands ? f(mean(c.cands, idx), 2) : 'n/a'} |`);
    }
  }
  const against = (ref: string) => {
    if (!results.columns[ref]) return;
    out.push(`\n### Against: ${label(ref)} (paired, 95% interval from a bootstrap over games; NLL, top-1 and top-3 in points)\n`);
    out.push('| condition | band | ΔNLL | Δtop-1 (pts) | Δtop-3 (pts) |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const id of ids) {
      if (id === ref) continue;
      const c = results.columns[id]!;
      const r = results.columns[ref]!;
      for (const b of [undefined, ...bands]) {
        const idx = rows(b);
        out.push(`| ${label(id)} | ${bandLabel(b)} | ${ci(pairedBootstrap(c.nll, r.nll, idx, gid, boot, 7))} | ${ci(pairedBootstrap(c.top1, r.top1, idx, gid, boot, 8), 2, 100)} | ${ci(pairedBootstrap(c.top3, r.top3, idx, gid, boot, 9), 2, 100)} |`);
      }
    }
  };
  for (const ref of references) against(ref);
  return out.join('\n');
}

/** The sample's criteria: the middlegame's, as the options change them. */
function criteria(opt: Map<string, string>): Criteria {
  const pair = (k: string, d: [number, number]): [number, number] => {
    const v = opt.get(k)?.split(',').map(Number);
    return v && v.length === 2 && v.every(Number.isFinite) ? [v[0]!, v[1]!] : d;
  };
  return { moves: pair('moves', MIDDLEGAME.moves), pieces: pair('pieces', MIDDLEGAME.pieces), minClock: Number(opt.get('min-clock') ?? MIDDLEGAME.minClock) };
}

async function main(): Promise<void> {
  const { path, opt } = args(process.argv.slice(2));
  if (opt.has('list')) {
    for (const c of CONDITIONS) console.log(`${c.id}\t${c.label}`);
    return;
  }
  if (opt.has('memo-stats')) {
    const plies = Number(opt.get('memo-stats') || 20);
    const m = await memoStats(gamesOf(dumpLines(path)), { plies, depths: [1, 2, 3, 7], maxGames: Number(opt.get('max-games') ?? 100000) });
    console.log(`${m.games} games, the first ${plies} plies of each: ${m.asks} positions asked, ${m.positions} distinct`);
    console.log('| positions before in the key | distinct keys | keys per distinct position | memo hits if every ask is remembered |\n| --- | --- | --- | --- |');
    console.log(`| 0 (the first model) | ${m.positions} | 1.00 | ${((1 - m.positions / m.asks) * 100).toFixed(1)}% |`);
    for (const [k, n] of Object.entries(m.keys)) console.log(`| ${k} | ${n} | ${(n / m.positions).toFixed(2)} | ${((1 - n / m.asks) * 100).toFixed(1)}% |`);
    return;
  }
  if (!path && !opt.get('sample')) throw new Error('usage: node scripts/maia-eval.ts <dump.pgn.zst | dump.pgn | -> [options]  (see the file head)');
  const bands = (opt.get('bands') ?? '1100,1500,1900,2300').split(',').map(Number);
  const speeds = (opt.get('speeds') ?? 'rapid,classical').split(',');
  const perBand = Number(opt.get('per-band') ?? 1969);
  const seed = Number(opt.get('seed') ?? 1);
  const boot = Number(opt.get('boot') ?? 2000);
  const sampleFile = opt.get('sample');
  const outFile = opt.get('out');
  const ids = opt.get('conditions')?.split(',') ?? CONDITIONS.map((c) => c.id);
  for (const id of ids) if (!CONDITIONS.some((c) => c.id === id)) throw new Error(`no condition ${id}; --list names them`);

  let sample: EvalPosition[];
  if (sampleFile && existsSync(sampleFile)) sample = JSON.parse(readFileSync(sampleFile, 'utf8')) as EvalPosition[];
  else {
    const t = Date.now();
    const { all, read, used } = await candidatesFrom(gamesOf(dumpLines(path)), {
      speeds,
      bands,
      width: Number(opt.get('width') ?? 100),
      criteria: criteria(opt),
      seed,
      ...(opt.has('max-games') ? { maxGames: Number(opt.get('max-games')) } : {}),
    });
    sample = takeSample(all, bands, perBand, seed);
    process.stderr.write(`read ${read} games, ${used} with a middlegame position in a band, ${all.length} positions, sampled ${sample.length} (${Math.round((Date.now() - t) / 1000)} s)\n`);
    if (sampleFile) writeFileSync(sampleFile, JSON.stringify(sample));
  }
  if (!sample.length) throw new Error('no positions sampled');

  const results: Results = outFile && existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf8')) as Results) : { n: sample.length, columns: {} };
  if (results.n !== sample.length) throw new Error(`${outFile} holds scores for ${results.n} positions, the sample has ${sample.length}: another sample`);
  const positions = sample.map((p) => {
    const setup = parseFen(p.fen);
    if (setup.isErr) throw new Error(`not a FEN: ${p.fen}`);
    return Chess.fromSetup(setup.value).unwrap();
  });
  ort.env.wasm.numThreads = Number(opt.get('threads') ?? 4);
  const batch = Number(opt.get('batch') ?? 32);
  const sessions: Partial<Record<Condition['model'], ort.InferenceSession>> = {};
  for (const id of ids) {
    if (results.columns[id]) continue;
    const c = CONDITIONS.find((x) => x.id === id)!;
    sessions[c.model] ??= await sessionOf(c.model === '23m' ? 'maia3-23m.onnx' : 'maia3_simplified.onnx');
    const t = Date.now();
    results.columns[id] = await runCondition(c, sessions[c.model]!, sample, positions, batch, t);
    process.stderr.write(`${id}: ${sample.length} positions in ${Math.round((Date.now() - t) / 1000)} s\n`);
    if (outFile) writeFileSync(outFile, JSON.stringify(results));
  }
  console.log(report(sample, results, ids.filter((id) => results.columns[id]), boot, bands, opt.get('against')?.split(',')));
}

if (import.meta.main) await main();
