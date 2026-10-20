// GitHub stacks in the fake GitHub client: created, unstacked and read back over its pull requests.
import type { GitHubStack, RepoRef } from './api';
import { FakeProjectFields } from './fake-project-fields';

/** What a stack reads of a fake pull request. */
export type StackPull = {
  number: number;
  base: string;
  head: string;
  state?: 'open' | 'closed' | 'merged';
  mergedAt?: number;
  headSha?: string;
};

export abstract class FakeStacks extends FakeProjectFields {
  /** The pull request `number`, as the stack reads it. */
  protected abstract stackPull(number: number): StackPull;

  /** GitHub stacks by number; each holds its pull requests, bottom first. Unset: stacks unsupported. */
  stacks: Map<number, number[]> | null = new Map();

  createStack(_repo: RepoRef, pullRequests: number[]): Promise<number | null> {
    this.calls.push('createStack');
    if (this.stacks === null) {
      return Promise.resolve(null);
    }
    const number = this.stacks.size + 1;
    this.stacks.set(number, [...pullRequests]);
    return Promise.resolve(number);
  }

  unstack(_repo: RepoRef, stackNumber: number): Promise<void> {
    this.calls.push('unstack');
    this.stacks?.delete(stackNumber);
    return Promise.resolve();
  }

  pullRequestStack(_repo: RepoRef, number: number): Promise<GitHubStack | null> {
    this.calls.push('pullRequestStack');
    const found = [...(this.stacks ?? new Map<number, number[]>())].find(([, pulls]) =>
      pulls.includes(number),
    );
    if (!found) {
      return Promise.resolve(null);
    }
    const [stackNumber, numbers] = found;
    const pulls = numbers.map((n) => this.stackPull(n));
    return Promise.resolve({
      number: stackNumber,
      open: pulls.some((pull) => (pull.state ?? 'open') === 'open'),
      base: pulls[0]?.base ?? 'main',
      pullRequests: pulls.map((pull) => ({
        number: pull.number,
        state: (pull.state ?? 'open') === 'open' ? 'open' : 'closed',
        mergedAt: pull.state === 'merged' ? (pull.mergedAt ?? 0) : null,
        headRef: pull.head,
        headSha: pull.headSha ?? `sha-${pull.number}`,
      })),
    });
  }
}
