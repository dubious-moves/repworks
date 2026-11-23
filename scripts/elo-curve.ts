#!/usr/bin/env node
// How a game's result follows its two ratings on Lichess, against Elo's curve, as a report (PLAN.md
// §5.126, "Lichess's curve"): the factor `k` in `1 / (1 + 10^(−k·gap/400))` fitted per rating band,
// which `ELO_SLOPE` in src/core/explorer/equal.ts holds. Nothing is written.
//
//   node scripts/elo-curve.ts <dump.pgn.zst | dump.pgn | -> [--max N] [--json]
//
// The dump: database.lichess.org/standard/lichess_db_standard_rated_<YYYY-MM>.pgn.zst, or its first
// 400 MB (`curl -r 0-400000000 -o part.pgn.zst <url>`: about 1.4 million games, a minute to read).
// The games are the explorer's (lila-openingexplorer's pgn_to_parquet, read 2026-11-23): finished,
// both ratings given, no bot; provisional ratings kept, as there. Each is filed under the band of
// its two ratings' midpoint and its speed by Lichess's estimate (base + 40 × increment), as there.
// The fit is White's score (draws ½) against `a + k·c·gap` on the logistic curve, `a` White's edge,
// over the games within 150 points (the gaps the explorer's rows show are tens of points), with its
// standard error; and, binned, the score above an even game against what Elo's curve predicts.
import { dumpLines, gamesOf } from './maia-eval-lib.ts';

const BANDS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;
const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical'] as const;
/** Elo's slope at an even game, per point, on the logistic's scale. */
const C = Math.LN10 / 400;
const WITHIN = 150;

export const bandOf = (midpoint: number): number => [...BANDS].reverse().find((b) => midpoint >= b) ?? BANDS[0];

/** Lichess's speed from a TimeControl tag ("600+5"); undefined for correspondence ("-"). */
export function speedOf(tc: string): string | undefined {
  const m = /^(\d+)\+(\d+)$/.exec(tc);
  if (!m) return undefined;
  const t = Number(m[1]) + 40 * Number(m[2]);
  return t < 30 ? 'ultraBullet' : t < 180 ? 'bullet' : t < 480 ? 'blitz' : t < 1500 ? 'rapid' : 'classical';
}

interface Game {
  gap: number;
  score: number;
}

export interface Fit {
  games: number;
  /** The slope against Elo's: 1 is Elo's curve. */
  k: number;
  se: number;
  /** White's edge in an even game, in points of score. */
  white: number;
}

/** White's score against `a + k·C·gap` by Newton's method, draws as halves (quasi-binomial standard error). */
export function fitSlope(games: readonly Game[]): Fit {
  const xs = games.filter((g) => Math.abs(g.gap) <= WITHIN);
  let a = 0;
  let b = 0;
  const sums = () => {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0, rss = 0;
    for (const { gap, score } of xs) {
      const x = gap / 100;
      const p = 1 / (1 + Math.exp(-(a + b * x)));
      const w = p * (1 - p);
      g0 += score - p;
      g1 += (score - p) * x;
      h00 += w;
      h01 += w * x;
      h11 += w * x * x;
      rss += (score - p) ** 2;
    }
    return { g0, g1, h00, h01, h11, rss };
  };
  for (let i = 0; i < 25; i++) {
    const s = sums();
    const det = s.h00 * s.h11 - s.h01 * s.h01;
    if (!(det > 0)) break;
    a += (s.h11 * s.g0 - s.h01 * s.g1) / det;
    b += (s.h00 * s.g1 - s.h01 * s.g0) / det;
  }
  const s = sums();
  const phi = s.rss / s.h00;
  const seB = Math.sqrt((phi * s.h00) / (s.h00 * s.h11 - s.h01 * s.h01));
  return { games: xs.length, k: b / 100 / C, se: seB / 100 / C, white: (1 / (1 + Math.exp(-a)) - 0.5) * 100 };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--') && a !== String(Number(a)));
  if (!path) throw new Error('usage: node scripts/elo-curve.ts <dump.pgn.zst | dump.pgn | -> [--max N] [--json]');
  const maxAt = args.indexOf('--max');
  const max = maxAt >= 0 ? Number(args[maxAt + 1]) : Infinity;
  const groups = new Map<string, Game[]>();
  const add = (key: string, g: Game) => {
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(g);
  };
  let n = 0;
  for await (const g of gamesOf(dumpLines(path))) {
    const h = g.headers;
    if (h.WhiteTitle === 'BOT' || h.BlackTitle === 'BOT') continue;
    const score = h.Result === '1-0' ? 1 : h.Result === '0-1' ? 0 : h.Result === '1/2-1/2' ? 0.5 : undefined;
    const w = Number(h.WhiteElo);
    const b = Number(h.BlackElo);
    const speed = speedOf(h.TimeControl ?? '');
    if (score === undefined || !(w > 0 && b > 0) || !speed || speed === 'ultraBullet' || !/\d\.\s*\S+\s+\S/.test(g.moves)) continue;
    const band = bandOf((w + b) / 2);
    const game = { gap: w - b, score };
    add(`${speed} ${band}`, game);
    add(`all ${band}`, game);
    add(`${speed} all`, game);
    add('all all', game);
    if (++n >= max) break;
  }
  const fits = new Map([...groups].filter(([, gs]) => gs.length >= 2000).map(([key, gs]) => [key, fitSlope(gs)] as const));
  if (args.includes('--json')) {
    console.log(JSON.stringify({ games: n, fits: Object.fromEntries(fits) }, null, 2));
    return;
  }
  console.log(`${n.toLocaleString('en-US')} games. k: the slope against Elo's curve (1 = Elo's), over gaps within ${WITHIN} points.\n`);
  const cell = (key: string) => {
    const f = fits.get(key);
    return (f ? `${f.k.toFixed(2)} ±${f.se.toFixed(2)}` : '–').padStart(12);
  };
  console.log(`${'band'.padEnd(6)}${['all', ...SPEEDS].map((s) => s.padStart(12)).join('')}${'games'.padStart(10)}`);
  for (const band of [...BANDS, 'all'] as const) {
    console.log(`${String(band).padEnd(6)}${['all', ...SPEEDS].map((s) => cell(`${s} ${band}`)).join('')}${String(groups.get(`all ${band}`)?.length ?? 0).padStart(10)}`);
  }
  const all = groups.get('all all') ?? [];
  console.log('\nThe score above an even game, all games (points): real against Elo’s');
  const at = (lo: number, hi: number) => {
    const xs = all.filter((g) => g.gap >= lo && g.gap < hi);
    return { n: xs.length, score: xs.reduce((t, g) => t + g.score, 0) / xs.length, gap: xs.reduce((t, g) => t + g.gap, 0) / xs.length };
  };
  const even = at(-12.5, 12.5);
  for (const c of [-200, -100, -50, -25, 25, 50, 100, 200]) {
    const bin = at(c - 12.5, c + 12.5);
    const elo = 1 / (1 + 10 ** (-bin.gap / 400)) - 0.5;
    console.log(`${String(c).padStart(5)}: ${((bin.score - even.score) * 100).toFixed(1).padStart(6)}  ${(elo * 100).toFixed(1).padStart(6)}   (${bin.n} games)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
