// Runs mistake-lab's own detected tactics (index.html at c525403) on the games of tactics.json and
// writes back each game's `expected`: every user move given to `applySilentEvalToMove` in order
// (which classifies the opponent's move before it from `_prevUserAfterCp`, here the previous user
// move's score after it, and calls `detectTacticCandidate`), then each candidate walked by
// `tacticBuildBestChain` (`tacticWalkTree`, `tacticCheckUniqueness`), its lines deduplicated by
// `tacticDedupeAltLines`, and Maia's line by `tacticGenerateMaiaLine`. Stockfish and Maia are
// stand-ins: a position's lines are its legal moves from a hash of its FEN, with scores from four
// patterns (a unique best move, three close moves, two close then a drop, one then two far worse);
// Maia's move is the legal move a second hash picks. Every answer given is written to `engine` and
// `maia`, so the port's test asks the same.
// node mistake-lab-tactics.cjs <index.html> tactics.json <dir with chess.js@0.10.3>
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./mistake-lab-sandbox.cjs');
const [indexHtml, file, chessDir] = process.argv.slice(2);
const { Chess } = require(path.join(chessDir, 'node_modules', 'chess.js'));
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const keyOf = (fen) => fen.split(' ').slice(0, 3).join(' ');
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const PATTERNS = [[700, 0, -100], [300, 250, 200], [-50, -80, -500], [10, -400, -450]];
const engine = {};
const maia = {};
function analyse(fen, mpv) {
  const k = keyOf(fen);
  if (!engine[k]) {
    const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || '')).sort();
    const h = hash(k);
    const start = legal.length ? h % legal.length : 0;
    const pattern = PATTERNS[(h >>> 8) % PATTERNS.length];
    engine[k] = legal.slice(start).concat(legal.slice(0, start)).slice(0, 3).map((uci, i) => [pattern[i], uci]);
  }
  const pvs = engine[k].slice(0, mpv).map(([cp, firstMove]) => ({ cp, firstMove }));
  return pvs.length ? { bestMove: pvs[0].firstMove, pvs } : null;
}
function maiaMove(fen) {
  const k = keyOf(fen);
  if (!(k in maia)) {
    const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || '')).sort();
    maia[k] = legal.length ? legal[hash('maia' + k) % legal.length] : null;
  }
  return maia[k];
}

const state = `var contLine = null, currentMistakeIdx = -1, filteredMistakes = [], maiaReady = true;
  var silentEvalItemStillValid = () => true, isRepertoireMove = () => false, uciToSan = () => '';`;
const world = sandbox(indexHtml, {
  state,
  globals: ['Chess', 'maiaPredict'],
  constants: ['TACTIC_FIRST_MOVE_THRESHOLD_WP', 'TACTIC_CONTINUATION_THRESHOLD_WP', 'TACTIC_OPP_WP_CAP', 'TACTIC_MIN_USER_MOVES', 'TACTIC_MIN_OPP_CP_LOSS', 'TACTIC_MIN_PLY', 'TACTIC_MIN_REMAINING', 'TACTIC_OPP_CANDIDATES', 'TACTIC_MAX_ALT_LINES', 'TACTIC_MAX_ALT_DEPTH', 'TACTIC_MAX_LINE_LENGTH'],
  functions: ['cpToWinPct', 'classifyWpDrop', 'classifyWithContext', 'applySilentEvalToMove', 'detectTacticCandidate', 'tacticCheckUniqueness', 'tacticWalkTree', 'tacticBuildBestChain', 'tacticDedupeAltLines', 'tacticGenerateMaiaLine'],
});
const slim = (line) => line.map((m) => ({ uci: m.uci, san: m.san, user: m.isUser, ...(m.source ? { source: m.source } : {}) }));

(async () => {
  for (const c of j.games) {
    const w = world({ Chess, maiaPredict: async (fen) => maiaMove(fen) });
    const chess = new Chess(c.baseFen);
    const moves = c.moves.map((m) => {
      const before = chess.fen();
      const r = chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
      if (!r) throw new Error(`${c.name}: ${m.uci}`);
      return { san: r.san, uci: m.uci, fen: chess.fen(), isUser: m.user, before };
    });
    w.set({ contLine: { baseFen: c.baseFen, moves } });
    // Each judged user move in order; the opponent's move before it gets the previous user move's score after it.
    let lastAfter = null;
    c.moves.forEach((m, i) => {
      if (!m.user) {
        if (lastAfter != null) moves[i]._prevUserAfterCp = lastAfter;
        return;
      }
      if (!m.pvs) { lastAfter = null; return; }
      const preResult = { pvs: m.pvs.map(([cp, firstMove]) => ({ cp, firstMove, depth: 20, moves: firstMove })), bestMove: m.pvs[0][1] };
      w.applySilentEvalToMove({ moveIdx: i, preFen: moves[i].before, userUci: m.uci, postFen: moves[i].fen }, preResult, m.cpLoss ?? 0);
      lastAfter = moves[i].afterCp;
    });
    const cands = w.get('contLine')._tacticCandidates || [];
    const expected = { opponent: moves.map((m, i) => (!m.isUser && m.cpLoss != null ? [i, m.cpLoss, m.wpDrop, m.classification] : null)).filter(Boolean), candidates: [] };
    for (const cand of cands) {
      const analyzeFn = async (fen, _d, mpv) => analyse(fen, mpv);
      const result = await w.tacticBuildBestChain(analyzeFn, cand, 20);
      const out = { moveIdx: cand.moveIdx, gapWp: cand.gapWp, oppCpLoss: cand.oppCpLoss, bestMoveUci: cand.bestMoveUci, primary: slim(result.moves), raw: result.alternativeLines.map(slim) };
      if (result.moves.filter((m) => m.isUser).length >= 2) {
        let alts = w.tacticDedupeAltLines(result.moves, result.alternativeLines);
        out.deduped = alts.map(slim);
        const maiaChain = await w.tacticGenerateMaiaLine(analyzeFn, cand, result.moves, 20, { canceled: false });
        out.maia = maiaChain ? slim(maiaChain) : null;
        if (maiaChain) {
          const combined = w.tacticDedupeAltLines(result.moves, [...alts, maiaChain]);
          if (combined.length > alts.length) alts = combined.slice(0, 3);
        }
        out.lines = alts.map(slim);
        out.userFound = moves[cand.moveIdx].uci === result.moves[0].uci;
      }
      expected.candidates.push(out);
    }
    c.expected = expected;
  }
  j.engine = engine;
  j.maia = maia;
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
  console.log(`${j.games.length} games, ${Object.keys(engine).length} engine answers, ${Object.keys(maia).length} Maia answers`);
})();
