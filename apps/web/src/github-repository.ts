// The Repository tab's reads from GitHub: the commit a branch or sha names, a tree, a file's bytes.
import type { GitHubAuth } from '@union/core';
import { githubClient, type ClientOptions } from '@union/core/github-client';
import type { Octokit } from 'octokit';

import { orNull } from './github-repo-reads';
import type {
  RepositoryCommit,
  RepositoryEntry,
  RepositoryEntryType,
  RepositoryTree,
} from './repository-api-types';

type Repo = { owner: string; repo: string };

/** A tree to read: recursive from `sha`, or one folder's own entries when `prefix` (its path) is given. */
export type TreeRead = { sha: string; prefix?: string };

/** The Repository tab's reads from GitHub. Null when the ref, tree or file does not exist. Tests use a fake. */
export type RepositoryGitHub = {
  resolveCommit(
    auth: GitHubAuth,
    repo: Repo,
    ref: string,
  ): Promise<Omit<RepositoryCommit, 'ref'> | null>;
  getTree(auth: GitHubAuth, repo: Repo, read: TreeRead): Promise<RepositoryTree | null>;
  getBlob(auth: GitHubAuth, repo: Repo, sha: string): Promise<Uint8Array | null>;
};

const SYMLINK_MODE = '120000';
/** GitHub answers 422, not 404, for a ref that names no commit. */
const UNPROCESSABLE = 422;

/** The call's answer, or null when GitHub says the ref names nothing. */
async function refOrNull<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await orNull(call);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === UNPROCESSABLE
    ) {
      return null;
    }
    throw error;
  }
}

type RawEntry = { path?: string; mode?: string; type?: string; sha?: string; size?: number };

function typeOf(raw: RawEntry): RepositoryEntryType {
  if (raw.type === 'tree') {
    return 'dir';
  }
  if (raw.type === 'commit') {
    return 'submodule';
  }
  return raw.mode === SYMLINK_MODE ? 'link' : 'file';
}

/** GitHub's entry to ours, its path from the repository's root. */
function toEntry(raw: RawEntry, prefix: string | undefined): RepositoryEntry | null {
  if (raw.path === undefined || raw.sha === undefined) {
    return null;
  }
  return {
    path: prefix ? `${prefix}/${raw.path}` : raw.path,
    type: typeOf(raw),
    size: raw.size ?? null,
    sha: raw.sha,
  };
}

async function readCommit(
  octokit: Octokit,
  repo: Repo,
  ref: string,
): Promise<Omit<RepositoryCommit, 'ref'>> {
  // The sha media type answers the sha alone, not the commit's whole diff.
  const answer = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
    ...repo,
    ref,
    headers: { accept: 'application/vnd.github.sha' },
  });
  const sha: unknown = answer.data;
  if (typeof sha !== 'string') {
    throw new TypeError(`GitHub did not answer a sha for "${ref}"`);
  }
  const { data } = await octokit.rest.git.getCommit({ ...repo, commit_sha: sha.trim() });
  return {
    sha: data.sha,
    treeSha: data.tree.sha,
    message: data.message.split('\n')[0] ?? '',
    author: data.author.name || null,
    date: data.author.date || null,
    url: data.html_url,
  };
}

async function readTree(octokit: Octokit, repo: Repo, read: TreeRead): Promise<RepositoryTree> {
  const { data } = await octokit.rest.git.getTree({
    ...repo,
    tree_sha: read.sha,
    ...(read.prefix === undefined ? { recursive: 'true' } : {}),
  });
  const entries = data.tree.flatMap((raw) => toEntry(raw, read.prefix) ?? []);
  return { entries, truncated: data.truncated };
}

async function readBlob(octokit: Octokit, repo: Repo, sha: string): Promise<Uint8Array> {
  const { data } = await octokit.rest.git.getBlob({ ...repo, file_sha: sha });
  const encoding = data.encoding === 'base64' ? 'base64' : 'utf8';
  return new Uint8Array(Buffer.from(data.content, encoding));
}

export class OctokitRepository implements RepositoryGitHub {
  constructor(private readonly options: ClientOptions = {}) {}

  private client(auth: GitHubAuth): Octokit {
    return githubClient(auth, this.options);
  }

  resolveCommit(
    auth: GitHubAuth,
    repo: Repo,
    ref: string,
  ): Promise<Omit<RepositoryCommit, 'ref'> | null> {
    return refOrNull(() => readCommit(this.client(auth), repo, ref));
  }

  getTree(auth: GitHubAuth, repo: Repo, read: TreeRead): Promise<RepositoryTree | null> {
    return orNull(() => readTree(this.client(auth), repo, read));
  }

  getBlob(auth: GitHubAuth, repo: Repo, sha: string): Promise<Uint8Array | null> {
    return orNull(() => readBlob(this.client(auth), repo, sha));
  }
}
