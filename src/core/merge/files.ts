// The merge of a data repo's authored files: study.json and chapter files (PLAN.md §4.7). The
// sync step (§4.9) calls it with the base, the device's and the remote head's versions; the
// progress files, which only their own device writes, never come here.
//
// Per file: changed on one side only, that side's version (or deletion) is taken as it is.
// Changed on both:
// - a chapter merges three-way (mergeChapter); a start-position clash adds a conflict copy;
// - a chapter deleted on one side and edited on the other is kept, with a "kept after delete"
//   marker in its root comment; a study deleted on one side and edited on the other is restored
//   the same way;
// - a file the app can't parse is never rewritten: theirs is kept, and ours, if it differs, is
//   saved beside it as <cid>.conflict-<device>.pgn;
// - study.json merges per field, its chapter order as child order is merged.
import { chapterPath, classifyPath, conflictCopyPath, studyMetaPath } from '../data/layout.ts';
import { parseChapterFile } from '../pgn/parse.ts';
import { chapterFileText } from '../pgn/write.ts';
import { header, type Chapter, type StudyMeta } from '../study/model.ts';
import { parseStudyMeta, writeStudyMeta } from '../study/studyMeta.ts';
import { renameChapter } from '../study/ops.ts';
import { mergeSettings, SETTINGS_FILE } from '../train/settings.ts';
import { insertAfterNeighbours, mergeChapter, type MergeLabels } from './chapter.ts';
import { keptMarker } from './markers.ts';

export interface FileMergeContext {
  labels: MergeLabels;
  /** The merging device's ID, which names a conflict copy of a file it couldn't merge. */
  device: string;
  /** IDs for chapters a merge creates (conflict copies). */
  newId: () => string;
}

export interface FileConflict {
  path: string;
  kind: 'text' | 'kept' | 'start-position' | 'unparsable' | 'study-restored';
}

export interface FileMerge {
  files: Map<string, string>;
  conflicts: FileConflict[];
}

type Files = ReadonlyMap<string, string>;

export function mergeAuthoredFiles(base: Files, ours: Files, theirs: Files, ctx: FileMergeContext): FileMerge {
  const files = new Map<string, string>();
  const conflicts: FileConflict[] = [];
  const studies = new Set<string>();
  const others = new Set<string>();
  for (const map of [base, ours, theirs]) {
    for (const path of map.keys()) {
      const where = classifyPath(path);
      if (where.kind === 'study' || where.kind === 'chapter' || where.kind === 'conflict-copy') studies.add(where.sid);
      else others.add(path);
    }
  }
  for (const path of others) {
    const [b, o, t] = [base.get(path), ours.get(path), theirs.get(path)];
    let v = pick(b, o, t);
    // Both changed the training settings: per field (§5.2). Anything else changed on both sides,
    // or settings that won't parse: theirs.
    if (v === null && path === SETTINGS_FILE && o !== undefined && t !== undefined) v = mergeSettings(b, o, t) ?? t;
    v ??= t;
    if (v !== undefined) files.set(path, v);
  }
  for (const sid of [...studies].sort()) mergeStudy(sid, base, ours, theirs, ctx, files, conflicts);
  return { files, conflicts };
}

/** The value of a file changed on one side only, or the same on both; null when both changed. */
function pick(b: string | undefined, o: string | undefined, t: string | undefined): string | undefined | null {
  if (o === t || t === b) return o;
  if (o === b) return t;
  return null;
}

function mergeStudy(sid: string, base: Files, ours: Files, theirs: Files, ctx: FileMergeContext, out: Map<string, string>, conflicts: FileConflict[]) {
  const prefix = `studies/${sid}/`;
  const paths = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()].filter((p) => p.startsWith(prefix)));
  const metaPath = studyMetaPath(sid);
  const results = new Map<string, string>();
  const keptChapters = new Set<string>();
  const copies: { after: string; cid: string }[] = [];

  for (const path of [...paths].sort()) {
    if (path === metaPath) continue;
    const where = classifyPath(path);
    const [b, o, t] = [base.get(path), ours.get(path), theirs.get(path)];
    const simple = pick(b, o, t);
    if (simple !== null) {
      if (simple !== undefined) results.set(path, simple);
      continue;
    }
    if (where.kind !== 'chapter') {
      // Both changed something that isn't a chapter (a conflict copy): kept if either side has
      // it, ours when both do.
      const kept = o ?? t;
      if (kept !== undefined) results.set(path, kept);
      continue;
    }
    const cid = where.cid;
    if (o === undefined || t === undefined) {
      // Deleted on one side, edited on the other: the edited chapter stays, marked.
      const kept = (o ?? t)!;
      const deletedBy = o === undefined ? ctx.labels.ours : ctx.labels.theirs;
      const parsed = parseChapterFile(kept, cid);
      if (parsed.ok) {
        const root = { ...parsed.chapter.root, comments: [...parsed.chapter.root.comments, keptMarker(deletedBy)] };
        results.set(path, chapterFileText({ ...parsed.chapter, root }));
      } else results.set(path, kept);
      keptChapters.add(cid);
      conflicts.push({ path, kind: 'kept' });
      continue;
    }
    const [pb, po, pt] = [b === undefined ? undefined : parseChapterFile(b, cid), parseChapterFile(o, cid), parseChapterFile(t, cid)];
    if (!po.ok || !pt.ok) {
      // Never rewrite a file the app can't read: theirs stays, ours goes beside it.
      results.set(path, t);
      results.set(conflictCopyPath(sid, cid, ctx.device), o);
      conflicts.push({ path, kind: 'unparsable' });
      continue;
    }
    const merged = mergeChapter(pb?.ok ? pb.chapter : undefined, po.chapter, pt.chapter, ctx.labels);
    results.set(path, chapterFileText(merged.chapter));
    for (const c of merged.conflicts) conflicts.push({ path, kind: c.kind });
    if (merged.copy) {
      const copyId = ctx.newId();
      const studyName = header(merged.copy.chapter, 'StudyName') ?? '';
      const name = `${header(merged.copy.chapter, 'ChapterName') ?? cid} (conflict copy)`;
      const renamed = renameChapter({ ...merged.copy.chapter, id: copyId }, studyName, name);
      const copy: Chapter = renamed.ok ? renamed.value : { ...merged.copy.chapter, id: copyId };
      results.set(chapterPath(sid, copyId), chapterFileText(copy));
      copies.push({ after: cid, cid: copyId });
    }
  }

  const present = new Set([...results.keys()].map(classifyPath).flatMap((w) => (w.kind === 'chapter' ? [w.cid] : [])));
  const [b, o, t] = [base.get(metaPath), ours.get(metaPath), theirs.get(metaPath)];
  let metaText = pick(b, o, t);
  const restored = metaText === undefined && present.size > 0;
  if (metaText === null || restored) {
    // Both changed it, or one side deleted the study while the other still has chapters in it.
    const parse = (text: string | undefined) => (text === undefined ? undefined : parseStudyMeta(text, sid));
    const [mb, mo, mt] = [parse(b), parse(o), parse(t)];
    const value = (m: ReturnType<typeof parse>) => (m?.ok ? m.value : undefined);
    if (o !== undefined && t !== undefined && (!mo?.ok || !mt?.ok)) metaText = t; // never rewrite what can't be read
    else {
      const merged = mergeStudyMeta(value(mb), value(mo), value(mt));
      metaText = merged ? writeStudyMeta(merged) : (o ?? t);
    }
    if (restored || o === undefined || t === undefined) {
      conflicts.push({ path: metaPath, kind: 'study-restored' });
      // Every chapter left in a restored study says so, unless it is already marked.
      const deletedBy = o === undefined ? ctx.labels.ours : ctx.labels.theirs;
      for (const cid of present) {
        if (keptChapters.has(cid)) continue;
        const path = chapterPath(sid, cid);
        const parsed = parseChapterFile(results.get(path)!, cid);
        if (!parsed.ok) continue;
        const root = { ...parsed.chapter.root, comments: [...parsed.chapter.root.comments, keptMarker(deletedBy)] };
        results.set(path, chapterFileText({ ...parsed.chapter, root }));
      }
    }
  }
  if (metaText !== undefined) {
    // The chapter list follows the files: drop what's gone, place the conflict copies.
    const parsed = parseStudyMeta(metaText, sid);
    if (parsed.ok) {
      const chapters = parsed.value.chapters.filter((cid) => present.has(cid));
      for (const { after, cid } of copies) chapters.splice(chapters.indexOf(after) + 1, 0, cid);
      for (const cid of [...present].sort()) if (!chapters.includes(cid)) chapters.push(cid);
      const meta = { ...parsed.value, chapters };
      metaText = JSON.stringify(meta.chapters) === JSON.stringify(parsed.value.chapters) ? metaText : writeStudyMeta(meta);
    }
    results.set(metaPath, metaText);
  }
  for (const [path, text] of results) out.set(path, text);
}

/** study.json, three-way: name, kind and source per field (ours on a clash); chapter order as child order. */
export function mergeStudyMeta(b: StudyMeta | undefined, o: StudyMeta | undefined, t: StudyMeta | undefined): StudyMeta | undefined {
  if (!o || !t) return o ?? t;
  const base = b ?? o;
  const field = <K extends keyof StudyMeta>(k: K): StudyMeta[K] => {
    const [bv, ov, tv] = [JSON.stringify(base[k]), JSON.stringify(o[k]), JSON.stringify(t[k])];
    return ov === tv || tv === bv ? o[k] : ov === bv ? t[k] : o[k];
  };
  const merged: StudyMeta = { format: 1, id: o.id, name: field('name'), kind: field('kind'), chapters: mergeOrder(b?.chapters ?? [], o.chapters, t.chapters) };
  const source = field('source');
  if (source) merged.source = source;
  return merged;
}

/** Like child order: ours if it reordered what both have, else theirs; new ones after their neighbour. */
function mergeOrder(kb: readonly string[], ko: readonly string[], kt: readonly string[]): string[] {
  const inO = new Set(ko);
  const inT = new Set(kt);
  const common = (x: string) => inO.has(x) && inT.has(x);
  const oCommon = ko.filter(common);
  const bCommon = kb.filter(common);
  const order = oCommon.length === bCommon.length && oCommon.every((x, i) => x === bCommon[i]) ? kt.filter(common) : oCommon;
  insertAfterNeighbours(order, [ko, kt]);
  return order;
}
