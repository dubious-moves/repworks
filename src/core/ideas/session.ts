// An idea cards' session (PLAN.md §5.128): today's due cards, then the new ones. Read, a new card
// is shown first (its explanation and line), then asked, as Learn shows a move before asking it;
// Train, every card is asked at once. A card is answered by a move, graded by itself (right the first time Good, wrong Again, recorded
// at the first answer), or by Show and the owner's own grade, which is how a card is answered
// whose side isn't to move or which has no move. A card graded Again comes back at the session's
// end, ungraded: asked until a move answers it, or shown once when it is self-graded. Train
// again goes through every card, due or not; one not due is practice, nothing recorded. Pure: the
// app records what a step returns.
import type { CardId } from '../progress/cards.ts';
import type { Grade } from '../progress/events.ts';
import { moveGrade, type Idea, type IdeaAnswer } from './cards.ts';

export interface IdeaStep {
  idea: Idea;
  /** Never reviewed: shown before it is asked. */
  isNew: boolean;
  /** Asked again after an Again this session: not graded. */
  retry: boolean;
  /** Not due: asked and graded, but nothing recorded (Train again's pass over every card). */
  practice?: true;
}

export type IdeaPhase =
  /** A new card shown: the explanation and the line, before it is asked. */
  | 'learn'
  /** The question: a move, or Show. */
  | 'asking'
  /** The answer: the explanation and the line, and the grade when the owner gives it. */
  | 'back';

export interface IdeaRun {
  step: IdeaStep;
  phase: IdeaPhase;
  /** When the question was put (ms). */
  askedAt: number;
  /** The moves tried that weren't an answer, in order (SAN and standard UCI). */
  wrong: { san: string; uci: string }[];
  /** The last move tried, and what it was. */
  answer?: IdeaAnswer;
  /** Show was pressed. */
  shown: boolean;
  /** The grade recorded for the card this time (none on a retry). */
  graded?: Grade;
}

/** Read: a new card shown before it is asked. Train: every card asked at once. */
export type IdeaMode = 'read' | 'train';

export interface IdeaSession {
  mode: IdeaMode;
  steps: IdeaStep[];
  index: number;
  run?: IdeaRun;
  /** Each card's grade this session (its first, as recorded). */
  results: Map<CardId, Grade>;
}

/** A review to record. */
export interface IdeaReview {
  card: CardId;
  g: Grade;
  ms: number;
  /** The wrong moves tried first, standard UCI. */
  w?: string[];
}

const shownFirst = (step: IdeaStep, mode: IdeaMode) => mode === 'read' && step.isNew && !step.retry;
const runOf = (step: IdeaStep, mode: IdeaMode, now: number): IdeaRun => ({ step, phase: shownFirst(step, mode) ? 'learn' : 'asking', askedAt: now, wrong: [], shown: false });

export function startIdeas(queue: { due: readonly Idea[]; fresh: readonly Idea[] }, now: number, mode: IdeaMode = 'read'): IdeaSession {
  const steps = [...queue.due.map((idea) => ({ idea, isNew: false, retry: false })), ...queue.fresh.map((idea) => ({ idea, isNew: true, retry: false }))];
  return { mode, steps, index: 0, ...(steps[0] ? { run: runOf(steps[0], mode, now) } : {}), results: new Map() };
}

/**
 * Every card of the deck in its order, due or not (Train again): the ones in today's queue are
 * recorded as ever, the rest are practice.
 */
export function practiseIdeas(deck: readonly Idea[], queue: { due: readonly Idea[]; fresh: readonly Idea[] }, reviewed: (card: CardId) => boolean, now: number, mode: IdeaMode = 'read'): IdeaSession {
  const today = new Set([...queue.due, ...queue.fresh].map((i) => i.card));
  const steps: IdeaStep[] = deck.map((idea) => ({ idea, isNew: !reviewed(idea.card), retry: false, ...(today.has(idea.card) ? {} : { practice: true as const }) }));
  return { mode, steps, index: 0, ...(steps[0] ? { run: runOf(steps[0], mode, now) } : {}), results: new Map() };
}

/**
 * Read or Train from now on. The card in front changes too while nothing has been answered on it:
 * a new card shown is asked at once (Train), a new card asked untouched is shown first (Read).
 */
export function setIdeaMode(s: IdeaSession, mode: IdeaMode, now: number): IdeaSession {
  if (s.mode === mode) return s;
  const run = s.run;
  if (run?.phase === 'learn' && mode === 'train') return { ...s, mode, run: { ...run, phase: 'asking', askedAt: now } };
  if (run?.phase === 'asking' && shownFirst(run.step, mode) && !run.wrong.length && run.graded === undefined) return { ...s, mode, run: { ...run, phase: 'learn' } };
  return { ...s, mode };
}

/** A new card shown: now asked. */
export function askIdea(s: IdeaSession, now: number): IdeaSession {
  return s.run?.phase === 'learn' ? { ...s, run: { ...s.run, phase: 'asking', askedAt: now } } : s;
}

const withGrade = (s: IdeaSession, run: IdeaRun, g: Grade, now: number): { session: IdeaSession; review?: IdeaReview } => {
  const card = run.step.idea.card;
  const results = new Map(s.results);
  if (!results.has(card)) results.set(card, g);
  const session = { ...s, run: { ...run, graded: g }, results };
  if (run.step.practice) return { session };
  return { session, review: { card, g, ms: Math.max(0, now - run.askedAt), ...(run.wrong.length ? { w: run.wrong.map((m) => m.uci) } : {}) } };
};

/**
 * A move played on the card's position. Right: the answer is shown, graded Good when it was the
 * first try (and not after Show). Wrong: graded Again at once (so leaving doesn't lose it), and
 * asked again, with the side line's comment when it was one of the card's moves.
 */
export function playIdea(s: IdeaSession, answer: IdeaAnswer, uci: string, now: number): { session: IdeaSession; review?: IdeaReview } {
  const run = s.run;
  if (!run || run.phase !== 'asking' || run.step.idea.selfGraded) return { session: s };
  const right = answer.kind === 'right';
  const next: IdeaRun = { ...run, answer, ...(right ? { phase: 'back' as const } : { wrong: [...run.wrong, { san: answer.san, uci }] }) };
  if (run.graded !== undefined || run.step.retry) return { session: { ...s, run: next } };
  return withGrade(s, next, moveGrade(right && run.wrong.length === 0), now);
}

/** Show: the answer, then the owner's grade unless a wrong move has graded the card already. */
export function showIdea(s: IdeaSession): IdeaSession {
  return s.run?.phase === 'asking' ? { ...s, run: { ...s.run, phase: 'back', shown: true } } : s;
}

/** Whether the run waits for the owner's grade. */
export const needsGrade = (run: IdeaRun | undefined) => !!run && run.phase === 'back' && run.graded === undefined && !run.step.retry;

/** The owner's own grade (after Show, or on a self-graded card), then the next card. */
export function gradeIdea(s: IdeaSession, g: Grade, now: number): { session: IdeaSession; review?: IdeaReview } {
  const run = s.run;
  if (!needsGrade(run)) return { session: s };
  const graded = withGrade(s, run!, g, now);
  return { session: nextIdea(graded.session, now), review: graded.review };
}

/** The next card. A card graded Again, or a retry missed again by a move, comes back at the end. */
export function nextIdea(s: IdeaSession, now: number): IdeaSession {
  const run = s.run;
  if (!run || needsGrade(run)) return s;
  const steps = [...s.steps];
  const missed = run.step.retry ? !run.step.idea.selfGraded && (run.wrong.length > 0 || run.shown) : run.graded === 1;
  if (missed) steps.push({ idea: run.step.idea, isNew: false, retry: true, ...(run.step.practice ? { practice: true as const } : {}) });
  const index = s.index + 1;
  const step = steps[index];
  return { mode: s.mode, steps, index, results: s.results, ...(step ? { run: runOf(step, s.mode, now) } : {}) };
}

/** Leaves the card ungraded; removed, its retries go too. */
export function leaveIdea(s: IdeaSession, now: number, removed = false): IdeaSession {
  const run = s.run;
  if (!run) return s;
  const card = run.step.idea.card;
  const steps = removed ? s.steps.filter((st, i) => i <= s.index || st.idea.card !== card) : s.steps;
  const index = s.index + 1;
  const step = steps[index];
  return { mode: s.mode, steps, index, results: s.results, ...(step ? { run: runOf(step, s.mode, now) } : {}) };
}
