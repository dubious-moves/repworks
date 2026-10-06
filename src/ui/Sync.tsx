// The sync status line and the banners that need the owner (PLAN.md §4.9): synced / N changes
// waiting / offline / error, with the time of the last successful sync.
import { notice } from '../app/state.ts';
import { syncStatus, type SyncStatus } from '../app/sync.ts';
import { syncNow } from '../app/state.ts';

export function formatTime(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export function statusText(s: SyncStatus): string {
  const n = s.waiting.files + s.waiting.events;
  const waiting = n ? `${n} change${n === 1 ? '' : 's'} waiting` : '';
  switch (s.phase) {
    case 'setup':
      return 'not set up';
    case 'syncing':
      return 'syncing…';
    case 'offline':
      return waiting ? `offline · ${waiting}` : 'offline';
    case 'auth':
      return 'token refused';
    case 'rate':
      return 'GitHub limit: waiting';
    case 'busy':
      return 'busy: retrying soon';
    case 'error':
      return 'sync error';
    case 'idle':
      return waiting || (s.lastSynced ? `synced ${formatTime(s.lastSynced)}` : 'synced');
  }
}

export function SyncChip() {
  const s = syncStatus.value;
  const bad = s.phase === 'offline' || s.phase === 'auth' || s.phase === 'error' || s.phase === 'rate';
  return (
    <button type="button" class={bad ? 'chip chip-warn' : 'chip'} onClick={syncNow} title={s.message ?? 'Sync now'} data-phase={s.phase}>
      {statusText(s)}
    </button>
  );
}

export function SyncBanners() {
  const s = syncStatus.value;
  const n = notice.value;
  return (
    <>
      {s.phase === 'auth' && (
        <div class="banner banner-warn" role="alert">
          GitHub refused the token: it has expired or been revoked. Your local work is kept. Set this device up again with a new token (Settings below, or a new setup link).
        </div>
      )}
      {(s.phase === 'error' || s.phase === 'rate' || s.phase === 'busy') && s.message && (
        <div class="banner" role="status">
          {s.message}
        </div>
      )}
      {n && (
        <div class={n.kind === 'done' ? 'banner' : 'banner banner-warn'} role={n.kind === 'error' ? 'alert' : 'status'}>
          {n.message}
          <button type="button" onClick={() => (notice.value = undefined)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {s.conflicts.length > 0 && (
        <div class="banner banner-warn" role="status">
          The last sync merged {s.conflicts.length} conflict{s.conflicts.length === 1 ? '' : 's'}: {[...new Set(s.conflicts.map((c) => c.path))].join(', ')}.
        </div>
      )}
    </>
  );
}
