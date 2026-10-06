// The small browser ports: the clock, a crypto-backed random source, and Web Locks.
import type { Clock, Locks } from '../core/sync/ports.ts';

export const browserClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** [0, 1) from the platform's cryptographic source. */
export function cryptoRandom(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 2 ** 32;
}

/** Web Locks, shared by every tab of the origin; without them (old browsers), no lock. */
export const webLocks: Locks = {
  withLock: <T>(name: string, task: () => Promise<T>): Promise<T> => ('locks' in navigator && navigator.locks ? navigator.locks.request(name, task) : task()),
};

/** Asks the browser not to evict the site's storage under pressure; whether it agreed. */
export async function persistStorage(): Promise<boolean | undefined> {
  try {
    if (!navigator.storage?.persist) return undefined;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return undefined;
  }
}
