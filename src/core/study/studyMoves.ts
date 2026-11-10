// The Study tab of the explorer panel (PLAN.md §5.27, §5.162): at a position, the moves the open
// study plays there, across all its chapters and the move orders that reach it (transpositions),
// each with the chapters that play it and how many lines go through it. lichessable's course tree
// (§24) answered "standing here, what did the author cover" with a merged tree; a study is a tree
// already, so what is left is the merge across chapters, at one position. Pure.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import type { Chapter, MoveNode, RootNode } from './model.ts';
import { startPosition, type Path } from './tree.ts';

/** One move of a chapter, by the position it is played from. */
export interface StudyEntry {
  /** The path to the move's node (its last SAN is the move as the chapter writes it). */
  path: Path;
  uci: string;
  san: string;
  /** The lines that go through it: the line ends under it, itself when it ends one. */
  lines: number;
}

/** A chapter's moves by the position each is played from. */
export type ChapterMoves = Map<PositionKey, StudyEntry[]>;

/** Every move of a chapter, keyed by the position before it (D10's key: transpositions meet). */
export function chapterMoves(chapter: Chapter): ChapterMoves {
  const out: ChapterMoves = new Map();
  const start = startPosition(chapter);
  if (!start) return out;
  const walk = (node: RootNode | MoveNode, pos: Position, path: Path): number => {
    if (!node.children.length) return 1;
    const key = positionKeyOf(pos);
    let total = 0;
    for (const child of node.children) {
      const move = parseSan(pos, child.san);
      if (!move) continue;
      const after = pos.clone();
      const san = makeSan(pos, move);
      after.play(move);
      const childPath = [...path, child.san];
      const lines = walk(child, after, childPath);
      total += lines;
      const entry: StudyEntry = { path: childPath, uci: makeUci(move), san, lines };
      const at = out.get(key);
      if (at) at.push(entry);
      else out.set(key, [entry]);
    }
    return Math.max(1, total);
  };
  walk(chapter.root, start, []);
  return out;
}

/** A move the study plays at a position. */
export interface StudyMove {
  uci: string;
  /** As chessops writes it (the chapters' own spellings may differ, e.g. 0-0). */
  san: string;
  /** The chapters that play it, in the study's order, each at its first place in tree order. */
  chapters: { cid: string; path: Path }[];
  /** The lines through it, across every chapter and move order. */
  lines: number;
}

/**
 * The moves the study plays at position `key`: from every chapter, by every move order that reaches
 * it, most lines first, then most chapters, then in the study's order (main lines first).
 */
export function studyMovesAt(chapters: readonly { cid: string; moves: ChapterMoves }[], key: PositionKey): StudyMove[] {
  const byUci = new Map<string, StudyMove>();
  for (const { cid, moves } of chapters) {
    for (const e of moves.get(key) ?? []) {
      let m = byUci.get(e.uci);
      if (!m) byUci.set(e.uci, (m = { uci: e.uci, san: e.san, chapters: [], lines: 0 }));
      m.lines += e.lines;
      if (!m.chapters.some((c) => c.cid === cid)) m.chapters.push({ cid, path: e.path });
    }
  }
  // A stable sort: among equals, the study's order (its chapters', then each tree's, main line first).
  return [...byUci.values()].sort((a, b) => b.lines - a.lines || b.chapters.length - a.chapters.length);
}
