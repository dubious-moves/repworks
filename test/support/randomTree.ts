// Random legal chapters for property tests: trees of legal moves from a few start positions,
// with comments, shapes, glyphs, evals and clocks drawn from a seeded source.
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { NormalMove, SquareName } from 'chessops/types';
import { makeSquare } from 'chessops/util';
import type { Brush, Chapter, MoveNode, NodeData, Shape } from '../../src/core/study/model.ts';

export type Random = () => number;

const STARTS = [
  undefined,
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  'r3k2r/ppp2ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPP2PPP/R3K2R w KQkq - 4 8',
  '8/8/4k3/8/3PK3/8/8/8 b - - 0 40',
];

const WORDS = ['Plan', 'a4', 'idea', 'Nd5!', 'the', 'key', 'square', 'Café', 'naïve', '♞', '"quoted"', '(paren)', 'x{y', '<tag>', '½', '±', '1...', 'f5', '[x]'];
const BRUSHES: Brush[] = ['green', 'red', 'yellow', 'blue'];
const NAGS = [1, 2, 3, 4, 5, 6, 7, 22, 10, 13, 14, 15, 16, 17, 18, 19, 146, 32, 36, 40, 132, 138, 44, 140, 11, 255];

export const pick = <T>(random: Random, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

/** Text a comment can hold after a parse: no "}", not blank, and no "[" start or "]" end. */
export function randomText(random: Random): string {
  const words: string[] = [];
  const n = 1 + Math.floor(random() * 6);
  for (let i = 0; i < n; i++) words.push(pick(random, WORDS));
  let text = words.join(random() < 0.2 ? '\n' : ' ');
  if (text.startsWith('[')) text = `x ${text}`;
  if (text.endsWith(']')) text = `${text} y`;
  return text;
}

function randomShapes(random: Random): Shape[] {
  const shapes: Shape[] = [];
  const n = random() < 0.6 ? 0 : 1 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) {
    const orig = makeSquare(Math.floor(random() * 64)) as SquareName;
    let dest: SquareName | undefined = random() < 0.5 ? undefined : (makeSquare(Math.floor(random() * 64)) as SquareName);
    if (dest === orig) dest = undefined;
    const shape: Shape = dest ? { brush: pick(random, BRUSHES), orig, dest } : { brush: pick(random, BRUSHES), orig };
    if (!shapes.some((s) => s.brush === shape.brush && s.orig === shape.orig && s.dest === shape.dest)) shapes.push(shape);
  }
  // Circles before arrows: the order the writer gives and the reader keeps.
  return [...shapes.filter((s) => !s.dest), ...shapes.filter((s) => s.dest)];
}

export function randomNodeData(random: Random, options: { clocks?: boolean } = {}): NodeData {
  const data: NodeData = { comments: [], shapes: randomShapes(random), nags: [], startingComments: [] };
  const comments = random() < 0.6 ? 0 : 1 + Math.floor(random() * 2);
  for (let i = 0; i < comments; i++) data.comments.push(randomText(random));
  if (random() < 0.3) {
    const nags = 1 + Math.floor(random() * 2);
    for (let i = 0; i < nags; i++) {
      const nag = pick(random, NAGS);
      if (!data.nags.includes(nag)) data.nags.push(nag);
    }
  }
  if (options.clocks !== false) {
    if (random() < 0.1) data.eval = pick(random, ['0.17', '-1.25', '#3', '#-2', '0.00,22']);
    if (random() < 0.1) data.clock = pick(random, ['0:03:00', '1:59:59', '0:00:07']);
    if (random() < 0.05) data.emt = pick(random, ['0:00:05', '0:01:30']);
  }
  return data;
}

function legalMoves(pos: Position): NormalMove[] {
  const moves: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) for (const to of dests) moves.push({ from, to });
  return moves;
}

export interface TreeOptions {
  maxDepth?: number;
  maxChildren?: number;
}

/** A random chapter: legal moves only, canonical SAN, distinct siblings. */
export function randomChapter(random: Random, id = 'Rand0001', options: TreeOptions = {}): Chapter {
  const fen = pick(random, STARTS);
  const pos = fen ? Chess.fromSetup(parseFen(fen).unwrap()).unwrap() : Chess.default();
  const headers: [string, string][] = [
    ['Event', `Random "${id}" \\ test`],
    ['Result', '*'],
    ['ChapterName', pick(random, ['Main', 'Sidelines', 'Endgame'])],
    ['Orientation', pick(random, ['white', 'black'])],
  ];
  if (fen) headers.push(['FEN', fen], ['SetUp', '1']);
  // Before the first move PGN carries comments and shapes, nothing else.
  const rootData = { ...randomNodeData(random, { clocks: false }), nags: [] };
  return { id, headers, root: { ...rootData, startingComments: [], children: randomChildren(random, pos, 0, options) } };
}

function randomChildren(random: Random, pos: Position, depth: number, options: TreeOptions): MoveNode[] {
  const maxDepth = options.maxDepth ?? 10;
  if (depth >= maxDepth || pos.isEnd()) return [];
  const moves = legalMoves(pos);
  const count = random() < 0.75 ? 1 : 1 + Math.floor(random() * (options.maxChildren ?? 3));
  const children: MoveNode[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const move = pick(random, moves);
    const san = makeSan(pos, move);
    if (used.has(san)) continue;
    used.add(san);
    const after = pos.clone();
    after.play(move);
    const data = randomNodeData(random);
    // Only a variation's first move can carry comments before it.
    if (i > 0 && random() < 0.2) data.startingComments.push(randomText(random));
    children.push({ san, ...data, children: randomChildren(random, after, depth + 1, options) });
  }
  return children;
}
