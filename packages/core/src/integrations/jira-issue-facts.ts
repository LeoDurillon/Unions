// What the ticket's Jira tab says about its issue: summary, type, status, assignee and last update.
// Read through `JiraApi.read`; null when Jira does not give the issue, so the tab still shows the comments.

import type { JiraApi, JiraAuth } from './jira-api';
import { isRecord, text } from './jira-parse';

/** Jira's status categories: to do, in progress, done. */
type JiraStatusCategory = 'new' | 'indeterminate' | 'done';

export type JiraIssueFacts = {
  summary: string;
  /** The issue type's name (`Story`, `Bug`). */
  type: string | null;
  status: { name: string; category: JiraStatusCategory | null } | null;
  assignee: string | null;
  updatedAt: string | null;
};

const FIELDS = 'summary,issuetype,status,assignee,updated';
const CATEGORIES: ReadonlySet<string> = new Set(['new', 'indeterminate', 'done']);

function isCategory(value: string): value is JiraStatusCategory {
  return CATEGORIES.has(value);
}

/** A named object's name (`{ name }`, `{ displayName }`), null when absent or empty. */
function nameOf(value: unknown, property: 'name' | 'displayName'): string | null {
  return isRecord(value) ? text(value, property) || null : null;
}

function statusOf(value: unknown): JiraIssueFacts['status'] {
  const name = nameOf(value, 'name');
  if (!isRecord(value) || name === null) {
    return null;
  }
  const category = isRecord(value.statusCategory) ? text(value.statusCategory, 'key') : '';
  return { name, category: isCategory(category) ? category : null };
}

/** `GET /issue/{key}?fields=…`: the facts, what Jira leaves out as null. */
export function issueFactsOf(body: unknown): JiraIssueFacts {
  const fields = isRecord(body) && isRecord(body.fields) ? body.fields : {};
  return {
    summary: text(fields, 'summary'),
    type: nameOf(fields.issuetype, 'name'),
    status: statusOf(fields.status),
    assignee: nameOf(fields.assignee, 'displayName'),
    updatedAt: text(fields, 'updated') || null,
  };
}

/** The issue's facts, or null when Jira refuses them (gone, not visible, limited). */
export async function readJiraIssueFacts(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
): Promise<JiraIssueFacts | null> {
  try {
    return issueFactsOf(
      await jira.read(auth, `/issue/${encodeURIComponent(key)}?fields=${FIELDS}`),
    );
  } catch {
    return null;
  }
}
