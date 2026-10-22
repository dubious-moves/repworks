// The pace of moves played for the user, per device (PLAN.md §5.2): a speed (a preset, or the
// milliseconds a move takes) and the pauses between: a line's end, and a look at a position.
// Pauses left unset follow the speed. In localStorage, read once and written on change.
import { signal } from '@preact/signals';
import { MIN_PACE_MS, type Pauses } from '../core/train/trainer.ts';

export const PACES = { fastest: 250, fast: 450, normal: 600, relaxed: 900 } as const;
export type Pace = keyof typeof PACES | 'custom';
export const PACE_NAMES: readonly Pace[] = [...(Object.keys(PACES) as (keyof typeof PACES)[]), 'custom'];

export const MAX_PACE_MS = 10000;

export interface PaceSettings {
  pace: Pace;
  /** The milliseconds a move takes with the "custom" pace. */
  customMs: number;
  /** A line's end before the next line (unset: 2 paces, 4 going on to a line picked). */
  lineEndMs?: number;
  /** A look at a position: after a mistake, in a shown sequence, before a comment line (unset: 2 paces). */
  lookMs?: number;
}

export const DEFAULT_PACE: PaceSettings = { pace: 'normal', customMs: 300 };

const KEY = 'repworks.paceSettings';
const LEGACY_KEY = 'repworks.pace';

/** The stored settings, each field checked: an unknown value is the default. */
export function parsePace(raw: string | null, legacy: string | null = null): PaceSettings {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  const ms = (value: unknown): number | undefined => (Number.isInteger(value) && (value as number) >= MIN_PACE_MS && (value as number) <= MAX_PACE_MS ? (value as number) : undefined);
  const named = (value: unknown): Pace | undefined => PACE_NAMES.find((p) => p === value);
  const out: PaceSettings = { pace: named(v.pace) ?? named(legacy) ?? DEFAULT_PACE.pace, customMs: ms(v.customMs) ?? DEFAULT_PACE.customMs };
  const lineEndMs = ms(v.lineEndMs);
  const lookMs = ms(v.lookMs);
  if (lineEndMs !== undefined) out.lineEndMs = lineEndMs;
  if (lookMs !== undefined) out.lookMs = lookMs;
  return out;
}

function read(): PaceSettings {
  try {
    return parsePace(localStorage.getItem(KEY), localStorage.getItem(LEGACY_KEY));
  } catch {
    return { ...DEFAULT_PACE };
  }
}

export const paceSettings = signal<PaceSettings>(read());

export function savePaceSettings(next: PaceSettings): void {
  paceSettings.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Kept for this page only.
  }
}

/** The milliseconds a move played for the user takes. */
export function moveMs(s: PaceSettings = paceSettings.peek()): number {
  return s.pace === 'custom' ? s.customMs : PACES[s.pace];
}

/** The pauses the user set. */
export function pausesOf(s: PaceSettings = paceSettings.peek()): Pauses {
  return { ...(s.lineEndMs !== undefined ? { lineEndMs: s.lineEndMs } : {}), ...(s.lookMs !== undefined ? { lookMs: s.lookMs } : {}) };
}

/** The pause before the next line of a picked line's list opens: the user's, else four moves' worth. */
export function goOnMs(s: PaceSettings = paceSettings.peek()): number {
  return s.lineEndMs ?? 4 * moveMs(s);
}
