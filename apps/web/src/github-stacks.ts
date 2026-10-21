// The web's reads of GitHub's stacks of pull requests: the repository's open ones, or the one holding a pull request.
import type { GitHubAuth } from '@union/core';
import { parseStacks, STACKS_API_HEADERS, type GitHubStack } from '@union/core/github-stacks';
import type { Octokit } from 'octokit';

type Repo = { owner: string; repo: string };

const PER_PAGE = 100;
/** Past this many pages (500 stacks), the oldest stacks are not read. */
const MAX_PAGES = 5;

/** The stack reads of `OnboardingGitHub`. */
export type StackReads = {
  /** The repository's open stacks, bottom first each; null where GitHub has no stacks (a 404). */
  listStacks(auth: GitHubAuth, repo: Repo): Promise<GitHubStack[] | null>;
  /** The stack holding the pull request; null when it is in none, or GitHub has no stacks. */
  pullRequestStack(auth: GitHubAuth, repo: Repo, number: number): Promise<GitHubStack | null>;
};

async function stacksPage(octokit: Octokit, repo: Repo, page: number): Promise<GitHubStack[]> {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/stacks', {
    ...repo,
    per_page: PER_PAGE,
    page,
    headers: STACKS_API_HEADERS,
  });
  return parseStacks(data);
}

export async function fetchStacks(octokit: Octokit, repo: Repo): Promise<GitHubStack[]> {
  const stacks: GitHubStack[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- the next page is asked only when this one was full
    const found = await stacksPage(octokit, repo, page);
    stacks.push(...found);
    if (found.length < PER_PAGE) {
      break;
    }
  }
  return stacks.filter((stack) => stack.open);
}

export async function fetchPullRequestStack(
  octokit: Octokit,
  repo: Repo,
  number: number,
): Promise<GitHubStack | null> {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/stacks', {
    ...repo,
    pull_request: number,
    headers: STACKS_API_HEADERS,
  });
  return parseStacks(data)[0] ?? null;
}
