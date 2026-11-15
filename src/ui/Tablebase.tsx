// Lichess's tablebase on the analysis board (PLAN.md §5.189): when the board's position has seven
// pieces or fewer (and no castling right), a row under the engine's lines says how the game ends
// with best play, and lists every move with its outcome, best first; a move there plays on the board.
import { useEffect, useState } from 'preact/hooks';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { play } from '../app/editor.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { inTablebase, mateAfter, mateIn, type Fifty, type Outcome, type TablebaseMove, type TablebasePosition } from '../core/endgames/tablebase.ts';
import { tablebase } from '../platform/tablebase.ts';

const WORD: Record<Outcome, string> = { win: 'win', draw: 'draw', loss: 'loss' };

/** Whether the tablebase answers for the board's position: a game still on, with few enough pieces. */
export const tablebaseFor = (board: Position | undefined): string | undefined => {
  if (!board || board.isEnd()) return undefined;
  const fen = makeFen(board.toSetup());
  return inTablebase(fen) ? fen : undefined;
};

const colorName = (c: 'white' | 'black') => (c === 'white' ? 'White' : 'Black');

/** The position's verdict in words, for the side to move `turn`. */
export function verdictText(pos: TablebasePosition, turn: 'white' | 'black'): string {
  const mover = colorName(turn);
  const other = colorName(turn === 'white' ? 'black' : 'white');
  const mate = pos.dtm !== undefined ? `, mate in ${mateIn(pos.dtm)}` : '';
  const fifty = (f: Fifty | undefined): string | undefined =>
    f === 'cursed-win' ? `Draw: ${mover}’s win is cursed, the fifty-move rule saves ${other}` : f === 'blessed-loss' ? `Draw: ${mover}’s loss is blessed, the fifty-move rule saves ${mover}` : undefined;
  if (pos.outcome === 'draw') return fifty(pos.fifty) ?? 'Draw';
  const maybe = pos.fifty === 'maybe' ? ' unless the fifty-move rule comes first' : '';
  return pos.outcome === 'win' ? `${mover} wins${mate}${maybe}` : `${other} wins${mate}${maybe}`;
}

/** What a move comes to, short: its outcome for the mover and, where the tablebase has it, the moves to mate. */
export function moveText(m: TablebaseMove): string {
  if (m.mate) return 'mate';
  const word = m.fifty === 'cursed-win' ? 'cursed win' : m.fifty === 'blessed-loss' ? 'blessed loss' : WORD[m.outcome];
  if (m.dtm !== undefined) return `${word} · M${mateAfter(m.dtm)}`;
  return word;
}

export function TablebaseRow(props: { board: Position | undefined }) {
  const fen = tablebaseFor(props.board);
  const [got, setGot] = useState<{ fen: string; pos: TablebasePosition | undefined } | undefined>(undefined);
  useEffect(() => {
    if (!fen) return;
    let live = true;
    void tablebase(fen).then((pos) => live && setGot({ fen, pos }));
    return () => {
      live = false;
    };
  }, [fen]);
  const board = props.board;
  if (!fen || !board) return null;
  const answer = got?.fen === fen ? got : undefined;
  if (!answer || !answer.pos) {
    return (
      <div class="tb-row muted" aria-label="Tablebase" data-testid="tablebase" data-state={answer ? 'none' : 'loading'}>
        <span class="tb-tag">Tablebase</span> {answer ? 'No answer (offline, or Lichess’s tablebase is busy)' : '…'}
      </div>
    );
  }
  const pos = answer.pos;
  const side = board.turn;
  // A win or a loss as a side's, for the colour of the verdict.
  const winner = pos.outcome === 'draw' ? 'even' : (pos.outcome === 'win') === (side === 'white') ? 'white' : 'black';
  const moves = pos.moves.flatMap((m) => {
    const move = parseUciMove(board, m.uci);
    return move ? [{ ...m, san: makeSan(board, move) }] : [];
  });
  return (
    <div class="tb-row" aria-label="Tablebase" data-testid="tablebase" data-state="answered">
      <div class="tb-head">
        <span class="tb-tag">Tablebase</span>
        <span class={`tb-verdict ${winner}`} data-testid="tablebase-verdict" title={pos.dtz !== undefined ? `Distance to zeroing (DTZ): ${pos.dtz} plies` : undefined}>
          {verdictText(pos, side)}
        </span>
      </div>
      <ul class="tb-moves" aria-label="Tablebase moves">
        {moves.map((m) => (
          <li key={m.uci}>
            <button type="button" class={`tb-move ${m.outcome}`} data-uci={m.uci} title={`Play ${m.san}`} onClick={() => play(m.san)}>
              <span class="tb-san">{m.san}</span> <span class="tb-result">{moveText(m)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
