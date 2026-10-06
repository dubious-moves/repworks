// The data repo's files (PLAN.md §4.4, format 1):
//
//   repworks.json                      { "format": 1 }
//   studies/<sid>/study.json           name, kind, chapter order, source
//   studies/<sid>/<cid>.pgn            exactly one game: one chapter
//   studies/<sid>/<cid>.conflict-<dev>.pgn   a copy kept when a file couldn't be merged (§4.7)
//   progress/<dev>/<YYYY-MM-DD>.jsonl  events of that UTC day, written only by <dev>
//   progress/<dev>/<YYYY-MM>.jsonl     a closed month, compacted by <dev>
//   devices/<dev>.json                 { "name", "created" }, written once by <dev>
import { isId } from '../study/ids.ts';

export const FORMAT_FILE = 'repworks.json';
export const DATA_FORMAT = 1;

export const studyMetaPath = (sid: string) => `studies/${sid}/study.json`;
export const chapterPath = (sid: string, cid: string) => `studies/${sid}/${cid}.pgn`;
export const conflictCopyPath = (sid: string, cid: string, dev: string) => `studies/${sid}/${cid}.conflict-${dev}.pgn`;
export const progressDayPath = (dev: string, day: string) => `progress/${dev}/${day}.jsonl`;
export const progressMonthPath = (dev: string, month: string) => `progress/${dev}/${month}.jsonl`;
export const devicePath = (dev: string) => `devices/${dev}.json`;

export type DataPath =
  | { kind: 'format' }
  | { kind: 'settings' }
  | { kind: 'study'; sid: string }
  | { kind: 'chapter'; sid: string; cid: string }
  | { kind: 'conflict-copy'; sid: string; cid: string; dev: string }
  | { kind: 'progress-day'; dev: string; day: string }
  | { kind: 'progress-month'; dev: string; month: string }
  | { kind: 'device'; dev: string }
  | { kind: 'other' };

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function classifyPath(path: string): DataPath {
  if (path === FORMAT_FILE) return { kind: 'format' };
  if (path === 'settings.json') return { kind: 'settings' };
  const parts = path.split('/');
  const [top, a, b] = parts;
  if (parts.length === 3 && top === 'studies' && isId(a) && b !== undefined) {
    if (b === 'study.json') return { kind: 'study', sid: a };
    const chapter = /^([A-Za-z0-9]{8})\.pgn$/.exec(b);
    if (chapter) return { kind: 'chapter', sid: a, cid: chapter[1]! };
    const copy = /^([A-Za-z0-9]{8})\.conflict-([A-Za-z0-9]{8})\.pgn$/.exec(b);
    if (copy) return { kind: 'conflict-copy', sid: a, cid: copy[1]!, dev: copy[2]! };
  }
  if (parts.length === 3 && top === 'progress' && isId(a) && b !== undefined && b.endsWith('.jsonl')) {
    const stem = b.slice(0, -'.jsonl'.length);
    if (DAY.test(stem)) return { kind: 'progress-day', dev: a, day: stem };
    if (MONTH.test(stem)) return { kind: 'progress-month', dev: a, month: stem };
  }
  if (parts.length === 2 && top === 'devices' && a !== undefined) {
    const dev = /^([A-Za-z0-9]{8})\.json$/.exec(a);
    if (dev) return { kind: 'device', dev: dev[1]! };
  }
  return { kind: 'other' };
}

/** The UTC day of an ISO time, YYYY-MM-DD. */
export const utcDay = (iso: string) => iso.slice(0, 10);
export const utcMonth = (iso: string) => iso.slice(0, 7);
