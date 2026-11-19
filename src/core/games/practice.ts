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
  /**
   * Offer draw (the owner's request, 2026-10-30): the opponent accepts from move 20 (ply 40 of the
   * game, counted by the board), when the user's last five moves and the position now are all
   * scored within half a pawn; else it declines, saying nothing of the score.
   */
  drawOfferPly: 40,
  drawishCp: 50,
  drawishRuns: 5,
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

const gamesOf = (m: { white: number; draws: number; black: number }) => m.white + m.draws + m.black;

/** The position's games at the filter (the answer's white + draws + black, as mistake-lab reads them; else the moves'). */
export function explorerTotal(data: { white?: number; draws?: number; black?: number; moves: readonly ExplorerMove[] } | null | undefined): number {
  if (!data) return 0;
  return data.white !== undefined ? data.white + (data.draws ?? 0) + (data.black ?? 0) : data.moves.reduce((s, m) => s + gamesOf(m), 0);
}

/**
 * A prepared opponent (PLAN.md §5.206, Hard): each reply's games weighted by how it scores for the
 * mover in them, e^(`beta` × its score above the position's, in points), the score drawn toward the
 * position's by `prior` games so a reply of a few games can't stand out on luck.
 */
export const PREPARED = { beta: 0.1, prior: 50 } as const;

/**
 * mistake-lab's `pickExplorerMove`: the moves with at least `minGames` games and `minFreq` of the
 * position's, one drawn weighted by its games; null when none passes. `prepared` (the mover's
 * colour): the games weighted by each move's score for the mover (`PREPARED`).
 */
export function pickExplorerMove<M extends ExplorerMove>(data: { white?: number; draws?: number; black?: number; moves: readonly M[] } | null | undefined, rnd: () => number, o: { minGames: number; minFreq: number; prepared?: Color } = PRACTICE): M | null {
  if (!data || !data.moves.length) return null;
  const total = explorerTotal(data);
  if (total === 0) return null;
  const candidates = data.moves.filter((m) => gamesOf(m) >= o.minGames && gamesOf(m) / total >= o.minFreq);
  if (!candidates.length) return null;
  const weightOf = o.prepared ? preparedWeight(data, o.prepared) : gamesOf;
  const weight = candidates.reduce((s, m) => s + weightOf(m), 0);
  let r = rnd() * weight;
  for (const m of candidates) {
    r -= weightOf(m);
    if (r <= 0) return m;
  }
  return candidates[candidates.length - 1]!;
}

/** A move's weight for a prepared opponent of `mover`'s colour at this answer (`PREPARED`). */
function preparedWeight(data: { white?: number; draws?: number; black?: number; moves: readonly ExplorerMove[] }, mover: Color): (m: ExplorerMove) => number {
  const points = (m: { white?: number; draws?: number; black?: number }) => (mover === 'white' ? (m.white ?? 0) : (m.black ?? 0)) + (m.draws ?? 0) / 2;
  const total = explorerTotal(data);
  const mean = data.white !== undefined ? points(data) / total : data.moves.reduce((s, m) => s + points(m), 0) / total;
  return (m) => {
    const score = (points(m) + PREPARED.prior * mean) / (gamesOf(m) + PREPARED.prior);
    return gamesOf(m) * Math.exp(PREPARED.beta * 100 * (score - mean));
  };
}

/**
 * The database's games and Maia's policy as one estimate of what people play (PLAN.md §5.206).
 * Past a line's end the explorer's sample thins move by move, and a move five of twelve players
 * chose is no evidence that people choose it. Maia's policy counts as `k` games beside the
 * sample (fitted to the explorer's own positions: the blend predicts what everyone at the filter
 * plays better than the sample or Maia alone). A position with fewer than `thin` games at the
 * filter is thin: the opponent's move comes from the blend, checked as Maia's moves are; with
 * more, from the games alone, unchecked, as before (a mistake that many players make is one to
 * learn to punish).
 */
export const BLEND = { k: 50, thin: 300 } as const;

/** A move of the blend: `prob` people's odds (the games, Maia's policy as `k` games); `weight` the opponent's (Maia's share at the level's precision). */
export interface BlendMove {
  uci: string;
  prob: number;
  weight: number;
}

/** Maia's odds at a precision, as `maiaPick` draws them: the likeliest alone at 1, else at temperature (1 − precision) × 2. */
export function temperedOdds<M extends { uci: string; prob: number }>(policy: readonly M[], precision: number): Map<string, number> {
  if (!policy.length) return new Map();
  if (precision >= 1) return new Map([[policy.reduce((a, b) => (b.prob > a.prob ? b : a)).uci, 1]]);
  const t = (1 - precision) * 2;
  const scaled = policy.map((m) => Math.log(Math.max(m.prob, 1e-12)) / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return new Map(policy.map((m, i) => [m.uci, exps[i]! / sum]));
}

/**
 * The blend of the database's moves (their UCI as Maia writes it) and Maia's policy, likeliest first:
 * people's odds (games + k × Maia) / (games + k), and the opponent's weights, games + k × Maia at
 * the precision, so with no games the opponent draws as `maiaPick` would and with many as the
 * database does. No policy: the games alone.
 */
export function blendMoves(db: readonly { uci: string; white: number; draws: number; black: number }[], policy: readonly { uci: string; prob: number }[], precision: number, k: number = BLEND.k): BlendMove[] {
  const games = new Map<string, number>();
  for (const m of db) if (gamesOf(m) > 0) games.set(m.uci, (games.get(m.uci) ?? 0) + gamesOf(m));
  const kk = policy.length ? k : 0;
  const n = [...games.values()].reduce((a, b) => a + b, 0);
  if (n + kk === 0) return [];
  const odds = new Map(policy.map((m) => [m.uci, m.prob]));
  const tempered = temperedOdds(policy, precision);
  const ucis = [...new Set([...games.keys(), ...odds.keys()])];
  return ucis
    .map((uci) => ({ uci, prob: ((games.get(uci) ?? 0) + kk * (odds.get(uci) ?? 0)) / (n + kk), weight: (games.get(uci) ?? 0) + kk * (tempered.get(uci) ?? 0) }))
    .sort((a, b) => b.prob - a.prob);
}

/** The chance the database's own draw answers rather than Maia's, unchecked: its games against Maia's `k` (1 with no Maia). */
export const databaseShare = (total: number, maia: boolean, k: number = BLEND.k): number => (!maia ? 1 : total + k > 0 ? total / (total + k) : 0);

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

/**
 * The check on the opponent's move (the owner's requests of 2026-11-19, PLAN.md §5.205): a game won
 * by the opponent's nonsense blunder teaches nothing about the opening, yet a position most players
 * at the rating get wrong should be got wrong about as often. Stockfish scores Maia's likely moves
 * (`guardCandidates`); a move is a blunder when it gives up more than `limitWp` win% against the
 * lower of the best move now and where the opponent stood before the user's move (missing the user's
 * mistake hands the user nothing). A blunder may be played only when it is natural (at least
 * `naturalShare` of the likeliest's probability: people fall for those, and a trap that works is
 * earned). Whether the opponent goes wrong is drawn on Maia's own odds of those natural blunders
 * against the sound moves; which move, at the level's precision (`maiaPick`). The precision alone
 * would make the move most players choose almost certain, a blunder included. Endgames alike.
 */
export const GUARD = { limitWp: 10, naturalShare: 0.5, minProb: 0.02, maxMoves: 8 } as const;

/** Whether `m` is a natural move: at least `naturalShare` of the likeliest move's probability. */
export function naturalMove<M extends { prob: number }>(policy: readonly M[], m: M): boolean {
  const top = policy.reduce((a, b) => Math.max(a, b.prob), 0);
  return m.prob >= GUARD.naturalShare * top;
}

/** The moves Stockfish scores: Maia's of `minProb` or more, the likeliest `maxMoves` (the likeliest always). */
export function guardCandidates<M extends { prob: number }>(policy: readonly M[]): M[] {
  return [...policy].sort((a, b) => b.prob - a.prob).filter((m, i) => i === 0 || m.prob >= GUARD.minProb).slice(0, GUARD.maxMoves);
}

/** Whether the position before the user's move is needed: a candidate gives up more than the limit against the best now. */
export const guardNeedsBefore = (bestWp: number, wps: readonly number[]): boolean => wps.some((w) => bestWp - w > GUARD.limitWp);

/**
 * The opponent's move from the candidates scored (`wp`: the opponent's win% after each), the best
 * move's win% now and the opponent's before the user's move (undefined when not needed or not
 * known). `wrong`: a blunder was played. Null with no candidate. `weight` (the blend's, §5.206):
 * which move drawn by those weights rather than by `prob` at the precision.
 */
export function guardedChoice<M extends { uci: string; prob: number; wp: number; weight?: number }>(policy: readonly { prob: number }[], cands: readonly M[], bestWp: number, beforeWp: number | undefined, precision: number, rnd: () => number): { move: M; wrong: boolean } | null {
  if (!cands.length) return null;
  const reference = beforeWp === undefined ? bestWp : Math.min(bestWp, beforeWp);
  const bad = (m: M) => reference - m.wp > GUARD.limitWp;
  const sound = cands.filter((m) => !bad(m));
  const natural = cands.filter((m) => bad(m) && naturalMove(policy, m));
  // Every likely move a blunder, none natural: the least bad.
  if (!sound.length && !natural.length) return { move: cands.reduce((a, b) => (b.wp > a.wp ? b : a)), wrong: true };
  const mass = (l: readonly M[]) => l.reduce((s, m) => s + m.prob, 0);
  const wrong = !sound.length || (natural.length > 0 && rnd() * (mass(sound) + mass(natural)) < mass(natural));
  const group = wrong ? natural : sound;
  return { move: drawWeighted(group, rnd) ?? maiaPick(group, precision, rnd)!, wrong };
}

/** A move drawn by its `weight`; null when the moves carry none (or none above 0). */
function drawWeighted<M extends { weight?: number }>(moves: readonly M[], rnd: () => number): M | null {
  const total = moves.reduce((s, m) => s + (m.weight ?? 0), 0);
  if (!(total > 0)) return null;
  let r = rnd() * total;
  for (const m of moves) {
    r -= m.weight ?? 0;
    if (r <= 0 && (m.weight ?? 0) > 0) return m;
  }
  return [...moves].reverse().find((m) => (m.weight ?? 0) > 0)!;
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

/* ------------------------------------------------------------------ draws */

/**
 * A draw the game ends on by itself: the position (by key) standing for the third time, the
 * positions before the game's start counted (a checklist's lead-up), or fifty moves of each side
 * with no capture or pawn move (`halfmoves`, the position's clock). Mate and stalemate are the
 * position's own and come first.
 */
export function ruleDraw(keys: readonly string[], halfmoves: number): 'repetition' | 'fifty' | undefined {
  const now = keys[keys.length - 1];
  if (now !== undefined && keys.filter((k) => k === now).length >= 3) return 'repetition';
  if (halfmoves >= 100) return 'fifty';
  return undefined;
}

/** The game's ply at a position, by the board's move number (0 at the start). */
export const plyOf = (fullmoves: number, turn: Color): number => (fullmoves - 1) * 2 + (turn === 'black' ? 1 : 0);

/**
 * Whether the opponent accepts a draw: from `drawOfferPly`, the user's last `drawishRuns` moves
 * scored (for the user, after each) within `drawishCp`, and the position now too. A move not
 * scored (its judge failed) is not level.
 */
export function drawAccepted(o: { ply: number; userCps: readonly (number | undefined)[]; nowCp: number | undefined }): boolean {
  const level = (cp: number | undefined) => cp !== undefined && Math.abs(cp) <= PRACTICE.drawishCp;
  const last = o.userCps.slice(-PRACTICE.drawishRuns);
  return o.ply >= PRACTICE.drawOfferPly && last.length >= PRACTICE.drawishRuns && last.every(level) && level(o.nowCp);
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
  /** The move first tried here and taken back by the repertoire check (mistake-lab's `repTried`). */
  repTried?: { san: string; uci: string };
}

/**
 * The repertoire check on a move about to be played while practising: a move the repertoire
 * doesn't have, at a position where it has one, is taken back (`refuse`, the repertoire's move);
 * unless ignored for this game. At any ply (the owner's request, 2026-10-26; mistake-lab's asks
 * before ply 20 only).
 */
export function repertoireCheck(entries: readonly { uci: string; san?: string }[] | undefined, move: { uci: string; san?: string }, ignored: boolean): { refuse: false } | { refuse: true; uci: string; san: string | undefined } {
  if (ignored || !entries?.length) return { refuse: false };
  if (entries.some((e) => e.uci === move.uci || (!!e.san && e.san === move.san))) return { refuse: false };
  return { refuse: true, uci: entries[0]!.uci, san: entries[0]!.san };
}

/** What the repertoire says of a user's move: its own (`own`), or another move it has there (`dev`); `tried` for a corrected deviation. */
export interface RepertoireVerdict {
  own: boolean;
  dev?: string;
  tried?: string;
}

/**
 * A user's move against the repertoire's moves at its position (the first its main one), as
 * `buildContLineReviewData` stamps `_repDeviation`: a move it doesn't have is a deviation; its own
 * move, played after the repertoire check took back another it doesn't have, a corrected one.
 */
export function repertoireVerdict(entries: readonly { uci: string; san?: string }[] | undefined, move: { uci: string; san?: string; repTried?: { uci: string; san?: string } }): RepertoireVerdict {
  if (!entries?.length) return { own: false };
  const has = (m: { uci: string; san?: string }) => entries.some((e) => e.uci === m.uci || (!!e.san && e.san === m.san));
  if (!has(move)) return { own: false, dev: entries[0]!.uci };
  if (move.repTried && !has(move.repTried)) return { own: true, dev: entries[0]!.uci, tried: move.repTried.uci };
  return { own: true };
}

export interface Review {
  tally: Record<Classification, number>;
  /** The share of the user's judged moves good or better (book included). */
  accuracy: number;
  /** The moves to revisit: indexes of the user's moves giving up more than 5 points (not the repertoire's), or leaving the repertoire. */
  keyMoves: number[];
  /** Repertoire deviations among the key moves: the repertoire's move there. */
  deviations: Map<number, string>;
  /** The corrected ones among them: the move first tried. */
  corrected: Map<number, string>;
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
export function reviewOf(moves: readonly PlayedMove[], repertoire: (i: number) => RepertoireVerdict = () => ({ own: false })): Review {
  const tally = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<Classification, number>;
  const userMoves = moves.filter((m) => m.isUser && m.classification);
  for (const m of userMoves) tally[m.classification!]++;
  const good = tally.great + tally.best + tally.excellent + tally.good + tally.book;
  const accuracy = userMoves.length ? Math.round((good / userMoves.length) * 100) : 100;
  const keyMoves: number[] = [];
  const deviations = new Map<number, string>();
  const corrected = new Map<number, string>();
  moves.forEach((m, i) => {
    if (!m.isUser) return;
    const rep = repertoire(i);
    if (rep.dev) deviations.set(i, rep.dev);
    if (rep.dev && rep.tried) corrected.set(i, rep.tried);
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
  return { tally, accuracy, keyMoves, deviations, corrected, judged: userMoves.length, evalPoints };
}

/**
 * The score for the user at each position of the game, for the eval bar: index 0 the start, `i + 1`
 * after move `i`. A user's move gives the score before it (its best line's) and after it; an
 * opponent's move the score the user's next move found. Undefined where no judge says.
 */
export function positionEvals(moves: readonly PlayedMove[]): (number | undefined)[] {
  const out: (number | undefined)[] = new Array<number | undefined>(moves.length + 1).fill(undefined);
  moves.forEach((m, i) => {
    if (!m.isUser) return;
    if (m.bestCp != null) out[i] = m.bestCp;
    if (m.afterCp != null) out[i + 1] = m.afterCp;
    else if (m.bestCp != null && m.cpLoss != null) out[i + 1] = m.bestCp - m.cpLoss;
  });
  return out;
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
    if (m.repTried) o.repTried = { san: m.repTried.san, uci: m.repTried.uci };
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
    const tried = m['repTried'];
    if (isObj(tried) && typeof tried['uci'] === 'string' && typeof tried['san'] === 'string') mv.repTried = { san: tried['san'], uci: tried['uci'] };
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
