import { merge, clone, MARK } from './merge.mjs';
let seed = Number(process.argv[2] || 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const SANS = ['e4', 'd4', 'c4', 'Nf3', 'e5', 'c5', 'Nc6', 'd5'];
function gen(d) { const n = { san: '', comment: rnd() < .3 ? 'c' + Math.floor(rnd() * 99) : '', nags: rnd() < .2 ? [1] : [], shapes: rnd() < .2 ? ['Ge2e4'] : [], children: [] };
  if (d > 0) { const k = Math.floor(rnd() * 3); const used = new Set(); for (let i = 0; i < k; i++) { const s = pick(SANS); if (used.has(s)) continue; used.add(s); const c = gen(d - 1); c.san = s; n.children.push(c); } } return n; }
function all(n, p = []) { return [[n, p], ...n.children.flatMap(c => all(c, [...p, c.san]))]; }
function edit(t) { const nodes = all(t); const [n, p] = pick(nodes); const r = rnd();
  if (r < .25) { const s = pick(SANS); if (!n.children.some(c => c.san === s)) n.children.push({ san: s, comment: '', nags: [], shapes: [], children: [] }); return; }
  if (r < .45 && p.length) { const [par] = all(t).find(([, q]) => q.join(' ') === p.slice(0, -1).join(' ')); par.children = par.children.filter(c => c.san !== n.san); return; }
  if (r < .65) { n.comment = 'x' + Math.floor(rnd() * 1e6); return; }
  if (r < .75) { n.nags = n.nags.includes(2) ? [] : [2]; return; }
  if (r < .85) { n.shapes = n.shapes.includes('Rd7d5') ? n.shapes.filter(x => x !== 'Rd7d5') : [...n.shapes, 'Rd7d5']; return; }
  if (n.children.length > 1) n.children.reverse(); }
const idx = t => new Map(all(t).map(([n, p]) => [p.join(' '), n]));
let runs = 0, fails = 0, conflicts = 0, keptN = 0;
for (let i = 0; i < 20000; i++) {
  const B = gen(4), O = clone(B), T = clone(B);
  for (let k = Math.floor(rnd() * 6); k > 0; k--) edit(O);
  for (let k = Math.floor(rnd() * 6); k > 0; k--) edit(T);
  const { tree: R, conflicts: cs } = merge(B, O, T); runs++; conflicts += cs.filter(c => c.kind === 'text').length; keptN += cs.filter(c => c.kind === 'kept').length;
  const iB = idx(B), iO = idx(O), iT = idx(T), iR = idx(R);
  const err = [];
  for (const [S, other, name] of [[iO, iT, 'ours'], [iT, iO, 'theirs']]) for (const [k, n] of S) {
    if (!iB.has(k) && !iR.has(k)) err.push(`lost addition ${name} ${k}`);
    const b = iB.get(k);
    if (iR.has(k) && (!b || n.comment !== b.comment) && n.comment && !iR.get(k).comment.includes(n.comment)) err.push(`lost text ${name} ${k}`);
  }
  for (const [k] of iB) { if (k === '') continue;
    for (const [S, other] of [[iO, iT], [iT, iO]]) if (!other.has(k) && S.has(k)) {
      const touched = [...S].some(([q, n]) => (q === k || q.startsWith(k + ' ')) && (!iB.has(q) || iB.get(q).comment !== n.comment || iB.get(q).nags.join() !== n.nags.join() || iB.get(q).shapes.slice().sort().join() !== n.shapes.slice().sort().join()));
      if (!touched && iR.has(k)) err.push(`delete not honoured ${k}`);
    } }
  // identity laws
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (same(O, B) && !same(merge(B, O, T).tree, T)) err.push('merge(B,B,T) != T');
  if (!same(merge(B, B, T).tree, T)) err.push('identity B,B,T');
  if (!same(merge(B, O, B).tree, O)) err.push('identity B,O,B');
  if (!same(merge(B, O, O).tree, O)) err.push('identity B,O,O');
  if (err.length) { fails++; if (fails <= 3) console.log('FAIL', err.slice(0, 3)); }
}
console.log({ runs, fails, textConflicts: conflicts, keptAfterDelete: keptN });
