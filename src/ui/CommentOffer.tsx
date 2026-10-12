// The lines from the comments offered in review (PLAN.md §5.98): a small notice in the counters'
// row, there from the moment the walk reaches a position a comment's line starts from, its count
// growing as it reaches more. Nothing pops up by itself: hovering it (or a tap, or the keyboard)
// shows the card of lines; where the pointer hovers (a desktop), a click on the chip is "Quiz now"
// on the line met last (the one nearest the board) not quizzed yet. The card shows each line's start on a small board, the opponent's first move as an arrow, "Quiz now" (the
// line played on the board from where it starts, the walk resuming after it), and a switch for
// whether "Quiz lines" plays it at the line's end. A line whose first move is marked ! or !! is
// important, in gold.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { makeFen } from 'chessops/fen';
import type { Position } from 'chessops/chess';
import { pickComment, quizComments, type SessionView } from '../app/train.ts';
import type { QuizLine } from '../core/train/commentQuiz.ts';

/** A board to look at: a position and an arrow, no moves, no coordinates. */
export function MiniBoard(props: { position: Position; orientation: 'white' | 'black'; arrow?: string; lastMove?: [Key, Key] | undefined }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const config = () => ({
    fen: makeFen(props.position.toSetup()),
    orientation: props.orientation,
    turnColor: props.position.turn,
    lastMove: props.lastMove,
    drawable: { autoShapes: props.arrow ? [{ orig: props.arrow.slice(0, 2) as Key, dest: props.arrow.slice(2, 4) as Key, brush: 'blue' }] : [] },
  });
  useEffect(() => {
    api.current = Chessground(el.current!, { ...config(), viewOnly: true, coordinates: false, animation: { enabled: false }, drawable: { ...config().drawable, enabled: false, visible: true } });
    return () => api.current?.destroy();
  }, []);
  useLayoutEffect(() => {
    api.current?.set(config());
  });
  return (
    <div class="mini-board">
      <div class="cg-host" ref={el} />
    </div>
  );
}

const sq = (uci: string, i: number) => uci.slice(i, i + 2) as Key;

/** A pointer that hovers (a mouse or trackpad): the card shows on hover, so a click can do more. */
const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** The notice, and its card of lines while hovered, focused or opened by a tap. */
export function CommentOffer(props: { s: SessionView }) {
  const { s } = props;
  const offered = s.comments ?? [];
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A press outside closes the card opened by a tap; so do Escape and a new line.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  const lineKey = s.line && `${s.line.sid}/${s.line.cid}/${s.line.path.join(' ')}/${s.number}`;
  useEffect(() => setOpen(false), [lineKey]);
  if (offered.length === 0) return null;
  const on = offered.filter((o) => o.on);
  const important = offered.some((o) => o.line.important);
  const title = `${offered.length === 1 ? 'A line' : `${offered.length} lines`} from the comments${on.length ? `: ${on.length === offered.length ? '' : `${on.length} `}offered at the line's end` : ': none offered at the line\'s end (pick them here)'}`;
  const quiz = (key: string) => {
    setOpen(false);
    setHover(false);
    quizComments(key);
  };
  // A click's line, where the card shows on hover: the last met not quizzed, else the last.
  const clickable = s.canQuiz && canHover() ? ([...offered].reverse().find((o) => !o.done) ?? offered.at(-1)) : undefined;
  const click = (e: MouseEvent) => {
    // A click by the mouse over the chip (the card already shown by hovering): "Quiz now". A tap or the keyboard opens the card.
    if (clickable && hover && e.detail > 0) return quiz(clickable.line.key);
    setOpen(!open);
  };
  return (
    <div class="comment-offer" ref={ref} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}>
      <button
        type="button"
        class={`comment-offer-chip${important ? ' important' : ''}${on.length === 0 ? ' off' : ''}`}
        aria-expanded={open || hover}
        aria-label={title}
        title={clickable ? `${title} · Click: quiz ${clickable.line.label} now` : title}
        onClick={click}
      >
        {important && (
          <span class="comment-offer-mark" aria-hidden="true">
            !
          </span>
        )}
        <span class="comment-offer-word">Comment lines</span>
        <span class="comment-offer-short">Lines</span> <span class="comment-offer-count">{on.length === offered.length ? offered.length : `${on.length}/${offered.length}`}</span>
      </button>
      {(open || hover) && (
        <div class="comment-offer-card" role="group" aria-label="Lines from the comments">
          <p class="comment-offer-lead">From the comments: quiz one now, or at the line's end</p>
          <ul>
            {offered.map(({ line, on, done }) => (
              <OfferedLine key={line.key} line={line} on={on} done={done} can={!!s.canQuiz} quiz={quiz} side={s.side} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfferedLine(props: { line: QuizLine; on: boolean; done: boolean; can: boolean; quiz: (key: string) => void; side: 'white' | 'black' }) {
  const { line } = props;
  const first = line.ucis[0]!;
  return (
    <li class={`comment-offer-line${line.important ? ' important' : ''}`}>
      <MiniBoard position={line.positions[0]!} orientation={props.side} arrow={first} lastMove={undefined} />
      <span class="comment-offer-move">
        {line.important && <span class="comment-offer-tag">Important</span>}
        <strong>{line.label}</strong>
        <span class="muted"> {line.own.filter(Boolean).length === 1 ? '1 move to find' : `${line.own.filter(Boolean).length} moves to find`}</span>
      </span>
      <span class="comment-offer-acts">
        <button type="button" class="secondary" disabled={!props.can} onClick={() => props.quiz(line.key)} title="Play it on the board now, from where it starts; the line goes on after it">
          {props.done ? 'Quiz again' : 'Quiz now'}
        </button>
        {props.done ? (
          <span class="muted comment-offer-done">Quizzed</span>
        ) : (
          <label class="comment-offer-pick">
            <input type="checkbox" checked={props.on} onChange={(e) => pickComment(line.key, e.currentTarget.checked)} /> At the end
          </label>
        )}
      </span>
    </li>
  );
}

/** The last move of a line from the comments on the board, for the board's highlight. */
export function asideLastMove(s: SessionView): [Key, Key] | undefined {
  const a = s.aside;
  if (!a || a.ply === 0) return undefined;
  const uci = a.line.ucis[a.ply - 1]!;
  return [sq(uci, 0), sq(uci, 2)];
}
