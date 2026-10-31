// Lc0's download dialog (PLAN.md §5.143), as Maia's: what it shows, the one-time download (the
// network, and the runtime unless Maia brought it already), credit to its authors, the progress.
import { useEffect, useRef, useState } from 'preact/hooks';
import { cancelLc0, downloadLc0, LC0_FILES, lc0Dialog, lc0State } from '../app/lc0.ts';
import { storedBytes } from '../platform/blobs.ts';
import { megabytes } from './Engines.tsx';

export function Lc0Dialog() {
  return lc0Dialog.value ? <Dialog /> : null;
}

function Dialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [have, setHave] = useState(0);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
    void storedBytes(LC0_FILES).then(setHave);
  }, []);
  const s = lc0State.value;
  const bytes = LC0_FILES.reduce((n, f) => n + f.bytes, 0) - have;
  const phone = matchMedia('(max-width: 899px)').matches;
  return (
    <dialog ref={ref} class="study-dialog maia-dialog" aria-labelledby="dialog-lc0" onCancel={(e) => (e.preventDefault(), s.kind !== 'downloading' && cancelLc0())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => e.preventDefault()}>
        <h2 id="dialog-lc0">Enable Lc0</h2>
        <p>
          Lc0 (Leela Chess Zero) is a neural network engine that plays in a more human, positional style than Stockfish. Here it looks at the board’s position without searching: beside each of Stockfish’s lines, how much
          Lc0 likes its first move; where two or more lines are within 0.30 of the best, <strong>its pick</strong> is marked; and under them, its own eval, its win, draw and loss chances, and the moves it likes most.
        </p>
        <p>
          It needs a <strong>one-time {megabytes(bytes)} download</strong>, kept on this device; it runs entirely on the device.{phone ? ' On mobile data, better wait for Wi-Fi.' : ''}
        </p>
        <p class="muted">
          Lc0 and its network 791556 are the work of the LCZero project (
          <a href="https://lczero.org/" target="_blank" rel="noopener">
            lczero.org
          </a>
          ), under the GPL-3.0: all credit to them.
        </p>
        {s.kind === 'downloading' && (
          <div role="progressbar" aria-label="Lc0’s download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor((100 * s.received) / s.total)}>
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
          <button type="button" class="secondary" disabled={s.kind === 'downloading'} onClick={cancelLc0}>
            Cancel
          </button>
          <button type="button" class="primary" disabled={s.kind === 'downloading'} onClick={() => void downloadLc0()}>
            Download ({megabytes(bytes)})
          </button>
        </div>
      </form>
    </dialog>
  );
}
