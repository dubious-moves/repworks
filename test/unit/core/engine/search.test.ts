// The engine's search lifecycle (PLAN.md §5.30) over a scripted engine: one `go` at a time, a
// new position after the old search's `bestmove`, a stopped search's lines dropped, no shallower
// line shown, the cache, and "+".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSearch, type Analysis, type SearchRequest } from '../../../../src/core/engine/search.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const req = (fen: string, extra: Partial<SearchRequest> = {}): SearchRequest => ({
  fen,
  key: fen.split(' ').slice(0, 4).join(' '),
  turn: fen.split(' ')[1] === 'w' ? 'white' : 'black',
  depth: 20,
  movetime: 8000,
  lines: 2,
  legal: 20,
  ...extra,
});

function world() {
  const sent: string[] = [];
  const shown: Analysis[] = [];
  let now = 0;
  const search = createSearch({ send: (c) => sent.push(c), now: () => now, onUpdate: (a) => shown.push(a) });
  const info = (depth: number, multipv: number, cp: number, pv: string, extra = '') => search.receive(`info depth ${depth} seldepth ${depth + 4} multipv ${multipv} score cp ${cp}${extra} nodes 1000 nps 500000 time 10 pv ${pv}`);
  return { sent, shown, search, info, tick: (ms: number) => (now += ms), last: () => shown[shown.length - 1]! };
}

test('a search starts at once; its lines are shown from White’s side, best first', () => {
  const w = world();
  w.search.analyse(req(START));
  assert.deepEqual(w.sent, ['setoption name MultiPV value 2', `position fen ${START}`, 'go depth 20 movetime 8000']);
  w.info(10, 2, 20, 'd2d4 d7d5');
  w.info(10, 1, 35, 'e2e4 e7e5');
  const a = w.last();
  assert.equal(a.depth, 10);
  assert.deepEqual(a.lines.map((l) => [l.multipv, l.score.cp, l.pv[0]]), [[1, 35, 'e2e4'], [2, 20, 'd2d4']]);
  assert.equal(a.nps, 500000);
  assert.equal(a.done, false);
  w.info(20, 2, 22, 'd2d4 d7d5');
  w.info(20, 1, 30, 'e2e4 c7c5');
  w.tick(900);
  w.search.receive('bestmove e2e4 ponder c7c5');
  assert.equal(w.last().done, true);
  assert.equal(w.last().nps, undefined);
});

test('a new position stops the search and starts only after its bestmove; the stopped lines are dropped', () => {
  const w = world();
  w.search.analyse(req(START));
  w.info(12, 1, 30, 'e2e4');
  w.sent.length = 0;
  w.search.analyse(req(E4));
  assert.deepEqual(w.sent, ['stop']);
  // Lines of the stopped search, arriving before its bestmove, show nowhere.
  w.info(13, 1, 31, 'e2e4');
  assert.equal(w.last().key, req(E4).key);
  assert.equal(w.last().lines.length, 0);
  w.search.receive('bestmove e2e4');
  assert.deepEqual(w.sent, ['stop', `position fen ${E4}`, 'go depth 20 movetime 8000']);
  // Black to move: the engine's +25 is Black's, so -25 from White's side.
  w.info(8, 1, 25, 'c7c5 g1f3');
  assert.deepEqual(w.last().lines[0]!.score, { cp: -25 });
  // The first position kept what it had found (depth 12, not the dropped 13).
  w.search.analyse(req(START));
  assert.equal(w.last().depth, 12);
});

test('several positions in a row: only the last one is searched next', () => {
  const w = world();
  w.search.analyse(req(START));
  w.search.analyse(req(E4));
  w.search.analyse(req('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'));
  assert.equal(w.sent.filter((c) => c === 'stop').length, 1);
  w.search.receive('bestmove e2e4');
  assert.deepEqual(w.sent.filter((c) => c.startsWith('position')).length, 2);
  assert.match(w.sent[w.sent.length - 2]!, /4p3\/4P3/);
});

test('a line never goes back to a shallower depth; bounds are not shown', () => {
  const w = world();
  w.search.analyse(req(START));
  w.info(18, 1, 30, 'e2e4');
  w.info(18, 2, 20, 'd2d4');
  w.search.receive('bestmove e2e4');
  // Searched again deeper (say "+"): the iterations below 18 change nothing shown.
  w.search.analyse(req(START, { deeper: true }));
  assert.match(w.sent[w.sent.length - 1]!, /^go depth 99$/);
  w.info(5, 1, 80, 'g1f3');
  assert.equal(w.last().lines[0]!.pv[0], 'e2e4');
  w.info(19, 1, 44, 'd2d4', ' lowerbound');
  assert.equal(w.last().lines[0]!.score.cp, 30);
  w.info(19, 1, 40, 'd2d4');
  assert.deepEqual([w.last().depth, w.last().lines[0]!.pv[0]], [19, 'd2d4']);
  assert.equal(w.last().done, false);
});

test('a position searched far enough answers from the cache with nothing sent', () => {
  const w = world();
  w.search.analyse(req(START));
  w.info(20, 1, 30, 'e2e4');
  w.info(20, 2, 25, 'd2d4');
  w.search.receive('bestmove e2e4');
  w.search.analyse(req(E4));
  w.search.receive('bestmove c7c5');
  w.sent.length = 0;
  w.search.analyse(req(START));
  assert.deepEqual(w.sent, []);
  assert.equal(w.last().done, true);
  assert.equal(w.last().lines.length, 2);
  // Three lines asked: it searches again for the third.
  w.search.analyse(req(START, { lines: 3 }));
  assert.deepEqual(w.sent, ['setoption name MultiPV value 3', `position fen ${START}`, 'go depth 20 movetime 8000']);
  assert.equal(w.last().lines.length, 2);
});

test('the time limit counts as done; a position with fewer moves than lines is done with what it has', () => {
  const w = world();
  w.search.analyse(req(START, { movetime: 5000 }));
  w.info(16, 1, 30, 'e2e4');
  w.info(16, 2, 25, 'd2d4');
  w.tick(5000);
  w.search.receive('bestmove e2e4');
  assert.equal(w.last().done, true);
  const one = 'k7/8/1K6/8/8/8/8/7R b - - 0 1';
  w.search.analyse(req(one, { legal: 1 }));
  w.info(30, 1, -5000, 'a8b8');
  w.search.receive('bestmove a8b8');
  assert.equal(w.last().done, true);
});

test('no move: mate or stalemate on the board', () => {
  const w = world();
  w.search.analyse(req('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', { legal: 0 }));
  w.search.receive('info depth 0 score mate 0');
  w.search.receive('bestmove (none)');
  assert.equal(w.last().noMove, true);
  assert.equal(w.last().done, true);
});

test('stop leaves nothing wanted; a restart of the engine starts the wanted search again', () => {
  const w = world();
  w.search.analyse(req(START));
  w.search.stop();
  assert.equal(w.search.stopping(), true);
  assert.equal(w.search.current(), undefined);
  w.search.receive('bestmove e2e4');
  assert.equal(w.search.stopping(), false);
  // A stop that never answers: the platform restarts the engine and calls reset.
  w.search.analyse(req(E4));
  w.search.analyse(req(START));
  assert.equal(w.search.stopping(), true);
  w.sent.length = 0;
  w.search.reset();
  assert.deepEqual(w.sent, ['setoption name MultiPV value 2', `position fen ${START}`, 'go depth 20 movetime 8000']);
});
