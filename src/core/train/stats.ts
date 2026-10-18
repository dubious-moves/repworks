// Progress (PLAN.md §5.122): what the log says about the training, for the progress page.
// - Recall: each repertoire answer with the recall FSRS predicted for it (its retrievability at
//   that moment, from the card's state before), so the share answered right can be set against
//   what the scheduler expected, early reviews (§5.106) included. A move's first answer, after
//   teaching or in a known chapter, has no prediction and is counted apart.
// - Moves: how many are not started, in learning, young, and mature (stability of 21 days or
//   more, Anki's line for a mature card).
// - Chapters: each one's predicted recall now (the mean over its reviewed moves) and its answers
//   in the window, the weakest first.
// - Missed: the moves answered wrong twice or more in the window.
// - Workload: the reviews due on each of the coming days, the moves known now answered right each
//   time (new moves left out); and the minutes trained on each past day, from the gaps between
//   answers (a gap of more than five minutes is a break).
// Core has no clock or calendar: the app passes in now, the window's start and the days.
import type { CardId } from '../progress/cards.ts';
import { DEFAULT_PARAMS, newCard, retrievability, review, type FsrsCard, type FsrsParams } from '../progress/fsrs.ts';
import type { CardState, DeviceEvent } from '../progress/replay.ts';
import type { RepertoireIndex } from '../repertoire/index.ts';
import { heldCards } from './paused.ts';
import { dueAt, recallAt, statusOf } from './queue.ts';
import type { TrainSettings } from './settings.ts';

const DAY_MS = 86_400_000;
/** A gap between answers longer than this is a break, not training. */
export const BREAK_MS = 5 * 60_000;
/** Stability, in days, from which a move counts as mature. */
export const MATURE_DAYS = 21;

export interface Answer {
  t: number;
  right: boolean;
  /** The move's first answer: nothing predicted it. */
  first: boolean;
  /** FSRS's predicted recall at the answer (0–1); undefined for a first answer. */
  predicted?: number;
  /** The wrong moves tried, in UCI. */
  wrong: readonly string[];
}

/** A card's answers, folded as the replay folds a repertoire card (review and forget). */
export function answersOf(events: readonly DeviceEvent[], params: FsrsParams = DEFAULT_PARAMS): Answer[] {
  const out: Answer[] = [];
  let card: FsrsCard = newCard();
  for (const { event, t } of events) {
    if (event?.k === 'forget') card = newCard();
    if (event?.k !== 'review') continue;
    const answer: Answer = {
      t,
      right: event.g > 1,
      first: card.state === 0 || card.lastReview === undefined,
      wrong: event.w ?? [],
    };
    if (!answer.first) answer.predicted = retrievability(Math.max(0, (t - card.lastReview!) / DAY_MS), card.stability);
    out.push(answer);
    card = review(card, event.g, t, params);
  }
  return out;
}

export interface Tally {
  answers: number;
  right: number;
  /** The sum of the predicted recalls: the answers right FSRS expected. */
  expected: number;
}

export interface Band extends Tally {
  /** Predicted recall from (inclusive) and to (exclusive), 0–1. */
  from: number;
  to: number;
}

export interface Moves {
  total: number;
  fresh: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
  /** On paused lines only (§5.70). */
  paused: number;
}

export interface ChapterProgress {
  sid: string;
  cid: string;
  moves: number;
  /** Taught or reviewed. */
  started: number;
  /** The mean predicted recall now of its reviewed moves; undefined when none is. */
  recall?: number;
  /** Answers in the window, first answers included. */
  answers: number;
  right: number;
}

export interface Missed {
  card: CardId;
  misses: number;
  answers: number;
  /** The latest miss. */
  last: number;
  /** The moves tried at the latest miss, in UCI. */
  wrong: readonly string[];
}

export interface Span {
  start: number;
  end: number;
}

export interface DayWork extends Span {
  minutes: number;
  answers: number;
  taught: number;
}

export interface ProgressStats {
  moves: Moves;
  /** Answers since the window's start, but first answers. */
  recent: Tally;
  /** Every answer but first answers. */
  all: Tally;
  /** First answers since the window's start. */
  firsts: { answers: number; right: number };
  /** Every answer but first answers, by predicted recall. */
  bands: Band[];
  /** Started chapters, the lowest recall first, then those not started, in the index's order. */
  chapters: ChapterProgress[];
  /** Moves missed twice or more since the window's start: the most misses first. */
  missed: Missed[];
  /** Reviews due on each day ahead; the first day takes the overdue ones too. */
  forecast: (Span & { due: number })[];
  days: DayWork[];
}

export interface ProgressOptions {
  now: number;
  /** The window's start (the app's: 30 days back). */
  since: number;
  /** The days ahead, today first, for the forecast. */
  ahead: readonly Span[];
  /** The days past, today last, for the minutes. */
  past: readonly Span[];
  params?: FsrsParams;
}

const BANDS: readonly [number, number][] = [
  [0, 0.7],
  [0.7, 0.85],
  [0.85, 0.95],
  [0.95, 1.01],
];

const tally = (): Tally => ({ answers: 0, right: 0, expected: 0 });
function count(t: Tally, a: Answer): void {
  t.answers++;
  if (a.right) t.right++;
  t.expected += a.predicted ?? 0;
}
const spanOf = (spans: readonly Span[], t: number) => spans.findIndex((s) => t >= s.start && t < s.end);

export function progressStats(
  index: RepertoireIndex,
  states: ReadonlyMap<string, CardState>,
  eventsOf: (card: string) => readonly DeviceEvent[],
  settings: TrainSettings,
  options: ProgressOptions,
): ProgressStats {
  const { now, since, ahead, past } = options;
  const params = options.params ?? {
    ...DEFAULT_PARAMS,
    retention: settings.retention,
  };
  const held = heldCards(index);

  const moves: Moves = {
    total: 0,
    fresh: 0,
    learning: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    paused: 0,
  };
  const recent = tally();
  const all = tally();
  const firsts = { answers: 0, right: 0 };
  const bands: Band[] = BANDS.map(([from, to]) => ({ from, to, ...tally() }));
  const missed: Missed[] = [];
  const answersByCard = new Map<CardId, Answer[]>();
  const recallNow = new Map<CardId, number>();
  const times: { t: number; taught: boolean }[] = [];

  for (const card of index.cards.keys()) {
    const state = states.get(card);
    moves.total++;
    const status = statusOf(state);
    if (state?.suspended) moves.suspended++;
    else if (held.has(card)) moves.paused++;
    else if (status === 'fresh') moves.fresh++;
    else if (status === 'learning') moves.learning++;
    else if (state!.card.stability >= MATURE_DAYS) moves.mature++;
    else moves.young++;
    if (status === 'review' && !state!.suspended) recallNow.set(card, recallAt(state!, now));

    const events = eventsOf(card);
    for (const { event, t } of events) if (event?.k === 'review' || event?.k === 'taught') times.push({ t, taught: event.k === 'taught' });
    const answers = answersOf(events, params);
    if (answers.length === 0) continue;
    answersByCard.set(card, answers);
    let misses = 0;
    let inWindow = 0;
    let lastMiss: Answer | undefined;
    for (const a of answers) {
      const recentOne = a.t >= since && a.t <= now;
      if (a.first) {
        if (recentOne) {
          firsts.answers++;
          if (a.right) firsts.right++;
        }
      } else {
        count(all, a);
        if (recentOne) count(recent, a);
        const band = bands.find((b) => a.predicted! >= b.from && a.predicted! < b.to);
        if (band) count(band, a);
      }
      if (!recentOne) continue;
      inWindow++;
      if (!a.right) {
        misses++;
        lastMiss = a;
      }
    }
    if (misses >= 2)
      missed.push({
        card,
        misses,
        answers: inWindow,
        last: lastMiss!.t,
        wrong: lastMiss!.wrong,
      });
  }
  missed.sort((a, b) => b.misses - a.misses || b.misses / b.answers - a.misses / a.answers || b.last - a.last);

  // Chapters: their cards from their lines, each once.
  const byChapter = new Map<string, { sid: string; cid: string; cards: Set<CardId> }>();
  for (const line of index.lines) {
    const key = `${line.sid}/${line.cid}`;
    let c = byChapter.get(key);
    if (!c) byChapter.set(key, (c = { sid: line.sid, cid: line.cid, cards: new Set() }));
    for (const card of line.cards) c.cards.add(card);
  }
  const chapters: ChapterProgress[] = [];
  for (const { sid, cid, cards } of byChapter.values()) {
    const ch: ChapterProgress = {
      sid,
      cid,
      moves: cards.size,
      started: 0,
      answers: 0,
      right: 0,
    };
    let sum = 0;
    let reviewed = 0;
    for (const card of cards) {
      if (statusOf(states.get(card)) !== 'fresh') ch.started++;
      const r = recallNow.get(card);
      if (r !== undefined) {
        sum += r;
        reviewed++;
      }
      for (const a of answersByCard.get(card) ?? []) {
        if (a.t < since || a.t > now) continue;
        ch.answers++;
        if (a.right) ch.right++;
      }
    }
    if (reviewed > 0) ch.recall = sum / reviewed;
    chapters.push(ch);
  }
  const order = new Map(chapters.map((c, i) => [c, i]));
  chapters.sort((a, b) => (a.recall === undefined ? 1 : 0) - (b.recall === undefined ? 1 : 0) || (a.recall ?? 0) - (b.recall ?? 0) || order.get(a)! - order.get(b)!);

  // The forecast: each move due in the days ahead, answered right on its day, and again when it
  // comes back within them.
  const forecast = ahead.map((s) => ({ start: s.start, end: s.end, due: 0 }));
  const last = ahead.length ? ahead[ahead.length - 1]!.end : now;
  for (const card of index.cards.keys()) {
    const state = states.get(card);
    if (!state || state.suspended || held.has(card)) continue;
    let at = dueAt(state, settings);
    let c = state.card;
    while (at !== undefined && at < last) {
      const i = Math.max(
        0,
        forecast.findIndex((d) => at! < d.end),
      );
      forecast[i]!.due++;
      const t = Math.max(at, forecast[i]!.start, now);
      c = review(c, 3, t, params);
      at = c.due;
    }
  }

  // The minutes: the gaps between answers (and moves taught) under a break, on the later one's day.
  times.sort((a, b) => a.t - b.t);
  const days: DayWork[] = past.map((s) => ({
    start: s.start,
    end: s.end,
    minutes: 0,
    answers: 0,
    taught: 0,
  }));
  times.forEach(({ t, taught }, i) => {
    const d = days[spanOf(days, t)];
    if (!d) return;
    if (taught) d.taught++;
    else d.answers++;
    const gap = i > 0 ? t - times[i - 1]!.t : Infinity;
    if (gap <= BREAK_MS) d.minutes += gap / 60_000;
  });

  return {
    moves,
    recent,
    all,
    firsts,
    bands,
    chapters,
    missed,
    forecast,
    days,
  };
}
