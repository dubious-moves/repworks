// Runs mistake-lab's own practice rules (index.html at c525403) on the cases of practice.json and
// writes each case's `expected` back into it: `pickExplorerMove` (its defaults: 5 games, 5%),
// `maiaSampleMove` (on the probabilities' logarithms), `updateAdvantageTracking` with
// `finishAdvantage`'s grade, `buildContLineReviewData`, and `evalToResult`. Math.random is replaced
// by each case's draw. node mistake-lab-practice.cjs <index.html> practice.json
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const casesPath = process.argv[3];
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
function fn(name) {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start < 0) throw new Error(name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}
function constant(name) {
  const k = src.indexOf(`\nconst ${name} =`);
  if (k < 0) throw new Error(name);
  let i = src.indexOf('=', k), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === ';' && depth === 0) break; }
  return src.slice(k, i + 1);
}
// Every name the cut code doesn't define is a no-op (the page's UI); the state it reads is declared here.
const stub = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : stub), apply: () => stub });
const state = `var explorerMinGames = 5, explorerMinFreq = 0.05, advantageMinCpReached = null, advantageConsecutiveAbove1000 = 0,
  advantageMode = true, repTodoActive = false, hintUsed = false, srsRecorded = false, currentMistakeIdx = 0,
  filteredMistakes = [], contLine = null, repertoireTrie = new Map(), gistData = { repertoire: { dismissed: [] } },
  silentContinuation = true, continuationMode = true, voiceMode = false, lastContUserAfterCp = null, graded = [], claimShown = 0;
  var recordReview = (pid, g) => { graded.push(g); return {}; };
  var showAdvantageClaimButton = () => { claimShown++; };
  var posId = () => 'pid';`;
const names = ['cpToWinPct', 'pickExplorerMove', 'maiaSampleMove', 'updateAdvantageTracking', 'finishAdvantage', 'buildContLineReviewData', 'evalToResult', 'fenPositionKey', 'isEnPassantPseudoLegal', 'isRepertoireMove'];
const code = [state, constant('MOVE_CLASSIFICATION'), constant('FSRS_GRADE'), ...names.map(fn)].join('\n');
const local = new Set(['o', 'k', 'sandbox', 'eval', 'Math', 'JSON', 'Object', 'Set', 'Map', 'Array', 'Number', 'String', 'parseInt', 'console', 'Infinity', 'undefined', 'NaN', 'isFinite', 'Error']);
for (const m of code.matchAll(/(?:^|\n)\s*(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
for (const m of state.matchAll(/([A-Za-z_$][\w$]*)\s*=/g)) local.add(m[1]);
const sandbox = new Proxy({}, { has: (_t, k) => typeof k === 'string' && !local.has(k), get: (_t, k) => (k === Symbol.unscopables ? undefined : stub) });
function world() {
  // A fresh copy of the page's state for each case.
  return new Function('sandbox', `with (sandbox) { ${code}\n return { pickExplorerMove, maiaSampleMove, updateAdvantageTracking, finishAdvantage, buildContLineReviewData, evalToResult,
    set(o) { for (const k in o) eval(k + ' = o[k]'); }, get(k) { return eval(k); } }; }`)(sandbox);
}
const withRandom = (r, f) => { const old = Math.random; Math.random = () => r; try { return f(); } finally { Math.random = old; } };

for (const c of cases.explorer) {
  const w = world();
  const picked = withRandom(c.rnd, () => w.pickExplorerMove(c.data));
  c.expected = picked ? picked.uci : null;
}
for (const c of cases.maia) {
  const w = world();
  c.expected = withRandom(c.rnd, () => w.maiaSampleMove(c.probs.map(Math.log), c.probs.map(() => 1), c.precision));
}
for (const c of cases.advantage) {
  const w = world();
  w.set({ filteredMistakes: [{ playerColor: 'white' }], advantageMinCpReached: c.peak });
  let collapsedAt = -1, claimAt = -1;
  c.steps.forEach(([cp, wp], i) => {
    if (!w.get('advantageMode')) return;
    w.updateAdvantageTracking(cp, wp);
    if (!w.get('advantageMode') && collapsedAt < 0) collapsedAt = i;
    if (w.get('claimShown') && claimAt < 0) claimAt = i;
  });
  const minCp = w.get('advantageMinCpReached');
  const above = w.get('advantageConsecutiveAbove1000');
  if (w.get('advantageMode')) w.finishAdvantage(c.end);
  const g = w.get('graded');
  c.expected = { collapsedAt, claimAt, minCp, above, grade: g.length ? g[0] : null };
}
for (const c of cases.review) {
  const w = world();
  w.set({ repertoireTrie: new Map(Object.entries(c.trie)), contLine: { baseFen: c.baseFen, moves: c.moves.map((m) => ({ ...m })) } });
  const d = w.buildContLineReviewData();
  const moves = w.get('contLine').moves;
  c.expected = { tally: d.tally, accuracy: d.accuracy, keyMoves: d.keyMoves, deviations: moves.map((m, i) => (m._repDeviation ? [i, m._repDeviation.uci] : null)).filter(Boolean), evalPoints: d.evalPoints.map((p) => ({ idx: p.idx, cp: p.cp })) };
}
for (const c of cases.results) {
  const w = world();
  w.set({ filteredMistakes: [{ playerColor: c.color }] });
  c.expected = w.evalToResult(c.cp === null ? null : c.color === 'white' ? c.cp : -c.cp);
}
fs.writeFileSync(casesPath, JSON.stringify(cases, null, 1) + '\n');
