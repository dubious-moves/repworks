// The engine's settings (PLAN.md §5.31), per device, as Qchess's: depth, lines, the time limit,
// and the arrows; and the engine's files on this device.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ENGINE_PREFS, DEPTHS, enginePrefs, MOVETIMES, runningThreads, updateEnginePrefs, type EnginePrefs } from '../app/engine.ts';
import { isolated, wantIsolation } from '../platform/isolation.ts';
import { mode } from '../app/mode.ts';
import { EngineFiles } from './Engines.tsx';
import { maiaEloFor } from '../core/maia/encode.ts';
import { maiaPrefs, setMaiaPrefs } from '../app/maia.ts';
import { prefs as explorerPrefs } from '../app/explorer.ts';

const shown = signal(false);
/** Qchess's thread choices, as far as this device has cores. */
const THREADS = ([1, 2, 4, 8] as const).filter((n) => n === 1 || n <= (navigator.hardwareConcurrency || 1));
export const openEngineSettings = () => (shown.value = true);
const close = () => (shown.value = false);

export function EngineSettingsDialog() {
  const name = mode.value.name;
  useEffect(() => close, [name]);
  return shown.value ? <Dialog /> : null;
}

function Choice<T extends number>(props: { label: string; values: readonly T[]; value: T; format?: (v: T) => string; onPick(v: T): void }) {
  return (
    <fieldset>
      <legend>{props.label}</legend>
      <div class="chips" role="group" aria-label={props.label}>
        {props.values.map((v) => (
          <button key={v} type="button" aria-pressed={props.value === v} class={`chip-toggle${props.value === v ? ' on' : ''}`} onClick={() => props.onPick(v)}>
            {props.format ? props.format(v) : String(v)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Dialog() {
  const [draft, setDraft] = useState<EnginePrefs>(() => ({ ...enginePrefs.peek() }));
  const [rating, setRating] = useState(maiaPrefs.peek().rating);
  const filterElo = maiaEloFor(explorerPrefs.peek().ratings);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const save = () => {
    const { on: _on, ...rest } = draft;
    updateEnginePrefs(rest);
    setMaiaPrefs({ rating });
    close();
  };
  return (
    <dialog ref={ref} class="study-dialog engine-settings" aria-labelledby="dialog-engine-settings" onCancel={(e) => (e.preventDefault(), close())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => (e.preventDefault(), save())}>
        <h2 id="dialog-engine-settings">Engine settings</h2>
        <p class="muted">Stockfish 18 (lite), on this device. It stops at the depth or the time, whichever comes first; "+" searches on.</p>
        <Choice label="Depth" values={DEPTHS} value={draft.depth as (typeof DEPTHS)[number]} onPick={(depth) => setDraft({ ...draft, depth })} />
        <Choice label="Lines" values={[1, 2, 3, 4, 5] as const} value={draft.lines as 1} onPick={(lines) => setDraft({ ...draft, lines })} />
        <Choice label="Max time" values={MOVETIMES} value={draft.movetime as (typeof MOVETIMES)[number]} format={(s) => `${s} s`} onPick={(movetime) => setDraft({ ...draft, movetime })} />
        <Choice label="Threads" values={THREADS} value={draft.threads as 1} onPick={(threads) => setDraft({ ...draft, threads })} />
        {draft.threads > 1 && !isolated() && (
          <p class="muted" role="note">
            More than one thread needs the page isolated (the service worker does it, from the next load): save, then{' '}
            <button
              type="button"
              class="link"
              onClick={async () => {
                save();
                // The flag written first: the reload's responses read it.
                await wantIsolation(true);
                location.reload();
              }}
            >
              reload
            </button>
            .
          </p>
        )}
        {isolated() && <p class="muted">Running with {runningThreads()} thread{runningThreads() === 1 ? '' : 's'}.</p>}
        <label class="check">
          <input type="checkbox" checked={draft.arrows} onChange={(e) => setDraft({ ...draft, arrows: e.currentTarget.checked })} /> Arrows on the board
        </label>
        <label>
          Maia’s rating
          <select value={rating} onChange={(e) => setRating(Number(e.currentTarget.value))}>
            <option value={0}>As the explorer’s filter ({filterElo})</option>
            {Array.from({ length: 21 }, (_, i) => 600 + i * 100).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <EngineFiles />
        <div class="dialog-buttons">
          <button type="button" class="secondary" onClick={() => setDraft({ ...DEFAULT_ENGINE_PREFS, on: draft.on })}>
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
