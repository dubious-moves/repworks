import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvent, parseLog, writeLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { parseCard, repertoireCard } from '../../../../src/core/progress/cards.ts';
import type { PositionKey } from '../../../../src/core/chess/positionKey.ts';

const key = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -' as PositionKey;

test('known events format and parse back; unknown kinds are kept verbatim and not interpreted', () => {
  const events: KnownEvent[] = [
    { v: 1, n: 1, t: '2026-10-05T14:03:12.345Z', k: 'review', card: repertoireCard(key, 'c7c5'), g: 3, ms: 4210 },
    { v: 1, n: 2, t: '2026-10-05T14:03:13.000Z', k: 'suspend', card: repertoireCard(key, 'e7e5') },
    { v: 1, n: 3, t: '2026-10-05T14:03:14.000Z', k: 'unsuspend', card: repertoireCard(key, 'e7e5') },
    { v: 1, n: 4, t: '2026-10-05T14:03:15.000Z', k: 'forget', card: repertoireCard(key, 'c7c5') },
  ];
  const future = '{"v":1,"n":5,"t":"2026-10-05T14:04:00.000Z","k":"future","weird": [1, 2]}';
  const newer = '{"v":2,"n":6,"t":"2026-10-05T14:05:00.000Z","k":"review","card":"r|x|e2e4","g":3,"extra":true}';
  const text = writeLog([...events.map((e) => ({ raw: formatEvent(e) })), { raw: future }, { raw: newer }]);
  assert.equal(
    text.split('\n')[0],
    '{"v":1,"n":1,"t":"2026-10-05T14:03:12.345Z","k":"review","card":"r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5","g":3,"ms":4210}',
  );
  const { lines, problems } = parseLog(text);
  assert.deepEqual(problems, []);
  assert.deepEqual(lines.slice(0, 4).map((l) => l.event), events);
  // A kind or a version this code doesn't know: kept, byte for byte, but not interpreted.
  assert.equal(lines[4]!.event, undefined);
  assert.equal(lines[4]!.raw, future);
  assert.equal(lines[5]!.event, undefined);
  assert.equal(writeLog(lines), text);
});

test('bad lines are reported with their line numbers and skipped', () => {
  const text = ['{"v":1,"n":1,"t":"2026-10-05T14:00:00.000Z","k":"review","card":"r|x|e2e4","g":2}', '', 'oops', '{"v":1,"n":0,"t":"2026-10-05T14:00:00Z","k":"review"}', '{"v":1,"n":3,"t":"yesterday","k":"review"}', '[1,2]', '{"v":1,"n":4,"t":"2026-10-05T14:00:00Z","k":"suspend"}'].join('\n');
  const { lines, problems } = parseLog(text);
  assert.equal(lines.length, 1);
  assert.deepEqual(problems.map((p) => [p.line, p.reason]), [
    [3, 'not JSON'],
    [4, 'n must be a positive integer'],
    [5, 't must be a UTC time like 2026-10-05T14:03:12.345Z'],
    [6, 'not a JSON object'],
    [7, 'card must be a card ID'],
  ]);
});

test('card IDs', () => {
  const id = repertoireCard(key, 'e1g1');
  assert.deepEqual(parseCard(id), { kind: 'repertoire', key, uci: 'e1g1' });
  assert.deepEqual(parseCard('p|somekey'), { kind: 'other', letter: 'p' });
  assert.equal(parseCard('r|key|castle'), undefined);
  assert.equal(parseCard('nonsense'), undefined);
});
