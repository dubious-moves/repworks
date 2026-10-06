// Views over every study and every device's progress (PLAN.md §4.11): the open conflicts, and
// the card states replay gives, which the acceptance test compares between devices.
import { chapterPath, classifyPath } from '../core/data/layout.ts';
import { openConflicts, type OpenConflict } from '../core/merge/markers.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { parseLog } from '../core/progress/events.ts';
import { readProgress } from '../core/progress/files.ts';
import { Replay, toDeviceEvents } from '../core/progress/replay.ts';
import { header } from '../core/study/model.ts';
import { parseStudyMeta, reconcileChapterOrder } from '../core/study/studyMeta.ts';
import type { IdbStore } from '../platform/idbStore.ts';

export interface ConflictRow {
  sid: string;
  cid: string;
  study: string;
  chapter: string;
  conflict: OpenConflict;
}

export interface Overview {
  conflicts: ConflictRow[];
  /** Copies of chapter files a merge couldn't merge (§4.7), saved beside them. */
  copies: { sid: string; study: string; path: string }[];
}

export async function findConflicts(store: IdbStore): Promise<Overview> {
  const files = await store.read((p) => p.startsWith('studies/'));
  const studies = new Map<string, { name: string; listed: string[] }>();
  const present = new Map<string, string[]>();
  const copies: Overview['copies'] = [];
  for (const [path, text] of files) {
    const where = classifyPath(path);
    if (where.kind === 'study') {
      const meta = parseStudyMeta(text, where.sid);
      studies.set(where.sid, meta.ok ? { name: meta.value.name, listed: meta.value.chapters } : { name: where.sid, listed: [] });
    } else if (where.kind === 'chapter') present.set(where.sid, [...(present.get(where.sid) ?? []), where.cid]);
    else if (where.kind === 'conflict-copy') copies.push({ sid: where.sid, study: where.sid, path });
  }
  const conflicts: ConflictRow[] = [];
  for (const sid of [...new Set([...studies.keys(), ...present.keys()])].sort((a, b) => (studies.get(a)?.name ?? a).localeCompare(studies.get(b)?.name ?? b))) {
    const name = studies.get(sid)?.name ?? sid;
    for (const cid of reconcileChapterOrder(studies.get(sid)?.listed ?? [], present.get(sid) ?? [])) {
      const text = files.get(chapterPath(sid, cid))!;
      if (!text.includes('<<<<<<<')) continue;
      const parsed = parseChapterFile(text, cid);
      if (!parsed.ok) continue;
      for (const conflict of openConflicts(parsed.chapter)) conflicts.push({ sid, cid, study: name, chapter: header(parsed.chapter, 'ChapterName') ?? cid, conflict });
    }
  }
  for (const copy of copies) copy.study = studies.get(copy.sid)?.name ?? copy.sid;
  return { conflicts, copies };
}

export interface CardRow {
  card: string;
  reviews: number;
  due: number | undefined;
  stability: number;
  difficulty: number;
  suspended: boolean;
}

/** Every card's state: every device's progress files, plus this device's events not yet sent. */
export async function cardStates(store: IdbStore): Promise<CardRow[]> {
  const device = await store.device();
  const files = await store.read((p) => p.startsWith('progress/'));
  const { events } = readProgress(files);
  const replay = new Replay();
  replay.add(events);
  if (device) replay.add(toDeviceEvents(device.id, parseLog((await store.unsentEvents()).map((e) => e.raw).join('\n')).lines));
  return [...replay.states]
    .map(([card, s]) => ({ card, reviews: s.reviews, due: s.card.due, stability: s.card.stability, difficulty: s.card.difficulty, suspended: s.suspended }))
    .sort((a, b) => (a.card < b.card ? -1 : 1));
}
