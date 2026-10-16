// Event rules: checking and saving them, the stored Notion columns, and matching events and templates.
import { and, eq } from 'drizzle-orm';

import type { Db } from './db';
import {
  checkGitHubComment,
  checkUnionNotification,
  isActionKind,
  type ActionKind,
  type ActionOf,
  type EventAction,
  type NotionPropertyAction,
} from './event-actions';
import { isEvent, type EventPayloads, type StoredEvent } from './event-catalog';
import {
  BOARD_LABELS,
  isTrigger,
  notionPropertyValue,
  renderTemplate,
  unknownVariables,
  type EventTrigger,
  type TemplateVariable,
} from './event-rule-types';
import type { NotionDataSource, NotionProperty } from './notion-api';
import { boardStatus } from './states';
import * as schema from './tables';
import type { Ticket } from './tickets';

export type EventRule = typeof schema.eventRules.$inferSelect;
export type NotionSchema = typeof schema.notionDataSources.$inferSelect;

/** A rule the checks refuse: an unknown trigger or variable, a missing or unsupported property. */
export class EventRuleError extends Error {}

export type RuleInput = {
  name: string;
  enabled: boolean;
  trigger: unknown;
  action: unknown;
};

export function notionSchemaOf(db: Db, projectId: number): NotionSchema | null {
  return (
    db
      .select()
      .from(schema.notionDataSources)
      .where(eq(schema.notionDataSources.projectId, projectId))
      .get() ?? null
  );
}

/** Keeps the data source's columns as Notion has them now (the rules point at them by id). */
export function storeNotionSchema(
  db: Db,
  projectId: number,
  dataSourceId: string,
  source: NotionDataSource,
): NotionSchema {
  const values = { dataSourceId, title: source.title, properties: source.properties };
  return db
    .insert(schema.notionDataSources)
    .values({ projectId, ...values })
    .onConflictDoUpdate({
      target: schema.notionDataSources.projectId,
      set: { ...values, fetchedAt: Date.now() },
    })
    .returning()
    .get();
}

export function forgetNotionSchema(db: Db, projectId: number): void {
  db.delete(schema.notionDataSources)
    .where(eq(schema.notionDataSources.projectId, projectId))
    .run();
}

/** The property a rule sets, as last read from Notion; null once it is gone from the data source. */
export function ruleProperty(
  db: Db,
  projectId: number,
  action: NotionPropertyAction,
): NotionProperty | null {
  const source = notionSchemaOf(db, projectId);
  return source?.properties.find((property) => property.id === action.propertyId) ?? null;
}

function checkedNotionAction(db: Db, projectId: number, record: object): NotionPropertyAction {
  const propertyId = 'propertyId' in record ? String(record.propertyId) : '';
  const value = 'value' in record ? String(record.value) : '';
  const checked: NotionPropertyAction = { kind: 'notion_property', propertyId, value };
  if (!notionSchemaOf(db, projectId)) {
    throw new EventRuleError('Read the Notion data source first (Refresh from Notion)');
  }
  const property = ruleProperty(db, projectId, checked);
  if (!property) {
    throw new EventRuleError('Pick a property of the Notion data source');
  }
  if (property.type === 'people' && value.includes('{')) {
    throw new EventRuleError('A person property takes people from the list, not variables');
  }
  const unknown = unknownVariables(value);
  if (unknown.length > 0) {
    throw new EventRuleError(`Unknown variable: {${unknown.join('}, {')}}`);
  }
  // A value without variables is checked now; one with variables, when it is filled in.
  const shaped = notionPropertyValue(property, value.includes('{') ? '' : value);
  if ('error' in shaped) {
    throw new EventRuleError(shaped.error);
  }
  return checked;
}

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

/** The step a phase change is about, if any. */
/** The step a phase change moved into (one that waits or failed); empty for other events. */
function stepOf(event: StoredEvent | null): string {
  const to = event === null ? undefined : phaseChange(event)?.to;
  const step = to && 'step' in to ? to.step : '';
  return STEP_NAMES[step] ?? step;
}

/** What a template can say about the ticket now, and the event that triggered the rule. */
export function templateValues(
  project: { owner: string; repo: string },
  ticket: Ticket,
  event: StoredEvent | null,
  now = new Date(),
): Partial<Record<TemplateVariable, string>> {
  const repo = `https://github.com/${project.owner}/${project.repo}`;
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
    step: stepOf(event),
    'date.today': now.toISOString().slice(0, DATE_LENGTH),
    'date.now': now.toISOString(),
  };
}

/** The Notion property value a rule sends for this ticket and event, or why it cannot. */
export function ruleValue(
  property: NotionProperty,
  action: NotionPropertyAction,
  values: Partial<Record<TemplateVariable, string>>,
): { text: string; value: unknown } | { error: string } {
  const text = renderTemplate(action.value, values);
  const shaped = notionPropertyValue(property, text);
  return 'error' in shaped ? shaped : { text, value: shaped.value };
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
};

/** Whether `event` is what `trigger` waits for. */
export function triggerMatches(trigger: EventTrigger, event: StoredEvent): boolean {
  return MATCHERS[trigger.kind](trigger, event);
}
