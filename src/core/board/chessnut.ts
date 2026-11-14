// The Chessnut Move's bytes (CHESSNUT.md §2): Chessnut's published Move API, checked against its
// own app (ChessnutNext) and the chessnut-move SDK's tests. Pure: no Bluetooth here.
//
// Squares are chessops's numbers (a1 = 0, b1 = 1 … h8 = 63). On the wire the board runs h8, g8 …
// a8, h7 … a1, two squares a byte from byte 2, the first in the low nibble: wire index 63 − s.

export const MOVE_NAME = 'Chessnut Move';
export const UUIDS = {
  positionService: '1b7e8261-2877-41c3-b46e-cf057c562023',
  position: '1b7e8262-2877-41c3-b46e-cf057c562023',
  commandService: '1b7e8271-2877-41c3-b46e-cf057c562023',
  write: '1b7e8272-2877-41c3-b46e-cf057c562023',
  response: '1b7e8273-2877-41c3-b46e-cf057c562023',
} as const;

/** Starts the position reports (written with response); the board answers a frame starting 0x23. */
export const START_REPORTS = Uint8Array.of(0x21, 0x01, 0x00);
export const ASK_BATTERY = Uint8Array.of(0x41, 0x01, 0x0c);
export const ASK_PIECES = Uint8Array.of(0x41, 0x01, 0x0b);

/** The nibble codes: 0 empty, 1 q, 2 k, 3 b, 4 p, 5 n, 6 R, 7 P, 8 r, 9 B, 10 N, 11 Q, 12 K. */
const CODES = ['', 'q', 'k', 'b', 'p', 'n', 'R', 'P', 'r', 'B', 'N', 'Q', 'K'] as const;
const CODE_OF: Record<string, number> = Object.fromEntries(CODES.map((c, i) => [c, i]).filter(([c]) => c));

/** 64 FEN letters ('' empty), a1 first: the board as the site handles it. */
export type Squares = string[];

const wire = (s: number) => 63 - s;
const nibble = (bytes: Uint8Array, at: number, s: number): number => {
  const k = wire(s);
  const b = bytes[at + (k >> 1)]!;
  return k & 1 ? b >> 4 : b & 0x0f;
};

/** The 64 squares of a 32-byte board block starting at `at`; undefined on an unknown code. */
export function readSquares(bytes: Uint8Array, at: number): Squares | undefined {
  if (bytes.length < at + 32) return undefined;
  const out: Squares = [];
  for (let s = 0; s < 64; s++) {
    const c = CODES[nibble(bytes, at, s)];
    if (c === undefined) return undefined;
    out.push(c);
  }
  return out;
}

/** A position report (38 bytes; 34 at least): its squares, or undefined when it can't be read. */
export const readReport = (bytes: Uint8Array): Squares | undefined => readSquares(bytes, 2);

/** The 32-byte block for 64 squares (codes taken from `code`). */
function block(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(32);
  for (let s = 0; s < 64; s++) {
    const k = wire(s);
    const v = values[s]! & 0x0f;
    out[k >> 1]! |= k & 1 ? v << 4 : v;
  }
  return out;
}

/** The robot: drive the pieces to `squares` (35 bytes). `force` (Chessnut's app's default): a hand
 *  doesn't stop it; else a piece moved by hand halts the drive. */
export function driveTo(squares: Squares, force = true): Uint8Array {
  const out = new Uint8Array(35);
  out.set([0x42, 0x21]);
  out.set(block(squares.map((c) => CODE_OF[c] ?? 0)), 2);
  out[34] = force ? 0 : 1;
  return out;
}

/** Stops a drive under way: `42 21` and 33 zeros. */
export const STOP_DRIVE: Uint8Array = (() => {
  const out = new Uint8Array(35);
  out.set([0x42, 0x21]);
  return out;
})();

/** A square's light: 0–3 in Chessnut's README, 4–7 seen in Chessnut's own app only. */
export const LIGHT = { off: 0, red: 1, green: 2, blue: 3, darkGreen: 4, brightGreen: 5, yellow: 6, orange: 7 } as const;
export type Light = (typeof LIGHT)[keyof typeof LIGHT];

/** The colours the README promises, for a board that shows only those (CHESSNUT.md §4.7). */
export const basic = (l: Light): Light => (l === 4 || l === 5 ? 2 : l === 6 ? 3 : l === 7 ? 1 : l);

/** The lights (34 bytes): one colour a square, a1 first; every other square off. */
export function lightsCommand(lights: readonly Light[]): Uint8Array {
  const out = new Uint8Array(34);
  out.set([0x43, 0x20]);
  out.set(block(Array.from({ length: 64 }, (_, s) => lights[s] ?? 0)), 2);
  return out;
}

export interface Battery {
  charging: boolean;
  percent: number;
}
/** `41 03 0c <charging> <percent>`. */
export function readBattery(bytes: Uint8Array): Battery | undefined {
  if (bytes.length < 5 || bytes[0] !== 0x41 || bytes[2] !== 0x0c) return undefined;
  return { charging: bytes[3] === 1, percent: Math.min(100, bytes[4]!) };
}

/** The pieces in the order the board lists them: White's P×8 R×2 N×2 B×2 Q×2 K, then Black's. */
export const PIECE_ORDER = 'PPPPPPPPRRNNBBQQKpppppppprrnnbbqqk';
export interface PieceState {
  /** Its FEN letter. */
  piece: string;
  /** 0–255 across the board; both 0 when it isn't on it. */
  x: number;
  y: number;
  battery: number;
  onBoard: boolean;
}
/** `41 89 0b` then 34 × (kind, x, y, battery). */
export function readPieces(bytes: Uint8Array): PieceState[] | undefined {
  if (bytes.length < 3 + 34 * 4 || bytes[0] !== 0x41 || bytes[2] !== 0x0b) return undefined;
  const KIND = ' PRNBQKprnbqk';
  return Array.from({ length: 34 }, (_, i) => {
    const at = 3 + i * 4;
    const x = bytes[at + 1]!;
    const y = bytes[at + 2]!;
    return { piece: KIND[bytes[at]!]?.trim() || PIECE_ORDER[i]!, x, y, battery: Math.min(100, bytes[at + 3]!), onBoard: x !== 0 || y !== 0 };
  });
}

/** The board's answer to START_REPORTS (undocumented, seen by the chessnut-move SDK). */
export const isReportsAck = (bytes: Uint8Array): boolean => bytes[0] === 0x23;

/** Squares from a board FEN (its first field) and back. */
export function squaresOf(boardFen: string): Squares | undefined {
  const rows = boardFen.split(' ')[0]!.split('/');
  if (rows.length !== 8) return undefined;
  const out: Squares = new Array(64).fill('');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]!) {
      if (ch >= '1' && ch <= '8') f += Number(ch);
      else if (CODE_OF[ch] !== undefined && f < 8) out[(7 - r) * 8 + f++] = ch;
      else return undefined;
    }
    if (f !== 8) return undefined;
  }
  return out;
}
export function boardFenOf(squares: Squares): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = squares[r * 8 + f]!;
      if (!c) empty++;
      else {
        if (empty) row += empty;
        row += c;
        empty = 0;
      }
    }
    rows.push(row + (empty || ''));
  }
  return rows.join('/');
}
