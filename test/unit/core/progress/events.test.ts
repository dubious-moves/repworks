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

test('a note (§5.91): on a game card, its text kept as written; anything else refused', () => {
  const note: KnownEvent = { v: 1, n: 1, t: '2026-10-11T10:00:00.000Z', k: 'note', card: 'm|g1_12', text: 'Bxf7+? (12. Bxf7+ Kxf7) [%cal Rc4f7]' };
  const line = formatEvent(note);
  assert.equal(line, '{"v":1,"n":1,"t":"2026-10-11T10:00:00.000Z","k":"note","card":"m|g1_12","text":"Bxf7+? (12. Bxf7+ Kxf7) [%cal Rc4f7]"}');
  const bad = ['{"v":1,"n":2,"t":"2026-10-11T10:00:00.000Z","k":"note","card":"r|x|e2e4","text":"x"}', '{"v":1,"n":3,"t":"2026-10-11T10:00:00.000Z","k":"note","card":"m|g1_12"}'];
  const { lines, problems } = parseLog([line, ...bad].join('\n'));
  assert.deepEqual(lines.map((l) => l.event), [note]);
  assert.deepEqual(problems.map((p) => p.reason), ['card must be a game card (m|…)', 'text must be a string']);
});

test('a line added to a checklist (§5.142): on a study, a side, its moves and on; anything else refused', () => {
  const pick: KnownEvent = { v: 1, n: 1, t: '2026-10-31T10:00:00.000Z', k: 'pick', card: 't|Rep0Najd', color: 'black', m: 'e2e4 c7c5 c2c3', on: true };
  const line = formatEvent(pick);
  assert.equal(line, '{"v":1,"n":1,"t":"2026-10-31T10:00:00.000Z","k":"pick","card":"t|Rep0Najd","color":"black","m":"e2e4 c7c5 c2c3","on":true}');
  const at = (n: number, rest: string) => `{"v":1,"n":${n},"t":"2026-10-31T10:00:00.000Z","k":"pick",${rest}}`;
  const bad = [
    at(2, `"card":"c|x","color":"white","m":"e2e4","on":true`),
    at(3, `"card":"t|Rep0Najd","color":"red","m":"e2e4","on":true`),
    at(4, `"card":"t|Rep0Najd","color":"white","m":"e4 e5","on":true`),
    at(5, `"card":"t|Rep0Najd","color":"white","m":"","on":true`),
    at(6, `"card":"t|Rep0Najd","color":"white","m":"e2e4","on":1`),
  ];
  const { lines, problems } = parseLog([line, ...bad].join('\n'));
  assert.deepEqual(lines.map((l) => l.event), [pick]);
  assert.deepEqual(problems.map((p) => p.reason), ['card must be a study (t|<sid>)', 'color must be white or black', 'm must be moves in UCI, spaced', 'm must be moves in UCI, spaced', 'on must be true or false']);
});

test('a checklist (§5.130): on a study, its lines, reserve and gaps as moves with shares; anything else refused', () => {
  const list: KnownEvent = {
    v: 1,
    n: 1,
    t: '2026-10-26T10:00:00.000Z',
    k: 'checklist',
    card: 't|Rep0Najd',
    color: 'black',
    ply: 10,
    count: 2,
    lines: [{ m: 'e2e4 c7c5 g1f3 d7d6', p: 0.7 }],
    reserve: [{ m: 'e2e4 c7c5 c2c3', p: 0.3 }],
    gaps: [{ m: 'd2d4', p: 0.4 }],
    calls: 4,
    cut: 1,
  };
  const line = formatEvent(list);
  assert.equal(line, '{"v":1,"n":1,"t":"2026-10-26T10:00:00.000Z","k":"checklist","card":"t|Rep0Najd","color":"black","ply":10,"count":2,"lines":[{"m":"e2e4 c7c5 g1f3 d7d6","p":0.7}],"reserve":[{"m":"e2e4 c7c5 c2c3","p":0.3}],"gaps":[{"m":"d2d4","p":0.4}],"calls":4,"cut":1}');
  const at = (n: number, rest: string) => `{"v":1,"n":${n},"t":"2026-10-26T10:00:00.000Z","k":"checklist",${rest}}`;
  const ok = '"lines":[],"reserve":[],"gaps":[]';
  const bad = [
    at(2, `"card":"r|x|e2e4","color":"white","ply":0,"count":1,${ok}`),
    at(3, `"card":"t|Rep0Najd","color":"red","ply":0,"count":1,${ok}`),
    at(4, `"card":"t|Rep0Najd","color":"white","ply":-1,"count":1,${ok}`),
    at(5, `"card":"t|Rep0Najd","color":"white","ply":0,"count":0,${ok}`),
    at(6, `"card":"t|Rep0Najd","color":"white","ply":0,"count":1,"lines":[{"m":"e4 e5","p":0.5}],"reserve":[],"gaps":[]`),
    at(7, `"card":"t|Rep0Najd","color":"white","ply":0,"count":1,"lines":[],"reserve":[{"m":"e2e4","p":2}],"gaps":[]`),
    at(8, `"card":"t|Rep0Najd","color":"white","ply":0,"count":1,"lines":[],"reserve":[]`),
  ];
  const { lines, problems } = parseLog([line, ...bad].join('\n'));
  assert.deepEqual(lines.map((l) => l.event), [list]);
  assert.deepEqual(problems.map((p) => p.reason), [
    'card must be a study (t|<sid>)',
    'color must be white or black',
    'ply must be a non-negative integer',
    'count must be a positive integer',
    'lines must be a list of lines ({m: moves in UCI, p: a share})',
    'reserve must be a list of lines ({m: moves in UCI, p: a share})',
    'gaps must be a list of lines ({m: moves in UCI, p: a share})',
  ]);
});
