// Endgames (PLAN.md §5.145): the theoretical endgames every player needs, each a position with a
// goal (win, or hold the draw), played against Stockfish's best defence. Each of the user's moves
// is judged for the goal: a move that keeps it is fine however slow, one that throws it away (a win
// let go, a draw lost) stops the game until it is taken back. The first try at a position is what
// counts, as everywhere in training: its result is a `practice` event at the start's position with
// the preset `endgame`, and the spacing of the next try is read back from those events. Pure.
//
// Every position, its goal and the moves that keep it were checked with the vendored Stockfish 18
// at the judges' depths (16 and 18) before they were written here (§5.145's table): the goal is
// kept by a clear margin on one side of `GOAL_CP` and lost by a clear margin on the other.
import type { Position } from 'chessops/chess';
import { makeSquare as squareName } from 'chessops/util';
import type { PositionKey } from '../chess/positionKey.ts';
import type { Category } from './repertoire.ts';

export type Goal = 'win' | 'draw';
/**
 * When a win counts as done: mate, the pawn queened, or the defender left with a bare king; for a
 * repertoire endgame (§5.149) `convert`: a pawn queened, a bare king, or `CONVERT_LEAD` points of
 * material ahead.
 */
export type Until = 'mate' | 'promote' | 'bare' | 'convert';
export type Group = 'mates' | 'pawns' | 'rooks' | 'queen';

export interface Endgame {
  id: string;
  /** A theoretical endgame's group, or a repertoire endgame's category (§5.149). */
  group: Group | Category;
  title: string;
  fen: string;
  goal: Goal;
  /** A win's end (`goal` win only). */
  until?: Until;
  /** A draw held for this many of the user's moves counts as held (`goal` draw only). */
  hold?: number;
  /** The method, in a few sentences: shown before a first try and on request. */
  idea: string;
}

export const GROUPS: readonly { id: Group; title: string }[] = [
  { id: 'mates', title: 'Mating the bare king' },
  { id: 'pawns', title: 'King and pawns' },
  { id: 'rooks', title: 'Rook endings' },
  { id: 'queen', title: 'Queen against pawn' },
];

/** The preset of an endgame's `practice` events. */
export const ENDGAME_PRESET = 'endgame';

export const ENDGAMES: readonly Endgame[] = [
  {
    id: 'queen-mate',
    group: 'mates',
    title: 'Queen mate',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    goal: 'win',
    until: 'mate',
    idea: 'Put the queen a knight’s jump from the king to box it in, and follow it each time it moves so the box only shrinks. Once the king is on the edge, stop shrinking: bring your own king up and mate. Before every queen move, check that the king still has a square: no square and no check is stalemate.',
  },
  {
    id: 'rook-mate',
    group: 'mates',
    title: 'Rook mate',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    goal: 'win',
    until: 'mate',
    idea: 'Cut the king off along a rank or a file with the rook, then bring your king up. When the kings stand face to face, check: the king has to step back a line. When they don’t, make a waiting move with the rook along its line, far from the enemy king. Repeat until it is mated on the edge.',
  },
  {
    id: 'king-in-front',
    group: 'pawns',
    title: 'King in front of the pawn',
    fen: '5k2/8/8/8/3KP3/8/8/8 w - - 0 1',
    goal: 'win',
    until: 'promote',
    idea: 'With king and pawn against king, the king leads and the pawn follows. A pawn on e4 queens once your king reaches d6, e6 or f6, its key squares two ranks ahead of it, whoever is to move. Push the pawn too early and the defending king settles in front of it.',
  },
  {
    id: 'opposition',
    group: 'pawns',
    title: 'Take the opposition',
    fen: '8/8/8/4k3/8/3K4/4P3/8 w - - 0 1',
    goal: 'win',
    until: 'promote',
    idea: 'Kings face to face with one square between them: the side not to move has the opposition, and the other king has to give way. Take it, and when the defending king steps aside, walk past it towards the key squares. Keep a pawn move in reserve: it changes who has to move.',
  },
  {
    id: 'hold-opposition',
    group: 'pawns',
    title: 'Hold with the opposition',
    fen: '4k3/8/8/4K3/4P3/8/8/8 b - - 0 1',
    goal: 'draw',
    hold: 12,
    idea: 'Defend from in front of the pawn and keep the opposition: when the white king steps to one side, step to the same side to face it. When the pawn advances, step straight back, never to the side, so you can face the king again. On the last rank, a pawn on the 7th with check leaves you stalemated or wins it.',
  },
  {
    id: 'breakthrough',
    group: 'pawns',
    title: 'The breakthrough',
    fen: '8/ppp4k/8/PPP5/8/8/8/7K w - - 0 1',
    goal: 'win',
    until: 'promote',
    idea: 'Three pawns against three with the kings far away: b6! gives a pawn to make a passed one. After …axb6 comes c6!, after …cxb6 comes a6!, and one pawn runs through. The black king is too far away to catch it. Push the wrong pawn first and Black blocks the breakthrough.',
  },
  {
    id: 'reti',
    group: 'pawns',
    title: 'Two goals at once (Réti)',
    fen: '7K/8/k1P5/7p/8/8/8/8 w - - 0 1',
    goal: 'draw',
    hold: 10,
    idea: 'Chasing the h-pawn straight down the board is too slow, but the king doesn’t have to choose: on the diagonal, Kg7! heads for the pawn and towards your own c-pawn at the same time. If Black chases your pawn, you catch his; if he runs, your pawn queens too.',
  },
  {
    id: 'lucena',
    group: 'rooks',
    title: 'Lucena: build a bridge',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    goal: 'win',
    until: 'promote',
    idea: 'Your king is on the queening square and needs to come out without endless checks. First push the defending king a file further away with Rd1+, then bring the rook to the 4th rank (Rd4). When your king walks out and the checks come, the rook blocks them on b4, and the pawn queens.',
  },
  {
    id: 'philidor',
    group: 'rooks',
    title: 'Philidor: the third-rank defence',
    fen: '4k3/R7/8/4PK2/8/8/8/1r6 b - - 0 1',
    goal: 'draw',
    hold: 15,
    idea: 'While the pawn is on the 5th, keep your rook on your third rank (the 6th) so the white king can’t come forward. Once the pawn steps to the 6th, its king has no shelter left in front of it: swing the rook to the far end of the board and check it from behind. Your king stays in front of the pawn.',
  },
  {
    id: 'queen-vs-pawn',
    group: 'queen',
    title: 'Queen against a pawn on the 7th',
    fen: '8/8/8/8/8/8/3pk3/K6Q w - - 0 1',
    goal: 'win',
    until: 'bare',
    idea: 'Check, and pin when you can, until the king has to step in front of its own pawn: that gives your king a free move to come closer. Repeat until the pawn falls. This works against a centre or knight’s pawn; against a rook’s or bishop’s pawn the defender has stalemate tricks.',
  },
];

export const endgameById = (id: string): Endgame | undefined => ENDGAMES.find((e) => e.id === id);

/** The user's side: the side to move at the start. */
export const sideOf = (e: Endgame): 'white' | 'black' => (e.fen.split(' ')[1] === 'b' ? 'black' : 'white');

/** "White to play and win (queen the pawn)". */
export function taskOf(e: Endgame): string {
  const side = sideOf(e) === 'white' ? 'White' : 'Black';
  if (e.goal === 'draw') return `${side} to play and draw (hold ${e.hold ?? 0} moves)`;
  const end = e.until === 'promote' ? 'queen a pawn' : e.until === 'bare' ? 'win the pawn' : e.until === 'convert' ? `queen a pawn or go ${CONVERT_LEAD} points up` : 'mate';
  return `${side} to play and win (${end})`;
}

/* ------------------------------------------------------------------ the goal, move by move */

/**
 * The line between keeping the goal and losing it, in centipawns for the user: a win is kept at
 * +2 or better, a draw at −2 or better. Every position here keeps its goal at +4 or more (a win)
 * or −0.7 or more (a draw) with its good moves, and falls to about 0 (a win let go) or −4 and
 * below (a draw lost) with its bad ones, at depth 16.
 */
export const GOAL_CP = { win: 200, draw: -200 } as const;

export const keepsGoal = (goal: Goal, cp: number): boolean => cp >= GOAL_CP[goal];

/** A move that throws the goal away: kept before it (by the best move's score), not after it. */
export const slips = (goal: Goal, bestCp: number, afterCp: number): boolean => keepsGoal(goal, bestCp) && !keepsGoal(goal, afterCp);

/** A move of the game as the slip's search reads it: the user's or not, its judge out or in. */
export interface JudgedMove {
  isUser: boolean;
  judging?: boolean;
  bestCp?: number;
  afterCp?: number;
}

/**
 * The first of the user's moves from `from` on that threw the goal away, its index (the owner's
 * request, 2026-11-01: the moves are judged in the background while the game goes on, so the
 * user may have played on past a slip before its judge comes in; the one shown is always the
 * first). `pending` while a move before any slip found is still being judged; undefined when
 * none slipped. A move whose judge gave nothing is passed over (the caller ends the game then).
 */
export function firstSlip(goal: Goal, moves: readonly JudgedMove[], from = 0): number | 'pending' | undefined {
  for (let i = from; i < moves.length; i++) {
    const m = moves[i]!;
    if (!m.isUser) continue;
    if (m.judging) return 'pending';
    if (m.bestCp !== undefined && m.afterCp !== undefined && slips(goal, m.bestCp, m.afterCp)) return i;
  }
  return undefined;
}

/** Whether only the king is left of `side`'s pieces. */
function bare(pos: Position, side: 'white' | 'black'): boolean {
  return pos.board[side].size() === 1;
}

/** A repertoire endgame's win is home this many points of material ahead (§5.149). */
export const CONVERT_LEAD = 5;

/**
 * Whether a win's goal is reached after the user's move, which kept it (the caller has judged
 * that): mate, a promotion, or the defender with a bare king; converting, also a lead of
 * `CONVERT_LEAD`. A draw's goal is reached by holding
 * (`held`) or by the rules' draws, which the game itself ends on.
 */
export function wonAfter(e: Endgame, after: Position, promoted: boolean): boolean {
  if (e.goal !== 'win') return false;
  if (after.isCheckmate()) return true;
  if (e.until === 'promote') return promoted;
  if (e.until === 'bare') return bare(after, after.turn);
  if (e.until === 'convert') return promoted || bare(after, after.turn) || materialFor(after, after.turn === 'white' ? 'black' : 'white') >= CONVERT_LEAD;
  return false;
}

/** A draw held for its moves, the last one keeping it. */
export const held = (e: Endgame, userMoves: number): boolean => e.goal === 'draw' && userMoves >= (e.hold ?? Infinity);

/** A game's result read as the goal: solved when it is the goal (a win, or a draw or better when drawing). */
export const solvedBy = (goal: Goal, res: 'win' | 'draw' | 'loss'): boolean => (goal === 'win' ? res === 'win' : res !== 'loss');

/* ------------------------------------------------------------------ the defence */

const VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 } as const;

/** `side`'s material less the other side's, in pawns. */
export function materialFor(pos: Position, side: 'white' | 'black'): number {
  let sum = 0;
  for (const sq of pos.board.occupied) {
    const p = pos.board.get(sq)!;
    sum += (p.color === side ? 1 : -1) * VALUE[p.role];
  }
  return sum;
}

/** How close to Stockfish's best a pressing move may be, in centipawns. */
export const PRESS_CP = 30;

/**
 * The attacker's move against a draw being held (§5.145): in a drawn position every move scores
 * about the same, and Stockfish's first may simply give its pawn away and end the drill. Among the
 * lines within `PRESS_CP` of the best (scores for the side to move), the first whose next two plies
 * give no material away; else the best. `material` is the mover's balance (`materialFor`) after
 * a line's first moves are played from the position, undefined when they can't be.
 */
export function pressingMove(lines: readonly { cp: number; pv: readonly string[] }[], material: (pv: readonly string[]) => number | undefined): string | undefined {
  const best = lines[0];
  if (!best?.pv.length) return undefined;
  const now = material([]);
  for (const l of lines) {
    if (!l.pv.length || l.cp < best.cp - PRESS_CP) continue;
    const after = material(l.pv.slice(0, 2));
    if (now !== undefined && after !== undefined && after >= now) return l.pv[0];
  }
  return best.pv[0];
}

/** Maia's rating for the opponent (§5.147): its highest. */
export const MAIA_ELO = 2600;
/** Maia's likeliest moves looked at, and the least likely of them still taken. */
export const MAIA_TOP = 3;
export const MAIA_MIN = 0.05;

/** A line of the opponent's: its score for the opponent (a mate ±10000, as `moverScore`) and its moves. */
export interface OpponentLine {
  cp: number;
  pv: readonly string[];
}

/**
 * The opponent's move (the owner's request, 2026-11-01, §5.147): Stockfish knows every move of a
 * lost defence loses and plays any of them, often not the one that tests the user; Maia plays the
 * move a strong player tries, which (measured) leaves the user the fewest ways to keep the goal
 * far more often. So Maia's likeliest move (of its first `MAIA_TOP`, from `MAIA_MIN`) that
 * Stockfish finds sound: the game not over after it, its score within `PRESS_CP` of the best
 * (any score when the opponent is lost whatever it plays: the user's win kept), and its line's
 * next two plies giving no more material away than Stockfish's own move's. Else Stockfish's move
 * (`pressingMove` against a draw being held, the best otherwise). `best` are Stockfish's lines,
 * best first; `lineOf` a line for one of Maia's moves (searched alone, or one of `best`);
 * `material` the opponent's balance after a line's first moves; `over` whether the game ends
 * after a move; `extra.pushes` the pawn pushes to try first, as sound by the same rule, the best
 * scored taken (a draw's attacker making progress, `pushNow`); `extra.repeats` whether a move goes
 * back to a position of the game's (a draw's attacker plays none while it has a sound other).
 */
export function opponentPick(
  goal: Goal,
  best: readonly OpponentLine[],
  maia: readonly { uci: string; prob: number }[],
  lineOf: (uci: string) => OpponentLine | undefined,
  material: (pv: readonly string[]) => number | undefined,
  over: (uci: string) => boolean,
  extra: { pushes?: readonly string[]; repeats?: (uci: string) => boolean } = {},
): { uci: string; maia: boolean; push?: boolean } | undefined {
  const top = best[0];
  if (!top) return undefined;
  // A draw's attacker doesn't go back to a position already seen while another line as good is
  // there (§5.148): a repetition ends the drill before its method is shown.
  const repeats = goal === 'draw' ? (extra.repeats ?? (() => false)) : () => false;
  const fresh = best.filter((l) => l.pv.length && !repeats(l.pv[0]!) && l.cp >= top.cp - PRESS_CP);
  const pool = fresh.length ? fresh : best;
  const base = goal === 'draw' ? pressingMove(pool, material) : top.pv[0];
  if (!base) return undefined;
  const baseLine = best.find((l) => l.pv[0] === base)!;
  const floor = material(baseLine.pv.slice(0, 2)) ?? material([]);
  const lost = goal === 'win' && top.cp <= -GOAL_CP.win;
  const sound = (uci: string): OpponentLine | undefined => {
    const l = lineOf(uci);
    if (!l?.pv.length || l.pv[0] !== uci || over(uci) || repeats(uci)) return undefined;
    if (!lost && l.cp < top.cp - PRESS_CP) return undefined;
    const after = material(l.pv.slice(0, 2));
    return after === undefined || floor === undefined || after < floor ? undefined : l;
  };
  // Progress first (§5.148): the soundest pawn push, when asked for.
  const pushed = (extra.pushes ?? []).map(sound).filter((l): l is OpponentLine => !!l).sort((a, b) => b.cp - a.cp)[0];
  if (pushed) return { uci: pushed.pv[0]!, maia: maia.some((m) => m.uci === pushed.pv[0]), push: true };
  for (const m of maia.slice(0, MAIA_TOP)) {
    if (m.prob < MAIA_MIN) break;
    if (m.uci === base) return { uci: base, maia: true };
    if (sound(m.uci)) return { uci: m.uci, maia: true };
  }
  return { uci: base, maia: false };
}

/**
 * Whether a draw's attacker should push on now (§5.148, the owner's note of 2026-11-01): Maia and
 * Stockfish both kept Philidor's pawn on the 5th, every move scoring 0.00, so the defence's second
 * stage (the checks from behind once the pawn reaches the 6th) never came. Once the user has held
 * a third of the drill, the attacker plays a pawn push whenever one is sound.
 */
export const pushNow = (e: Endgame, userMoves: number): boolean => e.goal === 'draw' && userMoves >= Math.ceil((e.hold ?? 0) / 3);

/** The side to move's pawn moves straight ahead (a promotion to a queen): a draw's attacker's progress. */
export function pawnPushes(pos: Position): string[] {
  const out: string[] = [];
  for (const from of pos.board.pawn.intersect(pos.board[pos.turn])) {
    for (const to of pos.dests(from)) {
      if ((to & 7) !== (from & 7)) continue;
      out.push(`${squareName(from)}${squareName(to)}${to >> 3 === 0 || to >> 3 === 7 ? 'q' : ''}`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ the record and its spacing */

export interface Attempt {
  t: number;
  res: 'win' | 'draw' | 'loss';
}

/** Days until the next try after 1, 2, 3… solves in a row. */
export const INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;
const DAY = 86_400_000;

export interface Standing {
  /** Never tried, due (missed last, or its interval passed), or not due until `next`. */
  state: 'new' | 'due' | 'later';
  tries: number;
  solves: number;
  /** Solves in a row, the latest last. */
  streak: number;
  /** When it comes due again (state `later`). */
  next?: number;
  /** The last five tries, oldest first: solved or not. */
  last: boolean[];
}

/** Where an endgame stands from its attempts (any order) at `now`. */
export function standingOf(goal: Goal, attempts: readonly Attempt[], now: number): Standing {
  const sorted = [...attempts].sort((a, b) => a.t - b.t);
  const marks = sorted.map((a) => solvedBy(goal, a.res));
  let streak = 0;
  for (let i = marks.length - 1; i >= 0 && marks[i]; i--) streak++;
  const base = { tries: marks.length, solves: marks.filter(Boolean).length, streak, last: marks.slice(-5) };
  if (!sorted.length) return { state: 'new', ...base };
  if (!streak) return { state: 'due', ...base };
  const next = sorted[sorted.length - 1]!.t + INTERVAL_DAYS[Math.min(streak, INTERVAL_DAYS.length) - 1]! * DAY;
  return next <= now ? { state: 'due', ...base } : { state: 'later', next, ...base };
}

/** The attempts at each endgame of `list`, from practice results (`practice` events) at their start positions. */
export function attemptsByEndgame(results: readonly { key: PositionKey; res: Attempt['res']; preset?: string; t: number }[], keyOf: (e: Pick<Endgame, 'id' | 'fen'>) => PositionKey | undefined, list: readonly Pick<Endgame, 'id' | 'fen'>[] = ENDGAMES): Map<string, Attempt[]> {
  const byKey = new Map<string, string>();
  for (const e of list) {
    const k = keyOf(e);
    if (k) byKey.set(k, e.id);
  }
  const out = new Map<string, Attempt[]>();
  for (const r of results) {
    if (r.preset !== ENDGAME_PRESET) continue;
    const id = byKey.get(r.key);
    if (!id) continue;
    let list = out.get(id);
    if (!list) out.set(id, (list = []));
    list.push({ t: r.t, res: r.res });
  }
  return out;
}

/** The next endgame of `list` to play: the first due in the list's order, else the first never tried. */
export function nextEndgame<E extends { id: string } = Endgame>(standings: ReadonlyMap<string, Standing>, after?: string, list: readonly E[] = ENDGAMES as unknown as readonly E[]): E | undefined {
  const order = after ? [...list.slice(list.findIndex((e) => e.id === after) + 1), ...list] : list;
  const pick = (state: Standing['state']) => order.find((e) => e.id !== after && (standings.get(e.id)?.state ?? 'new') === state);
  return pick('due') ?? pick('new');
}
