// What reaches Import from outside (PLAN.md §5.159): a share from another app, which the service
// worker keeps in `repworks-share` (src/sw/sw.ts), and a .pgn file the desktop opened with the
// installed app (the manifest's file_handlers, through `window.launchQueue`).
import { signal } from '@preact/signals';
import type { SharedInput } from '../core/import/shared.ts';
import { open } from './mode.ts';

/** Shared and not yet taken by Import. */
export const pendingShare = signal<SharedInput | undefined>(undefined);

const SHARE = 'repworks-share';

/** The share the service worker kept, taken (and forgotten) once. */
export async function takeShared(): Promise<void> {
  try {
    if (!('caches' in self) || !(await caches.has(SHARE))) return;
    const cache = await caches.open(SHARE);
    const hit = await cache.match('shared');
    await caches.delete(SHARE);
    if (hit) pendingShare.value = (await hit.json()) as SharedInput;
  } catch (e) {
    console.error('the share could not be read', e);
  }
}

interface LaunchParams {
  files: readonly FileSystemFileHandle[];
}
interface LaunchQueue {
  setConsumer(consume: (p: LaunchParams) => void): void;
}

/** A .pgn opened with the installed app (Chrome and Edge on the desktop): read, then Import. */
export function startFileLaunch(): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer((p) => {
    const handle = p.files[0];
    if (!handle) return;
    void handle
      .getFile()
      .then(async (f) => {
        pendingShare.value = { file: { name: f.name, text: await f.text() } };
        open({ name: 'import' });
      })
      .catch((e: unknown) => console.error('the file could not be read', e));
  });
}
