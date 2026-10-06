// The app's modes (PLAN.md §4.11): one explicit state instead of boolean flags. Each mode has an
// address in the hash, since GitHub Pages has no SPA fallback (§4.1):
//   #/                                  the study list
//   #/import                            import a study
//   #/conflicts                         every open conflict
//   #/study/<sid>[/<cid>][?at=e4,e5]    a chapter, at a move
//   #/train[/<sid>]                     training: the whole repertoire, or one study (§5.7)
//   #/mistakes                          the day's mistakes and the pins (§5.8)
//   #/mistakes/retry, #/mistakes/drill  the day's mistakes retried, or drilled
//   #/pinned, #/pinned/all              the pins due, or every pin, drilled
// A setup link (#setup?…) is read and removed before any of this (src/app/setup.ts).
import { isId } from '../study/ids.ts';

export type Mode =
  | { name: 'list' }
  | { name: 'import' }
  | { name: 'conflicts' }
  /** A study's chapter; without `cid`, its first. `at` is a move path, [] the start. */
  | { name: 'chapter'; sid: string; cid?: string; at?: string[] }
  /** A training session: the whole repertoire, or one study's lines. */
  | { name: 'train'; sid?: string }
  | { name: 'mistakes' }
  /** A practice session over mistakes or pins: nothing graded (§5.8). */
  | { name: 'practice'; run: Practice };

export type Practice = 'retry' | 'drill' | 'pinned' | 'pins';
const PRACTICE_HASH: Record<Practice, string> = { retry: '#/mistakes/retry', drill: '#/mistakes/drill', pinned: '#/pinned', pins: '#/pinned/all' };

export type ModeEvent =
  | { type: 'open'; mode: Mode }
  /** Back, as the app's own back button: from a chapter or a tool to the list. */
  | { type: 'back' }
  /**
   * The study's chapters, once read: a chapter mode without a chapter, or whose chapter is gone
   * (deleted here, or by a sync), goes to the first one, else to the list.
   */
  | { type: 'missing'; chapters: readonly string[] }
  /** The move shown changed: the address follows, so a reload comes back to it. */
  | { type: 'at'; path: readonly string[] };

export function transition(mode: Mode, event: ModeEvent): Mode {
  switch (event.type) {
    case 'open':
      return event.mode;
    case 'back':
      return { name: 'list' };
    case 'missing':
      if (mode.name !== 'chapter') return mode;
      if (mode.cid !== undefined && event.chapters.includes(mode.cid)) return mode;
      return event.chapters.length ? { name: 'chapter', sid: mode.sid, cid: event.chapters[0]! } : { name: 'list' };
    case 'at':
      return mode.name === 'chapter' ? { ...mode, at: [...event.path] } : mode;
  }
}

const SAN = /^[A-Za-z0-9+#=-]+$/;

const decode = (part: string): string | undefined => {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
};

export function parseHash(hash: string): Mode {
  const [rawPath = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = rawPath.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'import') return { name: 'import' };
  if (parts.length === 1 && parts[0] === 'conflicts') return { name: 'conflicts' };
  if (parts[0] === 'train' && parts.length === 1) return { name: 'train' };
  if (parts[0] === 'mistakes' && parts.length === 1) return { name: 'mistakes' };
  const practice = (Object.keys(PRACTICE_HASH) as Practice[]).find((p) => PRACTICE_HASH[p] === `#/${parts.join('/')}`);
  if (practice) return { name: 'practice', run: practice };
  if (parts[0] === 'train' && parts.length === 2 && isId(parts[1])) return { name: 'train', sid: parts[1] };
  if (parts[0] === 'study' && isId(parts[1]) && parts.length <= 3) {
    const mode: Mode = { name: 'chapter', sid: parts[1] };
    if (parts.length === 3) {
      if (!isId(parts[2])) return { name: 'list' };
      mode.cid = parts[2];
    }
    const at = query.split('&').find((p) => p.startsWith('at='))?.slice(3);
    if (at !== undefined) {
      const path = at === '' ? [] : at.split(',').map(decode);
      if (path.every((san) => san !== undefined && SAN.test(san))) mode.at = path as string[];
    }
    return mode;
  }
  return { name: 'list' };
}

export function modeHash(mode: Mode): string {
  switch (mode.name) {
    case 'list':
      return '#/';
    case 'import':
      return '#/import';
    case 'conflicts':
      return '#/conflicts';
    case 'train':
      return mode.sid ? `#/train/${mode.sid}` : '#/train';
    case 'mistakes':
      return '#/mistakes';
    case 'practice':
      return PRACTICE_HASH[mode.run];
    case 'chapter': {
      const base = `#/study/${mode.sid}${mode.cid ? `/${mode.cid}` : ''}`;
      // encoded: a query reads a bare + as a space (exd8=Q+).
      return mode.at && mode.at.length ? `${base}?at=${mode.at.map(encodeURIComponent).join(',')}` : base;
    }
  }
}
