// Setting a device up by hand, and the QR code that sets up another one (PLAN.md §4.9).
import { useState } from 'preact/hooks';
import { renderSVG } from 'uqr';
import { setUp, settings } from '../app/state.ts';
import { guessDeviceName } from '../app/setup.ts';
import { checkSetup, setupLink } from '../core/sync/setup.ts';

export function SetupForm(props: { title?: string }) {
  const current = settings.value;
  const [repo, setRepo] = useState(current?.repo ?? '');
  const [token, setToken] = useState('');
  const [name, setName] = useState(guessDeviceName());
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    const checked = checkSetup({ repo, token, name });
    if (!checked.ok) return setError(checked.error);
    setError(undefined);
    setBusy(true);
    await setUp(checked.value);
    setBusy(false);
    setToken('');
  };
  return (
    <form class="card setup" onSubmit={submit}>
      <h2>{props.title ?? 'Set up this device'}</h2>
      <p class="muted">
        The data repo and a fine-grained token with Contents read and write on it only. Or open a setup link, or scan the code another device shows.
      </p>
      <label>
        Data repo
        <input name="repo" value={repo} onInput={(e) => setRepo(e.currentTarget.value)} placeholder="owner/repworks-data" autocomplete="off" autocapitalize="off" spellcheck={false} required />
      </label>
      <label>
        Token
        <input name="token" type="password" value={token} onInput={(e) => setToken(e.currentTarget.value)} placeholder="github_pat_…" autocomplete="off" required />
      </label>
      {!current && (
        <label>
          This device's name
          <input name="name" value={name} onInput={(e) => setName(e.currentTarget.value)} maxLength={40} />
        </label>
      )}
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Checking…' : current ? 'Use this token' : 'Set up'}
      </button>
    </form>
  );
}

/** The setup link for another device, as a QR code, shown only on request: it holds the token. */
export function OtherDeviceCode() {
  const current = settings.value;
  const [shown, setShown] = useState(false);
  if (!current) return null;
  const link = setupLink(`${location.origin}${import.meta.env.BASE_URL}`, { repo: current.repo, token: current.token, name: 'phone', ...(current.write === 'rest' ? { write: 'rest' as const } : {}) });
  return (
    <div class="other-device">
      {!shown ? (
        <button type="button" onClick={() => setShown(true)}>
          Set up another device…
        </button>
      ) : (
        <>
          <p class="muted">Scan with the other device's camera. The code holds the token: don't share it or leave it on screen.</p>
          <div class="qr" dangerouslySetInnerHTML={{ __html: renderSVG(link, { ecc: 'M', border: 2 }) }} />
          <button type="button" onClick={() => setShown(false)}>
            Hide
          </button>
        </>
      )}
    </div>
  );
}
