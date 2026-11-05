// Keeps the Repository tab's trees and files in memory: both are named by their sha, so they never change.
import type { GitHubAuth } from '@union/core';

import type { RepositoryGitHub, TreeRead } from './github-repository';
import type { RepositoryCommit, RepositoryTree } from './repository-api-types';
import { WeightedLru } from './weighted-lru';

type Repo = { owner: string; repo: string };

/** Bytes of files kept; the oldest read goes first. */
const BLOB_BYTES = 64_000_000;
/** Trees kept, whole repositories included. */
const TREES = 16;

function keyOf(repo: Repo, ...parts: string[]): string {
  return [repo.owner, repo.repo, ...parts].join('\u0000');
}

/** The reads of another `RepositoryGitHub`, trees and files kept; the commit a ref names is always read again. */
export class CachedRepository implements RepositoryGitHub {
  private readonly trees = new WeightedLru<RepositoryTree>(TREES, () => 1);
  private readonly blobs = new WeightedLru<Uint8Array>(BLOB_BYTES, (bytes) => bytes.byteLength);

  constructor(private readonly inner: RepositoryGitHub) {}

  resolveCommit(
    auth: GitHubAuth,
    repo: Repo,
    ref: string,
  ): Promise<Omit<RepositoryCommit, 'ref'> | null> {
    return this.inner.resolveCommit(auth, repo, ref);
  }

  async getTree(auth: GitHubAuth, repo: Repo, read: TreeRead): Promise<RepositoryTree | null> {
    const key = keyOf(repo, read.sha, read.prefix ?? '');
    const kept = this.trees.get(key);
    if (kept) {
      return kept;
    }
    const tree = await this.inner.getTree(auth, repo, read);
    if (tree) {
      this.trees.set(key, tree);
    }
    return tree;
  }

  async getBlob(auth: GitHubAuth, repo: Repo, sha: string): Promise<Uint8Array | null> {
    const key = keyOf(repo, sha);
    const kept = this.blobs.get(key);
    if (kept) {
      return kept;
    }
    const bytes = await this.inner.getBlob(auth, repo, sha);
    if (bytes) {
      this.blobs.set(key, bytes);
    }
    return bytes;
  }
}
