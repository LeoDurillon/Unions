// The web's repository and Project reads from GitHub: branches, an issue, what a rule picks from (labels, users, Project fields); null for what does not exist.
import {
  parseProjectFields,
  PROJECT_FIELDS,
  type GitHubAuth,
  type ProjectField,
  type ProjectFieldsResponse,
} from '@union/core';
import { githubClient, type ClientOptions } from '@union/core/github-client';
import type { GitHubStack } from '@union/core/github-stacks';
import type { Octokit } from 'octokit';

import type { GitHubIssue } from './api-types';
import type { RuleChoices } from './event-api-types';
import { fetchBranch, fetchBranchNames, fetchIssue } from './github-repo';
import { fetchRuleChoices } from './github-rule-choices';
import { fetchPullRequestStack, fetchStacks } from './github-stacks';

export type { RuleChoices } from './event-api-types';
export type { StackReads } from './github-stacks';

type Repo = { owner: string; repo: string };

const NOT_FOUND = 404;

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if ('status' in error && error.status === NOT_FOUND) {
    return true;
  }
  // GraphQL answers 200 with a NOT_FOUND error for a missing pull request.
  return (
    'errors' in error &&
    Array.isArray(error.errors) &&
    error.errors.some(
      (item: unknown) =>
        typeof item === 'object' && item !== null && 'type' in item && item.type === 'NOT_FOUND',
    )
  );
}

/** The call's answer, or null when GitHub says the thing does not exist. */
export async function orNull<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/** The repository reads of `OnboardingGitHub` (stacks included), and the client every call builds from its credentials. */
export class OctokitRepoReads {
  constructor(protected readonly options: ClientOptions = {}) {}

  protected client(auth: GitHubAuth): Octokit {
    return githubClient(auth, this.options);
  }

  listBranches(auth: GitHubAuth, repo: Repo): Promise<string[] | null> {
    return orNull(() => fetchBranchNames(this.client(auth), repo));
  }

  async hasBranch(auth: GitHubAuth, repo: Repo, branch: string): Promise<boolean> {
    return (await orNull(() => fetchBranch(this.client(auth), repo, branch))) !== null;
  }

  getIssue(auth: GitHubAuth, repo: Repo, number: number): Promise<GitHubIssue | null> {
    return orNull(() => fetchIssue(this.client(auth), repo, number));
  }

  listStacks(auth: GitHubAuth, repo: Repo): Promise<GitHubStack[] | null> {
    return orNull(() => fetchStacks(this.client(auth), repo));
  }

  pullRequestStack(auth: GitHubAuth, repo: Repo, number: number): Promise<GitHubStack | null> {
    return orNull(() => fetchPullRequestStack(this.client(auth), repo, number));
  }

  listRuleChoices(auth: GitHubAuth, repo: Repo): Promise<RuleChoices | null> {
    return orNull(() => fetchRuleChoices(this.client(auth), repo));
  }

  async listProjectFields(auth: GitHubAuth, projectNodeId: string): Promise<ProjectField[] | null> {
    const data = await orNull(() =>
      this.client(auth).graphql<ProjectFieldsResponse>(PROJECT_FIELDS, { id: projectNodeId }),
    );
    const fields = data ? parseProjectFields(data) : null;
    return fields?.map(({ id, name, type, options }) => ({ id, name, type, options })) ?? null;
  }
}
