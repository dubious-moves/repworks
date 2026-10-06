// The providers' local explorer path and the explorer's URLs (PLAN.md §5.21, §5.23, §5.25).
// The local cases are q_extension's `test/explorerdb.js` ("explorerdb: the server", c26242f) for
// `providers.js`'s local path, against a small stand-in for `explorerdb serve` on a free port,
// since the real server stays in q_extension.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createProviders, explorerUrl, filterHash, localAddress, localExplorerUrl, localInfo, EXPLORER_URL, type Http } from '../../../../src/core/explorer/providers.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILTER = { speeds: ['blitz'], ratings: [2000] };
const ANSWER = {
  white: 6,
  draws: 3,
  black: 1,
  moves: [
    { uci: 'e2e4', san: 'e4', white: 4, draws: 2, black: 1 },
    { uci: 'd2d4', san: 'd4', white: 2, draws: 1, black: 0 },
  ],
};

const http: Http = (url, init) => fetch(url, init);

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve('localhost:' + (server.address() as AddressInfo).port)));
}
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test('providers ask the local explorer: no token, cache or budget, a hit for the rounds', async (t) => {
  const asked: string[] = [];
  const server = createServer((q, r) => {
    asked.push(q.url ?? '');
    r.setHeader('content-type', 'application/json');
    if (q.url === '/info') r.end(JSON.stringify({ id: 'dump.pgn@2026-09', filter: FILTER }));
    else if (q.url?.startsWith('/lichess?')) r.end(JSON.stringify(ANSWER));
    else (r.statusCode = 404), r.end('{}');
  });
  const address = await listen(server);
  t.after(() => close(server));
  const noCache = {
    get: () => Promise.reject(new Error('the cache was read')),
    put: () => Promise.reject(new Error('the cache was written')),
  };
  let tokenAsked = 0;
  let use = address;
  const stats: Record<string, unknown> = {};
  const prov = createProviders({
    http,
    cache: noCache,
    stats,
    now: () => 0,
    sleep: () => Promise.resolve(),
    getToken: () => {
      tokenAsked++;
      return Promise.resolve('');
    },
    localExplorer: () => use,
  });

  const counts = { hits: 0, misses: 0 };
  const budget = { limit: 0, spent: 0 };
  const v = await prov.explorer(START, FILTER, () => false, { counts, budget });
  assert.equal(v.total, 10);
  assert.deepEqual(
    v.moves.map((m) => [m.san, m.games]),
    [
      ['e4', 7],
      ['d4', 3],
    ],
  );
  assert.deepEqual([counts.hits, counts.misses, budget.spent, tokenAsked, stats.localRequests], [1, 0, 0, 0, 1]);
  assert.equal(asked[0], new URL(localExplorerUrl(START, FILTER, address)).pathname + new URL(localExplorerUrl(START, FILTER, address)).search);
  const info = await prov.localInfo(address + '/');
  assert.equal(info.id, 'dump.pgn@2026-09');

  // With the address cleared, the next request goes to Lichess again (and so reads the cache).
  use = '';
  await assert.rejects(prov.explorer(START, FILTER, () => false, {}), /the cache was read/);
  use = address;
});

test('addresses are spelled one way, and the local URL is the explorer’s query', () => {
  assert.equal(localAddress(' localhost:9337/ '), 'http://localhost:9337');
  assert.equal(localAddress('https://x.lan:1/'), 'https://x.lan:1');
  assert.equal(localAddress(''), '');
  const u = localExplorerUrl(START, FILTER, 'localhost:9337');
  assert.equal(u, explorerUrl(START, FILTER).replace(EXPLORER_URL, 'http://localhost:9337/lichess'));
});

test('a server that isn’t running, or isn’t one, says so', async () => {
  const other = createServer((_q, r) => r.end('{}'));
  const address = await listen(other);
  await assert.rejects(localInfo(http, address), /is not a local explorer/);
  await close(other);
  await assert.rejects(localInfo(http, address), /nothing answers at http:\/\/localhost:/);
  const prov = createProviders({
    http,
    cache: { get: () => Promise.resolve(undefined), put: () => Promise.resolve() },
    now: () => 0,
    sleep: () => Promise.resolve(),
    getToken: () => Promise.resolve(''),
    localExplorer: address,
  });
  await assert.rejects(prov.explorer(START, FILTER, () => false, {}), /local explorer not answering/);
});

test('Masters: its own URL with no filter, and its own cache key', () => {
  const masters = explorerUrl(START, { ...FILTER, db: 'masters' });
  assert.equal(masters, 'https://explorer.lichess.org/masters?fen=' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -') + '&moves=30&topGames=0');
  assert.equal(filterHash({ ...FILTER, db: 'masters' }), 'masters');
  // Lichess's key is q_extension's, so the same filter keys the same answers.
  assert.equal(filterHash({ ...FILTER, db: 'lichess' }), filterHash(FILTER));
  assert.equal(filterHash({ speeds: ['rapid', 'blitz'], ratings: [2200, 2000], since: '2026-04' }), 'blitz,rapid|2000,2200|2026-04');
});
