// Show and grade (PLAN.md §5.9), lichessable's design recast: a session the owner runs with two
// keys, from a Bluetooth ring if its buttons reach the page, without moving a piece.
// Every press shows something:
// - at a move asked, `next` plays the move; the next `next` grades it known and plays the
//   opponent's reply. `wrong` plays the move and marks it failed; the next press grades it Again,
//   and `wrong` on a move already shown marks it failed there and then.
// - at a new move, the first press shows it and the next records it taught: nothing is graded.
// A press while the board is playing is queued, so a press between two moves isn't lost: `next`
// only, one at a time, and only for three seconds; `wrong` clears the queue, since marking a move
// failed before it is shown would grade the wrong move. Key repeats are never presses.
import { Trainer, type TrainerEffect } from './trainer.ts';

export type Press = 'next' | 'wrong' | 'repeat';

/** How long a press waits for the board (§5.9). */
export const QUEUE_MS = 3000;

/** The keys the mode listens for: the owner's ring sends the media keys. */
export function pressOf(key: string): Press | undefined {
  switch (key) {
    case '2':
    case 'MediaTrackNext':
      return 'next';
    case '4':
    case 'MediaTrackPrevious':
      return 'wrong';
    case '1':
      return 'repeat';
    default:
      return undefined;
  }
}

/** A move as it is spoken (§5.9): `Nxe5+` is "knight takes e5, check". */
export function spokenMove(san: string): string {
  const PIECES: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  const castle = /^(O-O-O|O-O)([+#])?$/.exec(san);
  if (castle) return `castles ${castle[1] === 'O-O' ? 'kingside' : 'queenside'}${castle[2] ? (castle[2] === '#' ? ', mate' : ', check') : ''}`;
  const m = /^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/.exec(san);
  // A move this doesn't recognize is spoken as it is written.
  if (!m) return san;
  const [, piece, from, takes, to, promotion, suffix] = m;
  const words: string[] = [];
  if (piece) words.push(PIECES[piece]!);
  if (from) words.push(from.split('').join(' '));
  if (takes) words.push('takes');
  words.push(to!);
  if (promotion) words.push(`promotes to ${PIECES[promotion]!}`);
  return `${words.join(' ')}${suffix ? (suffix === '#' ? ', mate' : ', check') : ''}`;
}

export type ShowGradeEffect = TrainerEffect | { type: 'say'; text: string };

export interface ShowGradeOptions {
  /** Speak each move as it is shown (off by default, §5.9). */
  speech?: boolean;
}

/** The presses of a show-and-grade session, over a trainer built with `selfGrade`. */
export class ShowGrade {
  private readonly trainer: Trainer;
  private readonly options: ShowGradeOptions;
  /** Whether the move shown was marked failed. */
  private failed = false;
  /** A `next` press waiting for the board, and when it was made. */
  private queued: number | undefined;
  /** The move last shown, for `repeat`. */
  private said: string | undefined;

  constructor(trainer: Trainer, options: ShowGradeOptions = {}) {
    this.trainer = trainer;
    this.options = options;
  }

  start(now: number): ShowGradeEffect[] {
    return this.after(this.trainer.send({ type: 'start', now }), now);
  }

  tick(id: number, now: number): ShowGradeEffect[] {
    return this.after(this.trainer.send({ type: 'tick', id, now }), now);
  }

  /** Stop, skip a line, and the rest of the trainer's own commands. */
  send(command: { type: 'skipLine' | 'stop' | 'next'; now: number }): ShowGradeEffect[] {
    this.queued = undefined;
    return this.after(this.trainer.send(command), command.now);
  }

  press(press: Press, now: number): ShowGradeEffect[] {
    if (press === 'repeat') return this.said !== undefined ? [{ type: 'say', text: spokenMove(this.said) }] : [];
    const phase = this.trainer.view.phase;
    // A move asked, taught, tried wrong, or shown by a hint before the keys took over (§5.16).
    if (phase === 'ask' || phase === 'teach' || phase === 'wrong' || (phase === 'shown' && !this.trainer.awaitingGrade)) {
      this.failed = press === 'wrong';
      return this.after(this.trainer.send({ type: 'show' }), now);
    }
    if (phase === 'shown') {
      if (press === 'wrong') this.failed = true;
      return this.after(this.trainer.send({ type: 'tell', knew: !this.failed, now }), now);
    }
    // A line's end held for "Next line" (§5.17): `next` goes on, so the ring alone can.
    if (phase === 'lineDone' && press === 'next' && this.trainer.view.upcoming) return this.after(this.trainer.send({ type: 'next', now }), now);
    // The board is playing: a `next` waits for it, a `wrong` clears what was waiting.
    this.queued = press === 'next' ? now : undefined;
    return [];
  }

  /** A queued press, applied once the board asks again (within three seconds of the press). */
  private after(effects: TrainerEffect[], now: number): ShowGradeEffect[] {
    const out: ShowGradeEffect[] = [...effects];
    for (const e of effects) {
      if (e.type === 'note' && (e.note.kind === 'shown' || e.note.kind === 'newMove')) {
        this.said = e.note.san;
        if (this.options.speech) out.push({ type: 'say', text: spokenMove(e.note.san) });
      }
    }
    const phase = this.trainer.view.phase;
    if (this.queued !== undefined && (phase === 'ask' || phase === 'teach')) {
      const when = this.queued;
      this.queued = undefined;
      if (now - when <= QUEUE_MS) out.push(...this.press('next', now));
    }
    return out;
  }
}
