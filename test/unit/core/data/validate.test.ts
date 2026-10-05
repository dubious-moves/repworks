// validate-data (PLAN.md §4.4): it accepts the fixture data repo, and rejects a chapter missing
// from disk, a malformed study.json and an unknown format; a bad progress line is a warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readTree } from '../../../../scripts/read-tree.ts';
import { validateDataRepo } from '../../../../src/core/data/validate.ts';

const FIXTURE = join(import.meta.dirname, '../../../fixtures/data-repo');
const fixture = () => readTree(FIXTURE);
const messages = (issues: { path: string; message: string; line?: number }[]) => issues.map((i) => `${i.path}${i.line ? `:${i.line}` : ''}: ${i.message}`);

test('the fixture data repo passes with no errors or warnings', () => {
  const report = validateDataRepo(fixture());
  assert.deepEqual(report, { errors: [], warnings: [] });
});

test('a chapter listed in study.json but missing from disk is an error', () => {
  const files = fixture();
  files.delete('studies/Rep0Najd/Ch2Alapn.pgn');
  assert.deepEqual(messages(validateDataRepo(files).errors), ['studies/Rep0Najd/study.json: lists chapter Ch2Alapn, which has no file']);
});

test('a malformed study.json is an error, with every reason', () => {
  const files = fixture();
  files.set('studies/Rep0Najd/study.json', '{ "format": 1, "id": "Wrong123", "name": "", "kind": "course", "chapters": ["Ch1Najdf", "Ch1Najdf"] }');
  assert.deepEqual(messages(validateDataRepo(files).errors), [
    'studies/Rep0Najd/study.json: id Wrong123 doesn\'t match its folder Rep0Najd',
    'studies/Rep0Najd/study.json: name must be a non-empty string',
    'studies/Rep0Najd/study.json: kind must be "repertoire" or "reference", found "course"',
    'studies/Rep0Najd/study.json: chapters lists an ID twice',
  ]);
  files.set('studies/Rep0Najd/study.json', '{ "format": 1, ');
  assert.match(messages(validateDataRepo(files).errors)[0]!, /study\.json: not JSON/);
});

test('a progress line that will not parse is a warning, and the rest of the file still counts', () => {
  const files = fixture();
  const path = 'progress/Desktop1/2026-10-05.jsonl';
  files.set(path, `${files.get(path)}{"v":1,"n":4,"t":"2026-10-05T15:00:00Z","k":"review","card":"r|x|e2e4","g":9}\nnot json at all\n`);
  const report = validateDataRepo(files);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(messages(report.warnings), [
    `${path}:4: g must be a grade from 1 to 4: {"v":1,"n":4,"t":"2026-10-05T15:00:00Z","k":"review","card":"r|x|e2e4","g":9}`,
    `${path}:5: not JSON: not json at all`,
  ]);
});

test('other problems: unknown format, unlisted chapter, missing device, a clashing n, stray files', () => {
  const files = fixture();
  files.set('repworks.json', '{ "format": 2 }');
  files.set('studies/Rep0Najd/Ch3Extra.pgn', '[Event "x"]\n[Result "*"]\n\n1. d4 *\n');
  files.delete('devices/Phone001.json');
  files.set('progress/Desktop1/2026-10-06.jsonl', '{"v":1,"n":2,"t":"2026-10-06T08:00:00.000Z","k":"forget","card":"r|x|e2e4"}\n');
  files.set('notes.txt', 'hello');
  files.set('studies/Rep0Najd/Ch1Najdf.conflict-Phone001.pgn', '[Event "x"]\n\n1. e4 *\n');
  const report = validateDataRepo(files);
  assert.deepEqual(messages(report.errors), ['repworks.json: format 2: this code reads format 1']);
  assert.deepEqual(messages(report.warnings), [
    'notes.txt: not part of format 1: the app ignores it',
    "studies/Rep0Najd/Ch1Najdf.conflict-Phone001.pgn: a copy of chapter Ch1Najdf kept from device Phone001 when it couldn't be merged: resolve it, then delete it",
    "studies/Rep0Najd/Ch3Extra.pgn: not in study.json's chapter list: it is shown after the listed ones",
    'progress/Desktop1/2026-10-06.jsonl: n 2 also appears, different, in progress/Desktop1/2026-10-05.jsonl',
    'devices/Phone001.json: missing for a device that has progress files',
  ]);
});

test('scripts/validate-data.ts prints the issues and fails on errors', () => {
  const script = join(import.meta.dirname, '../../../../scripts/validate-data.ts');
  const ok = spawnSync(process.execPath, [script, FIXTURE], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /9 files, 0 error\(s\), 0 warning\(s\)/);
});

test('chapter files: unreadable or illegal is an error; what the app would rewrite is a warning', () => {
  const files = fixture();
  const ch = 'studies/Rep0Najd/Ch2Alapn.pgn';
  files.set(ch, '[Event "x"]\n[Variant "Atomic"]\n\n1. e4 *\n');
  assert.deepEqual(messages(validateDataRepo(files).errors), [`${ch}: the app can't read it, so it will never rewrite it: only standard chess is supported, not Atomic`]);
  files.set(ch, '[Event "x"]\n[Result "*"]\n\n1. e4 c5 2. Ke3 *\n');
  assert.deepEqual(messages(validateDataRepo(files).errors), [`${ch}: illegal move Ke3 after e4 c5: the app would cut it and everything after it`]);
  // The c3 knight is pinned, so only the d4 knight can go to b5: "Ndb5" says more than it needs.
  files.set(ch, '[Event "x"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Ndb5 *\n');
  const report = validateDataRepo(files);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(messages(report.warnings), [
    `${ch}: Ndb5 is written Nb5 by the app (at e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Qh4 Nc3 Bb4 Nb5)`,
    `${ch}: not in the app's own layout: its next edit rewrites the whole file`,
  ]);
});
