// The sync loop (PLAN.md §4.9): runs the sync step when the schedule says, under a Web Lock so
// two tabs never sync at once, and tells the other tabs what changed over a BroadcastChannel.
// Its state is a signal the status line reads.
import { signal } from '@preact/signals';
import type { FileConflict } from '../core/merge/files.ts';
import { newId } from '../core/study/ids.ts';
import type { Remote } from '../core/sync/ports.ts';
import { Schedule, type Trigger } from '../core/sync/schedule.ts';
import { failedSync, sync, type SyncOutcome } from '../core/sync/step.ts';
import { browserClock, cryptoRandom, webLocks } from '../platform/browser.ts';
import { repoInfo, type GithubConfig, type RequestInfo } from '../platform/github.ts';
import { graphqlRemote } from '../platform/githubGraphql.ts';
import { restRemote } from '../platform/githubRest.ts';
import type { IdbStore, RemoteSettings } from '../platform/idbStore.ts';
import { countRequest } from './requests.ts';

export type Phase = 'setup' | 'idle' | 'syncing' | 'offline' | 'auth' | 'rate' | 'busy' | 'error';

export interface SyncStatus {
  phase: Phase;
  waiting: { files: number; events: number };
  lastSynced: number | undefined;
  message: string | undefined;
  /** What the last sync's merges flagged. */
  conflicts: FileConflict[];
}

export const syncStatus = signal<SyncStatus>({ phase: 'setup', waiting: { files: 0, events: 0 }, lastSynced: undefined, message: undefined, conflicts: [] });
/** Raised whenever the working view may have changed (a pull here, an edit or sync in another tab). */
export const dataVersion = signal(0);

type Message = { type: 'changed' } | { type: 'synced'; pulled: boolean };

const LOCK = 'repworks-sync';

export class SyncController {
  private readonly store: IdbStore;
  private readonly schedule = new Schedule();
  private readonly channel: BroadcastChannel | undefined;
  private settings: RemoteSettings | undefined;
  private remote: Remote | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private started = false;

  constructor(store: IdbStore) {
    this.store = store;
    this.channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('repworks');
    this.channel?.addEventListener('message', (e: MessageEvent<Message>) => void this.heard(e.data));
  }

  /** Starts syncing if this device is set up; safe to call again after setup. */
  async start(): Promise<void> {
    this.settings = await this.store.remote();
    this.remote = undefined;
    await this.refresh();
    if (!this.settings) {
      this.update({ phase: 'setup' });
      return;
    }
    if (syncStatus.value.phase === 'setup') this.update(navigator.onLine ? { phase: 'idle', message: undefined } : { phase: 'offline', message: 'no network' });
    if (!this.started) {
      this.started = true;
      document.addEventListener('visibilitychange', () => this.trigger(document.visibilityState === 'visible' ? 'visible' : 'hidden'));
      addEventListener('focus', () => this.trigger('focus'));
      addEventListener('online', () => this.trigger('online'));
      addEventListener('offline', () => this.trigger('offline'));
      if (!navigator.onLine) this.schedule.note('offline', Date.now());
      this.trigger('start');
    } else this.trigger('setup');
  }

  /** A working copy or the event log changed in this tab. */
  async changed(): Promise<void> {
    this.channel?.postMessage({ type: 'changed' } satisfies Message);
    await this.refresh();
    dataVersion.value++;
    this.trigger('change');
  }

  syncNow(): void {
    this.trigger('manual');
  }

  trigger(trigger: Trigger): void {
    this.schedule.note(trigger, Date.now());
    if (trigger === 'offline') this.update({ phase: 'offline', message: 'no network' });
    this.arm();
  }

  private async heard(message: Message): Promise<void> {
    await this.refresh();
    dataVersion.value++;
    if (message.type === 'changed') this.schedule.note('change', Date.now());
    else this.schedule.ended('synced', Date.now());
    this.arm();
  }

  private arm(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.settings || this.running) return;
    const now = Date.now();
    const due = this.schedule.next(now);
    if (!due) return;
    this.timer = setTimeout(() => void this.run(due.push), Math.max(0, due.at - now));
  }

  private update(patch: Partial<SyncStatus>): void {
    syncStatus.value = { ...syncStatus.value, ...patch };
  }

  private async refresh(): Promise<void> {
    if (!(await this.store.device())) return;
    const [waiting, lastSynced] = await Promise.all([this.store.waiting(), this.store.lastSynced()]);
    this.update({ waiting, lastSynced });
    this.schedule.setDirty(waiting.files + waiting.events > 0);
  }

  private config(settings: RemoteSettings): GithubConfig {
    return { repo: settings.repo, branch: settings.branch, token: settings.token, onRequest: (info: RequestInfo) => countRequest(info) };
  }

  /** The remote, resolving the default branch first if setup couldn't (offline then). */
  private async remoteFor(settings: RemoteSettings): Promise<Remote> {
    if (this.remote) return this.remote;
    if (settings.branch === '') {
      const info = await repoInfo(this.config(settings));
      settings = { ...settings, branch: info.defaultBranch, private: info.private };
      await this.store.setRemote(settings);
      this.settings = settings;
    }
    const config = this.config(settings);
    this.remote = settings.write === 'rest' ? restRemote(config) : graphqlRemote(config);
    return this.remote;
  }

  private async run(push: boolean): Promise<void> {
    if (this.running || !this.settings) return;
    this.running = true;
    this.update({ phase: 'syncing', message: undefined });
    let outcome: SyncOutcome | undefined;
    try {
      outcome = await webLocks.withLock(LOCK, async () => {
        const remote = await this.remoteFor(this.settings!);
        return sync({ remote, store: this.store, clock: browserClock, newId: () => newId(cryptoRandom), random: cryptoRandom }, { push });
      });
    } catch (error) {
      // Resolving the branch failed before the step ran: sorted the same way.
      outcome = failedSync(error);
    }
    const now = Date.now();
    this.schedule.ended(outcome.kind, now, { pushed: outcome.pushed, retryAfterMs: outcome.kind === 'rate' ? outcome.retryAfterMs : undefined });
    if (outcome.kind === 'synced') await this.store.setLastSynced(now);
    if (outcome.kind === 'error' && outcome.cause) console.error('sync failed', outcome.cause);
    await this.refresh();
    if (outcome.pulled || outcome.pushed || outcome.adopted) {
      dataVersion.value++;
      this.channel?.postMessage({ type: 'synced', pulled: outcome.pulled } satisfies Message);
    }
    this.update({
      phase: outcome.kind === 'synced' ? 'idle' : outcome.kind,
      message: outcome.kind === 'synced' ? undefined : outcome.message,
      conflicts: outcome.conflicts.length ? outcome.conflicts : outcome.kind === 'synced' && outcome.pulled ? [] : syncStatus.value.conflicts,
    });
    this.running = false;
    this.arm();
  }
}
