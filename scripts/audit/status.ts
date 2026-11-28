// Is there work for a session that nobody started by hand? (PLAN.md §5.220.) A scheduled task
// starts a fresh session every few hours; its first command is `audit.ts status`, and when the
// answer is no, it says so in a line and stops. Work means: no review list has a position still
// waiting for the owner, he has been quiet for half an hour (his device's last sync is that old),
// no other session holds the lock, something is there to do (answers to merge, or a subtree left),
// and ChessDB's exploration of the next subtree is not still running. Pure: what was read in.
import type { AnsweredList } from '../chapter-diff-lib.ts';
import { explorationWords, type Exploration } from './explore.ts';
import { lockWords, type LockStand } from './lock.ts';

export const QUIET_MINUTES = 30;
/** How long a batch waits for the exploration of its own subtree before it goes on with what there is. */
export const EXPLORE_WAIT_HOURS = 24;

export interface ListStand {
  name: string;
  title: string;
  positions: number;
  /** Positions with nothing left to answer. */
  answered: number;
  /** Positions still waiting. */
  open: number;
  /** Marked "look first": in all, and still waiting. */
  first: number;
  firstOpen: number;
}

export const listStand = (l: AnsweredList): ListStand => ({ name: l.list.name, title: l.list.title, positions: l.positions.length, answered: l.positions.length - l.waiting, open: l.waiting, first: l.first.positions, firstOpen: l.positions.filter((p) => p.first && p.waiting).length });

export interface Next {
  cid: string;
  chapter: string;
  /** The subtree's line; '' for the whole chapter. */
  line: string;
  single: number;
  exploration?: Exploration;
}

export interface StatusIn {
  study: string;
  sid: string;
  lists: ListStand[];
  /** The owner's last commit to the data repo: how long ago, and its subject. Undefined when the history held has none. */
  owner?: { minutes: number; subject: string };
  lock: LockStand;
  /** The lock is this checkout's own. */
  lockMine: boolean;
  /** What is left to audit, in the ledger's order; the first is the next batch's. */
  next: Next[];
  /** Commits on the remote that this checkout lacks. */
  behind: number;
  now: number;
}

export interface Status extends StatusIn {
  work: boolean;
  /** One line: what there is to do, or why nothing is done. */
  line: string;
}

const what = (n: Next) => (n.line ? n.line : `the chapter "${n.chapter}"`);

export function statusOf(i: StatusIn): Status {
  const open = i.lists.filter((l) => l.open > 0);
  const first = i.next[0];
  const stop = (reason: string): Status => ({ ...i, work: false, line: `${i.study}: nothing done: ${reason}` });
  if (i.behind > 0) return stop(`this checkout is ${i.behind} commit(s) behind the remote: git pull, then status again`);
  if (i.lock.state === 'unreadable') return stop(lockWords(i.lock));
  if (i.lock.state === 'held' && !i.lockMine) return stop(`another session is writing (the lock is ${lockWords(i.lock)})`);
  if (open.length) return stop(`the owner is reviewing: ${open.map((l) => `${l.name} has ${l.open} of ${l.positions} position(s) open${l.firstOpen ? `, ${l.firstOpen} of them marked "look first"` : ''}`).join('; ')}`);
  if (i.owner && i.owner.minutes < QUIET_MINUTES) return stop(`the owner's device synced ${i.owner.minutes} min ago ("${i.owner.subject}"): he may still be at it (quiet for ${QUIET_MINUTES} min first)`);
  if (!i.lists.length && !first) return stop('no review list to merge and nothing left to audit');
  const e = first?.exploration;
  if (first && e && !e.state?.done) {
    const started = e.start ? Date.parse(e.start.started) : e.state?.updated ? Date.parse(e.state.updated) : NaN;
    if (Number.isFinite(started) && i.now - started < EXPLORE_WAIT_HOURS * 3600 * 1000) return stop(`ChessDB's exploration of the next subtree, ${what(first)}, is still running (${e.name}: ${explorationWords(e)}); a batch waits for it up to ${EXPLORE_WAIT_HOURS} h`);
  }
  const todo = [i.lists.length ? `merge the answers of ${i.lists.map((l) => `${l.name} (${l.positions} position(s))`).join(', ')}` : '', first ? `audit ${what(first)}` : ''].filter(Boolean).join(', then ');
  return { ...i, work: true, line: `${i.study}: work: ${todo}` };
}

export function statusText(s: Status): string {
  const out = [s.line, ''];
  out.push(`Review lists: ${s.lists.length ? '' : 'none open'}`);
  for (const l of s.lists) out.push(`  ${l.name} (${l.title}): ${l.positions} position(s), ${l.answered} answered, ${l.open} open${l.first ? `; "look first": ${l.first}, ${l.firstOpen} of them open` : ''}`);
  out.push(`The owner: ${s.owner ? `last commit ${s.owner.minutes} min ago ("${s.owner.subject}")` : 'no commit of his in the history this checkout holds'}`);
  out.push(`The lock: ${lockWords(s.lock)}${s.lockMine ? ' (this checkout’s own)' : ''}`);
  if (s.behind) out.push(`The checkout: ${s.behind} commit(s) behind the remote`);
  out.push(`Next: ${s.next.length ? '' : 'nothing is left to audit'}`);
  s.next.slice(0, 3).forEach((n, k) => out.push(`  ${k + 1}. ${what(n)} (${n.single} single-move): ChessDB ${n.exploration ? `${n.exploration.name}, ${explorationWords(n.exploration)}` : 'not explored in the last 7 days'}`));
  return `${out.join('\n')}\n`;
}
