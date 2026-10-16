// A rule's GitHub Project fields: on the ticket's issue item or its pull request's, their checks and the values sent; browser-safe.
import { unknownVariables } from './event-rule-types';

/** The Project item a rule sets fields on: the ticket's issue's, or its pull request's. */
export type ProjectItemTarget = 'issue' | 'pull_request';

/** Project field types a rule can set. */
export type ProjectFieldType = 'single_select' | 'text' | 'number' | 'date';

/** A field of the GitHub Project as read from GitHub; `options` holds a single select's option names. */
export type ProjectField = { id: string; name: string; type: ProjectFieldType; options: string[] };

/**
 * One field a rule sets: its id, and its name and type as they were when the rule was saved (the
 * rule's sentence and the save checks use them). `value` is a template; a single select's is the
 * option's name.
 */
export type ProjectFieldValue = {
  fieldId: string;
  fieldName: string;
  fieldType: ProjectFieldType;
  value: string;
};

/** What GitHub's `updateProjectV2ItemFieldValue` takes; null clears the field. */
export type ProjectFieldInput =
  | { singleSelectOptionId: string }
  | { text: string }
  | { number: number }
  | { date: string }
  | null;

export const PROJECT_ITEM_TARGETS = [
  'issue',
  'pull_request',
] as const satisfies readonly ProjectItemTarget[];

export const PROJECT_ITEM_LABELS: Record<ProjectItemTarget, string> = {
  issue: "The ticket's issue",
  pull_request: "The ticket's pull request (added to the Project if it is not there)",
};

export const PROJECT_FIELD_TYPES = [
  'single_select',
  'text',
  'number',
  'date',
] as const satisfies readonly ProjectFieldType[];

/** The field Union's own sync sets on the issue's item: a rule leaves it there. */
export const UNION_STATUS_FIELD = 'Status';

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

export function isProjectItemTarget(value: unknown): value is ProjectItemTarget {
  return PROJECT_ITEM_TARGETS.some((target) => target === value);
}

export function isProjectFieldType(value: unknown): value is ProjectFieldType {
  return PROJECT_FIELD_TYPES.some((type) => type === value);
}

/** Whether a rule may set a field named `name` on the `item`. */
export function settableField(item: ProjectItemTarget, name: string): boolean {
  return !(item === 'issue' && name === UNION_STATUS_FIELD);
}

/**
 * The value as GitHub takes it for `field`, or why it cannot be one. A single select's option is
 * found by name; an empty value clears the field.
 */
export function projectFieldInput(
  field: ProjectField,
  text: string,
  optionIds: Record<string, string> = {},
): { input: ProjectFieldInput } | { error: string } {
  if (text === '') {
    return { input: null };
  }
  if (field.type === 'number') {
    const number = Number(text);
    return Number.isFinite(number) ? { input: { number } } : { error: `"${text}" is not a number` };
  }
  if (field.type === 'date') {
    return DATE.test(text)
      ? { input: { date: text } }
      : { error: `"${text}" is not a date (YYYY-MM-DD)` };
  }
  if (field.type === 'text') {
    return { input: { text } };
  }
  const optionId = optionIds[text];
  return optionId === undefined
    ? { error: `"${text}" is not an option of ${field.name} (${field.options.join(', ')})` }
    : { input: { singleSelectOptionId: optionId } };
}

/** The entry as sent, its strings trimmed; null without a field of a type a rule can set. */
function parseValue(entry: unknown): ProjectFieldValue | null {
  const record = typeof entry === 'object' && entry !== null ? entry : {};
  const fieldId = 'fieldId' in record ? String(record.fieldId) : '';
  const fieldName = 'fieldName' in record ? String(record.fieldName).trim() : '';
  const fieldType = 'fieldType' in record ? record.fieldType : null;
  const value = 'value' in record ? String(record.value).trim() : '';
  return fieldId === '' || fieldName === '' || !isProjectFieldType(fieldType)
    ? null
    : { fieldId, fieldName, fieldType, value };
}

/** Why the value cannot be saved, or null. A single select's option is checked when it is sent. */
function valueError({ fieldId, fieldName, fieldType, value }: ProjectFieldValue): string | null {
  const unknown = unknownVariables(value);
  if (unknown.length > 0) {
    return `Unknown variable: {${unknown.join('}, {')}}`;
  }
  if (fieldType === 'single_select' || value.includes('{')) {
    return null;
  }
  const shaped = projectFieldInput(
    { id: fieldId, name: fieldName, type: fieldType, options: [] },
    value,
  );
  return 'error' in shaped ? shaped.error : null;
}

function checkValue(item: ProjectItemTarget, entry: unknown): ProjectFieldValue | string {
  const parsed = parseValue(entry);
  if (!parsed) {
    return 'Pick a field of the GitHub Project';
  }
  if (!settableField(item, parsed.fieldName)) {
    return `${UNION_STATUS_FIELD} on the issue is set by Union: pick another field, or the pull request`;
  }
  const error = valueError(parsed);
  return error === null ? parsed : `${parsed.fieldName}: ${error}`;
}

/** The fields as sent by the settings page, or why they cannot be saved: each field once. */
export function checkProjectFields(
  record: object,
): { item: ProjectItemTarget; values: ProjectFieldValue[] } | { error: string } {
  const item = 'item' in record ? record.item : null;
  if (!isProjectItemTarget(item)) {
    return { error: 'Pick the item: the issue or the pull request' };
  }
  const list: unknown[] = 'values' in record && Array.isArray(record.values) ? record.values : [];
  if (list.length === 0) {
    return { error: 'Pick a field of the GitHub Project' };
  }
  const values: ProjectFieldValue[] = [];
  for (const entry of list) {
    const checked = checkValue(item, entry);
    if (typeof checked === 'string') {
      return { error: checked };
    }
    if (values.some((other) => other.fieldId === checked.fieldId)) {
      return { error: `${checked.fieldName} is set twice: keep one` };
    }
    values.push(checked);
  }
  return { item, values };
}

/** What a delivery says it set: `Sprint set to "12", Area set to (empty)`. */
export function projectFieldsText(sets: { name: string; text: string }[]): string {
  return sets
    .map(({ name, text }) => `${name} set to ${text === '' ? '(empty)' : `"${text}"`}`)
    .join(', ');
}
