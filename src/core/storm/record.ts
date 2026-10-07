// The storm's record (PLAN.md §5.41, §5.46; DESIGN-intuition-storm.md §15, §16.4, §21), replayed
// from the progress log's `storm` events on every device. Pure.
// - Positions (`s|`) and puzzles (`z|`) are kept apart: one is graded, the other answered, and a
//   share made of both would answer two questions at once (DESIGN-storm-puzzles.md §7).
// - `unknown` is out of both halves of every fraction: it isn't the user's doing.
// - "Found" is the two bands that score (great, good); an inaccuracy is not a move found.
// - The average loss is in points of win%, over the graded answers that carry one.
// - A set's answers (`m: "set"`) are counted, and counted apart, since they had no clock (§21).
import type { DeviceEvent } from '../progress/replay.ts';
import type { StormBand } from '../progress/events.ts';

export interface RecordRow {
  answered: number;
  /** Graded answers (unknown left out). */
  graded: number;
  found: number;
  bands: Record<StormBand, number>;
  /** Sum of the win% lost, in tenths, and how many answers carried one. */
  wpTenths: number;
  wpCount: number;
  /** Answers of a set (no clock). */
  set: number;
}

export interface StormRecord {
  positions: RecordRow;
  puzzles: RecordRow;
  /** By chapter (`<sid>/<cid>`), positions and puzzles apart. */
  chapters: Map<string, { positions: RecordRow; puzzles: RecordRow }>;
}

export const blankRow = (): RecordRow => ({ answered: 0, graded: 0, found: 0, bands: { great: 0, good: 0, ok: 0, bad: 0, blunder: 0, unknown: 0 }, wpTenths: 0, wpCount: 0, set: 0 });

function add(row: RecordRow, b: StormBand, wp: number | undefined, set: boolean): void {
  row.answered++;
  row.bands[b]++;
  if (set) row.set++;
  if (b === 'unknown') return;
  row.graded++;
  if (b === 'great' || b === 'good') row.found++;
  if (typeof wp === 'number') {
    row.wpTenths += wp;
    row.wpCount++;
  }
}

/** The record over every storm event, optionally only answers since `since` (ms). */
export function stormRecord(events: Iterable<DeviceEvent>, since = 0): StormRecord {
  const rec: StormRecord = { positions: blankRow(), puzzles: blankRow(), chapters: new Map() };
  for (const { event, t } of events) {
    if (event?.k !== 'storm' || t < since) continue;
    const puzzle = event.card.startsWith('z|');
    const set = event.m === 'set';
    add(puzzle ? rec.puzzles : rec.positions, event.b, event.wp, set);
    if (event.c) {
      let ch = rec.chapters.get(event.c);
      if (!ch) rec.chapters.set(event.c, (ch = { positions: blankRow(), puzzles: blankRow() }));
      add(puzzle ? ch.puzzles : ch.positions, event.b, event.wp, set);
    }
  }
  return rec;
}

/** The share found, 0–100, or null with nothing graded. */
export const foundShare = (r: RecordRow): number | null => (r.graded ? (100 * r.found) / r.graded : null);

/** The average win% lost, or null with nothing measured. */
export const averageWp = (r: RecordRow): number | null => (r.wpCount ? r.wpTenths / 10 / r.wpCount : null);

/** Rows added up. */
export function sumRows(rows: Iterable<RecordRow>): RecordRow {
  const out = blankRow();
  for (const r of rows) {
    out.answered += r.answered;
    out.graded += r.graded;
    out.found += r.found;
    out.wpTenths += r.wpTenths;
    out.wpCount += r.wpCount;
    out.set += r.set;
    for (const b of Object.keys(out.bands) as StormBand[]) out.bands[b] += r.bands[b];
  }
  return out;
}

/**
 * The record of a study or a chapter (the storm page's scope): the chapters `keep` takes, by their
 * `<sid>/<cid>`, added up. Answers that name no chapter count in the whole record only.
 */
export function recordOver(rec: StormRecord, keep: (chapter: string) => boolean): { positions: RecordRow; puzzles: RecordRow } {
  const kept = [...rec.chapters].filter(([k]) => keep(k)).map(([, v]) => v);
  return { positions: sumRows(kept.map((v) => v.positions)), puzzles: sumRows(kept.map((v) => v.puzzles)) };
}
