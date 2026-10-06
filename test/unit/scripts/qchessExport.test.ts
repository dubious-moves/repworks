// The Qchess export script (PLAN.md §4.10): its pure part, qchessStudyToPgn, on a hand-built
// studyData shaped like the study page's (read 2026-10-06), and its output imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildImport, readImport } from '../../../src/core/import/plan.ts';
import { header } from '../../../src/core/study/model.ts';
import { mulberry32 } from '../../support/random.ts';

const SCRIPT = join(import.meta.dirname, '../../../scripts/qchess-export.js');

type StudyToPgn = (study: unknown, isDefaultIntro?: (pgn: string) => boolean) => string;

/** Runs the script off a Qchess page, where it hands back its pure part. */
function load(): StudyToPgn {
  const logged: string[] = [];
  const fn = runInNewContext(readFileSync(SCRIPT, 'utf8'), { console: { log: (line: string) => logged.push(line) } }) as unknown;
  assert.equal(typeof fn, 'function');
  assert.match(logged[0]!, /not a Qchess study page/);
  return fn as StudyToPgn;
}

const DEFAULT_INTRO = '[ChapterName "Introduction"]\n\n{Press "ctrl + a" on your keyboard to edit this text.}';

const studyData = {
  name: 'My "Sicilian"',
  folders: [
    { id: 'f1', name: 'Main "lines"', chapter_uuids: ['u-najdorf'], exclude_from_movetrainer: false },
    { id: 'f2', name: 'Model games', chapter_uuids: ['u-game'], exclude_from_movetrainer: true },
  ],
  chapters: [
    { name: 'Introduction', pgn: DEFAULT_INTRO, is_intro: true, chapter_uuid: 'u-intro' },
    // A Black chapter in a folder; Qchess's writer: shapes first in one block, $n glyphs.
    { name: 'Najdorf', pgn: '[ChapterName "Najdorf"]\n[Event "Najdorf"]\n\n1. e4 c5 2. Nf3 d6 $146 {[%cal Rd2d4] Prepare d4} 3. d4 *', perspective: 'black', chapter_uuid: 'u-najdorf', exclude_from_movetrainer: false },
    // In a folder excluded from the MoveTrainer.
    { name: 'Fischer game', pgn: '[ChapterName "Fischer game"]\n\n1. e4 c5 2. Nf3 *', perspective: 'black', chapter_uuid: 'u-game' },
    // Stored without headers, White, excluded itself; and an old Orientation is replaced.
    { name: 'Anti-Sicilian', pgn: '1. e4 c5 2. c3 *', perspective: 'white', chapter_uuid: 'u-anti', exclude_from_movetrainer: true },
    // A name with a bare quote, as Qchess stores it (its headers are written unescaped).
    { name: 'The "Poisoned" Pawn', pgn: '[ChapterName "The "Poisoned" Pawn"]\n[Orientation "white"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Qb6 *', perspective: 'black', chapter_uuid: 'u-poison' },
    // An empty chapter from a FEN.
    { name: 'Endgame', pgn: '', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', perspective: 'white', chapter_uuid: 'u-end' },
  ],
};

const isDefaultIntro = (pgn: string) => pgn === DEFAULT_INTRO;

test('qchessStudyToPgn adds StudyName, Orientation, QchessFolder and QchessTrain, and skips the default intro', () => {
  const text = load()(studyData, isDefaultIntro);
  const chapters = text.split('\n\n\n');
  assert.equal(chapters.pop(), '');
  assert.equal(chapters.length, 5);
  assert.equal(
    chapters[0],
    '[StudyName "My \\"Sicilian\\""]\n[ChapterName "Najdorf"]\n[Event "Najdorf"]\n[Orientation "black"]\n[QchessFolder "Main \\"lines\\""]\n\n1. e4 c5 2. Nf3 d6 $146 {[%cal Rd2d4] Prepare d4} 3. d4 *',
  );
  assert.equal(chapters[1], '[StudyName "My \\"Sicilian\\""]\n[ChapterName "Fischer game"]\n[Orientation "black"]\n[QchessFolder "Model games"]\n[QchessTrain "false"]\n\n1. e4 c5 2. Nf3 *');
  assert.equal(chapters[2], '[StudyName "My \\"Sicilian\\""]\n[ChapterName "Anti-Sicilian"]\n[Orientation "white"]\n[QchessTrain "false"]\n\n1. e4 c5 2. c3 *');
  assert.match(chapters[3]!, /^\[StudyName "My \\"Sicilian\\""\]\n\[ChapterName "The \\"Poisoned\\" Pawn"\]\n\[Orientation "black"\]\n\n1\. e4/);
  assert.equal(chapters[4], '[StudyName "My \\"Sicilian\\""]\n[ChapterName "Endgame"]\n[SetUp "1"]\n[FEN "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1"]\n[Orientation "white"]\n\n*');
});

test('an intro chapter that was edited is kept, and without the page function every intro is', () => {
  const edited = { ...studyData, chapters: [{ name: 'Introduction', pgn: '[ChapterName "Introduction"]\n\n{My own notes}', is_intro: true, chapter_uuid: 'u-intro' }] };
  assert.match(load()(edited, isDefaultIntro), /\{My own notes\}/);
  assert.equal(load()({ ...studyData, chapters: [studyData.chapters[0]] }).split('\n\n\n').length, 2);
});

test('the export imports with the right sides, names, and companion reference study', () => {
  const reading = readImport(load()(studyData, isDefaultIntro));
  assert.equal(reading.studyName, 'My "Sicilian"');
  assert.equal(reading.fromQchess, true);
  assert.deepEqual(reading.refused, []);
  assert.deepEqual(
    reading.chapters.map((c) => [c.name, c.side, c.train, c.folder]),
    [
      ['Najdorf', 'black', true, 'Main "lines"'],
      ['Fischer game', 'black', false, 'Model games'],
      ['Anti-Sicilian', 'white', false, undefined],
      ['The "Poisoned" Pawn', 'black', true, undefined],
      ['Endgame', 'white', true, undefined],
    ],
  );
  const result = buildImport(reading, { name: reading.studyName!, kind: 'repertoire', source: { kind: 'qchess', name: reading.studyName! }, sides: new Map() }, { random: mulberry32(7), taken: new Set(), now: '2026-10-06T10:00:00.000Z' });
  if (!result.ok) assert.fail(result.error);
  assert.deepEqual(
    result.studies.map((s) => [s.meta.name, s.meta.kind, s.chapters.map((c) => [header(c, 'ChapterName'), header(c, 'Orientation')])]),
    [
      ['My "Sicilian"', 'repertoire', [['Najdorf', 'black'], ['The "Poisoned" Pawn', 'black'], ['Endgame', 'white']]],
      ['My "Sicilian" (reference)', 'reference', [['Fischer game', 'black'], ['Anti-Sicilian', 'white']]],
    ],
  );
  // The Najdorf's Qchess comment block comes out in Lichess's dialect (with no Result header,
  // nothing follows the moves, as scalachess writes it).
  const najdorf = result.studies[0]!.chapters[0]!;
  assert.match(result.files.get(`studies/${result.studies[0]!.meta.id}/${najdorf.id}.pgn`)!, /2\. Nf3 d6 \$146 \{ Prepare d4 \} \{ \[%cal Rd2d4\] \} 3\. d4\n$/);
});
