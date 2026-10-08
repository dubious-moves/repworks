// Lichess in the app (PLAN.md §4.10): the login on this device, its redirect back, and the client
// the import uses. The redirect comes back to the site's own address with ?code=…&state=…; those
// leave the address bar before anything else runs, like a setup link's token.
import { signal } from '@preact/signals';
import { LichessAuth, lichessClient, type AuthStorage } from '../platform/lichess.ts';
import type { Notice } from './setup.ts';

const site = () => `${location.origin}${import.meta.env.BASE_URL}`;

// Storage the browser blocks reads as empty, and writes to it are lost: the app still starts,
// and a login then can't complete, which it says.
const storage: AuthStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // blocked
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // blocked
    }
  },
};

const auth = new LichessAuth({ clientId: 'repworks', redirectUri: site(), storage });

/** The Lichess user logged in on this device; '' when logged in without a known name. */
export const lichessUser = signal<string | undefined>(auth.token() ? (auth.username() ?? '') : undefined);

export const lichess = lichessClient({ token: () => auth.token() });

/** The token on this device, for the explorer (any scope will do, PLAN.md §5.23); '' without a login. */
export const lichessToken = (): string => auth.token() ?? '';

/** Takes Lichess's answer out of the address bar; the whole address, if it was one. */
export function takeLichessCallback(): string | undefined {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return undefined;
  const url = location.href;
  history.replaceState(history.state, '', location.pathname + location.hash);
  return url;
}

/** Finishes a login that came back; a notice of how it went, and the route to go back to. */
export async function finishLichessLogin(url: string): Promise<{ notice: Notice; returnTo: string }> {
  const result = await auth.handleCallback(url);
  lichessUser.value = auth.token() ? (auth.username() ?? '') : undefined;
  switch (result.status) {
    case 'success':
      return { notice: { kind: 'done', message: `Logged in with Lichess${result.username ? ` as ${result.username}` : ''}.` }, returnTo: result.returnTo };
    case 'denied':
      return { notice: { kind: 'warning', message: 'Lichess login cancelled.' }, returnTo: result.returnTo };
    case 'error':
      return { notice: { kind: 'error', message: `Lichess login failed: ${result.message}.` }, returnTo: result.returnTo };
    case 'none':
      return { notice: { kind: 'warning', message: 'Nothing came back from Lichess.' }, returnTo: '' };
  }
}

export async function logInWithLichess(returnTo: string): Promise<void> {
  location.href = await auth.start(returnTo);
}

export async function logOutOfLichess(): Promise<void> {
  await auth.logOut();
  lichessUser.value = undefined;
}
