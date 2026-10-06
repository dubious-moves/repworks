// Moving through a chapter (PLAN.md §4.11): the keys of the notation, as paths.
//   → next move (the line continues with the first child)   ← previous move
//   ↓ next variation here (the next sibling)                ↑ previous variation here
//   End: the end of the line                                Home: the start
import type { Chapter } from './model.ts';
import { nodeAt, type Path } from './tree.ts';

export type Step = 'next' | 'prev' | 'up' | 'down' | 'start' | 'end';

export function step(chapter: Chapter, path: Path, how: Step): Path {
  const node = nodeAt(chapter, path);
  if (!node) return nearest(chapter, path);
  switch (how) {
    case 'next':
      return node.children[0] ? [...path, node.children[0].san] : path;
    case 'prev':
      return path.slice(0, -1);
    case 'start':
      return [];
    case 'end': {
      const out = [...path];
      for (let n = node.children[0]; n; n = n.children[0]) out.push(n.san);
      return out;
    }
    case 'up':
    case 'down': {
      if (path.length === 0) return path;
      const siblings = nodeAt(chapter, path.slice(0, -1))!.children;
      const i = siblings.findIndex((c) => c.san === path[path.length - 1]);
      const j = i + (how === 'down' ? 1 : -1);
      return j >= 0 && j < siblings.length ? [...path.slice(0, -1), siblings[j]!.san] : path;
    }
  }
}

/** The longest start of `path` that is in the chapter: where to stand after the tree changed. */
export function nearest(chapter: Chapter, path: Path): Path {
  let n = path.length;
  while (n > 0 && !nodeAt(chapter, path.slice(0, n))) n--;
  return path.slice(0, n);
}
