#!/usr/bin/env node
// The explorer panel's Practical values for chosen candidates at chosen positions (PLAN.md §5.211),
// a report that writes nothing to the repo: the app's own search (core/explorer/service.ts, with
// the config the app makes from its default settings), over Node's fetch, the app's limiter (16
// explorer requests a minute, a burst of 20), and a cache on disk outside the repo, so runs resume
// and candidates share subtrees.
//
//   node scripts/practical.ts --moves "1.Nc3 c5 2.d4 cxd4 3.Qxd4 Nc6" --candidates "Qh4,Qd1" \
//       --cache ~/.cache/repworks-practical --out practical.json [--depth 5]
//   node scripts/practical.ts --positions positions.json --cache <dir> --out practical.json
//       positions.json: [{ "moves": "1.Nc3 c5 2.d4", "candidates": ["cxd4"], "label": "..." },
//       { "fen": "<FEN>", "moves": "...", "candidates": "e4,d4" }]: `moves` from the start (or from
//       `fen`), with or without move numbers; `candidates` the side to move's (move numbers are
//       fine), none for the app's own rows (ChessDB's best within 5 win%, then the moves played in
//       2% of games or more). The Lichess token in LICHESS_TOKEN.
//   node scripts/practical.ts --report practical.json [--json] [--replies]
//       The table from a report file, asking nothing. --replies (here or with a run) adds each
//       candidate's replies of 2% or more with my move after each, labelled by how the search chose
//       it: switched (a practical pick over ChessDB's best), kept (compared, ChessDB's best stood),
//       only (no other move within the own margin), rare (ChessDB's best, not compared: the line is
//       under the compare floor), last (ChessDB's best, not compared: the line's last move).
//
// Depth: the panel's d1, d3, d5 (`--depth 5`, its default depth limit), d7 (`--depth 7`). The
// report file is resumed: a candidate already there at these settings is skipped (`--force` asks
// again); new ones are added. Flags for the explorer's settings (Explorer settings in the app):
// --speeds blitz,rapid,classical --ratings 1600,1800,2000,2200,2500 --recent --risk 0.05
// --reply-threshold 3 --min-games 50 --reach-floor 2 --own-margin 5 --own-candidates 3
// --prep-prior 50 --budget 60 (none by default: the app's 60 can stop a search short of the depth asked)
// --analyse (ask ChessDB to analyse unknown positions; off as in the app) --no-equal (no prepared
// score at equal ratings). Maia, off as in the app until it is switched on there: --maia
// [--maia-elo 1900] [--maia-model maia3-23m|maia3] (--maia-only: the panel's Maia preview, Maia's
// predictions in place of games) [--ort-node <folder with
// node_modules/onnxruntime-node>] [--threads 2]. Measurements (not in the app): --pick-last (my last
// move in a line a practical pick too), --compare-reach-min 3 (my moves compared on practical values
// on lines reached 3% of the time or more, in percent; the app's 10 by default: below it ChessDB's
// best stands; lines under --reach-floor are not searched at all).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { DEFAULT_PREFS } from '../src/core/explorer/prefs.ts';
import { CHESSDB_URL, EXPLORER_BASE, type Http } from '../src/core/explorer/providers.ts';
import { moveKey, PE_DEFAULTS, type MaiaMove, type RowResult } from '../src/core/explorer/search.ts';
import { createMaiaBatch, type MaiaBatch } from '../src/core/maia/batch.ts';
import { maiaEloFor } from '../src/core/maia/encode.ts';
import {
  createFileCache,
  createRunner,
  limiterFile,
  mergeReport,
  readReport,
  reportedSans,
  repliesText,
  reportTable,
  resolvePosition,
  settingsKey,
  settingsText,
  type PositionInput,
  type Settings,
} from './practical-lib.ts';

const say = (s: string) => process.stderr.write(s + '\n');
const args = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (!a.startsWith('--')) continue;
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) flags.set(a.slice(2), 'true');
  else flags.set(a.slice(2), args[++i]!);
}
const flag = (name: string, fallback: string): string => flags.get(name) ?? fallback;
const num = (name: string, fallback: number): number => {
  const v = Number(flag(name, String(fallback)));
  if (!Number.isFinite(v)) throw new Error(`--${name} takes a number`);
  return v;
};
const list = (name: string, fallback: readonly (string | number)[]): string[] => flag(name, fallback.join(',')).split(',').map((s) => s.trim()).filter(Boolean);

// --compare-reach-min in percent; the search's default (PE_DEFAULTS) leaves the settings as before, so
// earlier reports keep resuming.
function compareReachMinOf(): { compareReachMin?: number } {
  if (!flags.has('compare-reach-min')) return {};
  const pct = num('compare-reach-min', 10);
  if (pct < 0 || pct > 100) throw new Error('--compare-reach-min is a percentage, 0 to 100');
  const f = pct / 100;
  return Math.abs(f - PE_DEFAULTS.compareReachMin) < 1e-12 ? {} : { compareReachMin: f };
}

function settingsOf(): Settings {
  const depth = num('depth', 5);
  if (depth < 1 || depth % 2 !== 1) throw new Error('--depth is odd: 1, 3, 5, 7 (the panel’s d1, d3, d5, d7)');
  const ratings = list('ratings', DEFAULT_PREFS.ratings).map(Number);
  const maiaOn = flags.has('maia') || flags.has('maia-only');
  return {
    prefs: {
      ...DEFAULT_PREFS,
      speeds: list('speeds', DEFAULT_PREFS.speeds),
      ratings,
      recent: flags.has('recent'),
      riskAversion: num('risk', DEFAULT_PREFS.riskAversion),
      replyThreshold: num('reply-threshold', DEFAULT_PREFS.replyThreshold),
      minGames: num('min-games', DEFAULT_PREFS.minGames),
      reachFloor: num('reach-floor', DEFAULT_PREFS.reachFloor),
      ownMargin: num('own-margin', DEFAULT_PREFS.ownMargin),
      ownMaxCandidates: num('own-candidates', DEFAULT_PREFS.ownMaxCandidates),
      prepPriorGames: num('prep-prior', DEFAULT_PREFS.prepPriorGames),
      analyse: flags.has('analyse'),
      preparedEqual: !flags.has('no-equal'),
      practicalMaia: maiaOn,
    },
    depth,
    budget: flags.has('budget') ? num('budget', 60) : Infinity,
    ...(flags.has('pick-last') ? { pickLast: true } : {}),
    ...compareReachMinOf(),
    maia: maiaOn ? { on: true, elo: num('maia-elo', maiaEloFor(ratings)), model: flag('maia-model', 'maia3-23m') === 'maia3' ? 'maia3' : 'maia3-23m', ...(flags.has('maia-only') ? { only: true } : {}) } : null,
  };
}

/* ------------------------------------------------------------------ Maia */

type Feeds = Record<string, { data: Float32Array; dims: number[] }>;
interface Session {
  run(feeds: Feeds): Promise<Record<string, { data: unknown }>>;
}

/**
 * onnxruntime-web by default; `--ort-node <folder>`: onnxruntime-node from that folder, several
 * times faster, for the 23M model only (onnxruntime-node 1.31 crashed loading the first model).
 */
function onnxSession(path: string, threads: number, node: boolean): Promise<Session> {
  const nodeDir = node ? flags.get('ort-node') : undefined;
  if (nodeDir) {
    const ortNode = createRequire(join(resolve(nodeDir), 'x.js'))('onnxruntime-node');
    return ortNode.InferenceSession.create(path, { intraOpNumThreads: threads }).then((sess: { run(f: Record<string, unknown>): Promise<Record<string, { data: unknown }>> }) => ({
      run: (f: Feeds) => sess.run(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, new ortNode.Tensor('float32', v.data, v.dims)]))),
    }));
  }
  ort.env.wasm.numThreads = threads;
  return ort.InferenceSession.create(readFileSync(path)).then((sess) => ({
    run: (f: Feeds) => sess.run(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, new ort.Tensor('float32', v.data, v.dims)]))),
  }));
}

/** The app's Maia worker in Node: the same batching, model and history. */
function maiaAsk(model: 'maia3-23m' | 'maia3', threads: number): (fen: string, elo: number, before?: string[]) => Promise<MaiaMove[] | null> {
  const history = model === 'maia3-23m';
  const session = onnxSession(join(import.meta.dirname, '..', 'vendor', 'maia', history ? 'maia3-23m.onnx' : 'maia3_simplified.onnx'), threads, history);
  const batch: MaiaBatch = createMaiaBatch({
    history,
    run: async (tokens, elos, n) => {
      const s = await session;
      const out = await s.run({
        tokens: { data: tokens, dims: [n, 64, history ? 96 : 12] },
        elo_self: { data: elos, dims: [n] },
        elo_oppo: { data: Float32Array.from(elos), dims: [n] },
      });
      return { moves: out['logits_move']!.data as Float32Array, values: out['logits_value']!.data as Float32Array };
    },
    defer: (fn) => setImmediate(fn),
  });
  return (fen, elo, before) => {
    const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    return batch.ask(pos, elo, before).then(
      (a) => a.policy.map((m) => ({ san: m.san, prob: m.prob })),
      () => null,
    );
  };
}

/* ------------------------------------------------------------------ the run */

// As the explorer worker: an explorer or ChessDB answer not come in 30 s is given up (and retried by the providers).
const TIMEOUT_MS = 30_000;
const http: Http = (url, init) => {
  const timed = url.startsWith(EXPLORER_BASE) || url.startsWith(CHESSDB_URL);
  return fetch(url, timed ? { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) } : init) as unknown as ReturnType<Http>;
};

function inputs(): PositionInput[] {
  const file = flags.get('positions');
  if (file) {
    const j = JSON.parse(readFileSync(file, 'utf8')) as PositionInput[] | { positions: PositionInput[] };
    return Array.isArray(j) ? j : j.positions;
  }
  if (!flags.has('moves') && !flags.has('fen')) throw new Error('--positions <file.json>, or --moves "<SAN line>" (and/or --fen) with --candidates');
  return [{ ...(flags.has('moves') ? { moves: flags.get('moves')! } : {}), ...(flags.has('fen') ? { fen: flags.get('fen')! } : {}), ...(flags.has('candidates') ? { candidates: flags.get('candidates')! } : {}), ...(flags.has('label') ? { label: flags.get('label')! } : {}) }];
}

const rowLine = (label: string, san: string, r: RowResult): string => {
  if (r.state !== 'value') return `  ${label}  ${san}: ${r.state}${r.reason ? ` (${r.reason})` : ''}`;
  const v = r.value!.toFixed(1);
  return `  ${label}  ${san}: d${r.depth} ${v}%${r.final ? (r.complete ? ' (final, complete)' : r.stopped ? ` (final, stopped: ${r.stopped})` : ' (final)') : ''}`;
};

async function main(): Promise<void> {
  if (flags.has('report')) {
    const report = readReport(flags.get('report')!);
    if (flags.has('json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else process.stdout.write(reportTable(report.positions) + '\n' + (flags.has('replies') ? `\n${repliesText(report.positions)}\n` : ''));
    return;
  }
  const settings = settingsOf();
  const token = process.env['LICHESS_TOKEN'] ?? '';
  if (!token) say('No LICHESS_TOKEN: Lichess’s explorer needs one, and every row will say so.');
  const cacheDir = resolve(flag('cache', join(homedir(), '.cache', 'repworks-practical')));
  if (cacheDir.startsWith(resolve(import.meta.dirname, '..') + '/')) throw new Error('--cache is a folder outside the repo');
  const out = flags.get('out');
  const cache = createFileCache(cacheDir, () => Date.now());
  say(`Settings: ${settingsText(settings)}`);
  say(`Cache: ${cacheDir} (${cache.size()} answers)`);
  const maia = settings.maia ? maiaAsk(settings.maia.model, num('threads', 2)) : undefined;
  const runner = createRunner({
    http,
    cache,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    token,
    settings,
    ...(maia ? { maia } : {}),
    limiter: limiterFile(cacheDir),
    progress: (e) => {
      if (e.kind === 'row') say(rowLine(e.label, e.san, e.result));
      else if (e.kind === 'paused') say(`  Lichess asked to slow down (429): waiting ${Math.round(e.ms / 1000)} s`);
      else say(`  ${e.text}`);
    },
  });

  let report = out ? readReport(out) : { positions: [] };
  const key = settingsKey(settings);
  const positions = inputs();
  const done = [];
  // A line every half minute while a position runs: the requests so far.
  let running = '';
  const t0 = Date.now();
  const ticker = setInterval(() => {
    if (!running) return;
    void runner.stats().then((s) => say(`  … ${running}: ${Math.round((Date.now() - t0) / 1000)} s, ${s.explorerRequests ?? 0} explorer and ${s.chessdbRequests ?? 0} ChessDB requests so far`));
  }, 30_000);
  try {
    for (const [i, input] of positions.entries()) {
      const p = resolvePosition(input);
      const have = flags.has('force') ? new Set<string>() : reportedSans(report, p.fen, key);
      if (p.candidates.length) {
        const left = p.candidates.filter((c) => !have.has(moveKey(c)));
        if (!left.length) {
          say(`[${i + 1}/${positions.length}] ${p.label}: already in the report`);
          continue;
        }
        p.candidates = left;
      } else if (have.size) {
        say(`[${i + 1}/${positions.length}] ${p.label}: already in the report (the app's rows)`);
        continue;
      }
      say(`[${i + 1}/${positions.length}] ${p.label}: ${p.candidates.length ? p.candidates.join(', ') : 'the app’s rows'}`);
      running = p.label;
      const r = await runner.evaluate(p);
      running = '';
      say(`  done in ${r.seconds} s: ${r.requests.explorer} explorer and ${r.requests.chessdb} ChessDB requests${r.requests.explorer429 ? `, ${r.requests.explorer429} refused (429)` : ''}`);
      done.push(r);
      report = mergeReport(report, r);
      if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    }
  } finally {
    clearInterval(ticker);
  }
  if (flags.has('json')) process.stdout.write(JSON.stringify(done, null, 2) + '\n');
  else {
    const shown = done.length ? done : report.positions.filter((p) => p.key === key);
    process.stdout.write(`${settingsText(settings)}\n\n${reportTable(shown)}\n${flags.has('replies') ? `\n${repliesText(shown)}\n` : ''}`);
  }
  if (out && existsSync(out)) say(`Report: ${out}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    say(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
