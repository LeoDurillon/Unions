// Event rules: checking and saving them, and matching events and templates.
import { and, eq } from 'drizzle-orm';

import type { Db } from './db';
import {
  checkGitHubComment,
  checkGitHubProjectFields,
  checkGitHubPullRequest,
  checkUnionNotification,
  isActionKind,
  type ActionKind,
  type ActionOf,
  type EventAction,
} from './event-actions';
import { isEvent, type EventPayloads, type StoredEvent } from './event-catalog';
import { checkedNotionAction, EventRuleError } from './event-notion-action';
import {
  BOARD_LABELS,
  isTrigger,
  VERDICT_LABELS,
  type EventTrigger,
  type TemplateVariable,
} from './event-rule-types';
import { boardStatus } from './states';
import * as schema from './tables';
import type { Ticket } from './tickets';

export type EventRule = typeof schema.eventRules.$inferSelect;

export type RuleInput = {
  name: string;
  enabled: boolean;
  trigger: unknown;
  action: unknown;
};

type ActionChecks = {
  [K in ActionKind]: (db: Db, projectId: number, record: object) => ActionOf<K>;
};

/** A check's result as the save sees it: the action, or the reason thrown. */
function thrown<A>(checked: { action: A } | { error: string }): A {
  if ('error' in checked) {
    throw new EventRuleError(checked.error);
  }
  return checked.action;
}

/** Each kind's checks; a Notion action is checked against the stored Notion columns. */
const ACTION_CHECKS: ActionChecks = {
  notion_property: checkedNotionAction,
  github_comment: (_db, _projectId, record) => thrown(checkGitHubComment(record)),
  github_pull_request: (_db, _projectId, record) => thrown(checkGitHubPullRequest(record)),
  github_project_fields: (_db, _projectId, record) => thrown(checkGitHubProjectFields(record)),
  union_notification: (_db, _projectId, record) => thrown(checkUnionNotification(record)),
};

/** An action without a `kind` is a Notion one: rules saved before there were other kinds. */
function checkedAction(db: Db, projectId: number, action: unknown): EventAction {
  const record = typeof action === 'object' && action !== null ? action : {};
  const kind = 'kind' in record ? record.kind : 'notion_property';
  if (!isActionKind(kind)) {
    throw new EventRuleError('Pick what the rule does');
  }
  return ACTION_CHECKS[kind](db, projectId, record);
}

/** The rule as it would be saved, after the checks against the stored Notion schema. */
export function checkRule(
  db: Db,
  projectId: number,
  input: RuleInput,
): Pick<EventRule, 'name' | 'enabled' | 'trigger' | 'action'> {
  const name = input.name.trim();
  if (name === '') {
    throw new EventRuleError('Give the rule a name');
  }
  if (!isTrigger(input.trigger)) {
    throw new EventRuleError('Pick what triggers the rule');
  }
  return {
    name,
    enabled: input.enabled,
    trigger: input.trigger,
    action: checkedAction(db, projectId, input.action),
  };
}

/** Creates a rule, or replaces rule `ruleId`, after checking it against the stored Notion schema. */
export function saveRule(db: Db, projectId: number, input: RuleInput, ruleId?: number): EventRule {
  const values = checkRule(db, projectId, input);
  if (ruleId === undefined) {
    return db
      .insert(schema.eventRules)
      .values({ projectId, ...values })
      .returning()
      .get();
  }
  const [updated] = db
    .update(schema.eventRules)
    .set({ ...values, updatedAt: Date.now() })
    .where(and(eq(schema.eventRules.id, ruleId), eq(schema.eventRules.projectId, projectId)))
    .returning()
    .all();
  if (!updated) {
    throw new EventRuleError('Rule not found');
  }
  return updated;
}

export function listRules(db: Db, projectId: number): EventRule[] {
  return db
    .select()
    .from(schema.eventRules)
    .where(eq(schema.eventRules.projectId, projectId))
    .orderBy(schema.eventRules.id)
    .all();
}

export function deleteRule(db: Db, projectId: number, ruleId: number): boolean {
  return (
    db
      .delete(schema.eventRules)
      .where(and(eq(schema.eventRules.id, ruleId), eq(schema.eventRules.projectId, projectId)))
      .returning()
      .all().length > 0
  );
}

/** `YYYY-MM-DD` at the start of an ISO date. */
const DATE_LENGTH = 10;

const STEP_NAMES: Record<string, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
  simplify: 'Simplify history',
};

/** The step a phase change moved into (one that waits or failed); empty for other events. */
function stepOf(event: StoredEvent | null): string {
  const to = event === null ? undefined : phaseChange(event)?.to;
  const step = to && 'step' in to ? to.step : '';
  return STEP_NAMES[step] ?? step;
}

/** What a template can say about the ticket now; empty without one (a review of a pull request with no ticket). */
function ticketValues(
  repo: string,
  ticket: Ticket | null,
): Partial<Record<TemplateVariable, string>> {
  if (ticket === null) {
    return {};
  }
  const { prNumber, issueNumber } = ticket;
  return {
    'pr.url': prNumber === null ? '' : `${repo}/pull/${prNumber}`,
    'pr.number': prNumber === null ? '' : String(prNumber),
    'ticket.title': ticket.title,
    'ticket.id': String(ticket.id),
    'ticket.branch': ticket.branch ?? '',
    'issue.number': issueNumber === null ? '' : String(issueNumber),
    'issue.url': issueNumber === null ? '' : `${repo}/issues/${issueNumber}`,
    'board.status': BOARD_LABELS[boardStatus(ticket.phase)],
  };
}

/** What a template can say about a review posted on GitHub: its pull request, verdict and link. */
function reviewValues(
  repo: string,
  event: StoredEvent | null,
): Partial<Record<TemplateVariable, string>> {
  if (event === null || !isEvent(event, 'pr_review_posted')) {
    return {};
  }
  const { number, url, verdict } = event.payload;
  return {
    'pr.url': `${repo}/pull/${number}`,
    'pr.number': String(number),
    'review.verdict': verdict === undefined ? '' : VERDICT_LABELS[verdict],
    'review.url': url,
  };
}

/** What a template can say about the ticket now, and the event that triggered the rule. */
export function templateValues(
  project: { owner: string; repo: string },
  ticket: Ticket | null,
  event: StoredEvent | null,
  now = new Date(),
): Partial<Record<TemplateVariable, string>> {
  const repo = `https://github.com/${project.owner}/${project.repo}`;
  return {
    ...ticketValues(repo, ticket),
    ...reviewValues(repo, event),
    step: stepOf(event),
    'date.today': now.toISOString().slice(0, DATE_LENGTH),
    'date.now': now.toISOString(),
  };
}

function phaseChange(event: StoredEvent): EventPayloads['phase_changed'] | null {
  return isEvent(event, 'phase_changed') ? event.payload : null;
}

type Matcher = (trigger: EventTrigger, event: StoredEvent) => boolean;

const MATCHERS: Record<EventTrigger['kind'], Matcher> = {
  pull_request_linked: (_trigger, event) =>
    event.type === 'pull_request_opened' || event.type === 'pull_request_linked',
  pull_request_ready: (_trigger, event) => event.type === 'pull_request_ready',
  pull_request_merged: (_trigger, event) => event.type === 'pull_request_merged',
  pull_request_closed: (_trigger, event) => event.type === 'pull_request_closed',
  pull_request_checks_failed: (_trigger, event) => event.type === 'pull_request_checks_failed',
  ticket_created: (_trigger, event) => event.type === 'ticket_created',
  board_status: (trigger, event) => {
    const change = phaseChange(event);
    // Moving to the column, not a change inside it.
    return (
      trigger.kind === 'board_status' &&
      change?.board === trigger.status &&
      boardStatus(change.from) !== trigger.status
    );
  },
  awaiting_approval: (trigger, event) => {
    const to = phaseChange(event)?.to;
    return (
      trigger.kind === 'awaiting_approval' &&
      to?.kind === 'awaiting_approval' &&
      (trigger.step === null || to.step === trigger.step)
    );
  },
  step_failed: (_trigger, event) => phaseChange(event)?.to.kind === 'failed',
  pull_request_reviewed: (trigger, event) =>
    trigger.kind === 'pull_request_reviewed' &&
    isEvent(event, 'pr_review_posted') &&
    (trigger.verdict === null || event.payload.verdict === trigger.verdict),
};

/** Whether `event` is what `trigger` waits for. */
export function triggerMatches(trigger: EventTrigger, event: StoredEvent): boolean {
  return MATCHERS[trigger.kind](trigger, event);
}
