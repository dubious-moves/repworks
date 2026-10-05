// The Lichess half of the spike (PLAN.md §4.2 item 4, and the OAuth redirect inside the
// installed app): PKCE with the verifier in localStorage, then a private study's export.
// Ported in miniature from puzzle-explorer's lib/lichessAuth.js; §4.10 builds the real one.
import { displayMode, record, secret } from './report.ts';

const LICHESS = 'https://lichess.org';
const PKCE_KEY = 'repworks-spike-lichess-pkce';
const TOKEN_KEY = 'repworks-spike-lichess-token';
const CLIENT_ID = 'repworks-spike';

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const redirectUri = () => location.origin + location.pathname;

export function lichessToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    const token = raw ? (JSON.parse(raw) as { token?: string }).token ?? null : null;
    secret(token);
    return token;
  } catch {
    return null;
  }
}

export async function startLogin(): Promise<void> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, startedAt: new Date().toISOString(), startedIn: displayMode() }));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: 'study:read',
    state,
  });
  location.href = `${LICHESS}/oauth?${params}`;
}

/** Completes a login when the page is the OAuth callback; records what happened either way. */
export async function handleCallback(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  const returnedState = url.searchParams.get('state');
  if (!code && !error) return;
  for (const p of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(p);
  history.replaceState(null, '', url.pathname + url.search + url.hash);

  let pkce: { verifier?: string; state?: string; startedIn?: string; startedAt?: string } = {};
  try {
    pkce = JSON.parse(localStorage.getItem(PKCE_KEY) ?? '{}') as typeof pkce;
  } catch {
    pkce = {};
  }
  localStorage.removeItem(PKCE_KEY);
  const where = { startedIn: pkce.startedIn ?? '(no verifier found in localStorage)', returnedIn: displayMode(), startedAt: pkce.startedAt };
  if (error) {
    record({ id: 'L1', title: 'Lichess OAuth: came back with an error', ok: false, detail: { ...where, error, description: errorDescription } });
    return;
  }
  if (!pkce.verifier) {
    record({ id: 'L1', title: 'Lichess OAuth: callback, but the verifier was not in localStorage', ok: false, detail: where });
    return;
  }
  if (returnedState !== pkce.state) {
    record({ id: 'L1', title: 'Lichess OAuth: the state that came back does not match', ok: false, detail: where });
    return;
  }
  const started = performance.now();
  const response = await fetch(`${LICHESS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, code_verifier: pkce.verifier, redirect_uri: redirectUri(), client_id: CLIENT_ID }),
  });
  const text = await response.text();
  let token: string | undefined;
  let expiresIn: number | undefined;
  try {
    const j = JSON.parse(text) as { access_token?: string; expires_in?: number };
    token = j.access_token;
    expiresIn = j.expires_in;
  } catch {
    token = undefined;
  }
  secret(token);
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, obtainedAt: new Date().toISOString(), obtainedIn: displayMode() }));
  record({
    id: 'L1',
    title: 'Lichess OAuth: PKCE round trip and token exchange',
    ok: response.ok && token !== undefined,
    ms: Math.round(performance.now() - started),
    detail: { ...where, status: response.status, expiresInDays: expiresIn ? Math.round(expiresIn / 86400) : undefined, body: token ? '(token received)' : text.slice(0, 500) },
  });
}

export async function runLichessChecks(studyInput: string, log: (line: string) => void): Promise<void> {
  const token = lichessToken();
  if (!token) {
    log('✗ Log in with Lichess first.');
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };
  log('… Lichess account');
  const account = await fetch(`${LICHESS}/api/account`, { headers: auth });
  const username = account.ok ? ((await account.json()) as { username?: string }).username : undefined;
  record({ id: 'L2', title: 'Lichess /api/account with the token', ok: account.ok, detail: { status: account.status, username } });
  log(`${account.ok ? '✓' : '✗'} account: ${username ?? account.status}`);

  if (username) {
    const list = await fetch(`${LICHESS}/api/study/by/${encodeURIComponent(username)}`, { headers: auth });
    const lines = (await list.text()).split('\n').filter(Boolean);
    record({ id: 'L3', title: 'Lichess: list your studies (private ones need the token)', ok: list.ok, detail: { status: list.status, studies: lines.length } });
    log(`${list.ok ? '✓' : '✗'} study list: ${lines.length}`);
  }

  const id = /(?:study\/)?([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(studyInput.trim())?.[1];
  if (!id) {
    log('✗ Enter a study URL or ID to test the export.');
    return;
  }
  const started = performance.now();
  const exported = await fetch(`${LICHESS}/api/study/${id}.pgn?clocks=false&orientation=true`, { headers: auth });
  const pgn = await exported.text();
  const games = pgn.split(/\n\n\n/).filter((g) => g.trim()).length;
  const orientation = [...pgn.matchAll(/^\[Orientation "(\w+)"\]$/gm)].map((m) => m[1]);
  record({
    id: 'L4',
    title: 'Lichess: export the study with orientation=true and the token',
    ok: exported.ok && orientation.length > 0,
    ms: Math.round(performance.now() - started),
    detail: { status: exported.status, bytes: pgn.length, chapters: games, orientations: orientation, firstHeaders: pgn.split('\n').filter((l) => l.startsWith('[')).slice(0, 12) },
  });
  log(`${exported.ok ? '✓' : '✗'} export: ${games} chapter(s), ${pgn.length} bytes`);
}

export async function revoke(log: (line: string) => void): Promise<void> {
  const token = lichessToken();
  localStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  const response = await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  record({ id: 'L5', title: 'Lichess: revoke the token', ok: response.status === 204, detail: { status: response.status } });
  log(`${response.status === 204 ? '✓' : '✗'} revoked`);
}
