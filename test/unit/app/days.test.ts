// The device's calendar days (src/app/days.ts, PLAN.md §5.167): local midnights, the days the
// clocks change, the calendar's frame from a Monday, and the days since the first answer. Run in
// Europe/Stockholm (set before any date is read: `node --test` runs each file in its own process).
//
// Controls run (2026-11-11), each failing the test named and no other:
// - `localDays` stepping by 24 hours from the first midnight (`start + i * 86_400_000`): "the
//   days the clocks change" fails, the day after the 25-hour day starting at 23:00.
// - `weekdayOf` with Sunday first (`getDay()` alone): "the calendar's frame" fails, a Monday
//   at 1 for 0.
// - `daysSince` from the times' difference (`Math.ceil((now - first) / 86_400_000)`): "the days
//   since" fails, 23:00 to 01:00 the next day counted as one day for two.
process.env['TZ'] = 'Europe/Stockholm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { calendarDays, daysSince, localDays, weekdayOf } = await import('../../../src/app/days.ts');

const HOUR = 3_600_000;
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('the test runs on Stockholm’s clock', () => {
  assert.equal(new Date(Date.UTC(2026, 6, 1, 12)).getHours(), 14);
});

test('local days run from midnight to midnight on the device, not UTC’s', () => {
  // 00:30 on 7 October in Stockholm is 22:30 UTC on the 6th.
  const now = Date.UTC(2026, 9, 6, 22, 30);
  const [yesterday, today] = localDays(now, -1, 2);
  assert.equal(today!.start, Date.UTC(2026, 9, 6, 22));
  assert.equal(today!.end, Date.UTC(2026, 9, 7, 22));
  assert.equal(yesterday!.end, today!.start);
  assert.equal(yesterday!.start, Date.UTC(2026, 9, 5, 22));
});

test('the days the clocks change are one day each: 25 hours in October, 23 in March', () => {
  const autumn = localDays(at(2026, 10, 26), -2, 3);
  assert.deepEqual(
    autumn.map((d) => (d.end - d.start) / HOUR),
    [24, 25, 24],
  );
  assert.deepEqual(
    autumn.map((d) => [new Date(d.start).getDate(), new Date(d.start).getHours()]),
    [
      [24, 0],
      [25, 0],
      [26, 0],
    ],
  );
  const spring = localDays(at(2026, 3, 30), -2, 3);
  assert.deepEqual(
    spring.map((d) => (d.end - d.start) / HOUR),
    [24, 23, 24],
  );
  // Half a year of days, across both changes: each starts where the last ended, at a midnight.
  const year = localDays(at(2026, 11, 11), -181, 182);
  for (let i = 1; i < year.length; i++) assert.equal(year[i]!.start, year[i - 1]!.end);
  assert.ok(year.every((d) => new Date(d.start).getHours() === 0));
  assert.equal(new Date(year.at(-1)!.start).getDate(), 11);
});

test('the calendar’s frame: whole weeks from a Monday, then Monday to today', () => {
  // 2026-11-09 is a Monday, the 11th a Wednesday, the 15th a Sunday.
  assert.deepEqual([9, 11, 15].map((d) => weekdayOf(at(2026, 11, d))), [0, 2, 6]);
  assert.deepEqual([9, 11, 15].map((d) => calendarDays(at(2026, 11, d), 26)), [176, 178, 182]);
  for (const day of [9, 11, 15]) {
    const now = at(2026, 11, day);
    const count = calendarDays(now, 26);
    const first = localDays(now, 1 - count, count)[0]!;
    assert.equal(weekdayOf(first.start), 0, 'the first square is a Monday');
  }
  // A Sunday's last minute is still that week's.
  assert.equal(weekdayOf(at(2026, 11, 15, 23, 59)), 6);
});

test('the days since the first answer are calendar days, both ends counted', () => {
  assert.equal(daysSince(at(2026, 11, 11, 9), at(2026, 11, 11, 8)), 1);
  // Two hours apart, across midnight: two days.
  assert.equal(daysSince(at(2026, 11, 11, 1), at(2026, 11, 10, 23)), 2);
  // Across the 25-hour day.
  assert.equal(daysSince(at(2026, 10, 26, 0, 30), at(2026, 10, 24, 23, 30)), 3);
  assert.equal(daysSince(at(2026, 11, 11), at(2025, 11, 11)), 366);
  // A first answer after now (a clock set wrong): today alone. A time of 1970: capped.
  assert.equal(daysSince(at(2026, 11, 11), at(2026, 11, 13)), 1);
  assert.equal(daysSince(at(2026, 11, 11), 0), 366 * 30);
});
