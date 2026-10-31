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
//
// §5.130: a list is kept as a `checklist` event (its lines, reserve and gaps as moves from the
// start, with their shares; the latest per study and side), and what is shown is derived from it:
// `recordOf` and `linesOf` go each way, `shownLines` takes out the excluded lines and those wholly
// paused since (filled from the reserve), and marks the lines the study no longer plays. The walk
// reads the study's active lines only (`studyMovesOf`), so a paused branch is neither a line nor
// an uncovered reply.
//
// §5.142: a line added by hand (a `pick` event on `t|<sid>`, its moves from the start) is shown
// after the made list's lines whatever Make again lists, and Make leaves its leaf to it. It needs
// only the study to play it: any of the study's moves at its side's positions, and the last move
// may be a reply the study only reaches. A picked line the made list has too is shown once, in the
// list's place, marked added.
import { Chess, type Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import type { ChecklistLine } from '../progress/events.ts';
import type { Occurrence, RepertoireIndex } from '../repertoire/index.ts';
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
  /** Whether the study plays this move here (any of its moves, where it has two). */
  plays?(key: PositionKey, uci: string): boolean;
  /** Whether the study has a move here on any line, paused ones too: a reply it knows is never a gap. */
  knows?(key: PositionKey): boolean;
  /** Whether a move of the study reaches this position (on any line, or an active one). */
  reaches?(key: PositionKey): boolean;
}

/**
 * A study's own moves for one side, from the repertoire index: every chapter of that side, or with
 * `activeOnly` only the moves on lines that aren't paused (§5.70), so a wholly paused branch is
 * as if the study didn't have it.
 */
export function studyMovesOf(index: RepertoireIndex, sid: string, color: Color, sideOf: (cid: string) => Color | undefined, activeOnly: boolean): StudyMoves {
  let active: Map<string, Set<string>> | undefined;
  if (activeOnly) {
    active = new Map();
    for (const line of index.lines) {
      if (line.sid !== sid || line.paused) continue;
      let set = active.get(line.cid);
      if (!set) active.set(line.cid, (set = new Set()));
      let prefix = '';
      for (const san of line.path) set.add((prefix = prefix ? `${prefix} ${san}` : san));
    }
  }
  const ofStudy = (o: Occurrence) => o.sid === sid && sideOf(o.cid) === color;
  const ok = (o: Occurrence) => ofStudy(o) && (!active || !!active.get(o.cid)?.has(o.path.join(' ')));
  const memo = new Map<PositionKey, string[]>();
  const own = (key: PositionKey) => {
    let out = memo.get(key);
    if (!out) memo.set(key, (out = [...(index.positions.get(key)?.own ?? [])].filter(([, places]) => places.some(ok)).map(([uci]) => uci)));
    return out;
  };
  const knows = (key: PositionKey) => [...(index.positions.get(key)?.own.values() ?? [])].some((places) => places.some(ofStudy));
  const reaches = (key: PositionKey) => (index.reached.get(key) ?? []).some(ok);
  return { moveAt: (key) => own(key)[0], covers: (key) => own(key).length > 0, plays: (key, uci) => own(key).includes(uci), knows, reaches };
}

/** Whether the study still plays a line as the walk made it: its own moves, and a position it covers after each reply. */
export function studyPlays(study: StudyMoves, color: Color, lineUci: readonly string[]): boolean {
  const pos = Chess.default();
  for (const uci of lineUci) {
    const move = parseUciMove(pos, uci);
    if (!move) return false;
    if (pos.turn === color) {
      const key = positionKeyOf(pos);
      if (!(study.plays ? study.plays(key, uci) : study.moveAt(key) === uci)) return false;
      pos.play(move);
    } else {
      pos.play(move);
      if (!study.covers(positionKeyOf(pos))) return false;
    }
  }
  return true;
}

/**
 * Whether the study has a line picked by hand (§5.142): its own moves at its side's positions, a
 * position it covers after each reply but the last, which it need only reach (a line may end on
 * the opponent's move).
 */
export function studyHasLine(study: StudyMoves, color: Color, lineUci: readonly string[]): boolean {
  if (!lineUci.length) return false;
  const last = lineUci.length - 1;
  if (!studyPlays(study, color, lineUci.slice(0, last))) return false;
  const pos = Chess.default();
  for (const uci of lineUci.slice(0, last)) pos.play(parseUciMove(pos, uci)!);
  const move = parseUciMove(pos, lineUci[last]!);
  if (!move) return false;
  if (pos.turn === color) return study.plays ? study.plays(positionKeyOf(pos), lineUci[last]!) : study.moveAt(positionKeyOf(pos)) === lineUci[last];
  pos.play(move);
  const key = positionKeyOf(pos);
  return study.covers(key) || !!study.reaches?.(key);
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
      const nextKey = positionKeyOf(next);
      if (study.covers(nextKey)) covered.push({ next, uci, san, raw: share ?? MISSING_PROB, share: 0 });
      else if (share !== undefined && share >= GAP_MIN_PROB && !study.knows?.(nextKey)) gaps.push({ afterFen: makeFen(next.toSetup()), lineUci: [...lineUci, uci], lineSan: [...lineSan, san], reachProb: pathProb * share });
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

/** A list as its `checklist` event keeps it: each line its moves (UCI, spaced) and share. */
export function recordOf(list: Checklist): { lines: ChecklistLine[]; reserve: ChecklistLine[]; gaps: ChecklistLine[] } {
  const line = (v: Variation): ChecklistLine => ({ m: v.lineUci.join(' '), p: v.cumProb });
  return { lines: list.variations.map(line), reserve: list.reserve.map(line), gaps: list.gaps.map((g) => ({ m: g.lineUci.join(' '), p: g.reachProb })) };
}

/** Lines played from the start: the moves, the SANs, the position reached; a line with an illegal move is left out. */
function replayed(lines: readonly ChecklistLine[]): { lineUci: string[]; lineSan: string[]; pos: Position; p: number }[] {
  const out: { lineUci: string[]; lineSan: string[]; pos: Position; p: number }[] = [];
  for (const l of lines) {
    const pos = Chess.default();
    const lineUci = l.m.split(' ');
    const lineSan: string[] = [];
    let legal = true;
    for (const uci of lineUci) {
      const move = parseUciMove(pos, uci);
      if (!move) {
        legal = false;
        break;
      }
      lineSan.push(makeSan(pos, move));
      pos.play(move);
    }
    if (legal) out.push({ lineUci, lineSan, pos, p: l.p });
  }
  return out;
}

/** The variations of a kept list (its lines or its reserve). */
export function linesOf(lines: readonly ChecklistLine[]): Variation[] {
  return replayed(lines).map((l) => ({ leafKey: positionKeyOf(l.pos), leafFen: makeFen(l.pos.toSetup()), lineUci: l.lineUci, lineSan: l.lineSan, cumProb: l.p }));
}

/** The uncovered replies of a kept list. */
export function gapsOf(lines: readonly ChecklistLine[]): ChecklistGap[] {
  return replayed(lines).map((l) => ({ afterFen: makeFen(l.pos.toSetup()), lineUci: l.lineUci, lineSan: l.lineSan, reachProb: l.p }));
}

export interface ShownLine {
  v: Variation;
  /** The study no longer plays it (edited since the list was made): kept in its place, struck through. */
  gone: boolean;
  /** Added by hand (§5.142), kept whatever Make again lists: `too` where the made list has it as well, `only` where it doesn't (no share then). */
  added?: 'too' | 'only';
  /** An added line wholly paused in training: shown all the same (§5.142). */
  paused?: true;
}

/**
 * The lines picked for one side, from its study's `pick` events in replay order: each one's moves,
 * the most recently added last; one taken off (`on: false`) is gone until added again.
 */
export function picksOf(events: readonly { color: Color; m: string; on: boolean }[], color: Color): string[] {
  const on = new Set<string>();
  for (const e of events) {
    if (e.color !== color) continue;
    on.delete(e.m);
    if (e.on) on.add(e.m);
  }
  return [...on];
}

/**
 * The picked lines added to what a list shows (§5.142): one the list shows already is marked added
 * there (`too`); the others follow (`only`) in the order picked, a line the study no longer has
 * kept `gone`. Neither an exclusion nor a pause hides one: picking a line is asking for it (with
 * Prioritize, most deep lines are paused until added to training); one wholly paused is marked
 * `paused`, and a made-list line hidden as paused that is picked comes back, out of the count. Two
 * picks reaching one position are one line (results are kept by position).
 */
export function withPicks(shown: { lines: readonly ShownLine[]; paused: number; pausedLeaves?: readonly string[] }, picks: readonly Variation[], color: Color, study: { all: StudyMoves; active: StudyMoves }): { lines: ShownLine[]; paused: number } {
  const lines = shown.lines.map((l) => ({ ...l }));
  const at = new Map(lines.map((l, i) => [l.v.leafKey, i]));
  let paused = shown.paused;
  const counted = new Set<string>();
  for (const v of picks) {
    const i = at.get(v.leafKey);
    if (i !== undefined && !lines[i]!.gone) {
      lines[i]!.added ??= 'too';
      continue;
    }
    const gone = !studyHasLine(study.all, color, v.lineUci);
    const line: ShownLine = { v, gone, added: 'only' };
    if (!gone && !studyHasLine(study.active, color, v.lineUci)) line.paused = true;
    if (shown.pausedLeaves?.includes(v.leafKey) && !counted.has(v.leafKey)) {
      counted.add(v.leafKey);
      paused--;
    }
    if (i !== undefined) lines[i] = line;
    else {
      at.set(v.leafKey, lines.length);
      lines.push(line);
    }
  }
  return { lines, paused };
}

/**
 * What a kept list shows: its lines less the excluded and the wholly paused ones, filled from the
 * reserve in order up to `count`; a line the study no longer plays stays in its place, `gone`.
 * `paused`: the list's lines hidden because they are paused now (`pausedLeaves` their leaves).
 */
export function shownLines(list: { variations: readonly Variation[]; reserve: readonly Variation[]; count: number }, color: Color, excluded: ReadonlySet<string>, study: { all: StudyMoves; active: StudyMoves }): { lines: ShownLine[]; paused: number; pausedLeaves: string[] } {
  const state = (v: Variation) => (excluded.has(v.leafKey) ? 'out' : !studyPlays(study.all, color, v.lineUci) ? 'gone' : !studyPlays(study.active, color, v.lineUci) ? 'paused' : 'on');
  const lines: ShownLine[] = [];
  const seen = new Set<string>();
  const pausedLeaves: string[] = [];
  for (const v of list.variations) {
    const s = state(v);
    if (s === 'paused') pausedLeaves.push(v.leafKey);
    if (s === 'out' || s === 'paused' || seen.has(v.leafKey)) continue;
    seen.add(v.leafKey);
    lines.push({ v, gone: s === 'gone' });
  }
  for (const v of list.reserve) {
    if (lines.length >= list.count) break;
    if (seen.has(v.leafKey) || state(v) !== 'on') continue;
    seen.add(v.leafKey);
    lines.push({ v, gone: false });
  }
  return { lines, paused: pausedLeaves.length, pausedLeaves };
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
