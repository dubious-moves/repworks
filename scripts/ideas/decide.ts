// What a card asks a player to decide, for the opening-ideas skill (PLAN.md §5.128). The first
// decks (2026-10-24) asked the wrong questions: a card for every square a piece went to, its
// question naming the piece, so that four in ten named a piece with one sensible move, and once
// the piece was named Maia 2000 found the answer 85% of the time or more in six in ten. So a card
// is now a decision a player could get wrong, and this module measures that:
// - `decisions` ranks the repertoire's own positions by what missing our move there costs: its
//   reach, how often Maia misses the move, and what Maia's likeliest other move gives up;
// - `namedPieces`, `namedMovers` and `namedSquares` read what a question gives away, and `cardDecision` measures
//   a card's position: how many sensible moves there are, for the side and for the piece named,
//   and how often Maia finds the answer, unprompted and once told which piece moves.
// Maia comes in as a function (`Policy`), so the tests can fake it.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { Color, Role } from 'chessops/types';
import { isNormal } from 'chessops/types';
import { makeSquare, parseSquare, squareFile } from 'chessops/util';
import { standardUci } from '../../src/core/chess/uci.ts';
import { legalMoves, type MaiaMove } from '../../src/core/maia/encode.ts';
import { STORM } from '../../src/core/storm/config.ts';
import { wpLoss } from '../../src/core/storm/grade.ts';
import { gradeMoves } from './check.ts';
import { cpOf, positionOf, type Engine } from './engine.ts';
import { trunkOf, type Repertoire } from './tree.ts';

/** What people play at a position: each legal move's probability (Maia at 2000 or more). */
export type Policy = (pos: Position) => Promise<MaiaMove[]>;

/** A move within this much win% of the best is sensible: the storm's `ok` band and better. */
export const SENSIBLE_LOSS = 10;
/** Maia finding the answer this often once the question names the piece: the question gave it away. */
export const GIVEN_AWAY = 0.85;
/** Maia finding the answer this often unprompted: a player finds it anyway. */
export const NATURAL = 0.8;
/** A card at a repertoire position under this reach is too rare to drill (a warning). */
export const RARE = 0.02;
/** Cards a deck has by default (a warning above), and never more than `MAX_CARDS` (an error). */
export const CARDS = 12;
export const MAX_CARDS = 15;

const ROLES: Record<string, Role> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen', king: 'king' };

export interface NamedPiece {
  role: Role;
  /** The square in its name: "the f8-bishop" (home), "the c5-bishop" (where it stands). */
  square?: string;
  /** A pawn's file: "our e-pawn". */
  file?: string;
  /** "light-squared" or "dark-squared". */
  complex?: 'light' | 'dark';
}

/**
 * Our pieces a question names: "the f8-bishop", "our e-pawn", "the queen", "your light-squared
 * bishop". A piece with the opponent's possessive ("White's queen", "his knight") is theirs.
 */
export function namedPieces(question: string, us: Color): NamedPiece[] {
  const them = us === 'white' ? 'black' : 'white';
  const theirs = new RegExp(`(${them}'s|his|her|their|its|the opponent's)\\s+$`, 'i');
  const out: NamedPiece[] = [];
  const re = /\b(?:(light|dark)-squared\s+)?(?:([a-h][1-8])-|([a-h])-)?(pawn|knight|bishop|rook|queen|king)s?\b/gi;
  for (const m of question.matchAll(re)) {
    const before = question.slice(Math.max(0, m.index - 24), m.index);
    if (theirs.test(before)) continue;
    out.push({
      role: ROLES[m[4]!.toLowerCase()]!,
      ...(m[2] ? { square: m[2].toLowerCase() } : {}),
      ...(m[3] ? { file: m[3].toLowerCase() } : {}),
      ...(m[1] ? { complex: m[1].toLowerCase() as 'light' | 'dark' } : {}),
    });
  }
  return out;
}

const complexOf = (square: number): 'light' | 'dark' => ((square & 7) + (square >> 3)) % 2 === 1 ? 'light' : 'dark';

/**
 * The squares of our pieces the question points to when it names the piece that plays `san`:
 * "the queen" is the queen, "which pawn" every pawn, "the f8-bishop" the dark-squared bishop.
 * Undefined when the question doesn't name the mover.
 */
export function namedMovers(question: string, pos: Position, san: string): string[] | undefined {
  const move = parseSan(pos, san);
  if (!move || !isNormal(move)) return undefined;
  const mover = pos.board.get(move.from);
  if (!mover) return undefined;
  const fits = (n: NamedPiece, sq: number): boolean => {
    const piece = pos.board.get(sq);
    if (!piece || piece.color !== pos.turn || piece.role !== n.role) return false;
    if (n.file && n.file !== 'abcdefgh'[squareFile(sq)]) return false;
    if (n.complex && n.complex !== complexOf(sq)) return false;
    if (n.square) {
      const at = pos.board.get(parseSquare(n.square)!);
      // A piece named where it stands is that piece; a bishop named by its home keeps its colour complex.
      if (at && at.color === pos.turn && at.role === n.role) return n.square === makeSquare(sq);
      if (n.role === 'bishop') return complexOf(parseSquare(n.square)!) === complexOf(sq);
    }
    return true;
  };
  const names = namedPieces(question, pos.turn).filter((n) => fits(n, move.from));
  if (!names.length) return undefined;
  return [...pos.board[pos.turn]].filter((sq) => names.some((n) => fits(n, sq))).map(makeSquare);
}

/**
 * The bare squares a question names ("stands on b4", "the c5-pawn"), leaving out the moves it
 * quotes ("5. Bg2", "cxd6", "...a5": a move played is part of the position, not a hint).
 */
export function namedSquares(question: string): string[] {
  const text = question
    .replace(/\b\d+\.(?:\.\.)?\s*\S+/g, ' ')
    .replace(/\.\.\.\s*\S+/g, ' ')
    .replace(/\b[KQRBN][a-h1-8]?x?[a-h][1-8]\S*/g, ' ')
    .replace(/\b[a-h]x[a-h][1-8]\S*/g, ' ')
    .replace(/\b[a-h][1-8]-(?:pawn|knight|bishop|rook|queen|king)/gi, ' ');
  return [...new Set([...text.matchAll(/\b([a-h][1-8])\b/g)].map((m) => m[1]!))];
}

export interface CardDecision {
  /** Our moves within `SENSIBLE_LOSS` of the best (of the first `lines` searched). */
  sensible?: string[];
  /** The named pieces' moves (the mover's, when none is named) within `SENSIBLE_LOSS` of the position's best. */
  pieceSensible?: string[];
  pieceMoves: number;
  /** Maia's probability of the card's answers, unprompted. */
  found?: number;
  /** Maia's probability of the answers among the named pieces' moves: once the question has named them. */
  foundGivenPiece?: number;
  /** Maia's likeliest move. */
  top?: string;
}

/** How much of a decision the card's position is, for its answers (SAN), and for the pieces the question names (`given`, their squares; the first answer's mover by default). */
export async function cardDecision(pos: Position, answers: readonly string[], o: { engine?: Engine; depth: number; policy?: Policy; lines?: number; given?: readonly string[] }): Promise<CardDecision> {
  const legal = legalMoves(pos);
  const ucis = answers.flatMap((san) => {
    const m = parseSan(pos, san);
    return m && isNormal(m) ? [standardUci(pos, m)] : [];
  });
  const given = new Set(o.given ?? [ucis[0]?.slice(0, 2) ?? '']);
  const named = (uci: string) => given.has(uci.slice(0, 2));
  const own = legal.filter((m) => named(m.uci));
  const out: CardDecision = { pieceMoves: own.length };
  if (o.engine) {
    const fen = makeFen(pos.toSetup());
    const sign = pos.turn === 'white' ? 1 : -1;
    const all = await o.engine.search(fen, { depth: o.depth, lines: Math.min(legal.length, o.lines ?? 8) });
    const best = cpOf(all.lines[0]!.score) * sign;
    const ok = (lines: typeof all.lines) => lines.filter((l) => (wpLoss(best, cpOf(l.score) * sign, STORM) ?? 0) < SENSIBLE_LOSS).map((l) => l.san[0]!);
    out.sensible = ok(all.lines);
    if (own.length) out.pieceSensible = ok((await o.engine.search(fen, { depth: o.depth, lines: own.length, moves: own.map((m) => m.uci) })).lines);
  }
  if (o.policy) {
    const moves = await o.policy(pos);
    const p = moves.filter((m) => ucis.includes(m.uci)).reduce((s, m) => s + m.prob, 0);
    const piece = moves.filter((m) => named(m.uci)).reduce((s, m) => s + m.prob, 0);
    out.found = p;
    out.foundGivenPiece = piece ? p / piece : 0;
    out.top = moves[0]?.san;
  }
  return out;
}

export interface Decision {
  key: string;
  fen: string;
  path: string;
  reach: number;
  /** The repertoire's moves here. */
  ours: string[];
  /** Maia's probability of the repertoire's moves. */
  found: number;
  /** Maia's likeliest other move, and its probability. */
  miss?: { san: string; prob: number };
  /** The win% the miss gives up against our move (Stockfish), 0 when it is as good. */
  cost?: number;
  /** Our moves within `SENSIBLE_LOSS` of the best. */
  sensible?: string[];
  /** reach × (1 − found) × (½ + cost/40, at most 1): a miss that costs nothing counts half. */
  value: number;
}

/** Our positions past the opening's trunk with `minReach` or more, ranked by `value`, best first. */
export async function decisions(rep: Repertoire, o: { policy: Policy; engine?: Engine; depth: number; minReach: number }): Promise<Decision[]> {
  const trunk = trunkOf(rep).length;
  const out: Decision[] = [];
  for (const p of rep.positions.values()) {
    if (!p.ours || !p.moves.length || p.reach < o.minReach || p.ply < trunk) continue;
    const pos = positionOf(p.fen);
    const ours = p.moves.map((m) => m.san);
    const ucis = new Set(ours.flatMap((san) => {
      const m = parseSan(pos, san);
      return m && isNormal(m) ? [standardUci(pos, m)] : [];
    }));
    const moves = await o.policy(pos);
    const found = moves.filter((m) => ucis.has(m.uci)).reduce((s, m) => s + m.prob, 0);
    const other = moves.find((m) => !ucis.has(m.uci));
    const d: Decision = { key: p.key, fen: p.fen, path: p.paths[0]!, reach: p.reach, ours, found, value: 0, ...(other ? { miss: { san: other.san, prob: other.prob } } : {}) };
    if (o.engine) {
      const decision = await cardDecision(pos, ours, { engine: o.engine, depth: o.depth, lines: 6 });
      d.sensible = decision.sensible;
      if (other) {
        const [mine, theirs] = await gradeMoves(o.engine, pos, [ours[0]!, other.san], o.depth);
        d.cost = Math.max(0, theirs!.loss - mine!.loss);
      }
    }
    d.value = p.reach * (1 - found) * (d.cost === undefined ? 0.75 : Math.min(1, 0.5 + d.cost / 40));
    out.push(d);
  }
  return out.sort((a, b) => b.value - a.value);
}
