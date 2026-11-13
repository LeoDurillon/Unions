// A Notion page as its card shows it: title, status column, last edit, properties with the data source's options.

import type { NotionApi } from './notion-api';
import { isDataSource } from './notion-integration';
import type { TrackerAccess } from './tracker-fields';
import type { TrackerItemFacts } from './tracker-item';
import type { TrackerProperty } from './tracker-property';

/** A choice's options are the data source's as last read: the page does not give them. */
function withOptions(access: TrackerAccess, properties: TrackerProperty[]): TrackerProperty[] {
  const columns = isDataSource(access.fields) ? access.fields.properties : [];
  return properties.map((property) => ({
    ...property,
    options: columns.find((column) => column.id === property.id)?.options ?? property.options,
  }));
}

export async function readNotionItem(
  notion: NotionApi,
  access: TrackerAccess,
  pageId: string,
): Promise<TrackerItemFacts> {
  const page = await notion.page(access.secret, pageId);
  return {
    title: page.title,
    key: null,
    type: null,
    status: page.status ? { field: page.status.name, name: page.status.value, stage: null } : null,
    changedAt: page.editedAt ?? null,
    properties: withOptions(access, page.properties ?? []),
  };
}
