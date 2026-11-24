// A line found inside one study (the owner's request of 2026-11-24, PLAN.md §5.210): moves typed
// from the start, numbered or not ("1. Nc3 d5 2. d4", "1.Nc3 d5 2.d4", "Nc3 d5 d4"), or a FEN, and
// the places in the study's chapters that reach them. The line itself first, played in that order
// (the open chapter before the others), then the chapters that reach its position by another
// order (D10's key, as the search page's). When no chapter reaches it, how far the study follows
// the line, so the move where it leaves is the one shown. Pure: the chapters as read, a query.
import { Chess } from 'chessops/chess';
import { positionKeyOf } from '../chess/positionKey.ts';
import type { Chapter } from './model.ts';
import { lineText, queryPosition, type ReachOf } from './search.ts';
import { transpositions } from './transpositions.ts';
import { startPosition, type Path } from './tree.ts';

export interface LineChapter {
  cid: string;
  /** The chapter's name. */
  name: string;
  chapter: Chapter;
}

export interface LineHit {
  cid: string;
  name: string;
  /** The place in the chapter: the moves from its start. */
  path: Path;
  /** `path` as movetext. */
  line: string;
  /** `line`: the moves as typed; `position`: the same position by another order; `partial`: as far as the chapter follows the line. */
  how: 'line' | 'position' | 'partial';
  /** For `partial`, how many of the line's moves the chapter plays. */
  moves?: number;
}

export interface FoundLine {
  /** The line read, as movetext ("1. Nc3 d5 2. d4"), or the FEN as typed. */
  line: string;
  /** Its moves, in the chapters' spelling; none for a FEN. */
  sans: string[];
  /** The chapters' places at it: the line's own first, then other orders. */
  hits: LineHit[];
  /** When no chapter reaches it: the chapter that follows the line furthest, at its last move there. */
  partial?: LineHit;
}

/**
 * The places in `chapters` (one study's, in its order) for `query`; undefined when the query
 * doesn't read as moves from the start or a FEN. `current` (the open chapter) comes first among
 * equals. A chapter that plays the line in its own order is listed by that place only.
 */
export function findLine(chapters: readonly LineChapter[], query: string, current?: string, reachOf: ReachOf = (c) => transpositions(c).reach): FoundLine | undefined {
  const asked = queryPosition(query);
  if (!asked) return undefined;
  const sans = asked.sans ?? [];
  const initial = positionKeyOf(Chess.default());
  const ordered = [...chapters.filter((c) => c.cid === current), ...chapters.filter((c) => c.cid !== current)];
  const lines: LineHit[] = [];
  const others: LineHit[] = [];
  let partial: LineHit | undefined;
  for (const c of ordered) {
    const start = startPosition(c.chapter);
    if (!start) continue;
    // The line's own moves, as far as the chapter plays them (a chapter from the start only).
    let played = 0;
    if (sans.length && positionKeyOf(start) === initial) {
      let node = c.chapter.root;
      for (const san of sans) {
        const next = node.children.find((child) => child.san === san);
        if (!next) break;
        node = next;
        played++;
      }
    }
    if (sans.length && played === sans.length) {
      lines.push({ cid: c.cid, name: c.name, path: sans, line: lineText(start, sans), how: 'line' });
      continue;
    }
    const paths = positionKeyOf(start) === asked.key ? [[] as Path] : reachOf(c.chapter).get(asked.key);
    if (paths?.length) {
      others.push({ cid: c.cid, name: c.name, path: paths[0]!, line: lineText(start, paths[0]!), how: 'position' });
      continue;
    }
    if (played > (partial?.moves ?? 0)) {
      const path = sans.slice(0, played);
      partial = { cid: c.cid, name: c.name, path, line: lineText(start, path), how: 'partial', moves: played };
    }
  }
  const hits = [...lines, ...others];
  return { line: asked.line, sans, hits, ...(hits.length || !partial ? {} : { partial }) };
}
