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
// - scanText printing the whole token → "what must not be pushed".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { CompactExplorer } from '../../../src/core/explorer/providers.ts';
import { parseChapterFile } from '../../../src/core/pgn/parse.ts';
import { chapterFileText } from '../../../src/core/pgn/write.ts';
import type { Chapter } from '../../../src/core/study/model.ts';
import { closeCalls, decisionFlags } from '../../../scripts/audit/closecalls.ts';
import { inventory, inventoryText, oneIn, positionsNeeded } from '../../../scripts/audit/inventory.ts';
import { ledgerRows, listsTable, regionsIn, subtreeTable, suggestedOrder, writeRegions } from '../../../scripts/audit/ledger.ts';
import { lintComment, lintWords, linesIn } from '../../../scripts/audit/lint.ts';
import { createLookups } from '../../../scripts/audit/lookups.ts';
import { applyOps, behind, isSessionCommit, merge3 } from '../../../scripts/audit/ops.ts';
import { scanText, stops } from '../../../scripts/audit/scan.ts';
import { parseAuditState, practicalArgs, type AuditState } from '../../../scripts/audit/state.ts';
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
