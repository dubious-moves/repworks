// The training settings every device shares (PLAN.md §5.2), changed from the site: the daily limit
// of new moves, the retention and the learning step, written to the data repo's `settings.json`
// and synced like any other change. A file that can't be read is never rewritten (D4).
import { DEFAULT_TRAIN, parseSettings, SETTINGS_FILE, withTrain, writeSettings, type SettingsFile, type TrainSettings } from '../core/train/settings.ts';
import type { Done } from './studies.ts';
import { localStore, saveFiles } from './state.ts';

export async function saveTrainSettings(next: TrainSettings): Promise<Done> {
  const store = localStore();
  if (!store) return { ok: false, error: 'the local database is not open' };
  const text = (await store.read((p) => p === SETTINGS_FILE)).get(SETTINGS_FILE);
  let file: SettingsFile | undefined;
  if (text !== undefined) {
    const parsed = parseSettings(text);
    if (!parsed.ok) return { ok: false, error: `settings.json can't be read, so it is left as it is: ${parsed.errors.join('; ')}` };
    file = parsed.value;
  }
  // Only the fields changed are written, so a field changed on the other device meanwhile merges.
  const now = file?.train ?? DEFAULT_TRAIN;
  let changed = file;
  for (const key of ['newPerDay', 'retention', 'learnStepHours'] as const) if (next[key] !== now[key]) changed = withTrain(changed, key, next[key]);
  if (changed === file) return { ok: true, value: undefined };
  const written = writeSettings(changed!);
  // Checked as it would be read: a value out of range is refused here, not written.
  const check = parseSettings(written);
  if (!check.ok) return { ok: false, error: check.errors.join('; ') };
  if (written !== text) await saveFiles(new Map([[SETTINGS_FILE, written]]));
  return { ok: true, value: undefined };
}
