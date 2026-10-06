// Repertoire coverage (PLAN.md §5.26): the studies read from the working copies, the explorer's
// answers for the ranking asked through the explorer worker (its limiter, cache and filter, at a
// priority under the panel's), and a gap's lines added to a repertoire chapter, with an undo.
import { chapterPath } from '../core/data/layout.ts';
import type { Gap, Place } from '../core/explorer/coverage.ts';
import type { CompactExplorer } from '../core/explorer/providers.ts';
import type { LookupError } from '../core/explorer/service.ts';
import type { PositionKey } from '../core/chess/positionKey.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { chapterFileText } from '../core/pgn/write.ts';
import { studiesFromFiles, type StudyChapters } from '../core/repertoire/files.ts';
import { addLine } from '../core/study/ops.ts';
import { onWorker, postToWorker, prefs } from './explorer.ts';
import { localStore, saveFiles } from './state.ts';

/** Every study of the working copies, in the study list's order. */
export async function readStudies(): Promise<StudyChapters[]> {
  const store = localStore();
  if (!store) return [];
  return studiesFromFiles(await store.read((p) => p.startsWith('studies/'))).studies;
}

/** Answers kept for the session, by filter and position: running the report again asks nothing. */
const kept = new Map<string, CompactExplorer>();
const filterOf = () => {
  const p = prefs.peek();
  return `${[...p.speeds].sort().join(',')}|${[...p.ratings].sort((a, b) => a - b).join(',')}|${p.recent}|${p.local}`;
};
let nextId = 1_000_000_000;

export interface Asking {
  /** Resolves with every answer got (a position missing from it had none); `error` when one failed. */
  done: Promise<{ answers: Map<PositionKey, CompactExplorer>; error?: LookupError }>;
  cancel(): void;
}

/**
 * Asks the explorer for each position (the worker queues them under its limiter), reporting how
 * many have answered. The first refusal that a login would answer ends it: the rest would fail
 * the same way.
 */
export function askCounts(positions: ReadonlyMap<PositionKey, string>, progress: (answered: number, total: number) => void): Asking {
  const filter = filterOf();
  const answers = new Map<PositionKey, CompactExplorer>();
  const waiting = new Map<number, PositionKey>();
  for (const key of positions.keys()) {
    const hit = kept.get(`${filter}|${key}`);
    if (hit) answers.set(key, hit);
  }
  let error: LookupError | undefined;
  let stop = () => {};
  const done = new Promise<{ answers: Map<PositionKey, CompactExplorer>; error?: LookupError }>((resolve) => {
    const total = positions.size;
    let answered = answers.size;
    const finish = () => {
      off();
      for (const id of waiting.keys()) postToWorker({ type: 'drop', id });
      waiting.clear();
      resolve(error ? { answers, error } : { answers });
    };
    const off = onWorker((m) => {
      if (m.type !== 'games' || !waiting.has(m.id)) return;
      const key = waiting.get(m.id)!;
      waiting.delete(m.id);
      answered++;
      if ('games' in m) {
        answers.set(key, m.games);
        kept.set(`${filter}|${key}`, m.games);
      } else {
        error ??= m.error;
        if (m.error.login) return finish();
      }
      progress(answered, total);
      if (!waiting.size) finish();
    });
    stop = finish;
    progress(answered, total);
    for (const [key, fen] of positions) {
      if (answers.has(key)) continue;
      const id = nextId++;
      waiting.set(id, key);
      postToWorker({ type: 'counts', id, fen });
    }
    if (!waiting.size) finish();
  });
  return { done, cancel: () => stop() };
}

export interface Added {
  sid: string;
  cid: string;
  /** The chapter file before and after, for the undo. */
  before: string;
  after: string;
  /** Where the first added line ends, to open it. */
  path: string[];
}

/** Copies a gap's lines into the chapter at `place`, from the divergence on: one change, synced. */
export async function addGap(gap: Gap, place: Place): Promise<{ ok: true; value: Added } | { ok: false; error: string }> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  const file = chapterPath(place.sid, place.cid);
  const text = (await store.read((p) => p === file)).get(file);
  if (text === undefined) return { ok: false, error: 'that chapter isn’t on this device any more' };
  const parsed = parseChapterFile(text, place.cid);
  if (!parsed.ok) return { ok: false, error: `that chapter can’t be read: ${parsed.reason}` };
  let chapter = parsed.chapter;
  let first: string[] | undefined;
  for (const { line } of gap.lines) {
    const at = line.plies.findIndex((p) => `${p.before}|${p.uci}` === gap.key);
    const added = addLine(chapter, place.path, line.path.slice(at));
    if (!added.ok) return { ok: false, error: added.error };
    chapter = added.value.chapter;
    first ??= [...added.value.path];
  }
  const after = chapterFileText(chapter);
  if (after !== text) await saveFiles(new Map([[file, after]]));
  return { ok: true, value: { sid: place.sid, cid: place.cid, before: text, after, path: first ?? [...place.path] } };
}

/** Puts the chapter back as it was, unless it changed since (then the undo would lose that). */
export async function undoAdd(added: Added): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  const file = chapterPath(added.sid, added.cid);
  const now = (await store.read((p) => p === file)).get(file);
  if (now !== added.after) return { ok: false, error: 'the chapter has changed since: undo it there' };
  await saveFiles(new Map([[file, added.before]]));
  return { ok: true };
}
