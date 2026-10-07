// Where the games come from (PLAN.md §5.51), over fake fetches, and the games' store in Node
// through fake-indexeddb: a gist read (its ETag, a truncated file read from its raw URL, the
// errors), Lichess's export (the query, the login, a line cut short, a 429), and the store keeping
// an analyzer's record over a page's export.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gistId, readGist, type FetchAnswer } from '../../../src/platform/gist.ts';
import { userGames, userGamesUrl } from '../../../src/platform/lichessGames.ts';
import { openGamesStore } from '../../../src/platform/gamesStore.ts';
import type { GameRecord } from '../../../src/core/games/record.ts';

function answer(status: number, body: string, headers: Record<string, string> = {}): FetchAnswer {
  return { ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null }, text: () => Promise.resolve(body) };
}
function fake(route: (url: string, headers: Record<string, string>) => FetchAnswer) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  return {
    calls,
    get: (url: string, init?: { headers?: Record<string, string> }) => {
      const headers = init?.headers ?? {};
      calls.push({ url, headers });
      return Promise.resolve(route(url, headers));
    },
  };
}

test('the gist’s ID from the ID or its address', () => {
  assert.equal(gistId('aa5a315d61ae9438b18d'), 'aa5a315d61ae9438b18d');
  assert.equal(gistId(' https://gist.github.com/someone/0123456789ABCDEF0123456789abcdef/ '), '0123456789abcdef0123456789abcdef');
  assert.equal(gistId('https://example.org/0123456789abcdef0123'), undefined);
  assert.equal(gistId('not a gist'), undefined);
});

test('a gist read: its files, a truncated one from its raw URL with no token, the ETag, a 304', async () => {
  const body = JSON.stringify({
    updated_at: '2026-10-01T10:00:00Z',
    files: {
      'mistakelab_progress.json': { size: 20, truncated: false, content: '{"positions":{}}' },
      'mistakelab_games.json': { size: 2_000_000, truncated: true, content: '{"ver', raw_url: 'https://gist.githubusercontent.com/x/raw/games.json' },
    },
  });
  const f = fake((url, h) => (url.startsWith('https://api.github.com/') ? (h['If-None-Match'] === '"e1"' ? answer(304, '') : answer(200, body, { ETag: '"e1"' })) : answer(200, '{"version":2,"games":[]}')));
  const r = await readGist('abc123abc123abc123ab', { get: f.get, token: 'tok' });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.equal(r.etag, '"e1"');
  assert.deepEqual(r.files.map((x) => x.name), ['mistakelab_progress.json', 'mistakelab_games.json']);
  assert.equal(await r.text('mistakelab_progress.json'), '{"positions":{}}');
  assert.equal(await r.text('mistakelab_games.json'), '{"version":2,"games":[]}');
  assert.equal(await r.text('missing.json'), undefined);
  assert.equal(f.calls[0]!.headers['Authorization'], 'Bearer tok');
  assert.equal(f.calls[1]!.headers['Authorization'], undefined, 'the raw URL gets no token');
  assert.deepEqual(await readGist('abc123abc123abc123ab', { get: f.get, etag: '"e1"' }), { status: 'unchanged' });
});

test('a gist’s errors say what happened', async () => {
  await assert.rejects(() => readGist('x', { get: fake(() => answer(404, '')).get }), /No gist has that ID/);
  await assert.rejects(() => readGist('x', { get: fake(() => answer(403, '')).get }), /rate limit/);
  await assert.rejects(() => readGist('x', { get: fake(() => answer(200, '<html>')).get }), /isn’t JSON/);
});

test('Lichess’s export: the query, the login, a line cut short, the errors', async () => {
  assert.equal(userGamesUrl({ name: 'Some One', since: 1000, max: 300 }), 'https://lichess.org/api/games/user/Some%20One?max=300&moves=true&evals=true&clocks=true&opening=true&since=1001');
  const f = fake(() => answer(200, '{"id":"a1"}\n{"id":"a2"}\n{"id":"a3","mov'));
  const r = await userGames({ name: 'me', max: 10, token: 'lip' }, f.get);
  assert.deepEqual(r.games, [{ id: 'a1' }, { id: 'a2' }]);
  assert.equal(r.badLines, 1);
  assert.equal(f.calls[0]!.headers['Authorization'], 'Bearer lip');
  assert.equal(f.calls[0]!.headers['Accept'], 'application/x-ndjson');
  await assert.rejects(() => userGames({ name: 'me', max: 1 }, fake(() => answer(429, '')).get), /wait a minute/);
  await assert.rejects(() => userGames({ name: 'nobody', max: 1 }, fake(() => answer(404, '')).get), /no user nobody/);
});

const rec = (id: string, moves: string[]): GameRecord => ({ id, platform: 'lichess', createdAt: 1, speed: 'blitz', rated: true, color: 'white', white: { name: 'a', id: 'a' }, black: { name: 'b', id: 'b' }, status: 'resign', moves });

test('the store: games kept, the analyzer’s record never replaced by the page’s, meta, cleared', async () => {
  const s = openGamesStore(indexedDB, 'games-store-test-1');
  assert.equal(await s.putGames([{ game: rec('g1', ['e4']), source: 'lichess' }, { game: rec('g2', ['d4']), source: 'gist' }]), 2);
  assert.equal(await s.putGames([{ game: rec('g1', ['e4']), source: 'lichess' }]), 0, 'unchanged');
  assert.equal(await s.putGames([{ game: { ...rec('g1', ['e4']), evals: [{ cp: 20 }] }, source: 'gist' }, { game: rec('g2', ['d4', 'd5']), source: 'lichess' }]), 1);
  const all = await s.games();
  assert.deepEqual(all.map((g) => [g.game.id, g.source, g.game.moves.length]).sort(), [
    ['g1', 'gist', 1],
    ['g2', 'gist', 1],
  ]);
  await s.setMeta('gist', { etag: '"x"' });
  assert.deepEqual(await s.meta('gist'), { etag: '"x"' });
  await s.clear();
  assert.equal((await s.games()).length, 0);
  assert.equal(await s.meta('gist'), undefined);
});
