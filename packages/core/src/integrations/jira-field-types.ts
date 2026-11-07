// The Jira fields a rule can set, by type, read from each field's schema (`GET /rest/api/3/field`); browser-safe.

/** What a rule's value is for a field, and how it is sent (`jira-values.ts`). */
export type JiraFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'option'
  | 'labels';

/** A field of the Jira site a rule can set: its id (`customfield_10042`, `labels`), name and type. */
export type JiraFieldInfo = { id: string; name: string; type: JiraFieldType };

/**
 * One field a rule sets: its id, and its name and type as they were when the rule was saved (the
 * sentence and the checks use them). `value` is a template; an option's is the option's name.
 */
export type JiraFieldValue = {
  fieldId: string;
  fieldName: string;
  fieldType: JiraFieldType;
  value: string;
};

const JIRA_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'option',
  'labels',
] as const satisfies readonly JiraFieldType[];

/** The ticket's text is Union's, the issue's the team's: a rule does not overwrite them. */
const LEFT_OUT = new Set(['summary', 'description']);

/** System fields that hold rich text (ADF in REST v3) though their schema says `string`. */
const RICH_SYSTEM = new Set(['environment']);
const CUSTOM_TEXTAREA = ':textarea';
const CUSTOM_LABELS = ':labels';

/** Schema types that map to one rule type whatever the field. */
const PLAIN_TYPES: Record<string, JiraFieldType> = {
  number: 'number',
  date: 'date',
  datetime: 'datetime',
  option: 'option',
};

export function isJiraFieldType(value: unknown): value is JiraFieldType {
  return JIRA_FIELD_TYPES.some((type) => type === value);
}

/**
 * A field's rule type from its id and schema (`{ type, items, custom }`); null for the fields rules
 * leave out: users, versions, components, sprints, multi-selects, the summary and the description.
 */
export function fieldTypeOf(
  id: string,
  schema: { type: string; items: string; custom: string },
): JiraFieldType | null {
  if (LEFT_OUT.has(id)) {
    return null;
  }
  if (schema.type === 'string') {
    return RICH_SYSTEM.has(id) || schema.custom.endsWith(CUSTOM_TEXTAREA) ? 'textarea' : 'text';
  }
  if (schema.type === 'array') {
    const labels = id === 'labels' || schema.custom.endsWith(CUSTOM_LABELS);
    return labels && schema.items === 'string' ? 'labels' : null;
  }
  return PLAIN_TYPES[schema.type] ?? null;
}
