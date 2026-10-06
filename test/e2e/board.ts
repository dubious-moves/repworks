// Driving the board and the chapter view from Playwright.
import type { Page } from '@playwright/test';

/** The middle of a square on screen, the board seen from `orientation`. */
export async function square(page: Page, name: string, orientation: 'white' | 'black'): Promise<{ x: number; y: number }> {
  await page.locator('cg-board').scrollIntoViewIfNeeded();
  const box = (await page.locator('cg-board').boundingBox())!;
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

export async function openDrawer(page: Page) {
  const drawer = page.locator('details.drawer');
  if (!(await drawer.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Chapter and study').click();
}

/** Draws an arrow (or, from a square to itself, a circle) in draw mode. */
export async function drawInDrawMode(page: Page, from: string, to: string, orientation: 'white' | 'black', brush = 'green') {
  await page.getByRole('button', { name: 'Draw mode' }).click();
  await page.getByRole('radio', { name: brush }).click();
  const a = await square(page, from, orientation);
  const b = await square(page, to, orientation);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Draw mode' }).click();
}

/** Opens a move's menu: by a right-click on the move, or for the move shown by the ⋯ button. */
export async function openMoveMenu(page: Page, path?: string) {
  if (path === undefined) await page.getByRole('button', { name: 'Move menu' }).click();
  else await page.locator(`.notation .move[data-path="${path}"]`).click({ button: 'right' });
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
