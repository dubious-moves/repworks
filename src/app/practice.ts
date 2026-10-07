// Practice (PLAN.md §5.57): a game played on from a position against mistake-lab's opponent, the
// explorer's games at the practice filter (a move drawn weighted by games), then Maia at its
// rating and precision, then Stockfish. Each of the user's moves is judged by Stockfish in the
// background (the game trainer's depth), and the review at the end gives the accuracy, the graph
// and the key moves, to retry, see the line, save as a practice mistake or make into a sequence.
//
// Three kinds: `practice` (from any position: its result is a `practice` event at the start's
// position), `advantage` (an advantage card from the game cards' session: silent, each move judged
// before the opponent answers so a collapse ends it, graded by `finishAdvantage`'s rule), and
// `checklist` (§5.62: a variation's drill from its leaf, its win checking the line off for the
// preset). A game of five user moves or more becomes a history entry (`played`).
import { signal } from '@preact/signals';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { keyFen, type PositionKey } from '../core/chess/positionKey.ts';
import { parseUciMove, standardUci } from '../core/chess/uci.ts';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import { judgeMove, moverScore, type MoverLine } from '../core/games/grade.ts';
import { advantageGrade, historyEntry, maiaPick, pickExplorerMove, PRACTICE, resultOf, reviewOf, startTrack, trackAdvantage, type AdvantageOutcome, type AdvantageTrack, type HistoryEntry, type HistorySource, type PlayedMove, type Review } from '../core/games/practice.ts';
import type { Color } from '../core/games/record.ts';
import { historyCard, practiceCard } from '../core/progress/cards.ts';
import type { Grade } from '../core/progress/events.ts';
import { positionOf } from '../core/storm/walk.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { maiaPolicy } from './maia.ts';
import { recordEvent } from './state.ts';
import { analyseForStorm } from './stormEngine.ts';
import { trainData } from './train.ts';

/** The opponent's strength: the explorer's ratings and speeds, Maia's rating and precision. */
export interface Opponent {
  ratings: number[];
  speeds: string[];
  maiaElo: number;
  precision: number;
}
export const DEFAULT_OPPONENT: Opponent = { ratings: [...PRACTICE.ratings], speeds: [...PRACTICE.speeds], maiaElo: PRACTICE.maiaElo, precision: PRACTICE.maiaPrecision };

/** The opponent's settings on this device (mistake-lab's continuation settings). */
const OPP_KEY = 'repworks-practice';
export function loadOpponent(): Opponent {
  try {
    return { ...DEFAULT_OPPONENT, ...(JSON.parse(localStorage.getItem(OPP_KEY) ?? '{}') as Partial<Opponent>) };
  } catch {
    return DEFAULT_OPPONENT;
  }
}
export function saveOpponent(o: Opponent): void {
  try {
    localStorage.setItem(OPP_KEY, JSON.stringify(o));
  } catch {
    // this page only
  }
}

export interface PracticeSetup {
  kind: 'practice' | 'advantage' | 'checklist';
  fen: string;
  /** The user's side. */
  color: Color;
  /** Per-move feedback off (an advantage drill, a checklist drill). */
  silent: boolean;
  title: string;
  opponent: Opponent;
  /** The advantage card graded at the end, and its peak. */
  card?: string;
  peakCp?: number;
  /** The checklist's preset and leaf, for its `practice` event. */
  preset?: string;
  leaf?: PositionKey;
  /** Told the grade (an advantage card) once the game ends. */
  onEnd?(grade: Grade | undefined): void;
}

export interface PracticeMove extends PlayedMove {
  fenBefore: string;
  fen: string;
  /** Where the opponent's move came from: `DB (n)`, `Maia`, `Stockfish`. */
  source?: string;
  /** The best line from the position before (SAN), for Show the line. */
  bestLine?: string[];
  judging?: boolean;
}

export type EndReason = 'mate' | 'mated' | 'stalemate' | 'draw' | 'claim' | 'collapse' | 'stopped' | 'interrupted';

export interface PracticeGame {
  gen: number;
  setup: PracticeSetup;
  moves: PracticeMove[];
  /** `user` to move, the `opponent` choosing, `over` once ended. */
  phase: 'user' | 'opponent' | 'over';
  track: AdvantageTrack;
  claim: boolean;
  /** The opponent's last source, and a note shown once (the database unavailable). */
  source?: string;
  note?: string;
  end?: { reason: EndReason; result: 'win' | 'draw' | 'loss'; grade?: Grade };
  /** The history entry's id, once written. */
  historyId?: string;
  /** Every judge done (the review's words are final). */
  judged: boolean;
}

export const practice = signal<PracticeGame | undefined>(undefined);
let gen = 0;

const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches;

function patch(g: number, fn: (p: PracticeGame) => Partial<PracticeGame>): PracticeGame | undefined {
  const p = practice.peek();
  if (!p || p.gen !== g) return undefined;
  const next = { ...p, ...fn(p) };
  practice.value = next;
  return next;
}

const fenAfter = (p: PracticeGame) => (p.moves.length ? p.moves[p.moves.length - 1]!.fen : p.setup.fen);

/* ------------------------------------------------------------------ the opponent */

type PracticeReply = Extract<FromWorker, { type: 'practiceGames' }>;
let nextId = 1;
const waiting = new Map<number, (m: PracticeReply) => void>();
let listening = false;
function explorerGames(fen: string, o: Opponent): Promise<PracticeReply | null> {
  if (!listening) {
    listening = true;
    onWorker((r) => {
      if (r.type !== 'practiceGames') return;
      const w = waiting.get(r.id);
      waiting.delete(r.id);
      w?.(r);
    });
  }
  const id = nextId++;
  return new Promise((resolve) => {
    // mistake-lab's 5 s timeout: a database that doesn't answer is a failure, Maia then.
    const timer = setTimeout(() => (waiting.delete(id), resolve(null)), 5000);
    waiting.set(id, (r) => (clearTimeout(timer), resolve(r)));
    postToWorker({ type: 'practiceGames', id, fen, speeds: o.speeds, ratings: o.ratings } satisfies ToWorker);
  });
}

/** The opponent's move: the database, then Maia, then Stockfish; undefined when none answers. */
async function opponentMove(fen: string, o: Opponent): Promise<{ uci: string; source: string; dbFailed: boolean } | undefined> {
  const pos = positionOf(fen);
  if (!pos) return undefined;
  let dbFailed = false;
  const db = await explorerGames(fen, o);
  if (db && 'games' in db) {
    const picked = pickExplorerMove(db.games, Math.random);
    const move = picked && parseUciMove(pos, picked.uci);
    if (picked && move) return { uci: uciOf(fen, picked.uci)!, source: `DB (${picked.white + picked.draws + picked.black})`, dbFailed };
  } else dbFailed = true;
  const policy = await maiaPolicy(fen, o.maiaElo);
  const m = policy && maiaPick(policy, o.precision, Math.random);
  if (m) return { uci: m.uci, source: 'Maia', dbFailed };
  const a = await analyseForStorm(fen, 1, 16, 4000);
  const best = a?.lines[0]?.pv[0];
  return best ? { uci: best, source: 'Stockfish', dbFailed } : undefined;
}

/** Standard UCI for a move in either castling spelling (the explorer writes e1h1). */
function uciOf(fen: string, uci: string): string | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  return pos && move ? standardUci(pos, move) : undefined;
}

function played(fen: string, uci: string): { san: string; fen: string } | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  const san = makeSanAndPlay(pos, move);
  return { san, fen: makeFen(pos.toSetup()) };
}

/* ------------------------------------------------------------------ judging the user's moves */

const searches = new Map<string, Promise<Awaited<ReturnType<typeof analyseForStorm>>>>();
function analyse(fen: string, lines: number) {
  const key = `${fen}|${lines}`;
  let p = searches.get(key);
  if (!p) {
    p = analyseForStorm(fen, lines, narrow() ? 16 : 18, 8000);
    searches.set(key, p);
    if (searches.size > 80) searches.delete(searches.keys().next().value!);
  }
  return p;
}

function sanLine(fen: string, pv: readonly string[]): string[] {
  const out: string[] = [];
  let f = fen;
  for (const uci of pv.slice(0, 8)) {
    const p = played(f, uci);
    if (!p) break;
    out.push(p.san);
    f = p.fen;
  }
  return out;
}

/** Judges a move from its position (the trainer's rule): the classification, the loss, the scores for the mover. */
export async function judge(fenBefore: string, uci: string, fenAfter: string): Promise<Partial<PracticeMove> | undefined> {
  const pos = positionOf(fenBefore);
  if (!pos) return undefined;
  const a = await analyse(fenBefore, 3);
  const lines: MoverLine[] = (a?.lines ?? []).filter((l) => l.pv.length).map((l) => ({ move: l.pv[0]!, cp: moverScore(l.score, pos.turn) }));
  const matched = lines.find((l) => l.move === uci);
  let afterCp = matched?.cp;
  const after = positionOf(fenAfter);
  if (after?.isEnd()) afterCp = after.isCheckmate() ? 10000 : 0;
  else if (!matched && after) {
    const l = (await analyse(fenAfter, 1))?.lines[0];
    if (l?.pv.length) afterCp = -moverScore(l.score, after.turn);
  }
  const j = judgeMove(lines, uci, afterCp);
  if (!j) return undefined;
  const best = a!.lines[0]!;
  return { classification: j.classification, wpDrop: j.wpDrop, cpLoss: j.cpLoss, bestCp: j.bestCp, afterCp: afterCp ?? j.bestCp - j.cpLoss, bestMoveUci: j.bestMove ?? '', bestLine: sanLine(fenBefore, best.pv) };
}

let pending = 0;
const judging = new Set<Promise<unknown>>();

function judgeAt(g: number, i: number): Promise<void> {
  const p = practice.peek();
  const mv = p?.moves[i];
  if (!p || !mv) return Promise.resolve();
  pending++;
  const job = judge(mv.fenBefore, mv.uci, mv.fen).then((j) => {
    patch(g, (q) => {
      const moves = [...q.moves];
      const { judging: _j, ...rest } = moves[i]!;
      moves[i] = { ...rest, ...(j ?? {}) };
      return { moves };
    });
  });
  judging.add(job);
  return job.finally(() => {
    judging.delete(job);
    pending--;
    if (!pending) patch(g, () => ({ judged: true }));
  });
}

/* ------------------------------------------------------------------ the game */

export function startPractice(setup: PracticeSetup): void {
  const pos = positionOf(setup.fen);
  if (!pos) return;
  gen++;
  pending = 0;
  practice.value = { gen, setup, moves: [], phase: pos.turn === setup.color ? 'user' : 'opponent', track: startTrack(setup.peakCp ?? null), claim: false, judged: true };
  if (pos.turn !== setup.color) void opponentTurn(gen);
}

export function leavePractice(): void {
  gen++;
  practice.value = undefined;
}

/** The user's move (standard UCI). */
export async function practiceMove(uci: string): Promise<void> {
  const p = practice.peek();
  if (!p || p.phase !== 'user') return;
  const before = fenAfter(p);
  const after = played(before, uci);
  if (!after) return;
  const g = p.gen;
  const i = p.moves.length;
  const next = patch(g, (q) => ({ moves: [...q.moves, { san: after.san, uci, isUser: true, fenBefore: before, fen: after.fen, judging: true }], phase: 'opponent' }));
  if (!next) return;
  const job = judgeAt(g, i);
  // An advantage drill waits for the judge: a collapse ends it before the opponent answers.
  if (p.setup.kind === 'advantage') {
    await job;
    const q = practice.peek();
    if (!q || q.gen !== g) return;
    const mv = q.moves[i]!;
    if (mv.afterCp === undefined) return void finish(g, 'interrupted');
    const t = trackAdvantage(q.track, mv.afterCp, mv.wpDrop ?? 0);
    patch(g, () => ({ track: t.track, claim: t.claim }));
    if (t.collapse) return void finish(g, 'collapse');
  } else void job.then(() => claimCheck(g, i));
  const end = endOf(after.fen, true);
  if (end) return void finish(g, end);
  setTimeout(() => void opponentTurn(g), 500);
}

/** The Claim Victory count, as each move's judge comes in (a game not drilled for an advantage). */
function claimCheck(g: number, i: number): void {
  const q = practice.peek();
  if (!q || q.gen !== g || q.phase === 'over') return;
  const mv = q.moves[i];
  if (mv?.afterCp === undefined) return;
  const t = trackAdvantage(q.track, mv.afterCp, mv.wpDrop ?? 0, false);
  patch(g, () => ({ track: t.track, claim: t.claim }));
}

function endOf(fen: string, byUser: boolean): EndReason | undefined {
  const pos = positionOf(fen);
  if (!pos || !pos.isEnd()) return undefined;
  if (pos.isCheckmate()) return byUser ? 'mate' : 'mated';
  if (pos.isStalemate()) return 'stalemate';
  return 'draw';
}

async function opponentTurn(g: number): Promise<void> {
  const p = practice.peek();
  if (!p || p.gen !== g || p.phase !== 'opponent') return;
  const fen = fenAfter(p);
  const m = await opponentMove(fen, p.setup.opponent);
  const q = practice.peek();
  if (!q || q.gen !== g || q.phase !== 'opponent') return;
  if (!m) return void finish(g, 'interrupted');
  const after = played(fen, m.uci);
  if (!after) return void finish(g, 'interrupted');
  const note = m.dbFailed && !q.note && !q.setup.silent ? 'The database is unavailable (a Lichess login is needed): Maia or Stockfish answers.' : q.note;
  patch(g, (r) => ({ moves: [...r.moves, { san: after.san, uci: m.uci, isUser: false, fenBefore: fen, fen: after.fen, source: m.source }], source: m.source, phase: 'user', ...(note ? { note } : {}) }));
  const end = endOf(after.fen, false);
  if (end) finish(g, end);
}

/** Stop: the game ends where it is, scored by the last judged move. */
export function stopPractice(): void {
  const p = practice.peek();
  if (p && p.phase !== 'over') finish(p.gen, 'stopped');
}

/** Claim Victory (three moves running at +10). */
export function claimVictory(): void {
  const p = practice.peek();
  if (p && p.phase !== 'over' && p.claim) finish(p.gen, 'claim');
}

const lastAfterCp = (p: PracticeGame) => [...p.moves].reverse().find((m) => m.isUser && m.afterCp !== undefined)?.afterCp;

function finish(g: number, reason: EndReason): void {
  const p = practice.peek();
  if (!p || p.gen !== g || p.phase === 'over') return;
  const userCp = lastAfterCp(p);
  const result: 'win' | 'draw' | 'loss' = reason === 'mate' || reason === 'claim' ? 'win' : reason === 'mated' || reason === 'collapse' ? 'loss' : reason === 'stalemate' || reason === 'draw' ? 'draw' : resultOf(userCp);
  let grade: Grade | undefined;
  if (p.setup.kind === 'advantage') {
    const outcome: AdvantageOutcome = reason === 'mate' || reason === 'claim' ? 'victory' : reason === 'stalemate' || reason === 'draw' ? 'draw' : reason === 'interrupted' || reason === 'stopped' ? 'interrupted' : 'collapse';
    // No hints in the drill (mistake-lab hides them in its silent game).
    grade = advantageGrade(outcome, p.track, false);
  }
  patch(g, () => ({ phase: 'over', end: { reason, result, ...(grade ? { grade } : {}) }, claim: false }));
  const t = new Date().toISOString();
  if (p.setup.kind === 'advantage' && p.setup.card && grade) void recordEvent({ t, k: 'review', card: p.setup.card, g: grade });
  p.setup.onEnd?.(grade);
  const userMoves = p.moves.filter((m) => m.isUser).length;
  const finalCp = userCp === undefined ? null : p.setup.color === 'white' ? userCp : -userCp;
  // The scoreboard (mistake-lab's recordPracticeResult): practice from a position, and a checklist's drill.
  if (p.setup.kind !== 'advantage' && reason !== 'interrupted') {
    const key = p.setup.leaf ?? keyFen(p.setup.fen)?.key;
    if (key) void recordEvent({ t, k: 'practice', card: practiceCard(key), res: result, ...(p.setup.preset ? { preset: p.setup.preset } : {}), ...(finalCp !== null ? { cp: Math.round(finalCp) } : {}), mv: userMoves });
  }
  // The history entry, once the judges are in (the review's words final).
  if (userMoves >= PRACTICE.reviewMinMoves) void Promise.all([...judging]).then(() => writeHistory(g, reason, result, finalCp));
}

const OUTCOME: Record<EndReason, 'win' | 'draw' | 'loss' | 'stopped' | 'ended'> = { mate: 'win', claim: 'win', mated: 'loss', collapse: 'loss', stalemate: 'draw', draw: 'draw', stopped: 'stopped', interrupted: 'ended' };

async function writeHistory(g: number, reason: EndReason, result: 'win' | 'draw' | 'loss', finalCp: number | null): Promise<void> {
  const p = practice.peek();
  if (!p || p.gen !== g) return;
  const source: HistorySource = p.setup.kind === 'advantage' ? 'advantage' : p.setup.kind === 'checklist' ? 'todo' : 'practice';
  const outcome = reason === 'stopped' ? 'stopped' : OUTCOME[reason] === 'ended' ? 'ended' : result;
  const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = historyEntry({ id, ts: Date.now(), baseFen: p.setup.fen, color: p.setup.color, source, outcome, finalCp, title: p.setup.title, moves: p.moves, review: reviewOf(p.moves, repertoireAt(p.setup.fen, p.moves)) });
  if (!entry) return;
  patch(g, () => ({ historyId: id }));
  await recordEvent({ t: new Date().toISOString(), k: 'played', card: historyCard(id), game: { ...entry } });
}

/* ------------------------------------------------------------------ the review */

/** The repertoire at each user move: its own move (never a key move), or another move it has there (a deviation). */
export function repertoireAt(baseFen: string, moves: readonly { uci: string; isUser: boolean; fenBefore?: string }[]): (i: number) => { own: boolean; dev?: string } {
  const index = trainData.peek()?.index;
  const fens: string[] = [];
  let f = baseFen;
  for (const m of moves) {
    fens.push(m.fenBefore ?? f);
    f = played(m.fenBefore ?? f, m.uci)?.fen ?? f;
  }
  return (i) => {
    const key = fens[i] && keyFen(fens[i]!)?.key;
    const at = key ? index?.positions.get(key) : undefined;
    if (!at || !at.own.size) return { own: false };
    const uci = moves[i]!.uci;
    if (at.own.has(uci)) return { own: true };
    const [first] = at.own.keys();
    return { own: false, dev: first! };
  };
}

export function practiceReview(p: PracticeGame): Review {
  return reviewOf(p.moves, repertoireAt(p.setup.fen, p.moves));
}

/** A history entry as a finished game, for its review (the moves' positions rebuilt from its start). */
export function gameOfHistory(h: HistoryEntry): PracticeGame | undefined {
  const moves: PracticeMove[] = [];
  let fen = h.baseFen;
  for (const m of h.moves) {
    const after = played(fen, m.uci);
    if (!after) return undefined;
    moves.push({ ...m, fenBefore: fen, fen: after.fen });
    fen = after.fen;
  }
  const result = h.outcome === 'win' || h.outcome === 'loss' || h.outcome === 'draw' ? h.outcome : resultOf(h.finalCp === null ? null : h.playerColor === 'white' ? h.finalCp : -h.finalCp);
  return { gen: -1, setup: { kind: 'practice', fen: h.baseFen, color: h.playerColor, silent: true, title: h.openingName, opponent: DEFAULT_OPPONENT }, moves, phase: 'over', track: startTrack(), claim: false, end: { reason: 'stopped', result }, historyId: h.id, judged: true };
}
