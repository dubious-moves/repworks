// The opening-ideas skill's chess vision (PLAN.md §5.128, scripts/ideas): the position's facts on
// positions whose answers are known, the repertoire's reach, profile and development map on small
// built trees, and the deck's check, statically and with Stockfish at a low depth, alone and
// against a repertoire (whose moves are right by definition).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSquare } from 'chessops/util';
import { checkDeck, gradeMoves } from '../../../scripts/ideas/check.ts';
import { decisions, namedMovers, namedPieces, namedSquares, transposingMoves, type Policy } from '../../../scripts/ideas/decide.ts';
import { play, readPosition, tokens } from '../../../scripts/ideas/cv.ts';
import { Engine, positionOf } from '../../../scripts/ideas/engine.ts';
import { maia } from '../../../scripts/ideas/maia.ts';
import { parsePlayer } from '../../../scripts/ideas/playout.ts';
import { development, moveText, numbered, profile, readRepertoire, setupOf, trunkOf } from '../../../scripts/ideas/tree.ts';
import { breaks, captureGain, forcing, kingSafety, look, lookText, outposts, passTurn, pawnFacts, pins, see } from '../../../scripts/ideas/vision.ts';
import { parseUciMove } from '../../../src/core/chess/uci.ts';
import { legalMoves } from '../../../src/core/maia/encode.ts';

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
  // The d2-bishop is pinned to its king by the b4-bishop: it can take the pinner, not the e3-knight.
  const pinned = positionOf('4k3/8/8/8/1b6/4n3/3B4/4K3 w - - 0 1');
  assert.equal(see(pinned, parseSquare('e3'), 'white'), 0);
  assert.equal(see(pinned, parseSquare('b4'), 'white'), 3);
  // After 8. Nc3 Nxe4 the c3-knight, pinned by Qa5, can't take back: the e4-knight isn't lost.
  const benoni = readPosition('1. d4 c5 2. dxc5 e5 3. e4 Bxc5 4. Nf3 Nc6 5. Bb5 Nf6 6. Bxc6 bxc6 7. Nxe5 Qa5+ 8. Nc3 Nxe4');
  assert.equal(see(benoni, parseSquare('e4'), 'white'), 0);
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
  // A push that hits a piece is a kick, not a break: ...g5 at the f4-bishop; ...e5 hits d4 and the bishop too.
  const pinned = positionOf('r1b1k2r/pp1p1ppp/1qn5/4P3/1b2nB2/1P2PN2/P2N1PPP/R2QKB1R b KQkq - 4 9');
  assert.deepEqual(breaks(pinned, 'black').kicks, [{ move: 'g5', hits: ['Bf4'], safe: false }]);
  const bf4 = readPosition('1. d4 c5 2. c3 Nf6 3. Bg5 Ne4 4. Bf4 cxd4 5. cxd4');
  assert.deepEqual(breaks(bf4, 'black').now.map((b) => [b.move, b.hits]), [['e5', ['d4']]]);
  assert.deepEqual(breaks(bf4, 'black').kicks.map((b) => [b.move, b.hits]), [['e5', ['Bf4']], ['g5', ['Bf4']]]);
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
  // 4. d4 has no share beside 4. Nf3 and 4. Nc3: it takes what they leave.
  assert.equal(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. d4').approx, true);
  assert.ok(Math.abs(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. d4').reach - 0.1) < 1e-9);
  assert.equal(rep.transpositions.length, 1);
  const pr = profile(rep, positionOf);
  assert.ok(pr.ourMoves.some(([m]) => m === 'e5'));
  assert.ok(pr.ourMoves.some(([m]) => m === 'Nc6') && pr.theirMoves.some(([m]) => m === 'dxc6'));
  assert.deepEqual(pr.materialAtLeaves.map(([k]) => k).sort(), ['level', 'we are down 1']);
});

// One move order gives 6. Bc4's share, the other only 6. Bb5, without one: the shares are read at the
// merged position, so 6. Bb5 takes the 10% that 6. Bc4 leaves, not every game of its move order.
const MERGED = `[Orientation "black"]

1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 { 60% } (4. Nc3 { 40% } 4... e5 5. Nf3 { 100% } 5... Nf6 6. Bb5) 4... e5 5. Nc3 { 100% } 5... Nf6 6. Bc4 { 90% } *`;

test('the repertoire: a move order with one reply and no share passes on that reply’s part only', () => {
  const rep = readRepertoire(MERGED);
  const at = (moves: string) => [...rep.positions.values()].find((p) => p.paths.includes(moves))!;
  assert.ok(Math.abs(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 e5 5. Nc3 Nf6').reach - 1) < 1e-9);
  assert.ok(Math.abs(at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 e5 5. Nc3 Nf6 6. Bc4').reach - 0.9) < 1e-9);
  const bb5 = at('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nc3 e5 5. Nf3 Nf6 6. Bb5');
  assert.ok(Math.abs(bb5.reach - 0.1) < 1e-9);
  assert.equal(bb5.approx, true);
  // The development map weighs the line ends the same way.
  const knight = development(rep).find((m) => m.piece === 'g8-knight')!;
  assert.deepEqual(knight.routes.map(([r, w]) => [r, Math.round(w * 100) / 100]), [['g8 → f6', 1]]);
});

// The f8-bishop's three squares, each against its own setup: d6 against Bb5, c5 against Bc4, e7 against Be2.
const DEV = `[Orientation "black"]

1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Nf3 { 60% } (4. Nc3 { 40% } 4... e5 5. Bc4 { 100% } 5... Bc5) 4... e5 5. Bb5 { 50% } (5. Be2 { 50% } 5... Nf6 6. O-O { 100% } 6... Be7 7. d3 { 100% } 7... O-O) 5... Bd6 6. O-O { 100% } 6... Ne7 *`;

test('the development map: each piece’s first squares, what sets them apart, and its routes', () => {
  const rep = readRepertoire(DEV);
  assert.deepEqual(trunkOf(rep), ['e4', 'd5', 'exd5', 'c6', 'dxc6', 'Nxc6']);
  const maps = development(rep);
  const piece = (name: string) => maps.find((m) => m.piece === name)!;
  // The order they come out: the gambit's pawns and knight, then ...e5, the bishop, the knight.
  assert.deepEqual(
    maps.map((m) => m.piece).slice(0, 6),
    ['d-pawn', 'c-pawn', 'b8-knight', 'e-pawn', 'f8-bishop', 'g8-knight'],
  );
  const bishop = piece('f8-bishop');
  const sq = (to: string) => bishop.squares.find((s) => s.to === to)!;
  assert.deepEqual(bishop.squares.map((s) => [s.to, s.reach]), [['c5', 0.4], ['d6', 0.3], ['e7', 0.3]]);
  assert.deepEqual(sq('d6').with[0], ['White Bb5', 1, 0]);
  assert.ok(sq('c5').with.some(([f, a, b]) => f === 'White Bc4' && a === 1 && b === 0));
  assert.ok(sq('e7').with.some(([f]) => f === 'White Be2'));
  assert.ok(sq('d6').without.some(([f]) => f === 'White Nc3'));
  assert.equal(moveText(sq('d6').moves[0]!, 6), '… 4. Nf3 e5 5. Bb5 Bd6');
  assert.equal(moveText(sq('c5').moves[0]!, 6), '… 4. Nc3 e5 5. Bc4 Bc5');
  // Castling moves the king and the h8-rook: their routes at the line ends, and their share still at home.
  assert.deepEqual(piece('king').routes, [['e8 → g8', 0.3]]);
  assert.ok(Math.abs(piece('king').home - 0.7) < 1e-9);
  assert.deepEqual(piece('h8-rook').routes, [['h8 → f8', 0.3]]);
  assert.deepEqual(piece('e-pawn').squares.map((s) => [s.to, s.moves.length]), [['e5', 2]]);
  assert.deepEqual(
    setupOf(readPosition('1. e4 d5 2. exd5 c6 3. dxc6 Nxc6 4. Bb5 e5 5. Bxc6+ bxc6')).sort(),
    ['Black c6', 'Black e5', 'Black: a knight fewer', 'Black: no b-pawn', 'Black: no d-pawn', 'White: no e-pawn', 'White: no light-squared bishop'],
  );
});

test('Maia is read at 2000 or more', async () => {
  await assert.rejects(maia(Chess.default(), 1500), /2000 or more/);
  assert.deepEqual(parsePlayer('maia'), { kind: 'maia', elo: 2000 });
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

// Cards against the DEV repertoire: its moves are the answers and the main line's, never a mistake.
const card = (name: string, fen: string, kind: string, movetext: string, question = kind === 'overview' ? '' : 'Where does the f8-bishop go?') => `[ChapterName "${name}"]
[Orientation "black"]
[FEN "${fen}"]
[SetUp "1"]
[IdeaKind "${kind}"]
${question ? `[IdeaQuestion "${question}"]\n` : ''}[IdeaSource "test"]

{ Bb5 pins the knight and Nf3 hits e5. [%cal Gf8d6] } ${movetext}
`;
const BB5 = 'r1bqkbnr/pp3ppp/2n5/1B2p3/8/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 5';
const NF3 = 'r1bqkbnr/pp2pppp/2n5/8/8/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 4';
const AGAINST = [
  card('0. Rules of thumb', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'overview', '*'),
  card('0b. More rules', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'overview', '*'),
  card('1. Guard e5', BB5, 'placement', '5... Bd6 6. O-O Ne7 ( 6... Bc5 { also a square, not the answer } ) *'),
  card('2. Another square', BB5, 'placement', '5... Bc5 *'),
  card('3. Called a mistake', BB5, 'placement', '5... Bd6? *'),
  card('4. Off the line', NF3, 'placement', '4... e5 5. Be2 Nf6 6. O-O Bd6 *'),
  card('5. What the pawn buys', NF3, 'overview', '4... e5 *', 'Name three things'),
].join('\n');

test('the deck against the repertoire: its moves answer, the main line keeps to it, nothing calls it a mistake', async () => {
  const { findings, onRepertoire } = await checkDeck(AGAINST, { depth: 8, rep: readRepertoire(DEV) });
  const texts = findings.map((f) => `${f.level} ${f.chapter.split(' ')[0]} ${f.text}`);
  // The rules of thumb make no card: two at the opening's start are no duplicate.
  assert.ok(!texts.some((t) => t.includes('#2 ') || t.startsWith('warning #1')), texts.join('\n'));
  assert.ok(!texts.some((t) => t.split(' ')[1] === '#3'), 'Bd6 is the repertoire’s; Bc5 beside it is a side line');
  assert.ok(texts.includes('error #4 Bc5 answers the card, but the repertoire plays Bd6 here: the answer is the repertoire\'s move'));
  assert.ok(texts.some((t) => t.startsWith("error #5 Bd6? is the repertoire's move, marked ?")));
  assert.ok(texts.includes('error #6 the main line leaves the repertoire at e5 Be2 Nf6 O-O Bd6: it plays Be7 here'));
  // An overview makes no card in repworks: one that asks a question is a card lost.
  assert.ok(texts.includes('warning #7 an overview chapter makes no card, yet this one asks a question or has moves: give it another kind'));
  assert.equal(onRepertoire, 4);
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
    // Against a repertoire that plays a3 there, a3 is right whatever its grade, and Nxd4 beside it is too good to show.
    const rep = readRepertoire(`[Orientation "white"]\n[FEN "rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3"]\n[SetUp "1"]\n\n3. a3 *`);
    const against = await checkDeck(MARKS.replace(' ( 3. h3! )', ''), { engine, depth: 8, rep });
    assert.equal(against.findings.length, 1);
    assert.ok(against.findings[0]!.text.startsWith("Nxd4 (side line) grades great, better than the repertoire's a3 (blunder)"));
  } finally {
    engine.quit();
  }
});

// What a question gives away: the deck of 2026-10-24 asked "Where does the f8-bishop go?" where it
// had one square, and "his other pawn stands on b4" where it took on b4.
test('a question: the pieces of ours it names, and the squares', () => {
  const b4 = positionOf('rnbqkbnr/3p1ppp/1P6/4p3/1P6/8/P3PPPP/RNBQKBNR b KQkq - 0 6');
  const q = "White's c-pawn has gone to b6, and his other pawn stands on b4. Where does the f8-bishop go, and why?";
  assert.deepEqual(namedPieces(q, 'black'), [{ role: 'bishop', square: 'f8' }]);
  assert.deepEqual(namedMovers(q, b4, 'Bxb4+'), ['f8']);
  assert.equal(namedMovers(q, b4, 'Qxb6'), undefined);
  assert.deepEqual(namedSquares(q), ['b6', 'b4']);
  // "Which pawn" is every pawn; a moved bishop named by its home keeps its colour complex.
  assert.deepEqual(namedMovers('Which pawn break hits the chain?', b4, 'd6')!.sort(), ['d7', 'e5', 'f7', 'g7', 'h7']);
  const start = Chess.default();
  assert.deepEqual(namedMovers('Where does the light-squared bishop go?', readPosition('1. e4 e5 2. Nf3 d6 3. d4'), 'Bg4'), ['c8']);
  const london = readPosition('1. d4 d5 2. Bf4 Nf6 3. e3 e6');
  assert.deepEqual(namedMovers('Where does the c1-bishop go now?', london, 'Bg5'), ['f4'], 'the f4-bishop came from c1');
  assert.equal(namedMovers('Where does the f1-bishop go?', london, 'Bg5'), undefined);
  assert.deepEqual(namedMovers('Our e-pawn: one step or two?', start, 'e4'), ['e2']);
  assert.equal(namedMovers('Our d-pawn: one step or two?', start, 'e4'), undefined);
  // Moves quoted are the position, not a hint; the squares of named pieces are names.
  assert.deepEqual(namedSquares('White has just played 5. Bg2 after ...a5 and cxd6. What does the c5-bishop do?'), []);
  assert.deepEqual(namedSquares('Does our d-pawn go to d6 or d5?'), ['d6', 'd5']);
});

/** Maia, faked: `found` for the moves named, the rest of the probability on the first other legal move. */
const fakePolicy = (found: Record<string, number>): Policy => async (pos) => {
  const legal = legalMoves(pos);
  const named = legal.filter((m) => m.san in found).map((m) => ({ ...m, prob: found[m.san]! }));
  const rest = 1 - named.reduce((t, m) => t + m.prob, 0);
  const other = legal.find((m) => !(m.san in found));
  return [...named, ...(other && rest > 0 ? [{ ...other, prob: rest }] : [])].sort((a, b) => b.prob - a.prob);
};

test('the decisions: our positions past the trunk, ranked by reach and what a miss costs', async () => {
  const rep = readRepertoire(DEV);
  const ds = await decisions(rep, { policy: fakePolicy({ Bd6: 0.1, Bc5: 0.95 }), depth: 8, minReach: 0 });
  // The trunk's ...d5, ...c6 and ...Nxc6 are the opening itself, not decisions.
  assert.ok(!ds.some((d) => ['d5', 'c6', 'Nxc6'].includes(d.ours[0]!)));
  assert.equal(ds.length, 8);
  assert.deepEqual(ds[0]!.ours, ['e5']);
  assert.equal(ds[0]!.reach, 0.6);
  const bd6 = ds.find((d) => d.ours[0] === 'Bd6')!;
  assert.ok(Math.abs(bd6.found - 0.1) < 1e-9);
  assert.equal(bd6.miss?.san, 'Bc5');
  // Found 95% of the time: worth least, last.
  assert.deepEqual(ds.at(-1)!.ours, ['Bc5']);
  assert.equal((await decisions(rep, { policy: fakePolicy({}), depth: 8, minReach: 0.35 })).length, 3);
});

// The Benko deck (2026-10-24): `decisions` ranked 6...Nxd5 as a card that Maia missed with 6...exd5,
// which only takes the same exchange on d5 in another order.
test('an exchange taken in another order is the same move: found, and the card warned', async () => {
  const rep = readRepertoire('[Orientation "black"]\n\n1. d4 c5 2. d5 Nf6 3. c4 b5 4. cxb5 a6 5. b6 (5. Nc3 axb5 6. Nxb5 Qa5+ 7. Nc3 Ne4) 5... e6 6. Nc3 Nxd5 7. Nxd5 exd5 8. Qxd5 Nc6 *');
  const nc3 = readPosition('1. d4 c5 2. d5 Nf6 3. c4 b5 4. cxb5 a6 5. b6 e6 6. Nc3');
  assert.deepEqual([...transposingMoves(rep, nc3)], [['e6d5', ['exd5', 'Nxd5', 'Nxd5', 'Qxd5']]]);
  // No exchange, no other order: 6...Qa5+ is no capture, and 5...e6 takes nothing.
  assert.equal(transposingMoves(rep, readPosition('1. d4 c5 2. d5 Nf6 3. c4 b5 4. cxb5 a6 5. Nc3 axb5 6. Nxb5')).size, 0);
  assert.equal(transposingMoves(rep, readPosition('1. d4 c5 2. d5 Nf6 3. c4 b5 4. cxb5 a6 5. b6')).size, 0);
  const ds = await decisions(rep, { policy: fakePolicy({ Nxd5: 0.3, exd5: 0.4 }), depth: 8, minReach: 0 });
  const nxd5 = ds.find((d) => d.ours[0] === 'Nxd5' && d.path.endsWith('6. Nc3'))!;
  assert.ok(Math.abs(nxd5.found - 0.7) < 1e-9);
  assert.notEqual(nxd5.miss?.san, 'exd5');
  assert.deepEqual(nxd5.transposing, [['exd5', 'Nxd5', 'Nxd5', 'Qxd5']]);
  const card = neutral('1. Trade', makeFen(nc3.toSetup()), '6... Nxd5 7. Nxd5 exd5 8. Qxd5 *', 'White has just played 6. Nc3. What do we play, and why?');
  const { findings } = await checkDeck(card, { depth: 8, rep });
  assert.equal(findings.length, 1);
  assert.ok(findings[0]!.text.startsWith('exd5 only changes the move order (exd5 Nxd5 Nxd5 Qxd5 reaches the repertoire)'), findings[0]!.text);
});

const neutral = (name: string, fen: string, movetext: string, question: string) => `[ChapterName "${name}"]
[Orientation "black"]
[FEN "${fen}"]
[SetUp "1"]
[IdeaKind "placement"]
[IdeaQuestion "${question}"]
[IdeaSource "test"]

{ Explained. [%csl Yd4] } ${movetext}
`;

test('a card is a decision: the question names no square, the deck keeps to its size', async () => {
  const leak = neutral('1. Leak', 'rnbqkbnr/3p1ppp/1P6/4p3/1P6/8/P3PPPP/RNBQKBNR b KQkq - 0 6', '6... Bxb4+ *', 'His other pawn stands on b4. Where does the f8-bishop go?');
  const { findings } = await checkDeck(leak, { depth: 8 });
  assert.deepEqual(findings.map((f) => f.text), ['the question names b4, where the answer Bxb4+ goes: let the board ask it']);
  // Thirteen cards at thirteen positions: over the twelve asked for; sixteen: over fifteen.
  const firsts = legalMoves(Chess.default()).filter((m) => !['e4', 'e3'].includes(m.san)).map((m) => m.san);
  const deck = (n: number) => firsts.slice(0, n).map((w, i) => neutral(`${i + 1}. Card`, (() => { const p = Chess.default(); play(p, [w]); return makeFen(p.toSetup()); })(), '1... e5 *', 'What do we play?')).join('\n');
  const over = await checkDeck(deck(13), { depth: 8 });
  assert.equal(over.cards, 13);
  assert.deepEqual(over.findings.map((f) => `${f.level} ${f.text.slice(0, 41)}`), ['warning 13 cards, more than the 12 asked for: kee']);
  assert.ok((await checkDeck(deck(16), { depth: 8 })).findings.some((f) => f.level === 'error' && f.text.startsWith('16 cards; a deck has 12 or so, never more than 15')));
  // A card under 2% of the repertoire's games is too rare to drill.
  const rare = readRepertoire('[Orientation "black"]\n\n1. e4 { 1% } (1. d4 { 99% } 1... d5) 1... e5 *');
  const e4 = neutral('1. Rare', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', '1... e5 *', 'What do we play?');
  assert.ok((await checkDeck(e4, { depth: 8, rep: rare })).findings.some((f) => f.level === 'warning' && f.text.includes('reached in 1.0% of games: too rare')));
});

test('a card is a decision: Maia and Stockfish on what the question leaves to decide', { timeout: 120_000 }, async () => {
  const engine = new Engine();
  try {
    // The queen hangs on d4: Nxd4 is the only sensible move. Found anyway, it is no card; missed, it is.
    const queen = 'rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3';
    const card = (q: string) => neutral('1. Take', queen, '3. Nxd4 *', q).replace('"black"', '"white"');
    const found = await checkDeck(card('What now?'), { engine, depth: 8, policy: fakePolicy({ Nxd4: 0.95 }) });
    assert.ok(found.findings.some((f) => f.level === 'error' && f.text.startsWith('Nxd4 is the only sensible move here; Maia plays Nxd4 95% here')), found.findings.map((f) => f.text).join('\n'));
    const missed = await checkDeck(card('What now?'), { engine, depth: 8, policy: fakePolicy({ Nxd4: 0.2 }) });
    assert.ok(!missed.findings.some((f) => f.text.includes('only sensible')), missed.findings.map((f) => f.text).join('\n'));
    // Bb5 with Nf3: three sensible squares for the bishop, but once the question names it, Maia takes d6.
    const bb5 = 'r1bqkbnr/pp3ppp/2n5/1B2p3/8/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 5';
    const named = await checkDeck(neutral('1. Bishop', bb5, '5... Bd6 *', 'Where does the f8-bishop go?'), { engine, depth: 8, policy: fakePolicy({ Bd6: 0.5, Bc5: 0.05 }) });
    assert.ok(named.findings.some((f) => f.level === 'error' && f.text.startsWith('the question names the piece that moves, and then the answer is plain: Maia plays Bd6 91%')), named.findings.map((f) => f.text).join('\n'));
    const plain = await checkDeck(neutral('1. Bishop', bb5, '5... Bd6 *', 'Bb5 and Nf3 are out. What do we play?'), { engine, depth: 8, policy: fakePolicy({ Bd6: 0.85 }) });
    assert.deepEqual(plain.findings.filter((f) => !f.text.includes('grades') && !f.text.includes("card's move")).map((f) => f.text.slice(0, 40)), ['Maia plays Bd6 85% here unprompted: a pl']);
  } finally {
    engine.quit();
  }
});
