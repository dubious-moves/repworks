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
import { winPct } from '../core/games/extract.ts';
import { judgeMove, moverScore, needsRecheck, RECHECK, recheckMoves, rejudge, type MoverLine } from '../core/games/grade.ts';
import { advantageGrade, BLEND, blendMoves, databaseShare, drawAccepted, explorerTotal, guardCandidates, guardedChoice, guardNeedsBefore, historyEntry, historyOf, maiaPick, temperedOdds, pickExplorerMove, PRACTICE, plyOf, repertoireCheck, repertoireVerdict, resultOf, reviewOf, ruleDraw, startTrack, trackAdvantage, type AdvantageOutcome, type AdvantageTrack, type HistoryEntry, type HistorySource, type PlayedMove, type RepertoireVerdict, type Review } from '../core/games/practice.ts';
import { readSaved, resumable, type Saved } from '../core/games/resume.ts';
import { drawByWeight, forcedPlies, handledReplies, retryMove, variedWeights, VARIETY } from '../core/games/variety.ts';
import { PRESETS } from '../core/games/checklist.ts';
import { covered, scanCandidate, tacticCandidates, TACTIC, type DetectedTactic, type Pv } from '../core/games/detect.ts';
import type { Color } from '../core/games/record.ts';
import { historyCard, practiceCard } from '../core/progress/cards.ts';
import { ENDGAME_PRESET, firstSlip, goalKept, GOAL_CP, GRADE_SECONDS, gradeOfTime, meanSeconds, type SolveGrade, held, lineOf, MAIA_ELO, maiaCandidates, materialFor, opponentPick, pawnPushes, pushNow, slips, solvedBy, wonAfter, type Endgame, type Goal, type OpponentLine } from '../core/endgames/endgames.ts';
import { hangs, lc0Vetoed, replyOrder, trustPick } from '../core/endgames/variety.ts';
import { keepingMoves, tablebaseVerdict, type TablebaseVerdict } from '../core/endgames/tablebase.ts';
import { tablebase } from '../platform/tablebase.ts';
import { offlineMode } from '../platform/offline.ts';
import { endgameLc0 } from './endgameLc0.ts';
import { authorFirst, endgameMaiaAlone, hintsAt, replyPlayed, tryBegun, tryEnded } from './endgameVariety.ts';
import type { Grade } from '../core/progress/events.ts';
import { positionOf } from '../core/storm/walk.ts';
import { onWorker, postToWorker } from './explorer.ts';
import { maiaPolicies, maiaPolicy, maiaPrefs } from './maia.ts';
import { gameBefore } from '../core/maia/history.ts';
import type { MaiaMove } from '../core/maia/encode.ts';
import { recordEvent } from './state.ts';
import { analyseForStorm } from './stormEngine.ts';
import { trainData } from './train.ts';
import { smallDevice } from './device.ts';

/** The opponent's strength: the explorer's ratings and speeds, Maia's rating and precision. */
export interface Opponent {
  ratings: number[];
  speeds: string[];
  maiaElo: number;
  precision: number;
  /** Maia's likely moves checked by Stockfish, a nonsense blunder never played (§5.205), and a thin database's moves with them (§5.206): Medium and Hard, and the settings' default. */
  guard?: boolean;
  /** A prepared opponent (§5.206): the database's replies weighted by how they score for it. Hard. */
  prepared?: boolean;
}
/** Practice from a position: Medium's opponent (its database from 1800, §5.206; Maia 2000 at 0.75, checked), at mistake-lab's speeds. */
export const DEFAULT_OPPONENT: Opponent = { ratings: [...PRESETS.medium.ratings], speeds: [...PRACTICE.speeds], maiaElo: PRACTICE.maiaElo, precision: PRACTICE.maiaPrecision, guard: true };

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

/** Per-move feedback while practising from a position (the owner's request, 2026-10-09): off unless
 *  turned on, kept on the device. The review at the end classifies every move either way. */
const FEEDBACK_KEY = 'repworks-practice-feedback';
function loadFeedback(): boolean {
  try {
    return localStorage.getItem(FEEDBACK_KEY) === 'on';
  } catch {
    return false;
  }
}
export const practiceFeedback = signal(loadFeedback());
export function setPracticeFeedback(on: boolean): void {
  practiceFeedback.value = on;
  try {
    localStorage.setItem(FEEDBACK_KEY, on ? 'on' : 'off');
  } catch {
    // this page only
  }
}
/** Whether a game in play shows each move's classification: never in a drill, by the setting in practice. */
export const showsFeedback = (s: PracticeSetup, on: boolean): boolean => !s.silent && (s.kind !== 'practice' || on);

export interface PracticeSetup {
  /** `endgame` (§5.145): a theoretical endgame against Stockfish, each move judged for its goal. */
  kind: 'practice' | 'advantage' | 'checklist' | 'endgame';
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
  /** The positions before `fen` (a checklist's lead-up from the start), by key, for the repetition draw. */
  before?: string[];
  /** The positions before `fen`, oldest first (FENs), for the 23M Maia's history: the line the game was started from (§5.190). */
  lead?: string[];
  /** The endgame drilled (kind `endgame`). */
  endgame?: Endgame;
  /** An exact retry (§5.207): the earlier game's moves from `fen` (UCI), the opponent's played again until the user plays a new move. */
  retry?: string[];
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
  /** The position's lines before the user's move (first move, score for the mover), for the tactic scan. */
  pvs?: Pv[];
  judging?: boolean;
  /** The tablebase's verdict on an endgame's move, where it answered (§5.187). */
  tb?: TablebaseVerdict;
  /** The user's thinking time for this move (ms): from the turn's start (the answer on the board) to the move (§5.178). */
  ms?: number;
}

/** `draw` is insufficient material; `repetition` and `fifty` the rules' draws; `agreed` a draw offered and accepted; `goal` an endgame's goal reached (a pawn queened, a bare king, a draw held). */
export type EndReason = 'mate' | 'mated' | 'stalemate' | 'draw' | 'repetition' | 'fifty' | 'agreed' | 'claim' | 'collapse' | 'stopped' | 'interrupted' | 'goal';

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
  /** A draw offered at the position after `at` moves: the opponent answering, or declined there. */
  drawOffer?: { at: number; state: 'pending' | 'declined' };
  /**
   * An endgame's move that threw its goal away (§5.145), the first, found by its judge in the
   * background, perhaps after the user has played on: the game waits there for Take back (or Play
   * on), the move that kept it (`uci`, `san`) ready to show.
   */
  slip?: { at: number; uci?: string; san?: string };
  /** This endgame try already counted as missed (a slip, a hint): nothing more is recorded for it. */
  failed?: boolean;
  /** The try's first slip, kept for its end's words when the move itself has been taken back. */
  missed?: { fenBefore: string; san: string; keep?: string };
  /** An endgame's end reached, waiting for the judges still out (a slip found meanwhile stops the game there instead). */
  ending?: EndReason;
  /** The moves before this one were played on past a slip (Play on): no slip is looked for among them. */
  playedOn?: number;
  /**
   * A solved endgame try's grade (§5.178): `auto` from the thinking time (`secs` a move), `g` as it
   * stands (the user's own once changed), `t` the try's recorded time.
   */
  solveGrade?: { auto: SolveGrade; g: SolveGrade; secs: number; t: number };
}

export const practice = signal<PracticeGame | undefined>(undefined);
let gen = 0;

// When the user's turn began (§5.178): the board set up, or the answer played. A move's thinking
// time runs from there; a premove's is about none.
let turnAt = 0;
let turnOf = '';
practice.subscribe((p) => {
  if (!p || p.phase !== 'user') return;
  const k = `${p.gen}:${p.moves.length}`;
  if (k !== turnOf) {
    turnOf = k;
    turnAt = Date.now();
  }
});

const narrow = smallDevice;

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
  // Offline mode (§5.203): Maia at once, without asking the worker for what it may not fetch.
  if (offlineMode()) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    // mistake-lab's 5 s timeout: a database that doesn't answer is a failure, Maia then.
    const timer = setTimeout(() => (waiting.delete(id), resolve(null)), 5000);
    waiting.set(id, (r) => (clearTimeout(timer), resolve(r)));
    postToWorker({ type: 'practiceGames', id, fen, speeds: o.speeds, ratings: o.ratings } satisfies ToWorker);
  });
}

/** The source shown for a course author's reply in an endgame drill. */
export const COURSE_SOURCE = 'the course';

/** Stockfish's lines for a draw's attacker: room for a line that doesn't repeat (§5.148). */
const DRAW_LINES = 5;

/**
 * Maia's moves for an endgame's opponent at `MAIA_ELO` (§5.147), once its files are on this device
 * (the switch can stay off); null without them, or when it doesn't answer within 30 s of starting
 * and 5 s of being asked (Stockfish alone then).
 */
export async function endgameMaia(fen: string, before?: readonly string[]): Promise<MaiaMove[] | null> {
  const asked = maiaPolicies(fen, [MAIA_ELO], before).then((r) => r?.[0] ?? null);
  return Promise.race([asked, new Promise<null>((r) => setTimeout(() => r(null), 35_000))]);
}

/**
 * An endgame's opponent (§5.147, the owner's request): Maia's likeliest move that Stockfish finds
 * sound (`opponentPick`), its moves searched alone at the judges' depth; Stockfish's own (its best
 * in a defence, `pressingMove` against a draw) when Maia isn't on this device or none of its moves
 * is sound. The user waits on it, so its searches go ahead of the judges in the background. Varied
 * over tries (§5.174): the replies met here before tried last, the last try's again after a miss.
 * With "Maia alone" on, Maia's reply is played without waiting on Stockfish (`trustPick`).
 */
async function endgameReply(fen: string, e: Endgame, userMoves: number, seen: ReadonlySet<string> = new Set(), before: readonly string[] = []): Promise<{ uci: string; source: string; dbFailed: boolean } | undefined> {
  const pos = positionOf(fen);
  if (!pos) return undefined;
  const goal = e.goal;
  const key = keyFen(fen)?.key;
  const hints = key ? hintsAt(e.id, key) : { seen: {} };
  const replay = hints.replay && parseUciMove(pos, hints.replay) ? hints.replay : undefined;
  // A draw's attacker pushes on once a third of the drill is held (§5.148).
  const pushes = pushNow(e, userMoves) ? pawnPushes(pos) : [];
  const after = (uci: string) => {
    const p = pos.clone();
    const m = parseUciMove(p, uci);
    if (!m) return undefined;
    p.play(m);
    return p;
  };
  const over = (uci: string) => after(uci)?.isEnd() ?? true;
  /** How a move ends the game, if it does: a mate (the mover wins) or a draw (stalemate, a dead position). */
  const ends = (uci: string): 'mate' | 'draw' | undefined => {
    const p = after(uci);
    return !p?.isEnd() ? undefined : p.isCheckmate() ? 'mate' : 'draw';
  };
  const repeats = (uci: string) => {
    const p = after(uci);
    const k = p && keyFen(makeFen(p.toSetup()))?.key;
    return !!k && seen.has(k);
  };
  // A course drill's author's reply, until a try that met the author's line is solved (the owner's
  // request of 2026-11-15): the course's defence, which proves its point, ahead of Maia's.
  const authored = key ? e.author?.[key] : undefined;
  if (authored && authorFirst(e.id) && parseUciMove(pos, authored)) return { uci: authored, source: COURSE_SOURCE, dbFailed: false };
  if (endgameMaiaAlone.peek()) {
    const policy = await endgameMaia(fen, before);
    if (policy?.length) {
      let ordered = [...new Set([...(replay ? [replay] : []), ...replyOrder(maiaCandidates(policy), hints.seen).map((m) => m.uci)])];
      let pushed = pushes;
      // Lc0, when it is on this device, vetoes a move it rates clearly worse than the best (§5.176): a king
      // step that loses the opposition looks sound to the board-only checks. A move that ends the game is
      // rated by its result (a draw 0.5), so the others are measured against it. With every candidate
      // vetoed, its own likeliest move; with none of them, no veto.
      const hung = (uci: string) => {
        const p = after(uci);
        return !p || hangs(p, materialFor(p, pos.turn) - materialFor(pos, pos.turn));
      };
      const lc0 = await endgameLc0(fen, [...ordered, ...pushes]);
      let lc0Own = false;
      const vetted = !!lc0 && Object.keys(lc0.values).length > 0;
      if (lc0 && vetted) {
        // Measured against the best that gives nothing away: one run overrates a move that drops a pawn.
        const vetoed = lc0Vetoed(lc0.values, undefined, (u) => ends(u) !== undefined || !hung(u));
        ordered = ordered.filter((u) => !vetoed.has(u));
        pushed = pushes.filter((u) => !vetoed.has(u));
        if (!ordered.length && lc0.top && !vetoed.has(lc0.top)) {
          ordered = [lc0.top];
          lc0Own = true;
        }
      }
      const pick = trustPick(goal, ordered, policy, pushed, { ends, repeats, hangs: hung }, vetted);
      if (pick) return { uci: pick.uci, source: lc0Own ? 'Lc0' : `Maia ${MAIA_ELO}`, dbFailed: false };
    }
  }
  const depth = narrow() ? 16 : 18;
  const [a, maia] = await Promise.all([search(fen, goal === 'draw' ? DRAW_LINES : 1, depth, 6000, undefined, true), endgameMaia(fen, before)]);
  const scored = (r: typeof a): OpponentLine[] => (r?.lines ?? []).filter((l) => l.pv.length).map((l) => ({ cp: moverScore(l.score, pos.turn), pv: l.pv }));
  const lines = scored(a);
  const material = (pv: readonly string[]) => {
    const p = pos.clone();
    for (const uci of pv) {
      const m = parseUciMove(p, uci);
      if (!m) return undefined;
      p.play(m);
    }
    return materialFor(p, pos.turn);
  };
  // Maia's moves Stockfish's lines don't cover, searched alone: those tried before Stockfish's own
  // move (no search needed after it, unless it repeats), the last try's reply after a miss, and the
  // pawn pushes when asked for; in Maia's order, so a search asked before is asked alike.
  const base = goal === 'draw' ? undefined : lines[0]?.pv[0];
  const candidates = maiaCandidates(maia ?? []);
  const order = replyOrder(candidates, hints.seen).map((m) => m.uci);
  const upTo = base ? order.indexOf(base) : -1;
  const needed = new Set([...(upTo < 0 ? order : order.slice(0, upTo)), ...(replay && replay !== base ? [replay] : [])]);
  const byMaia = [...candidates.map((m) => m.uci).filter((u) => needed.has(u)), ...[...needed].filter((u) => !candidates.some((m) => m.uci === u))];
  const rest = [...new Set([...pushes, ...byMaia])].filter((u) => !lines.some((l) => l.pv[0] === u));
  const more = rest.length ? scored(await search(fen, rest.length, depth, 6000, rest, true)) : [];
  const lineFor = (uci: string) => [...lines, ...more].find((l) => l.pv[0] === uci);
  const pick = opponentPick(goal, lines, candidates, lineFor, material, over, { pushes, repeats, line: lineOf(e), seen: hints.seen, ...(replay ? { replay } : {}) });
  return pick ? { uci: pick.uci, source: pick.maia ? `Maia ${MAIA_ELO}` : 'Stockfish', dbFailed: false } : undefined;
}

/** The game's positions before the one on the board, oldest first: what the 23M Maia reads beside it (§5.188). */
const positionsBefore = (p: PracticeGame, n: number = p.moves.length): string[] => gameBefore(p.setup.lead, p.setup.fen, p.moves.map((m) => m.fen), n);

/**
 * The opponent's move: the database, then Maia, then Stockfish; undefined when none answers. A
 * position with plenty of games at the filter (`BLEND.thin`): the database's draw, unchecked (a
 * prepared opponent's weighted by how each reply scores for it). A thin one (§5.206): the games and
 * Maia's policy as one estimate, checked by Stockfish as Maia's moves are (Medium and Hard); without
 * the check, the database's draw as often as its games weigh against Maia's, else Maia's.
 */
async function opponentMove(fen: string, o: Opponent, before?: readonly string[], userFen?: string, handled?: ReadonlyMap<string, number>): Promise<{ uci: string; source: string; dbFailed: boolean } | undefined> {
  const pos = positionOf(fen);
  if (!pos) return undefined;
  // A checklist drill's variety (§5.207): how often each reply here was handled lately (standard UCI).
  const count = handled?.size ? (uci: string) => handled.get(uciOf(fen, uci) ?? uci) ?? 0 : undefined;
  let dbFailed = false;
  const db = await explorerGames(fen, o);
  const games = db && 'games' in db ? db.games : null;
  if (!games) dbFailed = true;
  const total = explorerTotal(games);
  const fromDb = () => {
    const picked = pickExplorerMove(games, Math.random, { ...PRACTICE, ...(o.prepared ? { prepared: pos.turn } : {}), ...(count ? { handled: (m: { uci: string }) => count(m.uci) } : {}) });
    const move = picked && parseUciMove(pos, picked.uci);
    return picked && move ? { uci: uciOf(fen, picked.uci)!, source: `DB (${picked.white + picked.draws + picked.black})`, dbFailed } : undefined;
  };
  if (total >= BLEND.thin) {
    const m = fromDb();
    if (m) return m;
  }
  const policy = await maiaPolicy(fen, o.maiaElo, before);
  if (policy && o.guard) {
    const dbMoves = (games?.moves ?? []).flatMap((m) => {
      const uci = uciOf(fen, m.uci);
      return uci ? [{ ...m, uci }] : [];
    });
    const blend = blendMoves(dbMoves, policy, o.precision);
    const varied = count ? variedWeights(blend, (m) => m.weight, (m) => count(m.uci)) : undefined;
    const c = await guardChoice(fen, varied ? blend.map((m) => ({ ...m, weight: varied(m) })) : blend, o.precision, userFen);
    if (c) return { uci: c.move.uci, source: total > 0 ? `DB (${total}) + Maia (checked)` : 'Maia (checked)', dbFailed };
  }
  if (Math.random() < databaseShare(total, !!policy)) {
    const m = fromDb();
    if (m) return m;
  }
  let m = policy && maiaPick(policy, o.precision, Math.random);
  if (policy && count) {
    const odds = temperedOdds(policy, o.precision);
    m = drawByWeight(policy, variedWeights(policy, (x) => odds.get(x.uci) ?? 0, (x) => count(x.uci)), Math.random) ?? m;
  }
  if (m) return { uci: m.uci, source: 'Maia', dbFailed };
  const a = await analyseForStorm(fen, 1, 16, 4000);
  const best = a?.lines[0]?.pv[0];
  return best ? { uci: best, source: 'Stockfish', dbFailed } : undefined;
}

/** The check's searches (§5.205), ahead of the judges': the best move, Maia's likely moves together, and the position before the user's move when needed. */
const GUARD_DEPTH = 14;
const GUARD_MS = 2000;
const GUARD_LINES_MS = 5000;

/**
 * The opponent's move by the check (`guardedChoice`): Stockfish's best at `fen`, Maia's likely
 * moves scored in one search (`searchmoves`), and, when one of them looks like a blunder, the best
 * score before the user's move at `userFen` (missing the user's mistake is no blunder). Null when
 * Stockfish can't score them all: Maia's pick is played unchecked.
 */
async function guardChoice(fen: string, policy: readonly { uci: string; prob: number; weight?: number }[], precision: number, userFen?: string) {
  const pos = positionOf(fen);
  if (!pos) return null;
  const cands = guardCandidates(policy);
  const [bestA, candA] = await Promise.all([search(fen, 1, GUARD_DEPTH, GUARD_MS, undefined, true), search(fen, cands.length, GUARD_DEPTH, GUARD_LINES_MS, cands.map((m) => m.uci), true)]);
  const best = bestA?.lines[0];
  if (!best?.pv.length) return null;
  const scored = cands.flatMap((m) => {
    const l = candA?.lines.find((x) => x.pv[0] === m.uci);
    return l ? [{ ...m, wp: winPct(moverScore(l.score, pos.turn)) }] : [];
  });
  if (scored.length < cands.length) return null;
  const bestWp = Math.max(winPct(moverScore(best.score, pos.turn)), ...scored.map((m) => m.wp));
  let before: number | undefined;
  const up = userFen === undefined ? undefined : positionOf(userFen);
  if (up && guardNeedsBefore(bestWp, scored.map((m) => m.wp))) {
    const l = (await search(userFen!, 1, GUARD_DEPTH, GUARD_MS, undefined, true))?.lines[0];
    if (l?.pv.length) before = 100 - winPct(moverScore(l.score, up.turn));
  }
  return guardedChoice(policy, scored, bestWp, before, precision, Math.random);
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
/** A position's lines at the judges' depth, kept for the review (its lines and its eval bar ask again). */
export function analyse(fen: string, lines: number, quick = false) {
  return quick ? search(fen, 1, narrow() ? 16 : 18, ENDGAME_JUDGE_MS, undefined, 'ahead') : search(fen, lines, narrow() ? 16 : 18, 8000);
}

/**
 * An endgame's judges and its hint (the owner's request, 2026-11-14: "Checking your moves…" took
 * long with the defence needing no Stockfish): the best move's score and the played move's, one
 * line each, at most this long, ahead of the background searches. The slip rule needs no more
 * (`slips`); three lines at depth 18 took 4 to 10 s a king and pawn position, 24 s over a drill.
 */
const ENDGAME_JUDGE_MS = 3000;

function search(fen: string, lines: number, depth: number, movetime: number, moves?: readonly string[], urgent: boolean | 'ahead' = false) {
  const key = `${fen}|${lines}|${depth}|${moves?.join(' ') ?? ''}`;
  let p = searches.get(key);
  if (!p) {
    p = analyseForStorm(fen, lines, depth, movetime, moves, urgent);
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

/**
 * Judges a move from its position (the trainer's rule): the classification, the loss, the scores
 * for the mover. A move judged worse than good is searched again deeper, with the lines' moves, and
 * judged by that search (§5.136); only when `recheckIf` says so, given it (an endgame's move, only
 * when it looks like a slip: nothing else about it is shown).
 */
export async function judge(fenBefore: string, uci: string, fenAfter: string, recheckIf?: (bestCp: number, afterCp: number) => boolean, quick = false, goal?: Goal): Promise<Partial<PracticeMove> | undefined> {
  const pos = positionOf(fenBefore);
  if (!pos) return undefined;
  const moverLines = (a: Awaited<ReturnType<typeof analyse>>): MoverLine[] => (a?.lines ?? []).filter((l) => l.pv.length).map((l) => ({ move: l.pv[0]!, cp: moverScore(l.score, pos.turn) }));
  // An endgame's move (§5.187): the tablebase asked beside Stockfish, and its verdict the judge where it has one.
  const table = goal ? tablebase(fenBefore) : undefined;
  let a = await analyse(fenBefore, 3, quick);
  const tbPos = await table;
  const tb = tbPos && tablebaseVerdict(tbPos, uci);
  // The move that keeps the goal: Stockfish's best if the tablebase agrees it does, else the tablebase's first.
  const keeping = (best: string | undefined): string | undefined => {
    if (!tbPos || !goal) return best;
    const keep = keepingMoves(goal, tbPos);
    return best && keep.includes(best) ? best : (keep[0] ?? best);
  };
  let lines = moverLines(a);
  const matched = lines.find((l) => l.move === uci);
  let afterCp = matched?.cp;
  const after = positionOf(fenAfter);
  const ended = !!after?.isEnd();
  if (ended) afterCp = after!.isCheckmate() ? 10000 : 0;
  else if (!matched && after) {
    const l = (await analyse(fenAfter, 1, quick))?.lines[0];
    if (l?.pv.length) afterCp = -moverScore(l.score, after.turn);
  }
  let j = judgeMove(lines, uci, afterCp);
  // Stockfish gone, the tablebase there: its verdict alone.
  if (!j) return tb ? { tb, bestMoveUci: keeping(undefined) ?? '' } : undefined;
  if (!tb && !ended && needsRecheck(j) && (recheckIf?.(j.bestCp, afterCp ?? j.bestCp - j.cpLoss) ?? true)) {
    const moves = recheckMoves(lines, uci);
    const deep = await search(fenBefore, moves.length, narrow() ? RECHECK.phoneDepth : RECHECK.depth, RECHECK.movetime, moves);
    const deepLines = moverLines(deep);
    const k = rejudge(deepLines, uci);
    if (k) {
      j = k;
      a = deep;
      lines = deepLines;
      afterCp = deepLines.find((l) => l.move === uci)!.cp;
    }
  }
  const best = a!.lines[0]!;
  return { classification: j.classification, wpDrop: j.wpDrop, cpLoss: j.cpLoss, bestCp: j.bestCp, afterCp: afterCp ?? j.bestCp - j.cpLoss, bestMoveUci: keeping(j.bestMove) ?? '', ...(tb ? { tb } : {}), bestLine: sanLine(fenBefore, best.pv), pvs: lines.map((l) => ({ cp: l.cp, firstMove: l.move })) };
}

/** Judges still out, by game (a takeback or a resume starts a new one while the old judges finish). */
const pendingBy = new Map<number, number>();
const judging = new Set<Promise<unknown>>();

function judgeAt(g: number, i: number): Promise<void> {
  const p = practice.peek();
  const mv = p?.moves[i];
  if (!p || !mv) return Promise.resolve();
  pendingBy.set(g, (pendingBy.get(g) ?? 0) + 1);
  const e = p.setup.endgame;
  const job = judge(mv.fenBefore, mv.uci, mv.fen, e && ((best, after) => slips(e.goal, best, after, lineOf(e))), !!e, e?.goal).then((j) => {
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
    const left = (pendingBy.get(g) ?? 1) - 1;
    if (left) pendingBy.set(g, left);
    else {
      pendingBy.delete(g);
      patch(g, () => ({ judged: true }));
    }
  });
}

/** A judge come in, as the game reads it: an endgame looks for its first slip, the rest count towards Claim Victory. */
function judgedAt(g: number, i: number): void {
  if (practice.peek()?.setup.kind === 'endgame') endgameJudged(g);
  else claimCheck(g, i);
}

/* ------------------------------------------------------------------ the game */

/**
 * The line a "play on from here" was opened from, by position: the screen opens on a FEN alone (the
 * route has no room for a line), so the opener leaves the positions before it here for the 23M Maia to
 * read (§5.190). Kept for this session; a game started elsewhere has none.
 */
const leads = new Map<string, string[]>();
export function rememberLead(fen: string, before: readonly string[]): void {
  leads.set(fen, before.slice(-7));
  if (leads.size > 50) leads.delete(leads.keys().next().value!);
}
/** The positions remembered before `fen` (`rememberLead`), if any. */
export const leadFor = (fen: string): string[] | undefined => leads.get(fen);

export function startPractice(setup: PracticeSetup): void {
  const pos = positionOf(setup.fen);
  if (!pos) return;
  gen++;
  if (setup.kind === 'endgame' && setup.endgame) tryBegun(setup.endgame.id);
  practice.value = { gen, setup, moves: [], phase: pos.turn === setup.color ? 'user' : 'opponent', track: startTrack(setup.peakCp ?? null), claim: false, judged: true };
  if (pos.turn !== setup.color) void opponentTurn(gen);
  else ponder(practice.peek()!);
}

export function leavePractice(): void {
  gen++;
  parked = undefined;
  practice.value = undefined;
  clearSaved();
}

/** A game left for another page: the history entry it was played on (app/mode.ts), and the game. */
let parked: { entry: string; gen: number } | undefined;

/**
 * The practice screen left for another page (Analyse, say): the game is kept for the entry it was
 * played on, so coming back to it by ← finds it (the owner's request, 2026-10-08). A game over
 * keeps its review as it is; a game in play stops the opponent's search and stays saved on the
 * device, to be played on (`takeUpPractice`).
 */
export function parkPractice(entry: string): void {
  const p = practice.peek();
  if (!p) return leavePractice();
  parked = { entry, gen: p.gen };
  if (p.phase !== 'over') gen++;
}

/**
 * The practice screen opened on `entry`: true when the game left there was taken up again (a game
 * over shown as it was, a game in play played on); else the game left elsewhere is let go.
 */
export function takeUpPractice(entry: string): boolean {
  const was = parked;
  parked = undefined;
  if (was === undefined) return false;
  const p = practice.peek();
  // Another entry's, or another game started since (a checklist's, a game card's): not this one.
  if (was.entry !== entry || p?.gen !== was.gen) {
    if (p?.gen === was.gen) leavePractice();
    return false;
  }
  if (p.phase === 'over') return true;
  // Played on from where it was left, from memory: a game of a move or none isn't kept on the device.
  resumePractice({ savedAt: Date.now(), game: { setup: p.setup, moves: p.moves, track: p.track, claim: p.claim, ...(p.source ? { source: p.source } : {}), ...(p.repIgnored ? { repIgnored: true } : {}), ...(p.tried ? { tried: p.tried } : {}), ...(p.failed ? { failed: true } : {}), ...(p.slip ? { slip: p.slip } : {}), ...(p.missed ? { missed: p.missed } : {}), ...(p.ending ? { ending: p.ending } : {}), ...(p.playedOn !== undefined ? { playedOn: p.playedOn } : {}) } });
  return true;
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
  /** An endgame's try missed already, its slip waiting, its end waiting on the judges (kept in memory only: endgames aren't saved). */
  failed?: boolean;
  slip?: PracticeGame['slip'];
  missed?: PracticeGame['missed'];
  ending?: EndReason;
  playedOn?: number;
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
    ...(g0.failed ? { failed: true } : {}),
    ...(g0.slip ? { slip: g0.slip } : {}),
    ...(g0.missed ? { missed: g0.missed } : {}),
    ...(g0.ending ? { ending: g0.ending } : {}),
    ...(g0.playedOn !== undefined ? { playedOn: g0.playedOn } : {}),
  };
  g0.moves.forEach((m, i) => {
    if (m.judging) void judgeAt(g, i).then(() => judgedAt(g, i));
  });
  // An endgame waits on Take back after a slip, and its end on the judges still out.
  if (g0.slip) return;
  if (g0.setup.kind === 'endgame') {
    if (g0.ending) return endgameJudged(g);
    if (!opponentToMove) ponder(practice.peek()!);
  }
  if (opponentToMove) void opponentTurn(g);
}

// Saved at every change of a game in play; cleared when it ends.
effect(() => {
  const p = practice.value;
  if (!p || p.gen < 0) return;
  // An endgame's try is short and graded from its start: never kept to resume (§5.145).
  if (p.setup.kind === 'endgame') return;
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
  if (!p || p.phase !== 'user' || p.slip || p.ending) return;
  const before = fenAfter(p);
  const after = played(before, uci);
  if (!after) return;
  const g = p.gen;
  const i = p.moves.length;
  const key = keyFen(before)?.key;
  // The repertoire check, practising from a position or in a checklist's drill (past its line's end
  // too): the move taken back, the first one tried remembered. An advantage drill is graded as played.
  if (p.setup.kind !== 'advantage' && p.setup.kind !== 'endgame' && key) {
    const check = repertoireCheck(repertoireEntries(key), { uci, san: after.san }, !!p.repIgnored);
    if (check.refuse) {
      patch(g, (q) => ({ deviation: { san: after.san, uci, repUci: check.uci, repSan: check.san ?? check.uci }, ...(q.tried?.key === key ? {} : { tried: { key, san: after.san, uci } }) }));
      return;
    }
  }
  const tried = p.tried && p.tried.key === key && p.tried.uci !== uci ? p.tried : undefined;
  const next = replace(g, (q) => {
    const { deviation: _d, hint: _h, ...rest } = q;
    const mv: PracticeMove = { san: after.san, uci, isUser: true, fenBefore: before, fen: after.fen, judging: true, ms: Math.max(0, Date.now() - turnAt), ...(tried ? { repTried: { san: tried.san, uci: tried.uci } } : {}) };
    const out: PracticeGame = { ...rest, moves: [...q.moves, mv], phase: 'opponent' };
    if (tried) delete out.tried;
    return out;
  });
  if (!next) return;
  const job = judgeAt(g, i);
  // An endgame's move is judged in the background while Stockfish answers (the owner's request,
  // 2026-11-01: waiting for the judge was slow on a phone); a slip stops the game once it is found.
  if (p.setup.kind === 'endgame') {
    void job.then(() => endgameJudged(g));
    return endgameAfterUser(g);
  }
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
  const now = practice.peek();
  const end = now?.gen === g && endOf(now, true);
  if (end) return void finish(g, end);
  setTimeout(() => void opponentTurn(g), 500);
}

/** Whether the user's last move can be taken back: a game from a position or a checklist's drill, in
 *  play, with a move of the user's on the board (an advantage drill is graded, so it has none). */
export const canTakeBack = (p: PracticeGame): boolean => p.setup.kind !== 'advantage' && p.phase !== 'over' && p.moves.some((m) => m.isUser);

/**
 * Takeback (the owner's request, 2026-10-26: a misclick against Maia or the database): the user's
 * last move taken off, with the opponent's answer when it has come, the user to move again. The
 * game goes on as a new one (its own `gen`) so the opponent's search and the judges of the moves
 * taken off land nowhere; the judges still out on the moves kept are asked again, and the Claim
 * Victory count is counted again over the moves kept.
 */
export function takeBack(): void {
  const p = practice.peek();
  if (!p || !canTakeBack(p)) return;
  // An endgame's slip is taken back with every move played after it.
  let cut = p.moves.length;
  if (p.slip) cut = p.slip.at;
  else {
    while (cut > 0 && !p.moves[cut - 1]!.isUser) cut--;
    cut--;
  }
  const moves = p.moves.slice(0, cut);
  gen++;
  const g = gen;
  let track = startTrack(p.setup.peakCp ?? null);
  let claim = false;
  for (const m of moves)
    if (m.isUser && m.afterCp !== undefined) ({ track, claim } = trackAdvantage(track, m.afterCp, m.wpDrop ?? 0, false));
  const { deviation: _d, hint: _h, premove: _p, drawOffer: _o, slip: _s, ending: _e, playedOn, ...rest } = p;
  const lastSource = [...moves].reverse().find((m) => !m.isUser)?.source;
  const next: PracticeGame = { ...rest, gen: g, moves, phase: 'user', track, claim, judged: !moves.some((m) => m.judging) };
  if (lastSource) next.source = lastSource;
  else delete next.source;
  // Played on past a slip that is still on the board: the moves before it are still passed over.
  if (playedOn !== undefined && Math.min(playedOn, cut) > 0) next.playedOn = Math.min(playedOn, cut);
  // A move that corrected the repertoire check, taken back: the move first tried there is still remembered.
  const off = p.moves[cut]!;
  const key = off.repTried && keyFen(off.fenBefore)?.key;
  if (key) next.tried = { key, ...off.repTried! };
  practice.value = next;
  moves.forEach((m, i) => {
    if (m.judging) void judgeAt(g, i).then(() => judgedAt(g, i));
  });
  ponder(next);
}

/** The Claim Victory count, as each move's judge comes in (a game not drilled for an advantage). */
function claimCheck(g: number, i: number): void {
  const q = practice.peek();
  if (!q || q.gen !== g || q.phase === 'over' || q.setup.kind === 'endgame') return;
  const mv = q.moves[i];
  if (mv?.afterCp === undefined) return;
  const t = trackAdvantage(q.track, mv.afterCp, mv.wpDrop ?? 0, false);
  patch(g, () => ({ track: t.track, claim: t.claim }));
}

/** The positions of the game so far, the ones before its start included, by key. */
function seenKeys(p: PracticeGame): Set<string> {
  return new Set([...(p.setup.before ?? []), ...[p.setup.fen, ...p.moves.map((m) => m.fen)].map((f) => keyFen(f)?.key ?? f)]);
}

/** The game's end at its last position: mate, stalemate, insufficient material, then repetition (the positions before its start counted) and fifty moves. */
function endOf(p: PracticeGame, byUser: boolean): EndReason | undefined {
  const pos = positionOf(fenAfter(p));
  if (!pos) return undefined;
  if (pos.isEnd()) {
    if (pos.isCheckmate()) return byUser ? 'mate' : 'mated';
    if (pos.isStalemate()) return 'stalemate';
    return 'draw';
  }
  const keys = [...(p.setup.before ?? []), ...[p.setup.fen, ...p.moves.map((m) => m.fen)].map((f) => keyFen(f)?.key ?? f)];
  return ruleDraw(keys, pos.halfmoves);
}

async function opponentTurn(g: number): Promise<void> {
  const p = practice.peek();
  if (!p || p.gen !== g || p.phase !== 'opponent' || p.slip || p.ending) return;
  const fen = fenAfter(p);
  const at = p.moves.length;
  const again = p.setup.retry && retryMove(p.setup.retry, p.moves.map((m) => m.uci));
  const m =
    again && played(fen, again)
      ? { uci: again, source: RETRY_SOURCE, dbFailed: false }
      : p.setup.kind === 'endgame'
        ? await endgameReply(fen, p.setup.endgame!, p.moves.filter((m) => m.isUser).length, seenKeys(p), positionsBefore(p))
        : await opponentMove(fen, p.setup.opponent, positionsBefore(p), p.moves.at(-1)?.isUser ? p.moves.at(-1)!.fenBefore : undefined, handledAt(p, fen));
  const q = practice.peek();
  // An endgame stopped on a slip meanwhile lets the answer go; one played on asks again, and the
  // first answer in is the one played.
  if (!q || q.gen !== g || q.phase !== 'opponent' || q.moves.length !== at || q.slip || q.ending) return;
  if (!m) return void finish(g, 'interrupted');
  const after = played(fen, m.uci);
  if (!after) return void finish(g, 'interrupted');
  const note = m.dbFailed && !q.note && !q.setup.silent ? 'The database is unavailable (a Lichess login is needed): Maia or Stockfish answers.' : q.note;
  // The premove is taken off with the answer: played next when it is legal here, else dropped.
  const pre = q.premove;
  const now = replace(g, (r) => {
    const { premove: _p, ...rest } = r;
    return { ...rest, moves: [...r.moves, { san: after.san, uci: m.uci, isUser: false, fenBefore: fen, fen: after.fen, source: m.source }], source: m.source, phase: 'user', ...(note ? { note } : {}) };
  });
  // The defence's reply remembered for the tries to come (§5.174).
  const replyKey = now?.setup.endgame && keyFen(fen)?.key;
  if (now?.setup.endgame && replyKey) replyPlayed(now.setup.endgame.id, replyKey, m.uci, m.source === COURSE_SOURCE);
  const end = now && endOf(now, false);
  if (end) return now.setup.kind === 'endgame' ? conclude(g, end) : finish(g, end);
  if (now) ponder(now);
  const uci = pre && premoveUci(after.fen, pre);
  if (uci) void practiceMove(uci);
}

/** The source shown for a reply replayed by an exact retry (§5.207). */
export const RETRY_SOURCE = 'the earlier game';

/**
 * How often each reply at `fen` was handled lately (§5.207): a checklist drill's, for the
 * opponent's first `VARIETY.replies` moves; read from the synced history.
 */
function handledAt(p: PracticeGame, fen: string): ReadonlyMap<string, number> | undefined {
  if (p.setup.kind !== 'checklist' || p.moves.filter((m) => !m.isUser).length >= VARIETY.replies) return undefined;
  const key = keyFen(fen)?.key;
  const data = trainData.peek();
  if (!key || !data) return undefined;
  return handledReplies(historyOf(data.states.keys(), data.eventsOf), Date.now()).get(key);
}

/** A premove as a move at `fen` (standard UCI), when it is legal there: a pawn reaching the last rank queens (mistake-lab's, and Lichess's by default). */
export function premoveUci(fen: string, pre: { from: string; to: string }): string | undefined {
  const pos = positionOf(fen);
  const from = parseSquare(pre.from);
  const to = parseSquare(pre.to);
  if (!pos || from === undefined || to === undefined) return undefined;
  const piece = pos.board.get(from);
  const promotion = piece?.role === 'pawn' && (pre.to[1] === '8' || pre.to[1] === '1') ? ('queen' as const) : undefined;
  const move = normalizeMove(pos, { from, to, ...(promotion ? { promotion } : {}) });
  if (!isNormal(move) || !pos.isLegal(move)) return undefined;
  // The promotion is in the move: standard UCI writes it (c7c8q).
  return standardUci(pos, move);
}

/**
 * A premove set or changed during the opponent's turn. The board tells of it a moment after the
 * hand made it: when the opponent has answered meanwhile, it is played at once (legal), as it would
 * have been.
 */
export function setPremove(from: string, to: string): void {
  const p = practice.peek();
  if (!p || p.slip || p.ending) return;
  if (p.phase === 'opponent') patch(p.gen, () => ({ premove: { from, to } }));
  else if (p.phase === 'user') {
    const uci = premoveUci(fenAfter(p), { from, to });
    if (uci) void practiceMove(uci);
  }
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
  if (!p || p.phase !== 'user' || p.slip || p.ending || (p.setup.kind !== 'practice' && p.setup.kind !== 'endgame')) return;
  const fen = fenAfter(p);
  const g = p.gen;
  if (p.hint?.fen === fen) {
    if (p.hint.level === 1 && p.hint.uci) patch(g, () => ({ hint: { ...p.hint!, level: 2 } }));
    return;
  }
  // An endgame's hint is Stockfish's, and the try counts as missed, as a hint does in training (§5.2).
  if (p.setup.kind === 'endgame') endgameMiss(g, 'loss');
  const key = p.setup.kind === 'endgame' ? undefined : keyFen(fen)?.key;
  const rep = key ? repertoireEntries(key)?.[0]?.uci : undefined;
  patch(g, () => ({ hint: { fen, level: 1, ...(rep ? { uci: rep } : {}) } }));
  if (rep) return;
  const best = (await analyse(fen, 3, p.setup.kind === 'endgame'))?.lines[0]?.pv[0];
  const q = practice.peek();
  if (best && q?.gen === g && q.hint?.fen === fen) patch(g, () => ({ hint: { ...q.hint!, uci: best } }));
}

/** Stop: the game ends where it is, scored by the last judged move. */
/**
 * The game over played again from its start: afresh, or as an exact retry (§5.207, the owner's
 * request of 2026-11-20), the opponent playing its moves of this game again until the user plays a
 * new move. A game played from the opponent's move or by the database's dice alike.
 */
export function playAgain(exact = false): void {
  const p = practice.peek();
  if (!p) return;
  const { retry: _r, ...setup } = p.setup;
  startPractice(exact && p.moves.length ? { ...setup, retry: p.moves.map((m) => m.uci) } : setup);
}

/** Whether a game over can be retried exactly: a game from a position or a checklist's drill, with the opponent's moves to replay. */
export const canRetryExact = (p: PracticeGame): boolean => (p.setup.kind === 'practice' || p.setup.kind === 'checklist') && p.moves.some((m) => !m.isUser);

export function stopPractice(): void {
  const p = practice.peek();
  if (p && p.phase !== 'over') finish(p.gen, 'stopped');
}

/** Claim Victory (three moves running at +10). */
export function claimVictory(): void {
  const p = practice.peek();
  if (p && p.phase !== 'over' && p.claim) finish(p.gen, 'claim');
}

/** Whether a draw can be offered: the user to move in a game from a position or a checklist's drill, not already offered here. */
export const canOfferDraw = (p: PracticeGame): boolean => p.setup.kind !== 'advantage' && p.setup.kind !== 'endgame' && p.phase === 'user' && p.drawOffer?.at !== p.moves.length;

/**
 * Offer draw (the owner's request, 2026-10-30): the opponent answers once the judges are in and the
 * position is searched, and accepts only by `drawAccepted`'s rule; declined, it says nothing more,
 * so the offer doesn't give the score away. One offer a position; a move played meanwhile lets it lapse.
 */
export async function offerDraw(): Promise<void> {
  const p = practice.peek();
  if (!p || !canOfferDraw(p)) return;
  const g = p.gen;
  const at = p.moves.length;
  const fen = fenAfter(p);
  const pos = positionOf(fen);
  if (!pos) return;
  patch(g, () => ({ drawOffer: { at, state: 'pending' } }));
  await Promise.all([...judging]);
  const top = (await analyse(fen, 3))?.lines[0];
  const q = practice.peek();
  if (!q || q.gen !== g || q.phase !== 'user' || q.moves.length !== at) return;
  const userCps = q.moves.filter((m) => m.isUser).map((m) => m.afterCp);
  const nowCp = top ? moverScore(top.score, pos.turn) : undefined;
  if (drawAccepted({ ply: plyOf(pos.fullmoves, pos.turn), userCps, nowCp })) return finish(g, 'agreed');
  patch(g, () => ({ drawOffer: { at, state: 'declined' } }));
}

const isDraw = (r: EndReason) => r === 'stalemate' || r === 'draw' || r === 'repetition' || r === 'fifty' || r === 'agreed';

const lastAfterCp = (p: PracticeGame) => [...p.moves].reverse().find((m) => m.isUser && m.afterCp !== undefined)?.afterCp;

function finish(g: number, reason: EndReason): void {
  const p = practice.peek();
  if (!p || p.gen !== g || p.phase === 'over') return;
  if (p.setup.kind === 'endgame') return finishEndgame(p, reason);
  const userCp = lastAfterCp(p);
  // A checklist drill stopped is given up: a loss, whatever the eval (it is won only by mate or a
  // claim), and counted on the line's chip (the owner's request, 2026-10-31).
  const result: 'win' | 'draw' | 'loss' =
    reason === 'mate' || reason === 'claim' ? 'win' : reason === 'mated' || reason === 'collapse' || (reason === 'stopped' && p.setup.kind === 'checklist') ? 'loss' : isDraw(reason) ? 'draw' : resultOf(userCp);
  let grade: Grade | undefined;
  if (p.setup.kind === 'advantage') {
    const outcome: AdvantageOutcome = reason === 'mate' || reason === 'claim' ? 'victory' : isDraw(reason) ? 'draw' : reason === 'interrupted' || reason === 'stopped' ? 'interrupted' : 'collapse';
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
  // A game interrupted (the opponent couldn't answer) counts nothing.
  if (p.setup.kind !== 'advantage' && reason !== 'interrupted') {
    const key = p.setup.leaf ?? keyFen(p.setup.fen)?.key;
    if (key) void recordEvent({ t, k: 'practice', card: practiceCard(key), res: result, ...(p.setup.preset ? { preset: p.setup.preset } : {}), ...(finalCp !== null ? { cp: Math.round(finalCp) } : {}), mv: userMoves });
  }
  // The history entry, once the judges are in (the review's words final); then the tactic scan.
  void Promise.all([...judging]).then(async () => {
    if (userMoves >= PRACTICE.reviewMinMoves) await writeHistory(g, reason, result, finalCp);
    void scanTactics(g);
  });
}

const OUTCOME: Record<EndReason, 'win' | 'draw' | 'loss' | 'stopped' | 'ended'> = { mate: 'win', claim: 'win', mated: 'loss', collapse: 'loss', stalemate: 'draw', draw: 'draw', repetition: 'draw', fifty: 'draw', agreed: 'draw', stopped: 'stopped', interrupted: 'ended', goal: 'win' };

async function writeHistory(g: number, reason: EndReason, result: 'win' | 'draw' | 'loss', finalCp: number | null): Promise<void> {
  const p = practice.peek();
  if (!p || p.gen !== g) return;
  const source: HistorySource = p.setup.kind === 'advantage' ? 'advantage' : p.setup.kind === 'checklist' ? 'todo' : 'practice';
  const outcome = reason === 'stopped' ? 'stopped' : OUTCOME[reason] === 'ended' ? 'ended' : result;
  const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const forced = p.setup.retry ? forcedPlies(p.setup.retry, p.moves.map((m) => m.uci)) : 0;
  const entry = historyEntry({ id, ts: Date.now(), baseFen: p.setup.fen, color: p.setup.color, source, outcome, finalCp, title: p.setup.title, moves: p.moves, review: reviewOf(p.moves, repertoireAt(p.setup.fen, p.moves)), ...(forced ? { forced } : {}) });
  if (!entry) return;
  patch(g, () => ({ historyId: id }));
  await recordEvent({ t: new Date().toISOString(), k: 'played', card: historyCard(id), game: { ...entry } });
}

/* ------------------------------------------------------------------ endgames (§5.145) */

/**
 * An endgame's position with the user to move, searched while they think: the judge of their move
 * starts from these lines, so it is mostly in by the time Stockfish has answered.
 */
function ponder(p: PracticeGame): void {
  if (p.setup.kind !== 'endgame' || p.phase !== 'user') return;
  void analyse(fenAfter(p), 1, true);
  void tablebase(fenAfter(p));
}

/**
 * After the user's move in an endgame, its judge still out: the end where the game ends (mate, the
 * rules) or the goal looks reached (a promotion, a bare king, the draw held), else the defence
 * answers at once.
 */
function endgameAfterUser(g: number): void {
  const q = practice.peek();
  if (!q || q.gen !== g || q.phase === 'over') return;
  const e = q.setup.endgame!;
  const end = endOf(q, true);
  if (end) return conclude(g, end);
  const mv = q.moves.at(-1)!;
  const after = positionOf(mv.fen);
  const userMoves = q.moves.filter((m) => m.isUser).length;
  if (after && (wonAfter(e, after, mv.uci) || held(e, userMoves))) return conclude(g, 'goal');
  void opponentTurn(g);
}

/**
 * An endgame's end reached: it counts once the judges still out are in (a slip among them stops the
 * game there instead, to be taken back). A mate given is the goal whatever they say.
 */
function conclude(g: number, reason: EndReason): void {
  if (reason === 'mate') return finish(g, 'mate');
  if (!patch(g, () => ({ ending: reason }))) return;
  endgameJudged(g);
}

/**
 * An endgame's judges, as they come in: the first slip stops the game there (the board back on it,
 * the moves played after it waiting with it), counted as missed once; an end reached waits for the
 * last judge, then counts.
 */
function endgameJudged(g: number): void {
  const q = practice.peek();
  if (!q || q.gen !== g || q.phase === 'over' || q.slip) return;
  const e = q.setup.endgame!;
  const from = q.playedOn ?? 0;
  // A judge that gave nothing (Stockfish gone): nothing can be told, nothing counts.
  if (q.moves.some((m, i) => i >= from && m.isUser && !m.judging && m.afterCp === undefined && !m.tb)) return finish(g, 'interrupted');
  const at = firstSlip(e.goal, q.moves, from, lineOf(e));
  if (typeof at === 'number') return slipAt(g, at);
  if (at === 'pending' || !q.ending || q.moves.some((m) => m.isUser && m.judging)) return;
  // The goal reached, as its last move's judge has it: a promotion that loses the new queen, say, isn't.
  const last = q.moves.at(-1)!;
  if (q.ending === 'goal' && !goalKept(e.goal, last, lineOf(e))) {
    replace(g, (r) => {
      const { ending: _e, ...rest } = r;
      return rest;
    });
    return void opponentTurn(g);
  }
  finish(g, q.ending);
}

/** The game stopped on the user's move `i`, which threw the goal away. */
function slipAt(g: number, i: number): void {
  const q = practice.peek();
  if (!q || q.gen !== g) return;
  const e = q.setup.endgame!;
  const mv = q.moves[i]!;
  const keep = mv.bestMoveUci || undefined;
  const san = keep ? played(mv.fenBefore, keep)?.san : undefined;
  replace(g, (r) => {
    const { ending: _e, hint: _h, premove: _p, ...rest } = r;
    return { ...rest, slip: { at: i, ...(keep ? { uci: keep } : {}), ...(san ? { san } : {}) }, ...(r.missed ? {} : { missed: { fenBefore: mv.fenBefore, san: mv.san, ...(san ? { keep: san } : {}) } }) };
  });
  const drawn = mv.tb ? mv.tb.after === 'draw' : mv.afterCp! > -GOAL_CP.win;
  endgameMiss(g, e.goal === 'win' && drawn ? 'draw' : 'loss', i + 1);
}

/**
 * The endgame's try counted as missed, once: a `practice` event at its start with the preset
 * `endgame`, its score and moves as they stood after the first `upTo` moves (a slip's, though the
 * user may have played on past it before its judge came in).
 */
function endgameMiss(g: number, res: 'draw' | 'loss', upTo?: number): void {
  const p = practice.peek();
  if (!p || p.gen !== g || p.setup.kind !== 'endgame' || p.failed) return;
  patch(g, () => ({ failed: true }));
  tryEnded(p.setup.endgame!.id, 'missed');
  recordEndgame(p, res, upTo);
}

function recordEndgame(p: PracticeGame, res: 'win' | 'draw' | 'loss', upTo = p.moves.length): void {
  const key = keyFen(p.setup.fen)?.key;
  if (!key) return;
  const moves = p.moves.slice(0, upTo);
  const cp = [...moves].reverse().find((m) => m.isUser && m.afterCp !== undefined)?.afterCp;
  const white = cp === undefined ? undefined : p.setup.color === 'white' ? cp : -cp;
  // A solved try's grade from the thinking time (§5.178); a miss is Again, with no grade.
  const think = moves.filter((m) => m.isUser && m.ms !== undefined).map((m) => m.ms!);
  const solved = solvedBy(p.setup.endgame!.goal, res);
  const ms = think.reduce((a, x) => a + Math.min(x, GRADE_SECONDS.cap * 1000), 0);
  const g = solved ? gradeOfTime(think) : undefined;
  const now = new Date();
  if (g) patch(p.gen, () => ({ solveGrade: { auto: g, g, secs: meanSeconds(think), t: now.getTime() } }));
  void recordEvent({ t: now.toISOString(), k: 'practice', card: practiceCard(key), res, preset: ENDGAME_PRESET, ...(white !== undefined ? { cp: Math.round(white) } : {}), mv: moves.filter((m) => m.isUser).length, ...(g ? { g } : {}), ...(think.length ? { ms: Math.round(ms) } : {}) });
}

/** The user's own grade of the endgame try just solved (§5.178): a `grade` event at its start, when it changes. */
export function regradeEndgame(g: SolveGrade): void {
  const p = practice.peek();
  const sg = p?.solveGrade;
  const key = p && keyFen(p.setup.fen)?.key;
  if (!p || !sg || !key || sg.g === g) return;
  patch(p.gen, () => ({ solveGrade: { ...sg, g } }));
  void recordEvent({ t: new Date().toISOString(), k: 'grade', card: practiceCard(key), g });
}

/** An endgame's end: its result as the game's, recorded when the try hasn't been already. No history entry, no tactic scan. */
function finishEndgame(p: PracticeGame, reason: EndReason): void {
  const e = p.setup.endgame!;
  const result: 'win' | 'draw' | 'loss' = reason === 'goal' ? (e.goal === 'win' ? 'win' : 'draw') : reason === 'mate' ? 'win' : isDraw(reason) ? 'draw' : 'loss';
  const { slip: _s, ending: _e, ...rest } = p;
  practice.value = { ...rest, phase: 'over', end: { reason, result }, claim: false };
  const userMoves = p.moves.filter((m) => m.isUser).length;
  if (!p.failed && reason !== 'interrupted' && userMoves > 0) {
    recordEndgame(p, result);
    tryEnded(e.id, solvedBy(e.goal, result) ? 'solved' : 'missed');
  }
}

/**
 * After a slip, the game played on from where it had got to (the try is missed already): the moves
 * on the board are no longer looked at for a slip; an end reached meanwhile counts, else the
 * defence answers or the user moves.
 */
export function playOnAfterSlip(): void {
  const p = practice.peek();
  if (!p?.slip || p.phase === 'over') return;
  const g = p.gen;
  const next = replace(g, (q) => {
    const { slip: _s, ...rest } = q;
    return { ...rest, playedOn: q.moves.length };
  });
  if (!next) return;
  if (next.moves.at(-1)?.isUser) return endgameAfterUser(g);
  const end = endOf(next, false);
  if (end) return conclude(g, end);
  ponder(next);
}

/** After a slip, the move taken back and the one that kept the goal shown, as a hint's arrow. */
export function showSlipMove(): void {
  const p = practice.peek();
  const s = p?.slip;
  const fen = s && p.moves[s.at]?.fenBefore;
  if (!p || !s) return;
  takeBack();
  const q = practice.peek();
  if (q && fen && s.uci) patch(q.gen, () => ({ hint: { fen, level: 2, uci: s.uci! } }));
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

/* ------------------------------------------------------------------ tactics detected after the game */

export interface FoundTactic {
  t: DetectedTactic;
  state: 'new' | 'saved' | 'discarded';
}

/** The scan of the game just ended (mistake-lab's DETECTED TACTICS): its progress and what it found. */
export interface Detection {
  gen: number;
  total: number;
  done: number;
  scanning: boolean;
  found: FoundTactic[];
}

export const detection = signal<Detection | undefined>(undefined);

/** Stockfish's lines for the scan: mistake-lab's depth 20 (one less on a phone), five seconds a search at most. */
async function scanLines(fen: string, lines: number): Promise<Pv[] | null> {
  const pos = positionOf(fen);
  if (!pos) return null;
  const a = await analyseForStorm(fen, lines, narrow() ? TACTIC.scanDepth - 1 : TACTIC.scanDepth, 5000);
  if (!a) return null;
  return a.lines.filter((l) => l.pv.length).map((l) => ({ cp: moverScore(l.score, pos.turn), firstMove: l.pv[0]! }));
}

/** Maia's move for the opponent's side in the scan's human-like line, when Maia is on. */
async function scanMaia(fen: string, o: Opponent, before?: readonly string[]): Promise<string | null> {
  const policy = await maiaPolicy(fen, o.maiaElo, before);
  return (policy && maiaPick(policy, o.precision, Math.random)?.uci) ?? null;
}

async function scanTactics(g: number): Promise<void> {
  const p = practice.peek();
  if (!p || p.gen !== g) return;
  const moves = p.moves.map((m) => ({ uci: m.uci, isUser: m.isUser, fenBefore: m.fenBefore, ...(m.pvs ? { pvs: m.pvs } : {}), ...(m.afterCp !== undefined ? { afterCp: m.afterCp } : {}) }));
  const cands = tacticCandidates(moves, p.setup.color);
  detection.value = { gen: g, total: cands.length, done: 0, scanning: cands.length > 0, found: [] };
  const live = () => practice.peek()?.gen === g && detection.peek()?.gen === g;
  const skip = new Set<number>();
  const maia = maiaPrefs.peek().on ? (fen: string, before: readonly string[]) => scanMaia(fen, p.setup.opponent, before) : null;
  for (const cand of cands) {
    if (!live()) return;
    let t: DetectedTactic | null = null;
    if (!skip.has(cand.moveIdx)) t = await scanCandidate(scanLines, maia, cand, p.moves[cand.moveIdx]?.uci, () => !live(), positionsBefore(p, cand.moveIdx));
    if (!live()) return;
    if (t) for (const k of covered(t)) skip.add(k);
    const d = detection.peek()!;
    detection.value = { ...d, done: d.done + 1, found: t ? [...d.found, { t, state: 'new' }] : d.found };
  }
  if (live()) detection.value = { ...detection.peek()!, scanning: false };
}


/** A detected tactic's state: saved (its `saved` event written by the screen) or discarded. */
export function setFoundState(i: number, state: FoundTactic['state']): void {
  const d = detection.peek();
  if (!d?.found[i]) return;
  detection.value = { ...d, found: d.found.map((f, k) => (k === i ? { ...f, state } : f)) };
}
