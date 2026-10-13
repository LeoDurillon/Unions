import type {
  AgentConfig,
  AgentEffort,
  AgentModel,
  Investigation,
  InvestigationScope,
  ToolOption,
} from '@union/core';

import type {
  CommandType,
  CommentView,
  CurrentReview,
  DiffResponse,
  DiscussionResponse,
  EventRow,
  GitHubAppStatus,
  InstallationOption,
  IssueImport,
  NotionImport,
  ProjectOption,
  PublicProject,
  PullRequestFilter,
  PullRequestList,
  PullRequestListItem,
  RepoOption,
  ReviewImportResult,
  TicketDetail,
  TicketSummary,
  Viewer,
} from '../../src/api-types';
import type { LinkResult } from '../../src/routes/ticket-pull-request';

export type CommandExtra = { feedback?: string; message?: string; refusalId?: number };

/** What a GitHub call is made with: a token, or an installation of the stored GitHub App. */
export type GitHubCredential = { token: string } | { installationId: number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    return String(data.error);
  }
  return fallback;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.statusText), response.status);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- single trust boundary: the server returns the shared api-types shapes
  return data as T;
}

function investigationsPath(projectId: number): string {
  return `/api/projects/${projectId}/investigations`;
}

function investigationPath(investigation: Pick<Investigation, 'id' | 'projectId'>): string {
  return `${investigationsPath(investigation.projectId)}/${investigation.id}`;
}

export const api = {
  /** One ticket's or investigation's events so far, oldest first (`ticket=<id>` or `investigation=<id>`). */
  eventHistory: (query: string): Promise<EventRow[]> =>
    request('GET', `/api/events/history?${query}`),
  agents: (): Promise<AgentConfig[]> => request('GET', '/api/agents'),
  saveAgent: (
    agent: string,
    change: {
      prompt: string;
      model: AgentModel | null;
      effort: AgentEffort | null;
      tools: string[] | null;
    },
  ): Promise<AgentConfig> => request('PUT', `/api/agents/${agent}`, change),
  tools: (): Promise<ToolOption[]> => request('GET', '/api/agents/tools'),
  addTool: (input: { name: string; description: string }): Promise<ToolOption> =>
    request('POST', '/api/agents/tools', input),
  removeTool: (name: string): Promise<ToolOption[]> =>
    request('DELETE', `/api/agents/tools/${encodeURIComponent(name)}`),
  resetAgent: (agent: string): Promise<AgentConfig> => request('DELETE', `/api/agents/${agent}`),
  investigations: (projectId: number): Promise<Investigation[]> =>
    request('GET', investigationsPath(projectId)),
  createInvestigation: (
    projectId: number,
    input: {
      title: string;
      prompt: string;
      scope: InvestigationScope;
      model: AgentModel;
      tools: string[];
    },
  ): Promise<Investigation> => request('POST', investigationsPath(projectId), input),
  rerunInvestigation: (investigation: Investigation): Promise<Investigation> =>
    request('POST', `${investigationPath(investigation)}/rerun`),
  requestInvestigationTicket: (
    investigation: Investigation,
    context: string,
  ): Promise<Investigation> =>
    request('POST', `${investigationPath(investigation)}/ticket`, { context }),
  askFollowUp: (investigation: Investigation, prompt: string): Promise<Investigation> =>
    request('POST', `${investigationPath(investigation)}/follow-up`, { prompt }),
  cancelInvestigation: (investigation: Investigation): Promise<unknown> =>
    request('POST', `${investigationPath(investigation)}/cancel`),
  deleteInvestigation: (investigation: Investigation): Promise<unknown> =>
    request('DELETE', investigationPath(investigation)),
  projects: (): Promise<PublicProject[]> => request('GET', '/api/projects'),
  createProject: (
    input: {
      owner: string;
      repo: string;
      baseBranch: string;
      githubProjectNodeId: string;
      notionToken?: string;
      notionDataSourceId?: string;
    } & GitHubCredential,
  ): Promise<PublicProject> => request('POST', '/api/projects', input),
  updateProject: (
    id: number,
    change: {
      token?: string;
      installationId?: number;
      baseBranch?: string;
      installCommand?: string;
      gateCommand?: string;
      maxIterations?: number;
      createPullRequest?: boolean;
      hideLockFiles?: boolean;
      reviewIgnore?: string[];
      notionToken?: string;
      notionDataSourceId?: string;
      instructions?: string;
    },
  ): Promise<PublicProject> => request('PATCH', `/api/projects/${id}`, change),
  deleteProject: (id: number): Promise<unknown> => request('DELETE', `/api/projects/${id}`),
  tickets: (projectId: number): Promise<TicketSummary[]> =>
    request('GET', `/api/tickets?projectId=${projectId}`),
  ticket: (id: number): Promise<TicketDetail> => request('GET', `/api/tickets/${id}`),
  createTicket: (input: {
    projectId: number;
    title: string;
    body: string;
    parentId?: number | null;
  }): Promise<TicketSummary> => request('POST', '/api/tickets', input),
  setParent: (id: number, parentId: number | null): Promise<TicketSummary> =>
    request('PUT', `/api/tickets/${id}/parent`, { parentId }),
  /** `extra`: the feedback of a revision, or the decision on a refused commit. */
  command: (id: number, type: CommandType, extra: CommandExtra = {}): Promise<unknown> =>
    request('POST', `/api/tickets/${id}/commands`, { type, ...extra }),
  linkPullRequest: (id: number, pullRequest: string): Promise<LinkResult> =>
    request('PUT', `/api/tickets/${id}/pull-request`, { pullRequest }),
  unlinkPullRequest: (id: number): Promise<unknown> =>
    request('DELETE', `/api/tickets/${id}/pull-request`),
  // A review lives under a base URL: a ticket's, or a pull request's under review (review-target.ts).
  diff: (base: string): Promise<DiffResponse> => request('GET', `${base}/diff`),
  diffFile: (base: string, fileId: number): Promise<{ id: number; path: string; patch: string }> =>
    request('GET', `${base}/diff/files/${fileId}`),
  comments: (base: string): Promise<CommentView[]> => request('GET', `${base}/comments`),
  addComment: (
    base: string,
    input: { path: string; side: 'old' | 'new'; startLine: number; endLine: number; body: string },
  ): Promise<unknown> => request('POST', `${base}/comments`, input),
  editComment: (base: string, commentId: number, body: string): Promise<unknown> =>
    request('PATCH', `${base}/comments/${commentId}`, { body }),
  deleteComment: (base: string, commentId: number): Promise<unknown> =>
    request('DELETE', `${base}/comments/${commentId}`),
  sendReview: (base: string, summary: string): Promise<unknown> =>
    request('POST', `${base}/review`, { summary }),
  reviewDiscussion: (base: string): Promise<DiscussionResponse> =>
    request('GET', `${base}/discussion`),
  importReviewComments: (id: number): Promise<ReviewImportResult> =>
    request('POST', `/api/tickets/${id}/comments/import`),
  importReviewNote: (id: number, url: string): Promise<unknown> =>
    request('POST', `/api/tickets/${id}/comments/import-note`, { url }),
  pullRequests: (projectId: number, filter: PullRequestFilter): Promise<PullRequestList> =>
    request('GET', `/api/projects/${projectId}/pull-requests?state=${filter}`),
  currentReviews: (projectId: number): Promise<CurrentReview[]> =>
    request('GET', `/api/projects/${projectId}/pull-requests/reviews`),
  addCurrentReview: (projectId: number, pull: PullRequestListItem): Promise<CurrentReview> =>
    request('POST', `/api/projects/${projectId}/pull-requests/reviews`, pull),
  removeCurrentReview: (projectId: number, number: number): Promise<unknown> =>
    request('DELETE', `/api/projects/${projectId}/pull-requests/reviews/${number}`),
  discussion: (id: number): Promise<DiscussionResponse> =>
    request('GET', `/api/tickets/${id}/pull-request/discussion`),
  editOutput: (id: number, step: string, content: string): Promise<unknown> =>
    request('PUT', `/api/tickets/${id}/steps/${step}/output`, { content }),
  github: {
    verify: (credential: GitHubCredential): Promise<Viewer> =>
      request('POST', '/api/github/verify', credential),
    repos: (
      credential: GitHubCredential,
      page: number,
    ): Promise<{ repos: RepoOption[]; hasNext: boolean }> =>
      request('POST', '/api/github/repos', { ...credential, page }),
    projects: (credential: GitHubCredential, owner: string): Promise<ProjectOption[]> =>
      request('POST', '/api/github/projects', { ...credential, owner }),
    createProject: (
      credential: GitHubCredential,
      input: { ownerId: string; repositoryId: string; title: string },
    ): Promise<ProjectOption> =>
      request('POST', '/api/github/create-project', { ...credential, ...input }),
  },
  githubApp: {
    status: (): Promise<GitHubAppStatus> => request('GET', '/api/github/app'),
    save: (input: { appId: string; privateKey: string }): Promise<GitHubAppStatus> =>
      request('PUT', '/api/github/app', input),
    remove: (): Promise<GitHubAppStatus> => request('DELETE', '/api/github/app'),
    installations: (): Promise<InstallationOption[]> =>
      request('GET', '/api/github/app/installations'),
  },
  githubIssue: {
    preview: (projectId: number, issue: string): Promise<IssueImport> =>
      request('POST', '/api/tickets/github-issue/preview', { projectId, issue }),
    importIssue: (projectId: number, issue: string): Promise<TicketSummary> =>
      request('POST', '/api/tickets/github-issue', { projectId, issue }),
  },
  notion: {
    verify: (
      token: string,
      dataSourceId: string,
    ): Promise<{ dataSourceId: string; title: string }> =>
      request('POST', '/api/notion/verify', { token, dataSourceId }),
    importPage: (projectId: number, page: string): Promise<NotionImport> =>
      request('POST', '/api/notion/import', { projectId, page }),
  },
};
