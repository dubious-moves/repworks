// Repertoire coverage (PLAN.md §5.26), after lichessable's section 21 and its
// DESIGN-repertoire-coverage.md, on studies instead of Chessable courses: which lines of a
// reference study (a course) the repertoire doesn't have, ranked by how likely they are met.
// - Coverage is a tree question, position-keyed (D10's key): each line of the reference study is
//   walked against every move the repertoire's chapters of that side play (own and opponent
//   moves alike) to its first divergence, so a line already there under another name, copied
//   from another course or edited since, comes out present.
// - What the repertoire has at the divergence decides what it is (lichessable's four rows): on
//   our move, nothing is a **hole** and another move an **alternative** (a choice, not a gap); on
//   the opponent's, nothing means the repertoire's line **ends** there and other moves an **unmet
//   option**. A line whose start the repertoire never reaches is **unreachable**: it can't be
//   ranked. A line reaching the repertoire's positions by another move order is reported at the
//   first move the repertoire doesn't have, which is right: nothing is prepared against it.
// - Ranking (`rank`): P is the product of the opponent's moves' shares (games(move)/games(position),
//   the explorer's answers at the panel's filter) from the start to the divergence, the divergence
//   move itself included only for an unmet option (a hole is reached once its position is on the
//   board; where the line ends any opponent move leaves us unprepared). Conditional on the study's
//   root (the deepest position all its lines share) and unconditional; a position under
//   `minGames` games ends the product, marked truncated; score = P_cond × exp(−d / D).
// - Gaps are grouped by their divergence (position and move): five lines behind one unanswered
//   move are one thing to fix.
// Pure: the explorer's answers are passed in.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { isNormal } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { standardUci } from '../chess/uci.ts';
import { header, type Chapter, type MoveNode } from '../study/model.ts';
import { startPosition, type Path } from '../study/tree.ts';
import type { CompactExplorer } from './providers.ts';

export type Severity = 'hole' | 'ends' | 'unreachable' | 'unmet' | 'alternative';

/** lichessable's order of severity: holes first, alternatives (no gap) last. */
export const SEVERITY_RANK: Record<Severity, number> = { hole: 0, ends: 1, unreachable: 2, unmet: 3, alternative: 4 };

/** Where the repertoire reaches a position: a chapter and the path of moves to it. */
export interface Place {
  sid: string;
  cid: string;
  path: Path;
}

/** Everything the repertoire knows, for one side. */
export interface RepTree {
  /** The moves played at each position (own and opponent moves). */
  answers: Map<PositionKey, Set<string>>;
  /** Where each position is reached (a chapter's start or after a move), first place first. */
  places: Map<PositionKey, Place[]>;
}

/** The chapter's side: its `Orientation`, white unless it says black. */
export const sideOf = (chapter: Chapter): Color => (header(chapter, 'Orientation') === 'black' ? 'black' : 'white');

/** The tree of the repertoire chapters given (the caller picks the side and the studies). */
export function repertoireTree(chapters: readonly { sid: string; chapter: Chapter }[]): RepTree {
  const answers = new Map<PositionKey, Set<string>>();
  const places = new Map<PositionKey, Place[]>();
  const place = (key: PositionKey, p: Place) => {
    const list = places.get(key);
    if (list) list.push(p);
    else places.set(key, [p]);
  };
  for (const { sid, chapter } of chapters) {
    const start = startPosition(chapter);
    if (!start) continue;
    const cid = chapter.id;
    place(positionKeyOf(start), { sid, cid, path: [] });
    const walk = (pos: Position, children: readonly MoveNode[], path: string[]) => {
      const key = positionKeyOf(pos);
      for (const child of children) {
        const move = parseSan(pos, child.san);
        if (!move || !isNormal(move)) continue;
        let set = answers.get(key);
        if (!set) answers.set(key, (set = new Set()));
        set.add(standardUci(pos, move));
        const next = pos.clone();
        next.play(move);
        const at = [...path, child.san];
        place(positionKeyOf(next), { sid, cid, path: at });
        walk(next, child.children, at);
      }
    };
    walk(start, chapter.root.children, []);
  }
  return { answers, places };
}

export interface CoursePly {
  san: string;
  uci: string;
  /** Whose move it is. */
  turn: Color;
  /** The position before the move: its key, and its FEN for the explorer. */
  before: PositionKey;
  fen: string;
}

/** One root-to-leaf line of a reference chapter. */
export interface CourseLine {
  cid: string;
  /** The chapter's side. */
  side: Color;
  path: string[];
  plies: CoursePly[];
  /** The start position's key. */
  start: PositionKey;
}

/** Every line of the chapters, in tree order (main line first), as far as its moves are legal. */
export function courseLines(chapters: readonly Chapter[]): { lines: CourseLine[]; unreadable: { cid: string; reason: string }[] } {
  const lines: CourseLine[] = [];
  const unreadable: { cid: string; reason: string }[] = [];
  for (const chapter of chapters) {
    const start = startPosition(chapter);
    if (!start) {
      unreadable.push({ cid: chapter.id, reason: 'its start position isn’t legal' });
      continue;
    }
    const side = sideOf(chapter);
    const startKey = positionKeyOf(start);
    const walk = (pos: Position, children: readonly MoveNode[], plies: CoursePly[]) => {
      const legal: { child: MoveNode; ply: CoursePly; next: Position }[] = [];
      for (const child of children) {
        const move = parseSan(pos, child.san);
        if (!move || !isNormal(move)) continue;
        const next = pos.clone();
        next.play(move);
        legal.push({ child, next, ply: { san: child.san, uci: standardUci(pos, move), turn: pos.turn, before: positionKeyOf(pos), fen: makeFen(pos.toSetup()) } });
      }
      if (!legal.length) {
        if (plies.length) lines.push({ cid: chapter.id, side, path: plies.map((p) => p.san), plies, start: startKey });
        return;
      }
      for (const { child, ply, next } of legal) walk(next, child.children, [...plies, ply]);
    };
    walk(start, chapter.root.children, []);
  }
  return { lines, unreadable };
}

export interface Divergence {
  /** The ply where the line leaves the repertoire. */
  at: number;
  severity: Severity;
}

/** Where `line` first leaves the repertoire; undefined when every move of it is there. */
export function firstDivergence(line: CourseLine, rep: RepTree, side: Color): Divergence | undefined {
  const at = line.plies.findIndex((p) => !rep.answers.get(p.before)?.has(p.uci));
  if (at < 0) return undefined;
  const ply = line.plies[at]!;
  // Only possible at the start: every later position is reached along a move the repertoire plays.
  if (!rep.places.has(ply.before)) return { at, severity: 'unreachable' };
  const branches = (rep.answers.get(ply.before)?.size ?? 0) > 0;
  if (ply.turn === side) return { at, severity: branches ? 'alternative' : 'hole' };
  return { at, severity: branches ? 'unmet' : 'ends' };
}

/** A line behind a gap, with its ranking once `rank` has the explorer's answers. */
export interface GapLine {
  line: CourseLine;
  /** Reach from the start, and from the study's root; undefined when it can't be ranked. */
  p?: number;
  pCond?: number;
  truncated?: boolean;
  score?: number;
}

/** The lines leaving the repertoire at one position by one move. */
export interface Gap {
  /** `<position key>|<uci>`. */
  key: string;
  severity: Severity;
  /** The first line's ply of the divergence; its moves up to it are `path`, then `san`. */
  at: number;
  path: string[];
  san: string;
  cid: string;
  /** The position before the divergence move. */
  before: PositionKey;
  lines: GapLine[];
  /** The best of its lines' (filled by `rank`). */
  p?: number;
  pCond?: number;
  truncated?: boolean;
  score?: number;
}

export interface CoverageReport {
  side: Color;
  /** Lines of the reference study, and those present in the repertoire. */
  lines: number;
  present: number;
  /** Lines of chapters written for the other side: compared all the same, their ranking means little. */
  otherSide: number;
  unreadable: { cid: string; reason: string }[];
  /** The deepest ply all the study's lines share (the "conditional on"); 0 when their starts differ. */
  rootPly: number;
  /** Every divergence, alternatives included, in the study's order. */
  gaps: Gap[];
}

/** The deepest ply every line shares, from one start. */
export function rootPlyOf(lines: readonly CourseLine[]): number {
  if (!lines.length) return 0;
  const first = lines[0]!;
  if (!lines.every((l) => l.start === first.start)) return 0;
  let n = 0;
  for (;; n++) {
    const ply = first.plies[n];
    if (!ply || !lines.every((l) => l.plies[n]?.uci === ply.uci)) return n;
  }
}

/** The reference study's chapters against the repertoire tree of `side`. */
export function coverage(chapters: readonly Chapter[], rep: RepTree, side: Color): CoverageReport {
  const { lines, unreadable } = courseLines(chapters);
  const gaps = new Map<string, Gap>();
  let present = 0;
  for (const line of lines) {
    const d = firstDivergence(line, rep, side);
    if (!d) {
      present++;
      continue;
    }
    const ply = line.plies[d.at]!;
    const key = `${ply.before}|${ply.uci}`;
    const gap = gaps.get(key);
    if (gap) {
      gap.lines.push({ line });
      // The shallowest line names it.
      if (d.at < gap.at) Object.assign(gap, { at: d.at, path: line.path.slice(0, d.at), cid: line.cid });
      continue;
    }
    gaps.set(key, { key, severity: d.severity, at: d.at, path: line.path.slice(0, d.at), san: ply.san, cid: line.cid, before: ply.before, lines: [{ line }] });
  }
  return { side, lines: lines.length, present, otherSide: lines.filter((l) => l.side !== side).length, unreadable, rootPly: rootPlyOf(lines), gaps: [...gaps.values()] };
}

/** The opponent plies a line's gap depends on, with their index (lichessable's `riskPlies`). */
function riskPlies(line: CourseLine, at: number, severity: Severity, side: Color): { i: number; ply: CoursePly }[] {
  const out: { i: number; ply: CoursePly }[] = [];
  for (let i = 0; i <= at; i++) {
    const ply = line.plies[i]!;
    if (ply.turn === side) continue;
    if (i === at && severity !== 'unmet') continue;
    out.push({ i, ply });
  }
  return out;
}

/** The positions whose explorer answers ranking needs, by key, with a FEN to ask by. */
export function positionsToRank(report: CoverageReport): Map<PositionKey, string> {
  const out = new Map<PositionKey, string>();
  for (const gap of report.gaps) {
    if (gap.severity === 'unreachable' || gap.severity === 'alternative') continue;
    for (const { line } of gap.lines) {
      const at = line.plies.findIndex((p) => `${p.before}|${p.uci}` === gap.key);
      for (const { ply } of riskPlies(line, at, gap.severity, report.side)) if (!out.has(ply.before)) out.set(ply.before, ply.fen);
    }
  }
  return out;
}

export interface RankOptions {
  /** A position with fewer games ends the product (lichessable: 50). */
  minGames: number;
  /** The depth discount's D, in plies (lichessable: 16). */
  depth: number;
}
export const RANK_DEFAULTS: RankOptions = { minGames: 50, depth: 16 };

const bare = (san: string) => san.replace(/[+#]$/, '');

function unrank(x: { p?: number; pCond?: number; truncated?: boolean; score?: number }) {
  delete x.p;
  delete x.pCond;
  delete x.truncated;
  delete x.score;
}

/**
 * Fills each gap's and line's P, P from the root, truncation and score from the explorer's
 * answers by position key. A line with a position not answered (not asked yet, or refused) is
 * left unranked, as are unreachable lines and alternatives; a position answered with fewer than
 * `minGames` games ends the product, marked truncated.
 */
export function rank(report: CoverageReport, answers: ReadonlyMap<PositionKey, CompactExplorer | undefined>, options: RankOptions = RANK_DEFAULTS): void {
  for (const gap of report.gaps) {
    if (gap.severity === 'unreachable' || gap.severity === 'alternative') continue;
    let best: GapLine | undefined;
    for (const g of gap.lines) {
      const at = g.line.plies.findIndex((p) => `${p.before}|${p.uci}` === gap.key);
      let p = 1;
      let pCond = 1;
      let truncated = false;
      let unknown = false;
      for (const { i, ply } of riskPlies(g.line, at, gap.severity, report.side)) {
        if (!answers.has(ply.before)) {
          unknown = true;
          break;
        }
        const data = answers.get(ply.before);
        if (!data || data.total < options.minGames) {
          truncated = true;
          break;
        }
        const games = data.moves.find((m) => bare(m.san) === bare(ply.san))?.games ?? 0;
        const share = games / data.total;
        p *= share;
        if (i >= report.rootPly) pCond *= share;
      }
      if (unknown) {
        unrank(g);
        continue;
      }
      Object.assign(g, { p, pCond, truncated, score: pCond * Math.exp(-at / Math.max(1, options.depth)) });
      if (!best || g.score! > best.score!) best = g;
    }
    if (best) Object.assign(gap, { p: best.p, pCond: best.pCond, truncated: best.truncated, score: best.score });
    else unrank(gap);
  }
}

/** Gaps for the report: the alternatives apart, the rest by score (unranked last, by depth). */
export function sortGaps(gaps: readonly Gap[], by: 'score' | 'depth' | 'severity' = 'score'): Gap[] {
  return [...gaps].sort((a, b) => {
    if (by === 'depth') return a.at - b.at || (b.score ?? -1) - (a.score ?? -1);
    if (by === 'severity') return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.score ?? -1) - (a.score ?? -1) || a.at - b.at;
    return (b.score ?? -1) - (a.score ?? -1) || a.at - b.at;
  });
}
