// The notation as Lichess shows it (PLAN.md §4.11): the main line with its variations inline in
// brackets, and the comments where they stand. Laid out here as a flat list of tokens, numbered
// by the same rules as the PGN writer: "N." before White's moves, "N..." before Black's only at
// the start of a line or after a comment or a variation.
import { glyphSymbol } from '../pgn/nags.ts';
import type { Chapter, MoveNode, NodeData } from './model.ts';
import { startPosition, type Path } from './tree.ts';

export type Token =
  | { kind: 'move'; path: Path; key: string; number: string | undefined; san: string; glyphs: string; mainline: boolean }
  | { kind: 'comment'; path: Path; text: string }
  | { kind: 'open' }
  | { kind: 'close' };

/** A path as one string, for keys and lookups. */
export const pathKey = (path: Path) => path.join(' ');

export function notation(chapter: Chapter): Token[] {
  const pos = startPosition(chapter);
  const firstPly = pos ? (pos.fullmoves - 1) * 2 + (pos.turn === 'white' ? 1 : 2) : 1;
  const out: Token[] = [];
  comments(out, [], chapter.root);
  const [first, ...variations] = chapter.root.children;
  if (first) line(out, first, variations, firstPly, [], true);
  return out;
}

function comments(out: Token[], path: Path, data: NodeData): boolean {
  for (const text of data.comments) out.push({ kind: 'comment', path, text });
  return data.comments.length > 0;
}

function line(out: Token[], start: MoveNode, startVariations: MoveNode[], startPly: number, before: Path, mainline: boolean): void {
  let node = start;
  let variations = startVariations;
  let ply = startPly;
  let path: Path = before;
  let force = ply % 2 === 0;
  for (;;) {
    path = [...path, node.san];
    for (const text of node.startingComments) out.push({ kind: 'comment', path, text });
    const white = ply % 2 === 1;
    const number = white ? `${(ply + 1) / 2}.` : force ? `${ply / 2}...` : undefined;
    out.push({ kind: 'move', path, key: pathKey(path), number, san: node.san, glyphs: node.nags.map(glyphSymbol).join(''), mainline });
    // The writer gives shapes, eval and clocks comment blocks of their own, which also number Black.
    const commented = comments(out, path, node) || node.shapes.length > 0 || node.eval !== undefined || node.clock !== undefined || node.emt !== undefined;
    for (const v of variations) {
      out.push({ kind: 'open' });
      line(out, v, [], ply, path.slice(0, -1), false);
      out.push({ kind: 'close' });
    }
    const next = node.children[0];
    if (!next) return;
    force = commented || variations.length > 0;
    variations = node.children.slice(1);
    node = next;
    ply++;
  }
}
