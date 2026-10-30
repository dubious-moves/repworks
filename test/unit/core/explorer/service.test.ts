// The explorer worker's logic (PLAN.md §5.22): lookups for the panel and the Practical search, over
// a fake HTTP, a fake clock and a memory cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { createMemoryCache, sameEvals, TTL, type HttpResponse } from '../../../../src/core/explorer/providers.ts';
import { createExplorerService, PANEL_RECHECKS, type ExplorerConfig, type FromWorker } from '../../../../src/core/explorer/service.ts';
import type { ChessdbAnswer, MaiaMove } from '../../../../src/core/explorer/search.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CONFIG: ExplorerConfig = { token: 'tok', filter: { speeds: ['blitz'], ratings: [2000] }, local: '', analyse: false, options: { maxPly: 4 }, budget: 60 };

const json = (status: number, body: unknown): HttpResponse => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });

/** The first `n` legal moves of a position, in SAN, from a FEN of four or six fields. */
function legalSans(fen: string, n: number): { san: string; uci: string }[] {
  const pos = Chess.fromSetup(parseFen(fen.split(' ').length === 4 ? fen + ' 0 1' : fen).unwrap()).unwrap();
  const out: { san: string; uci: string }[] = [];
  for (const [from, tos] of pos.allDests()) {
    for (const to of tos) {
      if (out.length < n) out.push({ san: makeSan(pos, { from, to }), uci: '' });
    }
  }
  return out;
}

/**
 * A world where every position has two moves with games, and ChessDB knows them. `chessdb` answers
 * ChessDB in their place (the asks of that position so far, from 0); `sleep` waits in place of
 * the clock's jump (which it still makes when it resolves).
 */
function world(
  options: {
    explorer?: (url: string) => HttpResponse | Promise<HttpResponse>;
    chessdb?: (fen: string, asked: number) => unknown;
    sleep?: (ms: number) => Promise<void>;
    maia?: (fen: string, elo: number) => Promise<MaiaMove[] | null>;
    config?: Partial<ExplorerConfig>;
  } = {},
) {
  let t = 1_000_000;
  const urls: string[] = [];
  const auth: (string | undefined)[] = [];
  const posts: FromWorker[] = [];
  const cdbAsked = new Map<string, number>();
  const http = (url: string, init?: { headers?: Record<string, string> }): Promise<HttpResponse> => {
    urls.push(url);
    const fen = decodeURIComponent((/(?:fen|board)=([^&]+)/.exec(url) ?? [])[1] ?? '');
    if (url.startsWith('https://explorer.lichess.org')) {
      auth.push(init?.headers?.Authorization);
      if (options.explorer) return Promise.resolve(options.explorer(url));
      const moves = legalSans(fen, 2).map((m, i) => ({ uci: m.uci, san: m.san, white: 300 - 100 * i, draws: 200, black: 100 + 50 * i }));
      return Promise.resolve(json(200, { white: 900, draws: 400, black: 350, moves }));
    }
    if (options.chessdb) {
      const n = cdbAsked.get(fen) ?? 0;
      cdbAsked.set(fen, n + 1);
      return Promise.resolve(json(200, options.chessdb(fen, n)));
    }
    const moves = legalSans(fen, 2).map((m, i) => ({ uci: m.uci, san: m.san, score: 30 - 20 * i }));
    return Promise.resolve(json(200, { status: 'ok', moves }));
  };
  const service = createExplorerService({
    http,
    cache: createMemoryCache(() => t),
    now: () => t,
    sleep: (ms) =>
      (options.sleep ? options.sleep(ms) : Promise.resolve()).then(() => {
        t += ms;
      }),
    post: (m) => posts.push(m),
    ...(options.maia ? { maia: options.maia } : {}),
  });
  service.handle({ type: 'config', config: { ...CONFIG, ...options.config, options: { ...CONFIG.options, ...options.config?.options } } });
  return { service, urls, auth, posts, tick: (ms: number) => (t += ms) };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const explorerUrls = (urls: string[]) => urls.filter((u) => u.startsWith('https://explorer.lichess.org'));

test('a lookup: the games and ChessDB’s evals, asked once and then from the cache', async () => {
  const w = world();
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  await settle();
  const games = w.posts.find((m) => m.type === 'games' && m.id === 1);
  const evals = w.posts.find((m) => m.type === 'evals' && m.id === 1);
  assert.ok(games && 'games' in games && games.games.total === 1650);
  assert.ok(evals && 'evals' in evals && evals.evals.status === 'ok');
  assert.equal(explorerUrls(w.urls).length, 1);
  assert.match(explorerUrls(w.urls)[0]!, /\/lichess\?variant=standard&fen=.*&speeds=blitz&ratings=2000&moves=30/);
  assert.deepEqual(w.auth, ['Bearer tok']);
  // The fake scores every position's best move +0.30 for the side to move, so the position after
  // it disagrees and this one is asked again; then TTL.settle on, which settles it.
  assert.equal(cdbUrls(w).length, 4, 'here, the position after the best move, here again, and here TTL.settle on');
  assert.ok(evalsOf(w, 1).at(-1)!.settled);
  w.service.handle({ type: 'lookup', id: 2, tab: 'lichess', fen: START.replace(' 0 1', ' 3 7') });
  await settle();
  assert.equal(w.urls.length, 5, 'the second lookup came from the cache, move counters aside');
});

test('the panel shows an hour-old ChessDB answer at once, then asks again and shows the new one', async () => {
  const w = world();
  w.service.handle({ type: 'lookup', id: 1, tab: 'chessdb', fen: START });
  await settle();
  assert.equal(cdbUrls(w).length, 4);
  w.tick(30 * 60 * 1000);
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: START });
  await settle();
  assert.equal(cdbUrls(w).length, 4, 'settled half an hour ago: from the cache alone');
  assert.equal(evalsOf(w, 2).length, 1);
  w.tick(31 * 60 * 1000);
  w.service.handle({ type: 'lookup', id: 3, tab: 'chessdb', fen: START });
  await settle();
  assert.equal(cdbUrls(w).length, 5, 'over an hour old: asked again, and settled by agreeing with it');
  const posted = evalsOf(w, 3);
  assert.equal(posted.length, 2, 'the cached answer, then the new one');
  assert.ok(posted[1]!.t! > posted[0]!.t! && posted[1]!.settled);
});

// The owner's report (2026-10-30): at move 15, White to move, the panel had ChessDB's one move,
// 15.bxc3 +0.75; after it, 15...b5 said −0.46, and ChessDB itself said −0.44 for bxc3 a minute
// on, once the position after it had been asked and scored.
const BXC3 = 'r2q1rk1/pp3ppp/8/4p3/2B3b1/2bP1N2/PPP2PK1/R2Q1R2 w - - 0 15';
const AFTER_BXC3 = 'r2q1rk1/pp3ppp/8/4p3/2B3b1/2PP1N2/P1P2PK1/R2Q1R2 b - - 0 15';
const four = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const after = (fen: string, san: string) => {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  pos.play(parseSan(pos, san)!);
  return makeFen(pos.toSetup());
};
const answer = (...moves: [string, string, number][]) => ({ status: 'ok', moves: moves.map(([uci, san, score]) => ({ uci, san, score })) });
const THIN = answer(['b2c3', 'bxc3', 75]);
const LEARNED = answer(['b2c3', 'bxc3', -44], ['g2g3', 'Kg3', -354]);
/** ChessDB at the owner's position: one move +0.75 until the position after it is asked, then −0.44. */
function owners() {
  let after = false;
  return (fen: string) => {
    if (four(fen) === four(BXC3)) return after ? LEARNED : THIN;
    if (four(fen) !== four(AFTER_BXC3)) return { status: 'unknown' };
    after = true;
    return answer(['b7b5', 'b5', 44], ['a8c8', 'Rc8', -51]);
  };
}
const cdbUrls = (w: { urls: string[] }) => w.urls.filter((u) => u.startsWith('https://www.chessdb.cn'));
const boards = (w: { urls: string[] }) => cdbUrls(w).map((u) => four(decodeURIComponent(/board=([^&]+)/.exec(u)![1]!)));
const evalsOf = (w: { posts: FromWorker[] }, id: number) => w.posts.flatMap((m) => (m.type === 'evals' && m.id === id && 'evals' in m ? [m.evals] : []));
const scoreOf = (e: ChessdbAnswer | undefined, san: string) => e?.moves?.find((m) => m.san === san)?.score;

test('the owner’s 15.bxc3: +0.75, then −0.44 at once, from asking the position after the best move', async () => {
  const w = world({ chessdb: owners() });
  w.service.handle({ type: 'lookup', id: 1, tab: 'chessdb', fen: BXC3 });
  await settle();
  assert.deepEqual(boards(w), [four(BXC3), four(AFTER_BXC3), four(BXC3), four(BXC3)], 'here, after bxc3, here again at once, and here TTL.settle on');
  const posted = evalsOf(w, 1);
  assert.deepEqual(
    posted.map((e) => [scoreOf(e, 'bxc3'), e.moves!.length, !!e.settled]),
    [
      [75, 1, false],
      [-44, 2, false],
      [-44, 2, true],
    ],
  );
  assert.equal(posted[2]!.t! - posted[1]!.t!, PANEL_RECHECKS[0]);
  w.tick(10 * 60 * 1000);
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: BXC3 });
  w.service.handle({ type: 'lookup', id: 3, tab: 'chessdb', fen: AFTER_BXC3 });
  await settle();
  assert.equal(scoreOf(evalsOf(w, 2)[0], 'bxc3'), -44, 'settled: shown from the cache');
  assert.equal(scoreOf(evalsOf(w, 3)[0], 'b5'), 44, 'and the position after it, asked already');
  assert.deepEqual(boards(w).slice(4), [four(after(AFTER_BXC3, 'b5')), four(AFTER_BXC3)], 'nothing asked for the settled one; the other, unsettled: after its b5, and itself again');
});

test('an answer the Practical search or the storm fetched is asked again when the panel comes to it', async () => {
  const w = world({ chessdb: owners() });
  w.service.handle({ type: 'scores', id: 1, fen: BXC3 });
  await settle();
  assert.equal(cdbUrls(w).length, 1);
  w.tick(40 * 1000);
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: BXC3 });
  await settle();
  assert.deepEqual(
    evalsOf(w, 2).map((e) => scoreOf(e, 'bxc3')),
    [75, -44, -44],
  );
});

test('ChessDB revising a position on its own: the panel asks again until two answers agree', async () => {
  // 15.bxc3 Rc8, measured 2026-10-30: a lone 16.Re1 +0.56, then +1.12 with more moves 20 s on.
  const RC8 = '2rq1rk1/pp3ppp/8/4p3/2B3b1/2PP1N2/P1P2PK1/R2Q1R2 w - - 1 16';
  const w = world({
    chessdb: (fen, n) => (four(fen) !== four(RC8) ? { status: 'unknown' } : n === 0 ? answer(['f1e1', 'Re1', 56]) : answer(['f1e1', 'Re1', 112], ['d1c1', 'Qc1', 0])),
  });
  w.service.handle({ type: 'lookup', id: 1, tab: 'chessdb', fen: RC8 });
  await settle();
  const posted = evalsOf(w, 1);
  assert.deepEqual(
    posted.map((e) => [scoreOf(e, 'Re1'), !!e.settled]),
    [
      [56, false],
      [112, false],
      [112, true],
    ],
  );
  assert.deepEqual(
    posted.map((e) => e.t! - posted[0]!.t!),
    [0, PANEL_RECHECKS[0], PANEL_RECHECKS[0]! + PANEL_RECHECKS[1]!],
  );
  assert.equal(cdbUrls(w).length, 1 + 1 + 2, 'here, after Re1 (unknown), here twice; none once settled');
});

test('a position ChessDB keeps revising is asked PANEL_RECHECKS times a visit', async () => {
  const w = world({ chessdb: (fen, n) => (four(fen) === four(BXC3) ? answer(['b2c3', 'bxc3', 75 - 40 * n]) : { status: 'unknown' }) });
  w.service.handle({ type: 'lookup', id: 1, tab: 'chessdb', fen: BXC3 });
  await settle();
  assert.equal(evalsOf(w, 1).length, 1 + PANEL_RECHECKS.length, 'each revision shown');
  assert.ok(!evalsOf(w, 1).some((e) => e.settled));
  const asked = boards(w).filter((b) => b === four(BXC3)).length;
  assert.equal(asked, 1 + PANEL_RECHECKS.length);
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: BXC3 });
  await settle();
  assert.equal(boards(w).filter((b) => b === four(BXC3)).length, asked + PANEL_RECHECKS.length, 'unsettled: shown from the cache and asked again on the next visit');
});

test('the panel leaving a position stops its asks', async () => {
  const waits: (() => void)[] = [];
  const w = world({ chessdb: (fen) => (four(fen) === four(BXC3) ? THIN : { status: 'unknown' }), sleep: () => new Promise<void>((resolve) => waits.push(resolve)) });
  w.service.handle({ type: 'lookup', id: 1, tab: 'chessdb', fen: BXC3 });
  await settle();
  assert.equal(waits.length, 1, 'waiting to ask again');
  const asked = cdbUrls(w).length;
  w.service.handle({ type: 'drop', id: 1 });
  waits.shift()!();
  await settle();
  assert.equal(cdbUrls(w).length, asked, 'dropped: not asked again');
  assert.equal(evalsOf(w, 1).length, 1);
});

test('two ChessDB answers agree with the same scored moves, each within 10 centipawns', () => {
  const a: ChessdbAnswer = answer(['b7b5', 'b5', 42], ['a8c8', 'Rc8', -51]);
  assert.ok(sameEvals(a, answer(['a8c8', 'Rc8', -45], ['b7b5', 'b5', 41])), 'drift and order aside');
  assert.ok(!sameEvals(a, answer(['b7b5', 'b5', 42], ['a8c8', 'Rc8', -112])), 'a score revised');
  assert.ok(!sameEvals(a, answer(['b7b5', 'b5', 42])), 'a move fewer');
  assert.ok(!sameEvals(a, { status: 'unknown' }));
  assert.ok(sameEvals({ status: 'unknown' }, { status: 'unknown' }));
  assert.ok(sameEvals(answer(['b7b5', 'b5', NaN]), answer()), 'unscored moves aside');
});

test('an answer is settled only by an ask TTL.settle or more after the one before', async () => {
  const w = world();
  w.service.handle({ type: 'scores', id: 1, fen: START });
  await settle();
  w.tick(TTL.settle - 1);
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: START });
  await settle();
  const posted = evalsOf(w, 2);
  assert.equal(posted.length, 3, 'the cached answer, the one asked after the position after its best, and one TTL.settle on');
  assert.ok(sameEvals(posted[0]!, posted[1]!) && !posted[1]!.settled, 'the same, but asked too soon after');
  assert.ok(posted[2]!.settled);
});

test('Masters is asked without the filter; ChessDB’s tab asks ChessDB alone', async () => {
  const w = world();
  w.service.handle({ type: 'lookup', id: 1, tab: 'masters', fen: START });
  w.service.handle({ type: 'lookup', id: 2, tab: 'chessdb', fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' });
  await settle();
  const ex = explorerUrls(w.urls);
  assert.equal(ex.length, 1);
  assert.match(ex[0]!, /^https:\/\/explorer\.lichess\.org\/masters\?fen=[^&]+&moves=30&topGames=0$/);
  assert.ok(!w.posts.some((m) => m.type === 'games' && m.id === 2));
  assert.ok(w.posts.some((m) => m.type === 'evals' && m.id === 2));
});

test('no Lichess login: the games say so and offer the login; ChessDB still answers; the column says why', async () => {
  const w = world();
  w.service.handle({ type: 'config', config: { ...CONFIG, token: '' } });
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 0.5 } });
  await settle();
  const games = w.posts.find((m) => m.type === 'games');
  assert.ok(games && 'error' in games && games.error.login);
  assert.ok(w.posts.some((m) => m.type === 'evals' && 'evals' in m));
  assert.equal(explorerUrls(w.urls).length, 0);
  const row = w.posts.find((m) => m.type === 'update');
  assert.ok(row && row.type === 'update' && row.result.state === 'error' && /log in with Lichess/.test(row.result.reason!));
});

test('a 429: the panel is told, the request waits out the minute and is answered', async () => {
  let refused = false;
  const w = world({
    explorer: () => {
      if (!refused) return (refused = true), json(429, {});
      return json(200, { white: 1, draws: 0, black: 0, moves: [] });
    },
  });
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  await settle();
  assert.ok(w.posts.some((m) => m.type === 'paused' && m.ms === 60000));
  assert.ok(w.posts.some((m) => m.type === 'games' && 'games' in m && m.games.total === 1));
  assert.equal(explorerUrls(w.urls).length, 2);
  w.service.handle({ type: 'stats' });
  await settle();
  const stats = w.posts.find((m) => m.type === 'stats');
  assert.ok(stats && stats.type === 'stats' && stats.stats.explorer429 === 1 && stats.stats.explorerRequests === 2);
});

test('a dropped lookup’s queued request goes, and nothing is posted for it', async () => {
  let release: (r: HttpResponse) => void = () => {};
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => (release = r)) });
  w.service.handle({ type: 'lookup', id: 1, tab: 'lichess', fen: START });
  w.service.handle({ type: 'lookup', id: 2, tab: 'lichess', fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' });
  await settle();
  // The first is in flight (one at a time); the second waits, and is dropped.
  w.service.handle({ type: 'drop', id: 2 });
  release(json(200, { white: 1, draws: 0, black: 0, moves: [] }));
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1);
  assert.ok(w.posts.some((m) => m.type === 'games' && m.id === 1));
  assert.ok(!w.posts.some((m) => m.type === 'games' && m.id === 2));
});

test('the Practical search: rows valued by rounds, each published with its depth, then final', async () => {
  const w = world();
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'Nf3'], shares: { e4: 0.6, Nf3: 0.4 } });
  await settle();
  const updates = w.posts.filter((m): m is Extract<FromWorker, { type: 'update' }> => m.type === 'update');
  assert.ok(updates.length >= 2);
  for (const u of updates) assert.equal(u.root, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  const last = new Map(updates.map((u) => [u.san, u.result]));
  for (const san of ['e4', 'Nf3']) {
    const r = last.get(san)!;
    assert.equal(r.state, 'value', san);
    assert.equal(r.final, true, san);
    assert.ok(r.value! > 0 && r.value! < 100);
    assert.equal(r.depth, 3, san); // maxPly 4: depths 1 and 3
  }
  // Depth 1 first, row by row; depth 3 published together.
  assert.deepEqual(
    updates.map((u) => u.result.depth),
    [1, 1, 3, 3],
  );
});

test('a new root sweeps the old one’s queued requests, and the old one posts nothing more', async () => {
  const held: ((r: HttpResponse) => void)[] = [];
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => held.push(r)) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'd4'], shares: { e4: 0.5, d4: 0.5 } });
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1, 'one explorer request in flight at a time');
  const after = makeFen(Chess.fromSetup(parseFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1').unwrap()).unwrap().toSetup());
  w.service.handle({ type: 'search', gen: 2, rootFen: after, rows: [], shares: {} });
  held.shift()!(json(200, { white: 1, draws: 0, black: 0, moves: [] }));
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1, 'd4’s queued request was dropped');
  assert.ok(!w.posts.some((m) => m.type === 'update' && m.gen === 1));
});

test('the panel joining a request the Practical search queued is answered after the search moves on (stuck "Asking…")', async () => {
  const held: ((r: HttpResponse) => void)[] = [];
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => held.push(r)) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'd4'], shares: { e4: 0.5, d4: 0.5 } });
  await settle();
  assert.equal(explorerUrls(w.urls).length, 1, 'e4’s position in flight, d4’s queued');
  // The board steps to 1. d4: the panel asks the position the search has queued.
  const afterD4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
  w.service.handle({ type: 'lookup', id: 7, tab: 'lichess', fen: afterD4 });
  await settle();
  // The search moves to the new root: the old root's queued requests are swept.
  w.service.handle({ type: 'search', gen: 2, rootFen: afterD4, rows: [], shares: {} });
  while (held.length && !w.posts.some((m) => m.type === 'games' && m.id === 7)) {
    held.shift()!(json(200, { white: 1, draws: 0, black: 0, moves: [] }));
    await settle();
  }
  assert.ok(w.posts.some((m) => m.type === 'games' && m.id === 7 && 'games' in m), 'the panel got its games');
});

test('the panel joining a queued search request moves it to the panel’s priority', async () => {
  const held: ((r: HttpResponse) => void)[] = [];
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => held.push(r)) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'd4', 'Nf3', 'c4'], shares: { e4: 0.4, d4: 0.3, Nf3: 0.2, c4: 0.1 } });
  await settle();
  const afterC4 = 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1';
  w.service.handle({ type: 'lookup', id: 8, tab: 'lichess', fen: afterC4 });
  await settle();
  held.shift()!(json(200, { white: 1, draws: 0, black: 0, moves: [] }));
  await settle();
  // c4 had the smallest share: without the raise it would come last; now it is next.
  assert.match(decodeURIComponent(explorerUrls(w.urls)[1]!), /2P5/);
});

test('a row taken out while it runs is reported as excluded', async () => {
  const held: ((r: HttpResponse) => void)[] = [];
  const w = world({ explorer: () => new Promise<HttpResponse>((r) => held.push(r)) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 1 } });
  await settle();
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: [], remove: ['e4'], shares: {} });
  assert.ok(w.posts.some((m) => m.type === 'update' && m.san === 'e4' && m.result.state === 'excluded'));
});

test('coverage counts (§5.26): the games alone, at the filter, once and then from the cache; with no login, the reason', async () => {
  const w = world();
  w.service.handle({ type: 'counts', id: 7, fen: START });
  await settle();
  const games = w.posts.find((m) => m.type === 'games' && m.id === 7);
  assert.ok(games && 'games' in games && games.games.total === 1650);
  assert.deepEqual(w.urls.map((u) => u.split('?')[0]), ['https://explorer.lichess.org/lichess'], 'no ChessDB request');
  assert.match(w.urls[0]!, /speeds=blitz&ratings=2000/);
  w.service.handle({ type: 'counts', id: 8, fen: START });
  await settle();
  assert.equal(w.urls.length, 1);
  assert.ok(w.posts.some((m) => m.type === 'games' && m.id === 8));

  const none = world();
  none.service.handle({ type: 'config', config: { ...CONFIG, token: '' } });
  none.service.handle({ type: 'counts', id: 9, fen: START });
  await settle();
  const refused = none.posts.find((m) => m.type === 'games' && m.id === 9);
  assert.ok(refused && 'error' in refused && refused.error.login);
});

test('the games after a move (§5.126): the tab’s database alone, no ChessDB, cached; a dropped one answers nothing', async () => {
  const w = world();
  w.service.handle({ type: 'childGames', id: 3, tab: 'lichess', fen: START });
  w.service.handle({ type: 'childGames', id: 4, tab: 'masters', fen: START });
  await settle();
  assert.deepEqual(w.urls.map((u) => u.split('?')[0]), ['https://explorer.lichess.org/lichess', 'https://explorer.lichess.org/masters'], 'no ChessDB request');
  assert.match(w.urls[0]!, /speeds=blitz&ratings=2000/);
  for (const id of [3, 4]) {
    const m = w.posts.find((p) => p.type === 'childGames' && p.id === id);
    assert.ok(m && 'games' in m && m.games.total === 1650);
  }
  w.service.handle({ type: 'childGames', id: 5, tab: 'lichess', fen: START });
  await settle();
  assert.equal(w.urls.length, 2, 'from the cache');

  const slow = world({ explorer: () => new Promise<HttpResponse>(() => {}) });
  slow.service.handle({ type: 'childGames', id: 6, tab: 'lichess', fen: START });
  slow.service.handle({ type: 'drop', id: 6 });
  await settle();
  assert.ok(!slow.posts.some((m) => m.type === 'childGames'));
});

/* Maia (§5.34): q_extension's fill-in of thin positions, and its preview beside the search. */

// Every position thin: two moves with 15 games each, under the 50 games a node needs.
const thin = (url: string) => {
  const fen = decodeURIComponent((/fen=([^&]+)/.exec(url) ?? [])[1] ?? '');
  const moves = legalSans(fen, 2).map((m) => ({ uci: m.uci, san: m.san, white: 5, draws: 5, black: 5 }));
  return json(200, { white: 10, draws: 10, black: 10, moves });
};
const fakeMaia = (asked: [string, number][]) => (fen: string, elo: number) => {
  asked.push([fen, elo]);
  const [a, b] = legalSans(fen, 2);
  return Promise.resolve([{ san: a!.san, prob: 0.7 }, { san: b!.san, prob: 0.3 }]);
};
const finals = (w: ReturnType<typeof world>, pass?: 'maia') =>
  new Map(w.posts.filter((m): m is Extract<FromWorker, { type: 'update' }> => m.type === 'update' && m.pass === pass && m.result.final !== false).map((u) => [u.san, u.result]));

test('Maia off: a thin opponent position is a leaf, and Maia is never asked', async () => {
  const asked: [string, number][] = [];
  const w = world({ explorer: thin, maia: fakeMaia(asked) });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 1 } });
  await settle();
  assert.equal(asked.length, 0);
  assert.equal(finals(w).get('e4')!.maia ?? 0, 0);
});

test('Maia on: thin positions filled in with its policy at the configured rating, its share told', async () => {
  const asked: [string, number][] = [];
  const w = world({ explorer: thin, maia: fakeMaia(asked), config: { options: { maia: true, maiaElo: 1700 } } });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 1 } });
  await settle();
  assert.ok(asked.length > 0);
  assert.ok(asked.every(([, elo]) => elo === 1700));
  const r = finals(w).get('e4')!;
  assert.equal(r.state, 'value');
  // 30 games a position: Maia weighs in as 20 × (1 − 30/100) = 14 pseudo-games (q_extension's blend).
  assert.ok(r.maia! > 0.2 && r.maia! < 0.9, `Maia's share: ${r.maia}`);
  assert.equal(r.maiaElo, 1700);
  // No preview unless asked for.
  assert.equal(finals(w, 'maia').size, 0);
});

test('Maia unreachable: its asks answer null, the search goes on as without it and says so', async () => {
  const w = world({ explorer: thin, maia: () => Promise.resolve(null), config: { options: { maia: true, maiaElo: 1700 } } });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4'], shares: { e4: 1 } });
  await settle();
  const r = finals(w).get('e4')!;
  assert.equal(r.maia ?? 0, 0);
  assert.equal(r.maiaMissing, true);
});

test('the preview: the same rows valued with Maia in place of games, asking no explorer of its own', async () => {
  const plain = world({ config: { options: { maia: true, maiaElo: 1700 } }, maia: fakeMaia([]) });
  plain.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'Nf3'], shares: { e4: 0.6, Nf3: 0.4 } });
  await settle();
  const asked: [string, number][] = [];
  const w = world({ maia: fakeMaia(asked), config: { maiaPreview: true, options: { maia: true, maiaElo: 1700 } } });
  w.service.handle({ type: 'search', gen: 1, rootFen: START, rows: ['e4', 'Nf3'], shares: { e4: 0.6, Nf3: 0.4 } });
  await settle();
  const preview = finals(w, 'maia');
  assert.deepEqual([...preview.keys()].sort(), ['Nf3', 'e4']);
  for (const r of preview.values()) {
    assert.equal(r.state, 'value');
    assert.ok(r.maia! > 0.99, 'Maia alone weighs every reply');
  }
  // The Lichess values come as before, and the explorer was asked no more than without the preview.
  assert.equal(finals(w).get('e4')!.state, 'value');
  assert.equal(explorerUrls(w.urls).length, explorerUrls(plain.urls).length);
  assert.ok(w.posts.some((m) => m.type === 'update' && m.pass === 'maia' && m.root === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'));
});

test("the storm's games up to a month (an overnight gather's older pass, §5.102): `until` asked, and cached apart", async () => {
  const w = world();
  w.service.handle({ type: 'stormGames', id: 1, fen: START });
  w.service.handle({ type: 'stormGames', id: 2, fen: START, until: '2026-06' });
  await settle();
  const ex = explorerUrls(w.urls);
  assert.equal(ex.length, 2);
  assert.ok(!ex[0]!.includes('until='));
  assert.match(ex[1]!, /&topGames=4&recentGames=4&until=2026-06$/);
  assert.ok(w.posts.some((m) => m.type === 'stormGames' && m.id === 2));
});
