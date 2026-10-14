import type { PullRequestFile } from '@union/core';
import type { Octokit } from 'octokit';

import type { ReviewCommit } from './api-types';
import { toPullRequestFile } from './github-pull-request-files';

const PER_PAGE = 100;
/** GitHub lists at most 3000 files of a commit, 100 a page. */
const MAX_PAGES = 30;

/** The pull request's commits, oldest first (GitHub lists up to 250). */
export async function fetchReviewCommits(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  number: number,
): Promise<ReviewCommit[]> {
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    ...repo,
    pull_number: number,
    per_page: PER_PAGE,
  });
  return commits.map((commit) => {
    const [title = '', ...rest] = commit.commit.message.split('\n');
    return {
      sha: commit.sha,
      title,
      body: rest.join('\n').trim(),
      author: commit.author?.login ?? commit.commit.author?.name ?? 'unknown',
      date: commit.commit.author?.date ?? null,
      parents: commit.parents.length,
    };
  });
}

/** A commit's changed files, against its first parent. */
export async function fetchCommitFiles(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  sha: string,
): Promise<PullRequestFile[]> {
  const files: PullRequestFile[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each page says whether another follows
    const { data } = await octokit.rest.repos.getCommit({
      ...repo,
      ref: sha,
      per_page: PER_PAGE,
      page,
    });
    const batch = data.files ?? [];
    files.push(...batch.map((file, index) => toPullRequestFile(file, files.length + index)));
    if (batch.length < PER_PAGE) {
      break;
    }
  }
  return files;
}
