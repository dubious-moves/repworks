// A continuation of Lc0 against people (PLAN.md §5.144): from a position, Lc0's searched move on
// its side and, on the other, the move people play most there: the Lichess database's most played
// move, with Maia's likelihood blended in where the database thins out (under `BLEND_GAMES` games
// the database's shares weigh games / `BLEND_GAMES`, Maia the rest; with none, Maia alone). Every
// pick is the likeliest, so the same position gives the same line. Pure: Lc0, the database and
// Maia are passed in.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import type { MaiaMove } from '../maia/encode.ts';
import type { SearchResult } from './search.ts';

/** From this many games the database's shares alone pick the move; under it Maia is blended in. */
export const BLEND_GAMES = 100;
export const DEFAULT_PLIES = 6;

/** A position's games in the database: its total, and each move's (UCI in either castling spelling). */
export interface DbMoves {
  total: number;
  moves: readonly { uci: string; san: string; games: number }[];
}

export interface OpponentPick {
  uci: string;
  san: string;
  /** `db`: the database alone (BLEND_GAMES or more); `blend`: both; `maia`: Maia alone. */
  source: 'db' | 'blend' | 'maia';
  /** The move's blended likelihood: w · its share of the games + (1 − w) · Maia's. */
  prob: number;
  /** The position's games, and the move's share of them. */
  games: number;
  share: number;
  /** Maia's likelihood of the move, when Maia was asked. */
  maia?: number;
  /** The database's weight, games / BLEND_GAMES up to 1. */
  weight: number;
}

/** The database's weight at a position with `games` games. */
export const dbWeight = (games: number, blendFrom = BLEND_GAMES): number => Math.min(1, Math.max(0, games) / blendFrom);

/**
 * The move people play most at `pos`: the database's most played move from `BLEND_GAMES` games, a
 * blend with Maia under that, Maia alone with no games. Undefined when neither knows a legal move
 * (no database answer and no Maia, or no legal move).
 */
export function opponentPick(pos: Position, db: DbMoves | undefined, maia: readonly MaiaMove[] | undefined, blendFrom = BLEND_GAMES): OpponentPick | undefined {
  const games = db?.total ?? 0;
  // Without Maia, the database's shares alone, however few its games.
  const w = maia ? dbWeight(games, blendFrom) : games > 0 ? 1 : 0;
  const shares = new Map<string, { san: string; share: number }>();
  for (const m of db?.moves ?? []) {
    const move = parseUciMove(pos, m.uci);
    if (!move || !games) continue;
    const uci = standardUci(pos, move);
    shares.set(uci, { san: m.san, share: (shares.get(uci)?.share ?? 0) + m.games / games });
  }
  const maiaBy = new Map((maia ?? []).map((m) => [m.uci, m]));
  const candidates = new Set<string>([...(w > 0 ? shares.keys() : []), ...(w < 1 ? maiaBy.keys() : [])]);
  let best: OpponentPick | undefined;
  for (const uci of candidates) {
    const move = parseUciMove(pos, uci);
    if (!move) continue;
    const share = shares.get(uci)?.share ?? 0;
    const m = maiaBy.get(uci)?.prob;
    const prob = w * share + (1 - w) * (m ?? 0);
    const pick: OpponentPick = {
      uci,
      san: shares.get(uci)?.san ?? maiaBy.get(uci)?.san ?? uci,
      source: w >= 1 ? 'db' : w > 0 ? 'blend' : 'maia',
      prob,
      games,
      share,
      ...(m !== undefined ? { maia: m } : {}),
      weight: w,
    };
    // Ties: the more games, then Maia's likelier.
    if (!best || prob > best.prob || (prob === best.prob && (share > best.share || (share === best.share && (m ?? 0) > (best.maia ?? 0))))) best = pick;
  }
  return best;
}

export type Side = 'white' | 'black';

export interface ContinuationPly {
  san: string;
  uci: string;
  /** The position after the move. */
  fen: string;
  by: 'lc0' | 'people';
  lc0?: SearchResult;
  people?: OpponentPick;
  /** Why the database wasn't used here (its error), when it wasn't. */
  dbError?: string;
}

export interface ContinuationPorts {
  /** Lc0's searched move at the last position of a line (oldest first). */
  lc0(history: readonly Position[]): Promise<SearchResult>;
  /** The database's games at a position, or an error's text. */
  db(fen: string): Promise<DbMoves | { error: string }>;
  /** Maia's policy at a position, or undefined when Maia can't answer. */
  maia(fen: string): Promise<readonly MaiaMove[] | undefined>;
}

export interface ContinuationOptions {
  /** The line to the start, oldest first (Lc0 reads the history). */
  history: readonly Position[];
  plies: number;
  /** Lc0's side; people play the other. */
  lc0: Side;
  ports: ContinuationPorts;
  /** Each move once it is decided. */
  onPly?(ply: ContinuationPly, index: number): void;
  /** Checked before each move: true stops the line there. */
  stopped?(): boolean;
}

export interface Continuation {
  plies: ContinuationPly[];
  /** Why it ended before `plies`: the game over, no move known, stopped. */
  ended?: 'game over' | 'no move' | 'stopped';
}

/** The continuation, move by move (each reported as it is decided). */
export async function modelContinuation(o: ContinuationOptions): Promise<Continuation> {
  const line = [...o.history];
  const plies: ContinuationPly[] = [];
  for (let i = 0; i < o.plies; i++) {
    if (o.stopped?.()) return { plies, ended: 'stopped' };
    const pos = line[line.length - 1]!;
    if (pos.isEnd()) return { plies, ended: 'game over' };
    let ply: Omit<ContinuationPly, 'san' | 'fen'> & { san?: string };
    if (pos.turn === o.lc0) {
      const r = await o.ports.lc0(line);
      ply = { uci: r.uci, san: r.san, by: 'lc0', lc0: r };
    } else {
      const fen = makeFen(pos.toSetup());
      const db = await o.ports.db(fen);
      const dbMoves = 'error' in db ? undefined : db;
      // Maia only where it counts: under BLEND_GAMES games, or with no database answer.
      const maia = dbWeight(dbMoves?.total ?? 0) < 1 ? await o.ports.maia(fen) : undefined;
      const pick = opponentPick(pos, dbMoves, maia);
      if (!pick) return { plies, ended: 'no move' };
      ply = { uci: pick.uci, by: 'people', people: pick, ...('error' in db ? { dbError: db.error } : {}) };
    }
    if (o.stopped?.()) return { plies, ended: 'stopped' };
    const move = parseUciMove(pos, ply.uci);
    if (!move) return { plies, ended: 'no move' };
    const next = pos.clone();
    const san = makeSanAndPlay(next, move);
    line.push(next);
    const done: ContinuationPly = { ...ply, san, fen: makeFen(next.toSetup()) };
    plies.push(done);
    o.onPly?.(done, i);
  }
  return { plies };
}
