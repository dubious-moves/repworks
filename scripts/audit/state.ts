// A study's audit state (PLAN.md §5.219): `notes/<study id>/audit.json` in the data repo, the one
// file the session keeps by hand; the ledger's tables and the checks' targets are read from it.
// Pure: text in, the state or the reasons it can't be read.
export interface OwnerFile {
  /** A PGN file in the notes folder: the owner's own chapter as he first gave it. */
  file: string;
  /** Moves and comments of his that are gone with his agreement: more than this is a loss to explain. */
  missingMoves: number;
  missingComments: number;
}

export interface ChapterState {
  /** The plies a subtree's name has: 6 for "1. Nc3 d5 2. d4 Nf6 3. Bf4 c5"; 0 for the chapter as one subtree. */
  depth: number;
  owner?: OwnerFile[];
}

export interface SubtreeState {
  /** `closed`: audited and accepted. `open`: audited, the owner's review open. `todo`: not audited. */
  state: 'closed' | 'open' | 'todo';
  /** The batch that audited it. */
  batch?: string;
  /** What the ledger says about it. */
  note?: string;
}

/**
 * How one batch's review came out (§5.220): counted by `audit.ts tally` from the list and the
 * owner's answers when they are merged, before the list is removed. Positions as the panel counts
 * them. A number that is not known (a batch from before the tally, taken from the old session's
 * journal) is left out.
 */
export interface BatchTally {
  /** The list's name, or the batch's. */
  name: string;
  title?: string;
  /** The day its answers were merged (YYYY-MM-DD). */
  date: string;
  positions?: number;
  ok?: number;
  no?: number;
  /** A note alone. */
  notes?: number;
  /** Positions he edited himself in the chapter. */
  edited?: number;
  /** Not answered when merged. */
  open?: number;
  /** Positions marked "look first", and those of them he corrected (a No, a note, his own edit). */
  first?: number;
  firstCorrected?: number;
  /** `journal`: not counted by the tool, taken from the old session's journal. */
  source?: 'journal';
  note?: string;
}

/** An exploration of ChessDB asked for (§5.220): a subtree, or a chapter (`line` empty), and the session started for it. */
export interface ExploreAsked {
  name: string;
  chapter: string;
  line: string;
  started: string;
  session?: string;
}

export interface AuditState {
  v: 1;
  /** The study's id. */
  study: string;
  chapters: Record<string, ChapterState>;
  /** By chapter id, then by the subtree's line as the ledger writes it ("1. Nc3 d5 2. d4 Nf6 3. Bf4 c5"). */
  subtrees: Record<string, Record<string, SubtreeState>>;
  /** What every check must give; a check with no target here must give 0. */
  targets: { parenProse?: number; continuedTwice?: number };
  /** The idea deck checked against the study after every batch. */
  deck?: { study: string; cards: number; rare: number; depth: number; known?: string };
  /**
   * The flags every run of scripts/practical.ts for this study carries (the owner's settings for
   * choosing moves, from rules.md), beyond the positions, the cache, the output and the depth:
   * `audit.ts practical` passes them, so a run can't be made without one.
   */
  practical?: string[];
  /** Replies the owner decided not to drill, as full lines: a gap scan skips them. */
  exceptions: string[];
  /** Lines to examine when their subtree is audited, each with why. */
  flags: { line: string; note: string }[];
  /** Each batch's review as it came out, oldest first: written by `audit.ts tally`. */
  batches?: BatchTally[];
  /** The explorations of ChessDB asked for, oldest first: written by `audit.ts explore-start`. */
  explored?: ExploreAsked[];
}

/** What `audit.ts practical` gives itself: not to be fixed in audit.json. */
const PRACTICAL_OWN = ['--positions', '--cache', '--out', '--depth', '--ort-node', '--moves', '--candidates', '--report'];

export type ReadState = { ok: true; state: AuditState } | { ok: false; errors: string[] };

export function parseAuditState(text: string): ReadState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not JSON: ${String(e)}`] };
  }
  const errors: string[] = [];
  const o = raw as Partial<AuditState> | null;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return { ok: false, errors: ['not a JSON object'] };
  if (o.v !== 1) errors.push(`v must be 1, found ${JSON.stringify(o.v)}`);
  if (typeof o.study !== 'string' || !/^[A-Za-z0-9]{8}$/.test(o.study)) errors.push('study must be a study id');
  const isMap = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!isMap(o.chapters)) errors.push('chapters must be an object, a chapter id to its settings');
  else {
    for (const [cid, c] of Object.entries(o.chapters)) {
      if (!isMap(c) || !Number.isInteger(c['depth']) || (c['depth'] as number) < 0) errors.push(`chapters.${cid}.depth must be a whole number of plies`);
      for (const f of (isMap(c) && Array.isArray(c['owner']) ? c['owner'] : []) as Partial<OwnerFile>[]) {
        if (typeof f.file !== 'string' || !Number.isInteger(f.missingMoves) || !Number.isInteger(f.missingComments)) errors.push(`chapters.${cid}.owner: each needs file, missingMoves and missingComments`);
      }
    }
  }
  if (!isMap(o.subtrees)) errors.push('subtrees must be an object, a chapter id to its subtrees');
  else {
    for (const [cid, list] of Object.entries(o.subtrees)) {
      if (!isMap(list)) {
        errors.push(`subtrees.${cid} must be an object, a line to its state`);
        continue;
      }
      for (const [line, s] of Object.entries(list)) if (!isMap(s) || !['closed', 'open', 'todo'].includes(s['state'] as string)) errors.push(`subtrees.${cid}["${line}"].state must be closed, open or todo`);
    }
  }
  if (!isMap(o.targets)) errors.push('targets must be an object');
  if (!Array.isArray(o.exceptions) || !o.exceptions.every((x) => typeof x === 'string')) errors.push('exceptions must be a list of lines');
  if (!Array.isArray(o.flags) || !o.flags.every((x) => isMap(x) && typeof x['line'] === 'string' && typeof x['note'] === 'string')) errors.push('flags must be a list of { line, note }');
  if (o.practical !== undefined && (!Array.isArray(o.practical) || !o.practical.every((x) => typeof x === 'string') || o.practical.some((x) => PRACTICAL_OWN.includes(x)))) errors.push(`practical must be a list of flags for scripts/practical.ts, without ${PRACTICAL_OWN.join(', ')} (the command gives those)`);
  if (o.deck !== undefined && (!isMap(o.deck) || typeof o.deck.study !== 'string' || !Number.isInteger(o.deck.cards))) errors.push('deck needs study and cards');
  const count = (x: unknown) => x === undefined || (Number.isInteger(x) && (x as number) >= 0);
  if (o.batches !== undefined && (!Array.isArray(o.batches) || !o.batches.every((b) => isMap(b) && typeof b['name'] === 'string' && /^\d{4}-\d\d-\d\d$/.test(String(b['date'])) && ['positions', 'ok', 'no', 'notes', 'edited', 'open', 'first', 'firstCorrected'].every((k) => count(b[k]))))) errors.push('batches must be a list of { name, date (YYYY-MM-DD), and whole numbers for positions, ok, no, notes, edited, open, first, firstCorrected where known }');
  if (o.explored !== undefined && (!Array.isArray(o.explored) || !o.explored.every((e) => isMap(e) && typeof e['name'] === 'string' && typeof e['chapter'] === 'string' && typeof e['line'] === 'string' && Number.isFinite(Date.parse(String(e['started'])))))) errors.push('explored must be a list of { name, chapter, line, started (a time) }');
  return errors.length ? { ok: false, errors } : { ok: true, state: o as AuditState };
}

/** audit.json's text: the form the file is kept in, so a script's change is a small diff. */
export const auditStateText = (state: AuditState): string => `${JSON.stringify(state, null, 2)}\n`;

export const auditStatePath = (sid: string) => `notes/${sid}/audit.json`;
export const ledgerPath = (sid: string) => `notes/${sid}/ledger.md`;

/**
 * The arguments of one Practical run for the study: what the run names (its positions, cache,
 * output, depth and the onnxruntime folder) and then the study's own flags, all of them.
 * Undefined when the study's audit.json fixes none: then there is nothing to hold a run to.
 */
export function practicalArgs(state: AuditState, run: { positions: string; cache: string; out: string; depth?: number; ortNode?: string }): string[] | undefined {
  if (!state.practical?.length) return undefined;
  return ['--positions', run.positions, '--cache', run.cache, '--out', run.out, '--depth', String(run.depth ?? 5), ...(run.ortNode ? ['--ort-node', run.ortNode] : []), ...state.practical];
}
