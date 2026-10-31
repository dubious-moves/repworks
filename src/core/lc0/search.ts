// Lc0's search (PLAN.md §5.144): its PUCT tree search over the network, as Lc0 v0.32 runs it with
// its default parameters (src/mcts/params.cc), one playout at a time (no virtual loss: every
// playout sees all before it, the most a node can be worth). Pure: the network is a function
// passed in.
//
//   select   argmax Q + U, U = cpuct · P · √(children's visits) / (1 + N),
//            cpuct = 1.745 + 3.894 · ln((N_parent + 38739) / 38739);
//            an unvisited move's Q the parent's Q less 0.330 · √(the visited moves' policy)
//   value    the network's Q = win − loss for the side to move (draw score 0); a mate −1, a
//            stalemate, dead position, fifty moves or threefold 0; a twofold whose cycle lies
//            inside the tree (from the root on) 0, as Lc0's `TwoFoldDraws`
//   move     the most visited, then the higher Q, then the higher policy; a mate in one at once
//
// Stopping early is exact: once the runner-up can no longer catch the most visited move in the
// playouts left, the rest would not change the move (Lc0's smart pruning, without its guess).
// Each search starts a new tree: a kept one's twofold draws were judged from another root.
import type { Position } from 'chessops/chess';
import { makeBoardFen } from 'chessops/fen';
import { parseUciMove } from '../chess/uci.ts';
import { legalMoves } from '../maia/encode.ts';
import { lc0Centipawns, type Lc0Move, type Wdl } from './encode.ts';

export const CPUCT = 1.745;
export const CPUCT_BASE = 38739;
export const CPUCT_FACTOR = 3.894;
export const FPU_REDUCTION = 0.33;

/** The network's answer at the last position of a line: priors for every legal move, and W/D/L. */
export interface NetAnswer {
  policy: readonly Lc0Move[];
  wdl: Wdl;
}

/** The network on a line (positions oldest first, each the one before played on). */
export type Net = (history: readonly Position[]) => Promise<NetAnswer>;

interface Node {
  uci: string;
  san: string;
  prior: number;
  /** Visits. */
  n: number;
  /** Values summed, from the side that played the move into this node. */
  w: number;
  /** Expanded: its moves (none at a terminal node). */
  children?: Node[];
  /** Terminal: the value for the side to move here. */
  terminal?: number;
}

export interface MoveStat {
  uci: string;
  san: string;
  visits: number;
  /** The mover's Q (−1 to 1), or undefined when not visited. */
  q?: number;
  prior: number;
}

export interface SearchResult {
  uci: string;
  san: string;
  /** The root's visits. */
  nodes: number;
  /** The network runs this search made. */
  evals: number;
  /** The move's Q for the side to move (Lc0's score), and as Lc0's centipawns. */
  q: number;
  cp: number;
  /** The root's moves, most visited first. */
  moves: MoveStat[];
  /** The most visited line from the root (SAN). */
  pv: string[];
  /** Mate in one, or a single legal move: no search. */
  forced?: 'mate' | 'only';
}

export interface SearchOptions {
  /** The line to the position searched, oldest first (as the network reads it). */
  history: readonly Position[];
  /** The root's visits to reach. */
  nodes: number;
  net: Net;
  /** After each playout. Return false to stop. */
  progress?(nodes: number, best: () => MoveStat): boolean | void;
}

/** A position for repetitions, as Lc0 counts them: pieces, side to move, castling, en passant. */
export const key = (pos: Position): string => `${makeBoardFen(pos.board)} ${pos.turn} ${pos.castles.castlingRights} ${pos.epSquare ?? '-'}`;

/**
 * The value of the last position of `line` for its side to move when the game is over there, or
 * undefined. `keys` are the line's `key`s; `rootAt` the root's index in it (a twofold counts from
 * there on).
 */
export function terminalValue(line: readonly Position[], keys: readonly string[], rootAt: number): number | undefined {
  const pos = line[line.length - 1]!;
  if (pos.isCheckmate()) return -1;
  if (pos.isStalemate() || pos.isInsufficientMaterial()) return 0;
  if (pos.halfmoves >= 100) return 0;
  const k = keys[keys.length - 1]!;
  // Only positions since the last capture or pawn move can come back.
  let seen = 0;
  let last = -1;
  for (let i = keys.length - 3; i >= Math.max(0, keys.length - 1 - pos.halfmoves); i -= 2) {
    if (keys[i] !== k) continue;
    seen++;
    if (last < 0) last = i;
  }
  if (seen >= 2) return 0;
  if (seen === 1 && last >= rootAt) return 0;
  return undefined;
}

const q = (n: Node): number | undefined => (n.n ? n.w / n.n : undefined);

function select(node: Node): Node {
  const children = node.children!;
  const childVisits = Math.max(node.n - 1, 0);
  const cpuct = CPUCT + CPUCT_FACTOR * Math.log((node.n + CPUCT_BASE) / CPUCT_BASE);
  const mult = cpuct * Math.sqrt(Math.max(childVisits, 1));
  let visitedPolicy = 0;
  for (const c of children) if (c.n) visitedPolicy += c.prior;
  // The node's Q for its side to move: its value is kept from the other side's.
  const parentQ = node.n ? -node.w / node.n : 0;
  const fpu = parentQ - FPU_REDUCTION * Math.sqrt(visitedPolicy);
  let best = children[0]!;
  let bestScore = -Infinity;
  for (const c of children) {
    const score = (c.n ? c.w / c.n : fpu) + (mult * c.prior) / (1 + c.n);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** The most visited, then the higher Q, then the higher prior. */
function better(a: Node, b: Node): boolean {
  if (a.n !== b.n) return a.n > b.n;
  const qa = q(a) ?? -2;
  const qb = q(b) ?? -2;
  if (qa !== qb) return qa > qb;
  return a.prior > b.prior;
}

function bestChild(node: Node): Node | undefined {
  let best: Node | undefined;
  for (const c of node.children ?? []) if (!best || better(c, best)) best = c;
  return best;
}

const stat = (c: Node): MoveStat => ({ uci: c.uci, san: c.san, visits: c.n, prior: c.prior, ...(c.n ? { q: c.w / c.n } : {}) });

function play(pos: Position, uci: string): Position {
  const next = pos.clone();
  next.play(parseUciMove(pos, uci)!);
  return next;
}

function expand(node: Node, answer: NetAnswer): void {
  node.children = answer.policy.map((m) => ({ uci: m.uci, san: m.san, prior: m.prob, n: 0, w: 0 }));
}

/** Lc0's move in the last position of `history`. Throws when the game is over there. */
export async function lc0Search(o: SearchOptions): Promise<SearchResult> {
  const history = [...o.history];
  const rootPos = history[history.length - 1]!;
  const keys = history.map(key);
  const legal = legalMoves(rootPos).map((m) => ({ ...m, mates: play(rootPos, m.uci).isCheckmate() }));
  if (!legal.length) throw new Error('the game is over in this position');

  const forced = legal.find((m) => m.mates) ? 'mate' : legal.length === 1 ? 'only' : undefined;
  const root: Node = { uci: '', san: '', prior: 1, n: 0, w: 0 };
  if (forced === 'mate') {
    const m = legal.find((x) => x.mates)!;
    return resultOf(root, 0, m, forced);
  }
  const first = await o.net(history);
  let evals = 1;
  expand(root, first);
  root.n = 1;
  root.w = -(first.wdl.win - first.wdl.loss);
  if (forced) return resultOf(root, evals, legal[0]!, forced);

  const rootAt = keys.length - 1;
  while (root.n < o.nodes) {
    // One playout: down by the PUCT rule to a leaf, its value back up.
    const path: Node[] = [root];
    const line = [...history];
    const lineKeys = [...keys];
    let node = root;
    let value: number;
    for (;;) {
      if (node.terminal !== undefined) {
        value = node.terminal;
        break;
      }
      if (!node.children) {
        const t = terminalValue(line, lineKeys, rootAt);
        if (t !== undefined) {
          node.terminal = t;
          node.children = [];
          value = t;
          break;
        }
        const answer = await o.net(line);
        evals++;
        expand(node, answer);
        value = answer.wdl.win - answer.wdl.loss;
        break;
      }
      const next = select(node);
      const pos = play(line[line.length - 1]!, next.uci);
      line.push(pos);
      lineKeys.push(key(pos));
      path.push(next);
      node = next;
    }
    // `value` is for the side to move at the leaf; each node keeps it from its mover's side.
    for (let i = path.length - 1; i >= 0; i--) {
      value = -value;
      path[i]!.n++;
      path[i]!.w += value;
    }
    if (o.progress?.(root.n, () => stat(bestChild(root)!)) === false) break;
    // Exact early stop: the runner-up can't catch the leader in the visits left.
    const sorted = [...root.children!].sort((a, b) => b.n - a.n);
    if (sorted.length > 1 && sorted[0]!.n - sorted[1]!.n > o.nodes - root.n) break;
  }
  return resultOf(root, evals, bestChild(root)!);
}

function resultOf(root: Node, evals: number, move: { uci: string; san: string }, forced?: 'mate' | 'only'): SearchResult {
  const rootQ = root.n ? -root.w / root.n : 0;
  const moves = [...(root.children ?? [])].sort((a, b) => (better(a, b) ? -1 : 1)).map(stat);
  const chosen = root.children?.find((c) => c.uci === move.uci);
  const pv: string[] = [move.san];
  let node = chosen;
  while (node?.children?.length) {
    const next = bestChild(node);
    if (!next || !next.n) break;
    pv.push(next.san);
    node = next;
  }
  // Lc0 reports its move's Q (the root's own mixes in what the search tried and left).
  const qMover = forced === 'mate' ? 1 : chosen?.n ? chosen.w / chosen.n : rootQ;
  const wdl = { win: Math.max(0, qMover), draw: 1 - Math.abs(qMover), loss: Math.max(0, -qMover) };
  return { uci: move.uci, san: move.san, nodes: root.n, evals, q: qMover, cp: lc0Centipawns(wdl), moves, pv, ...(forced ? { forced } : {}) };
}
