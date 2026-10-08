// Importing PGN as a new study (PLAN.md §4.10, D3). Two steps, both pure:
// - readImport: every game of the text as a chapter, with the side it is for when the PGN says
//   ([Orientation], else Qchess's [ChapterPerspective]), whether Qchess trains it, and what the
//   parser reported. Chapters that can't be read are listed with the reason.
// - buildImport: the owner's choices (name, kind, sides) turned into the files of a new study.
//   Chapters marked [QchessTrain "false"] go into a companion reference study,
//   "<name> (reference)", since a study is a repertoire or a reference as a whole.
// Every import makes new studies with new IDs; where they came from goes in `source`.
import { parseGames, type ImportNote } from '../pgn/parse.ts';
import { chapterFileText } from '../pgn/write.ts';
import { chapterPath, studyMetaPath } from '../data/layout.ts';
import { freshId } from '../study/ids.ts';
import { header, type Chapter, type StudyKind, type StudyMeta, type StudySource } from '../study/model.ts';
import { linePgn, renameStudy, setHeader, setOrientation } from '../study/ops.ts';
import { writeStudyMeta } from '../study/studyMeta.ts';
import { nodeAt } from '../study/tree.ts';

export type Side = 'white' | 'black';

export interface ImportChapter {
  /** Its place among the games of the text, from 0. */
  index: number;
  name: string;
  /** The side the PGN gives it, if any. */
  side: Side | undefined;
  /** False for [QchessTrain "false"]: the chapter goes into the companion reference study. */
  train: boolean;
  folder: string | undefined;
  chapter: Chapter;
  notes: ImportNote[];
}

export interface RefusedChapter {
  index: number;
  name: string;
  reason: string;
}

export interface ImportReading {
  chapters: ImportChapter[];
  refused: RefusedChapter[];
  /** The study's name, when the PGN carries one ([StudyName]). */
  studyName: string | undefined;
  /** Whether the text has Qchess's own headers (from the export script or Qchess's import). */
  fromQchess: boolean;
}

const sideOf = (value: string | undefined): Side | undefined => {
  const v = value?.trim().toLowerCase();
  return v === 'white' || v === 'black' ? v : undefined;
};

const QCHESS_HEADERS = ['QchessFolder', 'QchessTrain', 'ChapterPerspective'];

/** A name for a chapter: its ChapterName, else its Event, else its players, else its number. */
export function chapterName(headers: readonly [string, string][], index: number, fallback = `Chapter ${index + 1}`): string {
  const get = (name: string) => {
    const v = headers.find(([k]) => k === name)?.[1].trim();
    return v && v !== '?' ? v : undefined;
  };
  const players = get('White') && get('Black') ? `${get('White')} - ${get('Black')}` : undefined;
  return get('ChapterName') ?? get('Event') ?? players ?? fallback;
}

export function readImport(text: string): ImportReading {
  const chapters: ImportChapter[] = [];
  const refused: RefusedChapter[] = [];
  let studyName: string | undefined;
  let fromQchess = false;
  parseGames(text, () => 'Imported').forEach((parsed, index) => {
    const headers = parsed.ok ? parsed.chapter.headers : parsed.headers;
    const get = (name: string) => headers.find(([k]) => k === name)?.[1];
    studyName ??= get('StudyName')?.trim() || undefined;
    if (headers.some(([k]) => QCHESS_HEADERS.includes(k))) fromQchess = true;
    const name = chapterName(headers, index);
    if (!parsed.ok) return void refused.push({ index, name, reason: parsed.reason });
    chapters.push({
      index,
      name,
      side: sideOf(get('Orientation')) ?? sideOf(get('ChapterPerspective')),
      train: get('QchessTrain')?.trim().toLowerCase() !== 'false',
      folder: get('QchessFolder'),
      chapter: parsed.chapter,
      notes: parsed.notes,
    });
  });
  return { chapters, refused, studyName, fromQchess };
}

export interface ImportChoices {
  name: string;
  kind: StudyKind;
  /** Where it came from; `imported` is added. */
  source: Omit<StudySource, 'imported'>;
  /** The side for each chapter (by index) the PGN gives none, or to change the one it gives. */
  sides: ReadonlyMap<number, Side>;
}

export interface ImportContext {
  random: () => number;
  /** Study IDs already in use. */
  taken: ReadonlySet<string>;
  /** ISO 8601 time of the import. */
  now: string;
}

export interface ImportedStudy {
  meta: StudyMeta;
  chapters: Chapter[];
}

export type ImportBuild = { ok: true; studies: ImportedStudy[]; files: Map<string, string> } | { ok: false; error: string };

/** The chapters of `reading` that still need a side. */
export const sidesMissing = (reading: ImportReading, sides: ReadonlyMap<number, Side>) => reading.chapters.filter((c) => !c.side && !sides.has(c.index));

export function buildImport(reading: ImportReading, choices: ImportChoices, ctx: ImportContext): ImportBuild {
  const name = choices.name.trim();
  if (!name) return { ok: false, error: 'the study needs a name' };
  if (reading.chapters.length === 0) return { ok: false, error: 'there is no chapter to import' };
  const missing = sidesMissing(reading, choices.sides);
  if (missing.length) return { ok: false, error: `choose a side for ${missing.map((c) => c.name).join(', ')}` };

  const trained = choices.kind === 'repertoire' ? reading.chapters.filter((c) => c.train) : reading.chapters;
  const untrained = choices.kind === 'repertoire' ? reading.chapters.filter((c) => !c.train) : [];
  const groups: { name: string; kind: StudyKind; chapters: ImportChapter[] }[] = [];
  if (trained.length) groups.push({ name, kind: choices.kind, chapters: trained });
  if (untrained.length) groups.push({ name: `${name} (reference)`, kind: 'reference', chapters: untrained });

  const taken = new Set(ctx.taken);
  const studies: ImportedStudy[] = [];
  const files = new Map<string, string>();
  for (const group of groups) {
    const sid = freshId(ctx.random, taken);
    taken.add(sid);
    const cids = new Set<string>();
    const chapters: Chapter[] = [];
    for (const item of group.chapters) {
      const cid = freshId(ctx.random, cids);
      cids.add(cid);
      const chapter = prepare({ ...item.chapter, id: cid }, item, group.name, choices.sides.get(item.index) ?? item.side!);
      if (!chapter.ok) return { ok: false, error: `${item.name}: ${chapter.error}` };
      chapters.push(chapter.value);
      files.set(chapterPath(sid, cid), chapterFileText(chapter.value));
    }
    const meta: StudyMeta = { format: 1, id: sid, name: group.name, kind: group.kind, chapters: chapters.map((c) => c.id), source: { ...choices.source, imported: ctx.now } };
    files.set(studyMetaPath(sid), writeStudyMeta(meta));
    studies.push({ meta, chapters });
  }
  return { ok: true, studies, files };
}

/**
 * A chapter as stored: every header kept, plus ChapterName if it had none, its side in
 * [Orientation], and the study's name in [StudyName] (rewritten, with a Lichess-style Event, as
 * a study rename rewrites them).
 */
function prepare(chapter: Chapter, item: ImportChapter, studyName: string, side: Side): { ok: true; value: Chapter } | { ok: false; error: string } {
  let next = header(chapter, 'ChapterName') === undefined ? setHeader(chapter, 'ChapterName', item.name) : { ok: true as const, value: chapter };
  if (next.ok && header(next.value, 'Orientation') !== side) next = setOrientation(next.value, side);
  if (!next.ok) return next;
  const renamed = renameStudy({ format: 1, id: 'Imported', name: header(next.value, 'StudyName') ?? '', kind: 'reference', chapters: [] }, [next.value], studyName);
  return renamed.ok ? { ok: true, value: renamed.value.chapters[0]! } : renamed;
}

/** One line of the import report for a parser note, with the moves written out. */
export function describeNote(chapter: Chapter, note: ImportNote): string {
  const at = (path: readonly string[]) => (path.length && nodeAt(chapter, path) ? linePgn(chapter, path) : 'the start');
  switch (note.kind) {
    case 'illegal':
      return `${note.san} after ${at(note.path)} is not a legal move: it was left out, with everything after it`;
    case 'canonical':
      return `${note.from} is written ${note.path[note.path.length - 1]} (${at(note.path)})`;
    case 'merged':
      return `the same move twice at ${at(note.path)}: merged into one`;
    case 'long-comment':
      return `a comment of ${note.length.toLocaleString('en')} characters at ${at(note.path)}: Lichess would keep 4,000`;
  }
}

/** The headers the chapters carry, by name, with how many chapters carry each. */
export function headerCounts(reading: ImportReading): [string, number][] {
  const counts = new Map<string, number>();
  for (const c of reading.chapters) for (const [k] of c.chapter.headers) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts];
}

export type NewChapters = { ok: true; chapters: Chapter[]; notes: string[] } | { ok: false; error: string };

/**
 * Chapters for an open study from PGN (PLAN.md §5.15, "New chapter" from PGN): one per game of
 * the text, as Lichess's dialog makes them. With one game a typed name wins over the game's;
 * a game with no name of its own takes `unnamed(i)`; every chapter is for the side chosen in the
 * dialog. A game that can't be read refuses the
 * whole text, so nothing is left out unseen; the parser's notes come back as sentences.
 */
export function chaptersFromPgn(text: string, choice: { studyName: string; name: string; unnamed: (i: number) => string; side: Side; newId: () => string }): NewChapters {
  const reading = readImport(text);
  const [refused] = reading.refused;
  if (refused) return { ok: false, error: `${refused.name}: ${refused.reason}` };
  if (reading.chapters.length === 0) return { ok: false, error: 'there is no game in that PGN' };
  const typed = choice.name.trim();
  const chapters: Chapter[] = [];
  const notes: string[] = [];
  for (const item of reading.chapters) {
    const name = typed && reading.chapters.length === 1 ? typed : chapterName(item.chapter.headers, item.index, choice.unnamed(item.index));
    // Headers an empty new chapter has, when the game lacks them (bare movetext, say).
    let named = setHeader(item.chapter, 'ChapterName', name);
    if (named.ok && header(named.value, 'Event') === undefined) named = setHeader(named.value, 'Event', `${choice.studyName}: ${name}`);
    if (named.ok && header(named.value, 'Result') === undefined) named = setHeader(named.value, 'Result', '*');
    if (!named.ok) return named;
    const chapter = prepare({ ...named.value, id: choice.newId() }, item, choice.studyName, choice.side);
    if (!chapter.ok) return { ok: false, error: `${item.name}: ${chapter.error}` };
    chapters.push(chapter.value);
    notes.push(...item.notes.map((n) => describeNote(item.chapter, n)));
  }
  return { ok: true, chapters, notes };
}
