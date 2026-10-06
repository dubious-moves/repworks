// The explorer's settings (PLAN.md §5.23, §5.24), per device: the Lichess filter as Qchess's panel
// has it (time controls, average ratings, the past 6 months), the Practical column's options as
// q_extension's popup has them, ChessDB analysis (off, D9) and the local explorer's address.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_PREFS, onWorker, postToWorker, prefs, RATINGS, setPrefs, SPEEDS, testLocalExplorer, type ExplorerPrefs } from '../app/explorer.ts';
import type { FromWorker } from '../core/explorer/service.ts';
import { lichessUser, logInWithLichess } from '../app/lichess.ts';
import { mode } from '../app/mode.ts';

const shown = signal(false);
export const openExplorerSettings = () => (shown.value = true);
const close = () => (shown.value = false);

export function ExplorerSettingsDialog() {
  const name = mode.value.name;
  useEffect(() => close, [name]);
  return shown.value ? <Dialog /> : null;
}

type NumberKey = 'riskAversion' | 'budget' | 'replyThreshold' | 'minGames' | 'reachFloor' | 'maxPly' | 'ownMargin' | 'ownMaxCandidates' | 'prepPriorGames';

// What each number may be, and what it says.
const NUMBERS: { key: NumberKey; label: string; min: number; max: number; step: number; advanced?: boolean }[] = [
  { key: 'riskAversion', label: 'Risk aversion (0: plain averages)', min: 0, max: 1, step: 0.01 },
  { key: 'budget', label: 'Lichess requests per position', min: 1, max: 1000, step: 1 },
  { key: 'replyThreshold', label: 'Replies followed from (% of games)', min: 0, max: 100, step: 0.5, advanced: true },
  { key: 'minGames', label: 'Fewest games for a value', min: 1, max: 100000, step: 1, advanced: true },
  { key: 'reachFloor', label: 'Lines followed while reached in (% of games)', min: 0, max: 100, step: 0.5, advanced: true },
  { key: 'maxPly', label: 'Depth limit (plies)', min: 2, max: 12, step: 1, advanced: true },
  { key: 'ownMargin', label: 'Your moves compared within (win% points)', min: 0, max: 50, step: 0.5, advanced: true },
  { key: 'ownMaxCandidates', label: 'Your moves compared, at most', min: 1, max: 10, step: 1, advanced: true },
  { key: 'prepPriorGames', label: 'Prepared score: trust in the Practical value (games)', min: 0, max: 10000, step: 1, advanced: true },
];

function Dialog() {
  const [draft, setDraft] = useState<ExplorerPrefs>(() => ({ ...prefs.peek() }));
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(() => Object.fromEntries(NUMBERS.map((n) => [n.key, String(prefs.peek()[n.key])])) as Record<NumberKey, string>);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tested, setTested] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const test = async () => {
    setTested({ ok: true, text: 'Asking…' });
    const r = await testLocalExplorer(draft.local);
    setTested(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
  };
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  // This tab's requests so far (q_extension's popup counters).
  const [stats, setStats] = useState<Extract<FromWorker, { type: 'stats' }> | undefined>(undefined);
  useEffect(() => {
    const stop = onWorker((m) => m.type === 'stats' && setStats(m));
    postToWorker({ type: 'stats' });
    return stop;
  }, []);
  const toggle = <T,>(list: readonly T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const save = () => {
    const out: Partial<ExplorerPrefs> = { ...draft };
    for (const n of NUMBERS) {
      const v = Number(numbers[n.key]);
      if (!(v >= n.min && v <= n.max)) return setError(`${n.label}: from ${n.min} to ${n.max}.`);
      out[n.key] = v;
    }
    if (!draft.speeds.length) return setError('Choose at least one time control.');
    if (!draft.ratings.length) return setError('Choose at least one rating.');
    setPrefs(out);
    close();
  };
  const user = lichessUser.value;
  const numberField = (n: (typeof NUMBERS)[number]) => (
    <label key={n.key}>
      {n.label}
      <input type="number" name={n.key} min={n.min} max={n.max} step={n.step} inputMode="decimal" value={numbers[n.key]} onInput={(e) => setNumbers({ ...numbers, [n.key]: e.currentTarget.value })} />
    </label>
  );
  return (
    <dialog ref={ref} class="study-dialog explorer-settings" aria-labelledby="dialog-explorer-settings" onCancel={(e) => (e.preventDefault(), close())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => (e.preventDefault(), save())}>
        <h2 id="dialog-explorer-settings">Explorer settings</h2>
        <p class="muted">
          {user === undefined ? (
            <>
              Lichess’s explorer needs a login.{' '}
              <button type="button" class="link" onClick={() => void logInWithLichess(location.hash)}>
                Log in with Lichess
              </button>
            </>
          ) : (
            <>Logged in with Lichess{user ? ` as ${user}` : ''}. These settings are this device’s.</>
          )}
        </p>
        <fieldset>
          <legend>Time control</legend>
          <div class="chips" role="group" aria-label="Time control">
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={draft.speeds.includes(s)} class={`chip-toggle${draft.speeds.includes(s) ? ' on' : ''}`} onClick={() => setDraft({ ...draft, speeds: toggle(draft.speeds, s) })}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Average rating</legend>
          <div class="chips" role="group" aria-label="Average rating">
            {RATINGS.map((r) => (
              <button key={r} type="button" aria-pressed={draft.ratings.includes(r)} class={`chip-toggle${draft.ratings.includes(r) ? ' on' : ''}`} onClick={() => setDraft({ ...draft, ratings: toggle(draft.ratings, r) })}>
                {r}
              </button>
            ))}
          </div>
        </fieldset>
        <label class="check">
          <input type="checkbox" name="recent" checked={draft.recent} onChange={(e) => setDraft({ ...draft, recent: e.currentTarget.checked })} />
          Only games from the past 6 months
        </label>
        <fieldset>
          <legend>Practical column</legend>
          <label class="check">
            <input type="checkbox" name="practical" checked={draft.practical} onChange={(e) => setDraft({ ...draft, practical: e.currentTarget.checked })} />
            Your expected score against the filter’s players, on your moves
          </label>
          <label class="check">
            <input type="checkbox" name="practicalMaia" checked={draft.practicalMaia} onChange={(e) => setDraft({ ...draft, practicalMaia: e.currentTarget.checked })} />
            With Maia on: its predictions fill in where there are under 100 games
          </label>
          <label class="check">
            <input type="checkbox" name="maiaPreview" checked={draft.maiaPreview} onChange={(e) => setDraft({ ...draft, maiaPreview: e.currentTarget.checked })} />
            Maia’s preview beside it (the Prac title switches to it)
          </label>
          {NUMBERS.filter((n) => !n.advanced).map(numberField)}
          <details>
            <summary>Advanced</summary>
            {NUMBERS.filter((n) => n.advanced).map(numberField)}
          </details>
          <label class="check">
            <input type="checkbox" name="analyse" checked={draft.analyse} onChange={(e) => setDraft({ ...draft, analyse: e.currentTarget.checked })} />
            Ask ChessDB to analyse positions it doesn’t know (uses its volunteers’ computers)
          </label>
        </fieldset>
        <label>
          Local explorer <span class="muted">(q_extension’s explorerdb serve, e.g. localhost:9337; empty: Lichess)</span>
          <span class="local-explorer">
            <input
              type="text"
              name="local"
              placeholder="localhost:9337"
              autoComplete="off"
              spellcheck={false}
              value={draft.local}
              onInput={(e) => (setDraft({ ...draft, local: e.currentTarget.value.trim() }), setTested(undefined))}
            />
            <button type="button" class="secondary" disabled={!draft.local} onClick={() => void test()}>
              Test
            </button>
          </span>
        </label>
        {tested && (
          <p class={tested.ok ? 'muted local-tested' : 'warn local-tested'} role={tested.ok ? 'status' : 'alert'}>
            {tested.text}
          </p>
        )}
        {draft.local && <p class="muted">Set, the Lichess tab shows its games (named Local), asked with no login, no rate limit and no request budget; Masters stays Lichess’s.</p>}
        {stats && (
          <p class="muted explorer-stats">
            This tab: {stats.stats.explorerRequests ?? 0} Lichess requests ({stats.stats.explorer429 ?? 0} refused for speed), {stats.stats.chessdbRequests ?? 0} ChessDB lookups
            {stats.stats.chessdbAnalyse ? `, ${stats.stats.chessdbAnalyse} analysis requests` : ''}
            {stats.stats.localRequests ? `, ${stats.stats.localRequests} local` : ''}; cached {stats.cache?.['explorer'] ?? 0} explorer and {stats.cache?.['chessdb'] ?? 0} ChessDB answers
            {stats.pausedFor > 0 ? `; Lichess paused for ${Math.ceil(stats.pausedFor / 1000)} s` : ''}.
          </p>
        )}
        {error && (
          <p class="warn" role="alert">
            {error}
          </p>
        )}
        <div class="dialog-buttons">
          <button
            type="button"
            class="secondary"
            onClick={() => {
              setDraft({ ...DEFAULT_PREFS, on: draft.on, tab: draft.tab, sort: draft.sort });
              setNumbers(Object.fromEntries(NUMBERS.map((n) => [n.key, String(DEFAULT_PREFS[n.key])])) as Record<NumberKey, string>);
            }}
          >
            Defaults
          </button>
          <span class="spacer" />
          <button type="button" class="secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" class="primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
