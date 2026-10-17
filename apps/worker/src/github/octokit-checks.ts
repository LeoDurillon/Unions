// The CI checks of the worker's GitHub client: a pull request's head commit and the overall state of its checks, in one GraphQL call.
import type { ChecksState, PullRequestChecks, RepoRef } from './api';
import { OctokitPullRequestChanges } from './octokit-pull-request-changes';

const CHECKS_ROLLUP = /* GraphQL */ `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        commits(last: 1) {
          nodes {
            commit {
              oid
              statusCheckRollup {
                state
              }
            }
          }
        }
      }
    }
  }
`;

type RollupState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED';

type HeadCommit = { oid: string; statusCheckRollup: { state: RollupState } | null };

type RollupResponse = {
  repository: { pullRequest: { commits: { nodes: { commit: HeadCommit }[] } } | null } | null;
};

const STATES: Record<RollupState, ChecksState> = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

/** GraphQL's errors, when `error` is its answer rather than a network failure. */
function graphqlErrors(error: unknown): unknown[] {
  return error instanceof Error && 'errors' in error && Array.isArray(error.errors)
    ? error.errors
    : [];
}

/** GraphQL's answer when the installation lacks read on Checks or Commit statuses. */
function isForbidden(error: unknown): boolean {
  return graphqlErrors(error).some(
    (entry) =>
      typeof entry === 'object' && entry !== null && 'type' in entry && entry.type === 'FORBIDDEN',
  );
}

function checksOf(data: RollupResponse): PullRequestChecks | null {
  const commit = data.repository?.pullRequest?.commits.nodes.at(-1)?.commit;
  if (!commit) {
    return null;
  }
  const rollup = commit.statusCheckRollup;
  return { sha: commit.oid, state: rollup ? STATES[rollup.state] : null };
}

export class OctokitChecks extends OctokitPullRequestChanges {
  async pullRequestChecks(repo: RepoRef, number: number): Promise<PullRequestChecks | null> {
    try {
      const data = await this.octokit.graphql<RollupResponse>(CHECKS_ROLLUP, { ...repo, number });
      return checksOf(data);
    } catch (error) {
      if (isForbidden(error)) {
        return null;
      }
      throw error;
    }
  }
}
