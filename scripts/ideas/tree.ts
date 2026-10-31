// A repertoire read for the opening-ideas skill (PLAN.md §5.128): every position of every chapter,
// merged where move orders transpose, with how often a game reaches it. The reach multiplies the
// opponent's move shares along the way, read from a comment that starts with a percentage (as the
// owner's repertoire builder writes them, `{ 45% }`). The shares are read at the merged position: a
// move order that gives one reply only (with no share) passes on that reply's part of the games,
// not all of them, where another order gives the other replies' shares. A move without a share
// beside moves with one takes an even part of what they leave, and marks the position approximate;
// an only move takes all of it, and moves none of which has a share split it evenly. The profile
// sums what we play, where our pieces stand and which pawn structures we reach, weighted by that
// reach: the raw material of the rules of thumb.
// The development map follows each of our pieces and pawns through every line: where it goes first,
// in which positions, and what in the setup sets those positions apart (the owner's ask: the
// first ideas say where each piece develops, and when).
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Color, Role } from 'chessops/types';
import { isNormal } from 'chessops/types';
import { makeSquare, squareFile, squareRank } from 'chessops/util';
import { positionKeyOf } from '../../src/core/chess/positionKey.ts';
import { parseGames } from '../../src/core/pgn/parse.ts';
import { header, type Chapter, type MoveNode, type Shape } from '../../src/core/study/model.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { material, pawnFacts } from './vision.ts';

export interface TreePos {
  key: string;
  fen: string;
  /** The move orders reaching it, as numbered movetext. */
  paths: string[];
  /** The share of the repertoire's games that reach it, 0 to 1, over every move order. */
  reach: number;
  approx: boolean;
  toMove: Color;
  ours: boolean;
  /** Our moves here (when it is our move), or the opponent's with their shares. */
  moves: { san: string; share?: number }[];
  /** The position each move leads to, by its key. */
  next: { san: string; key: string }[];
  leaf: boolean;
  comments: string[];
  shapes: Shape[];
  ply: number;
}

export interface Repertoire {
  side: Color;
  positions: Map<string, TreePos>;
  /** The comments that name a transposition, with where they stand. */
  transpositions: { at: string; text: string }[];
  problems: string[];
  chapters: Chapter[];
}

const SHARE = /^\s*(\d+(?:\.\d+)?)\s*%/;

export function shareOf(node: MoveNode): number | undefined {
  for (const c of node.comments) {
    const m = SHARE.exec(c);
    if (m) return Number(m[1]) / 100;
  }
  return undefined;
}

/**
 * The share of the games at a position that go on with a move: 1 for ours (its share when the
 * repertoire was read with `ourShares`: model games, where the strong side varies), else its
 * `{ n% }`, or for a move without one an even part of what the moves with one leave (all of it,
 * split, when none has one).
 */
export function weightOf(p: Pick<TreePos, 'ours' | 'moves'>, san: string): number {
  const m = p.moves.find((x) => x.san === san);
  if (p.ours) return m?.share ?? 1;
  if (m?.share !== undefined) return m.share;
  const known = p.moves.filter((x) => x.share !== undefined);
  const left = Math.max(0, 1 - known.reduce((t, x) => t + x.share!, 0));
  return left / Math.max(1, p.moves.length - known.length);
}

/** Movetext for SANs played from a position: `4. Nf3 e5 5. Bb5` or `4... e5 5. Bb5`. */
export function numbered(sans: readonly string[], fullmoves: number, turn: Color): string {
  const out: string[] = [];
  let n = fullmoves;
  let white = turn === 'white';
  sans.forEach((san, i) => {
    if (white) out.push(`${n}. ${san}`);
    else out.push(i === 0 ? `${n}... ${san}` : san);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

/**
 * `ourShares`: read our moves' `{ n% }` too, as the share of the games that go on with each (model
 * games read as a repertoire); a repertoire's own moves are all played, each by every game.
 */
export function readRepertoire(text: string, side?: Color, o: { ourShares?: boolean } = {}): Repertoire {
  let n = 0;
  const parsed = parseGames(text, () => `c${++n}`);
  const problems: string[] = [];
  const chapters: Chapter[] = [];
  for (const p of parsed) {
    if (p.ok) {
      chapters.push(p.chapter);
      for (const note of p.notes) if (note.kind === 'illegal') problems.push(`illegal move ${note.san} after ${note.path.join(' ')}`);
    } else problems.push(p.reason);
  }
  const orientation = chapters.map((c) => header(c, 'Orientation')).find((o) => o === 'white' || o === 'black') as Color | undefined;
  const us: Color = side ?? orientation ?? 'white';
  const positions = new Map<string, TreePos>();
  const transpositions: { at: string; text: string }[] = [];
  const seenPaths = new Set<string>();
  const roots = new Map<string, number>();
  const visit = (pos: Position, start: Position, sans: string[], node: { comments: string[]; shapes: Shape[]; children: MoveNode[] }): string => {
    const key = positionKeyOf(pos);
    const path = numbered(sans, start.fullmoves, start.turn);
    const ours = pos.turn === us;
    let entry = positions.get(key);
    const fresh = !seenPaths.has(`${key}|${path}`);
    seenPaths.add(`${key}|${path}`);
    if (!entry) {
      entry = { key, fen: makeFen(pos.toSetup()), paths: [], reach: 0, approx: false, toMove: pos.turn, ours, moves: [], next: [], leaf: true, comments: [], shapes: [], ply: sans.length + (start.fullmoves - 1) * 2 + (start.turn === 'black' ? 1 : 0) };
      positions.set(key, entry);
    }
    if (fresh) entry.paths.push(path || '(start)');
    for (const c of node.comments) {
      if (SHARE.test(c) && c.replace(SHARE, '').trim() === '') continue;
      if (!entry.comments.includes(c)) entry.comments.push(c);
      if (/transpose/i.test(c)) transpositions.push({ at: path, text: c.replace(/\s+/g, ' ') });
    }
    entry.shapes.push(...node.shapes);
    if (node.children.length) entry.leaf = false;
    for (const child of node.children) {
      const move = parseSan(pos, child.san);
      if (!move || !isNormal(move)) continue;
      const next = pos.clone();
      next.play(move);
      const share = ours && !o.ourShares ? undefined : shareOf(child);
      const known = entry.moves.find((m) => m.san === child.san);
      if (!known) entry.moves.push(share === undefined ? { san: child.san } : { san: child.san, share });
      else if (known.share === undefined && share !== undefined) known.share = share;
      const to = visit(next, start, [...sans, child.san], child);
      if (!entry.next.some((n) => n.san === child.san)) entry.next.push({ san: child.san, key: to });
    }
    return key;
  };
  for (const chapter of chapters) {
    const start = startPosition(chapter);
    if (!start) {
      problems.push(`chapter ${header(chapter, 'ChapterName') ?? chapter.id}: its start position is not legal`);
      continue;
    }
    const key = visit(start.clone(), start, [], chapter.root);
    roots.set(key, (roots.get(key) ?? 0) + 1);
  }
  // The reach flows down the merged positions, parents first, so every move order adds its share.
  const parents = new Map<string, number>();
  for (const p of positions.values()) for (const n of p.next) parents.set(n.key, (parents.get(n.key) ?? 0) + 1);
  for (const [key, r] of roots) positions.get(key)!.reach = r;
  const ready = [...positions.values()].filter((p) => !parents.get(p.key));
  while (ready.length) {
    const p = ready.pop()!;
    for (const n of p.next) {
      const child = positions.get(n.key)!;
      child.reach += p.reach * weightOf(p, n.san);
      // A reply without a share among replies with one is a guess; an only reply is the line's premise.
      child.approx ||= p.approx || (!p.ours && p.moves.length > 1 && p.moves.find((m) => m.san === n.san)?.share === undefined);
      const left = parents.get(n.key)! - 1;
      parents.set(n.key, left);
      if (!left) ready.push(child);
    }
  }
  return { side: us, positions, transpositions, problems, chapters };
}

const LETTER: Record<Role, string> = { pawn: '', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };
const isDark = (s: number) => (squareFile(s) + squareRank(s)) % 2 === 0;

/** A move grouped by what it does: the piece and where it goes (`Bg4`, `e5`, `O-O`). */
export function moveGroup(pos: Position, san: string): string {
  if (san.startsWith('O-O')) return san.replace(/[+#]/g, '');
  const move = parseSan(pos, san);
  if (!move || !isNormal(move)) return san;
  const role = pos.board.getRole(move.from)!;
  if (role === 'pawn' && squareFile(move.from) !== squareFile(move.to)) return `${'abcdefgh'[squareFile(move.from)]}x${makeSquare(move.to)}`;
  return `${LETTER[role]}${makeSquare(move.to)}`;
}

export interface Profile {
  side: Color;
  positions: number;
  leaves: number;
  ourMoves: [string, number][];
  theirMoves: [string, number][];
  /** Where each of our pieces stands at the leaves (bishops by colour), weighted. */
  placement: [string, [string, number][]][];
  structures: [string, number][];
  structureFacts: [string, number][];
  materialAtLeaves: [string, number][];
  kingsAtLeaves: [string, number][];
}

const top = (m: Map<string, number>, n = 12): [string, number][] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const add = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w);

export function profile(rep: Repertoire, positionOf: (fen: string) => Position): Profile {
  const us = rep.side;
  const them: Color = us === 'white' ? 'black' : 'white';
  const ourMoves = new Map<string, number>();
  const theirMoves = new Map<string, number>();
  const placement = new Map<string, Map<string, number>>();
  const structures = new Map<string, number>();
  const facts = new Map<string, number>();
  const mat = new Map<string, number>();
  const kings = new Map<string, number>();
  let leafReach = 0;
  for (const p of rep.positions.values()) {
    const pos = positionOf(p.fen);
    for (const m of p.moves) {
      const g = moveGroup(pos, m.san);
      if (p.ours) add(ourMoves, g, p.reach * weightOf(p, m.san));
      else add(theirMoves, g, p.reach * weightOf(p, m.san));
    }
    if (!p.leaf) continue;
    leafReach += p.reach;
    for (const s of pos.board[us]) {
      const role = pos.board.getRole(s)!;
      if (role === 'pawn' || role === 'king') continue;
      const label = role === 'bishop' ? `${isDark(s) ? 'dark' : 'light'}-squared bishop` : role;
      if (!placement.has(label)) placement.set(label, new Map());
      add(placement.get(label)!, makeSquare(s), p.reach);
    }
    const skeleton = (c: Color) => [...pos.board.pieces(c, 'pawn')].map(makeSquare).sort().join(' ');
    add(structures, `${us === 'white' ? 'W' : 'B'}: ${skeleton(us)} | ${them === 'white' ? 'W' : 'B'}: ${skeleton(them)}`, p.reach);
    for (const c of [us, them]) {
      const f = pawnFacts(pos, c);
      const who = c === us ? 'our' : 'their';
      for (const d of f.doubled) add(facts, `${who} doubled ${d.split(' ')[0]}-pawns`, p.reach);
      for (const i of f.isolated) add(facts, `${who} isolated ${i}`, p.reach);
      for (const ch of f.chains) add(facts, `${who} chain ${ch}`, p.reach);
      add(facts, `${who} pawn islands: ${f.islands.length}`, p.reach);
    }
    const bal = material(pos).balance * (us === 'white' ? 1 : -1);
    add(mat, bal === 0 ? 'level' : bal > 0 ? `we are up ${bal}` : `we are down ${-bal}`, p.reach);
    const k = pos.board.kingOf(us);
    const where = k === undefined ? 'none' : squareFile(k) >= 6 && (us === 'white' ? squareRank(k) === 0 : squareRank(k) === 7) ? 'castled short' : squareFile(k) <= 2 ? 'castled long' : `king on ${makeSquare(k)}`;
    add(kings, where, p.reach);
  }
  const norm = (m: Map<string, number>, total: number) => new Map([...m.entries()].map(([k, v]) => [k, total ? v / total : 0]));
  return {
    side: us,
    positions: rep.positions.size,
    leaves: [...rep.positions.values()].filter((p) => p.leaf).length,
    ourMoves: top(ourMoves, 20),
    theirMoves: top(theirMoves, 20),
    placement: [...placement.entries()].map(([k, v]) => [k, top(norm(v, leafReach), 6)] as [string, [string, number][]]),
    structures: top(norm(structures, leafReach), 8),
    structureFacts: top(norm(facts, leafReach), 16),
    materialAtLeaves: top(norm(mat, leafReach)),
    kingsAtLeaves: top(norm(kings, leafReach)),
  };
}

/** One of our moves in the repertoire, with the piece that made it (named by its square at the line's start). */
export interface DevMove {
  piece: string;
  san: string;
  to: string;
  /** The piece's first move in the line. */
  first: boolean;
  key: string;
  fen: string;
  /** The moves reaching the position (one move order), from the start of its chapter at `startPly`. */
  sans: string[];
  startPly: number;
  /** The position's reach (every move order). */
  reach: number;
  ply: number;
  /** The setup at the decision: pieces and pawns off their home squares, files without a pawn, pieces gone. */
  setup: string[];
}

export interface Square {
  to: string;
  /** The reach of the positions where the piece first goes there; 1 is once a game. */
  reach: number;
  moves: DevMove[];
  /** Setup features by how much more often they stand with this square than with the piece's other first squares: [feature, share here, share elsewhere]. */
  with: [string, number, number][];
  /** Features that stand elsewhere and not here. */
  without: [string, number, number][];
}

export interface PieceMap {
  piece: string;
  squares: Square[];
  /** Line ends' share where it never moved. */
  home: number;
  /** Its squares in order at the line ends, by share. */
  routes: [string, number][];
  /** The ply of its first move, averaged by reach: the order the pieces come out. */
  order: number;
}

const HOME: Record<Role, (s: number, c: Color) => boolean> = {
  pawn: (s, c) => squareRank(s) === (c === 'white' ? 1 : 6),
  knight: (s, c) => s === (c === 'white' ? 1 : 57) || s === (c === 'white' ? 6 : 62),
  bishop: (s, c) => s === (c === 'white' ? 2 : 58) || s === (c === 'white' ? 5 : 61),
  rook: (s, c) => s === (c === 'white' ? 0 : 56) || s === (c === 'white' ? 7 : 63),
  queen: (s, c) => s === (c === 'white' ? 3 : 59),
  king: (s, c) => s === (c === 'white' ? 4 : 60),
};
const NAME: Record<Color, string> = { white: 'White', black: 'Black' };

/** What stands where, as a player would name it: `White Bb5`, `Black e5`, `White: no e-pawn`, `White: no light-squared bishop`. */
export function setupOf(pos: Position): string[] {
  const out: string[] = [];
  for (const c of ['white', 'black'] as const) {
    const count = new Map<string, number>();
    for (const s of pos.board[c]) {
      const role = pos.board.getRole(s)!;
      const kind = role === 'bishop' ? `${isDark(s) ? 'dark' : 'light'}-squared bishop` : role;
      count.set(kind, (count.get(kind) ?? 0) + 1);
      if (!HOME[role](s, c)) out.push(`${NAME[c]} ${LETTER[role]}${makeSquare(s)}`);
    }
    for (const [kind, n] of [['knight', 2], ['light-squared bishop', 1], ['dark-squared bishop', 1], ['rook', 2], ['queen', 1]] as const) {
      const have = count.get(kind) ?? 0;
      if (have < n) out.push(`${NAME[c]}: ${n - have === 1 && n === 2 ? 'a' : 'no'} ${kind}${n === 2 && have === 1 ? ' fewer' : ''}`);
    }
    for (let f = 0; f < 8; f++) if (![...pos.board.pieces(c, 'pawn')].some((s) => squareFile(s) === f)) out.push(`${NAME[c]}: no ${'abcdefgh'[f]}-pawn`);
  }
  return out;
}

/** Our pieces named by where they stand at a line's start: `king`, `queen`, `f8-bishop`, `g8-knight`, `e-pawn`. */
export function names(pos: Position, us: Color): Map<number, string> {
  const out = new Map<number, string>();
  const queens = [...pos.board.pieces(us, 'queen')].length;
  for (const s of pos.board[us]) {
    const role = pos.board.getRole(s)!;
    out.set(s, role === 'king' || (role === 'queen' && queens === 1) ? role : role === 'pawn' ? `${'abcdefgh'[squareFile(s)]}-pawn` : `${makeSquare(s)}-${role}`);
  }
  return out;
}

/** The move in movetext after the moves reaching it, leaving out the first `skip` plies (`… 4. Nf3 e5`). */
export function moveText(m: DevMove, skip = 0): string {
  const all = [...m.sans, m.san].slice(skip);
  const ply = m.startPly + Math.min(skip, m.sans.length);
  return `${skip ? '… ' : ''}${numbered(all, Math.floor(ply / 2) + 1, ply % 2 ? 'black' : 'white')}`;
}

/** The moves every line of the repertoire starts with, while there is one move only: the opening's trunk. */
export function trunkOf(rep: Repertoire): string[] {
  let common: string[] | undefined;
  for (const chapter of rep.chapters) {
    const line: string[] = [];
    for (let node = chapter.root; node.children.length === 1; node = node.children[0]!) line.push(node.children[0]!.san);
    const differ = common ? common.findIndex((san, i) => line[i] !== san) : -1;
    common = common ? (differ < 0 ? common : common.slice(0, differ)) : line;
  }
  return common ?? [];
}

/** Each of our pieces and pawns through the repertoire: where it goes first, against what, and where it ends up. */
export function development(rep: Repertoire): PieceMap[] {
  const us = rep.side;
  const moves = new Map<string, DevMove>();
  const routes = new Map<string, Map<string, number>>();
  const home = new Map<string, number>();
  let ends = 0;
  const visit = (pos: Position, start: Position, sans: string[], reach: number, who: Map<number, string>, trail: Map<string, string[]>, node: { children: MoveNode[] }) => {
    const key = positionKeyOf(pos);
    const entry = rep.positions.get(key);
    if (!node.children.length) {
      if (!entry?.leaf) return;
      ends += reach;
      for (const name of new Set(who.values())) {
        const squares = trail.get(name);
        if (!squares) home.set(name, (home.get(name) ?? 0) + reach);
        else {
          if (!routes.has(name)) routes.set(name, new Map());
          add(routes.get(name)!, squares.join(' → '), reach);
        }
      }
      return;
    }
    for (const child of node.children) {
      const move = parseSan(pos, child.san);
      if (!move || !isNormal(move)) continue;
      const next = pos.clone();
      next.play(move);
      const nextWho = new Map(who);
      const nextTrail = new Map(trail);
      let share = 1;
      if (pos.turn === us) {
        const san = makeSan(pos, move);
        const castle = san.startsWith('O-O');
        const name = who.get(move.from) ?? '?';
        // chessops moves a castling king onto its rook: the squares they end on are read from the board after.
        const to = castle ? (squareFile(move.to) > squareFile(move.from) ? 6 : 2) + squareRank(move.from) * 8 : move.to;
        const first = !trail.has(name);
        if (entry) share = weightOf(entry, san);
        const id = `${key}|${san}`;
        if (entry && !moves.has(id)) moves.set(id, { piece: name, san, to: makeSquare(to), first, key, fen: entry.fen, sans, startPly: (start.fullmoves - 1) * 2 + (start.turn === 'black' ? 1 : 0), reach: entry.reach, ply: entry.ply, setup: setupOf(pos) });
        nextWho.delete(move.from);
        nextWho.set(to, name);
        nextTrail.set(name, [...(trail.get(name) ?? [makeSquare(move.from)]), makeSquare(to)]);
        if (castle) {
          const rookTo = (squareFile(move.to) > squareFile(move.from) ? 5 : 3) + squareRank(move.from) * 8;
          const rook = who.get(move.to);
          nextWho.delete(move.to);
          if (rook) {
            nextWho.set(rookTo, rook);
            nextTrail.set(rook, [...(trail.get(rook) ?? [makeSquare(move.to)]), makeSquare(rookTo)]);
          }
        }
      } else {
        nextWho.delete(move.to);
        if (move.promotion === undefined && pos.board.getRole(move.from) === 'pawn' && pos.epSquare === move.to) nextWho.delete(move.to + (us === 'white' ? 8 : -8));
        share = entry ? weightOf(entry, child.san) : (shareOf(child) ?? 1);
      }
      visit(next, start, [...sans, child.san], reach * share, nextWho, nextTrail, child);
    }
  };
  for (const chapter of rep.chapters) {
    const start = startPosition(chapter);
    if (start) visit(start.clone(), start, [], 1, names(start, us), new Map(), chapter.root);
  }
  const byPiece = new Map<string, DevMove[]>();
  for (const m of moves.values()) if (m.first) byPiece.set(m.piece, [...(byPiece.get(m.piece) ?? []), m]);
  const out: PieceMap[] = [];
  for (const piece of new Set([...byPiece.keys(), ...home.keys(), ...routes.keys()])) {
    const firsts = byPiece.get(piece) ?? [];
    const total = firsts.reduce((t, m) => t + m.reach, 0);
    const groups = new Map<string, DevMove[]>();
    for (const m of firsts) groups.set(m.to, [...(groups.get(m.to) ?? []), m]);
    const squares: Square[] = [...groups.entries()].map(([to, ms]) => {
      const here = ms.reduce((t, m) => t + m.reach, 0);
      const share = (set: DevMove[], sum: number, f: string) => (sum ? set.filter((m) => m.setup.includes(f)).reduce((t, m) => t + m.reach, 0) / sum : 0);
      const others = firsts.filter((m) => m.to !== to);
      const features = new Set(firsts.flatMap((m) => m.setup));
      const rows = [...features].map((f) => [f, share(ms, here, f), share(others, total - here, f)] as [string, number, number]);
      return {
        to,
        reach: here,
        moves: ms.sort((a, b) => b.reach - a.reach),
        with: others.length ? rows.filter(([, a, b]) => a >= 0.5 && a - b >= 0.3).sort((x, y) => y[1] - y[2] - (x[1] - x[2])).slice(0, 6) : [],
        without: others.length ? rows.filter(([, a, b]) => b - a >= 0.3 && a <= 0.5).sort((x, y) => y[2] - y[1] - (x[2] - x[1])).slice(0, 4) : [],
      };
    });
    squares.sort((a, b) => b.reach - a.reach);
    out.push({
      piece,
      squares,
      home: ends ? (home.get(piece) ?? 0) / ends : 0,
      routes: top(new Map([...(routes.get(piece) ?? new Map<string, number>()).entries()].map(([k, v]) => [k, ends ? v / ends : 0])), 6),
      order: total ? firsts.reduce((t, m) => t + m.ply * m.reach, 0) / total : Infinity,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}
