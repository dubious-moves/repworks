// Clickable lines in comments (PLAN.md §5.12), after q_extension's `clParse` and `clStartFen`
// (`src/main-world.js` at c26242f), first rebuilt from the plan's description, then checked against
// that source (Phase 2, §5.20):
// - A line is a group in parentheses that starts with a move number and a move, `(7. Bc4 Qa5)` or
//   `(6... Nbd7 7. Bc4)`. Any other group is a remark, `(with braces typed as parens)`, and stays
//   text. Glyphs standing alone (`!?`, `$14`) are allowed; q_extension would read such a group as
//   a remark.
// - **Branches** (PLAN.md §5.217, the owner's choice of 2026-11-27): a group written inside a line
//   is read on its own, `(8... Qxd4 9. Nb5 (9. Nc3 Qb4) 9... Qb4+)`: a line of three moves and,
//   inside it, a line of two. The inner line is a branch of the outer when its first number and
//   side are those of a position the outer line has reached by where the group is written (here
//   the one before 9. Nb5, which it replaces); it starts there. One that fits no such position is
//   placed as a line of the comment (below), or stays text. A remark in parentheses inside a line
//   is text and doesn't end the line. q_extension reads innermost groups only.
// - **Lead-in words** (PLAN.md §5.175, the owner's courses): a group may open with a few words before
//   its first move number, `(Or 1...Ke4 2.Qaa4+)`, `(Not 3.Rge8 since then …)`, `(The quicker
//   2.Qae5+ …)`: up to four, each one of `LEAD_IN`'s (or, not, and, instead, better, also, the,
//   stopping …). Any other opening word makes the group a remark as before, so `(see 5. Nf3)` and
//   `(this is not 5. Nf3)` stay text. The line is still placed by its number and side alone, so a
//   remark that names a move of another ply is text too. Training's quiz reads groups without
//   lead-ins only (`parseCommentLines(text, false)`): an "Or …" is an alternative, not the line.
// - Words may follow a move, `(12. Ng5 Ndf6 taking e6 under control 13. Nxe6 Bxe6)`: they are
//   text, and the line goes on at the next move number, so a square or a move named in the words
//   is never read as a move. A comma, colon or semicolon after a move is text too.
// - `--` is a null move: the side to move passes, so a plan can be shown as one side's moves,
//   `(7. -- Bg7 8. -- O-O)`. It can't be played in check. Stepping through a line passes over
//   it, so each step shows one of the moves of the plan.
// - A line starts at the commented move's position when its first move number and side are that
//   position's, or at the position before the move (it replaces the move) when they are that
//   one's. The two differ by a ply, so at most one fits; a line that fits neither stays text, as
//   in q_extension. Moves are played with chessops, as far as they are legal; the rest are shown
//   struck through.
// - Line jumping (q_extension v1.13.1): a cursor runs through a comment's lines end to end,
//   skipping lines whose first move is illegal; stepping back before the first line leaves.
// - Each move keeps its glyph (`Nf6?!`, or `Nf6 $6` standing after it) and the move number printed
//   before it, for the lines quizzed in review (src/core/train/commentQuiz.ts, PLAN.md §5.98).
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { makeUci } from 'chessops/util';

export interface CommentMove {
  /** The move as chessops reads it: glyphs and check marks off, `0-0` as `O-O`; `--` a null move. */
  san: string;
  /** Where the move is written in the comment: `text.slice(from, to)`. */
  from: number;
  to: number;
  /** The glyph written on the move (`!`, `?!`…), or standing after it (`!?`, `$2` as `?`). */
  glyph?: string;
  /** The move number printed before the move (`13.`, `16...`), when one is. */
  printed?: { number: number; turn: Color };
  /** Where the move's text starts with its printed number (`13.` of `13. Nxe6`); `from` without one. */
  start: number;
}

export interface CommentLine {
  /** The group, parentheses included. */
  from: number;
  to: number;
  /** The first move's number and side. */
  number: number;
  turn: Color;
  moves: CommentMove[];
  /** The words written between the moves (`text.slice(from, to)`), each run of them once. */
  words: { from: number; to: number }[];
  /** The groups in parentheses written directly inside this one, lines and remarks alike. */
  groups: { from: number; to: number }[];
  /**
   * For a line written inside another (the nearest line around it, remarks apart): that line's
   * index, and how many of its moves are written before this group.
   */
  parent?: { line: number; after: number };
}

/** A null move, as written and as played (SAN and UCI). */
export const NULL_SAN = '--';
export const NULL_UCI = '0000';

const NUMBER = /^(\d+)(\.\.\.|…|\.)(.*)$/;
const SAN = /^(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=?[NBRQ])?|O-O(?:-O)?|0-0(?:-0)?)[+#]?[!?]*$/;
const GLYPH = /^(?:[!?]{1,2}|\$\d{1,3})$/;
/** The move glyphs a NAG stands for (`$1`–`$6`); the others (`$14`, ±) say nothing about the move. */
const NAG_GLYPHS: Record<string, string> = { $1: '!', $2: '?', $3: '!!', $4: '??', $5: '!?', $6: '?!' };

/**
 * The words a line may open with before its first move number (lowercase, without punctuation):
 * the connectives and comparatives that introduce an alternative or an aside in a course's
 * comments. A closed list on purpose: a remark that merely contains a move stays text.
 */
export const LEAD_IN = new Set([
  'or', 'nor', 'and', 'but', 'not', 'no', 'instead', 'rather', 'than', 'of', 'better', 'worse', 'best', 'also', 'even', 'only', 'just', 'simply', 'too', 'still', 'then', 'if',
  'the', 'a', 'an', 'quicker', 'quickest', 'faster', 'simpler', 'stronger', 'weaker', 'easier', 'safer', 'slower', 'longer', 'shorter', 'cleaner', 'neater', 'prettier',
  'possible', 'good', 'fine', 'enough', 'wins', 'win', 'draws', 'is', 'are', 'was', 'also', 'alternatively', 'perhaps', 'maybe', 'sometimes', 'normally', 'usually', 'either',
  'similarly', 'likewise', 'equally', 'otherwise', 'now', 'here', 'with', 'by', 'to', 'for', 'after', 'before',
  'stopping', 'preventing', 'avoiding', 'allowing', 'threatening', 'preparing', 'trying', 'playing',
]);
/** Most lead-in words a line may open with. */
export const LEAD_IN_MAX = 4;

const clean = (token: string) => token.replace(/[!?]+$/, '').replace(/[+#]$/, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');

/**
 * One group's moves, or undefined when it is a remark. `at` is the group's inner text offset; the
 * groups written inside it are blanked out of `inner`.
 */
function parseGroup(inner: string, at: number, leadIns: boolean): Pick<CommentLine, 'number' | 'turn' | 'moves' | 'words'> | undefined {
  let lead = 0;
  const moves: CommentMove[] = [];
  const words: { from: number; to: number }[] = [];
  let first: { number: number; turn: Color } | undefined;
  // In words: the line goes on only at a move number.
  let prose = false;
  // The number printed before the next move, and where it is written.
  let printed: { number: number; turn: Color } | undefined;
  let printedAt = 0;
  // A word joins the run before it when only spaces are between them.
  const word = (from: number, to: number) => {
    const last = words.at(-1);
    if (last && !inner.slice(last.to - at, from - at).trim()) last.to = to;
    else words.push({ from, to });
  };
  for (const m of inner.matchAll(/\S+/g)) {
    let token = m[0];
    let offset = at + m.index;
    const numbered = NUMBER.exec(token);
    if (numbered) {
      const turn: Color = numbered[2] === '.' ? 'white' : 'black';
      if (!first && moves.length === 0) first = { number: Number(numbered[1]), turn };
      printed = { number: Number(numbered[1]), turn };
      printedAt = offset;
      prose = false;
      token = numbered[3]!;
      offset += numbered[1]!.length + numbered[2]!.length;
      if (token === '') continue;
    } else if (!first) {
      // Before the first number: only the lead-in words, a few of them.
      if (!leadIns || ++lead > LEAD_IN_MAX || !LEAD_IN.has(token.replace(/[,:;]+$/, '').toLowerCase())) return undefined;
      continue;
    }
    // A comma, colon, semicolon or full stop after a move is text.
    const move = prose ? '' : token.replace(/[,;:.]+$/, '');
    if (move && GLYPH.test(move)) {
      // A glyph standing after a move is the move's, unless it has one written on it.
      const last = moves.at(-1);
      const glyph = move.startsWith('$') ? NAG_GLYPHS[move] : move;
      if (last && !last.glyph && glyph && !printed) last.glyph = glyph;
      continue;
    }
    if (move === NULL_SAN || SAN.test(move)) {
      // The glyphs written on a move stay text; the move is the rest.
      const bare = move.replace(/[!?]+$/, '');
      const glyph = move === NULL_SAN ? '' : move.slice(bare.length);
      moves.push({ san: move === NULL_SAN ? NULL_SAN : clean(move), from: offset, to: offset + bare.length, ...(glyph ? { glyph } : {}), ...(printed ? { printed } : {}), start: printed ? printedAt : offset });
      printed = undefined;
      if (move.length < token.length) word(offset + move.length, offset + token.length);
      continue;
    }
    // Words: a line must start with a move; after one, they are text until the next number.
    if (!moves.length) return undefined;
    prose = true;
    word(offset, offset + token.length);
  }
  return first && moves.length ? { ...first, moves, words } : undefined;
}

/** Every pair of parentheses in a text, outermost first (by where each opens); one never closed is no group. */
function groupsOf(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const open: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') open.push(i);
    else if (text[i] === ')' && open.length) out.push({ from: open.pop()!, to: i + 1 });
  }
  return out.sort((a, b) => a.from - b.from);
}

/**
 * Every line written in a comment, in the order they open: a line, then the lines written inside
 * it, then the next. A group is read without the groups inside it, each of which is read on its
 * own (a branch of the line, or a remark).
 */
export function parseCommentLines(text: string, leadIns = true): CommentLine[] {
  if (!text.includes('(')) return [];
  const out: CommentLine[] = [];
  // The groups still open at the one being read: its index among the lines, or -1 for a remark.
  const around: { to: number; line: number }[] = [];
  const all = groupsOf(text);
  all.forEach((g, n) => {
    while (around.length && around.at(-1)!.to <= g.from) around.pop();
    // The groups directly inside: those that follow with no group between.
    const inside: { from: number; to: number }[] = [];
    for (let k = n + 1; k < all.length && all[k]!.from < g.to; k++) if (!inside.length || all[k]!.from >= inside.at(-1)!.to) inside.push(all[k]!);
    let inner = text.slice(g.from + 1, g.to - 1);
    for (const h of inside) inner = inner.slice(0, h.from - g.from - 1) + ' '.repeat(h.to - h.from) + inner.slice(h.to - g.from - 1);
    const group = parseGroup(inner, g.from + 1, leadIns);
    if (group) {
      const up = around.findLast((a) => a.line >= 0);
      const parent = up && { line: up.line, after: out[up.line]!.moves.filter((m) => m.from < g.from).length };
      out.push({ from: g.from, to: g.to, ...group, groups: inside, ...(parent ? { parent } : {}) });
    }
    around.push({ to: g.to, line: group ? out.length - 1 : -1 });
  });
  return out;
}

const fits = (line: CommentLine, pos: Position) => pos.fullmoves === line.number && pos.turn === line.turn;

/**
 * Where a line starts: `after` is the commented move's position (the chapter's start for a
 * comment before the first move), `before` the position before it (none at the start).
 * Undefined when the line's first number and side fit neither: it is then text.
 */
export function lineStart(line: CommentLine, after: Position, before: Position | undefined): Position | undefined {
  if (fits(line, after)) return after.clone();
  if (before && fits(line, before)) return before.clone();
  return undefined;
}

export interface PlayedLine {
  line: CommentLine;
  /** Whether the line has a start; one that fits neither position is text, with no moves. */
  placed: boolean;
  /** positions[0] is the start; positions[i] follows the line's first i moves. */
  positions: Position[];
  /** The legal moves played, as UCI (for the board's last move) and canonical SAN. */
  ucis: string[];
  sans: string[];
  /** A branch: the line it is written in (its index), and how many of that line's moves lead to where this one starts. */
  parent?: { line: number; ply: number };
  /**
   * A branch's way in, from the start of the outermost line it is written in: the positions before
   * its own start (that line's start first) and the moves between them.
   */
  lead?: { positions: Position[]; sans: string[]; ucis: string[] };
}

/** A line's moves from the start of the outermost line it is written in: a branch's way in, then its own. */
export const sansFromStart = (l: PlayedLine): string[] => (l.lead ? [...l.lead.sans, ...l.sans] : l.sans);
export const ucisFromStart = (l: PlayedLine): string[] => (l.lead ? [...l.lead.ucis, ...l.ucis] : l.ucis);
/** Where the outermost line starts: the line's own start when it is no branch. */
export const outerStart = (l: PlayedLine): Position | undefined => l.lead?.positions[0] ?? l.positions[0];

/** A line played from its start, as far as its moves are legal; none played with no start. */
export function playLine(line: CommentLine, start: Position | undefined): PlayedLine {
  if (!start) return { line, placed: false, positions: [], ucis: [], sans: [] };
  const pos = start.clone();
  const out: PlayedLine = { line, placed: true, positions: [pos.clone()], ucis: [], sans: [] };
  for (const m of line.moves) {
    if (m.san === NULL_SAN) {
      // The side to move passes: never out of check.
      if (pos.isCheck()) break;
      if (pos.turn === 'black') pos.fullmoves++;
      pos.turn = pos.turn === 'white' ? 'black' : 'white';
      pos.epSquare = undefined;
      pos.halfmoves++;
      out.sans.push(NULL_SAN);
      out.ucis.push(NULL_UCI);
      out.positions.push(pos.clone());
      continue;
    }
    const move = parseSan(pos, m.san);
    if (!move) break;
    out.sans.push(makeSan(pos, move));
    out.ucis.push(makeUci(move));
    pos.play(move);
    out.positions.push(pos.clone());
  }
  return out;
}

/**
 * Every line of a comment, played from where each starts. A line written inside another is its
 * branch when its number and side are those of a position that line has reached by where the
 * group is written (the latest such); otherwise it is placed as a line of the comment.
 */
export function playedLines(text: string, after: Position, before: Position | undefined, leadIns = true): PlayedLine[] {
  const out: PlayedLine[] = [];
  for (const line of parseCommentLines(text, leadIns)) {
    const up = line.parent && out[line.parent.line];
    let ply = -1;
    if (up && line.parent) for (let j = Math.min(line.parent.after, up.ucis.length); j >= 0 && ply < 0; j--) if (up.positions[j] && fits(line, up.positions[j]!)) ply = j;
    if (!up || !line.parent || ply < 0) {
      out.push(playLine(line, lineStart(line, after, before)));
      continue;
    }
    const lead = {
      positions: [...(up.lead?.positions ?? []), ...up.positions.slice(0, ply)],
      sans: [...(up.lead?.sans ?? []), ...up.sans.slice(0, ply)],
      ucis: [...(up.lead?.ucis ?? []), ...up.ucis.slice(0, ply)],
    };
    out.push({ ...playLine(line, up.positions[ply]), parent: { line: line.parent.line, ply }, lead });
  }
  return out;
}

/** A move of a comment's lines: the line's index and how many of its moves are played (1 or more). */
export interface Cursor {
  line: number;
  ply: number;
}

const legal = (l: PlayedLine | undefined) => l?.ucis.length ?? 0;

/**
 * A cursor past the passes: on a null move it goes on in `dir` to the move the pass lets be
 * played, so each step shows a real move. A pass at the line's end is shown (nothing follows it);
 * undefined when only passes are before it, going back.
 */
function land(lines: readonly PlayedLine[], c: Cursor, dir: 1 | -1): Cursor | undefined {
  const l = lines[c.line]!;
  let ply = c.ply;
  while (l.sans[ply - 1] === NULL_SAN) {
    if (ply + dir < 1) return undefined;
    if (ply + dir > l.sans.length) break;
    ply += dir;
  }
  return { line: c.line, ply };
}

/** The first move of the first line that has one legal move, if any (past passes). */
export function firstCursor(lines: readonly PlayedLine[]): Cursor | undefined {
  const i = lines.findIndex((l) => legal(l) > 0);
  return i < 0 ? undefined : land(lines, { line: i, ply: 1 }, 1);
}

/**
 * One step through a comment's lines end to end: within a line, then on from its last move to the
 * next line's first, or back from its first move to the previous line's last. Lines with no
 * legal move are skipped, and passes (`--`) are stepped over. Undefined: stepping back from the
 * first line's first move (leave the lines). At the last line's last move, → stays. A branch
 * comes after the line it is written in, as the lines are in the text; back from a branch's first
 * move is the move it branches from, as a move taken back.
 */
export function stepCursor(lines: readonly PlayedLine[], c: Cursor, dir: 1 | -1): Cursor | undefined {
  const ply = c.ply + dir;
  if (ply >= 1 && ply <= legal(lines[c.line])) {
    const next = land(lines, { line: c.line, ply }, dir);
    if (next) return next;
  }
  const from = lines[c.line]?.parent;
  if (dir === -1 && from) return stepCursor(lines, { line: from.line, ply: from.ply + 1 }, -1);
  for (let i = c.line + dir; i >= 0 && i < lines.length; i += dir) {
    const n = legal(lines[i]);
    const next = n > 0 ? land(lines, { line: i, ply: dir === 1 ? 1 : n }, dir) : undefined;
    if (next) return next;
  }
  return dir === 1 ? c : undefined;
}

/** The cursor at a move of the comment's text (its line and index), clamped to what is legal; a pass clicked shows the move after it. */
export function cursorAt(lines: readonly PlayedLine[], line: number, move: number): Cursor | undefined {
  const n = legal(lines[line]);
  return n === 0 ? undefined : land(lines, { line, ply: Math.min(move + 1, n) }, 1);
}

/**
 * ↓ or ↑ through a comment's lines, as through a move's branches. ↓: the first move of the next
 * line written after the move shown that has a legal one, so on a move with a branch written
 * after it, into that branch. ↑ from a branch: the branch written before it at the same move, or
 * the move it is the other choice to in the line it branches from; from a line of the comment,
 * the first move of the line before. Undefined when there is none that way.
 */
export function switchLine(lines: readonly PlayedLine[], c: Cursor, dir: 1 | -1): Cursor | undefined {
  const here = lines[c.line];
  if (dir === 1) {
    const written = here?.line.moves[c.ply - 1]?.to ?? -1;
    for (let i = c.line + 1; i < lines.length; i++) if (legal(lines[i]) > 0 && lines[i]!.line.from >= written) return land(lines, { line: i, ply: 1 }, 1);
    return undefined;
  }
  const from = here?.parent;
  let top = c.line;
  if (from) {
    for (let i = c.line - 1; i > from.line; i--) {
      const p = lines[i]!.parent;
      if (p && p.line === from.line && p.ply === from.ply && legal(lines[i]) > 0) return land(lines, { line: i, ply: 1 }, 1);
    }
    const ply = Math.min(from.ply + 1, legal(lines[from.line]));
    if (ply >= 1) return land(lines, { line: from.line, ply }, 1);
    top = from.line;
  }
  for (let i = top - 1; i >= 0; i--) if (!lines[i]!.parent && legal(lines[i]) > 0) return land(lines, { line: i, ply: 1 }, 1);
  return undefined;
}

/** The last move of the last line that has one legal move, if any (past passes, going back). */
export function lastCursor(lines: readonly PlayedLine[]): Cursor | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const n = legal(lines[i]);
    const c = n > 0 ? land(lines, { line: i, ply: n }, -1) : undefined;
    if (c) return c;
  }
  return undefined;
}

/**
 * The positions from the game's start to a line's move (`ply` moves in), for the engine and the
 * explorer following a previewed line (the owner's request, 2026-11-26): `to`, the positions up to
 * the commented move, as far as where the line starts (that move's position, or the one before it
 * for a line that replaces it), then the line's own. Only the line's when it starts at neither.
 */
export function lineHistory(line: PlayedLine, ply: number, to: readonly Position[]): Position[] {
  const start = outerStart(line);
  if (!start || !line.positions.length) return [];
  const fen = makeFen(start.toSetup());
  const at = [to.length - 1, to.length - 2].find((i) => i >= 0 && makeFen(to[i]!.toSetup()) === fen);
  return [...(at === undefined ? [] : to.slice(0, at)), ...(line.lead?.positions ?? []), ...line.positions.slice(0, Math.max(0, Math.min(ply, line.ucis.length)) + 1)];
}

/**
 * How much of a line a folded comment shows (the owner's request, 2026-11-26: `(8... Qxd4)` for the
 * whole line): the index of its last move shown, its first that isn't a pass, so `(3. -- Nf6 …)`
 * folds to `(3. -- Nf6)`. Its branches go with the rest. Undefined when folding would hide nothing.
 */
export function foldedTo(line: CommentLine): number | undefined {
  const i = line.moves.findIndex((m) => m.san !== NULL_SAN);
  if (i < 0) return undefined;
  return i >= line.moves.length - 1 && !line.groups.some((g) => g.from >= line.moves[i]!.to) ? undefined : i;
}

/** A move of one comment among several: the comment's index and the cursor in its lines. */
export interface CommentsCursor {
  comment: number;
  cursor: Cursor;
}

/**
 * One step through every comment's lines, one comment after another (PLAN.md §5.198): within a
 * comment as `stepCursor` does, then on to the next comment's first move, or back to the previous
 * one's last. From nowhere (`at` undefined), 1 is the first move of all. Undefined past either end:
 * on from the last move, or back from the first.
 */
export function stepComments(comments: readonly (readonly PlayedLine[])[], at: CommentsCursor | undefined, dir: 1 | -1): CommentsCursor | undefined {
  if (at) {
    const lines = comments[at.comment];
    const next = lines && stepCursor(lines, at.cursor, dir);
    if (next && (next.line !== at.cursor.line || next.ply !== at.cursor.ply)) return { comment: at.comment, cursor: next };
  } else if (dir === -1) return undefined;
  const from = at ? at.comment + dir : 0;
  for (let i = from; i >= 0 && i < comments.length; i += dir) {
    const c = dir === 1 ? firstCursor(comments[i]!) : lastCursor(comments[i]!);
    if (c) return { comment: i, cursor: c };
  }
  return undefined;
}

/**
 * A comment's line as a sequence to save (PLAN.md §5.201): its start (FEN) and its moves, up to
 * the first pass (a drill has no passes). Undefined when it holds no move of `side`'s to ask: the
 * drill asks `side`'s moves, and a line opening with the other side's move plays that one first
 * (the analysis board's sequence starts after it, §5.74). A branch is taken from the start of the
 * line it is written in: the moves that lead to it, then its own.
 */
export function lineAsSequence(line: PlayedLine, side: Color): { fen: string; sans: string[] } | undefined {
  const start = outerStart(line);
  if (!start || !line.positions.length) return undefined;
  const all = sansFromStart(line);
  const pass = all.indexOf(NULL_SAN);
  const sans = pass < 0 ? all : all.slice(0, pass);
  if (sans.length < (start.turn === side ? 1 : 2)) return undefined;
  return { fen: makeFen(start.toSetup()), sans };
}
