// The GitHub adapters' own behaviour (PLAN.md §4.9), beyond the sync suite they share: how
// GitHub's answers are sorted into errors, the fallbacks, and what the request counter sees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha } from '../../../src/core/sync/gitHash.ts';
import { RemoteError } from '../../../src/core/sync/ports.ts';
import { failureOf, repoInfo, type Answer, type GithubConfig, type RequestInfo } from '../../../src/platform/github.ts';
import { graphqlRemote } from '../../../src/platform/githubGraphql.ts';
import { restRemote } from '../../../src/platform/githubRest.ts';
import { FakeGit } from '../../support/fakeGit.ts';
import { FakeGithub } from '../../support/fakeGithub.ts';
import { REPO, TOKEN } from '../../support/syncWorld.ts';

const fast = { concurrent: 8, perSecond: Infinity };

function setup(options: { treesByCommit?: boolean; visibility?: 'private' | 'public' } = {}) {
  const git = new FakeGit(new Map([['README.md', '# data\n'], ['bom.pgn', '﻿[Event "x"]\n\n*\n']]));
  const github = new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN, ...options });
  const seen: RequestInfo[] = [];
  const config: GithubConfig = { repo: REPO, branch: 'main', token: TOKEN, fetch: github.fetch, pace: fast, onRequest: (i) => seen.push(i) };
  return { git, github, config, seen };
}

const answer = (status: number, body: unknown, headers: Record<string, string> = {}): Answer => ({ status, headers: new Headers(headers), text: JSON.stringify(body), json: body });
const config: GithubConfig = { repo: REPO, branch: 'main', token: TOKEN, now: () => 1_000_000 };

test("GitHub's errors are sorted by what the app must do about them", () => {
  const reason = (a: Answer) => {
    const e = failureOf(config, a);
    return [e.reason, e.retryAfterMs];
  };
  assert.deepEqual(reason(answer(401, { message: 'Bad credentials' })), ['auth', undefined]);
  assert.deepEqual(reason(answer(429, { message: 'secondary rate limit' }, { 'retry-after': '30' })), ['rate', 30_000]);
  assert.deepEqual(reason(answer(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1600' })), ['rate', 600_000]);
  assert.deepEqual(reason(answer(403, { message: 'You have exceeded a secondary rate limit.' })), ['rate', undefined]);
  assert.deepEqual(reason(answer(403, { message: 'Resource not accessible by personal access token' })), ['setup', undefined]);
  assert.deepEqual(reason(answer(404, { message: 'Not Found' })), ['setup', undefined]);
  assert.match(failureOf(config, answer(409, { message: 'Git Repository is empty.' })).message, /is empty: add a README/);
  assert.deepEqual(reason(answer(502, { message: 'Server Error' })), ['server', undefined]);
});

test('no answer at all is a network failure', async () => {
  const remote = restRemote({ ...config, fetch: async () => Promise.reject(new TypeError('Failed to fetch')) });
  await assert.rejects(remote.head(), (e: unknown) => e instanceof RemoteError && e.reason === 'network');
});

test('the repo info says which branch and whether the repo is private', async () => {
  const { config: c } = setup({ visibility: 'public' });
  assert.deepEqual(await repoInfo(c), { defaultBranch: 'main', private: false, canWrite: true });
});

test("a tree is read by the commit's SHA, or through the commit if GitHub refuses that", async () => {
  for (const treesByCommit of [true, false]) {
    const { git, config: c, seen } = setup({ treesByCommit });
    const tree = await restRemote(c).files(git.head);
    // Read by the commit's SHA, GitHub's answer doesn't say which tree it is (spike G6b).
    assert.equal(tree.tree, treesByCommit ? '' : git.commits.get(git.head)!.tree);
    assert.deepEqual([...tree.files.keys()], ['README.md', 'bom.pgn']);
    assert.equal(seen.length, treesByCommit ? 1 : 3);
  }
});

test("a REST commit builds on its parent's tree as GitHub states it, never on a tree SHA kept from before", async () => {
  const { git, config: c, seen } = setup();
  const remote = restRemote(c);
  const parent = git.head;
  const first = await remote.commit({ parent: { commit: parent, tree: 'not-a-tree-sha' }, message: 'one', add: new Map([['a.pgn', 'A\n']]), remove: [] });
  assert.ok(first.ok);
  assert.deepEqual([...git.filesOf(git.head).keys()].sort(), ['README.md', 'a.pgn', 'bom.pgn']);
  // Its own commit's tree is known: the next commit asks GitHub for nothing but the three writes.
  const before = seen.length;
  const second = await remote.commit({ parent: { commit: first.commit, tree: '' }, message: 'two', add: new Map([['b.pgn', 'B\n']]), remove: ['a.pgn'] });
  assert.ok(second.ok);
  assert.equal(seen.length - before, 3);
  assert.deepEqual([...git.filesOf(git.head).keys()].sort(), ['README.md', 'b.pgn', 'bom.pgn']);
});

test('a blob keeps its byte-order mark, so its text hashes back to its SHA', async () => {
  const { git, config: c } = setup();
  const sha = git.filesOf(git.head).get('bom.pgn')!;
  for (const remote of [restRemote(c), graphqlRemote(c)]) {
    const text = (await remote.blobs([sha])).get(sha)!;
    assert.ok(text.startsWith('﻿'));
    assert.equal(gitBlobSha(text), sha);
  }
});

test('GraphQL reads blobs 100 to a request, and only a commit counts as a write', async () => {
  const { git, config: c, seen } = setup();
  const files = new Map(Array.from({ length: 150 }, (_, i) => [`f${i}.txt`, `file ${i}\n`] as [string, string]));
  git.commitIfHead(git.head, 'many', files, []);
  const shas = [...git.filesOf(git.head).values()];
  const remote = graphqlRemote(c);
  const blobs = await remote.blobs(shas);
  assert.equal(blobs.size, shas.length);
  assert.deepEqual(seen.map((s) => [s.route, s.write]), [['/graphql', false], ['/graphql', false]]);
  const made = await remote.commit({ parent: { commit: git.head, tree: git.commits.get(git.head)!.tree }, message: 'x: 1 other file\n\nrepworks-sync: DeskTest:1', add: new Map([['a.txt', 'a\n']]), remove: [] });
  assert.ok(made.ok);
  assert.deepEqual(seen.at(-1)!.write, true);
  assert.equal(git.commits.get(git.head)!.message, 'x: 1 other file\n\nrepworks-sync: DeskTest:1');
});

test('a GraphQL blob whose text is not its content is read through REST instead', async () => {
  const { git, github, config: c, seen } = setup();
  const sha = git.filesOf(git.head).get('README.md')!;
  const fetch = github.fetch;
  // A GraphQL answer that changed the text (a lost byte-order mark, a line ending).
  const lying: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!String(input).endsWith('/graphql')) return response;
    const body = (await response.json()) as { data: { repository: Record<string, { text: string }> } };
    for (const blob of Object.values(body.data.repository)) blob.text = blob.text.replace('\n', '\r\n');
    return new Response(JSON.stringify(body), { status: 200, headers: response.headers });
  };
  const blobs = await graphqlRemote({ ...c, fetch: lying }).blobs([sha]);
  assert.equal(blobs.get(sha), '# data\n');
  assert.deepEqual(seen.map((s) => s.route), ['/graphql', '/repos/{repo}/git/blobs/' + sha]);
});
