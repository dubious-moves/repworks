// The explorer panel's table (PLAN.md §5.23), as Qchess's `displayStatistics` draws it: a row per
// move with its eval, its share and count of games and its results; ChessDB's moves the games don't
// have as "novelty" rows; a Σ row; and Qchess's sort orders. Pure: the answers in, rows out.
import type { CompactExplorer } from './providers.ts';
import { moveKey, type ChessdbAnswer, type Side } from './search.ts';

/** Qchess's sort menu, Maia's order left out until Phase 3, and the Practical column's order. */
export type SortMode = 'popularity' | 'eval' | 'prac' | 'score' | 'white-eval' | 'black-eval' | 'mine-eval' | 'only-rep';

export const SORT_LABELS: Record<SortMode, string> = {
  popularity: 'Sort by popularity',
  eval: 'Sort by eval',
  prac: 'Sort by practical',
  score: 'Sort by score',
  'white-eval': 'White moves by eval, black by popularity',
  'black-eval': 'Black moves by eval, white by popularity',
  'mine-eval': 'Your moves by eval, opp’s by popularity',
  'only-rep': 'Only show repertoire moves',
};

/** A mate in ChessDB's scores: ±(30000 − plies). */
const MATE = 29000;

export interface Eval {
  /** Centipawns from White's side; a mate is ±(30000 − plies), as ChessDB scores it. */
  cp: number;
}

export interface TableRow {
  san: string;
  /** Games with the move; 0 for a novelty. */
  games: number;
  /** The move's share of the position's games, 0 to 1. */
  share: number;
  white: number;
  draws: number;
  black: number;
  /** The move's average rating in the games, when the database says. */
  rating?: number;
  /** ChessDB's eval of the move, when it knows it. */
  eval?: Eval;
  /** A move ChessDB knows and the games don't have. */
  novelty: boolean;
  /** The chapter already plays it here (Qchess's lighter band). */
  covered: boolean;
  /** Repertoire chapters playing it here (the index: transpositions included). */
  repertoire: number;
}

export interface Table {
  rows: TableRow[];
  /** The Σ row: every move's games added up; undefined without games. */
  total?: { games: number; white: number; draws: number; black: number };
}

export interface TableInput {
  /** The position's side to move. */
  turn: Side;
  /** The database's answer; undefined for ChessDB's tab, or while it is asked. */
  games?: CompactExplorer;
  evals?: ChessdbAnswer;
  sort: SortMode;
  /** The chapter's side, for "your moves by eval". */
  side: Side;
  /** Moves the chapter plays here, as SAN. */
  covered?: ReadonlySet<string>;
  /** Repertoire chapters playing each move here, by SAN. */
  repertoire?: ReadonlyMap<string, number>;
  /** The Practical column's values by SAN, for the `prac` order (the side to move's expected score). */
  practical?: ReadonlyMap<string, number>;
}

/** An eval in pawns from White's side, as Qchess writes it: `+0.18`, `0.00`, `-1.20`; mates `#3` / `-#3`. */
export function formatEval(e: Eval): string {
  if (Math.abs(e.cp) >= MATE) {
    const moves = Math.ceil((30000 - Math.abs(e.cp)) / 2);
    return (e.cp > 0 ? '#' : '-#') + moves;
  }
  const pawns = (e.cp / 100).toFixed(2);
  return e.cp > 0 ? '+' + pawns : pawns === '-0.00' ? '0.00' : pawns;
}

/** Qchess's colours: green above 0, red below, grey at 0 (from White's side, whoever moves). */
export function evalTone(e: Eval): 'plus' | 'minus' | 'even' {
  const rounded = Math.round(e.cp);
  return rounded > 0 ? 'plus' : rounded < 0 ? 'minus' : 'even';
}

/** A share as Qchess writes it: whole percents, one decimal under 1%, `0.0%` for a trace. */
export function formatShare(share: number): string {
  const x = share * 100;
  return (Math.round(x) === 0 && x > 0 ? x.toFixed(1) : String(Math.round(x))) + '%';
}

/** A bar part's label: written only from 15% (Qchess's rule). */
export function barLabel(fraction: number): string {
  const x = fraction * 100;
  if (!(x >= 15)) return '';
  return (Math.round(x) === 0 && x > 0 ? x.toFixed(1) : String(Math.round(x))) + '%';
}

/** The side to move's score with the move, 0 to 1 (Qchess's "score" order). */
function moverScore(r: TableRow, turn: Side): number {
  if (!r.games) return -1;
  return ((turn === 'w' ? r.white : r.black) + r.draws / 2) / r.games;
}

export function buildTable(input: TableInput): Table {
  const { turn, games, evals } = input;
  // By SAN without check marks: the chapter, Lichess and ChessDB may disagree on a `+` only.
  const covered = new Set([...(input.covered ?? [])].map(moveKey));
  const rep = new Map([...(input.repertoire ?? [])].map(([san, n]) => [moveKey(san), n] as const));
  const evalOf = new Map<string, Eval>();
  if (evals && evals.status === 'ok') {
    for (const m of evals.moves ?? []) {
      if (!Number.isFinite(m.score)) continue;
      evalOf.set(moveKey(m.san), { cp: turn === 'w' ? m.score : -m.score });
    }
  }
  const base = (san: string): Pick<TableRow, 'covered' | 'repertoire'> & { eval?: Eval } => {
    const e = evalOf.get(moveKey(san));
    return { covered: covered.has(moveKey(san)), repertoire: rep.get(moveKey(san)) ?? 0, ...(e ? { eval: e } : {}) };
  };

  const rows: TableRow[] = [];
  const seen = new Set<string>();
  let total: Table['total'];
  if (games) {
    const sum = games.moves.reduce((n, m) => n + m.games, 0);
    total = { games: 0, white: 0, draws: 0, black: 0 };
    for (const m of games.moves) {
      seen.add(moveKey(m.san));
      total.games += m.games;
      total.white += m.white;
      total.draws += m.draws;
      total.black += m.black;
      const row: TableRow = { san: m.san, games: m.games, share: sum ? m.games / sum : 0, white: m.white, draws: m.draws, black: m.black, novelty: false, ...base(m.san) };
      if (typeof m.rating === 'number') row.rating = m.rating;
      rows.push(row);
    }
    if (!total.games) total = undefined;
  }
  // ChessDB's moves the games don't have (all of them on ChessDB's tab).
  for (const m of evals?.status === 'ok' ? (evals.moves ?? []) : []) {
    if (seen.has(moveKey(m.san))) continue;
    seen.add(moveKey(m.san));
    rows.push({ san: m.san, games: 0, share: 0, white: 0, draws: 0, black: 0, novelty: true, ...base(m.san) });
  }

  // The best eval for the side to move first; a move with no eval last (Qchess: treated as the worst).
  const byEval = (a: TableRow, b: TableRow) => {
    const va = a.eval ? (turn === 'w' ? a.eval.cp : -a.eval.cp) : -Infinity;
    const vb = b.eval ? (turn === 'w' ? b.eval.cp : -b.eval.cp) : -Infinity;
    return vb - va || b.games - a.games;
  };
  const byGames = (a: TableRow, b: TableRow) => b.games - a.games;
  const mineSide = input.side;
  const evalSort =
    input.sort === 'eval' || (input.sort === 'white-eval' && turn === 'w') || (input.sort === 'black-eval' && turn === 'b') || (input.sort === 'mine-eval' && turn === mineSide);
  let out = rows;
  if (input.sort === 'prac') {
    // The Practical values first, highest first; the moves without one after them, by eval.
    const prac = new Map([...(input.practical ?? [])].map(([san, v]) => [moveKey(san), v] as const));
    const value = (r: TableRow) => prac.get(moveKey(r.san)) ?? -Infinity;
    out = [...out].sort((a, b) => value(b) - value(a) || byEval(a, b));
    return total ? { rows: out, total } : { rows: out };
  }
  if (input.sort === 'only-rep') out = rows.filter((r) => r.covered || r.repertoire > 0);
  if (evalSort) {
    out = [...out].sort(byEval);
  } else {
    // Games first by the order chosen; novelties after them, by eval (Qchess sorts them in only
    // with an eval order).
    const played = out.filter((r) => !r.novelty);
    const novel = out.filter((r) => r.novelty).sort(byEval);
    played.sort(input.sort === 'score' ? (a, b) => moverScore(b, turn) - moverScore(a, turn) || byGames(a, b) : byGames);
    out = [...played, ...novel];
  }
  return total ? { rows: out, total } : { rows: out };
}
