// Search across the studies (PLAN.md §5.166): a study or a chapter by its name, a comment by its
// words, and a position by a FEN or a line of moves from the start, wherever a chapter reaches it
// (D10's key, so by any move order). Pure: the chapters as read, a query, the hits in order.
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import type { Chapter, MoveNode, RootNode, StudyKind } from './model.ts';
import { transpositions } from './transpositions.ts';
import { startPosition, type Path } from './tree.ts';

export interface SearchChapter {
  sid: string;
  study: string;
  kind: StudyKind;
  cid: string;
  /** The chapter's name. */
  name: string;
  chapter: Chapter;
}

interface Where {
  sid: string;
  study: string;
  cid: string;
  chapter: string;
}

export type SearchHit =
  | { kind: 'study'; sid: string; study: string; studyKind: StudyKind; chapters: number }
  | ({ kind: 'chapter' } & Where)
  /** A position the chapter reaches: its first place in tree order, and by how many move orders. */
  | ({ kind: 'position'; path: Path; line: string; orders: number } & Where)
  /** A comment: the move it is on ("Start" for the chapter's own), and the words around the match. */
  | ({ kind: 'comment'; path: Path; move: string; text: string } & Where);

export interface SearchResult {
  hits: SearchHit[];
  /** Hits left out by the limits, by kind. */
  more: { chapter: number; comment: number; position: number };
  /** The position asked for, when the query reads as a FEN (`fen`) or as moves from the start (`sans`, and `line` as movetext). */
  position?: { fen?: string; sans?: string[]; line: string };
  /** The query's words, lower-cased, for marking them in a hit. */
  words: string[];
}

export interface SearchLimits {
  chapter: number;
  comment: number;
  position: number;
}
export const SEARCH_LIMITS: SearchLimits = { chapter: 40, comment: 60, position: 40 };

/** Lower case, accents off: "grunfeld" finds "Grünfeld". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The query's words: every one must be found. */
export const searchWords = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean);

const hasAll = (text: string, words: readonly string[]) => words.every((w) => text.includes(w));

/** A move's label by its place from `start`: "12. Nf3", "12... Nf6". */
function moveLabel(start: Position, depth: number, san: string): string {
  const ply = depth - 1 + (start.turn === 'black' ? 1 : 0);
  return `${start.fullmoves + Math.floor(ply / 2)}${ply % 2 ? '...' : '.'} ${san}`;
}

/** A path as movetext from `start`: "1. e4 c5 2. Nf3"; Black's number only where the line begins. */
function lineText(start: Position, path: Path): string {
  return path.map((san, i) => {
    const ply = i + (start.turn === 'black' ? 1 : 0);
    const n = start.fullmoves + Math.floor(ply / 2);
    return ply % 2 ? (i === 0 ? `${n}... ${san}` : san) : `${n}. ${san}`;
  }).join(' ');
}

const SNIPPET = 140;

/** The words around the first match in `text` (the whole of a short one), with … where it is cut. */
function snippet(text: string, words: readonly string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SNIPPET) return flat;
  const folded = fold(flat);
  // Folding can change a text's length (a letter and its accent apart): then from the start.
  const at = folded.length === flat.length ? Math.max(0, ...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0).slice(0, 1)) : 0;
  let from = Math.max(0, at - 40);
  if (from > 0) {
    const space = flat.indexOf(' ', from);
    if (space >= 0 && space < at) from = space + 1;
  }
  let to = Math.min(flat.length, from + SNIPPET);
  if (to < flat.length) {
    const space = flat.lastIndexOf(' ', to);
    if (space > at) to = space;
  }
  return `${from > 0 ? '… ' : ''}${flat.slice(from, to)}${to < flat.length ? ' …' : ''}`;
}

/** The position a query names: a FEN, or SAN moves from the start ("1.e4 c5 2.Nf3", "e4 c5 Nf3"). */
export function queryPosition(query: string): { key: PositionKey; fen?: string; sans?: string[]; line: string } | undefined {
  const q = query.trim();
  if (!q) return undefined;
  if (q.includes('/')) {
    // chessops reads a FEN cut short (the board alone, or without its counters) with the rest as at the start.
    const setup = parseFen(q);
    const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
    return pos?.isOk ? { key: positionKeyOf(pos.value), fen: q, line: q } : undefined;
  }
  const tokens = q.replace(/\d+\s*\.+/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 80) return undefined;
  const pos = Chess.default();
  const start = pos.clone();
  const path: string[] = [];
  for (const token of tokens) {
    // As people type them: 0-0 for O-O, a trailing ! or ?.
    const san = token.replace(/[!?]+$/, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
    const move = parseSan(pos, san);
    if (!move) return undefined;
    pos.play(move);
    path.push(san);
  }
  return { key: positionKeyOf(pos), sans: path, line: lineText(start, path) };
}

/** The positions a chapter reaches, each with the paths to it: `transpositions`' own, unless the caller keeps them. */
export type ReachOf = (chapter: Chapter) => ReadonlyMap<PositionKey, readonly Path[]>;

/**
 * The hits for `query` over `chapters` (the studies' in their order, each one's chapters in its
 * own): the position's places first (when the query reads as one), then the studies and the
 * chapters by name, then the comments. Every word must be found: in a study's name; in a
 * chapter's with its study's (one at least in the chapter's own, so a study's name alone doesn't
 * list all its chapters); within one move's comments.
 */
export function search(chapters: readonly SearchChapter[], query: string, limits: SearchLimits = SEARCH_LIMITS, reachOf: ReachOf = (c) => transpositions(c).reach): SearchResult {
  const words = searchWords(query);
  const result: SearchResult = { hits: [], more: { chapter: 0, comment: 0, position: 0 }, words };
  if (!words.length) return result;
  const asked = queryPosition(query);
  if (asked) result.position = { line: asked.line, ...(asked.fen ? { fen: asked.fen } : {}), ...(asked.sans ? { sans: asked.sans } : {}) };

  const positions: SearchHit[] = [];
  const studies: SearchHit[] = [];
  const named: SearchHit[] = [];
  const comments: SearchHit[] = [];
  const seenStudy = new Set<string>();
  const counts = new Map<string, number>();
  for (const c of chapters) counts.set(c.sid, (counts.get(c.sid) ?? 0) + 1);

  for (const c of chapters) {
    const where: Where = { sid: c.sid, study: c.study, cid: c.cid, chapter: c.name };
    const start = startPosition(c.chapter);

    if (asked && start) {
      const paths = positionKeyOf(start) === asked.key ? [[] as Path, ...(reachOf(c.chapter).get(asked.key) ?? [])] : reachOf(c.chapter).get(asked.key);
      if (paths?.length) {
        if (positions.length < limits.position) positions.push({ kind: 'position', ...where, path: paths[0]!, line: lineText(start, paths[0]!), orders: paths.length });
        else result.more.position++;
      }
    }

    const study = fold(c.study);
    if (!seenStudy.has(c.sid)) {
      seenStudy.add(c.sid);
      if (hasAll(study, words)) studies.push({ kind: 'study', sid: c.sid, study: c.study, studyKind: c.kind, chapters: counts.get(c.sid) ?? 0 });
    }
    const name = fold(c.name);
    if (words.some((w) => name.includes(w)) && hasAll(`${study} ${name}`, words)) {
      if (named.length < limits.chapter) named.push({ kind: 'chapter', ...where });
      else result.more.chapter++;
    }

    const walk = (node: RootNode | MoveNode, path: string[]) => {
      const texts = [...node.startingComments, ...node.comments];
      if (texts.length) {
        const text = texts.join(' ');
        if (hasAll(fold(text), words)) {
          if (comments.length < limits.comment) {
            const move = path.length && start ? moveLabel(start, path.length, path[path.length - 1]!) : path.length ? path[path.length - 1]! : 'Start';
            comments.push({ kind: 'comment', ...where, path: [...path], move, text: snippet(text, words) });
          } else result.more.comment++;
        }
      }
      for (const child of node.children) {
        path.push(child.san);
        walk(child, path);
        path.pop();
      }
    };
    walk(c.chapter.root, []);
  }
  result.hits = [...positions, ...studies, ...named, ...comments];
  return result;
}
