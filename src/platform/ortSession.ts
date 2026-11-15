// A model's session for Maia's and Lc0's workers (PLAN.md §5.184): onnxruntime-web on wasm, one
// thread, as before; or, when the page asks for the graphics processor, on WebGPU where that
// serves. "Serves" is checked here, in the worker, each session's first start: the model is
// run on both backends on real positions, and the graphics processor is kept only when its
// answers are the processor's and it is faster. Anything else (no WebGPU, no adapter, a shader
// the adapter can't run, answers that differ, no gain) ends on the processor, with the reason
// for the settings to show. So the switch can't make an engine wrong or slower: at worst it
// does nothing.
import * as wasmOrt from 'onnxruntime-web/wasm';
import { gpuVerdict, maxDiff, type GpuInit, type GpuNote } from '../core/engine/gpu.ts';
import { ENGINES, stored } from './blobs.ts';

type Ort = typeof wasmOrt;
type Session = wasmOrt.InferenceSession;
type Feeds = Record<string, wasmOrt.Tensor>;

export interface Opened {
  /** The runtime the session belongs to: tensors are made with it. */
  ort: Ort;
  session: Session;
  /** What became of the graphics processor, when it was asked for. */
  gpu?: GpuNote;
}

export interface Probe {
  /** Real positions as the model's inputs, for the check. */
  feeds(ort: Ort): Feeds;
  /** The outputs compared, by name. */
  outputs: readonly string[];
}

/** The files of the runtime with the WebGPU backend. */
export const GPU_RUNTIME = [ENGINES.ortGpuWasm, ENGINES.ortGpuMjs];

const absolute = (url: string) => new URL(url, location.href).href;

function configure(ort: Ort, wasm: string, mjs: string): void {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: absolute(wasm), mjs: absolute(mjs) };
}

/** Why the graphics processor can't be tried here; undefined when it can. */
async function blocked(): Promise<string | undefined> {
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'this browser has no WebGPU';
  if (typeof (WebAssembly as { Suspending?: unknown }).Suspending !== 'function') return 'this browser can’t wait on the graphics processor from WebAssembly (JSPI)';
  if (!(await gpu.requestAdapter().catch(() => null))) return 'no graphics adapter was offered';
  if (!(await stored(GPU_RUNTIME))) return 'its runtime isn’t on this device';
  return undefined;
}

const RUNS = 3;

async function timed(session: Session, feeds: Feeds, outputs: readonly string[]): Promise<{ ms: number; out: ArrayLike<number>[] }> {
  // The first run compiles (a graphics processor's shaders above all): not timed.
  let result = await session.run(feeds);
  const start = performance.now();
  for (let i = 0; i < RUNS; i++) result = await session.run(feeds);
  const elapsed = (performance.now() - start) / RUNS;
  return { ms: elapsed, out: outputs.map((name) => result[name]!.data as Float32Array) };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 300);

/** The model on the graphics processor, checked against the processor unless trusted; undefined with a note when it doesn't serve. */
async function openGpu(model: Uint8Array, init: GpuInit, probe: Probe): Promise<Opened> {
  const ort = (await import('onnxruntime-web/jspi')) as Ort;
  configure(ort, ENGINES.ortGpuWasm.url, ENGINES.ortGpuMjs.url);
  // This runtime's processor backend is the fallback: the same file, nothing more to download.
  const onProcessor = (): Promise<Session> => ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  let gpu: Session | undefined;
  try {
    gpu = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
    const feeds = probe.feeds(ort);
    if (init.ask === 'trust') {
      // Checked already this session: one run all the same, since a shader fails when it is first run, not when the session is made.
      await gpu.run(feeds);
      return { ort, session: gpu, gpu: { used: true } };
    }
    const cpu = await onProcessor();
    const [g, c] = [await timed(gpu, feeds, probe.outputs), await timed(cpu, feeds, probe.outputs)];
    const note = gpuVerdict({ diff: maxDiff(c.out, g.out), cpuMs: c.ms, gpuMs: g.ms }, init.evenIfSlower);
    if (note.used) {
      await cpu.release().catch(() => undefined);
      return { ort, session: gpu, gpu: note };
    }
    await gpu.release().catch(() => undefined);
    return { ort, session: cpu, gpu: note };
  } catch (e) {
    await gpu?.release().catch(() => undefined);
    return { ort, session: await onProcessor(), gpu: { used: false, reason: `the graphics processor failed: ${message(e)}` } };
  }
}

/**
 * The session for the model at `url`. Without `gpu`: wasm, as it always was. With it: WebGPU
 * where it serves (the note says), else wasm.
 */
export async function openSession(url: string, what: string, gpu: GpuInit | undefined, probe: Probe): Promise<Opened> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status}`);
  const model = new Uint8Array(await response.arrayBuffer());
  let note: GpuNote | undefined;
  if (gpu) {
    const why = await blocked().catch((e: unknown) => message(e));
    if (!why) {
      try {
        return await openGpu(model, gpu, probe);
      } catch (e) {
        // The runtime itself didn't start: the plain one below.
        note = { used: false, reason: `the graphics processor’s runtime failed: ${message(e)}` };
      }
    } else note = { used: false, reason: why };
  }
  configure(wasmOrt, ENGINES.ortWasm.url, ENGINES.ortMjs.url);
  const session = await wasmOrt.InferenceSession.create(model);
  return { ort: wasmOrt, session, ...(note ? { gpu: note } : {}) };
}
