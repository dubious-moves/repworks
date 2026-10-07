// Deviations from the repertoire in real games (PLAN.md §5.58), a port of mistake-lab's
// `detectRepertoireDeviations` (`c525403`): each game walked from its start while it stays in the
// repertoire for the user's colour. At the user's move, a position the repertoire has no move for
// ends the walk; a move the repertoire doesn't have there is a deviation (the first of the game).
// At the opponent's move, a reply that leaves the repertoire (the user has no move in the position
// it reaches) is a gap, and ends the walk. Deviations are grouped by position (the most recent
// game shown), gaps by position and reply; dismissed positions are left out of the deviations.
//
// mistake-lab's trie is the repertoire's own moves by position: here, the repertoire index's
// `own` moves (a chapter's side's moves, §5.1). One difference, on purpose: mistake-lab walks only
// the games that gave it an item (its list drops the others before the walk); every game is
// walked here, since a game played well is still a game played.
import type { PositionKey } from '../chess/positionKey.ts';
import type { Occurrence, RepertoireIndex } from '../repertoire/index.ts';
import type { Ply } from './positions.ts';
import type { Color } from './record.ts';

export interface WalkGame {
  id: string;
  color: Color;
  speed: string;
  createdAt: number;
  opening?: string;
  plies: readonly Ply[];
  /** The position after the last ply. */
  finalKey: PositionKey;
}

export interface DeviationGame {
  gameId: string;
  /** The ply of the move played (1-based). */
  ply: number;
  played: { san: string; uci: string };
  speed: string;
  createdAt: number;
}

export interface Deviation {
  key: PositionKey;
  fenBefore: string;
  color: Color;
  /** The repertoire's move there (its first), and where it is played. */
  repertoire: { uci: string; san: string; at: Occurrence };
  opening: string;
  /** Newest first. */
  games: DeviationGame[];
}

export interface Gap {
  /** The position before the opponent's reply. */
  key: PositionKey;
  fen: string;
  color: Color;
  move: { san: string; uci: string };
  /** The chapter of the last repertoire move before it. */
  at?: Occurrence;
  games: string[];
}

const ownAt = (index: RepertoireIndex, key: PositionKey) => {
  const own = index.positions.get(key)?.own;
  return own && own.size ? own : undefined;
};

export function findDeviations(games: readonly WalkGame[], index: RepertoireIndex, dismissed: ReadonlySet<string> = new Set()): { deviations: Deviation[]; gaps: Gap[] } {
  const found: (Omit<Deviation, 'games'> & { game: DeviationGame })[] = [];
  const gaps = new Map<string, Gap>();
  for (const g of games) {
    if (g.id.startsWith('_test_') || g.plies.length < 4) continue;
    let deviated = false;
    let lastAt: Occurrence | undefined;
    for (let i = 0; i < g.plies.length; i++) {
      const p = g.plies[i]!;
      if (p.turn === g.color) {
        const own = ownAt(index, p.keyBefore);
        if (!own) break;
        const [firstUci, places] = own.entries().next().value!;
        lastAt = places[0] ?? lastAt;
        if (!own.has(p.uci) && ![...own.values()].some((o) => o.some((x) => x.san === p.san))) {
          if (!deviated) {
            found.push({ key: p.keyBefore, fenBefore: p.fenBefore, color: g.color, repertoire: { uci: firstUci, san: places[0]!.san, at: places[0]! }, opening: g.opening ?? '', game: { gameId: g.id, ply: p.ply, played: { san: p.san, uci: p.uci }, speed: g.speed, createdAt: g.createdAt } });
            deviated = true;
          }
        }
      } else {
        const next = i + 1 < g.plies.length ? g.plies[i + 1]!.keyBefore : g.finalKey;
        if (!ownAt(index, next)) {
          const id = `${p.keyBefore}:${p.san}`;
          let gap = gaps.get(id);
          if (!gap) gaps.set(id, (gap = { key: p.keyBefore, fen: p.fenBefore, color: g.color, move: { san: p.san, uci: p.uci }, ...(lastAt ? { at: lastAt } : {}), games: [] }));
          gap.games.push(g.id);
          break;
        }
      }
    }
  }
  const byKey = new Map<string, Deviation>();
  for (const d of found) {
    let dev = byKey.get(d.key);
    if (!dev) byKey.set(d.key, (dev = { key: d.key, fenBefore: d.fenBefore, color: d.color, repertoire: d.repertoire, opening: d.opening, games: [] }));
    dev.games.push(d.game);
  }
  for (const dev of byKey.values()) dev.games.sort((a, b) => b.createdAt - a.createdAt);
  const deviations = [...byKey.values()].filter((d) => !dismissed.has(d.key)).sort((a, b) => b.games.length - a.games.length);
  return { deviations, gaps: [...gaps.values()].sort((a, b) => b.games.length - a.games.length) };
}

/** mistake-lab's deviation filter: the colour, and any of its games at a speed chosen. */
export function deviationPasses(d: Deviation, f: { color: '' | Color; speeds: readonly string[] }): boolean {
  if (f.color && d.color !== f.color) return false;
  return !f.speeds.length || d.games.some((g) => f.speeds.includes(g.speed));
}
