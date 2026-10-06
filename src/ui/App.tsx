import { online, shellVersion, updateReady } from '../app/shell.ts';
import { device, fatal, ready, studies } from '../app/state.ts';
import { Debug } from './Debug.tsx';
import { SetupForm } from './Setup.tsx';
import { SyncBanners, SyncChip } from './Sync.tsx';

export function App() {
  return (
    <div class="shell">
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
      <main class="content">{ready.value && (device.value ? <Home /> : <SetupForm />)}</main>
      <footer class="footer">
        build {__BUILD_ID__}
        {shellVersion.value && <> · shell {shellVersion.value.slice(0, 8)}</>}
      </footer>
    </div>
  );
}

function Home() {
  return (
    <>
      <section class="card">
        <h2>Studies</h2>
        {studies.value.length === 0 ? (
          <p class="muted">No studies yet. Import arrives in the next part of Phase 0.</p>
        ) : (
          <ul class="studies">
            {studies.value.map((s) => (
              <li key={s.id}>
                <span class="study-name">{s.name}</span>
                <span class="muted">
                  {s.kind} · {s.chapters} chapter{s.chapters === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Debug />
    </>
  );
}
