// Comments: shapes and clock commands in and out of the text, and Lichess's sanitizer
// (PLAN.md §4.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComment, sanitizeComment, shapesCommand, softCleanUp } from '../../../../src/core/pgn/comment.ts';

test('shapes come out of the text, in order, without duplicates', () => {
  const c = parseComment('[%csl Gd4,Re5][%cal Gd2d4,Rc5d4,Gd2d4] A comment');
  assert.equal(c.text, 'A comment');
  assert.deepEqual(c.shapes, [
    { brush: 'green', orig: 'd4' },
    { brush: 'red', orig: 'e5' },
    { brush: 'green', orig: 'd2', dest: 'd4' },
    { brush: 'red', orig: 'c5', dest: 'd4' },
  ]);
  assert.equal(shapesCommand(c.shapes), '[%csl Gd4,Re5][%cal Gd2d4,Rc5d4]');
});

test("lila's patterns: newlines and spaces as separators, any other letter is blue, bad squares dropped", () => {
  const c = parseComment('[%cal\nYa1h8 Bh1a8,Xe2e4,Gz9z9]');
  assert.deepEqual(c.shapes, [
    { brush: 'yellow', orig: 'a1', dest: 'h8' },
    { brush: 'blue', orig: 'h1', dest: 'a8' },
    { brush: 'blue', orig: 'e2', dest: 'e4' },
  ]);
  assert.equal(c.text, '');
});

test('clock, emt and eval are kept verbatim; [%anno] and unknown commands stay in the text', () => {
  const c = parseComment('[%eval -1.25,23] [%clk 0:03:07] [%emt 0:00:05]');
  assert.deepEqual(c, { text: '', shapes: [], clock: '0:03:07', emt: '0:00:05', eval: '-1.25,23' });
  const anno = parseComment('[%anno "Other Person", otherperson] by another author [%tqu "x"]');
  assert.equal(anno.text, '[%anno "Other Person", otherperson] by another author [%tqu "x"]');
  assert.deepEqual(anno.shapes, []);
});

test('text without commands is kept exactly; where commands were taken out, the edges are trimmed', () => {
  assert.equal(parseComment('  spaced  text ').text, '  spaced  text ');
  assert.equal(parseComment('a\nb').text, 'a\nb');
  // The block lila's export makes of "{ text] } { [%csl Gd4] }".
  assert.deepEqual(parseComment('text] [%csl Gd4]'), { text: 'text]', shapes: [{ brush: 'green', orig: 'd4' }] });
});

test("sanitize follows Lichess: braces out, spaces tidied per line, no blank lines, CRLF to LF", () => {
  assert.equal(sanitizeComment('  {Hello}   world  ').text, 'Hello world');
  assert.equal(sanitizeComment('a {b} c').text, 'a b c');
  assert.equal(sanitizeComment('a { b').text, 'a  b', 'braces go after the spaces are tidied, as on Lichess');
  assert.equal(sanitizeComment('line one   \r\n   line two\r\n\r\n\r\n\r\nline three').text, 'line one\nline two\nline three');
  assert.equal(sanitizeComment('tab\there').text, 'tabhere', 'Lichess drops tabs as invisible characters');
});

test("sanitize: Lichess's softCleanUp (NFKC with its ordinal quirk, invisible and control characters)", () => {
  assert.equal(softCleanUp('ﬁle １２ ½ 3° 1ª'), 'file 12 ½ 3º 1ª');
  // NFKC turns the no-break space into a plain one before invisible characters are removed.
  assert.equal(softCleanUp('zero\u200Bwidth\u00A0space\u0007bell\u2063x'), 'zero\u200Bwidth spacebellx');
  assert.equal(softCleanUp('emoji 👍🏽 and ZWJ 👨\u200D👩'), 'emoji 👍🏽 and ZWJ 👨\u200D👩');
  assert.equal(softCleanUp('\n\t padded \n'), 'padded');
});

test('sanitize warns over 4,000 characters instead of cutting', () => {
  const long = 'x'.repeat(4001);
  const result = sanitizeComment(long);
  assert.equal(result.text.length, 4001);
  assert.equal(result.tooLong, true);
  assert.equal(sanitizeComment('x'.repeat(4000)).tooLong, false);
});
