// A link followed into the installed app while it is open (PLAN.md §5.215): the hash to go to for
// the launch's link, and the launches that are none of the app's business.
//
// Controls run on this file (2026-11-27): the page compared without its origin → "a link
// elsewhere"; the hash shown not compared → "the page already open".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchHash } from '../../../../src/core/app/launch.ts';

const here = { origin: 'https://dubious-moves.github.io', pathname: '/repworks/', hash: '#/study/Rep0Najd/Ch1Najdf' };
const SITE = 'https://dubious-moves.github.io/repworks/';

test('a link to a move of a chapter: its hash, as written (a check mark encoded)', () => {
  assert.equal(launchHash(`${SITE}#/study/Rep0Najd/Ch2Alapn?at=e4,c5,c3,Nf6`, here), '#/study/Rep0Najd/Ch2Alapn?at=e4,c5,c3,Nf6');
  assert.equal(launchHash(`${SITE}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Qh5,Nc6,Qxf7%2B`, here), '#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Qh5,Nc6,Qxf7%2B');
  // A query before the hash (a share's leftover) is not part of the page.
  assert.equal(launchHash(`${SITE}?source=pwa#/train`, here), '#/train');
});

test('the app\'s own start: home, unless home is shown', () => {
  assert.equal(launchHash(SITE, here), '#/');
  assert.equal(launchHash(`${SITE}#`, here), '#/');
  assert.equal(launchHash(SITE, { ...here, hash: '' }), undefined);
  assert.equal(launchHash(SITE, { ...here, hash: '#/' }), undefined);
});

test('the page already open, a launch with no link, a link elsewhere: nothing', () => {
  assert.equal(launchHash(`${SITE}#/study/Rep0Najd/Ch1Najdf`, here), undefined);
  assert.equal(launchHash(undefined, here), undefined);
  assert.equal(launchHash('', here), undefined);
  assert.equal(launchHash('https://example.org/repworks/#/train', here), undefined);
  assert.equal(launchHash('https://dubious-moves.github.io/other/#/train', here), undefined);
});
