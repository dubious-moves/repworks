// The storm's numbers (PLAN.md §5.39–§5.48), carried from lichessable's `CONFIG.storm` as it
// shipped (`b435906`): every one of them was measured there (DESIGN-intuition-storm.md §6, §16,
// §17, §19, §23, §26; DESIGN-storm-puzzles.md §3), so they are ported, not re-tuned. Centipawns
// are the mover's unless a name says otherwise; win% is points of winning chance (0–100).

export interface StormConfig {
  /** A line shorter than this has no repertoire to be at the frontier of. */
  minVarPlies: number;
  /** The user's eval at the frontier and at an offered position, centipawns (§7, §5.2). */
  userLoCp: number;
  userHiCp: number;
  /** Offered from this many plies past the line's end… */
  minPly: number;
  /** …up to this many (the walk's length). Both are settings (§14.9). */
  maxPly: number;
  minPlyMax: number;
  maxPlyMin: number;
  maxPlyMax: number;
  /** A move this far behind the best, by either side, ends a game's walk (§5.1). */
  blunderCp: number;
  /** |eval| beyond this and "find the good move" means nothing. */
  decidedCp: number;
  /** Moves scored at a position, at least (§3.3). */
  minScored: number;
  /** best − 5th at least this: something to get wrong (§5.2). */
  spreadMinCp: number;
  /** best − 2nd at most this: not a one-move tactic. */
  spreadMaxCp: number;
  /** The bands, in win% given up (§16.2): under great, good, ok, bad; blunder from badWp. */
  greatWp: number;
  goodWp: number;
  okWp: number;
  badWp: number;
  greatPoints: number;
  goodPoints: number;
  badPoints: number;
  blunderPoints: number;
  /** Lichess's fit for win% from centipawns, and the clamp that makes mates ordinary (§16.1). */
  wpK: number;
  wpClampCp: number;
  /** The streak multiplies by one more every `streakStep` answers, up to `streakMax`. */
  streakStep: number;
  streakMax: number;
  /** A mate as centipawns, less its distance (the engine tier, §14.8). */
  engineMateCp: number;
  /** The invented line (§14.10): among the top N moves within this of the best, this long at least. */
  randomTopN: number;
  randomTopCp: number;
  randomMinPlies: number;
  /**
   * Games walked from a frontier: in a session, and in a gather (§14.17.3) — there one at every
   * line end first, the rest in a second pass, so a gather stopped early has every line end's.
   */
  gamesPerFrontier: number;
  gatherGamesPerFrontier: number;
  /** The relaxed explorer filter (§6.4): any human game rather than one at the user's rating. */
  speeds: readonly string[];
  ratings: readonly number[];
  /** Uncovered replies (§19): a share and a count at least, so many per position. */
  uncMinShare: number;
  uncMinGames: number;
  uncMaxPerPosition: number;
  /** The timed storm (§8.2): its length, the verdict's time, the fast one, the amber clock. */
  sessionMs: number;
  verdictMs: number;
  verdictFastMs: number;
  lowTimeMs: number;
  /** The set (§17, §18.3). */
  setSize: number;
  setRetryMax: number;
  setCleanOn: readonly Band[];
  /** Answers that retire a position, and for how long (§14.11, §14.16). */
  storeDropOn: readonly Band[];
  goneDays: number;
  storeMax: number;
  /** Cards kept ready while the user thinks (§8.3). */
  queueTarget: number;
  /** The reach buckets' top (§14.19): 10^top games and more, and unknown. */
  reachTop: number;
  /** Line ends dealt recently, preferred against in the next sessions (§30b). */
  recentLines: number;
  /** Stockfish in the walk, the deepened standard and the grade (§23, §26, §14.23). */
  walkDepth: number;
  walkMultipv: number;
  deepenDepth: number;
  deepenMultipv: number;
  engineDepth: { desktop: number; mobile: number };
  enginePhaseMs: number;
  /** Puzzles (DESIGN-storm-puzzles.md §3): the anchor band, the ratings, per anchor, the drop list. */
  puzzleAnchorMinPly: number;
  puzzleAnchorMaxPly: number;
  puzzleRatingMin: number;
  puzzleRatingMax: number;
  puzzlesPerAnchor: number;
  puzzleDropOn: readonly Band[];
}

/** A move's verdict (§16.2), `unknown` when nothing could grade it. */
export type Band = 'great' | 'good' | 'ok' | 'bad' | 'blunder' | 'unknown';
export const BANDS: readonly Band[] = ['great', 'good', 'ok', 'bad', 'blunder', 'unknown'];

export const STORM: StormConfig = {
  minVarPlies: 4,
  userLoCp: -100,
  userHiCp: 200,
  minPly: 2,
  maxPly: 16,
  minPlyMax: 8,
  maxPlyMin: 4,
  maxPlyMax: 24,
  blunderCp: 150,
  decidedCp: 250,
  minScored: 6,
  spreadMinCp: 60,
  spreadMaxCp: 300,
  greatWp: 3,
  goodWp: 6,
  okWp: 10,
  badWp: 20,
  greatPoints: 2,
  goodPoints: 1,
  badPoints: -1,
  blunderPoints: -2,
  wpK: 0.00368208,
  wpClampCp: 1000,
  streakStep: 4,
  streakMax: 4,
  engineMateCp: 10000,
  randomTopN: 4,
  randomTopCp: 40,
  randomMinPlies: 2,
  gamesPerFrontier: 2,
  gatherGamesPerFrontier: 4,
  speeds: ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'],
  ratings: [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500],
  uncMinShare: 3,
  uncMinGames: 20,
  uncMaxPerPosition: 4,
  sessionMs: 3 * 60 * 1000,
  verdictMs: 2600,
  verdictFastMs: 1200,
  lowTimeMs: 30000,
  setSize: 6,
  setRetryMax: 3,
  setCleanOn: ['great', 'good'],
  storeDropOn: ['great', 'good'],
  goneDays: 60,
  storeMax: 900,
  queueTarget: 3,
  reachTop: 4,
  recentLines: 24,
  walkDepth: 14,
  walkMultipv: 6,
  deepenDepth: 20,
  deepenMultipv: 12,
  engineDepth: { desktop: 20, mobile: 18 },
  enginePhaseMs: 8000,
  puzzleAnchorMinPly: 12,
  puzzleAnchorMaxPly: 24,
  puzzleRatingMin: 1200,
  puzzleRatingMax: 2600,
  puzzlesPerAnchor: 200,
  puzzleDropOn: ['great', 'good'],
};

/** The config with the user's ply range folded in (§14.9): the walks never learn a setting exists. */
export function withPlyRange(c: StormConfig, minPly: number, maxPly: number): StormConfig {
  const lo = Math.max(1, Math.min(c.minPlyMax, Math.round(minPly)));
  const hi = Math.max(c.maxPlyMin, Math.min(c.maxPlyMax, Math.round(maxPly)));
  return { ...c, minPly: lo, maxPly: Math.max(lo, hi) };
}
