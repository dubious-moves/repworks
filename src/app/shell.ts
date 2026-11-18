import { signal } from '@preact/signals';
import { offlineMode, onOfflineMode } from '../platform/offline.ts';

/** App-wide state of the shell, read by the UI. */
export const online = signal(navigator.onLine);
/** A newer version of the site has taken over this page's service worker; a reload shows it. */
export const updateReady = signal(false);
/** The version of the precached shell serving this page, from the service worker. */
export const shellVersion = signal<string | null>(null);

/** Offline mode (PLAN.md §5.203): nothing is sent over the network, and sync waits. */
export const offlineOn = signal(offlineMode());
onOfflineMode((on) => (offlineOn.value = on));

addEventListener('online', () => (online.value = true));
addEventListener('offline', () => (online.value = false));
