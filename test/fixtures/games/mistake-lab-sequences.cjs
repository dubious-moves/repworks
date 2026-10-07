// Runs mistake-lab's own sequence validation (index.html at c525403, `validateSequenceLines`) on
// the cases of sequences.json, and writes each case's `expected` (the warnings' kinds and moves,
// the unverified items' kinds) back into it: node mistake-lab-sequences.cjs <index.html> sequences.json
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
const k = src.indexOf('\nconst SEQ_ALT_WP_THRESHOLD');
const constLine = src.slice(k, src.indexOf('\n', k + 1));
const code = constLine + '\n' + ['cpToWinPct', 'seqPvsForFen', 'seqMoveLabel', 'seqPosLabel', 'validateSequenceLines'].map(fn).join('\n') + '\nreturn validateSequenceLines;';
const strip = (h) => h.replace(/<[^>]+>/g, '');
for (const c of cases) {
  const validate = new Function('analysisNodes', 'evalCacheGet', 'seqWarnLink', 'escHtml', code)({}, (fen) => (c.pvs[fen] ? { pvs: c.pvs[fen] } : null), (_id, html) => html, (s) => s);
  const { warnings, unverified } = validate(c.mlLines);
  c.expected = {
    warnings: warnings.map(strip).map((w) => {
      if (/isn't among/.test(w)) return { kind: 'outside', san: /\d+\.+ (\S+) isn't/.exec(w)[1] };
      if (/loses/.test(w)) return { kind: 'loses', san: /\d+\.+ (\S+) loses/.exec(w)[1] };
      if (/equally good/.test(w)) return { kind: 'uncovered', san: /: (\S+) is equally good/.exec(w)[1] };
      throw new Error(w);
    }),
    unverified: unverified.map(strip).map((u) => (/single PV/.test(u) ? { kind: 'single' } : { kind: 'unchecked', san: /\d+\.+ (\S+)$/.exec(u)[1] })),
  };
}
fs.writeFileSync(casesPath, JSON.stringify(cases, null, 1) + '\n');
