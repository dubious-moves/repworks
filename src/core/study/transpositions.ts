// Transpositions within a chapter (PLAN.md §5.11, q_extension's badges): the moves whose resulting
// position another path of the same chapter also reaches. Keyed with the site's position key (D10),
// so move counters don't matter and an en passant square only when the capture is legal.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import type { NormalMove, Role } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import type { Chapter, MoveNode, RootNode } from './model.ts';
import { pathKey } from './notation.ts';
import { startPosition, type Path } from './tree.ts';

export interface Transpositions {
  /** Each move's path (as `pathKey`) → the position it reaches. */
  keyOf: Map<string, PositionKey>;
  /** Each position reached by more than one move of the chapter → those moves' paths, in tree order. */
  paths: Map<PositionKey, Path[]>;
  /** Every position a move of the chapter reaches → those moves' paths, in tree order. */
  reach: Map<PositionKey, Path[]>;
}

export function transpositions(chapter: Chapter): Transpositions {
  const keyOf = new Map<string, PositionKey>();
  const all = new Map<PositionKey, Path[]>();
  const start = startPosition(chapter);
  const walk = (node: RootNode | MoveNode, pos: Position, path: Path) => {
    for (const child of node.children) {
      const move = parseSan(pos, child.san);
      if (!move) continue;
      const after = pos.clone();
      after.play(move);
      const key = positionKeyOf(after);
      const childPath = [...path, child.san];
      keyOf.set(pathKey(childPath), key);
      const at = all.get(key);
      if (at) at.push(childPath);
      else all.set(key, [childPath]);
      walk(child, after, childPath);
    }
  };
  if (start) walk(chapter.root, start, []);
  const paths = new Map<PositionKey, Path[]>();
  for (const [key, at] of all) if (at.length > 1) paths.set(key, at);
  return { keyOf, paths, reach: all };
}

/** The chapter's other paths to the position the move at `path` reaches. */
export function otherOrders(t: Transpositions, path: Path): Path[] {
  const key = t.keyOf.get(pathKey(path));
  const at = key === undefined ? undefined : t.paths.get(key);
  if (!at) return [];
  const self = pathKey(path);
  return at.filter((p) => pathKey(p) !== self);
}

/** Each legal move of `pos`, by SAN → the position it reaches. */
export function movesFrom(pos: Position): Map<string, PositionKey> {
  const out = new Map<string, PositionKey>();
  for (const [from, dests] of pos.allDests()) {
    const last = pos.board.get(from)?.role === 'pawn';
    for (const to of dests) {
      const roles: (Role | undefined)[] = last && (to >> 3 === 7 || to >> 3 === 0) ? ['queen', 'rook', 'bishop', 'knight'] : [undefined];
      for (const promotion of roles) {
        const move: NormalMove = promotion ? { from, to, promotion } : { from, to };
        const san = makeSan(pos, move);
        if (out.has(san)) continue;
        const after = pos.clone();
        after.play(move);
        out.set(san, positionKeyOf(after));
      }
    }
  }
  return out;
}

/**
 * The moves at `path` (whose position is `pos`, with the chapter's moves there `played`) that the
 * chapter doesn't play there but whose position it reaches another way, by SAN → the chapter's
 * paths to that position (the explorer's transposition marks). By position, so a SAN's check mark
 * doesn't matter.
 */
export function transposedFrom(t: Transpositions, pos: Position, path: Path, played: readonly string[]): Map<string, Path[]> {
  const direct = new Set(played.map((san) => t.keyOf.get(pathKey([...path, san]))));
  const out = new Map<string, Path[]>();
  for (const [san, key] of movesFrom(pos)) {
    const at = t.reach.get(key);
    if (at && !direct.has(key)) out.set(san, at);
  }
  return out;
}
