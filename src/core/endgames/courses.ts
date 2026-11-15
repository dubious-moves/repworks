// Endgames from the user's courses (PLAN.md §5.175): a reference study imported from a bought
// course (D14) is read for the chapters that start from a position (`[FEN]`), each a candidate
// drill; Stockfish's score for the side to move gives it a goal by the repertoire endgames' bands
// (`goalFor`, §5.149), and it is played as every endgame is (§5.145–§5.148): against Maia's
// defence, every move judged for the goal, every alternative move allowed. The course's one main
// line is not an answer key: it is its text (the comments, in order) kept under the board; its
// replies are the opponent's first defence (`authorReplies`, §5.185). The user
// practises the side the author teaches, which is the side that makes the course's last move (a
// lesson ends on its point, not on the reply to it): when that is not the side to move, the
// course's first move is played for the opponent and the drill starts after it. The author's mark
// on the first move overrides: `?`/`??` is the opponent's move (a blunder to punish), `!`/`!!` the
// teacher's (a line may end on the other side's forced reply: a stalemate, a draw agreed). The user
// never gets the side the author is against. Pure: Stockfish's score comes in as a function.
import type { Position } from 'chessops/chess';
import { parseSan, makeSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import { fenOf, positionOf } from '../storm/walk.ts';
import { header, type Chapter, type MoveNode } from '../study/model.ts';
import { startPosition } from '../study/tree.ts';
import { materialFor, type Endgame, type Goal, type Until } from './endgames.ts';
import type { DeviceEvent } from '../progress/replay.ts';
import { goalFor, hash, REP } from './repertoire.ts';

/** A chapter of any study, as the app reads them (`searchChapters`). */
export interface CourseChapter {
  sid: string;
  study: string;
  kind: 'repertoire' | 'reference';
  cid: string;
  name: string;
  chapter: Chapter;
}

/** A chapter that starts from a position: a drill once it has a goal. */
export interface Candidate {
  /** `c-` and the chapter start's key hash: the address's id. */
  id: string;
  key: PositionKey;
  /** The chapter's start. */
  fen: string;
  sid: string;
  cid: string;
  study: string;
  /** The chapter's name as written. */
  name: string;
  /** "Part 4: Endgames for Class C (1400-1599)" and "Rook vs. Lone Pawn - 3". */
  group: string;
  title: string;
  /** The course's first move (SAN) when the main line has one that is legal at the start. */
  first?: string;
  /** The author's mark on the first move when it is a mistake: `?` or `??`. */
  mark?: '?' | '??';
  /** The author calls the first move good: `!` or `!!`. */
  praised?: true;
  /** The side that makes the main line's last move (when every move of the line is legal). */
  last?: Color;
}

export const courseId = (key: string): string => `c-${hash(key)}`;
export const isCourseId = (id: string): boolean => /^c-[0-9a-f]{8}$/.test(id);

/**
 * A chapter name cut into its group and title: "Part 1: Endgames for Beginners (Unrated-999): The
 * Staircase - 3" is the group "Part 1: Endgames for Beginners (Unrated-999)" and the title "The
 * Staircase - 3". A name with one ": " is a title in the study's own group; with none, the same.
 */
export function nameParts(name: string, study: string): { group: string; title: string } {
  const parts = name.split(': ').map((p) => p.trim());
  if (parts.length >= 3) return { group: `${parts[0]}: ${parts[1]}`, title: parts.slice(2).join(': ') };
  if (parts.length === 2) return { group: parts[0]!, title: parts[1]! };
  return { group: study, title: name.trim() || study };
}

/**
 * The candidates of the chapters given, in their order: reference studies' chapters with a legal
 * `[FEN]` start that isn't over, the first of each position (by key).
 */
export function candidatesOf(chapters: readonly CourseChapter[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of chapters) {
    if (c.kind !== 'reference' || !header(c.chapter, 'FEN')) continue;
    const start = startPosition(c.chapter);
    if (!start || start.isEnd()) continue;
    const key = positionKeyOf(start);
    if (seen.has(key)) continue;
    seen.add(key);
    const { group, title } = nameParts(c.name, c.study);
    const first = firstMove(c.chapter, start);
    const nags = first ? c.chapter.root.children[0]!.nags : [];
    const mark = markOf(nags);
    const last = lastMover(c.chapter, start);
    out.push({ id: courseId(key), key, fen: fenOf(start), sid: c.sid, cid: c.cid, study: c.study, name: c.name, group, title, ...(first ? { first: first.san } : {}), ...(mark ? { mark } : {}), ...(!mark && praisedOf(nags) ? { praised: true as const } : {}), ...(last ? { last } : {}) });
  }
  return out;
}

/** `??` or `?` when the glyphs say so (NAG 4, 2): a move the author calls a mistake. */
function markOf(nags: readonly number[]): '?' | '??' | undefined {
  return nags.includes(4) ? '??' : nags.includes(2) ? '?' : undefined;
}

/** `!` or `!!` (NAG 1, 3): a move the author calls good. */
const praisedOf = (nags: readonly number[]): boolean => nags.includes(1) || nags.includes(3);

/**
 * The side that makes the main line's last move, when the line has a move and every move of it is
 * legal (a line cut short by a move that doesn't parse says nothing about who ends it).
 */
export function lastMover(chapter: Chapter, start: Position): Color | undefined {
  const pos = start.clone();
  let last: Color | undefined;
  for (let node: MoveNode | undefined = chapter.root.children[0]; node; node = node.children[0]) {
    const move = parseSan(pos, node.san);
    if (!move) return undefined;
    last = pos.turn;
    pos.play(move);
  }
  return last;
}

/** The main line's first move, legal at the start, and the position after it. */
export function firstMove(chapter: Chapter, start: Position): { san: string; fen: string; pos: Position } | undefined {
  const node = chapter.root.children[0];
  return node ? playMove(start, node.san) : undefined;
}

/** A move played from a position (SAN), and the position after it; undefined when it isn't legal there. */
export function playMove(start: Position, written: string): { san: string; fen: string; pos: Position } | undefined {
  const move = parseSan(start, written);
  if (!move) return undefined;
  const pos = start.clone();
  const san = makeSan(pos, move);
  pos.play(move);
  return { san, fen: fenOf(pos), pos };
}

/* ------------------------------------------------------------------ the goal */

/** What a drill asks: the goal, and a win's end. */
export interface CourseGoal {
  goal: Goal;
  until?: Until;
}

/**
 * The goal for `side` from Stockfish's score for it and its material lead (`goalFor`'s bands): a
 * win converted (a pawn queened, a bare king, or `CONVERT_LEAD` points up), a win already that far
 * ahead on material played to mate, a draw held for `REP.hold` moves; or why there is none. Against
 * a bare king (a course's king and pawn endings and its mates, with `pos`) a win is a pawn queened
 * when `side` has pawns and nothing else, else mate: the bare king is there at the start, so
 * "converted" would end the drill at once.
 */
export function courseGoal(cp: number, lead: number, pos?: Position, side?: Color): CourseGoal | string {
  const g = goalFor(cp, lead);
  if ((g === 'win' || g === 'already won on material') && pos && side && pos.board[side === 'white' ? 'black' : 'white'].size() === 1) {
    const pieces = pos.board[side].diff(pos.board.pawn).diff(pos.board.king).nonEmpty();
    return { goal: 'win', until: pieces ? 'mate' : 'promote' };
  }
  if (g === 'win') return { goal: 'win', until: 'convert' };
  if (g === 'already won on material') return { goal: 'win', until: 'mate' };
  if (g === 'draw') return { goal: 'draw' };
  return g;
}

/** A scored candidate, as this device keeps it: its drill, or why it has none. */
export interface CourseScore {
  v: 3;
  /** The candidate's key (the chapter start's). */
  key: PositionKey;
  /** Stockfish's score for the side to move at the chapter's start, and its depth. */
  cp: number;
  depth: number;
  /**
   * The drill: its start (the chapter's, or after the course's first move), the user's side, the
   * goal. `flipped` is the course's first move as written (with its mark), played for the opponent,
   * and `by` why: the author marked it a mistake, or the course ends on the other side's move.
   */
  drill?: { fen: string; side: 'white' | 'black'; goal: Goal; until?: Until; cp: number; flipped?: string; by?: FlipBy };
  /** When there is no drill, why. */
  why?: string;
  /** When it was scored, ms. */
  at: number;
}

/** Why the course's first move is the opponent's: the author marked it a mistake, or the course ends on the other side's move. */
export type FlipBy = 'marked' | 'last';

export type Scorer = (fen: string) => Promise<{ cp: number; depth: number } | undefined>;

const sideOfFen = (fen: string): 'white' | 'black' => (fen.split(' ')[1] === 'b' ? 'black' : 'white');
const sideName = (c: Color): string => (c === 'white' ? 'White' : 'Black');

/**
 * Whether the course's first move is the opponent's, and why. The author's mark decides first: `?`
 * or `??` is a blunder to punish, `!` or `!!` the teacher's own move (a line that goes on to end on
 * the other side's forced reply, a stalemate or a draw agreed, still teaches the side that started
 * it). Unmarked, the side that makes the line's last move is the side being taught, so a line that
 * ends on the other side's move starts with the opponent's. Stockfish's score is no part of it: it
 * misjudges the very positions a course is about (a fortress, a sacrifice).
 */
export function flipOf(c: Candidate, start: Position): FlipBy | undefined {
  if (!c.first) return undefined;
  if (c.mark) return 'marked';
  if (c.praised) return undefined;
  return c.last && c.last !== start.turn ? 'last' : undefined;
}

/**
 * Scores a candidate: the side the author teaches has the goal its score gives it. That is the side
 * to move at the chapter's start, unless the first move is the opponent's (`flipOf`): then it is
 * played for the opponent, the other side is the user's, and the position after it gives the goal.
 * Left out, with the reason, when that side has none: the side the author is teaching is never
 * swapped for the other. Undefined when Stockfish didn't answer (nothing kept: asked again later).
 */
export async function scoreCandidate(c: Candidate, start: Position, score: Scorer, now: number): Promise<CourseScore | undefined> {
  const a = await score(c.fen);
  if (!a) return undefined;
  const side = start.turn;
  const base = { v: 3 as const, key: c.key, cp: Math.round(a.cp), depth: a.depth, at: now };
  const by = flipOf(c, start);
  if (!by) {
    const goal = courseGoal(a.cp, materialFor(start, side), start, side);
    if (typeof goal === 'string') return { ...base, why: goal };
    return { ...base, drill: { fen: c.fen, side, ...goal, cp: Math.round(a.cp) } };
  }
  const shown = `${c.first}${c.mark ?? ''}`;
  const reason = by === 'marked' ? 'the course’s first move is a mistake' : `the course ends on ${sideName(c.last!)}’s move, so it teaches ${sideName(c.last!)}`;
  const move = playMove(start, c.first!);
  const live = move && !move.pos.isEnd() ? move : undefined;
  if (!live) return { ...base, why: `${reason}, and its first move, ${shown}, has no position after it to play` };
  const b = await score(live.fen);
  if (!b) return undefined;
  const other = live.pos.turn;
  const again = courseGoal(b.cp, materialFor(live.pos, other), live.pos, other);
  if (typeof again === 'string') return { ...base, why: `${reason}, and still no goal after the course’s ${shown}: ${again}` };
  return { ...base, drill: { fen: live.fen, side: other, ...again, cp: Math.round(b.cp), flipped: shown, by } };
}

/** A drill: a candidate with its goal. */
export interface CourseDrill {
  id: string;
  cand: Candidate;
  score: CourseScore;
  fen: string;
  side: 'white' | 'black';
  goal: Goal;
  until?: Until;
  flipped?: string;
  by?: FlipBy;
}

/**
 * The candidates, joined with their scores: the drills (not removed), the ones with no goal, those
 * not scored yet, those removed.
 */
export function courseState(cands: readonly Candidate[], scores: ReadonlyMap<string, CourseScore>, removed: ReadonlySet<string>): { drills: CourseDrill[]; left: number; todo: Candidate[]; removed: number } {
  const drills: CourseDrill[] = [];
  const todo: Candidate[] = [];
  let left = 0;
  let gone = 0;
  for (const cand of cands) {
    const score = scores.get(cand.key);
    if (!score) todo.push(cand);
    else if (!score.drill) left++;
    else if (removed.has(cand.id)) gone++;
    else drills.push({ id: cand.id, cand, score, fen: score.drill.fen, side: score.drill.side, goal: score.drill.goal, ...(score.drill.until ? { until: score.drill.until } : {}), ...(score.drill.flipped ? { flipped: score.drill.flipped } : {}), ...(score.drill.by ? { by: score.drill.by } : {}) });
  }
  return { drills, left, todo, removed: gone };
}

/**
 * A drill as the endgame drill plays it: a win converted or mated, or a draw held for `REP.hold`
 * moves; with its chapter, the author's replies for the opponent (`authorReplies`).
 */
export function asCourseEndgame(d: CourseDrill, chapter?: Chapter): Endgame {
  const from = positionOf(d.fen);
  const author = chapter && from ? authorReplies(chapter, d.side === 'white' ? 'black' : 'white', positionKeyOf(from)) : {};
  return { id: d.id, group: 'course', title: d.cand.title, fen: d.fen, goal: d.goal, ...(d.goal === 'win' ? { until: d.until ?? 'convert' } : { hold: REP.hold }), idea: '', ...(Object.keys(author).length ? { author } : {}) };
}

/**
 * The course author's replies for `side` (the drill's opponent), by position key: at every position
 * of the chapter's tree where `side` is to move, its first move there, the main line's or a
 * variation's own (the owner's request of 2026-11-15: the author's 2…Kb6, the defence that proves
 * the lesson's point, where Maia played 2…f6). The first time a position is met in the tree wins: the
 * main line before its variations. Moves that don't parse end their branch. With `from` (the drill's
 * start), only the tree from that position on: a flipped drill's first move is not a reply.
 */
export function authorReplies(chapter: Chapter, side: Color, from?: PositionKey): Record<string, string> {
  const start = startPosition(chapter);
  const out: Record<string, string> = {};
  if (!start) return out;
  const walk = (pos: Position, children: readonly MoveNode[], reached: boolean): void => {
    const key = positionKeyOf(pos);
    const on = reached || key === from;
    let first = true;
    for (const node of children) {
      const move = parseSan(pos, node.san);
      if (!move || !('from' in move)) continue;
      if (first && on && pos.turn === side && !(key in out)) out[key] = standardUci(pos, move);
      first = false;
      const next = pos.clone();
      next.play(move);
      walk(next, node.children, on);
    }
  };
  walk(start, chapter.root.children, from === undefined);
  return out;
}

/** The groups in the order of their first drill, each with its drills' count. */
export function groupsOf(drills: readonly CourseDrill[]): { group: string; n: number }[] {
  const out: { group: string; n: number }[] = [];
  for (const d of drills) {
    const g = out.find((x) => x.group === d.cand.group);
    if (g) g.n++;
    else out.push({ group: d.cand.group, n: 1 });
  }
  return out;
}

/** Whether a stored value is a score this version reads. */
export function readCourseScore(x: unknown): CourseScore | undefined {
  const s = x as Partial<CourseScore> | null;
  if (!s || s.v !== 3 || typeof s.key !== 'string' || typeof s.cp !== 'number') return undefined;
  const d = s.drill;
  if (d && (typeof d.fen !== 'string' || (d.goal !== 'win' && d.goal !== 'draw') || (d.side !== 'white' && d.side !== 'black') || sideOfFen(d.fen) !== d.side)) return undefined;
  return s as CourseScore;
}

/**
 * The scores and the drills taken off, as the progress log says (every device's, §5.175): the latest
 * `cscore` of each card `e|<key>` is its score, the latest `cdrill` says whether it is removed.
 * Removals are by chapter key, so they hold for a score made on another device.
 */
export function courseFromLog(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): { scores: Map<string, CourseScore>; removed: Set<string>; removedAt: Map<string, number> } {
  const scores = new Map<string, CourseScore>();
  const removed = new Set<string>();
  /** When the latest `cdrill` of each card was written (ms), so a change made here and not read back yet can be told from an older one. */
  const removedAt = new Map<string, number>();
  for (const card of cards) {
    if (!card.startsWith('e|')) continue;
    const key = card.slice(2);
    let off = false;
    for (const e of eventsOf(card)) {
      if (e.event?.k === 'cscore') {
        const s = readCourseScore(e.event.sc);
        if (s && s.key === key) scores.set(key, s);
      } else if (e.event?.k === 'cdrill') {
        off = e.event.on;
        removedAt.set(key, e.t);
      }
    }
    if (off) removed.add(key);
  }
  return { scores, removed, removedAt };
}

/* ------------------------------------------------------------------ the course's text */

/** What the course says at a move of its main line: the move with its number, and the comments. */
export interface CourseNote {
  /** "Start", "3.Kd2", "3…Kd7". */
  label: string;
  /** The move's path from the chapter's start (`[]` the start). */
  path: string[];
  texts: string[];
}

/**
 * The chapter's comments along its main line, in order, each with the move it belongs to; a comment
 * repeated straight after itself (the export writes some twice at the start) is kept once.
 */
export function courseText(chapter: Chapter): CourseNote[] {
  const start = startPosition(chapter);
  if (!start) return [];
  const out: CourseNote[] = [];
  let last = '';
  const take = (label: string, path: string[], node: { startingComments: string[]; comments: string[] }) => {
    const texts: string[] = [];
    for (const raw of [...node.startingComments, ...node.comments]) {
      const t = raw.trim();
      if (!t || t === last) continue;
      texts.push(t);
      last = t;
    }
    if (texts.length) out.push({ label, path, texts });
  };
  take('Start', [], chapter.root);
  const pos = start.clone();
  const path: string[] = [];
  let node: MoveNode | undefined = chapter.root.children[0];
  while (node) {
    const move = parseSan(pos, node.san);
    if (!move) break;
    const n = pos.fullmoves;
    const white = pos.turn === 'white';
    const san = makeSan(pos, move);
    pos.play(move);
    path.push(node.san);
    take(`${n}${white ? '.' : '…'}${san}`, [...path], node);
    node = node.children[0];
  }
  return out;
}
