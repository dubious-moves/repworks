// The study model to PGN in Lichess's dialect (PLAN.md §4.5), following scalachess's
// Pgn.toString, PgnNodeEncoder and Move.appendSanStr, lila's study PgnDump and
// Annotator.toPgnString, as read on 2026-10-05:
// - headers in their stored order, then a blank line; root comments as `{ a } { b }` and a
//   newline;
// - `N. ` before White's moves; `N... ` before Black's only at the start of a line or a
//   variation, or after a move with a comment or variations;
// - glyphs 1-6 as a SAN suffix, others as ` $n`;
// - per move: ` { [%eval …] }`, each text comment, ` { [%csl …][%cal …] }`, ` { [%clk …] }`;
// - variations as ` (…)`; all on one line; then ` <Result>` when there is a Result header;
// - finally every "] } { [" becomes "] [", as lila's export does.
// A chapter file is this text and a newline (see chapterFileText).
import { parseFen } from 'chessops/fen';
import { header, type Chapter, type MoveNode, type NodeData } from '../study/model.ts';
import { clockCommand, shapesCommand } from './comment.ts';
import { SUFFIX } from './nags.ts';

export function writeChapter(chapter: Chapter): string {
  let out = '';
  if (chapter.headers.length) out += `${chapter.headers.map(([k, v]) => `[${k} "${escapeHeader(v)}"]`).join('\n')}\n\n`;
  const rootBlocks = commentBlocks(chapter.root);
  if (rootBlocks.length) out += `{ ${rootBlocks.join(' } { ')} }\n`;
  const [first, ...variations] = chapter.root.children;
  if (first) out += renderLine(first, variations, firstPly(chapter), false);
  const result = header(chapter, 'Result');
  if (result !== undefined) out += ` ${result}`;
  return out.split('] } { [').join('] [');
}

/** The bytes of a chapter's file in the data repo. */
export const chapterFileText = (chapter: Chapter) => `${writeChapter(chapter)}\n`;

const escapeHeader = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// scalachess's ply: the first move's ply is odd when White plays it. A FEN that doesn't parse
// can't reach here: such a chapter is refused when it is read.
function firstPly(chapter: Chapter): number {
  const fen = header(chapter, 'FEN');
  if (!fen) return 1;
  const setup = parseFen(fen);
  if (setup.isErr) return 1;
  return (setup.value.fullmoves - 1) * 2 + (setup.value.turn === 'white' ? 0 : 1) + 1;
}

const isWhite = (ply: number) => ply % 2 === 1;
const moveNumber = (ply: number) => (isWhite(ply) ? (ply + 1) / 2 : ply / 2);

function renderLine(start: MoveNode, startVariations: MoveNode[], startPly: number, isVariation: boolean): string {
  let out = '';
  let node = start;
  let variations = startVariations;
  let ply = startPly;
  // At the start of a line Black's move is numbered.
  let force = !isWhite(ply);
  if (isVariation) for (const c of node.startingComments) out += ` { ${safe(c)} } `;
  for (;;) {
    if (isWhite(ply)) out += `${moveNumber(ply)}. `;
    else if (force) out += `${moveNumber(ply)}... `;
    out += node.san + glyphs(node.nags);
    const blocks = commentBlocks(node);
    for (const b of blocks) out += ` { ${b} }`;
    for (const v of variations) out += ` (${renderLine(v, [], ply, true)})`;
    const next = node.children[0];
    if (!next) return out;
    out += ' ';
    force = !isWhite(ply) || blocks.length > 0 || variations.length > 0;
    variations = node.children.slice(1);
    node = next;
    ply++;
  }
}

// Glyphs 1-6 as a suffix, as scalachess writes them, except right after another suffix:
// "!" then "?" would read back as "!?". Lichess never has two move glyphs on one move.
function glyphs(nags: readonly number[]): string {
  let out = '';
  let afterSuffix = false;
  for (const nag of nags) {
    const suffix = SUFFIX[nag];
    if (suffix !== undefined && !afterSuffix) out += suffix;
    else out += ` $${nag}`;
    afterSuffix = suffix !== undefined && !afterSuffix;
  }
  return out;
}

/** A node's comment blocks in the order lila writes them: eval, texts, shapes, clock. */
function commentBlocks(data: NodeData): string[] {
  const blocks: string[] = [];
  if (data.eval !== undefined) blocks.push(`[%eval ${data.eval}]`);
  for (const text of data.comments) blocks.push(safe(text));
  const shapes = shapesCommand(data.shapes);
  if (shapes) blocks.push(shapes);
  const clock = clockCommand(data.clock, data.emt);
  if (clock) blocks.push(clock);
  return blocks;
}

// A "}" would end the comment early. Text read from PGN can't contain one, and edits are
// sanitized, so this only guards against a bug elsewhere.
const safe = (text: string) => text.replace(/\}/g, '');
