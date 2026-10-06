// A fake Lichess explorer and ChessDB for the browser (PLAN.md §5.23), served through request
// interception with the CORS headers both send. Every page that opens a chapter gets one (through
// serveGithub), so the explorer panel never reaches the network in tests; specs about the
// explorer fill in its positions.
import type { Page } from '@playwright/test';

export interface FakeMove {
  san: string;
  uci?: string;
  white?: number;
  draws?: number;
  black?: number;
  averageRating?: number;
}

export interface FakeExplorer {
  /** Lichess's and Masters' games by the FEN's first four fields. */
  games: Map<string, FakeMove[]>;
  /** ChessDB's moves by the FEN's first four fields: SAN and centipawns from the side to move. */
  evals: Map<string, [string, number][]>;
  /** Every request, as `explorer <url>` with its Authorization, or `chessdb <url>`. */
  requests: { url: string; auth: string | undefined }[];
  /** Answer the next explorer requests with this status instead (e.g. 429). */
  refuse: number[];
}

export function fakeExplorer(): FakeExplorer {
  return { games: new Map(), evals: new Map(), requests: [], refuse: [] };
}

const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export async function serveExplorer(page: Page, fake: FakeExplorer = fakeExplorer()): Promise<FakeExplorer> {
  await page.route('https://explorer.lichess.org/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Accept,If-Modified-Since,Cache-Control,X-Requested-With,Authorization', 'access-control-allow-methods': 'GET,OPTIONS' } });
    }
    const url = new URL(request.url());
    const auth = request.headers()['authorization'];
    fake.requests.push({ url: request.url(), auth });
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (!auth) return route.fulfill({ status: 401, headers, body: '{"error":"No such token"}' });
    const status = fake.refuse.shift();
    if (status) return route.fulfill({ status, headers, body: '{}' });
    const moves = (fake.games.get(key(url.searchParams.get('fen') ?? '')) ?? []).map((m) => ({ uci: m.uci ?? m.san, san: m.san, white: m.white ?? 0, draws: m.draws ?? 0, black: m.black ?? 0, ...(m.averageRating ? { averageRating: m.averageRating } : {}) }));
    const sum = (k: 'white' | 'draws' | 'black') => moves.reduce((n, m) => n + m[k], 0);
    await route.fulfill({ status: 200, headers, body: JSON.stringify({ white: sum('white'), draws: sum('draws'), black: sum('black'), moves, topGames: [], recentGames: [] }) });
  });
  await page.route('https://www.chessdb.cn/**', async (route) => {
    const url = new URL(route.request().url());
    fake.requests.push({ url: route.request().url(), auth: undefined });
    const known = fake.evals.get(key(url.searchParams.get('board') ?? ''));
    const body = known ? { status: 'ok', moves: known.map(([san, score]) => ({ uci: san, san, score })) } : { status: 'unknown' };
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return fake;
}

/** A Lichess login on this device, as the OAuth flow leaves it (§4.10). */
export async function lichessLogin(page: Page, token = 'lip_e2e'): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('repworks-lichess', JSON.stringify({ token: t, username: 'tester' })), token);
}

/**
 * A stand-in for q_extension's `explorerdb serve` with the CORS change TESTING.md gives (§5.25): a
 * real HTTP server on another port, answering /info and /lichess like it, with
 * Access-Control-Allow-Origin for the allowed origin only, and 204 to a preflight.
 */
export async function serveLocalExplorer(fake: FakeExplorer, allow: string): Promise<{ address: string; close(): Promise<void> }> {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    const cors: Record<string, string> = origin === allow ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(origin === allow ? 204 : 405, { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Private-Network': 'true' });
      return void res.end();
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    fake.requests.push({ url: `local ${url.pathname}${url.search}`, auth: req.headers.authorization });
    let body: unknown;
    if (url.pathname === '/info') {
      body = { id: 'lichess_db_standard_rated_2026-09.pgn.zst@2026-10-01T08:00:00Z', source: 'lichess_db_standard_rated_2026-09.pgn.zst', created: '2026-10-01T08:00:00Z', filter: { speeds: ['blitz', 'rapid'], ratings: [1800, 2000] }, plies: 24, minGames: 5, positions: 12345, games: 67890 };
    } else {
      const moves = (fake.games.get(key(url.searchParams.get('fen') ?? '')) ?? []).map((m) => ({ uci: m.uci ?? m.san, san: m.san, white: m.white ?? 0, draws: m.draws ?? 0, black: m.black ?? 0 }));
      const sum = (k: 'white' | 'draws' | 'black') => moves.reduce((n, m) => n + m[k], 0);
      body = { white: sum('white'), draws: sum('draws'), black: sum('black'), moves, topGames: [], recentGames: [] };
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { address: `127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
