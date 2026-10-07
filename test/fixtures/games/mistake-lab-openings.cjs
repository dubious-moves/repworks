// Runs mistake-lab's own opening index (index.html at c525403) on the games of openings.json and
// writes back `expected`: `doBuildOpeningIndex`'s position → move index (each move's games and
// results) and its game → positions index (each game's positions before its moves, and the last),
// and `lookupOpeningName` at the positions in `lookups`. No moveStats cache: every game replayed
// with chess.js 0.10.3, as on a first build.
// node mistake-lab-openings.cjs <index.html> openings.json <dir with chess.js@0.10.3>
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./mistake-lab-sandbox.cjs');
const [indexHtml, file, chessDir] = process.argv.slice(2);
const { Chess } = require(path.join(chessDir, 'node_modules', 'chess.js'));
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const state = `var allGames = [], fenDataCacheLoaded = false, fenDataCache = {}, knownUsernames = new Set(),
  positionMoveIndex = null, gameFenIndex = null, pmiGameCount = 0, fenIndexGameCount = 0, pmiBuilding = false, fenIndexBuilding = false, openingBuildSession = 0,
  openingFilterMode = false, filterChess = null;
  var performance = { now: () => 0 }, saveFenDataCache = () => {}, applyOpeningFilterFromBoard = () => {}, renderExplorerStats = () => {};`;
const world = sandbox(indexHtml, {
  state,
  globals: ['Chess', 'window'],
  functions: ['doBuildOpeningIndex', 'detectPlayerColor', 'fenPositionKey', 'isEnPassantPseudoLegal', 'getGameResultInfo', 'lookupOpeningName'],
});

const players = { white: { user: { name: 'W', id: 'w' }, rating: 1800 }, black: { user: { name: 'B', id: 'b' }, rating: 1900 } };
const allGames = j.games.map((g) => ({ id: g.id, moves: g.moves.join(' '), createdAt: g.createdAt, _playerColor: g.color, players, ...(g.initialFen ? { initialFen: g.initialFen } : {}), ...(g.opening ? { opening: { name: g.opening } } : {}), status: g.result === 'draw' ? 'draw' : 'resign', ...(g.result === 'draw' ? {} : { winner: g.result === 'win' ? g.color : g.color === 'white' ? 'black' : 'white' }) }));

(async () => {
  const w = world({ Chess, window: {} });
  w.set({ allGames });
  w.set({ pmiBuilding: true, fenIndexBuilding: true });
  w.doBuildOpeningIndex();
  for (let i = 0; i < 200 && w.get('pmiBuilding'); i++) await new Promise((res) => setTimeout(res, 20));
  const pmi = {};
  for (const [key, moves] of w.get('positionMoveIndex')) {
    pmi[key] = {};
    for (const [san, e] of moves) pmi[key][san] = { uci: e.uci, count: e.count, whiteWins: e.whiteWins, blackWins: e.blackWins, draws: e.draws, games: e.games.map((g) => [g.gameId, g.userColor, g.result]) };
  }
  const fens = {};
  for (const [id, set] of w.get('gameFenIndex')) fens[id] = [...set].sort();
  const names = {};
  for (const l of j.lookups) {
    const c = new Chess(l.fen);
    for (const san of l.moves) c.move(san);
    names[l.name] = w.lookupOpeningName(c.fen());
  }
  j.expected = { pmi, fens, names };
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
  console.log(JSON.stringify(names), Object.keys(pmi).length, 'positions');
})();
