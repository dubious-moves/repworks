#!/usr/bin/env node
// The owner's answers to a study's review lists (PLAN.md §5.216), read from a data repo checkout:
// each item of each list (review/<study id>/<name>.json, made by chapter-diff.ts --review) with
// what the owner said in the app (OK, No, a note), from every device's log, and the items whose
// move he changed in the chapter since, where the edit is the answer. A report that writes nothing.
//
// Usage: node scripts/review-answers.ts <data-repo checkout> --study S [--list NAME] [--json]
//   --study S    the study: its name (any case) or its id
//   --list NAME  one list only
// Pull the checkout first: an answer is in the repo once the owner's device has synced.
import { classifyPath, reviewDir } from '../src/core/data/layout.ts';
import { parseChapterFile } from '../src/core/pgn/parse.ts';
import type { Chapter } from '../src/core/study/model.ts';
import { parseReviewList, type ReviewList } from '../src/core/study/reviewList.ts';
import { parseStudyMeta } from '../src/core/study/studyMeta.ts';
import { answered, answersMarkdown } from './chapter-diff-lib.ts';
import { readTree } from './read-tree.ts';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && !['--study', '--list'].includes(args[i - 1] ?? ''));
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const wanted = flag('study');
if (!dir || !wanted) fail('usage: node scripts/review-answers.ts <data-repo checkout> --study S [--list NAME] [--json]');

let files: Map<string, string>;
try {
  files = readTree(dir);
} catch {
  fail(`${dir}: not a folder that can be read`);
}
const metas = [...files].flatMap(([path, text]) => {
  const where = classifyPath(path);
  const meta = where.kind === 'study' ? parseStudyMeta(text, where.sid) : undefined;
  return meta?.ok ? [meta.value] : [];
});
const byId = metas.filter((m) => m.id === wanted);
const found = byId.length ? byId : metas.filter((m) => m.name.trim().toLowerCase() === wanted.trim().toLowerCase());
if (found.length !== 1) fail(found.length ? `${found.length} studies are named "${wanted}", give the id: ${found.map((m) => m.id).join(', ')}` : `no study "${wanted}"; there are: ${metas.map((m) => `${m.name} (${m.id})`).join(', ')}`);
const sid = found[0]!.id;

const lists: ReviewList[] = [];
const chapters = new Map<string, Chapter>();
for (const [path, text] of files) {
  const where = classifyPath(path);
  if (where.kind === 'review' && path.startsWith(reviewDir(sid))) {
    const r = parseReviewList(text);
    if (!r.ok) fail(`${path} can't be read: ${r.error}`);
    if (flag('list') === undefined || flag('list') === r.list.name) lists.push(r.list);
  } else if (where.kind === 'chapter' && where.sid === sid) {
    const parsed = parseChapterFile(text, where.cid);
    if (parsed.ok) chapters.set(where.cid, parsed.chapter);
  }
}
if (flag('list') !== undefined && !lists.length) fail(`no list "${flag('list')}" for that study`);
lists.sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));
const out = answered(lists, files, chapters);
process.stdout.write(args.includes('--json') ? `${JSON.stringify(out, null, 1)}\n` : answersMarkdown(out));
