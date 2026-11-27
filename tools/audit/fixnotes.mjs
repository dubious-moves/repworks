// node fixnotes.mjs <in study> <out study>: every leaf's "transposes to" note names where its position really continues (the node with the
// largest subtree, then the earliest chapter and shortest path), "(chapter X)" when that is another chapter; a leaf whose position continues nowhere loses the note.
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, makePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan } = await import(B + 'san.js'); const { makeFen } = await import(B + 'fen.js');
import { readFileSync, writeFileSync } from 'node:fs';
const [inp, out] = process.argv.slice(2); const games = parsePgn(readFileSync(inp, 'utf8'));
const key = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const sz = (n) => n.children.reduce((s, c) => s + 1 + sz(c), 0);
const num = (a) => a.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + s).join(' ');
const conts = new Map(), leaves = [];
games.forEach((g, ci) => { const ch = g.headers.get('ChapterName'); const w = (n, p, path) => { for (const c of n.children) { const q = p.clone(); q.play(parseSan(q, c.data.san)); const pp = path.concat(c.data.san); const k = key(q);
  if (c.children.length) { if (!conts.has(k)) conts.set(k, []); conts.get(k).push({ ch, ci, path: pp, size: sz(c) }); }
  else if ((c.data.comments || []).some((t) => /transposes to/.test(t))) leaves.push({ node: c, k, ch, path: pp }); w(c, q, pp); } }; w(g.moves, startingPosition(g.headers).unwrap(), []); });
let fixed = 0, same = 0, dropped = 0;
for (const l of leaves) {
  const c = (conts.get(l.k) || []).sort((a, b) => b.size - a.size || a.ci - b.ci || a.path.length - b.path.length)[0];
  const note = c ? 'transposes to ' + num(c.path) + (c.ch === l.ch ? '' : ` (chapter ${c.ch})`) : null;
  const before = (l.node.data.comments || []).find((t) => /transposes to/.test(t));
  l.node.data.comments = (l.node.data.comments || []).filter((t) => !/transposes to/.test(t)).concat(note ? [note] : []);
  if (!note) { dropped++; console.log('  no continuation:', l.ch, '|', l.path.join(' ')); } else if (before.replace(/\s+/g, ' ').trim() === note) same++; else fixed++;
}
writeFileSync(out, games.map((x) => makePgn(x).trim()).join('\n\n') + '\n'); console.log({ notes: leaves.length, fixed, same, dropped });
