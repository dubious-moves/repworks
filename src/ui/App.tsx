import { decidingNow } from '../app/time.ts';
import { useEffect, useState } from 'preact/hooks';
import { mode } from '../app/mode.ts';
import { modeHash } from '../core/app/fsm.ts';
import { findConflicts } from '../app/overview.ts';
import { online, shellVersion, updateReady } from '../app/shell.ts';
import { device, fatal, localStore, ready, starting, studies, type StudyRow } from '../app/state.ts';
import { queueOf, trainData } from '../app/train.ts';
import { dataVersion } from '../app/sync.ts';
import { ChapterView } from './ChapterView.tsx';
import { ConflictsView } from './Conflicts.tsx';
import { CoverageView } from './Coverage.tsx';
import { StormScreen } from './Storm.tsx';
import { GamesScreen } from './Games.tsx';
import { MigrateScreen } from './Migrate.tsx';
import { HistoryScreen, PracticeScreen } from './Practice.tsx';
import { RepertoireCheckScreen } from './RepertoireCheck.tsx';
import { ChecklistDrill } from './Checklist.tsx';
import { Debug } from './Debug.tsx';
import { Guard } from './Guard.tsx';
import { ImportScreen } from './Import.tsx';
import { SetupForm } from './Setup.tsx';
import { SyncBanners, SyncChip } from './Sync.tsx';
import { MistakesView } from './Mistakes.tsx';
import { ReadView } from './Read.tsx';
import { TrainScreen } from './Train.tsx';
import { TrainCard } from './TrainCard.tsx';
import { TrainSettingsDialog } from './TrainSettings.tsx';
import { PriorityDialog } from './Priority.tsx';
import { TimeBanner } from './TimeTravel.tsx';
import { ExplorerSettingsDialog } from './ExplorerSettings.tsx';
import { EngineSettingsDialog } from './EngineSettings.tsx';
import { MaiaDialog } from './MaiaDialog.tsx';
import { confirmDeleteStudy, openNewStudy, openStudySettings, StudyDialogs } from './StudyDialogs.tsx';

export function App() {
  return (
    <div class={`shell${mode.value.name === 'chapter' || mode.value.name === 'analysis' ? ' shell-chapter' : ''}${['train', 'learn', 'practice', 'show', 'read', 'play', 'storm', 'gamesReview', 'playOn', 'history', 'checklist'].includes(mode.value.name) || (mode.value.name === 'games' && !!mode.value.id) ? ' shell-train' : ''}`}>
      <header class="topbar">
        <img class="topbar-icon" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
        <h1>Repworks</h1>
        {device.value ? (
          <Guard name="The sync status">
            <SyncChip />
          </Guard>
        ) : !online.value && <span class="status status-offline">offline</span>}
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
      <Guard name="The banners">
        <SyncBanners />
        <TimeBanner />
      </Guard>
      <main class="content">
        <Guard name="This screen" retry={modeHash(mode.value)}>
          {ready.value ? !device.value ? <SetupForm /> : <Screen /> : !fatal.value && <Starting />}
        </Guard>
      </main>
      <Guard name="A dialog">
        <StudyDialogs />
        <TrainSettingsDialog />
        <ExplorerSettingsDialog />
        <EngineSettingsDialog />
        <MaiaDialog />
        <PriorityDialog />
      </Guard>
      <footer class="footer">
        build {__BUILD_ID__}
        {shellVersion.value && <> · shell {shellVersion.value.slice(0, 8)}</>} · <a href={`${import.meta.env.BASE_URL}spike.html`}>remote spike</a>
      </footer>
    </div>
  );
}

/** Shown when the start takes long, naming the step it waits on, instead of a blank page. */
const SLOW_START_MS = 4000;

function Starting() {
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const since = Date.now();
    const timer = setInterval(() => setWaited(Date.now() - since), 1000);
    return () => clearInterval(timer);
  }, []);
  if (waited < SLOW_START_MS) return null;
  return (
    <section class="card starting" role="status">
      <p>
        Still starting: waiting for {starting.value} ({Math.round(waited / 1000)} s).
      </p>
      <p class="muted">
        If a reload doesn't help, close the app fully (swipe it away from the recent apps, or close every Repworks tab) and open it again: the browser
        may still hold the database for the page before. Nothing needs reinstalling.
      </p>
      <div class="actions">
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </section>
  );
}

function Screen() {
  switch (mode.value.name) {
    case 'import':
      return <ImportScreen />;
    case 'conflicts':
      return <ConflictsView />;
    case 'chapter':
    case 'analysis':
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
    case 'coverage':
      return <CoverageView sid={mode.value.sid} />;
    case 'storm': {
      const m = mode.value;
      return <StormScreen where={{ ...(m.sid ? { sid: m.sid } : {}), ...(m.cid ? { cid: m.cid } : {}), ...(m.at ? { at: m.at } : {}) }} />;
    }
    case 'games':
      return <GamesScreen {...(mode.value.id ? { id: mode.value.id } : {})} {...(mode.value.ply !== undefined ? { ply: mode.value.ply } : {})} />;
    case 'gamesReview':
      return <GamesScreen review />;
    case 'migrate':
      return <MigrateScreen />;
    case 'playOn':
      return <PracticeScreen fen={mode.value.fen} side={mode.value.side} />;
    case 'history':
      return <HistoryScreen id={mode.value.id} />;
    case 'repCheck':
      return <RepertoireCheckScreen />;
    case 'checklist':
      return <ChecklistDrill key={`${mode.value.sid}/${mode.value.i}/${mode.value.preset}`} sid={mode.value.sid} i={mode.value.i} preset={mode.value.preset} />;
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
      <Guard name="The training card">
        <TrainCard />
      </Guard>
      <section class="card">
        <div class="card-head">
          <h2>Studies</h2>
          <div class="actions">
            <a class="button secondary" href="#/storm">
              Storm
            </a>
            <a class="button secondary" href="#/games">
              Games
            </a>
            <a class="button secondary" href="#/analysis">
              Analysis board
            </a>
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
              <Guard key={s.id} name={`The card of ${s.name}`}>
                <StudyCard study={s} />
              </Guard>
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
      <Guard name="Settings and debug">
        <Debug />
      </Guard>
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
  const queue = s.kind === 'repertoire' && data ? queueOf(data, decidingNow(), s.id) : undefined;
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
