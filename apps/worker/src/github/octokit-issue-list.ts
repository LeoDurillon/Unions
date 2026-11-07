// Lists a repository's issues updated since a time with Octokit, leaving out pull requests.
import type { Octokit } from 'octokit';

import type { RemoteIssue, RepoRef } from './api';

const PER_PAGE = 100;

/** Issues (open and closed) updated at or after `since`; the REST listing includes pull requests, dropped here. */
export async function listIssuesSince(
  octokit: Octokit,
  repo: RepoRef,
  since: string | null,
): Promise<RemoteIssue[]> {
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    ...repo,
    state: 'all',
    sort: 'updated',
    direction: 'asc',
    per_page: PER_PAGE,
    ...(since === null ? {} : { since }),
  });
  return issues
    .filter((issue) => issue.pull_request === undefined)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      updatedAt: issue.updated_at,
    }));
}
