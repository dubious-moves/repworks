// The format rules a reader can check by machine (PLAN.md §5.219), for the batch's second reader:
// in words to the owner (a review list's notes, a message) every line is written in full from
// move 1 and never cut with "…"; in a chapter's comment, moves stand inside parentheses (where the
// app makes them clickable) and prose outside. Pure: text in, what to look at out.
export interface LineSeen {
  /** The moves as written. */
  text: string;
  /** The first move's number. */
  number: number;
  moves: number;
  at: number;
}

const SAN = '(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?|O-O-O|O-O)[+#]?[!?]*';
const RUN = new RegExp(`(\\d+)\\.(?:\\.\\.)?\\s*${SAN}(?:\\s+(?:\\d+\\.(?:\\.\\.)?\\s*)?${SAN})*`, 'g');
const ONE = new RegExp(SAN, 'g');

/** Every run of numbered moves in a text: "9.Bd3 b3+ 10.Nd2" is one run of three moves starting at 9. */
export function linesIn(text: string): LineSeen[] {
  return [...text.matchAll(RUN)].map((m) => ({ text: m[0], number: Number(m[1]), moves: [...m[0].replace(/\d+\.(\.\.)?/g, ' ').matchAll(ONE)].length, at: m.index }));
}

export interface Lint {
  kind: 'partial line' | 'cut with dots' | 'moves outside parentheses' | 'prose inside a line' | 'look first';
  text: string;
}

/**
 * Words to the owner: a line of two moves or more that doesn't start at move 1, and a line cut
 * with "…" or a leading "...". One move named by its number ("9.Bd3 is the only move") is fine.
 */
export function lintWords(text: string): Lint[] {
  const out: Lint[] = [];
  for (const l of linesIn(text)) if (l.moves >= 2 && l.number !== 1) out.push({ kind: 'partial line', text: l.text });
  for (const m of text.matchAll(new RegExp(`(?:…|(?<![\\d.])\\.\\.\\.)\\s*(?=\\d+\\.)`, 'g'))) out.push({ kind: 'cut with dots', text: text.slice(m.index, m.index + 30) });
  return out;
}

/**
 * A chapter's comment: runs of two moves or more outside any parentheses (they should be a
 * clickable line), and groups in parentheses that hold both moves and several words of prose
 * (`spans`: where the reader found lines, so a remark inside a line the app reads is not flagged
 * twice; the caller passes the groups that are no line at all as `prose`).
 */
export function lintComment(text: string): Lint[] {
  const out: Lint[] = [];
  const depthAt: number[] = [];
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    depthAt.push(depth);
    if (ch === ')') depth = Math.max(0, depth - 1);
  }
  for (const l of linesIn(text)) if (l.moves >= 2 && (depthAt[l.at] ?? 0) === 0) out.push({ kind: 'moves outside parentheses', text: l.text });
  for (const m of text.matchAll(/\(([^()]*)\)/g)) {
    const inner = m[1]!;
    const moves = linesIn(inner).reduce((s, l) => s + l.moves, 0);
    const words = inner.replace(RUN, ' ').split(/\s+/).filter((w) => /^[A-Za-z’'-]{3,}$/.test(w)).length;
    if (moves >= 1 && words >= 4) out.push({ kind: 'prose inside a line', text: m[0] });
  }
  return out;
}

/**
 * A review list's "look first" marks (PLAN.md §5.220): the owner reads the marked positions first
 * and may wave the rest through, so a list with none tells him nothing, one with most of them
 * marked tells him as little, and a question he is not pointed to may never be answered. `items`
 * are the list's; a position is the items of one chapter at one move.
 */
export function lintMarks(items: readonly { cid: string; at: readonly string[]; kind: string; lead: string; part: string; first?: true }[]): Lint[] {
  const out: Lint[] = [];
  const positions = new Map<string, boolean>();
  for (const i of items) {
    const key = `${i.cid}|${i.at.join(',')}`;
    positions.set(key, (positions.get(key) ?? false) || i.first === true);
  }
  const marked = [...positions.values()].filter(Boolean).length;
  if (positions.size && !marked) out.push({ kind: 'look first', text: `no position of ${positions.size} is marked "look first" ("first": true on a note): mark what he should read before the rest` });
  if (positions.size >= 4 && marked > Math.ceil(positions.size / 3)) out.push({ kind: 'look first', text: `${marked} of ${positions.size} positions are marked "look first", more than about a third: a mark on most of them points to none` });
  for (const i of items) if (i.kind === 'question' && !i.first) out.push({ kind: 'look first', text: `the question at ${i.lead} ${i.part} is not marked: every question is` });
  return out;
}
