#!/usr/bin/env node
// The queue simulation (PLAN.md §5.5) on a data-repo checkout: how many weeks the repertoire
// takes to come in, and what that costs a day, for several daily limits and both retentions.
// Usage: node scripts/queue-sim.ts [<checkout>] [--days 90] [--known asis|all|none]
//   <checkout> defaults to $REPWORKS_FIXTURES. --known all simulates every chapter as marked
//   known, --known none as none marked; asis (the default) reads the chapters' own marks.
// It prints aggregate numbers only: nothing of the repertoire itself.
import { indexStudies, KNOWN_HEADER } from '../src/core/repertoire/index.ts';
import { studiesFromFiles } from '../src/core/repertoire/files.ts';
import { readTree } from './read-tree.ts';
import { simulate, type SimResult, type SimSetting } from './simulate-queue.ts';

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return undefined;
  const value = args[at + 1];
  args.splice(at, 2);
  return value;
};
const days = Number(option('days') ?? 90);
const knownMode = option('known') ?? 'asis';
const dir = args[0] ?? process.env['REPWORKS_FIXTURES'];
if (!dir || !Number.isInteger(days) || days < 1 || !['asis', 'all', 'none'].includes(knownMode)) {
  console.error('usage: node scripts/queue-sim.ts [<data-repo checkout>] [--days 90] [--known asis|all|none]  (or set REPWORKS_FIXTURES)');
  process.exit(2);
}

const { studies, unreadable } = studiesFromFiles(readTree(dir));
for (const s of studies) {
  for (const c of s.chapters) {
    c.headers = c.headers.filter(([k]) => knownMode === 'asis' || k !== KNOWN_HEADER);
    if (knownMode === 'all') c.headers.push([KNOWN_HEADER, 'true']);
  }
}
const index = indexStudies(studies);
const repertoire = studies.filter((s) => s.kind === 'repertoire');
console.log(
  `${repertoire.length} repertoire studies, ${repertoire.reduce((n, s) => n + s.chapters.length, 0)} chapters; ${index.lines.length} lines, ${index.cards.size} cards` +
    `${unreadable.length ? `; ${unreadable.length} unreadable file(s)` : ''}${index.skipped.length ? `; ${index.skipped.length} chapter(s) without cards` : ''}`,
);

const settings: SimSetting[] = [];
for (const retention of [0.9, 0.93]) for (const newPerDay of [10, 20, 30, 40]) settings.push({ newPerDay, retention, knownRate: 0.85, knownPace: 300 });
const anyKnown = index.lines.some((l) => l.known);
// The known pool all taken in a week: its cards (each once) over seven days.
const week = Math.ceil(new Set(index.lines.filter((l) => l.known).flatMap((l) => l.cards)).size / 7);
if (anyKnown) {
  for (const knownPace of [100, 300, week]) for (const knownRate of [0.7, 0.9]) settings.push({ newPerDay: 20, retention: 0.9, knownRate, knownPace });
}

const at = (r: SimResult, day: number) => r.days[day - 1];
const cell = (r: SimResult, day: number) => {
  const d = at(r, day);
  return d ? `${d.asked} (${Math.round(d.minutes)} min)` : '-';
};
const header = ['New/day', 'Retention', 'Known: pace, first right', `All new in by day`, 'All known in by day', ...[30, 60, 90].filter((d) => d <= days).map((d) => `Asked day ${d} (time)`), 'Peak asked (day)', 'Peak minutes'];
console.log(`\n| ${header.join(' | ')} |\n|${header.map(() => ' --- ').join('|')}|`);
for (const setting of settings) {
  const r = simulate(index, setting, { days });
  if (r.introducedTwice || r.early) console.error(`inconsistent: ${r.introducedTwice} introduced twice, ${r.early} early`);
  const peak = r.days.reduce((a, b) => (b.asked > a.asked ? b : a));
  const peakMinutes = Math.max(...r.days.map((d) => d.minutes));
  const row = [
    setting.newPerDay,
    setting.retention,
    anyKnown ? `${setting.knownPace === week ? `a week (${week}/day)` : `${setting.knownPace}/day`}, ${setting.knownRate} right` : 'none marked',
    r.newLeft === 0 ? (r.allNewInDay ?? '-') : `not by ${days} (${r.newLeft} left)`,
    r.knownLeft === 0 ? (r.allKnownInDay ?? '-') : `not by ${days} (${r.knownLeft} left)`,
    ...[30, 60, 90].filter((d) => d <= days).map((d) => cell(r, d)),
    `${peak.asked} (day ${peak.day})`,
    Math.round(peakMinutes),
  ];
  console.log(`| ${row.join(' | ')} |`);
}
console.log(`\nAssumed: 8 s an asked move, 20 s a new move, 600 ms an auto-played move; 90% right after the learning step.`);
