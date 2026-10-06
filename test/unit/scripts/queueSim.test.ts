// The queue simulation (PLAN.md §5.5): on the public fixture through its command line, and on
// random repertoires through the library, checked for consistency: every card introduced once,
// no review before the queue offers it, the same result for the same input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { indexStudies } from '../../../src/core/repertoire/index.ts';
import { simulate } from '../../../scripts/simulate-queue.ts';
import { mulberry32 } from '../../support/random.ts';
import { randomChapter } from '../../support/randomTree.ts';

const ROOT = join(import.meta.dirname, '../../..');

test('the command line runs on the public fixture and prints its table', () => {
  for (const known of ['asis', 'all']) {
    const out = execFileSync(process.execPath, ['scripts/queue-sim.ts', 'test/fixtures/data-repo', '--days', '30', '--known', known], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(out, /^1 repertoire studies, 2 chapters; 3 lines, 5 cards$/m);
    // Eight rows of the matrix, and six more for the known pool when chapters are marked known.
    assert.equal(out.split('\n').filter((l) => /^\| \d/.test(l)).length, known === 'all' ? 14 : 8);
  }
});

test('random repertoires: every card introduced once, nothing early, deterministic', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const random = mulberry32(seed);
    const chapters = Array.from({ length: 6 }, (_, i) => {
      const c = randomChapter(random, `Rand000${i}`, { maxDepth: 14, maxChildren: 3 });
      if (i % 3 === 0) c.headers.push(['RepworksKnown', 'true']);
      return c;
    });
    const index = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]);
    const setting = { newPerDay: 15, retention: 0.9, knownRate: 0.8, knownPace: 20 };
    const r = simulate(index, setting, { days: 60, seed });
    assert.deepEqual([r.introducedTwice, r.early], [0, 0], `seed ${seed}`);
    // 60 days at 15 new and 20 known a day bring in a repertoire of this size whole.
    assert.deepEqual([r.newLeft, r.knownLeft], [0, 0], `seed ${seed}: ${r.cards} cards`);
    const taught = r.days.reduce((n, d) => n + d.taught, 0);
    const knownFirst = r.days.reduce((n, d) => n + d.knownFirst, 0);
    assert.equal(taught + knownFirst, r.cards, `seed ${seed}`);
    assert.deepEqual(simulate(index, setting, { days: 60, seed }), r);
  }
});
