// Puzzles in the app (PLAN.md §5.47, §5.48): the dataset's base URL and the share of puzzles in a
// session (per device), the collect (anchors → index shards → candidates, bounded per press, the
// size said first), and the working set of bodies, fetched grouped by shard and kept (the
// archive). Everything here stays on the device; a puzzle's answers are `storm` events on `z|<id>`.
import { signal } from '@preact/signals';
import { anchors, readyPuzzle, selectEntries, type Anchor, type PuzzleCandidate, type ReadyPuzzle } from '../core/puzzles/puzzles.ts';
import { bodiesFor, entriesFor, groupByShard, shardOf, type DatasetMeta } from '../core/puzzles/dataset.ts';
import { STORM } from '../core/storm/config.ts';
import { lineInScope } from '../core/storm/sources.ts';
import { stormHistories } from '../core/storm/store.ts';
import { DEFAULT_PUZZLE_BASE, normalizeBase, puzzleData, type PuzzleData } from '../platform/puzzleData.ts';
import { stormStore, type StormScopeData } from './storm.ts';
import { trainData } from './train.ts';

export interface PuzzlePrefs {
  base: string;
  /** Percent of cards that are puzzles, once any are ready. */
  share: number;
}
export const SHARES = [0, 10, 25, 50, 75, 100] as const;
const KEY = 'repworks-puzzles';
const DEFAULTS: PuzzlePrefs = { base: DEFAULT_PUZZLE_BASE, share: 25 };
/** Index shards scanned per press of Collect (≈290 KB each on the wire). */
export const SHARDS_PER_COLLECT = 100;
/** Bodies kept ready to deal. */
export const WORKING_SET = 60;
/** An index shard's size on the wire, for the estimate (measured: 290–330 KB gzipped). */
export const SHARD_MB = 0.3;

function load(): PuzzlePrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PuzzlePrefs>) };
  } catch {
    return DEFAULTS;
  }
}
export const puzzlePrefs = signal<PuzzlePrefs>(load());
export function setPuzzlePrefs(patch: Partial<PuzzlePrefs>): void {
  puzzlePrefs.value = { ...puzzlePrefs.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(puzzlePrefs.value));
  } catch {
    // this page only
  }
  source = undefined;
}

let source: PuzzleData | undefined;
const data = (): PuzzleData => (source ??= puzzleData(normalizeBase(puzzlePrefs.value.base) || DEFAULT_PUZZLE_BASE));

/* ------------------------------------------------------------------ what is held */

interface Scanned {
  /** Anchor keys whose index shard was read. */
  keys: string[];
  builtAt: string;
  /** The dataset's deepest ply indexed, as its meta.json said: the band's ceiling. */
  maxEmissionPly?: number;
}

async function scanned(): Promise<Scanned> {
  return (await stormStore().get<Scanned>('meta', 'puzzlesScanned')) ?? { keys: [], builtAt: '' };
}

export interface PuzzleState {
  anchors: number;
  scanned: number;
  /** Index shards still to read, and roughly how many MB that is. */
  shardsLeft: number;
  candidates: number;
  ready: number;
  /** A collect or a fill running, and what it says. */
  running: boolean;
  note: string;
  error?: string;
}
export const puzzleState = signal<PuzzleState | undefined>(undefined);

function scopeAnchors(s: StormScopeData, meta?: DatasetMeta): Anchor[] {
  return anchors(
    s.lines.filter((l) => lineInScope(l, s.scope)),
    STORM,
    meta?.maxEmissionPly,
  );
}

const doneIds = (): Set<string> => {
  const d = trainData.value;
  if (!d) return new Set();
  const out = new Set<string>();
  for (const [card, h] of stormHistories(d.states.keys(), d.eventsOf, Date.now(), STORM)) if (card.startsWith('z|') && h.done) out.add(card.slice(2));
  return out;
};

/** The counts for the scope; no network. */
export async function refreshPuzzles(s: StormScopeData, patch: Partial<PuzzleState> = {}): Promise<void> {
  const sc = await scanned();
  const as = scopeAnchors(s, sc.maxEmissionPly === undefined ? undefined : { builtAt: sc.builtAt, shardHexLen: 3, maxEmissionPly: sc.maxEmissionPly });
  const seen = new Set(sc.keys);
  const left = new Set(as.filter((a) => !seen.has(a.key)).map((a) => shardOf(a.key)));
  const chapters = new Set(s.lines.filter((l) => l.sid && lineInScope(l, s.scope)).map((l) => `${l.sid}/${l.cid}`));
  const cands = (await stormStore().all<PuzzleCandidate>('puzzleCandidates')).filter((c) => chapters.has(c.chapter));
  const done = doneIds();
  const ready = (await stormStore().all<ReadyPuzzle>('puzzleBodies')).filter((p) => chapters.has(p.chapter) && !done.has(p.id));
  const prev = puzzleState.value;
  puzzleState.value = { anchors: as.length, scanned: as.length - as.filter((a) => !seen.has(a.key)).length, shardsLeft: left.size, candidates: cands.length, ready: ready.length, running: prev?.running ?? false, note: prev?.note ?? '', ...patch };
}

/** The puzzles ready to deal in the scope, not done (§5.48). */
export async function readyPuzzles(s: StormScopeData): Promise<ReadyPuzzle[]> {
  const chapters = new Set(s.lines.filter((l) => lineInScope(l, s.scope)).map((l) => `${l.sid}/${l.cid}`));
  const done = doneIds();
  return (await stormStore().all<ReadyPuzzle>('puzzleBodies')).filter((p) => chapters.has(p.chapter) && !done.has(p.id));
}

/* ------------------------------------------------------------------ collect (§5.48) */

let stop = false;
export function stopPuzzles(): void {
  stop = true;
}

/**
 * Reads up to `SHARDS_PER_COLLECT` index shards for the scope's anchors not read yet (the deepest
 * first), keeping the entries `selectEntries` picks; then fills the working set of bodies.
 */
export async function collect(s: StormScopeData): Promise<void> {
  if (puzzleState.value?.running) return;
  stop = false;
  await refreshPuzzles(s, { running: true, note: 'Reading the dataset…', error: undefined });
  try {
    const meta = await data().meta();
    let sc = await scanned();
    // Another build of the dataset: what was scanned may have changed (the bodies stay valid).
    if (sc.builtAt && sc.builtAt !== meta.builtAt) sc = { keys: [], builtAt: meta.builtAt };
    sc.builtAt = meta.builtAt;
    if (meta.maxEmissionPly !== undefined) sc.maxEmissionPly = meta.maxEmissionPly;
    const seen = new Set(sc.keys);
    const todo = scopeAnchors(s, meta).filter((a) => !seen.has(a.key));
    const byShard = new Map<string, Anchor[]>();
    for (const a of todo) {
      const sh = shardOf(a.key);
      const list = byShard.get(sh);
      if (list) list.push(a);
      else if (byShard.size < SHARDS_PER_COLLECT) byShard.set(sh, [a]);
    }
    const held = new Set((await stormStore().all<PuzzleCandidate>('puzzleCandidates')).map((c) => c.id));
    let read = 0;
    let found = 0;
    for (const [shard, list] of byShard) {
      if (stop) break;
      const entries = entriesFor(await data().index(shard), list.map((a) => a.key));
      for (const a of list) {
        for (const c of selectEntries(entries.get(a.key) ?? [], a, STORM, (id) => held.has(id), Math.random, meta.maxEmissionPly)) {
          held.add(c.id);
          await stormStore().put('puzzleCandidates', c.id, c);
          found++;
        }
        sc.keys.push(a.key);
      }
      read++;
      // Saved as it goes: a page closed half-way keeps what it read.
      await stormStore().put('meta', 'puzzlesScanned', sc);
      await refreshPuzzles(s, { running: true, note: `Read ${read} of ${byShard.size} index shards · ${found} puzzles found` });
    }
    await fillBodies(s, true);
    await refreshPuzzles(s, { running: false, note: stop ? 'Stopped.' : `Read ${read} index shards · ${found} puzzles found.` });
  } catch (e) {
    await refreshPuzzles(s, { running: false, note: '', error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Fetches bodies for candidates until `WORKING_SET` are ready (§12.2: grouped by body shard, each
 * fetched once); a body that won't replay drops its candidate.
 */
export async function fillBodies(s: StormScopeData, inCollect = false): Promise<void> {
  const ready = await readyPuzzles(s);
  if (ready.length >= WORKING_SET) return;
  const chapters = new Set(s.lines.filter((l) => lineInScope(l, s.scope)).map((l) => `${l.sid}/${l.cid}`));
  const have = new Set((await stormStore().all<ReadyPuzzle>('puzzleBodies')).map((p) => p.id));
  const done = doneIds();
  const want = (await stormStore().all<PuzzleCandidate>('puzzleCandidates')).filter((c) => chapters.has(c.chapter) && !have.has(c.id) && !done.has(c.id));
  // At random, so a fill isn't always the same anchors' puzzles.
  want.sort(() => Math.random() - 0.5);
  const picked = want.slice(0, WORKING_SET - ready.length);
  const byId = new Map(picked.map((c) => [c.id, c]));
  let n = 0;
  for (const [shard, ids] of groupByShard(picked.map((c) => c.id))) {
    if (stop) break;
    const bodies = bodiesFor(await data().bodies(shard), ids);
    for (const id of ids) {
      const body = bodies.get(id);
      const p = body && readyPuzzle(body, byId.get(id)!);
      if (p) await stormStore().put('puzzleBodies', id, p);
      else await stormStore().remove('puzzleCandidates', [id]);
    }
    n++;
    if (inCollect) await refreshPuzzles(s, { running: true, note: `Fetching puzzles: ${n} body shards` });
  }
}

