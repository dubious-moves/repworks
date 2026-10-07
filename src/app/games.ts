// The games on this device and their cards (PLAN.md §5.51–§5.54): the sources (mistake-lab's Gist,
// read-only, until the owner's answer on §5.66; Lichess's own export; chess.com's archives where
// they answer a page), the games kept in IndexedDB, the items found in them, and the deck of game
// cards with today's queue. The cards' states come from the same replay as the repertoire's
// (trainData), so a review recorded here is a progress event like any other.
import { computed, effect, signal } from '@preact/signals';
import { readChesscomGame } from '../core/games/chesscom.ts';
import { deckOf, gameQueue, type DeckCard } from '../core/games/deck.ts';
import { extractGame, type GameItem } from '../core/games/extract.ts';
import { savedItems, type SavedItem } from '../core/games/saved.ts';
import { historyOf, type HistoryEntry } from '../core/games/practice.ts';
import { readGame, readGamesFile, type GameRecord } from '../core/games/record.ts';
import { replay, type Replayed } from '../core/games/positions.ts';
import type { PositionKey } from '../core/chess/positionKey.ts';
import type { RepertoireIndex } from '../core/repertoire/index.ts';
import { openGamesStore, type GamesStore, type StoredGame } from '../platform/gamesStore.ts';
import { gistId, readGist } from '../platform/gist.ts';
import { userGames } from '../platform/lichessGames.ts';
import { lichessToken } from './lichess.ts';
import { plansInDeck, startPlans } from './plans.ts';
import { decidingNow } from './time.ts';
import { dayOf, trainData } from './train.ts';

/* ------------------------------------------------------------------ settings on this device */

export type Since = 'all' | '3' | '6' | '12' | '24';
export interface GamesPrefs {
  /** mistake-lab's Gist (its ID), read for `mistakelab_games.json`. */
  gist: string;
  lichess: string;
  chesscom: string;
  /** mistake-lab's date filter: every game, or the last so many months. */
  since: Since;
  /** New game cards a day (§5.53). */
  newPerDay: number;
  /** Reschedule a card when its position is missed again in a later game (§5.59, mistake-lab's "Reschedule on relapse"). */
  recidAuto: boolean;
  filters: GameFilters;
}
export interface GameFilters {
  color: '' | 'white' | 'black';
  speed: string[];
  rated: '' | 'rated' | 'casual';
  platform: '' | 'lichess' | 'chesscom';
  hideTimeTrouble: boolean;
}
const PREFS_KEY = 'repworks-games';
const DEFAULT_PREFS: GamesPrefs = { gist: '', lichess: '', chesscom: '', since: 'all', newPerDay: 10, recidAuto: true, filters: { color: '', speed: [], rated: '', platform: '', hideTimeTrouble: false } };

function loadPrefs(): GamesPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<GamesPrefs>;
    return { ...DEFAULT_PREFS, ...raw, filters: { ...DEFAULT_PREFS.filters, ...(raw.filters ?? {}) } };
  } catch {
    return DEFAULT_PREFS;
  }
}
export const gamesPrefs = signal<GamesPrefs>(loadPrefs());
export function setGamesPrefs(patch: Partial<GamesPrefs>): void {
  gamesPrefs.value = { ...gamesPrefs.value, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(gamesPrefs.value));
  } catch {
    // kept for this page only
  }
}

/* ------------------------------------------------------------------ the store, and what is read from it */

let store: GamesStore | undefined;
export const gamesStore = (): GamesStore => (store ??= openGamesStore());

export interface GameRow {
  game: GameRecord;
  source: StoredGame['source'];
  /** Every item found, the replaced mistakes included (the deck decides what is shown). */
  items: GameItem[];
}

/** The games kept, newest first, within the date filter; undefined until read. */
export const gameRows = signal<GameRow[] | undefined>(undefined);
/** The games kept, by id. */
export const gameById = computed(() => new Map((gameRows.value ?? []).map((r) => [r.game.id, r])));

const MONTH_MS = 30.44 * 86_400_000;
export function sinceCutoff(since: Since, now: number): number {
  return since === 'all' ? 0 : now - Number(since) * MONTH_MS;
}

/** The repertoire's moves at a position, either side's (mistake-lab's trie matches any). */
export function repertoireMoves(index: RepertoireIndex | undefined): (key: PositionKey, uci: string) => boolean {
  if (!index) return () => false;
  return (key, uci) => {
    const at = index.positions.get(key);
    return !!at && (at.own.has(uci) || at.opponent.has(uci));
  };
}

let stored: StoredGame[] = [];
async function readStored(): Promise<void> {
  try {
    stored = await gamesStore().games();
  } catch {
    stored = [];
  }
  rebuild();
}

// Each game's items, kept while its record is the same object (a refresh that changes games reads
// them again). The repertoire's moves are left out afterwards, so a sync that changes the
// repertoire doesn't extract every game again: mistake-lab's own post-filter, which it runs when its
// trie loads after the extraction (its advantages are found before that filter too).
const extracted = new WeakMap<GameRecord, GameItem[]>();
/** A game's items as extracted, before the repertoire's moves are left out (recidivism reads these). */
export const itemsOf = (g: GameRecord) => {
  let items = extracted.get(g);
  if (!items) extracted.set(g, (items = extractGame(g).items));
  return items;
};

// Each game replayed once while its record is the same object (deviations, weak spots, recidivism).
const replays = new WeakMap<GameRecord, Replayed | null>();
export const playedOf = (g: GameRecord): Replayed | undefined => {
  let r = replays.get(g);
  if (r === undefined) replays.set(g, (r = replay(g) ?? null));
  return r ?? undefined;
};

function rebuild(): void {
  const cutoff = sinceCutoff(gamesPrefs.peek().since, Date.now());
  const isRep = repertoireMoves(trainData.peek()?.index);
  gameRows.value = stored
    .filter((s) => s.game.createdAt >= cutoff)
    .sort((a, b) => b.game.createdAt - a.game.createdAt)
    .map((s) => ({ game: s.game, source: s.source, items: itemsOf(s.game).filter((it) => it.kind !== 'mistake' || !isRep(it.key, it.uci)) }));
}

let started = false;
/** Reads the games kept on this device once, and again when the repertoire or the date filter changes. */
export function startGames(): void {
  if (started) return;
  started = true;
  startPlans();
  void readStored();
  let lastIndex: unknown;
  let lastSince: Since | undefined;
  effect(() => {
    const index = trainData.value?.index;
    const since = gamesPrefs.value.since;
    if (index === lastIndex && since === lastSince) return;
    lastIndex = index;
    lastSince = since;
    rebuild();
  });
}

/* ------------------------------------------------------------------ the deck and today's queue */

/** The items saved on the site (§5.56): sequences and practice mistakes, from their events. */
export const savedDeck = computed<SavedItem[]>(() => {
  const data = trainData.value;
  return data ? savedItems(data.states.keys(), data.eventsOf) : [];
});

/** The practice games kept (§5.57), newest first, from their `played` events. */
export const practiceHistory = computed<HistoryEntry[]>(() => {
  const data = trainData.value;
  return data ? historyOf(data.states.keys(), data.eventsOf) : [];
});

/** The deck: every item shown, less the dropped (§5.53), with the saved items. */
export const gameDeck = computed<DeckCard[]>(() => {
  const rows = gameRows.value;
  const data = trainData.value;
  if (!rows) return [];
  const eventsOf = data ? data.eventsOf : () => [];
  return [
    ...deckOf(
      rows.map((r) => r.items),
      savedDeck.value,
      eventsOf,
    ),
    ...plansInDeck.value.cards,
  ];
});

export function gameQueueNow(now: number = decidingNow()) {
  const data = trainData.value;
  const d = dayOf(now);
  return gameQueue(gameDeck.value, data?.states ?? new Map(), d, gamesPrefs.value.newPerDay);
}

/* ------------------------------------------------------------------ refreshing from the sources */

export interface RefreshState {
  running: boolean;
  /** What was read, or what went wrong, one line per source. */
  lines: string[];
  at?: number;
}
export const refreshState = signal<RefreshState>({ running: false, lines: [] });

const say = (lines: string[], running = true) => (refreshState.value = { running, lines: [...lines], at: Date.now() });

/** Reads every source set up on this device; what each said goes in `refreshState`. */
export async function refreshGames(): Promise<void> {
  if (refreshState.value.running) return;
  const prefs = gamesPrefs.value;
  const lines: string[] = [];
  say(lines);
  const s = gamesStore();
  let changed = 0;

  const gist = gistId(prefs.gist);
  if (prefs.gist.trim() && !gist) lines.push('Gist: that isn’t a gist’s ID or address.');
  if (gist) {
    try {
      const meta = await s.meta<{ id: string; etag?: string }>('gist');
      const read = await readGist(gist, meta?.id === gist && meta.etag ? { etag: meta.etag } : {});
      if (read.status === 'unchanged') lines.push('Gist: unchanged since the last read.');
      else {
        const text = await read.text('mistakelab_games.json');
        if (text === undefined) lines.push('Gist: it has no mistakelab_games.json.');
        else {
          const file: unknown = JSON.parse(text);
          const { games, problems } = readGamesFile(file, [prefs.lichess, prefs.chesscom].filter(Boolean));
          const n = await s.putGames(games.map((game) => ({ game, source: 'gist' as const })));
          changed += n;
          lines.push(`Gist: ${games.length} games read, ${n} new or changed${problems.length ? `, ${problems.length} unreadable` : ''}.`);
          await s.setMeta('gist', { id: gist, ...(read.etag ? { etag: read.etag } : {}) });
        }
      }
    } catch (error) {
      lines.push(`Gist: ${error instanceof Error ? error.message : String(error)}`);
    }
    say(lines);
  }

  const name = prefs.lichess.trim();
  if (name) {
    try {
      const newest = stored.filter((g) => g.game.platform === 'lichess').reduce((m, g) => Math.max(m, g.game.createdAt), 0);
      const since = newest || sinceCutoff(prefs.since, Date.now()) || undefined;
      const token = lichessToken();
      const { games } = await userGames({ name, max: 300, ...(since ? { since } : {}), ...(token ? { token } : {}) });
      const names = new Set([name.toLowerCase(), prefs.chesscom.toLowerCase()].filter(Boolean));
      const read = games.map((g) => readGame(g, names)).flatMap((r) => (r.ok ? [{ game: r.game, source: 'lichess' as const }] : []));
      const n = await s.putGames(read);
      changed += n;
      lines.push(`Lichess: ${read.length} new games${read.length === 300 ? ' (the newest 300: refresh again for more)' : ''}.`);
    } catch (error) {
      lines.push(`Lichess: ${error instanceof Error ? error.message : String(error)}`);
    }
    say(lines);
  }

  const cc = prefs.chesscom.trim();
  if (cc) {
    try {
      const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(cc.toLowerCase())}/games/archives`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const archives = ((await res.json()) as { archives?: string[] }).archives ?? [];
      const read: StoredGame[] = [];
      for (const url of archives.slice(-2)) {
        const month = await fetch(url);
        if (!month.ok) continue;
        for (const g of ((await month.json()) as { games?: unknown[] }).games ?? []) {
          const game = readChesscomGame(g, cc);
          if (game) read.push({ game, source: 'chesscom' });
        }
      }
      const n = await s.putGames(read);
      changed += n;
      lines.push(`chess.com: ${read.length} games in the last two months, ${n} new.`);
    } catch {
      lines.push('chess.com: its archives didn’t answer this page (most likely they don’t allow other sites); its games come through the analyzer.');
    }
  }

  if (!gist && !name && !cc) lines.push('Nothing set up yet: enter mistake-lab’s gist, a Lichess name or a chess.com name.');
  if (changed) await readStored();
  say(lines, false);
}

/** Forgets every game on this device (they come back with the next refresh). */
export async function forgetGames(): Promise<void> {
  await gamesStore().clear();
  await readStored();
}
