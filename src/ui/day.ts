// A time shown as text, never throwing: `toISOString` throws on an invalid or out-of-range time,
// and one bad record (an old file, a migrated state) must not stop a screen from drawing.

/** "2026-10-07" (`length` 10) or "2026-10-07 16:08" (16), in UTC; "?" when the time is not a time. */
export function isoDay(ms: number | string, length: 10 | 16 = 10): string {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '?' : d.toISOString().slice(0, length).replace('T', ' ');
}
