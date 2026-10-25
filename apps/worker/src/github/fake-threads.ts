// The line threads of the in-memory GitHub for tests, with the replies and comments posted on pull requests: the base of `FakeGitHubApi`.
import type { RepoRef, ThreadPullRequest } from './api';
import { FakePulls } from './fake-pulls';

export type FakeThread = {
  id: string;
  /** `owner/repo` of its pull request. */
  repository: string;
  number: number;
  /** The URL of its first comment. */
  url: string;
  resolved: boolean;
  replies: string[];
};

export abstract class FakeThreads extends FakePulls {
  readonly threads: FakeThread[] = [];
  /** Conversation comments posted on pull requests, in order. */
  readonly pullComments: { number: number; body: string }[] = [];
  /** Set to make `resolveThread` fail with it. */
  resolveError: Error | null = null;

  private thread(threadId: string): FakeThread {
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      throw new Error(`Could not resolve to a node with the global id of '${threadId}'`);
    }
    return thread;
  }

  threadPullRequest(threadId: string): Promise<ThreadPullRequest | null> {
    this.calls.push('threadPullRequest');
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    return Promise.resolve(
      thread ? { repository: thread.repository, number: thread.number } : null,
    );
  }

  threadOfComment(_repo: RepoRef, number: number, url: string): Promise<string | null> {
    this.calls.push('threadOfComment');
    const thread = this.threads.find(
      (candidate) => candidate.number === number && candidate.url === url,
    );
    return Promise.resolve(thread?.id ?? null);
  }

  replyToThread(threadId: string, body: string): Promise<string> {
    this.calls.push('replyToThread');
    const thread = this.thread(threadId);
    thread.replies.push(body);
    return Promise.resolve(`${thread.url}-reply${thread.replies.length}`);
  }

  resolveThread(threadId: string): Promise<void> {
    this.calls.push('resolveThread');
    if (this.resolveError) {
      return Promise.reject(this.resolveError);
    }
    this.thread(threadId).resolved = true;
    return Promise.resolve();
  }

  createPullRequestComment(_repo: RepoRef, number: number, body: string): Promise<string> {
    this.calls.push('createPullRequestComment');
    this.pullComments.push({ number, body });
    return Promise.resolve(
      `https://github.test/pull/${number}#issuecomment-${this.pullComments.length}`,
    );
  }
}
