// Commit messages (PLAN.md §4.9). The headline names the device and what changed; the last line
// identifies the commit for lost answers:
//
//   phone: 2 study files, 14 reviews
//
//   repworks-sync: Ab3dEf9h:17
import type { RemoteCommit } from './ports.ts';

const SYNC_LINE = /^repworks-sync: ([A-Za-z0-9]{8}):(\d+)$/m;

export interface CommitSummary {
  studyFiles: number;
  progressFiles: number;
  events: number;
  otherFiles: number;
}

export function commitMessage(deviceName: string, deviceId: string, seq: number, summary: CommitSummary): string {
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (summary.studyFiles) parts.push(count(summary.studyFiles, 'study file', 'study files'));
  if (summary.events) parts.push(count(summary.events, 'event', 'events'));
  else if (summary.progressFiles) parts.push(count(summary.progressFiles, 'progress file', 'progress files'));
  if (summary.otherFiles) parts.push(count(summary.otherFiles, 'other file', 'other files'));
  return `${deviceName}: ${parts.length ? parts.join(', ') : 'sync'}\n\nrepworks-sync: ${deviceId}:${seq}`;
}

export function syncId(message: string): { device: string; seq: number } | undefined {
  const m = SYNC_LINE.exec(message);
  return m ? { device: m[1]!, seq: Number(m[2]) } : undefined;
}

/** Who made a run of commits, for conflict labels: device names from the app's own headlines. */
export function authors(commits: readonly RemoteCommit[]): string {
  const names: string[] = [];
  for (const c of commits) {
    const name = syncId(c.message) ? /^([^:\n]+):/.exec(c.message)?.[1]?.trim() : undefined;
    const label = name || 'remote';
    if (!names.includes(label)) names.push(label);
  }
  return names.length ? names.join('+') : 'remote';
}
