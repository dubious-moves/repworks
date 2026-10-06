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
// - Conflicting moves (D3): every own move of the position is accepted, and the one played is
//   graded on its own card if it is due. The line's own move is then asked in the same position,
//   on its own card, so a sibling can't stay due for ever. The trainer only lets the user move
//   where the line's own move is asked or taught, so the line followed is always the planned one.
import type { Position } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { positionKeyOf } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { repertoireCard, type CardId } from '../progress/cards.ts';
import type { Grade } from '../progress/events.ts';
import type { CardState } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';
import { grade } from './grade.ts';
import type { PlannedLine, SessionPlan } from './plan.ts';
import { knownCardsOf, statusOf } from './queue.ts';

/** The quickest pace: lichessable's floor, so a move can still be followed (§5.2). */
export const MIN_PACE_MS = 450;

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
  /** A taught move played. */
  | { kind: 'taught'; san: string }
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
}

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
  summary: Summary;
}

type Kind = 'ask' | 'teach' | 'auto';

export class Trainer {
  private readonly setup: TrainerSetup;
  private pace: number;
  private readonly record: boolean;
  private readonly toAsk = new Set<CardId>();
  private readonly toTeach = new Set<CardId>();
  private readonly known: Set<CardId>;
  /** Cards asked, taught or suspended in this session. */
  private readonly answered = new Set<CardId>();
  private readonly taughtNow = new Set<CardId>();
  private readonly suspendedNow = new Set<CardId>();
  private phase: Phase = 'ready';
  private at = -1;
  private plies: Ply[] = [];
  /** Positions after each ply count: positions[i] is the board after i moves. */
  private positions: Position[] = [];
  private end = 0;
  private ply = 0;
  private pending: Pending | undefined;
  private waitId = 0;
  private walked = 0;
  private readonly counts = { reviews: 0, good: 0, taught: 0, suspended: 0 };

  constructor(setup: TrainerSetup) {
    this.setup = setup;
    this.pace = Math.max(MIN_PACE_MS, setup.paceMs);
    this.record = setup.record ?? true;
    for (const l of setup.plan.lines) {
      for (const c of l.ask) this.toAsk.add(c);
      for (const c of l.teach) this.toTeach.add(c);
    }
    this.known = knownCardsOf(setup.index);
  }

  /** A new pace, from the next move played for the user. */
  setPace(ms: number): void {
    this.pace = Math.max(MIN_PACE_MS, ms);
  }

  get view(): TrainerView {
    const line = this.setup.plan.lines[this.at];
    const v: TrainerView = {
      phase: this.phase,
      number: this.at + 1,
      total: this.setup.plan.lines.length,
      path: line ? line.line.path.slice(0, this.ply) : [],
      summary: this.summary(),
    };
    if (line) v.line = line;
    const position = this.positions[this.ply];
    if (position) v.position = position;
    const p = this.pending;
    if (p && (p.mode === 'teach' || p.shown)) v.shown = { uci: p.uci, san: p.san };
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
      case 'suspend':
        this.suspend(command.now, out);
        break;
      case 'skipLine':
        if (this.phase === 'ready') break;
        this.waitId++;
        this.pending = undefined;
        out.push({ type: 'arrow' });
        this.nextLine(command.now, out);
        break;
      case 'stop':
        this.waitId++;
        this.pending = undefined;
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

  private kindOf(card: CardId): Kind {
    if (this.answered.has(card) || this.suspended(card)) return 'auto';
    const fresh = statusOf(this.state(card)) === 'fresh';
    if (this.toAsk.has(card) || this.setup.askAll || (fresh && this.known.has(card))) return 'ask';
    // A move never answered is never played for the user (lichessable's rule).
    if (this.toTeach.has(card) || fresh) return 'teach';
    return 'auto';
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
    return plies.some((p, i) => i < planned.end && p.card !== undefined && this.kindOf(p.card) !== 'auto');
  }

  private nextLine(now: number, out: TrainerEffect[]) {
    const lines = this.setup.plan.lines;
    const board = this.at >= 0 ? lines[this.at]! : undefined;
    const boardPath = board ? board.line.path.slice(0, this.ply) : [];
    for (this.at++; this.at < lines.length; this.at++) {
      const planned = lines[this.at]!;
      const built = this.build(planned);
      if (!built || !this.needed(planned, built.plies)) continue;
      this.plies = built.plies;
      this.positions = built.positions;
      this.end = Math.min(planned.end, built.plies.length);
      // Start where the board already is when the line shares its moves, up to its first ask or
      // teach: the positions follow on from each other (§5.4).
      let ply = 0;
      if (board && board.line.sid === planned.line.sid && board.line.cid === planned.line.cid) {
        while (ply < boardPath.length && ply < this.end && boardPath[ply] === planned.line.path[ply]) {
          const card = this.plies[ply]!.card;
          if (card && this.kindOf(card) !== 'auto') break;
          ply++;
        }
      }
      this.ply = ply;
      this.walked++;
      out.push({ type: 'line', line: planned.line, number: this.at + 1, total: lines.length, kind: planned.kind, path: planned.line.path.slice(0, ply) });
      this.advance(now, out);
      return;
    }
    this.finish(out);
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
    return this.setup.plan.lines[this.at]!.line.path.slice(0, upTo);
  }

  /** From the board's position: the next move, an ask, or the line's end. */
  private advance(now: number, out: TrainerEffect[]) {
    this.pending = undefined;
    if (this.ply >= this.end) {
      this.phase = 'lineDone';
      out.push({ type: 'lineDone' });
      this.wait(this.pace * 2, out);
      return;
    }
    const p = this.plies[this.ply]!;
    if (!p.card) {
      this.phase = 'opponent';
      this.wait(this.pace, out);
      return;
    }
    const kind = this.kindOf(p.card);
    if (kind === 'auto') {
      this.phase = 'auto';
      if (this.learning(p.card)) out.push({ type: 'arrow', uci: p.uci });
      this.wait(this.pace, out);
      return;
    }
    this.pending = { mode: kind, card: p.card, uci: p.uci, san: p.san, wrong: [], hint: false, shown: kind === 'teach', since: now, also: false };
    this.phase = kind;
    if (kind === 'teach') {
      out.push({ type: 'arrow', uci: p.uci });
      out.push({ type: 'note', note: { kind: 'newMove', san: p.san } });
    } else out.push({ type: 'note', note: { kind: 'yourMove' } });
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
      if (this.phase !== 'ready' && this.at < this.setup.plan.lines.length) out.push({ type: 'takeback', path: this.path() });
      return;
    }
    const before = this.plies[this.ply]!.before;
    const move = parseUciMove(before, uci);
    // Not a legal move (or a promotion without its piece): no answer yet.
    if (!move) return void out.push({ type: 'takeback', path: this.path() });
    const played = standardUci(before, move);
    if (played === p.uci) return this.accept(p, now, out);
    if (p.mode === 'teach') {
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

  private show(p: Pending, out: TrainerEffect[]) {
    p.shown = true;
    this.phase = 'shown';
    out.push({ type: 'arrow', uci: p.uci });
    out.push({ type: 'note', note: { kind: 'shown', san: p.san } });
  }

  private review(card: CardId, p: Pending, now: number, out: TrainerEffect[]): Grade {
    const g = grade({ wrong: p.wrong.length, hint: p.hint });
    this.answered.add(card);
    if (this.record) {
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
      out.push({ type: 'note', note: { kind: 'taught', san: p.san } });
    } else {
      const g = this.review(p.card, p, now, out);
      out.push({ type: 'note', note: { kind: g === 3 ? 'correct' : 'played' } });
    }
    this.ply++;
    out.push({ type: 'play', uci: p.uci, san: p.san, path: this.path(), by: 'user' });
    this.advance(now, out);
  }

  private hint(out: TrainerEffect[]) {
    const p = this.pending;
    if (!p || p.mode !== 'ask' || p.shown) return;
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
