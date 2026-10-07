// Saved items (PLAN.md §5.56): practice items made on the site, which no game holds, so each
// `saved` event carries its item. Two kinds, mistake-lab's (`c525403`):
// - a sequence: a mistake made into a multi-move drill on the analysis board (its SEQUENCE
//   CONVERSION: the tree's first-child chain the main line, every other root-to-leaf path an
//   alternative; each user move checked against the engine's lines within 5 points of win%,
//   `validateSequenceLines`; deduplicated by the start and the main line, `_chainSig`);
// - a practice mistake: a move given up more than 2 points in a practice game's review
//   (`savePracticeMistake`, deduplicated by the position and the move).
// Pure: the time and the random part of an id come in.
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { keyFen } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { gameCard } from '../progress/cards.ts';
import type { RootNode, MoveNode } from '../study/model.ts';
import type { DeviceEvent } from '../progress/replay.ts';
import { winPct, type MistakeItem, type TacticItem } from './extract.ts';
import type { MoverLine } from './grade.ts';
import type { Color, TacticMove } from './record.ts';

/** mistake-lab's `SEQ_ALT_WP_THRESHOLD`: a move within this much win% of the best is as good. */
export const SEQ_ALT_WP = 5;
/** A practice mistake is worth saving past this much win% (`savePracticeMistake`'s `wpDrop <= 2`). */
export const PRACTICE_MISTAKE_WP = 2;

export type SavedItem = MistakeItem | TacticItem;

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

/** A `saved` event's item, checked; undefined when it isn't one this code can drill. */
export function readSavedItem(o: unknown): SavedItem | undefined {
  if (!isObj(o)) return undefined;
  const pid = str(o['pid']);
  const gameId = str(o['gameId']);
  const ply = num(o['ply']);
  const fenBefore = str(o['fenBefore']);
  const color = o['color'];
  if (!pid || !gameId || ply === undefined || !fenBefore || (color !== 'white' && color !== 'black')) return undefined;
  const k = keyFen(fenBefore);
  if (!k) return undefined;
  const extra: { savedAt?: number; from?: string } = {};
  if (num(o['savedAt']) !== undefined) extra.savedAt = num(o['savedAt'])!;
  if (str(o['from'])) extra.from = str(o['from'])!;
  if (o['kind'] === 'mistake') {
    const san = str(o['san']);
    const uci = str(o['uci']);
    if (!san || !uci || !UCI.test(uci)) return undefined;
    const item: MistakeItem = {
      kind: 'mistake',
      pid,
      gameId,
      ply,
      fenBefore,
      key: k.key,
      color,
      san,
      uci,
      cpBefore: num(o['cpBefore']) ?? 0,
      cpAfter: num(o['cpAfter']) ?? 0,
      cpLoss: num(o['cpLoss']) ?? 0,
      wpDrop: num(o['wpDrop']) ?? 0,
      timeTrouble: o['timeTrouble'] === true,
      ...extra,
    };
    return item;
  }
  if (o['kind'] === 'tactic') {
    if (!Array.isArray(o['lines'])) return undefined;
    const lines: TacticMove[][] = [];
    for (const l of o['lines']) {
      if (!Array.isArray(l) || !l.length) return undefined;
      const line: TacticMove[] = [];
      for (const m of l) {
        if (!isObj(m) || typeof m['uci'] !== 'string' || !UCI.test(m['uci']) || typeof m['user'] !== 'boolean') return undefined;
        const mv: TacticMove = { uci: m['uci'], san: typeof m['san'] === 'string' ? m['san'] : '', user: m['user'] };
        if (m['source'] === 'maia') mv.source = 'maia';
        line.push(mv);
      }
      lines.push(line);
    }
    if (!lines.length || !lines[0]![0]!.user) return undefined;
    const wpSwing = num(o['wpSwing']) ?? 0;
    const item: TacticItem = { kind: 'tactic', pid, gameId, ply, fenBefore, color, lines, wpSwing, wpDrop: num(o['wpDrop']) ?? Math.abs(wpSwing), found: o['found'] === true, ...extra };
    if (o['sequence'] === true) item.sequence = true;
    return item;
  }
  return undefined;
}

/**
 * Every saved item, from the cards' events: a card's latest `saved` event holds it, and it must
 * name its own card (`m|<pid>`). Oldest first, by when it was saved.
 */
export function savedItems(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): SavedItem[] {
  const out: { at: number; item: SavedItem }[] = [];
  for (const card of cards) {
    if (!card.startsWith('m|')) continue;
    let last: DeviceEvent | undefined;
    for (const e of eventsOf(card)) if (e.event?.k === 'saved') last = e;
    if (!last || last.event?.k !== 'saved') continue;
    const item = readSavedItem(last.event.item);
    if (item && gameCard(item.pid) === card) out.push({ at: last.t, item });
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.item);
}

/* ------------------------------------------------------------------ sequences */

/** A move of a sequence's line, with where it was played from (for the checks and their links). */
export interface SequenceMove extends TacticMove {
  /** The position it was played from. */
  before: string;
  /** Its path in the tree (SANs from the start), so a warning can show it. */
  path: string[];
}

function positionFrom(fen: string): Position | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : undefined;
}

/**
 * The tree's lines (mistake-lab's `analysisTreeToSequenceLines`): the first-child chain first,
 * then every other root-to-leaf path, depth first. A move is the user's where `color` is to move.
 */
export function sequenceLines(startFen: string, root: RootNode, color: Color): SequenceMove[][] {
  const start = positionFrom(startFen);
  if (!start) return [];
  const lines: SequenceMove[][] = [];
  const walk = (pos: Position, children: readonly MoveNode[], line: SequenceMove[]) => {
    const kids: { node: MoveNode; next: Position; mv: SequenceMove }[] = [];
    const before = makeFen(pos.toSetup());
    for (const node of children) {
      const move = parseSan(pos, node.san);
      if (!move || !isNormal(move)) continue;
      const next = pos.clone();
      const uci = standardUci(pos, move);
      next.play(move);
      kids.push({ node, next, mv: { uci, san: node.san, user: pos.turn === color, before, path: [...(line[line.length - 1]?.path ?? []), node.san] } });
    }
    if (!kids.length) {
      if (line.length) lines.push(line);
      return;
    }
    for (const k of kids) walk(k.next, k.node.children, [...line, k.mv]);
  };
  walk(start, root.children, []);
  return lines;
}

export const chainSig = (line: readonly { uci: string }[]) => line.map((m) => m.uci).join(',');

export interface SequenceNote {
  /**
   * `outside` a covered move not among the engine's lines, `loses` one more than 5 points worse,
   * `uncovered` an engine move as good that no line has; `unchecked` a move, `single` a position,
   * the engine couldn't verify.
   */
  kind: 'outside' | 'loses' | 'uncovered' | 'unchecked' | 'single';
  /** The move named. */
  san: string;
  /** The tree path to show: after a flagged move, or the position for an uncovered alternative. */
  path: string[];
  text: string;
}

const moveLabel = (fen: string, san: string) => {
  const [, turn, , , , n] = fen.split(' ');
  return `${n ?? '1'}${turn === 'w' ? '.' : '...'} ${san}`;
};
const posLabel = (fen: string) => {
  const [, turn, , , , n] = fen.split(' ');
  return `At move ${n ?? '1'}${turn === 'w' ? '' : '…'}`;
};
function sanOf(fen: string, uci: string): string {
  const pos = positionFrom(fen);
  const move = pos && parseUciMove(pos, uci);
  return pos && move ? makeSan(pos, move) : uci;
}

/**
 * mistake-lab's `validateSequenceLines`: at every position where the user moves, (a) each move
 * the lines cover that gives up more than 5 points of win% against the engine's best, or isn't
 * among its lines, is a warning; (b) each engine move within 5 points that no line covers is a
 * warning (the drill would call it wrong). A position the engine has no lines for is unverified,
 * as is one with a single line (near-equal moves unknown).
 */
export function validateSequence(lines: readonly (readonly SequenceMove[])[], linesAt: (fen: string) => readonly MoverLine[] | undefined): { warnings: SequenceNote[]; unverified: SequenceNote[] } {
  const warnings: SequenceNote[] = [];
  const unverified: SequenceNote[] = [];
  const positions = new Map<string, Map<string, SequenceMove>>();
  for (const line of lines)
    for (const mv of line) {
      if (!mv.user) continue;
      let covered = positions.get(mv.before);
      if (!covered) positions.set(mv.before, (covered = new Map()));
      if (!covered.has(mv.uci)) covered.set(mv.uci, mv);
    }
  for (const [fen, covered] of positions) {
    const at = [...covered.values()][0]!.path.slice(0, -1);
    const pvs = linesAt(fen);
    if (!pvs || !pvs.length) {
      for (const mv of covered.values()) unverified.push({ kind: 'unchecked', san: mv.san, path: mv.path, text: moveLabel(fen, mv.san) });
      continue;
    }
    const best = pvs[0]!;
    const bestWp = winPct(best.cp);
    const bestSan = sanOf(fen, best.move);
    for (const mv of covered.values()) {
      const hit = pvs.find((p) => p.move === mv.uci);
      if (!hit) {
        if (mv.uci !== best.move) warnings.push({ kind: 'outside', san: mv.san, path: mv.path, text: `${moveLabel(fen, mv.san)} isn’t among the engine’s top ${pvs.length} moves (best: ${bestSan})` });
        continue;
      }
      const drop = bestWp - winPct(hit.cp);
      if (drop > SEQ_ALT_WP) warnings.push({ kind: 'loses', san: mv.san, path: mv.path, text: `${moveLabel(fen, mv.san)} gives up ${drop.toFixed(1)}% against the best, ${bestSan}` });
    }
    for (const pv of pvs) {
      const gap = bestWp - winPct(pv.cp);
      if (gap <= SEQ_ALT_WP && !covered.has(pv.move)) warnings.push({ kind: 'uncovered', san: sanOf(fen, pv.move), path: at, text: `${posLabel(fen)}: ${sanOf(fen, pv.move)} is as good (−${gap.toFixed(1)}%) but no line has it: the drill would call it wrong` });
    }
    if (pvs.length < 2) unverified.push({ kind: 'single', san: '', path: at, text: `${posLabel(fen)} (one engine line only: moves as good unknown)` });
  }
  return { warnings, unverified };
}

/** mistake-lab's ply of a saved item: the plies before the position, from its move number. */
const plyBefore = (fen: string) => {
  const [, turn, , , , n] = fen.split(' ');
  return ((Number(n) || 1) - 1) * 2 + (turn === 'b' ? 1 : 0);
};

const strip = (line: readonly SequenceMove[]): TacticMove[] => line.map((m) => ({ uci: m.uci, san: m.san, user: m.user }));

/** A sequence's item (`confirmSaveSequence`'s record): a tactic, its main line the first. */
export function sequenceItem(a: { startFen: string; color: Color; lines: readonly (readonly SequenceMove[])[]; wpDrop: number; now: number; rand: string; from?: string }): TacticItem | undefined {
  if (!a.lines.length || !a.lines[0]![0]?.user) return undefined;
  const gameId = `_practice_tactic_${a.now}_${a.rand}`;
  const before = plyBefore(a.startFen);
  const wp = Math.abs(a.wpDrop);
  const item: TacticItem = { kind: 'tactic', pid: `${gameId}_t${before}`, gameId, ply: before + 1, fenBefore: a.startFen, color: a.color, lines: a.lines.map(strip), wpSwing: wp, wpDrop: wp, found: false, sequence: true, savedAt: a.now };
  if (a.from) item.from = a.from;
  return item;
}

/** Whether a sequence with the same start and main line is already saved. */
export const sequenceSaved = (saved: readonly SavedItem[], startFen: string, main: readonly { uci: string }[]) => saved.some((s) => s.kind === 'tactic' && s.fenBefore === startFen && chainSig(s.lines[0]!) === chainSig(main));

/** A move of a practice game as its review judged it. */
export interface JudgedMove {
  fenBefore: string;
  san: string;
  uci: string;
  wpDrop: number;
  cpLoss: number;
  /** The best line's score before the move, for the mover. */
  bestCp: number;
}

/** A practice mistake's item (`savePracticeMistake`): only past 2 points of win%. */
export function practiceMistakeItem(a: { move: JudgedMove; color: Color; now: number; from?: string }): MistakeItem | undefined {
  const m = a.move;
  if (!(m.wpDrop > PRACTICE_MISTAKE_WP)) return undefined;
  const k = keyFen(m.fenBefore);
  if (!k) return undefined;
  const gameId = `_practice_${a.now}`;
  const before = plyBefore(m.fenBefore);
  const item: MistakeItem = {
    kind: 'mistake',
    pid: `${gameId}_${before}`,
    gameId,
    ply: before + 1,
    fenBefore: m.fenBefore,
    key: k.key,
    color: a.color,
    san: m.san,
    uci: m.uci,
    cpBefore: Math.round(m.bestCp),
    cpAfter: Math.round(m.bestCp - m.cpLoss),
    cpLoss: Math.round(m.cpLoss),
    wpDrop: m.wpDrop,
    timeTrouble: false,
    savedAt: a.now,
  };
  if (a.from) item.from = a.from;
  return item;
}

/** Whether the same move from the same position is already saved. */
export const practiceMistakeSaved = (saved: readonly SavedItem[], fenBefore: string, san: string) => saved.some((s) => s.kind === 'mistake' && s.fenBefore === fenBefore && s.san === san);
