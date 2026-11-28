// One session writes to a study at a time (PLAN.md §5.220). The lock is a file of the data repo,
// `notes/<study id>/lock.json` (the session, when, what for), committed and pushed before a session
// writes to `studies/` or `review/` and removed at the end. A lock younger than six hours stops
// every other session; an older one is a session that died, and is taken over. The checkout that
// took a lock remembers it in its own .git folder, so `apply` and a review list written from
// another container are refused even while the lock's file is there.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { git } from '../data-repo.ts';

export const LOCK_HOURS = 6;
const HOUR = 3600 * 1000;

export interface Lock {
  v: 1;
  /** The session that holds it: its id or its link. */
  session: string;
  /** When it was taken, or last renewed (ISO). */
  at: string;
  /** What for: "batch-6". */
  for: string;
}

export const lockPath = (sid: string) => `notes/${sid}/lock.json`;
export const lockText = (lock: Lock) => `${JSON.stringify(lock, null, 2)}\n`;

export function parseLock(text: string): Lock | undefined {
  try {
    const o = JSON.parse(text) as Partial<Lock> | null;
    if (!o || typeof o.session !== 'string' || !o.session || typeof o.at !== 'string' || !Number.isFinite(Date.parse(o.at))) return undefined;
    return { v: 1, session: o.session, at: o.at, for: typeof o.for === 'string' ? o.for : '' };
  } catch {
    return undefined;
  }
}

export type LockStand =
  | { state: 'none' }
  /** A file that can't be read: nobody may write until a person has looked. */
  | { state: 'unreadable' }
  | { state: 'held' | 'stale'; lock: Lock; minutes: number };

/** Where the lock stands: none, held (younger than six hours), or stale. */
export function lockStand(text: string | undefined, now: number): LockStand {
  if (text === undefined) return { state: 'none' };
  const lock = parseLock(text);
  if (!lock) return { state: 'unreadable' };
  const age = now - Date.parse(lock.at);
  return { state: age < LOCK_HOURS * HOUR ? 'held' : 'stale', lock, minutes: Math.max(0, Math.round(age / 60000)) };
}

const ago = (minutes: number) => (minutes < 120 ? `${minutes} min ago` : `${(minutes / 60).toFixed(1)} h ago`);

export function lockWords(s: LockStand): string {
  if (s.state === 'none') return 'none';
  if (s.state === 'unreadable') return 'lock.json is there and can’t be read: nobody writes until it is looked at';
  return `${s.state === 'held' ? 'held' : `STALE (older than ${LOCK_HOURS} h: its session is taken to have died, and the lock may be taken over)`} by ${s.lock.session}${s.lock.for ? ` for ${s.lock.for}` : ''}, taken ${ago(s.minutes)}`;
}

/* ------------------------------------------------------------------ the checkout's own memory of it */

function markerPath(dir: string, sid: string): string {
  const gitDir = git(dir, 'rev-parse', '--git-dir').trim();
  return join(isAbsolute(gitDir) ? gitDir : join(dir, gitDir), `repworks-audit-lock-${sid}`);
}

export function rememberLock(dir: string, sid: string, lock: Lock): void {
  writeFileSync(markerPath(dir, sid), lockText(lock));
}
export function forgetLock(dir: string, sid: string): void {
  rmSync(markerPath(dir, sid), { force: true });
}
/** The lock this checkout took, if it remembers one. */
export function rememberedLock(dir: string, sid: string): Lock | undefined {
  try {
    const path = markerPath(dir, sid);
    return existsSync(path) ? parseLock(readFileSync(path, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether this checkout may write to the study: the lock's file is there, young, and the one this
 * checkout took. Otherwise the sentence to refuse with.
 */
export function heldHere(dir: string, sid: string, now: number): { ok: true; lock: Lock } | { ok: false; why: string } {
  const path = join(dir, lockPath(sid));
  const stand = lockStand(existsSync(path) ? readFileSync(path, 'utf8') : undefined, now);
  const take = `Take it first: node scripts/audit/audit.ts lock ${dir} --study ${sid} --session <this session's id> --for <the batch>`;
  if (stand.state === 'none') return { ok: false, why: `no lock: ${lockPath(sid)} is not there. ${take}` };
  if (stand.state === 'unreadable') return { ok: false, why: `${lockPath(sid)} can't be read` };
  const mine = rememberedLock(dir, sid);
  if (!mine || mine.session !== stand.lock.session || mine.at !== stand.lock.at) return { ok: false, why: `the lock is not this checkout's: ${lockWords(stand)}. ${stand.state === 'held' ? 'Another session is writing: stop.' : take}` };
  if (stand.state === 'stale') return { ok: false, why: `this checkout's lock is older than ${LOCK_HOURS} hours: renew it (audit.ts lock again, with the same --session)` };
  return { ok: true, lock: stand.lock };
}
