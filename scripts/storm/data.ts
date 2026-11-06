// The cloud gather's data (PLAN.md §5.155), read from a data repo's checkout as the app reads it:
// the repertoire's chapters and lines (paused lines left out, §5.70), the cards answered well
// lately (from every device's progress log, §5.41), the cloud's own device and its storm files, the
// other devices' storm files merged in (§5.102); the scope a run is limited to (a study or a
// chapter, as the storm's home scopes it, §14.21); and what the cloud writes back: its own files,
// those that changed, never one this version can't read in full (as `app/stormShare.ts`).
import { classifyPath, chapterPath, devicePath, stormDir } from '../../src/core/data/layout.ts';
import { parseChapterFile } from '../../src/core/pgn/parse.ts';
import { readProgress } from '../../src/core/progress/files.ts';
import { DEFAULT_PARAMS } from '../../src/core/progress/fsrs.ts';
import { Replay } from '../../src/core/progress/replay.ts';
import { combineIndex, indexChapter, type ChapterIndexing } from '../../src/core/repertoire/index.ts';
import type { StormConfig } from '../../src/core/storm/config.ts';
import type { StoredPosition } from '../../src/core/storm/harvest.ts';
import { MAIA_LADDER } from '../../src/core/storm/maia.ts';
import { mergeShared, parseSharedFile, sharedFiles } from '../../src/core/storm/shared.ts';
import { decisions, frontiers, inScope, lineInScope, stormLines, type StormLine, type StormScope } from '../../src/core/storm/sources.ts';
import { stormHistories } from '../../src/core/storm/store.ts';
import type { Chapter } from '../../src/core/study/model.ts';
import { freshId } from '../../src/core/study/ids.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../../src/core/study/studyMeta.ts';
import { lineMarksOf, markLines } from '../../src/core/train/paused.ts';
import { SETTINGS_FILE, trainSettings } from '../../src/core/train/settings.ts';
import type { GatherScope } from '../../src/core/storm/gather.ts';

/** The name the cloud's device goes by in the data repo (`devices/<id>.json`) and its commits. */
export const CLOUD_DEVICE = 'cloud';

export interface Repertoire {
  /** Every study, by name; only the repertoire's are stormed. */
  studies: { sid: string; name: string; repertoire: boolean }[];
  /** Repertoire chapters, in the study list's order. */
  chapters: { sid: string; chapter: Chapter }[];
  /** The storm's lines: every repertoire chapter's, the paused ones left out. */
  lines: StormLine[];
  /** Lines left out as paused. */
  paused: number;
  /** The cards answered well lately (done, §5.41): left out of the shares, the first to make room. */
  done: Set<string>;
}

/** The repertoire and what is done, as `app/train.ts`'s `loadTraining` reads them. */
export function readRepertoire(files: ReadonlyMap<string, string>, now: number, c: StormConfig): Repertoire {
  const settings = trainSettings(files.get(SETTINGS_FILE));
  const metas: { sid: string; name: string; kind: string; cids: string[] }[] = [];
  const present = new Map<string, string[]>();
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind === 'study') {
      const meta = parseStudyMeta(text, where.sid);
      if (meta.ok) metas.push({ sid: where.sid, name: meta.value.name, kind: meta.value.kind, cids: meta.value.chapters });
    } else if (where.kind === 'chapter') present.set(where.sid, [...(present.get(where.sid) ?? []), where.cid]);
  }
  metas.sort((a, b) => a.name.localeCompare(b.name) || (a.sid < b.sid ? -1 : 1));
  const chapters: { sid: string; chapter: Chapter }[] = [];
  const indexing: ChapterIndexing[] = [];
  for (const meta of metas) {
    if (meta.kind !== 'repertoire') continue;
    for (const cid of reconcileChapterOrder(meta.cids, present.get(meta.sid) ?? [])) {
      const parsed = parseChapterFile(files.get(chapterPath(meta.sid, cid))!, cid);
      if (!parsed.ok) {
        indexing.push({ ok: false, sid: meta.sid, cid, reason: parsed.reason });
        continue;
      }
      chapters.push({ sid: meta.sid, chapter: parsed.chapter });
      indexing.push(indexChapter(meta.sid, parsed.chapter));
    }
  }
  const replay = new Replay({ ...DEFAULT_PARAMS, retention: settings.retention });
  replay.add(readProgress(files).events);
  const eventsOf = (card: string) => replay.eventsOf(card);
  const { index } = markLines(combineIndex(indexing), lineMarksOf(replay.states.keys(), eventsOf));
  const pausedKeys = new Set(index.lines.filter((l) => l.paused).map((l) => `${l.sid}/${l.cid}/${l.path.join(' ')}`));
  const all = stormLines(chapters);
  const lines = all.filter((l) => !pausedKeys.has(`${l.sid}/${l.cid}/${l.path.join(' ')}`));
  const done = new Set([...stormHistories(replay.states.keys(), eventsOf, now, c)].filter(([, h]) => h.done).map(([card]) => card));
  const studies = metas.map((m) => ({ sid: m.sid, name: m.name, repertoire: m.kind === 'repertoire' }));
  return { studies, chapters, lines, paused: all.length - lines.length, done };
}

/** A chapter's name, as the app shows it: its `ChapterName`, else its id. */
export const chapterName = (ch: Chapter): string => ch.headers.find(([k]) => k === 'ChapterName')?.[1] ?? ch.id;

/** A run's scope and how it is named. */
export interface Where {
  scope: StormScope;
  title: string;
}

/**
 * The scope named by a study and a chapter (each by its name, any case, or its id): the whole
 * repertoire with neither, a chapter alone if its name is in one repertoire study only. Throws, with
 * the names there are, when nothing or more than one answers.
 */
export function findScope(rep: Repertoire, study?: string, chapter?: string): Where {
  const same = (name: string, id: string, asked: string) => id === asked || name.trim().toLowerCase() === asked.trim().toLowerCase();
  const quote = (names: string[]) => names.map((n) => `"${n}"`).join(', ');
  let sid: string | undefined;
  if (study !== undefined) {
    const found = rep.studies.filter((s) => same(s.name, s.sid, study));
    if (!found.length) throw new Error(`no study named "${study}"; the repertoire's: ${quote(rep.studies.filter((s) => s.repertoire).map((s) => s.name))}`);
    if (found.length > 1) throw new Error(`${found.length} studies are named "${study}": give the id (${found.map((s) => s.sid).join(', ')})`);
    if (!found[0]!.repertoire) throw new Error(`"${found[0]!.name}" is a reference study: the storm walks repertoire studies only`);
    sid = found[0]!.sid;
  }
  const studyName = (id: string) => rep.studies.find((s) => s.sid === id)?.name ?? id;
  if (chapter === undefined) return sid ? { scope: { kind: 'study', sid }, title: studyName(sid) } : { scope: { kind: 'all' }, title: 'the whole repertoire' };
  const among = rep.chapters.filter((ch) => !sid || ch.sid === sid);
  const found = among.filter((ch) => same(chapterName(ch.chapter), ch.chapter.id, chapter));
  if (!found.length) throw new Error(`no chapter named "${chapter}"${sid ? ` in "${studyName(sid)}"; its chapters: ${quote(among.map((ch) => chapterName(ch.chapter)))}` : ' in a repertoire study'}`);
  if (found.length > 1) throw new Error(`${found.length} chapters are named "${chapter}": ${found.map((ch) => `"${studyName(ch.sid)}" (${ch.chapter.id})`).join(', ')}; name the study${sid ? ' and give the chapter’s id' : ''}`);
  const ch = found[0]!;
  return { scope: { kind: 'chapter', sid: ch.sid, cid: ch.chapter.id }, title: `${studyName(ch.sid)} › ${chapterName(ch.chapter)}` };
}

/**
 * The scope's line ends and decision points, as the storm's home has them (`app/storm.ts`'s
 * `scopeData`): found over the whole repertoire, so coverage stays the repertoire's, then those of
 * the scope's lines kept.
 */
export function gatherScope(lines: StormLine[], c: StormConfig, scope: StormScope = { kind: 'all' }): GatherScope {
  const f = frontiers(lines, c);
  return { lines, frontiers: inScope(f.frontiers, lines, scope), decisions: inScope(decisions(lines).points, lines, scope), cont: f.cont };
}

const lineKey = (r: { sid: string; cid: string; path: readonly string[] }) => `${r.sid}/${r.cid}/${r.path.join(' ')}`;

/**
 * The positions a run works on (`app/storm.ts`'s `storedInScope`): those on the scope's lines (the
 * paused ones are out of `lines` already), not done; the cloud's own only, or every device's.
 */
export function positionsToWork(positions: Iterable<StoredPosition>, lines: readonly StormLine[], scope: StormScope, done: ReadonlySet<string>, everyDevice: boolean): StoredPosition[] {
  const keep = new Set(lines.filter((l) => lineInScope(l, scope)).map(lineKey));
  return [...positions].filter((p) => (everyDevice || !p.from) && !done.has(p.card) && p.lines.some((r) => keep.has(lineKey(r))));
}

/**
 * A position with Stockfish's list put in. Another device's (`adopt`) becomes the cloud's own, so
 * it is written to the cloud's files: every device merging them takes the better list (§5.102's
 * `mergeShared`), the device that gathered it as well. Its lines, time and ratings stay as they were.
 */
export function withList(p: StoredPosition, d: Pick<StoredPosition, 'scored' | 'src' | 'depth'>, adopt: boolean): StoredPosition {
  const out: StoredPosition = { ...p, scored: d.scored, src: d.src, depth: d.depth };
  if (adopt) delete out.from;
  return out;
}

/**
 * The cloud's device: the one named `CLOUD_DEVICE` in `devices/`, the earliest made if several;
 * else a new id, with the file that names it (written as the app's sync writes a device's).
 */
export function cloudDevice(files: ReadonlyMap<string, string>, rnd: () => number, nowIso: string): { id: string; file?: [string, string] } {
  const found: { id: string; created: string }[] = [];
  const taken = new Set<string>();
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind !== 'device' && where.kind !== 'progress-day' && where.kind !== 'progress-month' && where.kind !== 'storm' && where.kind !== 'conflict-copy') continue;
    taken.add(where.dev);
    if (where.kind !== 'device') continue;
    try {
      const d = JSON.parse(text) as { name?: unknown; created?: unknown };
      if (d.name === CLOUD_DEVICE) found.push({ id: where.dev, created: typeof d.created === 'string' ? d.created : '' });
    } catch {
      // not a device file this reads
    }
  }
  found.sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : 1));
  if (found[0]) return { id: found[0].id };
  const id = freshId(rnd, taken);
  return { id, file: [devicePath(id), `{ "name": ${JSON.stringify(CLOUD_DEVICE)}, "created": "${nowIso}" }\n`] };
}

export interface Shared {
  /** Every position known: the cloud's own (no `from`), and the other devices' merged in, by card. */
  positions: Map<string, StoredPosition>;
  /** Of them, those from other devices. */
  theirs: number;
  /** The other devices' positions, each as its file has it (not merged): their Maia ratings are the devices' own. */
  elsewhere: StoredPosition[];
  /** Storm lines this version couldn't read, by file. */
  unread: Map<string, number>;
}

/** The storm files read: the cloud's own first, then each other device's merged in (§5.102). */
export function readShared(files: ReadonlyMap<string, string>, dev: string): Shared {
  const positions = new Map<string, StoredPosition>();
  const unread = new Map<string, number>();
  const others: { dev: string; positions: StoredPosition[] }[] = [];
  for (const [path, text] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const where = classifyPath(path);
    if (where.kind !== 'storm') continue;
    const read = parseSharedFile(text);
    if (read.unread) unread.set(path, read.unread);
    if (where.dev === dev) for (const p of read.positions) positions.set(p.card, p);
    else others.push({ dev: where.dev, positions: read.positions });
  }
  let theirs = 0;
  for (const o of others) {
    for (const p of o.positions) {
      const local = positions.get(p.card);
      const next = mergeShared(local, p, o.dev);
      if (!next) continue;
      if (!local) theirs++;
      positions.set(p.card, next);
    }
  }
  return { positions, theirs, elsewhere: others.flatMap((o) => o.positions), unread };
}

/** The positions to drop for `over` too many: those in `spare` first, then the oldest (the app's store's rule). */
export function victims(have: readonly StoredPosition[], over: number, spare: ReadonlySet<string> | undefined): StoredPosition[] {
  return over > 0 ? [...have].sort((a, b) => Number(!!spare?.has(b.card)) - Number(!!spare?.has(a.card)) || a.at - b.at).slice(0, over) : [];
}

/** New positions kept, one kept already never twice, the store capped at `max` (the app's `addPositions`). */
export function addPositions(store: Map<string, StoredPosition>, list: readonly StoredPosition[], max: number, spare?: ReadonlySet<string>): number {
  const have = [...store.values()];
  const fresh = list.filter((p, i) => !store.has(p.card) && list.findIndex((q) => q.card === p.card) === i);
  for (const p of fresh) store.set(p.card, p);
  for (const p of victims(have, have.length + fresh.length - max, spare)) store.delete(p.card);
  return fresh.length;
}

/**
 * The cloud's own files as they should be now, against what the checkout holds: each changed file's
 * new text, or null for one to remove. A file this version can't read in full is never rewritten
 * nor removed.
 */
export function ownFileChanges(files: ReadonlyMap<string, string>, positions: Iterable<StoredPosition>, dev: string): Map<string, string | null> {
  const want = sharedFiles([...positions], dev);
  const readable = (path: string) => {
    const text = files.get(path);
    return text === undefined || parseSharedFile(text).unread === 0;
  };
  const changes = new Map<string, string | null>();
  for (const [path, text] of want) if (files.get(path) !== text && readable(path)) changes.set(path, text);
  for (const path of files.keys()) if (path.startsWith(stormDir(dev)) && !want.has(path) && classifyPath(path).kind === 'storm' && readable(path)) changes.set(path, null);
  return changes;
}

/**
 * The ratings Maia is asked at (§5.82): the ladder's, and those the other devices' positions
 * (`elsewhere`, as their files have them) are rated at most often beyond it (the user's rating and
 * level up's on those devices), or `extra`.
 */
export function maiaElos(elsewhere: Iterable<StoredPosition>, extra?: readonly number[]): number[] {
  if (extra?.length) return [...new Set([...MAIA_LADDER, ...extra])].sort((a, b) => a - b);
  const sets = new Map<string, number>();
  for (const p of elsewhere) {
    if (!p.maia?.length) continue;
    const k = p.maia.map((r) => r.elo).filter((e) => !MAIA_LADDER.includes(e)).sort((a, b) => a - b).join(',');
    sets.set(k, (sets.get(k) ?? 0) + 1);
  }
  const best = [...sets].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const beyond = best ? best.split(',').map(Number) : [];
  return [...new Set([...MAIA_LADDER, ...beyond])].sort((a, b) => a - b);
}
