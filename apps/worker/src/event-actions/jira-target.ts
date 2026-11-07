// What the Jira actions of rules share: the issues they act on (a posted review's linked ones, else the ticket's), the
// credentials to reach them, and Jira's failures as outcomes.
import {
  getTicket,
  integrationOf,
  isEvent,
  JiraError,
  linkedJiraIssues,
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

/** The issues an action acts on, who calls, and the rule's variables: one target per issue. */
export type JiraIssueTargets = Omit<JiraIssueTarget, 'key'> & { keys: string[] };

type Ticket = ReturnType<typeof getTicket>;

/** The issues a posted review's pull request is linked to; none for other events. */
function reviewIssues(db: Db, event: Due['event']): string[] {
  if (!isEvent(event, 'pr_review_posted')) {
    return [];
  }
  return linkedJiraIssues(db, { kind: 'review', id: event.payload.reviewId }).map(
    (issue) => issue.id,
  );
}

/** A review's own linked issues are the more precise ones; else the issue the ticket came from. */
function keysOf(db: Db, due: Due, ticket: Ticket | null): string[] | DeliveryOutcome {
  const linked = reviewIssues(db, due.event);
  if (linked.length > 0) {
    return linked;
  }
  if (isEvent(due.event, 'pr_review_posted') && !ticket) {
    return { status: 'skipped', detail: 'The pull request is not linked to a Jira issue' };
  }
  if (!ticket) {
    return noTicket(due.delivery);
  }
  return ticket.originKind === 'jira' && ticket.originId
    ? [ticket.originId]
    : { status: 'skipped', detail: 'The ticket was not imported from Jira' };
}

/** The issues the action acts on (the review's, else the ticket's), or why it is skipped or fails. */
export function jiraIssueOf(db: Db, due: Due): JiraIssueTargets | DeliveryOutcome {
  const { delivery, rule, event } = due;
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const keys = keysOf(db, due, ticket);
  if (!Array.isArray(keys)) {
    return keys;
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
    keys,
    values: templateValues(project, ticket, event),
  };
}

/**
 * Runs the action on each issue in turn; the first that does not succeed is the delivery's outcome
 * (a retry runs them all again, which changes nothing on those done: a move already there is left).
 */
export async function eachIssue(
  targets: JiraIssueTargets | DeliveryOutcome,
  run: (target: JiraIssueTarget) => Promise<DeliveryOutcome>,
): Promise<DeliveryOutcome> {
  if ('status' in targets) {
    return targets;
  }
  const details: string[] = [];
  for (const key of targets.keys) {
    // One issue after the other: Jira limits the account's requests.
    // oxlint-disable-next-line no-await-in-loop
    const outcome = await run({ auth: targets.auth, key, values: targets.values });
    if (outcome.status !== 'succeeded') {
      return outcome;
    }
    details.push(outcome.detail);
  }
  return { status: 'succeeded', detail: details.join('; ') };
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
