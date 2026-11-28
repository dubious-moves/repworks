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
  /** Replies the owner decided not to drill, as full lines: a gap scan skips them. */
  exceptions: string[];
  /** Lines to examine when their subtree is audited, each with why. */
  flags: { line: string; note: string }[];
}

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
  if (o.deck !== undefined && (!isMap(o.deck) || typeof o.deck.study !== 'string' || !Number.isInteger(o.deck.cards))) errors.push('deck needs study and cards');
  return errors.length ? { ok: false, errors } : { ok: true, state: o as AuditState };
}

export const auditStatePath = (sid: string) => `notes/${sid}/audit.json`;
export const ledgerPath = (sid: string) => `notes/${sid}/ledger.md`;
