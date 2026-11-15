// The endgame tablebase's verdict on a move (PLAN.md §5.187): Lichess's tablebase
// (tablebase.lichess.ovh, Syzygy with 7 pieces) says of a position with at most seven pieces
// whether it is won, drawn or lost, and the same of every move from it, exactly; an endgame's
// move is judged by that where it answers, in place of Stockfish's score against a line
// (`GOAL_CP`). Pure: the URL, the answer read, the rule. The fetch is the platform's.

import type { Goal } from './endgames.ts';

/** The most pieces on the board, kings among them, the tablebase answers for. */
export const TABLEBASE_PIECES = 7;

export const TABLEBASE_URL = 'https://tablebase.lichess.ovh/standard';

/** How the game ends with best play, for the side the verdict is about, the fifty-move rule counted. */
export type Outcome = 'win' | 'draw' | 'loss';

/** A position as the tablebase has it: for the side to move, and each move's outcome for that same side, best first. */
export interface TablebasePosition {
  outcome: Outcome;
  moves: { uci: string; outcome: Outcome }[];
}

/** The tablebase's verdict on a move: the best outcome there was, and the move's; both for the mover. */
export interface TablebaseVerdict {
  best: Outcome;
  after: Outcome;
}

/** The pieces on a FEN's board. */
export function pieceCount(fen: string): number {
  let n = 0;
  for (const c of fen.split(' ')[0] ?? '') if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) n++;
  return n;
}

/** Whether the tablebase has this position: few enough pieces, and no castling left (Syzygy has none). */
export function inTablebase(fen: string): boolean {
  const n = pieceCount(fen);
  const castling = fen.split(' ')[2] ?? '-';
  return n >= 2 && n <= TABLEBASE_PIECES && castling === '-';
}

export const tablebaseUrl = (fen: string): string => `${TABLEBASE_URL}?fen=${fen.trim().replace(/ /g, '_')}`;

/**
 * A category of the tablebase's as an outcome under the fifty-move rule: a cursed win and a
 * blessed loss are draws; "maybe" (the rule may or may not come first, the counter not at zero)
 * is taken as the win or the loss it is without the rule; "unknown" is none.
 */
export function outcomeOf(category: unknown): Outcome | undefined {
  switch (category) {
    case 'win':
    case 'syzygy-win':
    case 'maybe-win':
      return 'win';
    case 'cursed-win':
    case 'draw':
    case 'blessed-loss':
      return 'draw';
    case 'loss':
    case 'syzygy-loss':
    case 'maybe-loss':
      return 'loss';
    default:
      return undefined;
  }
}

const FLIP: Record<Outcome, Outcome> = { win: 'loss', draw: 'draw', loss: 'win' };

/**
 * The tablebase's JSON read: undefined when it isn't an answer, or says "unknown" of the
 * position. A move's category there is the other side's (the one to move after it), turned here
 * to the mover's; a move it doesn't know is left out.
 */
export function readTablebase(json: unknown): TablebasePosition | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const j = json as { category?: unknown; moves?: unknown };
  const outcome = outcomeOf(j.category);
  if (!outcome || !Array.isArray(j.moves)) return undefined;
  const moves: TablebasePosition['moves'] = [];
  for (const m of j.moves as { uci?: unknown; category?: unknown }[]) {
    const o = outcomeOf(m?.category);
    if (typeof m?.uci === 'string' && o) moves.push({ uci: m.uci, outcome: FLIP[o] });
  }
  return { outcome, moves };
}

/** The verdict on `uci` played from the position; undefined when the tablebase doesn't know the move. */
export function tablebaseVerdict(pos: TablebasePosition, uci: string): TablebaseVerdict | undefined {
  const m = pos.moves.find((x) => x.uci === uci);
  return m && { best: pos.outcome, after: m.outcome };
}

/** Whether an outcome keeps the goal: a win is a win, a draw is anything but a loss. */
export const outcomeKeeps = (goal: Goal, o: Outcome): boolean => (goal === 'win' ? o === 'win' : o !== 'loss');

/** A move that throws the goal away, by the tablebase: there to keep before it, gone after it. */
export const tablebaseSlips = (goal: Goal, v: TablebaseVerdict): boolean => outcomeKeeps(goal, v.best) && !outcomeKeeps(goal, v.after);

/** The moves from the position that keep the goal, the tablebase's best first. */
export const keepingMoves = (goal: Goal, pos: TablebasePosition): string[] => pos.moves.filter((m) => outcomeKeeps(goal, m.outcome)).map((m) => m.uci);
