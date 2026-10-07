// The app's modes (PLAN.md §4.11): one explicit state instead of boolean flags. Each mode has an
// address in the hash, since GitHub Pages has no SPA fallback (§4.1):
//   #/                                  the study list
//   #/import                            import a study
//   #/conflicts                         every open conflict
//   #/study/<sid>[/<cid>][?at=e4,e5]    a chapter, at a move
//   #/train[/<sid>]                     training: the whole repertoire, or one study (§5.7)
//   #/train/<sid>/<cid>?at=e4,e5        one line picked from the training list (§5.16)
//   #/learn/<sid>/<cid>                 a chapter's new lines, past the daily limit (§5.16)
//   #/show[/<sid>]                      show and grade, by two keys (§5.9)
//   #/mistakes                          the day's mistakes and the pins (§5.8)
//   #/mistakes/retry, #/mistakes/drill  the day's mistakes retried, or drilled
//   #/pinned, #/pinned/all              the pins due, or every pin, drilled
//   #/read/<sid>/<cid>[?at=e4,e5][&from=1]  a chapter's line read through, from a move (§5.10)
//   #/play/<sid>/<cid>[?at=e4,e5][&from=1]  the same line played, every own move asked (§5.10)
//   #/coverage/<sid>                    a study's coverage against the repertoire, or a reference study's against it (§5.26)
//   #/analysis[?fen=…][&from=<sid>/<cid>&at=e4,e5][&seq=<pid>|*]  the analysis board: a scratch
//                                       chapter, from a FEN or a chapter's move (§5.35); `seq`
//                                       saves its lines as a sequence (§5.56)
//   #/storm[/<sid>[/<cid>[?at=e4,e5]]]  the storm (§5.43): the repertoire, a study, a chapter, or
//                                       the lines through a chapter's move
//   #/games                             the games and their cards (§5.54)
//   #/games/<id>[?ply=n]                one game, at a ply
//   #/games/review                      the game cards due, as a session (§5.55)
//   #/games/history/<id>                a practice game's review, from the history (§5.57)
//   #/practice?fen=…[&side=black]       playing on from a position (§5.57), as the side given
//                                       (the side to move when none)
//   #/migrate                           the migration from mistake-lab (§5.64)
// A setup link (#setup?…) is read and removed before any of this (src/app/setup.ts).
import { isId } from '../study/ids.ts';

export type Mode =
  | { name: 'list' }
  | { name: 'import' }
  | { name: 'conflicts' }
  /** A study's chapter; without `cid`, its first. `at` is a move path, [] the start. */
  | { name: 'chapter'; sid: string; cid?: string; at?: string[] }
  /**
   * A training session: the whole repertoire, or one study's lines; with `cid` and `at`, the one
   * line of that chapter whose moves are `at`, picked from the list (§5.16).
   */
  | { name: 'train'; sid?: string; cid?: string; at?: string[] }
  /** A chapter's lines still holding new moves, learned past the daily limit (§5.16). */
  | { name: 'learn'; sid: string; cid: string }
  /** Show and grade (§5.9): the same queue, run with two keys. */
  | { name: 'show'; sid?: string }
  | { name: 'mistakes' }
  /**
   * A chapter's line through the move `at` (to the end of the main line below it), read move by
   * move or played with every own move asked (§5.10), from its first `from` moves (`at`'s
   * length when not given). Nothing is graded.
   */
  | { name: 'read' | 'play'; sid: string; cid: string; at: string[]; from?: number }
  /** A practice session over mistakes or pins: nothing graded (§5.8). */
  | { name: 'practice'; run: Practice }
  /** Repertoire coverage (§5.26), opened from a study: a reference study's lines against the repertoire. */
  | { name: 'coverage'; sid: string }
  /**
   * The analysis board (§5.35): a chapter on this device only, from `fen` (the board's last one
   * when none), opened from a chapter's move (`from`, where its lines go back to) or not; with
   * `seq`, its lines can be saved as a sequence (§5.56): `seq` the mistake card's pid it replaces,
   * or `*` for none.
   */
  | { name: 'analysis'; fen?: string; from?: { sid: string; cid: string; at: string[] }; seq?: string }
  /** The storm (§5.43): over the repertoire, a study, a chapter, or the lines through `at`. */
  | { name: 'storm'; sid?: string; cid?: string; at?: string[] }
  /** The games (§5.54); with `id`, one game, at `ply` (0 the start). */
  | { name: 'games'; id?: string; ply?: number }
  /** The game cards due, as a session (§5.55). */
  | { name: 'gamesReview' }
  /** The migration from mistake-lab (§5.64). */
  | { name: 'migrate' }
  /** Playing on from a position (§5.57), as `side` (the side to move when none). */
  | { name: 'playOn'; fen: string; side?: 'white' | 'black' }
  /** A practice game's review, reopened from the history (§5.57). */
  | { name: 'history'; id: string };

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
/** A game's id: Lichess's eight characters, `chesscom_<n>`, mistake-lab's `_practice_…`. */
const GAME_ID = /^[A-Za-z0-9_]{1,60}$/;

const decode = (part: string): string | undefined => {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
};

/** The move path of a query's `at=`, when it is one. */
function atOf(query: string): string[] | undefined {
  const at = query.split('&').find((p) => p.startsWith('at='))?.slice(3);
  if (at === undefined) return undefined;
  const path = at === '' ? [] : at.split(',').map(decode);
  return path.every((san) => san !== undefined && SAN.test(san)) ? (path as string[]) : undefined;
}

// encoded: a query reads a bare + as a space (exd8=Q+).
const atQuery = (at: readonly string[] | undefined) => (at && at.length ? `?at=${at.map(encodeURIComponent).join(',')}` : '');

export function parseHash(hash: string): Mode {
  const [rawPath = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = rawPath.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'import') return { name: 'import' };
  if (parts.length === 1 && parts[0] === 'conflicts') return { name: 'conflicts' };
  if (parts.length === 1 && parts[0] === 'mistakes') return { name: 'mistakes' };
  // #/train, #/show, and either with a study; #/train with a picked line.
  for (const name of ['train', 'show'] as const) {
    if (parts[0] !== name) continue;
    if (parts.length === 1) return { name };
    if (parts.length === 2 && isId(parts[1])) return { name, sid: parts[1] };
    const at = atOf(query);
    if (name === 'train' && parts.length === 3 && isId(parts[1]) && isId(parts[2]) && at?.length) return { name, sid: parts[1], cid: parts[2], at };
    return { name: 'list' };
  }
  if (parts[0] === 'storm' && parts.length <= 3 && parts.slice(1).every((p) => isId(p))) {
    const m: Mode = { name: 'storm' };
    if (parts[1]) m.sid = parts[1];
    if (parts[2]) {
      m.cid = parts[2];
      const at = atOf(query);
      if (at) m.at = at;
    }
    return m;
  }
  if (parts[0] === 'coverage' && parts.length === 2 && isId(parts[1])) return { name: 'coverage', sid: parts[1] };
  if (parts.length === 1 && parts[0] === 'migrate') return { name: 'migrate' };
  if (parts[0] === 'games') {
    if (parts.length === 1) return { name: 'games' };
    if (parts.length === 2 && parts[1] === 'review') return { name: 'gamesReview' };
    if (parts.length === 3 && parts[1] === 'history' && GAME_ID.test(parts[2]!)) return { name: 'history', id: parts[2]! };
    if (parts.length === 2 && GAME_ID.test(parts[1]!)) {
      const m: Mode = { name: 'games', id: parts[1] };
      const ply = /(?:^|&)ply=(\d{1,4})(?:&|$)/.exec(query)?.[1];
      if (ply !== undefined) m.ply = Number(ply);
      return m;
    }
    return { name: 'games' };
  }
  if (parts.length === 1 && parts[0] === 'practice') {
    const fen = query.split('&').find((q) => q.startsWith('fen='));
    const f = fen === undefined ? undefined : decode(fen.slice(4));
    if (!f) return { name: 'games' };
    const mode: Mode = { name: 'playOn', fen: f };
    const side = query.split('&').find((q) => q.startsWith('side='))?.slice(5);
    if (side === 'white' || side === 'black') mode.side = side;
    return mode;
  }
  if (parts.length === 1 && parts[0] === 'analysis') {
    const mode: Mode = { name: 'analysis' };
    const fen = query.split('&').find((q) => q.startsWith('fen='));
    const f = fen === undefined ? undefined : decode(fen.slice(4));
    if (f) mode.fen = f;
    const from = query.split('&').find((q) => q.startsWith('from='))?.slice(5).split('/');
    if (from?.length === 2 && isId(from[0]) && isId(from[1])) mode.from = { sid: from[0], cid: from[1], at: atOf(query) ?? [] };
    const seq = query.split('&').find((q) => q.startsWith('seq='))?.slice(4);
    if (seq && (seq === '*' || GAME_ID.test(seq))) mode.seq = seq;
    return mode;
  }
  if (parts[0] === 'learn' && parts.length === 3 && isId(parts[1]) && isId(parts[2])) return { name: 'learn', sid: parts[1], cid: parts[2] };
  const practice = (Object.keys(PRACTICE_HASH) as Practice[]).find((p) => PRACTICE_HASH[p] === `#/${parts.join('/')}`);
  if (practice) return { name: 'practice', run: practice };
  const at = atOf(query);
  if (parts[0] === 'study' && isId(parts[1]) && parts.length <= 3) {
    const mode: Mode = { name: 'chapter', sid: parts[1] };
    if (parts.length === 3) {
      if (!isId(parts[2])) return { name: 'list' };
      mode.cid = parts[2];
    }
    if (at) mode.at = at;
    return mode;
  }
  if ((parts[0] === 'read' || parts[0] === 'play') && parts.length === 3 && isId(parts[1]) && isId(parts[2])) {
    const mode: Mode = { name: parts[0], sid: parts[1], cid: parts[2], at: at ?? [] };
    const from = /(?:^|&)from=(\d{1,4})(?:&|$)/.exec(query)?.[1];
    if (from !== undefined && Number(from) !== mode.at.length) mode.from = Number(from);
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
      if (mode.sid && mode.cid && mode.at?.length) return `#/train/${mode.sid}/${mode.cid}${atQuery(mode.at)}`;
      return mode.sid ? `#/train/${mode.sid}` : '#/train';
    case 'learn':
      return `#/learn/${mode.sid}/${mode.cid}`;
    case 'show':
      return mode.sid ? `#/show/${mode.sid}` : '#/show';
    case 'mistakes':
      return '#/mistakes';
    case 'practice':
      return PRACTICE_HASH[mode.run];
    case 'coverage':
      return `#/coverage/${mode.sid}`;
    case 'games':
      return mode.id ? `#/games/${mode.id}${mode.ply !== undefined ? `?ply=${mode.ply}` : ''}` : '#/games';
    case 'gamesReview':
      return '#/games/review';
    case 'migrate':
      return '#/migrate';
    case 'playOn':
      return `#/practice?fen=${encodeURIComponent(mode.fen)}${mode.side ? `&side=${mode.side}` : ''}`;
    case 'history':
      return `#/games/history/${mode.id}`;
    case 'storm':
      return `#/storm${mode.sid ? `/${mode.sid}${mode.cid ? `/${mode.cid}${atQuery(mode.at)}` : ''}` : ''}`;
    case 'analysis': {
      const q = [
        ...(mode.fen ? [`fen=${encodeURIComponent(mode.fen)}`] : []),
        ...(mode.from ? [`from=${mode.from.sid}/${mode.from.cid}`, ...(mode.from.at.length ? [`at=${mode.from.at.map(encodeURIComponent).join(',')}`] : [])] : []),
        ...(mode.seq ? [`seq=${mode.seq}`] : []),
      ];
      return `#/analysis${q.length ? `?${q.join('&')}` : ''}`;
    }
    case 'chapter':
      return `#/study/${mode.sid}${mode.cid ? `/${mode.cid}` : ''}${atQuery(mode.at)}`;
    case 'read':
    case 'play': {
      const query = atQuery(mode.at);
      const from = mode.from === undefined || mode.from === mode.at.length ? '' : `${query ? '&' : '?'}from=${mode.from}`;
      return `#/${mode.name}/${mode.sid}/${mode.cid}${query}${from}`;
    }
  }
}
