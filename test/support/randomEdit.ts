// Random edits through the edit operations, so a chapter stays valid whatever is drawn.
import { makeSan } from 'chessops/san';
import type { Chapter } from '../../src/core/study/model.ts';
import * as ops from '../../src/core/study/ops.ts';
import { nodeAt, positionAt, type Path, type TreeNode } from '../../src/core/study/tree.ts';
import { pick, randomText, type Random } from './randomTree.ts';

function paths(c: Chapter): Path[] {
  const out: Path[] = [[]];
  const walk = (node: TreeNode, path: string[]) => {
    for (const child of node.children) {
      out.push([...path, child.san]);
      walk(child, [...path, child.san]);
    }
  };
  walk(c.root, []);
  return out;
}

/** One random edit: add a move, delete, comment, glyph, shape or promote. */
export function randomEdit(random: Random, c: Chapter): Chapter {
  const path = pick(random, paths(c));
  const r = random();
  let edit: ops.Edit<Chapter> | undefined;
  if (r < 0.3) {
    const pos = positionAt(c, path)!;
    const moves = [...pos.allDests()].flatMap(([from, dests]) => [...dests].map((to) => ({ from, to })));
    if (moves.length) {
      const added = ops.addMove(c, path, makeSan(pos, pick(random, moves)));
      edit = added.ok ? { ok: true, value: added.value.chapter } : added;
    }
  } else if (r < 0.45) edit = ops.deletePath(c, path);
  else if (r < 0.65) edit = ops.setComment(c, path, random() < 0.15 ? '' : randomText(random));
  else if (r < 0.75) edit = ops.toggleGlyph(c, path, pick(random, [1, 2, 3, 14, 16, 146, 40]));
  else if (r < 0.85) {
    const node = nodeAt(c, path)!;
    const shape = pick(random, [{ brush: 'red', orig: 'd5' }, { brush: 'green', orig: 'e2', dest: 'e4' }] as const);
    const has = node.shapes.some((s) => s.brush === shape.brush && s.orig === shape.orig && s.dest === (shape as { dest?: string }).dest);
    edit = ops.setShapes(c, path, has ? node.shapes.filter((s) => !(s.brush === shape.brush && s.orig === shape.orig)) : [...node.shapes, shape]);
  } else edit = ops.promote(c, path);
  return edit?.ok ? edit.value : c;
}

