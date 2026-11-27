import { readFileSync, writeFileSync } from 'node:fs';
import { parseChapterFile } from '/home/user/repworks/src/core/pgn/parse.ts';
import { chapterFileText } from '/home/user/repworks/src/core/pgn/write.ts';
const [f, id] = process.argv.slice(2) as string[];
const p = parseChapterFile(readFileSync(f, 'utf8'), id); if (!p.ok) throw new Error(p.reason);
let n: any = p.chapter.root; for (const s of 'Nc3 d5 d4 Nf6 Bf4 c6 e3 g6 h4 Bg7 Bd3'.split(' ')) n = n.children.find((c: any) => c.san === s);
const i = n.comments.findIndex((c: string) => c.includes('Against ...h5 or ...Nbd7, Nf3: (6... Nbd7 7. Nf3)')); if (i < 0) throw new Error('not found');
n.comments[i] = n.comments[i].replace('Against ...h5 or ...Nbd7, Nf3:', 'Against ...Nbd7, Nf3:'); writeFileSync(f, chapterFileText(p.chapter)); console.log('fixed');
