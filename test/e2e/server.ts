// Serves the built site (dist/) under /repworks/, as GitHub Pages does, on a free port. Tests
// that need the site gone (offline starts) close it instead of emulating the network, so a
// pass can't come from a request that slipped through.
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = join(import.meta.dirname, '..', '..', 'dist');
const BASE = '/repworks/';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript; charset=utf-8',
  '.onnx': 'application/octet-stream',
};

export interface SiteServer {
  /** The site's root, ending in /repworks/. */
  url: string;
  /** Paths requested so far, in order. */
  requests: string[];
  /** Serves sw.js with this version instead of the built one: a new deploy, as the browser sees it. */
  setWorkerVersion(version: string): void;
  close(): Promise<void>;
}

export interface SiteOptions {
  /** A script served in place of the Stockfish build (a fake engine: test/e2e/engine.ts). */
  engine?: string;
  /**
   * The fake engine's lines for a position it has none scripted for (`fakeEngine`'s `ask`), as
   * [multipv, cp for the side to move, pv]; served at `__lines/<fen>`.
   */
  engineLines?: (fen: string) => [number, number, string][];
}

export async function serveSite(options: SiteOptions = {}): Promise<SiteServer> {
  const requests: string[] = [];
  let workerVersion: string | null = null;
  const server: Server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    requests.push(path);
    if (!path.startsWith(BASE)) return void res.writeHead(404).end();
    if (options.engineLines && path.startsWith(BASE + '__lines/')) {
      const lines = options.engineLines(decodeURIComponent(path.slice(BASE.length + '__lines/'.length)));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return void res.end(JSON.stringify(lines));
    }
    if (options.engine && /^engines\/stockfish-[^/]*\.js$/.test(path.slice(BASE.length))) {
      // Padded to the real file's length: the app checks a download's size against the build's.
      const real = (await readFile(join(DIST, normalize(path.slice(BASE.length))))).length;
      const body = Buffer.from(options.engine);
      const pad = real - body.length - 5;
      if (pad < 0) throw new Error('the fake engine is longer than the real one');
      res.writeHead(200, { 'content-type': TYPES['.js']!, 'cache-control': 'no-store' });
      return void res.end(Buffer.concat([body, Buffer.from(`\n/*${' '.repeat(pad)}*/`)]));
    }
    let file = normalize(path.slice(BASE.length));
    if (file === '.' || file.endsWith('/')) file = join(file, 'index.html');
    if (file.startsWith('..')) return void res.writeHead(403).end();
    try {
      let body: Buffer | string = await readFile(join(DIST, file));
      if (file === 'sw.js' && workerVersion !== null) {
        body = body.toString('utf8').replace(/^const __VERSION__ = "[0-9a-f]+";$/m, `const __VERSION__ = "${workerVersion}";`);
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('server has no address');
  return {
    url: `http://localhost:${address.port}${BASE}`,
    requests,
    setWorkerVersion: (version) => (workerVersion = version),
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) return resolve();
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
