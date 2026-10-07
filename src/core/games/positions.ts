// A game replayed once (PLAN.md §5.50): each ply's position before it, its key, SAN and standard
// UCI. A move that won't replay ends the game there, as mistake-lab's extraction `break`s, and
// is reported. Pure.
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import type { Color, GameRecord } from './record.ts';

export interface Ply {
  /** 1-based, as mistake-lab's `movePly`. */
  ply: number;
  fenBefore: string;
  keyBefore: PositionKey;
  turn: Color;
  san: string;
  uci: string;
}

export interface Replayed {
  plies: Ply[];
  /** The position after the last move that replayed. */
  finalFen: string;
  finalKey: PositionKey;
  /** The first move that wouldn't replay, when one didn't. */
  stopped?: { ply: number; san: string };
}

export function startOf(game: Pick<GameRecord, 'initialFen'>): Position | undefined {
  if (!game.initialFen) return Chess.default();
  const setup = parseFen(game.initialFen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : undefined;
}

export function replay(game: Pick<GameRecord, 'initialFen' | 'moves'>): Replayed | undefined {
  const pos = startOf(game);
  if (!pos) return undefined;
  const plies: Ply[] = [];
  let stopped: Replayed['stopped'];
  for (let i = 0; i < game.moves.length; i++) {
    const san = game.moves[i]!;
    const move = parseSan(pos, san);
    if (!move || !isNormal(move)) {
      stopped = { ply: i + 1, san };
      break;
    }
    // One FEN a ply: the key is its first four fields (positionKeyOf's own rule), and the SAN is
    // the game's, which parseSan just accepted (Lichess and chess.js both write canonical SAN).
    const fenBefore = makeFen(pos.toSetup());
    const keyBefore = fenBefore.split(' ', 4).join(' ') as PositionKey;
    const turn = pos.turn;
    const uci = standardUci(pos, move);
    pos.play(move);
    plies.push({ ply: i + 1, fenBefore, keyBefore, turn, san, uci });
  }
  const out: Replayed = { plies, finalFen: makeFen(pos.toSetup()), finalKey: positionKeyOf(pos) };
  if (stopped) out.stopped = stopped;
  return out;
}
