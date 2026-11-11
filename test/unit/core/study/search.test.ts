// Search across the studies (PLAN.md §5.166): names, comments, and a position by its moves or FEN.
//
// Controls run on this file (2026-11-11), each failing exactly the named tests:
// - a chapter listed when its study's name alone holds every word → "names";
// - a comment matched when its words are spread over two moves' comments (the chapter's whole
//   text searched) → "comments";
// - positions looked up by the path's moves instead of the position reached (no transpositions)
//   → "a position by its moves, in any order".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { queryPosition, search, searchWords, type SearchChapter, type SearchHit } from '../../../../src/core/study/search.ts';

function chapter(sid: string, study: string, cid: string, name: string, movetext: string, fen?: string, kind: 'repertoire' | 'reference' = 'repertoire'): SearchChapter {
  const parsed = parseChapterFile(`[Event "Test"]\n[ChapterName "${name}"]\n${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}\n${movetext} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return { sid, study, kind, cid, name, chapter: parsed.chapter };
}

const CHAPTERS: SearchChapter[] = [
  chapter('Najd', 'Najdorf Sicilian', 'Bg5', '6. Bg5', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Qb6 { The Poisoned Pawn: take on b2 and hold. } 8. Qd2 Qxb2'),
  chapter('Najd', 'Najdorf Sicilian', 'Be3', '6. Be3, the English Attack', '{ White castles long and pushes the g-pawn. } 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 { The pawn stays on e5. } 7. Nb3 Be6 { Hold the d5 square. }'),
  chapter('Najd', 'Najdorf Sicilian', 'Open', 'By another order', '1. Nf3 c5 2. e4 d6 3. d4'),
  chapter('Grun', 'Grünfeld Defence', 'Exch', 'Exchange', '1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 { The centre is given up, to be hit with ...c5 and the bishop on g7; this long comment goes on and on so that the words around a match have to be cut out of it, well past the first hundred and forty characters, until the knight retreats. }'),
  chapter('Ends', 'Rook endings', 'Luc', 'Lucena', '1. Rd1+ Ke7 2. Rd4 { Building the bridge. }', '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'reference'),
];

const brief = (h: SearchHit) => (h.kind === 'study' ? `study ${h.study}` : `${h.kind} ${h.study} · ${h.chapter}${h.kind === 'comment' ? ` @ ${h.move}` : h.kind === 'position' ? ` @ ${h.line || 'start'}${h.orders > 1 ? ` ×${h.orders}` : ''}` : ''}`);
const hits = (q: string) => search(CHAPTERS, q).hits.map(brief);

test('names: a study, a chapter by its own words or with its study’s, and no chapter for the study’s name alone', () => {
  assert.deepEqual(hits('najdorf'), ['study Najdorf Sicilian']);
  assert.deepEqual(hits('SICILIAN najd'), ['study Najdorf Sicilian']);
  assert.deepEqual(hits('english'), ['chapter Najdorf Sicilian · 6. Be3, the English Attack']);
  // A word of the study's and one of the chapter's.
  assert.deepEqual(hits('najdorf bg5'), ['chapter Najdorf Sicilian · 6. Bg5']);
  // Accents folded both ways.
  assert.deepEqual(hits('grunfeld'), ['study Grünfeld Defence']);
  assert.deepEqual(hits('Grünfeld exch'), ['chapter Grünfeld Defence · Exchange']);
  // A study's kind and its chapters, for the hit's line.
  const [study] = search(CHAPTERS, 'rook endings').hits;
  assert.deepEqual(study, { kind: 'study', sid: 'Ends', study: 'Rook endings', studyKind: 'reference', chapters: 1 });
});

test('comments: every word within one move’s comment, named by its move', () => {
  assert.deepEqual(hits('poisoned'), ['comment Najdorf Sicilian · 6. Bg5 @ 7... Qb6']);
  assert.deepEqual(hits('pawn hold'), ['comment Najdorf Sicilian · 6. Bg5 @ 7... Qb6']);
  // "pawn" is in one comment of the Be3 chapter and "square" in another: no hit for both.
  assert.deepEqual(hits('pawn square'), []);
  assert.deepEqual(hits('d5 square'), ['comment Najdorf Sicilian · 6. Be3, the English Attack @ 7... Be6']);
  // The chapter's own comment is at its start; a chapter from a FEN numbers its moves from it.
  assert.deepEqual(hits('castles long'), ['comment Najdorf Sicilian · 6. Be3, the English Attack @ Start']);
  assert.deepEqual(hits('bridge'), ['comment Rook endings · Lucena @ 2. Rd4']);
  // A long comment: the words around the match, cut at spaces.
  const [long] = search(CHAPTERS, 'retreats').hits;
  assert.ok(long?.kind === 'comment');
  assert.ok(long.text.startsWith('… ') && long.text.endsWith('until the knight retreats.'), long.text);
  assert.ok(long.text.length < 160, String(long.text.length));
  // A short one is whole.
  const [short] = search(CHAPTERS, 'bridge').hits;
  assert.ok(short?.kind === 'comment' && short.text === 'Building the bridge.');
});

test('a position by its moves, in any order', () => {
  // 1. e4 c5 2. Nf3 d6: both Open Sicilian chapters, and the one that reaches it by 1. Nf3.
  const open = ['position Najdorf Sicilian · 6. Bg5 @ 1. e4 c5 2. Nf3 d6', 'position Najdorf Sicilian · 6. Be3, the English Attack @ 1. e4 c5 2. Nf3 d6', 'position Najdorf Sicilian · By another order @ 1. Nf3 c5 2. e4 d6'];
  assert.deepEqual(hits('1.e4 c5 2.Nf3 d6'), open);
  assert.deepEqual(hits('1. e4 c5 2. Nf3 d6'), open);
  assert.deepEqual(hits('e4 c5 Nf3 d6'), open);
  assert.deepEqual(hits('Nf3 c5 e4 d6'), open);
  const r = search(CHAPTERS, 'Nf3 c5 e4 d6');
  assert.deepEqual(r.position, { line: '1. Nf3 c5 2. e4 d6', sans: ['Nf3', 'c5', 'e4', 'd6'] });
  // A line no chapter plays is still a position: said, with nothing found.
  const none = search(CHAPTERS, '1. e4 e5 2. Ke2');
  assert.deepEqual(none.hits, []);
  assert.equal(none.position?.line, '1. e4 e5 2. Ke2');
  // Moves that don't play are words.
  assert.equal(search(CHAPTERS, 'e4 e4').position, undefined);
  assert.equal(search(CHAPTERS, 'pawn').position, undefined);
});

test('a position by its FEN: a chapter’s start, and one reached', () => {
  assert.deepEqual(hits('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1'), ['position Rook endings · Lucena @ start']);
  // The counters don't matter (D10's key), and may be left off.
  assert.deepEqual(hits('1K1k4/1P6/8/8/8/8/r7/2R5 w - -'), ['position Rook endings · Lucena @ start']);
  assert.deepEqual(hits('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2').slice(0, 2), ['position Najdorf Sicilian · 6. Bg5 @ 1. e4 c5', 'position Najdorf Sicilian · 6. Be3, the English Attack @ 1. e4 c5']);
  assert.equal(search(CHAPTERS, 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2').position?.fen, 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  // Not a position: nothing, and no position said.
  assert.equal(search(CHAPTERS, '9/9/9').position, undefined);
});

test('the query’s forms, the order of the hits and the limits', () => {
  assert.deepEqual(searchWords('  Najdorf   BG5 '), ['najdorf', 'bg5']);
  assert.deepEqual(search(CHAPTERS, '   ').hits, []);
  assert.equal(queryPosition(''), undefined);
  // As people type moves: 0-0, a ! after, numbers with or without a space.
  assert.equal(queryPosition('1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0')?.line, '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O');
  assert.equal(queryPosition('e4! c5')?.line, '1. e4 c5');
  assert.equal(queryPosition('1... e5'), undefined);
  // The position's places first, then names, then comments: "d4" is a move and a word.
  assert.deepEqual(hits('d4'), ['position Grünfeld Defence · Exchange @ 1. d4']);
  assert.deepEqual(hits('e5').map((h) => h.split(' ')[0]), ['comment']);
  // The limits: what is left out is counted, never dropped silently.
  const few = search(CHAPTERS, 'the', { chapter: 0, comment: 2, position: 1 });
  assert.equal(few.hits.filter((h) => h.kind === 'comment').length, 2);
  assert.ok(few.more.comment >= 2, String(few.more.comment));
  // Words are found inside words: "the" in "the English Attack" and in "another".
  assert.equal(few.more.chapter, 2);
  const places = search(CHAPTERS, 'e4 c5', { chapter: 9, comment: 9, position: 1 });
  assert.equal(places.hits.filter((h) => h.kind === 'position').length, 1);
  // Two chapters reach 1. e4 c5 (the third comes to the Sicilian by 1. Nf3): one shown, one counted.
  assert.equal(places.more.position, 1);
});
