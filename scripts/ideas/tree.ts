// A repertoire read for the opening-ideas skill (PLAN.md §5.128): every position of every chapter,
// merged where move orders transpose, with how often a game reaches it. The reach multiplies the
// opponent's move shares along the way, read from a comment that starts with a percentage (as the
// owner's repertoire builder writes them, `{ 45% }`); a move without one keeps its parent's reach
// and marks the position approximate. The profile sums what we play, where our pieces stand and
// which pawn structures we reach, weighted by that reach: the raw material of the rules of thumb.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
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
}

const SHARE = /^\s*(\d+(?:\.\d+)?)\s*%/;

export function shareOf(node: MoveNode): number | undefined {
  for (const c of node.comments) {
    const m = SHARE.exec(c);
    if (m) return Number(m[1]) / 100;
  }
  return undefined;
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

export function readRepertoire(text: string, side?: Color): Repertoire {
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
  const visit = (pos: Position, start: Position, sans: string[], reach: number, approx: boolean, node: { comments: string[]; shapes: Shape[]; children: MoveNode[] }) => {
    const key = positionKeyOf(pos);
    const path = numbered(sans, start.fullmoves, start.turn);
    const ours = pos.turn === us;
    let entry = positions.get(key);
    const fresh = !seenPaths.has(`${key}|${path}`);
    seenPaths.add(`${key}|${path}`);
    if (!entry) {
      entry = { key, fen: makeFen(pos.toSetup()), paths: [], reach: 0, approx: false, toMove: pos.turn, ours, moves: [], leaf: true, comments: [], shapes: [], ply: sans.length + (start.fullmoves - 1) * 2 + (start.turn === 'black' ? 1 : 0) };
      positions.set(key, entry);
    }
    if (fresh) {
      entry.paths.push(path || '(start)');
      entry.reach += reach;
      entry.approx ||= approx;
    }
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
      const share = ours ? undefined : shareOf(child);
      if (!entry.moves.some((m) => m.san === child.san)) entry.moves.push(share === undefined ? { san: child.san } : { san: child.san, share });
      // A reply without a share among replies with one is a guess; an only reply is the line's premise.
      visit(next, start, [...sans, child.san], ours ? reach : reach * (share ?? 1), approx || (!ours && share === undefined && node.children.length > 1), child);
    }
  };
  for (const chapter of chapters) {
    const start = startPosition(chapter);
    if (!start) {
      problems.push(`chapter ${header(chapter, 'ChapterName') ?? chapter.id}: its start position is not legal`);
      continue;
    }
    visit(start.clone(), start, [], 1, false, chapter.root);
  }
  return { side: us, positions, transpositions, problems };
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
      if (p.ours) add(ourMoves, g, p.reach);
      else add(theirMoves, g, p.reach * (m.share ?? 1));
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
