// Clickable lines in comments (PLAN.md §5.12), after q_extension's `clParse` and `clStartFen`,
// rebuilt from the plan's description (q_extension's source wasn't at hand when this was built):
// - A line is a group in parentheses that starts with a move number, `(7. Bc4 Qa5)` or
//   `(6... Nbd7 7. Bc4)`, and holds only moves, move numbers and glyphs. A group holding anything
//   else is a remark, `(with braces typed as parens)`, and stays text.
// - A line starts at the commented move's position when its first move number and side are that
//   position's; else at the position before the move, as an alternative to it. When the first
//   move is legal only in the other of the two, it starts there. Moves are played with chessops,
//   as far as they are legal.
// - Line jumping (q_extension v1.13.1): a cursor runs through a comment's lines end to end,
//   skipping lines whose first move is illegal; stepping back before the first line leaves.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { makeUci } from 'chessops/util';

export interface CommentMove {
  /** The move as chessops reads it: glyphs and check marks off, `0-0` as `O-O`. */
  san: string;
  /** Where the move is written in the comment: `text.slice(from, to)`. */
  from: number;
  to: number;
}

export interface CommentLine {
  /** The group, parentheses included. */
  from: number;
  to: number;
  /** The first move's number and side. */
  number: number;
  turn: Color;
  moves: CommentMove[];
}

const NUMBER = /^(\d+)(\.\.\.|…|\.)(.*)$/;
const SAN = /^(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=?[NBRQ])?|O-O(?:-O)?|0-0(?:-0)?)[+#]?[!?]*$/;
const GLYPH = /^(?:[!?]{1,2}|\$\d{1,3})$/;

const clean = (token: string) => token.replace(/[!?]+$/, '').replace(/[+#]$/, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');

/** One group's moves, or undefined when it is a remark. `at` is the group's inner text offset. */
function parseGroup(inner: string, at: number): Omit<CommentLine, 'from' | 'to'> | undefined {
  const moves: CommentMove[] = [];
  let first: { number: number; turn: Color } | undefined;
  for (const m of inner.matchAll(/\S+/g)) {
    let token = m[0];
    let offset = at + m.index;
    const numbered = NUMBER.exec(token);
    if (numbered) {
      const turn: Color = numbered[2] === '.' ? 'white' : 'black';
      if (!first && moves.length === 0) first = { number: Number(numbered[1]), turn };
      token = numbered[3]!;
      offset += numbered[1]!.length + numbered[2]!.length;
      if (token === '') continue;
    } else if (!first) return undefined;
    if (GLYPH.test(token)) continue;
    if (!SAN.test(token)) return undefined;
    // The glyphs written on a move stay text; the move is the rest.
    const bare = token.replace(/[!?]+$/, '');
    moves.push({ san: clean(token), from: offset, to: offset + bare.length });
  }
  return first && moves.length ? { ...first, moves } : undefined;
}

/** Every line written in a comment, in order. */
export function parseCommentLines(text: string): CommentLine[] {
  const out: CommentLine[] = [];
  for (const m of text.matchAll(/\(([^()]*)\)/g)) {
    const group = parseGroup(m[1]!, m.index + 1);
    if (group) out.push({ from: m.index, to: m.index + m[0].length, ...group });
  }
  return out;
}

const fits = (line: CommentLine, pos: Position) => pos.fullmoves === line.number && pos.turn === line.turn;
const legalFirst = (line: CommentLine, pos: Position) => parseSan(pos, line.moves[0]!.san) !== undefined;

/**
 * Where a line starts: `after` is the commented move's position (the chapter's start for a
 * comment before the first move), `before` the position before it (none at the start).
 */
export function lineStart(line: CommentLine, after: Position, before: Position | undefined): Position {
  const chosen = fits(line, after) || !before ? after : before;
  const other = chosen === after ? before : after;
  if (other && !legalFirst(line, chosen) && legalFirst(line, other)) return other.clone();
  return chosen.clone();
}

export interface PlayedLine {
  line: CommentLine;
  /** positions[0] is the start; positions[i] follows the line's first i moves. */
  positions: Position[];
  /** The legal moves played, as UCI (for the board's last move) and canonical SAN. */
  ucis: string[];
  sans: string[];
}

/** A line played from its start, as far as its moves are legal. */
export function playLine(line: CommentLine, start: Position): PlayedLine {
  const pos = start.clone();
  const out: PlayedLine = { line, positions: [pos.clone()], ucis: [], sans: [] };
  for (const m of line.moves) {
    const move = parseSan(pos, m.san);
    if (!move) break;
    out.sans.push(makeSan(pos, move));
    out.ucis.push(makeUci(move));
    pos.play(move);
    out.positions.push(pos.clone());
  }
  return out;
}

/** Every line of a comment, played from where each starts. */
export function playedLines(text: string, after: Position, before: Position | undefined): PlayedLine[] {
  return parseCommentLines(text).map((line) => playLine(line, lineStart(line, after, before)));
}

/** A move of a comment's lines: the line's index and how many of its moves are played (1 or more). */
export interface Cursor {
  line: number;
  ply: number;
}

const legal = (l: PlayedLine | undefined) => l?.ucis.length ?? 0;

/** The first move of the first line that has one legal move, if any. */
export function firstCursor(lines: readonly PlayedLine[]): Cursor | undefined {
  const i = lines.findIndex((l) => legal(l) > 0);
  return i < 0 ? undefined : { line: i, ply: 1 };
}

/**
 * One step through a comment's lines end to end: within a line, then on from its last move to the
 * next line's first, or back from its first move to the previous line's last. Lines with no
 * legal move are skipped. Undefined: stepping back from the first line's first move (leave the
 * lines). At the last line's last move, → stays.
 */
export function stepCursor(lines: readonly PlayedLine[], c: Cursor, dir: 1 | -1): Cursor | undefined {
  const ply = c.ply + dir;
  if (ply >= 1 && ply <= legal(lines[c.line])) return { line: c.line, ply };
  for (let i = c.line + dir; i >= 0 && i < lines.length; i += dir) {
    const n = legal(lines[i]);
    if (n > 0) return { line: i, ply: dir === 1 ? 1 : n };
  }
  return dir === 1 ? c : undefined;
}

/** The cursor at a move of the comment's text (its line and index), clamped to what is legal. */
export function cursorAt(lines: readonly PlayedLine[], line: number, move: number): Cursor | undefined {
  const n = legal(lines[line]);
  return n === 0 ? undefined : { line, ply: Math.min(move + 1, n) };
}
