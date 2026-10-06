// Cross-origin isolation through the service worker (PLAN.md §5.36): a flag in Cache Storage,
// which the worker reads to add COOP and COEP to the pages it serves. Takes effect on the next
// load of the page.
const FLAGS = 'repworks-flags';

export const isolated = (): boolean => typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

export async function wantIsolation(on: boolean): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(FLAGS);
  if (on) await cache.put('isolate', new Response('1'));
  else await cache.delete('isolate');
  navigator.serviceWorker?.controller?.postMessage('isolation');
}
