// The Notion action of a rule: the properties it sets, checked against the stored Notion columns, and what it sends.
import { eq } from 'drizzle-orm';

import type { Db } from './db';
import type { NotionPropertyAction, NotionValue } from './event-actions';
import {
  notionPropertyValue,
  renderTemplate,
  unknownVariables,
  type TemplateVariable,
} from './event-rule-types';
import type { NotionProperty } from './notion-api';
import * as schema from './tables';

export type NotionSchema = typeof schema.notionDataSources.$inferSelect;

/** A rule the checks refuse: an unknown trigger or variable, a missing or unsupported property. */
export class EventRuleError extends Error {}

/** One property a delivery sets: the value as Notion takes it, and as the user reads it. */
export type NotionSet = { property: NotionProperty; text: string; value: unknown };

export function notionSchemaOf(db: Db, projectId: number): NotionSchema | null {
  return (
    db
      .select()
      .from(schema.notionDataSources)
      .where(eq(schema.notionDataSources.projectId, projectId))
      .get() ?? null
  );
}

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

/** The values as sent: a list, or the one `{ propertyId, value }` rules held before there were several. */
function valuesOf(record: object): NotionValue[] {
  const list: unknown[] =
    'values' in record && Array.isArray(record.values) ? record.values : [record];
  return list.map((entry) => {
    const item = typeof entry === 'object' && entry !== null ? entry : {};
    return {
      propertyId: 'propertyId' in item ? String(item.propertyId) : '',
      value: 'value' in item ? String(item.value) : '',
    };
  });
}

function checkedValue(properties: NotionProperty[], entry: NotionValue, seen: Set<string>): void {
  const property = properties.find((candidate) => candidate.id === entry.propertyId);
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
}

/** A Notion action as sent by the settings page, checked against the stored Notion columns. */
export function checkedNotionAction(
  db: Db,
  projectId: number,
  record: object,
): NotionPropertyAction {
  const source = notionSchemaOf(db, projectId);
  if (!source) {
    throw new EventRuleError('Read the Notion data source first (Refresh from Notion)');
  }
  const values = valuesOf(record);
  if (values.length === 0) {
    throw new EventRuleError('Pick a property of the Notion data source');
  }
  const seen = new Set<string>();
  for (const entry of values) {
    checkedValue(source.properties, entry, seen);
  }
  return { kind: 'notion_property', values };
}

/**
 * What the action sets for this ticket and event, all or nothing: the first property gone from the
 * data source, or value that cannot be one, fails it.
 */
export function notionSets(
  properties: NotionProperty[],
  action: NotionPropertyAction,
  values: Partial<Record<TemplateVariable, string>>,
): { sets: NotionSet[] } | { error: string } {
  const sets: NotionSet[] = [];
  for (const entry of action.values) {
    const property = properties.find((candidate) => candidate.id === entry.propertyId);
    if (!property) {
      return {
        error:
          'A property it sets is no longer in the Notion data source: refresh it in the Events settings',
      };
    }
    const text = renderTemplate(entry.value, values);
    const shaped = notionPropertyValue(property, text);
    if ('error' in shaped) {
      return { error: `${property.name}: ${shaped.error}` };
    }
    sets.push({ property, text, value: shaped.value });
  }
  return { sets };
}

/** What a delivery says it set: `Status set to "Done", PR set to "https://…"`. */
export function notionSetsText(sets: NotionSet[]): string {
  return sets
    .map(({ property, text }) => `${property.name} set to ${text === '' ? '(empty)' : `"${text}"`}`)
    .join(', ');
}
