// The page's title (PLAN.md §5.164): the screen in its head's words, then the app; the home is the
// app alone; a name not read yet is left out rather than shown as an id.
//
// Controls run on this file (2026-11-11), each failing exactly the named test:
// - the chapter after the study in a study's title → "a study's title leads with its chapter";
// - an id shown where a name isn't known → "names not known yet are left out";
// - the home given a screen name → "the home is the app alone".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash } from '../../../../src/core/app/fsm.ts';
import { pageTitle, screenTitle, type TitleNames } from '../../../../src/core/app/title.ts';

const names: TitleNames = {
  study: (sid) => (sid === 'Rep0Najd' ? 'Najdorf' : undefined),
  chapter: (sid, cid) => (sid === 'Rep0Najd' && cid === 'Ch1Najdf' ? '6. Bg5' : undefined),
  endgame: (id) => (id === 'lucena' ? 'Lucena: build a bridge' : undefined),
};
const none: TitleNames = { study: () => undefined, chapter: () => undefined, endgame: () => undefined };
const at = (hash: string, n = names) => pageTitle(parseHash(hash), n);

test('the home is the app alone', () => {
  assert.equal(at('#/'), 'Repworks');
  assert.equal(at(''), 'Repworks');
  // An address the app can't read is the home.
  assert.equal(at('#/nowhere/at/all'), 'Repworks');
  assert.equal(screenTitle({ name: 'list' }, names), '');
});

test('a study’s title leads with its chapter', () => {
  assert.equal(at('#/study/Rep0Najd/Ch1Najdf'), '6. Bg5 · Najdorf · Repworks');
  assert.equal(at('#/study/Rep0Najd/Ch1Najdf?at=e4,c5'), '6. Bg5 · Najdorf · Repworks');
  // Before its first chapter is chosen: the study.
  assert.equal(at('#/study/Rep0Najd'), 'Najdorf · Repworks');
});

test('every screen is named in its head’s words', () => {
  const titles: [string, string][] = [
    ['#/import', 'Import'],
    ['#/conflicts', 'Conflicts'],
    ['#/analysis', 'Analysis board'],
    ['#/train', 'Training'],
    ['#/train/Rep0Najd', 'Training · Najdorf'],
    ['#/train/Rep0Najd/Ch1Najdf?at=e4,c5', 'Line · 6. Bg5'],
    ['#/learn/Rep0Najd/Ch1Najdf', 'Learn · 6. Bg5'],
    ['#/show', 'Show and grade'],
    ['#/show/Rep0Najd', 'Show and grade · Najdorf'],
    ['#/difficult', 'Difficult lines'],
    ['#/ideas', 'Ideas'],
    ['#/ideas/Rep0Najd', 'Ideas · Najdorf'],
    ['#/mistakes', 'Mistakes'],
    ['#/mistakes/retry', 'Retry mistakes'],
    ['#/mistakes/drill', 'Drill mistakes'],
    ['#/pinned', 'Drill pinned'],
    ['#/pinned/all', 'Drill all pins'],
    ['#/read/Rep0Najd/Ch1Najdf', 'Read · 6. Bg5'],
    ['#/play/Rep0Najd/Ch1Najdf', 'Play · 6. Bg5'],
    ['#/coverage/Rep0Najd', 'Coverage · Najdorf'],
    ['#/storm', 'Storm'],
    ['#/storm/Rep0Najd', 'Storm · Najdorf'],
    ['#/storm/Rep0Najd/Ch1Najdf', 'Storm · 6. Bg5 · Najdorf'],
    ['#/games', 'Games'],
    ['#/games/abcdefgh', 'Game'],
    ['#/games/review', 'Game cards'],
    ['#/games/history/abcdefgh', 'Practice game'],
    ['#/practice?fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2FK6k%20w%20-%20-%200%201', 'Practice'],
    ['#/migrate', 'Move from mistake-lab'],
    ['#/repertoire-check', 'Repertoire check'],
    ['#/progress', 'Progress'],
    ['#/checklist', 'Variation checklist'],
    ['#/checklist/Rep0Najd?side=black&line=e2e4,c7c5', 'Checklist · Najdorf'],
    ['#/endgames', 'Endgames'],
    ['#/endgames/lucena', 'Endgame · Lucena: build a bridge'],
    ['#/search', 'Search'],
    ['#/search?q=najdorf', 'Search'],
  ];
  for (const [hash, title] of titles) assert.equal(at(hash), `${title} · Repworks`, hash);
});

test('names not known yet are left out', () => {
  assert.equal(at('#/study/Rep0Najd/Ch1Najdf', none), 'Study · Repworks');
  assert.equal(at('#/train/Rep0Najd', none), 'Training · Repworks');
  assert.equal(at('#/learn/Rep0Najd/Ch1Najdf', none), 'Learn · Repworks');
  assert.equal(at('#/storm/Rep0Najd/Ch1Najdf', none), 'Storm · Repworks');
  assert.equal(at('#/endgames/lucena', none), 'Endgame · Repworks');
  // The study known, the chapter not: the study alone, with no id beside it.
  assert.equal(at('#/study/Rep0Najd/ChOther0'), 'Najdorf · Repworks');
});
