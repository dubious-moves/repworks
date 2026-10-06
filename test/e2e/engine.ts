// A fake Stockfish for the browser tests (PLAN.md §5.31), served in place of the build's script
// (serveSite's `engine`): it answers the handshake, then for each `go` gives the lines scripted
// for its position, a shallow depth at once and depth 20 after `SLOW` ms, then `bestmove`; `stop`
// ends a search at once. Every command it receives is requested from the site as
// `__engine/<command>`, so a test reads them from the server's request log. Scores are the side
// to move's, as the engine writes them.

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
export const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';
/** The start with Black to move: the threat at the start. */
export const START_THREAT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -';

export const LINES: Record<string, [number, number, string][]> = {
  [START]: [
    [1, 30, 'e2e4 e7e5 g1f3 b8c6'],
    [2, 25, 'd2d4 d7d5 c2c4'],
    [3, -300, 'g2g4 d7d5'],
  ],
  [AFTER_E4]: [
    [1, -30, 'c7c5 g1f3 d7d6'],
    [2, -35, 'e7e5 g1f3'],
    [3, -40, 'e7e6 d2d4'],
  ],
  [START_THREAT]: [[1, 20, 'e7e5 g1f3']],
};

export const SLOW = 400;

/** `slow`: how long a search takes to reach depth 20, in ms. */
export function fakeEngine(slow = SLOW): string {
  return `
const LINES = ${JSON.stringify(LINES)};
let fen = '';
let timers = [];
let searching = false;
let seq = 0;
const log = (c) => fetch('/repworks/__engine/' + seq++ + '/' + encodeURIComponent(c)).catch(() => {});
const finish = () => {
  timers.forEach(clearTimeout);
  timers = [];
  if (searching) postMessage('bestmove ' + ((LINES[fen] || [])[0] ? LINES[fen][0][2].split(' ')[0] : '(none)'));
  searching = false;
};
const emit = (depth) => {
  for (const [multipv, cp, pv] of LINES[fen] || []) {
    postMessage('info depth ' + depth + ' seldepth ' + (depth + 3) + ' multipv ' + multipv + ' score cp ' + cp + ' nodes 1000 nps 650000 time 10 pv ' + pv);
  }
};
onmessage = (e) => {
  const c = String(e.data);
  log(c);
  if (c === 'uci') return postMessage('uciok');
  if (c === 'isready') return postMessage('readyok');
  if (c.startsWith('position fen ')) fen = c.slice(13).split(' ').slice(0, 4).join(' ');
  if (c.startsWith('go')) {
    searching = true;
    timers.push(setTimeout(() => emit(8), 20));
    timers.push(setTimeout(() => emit(20), ${slow}));
    timers.push(setTimeout(finish, ${slow} + 20));
  }
  if (c === 'stop') finish();
};
`;
}

/** The commands the fake engine received so far, in order. */
export const commands = (requests: readonly string[]): string[] =>
  requests
    .filter((p) => p.startsWith('/repworks/__engine/'))
    .map((p) => p.slice('/repworks/__engine/'.length).split('/'))
    .map(([n, c]) => [Number(n), decodeURIComponent(c!)] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c);
