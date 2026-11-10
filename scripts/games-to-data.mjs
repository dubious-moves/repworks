#!/usr/bin/env node
// The analyzer's games into the data repo (PLAN.md §5.66, §5.163): mistake-lab's analyzer writes
// `analyzed_games.json` (its `version: 2` object: `usernames`, `games[]`); this turns it into
// `games/<YYYY-MM>.jsonl` in a checkout of the data repo, one compact game a line
// (src/core/games/dataFile.ts), and every device reads them through its ordinary sync. A month's
// file is rewritten only when its games changed; games already in the repo are kept (a game the
// analyzer writes again replaces its line), so an analyzer file holding fewer months loses nothing.
// A month file with a line this version can't read is left alone.
//
// Usage: node scripts/games-to-data.mjs <analyzed_games.json> <data-repo checkout> [options]
//   --name N      a username of the user's besides the file's own `usernames` (repeatable): the
//                 user's side in each game, as mistake-lab's rule reads it
//   --dry-run     say what would change, write nothing
//   --commit      commit the changed files (git add games/, git commit)
//   --push        and push them (the checkout on its branch, with a remote it can push to)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gamesPath } from '../src/core/data/layout.ts';
import { planGamesFiles } from '../src/core/games/dataFile.ts';
import { readGamesFile } from '../src/core/games/record.ts';

function options(argv) {
  const o = { input: '', dir: '', names: [], dryRun: false, commit: false, push: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') o.names.push(argv[++i] ?? '');
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--commit') o.commit = true;
    else if (a === '--push') o.commit = o.push = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  [o.input = '', o.dir = ''] = rest;
  if (!o.input || !o.dir) throw new Error('usage: node scripts/games-to-data.mjs <analyzed_games.json> <data-repo checkout> [--name N] [--dry-run] [--commit] [--push]');
  if (o.names.some((n) => !n)) throw new Error('--name needs a name');
  if (o.dryRun && o.commit) throw new Error('--dry-run writes nothing: --commit and --push don’t apply');
  return o;
}

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

/** The checkout's `games/` files, path → text. */
function gamesFiles(dir) {
  const out = new Map();
  const root = join(dir, 'games');
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) if (name.endsWith('.jsonl')) out.set(`games/${name}`, readFileSync(join(root, name), 'utf8'));
  return out;
}

function main() {
  const o = options(process.argv.slice(2));
  if (!existsSync(join(o.dir, 'repworks.json'))) throw new Error(`${o.dir} isn’t a data repo checkout (no repworks.json)`);
  const file = JSON.parse(readFileSync(o.input, 'utf8'));
  const { games, problems } = readGamesFile(file, o.names);
  const undated = games.filter((g) => !g.createdAt).length;
  const plan = planGamesFiles(gamesFiles(o.dir), games.filter((g) => g.createdAt > 0), gamesPath);
  console.log(`${games.length} games read from ${o.input}${problems.length ? `, ${problems.length} unreadable (${problems.slice(0, 3).join('; ')}${problems.length > 3 ? '; …' : ''})` : ''}${undated ? `, ${undated} with no date left out` : ''}`);
  for (const path of plan.unreadable) console.log(`${path}: a line this version can’t read, so the file is left as it is`);
  if (!plan.write.size) {
    console.log('nothing changed');
    return;
  }
  console.log(`${plan.write.size} month file(s) to write: ${plan.added} new game(s), ${plan.changed} changed (${[...plan.write.keys()].join(', ')})`);
  if (o.dryRun) return;
  for (const [path, text] of plan.write) {
    mkdirSync(dirname(join(o.dir, path)), { recursive: true });
    writeFileSync(join(o.dir, path), text);
  }
  if (!o.commit) return;
  git(o.dir, ['add', '--', ...plan.write.keys()]);
  git(o.dir, ['commit', '-q', '-m', `analyzer: ${plan.added} new game(s), ${plan.changed} changed`, '--', ...plan.write.keys()]);
  console.log('committed');
  if (o.push) {
    git(o.dir, ['push', '-q']);
    console.log('pushed');
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
