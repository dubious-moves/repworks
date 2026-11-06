// The gather's loop (PLAN.md §5.42, §5.102, §5.116, §5.155) over a fake host: the requests, the
// store, the scoring, the files, the clock and the waits all injected, as the app's storm home and
// the cloud gather (scripts/storm-gather.ts) inject them.
//
// Controls (each assertion was seen to fail with the code changed, then the change undone):
// - the second pass made to walk the games again (`before` left out): "a gather: one game at every
//   line end first" and "overnight: pass after pass over older games" fail;
// - a failure overnight made to end the gather (`!g.overnight` read as always true): "overnight: a
//   failure is waited out" fails;
// - the store-full check counting the done cards: "overnight: the store full of positions not
//   answered well ends the night" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { STORM as C, type StormConfig } from '../../../../src/core/storm/config.ts';
import type { ScoredList, ScoredMove } from '../../../../src/core/storm/grade.ts';
import { GATHER_STOPPED, GatherEnd, runGather, type Gathering, type GatherHost, type GatherScope } from '../../../../src/core/storm/gather.ts';
import type { HarvestIo, StoredPosition } from '../../../../src/core/storm/harvest.ts';
import { decisions, frontiers, stormLines } from '../../../../src/core/storm/sources.ts';
import { positionOf, uciToSan } from '../../../../src/core/storm/walk.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';

const LADDER = [0, -12, -40, -60, -130, -200];
function scoredFor(fen: string, base: number): ScoredList {
  const pos = positionOf(fen)!;
  const ucis: string[] = [];
  for (const [from, dests] of pos.allDests()) for (const to of dests) ucis.push(standardUci(pos, { from, to }));
  const out: ScoredMove[] = [...new Set(ucis)]
    .sort()
    .slice(0, LADDER.length)
    .map((uci, i) => ({ uci, san: uciToSan(pos, uci), score: base + LADDER[i]! }));
  return out.sort((a, b) => b.score - a.score);
}

function scope(moves: string): GatherScope {
  const p = parseChapterFile(`[Orientation "white"]\n[ChapterName "Ruy"]\n\n${moves} *\n`, 'c1');
  if (!p.ok) throw new Error(p.reason);
  const lines = stormLines([{ sid: 'S1', chapter: p.chapter }]);
  const f = frontiers(lines, C);
  return { lines, frontiers: f.frontiers, decisions: decisions(lines).points, cont: f.cont };
}

// Four games through the line's end, each going on differently; the ids are the PGN's GameId.
const TAILS = ['a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5', 'Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6', 'a6 4. Bxc6 dxc6 5. O-O f6 6. d4 exd4', 'Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+'];
const IDS = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD'];
const pgnOf = (id: string) => `[Event "x"]\n[GameId "${id}"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 ${TAILS[IDS.indexOf(id)]} 1-0\n`;

interface Fake {
  host: GatherHost;
  store: Map<string, StoredPosition>;
  log: string[];
  shows: Gathering[];
  stop(): void;
}

/** A host keeping everything in memory, its explorer naming `ids(until)` at every line end. */
function fake(o: { ids?: (until: string | undefined) => string[]; done?: Set<string>; fail?: (n: number, until: string | undefined) => Error | null; stopAfter?: number } = {}): Fake {
  const store = new Map<string, StoredPosition>();
  const log: string[] = [];
  const shows: Gathering[] = [];
  let stopped = false;
  let now = Date.UTC(2026, 10, 6, 22);
  let asked = 0;
  let walks = 0;
  const ids = o.ids ?? (() => IDS);
  const host: GatherHost = {
    io: (count, until, strict) => {
      const io: HarvestIo = {
        explorer: async (fen) => {
          count('explorer');
          const e = o.fail?.(++asked, until);
          if (e) {
            if (strict) throw e;
            return null;
          }
          log.push(`explorer ${until ?? 'now'} ${fen.split(' ')[0]}`);
          return { total: 1000, moves: [], gameIds: ids(until) };
        },
        pgns: async (list) => {
          count('games');
          log.push(`pgns ${list.join(',')}`);
          return list.map(pgnOf).join('\n');
        },
        cdb: async (fen) => (count('chessdb'), Object.assign(scoredFor(fen, 20), { source: 'cdb' as const })),
        engine: async (fen, _lines, depth) => (count('searches'), Object.assign(scoredFor(fen, 20), { source: 'sf' as const, depth })),
        rnd: () => 0,
      };
      return io;
    },
    positions: async () => [...store.values()],
    add: async (fresh) => {
      let n = 0;
      for (const p of fresh) if (!store.has(p.card)) (store.set(p.card, p), n++);
      return n;
    },
    done: () => o.done ?? new Set(),
    score: async (passMs) => void log.push(passMs === undefined ? 'score to the end' : `score ${passMs}`),
    share: async () => void log.push(`share ${store.size}`),
    show: (g) => void shows.push(g),
    refresh: async () => {
      walks++;
      now += 60_000;
      if (o.stopAfter !== undefined && walks >= o.stopAfter) stopped = true;
    },
    stopped: () => stopped,
    wait: async (ms) => {
      log.push(`wait ${ms}`);
      if (stopped) throw GATHER_STOPPED;
      now += ms;
    },
    now: () => now,
    rnd: () => 0,
  };
  return { host, store, log, shows, stop: () => (stopped = true) };
}

const ends: StormConfig = C;

test('a gather: one game at every line end first, then the rest of its games; positions kept once; written out at the end', async () => {
  const s = scope('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  assert.equal(s.frontiers.length, 1);
  const f = fake();
  const g = await runGather(s, { source: 'ends', overnight: false, config: ends }, f.host);
  assert.equal(g.running, false);
  assert.equal(g.note, 'Every line end and reply walked.');
  // The line end, then its second pass: of grew by one.
  assert.equal(g.of, 2);
  assert.equal(g.frontiers, 2);
  const exports = f.log.filter((l) => l.startsWith('pgns'));
  assert.equal(exports.length, 2);
  assert.equal(exports[0]!.split(' ')[1]!.split(',').length, 1, 'the first pass walks one game');
  const first = exports[0]!.split(' ')[1]!;
  assert.ok(!exports[1]!.includes(first), 'the second pass walks the games not walked yet');
  assert.equal(exports[1]!.split(' ')[1]!.split(',').length, 3);
  assert.ok(f.store.size > 0);
  assert.equal(g.stored, f.store.size);
  assert.equal(f.log.at(-1), `share ${f.store.size}`);
  assert.ok(g.spent.explorer === 2 && g.spent.games === 2 && g.spent.chessdb > 0);
  // Every step shown, the last one ended.
  assert.ok(f.shows.length >= 3 && f.shows.at(-1)!.running === false);
});

test('a scope with nothing to walk says so', async () => {
  // A line under 4 plies has no line end.
  const s = scope('1. e4 e5');
  const g = await runGather(s, { source: 'ends', overnight: false, config: ends }, fake().host);
  assert.equal(g.of, 0);
  assert.equal(g.note, 'Nothing to walk: no line in this scope ends past 4 plies.');
});

test('Stop: the gather ends after the walk under way, and what it kept is written out', async () => {
  const s = scope('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const f = fake({ stopAfter: 1 });
  const g = await runGather(s, { source: 'ends', overnight: false, config: ends }, f.host);
  assert.equal(g.note, 'Stopped.');
  assert.equal(g.frontiers, 1);
  assert.match(f.log.at(-1)!, /^share /);
});

test('a failure ends a gather that is not overnight', async () => {
  const s = scope('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const f = fake();
  f.host.io = ((io) => (count, until, strict) => ({ ...io(count, until, strict), pgns: async () => Promise.reject(new Error('HTTP 500')) }))(f.host.io);
  const g = await runGather(s, { source: 'ends', overnight: false, config: ends }, f.host);
  assert.equal(g.note, 'The gather stopped: HTTP 500');
});

test('overnight: pass after pass over older games, only games not walked, scored between passes and at the end', async () => {
  const s = scope('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  // Each window names the four games of today plus one of its own.
  const f = fake({ ids: (until) => (until ? [...IDS.slice(0, 3), 'DDDDDDDD'] : IDS.slice(0, 2)) });
  const o = { ...ends, overnightPasses: 3 };
  const g = await runGather(s, { source: 'ends', overnight: true, config: o }, f.host);
  assert.match(g.note, /^Every pass walked, back to \d{4}-\d{2}\.$/);
  const windows = f.log.filter((l) => l.startsWith('explorer')).map((l) => l.split(' ')[1]);
  assert.deepEqual(windows, ['now', 'now', '2026-07', '2026-03']);
  const exports = f.log.filter((l) => l.startsWith('pgns')).map((l) => l.split(' ')[1]!.split(','));
  // Today's two games over the first pass's two walks; then the window's two not walked, then none.
  assert.deepEqual(exports.map((e) => e.length), [1, 1, 2]);
  assert.deepEqual(new Set(exports.flat()).size, 4);
  const scores = f.log.filter((l) => l.startsWith('score'));
  assert.equal(scores.length, 3);
  assert.match(scores[0]!, /^score \d+$/);
  assert.equal(scores.at(-1), 'score to the end');
  assert.equal(g.overnight?.pass, 3);
});

test('overnight: a failure is waited out (1 min, then 2), then the walk tried again; a login wanted ends it', async () => {
  const s = scope('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const f = fake({ fail: (n) => (n === 1 || n === 2 ? new Error('HTTP 502') : null) });
  const o = { ...ends, overnightPasses: 1 };
  const g = await runGather(s, { source: 'ends', overnight: true, config: o }, f.host);
  assert.deepEqual(f.log.filter((l) => l.startsWith('wait')), ['wait 60000', 'wait 120000']);
  assert.equal(g.overnight?.errors, 2);
  assert.ok(f.store.size > 0);
  const ended = fake({ fail: () => new GatherEnd('a Lichess login is wanted') });
  const e = await runGather(s, { source: 'ends', overnight: true, config: o }, ended.host);
  assert.equal(e.note, 'The gather stopped: a Lichess login is wanted');
  assert.equal(ended.log.filter((l) => l.startsWith('wait')).length, 0);
});

test('overnight: the store full of positions not answered well ends the night; done ones don’t count', async () => {
  const s = scope('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const f = fake();
  const g = await runGather(s, { source: 'ends', overnight: true, config: { ...ends, storeMax: 1, overnightPasses: 3 } }, f.host);
  assert.equal(g.note, 'The store is full: 1 positions not yet answered well.');
  const cards = new Set<string>();
  const first = fake();
  await runGather(s, { source: 'ends', overnight: false, config: ends }, first.host);
  for (const c of first.store.keys()) cards.add(c);
  const spared = fake({ done: cards });
  const h = await runGather(s, { source: 'ends', overnight: true, config: { ...ends, storeMax: 1, overnightPasses: 2 } }, spared.host);
  assert.match(h.note, /^Every pass walked/);
});
