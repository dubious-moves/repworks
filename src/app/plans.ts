// Plan cards (PLAN.md §5.61): the enrolments from the `plan` events, their content read from every
// study's comments at the position (read again whenever the working view changes), and the cards
// for the game cards' deck. Enrolled and removed from a chapter's move menu.
import { computed, effect, signal } from '@preact/signals';
import type { PositionKey } from '../core/chess/positionKey.ts';
import { planDeck, planEnrolments, planNotes, type PlanNote } from '../core/games/plans.ts';
import { planCard } from '../core/progress/cards.ts';
import { readStudies } from './coverage.ts';
import { recordEvent } from './state.ts';
import { dataVersion } from './sync.ts';
import { trainData } from './train.ts';

/** The positions enrolled, with the side each board is turned to. */
export const planEnrolled = computed(() => {
  const data = trainData.value;
  return data ? planEnrolments(data.states.keys(), data.eventsOf) : new Map<PositionKey, 'white' | 'black'>();
});

/** The enrolled positions' notes, once read. */
export const planNotesRead = signal<Map<PositionKey, PlanNote> | undefined>(undefined);

let reading = 0;
async function readNotes(keys: ReadonlySet<PositionKey>): Promise<void> {
  const mine = ++reading;
  if (!keys.size) {
    planNotesRead.value = new Map();
    return;
  }
  const studies = await readStudies();
  if (mine !== reading) return;
  planNotesRead.value = planNotes(
    studies.flatMap((s) => s.chapters.map((chapter) => ({ sid: s.sid, cid: chapter.id, chapter }))),
    keys,
  );
}

let started = false;
/** Reads the notes now, and again when the data or the enrolments change. */
export function startPlans(): void {
  if (started) return;
  started = true;
  let last = '';
  effect(() => {
    const keys = new Set(planEnrolled.value.keys());
    const id = `${dataVersion.value}|${[...keys].sort().join('\n')}`;
    if (id === last) return;
    last = id;
    void readNotes(keys);
  });
}

/** The plan cards in the deck, and the enrolled positions without content. */
export const plansInDeck = computed(() => planDeck(planEnrolled.value, planNotesRead.value ?? new Map()));

export function setPlanCard(key: PositionKey, side: 'white' | 'black', on: boolean): void {
  void recordEvent({ t: new Date().toISOString(), k: 'plan', card: planCard(key), on, side });
}
