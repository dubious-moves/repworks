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
//
// While practising from a position (PLAN.md §6, item 2): a move off the repertoire before ply 20 is
// taken back ("Ignore for this game?"), the move first tried kept with the move then played and
// shown in the review; the hint (the repertoire's move, else Stockfish's); a premove during the
// opponent's turn, played when the opponent has moved; and the game kept on the device, to resume
// within four hours after a reload or a switch of app (mistake-lab's FILTER PRACTICE, HINT SYSTEM,
// PREMOVE, CONTINUATION SESSION PERSISTENCE).
import { effect, signal } from '@preact/signals';
import { normalizeMove } from 'chessops/chess';
import { isNormal } from 'chessops/types';
import { parseSquare } from 'chessops/util';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { keyFen, type PositionKey } from '../core/chess/positionKey.ts';
import { parseUciMove, standardUci } from '../core/chess/uci.ts';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import { judgeMove, moverScore, type MoverLine } from '../core/games/grade.ts';
import { advantageGrade, historyEntry, maiaPick, pickExplorerMove, PRACTICE, repertoireCheck, repertoireVerdict, resultOf, reviewOf, startTrack, trackAdvantage, type AdvantageOutcome, type AdvantageTrack, type HistoryEntry, type HistorySource, type PlayedMove, type RepertoireVerdict, type Review } from '../core/games/practice.ts';
import { readSaved, resumable, type Saved } from '../core/games/resume.ts';
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
  /** The repertoire check ignored for this game. */
  repIgnored?: boolean;
  /** A move just taken back by the repertoire check, and the repertoire's move there. */
  deviation?: { san: string; uci: string; repUci: string; repSan: string };
  /** The move first tried at a position the check took it back at, until another move is played there. */
  tried?: { key: PositionKey; san: string; uci: string };
  /** The hint at the position on the board: the piece, then the move. */
  hint?: { fen: string; level: 1 | 2; uci?: string };
  /** A move set during the opponent's turn, played after it (from, to). */
  premove?: { from: string; to: string };
}

export const practice = signal<PracticeGame | undefined>(undefined);
let gen = 0;

const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches;

/** The game replaced as a whole (fields taken away), when it is still game `g`. */
function replace(g: number, fn: (p: PracticeGame) => PracticeGame): PracticeGame | undefined {
  const p = practice.peek();
  if (!p || p.gen !== g) return undefined;
  const next = fn(p);
  practice.value = next;
  return next;
}

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
  clearSaved();
}

/* ------------------------------------------------------------------ kept on the device, to resume */

const SAVE_KEY = 'repworks-practice-game';
type SavedSetup = Omit<PracticeSetup, 'onEnd'>;
interface SavedGame {
  setup: SavedSetup;
  moves: PracticeMove[];
  track: AdvantageTrack;
  claim: boolean;
  source?: string;
  repIgnored?: boolean;
  tried?: PracticeGame['tried'];
}
const isSavedGame = (g: unknown): g is SavedGame => {
  const o = g as SavedGame | null;
  return !!o && typeof o === 'object' && !!o.setup && typeof o.setup.fen === 'string' && (o.setup.color === 'white' || o.setup.color === 'black') && Array.isArray(o.moves) && o.moves.every((m) => typeof m?.uci === 'string' && typeof m.fen === 'string' && typeof m.fenBefore === 'string') && !!o.track;
};

function clearSaved(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing kept
  }
}

/** The game kept on this device, when it can be resumed (four hours, two moves). */
export function savedPractice(): Saved<SavedGame> | undefined {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return undefined;
  }
  const s = readSaved(raw, Date.now(), isSavedGame);
  if (!s && raw) clearSaved();
  return s && resumable(s.game.moves.length) ? s : undefined;
}

export function discardSaved(): void {
  clearSaved();
}

/** The kept game played on: judges that hadn't come in asked again, the opponent's move if it is the opponent's turn. */
export function resumePractice(s: Saved<SavedGame>): void {
  const g0 = s.game;
  const fen = g0.moves.at(-1)?.fen ?? g0.setup.fen;
  const pos = positionOf(fen);
  if (!pos) return;
  gen++;
  pending = 0;
  const g = gen;
  const opponentToMove = pos.turn !== g0.setup.color;
  practice.value = {
    gen: g,
    setup: { ...g0.setup },
    moves: g0.moves,
    phase: opponentToMove ? 'opponent' : 'user',
    track: g0.track,
    claim: g0.claim,
    judged: !g0.moves.some((m) => m.judging),
    ...(g0.source ? { source: g0.source } : {}),
    ...(g0.repIgnored ? { repIgnored: true } : {}),
    ...(g0.tried ? { tried: g0.tried } : {}),
  };
  g0.moves.forEach((m, i) => {
    if (m.judging) void judgeAt(g, i).then(() => claimCheck(g, i));
  });
  if (opponentToMove) void opponentTurn(g);
}

// Saved at every change of a game in play; cleared when it ends.
effect(() => {
  const p = practice.value;
  if (!p || p.gen < 0) return;
  if (p.phase === 'over') return clearSaved();
  if (!p.moves.length) return;
  const { onEnd: _onEnd, ...setup } = p.setup;
  const game: SavedGame = { setup, moves: p.moves, track: p.track, claim: p.claim, ...(p.source ? { source: p.source } : {}), ...(p.repIgnored ? { repIgnored: true } : {}), ...(p.tried ? { tried: p.tried } : {}) };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), game }));
  } catch {
    // quota: not kept
  }
});

/** The user's move (standard UCI). */
export async function practiceMove(uci: string): Promise<void> {
  const p = practice.peek();
  if (!p || p.phase !== 'user') return;
  const before = fenAfter(p);
  const after = played(before, uci);
  if (!after) return;
  const g = p.gen;
  const i = p.moves.length;
  const key = keyFen(before)?.key;
  // The repertoire check while practising from a position: the move taken back, the first one tried remembered.
  if (p.setup.kind === 'practice' && key) {
    const check = repertoireCheck(before, repertoireEntries(key), { uci, san: after.san }, !!p.repIgnored);
    if (check.refuse) {
      patch(g, (q) => ({ deviation: { san: after.san, uci, repUci: check.uci, repSan: check.san ?? check.uci }, ...(q.tried?.key === key ? {} : { tried: { key, san: after.san, uci } }) }));
      return;
    }
  }
  const tried = p.tried && p.tried.key === key && p.tried.uci !== uci ? p.tried : undefined;
  const next = replace(g, (q) => {
    const { deviation: _d, hint: _h, ...rest } = q;
    const mv: PracticeMove = { san: after.san, uci, isUser: true, fenBefore: before, fen: after.fen, judging: true, ...(tried ? { repTried: { san: tried.san, uci: tried.uci } } : {}) };
    const out: PracticeGame = { ...rest, moves: [...q.moves, mv], phase: 'opponent' };
    if (tried) delete out.tried;
    return out;
  });
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
  if (end) return finish(g, end);
  // The premove, played now when it is legal here (mistake-lab's: always a queen; dropped when illegal).
  const pre = practice.peek()?.premove;
  if (pre) {
    replace(g, (r) => {
      const { premove: _p, ...rest } = r;
      return rest;
    });
    const uci = premoveUci(after.fen, pre);
    if (uci) void practiceMove(uci);
  }
}

function premoveUci(fen: string, pre: { from: string; to: string }): string | undefined {
  const pos = positionOf(fen);
  const from = parseSquare(pre.from);
  const to = parseSquare(pre.to);
  if (!pos || from === undefined || to === undefined) return undefined;
  const piece = pos.board.get(from);
  const promotion = piece?.role === 'pawn' && (pre.to[1] === '8' || pre.to[1] === '1') ? ('queen' as const) : undefined;
  const move = normalizeMove(pos, { from, to, ...(promotion ? { promotion } : {}) });
  if (!isNormal(move) || !pos.isLegal(move)) return undefined;
  return standardUci(pos, move) + (promotion ? 'q' : '');
}

/** A premove set or changed during the opponent's turn. */
export function setPremove(from: string, to: string): void {
  const p = practice.peek();
  if (p && p.phase === 'opponent') patch(p.gen, () => ({ premove: { from, to } }));
}

export function clearPremove(): void {
  const p = practice.peek();
  if (p?.premove)
    replace(p.gen, (q) => {
      const { premove: _p, ...rest } = q;
      return rest;
    });
}

/* ------------------------------------------------------------------ the repertoire check and the hint */

/** The repertoire's own moves at a position (its first the main one), with their SAN. */
function repertoireEntries(key: PositionKey): { uci: string; san: string }[] | undefined {
  const at = trainData.peek()?.index.positions.get(key);
  if (!at?.own.size) return undefined;
  return [...at.own].map(([uci, occ]) => ({ uci, san: occ[0]?.san ?? uci }));
}

/** "Ignore for this game": the repertoire check off until the game ends. */
export function ignoreRepertoire(): void {
  const p = practice.peek();
  if (!p) return;
  replace(p.gen, (q) => {
    const { deviation: _d, ...rest } = q;
    return { ...rest, repIgnored: true };
  });
}

/** The hint (practising from a position): the piece first, then the move; the repertoire's move, else Stockfish's. */
export async function practiceHint(): Promise<void> {
  const p = practice.peek();
  if (!p || p.phase !== 'user' || p.setup.kind !== 'practice') return;
  const fen = fenAfter(p);
  const g = p.gen;
  if (p.hint?.fen === fen) {
    if (p.hint.level === 1 && p.hint.uci) patch(g, () => ({ hint: { ...p.hint!, level: 2 } }));
    return;
  }
  const key = keyFen(fen)?.key;
  const rep = key ? repertoireEntries(key)?.[0]?.uci : undefined;
  patch(g, () => ({ hint: { fen, level: 1, ...(rep ? { uci: rep } : {}) } }));
  if (rep) return;
  const best = (await analyse(fen, 3))?.lines[0]?.pv[0];
  const q = practice.peek();
  if (best && q?.gen === g && q.hint?.fen === fen) patch(g, () => ({ hint: { ...q.hint!, uci: best } }));
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
  // A checklist drill stopped or interrupted counts nothing (mistake-lab's abandoned drill).
  if (p.setup.kind !== 'advantage' && reason !== 'interrupted' && !(p.setup.kind === 'checklist' && reason === 'stopped')) {
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
export function repertoireAt(baseFen: string, moves: readonly { uci: string; san?: string; isUser: boolean; fenBefore?: string; repTried?: { uci: string; san: string } }[]): (i: number) => RepertoireVerdict {
  const fens: string[] = [];
  let f = baseFen;
  for (const m of moves) {
    fens.push(m.fenBefore ?? f);
    f = played(m.fenBefore ?? f, m.uci)?.fen ?? f;
  }
  return (i) => {
    const key = fens[i] && keyFen(fens[i]!)?.key;
    return repertoireVerdict(key ? repertoireEntries(key) : undefined, moves[i]!);
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
