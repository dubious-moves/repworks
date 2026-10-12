// A comment with its lines clickable (PLAN.md §5.12): each move of a `(7. Bc4 Qa5)` group is a
// link (words written in the group are plain text, `--` a pass) that previews the position on the board; ← → step through the comment's lines, and the bar
// under the board (◀ ▶ Back) does the same with no keyboard. Used in the chapter view, the Read
// view and the training screen.
import { useMemo } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import type { Position } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import { endPreview, previewOf, previewPosition, showLine, stepPreview, type PreviewOwner } from '../app/preview.ts';
import { playLine } from '../app/editor.ts';
import { cursorAt, parseCommentLines, playedLines, type PlayedLine } from '../core/repertoire/lines.ts';

export interface CommentPositions {
  /** The commented move's position (the start, for a comment before the first move). */
  after: Position;
  /** The position before the move; none at the start. */
  before: Position | undefined;
}

type Piece = { text: string } | { text: string; line: number; move: number };
/** Plain text, or a run of a line group (its moves clickable), or a line left out. Words written in a line are plain. */
type Segment = { text: string } | { group: Piece[] } | { masked: true };

/**
 * The comment cut into text and lines. With the lines played (`played`), a line that fits neither
 * position stays text, as in q_extension; without them every group is drawn as a line. A line's
 * words are plain text between runs of the line, so they read as the comment around it.
 */
function segments(text: string, played: readonly PlayedLine[] | undefined, hidden?: (line: PlayedLine) => boolean): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  parseCommentLines(text).forEach((line, i) => {
    if (played && !played[i]?.placed) return;
    if (line.from > at) out.push({ text: text.slice(at, line.from) });
    if (played && hidden?.(played[i]!)) {
      out.push({ masked: true });
      at = line.to;
      return;
    }
    const marks = [...line.moves.map((m, j) => ({ ...m, move: j })), ...line.words.map((w) => ({ ...w, move: -1 }))].sort((a, b) => a.from - b.from);
    let group: Piece[] = [];
    let g = line.from;
    for (const m of marks) {
      if (m.from > g) group.push({ text: text.slice(g, m.from) });
      if (m.move >= 0) group.push({ text: text.slice(m.from, m.to), line: i, move: m.move });
      else {
        if (group.length) out.push({ group });
        group = [];
        out.push({ text: text.slice(m.from, m.to) });
      }
      g = m.to;
    }
    if (g < line.to) group.push({ text: text.slice(g, line.to) });
    if (group.length) out.push({ group });
    at = line.to;
  });
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
  /** A line left out of the text, as `(…)`: training's lines from the comments still to be quizzed (§5.98). */
  hidden?: (line: PlayedLine) => boolean;
}) {
  // Played once per comment, so a line that fits neither position is text and the moves past
  // the legal ones are struck through (q_extension's rules). Only for a comment with a group.
  const played = useMemo(() => {
    if (!/\(\s*\d/.test(props.text) || !parseCommentLines(props.text).length) return undefined;
    const at = props.positions();
    return at ? playedLines(props.text, at.after, at.before) : undefined;
  }, [props.text, props.id]);
  const parts = useMemo(() => segments(props.text, played, props.hidden), [props.text, played, props.hidden]);
  const shown = previewOf(props.owner);
  const mine = shown?.key === props.id ? shown.cursor : undefined;
  if (!parts.some((p) => 'group' in p || 'masked' in p)) return <>{props.text}</>;
  const open = (line: number, move: number) => (e: Event) => {
    e.stopPropagation();
    const at = props.positions();
    if (!at) return;
    const lines = playedLines(props.text, at.after, at.before);
    // A move past the legal ones does nothing (q_extension).
    if (move >= (lines[line]?.ucis.length ?? 0)) return;
    const cursor = cursorAt(lines, line, move);
    if (!cursor) return;
    props.onOpen?.();
    showLine(props.owner, props.id, lines, cursor);
  };
  const piece = (p: Piece, i: number) => {
    if (!('line' in p)) return <span key={i}>{p.text}</span>;
    if (played && p.move >= (played[p.line]?.ucis.length ?? 0)) {
      return (
        <span key={i} class="line-move bad" title="Not a legal move here">
          {p.text}
        </span>
      );
    }
    return (
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
    );
  };
  return (
    <>
      {parts.map((p, i) =>
        'masked' in p ? (
          <span key={i} class="comment-line masked" title="A line from the comments: quizzed on the board when the line ends">
            (…)
          </span>
        ) : 'group' in p ? (
          <span key={i} class="comment-line">
            {p.group.map(piece)}
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
  const engine = p.source === 'engine';
  const shown = line.sans.slice(0, p.cursor.ply);
  return (
    <div class="preview-bar" role="group" aria-label={engine ? 'Line from the engine' : 'Line from the comment'}>
      <span class="preview-moves">
        {engine ? 'Engine' : 'From the comment'}: <strong>{shown.join(' ')}</strong>
      </span>
      <span class="preview-buttons">
        <button type="button" aria-label="Previous move in the line" onClick={() => stepPreview(-1)}>
          ◀
        </button>
        <button type="button" aria-label="Next move in the line" onClick={() => stepPreview(1)}>
          ▶
        </button>
        {engine && props.owner === 'chapter' && (
          <button type="button" title="Add these moves to the chapter, from the board's move" onClick={() => playLine(shown)}>
            Add
          </button>
        )}
        <button type="button" class="secondary" onClick={endPreview}>
          Back
        </button>
      </span>
    </div>
  );
}
