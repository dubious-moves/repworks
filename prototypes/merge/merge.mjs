// Spike: three-way merge of move trees keyed by path (DECISIONS D4 rules). Not project code.
// node = { san, comment, nags:Set-like array, shapes:array, children:[] }; root has san ''.
export const clone = n => ({ san: n.san, comment: n.comment, nags: [...n.nags], shapes: [...n.shapes], children: n.children.map(clone) });
const key = (path) => path.join(' ');
function index(root) { const m = new Map(); (function w(n, p) { m.set(key(p), { n, p }); n.children.forEach(c => w(c, [...p, c.san])); })(root, []); return m; }
const setEq = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const attrsEq = (a, b) => a.comment === b.comment && setEq(a.nags, b.nags) && setEq(a.shapes, b.shapes);
const setMerge = (b, o, t) => { const all = [...new Set([...o, ...t, ...b])]; return all.filter(x => (o.includes(x) && t.includes(x)) || (o.includes(x) && !b.includes(x)) || (t.includes(x) && !b.includes(x))); };
export const MARK = '<<<<<<<';
// edited(side, base): paths whose node is new or whose attributes changed vs base
function editedPaths(S, B) { const e = new Set(); for (const [k, { n }] of S) { const b = B.get(k); if (!b || !attrsEq(n, b.n)) e.add(k); } return e; }
const isPrefix = (a, b) => a === '' || b === a || b.startsWith(a + ' ');
export function merge(base, ours, theirs) {
  const B = index(base), O = index(ours), T = index(theirs);
  const eO = editedPaths(O, B), eT = editedPaths(T, B);
  const keep = new Map(); const kept = [];
  const consider = (S, other, edits) => { for (const [k, v] of S) {
      if (keep.has(k)) continue;
      if (other.has(k) || !B.has(k)) { keep.set(k, true); continue; }             // present both / added on this side
      if ([...edits].some(e => isPrefix(k, e))) { keep.set(k, true); kept.push(k); } // edit beats delete
  } };
  consider(O, T, eO); consider(T, O, eT);
  const conflicts = [];
  function build(k, p) {
    const o = O.get(k)?.n, t = T.get(k)?.n, b = B.get(k)?.n;
    const base0 = b || { comment: '', nags: [], shapes: [] };
    const oo = o || null, tt = t || null;
    let comment;
    const oc = oo ? oo.comment : null, tc = tt ? tt.comment : null;
    if (oc === null) comment = tc; else if (tc === null) comment = oc;
    else if (oc === tc) comment = oc; else if (oc === base0.comment) comment = tc; else if (tc === base0.comment) comment = oc;
    else { comment = `${MARK} theirs\n${tc}\n=======\n${oc}\n>>>>>>> ours`; conflicts.push({ k, kind: 'text' }); }
    const nags = (oo && tt) ? setMerge(base0.nags, oo.nags, tt.nags) : (oo || tt).nags.slice();
    const shapes = (oo && tt) ? setMerge(base0.shapes, oo.shapes, tt.shapes) : (oo || tt).shapes.slice();
    // children: kept child keys, order = ours where ours reordered the common ones, else theirs
    const kidsOf = n => n ? n.children.map(c => c.san) : [];
    const ko = kidsOf(oo), kt = kidsOf(tt), kb = kidsOf(b);
    const keepSan = s => keep.has(key([...p, s]));
    const common = s => ko.includes(s) && kt.includes(s);
    const oCommon = ko.filter(common), tCommon = kt.filter(common), bCommon = kb.filter(common);
    let order = (oCommon.join() !== bCommon.join()) ? oCommon : tCommon;
    for (const [list] of [[ko], [kt]]) for (let i = 0; i < list.length; i++) { const s = list[i]; if (order.includes(s)) continue;
      const prev = list.slice(0, i).reverse().find(x => order.includes(x)); const at = prev === undefined ? 0 : order.indexOf(prev) + 1; order.splice(at, 0, s); }
    order = order.filter(keepSan);
    const node = { san: p.length ? p[p.length - 1] : '', comment, nags, shapes, children: order.map(s => build(key([...p, s]), [...p, s])) };
    if (kept.includes(k) && !(keep.has(key(p.slice(0, -1))) && kept.includes(key(p.slice(0, -1))))) { node.comment = (node.comment ? node.comment + '\n' : '') + `${MARK} kept: deleted on the other side`; conflicts.push({ k, kind: 'kept' }); }
    return node;
  }
  return { tree: build('', []), conflicts, kept };
}
