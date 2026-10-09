// Prioritizing a study (PLAN.md §5.70): its lines ranked by how likely the owner is to face them
// and how much knowing them matters. Pure: the explorer and Maia come in as functions.
// - Reach: along each line, every opponent's move takes its share among the replies the scope
//   covers at that position (coverage gathered by position key, so a transposition has the same
//   shares wherever it is reached), from the explorer; Maia's where the explorer has under
//   `MIN_GAMES` games and Maia is there; a covered reply neither knows gets `MISSING_PROB`, as
//   the script and the checklist do. An own move passes the reach on.
// - Natural moves: `p`, how often the side to move plays the repertoire's move (the explorer's
//   share, or Maia's where the explorer is thin); unknown counts as 0, "wouldn't find it".
// - The order is greedy by marginal value: reach × (1 − Π p) over the line's moves not covered
//   by a line taken before it or learned already, so shared moves count once. Lines taken first
//   (`first`: must-learn lines, or the active ones when growing) keep the index's order. Learned
//   moves count as taken only when learned lines are kept outside the number (`keepLearned`);
//   otherwise a learned line competes like any other, or the best lines, learned first, would
//   rank last and be the ones paused.
// - Scoring (the lookups) and ordering are apart, so the panel's checkboxes re-order at once.
// - Gaps: replies the scope doesn't cover, played at least `GAP_MIN_PROB` of the time at a
//   position it reaches, by reach.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import type { CardId } from '../progress/cards.ts';
import type { Line } from './index.ts';

export const MISSING_PROB = 0.0002;
export const GAP_MIN_PROB = 0.08;
export const MIN_GAMES = 20;
/** A move found less often than this counts as hard to find. */
export const HARD_P = 0.3;
export const MAX_GAPS = 10;

/** The explorer at a position: its game count, and each move's share of the games (its UCI as the explorer writes it). */
export interface Shares {
  total: number;
  moves: readonly { uci: string; san: string; share: number }[];
}
export type ExplorerShares = (fen: string) => Promise<Shares>;
/** Maia's probabilities at a position, by standard UCI; undefined when Maia isn't there. */
export type MaiaShares = (fen: string) => Promise<ReadonlyMap<string, number> | undefined>;

/** What scoring needs: the lines, and the explorer and Maia to look their positions up in. */
export interface ScoreInput {
  /** The scope's lines for one side, in the index's order. */
  lines: readonly Line[];
  startOf: (line: Line) => Position | undefined;
  explorer: ExplorerShares;
  maia?: MaiaShares;
  onProgress?: (done: number, total: number) => void;
}

/** What ordering needs: no lookups, so a change of these re-orders at once. */
export interface OrderInput {
  /** A card taught or reviewed already. */
  learned: (card: CardId) => boolean;
  /** Natural moves count less (`1 − Π p`); off ranks by reach alone. */
  natural: boolean;
  /** Lines taken before the ranking proper, in the index's order (must-learn, or the active ones). */
  first?: (line: Line) => boolean;
  /**
   * Learned lines are kept outside the number, so their moves cost nothing more and a line with
   * nothing else to learn goes last. Off (default on), they are ranked like any other line: a
   * learned line not kept is paused, so its moves count as much as anyone's.
   */
  keepLearned?: boolean;
}

export type PriorityInput = ScoreInput & OrderInput;

export interface RankedLine {
  line: Line;
  /** 1-based. */
  rank: number;
  /** The line's share of the games reaching the scope. */
  reach: number;
  /** Its marginal value when it was taken. */
  value: number;
  /** Own moves played less than `HARD_P` of the time; and those with no numbers. */
  hard: number;
  unknown: number;
  /** Every own move of it taught or reviewed. */
  learned: boolean;
  /** Taken by `first`. */
  first: boolean;
  /** A chapter starting from a FEN no line of the scope reaches: its reach starts at 1. */
  ownStart?: true;
}

export interface PriorityGap {
  /** Where the reply is played: a line's chapter and the moves to the position. */
  sid: string;
  cid: string;
  path: string[];
  san: string;
  uci: string;
  /** The reply's share there, and the reach of the position times it. */
  share: number;
  reach: number;
}

export interface Ranking {
  lines: RankedLine[];
  gaps: PriorityGap[];
  /** The sum of every line's reach: the coverage's denominator. */
  totalReach: number;
  /** Positions looked up. */
  lookups: number;
}

/** One move of a line, walked. */
interface Step {
  key: PositionKey;
  fen: string;
  uci: string;
  san: string;
  own: boolean;
  card?: CardId;
}

interface Walked {
  line: Line;
  steps: Step[];
  startKey: PositionKey;
  /** The position at the line's end. */
  endKey: PositionKey;
  fromStandard: boolean;
}

const STANDARD_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -' as PositionKey;

function walk(line: Line, start: Position): Walked | undefined {
  const pos = start.clone();
  const startKey = positionKeyOf(pos);
  const own = new Map<number, CardId>();
  line.plies.forEach((ply, i) => own.set(ply, line.cards[i]!));
  const steps: Step[] = [];
  for (let i = 0; i < line.path.length; i++) {
    const move = parseSan(pos, line.path[i]!);
    if (!move || !isNormal(move)) return undefined;
    const step: Step = { key: positionKeyOf(pos), fen: makeFen(pos.toSetup()), uci: standardUci(pos, move), san: makeSan(pos, move), own: own.has(i) };
    const card = own.get(i);
    if (card) step.card = card;
    steps.push(step);
    pos.play(move);
  }
  return { line, steps, startKey, endKey: positionKeyOf(pos), fromStandard: startKey === STANDARD_KEY };
}

const bare = (san: string) => san.replace(/[+#]/g, '');
/** The explorer's move that is this one: by UCI, else by SAN (castling is written either way). */
const sameMove = (m: { uci: string; san: string }, uci: string, san: string) => m.uci === uci || bare(m.san) === bare(san);
const shareOf = (e: Shares, uci: string, san: string) => e.moves.find((m) => sameMove(m, uci, san))?.share;

/** A scope's lines looked up: reach and natural moves, ready to order (`orderLines`). */
export interface Scored {
  walked: readonly Walked[];
  reachOf: ReadonlyMap<Line, { reach: number; ownStart?: true }>;
  /** Each own move's p, by card; undefined where nothing knows it. */
  pOf: ReadonlyMap<CardId, number | undefined>;
  gaps: PriorityGap[];
  totalReach: number;
  lookups: number;
}

export async function scoreLines(input: ScoreInput): Promise<Scored> {
  const walked: Walked[] = [];
  for (const line of input.lines) {
    const start = input.startOf(line);
    const w = start && walk(line, start);
    if (w) walked.push(w);
  }

  // Coverage at the opponent's positions, and every position to look up (one lookup each).
  const covered = new Map<PositionKey, Map<string, string>>();
  const fens = new Map<PositionKey, string>();
  for (const w of walked)
    for (const s of w.steps) {
      if (!fens.has(s.key)) fens.set(s.key, s.fen);
      if (s.own) continue;
      const here = covered.get(s.key) ?? new Map<string, string>();
      here.set(s.uci, s.san);
      covered.set(s.key, here);
    }
  const explorer = new Map<PositionKey, Shares>();
  const maia = new Map<PositionKey, ReadonlyMap<string, number> | undefined>();
  let done = 0;
  for (const [key, fen] of fens) {
    const shares = await input.explorer(fen);
    explorer.set(key, shares);
    if (shares.total < MIN_GAMES && input.maia) maia.set(key, await input.maia(fen));
    input.onProgress?.(++done, fens.size);
  }

  /** How often a move is played at a position: the explorer's, or Maia's where it is thin. */
  const playedShare = (key: PositionKey, uci: string, san: string): number | undefined => {
    const e = explorer.get(key);
    if (e && e.total >= MIN_GAMES) return shareOf(e, uci, san) ?? 0;
    const m = maia.get(key);
    if (m) return m.get(uci) ?? 0;
    return e && e.total > 0 ? (shareOf(e, uci, san) ?? 0) : undefined;
  };
  /** A covered reply's share among the covered replies there. */
  const replyShare = new Map<string, number>();
  for (const [key, replies] of covered) {
    const raw = [...replies].map(([uci, san]) => [uci, Math.max(playedShare(key, uci, san) ?? 0, MISSING_PROB)] as const);
    const sum = raw.reduce((a, [, p]) => a + p, 0);
    for (const [uci, p] of raw) replyShare.set(`${key}|${uci}`, p / sum);
  }

  // Reach: lines from the standard start first, so a FEN chapter can hang where they reach its start.
  const reachAt = new Map<PositionKey, number>();
  const reachOf = new Map<Line, { reach: number; ownStart?: true }>();
  const order = [...walked.filter((w) => w.fromStandard), ...walked.filter((w) => !w.fromStandard)];
  for (const w of order) {
    const hung = w.fromStandard ? 1 : reachAt.get(w.startKey);
    let reach = hung ?? 1;
    const note = (key: PositionKey) => {
      if (!reachAt.has(key) || reachAt.get(key)! < reach) reachAt.set(key, reach);
    };
    for (const s of w.steps) {
      note(s.key);
      if (!s.own) reach *= replyShare.get(`${s.key}|${s.uci}`) ?? MISSING_PROB;
    }
    note(w.endKey);
    reachOf.set(w.line, hung === undefined ? { reach, ownStart: true } : { reach });
  }

  // Each own move's p, by card (its first occurrence decides).
  const pOf = new Map<CardId, number | undefined>();
  for (const w of walked) for (const s of w.steps) if (s.card && !pOf.has(s.card)) pOf.set(s.card, playedShare(s.key, s.uci, s.san));

  // Gaps: uncovered replies played at least GAP_MIN_PROB of the time, by reach, one per position after.
  const gapAt = new Map<string, PriorityGap>();
  for (const w of order)
    w.steps.forEach((s, i) => {
      if (s.own) return;
      const e = explorer.get(s.key);
      if (!e || e.total === 0) return;
      const here = [...covered.get(s.key)!];
      for (const m of e.moves) {
        if (m.share < GAP_MIN_PROB || here.some(([uci, san]) => sameMove(m, uci, san))) continue;
        const reach = (reachAt.get(s.key) ?? 0) * m.share;
        const id = `${s.key}|${bare(m.san)}`;
        const before = gapAt.get(id);
        if (before && before.reach >= reach) continue;
        gapAt.set(id, { sid: w.line.sid, cid: w.line.cid, path: w.line.path.slice(0, i), san: m.san, uci: m.uci, share: m.share, reach });
      }
    });
  const gaps = [...gapAt.values()].sort((a, b) => b.reach - a.reach).slice(0, MAX_GAPS);
  const totalReach = walked.reduce((a, w) => a + reachOf.get(w.line)!.reach, 0);
  return { walked, reachOf, pOf, gaps, totalReach, lookups: fens.size };
}

/** The scored lines in order: must-learn (or active) lines first, then greedy by marginal value. */
export function orderLines(scored: Scored, input: OrderInput): Ranking {
  const { walked, reachOf, pOf } = scored;
  const keepLearned = input.keepLearned ?? true;
  const info = walked.map((w) => {
    const cards = [...new Set(w.line.cards)];
    const ps = cards.map((c) => pOf.get(c));
    return {
      w,
      cards,
      reach: reachOf.get(w.line)!,
      hard: ps.filter((p) => p !== undefined && p < HARD_P).length,
      unknown: ps.filter((p) => p === undefined).length,
      learned: cards.length > 0 && cards.every((c) => input.learned(c)),
    };
  });
  const taken = new Set<CardId>();
  if (keepLearned) for (const i of info) for (const c of i.cards) if (input.learned(c)) taken.add(c);
  const valueOf = (cards: readonly CardId[], reach: number) => {
    let keep = 1;
    let any = false;
    for (const c of cards) {
      if (taken.has(c)) continue;
      any = true;
      keep *= input.natural ? (pOf.get(c) ?? 0) : 0;
    }
    return any ? reach * (1 - keep) : 0;
  };

  const out: RankedLine[] = [];
  const take = (i: (typeof info)[number], value: number, first: boolean) => {
    const r: RankedLine = { line: i.w.line, rank: out.length + 1, reach: i.reach.reach, value, hard: i.hard, unknown: i.unknown, learned: i.learned, first };
    if (i.reach.ownStart) r.ownStart = true;
    out.push(r);
    for (const c of i.cards) taken.add(c);
  };
  let rest = info;
  if (input.first) {
    const firsts = info.filter((i) => input.first!(i.w.line));
    for (const i of firsts) take(i, valueOf(i.cards, i.reach.reach), true);
    rest = info.filter((i) => !input.first!(i.w.line));
  }
  // Greedy: values only fall as moves are taken, so a stale value is an upper bound (lazy greedy).
  const pending = rest.map((i, at) => ({ i, at, value: valueOf(i.cards, i.reach.reach) }));
  while (pending.length > 0) {
    let best = -1;
    for (let k = 0; k < pending.length; k++) {
      const p = pending[k]!;
      if (best >= 0 && (p.value < pending[best]!.value || (p.value === pending[best]!.value && p.at > pending[best]!.at))) continue;
      p.value = valueOf(p.i.cards, p.i.reach.reach);
      if (best < 0 || p.value > pending[best]!.value || (p.value === pending[best]!.value && p.at < pending[best]!.at)) best = k;
    }
    const [chosen] = pending.splice(best, 1);
    take(chosen!.i, chosen!.value, false);
  }
  return { lines: out, gaps: scored.gaps, totalReach: scored.totalReach, lookups: scored.lookups };
}

export async function rankLines(input: PriorityInput): Promise<Ranking> {
  return orderLines(await scoreLines(input), input);
}

/**
 * The lines to keep active: every line taken `first` (must-learn), the lines already learned when
 * `keepLearned` (they don't use the number), and then the best-ranked others up to `count`.
 */
export function keptLines(ranking: Ranking, count: number, keepLearned: boolean): Set<Line> {
  const kept = new Set<Line>();
  let used = 0;
  for (const r of ranking.lines) {
    if (keepLearned && r.learned) kept.add(r.line);
    else if (r.first || used < count) {
      kept.add(r.line);
      used++;
    }
  }
  return kept;
}

/** The share of the scope's games the kept lines reach. */
export function coverageOf(ranking: Ranking, kept: ReadonlySet<Line>): number {
  if (ranking.totalReach === 0) return 0;
  let sum = 0;
  for (const r of ranking.lines) if (kept.has(r.line)) sum += r.reach;
  return sum / ranking.totalReach;
}
