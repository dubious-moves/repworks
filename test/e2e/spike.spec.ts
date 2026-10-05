// The remote spike page against a mocked GitHub and Lichess: it proves the page's own logic
// (request shapes, the order of steps, the report, redaction) before the owner runs it live.
// The mocks follow GitHub's and Lichess's documentation; the live run is what checks them.
import { test, expect, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { serveSite, type SiteServer } from './server.ts';

const TOKEN = 'fake-github-token-for-the-mocked-api';
const LICHESS_TOKEN = 'fake-lichess-token-for-the-mocked-api';
const REPO = 'skAeglund/repworks-data';

// GitHub's CORS headers, as api.github.com sent them to this project's container on 2026-10-05.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type, X-GitHub-SSO, X-GitHub-Request-Id, Deprecation, Sunset, Warning',
};

const sha1 = (s: string | Buffer) => createHash('sha1').update(s).digest('hex');
const blobSha = (text: string) => sha1(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(text)}\0`), Buffer.from(text)]));

/** A small in-memory GitHub: blobs, trees as path maps, commits and refs, with a stale check. */
class FakeGitHub {
  blobs = new Map<string, string>();
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  refs = new Map<string, string>();
  requests: string[] = [];

  constructor() {
    const readme = '# repworks-data\n';
    this.blobs.set(blobSha(readme), readme);
    const tree = this.putTree(new Map([['README.md', blobSha(readme)]]));
    this.refs.set('main', this.putCommit(tree, [], 'Initial commit'));
  }
  putTree(entries: Map<string, string>): string {
    const sha = sha1(`tree ${JSON.stringify([...entries].sort())}`);
    this.trees.set(sha, entries);
    return sha;
  }
  putCommit(tree: string, parents: string[], message: string): string {
    const sha = sha1(`commit ${tree} ${parents.join(',')} ${message} ${this.commits.size}`);
    this.commits.set(sha, { tree, parents, message });
    return sha;
  }
  isAncestor(ancestor: string, of: string): boolean {
    if (ancestor === of) return true;
    return (this.commits.get(of)?.parents ?? []).some((p) => this.isAncestor(ancestor, p));
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    this.requests.push(`${method} ${url.pathname}`);
    const auth = request.headers()['authorization'];
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { ...CORS, 'x-ratelimit-remaining': '4990', 'x-ratelimit-resource': 'core', ...headers } });
    if (auth !== `Bearer ${TOKEN}`) return json(401, { message: 'Bad credentials', status: '401' });
    const body = request.postDataJSON() as Record<string, unknown> | null;
    const base = `/repos/${REPO}`;
    const p = url.pathname;

    if (p === '/graphql') {
      const input = (body as { variables: { input: Record<string, unknown> } }).variables.input as {
        branch: { branchName: string };
        expectedHeadOid: string;
        message: { headline: string; body: string };
        fileChanges: { additions: { path: string; contents: string }[]; deletions: { path: string }[] };
      };
      const head = this.refs.get(input.branch.branchName);
      if (head !== input.expectedHeadOid) {
        return json(200, { data: { createCommitOnBranch: null }, errors: [{ type: 'STALE_DATA', path: ['createCommitOnBranch'], message: `Expected branch to point to "${input.expectedHeadOid}" but it did not. Pull and try again.` }] });
      }
      const entries = new Map(this.trees.get(this.commits.get(head)!.tree)!);
      for (const a of input.fileChanges.additions) {
        const text = Buffer.from(a.contents, 'base64').toString('utf8');
        this.blobs.set(blobSha(text), text);
        entries.set(a.path, blobSha(text));
      }
      for (const d of input.fileChanges.deletions) entries.delete(d.path);
      const tree = this.putTree(entries);
      const oid = this.putCommit(tree, [head], `${input.message.headline}\n\n${input.message.body}`);
      this.refs.set(input.branch.branchName, oid);
      return json(200, { data: { createCommitOnBranch: { commit: { oid, committedDate: '2026-10-05T00:00:00Z', tree: { oid: tree } } } } }, { 'x-ratelimit-resource': 'graphql' });
    }
    if (p === base) return json(200, { default_branch: 'main', private: true, visibility: 'private', permissions: { admin: false, push: true, pull: true } });
    if (p === '/rate_limit') return json(200, { resources: { core: { limit: 5000, remaining: 4990, used: 10 }, graphql: { limit: 5000, remaining: 5000 } } });
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^${base}/git/ref/heads/(.+)$`).exec(p)) && method === 'GET') {
      const sha = this.refs.get(m[1]!);
      if (!sha) return json(404, { message: 'Not Found' });
      const etag = `"${sha1(sha)}"`;
      if (request.headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers: { ...CORS, etag, 'x-ratelimit-remaining': '4990' } });
      return json(200, { ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } }, { etag });
    }
    if (p === `${base}/git/refs` && method === 'POST') {
      const ref = (body!['ref'] as string).replace('refs/heads/', '');
      if (this.refs.has(ref)) return json(422, { message: 'Reference already exists' });
      this.refs.set(ref, body!['sha'] as string);
      return json(201, { ref: body!['ref'], object: { sha: body!['sha'] } });
    }
    if ((m = new RegExp(`^${base}/git/refs/heads/(.+)$`).exec(p))) {
      const name = m[1]!;
      if (method === 'DELETE') {
        this.refs.delete(name);
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (method === 'PATCH') {
        const target = body!['sha'] as string;
        if (!body!['force'] && !this.isAncestor(this.refs.get(name)!, target)) return json(422, { message: 'Update is not a fast forward', status: '422' });
        this.refs.set(name, target);
        return json(200, { ref: `refs/heads/${name}`, object: { sha: target } });
      }
    }
    if ((m = new RegExp(`^${base}/git/commits/([0-9a-f]+)$`).exec(p))) {
      const c = this.commits.get(m[1]!);
      return c ? json(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : json(404, { message: 'Not Found' });
    }
    if (p === `${base}/git/commits` && method === 'POST') {
      return json(201, { sha: this.putCommit(body!['tree'] as string, body!['parents'] as string[], body!['message'] as string) });
    }
    if ((m = new RegExp(`^${base}/git/trees/([0-9a-f]+)$`).exec(p))) {
      const t = this.trees.get(m[1]!);
      return t ? json(200, { sha: m[1], truncated: false, tree: [...t].map(([path, sha]) => ({ path, type: 'blob', mode: '100644', sha })) }) : json(404, { message: 'Not Found' });
    }
    if (p === `${base}/git/trees` && method === 'POST') {
      const entries = new Map(this.trees.get(body!['base_tree'] as string)!);
      for (const e of body!['tree'] as { path: string; content?: string; sha?: string | null }[]) {
        if (e.sha === null) entries.delete(e.path);
        else if (e.content !== undefined) {
          this.blobs.set(blobSha(e.content), e.content);
          entries.set(e.path, blobSha(e.content));
        }
      }
      return json(201, { sha: this.putTree(entries) });
    }
    if ((m = new RegExp(`^${base}/git/blobs/([0-9a-f]+)$`).exec(p))) {
      return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', body: this.blobs.get(m[1]!) ?? '', headers: CORS });
    }
    if ((m = new RegExp(`^${base}/contents/(.+)$`).exec(p))) {
      const ref = url.searchParams.get('ref')!;
      const sha = this.trees.get(this.commits.get(this.refs.get(ref)!)!.tree)!.get(m[1]!);
      return sha ? route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', body: this.blobs.get(sha)!, headers: CORS }) : json(404, { message: 'Not Found' });
    }
    if ((m = new RegExp(`^${base}/compare/([0-9a-f]+)\\.\\.\\.([0-9a-f]+)$`).exec(p))) {
      const list: { sha: string; commit: { message: string } }[] = [];
      for (let at: string | undefined = m[2]; at && at !== m[1]; at = this.commits.get(at)?.parents[0]) list.unshift({ sha: at, commit: { message: this.commits.get(at)!.message } });
      return json(200, { total_commits: list.length, commits: list });
    }
    return json(404, { message: `mock: no route for ${method} ${p}` });
  }
}

async function mockLichess(page: Page): Promise<void> {
  await page.route('https://lichess.org/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/oauth') {
      const back = new URL(url.searchParams.get('redirect_uri')!);
      back.searchParams.set('code', 'liu_code');
      back.searchParams.set('state', url.searchParams.get('state')!);
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }
    if (url.pathname === '/api/token' && route.request().method() === 'POST') {
      const form = new URLSearchParams(route.request().postData() ?? '');
      const ok = form.get('code') === 'liu_code' && (form.get('code_verifier') ?? '').length >= 43;
      return route.fulfill({ status: ok ? 200 : 400, contentType: 'application/json', body: JSON.stringify(ok ? { access_token: LICHESS_TOKEN, expires_in: 31536000 } : { error: 'invalid_grant' }) });
    }
    if (url.pathname === '/api/token' && route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
    if (url.pathname === '/api/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'someone' }) });
    if (url.pathname.startsWith('/api/study/by/')) return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '{"id":"abcdefgh"}\n{"id":"ijklmnop"}\n' });
    if (url.pathname === '/api/study/abcdefgh.pgn') {
      return route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: '[Event "S: A"]\n[Orientation "black"]\n\n1. e4 *\n\n\n[Event "S: B"]\n[Orientation "white"]\n\n1. d4 *\n\n\n' });
    }
    return route.fulfill({ status: 404, body: 'mock: no route' });
  });
}

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

test('the spike runs every check against mocks, and its report holds no token', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const github = new FakeGitHub();
  await page.route('https://api.github.com/**', (route) => github.handle(route));
  await mockLichess(page);
  await page.route('https://skaeglund.github.io/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"buildStamp":"x"}', headers: { 'access-control-allow-origin': '*' } }));

  // Setup through the link the phone will open from the QR code.
  await page.goto(`${site.url}spike.html#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}`);
  await expect(page.locator('#saved')).toContainText('Saved on this device: skAeglund/repworks-data');
  expect(page.url()).not.toContain(TOKEN);

  await page.getByRole('button', { name: 'Show setup QR for the phone' }).click();
  await expect(page.locator('#qr svg')).toBeVisible();

  await page.getByRole('button', { name: 'Run the GitHub checks' }).click();
  await expect(page.locator('#log')).toContainText('Done with GitHub.', { timeout: 30_000 });
  await expect(page.locator('#log')).not.toContainText('✗');
  expect(github.refs.size).toBe(1); // the throwaway branch is gone again

  await page.getByRole('button', { name: 'Log in with Lichess' }).click();
  await expect(page.locator('#lichess-state')).toHaveText('Logged in to Lichess on this device.');
  expect(page.url()).not.toContain('code=');
  await page.locator('#study').fill('https://lichess.org/study/abcdefgh');
  await page.getByRole('button', { name: 'Run the Lichess checks' }).click();
  await expect(page.locator('#log')).toContainText('export: 2 chapter(s)');

  await page.getByRole('button', { name: 'Run the storage and dataset checks' }).click();
  await expect(page.locator('#log')).toContainText('Done with storage and the dataset.');

  await page.getByRole('button', { name: 'Copy report' }).click();
  await expect(page.locator('#log')).toContainText('Report copied');
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).not.toContain(TOKEN);
  expect(report).not.toContain(LICHESS_TOKEN);
  const parsed = JSON.parse(report) as { steps: { id: string; ok: boolean; detail: Record<string, unknown> }[] };
  const byId = new Map(parsed.steps.map((s) => [s.id, s]));
  for (const id of ['S0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G8b', 'G9', 'G10', 'G12b', 'G13', 'G14', 'G14b', 'G15', 'G16', 'G17', 'L1', 'L2', 'L3', 'L4', 'S3', 'P1']) {
    expect(byId.get(id)?.ok, `step ${id}: ${JSON.stringify(byId.get(id))}`).toBe(true);
  }
  // Chrome refuses persist() to a throwaway profile; the live run reports the real answer.
  expect(byId.get('S1')?.detail).toHaveProperty('persistGranted');
  expect(String(byId.get('G10')!.detail['fullBody'])).toContain('STALE_DATA');
  expect(String(byId.get('G14')!.detail['fullBody'])).toContain('not a fast forward');
});
