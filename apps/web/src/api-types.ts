import type { BoardStatus, Project, ReviewComment, Run, StepOutput, Ticket } from '@union/core';

/** A project as the browser sees it: the GitHub token never leaves the server. */
export type PublicProject = Omit<Project, 'githubToken' | 'notionToken'> & {
  hasGithubToken: boolean;
  /** Token and data source both set: the New ticket dialog offers the Notion import. */
  hasNotion: boolean;
};

export function toPublicProject(project: Project): PublicProject {
  const { githubToken, notionToken, ...rest } = project;
  return {
    ...rest,
    hasGithubToken: githubToken !== null,
    hasNotion: notionToken !== null && Boolean(project.config.notionDataSourceId),
  };
}

/** Shapes returned by the HTTP API, shared by the server and the React client. */
export type TicketSummary = Ticket & { board: BoardStatus };

export type TicketDetail = {
  ticket: TicketSummary;
  project: PublicProject;
  outputs: StepOutput[];
  runs: Run[];
};

export type CommandType = 'start' | 'approve' | 'revise' | 'retry' | 'cancel';

export const COMMAND_TYPES: readonly CommandType[] = [
  'start',
  'approve',
  'revise',
  'retry',
  'cancel',
];

export type EventRow = {
  seq: number;
  ticketId: number | null;
  runId: number | null;
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
  /** True while the ticket waits on the user after code was written (a review can be sent). */
  canSend: boolean;
};

export type CommentView = ReviewComment & { outdated: boolean };

/** A Notion page fetched for import: shown as a preview, then turned into a ticket. */
export type NotionImport = { title: string; body: string; url: string; truncated: boolean };
