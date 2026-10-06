// The Stockfish worker from the build, in the browser (PLAN.md §5.30): it starts from its
// hashed URLs, finds mate in one, and ends a search on `stop` (mistake-lab never sends one, for
// fear of a crash; Qchess does), then searches again. Checked in the container's Chromium.
import { test, expect } from '@playwright/test';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

test('the built worker answers mate in one, and a stop ends a search that a new one follows', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same Chromium as the desktop project');
  await page.goto(site.url);
  const result = await page.evaluate(async () => {
    const sw = await (await fetch('sw.js')).text();
    const engines = JSON.parse(/const __ENGINES__ = (\[.*?\]);/.exec(sw)![1]!) as string[];
    const js = new URL(engines.find((u) => u.endsWith('.js'))!, location.href).href;
    const wasm = new URL(engines.find((u) => u.includes('stockfish') && u.endsWith('.wasm'))!, location.href).href;
    const worker = new Worker(`${js}#${encodeURIComponent(wasm)}`);
    const seen: string[] = [];
    const waitFor = (test: (line: string) => boolean, ms: number) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out; last lines: ${seen.slice(-3).join(' | ')}`)), ms);
        const on = (e: MessageEvent<string>) => {
          if (typeof e.data !== 'string' || !test(e.data)) return;
          clearTimeout(timer);
          worker.removeEventListener('message', on);
          resolve(e.data);
        };
        worker.addEventListener('message', on);
      });
    worker.addEventListener('message', (e: MessageEvent<string>) => seen.push(e.data));
    worker.postMessage('uci');
    await waitFor((l) => l === 'uciok', 15000);
    worker.postMessage('isready');
    await waitFor((l) => l === 'readyok', 5000);
    worker.postMessage('position fen r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    worker.postMessage('go depth 10');
    const mate = await waitFor((l) => l.startsWith('bestmove'), 10000);
    worker.postMessage('position startpos');
    worker.postMessage('go infinite');
    await new Promise((r) => setTimeout(r, 1500));
    const t0 = performance.now();
    worker.postMessage('stop');
    const stopped = await waitFor((l) => l.startsWith('bestmove'), 3000);
    const stopMs = performance.now() - t0;
    worker.postMessage('position fen 3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1');
    worker.postMessage('go depth 8');
    const after = await waitFor((l) => l.startsWith('bestmove'), 10000);
    const deep = seen.filter((l) => l.startsWith('info depth')).length;
    worker.terminate();
    return { mate, stopped, stopMs, after, deep, name: seen.find((l) => l.startsWith('id name')) };
  });
  expect(result.name).toBe('id name Stockfish 18 Lite WASM');
  expect(result.mate).toBe('bestmove h5f7');
  expect(result.stopped).toMatch(/^bestmove \w{4}/);
  expect(result.stopMs).toBeLessThan(1000);
  expect(result.after).toBe('bestmove d8d1');
  expect(result.deep).toBeGreaterThan(10);
});
