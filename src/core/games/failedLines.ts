// A checklist line's failed lines (PLAN.md §5.208, the owner's request of 2026-11-20): a drill lost
// is kept with the line, its game from the line's end, to be played again by Exact retry at the
// same difficulty until it is won. A loss is kept by itself when one move lost it before the
// endgame; one thrown away in the endgame (it held into the endgame), or with no single losing
// move, is offered in the review to keep by hand. A try not won leaves it open, a try won (or ✕)
// clears it. Synced as `failed` events on the line's card (`c|<leaf>`). Pure.
import { makeSanAndPlay } from "chessops/san";
import type { Position } from "chessops/chess";
import { parseUciMove } from "../chess/uci.ts";
import { positionOf } from "../storm/walk.ts";
import type { PlayedMove } from "./practice.ts";

export const FAILED = {
  /** Lost from here on: the score for the user at or below this (centipawns). */
  losing: -200,
  /** The endgame: this many pieces on the board or fewer, kings and pawns not counted (Lichess's divider). */
  endgamePieces: 6,
} as const;

/** The user's score after each of their moves that has one, by the move's index. */
function userScores(
  moves: readonly PlayedMove[],
): { i: number; cp: number; before?: number }[] {
  const out: { i: number; cp: number; before?: number }[] = [];
  moves.forEach((m, i) => {
    if (!m.isUser) return;
    const cp =
      m.afterCp ??
      (m.bestCp != null && m.cpLoss != null ? m.bestCp - m.cpLoss : undefined);
    if (cp !== undefined)
      out.push({ i, cp, ...(m.bestCp != null ? { before: m.bestCp } : {}) });
  });
  return out;
}

/**
 * The move that lost the game: the user's first move after which the score stayed at `losing` or
 * below to the end. Undefined when the game ended above it (stopped at equality, say), or was lost
 * already at its start.
 */
export function losingMove(moves: readonly PlayedMove[]): number | undefined {
  const s = userScores(moves);
  if (!s.length || s[s.length - 1]!.cp > FAILED.losing) return undefined;
  let k = s.length - 1;
  while (k > 0 && s[k - 1]!.cp <= FAILED.losing) k--;
  // The first judged move already lost: it lost the game if the position before it didn't.
  if (k === 0 && !(s[0]!.before !== undefined && s[0]!.before > FAILED.losing))
    return undefined;
  return s[k]!.i;
}

/** The pieces on the board, kings and pawns not counted. */
const pieces = (pos: Position) =>
  pos.board.occupied.diff(pos.board.king).diff(pos.board.pawn).size();

/** The position before move `n` of a game from `fen`; undefined when a move can't be read. */
export function positionBefore(
  fen: string,
  moves: readonly { uci: string }[],
  n: number,
): Position | undefined {
  const pos = positionOf(fen);
  if (!pos) return undefined;
  for (const m of moves.slice(0, n)) {
    const mv = parseUciMove(pos, m.uci);
    if (!mv) return undefined;
    pos.play(mv);
  }
  return pos;
}

/**
 * Whether a lost drill is kept as a failed line by itself (`keep`), with its losing move (`at`);
 * else why not: lost in the endgame, or no single move lost it (`unclear`). Offered in the review then.
 */
export function lossVerdict(
  fen: string,
  moves: readonly PlayedMove[],
):
  | { keep: true; at: number }
  | { keep: false; why: "endgame" | "unclear"; at?: number } {
  const at = losingMove(moves);
  if (at === undefined) return { keep: false, why: "unclear" };
  const pos = positionBefore(fen, moves, at);
  if (pos && pieces(pos) <= FAILED.endgamePieces)
    return { keep: false, why: "endgame", at };
  return { keep: true, at };
}

/** "18…Nxe4": move `n` of a game from `fen`, numbered; undefined when it can't be read. */
export function numberedSan(
  fen: string,
  moves: readonly string[],
  n: number,
): string | undefined {
  const pos = positionBefore(
    fen,
    moves.map((uci) => ({ uci })),
    n,
  );
  const mv =
    pos && moves[n] !== undefined ? parseUciMove(pos, moves[n]!) : undefined;
  if (!pos || !mv) return undefined;
  const no = pos.fullmoves;
  const white = pos.turn === "white";
  return `${no}${white ? "." : "…"}${makeSanAndPlay(pos, mv)}`;
}

/** A failed line as read from its events. */
export interface FailedLine {
  /** Its name, the id of the game lost. */
  g: string;
  preset: string;
  /** The lost game's moves from the line's end (UCI). */
  moves: string[];
  /** The losing move's index in `moves`, when one was found. */
  at?: number;
  /** When it was lost (ms). */
  t: number;
  /** The tries at it: the loss, and each retry not won since. */
  tries: number;
}

type FailedLike = {
  k: "failed";
  g: string;
  on: boolean;
  m?: string;
  preset?: string;
  at?: number;
};

/**
 * The open failed lines at a checklist line, from its card's events in order: a `failed` event
 * with moves opens one, one without moves counts a try at it, `on: false` clears it (and a later
 * try with nothing to try at is nothing). The oldest first.
 */
export function failedLinesOf(
  events: Iterable<{ t: number; event?: { k: string } }>,
): FailedLine[] {
  const lines = new Map<string, FailedLine & { open: boolean }>();
  for (const e of events) {
    if (e.event?.k !== "failed") continue;
    const f = e.event as FailedLike;
    const had = lines.get(f.g);
    if (!f.on) {
      if (had) had.open = false;
    } else if (f.m !== undefined && f.preset) {
      if (!had)
        lines.set(f.g, {
          g: f.g,
          preset: f.preset,
          moves: f.m.split(" "),
          ...(f.at !== undefined ? { at: f.at } : {}),
          t: e.t,
          tries: 1,
          open: true,
        });
      else had.open = true;
    } else if (had?.open) had.tries++;
  }
  return [...lines.values()]
    .filter((l) => l.open)
    .map(({ open: _o, ...l }) => l);
}
