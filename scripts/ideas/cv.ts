// Chess vision for the opening-ideas skill (PLAN.md §5.128, `.claude/skills/opening-ideas`): the
// facts of positions and lines, worked out rather than pictured, as text a reader can check.
//
//   node scripts/ideas/cv.ts look    <pos> [--side black]
//   node scripts/ideas/cv.ts line    <pos> <move>... [--side black] [--full]
//   node scripts/ideas/cv.ts engine  <pos> [--depth 18] [--lines 4] [--side black]
//   node scripts/ideas/cv.ts threat  <pos> [--depth 16]
//   node scripts/ideas/cv.ts grade   <pos> <move>... [--depth 18]
//   node scripts/ideas/cv.ts maia    <pos> [--elo 1100,1500,1900] [--grade 14]
//   node scripts/ideas/cv.ts tree    <repertoire.pgn> [--side black] [--min 1] [--ours] [--leaves]
//   node scripts/ideas/cv.ts profile <repertoire.pgn> [--side black] [--engine 16] [--top 10]
//   node scripts/ideas/cv.ts playout <pos> [--n 6] [--plies 24] [--white maia:1500] [--black sf:12[:30]] [--seed 1] [--judge 14]
//   node scripts/ideas/cv.ts check   <deck.pgn> [--depth 16] [--no-engine] [--verbose]
//
// <pos> is a FEN, `startpos`, or movetext from the start ("1. e4 d5 2. exd5 c6"). Moves are SAN or
// UCI. Stockfish is the vendored lite build unless STOCKFISH names a native binary; searches are
// kept in IDEAS_CACHE (a folder in the system's temp folder by default).
import { readFileSync } from 'node:fs';
import { Chess, type Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { parseUciMove } from '../../src/core/chess/uci.ts';
import { legalMoves } from '../../src/core/maia/encode.ts';
import { checkDeck, gradeMoves } from './check.ts';
import { Engine, positionOf, scoreText, whiteWinPct } from './engine.ts';
import { maia } from './maia.ts';
import { parsePlayer, playouts } from './playout.ts';
import { numbered, profile, readRepertoire } from './tree.ts';
import { look, lookText, passTurn } from './vision.ts';

const BOOLEAN = new Set(['full', 'no-engine', 'verbose', 'ours', 'leaves']);

function parseArgs(argv: string[]): { pos: string[]; flags: Map<string, string> } {
  const pos: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (BOOLEAN.has(k)) flags.set(k, 'true');
      else flags.set(k, argv[++i] ?? '');
    } else pos.push(a);
  }
  return { pos, flags };
}

/** Movetext's moves: comments, move numbers, glyphs and results taken out. */
export function tokens(text: string): string[] {
  return text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, ''))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

/** Plays `moves` (SAN or UCI) on `pos`, which changes; the SANs played. Throws with the legal moves on a bad one. */
export function play(pos: Position, moves: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of moves) {
    const move = parseSan(pos, m) ?? parseUciMove(pos, m);
    if (!move) {
      const legal = legalMoves(pos).map((x) => x.san);
      throw new Error(`${m} is not a legal move (or is ambiguous) after ${out.join(' ') || 'the given position'} (${pos.turn} to move; legal: ${legal.join(' ')})`);
    }
    const san = makeSan(pos, move);
    pos.play(move);
    out.push(san);
  }
  return out;
}

export function readPosition(text: string): Position {
  const t = text.trim();
  if (t === 'startpos' || t === '') return Chess.default();
  if (t.includes('/')) return positionOf(t);
  const pos = Chess.default();
  play(pos, tokens(t));
  return pos;
}

const sideOf = (flags: Map<string, string>, fallback: Color = 'white'): Color => (flags.get('side') === 'black' ? 'black' : flags.get('side') === 'white' ? 'white' : fallback);
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos: args, flags } = parseArgs(rest);
  const depth = (d: number) => Number(flags.get('depth') ?? d);
  switch (cmd) {
    case 'look': {
      const p = readPosition(args.join(' '));
      console.log(lookText(look(p, sideOf(flags)), sideOf(flags)));
      return 0;
    }
    case 'line': {
      const p = readPosition(args[0] ?? 'startpos');
      const start = p.clone();
      const sans = play(p, args.slice(1).flatMap(tokens));
      console.log(`Line: ${numbered(sans, start.fullmoves, start.turn)}`);
      console.log(flags.has('full') ? lookText(look(p, sideOf(flags)), sideOf(flags)) : `${look(p, sideOf(flags)).board}\nFEN ${makeFen(p.toSetup())}`);
      return 0;
    }
    case 'engine': {
      const p = readPosition(args.join(' '));
      const engine = new Engine();
      const s = await engine.search(makeFen(p.toSetup()), { depth: depth(18), lines: Number(flags.get('lines') ?? 4) });
      engine.quit();
      const view = sideOf(flags);
      console.log(`Stockfish (${s.engine}) depth ${s.depth}, scores from ${view === 'white' ? 'White' : 'Black'}'s side; White's winning chances in brackets:`);
      for (const [i, l] of s.lines.entries()) console.log(`${i + 1}. ${scoreText(l.score, view)} [${whiteWinPct(l.score).toFixed(0)}%] ${numbered(l.san, p.fullmoves, p.turn)}`);
      return 0;
    }
    case 'threat': {
      const p = readPosition(args.join(' '));
      const passed = passTurn(p);
      if (!passed) {
        console.log('The side to move is in check: no threat to read (it must answer the check).');
        return 0;
      }
      const engine = new Engine();
      const now = await engine.search(makeFen(p.toSetup()), { depth: depth(16), lines: 1 });
      const t = await engine.search(makeFen(passed.toSetup()), { depth: depth(16), lines: 3 });
      engine.quit();
      const them = passed.turn;
      console.log(`${p.turn === 'white' ? 'White' : 'Black'} to move; eval now ${scoreText(now.lines[0]!.score, them)} from ${them}'s side.`);
      console.log(`If ${them} could move again (the threat), from ${them}'s side:`);
      for (const l of t.lines) console.log(`  ${scoreText(l.score, them)} ${numbered(l.san, passed.fullmoves, passed.turn)}`);
      return 0;
    }
    case 'grade': {
      const p = readPosition(args[0] ?? 'startpos');
      const moves = args.slice(1).flatMap(tokens);
      // Each move read on its own from the position: an illegal or ambiguous one is named, with the legal moves.
      const sans = moves.map((m) => play(p.clone(), [m])[0]!);
      const engine = new Engine();
      const graded = await gradeMoves(engine, p, sans, depth(18));
      engine.quit();
      console.log(`Graded at depth ${depth(18)}, from the mover's side (${p.turn}); best ${graded[0]?.bestSan} ${scoreText({ cp: graded[0]?.bestCp ?? 0 })}:`);
      for (const g of graded) console.log(`  ${g.san}: ${g.band}, gives up ${g.loss.toFixed(1)}% (${scoreText({ cp: g.cp })}); line ${numbered(g.pv, p.fullmoves, p.turn)}`);
      return 0;
    }
    case 'maia': {
      const p = readPosition(args.join(' '));
      const elos = (flags.get('elo') ?? '1100,1500,1900').split(',').map(Number);
      const gradeDepth = flags.get('grade');
      const engine = gradeDepth ? new Engine() : undefined;
      for (const elo of elos) {
        const r = await maia(p, elo);
        const shown = r.moves.filter((m) => m.prob >= 0.02).slice(0, 8);
        let grades = new Map<string, string>();
        if (engine) {
          const gs = await gradeMoves(engine, p, shown.filter((m) => m.prob >= 0.05).map((m) => m.san), Number(gradeDepth));
          grades = new Map(gs.map((g) => [g.san, ` [${g.band}, -${g.loss.toFixed(0)}%]`]));
        }
        console.log(`Maia ${r.elo} (${p.turn} to move expects ${(r.score * 100).toFixed(0)}%): ${shown.map((m) => `${m.san} ${pct(m.prob)}${grades.get(m.san) ?? ''}`).join(', ')}`);
      }
      engine?.quit();
      return 0;
    }
    case 'tree': {
      const rep = readRepertoire(readFileSync(args[0]!, 'utf8'), flags.has('side') ? sideOf(flags) : undefined);
      const min = Number(flags.get('min') ?? 1) / 100;
      const all = [...rep.positions.values()].filter((p) => p.reach >= min && (!flags.has('ours') || p.ours) && (!flags.has('leaves') || p.leaf));
      all.sort((a, b) => b.reach - a.reach || a.ply - b.ply);
      console.log(`Repertoire for ${rep.side}: ${rep.positions.size} positions, ${[...rep.positions.values()].filter((p) => p.leaf).length} line ends. Reach is the share of games through it (~: a move without a share on the way).`);
      for (const p of all) {
        const moves = p.moves.map((m) => (m.share === undefined ? m.san : `${m.san} ${pct(m.share)}`)).join(', ');
        console.log(`${p.approx ? '~' : ' '}${pct(p.reach).padStart(5)}  ${p.paths[0]}${p.paths.length > 1 ? `  (+${p.paths.length - 1} more orders)` : ''}  ${p.leaf ? '[line end]' : p.ours ? `[we: ${moves}]` : `[they: ${moves}]`}`);
        if (p.comments.length) console.log(`         notes: ${p.comments.join(' / ').replace(/\s+/g, ' ')}`);
        if (p.shapes.length) console.log(`         shapes: ${p.shapes.map((s) => `${s.brush[0]!.toUpperCase()}${s.orig}${s.dest ?? ''}`).join(' ')}`);
      }
      if (rep.transpositions.length) console.log(`Transpositions noted: ${rep.transpositions.length}`);
      for (const t of rep.problems) console.log(`Problem: ${t}`);
      return 0;
    }
    case 'profile': {
      const rep = readRepertoire(readFileSync(args[0]!, 'utf8'), flags.has('side') ? sideOf(flags) : undefined);
      const pr = profile(rep, positionOf);
      const row = (xs: [string, number][]) => xs.map(([k, v]) => `${k} ${pct(v)}`).join(', ');
      console.log(`Profile for ${pr.side}: ${pr.positions} positions, ${pr.leaves} line ends; weights are shares of games.`);
      console.log(`Our moves by piece and square, captures included (summed reach: 100% is once a game): ${row(pr.ourMoves)}`);
      console.log(`Their moves: ${row(pr.theirMoves)}`);
      console.log('Our pieces at the line ends:');
      for (const [piece, squares] of pr.placement) console.log(`  ${piece}: ${row(squares)}`);
      console.log(`Pawn structures at the line ends:`);
      for (const [s, w] of pr.structures) console.log(`  ${pct(w).padStart(4)}  ${s}`);
      console.log(`Structure features: ${row(pr.structureFacts)}`);
      console.log(`Material at the line ends: ${row(pr.materialAtLeaves)}`);
      console.log(`Our king at the line ends: ${row(pr.kingsAtLeaves)}`);
      const engineDepth = flags.get('engine');
      if (engineDepth) {
        const engine = new Engine();
        const leaves = [...rep.positions.values()].filter((p) => p.leaf).sort((a, b) => b.reach - a.reach).slice(0, Number(flags.get('top') ?? 10));
        console.log(`The ${leaves.length} most reached line ends, Stockfish depth ${engineDepth}, from our side:`);
        for (const leaf of leaves) {
          const s = await engine.search(leaf.fen, { depth: Number(engineDepth), lines: 1 });
          const l = s.lines[0];
          console.log(`  ${pct(leaf.reach).padStart(5)} ${l ? scoreText(l.score, pr.side) : '?'}  ${leaf.paths[0]}  →  ${l ? numbered(l.san.slice(0, 6), positionOf(leaf.fen).fullmoves, positionOf(leaf.fen).turn) : ''}`);
        }
        engine.quit();
      }
      return 0;
    }
    case 'playout': {
      const p = readPosition(args.join(' '));
      const engine = new Engine();
      const r = await playouts(engine, p, {
        n: Number(flags.get('n') ?? 6),
        plies: Number(flags.get('plies') ?? 24),
        white: parsePlayer(flags.get('white') ?? 'sf:12'),
        black: parsePlayer(flags.get('black') ?? 'sf:12'),
        seed: Number(flags.get('seed') ?? 1),
        judgeDepth: Number(flags.get('judge') ?? 14),
      });
      engine.quit();
      r.movetext.forEach((t, i) => console.log(`Game ${i + 1}: ${t}`));
      const row = (xs: [string, number][]) => xs.map(([k, v]) => `${k}×${v}`).join(', ');
      console.log(`White's moves: ${row(r.moves.white)}`);
      console.log(`Black's moves: ${row(r.moves.black)}`);
      return 0;
    }
    case 'check': {
      const engine = flags.has('no-engine') ? undefined : new Engine();
      const r = await checkDeck(readFileSync(args[0]!, 'utf8'), { engine, depth: depth(16), log: flags.has('verbose') ? (l) => console.log(l) : undefined });
      engine?.quit();
      for (const f of r.findings) console.log(`${f.level === 'error' ? 'ERROR' : 'warn '} ${f.chapter}: ${f.text}`);
      const errors = r.findings.filter((f) => f.level === 'error').length;
      console.log(`${r.chapters} chapters: ${errors} errors, ${r.findings.length - errors} warnings${engine ? `, moves graded at depth ${depth(16)}` : ', no engine'}.`);
      return errors ? 1 : 0;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
      return cmd ? 2 : 0;
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    },
  );
}

