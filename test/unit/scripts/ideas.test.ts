// The opening-ideas skill's chess vision (PLAN.md §5.128, scripts/ideas): the position's facts on
// positions whose answers are known, the repertoire's reach and profile on a small built tree, and
// the deck's check, statically and with Stockfish at a low depth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseSquare } from 'chessops/util';
import { checkDeck, gradeMoves } from '../../../scripts/ideas/check.ts';
import { play, readPosition, tokens } from '../../../scripts/ideas/cv.ts';
import { Engine, positionOf } from '../../../scripts/ideas/engine.ts';
import { numbered, profile, readRepertoire } from '../../../scripts/ideas/tree.ts';
import { breaks, captureGain, forcing, kingSafety, look, lookText, outposts, passTurn, pawnFacts, pins, see } from '../../../scripts/ideas/vision.ts';
import { parseUciMove } from '../../../src/core/chess/uci.ts';

// Searches are cached on disk: a fresh folder, so the engine really searches here.
process.env['IDEAS_CACHE'] = mkdtempSync(join(tmpdir(), 'repworks-ideas-test-'));

const SCANDI = '1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 e5 5. Bb5 Bd6 6. O-O Ne7 7. Re1 O-O 8. Nc3 h6';

test('movetext is read past numbers, comments and glyphs; a bad move names the legal ones', () => {
  assert.deepEqual(tokens('1. e4 {best} d5! 2. exd5 $1 c6 (2... Qxd5) *'), ['e4', 'd5', 'exd5', 'c6']);
  const pos = Chess.default();
  assert.deepEqual(play(pos, ['e2e4', 'e5']), ['e4', 'e5']);
  assert.throws(() => play(pos, ['Ke3']), /Ke3 is not a legal move \(or is ambiguous\) .*legal: .*Nf3/);
  // Both knights reach e7: the SAN is ambiguous, and the legal moves name them.
  assert.throws(() => play(readPosition('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 e5 5. d3'), ['Ne7']), /legal: .*Nce7.*Nge7/);
  assert.equal(numbered(['e5', 'Nf3', 'Nc6'], 1, 'black'), '1... e5 2. Nf3 Nc6');
});

test('exchanges: what a capture wins once the recaptures are played out', () => {
  const pos = readPosition(SCANDI);
  const gain = (uci: string) => captureGain(pos, parseUciMove(pos, uci)!);
  assert.equal(gain('f3e5'), -2); // Nxe5 Nxe5 Rxe5 Bxe5: White stops after Nxe5 Nxe5
  assert.equal(gain('e1e5'), -4);
  assert.equal(gain('b5c6'), 0); // Bxc6 bxc6
  assert.equal(see(pos, parseSquare('e5'), 'white'), -2); // the first capture is forced
  const hanging = positionOf('rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3');
  assert.equal(see(hanging, parseSquare('d4'), 'white'), 9);
});

test('pins, checks, double attacks and threats', () => {
  const ruy = readPosition('1. e4 e5 2. Nf3 Nc6 3. Bb5 d6');
  assert.deepEqual(pins(ruy, 'black'), [{ pinned: 'Nc6', by: 'Bb5', to: 'Ke8', absolute: true }]);
  const scholar = positionOf('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  assert.ok(forcing(scholar).checks.includes('Qxf7#'));
  const fork = positionOf('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1');
  assert.deepEqual(forcing(fork).doubleAttacks.find((d) => d.san === 'Nc7+')?.targets.sort(), ['Ke8', 'Ra8']);
  // Black to move after 3. Bc4: White's threat, read with the turn passed, is Qxf7#.
  const threat = passTurn(readPosition('1. e4 e5 2. Qh5 Nc6 3. Bc4'))!;
  assert.equal(threat.turn, 'white');
  assert.ok(forcing(threat).checks.includes('Qxf7#'));
  assert.equal(passTurn(readPosition('1. e4 f6 2. d4 g5 3. Qh5+')), undefined); // in check: no pass
});

test('pawns: islands, isolated, doubled, passed, chains; breaks and outposts', () => {
  const pos = positionOf('4k3/p1p3pp/2p5/4P3/3P4/8/PP4PP/4K3 w - - 0 1');
  const black = pawnFacts(pos, 'black');
  assert.deepEqual(black.doubled, ['c (c6,c7)']);
  assert.deepEqual(black.isolated, ['a7', 'c6', 'c7']); // the c-pawns are doubled and isolated
  assert.deepEqual(black.islands, ['a', 'c', 'g-h']);
  const white = pawnFacts(pos, 'white');
  assert.deepEqual(white.chains, ['d4-e5']);
  assert.deepEqual(white.passed, ['e5']); // d4 faces the c-pawns
  const french = readPosition('1. e4 e6 2. d4 d5 3. e5');
  assert.deepEqual(breaks(french, 'black').now.map((b) => b.move).sort(), ['c5', 'f6']);
  assert.deepEqual(breaks(french, 'white').now.map((b) => b.move), ['c4']);
  // A Najdorf's d5: no black pawn can ever attack it, and e4 covers it.
  const najdorf = positionOf('rnbqkb1r/1p3ppp/p2p1n2/4p3/4P3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 7');
  assert.ok(outposts(najdorf, 'white').includes('d5'));
  assert.ok(!outposts(najdorf, 'white').includes('c5'));
  const k = kingSafety(readPosition(SCANDI), 'black')!;
  assert.deepEqual([k.square, k.shield.sort()], ['g8', ['f7', 'g7', 'h6']]);
});

test('the look reads as text from either side', () => {
  const l = look(readPosition(SCANDI), 'black');
  const text = lookText(l, 'black');
  assert.match(text, /^1 \. K \. R Q B \. R$/m);
  assert.match(text, /Material: White is up 1/);
  assert.match(text, /White \(to move\): checks none; captures, static exchange in pawns Bxc6 0, Nxe5 -2, Rxe5 -4/);
  // After ...Bg4 the f3-knight is pinned to the queen: its capture says so.
  const pinned = forcing(readPosition('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 e5 5. Bb5 Bd6 6. O-O Ne7 7. Re1 O-O 8. d3 Bg4'));
  assert.deepEqual(pinned.captures.find((c) => c.san === 'Nxe5'), { san: 'Nxe5', gain: -2, pinnedTo: 'Qd1' });
  assert.match(text, /White pawn breaks: d4 \(hits e5\)/);
});

const REP = `[Orientation "black"]

1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 { 60% } (4. Nc3 { 30% } 4... e5 5. Nf3 { 50% } 5... Nf6) (4. d4 4... Qxd4) 4... e5 5. Nc3 { 40% } 5... Nf6 { Nc3 transposes } *`;

test('the repertoire: reach multiplies the shares, transpositions merge, a guess is marked', () => {
  const rep = readRepertoire(REP);
  assert.equal(rep.side, 'black');
  const at = (moves: string) => rep.positions.get([...rep.positions.values()].find((p) => p.paths.includes(moves))!.key)!;
  assert.equal(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6').reach, 1);
  assert.equal(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3').reach, 0.6);
  // 4. Nf3 e5 5. Nc3 (0.6 × 0.4) and 4. Nc3 e5 5. Nf3 (0.3 × 0.5) are one position.
  const merged = at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 e5 5. Nc3');
  assert.equal(merged.paths.length, 2);
  assert.ok(Math.abs(merged.reach - (0.24 + 0.15)) < 1e-9);
  assert.equal(merged.approx, false);
  assert.equal(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. d4').approx, true);
  assert.equal(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. d4').reach, 1);
  assert.equal(rep.transpositions.length, 1);
  const pr = profile(rep, positionOf);
  assert.ok(pr.ourMoves.some(([m]) => m === 'e5'));
  assert.ok(pr.ourMoves.some(([m]) => m === 'Nc6') && pr.theirMoves.some(([m]) => m === 'dxc6'));
  assert.deepEqual(pr.materialAtLeaves.map(([k]) => k).sort(), ['level', 'we are down 1']);
});

const DECK = `[ChapterName "1. Hit the base of the chain: ...c5"]
[Orientation "black"]
[FEN "rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3"]
[SetUp "1"]
[IdeaKind "break"]
[IdeaQuestion "Which pawn break attacks White's centre?"]
[IdeaSource "test"]

{ The chain d4-e5 is weak at its base. [%csl Gd4][%cal Gc7c5] } 3... c5 4. c3 Nc6 5. Nf3 Qb6 { All on d4. [%cal Gc5d4,Gc6d4,Gb6d4] } (5... Qh4?? { loses the queen to nothing, but marked }) *

[ChapterName "1b. The same position again"]
[Orientation "black"]
[FEN "rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3"]
[SetUp "1"]
[IdeaKind "break"]
[IdeaQuestion "The same question, asked again"]
[IdeaSource "test"]

{ The same card. [%cal Gc7c5] } 3... c5 *

[ChapterName "2. Bad"]
[Orientation "black"]
[IdeaKind "nonsense"]

{ [%cal Ge4e5] } 1. e4 e5 2. Qh5 Ke7 *
`;

test('the deck: headers, explanation and arrows checked without the engine', async () => {
  const { findings, chapters } = await checkDeck(DECK, { depth: 8 });
  assert.equal(chapters, 3);
  const texts = findings.map((f) => `${f.level} ${f.chapter.slice(0, 2)} ${f.text}`);
  assert.deepEqual(
    texts.filter((t) => t.split(' ')[1] === '#1'),
    [],
  );
  for (const t of ['IdeaKind "nonsense"', 'no IdeaQuestion', 'no IdeaSource', 'no explanation']) assert.ok(texts.some((x) => x.startsWith('error #3') && x.includes(t)), t);
  assert.ok(texts.some((x) => x.startsWith('warning #3') && x.includes('arrow e4-e5 starts on an empty square')));
  assert.deepEqual(
    texts.filter((t) => t.startsWith('warning #2')),
    ['warning #2 starts at the same position as #1 1. Hit the base of the chain: ...c5: merge them (one card, both side lines)'],
  );
});

const MARKS = `[ChapterName "1. Take the queen"]
[Orientation "white"]
[FEN "rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3"]
[SetUp "1"]
[IdeaKind "tactic"]
[IdeaQuestion "What is loose?"]
[IdeaSource "test"]

{ The queen. [%cal Gf3d4] } 3. a3 ( 3. Nxd4 ) ( 3. h3! ) *
`;

test('the deck and the grades with Stockfish', { timeout: 120_000 }, async () => {
  const engine = new Engine();
  try {
    const pos = positionOf('rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3');
    const [take, ignore] = await gradeMoves(engine, pos, ['Nxd4', 'a3'], 8);
    assert.equal(take!.band, 'great');
    assert.equal(ignore!.band, 'blunder');
    const { findings } = await checkDeck(DECK, { engine, depth: 8 });
    const errors = findings.filter((f) => f.level === 'error').map((f) => f.text);
    assert.ok(!errors.some((t) => t.includes('Qh4')), 'Qh4?? is a blunder, as marked');
    assert.ok(!errors.some((t) => t.includes('c5')), 'the idea’s own moves are good');
    assert.ok(errors.some((t) => t.includes('Ke7') && t.includes('not a good move')));
    // A card's answers are its first move and the first moves marked ! beside it: both must be great.
    const marks = await checkDeck(MARKS, { engine, depth: 8 });
    assert.ok(marks.findings.some((f) => f.level === 'error' && f.text.startsWith('h3! (side line) is marked ! but is blunder')));
    assert.ok(marks.findings.some((f) => f.level === 'warning' && f.text.startsWith("the card's move a3 is blunder")));
    assert.ok(!marks.findings.some((f) => f.text.startsWith('Nxd4')));
  } finally {
    engine.quit();
  }
});
