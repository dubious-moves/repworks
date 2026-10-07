// The migration from mistake-lab (PLAN.md §5.64, D15): its Gist's progress file (and its games and
// review history) in; a report, the progress events and two studies' PGN out. Run first as a dry
// run (the report alone), then for real. Pure: the time and the device's local date come in.
//
// - `positions[pid].srs` → one `snapshot` per card: game items as `m|<pid>`, plan cards as
//   `p|<key>` with the key made again through `positionKey` (D10); `r_` states counted and left
//   behind (D15, D19); a corrupt state, or one never reviewed, left out and counted.
// - `invalidated` → `drop`, `invalidatedLines` → `drop` with the line; `recidGraded` → `relapse`
//   at the game's time, which is never after the migrated last review, so it marks the game as
//   applied and changes nothing.
// - `planCards` → `plan`; `repertoire.dismissed` → `dismiss`; `practiceMistakes`, `practiceTactics`
//   → `saved`; `practiceScoreboard` → `practice`; the review history → `played`.
// - The user's notes → a "Notes" reference study (a chapter per position, the note its first
//   comment, its arrows and circles as shapes); notes imported from Lichess studies (`source:
//   'study'`) are left out, the studies holding them already. Custom deviations → a "From
//   mistake-lab" repertoire study (a chapter per position, with the move).
// - Left behind and counted: the eval cache, the checklists (made again), `completed`, `lastSeen`.
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { keyFen, type PositionKey } from '../chess/positionKey.ts';
import { parseUciMove, standardUci } from '../chess/uci.ts';
import { sanitizeComment } from '../pgn/comment.ts';
import type { KnownEvent } from '../progress/events.ts';
import { gameCard } from '../progress/cards.ts';
import type { MistakeItem, TacticItem } from './extract.ts';
import type { TacticMove } from './record.ts';

export type NewEvent = KnownEvent extends infer E ? (E extends unknown ? Omit<E, 'n' | 'v'> : never) : never;

export interface MigrationReport {
  cards: { game: number; plan: number; repertoireLeft: number; corrupt: number; neverReviewed: number; unknown: string[] };
  /** Position keys made again through `positionKey` that changed (mistake-lab's pseudo-legal en passant). */
  rekeyed: { from: string; to: string }[];
  /** Keys that aren't positions at all, left out. */
  unreadableKeys: string[];
  /** Game cards whose game isn't in the games read (they come back when it is). */
  missingGames: string[];
  drops: number;
  lineDrops: number;
  relapses: number;
  plans: number;
  plansRemoved: number;
  dismissed: number;
  saved: { mistakes: number; tactics: number; unreadable: number };
  practice: number;
  played: number;
  notes: { kept: number; fromStudies: number; deleted: number };
  deviations: number;
  /** mistake-lab's cards due on the day given (its own rule: a local date at or before today). */
  dueBefore: number;
  leftBehind: string[];
}

export interface MigrationInput {
  progress: unknown;
  /** The games' ids, when the games file was read: game cards without their game are listed. */
  gameIds?: ReadonlySet<string>;
  /** When each game was played (ms), for the relapse stand-ins. */
  gameTimes?: ReadonlyMap<string, number>;
  reviews?: unknown;
  /** Whether the eval cache file was there (it is left behind). */
  evalCache?: boolean;
  /** The migration's time (ms) and the device's local date (YYYY-MM-DD). */
  now: number;
  today: string;
}

export interface MigrationResult {
  report: MigrationReport;
  events: NewEvent[];
  /** A "Notes" study's PGN (a chapter per note), when there are notes. */
  notesPgn?: string;
  /** A "From mistake-lab" repertoire study's PGN (a chapter per custom deviation), when there are any. */
  deviationsPgn?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const iso = (ms: number) => new Date(ms).toISOString();

const PID_GAME = /^(.*)_(t|a)?(\d+)$/;

export function migrate(input: MigrationInput): MigrationResult {
  const report: MigrationReport = {
    cards: { game: 0, plan: 0, repertoireLeft: 0, corrupt: 0, neverReviewed: 0, unknown: [] },
    rekeyed: [],
    unreadableKeys: [],
    missingGames: [],
    drops: 0,
    lineDrops: 0,
    relapses: 0,
    plans: 0,
    plansRemoved: 0,
    dismissed: 0,
    saved: { mistakes: 0, tactics: 0, unreadable: 0 },
    practice: 0,
    played: 0,
    notes: { kept: 0, fromStudies: 0, deleted: 0 },
    deviations: 0,
    dueBefore: 0,
    leftBehind: [],
  };
  const events: NewEvent[] = [];
  const t = iso(input.now);
  const p = isObj(input.progress) ? input.progress : {};

  const rekeyedSeen = new Set<string>();
  const rekey = (key: string): PositionKey | undefined => {
    const k = keyFen(`${key.trim()} 0 1`);
    if (!k) {
      if (!report.unreadableKeys.includes(key)) report.unreadableKeys.push(key);
      return undefined;
    }
    if (k.key !== key && !rekeyedSeen.has(key)) {
      rekeyedSeen.add(key);
      report.rekeyed.push({ from: key, to: k.key });
    }
    return k.key;
  };
  const missing = new Set<string>();

  // Cards, drops and relapses.
  const positions = isObj(p['positions']) ? p['positions'] : {};
  for (const [pid, rec] of Object.entries(positions)) {
    if (!isObj(rec)) continue;
    let card: string | undefined;
    let gameId: string | undefined;
    if (pid.startsWith('r_')) {
      if (isObj(rec['srs']) && num(rec['srs']['reps'])) report.cards.repertoireLeft++;
      continue;
    } else if (pid.startsWith('p_')) {
      const key = rekey(pid.slice(2));
      if (!key) continue;
      card = `p|${key}`;
    } else {
      const m = PID_GAME.exec(pid);
      if (!m) {
        report.cards.unknown.push(pid);
        continue;
      }
      gameId = m[1]!;
      card = gameCard(pid);
    }
    const srs = isObj(rec['srs']) ? rec['srs'] : undefined;
    if (srs) {
      const st = srs['state'];
      const stab = num(srs['stability']);
      const diff = num(srs['difficulty']);
      const last = str(srs['lastReview']);
      const lastMs = last ? Date.parse(last) : NaN;
      if (st === 0 || !(num(srs['reps']) ?? 0)) report.cards.neverReviewed++;
      else if ((st !== 1 && st !== 2 && st !== 3) || stab === undefined || stab <= 0 || diff === undefined || diff < 1 || diff > 10 || !Number.isFinite(lastMs)) report.cards.corrupt++;
      else {
        const snap: NewEvent = { t, k: 'snapshot', card, st, stab, diff, reps: num(srs['reps']) ?? 1, lapses: num(srs['lapses']) ?? 0, sched: num(srs['scheduledDays']) ?? 1, last: iso(lastMs) };
        const first = str(rec['firstReview']);
        if (first && Number.isFinite(Date.parse(first))) snap.first = iso(Date.parse(first));
        events.push(snap);
        if (card.startsWith('p|')) report.cards.plan++;
        else report.cards.game++;
        const due = str(srs['due']);
        if (due && due <= input.today) report.dueBefore++;
        if (gameId && input.gameIds && !input.gameIds.has(gameId) && !gameId.startsWith('_')) missing.add(gameId);
      }
    }
    if (card.startsWith('m|')) {
      if (rec['invalidated'] === true) {
        events.push({ t, k: 'drop', card, on: true });
        report.drops++;
      }
      for (const line of arr(rec['invalidatedLines'])) {
        if (typeof line !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?(,[a-h][1-8][a-h][1-8][qrbn]?)*$/.test(line)) continue;
        events.push({ t, k: 'drop', card, on: true, line });
        report.lineDrops++;
      }
      const lastReview = srs ? Date.parse(str(srs['lastReview']) ?? '') : NaN;
      for (const g of arr(rec['recidGraded'])) {
        if (typeof g !== 'string' || !g) continue;
        const at = input.gameTimes?.get(g) ?? (Number.isFinite(lastReview) ? lastReview : 0);
        events.push({ t, k: 'relapse', card, g, at: iso(at) });
        report.relapses++;
      }
    }
  }
  report.missingGames = [...missing].sort();

  // Plan enrolments.
  for (const c of arr(p['planCards'])) {
    if (!isObj(c)) continue;
    if (c['deleted'] === true) {
      report.plansRemoved++;
      continue;
    }
    const key = str(c['positionKey']);
    const k = key ? rekey(key) : undefined;
    if (!k) continue;
    events.push({ t, k: 'plan', card: `p|${k}`, on: true, side: c['color'] === 'black' ? 'black' : 'white' });
    report.plans++;
  }

  // Dismissed positions.
  const rep = isObj(p['repertoire']) ? p['repertoire'] : {};
  for (const key of arr(rep['dismissed'])) {
    const k = typeof key === 'string' ? rekey(key) : undefined;
    if (!k) continue;
    events.push({ t, k: 'dismiss', card: `d|${k}`, on: true });
    report.dismissed++;
  }

  // Saved practice items.
  for (const m of arr(p['practiceMistakes'])) {
    const item = savedMistake(m);
    if (!item) report.saved.unreadable++;
    else {
      events.push({ t, k: 'saved', card: gameCard(item.pid), item: { ...item } });
      report.saved.mistakes++;
    }
  }
  for (const m of arr(p['practiceTactics'])) {
    const item = savedTactic(m);
    if (!item) report.saved.unreadable++;
    else {
      events.push({ t, k: 'saved', card: gameCard(item.pid), item: { ...item } });
      report.saved.tactics++;
    }
  }

  // Practice results, oldest first (the checklist's win rate reads them in order).
  const board = isObj(p['practiceScoreboard']) ? p['practiceScoreboard'] : {};
  const results: { ts: number; e: NewEvent }[] = [];
  for (const [key, list] of Object.entries(board)) {
    const k = rekey(key);
    if (!k) continue;
    for (const r of arr(list)) {
      if (!isObj(r)) continue;
      const res = r['result'];
      if (res !== 'win' && res !== 'draw' && res !== 'loss') continue;
      const e: NewEvent = { t, k: 'practice', card: `x|${k}`, res };
      const preset = str(r['preset']);
      if (preset) e.preset = preset;
      const cp = num(r['finalCp']);
      if (cp !== undefined) e.cp = Math.round(cp);
      const mv = num(r['moves']);
      if (mv !== undefined) e.mv = Math.round(mv);
      results.push({ ts: num(r['ts']) ?? 0, e });
    }
  }
  results.sort((a, b) => a.ts - b.ts);
  for (const r of results) events.push(r.e);
  report.practice = results.length;

  // The review history.
  const reviews = Array.isArray(input.reviews) ? input.reviews : isObj(input.reviews) ? arr(input.reviews['reviews']) : [];
  for (const s of [...reviews].sort((a, b) => (isObj(a) ? (num(a['ts']) ?? 0) : 0) - (isObj(b) ? (num(b['ts']) ?? 0) : 0))) {
    if (!isObj(s) || !str(s['id']) || !Array.isArray(s['moves'])) continue;
    events.push({ t, k: 'played', card: `h|${str(s['id'])!}`, game: s });
    report.played++;
  }

  // Notes.
  const chapters: string[] = [];
  const notes = isObj(p['notes']) ? p['notes'] : {};
  for (const [key, n] of Object.entries(notes)) {
    if (!isObj(n)) continue;
    if (n['deleted'] === true) {
      report.notes.deleted++;
      continue;
    }
    if (n['source'] === 'study') {
      report.notes.fromStudies++;
      continue;
    }
    const k = rekey(key);
    if (!k) continue;
    const text = sanitizeComment(str(n['text']) ?? '').text;
    const shapes = shapesOf(n['arrows'], n['circles']);
    if (!text && !shapes) continue;
    report.notes.kept++;
    const fen = `${k} 0 1`;
    const name = (text.split('\n')[0] ?? '').slice(0, 40) || `Position ${report.notes.kept}`;
    chapters.push(chapterPgn('Notes', name, fen, k.split(' ')[1] === 'b' ? 'black' : 'white', [text ? `{ ${text} }` : '', shapes ? `{ ${shapes} }` : ''].filter(Boolean).join(' ')));
  }
  const out: MigrationResult = { report, events };
  if (chapters.length) out.notesPgn = chapters.join('\n\n');

  // Custom deviations.
  const devs: string[] = [];
  for (const d of arr(rep['customDeviations'])) {
    if (!isObj(d)) continue;
    const fen = str(d['fenBefore']) ?? (str(d['positionKey']) ? `${str(d['positionKey'])} 0 1` : undefined);
    const move = isObj(d['repertoireMove']) ? d['repertoireMove'] : {};
    const movetext = fen ? moveText(fen, str(move['uci']), str(move['san'])) : undefined;
    if (!fen || !movetext) continue;
    report.deviations++;
    const side = d['playerColor'] === 'black' ? 'black' : 'white';
    devs.push(chapterPgn('From mistake-lab', `${side === 'white' ? 'White' : 'Black'}: ${movetext}`, fen, side, movetext));
  }
  if (devs.length) out.deviationsPgn = devs.join('\n\n');

  if (input.evalCache) report.leftBehind.push('the eval cache (mistakelab_evals.json): Stockfish’s answers, found again');
  if (arr(rep['todoLists']).length) report.leftBehind.push(`${arr(rep['todoLists']).length} variation checklists: made again from the studies (their exclusions included in none)`);
  report.leftBehind.push('completed and lastSeen (mistake-lab’s merge bookkeeping)');
  return out;
}

const COLOUR: Record<string, string> = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' };
const SQ = /^[a-h][1-8]$/;

function shapesOf(arrows: unknown, circles: unknown): string {
  const cal = arr(arrows)
    .filter(isObj)
    .filter((a) => SQ.test(str(a['from']) ?? '') && SQ.test(str(a['to']) ?? ''))
    .map((a) => `${COLOUR[str(a['color']) ?? ''] ?? 'G'}${str(a['from'])}${str(a['to'])}`);
  const csl = arr(circles)
    .filter(isObj)
    .filter((c) => SQ.test(str(c['square']) ?? ''))
    .map((c) => `${COLOUR[str(c['color']) ?? ''] ?? 'G'}${str(c['square'])}`);
  return [csl.length ? `[%csl ${csl.join(',')}]` : '', cal.length ? `[%cal ${cal.join(',')}]` : ''].join('');
}

const tag = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function chapterPgn(study: string, chapter: string, fen: string, side: 'white' | 'black', movetext: string): string {
  return [`[Event "${tag(study)}: ${tag(chapter)}"]`, `[StudyName "${tag(study)}"]`, `[ChapterName "${tag(chapter)}"]`, `[FEN "${fen}"]`, '[SetUp "1"]', `[Orientation "${side}"]`, '', `${movetext} *`].join('\n');
}

/** The move as movetext from `fen` (`12... Nf6`), by its UCI or its SAN; undefined when neither plays. */
function moveText(fen: string, uci: string | undefined, san: string | undefined): string | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const p = pos.value;
  const move = (uci && parseUciMove(p, uci)) || (san ? parseSan(p, san) : undefined);
  if (!move || !isNormal(move)) return undefined;
  const number = setup.value.fullmoves;
  return `${number}${p.turn === 'white' ? '.' : '...'} ${makeSanAndPlay(p, move)}`;
}

function sanToUci(fen: string, san: string): string | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const move = parseSan(pos.value, san);
  return move && isNormal(move) ? standardUci(pos.value, move) : undefined;
}

function savedMistake(m: unknown): MistakeItem | undefined {
  if (!isObj(m)) return undefined;
  const gameId = str(m['gameId']);
  const ply = num(m['movePly']);
  const fenBefore = str(m['fenBefore']);
  const san = str(m['sanPlayed']);
  if (!gameId || ply === undefined || !fenBefore || !san) return undefined;
  const k = keyFen(fenBefore);
  const uci = str(m['userUci']) ?? sanToUci(fenBefore, san);
  if (!k || !uci) return undefined;
  return {
    kind: 'mistake',
    pid: `${gameId}_${ply}`,
    gameId,
    ply,
    fenBefore,
    key: k.key,
    color: m['playerColor'] === 'black' ? 'black' : 'white',
    san,
    uci,
    cpBefore: Math.round(num(m['cpBefore']) ?? 0),
    cpAfter: Math.round(num(m['cpAfter']) ?? 0),
    cpLoss: Math.round(num(m['cpLoss']) ?? 0),
    wpDrop: num(m['wpDrop']) ?? 0,
    timeTrouble: false,
  };
}

function savedTactic(m: unknown): TacticItem | undefined {
  if (!isObj(m)) return undefined;
  const gameId = str(m['gameId']);
  const ply = num(m['movePly']);
  const fenBefore = str(m['fenBefore']);
  if (!gameId || ply === undefined || !fenBefore || !keyFen(fenBefore)) return undefined;
  const line = (l: unknown): TacticMove[] | undefined => {
    const out: TacticMove[] = [];
    for (const x of arr(l)) {
      if (!isObj(x) || !str(x['uci'])) return undefined;
      out.push({ uci: str(x['uci'])!, san: str(x['san']) ?? '', user: x['isUser'] === true });
    }
    return out.length ? out : undefined;
  };
  const main = line(m['tacticMoves']);
  if (!main) return undefined;
  const lines = [main, ...arr(m['tacticAltLines']).map(line).filter((l): l is TacticMove[] => !!l)];
  const wpSwing = num(m['wpSwing']) ?? 0;
  return { kind: 'tactic', pid: `${gameId}_t${ply}`, gameId, ply, fenBefore, color: m['playerColor'] === 'black' ? 'black' : 'white', lines, wpSwing, wpDrop: num(m['wpDrop']) ?? Math.abs(wpSwing), found: m['found'] === true };
}
