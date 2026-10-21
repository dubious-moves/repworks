// Idea cards (PLAN.md §5.128): the enrolments from the `idea` events, the enrolled studies'
// chapters read from the working copies (again whenever the data or the enrolments change), the
// deck and today's queue within the daily limit of new idea cards, and the session, which records
// each grade at once as a `review` of `i|<sid>|<cid>`.
import { computed, effect, signal } from '@preact/signals';
import type { Position } from 'chessops/chess';
import type { NormalMove } from 'chessops/types';
import { standardUci } from '../core/chess/uci.ts';
import { enrolledIn, ideaDeck, ideaEnrolments, ideaQueue, judgeIdeaMove, makesIdeaCard, type Idea } from '../core/ideas/cards.ts';
import { askIdea, gradeIdea, leaveIdea, nextIdea, playIdea, practiseIdeas, setIdeaMode, showIdea, startIdeas, type IdeaMode, type IdeaReview, type IdeaSession } from '../core/ideas/session.ts';
import { ideaCard, parseIdeaCard, type CardId } from '../core/progress/cards.ts';
import type { Grade } from '../core/progress/events.ts';
import { studiesFromFiles, type StudyChapters } from '../core/repertoire/files.ts';
import { localStore, recordEvent, recordEvents } from './state.ts';
import { dataVersion } from './sync.ts';
import { decidingNow } from './time.ts';
import { dayOf, trainData } from './train.ts';

/** The idea cards enrolled. */
export const ideaEnrolled = computed(() => {
  const data = trainData.value;
  return data ? ideaEnrolments(data.states.keys(), data.eventsOf) : new Set<CardId>();
});

/** The studies holding enrolled cards, as last read, with what they were read for (the data's version and the studies). */
const ideaRead = signal<{ id: string; studies: StudyChapters[] } | undefined>(undefined);
const readId = computed(() => `${dataVersion.value}|${[...new Set([...ideaEnrolled.value].map((c) => parseIdeaCard(c)!.sid))].sort().join(',')}`);
/** The enrolled studies are read for the data as it is now. */
export const ideasReady = computed(() => !!trainData.value && ideaRead.value?.id === readId.value);

let reading = 0;
async function readIdeaStudies(id: string): Promise<void> {
  const mine = ++reading;
  const sids = new Set(id.split('|')[1]!.split(',').filter(Boolean));
  const store = localStore();
  if (!sids.size || !store) {
    ideaRead.value = { id, studies: [] };
    return;
  }
  const files = await store.read((p) => p.startsWith('studies/') && sids.has(p.split('/')[1]!));
  if (mine === reading) ideaRead.value = { id, studies: studiesFromFiles(files).studies };
}

let started = false;
/** Reads the enrolled studies now, and again when the data or the enrolments change. */
export function startIdeaCards(): void {
  if (started) return;
  started = true;
  let last = '';
  effect(() => {
    const id = readId.value;
    if (id === last) return;
    last = id;
    void readIdeaStudies(id);
  });
}

/** Every enrolled card whose chapter is found, in the study list's and the chapters' order. */
export const ideasDeck = computed<Idea[]>(() => ideaDeck(ideaEnrolled.value, ideaRead.value?.studies ?? []));

/** Today's idea cards, of every study or one. */
export function ideaQueueNow(sid?: string, now: number = decidingNow()) {
  const data = trainData.value;
  const deck = sid ? ideasDeck.value.filter((i) => i.sid === sid) : ideasDeck.value;
  return ideaQueue(deck, data?.states ?? new Map(), dayOf(now), data?.settings.newIdeasPerDay ?? 5);
}

/** The chapters of a study that make idea cards, in its order. */
export async function ideaChaptersOf(sid: string): Promise<string[]> {
  const store = localStore();
  if (!store) return [];
  const files = await store.read((p) => p.startsWith(`studies/${sid}/`));
  return studiesFromFiles(files).studies.flatMap((st) => st.chapters.filter(makesIdeaCard).map((c) => c.id));
}

/**
 * The study's ☰ menu: every chapter that makes a card enrolled (the ones not yet), or every card
 * removed. What was done, for the feedback line.
 */
export async function enrolStudy(sid: string, on: boolean): Promise<string> {
  const enrolled = new Set(enrolledIn(ideaEnrolled.peek(), sid).map((c) => parseIdeaCard(c)!.cid));
  if (!on) {
    await setIdeaCards(sid, [...enrolled], false);
    return `${enrolled.size} idea card${enrolled.size === 1 ? '' : 's'} removed`;
  }
  const cids = (await ideaChaptersOf(sid)).filter((cid) => !enrolled.has(cid));
  if (!cids.length) return enrolled.size ? `No new chapters: all ${enrolled.size} are idea cards` : 'No chapter here makes an idea card: none has an IdeaKind header other than overview';
  await setIdeaCards(sid, cids, true);
  return `${cids.length} idea card${cids.length === 1 ? '' : 's'} made: the study’s Train button on the home page asks them`;
}

/** Enrols a study's chapters as idea cards (`on`), or removes them. */
export function setIdeaCards(sid: string, cids: readonly string[], on: boolean): Promise<void> {
  const t = new Date().toISOString();
  return recordEvents(cids.map((cid) => ({ t, k: 'idea' as const, card: ideaCard(sid, cid), on })));
}

/* ------------------------------------------------------------------ the session */

export const ideaSession = signal<(IdeaSession & { scope?: string }) | undefined>(undefined);

/** Read (a new card shown first) or Train (every card asked at once), per device. */
const MODE_KEY = 'repworks.ideaMode';
function readMode(): IdeaMode {
  try {
    if (localStorage.getItem(MODE_KEY) === 'train') return 'train';
  } catch {
    // Storage blocked: the default.
  }
  return 'read';
}
export const ideaMode = signal<IdeaMode>(readMode());
/** Read or Train, from the card in front when nothing is answered on it yet. */
export function setIdeaModeNow(m: IdeaMode): void {
  ideaMode.value = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // Kept for this page only.
  }
  const s = ideaSession.peek();
  if (s) put(setIdeaMode(s, m, Date.now()));
}

const record = (r: IdeaReview | undefined) => {
  if (r) void recordEvent({ t: new Date().toISOString(), k: 'review', card: r.card, g: r.g, ms: Math.round(r.ms), ...(r.w ? { w: r.w } : {}) });
};
const put = (s: IdeaSession) => {
  const scope = ideaSession.peek()?.scope;
  ideaSession.value = { ...s, ...(scope ? { scope } : {}) };
};

/** Today's cards of every study (or one), from the first. */
export function beginIdeas(scope?: string): void {
  const q = ideaQueueNow(scope);
  ideaSession.value = { ...startIdeas(q, Date.now(), ideaMode.peek()), ...(scope ? { scope } : {}) };
}

/** Train again: every card of every study (or one), due or not; the ones not due are practice. */
export function practiseAllIdeas(scope?: string): void {
  const deck = scope ? ideasDeck.value.filter((i) => i.sid === scope) : ideasDeck.value;
  const states = trainData.value?.states ?? new Map();
  ideaSession.value = { ...practiseIdeas(deck, ideaQueueNow(scope), (c) => (states.get(c)?.card.state ?? 0) !== 0, Date.now(), ideaMode.peek()), ...(scope ? { scope } : {}) };
}

export function endIdeas(): void {
  ideaSession.value = undefined;
}

export function askIdeaNow(): void {
  const s = ideaSession.peek();
  if (s) put(askIdea(s, Date.now()));
}

export function playIdeaMove(pos: Position, move: NormalMove): void {
  const s = ideaSession.peek();
  if (!s?.run) return;
  const { session, review } = playIdea(s, judgeIdeaMove(s.run.step.idea, pos, move), standardUci(pos, move), Date.now());
  put(session);
  record(review);
}

export function showIdeaNow(): void {
  const s = ideaSession.peek();
  if (s) put(showIdea(s));
}

export function gradeIdeaNow(g: Grade): void {
  const s = ideaSession.peek();
  if (!s) return;
  const { session, review } = gradeIdea(s, g, Date.now());
  put(session);
  record(review);
}

export function nextIdeaNow(): void {
  const s = ideaSession.peek();
  if (s) put(nextIdea(s, Date.now()));
}

/** Takes the card out (`idea`, `on: false`): the study's ☰ menu enrols it again. */
export function removeIdeaCard(): void {
  const s = ideaSession.peek();
  const run = s?.run;
  if (!s || !run) return;
  void setIdeaCards(run.step.idea.sid, [run.step.idea.cid], false);
  put(leaveIdea(s, Date.now(), true));
}
