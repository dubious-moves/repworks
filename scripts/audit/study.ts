// A study's chapters walked for the repertoire audit (PLAN.md §5.219), and the checks every batch
// must pass before it is pushed. Pure: chapters in, findings out. "Ours" is the side the chapter is
// drilled from (its Orientation header), "theirs" the opponent's.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { positionKeyOf, type PositionKey } from '../../src/core/chess/positionKey.ts';
import type { ImportNote } from '../../src/core/pgn/parse.ts';
import { playedLines } from '../../src/core/repertoire/lines.ts';
import { header, type Chapter, type MoveNode, type RootNode } from '../../src/core/study/model.ts';
import { lineText } from '../../src/core/study/search.ts';
import { startPosition } from '../../src/core/study/tree.ts';

export type Colour = 'white' | 'black';
export type TreeNode = RootNode | MoveNode;

export const chapterName = (c: Chapter): string => header(c, 'ChapterName') ?? c.id;
/** The side a chapter is drilled from. */
export const sideOf = (c: Chapter): Colour => (header(c, 'Orientation') === 'black' ? 'black' : 'white');

/** SAN moves from text with or without move numbers: "1. Nc3 d5 2. d4", "1.Nc3 d5 2.d4", "Nc3 d5 d4". */
export function sansOf(text: string): string[] {
  return text
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/[!?]+$/, ''))
    .filter(Boolean);
}

/** A chapter by its id, or its name (any case). */
export function findChapter(chapters: readonly Chapter[], wanted: string): Chapter | undefined {
  const fold = (t: string) => t.trim().toLowerCase();
  return chapters.find((c) => c.id === wanted) ?? chapters.find((c) => fold(chapterName(c)) === fold(wanted));
}

export interface Visit {
  chapter: Chapter;
  node: MoveNode;
  parent: TreeNode;
  /** The moves from the chapter's start, the node's own last. */
  path: string[];
  before: Position;
  after: Position;
  /** Whether the node's move is ours. */
  ours: boolean;
}

/** Every move of a chapter, parents before children, in the tree's order. */
export function* visits(chapter: Chapter): Generator<Visit> {
  const start = startPosition(chapter);
  if (!start) return;
  const side = sideOf(chapter);
  function* walk(parent: TreeNode, pos: Position, path: string[]): Generator<Visit> {
    for (const node of parent.children) {
      const move = parseSan(pos, node.san);
      if (!move) continue;
      const after = pos.clone();
      after.play(move);
      const here = [...path, node.san];
      yield { chapter, node, parent, path: here, before: pos, after, ours: pos.turn === side };
      yield* walk(node, after, here);
    }
  }
  yield* walk(chapter.root, start, []);
}

/** A path of a chapter as text from its first move: "1. Nc3 d5 2. d4". */
export function lineOf(chapter: Chapter, path: readonly string[]): string {
  const start = startPosition(chapter);
  return start ? lineText(start, path) : path.join(' ');
}

/** The node at a path given as SANs (as written or canonical), and the positions around it. */
export function nodeAtSans(chapter: Chapter, sans: readonly string[]): { node: TreeNode; path: string[]; pos: Position } | undefined {
  const pos = startPosition(chapter);
  if (!pos) return undefined;
  let node: TreeNode = chapter.root;
  const path: string[] = [];
  for (const san of sans) {
    const move = parseSan(pos, san);
    if (!move) return undefined;
    const want = makeSan(pos, move);
    const next: MoveNode | undefined = node.children.find((c) => {
      const m = parseSan(pos, c.san);
      return m !== undefined && makeSan(pos, m) === want;
    });
    if (!next) return undefined;
    pos.play(move);
    path.push(next.san);
    node = next;
  }
  return { node, path, pos };
}

const isTransposeNote = (text: string) => /transpos/i.test(text);
const count = (n: TreeNode): number => n.children.reduce((s, c) => s + 1 + count(c), 0);
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ the checks */

export interface TwoMoves {
  /** Positions where it is our move and the study plays one. */
  positions: number;
  /** Those met with more than one move, anywhere in the study: each with a line that reaches it. */
  two: { line: string; chapter: string; moves: string[] }[];
}

/** One position, one move of ours: over every chapter, whatever the move order. */
export function twoMoves(chapters: readonly Chapter[]): TwoMoves {
  const seen = new Map<PositionKey, { line: string; chapter: string; moves: Set<string> }>();
  for (const chapter of chapters) {
    for (const v of visits(chapter)) {
      if (!v.ours) continue;
      const key = positionKeyOf(v.before);
      const at = seen.get(key) ?? { line: lineOf(chapter, v.path.slice(0, -1)), chapter: chapterName(chapter), moves: new Set<string>() };
      at.moves.add(v.node.san);
      seen.set(key, at);
    }
  }
  const two = [...seen.values()].filter((s) => s.moves.size > 1).map((s) => ({ line: s.line, chapter: s.chapter, moves: [...s.moves] }));
  return { positions: seen.size, two };
}

export interface ClickableLines {
  comments: number;
  lines: number;
  full: number;
  partial: number;
  dead: number;
  /** The lines that don't play in full: the commented move's line, the line as written, how far it played. */
  bad: { chapter: string; line: string; text: string; played: number; of: number }[];
  /** Groups in parentheses that are no line at all (prose, or a line the reader can't start), "(chapter …)" apart. */
  prose: { chapter: string; line: string; text: string }[];
}

/** Every clickable line of every comment, played as the app plays it. */
export function clickableLines(chapters: readonly Chapter[]): ClickableLines {
  const out: ClickableLines = { comments: 0, lines: 0, full: 0, partial: 0, dead: 0, bad: [], prose: [] };
  for (const chapter of chapters) {
    for (const v of visits(chapter)) {
      for (const text of v.node.comments) {
        out.comments++;
        const played = playedLines(text, v.after, v.before);
        const spans: [number, number][] = [];
        for (const p of played) {
          out.lines++;
          spans.push([p.line.from, p.line.to]);
          const of = p.line.moves.length;
          const got = p.ucis.length;
          if (got === of) out.full++;
          else {
            if (got > 0) out.partial++;
            else out.dead++;
            out.bad.push({ chapter: chapterName(chapter), line: lineOf(chapter, v.path), text: text.slice(p.line.from, p.line.to), played: got, of });
          }
        }
        // A group that is neither a line nor inside one: prose in parentheses, which the rules keep out.
        for (const m of text.matchAll(/\(([^()]*)\)/g)) {
          const from = m.index;
          if (spans.some(([a, b]) => from >= a && from < b)) continue;
          if (/^\s*chapter\b/i.test(m[1]!)) continue;
          out.prose.push({ chapter: chapterName(chapter), line: lineOf(chapter, v.path), text: m[0] });
        }
      }
    }
  }
  return out;
}

/** Lines that end on the opponent's move with no "transposes" note: a drilled line ends on ours. */
export function theirLeaves(chapters: readonly Chapter[]): { chapter: string; line: string }[] {
  const out: { chapter: string; line: string }[] = [];
  for (const chapter of chapters) {
    for (const v of visits(chapter)) {
      if (v.ours || v.node.children.length) continue;
      if (!v.node.comments.some(isTransposeNote)) out.push({ chapter: chapterName(chapter), line: lineOf(chapter, v.path) });
    }
  }
  return out;
}

export interface OwnerCheck {
  moves: number;
  missingMoves: string[];
  comments: number;
  missingComments: { line: string; text: string }[];
}

/**
 * Every move and comment of the owner's own file still in the chapter. A move under a missing
 * move is missing too; a comment counts as there when its text (spaces apart) is inside one of
 * the move's comments, so text added after his doesn't hide it.
 */
export function ownerCheck(owner: Chapter, now: Chapter): OwnerCheck {
  const out: OwnerCheck = { moves: 0, missingMoves: [], comments: 0, missingComments: [] };
  const walk = (a: TreeNode, b: TreeNode | undefined, path: string[]) => {
    for (const c of a.children) {
      out.moves++;
      const here = [...path, c.san];
      const m = b?.children.find((y) => y.san === c.san);
      if (!m) {
        out.missingMoves.push(lineOf(owner, here));
        walk(c, undefined, here);
        continue;
      }
      for (const text of c.comments) {
        out.comments++;
        if (!m.comments.some((u) => flat(u).includes(flat(text)))) out.missingComments.push({ line: lineOf(owner, here), text: flat(text) });
      }
      walk(c, m, here);
    }
  };
  walk(owner.root, now.root, []);
  return out;
}

export interface NoteFinding {
  chapter: string;
  line: string;
  was: string;
  /** What the note should say; undefined when the position continues nowhere. */
  now?: string;
}

interface Continuation {
  chapter: Chapter;
  index: number;
  path: string[];
  size: number;
}

/** Where each position continues: every node with moves below it, by the position it reaches. */
function continuations(chapters: readonly Chapter[]): Map<PositionKey, Continuation[]> {
  const out = new Map<PositionKey, Continuation[]>();
  chapters.forEach((chapter, index) => {
    for (const v of visits(chapter)) {
      if (!v.node.children.length) continue;
      const key = positionKeyOf(v.after);
      out.set(key, [...(out.get(key) ?? []), { chapter, index, path: v.path, size: count(v.node) }]);
    }
  });
  return out;
}

const best = (list: readonly Continuation[]): Continuation | undefined => [...list].sort((a, b) => b.size - a.size || a.index - b.index || a.path.length - b.path.length)[0];

/**
 * Every leaf's "transposes to" note against where its position really continues: the place with
 * the most moves below it, then the earliest chapter, then the shortest line; "(chapter X)" when
 * that is another chapter. `fix` rewrites the stale ones and drops the dead ones, in place.
 */
export function transposeNotes(chapters: readonly Chapter[], fix = false): { notes: number; stale: NoteFinding[]; dead: NoteFinding[] } {
  const conts = continuations(chapters);
  const out = { notes: 0, stale: [] as NoteFinding[], dead: [] as NoteFinding[] };
  for (const chapter of chapters) {
    for (const v of visits(chapter)) {
      if (v.node.children.length) continue;
      const i = v.node.comments.findIndex((t) => /transposes to/.test(t));
      if (i < 0) continue;
      out.notes++;
      const was = v.node.comments[i]!;
      const to = best(conts.get(positionKeyOf(v.after)) ?? []);
      const where = { chapter: chapterName(chapter), line: lineOf(chapter, v.path), was };
      if (!to) {
        out.dead.push(where);
        if (fix) v.node.comments.splice(i, 1);
        continue;
      }
      const now = `transposes to ${lineOf(to.chapter, to.path)}${to.chapter === chapter ? '' : ` (chapter ${chapterName(to.chapter)})`}`;
      if (flat(was) === now) continue;
      out.stale.push({ ...where, now });
      if (fix) v.node.comments[i] = now;
    }
  }
  return out;
}

/**
 * Positions that continue in more than one place of the study, by different move orders (a
 * position continues in one place only; chapters that share their first moves are one place).
 */
export function continuedTwice(chapters: readonly Chapter[]): { lines: string[] }[] {
  const out: { lines: string[] }[] = [];
  for (const list of continuations(chapters).values()) {
    const orders = new Map<string, Continuation>();
    for (const c of list) if (!orders.has(c.path.join(' '))) orders.set(c.path.join(' '), c);
    if (orders.size > 1) out.push({ lines: [...orders.values()].map((c) => `${lineOf(c.chapter, c.path)}${chapters.length > 1 ? ` (${chapterName(c.chapter)})` : ''}`) });
  }
  return out;
}

/** What the parser cut or rewrote on reading the chapter files: none in a file the app wrote. */
export function readingNotes(chapters: readonly Chapter[], notes: ReadonlyMap<string, readonly ImportNote[]>): { illegal: string[]; other: string[] } {
  const out = { illegal: [] as string[], other: [] as string[] };
  for (const chapter of chapters) {
    for (const n of notes.get(chapter.id) ?? []) {
      const at = `${chapterName(chapter)}: ${lineOf(chapter, n.path)}`;
      if (n.kind === 'illegal') out.illegal.push(`${at} ${n.san}`);
      else if (n.kind === 'canonical') out.other.push(`${at} (written ${n.from})`);
      else if (n.kind === 'merged') out.other.push(`${at} (the same move twice)`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ the ledger's counts */

export interface SubtreeCount {
  /** The subtree's first moves, as text. */
  line: string;
  path: string[];
  /** Positions where the opponent is to move and the study drills a reply. */
  positions: number;
  replies: number;
  /** Replies answered by one move of ours, where the line then ends. */
  single: number;
  /** Our moves below. */
  ours: number;
}

/** The ledger's count per subtree: every line cut at `depth` plies (shorter lines as they are). */
export function subtreeCounts(chapter: Chapter, depth: number): SubtreeCount[] {
  const side = sideOf(chapter);
  const start = startPosition(chapter);
  const firstTurn: Colour = start?.turn ?? 'white';
  const turnAt = (ply: number): Colour => (ply % 2 === 0 ? firstTurn : firstTurn === 'white' ? 'black' : 'white');
  const stats = (root: TreeNode, ply: number): Omit<SubtreeCount, 'line' | 'path'> => {
    const s = { positions: 0, replies: 0, single: 0, ours: 0 };
    const walk = (n: TreeNode, p: number) => {
      if (turnAt(p) !== side && n.children.length) {
        s.positions++;
        s.replies += n.children.length;
        for (const c of n.children) if (c.children.length === 1 && c.children[0]!.children.length === 0) s.single++;
      }
      if (turnAt(p) === side) s.ours += n.children.length;
      for (const c of n.children) walk(c, p + 1);
    };
    walk(root, ply);
    return s;
  };
  const out: SubtreeCount[] = [];
  const walk = (n: TreeNode, path: string[]) => {
    if (path.length === depth || (path.length > 0 && !n.children.length)) {
      out.push({ line: lineOf(chapter, path), path, ...stats(n, path.length) });
      return;
    }
    for (const c of n.children) walk(c, [...path, c.san]);
  };
  walk(chapter.root, []);
  return out;
}
