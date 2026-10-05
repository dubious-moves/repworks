// Checks a data repo's files against format 1 (PLAN.md §4.4). scripts/validate-data.ts runs it
// on a checkout before a Claude session pushes; the app runs the same checks on what it pulls.
// Errors are what the app would refuse or lose; warnings are what it works around.
import { parseStudyMeta } from '../study/studyMeta.ts';
import { parseLog } from '../progress/events.ts';
import { classifyPath, DATA_FORMAT, FORMAT_FILE, utcDay, utcMonth } from './layout.ts';

export interface Issue {
  path: string;
  line?: number;
  message: string;
}

export interface ValidationReport {
  errors: Issue[];
  warnings: Issue[];
}

export interface ValidateOptions {
  /** Problems with one chapter file's PGN; §4.5's parser supplies it. */
  checkChapter?: (text: string) => { errors: string[]; warnings: string[] };
}

const ROOT_FILES_ALLOWED = new Set(['README.md', '.gitattributes', '.gitignore']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function validateDataRepo(files: ReadonlyMap<string, string>, options: ValidateOptions = {}): ValidationReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const error = (path: string, message: string, line?: number) => errors.push(line === undefined ? { path, message } : { path, line, message });
  const warn = (path: string, message: string, line?: number) => warnings.push(line === undefined ? { path, message } : { path, line, message });

  const format = files.get(FORMAT_FILE);
  if (format === undefined) error(FORMAT_FILE, 'missing: every data repo starts with { "format": 1 }');
  else {
    try {
      const value = (JSON.parse(format) as { format?: unknown }).format;
      if (value !== DATA_FORMAT) error(FORMAT_FILE, `format ${JSON.stringify(value)}: this code reads format ${DATA_FORMAT}`);
    } catch {
      error(FORMAT_FILE, 'not JSON');
    }
  }

  const studies = new Map<string, { listed: string[] | null; chapters: Set<string> }>();
  const study = (sid: string) => {
    let s = studies.get(sid);
    if (!s) studies.set(sid, (s = { listed: null, chapters: new Set() }));
    return s;
  };
  const deviceFiles = new Set<string>();
  const progressByDevice = new Map<string, { path: string; lines: ReturnType<typeof parseLog>['lines'] }[]>();
  const monthsCompacted = new Map<string, Set<string>>();

  for (const [path, text] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const where = classifyPath(path);
    switch (where.kind) {
      case 'format':
        break;
      case 'study': {
        const parsed = parseStudyMeta(text, where.sid);
        if (!parsed.ok) for (const message of parsed.errors) error(path, message);
        else study(where.sid).listed = parsed.value.chapters;
        if (!parsed.ok) study(where.sid);
        break;
      }
      case 'chapter': {
        study(where.sid).chapters.add(where.cid);
        if (text.trim() === '') error(path, 'empty chapter file');
        else if (options.checkChapter) {
          const result = options.checkChapter(text);
          for (const message of result.errors) error(path, message);
          for (const message of result.warnings) warn(path, message);
        }
        break;
      }
      case 'conflict-copy':
        warn(path, `a copy of chapter ${where.cid} kept from device ${where.dev} when it couldn't be merged: resolve it, then delete it`);
        break;
      case 'progress-day':
      case 'progress-month': {
        const { lines, problems } = parseLog(text);
        for (const p of problems) warn(path, `${p.reason}: ${p.text}`, p.line);
        const span = where.kind === 'progress-day' ? where.day : where.month;
        const outside = lines.filter((l) => (where.kind === 'progress-day' ? utcDay(l.t) : utcMonth(l.t)) !== span);
        if (outside.length) warn(path, `${outside.length} event(s) dated outside ${span}`);
        if (where.kind === 'progress-month') {
          let months = monthsCompacted.get(where.dev);
          if (!months) monthsCompacted.set(where.dev, (months = new Set()));
          months.add(where.month);
        }
        let list = progressByDevice.get(where.dev);
        if (!list) progressByDevice.set(where.dev, (list = []));
        list.push({ path, lines });
        break;
      }
      case 'device': {
        deviceFiles.add(where.dev);
        try {
          const d = JSON.parse(text) as { name?: unknown; created?: unknown };
          if (typeof d.name !== 'string' || d.name.trim() === '') error(path, 'name must be a non-empty string');
          if (typeof d.created !== 'string' || !ISO.test(d.created)) error(path, 'created must be a UTC time');
        } catch {
          error(path, 'not JSON');
        }
        break;
      }
      case 'other':
        if (!ROOT_FILES_ALLOWED.has(path)) warn(path, 'not part of format 1: the app ignores it');
        break;
    }
  }

  for (const [sid, s] of studies) {
    const metaPath = `studies/${sid}/study.json`;
    if (!files.has(metaPath)) {
      error(metaPath, `missing, but the folder holds ${s.chapters.size} chapter file(s)`);
      continue;
    }
    if (s.listed === null) continue;
    for (const cid of s.listed) if (!s.chapters.has(cid)) error(metaPath, `lists chapter ${cid}, which has no file`);
    for (const cid of s.chapters) if (!s.listed.includes(cid)) warn(`studies/${sid}/${cid}.pgn`, "not in study.json's chapter list: it is shown after the listed ones");
  }

  for (const [dev, list] of progressByDevice) {
    if (!deviceFiles.has(dev)) warn(`devices/${dev}.json`, `missing for a device that has progress files`);
    const seen = new Map<number, { raw: string; path: string }>();
    for (const { path, lines } of list) {
      for (const line of lines) {
        const before = seen.get(line.n);
        if (before && before.raw !== line.raw) warn(path, `n ${line.n} also appears, different, in ${before.path}`);
        else if (!before) seen.set(line.n, { raw: line.raw, path });
      }
      const day = classifyPath(path);
      if (day.kind === 'progress-day' && monthsCompacted.get(dev)?.has(day.day.slice(0, 7))) {
        warn(path, 'a day file left beside its compacted month');
      }
    }
  }
  return { errors, warnings };
}
