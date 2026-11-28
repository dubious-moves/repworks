// The close calls of a chapter that has had no review (PLAN.md §5.219): every move of ours against
// the Lichess explorer and ChessDB, with the triggers the owner agreed (the ones that need no
// builder), so that Practical is run on the flagged decisions only:
// - engine: ChessDB rates another move 3 win% or more higher, and that move's win rate is at most
//   1 point lower (or it has too few games to say);
// - score: another move scores 3 points or more higher over 100+ games each, and ChessDB rates it
//   at most 3 win% lower;
// - critical reply: a reply played in 10% of the games or more after which we score under 45%
//   (100+ games) or ChessDB gives us 0.00 or less;
// - line ends, by how often they are reached.
// The win rates are the games' own, not at equal ratings: the ratings are shown, and Practical's
// prepared score settles a flag. Pure: the answers come in as functions; a position without one
// is listed as unknown, never passed as fine.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { whiteShare } from '../../src/core/engine/winning.ts';
import type { CompactExplorer } from '../../src/core/explorer/providers.ts';
import type { ChessdbAnswer } from '../../src/core/explorer/search.ts';
import type { Chapter } from '../../src/core/study/model.ts';
import { lineOf, visits } from './study.ts';

export interface MoveStats {
  san: string;
  games: number;
  /** The mover's score in those games, 0 to 1; undefined with no games. */
  score?: number;
  rating?: number;
  /** ChessDB's score for the mover, in centipawns; undefined when it has none. */
  cp?: number;
}

export interface Decision {
  /** The line up to our move, our move last. */
  line: string;
  path: string[];
  reach: number;
  total: number;
  ours: MoveStats;
  others: MoveStats[];
  flags: string[];
}

export interface CloseCalls {
  decisions: Decision[];
  critical: { line: string; reach: number; share: number; text: string }[];
  ends: { line: string; reach: number; plies: number }[];
  unknown: string[];
}

const win = (cp: number) => whiteShare({ cp });
const pct = (x: number) => (100 * x).toFixed(1);
const MIN_ALT_SHARE = 0.02;
const MIN_ALT_GAMES = 30;

function statsOf(ex: CompactExplorer, cdb: ChessdbAnswer | undefined, turn: 'white' | 'black', san: string): MoveStats {
  const m = ex.moves.find((x) => x.san === san);
  const games = m ? (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0) : 0;
  const won = m ? (turn === 'white' ? (m.white ?? 0) : (m.black ?? 0)) : 0;
  const cp = cdb?.moves?.find((x) => x.san === san)?.score;
  const out: MoveStats = { san, games };
  if (games) out.score = (won + (m?.draws ?? 0) / 2) / games;
  if (m && typeof (m as { rating?: number }).rating === 'number') out.rating = (m as { rating?: number }).rating!;
  if (cp !== undefined) out.cp = cp;
  return out;
}

/** The engine and score triggers for one decision. */
export function decisionFlags(ours: MoveStats, others: readonly MoveStats[]): string[] {
  const flags: string[] = [];
  for (const a of others) {
    if (a.cp !== undefined && ours.cp !== undefined && win(a.cp) - win(ours.cp) >= 3) {
      const few = a.games < MIN_ALT_GAMES || a.score === undefined || ours.score === undefined;
      if (few || a.score! - ours.score! >= -0.01) {
        flags.push(`engine: ChessDB ${a.san} ${(a.cp / 100).toFixed(2)} against ours ${(ours.cp / 100).toFixed(2)} (${(win(a.cp) - win(ours.cp)).toFixed(1)} win%)${few ? `; ${a.san} has ${a.games} games` : `; it scores ${pct(a.score!)}% against ${pct(ours.score!)}%`}`);
      }
    }
    if (a.games >= 100 && ours.games >= 100 && a.score !== undefined && ours.score !== undefined && a.score - ours.score >= 0.03) {
      if (a.cp === undefined || ours.cp === undefined || win(a.cp) >= win(ours.cp) - 3) {
        flags.push(`score: ${a.san} ${pct(a.score)}% (${a.games} games${a.rating ? `, rating ${a.rating}` : ''}) against ours ${pct(ours.score)}% (${ours.games}${ours.rating ? `, rating ${ours.rating}` : ''})${a.cp !== undefined && ours.cp !== undefined ? `; ChessDB ${(a.cp / 100).toFixed(2)} against ${(ours.cp / 100).toFixed(2)}` : ''}`);
      }
    }
  }
  return flags;
}

export function closeCalls(chapter: Chapter, explorer: (fen: string) => CompactExplorer | undefined, chessdb: (fen: string) => ChessdbAnswer | undefined): CloseCalls {
  const out: CloseCalls = { decisions: [], critical: [], ends: [], unknown: [] };
  const unknown = new Set<string>();
  const reach: number[] = [1];
  const fenOf = (p: Position) => makeFen(p.toSetup());
  const seenTheirs = new Set<string>();
  for (const v of visits(chapter)) {
    const depth = v.path.length - 1;
    const fen = fenOf(v.before);
    const ex = explorer(fen);
    if (!ex) unknown.add(fen);
    let r = reach[depth] ?? 0;
    if (v.ours) {
      const cdb = chessdb(fen);
      if (!cdb) unknown.add(fen);
      if (ex) {
        const ours = statsOf(ex, cdb, v.before.turn, v.node.san);
        const others = ex.moves
          .filter((m) => m.san !== v.node.san)
          .map((m) => statsOf(ex, cdb, v.before.turn, m.san))
          .filter((m) => m.games >= Math.max(MIN_ALT_GAMES, MIN_ALT_SHARE * ex.total));
        // ChessDB's best when the games don't show it.
        const best = cdb?.moves?.[0];
        if (best && best.san !== v.node.san && !others.some((o) => o.san === best.san)) others.push(statsOf(ex, cdb, v.before.turn, best.san));
        out.decisions.push({ line: lineOf(chapter, v.path), path: v.path, reach: r, total: ex.total, ours, others, flags: decisionFlags(ours, others) });
      }
    } else {
      const m = ex?.moves.find((x) => x.san === v.node.san);
      const games = m ? (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0) : 0;
      const share = ex?.total ? games / ex.total : 0;
      r = ex ? r * share : Number.NaN;
      const id = v.path.join(' ');
      if (ex && m && share >= 0.1 && v.node.children.length && !seenTheirs.has(id)) {
        seenTheirs.add(id);
        const us = v.before.turn === 'white' ? 'black' : 'white';
        const weWon = us === 'white' ? (m.white ?? 0) : (m.black ?? 0);
        const ourScore = games ? (weWon + (m.draws ?? 0) / 2) / games : undefined;
        const cdb = chessdb(fen);
        const cp = cdb?.moves?.find((x) => x.san === v.node.san)?.score;
        const why: string[] = [];
        if (games >= 100 && ourScore !== undefined && ourScore < 0.45) why.push(`we score ${pct(ourScore)}% in ${games} games`);
        if (cp !== undefined && cp >= 0) why.push(`ChessDB gives us ${(-cp / 100).toFixed(2)}`);
        if (why.length) out.critical.push({ line: lineOf(chapter, v.path), reach: r, share, text: `${(100 * share).toFixed(0)}% of the games: ${why.join('; ')}` });
      }
    }
    reach[depth + 1] = r;
    if (!v.node.children.length && !v.node.comments.some((t) => /transpos/i.test(t))) out.ends.push({ line: lineOf(chapter, v.path), reach: r, plies: v.path.length });
  }
  out.ends.sort((a, b) => b.reach - a.reach);
  out.critical.sort((a, b) => b.reach - a.reach);
  out.unknown = [...unknown];
  return out;
}

/** The positions a chapter's close calls need: every position with a move below it. */
export function closeCallPositions(chapter: Chapter): { explorer: string[]; chessdb: string[] } {
  const explorer = new Set<string>();
  const chessdb = new Set<string>();
  for (const v of visits(chapter)) {
    const fen = makeFen(v.before.toSetup());
    explorer.add(fen);
    chessdb.add(fen);
  }
  return { explorer: [...explorer], chessdb: [...chessdb] };
}
