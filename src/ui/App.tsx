import { useEffect, useState } from 'preact/hooks';
import { mode } from '../app/mode.ts';
import { findConflicts } from '../app/overview.ts';
import { online, shellVersion, updateReady } from '../app/shell.ts';
import { device, fatal, localStore, ready, studies, type StudyRow } from '../app/state.ts';
import { queueOf, trainData } from '../app/train.ts';
import { dataVersion } from '../app/sync.ts';
import { ChapterView } from './ChapterView.tsx';
import { ConflictsView } from './Conflicts.tsx';
import { Debug } from './Debug.tsx';
import { ImportScreen } from './Import.tsx';
import { SetupForm } from './Setup.tsx';
import { SyncBanners, SyncChip } from './Sync.tsx';
import { MistakesView } from './Mistakes.tsx';
import { ReadView } from './Read.tsx';
import { TrainScreen } from './Train.tsx';
import { TrainCard } from './TrainCard.tsx';
import { TrainSettingsDialog } from './TrainSettings.tsx';
import { ExplorerSettingsDialog } from './ExplorerSettings.tsx';
import { confirmDeleteStudy, openNewStudy, openStudySettings, StudyDialogs } from './StudyDialogs.tsx';

export function App() {
  return (
    <div class={`shell${mode.value.name === 'chapter' ? ' shell-chapter' : ''}${['train', 'learn', 'practice', 'show', 'read', 'play'].includes(mode.value.name) ? ' shell-train' : ''}`}>
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
      <StudyDialogs />
      <TrainSettingsDialog />
      <ExplorerSettingsDialog />
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
    case 'train': {
      const m = mode.value;
      if (m.sid && m.cid && m.at?.length) return <TrainScreen of={{ kind: 'line', sid: m.sid, cid: m.cid, at: m.at }} />;
      return <TrainScreen of={m.sid ? { kind: 'queue', scope: m.sid } : { kind: 'queue' }} />;
    }
    case 'learn':
      return <TrainScreen of={{ kind: 'learn', sid: mode.value.sid, cid: mode.value.cid }} />;
    case 'show':
      return <TrainScreen of={mode.value.sid ? { kind: 'show', scope: mode.value.sid } : { kind: 'show' }} />;
    case 'mistakes':
      return <MistakesView />;
    case 'read':
      return <ReadView sid={mode.value.sid} cid={mode.value.cid} at={mode.value.at} {...(mode.value.from === undefined ? {} : { from: mode.value.from })} />;
    case 'play': {
      const m = mode.value;
      return <TrainScreen of={{ kind: 'play', sid: m.sid, cid: m.cid, at: m.at, ...(m.from === undefined ? {} : { from: m.from }) }} />;
    }
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
          <div class="actions">
            <a class="button secondary" href="#/import">
              Import
            </a>
            <button type="button" onClick={openNewStudy}>
              + New study
            </button>
          </div>
        </div>
        {studies.value.length === 0 ? (
          <p class="muted">No studies yet: make one, or import one.</p>
        ) : (
          <ul class="studies">
            {studies.value.map((s) => (
              <StudyCard key={s.id} study={s} />
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

const SIDES = { white: 'White', black: 'Black', both: 'Both' } as const;

/**
 * A study as a card, after Qchess's /studies (read live, 2026-10-06): the kind where Qchess shows
 * the visibility, the name, the chapters, and the side as Qchess's colour tag; here also today's
 * due and new moves. The card opens the study; ⚙ and 🗑 in its corner, as Qchess's tag and delete
 * buttons, open its settings and delete it.
 */
function StudyCard(props: { study: StudyRow }) {
  const s = props.study;
  const data = trainData.value;
  const queue = s.kind === 'repertoire' && data ? queueOf(data, Date.now(), s.id) : undefined;
  const ref = { sid: s.id, name: s.name, kind: s.kind, chapters: s.chapters };
  return (
    <li class="study-card">
      <div class="study-card-actions">
        <button type="button" class="icon" aria-label={`Settings of ${s.name}`} title="Study settings" onClick={() => openStudySettings(ref)}>
          ⚙
        </button>
        <button type="button" class="icon" aria-label={`Delete ${s.name}`} title="Delete study" onClick={() => void confirmDeleteStudy(ref)}>
          🗑
        </button>
      </div>
      <span class={`study-card-badge badge-${s.kind}`}>{s.kind === 'repertoire' ? 'Repertoire' : 'Reference'}</span>
      <a class="study-card-title" href={`#/study/${s.id}`}>
        {s.name}
      </a>
      <div class="study-card-meta">
        <span>
          {s.chapters} chapter{s.chapters === 1 ? '' : 's'}
        </span>
        {s.side && <span class={`study-tag tag-${s.side}`}>{SIDES[s.side]}</span>}
        {queue && (queue.due.length > 0 || queue.newCards.length > 0) && (
          <span class="study-card-counts">
            {queue.due.length} due · {queue.newCards.length} new
          </span>
        )}
      </div>
      {s.kind === 'repertoire' && (
        <a class="button study-card-train" href={`#/train/${s.id}`} aria-label={`Train ${s.name}`}>
          Train
        </a>
      )}
    </li>
  );
}
