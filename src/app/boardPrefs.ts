// The Chessnut Move's settings (CHESSNUT.md §4.11), kept on the device as the other preferences
// are: one JSON object in localStorage under `repworks-board`, read once and written on change.
// Nothing here is synced: a board belongs to the device that drives it.
import { signal } from '@preact/signals';

export interface BoardPrefs {
  /** The lights at all. */
  lights: boolean;
  /** Only the README's red, green and blue (CHESSNUT.md §4.7). */
  basicColours: boolean;
  /** A Black player's positions set up turned half round, their side nearest them (§4.6). */
  turnForBlack: boolean;
  /** How long the board holds a move before it is read (ms). */
  settleMs: number;
  /** How long a wrong position stays before the robot puts it back (ms); also a held storm card's Try again. */
  putBackMs: number;
  /** Verdicts and the opponent's moves said. */
  speak: boolean;
  /** A set's next card comes by itself after a verdict while the board is linked. */
  autoNext: boolean;
  /** A held set card's move taken back after `putBackMs`. */
  autoRetry: boolean;
  /** A storm card set up one move early, the move that reached it then played. */
  playArrival: boolean;
}

export const DEFAULT_BOARD_PREFS: BoardPrefs = {
  lights: true,
  basicColours: false,
  turnForBlack: true,
  settleMs: 600,
  putBackMs: 2000,
  speak: false,
  autoNext: true,
  autoRetry: true,
  playArrival: false,
};

/** The ranges of the two times, as the dialog offers them. */
export const SETTLE_RANGE = { min: 300, max: 1500, step: 100 } as const;
export const PUT_BACK_RANGE = { min: 1000, max: 5000, step: 500 } as const;

const KEY = 'repworks-board';

/** The stored settings, each field checked: a missing or unknown value is the default. */
export function parseBoardPrefs(raw: string | null): BoardPrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  const flag = (k: keyof BoardPrefs) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (DEFAULT_BOARD_PREFS[k] as boolean));
  const ms = (k: 'settleMs' | 'putBackMs', r: { min: number; max: number }) => {
    const x = v[k];
    return typeof x === 'number' && Number.isFinite(x) && x >= r.min && x <= r.max ? Math.round(x) : DEFAULT_BOARD_PREFS[k];
  };
  return {
    lights: flag('lights'),
    basicColours: flag('basicColours'),
    turnForBlack: flag('turnForBlack'),
    settleMs: ms('settleMs', SETTLE_RANGE),
    putBackMs: ms('putBackMs', PUT_BACK_RANGE),
    speak: flag('speak'),
    autoNext: flag('autoNext'),
    autoRetry: flag('autoRetry'),
    playArrival: flag('playArrival'),
  };
}

function read(): BoardPrefs {
  try {
    return parseBoardPrefs(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_BOARD_PREFS };
  }
}

export const boardPrefs = signal<BoardPrefs>(read());

export function setBoardPrefs(change: Partial<BoardPrefs>): void {
  const next = parseBoardPrefs(JSON.stringify({ ...boardPrefs.peek(), ...change }));
  boardPrefs.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Kept for this page only.
  }
}
