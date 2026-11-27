// node comdump.mjs <study> "<prefix SAN path>": every node under the prefix that has a comment, with its full line
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js');
const [f, pre] = process.argv.slice(2); const g = parsePgn(readFileSync(f, 'utf8')).find((x) => x.headers.get('ChapterName') === 'Jobava simplified');
const want = pre.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/); let n = g.moves;
for (const s of want) { n = n.children.find((c) => c.data.san === s); if (!n) { console.log('not found', s); process.exit(1); } }
const num = (i, s) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s);
const walk = (n, path) => { for (const c of n.children) { const p = [...path, c.data.san]; if ((c.data.comments || []).length) console.log(p.map((s, i) => num(i, s)).join(' ') + '\n   {' + c.data.comments.join(' | ') + '}'); walk(c, p); } };
walk(n, want);
