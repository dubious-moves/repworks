// The remote with GitHub's GraphQL API where it saves requests (PLAN.md §4.9; D4's default):
// - commit: one createCommitOnBranch, refused unless the branch is at expectedHeadOid. One
//   content-creating request per sync, against GitHub's 500 an hour;
// - blobs: up to 100 in one query, each checked against its SHA (anything truncated, binary
//   or not matching is read through REST instead);
// - head, files and commitsSince: REST, as in githubRest.ts (the head's 304 is free).
//
// GitHub's own failure ("Something went wrong while executing your query", no type; a 5xx) is
// most often its GraphQL time limit, met again by the same large commit or query on every retry
// (the owner's phone, 2026-10-07, after a while of editing a study): that request is made again
// through REST at once. A commit that did land after all can't land twice: REST moves the branch
// only forward from the same parent, so the second one is refused as stale and the next pull finds
// the first by its sync id.
import { gitBlobSha } from '../core/sync/gitHash.ts';
import { RemoteError, type CommitRequest, type CommitResult, type Remote } from '../core/sync/ports.ts';
import { base64, call, type GithubConfig } from './github.ts';
import { restRemote } from './githubRest.ts';

const COMMIT = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid tree { oid } } }
}`;

interface GraphqlError {
  type?: string;
  message?: string;
}

const BATCH = 100;

/** GitHub's side failed (not a refusal, a limit or the network): worth the same request through REST. */
const githubFailed = (error: unknown) => error instanceof RemoteError && error.reason === 'server';

export function graphqlRemote(config: GithubConfig): Remote {
  const rest = restRemote(config);
  const [owner, name] = config.repo.split('/') as [string, string];

  async function graphql(query: string, variables: Record<string, unknown>): Promise<{ data: unknown; errors: GraphqlError[] }> {
    const answer = await call(config, 'POST', '/graphql', { body: { query, variables } });
    const j = answer.json as { data?: unknown; errors?: GraphqlError[] } | undefined;
    if (j === undefined) throw new RemoteError('server', "GitHub's GraphQL answer wasn't JSON");
    return { data: j.data, errors: Array.isArray(j.errors) ? j.errors : [] };
  }

  function failure(errors: GraphqlError[]): RemoteError {
    const first = errors[0] ?? {};
    const message = first.message ?? 'no message';
    switch (first.type) {
      case 'RATE_LIMITED':
        return new RemoteError('rate', `GitHub's rate limit: ${message}`);
      case 'FORBIDDEN':
      case 'NOT_FOUND':
      case 'UNPROCESSABLE':
        return new RemoteError('setup', `GitHub refused: ${message}`);
      default:
        return new RemoteError('server', `GitHub's GraphQL error ${first.type ?? ''}: ${message}`);
    }
  }

  async function blobs(shas: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const fallback: string[] = [];
    for (let i = 0; i < shas.length; i += BATCH) {
      const batch = shas.slice(i, i + BATCH);
      const fields = batch.map((sha, k) => `b${k}: object(oid: "${sha}") { ... on Blob { text isTruncated isBinary } }`).join('\n');
      let repository: Record<string, { text?: unknown; isTruncated?: unknown; isBinary?: unknown } | null> | undefined;
      try {
        const { data, errors } = await graphql(`query ($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {\n${fields}\n} }`, { owner, name });
        repository = (data as { repository?: typeof repository | null } | null | undefined)?.repository ?? undefined;
        if (!repository) throw failure(errors);
      } catch (error) {
        if (!githubFailed(error)) throw error;
        fallback.push(...batch);
        continue;
      }
      batch.forEach((sha, k) => {
        const blob = repository[`b${k}`];
        const text = blob?.text;
        if (typeof text === 'string' && blob?.isTruncated !== true && blob?.isBinary !== true && gitBlobSha(text) === sha) out.set(sha, text);
        else fallback.push(sha);
      });
    }
    if (fallback.length) for (const [sha, text] of await rest.blobs(fallback)) out.set(sha, text);
    return out;
  }

  async function commit(request: CommitRequest): Promise<CommitResult> {
    try {
      return await graphqlCommit(request);
    } catch (error) {
      if (!githubFailed(error)) throw error;
      return rest.commit(request);
    }
  }

  async function graphqlCommit(request: CommitRequest): Promise<CommitResult> {
    const [headline, ...lines] = request.message.split('\n');
    const body = lines.join('\n').replace(/^\n+/, '');
    const { data, errors } = await graphql(COMMIT, {
      input: {
        branch: { repositoryNameWithOwner: config.repo, branchName: config.branch },
        expectedHeadOid: request.parent.commit,
        message: body ? { headline, body } : { headline },
        fileChanges: {
          additions: [...request.add].map(([path, content]) => ({ path, contents: base64(content) })),
          deletions: request.remove.map((path) => ({ path })),
        },
      },
    });
    const made = (data as { createCommitOnBranch?: { commit?: { oid?: unknown; tree?: { oid?: unknown } } } | null } | null | undefined)?.createCommitOnBranch?.commit;
    if (typeof made?.oid === 'string' && typeof made.tree?.oid === 'string') return { ok: true, commit: made.oid, tree: made.tree.oid };
    if (errors.some((e) => e.type === 'STALE_DATA' || /expected branch to point to/i.test(e.message ?? ''))) return { ok: false, reason: 'stale' };
    throw failure(errors);
  }

  return { head: rest.head, files: rest.files, commitsSince: rest.commitsSince, blobs, commit };
}
