// Show and grade's lines mode at a line's end (PLAN.md §5.198, the owner's request, 2026-11-16):
// 4 twice there puts the first clickable move of the last move's comments on the board; 2 and 4
// then step through every clickable move of those comments, one comment after another, as ← →
// do through one comment. 2 on from the last move leaves the mode, the board back at the line's
// end, and the next 2 goes on to the next line; 4 at the first move stays. The session waits
// meanwhile. Kept apart from train.ts, which Node's tests load: the preview pulls in the editor.
import { effect } from '@preact/signals';
import { lastCursor, stepComments, playedLines, type CommentsCursor, type PlayedLine } from '../core/repertoire/lines.ts';
import { nodeAt, positionAt } from '../core/study/tree.ts';
import type { Press } from '../core/train/showGrade.ts';
import { commentId, endPreview, preview, showLine } from './preview.ts';
import { linesMode, press, quizzedLater, releaseHeld, session, type SessionView } from './train.ts';

/** A press of show and grade's keys, the lines mode's first. */
export function pressKey(p: Press): void {
  if ((p === 'next' || p === 'wrong') && linesPress(p)) return;
  press(p);
}

/** Whether the session is at a line's end in show and grade, where the mode works. */
const atLineEnd = (s: SessionView | undefined): s is SessionView => !!s && !s.done && s.selfGrade && s.phase === 'lineDone';

/** The comments of the move on the board, each with its lines played; a line still to be quizzed (§5.98) has no moves to step to. */
function commentsHere(s: SessionView): { key: string; lines: PlayedLine[] }[] {
  if (!s.chapter || s.aside) return [];
  const node = nodeAt(s.chapter, s.path);
  const after = positionAt(s.chapter, s.path);
  if (!node || !after) return [];
  const before = s.path.length ? positionAt(s.chapter, s.path.slice(0, -1)) : undefined;
  const hidden = quizzedLater(s);
  return node.comments.map((text) => ({
    key: commentId(s.path.join(' '), text),
    lines: playedLines(text, after, before).map((l) => (hidden(l) ? { ...l, ucis: [], sans: [] } : l)),
  }));
}

/** A press of 2 or 4 the lines mode takes: true when it took it. */
function linesPress(p: 'next' | 'wrong'): boolean {
  const s = session.peek();
  if (!atLineEnd(s)) {
    linesMode.value = undefined;
    return false;
  }
  const comments = commentsHere(s);
  const all = comments.map((c) => c.lines);
  const show = (at: CommentsCursor) => showLine('train', comments[at.comment]!.key, comments[at.comment]!.lines, at.cursor);
  const mode = linesMode.peek();
  const shown = preview.peek();
  if (mode === 'on' && shown?.owner === 'train') {
    // From the move shown, a move clicked in the comments too.
    const i = comments.findIndex((c) => c.key === shown.key);
    const next = stepComments(all, i < 0 ? undefined : { comment: i, cursor: shown.cursor }, p === 'next' ? 1 : -1);
    if (next) show(next);
    else if (p === 'next') leave();
    return true;
  }
  const first = stepComments(all, undefined, 1);
  // 2, or no clickable move: the press is show and grade's own.
  if (p === 'next' || !first) {
    linesMode.value = undefined;
    return false;
  }
  if (mode === 'armed') {
    linesMode.value = 'on';
    show(first);
  } else linesMode.value = 'armed';
  return true;
}

/** The mode left: the board back at the line's end, a tick that came meanwhile played. */
function leave(): void {
  linesMode.value = undefined;
  if (preview.peek()?.owner === 'train') endPreview();
  releaseHeld();
}

// The preview ended another way (Escape, Back, a click on the board) ends the mode; the line's end
// left ("Next line", Stop, the session ended) ends both.
effect(() => {
  const s = session.value;
  const shown = preview.value;
  const mode = linesMode.peek();
  if (!mode) return;
  if (mode === 'browse') {
    if (!atBrowseEnd(s)) {
      linesMode.value = undefined;
      if (shown?.owner === 'train') endPreview();
      releaseHeld();
    } else if (!shown) leave();
    return;
  }
  if (!atLineEnd(s)) {
    linesMode.value = undefined;
    if (mode === 'on' && shown?.owner === 'train') endPreview();
  } else if (mode === 'on' && !shown) leave();
});

// Browsing the comments' lines at a line's end outside show and grade (PLAN.md §5.200, the owner's
// request, 2026-11-18): every clickable move of every comment of the line walked, from the
// chapter's start to its last move, one comment after another, by ← → or the panel's buttons. The
// lines still to be quizzed (§5.98) are shown too: browsing is looking, not quizzing, and "Quiz
// lines" stays offered. The session waits meanwhile, as in show and grade's mode.

/** A comment of a move of the line walked, with its lines played. */
export interface BrowsedComment {
  /** The moves to the comment's move (SANs from the chapter's start). */
  path: string[];
  key: string;
  lines: PlayedLine[];
}

/** Whether the session is at a line's end outside show and grade, or at its end, where browsing works. */
export const atBrowseEnd = (s: SessionView | undefined): s is SessionView => !!s && !s.selfGrade && !s.aside && (!!s.done || s.phase === 'lineDone');

/** Every comment of the line walked, its start's first, each with its lines played. */
export function lineComments(s: SessionView): BrowsedComment[] {
  const c = s.chapter;
  if (!c) return [];
  const out: BrowsedComment[] = [];
  for (let i = 0; i <= s.path.length; i++) {
    const path = s.path.slice(0, i);
    const node = nodeAt(c, path);
    const after = positionAt(c, path);
    if (!node || !after || !node.comments.length) continue;
    const before = i ? positionAt(c, s.path.slice(0, i - 1)) : undefined;
    for (const text of node.comments) out.push({ path, key: commentId(path.join(' '), text), lines: playedLines(text, after, before) });
  }
  return out;
}

/** Whether the line walked has a clickable move in its comments. */
export const canBrowse = (s: SessionView): boolean => atBrowseEnd(s) && !!stepComments(lineComments(s).map((c) => c.lines), undefined, 1);

/** The comment browsed, while browsing. */
export function browsedComment(s: SessionView): BrowsedComment | undefined {
  const shown = preview.value;
  if (linesMode.value !== 'browse' || shown?.owner !== 'train') return undefined;
  return lineComments(s).find((c) => c.key === shown.key);
}

/**
 * ← or → at a line's end outside show and grade: true when taken. → from nowhere starts at the
 * first move, ← at the last; from a move shown (one clicked in a comment too), the next or the one
 * before across every comment. ← before the first move goes back to the line's end; → on the last
 * stays.
 */
export function browseStep(dir: 1 | -1): boolean {
  const s = session.peek();
  if (!atBrowseEnd(s)) return false;
  const comments = lineComments(s);
  const all = comments.map((c) => c.lines);
  const shown = preview.peek();
  const i = shown?.owner === 'train' ? comments.findIndex((c) => c.key === shown.key) : -1;
  // A line on the board that isn't one of these (one from an engine, say): ← → step it as ever.
  if (shown && i < 0) return false;
  let next: CommentsCursor | undefined;
  if (i >= 0) next = stepComments(all, { comment: i, cursor: shown!.cursor }, dir);
  else if (dir === 1) next = stepComments(all, undefined, 1);
  else {
    // ← from nowhere: the last move of all.
    for (let j = comments.length - 1; j >= 0 && !next; j--) {
      const c = lastCursor(all[j]!);
      if (c) next = { comment: j, cursor: c };
    }
  }
  if (next) {
    linesMode.value = 'browse';
    showLine('train', comments[next.comment]!.key, comments[next.comment]!.lines, next.cursor);
  } else if (i >= 0 && dir === -1) leave();
  else if (i < 0) return false;
  else linesMode.value = 'browse';
  return true;
}

/** Browsing left: the board back at the line's end. */
export function endBrowse(): void {
  leave();
}
