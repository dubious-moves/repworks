import { useEffect, useState } from 'preact/hooks';
import { mode } from '../app/mode.ts';
import { findConflicts } from '../app/overview.ts';
import { online, shellVersion, updateReady } from '../app/shell.ts';
import { device, fatal, localStore, ready, studies } from '../app/state.ts';
import { dataVersion } from '../app/sync.ts';
import { ChapterView } from './ChapterView.tsx';
import { ConflictsView } from './Conflicts.tsx';
import { Debug } from './Debug.tsx';
import { ImportScreen } from './Import.tsx';
import { SetupForm } from './Setup.tsx';
import { SyncBanners, SyncChip } from './Sync.tsx';
import { MistakesView } from './Mistakes.tsx';
import { TrainScreen } from './Train.tsx';
import { TrainCard } from './TrainCard.tsx';

export function App() {
  return (
    <div class={`shell${mode.value.name === 'chapter' ? ' shell-chapter' : ''}${mode.value.name === 'train' || mode.value.name === 'practice' ? ' shell-train' : ''}`}>
      <header class="topbar">
        <img class="topbar-icon" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
        <h1>Repworks</h1>
        {device.value ? <SyncChip /> : !online.value && <span class="status status-offline">offline</span>}
      </header>
      {updateReady.value && (
        <div class="banner" role="status">
          A new version is ready.
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      {fatal.value && (
        <div class="banner banner-warn" role="alert">
          {fatal.value}
        </div>
      )}
      <SyncBanners />
      <main class="content">{ready.value && (!device.value ? <SetupForm /> : <Screen />)}</main>
      <footer class="footer">
        build {__BUILD_ID__}
        {shellVersion.value && <> · shell {shellVersion.value.slice(0, 8)}</>} · <a href={`${import.meta.env.BASE_URL}spike.html`}>remote spike</a>
      </footer>
    </div>
  );
}

function Screen() {
  switch (mode.value.name) {
    case 'import':
      return <ImportScreen />;
    case 'conflicts':
      return <ConflictsView />;
    case 'chapter':
      return <ChapterView />;
    case 'train':
      return <TrainScreen of={mode.value.sid ? { kind: 'queue', scope: mode.value.sid } : { kind: 'queue' }} />;
    case 'mistakes':
      return <MistakesView />;
    case 'practice': {
      const run = mode.value.run;
      return <TrainScreen of={run === 'retry' || run === 'drill' ? { kind: run } : { kind: 'pinned', all: run === 'pins' }} />;
    }
    case 'list':
      return <Home />;
  }
}

function Home() {
  const [conflicts, setConflicts] = useState(0);
  const version = dataVersion.value;
  useEffect(() => {
    const store = localStore();
    if (store) void findConflicts(store).then((o) => setConflicts(o.conflicts.length + o.copies.length));
  }, [version]);
  return (
    <>
      <TrainCard />
      <section class="card">
        <div class="card-head">
          <h2>Studies</h2>
          <a class="button" href="#/import">
            Import
          </a>
        </div>
        {studies.value.length === 0 ? (
          <p class="muted">No studies yet: import one.</p>
        ) : (
          <ul class="studies">
            {studies.value.map((s) => (
              <li key={s.id}>
                <a class="study-name" href={`#/study/${s.id}`}>
                  {s.name}
                </a>
                <span class="muted">
                  {s.kind} · {s.chapters} chapter{s.chapters === 1 ? '' : 's'}
                  {s.kind === 'repertoire' && (
                    <>
                      {' · '}
                      <a href={`#/train/${s.id}`} aria-label={`Train ${s.name}`}>
                        Train
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {conflicts > 0 && (
          <p>
            <a href="#/conflicts">
              {conflicts} open conflict{conflicts === 1 ? '' : 's'}
            </a>
          </p>
        )}
      </section>
      <Debug />
    </>
  );
}
