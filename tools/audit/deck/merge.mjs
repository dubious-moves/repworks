// node merge.mjs <study.pgn> <out.pgn> <chapter prefix>: the chapters whose name starts with the prefix merged into one game
// (same SAN path -> same node; children and comments of later chapters are added where the path is new; first comments kept)
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn, makePgn, defaultGame, ChildNode } = await import(B + 'pgn.js');
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, pre] = process.argv.slice(2);
const gs = parsePgn(readFileSync(inF, 'utf8')).filter((g) => (g.headers.get('ChapterName') || '').startsWith(pre));
const base = gs[0];
const add = (dst, src) => { for (const c of src.children) { const m = dst.children.find((x) => x.data.san === c.data.san); if (m) add(m, c); else dst.children.push(c); } };
for (const g of gs.slice(1)) add(base.moves, g.moves);
base.headers.set('ChapterName', pre + ' (merged)'); base.headers.set('Event', 'Jobava merged');
writeFileSync(outF, makePgn(base)); console.log('merged', gs.length, 'chapters');
