// Sounds and a buzz on this device (PLAN.md §5.159): one switch, kept in localStorage like the
// theme, off until turned on. The board plays a move or a capture as one is made on it, the best
// move's burst its two notes, and a wrong move's mark its buzz (src/ui/Board.tsx).
import { signal } from '@preact/signals';
import { buzz, playSound, type Sound } from '../platform/sound.ts';

const KEY = 'repworks-sound';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export const soundOn = signal(load());

export function setSoundOn(on: boolean): void {
  soundOn.value = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // kept for this page only
  }
  // Turned on by a click: a moment the browser lets audio start, so the first sound isn't lost.
  if (on) playSound('move');
}

export function sound(s: Sound): void {
  if (!soundOn.peek()) return;
  playSound(s);
  if (s === 'wrong') buzz();
}
