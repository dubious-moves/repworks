// Repertoire endgames (PLAN.md §5.149): the gather that walks real games through the repertoire's
// line ends to their endgames and keeps the ones with a goal, on this device (the storm's store,
// D5's cache tier); where each stands, read from the practice results at its start as the
// theoretical endgames' are; and a try, played as theirs (src/app/endgames.ts, practice.ts).
import { computed, signal } from '@preact/signals';
import { keyFen } from '../core/chess/positionKey.ts';
import { attemptsByEndgame, standingOf, type Standing } from '../core/endgames/endgames.ts';
import { addEndgames, endgameInGame, inListOrder, readRepertoireEndgame, REP, repertoireEndgame, type RepertoireEndgame } from '../core/endgames/repertoire.ts';
import { STORM } from '../core/storm/config.ts';
import { gamesFromPgn } from '../core/storm/games.ts';
import { moverCp } from '../core/storm/grade.ts';
import { explorerUntil } from '../core/storm/harvest.ts';
import { positionOf } from '../core/storm/walk.ts';
import { practiceResults } from './repertoireCheck.ts';
import { scopeData, stormRequest, stormStore } from './storm.ts';
import { analyseForStorm } from './stormEngine.ts';
import { trainData } from './train.ts';

/** The kept endgames, and the games walked with the explorer's window reached, in the storm store's `meta`. */
const LIST_KEY = 'repertoireEndgames';
const WALKED_KEY = 'repertoireEndgamesWalked';
/** Games remembered as walked (a line end's key and the game's id), the latest kept. */
const WALKED_MAX = 20_000;

interface Walked {
  ids: string[];
  /** Gathers that walked every line end: the next asks for games this many steps older. */
  window: number;
}

/** The kept endgames in the list's order; undefined until read. */
export const repEndgames = signal<RepertoireEndgame[] | undefined>(undefined);

let loading: Promise<void> | undefined;
/** Reads the kept endgames once (the list, the drill, the home's count). */
export function loadRepEndgames(): Promise<void> {
  return (loading ??= stormStore()
    .get<unknown[]>('meta', LIST_KEY)
    .then((list) => {
      repEndgames.value = inListOrder((Array.isArray(list) ? list : []).map(readRepertoireEndgame).filter((r): r is RepertoireEndgame => !!r));
    })
    .catch(() => {
      repEndgames.value = [];
    }));
}

async function save(list: readonly RepertoireEndgame[]): Promise<void> {
  await stormStore().put('meta', LIST_KEY, list);
  repEndgames.value = inListOrder(list);
}

export const repById = (id: string): RepertoireEndgame | undefined => repEndgames.value?.find((r) => r.id === id);

/** Each kept endgame's tries, from every device's log. */
const repAttempts = computed(() =>
  attemptsByEndgame(
    practiceResults.value,
    (e) => keyFen(e.fen)?.key,
    (repEndgames.value ?? []).map((r) => ({ id: r.id, fen: r.fen })),
  ),
);

/** Where each kept endgame stands at `now`. */
export function repStandings(now: number): Map<string, Standing> {
  const attempts = repAttempts.value;
  return new Map((repEndgames.value ?? []).map((r) => [r.id, standingOf(r.goal, attempts.get(r.id) ?? [], now)]));
}

/** Takes an endgame off the list (its tries stay in the log). */
export async function removeRepEndgame(id: string): Promise<void> {
  await loadRepEndgames();
  await save((repEndgames.value ?? []).filter((r) => r.id !== id));
}

/* ------------------------------------------------------------------ the gather */

export interface RepGather {
  running: boolean;
  /** Line ends walked, of how many. */
  ends: number;
  of: number;
  games: number;
  kept: number;
  note: string;
}

export const repGather = signal<RepGather | undefined>(undefined);
let stopAsked = false;

class GatherEnd extends Error {}

const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches;

/** Stockfish's score for the side to move at the judges' depth (the drill's), or undefined. */
async function scoreOf(fen: string): Promise<{ cp: number; depth: number } | undefined> {
  const pos = positionOf(fen);
  const a = await analyseForStorm(fen, 1, narrow() ? 16 : 18, 10_000);
  const cp = pos && a?.lines[0] ? moverCp(a.lines[0].score, pos.turn, STORM) : null;
  return cp === null || cp === undefined || !a ? undefined : { cp, depth: a.depth };
}

/**
 * Walks every line end of the repertoire (in a random order, so a gather stopped early has some of
 * each chapter): the games the explorer names there that weren't walked before, each to its
 * endgame, scored by Stockfish and kept when it has a goal (`REP.perLineEnd` a line end at most).
 * Once every line end is walked, the next gather asks for games `REP.stepMonths` older.
 */
export async function gatherRepEndgames(): Promise<void> {
  if (repGather.value?.running) return;
  stopAsked = false;
  const g: RepGather = { running: true, ends: 0, of: 0, games: 0, kept: 0, note: '' };
  const show = () => (repGather.value = { ...g });
  const data = trainData.value;
  const s = data ? scopeData(data, {}) : 'The repertoire is still loading.';
  if (typeof s === 'string') {
    repGather.value = { ...g, running: false, note: s };
    return;
  }
  if (!s.frontiers.length) {
    repGather.value = { ...g, running: false, note: 'Nothing to walk: no repertoire line ends past 4 plies.' };
    return;
  }
  const ends = s.frontiers.map((f) => ({ f, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.f);
  g.of = ends.length;
  show();
  let failed = 0;
  let lastError = '';
  try {
    await loadRepEndgames();
    const stored = await stormStore().get<Walked>('meta', WALKED_KEY);
    const walked = new Set(stored?.ids ?? []);
    const windowNow = stored?.window ?? 0;
    const until = explorerUntil(Date.now(), windowNow * REP.stepMonths);
    const remember = (window: number) => stormStore().put<Walked>('meta', WALKED_KEY, { ids: [...walked].slice(-WALKED_MAX), window });
    for (const f of ends) {
      if (stopAsked) break;
      const r = await stormRequest(until ? { type: 'stormGames', fen: f.fen, until } : { type: 'stormGames', fen: f.fen });
      if ('error' in r) {
        if (r.error.login) throw new GatherEnd('The games come from Lichess’s explorer, which wants a Lichess login: log in under Settings, then gather again.');
        failed++;
        lastError = r.error.message;
      } else if (r.type === 'stormGames') {
        // A game is walked once from each line end it was named at.
        const seen = (id: string) => `${f.key}|${id}`;
        const ids = (r.games.gameIds ?? []).filter((id) => !walked.has(seen(id)));
        const text = ids.length ? await stormRequest({ type: 'gamePgns', ids }) : undefined;
        if (text && 'error' in text) {
          failed++;
          lastError = text.error.message;
        } else if (text?.type === 'gamePgns') {
          let here = 0;
          for (const game of gamesFromPgn(text.text)) {
            if (stopAsked || here >= REP.perLineEnd) break;
            g.games++;
            const found = endgameInGame(f.fen, f.side, game.sans);
            if (typeof found === 'string') continue;
            const key = keyFen(found.fen)?.key;
            if (!key || (repEndgames.value ?? []).some((x) => x.key === key)) continue;
            const score = await scoreOf(found.fen);
            if (!score) continue;
            const rep = repertoireEndgame(found, f.side, score, { lines: f.lines, names: f.names, game: { id: game.id, white: game.white, black: game.black } }, Date.now());
            if (typeof rep === 'string') continue;
            const { list, added } = addEndgames(repEndgames.value ?? [], [rep]);
            await save(list);
            g.kept += added;
            here += added;
            show();
          }
          for (const id of ids) walked.add(seen(id));
        }
      }
      g.ends++;
      show();
      await remember(windowNow);
    }
    if (!stopAsked) await remember(windowNow + 1);
    const failures = failed ? ` ${failed} line end${failed === 1 ? '' : 's'} couldn’t be read (${lastError}).` : '';
    g.note = stopAsked
      ? `Stopped: ${g.kept} kept.${failures}`
      : `Every line end walked${until ? ` (games up to ${until})` : ''}: ${g.kept} kept from ${g.games} games.${failures} The next gather reads older games.`;
  } catch (e) {
    g.note = e instanceof GatherEnd ? e.message : `The gather stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    g.running = false;
    show();
  }
}

export function stopRepGather(): void {
  stopAsked = true;
}
