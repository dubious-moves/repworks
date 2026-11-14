// What a game on the Chessnut Move says (CHESSNUT.md §4.10, §5.4): the opponent's moves as they
// come, and the study move when the repertoire check takes the user's back. Pure: the game's
// state in, the words and what has been heard out; src/app/boardSpeech.ts says them.
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
