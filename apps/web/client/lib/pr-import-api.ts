// Importing a pull request of the project's repository as a ticket: its preview, then the ticket.
import type { PullRequestImport, TicketSummary } from '../../src/api-types';
import { request } from './api';

export function previewPullRequestImport(
  projectId: number,
  pullRequest: string,
): Promise<PullRequestImport> {
  return request('POST', '/api/tickets/github-pull-request/preview', { projectId, pullRequest });
}

export function importPullRequest(projectId: number, pullRequest: string): Promise<TicketSummary> {
  return request('POST', '/api/tickets/github-pull-request', { projectId, pullRequest });
}
