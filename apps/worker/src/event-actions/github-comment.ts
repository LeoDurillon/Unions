// The GitHub comment action of a rule: comments on the ticket's issue or pull request.
import {
  getTicket,
  renderTemplate,
  schema,
  templateValues,
  type DeliveryOutcome,
  type Db,
  type GitHubCommentAction,
  type Project,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi } from '../github/api';
import { isTemporary } from './github-retry';
import { noTicket, type ActionTarget, type Due } from './target';

/** GitHub limits how fast content is created: one comment per tick at most. */
const PER_TICK = 1;

export type GitHubApiFor = (project: Project) => GitHubApi | null;

/** The issue or pull request number the comment goes on, or why there is none. */
function numberOf(ticket: Ticket, action: GitHubCommentAction): number | DeliveryOutcome {
  if (action.on === 'issue') {
    return ticket.issueNumber ?? { status: 'skipped', detail: 'The ticket has no issue yet' };
  }
  return ticket.prNumber ?? { status: 'skipped', detail: 'The ticket has no pull request' };
}

async function deliver(
  db: Db,
  apiFor: GitHubApiFor,
  { delivery, rule, event }: Due,
  action: GitHubCommentAction,
): Promise<DeliveryOutcome> {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  if (!ticket || !project) {
    return noTicket(delivery);
  }
  const number = numberOf(ticket, action);
  if (typeof number !== 'number') {
    return number;
  }
  const api = apiFor(project);
  if (!api) {
    return { status: 'failed', error: 'The project has no GitHub credentials' };
  }
  const body = renderTemplate(action.body, templateValues(project, ticket, event));
  if (body === '') {
    return { status: 'skipped', detail: 'The comment is empty once its variables are filled in' };
  }
  const detail = `Commented on #${number}`;
  try {
    await api.createComment({ owner: project.owner, repo: project.repo }, number, body);
    return { status: 'succeeded', detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isTemporary(error)
      ? { status: 'retry', error: message }
      : { status: 'failed', error: message, detail: `Tried to comment on #${number}` };
  }
}

export function gitHubCommentTarget(db: Db, apiFor: GitHubApiFor): ActionTarget<'github_comment'> {
  return { perTick: PER_TICK, deliver: (due, action) => deliver(db, apiFor, due, action) };
}
