// A practice game kept on the device while it is played, to resume after a reload or a switch of
// app (PLAN.md §6, item 2), mistake-lab's CONTINUATION SESSION PERSISTENCE (`c525403`:
// `saveContSession`, `loadContSession`, the resume banner): saved at every change, offered again
// within four hours when two moves or more were played, cleared when the game ends or is left. The
// game's own shape is the app's; here only what makes a saved game usable. Pure.

export const RESUME = {
  /** `CONT_SESSION_MAX_AGE`. */
  maxAgeMs: 4 * 60 * 60 * 1000,
  /** The banner asks from two moves played (either side's). */
  minMoves: 2,
} as const;

export interface Saved<G> {
  savedAt: number;
  game: G;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A saved game read back: undefined when there is none, it can't be read, it is older than four
 * hours, or `valid` refuses its game.
 */
export function readSaved<G>(raw: string | null, now: number, valid: (g: unknown) => g is G): Saved<G> | undefined {
  if (!raw) return undefined;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isObj(o) || typeof o['savedAt'] !== 'number' || !valid(o['game'])) return undefined;
  if (now - o['savedAt'] > RESUME.maxAgeMs || o['savedAt'] > now + 60_000) return undefined;
  return { savedAt: o['savedAt'], game: o['game'] };
}

/** Whether the banner offers it: two moves or more played. */
export const resumable = (moves: number): boolean => moves >= RESUME.minMoves;
