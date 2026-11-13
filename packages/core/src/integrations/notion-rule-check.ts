// Notion's rule action (set properties of the ticket's page): checked against the stored columns, and the values it sends.
// Notion takes only `tracker_fields`; a value is shaped for its property's type as the columns were last read.

import { EventRuleError } from '../event/event-rule-error';
import { notionPropertyValue, renderTemplate, unknownVariables } from '../event/event-rule-types';
import type { TrackerAction, TrackerRuleValue } from '../event/event-tracker-actions';
import type { NotionProperty } from './notion-api';
import { isDataSource } from './notion-integration';
import type { TrackerActionKind } from './tracker-action-kinds';
import type { RulePreviewText, RuleValues } from './tracker-rules';

/** One property a delivery sets: the value as Notion takes it, and as the user reads it. */
export type NotionSet = { property: NotionProperty; text: string; value: unknown };

type Values = RuleValues;

/** Why one value cannot be saved for `property`, or null. */
function valueError(property: NotionProperty, value: string): string | null {
  if (property.type === 'people' && value.includes('{')) {
    return 'A person property takes people from the list, not variables';
  }
  const unknown = unknownVariables(value);
  if (unknown.length > 0) {
    return `Unknown variable: {${unknown.join('}, {')}}`;
  }
  // A value without variables is checked now; one with variables, when it is filled in.
  const shaped = notionPropertyValue(property, value.includes('{') ? '' : value);
  return 'error' in shaped ? shaped.error : null;
}

function text(item: object, key: string): string | null {
  return key in item ? String(Reflect.get(item, key)) : null;
}

/**
 * The values as sent: `{ fieldId, value }` each. A browser loaded before the tracker actions sends
 * `propertyId`, and the oldest rules held one `{ propertyId, value }` without a list.
 */
function valuesOf(record: object): { fieldId: string; value: string }[] {
  const list: unknown[] =
    'values' in record && Array.isArray(record.values) ? record.values : [record];
  return list.map((entry) => {
    const item = typeof entry === 'object' && entry !== null ? entry : {};
    return {
      fieldId: text(item, 'fieldId') ?? text(item, 'propertyId') ?? '',
      value: text(item, 'value') ?? '',
    };
  });
}

function checkedValue(
  properties: readonly NotionProperty[],
  entry: { fieldId: string; value: string },
  seen: Set<string>,
): TrackerRuleValue {
  const property = properties.find((candidate) => candidate.id === entry.fieldId);
  if (!property) {
    throw new EventRuleError('Pick a property of the Notion data source');
  }
  if (seen.has(property.id)) {
    throw new EventRuleError(`${property.name} is set twice: keep one`);
  }
  seen.add(property.id);
  const error = valueError(property, entry.value);
  if (error !== null) {
    throw new EventRuleError(`${property.name}: ${error}`);
  }
  return {
    fieldId: property.id,
    fieldName: property.name,
    fieldType: property.type,
    value: entry.value,
  };
}

/** The properties of the stored data source; refused until it is read. */
function notionColumns(stored: unknown): NotionProperty[] {
  if (!isDataSource(stored)) {
    throw new EventRuleError('Read the Notion data source first (Refresh from Notion)');
  }
  return stored.properties;
}

/** A Notion action as sent by the settings page, checked against the stored Notion columns. */
export function checkNotionRule(
  stored: unknown,
  kind: TrackerActionKind,
  record: object,
): TrackerAction {
  if (kind !== 'tracker_fields') {
    throw new EventRuleError('A Notion rule sets properties of the page');
  }
  const properties = notionColumns(stored);
  const values = valuesOf(record);
  if (values.length === 0) {
    throw new EventRuleError('Pick a property of the Notion data source');
  }
  const seen = new Set<string>();
  return {
    kind,
    tracker: 'notion',
    values: values.map((entry) => checkedValue(properties, entry, seen)),
  };
}

/**
 * What the values set for this ticket and event, all or nothing: the first property gone from the
 * data source, or value that cannot be one, fails it.
 */
export function notionSets(
  properties: readonly NotionProperty[],
  values: readonly TrackerRuleValue[],
  filled: Values,
): { sets: NotionSet[] } | { error: string } {
  const sets: NotionSet[] = [];
  for (const entry of values) {
    const property = properties.find((candidate) => candidate.id === entry.fieldId);
    if (!property) {
      return {
        error:
          'A property it sets is no longer in the Notion data source: refresh it in the Events settings',
      };
    }
    const filledText = renderTemplate(entry.value, filled);
    const shaped = notionPropertyValue(property, filledText);
    if ('error' in shaped) {
      return { error: `${property.name}: ${shaped.error}` };
    }
    sets.push({ property, text: filledText, value: shaped.value });
  }
  return { sets };
}

/** `"Done"`, or `(empty)`. */
function quotedOrEmpty(value: string): string {
  return value === '' ? '(empty)' : `"${value}"`;
}

/** What a delivery says it set: `Status set to "Done", PR set to "https://…"`. */
export function notionSetsText(sets: readonly NotionSet[]): string {
  return sets
    .map(({ property, text: set }) => `${property.name} set to ${quotedOrEmpty(set)}`)
    .join(', ');
}

/** What the action would set on the ticket's page, its templates filled in; nothing is sent. */
export function previewNotionRule(
  stored: unknown,
  action: TrackerAction,
  filled: Values,
): RulePreviewText | { error: string } {
  if (action.kind !== 'tracker_fields') {
    return { error: 'A Notion rule sets properties of the page' };
  }
  const properties = isDataSource(stored) ? stored.properties : [];
  const sets = notionSets(properties, action.values, filled);
  if ('error' in sets) {
    return sets;
  }
  return {
    title: "Would set on the ticket's Notion page:",
    lines: sets.sets.map(
      ({ property, text: set }) => `${property.name} to ${set === '' ? '(empty)' : set}`,
    ),
    text: null,
    note: null,
  };
}
