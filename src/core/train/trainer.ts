// The trainer (PLAN.md §5.6): walks a session plan's lines on the board, plays the opponent's
// moves and the own moves it doesn't ask at the pace, asks the due moves, teaches the new ones.
// A pure state machine: the app sends it commands with the time, and turns the effects it returns
// into board calls, `store.record` and timers. Nothing here reads a clock.
// - An own move is asked when its card is due today (the plan's asks) or is known and never
//   answered; taught when it was never answered (the plan's teaches, and any such move met after
//   a skipped line: a move never answered is never auto-played); else played for the user, with
//   no arrow (§5.110). A card is asked or taught once a session.
// - Right first time is Good; a wrong move or a hint is Again (§5.2). A first wrong move is taken
//   back and the move asked again; a second, or Hint, shows it with an arrow. A taught move
//   records `taught`, never a review. A known move answered wrong records Again and no `taught`:
//   the daily limit counts `taught` events, and known moves never use it (§5.3).
// - Auto-play (§5.17, lichessable's modes): an own move the plan doesn't need graded or taught is
//   played for the user or asked, by the `autoPlay` mode (`plays`). Asked, a move reviewed before
//   is graded the first time in the session, due or not (§5.106); a later ask isn't. Suspended
//   moves are always played. Where a line starts (`lineStart`) decides only where the board starts:
//   at the first move the plan needs (the moves before it skipped), at the chapter's start, or
//   where it branches from the line walked before it (§5.121), the mode deciding each move from
//   there (the owner's request, 2026-10-16, §5.113).
// - Difficult lines (§5.124): a plan's `gradeOnly` names the only cards graded (its due ones); every
//   other answer is practice.
// - Conflicting moves (D3): every own move of the position is accepted, and the one played is
//   graded on its own card if it is due. The line's own move is then asked in the same position,
//   on its own card, so a sibling can't stay due for ever. The trainer only lets the user move
//   where the line's own move is asked or taught, so the line followed is always the planned one,
//   except with `follow` (the Interactive view, §5.10): a move that starts another line of the
//   chapter from the board's moves is right, and the walk goes on along that line.
// - Alternative moves (§5.18, Chessable's): a move saved as an alternative for the position,
//   played where an own move is asked, is taken back and doesn't count (not a wrong move: no
//   Again, no arrow). After a wrong move, `saveAlt` saves the last one as an alternative and
//   takes it out of the ask's wrong moves, as if never played; `unsaveAlt` undoes that until the
//   next move. Saving is the owner's choice about the position, recorded even with grading off.
// - Misclicks (the owner's request, 2026-10-18): after a wrong move, `misclick` takes it out of the
//   ask's wrong moves as `saveAlt` does, saving nothing: a slip of the hand, not a miss. Only until
//   the move asked is played (its answer is recorded then).
// - Show sequence (`sequence`, Chessable's way with new moves): at a new move, the line's next
//   moves up to the n-th new own move (or a due one) are played for the user to watch, at twice
//   the pace; the user steps within them (`seek`) and, when ready, replays them from their start,
//   each new move asked with no arrow, as with `tryNew`.
// - Repetitions (the owner's request, 2026-10-08): a line on which a move was taught is walked
//   again, `repetitions` times in all, before the next line; the moves taught are asked on the
//   later passes (never graded: a card is graded once a session).
// - Mistakes retried (the owner's request, 2026-10-08): at the end of a walk, each own move asked on
//   it and not answered right first time is asked again, from the opponent's move before it, until
//   it is answered right `retryMistakes` times in a row; the mistakes take turns. Nothing is graded.
//   A move taught counts when a wrong move or a hint came before it was played (§5.110): learning
//   retries its mistakes as review does.
// - Missed again (`repeatMissed`: retry, drill and the pins): a move answered wrong has its line
//   walked again after the plan's lines, until every one is answered right.
// - Lines from the comments (`commentLines`, the owner's request, 2026-10-12; ./commentQuiz.ts says
//   which): on a review's walk (one that teaches nothing), the clickable lines written in comments
//   at the positions it passes are offered as they are reached (`view.comments`). One is quizzed
//   on request (`quizComments` with its key) from where it starts, the walk resuming where it was;
//   at the walk's end, after its mistakes, the line waits for "Next line" or "Quiz lines"
//   (`view.endQuiz`: the ones on by `comments`, all, the important ones or those picked, not yet
//   quizzed), which plays them one after another, back at the line's end after them. For each,
//   the board goes back to where it starts, the opponent's moves are played and the user finds
//   their own. Nothing is graded or recorded; the lines of a walk are offered once a session.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { isNormal, type NormalMove } from 'chessops/types';
import { positionKeyOf } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { repertoireCard, type CardId } from '../progress/cards.ts';
import type { Grade } from '../progress/events.ts';
import type { CardState } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';
import { alternativesAt } from './alternatives.ts';
import { grade, selfGrade } from './grade.ts';
import type { QuizLine } from './commentQuiz.ts';
import type { PlannedLine, SessionPlan } from './plan.ts';
import { knownCardsOf, statusOf } from './queue.ts';

/** The quickest pace: lichessable's floor, so a move can still be followed (§5.2). */
export const MIN_PACE_MS = 450;

/**
 * Which own moves the plan doesn't need are played for the user (§5.17, after lichessable's
 * auto-play and its "difficult moves only"):
 * - `off`: none; every one is asked (graded the first time if reviewed before, §5.106).
 * - `session`: moves answered right first time earlier in the session (lichessable's auto-play);
 *   a move answered wrong is asked again, ungraded.
 * - `due` (the default, the trainer as it was): moves answered earlier in the session, right or
 *   wrong, and moves reviewed and not due.
 * - `difficult`: as `due`, except that a difficult move (answered wrong in the session, or with
 *   lapses or a high FSRS difficulty) is asked whenever it is met.
 */
export type AutoPlay = 'off' | 'session' | 'due' | 'difficult';
export const AUTO_PLAYS: readonly AutoPlay[] = ['off', 'session', 'due', 'difficult'];

/**
 * Where a line starts (§5.17, §5.113):
 * - `first`: at its first move the plan grades or teaches (one move before, so the opponent's move
 *   is seen), or where the board already is when the line shares its moves;
 * - `start`: at the chapter's start, each own move played or asked as the auto-play mode says, on
 *   every pass. With `off`, every own move but a suspended one is asked.
 * - `branch` (§5.121): as `start`, but from the position after the last move the line shares with
 *   the line walked before it (as far as that walk went), in the same chapter; at the chapter's
 *   start when there is none. Never past a move still to be asked or taught. Later passes start
 *   there too.
 */
export type LineStart = 'first' | 'start' | 'branch';
export const LINE_STARTS: readonly LineStart[] = ['first', 'start', 'branch'];

/**
 * Which lines from the comments are quizzed at a review walk's end: every one met, the important
 * ones (first move `!` or `!!`), only those picked from the offer, or none (and none offered).
 */
export type CommentQuiz = 'all' | 'important' | 'pick' | 'off';
export const COMMENT_QUIZZES: readonly CommentQuiz[] = ['all', 'important', 'pick', 'off'];

/** A card is difficult (§5.17's `difficult` mode) after two lapses, or with FSRS difficulty from 7. */
export function isDifficult(state: CardState | undefined): boolean {
  if (!state || state.card.due === undefined) return false;
  return state.card.lapses >= 2 || state.card.difficulty >= 7;
}

export type Phase =
  | 'ready'
  /** The opponent's move comes after the pace delay. */
  | 'opponent'
  /** An own move not asked comes after the pace delay. */
  | 'auto'
  | 'ask'
  | 'teach'
  /** Show sequence: the sequence's moves are played for the user to watch. */
  | 'preview'
  /** Show sequence: all shown; the user steps within it, then replays it (`ready`). */
  | 'previewed'
  /** A first wrong move was taken back; the move is asked again. */
  | 'wrong'
  /** The move is shown (a second wrong move, or Hint); the user plays it. */
  | 'shown'
  /** A pause at a walk's end before its mistakes are asked again, or before the line's next pass. */
  | 'again'
  | 'lineDone'
  | 'sessionDone';

/** What the feedback line says (§5.7); the UI words it. */
export type Note =
  | { kind: 'yourMove' }
  | { kind: 'correct' }
  /** Right after a wrong move or a hint: graded Again. */
  | { kind: 'played' }
  | { kind: 'wrong' }
  | { kind: 'shown'; san: string }
  | { kind: 'newMove'; san: string }
  /** A new move asked before it is shown (`tryNew`, or a sequence replayed). */
  | { kind: 'newTry' }
  /** Show sequence: `count` new moves are shown, to be replayed. */
  | { kind: 'sequence'; count: number }
  /** A taught move played; `found` when it was found with no arrow, wrong move or hint. */
  | { kind: 'taught'; san: string; found?: boolean }
  /** A conflict move was accepted; the repertoire has another move here, asked now. */
  | { kind: 'alsoPlays' }
  /** An alternative saved for the position was played: taken back, for free (§5.18). */
  | { kind: 'alternative'; san: string }
  /** The last wrong move was saved as an alternative (§5.18). */
  | { kind: 'altSaved'; san: string }
  /** The last wrong move was a misclick: taken out of the ask's wrong moves. */
  | { kind: 'misclick'; san: string }
  | { kind: 'suspended'; san: string }
  /** At a walk's end: `count` moves missed on it are asked again, each until right `need` times in a row. */
  | { kind: 'retryMistakes'; count: number; need: number }
  /** A missed move asked again, right `streak` times in a row so far. */
  | { kind: 'retry'; streak: number; need: number }
  /** At a line's end: it is walked again, pass `pass` of `of` (`repetitions`). */
  | { kind: 'repeat'; pass: number; of: number }
  /** A move missed in retry, drill or the pins, asked again (`repeatMissed`). */
  | { kind: 'missedAgain' }
  /** A line from the comments on the board, `n` of `of`. */
  | { kind: 'aside'; n: number; of: number; important: boolean }
  /** In a line from the comments: not its move. */
  | { kind: 'asideWrong' }
  /** In a line from the comments: a move another of them, or the repertoire, plays here; this one plays another. */
  | { kind: 'asideAlso' };

export type TrainerRecord =
  | { k: 'review'; card: CardId; g: Grade; ms: number; w?: string[]; h?: 1 }
  | { k: 'taught'; card: CardId }
  | { k: 'suspend'; card: CardId }
  | { k: 'alt'; card: CardId; on: boolean };

export interface Summary {
  /** Lines walked (to their end or stopped in). */
  lines: number;
  /** Reviews recorded, and how many were Good. */
  reviews: number;
  good: number;
  taught: number;
  suspended: number;
}

export type TrainerEffect =
  /** A line starts: show the position after `path` (a prefix shared with the board, or []). */
  | { type: 'line'; line: Line; number: number; total: number; kind: PlannedLine['kind']; path: string[] }
  /** Play a move; the board's arrows go with it. `path` is the line's moves up to and including it. */
  | { type: 'play'; uci: string; san: string; path: string[]; by: 'opponent' | 'auto' | 'user' | 'preview' }
  /** The user's move is refused: show the position after `path` again. */
  | { type: 'takeback'; path: string[] }
  /** An arrow for a move; undefined clears it. */
  | { type: 'arrow'; uci?: string }
  | { type: 'note'; note: Note }
  | { type: 'record'; event: TrainerRecord }
  /**
   * A move asked was answered: right first time or not. Given with recording on or off; `repeat`
   * when it was asked again (a mistake retried, a line's later pass, a missed line walked again).
   */
  | { type: 'answer'; card: CardId; ok: boolean; repeat?: true }
  /** Send `{ type: 'tick', id }` after `ms`; a tick with another id is ignored. */
  | { type: 'wait'; ms: number; id: number }
  | { type: 'lineDone' }
  | { type: 'done'; summary: Summary };

export type TrainerCommand =
  | { type: 'start'; now: number }
  | { type: 'tick'; id: number; now: number }
  /** A move made on the board, in UCI (either castling spelling). */
  | { type: 'move'; uci: string; now: number }
  | { type: 'hint'; now: number }
  /** At a line's end held by `holdLineEnd`: the next line. */
  | { type: 'next'; now: number }
  /** Show and grade: play the move asked, without grading it yet. */
  | { type: 'show' }
  /** Show and grade: the move was known or not; the card is graded and the line goes on. */
  | { type: 'tell'; knew: boolean; now: number }
  /** Show sequence: the board at `ply` of the sequence shown (between its start and end). */
  | { type: 'seek'; ply: number; now: number }
  /** Show sequence: replay it from its start, its new moves asked. */
  | { type: 'ready'; now: number }
  /** "Always play this for me" on the move asked or taught. */
  | { type: 'suspend'; now: number }
  /** After a wrong move: save it as an alternative for the position (§5.18); and its undo. */
  | { type: 'saveAlt'; now: number }
  | { type: 'unsaveAlt'; now: number }
  /** After a wrong move: it was a misclick, as if never played. */
  | { type: 'misclick'; now: number }
  | { type: 'skipLine'; now: number }
  /** A line from the comments offered: in the walk's end quiz or not. */
  | { type: 'pickComment'; key: string; on: boolean }
  /**
   * A line from the comments met, by `key`, quizzed now from where it starts, the walk resuming
   * after it; without a key, at the line's end, the lines of `view.endQuiz`.
   */
  | { type: 'quizComments'; key?: string; now: number }
  /** The line from the comments on the board: on to the next, or back to the line's end. */
  | { type: 'skipComment'; now: number }
  | { type: 'stop'; now: number };

export interface TrainerSetup {
  index: RepertoireIndex;
  plan: SessionPlan;
  states: ReadonlyMap<string, CardState>;
  /** A line's start position; a line without one is skipped. */
  startOf(line: Line): Position | undefined;
  /** Milliseconds per move played for the user; never below MIN_PACE_MS. */
  paceMs: number;
  /** False: nothing is graded or taught on record (Interactive view, retry, drill). */
  record?: boolean;
  /** Ask every own move not answered yet in the session, due or not (Interactive view). */
  askAll?: boolean;
  /** Ask only the plan's asks and play everything else, new or not (retry and drill, §5.8). */
  askOnly?: boolean;
  /** Show and grade (§5.9): the user never moves; `show` plays the move, `tell` grades it. */
  selfGrade?: boolean;
  /**
   * Interactive view (§5.10): an own move that another of the index's lines plays after the
   * board's moves is right, and the walk follows that line to its end.
   */
  follow?: boolean;
  /** Which own moves the plan doesn't need are played for the user (§5.17); default `due`. */
  autoPlay?: AutoPlay;
  /** New moves are asked before they are shown (§5.17): the arrow comes after a wrong move or Hint. */
  tryNew?: boolean;
  /** Moves saved as alternatives (§5.18), as repertoire card IDs; the trainer keeps its own copy. */
  alternatives?: Iterable<CardId>;
  /** Show sequence: a new move starts a sequence of this many new own moves, shown then replayed. */
  sequence?: number;
  /** Where a line starts (§5.17). Unset: where the board already is when the line shares its moves, else at its start. */
  lineStart?: LineStart;
  /** At a line's end, wait for `next` rather than going on (§5.17). */
  holdLineEnd?: boolean;
  /** The pause at a line's end before the next, in paces (default 2). */
  lineEndPaces?: number;
  /** How many times a line on which a move was taught is walked (default 1); not in show and grade. */
  repetitions?: number;
  /** At a walk's end, each move missed on it is asked until right this many times in a row (default 0: not). */
  retryMistakes?: number;
  /** Retry, drill, the pins: a move answered wrong has its line walked again at the end, until answered right. */
  repeatMissed?: boolean;
  /** The lines from the comments along a line that can be quizzed (./commentQuiz.ts); none without. */
  commentLines?(line: Line): readonly QuizLine[];
  /** Which of them are quizzed (default `off`). */
  comments?: CommentQuiz;
}

/** The options a running session can change (the training settings, §5.17). */
export type TrainerOptions = Pick<TrainerSetup, 'autoPlay' | 'tryNew' | 'sequence' | 'lineStart' | 'holdLineEnd' | 'lineEndPaces' | 'repetitions' | 'retryMistakes' | 'comments'>;

interface Ply {
  san: string;
  uci: string;
  /** Set for an own move. */
  card?: CardId;
  /** The position before the move. */
  before: Position;
}

interface Pending {
  mode: 'ask' | 'teach';
  card: CardId;
  uci: string;
  san: string;
  wrong: string[];
  hint: boolean;
  shown: boolean;
  /** When the move was asked, for the review's `ms`. */
  since: number;
  /** Asked after a conflict move was accepted: the conflict move no longer counts as right. */
  also: boolean;
  /** The last wrong move, while it can be saved as an alternative (§5.18). */
  lastWrong?: { uci: string; san: string };
  /** The move just saved as an alternative, while it can be undone. */
  saved?: { uci: string; san: string; shown: boolean };
}

export interface TrainerView {
  phase: Phase;
  /** The current planned line, its number (1-based) and the plan's length. */
  line?: PlannedLine;
  number: number;
  total: number;
  /** The moves shown on the board, and the position they reach. */
  path: string[];
  position?: Position;
  /** The move asked or taught, once shown (teach, shown). */
  shown?: { uci: string; san: string };
  /** At a line's end: the line that comes next, if any. */
  upcoming?: PlannedLine;
  /** After a wrong move: the move that "Save as alternative" would save (§5.18). */
  wrongMove?: { uci: string; san: string };
  /** An alternative just saved, while "Undo" can take it back. */
  savedAlt?: { uci: string; san: string };
  /** Show sequence, while shown: the plies it spans (the board's path between `from` and `to`). */
  sequence?: { from: number; to: number };
  /** A line walked again (`repetitions`): this pass, from 2, of how many. */
  pass?: { n: number; of: number };
  /** Mistakes retried at a walk's end: how many are left, and the one asked's streak of `need`. */
  retry?: { left: number; streak: number; need: number };
  /** The lines from the comments met on this walk so far (none before it reaches them): in the end quiz or not, and quizzed already. */
  comments?: { line: QuizLine; on: boolean; done: boolean }[];
  /** At a line's end: the lines from the comments "Quiz lines" plays; the line waits for it or "Next line". */
  endQuiz?: number;
  /** A line from the comments can be quizzed now (`quizComments` with its key). */
  canQuiz?: true;
  /** A line from the comments on the board: `n` of `of`, with `ply` of its moves played. */
  aside?: { line: QuizLine; n: number; of: number; ply: number };
  /** The lines from the comments quizzed in the session, and their own moves asked and found first time. */
  asides?: { lines: number; moves: number; right: number };
  summary: Summary;
}

/** A move missed on a walk, asked again at its end until right `need` times in a row. */
interface Retry {
  ply: number;
  card: CardId;
  streak: number;
}

type Kind = 'ask' | 'teach' | 'auto';

/** Where a walk was when a line from the comments took the board: its ply, and the move asked, with the time it had taken. */
interface Resume {
  ply: number;
  phase: Phase;
  pending?: Pending;
  elapsed: number;
}

/** The lines from the comments quizzed, the one on the board, and where the walk was. */
interface Aside {
  items: QuizLine[];
  at: number;
  back: Resume;
  /** Moves of the line on the board played so far. */
  ply: number;
  wrong: string[];
  hint: boolean;
  shown: boolean;
}

export class Trainer {
  private readonly setup: TrainerSetup;
  private options: TrainerOptions;
  private pace: number;
  private readonly record: boolean;
  /** The plan's lines; with `follow`, the line walked is replaced by the one the user chose. */
  private readonly lines: PlannedLine[];
  private readonly toAsk = new Set<CardId>();
  /** The plan's `gradeOnly` (§5.124): when set, no other card is graded. */
  private readonly gradeOnly: ReadonlySet<CardId> | undefined;
  private readonly toTeach = new Set<CardId>();
  private readonly known: Set<CardId>;
  /** Cards asked, taught or suspended in this session. */
  private readonly answered = new Set<CardId>();
  private readonly suspendedNow = new Set<CardId>();
  /** Cards whose latest answer this session was right first time, and cards missed (§5.17's modes). */
  private readonly right = new Set<CardId>();
  private readonly missedNow = new Set<CardId>();
  private phase: Phase = 'ready';
  private at = -1;
  private plies: Ply[] = [];
  /** Positions after each ply count: positions[i] is the board after i moves. */
  private positions: Position[] = [];
  private end = 0;
  private ply = 0;
  /** Where the line's first move the plan needs is: the moves before it are its prefix. */
  private prefix = 0;
  /** The ply the line's walk started at: its later passes start there too with `branch`. */
  private lineFrom = 0;
  /** At a line's end: the next line found, and its moves. */
  private upcoming: { at: number; plies: Ply[]; positions: Position[] } | undefined;
  private pending: Pending | undefined;
  /** Show sequence: the plies shown (`from` to `to`), and whether it is being replayed. */
  private seq: { from: number; to: number; replay: boolean } | undefined;
  /** Show and grade: a move played and waiting for its grade. */
  private waiting: { card: CardId; mode: 'ask' | 'teach'; san: string; since: number; failed: boolean; graded: boolean } | undefined;
  /** Show and grade, on from the setup and switched during the session (§5.16). */
  private selfGrading: boolean;
  private waitId = 0;
  private walked = 0;
  private readonly counts = { reviews: 0, good: 0, taught: 0, suspended: 0 };
  private readonly alternatives: Set<CardId>;
  /** The line's walk: its pass (`repetitions`), the moves taught on its first, and the moves missed on this one by ply. */
  private pass = 1;
  private taughtOnLine: CardId[] = [];
  private readonly missedOnLine = new Map<number, CardId>();
  /** Moves asked whatever else says: a later pass's moves taught, or the mistake retried. */
  private askAgain = new Set<CardId>();
  /** The mistakes retried at a walk's end, and which one is asked. */
  private retrying: { items: Retry[]; at: number } | undefined;
  /** What the pause at a walk's end (`again`) leads to. */
  private afterPause: 'retry' | 'pass' | 'aside' = 'retry';
  /** The lines from the comments this walk can meet, and how far it has gone (the first pass's furthest ply). */
  private quiz: QuizLine[] = [];
  private reached = 0;
  /** Lines from the comments offered on the session's walks before this one, and quizzed in it (by key); the user's picks. */
  private readonly offered = new Set<string>();
  private readonly quizzed = new Set<string>();
  private readonly picks = new Map<string, boolean>();
  private aside: Aside | undefined;
  private readonly asideCounts = { lines: 0, moves: 0, right: 0 };
  /** Planned lines added for moves missed in retry, drill or the pins (`repeatMissed`). */
  private readonly redo = new Set<PlannedLine>();

  constructor(setup: TrainerSetup) {
    this.setup = setup;
    const { autoPlay, tryNew, sequence, lineStart, holdLineEnd, lineEndPaces, repetitions, retryMistakes, comments } = setup;
    this.options = { autoPlay, tryNew, sequence, lineStart, holdLineEnd, lineEndPaces, repetitions, retryMistakes, comments };
    this.pace = Math.max(MIN_PACE_MS, setup.paceMs);
    this.record = setup.record ?? true;
    this.lines = [...setup.plan.lines];
    if (setup.plan.gradeOnly) this.gradeOnly = new Set(setup.plan.gradeOnly);
    for (const l of setup.plan.lines) {
      for (const c of l.ask) this.toAsk.add(c);
      for (const c of l.teach) this.toTeach.add(c);
    }
    this.known = knownCardsOf(setup.index);
    this.selfGrading = setup.selfGrade ?? false;
    this.alternatives = new Set(setup.alternatives ?? []);
  }

  /** New options, from the next move met (§5.17's settings changed during a session). */
  configure(options: TrainerOptions): void {
    this.options = { ...this.options, ...options };
  }

  /** Show and grade on or off from the next move asked (§5.16). */
  setSelfGrade(on: boolean): void {
    this.selfGrading = on;
  }

  /** A line from the comments is on the board: show and grade waits for it to end. */
  get inAside(): boolean {
    return this.aside !== undefined && this.aside.at >= 0;
  }

  /** Show and grade: a move is shown and waits for its verdict (`tell`). */
  get awaitingGrade(): boolean {
    return this.waiting !== undefined;
  }

  /**
   * The alternatives saved (§5.18) where the user's move is asked or was just shown, by UCI and
   * SAN in UCI order; undefined when no move is asked or shown (show and grade's Space, §5.114).
   */
  get alternativesHere(): { uci: string; san: string }[] | undefined {
    if (this.inAside) return undefined;
    const at = this.pending ? this.ply : this.waiting ? this.ply - 1 : -1;
    const before = this.plies[at]?.before;
    if (!before) return undefined;
    const out: { uci: string; san: string }[] = [];
    for (const uci of alternativesAt(this.alternatives, positionKeyOf(before))) {
      const move = parseUciMove(before, uci);
      if (move) out.push({ uci, san: makeSan(before, move) });
    }
    return out;
  }

  /** A new pace, from the next move played for the user. */
  setPace(ms: number): void {
    this.pace = Math.max(MIN_PACE_MS, ms);
  }

  get view(): TrainerView {
    const line = this.lines[this.at];
    const a = this.aside;
    const aside = a && a.at >= 0 ? a.items[a.at] : undefined;
    const v: TrainerView = {
      phase: this.phase,
      number: this.at + 1,
      total: this.lines.length,
      // A line from the comments starts on the line's board: its moves are the aside's.
      path: line ? line.line.path.slice(0, aside ? aside.ply : this.ply) : [],
      summary: this.summary(),
    };
    if (line) v.line = line;
    const position = aside ? aside.positions[a!.ply] : this.positions[this.ply];
    if (position) v.position = position;
    if (aside) v.aside = { line: aside, n: a!.at + 1, of: a!.items.length, ply: a!.ply };
    const met = this.met();
    if (met.length) v.comments = met.map((q) => ({ line: q, on: this.quizzes(q), done: this.quizzed.has(q.key) }));
    const end = this.phase === 'lineDone' ? this.endQuiz().length : 0;
    if (end > 0) v.endQuiz = end;
    if (met.length && this.quizNow()) v.canQuiz = true;
    if (this.asideCounts.lines > 0) v.asides = { ...this.asideCounts };
    if (this.phase === 'lineDone' && this.upcoming) v.upcoming = this.lines[this.upcoming.at]!;
    if (this.seq && !this.seq.replay) v.sequence = { from: this.seq.from, to: this.seq.to };
    const p = this.pending;
    if (p?.lastWrong) v.wrongMove = { ...p.lastWrong };
    if (p?.saved) v.savedAlt = { uci: p.saved.uci, san: p.saved.san };
    if (p?.shown) v.shown = { uci: p.uci, san: p.san };
    else if (this.waiting) v.shown = { uci: '', san: this.waiting.san };
    if (this.pass > 1) v.pass = { n: this.pass, of: Math.max(this.pass, this.options.repetitions ?? 1) };
    const r = this.retrying;
    if (r) {
      const need = this.need();
      v.retry = { left: r.items.filter((i) => i.streak < need).length, streak: r.items[r.at]?.streak ?? 0, need };
    }
    return v;
  }

  send(command: TrainerCommand): TrainerEffect[] {
    const out: TrainerEffect[] = [];
    if (this.phase === 'sessionDone') return out;
    switch (command.type) {
      case 'start':
        if (this.phase === 'ready') this.nextLine(command.now, out);
        break;
      case 'tick':
        if (command.id === this.waitId) this.tick(command.now, out);
        break;
      case 'move':
        this.move(command.uci, command.now, out);
        break;
      case 'hint':
        this.hint(out);
        break;
      case 'next':
        if (this.phase !== 'lineDone') break;
        this.waitId++;
        this.nextLine(command.now, out);
        break;
      case 'show':
        this.showMove(out);
        break;
      case 'seek':
        this.seek(command.ply, out);
        break;
      case 'ready':
        this.replay(command.now, out);
        break;
      case 'tell':
        this.tell(command.knew, command.now, out);
        break;
      case 'suspend':
        this.suspend(command.now, out);
        break;
      case 'saveAlt':
        this.saveAlt(out);
        break;
      case 'unsaveAlt':
        this.unsaveAlt(out);
        break;
      case 'misclick':
        this.misclick(out);
        break;
      case 'skipLine':
        if (this.phase === 'ready') break;
        this.waitId++;
        this.pending = undefined;
        this.waiting = undefined;
        this.seq = undefined;
        out.push({ type: 'arrow' });
        this.nextLine(command.now, out);
        break;
      case 'pickComment':
        this.picks.set(command.key, command.on);
        break;
      case 'quizComments':
        this.quizComments(command.key, command.now, out);
        break;
      case 'skipComment':
        if (!this.inAside) break;
        this.waitId++;
        this.nextAside(command.now, out);
        break;
      case 'stop':
        this.waitId++;
        this.pending = undefined;
        this.waiting = undefined;
        this.aside = undefined;
        this.finish(out);
        break;
    }
    return out;
  }

  private summary(): Summary {
    return { lines: this.walked, ...this.counts };
  }

  private state(card: CardId) {
    return this.setup.states.get(card);
  }

  private suspended(card: CardId) {
    return this.suspendedNow.has(card) || this.state(card)?.suspended === true;
  }

  /** What the plan needs of a card: graded (`ask`) or taught, once a session; else nothing. */
  private needs(card: CardId): Kind | undefined {
    if (this.answered.has(card) || this.suspended(card)) return undefined;
    const fresh = statusOf(this.state(card)) === 'fresh';
    if (this.toAsk.has(card) || this.setup.askAll || (fresh && this.known.has(card))) return 'ask';
    // A move never answered is never played for the user (lichessable's rule).
    if (this.toTeach.has(card) || fresh) return 'teach';
    return undefined;
  }

  /** Whether an own move the plan doesn't need is played for the user, by the auto-play mode. */
  private plays(card: CardId): boolean {
    const mode = this.options.autoPlay ?? 'due';
    const hard = mode === 'difficult' && (this.missedNow.has(card) || isDifficult(this.state(card)));
    if (this.answered.has(card)) {
      if (mode === 'off') return false;
      if (mode === 'session') return this.right.has(card);
      return !hard;
    }
    // A move not answered yet: played when it isn't due (a line picked too, since §5.113).
    if (mode === 'off' || mode === 'session') return false;
    return !hard;
  }

  /** How an own move is met: asked, taught or played; `prefix` for a move before the line's first need. */
  private kindOf(card: CardId, prefix = false): Kind {
    if (this.askAgain.has(card) && !this.suspended(card)) return 'ask';
    if (this.setup.askOnly) return !this.answered.has(card) && this.toAsk.has(card) ? 'ask' : 'auto';
    if (this.suspended(card)) return 'auto';
    const need = this.needs(card);
    if (need) return need;
    // Before the first move needed, at its first new or due move: the opponent's move before it.
    if (prefix && this.options.lineStart === 'first') return 'auto';
    return this.plays(card) ? 'auto' : 'ask';
  }

  private wait(ms: number, out: TrainerEffect[]) {
    out.push({ type: 'wait', ms, id: ++this.waitId });
  }

  private finish(out: TrainerEffect[]) {
    this.phase = 'sessionDone';
    out.push({ type: 'done', summary: this.summary() });
  }

  /** Whether a planned line still has something to ask or teach on its walked part. */
  private needed(planned: PlannedLine, plies: readonly Ply[]): boolean {
    if (planned.ask.length + planned.teach.length === 0 || this.redo.has(planned)) return true;
    return plies.some((p, i) => i < planned.end && p.card !== undefined && (this.setup.askOnly ? this.kindOf(p.card) !== 'auto' : this.needs(p.card) !== undefined));
  }

  /** The next planned line after the current one with something to walk, and its moves. */
  private findNext(): { at: number; plies: Ply[]; positions: Position[] } | undefined {
    for (let at = this.at + 1; at < this.lines.length; at++) {
      const built = this.build(this.lines[at]!);
      if (built && this.needed(this.lines[at]!, built.plies)) return { at, ...built };
    }
    return undefined;
  }

  /**
   * The ply of the line's first move the plan needs, or else of its first own move asked; its end if
   * none. From the start: of its first own move asked or taught.
   */
  private prefixEnd(plies: readonly Ply[], end: number): number {
    if (this.options.lineStart === 'first') for (let i = 0; i < end; i++) if (plies[i]!.card && this.needs(plies[i]!.card!)) return i;
    for (let i = 0; i < end; i++) if (plies[i]!.card && this.kindOf(plies[i]!.card!) !== 'auto') return i;
    return end;
  }

  private nextLine(now: number, out: TrainerEffect[]) {
    const found = this.upcoming ?? this.findNext();
    this.upcoming = undefined;
    this.seq = undefined;
    this.pass = 1;
    this.taughtOnLine = [];
    this.missedOnLine.clear();
    this.retrying = undefined;
    this.askAgain = new Set();
    this.aside = undefined;
    // The lines from the comments met on the walk left are offered once a session.
    for (const q of this.met()) this.offered.add(q.key);
    this.quiz = [];
    // The last line's end is the session's: the board stays on it (§5.17).
    if (!found) return this.finish(out);
    const lines = this.lines;
    const board = this.at >= 0 ? lines[this.at] : undefined;
    const boardPath = board ? board.line.path.slice(0, this.ply) : [];
    // The moves the walk before went through, to where it went furthest (§5.121).
    const walkedPath = board ? board.line.path.slice(0, this.reached) : [];
    this.at = found.at;
    const planned = lines[this.at]!;
    // A missed move's line walked again asks that move, though it was answered.
    if (this.redo.has(planned)) this.askAgain = new Set(planned.ask);
    this.plies = found.plies;
    this.positions = found.positions;
    this.end = Math.min(planned.end, found.plies.length);
    const start = this.options.lineStart;
    this.prefix = start === undefined ? 0 : this.prefixEnd(this.plies, this.end);
    // Where the board already is when the line shares its moves, up to its first ask or teach: the
    // positions follow on from each other (§5.4).
    let shared = 0;
    if (board && board.line.sid === planned.line.sid && board.line.cid === planned.line.cid) {
      while (shared < boardPath.length && shared < this.end && boardPath[shared] === planned.line.path[shared]) {
        const card = this.plies[shared]!.card;
        if (card && this.kindOf(card, shared < this.prefix) !== 'auto') break;
        shared++;
      }
    }
    // §5.17: at the first move needed (one move before it, for the opponent's), from the start, or
    // where it branches (§5.121). A planned start (drill's lead-in) comes first when further on.
    let ply = start === undefined ? shared : start === 'first' ? Math.max(Math.min(shared, this.prefix), this.prefix - 1, 0) : start === 'branch' ? this.branchPoint(board, walkedPath, planned) : 0;
    ply = Math.max(ply, Math.min(planned.from ?? 0, this.end));
    this.ply = ply;
    this.lineFrom = ply;
    this.reached = ply;
    this.quiz = this.quizOf(planned);
    if (!this.redo.has(planned)) this.walked++;
    out.push({ type: 'line', line: planned.line, number: this.at + 1, total: lines.length, kind: planned.kind, path: planned.line.path.slice(0, this.ply) });
    this.advance(now, out);
  }

  /**
   * Where a line starts with `branch` (§5.121): after the last move it shares with the walk before
   * it in the same chapter, but never past a move still to be asked or taught (one move before it
   * then, for the opponent's); else at its start.
   */
  private branchPoint(board: PlannedLine | undefined, walked: readonly string[], planned: PlannedLine): number {
    if (!board || board.line.sid !== planned.line.sid || board.line.cid !== planned.line.cid) return 0;
    let split = 0;
    while (split < walked.length && split < this.end && walked[split] === planned.line.path[split]) split++;
    for (let i = 0; i < split; i++) {
      const card = this.plies[i]!.card;
      if (card && (this.askAgain.has(card) || this.needs(card))) return Math.max(0, i - 1);
    }
    return split < this.end ? split : 0;
  }

  /** The line's moves as positions and UCI, as far as they are legal. */
  private build(planned: PlannedLine): { plies: Ply[]; positions: Position[] } | undefined {
    const start = this.setup.startOf(planned.line);
    if (!start) return undefined;
    const cardAt = new Map<number, CardId>();
    planned.line.plies.forEach((p, i) => cardAt.set(p, planned.line.cards[i]!));
    const plies: Ply[] = [];
    const positions: Position[] = [start.clone()];
    const pos = start.clone();
    for (const [i, san] of planned.line.path.entries()) {
      const move = parseSan(pos, san);
      if (!move || !isNormal(move)) break;
      const ply: Ply = { san, uci: standardUci(pos, move), before: pos.clone() };
      const card = cardAt.get(i);
      if (card) ply.card = card;
      plies.push(ply);
      pos.play(move);
      positions.push(pos.clone());
    }
    return { plies, positions };
  }

  private path(upTo = this.ply) {
    return this.lines[this.at]!.line.path.slice(0, upTo);
  }

  /**
   * The lines from the comments a walk can meet: on a review's walk (nothing on it taught), those
   * starting from where the user is first asked (the opponent's move before it) to the walk's end,
   * not offered earlier in the session.
   */
  private quizOf(planned: PlannedLine): QuizLine[] {
    const lines = this.setup.commentLines;
    if (!lines || (this.options.comments ?? 'off') === 'off' || this.redo.has(planned)) return [];
    if (this.plies.some((p, i) => i < this.end && p.card !== undefined && this.needs(p.card) === 'teach')) return [];
    const from = Math.max(this.ply, this.prefix - 1);
    return lines(planned.line).filter((q) => q.ply >= from && q.ply <= this.end && !this.offered.has(q.key));
  }

  /** The lines from the comments the walk has met. */
  private met(): QuizLine[] {
    return this.quiz.filter((q) => q.ply <= this.reached);
  }

  /** The lines "Quiz lines" plays at the line's end: those on, not quizzed yet. */
  private endQuiz(): QuizLine[] {
    return this.met().filter((q) => this.quizzes(q) && !this.quizzed.has(q.key));
  }

  /** Whether a line from the comments can take the board now: not in one, a retry, a sequence or show and grade. */
  private quizNow(): boolean {
    if (this.inAside || this.retrying || this.seq || this.waiting || this.selfGrading) return false;
    return ['ask', 'wrong', 'shown', 'opponent', 'auto', 'lineDone'].includes(this.phase);
  }

  /** Whether a line from the comments is in the end quiz: the user's pick, else the setting's. */
  private quizzes(q: QuizLine): boolean {
    const picked = this.picks.get(q.key);
    if (picked !== undefined) return picked;
    const mode = this.options.comments ?? 'off';
    return mode === 'all' || (mode === 'important' && q.important);
  }

  /** From the board's position: the next move, an ask, or the line's end. */
  private advance(now: number, out: TrainerEffect[]) {
    this.pending = undefined;
    this.waiting = undefined;
    // The furthest the walk has gone (its first pass): the lines from the comments met.
    if (!this.retrying && this.pass === 1) this.reached = Math.max(this.reached, this.ply);
    if (this.ply >= this.end) {
      // Its mistakes asked again, then the line walked again, before the line is done.
      if (this.walkEnd(out)) return;
      return this.lineEnd(out);
    }
    const p = this.plies[this.ply]!;
    if (!p.card) {
      this.phase = 'opponent';
      this.wait(this.pace, out);
      return;
    }
    const kind = this.kindOf(p.card, this.ply < this.prefix);
    if (kind === 'auto') {
      this.phase = 'auto';
      // No arrow before it, even in its learning step: auto-play shows none (§5.110).
      this.wait(this.pace, out);
      return;
    }
    if (this.seq && this.ply >= this.seq.to) this.seq = undefined;
    // Show sequence: a new move met outside a sequence replayed starts one.
    if (kind === 'teach' && !this.seq && (this.options.sequence ?? 0) > 0 && !this.selfGrading) return this.startSequence(out);
    // With `tryNew`, or in a sequence replayed, a new move is asked like a due one, and shown only
    // after a wrong move or Hint.
    const shown = kind === 'teach' && !this.options.tryNew && !this.seq;
    this.pending = { mode: kind, card: p.card, uci: p.uci, san: p.san, wrong: [], hint: false, shown, since: now, also: false };
    this.phase = shown ? 'teach' : 'ask';
    if (shown) {
      out.push({ type: 'arrow', uci: p.uci });
      out.push({ type: 'note', note: { kind: 'newMove', san: p.san } });
    } else out.push({ type: 'note', note: kind === 'teach' ? { kind: 'newTry' } : this.askNote() });
  }

  /**
   * The line done: the next comes after a pause, or waits for "Next line" (`holdLineEnd`). Lines
   * from the comments to quiz always wait, for "Next line" or "Quiz lines"; the last line's end is
   * the session's unless they do.
   */
  private lineEnd(out: TrainerEffect[]) {
    this.askAgain = new Set();
    this.phase = 'lineDone';
    out.push({ type: 'lineDone' });
    this.upcoming = this.findNext();
    const quiz = this.endQuiz().length > 0;
    if (!this.upcoming && !quiz) return this.finish(out);
    if (!this.options.holdLineEnd && !quiz) this.wait(this.pace * (this.options.lineEndPaces ?? 2), out);
  }

  /** What the feedback line says at an ask: a retry's streak, a missed line again, or nothing. */
  private askNote(): Note {
    const r = this.retrying;
    if (r) return { kind: 'retry', streak: r.items[r.at]!.streak, need: this.need() };
    if (this.redo.has(this.lines[this.at]!)) return { kind: 'missedAgain' };
    return { kind: 'yourMove' };
  }

  /** Right answers in a row a mistake retried needs. */
  private need(): number {
    return Math.max(0, Math.round(this.options.retryMistakes ?? 0));
  }

  /** Whether the move asked is asked again: a mistake retried, a later pass, a missed line again. */
  private repeating(): boolean {
    return this.retrying !== undefined || this.pass > 1 || this.redo.has(this.lines[this.at]!);
  }

  /**
   * At a walk's end: a pause before its mistakes are asked again (each until right `need` times in
   * a row), or before the line's next pass when a move was taught on it. False when the line is done.
   */
  private walkEnd(out: TrainerEffect[]): boolean {
    if (this.selfGrading) return false;
    const need = this.need();
    if (need > 0 && this.missedOnLine.size > 0) {
      const items = [...this.missedOnLine].sort((a, b) => a[0] - b[0]).map(([ply, card]): Retry => ({ ply, card, streak: 0 }));
      this.missedOnLine.clear();
      this.retrying = { items, at: -1 };
      out.push({ type: 'note', note: { kind: 'retryMistakes', count: items.length, need } });
      return this.pause('retry', out);
    }
    const passes = Math.max(1, Math.round(this.options.repetitions ?? 1));
    if (this.pass < passes && this.taughtOnLine.length > 0) {
      this.pass++;
      out.push({ type: 'note', note: { kind: 'repeat', pass: this.pass, of: passes } });
      return this.pause('pass', out);
    }
    return false;
  }

  private pause(then: 'retry' | 'pass' | 'aside', out: TrainerEffect[]): true {
    this.phase = 'again';
    this.afterPause = then;
    out.push({ type: 'arrow' });
    this.wait(this.pace * 2, out);
    return true;
  }

  /** The next mistake to ask again (taking turns), from the opponent's move before it; else back to the line's end. */
  private nextRetry(now: number, out: TrainerEffect[]) {
    const r = this.retrying!;
    const need = this.need();
    out.push({ type: 'arrow' });
    if (!r.items.some((i) => i.streak < need)) {
      this.retrying = undefined;
      this.askAgain = new Set(this.pass > 1 ? this.taughtOnLine : []);
      this.ply = this.end;
      out.push({ type: 'takeback', path: this.path() });
      return this.advance(now, out);
    }
    let at = r.at;
    do at = (at + 1) % r.items.length;
    while (r.items[at]!.streak >= need);
    r.at = at;
    const item = r.items[at]!;
    this.askAgain = new Set([item.card]);
    this.seq = undefined;
    this.ply = Math.max(0, item.ply - 1);
    out.push({ type: 'takeback', path: this.path() });
    this.advance(now, out);
  }

  /**
   * The line's next pass, its moves taught asked: from where a line starts (§5.17), the first move
   * taught taking the place of the first move needed, so the moves before it go as they went; with
   * `branch`, from where its first pass started (§5.121).
   */
  private nextPass(now: number, out: TrainerEffect[]) {
    this.askAgain = new Set(this.taughtOnLine);
    this.missedOnLine.clear();
    this.seq = undefined;
    const start = this.options.lineStart;
    const taught = this.plies.findIndex((p, i) => i < this.end && p.card !== undefined && this.askAgain.has(p.card));
    const first = taught >= 0 ? taught : this.prefixEnd(this.plies, this.end);
    this.prefix = start === undefined ? 0 : first;
    this.ply = start === 'start' ? 0 : start === 'branch' ? this.lineFrom : Math.max(0, first - 1);
    out.push({ type: 'arrow' });
    out.push({ type: 'takeback', path: this.path() });
    this.advance(now, out);
  }

  /** After a move asked is answered (`ok`: right first time): the line goes on, or the next mistake. */
  private afterAnswer(card: CardId, ok: boolean, now: number, out: TrainerEffect[]) {
    const r = this.retrying;
    if (r) {
      const item = r.items[r.at]!;
      item.streak = ok ? item.streak + 1 : 0;
      this.pending = undefined;
      this.waiting = undefined;
      // A look at the move played, then the next.
      this.pause('retry', out);
      return;
    }
    if (!ok) {
      if (this.setup.repeatMissed) {
        // Asked again after the plan's lines, as often as it is missed.
        const again: PlannedLine = { ...this.lines[this.at]!, ask: [card] };
        this.redo.add(again);
        this.lines.push(again);
      } else this.missedOnLine.set(this.ply - 1, card);
    }
    this.advance(now, out);
  }

  /**
   * Show sequence: from the new move asked, the line's moves up to its n-th new own move, stopping
   * before an own move asked (a due move would be given away) or at the line's end; played to watch.
   */
  private startSequence(out: TrainerEffect[]) {
    const n = this.options.sequence!;
    let to = this.ply;
    let count = 0;
    for (let i = this.ply; i < this.end && count < n; i++) {
      const card = this.plies[i]!.card;
      if (card) {
        const kind = this.kindOf(card, i < this.prefix);
        if (kind === 'ask') break;
        if (kind === 'teach') count++;
      }
      to = i + 1;
    }
    this.seq = { from: this.ply, to, replay: false };
    this.phase = 'preview';
    out.push({ type: 'arrow' });
    out.push({ type: 'note', note: { kind: 'sequence', count } });
    this.wait(this.pace * 2, out);
  }

  /** Show sequence: the board anywhere in the sequence shown; the playing stops there. */
  private seek(ply: number, out: TrainerEffect[]) {
    const q = this.seq;
    if (!q || q.replay || (this.phase !== 'preview' && this.phase !== 'previewed')) return;
    this.waitId++;
    this.ply = Math.max(q.from, Math.min(q.to, Math.round(ply)));
    this.phase = 'previewed';
    out.push({ type: 'takeback', path: this.path() });
  }

  /** Show sequence: back to its start, to be played by the user. */
  private replay(now: number, out: TrainerEffect[]) {
    const q = this.seq;
    if (!q || q.replay || (this.phase !== 'preview' && this.phase !== 'previewed')) return;
    this.waitId++;
    q.replay = true;
    this.ply = q.from;
    out.push({ type: 'takeback', path: this.path() });
    this.advance(now, out);
  }

  /** One line from the comments met (`key`), or the end quiz's, taking the board from where the walk is. */
  private quizComments(key: string | undefined, now: number, out: TrainerEffect[]) {
    if (!this.quizNow()) return;
    const items = key === undefined ? (this.phase === 'lineDone' ? this.endQuiz() : []) : this.met().filter((q) => q.key === key);
    if (items.length === 0) return;
    const p = this.pending;
    const back: Resume = { ply: this.ply, phase: this.phase, elapsed: p ? now - p.since : 0 };
    if (p) back.pending = p;
    this.waitId++;
    this.pending = undefined;
    this.aside = { items, at: -1, back, ply: 0, wrong: [], hint: false, shown: false };
    this.nextAside(now, out);
  }

  /** The next line from the comments, from where it starts on the line; after the last, back to where the walk was. */
  private nextAside(now: number, out: TrainerEffect[]) {
    const a = this.aside!;
    a.at++;
    out.push({ type: 'arrow' });
    // Show and grade turned on meanwhile: the lines are played on the board, so they are left.
    const q = this.selfGrading ? undefined : a.items[a.at];
    if (!q) return this.resume(a.back, now, out);
    a.ply = 0;
    this.quizzed.add(q.key);
    this.asideCounts.lines++;
    out.push({ type: 'takeback', path: this.path(q.ply) });
    out.push({ type: 'note', note: { kind: 'aside', n: a.at + 1, of: a.items.length, important: q.important } });
    this.asideStep(now, out);
  }

  /** After the lines from the comments: the walk where it was, the move asked waiting as it was; or the line's end again. */
  private resume(back: Resume, now: number, out: TrainerEffect[]) {
    this.aside = undefined;
    this.ply = back.ply;
    out.push({ type: 'takeback', path: this.path() });
    if (back.phase === 'lineDone') return this.lineEnd(out);
    const p = back.pending;
    if (!p) return this.advance(now, out);
    p.since = now - back.elapsed;
    this.pending = p;
    this.phase = back.phase;
    if (p.shown) {
      out.push({ type: 'arrow', uci: p.uci });
      out.push({ type: 'note', note: p.mode === 'teach' && back.phase === 'teach' ? { kind: 'newMove', san: p.san } : { kind: 'shown', san: p.san } });
    } else out.push({ type: 'note', note: back.phase === 'wrong' ? { kind: 'wrong' } : p.mode === 'teach' ? { kind: 'newTry' } : this.askNote() });
  }

  /** In a line from the comments: the opponent's move after the pace (the first after two), an ask, or its end. */
  private asideStep(now: number, out: TrainerEffect[]) {
    const a = this.aside!;
    const q = a.items[a.at]!;
    if (a.ply >= q.sans.length) {
      // A look at where it ends, then the next.
      this.phase = 'again';
      this.afterPause = 'aside';
      this.wait(this.pace * 2, out);
      return;
    }
    if (!q.own[a.ply]) {
      this.phase = 'opponent';
      this.wait(a.ply === 0 ? this.pace * 2 : this.pace, out);
      return;
    }
    a.wrong = [];
    a.hint = false;
    a.shown = false;
    this.phase = 'ask';
  }

  /** In a line from the comments: its move, or another the comments or the repertoire play here (not wrong), or a wrong one. */
  private asideMove(uci: string, now: number, out: TrainerEffect[]) {
    const a = this.aside!;
    const q = a.items[a.at]!;
    const back = () => out.push({ type: 'takeback', path: this.path(q.ply) });
    if (this.phase !== 'ask' && this.phase !== 'wrong' && this.phase !== 'shown') return void back();
    const before = q.positions[a.ply]!;
    const move = parseUciMove(before, uci);
    if (!move) return void back();
    const played = standardUci(before, move);
    if (played === q.ucis[a.ply]) {
      this.asideCounts.moves++;
      if (a.wrong.length === 0 && !a.hint) this.asideCounts.right++;
      if (a.shown) out.push({ type: 'arrow' });
      out.push({ type: 'play', uci: played, san: q.sans[a.ply]!, path: this.path(q.ply), by: 'user' });
      a.ply++;
      out.push({ type: 'note', note: { kind: 'aside', n: a.at + 1, of: a.items.length, important: q.important } });
      return this.asideStep(now, out);
    }
    back();
    const key = positionKeyOf(before);
    const also = this.setup.index.positions.get(key)?.own.has(played) || a.items.some((o) => o.positions.some((p, i) => o.own[i] && o.ucis[i] === played && positionKeyOf(p) === key));
    if (also) return void out.push({ type: 'note', note: { kind: 'asideAlso' } });
    if (!a.wrong.includes(played)) a.wrong.push(played);
    if (a.shown || a.wrong.length >= 2) this.showAside(out);
    else {
      this.phase = 'wrong';
      out.push({ type: 'note', note: { kind: 'asideWrong' } });
    }
  }

  private showAside(out: TrainerEffect[]) {
    const a = this.aside!;
    const q = a.items[a.at]!;
    a.shown = true;
    this.phase = 'shown';
    out.push({ type: 'arrow', uci: q.ucis[a.ply]! });
    out.push({ type: 'note', note: { kind: 'shown', san: q.sans[a.ply]! } });
  }

  private tick(now: number, out: TrainerEffect[]) {
    if (this.phase === 'lineDone') return this.nextLine(now, out);
    if (this.phase === 'again') return this.afterPause === 'retry' ? this.nextRetry(now, out) : this.afterPause === 'pass' ? this.nextPass(now, out) : this.nextAside(now, out);
    if (this.phase === 'opponent' && this.inAside) {
      const a = this.aside!;
      const q = a.items[a.at]!;
      out.push({ type: 'play', uci: q.ucis[a.ply]!, san: q.sans[a.ply]!, path: this.path(q.ply), by: 'opponent' });
      a.ply++;
      return this.asideStep(now, out);
    }
    if (this.phase === 'preview') {
      const q = this.seq!;
      const p = this.plies[this.ply]!;
      this.ply++;
      out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: 'preview' });
      if (this.ply >= q.to) this.phase = 'previewed';
      else this.wait(this.pace * 2, out);
      return;
    }
    if (this.phase !== 'opponent' && this.phase !== 'auto') return;
    const p = this.plies[this.ply]!;
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: this.phase === 'opponent' ? 'opponent' : 'auto' });
    this.advance(now, out);
  }

  private move(uci: string, now: number, out: TrainerEffect[]) {
    if (this.inAside) return this.asideMove(uci, now, out);
    const p = this.pending;
    if (!p) {
      // Not the user's turn: the board goes back.
      if (this.phase !== 'ready' && this.at < this.lines.length) out.push({ type: 'takeback', path: this.path() });
      return;
    }
    const before = this.plies[this.ply]!.before;
    const move = parseUciMove(before, uci);
    // Not a legal move (or a promotion without its piece): no answer yet.
    if (!move) return void out.push({ type: 'takeback', path: this.path() });
    const played = standardUci(before, move);
    // Any move made ends the undo of a save (§5.18).
    delete p.saved;
    if (played === p.uci) return this.accept(p, now, out);
    if (this.setup.follow && this.followLine(before, move)) return this.accept(this.pending!, now, out);
    if (p.mode === 'teach' && p.shown && !this.options.tryNew) {
      out.push({ type: 'takeback', path: this.path() });
      out.push({ type: 'note', note: { kind: 'newMove', san: p.san } });
      return;
    }
    const key = positionKeyOf(before);
    const own = this.setup.index.positions.get(key)?.own;
    if (!p.also && own?.has(played)) {
      // Another repertoire move here (D3): accepted, graded on its own card if it is asked today.
      const other = repertoireCard(key, played);
      if (this.kindOf(other) === 'ask') this.review(other, p, now, out);
      out.push({ type: 'takeback', path: this.path() });
      out.push({ type: 'arrow' });
      out.push({ type: 'note', note: { kind: 'alsoPlays' } });
      this.pending = { ...p, wrong: [], hint: false, shown: false, since: now, also: true };
      this.phase = 'ask';
      return;
    }
    if (this.alternatives.has(repertoireCard(key, played))) {
      // An alternative (§5.18): free, however often it is played in this ask.
      delete p.lastWrong;
      out.push({ type: 'takeback', path: this.path() });
      out.push({ type: 'note', note: { kind: 'alternative', san: makeSan(before, move) } });
      return;
    }
    if (!p.wrong.includes(played)) p.wrong.push(played);
    p.lastWrong = { uci: played, san: makeSan(before, move) };
    out.push({ type: 'takeback', path: this.path() });
    if (p.shown || p.wrong.length >= 2) this.show(p, out);
    else {
      this.phase = 'wrong';
      out.push({ type: 'note', note: { kind: 'wrong' } });
    }
  }

  /**
   * With `follow`: switches to the first of the index's lines in this chapter that plays `move`
   * after the board's moves, and makes it the move asked. False when no line does.
   */
  private followLine(before: Position, move: NormalMove): boolean {
    const p = this.pending!;
    const current = this.lines[this.at]!;
    const board = current.line.path.slice(0, this.ply);
    const san = makeSan(before, move);
    const line = this.setup.index.lines.find(
      (l) => l.sid === current.line.sid && l.cid === current.line.cid && l.path[this.ply] === san && board.every((m, i) => l.path[i] === m),
    );
    if (!line) return false;
    const planned: PlannedLine = { ...current, line, end: line.path.length };
    const built = this.build(planned);
    const ply = built?.plies[this.ply];
    if (!built || !ply?.card) return false;
    this.lines[this.at] = planned;
    this.plies = built.plies;
    this.positions = built.positions;
    this.end = built.plies.length;
    this.pending = { ...p, card: ply.card, uci: ply.uci, san: ply.san };
    return true;
  }

  private show(p: Pending, out: TrainerEffect[]) {
    p.shown = true;
    this.phase = 'shown';
    out.push({ type: 'arrow', uci: p.uci });
    out.push({ type: 'note', note: { kind: 'shown', san: p.san } });
  }

  /**
   * Whether an answer is recorded: the first in the session of a move the plan asks, a known move
   * never answered, or any reviewed move asked, due or not (the owner's choice, 2026-10-13, §5.106:
   * a miss on a move not due is news; FSRS weighs an early answer by the time since the last one).
   * A move in its learning step is graded only when due. Difficult lines grade only their due moves.
   */
  private graded(card: CardId) {
    if (!this.record || this.answered.has(card)) return false;
    if (this.gradeOnly && !this.gradeOnly.has(card)) return false;
    if (this.toAsk.has(card)) return true;
    const status = statusOf(this.state(card));
    return status === 'review' || (status === 'fresh' && this.known.has(card));
  }

  /**
   * A move asked was answered: right first time or not, for auto-play's `session` and `difficult`.
   * The latest answer counts for `session`, a mistake retried included: a miss answered right later
   * is played again (the owner's request, 2026-10-13, §5.107). A miss stays one for `difficult`.
   */
  private answer(card: CardId, ok: boolean, out: TrainerEffect[]) {
    this.answered.add(card);
    if (ok) this.right.add(card);
    else {
      this.right.delete(card);
      this.missedNow.add(card);
    }
    out.push(this.repeating() ? { type: 'answer', card, ok, repeat: true } : { type: 'answer', card, ok });
  }

  private review(card: CardId, p: Pending, now: number, out: TrainerEffect[]): Grade {
    const g = grade({ wrong: p.wrong.length, hint: p.hint });
    const graded = this.graded(card);
    this.answer(card, g === 3, out);
    if (graded) {
      const event: TrainerRecord = { k: 'review', card, g, ms: Math.max(0, now - p.since) };
      if (p.wrong.length) event.w = [...p.wrong];
      if (p.hint) event.h = 1;
      out.push({ type: 'record', event });
      this.counts.reviews++;
      if (g === 3) this.counts.good++;
    }
    return g;
  }

  private accept(p: Pending, now: number, out: TrainerEffect[]) {
    let ok = true;
    if (p.mode === 'teach') {
      this.answered.add(p.card);
      this.taughtOnLine.push(p.card);
      if (this.record) {
        out.push({ type: 'record', event: { k: 'taught', card: p.card } });
        this.counts.taught++;
      }
      // Found unaided, it counts as answered right for auto-play's `session` mode.
      const found = !p.shown && p.wrong.length === 0 && !p.hint;
      if (found) this.right.add(p.card);
      // A wrong move or a hint is a mistake, retried at the walk's end like a due move's (§5.110).
      ok = p.wrong.length === 0 && !p.hint;
      out.push({ type: 'note', note: found ? { kind: 'taught', san: p.san, found } : { kind: 'taught', san: p.san } });
    } else {
      const g = this.review(p.card, p, now, out);
      ok = g === 3;
      out.push({ type: 'note', note: { kind: ok ? 'correct' : 'played' } });
    }
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: 'user' });
    this.afterAnswer(p.card, ok, now, out);
  }

  /** Show and grade: the move asked is played, and the grade waits for `tell`. */
  private showMove(out: TrainerEffect[]) {
    const p = this.pending;
    if (!this.selfGrading || !p) return;
    this.pending = undefined;
    const graded = this.graded(p.card);
    this.answered.add(p.card);
    // A move already tried wrong, or hinted, before the keys took over is failed whatever is told.
    this.waiting = { card: p.card, mode: p.mode, san: p.san, since: p.since, failed: p.mode === 'ask' && (p.wrong.length > 0 || p.hint), graded };
    out.push({ type: 'arrow', uci: p.uci });
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: 'user' });
    this.phase = 'shown';
    out.push({ type: 'note', note: { kind: 'shown', san: p.san } });
  }

  /** Show and grade: the card is graded (a taught move is taught), then the line goes on. */
  private tell(knew: boolean, now: number, out: TrainerEffect[]) {
    const w = this.waiting;
    if (!w) return;
    this.waiting = undefined;
    let ok = true;
    if (w.mode === 'teach') {
      this.taughtOnLine.push(w.card);
      if (this.record) {
        out.push({ type: 'record', event: { k: 'taught', card: w.card } });
        this.counts.taught++;
      }
      out.push({ type: 'note', note: { kind: 'taught', san: w.san } });
    } else {
      const g = selfGrade(knew && !w.failed);
      this.answer(w.card, g === 3, out);
      if (w.graded) {
        out.push({ type: 'record', event: { k: 'review', card: w.card, g, ms: Math.max(0, now - w.since) } });
        this.counts.reviews++;
        if (g === 3) this.counts.good++;
      }
      ok = g === 3;
      out.push({ type: 'note', note: { kind: ok ? 'correct' : 'played' } });
    }
    this.afterAnswer(w.card, ok, now, out);
    // The press plays the opponent's reply at once; what follows comes at the pace.
    if (this.phase === 'opponent' || this.phase === 'auto') this.tick(now, out);
  }

  /** Saves the last wrong move as an alternative: it no longer counts against the ask. */
  private saveAlt(out: TrainerEffect[]) {
    const p = this.pending;
    const w = p?.lastWrong;
    if (!p || !w) return;
    const card = repertoireCard(positionKeyOf(this.plies[this.ply]!.before), w.uci);
    this.alternatives.add(card);
    p.saved = { ...w, shown: p.shown };
    out.push({ type: 'record', event: { k: 'alt', card, on: true } });
    this.unwrong(p, w.uci, out);
    out.push({ type: 'note', note: { kind: 'altSaved', san: w.san } });
  }

  /** The last wrong move was a misclick: out of the ask's wrong moves, nothing saved or recorded. */
  private misclick(out: TrainerEffect[]) {
    const p = this.pending;
    const w = p?.lastWrong;
    if (!p || !w) return;
    this.unwrong(p, w.uci, out);
    out.push({ type: 'note', note: { kind: 'misclick', san: w.san } });
  }

  /** Takes a wrong move out of the ask, as if it was never played. */
  private unwrong(p: Pending, uci: string, out: TrainerEffect[]) {
    p.wrong = p.wrong.filter((m) => m !== uci);
    delete p.lastWrong;
    // Shown by that move alone (a second wrong move): asked again as if it was never played.
    if (p.shown && !p.hint && p.wrong.length < 2) {
      p.shown = false;
      out.push({ type: 'arrow' });
    }
    if (!p.shown) this.phase = p.wrong.length > 0 ? 'wrong' : 'ask';
  }

  /** Undoes the save: the move is a wrong move of this ask again, as it was. */
  private unsaveAlt(out: TrainerEffect[]) {
    const p = this.pending;
    const saved = p?.saved;
    if (!p || !saved) return;
    const card = repertoireCard(positionKeyOf(this.plies[this.ply]!.before), saved.uci);
    this.alternatives.delete(card);
    out.push({ type: 'record', event: { k: 'alt', card, on: false } });
    if (!p.wrong.includes(saved.uci)) p.wrong.push(saved.uci);
    p.lastWrong = { uci: saved.uci, san: saved.san };
    delete p.saved;
    if (saved.shown || p.wrong.length >= 2) {
      if (!p.shown) this.show(p, out);
      else this.phase = 'shown';
    } else {
      this.phase = 'wrong';
      out.push({ type: 'note', note: { kind: 'wrong' } });
    }
  }

  private hint(out: TrainerEffect[]) {
    if (this.inAside) {
      const a = this.aside!;
      if ((this.phase === 'ask' || this.phase === 'wrong') && !a.shown) {
        a.hint = true;
        this.showAside(out);
      }
      return;
    }
    const p = this.pending;
    if (!p || p.shown) return;
    p.hint = true;
    this.show(p, out);
  }

  private suspend(now: number, out: TrainerEffect[]) {
    const p = this.pending;
    if (!p) return;
    // A suspend is the owner's choice about the card, recorded even when grading is off.
    this.suspendedNow.add(p.card);
    this.answered.add(p.card);
    out.push({ type: 'record', event: { k: 'suspend', card: p.card } });
    this.counts.suspended++;
    out.push({ type: 'note', note: { kind: 'suspended', san: p.san } });
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: 'auto' });
    const r = this.retrying;
    // A mistake always played from now on isn't asked again.
    if (r) {
      r.items[r.at]!.streak = this.need();
      this.pause('retry', out);
      return;
    }
    this.advance(now, out);
  }
}
