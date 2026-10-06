// A comment with its lines clickable (PLAN.md §5.12): each move of a `(7. Bc4 Qa5)` group is a
// link that previews the position on the board; ← → step through the comment's lines, and the bar
// under the board (◀ ▶ Back) does the same with no keyboard. Used in the chapter view, the Read
// view and the training screen.
import { useMemo } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import type { Position } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import { endPreview, previewOf, previewPosition, showLine, stepPreview, type PreviewOwner } from '../app/preview.ts';
import { cursorAt, parseCommentLines, playedLines } from '../core/repertoire/lines.ts';

export interface CommentPositions {
  /** The commented move's position (the start, for a comment before the first move). */
  after: Position;
  /** The position before the move; none at the start. */
  before: Position | undefined;
}

type Segment = { text: string } | { text: string; line: number; move: number };

function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  parseCommentLines(text).forEach((line, i) =>
    line.moves.forEach((m, j) => {
      if (m.from > at) out.push({ text: text.slice(at, m.from) });
      out.push({ text: text.slice(m.from, m.to), line: i, move: j });
      at = m.to;
    }),
  );
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

export function CommentText(props: {
  text: string;
  owner: PreviewOwner;
  /** The comment's identity (`commentId`). */
  id: string;
  /** Read when a move is clicked; undefined when the node's positions can't be worked out. */
  positions: () => CommentPositions | undefined;
  /** Before the preview starts (the chapter view shows the commented move first). */
  onOpen?: () => void;
}) {
  const parts = useMemo(() => segments(props.text), [props.text]);
  const shown = previewOf(props.owner);
  const mine = shown?.key === props.id ? shown.cursor : undefined;
  if (!parts.some((p) => 'line' in p)) return <>{props.text}</>;
  const open = (line: number, move: number) => (e: Event) => {
    e.stopPropagation();
    const at = props.positions();
    if (!at) return;
    const lines = playedLines(props.text, at.after, at.before);
    const cursor = cursorAt(lines, line, move);
    // A line whose first move isn't legal here has nothing to show.
    if (!cursor) return;
    props.onOpen?.();
    showLine(props.owner, props.id, lines, cursor);
  };
  return (
    <>
      {parts.map((p, i) =>
        'line' in p ? (
          <span
            key={i}
            class={`line-move${mine && mine.line === p.line && mine.ply === p.move + 1 ? ' current' : ''}`}
            role="button"
            tabIndex={0}
            onClick={open(p.line, p.move)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(p.line, p.move)(e))}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** The board of a preview: its position and last move, or undefined when none is shown. */
export function previewBoard(owner: PreviewOwner): { fen: string; turn: 'white' | 'black'; lastMove: [Key, Key] | undefined; check: boolean } | undefined {
  const p = previewOf(owner);
  if (!p) return undefined;
  const { position, uci } = previewPosition(p);
  const m = parseUci(uci);
  const sq = (n: number) => `${'abcdefgh'[n & 7]}${(n >> 3) + 1}` as Key;
  const lastMove: [Key, Key] | undefined = m && 'from' in m ? [sq(m.from), sq(m.to)] : undefined;
  return { fen: makeFen(position.toSetup()), turn: position.turn, lastMove, check: position.isCheck() };
}

/** A click on the board itself (not the bar under it) ends a preview. */
export function endPreviewOnBoard(e: MouseEvent): void {
  if ((e.target as Element | null)?.closest('.board')) endPreview();
}

/** Under the board while a line is previewed: where it is, and ◀ ▶ Back for the phone. */
export function PreviewBar(props: { owner: PreviewOwner }) {
  const p = previewOf(props.owner);
  if (!p) return null;
  const line = p.lines[p.cursor.line]!;
  return (
    <div class="preview-bar" role="group" aria-label="Line from the comment">
      <span class="preview-moves">
        From the comment: <strong>{line.sans.slice(0, p.cursor.ply).join(' ')}</strong>
      </span>
      <span class="preview-buttons">
        <button type="button" aria-label="Previous move in the line" onClick={() => stepPreview(-1)}>
          ◀
        </button>
        <button type="button" aria-label="Next move in the line" onClick={() => stepPreview(1)}>
          ▶
        </button>
        <button type="button" class="secondary" onClick={endPreview}>
          Back
        </button>
      </span>
    </div>
  );
}
