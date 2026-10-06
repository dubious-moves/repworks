// The LocalStore port in memory, with IndexedDB's copy semantics (every read and write is a
// structured clone), plus the app's side of it: edits to working copies and recorded events.
import { formatEvent, type KnownEvent } from '../../src/core/progress/events.ts';
import type { Device, Finish, LocalEvent, LocalState, LocalStore, Overlay, PendingCommit, Snapshot, SyncBase } from '../../src/core/sync/ports.ts';

export class MemoryStore implements LocalStore {
  device: Device;
  base: SyncBase | undefined;
  etag: string | undefined;
  recent: string[] = [];
  pending: PendingCommit[] = [];
  seq = 1;
  uploadedThrough = 0;
  rev = 0;
  overlay: Overlay = new Map();
  /** Own events not yet known to be uploaded. */
  events: LocalEvent[] = [];
  nextN = 1;
  readonly blobStore = new Map<string, string>();

  constructor(device: Device) {
    this.device = device;
  }

  // ---- the app's side ----------------------------------------------------------------------

  edit(path: string, text: string | null): void {
    this.rev++;
    this.overlay.set(path, { text, rev: this.rev });
  }

  record(t: string, k: KnownEvent['k'], card: string, g: 1 | 2 | 3 | 4 = 3): LocalEvent {
    const n = this.nextN++;
    const event = (k === 'review' ? { v: 1, n, t, k, card, g } : { v: 1, n, t, k, card }) as KnownEvent;
    const e: LocalEvent = { n, t, raw: formatEvent(event) };
    this.events.push(e);
    return e;
  }

  /** The working view: path → text. */
  view(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [path, sha] of this.base?.files ?? []) out.set(path, this.blobStore.get(sha)!);
    for (const [path, entry] of this.overlay) {
      if (entry.text === null) out.delete(path);
      else out.set(path, entry.text);
    }
    return out;
  }

  // ---- the port ----------------------------------------------------------------------------

  async state(): Promise<LocalState> {
    return structuredClone({ device: this.device, base: this.base, etag: this.etag, recent: this.recent, pending: this.pending, seq: this.seq, uploadedThrough: this.uploadedThrough });
  }

  async snapshot(): Promise<Snapshot> {
    return structuredClone({ rev: this.rev, overlay: this.overlay, events: this.events.filter((e) => e.n > this.uploadedThrough) });
  }

  async blobs(shas: Iterable<string>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const sha of shas) {
      const text = this.blobStore.get(sha);
      if (text !== undefined) out.set(sha, text);
    }
    return out;
  }

  async missing(shas: Iterable<string>): Promise<string[]> {
    return [...new Set(shas)].filter((sha) => !this.blobStore.has(sha));
  }

  async putBlobs(texts: ReadonlyMap<string, string>): Promise<void> {
    for (const [sha, text] of texts) this.blobStore.set(sha, text);
  }

  async setEtag(etag: string): Promise<void> {
    this.etag = etag;
  }

  async addPending(pending: PendingCommit): Promise<void> {
    this.pending.push(structuredClone(pending));
    this.seq = Math.max(this.seq, pending.seq + 1);
  }

  async dropPending(seq: number): Promise<void> {
    this.pending = this.pending.filter((p) => p.seq !== seq);
    this.sweep();
  }

  async finish(update: Finish): Promise<boolean> {
    if (update.expectRev !== this.rev) return false;
    const old = this.base?.commit;
    if (old !== undefined && old !== update.base.commit) this.recent = [old, ...this.recent.filter((c) => c !== old)].slice(0, 10);
    this.base = structuredClone(update.base);
    this.etag = update.etag;
    this.overlay = structuredClone(update.overlay);
    if (update.uploadedThrough !== undefined && update.uploadedThrough > this.uploadedThrough) {
      this.uploadedThrough = update.uploadedThrough;
      this.events = this.events.filter((e) => e.n > this.uploadedThrough);
    }
    if (update.clearPending) this.pending = [];
    this.sweep();
    return true;
  }

  /** Drops blobs neither the base nor a pending commit refers to. */
  private sweep(): void {
    const keep = new Set([...(this.base?.files.values() ?? []), ...this.pending.flatMap((p) => [...p.files.values()])]);
    for (const sha of this.blobStore.keys()) if (!keep.has(sha)) this.blobStore.delete(sha);
  }
}

export class FakeClock {
  t: number;
  constructor(iso = '2026-10-05T12:00:00.000Z') {
    this.t = Date.parse(iso);
  }
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.t += ms;
  }
  iso(): string {
    return new Date(this.t).toISOString();
  }
}
