// The game cards' session (PLAN.md §5.55), mistake-lab's mistake and tactic modes on the site's
// SRS. A mistake: the position before it, the user's move judged by Stockfish (the position's
// lines, searched as the card opens, then the position after the move when it isn't one of them),
// the grade recorded on the first try; a wrong move offers Try again, three at most, then the best
// move; the engine's line after a move (mistake-lab's ENGINE LINES, PLAN.md §6) opens at once after
// a wrong one and at a press after a right one, stepped, extended and branched on the board. A
// tactic: its lines played through, the opponent's replies after 0.4 s. An advantage: the practice
// game's drill from its peak (§5.57), graded by its outcome.
import { signal } from '@preact/signals';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import type { DeckCard } from '../core/games/deck.ts';
import { dropsOf, liveLines, lineFingerprint } from '../core/games/deck.ts';
import { addBranch, branch, buildEngineLine, endFen, extend, goTo, goToAlt, goToMain, step, type EngineLine } from '../core/games/engineLine.ts';
import type { MistakeItem } from '../core/games/extract.ts';
import { goodEnough, judgeMove, mistakeGrade, moverScore, tacticGrade, type Judged, type MoverLine } from '../core/games/grade.ts';
import { expected, nextLine, playReply, playUser, repliesDue, startTactic, type TacticRun } from '../core/games/tactic.ts';
import type { Grade } from '../core/progress/events.ts';
import { positionOf } from '../core/storm/walk.ts';
import { analyseForStorm, cancelStormEngine, endStormEngine, type EngineAnswer } from './stormEngine.ts';
import { recordEvent } from './state.ts';
import { gameQueueNow } from './games.ts';
import { leavePractice, loadOpponent, practice, startPractice } from './practice.ts';
import { trainData } from './train.ts';

export const MAX_TRIES = 3;
const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches;

export type TrainerPhase =
  /** The user's move is asked. */
  | 'asking'
  /** Stockfish is judging the move played. */
  | 'judging'
  /** Found (a mistake within 5 points, or a tactic's line done). */
  | 'right'
  /** Not found: Try again, or the best move. */
  | 'wrong'
  /** The opponent's reply is being played (a tactic). */
  | 'reply'
  /** Stockfish couldn't judge: nothing is graded. */
  | 'unjudged'
  | 'done';

export interface CardRun {
  card: DeckCard;
  /** The position the card asks from. */
  fen: string;
  /** The position on the board now (after a tried move, or a tactic's replies). */
  board: string;
  lastUci?: string;
  /** Moves tried and judged. */
  tries: number;
  hint: 0 | 1 | 2;
  graded?: Grade;
  judged?: Judged;
  /** The best move (standard UCI and SAN), and its line in SAN, once known. */
  bestUci?: string;
  bestSan?: string;
  bestLine?: string[];
  revealed: boolean;
  tactic?: TacticRun;
  tacticWrong: number;
  /** The last move judged, with the engine's line after it (UCI) and the score after it (White's view). */
  played?: { uci: string; cont: string[]; cpWhite: number | null };
  /** The engine's line shown on the board. */
  line?: EngineLine;
  /** A search for the line is running: a branch (`pendingFen` on the board) or an extension. */
  lineBusy?: boolean;
  pendingFen?: string;
}

export interface GameSession {
  cards: DeckCard[];
  index: number;
  phase: TrainerPhase;
  run?: CardRun;
  /** Grades recorded this session, by card. */
  results: Map<string, Grade>;
  message?: string;
}

export const gameSession = signal<GameSession | undefined>(undefined);

const set = (patch: Partial<GameSession>) => {
  const s = gameSession.value;
  if (s) gameSession.value = { ...s, ...patch };
};
const setRun = (patch: Partial<CardRun>, phase?: TrainerPhase) => {
  const s = gameSession.value;
  if (!s?.run) return;
  gameSession.value = { ...s, run: { ...s.run, ...patch }, ...(phase ? { phase } : {}) };
};

/* ------------------------------------------------------------------ the engine's view of a card */

const searches = new Map<string, Promise<EngineAnswer | null>>();
function analyse(fen: string, lines: number): Promise<EngineAnswer | null> {
  const key = `${fen}|${lines}`;
  let p = searches.get(key);
  if (!p) {
    p = analyseForStorm(fen, lines, narrow() ? 16 : 18, 8000);
    searches.set(key, p);
    if (searches.size > 50) searches.delete(searches.keys().next().value!);
  }
  return p;
}

function moverLines(fen: string, a: EngineAnswer | null): MoverLine[] {
  const pos = positionOf(fen);
  if (!a || !pos) return [];
  return a.lines.filter((l) => l.pv.length).map((l) => ({ move: l.pv[0]!, cp: moverScore(l.score, pos.turn) }));
}

function sanLine(fen: string, pv: readonly string[]): string[] {
  const pos = positionOf(fen);
  if (!pos) return [];
  const out: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    out.push(makeSanAndPlay(pos, move));
  }
  return out;
}

/** A White-relative score as centipawns, a mate as ±10,000. */
const whiteCp = (l: { score: { cp?: number; mate?: number } } | undefined): number | null => (l ? moverScore(l.score, 'white') : null);

function playOn(fen: string, uci: string): string | undefined {
  const pos = positionOf(fen);
  const move = parseUci(uci);
  if (!pos || !move || !pos.isLegal(move)) return undefined;
  pos.play(move);
  return makeFen(pos.toSetup());
}

/* ------------------------------------------------------------------ the session */

/** Today's game cards, due first. */
export function sessionCards(): DeckCard[] {
  const q = gameQueueNow();
  return [...q.due, ...q.fresh];
}

/** The history entry the session runs on (app/mode.ts). */
let sessionEntry: string | undefined;

export function startGameSession(entry?: string): void {
  sessionEntry = entry;
  gameSession.value = { cards: sessionCards(), index: -1, phase: 'done', results: new Map() };
  nextCard();
}

/**
 * The cards' screen opened on `entry`: the session left there for another page (Analyse, View the
 * game) goes on where it was (the owner's request, 2026-10-08); else a new one. A card whose
 * practice game didn't wait for it (another game started meanwhile) starts again.
 */
export function enterGameSession(entry: string): void {
  const s = gameSession.peek();
  if (!s || sessionEntry !== entry) {
    if (s) endGameSession();
    return startGameSession(entry);
  }
  const r = s.run;
  if (r && r.card.item.kind === 'advantage' && s.phase === 'asking' && practice.peek()?.setup.card !== r.card.card) {
    gameSession.value = { ...s, index: s.index - 1 };
    nextCard();
  }
}

export function endGameSession(): void {
  gameSession.value = undefined;
  if (practice.peek()?.setup.kind === 'advantage') leavePractice();
  cancelStormEngine();
  endStormEngine();
}

function nextCard(): void {
  const s = gameSession.value;
  if (!s) return;
  const index = s.index + 1;
  const card = s.cards[index];
  if (!card) {
    set({ index, phase: 'done' });
    delete gameSession.value!.run;
    return;
  }
  const item = card.item;
  if (practice.peek()?.setup.kind === 'advantage') leavePractice();
  const run: CardRun = { card, fen: item.fenBefore, board: item.fenBefore, tries: 0, hint: 0, revealed: false, tacticWrong: 0 };
  if (item.kind === 'advantage') {
    // The drill from the peak, silent (mistake-lab's advantage mode); the practice game records the grade.
    startPractice({
      kind: 'advantage',
      fen: item.fenBefore,
      color: item.color,
      silent: true,
      title: `from +${(item.peakCp / 100).toFixed(1)}`,
      opponent: loadOpponent(),
      card: card.card,
      peakCp: item.peakCp,
      onEnd: (g) => {
        const st = gameSession.value;
        if (!st?.run || st.run.card !== card) return;
        if (g) st.results.set(card.card, g);
        gameSession.value = { ...st, phase: 'right', run: { ...st.run, ...(g ? { graded: g } : {}) } };
      },
    });
  } else if (item.kind === 'plan') {
    // Recalled, then shown and graded by the owner (mistake-lab's plan card: no engine, no moves).
  } else if (item.kind === 'tactic') {
    const drops = dropsOf(trainData.value?.eventsOf(card.card) ?? []);
    run.tactic = startTactic(liveLines(item, drops));
  } else {
    // The position's lines, searched while the user thinks (mistake-lab's pre-analysis).
    void analyse(item.fenBefore, 3).then((a) => {
      const best = a?.lines[0];
      const r = gameSession.value?.run;
      if (best?.pv[0] && r && r.card === card) setRun({ bestUci: best.pv[0], bestSan: sanLine(item.fenBefore, best.pv)[0] ?? best.pv[0], bestLine: sanLine(item.fenBefore, best.pv) });
    });
  }
  gameSession.value = { ...s, index, phase: 'asking', run };
}

function record(card: string, g: Grade): void {
  const s = gameSession.value;
  if (!s) return;
  if (s.results.has(card)) return;
  s.results.set(card, g);
  void recordEvent({ t: new Date().toISOString(), k: 'review', card, g });
}

/** The user's move on the board, standard UCI. */
export function playMove(uci: string): void {
  const s = gameSession.value;
  const r = s?.run;
  if (!s || !r || s.phase !== 'asking') return;
  if (r.card.item.kind === 'tactic') return void tacticMove(uci);
  if (r.card.item.kind === 'mistake') void mistakeMove(r.card.item, uci);
}

async function mistakeMove(item: MistakeItem, uci: string): Promise<void> {
  const r = gameSession.value!.run!;
  const after = playOn(r.fen, uci);
  if (!after) return;
  setRun({ board: after, lastUci: uci }, 'judging');
  const answer = await analyse(r.fen, 3);
  const lines = moverLines(r.fen, answer);
  let afterCp: number | undefined;
  // The engine's line after the move: its own line when the move is one of the position's, else the search after it.
  const matched = answer?.lines.find((l) => l.pv[0] === uci);
  let played: CardRun['played'] = { uci, cont: matched ? matched.pv.slice(1) : [], cpWhite: whiteCp(matched) };
  if (!lines.some((l) => l.move === uci)) {
    const pos = positionOf(after);
    if (pos?.isEnd()) afterCp = pos.isCheckmate() ? 10000 : 0;
    else {
      const a = await analyse(after, 1);
      const m = moverLines(after, a)[0];
      if (m) afterCp = -m.cp;
      played = { uci, cont: a?.lines[0]?.pv ?? [], cpWhite: whiteCp(a?.lines[0]) };
    }
  }
  const s = gameSession.value;
  if (!s?.run || s.run.card.item !== item) return;
  const judged = judgeMove(lines, uci, afterCp);
  if (!judged) return void setRun({}, 'unjudged');
  const tries = s.run.tries + 1;
  const ok = goodEnough(judged.wpDrop, judged.exactBest);
  const first = tries === 1;
  // The first try decides the grade (mistake-lab locks it): a later right answer changes nothing.
  if (first) record(s.run.card.card, mistakeGrade({ wpDrop: judged.wpDrop, exactBest: judged.exactBest, hint: s.run.hint > 0 }));
  const best = lines[0]?.move;
  const patch: Partial<CardRun> = { tries, judged, played };
  if (best && !s.run.bestSan) {
    patch.bestUci = best;
    patch.bestSan = sanLine(r.fen, [best])[0] ?? best;
  }
  if (!ok && tries >= MAX_TRIES) {
    // The best move shown on the card's position (mistake-lab's revealBestMove owns the board then).
    patch.revealed = true;
    patch.board = r.fen;
  } else if (!ok) {
    // The refutation, opened at the opponent's reply; stepping back before the move is Try again.
    const line = buildEngineLine(r.fen, uci, played.cont, played.cpWhite, { wrongMove: true });
    if (line) patch.line = line;
  }
  setRun(patch, ok ? 'right' : 'wrong');
  if (patch.line) prepareExtension(patch.line);
}

function tacticMove(uci: string): void {
  const s = gameSession.value!;
  const r = s.run!;
  const t = r.tactic!;
  const answer = playUser(t, uci);
  if (!answer.ok) {
    const after = playOn(r.board, uci);
    if (r.tacticWrong === 0) record(r.card.card, 1);
    const tries = r.tries + 1;
    setRun({ board: after ?? r.board, lastUci: uci, tacticWrong: r.tacticWrong + 1, tries }, 'wrong');
    // The refutation, as after a mistake's wrong move (mistake-lab's tactic engine line).
    if (after)
      void analyse(after, 1).then((a) => {
        const now = gameSession.value;
        if (now?.phase !== 'wrong' || now.run?.card !== r.card || now.run.tries !== tries || now.run.line) return;
        const best = a?.lines[0];
        const line = buildEngineLine(r.board, uci, best?.pv ?? [], whiteCp(best), { wrongMove: true });
        if (line) {
          setRun({ line });
          prepareExtension(line);
        }
      });
    return;
  }
  const board = playOn(r.board, uci)!;
  setRun({ tactic: answer.run, board, lastUci: uci });
  if (answer.lineDone) return void lineDone(answer.run);
  playReplies(answer.run, board);
}

function playReplies(t: TacticRun, board: string): void {
  const due = repliesDue(t);
  if (!due.length) return void setRun({}, 'asking');
  setRun({}, 'reply');
  let run = t;
  let fen = board;
  const step = (i: number) => {
    const s = gameSession.value;
    if (!s?.run || s.run.tactic?.lines !== t.lines) return;
    const uci = due[i]!;
    fen = playOn(fen, uci) ?? fen;
    run = playReply(run, uci);
    setRun({ tactic: run, board: fen, lastUci: uci });
    if (i + 1 < due.length) setTimeout(() => step(i + 1), 400);
    else if (run.played.length >= run.lines[run.active]!.length) lineDone(run);
    else setRun({}, 'asking');
  };
  setTimeout(() => step(0), 400);
}

function lineDone(t: TacticRun): void {
  const next = nextLine(t);
  const r = gameSession.value!.run!;
  if (!next) {
    record(r.card.card, tacticGrade({ wrong: r.tacticWrong, hint: r.hint > 0 }));
    return void setRun({}, 'right');
  }
  // The next line from where it differs: its start played for the user.
  let fen = r.fen;
  for (const uci of next.prefix) fen = playOn(fen, uci) ?? fen;
  setTimeout(() => {
    setRun({ tactic: next.run, board: fen, lastUci: next.prefix[next.prefix.length - 1] }, 'asking');
    set({ message: 'Another line: the opponent answers differently.' });
  }, 600);
}

/** Back to the card's position (a mistake), or to before the wrong move (a tactic). */
export function tryAgain(): void {
  const s = gameSession.value;
  const r = s?.run;
  if (!s || !r || s.phase !== 'wrong' || r.revealed) return;
  if (r.tactic) {
    let fen = r.fen;
    for (const uci of r.tactic.played) fen = playOn(fen, uci) ?? fen;
    const last = r.tactic.played[r.tactic.played.length - 1];
    const { line: _line, lineBusy: _busy, pendingFen: _pending, lastUci: _tried, ...kept } = r;
    gameSession.value = { ...s, phase: 'asking', run: { ...kept, board: fen, ...(last ? { lastUci: last } : {}) } };
    return;
  }
  const { lastUci: _tried, line: _line, lineBusy: _busy, pendingFen: _pending, ...rest } = r;
  gameSession.value = { ...s, phase: 'asking', run: { ...rest, board: r.fen } };
}

/** The best move (a mistake) or the expected move (a tactic) on the board. */
export function revealBest(): void {
  const r = gameSession.value?.run;
  if (!r) return;
  if (!r.graded && r.tries === 0 && !gameSession.value!.results.has(r.card.card)) record(r.card.card, 1);
  // The arrow is drawn on the card's position, not on the board after a wrong move or a line.
  const s = gameSession.value!;
  const { line: _line, lineBusy: _busy, pendingFen: _pending, lastUci: _last, ...rest } = r;
  gameSession.value = { ...s, run: { ...rest, revealed: true, ...(r.tactic ? { board: r.board, ...(r.lastUci ? { lastUci: r.lastUci } : {}) } : { board: r.fen }) } };
}

/** The hint: first the piece, then the move. A hint makes the grade Again (Hard for a tactic). */
export function hint(): void {
  const r = gameSession.value?.run;
  if (!r || r.hint >= 2) return;
  setRun({ hint: (r.hint + 1) as 1 | 2 });
}

/** The move the hint and the reveal point at, standard UCI. */
export function hintMove(r: CardRun): string | undefined {
  if (r.tactic) return expected(r.tactic)?.uci;
  return r.bestUci;
}

export function skipCard(): void {
  const r = gameSession.value?.run;
  // Skipped unanswered is Again (mistake-lab's Skip).
  if (r && !gameSession.value!.results.has(r.card.card)) record(r.card.card, 1);
  nextCard();
}

export function continueSession(): void {
  nextCard();
}

/** A plan card's back: the notes shown, then the owner's own grade (§5.61). */
export function showPlan(): void {
  const r = gameSession.value?.run;
  if (r?.card.item.kind === 'plan') setRun({ revealed: true });
}

export function gradePlan(g: Grade): void {
  const r = gameSession.value?.run;
  if (r?.card.item.kind !== 'plan' || !r.revealed) return;
  record(r.card.card, g);
  nextCard();
}

/** Takes the item out of the deck (`drop`), on every device after a sync. */
export function dropCard(): void {
  const r = gameSession.value?.run;
  if (!r) return;
  void recordEvent({ t: new Date().toISOString(), k: 'drop', card: r.card.card, on: true });
  nextCard();
}

/** Takes one of a tactic's lines out (`drop` with the line). */
export function dropLine(): void {
  const r = gameSession.value?.run;
  if (!r?.tactic) return;
  const line = r.tactic.lines[r.tactic.active]!;
  void recordEvent({ t: new Date().toISOString(), k: 'drop', card: r.card.card, on: true, line: lineFingerprint(line) });
  nextCard();
}


/* ------------------------------------------------------------------ the engine's line */

/** The line after the move found (mistake-lab's "Show engine line" after a good move). */
export function showLine(): void {
  const s = gameSession.value;
  const r = s?.run;
  if (!s || !r?.played || r.line || s.phase !== 'right') return;
  const line = buildEngineLine(r.fen, r.played.uci, r.played.cont, r.played.cpWhite);
  if (!line) return;
  setRun({ line });
  prepareExtension(line);
}

/** The line put away: the board as it was. */
export function closeLine(): void {
  const r = gameSession.value?.run;
  if (!r?.line) return;
  if (gameSession.value!.phase === 'wrong') return tryAgain();
  const s = gameSession.value!;
  const { line: _line, lineBusy: _busy, pendingFen: _pending, ...rest } = r;
  gameSession.value = { ...s, run: rest };
}

const lineOf = (): { r: CardRun; line: EngineLine } | undefined => {
  const r = gameSession.value?.run;
  return r?.line ? { r, line: r.line } : undefined;
};
const setLine = (line: EngineLine, extra: Partial<CardRun> = {}) => {
  const r = gameSession.value?.run;
  if (!r?.line) return;
  const { pendingFen: _pending, ...rest } = r;
  const s = gameSession.value!;
  gameSession.value = { ...s, run: { ...rest, line, ...extra } };
};

/** The search at the line's end, started ahead of a step past it (mistake-lab's prepareEngineLineExtension). */
function prepareExtension(line: EngineLine): void {
  const end = endFen(line);
  if (end) void analyse(end, 1);
}

/** ← or →: past the end the line is extended by a search; back before a wrong move is Try again. */
export function lineStep(delta: number): void {
  const at = lineOf();
  if (!at) return;
  const st = step(at.line, delta);
  if (st.kind === 'go') return setLine(st.line);
  if (st.kind === 'retry') return tryAgain();
  if (st.kind !== 'extend' || at.r.lineBusy) return;
  const end = endFen(at.line);
  if (!end) return;
  const card = at.r.card;
  setLine(at.line, { lineBusy: true });
  void analyse(end, 1).then((a) => {
    const now = lineOf();
    if (!now || now.r.card !== card) return;
    const best = a?.lines[0];
    const line = best ? extend(now.line, end, best.pv, whiteCp(best)) : now.line;
    setLine(line, { lineBusy: false });
    if (line !== now.line) prepareExtension(line);
  });
}

export function lineToMain(idx: number): void {
  const at = lineOf();
  if (at) setLine(goToMain(at.line, idx));
}

export function lineToAlt(alt: number, idx: number): void {
  const at = lineOf();
  if (at) setLine(goToAlt(at.line, alt, idx));
}

/** A move on the board while the line is shown: along the line, or a new branch searched by Stockfish. */
export function lineMove(uci: string): void {
  const at = lineOf();
  if (!at || at.r.lineBusy) return;
  const b = branch(at.line, uci);
  if (b.kind === 'illegal') return;
  const card = at.r.card;
  if (b.kind === 'follow') {
    setLine(b.line);
    const reply = b.reply;
    if (reply !== undefined)
      setTimeout(() => {
        const now = lineOf();
        if (now && now.r.card === card && now.line.currentIdx === b.line.currentIdx && now.line.activeAlt === b.line.activeAlt) setLine(goTo(now.line, reply));
      }, 400);
    return;
  }
  setLine(at.line, { lineBusy: true, pendingFen: b.fen });
  void analyse(b.fen, 1).then((a) => {
    const now = lineOf();
    if (!now || now.r.card !== card) return;
    const best = a?.lines[0];
    const line = addBranch(now.line, b, best?.pv ?? [], whiteCp(best));
    setLine(line, { lineBusy: false });
    prepareExtension(line);
  });
}
