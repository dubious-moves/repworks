// A batch's changes to a chapter as data (PLAN.md §5.219): cuts, added lines, comments, glyphs and
// the order of replies, applied to the chapter as the session last saw it, and the owner's changes
// since then carried onto the result three-way. Pure: chapters in, a chapter and a log out. An op
// that can't be applied is an error, never skipped: a batch is applied whole or not at all.
import { makeSan, parseSan } from 'chessops/san';
import { parseGames } from '../../src/core/pgn/parse.ts';
import { header, type Chapter, type MoveNode, type NodeData, type RootNode } from '../../src/core/study/model.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { lineOf, nodeAtSans, sansOf } from './study.ts';

type TreeNode = RootNode | MoveNode;

export type CommentOp =
  /** The move's comments become this one text ("" removes them). */
  | { at: string; set: string }
  /** Added to the move's last comment after a line break (or as its comment when it has none): the owner's text stays first. */
  | { at: string; append: string }
  /** One piece of text for another, in the comment that holds it (exactly one must). */
  | { at: string; replace: [from: string, to: string] };

export interface Ops {
  /** The chapter: its id, or its name. */
  chapter: string;
  /** `node`: the move and everything below it; `children`: only what is below it. */
  cut?: { at: string; mode: 'node' | 'children' }[];
  /** PGN movetext from the chapter's first move; a new move keeps the line's comments, glyphs and arrows. */
  lines?: string[];
  comments?: CommentOp[];
  /** A move's glyphs as NAG numbers (1 `!`, 2 `?`, 3 `!!`, 4 `??`, 5 `!?`, 6 `?!`); [] removes them. */
  glyphs?: { at: string; nags: number[] }[];
  /** The move becomes the first of its position's moves (the main line there). */
  first?: string[];
}

export interface Applied {
  chapter: Chapter;
  log: string[];
  errors: string[];
  /** The paths of the moves the cuts removed (as "san san san"), for the merge. */
  cut: string[];
}

const clone = <T>(x: T): T => structuredClone(x);
const key = (path: readonly string[]) => path.join(' ');

/** The ops applied in their order: cuts, lines, comments, glyphs, first. The input chapter is not changed. */
export function applyOps(input: Chapter, ops: Ops): Applied {
  const chapter = clone(input);
  const log: string[] = [];
  const errors: string[] = [];
  const cut: string[] = [];
  const find = (at: string, what: string) => {
    const hit = nodeAtSans(chapter, sansOf(at));
    if (!hit) errors.push(`${what}: no such line in the chapter: ${at}`);
    return hit;
  };
  const parentOf = (path: readonly string[]): TreeNode => nodeAtSans(chapter, path.slice(0, -1))!.node;

  for (const c of ops.cut ?? []) {
    const hit = find(c.at, 'cut');
    if (!hit) continue;
    if (c.mode === 'node') {
      if (!hit.path.length) {
        errors.push('cut: the whole chapter can’t be cut');
        continue;
      }
      const parent = parentOf(hit.path);
      parent.children = parent.children.filter((x) => x !== hit.node);
      cut.push(key(hit.path));
      log.push(`cut ${lineOf(chapter, hit.path)}`);
    } else {
      for (const child of hit.node.children) cut.push(key([...hit.path, child.san]));
      log.push(`cut ${hit.node.children.length} move(s) below ${lineOf(chapter, hit.path)}`);
      hit.node.children = [];
    }
  }

  let added = 0;
  for (const text of ops.lines ?? []) {
    const fen = header(chapter, 'FEN');
    const parsed = parseGames(`${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}\n${text} *\n`, () => 'line');
    const game = parsed[0];
    if (parsed.length !== 1 || !game?.ok) {
      errors.push(`line: can't be read as one game: ${text.slice(0, 80)}`);
      continue;
    }
    const bad = game.notes.filter((n) => n.kind === 'illegal');
    if (bad.length) {
      errors.push(`line: illegal move ${bad.map((n) => (n.kind === 'illegal' ? n.san : '')).join(', ')} in: ${text.slice(0, 80)}`);
      continue;
    }
    const graft = (to: TreeNode, from: TreeNode, path: string[]) => {
      for (const child of from.children) {
        const here = [...path, child.san];
        const same = to.children.find((x) => x.san === child.san);
        if (!same) {
          to.children.push(clone(child));
          const size = (n: TreeNode): number => n.children.reduce((s, c) => s + 1 + size(c), 0);
          added += 1 + size(child);
          log.push(`added ${lineOf(chapter, here)}${child.children.length ? ` (+${size(child)} below)` : ''}`);
          continue;
        }
        if ((child.comments.length && key(child.comments) !== key(same.comments)) || (child.nags.length && key(child.nags.map(String)) !== key(same.nags.map(String)))) {
          errors.push(`line: ${lineOf(chapter, here)} is already there and the line gives it another comment or glyph: use "comments" or "glyphs"`);
        }
        graft(same, child, here);
      }
    };
    graft(chapter.root, game.chapter.root, []);
  }
  if (ops.lines?.length) log.push(`${added} move(s) added`);

  for (const c of ops.comments ?? []) {
    const hit = find(c.at, 'comment');
    if (!hit) continue;
    const node = hit.node;
    if ('set' in c) node.comments = c.set === '' ? [] : [c.set];
    else if ('append' in c) {
      if (node.comments.length) node.comments[node.comments.length - 1] = `${node.comments[node.comments.length - 1]}\n${c.append}`;
      else node.comments = [c.append];
    } else {
      const [from, to] = c.replace;
      const holding = node.comments.map((t, i) => (t.includes(from) ? i : -1)).filter((i) => i >= 0);
      if (holding.length !== 1 || node.comments[holding[0]!]!.split(from).length !== 2) {
        errors.push(`comment: "${from.slice(0, 60)}" is ${holding.length ? 'there more than once' : 'not'} in the comment at ${c.at}`);
        continue;
      }
      node.comments[holding[0]!] = node.comments[holding[0]!]!.replace(from, () => to);
      node.comments = node.comments.filter((t) => t.trim() !== '');
    }
    log.push(`comment at ${lineOf(chapter, hit.path)}`);
  }

  for (const g of ops.glyphs ?? []) {
    const hit = find(g.at, 'glyphs');
    if (!hit) continue;
    hit.node.nags = [...g.nags];
    log.push(`glyphs at ${lineOf(chapter, hit.path)}`);
  }

  for (const at of ops.first ?? []) {
    const hit = find(at, 'first');
    if (!hit || !hit.path.length) continue;
    const parent = parentOf(hit.path);
    parent.children = [hit.node as MoveNode, ...parent.children.filter((x) => x !== hit.node)];
    log.push(`first at its position: ${lineOf(chapter, hit.path)}`);
  }

  // Every move left must still be legal from the start (a cut can't break that; an added line was read by the parser).
  const start = startPosition(chapter);
  if (start) {
    const check = (n: TreeNode, pos: typeof start, path: string[]) => {
      for (const c of n.children) {
        const m = parseSan(pos, c.san);
        if (!m || makeSan(pos, m) !== c.san) {
          errors.push(`not a legal move, or not as the app writes it: ${[...path, c.san].join(' ')}`);
          continue;
        }
        const after = pos.clone();
        after.play(m);
        check(c, after, [...path, c.san]);
      }
    };
    check(chapter.root, start, []);
  }
  return { chapter, log, errors, cut };
}

/* ------------------------------------------------------------------ the three-way merge */

const FIELDS = ['comments', 'shapes', 'nags', 'startingComments'] as const;
type Field = (typeof FIELDS)[number];
const dataOf = (n: NodeData) => JSON.stringify(FIELDS.map((f) => n[f]));

function index(root: RootNode): Map<string, TreeNode> {
  const m = new Map<string, TreeNode>();
  const walk = (n: TreeNode, path: string[]) => {
    m.set(key(path), n);
    for (const c of n.children) walk(c, [...path, c.san]);
  };
  walk(root, []);
  return m;
}
const up = (p: string) => p.split(' ').slice(0, -1).join(' ');
const last = (p: string) => p.split(' ').at(-1)!;

export interface Merged {
  chapter: Chapter;
  /** What was carried from the owner's side, one sentence each. */
  carried: string[];
  /** Where both sides changed the same thing: the owner's is kept, mine is quoted so nothing is lost silently. */
  conflicts: string[];
}

/**
 * `theirs` (the chapter in the repo now: the owner's edits since `base`) carried onto `mine`
 * (`base` with a batch's ops applied), move by move and field by field (comments, arrows, glyphs):
 * - a move he added is copied with everything below it; one he removed is removed;
 * - a field he changed wins; where mine changed it too, differently, that is a conflict, his kept;
 * - a move he edited and mine removed stays removed, reported as a conflict;
 * - the order of a position's moves follows his when he changed it.
 * The result has the repo file's headers and id. None of the three inputs is changed.
 */
export function merge3(base: Chapter, mineIn: Chapter, theirs: Chapter): Merged {
  const mine = clone(mineIn);
  const iB = index(base.root);
  const iT = index(theirs.root);
  const iM = index(mine.root);
  const carried: string[] = [];
  const conflicts: string[] = [];
  const line = (p: string) => (p ? lineOf(theirs, p.split(' ')) : 'the chapter itself');

  for (const [p, t] of iT) {
    const b = iB.get(p);
    const m = iM.get(p);
    if (!b) {
      if (!m) {
        const parent = iM.get(up(p));
        // Its parent is his too and was copied with it; or mine removed the parent he added to.
        if (!parent) {
          if (iB.has(up(p))) conflicts.push(`he added ${line(p)} below a move this batch removed: not added`);
          continue;
        }
        const copy = clone(t) as MoveNode;
        parent.children.push(copy);
        const walk = (n: MoveNode, q: string) => {
          iM.set(q, n);
          for (const c of n.children) walk(c, `${q} ${c.san}`);
        };
        walk(copy, p);
        carried.push(`added by him, with everything below it: ${line(p)}`);
      } else if (dataOf(m) !== dataOf(t)) {
        Object.assign(m, clone({ comments: t.comments, shapes: t.shapes, nags: t.nags, startingComments: t.startingComments }));
        conflicts.push(`both added ${line(p)} with different comments, arrows or glyphs: his kept, mine was ${dataOf(mineAt(mineIn, p))}`);
      }
      continue;
    }
    if (!m) {
      if (dataOf(t) !== dataOf(b)) conflicts.push(`he edited ${line(p)}, which this batch removed: it stays removed`);
      continue;
    }
    for (const f of FIELDS) {
      const tv = JSON.stringify(t[f]);
      const bv = JSON.stringify(b[f]);
      const mv = JSON.stringify(m[f]);
      if (tv === bv || tv === mv) continue;
      (m as NodeData)[f] = clone(t[f]) as never;
      if (mv === bv) carried.push(`his ${words(f)} at ${line(p)}`);
      else conflicts.push(`both changed the ${words(f)} at ${line(p)}: his kept, mine was ${mv}`);
    }
  }

  for (const [p] of iB) {
    if (!p || iT.has(p) || !iM.has(p) || !iT.has(up(p))) continue;
    const parent = iM.get(up(p));
    if (!parent) continue;
    parent.children = parent.children.filter((c) => c.san !== last(p));
    const drop = (q: string) => {
      for (const k of [...iM.keys()]) if (k === q || k.startsWith(`${q} `)) iM.delete(k);
    };
    drop(p);
    carried.push(`removed by him: ${lineOf(base, p.split(' '))}`);
  }

  // The order of a position's moves: his, where he changed it among the moves both versions have.
  for (const [p, t] of iT) {
    const b = iB.get(p);
    const m = iM.get(p);
    if (!b || !m) continue;
    const inBoth = (list: readonly MoveNode[], other: readonly MoveNode[]) => list.map((c) => c.san).filter((s) => other.some((o) => o.san === s));
    const was = inBoth(b.children, t.children);
    const his = inBoth(t.children, b.children);
    if (key(was) === key(his)) continue;
    const mineOrder = inBoth(m.children, b.children);
    const rank = new Map(t.children.map((c, i) => [c.san, i]));
    const before = key(m.children.map((c) => c.san));
    m.children = [...m.children].sort((x, y) => (rank.get(x.san) ?? 1e6) - (rank.get(y.san) ?? 1e6));
    if (key(m.children.map((c) => c.san)) === before) continue;
    if (key(mineOrder) === key(inBoth(b.children, m.children))) carried.push(`his order of the moves after ${line(p)}`);
    else conflicts.push(`both changed the order of the moves after ${line(p)}: his kept`);
  }

  return { chapter: { id: theirs.id, headers: clone(theirs.headers), root: mine.root }, carried, conflicts };
}

const words = (f: Field) => (f === 'comments' ? 'comment' : f === 'shapes' ? 'arrows' : f === 'nags' ? 'glyphs' : 'comment before the line');
function mineAt(chapter: Chapter, p: string): NodeData {
  return index(chapter.root).get(p) ?? { comments: [], shapes: [], nags: [], startingComments: [] };
}

/* ------------------------------------------------------------------ a base that is behind */

export interface CommitInfo {
  hash: string;
  subject: string;
  body: string;
  /** The files it changed, as paths in the repo. */
  files: string[];
}

/** A commit a session made (not a device's sync): by its subject, or the trailers a session's commits carry. */
export const isSessionCommit = (c: Pick<CommitInfo, 'subject' | 'body'>): boolean => /^session:/i.test(c.subject) || /^(Claude-Session|Co-Authored-By: Claude)\b/im.test(c.body);

/**
 * The session's own commits to a study's chapters among those made after the base: with any, the
 * base is behind (what they changed would be read as the owner's, and the batch built without
 * it), so the merge is refused and the latest of them named as the base to use.
 */
export function behind(commitsSinceBase: readonly CommitInfo[], sid: string): CommitInfo[] {
  return commitsSinceBase.filter((c) => isSessionCommit(c) && c.files.some((f) => f.startsWith(`studies/${sid}/`)));
}
