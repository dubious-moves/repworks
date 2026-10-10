// The app's state for the Phase 0 screens so far: the device, its remote, the studies in the
// working view, and the actions the UI calls. §4.11 moves the screens into a state machine.
import { effect, signal } from '@preact/signals';
import { classifyPath } from '../core/data/layout.ts';
import { buildImport, type ImportBuild, type ImportChoices, type ImportReading } from '../core/import/plan.ts';
import type { StudyKind } from '../core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import type { SetupParse, SetupRequest } from '../core/sync/setup.ts';
import { cryptoRandom } from '../platform/browser.ts';
import { IdbStore, type DeviceRecord, type RemoteSettings } from '../platform/idbStore.ts';
import { finishLichessLogin } from './lichess.ts';
import { applySetup, publicRepoWarning, takeSetupFromAddress, type Notice } from './setup.ts';
import { dataVersion, SyncController } from './sync.ts';
import { refreshTrainData, startSession, type SessionKind } from './train.ts';

export interface StudyRow {
  id: string;
  name: string;
  kind: StudyKind;
  chapters: number;
  /** The sides its chapters are for, as Qchess's colour tag: white, black or both. */
  side?: 'white' | 'black' | 'both';
}

/** The local database is open and read. */
export const ready = signal(false);
export const device = signal<DeviceRecord | undefined>(undefined);
export const settings = signal<RemoteSettings | undefined>(undefined);
export const studies = signal<StudyRow[]>([]);
export const notice = signal<Notice | undefined>(undefined);
/** Something that stops the app from working at all. */
export const fatal = signal<string | undefined>(undefined);
/**
 * The step the start waits on until the app is ready, shown when it takes long: the owner's phone
 * (2026-10-10, build 57ed03b) sometimes stayed blank after a reload, with no error to report.
 */
export const starting = signal<string>('opening the local database');

let store: IdbStore | undefined;
let controller: SyncController | undefined;

/** `sync` false: a styles gallery's frame (styles.html), which shows this device's data and never syncs it. */
export async function startApp(link: SetupParse | undefined, lichessCallback?: string, sync = true): Promise<void> {
  try {
    store = await IdbStore.open();
  } catch (error) {
    fatal.value = `The local database can't be opened: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  try {
    controller = new SyncController(store);
    if (link) {
      starting.value = 'applying the setup link';
      await setUpFrom(link, false);
    }
    starting.value = 'reading the device and its studies';
    await reload();
  } catch (error) {
    console.error('The start failed:', error);
    fatal.value = `Repworks couldn't start while ${starting.value}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
    return;
  }
  ready.value = true;
  if (lichessCallback) {
    const done = await finishLichessLogin(lichessCallback);
    notice.value = done.notice;
    if (done.returnTo) location.hash = done.returnTo;
  }
  if (sync) await controller.start();
  effect(() => {
    void dataVersion.value;
    void reload();
    if (store) void refreshTrainData(store);
  });
  addEventListener('hashchange', () => {
    const next = takeSetupFromAddress();
    if (next) void setUpFrom(next, true);
  });
}

async function setUpFrom(link: SetupParse, restart: boolean): Promise<void> {
  if (!link.ok) {
    notice.value = { kind: 'error', message: `That setup link didn't work: ${link.error}.` };
    return;
  }
  await setUp(link.value, restart);
}

export async function setUp(request: SetupRequest, restart = true): Promise<void> {
  if (!store) return;
  notice.value = await applySetup(store, request);
  await reload();
  if (restart) await controller?.start();
}

async function reload(): Promise<void> {
  if (!store) return;
  device.value = await store.device();
  settings.value = await store.remote();
  if (settings.value?.private === false && notice.value?.kind !== 'error') notice.value = { kind: 'warning', message: publicRepoWarning(settings.value.repo) };
  studies.value = device.value ? await readStudies(store) : [];
}

async function readStudies(s: IdbStore): Promise<StudyRow[]> {
  const files = await s.read((path) => {
    const kind = classifyPath(path).kind;
    return kind === 'study' || kind === 'chapter';
  });
  const chapterFiles = new Map<string, string[]>();
  const sides = new Map<string, Set<string>>();
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind !== 'chapter') continue;
    chapterFiles.set(where.sid, [...(chapterFiles.get(where.sid) ?? []), where.cid]);
    const head = text.slice(0, text.indexOf('\n\n') + 1 || undefined);
    const side = /^\[Orientation "(white|black)"\]$/m.exec(head)?.[1] ?? 'white';
    sides.set(where.sid, (sides.get(where.sid) ?? new Set()).add(side));
  }
  const rows: StudyRow[] = [];
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind !== 'study') continue;
    const meta = parseStudyMeta(text, where.sid);
    if (!meta.ok) continue;
    const chapters = reconcileChapterOrder(meta.value.chapters, chapterFiles.get(where.sid) ?? []).length;
    const row: StudyRow = { id: meta.value.id, name: meta.value.name, kind: meta.value.kind, chapters };
    const both = sides.get(where.sid);
    if (both) row.side = both.size > 1 ? 'both' : (both.values().next().value as 'white' | 'black');
    rows.push(row);
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes working copies (null deletes a file) and lets the sync and the other tabs know. */
export async function saveFiles(files: ReadonlyMap<string, string | null>): Promise<void> {
  if (!store || files.size === 0) return;
  await store.editMany(files);
  await controller?.changed();
}

/** Writes an import's new studies into the working copies; they go out with the next sync. */
export async function saveImport(reading: ImportReading, choices: ImportChoices): Promise<ImportBuild> {
  if (!store) return { ok: false, error: 'the local database is not open' };
  const taken = new Set<string>();
  for (const path of await store.paths()) {
    const where = classifyPath(path);
    if (where.kind === 'study' || where.kind === 'chapter') taken.add(where.sid);
  }
  const result = buildImport(reading, choices, { random: cryptoRandom, taken, now: new Date().toISOString() });
  if (!result.ok) return result;
  await saveFiles(result.files);
  return result;
}

/** A review of a made-up card, for checking sync and replay by hand (the acceptance test). */
export async function recordTestReview(): Promise<void> {
  if (!store) return;
  await store.record({ t: new Date().toISOString(), k: 'review', card: 'r|test|e2e4', g: 3 });
  await controller?.changed();
}

/** Records a progress event at once; the sync sends it with the next push. */
export async function recordEvent(event: Parameters<IdbStore['record']>[0]): Promise<void> {
  if (!store) return;
  await store.record(event);
  await controller?.changed();
}

/** Records several events at once (a study prioritized, §5.70), with one refresh after. */
export async function recordEvents(events: readonly Parameters<IdbStore['record']>[0][]): Promise<void> {
  if (!store || events.length === 0) return;
  await store.recordMany(events);
  await controller?.changed();
}

/** Starts a session (§5.7, §5.8): today's queue (everything, or one study), mistakes or pins. */
export async function beginTraining(of: SessionKind): Promise<void> {
  if (store) await startSession(store, recordEvent, of);
}

export function syncNow(): void {
  controller?.syncNow();
}

export function localStore(): IdbStore | undefined {
  return store;
}
