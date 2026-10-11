// A game card's note (PLAN.md §5.91): shown once the card is answered, its lines clickable on the
// trainer's board and its arrows drawn there; written in a dialog on the card's own position, where
// arrows and circles are drawn on the board (right-drag, or ✎ on a phone) and a line is played on
// it and added to the words as `(12. Bxf7+ Kxf7)`.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { parseSquare } from 'chessops/util';
import type { Role } from 'chessops/types';
import type { Key } from '@lichess-org/chessground/types';
import { cardNote, saveNote } from '../app/notes.ts';
import { commentId } from '../app/preview.ts';
import { positionOf } from '../core/storm/walk.ts';
import type { Brush, Shape } from '../core/study/model.ts';
import { Board } from './Board.tsx';
import { CommentText } from './CommentText.tsx';
import { numbered } from './Train.tsx';

const BRUSH_NAMES: Brush[] = ['green', 'red', 'blue', 'yellow'];

/** The card's note under the trainer's board, its lines clickable (they start at the card's position). */
export function NoteText(props: { card: string; fen: string }) {
  const note = cardNote(props.card);
  if (!note?.text) return null;
  return (
    <div class="train-comments card-note" data-testid="card-note">
      {note.text.split('\n').map((t, i) => (
        <p key={i}>
          <CommentText text={t} owner="games" id={commentId(`${props.card}#${i}`, t)} positions={() => (positionOf(props.fen) ? { after: positionOf(props.fen)!, before: undefined } : undefined)} />
        </p>
      ))}
    </div>
  );
}

/** The note's arrows and circles, for the board once the card is answered. */
export function noteArrows(card: string): { orig: string; dest?: string; brush: string }[] {
  return (cardNote(card)?.shapes ?? []).map((s) => ({ orig: s.orig, ...(s.dest ? { dest: s.dest } : {}), brush: s.brush }));
}

/** "✎ Note" for a card: the dialog behind it. */
export function NoteButton(props: { card: string; fen: string; color: 'white' | 'black'; /** Before the dialog opens (the storm holds its verdict). */ onOpen?(): void }) {
  const [editing, setEditing] = useState(false);
  const has = !!cardNote(props.card);
  return (
    <>
      <button type="button" class="secondary" data-testid="note-button" title="Words, arrows and lines on this position: why the moves fail. Shown after the card is answered." onClick={() => (props.onOpen?.(), setEditing(true))}>
        ✎ {has ? 'Edit the note' : 'Add a note'}
      </button>
      {editing && <NoteDialog card={props.card} fen={props.fen} color={props.color} onClose={() => setEditing(false)} />}
    </>
  );
}

export function NoteDialog(props: { card: string; fen: string; color: 'white' | 'black'; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const before = useMemo(() => cardNote(props.card), [props.card]);
  const [text, setText] = useState(before?.text ?? '');
  const [shapes, setShapes] = useState<Shape[]>(before?.shapes ?? []);
  const [line, setLine] = useState<{ san: string; from: Key; to: Key }[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [brush, setBrush] = useState<Brush>('green');
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const start = useMemo(() => positionOf(props.fen), [props.fen]);
  const pos = useMemo(() => {
    const p = start?.clone();
    for (const { san } of line) {
      const m = p && parseSan(p, san);
      if (m) p!.play(m);
    }
    return p;
  }, [start, line]);
  if (!start || !pos) return null;

  const play = (orig: Key, dest: Key, role?: Role) => {
    const move = normalizeMove(pos, { from: parseSquare(orig)!, to: parseSquare(dest)!, ...(role ? { promotion: role } : {}) });
    if (!pos.isLegal(move)) return;
    setLine([...line, { san: makeSanAndPlay(pos.clone(), move), from: orig, to: dest }]);
  };
  const onMove = (orig: Key, dest: Key) => {
    const piece = pos.board.get(parseSquare(orig)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    play(orig, dest);
  };
  /** The line played, into the words at the cursor (at the end when the box hasn't been touched). */
  const addLine = () => {
    const group = `(${numbered(start, sans)})`;
    const el = area.current;
    const at = el && document.activeElement === el ? el.selectionStart : text.length;
    const head = text.slice(0, at);
    const tail = text.slice(at);
    const sep = (s: string) => (s && !/\s$/.test(s) ? ' ' : '');
    setText(`${head}${sep(head)}${group}${tail && !/^\s/.test(tail) ? ' ' : ''}${tail}`);
    setLine([]);
  };
  const save = async (t: string, s: readonly Shape[]) => {
    await saveNote(props.card, t, s);
    props.onClose();
  };
  const sans = line.map((m) => m.san);
  const last = line[line.length - 1];
  return (
    <dialog ref={ref} class="study-dialog note-dialog" aria-labelledby="dialog-note" onCancel={(e) => (e.preventDefault(), props.onClose())}>
      <form class="form" method="dialog" noValidate onSubmit={(e) => (e.preventDefault(), void save(text, shapes))}>
        <h2 id="dialog-note">Note on this position</h2>
        <p class="muted">Shown after the card is answered. Draw arrows and circles on the position{drawMode ? '' : ' (right-drag, or ✎)'}; play moves on the board to write a line.</p>
        <Board
          fen={makeFen(pos.toSetup())}
          orientation={props.color}
          turn={pos.turn}
          dests={drawMode ? new Map() : (chessgroundDests(pos) as Map<Key, Key[]>)}
          lastMove={last ? [last.from, last.to] : undefined}
          check={pos.isCheck()}
          shapes={line.length ? [] : shapes}
          drawMode={drawMode && !line.length}
          brush={brush}
          onMove={onMove}
          {...(line.length ? {} : { onShapes: setShapes })}
          promotion={promotion && { dest: promotion.dest, onPick: (role) => (setPromotion(undefined), role && play(promotion.orig, promotion.dest, role)) }}
        />
        {drawMode && !line.length && (
          <div class="brushes" role="radiogroup" aria-label="Colour">
            {BRUSH_NAMES.map((b) => (
              <button key={b} type="button" role="radio" aria-checked={brush === b} aria-label={b} class={`brush brush-${b}${brush === b ? ' on' : ''}`} onClick={() => setBrush(b)} />
            ))}
          </div>
        )}
        <div class="note-line" data-testid="note-line">
          {line.length ? (
            <>
              <span>
                Line: <strong>{numbered(start, sans)}</strong>
              </span>
              <span class="note-line-buttons">
                <button type="button" onClick={addLine}>
                  Add to the note
                </button>
                <button type="button" class="secondary" aria-label="Take back a move" onClick={() => setLine(line.slice(0, -1))}>
                  ↶
                </button>
                <button type="button" class="secondary" onClick={() => setLine([])}>
                  Clear
                </button>
              </span>
            </>
          ) : (
            <>
              <span class="muted">{shapes.length ? `${shapes.length} arrow${shapes.length === 1 ? '' : 's'} or circle${shapes.length === 1 ? '' : 's'}` : 'No arrows'}</span>
              <span class="note-line-buttons">
                <button type="button" aria-pressed={drawMode} aria-label="Draw mode" class={`secondary touch-only${drawMode ? ' on' : ''}`} onClick={() => setDrawMode(!drawMode)}>
                  ✎
                </button>
                {shapes.length > 0 && (
                  <button type="button" class="secondary" onClick={() => setShapes([])}>
                    Clear arrows
                  </button>
                )}
              </span>
            </>
          )}
        </div>
        <label>
          Note
          <textarea ref={area} rows={4} value={text} data-testid="note-text" placeholder="Why the moves here fail, e.g. Bxf7+? (12. Bxf7+ Kxf7 13. Ng5+ Kg8)" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        </label>
        <div class="dialog-buttons">
          {before && (
            <button type="button" class="secondary" onClick={() => void save('', [])}>
              Delete the note
            </button>
          )}
          <span class="spacer" />
          <button type="button" class="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" class="primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
