// The endgames checked before they are written into `ENDGAMES` (PLAN.md §5.145, §5.150): every
// first move scored by Stockfish at the judges' depths (16 on a phone, 18 on a desktop), and the
// drill played out with the app's own judge and opponent. The judge as practice.ts runs it (three
// lines at the judges' depth, the move's score from its line or from a search of the position after
// it, a likely slip searched again deeper with the lines' moves, §5.136) and the endgame's goal
// line (`lineOf`); the opponent as the app's (`opponentPick`: Maia 3 at 2600, checked by
// Stockfish, a draw's attacker pushing on and not repeating). The user's side plays Stockfish's
// best, or now and then another move that keeps the goal, and at about a third of its turns a bad
// move is judged (not played): a good move stopped is a false stop, a bad move let through a miss.
//
//   node scripts/endgame-check.ts [endgame ids…]   (GAMES=2, JUDGE_DEPTH=16, SKIP_PLAY=1 for the
//   first moves alone, SKIP_MAIA=1 for Stockfish alone; STOCKFISH=/path/to/native for speed)
//
// Writes the first moves and each game to stdout, a summary line per endgame to stderr.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { ENDGAMES, held, keepsGoal, lineOf, MAIA_ELO, MAIA_TOP, materialFor, opponentPick, pawnPushes, pushNow, sideOf, slips, wonAfter, type Endgame } from '../src/core/endgames/endgames.ts';
import { winPct } from '../src/core/games/extract.ts';
import { moverScore } from '../src/core/games/grade.ts';
import { clampElo, maiaTokens, policyFrom } from '../src/core/maia/encode.ts';
import { Engine, positionOf } from './ideas/engine.ts';

const ROOT = join(import.meta.dirname, '..');
const GAMES = Number(process.env['GAMES'] ?? 2);
const DEPTH = Number(process.env['JUDGE_DEPTH'] ?? 16);
const RECHECK_DEPTH = DEPTH <= 16 ? 20 : 22;
const MAX_PLIES = Number(process.env['MAX_PLIES'] ?? 160);

const sf = new Engine();
ort.env.wasm.numThreads = 1;
const maiaS = process.env['SKIP_MAIA'] ? undefined : await ort.InferenceSession.create(readFileSync(join(ROOT, 'vendor/maia/maia3_simplified.onnx')));

const sqName = (s: number) => 'abcdefgh'[s & 7]! + String((s >> 3) + 1);
const fenOf = (p: Position) => makeFen(p.toSetup());
/** A position for repetitions: pieces, side to move, castling, en passant. */
const keyOf = (p: Position) => fenOf(p).split(' ').slice(0, 4).join(' ');
const play = (pos: Position, uci: string): Position => {
  const p = pos.clone();
  p.play(parseUci(uci)!);
  return p;
};
const san = (pos: Position, uci: string) => makeSan(pos, parseUci(uci)!);
function legal(pos: Position): string[] {
  const out: string[] = [];
  for (const [from, tos] of pos.allDests()) {
    for (const to of tos) {
      const promo = pos.board.pawn.has(from) && (to >> 3 === 0 || to >> 3 === 7);
      for (const r of promo ? ['q', 'r', 'b', 'n'] : ['']) out.push(`${sqName(from)}${sqName(to)}${r}`);
    }
  }
  return out;
}
const cpText = (cp: number) => (cp >= 9000 ? `#${10000 - cp}` : cp <= -9000 ? `-#${10000 + cp}` : (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2));

/** Every move of the position scored for the side to move, best first; a mate as ±(10000 − n). */
async function allMoves(pos: Position, depth: number): Promise<{ uci: string; cp: number }[]> {
  const n = legal(pos).length;
  const s = await sf.search(fenOf(pos), { depth, lines: n });
  const sign = pos.turn === 'white' ? 1 : -1;
  return s.lines.map((l) => ({ uci: l.pv[0]!, cp: (l.score.mate !== undefined ? Math.sign(l.score.mate) * (10000 - Math.abs(l.score.mate)) : l.score.cp) * sign }));
}

async function maiaMoves(pos: Position): Promise<{ uci: string; prob: number }[]> {
  if (!maiaS) return [];
  const e = clampElo(MAIA_ELO);
  const out = await maiaS.run({
    tokens: new ort.Tensor('float32', maiaTokens(fenOf(pos)), [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([e]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([e]), [1]),
  });
  return policyFrom(pos, out['logits_move']!.data as Float32Array);
}

/** The judge of a move as practice.ts runs it: the best line's score and the move's, for the mover. */
async function judge(e: Endgame, pos: Position, uci: string): Promise<{ bestCp: number; afterCp: number; deep: boolean }> {
  const fen = fenOf(pos);
  const a = await sf.search(fen, { depth: DEPTH, lines: 3 });
  let lines = a.lines.filter((l) => l.pv.length).map((l) => ({ move: l.pv[0]!, cp: moverScore(l.score, pos.turn) }));
  const after = play(pos, uci);
  let afterCp: number;
  const matched = lines.find((l) => l.move === uci);
  if (after.isEnd()) afterCp = after.isCheckmate() ? 10000 : 0;
  else if (matched) afterCp = matched.cp;
  else afterCp = -moverScore((await sf.search(fenOf(after), { depth: DEPTH, lines: 1 })).lines[0]!.score, after.turn);
  let bestCp = lines[0]!.cp;
  const wpDrop = winPct(bestCp) - winPct(Math.min(bestCp, afterCp));
  let deep = false;
  if (!after.isEnd() && lines[0]!.move !== uci && wpDrop > 5 && slips(e.goal, bestCp, afterCp, lineOf(e))) {
    const moves = [...new Set([...lines.map((l) => l.move), uci])];
    const d = await sf.search(fen, { depth: RECHECK_DEPTH, lines: moves.length, moves });
    lines = d.lines.filter((l) => l.pv.length).map((l) => ({ move: l.pv[0]!, cp: moverScore(l.score, pos.turn) }));
    const m = lines.find((l) => l.move === uci);
    if (m) {
      bestCp = lines[0]!.cp;
      afterCp = m.cp;
      deep = true;
    }
  }
  return { bestCp, afterCp, deep };
}

/** The app's opponent (`endgameReply`): Maia's likeliest move that Stockfish finds sound, else Stockfish's. */
async function opponent(e: Endgame, pos: Position, userMoves: number, seen: ReadonlySet<string>): Promise<string> {
  const fen = fenOf(pos);
  const pushes = pushNow(e, userMoves) ? pawnPushes(pos) : [];
  const scored = (s: Awaited<ReturnType<typeof sf.search>>) => s.lines.filter((l) => l.pv.length).map((l) => ({ cp: moverScore(l.score, pos.turn), pv: l.pv }));
  const best = scored(await sf.search(fen, { depth: DEPTH, lines: e.goal === 'draw' ? 5 : 1 }));
  const maia = (await maiaMoves(pos)).slice(0, MAIA_TOP);
  const rest = [...new Set([...pushes, ...maia.map((m) => m.uci)])].filter((u) => !best.some((l) => l.pv[0] === u));
  const more = rest.length ? scored(await sf.search(fen, { depth: DEPTH, lines: rest.length, moves: rest })) : [];
  const lineFor = (uci: string) => [...best, ...more].find((l) => l.pv[0] === uci);
  const material = (pv: readonly string[]) => {
    let p = pos;
    for (const u of pv) p = play(p, u);
    return materialFor(p, pos.turn);
  };
  return opponentPick(e.goal, best, maia, lineFor, material, (uci) => play(pos, uci).isEnd(), { pushes, repeats: (uci) => seen.has(keyOf(play(pos, uci))), line: lineOf(e) })!.uci;
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = process.argv.slice(2);
for (const e of ENDGAMES.filter((x) => !ids.length || ids.includes(x.id))) {
  const line = lineOf(e);
  const start = positionOf(e.fen);
  // The first moves, at both judges' depths.
  for (const depth of [16, 18]) {
    const moves = await allMoves(start, depth);
    const kept = moves.filter((m) => keepsGoal(e.goal, m.cp, line));
    const near = moves.filter((m) => Math.abs(m.cp - line) < 100);
    console.log(`${e.id} d${depth} line ${cpText(line)}: ${kept.length} of ${moves.length} keep it${near.length ? `, ${near.length} within 1.00 of the line` : ''}\n  ${moves.map((m) => `${san(start, m.uci)} ${cpText(m.cp)}`).join(' | ')}`);
  }
  if (process.env['SKIP_PLAY']) continue;
  let falseStops = 0;
  // The closest a played move's score came to the line, above it.
  let closest = Infinity;
  let badJudged = 0;
  let badStopped = 0;
  const ends: string[] = [];
  for (let g = 0; g < GAMES; g++) {
    const rnd = mulberry(7919 * (g + 1) + e.id.length);
    let pos = start;
    const seen = new Map<string, number>([[keyOf(pos), 1]]);
    const sans: string[] = [];
    let userMoves = 0;
    let end = '';
    let near = Infinity;
    for (let ply = 0; ply < MAX_PLIES && !end; ply++) {
      if (pos.isEnd()) {
        end = pos.isCheckmate() ? (pos.turn === sideOf(e) ? 'mated' : 'mate') : pos.isStalemate() ? 'stalemate' : 'material';
        break;
      }
      if ([...seen.values()].some((n) => n >= 3)) end = 'repetition';
      else if (pos.halfmoves >= 100) end = 'fifty';
      if (end) break;
      if (pos.turn === sideOf(e)) {
        // A bad move judged, not played, now and then: is it stopped?
        if (rnd() < 0.34) {
          const quick = await allMoves(pos, 10);
          const bad = quick.filter((m) => m.cp <= line - 50);
          if (bad.length && quick.some((m) => keepsGoal(e.goal, m.cp, line))) {
            const b = bad[Math.floor(rnd() * bad.length)]!;
            const j = await judge(e, pos, b.uci);
            badJudged++;
            if (slips(e.goal, j.bestCp, j.afterCp, line)) badStopped++;
            else console.log(`  ${e.id} game ${g + 1}: bad ${san(pos, b.uci)} let through (best ${cpText(j.bestCp)}, after ${cpText(j.afterCp)}) at ${fenOf(pos)}`);
          }
        }
        // The user's move: Stockfish's best, or now and then another of its three that keeps the goal.
        const s = await sf.search(fenOf(pos), { depth: DEPTH, lines: 3 });
        const ok = s.lines.filter((l) => l.pv.length && keepsGoal(e.goal, moverScore(l.score, pos.turn), line));
        const pick = ok.length > 1 && rnd() < 0.3 ? ok[1 + Math.floor(rnd() * (ok.length - 1))]! : (ok[0] ?? s.lines[0]!);
        const uci = pick.pv[0]!;
        const j = await judge(e, pos, uci);
        if (keepsGoal(e.goal, j.afterCp, line)) near = Math.min(near, j.afterCp - line);
        if (slips(e.goal, j.bestCp, j.afterCp, line)) {
          falseStops++;
          console.log(`  ${e.id} game ${g + 1}: FALSE STOP ${san(pos, uci)} (best ${cpText(j.bestCp)}, after ${cpText(j.afterCp)}${j.deep ? ', rechecked' : ''}) at ${fenOf(pos)}`);
        }
        sans.push(`${Math.ceil(pos.fullmoves)}${pos.turn === 'white' ? '.' : '…'}${san(pos, uci)}`);
        const after = play(pos, uci);
        userMoves++;
        pos = after;
        seen.set(keyOf(pos), (seen.get(keyOf(pos)) ?? 0) + 1);
        if (after.isCheckmate()) end = 'mate';
        else if ((wonAfter(e, after, uci.length === 5) || held(e, userMoves)) && keepsGoal(e.goal, j.afterCp, line)) end = 'goal';
        continue;
      }
      const uci = await opponent(e, pos, userMoves, new Set(seen.keys()));
      sans.push(san(pos, uci));
      pos = play(pos, uci);
      seen.set(keyOf(pos), (seen.get(keyOf(pos)) ?? 0) + 1);
    }
    closest = Math.min(closest, near);
    ends.push(`${end || 'cut'} after ${userMoves}`);
    console.log(`  ${e.id} game ${g + 1}: ${end || 'cut'} after ${userMoves} moves (closest to the line ${cpText(near)}): ${sans.join(' ')}`);
  }
  process.stderr.write(`${e.id} (d${DEPTH}): ${ends.join(', ')}; false stops ${falseStops}; bad moves stopped ${badStopped} of ${badJudged}; closest to the line ${cpText(closest)}\n`);
}
sf.quit();
