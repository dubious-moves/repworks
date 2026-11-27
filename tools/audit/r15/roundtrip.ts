// node roundtrip.ts <chapter file> <id>: parse with repworks and write back; report whether the bytes match
import { readFileSync } from 'node:fs';
import { parseChapterFile } from '/home/user/repworks/src/core/pgn/parse.ts';
import { chapterFileText } from '/home/user/repworks/src/core/pgn/write.ts';
const [f, id] = process.argv.slice(2);
const text = readFileSync(f!, 'utf8');
const p = parseChapterFile(text, id!);
if (!p.ok) { console.log('PARSE FAIL', p.reason); process.exit(1); }
const out = chapterFileText(p.chapter);
console.log('notes', p.notes.length, JSON.stringify(p.notes.slice(0, 3)));
console.log(out === text ? 'IDENTICAL' : `DIFFERENT (${text.length} vs ${out.length} bytes)`);
