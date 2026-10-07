// The migration from mistake-lab (PLAN.md §5.64): its Gist read once with a token entered for it
// (never stored), a dry run's report, then the run: the events recorded on this device and the two
// studies saved, all going out with the next sync. A second run is refused once the log holds a
// migration's snapshots.
import { signal } from '@preact/signals';
import { migrate, type MigrationResult } from '../core/games/migrate.ts';
import { readGamesFile } from '../core/games/record.ts';
import { readImport } from '../core/import/plan.ts';
import { gistId, readGist } from '../platform/gist.ts';
import { localStore, recordEvent, saveImport } from './state.ts';

export interface MigrationState {
  phase: 'idle' | 'reading' | 'ready' | 'running' | 'done' | 'error';
  message?: string;
  result?: MigrationResult;
  /** Recorded so far, while running. */
  written?: number;
}
export const migration = signal<MigrationState>({ phase: 'idle' });

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whether this device's data already holds a migration (its snapshots). */
export async function alreadyMigrated(): Promise<boolean> {
  const store = localStore();
  if (!store) return false;
  const files = await store.read((p) => p.startsWith('progress/'));
  for (const text of files.values()) if (text.includes('"k":"snapshot"')) return true;
  return (await store.unsentEvents()).some((e) => e.raw.includes('"k":"snapshot"'));
}

/** Reads the Gist and makes the report; nothing is written. */
export async function dryRun(typedGist: string, token: string): Promise<void> {
  const id = gistId(typedGist);
  if (!id) {
    migration.value = { phase: 'error', message: 'That isn’t a gist’s ID or address.' };
    return;
  }
  migration.value = { phase: 'reading' };
  try {
    const gist = await readGist(id, token.trim() ? { token: token.trim() } : {});
    if (gist.status !== 'ok') throw new Error('GitHub answered “unchanged” to a first read.');
    const progressText = await gist.text('mistakelab_progress.json');
    if (!progressText) throw new Error('The gist has no mistakelab_progress.json.');
    const progress: unknown = JSON.parse(progressText);
    const gamesText = await gist.text('mistakelab_games.json');
    const games = gamesText ? readGamesFile(JSON.parse(gamesText)).games : undefined;
    const reviewsText = await gist.text('mistakelab_reviews.json');
    const now = new Date();
    const result = migrate({
      progress,
      ...(games ? { gameIds: new Set(games.map((g) => g.id)), gameTimes: new Map(games.map((g) => [g.id, g.createdAt])) } : {}),
      ...(reviewsText ? { reviews: JSON.parse(reviewsText) as unknown } : {}),
      evalCache: gist.files.some((f) => f.name === 'mistakelab_evals.json'),
      now: now.getTime(),
      today: localDate(now),
    });
    migration.value = { phase: 'ready', result, ...(games ? {} : { message: 'The gist has no games file: game cards are migrated, and their games come with Games’ refresh.' }) };
  } catch (error) {
    migration.value = { phase: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/** Writes the dry run's events and studies. */
export async function runMigration(): Promise<void> {
  const state = migration.value;
  const result = state.result;
  if (state.phase !== 'ready' || !result) return;
  if (await alreadyMigrated()) {
    migration.value = { ...state, phase: 'error', message: 'This data already holds a migration from mistake-lab: it isn’t run twice.' };
    return;
  }
  migration.value = { ...state, phase: 'running', written: 0 };
  let written = 0;
  for (const e of result.events) {
    await recordEvent(e);
    written++;
    if (written % 100 === 0) migration.value = { ...migration.value, written };
  }
  const studies: string[] = [];
  const empty = new Map<number, 'white' | 'black'>();
  if (result.notesPgn) {
    const built = await saveImport(readImport(result.notesPgn), { name: 'Notes (from mistake-lab)', kind: 'reference', source: { kind: 'file', name: 'mistake-lab notes' }, sides: empty });
    studies.push(built.ok ? 'the Notes study' : `not the Notes study (${built.error})`);
  }
  if (result.deviationsPgn) {
    const built = await saveImport(readImport(result.deviationsPgn), { name: 'From mistake-lab', kind: 'repertoire', source: { kind: 'file', name: 'mistake-lab custom deviations' }, sides: empty });
    studies.push(built.ok ? 'the From mistake-lab study' : `not the From mistake-lab study (${built.error})`);
  }
  migration.value = { ...state, phase: 'done', written, message: `${written} events recorded${studies.length ? `, and ${studies.join(' and ')}` : ''}. They go out with the next sync.` };
}
