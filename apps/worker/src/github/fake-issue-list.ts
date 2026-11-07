// The fake GitHub's issue listing: the issues updated at or after a time, as the REST API's `since` does.
import type { RemoteIssue } from './api';

export function issuesSince(issues: readonly RemoteIssue[], since: string | null): RemoteIssue[] {
  const from = since === null ? Number.NEGATIVE_INFINITY : Date.parse(since);
  return issues
    .filter((issue) => Date.parse(issue.updatedAt) >= from)
    .map(({ number, title, body, updatedAt }) => ({ number, title, body, updatedAt }));
}
