import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterExportName } from '../../../../src/core/pgn/write.ts';

test('a chapter export is named <study> - <chapter>.pgn', () => {
  assert.equal(chapterExportName('Najdorf', 'English Attack'), 'Najdorf - English Attack.pgn');
});

test('characters a file system refuses become spaces, and runs of spaces one', () => {
  assert.equal(chapterExportName('Rep: 1.e4', 'a/b\\c*d?"e"<f>|g\n'), 'Rep 1.e4 - a b c d e f g.pgn');
});

test('an empty part is left out; with neither the file is still named', () => {
  assert.equal(chapterExportName('Study', '  '), 'Study.pgn');
  assert.equal(chapterExportName('', ''), 'chapter.pgn');
  assert.equal(chapterExportName('..', ''), 'chapter.pgn');
});

test('a long name is cut', () => {
  assert.ok(chapterExportName('x'.repeat(300), 'y').length <= 124);
});
