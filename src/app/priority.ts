// Prioritizing a study or a chapter (PLAN.md §5.70): its lines scored through the explorer worker
// (its limiter and IndexedDB cache, so a second run comes from the cache) and Maia where the
// explorer is thin and Maia is on; ranked in core (`rankLines`); Apply pauses the lines not kept
// and unpauses the kept ones, recording only the lines whose mark changes. "Add the next N"
// ranks again with the active lines taken first and unpauses the best N paused ones.
import { signal } from '@preact/signals';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import type { Color } from '../core/games/record.ts';
import { keptLines, rankLines, type Ranking, type Shares } from '../core/repertoire/priority.ts';
import type { Line } from '../core/repertoire/index.ts';
import { header } from '../core/study/model.ts';
import { startPosition } from '../core/study/tree.ts';
import { statusOf } from '../core/train/queue.ts';
import type { LineMark } from '../core/progress/events.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { setMarks } from './lineMarks.ts';
import { maiaElo, maiaPolicy, maiaPrefs } from './maia.ts';
import { trainData, type TrainData } from './train.ts';

export const RATINGS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;
export const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;

/** This device's choices for the ranking (the checklist's explorer filter by default). */
export interface PriorityPrefs {
  ratings: number[];
  speeds: string[];
  natural: boolean;
  keepLearned: boolean;
}
const DEFAULT_PREFS: PriorityPrefs = { ratings: [1600, 1800, 2000, 2200, 2500], speeds: ['blitz', 'rapid', 'classical', 'correspondence'], natural: true, keepLearned: true };
const KEY = 'repworks-priority';
function loadPrefs(): PriorityPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PriorityPrefs>;
    return { ...DEFAULT_PREFS, ...p };
  } catch {
    return DEFAULT_PREFS;
  }
}
export const priorityPrefs = signal<PriorityPrefs>(loadPrefs());
export function setPriorityPrefs(patch: Partial<PriorityPrefs>): void {
  priorityPrefs.value = { ...priorityPrefs.peek(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(priorityPrefs.peek()));
  } catch {
    // this page only
  }
}

/** What is prioritized: a study's lines for one side, or one chapter's. */
export interface PriorityScope {
  sid: string;
  cid?: string;
  side: Color;
}

export type PriorityRun =
  | { phase: 'scoring'; scope: PriorityScope; done: number; total: number; started: number }
  | { phase: 'ranked'; scope: PriorityScope; ranking: Ranking; numbers: Map<Line, number> }
  | { phase: 'error'; scope: PriorityScope; error: string; login?: boolean };

export const priorityRun = signal<PriorityRun | undefined>(undefined);
/** The panel: open on a scope (its study and, from a chapter's menu, its chapter). */
export const priorityPanel = signal<{ sid: string; cid?: string } | undefined>(undefined);
export const openPriority = (sid: string, cid?: string) => {
  priorityRun.value = undefined;
  priorityPanel.value = cid === undefined ? { sid } : { sid, cid };
};
export const closePriority = () => {
  stopPriority();
  priorityPanel.value = undefined;
};

/** A line's side: the colour of its first own move (its chapter's Orientation). */
export function sideOf(data: TrainData, line: Line): Color | undefined {
  const c = data.chapters.get(`${line.sid}/${line.cid}`);
  const o = c && header(c, 'Orientation');
  return o === 'white' || o === 'black' ? o : undefined;
}

/** The sides a study (or chapter) has lines for, most lines first. */
export function sidesOf(data: TrainData, sid: string, cid?: string): Color[] {
  const count = { white: 0, black: 0 };
  for (const l of data.index.lines) if (l.sid === sid && (cid === undefined || l.cid === cid)) count[sideOf(data, l) ?? 'white']++;
  return (['white', 'black'] as const).filter((c) => count[c] > 0).sort((a, b) => count[b] - count[a]);
}

export function linesOf(data: TrainData, scope: PriorityScope): Line[] {
  return data.index.lines.filter((l) => l.sid === scope.sid && (scope.cid === undefined || l.cid === scope.cid) && sideOf(data, l) === scope.side);
}

/** "Line n" as the line list numbers it: within its chapter, in the index's order. */
function numbersOf(data: TrainData): Map<Line, number> {
  const out = new Map<Line, number>();
  const at = new Map<string, number>();
  for (const l of data.index.lines) {
    const k = `${l.sid}/${l.cid}`;
    const n = (at.get(k) ?? 0) + 1;
    at.set(k, n);
    out.set(l, n);
  }
  return out;
}

type Reply = Extract<FromWorker, { type: 'practiceGames' }>;
let nextId = 600_000_000;
const waiting = new Map<number, (r: Reply) => void>();
let listening = false;
class LookupFailed extends Error {
  readonly login: boolean;
  constructor(message: string, login = false) {
    super(message);
    this.login = login;
  }
}

function explorerShares(fen: string, ratings: number[], speeds: string[]): Promise<Shares> {
  if (!listening) {
    listening = true;
    onWorker((r) => {
      if (r.type !== 'practiceGames') return;
      const w = waiting.get(r.id);
      waiting.delete(r.id);
      w?.(r);
    });
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => {
      if ('error' in r) return reject(new LookupFailed(r.error.message, r.error.login));
      const total = r.games.total;
      resolve({ total, moves: total ? r.games.moves.map((m) => ({ uci: m.uci, san: m.san, share: (m.white + m.draws + m.black) / total })) : [] });
    });
    postToWorker({ type: 'practiceGames', id, fen, speeds, ratings } satisfies ToWorker);
  });
}

let runId = 0;
export function stopPriority(): void {
  runId++;
  if (priorityRun.peek()?.phase === 'scoring') priorityRun.value = undefined;
}

class Stopped extends Error {}

async function rank(data: TrainData, scope: PriorityScope, first: (l: Line) => boolean, onProgress?: (done: number, total: number) => void): Promise<Ranking> {
  const mine = runId;
  const prefs = priorityPrefs.peek();
  const useMaia = maiaPrefs.peek().on;
  const elo = maiaElo.peek();
  return rankLines({
    lines: linesOf(data, scope),
    startOf: (l) => {
      const c = data.chapters.get(`${l.sid}/${l.cid}`);
      return c ? startPosition(c) : undefined;
    },
    learned: (card) => {
      const s = data.states.get(card);
      return statusOf(s) !== 'fresh' || !!s?.suspended;
    },
    explorer: async (fen) => {
      if (mine !== runId) throw new Stopped();
      return explorerShares(fen, prefs.ratings, prefs.speeds);
    },
    ...(useMaia
      ? {
          maia: async (fen: string) => {
            const policy = await maiaPolicy(fen, elo);
            return policy ? new Map(policy.map((m) => [m.uci, m.prob])) : undefined;
          },
        }
      : {}),
    natural: prefs.natural,
    first,
    ...(onProgress ? { onProgress } : {}),
  });
}

/** Scores and ranks the scope's lines, must-learn lines first. */
export async function runPriority(scope: PriorityScope): Promise<void> {
  const data = trainData.peek();
  if (!data) return;
  stopPriority();
  const mine = runId;
  priorityRun.value = { phase: 'scoring', scope, done: 0, total: 0, started: Date.now() };
  try {
    const ranking = await rank(data, scope, (l) => !!l.must, (done, total) => {
      const r = priorityRun.peek();
      if (mine === runId && r?.phase === 'scoring') priorityRun.value = { ...r, done, total };
    });
    if (mine === runId) priorityRun.value = { phase: 'ranked', scope, ranking, numbers: numbersOf(data) };
  } catch (e) {
    if (e instanceof Stopped || mine !== runId) return;
    priorityRun.value = { phase: 'error', scope, error: e instanceof Error ? e.message : String(e), ...(e instanceof LookupFailed && e.login ? { login: true } : {}) };
  }
}

/** The marks Apply writes: kept lines active, the rest paused (must-learn lines are kept). */
export function applyChanges(ranking: Ranking, count: number, keepLearned: boolean): { line: Line; mark: LineMark }[] {
  const kept = keptLines(ranking, count, keepLearned);
  const out: { line: Line; mark: LineMark }[] = [];
  for (const r of ranking.lines) {
    if (r.line.must) continue;
    if (kept.has(r.line) && r.line.paused) out.push({ line: r.line, mark: 'none' });
    else if (!kept.has(r.line) && !r.line.paused) out.push({ line: r.line, mark: 'paused' });
  }
  return out;
}

export async function applyPriority(ranking: Ranking, count: number, keepLearned: boolean): Promise<number> {
  return setMarks(applyChanges(ranking, count, keepLearned));
}

export const growing = signal<{ sid: string; done: number; total: number } | undefined>(undefined);
export const growError = signal<string | undefined>(undefined);

/**
 * "Add the next N by priority": the study's lines ranked again (from the cache, mostly) with the
 * active lines taken first, then the best `n` paused lines unpaused, for each side the study has.
 */
export async function addNext(sid: string, n: number): Promise<number> {
  const data = trainData.peek();
  if (!data || growing.peek()) return 0;
  growError.value = undefined;
  growing.value = { sid, done: 0, total: 0 };
  const mine = runId;
  try {
    const ranked: { value: number; line: Line }[] = [];
    for (const side of sidesOf(data, sid)) {
      const scope: PriorityScope = { sid, side };
      if (!linesOf(data, scope).some((l) => l.paused)) continue;
      const ranking = await rank(data, scope, (l) => !l.paused, (done, total) => (growing.value = { sid, done, total }));
      ranked.push(...ranking.lines.filter((r) => r.line.paused).map((r) => ({ value: r.value, line: r.line })));
    }
    // Both sides' paused lines by value: the next N of the study.
    const next = ranked.sort((a, b) => b.value - a.value).slice(0, n);
    return await setMarks(next.map((r) => ({ line: r.line, mark: 'none' as const })));
  } catch (e) {
    if (!(e instanceof Stopped) && mine === runId) growError.value = e instanceof Error ? e.message : String(e);
    return 0;
  } finally {
    growing.value = undefined;
  }
}
