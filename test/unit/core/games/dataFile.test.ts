// The analyzer's games in the data repo (PLAN.md §5.163): a game as a line and back, the same game
// to the site whichever way it came, and the converter's month files (written only when changed,
// nothing lost, a file it can't read left alone).
//
// Controls run on this file (2026-11-10), each failing exactly the named assertions:
// - mates written as plain numbers → "every fixture game", "the month files";
// - `planGamesFiles` writing every month whatever its text → "the month files";
// - `planGamesFiles` keeping only the incoming games of a month → "the month files".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gamesPath } from '../../../../src/core/data/layout.ts';
import { validateDataRepo } from '../../../../src/core/data/validate.ts';
import { gameLine, gameMonth, gamesFileText, parseGameLine, parseGamesFile, planGamesFiles } from '../../../../src/core/games/dataFile.ts';
import { extractGame } from '../../../../src/core/games/extract.ts';
import { readGamesFile, type GameRecord } from '../../../../src/core/games/record.ts';

const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/games/analyzed_games.json', import.meta.url), 'utf8')) as unknown;
const { games } = readGamesFile(fixture);

test('every fixture game as a line and back: the same record, the same items; mates, start positions and tactics kept; under half the analyzer’s bytes', () => {
  assert.equal(games.length, 24);
  for (const g of games) {
    const back = parseGameLine(gameLine(g));
    assert.deepEqual(back, g, g.id);
    assert.deepEqual(extractGame(back!), extractGame(g), g.id);
  }
  assert.ok(games.some((g) => g.evals?.some((e) => e && 'mate' in e)));
  assert.ok(games.some((g) => g.tactics?.length));
  const fromFen: GameRecord = { ...games[0]!, id: 'fen1', initialFen: '8/8/8/8/8/8/4K3/k7 w - - 0 1', moves: ['Kd3'], evals: [{ mate: -3 }, null] };
  assert.deepEqual(parseGameLine(gameLine(fromFen)), fromFen);
  assert.ok(gameLine(fromFen).includes('"#-3"'));
  const bytes = games.reduce((n, g) => n + gameLine(g).length, 0);
  assert.ok(bytes < JSON.stringify((fixture as { games: unknown[] }).games).length / 2, `${bytes} bytes`);
});

test('a line this version can’t read is counted, not guessed', () => {
  const line = gameLine(games[0]!);
  const { games: read, unread } = parseGamesFile([line, '', 'not json', line.replace('"v":1', '"v":2'), line.replace(/"evals":\[/, '"evals":["x",'), line.replace('"platform":"lichess"', '"platform":"fics"')].join('\n'));
  assert.equal(read.length, 1);
  assert.equal(unread, 4);
});

test('the month files: one a UTC month, oldest first; written only when their games change; games kept, one replaced by its new record; a file with an unreadable line left alone', () => {
  const first = planGamesFiles(new Map(), games, gamesPath);
  const months = [...new Set(games.map((g) => gameMonth(g.createdAt)))].sort();
  assert.deepEqual([...first.write.keys()], months.map(gamesPath));
  assert.deepEqual([first.added, first.changed, first.unreadable], [games.length, 0, []]);
  for (const [path, text] of first.write) {
    const read = parseGamesFile(text).games;
    assert.ok(read.every((g) => gamesPath(gameMonth(g.createdAt)) === path));
    assert.deepEqual(read.map((g) => g.createdAt), [...read.map((g) => g.createdAt)].sort((a, b) => a - b));
  }
  // The same games again: nothing to write.
  const files = new Map(first.write);
  const again = planGamesFiles(files, games, gamesPath);
  assert.deepEqual([again.write.size, again.added, again.changed], [0, 0, 0]);
  // A later analyzer file holding one game, re-analysed: its month alone, the others in it kept.
  const g = games[0]!;
  const reanalysed: GameRecord = { ...g, evals: (g.evals ?? []).map((e) => (e && 'cp' in e ? { cp: e.cp + 1 } : e)) };
  const one = planGamesFiles(files, [reanalysed], gamesPath);
  const path = gamesPath(gameMonth(g.createdAt));
  assert.deepEqual([[...one.write.keys()], one.added, one.changed], [[path], 0, 1]);
  const month = parseGamesFile(one.write.get(path)!).games;
  assert.equal(month.length, parseGamesFile(files.get(path)!).games.length);
  assert.deepEqual(month.find((x) => x.id === g.id), reanalysed);
  // A line it can't read: that month is never rewritten.
  const odd = new Map(files);
  odd.set(path, files.get(path)! + '{"v":2}\n');
  const left = planGamesFiles(odd, [reanalysed], gamesPath);
  assert.deepEqual([left.write.size, left.unreadable], [0, [path]]);
  // The data repo's validator reads them as games.
  const repo = new Map([['repworks.json', '{ "format": 1 }\n'], ...files]);
  const report = validateDataRepo(repo);
  assert.deepEqual([report.errors, report.warnings], [[], []]);
  assert.equal(gamesFileText([...games].reverse().filter((x) => gamesPath(gameMonth(x.createdAt)) === path)), files.get(path));
});
