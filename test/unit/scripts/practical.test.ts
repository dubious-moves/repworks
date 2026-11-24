// The Practical report (scripts/practical-lib.ts, PLAN.md §5.211): over fake providers, its numbers
// are the app's search's for the same tree and options, at depth 5 and 7; its filter and options are
// the app's defaults; the input, the report file and the cache on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { configOf, DEFAULT_PREFS } from '../../../src/core/explorer/prefs.ts';
import { compactChessdb, compactExplorer, createMemoryCache, type HttpResponse } from '../../../src/core/explorer/providers.ts';
import { evaluateRow, fenKey, type SearchProvider } from '../../../src/core/explorer/search.ts';
import { configFor, createFileCache, createRunner, DEFAULT_SETTINGS, mergeReport, reportedSans, reportTable, resolvePosition, sansOf, settingsKey, type Settings } from '../../../scripts/practical-lib.ts';

/* A deterministic tree: every position's games and ChessDB scores come from a hash of its FEN. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function legal(fen: string): { san: string; uci: string }[] {
  const pos = Chess.fromSetup(parseFen(fen.split(' ').length === 4 ? fen + ' 0 1' : fen).unwrap()).unwrap();
  fen = fenKey(fen);
  const out: { san: string; uci: string }[] = [];
  for (const [from, tos] of pos.allDests()) for (const to of tos) out.push({ san: makeSan(pos, { from, to }), uci: makeUci({ from, to }) });
  return out.sort((a, b) => hash(fen + a.uci) - hash(fen + b.uci));
}
/** Some positions have thousands of games, some fall under minGames: hashed on the FEN's first four fields, as the explorer is asked. */
function explorerRaw(fen: string) {
  const total = [3000, 1200, 600, 120, 40, 8][hash(fenKey(fen)) % 6]!;
  const ms = legal(fen).slice(0, 2 + (hash(fenKey(fen)) % 3));
  let left = total;
  const moves = ms.map((m, i) => {
    const n = i === ms.length - 1 ? left : Math.round(left * (0.45 + (hash(fenKey(fen) + i) % 30) / 100));
    left -= n;
    const w = Math.round(n * (0.3 + (hash(m.uci + fenKey(fen)) % 30) / 100));
    const d = Math.round((n - w) * 0.35);
    return { uci: m.uci, san: m.san, white: w, draws: d, black: n - w - d, averageRating: 1700 + (hash(m.san + fenKey(fen)) % 600) };
  });
  const sum = (k: 'white' | 'draws' | 'black') => moves.reduce((s, m) => s + m[k], 0);
  return { white: sum('white'), draws: sum('draws'), black: sum('black'), moves };
}
function chessdbRaw(fen: string) {
  const moves = legal(fen)
    .slice(0, 5)
    .map((m) => ({ uci: m.uci, san: m.san, score: (hash('cdb' + fenKey(fen) + m.uci) % 160) - 60 }))
    .sort((a, b) => b.score - a.score);
  return { status: 'ok', moves };
}

function fakeHttp() {
  const urls: string[] = [];
  const auth: (string | undefined)[] = [];
  const json = (body: unknown): HttpResponse => ({ status: 200, ok: true, json: () => Promise.resolve(body) });
  const http = (url: string, init?: { headers?: Record<string, string> }): Promise<HttpResponse> => {
    urls.push(url);
    const fen = decodeURIComponent((/(?:fen|board)=([^&]+)/.exec(url) ?? [])[1] ?? '');
    if (url.startsWith('https://explorer.lichess.org')) {
      auth.push(init?.headers?.['Authorization']);
      return Promise.resolve(json(explorerRaw(fen)));
    }
    if (url.includes('action=queryall')) return Promise.resolve(json(chessdbRaw(fen)));
    return Promise.resolve({ status: 404, ok: false, json: () => Promise.resolve({}) });
  };
  return { http, urls, auth };
}
const FILES = 'abcdefgh';
const parseSquare = (s: string) => FILES.indexOf(s[0]!) + 8 * (Number(s[1]) - 1);

/** The app's search, called directly: evaluateRow on a provider answering from the same tree. */
function directProvider(): SearchProvider {
  return {
    explorer: (fen) => Promise.resolve(compactExplorer(explorerRaw(fen))),
    chessdb: (fen) => Promise.resolve(compactChessdb(chessdbRaw(fen))),
    child: (fen, san) => {
      const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
      const m = legal(fen).find((x) => x.san === san)!;
      pos.play({ from: parseSquare(m.uci.slice(0, 2)), to: parseSquare(m.uci.slice(2, 4)) });
      return makeFen(pos.toSetup());
    },
  };
}

function runnerFor(settings: Settings) {
  let t = 1_000_000;
  const h = fakeHttp();
  const runner = createRunner({
    http: h.http,
    cache: createMemoryCache(() => t),
    now: () => t,
    sleep: (ms) => {
      t += ms;
      return Promise.resolve();
    },
    token: 'test-token',
    settings,
  });
  return { runner, ...h };
}

const ROOT = '1.e4 e5';

test('the report’s values are the app’s search’s, at depth 5 and 7, for given candidates', async () => {
  const p = resolvePosition({ moves: ROOT, candidates: '2.Nf3, 2.Bc4' });
  const positions: number[] = [];
  for (const depth of [5, 7]) {
    const settings = { ...DEFAULT_SETTINGS, depth };
    const { runner } = runnerFor(settings);
    const r = await runner.evaluate(p);
    const opts = { ...configOf(DEFAULT_PREFS, 'test-token', new Date(0)).options, maxPly: depth + 1 };
    assert.equal(r.candidates.length, 2);
    for (const c of r.candidates) {
      const want = await evaluateRow(directProvider(), p.fen, c.san, depth, opts);
      assert.equal(want.state, 'value', `${c.san} has a value`);
      assert.equal(c.depth, want.complete ? c.depth : depth);
      assert.equal(c.value, want.value, `${c.san} at depth ${depth}`);
      assert.equal(c.mean, want.mean);
      assert.equal(c.engine, want.engine);
      assert.deepEqual(c.prep, want.prep);
      assert.equal(c.prepScore, want.prep ? want.prep.w + want.prep.d / 2 : undefined);
      positions.push(c.positions ?? 0);
    }
  }
  assert.ok(positions[2]! + positions[3]! > positions[0]! + positions[1]!, 'depth 7 searched more of the tree than 5');
});

test('without candidates, the app’s own rows: the engine’s near-best, then the moves played in 2%', async () => {
  const p = resolvePosition({ moves: ROOT });
  const { runner } = runnerFor({ ...DEFAULT_SETTINGS, depth: 3 });
  const r = await runner.evaluate(p);
  assert.ok(r.autoRows);
  const cdbBest = chessdbRaw(p.fen).moves[0]!.san;
  assert.ok(r.candidates.some((c) => c.san === cdbBest), 'ChessDB’s best is a row');
  const raw = explorerRaw(p.fen);
  const total = raw.white + raw.draws + raw.black;
  const played = raw.moves.filter((m) => m.white + m.draws + m.black >= 0.02 * total).map((m) => m.san);
  for (const san of played) assert.ok(r.candidates.some((c) => c.san === san), `${san} is a row`);
  for (const c of r.candidates) assert.equal(c.state, 'value');
});

test('the filter, the token and the options are the app’s defaults; the depth sets maxPly', async () => {
  const p = resolvePosition({ moves: ROOT, candidates: ['Nf3'] });
  const { runner, urls, auth } = runnerFor(DEFAULT_SETTINGS);
  const r = await runner.evaluate(p);
  const explorer = urls.filter((u) => u.startsWith('https://explorer.lichess.org'));
  assert.ok(explorer.length > 0);
  for (const u of explorer) assert.match(u, /speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&/);
  assert.ok(auth.every((a) => a === 'Bearer test-token'));
  assert.equal(r.requests.explorer, explorer.length);
  const c = configFor({ ...DEFAULT_SETTINGS, depth: 7 }, 'x', new Date(0));
  assert.equal(c.options.maxPly, 8);
  assert.equal(c.options.riskAversion, 0.05);
  assert.equal(c.options.replyThreshold, 0.03);
  assert.equal(c.options.reachFloor, 0.02);
  assert.equal(c.options.maia, undefined, 'Maia off unless asked, as in the app');
  assert.equal(c.maiaPreview, undefined);
  const m = configFor({ ...DEFAULT_SETTINGS, maia: { on: true, elo: 2150, model: 'maia3-23m' } }, 'x', new Date(0));
  assert.equal(m.options.maia, true);
  assert.equal(m.options.maiaElo, 2150);
  const only = configFor({ ...DEFAULT_SETTINGS, maia: { on: true, elo: 2150, model: 'maia3-23m', only: true } }, 'x', new Date(0));
  assert.equal(only.options.maiaOnly, true);
  assert.equal(c.budget, Infinity);
});

test('no token: the rows say a Lichess login is needed', async () => {
  const p = resolvePosition({ moves: ROOT, candidates: ['Nf3'] });
  let t = 0;
  const h = fakeHttp();
  const runner = createRunner({ http: h.http, cache: createMemoryCache(() => t), now: () => t, sleep: (ms) => ((t += ms), Promise.resolve()), token: '', settings: DEFAULT_SETTINGS });
  await assert.rejects(runner.evaluate(p), /Lichess/);
});

test('the input: SAN with or without move numbers, a FEN, checked moves', () => {
  assert.deepEqual(sansOf('1.Nc3 c5 2.d4 cxd4 3...Nc6 *'), ['Nc3', 'c5', 'd4', 'cxd4', 'Nc6']);
  assert.deepEqual(sansOf(['9.O-O-O', '9.Ng5']), ['O-O-O', 'Ng5']);
  const p = resolvePosition({ moves: '1.Nc3 c5 2.d4 cxd4 3.Qxd4 Nc6 4.Qh4 Nf6 5.Nf3 g6 6.e4 d6 7.Bc4 Bg7 8.Bh6 O-O', candidates: '9.O-O-O,9.Ng5' });
  assert.equal(p.turn, 'w');
  assert.deepEqual(p.candidates, ['O-O-O', 'Ng5']);
  assert.equal(p.before.length, 7);
  assert.equal(p.back?.san, 'O-O');
  assert.equal(p.line, '1.Nc3 c5 2.d4 cxd4 3.Qxd4 Nc6 4.Qh4 Nf6 5.Nf3 g6 6.e4 d6 7.Bc4 Bg7 8.Bh6 O-O');
  assert.throws(() => resolvePosition({ moves: '1.e4 e4' }), /not a legal move: e4/);
  assert.throws(() => resolvePosition({ moves: '1.e4', candidates: ['Nf6', 'Ke2'] }), /Ke2/);
  const f = resolvePosition({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', moves: 'e5' });
  assert.equal(f.turn, 'w');
  assert.equal(f.line, '1...e5');
});

test('the report file: resumed by position and settings, candidates merged, a table', () => {
  const base = { label: 'x', line: '1.e4', fen: 'f w - - 0 1', settings: '', key: settingsKey(DEFAULT_SETTINGS), autoRows: false, seconds: 3, at: '' };
  const a = { ...base, candidates: [{ san: 'Nf3', state: 'value' as const, value: 60, depth: 5, games: 10, share: 0.5 }], requests: { explorer: 4, chessdb: 9, explorer429: 0, chessdb429: 0 } };
  const b = { ...base, candidates: [{ san: 'Bc4', state: 'value' as const, value: 55, depth: 5, games: 5, share: 0.25, stopped: 'budget' }], requests: { explorer: 1, chessdb: 2, explorer429: 0, chessdb429: 0 } };
  let r = mergeReport({ positions: [] }, a);
  r = mergeReport(r, b);
  assert.equal(r.positions.length, 1);
  assert.deepEqual(r.positions[0]!.candidates.map((c) => c.san), ['Nf3', 'Bc4']);
  assert.equal(r.positions[0]!.requests.explorer, 5);
  assert.deepEqual([...reportedSans(r, 'f w - - 0 9', base.key)], ['Nf3'], 'a stopped row is asked again');
  assert.equal(reportedSans(r, 'f w - - 0 1', settingsKey({ ...DEFAULT_SETTINGS, depth: 7 })).size, 0, 'another depth is another run');
  const table = reportTable(r.positions);
  assert.match(table, /Nf3\s+60\.0%\s+5/);
  assert.match(table, /Bc4 \(stopped: budget\)/);
});

test('the cache on disk: read back by a later run, TTLs on each record’s time', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'practical-'));
  try {
    let t = 1000;
    const a = createFileCache(dir, () => t);
    await a.put('explorer', 'k', { total: 3 });
    await a.put('chessdb', 'k', { status: 'ok' });
    t = 5000;
    const b = createFileCache(dir, () => t);
    assert.deepEqual(await b.get('explorer', 'k', 10_000), { total: 3 });
    assert.deepEqual(await b.get('chessdb', 'k', 10_000), { status: 'ok' });
    assert.equal(await b.get('explorer', 'k', 1000), undefined, 'expired');
    assert.equal(b.size(), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
