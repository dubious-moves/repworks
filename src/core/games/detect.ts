// Tactics detected after a practice game (PLAN.md §6, item 3), mistake-lab's DETECTED TACTICS
// (`c525403`): each judged user move's candidate (`detectTacticCandidate`, its pre-filters the
// analyzer's: the opponent's move before it gave up 100 cp, ply 6 on, two moves left in the game,
// the best line 30 points of win% above the second), the opponent's loss read back from the user's
// moves around it (`applySilentEvalToMove`), then the tactic tree walked from each candidate on the
// device's engine (`tacticWalkTree`, `tacticBuildBestChain`: the user's move unique at each step,
// 30 points the first, 20 after; the opponent's three best replies within 15 points of its best,
// alternatives three deep, three alternative lines, 14 plies), the lines deduplicated
// (`tacticDedupeAltLines`), and a line with Maia as the opponent (`tacticGenerateMaiaLine`). The
// engine and Maia come in as functions; everything here is pure.
import { keyFen } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { makeSanAndPlay } from 'chessops/san';
import { fenOf, positionOf } from '../storm/walk.ts';
import { winPct, type TacticItem } from './extract.ts';
import { classifyWpDrop, type Classification } from './grade.ts';
import type { Color, TacticMove } from './record.ts';

/** mistake-lab's `TACTIC_*` constants (its browser's). */
export const TACTIC = {
  firstWp: 30,
  contWp: 20,
  oppWpCap: 15,
  minUserMoves: 2,
  minOppCpLoss: 100,
  minPly: 6,
  minRemaining: 2,
  oppCandidates: 3,
  maxAltLines: 3,
  maxAltDepth: 3,
  scanDepth: 20,
  maxLineLength: 14,
} as const;

/** An engine line's first move and its score for the side to move (a mate ±10,000). */
export interface Pv {
  cp: number;
  firstMove: string;
}

/** The engine: a position's best lines, `lines` of them, or null. */
export type Analyse = (fen: string, lines: number) => Promise<readonly Pv[] | null>;

/** A practice game's move as the detection reads it. */
export interface JudgedPlay {
  uci: string;
  isUser: boolean;
  fenBefore: string;
  /** The user's move: the position's lines before it, and the score after it, for the user. */
  pvs?: readonly Pv[];
  afterCp?: number;
}

export interface TacticCandidate {
  moveIdx: number;
  preFen: string;
  color: Color;
  oppCpLoss: number | null;
  gapWp: number;
  bestMoveUci: string;
  initialPvs: Pv[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The opponent's move before a user's move, judged from the user's score after the move before it
 * and the user's best score now (`applySilentEvalToMove`'s retroactive judgement): its loss in
 * centipawns and win% for the opponent, and its word.
 */
export function opponentLoss(prevUserAfterCp: number, bestCp: number): { cpLoss: number; wpDrop: number; classification: Classification } {
  const oppWpDrop = winPct(-prevUserAfterCp) - winPct(-bestCp);
  return { cpLoss: Math.round(Math.max(0, bestCp - prevUserAfterCp)), wpDrop: round1(Math.max(0, oppWpDrop)), classification: classifyWpDrop(Math.max(0, oppWpDrop), oppWpDrop < 0.5) };
}

/** The candidates of a finished game, in order (`detectTacticCandidate` on each judged user move). */
export function tacticCandidates(moves: readonly JudgedPlay[], color: Color): TacticCandidate[] {
  const out: TacticCandidate[] = [];
  moves.forEach((mv, i) => {
    if (!mv.isUser || !mv.pvs?.length) return;
    const prev = i > 0 ? moves[i - 1] : undefined;
    const before = i > 1 ? moves[i - 2] : undefined;
    // The opponent's loss, from the user's score after their previous move (when it was judged).
    const oppCpLoss = prev && !prev.isUser && before?.isUser && before.afterCp !== undefined ? opponentLoss(before.afterCp, mv.pvs[0]!.cp).cpLoss : null;
    if (i >= 2 && (!prev || prev.isUser || oppCpLoss === null || oppCpLoss < TACTIC.minOppCpLoss)) return;
    const [, turn, , , , full] = mv.fenBefore.split(' ');
    const ply = (parseInt(full ?? '1', 10) || 1) * 2 - (turn === 'w' ? 1 : 0);
    if (ply < TACTIC.minPly) return;
    if (moves.length - i < TACTIC.minRemaining) return;
    if (mv.pvs.length < 2) return;
    const gapWp = winPct(mv.pvs[0]!.cp) - winPct(mv.pvs[1]!.cp);
    if (gapWp < TACTIC.firstWp) return;
    out.push({ moveIdx: i, preFen: mv.fenBefore, color, oppCpLoss, gapWp: round1(gapWp), bestMoveUci: mv.pvs[0]!.firstMove, initialPvs: mv.pvs.map((p) => ({ ...p })) });
  });
  return out;
}

/** A move of a walked line. */
export interface ChainMove {
  uci: string;
  san: string;
  fen: string;
  isUser: boolean;
  source?: 'maia';
}

function playUci(fen: string, uci: string): { san: string; uci: string; fen: string; over: boolean } | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  const std = standardUci(pos, move);
  const san = makeSanAndPlay(pos, move);
  // chess.js's game_over: mate, stalemate, insufficient material, fifty moves.
  const over = pos.isEnd() || pos.isInsufficientMaterial() || pos.halfmoves >= 100;
  return { san, uci: std, fen: fenOf(pos), over };
}

/** `tacticCheckUniqueness`. */
export function uniqueness(pvs: readonly Pv[], thresholdWp: number): { unique: boolean; gap: number; bestMove: string | undefined } {
  if (!pvs.length) return { unique: false, gap: 0, bestMove: undefined };
  if (pvs.length === 1) return { unique: true, gap: 100, bestMove: pvs[0]!.firstMove };
  const gap = winPct(pvs[0]!.cp) - winPct(pvs[1]!.cp);
  return { unique: gap >= thresholdWp, gap: round1(gap), bestMove: pvs[0]!.firstMove };
}

interface WalkCtx {
  paths: ChainMove[][];
  canceled: () => boolean;
}

async function walk(analyse: Analyse, fen: string, prefix: ChainMove[], branchDepth: number, first: boolean, initPvs: readonly Pv[] | null, ctx: WalkCtx): Promise<void> {
  if (ctx.canceled()) return;
  if (prefix.length >= TACTIC.maxLineLength) return void ctx.paths.push(prefix);
  let userPvs = initPvs;
  if (!userPvs) {
    const r = await analyse(fen, 2);
    if (ctx.canceled() || !r?.length) return;
    userPvs = r;
  }
  const uniq = uniqueness(userPvs, first ? TACTIC.firstWp : TACTIC.contWp);
  if (!uniq.unique || !uniq.bestMove) return;
  const u = playUci(fen, uniq.bestMove);
  if (!u) return;
  const userPath = [...prefix, { uci: uniq.bestMove, san: u.san, fen: u.fen, isUser: true }];
  if (u.over) return void ctx.paths.push(userPath);
  const opp = await analyse(u.fen, TACTIC.oppCandidates);
  if (ctx.canceled()) return;
  if (!opp?.length) return void ctx.paths.push(userPath);
  const bestOppWp = winPct(opp[0]!.cp);
  let anyValid = false;
  for (let oi = 0; oi < Math.min(opp.length, TACTIC.oppCandidates); oi++) {
    if (ctx.canceled()) return;
    if (oi > 0 && bestOppWp - winPct(opp[oi]!.cp) > TACTIC.oppWpCap) continue;
    if (oi > 0 && branchDepth >= TACTIC.maxAltDepth) continue;
    if (ctx.paths.length > TACTIC.maxAltLines + 1) break;
    const o = playUci(u.fen, opp[oi]!.firstMove);
    if (!o) continue;
    const oppPath = [...userPath, { uci: opp[oi]!.firstMove, san: o.san, fen: o.fen, isUser: false }];
    if (o.over) {
      ctx.paths.push(oppPath);
      anyValid = true;
      continue;
    }
    const before = ctx.paths.length;
    await walk(analyse, o.fen, oppPath, oi === 0 ? branchDepth : branchDepth + 1, false, null, ctx);
    if (ctx.canceled()) return;
    if (ctx.paths.length > before) anyValid = true;
  }
  if (!anyValid) ctx.paths.push(userPath);
}

/** `tacticBuildBestChain`: the main line and up to three alternatives of two user moves or more. */
export async function buildChain(analyse: Analyse, cand: Pick<TacticCandidate, 'preFen' | 'initialPvs'>, canceled: () => boolean = () => false): Promise<{ moves: ChainMove[]; alternativeLines: ChainMove[][]; canceled: boolean }> {
  const ctx: WalkCtx = { paths: [], canceled };
  const seed = cand.initialPvs.length >= 2 ? cand.initialPvs : null;
  await walk(analyse, cand.preFen, [], 0, true, seed, ctx);
  if (canceled()) return { moves: [], alternativeLines: [], canceled: true };
  if (!ctx.paths.length) return { moves: [], alternativeLines: [], canceled: false };
  const alts = ctx.paths
    .slice(1)
    .filter((l) => l.filter((m) => m.isUser).length >= TACTIC.minUserMoves)
    .slice(0, TACTIC.maxAltLines);
  return { moves: ctx.paths[0]!, alternativeLines: alts, canceled: false };
}

/** `tacticDedupeAltLines`: an alternative whose opponent moves continue, or are continued by, the main line's or a kept one's is left out. */
export function dedupeLines<M extends { uci: string; isUser: boolean }>(primary: readonly M[], alts: readonly (readonly M[])[]): M[][] {
  const opp = (l: readonly M[]) =>
    l
      .filter((m) => !m.isUser)
      .map((m) => m.uci)
      .join(',');
  const same = (a: string, b: string) => a === b || a.startsWith(b + ',') || b.startsWith(a + ',');
  const p = opp(primary);
  const kept: M[][] = [];
  for (const alt of alts) {
    const a = opp(alt);
    if (same(a, p) || kept.some((k) => same(a, opp(k)))) continue;
    kept.push([...alt]);
  }
  return kept;
}

/**
 * `tacticGenerateMaiaLine`: Stockfish's unique move for the user at each step, Maia's move for the
 * opponent; kept when Maia leaves the main line's replies and the user has two moves or more.
 */
export async function maiaLine(analyse: Analyse, maia: (fen: string) => Promise<string | null>, preFen: string, primary: readonly ChainMove[], canceled: () => boolean = () => false): Promise<ChainMove[] | null> {
  if (primary.length < 3) return null;
  const primaryOpp = primary.filter((m) => !m.isUser).map((m) => m.uci);
  const chain: ChainMove[] = [];
  let fen = preFen;
  let first = true;
  let diverged = false;
  let oppIdx = 0;
  while (chain.length < TACTIC.maxLineLength) {
    if (canceled()) return null;
    const threshold = first ? TACTIC.firstWp : TACTIC.contWp;
    first = false;
    const r = await analyse(fen, 2);
    if (canceled()) return null;
    if (!r?.length) break;
    const uniq = uniqueness(r, threshold);
    if (!uniq.unique || !uniq.bestMove) break;
    const u = playUci(fen, uniq.bestMove);
    if (!u) break;
    chain.push({ uci: uniq.bestMove, san: u.san, fen: u.fen, isUser: true });
    fen = u.fen;
    if (u.over) break;
    const m = await maia(fen);
    if (canceled()) return null;
    if (!m) break;
    if (!diverged && oppIdx < primaryOpp.length) {
      if (m !== primaryOpp[oppIdx]) diverged = true;
      oppIdx++;
    } else diverged = true;
    const o = playUci(fen, m);
    if (!o) break;
    chain.push({ uci: m, san: o.san, fen: o.fen, isUser: false, source: 'maia' });
    fen = o.fen;
    if (o.over) break;
  }
  if (!diverged) return null;
  if (chain.filter((m) => m.isUser).length < TACTIC.minUserMoves) return null;
  return chain;
}

/** A detected tactic: its candidate, its lines (the main one first) and whether the user found its first move. */
export interface DetectedTactic {
  cand: TacticCandidate;
  lines: ChainMove[][];
  found: boolean;
}

/**
 * The scan of one candidate (`startTacticScan`'s loop body): the chain walked, kept with two user
 * moves or more, its alternatives deduplicated and Maia's line added when it differs.
 */
export async function scanCandidate(analyse: Analyse, maia: ((fen: string) => Promise<string | null>) | null, cand: TacticCandidate, userUci: string | undefined, canceled: () => boolean = () => false): Promise<DetectedTactic | null> {
  const r = await buildChain(analyse, cand, canceled);
  if (r.canceled || !r.moves.length || r.moves.filter((m) => m.isUser).length < TACTIC.minUserMoves) return null;
  let alts = dedupeLines(r.moves, r.alternativeLines);
  if (maia) {
    const m = await maiaLine(analyse, maia, cand.preFen, r.moves, canceled);
    if (m && !canceled()) {
      const combined = dedupeLines(r.moves, [...alts, m]);
      if (combined.length > alts.length) alts = combined.slice(0, TACTIC.maxAltLines);
    }
  }
  return { cand, lines: [r.moves, ...alts], found: userUci === r.moves[0]!.uci };
}

/** The plies a detected tactic covers from its move, so a candidate inside it is skipped (`alreadyCovered`). */
export const covered = (t: DetectedTactic): number[] => t.lines[0]!.map((_, k) => t.cand.moveIdx + k);

/** `savePracticeTactic`'s record as a saved item: a tactic on its own card, `found` whether the user played its first move. */
export function practiceTacticItem(t: DetectedTactic, a: { now: number; rand: string; from?: string }): TacticItem | undefined {
  const main = t.lines[0]!;
  if (main.length < 3 || main.filter((m) => m.isUser).length < TACTIC.minUserMoves) return undefined;
  if (!keyFen(t.cand.preFen)) return undefined;
  const [, turn, , , , full] = t.cand.preFen.split(' ');
  const before = ((parseInt(full ?? '1', 10) || 1) - 1) * 2 + (turn === 'b' ? 1 : 0);
  const gameId = `_practice_tactic_${a.now}_${a.rand}`;
  const strip = (l: readonly ChainMove[]): TacticMove[] => l.map((m) => ({ uci: m.uci, san: m.san, user: m.isUser, ...(m.source ? { source: m.source } : {}) }));
  const swing = round1(t.cand.gapWp);
  const item: TacticItem = { kind: 'tactic', pid: `${gameId}_t${before}`, gameId, ply: before + 1, fenBefore: t.cand.preFen, color: t.cand.color, lines: t.lines.map(strip), wpSwing: swing, wpDrop: Math.abs(swing), found: t.found, savedAt: a.now };
  if (a.from) item.from = a.from;
  return item;
}

/** Whether the same tactic (its start and main line) is saved already (`_chainSig`). */
export const tacticSaved = (saved: readonly { kind: string; fenBefore: string; lines?: readonly (readonly { uci: string }[])[] }[], t: DetectedTactic): boolean =>
  saved.some((s) => s.kind === 'tactic' && s.fenBefore === t.cand.preFen && s.lines?.[0]?.map((m) => m.uci).join(',') === t.lines[0]!.map((m) => m.uci).join(','));
