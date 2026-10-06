// The fake GitHub of the unit tests (test/support/fakeGithub.ts), served to the browser through
// request interception with the CORS headers api.github.com sends.
import type { Page } from '@playwright/test';
import { FakeGit } from '../support/fakeGit.ts';
import { FakeGithub } from '../support/fakeGithub.ts';
import { fixtureFiles, REPO, TOKEN } from '../support/syncWorld.ts';

// GitHub's CORS headers, as api.github.com sent them to this project's container on 2026-10-05.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type, X-GitHub-SSO, X-GitHub-Request-Id, Deprecation, Sunset, Warning',
};

export async function serveGithub(page: Page, github: FakeGithub): Promise<void> {
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

export function world() {
  const git = new FakeGit(fixtureFiles());
  const github = new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN });
  return { git, github };
}
