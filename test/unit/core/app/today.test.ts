// The home's Today card (PLAN.md §5.158): the rows in Next's order, empty kinds left out, and the
// checklist's next line.
//
// Controls run on this file (2026-11-10), each failing exactly the named assertions:
// - a kind with 0 due and some new left out → "new cards count as work";
// - the endgames' Next at the list, not the first due → "Next goes to the first item itself";
// - a gone line taken as the next → "the checklist's next line".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextChecklistLine, todayRows } from '../../../../src/core/app/today.ts';

test('the rows in order, the empty ones left out', () => {
  const rows = todayRows({
    repertoire: { due: 3, fresh: 5 },
    ideas: { due: 0, fresh: 0 },
    games: { due: 2, fresh: 0 },
    endgames: { due: 0 },
    storm: { ready: 40 },
  });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.detail, r.href]),
    [
      ['repertoire', '3 due · 5 new', '#/train'],
      ['games', '2 due', '#/games/review'],
      ['storm', '40 ready', '#/storm'],
    ],
  );
  assert.deepEqual(todayRows({}), []);
  assert.deepEqual(todayRows({ storm: { ready: 0 }, endgames: { due: 0 } }), []);
});

test('new cards count as work', () => {
  assert.deepEqual(
    todayRows({ ideas: { due: 0, fresh: 4 } }).map((r) => [r.kind, r.detail]),
    [['ideas', '0 due · 4 new']],
  );
});

test('Next goes to the first item itself', () => {
  const rows = todayRows({ endgames: { due: 2, first: '#/endgames/kpk' }, checklist: { name: 'Scandi · Easy', href: '#/checklist/s1?side=white' } });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.href, r.next]),
    [
      ['endgames', '#/endgames', '#/endgames/kpk'],
      ['checklist', '#/checklist', '#/checklist/s1?side=white'],
    ],
  );
});

test("the checklist's next line", () => {
  const order = ['easy', 'medium', 'hard'] as const;
  type P = (typeof order)[number];
  const a = { id: 'a', gone: true };
  const b = { id: 'b', gone: false };
  const c = { id: 'c', gone: false };
  const d = { id: 'd', gone: false };
  const done: Record<string, P[]> = { a: [], b: ['easy', 'medium', 'hard'], c: ['easy'], d: [] };
  const views = [{ lines: [a, b] }, { lines: [c, d] }];
  const got = nextChecklistLine<{ id: string; gone: boolean }, P>(views, (_, l) => new Set(done[l.id]), order);
  assert.deepEqual(got && { view: got.view, id: got.line.id, preset: got.preset }, { view: 1, id: 'c', preset: 'medium' });
  assert.equal(nextChecklistLine<{ id: string; gone: boolean }, P>([{ lines: [a, b] }], (_, l) => new Set(done[l.id]), order), undefined);
});
