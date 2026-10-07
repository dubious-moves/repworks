// The engine line after a move on a game card (PLAN.md §6, item 1), mistake-lab's ENGINE LINES
// (`c525403`: `buildEngineLine`, `parseSfContinuation`, `getEngineLineFen`, `getActivePathLength`,
// `getActiveMoveAt`, `goToLineMove`, `goToMainLineMove`, `goToAltLineMove`, `lineStep`,
// `handleEngineLineBranch`, `extendEngineLine`): the user's move and the engine's continuation, six
// plies at most, opened at the opponent's reply; stepped through, extended past its end by a new
// search, and branched by a move on the board (the engine's line after it becomes an alternative,
// an alternative's own branch replaces its continuation: two levels at most). Stepping back past a
// wrong move is Try again. The searches are the app's; everything here is pure.
import type { Position } from 'chessops/chess';
import { makeSanAndPlay } from 'chessops/san';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { fenOf, positionOf } from '../storm/walk.ts';

/** The plies of a line and of each extension (mistake-lab's `ENGINE_LINE_PLY`). */
export const ENGINE_LINE_PLY = 6;

export interface LineMove {
  /** Standard UCI. */
  readonly uci: string;
  readonly san: string;
  /** The position after the move. */
  readonly fen: string;
  readonly isUser?: boolean;
}

export interface LineAlt {
  /** The index of the move it branches after (-1: from the line's start). */
  readonly branchIdx: number;
  readonly moves: readonly LineMove[];
  /** The score after its user move, White's view, centipawns (a mate ±10,000). */
  readonly cpWhite: number | null;
}

export interface EngineLine {
  readonly baseFen: string;
  /** The main line, the user's move first. */
  readonly moves: readonly LineMove[];
  /** The move shown on the board (-1: the line's start). */
  readonly currentIdx: number;
  readonly alternatives: readonly LineAlt[];
  /** The alternative on the path (-1: the main line). */
  readonly activeAlt: number;
  readonly cpWhite: number | null;
  /** The user's move was wrong: stepping back before it is Try again. */
  readonly wrongMove: boolean;
}

function play(pos: Position, uci: string): LineMove | undefined {
  const move = parseUciMove(pos, uci);
  if (!move) return undefined;
  const std = standardUci(pos, move);
  const san = makeSanAndPlay(pos, move);
  return { uci: std, san, fen: fenOf(pos) };
}

/** An engine's line from `fen` as moves, `max` at most, cut at the first move that isn't legal (`parseSfContinuation`). */
export function continuation(fen: string, pv: readonly string[], max = ENGINE_LINE_PLY): LineMove[] {
  const pos = positionOf(fen);
  const out: LineMove[] = [];
  if (!pos) return out;
  for (const uci of pv) {
    if (out.length >= max) break;
    const m = play(pos, uci);
    if (!m) break;
    out.push(m);
  }
  return out;
}

/**
 * The line after the user's move: the move, then the engine's continuation to six plies (`plies`),
 * opened at the opponent's reply (or at `startIdx`). Nothing when the engine gave no continuation.
 */
export function buildEngineLine(baseFen: string, userUci: string, cont: readonly string[], cpWhite: number | null, opts: { wrongMove?: boolean; startIdx?: number; plies?: number } = {}): EngineLine | undefined {
  const pos = positionOf(baseFen);
  const user = pos && play(pos, userUci);
  if (!pos || !user) return undefined;
  const moves = [{ ...user, isUser: true }, ...continuation(user.fen, cont, (opts.plies ?? ENGINE_LINE_PLY) - 1)];
  if (moves.length <= 1) return undefined;
  return { baseFen, moves, currentIdx: opts.startIdx ?? 1, alternatives: [], activeAlt: -1, cpWhite, wrongMove: !!opts.wrongMove };
}

/** The moves of the active path: the main line, or its start to the branch and the alternative. */
export function activePath(line: EngineLine): readonly LineMove[] {
  const alt = line.alternatives[line.activeAlt];
  return alt ? [...line.moves.slice(0, alt.branchIdx + 1), ...alt.moves] : line.moves;
}

export const pathLength = (line: EngineLine): number => activePath(line).length;

export function moveAt(line: EngineLine, idx: number): LineMove | undefined {
  return idx < 0 ? undefined : activePath(line)[idx];
}

/** The position at `idx` of the active path (the board's, by default). */
export function lineFen(line: EngineLine, idx = line.currentIdx): string {
  return idx < 0 ? line.baseFen : (moveAt(line, idx)?.fen ?? line.baseFen);
}

/** The score shown with the line: the active alternative's, else the main line's. */
export function lineScore(line: EngineLine): number | null {
  const alt = line.alternatives[line.activeAlt];
  return alt ? alt.cpWhite : line.cpWhite;
}

/** To a move of the active path (`goToLineMove`); out of range changes nothing. */
export function goTo(line: EngineLine, idx: number): EngineLine {
  if (idx < -1 || idx >= pathLength(line)) return line;
  return { ...line, currentIdx: idx };
}

/** A main line move clicked (`goToMainLineMove`). */
export function goToMain(line: EngineLine, idx: number): EngineLine {
  if (idx >= line.moves.length) return line;
  return goTo({ ...line, activeAlt: -1 }, idx);
}

/** An alternative's move clicked, by its index on the path (`goToAltLineMove`). */
export function goToAlt(line: EngineLine, alt: number, idx: number): EngineLine {
  if (alt < 0 || alt >= line.alternatives.length) return line;
  return goTo({ ...line, activeAlt: alt }, idx);
}

export type Step =
  | { kind: 'go'; line: EngineLine }
  /** Past the end: the line is extended by a search at its end. */
  | { kind: 'extend' }
  /** Back before a wrong move: Try again. */
  | { kind: 'retry' }
  | { kind: 'none' };

/** ← or → (`lineStep`). Stepping back into an alternative's shared start stays in the alternative. */
export function step(line: EngineLine, delta: number): Step {
  const idx = line.currentIdx + delta;
  if (idx < -1) return { kind: 'none' };
  if (idx >= pathLength(line)) return delta > 0 ? { kind: 'extend' } : { kind: 'none' };
  if (idx === -1 && line.wrongMove) return { kind: 'retry' };
  return { kind: 'go', line: goTo(line, idx) };
}

/** Where the active path ends, when a search there can extend it (not a finished game). */
export function endFen(line: EngineLine): string | undefined {
  const last = activePath(line).at(-1);
  if (!last) return undefined;
  const pos = positionOf(last.fen);
  return pos && !pos.isEnd() && !pos.isInsufficientMaterial() && pos.halfmoves < 100 ? last.fen : undefined;
}

/** The active path extended by a search at its end, `ENGINE_LINE_PLY` more, the board on the first new move. */
export function extend(line: EngineLine, fen: string, pv: readonly string[], cpWhite: number | null): EngineLine {
  if (endFen(line) !== fen) return line;
  const more = continuation(fen, pv, ENGINE_LINE_PLY);
  if (!more.length) return line;
  const at = pathLength(line);
  const alt = line.alternatives[line.activeAlt];
  if (alt) {
    const alternatives = line.alternatives.map((a) => (a === alt ? { ...a, moves: [...a.moves, ...more], ...(cpWhite != null ? { cpWhite } : {}) } : a));
    return { ...line, alternatives, currentIdx: at };
  }
  return { ...line, moves: [...line.moves, ...more], ...(cpWhite != null ? { cpWhite } : {}), currentIdx: at };
}

export type Branch =
  /** Not legal where the board is. */
  | { kind: 'illegal' }
  /** A move the line already has: the board on it, then on the reply after it (`reply`) when there is one. */
  | { kind: 'follow'; line: EngineLine; reply: number | undefined }
  /** A new move: the engine's line after it is searched (`fen`), then `addBranch`. */
  | { kind: 'new'; fen: string; move: LineMove; from: { idx: number; alt: number } };

/** A move made on the board while the line is shown (`handleEngineLineBranch`, before its search). */
export function branch(line: EngineLine, uci: string): Branch {
  const pos = positionOf(lineFen(line));
  const move = pos && play(pos, uci);
  if (!move) return { kind: 'illegal' };
  const idx = line.currentIdx;
  const next = idx + 1;
  const follow = (l: EngineLine): Branch => {
    const at = goTo(l, next);
    return { kind: 'follow', line: at, reply: next + 1 < pathLength(at) ? next + 1 : undefined };
  };
  if (moveAt(line, next)?.uci === move.uci) return follow(line);
  const alt = line.alternatives[line.activeAlt];
  if (alt && idx <= alt.branchIdx && line.moves[next]?.uci === move.uci) return follow({ ...line, activeAlt: -1 });
  const sibling = line.alternatives.findIndex((a) => a.branchIdx === idx && a.moves[0]?.uci === move.uci);
  if (sibling >= 0) return follow({ ...line, activeAlt: sibling });
  return { kind: 'new', fen: move.fen, move, from: { idx, alt: line.activeAlt } };
}

/**
 * A new move's branch, with the engine's line after it (`pv`, five plies kept): inside an
 * alternative past its branch it replaces the rest of that alternative; else it is a new
 * alternative. The board follows it to the reply when it is still where the move was made.
 */
export function addBranch(line: EngineLine, b: Extract<Branch, { kind: 'new' }>, pv: readonly string[], cpWhite: number | null): EngineLine {
  const cont = continuation(b.fen, pv, ENGINE_LINE_PLY - 1);
  const { idx, alt: fromAlt } = b.from;
  const stayed = line.currentIdx === idx && line.activeAlt === fromAlt;
  const inAlt = line.alternatives[fromAlt];
  let alternatives: LineAlt[];
  let activeAlt: number;
  if (inAlt && idx > inAlt.branchIdx) {
    const kept = inAlt.moves.slice(0, idx - inAlt.branchIdx);
    alternatives = line.alternatives.map((a) => (a === inAlt ? { ...a, moves: [...kept, b.move, ...cont], cpWhite } : a));
    activeAlt = fromAlt;
  } else {
    alternatives = [...line.alternatives, { branchIdx: idx, moves: [b.move, ...cont], cpWhite }];
    activeAlt = alternatives.length - 1;
  }
  const next = { ...line, alternatives };
  if (!stayed) return next;
  const followed = { ...next, activeAlt };
  return { ...followed, currentIdx: idx + 2 < pathLength(followed) ? idx + 2 : idx + 1 };
}
