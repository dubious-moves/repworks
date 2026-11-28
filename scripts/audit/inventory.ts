// A subtree's inventory (PLAN.md §5.219): every position below a line where the opponent is to
// move and the study drills a reply, with each reply's share of the games there, how often our
// games reach it (the product of the opponent's shares from the start, summed over every move
// order the study has to the position), what we play, and whether the line ends after our one
// move. Tags: C common (reached 1 in 2,000 games or more and 10% or more at its position), O the
// reply is in the owner's own file, S a single-move branch. Pure: the explorer's answers come in
// as a function, and a position it can't answer is listed, never counted as empty.
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { positionKeyOf, type PositionKey } from '../../src/core/chess/positionKey.ts';
import type { CompactExplorer } from '../../src/core/explorer/providers.ts';
import type { Chapter } from '../../src/core/study/model.ts';
import { GUIDE_REACH, GUIDE_SHARE } from './difficulty.ts';
import { chapterName, lineOf, nodeAtSans, visits, type TreeNode } from './study.ts';

/** The games at a position by its FEN, or undefined when they are not known. */
export type Games = (fen: string) => CompactExplorer | undefined;

export interface Reply {
  san: string;
  /** Its share of the games at the position, 0 to 1. */
  share: number;
  games: number;
  /** Reach by this move order alone, and over every order the study has. */
  reach: number;
  reachAll: number;
  /** What we play after it. */
  ours: string[];
  /** Our moves below it. */
  below: number;
  single: boolean;
  common: boolean;
  /** In one of the owner's own files. */
  owner: boolean;
  /** The first words of the comment on our move after it. */
  comment: string;
}

export interface Row {
  chapter: string;
  path: string[];
  line: string;
  games: number;
  reach: number;
  reachAll: number;
  replies: Reply[];
  /** Replies played in 2% of the games or more that the study doesn't drill here; `elsewhere` when the position after them continues somewhere in the study. */
  uncovered: { san: string; share: number; games: number; elsewhere: boolean }[];
}

export interface Inventory {
  rows: Row[];
  /** Positions the explorer's answer was missing for: the counts above them are not to be trusted. */
  unknown: string[];
}

const isBelow = (path: readonly string[], prefix: readonly string[]) => prefix.every((s, i) => path[i] === s);
const oursBelow = (n: TreeNode, ours: boolean): number => n.children.reduce((a, c) => a + (ours ? 1 : 0) + oursBelow(c, !ours), 0);
const gamesOfMove = (ex: CompactExplorer, san: string): number => {
  const m = ex.moves.find((x) => x.san === san);
  return m ? (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0) : 0;
};

interface Edge {
  from: PositionKey;
  to: PositionKey;
  san: string;
  /** The opponent's move: it carries a share. Ours is always played. */
  theirs: boolean;
  /** The position it is played from, as a FEN (for the explorer). */
  fen: string;
}

/**
 * The study as positions joined by moves, whatever chapter and move order they are in: a line that
 * ends in a "transposes to" note reaches the position its note names, so what is reached that way
 * flows on through the place where the position continues.
 */
function graph(chapters: readonly Chapter[]): { into: Map<PositionKey, Edge[]>; roots: Set<PositionKey> } {
  const edges = new Map<string, Edge>();
  const roots = new Set<PositionKey>();
  for (const c of chapters) {
    for (const v of visits(c)) {
      if (v.path.length === 1) roots.add(positionKeyOf(v.before));
      const from = positionKeyOf(v.before);
      const id = `${from}|${v.node.san}`;
      if (!edges.has(id)) edges.set(id, { from, to: positionKeyOf(v.after), san: v.node.san, theirs: !v.ours, fen: makeFen(v.before.toSetup()) });
    }
  }
  const into = new Map<PositionKey, Edge[]>();
  for (const e of edges.values()) into.set(e.to, [...(into.get(e.to) ?? []), e]);
  return { into, roots };
}

/** The positions of the subtree where the opponent is to move and the study has a reply. */
function insideOf(chapter: Chapter, prefix: readonly string[]): Set<PositionKey> {
  const inside = new Set<PositionKey>();
  for (const v of visits(chapter)) if (!v.ours && isBelow(v.path.slice(0, -1), prefix)) inside.add(positionKeyOf(v.before));
  return inside;
}

/**
 * The positions whose games an inventory of `prefix` in `chapter` needs: the subtree's own (where
 * the opponent is to move), and every position with the opponent to move on any way into them, by
 * any chapter and move order.
 */
export function positionsNeeded(chapters: readonly Chapter[], chapter: Chapter, prefix: readonly string[]): string[] {
  const at = nodeAtSans(chapter, prefix);
  if (!at) throw new Error(`no such line in ${chapterName(chapter)}: ${prefix.join(' ')}`);
  const { into } = graph(chapters);
  const fens = new Set<string>();
  for (const v of visits(chapter)) if (!v.ours && isBelow(v.path.slice(0, -1), at.path)) fens.add(makeFen(v.before.toSetup()));
  const seen = new Set<PositionKey>();
  const back = (key: PositionKey) => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const e of into.get(key) ?? []) {
      if (e.theirs) fens.add(e.fen);
      back(e.from);
    }
  };
  for (const key of insideOf(chapter, at.path)) back(key);
  return [...fens];
}

/** The inventory of the subtree below `prefix` (SANs from the chapter's start). */
export function inventory(chapters: readonly Chapter[], chapter: Chapter, prefix: readonly string[], games: Games, owner: readonly Chapter[] = []): Inventory {
  const at = nodeAtSans(chapter, prefix);
  if (!at) throw new Error(`no such line in ${chapterName(chapter)}: ${prefix.join(' ')}`);
  const unknown = new Set<string>();
  const shareAt = (fen: string, san: string): number => {
    const ex = games(fen);
    if (!ex) {
      unknown.add(fen);
      return Number.NaN;
    }
    return ex.total ? gamesOfMove(ex, san) / ex.total : 0;
  };

  // Reach over every move order: a position's reach is the sum over the moves into it.
  const { into, roots } = graph(chapters);
  const memo = new Map<PositionKey, number>();
  const walking = new Set<PositionKey>();
  const reachOf = (key: PositionKey): number => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (walking.has(key)) return 0;
    walking.add(key);
    let r = roots.has(key) ? 1 : 0;
    for (const e of into.get(key) ?? []) r += reachOf(e.from) * (e.theirs ? shareAt(e.fen, e.san) : 1);
    walking.delete(key);
    memo.set(key, r);
    return r;
  };

  const continued = new Set<PositionKey>();
  for (const c of chapters) for (const v of visits(c)) if (v.node.children.length) continued.add(positionKeyOf(v.after));
  const ownerPaths = new Set<string>();
  for (const o of owner) for (const v of visits(o)) ownerPaths.add(v.path.join(' '));

  const rows: Row[] = [];
  const seen = new Set<string>();
  // Reach by this line's own order: the product of the opponent's shares along it.
  const along: number[] = [1];
  for (const v of visits(chapter)) {
    const depth = v.path.length - 1;
    const onWay = isBelow(v.path, at.path.slice(0, v.path.length)) || isBelow(v.path, at.path);
    if (!onWay) continue;
    const fen = makeFen(v.before.toSetup());
    along[depth + 1] = (along[depth] ?? Number.NaN) * (v.ours ? 1 : shareAt(fen, v.node.san));
    if (v.ours || !isBelow(v.path.slice(0, -1), at.path)) continue;
    const here = v.path.slice(0, -1);
    const id = here.join(' ');
    if (seen.has(id)) continue;
    seen.add(id);
    const ex = games(fen);
    if (!ex) unknown.add(fen);
    const reach = along[depth] ?? Number.NaN;
    const all = reachOf(positionKeyOf(v.before));
    const replies: Reply[] = v.parent.children.map((child) => {
      const share = ex ? (ex.total ? gamesOfMove(ex, child.san) / ex.total : 0) : Number.NaN;
      const single = child.children.length === 1 && child.children[0]!.children.length === 0;
      return {
        san: child.san,
        share,
        games: ex ? gamesOfMove(ex, child.san) : 0,
        reach: reach * share,
        reachAll: all * share,
        ours: child.children.map((c) => c.san),
        below: oursBelow(child, true),
        single,
        common: all * share >= GUIDE_REACH && share >= GUIDE_SHARE,
        owner: ownerPaths.has([...here, child.san].join(' ')),
        comment: (child.children[0]?.comments ?? []).join(' ').replace(/\s+/g, ' ').slice(0, 60),
      };
    });
    const uncovered = (ex?.moves ?? [])
      .filter((m) => !replies.some((r) => r.san === m.san))
      .map((m) => {
        const n = gamesOfMove(ex!, m.san);
        const after = v.before.clone();
        const move = parseSan(after, m.san);
        if (move) after.play(move);
        return { san: m.san, share: ex!.total ? n / ex!.total : 0, games: n, elsewhere: move !== undefined && continued.has(positionKeyOf(after)) };
      })
      .filter((m) => m.share >= 0.02);
    rows.push({ chapter: chapterName(chapter), path: here, line: lineOf(chapter, here), games: ex?.total ?? 0, reach, reachAll: all, replies, uncovered });
  }
  return { rows, unknown: [...unknown] };
}

/** "1 in 2,113", "-" for every game, "0" for none, "?" when it is not known. */
export function oneIn(x: number): string {
  if (Number.isNaN(x)) return '?';
  return x >= 1 ? '-' : x > 0 ? `1 in ${Math.round(1 / x).toLocaleString('en')}` : '0';
}

/** The inventory as a table: a block a position, a row a reply. */
export function inventoryText(inv: Inventory, exceptions: readonly string[] = []): string {
  const out: string[] = [];
  let replies = 0;
  let single = 0;
  const excepted = new Set(exceptions.map((e) => e.replace(/\s+/g, ' ').trim()));
  for (const r of inv.rows) {
    out.push('', `${r.line} | ${r.games.toLocaleString('en')} games | ${oneIn(r.reach)}${r.reachAll > r.reach * 1.05 ? ` (all orders ${oneIn(r.reachAll)})` : ''}`);
    for (const x of r.replies) {
      replies++;
      if (x.single) single++;
      const tags = `${x.common ? 'C' : ' '}${x.owner ? 'O' : ' '}${x.single ? 'S' : ' '}`;
      const share = Number.isNaN(x.share) ? '  ?' : (100 * x.share).toFixed(0).padStart(3);
      out.push(`   ${tags} ${x.san.padEnd(7)} ${share}% ${x.games.toLocaleString('en').padStart(9)}g ${oneIn(x.reachAll).padStart(14)}  -> ${x.ours.length ? `${x.ours.join('/').padEnd(7)} ${x.single ? 'single' : `${x.below} below`}` : 'a note: the line ends here'}`);
    }
    const open = r.uncovered.filter((m) => !m.elsewhere);
    if (open.length) out.push(`   not drilled: ${open.map((m) => `${m.san} ${(100 * m.share).toFixed(0)}% ${m.games}g${excepted.has(`${r.line} ${m.san}`) ? ' (the owner’s exception)' : ''}`).join(', ')}`);
  }
  out.push('', `positions ${inv.rows.length}, replies ${replies}, single-move ${single}`);
  if (inv.unknown.length) out.push(`NOT COMPLETE: the explorer's answer is missing for ${inv.unknown.length} position(s); shares and reach above them are not known. Run without --offline (LICHESS_TOKEN) to fetch them.`);
  return out.join('\n').replace(/^\n/, '');
}
