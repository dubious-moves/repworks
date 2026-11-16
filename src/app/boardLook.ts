// How the boards look on this device (PLAN.md §5.196, §5.197): the piece set, the pieces' size, an
// outline around them, and the high-contrast slate board, for boards seen from a distance. Kept
// per device in localStorage like the theme (a tablet on a stand and a phone in the hand differ),
// never synced. The defaults are the app as it always was: cburnett, 100%, no outline, the theme's
// board. index.html applies the same keys before the first paint; keep the two in step.
//
// On <html>: `data-piece-set` (a set other than cburnett, whose stylesheet public/pieces/<set>.css
// is loaded as `link#piece-set`), `data-pieces` with `--piece-size` (a size other than 100%),
// `data-outline` with `--outline` (an outline), `data-board="contrast"`. app.css and themes.css
// hang on them.
import { effect, signal } from '@preact/signals';

/** The sets offered: cburnett (chessground's, bundled) and those scripts/piece-sets.mjs wrote. */
export const PIECE_SETS = [
  { id: 'cburnett', name: 'Cburnett (the usual)' },
  { id: 'merida', name: 'Merida' },
  { id: 'staunty', name: 'Staunty' },
  { id: 'california', name: 'California' },
  { id: 'maestro', name: 'Maestro' },
  { id: 'cardinal', name: 'Cardinal' },
  { id: 'fresca', name: 'Fresca' },
  { id: 'tatiana', name: 'Tatiana' },
  { id: 'gioco', name: 'Gioco' },
  { id: 'icpieces', name: 'IC Pieces' },
  { id: 'dubrovny', name: 'Dubrovny' },
  { id: 'chessnut', name: 'Chessnut' },
  { id: 'mpchess', name: 'MPChess' },
] as const;

export type PieceSetId = (typeof PIECE_SETS)[number]['id'];

/** The pieces' size, in percent of the square's side. */
export const PIECE_SIZE = { min: 100, max: 130, step: 5 } as const;
/** The outline around Black's pieces, in percent of the square; White's is OUTLINE_WHITE of it. */
export const OUTLINE = { min: 0, max: 4, step: 0.5 } as const;

export interface PieceLook {
  set: PieceSetId;
  size: number;
  outline: number;
}

export const DEFAULT_PIECE_LOOK: PieceLook = { set: 'cburnett', size: 100, outline: 0 };

/** Read by index.html's inline script too. */
export const PIECES_KEY = 'repworks-pieces';
export const CONTRAST_BOARD_KEY = 'repworks-contrast-board';
/** §5.196's one switch, a tenth bigger with an outline of 2: read once into PIECES_KEY, then removed. */
const OLD_BIG_PIECES_KEY = 'repworks-big-pieces';

const inRange = (v: unknown, r: { min: number; max: number; step: number }, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max ? Math.round(v / r.step) * r.step : fallback;

/** The stored look, each field checked: a missing or unknown value is the default. */
export function parsePieceLook(raw: string | null): PieceLook {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  return {
    set: PIECE_SETS.some((s) => s.id === v.set) ? (v.set as PieceSetId) : DEFAULT_PIECE_LOOK.set,
    size: inRange(v.size, PIECE_SIZE, DEFAULT_PIECE_LOOK.size),
    outline: inRange(v.outline, OUTLINE, DEFAULT_PIECE_LOOK.outline),
  };
}

function loadPieces(): PieceLook {
  try {
    const raw = localStorage.getItem(PIECES_KEY);
    if (raw === null && localStorage.getItem(OLD_BIG_PIECES_KEY) === '1') {
      const look = { ...DEFAULT_PIECE_LOOK, size: 110, outline: 2 };
      localStorage.setItem(PIECES_KEY, JSON.stringify(look));
      localStorage.removeItem(OLD_BIG_PIECES_KEY);
      return look;
    }
    return parsePieceLook(raw);
  } catch {
    return { ...DEFAULT_PIECE_LOOK };
  }
}

function loadContrast(): boolean {
  try {
    return localStorage.getItem(CONTRAST_BOARD_KEY) === '1';
  } catch {
    return false;
  }
}

export const pieceLook = signal<PieceLook>(loadPieces());
export const contrastBoard = signal(loadContrast());

export function setPieceLook(change: Partial<PieceLook>): void {
  const next = parsePieceLook(JSON.stringify({ ...pieceLook.peek(), ...change }));
  pieceLook.value = next;
  try {
    if (next.set === DEFAULT_PIECE_LOOK.set && next.size === DEFAULT_PIECE_LOOK.size && next.outline === DEFAULT_PIECE_LOOK.outline) localStorage.removeItem(PIECES_KEY);
    else localStorage.setItem(PIECES_KEY, JSON.stringify(next));
  } catch {
    // this page only
  }
}

export function setContrastBoard(on: boolean): void {
  contrastBoard.value = on;
  try {
    if (on) localStorage.setItem(CONTRAST_BOARD_KEY, '1');
    else localStorage.removeItem(CONTRAST_BOARD_KEY);
  } catch {
    // this page only
  }
}

/** The chosen set's stylesheet, in the head; none for cburnett. */
function loadSet(set: PieceSetId): void {
  let link = document.getElementById('piece-set') as HTMLLinkElement | null;
  if (set === 'cburnett') {
    link?.remove();
    return;
  }
  const href = `${import.meta.env.BASE_URL}pieces/${set}.css`;
  if (!link) {
    link = document.createElement('link');
    link.id = 'piece-set';
    link.rel = 'stylesheet';
    document.head.append(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

effect(() => {
  const root = document.documentElement;
  const { set, size, outline } = pieceLook.value;
  loadSet(set);
  if (set === 'cburnett') delete root.dataset.pieceSet;
  else root.dataset.pieceSet = set;
  if (size === 100) {
    delete root.dataset.pieces;
    root.style.removeProperty('--piece-size');
  } else {
    root.dataset.pieces = 'sized';
    root.style.setProperty('--piece-size', String(size / 100));
  }
  if (outline === 0) {
    delete root.dataset.outline;
    root.style.removeProperty('--outline');
  } else {
    root.dataset.outline = '';
    root.style.setProperty('--outline', String(outline));
  }
  if (contrastBoard.value) root.dataset.board = 'contrast';
  else delete root.dataset.board;
});
