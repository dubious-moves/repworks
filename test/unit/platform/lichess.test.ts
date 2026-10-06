// The Lichess adapter (PLAN.md §4.10): the client's requests and errors, and the PKCE login
// against a fake Lichess, with the verifier kept in (memory) origin storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LichessError } from '../../../src/core/import/lichess.ts';
import { base64Url, codeChallenge, LichessAuth, lichessClient, type AuthStorage } from '../../../src/platform/lichess.ts';

class MemoryStorage implements AuthStorage {
  readonly items = new Map<string, string>();
  getItem = (k: string) => this.items.get(k) ?? null;
  setItem = (k: string, v: string) => void this.items.set(k, v);
  removeItem = (k: string) => void this.items.delete(k);
}

interface Seen {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response>): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    return answer(String(input), init);
  }) as typeof fetch;
  return { fetch: f, seen };
}

const TOKEN = 'test_token_lichess_000000';

test('the client asks for the export with orientation and without clocks, with the token when there is one', async () => {
  const { fetch, seen } = fakeFetch(() => new Response('[Event "x"]\n\n1. e4 *\n'));
  let token: string | undefined;
  const client = lichessClient({ fetch, token: () => token });
  assert.equal(await client.studyPgn('AbCd1234'), '[Event "x"]\n\n1. e4 *\n');
  token = TOKEN;
  await client.studyPgn('AbCd1234');
  assert.equal(seen[0]!.url, 'https://lichess.org/api/study/AbCd1234.pgn?clocks=false&orientation=true');
  assert.deepEqual(seen[0]!.init, {});
  assert.deepEqual(seen[1]!.init, { headers: { Authorization: `Bearer ${TOKEN}` } });
});

test('the study list is read from /api/study/by/<user>', async () => {
  const { fetch, seen } = fakeFetch(() => new Response('{"id":"AbCd1234","name":"Rep"}\n{"id":"WxYz5678","name":"Other"}\n'));
  const list = await lichessClient({ fetch }).studies('some user');
  assert.deepEqual(list, [{ id: 'AbCd1234', name: 'Rep' }, { id: 'WxYz5678', name: 'Other' }]);
  assert.equal(seen[0]!.url, 'https://lichess.org/api/study/by/some%20user');
});

test('failures are sorted: refused token, missing or private, rate, network, server', async () => {
  const cases: [Response | Error, string, RegExp][] = [
    [new Response('', { status: 401 }), 'auth', /log in again/],
    [new Response('', { status: 404 }), 'missing', /private one needs you to log in/],
    [new Response('', { status: 403 }), 'missing', /log in/],
    [new Response('', { status: 429 }), 'rate', /slow down/],
    [new TypeError('Failed to fetch'), 'network', /didn't answer \(Failed to fetch\)/],
    [new Response('', { status: 502 }), 'server', /502/],
  ];
  for (const [answer, reason, message] of cases) {
    const { fetch } = fakeFetch(() => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    await assert.rejects(lichessClient({ fetch }).studyPgn('AbCd1234'), (e: unknown) => e instanceof LichessError && e.reason === reason && message.test(e.message));
  }
});

test('base64url without padding, and the S256 challenge as Node computes it', async () => {
  assert.equal(base64Url(new Uint8Array([251, 255, 191])), '-_-_');
  assert.equal(base64Url(new Uint8Array([1])), 'AQ');
  const verifier = 'a-verifier-of-forty-three-characters-000000';
  assert.equal(await codeChallenge(verifier), createHash('sha256').update(verifier).digest('base64url'));
});

const REDIRECT = 'https://dubious-moves.github.io/repworks/';

function lichessServer(options: { username?: string; tokenStatus?: number } = {}) {
  const exchanges: URLSearchParams[] = [];
  const server = fakeFetch(async (url, init) => {
    if (url === 'https://lichess.org/api/token' && init?.method === 'POST') {
      exchanges.push(new URLSearchParams(String(init.body)));
      if (options.tokenStatus) return new Response('{"error":"invalid_grant"}', { status: options.tokenStatus });
      return Response.json({ token_type: 'Bearer', access_token: TOKEN, expires_in: 31536000 });
    }
    if (url === 'https://lichess.org/api/account') return options.username ? Response.json({ username: options.username }) : new Response('', { status: 500 });
    if (url === 'https://lichess.org/api/token' && init?.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response('', { status: 404 });
  });
  return { ...server, exchanges };
}

test('a login: the verifier waits in origin storage, the callback exchanges the code, the token is kept', async () => {
  const storage = new MemoryStorage();
  const server = lichessServer({ username: 'Owner' });
  let now = 1_000_000;
  const auth = new LichessAuth({ clientId: REDIRECT, redirectUri: REDIRECT, storage, fetch: server.fetch, now: () => now });
  const go = new URL(await auth.start('#/import'));
  assert.equal(go.origin + go.pathname, 'https://lichess.org/oauth');
  const q = go.searchParams;
  assert.deepEqual([q.get('response_type'), q.get('client_id'), q.get('redirect_uri'), q.get('code_challenge_method'), q.get('scope')], ['code', REDIRECT, REDIRECT, 'S256', 'study:read']);
  const pending = JSON.parse(storage.getItem('repworks-lichess-pkce')!) as { verifier: string; state: string };
  assert.equal(q.get('state'), pending.state);
  assert.equal(q.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));

  // A fresh object, as in the window the redirect comes back to: only the storage is shared.
  const back = new LichessAuth({ clientId: REDIRECT, redirectUri: REDIRECT, storage, fetch: server.fetch, now: () => now });
  assert.deepEqual(await back.handleCallback(`${REDIRECT}?code=abc&state=${pending.state}`), { status: 'success', username: 'Owner', returnTo: '#/import' });
  assert.equal(server.exchanges[0]!.get('code_verifier'), pending.verifier);
  assert.equal(server.exchanges[0]!.get('code'), 'abc');
  assert.equal(server.exchanges[0]!.get('grant_type'), 'authorization_code');
  assert.equal(storage.getItem('repworks-lichess-pkce'), null);
  assert.equal(back.token(), TOKEN);
  assert.equal(back.username(), 'Owner');
  // A year later the token is gone.
  now += 31536000 * 1000 + 1;
  assert.equal(back.token(), undefined);
});

test('no callback, a denied login, a wrong state, a lost verifier and a refused code', async () => {
  const storage = new MemoryStorage();
  const server = lichessServer({ tokenStatus: 400 });
  const auth = new LichessAuth({ clientId: 'x', redirectUri: REDIRECT, storage, fetch: server.fetch });
  assert.deepEqual(await auth.handleCallback(REDIRECT), { status: 'none' });
  await auth.start('#/import');
  assert.deepEqual(await auth.handleCallback(`${REDIRECT}?error=access_denied`), { status: 'denied', returnTo: '#/import' });
  await auth.start('#/import');
  assert.equal((await auth.handleCallback(`${REDIRECT}?code=abc&state=wrong`)).status, 'error');
  const lost = await auth.handleCallback(`${REDIRECT}?code=abc&state=wrong`);
  assert.equal(lost.status === 'error' && /log in again/.test(lost.message), true);
  await auth.start('#/import');
  const state = (JSON.parse(storage.getItem('repworks-lichess-pkce')!) as { state: string }).state;
  const refused = await auth.handleCallback(`${REDIRECT}?code=abc&state=${state}`);
  assert.equal(refused.status === 'error' && /refused the login \(400\)/.test(refused.message), true);
  assert.equal(auth.token(), undefined);
  assert.equal(server.exchanges.length, 1);
});

test('without the account the login still stands; logging out revokes the token', async () => {
  const storage = new MemoryStorage();
  const server = lichessServer();
  const auth = new LichessAuth({ clientId: 'x', redirectUri: REDIRECT, storage, fetch: server.fetch });
  await auth.start('');
  const state = (JSON.parse(storage.getItem('repworks-lichess-pkce')!) as { state: string }).state;
  assert.deepEqual(await auth.handleCallback(`${REDIRECT}?code=abc&state=${state}`), { status: 'success', username: undefined, returnTo: '' });
  assert.equal(auth.token(), TOKEN);
  await auth.logOut();
  assert.equal(auth.token(), undefined);
  const revoke = server.seen.at(-1)!;
  assert.equal(revoke.init?.method, 'DELETE');
  assert.deepEqual(revoke.init?.headers, { Authorization: `Bearer ${TOKEN}` });
});
