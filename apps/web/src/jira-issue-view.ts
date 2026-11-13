// A ticket's Jira issue as its tab reads it: which issue, who calls Jira, its facts and fields, the changes being sent.

import {
  jiraAuthOf,
  readJiraIssueFacts,
  type Db,
  type JiraApi,
  type JiraAuth,
  type Ticket,
} from '@union/core';

import { CONFLICT, fail } from './http';
import type { JiraTabView } from './jira-comment-types';
import { pendingTrackerFields } from './tracker-field-commands';

/** The issue the ticket was imported from. */
export function jiraIssueKeyOf(ticket: Ticket): string {
  if (ticket.originKind !== 'jira' || !ticket.originId) {
    throw fail(CONFLICT, 'This ticket was not imported from Jira');
  }
  return ticket.originId;
}

/** Who calls Jira for the ticket's project; refused when it is not connected any more. */
export function jiraAuthFor(db: Db, ticket: Ticket): JiraAuth {
  const auth = jiraAuthOf(db, ticket.projectId);
  if (!auth) {
    throw fail(CONFLICT, 'The project is not connected to Jira');
  }
  return auth;
}

/** The issue's facts and fields (null when Jira does not give them), and the fields still being set. */
export async function jiraIssueView(
  db: Db,
  jira: JiraApi,
  auth: JiraAuth,
  ticket: Ticket,
): Promise<Pick<JiraTabView, 'issue' | 'pendingFields'>> {
  return {
    issue: await readJiraIssueFacts(jira, auth, jiraIssueKeyOf(ticket)),
    pendingFields: pendingTrackerFields(db, ticket.id),
  };
}
