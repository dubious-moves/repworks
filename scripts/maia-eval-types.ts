// What scripts/maia-eval.ts samples (PLAN.md §5.190).

/** The positions before the asked one that a sample keeps (the 23M model reads seven). */
export const BEFORE_KEPT = 7;

export interface EvalPosition {
  /** The Lichess game's id. */
  game: string;
  /** `rapid`, `classical`, `blitz`. */
  speed: string;
  /** The rating band's centre (the mover's rating is within its width). */
  band: number;
  /** The ply of the move asked about (0 = White's first). */
  ply: number;
  fen: string;
  /** The positions before it in the game, oldest first (up to seven, fewer at the game's start). */
  before: string[];
  /** The move the mover played (UCI, standard castling). */
  played: string;
  /** The mover's rating and the opponent's. */
  elo: number;
  oppo: number;
}
