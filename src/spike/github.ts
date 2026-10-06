// The GitHub half of the spike (PLAN.md §4.2, items 1-3): reads with CORS and ETags, the
// GraphQL commit fresh and stale, and the REST Git Data commit fresh and stale. It works on a
// throwaway branch, repworks-spike-<random>, and deletes it at the end; the default branch is
// only read.
import { record, secret } from './report.ts';

const API = 'https://api.github.com';

interface Http {
  status: number;
  ms: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
}

async function http(token: string, method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Http> {
  const started = performance.now();
  const response = await fetch(path.startsWith('https://') ? path : API + path, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => (headers[name] = value));
  return { status: response.status, ms: Math.round(performance.now() - started), headers, text, json };
}

/** The response headers a sync needs to read: whether CORS exposes them is part of the finding. */
function visible(h: Http): Record<string, string> {
  const keep = ['etag', 'content-type', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset', 'x-ratelimit-resource', 'retry-after', 'x-github-request-id', 'cache-control', 'last-modified'];
  const out: Record<string, string> = {};
  for (const name of keep) if (h.headers[name] !== undefined) out[name] = h.headers[name]!;
  out['(all readable header names)'] = Object.keys(h.headers).sort().join(', ');
  return out;
}

const excerpt = (text: string, n = 600) => (text.length > n ? `${text.slice(0, n)}… (${text.length} chars)` : text);

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const COMMIT_MUTATION = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid committedDate tree { oid } } }
}`;

interface FileChanges {
  additions?: { path: string; contents: string }[];
  deletions?: { path: string }[];
}

async function graphqlCommit(token: string, repo: string, branch: string, expectedHeadOid: string, headline: string, body: string, changes: FileChanges): Promise<Http> {
  return http(token, 'POST', '/graphql', {
    body: {
      query: COMMIT_MUTATION,
      variables: {
        input: {
          branch: { repositoryNameWithOwner: repo, branchName: branch },
          message: { headline, body },
          expectedHeadOid,
          fileChanges: {
            additions: (changes.additions ?? []).map((a) => ({ path: a.path, contents: b64(a.contents) })),
            deletions: changes.deletions ?? [],
          },
        },
      },
    },
  });
}

function commitOid(h: Http): string | undefined {
  const data = h.json as { data?: { createCommitOnBranch?: { commit?: { oid?: string } } } } | undefined;
  return data?.data?.createCommitOnBranch?.commit?.oid;
}

async function refSha(token: string, repo: string, branch: string): Promise<{ h: Http; sha?: string }> {
  const h = await http(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`);
  return { h, sha: (h.json as { object?: { sha?: string } } | undefined)?.object?.sha };
}

/** How long until a read of the ref shows a commit that was just made. */
async function readAfterWrite(token: string, repo: string, branch: string, expected: string): Promise<Record<string, unknown>> {
  const started = performance.now();
  for (let attempt = 1; attempt <= 10; attempt++) {
    const { sha } = await refSha(token, repo, branch);
    if (sha === expected) return { visibleOnAttempt: attempt, afterMs: Math.round(performance.now() - started) };
    await new Promise((r) => setTimeout(r, 500));
  }
  return { visibleOnAttempt: null, note: 'still not visible after 10 reads' };
}

type Log = (line: string) => void;

export async function runGithubChecks(token: string, repo: string, log: Log): Promise<void> {
  secret(token);
  const step = async (id: string, title: string, fn: () => Promise<{ ok: boolean; detail: Record<string, unknown>; ms?: number }>) => {
    log(`… ${title}`);
    try {
      const result = await fn();
      record({ id, title, ...result });
      log(`${result.ok ? '✓' : '✗'} ${title}`);
      return result;
    } catch (error) {
      record({ id, title, ok: false, detail: { thrown: String(error), name: (error as Error)?.name } });
      log(`✗ ${title}: ${String(error)}`);
      throw error;
    }
  };

  // G1: the repo, with the token's permissions and the rate limit.
  let defaultBranch = 'main';
  await step('G1', 'GET the data repo (CORS, permissions, rate-limit headers)', async () => {
    const h = await http(token, 'GET', `/repos/${repo}`);
    const j = h.json as { default_branch?: string; private?: boolean; permissions?: unknown; visibility?: string } | undefined;
    if (j?.default_branch) defaultBranch = j.default_branch;
    return { ok: h.status === 200, ms: h.ms, detail: { status: h.status, headers: visible(h), defaultBranch: j?.default_branch, private: j?.private, visibility: j?.visibility, permissions: j?.permissions, body: h.status === 200 ? undefined : excerpt(h.text) } };
  });

  await step('G1b', 'GET /rate_limit (the limits this token has)', async () => {
    const h = await http(token, 'GET', '/rate_limit');
    const r = (h.json as { resources?: Record<string, unknown> } | undefined)?.resources;
    return { ok: h.status === 200, ms: h.ms, detail: { status: h.status, core: r?.['core'], graphql: r?.['graphql'] } };
  });

  await step('G1c', 'A GET with X-GitHub-Api-Version (is the header allowed by CORS?)', async () => {
    const h = await http(token, 'GET', `/repos/${repo}`, { headers: { 'X-GitHub-Api-Version': '2022-11-28' } });
    return { ok: h.status === 200, ms: h.ms, detail: { status: h.status } };
  });

  // G2: a throwaway branch from the default branch's head.
  const branch = `repworks-spike-${Math.random().toString(36).slice(2, 8)}`;
  let head = '';
  await step('G2', `Create the throwaway branch ${branch}`, async () => {
    const base = await refSha(token, repo, defaultBranch);
    if (base.h.status === 409) {
      // Nothing else can run: GitHub can't make a branch in an empty repo.
      throw new Error(`the data repo is empty (409: ${excerpt(base.h.text, 120)}). Add a README on GitHub (Add file → Create new file), then run the spike again.`);
    }
    if (!base.sha) throw new Error(`the default branch ${defaultBranch} wasn't readable (${base.h.status}: ${excerpt(base.h.text, 120)})`);
    const h = await http(token, 'POST', `/repos/${repo}/git/refs`, { body: { ref: `refs/heads/${branch}`, sha: base.sha } });
    head = base.sha;
    return { ok: h.status === 201, ms: h.ms, detail: { status: h.status, base: base.sha, body: h.status === 201 ? undefined : excerpt(h.text) } };
  });

  try {
    // G3/G4: the ref, then the same request with its ETag.
    let etag = '';
    await step('G3', 'GET the ref (ETag readable?)', async () => {
      const { h, sha } = await refSha(token, repo, branch);
      etag = h.headers['etag'] ?? '';
      return { ok: h.status === 200 && sha === head && etag !== '', ms: h.ms, detail: { status: h.status, sha, headers: visible(h) } };
    });
    await step('G4', 'Conditional GET of the ref with If-None-Match (304, and does it count?)', async () => {
      const before = await http(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`);
      const h = await http(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`, { headers: { 'If-None-Match': etag } });
      const after = await http(token, 'GET', '/rate_limit');
      const coreAfter = (after.json as { resources?: { core?: { remaining?: number; used?: number } } } | undefined)?.resources?.core;
      return {
        ok: h.status === 304,
        ms: h.ms,
        detail: {
          status: h.status,
          headers: visible(h),
          remainingBefore304: before.headers['x-ratelimit-remaining'],
          remainingOn304: h.headers['x-ratelimit-remaining'],
          coreAfter: coreAfter,
          note: 'If the 304 is free, remainingOn304 equals remainingBefore304 - 0 (the 200 before it counted one).',
        },
      };
    });

    // G5-G7: commit → recursive tree → raw blob, and the blob SHA computed here.
    let tree = '';
    await step('G5', 'GET the commit (its tree)', async () => {
      const h = await http(token, 'GET', `/repos/${repo}/git/commits/${head}`);
      tree = (h.json as { tree?: { sha?: string } } | undefined)?.tree?.sha ?? '';
      return { ok: h.status === 200 && tree !== '', ms: h.ms, detail: { status: h.status, tree, headers: visible(h) } };
    });
    let readme: { path: string; sha: string } | undefined;
    let listing = '';
    const listOf = (entries: { path: string; type: string; sha: string }[]) => entries.map((e) => `${e.type} ${e.sha} ${e.path}`).sort().join('\n');
    await step('G6', 'GET the recursive tree', async () => {
      const h = await http(token, 'GET', `/repos/${repo}/git/trees/${tree}?recursive=1`);
      const entries = (h.json as { tree?: { path: string; type: string; sha: string; size?: number }[]; truncated?: boolean } | undefined)?.tree ?? [];
      listing = listOf(entries);
      readme = entries.find((e) => e.type === 'blob');
      return { ok: h.status === 200, ms: h.ms, detail: { status: h.status, entries: entries.length, truncated: (h.json as { truncated?: boolean } | undefined)?.truncated, firstBlob: readme?.path, headers: visible(h) } };
    });
    // The app takes only the entries from this answer: its sha isn't the commit's tree (the
    // phone's run of 2026-10-06), so it is recorded, not checked.
    await step('G6b', "GET the recursive tree by the commit's SHA (how the app reads it, one request fewer)", async () => {
      const h = await http(token, 'GET', `/repos/${repo}/git/trees/${head}?recursive=1`);
      const j = h.json as { sha?: string; tree?: { path: string; type: string; sha: string }[] } | undefined;
      const sameEntries = h.status === 200 && listing !== '' && listOf(j?.tree ?? []) === listing;
      const sha = j?.sha;
      return {
        ok: sameEntries,
        ms: h.ms,
        detail: { status: h.status, sameEntriesAsG6: sameEntries, shaInAnswer: sha, commitTree: tree, shaIs: sha === tree ? 'the tree' : sha === head ? 'the commit' : 'neither', body: h.status === 200 ? undefined : excerpt(h.text) },
      };
    });
    await step('G7', 'GET a blob raw (Accept: application/vnd.github.raw+json) and check its SHA here', async () => {
      if (!readme) return { ok: false, detail: { note: 'no blob in the tree' } };
      const h = await http(token, 'GET', `/repos/${repo}/git/blobs/${readme.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      const computed = await gitBlobSha(h.text);
      return { ok: h.status === 200 && computed === readme.sha, ms: h.ms, detail: { status: h.status, path: readme.path, bytes: h.text.length, shaMatches: computed === readme.sha, headers: visible(h) } };
    });

    await step('G7b', 'GraphQL: blobs read by SHA in one query (how the app fetches many files)', async () => {
      if (!readme) return { ok: false, detail: { note: 'no blob in the tree' } };
      const h = await http(token, 'POST', '/graphql', {
        body: {
          query: `query ($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { b0: object(oid: "${readme.sha}") { ... on Blob { text isTruncated isBinary byteSize } } } }`,
          variables: { owner: repo.split('/')[0], name: repo.split('/')[1] },
        },
      });
      const blob = (h.json as { data?: { repository?: { b0?: { text?: string; isTruncated?: boolean; isBinary?: boolean; byteSize?: number } } } } | undefined)?.data?.repository?.b0;
      const shaMatches = typeof blob?.text === 'string' && (await gitBlobSha(blob.text)) === readme.sha;
      return { ok: h.status === 200 && shaMatches, ms: h.ms, detail: { status: h.status, shaMatches, isTruncated: blob?.isTruncated, isBinary: blob?.isBinary, byteSize: blob?.byteSize, headers: visible(h), errors: (h.json as { errors?: unknown } | undefined)?.errors } };
    });

    // G8-G12: GraphQL createCommitOnBranch.
    const pgn = '[Event "Spike"]\n[Site "?"]\n[Result "*"]\n\n1. e4 { Café, naïve: ♞ } e5 *\n';
    let g1 = '';
    await step('G8', 'GraphQL createCommitOnBranch: add three files', async () => {
      const h = await graphqlCommit(token, repo, branch, head, 'spike: graphql commit 1', 'repworks-sync: spike:1', {
        additions: [
          { path: 'spike/a.txt', contents: 'a\n' },
          { path: 'spike/b.pgn', contents: pgn },
          { path: 'spike/c.txt', contents: 'c\n' },
        ],
      });
      g1 = commitOid(h) ?? '';
      const raw = g1 ? await readAfterWrite(token, repo, branch, g1) : {};
      return { ok: h.status === 200 && g1 !== '', ms: h.ms, detail: { status: h.status, headers: visible(h), body: excerpt(h.text, 1500), readAfterWrite: raw } };
    });
    await step('G8b', 'The committed PGN reads back byte for byte (UTF-8 through base64)', async () => {
      const t = await http(token, 'GET', `/repos/${repo}/contents/spike/b.pgn?ref=${branch}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      return { ok: t.text === pgn, ms: t.ms, detail: { status: t.status, same: t.text === pgn, shaHere: await gitBlobSha(pgn) } };
    });
    let g2 = '';
    await step('G9', 'GraphQL: change one, add one, delete one, fresh head', async () => {
      const h = await graphqlCommit(token, repo, branch, g1, 'spike: graphql commit 2', 'repworks-sync: spike:2', {
        additions: [
          { path: 'spike/a.txt', contents: 'a2\n' },
          { path: 'spike/d.txt', contents: 'd\n' },
        ],
        deletions: [{ path: 'spike/c.txt' }],
      });
      g2 = commitOid(h) ?? '';
      return { ok: h.status === 200 && g2 !== '', ms: h.ms, detail: { status: h.status, body: excerpt(h.text, 1500) } };
    });
    await step('G10', 'GraphQL with a stale expectedHeadOid: the exact error', async () => {
      const h = await graphqlCommit(token, repo, branch, g1, 'spike: graphql stale', 'repworks-sync: spike:3', { additions: [{ path: 'spike/stale.txt', contents: 'x\n' }] });
      const errors = (h.json as { errors?: unknown[] } | undefined)?.errors;
      return { ok: h.status === 200 && Array.isArray(errors) && commitOid(h) === undefined, ms: h.ms, detail: { status: h.status, headers: visible(h), fullBody: h.text } };
    });
    await step('G11', 'GraphQL deleting a path that does not exist', async () => {
      const h = await graphqlCommit(token, repo, branch, g2, 'spike: delete missing', 'repworks-sync: spike:4', { deletions: [{ path: 'spike/never-existed.txt' }] });
      const oid = commitOid(h);
      if (oid) g2 = oid;
      return { ok: true, ms: h.ms, detail: { status: h.status, committed: oid !== undefined, fullBody: h.text } };
    });
    await step('G12', 'GraphQL with no changes at all', async () => {
      const h = await graphqlCommit(token, repo, branch, g2, 'spike: empty', 'repworks-sync: spike:5', {});
      const oid = commitOid(h);
      if (oid) g2 = oid;
      return { ok: true, ms: h.ms, detail: { status: h.status, committed: oid !== undefined, fullBody: h.text } };
    });
    await step('G12b', 'GraphQL with a bad token: the error shape', async () => {
      const h = await graphqlCommit('github_pat_invalid', repo, branch, g2, 'x', 'x', { additions: [{ path: 'spike/x.txt', contents: 'x' }] });
      return { ok: h.status === 401, ms: h.ms, detail: { status: h.status, fullBody: h.text } };
    });

    // G13-G14: REST Git Data, fresh then stale.
    const before13 = g2;
    let r1 = '';
    await step('G13', 'REST: tree (inline content, one deletion) → commit → ref force:false', async () => {
      const commit = await http(token, 'GET', `/repos/${repo}/git/commits/${before13}`);
      const baseTree = (commit.json as { tree?: { sha?: string } } | undefined)?.tree?.sha;
      const t = await http(token, 'POST', `/repos/${repo}/git/trees`, {
        body: {
          base_tree: baseTree,
          tree: [
            { path: 'spike/e.txt', mode: '100644', type: 'blob', content: 'e\n' },
            { path: 'spike/d.txt', mode: '100644', type: 'blob', sha: null },
          ],
        },
      });
      const newTree = (t.json as { sha?: string } | undefined)?.sha;
      const c = await http(token, 'POST', `/repos/${repo}/git/commits`, { body: { message: 'spike: rest commit\n\nrepworks-sync: spike:6', tree: newTree, parents: [before13] } });
      r1 = (c.json as { sha?: string } | undefined)?.sha ?? '';
      const u = await http(token, 'PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { body: { sha: r1, force: false } });
      const raw = u.status === 200 ? await readAfterWrite(token, repo, branch, r1) : {};
      return {
        ok: t.status === 201 && c.status === 201 && u.status === 200,
        ms: t.ms + c.ms + u.ms,
        detail: { tree: { status: t.status, ms: t.ms, body: t.status === 201 ? undefined : excerpt(t.text) }, commit: { status: c.status, ms: c.ms }, ref: { status: u.status, ms: u.ms, headers: visible(u), body: excerpt(u.text) }, readAfterWrite: raw },
      };
    });
    await step('G14', 'REST: a commit on the old head, ref force:false (stale): the exact error', async () => {
      const commit = await http(token, 'GET', `/repos/${repo}/git/commits/${before13}`);
      const baseTree = (commit.json as { tree?: { sha?: string } } | undefined)?.tree?.sha;
      const c = await http(token, 'POST', `/repos/${repo}/git/commits`, { body: { message: 'spike: rest stale', tree: baseTree, parents: [before13] } });
      const sha = (c.json as { sha?: string } | undefined)?.sha;
      const u = await http(token, 'PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { body: { sha, force: false } });
      return { ok: u.status === 422, ms: u.ms, detail: { status: u.status, headers: visible(u), fullBody: u.text } };
    });
    await step('G14b', 'REST with a bad token: the error shape', async () => {
      const h = await http('github_pat_invalid', 'GET', `/repos/${repo}/git/ref/heads/${branch}`);
      return { ok: h.status === 401, ms: h.ms, detail: { status: h.status, headers: visible(h), fullBody: h.text } };
    });

    // G15-G16: the old ETag after a change; the commits since a base (lost acknowledgements).
    await step('G15', 'Conditional GET with the old ETag after the ref moved', async () => {
      const h = await http(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`, { headers: { 'If-None-Match': etag } });
      const sha = (h.json as { object?: { sha?: string } } | undefined)?.object?.sha;
      return { ok: h.status === 200 && sha === r1, ms: h.ms, detail: { status: h.status, shaIsNewHead: sha === r1 } };
    });
    await step('G16', 'Compare base...head: commit messages for lost acknowledgements', async () => {
      const h = await http(token, 'GET', `/repos/${repo}/compare/${head}...${r1}`);
      const commits = (h.json as { commits?: { sha: string; commit: { message: string } }[]; total_commits?: number } | undefined)?.commits ?? [];
      return { ok: h.status === 200 && commits.some((c) => c.commit.message.includes('repworks-sync: spike:1')), ms: h.ms, detail: { status: h.status, total: commits.length, messages: commits.map((c) => c.commit.message) } };
    });
  } finally {
    await step('G17', `Delete the throwaway branch ${branch}`, async () => {
      const h = await http(token, 'DELETE', `/repos/${repo}/git/refs/heads/${branch}`);
      return { ok: h.status === 204, ms: h.ms, detail: { status: h.status } };
    }).catch(() => undefined);
  }
}
