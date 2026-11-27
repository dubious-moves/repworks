// Lines from the comments quizzed in review (the owner's request, 2026-10-12): the clickable lines
// (§5.12) written in the comments along a repertoire line, played on the board at the walk's end
// as the trainer plays a line, the user finding their side's moves. Which lines are quizzed:
// - A line that starts with the opponent's move: the opponent's other try, or how they go on. A
//   line starting with an own move answers a position the trainer asks the user about.
// - None of the line's own moves is marked `?`, `??` or `?!` (the first character is `?`): such a
//   line shows what not to play. `!?` is kept; an opponent's move marked `?` is the premise of a
//   line about punishing it.
// - The moves quizzed are the line's as written, as far as they are one line: up to a pass (`--`,
//   a plan rather than moves), a move whose printed number isn't the position's (the author went
//   back to write another branch), an illegal move, or an own move where the repertoire plays
//   another (the quiz never asks a move the repertoire answers differently). At least one own
//   move must be left.
// - Not a line the repertoire already holds: when every own move it asks is a card, the line is
//   trained as the repertoire's own.
// - Important: the first move is marked `!` or `!!`.
// - A branch written inside a line (PLAN.md §5.217) is quizzed as a line of its own, from the
//   start of the line it is written in: that line's moves up to the branch, then the branch's. So
//   every end is one line, as when each was written out from the commented move. The rules above
//   are read over the whole of it; its label and its mark are its own first move's.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { isNormal, type Color } from 'chessops/types';
import { positionKeyOf } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import { repertoireCard } from '../progress/cards.ts';
import { NULL_SAN, parseCommentLines, type CommentLine } from '../repertoire/lines.ts';
import type { RepertoireIndex } from '../repertoire/index.ts';
import type { Chapter, MoveNode } from '../study/model.ts';
import { startPosition, type TreeNode } from '../study/tree.ts';

export interface QuizLine {
  /** The line's identity: its start position and moves, so a line written twice is quizzed once. */
  key: string;
  /** Where it starts on the repertoire line: the board after this many of the line's moves. */
  ply: number;
  /** The moves quizzed, as SAN and standard UCI, and which are the trained side's. */
  sans: string[];
  ucis: string[];
  own: boolean[];
  /** positions[0] is the start; positions[i] follows the first i moves. */
  positions: Position[];
  /** The first move as written in the comment, numbered: `5. c3!`. */
  label: string;
  /** The first move is marked `!` or `!!`. */
  important: boolean;
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');
const fits = (line: CommentLine, pos: Position) => pos.fullmoves === line.number && pos.turn === line.turn;

/** Whether any of the line's moves by `side` is marked `?`, `??` or `?!`, counting sides as written. */
function marksMistake(line: CommentLine, side: Color): boolean {
  let turn = line.turn;
  for (const m of line.moves) {
    if (m.printed) turn = m.printed.turn;
    if (turn === side && m.glyph?.startsWith('?')) return true;
    turn = other(turn);
  }
  return false;
}

/**
 * A comment's line as quizzed from `start`, or undefined when it isn't quizzed (the rules above).
 * `lead`: for a branch, how many of the moves lead to it; the quiz must get past them.
 */
export function quizLine(line: CommentLine, start: Position, ply: number, side: Color, index: RepertoireIndex, lead = 0): QuizLine | undefined {
  if (start.turn === side || marksMistake(line, side)) return undefined;
  const pos = start.clone();
  const out: QuizLine = { key: '', ply, sans: [], ucis: [], own: [], positions: [pos.clone()], label: '', important: false };
  for (const m of line.moves) {
    if (m.san === NULL_SAN) break;
    if (m.printed && (m.printed.number !== pos.fullmoves || m.printed.turn !== pos.turn)) break;
    const move = parseSan(pos, m.san);
    if (!move || !isNormal(move)) break;
    const uci = standardUci(pos, move);
    const own = pos.turn === side;
    if (own) {
      const there = index.positions.get(positionKeyOf(pos))?.own;
      if (there && there.size > 0 && !there.has(uci)) break;
    }
    out.sans.push(makeSan(pos, move));
    out.ucis.push(uci);
    out.own.push(own);
    pos.play(move);
    out.positions.push(pos.clone());
  }
  if (!out.own.includes(true) || out.sans.length <= lead) return undefined;
  // In the repertoire already: each own move is a card where the line plays it.
  if (out.own.every((own, i) => !own || index.cards.has(repertoireCard(positionKeyOf(out.positions[i]!), out.ucis[i]!)))) return undefined;
  const first = line.moves[lead]!;
  const from = out.positions[lead]!;
  out.key = `${positionKeyOf(start)}|${out.ucis.join(' ')}`;
  out.label = `${from.fullmoves}${from.turn === 'white' ? '.' : '...'} ${out.sans[lead]}${first.glyph ?? ''}`;
  out.important = first.glyph === '!' || first.glyph === '!!';
  return out;
}

/**
 * The lines quizzed from the comments along a repertoire line of `chapter` (its moves `path`), in
 * the order met: by where they start, then as written. A line is placed as a clickable line is
 * (§5.12): at the commented move's position, or the one before it when it replaces the move.
 */
export function quizLinesOf(chapter: Chapter, path: readonly string[], side: Color, index: RepertoireIndex): QuizLine[] {
  const start = startPosition(chapter);
  if (!start) return [];
  const positions: Position[] = [start.clone()];
  const nodes: TreeNode[] = [chapter.root];
  const pos = start.clone();
  for (const san of path) {
    const node: MoveNode | undefined = nodes.at(-1)!.children.find((c) => c.san === san);
    const move = node && parseSan(pos, san);
    if (!node || !move) break;
    pos.play(move);
    positions.push(pos.clone());
    nodes.push(node);
  }
  const out: QuizLine[] = [];
  const seen = new Set<string>();
  nodes.forEach((node, d) => {
    const after = positions[d]!;
    const before = d > 0 ? positions[d - 1] : undefined;
    for (const text of [...node.startingComments, ...node.comments]) {
      // Each line from the start of the outermost line it is written in: where that starts on the
      // repertoire line, the moves from there, and how many of them lead to the line's own.
      const whole: ({ at: number; line: CommentLine; lead: number } | undefined)[] = [];
      for (const line of parseCommentLines(text, false)) {
        const up = line.parent && whole[line.parent.line];
        // A branch starts where the line around it has the branch's number and side, by the moves written before it.
        const plies = up ? 2 * (line.number - up.line.number) + (line.turn === 'black' ? 1 : 0) - (up.line.turn === 'black' ? 1 : 0) : -1;
        const upOwn = up ? up.line.moves.length - up.lead : 0;
        if (up && line.parent && plies >= up.lead && plies <= up.lead + Math.min(line.parent.after, upOwn)) {
          whole.push({ at: up.at, line: { ...line, number: up.line.number, turn: up.line.turn, moves: [...up.line.moves.slice(0, plies), ...line.moves] }, lead: plies });
          continue;
        }
        const at = fits(line, after) ? d : before && fits(line, before) ? d - 1 : undefined;
        whole.push(at === undefined ? undefined : { at, line, lead: 0 });
      }
      for (const w of whole) {
        const q = w && quizLine(w.line, positions[w.at]!, w.at, side, index, w.lead);
        if (!q || seen.has(q.key)) continue;
        seen.add(q.key);
        out.push(q);
      }
    }
  });
  return out.sort((a, b) => a.ply - b.ply);
}
