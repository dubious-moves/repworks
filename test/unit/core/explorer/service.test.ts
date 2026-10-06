// The explorer worker's logic (PLAN.md §5.22): lookups for the panel and the Practical search, over
// a fake HTTP, a fake clock and a memory cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { createMemoryCache, type HttpResponse } from '../../../../src/core/explorer/providers.ts';
import { createExplorerService, type ExplorerConfig, type FromWorker } from '../../../../src/core/explorer/service.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CONFIG: ExplorerConfig = { token: 'tok', filter: { speeds: ['blitz'], ratings: [2000] }, local: '', analyse: false, options: { maxPly: 4 }, budget: 60 };

const json = (status: number, body: unknown): HttpResponse => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });

/** The first `n` legal moves of a position, in SAN, from a FEN of four or six fields. */
function legalSans(fen: string, n: number): { san: string; uci: string }[] {
  const pos = Chess.fromSetup(parseFen(fen.split(' ').length === 4 ? fen + ' 0 1' : fen).unwrap()).unwrap();
  const out: { san: string; uci: string }[] = [];
  for (const [from, tos] of pos.allDests()) {
    for (const to of tos) {
      if (out.length < n) out.push({ san: makeSan(pos, { from, to }), uci: '' });
    }
  }
  return out;
}

/** A world where every position has two moves with games, and ChessDB knows them. */
function world(options: { explorer?: (url: string) => HttpResponse | Promise<HttpResponse> } = {}) {
  let t = 1_000_000;
  const urls: string[] = [];
  const auth: (string | undefined)[] = [];
  const posts: FromWorker[] = [];
  const http = (url: string, init?: { headers?: Record<string, string> }): Promise<HttpResponse> => {
    urls.push(url);
    const fen = decodeURIComponent((/(?:fen|board)=([^&]+)/.exec(url) ?? [])[1] ?? '');
    if (url.startsWith('https://explorer.lichess.org')) {
      auth.push(init?.headers?.Authorization);
      if (options.explorer) return Promise.resolve(options.explorer(url));
      const moves = legalSans(fen, 2).map((m, i) => ({ uci: m.uci, san: m.san, white: 300 - 100 * i, draws: 200, black: 100 + 50 * i }));
      return Promise.resolve(json(200, { white: 900, draws: 400, black: 350, moves }));
    }
    const moves = legalSans(fen, 2).map((m, i) => ({ uci: m.uci, san: m.san, score: 30 - 20 * i }));
    return Promise.resolve(json(200, { status: 'ok', moves }));
  };
  const service = createExplorerService({
    http,
    cache: createMemoryCache(() => t),
    now: () => t,
    sleep: (ms) => {
      t += ms;
      return Promise.resolve();
    },
    post: (m) => posts.push(m),
  });
  service.handle({ type: 'config', config: CONFIG });
  return { service, urls, auth, posts, tick: (ms: number) => (t += ms) };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const explorerUrls = (urls: string[]) => urls.filter((u) => u.startsWith('https://explorer.lichess.org'));

test('a lookup: the games and ChessDB’s evals, asked once and then from the cache', async () => {
  const w = world();
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  await settle();
  const games = w.posts.find((m) => m.type === 'games' && m.id === 1);
  const evals = w.posts.find((m) => m.type === 'evals' && m.id === 1);
  assert.ok(games && 'games' in games && games.games.total === 1650);
  assert.ok(evals && 'evals' in evals && evals.evals.status === 'ok');
  assert.equal(explorerUrls(w.urls).length, 1);
  assert.match(explorerUrls(w.urls)[0]!, /\/lichess\?variant=standard&fen=.*&speeds=blitz&ratings=2000&moves=30/);
  assert.deepEqual(w.auth, ['Bearer tok']);
  w.service.handle({ type: 'lookup', id: 2, tab: 'lichess', fen: START.replace(' 0 1', ' 3 7') });
  await settle();
  assert.equal(w.urls.length, 2, 'the second lookup came from the cache, move counters aside');
  assert.ok(w.posts.some((m) => m.type === 'games' && m.id === 2));
});

test('Masters is asked without the filter; ChessDB’s tab asks ChessDB alone', async () => {
  const w = world();
  w.service.handle({ type: 'lookup', id: 1, tab: 'masters', fen: START });
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' });
  await settle();
  const ex = explorerUrls(w.urls);
  assert.equal(ex.length, 1);
  assert.match(ex[0]!, /^https:\/\/explorer\.lichess\.org\/masters\?fen=[^&]+&moves=30&topGames=0$/);
  assert.ok(!w.posts.some((m) => m.type === 'games' && m.id === 2));
  assert.ok(w.posts.some((m) => m.type === 'evals' && m.id === 2));
});

test('no Lichess login: the games say so and offer the login; ChessDB still answers; the column says why', async () => {
  const w = world();
  w.service.handle({ type: 'config', config: { ...CONFIG, token: '' } });
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 0.5 } });
  await settle();
  const games = w.posts.find((m) => m.type === 'games');
  assert.ok(games && 'error' in games && games.error.login);
  assert.ok(w.posts.some((m) => m.type === 'evals' && 'evals' in m));
  assert.equal(explorerUrls(w.urls).length, 0);
  const row = w.posts.find((m) => m.type === 'update');
  assert.ok(row && row.type === 'update' && row.result.state === 'error' && /log in with Lichess/.test(row.result.reason!));
});

test('a 429: the panel is told, the request waits out the minute and is answered', async () => {
  let refused = false;
  const w = world({
    explorer: () => {
      if (!refused) return (refused = true), json(429, {});
      return json(200, { white: 1, draws: 0, black: 0, moves: [] });
    },
  });
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  await settle();
  assert.ok(w.posts.some((m) => m.type === 'paused' && m.ms === 60000));
  assert.ok(w.posts.some((m) => m.type === 'games' && 'games' in m && m.games.total === 1));
  assert.equal(explorerUrls(w.urls).length, 2);
  w.service.handle({ type: 'stats' });
  await settle();
  const stats = w.posts.find((m) => m.type === 'stats');
  assert.ok(stats && stats.type === 'stats' && stats.stats.explorer429 === 1 && stats.stats.explorerRequests === 2);
});

test('a dropped lookup’s queued request goes, and nothing is posted for it', async () => {
  let release: (r: HttpResponse) => void = () => {};
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => (release = r)) });
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  w.service.handle({ type: 'lookup', id: 2, tab: 'lichess', fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' });
  await settle();
  // The first is in flight (one at a time); the second waits, and is dropped.
  w.service.handle({ type: 'drop', id: 2 });
  release(json(200, { white: 1, draws: 0, black: 0, moves: [] }));
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1);
  assert.ok(w.posts.some((m) => m.type === 'games' && m.id === 1));
  assert.ok(!w.posts.some((m) => m.type === 'games' && m.id === 2));
});

test('the Practical search: rows valued by rounds, each published with its depth, then final', async () => {
  const w = world();
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'Nf3'], shares: { e4: 0.6, Nf3: 0.4 } });
  await settle();
  const updates = w.posts.filter((m): m is Extract<FromWorker, { type: 'update' }> => m.type === 'update');
  assert.ok(updates.length >= 2);
  for (const u of updates) assert.equal(u.root, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  const last = new Map(updates.map((u) => [u.san, u.result]));
  for (const san of ['e4', 'Nf3']) {
    const r = last.get(san)!;
    assert.equal(r.state, 'value', san);
    assert.equal(r.final, true, san);
    assert.ok(r.value! > 0 && r.value! < 100);
    assert.equal(r.depth, 3, san); // maxPly 4: depths 1 and 3
  }
  // Depth 1 first, row by row; depth 3 published together.
  assert.deepEqual(
    updates.map((u) => u.result.depth),
    [1, 1, 3, 3],
  );
});

test('a new root sweeps the old one’s queued requests, and the old one posts nothing more', async () => {
  const held: ((r: HttpResponse) => void)[] = [];
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => held.push(r)) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'd4'], shares: { e4: 0.5, d4: 0.5 } });
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1, 'one explorer request in flight at a time');
  const after = makeFen(Chess.fromSetup(parseFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1').unwrap()).unwrap().toSetup());
  w.service.handle({ type: 'search', gen: 2, rootFen: after, rows: [], shares: {} });
  held.shift()!(json(200, { white: 1, draws: 0, black: 0, moves: [] }));
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1, 'd4’s queued request was dropped');
  assert.ok(!w.posts.some((m) => m.type === 'update' && m.gen === 1));
});

test('a row taken out while it runs is reported as excluded', async () => {
  const held: ((r: HttpResponse) => void)[] = [];
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => held.push(r)) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 1 } });
  await settle();
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: [], remove: ['e4'], shares: {} });
  assert.ok(w.posts.some((m) => m.type === 'update' && m.san === 'e4' && m.result.state === 'excluded'));
});

test('coverage counts (§5.26): the games alone, at the filter, once and then from the cache; with no login, the reason', async () => {
  const w = world();
  w.service.handle({ type: 'counts', id: 7, fen: START });
  await settle();
  const games = w.posts.find((m) => m.type === 'games' && m.id === 7);
  assert.ok(games && 'games' in games && games.games.total === 1650);
  assert.deepEqual(w.urls.map((u) => u.split('?')[0]), ['https://explorer.lichess.org/lichess'], 'no ChessDB request');
  assert.match(w.urls[0]!, /speeds=blitz&ratings=2000/);
  w.service.handle({ type: 'counts', id: 8, fen: START });
  await settle();
  assert.equal(w.urls.length, 1);
  assert.ok(w.posts.some((m) => m.type === 'games' && m.id === 8));

  const none = world();
  none.service.handle({ type: 'config', config: { ...CONFIG, token: '' } });
  none.service.handle({ type: 'counts', id: 9, fen: START });
  await settle();
  const refused = none.posts.find((m) => m.type === 'games' && m.id === 9);
  assert.ok(refused && 'error' in refused && refused.error.login);
});
