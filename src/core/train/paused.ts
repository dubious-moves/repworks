// Paused and must-learn lines (PLAN.md §5.70). A line's mark is a `line` event on the line's
// card (`l|<sid>|<cid>|<moves>`), the last one in replay's order deciding, from every device. A
// mark covers every line of its chapter whose moves start with the mark's, so a line extended
// after it was paused stays paused; where several marks cover a line, the longest (the most
// particular) decides. A mark covering no line is kept and counted, as an orphaned card is.
// A card is held back only when every line it lies on is paused, so a move shared with an active
// line (a common start, a transposition, another study) is still trained.
import { parseLineCard, type CardId } from '../progress/cards.ts';
import type { LineMark } from '../progress/events.ts';
import type { DeviceEvent } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';

export type Mark = 'paused' | 'must';

/**
 * The last mark of every line card, from a replay's events per card: `none` is kept too, since a
 * line unpaused under a shorter paused mark is decided by its own `none`.
 */
export function lineMarksOf(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): Map<string, LineMark> {
  const out = new Map<string, LineMark>();
  for (const card of cards) {
    if (!card.startsWith('l|')) continue;
    let mark: LineMark | undefined;
    for (const { event } of eventsOf(card)) if (event?.k === 'line') mark = event.mark;
    if (mark) out.set(card, mark);
  }
  return out;
}

interface ChapterMark {
  path: string[];
  card: string;
  mark: LineMark;
}

/** The mark that decides a line: the longest of its chapter's marks that it extends. */
function decide(marks: readonly ChapterMark[] | undefined, line: Line): ChapterMark | undefined {
  let best: ChapterMark | undefined;
  for (const m of marks ?? []) {
    if (m.path.length > line.path.length || (best && m.path.length <= best.path.length)) continue;
    if (m.path.every((san, i) => san === line.path[i])) best = m;
  }
  return best;
}

/**
 * The index with each line's mark set (`paused`, `must`): new line objects where a mark applies,
 * the parts' own lines untouched. `orphans`: marks in force (not `none`) that cover no line.
 */
export function markLines(index: RepertoireIndex, marks: ReadonlyMap<string, LineMark>): { index: RepertoireIndex; orphans: string[] } {
  const byChapter = new Map<string, ChapterMark[]>();
  for (const [card, mark] of marks) {
    const parsed = parseLineCard(card);
    if (!parsed) continue;
    const key = `${parsed.sid}/${parsed.cid}`;
    const list = byChapter.get(key) ?? [];
    list.push({ path: parsed.path, card, mark });
    byChapter.set(key, list);
  }
  if (byChapter.size === 0) return { index, orphans: [] };
  const used = new Set<string>();
  const lines = index.lines.map((line) => {
    const m = decide(byChapter.get(`${line.sid}/${line.cid}`), line);
    if (!m) return line;
    used.add(m.card);
    if (m.mark === 'none') return line;
    const { paused: _p, must: _m, ...plain } = line;
    return m.mark === 'paused' ? { ...plain, paused: true as const } : { ...plain, must: true as const };
  });
  const orphans = [...marks].filter(([card, mark]) => mark !== 'none' && !used.has(card)).map(([card]) => card).sort();
  return { index: { ...index, lines }, orphans };
}

/** Cards every line of which is paused: left out of learning and review. */
export function heldCards(index: RepertoireIndex): Set<CardId> {
  const active = new Set<CardId>();
  const paused = new Set<CardId>();
  for (const line of index.lines) for (const card of line.cards) (line.paused ? paused : active).add(card);
  for (const card of active) paused.delete(card);
  return paused;
}
