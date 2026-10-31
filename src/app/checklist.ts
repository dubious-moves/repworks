// The variation checklist (PLAN.md §5.62, §5.130): a repertoire study's most important lines, made
// from the explorer's answers and kept as a `checklist` event on `t|<sid>` (the latest per side),
// so every device shows the same list; the exclusions synced as `drop` events on `c|<leafKey>`;
// each line's completion derived from the practice results at its leaf (§5.57's `practice`
// events, tagged with the preset). The walk and the list read the study's active lines only:
// a paused line is left out, and one paused since the list was made is hidden and refilled.
// Lines added by hand (§5.142) are `pick` events on the same card, shown after the made list's
// lines whatever Make again lists; Make leaves their leaves to them.
import { computed, effect, signal } from '@preact/signals';
import type { PositionKey } from '../core/chess/positionKey.ts';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { standardUci } from '../core/chess/uci.ts';
import { completedPresets, gapsOf, generateChecklist, linesOf, picksOf, PRESET_ORDER, PRESETS, RANK_RATINGS, RANK_SPEEDS, recordOf, shownLines, studyHasLine, studyMovesOf, withPicks, type ChecklistGap, type Preset, type ShownLine, type StudyMoves, type Variation } from '../core/games/checklist.ts';
import { header, type Chapter } from '../core/study/model.ts';
import { startPosition } from '../core/study/tree.ts';
import type { Color } from '../core/games/record.ts';
import { checklistCard, checklistListCard } from '../core/progress/cards.ts';
import type { ChecklistEvent, ChecklistLine, PickEvent } from '../core/progress/events.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { practiceResults } from './repertoireCheck.ts';
import { recordEvent, settings } from './state.ts';
import { syncStatus } from './sync.ts';
import { trainData, type TrainData } from './train.ts';

/** The leaves taken out of the checklists (`drop` on `c|<leafKey>`, the latest deciding). */
export const excludedLeaves = computed<Set<string>>(() => {
  const data = trainData.value;
  const out = new Set<string>();
  if (!data) return out;
  for (const card of data.states.keys()) {
    if (!card.startsWith('c|')) continue;
    let on = false;
    for (const e of data.eventsOf(card)) if (e.event?.k === 'drop') on = e.event.on;
    if (on) out.add(card.slice(2));
  }
  return out;
});

const sideOfChapter = (data: TrainData, sid: string) => (cid: string): Color | undefined => {
  const o = data.chapters.get(`${sid}/${cid}`)?.headers.find(([h]) => h === 'Orientation')?.[1];
  return o === 'white' || o === 'black' ? o : undefined;
};

/** A study's own moves for a side: every chapter's, and the active lines' only. */
const movesCache = new WeakMap<TrainData, Map<string, { all: StudyMoves; active: StudyMoves }>>();
function movesOf(data: TrainData, sid: string, color: Color): { all: StudyMoves; active: StudyMoves } {
  let byStudy = movesCache.get(data);
  if (!byStudy) movesCache.set(data, (byStudy = new Map()));
  const k = `${sid}|${color}`;
  let m = byStudy.get(k);
  if (!m) byStudy.set(k, (m = { all: studyMovesOf(data.index, sid, color, sideOfChapter(data, sid), false), active: studyMovesOf(data.index, sid, color, sideOfChapter(data, sid), true) }));
  return m;
}

/** The study's lists by side: the latest `checklist` event for each, and when it was made. */
function listsOf(data: TrainData, sid: string): Map<Color, { event: ChecklistEvent; t: number }> {
  const out = new Map<Color, { event: ChecklistEvent; t: number }>();
  for (const e of data.eventsOf(checklistListCard(sid))) if (e.event?.k === 'checklist') out.set(e.event.color, { event: e.event, t: e.t });
  return out;
}

/** The moves of the lines added to a study side's checklist by hand (§5.142), the latest last. */
function picksIn(data: TrainData, sid: string, color: Color): string[] {
  const events: PickEvent[] = [];
  for (const e of data.eventsOf(checklistListCard(sid))) if (e.event?.k === 'pick') events.push(e.event);
  return picksOf(events, color);
}

/** When each checklist was last opened for a drill in this session (mistake-lab's `_todoTouch`). */
const touched = signal<Map<string, number>>(new Map());
export function touch(sid: string, color: Color): void {
  touched.value = new Map(touched.peek()).set(`${sid}|${color}`, Date.now());
}

export interface ChecklistView {
  sid: string;
  name: string;
  color: Color;
  /** Whether the study has chapters for the other side too (each side is a checklist of its own). */
  twoSided: boolean;
  /** The list made from the explorer (Make). */
  list?: {
    made: number;
    ply: number;
    count: number;
    calls?: number;
    cut: boolean;
    gaps: ChecklistGap[];
  };
  /** The lines shown: the made list's, then those added by hand (§5.142). */
  lines: ShownLine[];
  /** The lines hidden because they are paused now. */
  paused: number;
  /** The lines added by hand, as moves from the start (paused ones too). */
  picked: Variation[];
  /** The list's lines (and reserve) taken out (✕), by leaf. */
  excluded: string[];
  /** Wins over the shown lines × three levels (lines the study no longer plays left out). */
  progress?: { done: number; total: number };
  /** The newest drill of one of its lines: a practice result at its leaf, or a drill opened here. */
  last: number;
}

/** Every repertoire study's checklist, each side of a study on its own: the most recently drilled first, then by name. */
export const checklistViews = computed<ChecklistView[]>(() => {
  const data = trainData.value;
  if (!data) return [];
  const excluded = excludedLeaves.value;
  const results = practiceResults.value;
  const sides = new Map<string, Set<Color>>();
  for (const [k, ch] of data.chapters) {
    const sid = k.split('/')[0]!;
    const set = sides.get(sid) ?? new Set<Color>();
    set.add(ch.headers.find(([h]) => h === 'Orientation')?.[1] === 'black' ? 'black' : 'white');
    sides.set(sid, set);
  }
  const out: ChecklistView[] = [];
  for (const [sid, set] of sides) {
    const lists = listsOf(data, sid);
    for (const color of (['white', 'black'] as const).filter((c) => set.has(c))) {
      const picked = linesOf(picksIn(data, sid, color).map((m) => ({ m, p: 0 })));
      const view: ChecklistView = { sid, name: data.studyNames.get(sid) ?? sid, color, twoSided: set.size > 1, excluded: [], lines: [], paused: 0, picked, last: touched.value.get(`${sid}|${color}`) ?? 0 };
      const kept = lists.get(color);
      const moves = movesOf(data, sid, color);
      let made: ReturnType<typeof shownLines> = { lines: [], paused: 0, pausedLeaves: [] };
      if (kept) {
        const e = kept.event;
        const variations = linesOf(e.lines);
        const reserve = linesOf(e.reserve);
        made = shownLines({ variations, reserve, count: e.count }, color, excluded, moves);
        view.excluded = [...new Set([...variations, ...reserve].map((x) => x.leafKey).filter((k) => excluded.has(k)))];
        view.list = { made: kept.t, ply: e.ply, count: e.count, ...(e.calls !== undefined ? { calls: e.calls } : {}), cut: e.cut === 1, gaps: gapsOf(e.gaps) };
      }
      const shown = withPicks(made, picked, color, moves);
      view.lines = shown.lines;
      view.paused = shown.paused;
      if (kept || shown.lines.length) {
        let done = 0;
        let total = 0;
        const leaves = new Set<string>();
        for (const l of shown.lines) {
          leaves.add(l.v.leafKey);
          if (l.gone) continue;
          total += PRESET_ORDER.length;
          done += completedPresets(results.filter((r) => r.key === l.v.leafKey)).size;
        }
        view.progress = { done, total };
        for (const r of results) if (r.preset && leaves.has(r.key) && r.t > view.last) view.last = r.t;
      }
      out.push(view);
    }
  }
  return out.sort((a, b) => b.last - a.last || a.name.localeCompare(b.name) || (a.color === 'white' ? -1 : 1));
});

/** The study a line ends in, by its chapter's name: the opening name when the games give none. */
export function chapterNameAt(sid: string, leafKey: PositionKey): string {
  const data = trainData.peek();
  const at = data?.index.reached.get(leafKey)?.find((o) => o.sid === sid);
  if (!data || !at) return '';
  return data.chapters.get(`${sid}/${at.cid}`)?.headers.find(([h]) => h === 'ChapterName')?.[1] ?? '';
}

type Reply = Extract<FromWorker, { type: 'practiceGames' }>;
let nextId = 500_000_000;
const waiting = new Map<number, (r: Reply) => void>();
let listening = false;
let stopping = false;
class Stopped extends Error {}
function explorerShares(fen: string): Promise<ReadonlyMap<string, number>> {
  if (stopping) return Promise.reject(new Stopped());
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
      if (stopping) return reject(new Stopped());
      const out = new Map<string, number>();
      if ('games' in r && r.games.total) {
        for (const m of r.games.moves) {
          const p = (m.white + m.draws + m.black) / r.games.total;
          out.set(m.uci, p);
          out.set(`s:${m.san.replace(/[+#]/g, '')}`, p);
        }
      }
      resolve(out);
    });
    postToWorker({ type: 'practiceGames', id, fen, speeds: RANK_SPEEDS, ratings: RANK_RATINGS } satisfies ToWorker);
  });
}

export const generating = signal<{ sid: string; color: Color; calls: number } | undefined>(undefined);

/** Makes a study side's checklist again (its exclusions kept, paused lines left out), as a `checklist` event. */
export async function makeChecklist(sid: string, color: Color, ply: number, count: number): Promise<void> {
  const data = trainData.peek();
  if (generating.peek() || !data) return;
  stopping = false;
  generating.value = { sid, color, calls: 0 };
  try {
    // The lines added by hand are on the list anyway: their slots go to the next lines (§5.142).
    const exclude = new Set([...excludedLeaves.peek(), ...linesOf(picksIn(data, sid, color).map((m) => ({ m, p: 0 }))).map((v) => v.leafKey)]);
    const list = await generateChecklist(color, movesOf(data, sid, color).active, explorerShares, { targetPly: ply, maxVariations: count, exclude }, (calls) => (generating.value = { sid, color, calls }));
    await recordEvent({ t: new Date().toISOString(), k: 'checklist', card: checklistListCard(sid), color, ply, count, ...recordOf(list), calls: list.calls, ...(list.truncated ? { cut: 1 as const } : {}) });
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
  } finally {
    stopping = false;
    generating.value = undefined;
  }
}

/** Stops a Make under way at its next lookup: nothing is kept. */
export function stopChecklist(): void {
  if (generating.peek()) stopping = true;
}

/** Takes a line out (synced): the next line of the reserve takes its place. */
export function excludeLine(v: Variation): void {
  void recordEvent({ t: new Date().toISOString(), k: 'drop', card: checklistCard(v.leafKey), on: true });
}

/** The lines taken out come back (`clearTodoExclusions`): these, or every one. A kept list shows them again at once. */
export function restoreExcluded(keys: readonly string[] = [...excludedLeaves.peek()]): void {
  for (const k of keys) void recordEvent({ t: new Date().toISOString(), k: 'drop', card: checklistCard(k as PositionKey), on: false });
}

/* ------------------------------------------------------------------ lines added by hand (§5.142) */

/**
 * A chapter's line through `path` as UCI moves from the start, with the chapter's side: undefined
 * for a chapter that doesn't start from the starting position (a checklist's lines are played from
 * move 1), or a move that can't be read.
 */
export function chapterLine(chapter: Chapter, path: readonly string[]): { color: Color; uci: string[] } | undefined {
  const pos = startPosition(chapter);
  if (!pos || !path.length || positionKeyOf(pos) !== positionKeyOf(Chess.default())) return undefined;
  const uci: string[] = [];
  for (const san of path) {
    const move = parseSan(pos, san);
    if (!move || !isNormal(move)) return undefined;
    uci.push(standardUci(pos, move));
    pos.play(move);
  }
  return { color: header(chapter, 'Orientation') === 'black' ? 'black' : 'white', uci };
}

/** Whether a line is on a study side's checklist as one added by hand. */
export function isPicked(sid: string, color: Color, lineUci: readonly string[]): boolean {
  const data = trainData.value;
  return !!data && picksIn(data, sid, color).includes(lineUci.join(' '));
}

/**
 * Adds a line to a study side's checklist (synced), to stay whatever Make again lists, or takes it
 * off; says which, or why it can't be added (the study must play it to its end).
 */
export async function pickLine(sid: string, color: Color, lineUci: readonly string[], on: boolean): Promise<string> {
  const data = trainData.peek();
  if (!data || !lineUci.length) return 'The repertoire isn’t read yet';
  if (on && !studyHasLine(movesOf(data, sid, color).all, color, lineUci)) return 'The study doesn’t play this line (synced and read yet?)';
  await recordEvent({ t: new Date().toISOString(), k: 'pick', card: checklistListCard(sid), color, m: lineUci.join(' '), on });
  return on ? 'Added to the checklist: it stays when the list is made again' : 'Taken out of the checklist';
}

/** ✕ on a line added by hand: every pick reaching its position comes off, and where the made list has it too, it is taken out of that as well. */
export function unpickLine(view: ChecklistView, line: ShownLine): void {
  for (const v of view.picked) if (v.leafKey === line.v.leafKey) void pickLine(view.sid, view.color, v.lineUci, false);
  if (line.added === 'too') excludeLine(line.v);
}

/* ------------------------------------------------------------------ Maia's rating per level */

const MAIA_KEY = 'repworks-checklist-maia';
export const MAIA_MIN = 1100;
export const MAIA_MAX = 2600;
function loadMaia(): Record<Preset, number> {
  const out = Object.fromEntries(PRESET_ORDER.map((p) => [p, PRESETS[p].maiaElo])) as Record<Preset, number>;
  try {
    const saved = JSON.parse(localStorage.getItem(MAIA_KEY) ?? '{}') as Record<string, unknown>;
    for (const p of PRESET_ORDER) {
      const v = saved[p];
      if (typeof v === 'number' && Number.isFinite(v)) out[p] = clampMaia(v);
    }
  } catch {
    // the defaults
  }
  return out;
}
const clampMaia = (v: number) => Math.max(MAIA_MIN, Math.min(MAIA_MAX, Math.round(v / 25) * 25));
/** Maia's rating for each level's opponent (mistake-lab's `repTodoMaiaElo`), kept on this device. */
export const checklistMaia = signal<Record<Preset, number>>(loadMaia());
export function setChecklistMaia(p: Preset, value: number): void {
  if (!Number.isFinite(value)) return;
  checklistMaia.value = { ...checklistMaia.peek(), [p]: clampMaia(value) };
  try {
    localStorage.setItem(MAIA_KEY, JSON.stringify(checklistMaia.peek()));
  } catch {
    // this page only
  }
}

/* ------------------------------------------------------------------ lists kept on a device before §5.130 */

const OLD_KEY = 'repworks-checklists';
interface OldList {
  sid: string;
  color: Color;
  targetPly: number;
  maxVariations: number;
  variations: Variation[];
  reserve: Variation[];
  gaps: ChecklistGap[];
  calls?: number;
  truncated?: boolean;
}
const pageStart = Date.now();
let carried = false;
/**
 * A list kept on this device before lists were synced (`repworks-checklists`) is written into the
 * log once, unless that study's side already has one; then the key goes. It waits for this page's
 * first sync (or a device with no repo), so a list made since on another device isn't overtaken.
 */
export function carryOverLocalLists(): void {
  effect(() => {
    const data = trainData.value;
    const s = syncStatus.value;
    if (carried || !data) return;
    if (settings.value && !(s.lastSynced !== undefined && s.lastSynced >= pageStart)) return;
    carried = true;
    let old: Record<string, OldList>;
    try {
      old = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as Record<string, OldList>;
    } catch {
      return;
    }
    if (!old || typeof old !== 'object') return;
    const line = (v: Variation): ChecklistLine => ({ m: v.lineUci.join(' '), p: v.cumProb });
    for (const l of Object.values(old)) {
      if (!l?.sid || !data.studyNames.has(l.sid) || (l.color !== 'white' && l.color !== 'black') || !Array.isArray(l.variations) || listsOf(data, l.sid).has(l.color)) continue;
      void recordEvent({
        t: new Date().toISOString(),
        k: 'checklist',
        card: checklistListCard(l.sid),
        color: l.color,
        ply: Number.isSafeInteger(l.targetPly) && l.targetPly >= 0 ? l.targetPly : 10,
        count: Number.isSafeInteger(l.maxVariations) && l.maxVariations >= 1 ? l.maxVariations : Math.max(1, l.variations.length),
        lines: l.variations.map(line),
        reserve: (l.reserve ?? []).map(line),
        gaps: (l.gaps ?? []).map((g) => ({ m: g.lineUci.join(' '), p: g.reachProb })),
        ...(Number.isSafeInteger(l.calls) ? { calls: l.calls! } : {}),
        ...(l.truncated ? { cut: 1 as const } : {}),
      });
    }
    try {
      localStorage.removeItem(OLD_KEY);
    } catch {
      // kept; the lists are in the log now, and carried only where a side has none
    }
  });
}
