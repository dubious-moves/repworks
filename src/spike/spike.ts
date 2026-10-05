// The remote spike page (PLAN.md §4.2): throwaway. It runs on the site's own origin so every
// cross-origin request is the one the real app will make. Delete it once §4.9 is built.
import { renderSVG } from 'uqr';
import { clearSteps, displayMode, fullReport, onSteps, record, secret, type Step } from './report.ts';
import { runGithubChecks } from './github.ts';
import { handleCallback, lichessToken, revoke, runLichessChecks, startLogin } from './lichess.ts';

const GITHUB_KEY = 'repworks-spike-github';
const MARKER_KEY = 'repworks-spike-marker';
const DATASET = 'https://skaeglund.github.io/puzzle-explorer-data/meta.json';

interface Saved {
  repo: string;
  token: string;
  savedAt: string;
  savedIn: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
const log = (line: string) => {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

function loadSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(GITHUB_KEY) ?? 'null') as Saved | null;
    secret(saved?.token);
    return saved;
  } catch {
    return null;
  }
}

function save(repo: string, token: string): void {
  secret(token);
  localStorage.setItem(GITHUB_KEY, JSON.stringify({ repo, token, savedAt: new Date().toISOString(), savedIn: displayMode() } satisfies Saved));
}

// The setup link the real app will take: #setup?repo=<owner/name>&token=<token>. It is read,
// stored, and removed from the address bar at once.
function takeSetupLink(): void {
  if (!location.hash.startsWith('#setup?')) return;
  const params = new URLSearchParams(location.hash.slice('#setup?'.length));
  history.replaceState(null, '', location.pathname + location.search);
  const repo = params.get('repo');
  const token = params.get('token');
  if (repo && token) {
    save(repo, token);
    record({ id: 'S0', title: 'Setup link read and removed from the address bar', ok: !location.href.includes(token), detail: { repo } });
  }
}

function renderSaved(): void {
  const saved = loadSaved();
  $('saved').textContent = saved
    ? `Saved on this device: ${saved.repo}, token ${saved.token.slice(0, 11)}…${saved.token.slice(-4)}, entered ${new Date(saved.savedAt).toLocaleString()} in a ${saved.savedIn}.`
    : 'No token saved on this device yet.';
  $<HTMLInputElement>('repo').value = saved?.repo ?? $<HTMLInputElement>('repo').value;
  $<HTMLButtonElement>('qr-show').disabled = !saved;
  $<HTMLButtonElement>('github-run').disabled = !saved;
  const lichess = lichessToken();
  $('lichess-state').textContent = lichess ? 'Logged in to Lichess on this device.' : 'Not logged in to Lichess on this device.';
}

function renderSteps(steps: Step[]): void {
  const list = $('steps');
  list.replaceChildren(
    ...steps.map((s) => {
      const li = document.createElement('li');
      li.className = s.ok ? 'ok' : 'bad';
      li.textContent = `${s.ok ? '✓' : '✗'} ${s.id} ${s.title} (${s.where}${s.ms !== undefined ? `, ${s.ms} ms` : ''})`;
      return li;
    }),
  );
  $('count').textContent = String(steps.length);
}

async function storageChecks(): Promise<void> {
  const persistedBefore = await navigator.storage?.persisted?.();
  const persist = await navigator.storage?.persist?.();
  const estimate = await navigator.storage?.estimate?.();
  record({
    id: 'S1',
    title: 'Storage: persist() and the quota',
    ok: persist === true,
    detail: { persistedBefore, persistGranted: persist, quotaMB: estimate?.quota ? Math.round(estimate.quota / 1e6) : undefined, usageKB: estimate?.usage ? Math.round(estimate.usage / 1e3) : undefined },
  });

  // Markers left by the first context that ran this: a browser tab and the installed app should
  // see each other's.
  const existing = localStorage.getItem(MARKER_KEY);
  if (!existing) localStorage.setItem(MARKER_KEY, JSON.stringify({ at: new Date().toISOString(), in: displayMode() }));
  const idbMarker = await idbMarkerRoundTrip();
  record({
    id: 'S2',
    title: 'Storage shared between the browser tab and the installed app',
    ok: true,
    detail: { thisContext: displayMode(), localStorageMarker: existing ? JSON.parse(existing) : '(none yet; written now)', indexedDbMarker: idbMarker },
  });

  record({
    id: 'S3',
    title: 'Web Locks and BroadcastChannel (sync needs both)',
    ok: 'locks' in navigator && typeof BroadcastChannel === 'function',
    detail: { locks: 'locks' in navigator, broadcastChannel: typeof BroadcastChannel === 'function', serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller) },
  });
}

function idbMarkerRoundTrip(): Promise<unknown> {
  return new Promise((resolve) => {
    const open = indexedDB.open('repworks-spike', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => resolve(`open failed: ${String(open.error)}`);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const get = store.get('marker');
      get.onsuccess = () => {
        if (get.result === undefined) store.put({ at: new Date().toISOString(), in: displayMode() }, 'marker');
      };
      tx.oncomplete = () => {
        resolve(get.result ?? '(none yet; written now)');
        db.close();
      };
      tx.onerror = () => resolve(`transaction failed: ${String(tx.error)}`);
    };
  });
}

async function datasetCheck(): Promise<void> {
  const started = performance.now();
  try {
    const response = await fetch(DATASET, { cache: 'no-store' });
    const text = await response.text();
    record({ id: 'P1', title: 'puzzle-explorer-data meta.json, cross-origin', ok: response.ok, ms: Math.round(performance.now() - started), detail: { status: response.status, type: response.type, body: text.slice(0, 300) } });
  } catch (error) {
    record({ id: 'P1', title: 'puzzle-explorer-data meta.json, cross-origin', ok: false, detail: { thrown: String(error), note: 'A TypeError here usually means CORS refused it.' } });
  }
}

function wire(): void {
  $('where').textContent = `This page is open in a ${displayMode()}.`;
  $('build').textContent = __BUILD_ID__;

  $('github-save').addEventListener('click', () => {
    const repo = $<HTMLInputElement>('repo').value.trim();
    const token = $<HTMLInputElement>('token').value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || token.length < 20) return log('✗ Enter the repo as owner/name and paste the whole token.');
    if (!token.startsWith('github_pat_')) log('! That is not a fine-grained token (they start with github_pat_). Saved anyway.');
    save(repo, token);
    $<HTMLInputElement>('token').value = '';
    renderSaved();
    log('✓ Saved on this device.');
  });
  $('github-forget').addEventListener('click', () => {
    localStorage.removeItem(GITHUB_KEY);
    $('qr').replaceChildren();
    renderSaved();
    log('✓ Forgot the token on this device.');
  });
  $('qr-show').addEventListener('click', () => {
    const saved = loadSaved();
    if (!saved) return;
    const link = `${location.origin}${location.pathname}#setup?${new URLSearchParams({ repo: saved.repo, token: saved.token })}`;
    $('qr').innerHTML = renderSVG(link, { ecc: 'M', border: 2 });
    $('qr-hide').hidden = false;
  });
  $('qr-hide').addEventListener('click', () => {
    $('qr').replaceChildren();
    $('qr-hide').hidden = true;
  });
  $('github-run').addEventListener('click', async () => {
    const saved = loadSaved();
    if (!saved) return;
    $<HTMLButtonElement>('github-run').disabled = true;
    try {
      await runGithubChecks(saved.token, saved.repo, log);
      log('Done with GitHub.');
    } catch (error) {
      log(`Stopped: ${String(error)}`);
    } finally {
      $<HTMLButtonElement>('github-run').disabled = false;
    }
  });
  $('lichess-login').addEventListener('click', () => void startLogin());
  $('lichess-run').addEventListener('click', () => void runLichessChecks($<HTMLInputElement>('study').value, log).then(renderSaved));
  $('lichess-revoke').addEventListener('click', () => void revoke(log).then(renderSaved));
  $('other-run').addEventListener('click', async () => {
    await storageChecks();
    await datasetCheck();
    log('Done with storage and the dataset.');
  });
  $('report-copy').addEventListener('click', async () => {
    const text = fullReport(__BUILD_ID__);
    try {
      await navigator.clipboard.writeText(text);
      log(`✓ Report copied (${text.length} characters).`);
    } catch {
      $<HTMLTextAreaElement>('report-text').hidden = false;
      $<HTMLTextAreaElement>('report-text').value = text;
      log('Copy was refused: the report is in the box below; select all and copy it.');
    }
  });
  $('report-download').addEventListener('click', () => {
    const blob = new Blob([fullReport(__BUILD_ID__)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repworks-spike-${displayMode().startsWith('installed') ? 'app' : 'tab'}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('report-clear').addEventListener('click', () => {
    clearSteps();
    log('Report cleared (tokens and markers kept).');
  });
}

takeSetupLink();
wire();
onSteps(renderSteps);
renderSaved();
void handleCallback().then(renderSaved);
