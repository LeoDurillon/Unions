// Reads the repository's newest pull requests from GitHub, for the Pull requests tab.
import type { Octokit } from 'octokit';

import type { PullRequestFilter, PullRequestListItem } from './api-types';
import { REPOSITORY_PULL_REQUESTS } from './github-queries';

/** A pull request as GitHub knows it: the ticket link is added from our side. */
export type RemotePullRequest = Omit<PullRequestListItem, 'ticketId' | 'stack'>;

export type RawPullRequest = {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  isCrossRepository: boolean;
  updatedAt: string;
  reviewDecision: string | null;
  additions: number;
  deletions: number;
  author: { login: string } | null;
};

type Data = {
  repository: {
    pullRequests: { totalCount: number; nodes: (RawPullRequest | null)[] };
  } | null;
};

const STATE_NAMES = {
  OPEN: 'open',
  CLOSED: 'closed',
  MERGED: 'merged',
} as const satisfies Record<RawPullRequest['state'], RemotePullRequest['state']>;

const STATES: Record<PullRequestFilter, string[]> = {
  open: ['OPEN'],
  closed: ['CLOSED', 'MERGED'],
  all: ['OPEN', 'CLOSED', 'MERGED'],
};

/** GitHub's shape to ours; a deleted account shows as "ghost", as on GitHub. */
export function toPullRequest(raw: RawPullRequest): RemotePullRequest {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: STATE_NAMES[raw.state],
    draft: raw.isDraft,
    author: raw.author?.login ?? 'ghost',
    headBranch: raw.headRefName,
    baseBranch: raw.baseRefName,
    crossRepository: raw.isCrossRepository,
    updatedAt: raw.updatedAt,
    reviewDecision: raw.reviewDecision,
    additions: raw.additions,
    deletions: raw.deletions,
  };
}

/** The newest 100 pull requests matching the filter; null when the repository is not reachable. */
export async function fetchPullRequests(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  filter: PullRequestFilter,
): Promise<{ total: number; pullRequests: RemotePullRequest[] } | null> {
  const data = await octokit.graphql<Data>(REPOSITORY_PULL_REQUESTS, {
    ...repo,
    states: STATES[filter],
  });
  const list = data.repository?.pullRequests;
  if (!list) {
    return null;
  }
  return {
    total: list.totalCount,
    pullRequests: list.nodes.flatMap((node) => (node ? [toPullRequest(node)] : [])),
  };
}
