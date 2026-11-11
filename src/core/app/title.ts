// The page's title (PLAN.md §5.164): what a browser's tab, its history and the installed app's
// window say. The home is "Repworks"; every other screen is named first, in the words of its own
// head, then the app. A name not known yet (the studies still being read) is left out, never
// shown as an id.
import type { Mode } from './fsm.ts';

export interface TitleNames {
  study(sid: string): string | undefined;
  chapter(sid: string, cid: string): string | undefined;
  /** An endgame's title, a theoretical one's or one of the repertoire's. */
  endgame(id: string): string | undefined;
}

export const APP_TITLE = 'Repworks';

const PRACTICE = { retry: 'Retry mistakes', drill: 'Drill mistakes', pinned: 'Drill pinned', pins: 'Drill all pins' } as const;

/** `first · second`, whichever of the two there are. */
const join = (...parts: (string | undefined)[]) => parts.filter((p): p is string => !!p).join(' · ');

/** The screen's own name, without the app's; '' at the home. */
export function screenTitle(mode: Mode, names: TitleNames): string {
  switch (mode.name) {
    case 'list':
      return '';
    case 'import':
      return 'Import';
    case 'conflicts':
      return 'Conflicts';
    case 'chapter':
      // The chapter first: the tabs of one study are told apart by it.
      return join(mode.cid ? names.chapter(mode.sid, mode.cid) : undefined, names.study(mode.sid)) || 'Study';
    case 'analysis':
      return 'Analysis board';
    case 'train':
      if (mode.cid) return join('Line', names.chapter(mode.sid!, mode.cid));
      return join('Training', mode.sid ? names.study(mode.sid) : undefined);
    case 'learn':
      return join('Learn', names.chapter(mode.sid, mode.cid));
    case 'show':
      return join('Show and grade', mode.sid ? names.study(mode.sid) : undefined);
    case 'difficult':
      return 'Difficult lines';
    case 'ideas':
      return join('Ideas', mode.sid ? names.study(mode.sid) : undefined);
    case 'mistakes':
      return 'Mistakes';
    case 'read':
      return join('Read', names.chapter(mode.sid, mode.cid));
    case 'play':
      return join('Play', names.chapter(mode.sid, mode.cid));
    case 'practice':
      return PRACTICE[mode.run];
    case 'coverage':
      return join('Coverage', names.study(mode.sid));
    case 'storm':
      return join('Storm', mode.sid ? join(mode.cid ? names.chapter(mode.sid, mode.cid) : undefined, names.study(mode.sid)) : undefined);
    case 'games':
      return mode.id ? 'Game' : 'Games';
    case 'gamesReview':
      return 'Game cards';
    case 'migrate':
      return 'Move from mistake-lab';
    case 'playOn':
      return 'Practice';
    case 'history':
      return 'Practice game';
    case 'repCheck':
      return 'Repertoire check';
    case 'progress':
      return 'Progress';
    case 'checklists':
      return 'Variation checklist';
    case 'checklist':
      return join('Checklist', names.study(mode.sid));
    case 'endgames':
      return mode.id ? join('Endgame', names.endgame(mode.id)) : 'Endgames';
  }
}

/** The document's title for `mode`: the screen, then the app; the app alone at the home. */
export function pageTitle(mode: Mode, names: TitleNames): string {
  return join(screenTitle(mode, names), APP_TITLE);
}
