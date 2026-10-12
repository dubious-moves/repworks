// Kinds of storm position and the focus (PLAN.md §5.100): a move's facts, the good moves a list
// names, Maia's expected loss, each tag, the focus's groups, the easy positions, and the gather's
// kinds (punish past an opponent's error, hold, convert, the hard only move).
//
// Controls run on this file (2026-10-12), each failing exactly the named assertions:
// - `goodMoves` not refusing a list whose last line is good → "the good moves";
// - the situations let into a focus with none of them chosen → "the focus";
// - the punish step left out of the walk → "the walk keeps the position an opponent's error left".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import type { ScoredList, ScoredMove } from '../../../../src/core/storm/grade.ts';
import { storedPosition } from '../../../../src/core/storm/harvest.ts';
import { cleanFocus, easyAt, tooEasyAt, expectedLoss, focusTitle, goodMoves, matchesFocus, moveFacts, positionTags, tagWords, type Focus } from '../../../../src/core/storm/kinds.ts';
import type { MaiaRating } from '../../../../src/core/storm/maia.ts';
import { candidate, fenAfterUci, kept, positionOf, sanToUci, specialKind, START_FEN, walkGame } from '../../../../src/core/storm/walk.ts';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';

const play = (sans: string[], from = START_FEN) => sans.reduce((fen, san) => fenAfterUci(fen, sanToUci(positionOf(fen)!, san)!)!, from);
/** 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6: White to move, Ba4 a retreat, Bxc6 a capture. */
const RUY = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
const sf = (moves: ScoredMove[], depth = 20): ScoredList => Object.assign(moves.slice(), { source: 'sf' as const, depth });
const rating = (elo: number, moves: [string, number][]): MaiaRating => ({ elo, moves });
const rest = (score: number): ScoredMove[] => ['d2d3', 'h2h3', 'a2a3', 'b2b3'].map((uci, i) => ({ uci, score: score - i * 10 }));

test('a move’s facts: capture, check, promotion, retreat, pawn contact; castling and en passant', () => {
  const ruy = positionOf(RUY)!;
  assert.deepEqual(moveFacts(ruy, 'b5a4'), { capture: false, check: false, promotion: false, retreat: true, contact: false });
  assert.equal(moveFacts(ruy, 'b5c6')!.capture, true);
  assert.equal(moveFacts(ruy, 'b5c6')!.retreat, false);
  assert.equal(moveFacts(ruy, 'e1g1')!.capture, false);
  assert.equal(moveFacts(ruy, 'e1g1')!.retreat, false);
  assert.equal(moveFacts(ruy, 'a1a8'), null);
  // Black's retreat goes up the board.
  const black = positionOf(play(['e4', 'Nf6', 'e5']))!;
  assert.equal(moveFacts(black, 'f6g8')!.retreat, true);
  assert.equal(moveFacts(black, 'f6d5')!.retreat, false);
  // d4 touches e5's pawn (and e5's touches d4): a break; d3 touches nothing.
  const closed = positionOf(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'd6']))!;
  assert.equal(moveFacts(closed, 'd2d4')!.contact, true);
  assert.equal(moveFacts(closed, 'd2d3')!.contact, false);
  assert.equal(moveFacts(positionOf(play(['e4', 'd5']))!, 'f1b5')!.check, true);
  const ep = play(['e4', 'a6', 'e5', 'd5']);
  assert.equal(moveFacts(positionOf(ep)!, 'e5d6')!.capture, true);
  assert.equal(moveFacts(positionOf('8/P7/8/8/8/8/8/k6K w - - 0 1')!, 'a7a8q')!.promotion, true);
});

test('the good moves: great or good by a list that may judge and names them all', () => {
  const list = sf([{ uci: 'b5a4', score: 0 }, { uci: 'b5e2', score: -40 }, ...rest(-150)]);
  assert.deepEqual(goodMoves(list, C), ['b5a4', 'b5e2']);
  // Its last line good too: a good move may lie outside it.
  assert.equal(goodMoves(sf([{ uci: 'b5a4', score: 0 }, ...rest(-10)]), C), null);
  assert.equal(goodMoves(sf([{ uci: 'b5a4', score: 0 }, ...rest(-150)], 14), C), null);
  assert.equal(goodMoves(Object.assign([{ uci: 'b5a4', score: 0 }, ...rest(-150)], { source: 'cdb' as const }), C), null);
});

test('the move’s tags: only move, quiet, retreat, pawn break, don’t take', () => {
  const tags = (moves: ScoredMove[], maia?: MaiaRating[], fen = RUY) => [...positionTags({ fen, ...(maia ? { maia } : {}) }, sf(moves), 1500, C)].sort();
  assert.deepEqual(tags([{ uci: 'b5a4', score: 0 }, ...rest(-150)]), ['only', 'quiet', 'retreat']);
  assert.deepEqual(tags([{ uci: 'b5a4', score: 0 }, { uci: 'b5e2', score: -40 }, ...rest(-150)]), ['quiet', 'retreat']);
  assert.deepEqual(tags([{ uci: 'b5a4', score: 0 }, { uci: 'b5c6', score: -10 }, ...rest(-150)]), []);
  // The capture in the top three, not good: don't take it.
  assert.deepEqual(tags([{ uci: 'b5a4', score: 0 }, { uci: 'b5c6', score: -150 }, ...rest(-160)]), ['notake', 'only', 'quiet', 'retreat']);
  // With Maia rated at the user's rating, its likelihood on captures decides instead.
  assert.ok(tags([{ uci: 'b5a4', score: 0 }, ...rest(-150)], [rating(1500, [['b5c6', 0.4], ['b5a4', 0.6]])]).includes('notake'));
  assert.ok(!tags([{ uci: 'b5a4', score: 0 }, { uci: 'b5c6', score: -150 }, ...rest(-160)], [rating(1500, [['b5a4', 0.9], ['b5c6', 0.1]])]).includes('notake'));
  const closed = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'd6']);
  assert.deepEqual(tags([{ uci: 'd2d4', score: 0 }, ...rest(-150)], undefined, closed), ['break', 'only', 'quiet']);
  // A hard only move kept by the gather is one, whatever its list.
  assert.ok(positionTags({ fen: RUY, kind: 'only' }, sf([{ uci: 'b5a4', score: 0 }, ...rest(-10)], 14), 1500, C).has('only'));
});

test('Maia’s expected loss, and the tags hard for you: unintuitive, critical, level up, your level', () => {
  const list = sf([{ uci: 'b5a4', score: 0 }, { uci: 'b5c6', score: -200 }, ...rest(-210)]);
  const lost = expectedLoss(rating(1500, [['b5c6', 0.6], ['b5a4', 0.4]]), list, C)!;
  assert.ok(lost > 10 && lost < 11, String(lost));
  // A move outside the list is no better than its last line.
  assert.ok(expectedLoss(rating(1500, [['g2g3', 1]]), list, C)! > 17);
  assert.equal(expectedLoss(rating(1500, [['b5a4', 0.3]]), list, C), null);
  assert.equal(expectedLoss(rating(1500, [['b5a4', 1]]), sf([...list], 14), C), null);
  const maia = [
    rating(1000, [['b5c6', 0.9], ['b5a4', 0.1]]),
    rating(1400, [['b5c6', 0.7], ['b5a4', 0.3]]),
    rating(1500, [['b5c6', 0.7], ['b5a4', 0.3]]),
    rating(1800, [['b5a4', 0.8], ['b5c6', 0.2]]),
  ];
  const t = positionTags({ fen: RUY, maia }, list, 1500, C);
  for (const f of ['unintuitive', 'critical', 'levelup', 'level'] as Focus[]) assert.ok(t.has(f), f);
  // Maia at the user's rating finding it: none of them; easy.
  const finds = maia.map((r) => (r.elo === 1500 ? rating(1500, [['b5a4', 0.9], ['b5c6', 0.1]]) : r));
  const u = positionTags({ fen: RUY, maia: finds }, list, 1500, C);
  for (const f of ['unintuitive', 'critical', 'levelup'] as Focus[]) assert.ok(!u.has(f), f);
  assert.equal(easyAt(finds, 1500, list, C), true);
  assert.equal(easyAt(maia, 1500, list, C), false);
  assert.equal(easyAt(undefined, 1500, list, C), false);
  // Too easy (§5.105): 90% is easy, not too easy; 96% is.
  assert.equal(tooEasyAt(finds, 1500, list, C), false);
  const always = maia.map((r) => (r.elo === 1500 ? rating(1500, [['b5a4', 0.96], ['b5c6', 0.04]]) : r));
  assert.equal(tooEasyAt(always, 1500, list, C), true);
  assert.equal(easyAt(always, 1500, list, C), true);
  // Unrated at the user's rating: nothing from Maia.
  assert.equal(positionTags({ fen: RUY, maia }, list, 1600, C).has('critical'), false);
});

test('the focus: none is the classic storm; any chip of a group, every group chosen; situations only when asked', () => {
  const k = (...f: Focus[]) => new Set<Focus>(f);
  assert.equal(matchesFocus(k('quiet'), undefined, []), true);
  assert.equal(matchesFocus(k('only'), 'only', []), false);
  assert.equal(matchesFocus(k('punish'), 'punish', []), false);
  assert.equal(matchesFocus(k('quiet'), undefined, ['quiet']), true);
  assert.equal(matchesFocus(k('quiet', 'only'), 'only', ['quiet']), true);
  assert.equal(matchesFocus(k('quiet', 'punish'), 'punish', ['quiet']), false);
  assert.equal(matchesFocus(k('retreat'), undefined, ['quiet', 'retreat']), true);
  assert.equal(matchesFocus(k('quiet'), undefined, ['quiet', 'unintuitive']), false);
  assert.equal(matchesFocus(k('quiet', 'unintuitive'), undefined, ['quiet', 'unintuitive']), true);
  assert.equal(matchesFocus(k('punish'), 'punish', ['punish']), true);
  assert.equal(matchesFocus(k('punish'), 'punish', ['punish', 'quiet']), false);
  assert.equal(matchesFocus(k('hold'), 'hold', ['punish', 'hold']), true);
  assert.equal(matchesFocus(k(), undefined, ['punish']), false);
  assert.deepEqual(cleanFocus(['retreat', 'nonsense', 'unintuitive', 3]), ['unintuitive', 'retreat']);
  assert.deepEqual(cleanFocus('quiet'), []);
  assert.equal(focusTitle(['quiet', 'retreat']), 'Quiet + Retreat');
  assert.equal(tagWords(k('punish', 'only', 'quiet')), 'Only move · Quiet · Punish');
});

test('the gather’s kinds: hold, convert, the hard only move, punish; never a forced recapture', () => {
  const base = { nScored: 8, inCheck: false, recapture: false, spread2: 20 };
  const list = (best: number, gaps: number[]) => sf([0, ...gaps].map((g, i) => ({ uci: `a${i}`, score: best - g })));
  const kind = (evalUser: number, gaps: number[], over: Partial<typeof base> = {}, afterError = false) => specialKind({ ...base, evalUser, scored: list(evalUser, gaps), ...over }, C, afterError);
  const sharp = [10, 20, 30, 250, 300, 300, 300];
  const flat = [5, 10, 15, 20, 25, 30, 35];
  assert.equal(kind(-200, sharp), 'hold');
  assert.equal(kind(C.holdLoCp - 1, sharp), null);
  assert.equal(kind(-200, flat), null);
  assert.equal(kind(400, sharp), 'convert');
  assert.equal(kind(C.convertHiCp + 1, sharp), null);
  assert.equal(kind(400, sharp, { nScored: C.minScored - 1 }), null);
  assert.equal(kind(20, sharp, { spread2: C.spreadMaxCp + 1 }), 'only');
  assert.equal(kind(20, sharp), null);
  assert.equal(kind(20, [250, 300], { inCheck: true, nScored: 3 }), 'only');
  assert.equal(kind(20, [10, 300], { inCheck: true, nScored: 3 }), null);
  assert.equal(kind(150, sharp, {}, true), 'punish');
  assert.equal(kind(150, flat, {}, true), null);
  assert.equal(kind(C.userLoCp - 1, sharp, {}, true), null);
  assert.equal(kind(400, sharp, { recapture: true }), null);
  // A candidate builder's: refused by the pick rules, kept by its kind.
  const fen = RUY;
  const pos = positionOf(fen)!;
  const scored = sf([{ uci: 'b5a4', score: 400 }, { uci: 'b5e2', score: 390 }, { uci: 'b5c4', score: 380 }, { uci: 'b5d3', score: 370 }, { uci: 'd2d3', score: 150 }, { uci: 'h2h3', score: 100 }]);
  const cand = candidate({ fen, pos, scored, ply: 3, userSide: 'white' }, C);
  assert.deepEqual([cand.reject, cand.kind, kept(cand)], ['you are already winning', 'convert', true]);
  const sp = storedPosition(cand, { lines: [], names: [] }, 1)!;
  assert.equal(sp.kind, 'convert');
  const classic = candidate({ fen, pos, scored: sf(scored.map((m) => ({ ...m, score: m.score - 380 }))), ply: 3, userSide: 'white' }, C);
  assert.deepEqual([classic.reject, classic.kind, kept(classic)], [null, null, true]);
  assert.equal('kind' in storedPosition(classic, { lines: [], names: [] }, 1)!, false);
});

test('the walk keeps the position an opponent’s error left, and a convert where the classic walk stops', async () => {
  const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
  const frontier = play(sans.slice(0, 5));
  const errAt = positionKey(play(sans.slice(0, 5)));
  // Every position: the first legal moves on a ladder, the best at 20; a6 there gives up 300.
  const ladder = [0, -12, -40, -60, -130, -200];
  const book = (fen: string): Promise<ScoredList> => {
    const pos = positionOf(fen)!;
    const ucis = [...pos.allDests()].flatMap(([from, ds]) => [...ds].map((to) => ({ from, to })));
    const out: ScoredMove[] = ucis.slice(0, ladder.length).map((m, i) => ({ uci: `${'abcdefgh'[m.from & 7]}${(m.from >> 3) + 1}${'abcdefgh'[m.to & 7]}${(m.to >> 3) + 1}`, score: 20 + ladder[i]! }));
    if (positionKey(fen) === errAt) out.push({ uci: 'a7a6', score: 20 - 300 });
    return Promise.resolve(sf(out.sort((a, b) => b.score - a.score)));
  };
  const w = await walkGame(frontier, 'white', sans, book, C);
  assert.equal(w.stop, 'the opponent erred here');
  assert.equal(w.out.length, 1);
  assert.deepEqual([w.out[0]!.kind, w.out[0]!.ply, w.out[0]!.arrived!.san], ['punish', 2, 'a6']);
  assert.equal(positionKey(w.out[0]!.fen), positionKey(play(sans.slice(0, 6))));
  // The user's own error keeps nothing.
  const own = await walkGame(frontier, 'black', sans, book, { ...C, minPly: 1 });
  assert.equal(own.stop, 'you would have erred here');
  assert.ok(own.out.every((c) => c.kind !== 'punish'));
  // Decided for the user at their move: the classic walk stops there, a convert is kept.
  const winning = (fen: string) => book(fen).then((l) => sf(l.map((m, i) => ({ ...m, score: 400 - [0, 10, 20, 30, 250, 300][Math.min(i, 5)]! }))));
  const won = await walkGame(frontier, 'black', sans, winning, { ...C, minPly: 1 });
  assert.equal(won.stop, 'the position is already decided');
  assert.deepEqual(
    won.out.map((c) => c.kind),
    ['convert'],
  );
});
