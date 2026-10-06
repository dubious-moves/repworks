import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath } from '../../../../src/core/data/layout.ts';
import { validateDataRepo } from '../../../../src/core/data/validate.ts';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { foldCard, toDeviceEvents } from '../../../../src/core/progress/replay.ts';
import { grade, selfGrade } from '../../../../src/core/train/grade.ts';
import { DEFAULT_TRAIN, mergeSettings, parseSettings, trainSettings, withTrain, writeSettings } from '../../../../src/core/train/settings.ts';

const file = (train: Record<string, unknown>, rest: Record<string, unknown> = {}) => `${JSON.stringify({ format: 1, train, ...rest }, null, 2)}\n`;

test('grades: right first time is Good; a wrong move or a hint is Again; time never counts', () => {
  assert.equal(grade({ wrong: 0, hint: false }), 3);
  assert.equal(grade({ wrong: 1, hint: false }), 1);
  assert.equal(grade({ wrong: 0, hint: true }), 1);
  assert.equal(grade({ wrong: 2, hint: true }), 1);
  assert.deepEqual([selfGrade(true), selfGrade(false)], [3, 1]);
});

test('settings: defaults for a missing file or field; bad values are refused', () => {
  assert.deepEqual(trainSettings(undefined), DEFAULT_TRAIN);
  assert.deepEqual(trainSettings(file({ newPerDay: 30 })), { ...DEFAULT_TRAIN, newPerDay: 30 });
  for (const bad of [{ retention: 0.5 }, { retention: 1 }, { newPerDay: -1 }, { newPerDay: 2.5 }, { learnStepHours: 49 }, { newPerDay: '20' }]) {
    const parsed = parseSettings(file(bad));
    assert.equal(parsed.ok, false, JSON.stringify(bad));
  }
  assert.equal(parseSettings('{"format":2,"train":{}}').ok, false);
  assert.equal(parseSettings('not json').ok, false);
  // A bad file gives the defaults, never a crash.
  assert.deepEqual(trainSettings('{'), DEFAULT_TRAIN);
});

test('settings: fields this code doesn’t know survive a read and a write, in order', () => {
  const text = file({ futureField: 'x', newPerDay: 15 }, { later: { a: 1 } });
  const parsed = parseSettings(text);
  assert.ok(parsed.ok);
  assert.equal(writeSettings(parsed.value), text);
  assert.equal(writeSettings(withTrain(parsed.value, 'retention', 0.93)), file({ futureField: 'x', newPerDay: 15, retention: 0.93 }, { later: { a: 1 } }));
  assert.equal(writeSettings(withTrain(undefined, 'newPerDay', 25)), file({ newPerDay: 25 }));
});

test('settings merge per field: one side’s change is taken; a clash takes ours', () => {
  const base = file({ newPerDay: 20, retention: 0.9 });
  const ours = file({ newPerDay: 30, retention: 0.9 });
  const theirs = file({ newPerDay: 20, retention: 0.93, learnStepHours: 6 });
  assert.equal(mergeSettings(base, ours, theirs), file({ newPerDay: 30, retention: 0.93, learnStepHours: 6 }));
  const clash = file({ newPerDay: 10, retention: 0.9 });
  assert.equal(trainSettings(mergeSettings(base, ours, clash)).newPerDay, 30);
  // Both added the file: ours wins each clash.
  assert.equal(trainSettings(mergeSettings(undefined, ours, theirs)).newPerDay, 30);
  // A side that won't parse: no merge (the caller keeps theirs).
  assert.equal(mergeSettings(base, ours, '{'), undefined);
});

test('settings.json is classified and validated', () => {
  assert.deepEqual(classifyPath('settings.json'), { kind: 'settings' });
  const files = new Map([['repworks.json', '{ "format": 1 }\n'], ['settings.json', file({ retention: 2 })]]);
  const report = validateDataRepo(files);
  assert.ok(report.errors.some((e) => e.path === 'settings.json' && /retention/.test(e.message)), JSON.stringify(report.errors));
});

test('review events carry the wrong moves and the hint; taught events fold into the card', () => {
  const t = '2026-10-06T10:00:00.000Z';
  const events: KnownEvent[] = [
    { v: 1, n: 1, t, k: 'taught', card: 'r|k|g1f3' },
    { v: 1, n: 2, t: '2026-10-06T14:00:00.000Z', k: 'review', card: 'r|k|g1f3', g: 1, ms: 5210, w: ['b1c3'], h: 1 },
  ];
  const text = events.map(formatEvent).join('\n');
  assert.equal(text.split('\n')[1], '{"v":1,"n":2,"t":"2026-10-06T14:00:00.000Z","k":"review","card":"r|k|g1f3","g":1,"ms":5210,"w":["b1c3"],"h":1}');
  const { lines, problems } = parseLog(text);
  assert.deepEqual(problems, []);
  assert.deepEqual(lines.map((l) => l.event), events);
  const state = foldCard(toDeviceEvents('Phone001', lines));
  assert.equal(state.taught, Date.parse(t));
  assert.equal(state.reviews, 1);
  // Bad fields are reported, not taken.
  assert.equal(parseLog('{"v":1,"n":3,"t":"2026-10-06T14:00:00.000Z","k":"review","card":"r|k|g1f3","g":3,"w":["Nf3"]}').problems.length, 1);
  assert.equal(parseLog('{"v":1,"n":3,"t":"2026-10-06T14:00:00.000Z","k":"review","card":"r|k|g1f3","g":3,"h":true}').problems.length, 1);
});

test('a sync merges settings both devices changed per field, and reads all three versions', async () => {
  const { mergeNeeds, mergeTrees } = await import('../../../../src/core/sync/trees.ts');
  const { gitBlobSha } = await import('../../../../src/core/sync/gitHash.ts');
  const texts = new Map<string, string>();
  const side = (text: string) => {
    const sha = gitBlobSha(text);
    texts.set(sha, text);
    return new Map([['settings.json', sha]]);
  };
  const sides = {
    base: side(file({ newPerDay: 20, retention: 0.9 })),
    ours: side(file({ newPerDay: 30, retention: 0.9 })),
    theirs: side(file({ newPerDay: 20, retention: 0.93 })),
  };
  assert.equal(mergeNeeds(sides, 'Phone001').shas.size, 3);
  const merged = mergeTrees(sides, (sha) => texts.get(sha)!, { labels: { ours: 'phone', theirs: 'desktop' }, device: 'Phone001', newId: () => 'NewId001' });
  const sha = merged.files.get('settings.json')!;
  assert.equal(merged.texts.get(sha), file({ newPerDay: 30, retention: 0.93 }));
});
