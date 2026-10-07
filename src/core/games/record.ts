// A game as the site keeps it (PLAN.md §5.50): compact, whatever its source. Read from
// mistake-lab's analyzer (Lichess's game JSON with `analysis` from the analyzer or from Lichess,
// clocks in seconds once stamped, the analyzer's `tactics`, chess.com games as the analyzer
// normalizes them) and from Lichess's own export (clocks in centiseconds). Pure.

export type Color = 'white' | 'black';
export type Platform = 'lichess' | 'chesscom';

/** An evaluation after a ply, White-relative: centipawns, or a mate in `mate` (negative: Black mates). */
export type Eval = { cp: number } | { mate: number };

/** One move of a tactic's line, as the analyzer found it. */
export interface TacticMove {
  uci: string;
  san: string;
  /** The user's move (the solver's), else the opponent's reply. */
  user: boolean;
  /** `maia` for an opponent's move from Maia's human-like line. */
  source?: 'maia';
}

/** A tactic the analyzer found in the game (its `scanGameForTactics`). */
export interface Tactic {
  /** The ply of its first move (1-based, as the analyzer's `startPly`). */
  startPly: number;
  fenBefore: string;
  color: Color;
  /** The main line first, then the alternative lines. */
  lines: TacticMove[][];
  wpSwing: number;
  found: boolean;
  evalBefore?: Eval;
  evalAfter?: Eval;
}

export interface GamePlayer {
  name: string;
  id: string;
  rating?: number;
}

export interface GameRecord {
  id: string;
  platform: Platform;
  /** When the game was played (ms since the epoch). */
  createdAt: number;
  /** bullet, blitz, rapid, classical, correspondence (or what the source says). */
  speed: string;
  rated: boolean;
  /** The user's side. */
  color: Color;
  white: GamePlayer;
  black: GamePlayer;
  winner?: Color;
  /** How it ended: mate, resign, outoftime, draw, stalemate, … (Lichess's words). */
  status: string;
  opening?: string;
  /** The start position when it isn't the standard one. */
  initialFen?: string;
  /** The moves in SAN. */
  moves: string[];
  /** The evaluation after each ply; absent when the game is not analysed. */
  evals?: (Eval | null)[];
  /** The time left after each ply, in seconds. */
  clocks?: (number | null)[];
  tactics?: Tactic[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function evalOf(v: unknown): Eval | null {
  if (!isObj(v)) return null;
  const cp = num(v['eval']);
  if (cp !== undefined) return { cp };
  const mate = num(v['mate']);
  if (mate !== undefined) return { mate };
  return null;
}

function player(v: unknown): GamePlayer {
  const p = isObj(v) ? v : {};
  const user = isObj(p['user']) ? p['user'] : {};
  const name = str(user['name']) ?? str(p['name']) ?? 'Anonymous';
  const out: GamePlayer = { name, id: (str(user['id']) ?? name).toLowerCase() };
  const rating = num(p['rating']);
  if (rating !== undefined) out.rating = rating;
  return out;
}

/**
 * The user's side, by mistake-lab's `detectPlayerColor`: a known name or id on exactly one side
 * decides; else the analyzer's `_playerColor`; else white.
 */
export function userColor(white: GamePlayer, black: GamePlayer, usernames: ReadonlySet<string>, stamped?: unknown): Color {
  const w = usernames.has(white.name.toLowerCase()) || usernames.has(white.id);
  const b = usernames.has(black.name.toLowerCase()) || usernames.has(black.id);
  if (w && !b) return 'white';
  if (b && !w) return 'black';
  if (stamped === 'white' || stamped === 'black') return stamped;
  return 'white';
}

function pgnTag(pgn: string | undefined, tag: string): string | undefined {
  if (!pgn) return undefined;
  return new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`).exec(pgn)?.[1];
}

function tacticOf(v: unknown, fallback: Color): Tactic | undefined {
  if (!isObj(v)) return undefined;
  const startPly = num(v['startPly']);
  const fenBefore = str(v['fenBefore']);
  if (startPly === undefined || !fenBefore || !Array.isArray(v['moves'])) return undefined;
  const line = (moves: unknown): TacticMove[] | undefined => {
    if (!Array.isArray(moves)) return undefined;
    const out: TacticMove[] = [];
    for (const m of moves) {
      if (!isObj(m) || !str(m['uci'])) return undefined;
      const tm: TacticMove = { uci: m['uci'] as string, san: str(m['san']) ?? '', user: m['isUser'] === true };
      if (m['source'] === 'maia') tm.source = 'maia';
      out.push(tm);
    }
    return out;
  };
  const main = line(v['moves']);
  if (!main) return undefined;
  const lines = [main];
  if (Array.isArray(v['alternativeLines'])) for (const alt of v['alternativeLines']) {
    const l = line(alt);
    if (l) lines.push(l);
  }
  const color = v['playerColor'] === 'white' || v['playerColor'] === 'black' ? v['playerColor'] : fallback;
  const t: Tactic = { startPly, fenBefore, color, lines, wpSwing: num(v['wpSwing']) ?? 0, found: v['found'] === true };
  const before = evalOf(v['evalBefore']);
  if (before) t.evalBefore = before;
  const after = evalOf(v['evalAfter']);
  if (after) t.evalAfter = after;
  return t;
}

export type ReadGame = { ok: true; game: GameRecord } | { ok: false; error: string };

/**
 * A game from mistake-lab's games file (`mistakelab_games.json`'s `games[]`, or the analyzer's
 * `analyzed_games.json`) or from Lichess's export (one NDJSON line). `clocks` are read as seconds
 * when the analyzer stamped them (`_clocksStamped`), else as Lichess's centiseconds.
 */
export function readGame(v: unknown, usernames: ReadonlySet<string>): ReadGame {
  if (!isObj(v)) return { ok: false, error: 'not an object' };
  const id = str(v['id']);
  if (!id) return { ok: false, error: 'no id' };
  if (v['variant'] !== undefined && v['variant'] !== 'standard' && v['variant'] !== 'fromPosition') return { ok: false, error: `${id}: variant ${String(v['variant'])}` };
  const movesText = str(v['moves']);
  if (movesText === undefined) return { ok: false, error: `${id}: no moves` };
  const moves = movesText.split(' ').filter(Boolean);
  const players = isObj(v['players']) ? v['players'] : {};
  const white = player(players['white']);
  const black = player(players['black']);
  const pgn = str(v['pgn']);
  const chesscom = v['_source'] === 'chesscom' || id.startsWith('chesscom_');

  let winner: Color | undefined;
  if (v['winner'] === 'white' || v['winner'] === 'black') winner = v['winner'];
  else {
    const result = pgnTag(pgn, 'Result');
    if (result === '1-0') winner = 'white';
    else if (result === '0-1') winner = 'black';
  }
  if (white.rating === undefined) {
    const r = Number(pgnTag(pgn, 'WhiteElo'));
    if (r > 0) white.rating = r;
  }
  if (black.rating === undefined) {
    const r = Number(pgnTag(pgn, 'BlackElo'));
    if (r > 0) black.rating = r;
  }
  let status = str(v['status']) ?? '';
  if (!status && pgn) {
    const termination = pgnTag(pgn, 'Termination') ?? '';
    if (/on time/i.test(termination)) status = 'outoftime';
    else if (/checkmate/i.test(termination)) status = 'mate';
    else if (/resign/i.test(termination)) status = 'resign';
    else if (/drawn|stalemate|repetition|agreement|insufficient/i.test(termination)) status = 'draw';
    else status = termination ? 'other' : '';
  }
  // mistake-lab's time-loss rule also reads the PGN's Termination (its advantage exclusion).
  if (status !== 'outoftime' && pgn && /\[Termination\s+"[^"]*on time[^"]*"\]/i.test(pgn)) status = 'outoftime';

  const game: GameRecord = {
    id,
    platform: chesscom ? 'chesscom' : 'lichess',
    createdAt: num(v['createdAt']) ?? 0,
    speed: str(v['speed']) ?? 'unknown',
    // mistake-lab reads a missing `rated` as rated (`rated !== false`).
    rated: v['rated'] !== false,
    color: userColor(white, black, usernames, v['_playerColor']),
    white,
    black,
    status,
    moves,
  };
  if (winner) game.winner = winner;
  const opening = isObj(v['opening']) ? str(v['opening']['name']) : undefined;
  if (opening) game.opening = opening;
  const initialFen = str(v['initialFen']);
  if (initialFen) game.initialFen = initialFen;
  if (Array.isArray(v['analysis']) && v['analysis'].length > 0) game.evals = v['analysis'].map(evalOf);
  if (Array.isArray(v['clocks']) && v['clocks'].length > 0) {
    const seconds = v['_clocksStamped'] === true;
    game.clocks = v['clocks'].map((c) => {
      const n = num(c);
      return n === undefined ? null : seconds ? n : Math.round(n / 10) / 10;
    });
  }
  if (Array.isArray(v['tactics'])) {
    const tactics = v['tactics'].map((t) => tacticOf(t, game.color)).filter((t): t is Tactic => t !== undefined);
    if (tactics.length) game.tactics = tactics;
  }
  return { ok: true, game };
}

/** The usernames a games file names (mistake-lab's v2 `usernames[]`, or v1's `username`), lowercased. */
export function fileUsernames(file: unknown): string[] {
  if (!isObj(file)) return [];
  if (Array.isArray(file['usernames'])) return file['usernames'].filter((u): u is string => typeof u === 'string').map((u) => u.toLowerCase());
  const one = str(file['username']);
  return one ? [one.toLowerCase()] : [];
}

/** Every game of a games file; the ones that can't be read are listed, not fatal. */
export function readGamesFile(file: unknown, extraNames: readonly string[] = []): { games: GameRecord[]; problems: string[] } {
  const games: GameRecord[] = [];
  const problems: string[] = [];
  if (!isObj(file) || !Array.isArray(file['games'])) return { games, problems: ['not a games file: no games[]'] };
  const names = new Set([...fileUsernames(file), ...extraNames.map((n) => n.toLowerCase())]);
  for (const g of file['games']) {
    const read = readGame(g, names);
    if (read.ok) games.push(read.game);
    else problems.push(read.error);
  }
  return { games, problems };
}

/** The game's result for the user: win, loss or draw. */
export function resultFor(game: GameRecord): 'win' | 'loss' | 'draw' {
  if (!game.winner) return 'draw';
  return game.winner === game.color ? 'win' : 'loss';
}

/** Whether the game has an evaluation for its plies. */
export const isAnalysed = (game: GameRecord) => (game.evals?.length ?? 0) > 0;
