// Runs mistake-lab's own engine line (index.html at c525403) on the cases of engineline.json and
// writes back each case's `expected`: `buildEngineLine`, then the steps a user takes on it
// (`lineStep`, `goToMainLineMove`, `goToAltLineMove`, `handleEngineLineBranch`, and the extension
// past the line's end, `extendEngineLine` with `prepareEngineLineExtension`), the state after each.
// Stockfish is a stand-in that gives a fixed legal line for each position (the first move by a
// hash of the FEN, eight plies); every answer it gave is written to `engine`, so the port's test
// asks the same. node mistake-lab-engineline.cjs <index.html> engineline.json <dir with chess.js>
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./mistake-lab-sandbox.cjs');
const [indexHtml, file, chessDir] = process.argv.slice(2);
const { Chess } = require(path.join(chessDir, 'node_modules', 'chess.js'));
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const keyOf = (fen) => fen.split(' ').slice(0, 3).join(' ');
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const engine = {};
function answer(fen) {
  const k = keyOf(fen);
  if (!engine[k]) {
    const c = new Chess(fen);
    const moves = [];
    for (let i = 0; i < 8; i++) {
      const legal = c.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || '')).sort();
      if (!legal.length) break;
      const uci = legal[hash(c.fen()) % legal.length];
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      moves.push(uci);
    }
    engine[k] = { moves: moves.join(' '), cp: (hash(k) % 601) - 300 };
  }
  return engine[k];
}
const result = (fen) => (new Chess(fen).game_over() ? { pvs: [] } : { pvs: [answer(fen)] });

const state = `var engineLine = null, sfReady = true, browsingLine = false, afterMoveCpWhite = null, evalBarEnabled = false,
  evalBarRevealed = false, tacticMode = false, _extendingLine = false, retried = 0;
  var tryAgainFromLine = () => { retried++; }, tacticTryAgain = () => { retried++; };`;
const world = sandbox(indexHtml, {
  state,
  globals: ['Chess', 'window', 'sfAnalyze', 'sfAnalyzeAdaptive', 'setTimeout'],
  constants: ['ENGINE_LINE_PLY'],
  functions: ['buildEngineLine', 'getEngineLineFen', 'getActivePathLength', 'getActiveMoveAt', 'handleEngineLineBranch', 'parseSfContinuation', 'prepareEngineLineExtension', 'extendEngineLine', '_doExtendEngineLine', 'goToLineMove', 'goToMainLineMove', 'goToAltLineMove', 'lineStep'],
});
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

function snapshot(w) {
  const el = w.get('engineLine');
  if (!el) return null;
  return {
    idx: el.currentIdx,
    alt: el.activeAlt,
    fen: keyOf(w.getEngineLineFen()),
    main: el.moves.map((m) => m.san),
    alts: el.alternatives.map((a) => ({ branchIdx: a.branchIdx, sans: a.moves.map((m) => m.san), cpWhite: a.cpWhite ?? null })),
    cpWhite: el.cpWhite,
    retried: w.get('retried'),
  };
}

(async () => {
  for (const c of j.cases) {
    const w = world({ Chess, window: {}, setTimeout: (f) => f(), sfAnalyze: async (fen) => result(fen), sfAnalyzeAdaptive: async (fen) => result(fen) });
    const chess = new Chess(c.baseFen);
    const mv = chess.move({ from: c.user.slice(0, 2), to: c.user.slice(2, 4), promotion: c.user[4] });
    // The continuation: the engine's line after the move (the site's search), unless the case gives one.
    const cont = c.cont ?? answer(chess.fen()).moves;
    const after = c.cont ? 0 : answer(chess.fen()).cp;
    const cpWhite = chess.turn() === 'w' ? after : -after;
    w.buildEngineLine(c.baseFen, { from: mv.from, to: mv.to, promotion: mv.promotion, san: mv.san }, cont, cpWhite, c.startIdx != null ? { startIdx: c.startIdx, animate: false } : {});
    if (w.get('engineLine') && c.wrongMove) w.get('engineLine').wrongMove = true;
    await flush();
    const steps = [snapshot(w)];
    const ops = [];
    for (const op of c.ops) {
      if (op[0] === 'step') w.lineStep(op[1]);
      else if (op[0] === 'main') w.goToMainLineMove(op[1]);
      else if (op[0] === 'alt') w.goToAltLineMove(op[1], op[2]);
      else {
        // A move on the board: the active line's next move, the main line's, an alternative's first, or another.
        const el = w.get('engineLine');
        const at = el.currentIdx;
        const fen = at === -1 ? el.baseFen : w.getEngineLineFen();
        const next = w.getActiveMoveAt(at + 1)?.uci;
        let uci = op[1];
        if (op[0] === 'next') uci = next;
        else if (op[0] === 'mainNext') uci = el.moves[at + 1].uci;
        else if (op[0] === 'altFirst') uci = el.alternatives[op[1]].moves[0].uci;
        else if (op[0] === 'other') {
          const taken = new Set([next, el.moves[at + 1]?.uci, ...el.alternatives.filter((a) => a.branchIdx === at).map((a) => a.moves[0]?.uci)]);
          uci = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || '')).sort().find((u) => !taken.has(u));
        }
        await w.handleEngineLineBranch(uci.slice(0, 2), uci.slice(2, 4));
        ops.push(['move', uci]);
        await flush();
        steps.push(snapshot(w));
        continue;
      }
      ops.push(op);
      await flush();
      steps.push(snapshot(w));
    }
    c.expected = { cont, cpWhite, ops, steps };
  }
  j.engine = engine;
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
  console.log(`${j.cases.length} cases, ${Object.keys(engine).length} engine answers`);
})();
