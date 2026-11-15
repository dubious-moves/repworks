// Opening names (PLAN.md §5.181): Lichess's chess-openings list (CC0), bundled with the site as
// vendor/openings/openings.tsv, one row a named line: its ECO code, its name, its moves in SAN
// from the start. A position is named by D10's key, so by any move order; a line of play is
// named by the last named position on it (Lichess's rule: back along the moves to the first name
// met). Pure: the list's text in, a book out.
import { Chess, type Position } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';

export interface Opening {
  /** The ECO code, "B90". */
  eco: string;
  /** "Sicilian Defense: Najdorf Variation". */
  name: string;
  /** The line the list gives for it, from the start. */
  sans: readonly string[];
  /** The position at the line's end. */
  key: PositionKey;
  /** The name as search reads it (`foldText`). */
  folded: string;
}

export interface OpeningBook {
  /** The list's rows in its order, the ones whose moves couldn't be played left out. */
  list: readonly Opening[];
  /** The first row at each position. */
  byKey: ReadonlyMap<PositionKey, Opening>;
  /** The longest line, in plies: no name lies further from the start than this. */
  longest: number;
}

/** Lower case, accents off: "grunfeld" finds "Grünfeld". */
export const foldText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface TrieNode {
  pos: Position;
  next: Map<string, TrieNode | null>;
}

/**
 * The book of the list's text. The rows share their first moves, so each move is played once (a
 * trie over the lines), not once a row. A row that isn't three fields, or whose moves aren't
 * legal, is left out.
 */
export function parseOpenings(text: string): OpeningBook {
  const root: TrieNode = { pos: Chess.default(), next: new Map() };
  const list: Opening[] = [];
  const byKey = new Map<PositionKey, Opening>();
  const keys = new Map<TrieNode, PositionKey>();
  let longest = 0;
  for (const row of text.split('\n')) {
    if (!row) continue;
    const [eco, name, moves] = row.split('\t');
    if (!eco || !name || !moves) continue;
    const sans = moves.split(' ');
    let node: TrieNode | null = root;
    for (const san of sans) {
      let child: TrieNode | null | undefined = node.next.get(san);
      if (child === undefined) {
        const move = parseSan(node.pos, san);
        if (move) {
          const pos = node.pos.clone();
          pos.play(move);
          child = { pos, next: new Map() };
        } else child = null;
        node.next.set(san, child);
      }
      node = child;
      if (!node) break;
    }
    if (!node) continue;
    let key = keys.get(node);
    if (!key) keys.set(node, (key = positionKeyOf(node.pos)));
    const opening: Opening = { eco, name, sans, key, folded: foldText(name) };
    list.push(opening);
    if (!byKey.has(key)) byKey.set(key, opening);
    if (sans.length > longest) longest = sans.length;
  }
  return { list, byKey, longest };
}

export interface NamedAt {
  opening: Opening;
  /** How many of the line's moves were played when the name was met (0: the start itself). */
  ply: number;
}

/**
 * The name of a line of play: the last named position on the way from `start` through `sans`,
 * the start itself included. A move that isn't legal ends the walk there. Undefined when no
 * position on the line has a name.
 */
export function openingOfLine(book: OpeningBook, start: Position | undefined, sans: readonly string[]): NamedAt | undefined {
  if (!start) return undefined;
  const pos = start.clone();
  let found: NamedAt | undefined;
  const first = book.byKey.get(positionKeyOf(pos));
  if (first) found = { opening: first, ply: 0 };
  // A board set up from a FEN may start anywhere, so the plies from the true start aren't known:
  // the walk goes as far as the longest named line could from here.
  const until = Math.min(sans.length, book.longest);
  for (let i = 0; i < until; i++) {
    const move = parseSan(pos, sans[i]!);
    if (!move) break;
    pos.play(move);
    const named = book.byKey.get(positionKeyOf(pos));
    if (named) found = { opening: named, ply: i + 1 };
  }
  return found;
}

/** "B90 · Sicilian Defense: Najdorf Variation". */
export const openingLabel = (o: Opening) => `${o.eco} · ${o.name}`;

/**
 * The openings whose name holds every word (folded, in any order), one row a name (the list
 * repeats a name for another move order: the shortest line stands for it), the shortest lines
 * first and the list's own order within a length.
 */
export function openingsNamed(book: OpeningBook, words: readonly string[]): Opening[] {
  if (!words.length) return [];
  const byName = new Map<string, Opening>();
  for (const o of book.list) {
    if (!words.every((w) => o.folded.includes(w))) continue;
    const had = byName.get(o.name);
    if (!had || o.sans.length < had.sans.length) byName.set(o.name, o);
  }
  // A stable sort keeps the list's order (by ECO code) among lines of one length.
  return [...byName.values()].sort((a, b) => a.sans.length - b.sans.length);
}
