// What a storm verdict offers past its grade (PLAN.md §5.154): Show refutation, Show line and
// Continue, Maia's reply drawn from its policy, and the continued position as a card of its own.
//
// Controls run (2026-11-06), each failing only the tests named: `followUps`'s `pos.isEnd()` check
// removed → "a move that ends the game offers nothing"; `!f.show` removed → "show and grade offers
// no Continue"; `rootCard` left out of the id → "a continued card continued again counts on from
// the dealt card"; `ply: p.ply + 2` as `p.ply` → that one and "the continued card: the reply's
// position, two plies on, an id of its own, nothing scored yet".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { continuedCard, continuedDepth, continuedId, followUps, maiaReply, rootCard, type FollowFacts } from '../../../../src/core/storm/after.ts';
import type { StoredPosition } from '../../../../src/core/storm/harvest.ts';
import { fenAfterUci } from '../../../../src/core/storm/walk.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6: Qxf7 mates. */
const SCHOLAR = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
/** 1. f3 e5: 2. g4 lets Qh4 mate. */
const FOOL = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';

const facts = (patch: Partial<FollowFacts>): FollowFacts => ({ band: 'great', userUci: 'e2e4', top: false, puzzle: false, show: false, ...patch });

const card = (fen: string, patch: Partial<StoredPosition> = {}): StoredPosition => ({
  card: 's|abc',
  key: 'abc' as StoredPosition['key'],
  fen,
  side: 'white',
  ply: 3,
  lines: [{ sid: 'S', cid: 'C', path: ['e4'] }],
  names: ['Main line'],
  arrived: null,
  scored: [{ u: 'e2e4', s: 30 }],
  src: 'sf',
  depth: 24,
  invented: false,
  unc: { san: 'e5', share: 10, games: 40 },
  games: 1200,
  at: 1,
  maia: [{ elo: 1500, moves: [['e2e4', 0.5]] }],
  kind: 'hold',
  ...patch,
});

test('a mistake or a blunder offers its refutation; a great move its line and Continue; a good one Continue', () => {
  assert.deepEqual(followUps(facts({ band: 'bad' }), START), ['refutation']);
  assert.deepEqual(followUps(facts({ band: 'blunder' }), START), ['refutation']);
  assert.deepEqual(followUps(facts({ band: 'great' }), START), ['line', 'continue']);
  assert.deepEqual(followUps(facts({ band: 'good' }), START), ['continue']);
  // The top move is shown its line whatever its band.
  assert.deepEqual(followUps(facts({ band: 'good', top: true }), START), ['line', 'continue']);
  assert.deepEqual(followUps(facts({ band: 'ok' }), START), []);
  assert.deepEqual(followUps(facts({ band: 'unknown' }), START), []);
  assert.deepEqual(followUps(facts({ band: 'unanswered' }), START), []);
});

test('no follow-up for a puzzle, an answer with no move, or a move not legal there', () => {
  assert.deepEqual(followUps(facts({ puzzle: true }), START), []);
  assert.deepEqual(followUps(facts({ userUci: undefined }), START), []);
  assert.deepEqual(followUps(facts({ userUci: 'e2e5' }), START), []);
});

test('a move that ends the game offers nothing', () => {
  assert.deepEqual(followUps(facts({ band: 'great', top: true, userUci: 'h5f7' }), SCHOLAR), []);
  assert.deepEqual(followUps(facts({ band: 'great', userUci: 'c4f7' }), SCHOLAR), ['line', 'continue']);
});

test('show and grade offers no Continue', () => {
  assert.deepEqual(followUps(facts({ band: 'great', show: true }), START), ['line']);
  assert.deepEqual(followUps(facts({ band: 'good', show: true }), START), []);
  assert.deepEqual(followUps(facts({ band: 'blunder', show: true }), START), ['refutation']);
});

test('Maia\'s reply: drawn from its policy at the precision set, none without a policy', () => {
  const policy = [
    { uci: 'e7e5', prob: 0.2 },
    { uci: 'c7c5', prob: 0.7 },
    { uci: 'g7g6', prob: 0.1 },
  ];
  assert.equal(maiaReply(policy, { ...C, replyPrecision: 1 }, () => 0.99), 'c7c5');
  // At the default precision a draw near 0 takes the first move, near 1 the last.
  assert.equal(maiaReply(policy, C, () => 0), 'e7e5');
  assert.equal(maiaReply(policy, C, () => 0.999999), 'g7g6');
  assert.equal(maiaReply([], C, () => 0), undefined);
  assert.equal(maiaReply(null, C, () => 0), undefined);
});

test('the continued card: the reply\'s position, two plies on, an id of its own, nothing scored yet', () => {
  const c = continuedCard(card(START), 'e2e4', 'e7e5', 99);
  assert.equal(c.kind, 'card');
  const p = (c as Extract<typeof c, { kind: 'card' }>).card;
  const afterE4 = fenAfterUci(START, 'e2e4')!;
  assert.equal(p.fen, fenAfterUci(afterE4, 'e7e5'));
  assert.equal(p.card, 's|abc~1');
  assert.equal(p.side, 'white');
  assert.equal(p.ply, 5);
  assert.deepEqual(p.arrived, { san: 'e5', uci: 'e7e5', before: afterE4 });
  assert.deepEqual(p.lines, [{ sid: 'S', cid: 'C', path: ['e4'] }]);
  assert.deepEqual(p.names, ['Main line']);
  // Nothing of the dealt position's own: no list (so no judge), no Maia, no kind, no reach, no uncovered reply.
  assert.deepEqual(p.scored, []);
  assert.equal(p.src, 'cdb');
  assert.equal(p.depth, 0);
  assert.equal(p.maia, undefined);
  assert.equal(p.kind, undefined);
  assert.equal(p.games, null);
  assert.equal(p.unc, null);
  assert.equal(p.at, 99);
});

test('a continued card continued again counts on from the dealt card', () => {
  const one = continuedCard(card(START), 'e2e4', 'e7e5', 1);
  assert.equal(one.kind, 'card');
  const first = (one as Extract<typeof one, { kind: 'card' }>).card;
  const two = continuedCard(first, 'g1f3', 'b8c6', 2);
  assert.equal(two.kind, 'card');
  const second = (two as Extract<typeof two, { kind: 'card' }>).card;
  assert.equal(second.card, 's|abc~2');
  assert.equal(second.ply, 7);
  assert.equal(rootCard(second.card), 's|abc');
  assert.equal(continuedDepth(second.card), 2);
  assert.equal(continuedDepth('s|abc'), 0);
  assert.equal(rootCard('s|abc'), 's|abc');
  assert.equal(continuedId('s|abc', 3), 's|abc~3');
});

test('a reply that ends the game is said so; one that isn\'t legal is refused', () => {
  const over = continuedCard(card(FOOL), 'g2g4', 'd8h4', 1);
  assert.deepEqual(over, { kind: 'over', san: 'Qh4#', fen: fenAfterUci(fenAfterUci(FOOL, 'g2g4')!, 'd8h4'), mate: true });
  // White to move again, and a move that isn't White's to make.
  assert.deepEqual(continuedCard(card(START), 'e2e4', 'd2d4', 1), { kind: 'illegal' });
  assert.deepEqual(continuedCard(card(START), 'e2e5', 'e7e5', 1), { kind: 'illegal' });
  // A card whose side isn't the one to move.
  assert.deepEqual(continuedCard(card(START, { side: 'black' }), 'e2e4', 'e7e5', 1), { kind: 'illegal' });
});
