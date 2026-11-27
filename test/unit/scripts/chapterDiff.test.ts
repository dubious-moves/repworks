// The change list between two versions of a study's chapters (PLAN.md §5.214): the chapters
// paired, every item's link read back by the app's own router to the move it names, the list as
// Markdown with every line in full, and the script itself over a scratch data repo: a commit
// against the checkout, a PGN file against a study, and what it refuses.
// The same changes as a review list for the study page (§5.216), with a session's notes and
// questions, and the owner's answers read back from the logs.
//
// Controls run on this file (2026-11-27):
// - a removed part linked at its own first move → "every link opens at its move";
// - chapters paired by name only → "paired by id within one study";
// - `appended` given only an exact prefix → "a comment added to";
// - a note never matched to a change (always a question) → "a review list from the changes";
// - a removed part's item keyed by the move it opens at → the same test (its id).
// (A link written by hand, the SANs joined unencoded, reads back the same: the links are the
// router's own `modeHash` so that they stay its addresses, not because a test would catch it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseHash } from '../../../src/core/app/fsm.ts';
import { parseChapterFile } from '../../../src/core/pgn/parse.ts';
import { parseReviewList, reviewCard, writeReviewList } from '../../../src/core/study/reviewList.ts';
import { answered, answersMarkdown, appended, markdown, pairChapters, report, reviewList, SITE, type Version } from '../../../scripts/chapter-diff-lib.ts';

const pgn = (name: string, movetext: string) => `[Event "Test"]\n[ChapterName "${name}"]\n[Orientation "white"]\n\n${movetext} *\n`;
function version(label: string, chapters: [cid: string | undefined, name: string, movetext: string][], sid?: string): Version {
  return {
    label,
    ...(sid ? { sid, study: 'Nc3' } : {}),
    chapters: chapters.map(([cid, name, movetext], i) => {
      const parsed = parseChapterFile(pgn(name, movetext), cid ?? `file${i}`);
      if (!parsed.ok) throw new Error(parsed.reason);
      return { name, ...(cid ? { cid } : {}), chapter: parsed.chapter };
    }),
  };
}

const OLD = '1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4 a6 4. e3) 3. f3 e6 4. e4 Bg6 5. h4 h6 6. exd5 { Opens the e-file. }';
const NEW = '1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. f3 e6 4. e4 Bg6 5. h4 h6 (5... h5 6. Bg5 Be7 (6... f6 7. Be3) 7. Qd2 { Castle long next. }) 6. exd5 { Opens the e-file.\nThen the queen checks: (6... exd5 7. Qe2+) [%cal Gd1e2] } 6... exd5 7. Qe2+ Be7 8. Bf4 c6 9. O-O-O';

test('chapters paired by id within one study, by name across studies and files, and the last one left on each side', () => {
  const a = version('a', [['chapt001', 'Jobava', '1. Nc3'], ['chapt002', '1... e5', '1. Nc3 e5'], ['chapt003', 'Gone', '1. Nc3 c5']], 'study001');
  const renamed = version('b', [['chapt002', 'Jobava', '1. Nc3 e5'], ['chapt001', 'Main Jobava', '1. Nc3'], ['chapt009', 'New', '1. Nc3 f5']], 'study001');
  assert.deepEqual(pairChapters(a, renamed).map((p) => [p.name, p.old?.cid, p.now?.cid]), [['Jobava', 'chapt002', 'chapt002'], ['Main Jobava', 'chapt001', 'chapt001'], ['New', undefined, 'chapt009'], ['Gone', 'chapt003', undefined]]);
  const other = version('b', [['other001', 'JOBAVA', '1. Nc3'], ['other002', 'New', '1. Nc3 f5'], ['other003', 'Newer', '1. Nc3 b6']], 'study002');
  assert.deepEqual(pairChapters(a, other).map((p) => [p.name, p.old?.cid, p.now?.cid]), [['JOBAVA', 'chapt001', 'other001'], ['New', undefined, 'other002'], ['Newer', undefined, 'other003'], ['1... e5', 'chapt002', undefined], ['Gone', 'chapt003', undefined]]);
  const file = version('delivered.pgn', [[undefined, 'Chapter 1', '1. Nc3']]);
  assert.deepEqual(pairChapters(file, version('b', [['chapt001', 'Jobava', '1. Nc3']], 'study001')).map((p) => [p.old?.name, p.now?.cid]), [['Chapter 1', 'chapt001']]);
});

test('every link opens at its move: read back by the router, a check and castling in the line; a removed part at the last move still there', () => {
  const r = report(version('old', [['chapt001', 'Jobava', OLD]], 'study001'), version('new', [['chapt001', 'Jobava', NEW]], 'study001'));
  const c = r.chapters[0]!;
  assert.equal(c.state, 'changed');
  assert.equal(c.link, `${SITE}#/study/study001/chapt001`);
  const at = (link: string | undefined) => {
    assert.ok(link?.startsWith(SITE));
    const mode = parseHash(link!.slice(SITE.length));
    assert.equal(mode.name, 'chapter');
    return mode.name === 'chapter' ? [mode.sid, mode.cid, (mode.at ?? []).join(' ')] : [];
  };
  const by = (kind: string) => c.items.filter((i) => i.kind === kind);
  assert.deepEqual(by('added').map((i) => at(i.link)[2]), ['Nc3 d5 d4 Bf5 f3 e6 e4 Bg6 h4 h6 exd5 exd5', 'Nc3 d5 d4 Bf5 f3 e6 e4 Bg6 h4 h5']);
  assert.deepEqual(at(by('added')[0]!.link).slice(0, 2), ['study001', 'chapt001']);
  // The removed 3...a6 opens at 3.Bf4, which the new version still has.
  assert.deepEqual(by('removed').map((i) => [at(i.link)[2], i.linkAt]), [['Nc3 d5 d4 g6 Bf4', '3. Bf4']]);
  assert.deepEqual(by('comment').map((i) => at(i.link)[2]), ['Nc3 d5 d4 Bf5 f3 e6 e4 Bg6 h4 h6 exd5']);
  // A link deep in the added line: its check mark survives the address.
  const deep = report(version('old', [['chapt001', 'Jobava', '1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. f3 e6 4. e4 Bg6 5. h4 h6 6. exd5 exd5 7. Qe2+ Be7']], 'study001'), version('new', [['chapt001', 'Jobava', NEW]], 'study001'));
  assert.deepEqual(deep.chapters[0]!.items.filter((i) => i.kind === 'added').map((i) => at(i.link)[2]), ['Nc3 d5 d4 Bf5 f3 e6 e4 Bg6 h4 h6 exd5 exd5 Qe2+ Be7 Bf4', 'Nc3 d5 d4 Bf5 f3 e6 e4 Bg6 h4 h5']);
});

test('the list as Markdown: full lines with the new part marked, a part\'s other lines and comments, a comment added to, the counts', () => {
  const r = report(version('delivered.pgn', [[undefined, 'Jobava', OLD]]), version('repworks-data, study Nc3', [['chapt001', 'Jobava', NEW]], 'study001'), { mark: 'Castle long' });
  const md = markdown(r);
  assert.match(md, /^# What changed\n\nFrom \*\*delivered\.pgn\*\* to \*\*repworks-data, study Nc3\*\*\.\n/);
  assert.match(md, /\n2 parts added \(12 moves\), 1 part removed \(2 moves\), 1 comment changed, arrows changed at 1 move\.\n/);
  assert.ok(md.includes('- 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4 h6 6. exd5 **exd5 7. Qe2+ Be7 8. Bf4 c6 9. O-O-O** (6 moves) · [open]('), md);
  assert.ok(md.includes('- 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4 **h5 6. Bg5 Be7 7. Qd2** (6 moves, 2 lines) · [open]('), md);
  assert.ok(md.includes('  - also: 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4 **h5 6. Bg5 f6 7. Be3**\n  - comment at 7. Qd2:\n    > Castle long next.\n'), md);
  assert.ok(md.includes('- 1. Nc3 d5 2. d4 g6 3. Bf4 **a6 4. e3** (2 moves) · [open at 3. Bf4]('), md);
  assert.ok(md.includes('  - added after the old text:\n    > Then the queen checks: (6... exd5 7. Qe2+)\n'), md);
  assert.ok(md.includes('### Arrows and glyphs (1)\n\n- 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4 h6 6. exd5 · [open]('), md);
  assert.ok(md.includes('arrows added Gd1e2\n'), md);
  assert.ok(md.includes('### Open questions (1)\n\n- 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4 h5 6. Bg5 Be7 7. Qd2 · [open]('), md);
  assert.ok(!md.includes('…') && !md.includes('...\n'), 'no line is cut');
  // One more line than --max-lines shows: the rest counted, never dropped silently.
  assert.ok(markdown(r, { maxLines: 0 }).includes('  - also: '));
  const many = report(version('a', [[undefined, 'J', '1. Nc3']]), version('b', [[undefined, 'J', '1. Nc3 d5 (1... e5) (1... c5) (1... Nf6) 2. d4 Nf6 (2... e6) (2... c6)']]));
  assert.match(markdown(many, { maxLines: 1 }), /- 1\. Nc3 \*\*d5 2\. d4 Nf6\*\* \(5 moves, 3 lines\)\n  - also: 1\. Nc3 \*\*d5 2\. d4 e6\*\*\n  - and 1 more line \(--max-lines 0 lists all\)\n/);
  assert.match(markdown(many), /No links: the new version is a file/);
});

test('my move changed: the old line and the new one, each to its end; unchanged, new and gone chapters', () => {
  const old = version('old', [['chapt001', 'Jobava', '1. Nc3 d5 2. d4 e6 3. Bf4 Bd6 4. e3 Bxf4 5. exf4 Qd6 6. Qd2 Nf6 7. Nf3'], ['chapt002', 'Same', '1. Nc3 e5 2. Nf3'], ['chapt003', 'Old one', '1. Nc3 c5']], 'study001');
  const now = version('new', [['chapt001', 'Jobava', '1. Nc3 d5 2. d4 e6 3. Bf4 Bd6 4. e3 Bxf4 5. exf4 Qd6 6. Nb5 Qxf4 7. Ne2'], ['chapt002', 'Same', '1. Nc3 e5 2. Nf3'], ['chapt004', 'New one', '1. Nc3 f5 2. e4']], 'study001');
  const md = markdown(report(old, now));
  assert.ok(md.includes('### My moves changed (1)\n\n- 1. Nc3 d5 2. d4 e6 3. Bf4 Bd6 4. e3 Bxf4 5. exf4 Qd6 **6. Nb5** · [open]('), md);
  assert.ok(md.includes('  - was: 1. Nc3 d5 2. d4 e6 3. Bf4 Bd6 4. e3 Bxf4 5. exf4 Qd6 **6. Qd2 Nf6 7. Nf3**\n  - now: 1. Nc3 d5 2. d4 e6 3. Bf4 Bd6 4. e3 Bxf4 5. exf4 Qd6 **6. Nb5 Qxf4 7. Ne2**\n  - the new move is new; the old one is gone\n'), md);
  assert.ok(md.includes(`## New one · [open](${SITE}#/study/study001/chapt004)\n\nA new chapter, 3 moves.\n`), md);
  assert.ok(md.includes('## Old one\n\nOnly in the old version (2 moves).\n'), md);
  assert.ok(md.endsWith('Unchanged: Same.\n'), md);
});

test('a comment added to: what came after the old text, its line wraps aside; not when the old text changed', () => {
  assert.equal(appended('The bishop is traded here', 'The bishop is traded here\nElse the pawn goes on: (6... Nc6 7. g5)'), 'Else the pawn goes on: (6... Nc6 7. g5)');
  assert.equal(appended('Joins the line with 2... Nc6 3. Bf4 e6', 'Joins the line with 2... Nc6 3. Bf4\ne6\nRare moves get the same answer.'), 'Rare moves get the same answer.');
  assert.equal(appended('The bishop is traded here', 'The bishop is traded\nElse the pawn goes on'), undefined);
  assert.equal(appended('Same', 'Same'), undefined);
});

// ---- The review list (§5.216) ----

const REVIEW_OLD = '1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4 a6 4. e3) 3. e3 { Solid. } 3... e6';
const REVIEW_NEW = '1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. f3 { Takes e4 from the bishop. } (3. e3 { Solid. } 3... e6) 3... e6 4. e4 Bg6 (4... dxe4 5. fxe4) 5. h4';
const reviewSides = () => [version('data@before, study Nc3', [['chapt001', 'Jobava', REVIEW_OLD], ['chapt002', 'Other', '1. Nc3 e5 2. Nf3']], 'study001'), version('data@after, study Nc3', [['chapt001', 'Jobava', REVIEW_NEW], ['chapt002', 'Other', '1. Nc3 e5 2. Nf3 Nc6'], ['chapt003', 'Fresh', '1. Nc3 f5 2. e4']], 'study001')] as const;

test('a review list from the changes: an item a change, at its move; a note on a change is its text, another a question', () => {
  const [old, now] = reviewSides();
  const made = reviewList(report(old, now), now, {
    name: 'batch-4',
    title: 'Jobava batch 4',
    created: '2026-11-27T18:00:00.000Z',
    notes: [
      { moves: '1. Nc3 d5 2. d4 Bf5 3. f3', text: 'The system move against an early ...Bf5.' },
      { moves: '1.Nc3 d5 2.d4 g6 3.Bf4 a6', text: 'Not drilled: you play e4 there.' },
      { moves: '1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4', text: 'Drill 5... h5 too, or a line in this comment?' },
      { chapter: 'Other', moves: '1. Nc3 e5', text: 'Keep this chapter as it is?' },
    ],
  });
  assert.ok(made.ok, made.ok ? '' : made.error);
  const { list } = made;
  assert.deepEqual({ sid: list.sid, name: list.name, title: list.title, from: list.from, to: list.to, chapters: list.chapters }, { sid: 'study001', name: 'batch-4', title: 'Jobava batch 4', from: 'data@before, study Nc3', to: 'data@after, study Nc3', chapters: { chapt001: 'Jobava', chapt002: 'Other', chapt003: 'Fresh' } });
  assert.deepEqual(
    list.items.map((i) => [i.cid.slice(-1), i.kind, i.at.join(' '), i.lead, i.part, i.san ?? '', i.text ?? '']),
    [
      ['1', 'move', 'Nc3 d5 d4 Bf5 f3', '1. Nc3 d5 2. d4 Bf5', '3. f3', 'f3', 'The system move against an early ...Bf5.'],
      ['1', 'added', 'Nc3 d5 d4 Bf5 f3', '1. Nc3 d5 2. d4 Bf5', '3. f3 e6 4. e4 Bg6 5. h4', '', ''],
      ['1', 'removed', 'Nc3 d5 d4 g6 Bf4', '1. Nc3 d5 2. d4 g6 3. Bf4', 'a6 4. e3', 'a6', 'Not drilled: you play e4 there.'],
      ['2', 'added', 'Nc3 e5 Nf3 Nc6', '1. Nc3 e5 2. Nf3', 'Nc6', '', ''],
      ['3', 'added', '', '', 'A new chapter (3 moves)', '', ''],
      ['1', 'question', 'Nc3 d5 d4 Bf5 f3 e6 e4 Bg6 h4', '1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6', '5. h4', '', 'Drill 5... h5 too, or a line in this comment?'],
      ['2', 'question', 'Nc3 e5', '1. Nc3', 'e5', '', 'Keep this chapter as it is?'],
    ],
  );
  // What an item says more: my move's old and new line, a part's other lines and comments.
  assert.deepEqual(list.items[0]!.detail, ['was: 1. Nc3 d5 2. d4 Bf5 3. e3 e6', 'now: 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4', 'the old move stays as a side line']);
  assert.deepEqual(list.items[1]!.detail, ['also: 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 dxe4 5. fxe4', 'comment at 3. f3: Takes e4 from the bishop.']);
  // Ids name the change, so a list made again keeps its answers: a removed part by the move taken away.
  assert.deepEqual(list.items.slice(0, 3).map((i) => i.id), ['chapt001.move.Nc3,d5,d4,Bf5,f3', 'chapt001.added.Nc3,d5,d4,Bf5,f3', 'chapt001.removed.Nc3,d5,d4,g6,Bf4,a6']);
  assert.equal(new Set(list.items.map((i) => i.id)).size, list.items.length);
  const again = parseReviewList(writeReviewList(list));
  assert.ok(again.ok);
  assert.deepEqual(again.list, list);
});

test('a review list refused: the new side a file, a name the repo can\'t carry, a note that names no move of the new version', () => {
  const [old, now] = reviewSides();
  const r = report(old, now);
  const error = (m: ReturnType<typeof reviewList>) => (m.ok ? 'made' : m.error);
  const file = version('next.pgn', [[undefined, 'Jobava', REVIEW_NEW]]);
  assert.match(error(reviewList(report(old, file), file, { name: 'batch-4', created: 't' })), /the new side is a file/);
  assert.match(error(reviewList(r, now, { name: 'Batch 4', created: 't' })), /lower-case letters, digits and dashes/);
  assert.match(error(reviewList(r, now, { name: 'b', created: 't', notes: [{ moves: 'not moves', text: 'x' }] })), /don't read as a line/);
  assert.match(error(reviewList(r, now, { name: 'b', created: 't', notes: [{ moves: '1. Nc3 d5 2. d4 c6', text: 'x' }] })), /no chapter plays 1\. Nc3 d5 2\. d4 c6/);
  // A move every chapter plays: the chapter must be named.
  assert.match(error(reviewList(r, now, { name: 'b', created: 't', notes: [{ moves: '1. Nc3', text: 'x' }] })), /several chapters play 1\. Nc3: name the chapter/);
  assert.equal(error(reviewList(r, now, { name: 'b', created: 't', notes: [{ chapter: 'chapt003', moves: '1. Nc3', text: 'x' }] })), 'made');
});

test('the owner\'s answers read back: from every device\'s log, the latest of each, and the items he changed in the chapter', () => {
  const [old, now] = reviewSides();
  const made = reviewList(report(old, now), now, { name: 'batch-4', title: 'Jobava batch 4', created: '2026-11-27T18:00:00.000Z' });
  assert.ok(made.ok);
  const { list } = made;
  const say = (n: number, t: string, item: number, a: string, note?: string) => JSON.stringify({ v: 1, n, t, k: 'answer', card: reviewCard(list.sid, list.name, list.items[item]!.id), a, ...(note ? { note } : {}) });
  const files = new Map([
    ['progress/Phone001/2026-11-27.jsonl', [say(1, '2026-11-27T19:00:00.000Z', 0, 'ok'), say(2, '2026-11-27T19:01:00.000Z', 2, 'ok'), say(3, '2026-11-27T19:02:00.000Z', 3, 'open', 'which line is this?')].join('\n') + '\n'],
    ['progress/Desktop1/2026-11-27.jsonl', say(1, '2026-11-27T19:30:00.000Z', 2, 'no', 'keep 3... a6, I meet it a lot') + '\n'],
  ]);
  // The owner cut the new line back in the app: 4. e4 and what followed are gone.
  const edited = parseChapterFile(pgn('Jobava', '1. Nc3 d5 2. d4 Bf5 (2... g6 3. Bf4) 3. e3 { Solid. } 3... e6'), 'chapt001');
  assert.ok(edited.ok);
  const chapters = new Map([['chapt001', edited.chapter], ...now.chapters.slice(1).map((c) => [c.cid!, c.chapter] as const)]);
  const [got] = answered([list], files, chapters);
  assert.deepEqual(got!.items.map((i) => [i.item.kind, i.state, i.answer?.note ?? '']), [['move', 'ok', ''], ['added', 'moved', ''], ['removed', 'no', 'keep 3... a6, I meet it a lot'], ['added', 'noted', 'which line is this?'], ['added', 'open', '']]);
  assert.deepEqual(got!.counts, { open: 1, ok: 1, no: 1, noted: 1, moved: 1 });
  const md = answersMarkdown([got!]);
  assert.ok(md.includes('## Jobava batch 4 (batch-4)\n\n5 items: 1 OK, 1 No, 1 with a note only, 1 changed in the chapter since, 1 not answered.\n'), md);
  assert.ok(md.includes('### No (1)\n\n- Jobava, removed: 1. Nc3 d5 2. d4 g6 3. Bf4 a6 4. e3\n  - note:\n    > keep 3... a6, I meet it a lot\n'), md);
  assert.ok(md.includes('### Changed in the chapter since (1)\n\n- Jobava, added: 1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4\n'), md);
  assert.ok(md.indexOf('### No') < md.indexOf('### OK'), 'what needs the session first');
});

// ---- The script, over a scratch data repo ----

const script = new URL('../../../scripts/chapter-diff.ts', import.meta.url).pathname;
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
const git = (dir: string, ...args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).stdout.trim();

test('the script: a commit against the checkout, a PGN file against a study, JSON, and what it refuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-diff-'));
  try {
    const repo = join(dir, 'data');
    const study = (sid: string, name: string, chapters: [string, string, string][]) => {
      mkdirSync(join(repo, 'studies', sid), { recursive: true });
      writeFileSync(join(repo, 'studies', sid, 'study.json'), `${JSON.stringify({ format: 1, id: sid, name, kind: 'repertoire', chapters: chapters.map((c) => c[0]) })}\n`);
      for (const [cid, chapter, movetext] of chapters) writeFileSync(join(repo, 'studies', sid, `${cid}.pgn`), pgn(chapter, movetext));
    };
    mkdirSync(repo);
    writeFileSync(join(repo, 'repworks.json'), '{ "format": 1 }\n');
    study('Nc3Jobav', 'Nc3 + Jobava', [['chJobava', 'Jobava', OLD], ['chE5line', '1... e5', '1. Nc3 e5 2. Nf3']]);
    study('Review01', 'Review', [['chReview', 'Jobava', OLD]]);
    study('Review02', 'review', [['chOther1', 'Jobava', OLD]]);
    git(repo, 'init', '-q');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'the session: Jobava v1');
    const first = git(repo, 'rev-parse', '--short', 'HEAD');
    // The owner's edits in the app, and the study renamed since.
    study('Nc3Jobav', '1. Nc3 + Jobava', [['chJobava', 'Jobava', NEW], ['chE5line', '1... e5', '1. Nc3 e5 2. Nf3']]);
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'phone: 1 study file');
    const delivered = join(dir, 'delivered.pgn');
    writeFileSync(delivered, pgn('Jobava simplified', OLD));

    const byCommit = run(`${repo}@${first}`, repo, '--study', '1. nc3 + jobava');
    assert.equal(byCommit.status, 0, byCommit.stderr);
    assert.ok(byCommit.stdout.includes(`From **data@${first}, study Nc3 + Jobava** to **data, study 1. Nc3 + Jobava**.`), byCommit.stdout);
    assert.ok(byCommit.stdout.includes(`## Jobava · [open](${SITE}#/study/Nc3Jobav/chJobava)`), byCommit.stdout);
    assert.ok(byCommit.stdout.includes('Unchanged: 1... e5.'), byCommit.stdout);
    assert.equal(run(repo, repo, '--study', 'Nc3Jobav').stdout.includes('Unchanged: Jobava, 1... e5.'), true);

    // The file's one game against the chapter asked for, whatever the file calls it.
    const byFile = run(delivered, repo, '--study', 'Nc3Jobav', '--chapter', 'jobava', '--json', '--site', 'http://localhost:5173/repworks');
    assert.equal(byFile.status, 0, byFile.stderr);
    const json = JSON.parse(byFile.stdout) as { old: string; chapters: { name: string; state: string; counts: { added: number }; items: { kind: string; link?: string }[] }[] };
    assert.equal(json.old, 'delivered.pgn');
    assert.deepEqual(json.chapters.map((c) => [c.name, c.state, c.counts.added]), [['Jobava', 'changed', 2]]);
    assert.deepEqual(json.chapters[0]!.items.filter((i) => !i.link).map((i) => i.kind), ['header'], 'the file calls the chapter something else');
    assert.ok(json.chapters[0]!.items.filter((i) => i.kind !== 'header').every((i) => i.link?.startsWith('http://localhost:5173/repworks/#/study/Nc3Jobav/chJobava?at=Nc3,d5')));
    assert.ok(!run(delivered, repo, '--study', 'Nc3Jobav', '--no-links').stdout.includes(']('));
    // A review copy against the study it came from.
    const copy = run(repo, repo, '--old-study', 'Review01', '--study', 'Nc3Jobav', '--chapter', 'Jobava');
    assert.match(copy.stdout, /From \*\*data, study Review\*\* to \*\*data, study 1\. Nc3 \+ Jobava\*\*\./);
    assert.match(copy.stdout, /2 parts added \(12 moves\)/);

    for (const [args, message] of [
      [[repo, repo], /--study is needed, one of: .*Review \(Review01\)/],
      [[repo, repo, '--study', 'review'], /2 studies are named "review", give the id: Review01, Review02/],
      [[repo, repo, '--study', 'nope'], /no study "nope"/],
      [[`${repo}@nope`, repo, '--study', 'Nc3Jobav'], /no commit nope/],
      [[delivered, repo, '--study', 'Nc3Jobav', '--chapter', 'nope'], /no chapter "nope"; the new side has: Jobava, 1\.\.\. e5/],
      [[delivered], /usage:/],
      [[join(dir, 'missing.pgn'), repo, '--study', 'Nc3Jobav'], /not a PGN file, a data repo checkout/],
    ] as [string[], RegExp][]) {
      const r = run(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, message);
      assert.equal(r.stdout, '');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const answers = new URL('../../../scripts/review-answers.ts', import.meta.url).pathname;

test('the scripts: --review writes the list into the checkout, which validates; review-answers reads the answers from it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-review-'));
  try {
    const repo = join(dir, 'data');
    mkdirSync(join(repo, 'studies', 'Nc3Jobav'), { recursive: true });
    writeFileSync(join(repo, 'repworks.json'), '{ "format": 1 }\n');
    writeFileSync(join(repo, 'studies', 'Nc3Jobav', 'study.json'), `${JSON.stringify({ format: 1, id: 'Nc3Jobav', name: 'Nc3 + Jobava', kind: 'repertoire', chapters: ['chJobava'] })}\n`);
    const chapterFile = join(repo, 'studies', 'Nc3Jobav', 'chJobava.pgn');
    writeFileSync(chapterFile, pgn('Jobava', REVIEW_OLD));
    git(repo, 'init', '-q');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'before');
    writeFileSync(chapterFile, pgn('Jobava', REVIEW_NEW));
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'session: Jobava batch 4');
    const notes = join(dir, 'notes.json');
    writeFileSync(notes, JSON.stringify([{ moves: '1. Nc3 d5 2. d4 Bf5 3. f3', text: 'The system move.' }]));

    const made = run(`${repo}@HEAD~1`, `${repo}@HEAD`, '--study', 'Nc3Jobav', '--review', 'batch-4', '--title', 'Jobava batch 4', '--notes', notes);
    assert.equal(made.status, 0, made.stderr);
    assert.match(made.stderr, /wrote .*review\/Nc3Jobav\/batch-4\.json: 3 item\(s\), 1 with your words\. Commit it with the study\./);
    assert.match(made.stdout, /^# What changed/, 'the list for the chat is still printed');
    const file = join(repo, 'review', 'Nc3Jobav', 'batch-4.json');
    const read = parseReviewList(readFileSync(file, 'utf8'));
    assert.ok(read.ok);
    assert.deepEqual(read.list.items.map((i) => [i.kind, i.text ?? '']), [['move', 'The system move.'], ['added', ''], ['removed', '']]);
    const validate = spawnSync(process.execPath, [new URL('../../../scripts/validate-data.ts', import.meta.url).pathname, repo], { encoding: 'utf8' });
    assert.equal(validate.status, 0, validate.stdout + validate.stderr);
    assert.match(validate.stdout + validate.stderr, /0 error\(s\)/);
    assert.doesNotMatch(validate.stdout + validate.stderr, /review\//, 'nothing said of the list');

    // The owner's device synced: an answer in its log. Then the answers, read.
    mkdirSync(join(repo, 'progress', 'Phone001'), { recursive: true });
    writeFileSync(join(repo, 'progress', 'Phone001', '2026-11-27.jsonl'), `${JSON.stringify({ v: 1, n: 1, t: '2026-11-27T19:00:00.000Z', k: 'answer', card: reviewCard('Nc3Jobav', 'batch-4', read.list.items[0]!.id), a: 'no', note: 'e3 stays my move' })}\n`);
    const got = spawnSync(process.execPath, [answers, repo, '--study', 'nc3 + jobava'], { encoding: 'utf8' });
    assert.equal(got.status, 0, got.stderr);
    assert.ok(got.stdout.includes('3 items: 0 OK, 1 No, 0 with a note only, 0 changed in the chapter since, 2 not answered.'), got.stdout);
    assert.ok(got.stdout.includes('- Jobava, move: 1. Nc3 d5 2. d4 Bf5 3. f3\n  - note:\n    > e3 stays my move\n'), got.stdout);
    const json = JSON.parse(spawnSync(process.execPath, [answers, repo, '--study', 'Nc3Jobav', '--list', 'batch-4', '--json'], { encoding: 'utf8' }).stdout) as { counts: { no: number } }[];
    assert.equal(json[0]!.counts.no, 1);

    // Refused: a file as the new side, a name the repo can't carry, a list that isn't there.
    const next = join(dir, 'next.pgn');
    writeFileSync(next, pgn('Jobava', REVIEW_NEW));
    const refused = run(repo, next, '--study', 'Nc3Jobav', '--review', 'batch-5');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /the new side is a file/);
    assert.equal(run(`${repo}@HEAD~1`, repo, '--study', 'Nc3Jobav', '--review', 'Batch 5').status, 1);
    assert.equal(existsSync(join(repo, 'review', 'Nc3Jobav', 'batch-5.json')), false);
    const none = spawnSync(process.execPath, [answers, repo, '--study', 'Nc3Jobav', '--list', 'nope'], { encoding: 'utf8' });
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no list "nope"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
