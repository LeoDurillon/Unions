// GitHub's stacked pull requests in the worker's GitHub client: create a stack, unstack it, read a pull request's.
import {
  parseStack,
  parseStacks,
  STACKS_API_HEADERS,
  type GitHubStack,
} from '@union/core/github-stacks';
import { RequestError } from 'octokit';

import type { RepoRef } from './api';
import { isNotFound, OctokitPullRequestChanges } from './octokit-pull-request-changes';

const NO_CONTENT = 204;

export class OctokitStacks extends OctokitPullRequestChanges {
  async createStack(repo: RepoRef, pullRequests: number[]): Promise<number | null> {
    try {
      const { data } = await this.octokit.request('POST /repos/{owner}/{repo}/stacks', {
        ...repo,
        pull_requests: pullRequests,
        headers: STACKS_API_HEADERS,
      });
      return parseStack(data)?.number ?? null;
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
        headers: STACKS_API_HEADERS,
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
        headers: STACKS_API_HEADERS,
      });
      return parseStacks(data)[0] ?? null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}
