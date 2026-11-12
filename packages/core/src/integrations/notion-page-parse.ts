// Reads a Notion page object: its title, its URL, its data source, when it changed and its status column.

import { isRecord, plain } from './notion-values';

export type NotionPage = {
  id: string;
  title: string;
  url: string;
  dataSourceId: string | null;
  /** When the page last changed in Notion, when Notion says. */
  editedAt?: string;
  /** Its status column (Notion's `status` type) and the value it holds, when it has one. */
  status?: { name: string; value: string };
};

function titleOf(properties: unknown): string {
  if (!isRecord(properties)) {
    return '';
  }
  const title = Object.values(properties).find(
    (property) => isRecord(property) && property.type === 'title',
  );
  return isRecord(title) ? plain(title.title) : '';
}

/** The page's status column and its value: the first property of Notion's `status` type that holds one. */
function statusOf(properties: unknown): NotionPage['status'] {
  if (!isRecord(properties)) {
    return undefined;
  }
  for (const [name, property] of Object.entries(properties)) {
    const value = isRecord(property) && property.type === 'status' ? property.status : undefined;
    if (isRecord(value) && typeof value.name === 'string') {
      return { name, value: value.name };
    }
  }
  return undefined;
}

/** A page object from the API, as Union keeps it. */
export function pageOf(body: Record<string, unknown>): NotionPage {
  const { parent } = body;
  const dataSourceId =
    isRecord(parent) &&
    parent.type === 'data_source_id' &&
    typeof parent.data_source_id === 'string'
      ? parent.data_source_id
      : null;
  return {
    id: String(body.id),
    title: titleOf(body.properties),
    url: typeof body.url === 'string' ? body.url : '',
    dataSourceId,
    ...(typeof body.last_edited_time === 'string' ? { editedAt: body.last_edited_time } : {}),
    ...(statusOf(body.properties) ? { status: statusOf(body.properties) } : {}),
  };
}
