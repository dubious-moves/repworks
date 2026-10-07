// The explorer worker's storm messages (PLAN.md §5.42): a position's games at the storm's relaxed
// filter, the games as one export with no token (a simple request: text/plain, no Authorization),
// a 429's pause, the masters PGN, and ChessDB's scores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCache, GAMES_EXPORT_URL, type HttpResponse } from '../../../../src/core/explorer/providers.ts';
import { createExplorerService, type FromWorker } from '../../../../src/core/explorer/service.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const res = (status: number, body: unknown, text = ''): HttpResponse => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body), text: () => Promise.resolve(text) });

function world(exportStatus: number[] = []) {
  let t = 1_000_000;
  const calls: { url: string; init?: { headers?: Record<string, string>; method?: string; body?: string } }[] = [];
  const posts: FromWorker[] = [];
  const statuses = [...exportStatus];
  const service = createExplorerService({
    http: (url, init) => {
      calls.push(init ? { url, init } : { url });
      if (url.startsWith('https://explorer.lichess.org/lichess')) return Promise.resolve(res(200, { white: 5, draws: 1, black: 4, moves: [{ uci: 'e2e4', san: 'e4', white: 5, draws: 1, black: 4 }], topGames: [{ id: 'AAAAAAAA' }], recentGames: [{ id: 'BBBBBBBB' }, { id: 'AAAAAAAA' }, { id: 'bad' }] }));
      if (url.startsWith('https://explorer.lichess.org/masters/pgn/')) return Promise.resolve(res(200, null, '[Event "m"]\n\n1. d4 *\n'));
      if (url.startsWith('https://lichess.org/api/games/export/_ids')) return Promise.resolve(res(statuses.shift() ?? 200, null, '[Event "x"]\n\n1. e4 *\n'));
      return Promise.resolve(res(200, { status: 'ok', moves: [{ uci: 'e2e4', san: 'e4', score: '30' }] }));
    },
    cache: createMemoryCache(() => t),
    now: () => t,
    sleep: (ms) => ((t += ms), Promise.resolve()),
    post: (m) => posts.push(m),
  });
  service.handle({ type: 'config', config: { token: 'tok', filter: { speeds: ['blitz'], ratings: [2000] }, local: 'http://localhost:9337', analyse: false, options: {}, budget: 60 } });
  return { service, calls, posts };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test('a position’s games: every speed and 1000–2500, four top and four recent, Lichess even with a local explorer', async () => {
  const w = world();
  w.service.handle({ type: 'stormGames', id: 1, fen: START });
  await settle();
  const url = w.calls[0]!.url;
  assert.ok(url.startsWith('https://explorer.lichess.org/lichess?'));
  assert.ok(url.includes('speeds=bullet,blitz,rapid,classical,correspondence'));
  assert.ok(url.includes('ratings=1000,1200,1400,1600,1800,2000,2200,2500'));
  assert.ok(url.includes('topGames=4&recentGames=4'));
  assert.equal(w.calls[0]!.init?.headers?.Authorization, 'Bearer tok');
  const m = w.posts.find((p) => p.type === 'stormGames')!;
  assert.ok('games' in m);
  assert.deepEqual(m.games.gameIds, ['AAAAAAAA', 'BBBBBBBB']);
});

test('the games’ export: one POST of the ids, text/plain, no token', async () => {
  const w = world();
  w.service.handle({ type: 'gamePgns', id: 2, ids: ['AAAAAAAA', 'BBBBBBBB', 'AAAAAAAA', 'x'] });
  await settle();
  assert.equal(w.calls.length, 1);
  const c = w.calls[0]!;
  assert.equal(c.url, GAMES_EXPORT_URL);
  assert.deepEqual([c.init?.method, c.init?.body, c.init?.headers], ['POST', 'AAAAAAAA,BBBBBBBB', { 'Content-Type': 'text/plain' }]);
  const m = w.posts.find((p) => p.type === 'gamePgns')!;
  assert.ok('text' in m && m.text.includes('1. e4'));
});

test('a 429 pauses the exports a minute and tries once more; a second refusal is an error', async () => {
  const w = world([429, 200]);
  w.service.handle({ type: 'gamePgns', id: 3, ids: ['AAAAAAAA'] });
  await settle();
  assert.equal(w.calls.length, 2);
  assert.ok(w.posts.some((p) => p.type === 'gamePgns' && 'text' in p));
  const w2 = world([429, 429]);
  w2.service.handle({ type: 'gamePgns', id: 4, ids: ['AAAAAAAA'] });
  await settle();
  assert.ok(w2.posts.some((p) => p.type === 'gamePgns' && 'error' in p));
});

test('masters games one by one, from the explorer’s PGN path; ChessDB’s scores', async () => {
  const w = world();
  w.service.handle({ type: 'gamePgns', id: 5, ids: ['MMMMMMMM'], masters: true });
  w.service.handle({ type: 'scores', id: 6, fen: START });
  await settle();
  assert.ok(w.calls.some((c) => c.url === 'https://explorer.lichess.org/masters/pgn/MMMMMMMM' && !c.init));
  const m = w.posts.find((p) => p.type === 'gamePgns')!;
  assert.ok('text' in m && m.text.includes('1. d4'));
  const s = w.posts.find((p) => p.type === 'scores')!;
  assert.ok('evals' in s && s.evals.moves![0]!.score === 30);
});
