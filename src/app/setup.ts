// Setting a device up (PLAN.md §4.9, §8): from a setup link (typed, pasted or scanned) or the
// form. The link leaves the address bar before anything else runs, so the token isn't left in
// the history or a screenshot.
import { newId } from '../core/study/ids.ts';
import { RemoteError } from '../core/sync/ports.ts';
import { parseSetupHash, type SetupParse, type SetupRequest } from '../core/sync/setup.ts';
import { cryptoRandom, persistStorage } from '../platform/browser.ts';
import { repoInfo } from '../platform/github.ts';
import type { IdbStore, RemoteSettings } from '../platform/idbStore.ts';
import { countRequest } from './requests.ts';

export interface Notice {
  kind: 'done' | 'warning' | 'error';
  message: string;
}

/** Takes a setup link out of the address bar; what it asked for, if it was one. */
export function takeSetupFromAddress(): SetupParse | undefined {
  const parsed = parseSetupHash(location.hash);
  if (parsed) history.replaceState(null, '', location.pathname + location.search);
  return parsed;
}

export function guessDeviceName(): string {
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'phone' : 'desktop';
}

export const publicRepoWarning = (repo: string) =>
  `${repo} is public: anyone can read your studies and progress. Make it private on GitHub: Settings → General → Danger Zone → Change visibility.`;

export async function applySetup(store: IdbStore, request: SetupRequest): Promise<Notice> {
  const existing = await store.remote();
  if (existing && existing.repo !== request.repo) {
    const waiting = await store.waiting();
    const unsent = waiting.files + waiting.events;
    if (unsent > 0 && !confirm(`${unsent} change(s) on this device haven't reached ${existing.repo} yet. Setting it up for ${request.repo} deletes them. Go on?`)) {
      return { kind: 'error', message: 'Setup cancelled: nothing changed.' };
    }
    await store.wipe();
  }
  let branch = '';
  let isPrivate: boolean | undefined;
  try {
    const info = await repoInfo({ repo: request.repo, token: request.token, onRequest: countRequest });
    branch = info.defaultBranch;
    isPrivate = info.private;
  } catch (error) {
    if (!(error instanceof RemoteError) || error.reason !== 'network') {
      const message = error instanceof RemoteError && error.reason === 'auth' ? 'GitHub refused the token: check that it was copied whole and hasn’t expired.' : error instanceof Error ? error.message : String(error);
      return { kind: 'error', message: `Not set up: ${message}` };
    }
    // Offline: set up anyway; the branch is read before the first sync.
  }
  const remote: RemoteSettings = { repo: request.repo, branch, token: request.token, write: request.write ?? 'graphql' };
  if (isPrivate !== undefined) remote.private = isPrivate;
  const device = await store.setUp(remote, { id: newId(cryptoRandom), name: request.name ?? guessDeviceName(), created: new Date().toISOString() });
  const persisted = await persistStorage();
  if (isPrivate === false) return { kind: 'warning', message: publicRepoWarning(request.repo) };
  const storage = persisted === false ? ' The browser kept storage evictable: sync often.' : '';
  return { kind: 'done', message: `This device (${device.name}) syncs with ${request.repo}.${storage}` };
}
