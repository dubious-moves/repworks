// What changed between two versions of a chapter (PLAN.md §5.214): the moves one has and the other
// doesn't, the first move at a position (in a repertoire, my move), comments, arrows and glyphs.
// A move is its path of SANs (§4.4), so the two trees are walked together from their roots; what
// one version adds or drops is reported once, at the first move of the part, with every line
// below it. Positions tell a line that moved to another order from one that is new: an added
// move says where the old version already reached its position, a removed one where the new
// version still does. Pure: two chapters as read.
import type { Position } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { sameShape } from '../pgn/comment.ts';
import { header, type Chapter, type MoveNode, type NodeData, type Shape } from './model.ts';
import { lineText } from './search.ts';
import { transpositions } from './transpositions.ts';
import { startPosition, type Path, type TreeNode } from './tree.ts';

/** A comment of a move inside an added or removed part. */
export interface PartComment {
  path: Path;
  text: string;
}

/** A part one version has and the other doesn't: its first move, and everything below it. */
export interface Part {
  /** The part's first move. */
  path: Path;
  /** Whose move it is. */
  side: 'white' | 'black';
  /** How many moves the part holds, its first included. */
  moves: number;
  /** Every line of the part, each from the chapter's start to a line end; the main one first. */
  lines: Path[];
  /** The comments of the part's moves, in tree order. */
  comments: PartComment[];
  /** How many of its moves carry arrows or circles. */
  shapes: number;
  /**
   * Where the other version reaches the position after the part's first move: for an added part
   * the old version's paths (the line was already there, by another order), for a removed one
   * the new version's (the position is still in the chapter).
   */
  elsewhere: Path[];
}

export type Change =
  | ({ kind: 'added' } & Part)
  | ({ kind: 'removed' } & Part)
  /**
   * The first move at a position changed (in a repertoire, at my position: my move). `path` is the
   * position's (its last move's). `fromKept`: the old first move is still there, as a side line;
   * `toKnown`: the new one was already there. A move that came or went is also an added or
   * removed part of its own.
   */
  | { kind: 'main'; path: Path; side: 'white' | 'black'; from: string; to: string; fromKept: boolean; toKnown: boolean }
  /** The same first move, the side lines in another order. */
  | { kind: 'order'; path: Path; side: 'white' | 'black'; from: string[]; to: string[] }
  | { kind: 'comment'; path: Path; from: string[]; to: string[] }
  | { kind: 'shapes'; path: Path; from: Shape[]; to: Shape[] }
  | { kind: 'glyphs'; path: Path; from: number[]; to: number[] }
  | { kind: 'header'; name: string; from: string | undefined; to: string | undefined };

export interface ChapterDiff {
  /** In the new version's tree order; a removed part where the old version had it. */
  changes: Change[];
  /** The start position, for the lines' move numbers: the new version's. */
  start: Position | undefined;
  /** The side the chapter is a repertoire for: the new version's `Orientation`. */
  mine: 'white' | 'black';
}

/** The headers whose change is a change of the chapter (the rest are a writer's own: Event, Site, Annotator…). */
const HEADERS = ['ChapterName', 'Orientation', 'FEN'];

const texts = (n: NodeData) => [...n.startingComments, ...n.comments];
const sameList = <T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean = Object.is) => a.length === b.length && a.every((x, i) => same(x, b[i]!));
/** A comment's text as it reads: a writer's line wraps (deeprep's at 80 columns) are no change. */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const sameSet = <T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean) => a.length === b.length && a.every((x) => b.some((y) => same(x, y)));

/**
 * The changes from `old` to `now`. `wraps: 'keep'` reports a comment whose only change is its
 * white space (line breaks included); by default such a comment is unchanged.
 */
export function diffChapters(old: Chapter, now: Chapter, options: { wraps?: 'keep' | 'ignore' } = {}): ChapterDiff {
  const keep = options.wraps === 'keep';
  const sameText = (a: string, b: string) => (keep ? a === b : flat(a) === flat(b));
  const changes: Change[] = [];
  for (const name of HEADERS) {
    const from = header(old, name);
    const to = header(now, name);
    if (from !== to) changes.push({ kind: 'header', name, from, to });
  }
  const start = startPosition(now);
  const oldStart = startPosition(old);
  const { reach: oldReach, keyOf: oldKeys } = transpositions(old);
  const { reach: nowReach, keyOf: nowKeys } = transpositions(now);

  const part = (top: MoveNode, path: Path, side: 'white' | 'black', elsewhere: Path[]): Part => {
    const lines: Path[] = [];
    const comments: PartComment[] = [];
    let moves = 0;
    let shapes = 0;
    const walk = (node: MoveNode, at: Path) => {
      moves++;
      if (node.shapes.length) shapes++;
      for (const text of texts(node)) comments.push({ path: at, text });
      if (!node.children.length) lines.push(at);
      for (const child of node.children) walk(child, [...at, child.san]);
    };
    walk(top, path);
    return { path, side, moves, lines, comments, shapes, elsewhere };
  };

  const data = (a: NodeData, b: NodeData, path: Path) => {
    if (!sameList(texts(a), texts(b), sameText)) changes.push({ kind: 'comment', path, from: texts(a), to: texts(b) });
    if (!sameSet(a.shapes, b.shapes, sameShape)) changes.push({ kind: 'shapes', path, from: a.shapes, to: b.shapes });
    if (!sameSet(a.nags, b.nags, Object.is)) changes.push({ kind: 'glyphs', path, from: a.nags, to: b.nags });
  };

  // `turn`: the side to move at `path`.
  const walk = (a: TreeNode, b: TreeNode, path: Path, turn: 'white' | 'black') => {
    data(a, b, path);
    const next = turn === 'white' ? 'black' : 'white';
    const inOld = new Set(a.children.map((c) => c.san));
    const inNow = new Set(b.children.map((c) => c.san));
    const firstOld = a.children[0]?.san;
    const firstNow = b.children[0]?.san;
    if (firstOld !== undefined && firstNow !== undefined && firstOld !== firstNow) {
      changes.push({ kind: 'main', path, side: turn, from: firstOld, to: firstNow, fromKept: inNow.has(firstOld), toKnown: inOld.has(firstNow) });
    } else {
      const commonOld = a.children.filter((c) => inNow.has(c.san)).map((c) => c.san);
      const commonNow = b.children.filter((c) => inOld.has(c.san)).map((c) => c.san);
      if (!sameList(commonOld, commonNow)) changes.push({ kind: 'order', path, side: turn, from: a.children.map((c) => c.san), to: b.children.map((c) => c.san) });
    }
    for (const child of b.children) {
      const childPath = [...path, child.san];
      const before = a.children.find((c) => c.san === child.san);
      if (before) walk(before, child, childPath, next);
      else {
        const key = nowKeys.get(childPath.join(' '));
        changes.push({ kind: 'added', ...part(child, childPath, turn, key === undefined ? [] : [...(oldReach.get(key) ?? [])]) });
      }
    }
    for (const child of a.children) {
      if (inNow.has(child.san)) continue;
      const childPath = [...path, child.san];
      const key = oldKeys.get(childPath.join(' '));
      changes.push({ kind: 'removed', ...part(child, childPath, turn, key === undefined ? [] : [...(nowReach.get(key) ?? [])]) });
    }
  };
  walk(old.root, now.root, [], (start ?? oldStart)?.turn ?? 'white');
  return { changes, start, mine: header(now, 'Orientation') === 'black' ? 'black' : 'white' };
}

/** What a diff holds, counted. */
export interface DiffCounts {
  added: number;
  addedMoves: number;
  removed: number;
  removedMoves: number;
  /** First moves changed at my positions (a changed repertoire move), and at the opponent's. */
  myMoves: number;
  replies: number;
  comments: number;
  shapes: number;
  glyphs: number;
  order: number;
  headers: number;
}

export function countChanges(d: ChapterDiff): DiffCounts {
  const n: DiffCounts = { added: 0, addedMoves: 0, removed: 0, removedMoves: 0, myMoves: 0, replies: 0, comments: 0, shapes: 0, glyphs: 0, order: 0, headers: 0 };
  for (const c of d.changes) {
    if (c.kind === 'added') (n.added++, (n.addedMoves += c.moves));
    else if (c.kind === 'removed') (n.removed++, (n.removedMoves += c.moves));
    else if (c.kind === 'main') c.side === d.mine ? n.myMoves++ : n.replies++;
    else if (c.kind === 'comment') n.comments++;
    else if (c.kind === 'shapes') n.shapes++;
    else if (c.kind === 'glyphs') n.glyphs++;
    else if (c.kind === 'order') n.order++;
    else n.headers++;
  }
  return n;
}

/**
 * A line as movetext with the part from move `from` (an index into the path) on between `open`
 * and `close`: "1. Nc3 d5 2. d4 **Bf5 3. f3**". Always from the chapter's start, never cut.
 */
export function markedLine(start: Position, path: Path, from: number, open = '**', close = '**'): string {
  if (from >= path.length) return lineText(start, path);
  if (from <= 0) return `${open}${lineText(start, path)}${close}`;
  const head = lineText(start, path.slice(0, from));
  const pos = start.clone();
  for (const san of path.slice(0, from)) {
    const m = parseSan(pos, san);
    if (!m) return lineText(start, path);
    pos.play(m);
  }
  // The rest numbered from its own position, without Black's "3..." after White's move just before it.
  const tail = lineText(pos, path.slice(from)).replace(/^\d+\.\.\. /, '');
  return `${head} ${open}${tail}${close}`;
}
