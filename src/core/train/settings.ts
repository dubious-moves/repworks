// The training settings every device must share (PLAN.md §5.2), in the data repo's
// `settings.json`: the retention changes replayed card states, and the daily limit of new moves
// is drawn from by both devices. Per-device preferences (pace, speech, keys) stay on the device.
//   { "format": 1, "train": { "newPerDay": 20, "retention": 0.9, "learnStepHours": 4 } }
// A field missing means its default. Fields this code doesn't know are kept as they are, so an
// older build never drops a newer one's settings. Merged per field, ours on a clash (§4.7).
import type { Parsed } from '../study/studyMeta.ts';

export const SETTINGS_FILE = 'settings.json';

export interface TrainSettings {
  /** New moves taught a day, from every device (§5.3). */
  newPerDay: number;
  /** FSRS's target recall (§4.8): 0.9, as the owner chose (§5.13). */
  retention: number;
  /** How long after a move is taught its first review comes due (§5.2). */
  learnStepHours: number;
}

export const DEFAULT_TRAIN: TrainSettings = { newPerDay: 20, retention: 0.9, learnStepHours: 4 };

const RULES: { [K in keyof TrainSettings]: { ok: (v: number) => boolean; says: string } } = {
  newPerDay: { ok: (v) => Number.isInteger(v) && v >= 0 && v <= 1000, says: 'a whole number from 0 to 1000' },
  retention: { ok: (v) => v >= 0.7 && v <= 0.99, says: 'a number from 0.7 to 0.99' },
  learnStepHours: { ok: (v) => v >= 0 && v <= 48, says: 'a number of hours from 0 to 48' },
};
const KNOWN = Object.keys(RULES) as (keyof TrainSettings)[];

/** The file as read: the settings, and every field as written (unknown ones included). */
export interface SettingsFile {
  train: TrainSettings;
  /** The `train` object as written, field by field, in order. */
  fields: [string, unknown][];
  /** Top-level keys other than `format` and `train`, kept as they are. */
  rest: [string, unknown][];
}

export function parseSettings(text: string): Parsed<SettingsFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`not JSON: ${String(error)}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['not a JSON object'] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (o['format'] !== 1) errors.push(`format must be 1, found ${JSON.stringify(o['format'])}`);
  const t = o['train'] ?? {};
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return { ok: false, errors: [...errors, 'train must be an object'] };
  const train = { ...DEFAULT_TRAIN };
  for (const key of KNOWN) {
    const v = (t as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !RULES[key].ok(v)) errors.push(`train.${key} must be ${RULES[key].says}, found ${JSON.stringify(v)}`);
    else train[key] = v;
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { train, fields: Object.entries(t), rest: Object.entries(o).filter(([k]) => k !== 'format' && k !== 'train') },
  };
}

/** The file's text: `format`, then `train` field by field, then anything else, two-space JSON. */
export function writeSettings(file: SettingsFile): string {
  return `${JSON.stringify({ format: 1, train: Object.fromEntries(file.fields), ...Object.fromEntries(file.rest) }, null, 2)}\n`;
}

/** The settings with one known field set, the others kept. */
export function withTrain(file: SettingsFile | undefined, key: keyof TrainSettings, value: number): SettingsFile {
  const fields = [...(file?.fields ?? [])];
  const at = fields.findIndex(([k]) => k === key);
  if (at >= 0) fields[at] = [key, value];
  else fields.push([key, value]);
  return { train: { ...(file?.train ?? DEFAULT_TRAIN), [key]: value }, fields, rest: file?.rest ?? [] };
}

/** The training settings of a data repo's files: the defaults when the file is missing or bad. */
export function trainSettings(text: string | undefined): TrainSettings {
  if (text === undefined) return { ...DEFAULT_TRAIN };
  const parsed = parseSettings(text);
  return parsed.ok ? parsed.value.train : { ...DEFAULT_TRAIN };
}

/**
 * Three-way, per field (in `train`, and at the top level): a field changed on one side takes that
 * side's value, changed on both takes ours. Undefined when a side won't parse: the caller keeps
 * theirs, never rewriting a file it can't read.
 */
export function mergeSettings(base: string | undefined, ours: string, theirs: string): string | undefined {
  const [o, t] = [parseSettings(ours), parseSettings(theirs)];
  if (!o.ok || !t.ok) return undefined;
  const b = base === undefined ? undefined : parseSettings(base);
  const bv = b?.ok ? b.value : { fields: [], rest: [] };
  const merge = (bs: [string, unknown][], os: [string, unknown][], ts: [string, unknown][]): [string, unknown][] => {
    const [bm, om, tm] = [new Map(bs), new Map(os), new Map(ts)];
    const keys = [...new Set([...os.map(([k]) => k), ...ts.map(([k]) => k)])];
    const out: [string, unknown][] = [];
    for (const k of keys) {
      const [x, y, z] = [JSON.stringify(bm.get(k)), JSON.stringify(om.get(k)), JSON.stringify(tm.get(k))];
      // Ours changed it (or both agree): ours, even a deletion; else theirs.
      const fromOurs = y === z || y !== x;
      const v = fromOurs ? om.get(k) : tm.get(k);
      if ((fromOurs ? om : tm).has(k)) out.push([k, v]);
    }
    return out;
  };
  const fields = merge(bv.fields, o.value.fields, t.value.fields);
  const merged = parseSettings(writeSettings({ train: DEFAULT_TRAIN, fields, rest: merge(bv.rest, o.value.rest, t.value.rest) }));
  return merged.ok ? writeSettings(merged.value) : ours;
}
