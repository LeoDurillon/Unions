// A Jira field's value set by hand: where an edit starts from (text, or what is picked), and the change Jira takes.
// The rules' shaping without variables; labels are set as a whole, not added.

import { adfMarkdown } from './adf-markdown';
import {
  isJiraFieldType,
  isPickedType,
  type JiraFieldType,
  type JiraPick,
} from './jira-field-types';
import { isRecord, text } from './jira-parse';
import { jiraFieldValue, jiraPickedValue } from './jira-values';

/** A date and time as `<input type="datetime-local">` takes it: `2026-11-12T10:00`, in the time Jira gave. */
const LOCAL_DATE_TIME_LENGTH = 16;
const WHITESPACE = /\s/u;

function pick(value: unknown, idKey: string, nameKey: string): JiraPick[] {
  if (!isRecord(value)) {
    return [];
  }
  const id = typeof value[idKey] === 'number' ? String(value[idKey]) : text(value, idKey);
  return id === '' ? [] : [{ id, name: text(value, nameKey) || id }];
}

/** The sprint an edit starts from: the issue's open one (active, or future), else its last. */
function sprintPicks(value: unknown): JiraPick[] {
  const sprints = Array.isArray(value)
    ? value.flatMap((sprint: unknown) => (isRecord(sprint) ? [sprint] : []))
    : [];
  const open = sprints.filter((sprint) => sprint.state !== 'closed');
  const current = open.at(-1) ?? sprints.at(-1);
  return pick(current, 'id', 'name');
}

function picksOf(type: JiraFieldType, value: unknown): JiraPick[] {
  if (type === 'user') {
    return pick(value, 'accountId', 'displayName');
  }
  if (type === 'sprint') {
    return sprintPicks(value);
  }
  return Array.isArray(value) ? value.flatMap((item: unknown) => pick(item, 'id', 'name')) : [];
}

function listText(value: unknown, key: 'value' | null): string {
  const list: unknown[] = Array.isArray(value) ? value : [];
  return list
    .map((item) => (key !== null && isRecord(item) ? text(item, key) : scalarText(item)))
    .filter((item) => item !== '')
    .join(', ');
}

function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** The typed types whose value is not plain text or a number. */
const TYPED_READERS: Partial<Record<JiraFieldType, (value: unknown) => string>> = {
  textarea: (value) => (isRecord(value) ? adfMarkdown(value) : scalarText(value)),
  option: (value) => (isRecord(value) ? text(value, 'value') : ''),
  multi_option: (value) => listText(value, 'value'),
  labels: (value) => listText(value, null),
  datetime: (value) => scalarText(value).slice(0, LOCAL_DATE_TIME_LENGTH),
};

function typedValue(type: JiraFieldType, value: unknown): string {
  const read = TYPED_READERS[type] ?? scalarText;
  return value === null || value === undefined ? '' : read(value);
}

/** Where editing a field of `type` (Union's) starts: the value as a rule's is typed, or what is picked. */
export function jiraEditStart(
  type: JiraFieldType,
  value: unknown,
): { value: string; picks?: JiraPick[] } {
  if (isPickedType(type)) {
    const picks = picksOf(type, value);
    return { value: picks.map((one) => one.name).join(', '), picks };
  }
  return { value: typedValue(type, value) };
}

function labelsSet(value: string): { set: string[] } | { error: string } {
  const labels = value
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label !== '');
  const spaced = labels.find((label) => WHITESPACE.test(label));
  return spaced === undefined
    ? { set: labels }
    : { error: `A Jira label has no spaces: "${spaced}"` };
}

function shapedOf(
  type: JiraFieldType,
  value: string,
  picks: JiraPick[],
): { set: unknown } | { add: string[] } | { error: string } {
  if (isPickedType(type)) {
    return jiraPickedValue(
      type,
      picks.map((one) => one.id),
    );
  }
  return type === 'labels' ? labelsSet(value) : jiraFieldValue(type, value);
}

/**
 * The change Jira takes for a field set by hand (`PUT /issue/{key}`'s `fields`), or why it cannot be
 * one. Picked fields take `picks`' ids, a sprint's resolved first.
 */
export function jiraHandChange(
  field: { id: string; type: string },
  value: string,
  picks: JiraPick[],
): { fields: Record<string, unknown> } | { error: string } {
  const { type } = field;
  if (!isJiraFieldType(type)) {
    return { error: `Union cannot set a Jira ${type} field` };
  }
  const shaped = shapedOf(type, value, picks);
  if ('error' in shaped) {
    return shaped;
  }
  return 'set' in shaped
    ? { fields: { [field.id]: shaped.set } }
    : { error: 'Labels are set as a whole' };
}
