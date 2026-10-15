import type {
  BoardColumn,
  PrDescription,
  Preview,
  Project,
  ReviewComment,
  Run,
  StepOutput,
  Ticket,
  TicketBaseView,
  schema,
} from '@union/core';

/** How a project reaches GitHub, as the browser sees it. */
export type GitHubAccess = 'token' | 'app' | 'none';

/** A project as the browser sees it: the GitHub token never leaves the server. */
export type PublicProject = Omit<Project, 'githubToken' | 'notionToken'> & {
  /** `app` wins when both are set, like in the worker. */
  githubAccess: GitHubAccess;
  /** Token and data source both set: the New ticket dialog offers the Notion import. */
  hasNotion: boolean;
};

function accessOf(installationId: number | null, token: string | null): GitHubAccess {
  if (installationId !== null) {
    return 'app';
  }
  return token === null ? 'none' : 'token';
}

export function toPublicProject(project: Project): PublicProject {
  const { githubToken, notionToken, ...rest } = project;
  return {
    ...rest,
    githubAccess: accessOf(project.githubInstallationId, githubToken),
    hasNotion: notionToken !== null && Boolean(project.config.notionDataSourceId),
  };
}

/** Shapes returned by the HTTP API, shared by the server and the React client. */
/** Another ticket, as the target of a parent link. */
export type TicketRef = { id: number; title: string; issueNumber: number | null; done: boolean };

/** `parent`: the ticket this one builds on; it cannot start before the parent is done. */
export type TicketSummary = Ticket & { board: BoardColumn; parent: TicketRef | null };

export type TicketDetail = {
  ticket: TicketSummary;
  project: PublicProject;
  /** Tickets that build on this one. */
  children: TicketRef[];
  /** The branch it starts from and why (before it starts: the one it would take now). */
  base: TicketBaseView;
  outputs: StepOutput[];
  runs: Run[];
};

export type CommandType =
  | 'start'
  | 'approve'
  | 'revise'
  | 'retry'
  | 'rebase'
  | 'cancel'
  | 'commit_anyway'
  | 'drop_leftovers';

export const COMMAND_TYPES: readonly CommandType[] = [
  'start',
  'approve',
  'revise',
  'retry',
  'rebase',
  'cancel',
  'commit_anyway',
  'drop_leftovers',
];

export type EventRow = {
  seq: number;
  ticketId: number | null;
  runId: number | null;
  investigationId: number | null;
  type: string;
  payload: unknown;
  at: number;
};

export type Viewer = { login: string; missingScopes: string[] };

export type RepoOption = {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  owner: string;
  ownerNodeId: string;
  defaultBranch: string;
  isPrivate: boolean;
};

/** The configured GitHub App; its private key never leaves the server. */
export type AppInfo = { slug: string; name: string; url: string };

export type GitHubAppStatus =
  | { configured: false }
  | ({ configured: true; appId: string } & AppInfo);

/** An account (user or organization) the GitHub App is installed on. */
export type InstallationOption = { id: number; account: string; allRepositories: boolean };

export type ProjectOption = { id: string; number: number; title: string; url: string };

/** A pull request as GitHub reports it, for linking one to a ticket by hand. */
export type PullRequestInfo = {
  number: number;
  url: string;
  headBranch: string;
  draft: boolean;
  state: 'open' | 'closed';
  merged: boolean;
};

export type DiffFileSummary = {
  id: number;
  path: string;
  oldPath: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  binary: boolean;
  additions: number;
  deletions: number;
  /** Matched by the project's review ignore rules: listed apart, still viewable. */
  ignored: boolean;
};

export type DiffResponse = {
  snapshot: { headSha: string; baseBranch: string; createdAt: number } | null;
  files: DiffFileSummary[];
  /** True while a review can be sent; otherwise `sendRefusal` says why. */
  canSend: boolean;
  sendRefusal: string | null;
  /** The linked pull request, whose review comments can be imported. */
  pullRequest: number | null;
};

/** A commit of the change under review (a pull request's, a ticket's), to read it one commit at a time. */
export type ReviewCommit = {
  sha: string;
  /** The message's first line; `body` is the rest. */
  title: string;
  body: string;
  author: string;
  date: string | null;
  /** More than one: a merge commit, shown against its first parent. */
  parents: number;
};

/** The commits, oldest first, and (tickets) the change since the head the user last sent a review on. */
export type CommitsResponse = {
  commits: ReviewCommit[];
  /** `sha` is the reviewed head; null before a first review, or once a rebase dropped it. */
  sinceReview: { sha: string; commits: number } | null;
};

/** Where the commit view's diffs are read: a commit's SHA, or the change since the last review. */
export const SINCE_REVIEW = 'since-review';

/** One commit's files against its first parent (or the change since the last review), read only. */
export type CommitDiffResponse = { sha: string; files: DiffFileSummary[] };

export type CommentView = ReviewComment & { outdated: boolean };

/** The latest run of the review agent on a ticket's diff or a pull request. */
export type AgentReviewView = {
  id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error: string | null;
  /** Drafts it added, once it succeeded. */
  comments: number | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

/** One line-comment thread of a pull request, as GitHub returns it. */
export type PullRequestThread = {
  resolved: boolean;
  path: string;
  side: 'old' | 'new';
  /** Where the thread sits in the pull request's latest diff; null once GitHub marks it outdated. */
  line: number | null;
  startLine: number | null;
  /** Where it sat in the diff it was written on. */
  originalLine: number | null;
  originalStartLine: number | null;
  /** The first comment, then the replies. */
  comments: {
    author: string;
    body: string;
    url: string;
    createdAt: string;
    /** The diff around the commented line, ending at it. */
    diffHunk: string;
    commitSha: string;
  }[];
};

export const PULL_REQUEST_FILTERS = ['open', 'closed', 'all'] as const;
export type PullRequestFilter = (typeof PULL_REQUEST_FILTERS)[number];

/** One pull request of the project's repository, as the Pull requests tab lists it. */
export type PullRequestListItem = {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  author: string;
  headBranch: string;
  baseBranch: string;
  updatedAt: string;
  /** APPROVED, CHANGES_REQUESTED or REVIEW_REQUIRED; null when the repository needs no review. */
  reviewDecision: string | null;
  additions: number;
  deletions: number;
  /** The ticket this pull request is linked to, if any. */
  ticketId: number | null;
};

/** A pull request put under review from the Pull requests tab (as listed: without its files). */
export type CurrentReview = Omit<typeof schema.currentReviews.$inferSelect, 'files'>;

/** The newest 100 pull requests of the filter, and how many there are in all. */
export type PullRequestList = {
  total: number;
  pullRequests: PullRequestListItem[];
  /** When the list was read from GitHub: the server reuses it for a few minutes. */
  fetchedAt: number;
};

/** A review summary or a conversation comment: about the whole pull request, not a line. */
export type PullRequestNote = {
  kind: 'review' | 'comment';
  author: string;
  bot: boolean;
  body: string;
  url: string;
  /** For reviews: APPROVED, CHANGES_REQUESTED, COMMENTED or DISMISSED. */
  state: string | null;
  createdAt: string;
};

export type PullRequestDiscussion = {
  /** The pull request's own description (markdown). */
  description: string;
  threads: PullRequestThread[];
  notes: PullRequestNote[];
};

/** The discussion as the PR tab shows it, with what is already among the ticket's review comments. */
export type DiscussionResponse = PullRequestDiscussion & {
  number: number;
  url: string;
  imported: string[];
};

/** What an import from the pull request did. */
export type ReviewImportResult = { imported: number; alreadyImported: number; resolved: number };

/** A GitHub issue of the project's repository, as fetched to create a ticket from it. */
export type GitHubIssue = {
  number: number;
  nodeId: string;
  title: string;
  body: string;
  url: string;
  state: 'open' | 'closed';
  /** GitHub serves pull requests as issues too; those are refused. */
  pullRequest: boolean;
};

/** The import preview: the issue, and the ticket it already belongs to, if any. */
export type IssueImport = Omit<GitHubIssue, 'nodeId' | 'pullRequest'> & { ticketId: number | null };

/** A Notion page fetched for import: shown as a preview, then turned into a ticket. */
export type NotionImport = {
  title: string;
  body: string;
  url: string;
  truncated: boolean;
  /** The page, linked to the ticket created from it (event rules update it). */
  pageId: string;
};

/** A rewrite of a ticket's PR description, as the PR tab shows it. */
export type PrDescriptionDraft = {
  id: number;
  status: PrDescription['status'];
  /** GitHub's description when the agent started, without Union's links. */
  original: string | null;
  text: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  sentAt: number | null;
};

export type PrDescriptionView = {
  draft: PrDescriptionDraft | null;
  /** The branch was pushed after Union last wrote the description. */
  outdated: boolean;
  /** Why a rewrite cannot start now; null when it can. */
  refusal: string | null;
};

/** A ticket's preview, as its panel shows it. */
export type PreviewView = {
  preview: Preview | null;
  /** The project has preview settings. */
  configured: boolean;
  /** The repository's compose file the settings name; null without settings. */
  composeFile: string | null;
  /** The project's end-to-end command; null: no e2e tests to run. */
  e2eCommand: string | null;
  /** Why the e2e tests cannot run now; null when they can. */
  e2eRefusal: string | null;
  /** Why it cannot start now; null when it can. */
  refusal: string | null;
};

/** What the Preview settings show besides the settings: secret names (never values), and services. */
export type PreviewSettingsView = {
  secretNames: string[];
  /**
   * The services (all profiles included) and the profiles of the latest compose file generated for
   * one of the project's tickets.
   */
  composeServices: { names: string[]; profiles: string[]; ticketId: number; at: number } | null;
};

/** One of the account's claude.ai connectors, and the tool rule that gives an agent all its tools. */
export type ConnectorView = {
  name: string;
  url: string;
  status: string;
  connected: boolean;
  checkedAt: number;
  tool: string;
};

export type ConnectorsResponse = {
  connectors: ConnectorView[];
  /** The newest reading of the connectors; null before the first. */
  check: {
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    error: string | null;
    createdAt: number;
    finishedAt: number | null;
  } | null;
};
