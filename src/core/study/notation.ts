// The notation as Qchess's study page lays it out (PLAN.md §4.11, D21): the main line in rows of
// two moves under a move number, broken by its comments and its variations, each on rows of
// their own. A variation runs inline; where it forks, every continuation becomes a branch on its
// own indented line, the first one first. Moves are numbered as Qchess numbers them: "N." before
// each White move, "N..." before a Black move only at the start of a line or a branch.
import { glyphSymbol } from '../pgn/nags.ts';
import type { Chapter, MoveNode } from './model.ts';
import { startPosition, type Path } from './tree.ts';

export interface Move {
  path: Path;
  key: string;
  san: string;
  glyphs: string;
}

/** A main-line cell: a move, a gap ("…", the row was broken), or nothing (the line ended). */
export type Cell = Move | 'gap' | 'none';

export type Row =
  | { kind: 'pair'; number: number; white: Cell; black: Cell }
  | { kind: 'comment'; path: Path; text: string }
  | { kind: 'variation'; line: Line };

export type Inline = ({ kind: 'move'; number: string | undefined } & Move) | { kind: 'comment'; path: Path; text: string };

/** A variation, or a branch of one: its moves and comments, then its branches where it forks. */
export interface Line {
  depth: number;
  items: Inline[];
  branches: Line[];
}

/** A path as one string, for keys and lookups. */
export const pathKey = (path: Path) => path.join(' ');

const moveOf = (node: MoveNode, path: Path): Move => ({ path, key: pathKey(path), san: node.san, glyphs: node.nags.map(glyphSymbol).join('') });

export function notation(chapter: Chapter): Row[] {
  const pos = startPosition(chapter);
  let ply = pos ? (pos.fullmoves - 1) * 2 + (pos.turn === 'white' ? 1 : 2) : 1;
  const rows: Row[] = chapter.root.comments.map((text) => ({ kind: 'comment', path: [], text }));
  let row: Extract<Row, { kind: 'pair' }> | undefined;
  const close = (black: Cell) => {
    if (!row) return;
    if (row.black === 'none') row.black = black;
    rows.push(row);
    row = undefined;
  };
  let path: Path = [];
  let siblings = chapter.root.children.slice(1);
  for (let node = chapter.root.children[0]; node; node = node.children[0]) {
    const before = path;
    path = [...path, node.san];
    const white = ply % 2 === 1;
    const number = Math.ceil(ply / 2);
    if (node.startingComments.length) {
      close('gap');
      for (const text of node.startingComments) rows.push({ kind: 'comment', path, text });
    }
    if (white) {
      close('gap');
      row = { kind: 'pair', number, white: moveOf(node, path), black: 'none' };
    } else {
      row ??= { kind: 'pair', number, white: 'gap', black: 'none' };
      row.black = moveOf(node, path);
    }
    if (!white || node.comments.length || siblings.length) close('gap');
    for (const text of node.comments) rows.push({ kind: 'comment', path, text });
    for (const v of siblings) rows.push({ kind: 'variation', line: line(v, ply, before, 0) });
    siblings = node.children.slice(1);
    ply++;
  }
  close('none');
  return rows;
}

function line(start: MoveNode, startPly: number, before: Path, depth: number): Line {
  const items: Inline[] = [];
  let node = start;
  let ply = startPly;
  let path = before;
  for (;;) {
    path = [...path, node.san];
    for (const text of node.startingComments) items.push({ kind: 'comment', path, text });
    const white = ply % 2 === 1;
    const number = white ? `${(ply + 1) / 2}.` : ply === startPly ? `${ply / 2}...` : undefined;
    items.push({ kind: 'move', number, ...moveOf(node, path) });
    for (const text of node.comments) items.push({ kind: 'comment', path, text });
    if (node.children.length > 1) {
      const at = path;
      return { depth, items, branches: node.children.map((c) => line(c, ply + 1, at, depth + 1)) };
    }
    const next = node.children[0];
    if (!next) return { depth, items, branches: [] };
    node = next;
    ply++;
  }
}
