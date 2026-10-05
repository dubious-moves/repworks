// PGN to the study model (PLAN.md §4.5). chessops parses (with emptyHeaders, so only the
// headers present are kept, in order); every move is replayed from the start position:
// - an illegal move is cut with everything after it, and reported;
// - SAN is rewritten as chessops writes it (Chessable's Ndb5 becomes Nb5), and reported;
// - siblings that end up identical are merged, as lila does on import, but without dropping
//   the second one's comments, shapes or glyphs; reported.
import { parsePgn, emptyHeaders, parseVariant, startingPosition, type ChildNode, type Game, type PgnNodeData } from 'chessops/pgn';
import { makeSan, parseSan } from 'chessops/san';
import type { Position } from 'chessops/chess';
import { dedupeShapes, LICHESS_COMMENT_LIMIT, parseComment } from './comment.ts';
import { mergeNags } from './nags.ts';
import type { Chapter, MoveNode, NodeData, RootNode } from '../study/model.ts';

export type ImportNote =
  | { kind: 'illegal'; path: string[]; san: string }
  | { kind: 'canonical'; path: string[]; from: string }
  | { kind: 'merged'; path: string[] }
  | { kind: 'long-comment'; path: string[]; length: number };

export type ChapterParse =
  | { ok: true; chapter: Chapter; notes: ImportNote[] }
  | { ok: false; reason: string; headers: [string, string][] };

/** Every game in a PGN text, each as a chapter or a reason it can't be one. */
export function parseGames(text: string, nextId: () => string): ChapterParse[] {
  return parsePgn(text, emptyHeaders).map((game) => chapterFromGame(game, nextId()));
}

/** A data-repo chapter file: exactly one game. */
export function parseChapterFile(text: string, id: string): ChapterParse {
  const games = parsePgn(text, emptyHeaders);
  if (games.length !== 1) return { ok: false, reason: games.length === 0 ? 'no game in the file' : `${games.length} games in one chapter file`, headers: [] };
  return chapterFromGame(games[0]!, id);
}

export function chapterFromGame(game: Game<PgnNodeData>, id: string): ChapterParse {
  const headers = [...game.headers] as [string, string][];
  if (parseVariant(game.headers.get('Variant')) !== 'chess') {
    return { ok: false, reason: `only standard chess is supported, not ${game.headers.get('Variant')}`, headers };
  }
  const start = startingPosition(game.headers);
  if (start.isErr) return { ok: false, reason: `the start position is invalid: ${start.error.message}`, headers };
  const notes: ImportNote[] = [];
  const root: RootNode = { ...nodeData(game.comments, undefined, undefined, [], notes), children: [] };
  root.children = convert(game.moves.children, start.value, [], notes);
  return { ok: true, chapter: { id, headers, root }, notes };
}

function convert(children: ChildNode<PgnNodeData>[], pos: Position, path: string[], notes: ImportNote[]): MoveNode[] {
  const out: MoveNode[] = [];
  for (const child of children) {
    const move = parseSan(pos, child.data.san);
    if (!move) {
      notes.push({ kind: 'illegal', path, san: child.data.san });
      continue;
    }
    const san = makeSan(pos, move);
    const here = [...path, san];
    // A writer that leaves out or misplaces "+" and "#" isn't worth a note.
    if (withoutCheck(san) !== withoutCheck(child.data.san)) notes.push({ kind: 'canonical', path: here, from: child.data.san });
    const after = pos.clone();
    after.play(move);
    out.push({ san, ...nodeData(child.data.comments, child.data.nags, child.data.startingComments, here, notes), children: convert(child.children, after, here, notes) });
  }
  return mergeSiblings(out, path, notes);
}

const withoutCheck = (san: string) => san.replace(/[+#]$/, '');

function nodeData(comments: string[] | undefined, nags: number[] | undefined, starting: string[] | undefined, path: string[], notes: ImportNote[]): NodeData {
  const data: NodeData = { comments: [], shapes: [], nags: [...(nags ?? [])], startingComments: [] };
  for (const raw of comments ?? []) {
    const c = parseComment(raw);
    if (c.text.trim() !== '') data.comments.push(c.text);
    data.shapes.push(...c.shapes);
    if (c.clock !== undefined) data.clock ??= c.clock;
    if (c.emt !== undefined) data.emt ??= c.emt;
    if (c.eval !== undefined) data.eval ??= c.eval;
  }
  data.comments = joinLikeExport(data.comments);
  data.shapes = dedupeShapes(data.shapes);
  for (const raw of starting ?? []) if (raw.trim() !== '') data.startingComments.push(raw);
  for (const text of data.comments) if (text.length > LICHESS_COMMENT_LIMIT) notes.push({ kind: 'long-comment', path, length: text.length });
  return data;
}

/**
 * lila's export replaces every "] } { [" with "] [" (Annotator.toPgnString), so two text
 * comments where the first ends with "]" and the next starts with "[" come back as one. They are
 * joined here as that would join them, so that writing and reading again changes nothing.
 */
function joinLikeExport(texts: string[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    const last = out[out.length - 1];
    if (last !== undefined && last.endsWith(']') && text.startsWith('[')) out[out.length - 1] = `${last} ${text}`;
    else out.push(text);
  }
  return out;
}

function mergeSiblings(nodes: MoveNode[], path: string[], notes: ImportNote[]): MoveNode[] {
  const out: MoveNode[] = [];
  for (const node of nodes) {
    const same = out.find((n) => n.san === node.san);
    if (!same) {
      out.push(node);
      continue;
    }
    notes.push({ kind: 'merged', path: [...path, node.san] });
    for (const c of node.comments) if (!same.comments.includes(c)) same.comments.push(c);
    for (const c of node.startingComments) if (!same.startingComments.includes(c)) same.startingComments.push(c);
    same.shapes = dedupeShapes([...same.shapes, ...node.shapes]);
    same.nags = mergeNags(same.nags, node.nags);
    if (same.clock === undefined && node.clock !== undefined) same.clock = node.clock;
    if (same.emt === undefined && node.emt !== undefined) same.emt = node.emt;
    if (same.eval === undefined && node.eval !== undefined) same.eval = node.eval;
    same.children = mergeSiblings([...same.children, ...node.children], [...path, node.san], notes);
  }
  return out;
}
