// Runs mistake-lab's own repertoire checks (index.html at c525403) on repcheck.json and writes its
// `expected` back: `detectRepertoireDeviations` (through its cached-moveStats path), the recidivism
// (`buildDrilledIndex`, `computeRecidivism`, with chess.js 0.10.3 for the practice games' replay),
// and the weak spots (`doBuildOpeningIndex`'s position index, `computeHumanWeakSpots`,
// `computeBotWeakSpots`). node mistake-lab-repcheck.cjs <index.html> repcheck.json <dir with chess.js>
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./mistake-lab-sandbox.cjs');
const [indexHtml, file, chessDir] = process.argv.slice(2);
const { Chess } = require(path.join(chessDir, 'node_modules', 'chess.js'));
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const state = `var allGames = [], repertoireTrie = new Map(), fenDataCacheLoaded = true, fenDataCache = {}, pendingFenData = {}, knownUsernames = new Set(),
  gistData = { repertoire: { dismissed: [] }, positions: {}, practiceScoreboard: {} }, repertoireDeviations = [], repertoireGaps = [],
  allMistakes = [], recidRawMistakes = [], recidGamesMeta = [], reviewHistory = [], recidivismByPosId = null, recidivismSummary = null,
  positionMoveIndex = null, gameFenIndex = null, pmiGameCount = 0, fenIndexGameCount = 0, pmiBuilding = false, fenIndexBuilding = false, openingBuildSession = 0;
  var applyRecidReschedules = () => 0, scheduleRecidivism = () => {}, evalCacheGet = () => null, getRepertoireConfig = () => [], performance = { now: () => 0 };`;
const world = sandbox(indexHtml, {
  state,
  globals: ['Chess', 'window'],
  constants: ['WEAKSPOT_CFG', 'REP_TODO_PRESETS'],
  functions: ['detectRepertoireDeviations', 'getRepertoireDismissed', 'normalizeSpeed', 'detectPlayerColor', 'fenPositionKey', 'isEnPassantPseudoLegal', 'posId', 'trieMatchesMove', 'buildDrilledIndex', 'computeRecidivism', 'getGameResultInfo', 'doBuildOpeningIndex', 'weakSpotsIndexReady', 'weakSpotScore', 'computeHumanWeakSpots', 'computeBotWeakSpots'],
});

const players = { white: { user: { name: 'W', id: 'w' } }, black: { user: { name: 'B', id: 'b' } } };
const allGames = j.games.map((g) => ({ id: g.id, moves: g.moves.join(' '), createdAt: g.createdAt, speed: g.speed, _playerColor: g.color, players, opening: { name: '' }, ...(g.result === 'draw' ? {} : { winner: g.result === 'win' ? g.color : g.color === 'white' ? 'black' : 'white' }), ...(g.analysed ? { analysis: g.moves.map(() => ({ eval: 0 })) } : {}) }));
const fenDataCache = Object.fromEntries(j.games.map((g) => [g.id, { moveStats: g.moveStats, finalFen: g.finalFen }]));
const trie = () => new Map(Object.entries(j.trie));

// Deviations and gaps.
const w = world({ Chess, window: {} });
w.set({ allGames, fenDataCache, repertoireTrie: trie(), gistData: { repertoire: { dismissed: j.dismissed }, positions: {} } });
w.detectRepertoireDeviations();
const deviations = w.get('repertoireDeviations').map((d) => ({ key: d.positionKey, color: d.playerColor, repertoire: d.repertoireMove.uci, games: d.games.map((g) => [g.gameId, g.movePly, g.playedMove.san, g.speed]) }));
const gaps = w.get('repertoireGaps').map((g) => ({ key: g.positionKey, san: g.opponentMove.san, games: g.games }));

// Recidivism.
const r = world({ Chess, window: {} });
const gameTime = Object.fromEntries(j.games.map((g) => [g.id, g.createdAt]));
const allMistakes = j.items.map((m) => ({ ...m, game: { createdAt: gameTime[m.gameId] } }));
const positions = {};
for (const m of j.items) {
  const pid = m.type === 'tactic' ? `${m.gameId}_t${m.movePly}` : `${m.gameId}_${m.movePly}`;
  positions[pid] = { srs: { reps: m.reps }, ...(m.firstReview ? { firstReview: m.firstReview } : {}), ...(m.invalidated ? { invalidated: true } : {}) };
}
r.set({
  allMistakes,
  repertoireTrie: trie(),
  gistData: { repertoire: { dismissed: [] }, positions },
  fenDataCache,
  recidRawMistakes: j.mistakes.map((m) => ({ type: 'mistake', ...m })),
  recidGamesMeta: j.games.filter((g) => !g.id.startsWith('_test_')).map((g) => ({ id: g.id, createdAt: g.createdAt, hasAnalysis: g.analysed, playerColor: g.color })),
  reviewHistory: j.reviews,
});
r.computeRecidivism();
const byPid = r.get('recidivismByPosId');
const recid = { summary: r.get('recidivismSummary'), byPid: Object.fromEntries([...byPid].map(([pid, encs]) => [pid, encs.map((e) => [e.gameId, e.source, e.verdict, e.sameMove, e.exactBest, e.approx, e.playedSan])])) };

// Weak spots: the position index built as mistake-lab builds it, then both lenses.
(async () => {
  const s = world({ Chess, window: {} });
  s.set({ allGames, fenDataCache, gistData: { repertoire: { dismissed: [] }, positions: {}, practiceScoreboard: j.scoreboard } });
  s.set({ pmiBuilding: true, fenIndexBuilding: true });
  s.doBuildOpeningIndex();
  for (let i = 0; i < 100 && s.get('pmiBuilding'); i++) await new Promise((res) => setTimeout(res, 20));
  const human = s.computeHumanWeakSpots().map((x) => ({ key: x.posKey, san: x.san, w: x.w, l: x.l, d: x.d, userColor: x.userColor }));
  const bot = s.computeBotWeakSpots().map((x) => ({ key: x.posKey, preset: x.preset, w: x.w, l: x.l, d: x.d }));
  j.expected = { deviations, gaps, recid, human, bot };
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
  console.log(JSON.stringify(j.expected, null, 1));
})();
