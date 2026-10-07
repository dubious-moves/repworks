// Runs mistake-lab's own extraction (index.html at c525403) on an analyzer games file.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const file = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
function fn(name) {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start < 0) throw new Error(name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}
const a = src.indexOf('  // ── Advantage capitalization: filter candidates');
const b = src.indexOf('  // Restore game references');
const advantage = src.slice(a, b);
const code = ['cpToWinPct','evalToCp','detectPlayerColor','getGameResultInfo','fenPositionKey','isEnPassantPseudoLegal','extractMistakesForGame'].map(fn).join('\n')
 + `\nfunction run(allGames){ let rawMistakes=[]; const advantageCandidates={};
  for (const game of allGames){ const r=extractMistakesForGame(game); rawMistakes.push(...r.mistakes); advantageCandidates[game.id]=r.advantageCandidate; }
  ${advantage}
  return rawMistakes; }`;
const Chess = require('chess.js').Chess;
const knownUsernames = new Set(file.usernames.map(u => u.toLowerCase()));
const MISTAKES_CACHE_PARAMS = { wpDropThreshold: 10, advantageThreshold: 300, advantageMinMoves: 2 };
const run = new Function('Chess','knownUsernames','MISTAKES_CACHE_PARAMS','isRepertoireMove','getInvalidatedMistakes','console', code + '\nreturn run;')(Chess, knownUsernames, MISTAKES_CACHE_PARAMS, () => false, () => new Set(), { log(){}, warn(){} });
const items = run(file.games);
const out = {};
for (const g of file.games) out[g.id] = [];
for (const m of items) {
  const prefix = m.type === 'tactic' ? 't' : m.type === 'advantage' ? 'a' : '';
  const o = { pid: `${m.gameId}_${prefix}${m.movePly}`, type: m.type };
  if (m.type === 'mistake') Object.assign(o, { san: m.sanPlayed, wpDrop: m.wpDrop, cpBefore: m.cpBefore, cpAfter: m.cpAfter, timeTrouble: m.timeTrouble });
  if (m.type === 'advantage') Object.assign(o, { peakCp: m.peakCp });
  out[m.gameId].push(o);
}
console.log(JSON.stringify(out, null, 1));
