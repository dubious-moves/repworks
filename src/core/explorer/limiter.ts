// Practical eval: the explorer's rate limiter and ChessDB's lane (PLAN.md §5.21).
//
// Ported from q_extension `src/pe/providers.js` at c26242f (github.com/skAeglund/q_extension, by
// the same owner), behaviour unchanged, under this repo's GPL-3.0-or-later. The one change: the
// clock and `sleep` are inputs with no default, since core reads no clock.

import type { PeError } from './search.ts';

/*
 * Lichess's explorer limit, measured with q_extension's tools/lichess-rate.mjs on 2026-09-27 (it
 * sends no rate headers): a token bucket holding about 23 requests and refilling about 18.5 to 19
 * a minute. From rest, 23 unpaced requests went through and the 24th got a 429; a steady 33/min
 * got one on the 52nd, and 20 then 30/min on the 76th, at 164 s.
 *
 * Ours is smaller on both counts, so it can never run ahead of Lichess's. The burst is where the
 * speed is: after a minute or so without requests, a new position's first requests go out at once
 * instead of one every 4 s. The rate is capped at RATE_MAX.
 *
 * The bucket is per token (or per account), not per IP: with one token refused, a second
 * account's token got 12 answers straight after (2026-09-27; that run's first token got 22
 * through, not 23). q_extension took a burst of 16 on Qchess's token (shared with Qchess's own
 * panel) and 20 on its own; the site's token is its own, so OWN_BURST. Two tokens of one account
 * may still share a bucket: per token vs per account is untested.
 */
export const LICHESS_RATE = 16;
export const LICHESS_BURST = 16;
export const OWN_BURST = 20;
export const RATE_MAX = 18;

// The burst for the token in use: `own` is the token the site keeps, `site` another tool's (Qchess's
// in q_extension). The site only ever uses its own, so OWN_BURST; kept for q_extension's tests.
export function burstFor(own: string, site: string): number {
  return own && own !== site ? OWN_BURST : LICHESS_BURST;
}

export type Now = () => number;
export type Sleep = (ms: number) => Promise<void>;

export function Cancelled(): PeError {
  const e: PeError = new Error('cancelled');
  e.cancelled = true;
  return e;
}

// The per-root request budget is spent; the search keeps its last completed iteration.
export function BudgetOut(): PeError {
  const e: PeError = new Error('budget');
  e.budget = true;
  return e;
}

export function HttpError(status: number, message?: string): PeError {
  const e: PeError = new Error(message || 'HTTP ' + status);
  e.status = status;
  return e;
}

interface Job<T = unknown> {
  fn: () => T | Promise<T>;
  isStale?: (() => boolean) | undefined;
  priority: number;
  seq: number;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export interface LimiterSnapshot {
  tokens: number;
  t: number;
  pausedUntil: number;
}

export interface RateLimiter {
  /** As the lane's: the promise carries its job, so a caller joining it can raise its priority. */
  schedule<T>(fn: () => T | Promise<T>, isStale?: () => boolean, priority?: number): Promise<T> & { job: { priority: number } };
  sweep(): void;
  queued(): number;
  pause(ms: number): void;
  pausedFor(): number;
  setRate(r: number): void;
  setBurst(b: number): void;
  burst(): number;
  snapshot(): LimiterSnapshot;
  restore(s: Partial<LimiterSnapshot> | null | undefined): void;
}

/*
 * Token bucket plus a single lane. `schedule(fn, isStale, priority)` runs fn() when a token is
 * available, one job at a time: the next job starts only once the previous one has settled. Among
 * waiting jobs the highest priority goes first, then call order. A job whose isStale() is true when
 * its turn comes is dropped without spending a token; `sweep()` drops them at once, so a new root
 * position frees the queue immediately.
 */
export function createRateLimiter(o: { now: Now; sleep: Sleep; ratePerMin?: number | undefined; burst?: number | undefined }): RateLimiter {
  const now = o.now;
  const sleep = o.sleep;
  let ratePerMin = o.ratePerMin || LICHESS_RATE;
  let burst = o.burst || LICHESS_BURST;
  let tokens = burst;
  let last = now();
  let pausedUntil = 0;
  let jobs: Job[] = [];
  let seq = 0;
  let pumping = false;

  function refill() {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) * ratePerMin) / 60000);
    last = t;
  }

  function sweep() {
    jobs = jobs.filter((j) => {
      if (j.isStale && j.isStale()) {
        j.reject(Cancelled());
        return false;
      }
      return true;
    });
  }

  function take(): Job {
    let bi = 0;
    for (let i = 1; i < jobs.length; i++) {
      const a = jobs[i]!;
      const b = jobs[bi]!;
      if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) bi = i;
    }
    return jobs.splice(bi, 1)[0]!;
  }

  function step(): void {
    sweep();
    if (!jobs.length) {
      pumping = false;
      return;
    }
    const t = now();
    if (pausedUntil > t) {
      void sleep(Math.min(pausedUntil - t, 1000)).then(step);
      return;
    }
    refill();
    if (tokens < 1) {
      void sleep(Math.min(Math.ceil(((1 - tokens) * 60000) / ratePerMin), 1000)).then(step);
      return;
    }
    tokens -= 1;
    const job = take();
    void Promise.resolve().then(job.fn).then(job.resolve, job.reject).then(step);
  }

  return {
    schedule<T>(fn: () => T | Promise<T>, isStale?: () => boolean, priority?: number) {
      const job = { fn, isStale, priority: priority || 0, seq: seq++ } as Job;
      const p = new Promise<T>((resolve, reject) => {
        job.resolve = resolve as (v: unknown) => void;
        job.reject = reject;
        jobs.push(job);
        if (!pumping) {
          pumping = true;
          // Start on a microtask, so jobs queued in the same tick compete on priority.
          void Promise.resolve().then(step);
        }
      }) as Promise<T> & { job: { priority: number } };
      p.job = job;
      return p;
    },
    sweep,
    queued: () => jobs.length,
    // A 429 means Lichess's bucket is empty: ours is emptied too, or it would be fuller than
    // Lichess's once the pause is over.
    pause(ms: number) {
      pausedUntil = Math.max(pausedUntil, now() + ms);
      refill();
      tokens = 0;
    },
    pausedFor: () => Math.max(0, pausedUntil - now()),
    setRate(r: number) {
      if (r > 0) {
        refill();
        ratePerMin = Math.min(r, RATE_MAX);
      }
    },
    // A smaller burst takes effect at once; a larger one fills up at the rate.
    setBurst(b: number) {
      if (!(b > 0) || b === burst) return;
      refill();
      burst = b;
      tokens = Math.min(tokens, burst);
    },
    burst: () => burst,
    /*
     * The bucket as it stands, and back. q_extension's service worker is stopped when idle and
     * would come back with a full bucket while Lichess's is still refilling; the site's worker is
     * started afresh on every load. Times are the clock's, so they carry across restarts.
     */
    snapshot() {
      refill();
      return { tokens, t: last, pausedUntil };
    },
    restore(s) {
      if (!s || !isFinite(s.tokens!) || !isFinite(s.t!)) return;
      tokens = Math.max(0, Math.min(burst, s.tokens! + (Math.max(0, now() - s.t!) * ratePerMin) / 60000));
      last = now();
      if (isFinite(s.pausedUntil!)) pausedUntil = Math.max(pausedUntil, s.pausedUntil!);
    },
  };
}

export type Lane = (<T>(fn: () => T | Promise<T>, isStale?: () => boolean, priority?: number) => Promise<T> & { job: { priority: number } }) ;

/*
 * At most `n` jobs in flight; the rest wait, highest priority first, then in call order. The
 * returned promise carries its job (`p.job`), so a caller that joins a request already waiting can
 * raise its priority: the Maia preview's ChessDB lookups (priority 0) queue behind the Lichess
 * search's (1), and one the Lichess search also needs moves up.
 */
export function createLimiter(n: number): Lane {
  let active = 0;
  const queue: Job[] = [];
  let seq = 0;
  function take(): Job {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i]!;
      const b = queue[bi]!;
      if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) bi = i;
    }
    return queue.splice(bi, 1)[0]!;
  }
  function next() {
    while (active < n && queue.length) {
      const job = take();
      if (job.isStale && job.isStale()) {
        job.reject(Cancelled());
        continue;
      }
      active++;
      void Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .then(() => {
          active--;
          next();
        });
    }
  }
  return (<T>(fn: () => T | Promise<T>, isStale?: () => boolean, priority?: number) => {
    const job = { fn, isStale, priority: priority || 0, seq: seq++ } as Job<T>;
    const p = new Promise<T>((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    }) as Promise<T> & { job: { priority: number } };
    queue.push(job as Job);
    next();
    p.job = job;
    return p;
  }) as Lane;
}
