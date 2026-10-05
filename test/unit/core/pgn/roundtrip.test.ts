// The round-trip suite (PLAN.md §4.5):
// - Lichess's dialect is rewritten byte for byte: write(parse(F)) === F, per chapter;
// - PGN from other writers reaches a fixed point: parse(write(parse(F))) equals parse(F), and
//   writing twice gives the same text;
// - random legal trees survive write then parse.
// REPWORKS_FIXTURES=<dir> adds the owner's private files (kept in the data repo, never here):
// every *.pgn under it is a Lichess export if it carries a lichess.org ChapterURL, else another
// writer's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseChapterFile, parseGames, type ChapterParse } from '../../../../src/core/pgn/parse.ts';
import { chapterFileText, writeChapter } from '../../../../src/core/pgn/write.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';

const FIXTURES = join(import.meta.dirname, '../../../fixtures/pgn');

/** A Lichess study export: chapters each followed by three newlines. */
const splitExport = (text: string) => text.split('\n\n\n').filter((c) => c.trim() !== '');

function ok(parsed: ChapterParse): Chapter {
  if (!parsed.ok) assert.fail(`refused: ${parsed.reason}`);
  return parsed.chapter;
}

function assertByteRoundTrip(name: string, text: string) {
  for (const [i, chunk] of splitExport(text).entries()) {
    const parsed = parseChapterFile(chunk, 'Chapter1');
    const chapter = ok(parsed);
    assert.deepEqual(parsed.ok && parsed.notes, [], `${name} chapter ${i + 1}: import notes`);
    assert.equal(writeChapter(chapter), chunk, `${name} chapter ${i + 1}`);
  }
}

function assertFixedPoint(name: string, text: string) {
  let n = 0;
  for (const parsed of parseGames(text, () => `Chapter${++n}`)) {
    const first = ok(parsed);
    const written = writeChapter(first);
    const again = ok(parseChapterFile(written, first.id));
    assert.deepEqual(again, first, `${name}: parse(write(parse(F))) equals parse(F)`);
    assert.equal(writeChapter(again), written, `${name}: writing is stable`);
  }
}

test('hand-made fixtures in Lichess dialect are rewritten byte for byte', () => {
  for (const f of ['lichess-handmade-1.pgn', 'lichess-handmade-2.pgn']) {
    assertByteRoundTrip(f, readFileSync(join(FIXTURES, f), 'utf8').replace(/\n$/, ''));
  }
});

test("lila's merge of adjacent blocks is reproduced, and read back as the same model", () => {
  const text = [
    '[Event "Merged blocks"]',
    '[Result "*"]',
    '',
    '{ see [%anno "A", a] note] [%csl Gd4] }',
    '1. e4 { [%eval 0.17] [%anno "B", b] text } 1... e5 { ends with a bracket] [%csl Re5][%cal Gg1f3] [%clk 0:02:59] } 2. Nf3 { [%csl Gd4][%cal Gd2d4] [%clk 0:02:58] } *',
  ].join('\n');
  assertByteRoundTrip('merged', text);
  const chapter = ok(parseChapterFile(text, 'Chapter1'));
  assert.deepEqual(chapter.root.comments, ['see [%anno "A", a] note]']);
  const e4 = chapter.root.children[0]!;
  assert.deepEqual([e4.eval, e4.comments], ['0.17', ['[%anno "B", b] text']]);
  const e5 = e4.children[0]!;
  assert.deepEqual([e5.comments, e5.shapes.length, e5.clock], [['ends with a bracket]'], 2, '0:02:59']);
});

test('chapters with no moves, a result, a Black start and escapes are written as scalachess writes them', () => {
  assertByteRoundTrip('empty', '[Event "Empty"]\n[Result "*"]\n\n *');
  assertByteRoundTrip('empty with comment', '[Event "Empty"]\n[Result "*"]\n\n{ Only a comment } { [%csl Ge4] }\n *');
  assertByteRoundTrip('result', '[Event "Done"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  assertByteRoundTrip('escapes', '[Event "A \\"quoted\\" \\\\ name"]\n[Result "*"]\n\n1. d4 *');
  assertByteRoundTrip('glyphs', '[Event "Glyphs"]\n[Result "*"]\n\n1. e4! e5? 2. Nf3!! Nc6?? 3. Bb5!? a6?! 4. Ba4 $7 b5 $22 $14 5. Bb3 $146 $32 Na5 $10 $36 $40 $132 $138 $44 $140 *');
  assertByteRoundTrip('black first', '[Event "Black"]\n[Result "*"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n[SetUp "1"]\n\n1... c5 (1... e5 2. Nf3 (2. Bc4) 2... Nc6) 2. Nf3 *');
});

test('PGN from other writers reaches a fixed point after one write', () => {
  for (const f of ['qchess-sample.pgn', 'chessbase-like.pgn', 'tool-like.pgn', 'chessable-like.pgn']) {
    assertFixedPoint(f, readFileSync(join(FIXTURES, f), 'utf8'));
  }
});

test('Qchess: its single block becomes text and shapes, glyphs land in their groups, Black is numbered', () => {
  let n = 0;
  const [first, second] = parseGames(readFileSync(join(FIXTURES, 'qchess-sample.pgn'), 'utf8'), () => `Chapter${++n}`).map(ok);
  assert.deepEqual(first!.root.comments, ['The key square (with braces typed as parens)']);
  assert.deepEqual(first!.root.shapes, [
    { brush: 'green', orig: 'd5' },
    { brush: 'green', orig: 'f6', dest: 'd5' },
  ]);
  const written = writeChapter(first!);
  assert.match(written, /^\{ The key square \(with braces typed as parens\) \} \{ \[%csl Gd5\]\[%cal Gf6d5\] \}\n1\. e4/m);
  assert.match(written, / 2\. Nf3 d6 \$146 \{ Prepare d4 \} \{ \[%cal Rd2d4\] \} 3\. d4 /);
  assert.match(written, / 6\. Bg5!\? \{ sharp \} 6\.\.\. e6 \(6\.\.\. Nbd7\?! /);
  assert.match(written, / 7\. f4 \$16$/);
  // A FEN with Black to move: "2... d6", and a position glyph and an observation kept as $n.
  assert.match(writeChapter(second!), /\n\n2\.\.\. d6! \{ \[%csl Rd4\] \} 3\. d4 cxd4 \$22 \$132 4\. Nxd4$/);
});

test('random legal chapters survive write then parse', () => {
  const random = mulberry32(5);
  for (let i = 0; i < 300; i++) {
    const chapter = randomChapter(random, 'Rand0001');
    const text = chapterFileText(chapter);
    const parsed = parseChapterFile(text, chapter.id);
    assert.ok(parsed.ok, `case ${i}: ${!parsed.ok && parsed.reason}`);
    assert.deepEqual(parsed.notes, [], `case ${i}`);
    assert.deepEqual(parsed.chapter, chapter, `case ${i}:\n${text}`);
  }
});

const privateDir = process.env['REPWORKS_FIXTURES'];
test('private fixtures (REPWORKS_FIXTURES)', { skip: privateDir ? false : 'REPWORKS_FIXTURES is not set' }, () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.pgn')) files.push(path);
    }
  };
  walk(privateDir!);
  assert.ok(files.length > 0, `no .pgn files under ${privateDir}`);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (/\[ChapterURL "https:\/\/lichess\.org\/study\//.test(text)) assertByteRoundTrip(file, text);
    else assertFixedPoint(file, text);
  }
});
