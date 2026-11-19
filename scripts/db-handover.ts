#!/usr/bin/env node
// The stretch after a line's end, where practice's opponent plays from the explorer's games
// (PLAN.md §5.206): how long it lasts, how thin the games get before Maia takes over, how often a
// move drawn from a thin sample throws away the game, which ratings the database's moves come
// from, how many games Maia's policy is worth beside a sample (the blend's k), and what a prepared
// opponent's preference for the replies that score best buys. A report that writes nothing to the
// app or the data repo.
//
//   node scripts/db-handover.ts walks --out walks.json --walks 80 --line 10 --past 40 --seed 1
//       The explorer as the app asks it (explorer.lichess.org, a Lichess token in LICHESS_TOKEN):
//       a line of `--line` plies drawn by the games at the checklist's ranking filter (1600–2500,
//       blitz to correspondence), as a checklist's lines are the explorer's likely ones; then the
//       game on: the opponent's move drawn as Medium draws it today (1600–2499, at least 5 games
//       and 5% of the position's), the user's by Maia 2000 at 0.75, until Medium's database has
//       nothing (Maia's turn) or `--past` plies. At each of the opponent's positions the database at
//       Medium's filter (1600–2499), at 1800–2499 and at Hard's (2000+), and Maia 3 (23M, the seven
//       positions before) at 2000 and 2150. Resumable, walk by walk. One request at a time at the
//       app's 16 a minute (`--gap 3750` ms): 40 walks take about 75 minutes.
//   node scripts/db-handover.ts thin --walks walks.json
//       For each thin position (under 300 games at Medium's filter from 1800 or Hard's): the games up
//       to 2022-12 (about half; the players since are the ones to predict) and the games the explorer
//       names (eight newest, eight newest up to the split), each with its move and the player who
//       chose it. Two requests a position at the same pace.
//   node scripts/db-handover.ts score --walks walks.json --depth 14 --engines 4
//       Stockfish's score of each candidate (the databases' moves with games, Maia's of 2% or more)
//       as the position after it at depth − 1, and the best at depth: the mover's win% (the app's
//       `winPct`, as the check reads it). STOCKFISH=<native binary> for speed. Resumable.
//   node scripts/db-handover.ts report --walks walks.json [--json] [--draws 200] [--seed 1]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { parseUciMove, standardUci } from '../src/core/chess/uci.ts';
import { compactExplorer, explorerUrl, type CompactExplorer } from '../src/core/explorer/providers.ts';
import { RANK_RATINGS, RANK_SPEEDS } from '../src/core/games/checklist.ts';
import { winPct } from '../src/core/games/extract.ts';
import { moverScore } from '../src/core/games/grade.ts';
import { blendMoves, guardCandidates, maiaPick, pickExplorerMove } from '../src/core/games/practice.ts';
import { createMaiaBatch, type MaiaBatch } from '../src/core/maia/batch.ts';
import { MAIA_BEFORE } from '../src/core/maia/history.ts';
import { rng } from './maia-eval-lib.ts';
import { startEngines } from './storm/engine.ts';

const say = (s: string) => process.stderr.write(s + '\n');
const [step, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (!a.startsWith('--')) continue;
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) flags.set(a.slice(2), 'true');
  else flags.set(a.slice(2), rest[++i]!);
}
const flag = (name: string, fallback: string): string => flags.get(name) ?? fallback;
const num = (name: string, fallback: number): number => Number(flag(name, String(fallback)));
const need = (name: string): string => {
  const v = flags.get(name);
  if (!v) throw new Error(`--${name} is needed`);
  return v;
};
const fromFen = (fen: string): Position => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

/* ------------------------------------------------------------------ the filters */

/** The database at each filter measured: Medium's today, Medium's from 1800, Hard's. */
export const FILTERS = {
  mOld: { label: 'Medium today, 1600–2499', ratings: [1600, 1800, 2000, 2200] },
  mNew: { label: 'Medium from 1800, 1800–2499', ratings: [1800, 2000, 2200] },
  hard: { label: 'Hard, 2000+', ratings: [2000, 2200, 2500] },
} as const;
type FilterId = keyof typeof FILTERS;
const FILTER_IDS = Object.keys(FILTERS) as FilterId[];
const SPEEDS = [...RANK_SPEEDS];

interface Pol {
  uci: string;
  prob: number;
}
interface OppPosition {
  walk: number;
  /** Plies after the line's end (0: the opponent's first move after it). */
  past: number;
  ply: number;
  fen: string;
  answers: Record<FilterId, CompactExplorer>;
  maia: Record<'2000' | '2150', Pol[]>;
  /** The mover's win% after each candidate, and the best (Stockfish). */
  wp?: Record<string, number>;
  best?: number;
  /** Thin positions (the `thin` step): the games up to `SPLIT`, and games the explorer names with who chose what. */
  thin?: Partial<Record<FilterId, ThinCheck>>;
}
/** A game the explorer names: its id, the move played here, and the name of whoever played it. */
interface Named {
  id: string;
  uci: string;
  mover: string;
}
interface ThinCheck {
  old: CompactExplorer;
  named: Named[];
}
interface Walk {
  id: number;
  userColor: 'white' | 'black';
  line: string[];
  moves: string[];
  end: 'out-of-book' | 'cap' | 'game-over';
}
interface WalkFile {
  createdAt: string;
  options: { walks: number; line: number; past: number; seed: number };
  walks: Walk[];
  positions: OppPosition[];
}

/* ------------------------------------------------------------------ the explorer and Maia */

const cache = new Map<string, CompactExplorer>();
let requests = 0;
/** One request at a time, `--gap` ms apart (16 a minute, the app's own rate, `LICHESS_RATE`): the explorer answers 429 to more. */
let line: Promise<unknown> = Promise.resolve();
function explorer(fen: string, ratings: readonly number[]): Promise<CompactExplorer> {
  const url = explorerUrl(fen, { db: 'lichess', speeds: SPEEDS, ratings: [...ratings] });
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const next = line.then(() => ask(url));
  line = next.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, num('gap', 3750))));
  return next;
}
async function ask(url: string): Promise<CompactExplorer> {
  const hit = cache.get(url);
  if (hit) return hit;
  const out = compactExplorer(await fetchJson(url));
  cache.set(url, out);
  return out;
}
/** The explorer's answer as it comes, in the same line of requests. */
function explorerJson(url: string): Promise<unknown> {
  const next = line.then(() => fetchJson(url));
  line = next.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, num('gap', 3750))));
  return next;
}
async function fetchJson(url: string): Promise<unknown> {
  const token = process.env['LICHESS_TOKEN'];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }).catch((e: unknown) => e as Error);
    if (res instanceof Response && res.ok) {
      requests++;
      return res.json();
    }
    const status = res instanceof Response ? res.status : String(res);
    if (attempt >= 6) throw new Error(`explorer: ${status}`);
    const wait = status === 429 ? 61000 : 2000 * (attempt + 1);
    say(`explorer ${status}: waiting ${wait / 1000} s`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

function maia23m(threads: number): MaiaBatch {
  ort.env.wasm.numThreads = threads;
  const session = ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', 'vendor', 'maia', 'maia3-23m.onnx')));
  return createMaiaBatch({
    history: true,
    memo: 50000,
    run: async (tokens, elos, n) => {
      const s = await session;
      const out = await s.run({
        tokens: new ort.Tensor('float32', tokens, [n, 64, 96]),
        elo_self: new ort.Tensor('float32', elos, [n]),
        elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
      });
      return { moves: out['logits_move']!.data as Float32Array, values: out['logits_value']!.data as Float32Array };
    },
    defer: (fn) => setImmediate(fn),
  });
}

/* ------------------------------------------------------------------ 1. walks */

async function walks(): Promise<void> {
  const out = need('out');
  const o = { walks: num('walks', 80), line: num('line', 10), past: num('past', 40), seed: num('seed', 1) };
  const file: WalkFile = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as WalkFile) : { createdAt: new Date().toISOString(), options: o, walks: [], positions: [] };
  const maia = maia23m(num('threads', 4));
  const save = () => writeFileSync(out, JSON.stringify(file));
  for (let id = file.walks.length; id < o.walks; id++) {
    const rand = rng(o.seed * 100003 + id);
    const userColor = rand() < 0.5 ? 'white' : 'black';
    const pos = Chess.default();
    const fens = [makeFen(pos.toSetup())];
    const line: string[] = [];
    const moves: string[] = [];
    const found: OppPosition[] = [];
    let end: Walk['end'] = 'cap';
    const play = (uci: string) => {
      pos.play(parseUciMove(pos, uci)!);
      fens.push(makeFen(pos.toSetup()));
    };
    // The line: both sides drawn by the games at the ranking filter.
    let ok = true;
    for (let i = 0; i < o.line; i++) {
      const pick = pickExplorerMove(await explorer(fens.at(-1)!, RANK_RATINGS), rand);
      if (!pick || !parseUciMove(pos, pick.uci)) {
        ok = false;
        break;
      }
      line.push(pick.uci);
      play(pick.uci);
    }
    if (!ok) {
      say(`walk ${id}: the line ran out of games; skipped`);
      file.walks.push({ id, userColor, line, moves, end: 'out-of-book' });
      continue;
    }
    for (let past = 0; past < o.past; past++) {
      if (pos.isEnd()) {
        end = 'game-over';
        break;
      }
      const fen = fens.at(-1)!;
      const before = fens.slice(0, -1).slice(-MAIA_BEFORE);
      if (pos.turn !== userColor) {
        const answers = Object.fromEntries(await Promise.all(FILTER_IDS.map(async (f) => [f, await explorer(fen, FILTERS[f].ratings)] as const))) as Record<FilterId, CompactExplorer>;
        const [m20, m21] = await Promise.all([maia.ask(pos, 2000, before), maia.ask(pos, 2150, before)]);
        const trim = (p: readonly Pol[]) => p.filter((m) => m.prob >= 0.002).map((m) => ({ uci: m.uci, prob: Math.round(m.prob * 1e5) / 1e5 }));
        found.push({ walk: id, past, ply: fens.length - 1, fen, answers, maia: { '2000': trim(m20.policy), '2150': trim(m21.policy) } });
        const pick = pickExplorerMove(answers.mOld, rand);
        const move = pick && parseUciMove(pos, pick.uci) ? pick.uci : undefined;
        if (!move) {
          end = 'out-of-book';
          break;
        }
        moves.push(move);
        play(move);
      } else {
        const p = (await maia.ask(pos, 2000, before)).policy;
        const m = maiaPick(p, 0.75, rand);
        if (!m) break;
        moves.push(m.uci);
        play(m.uci);
      }
    }
    file.walks.push({ id, userColor, line, moves, end });
    file.positions.push(...found);
    save();
    say(`walk ${id}: ${found.length} positions of the opponent, ${end}; ${requests} requests so far`);
  }
  save();
}

/* ------------------------------------------------------------------ 1b. thin */

/** The games up to the end of this month are the older half (about half of them, 2013–2022), the rest the newer. */
const SPLIT = '2022-12';
const THIN = 300;
const THIN_FILTERS: readonly FilterId[] = ['mNew', 'hard'];
const eloOf = (f: FilterId): '2000' | '2150' => (f === 'hard' ? '2150' : '2000');

/** Maia's probability of a database move (castling as the explorer writes it, e1h1, or as Maia does). */
function maiaOf(p: OppPosition, f: FilterId, uci: string): number {
  const pos = fromFen(p.fen);
  const mv = parseUciMove(pos, uci);
  const std = mv ? standardUci(pos, mv) : uci;
  return p.maia[eloOf(f)].find((m) => m.uci === std)?.prob ?? 0;
}

/**
 * A disputed move: a thin sample's move of 3 games or more and a quarter of them or more, which
 * Maia gives a third of that share or less (the owner's case of 2026-11-19: seven of twelve).
 */
function disputed(p: OppPosition, f: FilterId, a: CompactExplorer): CompactExplorer['moves'] {
  const N = games(a);
  return a.moves.filter((m) => m.games >= 3 && m.games / N >= 0.25 && maiaOf(p, f, m.uci) <= m.games / N / 3);
}

/**
 * For each thin position (fewer than 300 games at Medium's new filter or Hard's): the games up to
 * `SPLIT` (the newer are the full answer's less these), and the games the explorer names (eight
 * of the newest, eight of the newest up to the split), each with the move played and its player.
 */
async function thin(): Promise<void> {
  const path = need('walks');
  const file = JSON.parse(readFileSync(path, 'utf8')) as WalkFile;
  let lastSave = Date.now();
  const todo = file.positions.flatMap((p) => THIN_FILTERS.filter((f) => games(p.answers[f]) > 0 && games(p.answers[f]) < THIN && !p.thin?.[f]).map((f) => [p, f] as const));
  say(`${todo.length} thin positions to ask about (two requests each, at the explorer's pace)`);
  type RawGame = { id?: string; uci?: string; white?: { name?: string }; black?: { name?: string } };
  const namedOf = (j: unknown, turn: 'white' | 'black'): Named[] => {
    const o = j as { recentGames?: RawGame[]; topGames?: RawGame[] };
    return [...(o.recentGames ?? []), ...(o.topGames ?? [])].flatMap((g) => (g.id && g.uci && g[turn]?.name ? [{ id: g.id, uci: g.uci, mover: g[turn]!.name! }] : []));
  };
  let done = 0;
  for (const [p, f] of todo) {
    const turn = fromFen(p.fen).turn;
    const filter = { db: 'lichess' as const, speeds: SPEEDS, ratings: [...FILTERS[f].ratings], games: 8 };
    const older = await explorerJson(explorerUrl(p.fen, { ...filter, until: SPLIT }));
    const all = await explorerJson(explorerUrl(p.fen, filter));
    const named = new Map<string, Named>();
    for (const g of [...namedOf(all, turn), ...namedOf(older, turn)]) named.set(g.id, g);
    p.thin = { ...p.thin, [f]: { old: compactExplorer(older), named: [...named.values()] } };
    done++;
    if (Date.now() - lastSave > 60000) {
      lastSave = Date.now();
      writeFileSync(path, JSON.stringify(file));
      say(`${done}/${todo.length} thin positions asked; ${requests} requests`);
    }
  }
  writeFileSync(path, JSON.stringify(file));
  say(`${done} thin positions asked; ${requests} requests`);
}

/* ------------------------------------------------------------------ 2. score */

async function score(): Promise<void> {
  const path = need('walks');
  const depth = num('depth', 14);
  const file = JSON.parse(readFileSync(path, 'utf8')) as WalkFile;
  const engines = startEngines(num('engines', availableParallelism()));
  say(`${engines.label} ×${engines.width}, depth ${depth}`);
  const todo = file.positions.filter((p) => p.best === undefined);
  let done = 0;
  let lastSave = Date.now();
  const run = async (p: OppPosition) => {
    const pos = fromFen(p.fen);
    const cands = new Set<string>();
    for (const f of FILTER_IDS) for (const m of [...p.answers[f].moves].sort((a, b) => b.games - a.games).slice(0, 12)) if (m.games > 0) cands.add(m.uci);
    for (const e of ['2000', '2150'] as const) for (const m of guardCandidates(p.maia[e])) cands.add(m.uci);
    const wp: Record<string, number> = {};
    const root = engines.analyse(p.fen, 1, depth, 20000);
    await Promise.all(
      [...cands].map(async (uci) => {
        const move = parseUciMove(pos, uci);
        if (!move) return;
        const child = pos.clone();
        child.play(move);
        if (child.isCheckmate()) return void (wp[uci] = 100);
        if (child.isEnd()) return void (wp[uci] = 50);
        const a = await engines.analyse(makeFen(child.toSetup()), 1, depth - 1, 20000);
        const l = a?.lines[0];
        if (l) wp[uci] = winPct(moverScore(l.score, pos.turn));
      }),
    );
    const r = (await root)?.lines[0];
    p.wp = wp;
    p.best = Math.max(r ? winPct(moverScore(r.score, pos.turn)) : 0, ...Object.values(wp));
    done++;
    if (Date.now() - lastSave > 60000) {
      lastSave = Date.now();
      writeFileSync(path, JSON.stringify(file));
      say(`${done}/${todo.length} positions scored`);
    }
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.floor(engines.width / 2)) }, async () => {
      while (next < todo.length) await run(todo[next++]!);
    }),
  );
  engines.quit();
  writeFileSync(path, JSON.stringify(file));
  say(`${done} positions scored`);
}

/* ------------------------------------------------------------------ 3. report */

const MISTAKE = 10;
const BLUNDER = 15;
const games = (m: { white: number; draws: number; black: number }) => m.white + m.draws + m.black;

/** The database's draw at a filter, as `pickExplorerMove` makes it: each candidate's chance. */
function dbOdds(a: CompactExplorer, minGames = 5, minFreq = 0.05): { uci: string; p: number; games: number; rating?: number }[] {
  const total = a.white + a.draws + a.black;
  if (!total) return [];
  const c = a.moves.filter((m) => games(m) >= minGames && games(m) / total >= minFreq);
  const w = c.reduce((s, m) => s + games(m), 0);
  return c.map((m) => ({ uci: m.uci, p: games(m) / w, games: games(m), ...(m.rating !== undefined ? { rating: m.rating } : {}) }));
}

/** Maia's draw at a precision (`maiaPick`'s temperature), over the moves listed. */
function tempered(policy: readonly Pol[], precision: number): Pol[] {
  if (!policy.length) return [];
  if (precision >= 1) {
    const top = policy.reduce((a, b) => (b.prob > a.prob ? b : a));
    return [{ uci: top.uci, prob: 1 }];
  }
  const t = (1 - precision) * 2;
  const s = policy.map((m) => Math.pow(m.prob, 1 / t));
  const z = s.reduce((a, b) => a + b, 0);
  return policy.map((m, i) => ({ uci: m.uci, prob: s[i]! / z }));
}

/** The expected loss and the chances of a mistake and a blunder of a draw, over the moves scored (unscored: left out, renormalised). */
function lossOf(p: OppPosition, odds: readonly { uci: string; p: number }[]): { loss: number; mistake: number; blunder: number; covered: number } | undefined {
  if (!p.wp || p.best === undefined) return undefined;
  const ref = referenceOf(p);
  let loss = 0;
  let mistake = 0;
  let blunder = 0;
  let covered = 0;
  for (const m of odds) {
    const w = p.wp[m.uci];
    if (w === undefined) continue;
    const d = Math.max(0, ref - w);
    covered += m.p;
    loss += m.p * d;
    if (d > MISTAKE) mistake += m.p;
    if (d > BLUNDER) blunder += m.p;
  }
  if (covered < 0.9) return undefined;
  return { loss: loss / covered, mistake: mistake / covered, blunder: blunder / covered, covered };
}

/**
 * The check's draw (§5.205 as built), its chances worked out rather than drawn: Maia's likely moves
 * (2% or more, eight at most), a blunder (more than 10 win% below the best now) played only when
 * natural (half the likeliest's probability or more, or by the database's games, §5.206), wrong on the odds of the natural blunders
 * against the sound moves, which move at the precision. `odds`: the people's odds the check reads.
 */
function checkedOdds(p: OppPosition, odds: readonly Pol[], weight: (m: Pol) => number): { uci: string; p: number }[] | undefined {
  if (!p.wp || p.best === undefined) return undefined;
  const cands = guardCandidates(odds).filter((m) => p.wp![m.uci] !== undefined);
  if (!cands.length) return undefined;
  const top = odds.reduce((a, b) => Math.max(a, b.prob), 0);
  const ref = referenceOf(p);
  const bad = (m: Pol) => ref - p.wp![m.uci]! > MISTAKE;
  const sound = cands.filter((m) => !bad(m));
  const natural = cands.filter((m) => bad(m) && (m.prob >= 0.5 * top || (m as Pol & { dbNatural?: boolean }).dbNatural === true));
  if (!sound.length && !natural.length) {
    const least = cands.reduce((a, b) => (p.wp![b.uci]! > p.wp![a.uci]! ? b : a));
    return [{ uci: least.uci, p: 1 }];
  }
  const mass = (l: readonly Pol[]) => l.reduce((s, m) => s + m.prob, 0);
  const pWrong = !sound.length ? 1 : natural.length ? mass(natural) / (mass(sound) + mass(natural)) : 0;
  const within = (l: readonly Pol[], share: number) => {
    const z = l.reduce((s, m) => s + weight(m), 0);
    return z > 0 ? l.map((m) => ({ uci: m.uci, p: (share * weight(m)) / z })) : [];
  };
  return [...within(sound, 1 - pWrong), ...within(natural, pWrong)];
}

/**
 * What a move is measured against, as the check measures it (§5.205): the lower of the best now and
 * where the opponent stood before the user's move (its own last move's score), so a chance the user
 * gave and the opponent missed is no blunder.
 */
let referenceOf: (p: OppPosition) => number = (p) => p.best!;
function setReferences(file: WalkFile): void {
  const at = new Map(file.positions.map((p) => [`${p.walk}|${p.past}`, p]));
  const walkOf = new Map(file.walks.map((w) => [w.id, w]));
  referenceOf = (p) => {
    const prev = at.get(`${p.walk}|${p.past - 2}`);
    const uci = prev && walkOf.get(p.walk)?.moves[prev.past];
    const before = uci !== undefined ? prev!.wp?.[uci] : undefined;
    return before === undefined ? p.best! : Math.min(p.best!, before);
  };
}

const BUCKETS = [0, 25, 50, 100, 200, 300, 500, 1000, 3000, Infinity];
const bucketOf = (n: number) => BUCKETS.findIndex((b, i) => n >= b && n < BUCKETS[i + 1]!);
const bucketLabel = (i: number) => (BUCKETS[i + 1] === Infinity ? `${BUCKETS[i]}+` : `${BUCKETS[i]}–${BUCKETS[i + 1]! - 1}`);
const pct = (x: number) => (100 * x).toFixed(1) + '%';
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

/** A multinomial sample of `n` from `t` (the truth's shares). */
function sample(t: readonly number[], n: number, rand: () => number): number[] {
  const c = t.map(() => 0);
  for (let i = 0; i < n; i++) {
    let r = rand();
    let j = 0;
    while (j < t.length - 1 && r > t[j]!) r -= t[j++]!;
    c[j]!++;
  }
  return c;
}

function report(): void {
  const file = JSON.parse(readFileSync(need('walks'), 'utf8')) as WalkFile;
  setReferences(file);
  const json = flags.has('json');
  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  const ps = file.positions;
  const walksDone = file.walks.filter((w) => w.line.length === file.options.line);
  out(`${walksDone.length} walks (${file.walks.length - walksDone.length} skipped), ${ps.length} positions of the opponent, ${ps.filter((p) => p.best !== undefined).length} scored`);

  // 1. How long the database lasts past the line's end, at each filter.
  out('\n1. The database past the line\'s end (plies after it until no move has 5 games and 5%)');
  for (const f of FILTER_IDS) {
    const lens: number[] = [];
    let censored = 0;
    for (const w of walksDone) {
      const mine = ps.filter((p) => p.walk === w.id).sort((a, b) => a.past - b.past);
      const out1 = mine.find((p) => dbOdds(p.answers[f]).length === 0);
      if (out1) lens.push(out1.past);
      else {
        censored++;
        lens.push(mine.length ? mine.at(-1)!.past + 2 : 0);
      }
    }
    out(`  ${FILTERS[f].label}: median ${median(lens)} plies, quartiles ${median(lens.filter((x) => x <= median(lens)))}–${median(lens.filter((x) => x >= median(lens)))}; ${censored} walks still in the database at the cap`);
  }

  // 2. How thin the samples are where the opponent draws from the database, and what the draws lose.
  out('\n2. The opponent\'s draws from the database, by the position\'s games (N) at the filter');
  out('   (share of the draws; then the expected win% given up, mistakes (>10) and blunders (>15), against the lower of the best now and where it');
  out('   stood before the user\'s move: the database\'s draw; Maia at the level unchecked; Maia checked; the blend of both, checked)');
  const elos = { mOld: '2000', mNew: '2000', hard: '2150' } as const;
  const precs = { mOld: 0.75, mNew: 0.75, hard: 0.85 } as const;
  type Row4 = { db: number[]; maiaU: number[]; maiaC: number[]; blendC: number[]; n: number };
  const measured = new Map<FilterId, { N: number; row: Row4 }[]>();
  for (const f of FILTER_IDS) {
    out(`  ${FILTERS[f].label}`);
    const rows = new Map<number, Row4[]>();
    const list: { N: number; row: Row4 }[] = [];
    let all = 0;
    for (const p of ps) {
      const odds = dbOdds(p.answers[f]);
      if (!odds.length) continue;
      all++;
      const N = games(p.answers[f]);
      const b = bucketOf(N);
      const elo = elos[f];
      const prec = precs[f];
      const t = tempered(p.maia[elo], prec);
      const d = lossOf(p, odds);
      const u = lossOf(p, t.map((m) => ({ uci: m.uci, p: m.prob })));
      const c = checkedOdds(p, p.maia[elo], (m) => t.find((x) => x.uci === m.uci)?.prob ?? 0);
      const cl = c && lossOf(p, c);
      const pos = fromFen(p.fen);
      const dbStd = p.answers[f].moves.flatMap((m) => {
        const mv = parseUciMove(pos, m.uci);
        return mv ? [{ ...m, uci: standardUci(pos, mv) }] : [];
      });
      const blend = blendMoves(dbStd, p.maia[elo], prec);
      const bc = checkedOdds(p, blend, (m) => (m as Pol & { weight: number }).weight);
      const bcl = bc && lossOf(p, bc);
      const row: Row4 = { n: 1, db: [], maiaU: [], maiaC: [], blendC: [] };
      if (d && u && cl && bcl) {
        row.db = [d.loss, d.mistake, d.blunder];
        row.maiaU = [u.loss, u.mistake, u.blunder];
        row.maiaC = [cl.loss, cl.mistake, cl.blunder];
        row.blendC = [bcl.loss, bcl.mistake, bcl.blunder];
      }
      rows.set(b, [...(rows.get(b) ?? []), row]);
      list.push({ N, row });
    }
    measured.set(f, list);
    const cell = (rs: Row4[], k: 'db' | 'maiaU' | 'maiaC' | 'blendC') => {
      const xs = rs.filter((r) => r[k].length);
      const m = (i: number) => mean(xs.map((r) => r[k][i]!));
      return `${m(0).toFixed(2)}, ${pct(m(1))}, ${pct(m(2))}`.padEnd(20);
    };
    for (const [b, rs] of [...rows].sort((a, b2) => a[0] - b2[0])) {
      out(`    N ${bucketLabel(b).padEnd(10)} ${pct(rs.length / all).padStart(6)} (${String(rs.length).padStart(3)})  DB ${cell(rs, 'db')} Maia ${cell(rs, 'maiaU')} checked ${cell(rs, 'maiaC')} blend checked ${cell(rs, 'blendC')}`);
    }
    for (const T of [100, 300, 1000]) {
      const thin = list.filter((x) => x.N < T).map((x) => x.row);
      const rest = list.filter((x) => x.N >= T).map((x) => x.row);
      out(`    below ${String(T).padEnd(5)} ${pct(thin.length / all).padStart(6)} of the draws: today DB ${cell(thin, 'db')} → blend checked ${cell(thin, 'blendC')}; from ${T}: DB ${cell(rest, 'db')}`);
    }
  }

  // 3. The ratings behind the database's draws.
  out('\n3. The games\' mean rating behind the opponent\'s draws (each move\'s average, by its chance)');
  for (const f of FILTER_IDS) {
    const rs: number[] = [];
    const byPast = new Map<number, number[]>();
    for (const p of ps) {
      const odds = dbOdds(p.answers[f]);
      if (!odds.length || odds.some((m) => m.rating === undefined)) continue;
      const r = odds.reduce((s, m) => s + m.p * m.rating!, 0);
      rs.push(r);
      const k = Math.min(3, Math.floor(p.past / 6));
      byPast.set(k, [...(byPast.get(k) ?? []), r]);
    }
    out(`  ${FILTERS[f].label}: ${mean(rs).toFixed(0)} over ${rs.length} positions; by plies past the line's end ${[...byPast].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k * 6}${k === 3 ? '+' : `–${k * 6 + 5}`}: ${mean(v).toFixed(0)}`).join(', ')}`);
  }

  // 4. Maia as k games beside a sample: which k predicts what people play best?
  out('\n4. The blend (games + k × Maia) / (n + k): cross-entropy against the full sample, positions with 500+ games');
  const ks = [0, 2, 5, 10, 15, 20, 30, 50, 75, 100, 200, 400, Infinity];
  const ns = [5, 10, 20, 50, 100, 200];
  const draws = num('draws', 200);
  const rand = rng(num('seed', 1));
  const fitJson: Record<string, Record<string, number>> = {};
  for (const [f, elo] of [['mNew', '2000'], ['mOld', '2000'], ['hard', '2150']] as const) {
    const big = ps.filter((p) => games(p.answers[f]) >= 500);
    out(`  ${FILTERS[f].label}, Maia ${elo}: ${big.length} positions`);
    const header = ['n \\ k', ...ks.map((k) => (k === Infinity ? 'Maia' : String(k)))];
    out('    ' + header.map((h) => h.padStart(7)).join(''));
    const fit: Record<string, number> = {};
    for (const n of ns) {
      const sums = ks.map(() => 0);
      let count = 0;
      for (const p of big) {
        const a = p.answers[f];
        const moves = a.moves.filter((m) => m.games > 0);
        const z = moves.reduce((s, m) => s + m.games, 0);
        const t = moves.map((m) => m.games / z);
        const q0 = moves.map((m) => p.maia[elo].find((x) => x.uci === m.uci)?.prob ?? 0);
        // Maia's policy over the moves people played, with what it puts elsewhere as one more outcome
        // people never take: the blend is a distribution over the same outcomes as the truth's.
        const floor = 1e-4;
        for (let d = 0; d < draws; d++) {
          const c = sample(t, n, rand);
          ks.forEach((k, i) => {
            let h = 0;
            for (let j = 0; j < t.length; j++) {
              if (!t[j]) continue;
              const pr = k === Infinity ? q0[j]! : (c[j]! + k * q0[j]!) / (n + k);
              h -= t[j]! * Math.log(Math.max(floor, pr));
            }
            sums[i]! += h;
          });
          count++;
        }
      }
      const row = sums.map((s) => s / count);
      const best = row.reduce((bi, v, i) => (v < row[bi]! ? i : bi), 0);
      fit[String(n)] = ks[best]!;
      out('    ' + [String(n).padStart(7), ...row.map((v, i) => (i === best ? `*${v.toFixed(3)}` : v.toFixed(3)).padStart(7))].join(''));
    }
    fitJson[f] = fit;
  }

  // 5. The prepared opponent: Hard's draw weighted by how each reply scores for it.
  out('\n5. A prepared opponent at Hard\'s filter: each candidate\'s games × e^(β × its score above the position\'s, in points), the score shrunk toward the position\'s by 50 games');
  for (const minN of [300, 1000]) {
    out(`  positions with ${minN}+ games at Hard's filter`);
    for (const beta of [0, 0.05, 0.1, 0.15, 0.2, 0.3]) {
      const sc: number[] = [];
      const ls: number[][] = [];
      const tops: number[] = [];
      let n = 0;
      for (const p of ps) {
        const a = p.answers.hard;
        const N = games(a);
        if (N < minN) continue;
        const odds = dbOdds(a);
        if (!odds.length) continue;
        const white = fromFen(p.fen).turn === 'white';
        const pts = (m: { white: number; draws: number; black: number }) => (white ? m.white : m.black) + m.draws / 2;
        const sBar = pts(a) / N;
        const shrunk = (m: { white: number; draws: number; black: number }) => (pts(m) + 50 * sBar) / (games(m) + 50);
        const full = new Map(a.moves.map((m) => [m.uci, m]));
        const w = odds.map((m) => m.games * Math.exp(beta * 100 * (shrunk(full.get(m.uci)!) - sBar)));
        const z = w.reduce((s, x) => s + x, 0);
        const pr = odds.map((m, i) => ({ uci: m.uci, p: w[i]! / z }));
        sc.push(pr.reduce((s, m) => s + m.p * 100 * (pts(full.get(m.uci)!) / games(full.get(m.uci)!) - sBar), 0));
        tops.push(Math.max(...pr.map((m) => m.p)));
        const l = lossOf(p, pr);
        if (l) ls.push([l.loss, l.blunder]);
        n++;
      }
      out(`    β ${String(beta).padEnd(5)} ${n} positions: the reply's score above the position's ${mean(sc).toFixed(2)} points; the likeliest reply's chance ${pct(mean(tops))}; win% given up ${mean(ls.map((x) => x[0]!)).toFixed(2)}, blunders ${pct(mean(ls.map((x) => x[1]!)))}`);
    }
  }
  // 6. Thin samples against later players (the owner's question of 2026-11-19: is a thin sample's majority a coincidence?).
  out(`\n6. Thin positions (under ${THIN} games): the games up to ${SPLIT} as the sample, the games since as the players to predict`);
  const thinKs = [0, 1, 2, 5, 10, 15, 20, 30, 50, 100, Infinity];
  const OLD_BUCKETS = [1, 10, 30, 100, THIN];
  for (const f of THIN_FILTERS) {
    const rows = ps.filter((p) => p.thin?.[f]);
    out(`  ${FILTERS[f].label}, Maia ${eloOf(f)}: ${rows.length} thin positions asked`);
    // a. Which weight for Maia predicts the newer games best: the mean −log p of each newer game's move.
    const loss = new Map<string, number[]>();
    const counts = new Map<string, number>();
    for (const p of rows) {
      const full = p.answers[f];
      const old = p.thin![f]!.old;
      const oldN = games(old);
      const byUci = new Map<string, { o: number; n: number }>();
      for (const m of full.moves) byUci.set(m.uci, { o: 0, n: m.games });
      for (const m of old.moves) byUci.set(m.uci, { o: m.games, n: (byUci.get(m.uci)?.n ?? m.games) });
      const newN = [...byUci.values()].reduce((s2, x) => s2 + Math.max(0, x.n - x.o), 0);
      if (!oldN || !newN) continue;
      const b = OLD_BUCKETS.findIndex((lo, i) => oldN >= lo && oldN < (OLD_BUCKETS[i + 1] ?? Infinity));
      const key = `${OLD_BUCKETS[b]}–${(OLD_BUCKETS[b + 1] ?? Infinity) - 1}`;
      const sums = loss.get(key) ?? thinKs.map(() => 0);
      thinKs.forEach((k, i) => {
        for (const [uci, x] of byUci) {
          const nw = Math.max(0, x.n - x.o);
          if (!nw) continue;
          const q = maiaOf(p, f, uci);
          const pr = k === Infinity ? q : (x.o + k * q) / (oldN + k);
          sums[i]! += -nw * Math.log(Math.max(1e-3, pr));
        }
      });
      loss.set(key, sums);
      counts.set(key, (counts.get(key) ?? 0) + newN);
    }
    const keys = [...loss.keys()].filter((k) => k !== 'all').sort((a, b) => parseInt(a) - parseInt(b));
    const total = thinKs.map((_, i) => keys.reduce((s2, k) => s2 + loss.get(k)![i]!, 0));
    const totalN = keys.reduce((s2, k) => s2 + counts.get(k)!, 0);
    out('    ' + ['games before', 'newer'].map((h) => h.padStart(12)).join('') + thinKs.map((k) => (k === Infinity ? 'Maia' : `k ${k}`).padStart(8)).join(''));
    const line6 = (label: string, sums: number[], n: number) => {
      const row = sums.map((x) => x / n);
      const best = row.reduce((bi, v, i) => (v < row[bi]! ? i : bi), 0);
      out('    ' + label.padStart(12) + String(n).padStart(12) + row.map((v, i) => (i === best ? `*${v.toFixed(3)}` : v.toFixed(3)).padStart(8)).join(''));
    };
    for (const k of keys) line6(k, loss.get(k)!, counts.get(k)!);
    if (totalN) line6('all', total, totalN);
    // b. Disputed moves of the older sample: what the newer players did with them.
    const ds: { oldShare: number; q: number; newShare: number; newN: number; blunder: boolean | undefined; oldGames: number }[] = [];
    for (const p of rows) {
      const old = p.thin![f]!.old;
      const oldN = games(old);
      if (oldN < 3) continue;
      for (const m of disputed(p, f, old)) {
        const fullM = p.answers[f].moves.find((x) => x.uci === m.uci);
        const newN = games(p.answers[f]) - oldN;
        if (newN < 3) continue;
        const newShare = Math.max(0, (fullM?.games ?? m.games) - m.games) / newN;
        const pos = fromFen(p.fen);
        const mv = parseUciMove(pos, m.uci);
        const std = mv ? standardUci(pos, mv) : m.uci;
        const w = p.wp?.[std] ?? p.wp?.[m.uci];
        ds.push({ oldShare: m.games / oldN, q: maiaOf(p, f, m.uci), newShare, newN, blunder: w === undefined || p.best === undefined ? undefined : referenceOf(p) - w > MISTAKE, oldGames: m.games });
      }
    }
    const summary = (xs: typeof ds) => `${xs.length} moves: the older share ${pct(mean(xs.map((x) => x.oldShare)))}, Maia ${pct(mean(xs.map((x) => x.q)))}, the newer players' ${pct(mean(xs.map((x) => x.newShare)))} (weighted by their games ${pct(xs.reduce((s2, x) => s2 + x.newShare * x.newN, 0) / Math.max(1, xs.reduce((s2, x) => s2 + x.newN, 0)))})`;
    out(`    disputed in the older sample (3+ games, a quarter or more, Maia a third of that or less): ${summary(ds)}`);
    out(`      of them blunders (more than 10 win% below the lower of the best and where it stood): ${summary(ds.filter((x) => x.blunder))}`);
    out(`      of them majorities (half or more): ${summary(ds.filter((x) => x.oldShare >= 0.5))}`);
    // c. Who chose them: the games the explorer names (up to 16 a position), the distinct players behind each disputed move.
    const people = (moves: (p: OppPosition) => CompactExplorer['moves']) => {
      const xs: { named: number; players: number; games: number }[] = [];
      for (const p of rows) {
        const nm = p.thin![f]!.named;
        for (const m of moves(p)) {
          const mine = nm.filter((g) => g.uci === m.uci);
          if (mine.length < 2) continue;
          xs.push({ named: mine.length, players: new Set(mine.map((g) => g.mover)).size, games: m.games });
        }
      }
      return xs;
    };
    const dispNow = people((p) => disputed(p, f, p.answers[f]));
    const agreed = people((p) => {
      const a = p.answers[f];
      const N = games(a);
      return a.moves.filter((m) => m.games >= 3 && m.games / N >= 0.25 && maiaOf(p, f, m.uci) > m.games / N / 3);
    });
    const ppl = (xs: typeof dispNow) => `${xs.length} moves, ${mean(xs.map((x) => x.named)).toFixed(1)} of their games named: one player alone ${pct(xs.filter((x) => x.players === 1).length / Math.max(1, xs.length))}, two ${pct(xs.filter((x) => x.players === 2).length / Math.max(1, xs.length))}, three or more ${pct(xs.filter((x) => x.players >= 3).length / Math.max(1, xs.length))}; players per named game ${(xs.reduce((s2, x) => s2 + x.players, 0) / Math.max(1, xs.reduce((s2, x) => s2 + x.named, 0))).toFixed(2)}`;
    out(`    who chose a disputed move (the full sample): ${ppl(dispNow)}`);
    out(`    who chose a move Maia agrees with (3+ games, a quarter or more): ${ppl(agreed)}`);
  }
  if (json) process.stdout.write(JSON.stringify({ fit: fitJson }, null, 1) + '\n');
  else process.stdout.write(lines.join('\n') + '\n');
}

if (step === 'walks') await walks();
else if (step === 'thin') await thin();
else if (step === 'score') await score();
else if (step === 'report') report();
else say('steps: walks, thin, score, report (see the head of this file)');
