// node report.mjs <review.json>: the flags of a chapter review
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const winp = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const num = (p) => p.split(' ').map((s, i) => (i % 2 ? '' : (i / 2 + 1) + '.') + s).join(' ');
const pct = (x) => (100 * x).toFixed(1);
const fmtR = (x) => (x * 100 < 0.01 ? (x * 100).toFixed(4) : (x * 100).toFixed(3)) + '%';
console.log(`White decisions: ${r.white.length}`);
const flagged = [];
for (const d of r.white) {
  const f = [];
  if (d.best && d.cp != null && d.best.san !== d.move && winp(d.best.cp) - winp(d.cp) > 5) f.push(`ENGINE: ChessDB ${d.best.san} ${d.best.cp} vs ours ${d.cp}`);
  if (d.cp != null && d.cp <= -50) f.push(`WORSE: ChessDB ${d.cp}`);
  for (const a of d.alts) if (a.n >= 100 && d.n >= 100 && a.w - d.w >= 0.04) f.push(`SCORE: ${a.san} ${pct(a.w)}% (${a.n} games, rating ${a.r}, cdb ${a.cp}) vs ours ${pct(d.w)}% (${d.n}, rating ${d.r})`);
  if (d.n < 30) f.push(`THIN: ${d.n} games`);
  if (f.length) flagged.push({ d, f });
}
flagged.sort((a, b) => b.d.reach - a.d.reach);
for (const { d, f } of flagged) console.log(`\n${num(d.path)} ${d.move}  [reach ${fmtR(d.reach)}, ${d.total} games; ours ${pct(d.share)}% played, ${d.w == null ? '-' : pct(d.w)}%, cdb ${d.cp}]\n   ` + f.join('\n   '));
const unc = r.uncovered.filter((u) => !u.transposes).sort((a, b) => b.reach - a.reach);
console.log(`\nUncovered Black replies 2%+ (no transposition): ${unc.length}; the ones with most reach:`);
unc.slice(0, 15).forEach((u) => console.log(`   ${num(u.path)}  share ${pct(u.share)}%, reach ${fmtR(u.reach)}, ${u.n} games`));
const ends = r.ends.filter((e) => !e.note).sort((a, b) => b.reach - a.reach);
console.log(`\nLine ends (no transposition note): ${ends.length}; by ply <12/12-19/20-29/30+: ${[0, 12, 20, 30].map((lo, i, a) => ends.filter((e) => e.ply >= lo && e.ply < (a[i + 1] || 999)).length).join('/')}; most reach:`);
ends.slice(0, 10).forEach((e) => console.log(`   ply ${e.ply}  reach ${fmtR(e.reach)}  ${num(e.path)}`));
