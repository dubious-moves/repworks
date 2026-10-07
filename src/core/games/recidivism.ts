// Recidivism (PLAN.md §5.59), a port of mistake-lab's `buildDrilledIndex`, `computeRecidivism` and
// `applyRecidReschedules` (`c525403`): a drilled item (a mistake or tactic card reviewed at least
// once, not dropped) met again in a later game with the user to move there. In a real game the
// verdict is `relapsed` when the game has any new mistake at that position (the extraction's own,
// before the repertoire filter and the advantages), else `fixed`; in a practice game from the
// history, by the move's classification (a mistake or blunder relapsed), and never graded. The
// gates: analysed games only, the user's side to move, not the item's own game, after the card's
// first review (or, for a card without one, its game's date: approximate), one encounter per item
// and game. A real game's relapse reschedules the card (an Again at the game's time), written once
// per card and game as a `relapse` event; replay holds the guards (never on a new card, never
// before its last review). Pure.
import type { PositionKey } from '../chess/positionKey.ts';
import type { GameItem } from './extract.ts';
import type { Classification } from './grade.ts';
import type { Ply } from './positions.ts';
import type { Color } from './record.ts';

export interface Drilled {
  pid: string;
  kind: 'mistake' | 'tactic';
  sourceGameId: string | null;
  /** Encounters must come after this (ms). */
  cutoff: number;
  /** The cutoff is the item's game's date, not its first review. */
  approx: boolean;
  /** The moves that count as the answer (a tactic's first moves): the bonus flag only. */
  expected: string[];
  /** The move played in the game (a mistake's). */
  origSan: string | null;
}

/** What the drilled index needs of a card: its reviews, its first review, whether it is dropped. */
export interface DrillState {
  reps: number;
  firstReview?: number;
  dropped: boolean;
}

/** `buildDrilledIndex`: the items reviewed at least once and not dropped, by position. */
export function drilledIndex(items: Iterable<GameItem & { key?: PositionKey }>, stateOf: (pid: string) => DrillState | undefined, gameTime: (gameId: string) => number | undefined, keyOf: (fen: string) => PositionKey | undefined): Map<PositionKey, Drilled[]> {
  const idx = new Map<PositionKey, Drilled[]>();
  for (const m of items) {
    if (m.kind !== 'mistake' && m.kind !== 'tactic') continue;
    const s = stateOf(m.pid);
    if (!s || !(s.reps >= 1) || s.dropped) continue;
    const key = m.kind === 'mistake' ? m.key : keyOf(m.fenBefore);
    if (!key) continue;
    let cutoff = s.firstReview ?? NaN;
    let approx = false;
    if (!Number.isFinite(cutoff)) {
      approx = true;
      cutoff = gameTime(m.gameId) ?? 0;
    }
    const expected: string[] = [];
    if (m.kind === 'tactic')
      for (const line of m.lines) {
        const first = line.find((t) => t.user) ?? line[0];
        if (first && !expected.includes(first.uci)) expected.push(first.uci);
      }
    let list = idx.get(key);
    if (!list) idx.set(key, (list = []));
    list.push({ pid: m.pid, kind: m.kind, sourceGameId: m.gameId || null, cutoff, approx, expected, origSan: m.kind === 'mistake' ? m.san : null });
  }
  return idx;
}

export interface Encounter {
  gameId: string;
  ts: number;
  source: 'game' | 'inapp';
  playedSan: string;
  playedUci: string;
  verdict: 'fixed' | 'relapsed';
  /** The same move as in the item's game, again. */
  sameMove: boolean;
  exactBest: boolean;
  approx: boolean;
}

export interface Summary {
  fixed: number;
  relapsed: number;
  inappFixed: number;
  inappRelapsed: number;
}

export interface RecidGame {
  id: string;
  createdAt: number;
  analysed: boolean;
  color: Color | undefined;
  plies: readonly Ply[];
}

export interface RecidPractice {
  id: string;
  ts: number;
  /** The start's key (the drill's own position, never an encounter). */
  seedKey: PositionKey;
  moves: readonly { keyBefore: PositionKey; san: string; uci: string; isUser: boolean; classification?: Classification; bestMoveUci?: string }[];
}

/**
 * `computeRecidivism`: every encounter by item, newest first, and the summary. `mistakesAt(game)`
 * is the game's extracted mistakes by position (their SAN).
 */
export function recidivism(drilled: ReadonlyMap<PositionKey, readonly Drilled[]>, games: readonly RecidGame[], mistakesAt: (gameId: string) => ReadonlyMap<PositionKey, string> | undefined, practice: readonly RecidPractice[]): { byPid: Map<string, Encounter[]>; summary: Summary } {
  const byPid = new Map<string, Encounter[]>();
  const summary: Summary = { fixed: 0, relapsed: 0, inappFixed: 0, inappRelapsed: 0 };
  if (!drilled.size) return { byPid, summary };
  const add = (pid: string, enc: Encounter) => {
    let list = byPid.get(pid);
    if (!list) byPid.set(pid, (list = []));
    list.push(enc);
    if (enc.source === 'game') summary[enc.verdict === 'relapsed' ? 'relapsed' : 'fixed']++;
    else summary[enc.verdict === 'relapsed' ? 'inappRelapsed' : 'inappFixed']++;
  };

  for (const g of games) {
    if (g.id.startsWith('_test_') || !g.analysed || !g.color) continue;
    const gm = mistakesAt(g.id);
    const seen = new Set<string>();
    for (const p of g.plies) {
      const entries = drilled.get(p.keyBefore);
      if (!entries) continue;
      if (p.turn !== g.color) continue;
      for (const e of entries) {
        if (e.sourceGameId === g.id) continue;
        if (g.createdAt <= e.cutoff) continue;
        if (seen.has(e.pid)) continue;
        seen.add(e.pid);
        const relapsed = !!gm?.has(p.keyBefore);
        const sameMove = relapsed && !!e.origSan && gm!.get(p.keyBefore) === e.origSan;
        const exactBest = !relapsed && e.expected.length > 0 && e.expected.includes(p.uci);
        add(e.pid, { gameId: g.id, ts: g.createdAt, source: 'game', playedSan: p.san, playedUci: p.uci, verdict: relapsed ? 'relapsed' : 'fixed', sameMove, exactBest, approx: e.approx });
      }
    }
  }

  for (const snap of practice) {
    const seen = new Set<string>();
    for (const mv of snap.moves) {
      if (!mv.isUser || mv.keyBefore === snap.seedKey) continue;
      const entries = drilled.get(mv.keyBefore);
      if (!entries) continue;
      for (const e of entries) {
        if (snap.ts <= e.cutoff) continue;
        if (seen.has(e.pid)) continue;
        if (!mv.classification) continue;
        seen.add(e.pid);
        const verdict = mv.classification === 'mistake' || mv.classification === 'blunder' ? 'relapsed' : 'fixed';
        const exactBest = e.expected.includes(mv.uci) || (!!mv.bestMoveUci && mv.uci === mv.bestMoveUci);
        add(e.pid, { gameId: snap.id, ts: snap.ts, source: 'inapp', playedSan: mv.san, playedUci: mv.uci, verdict, sameMove: false, exactBest, approx: e.approx });
      }
    }
  }
  for (const list of byPid.values()) list.sort((a, b) => b.ts - a.ts);
  return { byPid, summary };
}

/** The relapses to write (`applyRecidReschedules`): real games' relapses whose game this card hasn't recorded yet. */
export function relapsesToWrite(byPid: ReadonlyMap<string, readonly Encounter[]>, recorded: (pid: string) => ReadonlySet<string> | undefined): { pid: string; gameId: string; at: number }[] {
  const out: { pid: string; gameId: string; at: number }[] = [];
  for (const [pid, encs] of byPid) {
    const done = recorded(pid);
    for (const e of encs) if (e.verdict === 'relapsed' && e.source === 'game' && !done?.has(e.gameId)) out.push({ pid, gameId: e.gameId, at: e.ts });
  }
  return out;
}

/** The badge's counts (`recidBadgeHtml`): games fixed and relapsed, the same move repeated, practice's. */
export function badgeOf(encs: readonly Encounter[]): { fixed: number; relapsed: number; sameMove: boolean; inappFixed: number; inappRelapsed: number } {
  const b = { fixed: 0, relapsed: 0, sameMove: false, inappFixed: 0, inappRelapsed: 0 };
  for (const e of encs) {
    if (e.source === 'game') b[e.verdict === 'relapsed' ? 'relapsed' : 'fixed']++;
    else b[e.verdict === 'relapsed' ? 'inappRelapsed' : 'inappFixed']++;
    if (e.verdict === 'relapsed' && e.sameMove) b.sameMove = true;
  }
  return b;
}
