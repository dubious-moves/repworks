// The games' own explorer (PLAN.md §6, item 4), mistake-lab's OPENING EXPLORER (`c525403`:
// `doBuildOpeningIndex`, `renderExplorerStats`, `applyOpeningFilterFromBoard`,
// `lookupOpeningName`): every game's positions (before each move, and the last), each position's
// moves with their games and results, the games reaching a position (by its key, so transpositions
// count), and the opening name most games reaching a position carry (to title practice games and
// saved items). Pure.
import type { PositionKey } from '../chess/positionKey.ts';
import type { Replayed } from './positions.ts';
import type { Color } from './record.ts';

export interface IndexedGame {
  id: string;
  color: Color;
  result: 'win' | 'loss' | 'draw';
  opening?: string | undefined;
  /** The game replayed; undefined when its start can't be read. */
  played: Replayed | undefined;
}

export interface MoveStats {
  san: string;
  uci: string;
  count: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  games: { id: string; color: Color; result: 'win' | 'loss' | 'draw' }[];
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
      e.games.push({ id: g.id, color: g.color, result: g.result });
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
    rows.push({ san, uci: e.uci, count: games.length, whiteWins, blackWins, draws, games: games.map((g) => g.id) });
  }
  return rows.sort((a, b) => b.count - a.count);
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
