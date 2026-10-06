// When to sync (PLAN.md §4.9), as a pure state machine over times passed in:
// - pull on start, on focus, when the network comes back, and every 5 minutes while visible;
// - push 30 s after the last change, at most once a minute;
// - push when the app is hidden, straight away (best effort: it may be closing);
// - after a failure, wait: GitHub's retry-after for a rate limit, else a minute, doubling up
//   to 30 minutes; a refused token waits for a new one (setup) or a sync asked for by hand.

export interface ScheduleRules {
  pushDelayMs: number;
  pushSpacingMs: number;
  pullEveryMs: number;
  backoffMs: number;
  backoffMaxMs: number;
}

export const RULES: ScheduleRules = { pushDelayMs: 30_000, pushSpacingMs: 60_000, pullEveryMs: 300_000, backoffMs: 60_000, backoffMaxMs: 1_800_000 };

export type Trigger = 'start' | 'focus' | 'visible' | 'hidden' | 'online' | 'offline' | 'change' | 'manual' | 'setup';

export type Ending = 'synced' | 'offline' | 'auth' | 'rate' | 'busy' | 'error';

export interface Due {
  at: number;
  push: boolean;
}

export class Schedule {
  private readonly rules: ScheduleRules;
  private visible = true;
  private online = true;
  private dirty = false;
  private lastChange = Number.NEGATIVE_INFINITY;
  private lastPush = Number.NEGATIVE_INFINITY;
  private lastPull = Number.NEGATIVE_INFINITY;
  private pullSoon = false;
  private pushSoon = false;
  private waitUntil = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private needsToken = false;

  constructor(rules: ScheduleRules = RULES) {
    this.rules = rules;
  }

  note(trigger: Trigger, now: number): void {
    switch (trigger) {
      case 'start':
      case 'focus':
        this.pullSoon = true;
        break;
      case 'visible':
        this.visible = true;
        this.pullSoon = true;
        break;
      case 'hidden':
        this.visible = false;
        if (this.dirty) this.pushSoon = true;
        break;
      case 'online':
        this.online = true;
        this.pullSoon = true;
        this.waitUntil = Number.NEGATIVE_INFINITY;
        break;
      case 'offline':
        this.online = false;
        break;
      case 'change':
        this.dirty = true;
        this.lastChange = now;
        break;
      case 'manual':
      case 'setup':
        this.needsToken = false;
        this.pullSoon = true;
        if (this.dirty) this.pushSoon = true;
        this.waitUntil = Number.NEGATIVE_INFINITY;
        break;
    }
  }

  /** Whether local work is waiting to be pushed, as the store says after a sync. */
  setDirty(dirty: boolean): void {
    this.dirty = dirty;
    if (!dirty) this.pushSoon = false;
  }

  /** A sync ended at `now`. */
  ended(ending: Ending, now: number, options: { pushed?: boolean; retryAfterMs?: number | undefined } = {}): void {
    if (ending === 'synced') {
      this.failures = 0;
      this.waitUntil = Number.NEGATIVE_INFINITY;
      this.lastPull = now;
      this.pullSoon = false;
      if (options.pushed) {
        this.lastPush = now;
        this.pushSoon = false;
      }
      return;
    }
    this.failures++;
    if (ending === 'auth') {
      this.needsToken = true;
      return;
    }
    const doubling = Math.min(this.rules.backoffMs * 2 ** (this.failures - 1), this.rules.backoffMaxMs);
    const wait = ending === 'rate' && options.retryAfterMs !== undefined ? options.retryAfterMs : ending === 'busy' ? this.rules.backoffMs : doubling;
    this.waitUntil = now + wait;
  }

  /** When the next sync is due, and whether it should push; undefined when nothing is. */
  next(now: number): Due | undefined {
    if (this.needsToken || !this.online) return undefined;
    const pushAt = this.pushSoon ? now : this.dirty ? Math.max(this.lastChange + this.rules.pushDelayMs, this.lastPush + this.rules.pushSpacingMs) : Number.POSITIVE_INFINITY;
    const pullAt = this.pullSoon ? now : this.visible ? this.lastPull + this.rules.pullEveryMs : Number.POSITIVE_INFINITY;
    let at = Math.min(pushAt, pullAt);
    if (at === Number.POSITIVE_INFINITY) return undefined;
    at = Math.max(at, this.waitUntil, now);
    return { at, push: this.dirty && at >= pushAt };
  }

  /** The failures in a row so far (for the status line). */
  get failuresInARow(): number {
    return this.failures;
  }
}
