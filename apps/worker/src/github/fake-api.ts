import type {
  GitHubApi,
  IssueRef,
  ProjectInfo,
  PullRequestRef,
  RemoteComment,
  RemoteItem,
  RepoRef,
  ReviewLineComment,
} from './api';

type FakeIssue = {
  number: number;
  nodeId: string;
  title: string;
  body: string;
  status: string | null;
  updatedAt: string;
  comments: RemoteComment[];
  blockedBy: number[];
};

const DEFAULT_INFO: ProjectInfo = {
  statusFieldId: 'F_status',
  options: { Todo: 'o_todo', 'In Progress': 'o_prog', Done: 'o_done' },
};
const MS_PER_SECOND = 1000;

/** In-memory GitHub for tests. `calls` records every method name, in order. */
export class FakeGitHubApi implements GitHubApi {
  readonly calls: string[] = [];
  readonly issues: FakeIssue[] = [];
  readonly pulls: (PullRequestRef & {
    head: string;
    base: string;
    title: string;
    body: string;
    draft: boolean;
    /** Unset: open. */
    state?: 'open' | 'closed';
    behindBy?: number;
  })[] = [];
  /** Reviews posted, in order. */
  readonly reviews: {
    number: number;
    commitId: string | null;
    body: string;
    comments: ReviewLineComment[];
  }[] = [];
  private clock = 0;
  private commentSeq = 0;

  private readonly info: ProjectInfo;

  constructor(info?: ProjectInfo) {
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

  markPullRequestReady(_repo: RepoRef, number: number): Promise<void> {
    this.calls.push('markPullRequestReady');
    const pull = this.pulls.find((candidate) => candidate.number === number);
    if (pull) {
      pull.draft = false;
    }
    return Promise.resolve();
  }

  pullRequestBehind(_repo: RepoRef, number: number): Promise<number | null> {
    this.calls.push('pullRequestBehind');
    const pull = this.pulls.find((candidate) => candidate.number === number);
    return Promise.resolve(pull && pull.state !== 'closed' ? (pull.behindBy ?? 0) : null);
  }

  createPullRequestReview(
    _repo: RepoRef,
    number: number,
    review: { commitId: string | null; body: string; comments: ReviewLineComment[] },
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
