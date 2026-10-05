// PGN comments (PLAN.md §4.5): shapes and clock commands in and out of comment text, and the
// sanitizer Lichess applies when a comment is saved. Read from lila (study/CommentParser.scala,
// tree/tree.scala Comment.sanitize), scalalib (StringOps.softCleanUp) and scalachess
// (pgn/Pgn.scala Move.noDoubleLineBreak) on 2026-10-05.
import { parseSquare } from 'chessops/util';
import type { Brush, Shape } from '../study/model.ts';

export interface ParsedComment {
  /** The text with shape, clock, emt and eval commands taken out; `[%anno …]` and other commands stay. */
  text: string;
  shapes: Shape[];
  clock?: string;
  emt?: string;
  eval?: string;
}

// lila's patterns, without its possessive quantifiers, and matched everywhere in the text
// rather than only at the first occurrence.
const CIRCLES = /\[%csl\s+((?:\w{3}[,\s]*)+)\]/g;
const ARROWS = /\[%cal\s+((?:\w{5}[,\s]*)+)\]/g;
const CLOCK = /\[%clk\s+([\d:,.]+)\]/g;
const EMT = /\[%emt\s+([\d:,.]+)\]/g;
const EVAL = /\[%eval\s+([^\]\s][^\]]*?)\s*\]/g;

const BRUSHES: Record<string, Brush> = { G: 'green', R: 'red', Y: 'yellow' };
const brushOf = (letter: string): Brush => BRUSHES[letter] ?? 'blue'; // lila: anything else is blue
const LETTER: Record<Brush, string> = { green: 'G', red: 'R', yellow: 'Y', blue: 'B' };

export function parseComment(raw: string): ParsedComment {
  const shapes: Shape[] = [];
  const out: ParsedComment = { text: raw, shapes };
  let removed = false;
  const take = (re: RegExp, each: (value: string) => void) => {
    out.text = out.text.replace(re, (_m, value: string) => {
      removed = true;
      each(value);
      return '';
    });
  };
  take(CIRCLES, (list) => {
    for (const item of list.split(/[,\s]+/)) {
      const orig = parseSquare(item.slice(1, 3));
      if (item.length === 3 && orig !== undefined) shapes.push({ brush: brushOf(item[0]!), orig: item.slice(1, 3) as Shape['orig'] });
    }
  });
  take(ARROWS, (list) => {
    for (const item of list.split(/[,\s]+/)) {
      const orig = parseSquare(item.slice(1, 3));
      const dest = parseSquare(item.slice(3, 5));
      if (item.length === 5 && orig !== undefined && dest !== undefined) {
        shapes.push({ brush: brushOf(item[0]!), orig: item.slice(1, 3) as Shape['orig'], dest: item.slice(3, 5) as Shape['orig'] });
      }
    }
  });
  take(CLOCK, (v) => (out.clock ??= v));
  take(EMT, (v) => (out.emt ??= v));
  take(EVAL, (v) => (out.eval ??= v));
  // Where commands were taken out, the spaces around them go too. Text with no command in it
  // is kept exactly as read.
  if (removed) out.text = out.text.trim();
  out.shapes = dedupeShapes(shapes);
  return out;
}

export const sameShape = (a: Shape, b: Shape) => a.brush === b.brush && a.orig === b.orig && a.dest === b.dest;

export function dedupeShapes(shapes: readonly Shape[]): Shape[] {
  const out: Shape[] = [];
  for (const s of shapes) if (!out.some((t) => sameShape(s, t))) out.push(s);
  return out;
}

/** `[%csl …][%cal …]` as lila writes it: every circle, then every arrow, each in order. */
export function shapesCommand(shapes: readonly Shape[]): string | undefined {
  const circles = shapes.filter((s) => !s.dest).map((s) => `${LETTER[s.brush]}${s.orig}`);
  const arrows = shapes.filter((s) => s.dest).map((s) => `${LETTER[s.brush]}${s.orig}${s.dest}`);
  const text = (circles.length ? `[%csl ${circles.join(',')}]` : '') + (arrows.length ? `[%cal ${arrows.join(',')}]` : '');
  return text || undefined;
}

/** scalachess's clock string: `[%clk …]`, then `[%emt …]`, one space apart. */
export function clockCommand(clock: string | undefined, emt: string | undefined): string | undefined {
  if (clock === undefined && emt === undefined) return undefined;
  return [clock !== undefined ? `[%clk ${clock}]` : '', emt !== undefined ? `[%emt ${emt}]` : ''].filter(Boolean).join(' ');
}

/** Lichess cuts a saved comment here; the editor warns instead of cutting. */
export const LICHESS_COMMENT_LIMIT = 4000;

export interface Sanitized {
  text: string;
  /** Longer than Lichess keeps (counted as Lichess counts, in UTF-16 units, before tidying). */
  tooLong: boolean;
}

/**
 * The text Lichess would store and then export for a comment typed in its editor: softCleanUp,
 * then Comment.sanitize (without the cut at 4,000 characters), then the export's removal of
 * blank lines. Applied to comments typed here; imported text is kept as parsed.
 */
export function sanitizeComment(input: string): Sanitized {
  const clean = softCleanUp(input);
  const text = clean
    .replace(/\r\n/g, '\n')
    .replace(/^ *| +(?= |$)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[{}]/g, '')
    .replace(/(\r?\n){2,}/g, '\n');
  return { text, tooLong: clean.length > LICHESS_COMMENT_LIMIT };
}

// scalalib StringOps.softCleanUp: NFKC (keeping º ª ½, and turning ° into º as it does), then
// invisible characters out (bar zero-width joiners and variation selectors, which emoji need),
// then the musical-symbol and tag blocks and control characters other than the newline, then
// Java's trim.
const INVISIBLE = new Set(
  [
    0x00a0, 0x2000, 0x2001, 0x2002, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x205f, 0x3000, 0x2003,
    0x25a0, 0x0009, 0x000c, 0x001c, 0x200b, 0x200c, 0x2060, 0x2061, 0x2062, 0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4,
    0x17b5, 0x180b, 0x180c, 0x180d, 0x180e, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x202f, 0x2063,
    0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0x206a, 0x2800, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f, 0x3164, 0xfffc, 0xfeff,
    0xffa0, 0x2029, 0xfe00, 0xfe01, 0xfe02, 0xfe03, 0xfe04, 0xfe05, 0xfe06, 0xfe07, 0xfe08, 0xfe09, 0xfe0a, 0xfe0b, 0xfe0c,
    0xfe0d, 0xfe0e, 0xfe0f,
  ].filter((c) => (c < 0x200b || c > 0x200d) && (c < 0xfe00 || c > 0xfe0f)),
);
const OFFENSIVE = new Set([0x534d, 0x5350]);

export function softCleanUp(input: string): string {
  const normalized = input
    .replace(/[º°]/g, '\u0001')
    .replace(/ª/g, '\u0002')
    .replace(/½/g, '\u0003')
    .normalize('NFKC')
    .replace(/\u0001/g, 'º')
    .replace(/\u0002/g, 'ª')
    .replace(/\u0003/g, '½');
  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    // Java filters UTF-16 code units here, as this loop does.
    const c = normalized.charCodeAt(i);
    if (!INVISIBLE.has(c) && !OFFENSIVE.has(c)) out += normalized[i];
  }
  // Musical symbols (U+1D100-1D1FF), tags (U+E0000-E007F), and control characters but \n.
  out = out.replace(/[\u{1D100}-\u{1D1FF}\u{E0000}-\u{E007F}]|[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/gu, '');
  return javaTrim(out);
}

function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}
