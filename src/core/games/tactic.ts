// A tactic played through (PLAN.md §5.55), mistake-lab's tactic mode: the main line, then each
// alternative line still to solve, the common start with a solved line played for the user up to
// where the opponent's reply differs. A move that isn't the active line's but is the next move of
// another unsolved line with the same start switches to it (mistake-lab's `tryTacticLineSwitch`).
// A line that leaves a solved one at the user's own move is not asked: mistake-lab offers those as
// optional ("Find a stronger move"), outside the grade. Pure.
import type { TacticMove } from './record.ts';

export interface TacticRun {
  readonly lines: readonly (readonly TacticMove[])[];
  readonly solved: readonly number[];
  readonly active: number;
  /** The moves played from the tactic's start, standard UCI. */
  readonly played: readonly string[];
}

const commonStart = (a: readonly { uci: string }[], b: readonly { uci: string }[]) => {
  let k = 0;
  while (k < a.length && k < b.length && a[k]!.uci === b[k]!.uci) k++;
  return k;
};

export function startTactic(lines: readonly (readonly TacticMove[])[]): TacticRun {
  return { lines, solved: [], active: 0, played: [] };
}

/** The opponent's moves to play now (after the user's move, or at a line's start). */
export function repliesDue(run: TacticRun): string[] {
  const line = run.lines[run.active]!;
  const out: string[] = [];
  for (let i = run.played.length; i < line.length && !line[i]!.user; i++) out.push(line[i]!.uci);
  return out;
}

/** The user's move expected next on the active line, if any. */
export const expected = (run: TacticRun): TacticMove | undefined => run.lines[run.active]![run.played.length];

export type TacticAnswer = { ok: true; run: TacticRun; lineDone: boolean } | { ok: false };

export function playUser(run: TacticRun, uci: string): TacticAnswer {
  const at = run.played.length;
  const candidates = [run.active, ...run.lines.map((_, i) => i).filter((i) => i !== run.active && !run.solved.includes(i))];
  for (const i of candidates) {
    const line = run.lines[i]!;
    if (commonStart(line, run.played.map((u) => ({ uci: u }))) < at) continue;
    const next = line[at];
    if (next?.user && next.uci === uci) {
      const r: TacticRun = { ...run, active: i, played: [...run.played, uci] };
      return { ok: true, run: r, lineDone: r.played.length >= line.length };
    }
  }
  return { ok: false };
}

/** The opponent's reply played (the caller plays `repliesDue` one at a time). */
export function playReply(run: TacticRun, uci: string): TacticRun {
  return { ...run, played: [...run.played, uci] };
}

/**
 * The next line to solve once the active one is done, with the moves played for the user to reach
 * where it differs; undefined when every line that must be solved is.
 */
export function nextLine(run: TacticRun): { run: TacticRun; prefix: string[] } | undefined {
  const solved = [...run.solved, run.active];
  for (let i = 0; i < run.lines.length; i++) {
    if (solved.includes(i)) continue;
    const line = run.lines[i]!;
    let k = 0;
    for (const s of solved) k = Math.max(k, commonStart(line, run.lines[s]!));
    if (k >= line.length) continue; // a prefix of a solved line
    if (line[k]!.user && k > 0) continue; // leaves a solved line at the user's own move: optional
    const prefix = line.slice(0, k + (line[k]!.user ? 0 : 1)).map((m) => m.uci);
    return { run: { lines: run.lines, solved, active: i, played: prefix }, prefix };
  }
  return undefined;
}
