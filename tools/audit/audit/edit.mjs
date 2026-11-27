// node edit.mjs <in.pgn> <ops.json> <out.pgn>: edit one chapter of a study.
// ops: { chapter, cut: [{at, mode: "children"|"node"}], lines: [<pgn file>...], comments: [{at, comment}] } applied in that order.
// Paths are SAN move lists from the start ("1. e4 e5 2. Nf3 ..."). New nodes from lines keep the line's comments; existing nodes keep theirs.
import { readFileSync, writeFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, makePgn, startingPosition, ChildNode } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const [inF, opsF, outF] = process.argv.slice(2);
const ops = JSON.parse(readFileSync(opsF, 'utf8'));
const games = parsePgn(readFileSync(inF, 'utf8'));
const g = games.find((x) => x.headers.get('ChapterName') === ops.chapter); if (!g) throw new Error('no chapter ' + ops.chapter);
const sans = (s) => s.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
const norm = (pos, san) => { const m = parseSan(pos, san); if (!m) return null; return makeSan(pos, m); };
function find(path) { let n = g.moves, p = startingPosition(g.headers).unwrap(), parent = null;
  for (const s of sans(path)) { const want = norm(p, s); if (!want) throw new Error('illegal ' + s + ' in ' + path); const c = n.children.find((x) => norm(p, x.data.san) === want); if (!c) return null; parent = n; p.play(parseSan(p, want)); n = c; }
  return { node: n, parent, pos: p }; }
const log = [];
for (const c of ops.cut || []) { const f = find(c.at); if (!f) { log.push('CUT MISSING ' + c.at); continue; }
  if (c.mode === 'node') { f.parent.children = f.parent.children.filter((x) => x !== f.node); log.push('cut node ' + c.at); } else { log.push(`cut ${f.node.children.length} children below ` + c.at); f.node.children = []; } }
let added = 0;
for (const file of ops.lines || []) for (const lg of parsePgn(readFileSync(file, 'utf8'))) {
  let n = g.moves, p = startingPosition(g.headers).unwrap(), ln = lg.moves;
  while (ln.children.length) { const lc = ln.children[0]; const want = norm(p, lc.data.san); if (!want) throw new Error('illegal ' + lc.data.san + ' in ' + lg.headers.get('Event'));
    let c = n.children.find((x) => norm(p, x.data.san) === want);
    if (!c) { c = new ChildNode({ san: want, comments: (lc.data.comments || []).slice(), nags: lc.data.nags || [] }); n.children.push(c); added++; }
    else if ((lc.data.comments || []).length && !(c.data.comments || []).length) log.push('NOTE line comment on existing node ignored: ' + want);
    p.play(parseSan(p, want)); n = c; ln = lc; } }
log.push('nodes added ' + added);
for (const c of ops.comments || []) { const f = find(c.at); if (!f) { log.push('COMMENT MISSING ' + c.at); continue; } f.node.data.comments = c.comment ? [c.comment] : []; }
log.push('comments set ' + (ops.comments || []).length);
writeFileSync(outF, games.map((x) => makePgn(x).trim()).join('\n\n') + '\n'); console.log(log.join('\n'));
