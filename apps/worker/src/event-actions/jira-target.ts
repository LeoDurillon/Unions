// What the Jira actions of rules share: the ticket's issue and the credentials to reach it, and Jira's failures as outcomes.
import {
  getTicket,
  integrationOf,
  JiraError,
  readJiraConfig,
  schema,
  templateValues,
  type Db,
  type DeliveryOutcome,
  type JiraAuth,
  type TemplateVariable,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { noTicket, type Due } from './target';

/** Jira Cloud limits requests per user, and a move is two or three of them. */
export const JIRA_PER_TICK = 2;

const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

/** The ticket's Jira issue, who calls, and the rule's variables filled in for this event. */
export type JiraIssueTarget = {
  auth: JiraAuth;
  key: string;
  values: Partial<Record<TemplateVariable, string>>;
};

/** The issue the ticket was imported from, or why the action is skipped or fails. */
export function jiraIssueOf(
  db: Db,
  { delivery, rule, event }: Due,
): JiraIssueTarget | DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  if (!ticket) {
    return noTicket(delivery);
  }
  if (ticket.originKind !== 'jira' || !ticket.originId) {
    return { status: 'skipped', detail: 'The ticket was not imported from Jira' };
  }
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  const integration = integrationOf(db, rule.projectId, 'jira');
  const config = integration ? readJiraConfig(integration.config) : null;
  if (!project || !integration || !config || 'error' in config) {
    return { status: 'failed', error: 'The project is not connected to Jira' };
  }
  const { site, email } = config.config;
  return {
    auth: { site, email, token: integration.secret },
    key: ticket.originId,
    values: templateValues(project, ticket, event),
  };
}

/**
 * A failed call as the delivery's outcome: rate limits, Jira outages and network failures are tried
 * again; a refusal fails, naming the permission the account lacks when Jira says it has none.
 */
export function jiraFailure(error: unknown, permission: string, tried: string): DeliveryOutcome {
  if (
    !(error instanceof JiraError) ||
    error.status === TOO_MANY_REQUESTS ||
    error.status >= SERVER_ERROR
  ) {
    return { status: 'retry', error: error instanceof Error ? error.message : String(error) };
  }
  const message =
    error.status === FORBIDDEN
      ? `Jira refused: the account needs the "${permission}" permission in the Jira project`
      : error.message;
  return { status: 'failed', error: message, detail: `Tried: ${tried}` };
}
