// The issue and pull request changes of the worker's GitHub client (issue text, PR title and base, labels, reviewers, assignees): the base of `OctokitGitHubApi`.
import { RequestError, type Octokit } from 'octokit';

import type { IssueText, RepoRef } from './api';

const NOT_FOUND = 404;

export function isNotFound(error: unknown): boolean {
  return error instanceof RequestError && error.status === NOT_FOUND;
}

/** Runs `call`; a 404 means there was nothing to undo. */
async function ignoreNotFound(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}

export class OctokitPullRequestChanges {
  /** A token client or an installation client (`githubClient` in `@union/core/github-client`). */
  constructor(protected readonly octokit: Octokit) {}

  async issueText(repo: RepoRef, number: number): Promise<IssueText> {
    const { data } = await this.octokit.rest.issues.get({ ...repo, issue_number: number });
    return { title: data.title, body: data.body ?? '' };
  }

  async updateIssue(repo: RepoRef, number: number, text: IssueText): Promise<string> {
    const { data } = await this.octokit.rest.issues.update({
      ...repo,
      issue_number: number,
      ...text,
    });
    return data.updated_at;
  }

  async closeIssue(repo: RepoRef, number: number): Promise<void> {
    await this.octokit.rest.issues.update({ ...repo, issue_number: number, state: 'closed' });
  }

  async updatePullRequestBase(repo: RepoRef, number: number, base: string): Promise<void> {
    await this.octokit.rest.pulls.update({ ...repo, pull_number: number, base });
  }

  async updatePullRequestTitle(repo: RepoRef, number: number, title: string): Promise<void> {
    await this.octokit.rest.pulls.update({ ...repo, pull_number: number, title });
  }

  async addLabels(repo: RepoRef, number: number, labels: string[]): Promise<void> {
    await this.octokit.rest.issues.addLabels({ ...repo, issue_number: number, labels });
  }

  async removeLabel(repo: RepoRef, number: number, label: string): Promise<void> {
    await ignoreNotFound(() =>
      this.octokit.rest.issues.removeLabel({ ...repo, issue_number: number, name: label }),
    );
  }

  async requestReviewers(repo: RepoRef, number: number, users: string[]): Promise<void> {
    await this.octokit.rest.pulls.requestReviewers({
      ...repo,
      pull_number: number,
      reviewers: users,
    });
  }

  async addAssignees(repo: RepoRef, number: number, users: string[]): Promise<void> {
    await this.octokit.rest.issues.addAssignees({
      ...repo,
      issue_number: number,
      assignees: users,
    });
  }
}
