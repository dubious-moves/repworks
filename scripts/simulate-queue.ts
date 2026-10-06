// The queue simulation (PLAN.md §5.5), as a library: days of training from all-new cards,
// through the real queue (§5.3), planner (§5.4), replay and FSRS (§4.8). `queue-sim.ts` runs it
// on a data-repo checkout; the unit test runs it on the public fixture.
// Each day has a morning session (the due cards, today's new lines, the known pool at its pace)
// and an evening one (the moves taught that morning, once their learning step has passed).
// Recall is drawn from FSRS's own retrievability at the moment of the review; the first answer
// after the learning step succeeds at `learnRate`, a known move's first answer at `knownRate`.
// The times are assumptions until real use measures them (§5.5).
import { formatEvent, type KnownEvent } from '../src/core/progress/events.ts';
import { DEFAULT_PARAMS, retrievability } from '../src/core/progress/fsrs.ts';
import { Replay, type DeviceEvent } from '../src/core/progress/replay.ts';
import type { CardId } from '../src/core/progress/cards.ts';
import type { RepertoireIndex } from '../src/core/repertoire/index.ts';
import { planSession } from '../src/core/train/plan.ts';
import { dueAt, knownCardsOf, statusOf, todaysQueue, type Day } from '../src/core/train/queue.ts';
import { DEFAULT_TRAIN, type TrainSettings } from '../src/core/train/settings.ts';

const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface SimSetting {
  newPerDay: number;
  retention: number;
  /** How often a known move's first answer is right. */
  knownRate: number;
  /** Known moves answered a day at most (Infinity: all that the pool offers). */
  knownPace: number;
}

export interface SimOptions {
  days?: number;
  seed?: number;
  /** How often the first answer after the learning step is right. */
  learnRate?: number;
  /** Seconds per asked move, per new move, and the auto-play pace in ms per move. */
  askSeconds?: number;
  newSeconds?: number;
  paceMs?: number;
  learnStepHours?: number;
}

export interface SimDay {
  day: number;
  /** Graded answers: due reviews, first reviews after the step, known moves' first answers. */
  asked: number;
  taught: number;
  /** Of `asked`, known moves answered for the first time. */
  knownFirst: number;
  /** Moves played for the user or as the opponent's. */
  auto: number;
  minutes: number;
}

export interface SimResult {
  setting: SimSetting;
  cards: number;
  lines: number;
  knownCards: number;
  /** The day the last card to teach was taught; undefined if some were left, or there were none. */
  allNewInDay?: number;
  /** The day the last known move had its first answer; undefined if some were left, or there were none. */
  allKnownInDay?: number;
  newLeft: number;
  knownLeft: number;
  days: SimDay[];
  /** Consistency: cards introduced (taught, or a known move first answered) more than once. */
  introducedTwice: number;
  /** Consistency: reviews made before the queue should have offered them. */
  early: number;
}

/** A small seeded random source (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(index: RepertoireIndex, setting: SimSetting, options: SimOptions = {}): SimResult {
  const days = options.days ?? 90;
  const random = seeded(options.seed ?? 1);
  const learnRate = options.learnRate ?? 0.9;
  const [askS, newS, paceMs] = [options.askSeconds ?? 8, options.newSeconds ?? 20, options.paceMs ?? 600];
  const train: TrainSettings = { ...DEFAULT_TRAIN, newPerDay: setting.newPerDay, retention: setting.retention, learnStepHours: options.learnStepHours ?? DEFAULT_TRAIN.learnStepHours };
  const replay = new Replay({ ...DEFAULT_PARAMS, retention: setting.retention });
  const known = knownCardsOf(index);
  const introduced = new Set<CardId>();
  let n = 0;
  let introducedTwice = 0;
  let early = 0;
  const t0 = Date.UTC(2026, 0, 1);
  const out: SimDay[] = [];
  const isNew = (c: CardId) => !known.has(c) && statusOf(replay.states.get(c)) === 'fresh';
  const isKnownFresh = (c: CardId) => known.has(c) && statusOf(replay.states.get(c)) === 'fresh';
  const left = (pick: (c: CardId) => boolean) => [...index.cards.keys()].filter(pick).length;
  const [hadNew, hadKnown] = [left(isNew) > 0, left(isKnownFresh) > 0];
  let allNewInDay: number | undefined;
  let allKnownInDay: number | undefined;

  for (let d = 0; d < days; d++) {
    const start = t0 + d * DAY;
    const stats: SimDay = { day: d + 1, asked: 0, taught: 0, knownFirst: 0, auto: 0, minutes: 0 };
    const session = (now: number, reviewsOnly: boolean) => {
      const day: Day = { start, end: start + DAY, now };
      const queue = todaysQueue(index, replay.states, train, day);
      const plan = planSession(index, queue, replay.states);
      const events: KnownEvent[] = [];
      let t = now;
      const stamp = () => new Date((t += 1000)).toISOString();
      let knownToday = 0;
      for (const line of plan.lines) {
        if (reviewsOnly && line.kind !== 'review') break;
        if (line.kind === 'known' && knownToday >= setting.knownPace) break;
        for (const card of line.teach) {
          if (introduced.has(card)) introducedTwice++;
          introduced.add(card);
          events.push({ v: 1, n: ++n, t: stamp(), k: 'taught', card });
          stats.taught++;
        }
        for (const card of line.ask) {
          const state = replay.states.get(card);
          const status = statusOf(state);
          let p: number;
          if (status === 'fresh') {
            if (introduced.has(card)) introducedTwice++;
            introduced.add(card);
            p = setting.knownRate;
            stats.knownFirst++;
            knownToday++;
          } else {
            const at = dueAt(state, train)!;
            if (status === 'learning' ? at > t : at >= day.end) early++;
            p = status === 'learning' ? learnRate : retrievability(Math.max(0, (t - state!.card.lastReview!) / DAY), state!.card.stability);
          }
          events.push({ v: 1, n: ++n, t: stamp(), k: 'review', card, g: random() < p ? 3 : 1 });
          stats.asked++;
        }
        stats.auto += line.end - line.ask.length - line.teach.length;
      }
      replay.add(events.map((e): DeviceEvent => ({ device: 'SimDev01', n: e.n, t: Date.parse(e.t), k: e.k, event: e, raw: formatEvent(e) })));
    };
    session(start + 8 * HOUR, false);
    session(start + 20 * HOUR, true);
    stats.minutes = (stats.asked * askS + stats.taught * newS + (stats.auto * paceMs) / 1000) / 60;
    out.push(stats);
    if (allNewInDay === undefined && hadNew && left(isNew) === 0) allNewInDay = out.findLastIndex((s) => s.taught > 0) + 1;
    if (allKnownInDay === undefined && hadKnown && left(isKnownFresh) === 0) allKnownInDay = out.findLastIndex((s) => s.knownFirst > 0) + 1;
  }
  const result: SimResult = {
    setting,
    cards: index.cards.size,
    lines: index.lines.length,
    knownCards: known.size,
    newLeft: left(isNew),
    knownLeft: left(isKnownFresh),
    days: out,
    introducedTwice,
    early,
  };
  if (allNewInDay !== undefined) result.allNewInDay = allNewInDay;
  if (allKnownInDay !== undefined) result.allKnownInDay = allKnownInDay;
  return result;
}
