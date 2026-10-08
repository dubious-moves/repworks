// The training settings dialog (PLAN.md §5.2, §5.16, §5.17): the daily limit of new moves, the
// retention and the learning step, shared by every device through the data repo's
// `settings.json`; then this device's: new moves shown, tried first or shown as a sequence, the
// repetitions and the mistakes retried (§5.77), a line's end, where a line starts, auto-play; and
// time travel, for this tab. Opened by ⚙ on the home screen's training
// card and on the training screen.
import { decidingNow } from '../app/time.ts';
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { mode } from '../app/mode.ts';
import { queueOf, trainData } from '../app/train.ts';
import { saveTrainSettings } from '../app/trainSettings.ts';
import { configureSession } from '../app/train.ts';
import { saveTrainPrefs, trainPrefs, type TrainPrefs } from '../app/trainPrefs.ts';
import { DEFAULT_TRAIN } from '../core/train/settings.ts';
import type { AutoPlay, LineStart } from '../core/train/trainer.ts';
import { TimeControl } from './TimeTravel.tsx';

const STARTS: Record<LineStart, string> = { first: 'At its first new or due move', auto: 'From the start, played', ask: 'From the start, asked' };
const AUTO: Record<AutoPlay, string> = {
  due: 'Moves not due, and moves answered this session',
  session: 'Moves answered right this session',
  difficult: 'As above, but difficult moves are always asked',
  off: 'Off: every move is asked',
};

const shown = signal(false);
export const openTrainSettings = () => (shown.value = true);
const close = () => (shown.value = false);

export function TrainSettingsDialog() {
  const name = mode.value.name;
  useEffect(() => close, [name]);
  return shown.value ? <Dialog /> : null;
}

function Dialog() {
  const data = trainData.peek();
  const now = data?.settings ?? DEFAULT_TRAIN;
  const [newPerDay, setNewPerDay] = useState(String(now.newPerDay));
  const [retention, setRetention] = useState(String(now.retention));
  const [step, setStep] = useState(String(now.learnStepHours));
  const [prefs, setPrefs] = useState<TrainPrefs>(trainPrefs.peek());
  const set = <K extends keyof TrainPrefs>(key: K, value: TrainPrefs[K]) => setPrefs({ ...prefs, [key]: value });
  const [error, setError] = useState<string | undefined>(undefined);
  const [seqLength, setSeqLength] = useState(String(prefs.sequenceLength));
  const [repetitions, setRepetitions] = useState(String(prefs.repetitions));
  const [retries, setRetries] = useState(String(prefs.mistakeRetries));
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const taught = data ? queueOf(data, decidingNow()).taughtToday : 0;
  const save = async () => {
    const values = { newPerDay: Number(newPerDay), retention: Number(retention), learnStepHours: Number(step) };
    if (!Number.isInteger(values.newPerDay) || values.newPerDay < 0 || values.newPerDay > 1000) return setError('New moves a day: a whole number from 0 to 1000.');
    if (!(values.retention >= 0.7 && values.retention <= 0.99)) return setError('Retention: a number from 0.7 to 0.99.');
    if (!(values.learnStepHours >= 0 && values.learnStepHours <= 48)) return setError('Learning step: from 0 to 48 hours.');
    const sequenceLength = Number(seqLength);
    if (prefs.newMoves === 'sequence' && !(Number.isInteger(sequenceLength) && sequenceLength >= 1 && sequenceLength <= 50)) return setError('New moves in a sequence: a whole number from 1 to 50.');
    const reps = Number(repetitions);
    if (!(Number.isInteger(reps) && reps >= 1 && reps <= 5)) return setError('Repetitions: a whole number from 1 to 5.');
    const mistakeRetries = Number(retries);
    if (!(Number.isInteger(mistakeRetries) && mistakeRetries >= 0 && mistakeRetries <= 5)) return setError('Mistakes retried: a whole number from 0 to 5.');
    const done = await saveTrainSettings(values);
    if (!done.ok) return setError(done.error);
    saveTrainPrefs({ ...(prefs.newMoves === 'sequence' ? { ...prefs, sequenceLength } : prefs), repetitions: reps, mistakeRetries });
    configureSession();
    close();
  };
  return (
    <dialog ref={ref} class="study-dialog" aria-labelledby="dialog-train-settings" onCancel={(e) => (e.preventDefault(), close())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => (e.preventDefault(), void save())}>
        <h2 id="dialog-train-settings">Training settings</h2>
        <p class="muted">Shared by all your devices.</p>
        <label>
          New moves a day
          <input type="number" name="new-per-day" min={0} max={1000} step={1} inputMode="numeric" value={newPerDay} onInput={(e) => setNewPerDay(e.currentTarget.value)} />
        </label>
        <p class="muted">
          {taught} taught today. The limit only paces the day's queue: a line you pick from the list is learned whatever it says.
        </p>
        <label>
          Retention <span class="muted">(how sure a review should be, 0.7–0.99)</span>
          <input type="number" name="retention" min={0.7} max={0.99} step={0.01} inputMode="decimal" value={retention} onInput={(e) => setRetention(e.currentTarget.value)} />
        </label>
        <label>
          First review after a new move <span class="muted">(hours)</span>
          <input type="number" name="learn-step" min={0} max={48} step={0.5} inputMode="decimal" value={step} onInput={(e) => setStep(e.currentTarget.value)} />
        </label>
        <h3>This device</h3>
        <label>
          New moves
          <select name="new-moves" value={prefs.newMoves} onChange={(e) => set('newMoves', e.currentTarget.value as TrainPrefs['newMoves'])}>
            <option value="show">Show the move (arrow and name)</option>
            <option value="try">Let me try first</option>
            <option value="sequence">Show a sequence, then let me play it</option>
          </select>
        </label>
        {prefs.newMoves === 'sequence' && (
          <label>
            New moves in a sequence
            <input type="number" name="sequence-length" min={1} max={50} step={1} inputMode="numeric" value={seqLength} onInput={(e) => setSeqLength(e.currentTarget.value)} />
          </label>
        )}
        <label>
          Repetitions <span class="muted">(times a line is played through when you learn moves on it, 1–5)</span>
          <input type="number" name="repetitions" min={1} max={5} step={1} inputMode="numeric" value={repetitions} onInput={(e) => setRepetitions(e.currentTarget.value)} />
        </label>
        <label>
          Mistakes retried <span class="muted">(asked again when the line ends, until right this many times in a row, 0–5; 0: not)</span>
          <input type="number" name="mistake-retries" min={0} max={5} step={1} inputMode="numeric" value={retries} onInput={(e) => setRetries(e.currentTarget.value)} />
        </label>
        <label>
          Auto-play
          <select name="auto-play" value={prefs.autoPlay} onChange={(e) => set('autoPlay', e.currentTarget.value as AutoPlay)}>
            {(Object.keys(AUTO) as AutoPlay[]).map((k) => (
              <option key={k} value={k}>
                {AUTO[k]}
              </option>
            ))}
          </select>
        </label>
        <p class="muted">Moves played for you; the others are asked, graded only when due. Moves set to “always play this for me” are always played.</p>
        <label>
          A line starts, in the day's queue
          <select name="start-queue" value={prefs.startQueue} onChange={(e) => set('startQueue', e.currentTarget.value as LineStart)}>
            {(Object.keys(STARTS) as LineStart[]).map((k) => (
              <option key={k} value={k}>
                {STARTS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          A line starts, when learning or picked
          <select name="start-learn" value={prefs.startLearn} onChange={(e) => set('startLearn', e.currentTarget.value as LineStart)}>
            {(Object.keys(STARTS) as LineStart[]).map((k) => (
              <option key={k} value={k}>
                {STARTS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          At a line's end
          <select name="line-end" value={prefs.lineEnd} onChange={(e) => set('lineEnd', e.currentTarget.value as TrainPrefs['lineEnd'])}>
            <option value="wait">Wait for “Next line”</option>
            <option value="go">Go on to the next line</option>
          </select>
        </label>
        <TimeControl />
        {error && (
          <p class="warn" role="alert">
            {error}
          </p>
        )}
        <div class="dialog-buttons">
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
