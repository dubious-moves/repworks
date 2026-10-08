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
  /** A move's classification on its square's corner (a game's review: mistake-lab's badge). */
  badge?: { square: string; symbol: string; colour: string; word: string } | undefined;
  /** Premoves for `color` while the other side is to move (a practice game): the one set, and its events. */
  premove?: { color: 'white' | 'black'; current: [Key, Key] | undefined; onSet(orig: Key, dest: Key): void; onUnset(): void };
  /**
   * Arrows and circles drawn to think with, kept by the board itself until this key changes (a
   * storm's card): `shapes` and `onShapes` are then not used. Without it, what is drawn is the
   * owner's to keep through `onShapes`, and is gone at the next render if it doesn't.
   */
  sketchKey?: string;
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
    } else props.current.onShapes(next);
  };

  useEffect(() => {
    // Whether the gesture in progress draws: chessground draws on a right button, or with Shift.
    let drawing = false;
    const board: Api = Chessground(el.current!, {
      ...config(props.current, toDraw(own(props.current))),
      animation: { duration: 150 },
      highlight: { lastMove: true, check: true },
      drawable: {
        enabled: true,
        eraseOnMovablePieceClick: false,
        shapes: toDraw(own(props.current)),
        onChange: (shapes) => {
          // chessground also clears the shapes on a left click; here only drawing changes them,
          // so a click to move a piece never deletes a move's arrows.
          if (!drawing) return void board.set({ drawable: { shapes: toDraw(own(props.current)) } });
          drawing = false;
          shapesChanged(fromDraw(shapes));
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
    api.current?.set(config(p, toDraw(own(p))));
    // A premove played or dropped by the game is taken off the board too.
    if (api.current?.state.premovable.current && !p.premove?.current) api.current.cancelPremove();
  });

  return (
    <div class={`board${p.drawMode ? ' board-draw' : ''}`} ref={wrap}>
      <div class="cg-host" ref={el} />
      {p.badge && <Badge {...p.badge} orientation={p.orientation} />}
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
