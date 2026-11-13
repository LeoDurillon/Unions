// Jira's rule actions (move the ticket's issue, set its fields, comment on it), checked against the stored project.
// What they send is built when they run (`jira-rule-send.ts`); the preview is here, as it calls nothing.

import { EventRuleError } from '../event/event-rule-error';
import { unknownVariables } from '../event/event-rule-types';
import type {
  TrackerAction,
  TrackerActionOf,
  TrackerRuleValue,
} from '../event/event-tracker-actions';
import { isPickedType, isSinglePick, type JiraFieldInfo, type JiraPick } from './jira-field-types';
import { jiraFieldsOf, type JiraFields } from './jira-integration';
import { jiraValueError } from './jira-values';
import type { TrackerActionKind } from './tracker-action-kinds';

/** Jira refuses longer comments. */
const MAX_COMMENT = 32_767;

function text(record: object, key: string): string {
  const value: unknown = key in record ? Reflect.get(record, key) : undefined;
  return typeof value === 'string' ? value : '';
}

/** The stored Jira project, or why a Jira action cannot be saved without it. */
function storedFields(stored: unknown): JiraFields {
  const fields = jiraFieldsOf(stored);
  if (!fields) {
    throw new EventRuleError('Read the Jira project first (Refresh from Jira, above the rules)');
  }
  return fields;
}

function checkedStatus(fields: JiraFields, record: object): TrackerActionOf<'tracker_status'> {
  const statusId = text(record, 'statusId');
  const status = fields.statuses.find((each) => each.id === statusId);
  if (!status) {
    throw new EventRuleError('Pick a status of the Jira project');
  }
  return { kind: 'tracker_status', tracker: 'jira', statusId: status.id, statusName: status.name };
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
function checkedValue(field: JiraFieldInfo, { value, picks }: Entry): TrackerRuleValue {
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

function checkedFields(stored: JiraFields, record: object): TrackerActionOf<'tracker_fields'> {
  const { fields } = stored;
  if (fields.length === 0) {
    throw new EventRuleError('Read the Jira fields first (Refresh from Jira)');
  }
  const entries = valuesOf(record);
  if (entries.length === 0) {
    throw new EventRuleError('Pick a field of the Jira issue');
  }
  const seen = new Set<string>();
  const values = entries.map((entry) => {
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
  return { kind: 'tracker_fields', tracker: 'jira', values };
}

function checkedComment(record: object): TrackerActionOf<'tracker_comment'> {
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
  return { kind: 'tracker_comment', tracker: 'jira', body };
}

/** A Jira action as sent by the settings page, checked against the stored project. */
export function checkJiraRule(
  stored: unknown,
  kind: TrackerActionKind,
  record: object,
): TrackerAction {
  const fields = storedFields(stored);
  if (kind === 'tracker_status') {
    return checkedStatus(fields, record);
  }
  if (kind === 'tracker_fields') {
    return checkedFields(fields, record);
  }
  return checkedComment(record);
}
