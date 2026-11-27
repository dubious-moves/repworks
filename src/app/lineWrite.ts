// A comment's lines written from the board (PLAN.md §5.217, the owner's request, 2026-11-27), in
// the chapter view of a chapter that can be edited: a move played while a comment's line is on
// the board goes into the line (at its end, or as a branch), and a line can be started on a move
// with nothing typed: its first move, played on the board, writes it into the move's comment.
// Each move written is one edit, so one undo.
import { effect, signal } from '@preact/signals';
import type { Position } from 'chessops/chess';
import { LICHESS_COMMENT_LIMIT, sanitizeComment } from '../core/pgn/comment.ts';
import { hasMarker } from '../core/merge/markers.ts';
import { deleteFromLine, playInLine, startLine, type LineEdit } from '../core/repertoire/lineEdit.ts';
import { playedLines, type Cursor } from '../core/repertoire/lines.ts';
import { pathKey } from '../core/study/notation.ts';
import { ownComment, replaceComment, setComment } from '../core/study/ops.ts';
import { nodeAt, positionAt, samePath, type Path } from '../core/study/tree.ts';
import { at, chapter, doc, edit, feedback, goTo } from './editor.ts';
import { mode } from './mode.ts';
import { commentId, endPreview, preview, previewOf, showLine } from './preview.ts';

/** A line being started on the move at this path: the next move played on the board is its first. */
export const draft = signal<Path | undefined>(undefined);

/** Starts a line on the move at `path`: the board shows the move, and waits for the line's first. */
export function startDraft(path: Path): void {
  if (!doc.peek()) return;
  goTo(path);
  endPreview();
  feedback.value = undefined;
  draft.value = at.peek();
}

export const endDraft = () => void (draft.value = undefined);

// Another screen or another move ends it, as it ends a preview.
effect(() => {
  void mode.value.name;
  draft.value = undefined;
});
effect(() => {
  const d = draft.peek();
  if (d && !samePath(d, at.value)) draft.value = undefined;
});
// A line shown (a move of a comment clicked) takes the board: the line being started is given up.
effect(() => {
  if (preview.value) draft.value = undefined;
});

/** Whether a move on the board is written into a comment's line: one is shown, or being started, in a chapter that can be edited. */
export function writingLine(): boolean {
  if (!doc.value) return false;
  if (draft.value) return true;
  const p = previewOf('chapter');
  return !!p && p.source !== 'engine';
}

interface Where {
  path: Path;
  after: Position;
  before: Position | undefined;
}

function where(path: Path): Where | undefined {
  const c = chapter.peek();
  const after = c && positionAt(c, path);
  return c && after ? { path, after, before: path.length ? positionAt(c, path.slice(0, -1)) : undefined } : undefined;
}

const refuse = (text: string): string | undefined =>
  hasMarker(text) ? 'This comment has a conflict to resolve first: nothing was written' : undefined;

/** The comment's new text saved and its line shown again at `cursor` (or the preview ended). */
function commit(w: Where, old: string | undefined, text: string, cursor: Cursor | undefined): boolean {
  const clean = sanitizeComment(text);
  if (clean.tooLong) {
    feedback.value = `Not written: the comment would be over ${LICHESS_COMMENT_LIMIT.toLocaleString('en')} characters`;
    return false;
  }
  if (!edit((ch) => (old === undefined ? setComment(ch, w.path, clean.text) : replaceComment(ch, w.path, old, clean.text)), w.path)) return false;
  draft.value = undefined;
  if (cursor && clean.text) showLine('chapter', commentId(pathKey(w.path), clean.text), playedLines(clean.text, w.after, w.before), cursor);
  else endPreview();
  return true;
}

function apply(w: Where, old: string | undefined, out: LineEdit): void {
  if (!out.ok) return void (feedback.value = `Not written: ${out.error}`);
  if (out.written) return void commit(w, old, out.text, out.cursor);
  // The move was there already: shown, nothing written.
  draft.value = undefined;
  feedback.value = undefined;
  showLine('chapter', commentId(pathKey(w.path), out.text), playedLines(out.text, w.after, w.before), out.cursor);
}

/** The text of the comment a preview shows, among the comments of the move at `path`. */
function shownComment(path: Path, key: string): string | undefined {
  const c = chapter.peek();
  const node = c && nodeAt(c, path);
  if (!node) return undefined;
  return [...node.comments, ...node.startingComments].find((text) => commentId(pathKey(path), text) === key);
}

/** A move played on the board while a line is written: into the line shown, or the first of a line being started. */
export function playWritten(san: string): void {
  const c = chapter.peek();
  if (!c || !doc.peek()) return;
  const started = draft.peek();
  if (started) {
    const w = where(started);
    const node = nodeAt(c, started);
    if (!w || !node) return;
    const old = ownComment(node);
    const no = refuse(old ?? '');
    if (no) return void (feedback.value = no);
    return apply(w, old, startLine(old ?? '', w.after, w.before, san));
  }
  const p = preview.peek();
  const w = where(at.peek());
  if (!p || p.owner !== 'chapter' || p.source === 'engine' || !w) return;
  const text = shownComment(w.path, p.key);
  if (text === undefined) return void (feedback.value = 'Not written: the comment has changed');
  const no = refuse(text);
  if (no) return void (feedback.value = no);
  apply(w, text, playInLine(text, w.after, w.before, p.cursor, san));
}

/** The move shown of a comment's line deleted with the rest of its line (the bar's "Delete from here"). */
export function deleteWritten(): void {
  const p = preview.peek();
  const w = where(at.peek());
  if (!doc.peek() || !p || p.owner !== 'chapter' || p.source === 'engine' || !w) return;
  const text = shownComment(w.path, p.key);
  if (text === undefined) return void (feedback.value = 'Not deleted: the comment has changed');
  const no = refuse(text);
  if (no) return void (feedback.value = no);
  const out = deleteFromLine(text, w.after, w.before, p.cursor);
  if (!out.ok) return void (feedback.value = `Not deleted: ${out.error}`);
  commit(w, text, out.text, out.cursor);
}
