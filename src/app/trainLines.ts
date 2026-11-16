// Show and grade's lines mode at a line's end (PLAN.md §5.198, the owner's request, 2026-11-16):
// 4 twice there puts the first clickable move of the last move's comments on the board; 2 and 4
// then step through every clickable move of those comments, one comment after another, as ← →
// do through one comment. 2 on from the last move leaves the mode, the board back at the line's
// end, and the next 2 goes on to the next line; 4 at the first move stays. The session waits
// meanwhile. Kept apart from train.ts, which Node's tests load: the preview pulls in the editor.
import { effect } from '@preact/signals';
import { stepComments, playedLines, type CommentsCursor, type PlayedLine } from '../core/repertoire/lines.ts';
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
  if (!atLineEnd(s)) {
    linesMode.value = undefined;
    if (mode === 'on' && shown?.owner === 'train') endPreview();
  } else if (mode === 'on' && !shown) leave();
});
