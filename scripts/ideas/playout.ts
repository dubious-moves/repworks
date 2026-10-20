// Play-outs for the opening-ideas skill (PLAN.md §5.128): short games from a position, each side
// played by Stockfish (the best move, or any within a spread of it) or by Maia at a rating
// (sampled from its policy), so that a repertoire with few model games still shows where the
// pieces go, which breaks come and how the games turn. Seeded, so a run can be repeated.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { parseUciMove } from '../../src/core/chess/uci.ts';
import { cpOf, scoreText, type Engine } from './engine.ts';
import { maia } from './maia.ts';
import { moveGroup, numbered } from './tree.ts';

export type Player = { kind: 'sf'; depth: number; spread: number } | { kind: 'maia'; elo: number };

export function parsePlayer(text: string): Player {
  const [kind, a, b] = text.split(':');
  if (kind === 'maia') return { kind: 'maia', elo: Number(a ?? 2000) };
  if (kind === 'sf') return { kind: 'sf', depth: Number(a ?? 12), spread: Number(b ?? 0) };
  throw new Error(`a player is sf:<depth>[:<spread cp>] or maia:<elo>, not ${text}`);
}

/** mulberry32: a small seeded generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Game {
  sans: string[];
  end: string;
}

export interface Playouts {
  games: Game[];
  movetext: string[];
  /** By side, the moves played grouped by piece and square, counted over the games. */
  moves: Record<Color, [string, number][]>;
}

async function choose(engine: Engine, pos: Position, player: Player, random: () => number): Promise<string | undefined> {
  if (player.kind === 'maia') {
    const read = await maia(pos, player.elo);
    let r = random();
    for (const m of read.moves) {
      r -= m.prob;
      if (r <= 0) return m.uci;
    }
    return read.moves[0]?.uci;
  }
  const fen = makeFen(pos.toSetup());
  const s = await engine.search(fen, { depth: player.depth, lines: player.spread ? 4 : 1 });
  if (!s.lines.length) return undefined;
  const sign = pos.turn === 'white' ? 1 : -1;
  const best = cpOf(s.lines[0]!.score) * sign;
  const near = s.lines.filter((l) => best - cpOf(l.score) * sign <= player.spread);
  return near[Math.floor(random() * near.length)]!.pv[0];
}

export async function playouts(engine: Engine, start: Position, o: { n: number; plies: number; white: Player; black: Player; seed: number; judgeDepth: number }): Promise<Playouts> {
  const random = rng(o.seed);
  const games: Game[] = [];
  const counts: Record<Color, Map<string, number>> = { white: new Map(), black: new Map() };
  for (let g = 0; g < o.n; g++) {
    const pos = start.clone();
    const sans: string[] = [];
    for (let ply = 0; ply < o.plies && !pos.isEnd(); ply++) {
      const uci = await choose(engine, pos, pos.turn === 'white' ? o.white : o.black, random);
      const move = uci && parseUciMove(pos, uci);
      if (!move) break;
      const san = makeSan(pos, move);
      const group = moveGroup(pos, san);
      counts[pos.turn].set(group, (counts[pos.turn].get(group) ?? 0) + 1);
      sans.push(san);
      pos.play(move);
    }
    let end: string;
    if (pos.isCheckmate()) end = `${pos.turn === 'white' ? 'Black' : 'White'} mates`;
    else if (pos.isEnd()) end = 'drawn';
    else {
      const s = await engine.search(makeFen(pos.toSetup()), { depth: o.judgeDepth });
      end = s.lines[0] ? `${scoreText(s.lines[0].score)} (White's view, depth ${s.depth})` : 'no move';
    }
    games.push({ sans, end });
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    games,
    movetext: games.map((g) => `${numbered(g.sans, start.fullmoves, start.turn)}  {${g.end}}`),
    moves: { white: sorted(counts.white), black: sorted(counts.black) },
  };
}
