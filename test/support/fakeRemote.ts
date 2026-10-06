// The Remote port straight over a FakeGit, with injected failures: the step's own tests and the
// long simulations use it (fast); the adapters' tests use the fake GitHub over the same FakeGit.
import { RemoteError, type CommitRequest, type CommitResult, type Remote, type RemoteCommit, type RemoteHead, type RemoteTree } from '../../src/core/sync/ports.ts';
import type { FakeGit } from './fakeGit.ts';
import { Faults, type Fault, type Op } from './faults.ts';

export class FakeRemote implements Remote {
  readonly git: FakeGit;
  readonly faults: Faults;
  readonly calls = { head: 0, notModified: 0, files: 0, blobs: 0, blobCount: 0, commit: 0, commitsSince: 0 };

  constructor(git: FakeGit, faults = new Faults()) {
    this.git = git;
    this.faults = faults;
  }

  /** Throws for a fault that stops the call; returns whether the answer is to be lost after it. */
  private async enter(op: Op): Promise<boolean> {
    const fault = this.faults.next(op);
    if (fault && fault.kind !== 'lose') throw errorOf(fault);
    await this.faults.during?.(op);
    return fault?.kind === 'lose';
  }

  async head(etag?: string): Promise<RemoteHead | 'not-modified'> {
    this.calls.head++;
    const lose = await this.enter('head');
    if (this.git.head === '') throw new RemoteError('setup', 'the data repo is empty', { status: 409 });
    let head = this.git.head;
    if (this.faults.lagReads > 0 && this.git.previous !== '') {
      this.faults.lagReads--;
      head = this.git.previous;
    }
    if (lose) throw lost();
    if (etag === `W/"${head}"`) {
      this.calls.notModified++;
      return 'not-modified';
    }
    return { commit: head, etag: `W/"${head}"` };
  }

  async files(commit: string): Promise<RemoteTree> {
    this.calls.files++;
    const lose = await this.enter('files');
    const c = this.git.commits.get(commit);
    if (!c) throw new RemoteError('setup', `no commit ${commit}`, { status: 404 });
    if (lose) throw lost();
    return { commit, tree: c.tree, files: this.git.filesOf(commit) };
  }

  async blobs(shas: readonly string[]): Promise<Map<string, string>> {
    this.calls.blobs++;
    this.calls.blobCount += shas.length;
    const lose = await this.enter('blobs');
    if (lose) throw lost();
    const out = new Map<string, string>();
    for (const sha of shas) {
      const text = this.git.blobs.get(sha);
      if (text !== undefined) out.set(sha, text);
    }
    return out;
  }

  async commit(request: CommitRequest): Promise<CommitResult> {
    this.calls.commit++;
    const lose = await this.enter('commit');
    const made = this.git.commitIfHead(request.parent.commit, request.message, request.add, request.remove);
    if (made === 'stale') return { ok: false, reason: 'stale' };
    if (lose) {
      this.faults.landedLost++;
      throw lost();
    }
    return { ok: true, commit: made.commit, tree: made.tree };
  }

  async commitsSince(head: string, base: string): Promise<RemoteCommit[]> {
    this.calls.commitsSince++;
    const lose = await this.enter('commitsSince');
    if (!this.git.commits.has(base)) throw new RemoteError('setup', `no commit ${base}`, { status: 404 });
    if (lose) throw lost();
    return this.git.since(head, base).map((c) => ({ sha: c.sha, message: c.message }));
  }

  /** Another writer's commit straight onto the branch (a Claude session, another device). */
  push(message: string, add: ReadonlyMap<string, string>, remove: readonly string[] = []): string {
    const made = this.git.commitIfHead(this.git.head, message, add, remove);
    if (made === 'stale') throw new Error('unreachable');
    return made.commit;
  }
}

const lost = () => new RemoteError('network', 'no answer (the connection dropped)');

function errorOf(fault: Exclude<Fault, { kind: 'lose' }>): RemoteError {
  switch (fault.kind) {
    case 'network':
      return new RemoteError('network', 'no answer (offline)');
    case 'auth':
      return new RemoteError('auth', 'the GitHub token is expired or revoked', { status: 401 });
    case 'rate': {
      const options: { status: number; retryAfterMs?: number } = { status: 429 };
      if (fault.retryAfterSec !== undefined) options.retryAfterMs = fault.retryAfterSec * 1000;
      return new RemoteError('rate', "GitHub's rate limit", options);
    }
    case 'server':
      return new RemoteError('server', 'GitHub answered 502', { status: 502 });
  }
}
