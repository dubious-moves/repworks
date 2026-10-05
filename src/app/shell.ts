import { signal } from '@preact/signals';

/** App-wide state of the shell, read by the UI. */
export const online = signal(navigator.onLine);
/** A newer version of the site has taken over this page's service worker; a reload shows it. */
export const updateReady = signal(false);
/** The version of the precached shell serving this page, from the service worker. */
export const shellVersion = signal<string | null>(null);

addEventListener('online', () => (online.value = true));
addEventListener('offline', () => (online.value = false));
