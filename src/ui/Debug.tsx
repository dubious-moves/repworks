// The debug panel (PLAN.md §4.9, §4.11): this device, its remote and base, what is waiting, and
// the day's GitHub requests against the limits; buttons to sync and to record a test review.
import { useEffect, useState } from 'preact/hooks';
import { requestCounts } from '../app/requests.ts';
import { device, localStore, recordTestReview, settings, syncNow } from '../app/state.ts';
import { dataVersion, syncStatus } from '../app/sync.ts';
import { cardStates, type CardRow } from '../app/overview.ts';
import type { LocalState } from '../core/sync/ports.ts';
import { OtherDeviceCode, SetupForm } from './Setup.tsx';
import { formatTime } from './Sync.tsx';

export function Debug() {
  const [state, setState] = useState<LocalState | undefined>(undefined);
  const [cards, setCards] = useState<CardRow[]>([]);
  const version = dataVersion.value;
  const phase = syncStatus.value.phase;
  useEffect(() => {
    const store = localStore();
    void store?.state().then(setState, () => setState(undefined));
    if (store) void cardStates(store).then(setCards, () => setCards([]));
  }, [version, phase]);
  const d = device.value;
  const r = settings.value;
  const s = syncStatus.value;
  const c = requestCounts.value;
  return (
    <details class="card debug">
      <summary>Settings and debug</summary>
      <dl>
        <dt>Device</dt>
        <dd>
          {d?.name} <code>{d?.id}</code>
        </dd>
        <dt>Data repo</dt>
        <dd>
          {r?.repo} <code>{r?.branch || '(branch not read yet)'}</code> · writes via {r?.write === 'rest' ? 'REST' : 'GraphQL'}
          {r?.private === false && <strong class="warn"> · public!</strong>}
        </dd>
        <dt>Base commit</dt>
        <dd>
          <code>{state?.base?.commit.slice(0, 10) ?? 'none yet'}</code>
          {state?.base && <> · {state.base.files.size} files</>}
        </dd>
        <dt>Last sync</dt>
        <dd>{s.lastSynced ? formatTime(s.lastSynced) : 'never'}</dd>
        <dt>Waiting</dt>
        <dd>
          {s.waiting.files} file(s), {s.waiting.events} event(s){state?.pending.length ? ` · ${state.pending.length} commit(s) awaiting an answer` : ''}
        </dd>
        <dt>Requests today</dt>
        <dd>
          {c.total} ({c.notModified} answered 304, {c.writes} writes, {c.failed} failed){c.rateRemaining !== undefined && <> · {c.rateRemaining} left this hour ({c.rateResource})</>}
        </dd>
      </dl>
      {Object.keys(c.byRoute).length > 0 && (
        <ul class="routes">
          {Object.entries(c.byRoute)
            .sort(([, a], [, b]) => b - a)
            .map(([route, n]) => (
              <li key={route}>
                <code>{route}</code> {n}
              </li>
            ))}
        </ul>
      )}
      <div class="actions">
        <button type="button" onClick={syncNow}>
          Sync now
        </button>
        <button type="button" onClick={() => void recordTestReview()}>
          Record a test review
        </button>
      </div>
      <h3>Card states (replay of every device's log)</h3>
      {cards.length === 0 ? (
        <p class="muted">No reviews yet.</p>
      ) : (
        <div class="table-scroll">
          <table class="cards">
            <thead>
              <tr>
                <th>Card</th>
                <th>Reviews</th>
                <th>Due</th>
                <th>Stability</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.card}>
                  <td>
                    <code>{c.card}</code>
                    {c.suspended && ' (suspended)'}
                  </td>
                  <td>{c.reviews}</td>
                  <td>{c.due === undefined ? 'new' : new Date(c.due).toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td>{c.stability.toFixed(4)}</td>
                  <td>{c.difficulty.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OtherDeviceCode />
      <SetupForm title="Change the token" />
    </details>
  );
}
