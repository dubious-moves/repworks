// Idea cards (PLAN.md §5.128): one chapter of an idea deck is one card, `i|<sid>|<cid>`, enrolled
// for a whole study by `idea` events (as plan cards' `plan` events, §5.61) and read from the
// chapter as written: its `IdeaQuestion` asked at its position, turned to its `Orientation`; the
// comment before the first move the explanation, with its arrows; the main line the idea played
// out; a side line where it fails, or another playable move. The overview chapter (`IdeaKind
// "overview"`, the rules of thumb) makes no card. Pure.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Move } from 'chessops/types';
import { gameQueue, type QueueDay } from '../games/deck.ts';
import { ideaCard, parseIdeaCard, type CardId } from '../progress/cards.ts';
import type { Grade } from '../progress/events.ts';
import type { CardState, DeviceEvent } from '../progress/replay.ts';
import { SUFFIX } from '../pgn/nags.ts';
import { header, type Chapter, type MoveNode, type Shape } from '../study/model.ts';
import { startPosition } from '../study/tree.ts';

/** The kinds a deck's chapters carry (the skill's deck format). */
export const IDEA_KINDS = ['overview', 'structure', 'break', 'placement', 'maneuver', 'king', 'exchange', 'tactic', 'trap', 'move-order', 'endgame'] as const;

/** A chapter of an idea deck: it has an `IdeaKind`. */
export const isDeckChapter = (chapter: Chapter) => !!header(chapter, 'IdeaKind')?.trim();

/** A chapter that makes a card: a deck's chapter other than the overview. */
export const makesIdeaCard = (chapter: Chapter) => isDeckChapter(chapter) && header(chapter, 'IdeaKind')!.trim() !== 'overview';

/** The idea cards enrolled (the latest `idea` event of each deciding). */
export function ideaEnrolments(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): Set<CardId> {
  const out = new Set<CardId>();
  for (const card of cards) {
    if (!card.startsWith('i|')) continue;
    let on = false;
    for (const e of eventsOf(card)) if (e.event?.k === 'idea') on = e.event.on;
    if (on) out.add(card as CardId);
  }
  return out;
}

/** The enrolled cards of one study. */
export const enrolledIn = (enrolled: ReadonlySet<CardId>, sid: string) => [...enrolled].filter((c) => parseIdeaCard(c)?.sid === sid);

export interface Idea {
  card: CardId;
  sid: string;
  cid: string;
  name: string;
  kind: string;
  question: string;
  /** The side the board is turned to: the deck's side. */
  side: 'white' | 'black';
  /** The card's position. */
  fen: string;
  /** The comment before the first move, and its arrows and circles. */
  explanation: string[];
  shapes: Shape[];
  /** The moves that answer the card (SAN): its first move unless marked `?` or `??`, and the first moves marked `!` or `!!` beside it. */
  answers: string[];
  /** Answered by the owner's own grade: the card's side isn't to move, or no move answers it. */
  selfGraded: boolean;
  chapter: Chapter;
}

const marked = (node: MoveNode, nags: readonly number[]) => node.nags.some((n) => nags.includes(n));

/** A deck's chapter as a card, or undefined for the overview, a chapter of no deck, or one whose position can't be set up. */
export function readIdea(sid: string, chapter: Chapter): Idea | undefined {
  if (!makesIdeaCard(chapter)) return undefined;
  const start = startPosition(chapter);
  if (!start) return undefined;
  const orientation = header(chapter, 'Orientation');
  const side = orientation === 'white' || orientation === 'black' ? orientation : start.turn;
  const [first, ...others] = chapter.root.children;
  const answers = [...(first && !marked(first, [2, 4]) ? [first.san] : []), ...others.filter((n) => marked(n, [1, 3])).map((n) => n.san)];
  return {
    card: ideaCard(sid, chapter.id),
    sid,
    cid: chapter.id,
    name: header(chapter, 'ChapterName') ?? chapter.id,
    kind: header(chapter, 'IdeaKind')!.trim(),
    question: header(chapter, 'IdeaQuestion')?.trim() || 'What is the idea here?',
    side,
    fen: makeFen(start.toSetup()),
    explanation: [...chapter.root.startingComments, ...chapter.root.comments].map((c) => c.trim()).filter(Boolean),
    shapes: chapter.root.shapes,
    answers,
    selfGraded: start.turn !== side || answers.length === 0,
    chapter,
  };
}

/** The deck: the enrolled cards whose chapters are found, in the studies' and chapters' order given. */
export function ideaDeck(enrolled: ReadonlySet<CardId>, studies: Iterable<{ sid: string; chapters: readonly Chapter[] }>): Idea[] {
  const out: Idea[] = [];
  for (const { sid, chapters } of studies)
    for (const chapter of chapters) {
      if (!enrolled.has(ideaCard(sid, chapter.id))) continue;
      const idea = readIdea(sid, chapter);
      if (idea) out.push(idea);
    }
  return out;
}

/** Today's idea cards: due first (the earliest first), then new ones in the deck's order within the daily limit. */
export function ideaQueue(deck: readonly Idea[], states: ReadonlyMap<string, CardState>, day: QueueDay, newPerDay: number): { due: Idea[]; fresh: Idea[]; waiting: number; startedToday: number } {
  return gameQueue(deck, states, day, newPerDay);
}

/** What a move played on the card's position is. */
export type IdeaAnswer =
  | { kind: 'right'; san: string }
  /** One of the card's side lines, not an answer: its moves and comments are shown. */
  | { kind: 'side'; san: string; node: MoveNode }
  /** A move the card doesn't have: just not the answer. */
  | { kind: 'none'; san: string };

export function judgeIdeaMove(idea: Idea, pos: Position, move: Move): IdeaAnswer {
  const san = makeSan(pos, move);
  if (idea.answers.includes(san)) return { kind: 'right', san };
  const node = idea.chapter.root.children.find((n) => n.san === san);
  return node ? { kind: 'side', san, node } : { kind: 'none', san };
}

/** A side line from `pos` as a comment's line (§5.12): `(7... Nxd4?? 8. Nxd4 Qxd4?)`, then its comments, so it opens on the board. */
export function sideLineText(pos: Position, node: MoveNode): string {
  const p = pos.clone();
  const moves: string[] = [];
  const comments: string[] = [];
  let n: MoveNode | undefined = node;
  while (n) {
    const move = parseSan(p, n.san);
    if (!move) break;
    const number = p.turn === 'white' ? `${p.fullmoves}. ` : moves.length === 0 ? `${p.fullmoves}... ` : '';
    moves.push(`${number}${n.san}${n.nags.map((g) => SUFFIX[g] ?? '').join('')}`);
    comments.push(...[...n.startingComments, ...n.comments].map((c) => c.trim()).filter(Boolean));
    p.play(move);
    n = n.children[0];
  }
  return `(${moves.join(' ')})${comments.length ? ` ${comments.join(' ')}` : ''}`;
}

/** The grade a move gives: right the first time is Good, anything else Again. */
export const moveGrade = (rightFirstTime: boolean): Grade => (rightFirstTime ? 3 : 1);
