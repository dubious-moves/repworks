// The engine's settings (PLAN.md §5.31), per device, as Qchess's: depth, lines, the time limit,
// and the arrows; and the engine's files on this device.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ENGINE_PREFS, DEPTHS, enginePrefs, MOVETIMES, runningThreads, updateEnginePrefs, type EnginePrefs } from '../app/engine.ts';
import { isolated, wantIsolation } from '../platform/isolation.ts';
import { STOCKFISH_VERSIONS, stockfishFiles, stockfishName } from '../platform/stockfish.ts';
import { mode } from '../app/mode.ts';
import { EngineFiles } from './Engines.tsx';
import { maiaEloFor } from '../core/maia/encode.ts';
import { maiaFilesOf, maiaModelName, maiaPrefs, setMaiaModel, setMaiaPrefs } from '../app/maia.ts';
import { MAIA_MODELS } from '../core/maia/protocol.ts';
import { prefs as explorerPrefs } from '../app/explorer.ts';
import { GPU_FILES, gpuNotes, gpuPrefs, gpuState, gpuSupport, setGpuOn } from '../app/gpu.ts';
import { gpuNoteText } from '../core/engine/gpu.ts';
import { megabytes } from './Engines.tsx';

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

function Choice<T extends number | string>(props: { label: string; values: readonly T[]; value: T; format?: (v: T) => string; onPick(v: T): void }) {
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

/**
 * Maia and Lc0 on the graphics processor (§5.184): a switch of its own, taken at once (not with
 * Save: it downloads). Each engine times itself on both when it next starts and keeps the
 * faster; what it found is said under the switch.
 */
function GpuChoice() {
  const [support, setSupport] = useState<string | undefined | null>(null);
  useEffect(() => void gpuSupport().then(setSupport), []);
  const on = gpuPrefs.value.on;
  const state = gpuState.value;
  const notes = gpuNotes.value;
  const bytes = GPU_FILES.reduce((n, f) => n + f.bytes, 0);
  return (
    <fieldset class="gpu-choice" data-testid="gpu-choice">
      <legend>Maia and Lc0</legend>
      <label class="check">
        <input type="checkbox" checked={on || state.kind === 'downloading'} disabled={support !== undefined || state.kind === 'downloading'} onChange={(e) => void setGpuOn(e.currentTarget.checked)} /> On the graphics processor, where it is faster (WebGPU)
      </label>
      <p class="muted" role="status" data-testid="gpu-note">
        {support === null ? (
          '…'
        ) : support ? (
          `${support} They run on the processor.`
        ) : state.kind === 'downloading' ? (
          `Downloading its runtime… ${Math.floor((100 * state.received) / state.total)}%`
        ) : state.kind === 'refused' ? (
          state.reason
        ) : on ? (
          <>
            {gpuNoteText('Maia', notes.maia)} {gpuNoteText('Lc0', notes.lc0)}
          </>
        ) : (
          `Off: both run on the processor. On downloads a runtime of ${megabytes(bytes)} once; each engine then times itself on both when it starts, checks the answers are the same, and keeps the faster.`
        )}
      </p>
    </fieldset>
  );
}

function Dialog() {
  const [draft, setDraft] = useState<EnginePrefs>(() => ({ ...enginePrefs.peek() }));
  const [rating, setRating] = useState(maiaPrefs.peek().rating);
  const [model, setModel] = useState(maiaPrefs.peek().model);
  const filterElo = maiaEloFor(explorerPrefs.peek().ratings);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const save = () => {
    const { on: _on, ...rest } = draft;
    updateEnginePrefs(rest);
    setMaiaPrefs({ rating });
    setMaiaModel(model);
    close();
  };
  return (
    <dialog ref={ref} class="study-dialog engine-settings" aria-labelledby="dialog-engine-settings" onCancel={(e) => (e.preventDefault(), close())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => (e.preventDefault(), save())}>
        <h2 id="dialog-engine-settings">Engine settings</h2>
        <p class="muted">
          {draft.version === '19 full'
            ? `Stockfish 19 with its full net, on this device: stronger at the same depth than the lite builds, and a download of ${megabytes(stockfishFiles(draft.threads, '19 full').reduce((n, f) => n + f.bytes, 0))}, once.`
            : `Stockfish ${draft.version} (lite), on this device.`}{' '}
          It stops at the depth or the time, whichever comes first; "+" searches on.
        </p>
        <Choice label="Version" values={STOCKFISH_VERSIONS} value={draft.version} format={stockfishName} onPick={(version) => setDraft({ ...draft, version })} />
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
        <Choice label="Maia’s model" values={MAIA_MODELS} value={model} format={maiaModelName} onPick={setModel} />
        <p class="muted" data-testid="maia-model-note">
          {model === 'maia3-23m'
            ? `The official 23M model: it reads the seven positions before too where a game gives them (a practice game’s opponent); elsewhere the position stands for them. A download of ${megabytes(maiaFilesOf(model)[0]!.bytes)}, once.`
            : 'The Maia platform’s model: the position alone.'}
        </p>
        <GpuChoice />
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
