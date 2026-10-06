// A git branch in memory, with git's semantics where the sync depends on them (PLAN.md §4.9):
// content-addressed blobs (real git blob SHAs), trees and commits; a branch head that moves only
// by a commit on the commit it points to (createCommitOnBranch's expectedHeadOid) or by a
// fast-forward (REST's force: false); and the commits between two commits.
import { gitBlobSha, sha1Hex, utf8 } from '../../src/core/sync/gitHash.ts';

export interface GitCommit {
  sha: string;
  tree: string;
  parent: string | undefined;
  message: string;
}

export class FakeGit {
  readonly blobs = new Map<string, string>();
  readonly trees = new Map<string, Map<string, string>>();
  readonly commits = new Map<string, GitCommit>();
  /** The branch head; '' while the repo is empty. */
  head = '';
  /** The head before the last move: what a lagging replica still answers. */
  previous = '';
  private counter = 0;

  /** A repo whose branch holds `files` (path → text) in one commit; empty if none are given. */
  constructor(files?: ReadonlyMap<string, string>) {
    if (files) this.head = this.commitOn(undefined, 'Initial commit', files, []).commit;
  }

  putBlob(text: string): string {
    const sha = gitBlobSha(text);
    this.blobs.set(sha, text);
    return sha;
  }

  putTree(files: ReadonlyMap<string, string>): string {
    const lines = [...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, sha]) => `${path}\0${sha}\n`);
    const sha = sha1Hex(utf8(`tree\n${lines.join('')}`));
    this.trees.set(sha, new Map(files));
    return sha;
  }

  /** Makes a commit on `parent` (no branch check, no move). */
  commitOn(parent: string | undefined, message: string, add: ReadonlyMap<string, string>, remove: readonly string[]): { commit: string; tree: string } {
    const files = new Map(parent === undefined ? [] : this.filesOf(parent));
    for (const path of remove) files.delete(path);
    for (const [path, text] of add) files.set(path, this.putBlob(text));
    const tree = this.putTree(files);
    const sha = sha1Hex(utf8(`commit ${tree} ${parent ?? ''} ${++this.counter}\n${message}`));
    this.commits.set(sha, { sha, tree, parent, message });
    return { commit: sha, tree };
  }

  /** Commits on the branch if it points to `expected` (createCommitOnBranch). */
  commitIfHead(expected: string, message: string, add: ReadonlyMap<string, string>, remove: readonly string[]): { commit: string; tree: string } | 'stale' {
    if (this.head !== expected) return 'stale';
    const made = this.commitOn(expected, message, add, remove);
    this.previous = this.head;
    this.head = made.commit;
    return made;
  }

  /** Moves the branch to `sha` if that is a fast-forward (REST, force: false). */
  fastForward(sha: string): boolean {
    if (this.head !== '' && !this.ancestors(sha).has(this.head)) return false;
    this.previous = this.head;
    this.head = sha;
    return true;
  }

  filesOf(commit: string): Map<string, string> {
    const c = this.commits.get(commit);
    if (!c) throw new Error(`no commit ${commit}`);
    return new Map(this.trees.get(c.tree)!);
  }

  /** path → text at a commit (the head by default). */
  textsOf(commit = this.head): Map<string, string> {
    if (commit === '') return new Map();
    return new Map([...this.filesOf(commit)].map(([path, sha]) => [path, this.blobs.get(sha)!]));
  }

  ancestors(commit: string): Set<string> {
    const out = new Set<string>();
    for (let c: string | undefined = commit; c !== undefined && !out.has(c); c = this.commits.get(c)?.parent) out.add(c);
    return out;
  }

  /** The commits reachable from `head` and not from `base`, oldest first. */
  since(head: string, base: string): GitCommit[] {
    const before = this.ancestors(base);
    const out: GitCommit[] = [];
    for (let c: string | undefined = head; c !== undefined && !before.has(c); c = this.commits.get(c)?.parent) out.push(this.commits.get(c)!);
    return out.reverse();
  }

  /** The branch's commits, oldest first. */
  log(): GitCommit[] {
    return this.head === '' ? [] : this.since(this.head, '');
  }
}
