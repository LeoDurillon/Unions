// The Jira actions of a rule (move the ticket's issue, set its fields, comment on it) and their checks against the
// stored Jira project; what they send is built when they run.
import type { Db } from './db';
import type { ActionOf } from './event-actions';
import { EventRuleError } from './event-notion-action';
import { unknownVariables } from './event-rule-types';
import type { JiraFieldValue } from './integrations/jira-field-types';
import { jiraFieldsFor, type JiraFields } from './integrations/jira-integration';
import { jiraValueError } from './integrations/jira-values';
import { integrationOf } from './integrations/store';

export type JiraTransitionAction = ActionOf<'jira_transition'>;
export type JiraFieldAction = ActionOf<'jira_field'>;
export type JiraCommentAction = ActionOf<'jira_comment'>;

/** Jira refuses longer comments. */
const MAX_COMMENT = 32_767;

function text(record: object, key: string): string {
  const value: unknown = key in record ? Reflect.get(record, key) : undefined;
  return typeof value === 'string' ? value : '';
}

/** The stored Jira project, or why a Jira action cannot be saved without it. */
function storedFields(db: Db, projectId: number): JiraFields {
  if (!integrationOf(db, projectId, 'jira')) {
    throw new EventRuleError('Connect the project to Jira first (Settings → Integrations → Jira)');
  }
  const fields = jiraFieldsFor(db, projectId);
  if (!fields) {
    throw new EventRuleError('Read the Jira project first (Refresh from Jira, above the rules)');
  }
  return fields;
}

/** A "Move the ticket's Jira issue" action as sent by the settings page, checked against the stored statuses. */
export function checkedJiraTransition(
  db: Db,
  projectId: number,
  record: object,
): JiraTransitionAction {
  const statusId = text(record, 'statusId');
  const status = storedFields(db, projectId).statuses.find((each) => each.id === statusId);
  if (!status) {
    throw new EventRuleError('Pick a status of the Jira project');
  }
  return { kind: 'jira_transition', statusId: status.id, statusName: status.name };
}

function valuesOf(record: object): { fieldId: string; value: string }[] {
  const list: unknown = 'values' in record ? record.values : [];
  return (Array.isArray(list) ? list : []).map((entry: unknown) => {
    const item = typeof entry === 'object' && entry !== null ? entry : {};
    return { fieldId: text(item, 'fieldId'), value: text(item, 'value') };
  });
}

/** A "Set fields of the ticket's Jira issue" action as sent by the settings page, checked against the stored fields. */
export function checkedJiraFields(db: Db, projectId: number, record: object): JiraFieldAction {
  const { fields } = storedFields(db, projectId);
  if (fields.length === 0) {
    throw new EventRuleError('Read the Jira fields first (Refresh from Jira)');
  }
  const entries = valuesOf(record);
  if (entries.length === 0) {
    throw new EventRuleError('Pick a field of the Jira issue');
  }
  const seen = new Set<string>();
  const values = entries.map(({ fieldId, value }): JiraFieldValue => {
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      throw new EventRuleError('Pick a field of the Jira issue');
    }
    if (seen.has(field.id)) {
      throw new EventRuleError(`${field.name} is set twice: keep one`);
    }
    seen.add(field.id);
    const error = jiraValueError(field.type, value);
    if (error !== null) {
      throw new EventRuleError(`${field.name}: ${error}`);
    }
    return { fieldId: field.id, fieldName: field.name, fieldType: field.type, value };
  });
  return { kind: 'jira_field', values };
}

/** A "Comment on the ticket's Jira issue" action as sent by the settings page. */
export function checkedJiraComment(db: Db, projectId: number, record: object): JiraCommentAction {
  storedFields(db, projectId);
  const body = text(record, 'body').trim();
  if (body === '') {
    throw new EventRuleError('Write the comment');
  }
  if (body.length > MAX_COMMENT) {
    throw new EventRuleError(`A Jira comment holds at most ${MAX_COMMENT} characters`);
  }
  const unknown = unknownVariables(body);
  if (unknown.length > 0) {
    throw new EventRuleError(`Unknown variable: {${unknown.join('}, {')}}`);
  }
  return { kind: 'jira_comment', body };
}
