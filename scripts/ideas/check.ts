// The deck's check, for the opening-ideas skill (PLAN.md §5.128): an idea deck is a PGN file of
// chapters, one idea each, in the format the owner approved: headers `ChapterName`, `Orientation`,
// `FEN`/`SetUp`, `IdeaKind`, `IdeaQuestion`, `IdeaSource`; the comment before the first move is the
// explanation, with its arrows; the main line plays the idea out; a side line marked `?` shows where
// it fails. Every chapter is read by the site's own parser and must come back unchanged from its
// writer; every arrow must start on a piece (or where an earlier arrow of the same comment ends, a
// route); every move of the deck's side is graded by Stockfish on the storm's scale: unmarked
// moves must be at worst `ok`, a `?` must be `bad` or worse, a `??` a blunder, a `!` great. A card's
// answers are its first move and any first move marked `!` beside it; an unmarked side line is a
// playable move that isn't the answer. Two chapters that start at the same position are one card
// asked twice: a warning.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';
import { isNormal } from 'chessops/types';
import { parseSquare } from 'chessops/util';
import { positionKeyOf } from '../../src/core/chess/positionKey.ts';
import { standardUci } from '../../src/core/chess/uci.ts';
import { parseGames } from '../../src/core/pgn/parse.ts';
import { LICHESS_COMMENT_LIMIT } from '../../src/core/pgn/comment.ts';
import { writeChapter } from '../../src/core/pgn/write.ts';
import { STORM, type Band } from '../../src/core/storm/config.ts';
import { grade as band, wpLoss } from '../../src/core/storm/grade.ts';
import { header, type Chapter, type MoveNode, type Shape } from '../../src/core/study/model.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { cpOf, scoreText, type Engine } from './engine.ts';

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

export async function checkDeck(text: string, o: { engine?: Engine; depth: number; log?: (line: string) => void }): Promise<{ findings: Finding[]; chapters: number }> {
  const findings: Finding[] = [];
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
    if (!header(ch, 'IdeaSource')) err('no IdeaSource');
    if (!ch.root.comments.join('').trim()) err('no explanation (a comment before the first move)');
    const again = parseGames(writeChapter(ch), () => 'x')[0];
    if (!again?.ok || writeChapter(again.chapter) !== writeChapter(ch)) err('does not come back unchanged from the site’s writer');
    const start = startPosition(ch);
    if (!start) {
      err('the start position is not legal');
      continue;
    }
    const key = positionKeyOf(start);
    const twin = starts.get(key);
    if (twin) warn(`starts at the same position as ${twin}: merge them (one card, both side lines)`);
    else starts.set(key, label);
    for (const t of arrowProblems(start, ch.root.shapes)) warn(`at the start: ${t}`);
    if (kind !== 'overview' && !ch.root.shapes.length) warn('no arrow or circle at the start');
    const walk = async (pos: Position, children: readonly MoveNode[], line: string[]) => {
      for (const [k, node] of children.entries()) {
        const move = parseSan(pos, node.san);
        if (!move) continue;
        const next = pos.clone();
        next.play(move);
        const here = [...line, node.san];
        for (const t of arrowProblems(next, node.shapes)) warn(`after ${here.join(' ')}: ${t}`);
        if (o.engine && side) {
          const [g] = await gradeMoves(o.engine, pos, [node.san], o.depth);
          if (g) {
            const mark = glyphs(node);
            const where = `${here.join(' ')}${mark}${k > 0 ? ' (side line)' : ''}`;
            const detail = `${g.band}, gives up ${g.loss.toFixed(1)}% (${scoreText({ cp: g.cp })} against ${g.bestSan} ${scoreText({ cp: g.bestCp })}, mover's view)`;
            o.log?.(`  ${label}: ${where}: ${detail}`);
            if (pos.turn === side) {
              // The card's answers: its first move, and any first move marked ! beside it.
              if (!line.length && k === 0 && g.band !== 'great') warn(`the card's move ${where} is ${detail}: its answer should be the best move or as good`);
              if (mark.includes('!') && !mark.includes('?') && g.band !== 'great') err(`${where} is marked ${mark} but is ${detail}`);
              else if (mark.includes('??') && g.band !== 'blunder') err(`${where} is marked ?? but is ${detail}`);
              else if (mark === '?' && g.band !== 'bad' && g.band !== 'blunder') err(`${where} is marked ? but is ${detail}`);
              else if (mark === '?!' && (g.band === 'great' || g.band === 'good')) warn(`${where} is marked ?! but is ${detail}`);
              else if (!mark.includes('?') && (g.band === 'bad' || g.band === 'blunder')) err(`${where} is not a good move for the deck's side: ${detail}`);
            } else if (g.band === 'blunder' && !mark.includes('?')) {
              warn(`the opponent's ${where} is a blunder (${detail}); mark it ? if the line shows a trap, or give a better reply`);
            }
          }
        }
        await walk(next, node.children, here);
      }
    };
    await walk(start, ch.root.children, []);
  }
  return { findings, chapters: parsed.length };
}
