// The engines' cache (PLAN.md §5.29): Stockfish, the Maia model and onnxruntime-web's wasm are
// downloaded when first used and kept in Cache Storage under `repworks-engines`, which the
// service worker serves cache first and never empties on an update (src/sw/sw.ts). Their names
// carry a hash of their content, so a stored file is always the right one. Works in a page and
// in a worker alike.
import { ENGINES, type EngineFile } from 'virtual:repworks-engines';

export { ENGINES, type EngineFile };

export const ENGINE_CACHE = 'repworks-engines';

export interface Progress {
  /** Bytes received so far, over every file asked for. */
  received: number;
  /** Bytes in all, from the build's own count (a compressed answer's length would mislead). */
  total: number;
}

const open = (): Promise<Cache> | undefined => (typeof caches === 'undefined' ? undefined : caches.open(ENGINE_CACHE));

/** Whether every one of the files is stored. */
export async function stored(files: readonly EngineFile[]): Promise<boolean> {
  const cache = await open()?.catch(() => undefined);
  if (!cache) return false;
  for (const f of files) if (!(await cache.match(f.url))) return false;
  return true;
}

/** The bytes the stored ones among the files take. */
export async function storedBytes(files: readonly EngineFile[]): Promise<number> {
  const cache = await open()?.catch(() => undefined);
  if (!cache) return 0;
  let n = 0;
  for (const f of files) if (await cache.match(f.url)) n += f.bytes;
  return n;
}

/**
 * Downloads the files not stored yet and stores them, reporting progress over all of them. A
 * file is stored only once it has arrived whole, so a cut download leaves nothing behind. Where
 * Cache Storage is missing (an insecure origin), the files are only fetched, for the HTTP cache.
 */
export async function ensure(files: readonly EngineFile[], onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<void> {
  const cache = await open()?.catch(() => undefined);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  let received = 0;
  const report = () => onProgress?.({ received, total });
  report();
  for (const f of files) {
    if (cache && (await cache.match(f.url))) {
      received += f.bytes;
      report();
      continue;
    }
    const response = await fetch(f.url, signal ? { signal } : {});
    if (!response.ok || !response.body) throw new Error(`${f.url}: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      received += value.length;
      report();
    }
    if (got !== f.bytes) throw new Error(`${f.url}: ${got} bytes arrived, ${f.bytes} expected`);
    received += f.bytes - got;
    const type = response.headers.get('content-type') ?? 'application/octet-stream';
    await cache?.put(f.url, new Response(new Blob(chunks as BlobPart[], { type }), { headers: { 'content-type': type, 'content-length': String(got) } }));
  }
}

/** Deletes the stored files. */
export async function remove(files: readonly EngineFile[]): Promise<void> {
  const cache = await open()?.catch(() => undefined);
  if (!cache) return;
  for (const f of files) await cache.delete(f.url);
}
