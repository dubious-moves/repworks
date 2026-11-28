// A data repo checkout read by a script (PLAN.md §4.4's layout): its files as checked out or at a
// commit, and one study of it with its chapters, found by name or id. Shared by chapter-diff.ts
// (§5.214) and the audit tools (§5.219), so both read a study the same way.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseChapterFile, type ImportNote } from '../src/core/pgn/parse.ts';
import type { Chapter, StudyMeta } from '../src/core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../src/core/study/studyMeta.ts';

/** A data repo's files at a commit, or as checked out. */
export interface Tree {
  list(dir: string): string[];
  read(path: string): string | undefined;
}

export function worktree(dir: string): Tree {
  return {
    list: (d) => (existsSync(join(dir, d)) ? readdirSync(join(dir, d)) : []),
    read: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : undefined),
  };
}

export const git = (dir: string, ...a: string[]): string => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

/** The full hash of a revision, or undefined when the checkout doesn't hold it. */
export function revParse(dir: string, rev: string): string | undefined {
  try {
    return git(dir, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`).trim();
  } catch {
    return undefined;
  }
}

/** Throws when the checkout doesn't hold the commit. */
export function commit(dir: string, rev: string): Tree {
  if (revParse(dir, rev) === undefined) throw new Error(`${dir}: no commit ${rev} (a shallow clone holds only its latest commits: git fetch --depth=500)`);
  return {
    list: (d) => {
      try {
        return git(dir, 'ls-tree', '--name-only', `${rev}:${d}`).split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
    read: (p) => {
      try {
        return git(dir, 'show', `${rev}:${p}`);
      } catch {
        return undefined;
      }
    },
  };
}

export interface StudyAt {
  /** How a report names it: "repworks-data@0d0faa1". */
  where: string;
  meta: StudyMeta;
  /** In the study's order. */
  chapters: Chapter[];
  /** Each chapter file's text as read, by chapter id. */
  texts: Map<string, string>;
  /** What the parser changed or cut on reading, by chapter id (none: an empty list). */
  notes: Map<string, ImportNote[]>;
}

/**
 * One study of a data repo: the same study as `hint` (an id, whatever it was named at that
 * commit), then the id asked for, then the name (any case). Throws with a sentence saying what
 * is there when it can't be told.
 */
export function readStudy(tree: Tree, where: string, wanted: string | undefined, hint?: string): StudyAt {
  const metas = tree.list('studies').flatMap((sid) => {
    const text = tree.read(`studies/${sid}/study.json`);
    const meta = text === undefined ? undefined : parseStudyMeta(text, sid);
    return meta?.ok ? [meta.value] : [];
  });
  if (!metas.length) throw new Error(`${where}: no studies there (a data repo checkout has studies/<id>/study.json)`);
  const fold = (t: string) => t.trim().toLowerCase();
  const list = () => metas.map((m) => `${m.name} (${m.id})`).join(', ');
  const same = hint === undefined ? [] : metas.filter((m) => m.id === hint);
  const byId = metas.filter((m) => m.id === wanted);
  const byName = wanted === undefined ? [] : metas.filter((m) => fold(m.name) === fold(wanted));
  const found = same.length ? same : byId.length ? byId : byName;
  if (!found.length) throw new Error(wanted === undefined ? `${where}: --study is needed, one of: ${list()}` : `${where}: no study "${wanted}"; there are: ${list()}`);
  if (found.length > 1) throw new Error(`${where}: ${found.length} studies are named "${wanted}", give the id: ${found.map((m) => m.id).join(', ')}`);
  const meta = found[0]!;
  const present = tree.list(`studies/${meta.id}`).filter((f) => /^[A-Za-z0-9]{8}\.pgn$/.test(f)).map((f) => f.slice(0, -4));
  const chapters: Chapter[] = [];
  const texts = new Map<string, string>();
  const notes = new Map<string, ImportNote[]>();
  for (const cid of reconcileChapterOrder(meta.chapters, present)) {
    const text = tree.read(`studies/${meta.id}/${cid}.pgn`);
    if (text === undefined) continue;
    const parsed = parseChapterFile(text, cid);
    if (!parsed.ok) throw new Error(`${where}: studies/${meta.id}/${cid}.pgn can't be read: ${parsed.reason}`);
    chapters.push(parsed.chapter);
    texts.set(cid, text);
    notes.set(cid, parsed.notes);
  }
  return { where, meta, chapters, texts, notes };
}

export interface Side {
  tree: Tree;
  /** "repworks-data" or "repworks-data@0d0faa1". */
  where: string;
  /** The checkout's folder. */
  dir: string;
  rev?: string;
}

/** `<dir>` as checked out, or `<dir>@<rev>` at a commit; undefined when the argument is neither. */
export function openSide(arg: string): Side | undefined {
  if (existsSync(arg) && statSync(arg).isDirectory()) return { tree: worktree(arg), where: basename(arg), dir: arg };
  const at = arg.lastIndexOf('@');
  const dir = at > 0 ? arg.slice(0, at) : '';
  if (dir && existsSync(dir) && statSync(dir).isDirectory()) {
    const rev = arg.slice(at + 1);
    return { tree: commit(dir, rev), where: `${basename(dir)}@${rev}`, dir, rev };
  }
  return undefined;
}
