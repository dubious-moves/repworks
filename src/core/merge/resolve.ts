// Resolving a conflict (PLAN.md §4.7) is an ordinary edit of the comment that holds its marker,
// so every device sees the same open conflicts until one of them resolves it and syncs:
// - clashing text: keep one side, both (one after the other), or a text written by hand;
// - "kept after delete": keep the line (the marker goes), or delete it after all.
import { sanitizeComment } from '../pgn/comment.ts';
import type { Chapter } from '../study/model.ts';
import { deletePath, type Edit } from '../study/ops.ts';
import { updateAt } from '../study/tree.ts';
import { parseTextConflict, type OpenConflict } from './markers.ts';

export type Resolution = { kind: 'ours' } | { kind: 'theirs' } | { kind: 'both' } | { kind: 'text'; text: string } | { kind: 'keep' } | { kind: 'delete' };

export function resolveConflict(chapter: Chapter, conflict: OpenConflict, resolution: Resolution): Edit {
  if (conflict.kind === 'kept') {
    if (resolution.kind === 'delete') return deletePath(chapter, conflict.path);
    if (resolution.kind === 'keep') return replaceComment(chapter, conflict, null);
    return { ok: false, error: 'a line kept after a delete is kept or deleted' };
  }
  const sides = parseTextConflict(conflict.comment);
  if (!sides) return { ok: false, error: 'the conflict markers in that comment were edited by hand: edit the comment instead' };
  switch (resolution.kind) {
    case 'ours':
      return replaceComment(chapter, conflict, sides.ours);
    case 'theirs':
      return replaceComment(chapter, conflict, sides.theirs);
    case 'both':
      return replaceComment(chapter, conflict, [sides.ours, sides.theirs].filter((t) => t.trim()).join('\n'));
    case 'text':
      return replaceComment(chapter, conflict, resolution.text);
    default:
      return { ok: false, error: 'clashing text is resolved by choosing a text' };
  }
}

/** Replaces the comment holding the conflict, sanitized; an empty text (or null) removes it. */
function replaceComment(chapter: Chapter, at: OpenConflict, text: string | null): Edit {
  const clean = text === null ? '' : sanitizeComment(text).text;
  let found = false;
  const next = updateAt(chapter, at.path, (node) => {
    const list = (at.starting ? node.startingComments : node.comments).slice();
    if (list[at.index] !== at.comment) return node;
    found = true;
    if (clean === '') list.splice(at.index, 1);
    else list[at.index] = clean;
    return at.starting ? { ...node, startingComments: list } : { ...node, comments: list };
  });
  if (!next || !found) return { ok: false, error: 'that conflict is no longer there' };
  return { ok: true, value: next };
}
