// The training settings dialog (PLAN.md §5.2, §5.16): the daily limit of new moves, the
// retention and the learning step, shared by every device through the data repo's
// `settings.json`. Opened by ⚙ on the home screen's training card and on the training screen.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { mode } from '../app/mode.ts';
import { queueOf, trainData } from '../app/train.ts';
import { saveTrainSettings } from '../app/trainSettings.ts';
import { DEFAULT_TRAIN } from '../core/train/settings.ts';

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
  const [error, setError] = useState<string | undefined>(undefined);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const taught = data ? queueOf(data, Date.now()).taughtToday : 0;
  const save = async () => {
    const values = { newPerDay: Number(newPerDay), retention: Number(retention), learnStepHours: Number(step) };
    if (!Number.isInteger(values.newPerDay) || values.newPerDay < 0 || values.newPerDay > 1000) return setError('New moves a day: a whole number from 0 to 1000.');
    if (!(values.retention >= 0.7 && values.retention <= 0.99)) return setError('Retention: a number from 0.7 to 0.99.');
    if (!(values.learnStepHours >= 0 && values.learnStepHours <= 48)) return setError('Learning step: from 0 to 48 hours.');
    const done = await saveTrainSettings(values);
    if (!done.ok) return setError(done.error);
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
