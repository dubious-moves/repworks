// Chess vision for the opening-ideas skill (PLAN.md §5.128, `.claude/skills/opening-ideas`): the
// facts of positions and lines, worked out rather than pictured, as text a reader can check.
//
//   node scripts/ideas/cv.ts look    <pos> [--side black]
//   node scripts/ideas/cv.ts line    <pos> <move>... [--side black] [--full]
//   node scripts/ideas/cv.ts engine  <pos> [--depth 18] [--lines 4] [--side black]
//   node scripts/ideas/cv.ts threat  <pos> [--depth 16]
//   node scripts/ideas/cv.ts grade   <pos> <move>... [--depth 18]
//   node scripts/ideas/cv.ts squares <pos> <square> [--depth 18]
//   node scripts/ideas/cv.ts maia    <pos> [--elo 2000,2200] [--grade 14]
//   node scripts/ideas/cv.ts tree    <repertoire.pgn> [--side black] [--min 1] [--ours] [--leaves]
//   node scripts/ideas/cv.ts profile <repertoire.pgn> [--side black] [--engine 16] [--top 10]
//   node scripts/ideas/cv.ts develop <repertoire.pgn> [--side black] [--piece f8-bishop]
//   node scripts/ideas/cv.ts playout <pos> [--n 6] [--plies 24] [--white maia:2000] [--black sf:12[:30]] [--seed 1] [--judge 14]
//   node scripts/ideas/cv.ts decisions <repertoire.pgn> [--side black] [--min 2] [--depth 14] [--top 40] [--no-engine]
//   node scripts/ideas/cv.ts check   <deck.pgn> [--rep repertoire.pgn | --games model-games.pgn] [--depth 16] [--cards 12] [--no-engine] [--no-maia] [--verbose]
//   node scripts/ideas/cv.ts games   <model-games.pgn> [--after "10. Ne4 Rad8"] [--with f5] [--window 15] [--depth 4] [--min 2] [--at 10,20,30,40] [--jump 100] [--maia 2000,2200] [--game 7]
//
// `tree`, `profile`, `develop` and `decisions` read model games (Lc0 against Maia, from the owner's
// model-game generator) as a repertoire with `--games`: one tree of every game, the strong side's
// moves the ones to learn, the weaker side's carrying their share of the games (games.ts).
//
// <pos> is a FEN, `startpos`, or movetext from the start ("1. e4 d5 2. exd5 c6"). Moves are SAN or
// UCI. Stockfish is the vendored lite build unless STOCKFISH names a native binary; searches are
// kept in IDEAS_CACHE (a folder in the system's temp folder by default).
import { readFileSync } from 'node:fs';
import { Chess, type Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { parseSquare } from 'chessops/util';
import { parseUciMove } from '../../src/core/chess/uci.ts';
import { legalMoves } from '../../src/core/maia/encode.ts';
import { checkDeck, gradeMoves } from './check.ts';
import { CARDS, decisions, NATURAL, SENSIBLE_LOSS } from './decide.ts';
import { Engine, positionOf, scoreText, whiteWinPct } from './engine.ts';
import { maia, MAIA_FLOOR, maiaPolicy } from './maia.ts';
import { parsePlayer, playouts } from './playout.ts';
import { asRepertoirePgn, filterGames, gamesText, gameText, mistakes, readModelGames, replyFound, surprise } from './games.ts';
import { development, moveText, numbered, profile, readRepertoire, trunkOf, type DevMove, type Repertoire } from './tree.ts';
import { look, lookText, passTurn } from './vision.ts';

const BOOLEAN = new Set(['full', 'no-engine', 'no-maia', 'verbose', 'ours', 'leaves', 'games']);

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

/** A repertoire, or with `--games` a file of model games read as one (the strong side's moves to learn). */
function repertoireOf(path: string, flags: Map<string, string>, games = flags.has('games')): Repertoire {
  const text = readFileSync(path, 'utf8');
  const side = flags.has('side') ? sideOf(flags) : undefined;
  if (!games) return readRepertoire(text, side);
  const mg = readModelGames(text, side);
  return readRepertoire(asRepertoirePgn(mg), mg.us, { ourShares: true });
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
    case 'squares': {
      const p = readPosition(args.slice(0, -1).join(' '));
      const from = args.at(-1) ?? '';
      const square = parseSquare(from);
      const piece = square === undefined ? undefined : p.board.get(square);
      const sans = legalMoves(p).filter((m) => m.uci.startsWith(from)).map((m) => m.san);
      if (!piece || !sans.length) throw new Error(`no ${p.turn} piece on ${from} can move (${p.turn} to move)`);
      const engine = new Engine();
      const graded = (await gradeMoves(engine, p, sans, depth(18))).sort((a, b) => a.loss - b.loss);
      engine.quit();
      console.log(`Every move of the ${piece.color} ${piece.role} on ${from}, graded at depth ${depth(18)} from the mover's side; the position's best is ${graded[0]?.bestSan} ${scoreText({ cp: graded[0]?.bestCp ?? 0 })}:`);
      for (const g of graded) console.log(`  ${g.san}: ${g.band}, gives up ${g.loss.toFixed(1)}% (${scoreText({ cp: g.cp })}); line ${numbered(g.pv.slice(0, 8), p.fullmoves, p.turn)}`);
      return 0;
    }
    case 'develop': {
      const rep = repertoireOf(args[0]!, flags);
      const only = flags.get('piece');
      const all = development(rep);
      const maps = all.filter((m) => !only || m.piece === only);
      if (!maps.length) throw new Error(`no piece named ${only}: ${all.map((m) => m.piece).join(', ')}`);
      const trunk = trunkOf(rep);
      // The trunk's own moves are shown whole.
      const text = (x: DevMove) => moveText(x, x.sans.length >= trunk.length ? trunk.length : 0);
      console.log(`Development for ${rep.side}: where each of our pieces and pawns goes first, by square, in the order they come out. Reach is the share of games, summed over the positions where it goes there; "with" names what stands on the board there more than at the piece's other first squares (share here, share elsewhere).${trunk.length ? ` Lines are shown after the trunk every line starts with, ${numbered(trunk, 1, 'white')}.` : ''}`);
      for (const m of maps) {
        const head = m.squares.map((s) => `${s.to} ${pct(s.reach)}`).join(' · ');
        console.log(`\n${m.piece}: ${head || 'never moves'}${m.home ? `  (still at home at ${pct(m.home)} of line ends)` : ''}`);
        for (const s of m.squares) {
          const shown = only ? s.moves : s.moves.slice(0, 4);
          console.log(`  → ${s.to} ${pct(s.reach)}, in ${s.moves.length} position${s.moves.length === 1 ? '' : 's'}: ${shown.map((x) => `${text(x)} (${pct(x.reach)})`).join(' | ')}${s.moves.length > shown.length ? ` | +${s.moves.length - shown.length} more` : ''}`);
          if (only) for (const x of s.moves) console.log(`      ${text(x)}: FEN ${x.fen}\n        setup: ${x.setup.join(', ')}`);
          if (s.with.length) console.log(`      with: ${s.with.map(([f, a, b]) => `${f} (${pct(a)}, ${pct(b)})`).join('; ')}`);
          if (s.without.length) console.log(`      without: ${s.without.map(([f, a, b]) => `${f} (${pct(a)}, ${pct(b)})`).join('; ')}`);
        }
        if (m.routes.length) console.log(`  routes at the line ends: ${m.routes.map(([r, w]) => `${r} ${pct(w)}`).join(', ')}`);
      }
      return 0;
    }
    case 'maia': {
      const p = readPosition(args.join(' '));
      const elos = (flags.get('elo') ?? `${MAIA_FLOOR},2200`).split(',').map(Number);
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
      const rep = repertoireOf(args[0]!, flags);
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
      const rep = repertoireOf(args[0]!, flags);
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
    case 'decisions': {
      const rep = repertoireOf(args[0]!, flags);
      const engine = flags.has('no-engine') ? undefined : new Engine();
      const min = Number(flags.get('min') ?? 2) / 100;
      const ds = await decisions(rep, { policy: maiaPolicy(), engine, depth: depth(14), minReach: min });
      engine?.quit();
      const trunk = trunkOf(rep);
      const forced = (d: (typeof ds)[number]) => d.found >= NATURAL || (d.sensible !== undefined && d.sensible.length <= 1 && d.found >= 0.5);
      const cards = ds.filter((d) => !forced(d));
      console.log(`Our decisions at ${pct(min)} reach or more${trunk.length ? `, after the trunk ${numbered(trunk, 1, 'white')}` : ''}: ${ds.length} positions. Ranked by value = reach × Maia's miss × the miss's cost (a miss that costs nothing counts half).`);
      console.log(`found: Maia 2000/2200 plays the repertoire's move (or one that only changes the move order); miss: Maia's likeliest other move, and the win% it gives up against ours${engine ? ` (Stockfish depth ${depth(14)})` : ''}; sensible: our moves within ${SENSIBLE_LOSS}% of the best.`);
      console.log(`\nCandidates for cards (${cards.length}; a deck has about ${CARDS}):`);
      for (const d of cards.slice(0, Number(flags.get('top') ?? 40))) {
        console.log(`  value ${(d.value * 100).toFixed(1).padStart(4)}  reach ${pct(d.reach).padStart(4)}  ours ${d.ours.join('/')}  found ${pct(d.found)}${d.transposing ? ` (with ${d.transposing.map((o) => o.join(' ')).join(', ')}: the same position)` : ''}${d.miss ? `  miss ${d.miss.san} ${pct(d.miss.prob)}${d.cost === undefined ? '' : ` (gives up ${d.cost.toFixed(0)}%)`}` : ''}${d.sensible ? `  sensible ${d.sensible.join(' ')}` : ''}`);
        console.log(`      ${d.path}\n      FEN ${d.fen}`);
        if (d.after) console.log(`      right after ${d.after.ours.join('/')} at ${d.after.path}, in the same line: one card for both, its explanation saying the follow-up`);
      }
      const rest = ds.filter(forced);
      console.log(`\nNatural (Maia finds it ${pct(NATURAL)} or more) or forced (one sensible move): ${rest.length}. Rules of thumb and explanations, not cards:`);
      for (const d of rest) console.log(`  reach ${pct(d.reach).padStart(4)}  ${d.ours.join('/')} (found ${pct(d.found)}${d.sensible ? `, sensible ${d.sensible.join(' ')}` : ''})  ${d.path}`);
      return 0;
    }
    case 'check': {
      const engine = flags.has('no-engine') ? undefined : new Engine();
      const rep = flags.get('rep') ? readRepertoire(readFileSync(flags.get('rep')!, 'utf8')) : flags.get('games') && flags.get('games') !== 'true' ? repertoireOf(flags.get('games')!, flags, true) : undefined;
      const policy = flags.has('no-maia') ? undefined : maiaPolicy();
      const r = await checkDeck(readFileSync(args[0]!, 'utf8'), { engine, policy, depth: depth(16), rep, cards: Number(flags.get('cards') ?? CARDS), log: flags.has('verbose') ? (l) => console.log(l) : undefined });
      engine?.quit();
      for (const f of r.findings) console.log(`${f.level === 'error' ? 'ERROR' : 'warn '} ${f.chapter}: ${f.text}`);
      const errors = r.findings.filter((f) => f.level === 'error').length;
      console.log(`${r.chapters} chapters, ${r.cards} cards: ${errors} errors, ${r.findings.length - errors} warnings${engine ? `, moves graded at depth ${depth(16)}` : ', no engine'}${policy ? ', Maia 2000/2200' : ''}${rep ? `; ${r.onRepertoire} cards start at a repertoire position` : ''}.`);
      return errors ? 1 : 0;
    }
    case 'games': {
      const text = readFileSync(args[0]!, 'utf8');
      const all = readModelGames(text, flags.has('side') ? sideOf(flags) : undefined);
      const window = Number(flags.get('window') ?? 15);
      if (flags.get('game')) {
        console.log(gameText(all, Number(flags.get('game'))));
        return 0;
      }
      const mg = filterGames(all, { after: flags.get('after') ? tokens(flags.get('after')!) : undefined, with: flags.get('with'), window });
      if (flags.get('after') || flags.get('with')) console.log(`Of ${all.games.length} games, ${mg.games.length} ${flags.get('after') ? `go on ${flags.get('after')}` : ''}${flags.get('after') && flags.get('with') ? ' and ' : ''}${flags.get('with') ? `have the strong side play ${flags.get('with')} within its first ${window} moves` : ''}.\n`);
      const jump = Number(flags.get('jump') ?? 100);
      const ms = mistakes(mg, { min: jump });
      let rare;
      if (flags.get('maia')) {
        const elos = flags.get('maia')!.split(',').map(Number);
        const policy = maiaPolicy(elos);
        rare = await surprise(mg, window, policy);
        await replyFound(mg, ms.filter((m) => m.turning), policy);
      }
      console.log(gamesText(mg, {
        window,
        depth: Number(flags.get('depth') ?? 4),
        min: Number(flags.get('min') ?? 2),
        at: (flags.get('at') ?? '10,20,30,40').split(',').map(Number),
        jump,
        mistakes: ms,
        surprise: rare,
        elos: mg.games.flatMap((g) => (g.elo ? [g.elo] : [])),
      }));
      return 0;
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

