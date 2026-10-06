// A line from a comment shown on the board (PLAN.md §5.12): the chapter view, the Read view and
// the training screen each preview one at a time. A preview changes nothing else; it ends on
// Escape, a click on the board, its Back button, another move shown in the chapter view, or
// another screen.
import { effect, signal } from '@preact/signals';
import type { Position } from 'chessops/chess';
import { firstCursor, playedLines, stepCursor, type Cursor, type PlayedLine } from '../core/repertoire/lines.ts';
import { at } from './editor.ts';
import { mode } from './mode.ts';

export type PreviewOwner = 'chapter' | 'read' | 'train';

export interface Preview {
  owner: PreviewOwner;
  /** The comment previewed: its node's path key and its text (`commentId`). */
  key: string;
  lines: PlayedLine[];
  cursor: Cursor;
}

/** A comment's identity: its node's path key and its text. */
export const commentId = (nodeKey: string, text: string) => `${nodeKey}#${text}`;

export const preview = signal<Preview | undefined>(undefined);

export function showLine(owner: PreviewOwner, key: string, lines: PlayedLine[], cursor: Cursor): void {
  preview.value = { owner, key, lines, cursor };
}

export function endPreview(): void {
  preview.value = undefined;
}

/** The preview of `owner`, if one is shown. */
export const previewOf = (owner: PreviewOwner): Preview | undefined => (preview.value?.owner === owner ? preview.value : undefined);

/** ← or → through the comment's lines; stepping back before the first move ends the preview. */
export function stepPreview(dir: 1 | -1): void {
  const p = preview.peek();
  if (!p) return;
  const next = stepCursor(p.lines, p.cursor, dir);
  preview.value = next ? { ...p, cursor: next } : undefined;
}

/**
 * Line jumping (q_extension v1.13.1): → on a line's last move enters the first line of that move's
 * comments, the first comment that has one. False when none does.
 */
export function enterCommentLines(owner: PreviewOwner, nodeKey: string, comments: readonly string[], after: Position | undefined, before: Position | undefined): boolean {
  if (!after) return false;
  for (const text of comments) {
    const lines = playedLines(text, after, before);
    const cursor = firstCursor(lines);
    if (cursor) {
      showLine(owner, commentId(nodeKey, text), lines, cursor);
      return true;
    }
  }
  return false;
}

/** The position shown, and the move that reached it. */
export function previewPosition(p: Preview): { position: Position; uci: string } {
  const line = p.lines[p.cursor.line]!;
  return { position: line.positions[p.cursor.ply]!, uci: line.ucis[p.cursor.ply - 1]! };
}

// Another screen, or another move shown in the chapter view, ends a preview.
effect(() => {
  void mode.value.name;
  preview.value = undefined;
});
effect(() => {
  void at.value;
  if (preview.peek()?.owner === 'chapter') preview.value = undefined;
});
