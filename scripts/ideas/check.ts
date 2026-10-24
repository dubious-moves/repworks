// The deck's check, for the opening-ideas skill (PLAN.md §5.128): an idea deck is a PGN file of
// chapters, one idea each, in the format the owner approved: headers `ChapterName`, `Orientation`,
// `FEN`/`SetUp`, `IdeaKind`, `IdeaQuestion`, `IdeaSource`; the comment before the first move is the
// explanation, with its arrows; the main line plays the idea out; a side line marked `?` shows where
// it fails. Every chapter is read by the site's own parser and must come back unchanged from its
// writer; every arrow must start on a piece (or where an earlier arrow of the same comment ends, a
// route). A card's answers are its first move and any first move marked `!` beside it; an unmarked
// side line is a playable move that isn't the answer. Two cards that start at the same position are
// one card asked twice: a warning.
//
// The repertoire is right by definition (the owner, 2026-10-20: its moves were chosen for practical
// eval, ease of learning, transpositions and recurring moves). Where the deck's side is to move at
// a position of the repertoire, the repertoire's move is the answer and the main line's move, it is
// never marked `?`, and it isn't graded; another move of ours there is a side line (why not
// there?) that never grades better than the repertoire's. Every other move of the deck's side is graded by Stockfish on the storm's scale: unmarked
// moves must be at worst `ok`, a `?` must be `bad` or worse, a `??` a blunder, a `!` great, and a
// card's answer beyond the repertoire the best move or as good.
//
// A card is a decision a player could get wrong (the owner, 2026-10-24, after the first decks asked
// where a piece went when it had one sensible square). So the check also fails a card whose answer
// is the only sensible move (unless Maia misses it: then it is the one move that saves us), whose
// question names the answer's square, or names the piece that moves when that leaves one sensible
// move or Maia then finds it `GIVEN_AWAY` of the time (decide.ts). It warns on a card Maia finds
// unprompted, one under `RARE` reach, and a deck over its cards (an error over `MAX_CARDS`).
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { isNormal } from 'chessops/types';
import { makeSquare, parseSquare } from 'chessops/util';
import { positionKeyOf } from '../../src/core/chess/positionKey.ts';
import { standardUci } from '../../src/core/chess/uci.ts';
import { parseGames } from '../../src/core/pgn/parse.ts';
import { LICHESS_COMMENT_LIMIT } from '../../src/core/pgn/comment.ts';
import { writeChapter } from '../../src/core/pgn/write.ts';
import { STORM, type Band } from '../../src/core/storm/config.ts';
import { grade as band, wpLoss } from '../../src/core/storm/grade.ts';
import { header, type Chapter, type MoveNode, type Shape } from '../../src/core/study/model.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { cardDecision, CARDS, GIVEN_AWAY, MAX_CARDS, namedMovers, namedSquares, NATURAL, RARE, type Policy } from './decide.ts';
import { cpOf, scoreText, type Engine } from './engine.ts';
import type { Repertoire } from './tree.ts';

export const KINDS = ['overview', 'structure', 'break', 'placement', 'maneuver', 'king', 'exchange', 'tactic', 'trap', 'move-order', 'endgame'] as const;

export interface Graded {
  san: string;
  uci: string;
  /** From the mover's side, centipawns (mates as ±(10000 − distance)). */
  cp: number;
  bestSan: string;
  bestCp: number;
  /** Win% given up against the best move. */
  loss: number;
  band: Band;
  pv: string[];
}

/** Each move graded against the position's best at `depth`, from the mover's side. */
export async function gradeMoves(engine: Engine, pos: Position, sans: readonly string[], depth: number): Promise<Graded[]> {
  const fen = makeFen(pos.toSetup());
  const sign = pos.turn === 'white' ? 1 : -1;
  const best = await engine.search(fen, { depth, lines: 1 });
  const top = best.lines[0];
  if (!top) return [];
  const bestCp = cpOf(top.score) * sign;
  const out: Graded[] = [];
  for (const san of sans) {
    const move = parseSan(pos, san);
    if (!move || !isNormal(move)) throw new Error(`${san} is not legal in ${fen}`);
    const uci = standardUci(pos, move);
    const own = uci === top.pv[0] ? best : await engine.search(fen, { depth, lines: 1, moves: [uci] });
    const line = own.lines[0]!;
    const cp = cpOf(line.score) * sign;
    const loss = wpLoss(bestCp, cp, STORM) ?? 0;
    out.push({ san, uci, cp, bestSan: top.san[0] ?? '?', bestCp, loss, band: band(loss, STORM), pv: line.san });
  }
  return out;
}

export interface Finding {
  chapter: string;
  level: 'error' | 'warning';
  text: string;
}

const STORM_ORDER: readonly Band[] = ['great', 'good', 'ok', 'bad', 'blunder'];

const glyphs = (n: MoveNode) => n.nags.map((x) => ({ 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' })[x] ?? '').join('');

function arrowProblems(pos: Position, shapes: readonly Shape[]): string[] {
  const out: string[] = [];
  const ends = new Set<string>();
  for (const s of shapes) {
    if (!s.dest) continue;
    if (s.orig === s.dest) out.push(`arrow ${s.orig}${s.dest} goes nowhere`);
    else if (!pos.board.get(parseSquare(s.orig)) && !ends.has(s.orig)) out.push(`arrow ${s.orig}-${s.dest} starts on an empty square`);
    ends.add(s.dest);
  }
  return out;
}

/** Our moves at a position of the repertoire (as UCI), or undefined where it has none. */
function repertoireMoves(rep: Repertoire | undefined, pos: Position): Map<string, string> | undefined {
  const at = rep?.positions.get(positionKeyOf(pos));
  if (!at?.ours || !at.moves.length) return undefined;
  const out = new Map<string, string>();
  for (const m of at.moves) {
    const move = parseSan(pos, m.san);
    if (move && isNormal(move)) out.set(standardUci(pos, move), m.san);
  }
  return out;
}

export async function checkDeck(
  text: string,
  o: { engine?: Engine; policy?: Policy; depth: number; rep?: Repertoire; cards?: number; log?: (line: string) => void },
): Promise<{ findings: Finding[]; chapters: number; onRepertoire: number; cards: number }> {
  const findings: Finding[] = [];
  let onRepertoire = 0;
  let cards = 0;
  let n = 0;
  const parsed = parseGames(text, () => `c${++n}`);
  const starts = new Map<string, string>();
  for (const [i, p] of parsed.entries()) {
    if (!p.ok) {
      findings.push({ chapter: `#${i + 1}`, level: 'error', text: p.reason });
      continue;
    }
    const ch = p.chapter;
    const label = `#${i + 1} ${header(ch, 'ChapterName') ?? '(no ChapterName)'}`;
    const err = (t: string) => findings.push({ chapter: label, level: 'error', text: t });
    const warn = (t: string) => findings.push({ chapter: label, level: 'warning', text: t });
    // Is the card a decision, and does its question give the answer away?
    const decision = async (start: Position) => {
      const first = ch.root.children[0];
      if (!first || glyphs(first).includes('?')) return;
      const answers = [first.san, ...ch.root.children.slice(1).filter((n) => glyphs(n).includes('!') && !glyphs(n).includes('?')).map((n) => n.san)];
      const question = header(ch, 'IdeaQuestion') ?? '';
      const squares = namedSquares(question);
      for (const san of answers) {
        const move = parseSan(start, san);
        if (move && isNormal(move) && squares.includes(makeSquare(move.to))) err(`the question names ${makeSquare(move.to)}, where the answer ${san} goes: let the board ask it`);
      }
      if (!o.engine && !o.policy) return;
      const given = namedMovers(question, start, first.san);
      const d = await cardDecision(start, answers, { engine: o.engine, policy: o.policy, depth: o.depth, given });
      const pct = (x: number) => `${Math.round(x * 100)}%`;
      const maia = d.found === undefined ? '' : `; Maia plays ${answers.join(' or ')} ${pct(d.found)} here (likeliest ${d.top})`;
      o.log?.(`  ${label}: sensible moves ${d.sensible?.join(' ') ?? '?'}${given ? `; the named pieces' sensible moves ${d.pieceSensible?.join(' ') ?? '?'} of ${d.pieceMoves}, Maia ${d.foundGivenPiece === undefined ? '?' : pct(d.foundGivenPiece)} among them` : ''}${maia}`);
      // The one move that saves us is a lesson when players miss it, not when they find it anyway.
      const missed = d.found !== undefined && d.found < 0.5;
      // One sensible move is a decision still when it isn't the answer (the repertoire is right where Stockfish disagrees).
      const only = (moves: string[] | undefined) => moves !== undefined && moves.every((m) => answers.includes(m));
      if (only(d.sensible) && !missed) err(`${first.san} is the only sensible move here${maia}: nothing to decide; say it in the rules of thumb, not on a card`);
      else if (given && d.foundGivenPiece !== undefined && d.foundGivenPiece >= GIVEN_AWAY) err(`the question names the piece that moves, and then the answer is plain: Maia plays ${first.san} ${pct(d.foundGivenPiece)} of the named pieces' moves; ask without naming them`);
      else if (given && only(d.pieceSensible) && (d.foundGivenPiece === undefined || d.foundGivenPiece >= 0.5)) err(`the question names the piece that moves, and it has one sensible move (${first.san}, of ${d.pieceMoves}); ask without naming it`);
      else if (d.found !== undefined && d.found >= NATURAL) warn(`Maia plays ${first.san} ${pct(d.found)} here unprompted: a player finds it anyway; a card should be a move one could miss`);
    };
    for (const note of p.notes) {
      if (note.kind === 'illegal') err(`illegal move ${note.san} after "${note.path.join(' ')}" (cut)`);
      if (note.kind === 'long-comment') err(`a comment of ${note.length} characters; Lichess keeps ${LICHESS_COMMENT_LIMIT}`);
    }
    const kind = header(ch, 'IdeaKind');
    const side = header(ch, 'Orientation') as Color | undefined;
    if (!header(ch, 'ChapterName')) err('no ChapterName');
    if (side !== 'white' && side !== 'black') err('Orientation is not white or black');
    if (!kind || !(KINDS as readonly string[]).includes(kind)) err(`IdeaKind "${kind ?? ''}" is not one of ${KINDS.join(', ')}`);
    if (kind !== 'overview' && !header(ch, 'IdeaQuestion')) err('no IdeaQuestion');
    // repworks makes no idea card of an overview chapter: only the rules of thumb are one.
    if (kind === 'overview' && (header(ch, 'IdeaQuestion') || ch.root.children.length)) warn('an overview chapter makes no card, yet this one asks a question or has moves: give it another kind');
    if (!header(ch, 'IdeaSource')) err('no IdeaSource');
    if (!ch.root.comments.join('').trim()) err('no explanation (a comment before the first move)');
    const again = parseGames(writeChapter(ch), () => 'x')[0];
    if (!again?.ok || writeChapter(again.chapter) !== writeChapter(ch)) err('does not come back unchanged from the site’s writer');
    const start = startPosition(ch);
    if (!start) {
      err('the start position is not legal');
      continue;
    }
    // The rules of thumb make no card: several may stand at the opening's start.
    if (kind !== 'overview') {
      const key = positionKeyOf(start);
      const twin = starts.get(key);
      if (twin) warn(`starts at the same position as ${twin}: merge them (one card, both side lines)`);
      else starts.set(key, label);
      if (o.rep?.positions.has(key)) onRepertoire++;
      cards++;
      const at = o.rep?.positions.get(key);
      if (at && at.reach < RARE) warn(`the card's position is reached in ${(at.reach * 100).toFixed(1)}% of games: too rare to drill; a rule of thumb or a side line can carry it`);
      if (side && start.turn === side) await decision(start);
    }
    const rep = o.rep && o.rep.side === side ? o.rep : undefined;
    for (const t of arrowProblems(start, ch.root.shapes)) warn(`at the start: ${t}`);
    if (kind !== 'overview' && !ch.root.shapes.length) warn('no arrow or circle at the start');
    const walk = async (pos: Position, children: readonly MoveNode[], line: string[], main: boolean) => {
      const ours = repertoireMoves(rep, pos);
      for (const [k, node] of children.entries()) {
        const move = parseSan(pos, node.san);
        if (!move) continue;
        const next = pos.clone();
        next.play(move);
        const here = [...line, node.san];
        for (const t of arrowProblems(next, node.shapes)) warn(`after ${here.join(' ')}: ${t}`);
        const mark = glyphs(node);
        const where = `${here.join(' ')}${mark}${k > 0 ? ' (side line)' : ''}`;
        // The card's answers: its first move, unless marked ?, and any first move marked ! beside it.
        const answer = !line.length && (k === 0 ? !mark.includes('?') : mark.includes('!') && !mark.includes('?'));
        const inRepertoire = ours && isNormal(move) ? ours.has(standardUci(pos, move)) : false;
        const theirs = ours ? [...ours.values()].join(' or ') : '';
        if (ours && side && pos.turn === side) {
          if (inRepertoire && mark.includes('?')) err(`${where} is the repertoire's move, marked ${mark}: the deck teaches the repertoire, never calls its move a mistake`);
          else if (!inRepertoire && answer) err(`${where} answers the card, but the repertoire plays ${theirs} here: the answer is the repertoire's move`);
          else if (!inRepertoire && main && k === 0) err(`the main line leaves the repertoire at ${where}: it plays ${theirs} here`);
        }
        if (o.engine && side) {
          const [g] = await gradeMoves(o.engine, pos, [node.san], o.depth);
          if (g) {
            const detail = `${g.band}, gives up ${g.loss.toFixed(1)}% (${scoreText({ cp: g.cp })} against ${g.bestSan} ${scoreText({ cp: g.bestCp })}, mover's view)`;
            o.log?.(`  ${label}: ${where}: ${detail}${inRepertoire ? ' (the repertoire’s move)' : ''}`);
            if (ours && pos.turn === side && !inRepertoire && !mark.includes('?')) {
              // Another square shown beside the repertoire's move is fine (why not there?), a better one is not.
              const [r] = await gradeMoves(o.engine, pos, [ours.values().next().value!], o.depth);
              if (r && STORM_ORDER.indexOf(g.band) < STORM_ORDER.indexOf(r.band)) warn(`${where} grades ${g.band}, better than the repertoire's ${r.san} (${r.band}): the deck teaches the repertoire's move and offers no better one; leave it out`);
            }
            if (pos.turn === side && !inRepertoire) {
              if (!ours && !line.length && k === 0 && g.band !== 'great') warn(`the card's move ${where} is ${detail}: beyond the repertoire, its answer should be the best move or as good`);
              if (mark.includes('!') && !mark.includes('?') && g.band !== 'great') err(`${where} is marked ${mark} but is ${detail}`);
              else if (mark.includes('??') && g.band !== 'blunder') err(`${where} is marked ?? but is ${detail}`);
              else if (mark === '?' && g.band !== 'bad' && g.band !== 'blunder') err(`${where} is marked ? but is ${detail}`);
              else if (mark === '?!' && (g.band === 'great' || g.band === 'good')) warn(`${where} is marked ?! but is ${detail}`);
              else if (!mark.includes('?') && (g.band === 'bad' || g.band === 'blunder')) err(`${where} is not a good move for the deck's side: ${detail}`);
            } else if (pos.turn !== side && g.band === 'blunder' && !mark.includes('?')) {
              warn(`the opponent's ${where} is a blunder (${detail}); mark it ? if the line shows a trap, or give a better reply`);
            }
          }
        }
        await walk(next, node.children, here, main && k === 0);
      }
    };
    await walk(start, ch.root.children, [], true);
  }
  const budget = o.cards ?? CARDS;
  if (cards > MAX_CARDS) findings.push({ chapter: 'the deck', level: 'error', text: `${cards} cards; a deck has ${budget} or so, never more than ${MAX_CARDS}: keep the decisions worth most (cv.ts decisions)` });
  else if (cards > budget) findings.push({ chapter: 'the deck', level: 'warning', text: `${cards} cards, more than the ${budget} asked for: keep the decisions worth most (cv.ts decisions)` });
  return { findings, chapters: parsed.length, onRepertoire, cards };
}
