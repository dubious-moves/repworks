// The sync step (PLAN.md §4.9): pull, then push, through the ports. The caller holds the sync
// lock (one tab at a time) and decides when to run it.
//
// Pull: read the head (a conditional GET, free when nothing changed). If it moved, fetch its
// tree and the blobs not held yet, merge the working view (base + working copies) with it
// three-way, and make the head the new base, with whatever of ours the head doesn't have left
// as working copies.
//
// Push: write the working copies and the device's new events (into its day files, closed months
// compacted) as one commit on the base. Stale → pull again (merging what came in) and retry,
// with backoff, a few times.
//
// Lost answers: every commit is recorded before it is sent, with the snapshot it came from. If
// the answer never comes, the next pull looks for its `repworks-sync: <device>:<seq>` line in
// the commits since the base, and adopts the commit if it landed instead of merging the same
// changes in again (which would nest conflict markers).
//
// Edits made while a sync runs aren't lost: the step finishes by rebasing the working copies
// (rebase in trees.ts), and the store writes the result only if nothing was edited since it
// was computed; otherwise it is computed again.
import { DATA_FORMAT, FORMAT_FILE, utcDay, utcMonth } from '../data/layout.ts';
import type { FileConflict, FileMergeContext } from '../merge/files.ts';
import { authors, commitMessage, syncId } from './message.ts';
import { outcomeUnknown, RemoteError, type Clock, type CommitResult, type Finish, type LocalState, type LocalStore, type PendingCommit, type Remote, type RemoteCommit } from './ports.ts';
import { addProgress, applyOverlay, declaredFormat, diffTrees, ensureFiles, mergeNeeds, mergeTrees, progressNeeds, rebase, rebaseNeeds, summarize, type Files, type RebaseInput } from './trees.ts';

export interface SyncPorts {
  remote: Remote;
  store: LocalStore;
  clock: Clock;
  /** IDs for chapters a merge creates (conflict copies). */
  newId: () => string;
  /** [0, 1), for the jitter between retries. */
  random: () => number;
}

export interface SyncOptions {
  /** Commit local changes; false pulls only. */
  push: boolean;
  /** Stale commits in a row before giving up until the next sync (§4.9: 5). */
  maxAttempts?: number;
}

export interface SyncReport {
  pulled: boolean;
  pushed: boolean;
  /** Commits whose answer was lost, found on the branch and adopted. */
  adopted: number;
  conflicts: FileConflict[];
  /** This device's progress files that someone else had changed: their lines were kept. */
  ownFilesChanged: string[];
}

/** How a sync ended; the report says what it did before that, whatever the ending. */
export type SyncOutcome = SyncReport &
  (
    | { kind: 'synced' }
    | { kind: 'offline'; message: string }
    | { kind: 'auth'; message: string }
    | { kind: 'rate'; retryAfterMs: number | undefined; message: string }
    | { kind: 'busy'; message: string }
    | { kind: 'error'; message: string; cause?: unknown }
  );

/** The data repo declares a format this version doesn't write. */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

export async function sync(ports: SyncPorts, options: SyncOptions): Promise<SyncOutcome> {
  const report: SyncReport = { pulled: false, pushed: false, adopted: 0, conflicts: [], ownFilesChanged: [] };
  const run = new Run(ports, report);
  const maxAttempts = options.maxAttempts ?? 5;
  try {
    for (let attempt = 1; ; attempt++) {
      await run.pull();
      if (!options.push) break;
      if ((await run.push()) !== 'stale') break;
      if (attempt >= maxAttempts) return { ...report, kind: 'busy', message: `the data repo changed under ${attempt} commits in a row; trying again later` };
      await ports.clock.sleep(Math.round(1000 * 2 ** (attempt - 1) * (1 + ports.random())));
    }
  } catch (error) {
    return { ...report, ...failure(error) };
  }
  return { ...report, kind: 'synced' };
}

/** The outcome of a sync that failed before the step ran (resolving the branch, say). */
export function failedSync(error: unknown): SyncOutcome {
  return { pulled: false, pushed: false, adopted: 0, conflicts: [], ownFilesChanged: [], ...failure(error) };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Failure = DistributiveOmit<Exclude<SyncOutcome, { kind: 'synced' }>, keyof SyncReport>;

function failure(error: unknown): Failure {
  if (error instanceof RemoteError) {
    switch (error.reason) {
      case 'auth':
        return { kind: 'auth', message: error.message };
      case 'rate':
        return { kind: 'rate', retryAfterMs: error.retryAfterMs, message: error.message };
      case 'network':
        return { kind: 'offline', message: error.message };
      default:
        return { kind: 'error', message: error.message };
    }
  }
  if (error instanceof FormatError) return { kind: 'error', message: error.message };
  return { kind: 'error', message: `unexpected: ${String(error)}`, cause: error };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** One sync's state: the blobs read so far, and the report. */
class Run {
  private readonly ports: SyncPorts;
  private readonly report: SyncReport;
  private readonly cache = new Map<string, string>();

  constructor(ports: SyncPorts, report: SyncReport) {
    this.ports = ports;
    this.report = report;
  }

  private readonly text = (sha: string): string => {
    const t = this.cache.get(sha);
    if (t === undefined) throw new Error(`blob ${sha} wasn't loaded`);
    return t;
  };

  /** Loads blobs into the cache: from the store, else from the remote (and stores them). */
  private async need(shas: Iterable<string | undefined>): Promise<void> {
    const wanted = [...new Set(shas)].filter((s): s is string => s !== undefined && !this.cache.has(s));
    if (!wanted.length) return;
    for (const [sha, t] of await this.ports.store.blobs(wanted)) this.cache.set(sha, t);
    const missing = wanted.filter((s) => !this.cache.has(s));
    if (missing.length) await this.download(missing);
  }

  private async download(shas: readonly string[]): Promise<void> {
    const fetched = await this.ports.remote.blobs(shas);
    const absent = shas.filter((s) => !fetched.has(s));
    if (absent.length) throw new RemoteError('server', `the remote didn't return ${absent.length} blob(s), e.g. ${absent[0]}`);
    await this.ports.store.putBlobs(fetched);
    for (const [sha, t] of fetched) this.cache.set(sha, t);
  }

  private remember(texts: ReadonlyMap<string, string>): void {
    for (const [sha, t] of texts) this.cache.set(sha, t);
  }

  private context(state: LocalState, theirs: string): FileMergeContext {
    const day = utcDay(iso(this.ports.clock.now()));
    return { labels: { ours: `${state.device.name} ${day}`, theirs: `${theirs} ${day}` }, device: state.device.id, newId: this.ports.newId };
  }

  private async checkFormat(files: Files): Promise<void> {
    const sha = files.get(FORMAT_FILE);
    await this.need([sha]);
    const format = declaredFormat(sha === undefined ? undefined : this.text(sha));
    if (format === 'missing' || format === DATA_FORMAT) return;
    throw new FormatError(
      format === 'unreadable'
        ? `${FORMAT_FILE} in the data repo can't be read: nothing is written until it is fixed`
        : `the data repo is format ${format} and this version of the app writes format ${DATA_FORMAT}: reload the app to update it`,
    );
  }

  /** Moves to a new base, rebasing the working copies; again if they were edited meanwhile. */
  private async finish(parts: Omit<RebaseInput, 'current'>, ctx: FileMergeContext, update: Omit<Finish, 'overlay' | 'expectRev'>): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const now = await this.ports.store.snapshot();
      const input: RebaseInput = { ...parts, current: now.overlay };
      await this.need(rebaseNeeds(input));
      const overlay = rebase(input, this.text, ctx);
      if (await this.ports.store.finish({ ...update, overlay, expectRev: now.rev })) return;
    }
    throw new Error('the working copies kept changing while the sync tried to finish');
  }

  async pull(): Promise<void> {
    const { remote, store, clock } = this.ports;
    let state = await store.state();
    let head = await remote.head(state.base ? state.etag : undefined);
    if (head === 'not-modified') return;
    // A replica that hasn't caught up with the last commit answers with an earlier base: ask again.
    for (let wait = 1; wait <= 2 && state.recent.includes(head.commit); wait++) {
      await clock.sleep(1000 * wait);
      const again = await remote.head();
      if (again !== 'not-modified') head = again;
    }
    if (state.base?.commit === head.commit) {
      await store.setEtag(head.etag);
      return;
    }
    let snap = await store.snapshot();
    let since: RemoteCommit[] = [];
    if (state.base && (state.pending.length > 0 || snap.overlay.size > 0)) since = await this.commitsSince(head.commit, state.base.commit);

    const landed = findLanded(state, since);
    if (landed) {
      await this.adopt(state, landed.pending, landed.sha);
      this.report.adopted++;
      state = await store.state();
      if (state.base?.commit === head.commit) {
        await store.setEtag(head.etag);
        return;
      }
      snap = await store.snapshot();
    }

    const theirs = await remote.files(head.commit);
    const missing = await store.missing(theirs.files.values());
    if (missing.length) await this.download(missing);
    await this.checkFormat(theirs.files);
    const base = state.base?.files ?? new Map<string, string>();
    const ours = applyOverlay(base, snap.overlay);
    this.remember(ours.texts);
    const sides = { base, ours: ours.files, theirs: theirs.files };
    await this.need(mergeNeeds(sides, state.device.id).shas);
    const ctx = this.context(state, authors(since.filter((c) => syncId(c.message)?.device !== state.device.id)));
    const merged = mergeTrees(sides, this.text, ctx);
    ensureFiles(merged.files, merged.texts, state.device, iso(clock.now()));
    this.remember(merged.texts);
    this.report.conflicts.push(...merged.conflicts);
    this.report.ownFilesChanged.push(...merged.ownFilesChanged);
    await this.finish({ snapshot: snap.overlay, before: base, result: merged.files, next: theirs.files }, ctx, {
      base: { commit: head.commit, tree: theirs.tree, files: theirs.files },
      etag: head.etag,
      // Anything still pending was based on the old base, which the branch has moved past
      // without it: it can no longer land.
      clearPending: true,
    });
    this.report.pulled = true;
  }

  /** The commits since `base`, or none if GitHub no longer knows `base` (history rewritten). */
  private async commitsSince(head: string, base: string): Promise<RemoteCommit[]> {
    try {
      return await this.ports.remote.commitsSince(head, base);
    } catch (error) {
      if (error instanceof RemoteError && error.reason === 'setup') return [];
      throw error;
    }
  }

  /** Makes a commit whose answer was lost the base, as if the answer had come. */
  private async adopt(state: LocalState, pending: PendingCommit, sha: string): Promise<void> {
    const tree = await this.ports.remote.files(sha);
    const missing = await this.ports.store.missing(tree.files.values());
    if (missing.length) await this.download(missing);
    const ctx = this.context(state, state.device.name);
    await this.finish({ snapshot: pending.snapshot, before: state.base!.files, result: tree.files, next: tree.files }, ctx, {
      base: { commit: sha, tree: tree.tree, files: tree.files },
      etag: undefined,
      uploadedThrough: pending.uploadedThrough,
      clearPending: true,
    });
  }

  async push(): Promise<'nothing' | 'pushed' | 'stale'> {
    const { remote, store, clock } = this.ports;
    const state = await store.state();
    const base = state.base;
    if (!base) throw new Error('push before the first pull');
    const snap = await store.snapshot();
    await this.checkFormat(base.files);
    const ours = applyOverlay(base.files, snap.overlay);
    this.remember(ours.texts);
    const month = utcMonth(iso(clock.now()));
    await this.need(progressNeeds(ours.files, state.device.id, snap.events, month));
    addProgress(ours.files, ours.texts, this.text, state.device.id, snap.events, month);
    this.remember(ours.texts);
    const diff = diffTrees(base.files, ours.files, this.text);
    const uploadedThrough = snap.events.length ? snap.events[snap.events.length - 1]!.n : state.uploadedThrough;
    const ctx = this.context(state, 'remote');
    const parts = { snapshot: snap.overlay, before: base.files, result: ours.files };

    if (diff.add.size === 0 && diff.remove.length === 0) {
      // Nothing the base doesn't have: tidy working copies that equal it, and mark the events.
      if (snap.overlay.size > 0 || snap.events.length > 0) await this.finish({ ...parts, next: base.files }, ctx, { base, etag: state.etag, uploadedThrough, clearPending: false });
      return 'nothing';
    }

    const pending: PendingCommit = { seq: state.seq, parent: base.commit, files: ours.files, snapshot: snap.overlay, snapshotRev: snap.rev, uploadedThrough };
    await store.putBlobs(new Map([...diff.add.keys()].map((path) => [ours.files.get(path)!, diff.add.get(path)!])));
    await store.addPending(pending);
    const message = commitMessage(state.device.name, state.device.id, pending.seq, summarize(diff, snap.events.length));
    let result: CommitResult;
    try {
      result = await remote.commit({ parent: { commit: base.commit, tree: base.tree }, message, add: diff.add, remove: diff.remove });
    } catch (error) {
      // Refused: it can't land, so forget it. No answer: it may have landed; the next pull looks.
      if (!(error instanceof RemoteError) || !outcomeUnknown(error)) await store.dropPending(pending.seq);
      throw error;
    }
    if (!result.ok) {
      await store.dropPending(pending.seq);
      return 'stale';
    }
    await this.finish({ ...parts, next: ours.files }, ctx, {
      base: { commit: result.commit, tree: result.tree, files: ours.files },
      etag: undefined,
      uploadedThrough,
      clearPending: true,
    });
    this.report.pushed = true;
    return 'pushed';
  }
}

/** The newest pending commit of this device among `since`. */
function findLanded(state: LocalState, since: readonly RemoteCommit[]): { pending: PendingCommit; sha: string } | undefined {
  let found: { pending: PendingCommit; sha: string } | undefined;
  for (const c of since) {
    const id = syncId(c.message);
    if (!id || id.device !== state.device.id) continue;
    const pending = state.pending.find((p) => p.seq === id.seq && p.parent === state.base?.commit);
    if (pending) found = { pending, sha: c.sha };
  }
  return found;
}
