// The storm in the app (PLAN.md §5.42–§5.46): the repertoire's line ends and decision points,
// the gather that finds positions and keeps them on this device, and the timed storm and the
// untimed set over them. Every answer is a `storm` progress event, so what is done and the record
// follow the owner across devices (§5.41); the positions themselves stay here (D5's cache tier).
import { signal } from '@preact/signals';
import type { Mode, StormMode } from '../core/app/fsm.ts';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import type { DeviceEvent } from '../core/progress/replay.ts';
import { STORM, withPlyRange, type Band, type StormConfig } from '../core/storm/config.ts';
import { engineLoss, grade, moveLoss, moverCp, nextStreak, points, type ScoredList } from '../core/storm/grade.ts';
import { cdbList, deepenedPosition, engineList, harvestDecision, harvestFrontier, needsDeepening, positionLineKey, storedList, storedPosition, type HarvestIo, type StoredPosition } from '../core/storm/harvest.ts';
import { stormRecord, type StormRecord } from '../core/storm/record.ts';
import { setHeld, setOutcome, type SetOutcome } from '../core/storm/set.ts';
import { decisions, frontiers, inScope, lineInScope, stormLines, type DecisionPoint, type Frontier, type StormLine, type StormScope } from '../core/storm/sources.ts';
import { drawOrder, noteRecent, stormAnswer, stormHistories, takeSpread, type StormHistory } from '../core/storm/store.ts';
import type { Verdict } from '../core/storm/verdict.ts';
import { gameCard } from '../core/progress/cards.ts';
import { practiceMistakeSaved, stormMistakeItem } from '../core/games/saved.ts';
import { savedDeck } from './games.ts';
import { drawFrontier, fenAfterUci, positionOf, uciToSan } from '../core/storm/walk.ts';
import type { Chapter } from '../core/study/model.ts';
import { positionAt } from '../core/study/tree.ts';
import type { Score } from '../core/engine/uci.ts';
import { openStormStore, type StormStore } from '../platform/stormStore.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { entryKey, open } from './mode.ts';
import { recordEvent } from './state.ts';
import { analyseForStorm, cancelStormEngine, endStormEngine } from './stormEngine.ts';
import { trainData, type TrainData } from './train.ts';
import { puzzlePrefs, readyPuzzles } from './puzzles.ts';
import type { ReadyPuzzle } from '../core/puzzles/puzzles.ts';

/* ------------------------------------------------------------------ settings (per device) */

export type StormSource = 'ends' | 'replies' | 'both';
export interface StormPrefs {
  minPly: number;
  maxPly: number;
  source: StormSource;
  /** Stockfish re-scores the kept positions while the storm's home is open (§5.45). */
  deepen: boolean;
}
const PREFS_KEY = 'repworks-storm';
const DEFAULT_PREFS: StormPrefs = { minPly: STORM.minPly, maxPly: STORM.maxPly, source: 'both', deepen: typeof matchMedia === 'undefined' || !matchMedia('(max-width: 768px)').matches };

function loadPrefs(): StormPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<StormPrefs>;
    return { ...DEFAULT_PREFS, ...raw };
  } catch {
    return DEFAULT_PREFS;
  }
}
export const stormPrefs = signal<StormPrefs>(loadPrefs());
export function setStormPrefs(patch: Partial<StormPrefs>): void {
  stormPrefs.value = { ...stormPrefs.value, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(stormPrefs.value));
  } catch {
    // kept for this page only
  }
}
const config = (): StormConfig => withPlyRange(STORM, stormPrefs.value.minPly, stormPrefs.value.maxPly);

/* ------------------------------------------------------------------ the store on this device */

let store: StormStore | undefined;
export function stormStore(): StormStore {
  return (store ??= openStormStore());
}

/* ------------------------------------------------------------------ the worker's answers */

type StormReply = Extract<FromWorker, { type: 'stormGames' | 'gamePgns' | 'scores' }>;
let nextId = 1;
const waiting = new Map<number, (m: StormReply) => void>();
let listening = false;
function ask(m: DistributiveOmit<Extract<ToWorker, { type: 'stormGames' | 'gamePgns' | 'scores' }>, 'id'>): Promise<StormReply> {
  if (!listening) {
    listening = true;
    onWorker((r) => {
      if (r.type !== 'stormGames' && r.type !== 'gamePgns' && r.type !== 'scores') return;
      const w = waiting.get(r.id);
      waiting.delete(r.id);
      w?.(r);
    });
  }
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    postToWorker({ ...m, id } as ToWorker);
  });
}
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface Spent {
  explorer: number;
  games: number;
  chessdb: number;
  searches: number;
}
const blankSpent = (): Spent => ({ explorer: 0, games: 0, chessdb: 0, searches: 0 });

/**
 * The gather's requests, each counted as it goes out (`spent`, then `tick` so the page shows it at
 * once) and each given up the moment the gather is stopped (`guard` rejects then).
 */
function harvestIo(spent: Spent, tick: () => void, guard: <T>(p: Promise<T>) => Promise<T>): HarvestIo {
  const count = (k: keyof Spent) => {
    spent[k]++;
    tick();
  };
  return {
    explorer: async (fen) => {
      count('explorer');
      const r = await guard(ask({ type: 'stormGames', fen }));
      return r.type === 'stormGames' && 'games' in r ? { total: r.games.total, moves: r.games.moves, gameIds: r.games.gameIds ?? [] } : null;
    },
    pgns: async (ids) => {
      count('games');
      const r = await guard(ask({ type: 'gamePgns', ids }));
      return r.type === 'gamePgns' && 'text' in r ? r.text : '';
    },
    cdb: async (fen) => {
      count('chessdb');
      const r = await guard(ask({ type: 'scores', fen }));
      return r.type === 'scores' && 'evals' in r ? cdbList(r.evals) : 'error';
    },
    engine: async (fen, lines, depth) => {
      count('searches');
      const a = await guard(analyseForStorm(fen, lines, depth, 8000));
      const pos = positionOf(fen);
      return a && pos ? engineList(a.lines, pos.turn, a.depth, STORM) : null;
    },
    rnd: Math.random,
  };
}

/* ------------------------------------------------------------------ the scope and its sources */

export interface StormWhere {
  sid?: string;
  cid?: string;
  at?: string[];
}

export interface StormScopeData {
  /** The address's scope, as a key: a session belongs to the scope it was started in. */
  key: string;
  /** The storm's own address, where the analysis board comes back to. */
  route: StormMode;
  scope: StormScope;
  title: string;
  lines: StormLine[];
  frontiers: Frontier[];
  decisions: DecisionPoint[];
  cont: ReturnType<typeof frontiers>['cont'];
  /** Some repertoire lines are paused (§5.70): left out of `lines`, and of the stored positions. */
  paused?: true;
}

export function scopeData(data: TrainData, where: StormWhere): StormScopeData | string {
  const chapters: { sid: string; chapter: Chapter }[] = [];
  for (const [k, chapter] of data.chapters) chapters.push({ sid: k.split('/')[0]!, chapter });
  // Paused lines (§5.70) are not being learned, so the storm leaves them out.
  const pausedKeys = new Set(data.index.lines.filter((l) => l.paused).map((l) => `${l.sid}/${l.cid}/${l.path.join(' ')}`));
  const lines = stormLines(chapters).filter((l) => !pausedKeys.has(`${l.sid}/${l.cid}/${l.path.join(' ')}`));
  let scope: StormScope = { kind: 'all' };
  let title = 'Whole repertoire';
  if (where.sid && where.cid && where.at) {
    const ch = data.chapters.get(`${where.sid}/${where.cid}`);
    const pos = ch && positionAt(ch, where.at);
    if (!pos) return 'That move isn’t in a repertoire chapter.';
    scope = { kind: 'position', key: positionKeyOf(pos) };
    title = `From ${where.at.length ? where.at.join(' ') : 'the start'}`;
  } else if (where.sid && where.cid) {
    scope = { kind: 'chapter', sid: where.sid, cid: where.cid };
    const ch = data.chapters.get(`${where.sid}/${where.cid}`);
    title = ch ? (ch.headers.find(([k]) => k === 'ChapterName')?.[1] ?? where.cid) : where.cid;
  } else if (where.sid) {
    scope = { kind: 'study', sid: where.sid };
    title = data.studyNames.get(where.sid) ?? where.sid;
  }
  const f = frontiers(lines, config());
  const d = decisions(lines);
  const route: StormMode = { name: 'storm', ...(where.sid ? { sid: where.sid } : {}), ...(where.sid && where.cid ? { cid: where.cid } : {}), ...(where.sid && where.cid && where.at ? { at: where.at } : {}) };
  const out: StormScopeData = { key: JSON.stringify(where), route, scope, title, lines, frontiers: inScope(f.frontiers, lines, scope), decisions: inScope(d.points, lines, scope), cont: f.cont };
  if (pausedKeys.size > 0) out.paused = true;
  return out;
}

/** Stored positions whose lines are in the scope (a position's: the lines through it). */
export function storedInScope(positions: readonly StoredPosition[], s: StormScopeData): StoredPosition[] {
  if (s.scope.kind === 'all' && !s.paused) return positions.slice();
  const keep = new Set(s.lines.filter((l) => lineInScope(l, s.scope)).map((l) => `${l.sid}/${l.cid}/${l.path.join(' ')}`));
  return positions.filter((p) => p.lines.some((r) => keep.has(`${r.sid}/${r.cid}/${r.path.join(' ')}`)));
}

const histories = (data: TrainData): Map<string, StormHistory> => stormHistories(data.states.keys(), data.eventsOf, Date.now(), STORM);

export function recordOf(data: TrainData): StormRecord {
  const events: DeviceEvent[] = [];
  for (const card of data.states.keys()) if (card.startsWith('s|') || card.startsWith('z|')) events.push(...data.eventsOf(card));
  return stormRecord(events);
}

/* ------------------------------------------------------------------ the home's counts */

export interface StormHome {
  stored: number;
  done: number;
  ready: number;
  /** Scored by Stockfish to the standard (§5.45). */
  deep: number;
  /** The line ends the ready positions come from (the spread deals one per line end first, §30). */
  lines: number;
}
export const stormHome = signal<StormHome | undefined>(undefined);

export async function refreshHome(s: StormScopeData): Promise<void> {
  const data = trainData.value;
  if (!data) return;
  const all = storedInScope(await stormStore().positions(), s);
  const h = histories(data);
  const done = all.filter((p) => h.get(p.card)?.done).length;
  const deep = all.filter((p) => !needsDeepening(p, STORM)).length;
  const lines = new Set(all.filter((p) => !h.get(p.card)?.done).map(positionLineKey).filter(Boolean)).size;
  stormHome.value = { stored: all.length, done, ready: all.length - done, deep, lines };
}

/* ------------------------------------------------------------------ the gather (§5.42) */

export interface Gathering {
  running: boolean;
  frontiers: number;
  of: number;
  stored: number;
  spent: Spent;
  note: string;
}
export const gathering = signal<Gathering | undefined>(undefined);
let stopGather = false;
let stopNow: (() => void) | undefined;
const STOPPED = new Error('stopped');

/** Walks the scope's line ends (and replies) until stopped or done, storing what passes. */
export async function gather(s: StormScopeData): Promise<void> {
  if (gathering.value?.running) return;
  stopDeepening();
  stopGather = false;
  const spent = blankSpent();
  // Stop gives up the request under way: the walk it was part of is left out, nothing waits on it.
  const stopped = new Promise<never>((_, reject) => (stopNow = () => reject(STOPPED)));
  stopped.catch(() => undefined);
  const guard = <T>(p: Promise<T>) => Promise.race([p, stopped]);
  // The counts as requests go out, at most four times a second, the last always shown.
  let later: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    later ??= setTimeout(() => {
      later = undefined;
      if (g.running) show();
    }, 250);
  };
  const io = harvestIo(spent, tick, guard);
  const c = config();
  const source = stormPrefs.value.source;
  const ends = source === 'replies' ? [] : s.frontiers.slice();
  const points = source === 'ends' ? [] : s.decisions.slice().sort((a, b) => b.n - a.n);
  // Breadth first: one game at every line end, then (a second pass) the rest of each one's games.
  const again: { f: Frontier; walked: Set<string> }[] = [];
  const more = Math.max(0, STORM.gatherGamesPerFrontier - 1);
  const of = ends.length + points.length;
  const g: Gathering = { running: true, frontiers: 0, of, stored: 0, spent, note: of ? '' : 'Nothing to walk: no line in this scope ends past 4 plies.' };
  const show = () => (gathering.value = { ...g, spent: { ...spent } });
  show();
  const keep = async (cands: Parameters<typeof storedPosition>[0][], from: Parameters<typeof storedPosition>[1]) => {
    const fresh = cands.filter((x) => !x.reject).map((x) => storedPosition(x, from, Date.now())).filter((p): p is StoredPosition => !!p);
    g.stored += await stormStore().addPositions(fresh, STORM.storeMax);
  };
  try {
    while (!stopGather && (ends.length || points.length || again.length)) {
      // Line ends and replies taken in turn, so a gather stopped early has some of each; the
      // second pass over the line ends once the first is done.
      if (ends.length && (!points.length || g.frontiers % 2 === 0)) {
        const f = drawFrontier(ends, Math.random)!;
        const h = await harvestFrontier(f, s.cont, io, c, more ? 1 : STORM.gatherGamesPerFrontier);
        await keep(h.candidates, { lines: f.lines, names: f.names, games: h.games ?? null });
        if (more && h.walked?.length && (h.gameIds?.length ?? 0) > h.walked.length) {
          again.push({ f, walked: new Set(h.walked) });
          g.of++;
        }
      } else if (!points.length) {
        const { f, walked } = again.splice(Math.floor(Math.random() * again.length), 1)[0]!;
        const h = await harvestFrontier(f, s.cont, io, c, more, walked);
        await keep(h.candidates, { lines: f.lines, names: f.names, games: h.games ?? null });
      } else {
        const d = points.shift()!;
        const h = await harvestDecision(d, io, c);
        for (const cand of h.candidates) await keep([cand], { lines: d.lines, names: d.names, games: cand.unc?.games ?? null });
      }
      g.frontiers++;
      show();
      await refreshHome(s);
    }
    g.note = stopGather ? 'Stopped.' : of ? 'Every line end and reply walked.' : g.note;
  } catch (e) {
    g.note = e === STOPPED ? 'Stopped.' : `The gather stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    stopNow = undefined;
    g.running = false;
    show();
    await refreshHome(s);
  }
}

export function stopGathering(): void {
  stopGather = true;
  if (!stopNow) return;
  stopNow();
  // Stockfish's search for the gather stops too (nothing else uses it while a gather runs).
  cancelStormEngine();
}

/**
 * Clears the gathered positions of the scope from this device (all of them for the whole
 * repertoire). The answers stay: they are progress events, and the record is made of them.
 * Returns how many were removed.
 */
export async function clearGathered(s: StormScopeData): Promise<number> {
  if (gathering.value?.running) return 0;
  stopDeepening();
  const store = stormStore();
  const all = await store.positions();
  const gone = storedInScope(all, s);
  if (gone.length === all.length) await store.clearPositions();
  else await store.removePositions(gone.map((p) => p.card));
  gathering.value = undefined;
  await refreshHome(s);
  return gone.length;
}

/* ------------------------------------------------------------------ the deepened standard (§5.45) */

export const deepening = signal(false);
let deepenRun = 0;

/**
 * While the storm's home is open and nothing else runs, Stockfish re-scores the scope's kept
 * positions (MultiPV 12 at depth 20, §23), the positions not yet done first. Stops when a session
 * or a gather starts, or the screen is left (`stopDeepening`).
 */
export async function deepen(s: StormScopeData): Promise<void> {
  if (deepening.value || !stormPrefs.value.deepen) return;
  const run = ++deepenRun;
  deepening.value = true;
  const busy = () => run !== deepenRun || !!gathering.value?.running || (!!stormSession.value && stormSession.value.phase !== 'done') || !stormPrefs.value.deepen;
  try {
    const data = trainData.value;
    const h = data ? histories(data) : new Map<string, StormHistory>();
    // At random: the deepened are dealt first among equals (§23.8), so a pass taken in the store's
    // order would put one corner of the repertoire at the front of every session.
    const todo = storedInScope(await stormStore().positions(), s).filter((p) => needsDeepening(p, STORM) && !h.get(p.card)?.done);
    for (let i = todo.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [todo[i], todo[j]] = [todo[j]!, todo[i]!];
    }
    for (const p of todo) {
      if (busy()) return;
      const a = await analyseForStorm(p.fen, STORM.deepenMultipv, STORM.deepenDepth, 60_000);
      if (busy()) return;
      const pos = positionOf(p.fen);
      const d = pos && a ? deepenedPosition(p, engineList(a.lines, pos.turn, a.depth, STORM), STORM) : null;
      if (d) {
        await stormStore().putPosition(d);
        await refreshHome(s);
      }
    }
  } finally {
    if (run === deepenRun) deepening.value = false;
  }
}

export function stopDeepening(): void {
  deepenRun++;
  if (deepening.value) cancelStormEngine();
  deepening.value = false;
}

/* ------------------------------------------------------------------ a session (§5.43, §5.44) */

export type SessionMode = 'storm' | 'set';
type Phase = 'solving' | 'grading' | 'verdict' | 'held' | 'done';

export interface StormAnswer extends Verdict {
  band: Band | 'unanswered';
}

export interface StormItem {
  /** The position; a puzzle rides as one too (its solver's position, `z|<id>`), see `puzzle`. */
  card: StoredPosition;
  /** A Lichess puzzle (§5.48): answered by its solution, not graded. */
  puzzle?: ReadyPuzzle;
  /** A puzzle's plies played so far (the solver's and the replies). */
  step?: number;
  /** The move just played on the card, kept on the board through the grade and the verdict (UCI). */
  played?: string;
  answer?: StormAnswer;
  /** The best move is shown in the review (asked for, `b`). */
  shown?: boolean;
  /** A set's attempts at it, and how it ended (first pass, then second). */
  attempts?: number;
  outcome?: SetOutcome;
  secondOutcome?: SetOutcome;
  /** In the history: a set's later attempts (Try again, the second pass), kept beside the first
   *  answer (`answer`), which alone counts. */
  later?: StormAnswer[];
}

export interface StormSession {
  mode: SessionMode;
  /** The scope's key (`StormScopeData.key`). */
  scopeKey: string;
  title: string;
  phase: Phase;
  item: StormItem | undefined;
  /** Every position asked, in order (the review). */
  history: StormItem[];
  points: number;
  streak: number;
  /** ms left on the clock (the storm), while it isn't running. */
  left: number;
  /** When the clock ends, while it runs (a deadline that slides, §8.2). */
  endsAt: number | undefined;
  /** A set's second pass (§17.2). */
  pass: 1 | 2;
  /** A set's held card: the move was shown. */
  revealed: boolean;
  /** Why the session ended early, or nothing to deal. */
  note: string;
  /** Positions dealt at the start (a set's size). */
  total: number;
  /** A retry from the review (§14.10b): nothing scored or recorded. */
  retry?: StormItem;
  /** Puzzles are in play: before a move, a puzzle and a position read the same (§13). */
  disguise: boolean;
  /** The next card comes by itself at this time (a storm's verdict, §18.1), unless paused. */
  nextAt?: number;
  /** …after this long, for the bar that shows it. */
  nextIn?: number;
  /** Where the review was (its row), kept across a visit to the analysis board. */
  reviewAt?: number;
}

export const stormSession = signal<StormSession | undefined>(undefined);

/* The spread (lichessable §30, §30b): one card per line end before any line end comes round
   again, and the line ends of the last sessions after the others. `recent` is read once per page
   and kept in memory from then on (written as cards are dealt). */
const RECENT_KEY = 'repworks-storm-recent';
function loadRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
let recent: string[] | undefined;
let recentAtStart = new Set<string>();
let dealtLines = new Set<string>();
const puzzleLineKey = (p: ReadyPuzzle): string => (p.anchor ? `a|${p.anchor}` : p.chapter ? `p|${p.chapter}|${p.name}` : '');
function noteDealt(key: string): void {
  if (!key) return;
  dealtLines.add(key);
  recent = noteRecent(recent ?? loadRecent(), key, STORM.recentLines);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // this page only
  }
}
/** `n` cards out of `q`, one per line end as far as they go (a set's six, §30). */
function spreadPick<T>(q: T[], keyOf: (t: T) => string, n: number): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  while (out.length < n && q.length) {
    const t = takeSpread(q, keyOf, used, recentAtStart)!;
    used.add(keyOf(t));
    out.push(t);
  }
  return out;
}

let queue: StoredPosition[] = [];
let puzzleQueue: ReadyPuzzle[] = [];
let share = 0;
let secondPass: StormItem[] = [];
let scopeNow: StormScopeData | undefined;
let tick: ReturnType<typeof setInterval> | undefined;
let verdictTimer: ReturnType<typeof setTimeout> | undefined;
let gradeSeq = 0;

const update = (patch: Partial<StormSession>) => {
  const s = stormSession.value;
  if (s) stormSession.value = { ...s, ...patch };
};

/** Deals the scope's stored positions: done ones out, misses to the back (§14.15). */
async function dealt(s: StormScopeData): Promise<StoredPosition[]> {
  const data = trainData.value;
  if (!data) return [];
  const all = storedInScope(await stormStore().positions(), s);
  const items = all.map((p) => ({ ...p, deep: p.src === 'sf' && p.depth >= STORM.deepenDepth }));
  return drawOrder(items, histories(data), Math.random, STORM.reachTop);
}

/** The history entry the session was started on (app/mode.ts): left for another page and come back to by ←, it is there. */
let sessionEntry: string | undefined;
export const stormEntry = (): string | undefined => sessionEntry;

export async function startStorm(s: StormScopeData, mode: SessionMode): Promise<void> {
  endStormSession();
  sessionEntry = entryKey();
  stopDeepening();
  scopeNow = s;
  recent ??= loadRecent();
  recentAtStart = new Set(recent);
  dealtLines = new Set();
  queue = await dealt(s);
  share = puzzlePrefs.value.share;
  const data = trainData.value;
  const ready = share > 0 ? await readyPuzzles(s) : [];
  puzzleQueue = data ? drawOrder(ready.map((p) => ({ card: 'z|' + p.id, p })), histories(data), Math.random, STORM.reachTop).map((x) => x.p) : [];
  let total = queue.length + puzzleQueue.length;
  if (mode === 'set') {
    // A set of six, the puzzles' share of it decided once (more if positions run short).
    let n = Math.min(puzzleQueue.length, Math.round((STORM.setSize * share) / 100));
    if (queue.length < STORM.setSize - n) n = Math.min(puzzleQueue.length, STORM.setSize - queue.length);
    // Six cards, six line ends as far as the store goes (§30).
    queue = spreadPick(queue, positionLineKey, STORM.setSize - n);
    puzzleQueue = spreadPick(puzzleQueue, puzzleLineKey, n);
    total = queue.length + n;
  }
  secondPass = [];
  stormSession.value = { mode, scopeKey: s.key, title: s.title, phase: 'solving', item: undefined, history: [], points: 0, streak: 0, left: STORM.sessionMs, endsAt: undefined, pass: 1, revealed: false, note: '', total, disguise: puzzleQueue.length > 0 };
  if (mode === 'storm') {
    tick = setInterval(() => {
      const st = stormSession.value;
      if (!st || st.phase !== 'solving' || st.endsAt === undefined) return;
      if (Date.now() >= st.endsAt) endStorm('time');
      else update({});
    }, 200);
  }
  deal();
}

/** The clock runs only while a card waits for a move (§8.2). */
function setPhase(phase: Phase): void {
  const s = stormSession.value;
  if (!s) return;
  if (s.mode === 'storm') {
    if (phase === 'solving' && s.endsAt === undefined) return update({ phase, endsAt: Date.now() + s.left });
    if (phase !== 'solving' && s.endsAt !== undefined) return update({ phase, left: Math.max(0, s.endsAt - Date.now()), endsAt: undefined });
  }
  update({ phase });
}

export const clockLeft = (s: StormSession): number => (s.endsAt !== undefined ? Math.max(0, s.endsAt - Date.now()) : s.left);

function deal(): void {
  const s = stormSession.value;
  if (!s) return;
  let card: StoredPosition | undefined;
  let item: StormItem | undefined;
  if (s.pass === 2) {
    item = secondPass.shift();
  } else {
    // A puzzle at the share chosen, or whatever is left (§5.48).
    // In a set the puzzles drawn are spread among the positions; in a storm, each card is one at the share.
    const odds = s.mode === 'set' ? (100 * puzzleQueue.length) / (puzzleQueue.length + queue.length || 1) : share;
    const puzzle = puzzleQueue.length && (!queue.length || Math.random() * 100 < odds) ? takeSpread(puzzleQueue, puzzleLineKey, dealtLines, recentAtStart) : undefined;
    if (puzzle) {
      item = { card: puzzleAsCard(puzzle), puzzle, step: 0, attempts: 0 };
      noteDealt(puzzleLineKey(puzzle));
    } else {
      card = takeSpread(queue, positionLineKey, dealtLines, recentAtStart);
      if (card) {
        item = { card, attempts: 0 };
        noteDealt(positionLineKey(card));
      }
    }
  }
  if (!item && s.mode === 'set' && s.pass === 1 && secondPass.length) {
    update({ pass: 2 });
    return deal();
  }
  if (!item) return endStorm(s.history.length ? 'out' : 'empty');
  const { nextAt: _a, nextIn: _b, ...rest } = stormSession.value!;
  stormSession.value = { ...rest, item, revealed: false, history: s.pass === 1 ? [...s.history, item] : s.history };
  setPhase('solving');
}

/** The user's move on the card (standard UCI). */
export async function answerMove(uci: string): Promise<void> {
  const s = stormSession.value;
  const item = s?.retry ?? s?.item;
  if (!s || !item || (s.phase !== 'solving' && !s.retry)) return;
  const seq = ++gradeSeq;
  const retry = !!s.retry;
  if (item.puzzle) return answerPuzzle(item, uci, retry, seq);
  // The move stays on the board while it is graded and while the verdict is read.
  const played: StormItem = { ...item, played: uci };
  if (retry) update({ retry: played });
  else {
    update({ item: played });
    setPhase('grading');
  }
  const v = await gradeMove(item.card, uci);
  const now = stormSession.value;
  if (!now || seq !== gradeSeq) return;
  if (retry) return update({ retry: { ...played, answer: v } });
  settle(played, uci, v);
}

/** A verdict reached: scored and written (the storm), or resolved or held (the set). */
function settle(item: StormItem, uci: string, v: StormAnswer): void {
  const now = stormSession.value;
  if (!now) return;
  const card = item.card;
  const band = v.band as Band;
  if (now.mode === 'storm') {
    const pts = points(band, now.streak, STORM);
    v.points = pts;
    void recordEvent({ t: new Date().toISOString(), ...stormAnswer(card.card, band, { uci, wp: v.wp ?? null, chapter: chapterOf(card) }) });
    const done: StormItem = { ...item, answer: v };
    update({ item: done, history: now.history.map((h) => (h.card === item.card ? done : h)), points: now.points + pts, streak: nextStreak(now.streak, pts) });
    setPhase('verdict');
    // A beat to read the verdict (shorter when the move scored, §18.1), then the next card by
    // itself; the clock is stopped meanwhile, and Pause keeps the card for as long as wanted.
    const wait = pts > 0 ? STORM.verdictFastMs : STORM.verdictMs;
    update({ nextAt: Date.now() + wait, nextIn: wait });
    verdictTimer = setTimeout(() => deal(), wait);
    return;
  }
  // The set (§17): a clean answer resolves, a worse one holds the card.
  const attempts = (item.attempts ?? 0) + 1;
  const first = now.pass === 1 && attempts === 1;
  if (first) void recordEvent({ t: new Date().toISOString(), ...stormAnswer(card.card, band, { uci, wp: v.wp ?? null, set: true, chapter: chapterOf(card) }) });
  const held = setHeld(band, STORM) && !now.revealed;
  const outcome = held && attempts < STORM.setRetryMax ? undefined : setOutcome(attempts, band, now.revealed, STORM);
  const next: StormItem = { ...item, answer: v, attempts, ...(outcome ? (now.pass === 1 ? { outcome } : { secondOutcome: outcome }) : {}) };
  // Only the first answer counts: a later attempt is kept beside it, never over it.
  const kept = (h: StormItem): StormItem => (first || !h.answer ? { ...h, ...next } : { ...h, ...next, answer: h.answer, later: [...(h.later ?? []), v] });
  update({ item: next, history: now.history.map((h) => (h.card === item.card ? kept(h) : h)) });
  setPhase(held ? 'held' : 'verdict');
  if (!held && now.pass === 1 && outcome && outcome !== 'first' && outcome !== 'unknown') secondPass.push(again(item));
}

/** A position (or puzzle) set back for another go. */
const again = (item: StormItem): StormItem => ({ card: item.card, attempts: 0, ...(item.puzzle ? { puzzle: item.puzzle, step: 0 } : {}) });

/** A puzzle's position now: its start, or after the plies played. */
export function puzzleFen(item: StormItem): string {
  const p = item.puzzle!;
  const step = item.step ?? 0;
  return step ? p.plies[step - 1]!.fen : p.fen;
}

/**
 * A puzzle answered (§5.48, DESIGN-storm-puzzles.md §2): the solution's move, or a mate, goes on,
 * the opponent's reply played after a moment; any other move ends it. Solved is `great`, a miss
 * `blunder`; nothing is graded.
 */
async function answerPuzzle(item: StormItem, uci: string, retry: boolean, seq: number): Promise<void> {
  const p = item.puzzle!;
  const step = item.step ?? 0;
  const fen = puzzleFen(item);
  const pos = positionOf(fen)!;
  const userSan = uciToSan(pos, uci);
  const after = fenAfterUci(fen, uci);
  const mates = !!after && !!positionOf(after)?.isCheckmate();
  const expected = p.plies[step];
  const right = !!expected && (uci === expected.uci || mates);
  const put = (next: StormItem) => (retry ? update({ retry: next }) : update({ item: next }));
  const solved = (band: Band) => {
    const v: StormAnswer = { verdict: band, band, userSan, userUci: uci, puzzle: true };
    // A wrong move stays on the board, as a position's does.
    const next: StormItem = right ? { ...item, step: step + 1, answer: v } : { ...item, played: uci, answer: v };
    if (retry) return update({ retry: next });
    settle(next, uci, v);
  };
  if (!right) return solved('blunder');
  if (mates || step + 1 >= p.plies.length) return solved('great');
  // The reply, after a moment; the clock waits.
  if (!retry) setPhase('grading');
  put({ ...item, step: step + 1 });
  await new Promise((r) => setTimeout(r, 400));
  if (seq !== gradeSeq) return;
  const replied: StormItem = { ...item, step: step + 2 };
  if (step + 2 >= p.plies.length) {
    // The line ends on the opponent's move: solved.
    put(replied);
    const v: StormAnswer = { verdict: 'great', band: 'great', userSan, userUci: uci, puzzle: true };
    if (retry) return update({ retry: { ...replied, answer: v } });
    return settle({ ...replied, answer: v }, uci, v);
  }
  if (retry) return update({ retry: replied });
  const now = stormSession.value;
  if (now) update({ item: replied, history: now.history.map((h) => (h === item ? replied : h)) });
  setPhase('solving');
}

/** A puzzle as the session's card: the solver's position, the opponent's move that made it. */
function puzzleAsCard(p: ReadyPuzzle): StoredPosition {
  const prev = p.previousMove && p.previousFen ? { san: uciToSan(positionOf(p.previousFen) ?? positionOf(p.fen)!, p.previousMove), uci: p.previousMove, before: p.previousFen } : null;
  const [sid = '', cid = ''] = p.chapter.split('/');
  return {
    card: 'z|' + p.id,
    key: positionKeyOf(positionOf(p.fen)!),
    fen: p.fen,
    side: p.solver,
    ply: p.gamePly ?? 0,
    lines: sid ? [{ sid, cid, path: [] }] : [],
    names: p.name ? [p.name] : [],
    arrived: prev,
    scored: [{ u: p.plies[0]!.uci, s: 0 }],
    src: 'cdb',
    depth: 0,
    invented: false,
    unc: null,
    games: null,
    at: 0,
  };
}

/** A held set card: try again (best still hidden) — the board is set back. */
export function tryAgain(): void {
  const s = stormSession.value;
  if (!s?.item || s.phase !== 'held') return;
  if ((s.item.attempts ?? 0) >= STORM.setRetryMax) return;
  const { answer: _gone, played: _move, ...rest } = s.item;
  update({ item: s.item.puzzle ? { ...rest, step: 0 } : rest });
  setPhase('solving');
}

/** A held set card: show the move. It ends as shown, and comes back in the second pass. */
export function showMove(): void {
  const s = stormSession.value;
  if (!s?.item || s.phase !== 'held') return;
  const outcome: SetOutcome = 'shown';
  const item: StormItem = { ...s.item, ...(s.pass === 1 ? { outcome } : { secondOutcome: outcome }) };
  if (s.pass === 1) secondPass.push(again(s.item));
  update({ item, revealed: true, history: s.history.map((h) => (h.card === item.card ? { ...h, ...item, answer: h.answer ?? item.answer, later: h.later } : h)) });
  setPhase('verdict');
}

/** A storm's verdict kept on the board: the next card waits for Next. */
export function pauseVerdict(): void {
  const s = stormSession.value;
  if (!s || s.phase !== 'verdict' || s.nextAt === undefined) return;
  clearTimeout(verdictTimer);
  const { nextAt: _a, nextIn: _b, ...rest } = s;
  stormSession.value = rest;
}

/** Next position (after a verdict in a set, or a storm's verdict at once). */
export function nextCard(): void {
  clearTimeout(verdictTimer);
  const s = stormSession.value;
  if (!s || (s.phase !== 'verdict' && s.phase !== 'held')) return;
  if (s.phase === 'held') {
    // Passing a held card is a miss that keeps it for the second pass.
    if (s.item && s.pass === 1) secondPass.push(again(s.item));
  }
  deal();
}

/** Ends the session: the card on the board kept, unanswered (§14.10c). */
export function endStorm(why: 'time' | 'out' | 'empty' | 'stop'): void {
  clearInterval(tick);
  clearTimeout(verdictTimer);
  gradeSeq++;
  const s = stormSession.value;
  if (!s) return;
  let history = s.history;
  if (s.item && !s.item.answer && s.phase !== 'done') {
    const unanswered: StormItem = { ...s.item, answer: { verdict: 'unanswered', band: 'unanswered', unanswered: true } };
    history = history.map((h) => (h === s.item ? unanswered : h));
  }
  const note = why === 'empty' ? 'Nothing to deal: gather positions first, or every position here is done for now.' : why === 'out' ? 'Every position dealt.' : why === 'time' ? 'Time.' : '';
  stormSession.value = { ...s, history, phase: 'done', item: undefined, endsAt: undefined, left: why === 'time' ? 0 : clockLeft(s), note };
  if (scopeNow) void refreshHome(scopeNow);
}

export function endStormSession(): void {
  clearInterval(tick);
  clearTimeout(verdictTimer);
  gradeSeq++;
  stormSession.value = undefined;
}

/** Leaving the storm's screen: the gather stops, the engine ends. */
export function leaveStorm(): void {
  stopGathering();
  stopDeepening();
  endStormSession();
  endStormEngine();
}

/**
 * Off to another page while the clock is stopped (the analysis board, lichessable §18.4, and
 * anywhere from there): the session is kept as it is for the entry it was started on, its verdict
 * waiting for Next; the gather, the deepening and the storm's engine stop. The storm's screen
 * opened on another entry starts afresh (the owner's request, 2026-10-08: ← comes back to it).
 */
export function suspendStorm(): void {
  pauseVerdict();
  stopGathering();
  stopDeepening();
  endStormEngine();
}

/**
 * The analysis board for a card (§20's lead-in): from the position before the move that reached
 * it, that move and the one played (a puzzle's solution) as its line, shown at the card.
 */
export function analysisFor(item: StormItem, back: StormMode): Extract<Mode, { name: 'analysis' }> {
  const puzzle = item.puzzle;
  if (puzzle) {
    const before = puzzle.previousFen && positionOf(puzzle.previousFen);
    const prev = before && puzzle.previousMove ? uciToSan(before, puzzle.previousMove) : '';
    const line = puzzle.plies.map((p) => p.san);
    const side = puzzle.solver;
    return prev ? { name: 'analysis', fen: puzzle.previousFen, line: [prev, ...line], show: 1, side, back } : { name: 'analysis', fen: puzzle.fen, line, show: 0, side, back };
  }
  const p = item.card;
  const at = positionOf(p.fen);
  const mine = item.answer?.userSan || (item.played && at ? uciToSan(at, item.played) : '');
  const a = p.arrived;
  if (a && positionOf(a.before)) return { name: 'analysis', fen: a.before, line: mine ? [a.san, mine] : [a.san], show: 1, side: p.side, back };
  return { name: 'analysis', fen: p.fen, ...(mine ? { line: [mine], show: 0 } : {}), side: p.side, back };
}

/** Analyses a card, the session kept; a held set card is shown first (it counts as shown, §18.4). */
export function analyse(item: StormItem, back: StormMode, reviewAt?: number): void {
  const s = stormSession.value;
  if (s?.phase === 'held' && s.item === item) showMove();
  if (reviewAt !== undefined) update({ reviewAt });
  open(analysisFor(item, back));
}

/** The review: the best move shown or hidden for a position (§14.10a). */
export function toggleShown(index: number): void {
  const s = stormSession.value;
  if (!s) return;
  update({ history: s.history.map((h, i) => (i === index ? { ...h, shown: !h.shown } : h)) });
}

/** The review's "Try again" (§14.10b): the position on the board, nothing scored or recorded. */
export function retryFromReview(index: number | undefined): void {
  const s = stormSession.value;
  if (!s) return;
  const item = index === undefined ? undefined : s.history[index];
  if (item) update({ retry: again(item), reviewAt: index! });
  else {
    const { retry: _gone, ...rest } = s;
    stormSession.value = rest;
  }
}

/* ------------------------------------------------------------------ save as a mistake (§5.74) */

/** What a storm card saves as a mistake: its position, and the move played when it went wrong (not a puzzle's). */
function stormMistake(item: StormItem) {
  const fen = item.puzzle ? item.puzzle.fen : item.card.fen;
  const color = item.puzzle ? item.puzzle.solver : (positionOf(fen)?.turn ?? item.card.side);
  const v = item.answer;
  const wrong = !item.puzzle && v && (v.band === 'ok' || v.band === 'bad' || v.band === 'blunder') && v.userUci && v.userSan;
  const move = wrong ? { san: v.userSan!, uci: v.userUci!, wpDrop: v.wp ?? 0, cpLoss: v.loss ?? 0 } : undefined;
  return { fen, color, move, item: stormMistakeItem({ fen, color, ...(move ? { move } : {}), now: Date.now(), from: item.card.card }) };
}

/** Whether the card is in the game cards already (its position, and the same move or none). */
export function stormMistakeSaved(item: StormItem): boolean {
  const m = stormMistake(item);
  return !!m.item && practiceMistakeSaved(savedDeck.value, m.fen, m.item.san);
}

/** Saves a storm card as a mistake in the game cards, answered well or not; nothing is scored. */
export async function saveStormMistake(item: StormItem): Promise<boolean> {
  const m = stormMistake(item);
  if (!m.item || practiceMistakeSaved(savedDeck.value, m.fen, m.item.san)) return false;
  await recordEvent({ t: new Date().toISOString(), k: 'saved', card: gameCard(m.item.pid), item: { ...m.item } });
  return true;
}

const chapterOf = (p: StoredPosition): string | undefined => (p.lines[0] ? `${p.lines[0].sid}/${p.lines[0].cid}` : undefined);

/* ------------------------------------------------------------------ the grade (§3.4's three tiers) */

const engineDepth = () => (matchMedia('(max-width: 768px)').matches ? STORM.engineDepth.mobile : STORM.engineDepth.desktop);

async function engineScore(fen: string): Promise<{ score: Score; san: string; depth: number } | null> {
  const a = await analyseForStorm(fen, 1, engineDepth(), STORM.enginePhaseMs);
  const l = a?.lines[0];
  const pos = positionOf(fen);
  if (!a || !l || !pos) return null;
  return { score: l.score, san: l.pv[0] ? uciToSan(pos, l.pv[0]) : '', depth: a.depth };
}

/** Grades a move: the stored list, then the position after it, then Stockfish on both. */
export async function gradeMove(card: StoredPosition, uci: string): Promise<StormAnswer> {
  const pos = positionOf(card.fen)!;
  const userSan = uciToSan(pos, uci);
  const list: ScoredList = storedList(card);
  const engineListed = list.source === 'sf';
  const base = { userSan, userUci: uci };
  const fromLoss = (ml: NonNullable<ReturnType<typeof moveLoss>>, source: Verdict['source'], extra: Partial<Verdict> = {}): StormAnswer => {
    const band = grade(ml.wp, STORM);
    const v: StormAnswer = { ...base, verdict: band, band, rank: ml.rank, wp: ml.wp, loss: ml.loss, userScore: ml.score, userWinrate: ml.winrate, ...extra };
    if (source) v.source = source;
    return v;
  };
  const listed = moveLoss(list, uci, undefined, STORM);
  if (listed) return fromLoss(listed, engineListed ? 'sflist' : 'list', engineListed ? { depth: card.depth, bestScore: list[0]!.score, bestSan: uciToSan(pos, list[0]!.uci) } : {});
  const child = fenAfterUci(card.fen, uci);
  if (!child) return { ...base, verdict: 'unknown', band: 'unknown' };
  if (!engineListed) {
    const r = await ask({ type: 'scores', fen: child });
    const childList = r.type === 'scores' && 'evals' in r ? cdbList(r.evals) : null;
    const ml = childList ? moveLoss(list, uci, childList[0]!.score, STORM) : null;
    if (ml) return fromLoss(ml, 'child');
  } else {
    // One search of the position after it, against the stored engine list (§23).
    const after = await engineScore(child);
    if (after) {
      // The opponent's best there, from the opponent's side: moveLoss negates it.
      const childBest = moverCp(after.score, positionOf(child)!.turn, STORM);
      const ml = childBest === null ? null : moveLoss(list, uci, childBest, STORM);
      if (ml) return fromLoss(ml, 'engine', { oneSearch: true, depth: after.depth, bestScore: list[0]!.score, bestSan: uciToSan(pos, list[0]!.uci) });
    }
  }
  // Two searches, both from one engine (§14.8).
  const [best, after] = [await engineScore(card.fen), await engineScore(child)];
  if (best && after) {
    const r = engineLoss(best.score, after.score, pos.turn, STORM);
    if (r) {
      const band = grade(r.wp, STORM);
      return { ...base, verdict: band, band, rank: null, wp: r.wp, loss: r.loss, userScore: r.score, source: 'engine', depth: Math.min(best.depth, after.depth), bestSan: best.san, bestScore: r.bestScore };
    }
  }
  return { ...base, verdict: 'unknown', band: 'unknown' };
}
