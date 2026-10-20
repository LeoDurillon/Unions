// GitHub's stacked pull requests in the worker's GitHub client: create a stack, unstack it, read a pull request's.
import { RequestError } from 'octokit';

import type { GitHubStack, RepoRef } from './api';
import { isNotFound, OctokitPullRequestChanges } from './octokit-pull-request-changes';

/** The REST version the stacks endpoints belong to. */
const HEADERS = { 'X-GitHub-Api-Version': '2026-03-10' };
const NO_CONTENT = 204;

type RawStack = {
  number: number;
  open: boolean;
  base: { ref: string };
  pull_requests: {
    number: number;
    state: string;
    merged_at: string | null;
    head: { ref: string; sha: string };
  }[];
};

function isRawStack(value: unknown): value is RawStack {
  return (
    typeof value === 'object' &&
    value !== null &&
    'number' in value &&
    'pull_requests' in value &&
    Array.isArray(value.pull_requests)
  );
}

function stackOf(raw: RawStack): GitHubStack {
  return {
    number: raw.number,
    open: raw.open,
    base: raw.base.ref,
    pullRequests: raw.pull_requests.map((pull) => ({
      number: pull.number,
      state: pull.state === 'open' ? 'open' : 'closed',
      mergedAt: pull.merged_at === null ? null : Date.parse(pull.merged_at),
      headRef: pull.head.ref,
      headSha: pull.head.sha,
    })),
  };
}

export class OctokitStacks extends OctokitPullRequestChanges {
  async createStack(repo: RepoRef, pullRequests: number[]): Promise<number | null> {
    try {
      const { data } = await this.octokit.request('POST /repos/{owner}/{repo}/stacks', {
        ...repo,
        pull_requests: pullRequests,
        headers: HEADERS,
      });
      return isRawStack(data) ? data.number : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async unstack(repo: RepoRef, stackNumber: number): Promise<void> {
    try {
      await this.octokit.request('POST /repos/{owner}/{repo}/stacks/{stack_number}/unstack', {
        ...repo,
        stack_number: stackNumber,
        headers: HEADERS,
      });
    } catch (error) {
      if (!isNotFound(error) && !(error instanceof RequestError && error.status === NO_CONTENT)) {
        throw error;
      }
    }
  }

  async pullRequestStack(repo: RepoRef, number: number): Promise<GitHubStack | null> {
    try {
      const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/stacks', {
        ...repo,
        pull_request: number,
        headers: HEADERS,
      });
      const [found] = Array.isArray(data) ? data.filter((stack) => isRawStack(stack)) : [];
      return found === undefined ? null : stackOf(found);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}
