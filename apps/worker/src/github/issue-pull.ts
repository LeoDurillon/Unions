// Reads title and description edits from the repository's issues, for a project without a GitHub Project.
import type { Db, Ticket } from '@union/core';

import type { GitHubApi, RemoteIssue, RepoRef } from './api';
import { applyRemoteIssue } from './inbound';

/** Done and cancelled tickets are left as they are: their issues are not listed again after a restart. */
function isActive(ticket: Ticket): boolean {
  return ticket.phase.kind !== 'done' && ticket.phase.kind !== 'cancelled';
}

/** The oldest reconciliation of the tickets; null while one was never read, so the first pull lists all. */
function oldestRead(tickets: readonly Ticket[]): string | null {
  let oldest: string | null = null;
  for (const { githubUpdatedAt } of tickets) {
    if (githubUpdatedAt === null) {
      return null;
    }
    if (oldest === null || Date.parse(githubUpdatedAt) < Date.parse(oldest)) {
      oldest = githubUpdatedAt;
    }
  }
  return oldest;
}

function latest(issues: readonly RemoteIssue[], fallback: string | null): string | null {
  return issues.reduce<string | null>(
    (last, { updatedAt }) =>
      last === null || Date.parse(updatedAt) > Date.parse(last) ? updatedAt : last,
    fallback,
  );
}

/**
 * The issue side of the pull: one listing of the issues updated since the last one (GitHub's `since`
 * includes it, and `isStale` skips what was already applied), each applied to its ticket.
 */
export class IssuePull {
  private since: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly api: GitHubApi,
  ) {}

  async pull(repo: RepoRef, tickets: readonly Ticket[]): Promise<void> {
    const watched = tickets.filter((ticket) => ticket.issueNumber !== null && isActive(ticket));
    if (watched.length === 0) {
      return;
    }
    const since = this.since ?? oldestRead(watched);
    const issues = await this.api.listIssuesSince(repo, since);
    const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
    for (const ticket of watched) {
      const issue = ticket.issueNumber === null ? undefined : byNumber.get(ticket.issueNumber);
      if (issue) {
        applyRemoteIssue(this.db, ticket.id, issue);
      }
    }
    this.since = latest(issues, since);
  }
}
