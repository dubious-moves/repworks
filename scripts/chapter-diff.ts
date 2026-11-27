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
//   --out FILE     write the list there instead of printing it
//
// Examples:
//   node scripts/chapter-diff.ts delivered.pgn ../repworks-data --study "1. Nc3 + Jobava" --chapter "Jobava simplified"
//   node scripts/chapter-diff.ts ../repworks-data@4f2a91c ../repworks-data --study "1. Nc3 + Jobava"
// Exit code 0 whatever changed; 1 when a side can't be read.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseChapterFile, parseGames } from '../src/core/pgn/parse.ts';
import type { Chapter } from '../src/core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../src/core/study/studyMeta.ts';
import { markdown, report, SITE, versionChapters, type Version } from './chapter-diff-lib.ts';

const USAGE = 'usage: node scripts/chapter-diff.ts <old> <new> [--study S] [--old-study S] [--chapter C] [--mark TEXT] [--wraps] [--max-lines N] [--site URL] [--no-links] [--json] [--out FILE]\n  each side a PGN file, a data repo checkout <dir>, or <dir>@<rev>';
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

/** A data repo's files at a commit, or as checked out. */
interface Tree {
  list(dir: string): string[];
  read(path: string): string | undefined;
}

function worktree(dir: string): Tree {
  return {
    list: (d) => (existsSync(join(dir, d)) ? readdirSync(join(dir, d)) : []),
    read: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : undefined),
  };
}

function commit(dir: string, rev: string): Tree {
  const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('rev-parse', '--verify', '--quiet', `${rev}^{commit}`);
  } catch {
    fail(`${dir}: no commit ${rev} (a shallow clone holds only its latest commits: git fetch --depth=500)`);
  }
  return {
    list: (d) => {
      try {
        return git('ls-tree', '--name-only', `${rev}:${d}`).split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
    read: (p) => {
      try {
        return git('show', `${rev}:${p}`);
      } catch {
        return undefined;
      }
    },
  };
}

function study(tree: Tree, where: string, wanted: string | undefined, hint?: string): Version {
  const metas = tree.list('studies').flatMap((sid) => {
    const text = tree.read(`studies/${sid}/study.json`);
    const meta = text === undefined ? undefined : parseStudyMeta(text, sid);
    return meta?.ok ? [meta.value] : [];
  });
  if (!metas.length) fail(`${where}: no studies there (a data repo checkout has studies/<id>/study.json)`);
  const fold = (t: string) => t.trim().toLowerCase();
  const list = () => metas.map((m) => `${m.name} (${m.id})`).join(', ');
  // The same study as the other side's first (by its id, whatever it was named at that commit), then the id asked for, then the name.
  const same = hint === undefined ? [] : metas.filter((m) => m.id === hint);
  const byId = metas.filter((m) => m.id === wanted);
  const byName = wanted === undefined ? [] : metas.filter((m) => fold(m.name) === fold(wanted));
  const found = same.length ? same : byId.length ? byId : byName;
  if (!found.length) fail(wanted === undefined ? `${where}: --study is needed, one of: ${list()}` : `${where}: no study "${wanted}"; there are: ${list()}`);
  if (found.length > 1) fail(`${where}: ${found.length} studies are named "${wanted}", give the id: ${found.map((m) => m.id).join(', ')}`);
  const meta = found[0]!;
  const present = tree.list(`studies/${meta.id}`).filter((f) => f.endsWith('.pgn')).map((f) => f.slice(0, -4));
  const chapters: Chapter[] = [];
  for (const cid of reconcileChapterOrder(meta.chapters, present)) {
    const text = tree.read(`studies/${meta.id}/${cid}.pgn`);
    if (text === undefined) continue;
    const parsed = parseChapterFile(text, cid);
    if (!parsed.ok) fail(`${where}: studies/${meta.id}/${cid}.pgn can't be read: ${parsed.reason}`);
    chapters.push(parsed.chapter);
  }
  return { label: `${where}, study ${meta.name}`, sid: meta.id, study: meta.name, chapters: versionChapters(chapters, true) };
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
  if (existsSync(arg) && statSync(arg).isDirectory()) return study(worktree(arg), basename(arg), wanted, hint);
  const at = arg.lastIndexOf('@');
  const dir = at > 0 ? arg.slice(0, at) : '';
  if (dir && existsSync(dir) && statSync(dir).isDirectory()) return study(commit(dir, arg.slice(at + 1)), `${basename(dir)}@${arg.slice(at + 1)}`, wanted, hint);
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
const text = flags.has('json') ? `${JSON.stringify(r, null, 1)}\n` : markdown(r, { maxLines });
if (flags.has('out')) writeFileSync(flags.get('out')!, text);
else process.stdout.write(text);
