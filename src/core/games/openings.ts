// The games' own explorer (PLAN.md §6, item 4), mistake-lab's OPENING EXPLORER (`c525403`:
// `doBuildOpeningIndex`, `renderExplorerStats`, `applyOpeningFilterFromBoard`,
// `lookupOpeningName`): every game's positions (before each move, and the last), each position's
// moves with their games and results, the games reaching a position (by its key, so transpositions
// count), and the opening name most games reaching a position carry (to title practice games and
// saved items). Pure. Each move's score against what the players' ratings predicted (§5.126).
import type { PositionKey } from '../chess/positionKey.ts';
import { eloExpected } from '../explorer/equal.ts';
import type { Replayed } from './positions.ts';
import type { Color } from './record.ts';

export interface IndexedGame {
  id: string;
  color: Color;
  result: 'win' | 'loss' | 'draw';
  opening?: string | undefined;
  /** The game replayed; undefined when its start can't be read. */
  played: Replayed | undefined;
  /** The user's rating and the opponent's when the game was played, when the record has them. */
  rating?: number | undefined;
  opponentRating?: number | undefined;
}

/** A game through a move: its result for the user, and both ratings when known. */
export interface MoveGame {
  id: string;
  color: Color;
  result: 'win' | 'loss' | 'draw';
  rating?: number;
  opponentRating?: number;
}

export interface MoveStats {
  san: string;
  uci: string;
  count: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  games: MoveGame[];
}

export interface OpeningIndex {
  /** Each game's positions. */
  fens: Map<string, Set<PositionKey>>;
  /** Each position's moves, by SAN, in the order first met. */
  moves: Map<PositionKey, Map<string, MoveStats>>;
  /** The games in the order given (newest first), for the names' ties. */
  order: readonly IndexedGame[];
}

export function openingIndex(games: readonly IndexedGame[]): OpeningIndex {
  const fens = new Map<string, Set<PositionKey>>();
  const moves = new Map<PositionKey, Map<string, MoveStats>>();
  for (const g of games) {
    const set = new Set<PositionKey>();
    const plies = g.played?.plies ?? [];
    for (const p of plies) set.add(p.keyBefore);
    if (plies.length && g.played) set.add(g.played.finalKey);
    fens.set(g.id, set);
    if (!plies.length) continue;
    const other: Color = g.color === 'white' ? 'black' : 'white';
    const winner = g.result === 'win' ? g.color : g.result === 'loss' ? other : undefined;
    for (const p of plies) {
      let at = moves.get(p.keyBefore);
      if (!at) moves.set(p.keyBefore, (at = new Map()));
      let e = at.get(p.san);
      if (!e) at.set(p.san, (e = { san: p.san, uci: p.uci, count: 0, whiteWins: 0, blackWins: 0, draws: 0, games: [] }));
      e.count++;
      if (winner === 'white') e.whiteWins++;
      else if (winner === 'black') e.blackWins++;
      else e.draws++;
      const entry: MoveGame = { id: g.id, color: g.color, result: g.result };
      if (g.rating !== undefined && g.opponentRating !== undefined) {
        entry.rating = g.rating;
        entry.opponentRating = g.opponentRating;
      }
      e.games.push(entry);
    }
  }
  return { fens, moves, order: games };
}

export interface ExplorerRow {
  san: string;
  uci: string;
  count: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  games: string[];
  /** The user's score against what the ratings predicted, over the games with both (§5.126). */
  expected?: Expected;
}

export interface Expected {
  /** The games with both ratings. */
  games: number;
  /** The user's score in them and what the rating gaps predicted, 0 to 1. */
  score: number;
  expected: number;
  /** The opponents' average rating, and the rating whose expected score against it is the score (±800 at 0 and 100%). */
  opponents: number;
  performance: number;
}

/** The user's score against Elo's prediction from each game's two ratings; undefined with no rated game. */
export function expectedOf(games: readonly MoveGame[]): Expected | undefined {
  let n = 0;
  let score = 0;
  let expected = 0;
  let opponents = 0;
  for (const g of games) {
    if (g.rating === undefined || g.opponentRating === undefined) continue;
    n++;
    score += g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0;
    expected += eloExpected(g.rating - g.opponentRating);
    opponents += g.opponentRating;
  }
  if (!n) return undefined;
  const s = score / n;
  const avg = opponents / n;
  const dp = s <= 0 ? -800 : s >= 1 ? 800 : Math.max(-800, Math.min(800, 400 * Math.log10(s / (1 - s))));
  return { games: n, score: s, expected: expected / n, opponents: avg, performance: avg + dp };
}

/**
 * A position's moves from the user's games (`renderExplorerStats`): with a colour, only the games
 * played with it; the results from White's side; most played first.
 */
export function explorerRows(index: OpeningIndex, key: PositionKey, color?: Color): ExplorerRow[] {
  const at = index.moves.get(key);
  if (!at) return [];
  const rows: ExplorerRow[] = [];
  for (const [san, e] of at) {
    const games = color ? e.games.filter((g) => g.color === color) : e.games;
    if (!games.length) continue;
    let whiteWins = 0;
    let blackWins = 0;
    let draws = 0;
    for (const g of games) {
      if (g.result === 'win') g.color === 'white' ? whiteWins++ : blackWins++;
      else if (g.result === 'loss') g.color === 'white' ? blackWins++ : whiteWins++;
      else draws++;
    }
    const row: ExplorerRow = { san, uci: e.uci, count: games.length, whiteWins, blackWins, draws, games: games.map((g) => g.id) };
    const expected = expectedOf(games);
    if (expected) row.expected = expected;
    rows.push(row);
  }
  return rows.sort((a, b) => b.count - a.count);
}

/** The points the user scored above (or below) the ratings' prediction, as the column writes them: `+6`, `−4`, `0`. */
export function expectedCell(e: Expected): string {
  const d = Math.round((e.score - e.expected) * 100);
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0';
}

/** The column's title: the score, the prediction and the performance, over the games with both ratings. */
export function expectedTitle(e: Expected): string {
  const pct = (f: number) => Math.round(f * 100);
  return `You scored ${pct(e.score)}% in ${e.games} game${e.games === 1 ? '' : 's'} with both ratings, where the ratings predicted ${pct(e.expected)}%: ${expectedCell(e)}. Performance ${Math.round(e.performance)} against opponents averaging ${Math.round(e.opponents)}.${e.games < 10 ? ' Few games: read it as a hint.' : ''}`;
}

/** Whether a game reaches the position (`applyOpeningFilterFromBoard`'s filter). */
export const reaches = (index: OpeningIndex, id: string, key: PositionKey): boolean => !!index.fens.get(id)?.has(key);

/** The opening name most of the games reaching the position carry, the first met on a tie; '' when none (`lookupOpeningName`). */
export function openingNameAt(index: OpeningIndex, key: PositionKey): string {
  const count = new Map<string, number>();
  for (const g of index.order) if (g.opening && index.fens.get(g.id)?.has(key)) count.set(g.opening, (count.get(g.opening) ?? 0) + 1);
  let best = '';
  let max = 0;
  for (const [name, c] of count)
    if (c > max) {
      max = c;
      best = name;
    }
  return best;
}
