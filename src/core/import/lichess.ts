// Lichess as an import source (PLAN.md §4.10): study IDs from what the owner pastes, the export
// URL, and the study list. The port is implemented over fetch in src/platform/lichess.ts.

/**
 * A study ID from a URL, a slug or a bare ID (ported from puzzle-explorer's
 * lib/lichessStudy.js `extractStudyId`): `abcd1234`, `lichess.org/study/abcd1234`, with a
 * chapter (`/wxyz5678`), `.pgn`, a query or a hash after it.
 */
export function extractStudyId(input: string): string | undefined {
  const s = input.trim();
  if (/^[A-Za-z0-9]{8}$/.test(s)) return s;
  return /lichess\.org\/study\/([A-Za-z0-9]{8})(?:[/.?#].*)?$/.exec(s)?.[1];
}

/** The export of every chapter, with each chapter's side and without clocks (D3). */
export const studyExportPath = (id: string) => `/api/study/${id}.pgn?clocks=false&orientation=true`;

export interface LichessStudyInfo {
  id: string;
  name: string;
  /** Milliseconds since the epoch, when Lichess says. */
  updatedAt?: number;
}

/** `/api/study/by/<user>` answers one JSON object per line. Lines it can't read are skipped. */
export function parseStudyList(ndjson: string): LichessStudyInfo[] {
  const out: LichessStudyInfo[] = [];
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string') continue;
      const info: LichessStudyInfo = { id: o['id'], name: o['name'] };
      if (typeof o['updatedAt'] === 'number') info.updatedAt = o['updatedAt'];
      out.push(info);
    } catch {
      // not JSON: skipped
    }
  }
  return out;
}

/**
 * Why a Lichess call failed: auth (401, the token is no good), missing (404, or a private study
 * without a token, which Lichess answers 403 or 404), rate (429), network (no answer), server.
 */
export type LichessFailure = 'auth' | 'missing' | 'rate' | 'network' | 'server';

export class LichessError extends Error {
  readonly reason: LichessFailure;

  constructor(reason: LichessFailure, message: string) {
    super(message);
    this.name = 'LichessError';
    this.reason = reason;
  }
}

export interface Lichess {
  /** The study's PGN export (studyExportPath). */
  studyPgn(id: string): Promise<string>;
  /** The user's studies: public ones, and private ones too with the user's own token. */
  studies(username: string): Promise<LichessStudyInfo[]>;
}
