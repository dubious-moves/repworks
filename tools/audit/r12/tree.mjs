// node tree.mjs <pgn> <chapter|-> "<path>" [maxdepth]: print the subtree below path with comments (first 60 chars)
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, startingPosition } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js');
const [f, ch, path, md = '40'] = process.argv.slice(2);
const games = parsePgn(readFileSync(f, 'utf8')); const g = ch === '-' ? games[0] : games.find((x) => x.headers.get('ChapterName') === ch);
const want = path.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
function walk(n, p, sans, ind) {
  for (const c of n.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (!mv) { console.log(ind + '?? ' + c.data.san); continue; } const s = makeSan(q, mv); q.play(mv); const ns = [...sans, s];
    const onPath = ns.length <= want.length ? want.slice(0, ns.length).every((x, i) => x === ns[i]) : want.every((x, i) => x === ns[i]);
    if (!onPath) continue;
    if (ns.length > want.length) { if (ns.length - want.length > +md) continue; const k = ns.length; const lab = (k % 2 ? `${(k + 1) / 2}.` : `${k / 2}...`) + s; const cm = (c.data.comments || []).join(' ').replace(/\n/g, ' / ');
      console.log(ind + lab + (cm ? '   {' + cm.slice(0, 140) + '}' : '')); walk(c, q, ns, ind + '  '); }
    else walk(c, q, ns, ind); } }
walk(g.moves, startingPosition(g.headers).unwrap(), [], '');
