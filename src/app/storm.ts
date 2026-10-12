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
import { cdbList, deepenedPosition, engineList, explorerUntil, harvestDecision, harvestFrontier, judges, needsDeepening, positionLineKey, storedList, storedPosition, type HarvestIo, type StoredPosition } from '../core/storm/harvest.ts';
import { stormRecord, type StormRecord } from '../core/storm/record.ts';
import { setHeld, setOutcome, type SetOutcome } from '../core/storm/set.ts';
import { decisions, frontiers, inScope, lineInScope, stormLines, type DecisionPoint, type Frontier, type StormLine, type StormScope } from '../core/storm/sources.ts';
import { drawOrder, noteRecent, stormAnswer, stormHistories, takeSpread, type StormHistory } from '../core/storm/store.ts';
import type { Verdict } from '../core/storm/verdict.ts';
import { gameCard } from '../core/progress/cards.ts';
import { practiceMistakeOf, practiceMistakeSaved, stormMistakeItem } from '../core/games/saved.ts';
import { savedDeck } from './games.ts';
import { drawFrontier, fenAfterUci, kept, positionOf, uciToSan } from '../core/storm/walk.ts';
import type { Chapter } from '../core/study/model.ts';
import { positionAt } from '../core/study/tree.ts';
import type { Score } from '../core/engine/uci.ts';
import { openStormStore, type StormStore } from '../platform/stormStore.ts';
import { importShared, shareOwn, shareSoon } from './stormShare.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { entryKey, open } from './mode.ts';
import { recordEvent } from './state.ts';
import { analyseForStorm, cancelStormEngine, endStormEngine, focusedWidth, setStormEngineWidth, stormSearchSoFar } from './stormEngine.ts';
import { trainData, type TrainData } from './train.ts';
import { puzzlePrefs, readyPuzzles } from './puzzles.ts';
import { keptPolicy, missingRatings, type MaiaRating } from '../core/storm/maia.ts';
import { cleanFocus, easyAt, FOCUSES, matchesFocus, positionTags, type Focus } from '../core/storm/kinds.ts';
import { maiaElo, maiaPolicies, maiaStored } from './maia.ts';
import type { ReadyPuzzle } from '../core/puzzles/puzzles.ts';

/* ------------------------------------------------------------------ settings (per device) */

export type StormSource = 'ends' | 'replies' | 'both';
export interface StormPrefs {
  minPly: number;
  maxPly: number;
  source: StormSource;
  /** Stockfish re-scores the kept positions while the storm's home is open (§5.45). */
  deepen: boolean;
  /** Maia rates the kept positions while the storm's home is open, once it is downloaded (§5.82). */
  maia: boolean;
  /** The focus a session deals (§5.100): none is the classic storm. */
  focus: Focus[];
  /** Gather keeps going until stopped (§5.102). */
  overnight: boolean;
  /** The deepening runs an engine a core, several positions at once (§5.103). */
  focused: boolean;
}
const PREFS_KEY = 'repworks-storm';
const DEFAULT_PREFS: StormPrefs = { minPly: STORM.minPly, maxPly: STORM.maxPly, source: 'both', deepen: typeof matchMedia === 'undefined' || !matchMedia('(max-width: 768px)').matches, maia: true, focus: [], overnight: false, focused: false };

function loadPrefs(): StormPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<StormPrefs>;
    return { ...DEFAULT_PREFS, ...raw, focus: cleanFocus(raw.focus) };
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

/** A failure no wait mends (a Lichess login wanted): it ends even an overnight gather. */
class GatherEnd extends Error {}

/**
 * The gather's requests, each counted as it goes out (`spent`, then `tick` so the page shows it at
 * once) and each given up the moment the gather is stopped (`guard` rejects then). `until`: the
 * explorer's games up to that month. `strict` (overnight): a failed explorer request or game
 * export throws, to be waited out, rather than reading as a line end without games.
 */
function harvestIo(spent: Spent, tick: () => void, guard: <T>(p: Promise<T>) => Promise<T>, until?: string, strict = false): HarvestIo {
  const count = (k: keyof Spent) => {
    spent[k]++;
    tick();
  };
  return {
    explorer: async (fen) => {
      count('explorer');
      const r = await guard(ask(until ? { type: 'stormGames', fen, until } : { type: 'stormGames', fen }));
      if (strict && 'error' in r) throw r.error.login ? new GatherEnd(r.error.message) : new Error(r.error.message);
      return r.type === 'stormGames' && 'games' in r ? { total: r.games.total, moves: r.games.moves, gameIds: r.games.gameIds ?? [] } : null;
    },
    pgns: async (ids) => {
      count('games');
      const r = await guard(ask({ type: 'gamePgns', ids }));
      if (strict && 'error' in r) throw new Error(r.error.message);
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
  /** Maia (§5.82): whether its files are on this device; the ready positions rated at every rating
   *  wanted; the user's rating, `elo`. */
  maiaHere: boolean;
  rated: number;
  elo: number;
  /** The ready positions with each tag (§5.100), and those the focus chosen deals. */
  tags: Record<Focus, number>;
  matching: number;
  /** Kept positions gathered on other devices (§5.102). */
  shared: number;
}
export const stormHome = signal<StormHome | undefined>(undefined);

/**
 * The other devices' positions that came with the last pull merged in, then the home refreshed
 * (§5.102): on opening the storm's page and after every sync that changed the data.
 */
export async function refreshShared(s: StormScopeData): Promise<void> {
  try {
    const { added, updated } = await importShared(stormStore(), STORM.storeMax, doneCards());
    if (added || updated) await refreshHome(s);
  } catch (e) {
    console.error('the shared storm positions could not be read', e);
  }
}

export async function refreshHome(s: StormScopeData): Promise<void> {
  const data = trainData.value;
  if (!data) return;
  const all = storedInScope(await stormStore().positions(), s);
  const h = histories(data);
  const done = all.filter((p) => h.get(p.card)?.done).length;
  const deep = all.filter((p) => !needsDeepening(p, deepenTarget())).length;
  const ready = all.filter((p) => !h.get(p.card)?.done);
  const lines = new Set(ready.map(positionLineKey).filter(Boolean)).size;
  const elo = maiaElo.peek();
  const rated = ready.filter((p) => !missingRatings(p.maia, elo).length).length;
  const tags = Object.fromEntries(FOCUSES.map((f) => [f, 0])) as Record<Focus, number>;
  const focus = stormPrefs.value.focus;
  let matching = 0;
  for (const p of ready) {
    const t = positionTags(p, storedList(p), elo, STORM);
    for (const f of t) tags[f]++;
    if (matchesFocus(t, p.kind, focus)) matching++;
  }
  const maiaHere = await maiaStored().catch(() => false);
  const shared = all.filter((p) => p.from).length;
  stormHome.value = { stored: all.length, done, ready: ready.length, deep, lines, maiaHere, rated, elo, tags, matching, shared };
}

/* ------------------------------------------------------------------ the gather (§5.42) */

export interface Overnight {
  /** The pass under way, from 1: the first walks today's games, each after it older ones (§5.102). */
  pass: number;
  passes: number;
  doing: 'walking' | 'scoring' | 'waiting';
  /** Failures waited out. */
  errors: number;
}

export interface Gathering {
  running: boolean;
  frontiers: number;
  of: number;
  stored: number;
  spent: Spent;
  note: string;
  /** Kept going until stopped (§5.102). */
  overnight?: Overnight;
}
export const gathering = signal<Gathering | undefined>(undefined);
let stopGather = false;
let stopNow: (() => void) | undefined;
const STOPPED = new Error('stopped');

/** The cards answered well lately: the first to make room in the store. */
const doneCards = (): Set<string> => {
  const data = trainData.value;
  if (!data) return new Set();
  return new Set([...histories(data)].filter(([, h]) => h.done).map(([card]) => card));
};

/**
 * Walks the scope's line ends (and replies) until stopped or done, storing what passes. Overnight
 * (§5.102) it goes on: Stockfish re-scores what came in for as long as the pass took, then the
 * line ends are walked again over older games (the explorer up to `overnightStepMonths` earlier
 * each pass), until `overnightPasses`, the store full, or Stop; a failure is waited out (a minute,
 * then longer each time in a row, up to 15) instead of ending it. The positions are written out to
 * the data repo after every pass and at the end.
 */
export async function gather(s: StormScopeData, overnight = false): Promise<void> {
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
  const io = harvestIo(spent, tick, guard, undefined, overnight);
  const c = config();
  const source = stormPrefs.value.source;
  const ends = source === 'replies' ? [] : s.frontiers.slice();
  const points = source === 'ends' ? [] : s.decisions.slice().sort((a, b) => b.n - a.n);
  // Breadth first: one game at every line end, then (a second pass) the rest of each one's games.
  const again: { f: Frontier; walked: Set<string> }[] = [];
  const more = Math.max(0, STORM.gatherGamesPerFrontier - 1);
  const of = ends.length + points.length;
  const g: Gathering = { running: true, frontiers: 0, of, stored: 0, spent, note: of ? '' : 'Nothing to walk: no line in this scope ends past 4 plies.' };
  if (overnight) g.overnight = { pass: 1, passes: STORM.overnightPasses, doing: 'walking', errors: 0 };
  const show = () => (gathering.value = { ...g, spent: { ...spent }, ...(g.overnight ? { overnight: { ...g.overnight } } : {}) });
  show();
  let spare = doneCards();
  const keep = async (cands: Parameters<typeof storedPosition>[0][], from: Parameters<typeof storedPosition>[1]) => {
    const fresh = cands.filter(kept).map((x) => storedPosition(x, from, Date.now())).filter((p): p is StoredPosition => !!p);
    g.stored += await stormStore().addPositions(fresh, STORM.storeMax, spare);
  };
  // Every line end's games walked in this gather, and how often each is reached (the first pass's count).
  const walkedBy = new Map<string, Set<string>>();
  const reach = new Map<string, number | null>();
  const walked = (f: Frontier, ids: readonly string[] | undefined) => {
    const set = walkedBy.get(f.key) ?? new Set<string>();
    for (const id of ids ?? []) set.add(id);
    walkedBy.set(f.key, set);
    return set;
  };
  // One frontier's walk. Overnight a failure is waited out and the walk tried again; else it ends the gather.
  let fails = 0;
  const step = async (walk: () => Promise<void>) => {
    for (;;) {
      try {
        await walk();
        fails = 0;
        return;
      } catch (e) {
        if (e === STOPPED || e instanceof GatherEnd || !g.overnight) throw e;
        fails++;
        g.overnight.errors++;
        g.overnight.doing = 'waiting';
        const min = Math.min(15, 2 ** Math.min(4, fails - 1));
        g.note = `Waiting ${min} min after a failure: ${e instanceof Error ? e.message : String(e)}`;
        show();
        await guard(new Promise((r) => setTimeout(r, min * 60_000)));
        g.overnight.doing = 'walking';
        g.note = '';
        show();
      }
    }
  };
  try {
    let passStart = Date.now();
    while (!stopGather && (ends.length || points.length || again.length)) {
      // Line ends and replies taken in turn, so a gather stopped early has some of each; the
      // second pass over the line ends once the first is done.
      if (ends.length && (!points.length || g.frontiers % 2 === 0)) {
        const f = drawFrontier(ends, Math.random)!;
        await step(async () => {
          const h = await harvestFrontier(f, s.cont, io, c, more ? 1 : STORM.gatherGamesPerFrontier);
          reach.set(f.key, h.games ?? null);
          walked(f, h.walked);
          await keep(h.candidates, { lines: f.lines, names: f.names, games: h.games ?? null });
          if (more && h.walked?.length && (h.gameIds?.length ?? 0) > h.walked.length) {
            again.push({ f, walked: new Set(h.walked) });
            g.of++;
          }
        });
      } else if (!points.length) {
        const { f, walked: before } = again.splice(Math.floor(Math.random() * again.length), 1)[0]!;
        await step(async () => {
          const h = await harvestFrontier(f, s.cont, io, c, more, before);
          walked(f, h.walked);
          await keep(h.candidates, { lines: f.lines, names: f.names, games: h.games ?? null });
        });
      } else {
        const d = points.shift()!;
        await step(async () => {
          const h = await harvestDecision(d, io, c);
          for (const cand of h.candidates) await keep([cand], { lines: d.lines, names: d.names, games: cand.unc?.games ?? null });
        });
      }
      g.frontiers++;
      show();
      await refreshHome(s);
    }
    g.note = stopGather ? 'Stopped.' : of ? 'Every line end and reply walked.' : g.note;
    const o = g.overnight;
    if (o && of) {
      const pool0 = source === 'replies' ? [] : s.frontiers;
      for (let pass = 2; pass <= o.passes && !stopGather && pool0.length; pass++) {
        // What the pass found, scored by Stockfish (and written out) before the next goes on.
        await shareOwn(stormStore());
        o.doing = 'scoring';
        g.note = '';
        show();
        await deepen(s, { gather: true, untilMs: Date.now() + Math.max(STORM.deepenMs, Date.now() - passStart) });
        if (stopGather) break;
        await shareOwn(stormStore());
        const all = await stormStore().positions();
        spare = doneCards();
        if (all.filter((p) => !spare.has(p.card)).length >= STORM.storeMax) {
          g.note = `The store is full: ${STORM.storeMax} positions not yet answered well.`;
          break;
        }
        passStart = Date.now();
        o.pass = pass;
        o.doing = 'walking';
        const until = explorerUntil(Date.now(), (pass - 1) * STORM.overnightStepMonths);
        const older = harvestIo(spent, tick, guard, until, true);
        const pool = pool0.slice();
        g.frontiers = 0;
        g.of = pool.length;
        show();
        while (pool.length && !stopGather) {
          const f = drawFrontier(pool, Math.random)!;
          await step(async () => {
            // Only games not walked yet: a line end whose window names none is passed for its one request.
            const h = await harvestFrontier(f, s.cont, older, c, STORM.gatherGamesPerFrontier, walkedBy.get(f.key) ?? new Set());
            walked(f, h.walked);
            await keep(h.candidates, { lines: f.lines, names: f.names, games: reach.get(f.key) ?? h.games ?? null });
          });
          g.frontiers++;
          show();
          await refreshHome(s);
        }
        g.note = stopGather ? 'Stopped.' : `Pass ${pass} walked: games up to ${until}.`;
      }
      if (!stopGather && !g.note.startsWith('The store is full')) g.note = `Every pass walked, back to ${explorerUntil(Date.now(), (o.passes - 1) * STORM.overnightStepMonths)}.`;
      if (!stopGather) {
        o.doing = 'scoring';
        show();
        await deepen(s, { gather: true });
      }
    }
  } catch (e) {
    g.note = e === STOPPED ? 'Stopped.' : `The gather stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    stopNow = undefined;
    g.running = false;
    show();
    await refreshHome(s);
    await shareOwn(stormStore());
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
 * repertoire), and so from the files it shares (§5.102); other devices keep their copies. The
 * answers stay: they are progress events, and the record is made of them. Returns how many were
 * removed.
 */
export async function clearGathered(s: StormScopeData): Promise<number> {
  if (gathering.value?.running) return 0;
  stopDeepening();
  stopMaiaRating();
  const store = stormStore();
  const all = await store.positions();
  const gone = storedInScope(all, s);
  if (gone.length === all.length) await store.clearPositions();
  else await store.removePositions(gone.map((p) => p.card));
  // Another device's copy of one is not merged back in, unless that device gathers it again (§5.102).
  await store.noteCleared(gone.map((p) => p.card), Date.now());
  gathering.value = undefined;
  await refreshHome(s);
  await shareOwn(store);
  return gone.length;
}

/* ------------------------------------------------------------------ the deepened standard (§5.45) */

export const deepening = signal(false);
let deepenRun = 0;

/** A position the deepening searched (§5.104): how deep, how long, and whether its list was kept. */
export interface DeepenDone {
  card: string;
  label: string;
  depth: number;
  target: number;
  ms: number;
  /** 'kept', 'no answer', or why the list wasn't kept. */
  result: string;
}

/** Why a search's list wasn't kept (`deepenedPosition`'s reasons), in a few words. */
function notKept(p: StoredPosition, depth: number, lines: number): string {
  if (depth < STORM.judgeDepth) return `not kept: below depth ${STORM.judgeDepth}`;
  if (p.src === 'sf' && depth <= p.depth) return `not kept: no deeper than the ${p.depth} it has`;
  return lines ? 'not kept: too few moves' : 'not kept: no move';
}
/** The deepening's run as it goes (§5.104), kept after it ends until the next starts. */
export interface DeepenStats {
  /** Positions to search when the run started, and those searched since. */
  total: number;
  done: number;
  kept: number;
  /** Stopped by the time limit before the target depth. */
  short: number;
  failed: number;
  width: number;
  startedAt: number;
  /** The latest first, at most `RECENT_DONE`. */
  recent: DeepenDone[];
  /** The positions being searched now, by FEN: their labels, for each engine's row. */
  active: Map<string, string>;
}
export const deepenStats = signal<DeepenStats | null>(null);
const RECENT_DONE = 12;

/** A stored position in a few words: its first line's name and the plies past its end. */
export function positionLabel(p: StoredPosition): string {
  return `${p.names[0] ?? 'a line'}${p.ply ? `, ${p.ply} ${p.ply === 1 ? 'ply' : 'plies'} on` : ''}`;
}

const phone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches;
/** The depth the deepening and the look-ahead aim for on this device (§5.84). */
export const deepenTarget = (): number => (phone() ? STORM.deepenDepth.mobile : STORM.deepenDepth.desktop);

/** The positions that can't judge a move yet first (ChessDB's, the walk's), then those short of the target. */
const byNeed = (ps: StoredPosition[]): StoredPosition[] => [...ps.filter((p) => !judges(p, STORM)), ...ps.filter((p) => judges(p, STORM))];

/**
 * While the storm's home is open and nothing else runs, Stockfish re-scores the scope's kept
 * positions (MultiPV 12 at the device's target depth, §23, §5.84; focused, several at once,
 * §5.103), the positions not yet done
 * first, those whose list can't judge a move before those only short of the target. Stops when a
 * session or a gather starts, or the screen is left (`stopDeepening`). Within an overnight gather
 * (`gather`, §5.102) it runs whatever the setting, until `untilMs` or the gather is stopped.
 */
export async function deepen(s: StormScopeData, o: { gather?: boolean; untilMs?: number } = {}): Promise<void> {
  if (deepening.value || (!o.gather && !stormPrefs.value.deepen)) return;
  const run = ++deepenRun;
  deepening.value = true;
  // Stopped: a search under way is answered with nothing. Out of time (an overnight pass's
  // share): no new search starts, but one that finishes is kept.
  const stopped = () =>
    run !== deepenRun ||
    (o.gather ? stopGather : !!gathering.value?.running || !stormPrefs.value.deepen) ||
    (!!stormSession.value && stormSession.value.phase !== 'done');
  const busy = () => stopped() || (o.untilMs !== undefined && Date.now() > o.untilMs);
  try {
    const data = trainData.value;
    const h = data ? histories(data) : new Map<string, StormHistory>();
    // At random: the deepened are dealt first among equals (§23.8), so a pass taken in the store's
    // order would put one corner of the repertoire at the front of every session.
    const todo = storedInScope(await stormStore().positions(), s).filter((p) => needsDeepening(p, deepenTarget()) && !h.get(p.card)?.done);
    for (let i = todo.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [todo[i], todo[j]] = [todo[j]!, todo[i]!];
    }
    const order = byNeed(todo);
    // Focused (§5.103): as many positions at once as there are engines, each taken in turn.
    const width = stormPrefs.value.focused ? focusedWidth() : 1;
    setStormEngineWidth(width);
    const target = deepenTarget();
    deepenStats.value = { total: order.length, done: 0, kept: 0, short: 0, failed: 0, width, startedAt: Date.now(), recent: [], active: new Map() };
    console.info(`[storm deepen] ${order.length} positions to depth ${target}, MultiPV ${STORM.deepenMultipv}, ${width} at once, ${STORM.deepenMs / 1000} s each at most`);
    const one = async (): Promise<void> => {
      for (let p = order.shift(); p; p = order.shift()) {
        if (busy()) return;
        const t0 = Date.now();
        deepenStats.value?.active.set(p.fen, positionLabel(p));
        const a = await analyseForStorm(p.fen, STORM.deepenMultipv, target, STORM.deepenMs);
        if (stopped()) return;
        const pos = positionOf(p.fen);
        const d = pos && a ? deepenedPosition(p, engineList(a.lines, pos.turn, a.depth, STORM), STORM) : null;
        const done: DeepenDone = { card: p.card, label: positionLabel(p), depth: a?.depth ?? 0, target, ms: Date.now() - t0, result: !a ? 'no answer' : d ? 'kept' : notKept(p, a.depth, a.lines.length) };
        const st = deepenStats.value;
        st?.active.delete(p.fen);
        if (st && run === deepenRun) {
          deepenStats.value = {
            ...st,
            done: st.done + 1,
            kept: st.kept + (d ? 1 : 0),
            short: st.short + (a && a.depth < target ? 1 : 0),
            failed: st.failed + (a ? 0 : 1),
            recent: [done, ...st.recent].slice(0, RECENT_DONE),
          };
        }
        console.info(`[storm deepen] ${done.label}: depth ${done.depth} of ${target} in ${(done.ms / 1000).toFixed(1)} s, ${done.result} (${p.fen})`);
        if (d) {
          await stormStore().updatePosition(d.card, (cur) => ({ ...cur, scored: d.scored, src: d.src, depth: d.depth }));
          if (!p.from) shareSoon(stormStore());
          await refreshHome(s);
        }
      }
    };
    await Promise.all(Array.from({ length: width }, one));
  } finally {
    if (run === deepenRun) deepening.value = false;
  }
}

export function stopDeepening(): void {
  deepenRun++;
  if (deepening.value) cancelStormEngine();
  deepening.value = false;
}

/* ------------------------------------------------------------------ Maia's ratings (§5.82) */

export const maiaRating = signal(false);
let maiaRun = 0;

/**
 * While the storm's home is open, Maia's policy for the scope's kept positions not done, at the
 * ladder's ratings and the user's (core/storm/maia.ts), kept with each position: the difficulty
 * and the unintuitive storm come from it. Runs beside a gather and the deepening (Maia's worker is
 * a thread of its own), never during a session; only once Maia is downloaded. A position takes
 * about a second (one batch), against a minute for Stockfish's deepening.
 */
export async function rateWithMaia(s: StormScopeData): Promise<void> {
  if (maiaRating.value || !stormPrefs.value.maia) return;
  const run = ++maiaRun;
  maiaRating.value = true;
  const busy = () => run !== maiaRun || (!!stormSession.value && stormSession.value.phase !== 'done') || !stormPrefs.value.maia;
  let shown = Date.now();
  try {
    if (!(await maiaStored().catch(() => false))) return;
    const data = trainData.value;
    const h = data ? histories(data) : new Map<string, StormHistory>();
    const elo = maiaElo.peek();
    const todo = storedInScope(await stormStore().positions(), s).filter((p) => missingRatings(p.maia, elo).length && !h.get(p.card)?.done);
    for (const p of todo) {
      if (busy()) return;
      const elos = missingRatings(p.maia, elo);
      const policies = await maiaPolicies(p.fen, elos);
      // Maia couldn't answer (stopped, or failed): tried again on the next visit.
      if (!policies) return;
      const fresh: MaiaRating[] = elos.map((e, i) => keptPolicy(e, policies[i]!));
      await stormStore().updatePosition(p.card, (cur) => ({ ...cur, maia: [...(cur.maia ?? []).filter((r) => !elos.includes(r.elo)), ...fresh].sort((a, b) => a.elo - b.elo) }));
      if (!p.from) shareSoon(stormStore());
      if (Date.now() - shown > 2000) {
        shown = Date.now();
        await refreshHome(s);
      }
    }
  } finally {
    if (run === maiaRun) maiaRating.value = false;
    await refreshHome(s);
  }
}

export function stopMaiaRating(): void {
  maiaRun++;
  maiaRating.value = false;
}

/* ------------------------------------------------------------------ a set's look-ahead (§5.81) */

let lookRun = 0;
let lookBusy = false;
/** The card the look-ahead is searching, if any. */
let lookCard: StoredPosition | undefined;
/** The cards searched this session, deepened or not: one try each. */
const lookTried = new Set<string>();

/**
 * While a session waits for a move, Stockfish deepens its cards still below the device's target
 * (MultiPV 12 at depth 24, 22 on a phone, §23, §5.84), the one on the board first, then those
 * still to come: a move on a deepened card is graded at once from its list. A move stops it
 * (`pauseLookAhead`), its search kept when it has reached a depth that may judge
 * (`keepSearchSoFar`); the next deal, or the verdict, starts it again. A timed storm's queue is
 * drawn as it goes, so there it is mostly the card on the board.
 */
async function lookAhead(): Promise<void> {
  const s = stormSession.value;
  if (!s || s.phase === 'done' || lookBusy) return;
  const run = ++lookRun;
  lookBusy = true;
  try {
    for (;;) {
      const now = stormSession.value;
      if (run !== lookRun || !now || now.phase === 'done') return;
      const onBoard = now.item && !now.item.puzzle && !now.item.answer ? [now.item.card] : [];
      const p = [...onBoard, ...queue, ...secondPass.map((i) => i.card)].find((c) => needsDeepening(c, deepenTarget()) && !lookTried.has(c.card));
      if (!p) return;
      lookTried.add(p.card);
      lookCard = p;
      const a = await analyseForStorm(p.fen, STORM.deepenMultipv, deepenTarget(), STORM.deepenMs);
      lookCard = undefined;
      if (run !== lookRun) {
        // Stopped by a move: tried again later.
        lookTried.delete(p.card);
        return;
      }
      const pos = positionOf(p.fen);
      const d = pos && a ? deepenedPosition(p, engineList(a.lines, pos.turn, a.depth, STORM), STORM) : null;
      if (d) {
        swapIn(d);
        await stormStore().updatePosition(d.card, (cur) => ({ ...cur, scored: d.scored, src: d.src, depth: d.depth }));
      }
    }
  } finally {
    if (run === lookRun) lookBusy = false;
  }
}

/** The look-ahead stopped, its search with it. */
function pauseLookAhead(): void {
  if (!lookBusy) return;
  lookRun++;
  lookBusy = false;
  lookCard = undefined;
  cancelStormEngine();
}

/**
 * The look-ahead's search of `card`, stopped by a move on it, kept when it has reached a depth that
 * may judge (§5.84): stored and swapped in as a finished one would be. The card to grade, deepened
 * or as it was.
 */
async function keepSearchSoFar(card: StoredPosition): Promise<StoredPosition> {
  if (!lookBusy || lookCard?.card !== card.card) return card;
  const a = stormSearchSoFar(card.fen);
  const pos = positionOf(card.fen);
  const d = pos && a ? deepenedPosition(card, engineList(a.lines, pos.turn, a.depth, STORM), STORM) : null;
  if (!d) return card;
  swapIn(d);
  await stormStore().updatePosition(d.card, (cur) => ({ ...cur, scored: d.scored, src: d.src, depth: d.depth }));
  return d;
}

/** A deepened card in place of the one dealt, wherever the session holds it (cards match by id). */
function swapIn(d: StoredPosition): void {
  queue = queue.map((c) => (c.card === d.card ? d : c));
  secondPass = secondPass.map((i) => (i.card.card === d.card ? { ...i, card: d } : i));
  const s = stormSession.value;
  if (!s) return;
  const item = s.item && s.item.card.card === d.card && !s.item.answer ? { ...s.item, card: d } : s.item;
  update({ item, history: s.history.map((h) => (h === s.item ? item! : h.card.card === d.card ? { ...h, card: d } : h)) });
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
  /** The focus dealt (§5.100; the unintuitive storm of §5.82 is one): none for the classic storm. */
  focus?: Focus[];
  /** The user's Maia rating when it started: Maia's line on a card speaks of it. */
  elo: number;
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

/**
 * Deals the scope's stored positions that match the focus (§5.100): done ones out, misses to the
 * back (§14.15). The classic storm (no focus) deals the positions Maia at the user's rating finds
 * easily after the others.
 */
async function dealt(s: StormScopeData, focus: readonly Focus[], elo: number): Promise<StoredPosition[]> {
  const data = trainData.value;
  if (!data) return [];
  const all = storedInScope(await stormStore().positions(), s).filter((p) => matchesFocus(positionTags(p, storedList(p), elo, STORM), p.kind, focus));
  const items = all.map((p) => ({ ...p, deep: judges(p, STORM) }));
  const order = drawOrder(items, histories(data), Math.random, STORM.reachTop);
  if (focus.length) return order;
  const easy = (p: StoredPosition) => easyAt(p.maia, elo, storedList(p), STORM);
  return [...order.filter((p) => !easy(p)), ...order.filter(easy)];
}

/** The history entry the session was started on (app/mode.ts): left for another page and come back to by ←, it is there. */
let sessionEntry: string | undefined;
export const stormEntry = (): string | undefined => sessionEntry;

/**
 * Starts a timed storm or a set. `focus` (§5.100): only the positions that match it, and no
 * puzzles; none is the classic storm.
 */
export async function startStorm(s: StormScopeData, mode: SessionMode, o: { focus?: readonly Focus[] } = {}): Promise<void> {
  endStormSession();
  sessionEntry = entryKey();
  stopDeepening();
  // A session's look-ahead is one position at a time: the one engine on the device's threads.
  setStormEngineWidth(1);
  stopMaiaRating();
  scopeNow = s;
  recent ??= loadRecent();
  recentAtStart = new Set(recent);
  dealtLines = new Set();
  const elo = maiaElo.peek();
  const focus = cleanFocus(o.focus ?? []);
  queue = await dealt(s, focus, elo);
  share = focus.length ? 0 : puzzlePrefs.value.share;
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
  lookTried.clear();
  stormSession.value = { mode, scopeKey: s.key, title: s.title, phase: 'solving', item: undefined, history: [], points: 0, streak: 0, left: STORM.sessionMs, endsAt: undefined, pass: 1, revealed: false, note: '', total, disguise: puzzleQueue.length > 0, elo, ...(focus.length ? { focus } : {}) };
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
  void lookAhead();
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
  // The grade's searches come first: the look-ahead waits for the verdict, its search of this
  // card kept if deep enough to judge.
  const card = await keepSearchSoFar(item.card);
  pauseLookAhead();
  const v = await gradeMove(card, uci);
  void lookAhead();
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
    update({ item: done, history: now.history.map((h) => (h.card.card === item.card.card ? done : h)), points: now.points + pts, streak: nextStreak(now.streak, pts) });
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
  if (now.pass === 1 ? item.outcome : item.secondOutcome) {
    // Tried again after it was found (not with the top move): practice, its outcome kept.
    const next: StormItem = { ...item, answer: v, attempts };
    update({ item: next, history: now.history.map((h) => (h.card.card === item.card.card ? { ...h, ...next, answer: h.answer, later: [...(h.later ?? []), v] } : h)) });
    setPhase('verdict');
    return;
  }
  const first = now.pass === 1 && attempts === 1;
  if (first) void recordEvent({ t: new Date().toISOString(), ...stormAnswer(card.card, band, { uci, wp: v.wp ?? null, set: true, chapter: chapterOf(card) }) });
  const held = setHeld(band, STORM) && !now.revealed;
  const outcome = held && attempts < STORM.setRetryMax ? undefined : setOutcome(attempts, band, now.revealed, STORM);
  const next: StormItem = { ...item, answer: v, attempts, ...(outcome ? (now.pass === 1 ? { outcome } : { secondOutcome: outcome }) : {}) };
  // Only the first answer counts: a later attempt is kept beside it, never over it.
  const kept = (h: StormItem): StormItem => (first || !h.answer ? { ...h, ...next } : { ...h, ...next, answer: h.answer, later: [...(h.later ?? []), v] });
  update({ item: next, history: now.history.map((h) => (h.card.card === item.card.card ? kept(h) : h)) });
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

/** The absolute best move: the top of the list, or level with it (a puzzle: solved). */
export function isTopMove(v: StormAnswer): boolean {
  if (v.puzzle) return v.band === 'great';
  return v.rank === 1 || (!!v.bestSan && v.userSan === v.bestSan) || v.loss === 0;
}

/**
 * Whether the set's card can be tried again: held, with attempts left; or found on a retry (or in
 * the second pass) with anything but the top move, as often as wanted, the outcome kept.
 */
export function canTryAgain(s: StormSession | undefined): boolean {
  const item = s?.item;
  if (!s || !item || s.mode !== 'set') return false;
  if (s.phase === 'held') return (item.attempts ?? 0) < STORM.setRetryMax;
  if (s.phase !== 'verdict' || s.revealed || !item.answer) return false;
  const out = s.pass === 1 ? item.outcome : item.secondOutcome;
  return (out === 'retry' || (out === 'first' && s.pass === 2)) && !isTopMove(item.answer);
}

/** A set card tried again (best still hidden) — the board is set back. */
export function tryAgain(): void {
  const s = stormSession.value;
  if (!s?.item || !canTryAgain(s)) return;
  const { answer: _gone, played: _move, ...rest } = s.item;
  update({ item: s.item.puzzle ? { ...rest, step: 0 } : rest });
  setPhase('solving');
}

/** A held set card: show the move. It ends as shown, and comes back in the second pass. A card
 *  found but kept for more tries only shows it. */
export function showMove(): void {
  const s = stormSession.value;
  if (!s?.item) return;
  // Found already, kept for more tries: the move shown, the outcome as it was.
  if (s.phase === 'verdict' && canTryAgain(s)) return update({ revealed: true });
  if (s.phase !== 'held') return;
  const outcome: SetOutcome = 'shown';
  const item: StormItem = { ...s.item, ...(s.pass === 1 ? { outcome } : { secondOutcome: outcome }) };
  if (s.pass === 1) secondPass.push(again(s.item));
  update({ item, revealed: true, history: s.history.map((h) => (h.card.card === item.card.card ? { ...h, ...item, answer: h.answer ?? item.answer, later: h.later } : h)) });
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
  pauseLookAhead();
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
  pauseLookAhead();
  clearInterval(tick);
  clearTimeout(verdictTimer);
  gradeSeq++;
  stormSession.value = undefined;
}

/** Leaving the storm's screen: the gather stops, the engine ends. */
export function leaveStorm(): void {
  void shareOwn(stormStore());
  stopGathering();
  stopDeepening();
  stopMaiaRating();
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
  pauseLookAhead();
  stopGathering();
  stopDeepening();
  stopMaiaRating();
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

/** The game card a storm card was saved as, with its position and side (for its note, §5.91); undefined when not saved. */
export function stormMistakeCard(item: StormItem): { card: string; fen: string; color: 'white' | 'black' } | undefined {
  const m = stormMistake(item);
  const saved = m.item && practiceMistakeOf(savedDeck.value, m.fen, m.item.san);
  return saved ? { card: gameCard(saved.pid), fen: m.fen, color: m.color } : undefined;
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

const engineDepth = () => (phone() ? STORM.engineDepth.mobile : STORM.engineDepth.desktop);

async function engineScore(fen: string): Promise<{ score: Score; san: string; depth: number } | null> {
  const a = await analyseForStorm(fen, 1, engineDepth(), STORM.enginePhaseMs);
  const l = a?.lines[0];
  const pos = positionOf(fen);
  if (!a || !l || !pos) return null;
  return { score: l.score, san: l.pv[0] ? uciToSan(pos, l.pv[0]) : '', depth: a.depth };
}

/**
 * Grades a move by Stockfish only (§5.80, §5.84): the stored list when it may judge, else one
 * search of the position after the move against it, else two searches. ChessDB's list never
 * grades: it gives no depth, and its unanalysed moves are estimates.
 */
export async function gradeMove(card: StoredPosition, uci: string): Promise<StormAnswer> {
  const pos = positionOf(card.fen)!;
  const userSan = uciToSan(pos, uci);
  const base = { userSan, userUci: uci };
  const deep = judges(card, STORM);
  const list: ScoredList = storedList(card);
  const fromLoss = (ml: NonNullable<ReturnType<typeof moveLoss>>, source: Verdict['source'], extra: Partial<Verdict>): StormAnswer => {
    const band = grade(ml.wp, STORM);
    return { ...base, verdict: band, band, rank: ml.rank, wp: ml.wp, loss: ml.loss, userScore: ml.score, userWinrate: ml.winrate, source, ...extra };
  };
  const listed = deep ? moveLoss(list, uci, undefined, STORM) : null;
  if (listed) return fromLoss(listed, 'sflist', { depth: card.depth, bestScore: list[0]!.score, bestSan: uciToSan(pos, list[0]!.uci) });
  const child = fenAfterUci(card.fen, uci);
  if (!child) return { ...base, verdict: 'unknown', band: 'unknown' };
  if (deep) {
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
