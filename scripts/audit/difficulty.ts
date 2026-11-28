// How hard each of our moves is to find, and what missing it costs (PLAN.md §5.219; the audit's
// rule for what gets drilled). Per move of ours:
// - pFind: Maia's chance that a player finds it (the 23M model reading the line, averaged over the
//   ratings asked, 2000 and 2200 by default);
// - the natural moves: Maia's most likely ones, up to 90% of its mass or six, each scored by
//   Stockfish as our win chance; a natural move's loss is what it gives up against ours;
// - expLoss: the sum of chance x loss over the natural moves that aren't ours, in win% - what
//   playing by feel costs on average.
// Classes (the owner's, 2026-11-28): hard at 5 or more, mid from 3, easy below. Stockfish runs at a
// fixed number of nodes on one thread (engine.ts), so a number is the same on every run; the limits
// belong to one engine's scores (ENGINE below).
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { standardUci } from '../../src/core/chess/uci.ts';
import type { Chapter } from '../../src/core/study/model.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { maia, useModel } from '../ideas/maia.ts';
import { winPct, type EngineKind, type Engines } from './engine.ts';
import { lineOf, nodeAtSans, sideOf, type Colour, type TreeNode } from './study.ts';

export const HARD = 5;
export const MID = 3;
export type Class = 'hard' | 'mid' | 'easy';
export const classOf = (expLoss: number): Class => (expLoss >= HARD ? 'hard' : expLoss >= MID ? 'mid' : 'easy');

/**
 * The measure's engine and its nodes for each move scored: the calibration lines
 * (test/unit/scripts/auditDifficulty.test.ts) are pinned at these. The limits were set on native
 * Stockfish 16's scores; the vendored Stockfish 18 lite keeps every labelled move in its class at
 * 400,000 and at 1,500,000 nodes, and scores the deep tactics (9.b3 in the Qa4 line) nearest the
 * limits' own runs at 1,500,000. Stockfish 19 is stronger and scores the same lines higher (the
 * moves at about 4 come out at about 6): with it the limits would have to be set again with the
 * owner (PLAN.md §5.219).
 */
export const ENGINE: EngineKind = 'lite18';
export const NODES = 1_500_000;
export const NATURAL_MASS = 0.9;
export const NATURAL_MAX = 6;

export interface Natural {
  san: string;
  /** Maia's chance of it. */
  p: number;
  /** Win% it gives up against our move (0 when it is as good or better). */
  loss: number;
}

export interface Rated {
  /** Maia's chance of our move, 0 to 1. */
  pFind: number;
  expLoss: number;
  cls: Class;
  /** Our move's win chance for us, 0 to 100. */
  ours: number;
  /** How far the best natural move is ahead of ours, in win% (0 when ours is best). */
  behind: number;
  /** The natural moves that aren't ours, most likely first. */
  natural: Natural[];
}

/** Maia's most likely moves up to the mass or the count, and ours whatever its chance. */
export function naturalMoves(policy: readonly (readonly [san: string, p: number])[], ours: string): [san: string, p: number][] {
  const sorted = [...policy].sort((a, b) => b[1] - a[1]);
  const out: [string, number][] = [];
  let mass = 0;
  for (const [san, p] of sorted) {
    if (out.length >= NATURAL_MAX || mass >= NATURAL_MASS) break;
    out.push([san, p]);
    mass += p;
  }
  if (!out.some(([san]) => san === ours)) out.push([ours, sorted.find(([san]) => san === ours)?.[1] ?? 0]);
  return out;
}

/** The measure from the natural moves and each one's win chance for us (0 to 100). */
export function rated(natural: readonly (readonly [san: string, p: number])[], ours: string, win: (san: string) => number): Rated {
  const mine = win(ours);
  let expLoss = 0;
  const others = natural
    .filter(([san]) => san !== ours)
    .map(([san, p]) => {
      const loss = Math.max(0, mine - win(san));
      expLoss += p * loss;
      return { san, p, loss };
    });
  const bestWin = Math.max(...natural.map(([san]) => win(san)));
  return { pFind: natural.find(([san]) => san === ours)?.[1] ?? 0, expLoss, cls: classOf(expLoss), ours: mine, behind: bestWin - mine, natural: others };
}

export interface MoveRow extends Rated {
  /** The line from the chapter's start, our move last. */
  path: string[];
  line: string;
}

export interface Measure {
  /** One of our moves: the position before it, the FENs of the positions that led there, the move. */
  rate(pos: Position, before: readonly string[], ours: string): Promise<Rated>;
  engine(): Promise<string>;
}

/** The measure with Maia (the 23M model) and the engines: `elos` averaged, `nodes` per move scored. */
export function createMeasure(engines: Engines, o: { elos?: readonly number[]; nodes?: number } = {}): Measure {
  const elos = o.elos ?? [2000, 2200];
  const nodes = o.nodes ?? NODES;
  useModel('23m');
  return {
    engine: () => engines.name(),
    async rate(pos, before, ours) {
      const sum = new Map<string, number>();
      for (const elo of elos) for (const m of (await maia(pos, elo, before)).moves) sum.set(m.san, (sum.get(m.san) ?? 0) + m.prob / elos.length);
      const natural = naturalMoves([...sum], ours);
      const fen = makeFen(pos.toSetup());
      const win = new Map<string, number>();
      await Promise.all(
        natural.map(async ([san]) => {
          const move = parseSan(pos, san);
          if (!move || !isNormal(move)) throw new Error(`not a legal move at ${fen}: ${san}`);
          const found = await engines.search({ fen, nodes, moves: [standardUci(pos, move)] });
          if (!found[0]) throw new Error(`the engine gave no line for ${san} at ${fen}`);
          win.set(san, winPct(found[0].score, pos.turn));
        }),
      );
      return rated(natural, ours, (san) => win.get(san)!);
    },
  };
}

/** Our moves along one line from the chapter's start (or the standard start), each rated; `from` skips the plies before it. */
export async function rateLine(measure: Measure, start: Position, sans: readonly string[], side: Colour, from = 0): Promise<{ sans: string[]; rated: Rated }[]> {
  const pos = start.clone();
  const before: string[] = [];
  const out: { sans: string[]; rated: Rated }[] = [];
  for (let i = 0; i < sans.length; i++) {
    const move = parseSan(pos, sans[i]!);
    if (!move) throw new Error(`not a legal move after ${sans.slice(0, i).join(' ')}: ${sans[i]}`);
    if (pos.turn === side && i >= from) out.push({ sans: sans.slice(0, i + 1), rated: await measure.rate(pos.clone(), [...before], sans[i]!) });
    before.push(makeFen(pos.toSetup()));
    pos.play(move);
  }
  return out;
}

/** Every move of ours below a path of the chapter, each rated, in the tree's order. */
export async function rateSubtree(measure: Measure, chapter: Chapter, prefix: readonly string[], each?: (row: MoveRow) => void): Promise<MoveRow[]> {
  const side = sideOf(chapter);
  const start = startPosition(chapter);
  const at = nodeAtSans(chapter, prefix);
  if (!start || !at) throw new Error(`no such line in the chapter: ${prefix.join(' ')}`);
  const before: string[] = [];
  const pos = start.clone();
  for (const san of at.path) {
    before.push(makeFen(pos.toSetup()));
    pos.play(parseSan(pos, san)!);
  }
  const rows: MoveRow[] = [];
  const walk = async (node: TreeNode, p: Position, path: string[], bef: string[]) => {
    for (const child of node.children) {
      const move = parseSan(p, child.san);
      if (!move) continue;
      const here = [...path, child.san];
      if (p.turn === side) {
        const row = { path: here, line: lineOf(chapter, here), ...(await measure.rate(p.clone(), bef, child.san)) };
        rows.push(row);
        each?.(row);
      }
      const after = p.clone();
      after.play(move);
      await walk(child, after, here, [...bef, makeFen(p.toSetup())]);
    }
  };
  await walk(at.node, pos, at.path, before);
  return rows;
}

export interface ReplyRow {
  /** The line up to the opponent's reply. */
  path: string[];
  line: string;
  /** The hardest of our next three moves below it, on any of its lines. */
  hardest: MoveRow;
}

/** Per reply of the opponent below the prefix: the hardest of our next three moves (by expLoss). */
export function hardestAfter(rows: readonly MoveRow[], prefixLength: number, side: Colour, firstTurn: Colour = 'white'): ReplyRow[] {
  const ours = (ply: number) => (ply % 2 === 0 ? firstTurn : firstTurn === 'white' ? 'black' : 'white') === side;
  const seen = new Set<string>();
  const out: ReplyRow[] = [];
  for (const { path } of rows) {
    for (let k = prefixLength; k < path.length; k++) {
      if (ours(k)) continue;
      const reply = path.slice(0, k + 1);
      const id = reply.join(' ');
      if (seen.has(id)) continue;
      seen.add(id);
      // Our next three moves: plies k+1, k+3, k+5 of any line through the reply.
      const mine = rows.filter((r) => r.path.length > reply.length && r.path.length <= reply.length + 5 && reply.every((s, i) => r.path[i] === s));
      if (!mine.length) continue;
      out.push({ path: reply, line: '', hardest: mine.reduce((a, b) => (b.expLoss > a.expLoss ? b : a)) });
    }
  }
  return out;
}

export type Verdict = 'drill: common' | 'drill: hard to find' | 'drill: mid, reached often enough' | 'clickable';

export const GUIDE_REACH = 1 / 2000;
export const GUIDE_SHARE = 0.1;
export const HARD_REACH = 1 / 20000;
export const MID_REACH = 1 / 5000;

/**
 * What the measure and the guide say about one reply (a suggestion: the judgement stays the
 * session's and the owner's). Common: reached 1 in 2,000 games or more and played 10% or more at
 * its position. Otherwise drilled when our next moves are hard and it is reached 1 in 20,000 or
 * more, or mid and 1 in 5,000 or more.
 */
export function verdict(reach: number, share: number, cls: Class): Verdict {
  if (reach >= GUIDE_REACH && share >= GUIDE_SHARE) return 'drill: common';
  if (cls === 'hard' && reach >= HARD_REACH) return 'drill: hard to find';
  if (cls === 'mid' && reach >= MID_REACH) return 'drill: mid, reached often enough';
  return 'clickable';
}

/** One move's numbers as a line of text. */
export function ratedText(r: Rated): string {
  const top = r.natural.slice(0, 3).map((a) => `${a.san} ${(100 * a.p).toFixed(0)}% -${a.loss.toFixed(0)}`);
  return `${r.cls.padEnd(4)} | pFind ${(100 * r.pFind).toFixed(0).padStart(3)}% | expLoss ${r.expLoss.toFixed(1).padStart(5)} | ours ${r.ours.toFixed(0)}%${r.behind > 3 ? ` (best is ${r.behind.toFixed(0)} better)` : ''} | natural: ${top.join(', ') || 'none'}`;
}
