// The physical board as core sees it (CHESSNUT.md §4.5): a port, as Remote and Clock are,
// implemented over Web Bluetooth in src/platform/chessnut.ts and faked in the tests.
import type { Battery, Light, PieceState, Squares } from './chessnut.ts';

export interface PhysicalBoard {
  /** The device's name as the chooser showed it. */
  readonly name: string;
  /** Every position report, read (unreadable ones are dropped). */
  onReport(f: (squares: Squares) => void): void;
  /** The link dropped (the board off, out of range, the page hidden). */
  onGone(f: () => void): void;
  /** Connects again to the same board, with no chooser; false when it can't. */
  reconnect(): Promise<boolean>;
  /** The robot drives the pieces to `squares` (force mode unless `force` is false). */
  drive(squares: Squares, force?: boolean): Promise<boolean>;
  stopDrive(): Promise<boolean>;
  lights(lights: readonly Light[]): Promise<boolean>;
  battery(): Promise<Battery | undefined>;
  pieces(): Promise<PieceState[] | undefined>;
  close(): void;
}
