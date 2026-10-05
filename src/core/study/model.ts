// The study model in memory (PLAN.md §4.4). A chapter is one PGN game in Lichess's dialect;
// FENs, position keys, UCIs and plies are derived when a chapter is walked, never stored.
import type { SquareName } from 'chessops/types';

/** The four brushes PGN can carry (`[%csl Gd4]`, `[%cal Re2e4]`). */
export type Brush = 'green' | 'red' | 'blue' | 'yellow';

/** A circle (no `dest`) or an arrow. */
export interface Shape {
  brush: Brush;
  orig: SquareName;
  dest?: SquareName;
}

export interface NodeData {
  /** Text comments in order. Shapes and clock commands are taken out; `[%anno …]` stays. */
  comments: string[];
  /** From every `[%csl]` and `[%cal]` on the node, in order, without duplicates. */
  shapes: Shape[];
  nags: number[];
  /** Comments before a variation's first move: only other writers produce them. */
  startingComments: string[];
  /** `[%clk]`, `[%emt]` and `[%eval]`, kept verbatim when present. */
  clock?: string;
  emt?: string;
  eval?: string;
}

export interface MoveNode extends NodeData {
  /** Canonical SAN (chessops `makeSan`); a node's identity is the path of these from the root. */
  san: string;
  /** `children[0]` continues the main line; the rest are variations, in order. */
  children: MoveNode[];
}

export interface RootNode extends NodeData {
  children: MoveNode[];
}

export interface Chapter {
  id: string;
  /** Every header as read, in order: `ChapterName`, `Orientation`, `FEN`, `StudyName`, … */
  headers: [string, string][];
  root: RootNode;
}

export type StudyKind = 'repertoire' | 'reference';

export interface StudySource {
  kind: 'qchess' | 'lichess' | 'file';
  id?: string;
  name?: string;
  /** When it was imported (ISO 8601). */
  imported: string;
}

/** `studies/<sid>/study.json`: the truth for a study's name, kind and chapter order. */
export interface StudyMeta {
  format: 1;
  id: string;
  name: string;
  kind: StudyKind;
  chapters: string[];
  source?: StudySource;
}

export const emptyNodeData = (): NodeData => ({ comments: [], shapes: [], nags: [], startingComments: [] });

export function header(chapter: Chapter, name: string): string | undefined {
  return chapter.headers.find(([k]) => k === name)?.[1];
}
