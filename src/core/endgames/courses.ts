// Endgames from the user's courses (PLAN.md §5.175): a reference study imported from a bought
// course (D14) is read for the chapters that start from a position (`[FEN]`), each a candidate
// drill; Stockfish's score for the side to move gives it a goal by the repertoire endgames' bands
// (`goalFor`, §5.149), and it is played as every endgame is (§5.145–§5.148): against Maia's
// defence, every move judged for the goal, every alternative move allowed. The course's one main
// line is not an answer key: it is its text (the comments, in order) kept under the board, and its
// first move is played for the user only where the side to move is the worse one, so that the user
// has the stronger side (the lesson shows why the weaker side loses). Pure: Stockfish's score
// comes in as a function.
import type { Position } from 'chessops/chess';
import { parseSan, makeSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { fenOf } from '../storm/walk.ts';
import { header, type Chapter, type MoveNode } from '../study/model.ts';
import { startPosition } from '../study/tree.ts';
import { materialFor, type Endgame, type Goal, type Until } from './endgames.ts';
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
    out.push({ id: courseId(key), key, fen: fenOf(start), sid: c.sid, cid: c.cid, study: c.study, name: c.name, group, title, ...(first ? { first: first.san } : {}) });
  }
  return out;
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
  v: 1;
  /** The candidate's key (the chapter start's). */
  key: PositionKey;
  /** Stockfish's score for the side to move at the chapter's start, and its depth. */
  cp: number;
  depth: number;
  /** The drill: its start (the chapter's, or after the course's first move), the user's side, the goal. */
  drill?: { fen: string; side: 'white' | 'black'; goal: Goal; until?: Until; cp: number; flipped?: string };
  /** When there is no drill, why. */
  why?: string;
  /** When it was scored, ms. */
  at: number;
}

export type Scorer = (fen: string) => Promise<{ cp: number; depth: number } | undefined>;

const sideOfFen = (fen: string): 'white' | 'black' => (fen.split(' ')[1] === 'b' ? 'black' : 'white');

/**
 * Scores a candidate: the side to move at the chapter's start has the goal its score gives it; where
 * that side is clearly worse and the course's first move is legal, the move is played for them,
 * the other side is the user's, and the position is scored again; undefined when Stockfish didn't
 * answer (nothing kept: asked again later).
 */
export async function scoreCandidate(c: Candidate, start: Position, score: Scorer, now: number): Promise<CourseScore | undefined> {
  const a = await score(c.fen);
  if (!a) return undefined;
  const side = start.turn;
  const goal = courseGoal(a.cp, materialFor(start, side), start, side);
  if (typeof goal !== 'string') return { v: 1, key: c.key, cp: Math.round(a.cp), depth: a.depth, drill: { fen: c.fen, side, ...goal, cp: Math.round(a.cp) }, at: now };
  const base = { v: 1 as const, key: c.key, cp: Math.round(a.cp), depth: a.depth, at: now };
  if (goal !== 'you are worse') return { ...base, why: goal };
  const move = c.first ? playMove(start, c.first) : undefined;
  if (!move || move.pos.isEnd()) return { ...base, why: 'worse, and the course has no move to play for the weaker side' };
  const b = await score(move.fen);
  if (!b) return undefined;
  const other = move.pos.turn;
  const again = courseGoal(b.cp, materialFor(move.pos, other), move.pos, other);
  if (typeof again === 'string') return { ...base, why: `worse, and still no goal after the course’s ${c.first}: ${again}` };
  return { ...base, drill: { fen: move.fen, side: other, ...again, cp: Math.round(b.cp), flipped: c.first! } };
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
    else drills.push({ id: cand.id, cand, score, fen: score.drill.fen, side: score.drill.side, goal: score.drill.goal, ...(score.drill.until ? { until: score.drill.until } : {}), ...(score.drill.flipped ? { flipped: score.drill.flipped } : {}) });
  }
  return { drills, left, todo, removed: gone };
}

/** A drill as the endgame drill plays it: a win converted or mated, or a draw held for `REP.hold` moves. */
export function asCourseEndgame(d: CourseDrill): Endgame {
  return { id: d.id, group: 'course', title: d.cand.title, fen: d.fen, goal: d.goal, ...(d.goal === 'win' ? { until: d.until ?? 'convert' } : { hold: REP.hold }), idea: '' };
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
  if (!s || s.v !== 1 || typeof s.key !== 'string' || typeof s.cp !== 'number') return undefined;
  const d = s.drill;
  if (d && (typeof d.fen !== 'string' || (d.goal !== 'win' && d.goal !== 'draw') || (d.side !== 'white' && d.side !== 'black') || sideOfFen(d.fen) !== d.side)) return undefined;
  return s as CourseScore;
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
