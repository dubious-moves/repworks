// What the games say about the repertoire (PLAN.md §5.58–§5.60): the deviations and gaps of the
// games kept (within the date filter), the weak spots (the real games' and the practice results'),
// and recidivism: the drilled game cards met again in later games, with the relapses written as
// `relapse` events (once per card and game) while "Reschedule on relapse" is on.
import { computed, effect } from '@preact/signals';
import { keyFen, type PositionKey } from '../core/chess/positionKey.ts';
import { dropsOf } from '../core/games/deck.ts';
import { findDeviations, type WalkGame } from '../core/games/deviations.ts';
import { replay } from '../core/games/positions.ts';
import { drilledIndex, recidivism, relapsesToWrite, type Encounter, type RecidPractice, type Summary } from '../core/games/recidivism.ts';
import { resultFor, isAnalysed } from '../core/games/record.ts';
import { botWeakSpots, humanWeakSpots, type PracticeResult } from '../core/games/weakSpots.ts';
import { dismissCard, gameCard } from '../core/progress/cards.ts';
import { gameRows, gamesPrefs, itemsOf, playedOf, practiceHistory, savedDeck } from './games.ts';
import { recordEvent } from './state.ts';
import { trainData } from './train.ts';

/** The checklist's presets (§5.62), for the bot lens's buckets. */
export const PRESET_NAMES = ['easy', 'medium', 'hard'] as const;

/** The positions whose deviations are ignored (`dismiss` events, the latest of each deciding). */
export const dismissed = computed<Set<string>>(() => {
  const data = trainData.value;
  const out = new Set<string>();
  if (!data) return out;
  for (const card of data.states.keys()) {
    if (!card.startsWith('d|')) continue;
    let on = false;
    for (const e of data.eventsOf(card)) if (e.event?.k === 'dismiss') on = e.event.on;
    if (on) out.add(card.slice(2));
  }
  return out;
});

export function setDismissed(key: string, on: boolean): void {
  void recordEvent({ t: new Date().toISOString(), k: 'dismiss', card: dismissCard(key as PositionKey), on });
}

const walkGames = computed<(WalkGame & { result: 'win' | 'loss' | 'draw' })[]>(() =>
  (gameRows.value ?? []).flatMap((r) => {
    const p = playedOf(r.game);
    return p ? [{ id: r.game.id, color: r.game.color, speed: r.game.speed, createdAt: r.game.createdAt, result: resultFor(r.game), ...(r.game.opening ? { opening: r.game.opening } : {}), plies: p.plies, finalKey: p.finalKey }] : [];
  }),
);

/** Deviations and gaps (§5.58), dismissed positions left out of the deviations. */
export const repertoireCheck = computed(() => {
  const index = trainData.value?.index;
  if (!index || !gameRows.value) return undefined;
  return findDeviations(walkGames.value, index, dismissed.value);
});

/** The human lens (§5.60): the opponent's replies the real games score badly against. */
export const humanSpots = computed(() => humanWeakSpots(walkGames.value));

/** Every practice result (`practice` events), oldest first. */
export const practiceResults = computed<(PracticeResult & { t: number })[]>(() => {
  const data = trainData.value;
  if (!data) return [];
  const out: (PracticeResult & { t: number })[] = [];
  for (const card of data.states.keys()) {
    if (!card.startsWith('x|')) continue;
    for (const e of data.eventsOf(card)) if (e.event?.k === 'practice') out.push({ key: card.slice(2) as PositionKey, res: e.event.res, ...(e.event.preset ? { preset: e.event.preset } : {}), t: e.t });
  }
  return out.sort((a, b) => a.t - b.t);
});

/** The bot lens (§5.60): practice results by position and preset. */
export const botSpots = computed(() => botWeakSpots(practiceResults.value, PRESET_NAMES));

/* ------------------------------------------------------------------ recidivism (§5.59) */

export interface Recid {
  byPid: Map<string, Encounter[]>;
  summary: Summary;
}

export const recid = computed<Recid | undefined>(() => {
  const data = trainData.value;
  const rows = gameRows.value;
  if (!data || !rows) return undefined;
  const items = [...rows.flatMap((r) => r.items), ...savedDeck.value];
  const times = new Map(rows.map((r) => [r.game.id, r.game.createdAt]));
  const stateOf = (pid: string) => {
    const card = gameCard(pid);
    const s = data.states.get(card);
    if (!s) return undefined;
    return { reps: s.card.reps, ...(s.firstReview !== undefined ? { firstReview: s.firstReview } : {}), dropped: dropsOf(data.eventsOf(card)).dropped };
  };
  const drilled = drilledIndex(items, stateOf, (id) => times.get(id), (fen) => keyFen(fen)?.key);
  if (!drilled.size) return { byPid: new Map(), summary: { fixed: 0, relapsed: 0, inappFixed: 0, inappRelapsed: 0 } };
  const mistakes = new Map<string, Map<PositionKey, string>>();
  for (const r of rows) {
    const m = new Map<PositionKey, string>();
    for (const it of itemsOf(r.game)) if (it.kind === 'mistake') m.set(it.key, it.san);
    mistakes.set(r.game.id, m);
  }
  const games = rows.map((r) => ({ id: r.game.id, createdAt: r.game.createdAt, analysed: isAnalysed(r.game), color: r.game.color, plies: playedOf(r.game)?.plies ?? [] }));
  const practice: RecidPractice[] = [];
  for (const h of practiceHistory.value) {
    const seed = keyFen(h.baseFen)?.key;
    const p = seed && replay({ initialFen: h.baseFen, moves: h.moves.map((m) => m.san) });
    if (!seed || !p) continue;
    practice.push({ id: h.id, ts: h.ts, seedKey: seed, moves: p.plies.map((pl, i) => ({ keyBefore: pl.keyBefore, san: pl.san, uci: pl.uci, isUser: h.moves[i]!.isUser, ...(h.moves[i]!.classification ? { classification: h.moves[i]!.classification! } : {}), ...(h.moves[i]!.bestMoveUci ? { bestMoveUci: h.moves[i]!.bestMoveUci! } : {}) })) });
  }
  return recidivism(drilled, games, (id) => mistakes.get(id), practice);
});

// Reschedule on relapse: each real game's relapse written once per card and game; replay keeps
// mistake-lab's guards (not a new card, not before its last review).
const writing = new Set<string>();
effect(() => {
  const r = recid.value;
  const data = trainData.value;
  if (!r || !data || !gamesPrefs.value.recidAuto) return;
  for (const w of relapsesToWrite(r.byPid, (pid) => data.states.get(gameCard(pid))?.relapses)) {
    const id = `${w.pid}|${w.gameId}`;
    if (writing.has(id)) continue;
    writing.add(id);
    void recordEvent({ t: new Date().toISOString(), k: 'relapse', card: gameCard(w.pid), g: w.gameId, at: new Date(w.at).toISOString() });
  }
});
