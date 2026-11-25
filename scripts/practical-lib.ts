// The Practical report's logic (PLAN.md §5.211), apart from the command line so tests drive it with
// fake providers. Every number is the app's: the explorer worker's own service
// (core/explorer/service.ts) runs the search, with the config the app makes from the explorer's
// settings (core/explorer/prefs.ts), so the rows, the rounds, the options, the filter, the limiter
// and the providers are the panel's. What differs is said where it is chosen: the budget (none
// unless asked), the depth (`maxPly` from `--depth`), Maia's preview (off: it never changes a
// value) and ChessDB's root answer (the search's cached one, not the panel's re-asked one).
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { equalPrepared, equalScore, followPrior, INFLOW, isEqual, moverRating, type EqualBefore } from '../src/core/explorer/equal.ts';
import type { LimiterSnapshot } from '../src/core/explorer/limiter.ts';
import { configOf, DEFAULT_PREFS, type ExplorerPrefs } from '../src/core/explorer/prefs.ts';
import type { CompactExplorer, ExplorerCache, Http, ProviderStats } from '../src/core/explorer/providers.ts';
import { autoRows } from '../src/core/explorer/rows.ts';
import { expectedScore, fenKey, moveKey, type ChessdbAnswer, type MaiaMove, type OwnPick, type RowResult, type Side, type Split } from '../src/core/explorer/search.ts';
import { createExplorerService, type ExplorerConfig, type FromWorker } from '../src/core/explorer/service.ts';
import { buildTable, type TableRow } from '../src/core/explorer/table.ts';
import { MAIA_BEFORE } from '../src/core/maia/history.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* ------------------------------------------------------------------ input */

/** One position to report on: a line from the start (or `fen`), and the candidates (none: the app's rows). */
export interface PositionInput {
  /** SAN from the start, or from `fen`: `"1.Nc3 c5 2.d4"` or `["Nc3", "c5", "d4"]`. */
  moves?: string | string[];
  fen?: string;
  /** The side to move's candidates; move numbers are fine (`"9.O-O-O"`). Empty or missing: the app's rows. */
  candidates?: string | string[];
  /** A name for the table; the line by default. */
  label?: string;
}

/** A position's SANs: move numbers, results and annotations dropped. */
export function sansOf(moves: string | readonly string[] | undefined): string[] {
  const list = typeof moves === 'string' ? moves.split(/\s+/) : [...(moves ?? [])];
  return list
    .map((t) => t.trim().replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, ''))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\d+\.*$/.test(t));
}

export interface Resolved {
  label: string;
  /** The position's FEN as chessops writes it (the app's). */
  fen: string;
  /** The positions before it along the line, oldest first, at most MAIA_BEFORE (the 23M Maia's). */
  before: string[];
  /** The position one move earlier and that move, for the equal-ratings score's inflow case. */
  back?: { fen: string; san: string };
  turn: Side;
  /** As given, cleaned; empty for the app's rows. */
  candidates: string[];
  /** The line as SAN with move numbers, for labels. */
  line: string;
}

/** Plays a position's line, checking every move; throws on an illegal one. */
export function resolvePosition(p: PositionInput): Resolved {
  const setup = parseFen(p.fen ?? START_FEN);
  if (setup.isErr) throw new Error(`not a FEN: ${p.fen}`);
  const pos = Chess.fromSetup(setup.value).unwrap();
  const fens = [makeFen(pos.toSetup())];
  const sans = sansOf(p.moves);
  const words: string[] = [];
  let back: Resolved['back'];
  for (const san of sans) {
    const move = parseSan(pos, san);
    if (!move) throw new Error(`not a legal move: ${san} (after ${words.join(' ') || 'the start'})`);
    const before = makeFen(pos.toSetup());
    const num = pos.turn === 'white' ? `${pos.fullmoves}.` : words.length ? '' : `${pos.fullmoves}...`;
    const clean = makeSanAndPlay(pos, move);
    words.push(num ? `${num}${clean}` : clean);
    back = { fen: before, san: clean };
    fens.push(makeFen(pos.toSetup()));
  }
  const fen = fens[fens.length - 1]!;
  const turn: Side = pos.turn === 'white' ? 'w' : 'b';
  const candidates = sansOf(p.candidates === undefined ? [] : typeof p.candidates === 'string' ? p.candidates.split(/[\s,]+/) : p.candidates);
  for (const c of candidates) if (!parseSan(pos, c)) throw new Error(`not a legal move at ${words.join(' ') || 'the position'}: ${c}`);
  const line = words.join(' ');
  return { label: p.label ?? (line || fen), fen, before: fens.slice(0, -1).slice(-MAIA_BEFORE), ...(back ? { back } : {}), turn, candidates, line };
}

/* ------------------------------------------------------------------ settings */

/** What the report computes with: the explorer's settings (the app's defaults, overridden), the depth, the budget, Maia. */
export interface Settings {
  prefs: ExplorerPrefs;
  /** The search's depth below the row (1, 3, 5, 7: the app's d1, d3, d5); the app's maxPly is depth + 1. */
  depth: number;
  /** Uncached explorer requests per position; Infinity: none (the app has 60). */
  budget: number;
  /** Maia in the search (the app's when Maia is switched on: off by default there). */
  maia: { on: boolean; elo: number; model: 'maia3-23m' | 'maia3'; only?: boolean } | null;
  /** My last move in a line a practical pick too (search.ts's `pickLast`, a measurement). */
  pickLast?: boolean;
  /**
   * search.ts's `compareReachMin` (a fraction) when not its default: my moves are compared on
   * practical values only on lines reached this often; below it ChessDB's best stands.
   */
  compareReachMin?: number;
}

/** The worker's config for these settings: the app's `configOf`, with the depth, the budget and no preview. */
export function configFor(s: Settings, token: string, now: Date): ExplorerConfig {
  const c = configOf(s.prefs, token, now, s.maia?.on ? s.maia.elo : undefined);
  // No preview: it is a second search with Maia in place of games, shown instead of the values only
  // when the owner switches to it; the values are the Lichess search's either way.
  const { maiaPreview: _preview, ...rest } = c;
  // `only`: the preview's values instead (Maia's predictions in place of games, no prepared split),
  // what the panel shows when its Prac header is switched to Maia.
  const only = s.maia?.on && s.maia.only ? { maiaOnly: true, prep: false } : {};
  return {
    ...rest,
    budget: s.budget,
    options: { ...c.options, maxPly: s.depth + 1, ...only, ...(s.pickLast ? { pickLast: true } : {}), ...(s.compareReachMin !== undefined ? { compareReachMin: s.compareReachMin } : {}) },
  };
}

/** The settings as a line of text for the report: what was used. */
export function settingsText(s: Settings): string {
  const p = s.prefs;
  const parts = [
    `depth ${s.depth}`,
    `filter ${p.speeds.join('/')} ${p.ratings.join(',')}${p.recent ? ' past 6 months' : ''}`,
    `risk aversion ${p.riskAversion}`,
    `reply threshold ${p.replyThreshold}%`,
    `min games ${p.minGames}`,
    `reach floor ${p.reachFloor}%`,
    `own margin ${p.ownMargin}`,
    `own candidates ${p.ownMaxCandidates}`,
    `prepared prior ${p.prepPriorGames} games`,
    `budget ${Number.isFinite(s.budget) ? s.budget : 'none'}`,
    s.maia?.on ? `Maia ${s.maia.model} at ${s.maia.elo}${s.maia.only ? ' alone (the preview)' : ''}` : 'Maia off',
    p.analyse ? 'ChessDB asked to analyse' : 'no ChessDB analysis requests',
    ...(s.pickLast ? ['last own move picked'] : []),
    ...(s.compareReachMin !== undefined ? [`own moves compared on lines reached ${+(s.compareReachMin * 100).toFixed(2)}%+`] : []),
  ];
  return parts.join(' · ');
}

/** What makes two runs' values comparable: everything but the budget (which only decides how deep a run gets). */
export function settingsKey(s: Settings): string {
  const p = s.prefs;
  return JSON.stringify({
    depth: s.depth,
    speeds: [...p.speeds].sort(),
    ratings: [...p.ratings].sort((a, b) => a - b),
    recent: p.recent,
    riskAversion: p.riskAversion,
    replyThreshold: p.replyThreshold,
    minGames: p.minGames,
    reachFloor: p.reachFloor,
    ownMargin: p.ownMargin,
    ownMaxCandidates: p.ownMaxCandidates,
    prepPriorGames: p.prepPriorGames,
    maia: s.maia?.on ? `${s.maia.model}@${s.maia.elo}${s.maia.only ? ' only' : ''}` : null,
    ...(s.pickLast ? { pickLast: true } : {}),
    ...(s.compareReachMin !== undefined ? { compareReachMin: s.compareReachMin } : {}),
  });
}

export const DEFAULT_SETTINGS: Settings = { prefs: { ...DEFAULT_PREFS }, depth: 5, budget: Infinity, maia: null };

/* ------------------------------------------------------------------ the cache on disk */

/**
 * The providers' cache in a folder, so runs resume and candidates share subtrees: each store an
 * append-only file of `{k, t, v}` lines, read once at the start; the latest line for a key wins.
 * TTLs as the app's (the providers pass them), read against each record's time.
 */
export function createFileCache(dir: string, now: () => number): ExplorerCache & { size(): number } {
  mkdirSync(dir, { recursive: true });
  const stores = { explorer: new Map<string, { t: number; v: unknown }>(), chessdb: new Map<string, { t: number; v: unknown }>() };
  for (const store of ['explorer', 'chessdb'] as const) {
    const path = join(dir, `${store}.jsonl`);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const r = JSON.parse(line) as { k: string; t: number; v: unknown };
        stores[store].set(r.k, { t: r.t, v: r.v });
      } catch {
        // a line cut short by a stopped run: skipped
      }
    }
  }
  return {
    get: (store, key, ttl) => {
      const rec = stores[store].get(key);
      return Promise.resolve(rec && now() - rec.t < ttl ? rec.v : undefined);
    },
    put: (store, key, v) => {
      const t = now();
      stores[store].set(key, { t, v });
      appendFileSync(join(dir, `${store}.jsonl`), JSON.stringify({ k: key, t, v }) + '\n');
      return Promise.resolve();
    },
    count: () => Promise.resolve({ explorer: stores.explorer.size, chessdb: stores.chessdb.size }),
    size: () => stores.explorer.size + stores.chessdb.size,
  };
}

/** The Lichess bucket kept in the cache folder, so a run started right after another doesn't start full. */
export function limiterFile(dir: string): { read(): LimiterSnapshot | null; write(s: LimiterSnapshot): void } {
  const path = join(dir, 'limiter.json');
  return {
    read: () => {
      try {
        return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as LimiterSnapshot) : null;
      } catch {
        return null;
      }
    },
    write: (s) => writeFileSync(path, JSON.stringify(s)),
  };
}

/* ------------------------------------------------------------------ the run */

export interface CandidateResult {
  san: string;
  state: RowResult['state'];
  reason?: string;
  /** The Practical value: the side to move's expected score in percent, as the column shows it. */
  value?: number;
  /** With plain means at the opponent's nodes (the value with risk aversion 0). */
  mean?: number;
  /** ChessDB's eval of the row, as win% for the side to move. */
  engine?: number;
  depth?: number;
  complete?: boolean;
  /** Why the rounds stopped before the depth asked: 'budget', 'error', or none. */
  stopped?: string;
  /** The prepared split and its score for the side to move (the Score column's Prepared bar). */
  prep?: Split;
  prepScore?: number;
  /** The same at equal ratings (§5.126, the app's default for that bar), when the games allow it. */
  prepEqualScore?: number;
  /** How much the prepared split rests on the Practical value rather than games (0 to 1). */
  prior?: number;
  /** The row's games and share at the position, under the filter. */
  games: number;
  share: number;
  /** ChessDB's eval of the move in centipawns from White's side, as the Eval column. */
  cdb?: number;
  /** The main replies: share, value, and the Practical choice after each, with how it was chosen. */
  replies?: { san: string; share: number; v: number; move: string | null; pick?: OwnPick }[];
  positions?: number;
  frontier?: number;
}

export interface PositionResult {
  label: string;
  line: string;
  fen: string;
  settings: string;
  key: string;
  candidates: CandidateResult[];
  /** The candidates were the app's own rows (none were given). */
  autoRows: boolean;
  /** Requests made for this position (the providers' counters): explorer, ChessDB, 429s. */
  requests: { explorer: number; chessdb: number; explorer429: number; chessdb429: number };
  seconds: number;
  at: string;
}

export interface RunnerOptions {
  http: Http;
  cache: ExplorerCache;
  now(): number;
  sleep(ms: number): Promise<void>;
  token: string;
  settings: Settings;
  maia?(fen: string, elo: number, before?: string[]): Promise<MaiaMove[] | null>;
  limiter?: { read(): LimiterSnapshot | null; write(s: LimiterSnapshot): void };
  /** A row's value as it comes (each round), and the service's other news (pauses). */
  progress?(e: { kind: 'row'; label: string; san: string; result: RowResult } | { kind: 'paused'; ms: number } | { kind: 'note'; text: string }): void;
}

export interface Runner {
  evaluate(p: Resolved): Promise<PositionResult>;
  stats(): Promise<ProviderStats>;
}

/**
 * The app's explorer service, driven as the panel drives it: the position's games and ChessDB's
 * moves, the rows (given, or the app's own), the search's updates until every row is final, and
 * the games after each row for the prepared score at equal ratings.
 */
export function createRunner(o: RunnerOptions): Runner {
  let nextId = 1;
  const answers = new Map<number, (m: FromWorker) => void>();
  let onUpdate: ((m: Extract<FromWorker, { type: 'update' }>) => void) | null = null;
  let onStats: ((m: Extract<FromWorker, { type: 'stats' }>) => void) | null = null;
  const service = createExplorerService({
    http: o.http,
    cache: o.cache,
    now: o.now,
    sleep: o.sleep,
    post: (m) => {
      if (m.type === 'update') onUpdate?.(m);
      else if (m.type === 'stats') onStats?.(m);
      else if (m.type === 'paused') o.progress?.({ kind: 'paused', ms: m.ms });
      else if (m.type === 'limiter') o.limiter?.write(m.snapshot);
      else if ('id' in m) answers.get(m.id)?.(m);
    },
    ...(o.maia ? { maia: o.maia } : {}),
  });
  const config = configFor(o.settings, o.token, new Date(o.now()));
  service.handle({ type: 'config', config });
  const saved = o.limiter?.read();
  if (saved) service.handle({ type: 'restore', limiter: saved });

  const stats = () =>
    new Promise<ProviderStats>((resolve) => {
      onStats = (m) => {
        onStats = null;
        resolve(m.stats);
      };
      service.handle({ type: 'stats' });
    });

  /** One answer to a message with an id (games, scores, child games). */
  function ask<T extends FromWorker>(send: (id: number) => void): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve) => {
      answers.set(id, (m) => {
        answers.delete(id);
        resolve(m as T);
      });
      send(id);
    });
  }
  const games = (fen: string): Promise<CompactExplorer> =>
    ask<Extract<FromWorker, { type: 'games' }>>((id) => service.handle({ type: 'counts', id, fen })).then((m) => {
      if ('error' in m) throw new Error(m.error.message);
      return m.games;
    });
  const childGames = (fen: string): Promise<CompactExplorer | undefined> =>
    ask<Extract<FromWorker, { type: 'childGames' }>>((id) => service.handle({ type: 'childGames', id, tab: 'lichess', fen })).then((m) => ('error' in m ? undefined : m.games));
  const evals = (fen: string): Promise<ChessdbAnswer | undefined> =>
    ask<Extract<FromWorker, { type: 'scores' }>>((id) => service.handle({ type: 'scores', id, fen })).then((m) => ('error' in m ? undefined : m.evals));

  let gen = 0;
  async function evaluate(p: Resolved): Promise<PositionResult> {
    const started = o.now();
    const before = await stats();
    const [here, cdb] = await Promise.all([games(p.fen), evals(p.fen)]);
    const table = buildTable({ turn: p.turn, games: here, ...(cdb ? { evals: cdb } : {}), sort: 'eval', side: p.turn });
    const rowOf = new Map(table.rows.map((r) => [moveKey(r.san), r] as const));
    const s = o.settings.prefs;
    const autoRowsUsed = !p.candidates.length;
    // The app's rows (Explorer.tsx): the engine's near-best, then the moves played in 2% of games.
    const rows = autoRowsUsed ? autoRows(table.rows, p.turn, new Set(), { margin: s.ownMargin, maxCandidates: s.ownMaxCandidates, minShare: 0.02 }) : p.candidates.map((c) => rowOf.get(moveKey(c))?.san ?? c);
    const shares: Record<string, number> = {};
    for (const san of rows) shares[san] = rowOf.get(moveKey(san))?.share ?? 0;

    // The search: one root, its rows in lockstep rounds, until every row's value is final.
    const results = new Map<string, RowResult>();
    const myGen = ++gen;
    const done = new Promise<void>((resolve) => {
      if (!rows.length) return resolve();
      onUpdate = (m) => {
        if (m.gen !== myGen || m.pass) return;
        results.set(m.san, m.result);
        o.progress?.({ kind: 'row', label: p.label, san: m.san, result: m.result });
        if (rows.every((san) => results.get(san)?.final)) resolve();
      };
    });
    service.handle({ type: 'search', gen: myGen, rootFen: p.fen, rows, shares, ...(p.before.length ? { before: p.before } : {}) });
    await done;
    onUpdate = null;

    // The prepared score at equal ratings: the games after each row with a prepared split, as the
    // panel asks them (cached by the search), and the position before when most came another way.
    const equal = await equalScores(p, table.rows, rows, results, here);
    const after = await stats();
    const diff = (k: keyof ProviderStats) => Number(after[k] ?? 0) - Number(before[k] ?? 0);
    return {
      label: p.label,
      line: p.line,
      fen: p.fen,
      settings: settingsText(o.settings),
      key: settingsKey(o.settings),
      candidates: rows.map((san) => candidateOf(san, results.get(san), rowOf.get(moveKey(san)), p.turn, equal.get(san))),
      autoRows: autoRowsUsed,
      requests: { explorer: diff('explorerRequests'), chessdb: diff('chessdbRequests'), explorer429: diff('explorer429'), chessdb429: diff('chessdb429') },
      seconds: Math.round((o.now() - started) / 1000),
      at: new Date(o.now()).toISOString(),
    };
  }

  async function equalScores(p: Resolved, tableRows: TableRow[], rows: string[], results: Map<string, RowResult>, here: CompactExplorer): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (o.settings.prefs.preparedEqual === false) return out;
    const rated = tableRows.filter((r) => !r.novelty && !r.maiaOnly && r.games > 0 && typeof r.rating === 'number');
    const wanted = rated.filter((r) => rows.includes(r.san) && results.get(r.san)?.prep);
    const kids = new Map<string, CompactExplorer | undefined>();
    await Promise.all(wanted.map(async (r) => kids.set(r.san, await childGames(childFen(p.fen, r.san)))));
    // As the panel: the position before stands in when most games after a move came by another order.
    let prevPos: EqualBefore | undefined;
    const inflowed = [...kids].some(([san, a]) => a && a.total > INFLOW * (rated.find((r) => r.san === san)?.games ?? Infinity));
    if (inflowed && p.back && here.total) {
      const a = await childGames(p.back.fen);
      const led = a?.moves.find((m) => moveKey(m.san) === moveKey(p.back!.san));
      const known = rated.flatMap((r) => {
        const c = kids.get(r.san);
        const opp = c && c.total <= INFLOW * r.games ? moverRating(c) : undefined;
        return opp && typeof r.rating === 'number' ? [{ rating: r.rating, opponent: opp.rating }] : [];
      });
      if (led) prevPos = { here, led: { san: p.back.san, games: led.games, ...(led.rating !== undefined ? { rating: led.rating } : {}) }, known, prior: followPrior(o.settings.prefs.ratings.length) };
    }
    for (const r of wanted) {
      const eq = equalScore(r, kids.get(r.san), p.turn, prevPos, 'lichess');
      const res = results.get(r.san)!;
      if (isEqual(eq)) out.set(r.san, expectedScore(equalPrepared(res.prep!, res.prior ?? 0, eq, p.turn), p.turn)!);
    }
    return out;
  }

  return { evaluate, stats };
}

function childFen(fen: string, san: string): string {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  const move = parseSan(pos, san);
  if (!move) throw new Error(`not a legal move: ${san}`);
  pos.play(move);
  return makeFen(pos.toSetup());
}

function candidateOf(san: string, r: RowResult | undefined, row: TableRow | undefined, turn: Side, equal: number | undefined): CandidateResult {
  const out: CandidateResult = { san, state: r?.state ?? 'error', games: row?.games ?? 0, share: row?.share ?? 0 };
  if (row?.eval) out.cdb = row.eval.cp;
  if (!r) return { ...out, reason: 'no answer' };
  if (r.reason) out.reason = r.reason;
  for (const k of ['value', 'mean', 'engine', 'depth', 'complete', 'stopped', 'positions', 'frontier'] as const) if (r[k] !== undefined && r[k] !== null) (out as unknown as Record<string, unknown>)[k] = r[k];
  if (r.prep) {
    out.prep = r.prep;
    out.prepScore = expectedScore(r.prep, turn)!;
    out.prior = r.prior ?? 0;
  }
  if (equal !== undefined) out.prepEqualScore = equal;
  if (r.replies) out.replies = r.replies.map((x) => ({ san: x.san, share: x.share, v: x.v, move: x.move, ...(x.pick ? { pick: x.pick } : {}) }));
  if (r.switches?.length) (out as unknown as Record<string, unknown>).switches = r.switches;
  return out;
}

/* ------------------------------------------------------------------ the report */

/** The report file: every position's latest result for each settings key, appended to and resumed. */
export interface Report {
  positions: PositionResult[];
}

export function readReport(path: string): Report {
  if (!existsSync(path)) return { positions: [] };
  const j = JSON.parse(readFileSync(path, 'utf8')) as Report;
  return { positions: Array.isArray(j.positions) ? j.positions : [] };
}

/** The candidates already reported for this position under these settings, at the depth asked (or complete). */
export function reportedSans(report: Report, fen: string, key: string): Set<string> {
  const out = new Set<string>();
  for (const p of report.positions) {
    if (fenKey(p.fen) !== fenKey(fen) || p.key !== key) continue;
    for (const c of p.candidates) if (c.state !== 'error' && !c.stopped) out.add(moveKey(c.san));
  }
  return out;
}

/** Adds a position's result: candidates already there for the same position and settings are replaced. */
export function mergeReport(report: Report, r: PositionResult): Report {
  const same = (p: PositionResult) => fenKey(p.fen) === fenKey(r.fen) && p.key === r.key;
  const old = report.positions.find(same);
  if (!old) return { positions: [...report.positions, r] };
  const fresh = new Set(r.candidates.map((c) => moveKey(c.san)));
  const merged: PositionResult = {
    ...r,
    candidates: [...old.candidates.filter((c) => !fresh.has(moveKey(c.san))), ...r.candidates],
    requests: { explorer: old.requests.explorer + r.requests.explorer, chessdb: old.requests.chessdb + r.requests.chessdb, explorer429: old.requests.explorer429 + r.requests.explorer429, chessdb429: old.requests.chessdb429 + r.requests.chessdb429 },
    seconds: old.seconds + r.seconds,
  };
  return { positions: report.positions.map((p) => (same(p) ? merged : p)) };
}

const pct = (x: number | undefined, digits = 1) => (x === undefined ? '–' : `${x.toFixed(digits)}%`);
const cdbText = (cp: number | undefined) => (cp === undefined ? '–' : Math.abs(cp) >= 29000 ? `${cp > 0 ? '' : '-'}#${30000 - Math.abs(cp)}` : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`);

/** The table: position, candidate, Practical value, prepared score, games, share, ChessDB eval, requests. */
export function reportTable(positions: readonly PositionResult[]): string {
  const head = ['Position', 'Move', 'Prac', 'd', 'Prepared', 'Prep=', 'Games', 'Share', 'ChessDB', 'Engine', 'Expl req', 'CDB req'];
  const lines: string[][] = [head];
  for (const p of positions) {
    p.candidates.forEach((c, i) => {
      const note = c.state !== 'value' ? ` (${c.state}${c.reason ? `: ${c.reason}` : ''})` : c.stopped ? ` (stopped: ${c.stopped})` : '';
      lines.push([
        i === 0 ? p.label : '',
        c.san + note,
        pct(c.value),
        c.depth === undefined ? '–' : `${c.depth}${c.complete ? '*' : ''}`,
        c.prepScore === undefined ? '–' : pct(c.prepScore * 100),
        c.prepEqualScore === undefined ? '–' : pct(c.prepEqualScore * 100),
        String(c.games),
        pct(c.share * 100),
        cdbText(c.cdb),
        pct(c.engine),
        i === 0 ? String(p.requests.explorer) : '',
        i === 0 ? String(p.requests.chessdb) : '',
      ]);
    });
  }
  const widths = head.map((_, j) => Math.max(...lines.map((l) => l[j]!.length)));
  return lines.map((l) => l.map((x, j) => (j >= 2 ? x.padStart(widths[j]!) : x.padEnd(widths[j]!))).join('  ').trimEnd()).join('\n');
}

/** What each pick label means, for the replies view. */
export const PICK_TEXT: Record<OwnPick, string> = {
  switched: 'practical pick over ChessDB’s best',
  kept: 'ChessDB’s best, compared and kept',
  only: 'ChessDB’s best, no other move within the own margin',
  rare: 'ChessDB’s best, not compared: line under the compare floor',
  last: 'ChessDB’s best, not compared: last move of the line',
};

/**
 * Each candidate's replies (share of at least `minShare`, a fraction) with their value and my move
 * after each, labelled by how the search chose it: whether an answer is a practical pick or
 * ChessDB's best.
 */
export function repliesText(positions: readonly PositionResult[], minShare = 0.02): string {
  const out: string[] = [];
  for (const p of positions) {
    for (const c of p.candidates) {
      if (!c.replies?.length) continue;
      out.push(`${p.label}  ${c.san}`);
      for (const r of c.replies) {
        if (r.share < minShare) continue;
        const move = r.move ? `${r.move}  (${r.pick ? `${r.pick}: ${PICK_TEXT[r.pick]}` : 'no label: an older report'})` : '–';
        out.push(`  ${r.san.padEnd(7)} ${pct(r.share * 100).padStart(6)}  ${pct(r.v).padStart(6)}  ${move}`);
      }
    }
  }
  return out.join('\n');
}
