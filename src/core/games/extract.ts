// Mistakes, tactics and advantages found in a game (PLAN.md §5.52): a port of mistake-lab's
// `extractMistakesForGame` and the advantage pass of its `extractAllMistakes` (`c525403`), with
// its numbers. Each item keeps mistake-lab's pid, so a card means the same game move here and
// there. Pure.
import type { PositionKey } from '../chess/positionKey.ts';
import { replay } from './positions.ts';
import type { Color, Eval, GameRecord, TacticMove } from './record.ts';

/** mistake-lab's `MISTAKES_CACHE_PARAMS`; a change re-extracts (the version goes with the items). */
export const EXTRACTION = { version: 1, wpDropThreshold: 10, advantageThreshold: 300, advantageMinMoves: 2, advantageFromPly: 16 } as const;

export const winPct = (cp: number) => 100 / (1 + Math.pow(10, -cp / 400));

/** mistake-lab's `evalToCp`: centipawns for `color`, a mate as ±10,000. */
export function cpFor(e: Eval | null | undefined, color: Color): number {
  if (!e) return 0;
  const cp = 'cp' in e ? e.cp : e.mate > 0 ? 10000 : -10000;
  return color === 'white' ? cp : -cp;
}

interface ItemBase {
  pid: string;
  gameId: string;
  /** The ply of the move asked (1-based). */
  ply: number;
  fenBefore: string;
  color: Color;
}
export interface MistakeItem extends ItemBase {
  kind: 'mistake';
  key: PositionKey;
  san: string;
  uci: string;
  cpBefore: number;
  cpAfter: number;
  cpLoss: number;
  wpDrop: number;
  /** Seconds left after the move, and spent on it, when the game has clocks. */
  clock?: number;
  moveTime?: number;
  timeTrouble: boolean;
}
export interface TacticItem extends ItemBase {
  kind: 'tactic';
  lines: TacticMove[][];
  wpSwing: number;
  /** For sorting, as mistake-lab's: the swing's size. */
  wpDrop: number;
  found: boolean;
}
export interface AdvantageItem extends ItemBase {
  kind: 'advantage';
  peakCp: number;
  /** For sorting, as mistake-lab's: the advantage's win% over 50. */
  wpDrop: number;
  /** The mistakes from its ply on, which it stands for while it is in the deck. */
  replaces: string[];
}
export type GameItem = MistakeItem | TacticItem | AdvantageItem;

export const mistakePid = (gameId: string, ply: number) => `${gameId}_${ply}`;
export const tacticPid = (gameId: string, ply: number) => `${gameId}_t${ply}`;
export const advantagePid = (gameId: string, ply: number) => `${gameId}_a${ply}`;

export interface Extraction {
  items: GameItem[];
  /** Why the advantage found was not kept, when one was found and dropped. */
  advantageSkipped?: 'won' | 'time-loss' | 'time-trouble';
  /** The ply a move wouldn't replay at, when one didn't. */
  stopped?: number;
}

/**
 * A game's items. `isRepertoireMove(key, uci)` leaves out a mistake that is the repertoire's own
 * move there (mistake-lab's "deliberate prep" rule).
 */
export function extractGame(game: GameRecord, isRepertoireMove: (key: PositionKey, uci: string) => boolean = () => false): Extraction {
  const played = replay(game);
  if (!played) return { items: [] };
  const evals = game.evals ?? [];
  const color = game.color;
  const mistakes: MistakeItem[] = [];
  const peaks: { cp: number; fen: string; ply: number }[] = [];
  let above = 0;
  let held = false;

  for (const p of played.plies) {
    const i = p.ply - 1;
    if (i >= evals.length) continue;
    if (p.turn !== color) continue;
    const before = i > 0 ? evals[i - 1] : null;
    const after = evals[i];
    if (!before || !after) continue;
    const cpBefore = cpFor(before, color);
    const cpAfter = cpFor(after, color);
    const wpDrop = winPct(cpBefore) - winPct(cpAfter);
    if (wpDrop > EXTRACTION.wpDropThreshold && !isRepertoireMove(p.keyBefore, p.uci)) {
      const m: MistakeItem = {
        kind: 'mistake',
        pid: mistakePid(game.id, p.ply),
        gameId: game.id,
        ply: p.ply,
        fenBefore: p.fenBefore,
        key: p.keyBefore,
        color,
        san: p.san,
        uci: p.uci,
        cpBefore: Math.round(cpBefore),
        cpAfter: Math.round(cpAfter),
        cpLoss: Math.round(cpBefore - cpAfter),
        wpDrop: Math.round(wpDrop * 10) / 10,
        timeTrouble: false,
      };
      const clocks = game.clocks;
      if (clocks && clocks.length > i && clocks[i] != null) {
        m.clock = clocks[i]!;
        const earlier = i >= 2 ? clocks[i - 2] : null;
        if (earlier != null) m.moveTime = Math.max(0, Math.round((earlier - m.clock) * 10) / 10);
        m.timeTrouble = m.clock < 45 && m.moveTime !== undefined && m.moveTime < 10;
      }
      mistakes.push(m);
    }
    // The advantage held (from ply 16): two of the user's moves running at +300, and every
    // such position after, even once it dips (mistake-lab's `heldAdvantage` stays set).
    if (p.ply >= EXTRACTION.advantageFromPly) {
      if (cpBefore >= EXTRACTION.advantageThreshold) {
        above++;
        if (above >= EXTRACTION.advantageMinMoves) held = true;
        if (held) peaks.push({ cp: cpBefore, fen: p.fenBefore, ply: p.ply });
      } else above = 0;
    }
  }

  const tactics: TacticItem[] = [];
  const tacticPlies = new Set<number>();
  for (const t of game.tactics ?? []) {
    const main = t.lines[0] ?? [];
    if (main.length < 3 || main.filter((m) => m.user).length < 2) continue;
    for (let k = 0; k <= main.length; k++) tacticPlies.add(t.startPly + k);
    tactics.push({ kind: 'tactic', pid: tacticPid(game.id, t.startPly), gameId: game.id, ply: t.startPly, fenBefore: t.fenBefore, color: t.color, lines: t.lines, wpSwing: t.wpSwing, wpDrop: Math.abs(t.wpSwing), found: t.found });
  }

  const out: Extraction = { items: [...mistakes, ...tactics] };
  if (played.stopped) out.stopped = played.stopped.ply;
  // The highest peak outside a tactic (a stable sort, as mistake-lab's).
  const peak = [...peaks].sort((a, b) => b.cp - a.cp).find((x) => !tacticPlies.has(x.ply));
  if (!peak) return out;
  if (game.winner === color) return { ...out, advantageSkipped: 'won' };
  if (game.status === 'outoftime' && evals.length > 0 && cpFor(evals[evals.length - 1], color) >= 0) return { ...out, advantageSkipped: 'time-loss' };
  if (mistakes.some((m) => m.ply >= peak.ply && m.timeTrouble && m.cpAfter < 100)) return { ...out, advantageSkipped: 'time-trouble' };
  out.items.push({
    kind: 'advantage',
    pid: advantagePid(game.id, peak.ply),
    gameId: game.id,
    ply: peak.ply,
    fenBefore: peak.fen,
    color,
    peakCp: peak.cp,
    wpDrop: Math.round(winPct(peak.cp) - 50),
    replaces: mistakes.filter((m) => m.ply >= peak.ply).map((m) => m.pid),
  });
  return out;
}

/**
 * The items a deck shows of one game: an advantage in the deck stands for the mistakes it
 * replaces; dropped, it gives them back (mistake-lab skips an invalidated advantage before
 * replacing anything).
 */
export function shownItems(items: readonly GameItem[], dropped: (pid: string) => boolean): GameItem[] {
  const replaced = new Set<string>();
  for (const it of items) if (it.kind === 'advantage' && !dropped(it.pid)) for (const pid of it.replaces) replaced.add(pid);
  return items.filter((it) => !dropped(it.pid) && !replaced.has(it.pid));
}
