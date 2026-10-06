// Edits to a chapter and a study (PLAN.md §4.6). Each returns a new value and leaves its input
// alone, sharing the subtrees it didn't touch, so undo is keeping the old value. Every edit
// keeps a chapter valid: legal moves from the start position, canonical SAN, distinct siblings.
import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { dedupeShapes, sanitizeComment } from '../pgn/comment.ts';
import { glyphGroup } from '../pgn/nags.ts';
import { emptyNodeData, header, type Chapter, type MoveNode, type Shape, type StudyKind, type StudyMeta } from './model.ts';
import { liftStartingComments, lineThrough, nodeAt, positionAt, updateAt, type Path, type TreeNode } from './tree.ts';

export type Edit<T = Chapter> = { ok: true; value: T } | { ok: false; error: string };

const done = <T>(value: T): Edit<T> => ({ ok: true, value });
const fail = <T = Chapter>(error: string): Edit<T> => ({ ok: false, error });
const notFound = <T = Chapter>(path: Path): Edit<T> => fail<T>(`no move at ${path.join(' ') || 'the start'}`);

/**
 * Plays `san` after `path`. If that move is already there, nothing changes and its path comes
 * back; otherwise it is added after the existing moves (the main line if there are none).
 */
export function addMove(chapter: Chapter, path: Path, san: string): Edit<{ chapter: Chapter; path: Path }> {
  const pos = positionAt(chapter, path);
  if (!pos) return fail(`no move at ${path.join(' ') || 'the start'}`);
  const move = parseSan(pos, san);
  if (!move) return fail(`${san} is not a legal move here`);
  const canonical = makeSan(pos, move);
  const at = [...path, canonical];
  if (nodeAt(chapter, at)) return done({ chapter, path: at });
  const child: MoveNode = { san: canonical, ...emptyNodeData(), children: [] };
  const next = updateAt(chapter, path, (node) => ({ ...node, children: [...node.children, child] }));
  return next ? done({ chapter: next, path: at }) : notFound(path);
}

/** Deletes the move at `path` and everything after it. */
export function deletePath(chapter: Chapter, path: Path): Edit {
  if (path.length === 0) return fail('the start of a chapter cannot be deleted');
  if (!nodeAt(chapter, path)) return notFound(path);
  const san = path[path.length - 1];
  const next = updateAt(chapter, path.slice(0, -1), (node) => ({ ...node, children: liftStartingComments(node.children.filter((c) => c.san !== san)) }));
  return next ? done(next) : notFound(path);
}

function moveAmongSiblings(chapter: Chapter, path: Path, step: -1 | 1): Edit {
  if (path.length === 0 || !nodeAt(chapter, path)) return notFound(path);
  const san = path[path.length - 1];
  const next = updateAt(chapter, path.slice(0, -1), (node) => {
    const children = node.children.slice();
    const i = children.findIndex((c) => c.san === san);
    const j = i + step;
    if (j < 0 || j >= children.length) return node;
    [children[i], children[j]] = [children[j]!, children[i]!];
    return { ...node, children: liftStartingComments(children) };
  });
  return next ? done(next) : notFound(path);
}

/** One step up among its siblings; the first sibling continues the line it branches from. */
export const promote = (chapter: Chapter, path: Path) => moveAmongSiblings(chapter, path, -1);
/** One step down among its siblings: undoes promote. */
export const demote = (chapter: Chapter, path: Path) => moveAmongSiblings(chapter, path, 1);

/** The variation a move belongs to: the nearest move on its path that isn't its parent's first. */
export function variationStart(chapter: Chapter, path: Path): Path | undefined {
  for (let n = path.length; n > 0; n--) {
    const parent = nodeAt(chapter, path.slice(0, n - 1));
    if (parent && parent.children[0]?.san !== path[n - 1]) return path.slice(0, n);
  }
  return undefined;
}

/** Makes every move on `path` its parent's first, so the path becomes the main line. */
export function makeMainline(chapter: Chapter, path: Path): Edit {
  if (!nodeAt(chapter, path)) return notFound(path);
  let next: Chapter | undefined = chapter;
  for (let n = 1; n <= path.length && next; n++) {
    const san = path[n - 1];
    next = updateAt(next, path.slice(0, n - 1), (node) => {
      const i = node.children.findIndex((c) => c.san === san);
      if (i <= 0) return node;
      const children = node.children.slice();
      const [moved] = children.splice(i, 1);
      return { ...node, children: liftStartingComments([moved!, ...children]) };
    });
  }
  return next ? done(next) : notFound(path);
}

const isOwn = (comment: string) => !comment.startsWith('[%anno');

/** The owner's comment on a node: the first one that isn't marked as another author's. */
export const ownComment = (node: TreeNode): string | undefined => node.comments.find(isOwn);

/**
 * Sets the owner's comment, sanitized as Lichess would; an empty text removes it. Other
 * authors' comments are left as they are.
 */
export function setComment(chapter: Chapter, path: Path, text: string): Edit {
  const clean = sanitizeComment(text).text;
  const next = updateAt(chapter, path, (node) => {
    const comments = node.comments.slice();
    const i = comments.findIndex(isOwn);
    if (clean === '') {
      if (i >= 0) comments.splice(i, 1);
    } else if (i >= 0) comments[i] = clean;
    else comments.push(clean);
    return { ...node, comments };
  });
  return next ? done(next) : notFound(path);
}

/** Glyphs in Lichess's order: the move assessment, the position assessment, observations, others. */
function orderGlyphs(nags: readonly number[]): number[] {
  const of = (g: ReturnType<typeof glyphGroup>) => nags.filter((n) => glyphGroup(n) === g);
  const move = of('move');
  const position = of('position');
  return [...move.slice(-1), ...position.slice(-1), ...new Set(of('observation')), ...new Set(of('other'))];
}

/** Sets a move's glyphs: one move assessment and one position assessment at most (the last given). */
export function setNags(chapter: Chapter, path: Path, nags: readonly number[]): Edit {
  if (path.length === 0) return fail('glyphs belong to moves');
  const next = updateAt(chapter, path, (node) => ({ ...node, nags: orderGlyphs(nags) }));
  return next ? done(next) : notFound(path);
}

/** Lichess's glyph toggle: the same glyph again removes it; another of its group replaces it. */
export function toggleGlyph(chapter: Chapter, path: Path, nag: number): Edit {
  const node = nodeAt(chapter, path);
  if (!node || path.length === 0) return path.length === 0 ? fail('glyphs belong to moves') : notFound(path);
  const group = glyphGroup(nag);
  let nags: number[];
  if (node.nags.includes(nag)) nags = node.nags.filter((n) => n !== nag);
  else if (group === 'move' || group === 'position') nags = [...node.nags.filter((n) => glyphGroup(n) !== group), nag];
  else nags = [nag, ...node.nags]; // Lichess puts a new observation first
  return setNags(chapter, path, nags);
}

/** Sets a node's circles and arrows, circles first as PGN carries them, without duplicates. */
export function setShapes(chapter: Chapter, path: Path, shapes: readonly Shape[]): Edit {
  const unique = dedupeShapes(shapes);
  const ordered = [...unique.filter((s) => !s.dest), ...unique.filter((s) => s.dest)];
  const next = updateAt(chapter, path, (node) => ({ ...node, shapes: ordered }));
  return next ? done(next) : notFound(path);
}

// The seven-tag roster, which Lichess's export puts first and in this order.
const ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
// These decide the moves' meaning; changing them is a different chapter.
const FIXED = new Set(['FEN', 'SetUp', 'Variant']);

/** Sets a header in place, or adds it where Lichess's export would put it. */
export function setHeader(chapter: Chapter, name: string, value: string): Edit {
  if (FIXED.has(name)) return fail(`${name} can't be changed: it would change what the moves mean`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_+#=:-]*$/.test(name)) return fail(`${name} is not a valid header name`);
  const headers = chapter.headers.slice();
  const i = headers.findIndex(([k]) => k === name);
  if (i >= 0) headers[i] = [name, value];
  else {
    const rank = ROSTER.indexOf(name);
    const at = rank < 0 ? headers.length : headers.findIndex(([k]) => ROSTER.indexOf(k) < 0 || ROSTER.indexOf(k) > rank);
    headers.splice(at < 0 ? headers.length : at, 0, [name, value]);
  }
  return done({ ...chapter, headers });
}

export function removeHeader(chapter: Chapter, name: string): Edit {
  if (FIXED.has(name)) return fail(`${name} can't be removed: it would change what the moves mean`);
  return done({ ...chapter, headers: chapter.headers.filter(([k]) => k !== name) });
}

/** The side the chapter is for. */
export const setOrientation = (chapter: Chapter, color: Color) => setHeader(chapter, 'Orientation', color);

/** Renames a chapter: ChapterName, and Event when it was the "Study: Chapter" Lichess writes. */
export function renameChapter(chapter: Chapter, studyName: string, name: string): Edit {
  const clean = name.trim();
  if (!clean) return fail('a chapter needs a name');
  const old = header(chapter, 'ChapterName');
  let next = setHeader(chapter, 'ChapterName', clean);
  if (next.ok && old !== undefined && header(chapter, 'Event') === `${studyName}: ${old}`) next = setHeader(next.value, 'Event', `${studyName}: ${clean}`);
  return next;
}

/** A new, empty chapter, with the headers a Lichess export of it would carry. */
export function newChapter(id: string, studyName: string, name: string, orientation: Color, fen?: string): Edit {
  const headers: [string, string][] = [
    ['Event', `${studyName}: ${name}`],
    ['Result', '*'],
    ['StudyName', studyName],
    ['ChapterName', name],
  ];
  if (fen) headers.push(['FEN', fen], ['SetUp', '1']);
  headers.push(['Orientation', orientation]);
  const chapter: Chapter = { id, headers, root: { ...emptyNodeData(), children: [] } };
  if (fen && !positionAt(chapter, [])) return fail('that FEN is not a legal position');
  return done(chapter);
}

/** The moves from the start to `path` as PGN movetext, for copying. */
export function linePgn(chapter: Chapter, path: Path): string {
  const pos = positionAt(chapter, []);
  if (!pos || !nodeAt(chapter, path)) return '';
  return numberedMoves(pos, path);
}

/** Moves as bare SAN numbered from `pos` (`4... c5 5. d4 cxd4`); `pos` is played through. */
function numberedMoves(pos: Position, moves: readonly string[]): string {
  const parts: string[] = [];
  for (const [i, san] of moves.entries()) {
    const number = pos.fullmoves;
    if (pos.turn === 'white') parts.push(`${number}. ${san}`);
    else parts.push(i === 0 ? `${number}... ${san}` : san);
    pos.play(parseSan(pos, san)!);
  }
  return parts.join(' ');
}

/**
 * Copy continuation (PLAN.md §5.11, q_extension's): the moves from the branch the move at `path`
 * is on (its nearest ancestor-or-self with a sibling; the chapter's start when there is none) to
 * the end of the line, following first children, numbered from the branch's position.
 */
export function continuation(chapter: Chapter, path: Path): string {
  const line = lineThrough(chapter, path);
  if (!line) return '';
  let from = 0;
  for (let i = path.length; i >= 1; i--) {
    if (nodeAt(chapter, path.slice(0, i - 1))!.children.length > 1) {
      from = i - 1;
      break;
    }
  }
  const pos = positionAt(chapter, line.slice(0, from));
  return pos ? numberedMoves(pos, line.slice(from)) : '';
}

// Study level: study.json and the chapter headers that repeat it.

/** Renames a study: study.json and, in the same commit, every chapter's StudyName (and Event). */
export function renameStudy(meta: StudyMeta, chapters: readonly Chapter[], name: string): Edit<{ meta: StudyMeta; chapters: Chapter[] }> {
  const clean = name.trim();
  if (!clean) return fail('a study needs a name');
  const renamed: Chapter[] = [];
  for (const chapter of chapters) {
    let next = setHeader(chapter, 'StudyName', clean);
    const chapterName = header(chapter, 'ChapterName');
    if (next.ok && chapterName !== undefined && header(chapter, 'Event') === `${meta.name}: ${chapterName}`) next = setHeader(next.value, 'Event', `${clean}: ${chapterName}`);
    if (!next.ok) return fail(next.error);
    renamed.push(next.value);
  }
  return done({ meta: { ...meta, name: clean }, chapters: renamed });
}

export const setKind = (meta: StudyMeta, kind: StudyKind): StudyMeta => ({ ...meta, kind });

/** Puts the chapters in the given order; the order must name exactly the study's chapters. */
export function reorderChapters(meta: StudyMeta, order: readonly string[]): Edit<StudyMeta> {
  const same = order.length === meta.chapters.length && new Set(order).size === order.length && order.every((c) => meta.chapters.includes(c));
  return same ? done({ ...meta, chapters: [...order] }) : fail('the new order must list each chapter once');
}

export const addChapterToStudy = (meta: StudyMeta, cid: string): StudyMeta => (meta.chapters.includes(cid) ? meta : { ...meta, chapters: [...meta.chapters, cid] });
export const removeChapterFromStudy = (meta: StudyMeta, cid: string): StudyMeta => ({ ...meta, chapters: meta.chapters.filter((c) => c !== cid) });

/**
 * Drawing a shape, as chessground's right-drag does: one with the same ends goes, and comes back
 * in the new colour if the colour differs. The phone's draw mode draws through this.
 */
export function toggleShape(shapes: readonly Shape[], shape: Shape): Shape[] {
  const sameEnds = (s: Shape) => s.orig === shape.orig && s.dest === shape.dest;
  const similar = shapes.find(sameEnds);
  const rest = shapes.filter((s) => !sameEnds(s));
  return similar && similar.brush === shape.brush ? rest : [...rest, shape];
}
