// Runs mistake-lab's own `generateTodoVariations` (index.html at c525403) on checklist.json's cases
// and writes each case's `expected` back: the study's trie and the explorer's answers come from the
// fixture (its fetches stubbed), chess.js 0.10.3 walks the moves.
// node mistake-lab-checklist.cjs <index.html> checklist.json <a folder with chess.js@0.10.3 installed>
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./mistake-lab-sandbox.cjs');
const [indexHtml, file, chessDir] = process.argv.slice(2);
const { Chess } = require(path.join(chessDir, 'node_modules', 'chess.js'));
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const world = sandbox(indexHtml, {
  state: `var lichessToken = 'x';`,
  globals: ['Chess', 'trieMap', 'explorer', 'setTimeout', 'fetchStudyPGN', 'parseRepertoirePGN', 'fetchExplorerMoves', 'lookupOpeningName'],
  functions: ['generateTodoVariations', 'fenPositionKey', 'isEnPassantPseudoLegal'],
});

(async () => {
  for (const c of j.cases) {
    const trie = new Map(Object.entries(j.trie));
    const w = world({
      Chess,
      trieMap: trie,
      explorer: j.explorer,
      setTimeout: (f) => f(),
      fetchStudyPGN: async () => 'pgn',
      parseRepertoirePGN: () => ({ trie }),
      lookupOpeningName: () => null,
      fetchExplorerMoves: async (fen) => {
        const key = fen.split(' ').slice(0, 4).join(' ');
        const moves = j.explorer[w.fenPositionKey(fen)] || j.explorer[key];
        if (!moves) return { white: 0, draws: 0, black: 0, moves: [] };
        const sum = (k) => moves.reduce((s, m) => s + m[k], 0);
        return { white: sum('white'), draws: sum('draws'), black: sum('black'), moves };
      },
    });
    const r = await w.generateTodoVariations('study', j.color, { targetPly: c.targetPly, maxVariations: c.maxVariations, excludeLeafKeys: c.exclude });
    const v = (x) => [x.leafKey, x.lineSan.join(' '), Number(x.cumProb.toFixed(10))];
    c.expected = { variations: r.variations.map(v), reserve: r.reserve.map(v), gaps: r.gaps.map((g) => [g.lineSan.join(' '), Number(g.reachProb.toFixed(10))]) };
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
  for (const c of j.cases) console.log(c.name, JSON.stringify(c.expected.variations.map((x) => x[1])), 'reserve', c.expected.reserve.length, 'gaps', c.expected.gaps.length);
})();
