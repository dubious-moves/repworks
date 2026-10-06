// The app's sync in a real browser (PLAN.md §4.9): setup from a link, IndexedDB, Web Locks and
// the sync step against the fake GitHub of the unit tests (test/support/fakeGithub.ts), served
// through request interception with GitHub's CORS headers.
import { test, expect, type Page } from '@playwright/test';
import { FakeGit } from '../support/fakeGit.ts';
import { FakeGithub } from '../support/fakeGithub.ts';
import { fixtureFiles, REPO, TOKEN } from '../support/syncWorld.ts';
import { serveSite, type SiteServer } from './server.ts';

// GitHub's CORS headers, as api.github.com sent them to this project's container on 2026-10-05.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type, X-GitHub-SSO, X-GitHub-Request-Id, Deprecation, Sunset, Warning',
};

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

async function serveGithub(page: Page, github: FakeGithub): Promise<void> {
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': 'Authorization, Content-Type, If-None-Match, X-GitHub-Api-Version, Accept', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE' } });
    }
    let response: Response;
    try {
      response = await github.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined });
    } catch {
      return route.abort('failed');
    }
    const headers: Record<string, string> = { ...CORS };
    response.headers.forEach((value, name) => (headers[name] = value));
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
}

function world() {
  const git = new FakeGit(fixtureFiles());
  const github = new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN });
  return { git, github };
}

const setupUrl = (name: string) => `${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=${name}`;

async function deviceFile(git: FakeGit): Promise<string> {
  await expect.poll(() => [...git.textsOf().keys()].find((p) => p.startsWith('devices/') && !/Desktop1|Phone001/.test(p))).toBeTruthy();
  return [...git.textsOf().keys()].find((p) => p.startsWith('devices/') && !/Desktop1|Phone001/.test(p))!;
}

test('a setup link leaves the address bar at once, and the first sync brings the studies in', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(setupUrl('desktop'));
  await expect(page).toHaveURL(site.url);
  await expect(page.locator('.studies')).toContainText('Test repertoire');
  await expect(page.locator('.studies')).toContainText('repertoire · 2 chapters');
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  const path = await deviceFile(git);
  expect(git.textsOf().get(path)).toMatch(/^\{ "name": "desktop", "created": "\d{4}-\d\d-\d\dT[\d:.]+Z" \}\n$/);
  expect(await page.evaluate(() => location.href)).not.toContain(TOKEN);
});

test('a recorded review is pushed into this device’s day file', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(setupUrl('desktop'));
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  const id = (await deviceFile(git)).slice('devices/'.length, -'.json'.length);
  await page.getByText('Settings and debug').click();
  await page.getByRole('button', { name: 'Record a test review' }).click();
  await expect(page.locator('.chip')).toHaveText('1 change waiting');
  await page.getByRole('button', { name: 'Sync now' }).click();
  const day = new Date().toISOString().slice(0, 10);
  await expect.poll(() => git.textsOf().get(`progress/${id}/${day}.jsonl`) ?? '').toContain('"card":"r|test|e2e4"');
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(git.commits.get(git.head)!.message).toMatch(new RegExp(`^desktop: 1 event\\n\\nrepworks-sync: ${id}:\\d+$`));
});

test('another device’s commit arrives with the next sync', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(setupUrl('desktop'));
  await expect(page.locator('.studies')).toContainText('Test repertoire');
  const meta = JSON.parse(git.textsOf().get('studies/Rep0Najd/study.json')!) as Record<string, unknown>;
  git.commitIfHead(git.head, 'phone: 1 study file\n\nrepworks-sync: Phone001:7', new Map([['studies/Rep0Najd/study.json', `${JSON.stringify({ ...meta, name: 'Renamed on the phone' }, null, 2)}\n`]]), []);
  await page.locator('.chip').click();
  await expect(page.locator('.studies')).toContainText('Renamed on the phone');
});

test('a refused token keeps local work, says so, and a new token sends it', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(setupUrl('desktop'));
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  github.faults.set('commit', { kind: 'auth' });
  await page.getByText('Settings and debug').click();
  await page.getByRole('button', { name: 'Record a test review' }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('alert')).toContainText('GitHub refused the token');
  await expect(page.locator('.chip')).toHaveText('token refused');
  const commits = git.log().length;
  github.faults.set('commit', undefined);
  await page.getByLabel('Token').fill(TOKEN);
  await page.getByRole('button', { name: 'Use this token' }).click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(git.log().length).toBe(commits + 1);
});

test('the setup form refuses a malformed token before asking GitHub', async ({ page }) => {
  const { github } = world();
  await serveGithub(page, github);
  await page.goto(site.url);
  await page.getByLabel('Data repo').fill(REPO);
  await page.getByLabel('Token').fill('not a token');
  await page.getByRole('button', { name: 'Set up' }).click();
  await expect(page.getByRole('alert')).toContainText("doesn't look like a GitHub token");
  expect(github.log.length).toBe(0);
});

test('the REST write path (write=rest in the link) pushes too', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(`${setupUrl('desktop')}&write=rest`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  const id = (await deviceFile(git)).slice('devices/'.length, -'.json'.length);
  await page.getByText('Settings and debug').click();
  await expect(page.locator('.debug')).toContainText('writes via REST');
  await page.getByRole('button', { name: 'Record a test review' }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  const day = new Date().toISOString().slice(0, 10);
  await expect.poll(() => git.textsOf().get(`progress/${id}/${day}.jsonl`) ?? '').toContain('"card":"r|test|e2e4"');
  expect(github.log.filter((l) => l.method === 'PATCH').length).toBe(2);
  expect(github.log.filter((l) => l.path === '/graphql').length).toBe(0);
});
