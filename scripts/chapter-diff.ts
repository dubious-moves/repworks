#!/usr/bin/env node
// What changed between two versions of a study's chapters (PLAN.md §5.214): a change list with
// every line in full and, when the new version is a study in a data repo, a link at each item that
// opens the app at that move. For a reviewing session and the owner handing a chapter back and
// forth: what the session changed since the last version, and what the owner changed in the app
// since the session's. A report that writes nothing (but `--out`).
//
// Usage: node scripts/chapter-diff.ts <old> <new> [options]
//   <old>, <new>   each a PGN file (one game a chapter), or a data repo checkout: `<dir>` as
//                  checked out, `<dir>@<rev>` at a commit (any git revision: a hash, HEAD~3, a tag)
//   --study S      the study of a data repo side: its name (any case) or its id
//   --old-study S  another study on the old side (a review copy against the study it came from)
//   --chapter C    only this chapter: its name (any case) or its id
//   --mark TEXT    also list the new version's comments holding TEXT, as open questions
//   --wraps        report a comment whose only change is its line breaks and spaces
//   --max-lines N  a part's lines shown beyond its main one (default 8; 0: all)
//   --site URL     the site the links open (default https://dubious-moves.github.io/repworks/)
//   --no-links     no links
//   --json         the report as JSON, every line of every part in it
//   --review NAME  also write the changes as a review list for the study page (PLAN.md §5.216):
//                  review/<study id>/NAME.json in the new side's checkout, an item a change, which
//                  the owner answers in the app. NAME: lower-case letters, digits, dashes. The
//                  file is yours to commit with the study; made again, its items keep their
//                  answers. Read the answers with scripts/review-answers.ts.
//   --title TEXT   what the panel calls the list (default: NAME)
//   --notes FILE   your words for the list: [{ "moves": "1. Nc3 d5 2. d4", "text": "…",
//                  "chapter"?: "name or id" }]. A note on a changed move is shown with that
//                  change; any other is a question at its move.
//   --out FILE     write the list there instead of printing it
//
// Examples:
//   node scripts/chapter-diff.ts delivered.pgn ../repworks-data --study "1. Nc3 + Jobava" --chapter "Jobava simplified"
//   node scripts/chapter-diff.ts ../repworks-data@4f2a91c ../repworks-data --study "1. Nc3 + Jobava"
// Exit code 0 whatever changed; 1 when a side can't be read.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { reviewListPath } from '../src/core/data/layout.ts';
import { positionKey, writeReviewList } from '../src/core/study/reviewList.ts';
import { parseGames } from '../src/core/pgn/parse.ts';
import type { Chapter } from '../src/core/study/model.ts';
import { openSide, readStudy, type Tree } from './data-repo.ts';
import { markdown, report, reviewList, SITE, versionChapters, type Note, type Version } from './chapter-diff-lib.ts';

const USAGE = 'usage: node scripts/chapter-diff.ts <old> <new> [--study S] [--old-study S] [--chapter C] [--mark TEXT] [--wraps] [--max-lines N] [--site URL] [--no-links] [--json] [--out FILE] [--review NAME [--title TEXT] [--notes FILE]]\n  each side a PGN file, a data repo checkout <dir>, or <dir>@<rev>';
const BOOLEAN = new Set(['wraps', 'no-links', 'json', 'help']);
const args = process.argv.slice(2);
const flags = new Map<string, string>();
const sides: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (!a.startsWith('--')) sides.push(a);
  else if (BOOLEAN.has(a.slice(2))) flags.set(a.slice(2), 'true');
  else if (args[i + 1] === undefined) fail(`${a} takes a value`);
  else flags.set(a.slice(2), args[++i]!);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function study(tree: Tree, where: string, wanted: string | undefined, hint?: string): Version {
  let at: ReturnType<typeof readStudy>;
  try {
    at = readStudy(tree, where, wanted, hint);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  return { label: `${where}, study ${at.meta.name}`, sid: at.meta.id, study: at.meta.name, chapters: versionChapters(at.chapters, true) };
}

function side(arg: string, wanted: string | undefined, hint?: string): Version {
  if (existsSync(arg) && statSync(arg).isFile()) {
    let n = 0;
    const chapters: Chapter[] = [];
    for (const g of parseGames(readFileSync(arg, 'utf8'), () => `file${n++}`)) {
      if (!g.ok) fail(`${arg}: a game can't be read: ${g.reason}`);
      chapters.push(g.chapter);
    }
    if (!chapters.length) fail(`${arg}: no game in the file`);
    return { label: basename(arg), chapters: versionChapters(chapters, false) };
  }
  let opened: ReturnType<typeof openSide>;
  try {
    opened = openSide(arg);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  if (opened) return study(opened.tree, opened.where, wanted, hint);
  return fail(`${arg}: not a PGN file, a data repo checkout, or <checkout>@<rev>`);
}

if (flags.has('help') || sides.length !== 2) fail(USAGE);
// The new side first: the old side of the same repo then takes the same study by its id, whatever it was named then.
const now = side(sides[1]!, flags.get('study'));
const old = side(sides[0]!, flags.get('old-study') ?? flags.get('study'), flags.has('old-study') ? undefined : now.sid);
const only = flags.get('chapter');
if (only !== undefined) {
  const pick = (v: Version) => v.chapters.filter((c) => c.cid === only || c.name.trim().toLowerCase() === only.trim().toLowerCase());
  const [a, b] = [pick(old), pick(now)];
  if (!a.length && !b.length) fail(`no chapter "${only}"; the new side has: ${now.chapters.map((c) => c.name).join(', ')}`);
  // A file's single game stands for the chapter asked for, whatever its own name.
  old.chapters = a.length || old.sid !== undefined || old.chapters.length !== 1 ? a : old.chapters;
  now.chapters = b.length || now.sid !== undefined || now.chapters.length !== 1 ? b : now.chapters;
}
const maxLines = Number(flags.get('max-lines') ?? 8);
if (!Number.isInteger(maxLines) || maxLines < 0) fail('--max-lines takes a whole number');
const r = report(old, now, { site: flags.has('no-links') ? '' : (flags.get('site') ?? SITE).replace(/\/?$/, '/'), wraps: flags.has('wraps'), ...(flags.has('mark') ? { mark: flags.get('mark')! } : {}) });
if (flags.has('review')) {
  // The checkout the new side is in (as checked out, or at a commit of it): the list goes beside its studies.
  const arg = sides[1]!;
  const dir = existsSync(arg) && statSync(arg).isDirectory() ? arg : arg.slice(0, arg.lastIndexOf('@'));
  let notes: Note[] = [];
  if (flags.has('notes')) {
    try {
      notes = JSON.parse(readFileSync(flags.get('notes')!, 'utf8')) as Note[];
    } catch (e) {
      fail(`--notes ${flags.get('notes')}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(notes) || !notes.every((n) => n && typeof n.moves === 'string' && typeof n.text === 'string' && n.text.trim() !== '')) fail('--notes takes a list of { "moves": "...", "text": "..." }');
  }
  const made = reviewList(r, now, { name: flags.get('review')!, ...(flags.has('title') ? { title: flags.get('title')! } : {}), created: new Date().toISOString(), notes });
  if (!made.ok) fail(made.error);
  const path = join(dir, reviewListPath(made.list.sid, made.list.name));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, writeReviewList(made.list));
  // The app shows and counts positions (the items at one move, §5.218).
  const places = new Set(made.list.items.map(positionKey)).size;
  process.stderr.write(`wrote ${path}: ${made.list.items.length} item(s) at ${places} position(s), ${made.list.items.filter((i) => i.text).length} with your words. Commit it with the study.\n`);
}
const text = flags.has('json') ? `${JSON.stringify(r, null, 1)}\n` : markdown(r, { maxLines });
if (flags.has('out')) writeFileSync(flags.get('out')!, text);
else process.stdout.write(text);
