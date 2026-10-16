import type { ProjectFieldInput, ProjectLocator, RemoteProjectField } from '@union/core';

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

export type PullRequestState = 'open' | 'closed' | 'merged';
/** `mergedAt`: when GitHub merged it (epoch ms); null unless merged. */
export type PullRequestStatus = {
  state: PullRequestState;
  behindBy: number | null;
  mergedAt: number | null;
  /** When it was closed without being merged. */
  closedAt: number | null;
};

/** One line comment of a pull request review, in GitHub's terms (LEFT: the old side). */
export type ReviewLineComment = {
  path: string;
  body: string;
  side: 'LEFT' | 'RIGHT';
  line: number;
  /** Set for a comment on several lines. */
  startLine?: number;
};

/** One field of a Project item to set; a null value clears it. */
export type ProjectFieldChange = {
  projectNodeId: string;
  itemId: string;
  fieldId: string;
  value: ProjectFieldInput;
};

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
  /** The pull request's description as GitHub has it ('' when empty). */
  pullRequestBody(repo: RepoRef, number: number): Promise<string>;
  updatePullRequestBody(repo: RepoRef, number: number, body: string): Promise<void>;
  updatePullRequestTitle(repo: RepoRef, number: number, title: string): Promise<void>;
  /** Adds labels to an issue or pull request; GitHub creates the ones the repository lacks. */
  addLabels(repo: RepoRef, number: number, labels: string[]): Promise<void>;
  /** Removes a label; does nothing if the issue or pull request does not have it. */
  removeLabel(repo: RepoRef, number: number, label: string): Promise<void>;
  requestReviewers(repo: RepoRef, number: number, users: string[]): Promise<void>;
  addAssignees(repo: RepoRef, number: number, users: string[]): Promise<void>;
  /** The Project's fields a rule can set; throws when the Project is not found. */
  projectFields(projectNodeId: string): Promise<RemoteProjectField[]>;
  setProjectField(change: ProjectFieldChange): Promise<void>;
  /** The pull request's node id, to add it to a Project. */
  pullRequestNodeId(repo: RepoRef, number: number): Promise<string>;
  /** Un-drafts the pull request; does nothing if it is already ready. */
  markPullRequestReady(repo: RepoRef, number: number): Promise<void>;
  /**
   * The pull request's state and, when `behind` is asked and it is open, how many commits its base
   * has that its branch lacks. Null when the pull request is gone.
   */
  pullRequestStatus(
    repo: RepoRef,
    number: number,
    behind: boolean,
  ): Promise<PullRequestStatus | null>;
  /** Posts a "Comment" review: an overall note and line comments, anchored at `commitId`. */
  createPullRequestReview(
    repo: RepoRef,
    number: number,
    review: { commitId: string | null; body: string; comments: ReviewLineComment[] },
  ): Promise<string>;
  /** Numbers of the issues of `repo` the issue is marked as blocked by. */
  listBlockedBy(repo: RepoRef, issueNumber: number): Promise<number[]>;
  /** Marks the issue as blocked by another issue of the same repository. */
  addBlockedBy(repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void>;
  /** Removes that relation; does nothing if it (or the blocking issue) is gone. */
  removeBlockedBy(repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void>;
};
