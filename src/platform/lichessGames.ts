// The user's games from Lichess's own export (PLAN.md §5.51): `GET /api/games/user/<name>` as
// NDJSON, with evals, clocks and the opening, since the newest game kept. It answers a web page
// with or without the login (checked live, 2026-10-07: `Access-Control-Allow-Origin: *`, its
// preflight allowing `Authorization`); the login makes the stream faster. A line cut short (the
// stream stopped) is dropped, not fatal.
import type { GistFetch } from './gist.ts';

export const LICHESS = 'https://lichess.org';

export class LichessGamesError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface UserGamesQuery {
  name: string;
  /** Games played after this time (ms since the epoch). */
  since?: number;
  max: number;
  token?: string;
}

export function userGamesUrl(q: UserGamesQuery, base = LICHESS): string {
  const p = new URLSearchParams({ max: String(q.max), moves: 'true', evals: 'true', clocks: 'true', opening: 'true' });
  if (q.since !== undefined) p.set('since', String(q.since + 1));
  return `${base}/api/games/user/${encodeURIComponent(q.name)}?${p}`;
}

/** The games as JSON objects, newest first (Lichess's order); lines that won't parse are counted. */
export async function userGames(q: UserGamesQuery, get: GistFetch = (url, init) => fetch(url, init), base = LICHESS): Promise<{ games: unknown[]; badLines: number }> {
  const headers: Record<string, string> = { Accept: 'application/x-ndjson' };
  if (q.token) headers['Authorization'] = `Bearer ${q.token}`;
  const res = await get(userGamesUrl(q, base), { headers });
  if (!res.ok) {
    const why = res.status === 404 ? `Lichess has no user ${q.name}.` : res.status === 429 ? 'Lichess asks to wait a minute (HTTP 429).' : res.status === 401 ? 'Lichess refused the login: log in again.' : `Lichess answered HTTP ${res.status}.`;
    throw new LichessGamesError(why, res.status);
  }
  const games: unknown[] = [];
  let badLines = 0;
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    try {
      games.push(JSON.parse(line));
    } catch {
      badLines++;
    }
  }
  return { games, badLines };
}
