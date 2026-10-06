// The ports the sync step works through (PLAN.md §4.9). Core holds the interfaces; src/platform
// implements them for the browser (GitHub over fetch, IndexedDB, the clock, Web Locks), and the
// tests fake them.

// ---------------------------------------------------------------------------------------------
// Remote: the data repo's branch on GitHub.

export interface RemoteHead {
  commit: string;
  etag: string;
}

export interface RemoteTree {
  commit: string;
  tree: string;
  /** path → blob SHA, every file in the commit. */
  files: Map<string, string>;
}

export interface CommitRequest {
  /** The commit the branch must point to for the commit to land, and its tree. */
  parent: { commit: string; tree: string };
  message: string;
  /** path → new content (UTF-8 text). */
  add: ReadonlyMap<string, string>;
  remove: readonly string[];
}

export type CommitResult = { ok: true; commit: string; tree: string } | { ok: false; reason: 'stale' };

export interface RemoteCommit {
  sha: string;
  message: string;
}

export interface Remote {
  /** The branch head; 'not-modified' when `etag` still matches (a 304, which is free). */
  head(etag?: string): Promise<RemoteHead | 'not-modified'>;
  /** Every file of a commit. */
  files(commit: string): Promise<RemoteTree>;
  /** Blob contents by SHA, as text. */
  blobs(shas: readonly string[]): Promise<Map<string, string>>;
  /** One commit on the branch, refused ('stale') unless the branch points to `parent.commit`. */
  commit(request: CommitRequest): Promise<CommitResult>;
  /** The commits reachable from `head` and not from `base`, oldest first (for lost answers). */
  commitsSince(head: string, base: string): Promise<RemoteCommit[]>;
}

/**
 * Why a remote call failed:
 * - auth: 401, the token is expired or revoked;
 * - rate: a rate limit (403 or 429), with how long to wait;
 * - network: no answer (offline, a timeout, a dropped connection). For a commit the outcome is
 *   unknown: it may have landed;
 * - server: GitHub answered 5xx, or something the adapter can't read. Also unknown for a commit;
 * - setup: the repo, the branch or the token's permissions aren't right (404, 409 for an empty
 *   repo, 403 without a rate limit).
 */
export type RemoteFailure = 'auth' | 'rate' | 'network' | 'server' | 'setup';

export class RemoteError extends Error {
  readonly reason: RemoteFailure;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(reason: RemoteFailure, message: string, options: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = 'RemoteError';
    this.reason = reason;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** Whether a commit that failed this way may still have landed. */
export const outcomeUnknown = (error: RemoteError) => error.reason === 'network' || error.reason === 'server';

// ---------------------------------------------------------------------------------------------
// LocalStore: the device's copy (IndexedDB in the app).

/** A working copy that differs from the base: its text, or null for a deleted file. */
export interface OverlayEntry {
  text: string | null;
  /** The edit counter's value when it was last written; edits during a sync are found by it. */
  rev: number;
}
export type Overlay = Map<string, OverlayEntry>;

/** The commit the working copies are based on. */
export interface SyncBase {
  commit: string;
  tree: string;
  /** path → blob SHA. The contents are in the blob store. */
  files: Map<string, string>;
}

/** A commit sent whose answer hasn't come back, kept until it is found or known to be lost. */
export interface PendingCommit {
  seq: number;
  /** The commit it was based on. */
  parent: string;
  /** Its files, path → blob SHA (contents in the blob store). */
  files: Map<string, string>;
  /** The working copies it was made from, and the edit counter then. */
  snapshot: Overlay;
  snapshotRev: number;
  /** The device's own events it uploads: every n up to this one. */
  uploadedThrough: number;
}

export interface Device {
  id: string;
  name: string;
}

export interface LocalState {
  device: Device;
  base: SyncBase | undefined;
  /** The ETag of the last read of the branch head, which was `base.commit`. */
  etag: string | undefined;
  /** Earlier bases, newest first: a head read that returns one of them is a lagging replica. */
  recent: string[];
  pending: PendingCommit[];
  /** The next commit's sequence number, for `repworks-sync: <device>:<seq>`. */
  seq: number;
  /** Own events up to this n are in the base's files. */
  uploadedThrough: number;
}

/** An own event not yet uploaded: its line exactly as it will be written. */
export interface LocalEvent {
  n: number;
  t: string;
  raw: string;
}

export interface Snapshot {
  /** The edit counter: every edit to a working copy raises it. */
  rev: number;
  overlay: Overlay;
  /** Own events after `uploadedThrough`, in n order. */
  events: LocalEvent[];
}

export interface Finish {
  base: SyncBase;
  /** The head's ETag when it is `base.commit`; undefined to forget it. */
  etag: string | undefined;
  overlay: Overlay;
  /** The edit counter the overlay was computed against: no write if it has moved. */
  expectRev: number;
  /** Raise the uploaded mark to this n (and drop those events from the local log). */
  uploadedThrough?: number;
  /** Forget every pending commit (one landed, so the others never will). */
  clearPending: boolean;
}

export interface LocalStore {
  state(): Promise<LocalState>;
  snapshot(): Promise<Snapshot>;
  /** The blobs the store holds among `shas`. */
  blobs(shas: Iterable<string>): Promise<Map<string, string>>;
  /** Those of `shas` the store doesn't hold (read without loading any content). */
  missing(shas: Iterable<string>): Promise<string[]>;
  putBlobs(texts: ReadonlyMap<string, string>): Promise<void>;
  setEtag(etag: string): Promise<void>;
  /** Records a commit about to be sent, and moves the sequence past it. */
  addPending(pending: PendingCommit): Promise<void>;
  dropPending(seq: number): Promise<void>;
  /**
   * Moves to a new base in one transaction: base, ETag, working copies, uploaded mark, pending
   * commits, and blobs no longer referenced. Returns false, writing nothing, if a working copy
   * was edited since `expectRev`; the caller recomputes and tries again.
   */
  finish(update: Finish): Promise<boolean>;
}

// ---------------------------------------------------------------------------------------------
// Clock and Locks.

export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface Locks {
  /** Runs `task` while holding the named lock, shared by every tab of the origin. */
  withLock<T>(name: string, task: () => Promise<T>): Promise<T>;
}
