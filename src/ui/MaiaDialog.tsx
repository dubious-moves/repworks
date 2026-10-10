// Qchess's Maia dialog (PLAN.md §5.32): what Maia is, the one-time download (the model and the
// runtime, about 60 MB, kept on this device), credit to its authors, then the progress.
import { useEffect, useRef } from 'preact/hooks';
import { cancelMaia, downloadMaia, MAIA_FILES, maiaDialog, maiaElo, maiaState } from '../app/maia.ts';
import { megabytes } from './Engines.tsx';

export function MaiaDialog() {
  return maiaDialog.value ? <Dialog /> : null;
}

function Dialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const s = maiaState.value;
  const bytes = MAIA_FILES.reduce((n, f) => n + f.bytes, 0);
  const phone = matchMedia('(max-width: 899px)').matches;
  return (
    <dialog ref={ref} class="study-dialog maia-dialog" aria-labelledby="dialog-maia" onCancel={(e) => (e.preventDefault(), s.kind !== 'downloading' && cancelMaia())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => e.preventDefault()}>
        <h2 id="dialog-maia">Enable Maia</h2>
        <p>
          Maia 3 is a neural network that predicts how likely human players of a given rating are to play each move, and what score they can expect. The explorer shows it beside the games: <strong>Ml</strong>, the
          likelihood of a move for a {maiaElo.value} player, and <strong>Ms</strong>, the score Maia expects after it. It is most useful where there are few or no games. The storm uses it to rate each position’s difficulty and to find the unintuitive ones.
        </p>
        <p>
          It needs a <strong>one-time {megabytes(bytes)} download</strong>, kept on this device; it runs entirely on the device.{phone ? ' On mobile data, better wait for Wi-Fi.' : ''}
        </p>
        <p class="muted">
          Maia is the work of the CSSLab at the University of Toronto (
          <a href="https://www.maiachess.com/" target="_blank" rel="noopener">
            maiachess.com
          </a>
          ), under the GPL-3.0: all credit to them.
        </p>
        {s.kind === 'downloading' && (
          <div role="progressbar" aria-label="Maia’s download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor((100 * s.received) / s.total)}>
            <div class="maia-progress">
              <div style={{ width: `${(100 * s.received) / s.total}%` }} />
            </div>
            <span class="muted">
              {megabytes(s.received)} of {megabytes(s.total)}
            </span>
          </div>
        )}
        {s.kind === 'failed' && (
          <p class="warn" role="alert">
            {s.reason}
          </p>
        )}
        <div class="dialog-buttons">
          <span class="spacer" />
          <button type="button" class="secondary" disabled={s.kind === 'downloading'} onClick={cancelMaia}>
            Cancel
          </button>
          <button type="button" class="primary" disabled={s.kind === 'downloading'} onClick={() => void downloadMaia()}>
            Download ({megabytes(bytes)})
          </button>
        </div>
      </form>
    </dialog>
  );
}
