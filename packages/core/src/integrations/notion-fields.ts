// A Notion page's property set by hand: checked against the page read now, then sent with `updatePage`.

import type { NotionApi } from './notion-api';
import { NotionError } from './notion-error';
import { isDataSource } from './notion-integration';
import { notionHandValue } from './tracker-field-set';
import {
  settableProperty,
  type CheckedField,
  type FieldChange,
  type TrackerAccess,
  type TrackerFieldInput,
} from './tracker-fields';
import { TrackerValueError } from './tracker-value-error';

const FORBIDDEN = 403;

/** A choice's options are the data source's as last read: the page does not give them. */
function optionsOf(access: TrackerAccess, propertyId: string): string[] {
  const columns = isDataSource(access.fields) ? access.fields.properties : [];
  return columns.find((one) => one.id === propertyId)?.options ?? [];
}

/** The property's type is the page's now; the value is checked as the worker will shape it. */
export async function checkNotionField(
  notion: NotionApi,
  access: TrackerAccess,
  pageId: string,
  input: TrackerFieldInput,
): Promise<CheckedField> {
  const page = await notion.page(access.secret, pageId);
  const property = settableProperty(page.properties ?? [], input, 'Notion');
  const field = {
    id: property.id,
    name: property.name,
    type: property.type,
    options: optionsOf(access, property.id),
  };
  const shaped = notionHandValue(field, input.value);
  if ('error' in shaped) {
    throw new TrackerValueError(shaped.error);
  }
  return { field, value: input.value, picks: [] };
}

export async function setNotionField(
  notion: NotionApi,
  access: TrackerAccess,
  change: FieldChange,
): Promise<void> {
  const shaped = notionHandValue(change.field, change.value);
  if ('error' in shaped) {
    throw new TrackerValueError(shaped.error);
  }
  await notion.updatePage(access.secret, change.itemId, { [change.field.id]: shaped.value });
}

/** Notion's reason, with the capability named when it refused one. */
export function notionFieldFailure(error: unknown): string {
  if (error instanceof NotionError && error.status === FORBIDDEN) {
    return 'Notion refused it: in the integration’s settings, Capabilities, turn on “Update content”';
  }
  return error instanceof Error ? error.message : String(error);
}
