// Resolving conflicts (PLAN.md §4.7): an ordinary edit of the comment with the marker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChapter } from '../../../../src/core/merge/chapter.ts';
import { openConflicts } from '../../../../src/core/merge/markers.ts';
import { resolveConflict, type Resolution } from '../../../../src/core/merge/resolve.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { writeChapter } from '../../../../src/core/pgn/write.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

const chapter = (movetext: string): Chapter => {
  const parsed = parseChapterFile(`[Event "x"]\n\n${movetext}`, 'Chapter1');
  if (!parsed.ok) assert.fail(parsed.reason);
  return parsed.chapter;
};

/** A merge with both conflict kinds: N's comment clashes, and S was deleted by ours but extended by theirs. */
function conflicted(): Chapter {
  const base = chapter('1. e4 { base } e5 (1... c5 2. Nf3) *');
  const ours = chapter('1. e4 { desktop text } e5 *');
  const theirs = chapter('1. e4 { phone text } e5 (1... c5 2. Nf3 d6) *');
  return mergeChapter(base, ours, theirs, { ours: 'desktop 2026-10-06', theirs: 'phone 2026-10-06' }).chapter;
}

const resolve = (c: Chapter, index: number, r: Resolution) => {
  const result = resolveConflict(c, openConflicts(c)[index]!, r);
  if (!result.ok) assert.fail(result.error);
  return result.value;
};

test('a merge with both kinds lists two conflicts', () => {
  const c = conflicted();
  assert.deepEqual(openConflicts(c).map((x) => [x.kind, x.path]), [['text', ['e4']], ['kept', ['e4', 'c5']]]);
});

test('clashing text: ours, theirs, both, or a new text; nothing else changes', () => {
  const c = conflicted();
  assert.match(writeChapter(resolve(c, 0, { kind: 'ours' })), /1\. e4 \{ desktop text \} 1\.\.\. e5/);
  assert.match(writeChapter(resolve(c, 0, { kind: 'theirs' })), /1\. e4 \{ phone text \} 1\.\.\. e5/);
  assert.match(writeChapter(resolve(c, 0, { kind: 'both' })), /1\. e4 \{ desktop text\nphone text \} 1\.\.\. e5/);
  assert.match(writeChapter(resolve(c, 0, { kind: 'text', text: 'my {final} text' })), /1\. e4 \{ my final text \} 1\.\.\. e5/);
  const cleared = resolve(c, 0, { kind: 'text', text: '  ' });
  assert.deepEqual(cleared.root.children[0]!.comments, []);
  // The other conflict is still open after resolving one.
  assert.deepEqual(openConflicts(resolve(c, 0, { kind: 'ours' })).map((x) => x.kind), ['kept']);
});

test('kept after delete: keep the line without its marker, or delete it after all', () => {
  const c = conflicted();
  const kept = resolve(c, 1, { kind: 'keep' });
  assert.deepEqual(openConflicts(kept).map((x) => x.kind), ['text']);
  assert.match(writeChapter(kept), /\(1\.\.\. c5 2\. Nf3 d6\)/);
  const deleted = resolve(c, 1, { kind: 'delete' });
  assert.doesNotMatch(writeChapter(deleted), /c5/);
});

test('a resolution that doesn’t fit, or a conflict already gone, is refused', () => {
  const c = conflicted();
  const [text, kept] = openConflicts(c);
  assert.equal(resolveConflict(c, kept!, { kind: 'ours' }).ok, false);
  assert.equal(resolveConflict(c, text!, { kind: 'keep' }).ok, false);
  const done = resolve(c, 0, { kind: 'ours' });
  assert.deepEqual(resolveConflict(done, text!, { kind: 'theirs' }), { ok: false, error: 'that conflict is no longer there' });
});
