// Notion as an `IntegrationProvider`: a thin adapter over `NotionApi`, limited to the integration's data source.
import type { NotionApi, NotionDataSource } from '../notion-api';
import { notionMarkdown } from '../notion-markdown';
import { notionConfigOf } from './notion-integration';
import { mentionTitles } from './notion-mentions';
import { ItemOutsideSourceError, type IntegrationProvider, type SourceItem } from './provider';

/** Notion writes ids with or without dashes. */
function sameId(left: string, right: string): boolean {
  return left.replaceAll('-', '') === right.replaceAll('-', '');
}

async function item(
  notion: NotionApi,
  token: string,
  config: unknown,
  pageId: string,
): Promise<SourceItem> {
  const { dataSourceId } = notionConfigOf(config);
  const page = await notion.page(token, pageId);
  if (page.dataSourceId === null || !sameId(page.dataSourceId, dataSourceId)) {
    throw new ItemOutsideSourceError("This page is not a row of the project's Notion data source");
  }
  const { markdown, truncated } = await notion.pageMarkdown(token, pageId);
  const titles = await mentionTitles(notion, token, markdown);
  return {
    id: page.id,
    title: page.title,
    url: page.url,
    markdown: notionMarkdown(markdown, titles).trim(),
    truncated,
  };
}

export function notionProvider(notion: NotionApi): IntegrationProvider {
  return {
    verify: async (token, config) => ({
      title: await notion.dataSourceTitle(token, notionConfigOf(config).dataSourceId),
    }),
    readFields: async (token, config): Promise<{ title: string; fields: NotionDataSource }> => {
      // Async so a bad config rejects, as the other calls do, rather than throwing.
      const source = await notion.dataSource(token, notionConfigOf(config).dataSourceId);
      return { title: source.title, fields: source };
    },
    item: (token, config, pageId) => item(notion, token, config, pageId),
    createItem: async (token, config, content) => {
      const page = await notion.createPage(token, notionConfigOf(config).dataSourceId, content);
      return {
        id: page.id,
        title: page.title,
        url: page.url,
        markdown: content.markdown,
        truncated: false,
      };
    },
  };
}
