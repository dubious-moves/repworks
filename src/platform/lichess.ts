// Lichess over fetch (PLAN.md §4.10): the Lichess port for import, and the OAuth login.
//
// The login is PKCE with a redirect, scope study:read, ported from puzzle-explorer's
// lib/lichessAuth.js with one change (D9): the verifier and state go in localStorage, not
// sessionStorage, because on Android the redirect may come back in a Chrome Custom Tab rather
// than the installed app's window, and only origin storage is shared between them. The token is
// kept per device in localStorage, never in a repo.
import { LichessError, parseStudyList, studyExportPath, type Lichess, type LichessStudyInfo } from '../core/import/lichess.ts';

export const LICHESS = 'https://lichess.org';

type Fetch = typeof fetch;

export interface LichessClientOptions {
  /** The token for private studies, read at each call. */
  token?: () => string | undefined;
  fetch?: Fetch;
  base?: string;
}

export function lichessClient(options: LichessClientOptions = {}): Lichess {
  const base = options.base ?? LICHESS;
  const call = async (path: string, what: string): Promise<string> => {
    const token = options.token?.();
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(base + path, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    } catch (error) {
      throw new LichessError('network', `Lichess didn't answer (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (response.ok) return response.text();
    if (response.status === 401) throw new LichessError('auth', 'Lichess refused the login: log in again.');
    if (response.status === 403 || response.status === 404) {
      throw new LichessError('missing', token ? `Lichess has no ${what} you can see there.` : `Lichess has no public ${what} there. A private one needs you to log in with Lichess.`);
    }
    if (response.status === 429) throw new LichessError('rate', 'Lichess asks to slow down: try again in a minute.');
    throw new LichessError('server', `Lichess answered ${response.status}.`);
  };
  return {
    studyPgn: (id) => call(studyExportPath(id), 'study'),
    studies: async (username): Promise<LichessStudyInfo[]> => parseStudyList(await call(`/api/study/by/${encodeURIComponent(username)}`, 'study list')),
  };
}

// ---- OAuth -------------------------------------------------------------------------------------

export interface AuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LichessAuthOptions {
  /** Shown by Lichess on its consent page; any string is accepted. */
  clientId: string;
  /** Where Lichess sends the browser back: the site's own address. */
  redirectUri: string;
  storage: AuthStorage;
  fetch?: Fetch;
  now?: () => number;
  base?: string;
}

interface TokenRecord {
  token: string;
  /** Milliseconds since the epoch; absent when Lichess didn't say. */
  expiresAt?: number;
  username?: string;
}

interface Pending {
  verifier: string;
  state: string;
  /** The app's hash route to go back to. */
  returnTo: string;
}

export type CallbackResult =
  | { status: 'none' }
  | { status: 'success'; username: string | undefined; returnTo: string }
  | { status: 'denied'; returnTo: string }
  | { status: 'error'; message: string; returnTo: string };

const TOKEN_KEY = 'repworks-lichess';
const PENDING_KEY = 'repworks-lichess-pkce';

export function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const randomString = (bytes: number) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function codeChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export class LichessAuth {
  private readonly o: Required<LichessAuthOptions>;

  constructor(options: LichessAuthOptions) {
    this.o = { fetch: (...args) => fetch(...args), now: () => Date.now(), base: LICHESS, ...options };
  }

  private load<T>(key: string): T | undefined {
    try {
      const raw = this.o.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  private record(): TokenRecord | undefined {
    const r = this.load<TokenRecord>(TOKEN_KEY);
    if (!r || typeof r.token !== 'string' || !r.token) return undefined;
    if (r.expiresAt !== undefined && r.expiresAt < this.o.now()) {
      this.o.storage.removeItem(TOKEN_KEY);
      return undefined;
    }
    return r;
  }

  token(): string | undefined {
    return this.record()?.token;
  }

  username(): string | undefined {
    return this.record()?.username;
  }

  /** Where to send the browser to log in. The verifier stays here, in origin storage. */
  async start(returnTo: string): Promise<string> {
    const pending: Pending = { verifier: randomString(32), state: randomString(16), returnTo };
    this.o.storage.setItem(PENDING_KEY, JSON.stringify(pending));
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.o.clientId,
      redirect_uri: this.o.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: await codeChallenge(pending.verifier),
      scope: 'study:read',
      state: pending.state,
    });
    return `${this.o.base}/oauth?${params}`;
  }

  /**
   * Finishes a login when `url` is Lichess's redirect back (?code=…&state=…, or ?error=…). The
   * caller takes those parameters out of the address bar first, so a reload can't replay them.
   */
  async handleCallback(url: string): Promise<CallbackResult> {
    const params = new URL(url).searchParams;
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return { status: 'none' };
    const pending = this.load<Pending>(PENDING_KEY);
    this.o.storage.removeItem(PENDING_KEY);
    const returnTo = pending?.returnTo ?? '';
    if (error) return error === 'access_denied' ? { status: 'denied', returnTo } : { status: 'error', message: params.get('error_description') ?? error, returnTo };
    if (!pending?.verifier) return { status: 'error', message: 'the login started somewhere this page can’t see: log in again', returnTo };
    if (params.get('state') !== pending.state) return { status: 'error', message: 'the answer from Lichess doesn’t match the login started here: log in again', returnTo };
    let data: { access_token?: unknown; expires_in?: unknown };
    try {
      const response = await this.o.fetch(`${this.o.base}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, code_verifier: pending.verifier, redirect_uri: this.o.redirectUri, client_id: this.o.clientId }).toString(),
      });
      if (!response.ok) return { status: 'error', message: `Lichess refused the login (${response.status}): ${(await response.text()).slice(0, 200)}`, returnTo };
      data = (await response.json()) as typeof data;
    } catch (e) {
      return { status: 'error', message: `Lichess didn't answer (${e instanceof Error ? e.message : String(e)})`, returnTo };
    }
    if (typeof data.access_token !== 'string') return { status: 'error', message: 'Lichess answered without a token', returnTo };
    const record: TokenRecord = { token: data.access_token };
    if (typeof data.expires_in === 'number') record.expiresAt = this.o.now() + data.expires_in * 1000;
    // The username, for the study list; the login stands without it.
    try {
      const account = await this.o.fetch(`${this.o.base}/api/account`, { headers: { Authorization: `Bearer ${record.token}` } });
      if (account.ok) {
        const username = ((await account.json()) as { username?: unknown }).username;
        if (typeof username === 'string') record.username = username;
      }
    } catch {
      // without a username: the study list asks for one
    }
    this.o.storage.setItem(TOKEN_KEY, JSON.stringify(record));
    return { status: 'success', username: record.username, returnTo };
  }

  /** Forgets the token here, and revokes it on Lichess (best effort). */
  async logOut(): Promise<void> {
    const token = this.token();
    this.o.storage.removeItem(TOKEN_KEY);
    if (!token) return;
    try {
      await this.o.fetch(`${this.o.base}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // gone here; Lichess drops unused tokens itself
    }
  }
}
