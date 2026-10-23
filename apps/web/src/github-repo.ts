// Reads a repository's branches and issues from GitHub.
import type { Octokit } from 'octokit';

import type { GitHubIssue } from './api-types';

const PER_PAGE = 100;
/** The picker lists at most 1000 branches; a branch past them can still be typed. */
const MAX_PAGES = 10;

/** The repository's branch names, the default first then by name. */
export async function fetchBranchNames(
  octokit: Octokit,
  repo: { owner: string; repo: string },
): Promise<string[]> {
  const names: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order, and stop at the last one
    const { data } = await octokit.rest.repos.listBranches({ ...repo, per_page: PER_PAGE, page });
    names.push(...data.map((branch) => branch.name));
    if (data.length < PER_PAGE) {
      break;
    }
  }
  return names.toSorted((a, b) => a.localeCompare(b));
}

/** Throws GitHub's 404 when the branch does not exist. */
export async function fetchBranch(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  branch: string,
): Promise<string> {
  const { data } = await octokit.rest.repos.getBranch({ ...repo, branch });
  return data.name;
}

/** One issue of the repository; throws GitHub's 404 when there is none with that number. */
export async function fetchIssue(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  number: number,
): Promise<GitHubIssue> {
  const { data } = await octokit.rest.issues.get({ ...repo, issue_number: number });
  return {
    number: data.number,
    nodeId: data.node_id,
    title: data.title,
    body: data.body ?? '',
    url: data.html_url,
    state: data.state === 'closed' ? 'closed' : 'open',
    pullRequest: data.pull_request !== undefined,
  };
}
