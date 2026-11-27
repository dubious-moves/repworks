// node pe/summ.mjs <report.json> [threshold]: played move (first candidate of the input) vs the rest.
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const th = Number(process.argv[3] || 1);
const out = { close: [], swap: [], keep: [] };
for (const p of r.positions) {
  const c = p.candidates.filter(x => typeof x.value === 'number');
  if (c.length < 2) { out.keep.push([p.label, 'single']); continue; }
  const played = c[0];
  const best = c.slice(1).reduce((a, b) => (b.value > a.value ? b : a));
  const gap = best.value - played.value;
  const row = `${p.label.padEnd(5)} ${played.san} ${played.value.toFixed(1)} vs ${best.san} ${best.value.toFixed(1)} (gap ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}; prep ${(played.prepScore*100).toFixed(1)}/${(best.prepScore*100).toFixed(1)}; cdb ${played.cdb}/${best.cdb}) ${p.line}`;
  if (Math.abs(gap) < th) out.close.push(row); else if (gap > 0) out.swap.push(row); else out.keep.push(row);
}
for (const k of ['close', 'swap']) { console.log(`== ${k}: ${out[k].length}`); out[k].forEach(x => console.log(x)); }
console.log(`== keep (played clearly best): ${out.keep.length}`);
console.log(out.keep.map(x => Array.isArray(x) ? x.join(' ') : x.split(' ')[0]).join(' '));
