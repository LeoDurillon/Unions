// The Jira actions of a rule (move the ticket's issue, set its fields, comment on it) and their
// checks. They are checked against the stored Jira project; what they send is built when they run.

import type { Db } from '../db';
import {
  isPickedType,
  isSinglePick,
  type JiraFieldInfo,
  type JiraFieldValue,
  type JiraPick,
} from '../integrations/jira-field-types';
import { jiraFieldsFor, type JiraFields } from '../integrations/jira-integration';
import { jiraValueError } from '../integrations/jira-values';
import { integrationOf } from '../integrations/store';
import type { ActionOf } from './event-actions';
import { EventRuleError } from './event-notion-action';
import { unknownVariables } from './event-rule-types';

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

type Entry = { fieldId: string; value: string; picks: JiraPick[] };

function listOf(record: object, key: string): object[] {
  const list: unknown = key in record ? Reflect.get(record, key) : [];
  return (Array.isArray(list) ? list : []).map((entry: unknown) =>
    typeof entry === 'object' && entry !== null ? entry : {},
  );
}

function valuesOf(record: object): Entry[] {
  return listOf(record, 'values').map((item) => ({
    fieldId: text(item, 'fieldId'),
    value: text(item, 'value'),
    picks: listOf(item, 'picks')
      .map((pick) => ({ id: text(pick, 'id'), name: text(pick, 'name') }))
      .filter((pick) => pick.id !== ''),
  }));
}

/** One field's value as the rule stores it: typed, or picked (its names as the value, for the sentence). */
function checkedValue(field: JiraFieldInfo, { value, picks }: Entry): JiraFieldValue {
  const base = { fieldId: field.id, fieldName: field.name, fieldType: field.type };
  if (isPickedType(field.type)) {
    if (isSinglePick(field.type) && picks.length > 1) {
      throw new EventRuleError(`${field.name}: pick one`);
    }
    return { ...base, value: picks.map((pick) => pick.name || pick.id).join(', '), picks };
  }
  const error = jiraValueError(field.type, value);
  if (error !== null) {
    throw new EventRuleError(`${field.name}: ${error}`);
  }
  return { ...base, value };
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
  const values = entries.map((entry): JiraFieldValue => {
    const field = fields.find((candidate) => candidate.id === entry.fieldId);
    if (!field) {
      throw new EventRuleError('Pick a field of the Jira issue');
    }
    if (seen.has(field.id)) {
      throw new EventRuleError(`${field.name} is set twice: keep one`);
    }
    seen.add(field.id);
    return checkedValue(field, entry);
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
