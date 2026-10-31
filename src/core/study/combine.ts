// Chapters merged into one (PLAN.md §5.140): an import that made a chapter per game, folded back
// into the one tree it was meant to be. The union of the trees, matched by path as the merge
// matches them (§4.7), with the rules the parser uses for a move written twice among its
// siblings (`mergeSiblings` in pgn/parse.ts): the first chapter's comments, shapes, glyphs and
// clocks first, the others' added where they aren't there yet; its children first, so its main
// line stays the main line, the others' new moves after them in the order they come.
import { dedupeShapes } from '../pgn/comment.ts';
import { mergeNags } from '../pgn/nags.ts';
import { header, type Chapter, type MoveNode, type NodeData, type RootNode } from './model.ts';
import type { Edit } from './ops.ts';
import { liftStartingComments } from './tree.ts';

const union = (a: readonly string[], b: readonly string[]) => [...a, ...b.filter((x) => !a.includes(x))];

function joinData(a: NodeData, b: NodeData): NodeData {
  const out: NodeData = {
    comments: union(a.comments, b.comments),
    startingComments: union(a.startingComments, b.startingComments),
    shapes: dedupeShapes([...a.shapes, ...b.shapes]),
    nags: mergeNags(a.nags, b.nags),
  };
  for (const attr of ['clock', 'emt', 'eval'] as const) {
    const v = a[attr] ?? b[attr];
    if (v !== undefined) out[attr] = v;
  }
  return out;
}

function joinChildren(a: readonly MoveNode[], b: readonly MoveNode[]): MoveNode[] {
  const out = [...a];
  for (const node of b) {
    const i = out.findIndex((n) => n.san === node.san);
    if (i < 0) out.push(node);
    else out[i] = joinNode(out[i]!, node);
  }
  return liftStartingComments(out);
}

const joinNode = (a: MoveNode, b: MoveNode): MoveNode => ({ san: a.san, ...joinData(a, b), children: joinChildren(a.children, b.children) });
const joinRoot = (a: RootNode, b: RootNode): RootNode => ({ ...joinData(a, b), children: joinChildren(a.children, b.children) });

const nameOf = (c: Chapter) => header(c, 'ChapterName') ?? c.id;
const sideOf = (c: Chapter) => (header(c, 'Orientation') === 'black' ? 'black' : 'white');

/**
 * The chapters as one, with the first's ID and headers (its name, side and start). Refused when
 * there are fewer than two, or when one starts from another position or is for the other side:
 * its lines would be trained from the wrong board.
 */
export function combineChapters(chapters: readonly Chapter[]): Edit {
  const [first, ...rest] = chapters;
  if (!first || rest.length === 0) return { ok: false, error: 'choose at least two chapters to merge' };
  const fen = (c: Chapter) => header(c, 'FEN') ?? '';
  const otherStart = rest.find((c) => fen(c) !== fen(first));
  if (otherStart) return { ok: false, error: `“${nameOf(otherStart)}” starts from another position than “${nameOf(first)}”` };
  const otherSide = rest.find((c) => sideOf(c) !== sideOf(first));
  if (otherSide) return { ok: false, error: `“${nameOf(otherSide)}” is for ${sideOf(otherSide) === 'white' ? 'White' : 'Black'} and “${nameOf(first)}” for ${sideOf(first) === 'white' ? 'White' : 'Black'}: give them the same side first` };
  let root = first.root;
  for (const c of rest) root = joinRoot(root, c.root);
  return { ok: true, value: { id: first.id, headers: first.headers, root } };
}
