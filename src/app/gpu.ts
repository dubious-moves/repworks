// Maia and Lc0 on the graphics processor (PLAN.md §5.184): the device's switch, off unless
// chosen; the one-time download of the runtime that has the WebGPU backend; what each engine's
// worker is asked when it starts, and what it said became of it. The workers decide (the check
// against the processor's answers, the timing: src/platform/ortSession.ts); this is the
// choice, the download and the words.
import { signal } from '@preact/signals';
import type { GpuInit, GpuNote } from '../core/engine/gpu.ts';
import { ENGINES, ensure, remove, stored } from '../platform/blobs.ts';

export interface GpuPrefs {
  on: boolean;
  /** Use the graphics processor even where it is no faster: for tests, whose software adapter never is. */
  evenIfSlower?: boolean;
}

const PREFS_KEY = 'repworks-gpu';
/** The runtime with the WebGPU backend: beside the plain one, which stays the fallback. */
export const GPU_FILES = [ENGINES.ortGpuWasm, ENGINES.ortGpuMjs];

function loadPrefs(): GpuPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { on: false, ...(raw ? (JSON.parse(raw) as Partial<GpuPrefs>) : {}) };
  } catch {
    return { on: false };
  }
}

export const gpuPrefs = signal<GpuPrefs>(loadPrefs());

function savePrefs(patch: Partial<GpuPrefs>): void {
  gpuPrefs.value = { ...gpuPrefs.value, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(gpuPrefs.value));
  } catch {
    // This session only.
  }
}

export type GpuState =
  | { kind: 'idle' }
  | { kind: 'downloading'; received: number; total: number }
  /** Switched on and not possible here, or the download failed: the switch is off again. */
  | { kind: 'refused'; reason: string };

export const gpuState = signal<GpuState>({ kind: 'idle' });

export type GpuEngine = 'maia' | 'lc0';
/** What each engine's worker said of the graphics processor, this session. */
export const gpuNotes = signal<Partial<Record<GpuEngine, GpuNote>>>({});

/** Why this browser can't run them on the graphics processor; undefined when it can try. */
export async function gpuSupport(): Promise<string | undefined> {
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'This browser has no WebGPU.';
  if (typeof (WebAssembly as { Suspending?: unknown }).Suspending !== 'function') return 'This browser has WebGPU, but can’t wait on it from WebAssembly (JSPI): Chrome 137 or later can.';
  const adapter = await gpu.requestAdapter().catch(() => null);
  return adapter ? undefined : 'This browser offers no graphics adapter here.';
}

/**
 * The switch. On: the runtime is downloaded once (16.8 MB), then Maia's and Lc0's workers start
 * again and check the graphics processor themselves. Off: they start again on the processor.
 */
export async function setGpuOn(on: boolean): Promise<void> {
  if (!on) {
    gpuState.value = { kind: 'idle' };
    gpuNotes.value = {};
    savePrefs({ on: false });
    return;
  }
  // Said at once, before the first wait: the switch shows what was asked while it is being done.
  const total = GPU_FILES.reduce((n, f) => n + f.bytes, 0);
  gpuState.value = { kind: 'downloading', received: 0, total };
  const why = await gpuSupport();
  if (why) {
    gpuState.value = { kind: 'refused', reason: why };
    return;
  }
  try {
    await ensure(GPU_FILES, (p) => (gpuState.value = { kind: 'downloading', ...p }));
  } catch (e) {
    gpuState.value = { kind: 'refused', reason: `The download failed: ${e instanceof Error ? e.message : String(e)}` };
    return;
  }
  gpuState.value = { kind: 'idle' };
  gpuNotes.value = {};
  savePrefs({ on: true });
}

/** Deletes the stored runtime (the switch goes off). */
export async function deleteGpuRuntime(): Promise<void> {
  await setGpuOn(false);
  await remove(GPU_FILES);
}

export const gpuStored = (): Promise<boolean> => stored(GPU_FILES);

/**
 * What an engine's worker is asked at its start: nothing while the switch is off; the check the
 * first time this session; after a check that kept the graphics processor, trust (a worker ends
 * after a while unused and starts again: the check isn't run each time). One that fell back
 * isn't asked again this session.
 */
export function gpuInit(engine: GpuEngine): GpuInit | undefined {
  const prefs = gpuPrefs.peek();
  if (!prefs.on) return undefined;
  const note = gpuNotes.peek()[engine];
  if (note && !note.used) return undefined;
  return { ask: note ? 'trust' : 'check', ...(prefs.evenIfSlower ? { evenIfSlower: true } : {}) };
}

/** A worker's word on its start. A trusted start says only that it is still used: the check's timings are kept. */
export function noteGpu(engine: GpuEngine, note: GpuNote | undefined): void {
  if (!note) return;
  const before = gpuNotes.peek()[engine];
  if (note.used && before?.used && note.gpuMs === undefined) return;
  gpuNotes.value = { ...gpuNotes.peek(), [engine]: note };
}
