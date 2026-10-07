// Games in core (PLAN.md §5.50) and the items found in them (§5.52): mistake-lab's analyzer
// shape read, the replay, and the extraction's per-game items against mistake-lab's own code run
// on the same games (test/fixtures/games/README.md says how they were made).
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the advantage counted from ply 15 → "the same items as mistake-lab, game by game"
//   (synthEdge15);
// - `heldAdvantage` reset with the run below +300 → "the same items as mistake-lab, game by
//   game" (synthHeld);
// - the time-trouble rule's `moveTime` from the previous ply instead of the user's previous move
//   → "the same items as mistake-lab, game by game", "the clock rule" and "each advantage
//   exclusion".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { positionKey, type PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { readGame, readGamesFile, resultFor, userColor, type GameRecord } from '../../../../src/core/games/record.ts';
import { replay } from '../../../../src/core/games/positions.ts';
import { extractGame, shownItems, winPct, type GameItem } from '../../../../src/core/games/extract.ts';
import { readChesscomGame } from '../../../../src/core/games/chesscom.ts';

const DIR = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'games');
const file: unknown = JSON.parse(readFileSync(join(DIR, 'analyzed_games.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(DIR, 'mistake-lab-items.json'), 'utf8')) as Record<string, { pid: string; type: string; san?: string; wpDrop?: number; cpBefore?: number; cpAfter?: number; timeTrouble?: boolean; peakCp?: number }[]>;
const { games, problems } = readGamesFile(file);

test('the analyzer file read: every game, the user’s colour, clocks in seconds, the tactics', () => {
  assert.deepEqual(problems, []);
  assert.equal(games.length, 24);
  const byId = new Map(games.map((g) => [g.id, g]));
  const g = byId.get('HmLzqg5C')!;
  assert.equal(g.color, 'black');
  assert.equal(g.platform, 'lichess');
  assert.ok(g.evals!.length >= g.moves.length - 1, 'an eval for each ply (Lichess leaves out the last after a mate)');
  assert.ok(g.clocks!.every((c) => c === null || (c >= 0 && c < 200)), 'seconds, not centiseconds');
  const t = byId.get('nrmBGiQF')!.tactics!;
  assert.equal(t.length, 1);
  assert.equal(t[0]!.startPly, 23);
  assert.ok(t[0]!.lines[0]!.length >= 3 && t[0]!.lines[0]![0]!.user);
  assert.equal(resultFor(byId.get('HmLzqg5C')!), 'win');
  assert.equal(resultFor(byId.get('1fLwz7QO')!), 'draw');
});

test('Lichess’s own export: clocks in centiseconds, its analysis read as evals', () => {
  const r = readGame(
    {
      id: 'abcdefgh',
      rated: true,
      variant: 'standard',
      speed: 'blitz',
      createdAt: 1,
      status: 'resign',
      winner: 'black',
      players: { white: { user: { name: 'Someone', id: 'someone' }, rating: 1500 }, black: { user: { name: 'Me', id: 'me' }, rating: 1600 } },
      moves: 'e4 e5',
      clocks: [18003, 17950],
      analysis: [{ eval: 20 }, { eval: 15, best: 'g1f3', variation: 'Nf3', judgment: { name: 'Inaccuracy' } }],
    },
    new Set(['me']),
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.game.clocks, [180, 179.5]);
  assert.deepEqual(r.game.evals, [{ cp: 20 }, { cp: 15 }]);
  assert.equal(r.game.color, 'black');
  assert.equal(r.game.white.rating, 1500);
});

test('a chess.com game as the analyzer writes it: its result, ratings and time loss from the PGN', () => {
  const pgn = '[Event "Live Chess"]\n[White "Me"]\n[Black "Them"]\n[Result "0-1"]\n[WhiteElo "1500"]\n[BlackElo "1550"]\n[Termination "Them won on time"]\n\n1. e4 e5 0-1';
  const r = readGame({ id: 'chesscom_123', moves: 'e4 e5', analysis: null, rated: false, players: { white: { user: { name: 'Me', id: 'me' } }, black: { user: { name: 'Them', id: 'them' } } }, createdAt: 5, speed: 'blitz', pgn, _source: 'chesscom', _playerColor: 'white' }, new Set());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.game.platform, 'chesscom');
  assert.equal(r.game.winner, 'black');
  assert.equal(r.game.status, 'outoftime');
  assert.equal(r.game.rated, false);
  assert.equal(r.game.black.rating, 1550);
  assert.equal(r.game.color, 'white', '_playerColor when no name is known');
  assert.equal(r.game.evals, undefined);
});

test('the colour rule: a known name on one side decides, then the analyzer’s stamp, then white', () => {
  const w = { name: 'A', id: 'a' };
  const b = { name: 'B', id: 'b' };
  assert.equal(userColor(w, b, new Set(['b'])), 'black');
  assert.equal(userColor(w, b, new Set(['a', 'b']), 'black'), 'black');
  assert.equal(userColor(w, b, new Set(), undefined), 'white');
  assert.equal(readGame({ id: 'x', moves: 'e4', variant: 'chess960', players: {} }, new Set()).ok, false);
});

test('the replay: keys as positionKey, castling in standard UCI, a move that won’t replay ends it', () => {
  const r = replay({ moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'Qxh7'] })!;
  assert.equal(r.plies.length, 8);
  assert.equal(r.plies[6]!.uci, 'e1g1');
  assert.equal(r.plies[6]!.keyBefore, positionKey(r.plies[6]!.fenBefore));
  assert.deepEqual(r.stopped, { ply: 9, san: 'Qxh7' });
  const fromFen = replay({ initialFen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1', moves: ['O-O'] })!;
  assert.equal(fromFen.plies[0]!.uci, 'e1g1');
});

test('the same items as mistake-lab, game by game', () => {
  for (const g of games) {
    const mine = extractGame(g).items;
    const want = expected[g.id]!;
    // Shown as mistake-lab shows them: an advantage stands for the mistakes from its ply.
    const shown = shownItems(mine, () => false);
    assert.deepEqual(
      shown.map((it) => it.pid).sort(),
      want.map((w) => w.pid).sort(),
      `${g.id}: pids`,
    );
    for (const w of want) {
      const it = mine.find((x) => x.pid === w.pid)!;
      assert.equal(it.kind, w.type, `${w.pid}: kind`);
      if (it.kind === 'mistake') {
        assert.equal(it.san, w.san, `${w.pid}: san`);
        assert.equal(it.wpDrop, w.wpDrop, `${w.pid}: wpDrop`);
        assert.equal(it.cpBefore, w.cpBefore, `${w.pid}: cpBefore`);
        assert.equal(it.cpAfter, w.cpAfter, `${w.pid}: cpAfter`);
        assert.equal(it.timeTrouble, w.timeTrouble, `${w.pid}: timeTrouble`);
      }
      if (it.kind === 'advantage') assert.equal(it.peakCp, w.peakCp, `${w.pid}: peakCp`);
    }
  }
});

const game = (over: Partial<GameRecord>): GameRecord => ({
  id: 'g1',
  platform: 'lichess',
  createdAt: 0,
  speed: 'blitz',
  rated: true,
  color: 'white',
  white: { name: 'Me', id: 'me' },
  black: { name: 'You', id: 'you' },
  status: 'resign',
  moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5'],
  ...over,
});
const cps = (...v: number[]) => v.map((cp) => ({ cp }));

test('the threshold: a drop of more than 10 points of win% is a mistake, 10 is not', () => {
  // White's 4th ply… the user's moves are plies 1, 3, 5, 7. A drop at ply 7 from +0 to x.
  const ten = (() => {
    let lo = 0;
    let hi = 1000;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (winPct(0) - winPct(-mid) > 10) hi = mid;
      else lo = mid;
    }
    return lo;
  })();
  const at = (after: number) => extractGame(game({ evals: cps(0, 0, 0, 0, 0, 0, after, 0) })).items.filter((i) => i.kind === 'mistake').length;
  assert.equal(at(-Math.floor(ten)), 0);
  assert.equal(at(-Math.ceil(ten) - 1), 1);
});

test('the clock rule: under 45 s left and under 10 s spent on the move', () => {
  const evals = cps(0, 0, 0, 0, 0, 0, -400, 0);
  const at = (c5: number, c7: number) => (extractGame(game({ evals, clocks: [60, 60, 60, 60, c5, 60, c7, 60] })).items[0] as GameItem & { timeTrouble: boolean }).timeTrouble;
  assert.equal(at(50, 44), true);
  assert.equal(at(54, 44), false, '10 s spent');
  assert.equal(at(50, 45), false, '45 s left');
  const m = extractGame(game({ evals, clocks: [60, 60, 60, 60, 50, 60, 44] })).items[0]!;
  assert.ok(m.kind === 'mistake' && m.clock === 44 && m.moveTime === 6);
});

test('the repertoire’s own move is not a mistake', () => {
  const evals = cps(0, 0, 0, 0, 0, 0, -400, 0);
  const all = extractGame(game({ evals })).items;
  assert.equal(all.length, 1);
  const m = all[0]!;
  assert.ok(m.kind === 'mistake');
  const none = extractGame(game({ evals }), (key: PositionKey, uci: string) => key === m.key && uci === m.uci).items;
  assert.equal(none.length, 0);
});

test('a tactic needs three plies and two of the user’s moves', () => {
  const line = (n: number, users: number) => Array.from({ length: n }, (_, k) => ({ uci: 'e2e4', san: 'e4', user: k < users }));
  const t = (n: number, users: number) => extractGame(game({ tactics: [{ startPly: 3, fenBefore: '', color: 'white', lines: [line(n, users)], wpSwing: 30, found: false }] })).items.length;
  assert.equal(t(3, 2), 1);
  assert.equal(t(2, 2), 0);
  assert.equal(t(3, 1), 0);
});

test('a dropped advantage gives its mistakes back', () => {
  const g = games.find((x) => x.id === 'synthAdv1')!;
  const items = extractGame(g).items;
  const adv = items.find((i) => i.kind === 'advantage')!;
  assert.ok(adv.kind === 'advantage' && adv.replaces.length > 0);
  assert.equal(shownItems(items, () => false).length, 2);
  assert.equal(shownItems(items, (pid) => pid === adv.pid).length, items.length - 1);
});

test('each advantage exclusion: won, lost on time while ahead, collapsed in time trouble', () => {
  const by = (id: string) => extractGame(games.find((x) => x.id === id)!);
  assert.equal(by('synthAdv3').advantageSkipped, 'won');
  assert.equal(by('synthAdv4').advantageSkipped, 'time-loss');
  assert.equal(by('_test_clocks_6sS121tG').advantageSkipped, 'time-trouble');
  assert.equal(by('synthAdv2').advantageSkipped, undefined, 'lost on time while behind keeps it');
});

test('a chess.com archive game: its id, side, time class and clocks, as the analyzer normalizes it', () => {
  const pgn = '[Event "Live Chess"]\n[White "Me"]\n[Black "Them"]\n[Result "1-0"]\n[TimeControl "180+2"]\n[Termination "Me won by resignation"]\n\n1. e4 {[%clk 0:03:01.5]} 1... e5 {[%clk 0:03:00]} 2. Nf3 {[%clk 0:02:59]} 2... Nc6 {[%clk 0:02:58]} 3. Bb5 {[%clk 0:02:57]} 3... a6 {[%clk 0:02:50.2]} 1-0';
  const g = readChesscomGame({ url: 'https://www.chess.com/game/live/123456', pgn, rules: 'chess', rated: true, end_time: 1700000000 }, 'me')!;
  assert.equal(g.id, 'chesscom_123456');
  assert.equal(g.platform, 'chesscom');
  assert.equal(g.color, 'white');
  assert.equal(g.speed, 'blitz');
  assert.equal(g.winner, 'white');
  assert.equal(g.status, 'resign');
  assert.deepEqual(g.clocks, [181.5, 180, 179, 178, 177, 170.2]);
  assert.equal(g.createdAt, 1700000000000);
  assert.equal(readChesscomGame({ pgn: '[Event "x"]\n\n1. e4 e5 *', rules: 'chess' }, 'me'), undefined, 'under six plies');
  assert.equal(readChesscomGame({ pgn, rules: 'chess960' }, 'me'), undefined);
});
