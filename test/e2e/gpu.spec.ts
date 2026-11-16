// Maia and Lc0 on the graphics processor (PLAN.md §5.184), with Chromium's software WebGPU
// adapter (SwiftShader, `--enable-unsafe-webgpu`) and the real network: the switch in the
// engine's settings, its runtime downloaded once, Lc0 checked against the processor and then
// answering from the graphics processor with the reference's numbers, the choice kept over a
// reload, and off again. Maia on the same adapter: its model needs 16-bit floats in shaders,
// which the software adapter lacks, so its worker falls back to the processor, says why, and
// answers all the same: the fallback, by a real failure.
//
// The software adapter is never faster than the processor, so the test sets `evenIfSlower` in
// the device's choice; without it the worker keeps the processor ("it is no faster here"),
// which the second test asks.
//
// Control run on 2026-11-15: with the worker never asked to check (`ask: 'trust'` from the first
// start), the first test fails where Lc0's note is read: "on the graphics processor." with no
// timings, since nothing was run on the processor to set it against.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { fakeEngine } from './engine.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

interface Ref {
  name: string;
  top5: { san: string; prob: number }[];
}
const refs = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'lc0', 'reference.json'), 'utf8')) as Ref[];
const fmt = (p: number) => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);
const top3 = (name: string) => refs.find((r) => r.name === name)!.top5.slice(0, 3).map((m) => `${m.san} ${fmt(m.prob)}`);

const executablePath = process.env.REPWORKS_CHROMIUM;
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu'], ...(executablePath ? { executablePath } : {}) } });

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite({ engine: fakeEngine() });
});
test.afterEach(async () => {
  await site.close();
});

async function openChapter(page: Page, prefs: { evenIfSlower?: boolean } = {}) {
  await page.addInitScript((p) => localStorage.getItem('repworks-gpu') ?? localStorage.setItem('repworks-gpu', JSON.stringify({ on: false, ...p })), prefs);
  await serveGithub(page, world().github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
}

/** Whether this Chromium offers a WebGPU adapter (the software one, with the flag above). */
const hasAdapter = (page: Page) => page.evaluate(async () => !!(await (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter().catch(() => null)));

const gpuFiles = (s: SiteServer) => s.requests.filter((r) => /\/engines\/ort-wasm-simd-threaded\.[0-9a-f]+\.jspi\./.test(r));

async function lc0On(page: Page) {
  const panel = page.getByRole('region', { name: 'Engine' });
  await panel.getByRole('switch', { name: 'Lc0' }).check();
  await page.getByRole('dialog', { name: 'Enable Lc0' }).getByRole('button', { name: /^Download/ }).click();
  await expect(page.getByRole('dialog', { name: 'Enable Lc0' })).toHaveCount(0, { timeout: 30_000 });
  return panel.getByLabel('Lc0', { exact: true }).and(page.locator('.lc0-row'));
}

async function openSettings(page: Page) {
  await page.getByRole('region', { name: 'Engine' }).getByRole('button', { name: 'Engine settings' }).click();
  return page.getByTestId('gpu-choice');
}
const closeSettings = (page: Page) => page.getByRole('dialog', { name: 'Engine settings' }).getByRole('button', { name: 'Cancel' }).click();

test('the switch: its runtime downloaded once, Lc0 checked and answering from the graphics processor, Maia falling back; kept, and off', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same Chromium as the desktop project');
  test.setTimeout(240_000);
  // The first model, which needs 16-bit floats in shaders (the 23M's export doesn't, §5.188): the default is the 23M since §5.191.
  await page.addInitScript(() => localStorage.getItem('repworks-maia') ?? localStorage.setItem('repworks-maia', JSON.stringify({ on: false, rating: 0, model: 'maia3' })));
  await openChapter(page, { evenIfSlower: true });
  test.skip(!(await hasAdapter(page)), 'this Chromium offers no WebGPU adapter, even a software one');

  // Lc0 on the processor first: the reference's numbers at the start.
  const row = await lc0On(page);
  await expect(row.locator('.lc0-move')).toHaveText(top3('start'), { timeout: 30_000 });
  expect(gpuFiles(site)).toEqual([]);

  // The switch, in the engine's settings: off, and saying what on costs.
  let choice = await openSettings(page);
  const box = choice.getByRole('checkbox');
  await expect(box).toBeEnabled();
  await expect(box).not.toBeChecked();
  await expect(choice.getByTestId('gpu-note')).toContainText('Off: both run on the processor. On downloads a runtime of 16.8 MB once');
  // On: the runtime downloaded (its wasm and its loader), Lc0's worker started again and checked.
  await box.check();
  await expect(choice.getByTestId('gpu-note')).toContainText('Maia: not started yet.', { timeout: 60_000 });
  await expect(choice.getByTestId('gpu-note')).toContainText(/Lc0: on the graphics processor, [\d.]+ ms a run against [\d.]+ on the processor\./, { timeout: 120_000 });
  await expect(box).toBeChecked();
  expect(gpuFiles(site)).toHaveLength(2);
  await closeSettings(page);

  // A position not asked before, answered by the graphics processor: the reference's numbers.
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(row.locator('.lc0-move')).toHaveText(top3('1. e4'), { timeout: 60_000 });

  // Maia on the same adapter: no 16-bit floats in its shaders, so the processor, said with the reason; it answers.
  await page.getByRole('switch', { name: 'Maia' }).check();
  await page.getByRole('dialog', { name: 'Enable Maia' }).getByRole('button', { name: /^Download/ }).click();
  await expect(page.getByRole('dialog', { name: 'Enable Maia' })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.maia-switch')).toHaveAttribute('data-state', 'ready', { timeout: 120_000 });
  choice = await openSettings(page);
  await expect(choice.getByTestId('gpu-note')).toContainText(/Maia: on the processor \(the graphics processor failed: .*f16/);
  await expect(choice.getByTestId('gpu-note')).toContainText('Lc0: on the graphics processor');
  await closeSettings(page);

  // Kept over a reload: checked again by the new page's worker, nothing downloaded twice.
  await page.reload();
  await expect(row.locator('.lc0-move')).toHaveText(top3('1. e4'), { timeout: 120_000 });
  choice = await openSettings(page);
  await expect(choice.getByRole('checkbox')).toBeChecked();
  await expect(choice.getByTestId('gpu-note')).toContainText('Lc0: on the graphics processor', { timeout: 120_000 });
  expect(gpuFiles(site)).toHaveLength(2);

  // Off: the workers start again on the processor, and answer as before.
  await choice.getByRole('checkbox').uncheck();
  await expect(choice.getByTestId('gpu-note')).toContainText('Off: both run on the processor.');
  await closeSettings(page);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(row.locator('.lc0-move')).toHaveCount(3, { timeout: 60_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('repworks-gpu')!).on)).toBe(false);
});

test('where the graphics processor is no faster, the processor is kept and the settings say so', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same Chromium as the desktop project');
  test.setTimeout(180_000);
  await openChapter(page);
  test.skip(!(await hasAdapter(page)), 'this Chromium offers no WebGPU adapter, even a software one');
  const row = await lc0On(page);
  await expect(row.locator('.lc0-move')).toHaveText(top3('start'), { timeout: 30_000 });
  const choice = await openSettings(page);
  await choice.getByRole('checkbox').check();
  // The software adapter is slower than wasm: timed on both, the processor kept.
  await expect(choice.getByTestId('gpu-note')).toContainText(/Lc0: on the processor \(it is no faster here: [\d.]+ ms a run against [\d.]+ on the processor\)\./, { timeout: 120_000 });
  await closeSettings(page);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(row.locator('.lc0-move')).toHaveText(top3('1. e4'), { timeout: 60_000 });
});

test('no WebGPU here: the switch can’t be taken, and says why', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same Chromium as the desktop project');
  // The page without `navigator.gpu`, as a browser without WebGPU.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true }));
  await openChapter(page);
  const choice = await openSettings(page);
  await expect(choice.getByRole('checkbox')).toBeDisabled();
  await expect(choice.getByTestId('gpu-note')).toHaveText('This browser has no WebGPU. They run on the processor.');
  expect(gpuFiles(site)).toEqual([]);
});
