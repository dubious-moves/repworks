import { online, shellVersion, updateReady } from '../app/shell.ts';

export function App() {
  return (
    <div class="shell">
      <header class="topbar">
        <img class="topbar-icon" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
        <h1>Repworks</h1>
        <span class={online.value ? 'status' : 'status status-offline'}>{online.value ? 'online' : 'offline'}</span>
      </header>
      {updateReady.value && (
        <div class="banner" role="status">
          A new version is ready.
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      <main class="content">
        <p>Phase 0 is being built: studies, sync and the editor come next.</p>
      </main>
      <footer class="footer">
        build {__BUILD_ID__}
        {shellVersion.value && <> · shell {shellVersion.value.slice(0, 8)}</>}
      </footer>
    </div>
  );
}
