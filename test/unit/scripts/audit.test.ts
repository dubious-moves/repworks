// The repertoire audit's tools (PLAN.md §5.219), on made-up studies: the checks every batch must
// pass, a batch's ops and the three-way merge with the owner's edits, the base that is behind, the
// ledger's generated parts, the inventory (and that a position it can't see is said, not counted),
// the close-call triggers, the scan for what must not be pushed, the format lint, and the commands
// over a scratch data repo.
//
// Controls run on this file (2026-11-28), each undone after it failed the test named:
// - twoMoves keyed by path instead of position → "one position, one move";
// - merge3 letting mine win a field both changed → "the three-way merge";
// - merge3 ignoring the owner's removals → the same test;
// - behind() returning nothing → "the commands" (apply went through on a base behind the session's own commit);
// - the inventory reading a missing answer as no games (unknown left empty) → "a position it can't see";
// - writeRegions leaving an unknown region silently → "the ledger's generated parts";
// - scanText printing the whole token → "what must not be pushed";
// - the cache store keeping the older of two answers for a key → "the caches between sessions".
// The workflow around a batch (§5.220), controls run 2026-11-28:
// - lintMarks never warning → "a list's look-first marks";
// - correctedOf counting an OK → "a batch's tally";
// - explorePgn keeping a line that ends in a "transposes to" note → "the PGN cdbexplore wants";
// - leftOf ignoring the positions a run finished → "an exploration's record and log";
// - changed() comparing the best moves only → the same test;
// - freshRecords keeping everything → "after an exploration";
// - lockStand calling every lock held → "the lock";
// - statusOf not looking at the lists → "is there work";
// - heldHere accepting any lock that is there → "the commands: the lock" (apply went through in the other checkout).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { CompactExplorer } from '../../../src/core/explorer/providers.ts';
import { parseChapterFile, parseGames } from '../../../src/core/pgn/parse.ts';
import { chapterFileText } from '../../../src/core/pgn/write.ts';
import type { Chapter } from '../../../src/core/study/model.ts';
import { pull, push } from '../../../scripts/audit/cachestore.ts';
import { closeCalls, decisionFlags } from '../../../scripts/audit/closecalls.ts';
import { inventory, inventoryText, oneIn, positionsNeeded } from '../../../scripts/audit/inventory.ts';
import { behindRows, changed, chessdbFloor, depthRow, depthText, exploredLately, exploredTable, exploreName, explorePgn, exploreReport, explorations, freshRecords, fullLine, leftOf, linePgn, ourPositions, parseExploreState, parseLog, parseRecord, type ExploreState, type Target } from '../../../scripts/audit/explore.ts';
import { batchesTable, correctedOf, ledgerRows, listsTable, regionsIn, subtreeTable, suggestedOrder, todoOrder, writeRegions } from '../../../scripts/audit/ledger.ts';
import { lintComment, lintMarks, lintWords, linesIn } from '../../../scripts/audit/lint.ts';
import { lockStand, lockText, lockWords, parseLock } from '../../../scripts/audit/lock.ts';
import { createLookups } from '../../../scripts/audit/lookups.ts';
import { applyOps, behind, isSessionCommit, merge3 } from '../../../scripts/audit/ops.ts';
import { scanText, stops } from '../../../scripts/audit/scan.ts';
import { auditStateText, parseAuditState, practicalArgs, type AuditState } from '../../../scripts/audit/state.ts';
import { statusOf, statusText, type ListStand, type StatusIn } from '../../../scripts/audit/status.ts';
import { clickableLines, continuedTwice, lineOf, nodeAtSans, ownerCheck, sansOf, subtreeCounts, theirLeaves, transposeNotes, twoMoves } from '../../../scripts/audit/study.ts';
import { createFileCache } from '../../../scripts/practical-lib.ts';

const pgn = (name: string, movetext: string, orientation = 'white') => `[Event "Test: ${name}"]\n[StudyName "Test"]\n[ChapterName "${name}"]\n[Orientation "${orientation}"]\n\n${movetext} *\n`;
function chapter(id: string, name: string, movetext: string, orientation = 'white'): Chapter {
  const parsed = parseChapterFile(pgn(name, movetext, orientation), id);
  if (!parsed.ok) throw new Error(parsed.reason);
  assert.deepEqual(parsed.notes, [], `the test's own PGN is legal: ${name}`);
  return parsed.chapter;
}
const comment = (c: Chapter, line: string) => nodeAtSans(c, sansOf(line))!.node.comments;
/** A chapter's moves as the app writes them, without its headers. */
const movetext = (c: Chapter) => chapterFileText(c).split('\n\n').slice(1).join('\n\n').trim();
const fenAfter = (line: string) => {
  const pos = Chess.default();
  for (const san of sansOf(line)) pos.play(parseSan(pos, san)!);
  return makeFen(pos.toSetup());
};

// ---- The tree ----

test('moves are read with or without numbers, and a line is found however its moves are spelled', () => {
  assert.deepEqual(sansOf('1. d4 d5 2. c4 e6'), ['d4', 'd5', 'c4', 'e6']);
  assert.deepEqual(sansOf('1.d4 d5 2.c4! e6?! 3...Nf6'), ['d4', 'd5', 'c4', 'e6', 'Nf6']);
  const c = chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Nbd7');
  assert.equal(lineOf(c, ['d4', 'd5', 'c4']), '1. d4 d5 2. c4');
  // "Ngf3" is the same move as the chapter's Nf3 here.
  assert.deepEqual(nodeAtSans(c, sansOf('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Ngf3'))?.path.at(-1), 'Nf3');
  assert.equal(nodeAtSans(c, sansOf('1. d4 d5 2. Nf3')), undefined);
  assert.equal(nodeAtSans(c, sansOf('1. d4 d5 2. Ke2')), undefined, 'an illegal move is no line');
});

// ---- The checks ----

test('one position, one move: over every chapter and move order', () => {
  const a = chapter('chAaaaa1', 'A', '1. d4 d5 2. c4 e6 3. Nc3');
  const same = chapter('chBbbbb1', 'B', '1. d4 e6 2. c4 d5 3. Nc3');
  const other = chapter('chCcccc1', 'C', '1. d4 e6 2. c4 d5 3. Nf3');
  assert.deepEqual(twoMoves([a, same]).two, []);
  const two = twoMoves([a, other]);
  assert.equal(two.two.length, 1);
  assert.deepEqual(two.two[0]!.moves.sort(), ['Nc3', 'Nf3']);
  assert.equal(two.two[0]!.line, '1. d4 d5 2. c4 e6');
  assert.equal(twoMoves([a]).positions, 3);
  // Two first moves are two moves at one position too.
  assert.deepEqual(twoMoves([a, chapter('chDdddd1', 'D', '1. c4 e6')]).two.map((t) => [t.line, t.moves]), [['', ['d4', 'c4']]]);
});

test('clickable lines are played as the app plays them; prose in parentheses is told apart', () => {
  const c = chapter(
    'chMain01',
    'Main',
    '1. d4 d5 2. c4 e6 3. Nc3 { Against ...Nf6, pin it: (3... Nf6 4. Bg5) and (3... c6 4. e4 dxe4 5. Nxe5) (only the knight guards e4) transposes to 1. d4 (chapter Other) } 3... Nf6 4. Bg5',
  );
  const r = clickableLines([c]);
  assert.equal(r.lines, 2);
  assert.equal(r.full, 1);
  assert.equal(r.partial, 1, '5.Nxe5 is not legal: the line plays three of its four moves');
  assert.deepEqual(r.bad.map((b) => [b.text, b.played, b.of]), [['(3... c6 4. e4 dxe4 5. Nxe5)', 3, 4]]);
  assert.deepEqual(r.prose.map((p) => p.text), ['(only the knight guards e4)'], '"(chapter …)" belongs to a transposition note');
});

test('a drilled line ends on our move, or in a note', () => {
  const c = chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 (2... c6 { transposes to 1. d4 c6 2. c4 d5 }) (2... dxc4) 3. Nc3');
  assert.deepEqual(theirLeaves([c]).map((l) => l.line), ['1. d4 d5 2. c4 dxc4']);
  // From Black's side the same file ends on our move after 2...dxc4 and on theirs after 3.Nc3.
  const black = chapter('chBlack1', 'Black', '1. d4 d5 2. c4 e6 (2... dxc4) 3. Nc3', 'black');
  assert.deepEqual(theirLeaves([black]).map((l) => l.line), ['1. d4 d5 2. c4 e6 3. Nc3']);
});

test("the owner's moves and comments are still there, text added after his not hiding them", () => {
  const owner = chapter('owner001', 'Mine', '1. d4 d5 2. c4 e6 { The   Queen\'s Gambit. } (2... c6 3. Nf3 Nf6 { Solid. }) 3. Nc3 Nf6 4. Bg5');
  const now = chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 { The Queen\'s Gambit.\nAgainst ...c6, Nf3. } 3. Nc3 Nf6 4. Bg5 Be7');
  const r = ownerCheck(owner, now);
  assert.equal(r.moves, 10);
  assert.deepEqual(r.missingMoves, ['1. d4 d5 2. c4 c6', '1. d4 d5 2. c4 c6 3. Nf3', '1. d4 d5 2. c4 c6 3. Nf3 Nf6'], 'a move under a missing move is missing too');
  assert.equal(r.comments, 1, 'a comment under a missing move is not counted twice');
  assert.deepEqual(r.missingComments, []);
  const reworded = chapter('chMain02', 'Main', '1. d4 d5 2. c4 e6 { The Queen\'s Gambit Declined. } 3. Nc3 Nf6 4. Bg5');
  assert.deepEqual(ownerCheck(owner, reworded).missingComments, [{ line: '1. d4 d5 2. c4 e6', text: "The Queen's Gambit." }]);
});

test('a "transposes to" note names where the position really continues', () => {
  const main = () => chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 (5. Nf3 { transposes to 1. d4 d5 2. c4 e6 3. Nf3 }) 5... O-O');
  const side = () => chapter('chSide01', 'Side', '1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 (6... b6 { transposes to somewhere gone }) 7. Bh4');
  const stale = transposeNotes([main(), side()]);
  assert.equal(stale.notes, 2);
  assert.deepEqual(stale.stale.map((n) => [n.line, n.now]), [['1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. Nf3', 'transposes to 1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 (chapter Side)']]);
  assert.deepEqual(stale.dead.map((n) => n.line), ['1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 b6']);
  const [m, s] = [main(), side()];
  transposeNotes([m, s], true);
  assert.deepEqual(comment(m, '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. Nf3'), ['transposes to 1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 (chapter Side)']);
  assert.deepEqual(comment(s, '1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 b6'), [], 'a note to nowhere is dropped');
  assert.deepEqual(transposeNotes([m, s]).stale, [], 'fixed, the notes are right');
});

test('a position continues in one place: chapters sharing their first moves are one place', () => {
  const a = chapter('chAaaaa1', 'A', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5');
  const stem = chapter('chBbbbb1', 'B', '1. d4 d5 2. c4 c6 3. Nf3');
  assert.deepEqual(continuedTwice([a, stem]), []);
  const order = chapter('chCcccc1', 'C', '1. c4 e6 2. d4 d5 3. Nc3 Nf6 4. Bg5 Be7');
  // Three positions continue in both: after 2...d5 / 2...e6, after 3.Nc3 and after 3...Nf6.
  assert.equal(continuedTwice([a, order]).length, 3);
});

test("the ledger's counts: positions with drilled replies, replies, single-move branches", () => {
  const c = chapter('chMain01', 'Main', '1. d4 d5 (1... Nf6 2. c4 e6 (2... g6 3. Nc3) 3. Nf3) 2. c4 e6 (2... c6 3. Nf3) (2... dxc4 3. e4 e5 4. Nf3) 3. Nc3');
  const rows = subtreeCounts(c, 2);
  assert.deepEqual(rows.map((r) => [r.line, r.positions, r.replies, r.single, r.ours]), [
    // After 1...d5: two positions (after 2.c4, and after 3.e4 in the 2...dxc4 line), four replies, three of them answered by one move that ends the line.
    ['1. d4 d5', 2, 4, 3, 5],
    ['1. d4 Nf6', 1, 2, 2, 3],
  ]);
  const whole = subtreeCounts(c, 0);
  assert.deepEqual(whole.map((r) => [r.line, r.positions, r.replies, r.single]), [['', 4, 8, 5]]);
});

// ---- A batch's ops ----

const BASE = '1. d4 d5 2. c4 e6 { The main line. } (2... c6 3. Nf3 Nf6 4. Nc3) (2... dxc4 3. e4) 3. Nc3 Nf6 4. Bg5 Be7 5. e3';

test('ops: cuts, lines, comments, glyphs and the first move, applied whole or not at all', () => {
  const base = chapter('chMain01', 'Main', BASE);
  const before = chapterFileText(base);
  const r = applyOps(base, {
    chapter: 'Main',
    cut: [{ at: '1. d4 d5 2. c4 c6 3. Nf3 Nf6', mode: 'node' }, { at: '1. d4 d5 2. c4 dxc4', mode: 'children' }],
    lines: ['1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 { Take first. } exd5 5. Nf3 (5. e4?! dxe4)'],
    comments: [
      { at: '1. d4 d5 2. c4 e6', append: 'Against ...c6, Nf3: (2... c6 3. Nf3)' },
      { at: '1. d4 d5 2. c4 c6 3. Nf3', set: 'Then Nc3.' },
      { at: '1. d4 d5 2. c4 e6', replace: ['The main line.', 'The Queen’s Gambit Declined.'] },
    ],
    glyphs: [{ at: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5', nags: [1] }],
    first: ['1. d4 d5 2. c4 c6'],
  });
  assert.deepEqual(r.errors, []);
  assert.equal(chapterFileText(base), before, 'the input chapter is left as it was');
  assert.deepEqual(r.cut, ['d4 d5 c4 c6 Nf3 Nf6', 'd4 d5 c4 dxc4 e4']);
  assert.equal(
    movetext(r.chapter),
    '1. d4 d5 2. c4 c6 (2... e6 { The Queen’s Gambit Declined.\nAgainst ...c6, Nf3: (2... c6 3. Nf3) } 3. Nc3 Nf6 (3... c5 4. cxd5 { Take first. } 4... exd5 5. Nf3 (5. e4?! dxe4)) 4. Bg5! Be7 5. e3) (2... dxc4) 3. Nf3 { Then Nc3. }',
  );
  assert.deepEqual(clickableLines([r.chapter]).bad, []);
});

test('ops: what can’t be applied is an error, never skipped', () => {
  const base = chapter('chMain01', 'Main', BASE);
  const bad = applyOps(base, {
    chapter: 'Main',
    cut: [{ at: '1. d4 d5 2. c4 g6', mode: 'node' }],
    lines: ['1. d4 d5 2. c4 e6 3. Ke2', '1. d4 d5 2. c4 e6 { Another text. } 3. Nc3'],
    comments: [{ at: '1. d4 d5 2. c4 e6', replace: ['not there', 'x'] }, { at: '1. d4 d5 2. Nf3', set: 'x' }],
    glyphs: [{ at: '1. e4', nags: [1] }],
  });
  assert.deepEqual(bad.errors, [
    'cut: no such line in the chapter: 1. d4 d5 2. c4 g6',
    'line: illegal move Ke2 in: 1. d4 d5 2. c4 e6 3. Ke2',
    'line: 1. d4 d5 2. c4 e6 is already there and the line gives it another comment or glyph: use "comments" or "glyphs"',
    'comment: "not there" is not in the comment at 1. d4 d5 2. c4 e6',
    'comment: no such line in the chapter: 1. d4 d5 2. Nf3',
    'glyphs: no such line in the chapter: 1. e4',
  ]);
});

// ---- The three-way merge ----

test('the three-way merge: his changes carried onto mine, his kept where both changed', () => {
  const base = chapter('chMain01', 'Main', BASE);
  // Mine: a line cut, a comment appended to, a line added.
  const mine = applyOps(base, {
    chapter: 'Main',
    cut: [{ at: '1. d4 d5 2. c4 dxc4', mode: 'node' }],
    lines: ['1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5'],
    comments: [{ at: '1. d4 d5 2. c4 e6', append: 'Mine.' }, { at: '1. d4 d5 2. c4 c6 3. Nf3', set: 'Mine too.' }],
  }).chapter;
  // His, in the app since the base: a comment of his own on a move I left alone, another text on the
  // move I appended to, an edit below the line I cut, a line added, a move removed, 2...c6 made the main reply.
  const theirs = chapter(
    'chMain01',
    'Main renamed',
    '1. d4 d5 2. c4 c6 (2... e6 { His wording. } 3. Nc3 Nf6 4. Bg5 { [%cal Gg5d8] Pin. } 4... Be7 (4... Nbd7 5. e3)) (2... dxc4 3. e4 { His note. }) 3. Nf3 Nf6',
  );
  const m = merge3(base, mine, theirs);
  assert.equal(m.chapter.headers.find(([k]) => k === 'ChapterName')![1], 'Main renamed', "the repo file's headers");
  assert.deepEqual(m.carried, [
    'his comment at 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5',
    'his arrows at 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5',
    'added by him, with everything below it: 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7',
    'removed by him: 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3',
    'removed by him: 1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3',
    'his order of the moves after 1. d4 d5 2. c4',
  ]);
  assert.deepEqual(m.conflicts, [
    'both changed the comment at 1. d4 d5 2. c4 e6: his kept, mine was ["The main line.\\nMine."]',
    'he edited 1. d4 d5 2. c4 dxc4 3. e4, which this batch removed: it stays removed',
  ]);
  assert.equal(
    movetext(m.chapter),
    '1. d4 d5 2. c4 c6 (2... e6 { His wording. } 3. Nc3 Nf6 (3... c5 4. cxd5) 4. Bg5 { Pin. } { [%cal Gg5d8] } 4... Be7 (4... Nbd7 5. e3)) 3. Nf3 { Mine too. } 3... Nf6',
  );
  // With nothing changed on his side the result is mine, and with nothing of mine it is his.
  assert.equal(chapterFileText(merge3(base, mine, base).chapter), chapterFileText(mine));
  assert.equal(chapterFileText(merge3(base, base, theirs).chapter), chapterFileText(theirs));
});

test('a base behind the session’s own commit is told from the owner’s edits', () => {
  const commits = [
    { hash: 'c3', subject: 'desktop: 1 study file', body: '', files: ['studies/Study001/chMain01.pgn'] },
    { hash: 'c2', subject: 'session: drill by difficulty', body: '', files: ['studies/Study001/chMain01.pgn'] },
    { hash: 'c1', subject: 'session: the review list', body: '', files: ['review/Study001/batch-6.json'] },
    { hash: 'c0', subject: 'Batch 5', body: 'Co-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_x', files: ['studies/Study001/chOther1.pgn'] },
    { hash: 'b9', subject: 'session: another study', body: '', files: ['studies/Other001/chZzzzz1.pgn'] },
  ];
  assert.deepEqual(behind(commits, 'Study001').map((c) => c.hash), ['c2', 'c0'], 'his sync, a commit of lists only and another study are not the session writing this study');
  assert.equal(isSessionCommit({ subject: 'phone: 2 events', body: '' }), false);
});

// ---- The ledger ----

test("the ledger's generated parts: counts from the chapters, states from audit.json, regions rewritten", () => {
  const a = chapter('chMain01', 'Main', '1. d4 d5 (1... Nf6 2. c4 e6 (2... g6 3. Nc3) 3. Nf3) 2. c4 e6 (2... c6 3. Nf3) (2... dxc4 3. e4 e5 4. Nf3) 3. Nc3');
  const b = chapter('chRare01', 'Rare replies', '1. d4 f5 (1... b6 2. e4) 2. Bg5');
  const state: AuditState = {
    v: 1,
    study: 'Study001',
    chapters: { chMain01: { depth: 2 }, chRare01: { depth: 0 } },
    subtrees: { chMain01: { '1. d4 d5': { state: 'closed', batch: 'batch 1', note: 'He kept his | deep lines.' }, '1. d4 e5': { state: 'todo' } } },
    targets: {},
    exceptions: [],
    flags: [],
  };
  const { rows, problems } = ledgerRows(state, [a, b]);
  assert.deepEqual(problems, ['audit.json has a state for "1. d4 e5" in Main, which the chapter no longer has at 2 plies']);
  assert.equal(
    subtreeTable(rows.filter((r) => r.cid === 'chMain01')),
    ['| Subtree | Positions / replies / single-move | Status |', '|---|---|---|', '| 1. d4 d5 | 2 / 4 / 3 | **Audited, batch 1.** He kept his \\| deep lines. |', '| 1. d4 Nf6 | 1 / 2 / 2 | **Not audited.** |'].join('\n'),
  );
  assert.equal(suggestedOrder(rows), '1. 1. d4 Nf6 (2)\n2. the chapter "Rare replies" (2)');
  assert.equal(listsTable([]), 'No review list is open.');

  const file = '# Ledger\n\nProse stays.\n\n<!-- audit:subtrees chMain01 -->\nold table\n<!-- /audit:subtrees chMain01 -->\n\n<!-- audit:order -->\n<!-- /audit:order -->\n\nMore prose.\n';
  assert.deepEqual(regionsIn(file), ['subtrees chMain01', 'order'], 'an empty region is one too');
  const empty = '# Ledger\n\n<!-- audit:order -->\nx\n<!-- /audit:order -->\n\n<!-- audit:typo -->\nstale for ever\n<!-- /audit:typo -->\n';
  const made = writeRegions(empty, new Map([['order', 'First this.'], ['lists', 'None.']]));
  assert.equal(made.text, '# Ledger\n\n<!-- audit:order -->\nFirst this.\n<!-- /audit:order -->\n\n<!-- audit:typo -->\nstale for ever\n<!-- /audit:typo -->\n');
  assert.deepEqual(made.unknown, ['typo'], 'a region the script does not write is reported');
  assert.deepEqual(made.unplaced, ['lists']);
  assert.equal(writeRegions(made.text, new Map([['order', 'First this.'], ['typo', 'x']])).text.includes('stale'), false);
});

test('audit.json is read strictly', () => {
  const good = { v: 1, study: 'Study001', chapters: { chMain01: { depth: 6, owner: [{ file: 'o.pgn', missingMoves: 2, missingComments: 0 }] } }, subtrees: {}, targets: {}, exceptions: [], flags: [] };
  assert.equal(parseAuditState(JSON.stringify(good)).ok, true);
  const bad = parseAuditState(JSON.stringify({ ...good, v: 2, chapters: { chMain01: { depth: -1 } }, subtrees: { chMain01: { '1. d4': { state: 'done' } } }, flags: [{ line: 'x' }] }));
  assert.deepEqual(bad, { ok: false, errors: ['v must be 1, found 2', 'chapters.chMain01.depth must be a whole number of plies', 'subtrees.chMain01["1. d4"].state must be closed, open or todo', 'flags must be a list of { line, note }'] });
  assert.equal(parseAuditState('{').ok, false);
});

test("a Practical run for a study carries the study's own flags, all of them", () => {
  const base = { v: 1, study: 'Study001', chapters: {}, subtrees: {}, targets: {}, exceptions: [], flags: [] };
  const read = parseAuditState(JSON.stringify({ ...base, practical: ['--maia', '--replies', '--pick-last', '--compare-reach-min', '3'] }));
  assert.ok(read.ok);
  assert.deepEqual(practicalArgs(read.state, { positions: 'p.json', cache: 'c', out: 'x.json' }), ['--positions', 'p.json', '--cache', 'c', '--out', 'x.json', '--depth', '5', '--maia', '--replies', '--pick-last', '--compare-reach-min', '3']);
  assert.deepEqual(practicalArgs(read.state, { positions: 'p.json', cache: 'c', out: 'x.json', depth: 7, ortNode: '/ort' })!.slice(6), ['--depth', '7', '--ort-node', '/ort', '--maia', '--replies', '--pick-last', '--compare-reach-min', '3']);
  // No flags fixed: nothing to hold a run to, and the command says so instead of running bare.
  assert.equal(practicalArgs({ ...base, v: 1 } as AuditState, { positions: 'p', cache: 'c', out: 'x' }), undefined);
  // The depth and the files are the run's, not the study's.
  assert.deepEqual(parseAuditState(JSON.stringify({ ...base, practical: ['--maia', '--depth', '7'] })), { ok: false, errors: ['practical must be a list of flags for scripts/practical.ts, without --positions, --cache, --out, --depth, --ort-node, --moves, --candidates, --report (the command gives those)'] });
});

// ---- The inventory ----

/** The games at a position, from a table of line → [total, { san: games }]. */
function gamesOf(table: Record<string, [number, Record<string, number>]>): (fen: string) => CompactExplorer | undefined {
  const byFen = new Map(Object.entries(table).map(([line, v]) => [fenAfter(line), v]));
  return (fen) => {
    const hit = byFen.get(fen);
    if (!hit) return undefined;
    return { total: hit[0], white: hit[0], draws: 0, black: 0, moves: Object.entries(hit[1]).map(([san, n]) => ({ uci: '', san, white: n, draws: 0, black: 0, games: n })) };
  };
}

const INV_A = '1. d4 d5 2. c4 e6 (2... c6 3. Nf3) 3. Nc3 Nf6 (3... c5 4. cxd5) 4. Bg5 Be7 5. e3';
const INV_B = '1. c4 e6 2. d4 d5 { transposes to 1. d4 d5 2. c4 e6 }';
const GAMES: Record<string, [number, Record<string, number>]> = {
  '1. d4': [1000, { d5: 400, Nf6: 500 }],
  '1. d4 d5 2. c4': [400, { e6: 200, c6: 100, dxc4: 60, e5: 4 }],
  '1. d4 d5 2. c4 e6 3. Nc3': [300, { Nf6: 150, c5: 30, Be7: 60, f5: 3 }],
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5': [100, { Be7: 70, Nbd7: 30 }],
  '1. c4': [1000, { e6: 100 }],
  '1. c4 e6 2. d4': [100, { d5: 50 }],
};

test('the inventory: shares, reach over every move order, tags, what is not drilled', () => {
  const a = chapter('chMain01', 'Main', INV_A);
  const b = chapter('chOrder1', 'Other order', INV_B);
  const owner = chapter('owner001', 'Mine', '1. d4 d5 2. c4 e6 3. Nc3 Nf6');
  const inv = inventory([a, b], a, sansOf('1. d4 d5 2. c4 e6'), gamesOf(GAMES), [owner]);
  assert.deepEqual(inv.unknown, []);
  assert.deepEqual(inv.rows.map((r) => r.line), ['1. d4 d5 2. c4 e6 3. Nc3', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5']);
  const row = inv.rows[0]!;
  // By this order: 0.4 x 0.5 = 0.2. The other chapter reaches the same position by 1.c4 e6 2.d4 d5: 0.1 x 0.5 = 0.05.
  assert.ok(Math.abs(row.reach - 0.2) < 1e-12 && Math.abs(row.reachAll - 0.25) < 1e-12, `${row.reach} ${row.reachAll}`);
  assert.deepEqual(row.replies.map((r) => [r.san, r.share, r.games, r.ours, r.single, r.common, r.owner]), [
    ['Nf6', 0.5, 150, ['Bg5'], false, true, true],
    ['c5', 0.1, 30, ['cxd5'], true, true, false],
  ]);
  assert.deepEqual(row.uncovered, [{ san: 'Be7', share: 0.2, games: 60, elsewhere: false }], '...f5 at 1% is under the 2% that is listed');
  const text = inventoryText(inv, ['1. d4 d5 2. c4 e6 3. Nc3 Be7']);
  assert.ok(text.includes('1. d4 d5 2. c4 e6 3. Nc3 | 300 games | 1 in 5 (all orders 1 in 4)'), text);
  assert.ok(text.includes('CO  Nf6'), text);
  assert.ok(text.includes('C S c5'), text);
  assert.ok(text.includes('not drilled: Be7 20% 60g (the owner’s exception)'), text);
  assert.ok(text.endsWith('positions 2, replies 3, single-move 2'), text);
  assert.equal(oneIn(1 / 2113), '1 in 2,113');
});

test('the inventory asks only for what it needs, and a position it can’t see is said, not counted', () => {
  const a = chapter('chMain01', 'Main', INV_A);
  const b = chapter('chOrder1', 'Other order', INV_B);
  const needed = positionsNeeded([a, b], a, sansOf('1. d4 d5 2. c4 e6'));
  // The opponent's positions on the way to the subtree and inside it, by both orders; not 2...c6's line.
  assert.deepEqual(new Set(needed), new Set(['1. d4', '1. d4 d5 2. c4', '1. d4 d5 2. c4 e6 3. Nc3', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5', '1. c4', '1. c4 e6 2. d4'].map(fenAfter)));
  const { '1. c4 e6 2. d4': _gone, ...partial } = GAMES;
  const inv = inventory([a, b], a, sansOf('1. d4 d5 2. c4 e6'), gamesOf(partial));
  assert.equal(inv.unknown.length, 1, 'the position after 3.Nc3: its reach over all orders needs the missing answer');
  assert.ok(Number.isNaN(inv.rows[0]!.reachAll));
  assert.ok(inventoryText(inv).includes("NOT COMPLETE: the explorer's answer is missing for 1 position(s)"));
  assert.ok(inventoryText(inv).includes('?'), 'a reach that is not known is shown as such');
});

test('offline, the lookups answer from the cache alone and list what it lacks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-audit-cache-'));
  try {
    const fen = fenAfter('1. d4');
    const answer: CompactExplorer = { total: 10, white: 5, draws: 1, black: 4, moves: [] };
    await createFileCache(dir, Date.now).put('explorer', 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -#blitz,classical,rapid|1600,1800,2000,2200,2500|', answer);
    let asked = 0;
    const look = createLookups({ cacheDir: dir, token: 'never-sent', offline: true, http: () => Promise.reject(new Error(`asked ${++asked}`)) });
    assert.deepEqual(await look.explorer(fen), answer);
    assert.equal(await look.explorer(fenAfter('1. e4')), undefined);
    assert.equal(await look.chessdb(fen), undefined);
    assert.deepEqual(look.missing(), { explorer: [fenAfter('1. e4')], chessdb: [fen] });
    assert.equal(asked, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the caches between sessions: a union by key, the newest kept, the old dropped, a pull readable by the clients', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-audit-store-'));
  try {
    const day = 24 * 3600 * 1000;
    const now = Date.UTC(2026, 10, 28);
    const rec = (k: string, t: number, v: unknown) => JSON.stringify({ k, t, v });
    const [a, b, store, fresh] = ['a', 'b', 'store', 'fresh'].map((d) => join(dir, d)) as [string, string, string, string];
    mkdirSync(a);
    mkdirSync(b);
    const key = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -#blitz,classical,rapid|1600,1800,2000,2200,2500|';
    const answer: CompactExplorer = { total: 10, white: 5, draws: 1, black: 4, moves: [] };
    // Session a: an answer, asked twice (the file is appended to), and one too old to keep. A line cut short is skipped.
    writeFileSync(join(a, 'explorer.jsonl'), [rec(key, now - 3 * day, { total: 1 }), rec(key, now - 2 * day, answer), rec('old#f', now - 91 * day, {}), '{"k":"cut'].join('\n') + '\n');
    writeFileSync(join(a, 'chessdb.jsonl'), [rec('pos1', now - day, { status: 'ok' }), rec('pos2', now - 8 * day, { status: 'ok' })].join('\n') + '\n');
    // Session b: another position, and an older answer for the same one.
    writeFileSync(join(b, 'explorer.jsonl'), [rec('other#f', now - day, { total: 2 }), rec(key, now - 5 * day, { total: 0 })].join('\n') + '\n');
    assert.deepEqual(push(store, [a], now), { explorer: { kept: 1, added: 1, dropped: 1 }, chessdb: { kept: 1, added: 1, dropped: 1 } });
    assert.deepEqual(push(store, [b], now).explorer, { kept: 2, added: 1, dropped: 0 }, 'b adds its own position; its older answer for the shared one loses');
    const files = () => ['explorer', 'chessdb'].flatMap((s) => readdirSync(join(store, s)).sort().map((f) => `${s}/${f}:${readFileSync(join(store, s, f), 'utf8')}`));
    const once = files();
    assert.equal(once.filter((f) => f.startsWith('explorer/')).join('').match(/"k":/g)!.length, 2);
    assert.ok(once.some((f) => f.includes(JSON.stringify(answer))), 'the newest answer for the shared key');
    assert.ok(once.every((f) => /^(explorer|chessdb)\/[0-9a-f]\.jsonl:/.test(f)));
    push(store, [a, b], now);
    assert.deepEqual(files(), once, 'pushed again, the store is byte for byte the same');
    // A new container: the store pulled into an empty folder, and read by Practical's own cache.
    assert.deepEqual(pull(store, fresh), { explorer: 2, chessdb: 1 });
    assert.deepEqual(pull(store, fresh), { explorer: 0, chessdb: 0 }, 'nothing it lacks any more');
    assert.deepEqual(await createFileCache(fresh, () => now).get('explorer', key, 30 * day), answer);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Close calls ----

test('close calls: the engine and score triggers, a critical reply, and what is unknown', () => {
  const ours = { san: 'Nc3', games: 500, score: 0.55, cp: 20 };
  assert.deepEqual(decisionFlags(ours, [{ san: 'Nf3', games: 400, score: 0.545, cp: 60 }]).map((f) => f.split(':')[0]), ['engine'], 'ChessDB 3.7 win% higher, the win rate half a point lower');
  assert.deepEqual(decisionFlags(ours, [{ san: 'Nf3', games: 400, score: 0.5, cp: 60 }]), [], 'the win rate 5 points lower: no flag');
  assert.deepEqual(decisionFlags(ours, [{ san: 'g3', games: 3, cp: 60 }]).length, 1, 'too few games to say: the engine flag stands');
  assert.deepEqual(decisionFlags(ours, [{ san: 'e3', games: 150, score: 0.59, cp: 0 }]).map((f) => f.split(':')[0]), ['score'], '4 points higher over 100+ games, ChessDB 1.8 win% lower');
  assert.deepEqual(decisionFlags(ours, [{ san: 'e3', games: 99, score: 0.7, cp: 20 }]), [], 'under 100 games');
  assert.deepEqual(decisionFlags(ours, [{ san: 'e3', games: 150, score: 0.59, cp: -40 }]), [], 'ChessDB 5.5 win% lower');

  const c = chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 3. Nc3');
  const games = gamesOf({ '': [1000, { d4: 600, e4: 400 }], '1. d4': [600, { d5: 300 }], '1. d4 d5': [300, { c4: 200, Nf3: 100 }], '1. d4 d5 2. c4': [200, { e6: 100 }], '1. d4 d5 2. c4 e6': [100, { Nc3: 60, Nf3: 40 }] });
  const cdb = (fen: string) => (fen === fenAfter('1. d4 d5 2. c4') ? { status: 'ok', moves: [{ uci: '', san: 'e6', score: 5 }] } : fen === fenAfter('1. d4 d5 2. c4 e6') ? { status: 'ok', moves: [{ uci: '', san: 'Nf3', score: 80 }, { uci: '', san: 'Nc3', score: 20 }] } : undefined);
  const cc = closeCalls(c, games, cdb);
  assert.deepEqual(cc.decisions.map((d) => [d.line, d.flags.length]), [['1. d4', 0], ['1. d4 d5 2. c4', 0], ['1. d4 d5 2. c4 e6 3. Nc3', 1]]);
  assert.ok(cc.decisions[2]!.flags[0]!.startsWith('engine: ChessDB Nf3 0.80 against ours 0.20'), cc.decisions[2]!.flags[0]);
  assert.deepEqual(cc.critical.map((x) => [x.line, x.text]), [['1. d4 d5 2. c4 e6', '50% of the games: ChessDB gives us -0.05']]);
  assert.deepEqual(cc.ends.map((e) => e.line), ['1. d4 d5 2. c4 e6 3. Nc3']);
  assert.equal(cc.unknown.length, 2, 'ChessDB had nothing for two of our positions: said');
});

// ---- What must not be pushed ----

test('what must not be pushed: tokens, addresses, a personal computer’s paths', () => {
  const token = `lip_${'aB3'.repeat(8)}`;
  const text = [`LICHESS_TOKEN=${token}`, 'mail someone@gmail.com or noreply@anthropic.com or 123+bot@users.noreply.github.com', 'saved to C:\\Users\\Anna\\repertoires\\nc3.pgn and /Users/anna/x and /home/user/repworks', 'scratch /tmp/claude-0/-home-user/abc/scratchpad/deck', '1. Nc3 d5 2. d4 Nf6 3. Bf4 a6 { 46% - the most common }'].join('\n');
  const found = scanText(text);
  assert.deepEqual(found.map((f) => [f.kind, f.line]), [['token', 1], ['email', 2], ['pc-path', 3], ['pc-path', 3], ['container-path', 4]]);
  assert.ok(!JSON.stringify(found).includes(token), 'a token is never printed whole');
  assert.equal(found[1]!.what, 'someone@gmail.com');
  assert.deepEqual(found.map(stops), [true, true, true, true, false]);
  assert.deepEqual(scanText(`gh${'p'}_${'x1'.repeat(20)} and github_pat_${'y2'.repeat(20)} and Bearer ${'z3'.repeat(15)}`).map((f) => f.kind), ['token', 'token', 'token']);
});

// ---- The format rules ----

test('the format rules: full lines in words to the owner, moves in parentheses in a comment', () => {
  assert.deepEqual(linesIn('After 9.Bd3 b3+ 10.Nd2 White is fine; 9. Nxa8?? loses.').map((l) => [l.text, l.number, l.moves]), [['9.Bd3 b3+ 10.Nd2', 9, 3], ['9. Nxa8??', 9, 1]]);
  assert.deepEqual(lintWords('1 in 2,757 games. After 1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 the bishop is safe; 9.Bd3 is the only move.'), []);
  assert.deepEqual(lintWords('Reaches the same position as 6.Qf3 h6 7.h4: a clickable on 5.g4.'), [{ kind: 'partial line', text: '6.Qf3 h6 7.h4' }]);
  assert.deepEqual(lintWords('…3.Bf4 g6 4.e3 is in the other chapter').map((l) => l.kind), ['partial line', 'cut with dots']);
  assert.deepEqual(lintWords('Black replies 5...Nbd7 here, or 5... c5.'), [], 'Black’s move number is no cut line');
  assert.deepEqual(lintComment('Against ...h6, h4 first, then g5: (6... h6 7. h4) (6... O-O 7. g5)'), []);
  assert.deepEqual(lintComment('After 9.Bd3 b3+ 10.Nd2 the knight blocks.'), [{ kind: 'moves outside parentheses', text: '9.Bd3 b3+ 10.Nd2' }]);
  assert.deepEqual(lintComment('(12. Ng5 Ndf6 (a typical idea) 13. Nxe6)'), [], 'a short remark inside a line is read by the app');
  assert.deepEqual(lintComment('(9. Nxa8 because the knight is trapped after that anyway)').map((l) => l.kind), ['prose inside a line']);
});

// ---- The workflow around a batch (§5.220) ----

test("a list's look-first marks: none, most of them, a question without one", () => {
  const item = (at: string, kind = 'comment', first = false) => ({ cid: 'chMain01', at: at.split(' '), kind, lead: '1. d4', part: at, ...(first ? { first: true as const } : {}) });
  const six = ['d5', 'Nf6', 'f5', 'e6', 'c5', 'g6'];
  assert.deepEqual(lintMarks(six.map((m) => item(`d4 ${m}`))).map((l) => l.text), ['no position of 6 is marked "look first" ("first": true on a note): mark what he should read before the rest']);
  assert.deepEqual(lintMarks(six.map((m, i) => item(`d4 ${m}`, 'comment', i < 2))), [], 'two of six');
  assert.match(lintMarks(six.map((m, i) => item(`d4 ${m}`, 'comment', i < 3)))[0]!.text, /^3 of 6 positions are marked "look first", more than about a third/);
  // Two items at one move are one position; a small list may mark all it has.
  assert.deepEqual(lintMarks([item('d4 d5', 'comment', true), item('d4 d5', 'removed')]), []);
  assert.deepEqual(lintMarks([item('d4 d5', 'comment', true), item('d4 Nf6', 'question')]).map((l) => l.text), ['the question at 1. d4 d4 Nf6 is not marked: every question is']);
  assert.deepEqual(lintMarks([]), []);
});

test("a batch's tally: the share he corrected, a number that is not known, audit.json read strictly", () => {
  const counted = { name: 'batch-6', title: 'Jobava: batch 6', date: '2026-11-29', positions: 25, ok: 19, no: 2, notes: 1, edited: 2, open: 1, first: 5, firstCorrected: 3 };
  const old = { name: 'batch 3', date: '2026-11-27', positions: 11, ok: 11, source: 'journal' as const, note: 'Counted in items: all 11 OK.' };
  assert.equal(correctedOf(counted), 5);
  assert.equal(correctedOf(old), undefined, 'not known is not zero');
  assert.equal(
    batchesTable([old, counted]),
    [
      '| Batch | Merged | Positions | OK | No | A note only | Edited by him | Not answered | Corrected | “Look first”: marked, corrected |',
      '|---|---|---|---|---|---|---|---|---|---|',
      '| batch 3 *(from the journal)* | 2026-11-27 | 11 | 11 | ? | ? | ? | ? | ? | ? |',
      '| batch-6 (Jobava: batch 6) | 2026-11-29 | 25 | 19 | 2 | 1 | 2 | 1 | 5 of 25 (20%) | 5, 3 |',
      '',
      '- batch 3: Counted in items: all 11 OK.',
    ].join('\n'),
  );
  assert.match(batchesTable([]), /^No batch has been tallied yet/);
  // A batch nobody counted is told in words, not as a row of question marks.
  assert.equal(batchesTable([{ name: 'the trial batch', date: '2026-11-27', source: 'journal', note: 'Answered in the chat.' }]), 'No batch has been tallied yet (`audit.ts tally` when a list’s answers are merged).\n\nNot counted by position:\n- **the trial batch** (2026-11-27, from the journal): Answered in the chat.');
  assert.ok(batchesTable([{ name: 'the trial batch', date: '2026-11-27', source: 'journal' }, counted]).endsWith('| 5, 3 |\n\nNot counted by position:\n- **the trial batch** (2026-11-27, from the journal): nothing is known of it.'));
  const base = { v: 1, study: 'Study001', chapters: {}, subtrees: {}, targets: {}, exceptions: [], flags: [] };
  const read = parseAuditState(JSON.stringify({ ...base, batches: [old, counted], explored: [{ name: 'd4-f5', chapter: 'chRare01', line: '', started: '2026-11-28T12:00:00.000Z' }] }));
  assert.ok(read.ok);
  assert.equal(auditStateText(read.state), `${JSON.stringify(read.state, null, 2)}\n`);
  assert.deepEqual(parseAuditState(JSON.stringify({ ...base, batches: [{ name: 'x', date: 'yesterday' }], explored: [{ name: 'x', chapter: 'c', line: '', started: 'soon' }] })), { ok: false, errors: ['batches must be a list of { name, date (YYYY-MM-DD), and whole numbers for positions, ok, no, notes, edited, open, first, firstCorrected where known }', 'explored must be a list of { name, chapter, line, started (a time) }'] });
});

const EXPLORE_GAMES: Record<string, [number, Record<string, number>]> = { ...GAMES, '1. d4 d5 2. c4 c6 3. Nf3': [80, { Nf6: 60, e6: 20 }] };

test('the PGN cdbexplore wants: the repertoire\'s side named, the opponent\'s shares, a line that ends in a "transposes to" note left out, a subtree with the moves that lead to it', () => {
  const a = chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 { The main line. } (2... c6 3. Nf3 Nf6 4. Nc3) 3. Nc3 Nf6 $1 (3... c5 { transposes to somewhere } ) 4. Bg5 { [%cal Gg5f6] } 4... Be7 5. e3');
  const whole = explorePgn({ study: 'Test', chapter: a, prefix: [], games: gamesOf(EXPLORE_GAMES) });
  assert.equal(
    whole.text,
    '[Event "Test: Main"]\n[White "Repertoire"]\n[Black "?"]\n[Result "*"]\n[Orientation "white"]\n[RepworksChapter "chMain01"]\n[RepworksLine ""]\n\n1. d4 d5 { 40.0% } 2. c4 e6 { 50.0% } ( 2... c6 { 25.0% } 3. Nf3 Nf6 { 75.0% } 4. Nc3 ) 3. Nc3 Nf6 { 50.0% } 4. Bg5 Be7 { 70.0% } 5. e3 *\n',
  );
  assert.deepEqual([whole.shared, whole.missing, whole.dropped, whole.ends], [5, [], 1, 2]);
  // The subtree after 2...c6: the moves that lead to it with their shares, and nothing of the main line.
  const sub = explorePgn({ study: 'Test', chapter: a, prefix: sansOf('1. d4 d5 2. c4 c6'), games: gamesOf(EXPLORE_GAMES) });
  assert.ok(sub.text.endsWith('[RepworksLine "1. d4 d5 2. c4 c6"]\n\n1. d4 d5 { 40.0% } 2. c4 c6 { 25.0% } 3. Nf3 Nf6 { 75.0% } 4. Nc3 *\n'), sub.text);
  assert.ok(sub.text.includes('[Event "Test: Main, 1. d4 d5 2. c4 c6"]'));
  // A position whose games are not known is said: its moves carry no share.
  const { '1. d4 d5 2. c4 c6 3. Nf3': _gone, ...partial } = EXPLORE_GAMES;
  const lacking = explorePgn({ study: 'Test', chapter: a, prefix: sansOf('1. d4 d5 2. c4 c6'), games: gamesOf(partial) });
  assert.deepEqual(lacking.missing, [fenAfter('1. d4 d5 2. c4 c6 3. Nf3')]);
  assert.ok(lacking.text.includes('3. Nf3 Nf6 4. Nc3 *'));
  // Black's repertoire names Black.
  const black = explorePgn({ study: 'Test', chapter: chapter('chBlack1', 'Slav', '1. d4 d5 2. c4 c6', 'black'), prefix: [], games: gamesOf({ '': [100, { d4: 50 }], '1. d4 d5': [50, { c4: 40 }] }) });
  assert.ok(black.text.includes('[White "?"]\n[Black "Repertoire"]') && black.text.includes('1. d4 { 50.0% } d5 2. c4 { 80.0% } c6 *'), black.text);
  // The file reads back as a game of ours, its headers kept: the report is written from it.
  const back = parseGames(whole.text, () => 'explore0')[0]!;
  assert.ok(back.ok && back.chapter.headers.some(([k, v]) => k === 'RepworksChapter' && v === 'chMain01'));

  // One position, on demand: the line to it, and the candidates as moves from it.
  assert.equal(linePgn({ moves: sansOf('1. d4 d5 2. c4 e6'), candidates: ['Nc3', 'Nf3'], side: 'white', event: 'On demand' })!.split('\n\n')[1], '1. d4 d5 2. c4 e6 3. Nc3 ( 3. Nf3 ) *\n');
  assert.equal(linePgn({ moves: sansOf('1. d4 d5 2. c4 e6'), side: 'white', event: 'x' })!.split('\n\n')[1], '1. d4 d5 2. c4 e6 *\n');
  assert.equal(linePgn({ moves: sansOf('1. d4 d5 2. Ke2 e6'), side: 'white', event: 'x' }), undefined);
  assert.equal(linePgn({ moves: sansOf('1. d4 d5'), candidates: ['Qh5'], side: 'white', event: 'x' }), undefined);
  assert.equal(exploreName(a, '1. Nc3 d5 2. d4 Nf6 3. Bf4 c5'), 'nc3-d5-d4-nf6-bf4-c5');
  assert.equal(exploreName(chapter('chRare01', 'Jobava: rare replies', '1. d4 f5'), ''), 'jobava-rare-replies');
});

// cdbexplore's own files, as its a396b4d writes them: a first run stopped by its time, a second that finished.
const seen = (best: [string, number], line: number, mine?: [string, number], rival?: [string, number]) => ({ best: { san: best[0], score: best[1] }, mine: mine ? { san: mine[0], score: mine[1] } : null, rival: rival ? { san: rival[0], score: rival[1] } : null, line });
const target = (line: string, fenOf: string, reason: string, before: ReturnType<typeof seen>, after: ReturnType<typeof seen> | null, at: string, reach = 0.01): Target => ({ fen: fenAfter(fenOf), line, reason, reach, before, after, stopped: 'stable', requests: 100, ms: 60000, at });
const RECORD: Record<string, Target> = {
  // Black to move after 5. e3: ChessDB's eval for Black went from -0.30 to -0.62, the same move.
  a: target('[20.00%] 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3', 'line end', seen(['O-O', -30], 4), seen(['O-O', -62], 16), '2026-11-28T13:10:00.000Z', 0.2),
  // A decision of ours: the best move changed, and ours is now 0.35 behind.
  b: target('[10.00%] 1.d4 d5 2.c4 c6', '1. d4 d5 2. c4 c6', 'decision', seen(['Nf3', 40], 5, ['Nf3', 40], ['Nc3', 35]), seen(['Nc3', 60], 14, ['Nf3', 25], ['Nc3', 60]), '2026-11-28T14:05:00.000Z', 0.1),
  // Explored, nothing moved.
  c: target('[10.00%] 1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3', '1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3', 'line end', seen(['e6', -20], 6), seen(['e6', -25], 12), '2026-11-28T12:40:00.000Z', 0.1),
};
const LOG_ONE = ['12:30:00 cdbexplore: d4.pgn, 9 positions, White\'s repertoire. Asking ChessDB about each.', '12:30:09 Survey: 4 positions to explore (3 line ends, 1 decisions); 13 requests in 0m09s. Scores from White\'s side.', '12:30:09   [20.00%] 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 (line end): best O-O -0.30, stored line 4', '12:30:09 Exploring 1/4: [10.00%] 1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 (line end)', '12:35:00   depth 6: e6 -0.20', '12:40:00   stable after 9m51s, 100 requests, 14 queued. ChessDB now: best e6 -0.25 (was best e6 -0.20), stored line 6 -> 12', '12:40:00 Exploring 2/4: [20.00%] 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 (line end)', '12:41:00 ChessDB refused a request for its rate limit (HTTP 429), 1 this run: pausing ChessDB requests for 30 s, then asking again. If it repeats, lower --rate.', '13:10:00   time after 30m00s, 300 requests, 20 queued. ChessDB now: best O-O -0.62 (was best O-O -0.30), stored line 4 -> 16', '13:10:00 Time is up with 2 positions left.', '13:10:00 Done: 2 explored, 1 changed; 413 ChessDB requests in 40m00s (10.3 a minute); rate-limited 1; answers ok 400, unknown 13.'].join('\n');
const LOG_TWO = `${LOG_ONE}\n${['14:00:00 cdbexplore: d4.pgn, 9 positions, White\'s repertoire. Asking ChessDB about each.', '14:00:09 Survey: 3 positions to explore (2 line ends, 1 decisions), 2 of them explored recently; 13 requests in 0m09s. Scores from White\'s side.', '14:00:09 Exploring 1/1: [10.00%] 1.d4 d5 2.c4 c6 (decision)', '14:05:00   stable after 4m51s, 80 requests, 2 queued. ChessDB now: best Nc3 +0.60; mine Nf3 +0.25 vs Nc3 +0.60 (was best Nf3 +0.40; mine Nf3 +0.40 vs Nc3 +0.35), stored line 5 -> 14', '14:05:00 Done: 1 explored, 1 changed; 93 ChessDB requests in 5m00s (18.6 a minute); rate-limited 0; answers ok 93.'].join('\n')}\n`;

test("an exploration's record and log: what is left, what ChessDB changed, the report with full lines", () => {
  // The first run stopped by its time: two of the four left.
  const one = parseLog(LOG_ONE);
  assert.deepEqual([one.runs, one.survey, one.finished, one.timeUp, one.refused], [1, { targets: 4, ends: 3, decisions: 1, recent: 0 }, 2, 2, 1]);
  assert.equal(leftOf(one), 2);
  // Stopped in the middle (no "Time is up"): the survey's count less what was finished.
  assert.equal(leftOf(parseLog(LOG_ONE.split('\n').slice(0, 6).join('\n'))), 3);
  // Only listed: everything picked is left. No survey yet: not known.
  assert.equal(leftOf(parseLog(LOG_ONE.split('\n').slice(0, 3).join('\n'))), 4);
  assert.equal(leftOf(parseLog('')), undefined);
  const two = parseLog(LOG_TWO);
  assert.deepEqual([two.runs, two.survey, two.finished, leftOf(two), two.refused], [2, { targets: 3, ends: 2, decisions: 1, recent: 2 }, 1, 0, 1]);

  const record = parseRecord(JSON.stringify({ targets: RECORD }));
  assert.equal(record.length, 3);
  assert.deepEqual(parseRecord('not json'), []);
  assert.deepEqual(parseRecord(undefined), []);
  assert.deepEqual(record.map(changed), [true, true, false], 'an eval moved by 0.32; another best move; 0.05 is nothing');
  assert.equal(fullLine('[20.00%] 1.d4 d5 2.c4 e6 3.Nc3'), '1. d4 d5 2. c4 e6 3. Nc3');
  assert.equal(fullLine('1...e5 2.Nf3'), '1... e5 2. Nf3');

  const made = exploreReport({ name: 'd4-d5', what: 'The chapter "Main" (Test).', chapter: 'chMain01', line: '', record, log: two });
  assert.deepEqual(made.state, { v: 1, name: 'd4-d5', chapter: 'chMain01', line: '', updated: '2026-11-28T14:05:00.000Z', runs: 2, targets: 3, explored: 3, left: 0, done: true, changed: 2, behind: 1, refused: 1 });
  assert.deepEqual(parseExploreState(JSON.stringify(made.state)), made.state);
  const md = made.markdown;
  assert.ok(md.includes('- **Stands:** finished: nothing is left to explore.'), md);
  assert.ok(md.includes("## ChessDB's best move changed, or its eval moved by 0.30 or more (2)\n\n- 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 (line end, reached 20.00%): best O-O +0.30 → O-O +0.62; stored line 4 → 16 plies\n- 1. d4 d5 2. c4 c6 (decision, reached 10.00%): best Nf3 +0.40 → Nc3 +0.60; ours Nf3 +0.40 → Nf3 +0.25; stored line 5 → 14 plies\n"), md);
  assert.ok(md.includes("## Moves of ours 0.30 or more behind ChessDB's best (1)\n\nFrom the explored decisions only"), md);
  assert.ok(md.includes("- 1. d4 d5 2. c4 c6: ours Nf3 +0.25, ChessDB's best Nc3 +0.60 (0.35 behind)\n"), md);
  assert.ok(md.includes('## Explored (3)\n\n- 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 (line end, reached 20.00%): best O-O +0.62, stored line 4 → 16 plies; stable\n'), md);
  assert.ok(!/\d\.[A-Za-z]/.test(md.replace(/`[^`]*`/g, '')), 'no line in the tool\'s own spelling is left');
  // Not finished, and nothing explored yet.
  const first = exploreReport({ name: 'd4-d5', what: 'x', record: record.slice(0, 1), log: one });
  assert.deepEqual([first.state.left, first.state.done, first.state.refused], [2, false, 1]);
  assert.ok(first.markdown.includes('- **Stands:** not finished: 2 position(s) left.'));
  const none = exploreReport({ name: 'd4-d5', what: 'x', record: [], log: parseLog('') });
  assert.deepEqual([none.state.done, none.state.updated, none.state.left], [false, undefined, 0]);
  assert.ok(none.markdown.includes('no survey has run yet'));
});

test("our moves behind ChessDB's best, asked over every position of the explored file where we move", () => {
  const made = explorePgn({ study: 'Test', chapter: chapter('chMain01', 'Main', '1. d4 d5 2. c4 e6 (2... c6 3. Nf3) 3. Nc3'), prefix: [], games: () => undefined });
  const pgn = parseGames(made.text, () => 'explore0')[0]!;
  assert.ok(pgn.ok);
  assert.deepEqual(new Set(ourPositions(pgn.chapter)), new Set(['', '1. d4 d5', '1. d4 d5 2. c4 e6', '1. d4 d5 2. c4 c6'].map(fenAfter)));
  const cdb = (moves: [string, number][]) => ({ status: 'ok', moves: moves.map(([san, score]) => ({ uci: '', san, score })) });
  const answers = new Map([
    [fenAfter(''), cdb([['e4', 30], ['d4', 25]])],
    [fenAfter('1. d4 d5'), cdb([['c4', 40], ['Nf3', 20]])],
    [fenAfter('1. d4 d5 2. c4 c6'), cdb([['Nc3', 70], ['Nf3', 35]])],
  ]);
  const got = behindRows(pgn.chapter, (f) => answers.get(f));
  assert.deepEqual(got.rows, [{ line: '1. d4 d5 2. c4 c6', ours: 'Nf3', best: 'Nc3', oursCp: 35, bestCp: 70, gap: 35 }], '0.05 behind at the start is nothing; ours best after 1...d5');
  assert.deepEqual([got.asked, got.unknown], [4, 1], 'the position ChessDB has nothing for is counted, not read as fine');
  const md = exploreReport({ name: 'x', what: 'x', record: [], log: parseLog(LOG_TWO), sweep: got }).markdown;
  assert.ok(md.includes('ChessDB asked afresh at the 4 position(s) of the explored file where we move (1 it has no eval for).'), md);
  assert.ok(md.includes("- 1. d4 d5 2. c4 c6: ours Nf3 +0.35, ChessDB's best Nc3 +0.70 (0.35 behind)"), md);
});

test('after an exploration: a ChessDB answer cached before it is dropped; a shallow eval is said to be one', () => {
  const state = (name: string, updated?: string): ExploreState => ({ v: 1, name, ...(updated ? { updated } : {}), runs: 1, targets: 0, explored: 0, left: 0, done: true, changed: 0, behind: 0, refused: 0 });
  assert.equal(chessdbFloor([state('a', '2026-11-28T10:00:00.000Z'), state('b', '2026-11-28T14:05:00.000Z'), state('c')]), Date.parse('2026-11-28T14:05:00.000Z'));
  assert.equal(chessdbFloor([state('c')]), undefined, 'an exploration that explored nothing makes nothing stale');
  const floor = Date.parse('2026-11-28T14:05:00.000Z');
  const rec = (k: string, t: number) => JSON.stringify({ k, t, v: { status: 'ok' } });
  const made = freshRecords([rec('old', floor - 1), rec('at', floor), rec('new', floor + 60000), rec('pv|old', floor - 5000), '{"k":"cut'].join('\n') + '\n', floor);
  assert.deepEqual([made.dropped, made.text], [2, `${rec('at', floor)}\n${rec('new', floor + 60000)}\n`]);
  assert.deepEqual(freshRecords('', floor), { text: '', dropped: 0 });

  // rules.md §2: a stored line under 10 plies, or Stockfish disagreeing by 0.5 or more.
  assert.deepEqual(depthRow('Nc7+', 178, 5, 170), { san: 'Nc7+', cp: 178, plies: 5, sfCp: 170, shallow: true, why: ['its stored line is 5 plies, under 10'] });
  assert.equal(depthRow('Rc1', 102, 12, 124).shallow, false);
  assert.deepEqual(depthRow('Rc1', 102, 12, 40).why, ['Stockfish disagrees by 0.62']);
  assert.deepEqual(depthRow('a4', undefined, 0).why, ['ChessDB has no score for it']);
  assert.equal(depthRow('Qh5', 29990, 3, 500).why.length, 1, 'a mate score is not compared with Stockfish');
  assert.equal(depthText(depthRow('Nc7+', 178, 5, 170)), 'Nc7+     ChessDB  +1.78, stored line  5 plies, Stockfish +1.70  SHALLOW: its stored line is 5 plies, under 10');
});

test("the explorations of a study: what was asked for with what was reported; explored in the last 7 days or not", () => {
  const now = Date.parse('2026-11-29T00:00:00.000Z');
  const starts = [{ name: 'd4-d5', chapter: 'chMain01', line: '1. d4 d5', started: '2026-11-28T12:00:00.000Z', session: 'session_x' }, { name: 'rare', chapter: 'chRare01', line: '', started: '2026-11-20T12:00:00.000Z' }];
  const done: ExploreState = { v: 1, name: 'd4-d5', chapter: 'chMain01', line: '1. d4 d5', updated: '2026-11-28T14:05:00.000Z', runs: 2, targets: 3, explored: 3, left: 0, done: true, changed: 2, behind: 1, refused: 0 };
  const onDemand: ExploreState = { v: 1, name: 'od-1', updated: '2026-11-28T15:00:00.000Z', runs: 1, targets: 2, explored: 1, left: 1, done: false, changed: 0, behind: 0, refused: 0 };
  const all = explorations(starts, [done, onDemand]);
  assert.deepEqual(all.map((e) => [e.name, e.start !== undefined, e.state?.done]), [['d4-d5', true, true], ['rare', true, undefined], ['od-1', false, false]]);
  assert.equal(exploredLately(all, 'chMain01', '1. d4 d5', now)?.name, 'd4-d5');
  assert.equal(exploredLately(all, 'chRare01', '', now), undefined, 'started nine days ago: no longer');
  assert.equal(exploredLately(all, 'chMain01', '1. d4 Nf6', now), undefined);
  assert.equal(
    exploredTable(all, new Map([['chRare01', 'Rare replies']])),
    [
      '| Name | What | Started | Last position explored | Stands | ChessDB changed / ours behind | Report |',
      '|---|---|---|---|---|---|---|',
      '| rare | the chapter "Rare replies" | 2026-11-20 12:00 | none | started 2026-11-20 12:00 UTC, no report yet |  |  |',
      '| d4-d5 | 1. d4 d5 | 2026-11-28 12:00 (session_x) | 2026-11-28 14:05 | finished: 3 explored, 0 left | 2 / 1 | `cdbexplore/d4-d5.md` |',
      '| od-1 | a position, on demand | by its own session | 2026-11-28 15:00 | not finished: 1 explored, 1 left | 0 / 0 | `cdbexplore/od-1.md` |',
    ].join('\n'),
  );
  assert.equal(exploredTable([], new Map()), 'No exploration yet.');
});

test('the lock: none, held for six hours, then stale; a file that can\'t be read stops everyone', () => {
  const now = Date.parse('2026-11-28T18:00:00.000Z');
  const lock = { v: 1 as const, session: 'session_a', at: '2026-11-28T12:30:00.000Z', for: 'batch-6' };
  assert.deepEqual(parseLock(lockText(lock)), lock);
  assert.deepEqual(lockStand(undefined, now), { state: 'none' });
  assert.deepEqual(lockStand(lockText(lock), now), { state: 'held', lock, minutes: 330 });
  assert.equal(lockStand(lockText({ ...lock, at: '2026-11-28T12:00:00.000Z' }), now).state, 'stale', 'six hours to the minute is stale');
  assert.equal(lockStand(lockText({ ...lock, at: '2026-11-28T12:00:01.000Z' }), now).state, 'held');
  assert.deepEqual(lockStand('{ "session": "", "at": "x" }', now), { state: 'unreadable' });
  assert.deepEqual(lockStand('', now), { state: 'unreadable' });
  assert.equal(lockWords(lockStand(lockText(lock), now)), 'held by session_a for batch-6, taken 5.5 h ago');
  assert.match(lockWords(lockStand(lockText({ ...lock, at: '2026-11-28T10:00:00.000Z' }), now)), /^STALE \(older than 6 h: .* by session_a for batch-6, taken 8\.0 h ago$/);
  assert.equal(lockWords({ state: 'none' }), 'none');
});

test('is there work: no list waiting for the owner, he has been quiet, nobody else holds the lock, something to do, the exploration done', () => {
  const now = Date.parse('2026-11-28T18:00:00.000Z');
  const list = (open: number, firstOpen = 0): ListStand => ({ name: 'batch-6', title: 'Jobava: batch 6', positions: 25, answered: 25 - open, open, first: 4, firstOpen });
  const next = { cid: 'chMain01', chapter: 'Main', line: '1. d4 d5 2. c4 c6', single: 3 };
  const base: StatusIn = { study: 'Test', sid: 'Study001', lists: [list(0)], owner: { minutes: 95, subject: 'desktop: 1 study file' }, lock: { state: 'none' }, lockMine: false, next: [next], behind: 0, now };
  const work = statusOf(base);
  assert.deepEqual([work.work, work.line], [true, 'Test: work: merge the answers of batch-6 (25 position(s)), then audit 1. d4 d5 2. c4 c6']);
  // Each reason nothing is done, and its sentence.
  const stop = (change: Partial<StatusIn>) => {
    const s = statusOf({ ...base, ...change });
    assert.equal(s.work, false);
    return s.line;
  };
  assert.equal(stop({ lists: [list(3, 2)] }), 'Test: nothing done: the owner is reviewing: batch-6 has 3 of 25 position(s) open, 2 of them marked "look first"');
  assert.equal(stop({ owner: { minutes: 12, subject: 'phone: 2 logs' } }), 'Test: nothing done: the owner\'s device synced 12 min ago ("phone: 2 logs"): he may still be at it (quiet for 30 min first)');
  const held = lockStand(lockText({ v: 1, session: 'session_b', at: '2026-11-28T17:00:00.000Z', for: 'batch-6' }), now);
  assert.equal(stop({ lock: held }), 'Test: nothing done: another session is writing (the lock is held by session_b for batch-6, taken 60 min ago)');
  assert.equal(statusOf({ ...base, lock: held, lockMine: true }).work, true, 'its own lock stops no session');
  assert.equal(statusOf({ ...base, lock: lockStand(lockText({ v: 1, session: 'session_b', at: '2026-11-28T08:00:00.000Z', for: 'batch-6' }), now) }).work, true, 'a stale lock is taken over');
  assert.match(stop({ lock: { state: 'unreadable' } }), /lock\.json is there and can’t be read/);
  assert.equal(stop({ behind: 2 }), 'Test: nothing done: this checkout is 2 commit(s) behind the remote: git pull, then status again');
  assert.equal(stop({ lists: [], next: [] }), 'Test: nothing done: no review list to merge and nothing left to audit');
  // The next subtree's exploration: waited for while it runs, for a day; then the batch goes on with what there is.
  const running = { name: 'c6', chapter: 'chMain01', line: next.line, start: { name: 'c6', chapter: 'chMain01', line: next.line, started: '2026-11-28T15:00:00.000Z' } };
  assert.equal(stop({ next: [{ ...next, exploration: running }] }), "Test: nothing done: ChessDB's exploration of the next subtree, 1. d4 d5 2. c4 c6, is still running (c6: started 2026-11-28 15:00 UTC, no report yet); a batch waits for it up to 24 h");
  assert.equal(statusOf({ ...base, next: [{ ...next, exploration: { ...running, start: { ...running.start, started: '2026-11-27T15:00:00.000Z' } } }] }).work, true);
  const done: ExploreState = { v: 1, name: 'c6', runs: 1, targets: 2, explored: 2, left: 0, done: true, changed: 0, behind: 0, refused: 0 };
  assert.equal(statusOf({ ...base, next: [{ ...next, exploration: { ...running, state: done } }] }).work, true);
  // No list, a subtree left: the next batch. No owner commit in the history held: quiet.
  const { owner: _none, ...quiet } = base;
  assert.equal(statusOf({ ...quiet, lists: [] }).line, 'Test: work: audit 1. d4 d5 2. c4 c6');
  assert.equal(statusOf({ ...base, next: [{ ...next, line: '' }], lists: [] }).line, 'Test: work: audit the chapter "Main"');
  const text = statusText(statusOf({ ...base, lists: [list(3, 2)], next: [{ ...next, exploration: { ...running, state: done } }] }));
  assert.ok(text.startsWith('Test: nothing done: the owner is reviewing'), text);
  assert.ok(text.includes('  batch-6 (Jobava: batch 6): 25 position(s), 22 answered, 3 open; "look first": 4, 2 of them open\n'), text);
  assert.ok(text.includes('The owner: last commit 95 min ago ("desktop: 1 study file")\nThe lock: none\n'), text);
  assert.ok(text.includes('  1. 1. d4 d5 2. c4 c6 (3 single-move): ChessDB c6, finished: 2 explored, 0 left\n'), text);
});

// ---- The commands, over a scratch data repo ----

const script = new URL('../../../scripts/audit/audit.ts', import.meta.url).pathname;
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
const git = (dir: string, ...args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).stdout.trim();

test('the commands: check, ledger, base, apply (and the base it refuses), scan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-audit-'));
  try {
    const repo = join(dir, 'data');
    const sid = 'Study001';
    const file = (path: string, text: string) => {
      mkdirSync(join(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), text);
    };
    const write = (cid: string, name: string, movetext: string) => file(`studies/${sid}/${cid}.pgn`, chapterFileText(chapter(cid, name, movetext)));
    const commit = (message: string) => {
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', message);
      return git(repo, 'rev-parse', '--short', 'HEAD');
    };
    mkdirSync(repo);
    file('repworks.json', '{ "format": 1 }\n');
    file(`studies/${sid}/study.json`, `${JSON.stringify({ format: 1, id: sid, name: 'Test', kind: 'repertoire', chapters: ['chMain01', 'chRare01'] })}\n`);
    write('chMain01', 'Main', BASE);
    write('chRare01', 'Rare', '1. d4 f5 2. Bg5');
    file(`notes/${sid}/owner.pgn`, pgn('Mine', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O'));
    const state: AuditState = { v: 1, study: sid, chapters: { chMain01: { depth: 4, owner: [{ file: 'owner.pgn', missingMoves: 1, missingComments: 0 }] }, chRare01: { depth: 0 } }, subtrees: { chMain01: { '1. d4 d5 2. c4 e6': { state: 'open', batch: 'batch 1' } } }, targets: {}, exceptions: [], flags: [{ line: '1. d4 f5 2. Bg5', note: 'ChessDB liked 2.Nc3 better.' }] };
    file(`notes/${sid}/audit.json`, `${JSON.stringify(state, null, 2)}\n`);
    file(`notes/${sid}/ledger.md`, '# Ledger\n\n<!-- audit:subtrees chMain01 -->\n<!-- /audit:subtrees chMain01 -->\n\n<!-- audit:order -->\n<!-- /audit:order -->\n\n<!-- audit:base -->\n<!-- /audit:base -->\n');
    git(repo, 'init', '-q');
    const first = commit('session: the study');

    // check: every target met; then a line that ends on the opponent's move.
    const ok = run('check', repo, '--study', sid);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.ok(ok.stdout.includes("ok    the owner's owner.pgn: 1 of his 10 moves missing (accepted: 1), 0 of his 0 comments (accepted: 0)"), ok.stdout);
    assert.ok(ok.stdout.includes('ok    clickable lines: 0 of 0 play in full'), ok.stdout);

    // ledger: the regions written from the chapters and the state; then stale after a change.
    assert.equal(run('ledger', repo, '--study', sid, '--check').status, 1, 'not written yet');
    const wrote = run('ledger', repo, '--study', sid);
    assert.equal(wrote.status, 0, wrote.stdout + wrote.stderr);
    assert.ok(wrote.stderr.includes('the ledger has no region "lists"'), wrote.stderr);
    const ledger = readFileSync(join(repo, `notes/${sid}/ledger.md`), 'utf8');
    assert.ok(ledger.includes('| 1. d4 d5 2. c4 e6 | 2 / 2 / 1 | **Audited, review open, batch 1.** |'), ledger);
    assert.ok(ledger.includes('| 1. d4 d5 2. c4 c6 | 1 / 1 / 1 | **Not audited.** |'), ledger);
    assert.ok(ledger.includes(`is **${first}**`), ledger);
    assert.equal(run('ledger', repo, '--study', sid, '--check').status, 0);
    commit('session: the ledger');

    // The owner edits in the app; the session's ops were written against the first commit.
    write('chMain01', 'Main', BASE.replace('{ The main line. }', '{ The main line. } { [%cal Gc4d5] }').replace('5. e3', '5. e3 O-O'));
    const his = commit('desktop: 1 study file');
    const base = run('base', repo, '--study', sid);
    assert.ok(base.stdout.startsWith(`${first}  session: the study`), base.stdout);
    assert.ok(base.stdout.includes('1 commit(s) to the study since, none a session’s') || base.stdout.includes("1 commit(s) to the study since, none a session's"), base.stdout);

    const ops = join(dir, 'ops.json');
    writeFileSync(ops, JSON.stringify({ chapter: 'chMain01', cut: [{ at: '1. d4 d5 2. c4 dxc4', mode: 'node' }], comments: [{ at: '1. d4 d5 2. c4 e6 3. Nc3', set: 'Against ...dxc4, e4: (2... dxc4 3. e4)' }, { at: '1. d4 d5 2. c4 c6', set: 'transposes to 1. d4 d5 2. c4 e6' }] }));
    const dry = run('apply', repo, '--study', sid, '--ops', ops, '--base', first, '--dry-run');
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.equal(git(repo, 'status', '--porcelain'), '', 'a dry run writes nothing');
    // Writing needs the lock (§5.220): without it nothing is written.
    const unlocked = run('apply', repo, '--study', sid, '--ops', ops, '--base', first);
    assert.equal(unlocked.status, 2);
    assert.ok(unlocked.stderr.includes(`REFUSED: no lock: notes/${sid}/lock.json is not there.`), unlocked.stderr);
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.equal(run('lock', repo, '--study', sid, '--session', 'session_test', '--for', 'batch 2', '--no-push').status, 0);
    const applied = run('apply', repo, '--study', sid, '--ops', ops, '--base', first);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    assert.ok(applied.stdout.includes('carried: his arrows at 1. d4 d5 2. c4 e6'), applied.stdout);
    assert.ok(applied.stdout.includes('carried: added by him, with everything below it: 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O'), applied.stdout);
    // 2...c6 still has moves below it, so its "transposes to" note is on no leaf and stays; nothing dead.
    const now = readFileSync(join(repo, `studies/${sid}/chMain01.pgn`), 'utf8');
    assert.ok(now.includes('2. c4 e6 { The main line. } { [%cal Gc4d5] } (2... c6 { transposes to 1. d4 d5 2. c4 e6 } 3. Nf3 Nf6 4. Nc3) 3. Nc3 { Against ...dxc4, e4: (2... dxc4 3. e4) } 3... Nf6 4. Bg5 Be7 5. e3 O-O'), now);
    const after = run('check', repo, '--study', sid);
    assert.equal(after.status, 1, after.stdout);
    assert.ok(after.stdout.includes("MISS  lines end on our move: 1 line(s) end on the opponent's move"), after.stdout);
    assert.ok(after.stdout.includes('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O (Main)'), after.stdout);
    const mine = commit('session: batch 2');

    // A base behind the session's own commit: refused, with the commit to use named.
    const refused = run('apply', repo, '--study', sid, '--ops', ops, '--base', his);
    assert.equal(refused.status, 2);
    assert.ok(refused.stderr.includes(`REFUSED: the base ${his} is behind the session's own commit(s) to this study:\n  ${mine}  session: batch 2`), refused.stderr);
    assert.ok(refused.stderr.includes(`Use --base ${mine}`), refused.stderr);
    assert.equal(git(repo, 'status', '--porcelain'), '');
    // Ops that no longer apply to the base are an error, and nothing is written.
    const again = run('apply', repo, '--study', sid, '--ops', ops);
    assert.equal(again.status, 1);
    assert.ok(again.stdout.includes('NOTHING WRITTEN: 1 error(s)') && again.stdout.includes('cut: no such line in the chapter: 1. d4 d5 2. c4 dxc4'), again.stdout);
    assert.equal(git(repo, 'status', '--porcelain'), '');

    // scan: what a push would carry since a commit.
    const secret = `lip_${'Zz9'.repeat(8)}`;
    file(`notes/${sid}/batches/batch-2/practical.log`, `token ${secret}\n`);
    const scanned = run('scan', repo, '--since', mine);
    assert.equal(scanned.status, 1);
    assert.ok(scanned.stdout.includes(`STOP  token  notes/${sid}/batches/batch-2/practical.log:1`), scanned.stdout);
    assert.ok(!scanned.stdout.includes(secret));
    rmSync(join(repo, `notes/${sid}/batches`), { recursive: true });
    assert.equal(run('scan', repo, '--since', first).status, 0);

    // An unknown command and a missing study say what there is.
    assert.equal(run('nonsense', repo).status, 2);
    assert.ok(run('check', repo, '--study', 'Nope').stderr.includes('no study "Nope"; there are: Test (Study001)'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the commands: the lock between two checkouts, status, a list by its holder only, the tally, an exploration\'s files and what it makes stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-audit-flow-'));
  try {
    const sid = 'Study001';
    const origin = join(dir, 'origin.git');
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    const cache = join(dir, 'cache');
    const file = (repo: string, path: string, text: string) => {
      mkdirSync(join(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), text);
    };
    // A commit made some time ago: the owner's sync must be half an hour old before a session works.
    const commit = (repo: string, message: string, minutesAgo = 0) => {
      const date = new Date(Date.now() - minutesAgo * 60000).toISOString();
      spawnSync('git', ['-C', repo, 'add', '-A'], { env });
      spawnSync('git', ['-C', repo, 'commit', '-q', '-m', message], { env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
      return git(repo, 'rev-parse', '--short', 'HEAD');
    };
    const line1 = (r: { stdout: string }): string => r.stdout.split('\n')[0] ?? '';
    spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env });
    spawnSync('git', ['init', '-q', '-b', 'main', a], { env });
    file(a, 'repworks.json', '{ "format": 1 }\n');
    file(a, `studies/${sid}/study.json`, `${JSON.stringify({ format: 1, id: sid, name: 'Test', kind: 'repertoire', chapters: ['chMain01', 'chRare01'] })}\n`);
    file(a, `studies/${sid}/chMain01.pgn`, chapterFileText(chapter('chMain01', 'Main', BASE)));
    file(a, `studies/${sid}/chRare01.pgn`, chapterFileText(chapter('chRare01', 'Rare', '1. d4 f5 2. Bg5')));
    const state: AuditState = { v: 1, study: sid, chapters: { chMain01: { depth: 4 }, chRare01: { depth: 0 } }, subtrees: { chMain01: { '1. d4 d5 2. c4 e6': { state: 'closed', batch: 'batch 1' } } }, targets: {}, exceptions: [], flags: [] };
    file(a, `notes/${sid}/audit.json`, auditStateText(state));
    file(a, `notes/${sid}/ledger.md`, '# Ledger\n\n<!-- audit:batches -->\n<!-- /audit:batches -->\n\n<!-- audit:explored -->\n<!-- /audit:explored -->\n');
    const first = commit(a, 'session: the study', 600);
    file(a, `studies/${sid}/chRare01.pgn`, chapterFileText(chapter('chRare01', 'Rare', '1. d4 f5 2. Bg5 h6')));
    commit(a, 'desktop: 1 study file', 2);
    git(a, 'remote', 'add', 'origin', origin);
    git(a, 'push', '-q', '-u', 'origin', 'main');

    // status: he synced two minutes ago. Half an hour later there is work: the next subtree.
    assert.equal(line1(run('status', a, '--study', sid)), 'Test: nothing done: the owner\'s device synced 2 min ago ("desktop: 1 study file"): he may still be at it (quiet for 30 min first)');
    spawnSync('git', ['-C', a, 'commit', '-q', '--amend', '--no-edit', '--date', new Date(Date.now() - 90 * 60000).toISOString()], { env: { ...env, GIT_COMMITTER_DATE: new Date(Date.now() - 90 * 60000).toISOString() } });
    git(a, 'push', '-q', '-f', 'origin', 'main');
    spawnSync('git', ['clone', '-q', origin, b], { env });
    const idle = run('status', a, '--study', sid);
    assert.equal(line1(idle), 'Test: work: audit 1. d4 d5 2. c4 c6', idle.stdout + idle.stderr);
    assert.ok(idle.stdout.includes('The owner: last commit 90 min ago ("desktop: 1 study file")\nThe lock: none\n'), idle.stdout);
    assert.equal((JSON.parse(run('status', a, '--study', sid, '--json').stdout) as { work: boolean }).work, true);

    // The lock: taken and pushed by a; b is behind until it pulls, then sees it held, and can take or write nothing.
    const locked = run('lock', a, '--study', sid, '--session', 'session_a', '--for', 'batch-2');
    assert.equal(locked.status, 0, locked.stdout + locked.stderr);
    assert.ok(locked.stdout.startsWith('Locked: Test (Study001) by session_a for batch-2, pushed.'), locked.stdout);
    assert.equal(git(a, 'log', '-1', '--format=%s'), 'session: Test, lock for batch-2');
    assert.equal(git(origin, 'log', '-1', '--format=%s', 'main'), 'session: Test, lock for batch-2');
    assert.ok(line1(run('status', a, '--study', sid)).startsWith('Test: work:'), 'its own lock stops no session');
    assert.equal(line1(run('status', b, '--study', sid)), 'Test: nothing done: this checkout is 1 commit(s) behind the remote: git pull, then status again');
    const early = run('lock', b, '--study', sid, '--session', 'session_b', '--for', 'batch-2');
    assert.equal(early.status, 2);
    assert.ok(early.stderr.includes('REFUSED: this checkout is behind the remote'), early.stderr);
    git(b, 'pull', '-q');
    assert.match(line1(run('status', b, '--study', sid)) ?? '', /^Test: nothing done: another session is writing \(the lock is held by session_a for batch-2, taken 0 min ago\)$/);
    const second = run('lock', b, '--study', sid, '--session', 'session_b', '--for', 'batch-2');
    assert.equal(second.status, 1);
    assert.ok(second.stdout.startsWith('REFUSED: the lock is held by session_a for batch-2'), second.stdout);
    const ops = join(dir, 'ops.json');
    writeFileSync(ops, JSON.stringify({ chapter: 'chMain01', comments: [{ at: '1. d4 d5 2. c4 e6 3. Nc3', set: 'Against ...dxc4, e4: (2... dxc4 3. e4)' }], cut: [{ at: '1. d4 d5 2. c4 dxc4', mode: 'node' }] }));
    const foreign = run('apply', b, '--study', sid, '--ops', ops);
    assert.equal(foreign.status, 2);
    assert.ok(foreign.stderr.includes("REFUSED: the lock is not this checkout's: held by session_a for batch-2") && foreign.stderr.includes('Another session is writing: stop.'), foreign.stderr);
    assert.equal(git(b, 'status', '--porcelain'), '');
    assert.equal(run('unlock', b, '--study', sid).status, 2, 'nor release it');

    // a applies its batch and writes the review list; b may not write one.
    const applied = run('apply', a, '--study', sid, '--ops', ops);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    const batch = commit(a, 'session: Test, batch-2');
    const notes = join(dir, 'notes.json');
    writeFileSync(notes, JSON.stringify([{ moves: '1. d4 d5 2. c4 e6 3. Nc3', text: 'Your 2... dxc4 line is a clickable now.', first: true }]));
    const diff = new URL('../../../scripts/chapter-diff.ts', import.meta.url).pathname;
    const listed = spawnSync(process.execPath, [diff, `${a}@${batch}~1`, a, '--study', sid, '--review', 'batch-2', '--title', 'Test: batch 2', '--notes', notes], { encoding: 'utf8', env });
    assert.equal(listed.status, 0, listed.stderr);
    assert.ok(listed.stderr.includes('2 item(s) at 2 position(s), 1 with your words, 1 position(s) marked "look first"'), listed.stderr);
    const refusedList = spawnSync(process.execPath, [diff, `${a}@${batch}~1`, a, '--study', sid, '--review', 'batch-2'], { encoding: 'utf8', env, cwd: b });
    assert.equal(refusedList.status, 0, 'the same checkout again is fine');
    git(b, 'pull', '-q');
    const foreignList = spawnSync(process.execPath, [diff, `${b}@${first}`, b, '--study', sid, '--review', 'batch-9'], { encoding: 'utf8', env });
    assert.equal(foreignList.status, 1);
    assert.ok(foreignList.stderr.includes("REFUSED: the lock is not this checkout's"), foreignList.stderr);
    assert.ok(!existsSync(join(b, `review/${sid}/batch-9.json`)));
    spawnSync(process.execPath, [diff, `${a}@${batch}~1`, a, '--study', sid, '--review', 'batch-2', '--title', 'Test: batch 2', '--notes', notes], { encoding: 'utf8', env });
    assert.equal(run('lint', a, '--study', sid, '--list', 'batch-2').status, 0, 'one of the two positions marked');
    commit(a, 'session: Test, batch-2, review list');
    const released = run('unlock', a, '--study', sid);
    assert.equal(released.status, 0, released.stdout + released.stderr);
    assert.ok(released.stdout.includes('Lock released: committed and pushed'), released.stdout);
    assert.ok(!existsSync(join(a, `notes/${sid}/lock.json`)));

    // He has not answered: no work. Answered (a No to the comment, his device's log synced an hour ago): work, and the tally.
    assert.equal(line1(run('status', a, '--study', sid)), 'Test: nothing done: the owner is reviewing: batch-2 has 2 of 2 position(s) open, 1 of them marked "look first"');
    const items = (JSON.parse(readFileSync(join(a, `review/${sid}/batch-2.json`), 'utf8')) as { items: { id: string; kind: string }[] }).items;
    file(a, 'progress/Phone001/2026-11-28.jsonl', items.map((i, n) => JSON.stringify({ v: 1, n: n + 1, t: `2026-11-28T10:00:0${n}.000Z`, k: 'answer', card: `v|${sid}|batch-2|${i.id}`, a: i.kind === 'comment' ? 'no' : 'ok', ...(i.kind === 'comment' ? { note: 'keep it drilled' } : {}) })).join('\n') + '\n');
    commit(a, 'phone: 1 log', 60);
    assert.equal(line1(run('status', a, '--study', sid, '--no-fetch')), 'Test: work: merge the answers of batch-2 (2 position(s)), then audit 1. d4 d5 2. c4 c6');
    const tallied = run('tally', a, '--study', sid, '--list', 'batch-2');
    assert.equal(tallied.status, 0, tallied.stdout + tallied.stderr);
    assert.ok(tallied.stdout.startsWith('batch-2: 2 position(s): 1 OK, 1 No, 0 with a note only, 0 he edited himself, 0 not answered. Corrected: 1 of 2 (50%). "Look first": 1 marked, 1 of them corrected.'), tallied.stdout);
    const after = parseAuditState(readFileSync(join(a, `notes/${sid}/audit.json`), 'utf8'));
    assert.ok(after.ok);
    assert.deepEqual(after.state.batches, [{ name: 'batch-2', title: 'Test: batch 2', date: new Date().toISOString().slice(0, 10), positions: 2, ok: 1, no: 1, notes: 0, edited: 0, open: 0, first: 1, firstCorrected: 1 }]);
    assert.equal(run('tally', a, '--study', sid, '--list', 'nope').status, 2);

    // An exploration asked for: its PGN and its start. Asked again within 7 days: not started.
    const key = (l: string) => `${fenAfter(l).split(' ').slice(0, 4).join(' ')}#blitz,classical,rapid|1600,1800,2000,2200,2500|`;
    const games = gamesOf(EXPLORE_GAMES);
    const store = createFileCache(cache, Date.now);
    for (const l of ['1. d4', '1. d4 d5 2. c4', '1. d4 d5 2. c4 c6 3. Nf3']) void store.put('explorer', key(l), games(fenAfter(l)));
    const started = run('explore-start', a, '--study', sid, '--chapter', 'chMain01', '--line', '1. d4 d5 2. c4 c6', '--cache', cache, '--offline', '--session', 'session_x');
    assert.equal(started.status, 0, started.stdout + started.stderr);
    assert.ok(started.stdout.startsWith(`d4-d5-c4-c6: wrote notes/${sid}/cdbexplore/d4-d5-c4-c6.pgn (1 line end(s), 3 position(s) with the opponent's shares, 0 line(s)`), started.stdout);
    assert.ok(readFileSync(join(a, `notes/${sid}/cdbexplore/d4-d5-c4-c6.pgn`), 'utf8').endsWith('1. d4 d5 { 40.0% } 2. c4 c6 { 25.0% } 3. Nf3 Nf6 { 75.0% } 4. Nc3 *\n'));
    assert.ok(run('explore-start', a, '--study', sid, '--chapter', 'chMain01', '--line', '1. d4 d5 2. c4 c6', '--cache', cache, '--offline').stdout.startsWith('Not started: 1. d4 d5 2. c4 c6 was explored in the last 7 days (d4-d5-c4-c6: started '));
    // A subtree whose games the cache lacks: nothing written.
    const lacking = run('explore-start', a, '--study', sid, '--chapter', 'chRare01', '--cache', join(dir, 'empty'), '--offline');
    assert.equal(lacking.status, 2);
    assert.ok(lacking.stderr.includes('NOT COMPLETE: the games of 2 position(s) are not known'), lacking.stderr);
    assert.ok(!existsSync(join(a, `notes/${sid}/cdbexplore/rare.pgn`)));

    // While it runs, the batch for that subtree waits; its report written, the batch goes on.
    assert.match(line1(run('status', a, '--study', sid, '--no-fetch')) ?? '', /^Test: nothing done: ChessDB's exploration of the next subtree, 1\. d4 d5 2\. c4 c6, is still running \(d4-d5-c4-c6: started .* UTC, no report yet\); a batch waits for it up to 24 h$/);
    const recent = new Date(Date.now() - 60000).toISOString();
    file(a, `notes/${sid}/cdbexplore/d4-d5-c4-c6.explore.json`, JSON.stringify({ targets: { b: { ...RECORD['b']!, at: recent } } }));
    file(a, `notes/${sid}/cdbexplore/d4-d5-c4-c6.explore.log`, LOG_TWO.split('\n').slice(11).join('\n').replace('Survey: 3 positions to explore (2 line ends, 1 decisions), 2 of them explored recently', 'Survey: 1 positions to explore (0 line ends, 1 decisions)'));
    const report = run('explore-report', a, '--study', sid, '--name', 'd4-d5-c4-c6', '--no-sweep');
    assert.equal(report.status, 0, report.stdout + report.stderr);
    assert.ok(report.stdout.startsWith(`d4-d5-c4-c6: finished (1 explored, 0 left); ChessDB changed at 1 position(s), 1 move(s) of ours 0.30 or more behind. Report: notes/${sid}/cdbexplore/d4-d5-c4-c6.md.`), report.stdout);
    const md = readFileSync(join(a, `notes/${sid}/cdbexplore/d4-d5-c4-c6.md`), 'utf8');
    assert.ok(md.includes('The subtree 1. d4 d5 2. c4 c6 of the chapter "Main" (Test).') && md.includes("- 1. d4 d5 2. c4 c6: ours Nf3 +0.25, ChessDB's best Nc3 +0.60 (0.35 behind)"), md);
    assert.ok(line1(run('status', a, '--study', sid, '--no-fetch'))!.startsWith('Test: work:'));
    assert.equal(run('explore-report', a, '--study', sid, '--name', 'nope', '--no-sweep').status, 2);
    // explore-run without the tool says where it comes from.
    const noTool = run('explore-run', a, '--study', sid, '--names', 'd4-d5-c4-c6', '--q', join(dir, 'no-q'));
    assert.equal(noTool.status, 2);
    assert.ok(noTool.stderr.includes('git clone --branch claude/gifted-cori-2whjds https://github.com/skAeglund/q_extension') && noTool.stderr.includes('a396b4d'), noTool.stderr);

    // The ledger's tables of batches and explorations.
    assert.equal(run('ledger', a, '--study', sid).status, 0);
    const ledger = readFileSync(join(a, `notes/${sid}/ledger.md`), 'utf8');
    assert.ok(ledger.includes('| batch-2 (Test: batch 2) | '), ledger);
    assert.ok(ledger.includes('| 2 | 1 | 1 | 0 | 0 | 0 | 1 of 2 (50%) | 1, 1 |'), ledger);
    assert.ok(/\| d4-d5-c4-c6 \| 1\. d4 d5 2\. c4 c6 \| [\d-]+ [\d:]+ \(session_x\) \| [\d-]+ [\d:]+ \| finished: 1 explored, 0 left \| 1 \/ 1 \| `cdbexplore\/d4-d5-c4-c6\.md` \|/.test(ledger), ledger);

    // A ChessDB answer cached before the exploration's last position is dropped by the command that would decide on it.
    const old = JSON.stringify({ k: 'old', t: Date.now() - 3600000, v: { status: 'ok', moves: [] } });
    const fresh = JSON.stringify({ k: 'fresh', t: Date.now(), v: { status: 'ok', moves: [] } });
    writeFileSync(join(cache, 'chessdb.jsonl'), `${old}\n${fresh}\n`);
    const calls = run('close-calls', a, '--study', sid, '--chapter', 'chMain01', '--cache', cache, '--offline');
    assert.ok(calls.stderr.includes('ChessDB: 1 cached answer(s) in') && calls.stderr.includes('are older than the last exploration'), calls.stderr);
    assert.equal(readFileSync(join(cache, 'chessdb.jsonl'), 'utf8'), `${fresh}\n`);

    // A lock left by a session that died: stale after six hours, and taken over.
    file(a, `notes/${sid}/lock.json`, lockText({ v: 1, session: 'session_dead', at: new Date(Date.now() - 7 * 3600000).toISOString(), for: 'batch-3' }));
    commit(a, 'session: Test, lock for batch-3');
    assert.ok(run('status', a, '--study', sid, '--no-fetch').stdout.includes('The lock: STALE (older than 6 h'));
    assert.ok(line1(run('status', a, '--study', sid, '--no-fetch'))!.startsWith('Test: work:'));
    const stale = run('apply', a, '--study', sid, '--ops', ops);
    assert.equal(stale.status, 2);
    const taken = run('lock', a, '--study', sid, '--session', 'session_c', '--for', 'batch-3', '--no-push');
    assert.equal(taken.status, 0, taken.stdout + taken.stderr);
    assert.ok(taken.stdout.startsWith('A stale lock is taken over: it was STALE') && taken.stdout.includes('Locked: Test (Study001) by session_c for batch-3, committed, not pushed.'), taken.stdout);
    assert.equal(run('unlock', a, '--study', sid, '--no-push').status, 0);
    assert.equal(run('unlock', a, '--study', sid, '--no-push').stdout.trim(), 'No lock to release.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
