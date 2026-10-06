// A data repo and devices that sync with it, for the sync tests: through the fake remote alone
// ('direct'), or through the real adapters over the fake GitHub ('rest', 'graphql').
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseChapterFile } from '../../src/core/pgn/parse.ts';
import { chapterFileText } from '../../src/core/pgn/write.ts';
import type { Chapter } from '../../src/core/study/model.ts';
import type { KnownEvent } from '../../src/core/progress/events.ts';
import type { LocalEvent, LocalStore, Remote } from '../../src/core/sync/ports.ts';
import { sync, type SyncOutcome } from '../../src/core/sync/step.ts';
import { IdbStore } from '../../src/platform/idbStore.ts';
import { graphqlRemote } from '../../src/platform/githubGraphql.ts';
import { restRemote } from '../../src/platform/githubRest.ts';
import { FakeGit } from './fakeGit.ts';
import { FakeGithub } from './fakeGithub.ts';
import { FakeRemote } from './fakeRemote.ts';
import { Faults } from './faults.ts';
import { FakeClock, MemoryStore } from './memoryStore.ts';
import { mulberry32 } from './random.ts';

export type Kind = 'direct' | 'rest' | 'graphql';
export const KINDS: readonly Kind[] = ['direct', 'rest', 'graphql'];

export const REPO = 'owner/repworks-data';
export const TOKEN = 'test_token_for_the_fake_github_only';

const FIXTURE = new URL('../fixtures/data-repo/', import.meta.url).pathname;

/** The fixture data repo's files, path → text. */
export function fixtureFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.set(relative(FIXTURE, path).split(sep).join('/'), readFileSync(path, 'utf8'));
    }
  };
  walk(FIXTURE);
  return out;
}

export interface Dev {
  name: string;
  store: MemoryStore;
  remote: Remote;
  sync(push?: boolean): Promise<SyncOutcome>;
}

export interface SimDev {
  name: string;
  id: string;
  store: LocalStore;
  sync(push?: boolean): Promise<SyncOutcome>;
  view(): Promise<Map<string, string>>;
  edit(path: string, text: string | null): Promise<void>;
  record(t: string, k: KnownEvent['k'], card: string, g?: 1 | 2 | 3 | 4): Promise<LocalEvent>;
  leftovers(): Promise<{ overlay: number; pending: number; events: number }>;
}

export class World {
  readonly kind: Kind;
  readonly git: FakeGit;
  readonly faults = new Faults();
  readonly github: FakeGithub;
  readonly clock = new FakeClock();
  private ids = 0;

  /** `files` null: an empty repo, as GitHub creates one without a README. */
  constructor(kind: Kind, files: ReadonlyMap<string, string> | null = fixtureFiles()) {
    this.kind = kind;
    this.git = new FakeGit(files ?? undefined);
    this.github = new FakeGithub(this.git, { repo: REPO, branch: 'main', token: TOKEN }, this.faults);
  }

  remote(): Remote {
    if (this.kind === 'direct') return new FakeRemote(this.git, this.faults);
    const config = { repo: REPO, branch: 'main', token: TOKEN, fetch: this.github.fetch, pace: { concurrent: 8, perSecond: Infinity } };
    return this.kind === 'rest' ? restRemote(config) : graphqlRemote(config);
  }

  device(id: string, name: string, seed = 1): Dev {
    const store = new MemoryStore({ id, name });
    const remote = this.remote();
    const random = mulberry32(seed);
    const newId = () => `Copy${String(++this.ids).padStart(4, '0')}`;
    return { name, store, remote, sync: (push = true) => sync({ remote, store, clock: this.clock, newId, random }, { push }) };
  }

  /** A device whose store is in memory or in IndexedDB (fake-indexeddb in Node), driven through async helpers. */
  async simDevice(storeKind: 'memory' | 'idb', id: string, name: string, seed = 1): Promise<SimDev> {
    const remote = this.remote();
    const random = mulberry32(seed);
    const newId = () => `Copy${String(++this.ids).padStart(4, '0')}`;
    const run = (store: LocalStore) => (push = true) => sync({ remote, store, clock: this.clock, newId, random }, { push });
    if (storeKind === 'memory') {
      const store = new MemoryStore({ id, name });
      return {
        name,
        id,
        store,
        sync: run(store),
        view: async () => store.view(),
        edit: async (path, text) => store.edit(path, text),
        record: async (t, k, card, g = 3) => store.record(t, k, card, g),
        leftovers: async () => ({ overlay: store.overlay.size, pending: store.pending.length, events: store.events.length }),
      };
    }
    const store = await IdbStore.open(undefined, `repworks-test-${id}-${seed}-${++this.ids}`);
    await store.setUp({ repo: REPO, branch: 'main', token: TOKEN, write: 'graphql' }, { id, name, created: new Date(this.clock.t).toISOString() });
    return {
      name,
      id,
      store,
      sync: run(store),
      view: () => store.read(),
      edit: (path, text) => store.edit(path, text),
      record: (t, k, card, g = 3) => store.record((k === 'review' ? { t, k, card, g } : { t, k, card }) as Parameters<IdbStore['record']>[0]),
      leftovers: async () => {
        const state = await store.state();
        const waiting = await store.waiting();
        return { overlay: waiting.files, pending: state.pending.length, events: waiting.events };
      },
    };
  }

  /** Another writer's commit straight onto the branch. */
  write(message: string, add: ReadonlyMap<string, string>, remove: readonly string[] = []): string {
    const made = this.git.commitIfHead(this.git.head, message, add, remove);
    if (made === 'stale') throw new Error('unreachable');
    return made.commit;
  }
}

export const CH1 = 'studies/Rep0Najd/Ch1Najdf.pgn';
export const CH2 = 'studies/Rep0Najd/Ch2Alapn.pgn';

export function chapterOf(text: string, path: string): Chapter {
  const cid = path.slice(path.lastIndexOf('/') + 1, -'.pgn'.length);
  const parsed = parseChapterFile(text, cid);
  if (!parsed.ok) throw new Error(`${path}: ${parsed.reason}`);
  return parsed.chapter;
}

/** Edits a chapter in a device's working copy through an edit operation. */
export function editChapter(dev: Dev, path: string, edit: (c: Chapter) => { ok: true; value: Chapter } | { ok: false; error: string }): void {
  const text = dev.store.view().get(path);
  if (text === undefined) throw new Error(`no ${path} on ${dev.name}`);
  const result = edit(chapterOf(text, path));
  if (!result.ok) throw new Error(result.error);
  dev.store.edit(path, chapterFileText(result.value));
}

export function expectSynced(outcome: SyncOutcome): Extract<SyncOutcome, { kind: 'synced' }> {
  if (outcome.kind !== 'synced') throw new Error(`expected synced, got ${JSON.stringify(outcome)}`);
  return outcome;
}
