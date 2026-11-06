// The engine's lines in a practice game's review (mistake-lab's Show line and Show refutation,
// `showReviewBestLine`, `showReviewRefutation`): the best move from the position before a move
// and Stockfish's line after it, or the move played and the opponent's best answer to it, ten
// plies, as the game cards' engine line: stepped with ← →, extended past its end by a search
// there, branched by a move on the board. The viewer is `lineView.ts`'s, over practice's searches.
import { lineView, LINE_PLY, type ShownLine } from './lineView.ts';
import { analyse } from './practice.ts';

/** The plies of a review's line (mistake-lab's: the best move and nine, the refutation's ten). */
export const REVIEW_LINE_PLY = LINE_PLY;

export type ReviewLine = ShownLine;

const lines = lineView(analyse, REVIEW_LINE_PLY);

export const reviewLine = lines.view;
export const showBestLine = lines.showBest;
export const showRefutation = lines.showRefutation;
export const closeReviewLine = lines.close;
export const reviewLineStep = lines.step;
export const reviewLineToMain = lines.toMain;
export const reviewLineToAlt = lines.toAlt;
export const reviewLineMove = lines.move;
