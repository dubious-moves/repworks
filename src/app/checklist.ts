// The variation checklist (PLAN.md §5.62): a repertoire study's most important lines, made on this
// device from the explorer's answers (kept here, made again at will: mistake-lab's lists are
// regenerable definitions too), the exclusions synced as `drop` events on `c|<leafKey>`, and each
// line's completion derived from the practice results at its leaf (§5.57's `practice` events,
// tagged with the preset).
import { computed, signal } from '@preact/signals';
import type { PositionKey } from '../core/chess/positionKey.ts';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import { excludeVariation, generateChecklist, RANK_RATINGS, RANK_SPEEDS, type Checklist, type StudyMoves, type Variation } from '../core/games/checklist.ts';
import type { Color } from '../core/games/record.ts';
import { checklistCard } from '../core/progress/cards.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { recordEvent } from './state.ts';
import { trainData } from './train.ts';

export interface StoredList extends Checklist {
  sid: string;
  color: Color;
  targetPly: number;
  maxVariations: number;
  createdAt: number;
}

const KEY = 'repworks-checklists';
function load(): Record<string, StoredList> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, StoredList>;
  } catch {
    return {};
  }
}
export const checklists = signal<Record<string, StoredList>>(load());
function save(next: Record<string, StoredList>): void {
  checklists.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // this page only
  }
}

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

/** The repertoire studies, with the side most of their chapters play. */
export const checklistStudies = computed(() => {
  const data = trainData.value;
  if (!data) return [];
  const sides = new Map<string, { white: number; black: number }>();
  for (const [k, ch] of data.chapters) {
    const sid = k.split('/')[0]!;
    const s = sides.get(sid) ?? { white: 0, black: 0 };
    s[ch.headers.find(([h]) => h === 'Orientation')?.[1] === 'black' ? 'black' : 'white']++;
    sides.set(sid, s);
  }
  return [...sides].map(([sid, s]) => ({ sid, name: data.studyNames.get(sid) ?? sid, color: (s.black > s.white ? 'black' : 'white') as Color })).sort((a, b) => a.name.localeCompare(b.name));
});

/** A study's own moves (its chapters' moves for its side), as the checklist's walk reads them. */
function studyMoves(sid: string): StudyMoves {
  const index = trainData.peek()!.index;
  const ofStudy = (key: PositionKey) => [...(index.positions.get(key)?.own ?? [])].filter(([, places]) => places.some((p) => p.sid === sid));
  return { moveAt: (key) => ofStudy(key)[0]?.[0], covers: (key) => ofStudy(key).length > 0 };
}

type Reply = Extract<FromWorker, { type: 'practiceGames' }>;
let nextId = 500_000_000;
const waiting = new Map<number, (r: Reply) => void>();
let listening = false;
function explorerShares(fen: string): Promise<ReadonlyMap<string, number>> {
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
  return new Promise((resolve) => {
    waiting.set(id, (r) => {
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

export const generating = signal<{ sid: string; calls: number } | undefined>(undefined);

/** Makes a study's checklist again (its exclusions kept), and keeps it on this device. */
export async function makeChecklist(sid: string, color: Color, targetPly: number, maxVariations: number): Promise<void> {
  if (generating.peek()) return;
  generating.value = { sid, calls: 0 };
  try {
    const list = await generateChecklist(color, studyMoves(sid), explorerShares, { targetPly, maxVariations, exclude: excludedLeaves.peek() }, (calls) => (generating.value = { sid, calls }));
    save({ ...checklists.peek(), [sid]: { ...list, sid, color, targetPly, maxVariations, createdAt: Date.now() } });
  } finally {
    generating.value = undefined;
  }
}

/** Takes a line out (synced), its place filled from the reserve. */
export function excludeLine(sid: string, v: Variation): void {
  const list = checklists.peek()[sid];
  if (!list) return;
  void recordEvent({ t: new Date().toISOString(), k: 'drop', card: checklistCard(v.leafKey), on: true });
  save({ ...checklists.peek(), [sid]: { ...list, variations: excludeVariation(list, v.leafKey, new Set([...excludedLeaves.peek(), v.leafKey])) } });
}

/** Every line taken out comes back at the next Make (`clearTodoExclusions`). */
export function restoreExcluded(): void {
  for (const k of excludedLeaves.peek()) void recordEvent({ t: new Date().toISOString(), k: 'drop', card: checklistCard(k as PositionKey), on: false });
}
