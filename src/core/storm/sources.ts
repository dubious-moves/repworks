// Where storm positions come from (PLAN.md §5.40), ported from lichessable's shipped
// `stormFrontiers`, `stormDecisions`, `stormUncoveredMoves` and the scope filters
// (DESIGN-intuition-storm.md §4 stage 0, §14.18, §14.21, §19, §28), over the repertoire's
// chapters instead of a Chessable course's variations. Pure.
//
// - A **frontier** is the position a line ends on: past it the repertoire says nothing. Its side is
//   the chapter's. Lines shorter than `minVarPlies` and lines from a set-up position (a fragment no
//   real game passes through) make none; an end lines of both sides reach is ambiguous and left
//   out; an end where another line of the same side goes on is not an end (§14.18).
// - A **decision point** is a position where the opponent is to move that a line passes through,
//   with the replies the repertoire covers there (§19); the explorer's other replies are its gaps.
import type { Position } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { isNormal, type Color } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import { header, type Chapter, type MoveNode, type RootNode } from '../study/model.ts';
import { startPosition } from '../study/tree.ts';
import type { StormConfig } from './config.ts';
import { fenOf, sanToUci, positionOf, START_FEN } from './walk.ts';

const START_KEY = positionKeyOf(positionOf(START_FEN)!);

export interface LinePly {
  /** The position the move is played in, and its key. */
  before: string;
  key: PositionKey;
  uci: string;
  san: string;
  mover: Color;
}

/** A root-to-leaf line of a repertoire chapter, with its positions. */
export interface StormLine {
  sid: string;
  cid: string;
  /** The chapter's name, for a card's label. */
  name: string;
  side: Color;
  path: string[];
  plies: LinePly[];
  /** The position after the last move, and its key. */
  end: string;
  endKey: PositionKey;
  /** False for a chapter from a set-up position. */
  fromStart: boolean;
}

export interface LineRef {
  sid: string;
  cid: string;
  path: readonly string[];
}

const sideOf = (c: Chapter): Color | undefined => {
  const o = header(c, 'Orientation');
  return o === 'white' || o === 'black' ? o : undefined;
};

/** Every line of the given repertoire chapters (a chapter with no side or no legal start makes none). */
export function stormLines(chapters: readonly { sid: string; chapter: Chapter }[]): StormLine[] {
  const out: StormLine[] = [];
  for (const { sid, chapter } of chapters) {
    const side = sideOf(chapter);
    const start = startPosition(chapter);
    if (!side || !start) continue;
    const fromStart = positionKeyOf(start) === START_KEY;
    const name = header(chapter, 'ChapterName') || header(chapter, 'Event') || chapter.id;
    const walk = (node: RootNode | MoveNode, pos: Position, path: string[], plies: LinePly[]) => {
      let walked = 0;
      for (const child of node.children) {
        const move = parseSan(pos, child.san);
        if (!move || !isNormal(move)) continue;
        const before = fenOf(pos);
        const ply: LinePly = { before, key: positionKeyOf(pos), uci: standardUci(pos, move), san: child.san, mover: pos.turn };
        const after = pos.clone();
        after.play(move);
        walked++;
        walk(child, after, [...path, child.san], [...plies, ply]);
      }
      if (path.length > 0 && walked === 0) out.push({ sid, cid: chapter.id, name, side, path, plies, end: fenOf(pos), endKey: positionKeyOf(pos), fromStart });
    };
    walk(chapter.root, start, [], []);
  }
  return out;
}

/** Positions each side's lines stand on (every ply's `before`): the walk's re-entry stop (§14.18.4). */
export type Coverage = Record<Color, Set<PositionKey>>;

export function coverage(lines: readonly StormLine[]): Coverage {
  const cont: Coverage = { white: new Set(), black: new Set() };
  for (const l of lines) for (const p of l.plies) cont[l.side].add(p.key);
  return cont;
}

export interface Frontier {
  key: PositionKey;
  fen: string;
  side: Color;
  /** Lines ending here: the draw's weight. */
  n: number;
  /** Up to three line names. */
  names: string[];
  lines: LineRef[];
  /** The line's last move and the position it was played in (the invented line's seed, §20). */
  lastUci: string;
  lastSan: string;
  lastFen: string;
}

export interface FrontierSet {
  frontiers: Frontier[];
  cont: Coverage;
  /** Ends left out because another line goes on from them (§14.18). */
  covered: number;
  /** Ends left out because lines of both sides reach them. */
  ambiguous: number;
}

export function frontiers(lines: readonly StormLine[], c: StormConfig): FrontierSet {
  const cont = coverage(lines);
  const byEnd = new Map<PositionKey, { f: Frontier; w: number; b: number }>();
  for (const l of lines) {
    if (l.plies.length < c.minVarPlies || !l.fromStart) continue;
    let e = byEnd.get(l.endKey);
    const last = l.plies[l.plies.length - 1]!;
    if (!e) {
      e = { f: { key: l.endKey, fen: l.end, side: l.side, n: 0, names: [], lines: [], lastUci: last.uci, lastSan: last.san, lastFen: last.before }, w: 0, b: 0 };
      byEnd.set(l.endKey, e);
    }
    e.f.n++;
    if (l.side === 'white') e.w++;
    else e.b++;
    e.f.lines.push({ sid: l.sid, cid: l.cid, path: l.path });
    if (e.f.names.length < 3 && !e.f.names.includes(l.name)) e.f.names.push(l.name);
  }
  const out: Frontier[] = [];
  let covered = 0;
  let ambiguous = 0;
  for (const { f, w, b } of byEnd.values()) {
    if (w && b) {
      ambiguous++;
      continue;
    }
    f.side = w ? 'white' : 'black';
    if (cont[f.side].has(f.key)) {
      covered++;
      continue;
    }
    out.push(f);
  }
  return { frontiers: out, cont, covered, ambiguous };
}

export interface DecisionPoint {
  key: PositionKey;
  fen: string;
  /** The repertoire's side: the user, who answers the reply. */
  side: Color;
  n: number;
  names: string[];
  lines: LineRef[];
  /** The opponent's replies the repertoire plays here, standard UCI. */
  covered: Set<string>;
}

/** Positions with the opponent to move that a line passes, with the replies it covers (§19). */
export function decisions(lines: readonly StormLine[]): { points: DecisionPoint[]; cont: Coverage } {
  const cont = coverage(lines);
  const byPos = new Map<PositionKey, DecisionPoint & { mixed: boolean }>();
  for (const l of lines) {
    for (const p of l.plies) {
      if (p.mover === l.side) continue; // the user's own move: a choice, not a gap
      let e = byPos.get(p.key);
      if (!e) byPos.set(p.key, (e = { key: p.key, fen: p.before, side: l.side, n: 0, names: [], lines: [], covered: new Set(), mixed: false }));
      if (e.side !== l.side) {
        e.mixed = true;
        continue;
      }
      e.covered.add(p.uci);
      if (!l.fromStart) continue;
      e.n++;
      e.lines.push({ sid: l.sid, cid: l.cid, path: l.path });
      if (e.names.length < 3 && !e.names.includes(l.name)) e.names.push(l.name);
    }
  }
  const points: DecisionPoint[] = [];
  for (const e of byPos.values()) {
    if (e.mixed || !e.n) continue;
    const { mixed: _mixed, ...point } = e;
    points.push(point);
  }
  return { points, cont };
}

export interface ExplorerReply {
  san: string;
  white?: number;
  draws?: number;
  black?: number;
}

export interface Uncovered {
  uci: string;
  san: string;
  games: number;
  /** Percent of the position's games. */
  share: number;
}

/**
 * The replies the repertoire doesn't answer at a decision point (§19): read by SAN (the
 * explorer's UCI writes castling as king-takes-rook), over both floors, most played first.
 */
export function uncoveredMoves(point: Pick<DecisionPoint, 'fen' | 'covered'>, moves: readonly ExplorerReply[], total: number, c: StormConfig): Uncovered[] {
  const pos = positionOf(point.fen);
  if (!pos) return [];
  const out: Uncovered[] = [];
  for (const m of moves) {
    const games = (m.white || 0) + (m.draws || 0) + (m.black || 0);
    if (!games) continue;
    const uci = m.san ? sanToUci(pos, m.san) : undefined;
    if (!uci || point.covered.has(uci)) continue;
    if (games < c.uncMinGames) continue;
    const share = total > 0 ? (games / total) * 100 : 0;
    if (share < c.uncMinShare) continue;
    out.push({ uci, san: m.san, games, share });
  }
  out.sort((a, b) => b.games - a.games);
  return out.slice(0, c.uncMaxPerPosition);
}

/** What a session storms: the whole repertoire, a study, a chapter, or the lines through a position (§14.21, §28). */
export type StormScope = { kind: 'all' } | { kind: 'study'; sid: string } | { kind: 'chapter'; sid: string; cid: string } | { kind: 'position'; key: PositionKey };

/** Whether a line is in the scope; for a position, whether it stands on it (a line's end counts). */
export function lineInScope(l: StormLine, s: StormScope): boolean {
  switch (s.kind) {
    case 'all':
      return true;
    case 'study':
      return l.sid === s.sid;
    case 'chapter':
      return l.sid === s.sid && l.cid === s.cid;
    case 'position':
      return l.endKey === s.key || l.plies.some((p) => p.key === s.key);
  }
}

/**
 * The frontiers and decision points of the lines in scope. Coverage stays the whole repertoire's:
 * a walk out of a chapter's line into another chapter's still re-enters the repertoire. A
 * position scope keeps the frontiers and decision points past the position (at it or after it).
 */
export function inScope<T extends { lines: LineRef[]; key: PositionKey }>(items: readonly T[], lines: readonly StormLine[], s: StormScope): T[] {
  if (s.kind === 'all') return items.slice();
  const keep = new Set<string>();
  const after = new Set<PositionKey>();
  for (const l of lines) {
    if (!lineInScope(l, s)) continue;
    keep.add(l.sid + '/' + l.cid + '/' + l.path.join(' '));
    if (s.kind === 'position') {
      const at = l.plies.findIndex((p) => p.key === s.key);
      if (at >= 0) for (const p of l.plies.slice(at)) after.add(p.key);
      after.add(l.endKey);
    }
  }
  return items.filter((it) => it.lines.some((r) => keep.has(r.sid + '/' + r.cid + '/' + r.path.join(' '))) && (s.kind !== 'position' || after.has(it.key)));
}
