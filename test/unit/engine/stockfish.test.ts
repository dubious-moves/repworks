// The vendored Stockfish builds (PLAN.md §5.30; 19 since §5.75), run under Node through the core
// search: its command-line mode reads UCI on stdin. Copied with a .cjs name beside its wasm (it
// finds the wasm by its own name, and the repo's package type would make a .js an ES module).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { positionKeyOf } from '../../../src/core/chess/positionKey.ts';
import { createSearch, type Analysis, type Search, type SearchRequest } from '../../../src/core/engine/search.ts';
import { pvToSan } from '../../../src/core/engine/uci.ts';

const VENDOR = join(import.meta.dirname, '..', '..', '..', 'vendor', 'stockfish');

for (const version of [18, 19]) {
  describe(`Stockfish ${version}`, () => {
    let dir: string;
    let engine: ChildProcessWithoutNullStreams;
    let search: Search;
    let waiting: ((a: Analysis) => void) | undefined;
    let lines: string[] = [];

    before(async () => {
      dir = mkdtempSync(join(tmpdir(), 'repworks-sf-'));
      copyFileSync(join(VENDOR, `stockfish-${version}-lite-single.js`), join(dir, 'sf.cjs'));
      copyFileSync(join(VENDOR, `stockfish-${version}-lite-single.wasm`), join(dir, 'sf.wasm'));
      engine = spawn(process.execPath, [join(dir, 'sf.cjs')]);
      const ready = new Promise<void>((resolve) => {
        createInterface({ input: engine.stdout }).on('line', (line) => {
          lines.push(line);
          if (line === 'readyok') resolve();
          search?.receive(line);
        });
      });
      engine.stdin.write('uci\nisready\n');
      await ready;
      search = createSearch({
        send: (c) => engine.stdin.write(c + '\n'),
        now: () => performance.now(),
        onUpdate: (a) => {
          if (a.done && waiting) {
            const w = waiting;
            waiting = undefined;
            w(a);
          }
        },
      });
    });

    after(() => {
      engine.stdin.write('quit\n');
      engine.kill();
      rmSync(dir, { recursive: true, force: true });
    });

    function req(fen: string, depth: number, linesWanted = 1): SearchRequest {
      const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
      let legal = 0;
      for (const [, d] of pos.allDests()) legal += d.size();
      return { fen, key: positionKeyOf(pos), turn: pos.turn, depth, movetime: Infinity, lines: linesWanted, legal };
    }

    function analyse(fen: string, depth: number, linesWanted = 1): Promise<Analysis> {
      return new Promise((resolve) => {
        waiting = resolve;
        search.analyse(req(fen, depth, linesWanted));
      });
    }

    const san = (a: Analysis, i = 0) => pvToSan(Chess.fromSetup(parseFen(a.fen).unwrap()).unwrap(), a.lines[i]!.pv);

    test(`it is Stockfish ${version} lite`, () => {
      assert.ok(lines.includes(`id name Stockfish ${version} Lite WASM`));
    });

    test('mate in one, for White and for Black, scored from White’s side', async () => {
      const scholar = await analyse('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 10);
      assert.deepEqual([san(scholar)[0], scholar.lines[0]!.score], ['Qxf7#', { mate: 1 }]);
      const black = await analyse('3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', 10);
      assert.deepEqual([san(black)[0], black.lines[0]!.score], ['Rd1#', { mate: -1 }]);
    });

    test('mate in two', async () => {
      const a = await analyse('r5k1/5ppp/8/8/8/8/1Q3PPP/1R4K1 w - - 0 1', 12);
      assert.deepEqual(san(a), ['Qb8+', 'Rxb8', 'Rxb8#']);
      assert.deepEqual(a.lines[0]!.score, { mate: 2 });
    });

    test('a hanging queen is taken; three lines come best first', async () => {
      const a = await analyse('rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3', 12, 3);
      assert.equal(san(a)[0], 'Nxd4');
      assert.equal(a.lines.length, 3);
      assert.ok(a.lines[0]!.score.cp! > 300);
      const cps = a.lines.map((l) => l.score.cp!);
      assert.deepEqual([...cps].sort((x, y) => y - x), cps);
    });

    test('a position changed mid-search: stopped, and the new one answered', async () => {
      search.analyse(req('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 40));
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(search.current()!.done, false);
      const a = await analyse('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 8);
      assert.equal(san(a)[0], 'Qxf7#');
    });
  });
}
