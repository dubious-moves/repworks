import { merge, clone } from './merge.mjs';
let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const SANS = ['e4', 'd4', 'c4', 'Nf3', 'e5', 'c5', 'Nc6', 'd5'];
const all = (n, p = []) => [[n, p], ...n.children.flatMap(c => all(c, [...p, c.san]))];
function edit(t) { const [n, p] = pick(all(t)); const r = rnd();
  if (r < .3) { const s = pick(SANS); if (!n.children.some(c => c.san === s)) n.children.push({ san: s, comment: '', nags: [], shapes: [], children: [] }); }
  else if (r < .45 && p.length) { const [par] = all(t).find(([, q]) => q.join(' ') === p.slice(0, -1).join(' ')); par.children = par.children.filter(c => c.san !== n.san); }
  else if (r < .8) n.comment = 'x' + Math.floor(rnd() * 1e6);
  else n.nags = n.nags.length ? [] : [3]; }
const J = JSON.stringify; let diverged = 0, nested = 0;
for (let run = 0; run < 3000; run++) {
  let remote = { v: 0, tree: { san: '', comment: '', nags: [], shapes: [], children: [] } };
  const dev = [0, 1].map(() => ({ base: { v: 0, tree: clone(remote.tree) }, local: clone(remote.tree) }));
  const sync = d => { if (d.base.v === remote.v) remote = { v: remote.v + 1, tree: clone(d.local) };
    else remote = { v: remote.v + 1, tree: merge(d.base.tree, d.local, remote.tree).tree };
    d.base = { v: remote.v, tree: clone(remote.tree) }; d.local = clone(remote.tree); };
  for (let step = 0; step < 30; step++) { const d = pick(dev); if (rnd() < .7) edit(d.local); else sync(d); }
  sync(dev[0]); sync(dev[1]); sync(dev[0]);
  if (J(dev[0].local) !== J(dev[1].local) || J(dev[0].local) !== J(remote.tree)) diverged++;
}
// lost ack: device pushed S, did not hear back, and re-merges its own change against the new head
for (let run = 0; run < 3000; run++) {
  const B = { san: '', comment: 'b', nags: [], shapes: [], children: [] }; const S = clone(B); S.comment = 'mine';
  const X = clone(B); X.comment = 'other'; const R = merge(B, S, X).tree;   // remote now holds a marker
  if (merge(B, S, R).tree.comment !== R.comment) { nested++; break; }
}
console.log({ convergenceRuns: 3000, diverged, lostAckNestsMarkers: nested > 0 });
