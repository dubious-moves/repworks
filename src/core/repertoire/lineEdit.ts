// A comment's lines written from the board (PLAN.md §5.217, the owner's request, 2026-11-27): a
// move played while a line is shown goes into the comment's text, and a line can be started with
// no text typed.
// - On the line's last move, the move is written at its end: `(8... Qxd4 9. Nb5)` + Qb4+ is
//   `(8... Qxd4 9. Nb5 Qb4+)`. After words or a branch it carries its number, so the line goes on.
// - In the middle, the line's own next move is stepped to and a branch that already starts with
//   the move is entered: nothing is written. Any other move is a new branch, written in
//   parentheses after the move it replaces and the branches already there, as PGN writes a
//   variation: `(8... Qxd4 9. Nb5 (9. Nc3) 9... Qb4+)`. The line's next move then carries its number.
// - A new line is a group at the end of the comment, numbered from the commented move's position:
//   `(8... Qxd4)`.
// - Deleting from a move takes it and the rest of its line; the branches written there that start
//   before it stay. From a line's first move (or with only passes before it), the whole group goes.
// Every result is read back with the reader of lines.ts, and refused when the move isn't where it
// should be: the text is never left with a line that doesn't play.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { NULL_SAN, playedLines, stepCursor, type Cursor, type PlayedLine } from './lines.ts';

export type LineEdit =
  /** `written`: whether the text changed (a move stepped to changes nothing). */
  { ok: true; text: string; cursor: Cursor; written: boolean } | { ok: false; error: string };

const fail = (error: string): LineEdit => ({ ok: false, error });
const fenOf = (pos: Position) => makeFen(pos.toSetup());

/** A move with its number: always for White's, for Black's unless it follows White's move directly (`bare`). */
const numbered = (pos: Position, san: string, bare: boolean) => (pos.turn === 'white' ? `${pos.fullmoves}. ${san}` : bare ? san : `${pos.fullmoves}... ${san}`);

/** The edit read back: the cursor's line and move must show `fen`. */
function checked(text: string, after: Position, before: Position | undefined, find: (lines: PlayedLine[]) => Cursor | undefined, fen: string): LineEdit {
  const lines = playedLines(text, after, before);
  const cursor = find(lines);
  const there = cursor && lines[cursor.line]?.positions[cursor.ply];
  if (!cursor || !there || fenOf(there) !== fen) return fail('the move could not be written into this line: edit the comment’s text instead');
  return { ok: true, text, cursor, written: true };
}

/**
 * A move played on the board at `cursor`, a move of one of the comment's lines: stepped to when
 * it is the line's next move or a branch's first, else written (at the line's end, or as a new
 * branch).
 */
export function playInLine(text: string, after: Position, before: Position | undefined, cursor: Cursor, san: string): LineEdit {
  const lines = playedLines(text, after, before);
  const l = lines[cursor.line];
  const pos = l?.positions[cursor.ply];
  if (!l || !pos || cursor.ply < 1 || cursor.ply > l.sans.length) return fail('no line to write the move into');
  const move = parseSan(pos, san);
  if (!move) return fail(`${san} is not a legal move here`);
  const canon = makeSan(pos, move);
  if (l.sans[cursor.ply] === canon) return { ok: true, text, cursor: { line: cursor.line, ply: cursor.ply + 1 }, written: false };
  const branch = lines.findIndex((b) => b.parent?.line === cursor.line && b.parent.ply === cursor.ply && b.sans[0] === canon);
  if (branch >= 0) return { ok: true, text, cursor: { line: branch, ply: 1 }, written: false };
  const then = pos.clone();
  then.play(move);
  const fen = fenOf(then);
  const cl = l.line;
  if (cursor.ply >= cl.moves.length) {
    // The line's end: before its closing bracket, after any words or branches written there.
    const at = cl.to - 1;
    const bare = /^[!?]*\s*$/.test(text.slice(cl.moves.at(-1)!.to, at));
    const next = `${text.slice(0, at).trimEnd()} ${numbered(pos, canon, bare)}${text.slice(at)}`;
    return checked(next, after, before, () => ({ line: cursor.line, ply: cursor.ply + 1 }), fen);
  }
  // A branch: after the move it replaces, that move's glyph, and the branches already written there.
  let at = cl.moves[cursor.ply]!.to;
  while (/[!?]/.test(text[at] ?? '')) at++;
  for (;;) {
    const g = cl.groups.find((x) => x.from >= at && !text.slice(at, x.from).trim());
    if (!g) break;
    at = g.to;
  }
  // The line's next move carries its number after a branch.
  const follower = cl.moves[cursor.ply + 1];
  const before2 = l.positions[cursor.ply + 1];
  const tail =
    follower && before2 && !follower.printed && !text.slice(at, follower.from).trim()
      ? ` ${before2.fullmoves}${before2.turn === 'white' ? '.' : '...'} ${text.slice(follower.from)}`
      : `${/^[\s)]/.test(text.slice(at)) ? '' : ' '}${text.slice(at)}`;
  const next = `${text.slice(0, at)} (${numbered(pos, canon, false)})${tail}`;
  return checked(
    next,
    after,
    before,
    (ls) => {
      const i = ls.findIndex((x) => x.line.from === at + 1);
      return i < 0 ? undefined : { line: i, ply: 1 };
    },
    fen,
  );
}

/**
 * A line started from the commented move's position with its first move (the comment's text may
 * be empty): a line of the comment that already starts there with the move is entered, else a new
 * group is written at the comment's end.
 */
export function startLine(text: string, after: Position, before: Position | undefined, san: string): LineEdit {
  const move = parseSan(after, san);
  if (!move) return fail(`${san} is not a legal move here`);
  const canon = makeSan(after, move);
  const start = fenOf(after);
  const there = playedLines(text, after, before).findIndex((l) => !l.parent && l.positions[0] && fenOf(l.positions[0]) === start && l.sans[0] === canon);
  if (there >= 0) return { ok: true, text, cursor: { line: there, ply: 1 }, written: false };
  const then = after.clone();
  then.play(move);
  const kept = text.trimEnd();
  const from = kept ? kept.length + 1 : 0;
  const next = `${kept}${kept ? ' ' : ''}(${numbered(after, canon, false)})`;
  return checked(
    next,
    after,
    before,
    (ls) => {
      const i = ls.findIndex((x) => x.line.from === from);
      return i < 0 ? undefined : { line: i, ply: 1 };
    },
    fenOf(then),
  );
}

export type LineCut =
  /** `cursor`: the move before the one deleted, when the line still has one to show. */
  { ok: true; text: string; cursor: Cursor | undefined } | { ok: false; error: string };

/**
 * The move at `cursor` deleted with the rest of its line. The branches written from there on that
 * start before the move stay (they are other choices to it); from the line's first move, the whole
 * group goes, its branches with it.
 */
export function deleteFromLine(text: string, after: Position, before: Position | undefined, cursor: Cursor): LineCut {
  const lines = playedLines(text, after, before);
  const l = lines[cursor.line];
  const m = l?.line.moves[cursor.ply - 1];
  if (!l || !m || cursor.ply > l.sans.length) return { ok: false, error: 'no move of a line to delete' };
  const cl = l.line;
  if (cl.moves.slice(0, cursor.ply - 1).every((x) => x.san === NULL_SAN)) {
    const head = text.slice(0, cl.from).trimEnd();
    const tail = text.slice(cl.to).trimStart();
    // Back to the move the branch left, when there is one.
    const back = l.parent && l.parent.ply >= 1 ? stepCursor(lines, { line: l.parent.line, ply: l.parent.ply + 1 }, -1) : undefined;
    return { ok: true, text: `${head}${head && tail && !tail.startsWith(')') && !head.endsWith('(') ? ' ' : ''}${tail}`, cursor: back };
  }
  const kept = lines
    .filter((b) => b.parent?.line === cursor.line && b.parent.ply < cursor.ply && b.line.from >= m.start)
    .map((b) => ` ${text.slice(b.line.from, b.line.to)}`)
    .join('');
  return { ok: true, text: `${text.slice(0, m.start).trimEnd()}${kept}${text.slice(cl.to - 1)}`, cursor: { line: cursor.line, ply: cursor.ply - 1 } };
}
