// The parts of scripts/opponent-strength.ts that need no model or engine (PLAN.md §5.202): the
// practice opponents' levels and the anchors they are measured against, a game's end and its
// adjudication, the Elo fit of a match and its mapping onto the anchors' Lichess ratings, the
// bootstraps, and the same-position comparison of the levels' moves with human players' moves.
import type { Position } from 'chessops/chess';
import { positionKeyOf } from '../src/core/chess/positionKey.ts';
import type { Score } from '../src/core/engine/uci.ts';
import { whiteShare } from '../src/core/engine/winning.ts';
import { PRESET_ORDER, PRESETS } from '../src/core/games/checklist.ts';
import { maiaPick } from '../src/core/games/practice.ts';
import { rng } from './maia-eval-lib.ts';

/* ------------------------------------------------------------------ the players */

/** A practice opponent's level: Maia 3 at a rating, sampled at a precision (`maiaPick`). */
export interface Level {
  id: string;
  label: string;
  elo: number;
  precision: number;
}
/** The checklist's three presets, which practice games against the levels play. */
export const LEVELS: readonly Level[] = PRESET_ORDER.map((p) => ({ id: p, label: PRESETS[p].label, elo: PRESETS[p].maiaElo, precision: PRESETS[p].precision }));

/**
 * How a bot plays from its network's policy (no search): the likeliest move, as the CSSLab's Maia
 * bots (`go nodes 1`), or a draw weighted by the policy as dala's (hrschubert/lichess-bot's
 * `multipv_random` with `selection: policy`): Lc0's policy at its softmax temperature, the moves
 * under `minPolicy` percent left out, the likeliest always kept (PLAN.md §5.204).
 */
export type BotPlay = { kind: 'argmax' } | { kind: 'sample'; temperature: number; minPolicy: number };

/**
 * The bots the levels are measured against: the Maia-1 networks the CSSLab's Lichess bots run,
 * rated in hundreds of thousands of games, mostly against people, and dala-2000 (hrschubert's Lc0
 * transformer trained on 2000-rated games, PLAN.md §5.204), rated mostly against other bots.
 * (dala-1600's network has no soft head and no games of it were read: its play is unknown.)
 */
export interface Anchor {
  id: string;
  /** The rating the network was trained on. */
  trained: number;
  /** Its Lichess bot. */
  bot: string;
  play: BotPlay;
}
/**
 * dala-2000's play, fitted to its own moves in 600 of its Lichess games (PLAN.md §5.204): its
 * network's *soft* policy head (converted with `lc0-onnx.mjs … soft`), at temperature 0.45 on
 * that head's logits, no cutoff. The vanilla head at Lc0's 1.359 with the bot client's example 5%
 * cutoff, the published defaults, doesn't fit: the bot plays moves that head gives under 0.1%.
 */
export const DALA_PLAY: BotPlay = { kind: 'sample', temperature: 0.45, minPolicy: 0 };
export const ANCHORS: readonly Anchor[] = [
  { id: 'maia-1100', trained: 1100, bot: 'maia1', play: { kind: 'argmax' } },
  { id: 'maia-1500', trained: 1500, bot: 'maia5', play: { kind: 'argmax' } },
  { id: 'maia-1900', trained: 1900, bot: 'maia9', play: { kind: 'argmax' } },
  { id: 'dala-2000', trained: 2000, bot: 'dala-2000', play: DALA_PLAY },
];
/** The anchors of §5.202's match, the Maia bots. */
export const MAIA_ANCHORS: readonly Anchor[] = ANCHORS.filter((a) => a.id.startsWith('maia-'));

/**
 * A bot's move from its policy (likeliest first, as `lc0Policy` gives it at the play's
 * temperature, with no floor): the first, or a draw among the first and those of `minPolicy`
 * percent or more, weighted by their probability.
 */
export function botMove<M extends { prob: number }>(policy: readonly M[], play: BotPlay, rand: () => number): M | null {
  if (!policy.length) return null;
  if (play.kind === 'argmax') return policy[0]!;
  const kept = policy.filter((m, i) => i === 0 || m.prob * 100 >= play.minPolicy);
  let r = rand() * kept.reduce((s, m) => s + m.prob, 0);
  for (const m of kept) {
    r -= m.prob;
    if (r <= 0) return m;
  }
  return kept[kept.length - 1]!;
}

/** A level from `id=elo@precision` (`r2300=2300@0.85`), or one of the presets by its id. */
export function parseLevel(spec: string): Level {
  const preset = LEVELS.find((l) => l.id === spec);
  if (preset) return preset;
  const m = /^([\w-]+)=(\d+)@([\d.]+)$/.exec(spec);
  if (!m) throw new Error(`a level is a preset's id or id=elo@precision, not ${spec}`);
  return { id: m[1]!, label: m[1]!, elo: Number(m[2]), precision: Number(m[3]) };
}
export const SPEEDS = ['blitz', 'rapid', 'classical'] as const;
export type Speed = (typeof SPEEDS)[number];
/** The bots' ratings by speed, as Lichess gave them (`/api/user/<bot>`), and their deviation. */
export type BotRatings = Record<string, Partial<Record<Speed, { rating: number; rd: number; games: number }>>>;

/** A level's move from Maia's policy, as practice picks it. */
export const levelMove = <M extends { prob: number }>(policy: readonly M[], level: Level, rand: () => number): M | null => maiaPick(policy, level.precision, rand);

/* ------------------------------------------------------------------ a game */

export type Result = 1 | 0.5 | 0;
export type EndReason = 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty' | 'adjudicated' | 'adjudicated-draw' | 'max-plies';

/** How a game is ended early by Stockfish's score (White's centipawns, a mate as ±(10000 − moves)). */
export interface Adjudication {
  /** A side ahead by this much … */
  winCp: number;
  /** … at this many checks in a row wins. */
  winChecks: number;
  /** From this ply, a score within `drawCp` … */
  drawAfterPly: number;
  drawCp: number;
  /** … at this many checks in a row is a draw. */
  drawChecks: number;
  /** At this ply the game stops: a side ahead by `maxPlyCp` wins, else a draw. */
  maxPly: number;
  maxPlyCp: number;
}
export const ADJUDICATION: Adjudication = { winCp: 800, winChecks: 2, drawAfterPly: 200, drawCp: 50, drawChecks: 5, maxPly: 400, maxPlyCp: 300 };

/** White's centipawns from a score, a mate as ±(10000 − its moves). */
export const whiteCp = (s: Score): number => (s.mate !== undefined ? (s.mate === 0 ? 0 : Math.sign(s.mate) * (10000 - Math.abs(s.mate))) : s.cp);

/** The game's end on the board, if it has one: `seen` counts the positions so far by key (this one included). */
export function boardEnd(pos: Position, seen: ReadonlyMap<string, number>): { result: Result; reason: EndReason } | undefined {
  if (pos.isCheckmate()) return { result: pos.turn === 'white' ? 0 : 1, reason: 'checkmate' };
  if (pos.isStalemate()) return { result: 0.5, reason: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { result: 0.5, reason: 'insufficient' };
  if ((seen.get(positionKeyOf(pos)) ?? 0) >= 3) return { result: 0.5, reason: 'threefold' };
  if (pos.halfmoves >= 100) return { result: 0.5, reason: 'fifty' };
  return undefined;
}

/** The game's end by Stockfish's checks so far (White's centipawns, oldest first), at `ply`. */
export function adjudicate(checks: readonly number[], ply: number, r: Adjudication = ADJUDICATION): { result: Result; reason: EndReason } | undefined {
  const last = checks.slice(-r.winChecks);
  if (last.length === r.winChecks) {
    if (last.every((cp) => cp >= r.winCp)) return { result: 1, reason: 'adjudicated' };
    if (last.every((cp) => cp <= -r.winCp)) return { result: 0, reason: 'adjudicated' };
  }
  const quiet = checks.slice(-r.drawChecks);
  if (ply >= r.drawAfterPly && quiet.length === r.drawChecks && quiet.every((cp) => Math.abs(cp) <= r.drawCp)) return { result: 0.5, reason: 'adjudicated-draw' };
  if (ply >= r.maxPly) {
    const cp = checks[checks.length - 1] ?? 0;
    return { result: cp >= r.maxPlyCp ? 1 : cp <= -r.maxPlyCp ? 0 : 0.5, reason: 'max-plies' };
  }
  return undefined;
}

/** A game of the match, as the results file keeps it. */
export interface GameRecord {
  white: string;
  black: string;
  /** The opening's index in the openings file. */
  opening: number;
  /** White's points. */
  result: Result;
  reason: EndReason;
  plies: number;
  /** The moves played from the opening's position (UCI). */
  moves: string[];
}

/** A game's key in the results: who had White, who Black, from which opening. */
export const gameKey = (white: string, black: string, opening: number): string => `${white}|${black}|${opening}`;

/** A game's random source: the same game from the same key, so a run can stop and go on. */
export function gameRng(key: string, seed: number): () => number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return rng(h >>> 0);
}

/* ------------------------------------------------------------------ the Elo fit */

/** What `a` scored against `b`: wins, draws, losses. */
export interface Tally {
  a: string;
  b: string;
  w: number;
  d: number;
  l: number;
}

/** The games' results as one tally per pair of players (the first-named player's side). */
export function tallies(games: readonly Pick<GameRecord, 'white' | 'black' | 'result'>[]): Tally[] {
  const by = new Map<string, Tally>();
  for (const g of games) {
    const [a, b] = [g.white, g.black].sort() as [string, string];
    const key = `${a}|${b}`;
    let t = by.get(key);
    if (!t) by.set(key, (t = { a, b, w: 0, d: 0, l: 0 }));
    const s = a === g.white ? g.result : 1 - g.result;
    if (s === 1) t.w++;
    else if (s === 0) t.l++;
    else t.d++;
  }
  return [...by.values()];
}

const LN10_400 = Math.LN10 / 400;
/** The expected score of a player rated `d` points above the other. */
export const expectedScore = (d: number): number => 1 / (1 + 10 ** (-d / 400));
/** The rating difference a score fraction stands for. */
export const eloDiff = (score: number): number => -400 * Math.log10(1 / Math.min(1 - 1e-9, Math.max(1e-9, score)) - 1);

/**
 * The players' Elo by maximum likelihood (the logistic model, a draw half a point), with a weak
 * prior (`priorSd`) so that a player who won or lost every game still has a finite rating; the
 * mean of `centre` is 0.
 */
export function fitElo(players: readonly string[], ts: readonly Tally[], centre: readonly string[] = players, priorSd = 1500): Map<string, number> {
  const r = new Map(players.map((p) => [p, 0]));
  const prior = 1 / (priorSd * priorSd);
  for (let iter = 0; iter < 500; iter++) {
    let moved = 0;
    for (const p of players) {
      let g = -r.get(p)! * prior;
      let h = -prior;
      for (const t of ts) {
        if (t.a !== p && t.b !== p) continue;
        const n = t.w + t.d + t.l;
        if (!n) continue;
        const mine = t.a === p ? t.w + t.d / 2 : t.l + t.d / 2;
        const e = expectedScore(r.get(p)! - r.get(t.a === p ? t.b : t.a)!);
        g += (mine - n * e) * LN10_400;
        h -= n * e * (1 - e) * LN10_400 * LN10_400;
      }
      const step = -g / h;
      r.set(p, r.get(p)! + step);
      moved = Math.max(moved, Math.abs(step));
    }
    if (moved < 1e-6) break;
  }
  const mean = centre.reduce((s, p) => s + r.get(p)!, 0) / centre.length;
  for (const p of players) r.set(p, r.get(p)! - mean);
  return r;
}

/** A tally resampled: as many games, each drawn from its wins, draws and losses. */
export function resampleTally(t: Tally, rand: () => number): Tally {
  const n = t.w + t.d + t.l;
  const out = { ...t, w: 0, d: 0, l: 0 };
  for (let i = 0; i < n; i++) {
    const x = rand() * n;
    if (x < t.w) out.w++;
    else if (x < t.w + t.d) out.d++;
    else out.l++;
  }
  return out;
}

/** The least-squares line `y = a + b x`. */
export function fitLine(xs: readonly number[], ys: readonly number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const b = sxx ? sxy / sxx : 1;
  return { a: my - b * mx, b };
}

/** A gaussian draw (Box-Muller). */
const gauss = (rand: () => number): number => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

export interface Estimate {
  value: number;
  lo: number;
  hi: number;
}
const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
};
const estimate = (value: number, boot: readonly number[]): Estimate => ({ value, lo: quantile(boot, 0.025), hi: quantile(boot, 0.975) });

export interface SpeedMapping {
  /** Lichess points per local Elo point over the anchors (1: the same scale). */
  slope: Estimate;
  /** Each level's Lichess rating at this speed: by the anchors' line, and by the nearest anchor alone (slope 1). */
  levels: Record<string, { line: Estimate; nearest: Estimate; nearestAnchor: string }>;
}
export interface MatchReport {
  games: number;
  /** Each player's local Elo (the anchors' mean 0), with a 95% interval. */
  elo: Record<string, Estimate>;
  /** Each pair's games and the first player's score. */
  pairs: { a: string; b: string; games: number; score: number }[];
  speeds: Partial<Record<Speed, SpeedMapping>>;
  /**
   * Each anchor placed by the line through the others, against its own Lichess rating (point
   * values): whether the bots' ratings agree with each other on one scale.
   */
  leaveOneOut: Partial<Record<Speed, Record<string, { rating: number; placed: number }>>>;
}

/**
 * The match's report: the players' Elo, and each level's Lichess rating by speed, mapped by the
 * least-squares line from the anchors' local Elo to their bots' ratings, and by the nearest anchor
 * with the local difference added. Intervals: `boot` resamples of every pair's games, with the
 * bots' ratings drawn within their deviation.
 */
export function matchReport(games: readonly GameRecord[], ratings: BotRatings, o: { boot: number; seed: number; levels?: readonly Level[]; anchors?: readonly Anchor[] }): MatchReport {
  const levels = o.levels ?? LEVELS;
  const anchors = o.anchors ?? ANCHORS;
  const ts = tallies(games);
  const players = [...new Set(ts.flatMap((t) => [t.a, t.b]))];
  const anchorIds = anchors.map((a) => a.id).filter((id) => players.includes(id));
  // The levels, and any other player not an anchor here (a bot left out of the line), are placed.
  const levelIds = [...levels.map((l) => l.id).filter((id) => players.includes(id)), ...players.filter((id) => !anchorIds.includes(id) && !levels.some((l) => l.id === id))];
  const rand = rng(o.seed);
  const speeds = SPEEDS.filter((s) => anchorIds.length >= 2 && anchorIds.every((id) => ratings[anchors.find((a) => a.id === id)!.bot]?.[s]));
  const map = (elo: Map<string, number>, s: Speed, jitter: boolean) => {
    const ys = anchorIds.map((id) => {
      const r = ratings[anchors.find((a) => a.id === id)!.bot]![s]!;
      return r.rating + (jitter ? gauss(rand) * r.rd : 0);
    });
    const xs = anchorIds.map((id) => elo.get(id)!);
    const line = fitLine(xs, ys);
    const out: Record<string, { line: number; nearest: number; nearestAnchor: string }> = {};
    for (const id of levelIds) {
      const x = elo.get(id)!;
      let k = 0;
      xs.forEach((ax, i) => Math.abs(ax - x) < Math.abs(xs[k]! - x) && (k = i));
      out[id] = { line: line.a + line.b * x, nearest: ys[k]! + (x - xs[k]!), nearestAnchor: anchorIds[k]! };
    }
    return { slope: line.b, levels: out };
  };
  const centre = anchorIds.length ? anchorIds : players;
  const elo = fitElo(players, ts, centre);
  const point = Object.fromEntries(speeds.map((s) => [s, map(elo, s, false)]));
  const bootElo: Record<string, number[]> = Object.fromEntries(players.map((p) => [p, []]));
  const bootMap: Record<string, { slope: number[]; line: Record<string, number[]>; nearest: Record<string, number[]> }> = Object.fromEntries(
    speeds.map((s) => [s, { slope: [], line: Object.fromEntries(levelIds.map((l) => [l, []])), nearest: Object.fromEntries(levelIds.map((l) => [l, []])) }]),
  );
  for (let i = 0; i < o.boot; i++) {
    const e = fitElo(players, ts.map((t) => resampleTally(t, rand)), centre);
    for (const p of players) bootElo[p]!.push(e.get(p)!);
    for (const s of speeds) {
      const m = map(e, s, true);
      bootMap[s]!.slope.push(m.slope);
      for (const l of levelIds) {
        bootMap[s]!.line[l]!.push(m.levels[l]!.line);
        bootMap[s]!.nearest[l]!.push(m.levels[l]!.nearest);
      }
    }
  }
  const leaveOneOut = Object.fromEntries(
    speeds.map((s) => {
      const rows = anchorIds.map((id) => ({ id, x: elo.get(id)!, y: ratings[anchors.find((a) => a.id === id)!.bot]![s]!.rating }));
      const out: Record<string, { rating: number; placed: number }> = {};
      if (rows.length >= 3)
        for (const r of rows) {
          const others = rows.filter((o) => o !== r);
          const line = fitLine(others.map((o) => o.x), others.map((o) => o.y));
          out[r.id] = { rating: r.y, placed: line.a + line.b * r.x };
        }
      return [s, out];
    }),
  );
  return {
    games: games.length,
    leaveOneOut,
    elo: Object.fromEntries(players.map((p) => [p, estimate(elo.get(p)!, bootElo[p]!)])),
    pairs: ts.map((t) => ({ a: t.a, b: t.b, games: t.w + t.d + t.l, score: t.w + t.d / 2 })),
    speeds: Object.fromEntries(
      speeds.map((s) => [
        s,
        {
          slope: estimate(point[s]!.slope, bootMap[s]!.slope),
          levels: Object.fromEntries(
            levelIds.map((l) => [l, { line: estimate(point[s]!.levels[l]!.line, bootMap[s]!.line[l]!), nearest: estimate(point[s]!.levels[l]!.nearest, bootMap[s]!.nearest[l]!), nearestAnchor: point[s]!.levels[l]!.nearestAnchor }]),
          ),
        },
      ]),
    ),
  };
}

/* ------------------------------------------------------------------ the same positions */

/** The mover's win% (Lichess's, 0–100) from White's score. */
export const moverWin = (s: Score, white: boolean): number => (white ? whiteShare(s) : 100 - whiteShare(s));
/** The app's blunder: more than 15 points of win% given up (`classifyWpDrop`). */
export const BLUNDER = 15;

/** A sampled position with what was measured on it. */
export interface MistakePosition {
  game: string;
  band: number;
  /** The mover's real rating. */
  elo: number;
  fen: string;
  played: string;
  /** The mover's win% after the best move found. */
  best: number;
  /** The mover's win% after each move scored (the played move and Maia's likely ones). */
  after: Record<string, number>;
  /** Maia's policy at each rating asked (its moves of 0.1% or more, as the app reads it). */
  policies: Record<string, { uci: string; prob: number }[]>;
}

/** What a move gives up: the mover's win% after the best move less after it, at least 0. */
export const lossOf = (p: Pick<MistakePosition, 'best' | 'after'>, uci: string): number | undefined => {
  const a = p.after[uci];
  return a === undefined ? undefined : Math.max(0, Math.max(p.best, ...Object.values(p.after)) - a);
};

/**
 * Maia's policy as a level samples it: `maiaPick`'s softmax at temperature (1 − precision) × 2 over
 * the policy's moves (the likeliest move alone at precision 1).
 */
export function tempered(policy: readonly { uci: string; prob: number }[], precision: number): { uci: string; prob: number }[] {
  if (!policy.length) return [];
  if (precision >= 1) {
    const top = policy.reduce((a, b) => (b.prob > a.prob ? b : a));
    return [{ uci: top.uci, prob: 1 }];
  }
  const t = (1 - precision) * 2;
  const scaled = policy.map((m) => Math.log(Math.max(m.prob, 1e-12)) / t);
  const max = Math.max(...scaled);
  const e = scaled.map((x) => Math.exp(x - max));
  const z = e.reduce((a, b) => a + b, 0);
  return policy.map((m, i) => ({ uci: m.uci, prob: e[i]! / z }));
}

/** The moves worth scoring in a position: the played one and every move of `minProb` or more in any policy. */
export function movesToScore(played: string, policies: Iterable<readonly { uci: string; prob: number }[]>, minProb: number): string[] {
  const out = new Set([played]);
  for (const policy of policies) for (const m of policy) if (m.prob >= minProb) out.add(m.uci);
  return [...out];
}

/**
 * A level's expected loss and blunder chance in a position: over its tempered policy's scored
 * moves, renormalized; `covered` is the share of its moves that were scored.
 */
export function levelLoss(p: MistakePosition, policyKey: string, precision: number): { loss: number; blunder: number; covered: number } | undefined {
  const q = tempered(p.policies[policyKey] ?? [], precision);
  let covered = 0;
  let loss = 0;
  let blunder = 0;
  for (const m of q) {
    const l = lossOf(p, m.uci);
    if (l === undefined) continue;
    covered += m.prob;
    loss += m.prob * l;
    if (l > BLUNDER) blunder += m.prob;
  }
  return covered > 0 ? { loss: loss / covered, blunder: blunder / covered, covered } : undefined;
}

/** A condition to compare: Maia's policy asked at `policyKey` (a rating), sampled at `precision`. */
export interface Condition {
  id: string;
  policyKey: string;
  precision: number;
}

/** One position measured: the person's move, and each condition's expected move (absent: not measured). */
export interface Row {
  game: string;
  band: number;
  human: { loss: number; blunder: number };
  model: Record<string, { loss: number; blunder: number; covered: number } | undefined>;
}

export function rowsOf(ps: readonly MistakePosition[], conditions: readonly Condition[]): Row[] {
  const out: Row[] = [];
  for (const p of ps) {
    const l = lossOf(p, p.played);
    if (l === undefined) continue;
    out.push({ game: p.game, band: p.band, human: { loss: l, blunder: l > BLUNDER ? 1 : 0 }, model: Object.fromEntries(conditions.map((c) => [c.id, levelLoss(p, c.policyKey, c.precision)])) });
  }
  return out;
}

/** People's and each condition's mistakes in a band: the mean win% given up a move, and the share of blunders. */
export interface BandStat {
  band: number;
  positions: number;
  human: { loss: number; blunder: number };
  model: Record<string, { loss: number; blunder: number; covered: number }>;
}

export function bandStats(rows: readonly Row[], conditions: readonly Condition[]): BandStat[] {
  const bands = [...new Set(rows.map((r) => r.band))].sort((a, b) => a - b);
  return bands.map((band) => {
    const human = { loss: 0, blunder: 0 };
    let n = 0;
    const model: BandStat['model'] = Object.fromEntries(conditions.map((c) => [c.id, { loss: 0, blunder: 0, covered: 0 }]));
    const counts: Record<string, number> = Object.fromEntries(conditions.map((c) => [c.id, 0]));
    for (const r of rows) {
      if (r.band !== band) continue;
      n++;
      human.loss += r.human.loss;
      human.blunder += r.human.blunder;
      for (const c of conditions) {
        const m = r.model[c.id];
        if (!m) continue;
        counts[c.id]!++;
        const acc = model[c.id]!;
        acc.loss += m.loss;
        acc.blunder += m.blunder;
        acc.covered += m.covered;
      }
    }
    for (const c of conditions) {
      const k = counts[c.id]! || 1;
      const acc = model[c.id]!;
      model[c.id] = { loss: acc.loss / k, blunder: acc.blunder / k, covered: acc.covered / k };
    }
    return { band, positions: n, human: { loss: n ? human.loss / n : 0, blunder: n ? human.blunder / n : 0 }, model };
  });
}

/**
 * The rating at which people make the condition's mistakes: the least-squares line through the
 * bands of the condition's excess over people (its measure less theirs, on the same positions),
 * where it is 0. `outside` says it lies more than 100 points beyond the bands measured.
 */
export function crossing(stats: readonly BandStat[], id: string, measure: 'loss' | 'blunder'): { rating: number; outside: boolean } | undefined {
  const xs = stats.map((s) => s.band);
  const ys = stats.map((s) => s.model[id]![measure] - s.human[measure]);
  const { a, b } = fitLine(xs, ys);
  if (!(b > 0)) return undefined;
  const rating = -a / b;
  return { rating, outside: rating < Math.min(...xs) - 100 || rating > Math.max(...xs) + 100 };
}

export interface MistakeReport {
  positions: number;
  stats: BandStat[];
  /** By condition: the rating its mistakes match, by mean loss and by blunders, with 95% intervals. */
  ratings: Record<string, { loss?: Estimate & { outside: boolean }; blunder?: Estimate & { outside: boolean } }>;
}

/** The report, with intervals from `boot` resamples of the games within each band. */
export function mistakeReport(ps: readonly MistakePosition[], conditions: readonly Condition[], o: { boot: number; seed: number }): MistakeReport {
  const rows = rowsOf(ps, conditions);
  const stats = bandStats(rows, conditions);
  const rand = rng(o.seed);
  const byBand = new Map<number, Map<string, Row[]>>();
  for (const r of rows) {
    let games = byBand.get(r.band);
    if (!games) byBand.set(r.band, (games = new Map()));
    let list = games.get(r.game);
    if (!list) games.set(r.game, (list = []));
    list.push(r);
  }
  const boots: Record<string, { loss: number[]; blunder: number[] }> = Object.fromEntries(conditions.map((c) => [c.id, { loss: [], blunder: [] }]));
  for (let i = 0; i < o.boot; i++) {
    const sample: Row[] = [];
    for (const games of byBand.values()) {
      const lists = [...games.values()];
      for (let k = 0; k < lists.length; k++) sample.push(...lists[Math.floor(rand() * lists.length)]!);
    }
    const s = bandStats(sample, conditions);
    for (const c of conditions)
      for (const m of ['loss', 'blunder'] as const) {
        const x = crossing(s, c.id, m);
        if (x) boots[c.id]![m].push(x.rating);
      }
  }
  const ratings: MistakeReport['ratings'] = {};
  for (const c of conditions) {
    const r: MistakeReport['ratings'][string] = {};
    for (const m of ['loss', 'blunder'] as const) {
      const x = crossing(stats, c.id, m);
      if (x && boots[c.id]![m].length) r[m] = { ...estimate(x.rating, boots[c.id]![m]), outside: x.outside };
    }
    ratings[c.id] = r;
  }
  return { positions: rows.length, stats, ratings };
}

/* ------------------------------------------------------------------ whole games (PLAN.md §5.204) */

/** The app's mistake: more than 10 points of win% given up (`classifyWpDrop`). */
export const MISTAKE = 10;
/** A game is decided from here on, for the statistics: the leader's win% (about ±600 centipawns). */
export const DECIDED = 90;
/** Ahead: the leader's win% from which a conversion is counted (about +300 centipawns). */
export const AHEAD = 75;

export type Phase = 'middlegame' | 'endgame';
/** Lichess's endgame (its `Divider`): six or fewer queens, rooks, bishops and knights on the board. */
export const phaseOf = (pos: Position): Phase => (pos.board.occupied.diff(pos.board.pawn).diff(pos.board.king).size() <= 6 ? 'endgame' : 'middlegame');

/**
 * A game from a start: White's win% at each position from the start (index 0) on, as far as it was
 * scored, each position's phase, and who played (`human`, or a player's id on both sides).
 */
export interface ScoredGame {
  player: string;
  game: string;
  /** White's win% (Lichess's, 0–100) at each position; null where Stockfish gave none. */
  win: (number | null)[];
  phase: Phase[];
  /** Whether White is to move at the start. */
  firstWhite: boolean;
  /** The game ended in a win before the score reached `DECIDED` (a resignation, a flag, a mate): decided at its end. */
  decisiveEnd?: boolean;
}

/** One side's move in a scored game, while the game was undecided. */
export interface ScoredMove {
  /** Win% the move gave up for its side. */
  loss: number;
  phase: Phase;
}

/** The moves a game's statistics count: from the start until the game is decided (`DECIDED`). */
export function scoredMoves(g: ScoredGame): ScoredMove[] {
  const out: ScoredMove[] = [];
  for (let i = 0; i + 1 < g.win.length; i++) {
    const a = g.win[i];
    const b = g.win[i + 1];
    if (a == null || b == null) continue;
    if (Math.max(a, 100 - a) >= DECIDED) break;
    const white = (i % 2 === 0) === g.firstWhite;
    out.push({ loss: Math.max(0, white ? a - b : b - a), phase: g.phase[i]! });
  }
  return out;
}

/** A game's course: when it was decided, and what became of a lead. */
export interface GameCourse {
  /** Plies from the start until a side reached `DECIDED` by the score, or the end of a game won before; null: never. */
  decidedAt: number | null;
  /** A side reached `AHEAD`: did it keep it (never fell back to 50% or less afterwards)? null: no side did. */
  converted: boolean | null;
}
export function courseOf(g: ScoredGame): GameCourse {
  let decidedAt: number | null = null;
  let leader: 'white' | 'black' | undefined;
  let converted: boolean | null = null;
  for (let i = 0; i < g.win.length; i++) {
    const w = g.win[i];
    if (w == null) continue;
    if (!leader && (w >= AHEAD || w <= 100 - AHEAD)) {
      leader = w >= AHEAD ? 'white' : 'black';
      converted = true;
    }
    if (leader && converted && (leader === 'white' ? w <= 50 : w >= 50)) converted = false;
    if (Math.max(w, 100 - w) >= DECIDED) {
      decidedAt = i;
      break;
    }
  }
  if (decidedAt === null && g.decisiveEnd) decidedAt = g.win.length - 1;
  return { decidedAt, converted };
}

/** A player's whole-game statistics, each with a 95% interval over its games. */
export interface WholeGameStats {
  games: number;
  moves: number;
  loss: Record<'all' | Phase, Estimate>;
  /** Shares of moves (percent). */
  mistakes: Record<'all' | Phase, Estimate>;
  blunders: Record<'all' | Phase, Estimate>;
  /** Share of the moves counted that were in the endgame (percent). */
  endgameShare: Estimate;
  /** Of the games where a side got ahead, the share where it kept the lead (percent). */
  converted: Estimate;
  /** Share of games decided within 60 plies of the start (percent). */
  decided60: Estimate;
  /** Median plies to the decision, over the games decided. */
  decidedMedian: Estimate;
}

function wholeStats(gs: readonly ScoredGame[]): Record<string, number> {
  const out: Record<string, number> = {};
  const acc = { all: [0, 0, 0, 0], middlegame: [0, 0, 0, 0], endgame: [0, 0, 0, 0] } as Record<'all' | Phase, number[]>;
  let ahead = 0;
  let kept = 0;
  let in60 = 0;
  const decided: number[] = [];
  for (const g of gs) {
    for (const m of scoredMoves(g))
      for (const k of ['all', m.phase] as const) {
        const a = acc[k];
        a[0]!++;
        a[1]! += m.loss;
        if (m.loss > MISTAKE) a[2]!++;
        if (m.loss > BLUNDER) a[3]!++;
      }
    const c = courseOf(g);
    if (c.converted !== null) {
      ahead++;
      if (c.converted) kept++;
    }
    if (c.decidedAt !== null) {
      decided.push(c.decidedAt);
      if (c.decidedAt <= 60) in60++;
    }
  }
  for (const k of ['all', 'middlegame', 'endgame'] as const) {
    const [n, l, mi, bl] = acc[k] as [number, number, number, number];
    out[`loss.${k}`] = n ? l / n : NaN;
    out[`mistakes.${k}`] = n ? (100 * mi) / n : NaN;
    out[`blunders.${k}`] = n ? (100 * bl) / n : NaN;
  }
  out['moves'] = acc.all[0]!;
  out['endgameShare'] = acc.all[0] ? (100 * acc.endgame[0]!) / acc.all[0]! : NaN;
  out['converted'] = ahead ? (100 * kept) / ahead : NaN;
  out['decided60'] = gs.length ? (100 * in60) / gs.length : NaN;
  const sorted = [...decided].sort((a, b) => a - b);
  out['decidedMedian'] = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN;
  return out;
}

/** Each player's whole-game statistics, with intervals from `boot` resamples of its games. */
export function wholeGameReport(games: readonly ScoredGame[], o: { boot: number; seed: number }): Record<string, WholeGameStats> {
  const rand = rng(o.seed);
  const out: Record<string, WholeGameStats> = {};
  for (const player of [...new Set(games.map((g) => g.player))]) {
    const gs = games.filter((g) => g.player === player);
    const point = wholeStats(gs);
    const boots: Record<string, number>[] = [];
    for (let i = 0; i < o.boot; i++) boots.push(wholeStats(Array.from({ length: gs.length }, () => gs[Math.floor(rand() * gs.length)]!)));
    const e = (k: string): Estimate => estimate(point[k]!, boots.map((b) => b[k]!).filter((x) => !Number.isNaN(x)));
    const byPhase = (k: string) => ({ all: e(`${k}.all`), middlegame: e(`${k}.middlegame`), endgame: e(`${k}.endgame`) });
    out[player] = {
      games: gs.length,
      moves: point['moves']!,
      loss: byPhase('loss'),
      mistakes: byPhase('mistakes'),
      blunders: byPhase('blunders'),
      endgameShare: e('endgameShare'),
      converted: e('converted'),
      decided60: e('decided60'),
      decidedMedian: e('decidedMedian'),
    };
  }
  return out;
}
