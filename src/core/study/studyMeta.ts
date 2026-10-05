// studies/<sid>/study.json: read strictly, written in one stable form so that two devices
// writing the same meta produce the same bytes (PLAN.md §4.4).
import { isId } from './ids.ts';
import type { StudyKind, StudyMeta, StudySource } from './model.ts';

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const KINDS: readonly StudyKind[] = ['repertoire', 'reference'];
const SOURCE_KINDS: readonly StudySource['kind'][] = ['qchess', 'lichess', 'file'];

export function parseStudyMeta(text: string, expectedId?: string): Parsed<StudyMeta> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`not JSON: ${String(error)}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['not a JSON object'] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (o['format'] !== 1) errors.push(`format must be 1, found ${JSON.stringify(o['format'])}`);
  if (!isId(o['id'])) errors.push(`id must be 8 letters or digits, found ${JSON.stringify(o['id'])}`);
  else if (expectedId !== undefined && o['id'] !== expectedId) errors.push(`id ${o['id']} doesn't match its folder ${expectedId}`);
  if (typeof o['name'] !== 'string' || o['name'].trim() === '') errors.push('name must be a non-empty string');
  if (!KINDS.includes(o['kind'] as StudyKind)) errors.push(`kind must be "repertoire" or "reference", found ${JSON.stringify(o['kind'])}`);
  const chapters = o['chapters'];
  if (!Array.isArray(chapters) || !chapters.every(isId)) errors.push('chapters must be a list of chapter IDs');
  else if (new Set(chapters).size !== chapters.length) errors.push('chapters lists an ID twice');
  let source: StudySource | undefined;
  if (o['source'] !== undefined) {
    const s = o['source'] as Record<string, unknown>;
    if (typeof s !== 'object' || s === null || !SOURCE_KINDS.includes(s['kind'] as StudySource['kind']) || typeof s['imported'] !== 'string') {
      errors.push('source must have a kind (qchess, lichess or file) and an imported time');
    } else if ((s['id'] !== undefined && typeof s['id'] !== 'string') || (s['name'] !== undefined && typeof s['name'] !== 'string')) {
      errors.push('source id and name must be strings');
    } else {
      source = { kind: s['kind'] as StudySource['kind'], imported: s['imported'] };
      if (s['id'] !== undefined) source.id = s['id'] as string;
      if (s['name'] !== undefined) source.name = s['name'] as string;
    }
  }
  if (errors.length) return { ok: false, errors };
  const meta: StudyMeta = { format: 1, id: o['id'] as string, name: o['name'] as string, kind: o['kind'] as StudyKind, chapters: chapters as string[] };
  if (source) meta.source = source;
  return { ok: true, value: meta };
}

export function writeStudyMeta(meta: StudyMeta): string {
  const ordered: Record<string, unknown> = { format: 1, id: meta.id, name: meta.name, kind: meta.kind, chapters: meta.chapters };
  if (meta.source) {
    const s: Record<string, unknown> = { kind: meta.source.kind };
    if (meta.source.id !== undefined) s['id'] = meta.source.id;
    if (meta.source.name !== undefined) s['name'] = meta.source.name;
    s['imported'] = meta.source.imported;
    ordered['source'] = s;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * The chapter order to show: the listed chapters whose files exist, in list order, then any
 * chapter file the list doesn't name, appended in ID order (so a writer that forgot the list
 * loses nothing, and every device appends the same way).
 */
export function reconcileChapterOrder(listed: readonly string[], present: Iterable<string>): string[] {
  const have = new Set(present);
  const order = listed.filter((cid) => have.has(cid));
  const named = new Set(order);
  return [...order, ...[...have].filter((cid) => !named.has(cid)).sort()];
}
