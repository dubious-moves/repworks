// The gather's loop (PLAN.md §5.42, §5.102, §5.116, §5.155): the scope's line ends and replies
// walked until stopped or done, what passes stored; overnight, pass after pass over older games
// with Stockfish scoring between them. Everything it touches is injected (`GatherHost`): the
// requests, the store, the scoring, the files, the clock, randomness and the waits. The storm's
// home runs it in the app (src/app/storm.ts) and a cloud session runs it from the data repo's
// checkout (scripts/storm-gather.ts), so both gather alike. Pure.
import type { DepthScores, EngineLine } from '../engine/search.ts';
import type { FromWorker, ToWorker } from '../explorer/service.ts';
import type { StormConfig } from './config.ts';
import { cdbList, engineList, explorerUntil, harvestDecision, harvestFrontier, storedPosition, type HarvestIo, type StoredPosition } from './harvest.ts';
import { behind, chapterShare, drawBalanced, type Coverage, type DecisionPoint, type Frontier, type StormLine } from './sources.ts';
import { drawFrontier, kept, positionOf } from './walk.ts';

/** The requests a gather made, by kind. */
export interface Spent {
  explorer: number;
  games: number;
  chessdb: number;
  searches: number;
}
export const blankSpent = (): Spent => ({ explorer: 0, games: 0, chessdb: 0, searches: 0 });

export interface Overnight {
  /** The pass under way, from 1: the first walks today's games, each after it older ones (§5.102). */
  pass: number;
  passes: number;
  doing: 'walking' | 'scoring' | 'waiting';
  /** Failures waited out. */
  errors: number;
}

/** A gather as it stands. */
export interface Gathering {
  running: boolean;
  frontiers: number;
  of: number;
  stored: number;
  spent: Spent;
  note: string;
  /** Kept going until stopped (§5.102). */
  overnight?: Overnight;
}

/** Where a gather finds positions: line ends, the opponent's uncovered replies, or both. */
export type GatherSource = 'ends' | 'replies' | 'both';

/** The scope's sources, as the storm's scope has them. */
export interface GatherScope {
  lines: readonly StormLine[];
  frontiers: readonly Frontier[];
  decisions: readonly DecisionPoint[];
  cont: Coverage;
}

/** A failure no wait mends (a Lichess login wanted): it ends even an overnight gather. */
export class GatherEnd extends Error {}

/** The longest a walk's search runs (ChessDB's miss, the invented line), ms. */
export const WALK_SEARCH_MS = 8000;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** The explorer worker's storm requests (core/explorer/service.ts), without their id. */
export type StormAsk = DistributiveOmit<Extract<ToWorker, { type: 'stormGames' | 'gamePgns' | 'scores' }>, 'id'>;
/** And its answers. */
export type StormReply = Extract<FromWorker, { type: 'stormGames' | 'gamePgns' | 'scores' }>;
/** Stockfish's answer to a search: its MultiPV lines, the depth, and each root move's score by depth (§5.120). */
export interface EngineAnswer {
  lines: EngineLine[];
  depth: number;
  scores: DepthScores;
}

/**
 * The gather's requests over the explorer service's storm messages (`ask`) and Stockfish
 * (`analyse`: MultiPV lines to a depth or for so many ms), each counted as it goes out (`count`)
 * and each given up the moment the gather is stopped (`guard` rejects then). `until`: the
 * explorer's games up to that month. `strict` (overnight): a failed explorer request or game
 * export throws (a login wanted: `GatherEnd`), to be waited out, rather than reading as a line end
 * without games. `c` scores the engine's lists; `rnd` picks the games.
 */
export function serviceIo(
  ask: (m: StormAsk) => Promise<StormReply>,
  analyse: (fen: string, lines: number, depth: number, movetime: number) => Promise<EngineAnswer | null>,
  count: (k: keyof Spent) => void,
  guard: <T>(p: Promise<T>) => Promise<T>,
  c: StormConfig,
  rnd: () => number,
  until?: string,
  strict = false,
): HarvestIo {
  return {
    explorer: async (fen) => {
      count('explorer');
      const r = await guard(ask(until ? { type: 'stormGames', fen, until } : { type: 'stormGames', fen }));
      if (strict && 'error' in r) throw r.error.login ? new GatherEnd(r.error.message) : new Error(r.error.message);
      return r.type === 'stormGames' && 'games' in r ? { total: r.games.total, moves: r.games.moves, gameIds: r.games.gameIds ?? [] } : null;
    },
    pgns: async (ids) => {
      count('games');
      const r = await guard(ask({ type: 'gamePgns', ids }));
      if (strict && 'error' in r) throw new Error(r.error.message);
      return r.type === 'gamePgns' && 'text' in r ? r.text : '';
    },
    cdb: async (fen) => {
      count('chessdb');
      const r = await guard(ask({ type: 'scores', fen }));
      return r.type === 'scores' && 'evals' in r ? cdbList(r.evals) : 'error';
    },
    engine: async (fen, lines, depth) => {
      count('searches');
      const a = await guard(analyse(fen, lines, depth, WALK_SEARCH_MS));
      const pos = positionOf(fen);
      return a && pos ? engineList(a.lines, pos.turn, a.depth, c, a.scores) : null;
    },
    rnd,
  };
}

/** What the host's waits and requests reject with once the gather is stopped. */
export const GATHER_STOPPED = new Error('stopped');

export interface GatherHost {
  /**
   * The requests, each counted with `count` as it goes out. `until`: the explorer's games up to
   * that month. `strict` (overnight): a failed explorer request or game export throws, to be
   * waited out, rather than reading as a line end without games.
   */
  io(count: (kind: keyof Spent) => void, until: string | undefined, strict: boolean): HarvestIo;
  /** The positions kept now (the chapters' shares are read from them before every walk, §5.116). */
  positions(): Promise<readonly StoredPosition[]>;
  /** New positions kept, a position kept already never twice; `spare` goes first to make room. How many were added. */
  add(fresh: StoredPosition[], spare: ReadonlySet<string>): Promise<number>;
  /** The cards answered well lately: left out of the shares, the first to make room. */
  done(): ReadonlySet<string>;
  /**
   * Overnight, Stockfish over what came in: between passes with `passMs`, how long the pass took
   * (§5.102, §5.105); at the end with none.
   */
  score(passMs?: number): Promise<void>;
  /** The positions written out (after every pass and at the end). */
  share(): Promise<unknown>;
  /** The gather as it stands, a copy: at every step. */
  show(g: Gathering): void;
  /** A request went out: `current` gives the gather as it stands then (or later). */
  counted?(current: () => Gathering): void;
  /** After every walk, and at the end (the storm's home counts again). */
  refresh?(): Promise<void>;
  /** Stop was asked for. */
  stopped(): boolean;
  /** Resolves after `ms`; rejects with `GATHER_STOPPED` when the gather is stopped first. */
  wait(ms: number): Promise<void>;
  now(): number;
  rnd(): number;
}

export interface GatherOptions {
  source: GatherSource;
  /** Keep going until stopped (§5.102). */
  overnight: boolean;
  config: StormConfig;
}

/**
 * Walks the scope's line ends (and replies) until stopped or done, storing what passes: line ends
 * and replies in turn, each from the chapter furthest behind its share (§5.116); breadth first,
 * one game at every line end, then a second pass over the rest of each one's games. Overnight
 * (§5.102) it goes on: Stockfish scores what came in, then the line ends are walked again over
 * older games (the explorer up to `overnightStepMonths` earlier each pass, only games not walked
 * yet), until `overnightPasses`, the store full, or Stop; a failure is waited out (a minute, then
 * longer each time in a row, up to 15) instead of ending it. The positions are written out after
 * every pass and at the end. Returns the gather as it ended.
 */
export async function runGather(s: GatherScope, o: GatherOptions, host: GatherHost): Promise<Gathering> {
  const c = o.config;
  const spent = blankSpent();
  const ends = o.source === 'replies' ? [] : s.frontiers.slice();
  const points = o.source === 'ends' ? [] : s.decisions.slice().sort((a, b) => b.n - a.n);
  // Breadth first: one game at every line end, then (a second pass) the rest of each one's games.
  const again: { f: Frontier; lines: Frontier['lines']; walked: Set<string> }[] = [];
  const more = Math.max(0, c.gatherGamesPerFrontier - 1);
  const of = ends.length + points.length;
  const g: Gathering = { running: true, frontiers: 0, of, stored: 0, spent, note: of ? '' : 'Nothing to walk: no line in this scope ends past 4 plies.' };
  if (o.overnight) g.overnight = { pass: 1, passes: c.overnightPasses, doing: 'walking', errors: 0 };
  const snapshot = (): Gathering => ({ ...g, spent: { ...spent }, ...(g.overnight ? { overnight: { ...g.overnight } } : {}) });
  const show = () => host.show(snapshot());
  const count = (k: keyof Spent) => {
    spent[k]++;
    host.counted?.(snapshot);
  };
  const io = host.io(count, undefined, o.overnight);
  show();
  let spare = host.done();
  const keep = async (cands: Parameters<typeof storedPosition>[0][], from: Parameters<typeof storedPosition>[1]) => {
    const fresh = cands.filter(kept).map((x) => storedPosition(x, from, host.now())).filter((p): p is StoredPosition => !!p);
    g.stored += await host.add(fresh, spare);
  };
  // Every line end's games walked in this gather, and how often each is reached (the first pass's count).
  const walkedBy = new Map<string, Set<string>>();
  const reach = new Map<string, number | null>();
  const walked = (f: Frontier, ids: readonly string[] | undefined) => {
    const set = walkedBy.get(f.key) ?? new Set<string>();
    for (const id of ids ?? []) set.add(id);
    walkedBy.set(f.key, set);
    return set;
  };
  // One frontier's walk. Overnight a failure is waited out and the walk tried again; else it ends the gather.
  let fails = 0;
  const step = async (walk: () => Promise<void>) => {
    for (;;) {
      try {
        await walk();
        fails = 0;
        return;
      } catch (e) {
        if (e === GATHER_STOPPED || e instanceof GatherEnd || !g.overnight) throw e;
        fails++;
        g.overnight.errors++;
        g.overnight.doing = 'waiting';
        const min = Math.min(15, 2 ** Math.min(4, fails - 1));
        g.note = `Waiting ${min} min after a failure: ${e instanceof Error ? e.message : String(e)}`;
        show();
        await host.wait(min * 60_000);
        g.overnight.doing = 'walking';
        g.note = '';
        show();
      }
    }
  };
  // Each chapter's positions not yet answered well per line, read before every walk (§5.116).
  const shareNow = async () => chapterShare(s.lines, (await host.positions()).filter((p) => !spare.has(p.card)));
  const weighted = <T extends { n: number }>(among: T[]): T => drawFrontier(among.slice(), host.rnd)!;
  try {
    let passStart = host.now();
    while (!host.stopped() && (ends.length || points.length || again.length)) {
      // Line ends and replies taken in turn, so a gather stopped early has some of each; each from
      // the chapter furthest behind its share, a line end's second pass once its chapter's first is done.
      const share = await shareNow();
      const endsTurn = (ends.length > 0 || again.length > 0) && (!points.length || g.frontiers % 2 === 0);
      const lowAgain = again.reduce((m, a) => Math.min(m, behind(a, share)), Infinity);
      if (endsTurn && ends.length && ends.some((f) => behind(f, share) <= lowAgain)) {
        const f = drawBalanced(ends, share, weighted)!;
        await step(async () => {
          const h = await harvestFrontier(f, s.cont, io, c, more ? 1 : c.gatherGamesPerFrontier);
          reach.set(f.key, h.games ?? null);
          walked(f, h.walked);
          await keep(h.candidates, { lines: f.lines, names: f.names, games: h.games ?? null });
          if (more && h.walked?.length && (h.gameIds?.length ?? 0) > h.walked.length) {
            again.push({ f, lines: f.lines, walked: new Set(h.walked) });
            g.of++;
          }
        });
      } else if (endsTurn) {
        const { f, walked: before } = drawBalanced(again, share, (among) => among[Math.floor(host.rnd() * among.length)]!)!;
        await step(async () => {
          const h = await harvestFrontier(f, s.cont, io, c, more, before);
          walked(f, h.walked);
          await keep(h.candidates, { lines: f.lines, names: f.names, games: h.games ?? null });
        });
      } else {
        const d = drawBalanced(points, share, (among) => among[0]!)!;
        await step(async () => {
          const h = await harvestDecision(d, io, c);
          for (const cand of h.candidates) await keep([cand], { lines: d.lines, names: d.names, games: cand.unc?.games ?? null });
        });
      }
      g.frontiers++;
      show();
      await host.refresh?.();
    }
    g.note = host.stopped() ? 'Stopped.' : of ? 'Every line end and reply walked.' : g.note;
    const ov = g.overnight;
    if (ov && of) {
      const pool0 = o.source === 'replies' ? [] : s.frontiers;
      for (let pass = 2; pass <= ov.passes && !host.stopped() && pool0.length; pass++) {
        // What the pass found, scored by Stockfish (and written out) before the next goes on.
        await host.share();
        ov.doing = 'scoring';
        g.note = '';
        show();
        await host.score(host.now() - passStart);
        // Stopped while scoring: the note was cleared for it.
        if (host.stopped()) {
          g.note = 'Stopped.';
          break;
        }
        await host.share();
        const all = await host.positions();
        spare = host.done();
        if (all.filter((p) => !spare.has(p.card)).length >= c.storeMax) {
          g.note = `The store is full: ${c.storeMax} positions not yet answered well.`;
          break;
        }
        passStart = host.now();
        ov.pass = pass;
        ov.doing = 'walking';
        const until = explorerUntil(host.now(), (pass - 1) * c.overnightStepMonths);
        const older = host.io(count, until, true);
        const pool = pool0.slice();
        g.frontiers = 0;
        g.of = pool.length;
        show();
        while (pool.length && !host.stopped()) {
          const f = drawBalanced(pool, await shareNow(), weighted)!;
          await step(async () => {
            // Only games not walked yet: a line end whose window names none is passed for its one request.
            const h = await harvestFrontier(f, s.cont, older, c, c.gatherGamesPerFrontier, walkedBy.get(f.key) ?? new Set());
            walked(f, h.walked);
            await keep(h.candidates, { lines: f.lines, names: f.names, games: reach.get(f.key) ?? h.games ?? null });
          });
          g.frontiers++;
          show();
          await host.refresh?.();
        }
        g.note = host.stopped() ? 'Stopped.' : `Pass ${pass} walked: games up to ${until}.`;
      }
      if (!host.stopped() && !g.note.startsWith('The store is full')) g.note = `Every pass walked, back to ${explorerUntil(host.now(), (ov.passes - 1) * c.overnightStepMonths)}.`;
      if (!host.stopped()) {
        ov.doing = 'scoring';
        show();
        await host.score();
      }
    }
  } catch (e) {
    g.note = e === GATHER_STOPPED ? 'Stopped.' : `The gather stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    g.running = false;
    show();
    await host.refresh?.();
    await host.share();
  }
  return snapshot();
}
