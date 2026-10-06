// GitHub requests counted per day, for the debug panel (PLAN.md §4.9: a day's normal use is read
// from it against GitHub's limits). Kept in localStorage per tab-shared origin; best effort.
import { signal } from '@preact/signals';
import type { RequestInfo } from '../platform/github.ts';

export interface DayCounts {
  day: string;
  total: number;
  notModified: number;
  /** Writes: GraphQL mutations, and REST POST/PATCH (GitHub limits content creation to 500 an hour). */
  writes: number;
  failed: number;
  byRoute: Record<string, number>;
  rateRemaining?: number;
  rateResource?: string;
}

const key = (day: string) => `repworks-requests-${day}`;
const today = () => new Date().toISOString().slice(0, 10);

function load(day: string): DayCounts {
  try {
    const raw = localStorage.getItem(key(day));
    if (raw) return JSON.parse(raw) as DayCounts;
  } catch {
    // storage blocked: count in memory only
  }
  return { day, total: 0, notModified: 0, writes: 0, failed: 0, byRoute: {} };
}

export const requestCounts = signal<DayCounts>(load(today()));

export function countRequest(info: RequestInfo): void {
  const day = today();
  const counts = requestCounts.value.day === day ? { ...requestCounts.value, byRoute: { ...requestCounts.value.byRoute } } : load(day);
  counts.total++;
  if (info.status === 304) counts.notModified++;
  if (info.status === 'network' || (typeof info.status === 'number' && info.status >= 400)) counts.failed++;
  if (info.write) counts.writes++;
  const route = `${info.method} ${info.route.replace(/\/[0-9a-f]{40}(\.\.\.[0-9a-f]{40})?/g, '/{sha}').replace(/\/heads\/.*$/, '/heads/{branch}')}`;
  counts.byRoute[route] = (counts.byRoute[route] ?? 0) + 1;
  if (info.rateRemaining !== undefined) counts.rateRemaining = info.rateRemaining;
  if (info.rateResource !== undefined) counts.rateResource = info.rateResource;
  requestCounts.value = counts;
  try {
    localStorage.setItem(key(day), JSON.stringify(counts));
  } catch {
    // best effort
  }
}
