// node fixes.ts <chapter file> <id>: two comment fixes from the owner's review, written in the app's form
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChapterFile } from '/home/user/repworks/src/core/pgn/parse.ts';
import { chapterFileText } from '/home/user/repworks/src/core/pgn/write.ts';
const [f, id] = process.argv.slice(2) as string[];
const p = parseChapterFile(readFileSync(f, 'utf8'), id); if (!p.ok) throw new Error(p.reason);
const find = (path: string) => { let n: any = p.chapter.root; for (const s of path.split(' ')) { n = n.children.find((c: any) => c.san === s); if (!n) throw new Error('no ' + s + ' in ' + path); } return n; };
const fix = (path: string, from: string, to: string) => { const n = find(path); const i = n.comments.findIndex((c: string) => c.includes(from)); if (i < 0) throw new Error('text not found at ' + path); n.comments[i] = n.comments[i].replace(from, to); console.log('fixed', path.split(' ').length, 'plies:', to.slice(0, 60)); };
const B = 'Nc3 d5 d4 Nf6 Bf4 Bf5 e3 e6 Nf3 c5 Nb5 Na6 c3';
fix(B, 'With the c8-bishop on f5 and the knight on a6', 'With the bishop on f5 and the knight on a6');
fix(B + ' c4 Qa4 Nd7 b3 cxb3 axb3 Be7 Nd6+ Bxd6 Bxd6', "Against ...Qb6, which hits it, Ba3 keeps it on the f8 diagonal.", "Against ...Qb6, which hits it, Bxa6 takes the knight: after ...bxa6 Qxa6 we are a pawn up, and after ...Qxd6, Bxb7 hits the a8-rook.");
writeFileSync(f, chapterFileText(p.chapter));
