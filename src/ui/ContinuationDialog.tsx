// Lc0 vs Maia from a move (PLAN.md §5.144): the move menu's dialog. Its settings (Lc0's side, the
// moves, Lc0's search), the line as it is decided with where each move came from, Lc0's search
// as it goes, and at the end "Add to the chapter" or a copy.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  addContinuation,
  closeContinuation,
  continuation,
  CONTINUATION_FILES,
  continuationText,
  NODE_CHOICES,
  PLY_CHOICES,
  runContinuation,
  setRunOptions,
  stopContinuation,
  type ContinuationRun,
} from '../app/continuation.ts';
import { doc, feedback } from '../app/editor.ts';
import { BLEND_GAMES, type ContinuationPly } from '../core/lc0/continuation.ts';
import { formatScore } from '../core/engine/uci.ts';
import { filterLabel } from '../core/explorer/details.ts';
import { storedBytes } from '../platform/blobs.ts';
import { megabytes } from './Engines.tsx';

export function ContinuationDialog() {
  // Leaving the study page ends a run.
  useEffect(() => () => closeContinuation(), []);
  return continuation.value ? <Dialog /> : null;
}

const pct = (p: number): string => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);
const count = (n: number) => n.toLocaleString('en-US');
const plyNumber = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}`;

/** Where a move came from, in words. */
function source(m: ContinuationPly, r: ContinuationRun): string {
  if (m.lc0) {
    const l = m.lc0;
    if (l.forced === 'mate') return 'Lc0 · mate';
    if (l.forced === 'only') return 'Lc0 · the only move';
    const visits = l.moves[0]?.visits ?? 0;
    // Lc0's score is its side's: from White's as the engine lines write it.
    const cp = r.lc0 === 'white' ? l.cp : -l.cp;
    // Ended once no other move could catch up in the nodes left.
    const early = l.nodes < r.nodes ? ' (decided early)' : '';
    return `Lc0 · ${pct(visits / Math.max(1, l.nodes - 1))} of ${count(l.nodes)} nodes${early} · ${formatScore({ cp })}`;
  }
  const p = m.people!;
  const why = m.dbError ? ` (no database: ${m.dbError})` : '';
  if (p.source === 'db') return `Lichess · ${pct(p.share)} of ${count(p.games)} games`;
  if (p.source === 'blend') return `Lichess ${pct(p.share)} of ${count(p.games)} games, Maia ${pct(p.maia ?? 0)}: ${pct(p.prob)}`;
  return `Maia ${r.maiaElo} · ${pct(p.maia ?? p.prob)}${p.games ? '' : why || ' (no games)'}`;
}

function Dialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [have, setHave] = useState(0);
  const r = continuation.value!;
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
    void storedBytes(CONTINUATION_FILES).then(setHave);
  }, []);
  const busy = r.phase === 'running' || r.phase === 'downloading';
  const bytes = CONTINUATION_FILES.reduce((n, f) => n + f.bytes, 0) - have;
  const next = r.startPly + r.moves.length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(continuationText(r));
      feedback.value = 'Continuation copied';
    } catch {
      feedback.value = 'The browser did not allow copying';
    }
  };
  return (
    <dialog ref={ref} class="study-dialog continuation-dialog" aria-labelledby="dialog-continuation" onCancel={(e) => (e.preventDefault(), closeContinuation())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => e.preventDefault()}>
        <h2 id="dialog-continuation">Lc0 vs Maia from {r.fromLabel}</h2>
        <div class="continuation-options">
          <label>
            Lc0 plays{' '}
            <select name="lc0" value={r.lc0} disabled={busy} onChange={(e) => setRunOptions({ lc0: e.currentTarget.value as 'white' | 'black' })}>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
          <label>
            Moves{' '}
            <select name="plies" value={r.plies} disabled={busy} onChange={(e) => setRunOptions({ plies: Number(e.currentTarget.value) })}>
              {PLY_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n} plies
                </option>
              ))}
            </select>
          </label>
          <label>
            Lc0’s search{' '}
            <select name="nodes" value={r.nodes} disabled={busy} onChange={(e) => setRunOptions({ nodes: Number(e.currentTarget.value) })}>
              {NODE_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {count(n)} nodes
                </option>
              ))}
            </select>
          </label>
        </div>
        <p class="muted continuation-about">
          Lc0 searches its moves (about a tenth of a second a node on a desktop). The other side plays the Lichess database’s most played move ({filterLabel(r.filter.speeds, r.filter.ratings)}); under {BLEND_GAMES} games Maia {r.maiaElo}’s
          likelihood is blended in, Maia alone with none.
        </p>
        {r.moves.length > 0 && (
          <ol class="continuation-moves" aria-label="The continuation">
            {r.moves.map((m, i) => (
              <li key={i} class={m.by}>
                <strong>
                  {plyNumber(r.startPly + i)}
                  {(r.startPly + i) % 2 ? '' : ' '}
                  {m.san}
                </strong>{' '}
                <span class="muted">{source(m, r)}</span>
              </li>
            ))}
          </ol>
        )}
        {r.phase === 'running' && (
          <p class="continuation-now" role="status">
            {r.thinking ? (
              <>
                {plyNumber(next)} Lc0 searching: {count(r.thinking.nodes)} of {count(r.nodes)} nodes{r.thinking.best.san ? `, ${r.thinking.best.san} so far` : ''}
                <span class="maia-progress">
                  <span style={{ width: `${(100 * r.thinking.nodes) / r.nodes}%` }} />
                </span>
              </>
            ) : r.looking ? (
              `${plyNumber(next)} Looking up the most played move…`
            ) : (
              'Starting Lc0…'
            )}
          </p>
        )}
        {r.phase === 'done' && r.ended && (
          <p class="muted" role="status">
            {r.ended === 'stopped' ? 'Stopped.' : r.ended === 'game over' ? 'The game is over.' : 'Neither the database nor Maia knows a move here.'}
          </p>
        )}
        {(r.phase === 'missing' || r.phase === 'downloading') && (
          <p>
            Lc0’s network and Maia are needed: a <strong>one-time {megabytes(bytes)} download</strong>, kept on this device.
          </p>
        )}
        {r.phase === 'downloading' && (
          <div role="progressbar" aria-label="The download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.total ? Math.floor((100 * (r.received ?? 0)) / r.total) : 0}>
            <div class="maia-progress">
              <div style={{ width: `${r.total ? (100 * (r.received ?? 0)) / r.total : 0}%` }} />
            </div>
          </div>
        )}
        {r.error && (
          <p class="warn" role="alert">
            {r.error}
          </p>
        )}
        <div class="dialog-buttons">
          {r.phase === 'done' && r.moves.length > 0 && doc.value && (
            <button type="button" class="primary" onClick={() => addContinuation()}>
              Add to the chapter
            </button>
          )}
          {r.phase === 'done' && r.moves.length > 0 && (
            <button type="button" class="secondary" onClick={() => void copy()}>
              Copy
            </button>
          )}
          <span class="spacer" />
          {busy ? (
            <button type="button" class="secondary" onClick={stopContinuation}>
              Stop
            </button>
          ) : (
            <button type="button" class={r.phase === 'done' && r.moves.length ? 'secondary' : 'primary'} onClick={() => void runContinuation(r.phase === 'missing')}>
              {r.phase === 'missing' ? `Download (${megabytes(bytes)}) and start` : r.phase === 'done' || r.phase === 'failed' ? 'Run again' : 'Start'}
            </button>
          )}
          <button type="button" class="secondary" onClick={closeContinuation}>
            Close
          </button>
        </div>
      </form>
    </dialog>
  );
}
