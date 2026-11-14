// An endgame's defence varied over tries, and "Maia alone" (PLAN.md §5.174, the owner's request of
// 2026-11-14): the replies met at each position, and the try before with how it ended, kept on this
// device in localStorage (a convenience: lost with the browser's data, never synced); and the
// switch for Maia's reply played without Stockfish's check.
import { signal } from '@preact/signals';
import { beginTry, noteEnd, noteReply, readMemories, replyHints, type Memories } from '../core/endgames/variety.ts';

const MEMORY_KEY = 'repworks-endgame-replies';
const ALONE_KEY = 'repworks-endgame-maia-alone';

let memories: Memories | undefined;

function load(): Memories {
  if (!memories) {
    try {
      memories = readMemories(localStorage.getItem(MEMORY_KEY));
    } catch {
      memories = {};
    }
  }
  return memories;
}

function save(next: Memories): void {
  memories = next;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the memory lives on for this visit.
  }
}

/** A try at endgame `id` begun. */
export const tryBegun = (id: string): void => save(beginTry(load(), id));
/** The defence's reply `uci` at the position `key` of endgame `id`. */
export const replyPlayed = (id: string, key: string, uci: string): void => save(noteReply(load(), id, key, uci));
/** The try in play ended, solved or missed. */
export const tryEnded = (id: string, end: 'solved' | 'missed'): void => save(noteEnd(load(), id, end));
/** The replies met at `key`, and the reply to play again after a miss. */
export const hintsAt = (id: string, key: string) => replyHints(load(), id, key);

function readAlone(): boolean {
  try {
    return localStorage.getItem(ALONE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Maia's reply played at once, without Stockfish's check (this device's choice). */
export const endgameMaiaAlone = signal(readAlone());

export function setEndgameMaiaAlone(on: boolean): void {
  endgameMaiaAlone.value = on;
  try {
    localStorage.setItem(ALONE_KEY, on ? '1' : '0');
  } catch {
    // Kept for this visit.
  }
}
