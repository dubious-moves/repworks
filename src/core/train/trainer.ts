// The trainer (PLAN.md §5.6): walks a session plan's lines on the board, plays the opponent's
// moves and the own moves it doesn't ask at the pace, asks the due moves, teaches the new ones.
// A pure state machine: the app sends it commands with the time, and turns the effects it returns
// into board calls, `store.record` and timers. Nothing here reads a clock.
// - An own move is asked when its card is due today (the plan's asks) or is known and never
//   answered; taught when it was never answered (the plan's teaches, and any such move met after
//   a skipped line: a move never answered is never auto-played); else played for the user, with
//   its arrow first while it is in its learning step. A card is asked or taught once a session.
// - Right first time is Good; a wrong move or a hint is Again (§5.2). A first wrong move is taken
//   back and the move asked again; a second, or Hint, shows it with an arrow. A taught move
//   records `taught`, never a review. A known move answered wrong records Again and no `taught`:
//   the daily limit counts `taught` events, and known moves never use it (§5.3).
// - Auto-play (§5.17, lichessable's modes): an own move the plan doesn't need graded or taught is
//   played for the user or asked without a grade, by the `autoPlay` mode (`plays`). Suspended
//   moves are always played. Where a line starts (`lineStart`) decides the moves before its first
//   move the plan needs: skipped, played at the pace, or asked.
// - Conflicting moves (D3): every own move of the position is accepted, and the one played is
//   graded on its own card if it is due. The line's own move is then asked in the same position,
//   on its own card, so a sibling can't stay due for ever. The trainer only lets the user move
//   where the line's own move is asked or taught, so the line followed is always the planned one,
//   except with `follow` (the Interactive view, §5.10): a move that starts another line of the
//   chapter from the board's moves is right, and the walk goes on along that line.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { isNormal, type NormalMove } from 'chessops/types';
import { positionKeyOf } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { repertoireCard, type CardId } from '../progress/cards.ts';
import type { Grade } from '../progress/events.ts';
import type { CardState } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';
import { grade, selfGrade } from './grade.ts';
import type { PlannedLine, SessionPlan } from './plan.ts';
import { knownCardsOf, statusOf } from './queue.ts';

/** The quickest pace: lichessable's floor, so a move can still be followed (§5.2). */
export const MIN_PACE_MS = 450;

/**
 * Which own moves the plan doesn't need are played for the user (§5.17, after lichessable's
 * auto-play and its "difficult moves only"):
 * - `off`: none; every one is asked, with no grade.
 * - `session`: moves answered right first time earlier in the session (lichessable's auto-play);
 *   a move answered wrong is asked again, ungraded.
 * - `due` (the default, the trainer as it was): moves answered earlier in the session, right or
 *   wrong, and in the queue moves reviewed and not due. A line picked or learned asks the latter.
 * - `difficult`: as `due`, except that a difficult move (answered wrong in the session, or with
 *   lapses or a high FSRS difficulty) is asked whenever it is met.
 */
export type AutoPlay = 'off' | 'session' | 'due' | 'difficult';
export const AUTO_PLAYS: readonly AutoPlay[] = ['off', 'session', 'due', 'difficult'];

/**
 * Where a line starts (§5.17), for the moves before its first move the plan grades or teaches:
 * - `first`: there (one move before, so the opponent's move is seen), or where the board already
 *   is when the line shares its moves;
 * - `auto`: at the chapter's start, those moves played at the pace, own moves included;
 * - `ask`: at the chapter's start, every own move asked (ungraded unless due).
 */
export type LineStart = 'first' | 'auto' | 'ask';
export const LINE_STARTS: readonly LineStart[] = ['first', 'auto', 'ask'];

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
  /** A first wrong move was taken back; the move is asked again. */
  | 'wrong'
  /** The move is shown (a second wrong move, or Hint); the user plays it. */
  | 'shown'
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
  /** A new move asked before it is shown (`tryNew`). */
  | { kind: 'newTry' }
  /** A taught move played; `found` when it was found with no arrow, wrong move or hint. */
  | { kind: 'taught'; san: string; found?: boolean }
  /** A conflict move was accepted; the repertoire has another move here, asked now. */
  | { kind: 'alsoPlays' }
  | { kind: 'suspended'; san: string };

export type TrainerRecord =
  | { k: 'review'; card: CardId; g: Grade; ms: number; w?: string[]; h?: 1 }
  | { k: 'taught'; card: CardId }
  | { k: 'suspend'; card: CardId };

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
  | { type: 'play'; uci: string; san: string; path: string[]; by: 'opponent' | 'auto' | 'user' }
  /** The user's move is refused: show the position after `path` again. */
  | { type: 'takeback'; path: string[] }
  /** An arrow for a move; undefined clears it. */
  | { type: 'arrow'; uci?: string }
  | { type: 'note'; note: Note }
  | { type: 'record'; event: TrainerRecord }
  /** A move asked was answered: right first time or not. Given with recording on or off. */
  | { type: 'answer'; card: CardId; ok: boolean }
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
  /** "Always play this for me" on the move asked or taught. */
  | { type: 'suspend'; now: number }
  | { type: 'skipLine'; now: number }
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
   * A line picked from the list (§5.16): an own move the plan neither asks nor teaches, and that
   * would be played for the user, is asked too, with no grade (unless suspended).
   */
  practice?: boolean;
  /**
   * Interactive view (§5.10): an own move that another of the index's lines plays after the
   * board's moves is right, and the walk follows that line to its end.
   */
  follow?: boolean;
  /** Which own moves the plan doesn't need are played for the user (§5.17); default `due`. */
  autoPlay?: AutoPlay;
  /** New moves are asked before they are shown (§5.17): the arrow comes after a wrong move or Hint. */
  tryNew?: boolean;
  /** Where a line starts (§5.17). Unset: where the board already is when the line shares its moves, else at its start. */
  lineStart?: LineStart;
  /** At a line's end, wait for `next` rather than going on (§5.17). */
  holdLineEnd?: boolean;
  /** The pause at a line's end before the next, in paces (default 2). */
  lineEndPaces?: number;
}

/** The options a running session can change (the training settings, §5.17). */
export type TrainerOptions = Pick<TrainerSetup, 'autoPlay' | 'tryNew' | 'lineStart' | 'holdLineEnd' | 'lineEndPaces'>;

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
  summary: Summary;
}

type Kind = 'ask' | 'teach' | 'auto';

export class Trainer {
  private readonly setup: TrainerSetup;
  private options: TrainerOptions;
  private pace: number;
  private readonly record: boolean;
  /** The plan's lines; with `follow`, the line walked is replaced by the one the user chose. */
  private readonly lines: PlannedLine[];
  private readonly toAsk = new Set<CardId>();
  private readonly toTeach = new Set<CardId>();
  private readonly known: Set<CardId>;
  /** Cards asked, taught or suspended in this session. */
  private readonly answered = new Set<CardId>();
  private readonly taughtNow = new Set<CardId>();
  private readonly suspendedNow = new Set<CardId>();
  /** Cards answered right first time in this session, and answered wrong (§5.17's modes). */
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
  /** At a line's end: the next line found, and its moves. */
  private upcoming: { at: number; plies: Ply[]; positions: Position[] } | undefined;
  private pending: Pending | undefined;
  /** Show and grade: a move played and waiting for its grade. */
  private waiting: { card: CardId; mode: 'ask' | 'teach'; san: string; since: number; failed: boolean; graded: boolean } | undefined;
  /** Show and grade, on from the setup and switched during the session (§5.16). */
  private selfGrading: boolean;
  private waitId = 0;
  private walked = 0;
  private readonly counts = { reviews: 0, good: 0, taught: 0, suspended: 0 };

  constructor(setup: TrainerSetup) {
    this.setup = setup;
    const { autoPlay, tryNew, lineStart, holdLineEnd, lineEndPaces } = setup;
    this.options = { autoPlay, tryNew, lineStart, holdLineEnd, lineEndPaces };
    this.pace = Math.max(MIN_PACE_MS, setup.paceMs);
    this.record = setup.record ?? true;
    this.lines = [...setup.plan.lines];
    for (const l of setup.plan.lines) {
      for (const c of l.ask) this.toAsk.add(c);
      for (const c of l.teach) this.toTeach.add(c);
    }
    this.known = knownCardsOf(setup.index);
    this.selfGrading = setup.selfGrade ?? false;
  }

  /** New options, from the next move met (§5.17's settings changed during a session). */
  configure(options: TrainerOptions): void {
    this.options = { ...this.options, ...options };
  }

  /** Show and grade on or off from the next move asked (§5.16). */
  setSelfGrade(on: boolean): void {
    this.selfGrading = on;
  }

  /** Show and grade: a move is shown and waits for its verdict (`tell`). */
  get awaitingGrade(): boolean {
    return this.waiting !== undefined;
  }

  /** A new pace, from the next move played for the user. */
  setPace(ms: number): void {
    this.pace = Math.max(MIN_PACE_MS, ms);
  }

  get view(): TrainerView {
    const line = this.lines[this.at];
    const v: TrainerView = {
      phase: this.phase,
      number: this.at + 1,
      total: this.lines.length,
      path: line ? line.line.path.slice(0, this.ply) : [],
      summary: this.summary(),
    };
    if (line) v.line = line;
    const position = this.positions[this.ply];
    if (position) v.position = position;
    if (this.phase === 'lineDone' && this.upcoming) v.upcoming = this.lines[this.upcoming.at]!;
    const p = this.pending;
    if (p?.shown) v.shown = { uci: p.uci, san: p.san };
    else if (this.waiting) v.shown = { uci: '', san: this.waiting.san };
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
      case 'tell':
        this.tell(command.knew, command.now, out);
        break;
      case 'suspend':
        this.suspend(command.now, out);
        break;
      case 'skipLine':
        if (this.phase === 'ready') break;
        this.waitId++;
        this.pending = undefined;
        this.waiting = undefined;
        out.push({ type: 'arrow' });
        this.nextLine(command.now, out);
        break;
      case 'stop':
        this.waitId++;
        this.pending = undefined;
        this.waiting = undefined;
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
    // A move not answered yet: played in the queue when it isn't due, never in a line picked or learned.
    if (mode === 'off' || mode === 'session' || this.setup.practice) return false;
    return !hard;
  }

  /** How an own move is met: asked, taught or played; `prefix` for a move before the line's first need. */
  private kindOf(card: CardId, prefix = false): Kind {
    if (this.setup.askOnly) return !this.answered.has(card) && this.toAsk.has(card) ? 'ask' : 'auto';
    if (this.suspended(card)) return 'auto';
    const need = this.needs(card);
    if (need) return need;
    if (prefix) return this.options.lineStart === 'ask' && !(this.answered.has(card) && this.plays(card)) ? 'ask' : 'auto';
    return this.plays(card) ? 'auto' : 'ask';
  }

  private learning(card: CardId) {
    return this.taughtNow.has(card) || statusOf(this.state(card)) === 'learning';
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
    if (planned.ask.length + planned.teach.length === 0) return true;
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

  /** The ply of the line's first move the plan needs, or else of its first own move asked; its end if none. */
  private prefixEnd(plies: readonly Ply[], end: number): number {
    for (let i = 0; i < end; i++) if (plies[i]!.card && this.needs(plies[i]!.card!)) return i;
    for (let i = 0; i < end; i++) if (plies[i]!.card && this.kindOf(plies[i]!.card!) !== 'auto') return i;
    return end;
  }

  private nextLine(now: number, out: TrainerEffect[]) {
    const found = this.upcoming ?? this.findNext();
    this.upcoming = undefined;
    // The last line's end is the session's: the board stays on it (§5.17).
    if (!found) return this.finish(out);
    const lines = this.lines;
    const board = this.at >= 0 ? lines[this.at] : undefined;
    const boardPath = board ? board.line.path.slice(0, this.ply) : [];
    this.at = found.at;
    const planned = lines[this.at]!;
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
    // §5.17: at the first move needed (one move before it, for the opponent's), from the start
    // played, or from the start asked. A planned start (drill's lead-in) comes first when further on.
    let ply = start === undefined ? shared : start === 'first' ? Math.max(Math.min(shared, this.prefix), this.prefix - 1, 0) : 0;
    ply = Math.max(ply, Math.min(planned.from ?? 0, this.end));
    this.ply = ply;
    this.walked++;
    out.push({ type: 'line', line: planned.line, number: this.at + 1, total: lines.length, kind: planned.kind, path: planned.line.path.slice(0, this.ply) });
    this.advance(now, out);
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

  /** From the board's position: the next move, an ask, or the line's end. */
  private advance(now: number, out: TrainerEffect[]) {
    this.pending = undefined;
    this.waiting = undefined;
    if (this.ply >= this.end) {
      this.phase = 'lineDone';
      out.push({ type: 'lineDone' });
      this.upcoming = this.findNext();
      if (!this.upcoming) return this.finish(out);
      if (!this.options.holdLineEnd) this.wait(this.pace * (this.options.lineEndPaces ?? 2), out);
      return;
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
      if (this.learning(p.card)) out.push({ type: 'arrow', uci: p.uci });
      this.wait(this.pace, out);
      return;
    }
    // With `tryNew` a new move is asked like a due one, and shown only after a wrong move or Hint.
    const shown = kind === 'teach' && !this.options.tryNew;
    this.pending = { mode: kind, card: p.card, uci: p.uci, san: p.san, wrong: [], hint: false, shown, since: now, also: false };
    this.phase = shown ? 'teach' : 'ask';
    if (shown) {
      out.push({ type: 'arrow', uci: p.uci });
      out.push({ type: 'note', note: { kind: 'newMove', san: p.san } });
    } else out.push({ type: 'note', note: kind === 'teach' ? { kind: 'newTry' } : { kind: 'yourMove' } });
  }

  private tick(now: number, out: TrainerEffect[]) {
    if (this.phase === 'lineDone') return this.nextLine(now, out);
    if (this.phase !== 'opponent' && this.phase !== 'auto') return;
    const p = this.plies[this.ply]!;
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: this.phase === 'opponent' ? 'opponent' : 'auto' });
    this.advance(now, out);
  }

  private move(uci: string, now: number, out: TrainerEffect[]) {
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
    if (!p.wrong.includes(played)) p.wrong.push(played);
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
   * Whether an answer on the card is graded: only the plan's asks and known moves never answered,
   * and once a session. Any other move asked (a line picked, or auto-play off) is practice.
   */
  private graded(card: CardId) {
    return this.record && !this.answered.has(card) && (this.toAsk.has(card) || (statusOf(this.state(card)) === 'fresh' && this.known.has(card)));
  }

  /** A move asked was answered: right first time or not, for auto-play's `session` and `difficult`. */
  private answer(card: CardId, ok: boolean, out: TrainerEffect[]) {
    this.answered.add(card);
    if (ok) this.right.add(card);
    else {
      this.right.delete(card);
      this.missedNow.add(card);
    }
    out.push({ type: 'answer', card, ok });
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
    if (p.mode === 'teach') {
      this.answered.add(p.card);
      this.taughtNow.add(p.card);
      if (this.record) {
        out.push({ type: 'record', event: { k: 'taught', card: p.card } });
        this.counts.taught++;
      }
      // Found unaided, it counts as answered right for auto-play's `session` mode.
      const found = !p.shown && p.wrong.length === 0 && !p.hint;
      if (found) this.right.add(p.card);
      out.push({ type: 'note', note: found ? { kind: 'taught', san: p.san, found } : { kind: 'taught', san: p.san } });
    } else {
      const g = this.review(p.card, p, now, out);
      out.push({ type: 'note', note: { kind: g === 3 ? 'correct' : 'played' } });
    }
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: 'user' });
    this.advance(now, out);
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
    if (w.mode === 'teach') {
      this.taughtNow.add(w.card);
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
      out.push({ type: 'note', note: { kind: g === 3 ? 'correct' : 'played' } });
    }
    this.advance(now, out);
    // The press plays the opponent's reply at once; what follows comes at the pace.
    if (this.phase === 'opponent' || this.phase === 'auto') this.tick(now, out);
  }

  private hint(out: TrainerEffect[]) {
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
    this.advance(now, out);
  }
}
