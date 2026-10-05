// Three-way merge of a chapter (PLAN.md §4.7, D4). `base` is the version both sides last agreed
// on, `ours` the merging device's, `theirs` the remote head's. Nodes are matched by path.
//
// Presence: a node present on both sides stays; one added on either side stays; one deleted on
// either side goes, unless the other side edited inside that subtree: then each edited node
// and the path to it stay, and the highest of them is marked "kept after delete".
// Attributes: a list changed on one side only is taken from that side as it is. Changed on both:
// comment lists keep both versions between markers; shapes merge as a set; the move and the
// position glyph are single-valued and observations a set; clocks and evals, and child order and
// headers, go to ours, the side that syncs later.
import { sameShape } from '../pgn/comment.ts';
import { glyphGroup } from '../pgn/nags.ts';
import { header, type Chapter, type MoveNode, type NodeData, type RootNode, type Shape } from '../study/model.ts';
import { liftStartingComments, type TreeNode } from '../study/tree.ts';
import { keptMarker, textConflict } from './markers.ts';

export interface MergeLabels {
  /** How the merging device signs its side of a marker, e.g. "phone 2026-10-05". */
  ours: string;
  theirs: string;
}

export interface MergeConflict {
  path: string[];
  kind: 'text' | 'kept' | 'start-position';
}

export interface ChapterMerge {
  chapter: Chapter;
  conflicts: MergeConflict[];
  /**
   * When the start position changed: the side whose tree didn't win, to be kept as a separate
   * "(conflict copy)" chapter, which the caller names and gives an ID.
   */
  copy?: { side: 'ours' | 'theirs'; chapter: Chapter };
}

type Entry = { node: TreeNode; path: string[] };
const keyOf = (path: readonly string[]) => path.join(' ');

function index(chapter: Chapter): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const stack: Entry[] = [{ node: chapter.root, path: [] }];
  while (stack.length) {
    const entry = stack.pop()!;
    out.set(keyOf(entry.path), entry);
    for (const child of entry.node.children) stack.push({ node: child, path: [...entry.path, child.san] });
  }
  return out;
}

const listEq = <T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = (x, y) => x === y) => a.length === b.length && a.every((x, i) => eq(x, b[i]!));
const shapesEq = (a: readonly Shape[], b: readonly Shape[]) => listEq(a, b, sameShape);

function sameData(a: NodeData, b: NodeData): boolean {
  return listEq(a.comments, b.comments) && listEq(a.startingComments, b.startingComments) && listEq(a.nags, b.nags) && shapesEq(a.shapes, b.shapes) && a.clock === b.clock && a.emt === b.emt && a.eval === b.eval;
}

const EMPTY: NodeData = { comments: [], shapes: [], nags: [], startingComments: [] };

function copyData(d: NodeData): NodeData {
  const out: NodeData = { comments: [...d.comments], shapes: [...d.shapes], nags: [...d.nags], startingComments: [...d.startingComments] };
  if (d.clock !== undefined) out.clock = d.clock;
  if (d.emt !== undefined) out.emt = d.emt;
  if (d.eval !== undefined) out.eval = d.eval;
  return out;
}

export function mergeChapter(base: Chapter | undefined, ours: Chapter, theirs: Chapter, labels: MergeLabels): ChapterMerge {
  const b = base ?? { id: ours.id, headers: [], root: { ...EMPTY, children: [] } };
  const fen = (c: Chapter) => header(c, 'FEN') ?? '';
  if (fen(ours) !== fen(theirs)) return mergeStartChange(b, ours, theirs, fen);

  const B = index(b);
  const O = index(ours);
  const T = index(theirs);
  const conflicts: MergeConflict[] = [];

  // Every node that is new or changed on a side, with all its ancestors: "touched".
  const touched = (S: Map<string, Entry>) => {
    const set = new Set<string>();
    for (const [k, { node, path }] of S) {
      const before = B.get(k);
      if (before && sameData(node, before.node)) continue;
      for (let n = 0; n <= path.length; n++) set.add(keyOf(path.slice(0, n)));
    }
    return set;
  };
  const touchedO = touched(O);
  const touchedT = touched(T);

  const keep = new Set<string>();
  const keptAfterDelete = new Set<string>();
  const consider = (S: Map<string, Entry>, other: Map<string, Entry>, edits: Set<string>) => {
    for (const k of S.keys()) {
      if (keep.has(k)) continue;
      if (other.has(k) || !B.has(k)) keep.add(k);
      else if (edits.has(k)) {
        keep.add(k);
        keptAfterDelete.add(k);
      }
    }
  };
  consider(O, T, touchedO);
  consider(T, O, touchedT);

  const build = (path: string[]): TreeNode => {
    const k = keyOf(path);
    const o = O.get(k)?.node;
    const t = T.get(k)?.node;
    const before = B.get(k)?.node;
    const data = o && t ? mergeData(before ?? EMPTY, o, t, path, labels, conflicts) : copyData((o ?? t)!);
    const order = childOrder(before, o, t).filter((san) => keep.has(keyOf([...path, san])));
    const children = liftStartingComments(order.map((san) => build([...path, san]) as MoveNode));
    if (keptAfterDelete.has(k) && !keptAfterDelete.has(keyOf(path.slice(0, -1)))) {
      data.comments.push(keptMarker(o ? labels.theirs : labels.ours));
      conflicts.push({ path, kind: 'kept' });
    }
    return path.length ? { san: path[path.length - 1]!, ...data, children } : { ...data, children };
  };

  const root = build([]) as RootNode;
  return { chapter: { id: ours.id, headers: mergeHeaders(b.headers, ours.headers, theirs.headers), root }, conflicts };
}

function mergeStartChange(base: Chapter, ours: Chapter, theirs: Chapter, fen: (c: Chapter) => string): ChapterMerge {
  const changed = (c: Chapter) => JSON.stringify(c.headers) !== JSON.stringify(base.headers) || JSON.stringify(c.root) !== JSON.stringify(base.root);
  const conflicts: MergeConflict[] = [{ path: [], kind: 'start-position' }];
  if (fen(ours) === fen(base)) return changed(ours) ? { chapter: theirs, conflicts, copy: { side: 'ours', chapter: ours } } : { chapter: theirs, conflicts: [] };
  if (fen(theirs) === fen(base)) return changed(theirs) ? { chapter: ours, conflicts, copy: { side: 'theirs', chapter: theirs } } : { chapter: ours, conflicts: [] };
  return { chapter: ours, conflicts, copy: { side: 'theirs', chapter: theirs } };
}

function mergeData(b: NodeData, o: NodeData, t: NodeData, path: string[], labels: MergeLabels, conflicts: MergeConflict[]): NodeData {
  const pick3 = <T>(bv: T, ov: T, tv: T, eq: (x: T, y: T) => boolean): T | null => (eq(ov, tv) || eq(tv, bv) ? ov : eq(ov, bv) ? tv : null);
  const comments = (bv: readonly string[], ov: readonly string[], tv: readonly string[]) => {
    const simple = pick3(bv, ov, tv, (x, y) => listEq(x, y));
    if (simple) return [...simple];
    // Both sides changed the list: what they share at the start and the end stays as it is,
    // and the rest goes between markers, ours first.
    let start = 0;
    while (start < ov.length && start < tv.length && ov[start] === tv[start]) start++;
    let end = 0;
    while (end < ov.length - start && end < tv.length - start && ov[ov.length - 1 - end] === tv[tv.length - 1 - end]) end++;
    conflicts.push({ path, kind: 'text' });
    return [...ov.slice(0, start), textConflict(labels.ours, ov.slice(start, ov.length - end), labels.theirs, tv.slice(start, tv.length - end)), ...ov.slice(ov.length - end)];
  };
  const out: NodeData = {
    comments: comments(b.comments, o.comments, t.comments),
    startingComments: comments(b.startingComments, o.startingComments, t.startingComments),
    nags: [...(pick3(b.nags, o.nags, t.nags, (x, y) => listEq(x, y)) ?? mergeGlyphs(b.nags, o.nags, t.nags))],
    shapes: [...(pick3(b.shapes, o.shapes, t.shapes, shapesEq) ?? mergeShapes(b.shapes, o.shapes, t.shapes))],
  };
  for (const attr of ['clock', 'emt', 'eval'] as const) {
    // Absent is a value too: a clock removed on one side stays removed. A clash goes to ours.
    const [bv, ov, tv] = [b[attr], o[attr], t[attr]];
    const v = ov === tv || tv === bv ? ov : ov === bv ? tv : ov;
    if (v !== undefined) out[attr] = v;
  }
  return out;
}

/** Kept by both, or added by one: a set merge, ours' order first. */
function setMerge<T>(b: readonly T[], o: readonly T[], t: readonly T[], eq: (x: T, y: T) => boolean): T[] {
  const has = (list: readonly T[], x: T) => list.some((y) => eq(x, y));
  const out: T[] = [];
  for (const x of o) if (has(t, x) || !has(b, x)) out.push(x);
  for (const x of t) if (!has(out, x) && !has(b, x)) out.push(x);
  return out;
}

function mergeShapes(b: readonly Shape[], o: readonly Shape[], t: readonly Shape[]): Shape[] {
  const merged = setMerge(b, o, t, sameShape);
  return [...merged.filter((s) => !s.dest), ...merged.filter((s) => s.dest)];
}

function mergeGlyphs(b: readonly number[], o: readonly number[], t: readonly number[]): number[] {
  const single = (group: 'move' | 'position') => {
    const of = (list: readonly number[]) => list.find((n) => glyphGroup(n) === group);
    const [bv, ov, tv] = [of(b), of(o), of(t)];
    return ov === tv || tv === bv ? ov : ov === bv ? tv : ov;
  };
  const rest = (list: readonly number[]) => list.filter((n) => glyphGroup(n) === 'observation' || glyphGroup(n) === 'other');
  return [single('move'), single('position'), ...setMerge(rest(b), rest(o), rest(t), (x, y) => x === y)].filter((n): n is number => n !== undefined);
}

/**
 * The children's order: if ours changed the order of the children both sides have, ours;
 * otherwise theirs. A child only one side has goes after the sibling it followed on that side.
 */
function childOrder(b: TreeNode | undefined, o: TreeNode | undefined, t: TreeNode | undefined): string[] {
  const ko = o?.children.map((c) => c.san) ?? [];
  const kt = t?.children.map((c) => c.san) ?? [];
  const kb = b?.children.map((c) => c.san) ?? [];
  const inO = new Set(ko);
  const inT = new Set(kt);
  const common = (san: string) => inO.has(san) && inT.has(san);
  const oCommon = ko.filter(common);
  const order = listEq(oCommon, kb.filter(common)) ? kt.filter(common) : oCommon;
  insertAfterNeighbours(order, [ko, kt]);
  return order;
}

/**
 * Puts each item that only one list has after the item it followed in that list, ours first:
 * when both sides add after the same neighbour, ours' additions come before theirs'.
 */
export function insertAfterNeighbours(order: string[], lists: readonly (readonly string[])[]): void {
  const added = new Set<string>();
  for (const list of lists) {
    list.forEach((x, i) => {
      if (order.includes(x)) return;
      const before = list.slice(0, i).reverse().find((s) => order.includes(s));
      let at = before === undefined ? 0 : order.indexOf(before) + 1;
      while (at < order.length && added.has(order[at]!) && !list.includes(order[at]!)) at++;
      order.splice(at, 0, x);
      added.add(x);
    });
  }
}

const ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

/** Headers by key: a key changed on one side takes that side's value; on both, ours. */
function mergeHeaders(b: [string, string][], o: [string, string][], t: [string, string][]): [string, string][] {
  const eq = (x: [string, string][], y: [string, string][]) => listEq(x, y, (p, q) => p[0] === q[0] && p[1] === q[1]);
  if (eq(o, b) || eq(o, t)) return t.map(([k, v]) => [k, v]);
  if (eq(t, b)) return o.map(([k, v]) => [k, v]);
  const get = (list: [string, string][], k: string) => list.find(([n]) => n === k)?.[1];
  const out: [string, string][] = t.map(([k, v]) => [k, v]);
  const keys = [...new Set([...o.map(([k]) => k), ...t.map(([k]) => k), ...b.map(([k]) => k)])];
  for (const k of keys) {
    const [bv, ov, tv] = [get(b, k), get(o, k), get(t, k)];
    const v = ov === tv || tv === bv ? ov : ov === bv ? tv : ov;
    const i = out.findIndex(([n]) => n === k);
    if (v === undefined) {
      if (i >= 0) out.splice(i, 1);
    } else if (i >= 0) out[i] = [k, v];
    else {
      const rank = ROSTER.indexOf(k);
      const at = rank < 0 ? -1 : out.findIndex(([n]) => ROSTER.indexOf(n) < 0 || ROSTER.indexOf(n) > rank);
      out.splice(at < 0 ? out.length : at, 0, [k, v]);
    }
  }
  return out;
}
