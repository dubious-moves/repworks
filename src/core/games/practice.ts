// Practice (PLAN.md §5.57): playing on from a position against a human-like opponent, mistake-lab's
// continuation practice (`c525403`): the opponent's move from the explorer's games, weighted by
// games (`pickExplorerMove`), then Maia sampled at its precision (`maiaSampleMove`), then Stockfish;
// the advantage drill's tracking and grade (`updateAdvantageTracking`, `finishAdvantage`); the
// result of a game stopped (`evalToResult`); the review (`buildContLineReviewData`: the accuracy,
// the key moves, the eval graph's points); and the history entry (`buildReviewSnapshot`, merged
// as `mergeReviewHistories`). Pure: the dice come in.
import type { Grade } from '../progress/events.ts';
import type { DeviceEvent } from '../progress/replay.ts';
import type { Classification } from './grade.ts';
import type { Color } from './record.ts';

/** mistake-lab's defaults (its continuation settings and constants). */
export const PRACTICE = {
  ratings: [1600, 1800, 2000],
  speeds: ['blitz', 'rapid', 'classical'],
  minGames: 5,
  minFreq: 0.05,
  maiaElo: 2000,
  maiaPrecision: 0.75,
  /** `SILENT_REVIEW_MIN_MOVES`: the user's moves before Stop & Review, and for a history entry. */
  reviewMinMoves: 5,
  /** Claim Victory: three of the user's moves running at +1000. */
  claimCp: 1000,
  claimRuns: 3,
  /** The advantage drill ends at +1 or less (a collapse). */
  collapseCp: 100,
  /** A dip below +2 (by a move giving up more than 2 points) makes a win Good, not Easy. */
  dipCp: 200,
  dipWp: 2,
  /** `REVIEW_HISTORY_CAP`. */
  historyCap: 150,
  /** A key move gives up more than this much win%. */
  keyWp: 5,
} as const;

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
}

/**
 * mistake-lab's `pickExplorerMove`: the moves with at least `minGames` games and `minFreq` of the
 * position's, one drawn weighted by its games; null when none passes.
 */
export function pickExplorerMove<M extends ExplorerMove>(data: { white?: number; draws?: number; black?: number; moves: readonly M[] } | null | undefined, rnd: () => number, o: { minGames: number; minFreq: number } = PRACTICE): M | null {
  if (!data || !data.moves.length) return null;
  const games = (m: ExplorerMove) => m.white + m.draws + m.black;
  // The position's games (the answer's white + draws + black), as mistake-lab reads them.
  const total = data.white !== undefined ? data.white + (data.draws ?? 0) + (data.black ?? 0) : data.moves.reduce((s, m) => s + games(m), 0);
  if (total === 0) return null;
  const candidates = data.moves.filter((m) => games(m) >= o.minGames && games(m) / total >= o.minFreq);
  if (!candidates.length) return null;
  const weight = candidates.reduce((s, m) => s + games(m), 0);
  let r = rnd() * weight;
  for (const m of candidates) {
    r -= games(m);
    if (r <= 0) return m;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * mistake-lab's `maiaSampleMove` on Maia's probabilities (its logits' softmax): precision 1 the
 * likeliest move, else a draw at temperature (1 − precision) × 2.
 */
export function maiaPick<M extends { prob: number }>(policy: readonly M[], precision: number, rnd: () => number): M | null {
  if (!policy.length) return null;
  if (precision >= 1) return policy.reduce((a, b) => (b.prob > a.prob ? b : a));
  const temperature = (1 - precision) * 2;
  const scaled = policy.map((m) => Math.log(Math.max(m.prob, 1e-12)) / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const r = rnd();
  let cumulative = 0;
  for (let i = 0; i < policy.length; i++) {
    cumulative += exps[i]! / sum;
    if (r <= cumulative) return policy[i]!;
  }
  return policy[policy.length - 1]!;
}

/* ------------------------------------------------------------------ the advantage drill */

export interface AdvantageTrack {
  /** The lowest score after a move that gave up more than 2 points (null: none). */
  minCp: number | null;
  /** The user's moves running at +1000. */
  above: number;
}
/** An advantage drill starts at its peak (mistake-lab seeds the lowest score with it); other games with none. */
export const startTrack = (peakCp: number | null = null): AdvantageTrack => ({ minCp: peakCp, above: 0 });

/**
 * `updateAdvantageTracking` after the user's move: its score after, for the user, and the win% it
 * gave up. `collapse` ends the drill (not for a checklist drill, which starts near equal); `claim`
 * offers Claim Victory.
 */
export function trackAdvantage(t: AdvantageTrack, afterCp: number, wpDrop: number, collapses = true): { track: AdvantageTrack; collapse: boolean; claim: boolean } {
  let minCp = t.minCp;
  if (wpDrop > PRACTICE.dipWp && (minCp === null || afterCp < minCp)) minCp = afterCp;
  if (collapses && afterCp <= PRACTICE.collapseCp) return { track: { minCp, above: t.above }, collapse: true, claim: false };
  const above = afterCp >= PRACTICE.claimCp ? t.above + 1 : 0;
  return { track: { minCp, above }, collapse: false, claim: above >= PRACTICE.claimRuns };
}

export type AdvantageOutcome = 'victory' | 'draw' | 'collapse' | 'interrupted';

/** `finishAdvantage`'s grade: a victory Easy (Good after a dip below +2, Hard with a hint), else Again; nothing when interrupted. */
export function advantageGrade(outcome: AdvantageOutcome, t: AdvantageTrack, hint: boolean): Grade | undefined {
  if (outcome === 'interrupted') return undefined;
  if (outcome !== 'victory') return 1;
  if (hint) return 2;
  return t.minCp !== null && t.minCp < PRACTICE.dipCp ? 3 : 4;
}

/** `evalToResult`: a game stopped, by the score for the user (null: drawn). */
export function resultOf(userCp: number | null | undefined): 'win' | 'draw' | 'loss' {
  if (userCp == null) return 'draw';
  if (userCp >= 100) return 'win';
  if (userCp <= -100) return 'loss';
  return 'draw';
}

/* ------------------------------------------------------------------ the review */

/** A move of a practice game, as its history keeps it (mistake-lab's slim move). */
export interface PlayedMove {
  san: string;
  uci: string;
  isUser: boolean;
  classification?: Classification;
  wpDrop?: number;
  cpLoss?: number;
  /** The best line's score before the move, for the user. */
  bestCp?: number;
  /** The score after the move, for the user. */
  afterCp?: number;
  bestMoveUci?: string;
}

export interface Review {
  tally: Record<Classification, number>;
  /** The share of the user's judged moves good or better (book included). */
  accuracy: number;
  /** The moves to revisit: indexes of the user's moves giving up more than 5 points (not the repertoire's), or leaving the repertoire. */
  keyMoves: number[];
  /** Repertoire deviations among the key moves: the repertoire's move there. */
  deviations: Map<number, string>;
  judged: number;
  /** The graph: the score for the user, by move index (−1 the start). */
  evalPoints: { idx: number; cp: number; classification?: Classification }[];
}

const CLASSES: Classification[] = ['great', 'best', 'excellent', 'good', 'book', 'miss', 'inaccuracy', 'mistake', 'blunder'];

/**
 * `buildContLineReviewData`. `repertoire(i)` answers for the user's move at index `i`: whether it
 * is the repertoire's (`own`, never a key move) or the repertoire has another move there (`dev`,
 * the move it has).
 */
export function reviewOf(moves: readonly PlayedMove[], repertoire: (i: number) => { own: boolean; dev?: string } = () => ({ own: false })): Review {
  const tally = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<Classification, number>;
  const userMoves = moves.filter((m) => m.isUser && m.classification);
  for (const m of userMoves) tally[m.classification!]++;
  const good = tally.great + tally.best + tally.excellent + tally.good + tally.book;
  const accuracy = userMoves.length ? Math.round((good / userMoves.length) * 100) : 100;
  const keyMoves: number[] = [];
  const deviations = new Map<number, string>();
  moves.forEach((m, i) => {
    if (!m.isUser) return;
    const rep = repertoire(i);
    if (rep.dev) deviations.set(i, rep.dev);
    const isKey = !!m.classification && (m.wpDrop ?? 0) > PRACTICE.keyWp && !rep.own;
    if (isKey || rep.dev) keyMoves.push(i);
  });
  const evalPoints: Review['evalPoints'] = [];
  const firstUser = moves.find((m) => m.isUser && m.bestCp != null);
  if (firstUser) evalPoints.push({ idx: -1, cp: firstUser.bestCp! });
  moves.forEach((m, i) => {
    if (m.isUser && m.afterCp != null) evalPoints.push({ idx: i, cp: m.afterCp, ...(m.classification ? { classification: m.classification } : {}) });
    else if (m.isUser && m.bestCp != null && m.cpLoss != null) evalPoints.push({ idx: i, cp: m.bestCp - m.cpLoss, ...(m.classification ? { classification: m.classification } : {}) });
    else if (!m.isUser && i > 0) {
      const next = moves.slice(i + 1).find((x) => x.isUser && x.bestCp != null);
      if (next) evalPoints.push({ idx: i, cp: next.bestCp! });
    }
  });
  return { tally, accuracy, keyMoves, deviations, judged: userMoves.length, evalPoints };
}

/* ------------------------------------------------------------------ the history */

export type HistorySource = 'practice' | 'advantage' | 'cont' | 'tactic-cont' | 'todo' | 'checklist';
export type HistoryOutcome = 'win' | 'draw' | 'loss' | 'stopped' | 'ended';

/** A finished practice game (mistake-lab's review snapshot, slim: no FENs). */
export interface HistoryEntry {
  id: string;
  /** When it ended, and last changed (ms). */
  ts: number;
  updatedAt: number;
  baseFen: string;
  playerColor: Color;
  source: string;
  outcome: string;
  /** White-relative centipawns at the end. */
  finalCp: number | null;
  openingName: string;
  accuracy: number | null;
  keyMoveCount: number;
  userMoveCount: number;
  moves: PlayedMove[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A history entry for a game of at least five user moves (`buildReviewSnapshot`); else undefined. */
export function historyEntry(a: { id: string; ts: number; baseFen: string; color: Color; source: HistorySource; outcome: HistoryOutcome; finalCp: number | null; title: string; moves: readonly PlayedMove[]; review: Review }): HistoryEntry | undefined {
  const userMoveCount = a.moves.filter((m) => m.isUser).length;
  if (userMoveCount < PRACTICE.reviewMinMoves) return undefined;
  const moves = a.moves.map((m) => {
    const o: PlayedMove = { san: m.san, uci: m.uci, isUser: m.isUser };
    for (const k of ['classification', 'wpDrop', 'cpLoss', 'bestCp', 'afterCp', 'bestMoveUci'] as const) if (m[k] !== undefined) (o as unknown as Record<string, unknown>)[k] = m[k];
    return o;
  });
  return { id: a.id, ts: a.ts, updatedAt: a.ts, baseFen: a.baseFen, playerColor: a.color, source: a.source, outcome: a.outcome, finalCp: a.finalCp === null ? null : Math.round(a.finalCp), openingName: a.title, accuracy: a.review.judged ? a.review.accuracy : null, keyMoveCount: a.review.keyMoves.length, userMoveCount, moves };
}

/** A `played` event's game read back (mistake-lab's snapshots too); undefined when it can't be reopened. */
export function readHistoryEntry(o: unknown): HistoryEntry | undefined {
  if (!isObj(o) || typeof o['id'] !== 'string' || typeof o['baseFen'] !== 'string' || !Array.isArray(o['moves'])) return undefined;
  const moves: PlayedMove[] = [];
  for (const m of o['moves']) {
    if (!isObj(m) || typeof m['uci'] !== 'string' || typeof m['san'] !== 'string') return undefined;
    const mv: PlayedMove = { san: m['san'], uci: m['uci'], isUser: m['isUser'] === true };
    if (typeof m['classification'] === 'string' && (CLASSES as string[]).includes(m['classification'])) mv.classification = m['classification'] as Classification;
    for (const k of ['wpDrop', 'cpLoss', 'bestCp', 'afterCp'] as const) if (num(m[k]) !== undefined) mv[k] = num(m[k])!;
    if (typeof m['bestMoveUci'] === 'string') mv.bestMoveUci = m['bestMoveUci'];
    moves.push(mv);
  }
  const ts = num(o['ts']) ?? 0;
  return {
    id: o['id'],
    ts,
    updatedAt: num(o['updatedAt']) ?? ts,
    baseFen: o['baseFen'],
    playerColor: o['playerColor'] === 'black' ? 'black' : 'white',
    source: typeof o['source'] === 'string' ? o['source'] : 'practice',
    outcome: typeof o['outcome'] === 'string' ? o['outcome'] : 'ended',
    finalCp: num(o['finalCp']) ?? null,
    openingName: typeof o['openingName'] === 'string' ? o['openingName'] : '',
    accuracy: num(o['accuracy']) ?? null,
    keyMoveCount: num(o['keyMoveCount']) ?? 0,
    userMoveCount: num(o['userMoveCount']) ?? moves.filter((m) => m.isUser).length,
    moves,
  };
}

/**
 * The history (`mergeReviewHistories`): every `played` event's entry, the latest `updatedAt` of
 * an id winning, newest first, the newest 150 kept.
 */
export function historyOf(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const card of cards) {
    if (!card.startsWith('h|')) continue;
    for (const e of eventsOf(card)) {
      if (e.event?.k !== 'played') continue;
      const h = readHistoryEntry(e.event.game);
      if (!h || `h|${h.id}` !== card) continue;
      const had = byId.get(h.id);
      if (!had || h.updatedAt > had.updatedAt) byId.set(h.id, h);
    }
  }
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, PRACTICE.historyCap);
}
