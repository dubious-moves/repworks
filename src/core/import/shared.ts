// What another app shared to Repworks, or a file the desktop opened with it (PLAN.md §5.159),
// read into what Import does with it: a PGN to read, or a Lichess study to fetch.
import { extractStudyId } from './lichess.ts';

export interface SharedInput {
  title?: string;
  text?: string;
  url?: string;
  /** A file shared or opened: its name and its text. */
  file?: { name: string; text: string };
}

export type SharedImport = { kind: 'pgn'; pgn: string; name: string } | { kind: 'lichess'; id: string } | { kind: 'none'; why: string };

/** Whether text reads as PGN: a tag pair, or a numbered first move. */
const looksLikePgn = (t: string) => /^\s*\[\w+\s+"/m.test(t) || /(^|\s)1\.\s*[a-hKQRBNO]/.test(t);

/**
 * A file first; then a Lichess study link anywhere in the url, text or title (the Lichess app
 * shares "<name> https://lichess.org/study/…"); then PGN pasted as text.
 */
export function readShared(i: SharedInput): SharedImport {
  if (i.file && i.file.text.trim()) return { kind: 'pgn', pgn: i.file.text, name: i.file.name || 'shared PGN' };
  for (const s of [i.url, i.text, i.title]) {
    if (!s) continue;
    for (const link of s.match(/https?:\/\/\S+/g) ?? []) {
      const id = extractStudyId(link.replace(/[)\].,;]+$/, ''));
      if (id) return { kind: 'lichess', id };
    }
  }
  if (i.text && looksLikePgn(i.text)) return { kind: 'pgn', pgn: i.text, name: i.title?.trim() || 'shared PGN' };
  const what = (i.url || i.text || i.title || '').trim();
  return { kind: 'none', why: what ? `Nothing to import in what was shared: ${what.length > 80 ? `${what.slice(0, 80)}…` : what}` : 'Nothing was shared.' };
}
