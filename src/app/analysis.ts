// The analysis board's "Add to a chapter" (PLAN.md §5.35): the line from the board's start to the
// move shown, added to a chapter whose tree reaches that start: the chapter it was opened from
// first, then the repertoire's chapters that reach it (the index, transpositions included). An
// ordinary edit of that chapter, written as this device's working copy and synced.
import { chapterPath } from '../core/data/layout.ts';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { chapterFileText } from '../core/pgn/write.ts';
import { addLine } from '../core/study/ops.ts';
import { positionAt, type Path } from '../core/study/tree.ts';
import type { Chapter } from '../core/study/model.ts';
import { mode } from './mode.ts';
import { localStore, saveFiles } from './state.ts';
import { trainData } from './train.ts';

export interface Target {
  sid: string;
  cid: string;
  /** Where the board's start is in that chapter. */
  path: Path;
  /** "Study / chapter", for the list. */
  label: string;
}

/** The chapters the board's line can go into: where it came from, then the repertoire's. */
export function targetsFor(board: Chapter): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const m = mode.peek();
  const data = trainData.peek();
  const nameOf = (sid: string, cid: string) => {
    const study = data?.studyNames.get(sid) ?? sid;
    const chapter = data?.chapters.get(`${sid}/${cid}`)?.headers.find(([k]) => k === 'ChapterName')?.[1] ?? cid;
    return `${study} / ${chapter}`;
  };
  if (m.name === 'analysis' && m.from) {
    out.push({ ...m.from, path: m.from.at, label: nameOf(m.from.sid, m.from.cid) });
    seen.add(`${m.from.sid}/${m.from.cid}`);
  }
  const start = positionAt(board, []);
  const here = start && data?.index.positions.get(positionKeyOf(start));
  for (const map of here ? [here.own, here.opponent] : []) {
    for (const places of map.values()) {
      for (const o of places) {
        const key = `${o.sid}/${o.cid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ sid: o.sid, cid: o.cid, path: o.path.slice(0, -1), label: nameOf(o.sid, o.cid) });
      }
    }
  }
  return out;
}

/** Adds `sans` at the target's start: moves already there followed, the rest a variation. */
export async function addToChapter(t: Target, sans: readonly string[]): Promise<{ ok: true; path: string[] } | { ok: false; error: string }> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  const file = chapterPath(t.sid, t.cid);
  const text = (await store.read((p) => p === file)).get(file);
  if (text === undefined) return { ok: false, error: 'that chapter isn’t on this device any more' };
  const parsed = parseChapterFile(text, t.cid);
  if (!parsed.ok) return { ok: false, error: `that chapter can’t be read: ${parsed.reason}` };
  const added = addLine(parsed.chapter, t.path, sans);
  if (!added.ok) return { ok: false, error: added.error };
  const after = chapterFileText(added.value.chapter);
  if (after !== text) await saveFiles(new Map([[file, after]]));
  return { ok: true, path: [...added.value.path] };
}
