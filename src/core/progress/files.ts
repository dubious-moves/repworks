// Progress files (PLAN.md §4.4, §4.8): a device's events by UTC day, a closed month compacted
// into one file by the device that owns it, and every device's files read back for replay.
import { classifyPath, progressDayPath, progressMonthPath, utcDay } from '../data/layout.ts';
import { formatEvent, parseLog, writeLog, type KnownEvent, type LineProblem, type LogLine } from './events.ts';
import { toDeviceEvents, type DeviceEvent } from './replay.ts';

/** A device's own events as day files: path → text, lines in n order. */
export function dayFiles(device: string, events: readonly KnownEvent[]): Map<string, string> {
  const byDay = new Map<string, KnownEvent[]>();
  for (const e of events) {
    const day = utcDay(e.t);
    let list = byDay.get(day);
    if (!list) byDay.set(day, (list = []));
    list.push(e);
  }
  const files = new Map<string, string>();
  for (const [day, list] of [...byDay].sort(([a], [b]) => (a < b ? -1 : 1))) {
    files.set(progressDayPath(device, day), writeLog([...list].sort((a, b) => a.n - b.n).map((e) => ({ raw: formatEvent(e) }))));
  }
  return files;
}

/**
 * The lines of several progress files of one device as one file: each n once (the first text
 * seen for it), in n order, every line byte for byte, kinds this code doesn't know included.
 */
export function unionLogs(texts: readonly string[]): { text: string; lines: LogLine[]; problems: LineProblem[] } {
  const byN = new Map<number, LogLine>();
  const problems: LineProblem[] = [];
  for (const text of texts) {
    const parsed = parseLog(text);
    problems.push(...parsed.problems);
    for (const line of parsed.lines) if (!byN.has(line.n)) byN.set(line.n, line);
  }
  const lines = [...byN.values()].sort((a, b) => a.n - b.n);
  return { text: writeLog(lines), lines, problems };
}

export interface Compaction {
  /** The month file to write. */
  path: string;
  text: string;
  /** The day files it replaces, to delete in the same commit. */
  remove: string[];
}

/**
 * Compaction of a device's closed months: every month before `currentMonth` (YYYY-MM, from the
 * device's clock) that still has day files gets one month file, holding the day files' lines
 * and any month file already there. Only call it once those days are synced.
 */
export function compactions(device: string, files: ReadonlyMap<string, string>, currentMonth: string): Compaction[] {
  const days = new Map<string, string[]>();
  for (const path of files.keys()) {
    const where = classifyPath(path);
    if (where.kind !== 'progress-day' || where.dev !== device) continue;
    const month = where.day.slice(0, 7);
    if (month >= currentMonth) continue;
    let list = days.get(month);
    if (!list) days.set(month, (list = []));
    list.push(path);
  }
  return [...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, paths]) => {
    const path = progressMonthPath(device, month);
    const existing = files.get(path);
    const sources = [...(existing !== undefined ? [existing] : []), ...paths.sort().map((p) => files.get(p)!)];
    return { path, text: unionLogs(sources).text, remove: paths };
  });
}

/** Every device's events from the data repo's progress files, for replay. Bad lines are reported. */
export function readProgress(files: ReadonlyMap<string, string>): { events: DeviceEvent[]; problems: (LineProblem & { path: string })[] } {
  const events: DeviceEvent[] = [];
  const problems: (LineProblem & { path: string })[] = [];
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind !== 'progress-day' && where.kind !== 'progress-month') continue;
    const parsed = parseLog(text);
    for (const p of parsed.problems) problems.push({ ...p, path });
    events.push(...toDeviceEvents(where.dev, parsed.lines));
  }
  return { events, problems };
}
