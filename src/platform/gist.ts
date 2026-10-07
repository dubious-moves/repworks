// A gist's files (PLAN.md §5.51, §5.64): mistake-lab's Gist, read-only. `GET /gists/<id>` needs
// no token for a secret gist (its ID is the secret; a fine-grained token's Gists permission covers
// writes only); the API answers any origin. A file over a megabyte comes back truncated and is
// read again from its `raw_url`, without a token, as mistake-lab's page does. The ETag is kept, so
// an unchanged gist answers 304.

export interface FetchAnswer {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type GistFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchAnswer>;

export interface GistFileInfo {
  name: string;
  size: number;
}

export type GistRead =
  | { status: 'unchanged' }
  | { status: 'ok'; etag?: string; updatedAt?: string; files: GistFileInfo[]; text(name: string): Promise<string | undefined> };

/** The gist's ID from what was typed: the ID itself, or a gist's address. */
export function gistId(typed: string): string | undefined {
  const t = typed.trim();
  const m = /^(?:https?:\/\/gist\.github\.com\/(?:[^/]+\/)?)?([0-9a-f]{20,40})\/?$/i.exec(t);
  return m ? m[1]!.toLowerCase() : undefined;
}

export class GistError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function readGist(id: string, options: { token?: string; etag?: string; get?: GistFetch } = {}): Promise<GistRead> {
  const get: GistFetch = options.get ?? ((url, init) => fetch(url, init));
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.etag) headers['If-None-Match'] = options.etag;
  const res = await get(`https://api.github.com/gists/${encodeURIComponent(id)}`, { headers });
  if (res.status === 304) return { status: 'unchanged' };
  if (!res.ok) {
    const why = res.status === 404 ? 'No gist has that ID.' : res.status === 401 ? 'GitHub refused the token.' : res.status === 403 || res.status === 429 ? 'GitHub’s rate limit: try again in a while.' : `GitHub answered HTTP ${res.status}.`;
    throw new GistError(why, res.status);
  }
  let body: { files?: Record<string, { size?: number; truncated?: boolean; content?: string; raw_url?: string }>; updated_at?: string };
  try {
    body = JSON.parse(await res.text());
  } catch {
    throw new GistError('GitHub’s answer isn’t JSON.', res.status);
  }
  const files = body.files ?? {};
  const out: GistRead = {
    status: 'ok',
    files: Object.entries(files).map(([name, f]) => ({ name, size: f.size ?? 0 })),
    async text(name: string) {
      const f = files[name];
      if (!f) return undefined;
      if (!f.truncated && typeof f.content === 'string') return f.content;
      if (!f.raw_url) return undefined;
      const raw = await get(f.raw_url);
      if (!raw.ok) throw new GistError(`The gist’s file ${name} answered HTTP ${raw.status}.`, raw.status);
      return raw.text();
    },
  };
  const etag = res.headers.get('ETag');
  if (etag) out.etag = etag;
  if (body.updated_at) out.updatedAt = body.updated_at;
  return out;
}
