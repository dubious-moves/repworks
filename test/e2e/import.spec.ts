// Import in a real browser (PLAN.md §4.10): a Qchess export file, pasted PGN that needs its
// sides, a Lichess study, and the Lichess login (PKCE) for a private one. GitHub is the fake of
// the unit tests; lichess.org is answered through request interception, with the CORS header it
// sends (checked live from the build container on 2026-10-05: Access-Control-Allow-Origin: *).
import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const ROOT = join(import.meta.dirname, '..', '..');
const fixture = (name: string) => readFileSync(join(ROOT, 'test/fixtures/pgn', name), 'utf8');
const LICHESS_EXPORT = `${fixture('lichess-handmade-1.pgn')}\n\n${fixture('lichess-handmade-2.pgn')}\n\n`;
const LICHESS_TOKEN = 'test_token_lichess_000000';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

/** The studies in the repo after a sync: name → [kind, chapter files' texts in order]. */
function studiesIn(git: FakeGit): Map<string, { kind: string; chapters: string[] }> {
  const texts = git.textsOf();
  const out = new Map<string, { kind: string; chapters: string[] }>();
  for (const [path, text] of texts) {
    if (!path.endsWith('/study.json')) continue;
    const meta = JSON.parse(text) as { id: string; name: string; kind: string; chapters: string[] };
    out.set(meta.name, { kind: meta.kind, chapters: meta.chapters.map((cid) => texts.get(`studies/${meta.id}/${cid}.pgn`)!) });
  }
  return out;
}

async function syncAndWait(page: Page, git: FakeGit, name: string): Promise<void> {
  await page.locator('.chip').click();
  await expect.poll(() => studiesIn(git).has(name)).toBe(true);
}

function qchessExport(): string {
  const toPgn = runInNewContext(readFileSync(join(ROOT, 'scripts/qchess-export.js'), 'utf8'), { console: { log: () => undefined } }) as (study: unknown) => string;
  return toPgn({
    name: 'Sicilian',
    folders: [{ id: 'f', name: 'Games', chapter_uuids: ['g'], exclude_from_movetrainer: true }],
    chapters: [
      { name: 'Najdorf', pgn: '[ChapterName "Najdorf"]\n\n1. e4 c5 2. Nf3 d6 {[%cal Rd2d4] Prepare d4} 3. d4 *', perspective: 'black', chapter_uuid: 'n' },
      { name: 'Fischer game', pgn: '1. e4 c5 2. Nf3 *', perspective: 'black', chapter_uuid: 'g' },
    ],
  });
}

test('a Qchess export file imports as a repertoire and a companion reference study, and syncs', async ({ page }) => {
  const git = await setUp(page);
  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page).toHaveURL(/#\/import$/);
  await page.getByLabel('File').setInputFiles({ name: 'Sicilian.qchess.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(qchessExport()) });
  await expect(page.getByRole('heading', { name: 'Import 2 chapters' })).toBeVisible();
  await expect(page.getByLabel('Study name')).toHaveValue('Sicilian');
  await expect(page.getByLabel('Side of Najdorf')).toHaveValue('black');
  await expect(page.locator('.review')).toContainText('“Sicilian (reference)”');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').or(page.locator('.banner'))).toContainText('Imported “Sicilian” (repertoire, 1 chapter) and “Sicilian (reference)” (reference, 1 chapter)');
  await expect(page.locator('.studies')).toContainText('Sicilian (reference)');
  await expect(page.locator('.chip')).toHaveText(/changes? waiting/);
  await syncAndWait(page, git, 'Sicilian');
  const studies = studiesIn(git);
  expect(studies.get('Sicilian')!.kind).toBe('repertoire');
  expect(studies.get('Sicilian')!.chapters[0]).toBe('[StudyName "Sicilian"]\n[ChapterName "Najdorf"]\n[Orientation "black"]\n\n1. e4 c5 2. Nf3 d6 { Prepare d4 } { [%cal Rd2d4] } 3. d4\n');
  expect(studies.get('Sicilian (reference)')!.kind).toBe('reference');
  expect(studies.get('Sicilian (reference)')!.chapters[0]).toContain('[QchessTrain "false"]');
  const meta = [...git.textsOf()].find(([p, t]) => p.endsWith('study.json') && t.includes('"Sicilian"'))![1];
  expect(JSON.parse(meta).source).toMatchObject({ kind: 'qchess', name: 'Sicilian.qchess.pgn' });
});

test('pasted PGN without sides waits for them; the import report lists what changed', async ({ page }) => {
  await setUp(page);
  await page.goto(`${site.url}#/import`);
  await page.getByLabel('Or paste PGN').fill(`${fixture('qchess-sample.pgn')}\n[Event "Broken"]\n\n1. e4 e5 2. Ke3 *\n`);
  await page.getByRole('button', { name: 'Read the pasted PGN' }).click();
  await expect(page.getByRole('heading', { name: 'Import 3 chapters' })).toBeVisible();
  const importButton = page.getByRole('button', { name: 'Import', exact: true });
  await expect(page.locator('.review')).toContainText('3 chapters have no side');
  await expect(importButton).toBeDisabled();
  await page.getByLabel('Side of Broken').selectOption('white');
  await expect(page.locator('.review')).toContainText('2 chapters have no side');
  await page.getByRole('button', { name: 'Black' }).click();
  await expect(page.getByLabel('Side of Najdorf 6.Bg5')).toHaveValue('black');
  await expect(page.getByLabel('Side of Broken')).toHaveValue('white');
  await page.getByText(/Import report: 1 note/).click();
  await expect(page.locator('.report')).toContainText('Broken: Ke3 after 1. e4 e5 is not a legal move');
  await expect(page.locator('.report')).toContainText('Headers kept: ChapterName (2), Event (2)');
  await page.getByLabel('Study name').fill('Pasted');
  await importButton.click();
  await expect(page.locator('.studies')).toContainText('Pasted');
  await expect(page.locator('.study-card', { hasText: 'Pasted' })).toContainText(/Repertoire.*3 chapters/);
});

/** Answers lichess.org: the given studies (public, or private needing the token), OAuth, account. */
async function serveLichess(page: Page, studies: { id: string; name: string; pgn: string; private?: boolean }[]) {
  const seen: { url: string; auth: string | undefined; body?: string }[] = [];
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://lichess.org/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const auth = request.headers()['authorization'];
    seen.push({ url: request.url(), auth, body: request.postData() ?? undefined });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, DELETE' } });
    const authed = auth === `Bearer ${LICHESS_TOKEN}`;
    if (url.pathname === '/oauth') {
      // Lichess's consent page, already approved: straight back with a code.
      const back = `${url.searchParams.get('redirect_uri')}?code=the-code&state=${url.searchParams.get('state')}`;
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back)})</script>` });
    }
    if (url.pathname === '/api/token' && request.method() === 'POST') return route.fulfill({ headers: cors, json: { token_type: 'Bearer', access_token: LICHESS_TOKEN, expires_in: 31536000 } });
    if (url.pathname === '/api/account') return route.fulfill({ headers: cors, status: authed ? 200 : 401, json: { username: 'Owner' } });
    if (url.pathname === '/api/study/by/Owner') {
      const visible = studies.filter((s) => authed || !s.private);
      return route.fulfill({ headers: { ...cors, 'content-type': 'application/x-ndjson' }, body: visible.map((s) => JSON.stringify({ id: s.id, name: s.name })).join('\n') + '\n' });
    }
    const study = studies.find((s) => url.pathname === `/api/study/${s.id}.pgn`);
    if (study && (authed || !study.private)) {
      expect(url.searchParams.get('orientation')).toBe('true');
      expect(url.searchParams.get('clocks')).toBe('false');
      return route.fulfill({ headers: { ...cors, 'content-type': 'application/x-chess-pgn' }, body: study.pgn });
    }
    return route.fulfill({ headers: cors, status: 404, body: 'Not found' });
  });
  return seen;
}

test('a public Lichess study imports from its URL, each chapter as Lichess exported it', async ({ page }) => {
  const git = await setUp(page);
  await serveLichess(page, [{ id: 'AbCd1234', name: 'Rep', pgn: LICHESS_EXPORT }]);
  await page.goto(`${site.url}#/import`);
  await page.getByLabel('Study URL or ID').fill('https://lichess.org/study/AbCd1234/WxYz5678');
  await page.getByRole('button', { name: 'Fetch the study' }).click();
  await expect(page.getByLabel('Study name')).toHaveValue('Rep');
  await expect(page.getByLabel('Side of Najdorf')).toHaveValue('black');
  await expect(page.getByLabel('Side of Endgame')).toHaveValue('white');
  await page.getByLabel('Reference (read only, never trained)').check();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.study-card').filter({ has: page.getByRole('link', { name: 'Rep', exact: true }) })).toContainText(/Reference.*2 chapters/);
  await syncAndWait(page, git, 'Rep');
  const chunks = LICHESS_EXPORT.split('\n\n\n').filter((c) => c.trim()).map((c) => `${c}\n`);
  expect(studiesIn(git).get('Rep')).toEqual({ kind: 'reference', chapters: chunks });
});

test('a private study needs the Lichess login; after it, the study list and the export carry the token', async ({ page }) => {
  await setUp(page);
  const seen = await serveLichess(page, [
    { id: 'Pub11111', name: 'Public one', pgn: fixture('lichess-handmade-2.pgn') },
    { id: 'Priv2222', name: 'Private rep', pgn: LICHESS_EXPORT, private: true },
  ]);
  await page.goto(`${site.url}#/import`);
  await page.getByLabel('Study URL or ID').fill('Priv2222');
  await page.getByRole('button', { name: 'Fetch the study' }).click();
  await expect(page.getByRole('alert')).toContainText('A private one needs you to log in with Lichess');

  await page.getByRole('button', { name: 'log in with Lichess' }).click();
  // Back from Lichess: the code is gone from the address, and the import screen is open again.
  await expect(page.locator('.banner')).toContainText('Logged in with Lichess as Owner');
  await expect(page).toHaveURL(`${site.url}#/import`);
  expect(await page.evaluate(() => localStorage.getItem('repworks-lichess-pkce'))).toBeNull();
  const exchange = new URLSearchParams(seen.find((s) => s.url === 'https://lichess.org/api/token')!.body);
  expect(exchange.get('code')).toBe('the-code');
  expect(exchange.get('redirect_uri')).toBe(site.url);
  expect(exchange.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);

  await expect(page.getByLabel('Or list the studies of')).toHaveValue('Owner');
  await page.getByRole('button', { name: 'List studies' }).click();
  await page.getByRole('button', { name: 'Private rep' }).click();
  await expect(page.getByRole('heading', { name: 'Import 2 chapters' })).toBeVisible();
  expect(seen.find((s) => s.url.includes('/api/study/Priv2222.pgn') && s.auth)?.auth).toBe(`Bearer ${LICHESS_TOKEN}`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.studies')).toContainText('Rep');

  // Logging out forgets the token here and revokes it on Lichess.
  await page.goto(`${site.url}#/import`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'log in with Lichess' })).toBeVisible();
  await expect.poll(() => seen.some((s) => s.url === 'https://lichess.org/api/token' && s.auth === `Bearer ${LICHESS_TOKEN}`)).toBe(true);
});

test('the Qchess export script can be copied from the import screen', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only here');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setUp(page);
  await page.goto(`${site.url}#/import`);
  await page.getByRole('button', { name: 'Copy the export script' }).click();
  await expect(page.locator('section', { hasText: 'From Qchess' })).toContainText('Copied.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(readFileSync(join(ROOT, 'scripts/qchess-export.js'), 'utf8'));
});
