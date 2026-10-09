// The board (PLAN.md §4.11): a Preact wrapper around chessground, with cburnett pieces from its
// own CSS. Moves come from chessops's legal destinations. Arrows: right-drag on the desktop,
// with chessground's own modifiers (Shift or Ctrl red, Alt blue, both yellow), and a left click
// clears them as on Lichess (a click that moves a piece never does). chessground
// starts drawing only on a right button or Shift, so on the phone a draw mode turns a drag into
// an arrow and a tap into a circle: those touches are caught before chessground sees them.
import { Chessground } from '@lichess-org/chessground';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { createElement } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { Role, SquareName } from 'chessops/types';
import type { Brush, Shape } from '../core/study/model.ts';
import { toggleShape } from '../core/study/ops.ts';
import { BOARD_MAX, BOARD_MIN, boardSize, setBoardSize } from '../app/boardSize.ts';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  turn: 'white' | 'black';
  /** Legal moves; empty when the board is only shown. */
  dests: Map<Key, Key[]>;
  lastMove: [Key, Key] | undefined;
  check: boolean;
  shapes: readonly Shape[];
  drawMode: boolean;
  brush: Brush;
  onMove(orig: Key, dest: Key): void;
  /**
   * What is drawn or cleared, for a board whose `shapes` the user edits (a chapter's). Without it
   * `shapes` are only shown: arrows drawn over them last until the next render or a left click,
   * which clears those and leaves `shapes`.
   */
  onShapes?(shapes: Shape[]): void;
  /** Shapes drawn but not the chapter's (the engine's arrows, §5.31). */
  autoShapes?: readonly { orig: string; dest?: string; brush: string; lineWidth?: number }[];
  /** A move's classification on its square's corner (a game's review: mistake-lab's badge). */
  badge?: { square: string; symbol: string; colour: string; word: string } | undefined;
  /** Premoves for `color` while the other side is to move (a practice game): the one set, and its events. */
  premove?: { color: 'white' | 'black'; current: [Key, Key] | undefined; onSet(orig: Key, dest: Key): void; onUnset(): void };
  /**
   * Arrows and circles drawn to think with, kept by the board itself until this key changes (a
   * storm's card) or a left click clears them: `shapes` and `onShapes` are then not used.
   */
  sketchKey?: string;
  /**
   * A pawn's promotion being chosen, as on Lichess: the four pieces in a column on its square's
   * file, over a dimmed board. A piece picks; a click elsewhere or Escape gives no piece. The
   * pawn waits on its square meanwhile.
   */
  promotion?: { dest: Key; onPick(role: Role | undefined): void } | undefined;
}

const BRUSHES: readonly string[] = ['green', 'red', 'blue', 'yellow'];

const toDraw = (shapes: readonly Shape[]): DrawShape[] => shapes.map((s) => ({ orig: s.orig, ...(s.dest ? { dest: s.dest } : {}), brush: s.brush }));
const fromDraw = (shapes: readonly DrawShape[]): Shape[] =>
  shapes.filter((s) => s.brush && BRUSHES.includes(s.brush)).map((s) => ({ brush: s.brush as Brush, orig: s.orig as SquareName, ...(s.dest ? { dest: s.dest as SquareName } : {}) }));

function config(p: BoardProps, drawn: DrawShape[]): Config {
  return {
    fen: p.fen,
    orientation: p.orientation,
    turnColor: p.turn,
    check: p.check,
    lastMove: p.lastMove,
    movable: { free: false, color: p.drawMode ? undefined : p.dests.size ? p.turn : p.premove && p.premove.color !== p.turn ? p.premove.color : undefined, dests: p.dests, showDests: true },
    premovable: { enabled: !!p.premove, showDests: true },
    draggable: { enabled: !p.drawMode },
    selectable: { enabled: !p.drawMode },
    drawable: {
      shapes: drawn,
      // A press on a piece that can move picks it up; on a board that only shows, any press clears.
      eraseOnMovablePieceClick: !p.dests.size && !p.premove,
      autoShapes: (p.autoShapes ?? []).map((a) => ({ orig: a.orig as Key, ...(a.dest ? { dest: a.dest as Key } : {}), brush: a.brush, ...(a.lineWidth ? { modifiers: { lineWidth: a.lineWidth } } : {}) })),
    },
  };
}

type Mouch = MouseEvent | TouchEvent;
const point = (e: Mouch): [number, number] | undefined => {
  if ('changedTouches' in e) {
    const t = e.changedTouches[0];
    return t ? [t.clientX, t.clientY] : undefined;
  }
  return [e.clientX, e.clientY];
};

export function Board(p: BoardProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const props = useRef(p);
  props.current = p;
  // The sketch (`sketchKey`): what was drawn on this key, dropped when the key changes.
  const sketch = useRef<{ key: string | undefined; shapes: Shape[] }>({ key: p.sketchKey, shapes: [] });
  if (sketch.current.key !== p.sketchKey) sketch.current = { key: p.sketchKey, shapes: [] };
  const own = (q: BoardProps): readonly Shape[] => (q.sketchKey !== undefined ? sketch.current.shapes : q.shapes);
  const shapesChanged = (next: Shape[]) => {
    if (props.current.sketchKey !== undefined) {
      sketch.current.shapes = next;
      api.current?.set({ drawable: { shapes: toDraw(next) } });
    } else props.current.onShapes?.(next);
  };

  useEffect(() => {
    // Whether the gesture in progress draws: chessground draws on a right button, or with Shift.
    let drawing = false;
    const board: Api = Chessground(el.current!, {
      ...config(props.current, toDraw(own(props.current))),
      animation: { duration: 150 },
      highlight: { lastMove: true, check: true },
      drawable: {
        ...config(props.current, toDraw(own(props.current))).drawable,
        enabled: true,
        onChange: (shapes) => {
          if (drawing) {
            drawing = false;
            return shapesChanged(fromDraw(shapes));
          }
          // A left click cleared them (chessground's own: not on a press that picks up a piece,
          // nor on the square a selected piece moves to). Shapes only shown come back.
          if (props.current.sketchKey !== undefined || props.current.onShapes) shapesChanged([]);
          else board.set({ drawable: { shapes: toDraw(own(props.current)) } });
        },
      },
      movable: { ...config(props.current, []).movable, events: { after: (orig, dest) => props.current.onMove(orig, dest) } },
      premovable: { ...config(props.current, []).premovable, events: { set: (orig, dest) => props.current.premove?.onSet(orig, dest), unset: () => props.current.premove?.onUnset() } },
    });
    api.current = board;

    // Draw mode: a touch or click on the board draws instead of moving.
    const keyAt = (e: Mouch) => {
      const at = point(e);
      return at ? board.getKeyAtDomPos(at) : undefined;
    };
    const start = (e: Mouch) => {
      // chessground keeps the board's place on screen until a scroll or resize event, which
      // arrives a frame late, and never hears of a banner opening above the board. Measured
      // again on each press, a press always lands on the square under it.
      board.state.dom.bounds.clear();
      drawing = 'button' in e && (e.button === 2 || e.shiftKey);
      if (!props.current.drawMode) return;
      e.preventDefault();
      e.stopPropagation();
      const orig = keyAt(e);
      if (!orig) return;
      let dest: Key | undefined = orig;
      const brush = props.current.brush;
      const moved = (m: Mouch) => {
        m.preventDefault();
        dest = keyAt(m) ?? dest;
        board.setAutoShapes([{ orig, ...(dest !== orig ? { dest } : {}), brush }]);
      };
      const ended = (m: Mouch) => {
        dest = keyAt(m) ?? dest;
        for (const [name, f] of listeners) document.removeEventListener(name, f as EventListener);
        board.setAutoShapes([]);
        // getKeyAtDomPos only gives squares on the board.
        const shape: Shape = { brush, orig: orig as SquareName, ...(dest && dest !== orig ? { dest: dest as SquareName } : {}) };
        shapesChanged(toggleShape(own(props.current), shape));
      };
      const listeners: [string, (m: Mouch) => void][] = [
        ['mousemove', moved],
        ['touchmove', moved],
        ['mouseup', ended],
        ['touchend', ended],
      ];
      for (const [name, f] of listeners) document.addEventListener(name, f as EventListener, { passive: false });
    };
    const node = wrap.current!;
    node.addEventListener('mousedown', start, { capture: true, passive: false });
    node.addEventListener('touchstart', start, { capture: true, passive: false });
    return () => {
      node.removeEventListener('mousedown', start, { capture: true });
      node.removeEventListener('touchstart', start, { capture: true });
      board.destroy();
    };
  }, []);

  // In the same commit as the rest of the view, so the board never shows a position the
  // notation has already left.
  useLayoutEffect(() => {
    const c = config(p, toDraw(own(p)));
    // While a promotion is chosen the pawn stays where it was dropped, and nothing else moves.
    if (p.promotion) {
      delete c.fen;
      delete c.lastMove;
      c.movable = { color: undefined };
    }
    api.current?.set(c);
    // A premove played or dropped by the game is taken off the board too.
    if (api.current?.state.premovable.current && !p.premove?.current) api.current.cancelPremove();
  });

  return (
    <div class={`board${p.drawMode ? ' board-draw' : ''}`} ref={wrap}>
      <div class="cg-host" ref={el} />
      {p.badge && <Badge {...p.badge} orientation={p.orientation} />}
      {p.promotion && <PromotionChoice {...p.promotion} orientation={p.orientation} />}
      <Resize board={wrap} />
    </div>
  );
}

/**
 * The board's size (src/app/boardSize.ts), set from its corner as on Lichess: dragged, or with the
 * arrow keys once focused; a double click gives back the largest the window fits. Shown only on
 * the boards a page is built around (app.css), which all take the one size.
 */
function Resize(props: { board: { current: HTMLDivElement | null } }) {
  const side = () => props.board.current!.getBoundingClientRect().width;
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const from = side();
    const [x0, y0] = [e.clientX, e.clientY];
    const move = (m: PointerEvent) => {
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      setBoardSize(from + (Math.abs(dx) > Math.abs(dy) ? dx : dy), false);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      // What the window lets it have, so a drag past the room left doesn't grow it on a bigger page.
      setBoardSize(side());
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowUp: 20, ArrowRight: 20, ArrowDown: -20, ArrowLeft: -20 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    setBoardSize(side() + step);
  };
  return (
    <span
      class="board-resize"
      role="slider"
      tabIndex={0}
      aria-label="Board size"
      aria-valuemin={BOARD_MIN}
      aria-valuemax={BOARD_MAX}
      {...(boardSize.value === undefined ? { 'aria-valuetext': 'As large as fits' } : { 'aria-valuenow': boardSize.value })}
      title="Drag to resize the board (double-click: as large as fits)"
      data-testid="board-resize"
      onPointerDown={onPointerDown}
      onDblClick={() => setBoardSize(undefined)}
      onKeyDown={onKeyDown}
    />
  );
}

/** Lichess's order, from the promotion square inward. */
const PROMOTION_ROLES: readonly Role[] = ['queen', 'knight', 'rook', 'bishop'];

/** The promotion picker (`BoardProps.promotion`): Lichess's, with the board's own piece set. */
function PromotionChoice(props: { dest: Key; onPick(role: Role | undefined): void; orientation: 'white' | 'black' }) {
  const color = props.dest[1] === '8' ? 'white' : 'black';
  const file = props.dest.charCodeAt(0) - 97;
  const col = props.orientation === 'white' ? file : 7 - file;
  // From the board's top edge down, or from its bottom edge up when the board is turned.
  const top = (props.orientation === 'white') === (color === 'white');
  const pick = useRef(props.onPick);
  pick.current = props.onPick;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      pick.current(undefined);
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, []);
  // Presses stay here: none reaches chessground under it.
  const stop = (e: Event) => e.stopPropagation();
  return (
    <div class="promotion-choice cg-wrap" role="dialog" aria-label="Promote to" data-testid="promotion" onMouseDown={stop} onTouchStart={stop} onClick={() => props.onPick(undefined)}>
      {PROMOTION_ROLES.map((role, i) => (
        <button
          key={role}
          type="button"
          class="promotion-square"
          aria-label={role}
          style={{ left: `${col * 12.5}%`, top: `${(top ? i : 7 - i) * 12.5}%` }}
          onClick={(e) => {
            e.stopPropagation();
            props.onPick(role);
          }}
        >
          {createElement('piece', { class: `${role} ${color}` })}
        </button>
      ))}
    </div>
  );
}

/** The badge at the square's top right corner, kept on the board at its edge. */
function Badge(props: { square: string; symbol: string; colour: string; word: string; orientation: 'white' | 'black' }) {
  const file = props.square.charCodeAt(0) - 97;
  const rank = Number(props.square[1]) - 1;
  if (!(file >= 0 && file < 8 && rank >= 0 && rank < 8)) return null;
  const col = props.orientation === 'white' ? file : 7 - file;
  const row = props.orientation === 'white' ? 7 - rank : rank;
  return (
    <span class="board-badge" data-testid="board-badge" title={props.word} aria-label={props.word} style={{ left: `${Math.min(col + 1, 7.8) * 12.5}%`, top: `${Math.max(row, 0.2) * 12.5}%`, background: props.colour }}>
      {props.symbol}
    </span>
  );
}
