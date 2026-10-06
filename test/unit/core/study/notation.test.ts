// The notation's layout (PLAN.md §4.11) numbers moves as the PGN writer does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGames } from '../../../../src/core/pgn/parse.ts';
import { writeChapter } from '../../../../src/core/pgn/write.ts';
import { notation, type Token } from '../../../../src/core/study/notation.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';

/** The tokens as movetext: moves with their numbers and glyph symbols, comments as { text }. */
const text = (tokens: Token[]) =>
  tokens
    .map((t) => (t.kind === 'move' ? `${t.number ? `${t.number} ` : ''}${t.san}${t.glyphs}` : t.kind === 'comment' ? `{ ${t.text} }` : t.kind === 'open' ? '(' : ')'))
    .join(' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')');

/** The writer's movetext with what the notation doesn't show taken out: shapes, results, $n glyphs spelled as symbols. */
const written = (c: Chapter) => {
  const stripped: Chapter = JSON.parse(JSON.stringify(c), (k, v) => (k === 'nags' ? [] : v)) as Chapter;
  return writeChapter({ ...stripped, headers: stripped.headers.filter(([k]) => k !== 'Result') })
    .split('\n\n')
    .slice(1)
    .join('\n\n')
    .replace(/ \{ \[%c[sa]l [^\]]*\](\[%cal [^\]]*\])? \}/g, ' {}')
    .replace(/\n/g, ' ');
};

test('moves are numbered as the writer numbers them, on every fixture and on random trees', () => {
  const dir = join(import.meta.dirname, '../../../fixtures/pgn');
  const chapters: Chapter[] = [];
  for (const name of ['lichess-handmade-1.pgn', 'lichess-handmade-2.pgn', 'qchess-sample.pgn', 'chessable-like.pgn', 'tool-like.pgn']) {
    for (const p of parseGames(readFileSync(join(dir, name), 'utf8'), () => 'Chapter1')) if (p.ok) chapters.push(p.chapter);
  }
  const random = mulberry32(11);
  for (let i = 0; i < 200; i++) chapters.push(randomChapter(random));
  for (const c of chapters) {
    const noGlyphs: Chapter = JSON.parse(JSON.stringify(c), (k, v) => (k === 'nags' ? [] : v)) as Chapter;
    // Shapes are shown on the board, not in the notation: an empty block stands for them here.
    const tokens = notation(noGlyphs);
    const expected = written(noGlyphs).replace(/ \{\}/g, '').replace(/\{\} /g, '').trim();
    const norm = (t: string) => t.replace(/ ?\{ \[%[^}]*\}/g, '').replace(/\s+/g, ' ').replace(/\( /g, '(').trim();
    assert.equal(norm(text(tokens)), norm(expected));
  }
});

test('glyphs show as Lichess shows them, and each move carries its path', () => {
  const [p] = parseGames('[Event "x"]\n\n1. e4! $14 e5 (1... c5 $146 2. Nf3) 2. Nf3 *', () => 'Chapter1');
  assert.ok(p?.ok);
  const moves = notation(p.chapter).filter((t) => t.kind === 'move');
  assert.deepEqual(moves.map((t) => [t.number, t.san, t.glyphs, t.path.join(' '), t.mainline]), [
    ['1.', 'e4', '!⩲', 'e4', true],
    [undefined, 'e5', '', 'e4 e5', true],
    ['1...', 'c5', 'N', 'e4 c5', false],
    ['2.', 'Nf3', '', 'e4 c5 Nf3', false],
    ['2.', 'Nf3', '', 'e4 e5 Nf3', true],
  ]);
});
