// The pull requests of the in-memory GitHub for tests, and their lookups by branch: the base of `FakeGitHubApi`.
import type { PullRequestRef, PullRequestState, RepoRef } from './api';
import { FakeStacks } from './fake-stacks';

export type FakePull = PullRequestRef & {
  head: string;
  base: string;
  title: string;
  body: string;
  draft: boolean;
  labels?: string[];
  reviewers?: string[];
  assignees?: string[];
  /** Unset: open. */
  state?: PullRequestState;
  behindBy?: number;
  /** When merged; unset reads as 0. */
  mergedAt?: number;
  closedAt?: number;
  /** The head commit; unset reads as `sha-<number>`. */
  headSha?: string;
};

export abstract class FakePulls extends FakeStacks {
  readonly pulls: FakePull[] = [];

  findPullRequest(_repo: RepoRef, branch: string): Promise<PullRequestRef | null> {
    this.calls.push('findPullRequest');
    const pull = this.pulls.find((candidate) => candidate.head === branch);
    return Promise.resolve(pull ? { number: pull.number, url: pull.url } : null);
  }

  mergedPullRequest(_repo: RepoRef, branch: string): Promise<number | null> {
    this.calls.push('mergedPullRequest');
    const pull = this.pulls.find(
      (candidate) => candidate.head === branch && candidate.state === 'merged',
    );
    return Promise.resolve(pull?.number ?? null);
  }
}
