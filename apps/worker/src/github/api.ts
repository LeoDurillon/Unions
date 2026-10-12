import type { ProjectLocator } from '@union/core';

export type RepoRef = { owner: string; repo: string };

export type IssueRef = { number: number; nodeId: string };

export type ProjectInfo = {
  statusFieldId: string;
  /** Status option name → option id. */
  options: Record<string, string>;
};

export type RemoteItem = {
  itemId: string;
  issueNumber: number;
  issueNodeId: string;
  /** `owner/repo` of the issue. */
  repository: string;
  title: string;
  body: string;
  /** Name of the Status option, or null when unset. */
  status: string | null;
  updatedAt: string;
};

export type RemoteComment = { id: string; body: string };

export type PullRequestRef = { number: number; url: string };

/** The only surface of GitHub the worker uses. Tests substitute an in-memory fake. */
export type GitHubApi = {
  resolveProject(locator: ProjectLocator): Promise<string>;
  getProjectInfo(projectNodeId: string): Promise<ProjectInfo>;
  createIssue(repo: RepoRef, input: { title: string; body: string }): Promise<IssueRef>;
  addToProject(projectNodeId: string, issueNodeId: string): Promise<string>;
  setStatus(input: {
    projectNodeId: string;
    itemId: string;
    fieldId: string;
    optionId: string;
  }): Promise<void>;
  listComments(repo: RepoRef, issueNumber: number): Promise<RemoteComment[]>;
  createComment(repo: RepoRef, issueNumber: number, body: string): Promise<string>;
  updateComment(repo: RepoRef, commentId: string, body: string): Promise<void>;
  listProjectItems(projectNodeId: string): Promise<RemoteItem[]>;
  /** The open pull request whose head is `branch` in the same repository, if any. */
  findPullRequest(repo: RepoRef, branch: string): Promise<PullRequestRef | null>;
  createPullRequest(
    repo: RepoRef,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<PullRequestRef>;
  /** Un-drafts the pull request; does nothing if it is already ready. */
  markPullRequestReady(repo: RepoRef, number: number): Promise<void>;
  /** Numbers of the issues of `repo` the issue is marked as blocked by. */
  listBlockedBy(repo: RepoRef, issueNumber: number): Promise<number[]>;
  /** Marks the issue as blocked by another issue of the same repository. */
  addBlockedBy(repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void>;
  /** Removes that relation; does nothing if it (or the blocking issue) is gone. */
  removeBlockedBy(repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void>;
};
