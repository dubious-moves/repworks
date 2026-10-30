// Draws in practice (the owner's request, 2026-10-30), on a desktop viewport and an emulated phone:
// a game from a king-and-pawn ending at move 30 against Stockfish (no Lichess login, Maia off), the
// fake engine scoring every position level. A draw offered after one move is declined (five level
// moves are needed) and can't be offered again at that position; offered after five, it is
// accepted, the game a draw. The repetition draw is checked in checklist.spec.ts, through a
// checklist's lead-up.
import { test, expect } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { fakeEngine } from './engine.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

const START_FEN = '4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 30';
// The user's king walks to the queenside, the opponent's to the kingside: no position stands twice.
const USER = ['Kd1', 'Kc1', 'Kb1', 'Ka1', 'Ka2'];
const OPPONENT = ['Kf8', 'Kg8', 'Kh8', 'Kh7', 'Kg7'];
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Every position's three lines at 0.00, the opponent's planned move first where it has one. */
function levelLines(): (fen: string) => [number, number, string][] {
  const planned = new Map<string, string>();
  const pos = Chess.fromSetup(parseFen(START_FEN).unwrap()).unwrap();
  USER.forEach((u, i) => {
    pos.play(parseSan(pos, u)!);
    const m = parseSan(pos, OPPONENT[i]!)!;
    planned.set(key(makeFen(pos.toSetup())), makeUci(m));
    pos.play(m);
  });
  return (fen) => {
    const p = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    const legal: string[] = [];
    for (const [from, dests] of p.allDests()) for (const to of dests) legal.push(makeUci({ from, to }));
    const first = planned.get(key(fen));
    const moves = [...(first ? [first] : []), ...legal.filter((m) => m !== first)].slice(0, 3);
    return moves.map((m, i) => [i + 1, 0, m]);
  };
}

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({ engine: fakeEngine(undefined, {}, true), engineLines: levelLines() });
});
test.afterAll(async () => {
  await site.close();
});

test('a draw offered: declined too early in the game’s level run, accepted after five level moves', async ({ page }) => {
  test.setTimeout(90_000);
  const { github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
  await page.evaluate((fen) => (location.hash = '#/practice?fen=' + encodeURIComponent(fen)), START_FEN);
  const game = page.locator('.practice-game');
  const offer = page.getByTestId('practice-offer-draw');
  const move = async (i: number) => {
    await expect(game).toHaveAttribute('data-moves', String(i * 2));
    await expect(game).toHaveAttribute('data-phase', 'user');
    const pos = Chess.fromSetup(parseFen(START_FEN).unwrap()).unwrap();
    for (let k = 0; k < i; k++) (pos.play(parseSan(pos, USER[k]!)!), pos.play(parseSan(pos, OPPONENT[k]!)!));
    const u = makeUci(parseSan(pos, USER[i]!)!);
    await clickSquare(page, u.slice(0, 2), 'white');
    await clickSquare(page, u.slice(2, 4), 'white');
  };
  await move(0);
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await offer.click();
  await expect(page.getByTestId('practice-draw-offer')).toHaveText('The opponent declines the draw.');
  await expect(offer).toBeDisabled();
  for (let i = 1; i < USER.length; i++) {
    await move(i);
    await expect(page.getByTestId('practice-draw-offer')).toHaveCount(0);
  }
  await expect(game).toHaveAttribute('data-moves', String(USER.length * 2));
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(offer).toBeEnabled();
  await offer.click();
  await expect(page.getByTestId('practice-end')).toContainText('Draw agreed. Counted as a draw.');
});
