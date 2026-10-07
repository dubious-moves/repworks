// Plan cards (PLAN.md §5.61), mistake-lab's plan-recall cards (`c525403`): a thin enrolment (a
// `plan` event: the position and the side the board is turned to), its content read live from the
// position's notes, which here are the studies' comments (D3): every node that reaches the
// position, in every study, and a chapter that starts there. A card whose position has no comment
// is left out of the deck and counted ("need content"), as mistake-lab never shows a blank card.
// Reviewed by the owner's own grade, as an ordinary `review` of `p|<key>`. Pure.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { planCard, type CardId } from '../progress/cards.ts';
import type { DeviceEvent } from '../progress/replay.ts';
import type { Chapter, MoveNode, Shape } from '../study/model.ts';
import { startPosition } from '../study/tree.ts';
import type { Color } from './record.ts';

/** The enrolled positions (the latest `plan` event of each card deciding), with their sides. */
export function planEnrolments(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): Map<PositionKey, Color> {
  const out = new Map<PositionKey, Color>();
  for (const card of cards) {
    if (!card.startsWith('p|')) continue;
    let last: { on: boolean; side: Color } | undefined;
    for (const e of eventsOf(card)) if (e.event?.k === 'plan') last = { on: e.event.on, side: e.event.side };
    if (last?.on) out.set(card.slice(2) as PositionKey, last.side);
  }
  return out;
}

export interface NotePlace {
  sid: string;
  cid: string;
  /** The node's path ([] a chapter's start). */
  path: string[];
}

export interface PlanNote {
  /** A FEN of the position, with a move number from where it was found. */
  fen: string;
  comments: string[];
  shapes: Shape[];
  places: NotePlace[];
}

/**
 * The notes of `keys` (positions), from every chapter given: the comments and shapes of each node
 * that reaches one, the start's included; a position found without any comment or shape still
 * gets its FEN and places (its card then needs content).
 */
export function planNotes(chapters: Iterable<{ sid: string; cid: string; chapter: Chapter }>, keys: ReadonlySet<PositionKey>): Map<PositionKey, PlanNote> {
  const out = new Map<PositionKey, PlanNote>();
  if (!keys.size) return out;
  const take = (key: PositionKey, pos: Position, node: { comments: string[]; shapes: Shape[] }, place: NotePlace) => {
    let n = out.get(key);
    if (!n) out.set(key, (n = { fen: makeFen(pos.toSetup()), comments: [], shapes: [], places: [] }));
    n.places.push(place);
    for (const c of node.comments) if (c.trim() && !n.comments.includes(c.trim())) n.comments.push(c.trim());
    for (const s of node.shapes) if (!n.shapes.some((x) => x.orig === s.orig && x.dest === s.dest && x.brush === s.brush)) n.shapes.push(s);
  };
  for (const { sid, cid, chapter } of chapters) {
    const start = startPosition(chapter);
    if (!start) continue;
    const k0 = positionKeyOf(start);
    if (keys.has(k0)) take(k0, start, chapter.root, { sid, cid, path: [] });
    const walk = (pos: Position, children: readonly MoveNode[], path: string[]) => {
      for (const node of children) {
        const move = parseSan(pos, node.san);
        if (!move || !isNormal(move)) continue;
        const next = pos.clone();
        next.play(move);
        const here = [...path, node.san];
        const key = positionKeyOf(next);
        if (keys.has(key)) take(key, next, node, { sid, cid, path: here });
        walk(next, node.children, here);
      }
    };
    walk(start, chapter.root.children, []);
  }
  return out;
}

export interface PlanItem {
  kind: 'plan';
  /** The position's key (its card is `p|<key>`). */
  pid: PositionKey;
  key: PositionKey;
  gameId: '';
  ply: number;
  fenBefore: string;
  color: Color;
  /** For the queue's order (mistake-lab's `wpDrop: 0`). */
  wpDrop: 0;
  note: PlanNote;
}

/** The plan cards for the deck, and how many enrolled positions have no content to show. */
export function planDeck(enrolled: ReadonlyMap<PositionKey, Color>, notes: ReadonlyMap<PositionKey, PlanNote>): { cards: { card: CardId; item: PlanItem }[]; needContent: number } {
  const cards: { card: CardId; item: PlanItem }[] = [];
  let needContent = 0;
  for (const [key, color] of enrolled) {
    const note = notes.get(key);
    if (!note || (!note.comments.length && !note.shapes.length)) {
      needContent++;
      continue;
    }
    const n = Number(note.fen.split(' ')[5]) || 1;
    const ply = (n - 1) * 2 + (note.fen.split(' ')[1] === 'b' ? 2 : 1);
    cards.push({ card: planCard(key), item: { kind: 'plan', pid: key, key, gameId: '', ply, fenBefore: note.fen, color, wpDrop: 0, note } });
  }
  return { cards, needContent };
}
