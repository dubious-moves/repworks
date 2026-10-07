// Pausing lines and marking them must-learn (PLAN.md §5.70): `line` events on the line's card,
// recorded at once and synced with the next push. The training data marks the index from them.
import type { LineMark } from '../core/progress/events.ts';
import { lineCard } from '../core/progress/cards.ts';
import type { Line } from '../core/repertoire/index.ts';
import { recordEvents } from './state.ts';

/** The mark a line carries now. */
export const markOf = (line: Line): LineMark => (line.paused ? 'paused' : line.must ? 'must' : 'none');

/** Sets each line's mark, recording only the lines whose mark changes. */
export async function setMarks(changes: readonly { line: Line; mark: LineMark }[]): Promise<number> {
  const t = new Date().toISOString();
  const events = changes.filter((c) => markOf(c.line) !== c.mark).map((c) => ({ t, k: 'line' as const, card: lineCard(c.line.sid, c.line.cid, c.line.path), mark: c.mark }));
  await recordEvents(events);
  return events.length;
}

export const setMark = (line: Line, mark: LineMark) => setMarks([{ line, mark }]);
