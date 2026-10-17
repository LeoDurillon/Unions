import type { DiffStatus, PullRequestFile } from '@union/core';
import type { Octokit } from 'octokit';

/** The files of a pull request at its head commit, ready to review. */
export type PullRequestFiles = {
  state: 'open' | 'closed' | 'merged';
  headSha: string;
  headBranch: string;
  baseBranch: string;
  files: PullRequestFile[];
};

const STATUSES: Record<string, DiffStatus> = {
  added: 'added',
  removed: 'deleted',
  renamed: 'renamed',
};

type RawFile = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

/** GitHub's file to ours; GitHub leaves `patch` out for binary and very large files. */
export function toPullRequestFile(raw: RawFile, index: number): PullRequestFile {
  return {
    id: index + 1,
    path: raw.filename,
    oldPath: raw.previous_filename ?? raw.filename,
    status: STATUSES[raw.status] ?? 'modified',
    binary: raw.patch === undefined,
    additions: raw.additions,
    deletions: raw.deletions,
    patch: raw.patch ?? '',
  };
}

function stateOf(data: { state: string; merged: boolean }): PullRequestFiles['state'] {
  if (data.merged) {
    return 'merged';
  }
  return data.state === 'open' ? 'open' : 'closed';
}

/** The pull request's head commit, branches and changed files (GitHub lists up to 3000). */
export async function fetchPullRequestFiles(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  number: number,
): Promise<PullRequestFiles> {
  const { data } = await octokit.rest.pulls.get({ ...repo, pull_number: number });
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  return {
    state: stateOf(data),
    headSha: data.head.sha,
    headBranch: data.head.ref,
    baseBranch: data.base.ref,
    files: files.map((file, index) => toPullRequestFile(file, index)),
  };
}
