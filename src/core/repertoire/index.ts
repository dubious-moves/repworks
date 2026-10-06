// The repertoire index (PLAN.md §5.1): every position the repertoire studies reach, the moves
// played there, the cards those moves make, and the lines a trainer can walk.
// - A move by the chapter's side (its `Orientation`) is an own move and makes the card
//   `r|<key before>|<standard UCI>`; any other move is the opponent's.
// - Cards attach to position and move, not to a node (D3): two chapters, or two move orders in
//   one chapter, that play the same move in the same position share one card.
// - A line is a path from a chapter's start to a leaf. Lines come in tree order: a chapter's main
//   line first, then each variation where it branches, depth first; chapters in study order.
// Built per chapter (`indexChapter`), so the app can keep each chapter's part by its file's blob
// SHA and rebuild only the chapters that changed, then combined (`combineIndex`).
import type { Position } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { isNormal, type Color } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import { repertoireCard, type CardId } from '../progress/cards.ts';
import { header, type Chapter, type MoveNode, type RootNode } from '../study/model.ts';
import { startPosition } from '../study/tree.ts';

/** The header that marks a chapter's lines as learned before (PLAN.md §5.3). */
export const KNOWN_HEADER = 'RepworksKnown';

/** Where a move is played: a node of a chapter. */
export interface Occurrence {
  sid: string;
  cid: string;
  /** The path to the node of the move itself (its last SAN is the move). */
  path: readonly string[];
  san: string;
}

export interface IndexedMove {
  key: PositionKey;
  /** The position the move reaches. */
  after: PositionKey;
  uci: string;
  /** Set for an own move; an opponent's move makes no card. */
  card?: CardId;
  at: Occurrence;
}

export interface Line {
  sid: string;
  cid: string;
  /** Whether the chapter is marked known: its moves skip teaching and the daily limit. */
  known: boolean;
  /** The moves from the chapter's start to the leaf. */
  path: readonly string[];
  /** The own moves' cards along the line, in order (a card met twice is listed twice). */
  cards: readonly CardId[];
  /** Where each card's move is on the line: its index in `path`. */
  plies: readonly number[];
}

export interface ChapterIndex {
  sid: string;
  cid: string;
  side: Color;
  known: boolean;
  moves: IndexedMove[];
  lines: Line[];
}

export type ChapterIndexing = { ok: true; index: ChapterIndex } | { ok: false; sid: string; cid: string; reason: string };

export interface PositionMoves {
  /** uci → where it is played as an own move. */
  own: Map<string, Occurrence[]>;
  /** uci → where it is played as the opponent's move. */
  opponent: Map<string, Occurrence[]>;
}

export interface RepertoireIndex {
  positions: Map<PositionKey, PositionMoves>;
  /** Every card, with where its move is played. */
  cards: Map<CardId, Occurrence[]>;
  /** Every position a move reaches, with the moves that reach it (transpositions, §5.11). */
  reached: Map<PositionKey, Occurrence[]>;
  lines: Line[];
  /** Chapters that make no cards, and why. */
  skipped: { sid: string; cid: string; reason: string }[];
}

const sideOf = (value: string | undefined): Color | undefined => (value === 'white' || value === 'black' ? value : undefined);

/** One chapter's moves and lines. A chapter with no side or no legal start makes nothing. */
export function indexChapter(sid: string, chapter: Chapter): ChapterIndexing {
  const cid = chapter.id;
  const side = sideOf(header(chapter, 'Orientation'));
  if (!side) return { ok: false, sid, cid, reason: 'the chapter has no side (Orientation)' };
  const start = startPosition(chapter);
  if (!start) return { ok: false, sid, cid, reason: 'the start position is not legal' };
  const known = header(chapter, KNOWN_HEADER) === 'true';
  const moves: IndexedMove[] = [];
  const lines: Line[] = [];

  // Each position is keyed once, as the move reaching it is indexed, and handed to its children.
  const walk = (node: RootNode | MoveNode, pos: Position, key: PositionKey, path: string[], cards: CardId[], plies: number[]) => {
    let walked = 0;
    for (const child of node.children) {
      const move = parseSan(pos, child.san);
      // A chapter as parsed holds legal moves only (§4.5); anything else is left out with what
      // follows it, as the parser would have cut it.
      if (!move || !isNormal(move)) continue;
      const uci = standardUci(pos, move);
      const childPath = [...path, child.san];
      const after = pos.clone();
      after.play(move);
      const afterKey = positionKeyOf(after);
      const indexed: IndexedMove = { key, after: afterKey, uci, at: { sid, cid, path: childPath, san: child.san } };
      let childCards = cards;
      let childPlies = plies;
      if (pos.turn === side) {
        indexed.card = repertoireCard(key, uci);
        childCards = [...cards, indexed.card];
        childPlies = [...plies, path.length];
      }
      moves.push(indexed);
      walked++;
      walk(child, after, afterKey, childPath, childCards, childPlies);
    }
    // A line ends where the walk stops: at a leaf, or before moves that were left out.
    if (path.length > 0 && walked === 0) lines.push({ sid, cid, known, path, cards, plies });
  };
  walk(chapter.root, start, positionKeyOf(start), [], [], []);
  return { ok: true, index: { sid, cid, side, known, moves, lines } };
}

/** The chapters' parts as one index, in the order given (studies, then their chapters). */
export function combineIndex(parts: readonly ChapterIndexing[]): RepertoireIndex {
  const positions = new Map<PositionKey, PositionMoves>();
  const cards = new Map<CardId, Occurrence[]>();
  const reached = new Map<PositionKey, Occurrence[]>();
  const lines: Line[] = [];
  const skipped: RepertoireIndex['skipped'] = [];
  for (const part of parts) {
    if (!part.ok) {
      skipped.push({ sid: part.sid, cid: part.cid, reason: part.reason });
      continue;
    }
    for (const m of part.index.moves) {
      let here = positions.get(m.key);
      if (!here) positions.set(m.key, (here = { own: new Map(), opponent: new Map() }));
      const byUci = m.card ? here.own : here.opponent;
      let at = byUci.get(m.uci);
      if (!at) byUci.set(m.uci, (at = []));
      at.push(m.at);
      const to = reached.get(m.after);
      if (to) to.push(m.at);
      else reached.set(m.after, [m.at]);
      if (m.card) {
        let of = cards.get(m.card);
        if (!of) cards.set(m.card, (of = []));
        of.push(m.at);
      }
    }
    lines.push(...part.index.lines);
  }
  return { positions, cards, reached, lines, skipped };
}

/** The repertoire studies' chapters, in order: reference studies make no cards (D3). */
export function indexStudies(studies: readonly { sid: string; kind: 'repertoire' | 'reference'; chapters: readonly Chapter[] }[]): RepertoireIndex {
  return combineIndex(studies.filter((s) => s.kind === 'repertoire').flatMap((s) => s.chapters.map((c) => indexChapter(s.sid, c))));
}

/** Positions where the repertoire plays more than one own move (D3), with the moves. */
export function conflicts(index: RepertoireIndex): { key: PositionKey; ucis: string[] }[] {
  const out: { key: PositionKey; ucis: string[] }[] = [];
  for (const [key, here] of index.positions) if (here.own.size > 1) out.push({ key, ucis: [...here.own.keys()] });
  return out;
}
