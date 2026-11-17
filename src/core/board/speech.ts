// What a game on the Chessnut Move says (CHESSNUT.md §4.10, §5.4): the opponent's moves as they
// come, and the study move when the repertoire check takes the user's back. Pure: the game's
// state in, the words and what has been heard out; src/app/boardSpeech.ts says them. A storm
// verdict's words, and a repertoire session's (PLAN.md §5.192), are here too.
import { moveToSpeech } from '../games/voice.ts';

/** The parts of a game the words come from (a practice game has them all). */
export interface SpokenGame {
  /** The game's setup: a new one (a new game, or one resumed) is a new game here. */
  setup: unknown;
  moves: readonly { isUser: boolean; san: string }[];
  /** The repertoire check's refusal, while the screen names the study move. */
  deviation?: { repSan: string } | undefined;
}

/** What has been looked at so far: the game, how many of its moves, its refusal. */
export interface Heard {
  setup?: unknown;
  moves: number;
  deviation?: unknown;
}

export const NOTHING_HEARD: Heard = { moves: 0 };

/**
 * The words for what changed in the game since `heard`, and what is heard now. A game seen for the
 * first time says nothing of the moves it has already; moves taken back are forgotten, so the
 * opponent's answer after them is said again.
 */
export function spokenFor(heard: Heard, g: SpokenGame | undefined): [string[], Heard] {
  if (!g) return [[], NOTHING_HEARD];
  const now: Heard = { setup: g.setup, moves: g.moves.length, deviation: g.deviation };
  if (heard.setup !== g.setup) return [[], now];
  // A take-back shortens the moves; `heard` then holds the shorter count, and what comes after is new.
  const out = g.moves
    .slice(heard.moves)
    .filter((m) => !m.isUser)
    .map((m) => moveToSpeech(m.san));
  if (g.deviation && g.deviation !== heard.deviation) out.push(`Not your repertoire. The study move is ${moveToSpeech(g.deviation.repSan)}.`);
  return [out, now];
}

/** A storm verdict's parts the words come from (CHESSNUT.md §5.2). */
export interface SpokenVerdict {
  /** The band ('great' … 'blunder', 'unknown'). */
  band: string;
  /** The top move was played. */
  top: boolean;
  /** A puzzle: solved or not, nothing more. */
  puzzle?: boolean | undefined;
  /** The best move (SAN), said when it wasn't played and the screen shows it. */
  bestSan?: string | undefined;
}

const BAND_SAID: Record<string, string> = { great: 'Great', good: 'Good', ok: 'Inaccuracy', bad: 'Mistake', blunder: 'Blunder', unknown: 'No verdict' };

/**
 * What a storm card says after a move read from the board: the band's word, and the best move when
 * another was played and the screen names it (a held set card keeps it hidden, so its caller leaves
 * `bestSan` out). A puzzle says only whether it was solved.
 */
export function verdictSpeech(v: SpokenVerdict): string {
  if (v.puzzle) return v.band === 'great' ? 'Solved.' : 'Not the solution.';
  if (v.top) return 'Best move.';
  const word = BAND_SAID[v.band];
  if (!word) return '';
  return v.bestSan ? `${word}. The best move was ${moveToSpeech(v.bestSan)}.` : `${word}.`;
}

/** The trainer's effects the words come from (src/core/train/trainer.ts; show and grade's own are passed over). */
type SessionEffect =
  | { type: 'play'; san: string; by: 'opponent' | 'auto' | 'user' | 'preview' }
  | { type: 'note'; note: { kind: string; san?: string; count?: number; pass?: number; of?: number } }
  | { type: string };

/**
 * What a repertoire session says on the board after a step (PLAN.md §5.192): each move played for
 * the user (the opponent's, an own move not asked, a sequence shown), then what the feedback line
 * asks of the user (a wrong move, the move shown, a new move), then a line's or the session's end.
 * The user's own right move says nothing: the opponent's answer follows it. `shown`: show and
 * grade, where a move shown is named, not asked for.
 */
export function sessionSpeech(effects: readonly SessionEffect[], o: { shown?: boolean } = {}): string {
  const out: string[] = [];
  let end: string | undefined;
  for (const e of effects) {
    if (e.type === 'play' && 'by' in e) {
      if (e.by !== 'user') out.push(`${moveToSpeech(e.san)}.`);
    } else if (e.type === 'note' && 'note' in e) {
      const words = noteSpeech(e.note, o.shown === true);
      if (words) out.push(words);
    } else if (e.type === 'lineDone') end ??= 'Line done.';
    else if (e.type === 'done') end = 'Session done.';
  }
  if (end) out.push(end);
  return out.join(' ');
}

function noteSpeech(note: { kind: string; san?: string; count?: number; pass?: number; of?: number }, shown: boolean): string {
  const move = note.san === undefined ? '' : moveToSpeech(note.san);
  switch (note.kind) {
    case 'wrong':
      return 'Not in your repertoire. Try again.';
    case 'shown':
      return shown ? `${move}.` : `Play ${move}.`;
    case 'newMove':
      return shown ? `New move: ${move}.` : `New move: play ${move}.`;
    case 'newTry':
      return 'A new move: find it.';
    case 'sequence':
      return note.count === 1 ? 'A new move: watch it, then play it.' : `${note.count} new moves: watch them, then play them.`;
    case 'alsoPlays':
      return 'Also in your repertoire. It has another move here: find it.';
    case 'alternative':
      return `${move} is a good alternative, but your repertoire plays something else. Try again.`;
    case 'retryMistakes':
      return note.count === 1 ? 'Your mistake again.' : `Your ${note.count} mistakes again.`;
    case 'repeat':
      return `The line again, ${note.pass} of ${note.of}.`;
    case 'missedAgain':
      return 'Missed earlier: once more.';
    case 'replay':
      return 'The line again, nothing graded.';
    case 'asideWrong':
      return 'Not the comment’s move. Try again.';
    case 'asideAlso':
      return 'The comments play that here too, in another line. Find this one’s.';
    default:
      return '';
  }
}
