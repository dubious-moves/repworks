// The engine's search lifecycle (PLAN.md §5.30), as Qchess's study page runs it and Lichess's
// does: one `go` at a time; a new position sends `stop` and starts once the old search's
// `bestmove` has come; the lines of a stopped search are dropped; the lines shown never go to a
// lower depth; and what was found is kept per position, so coming back shows it at once and only
// searches on if it falls short. Pure: commands go out through `send`, the engine's lines come in
// through `receive`, and the clock is passed in.
import { parseBestmove, parseInfo, type Score } from './uci.ts';

export interface SearchRequest {
  /** The position, as a full FEN. */
  fen: string;
  /** Its key (D10), which the results are kept under. */
  key: string;
  turn: 'white' | 'black';
  /** Search to this depth... */
  depth: number;
  /** ...or for this long, in milliseconds, whichever comes first (Infinity: no limit). */
  movetime: number;
  /** Lines (MultiPV). */
  lines: number;
  /** The position's legal moves: no more lines than these can come. */
  legal: number;
  /** Past the depth and time: Qchess's "+", searching until stopped (depth 99). */
  deeper?: boolean;
}

export interface EngineLine {
  multipv: number;
  depth: number;
  /** From White's side. */
  score: Score;
  /** UCI, castling as e1g1. */
  pv: string[];
}

export interface Analysis {
  key: string;
  fen: string;
  /** The best line's depth (0 before any line). */
  depth: number;
  /** By MultiPV, the best first, as many as asked for (fewer when the position has fewer moves). */
  lines: EngineLine[];
  /** Nodes per second while a search runs; undefined when none runs for this position. */
  nps: number | undefined;
  /** Whether the depth or time asked for is reached (and no deeper search runs). */
  done: boolean;
  /** The engine found no move: mate or stalemate on the board. */
  noMove: boolean;
}

interface Entry {
  fen: string;
  lines: Map<number, EngineLine>;
  /** The longest search this position had, in milliseconds. */
  millis: number;
  noMove: boolean;
}

interface Active {
  req: SearchRequest;
  started: number;
}

export interface SearchOptions {
  send(command: string): void;
  now(): number;
  /** Called whenever what is shown for the wanted position changes. */
  onUpdate(analysis: Analysis): void;
  /** Positions kept (mistake-lab's 300). */
  cacheSize?: number;
}

export interface Search {
  /** Shows `req`'s position: what is known at once, then searches as far as it asks. */
  analyse(req: SearchRequest): void;
  /** Nothing is wanted any more: the search running is stopped. */
  stop(): void;
  /** A line from the engine. */
  receive(line: string): void;
  /** The engine was restarted: whatever ran is gone, and what was wanted starts again. */
  reset(): void;
  /** A `stop` sent, its `bestmove` not yet come (the platform's watchdog looks at this). */
  stopping(): boolean;
  /** What is shown for the wanted position. */
  current(): Analysis | undefined;
}

export function createSearch(o: SearchOptions): Search {
  const max = o.cacheSize ?? 300;
  const cache = new Map<string, Entry>();
  let wanted: SearchRequest | undefined;
  let active: Active | undefined;
  let stopSent = false;
  let pending: SearchRequest | undefined;
  let multipvSent = 1;
  let nps: number | undefined;

  const entryFor = (req: SearchRequest): Entry => {
    let e = cache.get(req.key);
    if (e) {
      // Most recently used last.
      cache.delete(req.key);
      cache.set(req.key, e);
      return e;
    }
    e = { fen: req.fen, lines: new Map(), millis: 0, noMove: false };
    cache.set(req.key, e);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return e;
  };

  const satisfies = (e: Entry, req: SearchRequest): boolean => {
    if (e.noMove) return true;
    if (req.deeper) return false;
    const timeUp = Number.isFinite(req.movetime) && e.millis >= req.movetime;
    for (let i = 1; i <= Math.min(req.lines, req.legal); i++) {
      const line = e.lines.get(i);
      if (!line || (line.depth < req.depth && !timeUp)) return false;
    }
    return true;
  };

  const analysisOf = (req: SearchRequest): Analysis => {
    const e = cache.get(req.key);
    const lines = e ? [...e.lines.values()].filter((l) => l.multipv <= req.lines).sort((a, b) => a.multipv - b.multipv) : [];
    const running = !!active && active.req.key === req.key && !stopSent;
    return {
      key: req.key,
      fen: req.fen,
      depth: lines[0]?.depth ?? 0,
      lines,
      nps: running ? nps : undefined,
      done: !running && !!e && satisfies(e, req),
      noMove: !!e?.noMove,
    };
  };

  const emit = () => {
    if (wanted) o.onUpdate(analysisOf(wanted));
  };

  const start = (req: SearchRequest) => {
    if (req.lines !== multipvSent) {
      o.send(`setoption name MultiPV value ${req.lines}`);
      multipvSent = req.lines;
    }
    o.send(`position fen ${req.fen}`);
    let go = `go depth ${req.deeper ? 99 : req.depth}`;
    if (!req.deeper && Number.isFinite(req.movetime)) go += ` movetime ${Math.round(req.movetime)}`;
    o.send(go);
    active = { req, started: o.now() };
    stopSent = false;
    nps = undefined;
    entryFor(req);
  };

  const halt = () => {
    if (active && !stopSent) {
      stopSent = true;
      o.send('stop');
    }
  };

  return {
    analyse(req) {
      wanted = req;
      const e = cache.get(req.key);
      if (e && satisfies(e, req)) {
        pending = undefined;
        halt();
        emit();
        return;
      }
      pending = req;
      if (active) halt();
      else {
        pending = undefined;
        start(req);
      }
      emit();
    },

    stop() {
      wanted = undefined;
      pending = undefined;
      halt();
    },

    receive(line) {
      const best = parseBestmove(line);
      if (best !== undefined) {
        const finished = active;
        const stopped = stopSent;
        active = undefined;
        stopSent = false;
        nps = undefined;
        if (finished) {
          const e = entryFor(finished.req);
          e.millis = Math.max(e.millis, o.now() - finished.started);
          if (best === null && !stopped) e.noMove = true;
        }
        if (pending) {
          const next = pending;
          pending = undefined;
          start(next);
        }
        emit();
        return;
      }
      if (!active || stopSent) return;
      const info = parseInfo(line, active.req.turn);
      if (!info) return;
      if (info.nps !== undefined) nps = info.nps;
      if (info.bound || !info.pv.length) return;
      const e = entryFor(active.req);
      const prev = e.lines.get(info.multipv);
      // Never a shallower line in place of a deeper one (a deeper search going over a warm hash).
      if (prev && prev.depth > info.depth) return;
      e.lines.set(info.multipv, { multipv: info.multipv, depth: info.depth, score: info.score, pv: info.pv });
      if (wanted?.key === active.req.key) emit();
    },

    reset() {
      active = undefined;
      stopSent = false;
      multipvSent = 1;
      nps = undefined;
      const next = pending ?? wanted;
      pending = undefined;
      if (next && !(cache.get(next.key) && satisfies(cache.get(next.key)!, next))) start(next);
      emit();
    },

    stopping: () => stopSent,
    current: () => (wanted ? analysisOf(wanted) : undefined),
  };
}
