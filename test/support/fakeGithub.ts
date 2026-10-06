// GitHub's API as a fetch function over a FakeGit: the endpoints the adapters call, answering
// with GitHub's shapes, status codes and headers, and failing as the Faults say. Shapes:
// - REST, from GitHub's documentation, and checked live from this origin where the proxy
//   allowed (§4.2: the repo, the rate-limit headers);
// - the errors as the spike recorded them from the browser on 2026-10-06 (§4.2): GraphQL's
//   stale head (G10) and a deletion of a missing path (G11), a bad token (G12b, G14b: 401 "Bad
//   credentials" on both paths), and REST's stale ref (G14: 422 "Update is not a fast forward");
// - a tree read by a commit's SHA answers 200 with the tree's entries, but its `sha` is not the
//   commit's tree (G6b). The spike didn't record which value it is; here it is the commit's SHA.
import type { FakeGit } from './fakeGit.ts';
import { Faults, type Fault, type Op } from './faults.ts';

export interface FakeGithubOptions {
  repo: string;
  branch: string;
  token: string;
  visibility?: 'private' | 'public';
  /** Whether a commit SHA is taken where a tree is asked for (git's tree-ish); true by default. */
  treesByCommit?: boolean;
}

export interface Logged {
  method: string;
  path: string;
  status: number | 'network';
}

const DOCS = 'https://docs.github.com/rest';

export class FakeGithub {
  readonly git: FakeGit;
  readonly faults: Faults;
  readonly options: FakeGithubOptions;
  readonly log: Logged[] = [];
  /** Content-creating requests so far (GitHub allows 80 a minute and 500 an hour). */
  contentCreating = 0;
  remaining = 5000;
  /** Whether the request being served moved the branch. */
  private landed = false;

  constructor(git: FakeGit, options: FakeGithubOptions, faults = new Faults()) {
    this.git = git;
    this.options = options;
    this.faults = faults;
  }

  readonly fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const entry: Logged = { method, path: url.pathname + url.search, status: 'network' };
    this.log.push(entry);
    const respond = (status: number, body?: unknown, extra: Record<string, string> = {}) => {
      entry.status = status;
      return this.response(status, body, extra);
    };
    if (headers.get('authorization') !== `Bearer ${this.options.token}`) return respond(401, { message: 'Bad credentials', documentation_url: DOCS, status: '401' });

    const op = this.opOf(method, url.pathname, typeof init.body === 'string' ? init.body : undefined);
    let lose = false;
    if (op) {
      const fault = this.faults.next(op);
      if (fault && fault.kind !== 'lose') return this.fail(fault, entry);
      await this.faults.during?.(op);
      lose = fault?.kind === 'lose';
    }
    this.landed = false;
    const answer = await this.route(method, url, headers, init.body);
    entry.status = answer.status;
    if (lose) {
      if (this.landed) this.faults.landedLost++;
      entry.status = 'network';
      throw new TypeError('fetch failed');
    }
    return answer;
  };

  private opOf(method: string, path: string, body: string | undefined): Op | undefined {
    const repo = `/repos/${this.options.repo}`;
    if (method === 'GET' && path.startsWith(`${repo}/git/ref/heads/`)) return 'head';
    if (method === 'GET' && path.startsWith(`${repo}/git/trees/`)) return 'files';
    if (method === 'GET' && path.startsWith(`${repo}/git/blobs/`)) return 'blobs';
    if (method === 'PATCH' && path.startsWith(`${repo}/git/refs/heads/`)) return 'commit';
    if (method === 'GET' && path.startsWith(`${repo}/compare/`)) return 'commitsSince';
    if (method === 'POST' && path === '/graphql') return body?.includes('createCommitOnBranch') ? 'commit' : 'blobs';
    return undefined;
  }

  private fail(fault: Exclude<Fault, { kind: 'lose' }>, entry: Logged): Response {
    switch (fault.kind) {
      case 'network':
        throw new TypeError('fetch failed');
      case 'auth':
        entry.status = 401;
        return this.response(401, { message: 'Bad credentials', documentation_url: DOCS, status: '401' });
      case 'rate':
        if (fault.primary) {
          entry.status = 403;
          return this.response(403, { message: 'API rate limit exceeded for user ID 1.', documentation_url: DOCS, status: '403' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + (fault.retryAfterSec ?? 60)) });
        }
        entry.status = 429;
        return this.response(429, { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.', documentation_url: DOCS, status: '429' }, fault.retryAfterSec === undefined ? {} : { 'retry-after': String(fault.retryAfterSec) });
      case 'server':
        entry.status = 502;
        return this.response(502, { message: 'Server Error' });
    }
  }

  private response(status: number, body?: unknown, extra: Record<string, string> = {}): Response {
    const headers = new Headers({
      'content-type': typeof body === 'string' ? 'application/vnd.github.raw+json; charset=utf-8' : 'application/json; charset=utf-8',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': String(this.remaining),
      'x-ratelimit-resource': 'core',
      ...extra,
    });
    const text = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(status === 304 ? null : text, { status, headers });
  }

  private async route(method: string, url: URL, headers: Headers, rawBody: unknown): Promise<Response> {
    const repo = `/repos/${this.options.repo}`;
    const path = url.pathname;
    const body = typeof rawBody === 'string' ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const notFound = () => this.response(404, { message: 'Not Found', documentation_url: DOCS, status: '404' });
    if (method !== 'GET' || !headers.get('if-none-match')) this.remaining--;

    if (method === 'GET' && path === repo) {
      return this.response(200, { full_name: this.options.repo, default_branch: this.options.branch, private: this.options.visibility !== 'public', visibility: this.options.visibility ?? 'private', permissions: { admin: false, push: true, pull: true } });
    }
    if (method === 'GET' && path === `${repo}/git/ref/heads/${this.options.branch}`) {
      if (this.git.head === '') return this.response(409, { message: 'Git Repository is empty.', documentation_url: DOCS, status: '409' });
      let head = this.git.head;
      if (this.faults.lagReads > 0 && this.git.previous !== '') {
        this.faults.lagReads--;
        head = this.git.previous;
      }
      const etag = `W/"ref-${head}"`;
      if (headers.get('if-none-match') === etag) return this.response(304, undefined, { etag });
      return this.response(200, { ref: `refs/heads/${this.options.branch}`, node_id: 'REF_x', url: `https://api.github.com${path}`, object: { sha: head, type: 'commit', url: `https://api.github.com${repo}/git/commits/${head}` } }, { etag });
    }
    if (method === 'GET' && path.startsWith(`${repo}/git/trees/`)) {
      const sha = path.slice(`${repo}/git/trees/`.length);
      const tree = this.git.trees.has(sha) ? sha : this.options.treesByCommit === false ? undefined : this.git.commits.get(sha)?.tree;
      if (!tree) return notFound();
      const files = this.git.trees.get(tree)!;
      const entries = [...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, s]) => ({ path: p, mode: '100644', type: 'blob', sha: s, size: new TextEncoder().encode(this.git.blobs.get(s)!).length, url: `https://api.github.com${repo}/git/blobs/${s}` }));
      // Directories appear as tree entries too.
      const dirs = new Set([...files.keys()].flatMap((p) => p.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
      const trees = [...dirs].map((d) => ({ path: d, mode: '040000', type: 'tree', sha: '0'.repeat(40), url: '' }));
      return this.response(200, { sha, url: `https://api.github.com${repo}/git/trees/${sha}`, tree: [...trees, ...entries], truncated: false });
    }
    if (method === 'GET' && path.startsWith(`${repo}/git/commits/`)) {
      const c = this.git.commits.get(path.slice(`${repo}/git/commits/`.length));
      if (!c) return notFound();
      return this.response(200, { sha: c.sha, tree: { sha: c.tree, url: '' }, message: c.message, parents: c.parent ? [{ sha: c.parent }] : [] });
    }
    if (method === 'GET' && path.startsWith(`${repo}/git/blobs/`)) {
      const sha = path.slice(`${repo}/git/blobs/`.length);
      const text = this.git.blobs.get(sha);
      if (text === undefined) return notFound();
      if (headers.get('accept') === 'application/vnd.github.raw+json') return this.response(200, text);
      return this.response(200, { sha, node_id: 'B_x', size: text.length, url: '', content: Buffer.from(text).toString('base64'), encoding: 'base64' });
    }
    if (method === 'POST' && path === `${repo}/git/trees`) {
      this.contentCreating++;
      const base = body['base_tree'];
      const files = new Map(typeof base === 'string' ? (this.git.trees.get(base) ?? []) : []);
      if (typeof base === 'string' && !this.git.trees.has(base)) return this.response(422, { message: 'Invalid tree info', documentation_url: DOCS, status: '422' });
      for (const e of body['tree'] as { path: string; sha?: string | null; content?: string }[]) {
        if (e.sha === null) {
          if (!files.has(e.path)) return this.response(422, { message: 'GitRPC::BadObjectState', documentation_url: DOCS, status: '422' });
          files.delete(e.path);
        } else if (typeof e.content === 'string') files.set(e.path, this.git.putBlob(e.content));
        else if (typeof e.sha === 'string') files.set(e.path, e.sha);
      }
      const sha = this.git.putTree(files);
      return this.response(201, { sha, url: `https://api.github.com${repo}/git/trees/${sha}`, tree: [], truncated: false });
    }
    if (method === 'POST' && path === `${repo}/git/commits`) {
      this.contentCreating++;
      const tree = body['tree'] as string;
      const parents = body['parents'] as string[];
      if (!this.git.trees.has(tree) || parents.some((p) => !this.git.commits.has(p))) return this.response(422, { message: 'Tree SHA does not exist', documentation_url: DOCS, status: '422' });
      // A commit object with exactly this tree: diff it against the parent and commit that.
      const before = parents[0] === undefined ? new Map<string, string>() : this.git.filesOf(parents[0]);
      const after = this.git.trees.get(tree)!;
      const add = new Map([...after].filter(([p, s]) => before.get(p) !== s).map(([p, s]) => [p, this.git.blobs.get(s)!] as [string, string]));
      const remove = [...before.keys()].filter((p) => !after.has(p));
      const made = this.git.commitOn(parents[0], body['message'] as string, add, remove);
      return this.response(201, { sha: made.commit, tree: { sha: made.tree, url: '' }, message: body['message'], parents: parents.map((sha) => ({ sha })) });
    }
    if (method === 'PATCH' && path === `${repo}/git/refs/heads/${this.options.branch}`) {
      const sha = body['sha'] as string;
      if (!this.git.commits.has(sha)) return this.response(422, { message: 'Object does not exist', documentation_url: DOCS, status: '422' });
      if (!this.git.fastForward(sha)) return this.response(422, { message: 'Update is not a fast forward', documentation_url: DOCS, status: '422' });
      this.landed = true;
      return this.response(200, { ref: `refs/heads/${this.options.branch}`, object: { sha, type: 'commit' } });
    }
    if (method === 'GET' && path.startsWith(`${repo}/compare/`)) {
      const [base, head] = path.slice(`${repo}/compare/`.length).split('...') as [string, string];
      if (!this.git.commits.has(base) || !this.git.commits.has(head)) return notFound();
      const commits = this.git.since(head, base);
      return this.response(200, { status: commits.length ? 'ahead' : 'identical', ahead_by: commits.length, behind_by: 0, total_commits: commits.length, commits: commits.map((c) => ({ sha: c.sha, commit: { message: c.message } })), files: [] });
    }
    if (method === 'POST' && path === '/graphql') return this.graphql(body);
    return notFound();
  }

  private graphql(body: Record<string, unknown>): Response {
    const query = body['query'] as string;
    const variables = (body['variables'] ?? {}) as Record<string, unknown>;
    if (query.includes('createCommitOnBranch')) {
      this.contentCreating++;
      const input = variables['input'] as {
        branch: { repositoryNameWithOwner: string; branchName: string };
        expectedHeadOid: string;
        message: { headline: string; body?: string };
        fileChanges: { additions?: { path: string; contents: string }[]; deletions?: { path: string }[] };
      };
      if (input.branch.repositoryNameWithOwner !== this.options.repo || input.branch.branchName !== this.options.branch) {
        return this.response(200, { data: { createCommitOnBranch: null }, errors: [{ type: 'NOT_FOUND', path: ['createCommitOnBranch'], message: `Could not resolve to a Ref with the name ${input.branch.branchName}.` }] });
      }
      const message = input.message.body ? `${input.message.headline}\n\n${input.message.body}` : input.message.headline;
      const add = new Map((input.fileChanges.additions ?? []).map((a) => [a.path, Buffer.from(a.contents, 'base64').toString('utf8')] as [string, string]));
      const remove = (input.fileChanges.deletions ?? []).map((d) => d.path);
      const missing = this.git.head === input.expectedHeadOid ? remove.find((p) => !this.git.filesOf(this.git.head).has(p)) : undefined;
      if (missing !== undefined) {
        return this.response(200, {
          data: { createCommitOnBranch: null },
          errors: [{ type: 'NOT_FOUND', path: ['createCommitOnBranch'], locations: [{ line: 2, column: 3 }], message: `A path was requested for deletion which does not exist as of commit oid \`${this.git.head}\`` }],
        });
      }
      const made = this.git.commitIfHead(input.expectedHeadOid, message, add, remove);
      if (made === 'stale') {
        return this.response(200, {
          data: { createCommitOnBranch: null },
          errors: [{ type: 'STALE_DATA', path: ['createCommitOnBranch'], locations: [{ line: 2, column: 3 }], message: `Expected branch to point to "${input.expectedHeadOid}" but it did not.  Pull and try again.` }],
        });
      }
      this.landed = true;
      return this.response(200, { data: { createCommitOnBranch: { commit: { oid: made.commit, tree: { oid: made.tree } } } } });
    }
    const repository: Record<string, unknown> = {};
    for (const m of query.matchAll(/(b\d+): object\(oid: "([0-9a-f]{40})"\)/g)) {
      const text = this.git.blobs.get(m[2]!);
      repository[m[1]!] = text === undefined ? null : { text, isTruncated: false, isBinary: false };
    }
    return this.response(200, { data: { repository } });
  }
}
