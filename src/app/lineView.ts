// An engine's line on a board (mistake-lab's Show line and Show refutation, `showReviewBestLine`,
// `showReviewRefutation`): the best move from the position before a move and Stockfish's line
// after it, the move played and the opponent's best answer to it, or the move played and the line
// after it, as the game cards' engine line (`core/games/engineLine.ts`): stepped with ← →, extended
// past its end by a search there, branched by a move on the board. Each screen that shows one keeps
// its own (`lineView`), over its own searches: the practice game's review (`reviewLine.ts`) and the
// storm's card (PLAN.md §5.154).
import { signal, type Signal } from '@preact/signals';
import { addBranch, branch, buildEngineLine, endFen, extend, goTo, goToAlt, goToMain, step, type EngineLine } from '../core/games/engineLine.ts';
import { moverScore } from '../core/games/grade.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { fenOf, positionOf } from '../core/storm/walk.ts';

/** The plies of a line (mistake-lab's: the best move and nine, the refutation's ten). */
export const LINE_PLY = 10;

export interface ShownLine {
  /** The best move's line, a move's refutation, or the line after a move played (§5.154). */
  kind: 'best' | 'refutation' | 'after';
  /** Who opened it (a review's move, a storm card's answer), so a late search lands nowhere else. */
  about: string;
  /** The move refuted, or the best move, or the move played. */
  san: string;
  /** Undefined while the first search runs, or when Stockfish gave no line. */
  line?: EngineLine;
  /** A search is running: the first, a branch (`pendingFen` on the board) or an extension. */
  busy: boolean;
  pendingFen?: string;
}

/** A position's search: its lines, best first, each with its moves (UCI) and score. */
export type LineSearch = (fen: string, lines: number) => Promise<{ lines: readonly { pv: readonly string[]; score: { cp?: number; mate?: number } }[] } | null>;

export interface LineView {
  view: Signal<ShownLine | undefined>;
  /** The best move from `fenBefore` (the judge's, else Stockfish's) and the line after it, opened on the move. */
  showBest(about: string, fenBefore: string, bestUci: string | undefined, san: string): void;
  /** The move played from `fenBefore` and the opponent's best answer, opened on the answer. */
  showRefutation(about: string, fenBefore: string, uci: string, san: string): void;
  /** The move played from `fenBefore` and Stockfish's line after it, opened on the move. */
  showAfter(about: string, fenBefore: string, uci: string, san: string): void;
  close(): void;
  /** ← or →: past the end the line is extended by a search there. */
  step(delta: number): void;
  toMain(idx: number): void;
  toAlt(alt: number, idx: number): void;
  /** A move on the board while the line is shown: along the line, or a new branch searched by Stockfish. */
  move(uci: string): void;
}

const whiteCp = (l: { score: { cp?: number; mate?: number } } | undefined): number | null => (l ? moverScore(l.score, 'white') : null);

function after(fen: string, uci: string): string | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  pos.play(move);
  return fenOf(pos);
}

export function lineView(analyse: LineSearch, plies = LINE_PLY): LineView {
  const view = signal<ShownLine | undefined>(undefined);
  let token = 0;

  const open = (kind: ShownLine['kind'], about: string, san: string, build: () => Promise<EngineLine | undefined>): void => {
    const t = ++token;
    view.value = { kind, about, san, busy: true };
    void build().then((line) => {
      if (t !== token) return;
      view.value = { kind, about, san, busy: false, ...(line ? { line } : {}) };
      if (line) prepareExtension(line);
    });
  };

  /** The move from `fenBefore` and the search after it, opened at `startIdx`. */
  const moveLine = (kind: ShownLine['kind'], about: string, fenBefore: string, uci: string, san: string, startIdx: number): void =>
    open(kind, about, san, async () => {
      const fen = after(fenBefore, uci);
      const b = fen ? (await analyse(fen, 1))?.lines[0] : undefined;
      return buildEngineLine(fenBefore, uci, b?.pv ?? [], whiteCp(b), { plies: plies + startIdx, startIdx });
    });

  const setLine = (line: EngineLine, extra: Partial<ShownLine> = {}): void => {
    const r = view.peek();
    if (!r?.line) return;
    const { pendingFen: _pending, ...rest } = r;
    view.value = { ...rest, line, ...extra };
  };

  /** The search at the line's end, started ahead of a step past it. */
  const prepareExtension = (line: EngineLine): void => {
    const end = endFen(line);
    if (end) void analyse(end, 1);
  };

  return {
    view,
    showBest(about, fenBefore, bestUci, san) {
      open('best', about, san, async () => {
        const a = await analyse(fenBefore, 3);
        const best = a?.lines[0];
        const uci = bestUci || best?.pv[0];
        if (!uci) return undefined;
        if (best && best.pv[0] === uci) return buildEngineLine(fenBefore, uci, best.pv.slice(1), whiteCp(best), { plies, startIdx: 0 });
        const fen = after(fenBefore, uci);
        const b = fen ? (await analyse(fen, 1))?.lines[0] : undefined;
        return buildEngineLine(fenBefore, uci, b?.pv ?? [], whiteCp(b), { plies, startIdx: 0 });
      });
    },
    showRefutation: (about, fenBefore, uci, san) => moveLine('refutation', about, fenBefore, uci, san, 1),
    showAfter: (about, fenBefore, uci, san) => moveLine('after', about, fenBefore, uci, san, 0),
    close() {
      token++;
      view.value = undefined;
    },
    step(delta) {
      const r = view.peek();
      if (!r?.line) return;
      const st = step(r.line, delta);
      if (st.kind === 'go') return setLine(st.line);
      if (st.kind !== 'extend' || r.busy) return;
      const end = endFen(r.line);
      if (!end) return;
      const t = token;
      setLine(r.line, { busy: true });
      void analyse(end, 1).then((a) => {
        const now = view.peek();
        if (t !== token || !now?.line) return;
        const best = a?.lines[0];
        const line = best ? extend(now.line, end, best.pv, whiteCp(best)) : now.line;
        setLine(line, { busy: false });
        if (line !== now.line) prepareExtension(line);
      });
    },
    toMain(idx) {
      const l = view.peek()?.line;
      if (l) setLine(goToMain(l, idx));
    },
    toAlt(alt, idx) {
      const l = view.peek()?.line;
      if (l) setLine(goToAlt(l, alt, idx));
    },
    move(uci) {
      const r = view.peek();
      if (!r?.line || r.busy) return;
      const b = branch(r.line, uci);
      if (b.kind === 'illegal') return;
      const t = token;
      if (b.kind === 'follow') {
        setLine(b.line);
        const reply = b.reply;
        if (reply !== undefined)
          setTimeout(() => {
            const now = view.peek()?.line;
            if (t === token && now && now.currentIdx === b.line.currentIdx && now.activeAlt === b.line.activeAlt) setLine(goTo(now, reply));
          }, 400);
        return;
      }
      setLine(r.line, { busy: true, pendingFen: b.fen });
      void analyse(b.fen, 1).then((a) => {
        const now = view.peek();
        if (t !== token || !now?.line) return;
        const best = a?.lines[0];
        const line = addBranch(now.line, b, best?.pv ?? [], whiteCp(best));
        setLine(line, { busy: false });
        prepareExtension(line);
      });
    },
  };
}
