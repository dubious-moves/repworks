// Seeing a position, for the opening-ideas skill (PLAN.md §5.128): what a strong player takes in at
// a glance, worked out exactly so that the skill never rests on picturing the board: material,
// pawns and files, development, the kings' cover, what attacks and defends what (with the
// exchange's value), pins, checks, captures and double attacks, outposts and pawn breaks. Both
// sides' threats are read: the side not to move's from the same position with the turn passed.
// Pure (chessops only).
import { Chess, type Position } from 'chessops/chess';
import { attacks, between, kingAttacks, pawnAttacks, ray } from 'chessops/attacks';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { SquareSet } from 'chessops/squareSet';
import type { Color, NormalMove, Role, Square } from 'chessops/types';
import { makeSquare, opposite, squareFile, squareRank } from 'chessops/util';
import { legalMoves } from '../../src/core/maia/encode.ts';
import { parseUciMove } from '../../src/core/chess/uci.ts';

export const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
const LETTER: Record<Role, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };
const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const FILES = 'abcdefgh';

const sq = makeSquare;
const name = (pos: Position, s: Square) => {
  const p = pos.board.get(s);
  return p ? `${p.role === 'pawn' ? '' : LETTER[p.role]}${sq(s)}` : sq(s);
};
/** Ranks counted from `color`'s side: 0 is its back rank. */
const relRank = (color: Color, s: Square) => (color === 'white' ? squareRank(s) : 7 - squareRank(s));
const isDark = (s: Square) => (squareFile(s) + squareRank(s)) % 2 === 0;
const colorName = (c: Color) => (c === 'white' ? 'White' : 'Black');

/** Every piece of `color` attacking `target` through `occupied` (pieces off `occupied` don't count). */
export function attackersOf(pos: Position, target: Square, color: Color, occupied: SquareSet = pos.board.occupied): SquareSet {
  return pos.kingAttackers(target, color, occupied).intersect(occupied);
}

function leastValuable(pos: Position, set: SquareSet): Square | undefined {
  let best: Square | undefined;
  for (const s of set) if (best === undefined || VALUE[pos.board.getRole(s)!] < VALUE[pos.board.getRole(best)!]) best = s;
  return best;
}

/**
 * The static exchange on `target` when `by` captures there first, least valuable piece first, each
 * side free to stop: what `by` gains in pawns (0 when nothing of theirs attacks it, or the square is
 * empty). X-rays count (a piece behind a capturer joins in).
 */
export function see(pos: Position, target: Square, by: Color): number {
  const victim = pos.board.get(target);
  if (!victim) return 0;
  let occupied = pos.board.occupied;
  let side = by;
  let attacker = leastValuable(pos, attackersOf(pos, target, side, occupied));
  if (attacker === undefined) return 0;
  const gain: number[] = [VALUE[victim.role]];
  let d = 0;
  for (;;) {
    d++;
    gain[d] = VALUE[pos.board.getRole(attacker)!] - gain[d - 1]!;
    if (Math.max(-gain[d - 1]!, gain[d]!) < 0) break;
    occupied = occupied.without(attacker);
    side = opposite(side);
    const next = leastValuable(pos, attackersOf(pos, target, side, occupied));
    if (next === undefined) break;
    attacker = next;
  }
  while (--d) gain[d - 1] = -Math.max(-gain[d - 1]!, gain[d]!);
  return gain[0]!;
}

/** What a capture wins, in pawns, once the opponent's best exchange on the square is played out. */
export function captureGain(pos: Position, move: NormalMove): number {
  const victim = pos.board.get(move.to);
  const ep = !victim && pos.board.getRole(move.from) === 'pawn' && squareFile(move.from) !== squareFile(move.to);
  if (!victim && !ep) return 0;
  const after = pos.clone();
  after.play(move);
  return (victim ? VALUE[victim.role] : 1) - Math.max(0, see(after, move.to, after.turn));
}

/** The position with the turn passed (the null move), or undefined when that isn't legal (a check). */
export function passTurn(pos: Position): Position | undefined {
  if (pos.isCheck()) return undefined;
  const setup = pos.toSetup();
  const swapped = Chess.fromSetup({ ...setup, turn: opposite(setup.turn), epSquare: undefined });
  return swapped.isOk ? swapped.value : undefined;
}

export function board(pos: Position, side: Color = 'white'): string {
  const rows: string[] = [];
  const ranks = side === 'white' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = side === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  for (const r of ranks) {
    const cells = files.map((f) => {
      const p = pos.board.get(r * 8 + f);
      if (!p) return '.';
      return p.color === 'white' ? LETTER[p.role] : LETTER[p.role].toLowerCase();
    });
    rows.push(`${r + 1} ${cells.join(' ')}`);
  }
  rows.push(`  ${files.map((f) => FILES[f]).join(' ')}`);
  return rows.join('\n');
}

export interface Material {
  pieces: Record<Color, string>;
  points: Record<Color, number>;
  /** White's points less Black's. */
  balance: number;
  bishopPair: Color[];
}

export function material(pos: Position): Material {
  const pieces = { white: '', black: '' };
  const points = { white: 0, black: 0 };
  const bishopPair: Color[] = [];
  for (const color of ['white', 'black'] as Color[]) {
    const parts: string[] = [];
    for (const role of ROLES) {
      const set = pos.board.pieces(color, role);
      if (role !== 'king') points[color] += set.size() * VALUE[role];
      parts.push(`${LETTER[role]}${[...set].map(sq).join(',')}`);
    }
    pieces[color] = parts.filter((p) => p.length > 1).join(' ');
    const bishops = [...pos.board.pieces(color, 'bishop')];
    if (bishops.some(isDark) && bishops.some((b) => !isDark(b))) bishopPair.push(color);
  }
  return { pieces, points, balance: points.white - points.black, bishopPair };
}

export interface PawnFacts {
  islands: string[];
  isolated: string[];
  doubled: string[];
  passed: string[];
  backward: string[];
  /** Pawn chains of two or more, base first ("d4-e5"). */
  chains: string[];
}

function pawnFiles(pos: Position, color: Color): number[][] {
  const files: number[][] = [[], [], [], [], [], [], [], []];
  for (const s of pos.board.pieces(color, 'pawn')) files[squareFile(s)]!.push(s);
  return files;
}

export function pawnFacts(pos: Position, color: Color): PawnFacts {
  const own = pawnFiles(pos, color);
  const enemy = pos.board.pieces(opposite(color), 'pawn');
  const ownPawns = pos.board.pieces(color, 'pawn');
  const islands: string[] = [];
  let start = -1;
  for (let f = 0; f <= 8; f++) {
    const has = f < 8 && own[f]!.length > 0;
    if (has && start < 0) start = f;
    if (!has && start >= 0) {
      islands.push(start === f - 1 ? FILES[start]! : `${FILES[start]}-${FILES[f - 1]}`);
      start = -1;
    }
  }
  const isolated: string[] = [];
  const doubled: string[] = [];
  const passed: string[] = [];
  const backward: string[] = [];
  for (let f = 0; f < 8; f++) {
    if (own[f]!.length > 1) doubled.push(`${FILES[f]} (${own[f]!.map(sq).join(',')})`);
    for (const s of own[f]!) {
      const neighbours = [f - 1, f + 1].filter((x) => x >= 0 && x < 8);
      if (neighbours.every((x) => own[x]!.length === 0)) isolated.push(sq(s));
      const r = relRank(color, s);
      let blocked = false;
      for (const e of enemy) {
        if (Math.abs(squareFile(e) - f) <= 1 && relRank(color, e) > r) blocked = true;
      }
      if (!blocked) passed.push(sq(s));
      // Backward: no own pawn beside or behind on a neighbouring file to support its advance, and
      // the square in front is covered by an enemy pawn.
      const supported = neighbours.some((x) => own[x]!.some((o) => relRank(color, o) <= r));
      const stop = color === 'white' ? s + 8 : s - 8;
      if (!supported && stop >= 0 && stop < 64 && pawnAttacks(color, stop).intersects(enemy) && !isolated.includes(sq(s))) backward.push(sq(s));
    }
  }
  const chains: string[] = [];
  const defendedBy = (s: Square) => pawnAttacks(opposite(color), s).intersect(ownPawns);
  for (const s of ownPawns) {
    // A chain's base: a pawn no pawn defends, that defends one.
    if (defendedBy(s).nonEmpty()) continue;
    const walk = (from: Square, acc: Square[]): Square[][] => {
      const up = pawnAttacks(color, from).intersect(ownPawns);
      if (up.isEmpty()) return [acc];
      return [...up].flatMap((n) => walk(n, [...acc, n]));
    };
    for (const chain of walk(s, [s])) if (chain.length > 1) chains.push(chain.map(sq).join('-'));
  }
  return { islands, isolated, doubled, passed, backward, chains };
}

export interface Files {
  open: string[];
  /** Half-open for a side: none of its pawns, some of the other's. */
  halfOpen: Record<Color, string[]>;
}

export function files(pos: Position): Files {
  const w = pawnFiles(pos, 'white');
  const b = pawnFiles(pos, 'black');
  const open: string[] = [];
  const halfOpen: Record<Color, string[]> = { white: [], black: [] };
  for (let f = 0; f < 8; f++) {
    if (!w[f]!.length && !b[f]!.length) open.push(FILES[f]!);
    else if (!w[f]!.length) halfOpen.white.push(FILES[f]!);
    else if (!b[f]!.length) halfOpen.black.push(FILES[f]!);
  }
  return { open, halfOpen };
}

export interface Development {
  /** Minor pieces still on their first squares. */
  undeveloped: string[];
  king: string;
  queenMoved: boolean;
  rooksConnected: boolean;
}

export function development(pos: Position, color: Color): Development {
  const back = color === 'white' ? 0 : 56;
  const homes: [Role, number][] = [['knight', 1], ['knight', 6], ['bishop', 2], ['bishop', 5]];
  const undeveloped = homes.filter(([role, f]) => pos.board.get(back + f)?.role === role && pos.board.get(back + f)?.color === color).map(([role, f]) => `${LETTER[role]}${sq(back + f)}`);
  const k = pos.board.kingOf(color);
  let king = 'none';
  if (k !== undefined) {
    const f = squareFile(k);
    const home = relRank(color, k) === 0;
    const rights = pos.castles.castlingRights.intersect(SquareSet.backrank(color));
    const can = [rights.has(back + 7) ? 'short' : '', rights.has(back) ? 'long' : ''].filter(Boolean).join(' and ');
    if (home && f >= 6) king = `castled short (${sq(k)})`;
    else if (home && f <= 2) king = `castled long (${sq(k)})`;
    else king = `${sq(k)}, ${can ? `can still castle ${can}` : 'can no longer castle'}`;
  }
  const queens = [...pos.board.pieces(color, 'queen')];
  const queenMoved = !queens.includes(back + 3);
  const rooks = [...pos.board.pieces(color, 'rook')].filter((r) => relRank(color, r) === 0);
  const rooksConnected = rooks.length === 2 && between(rooks[0]!, rooks[1]!).intersect(pos.board.occupied).isEmpty();
  return { undeveloped, king, queenMoved, rooksConnected };
}

export interface KingSafety {
  square: string;
  /** Own pawns on the king's file and the files beside it, up to two ranks ahead. */
  shield: string[];
  /** Files at the king (its own and beside it) with no own pawn. */
  openFilesNear: string[];
  /** Enemy pieces attacking the king's square or a square next to it, and how many such attacks. */
  attackers: string[];
  attacks: number;
}

export function kingSafety(pos: Position, color: Color): KingSafety | undefined {
  const k = pos.board.kingOf(color);
  if (k === undefined) return undefined;
  const f = squareFile(k);
  const r = relRank(color, k);
  const own = pawnFiles(pos, color);
  const shield: string[] = [];
  const openFilesNear: string[] = [];
  for (const x of [f - 1, f, f + 1]) {
    if (x < 0 || x > 7) continue;
    const near = own[x]!.filter((p) => relRank(color, p) > r && relRank(color, p) <= r + 2);
    shield.push(...near.map(sq));
    if (!own[x]!.length) openFilesNear.push(FILES[x]!);
  }
  const zone = kingAttacks(k).with(k);
  const enemy = opposite(color);
  const attackers = new Set<Square>();
  let count = 0;
  for (const z of zone) {
    const a = attackersOf(pos, z, enemy);
    count += a.size();
    for (const s of a) attackers.add(s);
  }
  return { square: sq(k), shield, openFilesNear, attackers: [...attackers].map((s) => name(pos, s)), attacks: count };
}

export interface PieceFacts {
  piece: string;
  /** Squares it attacks that hold no piece of its own side. */
  mobility: number;
  attackedBy: string[];
  defendedBy: string[];
  /** What the opponent wins by capturing it first (static exchange), in pawns; 0 when nothing. */
  exchange: number;
  /** For a bishop: own pawns on its colour. */
  pawnsOnColour?: number;
}

export function pieceFacts(pos: Position, color: Color): PieceFacts[] {
  const out: PieceFacts[] = [];
  const own = pos.board[color];
  for (const s of own) {
    const p = pos.board.get(s)!;
    if (p.role === 'king') continue;
    const facts: PieceFacts = {
      piece: name(pos, s),
      mobility: p.role === 'pawn' ? 0 : attacks(p, s, pos.board.occupied).diff(own).size(),
      attackedBy: [...attackersOf(pos, s, opposite(color))].map((a) => name(pos, a)),
      defendedBy: [...attackersOf(pos, s, color)].map((a) => name(pos, a)),
      exchange: see(pos, s, opposite(color)),
    };
    if (p.role === 'bishop') facts.pawnsOnColour = [...pos.board.pieces(color, 'pawn')].filter((x) => isDark(x) === isDark(s)).length;
    out.push(facts);
  }
  return out;
}

export interface Pin {
  pinned: string;
  by: string;
  to: string;
  /** Absolute: to the king, so the pinned piece can't move off the line. */
  absolute: boolean;
}

/** Pieces of `color` pinned by an enemy slider to their king, queen or rook (to a piece worth more). */
export function pins(pos: Position, color: Color): Pin[] {
  const out: Pin[] = [];
  const enemy = opposite(color);
  const targets = [...pos.board[color]].filter((s) => ['king', 'queen', 'rook'].includes(pos.board.getRole(s)!));
  for (const t of targets) {
    const tRole = pos.board.getRole(t)!;
    for (const s of pos.board[enemy]) {
      const role = pos.board.getRole(s)!;
      if (role !== 'bishop' && role !== 'rook' && role !== 'queen') continue;
      if (ray(s, t).isEmpty()) continue;
      const diagonal = Math.abs(squareFile(s) - squareFile(t)) === Math.abs(squareRank(s) - squareRank(t));
      if ((diagonal && role === 'rook') || (!diagonal && role === 'bishop')) continue;
      const mid = between(s, t).intersect(pos.board.occupied);
      const only = mid.singleSquare();
      if (only === undefined || pos.board.getColor(only) !== color) continue;
      const pinnedRole = pos.board.getRole(only)!;
      if (tRole !== 'king' && VALUE[pinnedRole] >= VALUE[tRole]) continue;
      if (tRole !== 'king' && VALUE[role] >= VALUE[tRole] && see(pos, t, enemy) <= 0) continue;
      out.push({ pinned: name(pos, only), by: name(pos, s), to: name(pos, t), absolute: tRole === 'king' });
    }
  }
  return out;
}

export interface MoveFacts {
  checks: string[];
  /**
   * Captures with what they win once the exchange is played out (pawns), best first. The exchange
   * is static: a capturing piece pinned to a queen or rook is named (`pinnedTo`), since moving it
   * may lose more than the exchange wins.
   */
  captures: { san: string; gain: number; pinnedTo?: string }[];
  /** Moves after which the moved piece attacks two or more of: the king, an undefended piece, a piece worth more than it. */
  doubleAttacks: { san: string; targets: string[]; safe: boolean; pinnedTo?: string }[];
}

/** The side to move's forcing moves: checks, captures and double attacks. */
export function forcing(pos: Position): MoveFacts {
  const checks: string[] = [];
  const captures: MoveFacts['captures'] = [];
  const doubleAttacks: MoveFacts['doubleAttacks'] = [];
  const me = pos.turn;
  // Relative pins (to a queen or rook): absolute ones already make the move illegal.
  const pinnedTo = new Map(pins(pos, me).filter((p) => !p.absolute).map((p) => [p.pinned.slice(-2), p.to]));
  for (const { uci, san } of legalMoves(pos)) {
    const move = parseUciMove(pos, uci)!;
    const after = pos.clone();
    after.play(move);
    if (after.isCheck()) checks.push(san);
    const pin = pinnedTo.get(sq(move.from));
    const victim = pos.board.get(move.to);
    const ep = !victim && pos.board.getRole(move.from) === 'pawn' && squareFile(move.from) !== squareFile(move.to);
    if ((victim && victim.color !== me) || ep) captures.push(pin ? { san, gain: captureGain(pos, move), pinnedTo: pin } : { san, gain: captureGain(pos, move) });
    const mover = after.board.get(move.to);
    if (!mover || pos.board.get(move.from)?.color !== me) continue;
    const hit = attacks(mover, move.to, after.board.occupied).intersect(after.board[opposite(me)]);
    const targets: string[] = [];
    for (const t of hit) {
      const role = after.board.getRole(t)!;
      const undefended = attackersOf(after, t, opposite(me)).isEmpty();
      if (role === 'king' || VALUE[role] > VALUE[mover.role] || (undefended && role !== 'pawn')) targets.push(name(after, t));
    }
    if (targets.length >= 2) doubleAttacks.push({ san, targets, safe: see(after, move.to, after.turn) <= 0, ...(pin ? { pinnedTo: pin } : {}) });
  }
  captures.sort((a, b) => b.gain - a.gain);
  return { checks, captures, doubleAttacks };
}

export interface Breaks {
  /** Pawn moves of a side that attack an enemy pawn (or take one), with whether the pawn is safe there. */
  now: { move: string; hits: string[]; safe: boolean }[];
  /** Pawns already in contact: captures of an enemy pawn available to this side. */
  tension: string[];
}

/** A side's pawn levers: pushes (or captures) that attack an enemy pawn. Read for either side. */
export function breaks(pos: Position, color: Color): Breaks {
  const p = pos.turn === color ? pos : passTurn(pos);
  const now: Breaks['now'] = [];
  const tension: string[] = [];
  if (!p) return { now, tension };
  const enemyPawns = p.board.pieces(opposite(color), 'pawn');
  for (const { uci, san } of legalMoves(p)) {
    const move = parseUciMove(p, uci)!;
    if (p.board.getRole(move.from) !== 'pawn') continue;
    if (p.board.get(move.to)?.role === 'pawn') {
      tension.push(san);
      continue;
    }
    if (squareFile(move.from) !== squareFile(move.to)) continue;
    const hits = pawnAttacks(color, move.to).intersect(enemyPawns);
    if (hits.isEmpty()) continue;
    const after = p.clone();
    after.play(move);
    now.push({ move: san, hits: [...hits].map(sq), safe: see(after, move.to, after.turn) <= 0 });
  }
  return { now, tension };
}

/**
 * Outposts of `color`: squares on its 4th to 6th ranks that no enemy pawn can ever attack, covered by
 * one of its own pawns, with what stands on them.
 */
export function outposts(pos: Position, color: Color): string[] {
  const out: string[] = [];
  const enemy = pos.board.pieces(opposite(color), 'pawn');
  const ownPawns = pos.board.pieces(color, 'pawn');
  for (let s = 0; s < 64; s++) {
    const r = relRank(color, s);
    if (r < 3 || r > 5) continue;
    const f = squareFile(s);
    let attackable = false;
    for (const e of enemy) if (Math.abs(squareFile(e) - f) === 1 && relRank(color, e) > r) attackable = true;
    if (attackable) continue;
    if (pawnAttacks(opposite(color), s).intersect(ownPawns).isEmpty()) continue;
    const here = pos.board.get(s);
    out.push(here ? `${sq(s)} (${here.color === color ? 'on it' : 'held by'} ${name(pos, s)})` : sq(s));
  }
  return out;
}

const CENTRE: Square[] = [27, 28, 35, 36]; // d4 e4 d5 e5

export function centre(pos: Position): Record<Color, number> {
  const count = (c: Color) => CENTRE.reduce((n, s) => n + attackersOf(pos, s, c).size(), 0);
  return { white: count('white'), black: count('black') };
}

export interface Look {
  fen: string;
  turn: Color;
  board: string;
  material: Material;
  files: Files;
  pawns: Record<Color, PawnFacts>;
  development: Record<Color, Development>;
  kings: Record<Color, KingSafety | undefined>;
  pieces: Record<Color, PieceFacts[]>;
  pins: Record<Color, Pin[]>;
  /** The side to move's forcing moves, and the other side's as if it were its move (its threats). */
  forcing: MoveFacts;
  threats: MoveFacts | undefined;
  breaks: Record<Color, Breaks>;
  outposts: Record<Color, string[]>;
  centre: Record<Color, number>;
  inCheck: boolean;
  legalMoves: number;
}

export function look(pos: Position, side: Color = 'white'): Look {
  const passed = passTurn(pos);
  const both = <T>(f: (c: Color) => T): Record<Color, T> => ({ white: f('white'), black: f('black') });
  return {
    fen: makeFen(pos.toSetup()),
    turn: pos.turn,
    board: board(pos, side),
    material: material(pos),
    files: files(pos),
    pawns: both((c) => pawnFacts(pos, c)),
    development: both((c) => development(pos, c)),
    kings: both((c) => kingSafety(pos, c)),
    pieces: both((c) => pieceFacts(pos, c)),
    pins: both((c) => pins(pos, c)),
    forcing: forcing(pos),
    threats: passed ? forcing(passed) : undefined,
    breaks: both((c) => breaks(pos, c)),
    outposts: both((c) => outposts(pos, c)),
    centre: centre(pos),
    inCheck: pos.isCheck(),
    legalMoves: legalMoves(pos).length,
  };
}

const list = (xs: readonly string[], none = '—') => (xs.length ? xs.join(', ') : none);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** The look as text, for a reader: `side` is the board's orientation and whose view "we" is. */
export function lookText(l: Look, side: Color = 'white'): string {
  const out: string[] = [];
  const order: Color[] = side === 'white' ? ['white', 'black'] : ['black', 'white'];
  out.push(l.board);
  out.push(`FEN ${l.fen}`);
  out.push(`${colorName(l.turn)} to move${l.inCheck ? ', in check' : ''}; ${l.legalMoves} legal moves.`);
  const m = l.material;
  const lead = m.balance === 0 ? 'material level' : `${m.balance > 0 ? 'White' : 'Black'} is up ${Math.abs(m.balance)}`;
  out.push(`Material: ${lead} (White ${m.points.white}, Black ${m.points.black})${m.bishopPair.length ? `; bishop pair: ${m.bishopPair.map(colorName).join(', ')}` : ''}.`);
  for (const c of order) out.push(`  ${colorName(c)}: ${m.pieces[c]}`);
  out.push(`Files: open ${list(l.files.open)}; half-open for White ${list(l.files.halfOpen.white)}; for Black ${list(l.files.halfOpen.black)}.`);
  out.push(`Centre (attacks on d4 e4 d5 e5): White ${l.centre.white}, Black ${l.centre.black}.`);
  for (const c of order) {
    const p = l.pawns[c];
    const parts = [`islands ${list(p.islands)}`, `chains ${list(p.chains)}`, `isolated ${list(p.isolated)}`, `doubled ${list(p.doubled)}`, `backward ${list(p.backward)}`, `passed ${list(p.passed)}`];
    out.push(`${colorName(c)} pawns: ${parts.join('; ')}.`);
  }
  for (const c of order) {
    const d = l.development[c];
    const k = l.kings[c];
    out.push(
      `${colorName(c)} development: undeveloped ${list(d.undeveloped, 'none')}; king ${d.king}; queen ${d.queenMoved ? 'out' : 'home'}; rooks ${d.rooksConnected ? 'connected' : 'not connected'}.`,
    );
    if (k) out.push(`${colorName(c)} king ${k.square}: shield ${list(k.shield, 'none')}; files by it with no own pawn: ${list(k.openFilesNear, 'none')}; ${k.attacks} enemy attacks on its zone, from ${list(k.attackers, 'nothing')}.`);
  }
  for (const c of order) {
    const ps = l.pieces[c];
    const loose = ps.filter((p) => p.attackedBy.length && !p.defendedBy.length).map((p) => p.piece);
    const enPrise = ps.filter((p) => p.exchange > 0).map((p) => `${p.piece} (${signed(p.exchange)} for ${colorName(opposite(c))})`);
    const undefended = ps.filter((p) => !p.defendedBy.length && !p.piece.match(/^[a-h][1-8]$/)).map((p) => p.piece);
    out.push(`${colorName(c)} pieces: ${ps.filter((p) => !/^[a-h][1-8]$/.test(p.piece)).map((p) => `${p.piece} ${p.mobility}sq${p.pawnsOnColour !== undefined ? ` (${p.pawnsOnColour} own pawns on its colour)` : ''}`).join(', ')}.`);
    out.push(`  attacked and undefended: ${list(loose, 'none')}; lost to an exchange: ${list(enPrise, 'none')}; undefended pieces: ${list(undefended, 'none')}.`);
    const pins = l.pins[c];
    if (pins.length) out.push(`  pinned: ${pins.map((p) => `${p.pinned} by ${p.by} to ${p.to}${p.absolute ? ' (absolute)' : ''}`).join('; ')}.`);
  }
  for (const c of order) {
    const b = l.breaks[c];
    const now = b.now.map((x) => `${x.move} (hits ${x.hits.join(',')}${x.safe ? '' : ', loses the pawn'})`);
    out.push(`${colorName(c)} pawn breaks: ${list(now, 'none')}${b.tension.length ? `; can take a pawn: ${b.tension.join(', ')}` : ''}.`);
    out.push(`${colorName(c)} outposts: ${list(l.outposts[c], 'none')}.`);
  }
  const forcingText = (who: string, f: MoveFacts) => {
    const pinNote = (to?: string) => (to ? ` (but pinned to ${to})` : '');
    const caps = f.captures.map((c) => `${c.san} ${signed(c.gain)}${pinNote(c.pinnedTo)}`);
    const doubles = f.doubleAttacks.map((d) => `${d.san} → ${d.targets.join('+')}${d.safe ? '' : ' (piece can be taken)'}${pinNote(d.pinnedTo)}`);
    out.push(`${who}: checks ${list(f.checks, 'none')}; captures, static exchange in pawns ${list(caps, 'none')}; double attacks ${list(doubles, 'none')}.`);
  };
  forcingText(`${colorName(l.turn)} (to move)`, l.forcing);
  if (l.threats) forcingText(`${colorName(opposite(l.turn))} threatens (if it were its move)`, l.threats);
  return out.join('\n');
}
