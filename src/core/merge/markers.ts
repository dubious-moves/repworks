// Conflict markers (PLAN.md §4.7): plain text in PGN comments, so any device sees the same open
// conflicts and nothing outside the PGN needs syncing. They survive Lichess's sanitizer, which
// only deletes braces and tidies whitespace.
//
//   <<<<<<< phone 2026-10-05          clashing text: ours first, then theirs
//   the phone's text
//   =======
//   the desktop's text
//   >>>>>>> desktop 2026-10-05
//
//   <<<<<<< kept: deleted on desktop 2026-10-05     a line one side deleted and the other edited
import type { Chapter } from '../study/model.ts';
import type { Path, TreeNode } from '../study/tree.ts';

export const MARKER = '<<<<<<<';
const KEPT = `${MARKER} kept: deleted on `;

export function textConflict(oursLabel: string, ours: readonly string[], theirsLabel: string, theirs: readonly string[]): string {
  return [`${MARKER} ${oursLabel}`, ...ours, '=======', ...theirs, `>>>>>>> ${theirsLabel}`].join('\n');
}

export const keptMarker = (deletedBy: string) => `${KEPT}${deletedBy}`;
export const isKeptMarker = (comment: string) => comment.startsWith(KEPT);
export const hasMarker = (comment: string) => comment.includes(MARKER);

export interface TextConflict {
  oursLabel: string;
  ours: string;
  theirsLabel: string;
  theirs: string;
}

/** The two sides of a text conflict comment; undefined for anything else. */
export function parseTextConflict(comment: string): TextConflict | undefined {
  const m = /^<{7} (.*)\n([\s\S]*?)\n?={7}\n?([\s\S]*?)\n?>{7} (.*)$/.exec(comment);
  if (!m || comment.startsWith(KEPT)) return undefined;
  return { oursLabel: m[1]!, ours: m[2]!, theirsLabel: m[4]!, theirs: m[3]! };
}

export interface OpenConflict {
  path: Path;
  kind: 'text' | 'kept';
  /** Which comment of the node holds the marker (in `comments`, or in `startingComments`). */
  index: number;
  starting: boolean;
  comment: string;
}

/** Every open conflict in a chapter: each comment that carries a marker, in tree order. */
export function openConflicts(chapter: Chapter): OpenConflict[] {
  const out: OpenConflict[] = [];
  const visit = (node: TreeNode, path: string[]) => {
    for (const [starting, list] of [[true, node.startingComments], [false, node.comments]] as const) {
      list.forEach((comment, index) => {
        if (hasMarker(comment)) out.push({ path, kind: isKeptMarker(comment) ? 'kept' : 'text', index, starting, comment });
      });
    }
    for (const child of node.children) visit(child, [...path, child.san]);
  };
  visit(chapter.root, []);
  return out;
}
