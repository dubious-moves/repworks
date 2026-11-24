// A line found inside one study (PLAN.md §5.210): the owner's own line, typed with and without a
// space after the move numbers; the line itself before another order; the open chapter first; how
// far the study follows a line no chapter reaches; a FEN; what doesn't read as a line.
//
// Controls run on this file (2026-11-24):
// - the line matched by its position only (no walk of the chapter's own moves) → every test but
//   the FEN's (no hit is the line's own, and no partial);
// - `current` ignored → "the open chapter first" and the partial's chapter;
// - typed SAN kept as typed (no makeSan) → "the chapters' spelling".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { findLine, type LineChapter } from '../../../../src/core/study/findLine.ts';

function chapter(cid: string, name: string, movetext: string, fen?: string): LineChapter {
  const parsed = parseChapterFile(`[Event "Test"]\n[ChapterName "${name}"]\n${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}\n${movetext} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return { cid, name, chapter: parsed.chapter };
}

const STUDY: LineChapter[] = [
  chapter('Other', 'Other order', '1. d4 d5 2. Nc3 Nf6 3. Bf4 c6 4. e3 g6 5. h4'),
  chapter('Jobava', 'Jobava London', '1. Nc3 d5 2. d4 Nf6 (2... c6 3. Bf4) 3. Bf4 c6 (3... e6 4. Nb5) 4. e3 g6 (4... Bf5 5. f3) 5. h4 h5 6. Nf3'),
  chapter('Again', 'Again', '1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 4. e3 g6 5. h4 Bg7'),
  chapter('Check', 'Checks', '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5 7. Bd2 e6 8. Nd5 Qd8 9. Nxf6+ gxf6 10. O-O'),
];

const brief = (q: string, current?: string) => {
  const r = findLine(STUDY, q, current);
  if (!r) return undefined;
  return { line: r.line, hits: r.hits.map((h) => `${h.how} ${h.cid} @ ${h.line}`), ...(r.partial ? { partial: `${r.partial.cid} @ ${r.partial.line} (${r.partial.moves})` } : {}) };
};

const OWNER = '1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 4. e3 g6 5. h4';

test('the owner’s line, with a space after the numbers or without, or none at all', () => {
  const expected = {
    line: OWNER,
    hits: [`line Jobava @ ${OWNER}`, `line Again @ ${OWNER}`, `position Other @ 1. d4 d5 2. Nc3 Nf6 3. Bf4 c6 4. e3 g6 5. h4`],
  };
  assert.deepEqual(brief(OWNER), expected);
  assert.deepEqual(brief('1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6 5.h4'), expected);
  assert.deepEqual(brief('Nc3 d5 d4 Nf6 Bf4 c6 e3 g6 h4'), expected);
  assert.deepEqual(brief('  1 .  Nc3   d5 2.d4 Nf6 3...Bf4 c6 4.e3 g6 5.h4 '), expected);
  // Its place is the h4 move, by its path from the start.
  assert.deepEqual(findLine(STUDY, OWNER)!.hits[0]!.path, ['Nc3', 'd5', 'd4', 'Nf6', 'Bf4', 'c6', 'e3', 'g6', 'h4']);
});

test('the line itself before another order', () => {
  // The transposing chapter comes first in the study, and is listed after the line's own.
  assert.deepEqual(brief('1.d4 d5 2.Nc3 Nf6 3.Bf4')!.hits, ['line Other @ 1. d4 d5 2. Nc3 Nf6 3. Bf4', 'position Jobava @ 1. Nc3 d5 2. d4 Nf6 3. Bf4', 'position Again @ 1. Nc3 d5 2. d4 Nf6 3. Bf4']);
  // A side line of a chapter is found as well as its main line.
  assert.deepEqual(brief('1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 Bf5 5.f3')!.hits, ['line Jobava @ 1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 4. e3 Bf5 5. f3']);
});

test('the open chapter first', () => {
  assert.deepEqual(brief(OWNER, 'Again')!.hits, [`line Again @ ${OWNER}`, `line Jobava @ ${OWNER}`, `position Other @ 1. d4 d5 2. Nc3 Nf6 3. Bf4 c6 4. e3 g6 5. h4`]);
  assert.deepEqual(brief('1.d4 d5 2.Nc3 Nf6 3.Bf4', 'Again')!.hits[0], 'line Other @ 1. d4 d5 2. Nc3 Nf6 3. Bf4');
});

test('the chapters’ spelling: a check, a needless file, 0-0 and a trailing !', () => {
  const found = 'line Check @ 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5 7. Bd2 e6 8. Nd5 Qd8 9. Nxf6+ gxf6 10. O-O';
  assert.deepEqual(brief('1.e4 d5 2.exd5 Qxd5 3.Nbc3 Qa5 4.d4 Nf6 5.Ngf3 c6 6.Bc4 Bf5 7.Bd2 e6 8.Nd5 Qd8 9.Nxf6 gxf6 10.0-0!')!.hits, [found]);
  assert.deepEqual(brief('1.e4 d5 2.exd5 Qxd5 3.Nc3 Qa5 4.d4 Nf6 5.Nf3 c6 6.Bc4 Bf5 7.Bd2 e6 8.Nd5 Qd8 9.Nxf6+ gxf6 10.O-O')!.hits, [found]);
});

test('a line no chapter reaches: how far the study follows it', () => {
  assert.deepEqual(brief('1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6 5.h3'), { line: '1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 4. e3 g6 5. h3', hits: [], partial: 'Jobava @ 1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 4. e3 g6 (8)' });
  // The open chapter first among those that follow it as far.
  assert.equal(findLine(STUDY, '1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6 5.h3', 'Again')!.partial!.cid, 'Again');
  // Not one move of it: nothing.
  assert.deepEqual(brief('1.c4'), { line: '1. c4', hits: [] });
});

test('a FEN, and what isn’t a line', () => {
  const r = findLine(STUDY, 'rnb1kbnr/ppp1pppp/8/q7/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4');
  assert.deepEqual(r!.hits.map((h) => `${h.how} ${h.cid} @ ${h.line}`), ['position Check @ 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5']);
  assert.equal(findLine(STUDY, 'jobava'), undefined);
  assert.equal(findLine(STUDY, '1.Nc3 d5 2.Ke2'), undefined);
  assert.equal(findLine(STUDY, ''), undefined);
});
