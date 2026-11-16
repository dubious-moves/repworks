// Boards seen from a distance (PLAN.md §5.196): pieces a tenth bigger with a sharp outline in the
// other side's colour, and a high-contrast slate board over the theme's own. Two switches, each off
// until ticked, kept per device in localStorage like the theme (a tablet on a stand and a phone in
// the hand differ), and put on <html> as `data-pieces="big"` and `data-board="contrast"`, which
// app.css and themes.css hang on. index.html sets both before the first paint from the same keys.
import { effect, signal } from '@preact/signals';

/** Read by index.html's inline script too: keep the two in step. */
export const BIG_PIECES_KEY = 'repworks-big-pieces';
export const CONTRAST_BOARD_KEY = 'repworks-contrast-board';

function load(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function keep(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // this page only
  }
}

export const bigPieces = signal(load(BIG_PIECES_KEY));
export const contrastBoard = signal(load(CONTRAST_BOARD_KEY));

export function setBigPieces(on: boolean): void {
  bigPieces.value = on;
  keep(BIG_PIECES_KEY, on);
}

export function setContrastBoard(on: boolean): void {
  contrastBoard.value = on;
  keep(CONTRAST_BOARD_KEY, on);
}

effect(() => {
  const root = document.documentElement;
  if (bigPieces.value) root.dataset.pieces = 'big';
  else delete root.dataset.pieces;
  if (contrastBoard.value) root.dataset.board = 'contrast';
  else delete root.dataset.board;
});
