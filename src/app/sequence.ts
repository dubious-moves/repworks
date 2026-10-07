// A sequence saved from the analysis board (PLAN.md §5.56, mistake-lab's sequence conversion): the
// board opened on a mistake's position (`#/analysis?fen=…&seq=<pid>`) or on a practice game's key
// move (`seq=*`); the lines built there checked against Stockfish's lines at each position where
// the user moves (three lines, the game trainer's depth), then saved as a tactic (`saved`). Made
// from a mistake card, it replaces that card (`drop`), as mistake-lab's does.
import { gameCard } from '../core/progress/cards.ts';
import { moverScore, type MoverLine } from '../core/games/grade.ts';
import { sequenceItem, sequenceLines, sequenceSaved, validateSequence, type SequenceMove, type SequenceNote } from '../core/games/saved.ts';
import { positionOf } from '../core/storm/walk.ts';
import { makeFen } from 'chessops/fen';
import { startPosition } from '../core/study/tree.ts';
import type { Chapter } from '../core/study/model.ts';
import { gameDeck, savedDeck } from './games.ts';
import { recordEvent } from './state.ts';
import { analyseForStorm } from './stormEngine.ts';

/** The most positions checked; the rest are listed as unverified. */
const MAX_CHECKED = 12;

export interface SequenceCheck {
  startFen: string;
  color: 'white' | 'black';
  lines: SequenceMove[][];
  warnings: SequenceNote[];
  unverified: SequenceNote[];
  duplicate: boolean;
}

export type CheckResult = { ok: true; check: SequenceCheck } | { ok: false; error: string };

const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches;

/** The board's lines, checked by Stockfish; `progress` hears each position as it is asked. */
export async function checkSequence(c: Chapter, progress: (done: number, of: number) => void = () => undefined): Promise<CheckResult> {
  const start = startPosition(c);
  if (!start) return { ok: false, error: 'the board’s start position can’t be read' };
  const startFen = makeFen(start.toSetup());
  // The drill asks the first move: the start must be the user's move (mistake-lab's rule).
  const color = start.turn;
  const lines = sequenceLines(startFen, c.root, color);
  if (!lines.length) return { ok: false, error: 'Play the sequence on the board first: the lines you build become the drill (branches become its other lines).' };
  const fens = [...new Set(lines.flatMap((l) => l.filter((m) => m.user).map((m) => m.before)))];
  const pvs = new Map<string, MoverLine[]>();
  for (const [i, fen] of fens.slice(0, MAX_CHECKED).entries()) {
    progress(i, Math.min(fens.length, MAX_CHECKED));
    const pos = positionOf(fen);
    const a = await analyseForStorm(fen, 3, narrow() ? 16 : 18, 8000);
    if (pos && a) pvs.set(fen, a.lines.filter((l) => l.pv.length).map((l) => ({ move: l.pv[0]!, cp: moverScore(l.score, pos.turn) })));
  }
  const { warnings, unverified } = validateSequence(lines, (fen) => pvs.get(fen));
  return { ok: true, check: { startFen, color, lines, warnings, unverified, duplicate: sequenceSaved(savedDeck.value, startFen, lines[0]!) } };
}

/** The mistake card a sequence replaces, when the board was opened from one in the deck. */
export function sourceMistake(seq: string | undefined) {
  if (!seq || seq === '*') return undefined;
  const c = gameDeck.value.find((d) => d.item.pid === seq);
  return c?.item.kind === 'mistake' ? c.item : undefined;
}

/** Saves the checked sequence; from a mistake, that card is dropped. Returns the new card. */
export async function saveSequence(check: SequenceCheck, seq: string | undefined): Promise<string | undefined> {
  const source = sourceMistake(seq);
  const now = Date.now();
  const item = sequenceItem({ startFen: check.startFen, color: check.color, lines: check.lines, wpDrop: source?.wpDrop ?? 0, now, rand: Math.random().toString(36).slice(2, 7), ...(source ? { from: source.pid } : {}) });
  if (!item || sequenceSaved(savedDeck.value, check.startFen, check.lines[0]!)) return undefined;
  const t = new Date(now).toISOString();
  const card = gameCard(item.pid);
  await recordEvent({ t, k: 'saved', card, item: { ...item } });
  if (source) await recordEvent({ t, k: 'drop', card: gameCard(source.pid), on: true });
  return card;
}
