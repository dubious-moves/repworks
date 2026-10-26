// The app's modes (PLAN.md §4.11): one explicit state instead of boolean flags. Each mode has an
// address in the hash, since GitHub Pages has no SPA fallback (§4.1):
//   #/                                  the study list
//   #/import                            import a study
//   #/conflicts                         every open conflict
//   #/study/<sid>[/<cid>][?at=e4,e5]    a chapter, at a move
//   #/train[/<sid>]                     training: the whole repertoire, or one study (§5.7)
//   #/train/<sid>/<cid>?at=e4,e5        one line picked from the training list (§5.16)
//   #/train/<sid>/<cid>?at=e4,e5&pick   the line through a study's move, selected, not started (§5.83)
//   #/learn/<sid>/<cid>                 a chapter's new lines, past the daily limit (§5.16)
//   #/show[/<sid>]                      show and grade, by two keys (§5.9)
//   #/ideas[/<sid>]                     idea cards (§5.128): today's, of every idea deck or one study
//   #/difficult                         the lines through difficult moves, overstudied: only due moves graded (§5.124)
//   #/mistakes                          the day's mistakes and the pins (§5.8)
//   #/mistakes/retry, #/mistakes/drill  the day's mistakes retried, or drilled
//   #/pinned, #/pinned/all              the pins due, or every pin, drilled
//   #/read/<sid>/<cid>[?at=e4,e5][&from=1]  a chapter's line read through, from a move (§5.10)
//   #/play/<sid>/<cid>[?at=e4,e5][&from=1]  the same line played, every own move asked (§5.10)
//   #/coverage/<sid>                    a study's coverage against the repertoire, or a reference study's against it (§5.26)
//   #/analysis[?fen=…][&from=<sid>/<cid>&at=e4,e5][&seq=<pid>|*][&line=e5,Nf3&show=1][&back=…]
//                                       the analysis board: a scratch chapter, from a FEN or a
//                                       chapter's move (§5.35); `seq` saves its lines as a sequence
//                                       (§5.56); `line` its main line from the FEN, shown after
//                                       `show` moves; `side` the board's side (the FEN's side to
//                                       move when none); `back` the page it was opened from (its
//                                       hash): a storm, a training session, a game…
//   #/storm[/<sid>[/<cid>[?at=e4,e5]]]  the storm (§5.43): the repertoire, a study, a chapter, or
//                                       the lines through a chapter's move
//   #/games                             the games and their cards (§5.54)
//   #/games/<id>[?ply=n]                one game, at a ply
//   #/games/review                      the game cards due, as a session (§5.55)
//   #/games/history/<id>                a practice game's review, from the history (§5.57)
//   #/practice?fen=…[&side=black]       playing on from a position (§5.57), as the side given
//                                       (the side to move when none)
//   #/repertoire-check                  deviations, gaps and weak spots from the games (§5.58–§5.60)
//   #/progress                          what the log says of the training: recall, chapters, misses, workload (§5.122)
//   #/checklist[?sid=<sid>&side=black]  the variation checklists, every study's (§5.130), one unfolded
//   #/checklist/<sid>?side=black&line=e2e4,c7c5&preset=easy
//                                       a checklist line's drill at a difficulty (§5.62), the line by
//                                       its moves (§5.130); the old #/checklist/<sid>/<n> opens the list
//   #/migrate                           the migration from mistake-lab (§5.64)
// A setup link (#setup?…) is read and removed before any of this (src/app/setup.ts).
import { isId } from '../study/ids.ts';

/** The storm (§5.43): over the repertoire, a study, a chapter, or the lines through `at`. */
export type StormMode = { name: 'storm'; sid?: string; cid?: string; at?: string[] };

export type Mode =
  | { name: 'list' }
  | { name: 'import' }
  | { name: 'conflicts' }
  /** A study's chapter; without `cid`, its first. `at` is a move path, [] the start. */
  | { name: 'chapter'; sid: string; cid?: string; at?: string[] }
  /**
   * A training session: the whole repertoire, or one study's lines; with `cid` and `at`, the one
   * line of that chapter whose moves are `at`, picked from the list (§5.16). With `pick`, `at` is
   * a move of the chapter ([] its start) and its line is selected, waiting to be started (§5.83).
   */
  | { name: 'train'; sid?: string; cid?: string; at?: string[]; pick?: true }
  /** A chapter's lines still holding new moves, learned past the daily limit (§5.16). */
  | { name: 'learn'; sid: string; cid: string }
  /** Show and grade (§5.9): the same queue, run with two keys. */
  | { name: 'show'; sid?: string }
  /** Difficult lines (§5.124): the lines through difficult moves; only their due moves graded. */
  | { name: 'difficult' }
  /** Idea cards (§5.128): today's, of every idea deck or one study. */
  | { name: 'ideas'; sid?: string }
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
  | { name: 'analysis'; fen?: string; from?: { sid: string; cid: string; at: string[] }; seq?: string; line?: string[]; show?: number; side?: 'white' | 'black'; back?: BackMode }
  /** The storm (§5.43): over the repertoire, a study, a chapter, or the lines through `at`. */
  | StormMode
  /** The games (§5.54); with `id`, one game, at `ply` (0 the start). */
  | { name: 'games'; id?: string; ply?: number }
  /** The game cards due, as a session (§5.55). */
  | { name: 'gamesReview' }
  /** The migration from mistake-lab (§5.64). */
  | { name: 'migrate' }
  /** Playing on from a position (§5.57), as `side` (the side to move when none). */
  | { name: 'playOn'; fen: string; side?: 'white' | 'black' }
  /** A practice game's review, reopened from the history (§5.57). */
  | { name: 'history'; id: string }
  /** What the games say about the repertoire (§5.58–§5.60). */
  | { name: 'repCheck' }
  /** What the log says of the training (§5.122). */
  | { name: 'progress' }
  /** The variation checklists (§5.130): every repertoire study's, with `sid` (and `side`) unfolded. */
  | { name: 'checklists'; sid?: string; side?: 'white' | 'black' }
  /** A checklist line of a study's side, by its moves from the start (UCI), drilled at a preset (§5.62, §5.130). */
  | { name: 'checklist'; sid: string; side: 'white' | 'black'; line: string[]; preset: 'easy' | 'medium' | 'hard' };

/** A page the analysis board was opened from and goes back to: any but the board itself. */
export type BackMode = Exclude<Mode, { name: 'analysis' }>;

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

/**
 * Which page a mode is, for the app's ← (the owner's request, 2026-10-08): it goes back to the page
 * before, past the entries of this one. A study's chapters are one page, and so are training's
 * sessions and lines, the storm's scopes, the analysis board's positions and a chapter's line read
 * or played from any move.
 */
export function pageOf(mode: Mode): string {
  switch (mode.name) {
    case 'chapter':
      return `study ${mode.sid}`;
    case 'train':
    case 'learn':
    case 'show':
    case 'difficult':
      return 'train';
    case 'read':
    case 'play':
      return `${mode.name} ${mode.sid}/${mode.cid}`;
    case 'games':
      return mode.id ? `game ${mode.id}` : 'games';
    case 'history':
      return `history ${mode.id}`;
    case 'coverage':
      return `coverage ${mode.sid}`;
    default:
      return mode.name;
  }
}

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
/** The longest line the analysis board's address takes: a training line from its chapter's start. */
const MAX_LINE = 300;
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
    if (name === 'train' && parts.length === 3 && isId(parts[1]) && isId(parts[2]) && at && query.split('&').includes('pick')) return { name, sid: parts[1], cid: parts[2], at, pick: true };
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
  if (parts.length === 1 && parts[0] === 'repertoire-check') return { name: 'repCheck' };
  if (parts.length === 1 && parts[0] === 'progress') return { name: 'progress' };
  if (parts[0] === 'checklist') {
    const side = /(?:^|&)side=(white|black)(?:&|$)/.exec(query)?.[1] as 'white' | 'black' | undefined;
    if (parts.length === 1) {
      const sid = /(?:^|&)sid=([^&]+)/.exec(query)?.[1];
      return sid && isId(sid) ? { name: 'checklists', sid, ...(side ? { side } : {}) } : { name: 'checklists' };
    }
    // A drill's old address named the line by its place in a list kept on the device: the list now.
    if (parts.length === 3 && isId(parts[1]) && /^\d{1,3}$/.test(parts[2]!)) return { name: 'checklists', sid: parts[1] };
    const line = /(?:^|&)line=([a-h1-8qrbn,]+)(?:&|$)/.exec(query)?.[1]?.split(',');
    if (parts.length === 2 && isId(parts[1]) && side && line?.length && line.every((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) {
      const preset = /(?:^|&)preset=(easy|medium|hard)(?:&|$)/.exec(query)?.[1] as 'easy' | 'medium' | 'hard' | undefined;
      return { name: 'checklist', sid: parts[1], side, line, preset: preset ?? 'easy' };
    }
    return { name: 'checklists' };
  }
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
    const line = query.split('&').find((q) => q.startsWith('line='))?.slice(5);
    const sans = line ? line.split(',').map(decode) : undefined;
    if (sans && sans.length <= MAX_LINE && sans.every((san) => san !== undefined && SAN.test(san))) {
      mode.line = sans as string[];
      const show = /(?:^|&)show=(\d{1,3})(?:&|$)/.exec(query)?.[1];
      if (show !== undefined && Number(show) < sans.length) mode.show = Number(show);
    }
    const side = /(?:^|&)side=(white|black)(?:&|$)/.exec(query)?.[1];
    if (side === 'white' || side === 'black') mode.side = side;
    const back = query.split('&').find((q) => q.startsWith('back='))?.slice(5);
    const to = back === undefined ? undefined : decode(back);
    // Any page of the app's but the board itself, and not the list a hash it can't read becomes.
    const parsed = to?.startsWith('#/') && !to.startsWith('#/analysis') ? parseHash(to) : undefined;
    if (parsed && parsed.name !== 'analysis' && (parsed.name !== 'list' || /^#\/?$/.test(to!))) mode.back = parsed;
    return mode;
  }
  if (parts[0] === 'difficult' && parts.length === 1) return { name: 'difficult' };
  if (parts[0] === 'ideas' && parts.length === 1) return { name: 'ideas' };
  if (parts[0] === 'ideas' && parts.length === 2 && isId(parts[1])) return { name: 'ideas', sid: parts[1] };
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
      if (mode.sid && mode.cid && mode.pick) return `#/train/${mode.sid}/${mode.cid}?at=${(mode.at ?? []).map(encodeURIComponent).join(',')}&pick`;
      if (mode.sid && mode.cid && mode.at?.length) return `#/train/${mode.sid}/${mode.cid}${atQuery(mode.at)}`;
      return mode.sid ? `#/train/${mode.sid}` : '#/train';
    case 'learn':
      return `#/learn/${mode.sid}/${mode.cid}`;
    case 'show':
      return mode.sid ? `#/show/${mode.sid}` : '#/show';
    case 'difficult':
      return '#/difficult';
    case 'ideas':
      return mode.sid ? `#/ideas/${mode.sid}` : '#/ideas';
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
    case 'repCheck':
      return '#/repertoire-check';
    case 'progress':
      return '#/progress';
    case 'checklists':
      return mode.sid ? `#/checklist?sid=${mode.sid}${mode.side ? `&side=${mode.side}` : ''}` : '#/checklist';
    case 'checklist':
      return `#/checklist/${mode.sid}?side=${mode.side}&line=${mode.line.join(',')}&preset=${mode.preset}`;
    case 'storm':
      return `#/storm${mode.sid ? `/${mode.sid}${mode.cid ? `/${mode.cid}${atQuery(mode.at)}` : ''}` : ''}`;
    case 'analysis': {
      const q = [
        ...(mode.fen ? [`fen=${encodeURIComponent(mode.fen)}`] : []),
        ...(mode.from ? [`from=${mode.from.sid}/${mode.from.cid}`, ...(mode.from.at.length ? [`at=${mode.from.at.map(encodeURIComponent).join(',')}`] : [])] : []),
        ...(mode.seq ? [`seq=${mode.seq}`] : []),
        ...(mode.line?.length ? [`line=${mode.line.map(encodeURIComponent).join(',')}`, ...(mode.show !== undefined && mode.show < mode.line.length ? [`show=${mode.show}`] : [])] : []),
        ...(mode.side ? [`side=${mode.side}`] : []),
        ...(mode.back ? [`back=${encodeURIComponent(modeHash(mode.back))}`] : []),
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
