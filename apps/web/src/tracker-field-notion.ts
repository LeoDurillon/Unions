// A Notion page's property set by hand: the page read now, the value checked as the worker will shape it, then queued.

import { notionHandValue, notionSchemaOf, type Db, type NotionApi } from '@union/core';

import { BAD_REQUEST, fail } from './http';
import { guarded, notionTokenOf } from './routes/notion';
import { queueTrackerField } from './tracker-field-commands';
import {
  settableProperty,
  type TrackerFieldInput,
  type TrackerFieldTarget,
} from './tracker-field-input';

/** Queues the change; the property's type is the page's now, a choice's options the data source's. */
export async function queueNotionField(
  db: Db,
  notion: NotionApi,
  target: TrackerFieldTarget,
  input: TrackerFieldInput,
): Promise<number> {
  const token = notionTokenOf(db, target.projectId);
  const page = await guarded(() => notion.page(token, target.itemId));
  const property = settableProperty(page.properties ?? [], input, 'Notion');
  const column = notionSchemaOf(db, target.projectId)?.properties.find(
    (one) => one.id === property.id,
  );
  const field = {
    id: property.id,
    name: property.name,
    type: property.type,
    options: column?.options ?? [],
  };
  const shaped = notionHandValue(field, input.value);
  if ('error' in shaped) {
    throw fail(BAD_REQUEST, shaped.error);
  }
  return queueTrackerField(db, {
    projectId: target.projectId,
    kind: 'notion',
    itemId: target.itemId,
    ...target.place,
    field,
    value: input.value,
    text: input.text,
    picks: [],
  });
}
