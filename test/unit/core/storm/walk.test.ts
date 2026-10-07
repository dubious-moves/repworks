// The storm's walks (PLAN.md §5.39): lichessable's dev/check-storm.js sections 4 (the pick rules),
// 6 (the PGN reader), 7 (the walk), 8 (the card), 11 (the ply range), 12 (the invented line), 13
// (the shared candidate builder) and the random factor of section 15, ported. The scripted book
// generates each position's real legal moves (ChessDB only scores legal moves) and hands out a
// descending ladder of scores. Left behind: section 7's funnel counters (lichessable's report of
// its own gather passes; the gather here counts its stops in §5.42) and the chapter-scope filters
// (§5.40's scopes are over the repertoire index, in sources.test.ts).
//
// Controls re-run on this port (2026-10-06), each failing exactly the named assertions:
// - `pickReject`'s spread5 rule removed → "the pick rules" and "a flat book offers nothing" fail;
// - `reentered` ignoring the side to move → "re-entry is the user’s own move only" fails;
// - the blunder stop asked of the user's moves only → "the blunder stop fires on both sides" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM, withPlyRange, type StormConfig } from '../../../../src/core/storm/config.ts';
import { gamesFromPgn } from '../../../../src/core/storm/games.ts';
import type { ScoredList, ScoredMove } from '../../../../src/core/storm/grade.ts';
import { advance, bestMove, candidate, drawFrontier, fenAfterUci, pickGames, pickReject, positionOf, randomLine, reentered, sanToUci, START_FEN, uciToSan, walkGame } from '../../../../src/core/storm/walk.ts';
import { positionKey, type PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';

const C = STORM;

test('the pick rules, in order, with the band’s edges in', () => {
  const cand = (over: Partial<Parameters<typeof pickReject>[0]>) => ({ evalUser: 20, nScored: 20, inCheck: false, recapture: false, spread2: 15, spread5: 120, ...over });
  assert.equal(pickReject(cand({}), C), null);
  assert.equal(pickReject(cand({ evalUser: C.userLoCp - 1 }), C), 'you are losing');
  assert.equal(pickReject(cand({ evalUser: C.userHiCp + 1 }), C), 'you are already winning');
  assert.deepEqual([pickReject(cand({ evalUser: C.userLoCp }), C), pickReject(cand({ evalUser: C.userHiCp }), C)], [null, null]);
  assert.equal(pickReject(cand({ nScored: C.minScored - 1 }), C), 'too few moves scored to rank an answer');
  assert.equal(pickReject(cand({ inCheck: true }), C), 'in check — the choice is narrow');
  assert.equal(pickReject(cand({ recapture: true }), C), 'forced recapture');
  assert.equal(pickReject(cand({ spread5: C.spreadMinCp - 1 }), C), 'flat — nothing to get wrong');
  assert.equal(pickReject(cand({ spread5: C.spreadMinCp }), C), null);
  assert.equal(pickReject(cand({ spread2: C.spreadMaxCp + 1 }), C), 'one move only — a tactic, not intuition');
  assert.equal(pickReject(cand({ evalUser: -900, spread5: 0 }), C), 'you are losing');
});

test('the PGN reader: a batch export to ids and moves, comments and glyphs left out', () => {
  const pgn = [
    '[Event "Rated blitz game"]',
    '[Site "https://lichess.org/DST7LbuE"]',
    '[Result "1-0"]',
    '',
    '1. e4 { [%eval 0.2] } e5 2. Nf3 $1 Nc6 3. Bb5 a6 1-0',
    '',
    '',
    '[Event "Rated rapid game"]',
    '[GameId "abcdEFGH"]',
    '',
    '1. d4 d5 (1... Nf6) 0-1',
  ].join('\n');
  const games = gamesFromPgn(pgn);
  assert.deepEqual(
    games.map((g) => [g.id, g.sans]),
    [
      ['DST7LbuE', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']],
      ['abcdEFGH', ['d4', 'd5']],
    ],
  );
  assert.deepEqual(gamesFromPgn(''), []);
});

// --- the scripted book ------------------------------------------------------------------------
const LADDER = [0, -12, -40, -60, -130, -200];

function legalUcis(fen: string): string[] {
  const pos = positionOf(fen)!;
  const out: string[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from)!;
      const promo = piece.role === 'pawn' && (to >> 3 === 7 || to >> 3 === 0);
      for (const promotion of promo ? (['queen'] as const) : [undefined]) {
        const move = promotion ? { from, to, promotion } : { from, to };
        out.push(standardUci(pos, move));
      }
    }
  }
  return [...new Set(out)].sort();
}

function scoredFor(fen: string, base: number, override?: (out: ScoredMove[]) => void): ScoredList {
  const pos = positionOf(fen)!;
  const out: ScoredMove[] = legalUcis(fen)
    .slice(0, LADDER.length)
    .map((uci, i) => ({ uci, san: uciToSan(pos, uci), score: base + LADDER[i]!, winrate: 54 - i }));
  if (override) override(out);
  out.sort((a, b) => b.score - a.score);
  return out;
}
const book = (base: number) => (fen: string) => Promise.resolve(scoredFor(fen, base));

const gameSans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
const gameFens = (() => {
  const out = [START_FEN];
  let fen = START_FEN;
  for (const san of gameSans) {
    fen = fenAfterUci(fen, sanToUci(positionOf(fen)!, san)!)!;
    out.push(fen);
  }
  return out;
})();
/** The frontier: 1. e4 e5 2. Nf3 Nc6 3. Bb5, a White line, so Black is to move there. */
const fFen = gameFens[5]!;
const playedAt = new Map(gameSans.map((san, i) => [positionKey(gameFens[i]!), sanToUci(positionOf(gameFens[i]!)!, san)!]));

const blunderBook = (fen: string) =>
  Promise.resolve(
    scoredFor(fen, 20, (out) => {
      const played = playedAt.get(positionKey(fen));
      if (!played) return;
      const hit = out.find((m) => m.uci === played);
      if (hit) hit.score = 20 - C.blunderCp - 10;
      else out.push({ uci: played, san: uciToSan(positionOf(fen)!, played), score: 20 - C.blunderCp - 10, winrate: 20 });
    }),
  );

const leadsTo = (arrived: { before: string; uci: string } | null, fen: string) => {
  if (!arrived) return false;
  const after = fenAfterUci(arrived.before, arrived.uci);
  return Boolean(after) && positionKey(after!) === positionKey(fen);
};

test('an ordinary walk: the user to move, from minPly, with the move that led there and the whole list', async () => {
  const w = await walkGame(fFen, 'white', gameSans, book(20), C);
  assert.equal(w.found, true);
  assert.ok(w.out.length > 0);
  assert.ok(w.out.every((c) => c.fen.split(' ')[1] === 'w'));
  assert.ok(w.out.every((c) => c.ply >= C.minPly));
  assert.ok(w.out.some((c) => !c.reject));
  assert.ok(w.out.every((c) => leadsTo(c.arrived, c.fen)));
  assert.equal(w.out[0]!.scored.length, LADDER.length);
  assert.equal(w.stop, 'the game ended');
  assert.equal(w.out[0]!.evalUser, w.out[0]!.scored[0]!.score);
});

test('the frontier’s own last move is its arrival', async () => {
  const w = await walkGame(fFen, 'black', gameSans, book(20), { ...C, minPly: 1 });
  assert.equal(w.out[0]!.arrived!.san, 'Bb5');
  assert.ok(leadsTo(w.out[0]!.arrived, fFen));
});

test('the stop rules: never reached, nothing scored, decided, the blunder on both sides, the ply limit', async () => {
  const elsewhere = await walkGame(fFen, 'white', ['d4', 'd5', 'c4', 'e6'], book(20), C);
  assert.deepEqual([elsewhere.found, elsewhere.stop], [false, 'never reached the frontier']);
  const unknown = await walkGame(fFen, 'white', gameSans, () => Promise.resolve(null), C);
  assert.deepEqual([unknown.stop, unknown.out.length], ['nothing could score this position', 0]);
  const decided = await walkGame(fFen, 'white', gameSans, book(C.decidedCp + 50), C);
  assert.deepEqual([decided.stop, decided.out.length], ['the position is already decided', 0]);
  const short = await walkGame(fFen, 'white', gameSans, book(20), { ...C, maxPly: 2 });
  assert.equal(short.stop, 'the walk reached its ply limit');
});

test('the blunder stop fires on both sides', async () => {
  assert.equal((await walkGame(fFen, 'white', gameSans, blunderBook, C)).stop, 'the opponent erred here');
  assert.equal((await walkGame(fFen, 'black', gameSans, blunderBook, { ...C, minPly: 1 })).stop, 'you would have erred here');
});

test('re-entry is the user’s own move only (§14.18.4)', async () => {
  // The position after 4. Ba4 with White to move, which a White line reaching it would answer.
  const covered = new Set<PositionKey>([positionKey(gameFens[6]!)]);
  assert.equal(gameFens[6]!.split(' ')[1], 'w');
  const free = await walkGame(fFen, 'white', gameSans, book(20), C);
  const stopped = await walkGame(fFen, 'white', gameSans, book(20), C, covered);
  assert.equal(stopped.stop, 'your own lines answer this position');
  assert.equal(stopped.out.length, 0);
  const oppOnly = new Set<PositionKey>([positionKey(gameFens[7]!)]);
  const opp = await walkGame(fFen, 'white', gameSans, book(20), C, oppOnly);
  assert.deepEqual([opp.out.length, opp.stop], [free.out.length, free.stop]);
  assert.equal(reentered(covered, positionOf(gameFens[6]!)!, 'white'), true);
  assert.equal(reentered(covered, positionOf(gameFens[6]!)!, 'black'), false);
  assert.equal(reentered(null, positionOf(gameFens[6]!)!, 'white'), false);
});

test('a flat book offers nothing, and says why', async () => {
  const flat = await walkGame(fFen, 'white', gameSans, (fen) => Promise.resolve(scoredFor(fen, 20).map((m, i) => ({ ...m, score: 20 - i }))), C);
  assert.ok(flat.out.every((c) => c.reject));
  assert.equal(flat.out[0]!.reject, 'flat — nothing to get wrong');
});

test('the card’s best move: one ply, spelled by our generator, refused when it won’t resolve', async () => {
  const w = await walkGame(fFen, 'white', gameSans, book(20), C);
  const usable = w.out.find((c) => !c.reject)!;
  const best = bestMove(usable)!;
  assert.equal(best.uci, usable.scored[0]!.uci);
  assert.equal(best.san, uciToSan(positionOf(usable.fen)!, usable.scored[0]!.uci));
  assert.equal(best.fenAfter, fenAfterUci(usable.fen, usable.scored[0]!.uci));
  assert.equal(best.score, usable.scored[0]!.score);
  assert.equal(bestMove({ ...usable, scored: [{ uci: 'a1a8', score: 0 }] }), null);
});

test('the ply range is a setting the walk keeps (§14.9)', async () => {
  const ranged = (lo: number, hi: number): StormConfig => ({ ...C, minPly: lo, maxPly: hi });
  const fromOne = await walkGame(fFen, 'white', gameSans, book(20), ranged(1, 16));
  const fromFour = await walkGame(fFen, 'white', gameSans, book(20), ranged(4, 16));
  assert.ok(fromOne.out.length >= fromFour.out.length);
  assert.ok(fromFour.out.every((c) => c.ply >= 4));
  assert.ok(Math.min(...fromOne.out.map((c) => c.ply)) <= 2);
  const capped = await walkGame(fFen, 'white', gameSans, book(20), ranged(1, 3));
  assert.ok(capped.out.every((c) => c.ply <= 3));
  assert.equal(capped.stop, 'the walk reached its ply limit');
  assert.deepEqual([withPlyRange(C, 0, 99).minPly, withPlyRange(C, 0, 99).maxPly], [1, C.maxPlyMax]);
  assert.deepEqual([withPlyRange(C, 8, 4).minPly, withPlyRange(C, 8, 4).maxPly], [8, 8]);
});

test('the invented line: marked, bounded to the top moves, stopped by nothing scored or decided', async () => {
  let seq = 0;
  const cyc = () => {
    seq = (seq * 1103515245 + 12345) % 2147483648;
    return (seq >>> 8) / 8388608;
  };
  const seed = { san: 'Bb5', uci: 'f1b5', before: gameFens[4]! };
  const invented = await randomLine(fFen, 'black', book(20), C, cyc, seed);
  assert.equal(invented.found, true);
  assert.equal(invented.invented, true);
  assert.ok(invented.out.every((c) => c.fen.split(' ')[1] === (c.userColor === 'white' ? 'w' : 'b')));
  assert.ok(invented.out.every((c) => c.invented));
  assert.ok(invented.out.every((c) => c.ply <= C.maxPly));
  if (invented.out.length) assert.ok(invented.out[0]!.arrived);
  for (const r of [() => 0, () => 0.999]) {
    const seen: ScoredList[] = [];
    const spy = (fen: string) => {
      const l = scoredFor(fen, 20);
      seen.push(l);
      return Promise.resolve(l);
    };
    const line = await randomLine(fFen, 'black', spy, { ...C, minPly: 1 }, r, null);
    const chosen = line.out.slice(1).map((c) => c.arrived!.uci);
    assert.ok(
      chosen.every((u) =>
        seen.some((l) => {
          const i = l.findIndex((m) => m.uci === u);
          return i >= 0 && i < C.randomTopN && l[0]!.score - l[i]!.score <= C.randomTopCp;
        }),
      ),
    );
  }
  assert.equal((await randomLine(fFen, 'black', () => Promise.resolve(null), C, cyc, null)).stop, 'nothing could score this position');
  const decided = await randomLine(fFen, 'black', book(C.decidedCp + 50), C, cyc, null);
  assert.deepEqual([decided.stop, decided.out.length], ['the position is already decided', 0]);
});

test('the candidate builder: the eval, the spreads, the recapture; advance’s arrival', () => {
  const pos = positionOf(fFen)!;
  const sc = scoredFor(fFen, 20);
  const built = candidate({ fen: fFen, pos, scored: sc, ply: 3, userSide: 'black', arrived: null }, C);
  assert.equal(built.evalUser, 20);
  assert.equal(built.nScored, sc.length);
  assert.deepEqual([built.spread2, built.spread5], [sc[0]!.score - sc[1]!.score, sc[0]!.score - sc[4]!.score]);
  assert.equal(built.reject, null);
  assert.equal(built.invented, false);
  const bestTo = sc[0]!.uci.slice(2, 4);
  assert.equal(candidate({ fen: fFen, pos, scored: sc, ply: 3, userSide: 'black', prevCapSq: bestTo }, C).reject, 'forced recapture');
  assert.equal(candidate({ fen: fFen, pos, scored: sc, ply: 3, userSide: 'black', prevCapSq: 'h6' }, C).reject, null);
  const adv = advance(fFen, pos, 'a7a6')!;
  assert.equal(adv.fen, fenAfterUci(fFen, 'a7a6'));
  assert.equal(adv.prevCapSq, null);
  assert.equal(adv.arrived.uci, 'a7a6');
  assert.equal(adv.arrived.before, fFen);
  assert.equal(advance(fFen, pos, 'a1a8'), null);
  // A capture names its square; en passant too.
  const ep = fenAfterUci(fenAfterUci(fenAfterUci(fenAfterUci(START_FEN, 'e2e4')!, 'a7a6')!, 'e4e5')!, 'd7d5')!;
  assert.equal(advance(ep, positionOf(ep)!, 'e5d6')!.prevCapSq, 'd6');
});

test('the random factor: games picked without repeats, the source left alone', () => {
  const gs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id }));
  const ids = (arr: { id: string }[]) => arr.map((g) => g.id).join('');
  assert.equal(pickGames(gs, 2, () => 0).length, 2);
  assert.equal(ids(pickGames(gs, 2, () => 0)), 'ab');
  assert.equal(ids(pickGames(gs, 2, () => 0.999)), 'ha');
  assert.equal(new Set(pickGames(gs, 3, () => 0.5).map((g) => g.id)).size, 3);
  assert.equal(pickGames(gs, 20, () => 0.5).length, 8);
  assert.equal(ids(gs), 'abcdefgh');
  assert.equal(pickGames([], 2, () => 0.5).length, 0);
  assert.equal(pickGames(null, 2, () => 0.5).length, 0);
  assert.ok(pickGames(gs, 2, () => 1).every((g) => g && g.id));
});

test('the frontier draw: weighted, removing what it hands out', () => {
  const pool = [{ n: 1 }, { n: 1 }, { n: 1 }];
  const drawn = [drawFrontier(pool, () => 0.99), drawFrontier(pool, () => 0), drawFrontier(pool, () => 0.5)];
  assert.equal(pool.length, 0);
  assert.equal(new Set(drawn).size, 3);
  assert.equal(drawFrontier(pool, () => 0), null);
  const weighted = [
    { n: 90, tag: 'fat' },
    { n: 10, tag: 'thin' },
  ];
  assert.equal(drawFrontier(weighted, () => 0.99)!.tag, 'thin');
});
