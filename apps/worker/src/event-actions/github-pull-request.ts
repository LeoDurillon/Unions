// The pull request action of a rule: changes the ticket's pull request (labels, reviewers, assignees, title, a description section).
import {
  describeChange,
  getTicket,
  renderTemplate,
  schema,
  templateValues,
  withRuleSection,
  type ChangeOf,
  type DeliveryOutcome,
  type Db,
  type GitHubPullRequestAction,
  type PullRequestChange,
  type PullRequestChangeKind,
  type TemplateVariable,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from '../github/api';
import type { GitHubApiFor } from './github-comment';
import { isTemporary } from './github-retry';
import type { ActionTarget, Due } from './target';

/** GitHub limits how fast content changes: one delivery per tick at most. */
const PER_TICK = 1;

/** The pull request a delivery changes, and what its templates can say. */
type Context = {
  api: GitHubApi;
  repo: RepoRef;
  number: number;
  ruleId: number;
  values: Partial<Record<TemplateVariable, string>>;
};

type Appliers = {
  [K in PullRequestChangeKind]: (context: Context, change: ChangeOf<K>) => Promise<string>;
};

/** Each kind of change does its part and says what it did; each can be done again harmlessly. */
const APPLIERS: Appliers = {
  labels: async ({ api, repo, number }, change) => {
    if (change.add.length > 0) {
      await api.addLabels(repo, number, change.add);
    }
    for (const label of change.remove) {
      await api.removeLabel(repo, number, label);
    }
    return describeChange(change);
  },
  reviewers: async ({ api, repo, number }, change) => {
    await api.requestReviewers(repo, number, change.users);
    return describeChange(change);
  },
  assignees: async ({ api, repo, number }, change) => {
    await api.addAssignees(repo, number, change.users);
    return describeChange(change);
  },
  title: async ({ api, repo, number, values }, change) => {
    const title = renderTemplate(change.value, values);
    if (title === '') {
      return 'title kept: empty once its variables are filled in';
    }
    await api.updatePullRequestTitle(repo, number, title);
    return describeChange(change, title);
  },
  description: async ({ api, repo, number, ruleId, values }, change) => {
    const text = renderTemplate(change.value, values);
    if (text === '') {
      return 'description kept: the section is empty once its variables are filled in';
    }
    const body = await api.pullRequestBody(repo, number);
    const next = withRuleSection(body, ruleId, text);
    if (next !== body) {
      await api.updatePullRequestBody(repo, number, next);
    }
    return describeChange(change);
  },
};

function applyChange<K extends PullRequestChangeKind>(
  context: Context,
  change: ChangeOf<K>,
): Promise<string> {
  return APPLIERS[change.kind](context, change);
}

/** The pull request to change, or why there is none. */
function contextOf(
  db: Db,
  apiFor: GitHubApiFor,
  { delivery, rule, event }: Due,
): Context | DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  if (!ticket || !project) {
    return { status: 'skipped', detail: 'The ticket is gone' };
  }
  if (ticket.prNumber === null) {
    return { status: 'skipped', detail: 'The ticket has no pull request' };
  }
  const api = apiFor(project);
  if (!api) {
    return { status: 'failed', error: 'The project has no GitHub credentials' };
  }
  const repo = { owner: project.owner, repo: project.repo };
  const values = templateValues(project, ticket, event);
  return { api, repo, number: ticket.prNumber, ruleId: rule.id, values };
}

async function deliver(
  db: Db,
  apiFor: GitHubApiFor,
  due: Due,
  action: GitHubPullRequestAction,
): Promise<DeliveryOutcome> {
  const context = contextOf(db, apiFor, due);
  if ('status' in context) {
    return context;
  }
  const done: string[] = [];
  try {
    for (const change of action.changes) {
      done.push(await applyChange<PullRequestChange['kind']>(context, change));
    }
    return { status: 'succeeded', detail: `#${context.number}: ${done.join('; ')}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const before = done.length > 0 ? `done before: ${done.join('; ')}` : 'nothing changed';
    return isTemporary(error)
      ? { status: 'retry', error: message }
      : { status: 'failed', error: message, detail: `#${context.number}: ${before}` };
  }
}

export function gitHubPullRequestTarget(
  db: Db,
  apiFor: GitHubApiFor,
): ActionTarget<'github_pull_request'> {
  return { perTick: PER_TICK, deliver: (due, action) => deliver(db, apiFor, due, action) };
}
