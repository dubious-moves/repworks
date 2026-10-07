// The variation checklist (PLAN.md §5.62), a port of mistake-lab's `generateTodoVariations` and its
// completion rules (`c525403`): a repertoire study's covered tree from the start, walked with the
// study's own move at each of its side's positions and every covered reply at the opponent's,
// scored by the explorer (ratings 1600–2500, blitz to correspondence; a covered reply the explorer
// doesn't know gets a tiny share), and a fixed number of slots apportioned over it by d'Hondt
// (each opponent node's slots split by its replies' shares, capped by their subtrees' leaves, so
// an exhausted subtree passes its remainder on). The reserve: the next leaves in the order they
// would join. Exclusions (`drop` events on `c|<leafKey>`) give a leaf no capacity. Gaps: replies
// the study doesn't cover, played at least 8% of the time. Completion is derived from practice
// results at the leaf: a win at a preset checks it off; the chips show the last five attempts.
// Pure: the explorer's shares come in through `probs`.
import { Chess, type Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import type { Color } from './record.ts';

export const RANK_RATINGS = [1600, 1800, 2000, 2200, 2500];
export const RANK_SPEEDS = ['blitz', 'rapid', 'classical', 'correspondence'];
/** mistake-lab's `REP_TODO_PRESETS`: they change the opponent only, never the ranking. */
export const PRESETS = {
  easy: { label: 'Easy', ratings: [1600, 1800], maiaElo: 1750, precision: 0.65 },
  medium: { label: 'Medium', ratings: [1600, 1800, 2000, 2200], maiaElo: 2000, precision: 0.75 },
  hard: { label: 'Hard', ratings: [2000, 2200, 2500], maiaElo: 2150, precision: 0.85 },
} as const;
export type Preset = keyof typeof PRESETS;
export const PRESET_ORDER: readonly Preset[] = ['easy', 'medium', 'hard'];
export const WINRATE_WINDOW = 5;
const MISSING_PROB = 0.0002;
const GAP_MIN_PROB = 0.08;
const RESERVE_EXTRA = 10;

export interface ChecklistOptions {
  /** Plies to a leaf; 0 for the end of the study's coverage. */
  targetPly: number;
  maxVariations: number;
  maxGaps: number;
  maxCalls: number;
  maxNodes: number;
  exclude: ReadonlySet<string>;
}
export const DEFAULT_OPTIONS: ChecklistOptions = { targetPly: 10, maxVariations: 10, maxGaps: 10, maxCalls: 2500, maxNodes: 20000, exclude: new Set() };

export interface Variation {
  leafKey: PositionKey;
  leafFen: string;
  lineUci: string[];
  lineSan: string[];
  /** The line's share of the covered traffic (its reach). */
  cumProb: number;
}
export interface ChecklistGap {
  afterFen: string;
  lineUci: string[];
  lineSan: string[];
  reachProb: number;
}
export interface Checklist {
  variations: Variation[];
  reserve: Variation[];
  gaps: ChecklistGap[];
  calls: number;
  truncated: boolean;
}

/** The study's move at its side's positions (its first), and whether the study has a move at a position. */
export interface StudyMoves {
  moveAt(key: PositionKey): string | undefined;
  covers(key: PositionKey): boolean;
}

/** The explorer's shares at a position, by standard UCI and by `s:<SAN without +#>`; empty when it has none. */
export type Probs = (fen: string) => Promise<ReadonlyMap<string, number>>;

type Leaf = { type: 'leaf'; leafKey: PositionKey; leafFen: string; lineUci: string[]; lineSan: string[]; pathProb: number; capacity: number };
type Branch = { type: 'branch'; children: { share: number; node: TreeNode }[]; capacity: number };
type TreeNode = Leaf | Branch;

function legalMoves(pos: Position): NormalMove[] {
  const out: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from);
      const promoting = piece?.role === 'pawn' && ((to >> 3) === 7 || (to >> 3) === 0);
      if (promoting) for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as const) out.push({ from, to, promotion });
      else out.push({ from, to });
    }
  }
  return out;
}

export async function generateChecklist(color: Color, study: StudyMoves, probs: Probs, opts: Partial<ChecklistOptions> = {}, onProgress: (calls: number) => void = () => undefined): Promise<Checklist> {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const memo = new Map<string, ReadonlyMap<string, number>>();
  let calls = 0;
  let nodes = 0;
  let truncated = false;
  const moveProbs = async (fen: string, key: PositionKey) => {
    const known = memo.get(key);
    if (known) return known;
    calls++;
    onProgress(calls);
    const p = await probs(fen);
    memo.set(key, p);
    return p;
  };
  const gaps: ChecklistGap[] = [];
  const visiting = new Set<PositionKey>();
  const makeLeaf = (pos: Position, lineUci: string[], lineSan: string[], pathProb: number): Leaf => {
    const leafKey = positionKeyOf(pos);
    return { type: 'leaf', leafKey, leafFen: makeFen(pos.toSetup()), lineUci, lineSan, pathProb, capacity: o.exclude.has(leafKey) ? 0 : 1 };
  };

  async function enumerate(pos: Position, lineUci: string[], lineSan: string[], ply: number, pathProb: number): Promise<TreeNode> {
    if (nodes >= o.maxNodes) {
      truncated = true;
      return makeLeaf(pos, lineUci, lineSan, pathProb);
    }
    nodes++;
    const key = positionKeyOf(pos);
    if (o.targetPly > 0 && ply >= o.targetPly) return makeLeaf(pos, lineUci, lineSan, pathProb);
    if (visiting.has(key)) return makeLeaf(pos, lineUci, lineSan, pathProb);
    if (pos.turn === color) {
      const uci = study.moveAt(key);
      const move = uci ? parseUciMove(pos, uci) : undefined;
      if (!uci || !move) return makeLeaf(pos, lineUci, lineSan, pathProb);
      const next = pos.clone();
      const san = makeSan(pos, move);
      next.play(move);
      visiting.add(key);
      const sub = await enumerate(next, [...lineUci, uci], [...lineSan, san], ply + 1, pathProb);
      visiting.delete(key);
      return sub;
    }
    const p = calls < o.maxCalls ? await moveProbs(makeFen(pos.toSetup()), key) : new Map<string, number>();
    const covered: { next: Position; uci: string; san: string; raw: number; share: number }[] = [];
    for (const move of legalMoves(pos)) {
      const next = pos.clone();
      const san = makeSan(pos, move);
      const uci = standardUci(pos, move);
      next.play(move);
      const share = p.get(uci) ?? p.get(`s:${san.replace(/[+#]/g, '')}`);
      if (study.covers(positionKeyOf(next))) covered.push({ next, uci, san, raw: share ?? MISSING_PROB, share: 0 });
      else if (share !== undefined && share >= GAP_MIN_PROB) gaps.push({ afterFen: makeFen(next.toSetup()), lineUci: [...lineUci, uci], lineSan: [...lineSan, san], reachProb: pathProb * share });
    }
    if (!covered.length) return makeLeaf(pos, lineUci, lineSan, pathProb);
    const total = covered.reduce((s, c) => s + c.raw, 0) || 1;
    for (const c of covered) c.share = c.raw / total;
    covered.sort((a, b) => b.share - a.share);
    visiting.add(key);
    const children: Branch['children'] = [];
    let capacity = 0;
    for (const c of covered) {
      const node = await enumerate(c.next, [...lineUci, c.uci], [...lineSan, c.san], ply + 1, pathProb * c.share);
      children.push({ share: c.share, node });
      capacity += node.capacity;
    }
    visiting.delete(key);
    return { type: 'branch', children, capacity };
  }

  const root = await enumerate(Chess.default(), [], [], 0, 1);
  const selectedRaw = root.capacity <= o.maxVariations ? collectAllLeaves(root, []) : selectLeaves(root, o.maxVariations, []);
  const seen = new Set<string>();
  const selected: Leaf[] = [];
  for (const l of selectedRaw) {
    if (!l.lineUci.length || seen.has(l.leafKey)) continue;
    seen.add(l.leafKey);
    selected.push(l);
  }
  const reserveSel: Leaf[] = [];
  if (root.capacity > o.maxVariations) {
    const prev = new Set<Leaf>(selectedRaw);
    const maxQ = Math.min(o.maxVariations + RESERVE_EXTRA, root.capacity);
    for (let q = o.maxVariations + 1; q <= maxQ; q++)
      for (const l of selectLeaves(root, q, []))
        if (!prev.has(l)) {
          prev.add(l);
          reserveSel.push(l);
        }
  }
  const reserve: Leaf[] = [];
  for (const l of reserveSel) {
    if (!l.lineUci.length || seen.has(l.leafKey)) continue;
    seen.add(l.leafKey);
    reserve.push(l);
  }
  const toVariation = (l: Leaf): Variation => ({ leafKey: l.leafKey, leafFen: l.leafFen, lineUci: l.lineUci, lineSan: l.lineSan, cumProb: l.pathProb });
  const gapByKey = new Map<string, ChecklistGap>();
  for (const g of gaps) {
    const k = g.afterFen.split(' ').slice(0, 4).join(' ');
    const prev = gapByKey.get(k);
    if (!prev || g.reachProb > prev.reachProb) gapByKey.set(k, g);
  }
  return {
    variations: selected.map(toVariation),
    reserve: reserve.map(toVariation),
    gaps: [...gapByKey.values()].sort((a, b) => b.reachProb - a.reachProb).slice(0, o.maxGaps),
    calls,
    truncated,
  };
}

/** d'Hondt, one slot at a time (divisor share / (allocated + 1)), each child capped by its capacity. */
export function apportionSlots(quota: number, items: readonly { share: number; cap: number }[]): number[] {
  const alloc = items.map(() => 0);
  let toGive = Math.min(quota, items.reduce((s, it) => s + it.cap, 0));
  while (toGive > 0) {
    let best = -1;
    let bestKey = -Infinity;
    for (let i = 0; i < items.length; i++) {
      if (alloc[i]! >= items[i]!.cap) continue;
      const k = items[i]!.share / (alloc[i]! + 1);
      if (k > bestKey) {
        bestKey = k;
        best = i;
      }
    }
    if (best < 0) break;
    alloc[best]!++;
    toGive--;
  }
  return alloc;
}

function collectAllLeaves(node: TreeNode, out: Leaf[]): Leaf[] {
  if (node.type === 'leaf') {
    if (node.capacity > 0) out.push(node);
    return out;
  }
  for (const c of node.children) collectAllLeaves(c.node, out);
  return out;
}

function selectLeaves(node: TreeNode, quota: number, out: Leaf[]): Leaf[] {
  if (quota < 1) return out;
  if (node.type === 'leaf') {
    if (node.capacity > 0) out.push(node);
    return out;
  }
  if (quota >= node.capacity) return collectAllLeaves(node, out);
  const alloc = apportionSlots(
    quota,
    node.children.map((c) => ({ share: c.share, cap: c.node.capacity })),
  );
  node.children.forEach((c, i) => {
    if (alloc[i]! >= 1) selectLeaves(c.node, alloc[i]!, out);
  });
  return out;
}

/** Refills an excluded variation's place from the reserve (`excludeTodoVariation`): the first not excluded nor listed. */
export function excludeVariation(list: { variations: readonly Variation[]; reserve: readonly Variation[] }, leafKey: string, excluded: ReadonlySet<string>): Variation[] {
  const left = list.variations.filter((v) => v.leafKey !== leafKey);
  const refill = list.reserve.find((r) => r.leafKey !== leafKey && !excluded.has(r.leafKey) && !left.some((v) => v.leafKey === r.leafKey));
  return refill ? [...left, refill] : left;
}

/** The presets checked off at a leaf: a win at each (`todoCompletedPresets`). */
export function completedPresets(results: readonly { res: string; preset?: string }[]): Set<Preset> {
  const done = new Set<Preset>();
  for (const r of results) if (r.res === 'win' && r.preset && r.preset in PRESETS) done.add(r.preset as Preset);
  return done;
}

/** Each preset's last five attempts (`todoPresetStats`): a draw half a win, for the display only. */
export function presetStats(results: readonly { res: string; preset?: string }[]): Record<Preset, { n: number; wins: number; rate: number }> {
  const out = {} as Record<Preset, { n: number; wins: number; rate: number }>;
  for (const p of PRESET_ORDER) {
    const recent = results.filter((r) => r.preset === p).slice(-WINRATE_WINDOW);
    const wins = recent.reduce((s, r) => s + (r.res === 'win' ? 1 : r.res === 'draw' ? 0.5 : 0), 0);
    out[p] = { n: recent.length, wins, rate: recent.length ? wins / recent.length : 0 };
  }
  return out;
}

/** A preset can be drilled once the one before it is checked off (or it is done already). */
export const presetOpen = (p: Preset, done: ReadonlySet<Preset>) => {
  const i = PRESET_ORDER.indexOf(p);
  return i === 0 || done.has(p) || done.has(PRESET_ORDER[i - 1]!);
};
