// Import (PLAN.md §4.10): reading PGN as chapters with their sides, building a new study's files,
// the companion reference study, and the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDataRepo } from '../../../../src/core/data/validate.ts';
import { buildImport, chapterName, describeNote, headerCounts, readImport, sidesMissing, type ImportChoices, type ImportReading, type Side } from '../../../../src/core/import/plan.ts';
import { extractStudyId, parseStudyList, studyExportPath } from '../../../../src/core/import/lichess.ts';
import { parseStudyMeta } from '../../../../src/core/study/studyMeta.ts';
import { header } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';

const FIXTURES = join(import.meta.dirname, '../../../fixtures/pgn');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
/** Two chapters of a Lichess study export, each followed by three newlines. */
const lichessExport = () => fixture('lichess-handmade-1.pgn') + '\n\n' + fixture('lichess-handmade-2.pgn') + '\n\n';
const NOW = '2026-10-06T10:00:00.000Z';
const ctx = (taken: string[] = [], seed = 1) => ({ random: mulberry32(seed), taken: new Set(taken), now: NOW });
const choices = (over: Partial<ImportChoices> = {}): ImportChoices => ({ name: 'Rep', kind: 'repertoire', source: { kind: 'file', name: 'x.pgn' }, sides: new Map(), ...over });

function built(reading: ImportReading, c: ImportChoices, taken: string[] = []) {
  const result = buildImport(reading, c, ctx(taken));
  if (!result.ok) assert.fail(result.error);
  return result;
}

/** The built files plus repworks.json, as validate-data sees a data repo. */
function assertValid(files: Map<string, string>) {
  const report = validateDataRepo(new Map([['repworks.json', '{ "format": 1 }\n'], ...files]));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
}

test('a Lichess export imports chapter by chapter, each stored byte for byte as Lichess exported it', () => {
  const text = lichessExport();
  const reading = readImport(text);
  assert.equal(reading.studyName, 'Rep');
  assert.equal(reading.fromQchess, false);
  assert.deepEqual(reading.refused, []);
  assert.deepEqual(reading.chapters.map((c) => [c.name, c.side, c.train]), [['Najdorf', 'black', true], ['Endgame', 'white', true]]);
  assert.deepEqual(sidesMissing(reading, new Map()), []);
  const result = built(reading, choices({ source: { kind: 'lichess', id: 'AbCd1234', name: 'Rep' } }));
  assert.equal(result.studies.length, 1);
  const { meta } = result.studies[0]!;
  assert.equal(meta.kind, 'repertoire');
  assert.deepEqual(meta.source, { kind: 'lichess', id: 'AbCd1234', name: 'Rep', imported: NOW });
  const chunks = text.split('\n\n\n').filter((c) => c.trim());
  assert.deepEqual(meta.chapters.map((cid) => result.files.get(`studies/${meta.id}/${cid}.pgn`)), chunks.map((c) => `${c}\n`));
  const stored = parseStudyMeta(result.files.get(`studies/${meta.id}/study.json`)!, meta.id);
  assert.ok(stored.ok);
  assert.deepEqual(stored.value, meta);
  assertValid(result.files);
});

test('renaming the study on import rewrites StudyName and the Lichess-style Event, as a rename does', () => {
  const result = built(readImport(lichessExport()), choices({ name: 'My Najdorf' }));
  const [najdorf] = result.studies[0]!.chapters;
  assert.equal(header(najdorf!, 'StudyName'), 'My Najdorf');
  assert.equal(header(najdorf!, 'Event'), 'My Najdorf: Najdorf');
  assert.equal(header(najdorf!, 'ChapterName'), 'Najdorf');
});

test('a study whose IDs already exist still imports as a new study, with new IDs', () => {
  const reading = readImport(lichessExport());
  const first = built(reading, choices());
  const sid = first.studies[0]!.meta.id;
  // The same random sequence would give the same ID: the taken one is skipped.
  const second = buildImport(reading, choices(), ctx([sid], 1));
  assert.ok(second.ok);
  assert.notEqual(second.studies[0]!.meta.id, sid);
  assert.equal(second.studies[0]!.chapters.length, 2);
  // Chapter IDs are distinct within a study.
  assert.equal(new Set(second.studies[0]!.meta.chapters).size, 2);
});

test('a chapter without a side waits for one; the side chosen goes into [Orientation]', () => {
  const reading = readImport(fixture('qchess-sample.pgn'));
  assert.deepEqual(reading.chapters.map((c) => c.side), [undefined, undefined]);
  const refused = buildImport(reading, choices(), ctx());
  assert.deepEqual(refused, { ok: false, error: 'choose a side for Najdorf 6.Bg5, From a FEN, Black to move' });
  const sides = new Map<number, Side>([[0, 'black'], [1, 'white']]);
  assert.deepEqual(sidesMissing(reading, sides), []);
  const result = built(reading, choices({ sides }));
  const [a, b] = result.studies[0]!.chapters;
  assert.equal(header(a!, 'Orientation'), 'black');
  assert.equal(header(b!, 'Orientation'), 'white');
  // Qchess's single block of shapes and text becomes Lichess's two blocks.
  const text = result.files.get(`studies/${result.studies[0]!.meta.id}/${a!.id}.pgn`)!;
  assert.match(text, /^\[ChapterName "Najdorf 6\.Bg5"\]\n\[Event "Najdorf 6\.Bg5"\]\n\[White "Najdorf 6\.Bg5"\]\n\[Orientation "black"\]\n\[StudyName "Rep"\]\n\n/);
  assert.match(text, /\{ The key square \(with braces typed as parens\) \} \{ \[%csl Gd5\]\[%cal Gf6d5\] \}/);
  assertValid(result.files);
});

test('a side the owner picks overrides the one the PGN gives', () => {
  const result = built(readImport(lichessExport()), choices({ sides: new Map([[0, 'white']]) }));
  assert.equal(header(result.studies[0]!.chapters[0]!, 'Orientation'), 'white');
});

test("Qchess's [ChapterPerspective] gives the side when [Orientation] is missing", () => {
  const reading = readImport('[ChapterName "A"]\n[ChapterPerspective "black"]\n\n1. e4 c5 *\n\n[ChapterName "B"]\n[Orientation "white"]\n[ChapterPerspective "black"]\n\n1. d4 *\n');
  assert.deepEqual(reading.chapters.map((c) => c.side), ['black', 'white']);
  assert.equal(reading.fromQchess, true);
});

test('[QchessTrain "false"] chapters go into a companion reference study; a reference import keeps them', () => {
  const text = '[StudyName "Sicilian"]\n[ChapterName "Main"]\n[Orientation "black"]\n\n1. e4 c5 *\n\n\n[StudyName "Sicilian"]\n[ChapterName "Model game"]\n[Orientation "black"]\n[QchessFolder "Games"]\n[QchessTrain "false"]\n\n1. e4 c5 2. Nf3 *\n\n\n';
  const reading = readImport(text);
  assert.deepEqual(reading.chapters.map((c) => [c.train, c.folder]), [[true, undefined], [false, 'Games']]);
  const result = built(reading, choices({ name: 'Sicilian', source: { kind: 'qchess', name: 'Sicilian' } }));
  assert.deepEqual(result.studies.map((s) => [s.meta.name, s.meta.kind, s.chapters.map((c) => header(c, 'ChapterName'))]), [
    ['Sicilian', 'repertoire', ['Main']],
    ['Sicilian (reference)', 'reference', ['Model game']],
  ]);
  assert.equal(header(result.studies[1]!.chapters[0]!, 'StudyName'), 'Sicilian (reference)');
  assert.notEqual(result.studies[0]!.meta.id, result.studies[1]!.meta.id);
  assertValid(result.files);
  const asReference = built(reading, choices({ name: 'Sicilian', kind: 'reference' }));
  assert.deepEqual(asReference.studies.map((s) => [s.meta.name, s.chapters.length]), [['Sicilian', 2]]);
});

test('a chapter that cannot be read is refused with its reason, and the rest import', () => {
  const reading = readImport('[Event "Good"]\n\n1. e4 *\n\n[Event "Bad"]\n[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n[SetUp "1"]\n\n*\n');
  assert.equal(reading.chapters.length, 1);
  assert.equal(reading.refused.length, 1);
  assert.equal(reading.refused[0]!.name, 'Bad');
  assert.match(reading.refused[0]!.reason, /start position is invalid/);
  const result = built(reading, choices({ sides: new Map([[0, 'white']]) }));
  // A chapter with no ChapterName gets one, from its Event.
  assert.equal(header(result.studies[0]!.chapters[0]!, 'ChapterName'), 'Good');
});

test('nothing to import, or no name, is refused', () => {
  assert.deepEqual(buildImport(readImport(''), choices(), ctx()), { ok: false, error: 'there is no chapter to import' });
  assert.deepEqual(buildImport(readImport(lichessExport()), choices({ name: '  ' }), ctx()), { ok: false, error: 'the study needs a name' });
});

test('chapter names: ChapterName, else Event, else the players, else the number', () => {
  assert.equal(chapterName([['Event', 'E'], ['ChapterName', 'C']], 0), 'C');
  assert.equal(chapterName([['Event', 'E']], 0), 'E');
  assert.equal(chapterName([['Event', '?'], ['White', 'Tal'], ['Black', 'Botvinnik']], 0), 'Tal - Botvinnik');
  assert.equal(chapterName([['Event', '?']], 4), 'Chapter 5');
});

test('the report: illegal moves with their path, canonical SAN, merged siblings, long comments, headers kept', () => {
  const long = 'x'.repeat(4100);
  const reading = readImport(`[Event "A"]\n[Site "?"]\n\n1. e4 e5 2. Ke3 *\n\n[Event "B"]\n\n1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Ndb5 (6. Nb5 { ${long} }) *\n`);
  const [a, b] = reading.chapters;
  assert.deepEqual(a!.notes.map((n) => describeNote(a!.chapter, n)), ['Ke3 after 1. e4 e5 is not a legal move: it was left out, with everything after it']);
  assert.deepEqual(b!.notes.map((n) => describeNote(b!.chapter, n)), [
    'Ndb5 is written Nb5 (1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Nb5)',
    'a comment of 4,100 characters at 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Nb5: Lichess would keep 4,000',
    'the same move twice at 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Nb5: merged into one',
  ]);
  assert.deepEqual(headerCounts(reading), [['Event', 2], ['Site', 1]]);
});

test('Lichess study IDs from URLs, slugs and bare IDs', () => {
  for (const input of ['AbCd1234', ' AbCd1234 ', 'https://lichess.org/study/AbCd1234', 'lichess.org/study/AbCd1234/WxYz5678', 'https://lichess.org/study/AbCd1234.pgn', 'https://lichess.org/study/AbCd1234?x=1', 'https://lichess.org/study/AbCd1234#c']) {
    assert.equal(extractStudyId(input), 'AbCd1234', input);
  }
  for (const input of ['', 'AbCd123', 'https://example.com/study/AbCd1234', 'https://lichess.org/AbCd1234']) assert.equal(extractStudyId(input), undefined, input);
  assert.equal(studyExportPath('AbCd1234'), '/api/study/AbCd1234.pgn?clocks=false&orientation=true');
});

test('the study list is read line by line, skipping what it cannot read', () => {
  const list = parseStudyList('{"id":"AbCd1234","name":"Rep","updatedAt":5}\n\nnot json\n{"id":"WxYz5678","name":"Other"}\n{"name":"no id"}\n');
  assert.deepEqual(list, [{ id: 'AbCd1234', name: 'Rep', updatedAt: 5 }, { id: 'WxYz5678', name: 'Other' }]);
});
