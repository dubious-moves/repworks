// Model games for the model-games skill (PLAN.md §5.141, `.claude/skills/model-games`): games a
// strong engine (Lc0) played against a human-like one (Maia) from one shared position, the end of
// the owner's prep, made by the owner's model-game generator. Read here as what the strong side
// does again and again (its plan), what it gets (its goals: the material back, the structure, the
// king) and how it punishes the weaker side's mistakes, every number counted from the games.
//
// The generator's PGN: `[White "Lc0"]` or `[Black "Lc0"]`; `{ end of prep }` on the last move of
// the prep; Lc0's own eval every few of its moves (`{ -0.57 }`, from White's side, `+M`/`-M` a
// mate); and `{ eval -0.94 -> -3.42 }` on the weaker side's move where Lc0's eval jumped between its
// move before and its move after, so on the move that made the jump: a mistake when it is in the
// strong side's favour.
//
// The games also read as a repertoire (`asRepertoirePgn`): one tree of every game, the weaker
// side's moves carrying their share of the games (`{ 60% }`), so the opening-ideas tools (`tree`,
// `develop`, `decisions`, `check`) read the strong side's moves as the moves to learn.
// Pure (chessops and core only).
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Color, Move, Role } from 'chessops/types';
import { isNormal } from 'chessops/types';
import { makeSquare, opposite, squareFile, squareRank } from 'chessops/util';
import { pawnAttacks } from 'chessops/attacks';
import { standardUci } from '../../src/core/chess/uci.ts';
import { parseGames } from '../../src/core/pgn/parse.ts';
import { writeChapter } from '../../src/core/pgn/write.ts';
import { emptyNodeData, header, type Chapter, type MoveNode } from '../../src/core/study/model.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import type { MaiaMove } from '../../src/core/maia/encode.ts';
import { moveGroup, names, numbered } from './tree.ts';
import { material, pawnFacts } from './vision.ts';

/** A mate in Lc0's comments, as centipawns. */
export const MATE = 30000;

export interface ModelGame {
  /** The game's `Round`, else its place in the file. */
  round: number;
  white: string;
  black: string;
  result: string;
  termination?: string;
  /** The weaker side's rating (its `WhiteElo` or `BlackElo`). */
  elo?: number;
  sans: string[];
  /** `positions[i]` stands before move i; the last one after the last move. */
  positions: Position[];
  /** Lc0's eval (centipawns, White's side) after `k` moves, by `k`. */
  evals: Map<number, number>;
  /** The weaker side's moves where Lc0's eval jumped: move index, eval before and after (White's side). */
  jumps: { move: number; from: number; to: number }[];
  /** The moves through `{ end of prep }`, when marked. */
  prep?: number;
}

export interface ModelGames {
  /** The strong side (Lc0's colour). */
  us: Color;
  games: ModelGame[];
  /** The moves every game starts with: the shared position stands after this many. */
  start: number;
  /** How the shared position was found: the `end of prep` marks, or the moves all games share. */
  startFrom: 'marked' | 'common';
  problems: string[];
}

const EVAL = /([+-]\d+(?:\.\d+)?|[+-]M)/;
const JUMP = /eval\s+([+-]\d+(?:\.\d+)?|[+-]M)\s*->\s*([+-]\d+(?:\.\d+)?|[+-]M)/;

export function evalCp(text: string): number {
  if (text === '+M') return MATE;
  if (text === '-M') return -MATE;
  return Math.round(Number(text) * 100);
}

/** One game's comments read: the prep's end, Lc0's evals and the jumps. */
function readComments(node: MoveNode, i: number, g: Pick<ModelGame, 'evals' | 'jumps' | 'prep'>): void {
  for (const raw of node.comments) {
    let c = raw;
    if (/end of prep/i.test(c)) {
      g.prep = i + 1;
      c = c.replace(/end of prep/gi, ' ');
    }
    const jump = JUMP.exec(c);
    if (jump) {
      g.jumps.push({ move: i, from: evalCp(jump[1]!), to: evalCp(jump[2]!) });
      c = c.replace(JUMP, ' ');
    }
    const plain = EVAL.exec(c);
    if (plain && c.replace(EVAL, '').trim() === '') g.evals.set(i + 1, evalCp(plain[1]!));
  }
}

/** The generator's games, with the strong side and the position they share. */
export function readModelGames(text: string, side?: Color): ModelGames {
  let n = 0;
  const problems: string[] = [];
  const games: ModelGame[] = [];
  const sides = new Map<Color, number>();
  const elos = new Map<ModelGame, [number, number]>();
  for (const [index, p] of parseGames(text, () => `g${++n}`).entries()) {
    if (!p.ok) {
      problems.push(`game ${index + 1}: ${p.reason}`);
      continue;
    }
    const ch = p.chapter;
    for (const note of p.notes) if (note.kind === 'illegal') problems.push(`game ${index + 1}: illegal move ${note.san} after ${note.path.join(' ')} (cut there)`);
    const start = startPosition(ch);
    if (!start) {
      problems.push(`game ${index + 1}: its start position is not legal`);
      continue;
    }
    const white = header(ch, 'White') ?? '?';
    const black = header(ch, 'Black') ?? '?';
    const lc0 = /lc0|leela/i;
    const strong: Color | undefined = lc0.test(white) && !lc0.test(black) ? 'white' : lc0.test(black) && !lc0.test(white) ? 'black' : undefined;
    if (strong) sides.set(strong, (sides.get(strong) ?? 0) + 1);
    const g: ModelGame = { round: Number(header(ch, 'Round')) || index + 1, white, black, result: header(ch, 'Result') ?? '*', sans: [], positions: [start.clone()], evals: new Map(), jumps: [] };
    elos.set(g, [Number(header(ch, 'WhiteElo')) || 0, Number(header(ch, 'BlackElo')) || 0]);
    const term = header(ch, 'Termination');
    if (term) g.termination = term;
    const pos = start.clone();
    let i = 0;
    for (let node = ch.root.children[0]; node; node = node.children[0]) {
      const move = parseSan(pos, node.san);
      if (!move) break;
      g.sans.push(makeSan(pos, move));
      pos.play(move);
      g.positions.push(pos.clone());
      readComments(node, i++, g);
    }
    games.push(g);
  }
  const us: Color = side ?? ((sides.get('white') ?? 0) > (sides.get('black') ?? 0) ? 'white' : sides.size ? 'black' : 'white');
  if (!side && !sides.size) problems.push('no game names Lc0 as White or Black: the strong side is taken as White (say it with --side)');
  if (sides.get(opposite(us))) problems.push(`${sides.get(opposite(us))} games have Lc0 as ${opposite(us)}: they are read with ${us} as the strong side all the same`);
  for (const g of games) {
    const elo = elos.get(g)?.[us === 'white' ? 1 : 0];
    if (elo) g.elo = elo;
  }
  // The shared position: the prep's end when every game marks the same one, else the moves all share.
  let common = games.length ? games[0]!.sans.length : 0;
  for (const g of games) {
    const first = games[0]!;
    let k = 0;
    while (k < common && k < g.sans.length && g.sans[k] === first.sans[k] && makeFen(g.positions[0]!.toSetup()) === makeFen(first.positions[0]!.toSetup())) k++;
    common = k;
  }
  const marks = new Set(games.map((g) => g.prep));
  const marked = marks.size === 1 && games[0]?.prep !== undefined && games[0].prep <= common;
  if (!marked && games.some((g) => g.prep !== undefined)) problems.push(`the games mark different ends of prep (${[...marks].map((m) => m ?? 'none').join(', ')}): the shared position is taken where the games part`);
  return { us, games, start: marked ? games[0]!.prep! : common, startFrom: marked ? 'marked' : 'common', problems };
}

const cpUs = (cp: number, us: Color) => (us === 'white' ? cp : -cp);
/** The strong side's score in a game: 1, ½ or 0; undefined when unfinished. */
export function scoreOf(g: ModelGame, us: Color): number | undefined {
  if (g.result === '1/2-1/2') return 0.5;
  if (g.result === '1-0') return us === 'white' ? 1 : 0;
  if (g.result === '0-1') return us === 'black' ? 1 : 0;
  return undefined;
}

/** Movetext of a game's moves `from` to `to` (indices into its moves). */
export function movesText(g: ModelGame, from: number, to = g.sans.length): string {
  const p = g.positions[from]!;
  return numbered(g.sans.slice(from, to), p.fullmoves, p.turn);
}

/** The games through these moves after the shared position (SAN or movetext tokens), and those where the strong side plays a move group within its first `window` moves. */
export function filterGames(mg: ModelGames, o: { after?: readonly string[]; with?: string; window: number }): ModelGames {
  let games = mg.games;
  if (o.after?.length) {
    const want = o.after;
    games = games.filter((g) => want.every((san, k) => g.sans[mg.start + k] !== undefined && sameMove(g.positions[mg.start + k]!, g.sans[mg.start + k]!, san)));
  }
  if (o.with) {
    const group = o.with.replace(/^\d+\.(\.\.)?\s*/, '').replace(/^\.\.\./, '').replace(/[+#!?]/g, '');
    games = games.filter((g) => ourMoves(mg, g, o.window).some((m) => m.group === group || m.san.replace(/[+#]/g, '') === group));
  }
  return { ...mg, games };
}

function sameMove(pos: Position, san: string, want: string): boolean {
  const a = parseSan(pos, san);
  const b = parseSan(pos, want);
  return !!a && !!b && isNormal(a) && isNormal(b) && a.from === b.from && a.to === b.to && a.promotion === b.promotion;
}

export interface OurMove {
  /** Index into the game's moves. */
  index: number;
  san: string;
  /** What it does (`moveGroup`): `Rd8`, `f5`, `exd4`, `O-O`. */
  group: string;
  /** The piece, by its square at the shared position (`c6-knight`, `f-pawn`). */
  piece: string;
  role: Role;
  /** Movetext number (`14...`). */
  number: string;
  fullmove: number;
  /** A capture, or a pawn move that then attacks an enemy pawn or piece. */
  contact: 'takes' | 'hits' | '';
  /** The square the piece ends on (the king's for castling). */
  to: string;
  /** Castling's rook, and where it goes. */
  rook?: { piece: string; to: string };
}

/** Follows each of the side's pieces by name through a move. */
function track(who: Map<number, string>, pos: Position, move: Move, side: Color): string {
  if (!isNormal(move)) return '?';
  const castle = pos.board.getRole(move.from) === 'king' && pos.board.get(move.to)?.color === pos.turn;
  if (pos.turn !== side) {
    who.delete(move.to);
    if (pos.board.getRole(move.from) === 'pawn' && pos.epSquare === move.to) who.delete(move.to + (side === 'white' ? 8 : -8));
    return '';
  }
  const name = who.get(move.from) ?? '?';
  if (castle) {
    const rank = squareRank(move.from) * 8;
    const short = squareFile(move.to) > squareFile(move.from);
    const rook = who.get(move.to);
    who.delete(move.from);
    who.delete(move.to);
    who.set(rank + (short ? 6 : 2), name);
    if (rook) who.set(rank + (short ? 5 : 3), rook);
    return name;
  }
  who.delete(move.from);
  who.set(move.to, name);
  return name;
}

/** The strong side's first `window` moves after the shared position (all of them with `window` 0), with what each does. */
export function ourMoves(mg: ModelGames, g: ModelGame, window: number): OurMove[] {
  const out: OurMove[] = [];
  const startPos = g.positions[mg.start];
  if (!startPos) return out;
  const who = names(startPos, mg.us);
  for (let i = mg.start; i < g.sans.length; i++) {
    const pos = g.positions[i]!;
    const move = parseSan(pos, g.sans[i]!);
    if (!move || !isNormal(move)) break;
    const ours = pos.turn === mg.us;
    const role = pos.board.getRole(move.from)!;
    const capture = !!pos.board.get(move.to) && pos.board.get(move.to)!.color !== pos.turn || (role === 'pawn' && pos.epSquare === move.to);
    const group = moveGroup(pos, g.sans[i]!);
    const castle = g.sans[i]!.startsWith('O-O');
    const short = squareFile(move.to) > squareFile(move.from);
    const rook = castle && ours ? { piece: who.get(move.to) ?? '?', to: makeSquare(squareRank(move.from) * 8 + (short ? 5 : 3)) } : undefined;
    const piece = track(who, pos, move, mg.us);
    if (!ours) continue;
    if (window && out.length >= window) break;
    const after = g.positions[i + 1]!;
    let contact: OurMove['contact'] = capture ? 'takes' : '';
    if (!contact && role === 'pawn') {
      const hit = pawnAttacks(mg.us, move.to).intersect(after.board[opposite(mg.us)]).diff(after.board.pieces(opposite(mg.us), 'king'));
      if (hit.nonEmpty()) contact = 'hits';
    }
    const to = castle ? makeSquare(squareRank(move.from) * 8 + (short ? 6 : 2)) : makeSquare(move.to);
    out.push({ index: i, san: g.sans[i]!, group, piece, role, number: `${pos.fullmoves}${pos.turn === 'white' ? '.' : '...'}`, fullmove: pos.fullmoves, contact, to, ...(rook ? { rook } : {}) });
  }
  return out;
}

/** The weaker side's moves after the shared position, grouped, within the strong side's first `window` moves. */
function theirMoves(mg: ModelGames, g: ModelGame, window: number): { group: string; fullmove: number; index: number }[] {
  const out: { group: string; fullmove: number; index: number }[] = [];
  const last = window ? (ourMoves(mg, g, window).at(-1)?.index ?? g.sans.length) : g.sans.length;
  for (let i = mg.start; i < Math.min(g.sans.length, last + 1); i++) {
    const pos = g.positions[i]!;
    if (pos.turn === mg.us) continue;
    out.push({ group: moveGroup(pos, g.sans[i]!), fullmove: pos.fullmoves, index: i });
  }
  return out;
}

// ---------------------------------------------------------------- statistics

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export function quartiles(xs: readonly number[]): [number, number] {
  if (!xs.length) return [NaN, NaN];
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]!;
  return [at(0.25), at(0.75)];
}

export interface Summary {
  games: number;
  /** The strong side's wins, draws, losses and unfinished. */
  wins: number;
  draws: number;
  losses: number;
  unfinished: number;
  terminations: [string, number][];
  /** Plies played after the shared position. */
  plies: number[];
}

export function summary(mg: ModelGames): Summary {
  const s: Summary = { games: mg.games.length, wins: 0, draws: 0, losses: 0, unfinished: 0, terminations: [], plies: [] };
  const terms = new Map<string, number>();
  for (const g of mg.games) {
    const sc = scoreOf(g, mg.us);
    if (sc === 1) s.wins++;
    else if (sc === 0.5) s.draws++;
    else if (sc === 0) s.losses++;
    else s.unfinished++;
    const last = g.positions.at(-1)!;
    const t = g.termination ?? (last.isCheckmate() ? 'checkmate' : last.isStalemate() ? 'stalemate' : 'normal');
    terms.set(t, (terms.get(t) ?? 0) + 1);
    s.plies.push(g.sans.length - mg.start);
  }
  s.terminations = [...terms.entries()].sort((a, b) => b[1] - a[1]);
  return s;
}

export interface Branch {
  /** Moves after the shared position. */
  sans: string[];
  games: number;
  /** The strong side's average score through it. */
  score: number;
}

/** The games' tree from the shared position, `plies` deep, branches of `min` games or more, in tree order. */
export function branches(mg: ModelGames, plies: number, min: number): Branch[] {
  const count = new Map<string, { sans: string[]; games: number; score: number }>();
  for (const g of mg.games) {
    for (let k = 1; k <= plies && mg.start + k <= g.sans.length; k++) {
      const sans = g.sans.slice(mg.start, mg.start + k);
      const id = sans.join(' ');
      const e = count.get(id) ?? { sans, games: 0, score: 0 };
      e.games++;
      e.score += scoreOf(g, mg.us) ?? 0.5;
      count.set(id, e);
    }
  }
  const out: Branch[] = [];
  const walk = (prefix: string[]) => {
    const kids = [...count.values()].filter((e) => e.sans.length === prefix.length + 1 && prefix.every((s, i) => e.sans[i] === s) && e.games >= min).sort((a, b) => b.games - a.games);
    for (const k of kids) {
      out.push({ sans: k.sans, games: k.games, score: k.score / k.games });
      walk(k.sans);
    }
  };
  walk([]);
  return out;
}

export interface MoveStat {
  group: string;
  /** Games where it comes before the game tips (`tipOf`). */
  early: number;
  /** The piece that makes it most often. */
  piece: string;
  role: Role;
  /** Games with it (once a game). */
  games: number;
  /** The move numbers it first comes at, one per game. */
  at: number[];
  /** The share of its first occurrences that capture or hit (pawns: a break). */
  contact: number;
}

export interface PieceStat {
  piece: string;
  /** Its first squares after the shared position: square, games. */
  first: [string, number][];
  /** Its squares in order within the window: route, games. */
  routes: [string, number][];
  /** Games where it doesn't move within the window. */
  stays: number;
  /** Games where it is taken within the window. */
  taken: number;
}

/** What the strong side plays in its first `window` moves: by move group and by piece. */
export function plan(mg: ModelGames, window: number): { moves: MoveStat[]; pieces: PieceStat[]; theirs: MoveStat[] } {
  const moves = new Map<string, MoveStat & { pieces: Map<string, number>; hits: number }>();
  const pieces = new Map<string, { first: Map<string, number>; routes: Map<string, number>; stays: number; taken: number }>();
  const theirs = new Map<string, MoveStat & { pieces: Map<string, number>; hits: number }>();
  const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const g of mg.games) {
    const startPos = g.positions[mg.start];
    if (!startPos) continue;
    const ours = ourMoves(mg, g, window);
    const tip = tipOf(mg, g);
    const seen = new Set<string>();
    const trail = new Map<string, string[]>();
    for (const m of ours) {
      trail.set(m.piece, [...(trail.get(m.piece) ?? []), m.to]);
      if (m.rook) trail.set(m.rook.piece, [...(trail.get(m.rook.piece) ?? []), m.rook.to]);
      if (seen.has(m.group)) continue;
      seen.add(m.group);
      const e = moves.get(m.group) ?? { group: m.group, early: 0, piece: m.piece, role: m.role, games: 0, at: [] as number[], contact: 0, pieces: new Map<string, number>(), hits: 0 };
      e.games++;
      if (m.index < tip) e.early++;
      e.at.push(m.fullmove);
      if (m.contact) e.hits++;
      add(e.pieces, m.piece);
      moves.set(m.group, e);
    }
    // Which named pieces are still on the board at the window's end.
    const end = ours.at(-1) ? ours.at(-1)!.index + 1 : mg.start;
    const alive = new Set<string>();
    {
      const who = names(startPos, mg.us);
      for (let i = mg.start; i < end; i++) {
        const move = parseSan(g.positions[i]!, g.sans[i]!);
        if (move) track(who, g.positions[i]!, move, mg.us);
      }
      for (const n of who.values()) alive.add(n);
    }
    for (const name of new Set(names(startPos, mg.us).values())) {
      const p = pieces.get(name) ?? { first: new Map(), routes: new Map(), stays: 0, taken: 0 };
      const t = trail.get(name);
      if (t) {
        add(p.first, t[0]!);
        add(p.routes, t.join(' → '));
      } else p.stays++;
      if (!alive.has(name)) p.taken++;
      pieces.set(name, p);
    }
    const tseen = new Set<string>();
    for (const m of theirMoves(mg, g, window)) {
      if (tseen.has(m.group)) continue;
      tseen.add(m.group);
      const e = theirs.get(m.group) ?? { group: m.group, early: 0, piece: '', role: 'pawn' as Role, games: 0, at: [] as number[], contact: 0, pieces: new Map(), hits: 0 };
      e.games++;
      e.at.push(m.fullmove);
      theirs.set(m.group, e);
    }
  }
  const done = (m: Map<string, MoveStat & { pieces: Map<string, number>; hits: number }>): MoveStat[] =>
    [...m.values()]
      .map(({ pieces: ps, hits, ...e }) => ({ ...e, piece: [...ps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.piece, contact: e.games ? hits / e.games : 0 }))
      .sort((a, b) => b.games - a.games || median(a.at) - median(b.at));
  const top = (m: Map<string, number>, n: number): [string, number][] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    moves: done(moves),
    theirs: done(theirs),
    pieces: [...pieces.entries()].map(([piece, p]) => ({ piece, first: top(p.first, 6), routes: top(p.routes, 4), stays: p.stays, taken: p.taken })),
  };
}

export interface Checkpoint {
  /** Plies after the shared position. */
  ply: number;
  /** Games still going there. */
  games: number;
  /** The strong side's material against the shared position's (in pawns: +1 is a pawn more than there). */
  material: [string, number][];
  /** Pieces left, ours v theirs (`QRRBN v QRRBB`). */
  pieces: [string, number][];
  queensOff: number;
  ourKing: [string, number][];
  theirKing: [string, number][];
  /** Pawn-structure features, ours and theirs. */
  structure: [string, number][];
  /** The pawn skeletons (ours | theirs). */
  skeletons: [string, number][];
  /** Lc0's last eval at or before the checkpoint, from the strong side (centipawns), one per game with one. */
  evals: number[];
}

const LETTER: Record<Role, string> = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };

export function kingPlace(pos: Position, c: Color): string {
  const k = pos.board.kingOf(c);
  if (k === undefined) return 'none';
  const back = squareRank(k) === (c === 'white' ? 0 : 7);
  if (back && squareFile(k) >= 6) return 'castled short (g/h-file)';
  if (back && squareFile(k) <= 2) return 'castled long (a-c file)';
  return `king ${makeSquare(k)}`;
}

const signature = (pos: Position, c: Color) =>
  (['queen', 'rook', 'bishop', 'knight'] as Role[]).map((r) => LETTER[r].repeat(pos.board.pieces(c, r).size())).join('') || '-';

export function balanceUs(pos: Position, us: Color): number {
  const b = material(pos).balance;
  return us === 'white' ? b : -b;
}

/**
 * Where a game tips: the index of the first move after which Lc0's eval for the strong side stands
 * at +1.50 or more (after the shared position); the game's length when it never does. The strong
 * side's moves before it are its plan; after it, the punishment and the win.
 */
export function tipOf(mg: ModelGames, g: ModelGame, cp = 150): number {
  const pts = [...evalPoints(g).entries()].filter(([k]) => k > mg.start).sort((a, b) => a[0] - b[0]);
  const hit = pts.find(([, v]) => cpUs(v, mg.us) >= cp);
  if (!hit) return g.sans.length;
  // A jump marks the weaker side's move; the eval point after it is the reply's: the tip is the jump's move.
  const jump = g.jumps.find((j) => j.move + 2 === hit[0] && cpUs(j.to, mg.us) >= cp && cpUs(j.from, mg.us) < cp);
  return jump ? jump.move : hit[0] - 1;
}

/** Lc0's eval points of a game: (moves played, centipawns from White), from the plain evals and both ends of each jump. */
export function evalPoints(g: ModelGame): Map<number, number> {
  const pts = new Map(g.evals);
  for (const j of g.jumps) {
    if (!pts.has(j.move)) pts.set(j.move, j.from);
    if (!pts.has(j.move + 2)) pts.set(j.move + 2, j.to);
  }
  return pts;
}

/** The games at fixed plies after the shared position, each read where an exchange in progress has settled. */
export function checkpoints(mg: ModelGames, plies: readonly number[]): Checkpoint[] {
  const them = opposite(mg.us);
  return plies.map((ply) => {
    const mat = new Map<string, number>();
    const pcs = new Map<string, number>();
    const ok = new Map<string, number>();
    const tk = new Map<string, number>();
    const st = new Map<string, number>();
    const sk = new Map<string, number>();
    const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const evals: number[] = [];
    let games = 0;
    let queensOff = 0;
    for (const g of mg.games) {
      if (!g.positions[mg.start + ply] || !g.positions[mg.start]) continue;
      // Read where an exchange has settled: of this ply and the two after, the first whose material is their median.
      const b0 = balanceUs(g.positions[mg.start]!, mg.us);
      const near = [0, 1, 2].map((k) => mg.start + ply + k).filter((k) => g.positions[k]);
      const ds = near.map((k) => balanceUs(g.positions[k]!, mg.us) - b0);
      const mid = median(ds);
      const at = near[Math.max(0, ds.findIndex((x) => x === mid))]!;
      const pos = g.positions[at]!;
      games++;
      const d = balanceUs(pos, mg.us) - b0;
      add(mat, d === 0 ? 'as at the start' : d > 0 ? `+${d}` : `${d}`);
      add(pcs, `${signature(pos, mg.us)} v ${signature(pos, them)}`);
      if (!pos.board.pieces(mg.us, 'queen').nonEmpty() && !pos.board.pieces(them, 'queen').nonEmpty()) queensOff++;
      add(ok, kingPlace(pos, mg.us));
      add(tk, kingPlace(pos, them));
      for (const [c, who] of [[mg.us, 'our'], [them, 'their']] as const) {
        const f = pawnFacts(pos, c);
        for (const x of f.isolated) add(st, `${who} isolated ${x}`);
        for (const x of f.doubled) add(st, `${who} doubled ${x.split(' ')[0]}-pawns`);
        for (const x of f.passed) add(st, `${who} passed ${x}`);
        for (const x of f.backward) add(st, `${who} backward ${x}`);
      }
      const skel = (c: Color) => [...pos.board.pieces(c, 'pawn')].map(makeSquare).sort().join(' ');
      add(sk, `${skel(mg.us)} | ${skel(them)}`);
      let last: number | undefined;
      for (const [k, cp] of evalPoints(g)) if (k <= at && (last === undefined || k > last)) last = k;
      if (last !== undefined && last > mg.start) evals.push(cpUs(evalPoints(g).get(last)!, mg.us));
    }
    const top = (m: Map<string, number>, n: number): [string, number][] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return { ply, games, material: top(mat, 6), pieces: top(pcs, 4), queensOff, ourKing: top(ok, 3), theirKing: top(tk, 3), structure: top(st, 10), skeletons: top(sk, 3), evals };
  });
}

export interface Gain {
  /** Pawns ahead of the shared position's material (negative: given up). */
  threshold: number;
  /** One per game that gets there and keeps it two plies: the move number, the capture and what it took. */
  hits: { round: number; fullmove: number; san: string; took: string; index: number }[];
}

/**
 * When the strong side wins material against the shared position, and what: for each threshold,
 * the first move after which it stands that many pawns better than at the start (worse, for a
 * negative one: a sacrifice) and stays so two plies on, with the capture that did it.
 */
export function gains(mg: ModelGames, thresholds: readonly number[]): Gain[] {
  return thresholds.map((t) => {
    const hits: Gain['hits'] = [];
    for (const g of mg.games) {
      const base = g.positions[mg.start];
      if (!base) continue;
      const b0 = balanceUs(base, mg.us);
      const d = (k: number) => balanceUs(g.positions[k]!, mg.us) - b0;
      const meets = (k: number) => (t > 0 ? d(k) >= t : d(k) <= t);
      for (let k = mg.start + 1; k < g.positions.length; k++) {
        if (!meets(k) || (k + 1 < g.positions.length && !meets(k + 1)) || (k + 2 < g.positions.length && !meets(k + 2))) continue;
        // The capture behind it: the last capture by the side that gained, at or before move k − 1.
        const gainer = t > 0 ? mg.us : opposite(mg.us);
        let index = k - 1;
        for (let i = k - 1; i >= mg.start; i--) {
          const pos = g.positions[i]!;
          const move = parseSan(pos, g.sans[i]!);
          if (pos.turn === gainer && move && isNormal(move) && (pos.board.get(move.to) || move.promotion)) {
            index = i;
            break;
          }
        }
        const pos = g.positions[index]!;
        const move = parseSan(pos, g.sans[index]!);
        const victim = move && isNormal(move) ? pos.board.get(move.to) : undefined;
        const took = victim && victim.color !== pos.turn ? `${victim.role} ${makeSquare((move as { to: number }).to)}` : move && isNormal(move) && move.promotion ? `promotes on ${makeSquare(move.to)}` : '';
        hits.push({ round: g.round, fullmove: pos.fullmoves, san: `${pos.fullmoves}${pos.turn === 'white' ? '.' : '...'} ${g.sans[index]}`, took, index });
        break;
      }
    }
    return { threshold: t, hits };
  });
}

export interface Mistake {
  round: number;
  /** The weaker side's move (index into the game's moves). */
  index: number;
  number: string;
  san: string;
  group: string;
  fen: string;
  /** Lc0's eval before and after, from the strong side (centipawns). */
  from: number;
  to: number;
  /** The strong side's reply and the moves after it. */
  reply: string;
  line: string;
  /** The game's first jump that takes the strong side from under +1.5 to +1.5 or more. */
  turning: boolean;
  /** Maia's chance (playing the strong side) of the reply, when read. */
  found?: number;
}

/** The weaker side's moves that Lc0's eval jumped on, `min` centipawns or more in the strong side's favour (against it with `against`). */
export function mistakes(mg: ModelGames, o: { min: number; against?: boolean }): Mistake[] {
  const out: Mistake[] = [];
  for (const g of mg.games) {
    let tipped = false;
    for (const j of g.jumps) {
      if (j.move < mg.start) continue;
      const from = cpUs(j.from, mg.us);
      const to = cpUs(j.to, mg.us);
      const gain = Math.max(-MATE, Math.min(MATE, to)) - Math.max(-MATE, Math.min(MATE, from));
      const turning = !tipped && from < 150 && to >= 150;
      if (turning) tipped = true;
      if (o.against ? gain > -o.min : gain < o.min) continue;
      const pos = g.positions[j.move]!;
      out.push({
        round: g.round,
        index: j.move,
        number: `${pos.fullmoves}${pos.turn === 'white' ? '.' : '...'}`,
        san: g.sans[j.move]!,
        group: moveGroup(pos, g.sans[j.move]!),
        fen: makeFen(pos.toSetup()),
        from,
        to,
        reply: g.sans[j.move + 1] ?? '',
        line: g.sans[j.move + 1] ? movesText(g, j.move + 1, Math.min(g.sans.length, j.move + 7)) : '',
        turning,
      });
    }
  }
  return out;
}

/** Each game's first eval from the strong side at or over `cp`: the move number, one per game that gets there. */
export function firstAt(mg: ModelGames, cp: number): { round: number; fullmove: number; ourMove: number }[] {
  const out: { round: number; fullmove: number; ourMove: number }[] = [];
  for (const g of mg.games) {
    const pts = [...evalPoints(g).entries()].filter(([k]) => k > mg.start).sort((a, b) => a[0] - b[0]);
    const hit = pts.find(([, v]) => cpUs(v, mg.us) >= cp);
    if (!hit) continue;
    const ourMove = g.positions.slice(mg.start, hit[0]).filter((p) => p.turn === mg.us).length;
    out.push({ round: g.round, fullmove: g.positions[hit[0] - 1]!.fullmoves, ourMove });
  }
  return out;
}

/** Lc0's evals after its `k`-th move from the shared position, from the strong side, for each `k` asked. */
export function evalCurve(mg: ModelGames, ks: readonly number[]): { k: number; evals: number[] }[] {
  return ks.map((k) => {
    const evals: number[] = [];
    for (const g of mg.games) {
      let n = 0;
      for (let i = mg.start; i < g.sans.length; i++) {
        if (g.positions[i]!.turn !== mg.us) continue;
        n++;
        if (n === k) {
          const v = evalPoints(g).get(i + 1);
          if (v !== undefined) evals.push(cpUs(v, mg.us));
          break;
        }
      }
    }
    return { k, evals };
  });
}

/** The games that show the common plan best: the share of the plan's moves (in half the games or more, else the top ten) each plays within the window, then the shortest; and the quickest wins. */
export function representative(mg: ModelGames, window: number): { typical: { round: number; cover: number; plies: number; first: string }[]; quickest: { round: number; plies: number; result: string }[]; planMoves: string[] } {
  const { moves } = plan(mg, window);
  const n = mg.games.length;
  let common = moves.filter((m) => m.games >= n / 2).map((m) => m.group);
  if (common.length < 5) common = moves.slice(0, 10).map((m) => m.group);
  const set = new Set(common);
  const typical = mg.games
    .map((g) => {
      const mine = new Set(ourMoves(mg, g, window).map((m) => m.group));
      return { round: g.round, cover: set.size ? [...set].filter((x) => mine.has(x)).length / set.size : 0, plies: g.sans.length - mg.start, first: g.sans[mg.start] ?? '' };
    })
    .sort((a, b) => b.cover - a.cover || a.plies - b.plies);
  const quickest = mg.games
    .filter((g) => scoreOf(g, mg.us) === 1)
    .map((g) => ({ round: g.round, plies: g.sans.length - mg.start, result: g.termination ?? g.result }))
    .sort((a, b) => a.plies - b.plies);
  return { typical: typical.slice(0, 6), quickest: quickest.slice(0, 4), planMoves: common };
}

export type Policy = (pos: Position) => Promise<MaiaMove[]>;

/**
 * How often people would play the strong side's moves (Maia, playing the strong side), by move
 * group, over its first `window` moves: the moves a weaker player wouldn't find are the lesson.
 * Each position is read once.
 */
export async function surprise(mg: ModelGames, window: number, policy: Policy): Promise<{ group: string; piece: string; games: number; prob: number; example: string }[]> {
  const cache = new Map<string, Promise<MaiaMove[]>>();
  const read = (pos: Position) => {
    const fen = makeFen(pos.toSetup());
    if (!cache.has(fen)) cache.set(fen, policy(pos));
    return cache.get(fen)!;
  };
  const by = new Map<string, { group: string; piece: string; games: Set<number>; probs: number[]; example: string }>();
  for (const g of mg.games) {
    for (const m of ourMoves(mg, g, window)) {
      const pos = g.positions[m.index]!;
      const move = parseSan(pos, m.san);
      if (!move || !isNormal(move)) continue;
      const uci = standardUci(pos, move);
      const prob = (await read(pos)).find((x) => x.uci === uci)?.prob ?? 0;
      const e = by.get(m.group) ?? { group: m.group, piece: m.piece, games: new Set(), probs: [], example: '' };
      e.games.add(g.round);
      e.probs.push(prob);
      if (!e.example || prob < Math.min(...e.probs.slice(0, -1))) e.example = `game ${g.round}, ${m.number} ${m.san} (${(prob * 100).toFixed(0)}%)`;
      by.set(m.group, e);
    }
  }
  return [...by.values()].map((e) => ({ group: e.group, piece: e.piece, games: e.games.size, prob: e.probs.reduce((a, b) => a + b, 0) / e.probs.length, example: e.example }));
}

/** Maia's chance (playing the strong side) of each mistake's punishing reply. */
export async function replyFound(mg: ModelGames, ms: Mistake[], policy: Policy): Promise<void> {
  for (const m of ms) {
    const g = mg.games.find((x) => x.round === m.round)!;
    const pos = g.positions[m.index + 1];
    if (!pos || !m.reply) continue;
    const move = parseSan(pos, m.reply);
    if (!move || !isNormal(move)) continue;
    const uci = standardUci(pos, move);
    m.found = (await policy(pos)).find((x) => x.uci === uci)?.prob ?? 0;
  }
}

// ---------------------------------------------------------------- as a repertoire

/**
 * Every game as one tree, in the repertoire PGN the opening-ideas tools read: every move carries
 * its share of the games through that move order (`{ 60% }`). Read it with `readRepertoire(text,
 * us, { ourShares: true })`: the strong side's moves are the moves to learn, and where it varies,
 * each move takes its own share of the games. Comments and evals are left out.
 */
export function asRepertoirePgn(mg: ModelGames, event = 'Model games'): string {
  interface Node { san: string; count: number; children: Node[] }
  const root: Node = { san: '', count: 0, children: [] };
  for (const g of mg.games) {
    root.count++;
    let node = root;
    for (const san of g.sans) {
      let next = node.children.find((c) => c.san === san);
      if (!next) node.children.push((next = { san, count: 0, children: [] }));
      next.count++;
      node = next;
    }
  }
  const first = mg.games[0]?.positions[0];
  const toMove = (pos: Position, n: Node): MoveNode[] =>
    [...n.children]
      .sort((a, b) => b.count - a.count)
      .map((c) => {
        const node: MoveNode = { ...emptyNodeData(), san: c.san, children: [] };
        node.comments = [`${+((c.count / n.count) * 100).toFixed(2)}%`];
        const next = pos.clone();
        const mv = parseSan(next, c.san);
        if (mv) {
          next.play(mv);
          node.children = toMove(next, c);
        }
        return node;
      });
  const headers: [string, string][] = [['Event', event], ['Orientation', mg.us]];
  if (first && makeFen(first.toSetup()) !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') headers.push(['FEN', makeFen(first.toSetup())], ['SetUp', '1']);
  const chapter: Chapter = { id: 'model', headers, root: { ...emptyNodeData(), children: first ? toMove(first.clone(), root) : [] } };
  return writeChapter(chapter);
}

// ---------------------------------------------------------------- text

const pc = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)}%` : '-');
const ev = (cp: number) => (cp >= MATE - 1000 ? '+M' : cp <= -MATE + 1000 ? '-M' : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`);
const range = (xs: number[]) => {
  if (!xs.length) return '-';
  const [a, b] = quartiles(xs);
  return a === b ? `${median(xs)}` : `${median(xs)} (${a}–${b})`;
};
const evRange = (xs: number[]) => {
  if (!xs.length) return '-';
  const [a, b] = quartiles(xs);
  return `${ev(median(xs))} (${ev(a)} to ${ev(b)})`;
};

export interface ReportOptions {
  window: number;
  depth: number;
  min: number;
  at: number[];
  jump: number;
  surprise?: Awaited<ReturnType<typeof surprise>>;
  mistakes?: Mistake[];
  elos?: number[];
}

/** The model games' report: the facts a plan summary rests on, as text a reader can check. */
export function gamesText(mg: ModelGames, o: ReportOptions): string {
  const out: string[] = [];
  const n = mg.games.length;
  const say = (s = '') => out.push(s);
  const first = mg.games[0];
  if (!first || !first.positions[mg.start]) return 'No games.';
  const startPos = first.positions[mg.start]!;
  const side = mg.us === 'white' ? 'White' : 'Black';
  const s = summary(mg);
  say(`Model games: ${n}, the strong side (Lc0) is ${side}. The shared position (${mg.startFrom === 'marked' ? 'the end of prep' : 'where the games part'}), after ${numbered(first.sans.slice(0, mg.start), first.positions[0]!.fullmoves, first.positions[0]!.turn) || 'no moves'}:`);
  say(`  FEN ${makeFen(startPos.toSetup())}  (${startPos.turn} to move; material ${balanceUs(startPos, mg.us) >= 0 ? '+' : ''}${balanceUs(startPos, mg.us)} for ${side})`);
  say(`Results for ${side}: ${s.wins} won, ${s.draws} drawn, ${s.losses} lost${s.unfinished ? `, ${s.unfinished} unfinished` : ''}. Ended by: ${s.terminations.map(([t, c]) => `${t} ${c}`).join(', ')}. Plies after the shared position: median ${range(s.plies)}.`);
  if (o.elos?.length) say(`The weaker side's rating: ${Math.min(...o.elos)}–${Math.max(...o.elos)}, median ${median(o.elos)}.`);
  for (const p of mg.problems) say(`Problem: ${p}`);

  say(`\nThe games' tree from the shared position (${o.depth} plies, branches of ${o.min} games or more; games, ${side}'s score):`);
  for (const b of branches(mg, o.depth, o.min)) {
    const pos = first.positions[mg.start]!;
    const ply = b.sans.length - 1;
    const turn = (pos.turn === 'white') === (ply % 2 === 0) ? 'white' : 'black';
    const full = pos.fullmoves + Math.floor((ply + (pos.turn === 'black' ? 1 : 0)) / 2);
    const mover = turn === mg.us ? 'we' : 'they';
    say(`${'  '.repeat(ply + 1)}${full}${turn === 'white' ? '.' : '...'} ${b.sans.at(-1)}  ${b.games} (${pc(b.games, n)})${mover === 'they' ? '' : ''}, score ${(b.score * 100).toFixed(0)}%`);
  }

  const pl = plan(mg, o.window);
  say(`\n${side}'s moves in its first ${o.window} moves after the shared position, by what they do (games with it; of those, games where it comes before the game tips, Lc0's eval first at +1.50; the move number it first comes at: median (quartiles); "contact": a capture, or a pawn move that hits a pawn or piece):`);
  for (const m of pl.moves.filter((x) => x.games >= Math.max(2, n * 0.08)).slice(0, 40)) say(`  ${m.group.padEnd(6)} ${m.piece.padEnd(10)} ${String(m.games).padStart(3)} (${pc(m.games, n).padStart(4)})  before the tip ${String(m.early).padStart(3)}  move ${range(m.at)}${m.contact >= 0.5 ? `  contact ${pc(m.contact * m.games, m.games)}` : ''}`);
  say(`\nWhere each of ${side}'s pieces goes (first square after the shared position, games; routes within the window; games where it stays or is taken):`);
  for (const p of pl.pieces) {
    if (!p.first.length) {
      say(`  ${p.piece}: stays in ${p.stays}${p.taken ? `, taken in ${p.taken}` : ''}`);
      continue;
    }
    say(`  ${p.piece}: ${p.first.map(([sq, c]) => `${sq} ${c}`).join(', ')}; stays ${p.stays}${p.taken ? `, taken ${p.taken}` : ''}; routes ${p.routes.map(([r, c]) => `${r} ×${c}`).join(' | ')}`);
  }
  say(`\nThe weaker side's moves in the same stretch (games, move number):`);
  say(`  ${pl.theirs.filter((x) => x.games >= Math.max(2, n * 0.1)).slice(0, 24).map((m) => `${m.group} ${m.games} (${range(m.at)})`).join(', ')}`);

  if (o.surprise) {
    const rows = o.surprise.filter((x) => x.games >= Math.max(2, n * 0.08)).sort((a, b) => a.prob - b.prob).slice(0, 16);
    say(`\nThe strong side's moves a human would rarely play: Maia ${o.elos ? '' : ''}playing ${side}, its average chance of the move Lc0 played, over the games (moves in ${Math.max(2, Math.round(n * 0.08))} games or more, rarest first):`);
    for (const r of rows) say(`  ${r.group.padEnd(6)} ${r.piece.padEnd(10)} ${String(r.games).padStart(3)} games  Maia ${(r.prob * 100).toFixed(0)}%  rarest: ${r.example}`);
  }

  say(`\nThe games at fixed plies after the shared position:`);
  for (const c of checkpoints(mg, o.at)) {
    if (!c.games) continue;
    say(`  +${c.ply} plies (${c.games} games on; Lc0's eval for ${side} ${evRange(c.evals)}):`);
    say(`    material against the start: ${c.material.map(([k, v]) => `${k} ${pc(v, c.games)}`).join(', ')}; queens off ${pc(c.queensOff, c.games)}`);
    say(`    pieces (${side} v them): ${c.pieces.map(([k, v]) => `${k} ${pc(v, c.games)}`).join(', ')}`);
    say(`    our king: ${c.ourKing.map(([k, v]) => `${k} ${pc(v, c.games)}`).join(', ')}; theirs: ${c.theirKing.map(([k, v]) => `${k} ${pc(v, c.games)}`).join(', ')}`);
    say(`    structure: ${c.structure.map(([k, v]) => `${k} ${pc(v, c.games)}`).join(', ') || 'nothing marked'}`);
    say(`    skeletons (${side} | them): ${c.skeletons.map(([k, v]) => `[${k}] ${pc(v, c.games)}`).join('; ')}`);
  }

  say(`\nLc0's eval for ${side} after its k-th move from the shared position (median, quartiles; games with an eval there):`);
  say(`  ${evalCurve(mg, [5, 10, 15, 20, 25, 30]).filter((x) => x.evals.length).map((x) => `k=${x.k}: ${evRange(x.evals)} [${x.evals.length}]`).join('  ')}`);
  for (const cp of [150, 300]) {
    const f = firstAt(mg, cp);
    say(`  first at ${ev(cp)} or more: ${f.length} games, at move ${range(f.map((x) => x.fullmove))} (our move ${range(f.map((x) => x.ourMove))} after the start)`);
  }

  say(`\nMaterial against the shared position (the first move after which ${side} stands that far ahead, kept two plies; the capture behind it):`);
  for (const gn of gains(mg, [1, 2, 3, 5, -2])) {
    const took = new Map<string, number>();
    for (const h of gn.hits) took.set(h.took || '?', (took.get(h.took || '?') ?? 0) + 1);
    const label = gn.threshold > 0 ? `+${gn.threshold}` : `${gn.threshold} (we give up material)`;
    say(`  ${label}: ${gn.hits.length} games (${pc(gn.hits.length, n)}), at move ${range(gn.hits.map((h) => h.fullmove))}; took ${[...took.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
  }

  const ms = o.mistakes ?? mistakes(mg, { min: o.jump });
  const turning = ms.filter((m) => m.turning).sort((a, b) => a.index - b.index);
  say(`\nThe weaker side's mistakes (Lc0's eval jumped ${o.jump / 100} or more for ${side} on the move): ${ms.length} in ${new Set(ms.map((m) => m.round)).size} games. Where the game tipped (the first jump from under +1.50 to +1.50 or more), by move:`);
  const byFen = new Map<string, Mistake[]>();
  for (const m of turning) byFen.set(`${m.fen} ${m.san}`, [...(byFen.get(`${m.fen} ${m.san}`) ?? []), m]);
  for (const same of byFen.values()) {
    const m = same[0]!;
    const replies = [...new Set(same.map((x) => x.line))];
    say(`  game${same.length > 1 ? 's' : ''} ${same.map((x) => x.round).join(', ')}  ${m.number} ${m.san}?  ${ev(m.from)} → ${ev(m.to)}  then ${replies.join(' | ')}${m.found === undefined ? '' : `  (Maia as ${side} plays ${m.reply} ${(m.found * 100).toFixed(0)}%)`}\n      FEN ${m.fen}`);
  }
  const groups = new Map<string, number>();
  for (const m of ms) groups.set(m.group, (groups.get(m.group) ?? 0) + 1);
  say(`  their mistakes by move (3 times or more): ${[...groups.entries()].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 3).slice(0, 12).map(([k, v]) => `${k} ×${v}`).join(', ') || 'no move three times'}`);
  const against = mistakes(mg, { min: o.jump, against: true });
  if (against.length) say(`  jumps against ${side} (Lc0 re-judged, or the weaker side found a good move): ${against.length}, e.g. ${against.slice(0, 4).map((m) => `game ${m.round} ${m.number} ${m.san} ${ev(m.from)} → ${ev(m.to)}`).join('; ')}`);

  const rep = representative(mg, o.window);
  say(`\nGames that show the common plan (${rep.planMoves.join(' ')}): share of it played within the window, plies after the start, their first move:`);
  say(`  ${rep.typical.map((t) => `game ${t.round} ${Math.round(t.cover * 100)}% ${t.plies} plies (${t.first})`).join('; ')}`);
  say(`Quickest wins: ${rep.quickest.map((q) => `game ${q.round} ${q.plies} plies (${q.result})`).join('; ')}`);
  return out.join('\n');
}

/** One game from the shared position: its moves with Lc0's evals (for the strong side) and the jumps, and FENs at the start, at each jump and at the end. */
export function gameText(mg: ModelGames, round: number): string {
  const g = mg.games.find((x) => x.round === round);
  if (!g) throw new Error(`no game ${round} (rounds ${mg.games.map((x) => x.round).join(', ')})`);
  const out: string[] = [];
  const side = mg.us === 'white' ? 'White' : 'Black';
  out.push(`Game ${g.round}: ${g.white} v ${g.black}, ${g.result}${g.termination ? ` (${g.termination})` : ''}; evals for ${side}.`);
  out.push(`From the shared position: FEN ${makeFen(g.positions[mg.start]!.toSetup())}`);
  const parts: string[] = [];
  for (let i = mg.start; i < g.sans.length; i++) {
    const pos = g.positions[i]!;
    const num = pos.turn === 'white' ? `${pos.fullmoves}. ` : i === mg.start ? `${pos.fullmoves}... ` : '';
    let t = `${num}${g.sans[i]}`;
    const jump = g.jumps.find((j) => j.move === i);
    if (jump) t += ` {${ev(cpUs(jump.from, mg.us))} → ${ev(cpUs(jump.to, mg.us))}}`;
    const e = g.evals.get(i + 1);
    if (e !== undefined) t += ` {${ev(cpUs(e, mg.us))}}`;
    parts.push(t);
  }
  out.push(parts.join(' '));
  for (const j of g.jumps) {
    if (j.move < mg.start) continue;
    const pos = g.positions[j.move]!;
    out.push(`Before ${pos.fullmoves}${pos.turn === 'white' ? '.' : '...'} ${g.sans[j.move]} (${ev(cpUs(j.from, mg.us))} → ${ev(cpUs(j.to, mg.us))}): FEN ${makeFen(pos.toSetup())}`);
  }
  out.push(`The end: FEN ${makeFen(g.positions.at(-1)!.toSetup())}`);
  return out.join('\n');
}

