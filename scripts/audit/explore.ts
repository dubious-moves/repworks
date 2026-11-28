// cdbexplore for the repertoire audit (PLAN.md §5.220). q_extension's tools/cdbexplore.mjs builds
// ChessDB's own tree below a PGN's line ends and the close decisions of the repertoire's side, so
// ChessDB's evals there rest on more than one search. This module is what the audit needs around
// it: the PGN the tool wants (the opponent's moves carrying their share of the games, the lines
// that end in a "transposes to" note left out), its record and log read back as a report the next
// worker finds in the data repo (`notes/<sid>/cdbexplore/<name>.md` and `.json`), and the time
// before which a cached ChessDB answer is stale. Pure: chapters, texts and answers in.
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { ChildNode, defaultGame, makePgn, Node, type PgnNodeData } from 'chessops/pgn';
import { makeSan, parseSan } from 'chessops/san';
import type { CompactExplorer } from '../../src/core/explorer/providers.ts';
import type { ChessdbAnswer } from '../../src/core/explorer/search.ts';
import { header, type Chapter } from '../../src/core/study/model.ts';
import { lineText } from '../../src/core/study/search.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { chapterName, sideOf, type Colour, type TreeNode } from './study.ts';

export const exploreDir = (sid: string) => `notes/${sid}/cdbexplore/`;
export const EXPLORE_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** A name for an exploration from what it covers: the subtree's moves, or the chapter's name. */
export function exploreName(chapter: Chapter, line: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/\d+\.(\.\.)?/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (line.trim() ? slug(line) : slug(chapterName(chapter)) || chapter.id.toLowerCase()).slice(0, 80);
}

const isJoin = (n: TreeNode & { comments?: string[] }) => !n.children.length && (n.comments ?? []).some((t) => /transposes to|continues in/.test(t));

export interface ExplorePgn {
  text: string;
  /** Positions where the opponent is to move and a share was written. */
  shared: number;
  /** Positions whose games are not known: their moves carry no share, and the tool's order by reach is off. */
  missing: string[];
  /** Lines left out: they end in a "transposes to" note, and their position is explored where it continues. */
  dropped: number;
  /** Line ends in the file. */
  ends: number;
}

/**
 * A chapter, or the subtree below `prefix` with the moves that lead to it, as the PGN cdbexplore
 * reads: `[White "Repertoire"]` (or Black) names the repertoire's side, every move of the opponent
 * carries its share of the games at its position (`{ 27.3% }`), so the tool explores the most
 * reached positions first; comments, glyphs and arrows are left out, and so is a line that ends in
 * a "transposes to" note. `RepworksChapter` and `RepworksLine` say what it was made from.
 */
export function explorePgn(o: { study: string; chapter: Chapter; prefix: readonly string[]; games: (fen: string) => CompactExplorer | undefined }): ExplorePgn {
  const { chapter, prefix } = o;
  const start = startPosition(chapter);
  if (!start) throw new Error(`${chapterName(chapter)}: its start position can't be read`);
  const side = sideOf(chapter);
  const out: ExplorePgn = { text: '', shared: 0, missing: [], dropped: 0, ends: 0 };
  const game = defaultGame<PgnNodeData>(() => new Map());
  const line = lineText(start, prefix);
  game.headers = new Map([
    ['Event', `${o.study}: ${chapterName(chapter)}${line ? `, ${line}` : ''}`],
    ['White', side === 'white' ? 'Repertoire' : '?'],
    ['Black', side === 'black' ? 'Repertoire' : '?'],
    ['Result', '*'],
    ['Orientation', side],
    ['RepworksChapter', chapter.id],
    ['RepworksLine', line],
    ...(header(chapter, 'FEN') ? ([['FEN', header(chapter, 'FEN')!], ['SetUp', '1']] as [string, string][]) : []),
  ]);
  const walk = (from: TreeNode, to: Node<PgnNodeData>, pos: Chess, depth: number) => {
    // On the way to the subtree, only the move that leads there; below it, every move but the joins.
    const kept = depth < prefix.length ? from.children.filter((c) => c.san === prefix[depth]) : from.children.filter((c) => !isJoin(c));
    out.dropped += depth < prefix.length ? 0 : from.children.length - kept.length;
    if (!kept.length) {
      out.ends++;
      return;
    }
    const theirs = pos.turn !== side;
    const fen = makeFen(pos.toSetup());
    const ex = theirs ? o.games(fen) : undefined;
    if (theirs && !ex) out.missing.push(fen);
    if (theirs && ex) out.shared++;
    for (const c of kept) {
      const move = parseSan(pos, c.san);
      if (!move) continue;
      const san = makeSan(pos, move);
      const m = ex?.moves.find((x) => x.san === san);
      const share = ex ? (100 * ((m?.white ?? 0) + (m?.draws ?? 0) + (m?.black ?? 0))) / Math.max(1, ex.total) : undefined;
      const child = new ChildNode<PgnNodeData>({ san, ...(share !== undefined ? { comments: [`${share.toFixed(1)}%`] } : {}) });
      to.children.push(child);
      const next = pos.clone();
      next.play(move);
      walk(c, child, next, depth + 1);
    }
  };
  walk(chapter.root, game.moves, start.clone(), 0);
  out.text = makePgn(game);
  return out;
}

/**
 * One line that ends at a position, for an exploration on demand: the moves to the position, and
 * when a decision of ours there hangs on ChessDB's eval, each candidate as a move from it (the
 * first the main line, the others as variations), so the positions after them are the line ends
 * the tool deepens. Undefined when a move is not legal.
 */
export function linePgn(o: { moves: readonly string[]; candidates?: readonly string[]; side: Colour; event: string }): string | undefined {
  const pos = Chess.default();
  const game = defaultGame<PgnNodeData>(() => new Map());
  game.headers = new Map([['Event', o.event], ['White', o.side === 'white' ? 'Repertoire' : '?'], ['Black', o.side === 'black' ? 'Repertoire' : '?'], ['Result', '*'], ['Orientation', o.side], ['RepworksLine', lineText(Chess.default(), o.moves)]]);
  let at: Node<PgnNodeData> = game.moves;
  for (const san of o.moves) {
    const move = parseSan(pos, san);
    if (!move) return undefined;
    const child = new ChildNode<PgnNodeData>({ san: makeSan(pos, move) });
    at.children.push(child);
    at = child;
    pos.play(move);
  }
  for (const san of o.candidates ?? []) {
    const move = parseSan(pos, san);
    if (!move) return undefined;
    at.children.push(new ChildNode<PgnNodeData>({ san: makeSan(pos, move) }));
  }
  return makePgn(game);
}

/* ------------------------------------------------------------------ the tool's record and log */

interface Scored {
  san: string;
  /** Centipawns for the side to move at the position. */
  score: number;
}
interface Seen {
  best: Scored;
  mine: Scored | null;
  rival: Scored | null;
  /** ChessDB's stored line from the position, in plies. */
  line: number;
}
/** One explored position in cdbexplore's `<name>.explore.json`. */
export interface Target {
  fen: string;
  /** "[0.52%] 1.Nc3 d5 2.d4": the tool's own form. */
  line: string;
  reason: string;
  reach?: number | null;
  before: Seen;
  after: Seen | null;
  stopped?: string;
  requests?: number;
  ms?: number;
  at: string;
}

export function parseRecord(text: string | undefined): Target[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const targets = (raw as { targets?: Record<string, Target> } | null)?.targets;
  if (typeof targets !== 'object' || targets === null) return [];
  return Object.values(targets).filter((t) => t && typeof t.fen === 'string' && typeof t.line === 'string' && typeof t.at === 'string' && t.before?.best !== undefined);
}

export interface LogRead {
  /** Runs started (each asks ChessDB about every position first). */
  runs: number;
  /** The last run's survey: the positions it picked, and those of them explored in the last days. */
  survey?: { targets: number; ends: number; decisions: number; recent: number };
  /** Positions the last run finished after its survey. */
  finished: number;
  /** "Time is up with N positions left", of the last run. */
  timeUp?: number;
  /** The last run reached its end ("Done: …"), with its pace line. */
  done?: string;
  /** Requests ChessDB refused for its rate limit, over every run in the log. */
  refused: number;
}

/** cdbexplore's `<name>.explore.log`, read for where the exploration stands. */
export function parseLog(text: string | undefined): LogRead {
  const out: LogRead = { runs: 0, finished: 0, refused: 0 };
  for (const raw of (text ?? '').split('\n')) {
    const l = raw.replace(/^\d\d:\d\d:\d\d /, '');
    if (l.startsWith('cdbexplore: ')) {
      out.runs++;
      delete out.survey;
      delete out.timeUp;
      delete out.done;
      out.finished = 0;
      continue;
    }
    const s = /^Survey: (\d+) positions? to explore \((\d+) line ends?, (\d+) decisions?\)(?:, (\d+) of them explored recently)?/.exec(l);
    if (s) {
      out.survey = { targets: Number(s[1]), ends: Number(s[2]), decisions: Number(s[3]), recent: Number(s[4] ?? 0) };
      out.finished = 0;
    } else if (/^ {2}\S+ after \d+m\d\ds, \d+ requests/.test(l)) out.finished++;
    else if (/^Time is up with (\d+) positions? left/.test(l)) out.timeUp = Number(/(\d+)/.exec(l)![1]);
    else if (l.startsWith('Done: ')) out.done = l.slice(6).replace(/\.$/, '');
    else if (l.startsWith('ChessDB refused a request')) out.refused++;
  }
  return out;
}

/** What is left of the last survey: the positions it picked that are not explored yet. Undefined before any survey. */
export function leftOf(log: LogRead): number | undefined {
  if (!log.survey) return undefined;
  if (log.timeUp !== undefined) return log.timeUp;
  return Math.max(0, log.survey.targets - log.survey.recent - log.finished);
}

/** "[0.52%] 1.Nc3 d5 2.d4 Nf6" as the owner reads lines: "1. Nc3 d5 2. d4 Nf6". */
export const fullLine = (toolLine: string) => toolLine.replace(/^\[[\d.]+%\]\s*/, '').replace(/(\d+)\.(?=[^.\s])/g, '$1. ').replace(/(\d+)\.\.\.(?=\S)/g, '$1... ');

const whiteCp = (score: number, fen: string) => (fen.split(' ')[1] === 'b' ? -score : score);
const MATE_FROM = 10000;
export function pawnsText(cp: number): string {
  if (Math.abs(cp) >= MATE_FROM) return cp > 0 ? '+M' : '-M';
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}
const seenText = (s: Scored, fen: string) => `${s.san} ${pawnsText(whiteCp(s.score, fen))}`;

export const MOVED_CP = 30;

/** A position where exploring changed what ChessDB says: its best move, or its eval by 0.30 or more. */
export function changed(t: Target): boolean {
  if (!t.after) return false;
  return t.after.best.san !== t.before.best.san || Math.abs(t.after.best.score - t.before.best.score) >= MOVED_CP;
}

export interface Behind {
  /** The line to the position, in full. */
  line: string;
  ours: string;
  best: string;
  /** Centipawns from White's side. */
  oursCp: number;
  bestCp: number;
  /** How far ours is behind, in centipawns (for the side to move). */
  gap: number;
}

/**
 * Our moves that ChessDB now has 0.30 or more behind its best, over every position of the explored
 * PGN where we move: `answers` are ChessDB's, asked after the exploration. A position ChessDB has
 * no scored move for is skipped; `unknown` counts them.
 */
export function behindRows(pgn: Chapter, answers: (fen: string) => ChessdbAnswer | undefined): { rows: Behind[]; asked: number; unknown: number } {
  const start = startPosition(pgn);
  const side = sideOf(pgn);
  const rows: Behind[] = [];
  let asked = 0;
  let unknown = 0;
  if (!start) return { rows, asked, unknown };
  const seen = new Set<string>();
  const walk = (n: TreeNode, pos: Chess, path: string[]) => {
    if (pos.turn === side && n.children.length) {
      const fen = makeFen(pos.toSetup());
      if (!seen.has(fen)) {
        seen.add(fen);
        asked++;
        const moves = (answers(fen)?.moves ?? []).filter((m) => Number.isFinite(m.score));
        if (!moves.length) unknown++;
        else {
          const best = moves.reduce((a, b) => (b.score > a.score ? b : a));
          for (const c of n.children) {
            const move = parseSan(pos, c.san);
            const ours = move && moves.find((m) => m.san.replace(/[+#]/g, '') === makeSan(pos, move).replace(/[+#]/g, ''));
            if (!ours || best.score - ours.score < MOVED_CP) continue;
            rows.push({ line: lineText(start, path), ours: ours.san, best: best.san, oursCp: whiteCp(ours.score, fen), bestCp: whiteCp(best.score, fen), gap: best.score - ours.score });
          }
        }
      }
    }
    for (const c of n.children) {
      const move = parseSan(pos, c.san);
      if (!move) continue;
      const next = pos.clone();
      next.play(move);
      walk(c, next, [...path, c.san]);
    }
  };
  walk(pgn.root, start.clone(), []);
  return { rows: rows.sort((a, b) => b.gap - a.gap), asked, unknown };
}

/** The positions of an explored PGN where we move, for the sweep that asks ChessDB about each. */
export function ourPositions(pgn: Chapter): string[] {
  const out = new Set<string>();
  behindRows(pgn, (fen) => (out.add(fen), undefined));
  return [...out];
}

/** Where an exploration stands: `notes/<sid>/cdbexplore/<name>.json`, written with the report. */
export interface ExploreState {
  v: 1;
  name: string;
  /** What was explored: the chapter's id and the subtree's line ('' for the whole chapter), from the PGN's headers. */
  chapter?: string;
  line?: string;
  /** When the last position was explored (ISO); absent when none was. ChessDB answers cached before it are stale. */
  updated?: string;
  runs: number;
  /** Positions the last survey picked, explored in all, and left of the last survey. */
  targets: number;
  explored: number;
  left: number;
  /** A survey ran and nothing is left. */
  done: boolean;
  changed: number;
  behind: number;
  refused: number;
}

export function parseExploreState(text: string): ExploreState | undefined {
  try {
    const o = JSON.parse(text) as Partial<ExploreState> | null;
    if (!o || o.v !== 1 || typeof o.name !== 'string' || typeof o.left !== 'number' || typeof o.done !== 'boolean') return undefined;
    return o as ExploreState;
  } catch {
    return undefined;
  }
}

export interface ExploreReport {
  state: ExploreState;
  markdown: string;
}

/**
 * The report of one exploration, from the tool's record and log and the sweep of our moves:
 * positions explored and left; every position where ChessDB's best move changed or its eval moved
 * by 0.30 or more; every move of ours now 0.30 or more behind ChessDB's best. Every line in full
 * from move 1, scores from White's side in pawns.
 */
export function exploreReport(o: { name: string; what: string; chapter?: string; line?: string; record: readonly Target[]; log: LogRead; sweep?: { rows: readonly Behind[]; asked: number; unknown: number } }): ExploreReport {
  const { record, log } = o;
  const left = leftOf(log);
  const moved = record.filter(changed);
  const updated = record.map((t) => t.at).sort().at(-1);
  // Without the sweep, what the record itself shows: a decision explored whose move is behind.
  const fromRecord: Behind[] = record
    .filter((t) => t.after?.mine && t.after.best.score - t.after.mine.score >= MOVED_CP)
    .map((t) => ({ line: fullLine(t.line), ours: t.after!.mine!.san, best: t.after!.best.san, oursCp: whiteCp(t.after!.mine!.score, t.fen), bestCp: whiteCp(t.after!.best.score, t.fen), gap: t.after!.best.score - t.after!.mine!.score }));
  const behind = o.sweep ? o.sweep.rows : fromRecord;
  const state: ExploreState = {
    v: 1,
    name: o.name,
    ...(o.chapter !== undefined ? { chapter: o.chapter } : {}),
    ...(o.line !== undefined ? { line: o.line } : {}),
    ...(updated ? { updated } : {}),
    runs: log.runs,
    targets: log.survey?.targets ?? 0,
    explored: record.length,
    left: left ?? 0,
    done: left === 0,
    changed: moved.length,
    behind: behind.length,
    refused: log.refused,
  };
  const reach = (t: Target) => (typeof t.reach === 'number' ? `, reached ${(100 * t.reach).toFixed(2)}%` : '');
  const md: string[] = [
    `# cdbexplore: ${o.name}`,
    '',
    `${o.what} Written by \`audit.ts explore-report\` from the tool's own record and log (\`${o.name}.explore.json\`, \`${o.name}.explore.log\`); scores are ChessDB's, from White's side, in pawns; every line in full.`,
    '',
    `- **Stands:** ${log.survey === undefined ? 'no survey has run yet' : state.done ? 'finished: nothing is left to explore' : `not finished: ${state.left} position(s) left`}.`,
    `- Positions: the last survey picked ${state.targets}${log.survey ? ` (${log.survey.ends} line ends, ${log.survey.decisions} close decisions of ours)` : ''}; ${state.explored} explored in all; ${state.left} left.`,
    `- Runs: ${log.runs}${log.done ? `; the last one: ${log.done}` : ''}${log.refused ? `; ChessDB refused ${log.refused} request(s) for its rate limit` : ''}.`,
    `- Last position explored: ${updated ?? 'none'}. A ChessDB answer cached before that is stale; the audit's tools ask again.`,
    '',
    `## ChessDB's best move changed, or its eval moved by 0.30 or more (${moved.length})`,
    '',
    ...(moved.length ? moved.map((t) => `- ${fullLine(t.line) || '(the start)'} (${t.reason}${reach(t)}): best ${seenText(t.before.best, t.fen)} → ${seenText(t.after!.best, t.fen)}${t.before.mine && t.after!.mine ? `; ours ${seenText(t.before.mine, t.fen)} → ${seenText(t.after!.mine, t.fen)}` : ''}; stored line ${t.before.line} → ${t.after!.line} plies`) : ['None.']),
    '',
    `## Moves of ours 0.30 or more behind ChessDB's best (${behind.length})`,
    '',
    o.sweep
      ? `ChessDB asked afresh at the ${o.sweep.asked} position(s) of the explored file where we move${o.sweep.unknown ? ` (${o.sweep.unknown} it has no eval for)` : ''}. Treat each like a flag of \`audit.ts screen\`: a prompt for Practical, not a verdict.`
      : o.chapter === undefined
        ? 'One position explored on demand: its candidates are compared with `audit.ts chessdb --fresh`, not here.'
        : 'From the explored decisions only: ChessDB was not asked about the other positions (run explore-report without --no-sweep).',
    '',
    ...(behind.length ? behind.map((b) => `- ${b.line || '(the start)'}: ours ${b.ours} ${pawnsText(b.oursCp)}, ChessDB's best ${b.best} ${pawnsText(b.bestCp)} (${(b.gap / 100).toFixed(2)} behind)`) : ['None.']),
    '',
    `## Explored (${record.length})`,
    '',
    ...(record.length
      ? [...record].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)).map((t) => `- ${fullLine(t.line) || '(the start)'} (${t.reason}${reach(t)}): ${t.after ? `best ${seenText(t.after.best, t.fen)}, stored line ${t.before.line} → ${t.after.line} plies` : 'ChessDB has no eval'}${t.stopped ? `; ${t.stopped}` : ''}`)
      : ['None yet.']),
    '',
  ];
  return { state, markdown: md.join('\n') };
}

/** The time before which a cached ChessDB answer is stale: the latest position explored, over every exploration of the study. */
export function chessdbFloor(states: readonly ExploreState[]): number | undefined {
  const times = states.map((s) => (s.updated ? Date.parse(s.updated) : NaN)).filter((t) => Number.isFinite(t));
  return times.length ? Math.max(...times) : undefined;
}

/** A cache folder's ChessDB records with those older than `floor` taken out. */
export function freshRecords(text: string, floor: number): { text: string; dropped: number } {
  let dropped = 0;
  const kept = text.split('\n').filter((line) => {
    if (!line) return false;
    try {
      const t = (JSON.parse(line) as { t?: unknown }).t;
      if (typeof t === 'number' && t < floor) {
        dropped++;
        return false;
      }
    } catch {
      return false;
    }
    return true;
  });
  return { text: kept.length ? `${kept.join('\n')}\n` : '', dropped };
}

/* ------------------------------------------------------------------ shallow evals */

/** rules.md's test: a stored line under this many plies is a shallow eval. */
export const SHALLOW_PLIES = 10;
/** … and so is one Stockfish disagrees with by this much (centipawns). */
export const DISAGREE_CP = 50;

export interface DepthRow {
  /** The move, or '' for the position itself (ChessDB's best there). */
  san: string;
  /** ChessDB's score from White's side, in centipawns; undefined when it has none. */
  cp?: number;
  /** The plies its score is backed up from: the stored line after the move, the move counted. */
  plies: number;
  /** Stockfish's score from White's side, when asked. */
  sfCp?: number;
  shallow: boolean;
  why: string[];
}

/** One row of the depth check: is ChessDB's score for this move deep enough to decide on? */
export function depthRow(san: string, cp: number | undefined, plies: number, sfCp?: number): DepthRow {
  const why: string[] = [];
  if (cp === undefined) why.push('ChessDB has no score for it');
  else if (plies < SHALLOW_PLIES) why.push(`its stored line is ${plies} plies, under ${SHALLOW_PLIES}`);
  if (cp !== undefined && sfCp !== undefined && Math.abs(cp - sfCp) >= DISAGREE_CP && Math.abs(cp) < MATE_FROM && Math.abs(sfCp) < MATE_FROM) why.push(`Stockfish disagrees by ${(Math.abs(cp - sfCp) / 100).toFixed(2)}`);
  return { san, ...(cp !== undefined ? { cp } : {}), plies, ...(sfCp !== undefined ? { sfCp } : {}), shallow: why.length > 0, why };
}

export const depthText = (r: DepthRow): string =>
  `${(r.san || '(best)').padEnd(8)} ChessDB ${r.cp === undefined ? '   ?  ' : pawnsText(r.cp).padStart(6)}, stored line ${String(r.plies).padStart(2)} plies${r.sfCp !== undefined ? `, Stockfish ${pawnsText(r.sfCp)}` : ''}${r.shallow ? `  SHALLOW: ${r.why.join('; ')}` : ''}`;

/* ------------------------------------------------------------------ the ledger's table */

/** An exploration asked for: written into audit.json when a session is started for it. */
export interface ExploreStart {
  name: string;
  chapter: string;
  /** The subtree's line; '' for the whole chapter. */
  line: string;
  started: string;
  /** The session that runs it. */
  session?: string;
}

export const EXPLORED_DAYS = 7;

export interface Exploration {
  name: string;
  chapter?: string;
  line?: string;
  start?: ExploreStart;
  state?: ExploreState;
}

/** Every exploration of a study: those asked for (audit.json) with what their sessions reported (the notes folder). */
export function explorations(starts: readonly ExploreStart[], states: readonly ExploreState[]): Exploration[] {
  const out = new Map<string, Exploration>();
  for (const s of starts) out.set(s.name, { name: s.name, chapter: s.chapter, line: s.line, start: s });
  for (const s of states) out.set(s.name, { ...(out.get(s.name) ?? { name: s.name }), ...(s.chapter !== undefined ? { chapter: s.chapter } : {}), ...(s.line !== undefined ? { line: s.line } : {}), state: s });
  return [...out.values()];
}

/** The latest exploration of a subtree, if one was started or reported in the last days. */
export function exploredLately(all: readonly Exploration[], chapter: string, line: string, now: number): Exploration | undefined {
  const when = (e: Exploration) => Math.max(e.start ? Date.parse(e.start.started) : 0, e.state?.updated ? Date.parse(e.state.updated) : 0);
  return all
    .filter((e) => e.chapter === chapter && (e.line ?? '') === line && now - when(e) < EXPLORED_DAYS * 24 * 3600 * 1000)
    .sort((a, b) => when(b) - when(a))[0];
}

export function explorationWords(e: Exploration): string {
  const s = e.state;
  if (!s) return `started ${e.start?.started.slice(0, 16).replace('T', ' ') ?? '?'} UTC, no report yet`;
  if (s.done) return `finished: ${s.explored} explored, 0 left`;
  return `not finished: ${s.explored} explored, ${s.left} left`;
}

export function exploredTable(all: readonly Exploration[], chapterNames: ReadonlyMap<string, string>): string {
  if (!all.length) return 'No exploration yet.';
  const cell = (s: string) => s.replace(/\|/g, '\\|');
  const what = (e: Exploration) => (e.line ? e.line : e.chapter ? `the chapter "${chapterNames.get(e.chapter) ?? e.chapter}"` : 'a position, on demand');
  const out = ['| Name | What | Started | Last position explored | Stands | ChessDB changed / ours behind | Report |', '|---|---|---|---|---|---|---|'];
  for (const e of [...all].sort((a, b) => (a.start?.started ?? a.state?.updated ?? '').localeCompare(b.start?.started ?? b.state?.updated ?? ''))) {
    out.push(`| ${e.name} | ${cell(what(e))} | ${e.start ? `${e.start.started.slice(0, 16).replace('T', ' ')}${e.start.session ? ` (${e.start.session})` : ''}` : 'by its own session'} | ${e.state?.updated?.slice(0, 16).replace('T', ' ') ?? 'none'} | ${explorationWords(e)} | ${e.state ? `${e.state.changed} / ${e.state.behind}` : ''} | ${e.state ? `\`cdbexplore/${e.name}.md\`` : ''} |`);
  }
  return out.join('\n');
}
