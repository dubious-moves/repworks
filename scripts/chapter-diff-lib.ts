// The change list between two versions of a study's chapters (PLAN.md §5.214): the versions'
// chapters paired, each pair's diff (core/study/diff.ts), and the list as Markdown or JSON, every
// line written in full from the chapter's start and, when the new version is a study in a data
// repo, every item a link that opens the app at that move. Nothing here reads a file: the CLI
// (chapter-diff.ts) gives it the versions as read.
import type { Position } from 'chessops/chess';
import { modeHash } from '../src/core/app/fsm.ts';
import { chapterName } from '../src/core/import/plan.ts';
import { GLYPHS } from '../src/core/pgn/nags.ts';
import { sameShape } from '../src/core/pgn/comment.ts';
import { readProgress } from '../src/core/progress/files.ts';
import type { DeviceEvent } from '../src/core/progress/replay.ts';
import { countChanges, diffChapters, markedLine, splitLine, type Change, type DiffCounts, type Part } from '../src/core/study/diff.ts';
import type { Chapter, MoveNode, Shape } from '../src/core/study/model.ts';
import { answerOf, itemId, itemState, LIST_NAME, orderedByPosition, positionsOf, REVIEW_FORMAT, reviewCard, sharedAnswer, type Answer, type ItemKind, type ItemState, type ReviewItem, type ReviewList, type ReviewPosition } from '../src/core/study/reviewList.ts';
import { lineText, queryPosition } from '../src/core/study/search.ts';
import { nodeAt, startPosition, type Path } from '../src/core/study/tree.ts';

export const SITE = 'https://dubious-moves.github.io/repworks/';

export interface VersionChapter {
  name: string;
  /** In a data repo: the chapter's id. */
  cid?: string;
  chapter: Chapter;
}

/** One side of the comparison: a PGN file's games, or a study of a data repo at a commit or as checked out. */
export interface Version {
  /** How the list names it: "delivered.pgn", "repworks-data@0d0faa1, study asdf". */
  label: string;
  /** In a data repo: the study's id and name. */
  sid?: string;
  study?: string;
  chapters: VersionChapter[];
}

export function versionChapters(chapters: readonly Chapter[], ids: boolean): VersionChapter[] {
  return chapters.map((chapter, i) => ({ name: chapterName(chapter.headers, i), ...(ids ? { cid: chapter.id } : {}), chapter }));
}

export interface Pair {
  name: string;
  old?: VersionChapter;
  now?: VersionChapter;
}

const fold = (s: string) => s.trim().toLowerCase();

/**
 * The chapters of two versions, paired: by id when both are the same study of a data repo, then
 * by name (any case); and, between two different sources, when one chapter is left on each side,
 * those two (a file's single game against a study's chapter, whatever the file calls it). Within
 * one study an id is the chapter, so a chapter left over there is new or gone. In the new
 * version's order, the old one's unpaired chapters last.
 */
export function pairChapters(old: Version, now: Version): Pair[] {
  const left = [...old.chapters];
  const take = (pick: (c: VersionChapter) => boolean) => {
    const i = left.findIndex(pick);
    return i < 0 ? undefined : left.splice(i, 1)[0];
  };
  const sameStudy = old.sid !== undefined && old.sid === now.sid;
  const pairs: Pair[] = now.chapters.map((c) => ({ name: c.name, now: c }));
  if (sameStudy) for (const p of pairs) p.old = take((c) => c.cid === p.now!.cid);
  for (const p of pairs) p.old ??= take((c) => fold(c.name) === fold(p.name));
  const open = pairs.filter((p) => !p.old);
  if (!sameStudy && open.length === 1 && left.length === 1) open[0]!.old = left.pop();
  return [...pairs, ...left.map((c) => ({ name: c.name, old: c }))];
}

/** A change as the list gives it: the lines as text, and where to open the app. */
export interface Item {
  kind: Change['kind'];
  /** The move the item is at, as a full line; for a part, its main line with the part marked. */
  line: string;
  /** `line` in two: what leads to the change, and the change. */
  lead: string;
  part: string;
  /** The app's address of the item: the move itself, or for a removed part the last move still there. */
  link?: string;
  /** What `link` opens at, when it isn't the item's own move. */
  linkAt?: string;
  change: Change;
  /** A part's other lines, each in full; the moves an added part's comments are at. */
  lines?: string[];
  comments?: { at: string; text: string }[];
  elsewhere?: string[];
  /** For a changed first move: the old line and the new one, each to its end. */
  was?: string;
  now?: string;
  /** For a comment that kept its old text and got more after it: what was added. */
  appended?: string;
}

export interface ChapterReport {
  name: string;
  sid?: string;
  cid?: string;
  /** `changed`, `same`, `new` (only in the new version) or `gone` (only in the old one). */
  state: 'changed' | 'same' | 'new' | 'gone';
  /** A new or gone chapter's moves. */
  moves?: number;
  link?: string;
  mine?: 'white' | 'black';
  counts?: DiffCounts;
  items: Item[];
  /** Comments of the new version holding the mark (`--mark`): the open questions. */
  marked: { line: string; link?: string; text: string }[];
}

export interface Report {
  old: string;
  now: string;
  chapters: ChapterReport[];
}

export interface ReportOptions {
  /** The site the links open (SITE); '' for no links. */
  site?: string;
  /** Report a comment whose only change is its white space. */
  wraps?: boolean;
  /** List the new version's comments holding this text. */
  mark?: string;
}

const countMoves = (nodes: readonly MoveNode[]): number => nodes.reduce((n, c) => n + 1 + countMoves(c.children), 0);

/** A line from its position's main line down to its end. */
function toEnd(chapter: Chapter, path: Path): Path {
  let node: { children: MoveNode[] } | undefined = chapter.root;
  for (const san of path) node = node?.children.find((c) => c.san === san);
  const out = [...path];
  for (let next = node?.children[0]; next; next = next.children[0]) out.push(next.san);
  return out;
}

/** A path's last move with its number: "7. Qd2", "6... Be7". */
export function lastMove(start: Position, path: Path): string {
  const i = path.length - 1;
  const ply = i + (start.turn === 'black' ? 1 : 0);
  return `${start.fullmoves + Math.floor(ply / 2)}${ply % 2 ? '...' : '.'} ${path[i]}`;
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * What `now` holds after `was`, when it begins with it (line wraps aside): a comment the owner's
 * text was kept in, with a session's lines added after it. Undefined when the old text changed.
 */
export function appended(was: string, now: string): string | undefined {
  const want = flat(was);
  if (!want || !flat(now).startsWith(want)) return undefined;
  for (let k = want.length; k <= now.length; k++) {
    const head = flat(now.slice(0, k));
    if (head === want) return now.slice(k).trim() || undefined;
    if (head.length > want.length) return undefined;
  }
  return undefined;
}

export function report(old: Version, now: Version, options: ReportOptions = {}): Report {
  const site = options.site ?? SITE;
  const chapters: ChapterReport[] = [];
  for (const pair of pairChapters(old, now)) {
    const ids = now.sid !== undefined && pair.now?.cid !== undefined && site !== '' ? { sid: now.sid, cid: pair.now.cid } : undefined;
    const link = (path: Path) => (ids ? site + modeHash({ name: 'chapter', sid: ids.sid, cid: ids.cid, ...(path.length ? { at: [...path] } : {}) }) : undefined);
    const base = { name: pair.name, ...(now.sid !== undefined && pair.now ? { sid: now.sid } : {}), ...(pair.now?.cid !== undefined ? { cid: pair.now.cid } : {}) };
    if (!pair.old || !pair.now) {
      const only = (pair.now ?? pair.old)!;
      chapters.push({ ...base, state: pair.now ? 'new' : 'gone', moves: countMoves(only.chapter.root.children), ...(pair.now && link([]) ? { link: link([])! } : {}), items: [], marked: [] });
      continue;
    }
    const d = diffChapters(pair.old.chapter, pair.now.chapter, { wraps: options.wraps ? 'keep' : 'ignore' });
    const start = d.start;
    const oldStart = startPosition(pair.old.chapter) ?? start;
    const text = (path: Path) => (start ? lineText(start, path) : path.join(' '));
    const items: Item[] = [];
    for (const change of d.changes) {
      if (change.kind === 'header') {
        items.push({ kind: 'header', line: change.name, lead: '', part: change.name, change });
        continue;
      }
      if (change.kind === 'added' || change.kind === 'removed') {
        const from = change.kind === 'added' ? start : oldStart;
        const mark = (line: Path) => (from ? markedLine(from, line, change.path.length - 1) : line.join(' '));
        const open = change.kind === 'added' ? change.path : change.path.slice(0, -1);
        const url = link(open);
        const [lead, part] = from ? splitLine(from, change.lines[0]!, change.path.length - 1) : ['', change.lines[0]!.join(' ')];
        items.push({
          kind: change.kind,
          line: mark(change.lines[0]!),
          lead,
          part,
          ...(url ? { link: url } : {}),
          ...(change.kind === 'removed' ? { linkAt: open.length && start ? lastMove(start, open) : 'the start' } : {}),
          change,
          lines: change.lines.slice(1).map(mark),
          comments: change.comments.map((c) => ({ at: from ? lastMove(from, c.path) : c.path[c.path.length - 1]!, text: c.text })),
          elsewhere: change.elsewhere.map((p) => ((change.kind === 'added' ? oldStart : start) ? lineText((change.kind === 'added' ? oldStart : start)!, p) : p.join(' '))),
        });
        continue;
      }
      if (change.kind === 'main') {
        const to = [...change.path, change.to];
        const was = toEnd(pair.old.chapter, [...change.path, change.from]);
        const next = toEnd(pair.now.chapter, to);
        const url = link(to);
        const [lead, part] = start ? splitLine(start, to, change.path.length) : ['', to.join(' ')];
        items.push({
          kind: 'main',
          line: start ? markedLine(start, to, change.path.length) : to.join(' '),
          lead,
          part,
          ...(url ? { link: url } : {}),
          change,
          was: oldStart ? markedLine(oldStart, was, change.path.length) : was.join(' '),
          now: start ? markedLine(start, next, change.path.length) : next.join(' '),
        });
        continue;
      }
      const url = link(change.path);
      const more = change.kind === 'comment' && change.from.length ? appended(change.from.join('\n'), change.to.join('\n')) : undefined;
      const [lead, part] = start && change.path.length ? splitLine(start, change.path, change.path.length - 1) : ['', change.path.length ? change.path.join(' ') : 'the start'];
      items.push({ kind: change.kind, line: change.path.length ? text(change.path) : 'the start', lead, part, ...(url ? { link: url } : {}), change, ...(more !== undefined ? { appended: more } : {}) });
    }
    const marked: ChapterReport['marked'] = [];
    if (options.mark) {
      const walk = (node: { children: MoveNode[] }, path: Path) => {
        for (const child of node.children) {
          const here = [...path, child.san];
          for (const t of [...child.startingComments, ...child.comments]) if (t.includes(options.mark!)) marked.push({ line: text(here), ...(link(here) ? { link: link(here)! } : {}), text: t });
          walk(child, here);
        }
      };
      for (const t of pair.now.chapter.root.comments) if (t.includes(options.mark)) marked.push({ line: 'the start', ...(link([]) ? { link: link([])! } : {}), text: t });
      walk(pair.now.chapter.root, []);
    }
    chapters.push({ ...base, state: items.length ? 'changed' : 'same', ...(link([]) ? { link: link([])! } : {}), mine: d.mine, counts: countChanges(d), items, marked });
  }
  return { old: old.label, now: now.label, chapters };
}

// ---- Markdown ----

const LETTER: Record<Shape['brush'], string> = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' };
const shapeText = (s: Shape) => `${LETTER[s.brush]}${s.orig}${s.dest ?? ''}`;
const glyphText = (n: number) => GLYPHS[n]?.symbol ?? `$${n}`;
/** Text that Markdown would read as markup, escaped; a line's own "**" marks are written by this file and not passed through here. */
const esc = (s: string) => s.replace(/([\\`*_[\]<>#|~])/g, '\\$1');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A comment as a quote under a list item, its own line breaks kept. */
function quote(label: string, texts: readonly string[], indent = '  '): string[] {
  if (!texts.length) return [`${indent}- ${label}: (none)`];
  const out = [`${indent}- ${label}:`];
  texts.forEach((t, i) => {
    if (i) out.push(`${indent}  >`);
    for (const l of t.split('\n')) out.push(`${indent}  > ${esc(l)}`.trimEnd());
  });
  return out;
}

const open = (item: { link?: string; linkAt?: string }) => (item.link ? ` · [open${item.linkAt ? ` at ${item.linkAt}` : ''}](${item.link})` : '');

export function countsText(n: DiffCounts): string {
  const out: string[] = [];
  if (n.myMoves) out.push(plural(n.myMoves, 'move of mine changed', 'moves of mine changed'));
  if (n.replies) out.push(plural(n.replies, 'main reply changed', 'main replies changed'));
  if (n.added) out.push(`${plural(n.added, 'part')} added (${plural(n.addedMoves, 'move')})`);
  if (n.removed) out.push(`${plural(n.removed, 'part')} removed (${plural(n.removedMoves, 'move')})`);
  if (n.comments) out.push(plural(n.comments, 'comment changed', 'comments changed'));
  if (n.shapes) out.push(`arrows changed at ${plural(n.shapes, 'move')}`);
  if (n.glyphs) out.push(`glyphs changed at ${plural(n.glyphs, 'move')}`);
  if (n.order) out.push(`side lines reordered at ${plural(n.order, 'position')}`);
  if (n.headers) out.push(plural(n.headers, 'header changed', 'headers changed'));
  return out.join(', ') || 'no change';
}

export interface MarkdownOptions {
  /** A part's lines shown beyond its main one (0: all). */
  maxLines?: number;
}

export function markdown(r: Report, options: MarkdownOptions = {}): string {
  const max = options.maxLines ?? 8;
  const out: string[] = [`# What changed`, '', `From **${esc(r.old)}** to **${esc(r.now)}**.`, ''];
  const linked = r.chapters.some((c) => c.link);
  if (!linked) out.push('No links: the new version is a file, not a study in a data repo.', '');
  const same = r.chapters.filter((c) => c.state === 'same' && !c.marked.length).map((c) => c.name);
  for (const c of r.chapters) {
    if (c.state === 'same' && !c.marked.length) continue;
    out.push(`## ${esc(c.name)}${c.link ? ` · [open](${c.link})` : ''}`, '');
    if (c.state === 'new' || c.state === 'gone') {
      out.push(c.state === 'new' ? `A new chapter, ${plural(c.moves ?? 0, 'move')}.` : `Only in the old version (${plural(c.moves ?? 0, 'move')}).`, '');
      continue;
    }
    out.push(`${countsText(c.counts!)}.`, '');
    const mine = c.mine ?? 'white';
    const section = (title: string, items: Item[], each: (i: Item) => string[]) => {
      if (!items.length) return;
      out.push(`### ${title} (${items.length})`, '');
      for (const i of items) out.push(...each(i));
      out.push('');
    };
    const main = (i: Item) => {
      const ch = i.change as Extract<Change, { kind: 'main' }>;
      const notes = [ch.toKnown ? 'the new move was a side line before' : 'the new move is new', ch.fromKept ? 'the old one stays as a side line' : 'the old one is gone'];
      return [`- ${i.line}${open(i)}`, `  - was: ${i.was}`, `  - now: ${i.now}`, `  - ${notes.join('; ')}`];
    };
    section('My moves changed', c.items.filter((i) => i.kind === 'main' && (i.change as { side: string }).side === mine), main);
    section("The opponent's main reply changed", c.items.filter((i) => i.kind === 'main' && (i.change as { side: string }).side !== mine), main);
    const part = (i: Item) => {
      const p = i.change as { kind: 'added' | 'removed' } & Part;
      const lines = [`- ${i.line} (${plural(p.moves, 'move')}${p.lines.length > 1 ? `, ${p.lines.length} lines` : ''})${open(i)}`];
      const more = i.lines ?? [];
      const shown = max > 0 ? more.slice(0, max) : more;
      for (const l of shown) lines.push(`  - also: ${l}`);
      if (more.length > shown.length) lines.push(`  - and ${plural(more.length - shown.length, 'more line')} (--max-lines 0 lists all)`);
      for (const cm of i.comments ?? []) lines.push(...quote(`comment at ${cm.at}`, [cm.text]));
      if (p.shapes) lines.push(`  - arrows at ${plural(p.shapes, 'move')}`);
      for (const e of i.elsewhere ?? []) lines.push(p.kind === 'added' ? `  - the old version already reached this position by: ${e}` : `  - the position is still reached by: ${e}`);
      return lines;
    };
    section('Added', c.items.filter((i) => i.kind === 'added'), part);
    section('Removed', c.items.filter((i) => i.kind === 'removed'), part);
    section('Comments', c.items.filter((i) => i.kind === 'comment'), (i) => {
      const ch = i.change as Extract<Change, { kind: 'comment' }>;
      if (i.appended !== undefined) return [`- ${i.line}${open(i)}`, ...quote('added after the old text', [i.appended])];
      return [`- ${i.line}${open(i)}`, ...(ch.from.length ? quote('was', ch.from) : []), ...quote('now', ch.to)];
    });
    section('Arrows and glyphs', c.items.filter((i) => i.kind === 'shapes' || i.kind === 'glyphs'), (i) => {
      if (i.change.kind === 'shapes') {
        const { from, to } = i.change;
        const plus = to.filter((s) => !from.some((t) => sameShape(s, t))).map(shapeText);
        const minus = from.filter((s) => !to.some((t) => sameShape(s, t))).map(shapeText);
        return [`- ${i.line}${open(i)}: arrows ${[plus.length ? `added ${plus.join(' ')}` : '', minus.length ? `removed ${minus.join(' ')}` : ''].filter(Boolean).join(', ')}`];
      }
      const g = i.change as Extract<Change, { kind: 'glyphs' }>;
      return [`- ${i.line}${open(i)}: glyphs ${esc(g.from.map(glyphText).join(' ') || 'none')} → ${esc(g.to.map(glyphText).join(' ') || 'none')}`];
    });
    section('Side lines reordered', c.items.filter((i) => i.kind === 'order'), (i) => {
      const ch = i.change as Extract<Change, { kind: 'order' }>;
      return [`- after ${i.line}${open(i)}: ${esc(ch.from.join(', '))} → ${esc(ch.to.join(', '))}`];
    });
    section('Headers', c.items.filter((i) => i.kind === 'header'), (i) => {
      const ch = i.change as Extract<Change, { kind: 'header' }>;
      return [`- ${ch.name}: ${esc(ch.from ?? '(none)')} → ${esc(ch.to ?? '(none)')}`];
    });
    if (c.marked.length) {
      out.push(`### Open questions (${c.marked.length})`, '');
      for (const m of c.marked) out.push(`- ${m.line}${open(m)}`, ...quote('comment', [m.text]));
      out.push('');
    }
  }
  if (same.length) out.push(`Unchanged: ${same.map(esc).join(', ')}.`, '');
  return out.join('\n').replace(/\n+$/, '\n');
}

// ---- The review list (§5.216): the same changes as items the study page shows ----

/** A session's own words for the list: on a change (by the line of its move), or a question at a move. */
export interface Note {
  /** The chapter, by name or id; needed only when the line is in several. */
  chapter?: string;
  /** The move, as a line from the start: "1. Nc3 d5 2. d4 Bf5 3. f3". */
  moves: string;
  text: string;
}

const plain = (marked: string) => marked.replaceAll('**', '');
const shapeWords = (from: readonly Shape[], to: readonly Shape[]) => {
  const plus = to.filter((s) => !from.some((t) => sameShape(s, t))).map(shapeText);
  const minus = from.filter((s) => !to.some((t) => sameShape(s, t))).map(shapeText);
  return [plus.length ? `added ${plus.join(' ')}` : '', minus.length ? `removed ${minus.join(' ')}` : ''].filter(Boolean).join(', ');
};

/** The move an item is about: its own, or for a removed part the move taken away. */
const ownPath = (i: ReviewItem): string[] => (i.kind === 'removed' && i.san ? [...i.at, i.san] : i.at);

export type MadeList = { ok: true; list: ReviewList } | { ok: false; error: string };

/**
 * A report as a review list for the study page: an item per change, with the session's notes on
 * the changes they name and the rest of them as questions at their moves. In the report's order
 * by position: the items at one move (a removed reply and the comment it was written into) are
 * next to each other, as the panel shows them (§5.218), so a list cut in two by hand keeps a
 * decision whole. The new version must be a study of a data repo (the items name its chapters by id).
 */
export function reviewList(r: Report, now: Version, options: { name: string; title?: string; created: string; notes?: readonly Note[] }): MadeList {
  if (now.sid === undefined) return { ok: false, error: 'a review list is for a study in a data repo: the new side is a file' };
  if (!LIST_NAME.test(options.name)) return { ok: false, error: `the list's name must be lower-case letters, digits and dashes (at most 40): ${options.name}` };
  const items: ReviewItem[] = [];
  const chapters: Record<string, string> = {};
  for (const c of r.chapters) {
    const cid = c.cid;
    if (cid === undefined || c.state === 'gone') continue;
    if (c.state === 'new') {
      chapters[cid] = c.name;
      items.push({ id: itemId(cid, 'added', []), cid, kind: 'added', at: [], lead: '', part: `A new chapter (${plural(c.moves ?? 0, 'move')})` });
      continue;
    }
    const mine = c.mine ?? 'white';
    for (const i of c.items) {
      const ch = i.change;
      if (ch.kind === 'header') continue;
      chapters[cid] = c.name;
      const detail: string[] = [];
      let kind: ItemKind;
      let at: string[];
      let san: string | undefined;
      if (ch.kind === 'main') {
        kind = ch.side === mine ? 'move' : 'reply';
        at = [...ch.path, ch.to];
        san = ch.to;
        detail.push(`was: ${plain(i.was ?? '')}`, `now: ${plain(i.now ?? '')}`, ch.fromKept ? 'the old move stays as a side line' : 'the old move is gone');
      } else if (ch.kind === 'added' || ch.kind === 'removed') {
        kind = ch.kind;
        at = ch.kind === 'added' ? [...ch.path] : ch.path.slice(0, -1);
        if (ch.kind === 'removed') san = ch.path[ch.path.length - 1];
        for (const l of i.lines ?? []) detail.push(`also: ${plain(l)}`);
        for (const cm of i.comments ?? []) detail.push(`comment at ${cm.at}: ${cm.text}`);
        for (const e of i.elsewhere ?? []) detail.push(ch.kind === 'added' ? `the old version already reached this position by: ${e}` : `the position is still reached by: ${e}`);
      } else {
        at = [...ch.path];
        if (ch.kind === 'comment') {
          kind = 'comment';
          if (i.appended !== undefined) detail.push(`added after the old text: ${i.appended}`);
          else detail.push(...(ch.from.length ? [`was: ${ch.from.join('\n')}`] : []), `now: ${ch.to.join('\n') || '(none)'}`);
        } else if (ch.kind === 'shapes') {
          kind = 'arrows';
          detail.push(shapeWords(ch.from, ch.to));
        } else if (ch.kind === 'glyphs') {
          kind = 'glyphs';
          detail.push(`${ch.from.map(glyphText).join(' ') || 'none'} → ${ch.to.map(glyphText).join(' ') || 'none'}`);
        } else {
          kind = 'order';
          detail.push(`${ch.from.join(', ')} → ${ch.to.join(', ')}`);
        }
      }
      items.push({ id: itemId(cid, kind, san !== undefined && kind === 'removed' ? [...at, san] : at), cid, kind, at, lead: i.lead, part: i.part, ...(detail.length ? { detail } : {}), ...(san !== undefined ? { san } : {}) });
    }
  }
  for (const note of options.notes ?? []) {
    const asked = queryPosition(note.moves);
    if (!asked?.sans?.length) return { ok: false, error: `a note's moves don't read as a line from the start: ${note.moves}` };
    const sans = asked.sans;
    const named = note.chapter?.trim().toLowerCase();
    const holding = now.chapters.filter((c) => c.cid !== undefined && (named === undefined ? true : c.cid === note.chapter || c.name.trim().toLowerCase() === named));
    const about = items.filter((i) => holding.some((c) => c.cid === i.cid) && samePathList(ownPath(i), sans));
    if (about.length) {
      // The change at that move: the note is its text (the first, when a move has several changes).
      const first = about[0]!;
      first.text = first.text ? `${first.text}\n${note.text}` : note.text;
      continue;
    }
    const inChapters = holding.filter((c) => nodeAt(c.chapter, sans));
    if (inChapters.length !== 1) return { ok: false, error: `${inChapters.length ? 'several chapters play' : 'no chapter plays'} ${asked.line}${note.chapter ? ` (chapter ${note.chapter})` : ''}: ${inChapters.length ? 'name the chapter' : 'a question needs a move of the new version'}` };
    const c = inChapters[0]!;
    const start = startPosition(c.chapter);
    const [lead, part] = start ? splitLine(start, sans, sans.length - 1) : ['', sans.join(' ')];
    const id = itemId(c.cid!, 'question', sans);
    const same = items.find((i) => i.id === id);
    if (same) same.text = `${same.text ?? ''}\n${note.text}`;
    else items.push({ id, cid: c.cid!, kind: 'question', at: [...sans], lead, part, text: note.text });
    chapters[c.cid!] = c.name;
  }
  return { ok: true, list: { v: REVIEW_FORMAT, sid: now.sid, name: options.name, title: options.title?.trim() || options.name, created: options.created, from: r.old, to: r.now, chapters, items: orderedByPosition(items) } };
}

const samePathList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- The owner's answers, read back (§5.216) ----

export interface AnsweredItem {
  item: ReviewItem;
  state: ItemState;
  answer?: Answer;
  /** The item's line in full. */
  line: string;
}
/** The items at one move, as the panel shows and counts them (§5.218). */
export interface AnsweredPosition {
  cid: string;
  at: string[];
  /** The position's own line in full. */
  line: string;
  /** What its items say together: the first of no, noted, moved, open, ok that any of them has. */
  state: ItemState;
  /** An item still waits for the owner. */
  waiting: boolean;
  /** The note every item answered carries, when it is one note (a position answered as one). */
  note?: string;
  /** Its items; `list` names the list of one that is in another list than the position is under. */
  items: (AnsweredItem & { list?: string })[];
}
export interface AnsweredList {
  list: ReviewList;
  /** The list's own items. */
  items: AnsweredItem[];
  counts: Record<ItemState, number>;
  /** The positions under this list: one whose items are in several lists is under the first of them (the newest), and under no other. */
  positions: AnsweredPosition[];
  positionCounts: Record<ItemState, number>;
  /** Positions with an item still not answered: the panel's "open". */
  waiting: number;
}

const fullLine = (i: { lead: string; part: string }) => `${i.lead}${i.lead && i.part ? ' ' : ''}${i.part}`;
const noCounts = (): Record<ItemState, number> => ({ open: 0, ok: 0, no: 0, noted: 0, moved: 0 });

/**
 * Each list with the owner's answers from every device's log, and whether the chapter has moved on
 * from an item (the owner edited it there: the edit is his answer). `files` are a data repo
 * checkout's (path → text), `lists` the lists as read, in the order the app shows them
 * (`newestFirst`), `chapters` the study's chapters by id.
 */
export function answered(lists: readonly ReviewList[], files: ReadonlyMap<string, string>, chapters: ReadonlyMap<string, Chapter>): AnsweredList[] {
  const byCard = new Map<string, DeviceEvent[]>();
  for (const e of readProgress(files).events) {
    if (e.event?.k !== 'answer') continue;
    const card = e.event.card;
    byCard.set(card, [...(byCard.get(card) ?? []), e]);
  }
  for (const list of byCard.values()) list.sort((a, b) => a.t - b.t || a.n - b.n);
  const stand = (list: ReviewList, item: ReviewItem) => {
    const answer = answerOf(byCard.get(reviewCard(list.sid, list.name, item.id)) ?? []);
    return { state: itemState(item, answer, chapters.get(item.cid)), ...(answer ? { answer } : {}) };
  };
  return positionsOf(lists, stand).map(({ list, positions, open }) => {
    const counts = noCounts();
    const items = list.items.map((item) => {
      const s = stand(list, item);
      counts[s.state]++;
      return { item, ...s, line: fullLine(item) };
    });
    const positionCounts = noCounts();
    const placed = positions.map((p: ReviewPosition): AnsweredPosition => {
      positionCounts[p.state]++;
      const { note } = sharedAnswer(p.items.filter((i) => i.answer));
      return {
        cid: p.cid,
        at: p.at,
        line: fullLine(p),
        state: p.state,
        waiting: p.waiting,
        ...(note ? { note } : {}),
        items: p.items.map((i) => ({ item: i.item, state: i.state, ...(i.answer ? { answer: i.answer } : {}), line: fullLine(i.item), ...(i.list !== list ? { list: i.list.name } : {}) })),
      };
    });
    return { list, items, counts, positions: placed, positionCounts, waiting: open };
  });
}

const STATE_WORDS: Record<ItemState, string> = { open: 'not answered', ok: 'OK', no: 'No', noted: 'a note', moved: 'changed in the chapter since' };

/** The answers by position (§5.218): what needs the session first, a position's items under it when it has several. */
export function answersMarkdown(lists: readonly AnsweredList[]): string {
  const out: string[] = ['# Review answers', ''];
  if (!lists.length) out.push('No review list for this study.', '');
  const plurals = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  for (const l of lists) {
    const c = l.positionCounts;
    const shown = l.positions.reduce((n, p) => n + p.items.length, 0);
    const partly = l.waiting - c.open;
    out.push(
      `## ${esc(l.list.title)} (${l.list.name})`,
      '',
      `${plurals(l.positions.length, 'position')} (${plurals(shown, 'item')}): ${c.ok} OK, ${c.no} No, ${c.noted} with a note only, ${c.moved} changed in the chapter since, ${c.open} not answered.${partly > 0 ? ` ${plurals(partly, 'more position')} answered in part: ${plurals(l.waiting, 'position')} still open in the app.` : ''}`,
      '',
    );
    for (const state of ['no', 'noted', 'moved', 'open', 'ok'] as const) {
      const of = l.positions.filter((p) => p.state === state);
      if (!of.length) continue;
      out.push(`### ${STATE_WORDS[state][0]!.toUpperCase()}${STATE_WORDS[state].slice(1)} (${of.length})`, '');
      for (const p of of) {
        const chapter = esc(l.list.chapters[p.cid] ?? p.cid);
        const one = p.items.length === 1 ? p.items[0]! : undefined;
        if (one) {
          out.push(`- ${chapter}, ${one.item.kind}: ${one.line}`);
          if (one.answer?.note) out.push(...quote('note', [one.answer.note]));
          continue;
        }
        out.push(`- ${chapter}: ${p.line}`);
        // Each item's own word where they differ; one note given to the position is said once.
        const same = p.items.every((i) => i.state === p.state);
        for (const i of p.items) {
          const what = i.item.kind === 'removed' || i.item.kind === 'added' ? `: ${i.item.part}` : '';
          out.push(`  - ${i.item.kind}${what}${same ? '' : `, ${STATE_WORDS[i.state]}`}${i.list ? ` (list ${i.list})` : ''}`);
          if (i.answer?.note && i.answer.note !== p.note) out.push(...quote('note', [i.answer.note], '    '));
        }
        if (p.note) out.push(...quote('note', [p.note]));
      }
      out.push('');
    }
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
