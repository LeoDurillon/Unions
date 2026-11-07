// The Jira fields a rule can set, by type, read from each field's schema (`GET /rest/api/3/field`); browser-safe.

/** What a rule's value is for a field, and how it is sent (`jira-values.ts`). */
export type JiraFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'option'
  | 'labels'
  | 'multi_option'
  | 'user'
  | 'versions'
  | 'components'
  | 'sprint';

/** The types whose value is picked from a list Jira gives (people, versions…), not typed. */
export type JiraPickedType = 'user' | 'versions' | 'components' | 'sprint';
/** The types whose value is typed (variables allowed, but in options). */
export type JiraTypedType = Exclude<JiraFieldType, JiraPickedType>;

/** One thing picked for a field: its id in Jira, and its name as it was when the rule was saved. */
export type JiraPick = { id: string; name: string };

/** Sprint picks resolved when the rule runs, so a rule keeps working from sprint to sprint. */
export const ACTIVE_SPRINT = 'active';
export const NEXT_SPRINT = 'next';

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
  /** For a picked type: what was picked (`value` is their names, for the sentence). */
  picks?: JiraPick[];
};

const JIRA_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'option',
  'labels',
  'multi_option',
  'user',
  'versions',
  'components',
  'sprint',
] as const satisfies readonly JiraFieldType[];

const PICKED_TYPES = new Set<JiraFieldType>(['user', 'versions', 'components', 'sprint']);

export function isPickedType(type: JiraFieldType): type is JiraPickedType {
  return PICKED_TYPES.has(type);
}

/** At most one pick for these: a person, a sprint. */
export function isSinglePick(type: JiraPickedType): type is 'user' | 'sprint' {
  return type === 'user' || type === 'sprint';
}

/**
 * Jira's own fields a rule can set. The others are Jira's to set (Created, Updated, Resolved, the Σ
 * totals, Work Ratio…), set through time tracking (the estimates), or left out on purpose: the
 * summary and the description, as the ticket's text is Union's and the issue's the team's. `GET
 * /field` does not say which fields can be edited, so the list is Union's.
 */
const SETTABLE_SYSTEM = new Set([
  'duedate',
  'labels',
  'environment',
  'assignee',
  'fixVersions',
  'versions',
  'components',
]);
const CUSTOM_PREFIX = 'customfield_';

/** System fields that hold rich text (ADF in REST v3) though their schema says `string`. */
const RICH_SYSTEM = new Set(['environment']);
const CUSTOM_TEXTAREA = ':textarea';
const CUSTOM_LABELS = ':labels';
/** Jira Software's sprint field: an array of sprints in its schema, set with one sprint's id. */
const CUSTOM_SPRINT = 'com.pyxis.greenhopper.jira:gh-sprint';

/** Arrays of these are set as a whole (labels are added instead). */
const ARRAY_ITEMS: Record<string, JiraFieldType> = {
  option: 'multi_option',
  version: 'versions',
  component: 'components',
};

/** Schema types that map to one rule type whatever the field. */
const PLAIN_TYPES: Record<string, JiraFieldType> = {
  number: 'number',
  date: 'date',
  datetime: 'datetime',
  option: 'option',
  user: 'user',
};

/** A custom field, or one of Jira's own a rule can set. */
export function isSettableFieldId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX) || SETTABLE_SYSTEM.has(id);
}

export function isJiraFieldType(value: unknown): value is JiraFieldType {
  return JIRA_FIELD_TYPES.some((type) => type === value);
}

/**
 * A field's rule type from its id and schema (`{ type, items, custom }`); null for the fields rules
 * leave out: Jira's own fields but the due date, labels, environment, assignee, versions and
 * components, and custom fields of several users, groups, cascading selects and single versions.
 */
export function fieldTypeOf(
  id: string,
  schema: { type: string; items: string; custom: string },
): JiraFieldType | null {
  if (!isSettableFieldId(id)) {
    return null;
  }
  if (schema.type === 'string') {
    return RICH_SYSTEM.has(id) || schema.custom.endsWith(CUSTOM_TEXTAREA) ? 'textarea' : 'text';
  }
  if (schema.custom === CUSTOM_SPRINT) {
    return 'sprint';
  }
  if (schema.type === 'array') {
    const labels = id === 'labels' || schema.custom.endsWith(CUSTOM_LABELS);
    return labels && schema.items === 'string' ? 'labels' : (ARRAY_ITEMS[schema.items] ?? null);
  }
  return PLAIN_TYPES[schema.type] ?? null;
}
