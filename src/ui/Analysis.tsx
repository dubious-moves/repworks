// The analysis board's head (PLAN.md §5.35): a FEN to start from, and "Add to a chapter…": the
// line from the board's start to the move shown, into a chapter that reaches that start (the one
// the board was opened from first, then the repertoire's), as a variation, synced like any edit.
import { useEffect, useRef, useState } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { addToChapter, targetsFor, type Target } from '../app/analysis.ts';
import { at, chapter, feedback, openScratch } from '../app/editor.ts';
import { mode, open } from '../app/mode.ts';
import { positionAt } from '../core/study/tree.ts';

/** Back where the board came from: the chapter's move, or the list. */
function back(): void {
  const m = mode.peek();
  if (m.name === 'analysis' && m.from) open({ name: 'chapter', sid: m.from.sid, cid: m.from.cid, at: m.from.at });
  else open({ name: 'list' });
}

export function AnalysisHead() {
  const c = chapter.value;
  const [fen, setFen] = useState('');
  const [adding, setAdding] = useState(false);
  const start = c ? positionAt(c, []) : undefined;
  const line = at.value;
  return (
    <div class="chapter-head analysis-head">
      <a href="#/" class="back" onClick={(e) => (e.preventDefault(), back())}>
        ←
      </a>
      <div class="titles">
        <span class="study-title">Analysis board</span>
        <form
          class="fen-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (fen.trim() && openScratch(fen.trim())) setFen('');
          }}
        >
          <input aria-label="FEN" placeholder={start ? makeFen(start.toSetup()) : 'Paste a FEN'} value={fen} onInput={(e) => setFen(e.currentTarget.value)} />
          <button type="submit" class="secondary" disabled={!fen.trim()}>
            Set up
          </button>
          <button type="button" class="secondary" title="A new board from the start position" onClick={() => openScratch('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}>
            New
          </button>
        </form>
      </div>
      <button type="button" disabled={!line.length} title={line.length ? 'Add the line to the move shown to a chapter' : 'Play a move first'} onClick={() => setAdding(true)}>
        Add to a chapter…
      </button>
      {adding && c && <AddDialog targets={targetsFor(c)} sans={line} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddDialog(props: { targets: Target[]; sans: readonly string[]; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pick, setPick] = useState(0);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const add = async () => {
    const t = props.targets[pick];
    if (!t) return;
    const r = await addToChapter(t, props.sans);
    if (!r.ok) return setError(r.error);
    feedback.value = undefined;
    props.onClose();
    open({ name: 'chapter', sid: t.sid, cid: t.cid, at: r.path });
  };
  return (
    <dialog ref={ref} class="study-dialog" aria-labelledby="dialog-add-line" onCancel={(e) => (e.preventDefault(), props.onClose())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => (e.preventDefault(), void add())}>
        <h2 id="dialog-add-line">Add to a chapter</h2>
        <p>
          <strong>{props.sans.join(' ')}</strong>, from the board’s start.
        </p>
        {props.targets.length === 0 ? (
          <p class="muted">No chapter reaches the board’s start position. Open the board from a chapter’s move (its menu: Analyse from here) to add lines to it.</p>
        ) : (
          <fieldset>
            <legend>Into</legend>
            {props.targets.map((t, i) => (
              <label key={`${t.sid}/${t.cid}`} class="check">
                <input type="radio" name="target" checked={pick === i} onChange={() => setPick(i)} /> {t.label}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p class="warn" role="alert">
            {error}
          </p>
        )}
        <div class="dialog-buttons">
          <span class="spacer" />
          <button type="button" class="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={!props.targets.length}>
            Add
          </button>
        </div>
      </form>
    </dialog>
  );
}
