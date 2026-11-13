// In-memory Notion for tests: one data source, its pages and their comments; the calls it does not hold reject.

import type { NotionApi, NotionPage } from './notion-api';
import type { NotionComment } from './notion-comment-parse';
import { NotionError } from './notion-error';
import type { NotionRichTextInput } from './notion-rich-text';
import type { TrackerProperty } from './tracker-property';

const NOT_FOUND = 404;
/** Posted comments are a minute apart from this time on. */
const POSTED_FROM = Date.parse('2026-01-01T00:00:00.000Z');
const MINUTE = 60_000;

/** A page of the fake: its data source, its markdown as Notion's API returns it, its comments on the page. */
export type FakeNotionPage = {
  id: string;
  title: string;
  dataSourceId: string;
  markdown: string;
  comments?: NotionComment[];
  properties?: TrackerProperty[];
};

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
    ...(page.properties ? { properties: page.properties } : {}),
  };
}

const sameId = (left: string, right: string): boolean =>
  left.replaceAll('-', '') === right.replaceAll('-', '');

/** A comment's runs as Notion reads them back. */
function runsOf(richText: NotionRichTextInput[]): NotionComment['richText'] {
  return richText.map((run) => ({
    text: run.text.content,
    href: run.text.link?.url ?? null,
    bold: run.annotations.bold,
    italic: false,
    strikethrough: false,
    code: run.annotations.code,
  }));
}

/** Comments are kept on the pages given, so a test reads back what it posted; property updates go to `updates`. */
export function fakeNotionApi(
  source: { id: string; title: string },
  pages: readonly FakeNotionPage[],
  updates: { pageId: string; properties: Record<string, unknown> }[] = [],
): NotionApi {
  let next = 0;
  const find = (id: string): FakeNotionPage | undefined =>
    pages.find((page) => sameId(page.id, id));
  const page = (id: string): Promise<FakeNotionPage> => {
    const found = find(id);
    return found ? Promise.resolve(found) : missing();
  };
  const addComment: NotionApi['addComment'] = (_token, target, richText) => {
    const owner =
      'pageId' in target
        ? find(target.pageId)
        : pages.find((one) => one.comments?.some((c) => c.discussionId === target.discussionId));
    if (!owner) {
      return missing();
    }
    next += 1;
    const comment: NotionComment = {
      id: `comment-${next}`,
      discussionId: 'pageId' in target ? `discussion-${next}` : target.discussionId,
      blockId: null,
      author: 'Union',
      createdAt: new Date(POSTED_FROM + next * MINUTE).toISOString(),
      richText: runsOf(richText),
    };
    owner.comments = [...(owner.comments ?? []), comment];
    return Promise.resolve(comment);
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
    comments: async (_token, id) => {
      const found = await page(id);
      return found.comments ?? [];
    },
    addComment,
    updatePage: async (_token, pageId, properties) => {
      await page(pageId);
      updates.push({ pageId, properties });
    },
    createPage: unsupported,
  };
}
