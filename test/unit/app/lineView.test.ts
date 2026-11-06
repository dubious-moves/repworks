// The engine's line on a board (PLAN.md §5.154, and the practice review's, §6): a refutation opened
// on the answer, the line after a move opened on the move, stepped and extended, and a search that
// lands after the line was put away dropped.
//
// Controls run (2026-11-06), each failing only the test named: `moveLine`'s plies as `plies` alone
// → "a refutation: the move and ten plies of the answer, opened on the answer"; `close` without
// `token++` → "a line put away before its search lands stays away".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineView, LINE_PLY, type LineSearch } from '../../../src/app/lineView.ts';
import { lineFen } from '../../../src/core/games/engineLine.ts';
import { fenAfterUci } from '../../../src/core/storm/walk.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Each side's knight out and back: some of these is legal in every position of these lines. */
const SHUFFLE = ['g1f3', 'f3g1', 'g8f6', 'f6g8'];
/** Twelve plies of the knights' shuffle from `fen`. */
function shuffle(fen: string): string[] {
  const out: string[] = [];
  let at = fen;
  for (let i = 0; i < 12; i++) {
    const uci = SHUFFLE.find((u) => fenAfterUci(at, u));
    if (!uci) break;
    out.push(uci);
    at = fenAfterUci(at, uci)!;
  }
  return out;
}

/** A search that answers each position with the knights' shuffle, and keeps what was asked. */
function fakeSearch(): { search: LineSearch; asked: string[] } {
  const asked: string[] = [];
  const search: LineSearch = async (fen) => {
    asked.push(fen);
    return { lines: [{ pv: shuffle(fen), score: { cp: 35 } }] };
  };
  return { search, asked };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('a refutation: the move and ten plies of the answer, opened on the answer', async () => {
  const f = fakeSearch();
  const v = lineView(f.search);
  v.showRefutation('card|1', START, 'e2e4', 'e4');
  assert.equal(v.view.peek()?.busy, true);
  await settle();
  const shown = v.view.peek()!;
  assert.equal(shown.kind, 'refutation');
  assert.equal(shown.busy, false);
  const line = shown.line!;
  assert.equal(line.moves.length, 1 + LINE_PLY);
  assert.equal(line.moves[0]!.san, 'e4');
  assert.equal(line.moves[0]!.isUser, true);
  assert.equal(line.moves[1]!.san, 'Nf6');
  assert.equal(line.currentIdx, 1);
  assert.equal(lineFen(line), fenAfterUci(fenAfterUci(START, 'e2e4')!, 'g8f6'));
  // The search was of the position after the move.
  assert.equal(f.asked[0], fenAfterUci(START, 'e2e4'));
});

test('the line after a move: the move and the line after it, opened on the move, stepped and extended', async () => {
  const f = fakeSearch();
  const v = lineView(f.search);
  v.showAfter('card|2', START, 'e2e4', 'e4');
  await settle();
  const line = v.view.peek()!.line!;
  assert.equal(v.view.peek()!.kind, 'after');
  assert.equal(line.moves.length, LINE_PLY);
  assert.equal(line.currentIdx, 0);
  v.step(1);
  assert.equal(v.view.peek()!.line!.currentIdx, 1);
  v.step(-2);
  assert.equal(v.view.peek()!.line!.currentIdx, -1);
  // Past the end, a search there adds to it, the board on the first new move.
  for (let i = 0; i < LINE_PLY + 1; i++) v.step(1);
  await settle();
  assert.equal(v.view.peek()!.line!.moves.length, LINE_PLY + 6);
  assert.equal(v.view.peek()!.line!.currentIdx, LINE_PLY);
  // Searched at the old end (prepared as the line opened), and at the new end ahead of the next step.
  const line2 = v.view.peek()!.line!;
  assert.ok(f.asked.includes(line2.moves[LINE_PLY - 1]!.fen));
  assert.equal(f.asked.at(-1), line2.moves.at(-1)!.fen);
});

test('a line put away before its search lands stays away', async () => {
  const f = fakeSearch();
  const v = lineView(f.search);
  v.showAfter('card|3', START, 'e2e4', 'e4');
  v.close();
  await settle();
  assert.equal(v.view.peek(), undefined);
  // A new one opened meanwhile isn't overwritten by the old search either.
  v.showRefutation('card|4', START, 'd2d4', 'd4');
  v.showAfter('card|5', START, 'e2e4', 'e4');
  await settle();
  assert.equal(v.view.peek()!.about, 'card|5');
  assert.equal(v.view.peek()!.line!.moves[0]!.san, 'e4');
});
