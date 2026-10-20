import type {
  ChecksState,
  GitHubApi,
  PullRequestChecks,
  IssueRef,
  IssueText,
  ProjectInfo,
  PullRequestRef,
  PullRequestReview,
  PullRequestState,
  PullRequestStatus,
  RemoteComment,
  RemoteItem,
  RepoRef,
} from './api';
import { FakeProjectFields } from './fake-project-fields';

type FakeIssue = {
  number: number;
  nodeId: string;
  title: string;
  body: string;
  status: string | null;
  updatedAt: string;
  comments: RemoteComment[];
  blockedBy: number[];
  /** Unset: open. */
  state?: 'closed';
};

const DEFAULT_INFO: ProjectInfo = {
  statusFieldId: 'F_status',
  options: { Todo: 'o_todo', 'In Progress': 'o_prog', Done: 'o_done' },
};
const MS_PER_SECOND = 1000;

/** In-memory GitHub for tests. `calls` records every method name, in order (`FakeProjectFields`). */
export class FakeGitHubApi extends FakeProjectFields implements GitHubApi {
  readonly issues: FakeIssue[] = [];
  readonly pulls: (PullRequestRef & {
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
  })[] = [];
  /** Commit → the state of its checks; a commit missing has none. */
  readonly checks = new Map<string, ChecksState>();
  /** Reviews posted, in order. */
  readonly reviews: ({ number: number } & PullRequestReview)[] = [];
  private clock = 0;
  private commentSeq = 0;

  private readonly info: ProjectInfo;

  constructor(info?: ProjectInfo) {
    super();
    this.info = info ?? DEFAULT_INFO;
  }

  /** Simulates a user editing the issue or moving the card on GitHub. */
  editRemote(number: number, change: Partial<Pick<FakeIssue, 'title' | 'body' | 'status'>>): void {
    const issue = this.issueByNumber(number);
    Object.assign(issue, change, { updatedAt: this.tick() });
  }

  issueByNumber(number: number): FakeIssue {
    const issue = this.issues.find((candidate) => candidate.number === number);
    if (!issue) {
      throw new Error(`No fake issue #${number}`);
    }
    return issue;
  }

  resolveProject(): Promise<string> {
    this.calls.push('resolveProject');
    return Promise.resolve('P_resolved');
  }

  getProjectInfo(): Promise<ProjectInfo> {
    this.calls.push('getProjectInfo');
    return Promise.resolve(this.info);
  }

  createIssue(_repo: RepoRef, input: { title: string; body: string }): Promise<IssueRef> {
    this.calls.push('createIssue');
    const number = this.issues.length + 1;
    this.issues.push({
      number,
      nodeId: `I_${number}`,
      ...input,
      status: null,
      updatedAt: this.tick(),
      comments: [],
      blockedBy: [],
    });
    return Promise.resolve({ number, nodeId: `I_${number}` });
  }

  issueText(_repo: RepoRef, number: number): Promise<IssueText> {
    this.calls.push('issueText');
    const { title, body } = this.issueByNumber(number);
    return Promise.resolve({ title, body });
  }

  updateIssue(_repo: RepoRef, number: number, text: IssueText): Promise<string> {
    this.calls.push('updateIssue');
    const issue = this.issueByNumber(number);
    Object.assign(issue, text, { updatedAt: this.tick() });
    return Promise.resolve(issue.updatedAt);
  }

  addToProject(_projectNodeId: string, issueNodeId: string): Promise<string> {
    this.calls.push('addToProject');
    return Promise.resolve(`item_${issueNodeId}`);
  }

  setStatus(input: { itemId: string; optionId: string }): Promise<void> {
    this.calls.push('setStatus');
    const name = Object.entries(this.info.options).find(([, id]) => id === input.optionId)?.[0];
    const issue = this.issues.find((candidate) => `item_${candidate.nodeId}` === input.itemId);
    if (issue && name) {
      issue.status = name;
    }
    return Promise.resolve();
  }

  listComments(_repo: RepoRef, issueNumber: number): Promise<RemoteComment[]> {
    this.calls.push('listComments');
    return Promise.resolve([...this.issueByNumber(issueNumber).comments]);
  }

  createComment(_repo: RepoRef, issueNumber: number, body: string): Promise<string> {
    this.calls.push('createComment');
    this.commentSeq += 1;
    const issue = this.issueByNumber(issueNumber);
    issue.comments.push({ id: String(this.commentSeq), body });
    issue.updatedAt = this.tick();
    return Promise.resolve(String(this.commentSeq));
  }

  updateComment(_repo: RepoRef, commentId: string, body: string): Promise<void> {
    this.calls.push('updateComment');
    for (const issue of this.issues) {
      const comment = issue.comments.find((candidate) => candidate.id === commentId);
      if (comment) {
        comment.body = body;
        issue.updatedAt = this.tick();
      }
    }
    return Promise.resolve();
  }

  listProjectItems(): Promise<RemoteItem[]> {
    this.calls.push('listProjectItems');
    return Promise.resolve(
      this.issues.map((issue) => ({
        itemId: `item_${issue.nodeId}`,
        issueNumber: issue.number,
        issueNodeId: issue.nodeId,
        repository: 'o/r',
        title: issue.title,
        body: issue.body,
        status: issue.status,
        updatedAt: issue.updatedAt,
      })),
    );
  }

  findPullRequest(_repo: RepoRef, branch: string): Promise<PullRequestRef | null> {
    this.calls.push('findPullRequest');
    const pull = this.pulls.find((candidate) => candidate.head === branch);
    return Promise.resolve(pull ? { number: pull.number, url: pull.url } : null);
  }

  createPullRequest(
    _repo: RepoRef,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<PullRequestRef> {
    this.calls.push('createPullRequest');
    const number = this.issues.length + this.pulls.length + 1;
    const pull = { number, url: `https://github.test/pull/${number}`, draft: true, ...input };
    this.pulls.push(pull);
    return Promise.resolve({ number, url: pull.url });
  }

  pullRequestBody(_repo: RepoRef, number: number): Promise<string> {
    this.calls.push('pullRequestBody');
    return Promise.resolve(this.pulls.find((candidate) => candidate.number === number)?.body ?? '');
  }

  updatePullRequestBody(_repo: RepoRef, number: number, body: string): Promise<void> {
    this.calls.push('updatePullRequestBody');
    const pull = this.pulls.find((candidate) => candidate.number === number);
    if (pull) {
      pull.body = body;
    }
    return Promise.resolve();
  }

  /** The pull request `number`; throws like GitHub's 404 when there is none. */
  pullByNumber(number: number): FakeGitHubApi['pulls'][number] {
    const pull = this.pulls.find((candidate) => candidate.number === number);
    if (!pull) {
      throw new Error(`No fake pull request #${number}`);
    }
    return pull;
  }

  closeIssue(_repo: RepoRef, number: number): Promise<void> {
    this.calls.push('closeIssue');
    this.issueByNumber(number).state = 'closed';
    return Promise.resolve();
  }

  updatePullRequestBase(_repo: RepoRef, number: number, base: string): Promise<void> {
    this.calls.push('updatePullRequestBase');
    this.pullByNumber(number).base = base;
    return Promise.resolve();
  }

  updatePullRequestTitle(_repo: RepoRef, number: number, title: string): Promise<void> {
    this.calls.push('updatePullRequestTitle');
    this.pullByNumber(number).title = title;
    return Promise.resolve();
  }

  addLabels(_repo: RepoRef, number: number, labels: string[]): Promise<void> {
    this.calls.push('addLabels');
    const pull = this.pullByNumber(number);
    pull.labels = [...new Set([...(pull.labels ?? []), ...labels])];
    return Promise.resolve();
  }

  removeLabel(_repo: RepoRef, number: number, label: string): Promise<void> {
    this.calls.push('removeLabel');
    const pull = this.pullByNumber(number);
    pull.labels = (pull.labels ?? []).filter((name) => name !== label);
    return Promise.resolve();
  }

  requestReviewers(_repo: RepoRef, number: number, users: string[]): Promise<void> {
    this.calls.push('requestReviewers');
    const pull = this.pullByNumber(number);
    pull.reviewers = [...new Set([...(pull.reviewers ?? []), ...users])];
    return Promise.resolve();
  }

  addAssignees(_repo: RepoRef, number: number, users: string[]): Promise<void> {
    this.calls.push('addAssignees');
    const pull = this.pullByNumber(number);
    pull.assignees = [...new Set([...(pull.assignees ?? []), ...users])];
    return Promise.resolve();
  }

  markPullRequestReady(_repo: RepoRef, number: number): Promise<void> {
    this.calls.push('markPullRequestReady');
    const pull = this.pulls.find((candidate) => candidate.number === number);
    if (pull) {
      pull.draft = false;
    }
    return Promise.resolve();
  }

  pullRequestStatus(
    _repo: RepoRef,
    number: number,
    behind: boolean,
  ): Promise<PullRequestStatus | null> {
    this.calls.push(behind ? 'pullRequestStatus+behind' : 'pullRequestStatus');
    const pull = this.pulls.find((candidate) => candidate.number === number);
    if (!pull) {
      return Promise.resolve(null);
    }
    const state = pull.state ?? 'open';
    const behindBy = state === 'open' && behind ? (pull.behindBy ?? 0) : null;
    const mergedAt = state === 'merged' ? (pull.mergedAt ?? 0) : null;
    const closedAt = state === 'closed' ? (pull.closedAt ?? 0) : null;
    const refs = { base: pull.base, headSha: pull.headSha ?? `sha-${pull.number}` };
    return Promise.resolve({ state, behindBy, mergedAt, closedAt, ...refs });
  }

  /** Jobs run again, in order. */
  readonly reruns: number[] = [];

  rerunJob(_repo: RepoRef, jobId: number): Promise<void> {
    this.calls.push('rerunJob');
    this.reruns.push(jobId);
    return Promise.resolve();
  }

  pullRequestChecks(_repo: RepoRef, number: number): Promise<PullRequestChecks | null> {
    this.calls.push('pullRequestChecks');
    const pull = this.pulls.find((candidate) => candidate.number === number);
    const sha = pull?.headSha ?? `sha-${number}`;
    return Promise.resolve(pull ? { sha, state: this.checks.get(sha) ?? null } : null);
  }

  createPullRequestReview(
    _repo: RepoRef,
    number: number,
    review: PullRequestReview,
  ): Promise<string> {
    this.calls.push('createPullRequestReview');
    this.reviews.push({ number, ...review });
    return Promise.resolve(`https://github.test/pull/${number}#review-${this.reviews.length}`);
  }

  listBlockedBy(_repo: RepoRef, issueNumber: number): Promise<number[]> {
    this.calls.push('listBlockedBy');
    return Promise.resolve([...this.issueByNumber(issueNumber).blockedBy]);
  }

  addBlockedBy(_repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void> {
    this.calls.push('addBlockedBy');
    const issue = this.issueByNumber(issueNumber);
    if (issue.blockedBy.includes(blockingNumber)) {
      return Promise.reject(new Error('Validation Failed: dependency already exists'));
    }
    issue.blockedBy.push(blockingNumber);
    return Promise.resolve();
  }

  removeBlockedBy(_repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void> {
    this.calls.push('removeBlockedBy');
    const issue = this.issueByNumber(issueNumber);
    issue.blockedBy = issue.blockedBy.filter((number) => number !== blockingNumber);
    return Promise.resolve();
  }

  private tick(): string {
    this.clock += 1;
    return new Date(this.clock * MS_PER_SECOND).toISOString();
  }
}
