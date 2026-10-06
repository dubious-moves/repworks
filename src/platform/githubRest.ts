// The remote through GitHub's REST API alone (PLAN.md §4.9; D4's fallback write path):
// - head: the branch's ref, with If-None-Match (a 304 is free);
// - files: the commit's recursive tree (a commit SHA is accepted where a tree is asked for, but
//   the answer's `sha` is then not the commit's tree: spike G6b, PLAN.md §4.2);
// - blobs: one raw GET each, paced under GitHub's 900 points a minute;
// - commit: a tree with the contents inline, a commit on the parent, then the ref moved with
//   force: false, which GitHub refuses (422) unless it is a fast-forward: that is "stale". The
//   new tree is built on the parent's tree as this remote learned it from GitHub itself (its own
//   commit, or the parent commit read once), never on a tree SHA kept from an earlier read;
// - commitsSince: compare base...head.
import { RemoteError, type CommitRequest, type CommitResult, type Remote, type RemoteCommit, type RemoteHead, type RemoteTree } from '../core/sync/ports.ts';
import { call, failureOf, messageOf, paced, type GithubConfig } from './github.ts';

export function restRemote(config: GithubConfig): Remote {
  const repo = `/repos/${config.repo}`;
  const refPath = `${repo}/git/ref/heads/${encodeURIComponent(config.branch)}`;
  /** commit → its tree, as GitHub stated it. */
  const trees = new Map<string, string>();

  async function treeOf(commit: string): Promise<string> {
    const known = trees.get(commit);
    if (known) return known;
    const c = await call(config, 'GET', `${repo}/git/commits/${commit}`);
    const tree = (c.json as { tree?: { sha?: unknown } } | undefined)?.tree?.sha;
    if (typeof tree !== 'string') throw new RemoteError('server', `no tree in GitHub's answer for commit ${commit}`);
    trees.set(commit, tree);
    return tree;
  }

  async function head(etag?: string): Promise<RemoteHead | 'not-modified'> {
    const options = etag === undefined ? { expect: [200, 304] } : { etag, expect: [200, 304] };
    const answer = await call(config, 'GET', refPath, options);
    if (answer.status === 304) return 'not-modified';
    const sha = (answer.json as { object?: { sha?: unknown } } | undefined)?.object?.sha;
    if (typeof sha !== 'string') throw new RemoteError('server', `the branch ${config.branch} has no commit in GitHub's answer`);
    return { commit: sha, etag: answer.headers.get('etag') ?? '' };
  }

  async function files(commit: string): Promise<RemoteTree> {
    let answer;
    let tree = trees.get(commit) ?? '';
    try {
      answer = await call(config, 'GET', `${repo}/git/trees/${commit}?recursive=1`);
    } catch (error) {
      // If GitHub ever stops taking a commit for a tree: the commit's tree, then that tree.
      if (!(error instanceof RemoteError) || (error.status !== 404 && error.status !== 422)) throw error;
      tree = await treeOf(commit);
      answer = await call(config, 'GET', `${repo}/git/trees/${tree}?recursive=1`);
    }
    const j = answer.json as { truncated?: unknown; tree?: { path?: unknown; type?: unknown; sha?: unknown }[] } | undefined;
    if (!Array.isArray(j?.tree)) throw new RemoteError('server', `no tree in GitHub's answer for ${commit}`);
    if (j.truncated === true) throw new RemoteError('server', 'the data repo has more files than GitHub lists in one tree');
    const out = new Map<string, string>();
    for (const e of j.tree) if (e.type === 'blob' && typeof e.path === 'string' && typeof e.sha === 'string') out.set(e.path, e.sha);
    return { commit, tree, files: out };
  }

  async function blobs(shas: readonly string[]): Promise<Map<string, string>> {
    const pace = config.pace ?? { concurrent: 4, perSecond: 10 };
    const texts = await paced(shas, pace.concurrent, pace.perSecond, async (sha) => {
      const answer = await call(config, 'GET', `${repo}/git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json' });
      return [sha, answer.text] as const;
    });
    return new Map(texts);
  }

  async function commit(request: CommitRequest): Promise<CommitResult> {
    const entries = [
      ...[...request.add].map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
      ...request.remove.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
    ];
    const tree = await call(config, 'POST', `${repo}/git/trees`, { body: { base_tree: await treeOf(request.parent.commit), tree: entries } });
    const treeSha = (tree.json as { sha?: unknown } | undefined)?.sha;
    if (typeof treeSha !== 'string') throw new RemoteError('server', "GitHub didn't return the new tree");
    const made = await call(config, 'POST', `${repo}/git/commits`, { body: { message: request.message, tree: treeSha, parents: [request.parent.commit] } });
    const sha = (made.json as { sha?: unknown } | undefined)?.sha;
    if (typeof sha !== 'string') throw new RemoteError('server', "GitHub didn't return the new commit");
    const ref = await call(config, 'PATCH', `${repo}/git/refs/heads/${encodeURIComponent(config.branch)}`, { body: { sha, force: false }, expect: [200, 422] });
    if (ref.status === 422) {
      if (/fast.?forward/i.test(messageOf(ref))) return { ok: false, reason: 'stale' };
      throw failureOf(config, ref);
    }
    trees.set(sha, treeSha);
    return { ok: true, commit: sha, tree: treeSha };
  }

  async function commitsSince(headSha: string, base: string): Promise<RemoteCommit[]> {
    const answer = await call(config, 'GET', `${repo}/compare/${base}...${headSha}`);
    const commits = (answer.json as { commits?: { sha?: unknown; commit?: { message?: unknown } }[] } | undefined)?.commits;
    if (!Array.isArray(commits)) throw new RemoteError('server', "GitHub's comparison had no commits");
    return commits.flatMap((c) => (typeof c.sha === 'string' && typeof c.commit?.message === 'string' ? [{ sha: c.sha, message: c.commit.message }] : []));
  }

  return { head, files, blobs, commit, commitsSince };
}
