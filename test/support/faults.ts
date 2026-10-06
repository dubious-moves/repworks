// What can go wrong with a remote call, shared by the fake remote and the fake GitHub, so the
// sync tests run the same failures through the step alone and through the real adapters.

export type Op = 'head' | 'files' | 'blobs' | 'commit' | 'commitsSince';

export type Fault =
  /** No answer, and nothing done. */
  | { kind: 'network' }
  /** Done, then the answer lost: for a commit, it lands and the device can't tell. */
  | { kind: 'lose' }
  /** 401: the token is expired or revoked. */
  | { kind: 'auth' }
  /** 429 with retry-after (seconds), or 403 with x-ratelimit-remaining: 0. */
  | { kind: 'rate'; retryAfterSec?: number; primary?: boolean }
  /** 502 from GitHub, nothing done. */
  | { kind: 'server' };

export class Faults {
  private readonly once: { op: Op; fault: Fault }[] = [];
  private readonly always = new Map<Op, Fault>();
  /** Runs before each call is served (after its fault check): concurrent edits, other devices' commits. */
  during: ((op: Op) => void | Promise<void>) | undefined;
  /** For random histories: each call fails with this chance, drawing from `random`. */
  chaos: { rate: number; random: () => number; kinds: Fault[] } | undefined;
  /** Head reads still to answer with the head before the last commit (a lagging replica). */
  lagReads = 0;
  /** Commits that landed with their answer lost, counted by the fakes. */
  landedLost = 0;

  on(op: Op, fault: Fault): this {
    this.once.push({ op, fault });
    return this;
  }

  set(op: Op, fault: Fault | undefined): this {
    if (fault) this.always.set(op, fault);
    else this.always.delete(op);
    return this;
  }

  next(op: Op): Fault | undefined {
    const i = this.once.findIndex((f) => f.op === op);
    if (i >= 0) return this.once.splice(i, 1)[0]!.fault;
    const fixed = this.always.get(op);
    if (fixed) return fixed;
    if (this.chaos && this.chaos.random() < this.chaos.rate) {
      const kinds = this.chaos.kinds;
      return kinds[Math.floor(this.chaos.random() * kinds.length)];
    }
    return undefined;
  }
}
