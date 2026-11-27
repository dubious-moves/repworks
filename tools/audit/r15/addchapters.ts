// node addchapters.ts <source pgn> <study dir> <mode: jobava|deck> [names...]: add chapters to a data-repo study in the app's form
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { parseGames } from '/home/user/repworks/src/core/pgn/parse.ts';
import { chapterFileText } from '/home/user/repworks/src/core/pgn/write.ts';
import { freshId } from '/home/user/repworks/src/core/study/ids.ts';
const [src, dir, mode, ...names] = process.argv.slice(2) as string[];
const study = JSON.parse(readFileSync(`${dir}/study.json`, 'utf8'));
const taken = new Set<string>(study.chapters);
const rnd = () => randomInt(0, 1 << 30) / (1 << 30);
let k = 0; const games = parseGames(readFileSync(src, 'utf8'), () => `t${k++}`);
const added: string[] = [];
for (const g of games) {
  if (!g.ok) throw new Error(g.reason);
  const name = g.chapter.headers.find(([h]) => h === 'ChapterName')?.[1] ?? '';
  if (mode === 'jobava' && !names.includes(name)) continue;
  if (g.notes.length) console.log('notes', name, JSON.stringify(g.notes).slice(0, 200));
  const id = freshId(rnd, taken); taken.add(id);
  const headers: [string, string][] = mode === 'jobava'
    ? [['Event', `${study.name}: ${name}`], ['Site', '?'], ['Date', '????.??.??'], ['Round', '?'], ['White', '?'], ['Black', '?'], ['Result', '*'], ['StudyName', study.name], ['ChapterName', name], ['Orientation', 'white']]
    : [...g.chapter.headers.filter(([h]) => h !== 'StudyName'), ['StudyName', study.name]];
  if (existsSync(`${dir}/${id}.pgn`)) throw new Error('exists ' + id);
  writeFileSync(`${dir}/${id}.pgn`, chapterFileText({ ...g.chapter, id, headers }));
  study.chapters.push(id); added.push(`${id} ${name}`);
}
writeFileSync(`${dir}/study.json`, JSON.stringify(study, null, 2) + '\n');
console.log(added.length, 'chapters added:\n' + added.join('\n'));
