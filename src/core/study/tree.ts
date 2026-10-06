// Walking a chapter: nodes by path, positions, and the validity every edit and merge keeps.
// A path is the list of canonical SANs from the root; [] is the root.
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { header, type Chapter, type MoveNode, type RootNode } from './model.ts';

export type Path = readonly string[];
export type TreeNode = RootNode | MoveNode;

export const samePath = (a: Path, b: Path) => a.length === b.length && a.every((san, i) => san === b[i]);
export const isPrefix = (prefix: Path, of: Path) => prefix.length <= of.length && prefix.every((san, i) => san === of[i]);

export function nodeAt(chapter: Chapter, path: Path): TreeNode | undefined {
  let node: TreeNode = chapter.root;
  for (const san of path) {
    const next: MoveNode | undefined = node.children.find((c) => c.san === san);
    if (!next) return undefined;
    node = next;
  }
  return node;
}

/** The chapter's start position; undefined when its FEN header isn't a legal position. */
export function startPosition(chapter: Chapter): Position | undefined {
  const fen = header(chapter, 'FEN');
  if (!fen) return Chess.default();
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : undefined;
}

/** The position after the moves of `path`; undefined if the path isn't in the chapter. */
export function positionAt(chapter: Chapter, path: Path): Position | undefined {
  const pos = startPosition(chapter);
  if (!pos) return undefined;
  let node: TreeNode = chapter.root;
  for (const san of path) {
    const next: MoveNode | undefined = node.children.find((c) => c.san === san);
    const move = next && parseSan(pos, san);
    if (!next || !move) return undefined;
    pos.play(move);
    node = next;
  }
  return pos;
}

/** The main line from the root: its moves' paths, in order. */
export function mainline(chapter: Chapter): Path[] {
  const out: Path[] = [];
  let path: string[] = [];
  for (let node = chapter.root.children[0]; node; node = node.children[0]) {
    path = [...path, node.san];
    out.push(path);
  }
  return out;
}

/**
 * The line through the move at `path` (PLAN.md §5.10): its moves, then the main line below it
 * (first children) to its end. Undefined if the path isn't in the chapter.
 */
export function lineThrough(chapter: Chapter, path: Path): string[] | undefined {
  const node = nodeAt(chapter, path);
  if (!node) return undefined;
  const out = [...path];
  for (let next = node.children[0]; next; next = next.children[0]) out.push(next.san);
  return out;
}

/**
 * Problems that make a chapter unwritable as a study: a move that isn't legal, SAN that isn't
 * chessops's own, or two siblings with the same move. An empty list means valid.
 */
export function chapterProblems(chapter: Chapter): string[] {
  const start = startPosition(chapter);
  if (!start) return ['the start position is not legal'];
  const problems: string[] = [];
  const walk = (node: TreeNode, pos: Position, path: string[]) => {
    const seen = new Set<string>();
    if (node.children[0]?.startingComments.length) problems.push(`${[...path, node.children[0].san].join(' ')}: a comment before a main-line move, which PGN can't carry`);
    for (const child of node.children) {
      const here = [...path, child.san].join(' ');
      if (seen.has(child.san)) problems.push(`${here}: the same move twice`);
      seen.add(child.san);
      const move = parseSan(pos, child.san);
      if (!move) {
        problems.push(`${here}: not a legal move`);
        continue;
      }
      if (makeSan(pos, move) !== child.san) problems.push(`${here}: not written as ${makeSan(pos, move)}`);
      const after = pos.clone();
      after.play(move);
      walk(child, after, [...path, child.san]);
    }
  };
  walk(chapter.root, start, []);
  return problems;
}

/**
 * PGN can carry a comment before a variation's first move, but not before a main-line move. So
 * when a move becomes its parent's first child, its before-move comments join the front of its
 * comments. Every edit and merge that reorders children passes them through here.
 */
export function liftStartingComments(children: MoveNode[]): MoveNode[] {
  const first = children[0];
  if (!first || first.startingComments.length === 0) return children;
  return [{ ...first, comments: [...first.startingComments, ...first.comments], startingComments: [] }, ...children.slice(1)];
}

/**
 * A copy of the chapter with `edit` applied to a copy of the node at `path`; only the nodes on
 * the path are copied, the rest is shared. Undefined if the path isn't in the chapter.
 */
export function updateAt(chapter: Chapter, path: Path, edit: (node: TreeNode) => TreeNode): Chapter | undefined {
  const rebuild = (node: TreeNode, depth: number): TreeNode | undefined => {
    if (depth === path.length) return edit({ ...node, children: node.children });
    const index = node.children.findIndex((c) => c.san === path[depth]);
    if (index < 0) return undefined;
    const child = rebuild(node.children[index]!, depth + 1);
    if (!child) return undefined;
    const children = node.children.slice();
    children[index] = child as MoveNode;
    return { ...node, children };
  };
  const root = rebuild(chapter.root, 0);
  return root ? { ...chapter, root: root as RootNode } : undefined;
}
