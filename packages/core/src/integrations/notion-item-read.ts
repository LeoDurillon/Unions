// A Notion page as its card shows it (title, status column, last edit, properties with options), and its text.

import type { NotionApi } from './notion-api';
import { isDataSource } from './notion-integration';
import { notionMarkdown } from './notion-markdown';
import { mentionTitles } from './notion-mentions';
import type { TrackerAdapter } from './tracker-adapter';
import type { TrackerAccess } from './tracker-fields';
import type { TrackerItemFacts, TrackerItemText } from './tracker-item';
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

/** The page's text as markdown, its mentions named; `truncated` when Notion cut a long page short. */
async function readNotionText(
  notion: NotionApi,
  token: string,
  pageId: string,
): Promise<TrackerItemText> {
  const { markdown, truncated } = await notion.pageMarkdown(token, pageId);
  const titles = await mentionTitles(notion, token, markdown);
  return { markdown: notionMarkdown(markdown, titles).trim(), truncated };
}

/** Notion's `text` capability: its markdown as plain markdown, and a page's text read now. */
export function notionText(notion: NotionApi): NonNullable<TrackerAdapter['text']> {
  return {
    markdown: (raw) => notionMarkdown(raw),
    read: (secret, _config, pageId) => readNotionText(notion, secret, pageId),
  };
}
