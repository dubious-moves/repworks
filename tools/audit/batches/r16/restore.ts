// node restore.ts <chapter file> <id>: bring back the three lines the owner asked for, with end comments, in the app's form
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChapterFile } from '/home/user/repworks/src/core/pgn/parse.ts';
import { chapterFileText } from '/home/user/repworks/src/core/pgn/write.ts';
const [f, id] = process.argv.slice(2) as string[];
const p = parseChapterFile(readFileSync(f, 'utf8'), id); if (!p.ok) throw new Error(p.reason);
const node = (san: string) => ({ san, comments: [] as string[], shapes: [], nags: [], startingComments: [], children: [] as any[] });
const find = (path: string) => { let n: any = p.chapter.root; for (const s of path.split(' ')) { n = n.children.find((c: any) => c.san === s); if (!n) throw new Error('no ' + s + ' in ' + path); } return n; };
const add = (at: string, moves: string) => { let n = find(at); for (const s of moves.split(' ')) { let c = n.children.find((x: any) => x.san === s); if (!c) { c = node(s); n.children.push(c); } n = c; } return n; };
const say = (path: string, text: string) => { const n = find(path); if (n.comments.length) throw new Error('already has a comment: ' + path); n.comments = [text]; };
const edit = (path: string, from: string, to: string) => { const n = find(path); const i = n.comments.findIndex((c: string) => c.includes(from)); if (i < 0) throw new Error('text not found at ' + path); n.comments[i] = n.comments[i].replace(from, to); };
const P = 'Nc3 d5 d4 Nf6 Bf4 a6 e3', N = P + ' Nc6 Bd3 Bg4 f3 Bh5 h4', G = 'Nc3 d5 d4 Nf6 Bf4 c6 e3 g6 h4 Bg7 Bd3';
// 1. 7...Bg6 8.g4 (after 7...h6, which stays first)
add(N, 'Bg6 g4');
say(N + ' Bg6 g4', 'After ...Bxd3, take back with the queen, then castle long and Nge2, as in your line on 7.h4. Against ...h6, Bxg6 and Qd3: the same position as after 7...h6.\n(8... Bxd3 9. Qxd3 e6 10. O-O-O Bd6 11. Nge2) (8... h6 9. Bxg6 fxg6 10. Qd3) (8... h5 9. Bxg6) (8... e6 9. a3)');
// 2. 4...Bg4 5.f3 Bh5 6.h4 and 5...Bf5 6.g4
add(P, 'Bg4 f3 Bh5 h4'); add(P, 'Bg4 f3 Bf5 g4');
say(P + ' Bg4 f3 Bh5 h4', 'Against ...h6, Bd3; against ...Bg6, g4: (6... h6 7. Bd3) (6... Bg6 7. g4)');
say(P + ' Bg4 f3 Bf5 g4', 'Against ...Bg6, h4: (6... Bg6 7. h4)');
edit(P, 'Against ...Bg4, f3; then h4 against ...Bh5 and g4 against ...Bf5: (4... Bg4 5. f3 Bh5 6. h4) (4... Bg4 5. f3 Bf5 6. g4)\n', '');
// 3. 6...h5 7.Nf3 Bg4 8.Qd2 (after 6...O-O, which stays first)
add(G, 'h5 Nf3 Bg4 Qd2');
say(G + ' h5 Nf3', 'Against ...O-O or ...Nbd7, Qd2 as well: (7... O-O 8. Qd2) (7... Nbd7 8. Qd2)');
say(G + ' h5 Nf3 Bg4 Qd2', 'Against ...Nbd7, Ng5; after ...Bxf3, take back with the g-pawn: (8... Nbd7 9. Ng5) (8... Bxf3 9. gxf3)');
edit(G, 'Against ...h5 or ...Nbd7, Nf3: (6... h5 7. Nf3 Bg4 8. Qd2) (6... Nbd7 7. Nf3)', 'Against ...h5 or ...Nbd7, Nf3: (6... Nbd7 7. Nf3)');
writeFileSync(f, chapterFileText(p.chapter));
console.log('done');
