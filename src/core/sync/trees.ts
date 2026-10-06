// Whole-repo views for the sync step (PLAN.md §4.9): file maps (path → blob SHA), the working
// copies laid over a base, the three-way merge of two trees, and the rebase of working copies
// onto a new base. Contents come through a `text` function over blobs the caller has loaded;
// each function says which blobs it will read, so the caller loads only those.
import { classifyPath, DATA_FORMAT, devicePath, FORMAT_FILE, progressDayPath, utcDay } from '../data/layout.ts';
import { mergeAuthoredFiles, type FileConflict, type FileMergeContext } from '../merge/files.ts';
import { writeLog } from '../progress/events.ts';
import { compactions, unionLogs } from '../progress/files.ts';
import { gitBlobSha } from './gitHash.ts';
import type { LocalEvent, Overlay } from './ports.ts';

export type Files = ReadonlyMap<string, string>;
export type Text = (sha: string) => string;

/** The study a path belongs to in the merge (study.json, chapters, conflict copies). */
export function studyOf(path: string): string | undefined {
  const where = classifyPath(path);
  return where.kind === 'study' || where.kind === 'chapter' || where.kind === 'conflict-copy' ? where.sid : undefined;
}

function ownProgress(path: string, device: string): boolean | undefined {
  const where = classifyPath(path);
  if (where.kind !== 'progress-day' && where.kind !== 'progress-month') return undefined;
  return where.dev === device;
}

/** The working view: the base with the working copies laid over it. */
export function applyOverlay(base: Files, overlay: Overlay): { files: Map<string, string>; texts: Map<string, string> } {
  const files = new Map(base);
  const texts = new Map<string, string>();
  for (const [path, entry] of overlay) {
    if (entry.text === null) files.delete(path);
    else {
      const sha = gitBlobSha(entry.text);
      files.set(path, sha);
      texts.set(sha, entry.text);
    }
  }
  return { files, texts };
}

export interface Sides {
  base: Files;
  ours: Files;
  theirs: Files;
}

/** What a merge of these sides has to read: the studies changed on both sides, and own progress files changed remotely. */
export function mergeNeeds(sides: Sides, device: string): { studies: Set<string>; shas: Set<string> } {
  const studies = new Set<string>();
  const shas = new Set<string>();
  for (const path of new Set([...sides.base.keys(), ...sides.ours.keys(), ...sides.theirs.keys()])) {
    const [b, o, t] = [sides.base.get(path), sides.ours.get(path), sides.theirs.get(path)];
    const own = ownProgress(path, device);
    if (own === false) continue;
    if (own === true) {
      if (t !== b) for (const sha of [b, o, t]) if (sha !== undefined) shas.add(sha);
      continue;
    }
    if (o === t || t === b || o === b) continue;
    const sid = studyOf(path);
    if (sid !== undefined) studies.add(sid);
  }
  for (const sid of studies) {
    const prefix = `studies/${sid}/`;
    for (const side of [sides.base, sides.ours, sides.theirs]) for (const [path, sha] of side) if (path.startsWith(prefix)) shas.add(sha);
  }
  return { studies, shas };
}

export interface TreeMerge {
  files: Map<string, string>;
  /** sha → text for every file the merge wrote. */
  texts: Map<string, string>;
  conflicts: FileConflict[];
  /** This device's own progress files that someone else changed: the lines were unioned. */
  ownFilesChanged: string[];
}

/** The SHA of `content`, reusing a side's SHA when the content is that side's text. */
function shaOf(content: string, text: Text, candidates: readonly (string | undefined)[]): string {
  for (const sha of candidates) if (sha !== undefined && text(sha) === content) return sha;
  return gitBlobSha(content);
}

/**
 * Three-way merge of two trees:
 * - a file changed on one side only takes that side;
 * - a study changed on both sides merges through mergeAuthoredFiles (§4.7);
 * - any other file changed on both sides takes theirs;
 * - other devices' progress files are theirs, always;
 * - this device's progress files are ours; if someone else changed one, every line of every
 *   side is kept (a union by n), and it is reported.
 */
export function mergeTrees(sides: Sides, text: Text, ctx: FileMergeContext): TreeMerge {
  const files = new Map<string, string>();
  const texts = new Map<string, string>();
  const conflicts: FileConflict[] = [];
  const ownFilesChanged: string[] = [];
  const { studies } = mergeNeeds(sides, ctx.device);
  for (const path of [...new Set([...sides.base.keys(), ...sides.ours.keys(), ...sides.theirs.keys()])].sort()) {
    const [b, o, t] = [sides.base.get(path), sides.ours.get(path), sides.theirs.get(path)];
    const sid = studyOf(path);
    if (sid !== undefined && studies.has(sid)) continue;
    const own = ownProgress(path, ctx.device);
    if (own === false) {
      if (t !== undefined) files.set(path, t);
    } else if (own === true) {
      if (t === b) {
        if (o !== undefined) files.set(path, o);
        continue;
      }
      const sources = [...new Set([b, t, o])].flatMap((sha) => (sha === undefined ? [] : [text(sha)]));
      const union = unionLogs(sources).text;
      const sha = shaOf(union, text, [t, o, b]);
      files.set(path, sha);
      texts.set(sha, union);
      ownFilesChanged.push(path);
    } else {
      const v = o === t || t === b ? o : o === b ? t : t;
      if (v !== undefined) files.set(path, v);
    }
  }
  for (const sid of [...studies].sort()) {
    const prefix = `studies/${sid}/`;
    const read = (side: Files) => new Map([...side].filter(([path]) => path.startsWith(prefix)).map(([path, sha]) => [path, text(sha)] as [string, string]));
    const merged = mergeAuthoredFiles(read(sides.base), read(sides.ours), read(sides.theirs), ctx);
    for (const [path, content] of merged.files) {
      const sha = shaOf(content, text, [sides.theirs.get(path), sides.ours.get(path), sides.base.get(path)]);
      files.set(path, sha);
      texts.set(sha, content);
    }
    conflicts.push(...merged.conflicts);
  }
  return { files, texts, conflicts, ownFilesChanged };
}

/** The format file and this device's file, added when the tree lacks them. */
export function ensureFiles(files: Map<string, string>, texts: Map<string, string>, device: { id: string; name: string }, nowIso: string): void {
  const add = (path: string, content: string) => {
    if (files.has(path)) return;
    const sha = gitBlobSha(content);
    files.set(path, sha);
    texts.set(sha, content);
  };
  add(FORMAT_FILE, `{ "format": ${DATA_FORMAT} }\n`);
  add(devicePath(device.id), `{ "name": ${JSON.stringify(device.name)}, "created": "${nowIso}" }\n`);
}

/** The data format a tree declares: a number, or undefined when the file is missing or unreadable. */
export function declaredFormat(content: string | undefined): number | 'missing' | 'unreadable' {
  if (content === undefined) return 'missing';
  try {
    const value = (JSON.parse(content) as { format?: unknown }).format;
    return typeof value === 'number' && Number.isInteger(value) ? value : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

// ---------------------------------------------------------------------------------------------
// Rebase: the working copies after an operation (a pull's merge, a push, an adopted commit).

/** Working copies written since the snapshot (or removed, which only a finish does). */
export function editedSince(snapshot: Overlay, current: Overlay): Set<string> {
  const edited = new Set<string>();
  for (const [path, entry] of current) if (snapshot.get(path)?.rev !== entry.rev) edited.add(path);
  for (const path of snapshot.keys()) if (!current.has(path)) edited.add(path);
  return edited;
}

export interface RebaseInput {
  /** The working copies the operation started from, and those there now. */
  snapshot: Overlay;
  current: Overlay;
  /** The base both are laid over. */
  before: Files;
  /** What the working view is after the operation, before any edit made during it. */
  result: Files;
  /** The new base. */
  next: Files;
}

/** The blobs a rebase reads: every file, in B, R and N, of the studies edited during the operation. */
export function rebaseNeeds(input: RebaseInput): Set<string> {
  const shas = new Set<string>();
  const add = (sha: string | undefined) => sha !== undefined && shas.add(sha);
  for (const [path, r] of input.result) if (input.next.get(path) !== r) add(r);
  const edited = editedSince(input.snapshot, input.current);
  const studies = new Set([...edited].map(studyOf).filter((s) => s !== undefined));
  for (const side of [input.before, input.result, input.next]) {
    for (const [path, sha] of side) {
      const sid = studyOf(path);
      if (edited.has(path) || (sid !== undefined && studies.has(sid))) add(sha);
    }
  }
  return shas;
}

/**
 * The working copies over the new base: what the operation produced where it differs from the
 * new base, and any working copy edited during the operation merged in three-way, with the
 * snapshot as base, the edit as ours and the operation's result as theirs.
 */
export function rebase(input: RebaseInput, text: Text, ctx: FileMergeContext): Overlay {
  const { snapshot, current, before, result, next } = input;
  const out: Overlay = new Map();
  for (const path of new Set([...result.keys(), ...next.keys()])) {
    const r = result.get(path);
    if (r === next.get(path)) continue;
    out.set(path, { text: r === undefined ? null : text(r), rev: snapshot.get(path)?.rev ?? 0 });
  }
  const edited = editedSince(snapshot, current);
  if (edited.size === 0) return out;

  const view = (overlay: Overlay, path: string): string | undefined => {
    const entry = overlay.get(path);
    if (entry) return entry.text ?? undefined;
    const sha = before.get(path);
    return sha === undefined ? undefined : text(sha);
  };
  const studies = new Set([...edited].map(studyOf).filter((s) => s !== undefined));
  const paths = new Set<string>(edited);
  for (const side of [before, result, next, snapshot, current]) {
    for (const path of side.keys()) {
      const sid = studyOf(path);
      if (sid !== undefined && studies.has(sid)) paths.add(path);
    }
  }
  const [b, o, t] = [new Map<string, string>(), new Map<string, string>(), new Map<string, string>()];
  for (const path of paths) {
    const vs = view(snapshot, path);
    const vo = view(current, path);
    const rsha = result.get(path);
    if (vs !== undefined) b.set(path, vs);
    if (vo !== undefined) o.set(path, vo);
    if (rsha !== undefined) t.set(path, text(rsha));
  }
  const merged = mergeAuthoredFiles(b, o, t, ctx).files;
  for (const path of new Set([...paths, ...merged.keys()])) {
    const v = merged.get(path);
    const n = next.get(path);
    if (v === undefined ? n === undefined : n !== undefined && text(n) === v) out.delete(path);
    else out.set(path, { text: v ?? null, rev: current.get(path)?.rev ?? snapshot.get(path)?.rev ?? 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Push: the device's own progress files, and the commit's changes.

/** The own progress files a push reads: the days its events go to, and closed months with day files. */
export function progressNeeds(files: Files, device: string, events: readonly LocalEvent[], currentMonth: string): Set<string> {
  const shas = new Set<string>();
  const days = new Set(events.map((e) => utcDay(e.t)));
  const closed = new Set([...days].map((d) => d.slice(0, 7)).filter((m) => m < currentMonth));
  for (const path of files.keys()) {
    const where = classifyPath(path);
    if (where.kind === 'progress-day' && where.dev === device && where.day.slice(0, 7) < currentMonth) closed.add(where.day.slice(0, 7));
  }
  for (const [path, sha] of files) {
    const where = classifyPath(path);
    if (where.kind === 'progress-day' && where.dev === device && (days.has(where.day) || closed.has(where.day.slice(0, 7)))) shas.add(sha);
    if (where.kind === 'progress-month' && where.dev === device && closed.has(where.month)) shas.add(sha);
  }
  return shas;
}

/**
 * The working view with the device's new events written into their day files, and every closed
 * month (before `currentMonth`) compacted into its month file. Changes `files` and `texts`.
 */
export function addProgress(files: Map<string, string>, texts: Map<string, string>, text: Text, device: string, events: readonly LocalEvent[], currentMonth: string): void {
  const read = (sha: string) => texts.get(sha) ?? text(sha);
  const byDay = new Map<string, LocalEvent[]>();
  for (const e of events) {
    const day = utcDay(e.t);
    let list = byDay.get(day);
    if (!list) byDay.set(day, (list = []));
    list.push(e);
  }
  const write = (path: string, content: string) => {
    const sha = gitBlobSha(content);
    files.set(path, sha);
    texts.set(sha, content);
  };
  for (const [day, list] of byDay) {
    const path = progressDayPath(device, day);
    const sha = files.get(path);
    write(path, unionLogs([...(sha === undefined ? [] : [read(sha)]), writeLog(list)]).text);
  }
  // Closed months that still have day files, with their month files.
  const closed = new Set<string>();
  for (const path of files.keys()) {
    const where = classifyPath(path);
    if (where.kind === 'progress-day' && where.dev === device && where.day.slice(0, 7) < currentMonth) closed.add(where.day.slice(0, 7));
  }
  const own = new Map<string, string>();
  for (const [path, sha] of files) {
    const where = classifyPath(path);
    if (where.kind === 'progress-day' && where.dev === device && closed.has(where.day.slice(0, 7))) own.set(path, read(sha));
    if (where.kind === 'progress-month' && where.dev === device && closed.has(where.month)) own.set(path, read(sha));
  }
  for (const c of compactions(device, own, currentMonth)) {
    write(c.path, c.text);
    for (const path of c.remove) files.delete(path);
  }
}

export interface TreeDiff {
  add: Map<string, string>;
  remove: string[];
}

/** What turns `from` into `to`: path → content to write, paths to delete. */
export function diffTrees(from: Files, to: Files, text: Text): TreeDiff {
  const add = new Map<string, string>();
  const remove: string[] = [];
  for (const [path, sha] of [...to].sort(([a], [b]) => (a < b ? -1 : 1))) if (from.get(path) !== sha) add.set(path, text(sha));
  for (const path of [...from.keys()].sort()) if (!to.has(path)) remove.push(path);
  return { add, remove };
}

export function summarize(diff: TreeDiff, events: number): { studyFiles: number; progressFiles: number; events: number; otherFiles: number } {
  const counts = { studyFiles: 0, progressFiles: 0, events, otherFiles: 0 };
  for (const path of [...diff.add.keys(), ...diff.remove]) {
    const kind = classifyPath(path).kind;
    if (kind === 'study' || kind === 'chapter' || kind === 'conflict-copy') counts.studyFiles++;
    else if (kind === 'progress-day' || kind === 'progress-month') counts.progressFiles++;
    else counts.otherFiles++;
  }
  return counts;
}
