// Maia 3's inputs and outputs (PLAN.md §5.32), as q_extension's `tools/repgen/maia.mjs`
// (`c26242f`, by the same owner, under this repo's GPL-3.0-or-later) encodes them, on chessops
// instead of chess.js. Pure.
//
//   tokens       [B, 64, 12]  one-hot pieces by square (a1 = 0 … h8 = 63): White's P N B R Q K,
//                             then Black's. From the side to move's view: with Black to move the
//                             board is turned top to bottom and the colours swapped. Castling
//                             rights, en passant and the side to move are not inputs.
//   elo_self, elo_oppo [B]    the rating Maia plays at (the platform passes it twice)
//   logits_move  [B, 4352]    in the same turned frame: from * 64 + to, then 256 promotions,
//                             4096 + (from file * 8 + to file) * 4 + [q r b n]
//   logits_value [B, 3]       loss, draw, win for the side to move
//
// mistake-lab's move table (`all_moves_maia3.json`) is this index formula, all 4,352 entries
// (checked when this was planned), so no table is shipped.
import type { Position } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import type { NormalMove, Role } from 'chessops/types';
import { parseUci } from 'chessops/util';
import { standardUci } from '../chess/uci.ts';

export const MAIA_MOVES = 4352;
export const MAIA_TOKENS = 64 * 12;
/** The long tail carries no weight, only size (q_extension drops it too). */
export const MIN_PROB = 0.001;

const PIECES = 'PNBRQKpnbrqk';
const PROMOS = 'qrbn';

/** The board's tokens, from the side to move's view; `fen` needs only its first two fields. */
export function maiaTokens(fen: string): Float32Array {
  const parts = fen.trim().split(/\s+/);
  const black = parts[1] === 'b';
  const rows = parts[0]!.split('/');
  const t = new Float32Array(MAIA_TOKENS);
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of rows[r] ?? '') {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      // FEN lists rank 8 first. Turned, rank 8 becomes rank 1 and the colours swap.
      const rank = black ? r : 7 - r;
      const p = black ? (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()) : ch;
      const k = PIECES.indexOf(p);
      if (k >= 0) t[(rank * 8 + file) * 12 + k] = 1;
      file++;
    }
  }
  return t;
}

const square = (s: string): number => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const flip = (s: string): string => s[0]! + (9 - Number(s[1]));

/** A move's output index; its squares already in the model's frame. */
export function moveIndex(from: string, to: string, promotion?: string): number {
  if (!promotion) return square(from) * 64 + square(to);
  return 4096 + ((from.charCodeAt(0) - 97) * 8 + (to.charCodeAt(0) - 97)) * 4 + PROMOS.indexOf(promotion);
}

export interface MaiaMove {
  san: string;
  /** Standard UCI (castling e1g1). */
  uci: string;
  prob: number;
}

const ROLE_LETTER: Partial<Record<Role, string>> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

/** Every legal move of `pos`, once, in standard UCI with its SAN. */
export function legalMoves(pos: Position): { uci: string; san: string }[] {
  const out: { uci: string; san: string }[] = [];
  const seen = new Set<string>();
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from);
      const last = (to >> 3) === 7 || (to >> 3) === 0;
      const roles: (Role | undefined)[] = piece?.role === 'pawn' && last ? ['queen', 'rook', 'bishop', 'knight'] : [undefined];
      for (const promotion of roles) {
        const move: NormalMove = promotion ? { from, to, promotion } : { from, to };
        const uci = standardUci(pos, move);
        if (seen.has(uci)) continue;
        seen.add(uci);
        out.push({ uci, san: makeSan(pos, move) });
      }
    }
  }
  return out;
}

/**
 * Maia's policy in `pos` from the move logits of its row (`logits` from `offset`): the legal
 * moves, most likely first, the tail under `MIN_PROB` dropped. Empty with no legal move.
 */
export function policyFrom(pos: Position, logits: ArrayLike<number>, offset = 0): MaiaMove[] {
  const black = pos.turn === 'black';
  const moves = legalMoves(pos);
  if (!moves.length) return [];
  const ls = moves.map((m) => {
    const move = parseUci(m.uci) as NormalMove;
    const sq = (n: number) => `${'abcdefgh'[n & 7]}${(n >> 3) + 1}`;
    const from = black ? flip(sq(move.from)) : sq(move.from);
    const to = black ? flip(sq(move.to)) : sq(move.to);
    return logits[offset + moveIndex(from, to, move.promotion ? ROLE_LETTER[move.promotion] : undefined)]!;
  });
  const max = Math.max(...ls);
  const e = ls.map((x) => Math.exp(x - max));
  const z = e.reduce((a, b) => a + b, 0);
  return moves
    .map((m, i) => ({ san: m.san, uci: m.uci, prob: e[i]! / z }))
    .filter((x) => x.prob >= MIN_PROB)
    .sort((a, b) => b.prob - a.prob);
}

/**
 * The side to move's expected score, 0 to 1, from a row of value logits (loss, draw, win):
 * win + draw / 2, as Qchess's `whiteWinProb` before it turns it to White's side.
 */
export function expectedScore(valueLogits: ArrayLike<number>, offset = 0): number {
  const l = valueLogits[offset]!;
  const d = valueLogits[offset + 1]!;
  const w = valueLogits[offset + 2]!;
  const max = Math.max(l, d, w);
  const el = Math.exp(l - max);
  const ed = Math.exp(d - max);
  const ew = Math.exp(w - max);
  return (ew + ed / 2) / (el + ed + ew);
}

/**
 * Maia's rating for the explorer's filter (q_extension's `maiaEloFor`, its extension's
 * `peMaiaElo`): the mean of the rating groups' midpoints (2500 is 2500+), in Maia's range
 * (600–2600) and by 50. Lichess's lowest group is 0 there and 400 in this site's filter.
 */
const MID: Record<number, number> = { 0: 800, 400: 800, 1000: 1100, 1200: 1300, 1400: 1500, 1600: 1700, 1800: 1900, 2000: 2100, 2200: 2350, 2500: 2650 };
export function maiaEloFor(ratings: readonly number[]): number {
  let sum = 0;
  let n = 0;
  for (const b of ratings) {
    const m = MID[b] ?? b + 100;
    if (Number.isFinite(m)) {
      sum += m;
      n++;
    }
  }
  return clampElo(n ? sum / n : 1900);
}

export const clampElo = (elo: number): number => Math.max(600, Math.min(2600, Math.round(elo / 50) * 50));
