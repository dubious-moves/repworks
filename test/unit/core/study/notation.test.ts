// The notation's layout (PLAN.md §4.11, D21): Qchess's rows, variations and branches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGames } from '../../../../src/core/pgn/parse.ts';
import { notation, type Cell, type Line, type Row } from '../../../../src/core/study/notation.ts';
import type { Chapter, MoveNode } from '../../../../src/core/study/model.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';

const chapterOf = (pgn: string): Chapter => {
  const [p] = parseGames(pgn, () => 'Chapter1');
  assert.ok(p?.ok);
  return p.chapter;
};

const cell = (c: Cell) => (c === 'gap' ? '…' : c === 'none' ? '' : `${c.san}${c.glyphs}`);

/** The layout as text: one line per row, a branch indented under its line. */
function text(rows: Row[]): string {
  const out: string[] = [];
  const line = (l: Line, indent: string) => {
    out.push(indent + l.items.map((t) => (t.kind === 'move' ? `${t.number ? `${t.number} ` : ''}${t.san}${t.glyphs}` : `{${t.text}}`)).join(' '));
    for (const b of l.branches) line(b, `${indent}  `);
  };
  for (const r of rows) {
    if (r.kind === 'pair') out.push(`${r.number}. ${cell(r.white)}${r.black === 'none' ? '' : ` | ${cell(r.black)}`}`);
    else if (r.kind === 'comment') out.push(`{${r.text}}`);
    else line(r.line, '  ');
  }
  return out.join('\n');
}

test('the main line in pairs, broken by its comments and variations; a fork in a variation branches', () => {
  const c = chapterOf(
    '[Event "x"]\n\n{ Intro } 1. d4 c5 2. dxc5 e5 3. Nf3 { 22% } (3. e4 Bxc5 4. Nf3 (4. Nc3 Nf6) 4... Nf6 5. Bd3 (5. Nxe5 { If Black blocks } Qa5+) 5... d5) (3. Nc3 Bxc5) 3... e4! 4. Nfd2 Bxc5 *',
  );
  assert.equal(
    text(notation(c)),
    [
      '{Intro}',
      '1. d4 | c5',
      '2. dxc5 | e5',
      '3. Nf3 | …',
      '{22%}',
      '  3. e4 Bxc5',
      '    4. Nf3 Nf6',
      '      5. Bd3 d5',
      '      5. Nxe5 {If Black blocks} Qa5+',
      '    4. Nc3 Nf6',
      '  3. Nc3 Bxc5',
      '3. … | e4!',
      '4. Nfd2 | Bxc5',
    ].join('\n'),
  );
});

test('a start with Black to move, a comment on a Black move, and a variation of a Black move', () => {
  const c = chapterOf('[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\n1... c5 { Sicilian } 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 *');
  assert.equal(text(notation(c)), ['1. … | c5', '{Sicilian}', '2. Nf3 | d6', '  2... Nc6 3. d4', '3. d4'].join('\n'));
});

test('a fork in a variation numbers each branch and gives it its depth', () => {
  const c = chapterOf('[Event "x"]\n\n1. e4 e5 (1... c5 2. Nf3 (2. c3) 2... d6) *');
  const v = notation(c).find((r) => r.kind === 'variation');
  assert.ok(v?.kind === 'variation');
  assert.deepEqual(
    v.line.branches.map((b) => [b.depth, b.items[0]?.kind === 'move' && b.items[0].number]),
    [
      [1, '2.'],
      [1, '2.'],
    ],
  );
});

/** Every move of the layout with its number label, in order. */
function moves(rows: Row[]): { key: string; number: string | undefined }[] {
  const out: { key: string; number: string | undefined }[] = [];
  const line = (l: Line) => {
    for (const t of l.items) if (t.kind === 'move') out.push({ key: t.key, number: t.number });
    l.branches.forEach(line);
  };
  for (const r of rows) {
    if (r.kind === 'pair') for (const c of [r.white, r.black]) if (typeof c === 'object') out.push({ key: c.key, number: undefined });
    if (r.kind === 'variation') line(r.line);
  }
  return out;
}

function allPaths(c: Chapter): string[] {
  const out: string[] = [];
  const walk = (children: MoveNode[], before: string[]) => {
    for (const n of children) {
      const path = [...before, n.san];
      out.push(path.join(' '));
      walk(n.children, path);
    }
  };
  walk(c.root.children, []);
  return out;
}

test('every move shows once, numbered by its ply, on every fixture and on random trees', () => {
  const dir = join(import.meta.dirname, '../../../fixtures/pgn');
  const chapters: Chapter[] = [];
  for (const name of ['lichess-handmade-1.pgn', 'lichess-handmade-2.pgn', 'qchess-sample.pgn', 'chessable-like.pgn', 'tool-like.pgn', 'chessbase-like.pgn']) {
    for (const p of parseGames(readFileSync(join(dir, name), 'utf8'), () => 'Chapter1')) if (p.ok) chapters.push(p.chapter);
  }
  const random = mulberry32(11);
  for (let i = 0; i < 200; i++) chapters.push(randomChapter(random));
  for (const c of chapters) {
    const pos = startPosition(c);
    if (!pos) continue;
    const first = (pos.fullmoves - 1) * 2 + (pos.turn === 'white' ? 1 : 2);
    const shown = moves(notation(c));
    assert.deepEqual(shown.map((m) => m.key).sort(), allPaths(c).sort());
    for (const m of shown) {
      if (!m.number) continue;
      const ply = first + m.key.split(' ').length - 1;
      assert.equal(m.number, ply % 2 === 1 ? `${(ply + 1) / 2}.` : `${ply / 2}...`, m.key);
    }
  }
});
