// The converter (PLAN.md §5.163): `scripts/games-to-data.mjs` run on the fixture analyzer file into
// a scratch data repo checkout, as the owner runs it after the analyzer: the month files written,
// a second run writing nothing, a dry run writing nothing, and --commit committing the games only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGamesFile } from '../../../src/core/games/dataFile.ts';

const script = new URL('../../../scripts/games-to-data.mjs', import.meta.url).pathname;
const input = new URL('../../fixtures/games/analyzed_games.json', import.meta.url).pathname;
// A committer for a machine with none set up (CI).
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
const git = (dir: string, ...args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).stdout.trim();

test('the converter: month files into a data repo checkout, nothing on a second run or a dry run, committed with --commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repworks-games-'));
  try {
    writeFileSync(join(dir, 'repworks.json'), '{ "format": 1 }\n');
    git(dir, 'init', '-q');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'start');
    const dry = run(input, dir, '--dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /6 month file\(s\) to write: 24 new game\(s\), 0 changed/);
    assert.deepEqual(readdirSync(dir).sort(), ['.git', 'repworks.json']);
    const first = run(input, dir, '--commit');
    assert.equal(first.status, 0, first.stderr);
    const months = readdirSync(join(dir, 'games')).sort();
    assert.equal(months.length, 6);
    assert.equal(months.reduce((n, m) => n + parseGamesFile(readFileSync(join(dir, 'games', m), 'utf8')).games.length, 0), 24);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'analyzer: 24 new game(s), 0 changed');
    assert.deepEqual(git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), months.map((m) => `games/${m}`));
    const again = run(input, dir, '--commit');
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /nothing changed/);
    assert.equal(git(dir, 'rev-list', '--count', 'HEAD'), '2');
    // Not a data repo: refused.
    assert.notEqual(run(input, join(dir, 'games')).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
