// The explorer's settings per device (PLAN.md §5.22–§5.24) and the worker's config made from them:
// pure, so the app (src/app/explorer.ts, which keeps them in localStorage) and the Practical report
// (scripts/practical.ts, PLAN.md §5.211) start from the same defaults and the same mapping.
import type { ExplorerConfig, ExplorerTab } from './service.ts';
import type { SortMode } from './table.ts';

/** Lichess's time controls and rating buckets, as its explorer (and Qchess's panel) offers them. */
export const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical'] as const;
export const RATINGS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

export interface ExplorerPrefs {
  /** The panel shown (Qchess's database button). */
  on: boolean;
  tab: ExplorerTab;
  /**
   * The Study tab shown (§5.162): the open study's moves here, with the games tab's (`tab`)
   * columns beside them.
   */
  study: boolean;
  sort: SortMode;
  speeds: string[];
  ratings: number[];
  /** Only games of the past 6 months (Qchess's "Only stats from past 6 months"). */
  recent: boolean;
  /** The Practical column (§5.24). */
  practical: boolean;
  /**
   * What the Score column's bars show: the games' own results, the results at equal ratings
   * (§5.126), or the prepared split (§5.24).
   */
  scoreView: ScoreView;
  /** The prepared split with the row's rating gap taken out of its games' part (§5.126). */
  preparedEqual: boolean;
  riskAversion: number;
  budget: number;
  /** q_extension's advanced options; shares in percent, as its popup has them. */
  replyThreshold: number;
  minGames: number;
  reachFloor: number;
  maxPly: number;
  ownMargin: number;
  ownMaxCandidates: number;
  prepPriorGames: number;
  /** Ask ChessDB to analyse unknown positions (D9: off). */
  analyse: boolean;
  /** A local explorer's address (§5.25), or ''. */
  local: string;
  /** The panel's height in px, as dragged by its handle; 0 for the layout's default. */
  height: number;
  /** Maia in the Practical column, once Maia is on (§5.34): thin positions filled in. */
  practicalMaia: boolean;
  /** Maia's preview beside the Lichess values (q_extension's peMaiaPreview). */
  maiaPreview: boolean;
  /** The columns hidden (the owner's notes, 2026-10-11); Move always shows, Prac is `practical`. */
  hidden: ExplorerColumn[];
}

export type ExplorerColumn = 'eval' | 'share' | 'games' | 'ml' | 'ms' | 'score';

export type ScoreView = 'games' | 'equal' | 'prepared';

// Qchess's defaults for the filter and the sort; q_extension's for the rest.
export const DEFAULT_PREFS: ExplorerPrefs = {
  on: true,
  tab: 'lichess',
  study: false,
  sort: 'eval',
  speeds: ['blitz', 'rapid', 'classical'],
  ratings: [1600, 1800, 2000, 2200, 2500],
  recent: false,
  practical: true,
  scoreView: 'games',
  preparedEqual: true,
  riskAversion: 0.05,
  budget: 60,
  replyThreshold: 3,
  minGames: 50,
  reachFloor: 2,
  maxPly: 6,
  ownMargin: 5,
  ownMaxCandidates: 3,
  prepPriorGames: 50,
  analyse: false,
  local: '',
  height: 0,
  practicalMaia: true,
  maiaPreview: true,
  hidden: [],
};

/** `YYYY-MM` six months before `now`: the page's `_sixMonthsAgoYYYYMM()`. */
export function sixMonthsAgo(now: Date): string {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function configOf(p: ExplorerPrefs, token: string, now: Date, maiaElo?: number): ExplorerConfig {
  const maia = maiaElo !== undefined && p.practicalMaia;
  return {
    token,
    filter: { speeds: [...p.speeds], ratings: [...p.ratings], ...(p.recent ? { since: sixMonthsAgo(now) } : {}) },
    local: p.local,
    analyse: p.analyse,
    budget: p.budget,
    options: {
      riskAversion: p.riskAversion,
      replyThreshold: p.replyThreshold / 100,
      minGames: p.minGames,
      reachFloor: p.reachFloor / 100,
      maxPly: p.maxPly,
      ownMargin: p.ownMargin,
      ownMaxCandidates: Math.max(1, p.ownMaxCandidates),
      prep: true,
      prepPriorGames: p.prepPriorGames,
      ...(maia ? { maia: true, maiaElo } : {}),
    },
    ...(maia ? { maiaPreview: p.maiaPreview } : {}),
  };
}
