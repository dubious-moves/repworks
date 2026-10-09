// The board's size (the owner's request, 2026-10-09): one side, in CSS pixels, for every board a
// page is built around (a study's, training's, practice's), so it is the same on each; none is the
// largest the window fits. Kept per device in localStorage (a phone's and a desktop's differ) and
// set as `--board-size` on the document's root, which those boards' CSS caps their side with.
import { effect, signal } from '@preact/signals';

const KEY = 'repworks-board-size';
export const BOARD_MIN = 200;
export const BOARD_MAX = 2000;

const clamp = (px: number) => Math.round(Math.min(BOARD_MAX, Math.max(BOARD_MIN, px)));

export const boardSize = signal<number | undefined>((() => {
  try {
    const n = Number(localStorage.getItem(KEY) ?? NaN);
    return Number.isFinite(n) ? clamp(n) : undefined;
  } catch {
    return undefined;
  }
})());

/** The side shown while dragging; `keep` stores it (at the drag's end), undefined forgets it. */
export function setBoardSize(px: number | undefined, keep = true): void {
  boardSize.value = px === undefined ? undefined : clamp(px);
  if (!keep) return;
  try {
    if (boardSize.value === undefined) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(boardSize.value));
  } catch {
    // this page only
  }
}

effect(() => {
  const style = document.documentElement.style;
  if (boardSize.value === undefined) style.removeProperty('--board-size');
  else style.setProperty('--board-size', `${boardSize.value}px`);
});
