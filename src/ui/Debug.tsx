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
import { trainData } from '../app/train.ts';
import { conflicts } from '../core/repertoire/index.ts';
import { TimeControl } from './TimeTravel.tsx';
import { EngineFiles } from './Engines.tsx';
import { isoDay } from './day.ts';

/** The repertoire index (§5.1, §5.7): its size and build time, positions with more than one own move, chapters left out. */
function Repertoire() {
  const data = trainData.value;
  if (!data) return null;
  const { index } = data;
  const list = conflicts(index);
  return (
    <>
      <h3>Time travel</h3>
      <TimeControl />
      <h3>Repertoire</h3>
      <p class="repertoire-stats">
        {index.cards.size} cards · {index.lines.length} lines · {index.positions.size} positions · index built in {Math.round(data.indexMs)} ms
      </p>
      {index.skipped.length > 0 && (
        <ul>
          {index.skipped.map((x) => (
            <li key={`${x.sid}/${x.cid}`}>
              {data.studyNames.get(x.sid) ?? x.sid} / {x.cid}: {x.reason}
            </li>
          ))}
        </ul>
      )}
      <h4>Positions with more than one repertoire move ({list.length})</h4>
      {list.length > 0 && (
        <ul class="repertoire-conflicts">
          {list.map(({ key, ucis }) => {
            const here = index.positions.get(key)!.own;
            const first = here.get(ucis[0]!)![0]!;
            const before = first.path.slice(0, -1);
            return (
              <li key={key}>
                <a href={`#/study/${first.sid}/${first.cid}?at=${before.map(encodeURIComponent).join(',')}`}>
                  {data.studyNames.get(first.sid) ?? first.sid}: {before.join(' ') || 'start'}
                </a>{' '}
                → {ucis.map((u) => here.get(u)![0]!.san).join(', ')}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

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
      <Repertoire />
      <EngineFiles />
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
                  <td>{c.due === undefined ? 'new' : isoDay(c.due, 16)}</td>
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
