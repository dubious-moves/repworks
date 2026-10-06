// Routes in the hash (PLAN.md §4.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHash, type Route } from '../../../../src/core/app/route.ts';

test('hashes parse to routes, and routes write back to the same hash', () => {
  for (const [hash, route] of [
    ['', { name: 'home' }],
    ['#', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/import', { name: 'import' }],
    ['#import/', { name: 'import' }],
    ['#/unknown', { name: 'home' }],
  ] as [string, Route][]) {
    assert.deepEqual(parseRoute(hash), route, hash);
    assert.deepEqual(parseRoute(routeHash(route)), route);
  }
});
