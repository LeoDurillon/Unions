// In-memory Notion for tests: one data source and its pages; the calls it does not hold reject.

import type { NotionApi, NotionPage } from './notion-api';
import { NotionError } from './notion-error';

const NOT_FOUND = 404;

/** A page of the fake: its data source, and its markdown as Notion's API returns it. */
export type FakeNotionPage = { id: string; title: string; dataSourceId: string; markdown: string };

function missing(): Promise<never> {
  return Promise.reject(new NotionError('Could not find the object', NOT_FOUND));
}

function unsupported(): Promise<never> {
  return Promise.reject(new Error('Not in the fake Notion'));
}

function pageOf(page: FakeNotionPage): NotionPage {
  return {
    id: page.id,
    title: page.title,
    url: `https://www.notion.so/${page.id.replaceAll('-', '')}`,
    dataSourceId: page.dataSourceId,
  };
}

export function fakeNotionApi(
  source: { id: string; title: string },
  pages: readonly FakeNotionPage[],
): NotionApi {
  const find = (id: string): FakeNotionPage | undefined =>
    pages.find((page) => page.id.replaceAll('-', '') === id.replaceAll('-', ''));
  const page = (id: string): Promise<FakeNotionPage> => {
    const found = find(id);
    return found ? Promise.resolve(found) : missing();
  };
  return {
    dataSourceTitle: (_token, id) => (id === source.id ? Promise.resolve(source.title) : missing()),
    dataSource: (_token, id) =>
      id === source.id ? Promise.resolve({ title: source.title, properties: [] }) : missing(),
    page: async (_token, id) => pageOf(await page(id)),
    pageMarkdown: async (_token, id) => {
      const { markdown } = await page(id);
      return { markdown, truncated: false };
    },
    users: () => Promise.resolve([]),
    comments: () => Promise.resolve([]),
    addComment: unsupported,
    updatePage: unsupported,
    createPage: unsupported,
  };
}
