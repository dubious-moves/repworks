// GitHub's REST API over fetch, shared by both remotes (PLAN.md §4.9): the token, no HTTP cache
// (ETags are sent and read by hand, so a 304 reaches the code and the browser's cache never
// answers with a stale head), a timeout, and GitHub's errors sorted into RemoteError reasons.
import { RemoteError } from '../core/sync/ports.ts';

export interface GithubConfig {
  /** owner/name */
  repo: string;
  branch: string;
  token: string;
  /** Defaults to the global fetch; tests pass a fake. */
  fetch?: typeof fetch;
  /** Defaults to https://api.github.com. */
  api?: string;
  /** Milliseconds; defaults to 30 s. */
  timeoutMs?: number;
  /** Defaults to Date.now, for reading x-ratelimit-reset. */
  now?: () => number;
  /** Told of every request, for the debug panel's counts. */
  onRequest?: (info: RequestInfo) => void;
  /** Blob reads through REST: at most this many at once and a second (GitHub allows 900 points a minute). */
  pace?: { concurrent: number; perSecond: number };
}

export interface RequestInfo {
  method: string;
  /** The path without the host and query, the repo replaced by {repo}. */
  route: string;
  status: number | 'network';
  ms: number;
  rateRemaining?: number;
  rateResource?: string;
}

export interface Answer {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

const API = 'https://api.github.com';

export async function call(
  config: GithubConfig,
  method: string,
  path: string,
  options: { body?: unknown; accept?: string; etag?: string; expect?: readonly number[] } = {},
): Promise<Answer> {
  const doFetch = config.fetch ?? fetch;
  const started = Date.now();
  const route = path.split('?')[0]!.replace(`/repos/${config.repo}/`, '/repos/{repo}/');
  const headers: Record<string, string> = {
    Accept: options.accept ?? 'application/vnd.github+json',
    Authorization: `Bearer ${config.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.etag) headers['If-None-Match'] = options.etag;
  let response: Response;
  let text: string;
  try {
    response = await doFetch(`${config.api ?? API}${path}`, {
      method,
      headers,
      cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
    });
    // Decoded by hand to keep a byte-order mark, so a blob's text hashes back to its SHA.
    text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
  } catch (error) {
    config.onRequest?.({ method, route, status: 'network', ms: Date.now() - started });
    throw new RemoteError('network', `no answer from GitHub (${(error as Error)?.name ?? 'error'}: ${(error as Error)?.message ?? String(error)})`);
  }
  const remaining = response.headers.get('x-ratelimit-remaining');
  const info: RequestInfo = { method, route, status: response.status, ms: Date.now() - started };
  if (remaining !== null) info.rateRemaining = Number(remaining);
  const resource = response.headers.get('x-ratelimit-resource');
  if (resource !== null) info.rateResource = resource;
  config.onRequest?.(info);
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  const answer = { status: response.status, headers: response.headers, text, json };
  const ok = options.expect ?? [200, 201];
  if (ok.includes(response.status)) return answer;
  throw failureOf(config, answer);
}

/** The message GitHub gives with an error, if any. */
export const messageOf = (answer: Answer) => {
  const m = (answer.json as { message?: unknown } | undefined)?.message;
  return typeof m === 'string' ? m : answer.text.slice(0, 200);
};

/** Sorts a failed answer into a RemoteError (§4.9's error rules). */
export function failureOf(config: GithubConfig, answer: Answer): RemoteError {
  const { status, headers } = answer;
  const message = messageOf(answer);
  const options = { status };
  if (status === 401) return new RemoteError('auth', 'the GitHub token is expired or revoked', options);
  if (status === 403 || status === 429) {
    const retryAfter = headers.get('retry-after');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (retryAfter !== null && Number.isFinite(Number(retryAfter))) {
      return new RemoteError('rate', `GitHub's rate limit: ${message}`, { status, retryAfterMs: Number(retryAfter) * 1000 });
    }
    if (remaining === '0' && reset !== null && Number.isFinite(Number(reset))) {
      const wait = Math.max(1000, Number(reset) * 1000 - (config.now ?? Date.now)());
      return new RemoteError('rate', `GitHub's rate limit: ${message}`, { status, retryAfterMs: wait });
    }
    if (status === 429 || /rate limit/i.test(message)) return new RemoteError('rate', `GitHub's rate limit: ${message}`, options);
    return new RemoteError('setup', `GitHub refused (${status}): ${message}. The token needs Contents read and write on ${config.repo}.`, options);
  }
  if (status === 404) return new RemoteError('setup', `not found: the repo ${config.repo} or its branch ${config.branch} doesn't exist, or the token can't see it`, options);
  if (status === 409 && /empty/i.test(message)) return new RemoteError('setup', `the data repo ${config.repo} is empty: add a README on GitHub, then sync again`, options);
  if (status >= 500) return new RemoteError('server', `GitHub answered ${status}: ${message}`, options);
  return new RemoteError('setup', `GitHub answered ${status}: ${message}`, options);
}

export interface RepoInfo {
  defaultBranch: string;
  private: boolean;
  /** Whether the token can write (push permission). */
  canWrite: boolean | undefined;
}

/** The data repo's default branch and visibility, read once at setup. */
export async function repoInfo(config: Omit<GithubConfig, 'branch'>): Promise<RepoInfo> {
  const answer = await call({ ...config, branch: '(default)' }, 'GET', `/repos/${config.repo}`);
  const j = answer.json as { default_branch?: unknown; private?: unknown; permissions?: { push?: unknown } } | undefined;
  if (typeof j?.default_branch !== 'string') throw new RemoteError('server', 'GitHub answered without the default branch');
  return { defaultBranch: j.default_branch, private: j.private === true, canWrite: typeof j.permissions?.push === 'boolean' ? j.permissions.push : undefined };
}

/** UTF-8 text as base64 (GraphQL's file contents). */
export function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Runs `task` over `items` with at most `limit` at once, starting at most `perSecond` a second. */
export async function paced<T, R>(items: readonly T[], limit: number, perSecond: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let started = 0;
  const begin = Date.now();
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const due = begin + (started++ / perSecond) * 1000;
      const wait = due - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      results[i] = await task(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
