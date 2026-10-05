// Registers the service worker (src/sw/sw.ts) and reports updates and the shell's version.

export interface ServiceWorkerEvents {
  /** A new version took over while this page was running the old one. */
  onUpdateReady(): void;
  onVersion(version: string): void;
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function registerServiceWorker(base: string, events: ServiceWorkerEvents): void {
  if (!('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  // On the first visit the page has no worker; the one that installs then claims it, which is
  // not an update. Any later change of worker is.
  let controlled = container.controller !== null;
  const askVersion = () => container.controller?.postMessage('version');

  container.addEventListener('controllerchange', () => {
    if (controlled) events.onUpdateReady();
    controlled = true;
    askVersion();
  });
  container.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data === 'object' && data !== null && 'version' in data && typeof data.version === 'string') {
      events.onVersion(data.version);
    }
  });
  askVersion();

  container
    .register(`${base}sw.js`, { scope: base })
    .then((registration) => {
      // The browser checks for a new worker on every navigation. An installed app can stay open
      // for days without one, so check again when it comes back to the foreground.
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
        lastCheck = Date.now();
        registration.update().catch(() => undefined);
      });
    })
    .catch((error: unknown) => console.warn('Service worker registration failed:', error));
}
