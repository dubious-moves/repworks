// The board (PLAN.md §4.11): a Preact wrapper around chessground, with cburnett pieces from its
// own CSS. Moves come from chessops's legal destinations. Arrows: right-drag on the desktop,
// with chessground's own modifiers (Shift or Ctrl red, Alt blue, both yellow). chessground
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
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { SquareName } from 'chessops/types';
import type { Brush, Shape } from '../core/study/model.ts';
import { toggleShape } from '../core/study/ops.ts';

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
  onShapes(shapes: Shape[]): void;
  /** Shapes drawn but not the chapter's (the engine's arrows, §5.31). */
  autoShapes?: readonly { orig: string; dest?: string; brush: string; lineWidth?: number }[];
}

const BRUSHES: readonly string[] = ['green', 'red', 'blue', 'yellow'];

const toDraw = (shapes: readonly Shape[]): DrawShape[] => shapes.map((s) => ({ orig: s.orig, ...(s.dest ? { dest: s.dest } : {}), brush: s.brush }));
const fromDraw = (shapes: readonly DrawShape[]): Shape[] =>
  shapes.filter((s) => s.brush && BRUSHES.includes(s.brush)).map((s) => ({ brush: s.brush as Brush, orig: s.orig as SquareName, ...(s.dest ? { dest: s.dest as SquareName } : {}) }));

function config(p: BoardProps): Config {
  return {
    fen: p.fen,
    orientation: p.orientation,
    turnColor: p.turn,
    check: p.check,
    lastMove: p.lastMove,
    movable: { free: false, color: p.dests.size && !p.drawMode ? p.turn : undefined, dests: p.dests, showDests: true },
    draggable: { enabled: !p.drawMode },
    selectable: { enabled: !p.drawMode },
    drawable: {
      shapes: toDraw(p.shapes),
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

  useEffect(() => {
    // Whether the gesture in progress draws: chessground draws on a right button, or with Shift.
    let drawing = false;
    const board: Api = Chessground(el.current!, {
      ...config(props.current),
      animation: { duration: 150 },
      highlight: { lastMove: true, check: true },
      drawable: {
        enabled: true,
        eraseOnMovablePieceClick: false,
        shapes: toDraw(props.current.shapes),
        onChange: (shapes) => {
          // chessground also clears the shapes on a left click; here only drawing changes them,
          // so a click to move a piece never deletes a move's arrows.
          if (!drawing) return void board.set({ drawable: { shapes: toDraw(props.current.shapes) } });
          drawing = false;
          props.current.onShapes(fromDraw(shapes));
        },
      },
      movable: { ...config(props.current).movable, events: { after: (orig, dest) => props.current.onMove(orig, dest) } },
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
        props.current.onShapes(toggleShape(props.current.shapes, shape));
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
    api.current?.set(config(p));
  });

  return (
    <div class={`board${p.drawMode ? ' board-draw' : ''}`} ref={wrap}>
      <div class="cg-host" ref={el} />
    </div>
  );
}
