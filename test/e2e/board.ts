// Driving the board and the chapter view from Playwright.
import type { Page } from '@playwright/test';

/** The middle of a square on screen, the board seen from `orientation`. */
export async function square(page: Page, name: string, orientation: 'white' | 'black'): Promise<{ x: number; y: number }> {
  // The board can be drawn anew between finding it and measuring it (chessground redraws on a
  // new chapter or position): measured again on the board that replaced it.
  let box: { x: number; y: number; width: number; height: number } | null = null;
  for (let tries = 1; !box; tries++) {
    try {
      await page.locator('cg-board').scrollIntoViewIfNeeded();
      box = await page.locator('cg-board').boundingBox();
    } catch (e) {
      if (tries >= 5 || !/not attached/.test(String(e))) throw e;
    }
    if (!box && tries >= 5) throw new Error('cg-board has no box');
  }
  const file = name.charCodeAt(0) - 97;
  const rank = Number(name[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return { x: box.x + ((col + 0.5) * box.width) / 8, y: box.y + ((row + 0.5) * box.height) / 8 };
}

/** Clicks a square: with a piece selected, plays to it. */
export async function clickSquare(page: Page, name: string, orientation: 'white' | 'black') {
  const p = await square(page, name, orientation);
  await page.mouse.click(p.x, p.y);
}

/** Makes a chapter in the open study: from the ☰ menu with a chapter open (§5.88), or "+" in the head of a study with none. */
export async function newChapter(page: Page, name: string, side?: 'white' | 'black') {
  const direct = page.getByRole('button', { name: 'New chapter' });
  if (await direct.isVisible()) await direct.click();
  else await studyMenu(page, 'New chapter');
  const dialog = page.getByRole('dialog', { name: 'New chapter' });
  await dialog.getByLabel('Chapter name').fill(name);
  if (side) await dialog.getByLabel(side === 'white' ? 'White' : 'Black').check();
  await dialog.getByRole('button', { name: 'Create chapter' }).click();
  await dialog.waitFor({ state: 'detached' });
}

/** Opens the open chapter's settings, from the ☰ menu (§5.88). */
export async function chapterSettings(page: Page) {
  await studyMenu(page, 'Chapter settings');
  return page.getByRole('dialog', { name: 'Chapter settings' });
}

/**
 * Draws an arrow (or, from a square to itself, a circle): in draw mode where the ✎ button is
 * shown (touch), else by a right-drag, its colour from the modifier keys as chessground reads
 * them (Shift red, Alt blue, both yellow).
 */
export async function drawInDrawMode(page: Page, from: string, to: string, orientation: 'white' | 'black', brush = 'green') {
  const toggle = page.getByRole('button', { name: 'Draw mode' });
  const touch = await toggle.isVisible();
  if (touch) {
    await toggle.click();
    await page.getByRole('radio', { name: brush }).click();
  }
  const a = await square(page, from, orientation);
  const b = await square(page, to, orientation);
  const keys = { green: [], red: ['Shift'], blue: ['Alt'], yellow: ['Alt', 'Shift'] }[brush as 'green'] ?? [];
  for (const k of keys) await page.keyboard.down(k);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: touch ? 'left' : 'right' });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up({ button: touch ? 'left' : 'right' });
  for (const k of keys) await page.keyboard.up(k);
  if (touch) await toggle.click();
}

/** Picks an item of the study's ☰ menu (§5.87, §5.88, §5.90): the explorer on or off, Undo, Redo, Copy FEN, from the move shown, the study's own, Export PGN. */
export async function studyMenu(
  page: Page,
  item: 'Explorer' | 'Undo' | 'Redo' | 'Copy FEN' | 'Analyse from here' | 'Storm from here' | 'Practise from here' | 'Make a plan card' | 'Remove the plan card' | 'Make idea cards' | 'Remove the idea cards' | 'New chapter' | 'Chapter settings' | 'Export PGN' | 'Study settings',
) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'More' });
  await menu.getByRole(item === 'Explorer' ? 'menuitemcheckbox' : 'menuitem', { name: item }).click();
  await menu.waitFor({ state: 'detached' });
}

/** Opens a move's menu by a right-click on the move (the move shown when no path is given). */
export async function openMoveMenu(page: Page, path?: string) {
  await page.locator(path === undefined ? '.notation .move.current' : `.notation .move[data-path="${path}"]`).click({ button: 'right' });
  await page.getByRole('menu', { name: 'Move' }).waitFor();
}

/** Writes the comment on the move shown, through its menu and the comment dialog. */
export async function comment(page: Page, text: string) {
  await openMoveMenu(page);
  await page.getByRole('menuitem', { name: 'Comment' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill(text);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
}
