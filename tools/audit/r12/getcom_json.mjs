// node getcom_json.mjs <study> <paths.json>: {path: comment} for each path (Jobava simplified), "" if none
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js'); const { parseSan, makeSan } = await import(B + 'san.js'); const { startingPosition } = await import(B + 'pgn.js');
const [f, pj] = process.argv.slice(2); const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === 'Jobava simplified');
const out = {};
for (const path of JSON.parse(readFileSync(pj, 'utf8'))) {
  const want = path.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/); let n = g.moves, p = startingPosition(g.headers).unwrap(), ok = true;
  for (const s of want) { const c = n.children.find((c) => { const q = p.clone(); const mv = parseSan(q, c.data.san); return mv && makeSan(q, mv) === s; }); if (!c) { ok = false; break; } p.play(parseSan(p, c.data.san)); n = c; }
  out[path] = ok ? (n.data.comments || []).join(' ') : null; }
console.log(JSON.stringify(out, null, 1));
