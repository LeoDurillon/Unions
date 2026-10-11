import type { AgentConfig, AgentModel } from '@union/core';

import type {
  CommentView,
  NotionImport,
  DiffResponse,
  CommandType,
  ProjectOption,
  PublicProject,
  RepoOption,
  TicketDetail,
  TicketSummary,
  Viewer,
} from '../../src/api-types';
import type { LinkResult } from '../../src/routes/ticket-pull-request';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    return String(data.error);
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

export const api = {
  agents: (): Promise<AgentConfig[]> => request('GET', '/api/agents'),
  saveAgent: (
    agent: string,
    change: { prompt: string; model: AgentModel | null },
  ): Promise<AgentConfig> => request('PUT', `/api/agents/${agent}`, change),
  resetAgent: (agent: string): Promise<AgentConfig> => request('DELETE', `/api/agents/${agent}`),
  projects: (): Promise<PublicProject[]> => request('GET', '/api/projects'),
  createProject: (input: {
    owner: string;
    repo: string;
    baseBranch: string;
    token: string;
    githubProjectNodeId: string;
    notionToken?: string;
    notionDataSourceId?: string;
  }): Promise<PublicProject> => request('POST', '/api/projects', input),
  updateProject: (
    id: number,
    change: {
      token?: string;
      baseBranch?: string;
      installCommand?: string;
      gateCommand?: string;
      maxIterations?: number;
      createPullRequest?: boolean;
      hideLockFiles?: boolean;
      reviewIgnore?: string[];
      notionToken?: string;
      notionDataSourceId?: string;
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
  }): Promise<TicketSummary> => request('POST', '/api/tickets', input),
  command: (id: number, type: CommandType, feedback?: string): Promise<unknown> =>
    request('POST', `/api/tickets/${id}/commands`, { type, feedback }),
  linkPullRequest: (id: number, pullRequest: string): Promise<LinkResult> =>
    request('PUT', `/api/tickets/${id}/pull-request`, { pullRequest }),
  unlinkPullRequest: (id: number): Promise<unknown> =>
    request('DELETE', `/api/tickets/${id}/pull-request`),
  diff: (id: number): Promise<DiffResponse> => request('GET', `/api/tickets/${id}/diff`),
  diffFile: (id: number, fileId: number): Promise<{ id: number; path: string; patch: string }> =>
    request('GET', `/api/tickets/${id}/diff/files/${fileId}`),
  comments: (id: number): Promise<CommentView[]> => request('GET', `/api/tickets/${id}/comments`),
  addComment: (
    id: number,
    input: { path: string; side: 'old' | 'new'; startLine: number; endLine: number; body: string },
  ): Promise<unknown> => request('POST', `/api/tickets/${id}/comments`, input),
  editComment: (id: number, commentId: number, body: string): Promise<unknown> =>
    request('PATCH', `/api/tickets/${id}/comments/${commentId}`, { body }),
  deleteComment: (id: number, commentId: number): Promise<unknown> =>
    request('DELETE', `/api/tickets/${id}/comments/${commentId}`),
  sendReview: (id: number, summary: string): Promise<{ sent: number }> =>
    request('POST', `/api/tickets/${id}/review`, { summary }),
  editOutput: (id: number, step: string, content: string): Promise<unknown> =>
    request('PUT', `/api/tickets/${id}/steps/${step}/output`, { content }),
  github: {
    verify: (token: string): Promise<Viewer> => request('POST', '/api/github/verify', { token }),
    repos: (token: string, page: number): Promise<{ repos: RepoOption[]; hasNext: boolean }> =>
      request('POST', '/api/github/repos', { token, page }),
    projects: (token: string, owner: string): Promise<ProjectOption[]> =>
      request('POST', '/api/github/projects', { token, owner }),
    createProject: (
      token: string,
      input: { ownerId: string; repositoryId: string; title: string },
    ): Promise<ProjectOption> => request('POST', '/api/github/create-project', { token, ...input }),
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
