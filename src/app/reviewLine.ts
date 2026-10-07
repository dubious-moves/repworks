// The engine's lines in a practice game's review (mistake-lab's Show line and Show refutation,
// `showReviewBestLine`, `showReviewRefutation`): the best move from the position before a move
// and Stockfish's line after it, or the move played and the opponent's best answer to it, ten
// plies, as the game cards' engine line (`core/games/engineLine.ts`): stepped with ← →, extended
// past its end by a search there, branched by a move on the board.
import { signal } from '@preact/signals';
import { addBranch, branch, buildEngineLine, endFen, extend, goTo, goToAlt, goToMain, step, type EngineLine } from '../core/games/engineLine.ts';
import { moverScore } from '../core/games/grade.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { fenOf, positionOf } from '../core/storm/walk.ts';
import { analyse } from './practice.ts';

/** The plies of a review's line (mistake-lab's: the best move and nine, the refutation's ten). */
export const REVIEW_LINE_PLY = 10;

export interface ReviewLine {
  kind: 'best' | 'refutation';
  /** Who opened it (the review's move, or its retry), so a late search lands nowhere else. */
  about: string;
  /** The move refuted, or the best move. */
  san: string;
  /** Undefined while the first search runs, or when Stockfish gave no line. */
  line?: EngineLine;
  /** A search is running: the first, a branch (`pendingFen` on the board) or an extension. */
  busy: boolean;
  pendingFen?: string;
}

export const reviewLine = signal<ReviewLine | undefined>(undefined);
let token = 0;

const whiteCp = (l: { score: { cp?: number; mate?: number } } | undefined): number | null => (l ? moverScore(l.score, 'white') : null);

function after(fen: string, uci: string): string | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  pos.play(move);
  return fenOf(pos);
}

function open(kind: ReviewLine['kind'], about: string, san: string, build: () => Promise<EngineLine | undefined>): void {
  const t = ++token;
  reviewLine.value = { kind, about, san, busy: true };
  void build().then((line) => {
    if (t !== token) return;
    reviewLine.value = { kind, about, san, busy: false, ...(line ? { line } : {}) };
    if (line) prepareExtension(line);
  });
}

/** The best move from `fenBefore` (the judge's, else Stockfish's) and the line after it, opened on the move. */
export function showBestLine(about: string, fenBefore: string, bestUci: string | undefined, san: string): void {
  open('best', about, san, async () => {
    const a = await analyse(fenBefore, 3);
    const best = a?.lines[0];
    const uci = bestUci || best?.pv[0];
    if (!uci) return undefined;
    if (best && best.pv[0] === uci) return buildEngineLine(fenBefore, uci, best.pv.slice(1), whiteCp(best), { plies: REVIEW_LINE_PLY, startIdx: 0 });
    const fen = after(fenBefore, uci);
    const b = fen ? (await analyse(fen, 1))?.lines[0] : undefined;
    return buildEngineLine(fenBefore, uci, b?.pv ?? [], whiteCp(b), { plies: REVIEW_LINE_PLY, startIdx: 0 });
  });
}

/** The move played from `fenBefore` and the opponent's best answer, opened on the answer. */
export function showRefutation(about: string, fenBefore: string, uci: string, san: string): void {
  open('refutation', about, san, async () => {
    const fen = after(fenBefore, uci);
    const b = fen ? (await analyse(fen, 1))?.lines[0] : undefined;
    return buildEngineLine(fenBefore, uci, b?.pv ?? [], whiteCp(b), { plies: REVIEW_LINE_PLY + 1, startIdx: 1 });
  });
}

export function closeReviewLine(): void {
  token++;
  reviewLine.value = undefined;
}

const setLine = (line: EngineLine, extra: Partial<ReviewLine> = {}): void => {
  const r = reviewLine.peek();
  if (!r?.line) return;
  const { pendingFen: _pending, ...rest } = r;
  reviewLine.value = { ...rest, line, ...extra };
};

/** The search at the line's end, started ahead of a step past it. */
function prepareExtension(line: EngineLine): void {
  const end = endFen(line);
  if (end) void analyse(end, 1);
}

/** ← or →: past the end the line is extended by a search there. */
export function reviewLineStep(delta: number): void {
  const r = reviewLine.peek();
  if (!r?.line) return;
  const st = step(r.line, delta);
  if (st.kind === 'go') return setLine(st.line);
  if (st.kind !== 'extend' || r.busy) return;
  const end = endFen(r.line);
  if (!end) return;
  const t = token;
  setLine(r.line, { busy: true });
  void analyse(end, 1).then((a) => {
    const now = reviewLine.peek();
    if (t !== token || !now?.line) return;
    const best = a?.lines[0];
    const line = best ? extend(now.line, end, best.pv, whiteCp(best)) : now.line;
    setLine(line, { busy: false });
    if (line !== now.line) prepareExtension(line);
  });
}

export function reviewLineToMain(idx: number): void {
  const l = reviewLine.peek()?.line;
  if (l) setLine(goToMain(l, idx));
}

export function reviewLineToAlt(alt: number, idx: number): void {
  const l = reviewLine.peek()?.line;
  if (l) setLine(goToAlt(l, alt, idx));
}

/** A move on the board while the line is shown: along the line, or a new branch searched by Stockfish. */
export function reviewLineMove(uci: string): void {
  const r = reviewLine.peek();
  if (!r?.line || r.busy) return;
  const b = branch(r.line, uci);
  if (b.kind === 'illegal') return;
  const t = token;
  if (b.kind === 'follow') {
    setLine(b.line);
    const reply = b.reply;
    if (reply !== undefined)
      setTimeout(() => {
        const now = reviewLine.peek()?.line;
        if (t === token && now && now.currentIdx === b.line.currentIdx && now.activeAlt === b.line.activeAlt) setLine(goTo(now, reply));
      }, 400);
    return;
  }
  setLine(r.line, { busy: true, pendingFen: b.fen });
  void analyse(b.fen, 1).then((a) => {
    const now = reviewLine.peek();
    if (t !== token || !now?.line) return;
    const best = a?.lines[0];
    const line = addBranch(now.line, b, best?.pv ?? [], whiteCp(best));
    setLine(line, { busy: false });
    prepareExtension(line);
  });
}
