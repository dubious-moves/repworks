// Maia and Lc0 on the graphics processor (PLAN.md §5.184): what the page asks of their workers,
// what a worker says back, and the choice between the two backends once both have run the same
// positions. Pure: the runs themselves are the worker's (src/platform/ortSession.ts).

/** What an `init` asks for: the graphics processor checked against the processor first, or taken as checked this session. */
export interface GpuInit {
  ask: 'check' | 'trust';
  /** Use it even where it is no faster (the tests' software adapter is never faster). */
  evenIfSlower?: boolean;
}

/** What a worker did with the graphics processor. */
export interface GpuNote {
  /** Whether the model now runs on it. */
  used: boolean;
  /** Why not, when it doesn't. */
  reason?: string;
  /** A run's time on each, in milliseconds, when both were timed. */
  gpuMs?: number;
  cpuMs?: number;
  /** The largest gap between the two backends' outputs on the same positions. */
  diff?: number;
}

/**
 * The largest gap two backends' raw outputs may have. Lc0's differ by 0.00003 between wasm and
 * WebGPU; a broken driver gives NaN or numbers nowhere near. Maia computes in 16-bit floats
 * inside, where the two may round apart: a twentieth of a logit moves a move's share by 5% of
 * itself at most.
 */
export const GPU_TOLERANCE = 0.05;

/** The largest absolute gap between two sets of outputs; Infinity when they differ in shape or hold a number that isn't one. */
export function maxDiff(a: readonly ArrayLike<number>[], b: readonly ArrayLike<number>[]): number {
  if (a.length !== b.length) return Infinity;
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.length !== y.length) return Infinity;
    for (let j = 0; j < x.length; j++) {
      const d = Math.abs(x[j]! - y[j]!);
      // NaN compares false with everything: caught here, not passed as 0.
      if (!(d <= worst)) {
        if (!Number.isFinite(d)) return Infinity;
        worst = d;
      }
    }
  }
  return worst;
}

const ms = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

/**
 * The choice once both backends have answered the same positions: the graphics processor when
 * its answers are the processor's (within `tolerance`) and it is faster, or as fast with
 * `evenIfSlower`.
 */
export function gpuVerdict(m: { diff: number; cpuMs: number; gpuMs: number }, evenIfSlower = false, tolerance = GPU_TOLERANCE): GpuNote {
  const timed = { gpuMs: m.gpuMs, cpuMs: m.cpuMs };
  if (!(m.diff <= tolerance)) {
    return { used: false, reason: Number.isFinite(m.diff) ? `its answers differ from the processor’s (by ${m.diff.toPrecision(2)})` : 'its answers aren’t numbers', ...timed, ...(Number.isFinite(m.diff) ? { diff: m.diff } : {}) };
  }
  if (!evenIfSlower && !(m.gpuMs < m.cpuMs)) return { used: false, reason: 'it is no faster here', ...timed, diff: m.diff };
  return { used: true, ...timed, diff: m.diff };
}

/** A worker's note in words, for the engine's settings: "Lc0: on the graphics processor, 9 ms a run against 64 on the processor." */
export function gpuNoteText(name: string, note: GpuNote | undefined): string {
  if (!note) return `${name}: not started yet.`;
  const times = note.gpuMs !== undefined && note.cpuMs !== undefined ? `${ms(note.gpuMs)} ms a run against ${ms(note.cpuMs)} on the processor` : '';
  if (note.used) return `${name}: on the graphics processor${times ? `, ${times}` : ''}.`;
  return `${name}: on the processor (${note.reason ?? 'the graphics processor wasn’t used'}${times ? `: ${times}` : ''}).`;
}
